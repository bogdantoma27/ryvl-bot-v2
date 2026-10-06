import { EventPublisher, EventDiscordSync } from './event-publisher.service';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Event, EventOccurrence, EventStatus, OccurrenceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecurrenceService } from './recurrence.service';
import { EventsGateway } from './events.gateway';
import { CreateEventDto, createEventSchema } from './dto/create-event.dto';
import { UpdateEventDto, updateEventSchema } from './dto/update-event.dto';
import { EventView, toEventView } from './event-view';

export interface ListEventsFilter {
  status?: EventStatus;
  upcoming?: boolean;
  page?: number;
  limit?: number;
}

export type EventWithOccurrences = EventView & { discordSync?: EventDiscordSync };

/** Archived events are kept for this long before the retention job removes them. */
export const ARCHIVE_RETENTION_DAYS = 180;
/** Recurring events keep at least this many open future occurrences generated. */
export const MIN_FUTURE_OCCURRENCES = 5;

const OPEN_STATUSES: OccurrenceStatus[] = [OccurrenceStatus.SCHEDULED, OccurrenceStatus.PUBLISHED];
const FULL_EVENT_INCLUDE = {
  occurrences: { orderBy: { startsAt: 'asc' as const }, include: { rsvps: true } },
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recurrenceService: RecurrenceService,
    private readonly eventsGateway: EventsGateway,
    private readonly publisher: EventPublisher,
  ) {}

  async createEvent(
    guildId: string,
    createdById: string,
    data: CreateEventDto,
    options: { vpgMatchId?: number } = {},
  ): Promise<EventWithOccurrences> {
    const parsed = createEventSchema.safeParse(data);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new BadRequestException(`Validation error: ${issues}`);
    }

    const validData = parsed.data;

    // Ensure guild exists in database
    await this.prisma.guild.upsert({
      where: { id: guildId },
      update: {},
      create: {
        id: guildId,
        name: `Guild ${guildId}`,
        timezone: validData.timezone || 'Europe/Bucharest',
      },
    });

    const anchorDate = new Date(validData.startsAt);
    if (isNaN(anchorDate.getTime())) {
      throw new BadRequestException('Invalid startsAt date format');
    }

    const event = await this.prisma.event.create({
      data: {
        guildId,
        title: validData.title,
        description: validData.description,
        location: validData.location,
        imageUrl: validData.imageUrl || null,
        color: validData.color || '#5865F2',
        channelId: validData.channelId,
        timezone: validData.timezone || 'Europe/Bucharest',
        createdById,
        mentionRoleIds: validData.mentionRoleIds || [],
        rrule: validData.rrule || null,
        duration: validData.duration || 60,
        status: validData.status || EventStatus.ACTIVE,
        ...(validData.publishLeadMinutes !== undefined ? { publishLeadMinutes: validData.publishLeadMinutes } : {}),
        vpgMatchId: options.vpgMatchId ?? null,
      },
    });

    // Generate occurrences
    const occurrencesToCreate = this.recurrenceService.generateOccurrences(
      { id: event.id, rrule: event.rrule, duration: event.duration },
      anchorDate,
      10,
      anchorDate,
    );

    if (occurrencesToCreate.length > 0) {
      await this.prisma.eventOccurrence.createMany({
        data: occurrencesToCreate.map((occ) => ({
          eventId: occ.eventId,
          index: occ.index,
          startsAt: occ.startsAt,
          endsAt: occ.endsAt,
          status: occ.status,
          channelId: event.channelId,
        })),
      });
    }

    const fullEvent = await this.getEvent(guildId, event.id);
    this.eventsGateway.emit(guildId, 'EVENT_CREATED', fullEvent);
    // Announce right away instead of waiting for the next scheduler tick. The
    // publisher is the only path that posts, so Discord and web creation cannot race.
    this.triggerPublish();

    return fullEvent;
  }

  async listEvents(guildId: string, filters?: ListEventsFilter): Promise<EventWithOccurrences[]> {
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(100, Math.max(1, filters?.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.EventWhereInput = { guildId };
    if (filters?.status) where.status = filters.status;
    if (filters?.upcoming) {
      where.occurrences = { some: { startsAt: { gte: new Date() }, status: { in: OPEN_STATUSES } } };
    }

    // Read-only: finished events are archived by the scheduler, never removed here.
    const events = await this.prisma.event.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: FULL_EVENT_INCLUDE,
    });
    const now = new Date();
    return events.map((event) => toEventView(event, now));
  }

  async getEvent(guildId: string, eventId: string): Promise<EventWithOccurrences> {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, guildId }, include: FULL_EVENT_INCLUDE });
    if (!event) {
      throw new NotFoundException(`Event with ID "${eventId}" not found`);
    }
    return toEventView(event);
  }

  async updateEvent(guildId: string, eventId: string, data: UpdateEventDto, occurrenceId?: string): Promise<EventWithOccurrences> {
    const parsed = updateEventSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(`Validation error: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    const validData = parsed.data;
    // Commit event metadata and occurrence changes together. Lock the parent so
    // concurrent edits cannot regenerate or overwrite each other's schedule.
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM events WHERE id = ${eventId} AND guild_id = ${guildId} FOR UPDATE`);
      const existing = await tx.event.findFirst({ where: { id: eventId, guildId }, include: { occurrences: { orderBy: { startsAt: 'asc' }, include: { rsvps: true } } } });
      if (!existing) throw new NotFoundException(`Event with ID "${eventId}" not found`);
      const now = new Date();
      const active = existing.occurrences.filter(o => o.status === OccurrenceStatus.SCHEDULED || o.status === OccurrenceStatus.PUBLISHED);
      const target = occurrenceId ? existing.occurrences.find(o => o.id === occurrenceId) :
        active.find(o => (o.endsAt || o.startsAt) >= now) || active[0] || (!existing.rrule ? existing.occurrences[0] : undefined);
      if (occurrenceId && (!target || target.status === OccurrenceStatus.CANCELLED)) throw new BadRequestException('Invalid or cancelled event occurrence');
      const recurrenceChanged = validData.rrule !== undefined && validData.rrule !== existing.rrule;
      const { startsAt: requestedStart, ...metadata } = validData;
      // Moving an archived event to a future date brings it back.
      const revive = existing.status === EventStatus.ARCHIVED && requestedStart !== undefined && new Date(requestedStart) > now && validData.status === undefined;
      const event = await tx.event.update({ where: { id: eventId }, data: {
        ...metadata, imageUrl: validData.imageUrl === '' ? null : validData.imageUrl,
        ...(revive ? { status: EventStatus.ACTIVE, archivedAt: null } : {}),
        ...(validData.status === EventStatus.ARCHIVED && existing.status !== EventStatus.ARCHIVED ? { archivedAt: now } : {}),
        ...(validData.status !== undefined && validData.status !== EventStatus.ARCHIVED ? { archivedAt: null } : {}),
      } });
      let anchor = target?.startsAt || existing.occurrences[0]?.startsAt || now;
      if (requestedStart !== undefined) {
        anchor = new Date(requestedStart);
        if (!Number.isFinite(anchor.getTime())) throw new BadRequestException('Invalid startsAt');
        const endsAt = new Date(anchor.getTime() + event.duration * 60000);
        if (target) {
          // Do not delete/recreate the row: its message and attendee keys depend on its ID.
          const reopen = target.status === OccurrenceStatus.CLOSED && endsAt > now;
          await tx.eventOccurrence.update({ where: { id: target.id }, data: {
            startsAt: anchor, endsAt,
            ...(reopen ? { status: target.messageId ? OccurrenceStatus.PUBLISHED : OccurrenceStatus.SCHEDULED, closedAt: null } : {}),
          } });
        } else {
          const index = Math.max(-1, ...existing.occurrences.map(o => o.index)) + 1;
          await tx.eventOccurrence.create({ data: { eventId, index, startsAt: anchor, endsAt, channelId: event.channelId } });
        }
      }
      if (validData.duration !== undefined) {
        for (const occurrence of active) {
          if (requestedStart !== undefined && occurrence.id === target?.id) continue;
          await tx.eventOccurrence.update({ where: { id: occurrence.id }, data: { endsAt: new Date(occurrence.startsAt.getTime() + event.duration * 60000) } });
        }
      }
      if (validData.channelId !== undefined) {
        // An existing Discord message stays in its original channel.
        await tx.eventOccurrence.updateMany({ where: { eventId, status: OccurrenceStatus.SCHEDULED, messageId: null }, data: { channelId: event.channelId } });
      }
      if (recurrenceChanged) {
        // Regenerate only unannounced future dates without attendee records.
        await tx.eventOccurrence.deleteMany({ where: { eventId, status: OccurrenceStatus.SCHEDULED, messageId: null, publishClaimToken: null, startsAt: { gte: now }, rsvps: { none: {} }, ...(target ? { id: { not: target.id } } : {}) } });
        if (event.rrule) {
          const remaining = await tx.eventOccurrence.findMany({ where: { eventId } });
          const occupied = new Set(remaining.map(o => o.startsAt.getTime()));
          const generated = this.recurrenceService.generateOccurrences({ id: eventId, rrule: event.rrule, duration: event.duration }, new Date(Math.max(now.getTime(), anchor.getTime())), 10, anchor);
          let index = Math.max(-1, ...remaining.map(o => o.index)) + 1;
          const fresh = generated.filter(o => !occupied.has(o.startsAt.getTime()));
          if (fresh.length) await tx.eventOccurrence.createMany({ data: fresh.map(o => ({ eventId, index: index++, startsAt: o.startsAt, endsAt: o.endsAt, status: OccurrenceStatus.SCHEDULED, channelId: event.channelId })) });
        }
      }
      return event;
    });
    const fullEvent = await this.getEvent(guildId, eventId);
    this.eventsGateway.emit(guildId, 'EVENT_UPDATED', fullEvent);
    // Web and Discord edits now refresh the same stored announcements.
    let discordSync: EventDiscordSync;
    try { discordSync = await this.publisher.syncEvent(eventId); }
    catch (error) {
      this.logger.warn(`Event saved but announcement refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      discordSync = { updated: 0, failed: 1 };
    }
    // A new date or shorter lead time may make an occurrence due now.
    this.triggerPublish();
    return { ...fullEvent, discordSync };
  }

  /** Deletes an event after marking its live announcements as cancelled. */
  async deleteEvent(guildId: string, eventId: string): Promise<Event & { discordSync: EventDiscordSync }> {
    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, guildId },
      include: { occurrences: { where: { messageId: { not: null }, status: { in: OPEN_STATUSES } }, include: { rsvps: true } } },
    });
    if (!existing) {
      throw new NotFoundException(`Event with ID "${eventId}" not found`);
    }
    const { occurrences, ...event } = existing;
    // Stop the scheduler from posting anything else while we clean up.
    await this.prisma.eventOccurrence.updateMany({ where: { eventId, status: OccurrenceStatus.SCHEDULED }, data: { status: OccurrenceStatus.CANCELLED } });
    const discordSync = await this.publisher.editAnnouncements(
      occurrences.map((occurrence) => ({ ...occurrence, event })),
      OccurrenceStatus.CANCELLED,
    );
    const deleted = await this.prisma.event.delete({ where: { id: eventId } });
    this.eventsGateway.emit(guildId, 'EVENT_DELETED', { id: eventId });
    return { ...deleted, discordSync };
  }

  async cancelOccurrence(guildId: string, eventId: string, occurrenceId: string): Promise<EventOccurrence & { discordSync: EventDiscordSync }> {
    const occurrence = await this.prisma.eventOccurrence.findFirst({
      where: { id: occurrenceId, eventId, event: { guildId } },
    });
    if (!occurrence) {
      throw new NotFoundException(`Occurrence with ID "${occurrenceId}" not found`);
    }

    await this.prisma.eventOccurrence.updateMany({
      where: { id: occurrenceId, status: { not: OccurrenceStatus.CANCELLED } },
      data: { status: OccurrenceStatus.CANCELLED, publishClaimToken: null, publishClaimedAt: null },
    });
    const updated = await this.prisma.eventOccurrence.findUniqueOrThrow({ where: { id: occurrenceId }, include: { event: true, rsvps: true } });
    const discordSync = updated.messageId ? await this.publisher.editAnnouncements([updated]) : { updated: 0, failed: 0 };
    await this.archiveIfFinished(eventId);

    const { event: _event, rsvps: _rsvps, ...row } = updated;
    this.eventsGateway.emit(guildId, 'OCCURRENCE_UPDATED', row);
    return { ...row, discordSync };
  }

  /**
   * Keeps recurring events stocked with future occurrences. Called nightly and
   * before deciding that a recurring event has nothing left (so a series is never
   * archived just because the generated batch ran out).
   */
  async topUpOccurrences(eventId: string, now: Date = new Date()): Promise<number> {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`);
      const event = await tx.event.findUnique({ where: { id: eventId }, include: { occurrences: { orderBy: { startsAt: 'asc' } } } });
      if (!event || !event.rrule || event.status !== EventStatus.ACTIVE) return 0;
      const open = event.occurrences.filter(o => OPEN_STATUSES.includes(o.status) && o.startsAt >= now);
      if (open.length >= MIN_FUTURE_OCCURRENCES) return 0;
      const anchor = event.occurrences[0]?.startsAt ?? now;
      const latest = event.occurrences.length ? event.occurrences[event.occurrences.length - 1].startsAt : null;
      const from = new Date(Math.max(now.getTime(), latest ? latest.getTime() + 1000 : 0));
      const occupied = new Set(event.occurrences.map(o => o.startsAt.getTime()));
      const fresh = this.recurrenceService
        .generateOccurrences({ id: event.id, rrule: event.rrule, duration: event.duration }, from, 10, anchor)
        .filter(o => !occupied.has(o.startsAt.getTime()) && o.startsAt >= now);
      if (!fresh.length) return 0;
      let index = Math.max(-1, ...event.occurrences.map(o => o.index)) + 1;
      await tx.eventOccurrence.createMany({
        data: fresh.map(o => ({ eventId, index: index++, startsAt: o.startsAt, endsAt: o.endsAt, status: OccurrenceStatus.SCHEDULED, channelId: event.channelId })),
      });
      this.logger.log(`Generated ${fresh.length} new occurrences for event "${event.title}" (${event.id})`);
      return fresh.length;
    });
  }

  /** Archives (never deletes) an active event that has no open occurrence left. */
  async archiveIfFinished(eventId: string, now: Date = new Date()): Promise<boolean> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { status: true, rrule: true, guildId: true } });
    if (!event || event.status !== EventStatus.ACTIVE) return false;
    if (event.rrule) await this.topUpOccurrences(eventId, now);
    const archived = await this.prisma.event.updateMany({
      where: { id: eventId, status: EventStatus.ACTIVE, occurrences: { none: { status: { in: OPEN_STATUSES } } } },
      data: { status: EventStatus.ARCHIVED, archivedAt: now },
    });
    if (archived.count === 1) {
      this.eventsGateway.emit(event.guildId, 'EVENT_UPDATED', { id: eventId, status: EventStatus.ARCHIVED });
      this.logger.log(`Archived finished event ${eventId}`);
    }
    return archived.count === 1;
  }

  /** Retention: removes events archived more than ARCHIVE_RETENTION_DAYS ago. */
  async purgeArchivedEvents(now: Date = new Date(), retentionDays = ARCHIVE_RETENTION_DAYS): Promise<number> {
    const cutoff = new Date(now.getTime() - retentionDays * 86400000);
    const result = await this.prisma.event.deleteMany({
      where: {
        status: EventStatus.ARCHIVED,
        OR: [{ archivedAt: { lt: cutoff } }, { archivedAt: null, updatedAt: { lt: cutoff } }],
      },
    });
    return result.count;
  }

  private triggerPublish(): void {
    void this.publisher.publishDue().catch((error) =>
      this.logger.warn(`Immediate publish failed; the scheduler will retry: ${error instanceof Error ? error.message : error}`),
    );
  }
}
