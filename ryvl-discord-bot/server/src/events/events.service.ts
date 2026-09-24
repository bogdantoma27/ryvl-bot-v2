import { EventMessageService, EventDiscordSync } from './event-message.service';
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

export interface ListEventsFilter {
  status?: EventStatus;
  upcoming?: boolean;
  page?: number;
  limit?: number;
}

export type EventWithOccurrences = Event & {
  discordSync?: EventDiscordSync;
  occurrences: (EventOccurrence & {
    rsvpCounts?: { accepted: number; tentative: number; declined: number };
  })[];
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recurrenceService: RecurrenceService,
    private readonly eventsGateway: EventsGateway,
    private readonly eventMessages: EventMessageService,
  ) {}

  async createEvent(
    guildId: string,
    createdById: string,
    data: CreateEventDto,
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
      },
    });

    // Generate occurrences
    const occurrencesToCreate = this.recurrenceService.generateOccurrences(
      {
        id: event.id,
        rrule: event.rrule,
        duration: event.duration,
      },
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

    const fullEvent = await this.getEvent(event.id);
    this.eventsGateway.emit(guildId, 'EVENT_CREATED', fullEvent);

    return fullEvent;
  }

  async listEvents(
    guildId: string,
    filters?: ListEventsFilter,
  ): Promise<EventWithOccurrences[]> {
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(100, Math.max(1, filters?.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.EventWhereInput = {
      guildId,
    };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.upcoming) {
      where.occurrences = {
        some: {
          startsAt: {
            gte: new Date(),
          },
          status: {
            not: OccurrenceStatus.CANCELLED,
          },
        },
      };
    }

    const events = await this.prisma.event.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        occurrences: {
          orderBy: { startsAt: 'asc' },
          include: {
            rsvps: true,
          },
        },
      },
    });

    return events.map((event) => ({
      ...event,
      occurrences: event.occurrences.map((occ) => {
        const { rsvps, ...rest } = occ;
        return {
          ...rest,
          rsvpCounts: {
            accepted: rsvps.filter((r) => r.status === 'ACCEPTED').length,
            tentative: rsvps.filter((r) => r.status === 'TENTATIVE').length,
            declined: rsvps.filter((r) => r.status === 'DECLINED').length,
          },
        };
      }),
    }));
  }

  async getEvent(eventId: string): Promise<EventWithOccurrences> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        occurrences: {
          orderBy: { startsAt: 'asc' },
          include: {
            rsvps: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID "${eventId}" not found`);
    }

    return {
      ...event,
      occurrences: event.occurrences.map((occ) => {
        const { rsvps, ...rest } = occ;
        return {
          ...rest,
          rsvpCounts: {
            accepted: rsvps.filter((r) => r.status === 'ACCEPTED').length,
            tentative: rsvps.filter((r) => r.status === 'TENTATIVE').length,
            declined: rsvps.filter((r) => r.status === 'DECLINED').length,
          },
        };
      }),
    };
  }

  async updateEvent(eventId: string, data: UpdateEventDto, occurrenceId?: string): Promise<EventWithOccurrences> {
    const parsed = updateEventSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(`Validation error: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    const validData = parsed.data;
    // Commit event metadata and occurrence changes together. Lock the parent so
    // concurrent edits cannot regenerate or overwrite each other's schedule.
    const updatedEvent = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`);
      const existing = await tx.event.findUnique({ where: { id: eventId }, include: { occurrences: { orderBy: { startsAt: 'asc' }, include: { rsvps: true } } } });
      if (!existing) throw new NotFoundException(`Event with ID "${eventId}" not found`);
      const now = new Date();
      const active = existing.occurrences.filter(o => o.status === OccurrenceStatus.SCHEDULED || o.status === OccurrenceStatus.PUBLISHED);
      const target = occurrenceId ? existing.occurrences.find(o => o.id === occurrenceId) :
        active.find(o => (o.endsAt || o.startsAt) >= now) || active[0] || (!existing.rrule ? existing.occurrences[0] : undefined);
      if (occurrenceId && (!target || target.status === OccurrenceStatus.CANCELLED)) throw new BadRequestException('Invalid or cancelled event occurrence');
      const recurrenceChanged = validData.rrule !== undefined && validData.rrule !== existing.rrule;
      const { startsAt: requestedStart, ...metadata } = validData;
      const event = await tx.event.update({ where: { id: eventId }, data: { ...metadata, imageUrl: validData.imageUrl === '' ? null : validData.imageUrl } });
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
        await tx.eventOccurrence.deleteMany({ where: { eventId, status: OccurrenceStatus.SCHEDULED, messageId: null, startsAt: { gte: now }, rsvps: { none: {} }, ...(target ? { id: { not: target.id } } : {}) } });
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
    const fullEvent = await this.getEvent(eventId);
    this.eventsGateway.emit(updatedEvent.guildId, 'EVENT_UPDATED', fullEvent);
    // Web and Discord edits now refresh the same stored announcements.
    let discordSync: EventDiscordSync;
    try { discordSync = await this.eventMessages.syncEvent(eventId); }
    catch (error) {
      this.logger.warn(`Event saved but announcement refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      discordSync = { updated: 0, failed: 1 };
    }
    return { ...fullEvent, discordSync };
  }

  async deleteEvent(eventId: string): Promise<Event> {
    const existing = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!existing) {
      throw new NotFoundException(`Event with ID "${eventId}" not found`);
    }

    const deleted = await this.prisma.event.delete({
      where: { id: eventId },
    });

    this.eventsGateway.emit(existing.guildId, 'EVENT_DELETED', { id: eventId });

    return deleted;
  }

  async cancelOccurrence(occurrenceId: string): Promise<EventOccurrence> {
    const occurrence = await this.prisma.eventOccurrence.findUnique({
      where: { id: occurrenceId },
      include: {
        event: {
          select: { guildId: true },
        },
      },
    });

    if (!occurrence) {
      throw new NotFoundException(`Occurrence with ID "${occurrenceId}" not found`);
    }

    const updated = await this.prisma.eventOccurrence.update({
      where: { id: occurrenceId },
      data: {
        status: OccurrenceStatus.CANCELLED,
      },
    });

    this.eventsGateway.emit(occurrence.event.guildId, 'OCCURRENCE_UPDATED', updated);

    return updated;
  }

  async getOccurrence(occurrenceId: string): Promise<EventOccurrence & { event: Event }> {
    const occurrence = await this.prisma.eventOccurrence.findUnique({
      where: { id: occurrenceId },
      include: {
        event: true,
        rsvps: true,
      },
    });

    if (!occurrence) {
      throw new NotFoundException(`Occurrence with ID "${occurrenceId}" not found`);
    }

    return occurrence;
  }
}
