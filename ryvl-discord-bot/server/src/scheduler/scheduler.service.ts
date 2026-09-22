import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OccurrenceStatus, EventStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import { RecurrenceService } from '../events/recurrence.service';
import { buildEventEmbed } from '../discord/embeds/event-embed.builder';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discordService: DiscordService,
    private readonly recurrenceService: RecurrenceService,
  ) {}

  @Cron('*/15 * * * * *')
  async processScheduledEvents(): Promise<void> {
    const threshold = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes in the future

    try {
      const scheduledOccurrences = await this.prisma.eventOccurrence.findMany({
        where: {
          status: OccurrenceStatus.SCHEDULED,
          event: {
            status: EventStatus.ACTIVE,
          },
          OR: [
            { index: 0 },
            { startsAt: { lte: threshold } },
          ],
        },
        include: {
          event: true,
          rsvps: true,
        },
        orderBy: { startsAt: 'asc' },
      });

      if (scheduledOccurrences.length > 0) {
        this.logger.log(`Processing ${scheduledOccurrences.length} scheduled occurrences...`);
      }

      for (const occ of scheduledOccurrences) {
        const channelId = occ.channelId || occ.event.channelId;
        if (!channelId) continue;

        try {
          const { embed, row } = buildEventEmbed({
            event: occ.event,
            occurrence: occ,
            rsvps: occ.rsvps,
          });

          const mentionContent =
            occ.event.mentionRoleIds && occ.event.mentionRoleIds.length > 0
              ? occ.event.mentionRoleIds.map((rId) => `<@&${rId}>`).join(' ')
              : undefined;

          const sentMessage = await this.discordService.sendMessageToChannel(
            channelId,
            embed,
            [row],
            mentionContent,
          );

          await this.prisma.eventOccurrence.update({
            where: { id: occ.id },
            data: {
              status: OccurrenceStatus.PUBLISHED,
              messageId: sentMessage.id,
              channelId,
              publishedAt: new Date(),
            },
          });

          this.logger.log(`Published occurrence ${occ.id} to channel ${channelId}`);
        } catch (error) {
          this.logger.error(`Failed to publish scheduled occurrence ${occ.id}: ${error}`);
        }
      }
    } catch (dbError) {
      this.logger.error(`Database error during processScheduledEvents: ${dbError}`);
    }
  }

  @Cron('*/60 * * * * *')
  async closeExpiredEvents(): Promise<void> {
    const now = new Date();

    try {
      const expiredOccurrences = await this.prisma.eventOccurrence.findMany({
        where: {
          status: OccurrenceStatus.PUBLISHED,
          endsAt: { lte: now },
        },
        include: {
          event: true,
          rsvps: true,
        },
      });

      if (expiredOccurrences.length > 0) {
        this.logger.log(`Closing ${expiredOccurrences.length} expired occurrences...`);
      }

      for (const occ of expiredOccurrences) {
        try {
          await this.prisma.eventOccurrence.update({
            where: { id: occ.id },
            data: {
              status: OccurrenceStatus.CLOSED,
              closedAt: now,
            },
          });

          if (occ.channelId && occ.messageId) {
            const { embed } = buildEventEmbed({
              event: occ.event,
              occurrence: {
                ...occ,
                status: OccurrenceStatus.CLOSED,
              },
              rsvps: occ.rsvps,
            });

            // Edit Discord message to remove action buttons
            await this.discordService.editMessage(
              occ.channelId,
              occ.messageId,
              embed,
              [],
            );
          }

          this.logger.log(`Closed occurrence ${occ.id}`);
        } catch (error) {
          this.logger.error(`Failed to close occurrence ${occ.id}: ${error}`);
        }
      }
    } catch (dbError) {
      this.logger.error(`Database error during closeExpiredEvents: ${dbError}`);
    }
  }

  @Cron('0 0 * * *')
  async generateRecurringBatches(): Promise<void> {
    const now = new Date();
    this.logger.log('Running daily batch generation for recurring events...');

    try {
      const recurringEvents = await this.prisma.event.findMany({
        where: {
          status: EventStatus.ACTIVE,
          rrule: { not: null },
        },
        include: {
          occurrences: {
            where: {
              startsAt: { gte: now },
            },
            orderBy: { startsAt: 'desc' },
          },
        },
      });

      for (const event of recurringEvents) {
        if (!event.rrule) continue;

        // If fewer than 5 future occurrences exist, generate next batch
        if (event.occurrences.length < 5) {
          const latestOccurrence = event.occurrences[0];
          const fromDate = latestOccurrence ? new Date(latestOccurrence.startsAt.getTime() + 1000) : now;

          const newOccurrences = this.recurrenceService.generateOccurrences(
            {
              id: event.id,
              rrule: event.rrule,
              duration: event.duration,
            },
            fromDate,
            10,
            fromDate,
          );

          const maxIndexResult = await this.prisma.eventOccurrence.aggregate({
            where: { eventId: event.id },
            _max: { index: true },
          });
          const startIndex = (maxIndexResult._max.index ?? -1) + 1;

          if (newOccurrences.length > 0) {
            await this.prisma.eventOccurrence.createMany({
              data: newOccurrences.map((occ, i) => ({
                eventId: event.id,
                index: startIndex + i,
                startsAt: occ.startsAt,
                endsAt: occ.endsAt,
                status: OccurrenceStatus.SCHEDULED,
                channelId: event.channelId,
              })),
            });

            this.logger.log(
              `Generated ${newOccurrences.length} new occurrences for event "${event.title}" (${event.id})`,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error during recurring batch generation: ${error}`);
    }
  }
}
