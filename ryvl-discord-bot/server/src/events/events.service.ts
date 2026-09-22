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

  async updateEvent(eventId: string, data: UpdateEventDto): Promise<EventWithOccurrences> {
    const parsed = updateEventSchema.safeParse(data);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new BadRequestException(`Validation error: ${issues}`);
    }

    const existingEvent = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!existingEvent) {
      throw new NotFoundException(`Event with ID "${eventId}" not found`);
    }

    const validData = parsed.data;
    const recurrenceChanged =
      (validData.rrule !== undefined && validData.rrule !== existingEvent.rrule) ||
      (validData.duration !== undefined && validData.duration !== existingEvent.duration) ||
      (validData.startsAt !== undefined);

    const updatedEvent = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        title: validData.title,
        description: validData.description,
        location: validData.location,
        imageUrl: validData.imageUrl === '' ? null : validData.imageUrl,
        color: validData.color,
        channelId: validData.channelId,
        timezone: validData.timezone,
        mentionRoleIds: validData.mentionRoleIds,
        rrule: validData.rrule,
        duration: validData.duration,
        status: validData.status,
      },
    });

    // If recurrence parameters changed, regenerate future scheduled occurrences
    if (recurrenceChanged) {
      const now = new Date();
      // Remove future scheduled occurrences that haven't been published or closed
      await this.prisma.eventOccurrence.deleteMany({
        where: {
          eventId,
          status: OccurrenceStatus.SCHEDULED,
          startsAt: { gte: now },
        },
      });

      const anchor = validData.startsAt ? new Date(validData.startsAt) : now;
      const newOccurrences = this.recurrenceService.generateOccurrences(
        {
          id: eventId,
          rrule: updatedEvent.rrule,
          duration: updatedEvent.duration,
        },
        now,
        10,
        anchor,
      );

      // Get highest existing index
      const maxIndexResult = await this.prisma.eventOccurrence.aggregate({
        where: { eventId },
        _max: { index: true },
      });
      const startIndex = (maxIndexResult._max.index ?? -1) + 1;

      if (newOccurrences.length > 0) {
        await this.prisma.eventOccurrence.createMany({
          data: newOccurrences.map((occ, i) => ({
            eventId,
            index: startIndex + i,
            startsAt: occ.startsAt,
            endsAt: occ.endsAt,
            status: OccurrenceStatus.SCHEDULED,
            channelId: updatedEvent.channelId,
          })),
        });
      }
    }

    const fullEvent = await this.getEvent(eventId);
    this.eventsGateway.emit(updatedEvent.guildId, 'EVENT_UPDATED', fullEvent);

    return fullEvent;
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
