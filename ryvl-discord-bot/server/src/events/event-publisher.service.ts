import { Injectable, Logger } from '@nestjs/common';
import { REST, Routes, APIMessage, APIUser } from 'discord.js';
import { randomUUID } from 'crypto';
import { Event, EventOccurrence, EventStatus, OccurrenceStatus, Rsvp } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { buildEventEmbed, isOccurrenceInteractive } from '../discord/embeds/event-embed.builder';
import { occurrenceEnd } from './event-view';

export interface EventDiscordSync { updated: number; failed: number; }
export type PublishOutcome = 'published' | 'closed' | 'skipped' | 'failed';
export interface PublishRunResult { published: number; closed: number; failed: number; skipped: boolean; }

/** A claim older than this is assumed to belong to a crashed worker and may be retaken. */
export const PUBLISH_CLAIM_TTL_MS = 10 * 60 * 1000;
/** Upper bound of Event.publishLeadMinutes (30 days); also bounds the candidate query. */
export const MAX_PUBLISH_LEAD_MINUTES = 30 * 24 * 60;

type OccurrenceWithEvent = EventOccurrence & { event: Event; rsvps: Rsvp[] };

/**
 * An occurrence is announced when its event is first created (index 0) and, for
 * later occurrences, once kickoff is within the event's publish lead time.
 */
export function isOccurrenceDue(
  occurrence: Pick<EventOccurrence, 'index' | 'startsAt'>,
  event: Pick<Event, 'publishLeadMinutes'>,
  now: Date,
): boolean {
  if (occurrence.index === 0) return true;
  const lead = Math.min(MAX_PUBLISH_LEAD_MINUTES, Math.max(0, event.publishLeadMinutes ?? 0));
  return occurrence.startsAt.getTime() - lead * 60000 <= now.getTime();
}

/**
 * The only code path that posts or edits event announcements. The scheduler, the
 * admin API and Discord commands all go through it, so a message is posted once
 * (claimed atomically per occurrence) and rendered the same way everywhere.
 */
