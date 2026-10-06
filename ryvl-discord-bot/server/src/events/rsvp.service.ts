import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OccurrenceStatus, Prisma, Rsvp, RsvpStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from './events.gateway';

export interface RsvpGrouped {
  accepted: Rsvp[];
  tentative: Rsvp[];
  declined: Rsvp[];
}

export interface RsvpCounts {
  accepted: number;
  tentative: number;
  declined: number;
}

/** Thrown when someone answers an occurrence that is not open for RSVPs. */
export class RsvpClosedException extends BadRequestException {
  constructor(readonly occurrenceStatus: OccurrenceStatus) {
    super(
      occurrenceStatus === OccurrenceStatus.CANCELLED
        ? 'This event was cancelled, so RSVPs are closed.'
        : occurrenceStatus === OccurrenceStatus.CLOSED
          ? 'This event has ended, so RSVPs are closed.'
          : 'RSVPs are not open for this event yet.',
    );
  }
}

@Injectable()
export class RsvpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async upsertRsvp(
    occurrenceId: string,
    userId: string,
    displayName: string,
    avatarUrl: string | null,
    status: RsvpStatus,
  ): Promise<Rsvp> {
    const occurrence = await this.prisma.eventOccurrence.findUnique({
      where: { id: occurrenceId },
      include: { event: { select: { guildId: true } } },
    });

    if (!occurrence) {
      throw new NotFoundException(`Event occurrence with ID "${occurrenceId}" not found`);
    }
    if (occurrence.status !== OccurrenceStatus.PUBLISHED) {
      throw new RsvpClosedException(occurrence.status);
    }

    const rsvp = await this.prisma.rsvp.upsert({
      where: { occurrenceId_userId: { occurrenceId, userId } },
      update: { displayName, avatarUrl, status, updatedAt: new Date() },
      create: { occurrenceId, userId, displayName, avatarUrl, status },
    });

    const counts = await this.getRsvpCounts(occurrenceId);

    // Broadcast SSE update
    this.eventsGateway.emit(occurrence.event.guildId, 'RSVP_UPDATED', { occurrenceId, rsvp, counts });

    return rsvp;
  }

  /** RSVPs of one occurrence, only when it belongs to the given guild's event. */
  private occurrenceScope(guildId: string, eventId: string, occurrenceId: string): Prisma.RsvpWhereInput {
    return { occurrenceId, occurrence: { id: occurrenceId, eventId, event: { guildId } } };
  }

  async getRsvps(guildId: string, eventId: string, occurrenceId: string): Promise<RsvpGrouped> {
    const rsvps = await this.prisma.rsvp.findMany({
      where: this.occurrenceScope(guildId, eventId, occurrenceId),
      orderBy: { respondedAt: 'asc' },
    });

    return {
      accepted: rsvps.filter((r) => r.status === RsvpStatus.ACCEPTED),
      tentative: rsvps.filter((r) => r.status === RsvpStatus.TENTATIVE),
      declined: rsvps.filter((r) => r.status === RsvpStatus.DECLINED),
    };
  }

  async getFlatRsvps(guildId: string, eventId: string, occurrenceId?: string): Promise<Record<string, unknown>[]> {
    if (!occurrenceId) return [];
    const rsvps = await this.prisma.rsvp.findMany({
      where: this.occurrenceScope(guildId, eventId, occurrenceId),
      orderBy: { updatedAt: 'desc' },
    });
    return rsvps.map((r) => ({
      user_discord_id: r.userId,
      userId: r.userId,
      display_name: r.displayName,
      displayName: r.displayName,
      avatar_url: r.avatarUrl,
      avatarUrl: r.avatarUrl,
      status: r.status.toLowerCase(),
      updated_at: r.updatedAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async getRsvpCounts(occurrenceId: string): Promise<RsvpCounts> {
    const [accepted, tentative, declined] = await Promise.all([
      this.prisma.rsvp.count({ where: { occurrenceId, status: RsvpStatus.ACCEPTED } }),
      this.prisma.rsvp.count({ where: { occurrenceId, status: RsvpStatus.TENTATIVE } }),
      this.prisma.rsvp.count({ where: { occurrenceId, status: RsvpStatus.DECLINED } }),
    ]);

    return { accepted, tentative, declined };
  }
}
