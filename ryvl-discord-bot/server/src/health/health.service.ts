import { Injectable } from '@nestjs/common';
import { EventStatus, OccurrenceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EA_MAX_POST_ATTEMPTS } from '../ea/ea-poller.service';
import { PUBLISH_CLAIM_TTL_MS } from '../events/event-publisher.service';

/** ok: working; warning: degraded or behind; error: not posting; off: disabled / not set up. */
export type HealthState = 'ok' | 'warning' | 'error' | 'off';

interface Verdict {
  status: HealthState;
  reason: string;
}

export interface GuildHealth {
  generatedAt: string;
  eaTracker: Verdict & {
    configured: boolean;
    enabled: boolean;
    clubId: string | null;
    clubName: string | null;
    channelId: string | null;
    lastPolledAt: Date | null;
    pollIntervalSec: number | null;
    pendingPosts: number;
    failedPosts: number;
  };
  trackedClubs: Verdict & {
    total: number;
    enabled: number;
    clubs: Array<{
      clubId: string;
      clubName: string;
      platform: string;
      enabled: boolean;
      channelId: string | null;
      lastPolledAt: Date | null;
    }>;
  };
  vpgTransfers: Verdict & {
    configured: boolean;
    enabled: boolean;
    channelId: string | null;
    lastPolledAt: Date | null;
    pollIntervalSec: number | null;
  };
  vpgNotifications: Verdict & {
    configured: boolean;
    lastPolledAt: Date | null;
    lastSuccessAt: Date | null;
    lastError: string | null;
    retryAfter: Date | null;
    pollIntervalSec: number | null;
  };
  superligaMvp: Verdict & {
    season: number | null;
    counts: Record<string, number>;
    lastAttemptAt: Date | null;
    lastError: string | null;
  };
  totw: Verdict & {
    configs: Array<{
      leagueSlug: string;
      enabled: boolean;
      channelId: string | null;
      cronSchedule: string | null;
      lastPostedAt: Date | null;
    }>;
  };
  events: Verdict & {
    nextOccurrence: { eventId: string; title: string; startsAt: Date } | null;
    stuckClaims: number;
    overdue: number;
  };
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
// A Team of the Week is weekly; a gap longer than this means a missed post.
const TOTW_MAX_GAP_MS = 8 * DAY;

/** A poller is behind when it skipped three intervals (and at least 10 minutes). */
export function isStale(lastAt: Date | null | undefined, intervalSec: number | null | undefined, now: Date): boolean {
  if (!lastAt) return true;
  const allowed = Math.max(3 * (intervalSec || 120) * 1000, 10 * MINUTE);
  return now.getTime() - new Date(lastAt).getTime() > allowed;
}

export function ago(at: Date | null | undefined, now: Date): string {
  if (!at) return 'never';
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / MINUTE));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * One read-only snapshot of every background feed of a guild, with a verdict per
 * feed, for the dashboard. Nothing here calls Discord or an external API.
 */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getGuildHealth(guildId: string, now: Date = new Date()): Promise<GuildHealth> {
    const [eaTracker, trackedClubs, vpgTransfers, vpgNotifications, superligaMvp, totw, events] = await Promise.all([
      this.eaTracker(guildId, now),
      this.trackedClubs(guildId, now),
      this.vpgTransfers(guildId, now),
      this.vpgNotifications(guildId, now),
      this.superligaMvp(),
      this.totw(guildId, now),
      this.events(guildId, now),
    ]);
    return { generatedAt: now.toISOString(), eaTracker, trackedClubs, vpgTransfers, vpgNotifications, superligaMvp, totw, events };
  }

  private async eaTracker(guildId: string, now: Date): Promise<GuildHealth['eaTracker']> {
    const [config, pendingPosts, failedPosts] = await Promise.all([
      this.prisma.clubTrackerConfig.findUnique({ where: { guildId } }),
      this.prisma.processedEaMatch.count({ where: { guildId, postPending: true, postAttempts: { lt: EA_MAX_POST_ATTEMPTS } } }),
      this.prisma.processedEaMatch.count({ where: { guildId, postPending: true, postAttempts: { gte: EA_MAX_POST_ATTEMPTS } } }),
    ]);
    const base = {
      configured: !!config,
      enabled: !!config?.enabled,
      clubId: config?.clubId ?? null,
      clubName: config?.clubName ?? null,
      channelId: config?.channelId || null,
      lastPolledAt: config?.lastPolledAt ?? null,
      pollIntervalSec: config?.pollIntervalSec ?? null,
      pendingPosts,
      failedPosts,
    };
    let verdict: Verdict;
    if (!config) verdict = { status: 'off', reason: 'Not set up' };
    else if (!config.enabled) verdict = { status: 'off', reason: 'Disabled' };
    else if (!base.channelId) verdict = { status: 'error', reason: 'No channel selected' };
    else if (failedPosts > 0) verdict = { status: 'error', reason: `${plural(failedPosts, 'match post')} gave up after ${EA_MAX_POST_ATTEMPTS} attempts` };
    else if (pendingPosts > 0) verdict = { status: 'warning', reason: `${plural(pendingPosts, 'match post')} waiting to retry` };
    else if (isStale(config.lastPolledAt, config.pollIntervalSec, now)) verdict = { status: 'warning', reason: `Last checked ${ago(config.lastPolledAt, now)}` };
    else verdict = { status: 'ok', reason: `Checked ${ago(config.lastPolledAt, now)}` };
    return { ...base, ...verdict };
  }

  private async trackedClubs(guildId: string, now: Date): Promise<GuildHealth['trackedClubs']> {
    const rows = await this.prisma.trackedClub.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } });
    const clubs = rows.map((c) => ({
      clubId: c.clubId,
      clubName: c.clubName,
      platform: c.platform,
      enabled: c.enabled,
      channelId: c.channelId || null,
      lastPolledAt: c.lastPolledAt ?? null,
    }));
    const enabled = clubs.filter((c) => c.enabled);
    const noChannel = enabled.filter((c) => !c.channelId);
    // The poller skips clubs without a channel, so only those with one can be behind.
    const behind = enabled.filter((c) => c.channelId && isStale(c.lastPolledAt, 90, now));
    let verdict: Verdict;
    if (clubs.length === 0) verdict = { status: 'off', reason: 'No clubs tracked' };
    else if (enabled.length === 0) verdict = { status: 'off', reason: 'All tracked clubs are paused' };
    else if (noChannel.length) verdict = { status: 'warning', reason: `${plural(noChannel.length, 'club')} without a channel: ${noChannel.map((c) => c.clubName).join(', ')}` };
    else if (behind.length) verdict = { status: 'warning', reason: `Not checked recently: ${behind.map((c) => c.clubName).join(', ')}` };
    else verdict = { status: 'ok', reason: `${plural(enabled.length, 'club')} tracked` };
    return { total: clubs.length, enabled: enabled.length, clubs, ...verdict };
  }

  private async vpgTransfers(guildId: string, now: Date): Promise<GuildHealth['vpgTransfers']> {
    const config = await this.prisma.vpgTransferConfig.findUnique({ where: { guildId } });
    const base = {
      configured: !!config,
      enabled: !!config?.enabled,
      channelId: config?.channelId || null,
      lastPolledAt: config?.lastPolledAt ?? null,
      pollIntervalSec: config?.pollIntervalSec ?? null,
    };
    let verdict: Verdict;
    if (!config) verdict = { status: 'off', reason: 'Not set up' };
    else if (!config.enabled) verdict = { status: 'off', reason: 'Disabled' };
    else if (!base.channelId) verdict = { status: 'error', reason: 'No channel selected' };
    else if (isStale(config.lastPolledAt, config.pollIntervalSec, now)) verdict = { status: 'warning', reason: `Last checked ${ago(config.lastPolledAt, now)}` };
    else verdict = { status: 'ok', reason: `Checked ${ago(config.lastPolledAt, now)}` };
    return { ...base, ...verdict };
  }

  private async vpgNotifications(guildId: string, now: Date): Promise<GuildHealth['vpgNotifications']> {
    const config = await this.prisma.vpgNotificationConfig.findUnique({ where: { guildId } });
    const base = {
      configured: !!config,
      lastPolledAt: config?.lastPolledAt ?? null,
      lastSuccessAt: config?.lastSuccessAt ?? null,
      lastError: config?.lastError ?? null,
      retryAfter: config?.retryAfter ?? null,
      pollIntervalSec: config?.pollIntervalSec ?? null,
    };
    let verdict: Verdict;
    if (!config) verdict = { status: 'off', reason: 'Not set up' };
    else if (config.lastError) {
      // Failing for a day (or never succeeded) is an outage, a recent failure is a blip.
      const failingLong = !config.lastSuccessAt || now.getTime() - config.lastSuccessAt.getTime() > DAY;
      const retry = config.retryAfter && config.retryAfter > now ? `; retrying ${config.retryAfter.toISOString()}` : '';
      verdict = { status: failingLong ? 'error' : 'warning', reason: `${config.lastError}${retry}` };
    } else if (isStale(config.lastPolledAt, config.pollIntervalSec, now)) verdict = { status: 'warning', reason: `Last checked ${ago(config.lastPolledAt, now)}` };
    else verdict = { status: 'ok', reason: `Checked ${ago(config.lastPolledAt, now)}` };
    return { ...base, ...verdict };
  }

  /** The MVP sync is league-wide (not per guild): reports the latest season it holds. */
  private async superligaMvp(): Promise<GuildHealth['superligaMvp']> {
    const latest = await this.prisma.superligaMvpMatch.findFirst({ orderBy: { season: 'desc' }, select: { season: true } });
    if (!latest) return { season: null, counts: {}, lastAttemptAt: null, lastError: null, status: 'off', reason: 'No Superliga matches synced yet' };
    const season = latest.season;
    const [groups, attempted] = await Promise.all([
      this.prisma.superligaMvpMatch.groupBy({ by: ['status'], where: { season }, _count: { _all: true } }),
      this.prisma.superligaMvpMatch.findFirst({
        where: { season, lastAttemptAt: { not: null } },
        orderBy: { lastAttemptAt: 'desc' },
        select: { lastAttemptAt: true, lastError: true, status: true },
      }),
    ]);
    const counts: Record<string, number> = {};
    for (const g of groups) counts[g.status] = g._count._all;
    const lastError = attempted?.status === 'LINKED' ? null : attempted?.lastError ?? null;
    let verdict: Verdict;
    if (lastError) verdict = { status: 'warning', reason: `Latest sync: ${lastError}` };
    else if (counts.EXPIRED) verdict = { status: 'warning', reason: `${plural(counts.EXPIRED, 'match')} without EA stats` };
    else verdict = { status: 'ok', reason: `${counts.LINKED || 0} linked, ${counts.PENDING || 0} pending` };
    return { season, counts, lastAttemptAt: attempted?.lastAttemptAt ?? null, lastError, ...verdict };
  }

  private async totw(guildId: string, now: Date): Promise<GuildHealth['totw']> {
    const rows = await this.prisma.totwConfig.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } });
    const configs = rows.map((c) => ({
      leagueSlug: c.leagueSlug,
      enabled: c.enabled,
      channelId: c.channelId || null,
      cronSchedule: c.cronSchedule ?? null,
      lastPostedAt: c.lastPostedAt ?? null,
    }));
    const enabled = rows.filter((c) => c.enabled);
    const noChannel = enabled.filter((c) => !c.channelId);
    // A config enabled long enough to have posted, that has not posted for over a week.
    const missed = enabled.filter((c) => c.channelId && now.getTime() - (c.lastPostedAt ?? c.updatedAt).getTime() > TOTW_MAX_GAP_MS);
    let verdict: Verdict;
    if (enabled.length === 0) verdict = { status: 'off', reason: rows.length ? 'Automatic posting disabled' : 'Not set up' };
    else if (noChannel.length) verdict = { status: 'error', reason: 'Enabled but no channel selected' };
    else if (missed.length) verdict = { status: 'warning', reason: `Last posted ${ago(missed[0].lastPostedAt, now)}` };
    else {
      const last = enabled.map((c) => c.lastPostedAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
      verdict = { status: 'ok', reason: last ? `Last posted ${ago(last, now)}` : 'Waiting for the first scheduled post' };
    }
    return { configs, ...verdict };
  }

  private async events(guildId: string, now: Date): Promise<GuildHealth['events']> {
    const live = { guildId, status: EventStatus.ACTIVE, archivedAt: null };
    const [next, stuckClaims, overdue] = await Promise.all([
      this.prisma.eventOccurrence.findFirst({
        where: { status: OccurrenceStatus.SCHEDULED, startsAt: { gte: now }, event: live },
        orderBy: { startsAt: 'asc' },
        select: { startsAt: true, event: { select: { id: true, title: true } } },
      }),
      // A claim older than its lease means a worker died mid-post; the next run re-claims it.
      this.prisma.eventOccurrence.count({
        where: {
          status: OccurrenceStatus.SCHEDULED,
          publishClaimToken: { not: null },
          publishClaimedAt: { lt: new Date(now.getTime() - PUBLISH_CLAIM_TTL_MS) },
          event: { guildId },
        },
      }),
      // Already started but never announced: every post attempt failed (or the scheduler is down).
      this.prisma.eventOccurrence.count({
        where: { status: OccurrenceStatus.SCHEDULED, messageId: null, startsAt: { lt: now }, event: live },
      }),
    ]);
    const nextOccurrence = next ? { eventId: next.event.id, title: next.event.title, startsAt: next.startsAt } : null;
    let verdict: Verdict;
    if (stuckClaims) verdict = { status: 'error', reason: `${plural(stuckClaims, 'announcement')} stuck mid-post` };
    else if (overdue) verdict = { status: 'warning', reason: `${plural(overdue, 'occurrence')} started without being announced` };
    else if (nextOccurrence) verdict = { status: 'ok', reason: `Next: ${nextOccurrence.title}` };
    else verdict = { status: 'off', reason: 'No upcoming events' };
    return { nextOccurrence, stuckClaims, overdue, ...verdict };
  }
}