@Injectable()
export class EventPublisher {
  private readonly logger = new Logger(EventPublisher.name);
  private readonly rest: REST;
  private readonly pendingSync = new Map<string, Promise<EventDiscordSync>>();
  private readonly creatorNames = new Map<string, string | undefined>();
  private running = false;
  private rerunRequested = false;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    // Reuse the bot identity via REST; do not create another Gateway client.
    this.rest = new REST({ version: '10', timeout: 10000, retries: 2 }).setToken(config.discordToken);
  }

  /**
   * Publishes every due occurrence. Overlapping calls do not run in parallel: a call
   * made while a run is in progress makes that run repeat once more and returns.
   */
  async publishDue(now?: Date): Promise<PublishRunResult> {
    const result: PublishRunResult = { published: 0, closed: 0, failed: 0, skipped: false };
    if (this.running) {
      this.rerunRequested = true;
      return { ...result, skipped: true };
    }
    this.running = true;
    try {
      let at = now ?? new Date();
      do {
        this.rerunRequested = false;
        const once = await this.publishDueOnce(at);
        result.published += once.published;
        result.closed += once.closed;
        result.failed += once.failed;
        at = new Date();
      } while (this.rerunRequested);
    } finally {
      this.running = false;
    }
    return result;
  }

  private async publishDueOnce(now: Date): Promise<PublishRunResult> {
    const result: PublishRunResult = { published: 0, closed: 0, failed: 0, skipped: false };
    const candidates = await this.prisma.eventOccurrence.findMany({
      where: {
        status: OccurrenceStatus.SCHEDULED,
        event: { status: EventStatus.ACTIVE },
        OR: [{ index: 0 }, { startsAt: { lte: new Date(now.getTime() + MAX_PUBLISH_LEAD_MINUTES * 60000) } }],
        AND: [{ OR: [{ publishClaimedAt: null }, { publishClaimedAt: { lt: new Date(now.getTime() - PUBLISH_CLAIM_TTL_MS) } }] }],
      },
      include: { event: true },
      orderBy: { startsAt: 'asc' },
      take: 200,
    });
    for (const occurrence of candidates) {
      if (!isOccurrenceDue(occurrence, occurrence.event, now)) continue;
      const outcome = await this.publishOccurrence(occurrence.id, now);
      if (outcome === 'published') result.published++;
      else if (outcome === 'closed') result.closed++;
      else if (outcome === 'failed') result.failed++;
    }
    return result;
  }

  /** Claims, posts and records one occurrence. Safe to call concurrently from several workers. */
  async publishOccurrence(occurrenceId: string, now: Date = new Date()): Promise<PublishOutcome> {
    const token = randomUUID();
    const claim = await this.prisma.eventOccurrence.updateMany({
      where: {
        id: occurrenceId,
        status: OccurrenceStatus.SCHEDULED,
        OR: [{ publishClaimedAt: null }, { publishClaimedAt: { lt: new Date(now.getTime() - PUBLISH_CLAIM_TTL_MS) } }],
      },
      data: { publishClaimToken: token, publishClaimedAt: now },
    });
    if (claim.count !== 1) return 'skipped';
    const claimed = { id: occurrenceId, status: OccurrenceStatus.SCHEDULED, publishClaimToken: token };
    const release = () => this.prisma.eventOccurrence.updateMany({ where: claimed, data: { publishClaimToken: null, publishClaimedAt: null } });

    const occurrence = await this.prisma.eventOccurrence.findUnique({ where: { id: occurrenceId }, include: { event: true, rsvps: true } });
    if (!occurrence || occurrence.event.status !== EventStatus.ACTIVE) {
      await release();
      return 'skipped';
    }
    // Catching up after downtime: never announce something that already ended.
    if (occurrenceEnd(occurrence, occurrence.event.duration).getTime() <= now.getTime()) {
      await this.prisma.eventOccurrence.updateMany({
        where: claimed,
        data: { status: OccurrenceStatus.CLOSED, closedAt: now, publishClaimToken: null, publishClaimedAt: null },
      });
      return 'closed';
    }

    const channelId = occurrence.channelId || occurrence.event.channelId;
    let messageId: string;
    try {
      messageId = await this.postAnnouncement(channelId, occurrence);
    } catch (error) {
      await release().catch(() => undefined);
      this.logger.error(`Failed to publish occurrence ${occurrenceId} to ${channelId}: ${error instanceof Error ? error.message : error}`);
      return 'failed';
    }

    const recorded = await this.prisma.eventOccurrence.updateMany({
      where: claimed,
      data: { status: OccurrenceStatus.PUBLISHED, messageId, channelId, publishedAt: now, publishClaimToken: null, publishClaimedAt: null },
    });
    if (recorded.count !== 1) {
      // Cancelled (or otherwise changed) while the message was being sent: keep the
      // message reference and show the final state instead of a live RSVP card.
      await this.prisma.eventOccurrence.updateMany({ where: { id: occurrenceId, messageId: null }, data: { messageId, channelId } });
      const current = await this.prisma.eventOccurrence.findUnique({ where: { id: occurrenceId }, include: { event: true, rsvps: true } });
      if (current) await this.editAnnouncement(current).catch(() => undefined);
    } else {
      this.logger.log(`Published occurrence ${occurrenceId} to channel ${channelId}`);
    }
    return 'published';
  }

  /** Closes a published occurrence once and removes its RSVP buttons. */
  async closeOccurrence(occurrenceId: string, now: Date = new Date()): Promise<boolean> {
    const closed = await this.prisma.eventOccurrence.updateMany({
      where: { id: occurrenceId, status: OccurrenceStatus.PUBLISHED },
      data: { status: OccurrenceStatus.CLOSED, closedAt: now },
    });
    if (closed.count !== 1) return false;
    const occurrence = await this.prisma.eventOccurrence.findUnique({ where: { id: occurrenceId }, include: { event: true, rsvps: true } });
    if (occurrence?.messageId) {
      await this.editAnnouncement(occurrence).catch((error) =>
        this.logger.warn(`Closed occurrence ${occurrenceId} but could not update its message: ${error instanceof Error ? error.message : error}`),
      );
    }
    return true;
  }

  /** Refreshes every recorded announcement of an event in place; never reposts. */
  syncEvent(eventId: string): Promise<EventDiscordSync> {
    // Serialize edits for the same event. Every queued refresh reads fresh DB data.
    const previous = this.pendingSync.get(eventId) || Promise.resolve({ updated: 0, failed: 0 });
    const next = previous.catch(() => ({ updated: 0, failed: 0 })).then(() => this.syncNow(eventId));
    this.pendingSync.set(eventId, next);
    void next.finally(() => { if (this.pendingSync.get(eventId) === next) this.pendingSync.delete(eventId); }).catch(() => {});
    return next;
  }

  private async syncNow(eventId: string): Promise<EventDiscordSync> {
    const occurrences = await this.prisma.eventOccurrence.findMany({
      where: { eventId, messageId: { not: null } },
      include: { event: true, rsvps: true },
      orderBy: { index: 'asc' },
    });
    return this.editAnnouncements(occurrences);
  }

  /** Edits the given announcements, optionally forcing a status (e.g. CANCELLED before deletion). */
  async editAnnouncements(occurrences: OccurrenceWithEvent[], statusOverride?: OccurrenceStatus): Promise<EventDiscordSync> {
    const result: EventDiscordSync = { updated: 0, failed: 0 };
    for (const occurrence of occurrences) {
      if (!occurrence.messageId) continue;
      try {
        await this.editAnnouncement(statusOverride ? { ...occurrence, status: statusOverride } : occurrence);
        result.updated++;
      } catch (error) {
        result.failed++;
        this.logger.warn(`Event ${occurrence.eventId}: could not refresh announcement ${occurrence.messageId}: ${error instanceof Error ? error.message : 'Discord request failed'}`);
      }
    }
    return result;
  }

  /** Message body for an occurrence; buttons only while RSVPs are open. */
  renderAnnouncement(occurrence: OccurrenceWithEvent, creatorName?: string) {
    const { embed, row } = buildEventEmbed({
      event: occurrence.event,
      occurrence,
      rsvps: occurrence.rsvps,
      creatorName,
      frontendUrl: this.config.frontendUrl,
    });
    return {
      embeds: [embed.toJSON()],
      components: isOccurrenceInteractive(occurrence.status) ? [row.toJSON()] : [],
    };
  }

  private async editAnnouncement(occurrence: OccurrenceWithEvent): Promise<void> {
    const channelId = occurrence.channelId || occurrence.event.channelId;
    if (!channelId || !occurrence.messageId) throw new Error('Occurrence has no recorded message');
    const route = Routes.channelMessage(channelId, occurrence.messageId);
    const message = (await this.rest.get(route)) as APIMessage;
    const footer = message.embeds?.[0]?.footer?.text;
    const creatorName = footer?.startsWith('Created by ') ? footer.slice(11) : undefined;
    await this.rest.patch(route, {
      body: {
        ...this.renderAnnouncement(occurrence, creatorName),
        // Editing a date/title must not ping every role/attendee a second time.
        allowed_mentions: { parse: [] },
      },
    });
  }

  private async postAnnouncement(channelId: string, occurrence: OccurrenceWithEvent): Promise<string> {
    const roles = (occurrence.event.mentionRoleIds || []).filter((id) => /^\d+$/.test(id));
    const creatorName = await this.resolveCreatorName(occurrence.event.createdById);
    const message = (await this.rest.post(Routes.channelMessages(channelId), {
      body: {
        content: roles.length ? roles.map((id) => `<@&${id}>`).join(' ') : undefined,
        ...this.renderAnnouncement(occurrence, creatorName),
        allowed_mentions: { parse: [], roles },
      },
    })) as APIMessage;
    return message.id;
  }

  private async resolveCreatorName(userId: string | null | undefined): Promise<string | undefined> {
    if (!userId || !/^\d+$/.test(userId)) return undefined;
    if (this.creatorNames.has(userId)) return this.creatorNames.get(userId);
    let name: string | undefined;
    try {
      const user = (await this.rest.get(Routes.user(userId))) as APIUser;
      name = user.global_name || user.username || undefined;
    } catch {
      name = undefined;
    }
    this.creatorNames.set(userId, name);
    return name;
  }
}
