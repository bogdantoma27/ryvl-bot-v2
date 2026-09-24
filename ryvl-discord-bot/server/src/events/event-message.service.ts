import { Injectable, Logger } from '@nestjs/common';
import { REST, Routes, APIMessage } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { buildEventEmbed } from '../discord/embeds/event-embed.builder';

export interface EventDiscordSync { updated: number; failed: number; }

/** Updates recorded announcements in place; never reposts or changes RSVP identities. */
@Injectable()
export class EventMessageService {
  private readonly logger = new Logger(EventMessageService.name);
  private readonly rest: REST;
  private readonly pending = new Map<string, Promise<EventDiscordSync>>();

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    // Reuse the existing bot identity via REST; do not create another Gateway bot.
    this.rest = new REST({ version: '10', timeout: 10000, retries: 2 }).setToken(config.discordToken);
  }

  syncEvent(eventId: string): Promise<EventDiscordSync> {
    // Serialize edits for the same event. Every queued refresh reads fresh DB data.
    const previous = this.pending.get(eventId) || Promise.resolve({ updated: 0, failed: 0 });
    const next = previous.catch(() => ({ updated: 0, failed: 0 })).then(() => this.syncNow(eventId));
    this.pending.set(eventId, next);
    void next.finally(() => { if (this.pending.get(eventId) === next) this.pending.delete(eventId); }).catch(() => {});
    return next;
  }

  private async syncNow(eventId: string): Promise<EventDiscordSync> {
    const result: EventDiscordSync = { updated: 0, failed: 0 };
    const occurrences = await this.prisma.eventOccurrence.findMany({
      where: { eventId, messageId: { not: null } },
      include: { event: true, rsvps: true },
      orderBy: { index: 'asc' },
    });
    for (const occurrence of occurrences) {
      const channelId = occurrence.channelId || occurrence.event.channelId;
      if (!channelId || !occurrence.messageId) { result.failed++; continue; }
      try {
        const route = Routes.channelMessage(channelId, occurrence.messageId);
        const message = await this.rest.get(route) as APIMessage;
        const footer = message.embeds?.[0]?.footer?.text;
        const creatorName = footer?.startsWith('Created by ') ? footer.slice(11) : undefined;
        const { embed, row } = buildEventEmbed({ event: occurrence.event, occurrence, rsvps: occurrence.rsvps, creatorName, frontendUrl: this.config.frontendUrl });
        await this.rest.patch(route, { body: {
          embeds: [embed.toJSON()], components: [row.toJSON()],
          // Editing a date/title must not ping every role/attendee a second time.
          allowed_mentions: { parse: [] },
        } });
        result.updated++;
      } catch (error) {
        result.failed++;
        this.logger.warn(`Event ${eventId}: could not refresh announcement ${occurrence.messageId}: ${error instanceof Error ? error.message : 'Discord request failed'}`);
      }
    }
    return result;
  }
}
