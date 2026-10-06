import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OccurrenceStatus, EventStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { EventPublisher } from '../events/event-publisher.service';
import { occurrenceEnd } from '../events/event-view';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private closing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: EventPublisher,
    private readonly eventsService: EventsService,
  ) {}

  /** Announces due occurrences. Claims are atomic, and overlapping runs coalesce in the publisher. */
  // Cron handlers take no arguments: the cron library passes its own callback to onTick.
  @Cron('*/15 * * * * *')
  async onPublishTick(): Promise<void> { await this.processScheduledEvents(); }

  @Cron('*/60 * * * * *')
  async onCloseTick(): Promise<void> { await this.closeExpiredEvents(); }

  @Cron('0 0 * * *')
  async onNightlyTopUp(): Promise<void> { await this.generateRecurringBatches(); }

  @Cron('0 30 3 * * *')
  async onRetentionTick(): Promise<void> { await this.purgeArchivedEvents(); }

  async processScheduledEvents(now?: Date): Promise<void> {
    try {
      const result = await this.publisher.publishDue(now);
      if (result.published || result.closed || result.failed) {
        this.logger.log(`Publish run: ${result.published} published, ${result.closed} skipped as already ended, ${result.failed} failed (will retry)`);
      }
    } catch (error) {
      this.logger.error(`Database error during processScheduledEvents: ${error}`);
    }
  }

  /** Closes ended occurrences, then archives events that have nothing left to run. */
  async closeExpiredEvents(now: Date = new Date()): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    try {
      // endsAt may be missing on old rows: those end after the event's duration.
      const candidates = await this.prisma.eventOccurrence.findMany({
        where: {
          status: OccurrenceStatus.PUBLISHED,
          OR: [{ endsAt: { lte: now } }, { endsAt: null, startsAt: { lte: now } }],
        },
        include: { event: { select: { duration: true } } },
      });
      const expired = candidates.filter((occ) => occurrenceEnd(occ, occ.event.duration).getTime() <= now.getTime());
      if (expired.length > 0) {
        this.logger.log(`Closing ${expired.length} expired occurrences...`);
      }

      const touchedEvents = new Set<string>();
      for (const occ of expired) {
        try {
          if (await this.publisher.closeOccurrence(occ.id, now)) touchedEvents.add(occ.eventId);
        } catch (error) {
          this.logger.error(`Failed to close occurrence ${occ.id}: ${error}`);
        }
      }

      // Occurrences closed without ever being posted (skipped after downtime) also finish events.
      const silentlyClosed = await this.prisma.event.findMany({
        where: { status: EventStatus.ACTIVE, occurrences: { none: { status: { in: [OccurrenceStatus.SCHEDULED, OccurrenceStatus.PUBLISHED] } } } },
        select: { id: true },
        take: 100,
      });
      for (const { id } of silentlyClosed) touchedEvents.add(id);

      for (const eventId of touchedEvents) {
        try {
          await this.eventsService.archiveIfFinished(eventId, now);
        } catch (error) {
          this.logger.error(`Failed to archive event ${eventId}: ${error}`);
        }
      }
    } catch (dbError) {
      this.logger.error(`Database error during closeExpiredEvents: ${dbError}`);
    } finally {
      this.closing = false;
    }
  }

  async generateRecurringBatches(now: Date = new Date()): Promise<void> {
    this.logger.log('Running daily batch generation for recurring events...');
    try {
      const recurringEvents = await this.prisma.event.findMany({
        where: { status: EventStatus.ACTIVE, rrule: { not: null } },
        select: { id: true },
      });
      for (const event of recurringEvents) {
        try {
          await this.eventsService.topUpOccurrences(event.id, now);
        } catch (error) {
          this.logger.error(`Error generating occurrences for event ${event.id}: ${error}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error during recurring batch generation: ${error}`);
    }
  }

  /** Retention: archived events are removed 180 days after archiving. */
  async purgeArchivedEvents(now: Date = new Date()): Promise<void> {
    try {
      const removed = await this.eventsService.purgeArchivedEvents(now);
      if (removed > 0) this.logger.log(`Removed ${removed} events archived more than 180 days ago`);
    } catch (error) {
      this.logger.error(`Error during archived event retention: ${error}`);
    }
  }
}
