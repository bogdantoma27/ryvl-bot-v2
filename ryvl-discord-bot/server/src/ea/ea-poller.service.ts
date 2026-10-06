import { buildClubWebUrl } from '../config/public-url';
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  EaService,
  DEFAULT_EA_MATCH_TYPES,
  DEFAULT_EA_PLATFORM,
  DEFAULT_ELO,
  EA_POLL_BASE_TICK_SEC,
  clampPollInterval,
  computeElo,
  outcomeScore,
} from './ea.service';
import { DiscordService } from '../discord/discord.service';
import { ConfigService } from '../config/config.service';
import { buildEaMatchEmbed } from '../discord/embeds/ea-embed.builder';
import { EaRawMatch, ParsedEaMatch } from './ea.types';

/** Matches inspected per club and poll (newest first). */
export const EA_POLL_MATCH_WINDOW = 5;
/** A failed Discord post is retried on later polls up to this many attempts... */
export const EA_MAX_POST_ATTEMPTS = 5;
/** ...and only while the match was recorded less than this long ago. */
export const EA_POST_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** rawPayload of processed matches is cleared after this many days (rows are kept). */
export const EA_RAW_PAYLOAD_RETENTION_DAYS = 30;

/**
 * One club polled for one guild. The guild's primary club (ClubTrackerConfig)
 * and a TrackedClub row for the same club/platform are merged into a single
 * target, so the club is fetched and posted once per tick.
 */
export interface EaPollTarget {
  key: string;
  guildId: string;
  clubId: string;
  platform: string;
  clubName: string;
  channelId: string | null;
  matchTypes: string[];
  pollIntervalSec: number;
  lastMatchId: string | null;
  lastPolledAt: Date | null;
  elo: number;
  /** Set when the target is (also) the guild's primary club. */
  isPrimary: boolean;
  /** TrackedClub.id when a TrackedClub row backs this target. */
  trackedClubId: string | null;
}

export function pollTargetKey(guildId: string, clubId: string, platform?: string | null): string {
  return `${guildId}:${clubId}:${platform || DEFAULT_EA_PLATFORM}`;
}

/** Merge primary configs and tracked clubs into one de-duplicated list of poll targets. */
export function buildPollTargets(configs: any[], trackedClubs: any[], allConfigs: any[] = configs): EaPollTarget[] {
  const intervalByGuild = new Map<string, number>();
  for (const c of allConfigs) intervalByGuild.set(c.guildId, clampPollInterval(c.pollIntervalSec));

  const targets = new Map<string, EaPollTarget>();
  for (const config of configs) {
    const platform = config.platform || DEFAULT_EA_PLATFORM;
    const key = pollTargetKey(config.guildId, config.clubId, platform);
    targets.set(key, {
      key,
      guildId: config.guildId,
      clubId: String(config.clubId),
      platform,
      clubName: config.clubName,
      channelId: config.channelId ?? null,
      matchTypes: Array.isArray(config.matchTypes) && config.matchTypes.length ? config.matchTypes : DEFAULT_EA_MATCH_TYPES,
      pollIntervalSec: clampPollInterval(config.pollIntervalSec),
      lastMatchId: config.lastMatchId ?? null,
      lastPolledAt: config.lastPolledAt ?? null,
      elo: config.elo ?? DEFAULT_ELO,
      isPrimary: true,
      trackedClubId: null,
    });
  }
  for (const club of trackedClubs) {
    const platform = club.platform || DEFAULT_EA_PLATFORM;
    const key = pollTargetKey(club.guildId, club.clubId, platform);
    const primary = targets.get(key);
    if (primary) {
      // Same club as the primary: poll it once. Settings come from the primary
      // config; the tracked row's Elo/state is kept in sync on every poll.
      primary.trackedClubId = club.id;
      primary.channelId = primary.channelId || club.channelId || null;
      primary.lastMatchId = primary.lastMatchId || club.lastMatchId || null;
      primary.elo = club.elo ?? primary.elo;
      continue;
    }
    targets.set(key, {
      key,
      guildId: club.guildId,
      clubId: String(club.clubId),
      platform,
      clubName: club.clubName,
      channelId: club.channelId ?? null,
      matchTypes: DEFAULT_EA_MATCH_TYPES,
      pollIntervalSec: intervalByGuild.get(club.guildId) ?? 90,
      lastMatchId: club.lastMatchId ?? null,
      lastPolledAt: club.lastPolledAt ?? null,
      elo: club.elo ?? DEFAULT_ELO,
      isPrimary: false,
      trackedClubId: club.id,
    });
  }
  return Array.from(targets.values());
}

/** true when the target's own poll interval has elapsed (small tolerance for tick jitter). */
export function isPollDue(target: Pick<EaPollTarget, 'lastPolledAt' | 'pollIntervalSec'>, now = Date.now()): boolean {
  if (!target.lastPolledAt) return true;
  const elapsed = now - new Date(target.lastPolledAt).getTime();
  return elapsed >= target.pollIntervalSec * 1000 - 5000;
}

@Injectable()
export class EaPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EaPollerService.name);
  private pollInterval: NodeJS.Timeout | null = null;
  private bootTimeout: NodeJS.Timeout | null = null;
  private isPolling = false;
  /** Targets being polled right now (scheduled tick or manual poll-now). */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eaService: EaService,
    @Inject(forwardRef(() => DiscordService))
    private readonly discordService: DiscordService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.startPolling();
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }

  private startPolling(): void {
    // Initial delay of 15 seconds after boot to let Discord client connect
    this.bootTimeout = setTimeout(() => {
      this.pollAllGuilds().catch((err) =>
        this.logger.error(`Initial EA poll failed: ${err.message}`),
      );
    }, 15000);

    // Base tick; each club is only polled once its own pollIntervalSec elapsed.
    this.pollInterval = setInterval(() => {
      this.pollAllGuilds().catch((err) =>
        this.logger.error(`Periodic EA poll failed: ${err.message}`),
      );
    }, EA_POLL_BASE_TICK_SEC * 1000);

    this.logger.log(
      `EA SPORTS FC 27 Pro Clubs match poller initialized (${EA_POLL_BASE_TICK_SEC}s tick, per-club intervals).`,
    );
  }

  private stopPolling(): void {
    if (this.bootTimeout) {
      clearTimeout(this.bootTimeout);
      this.bootTimeout = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.logger.log('EA SPORTS FC 27 Pro Clubs match poller stopped.');
    }
  }

  /** Active poll targets, optionally for one guild (manual poll ignores the primary's enabled flag). */
  async loadPollTargets(guildId?: string, options: { includeDisabledPrimary?: boolean } = {}): Promise<EaPollTarget[]> {
    const guildFilter = guildId ? { guildId } : {};
    const [allConfigs, trackedClubs] = await Promise.all([
      this.prisma.clubTrackerConfig.findMany({ where: guildFilter }),
      this.prisma.trackedClub.findMany({
        where: { ...guildFilter, enabled: true, channelId: { not: null } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const configs = allConfigs.filter(
      (c: any) => c.channelId && (c.enabled || options.includeDisabledPrimary),
    );
    return buildPollTargets(configs, trackedClubs, allConfigs);
  }

  async pollAllGuilds(): Promise<void> {
    if (this.isPolling) {
      this.logger.debug('EA poll already in progress, skipping tick.');
      return;
    }

    this.isPolling = true;
    try {
      const targets = await this.loadPollTargets();
      const now = Date.now();
      for (const target of targets) {
        if (!isPollDue(target, now)) continue;
        if (!this.discordService.isInGuild(target.guildId)) continue;
        try {
          await this.pollClub(target);
        } catch (err: any) {
          this.logger.error(
            `Error polling EA club ${target.clubName} (${target.clubId}) for guild ${target.guildId}: ${err?.message || err}`,
          );
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Manual "check now" for one guild: polls its primary and tracked clubs
   * regardless of their interval. Kept with the (config) signature used by
   * the poll-now endpoint.
   */
  async pollGuild(config: { guildId: string }): Promise<{ postedCount: number; latestMatch?: ParsedEaMatch }> {
    const targets = await this.loadPollTargets(config.guildId, { includeDisabledPrimary: true });
    let postedCount = 0;
    let latestMatch: ParsedEaMatch | undefined;
    let lastError: unknown = null;
    let failures = 0;
    for (const target of targets) {
      try {
        const result = await this.pollClub(target);
        postedCount += result.postedCount;
        if (target.isPrimary || !latestMatch) latestMatch = result.latestMatch ?? latestMatch;
      } catch (err: any) {
        failures++;
        lastError = err;
        this.logger.error(`Manual EA poll of club ${target.clubId} failed: ${err?.message || err}`);
      }
    }
    // Report an outage instead of "no new matches" when nothing could be checked.
    if (targets.length > 0 && failures === targets.length) throw lastError;
    return { postedCount, latestMatch };
  }

  /**
   * The single poll path for every tracked club (primary or not):
   * retry unsent posts, fetch recent matches, record each new one once,
   * update Elo, post to Discord and advance the checkpoint.
   */
  async pollClub(target: EaPollTarget): Promise<{ postedCount: number; latestMatch?: ParsedEaMatch }> {
    if (this.inFlight.has(target.key)) return { postedCount: 0 };
    this.inFlight.add(target.key);
    let elo = target.elo;
    let lastMatchId = target.lastMatchId;
    try {
      let postedCount = await this.retryPendingPosts(target);

      const raws = await this.eaService.fetchRecentMatches(target, target.matchTypes, EA_POLL_MATCH_WINDOW);
      if (raws.length === 0) return { postedCount };

      const latestRaw = raws[0];
      const latestMatch = this.eaService.parseMatch(latestRaw, target.clubId);

      if (!target.lastMatchId) {
        // First poll of this club (or after it changed): record everything that
        // is visible now as history without posting, so setup never spams the
        // channel with old matches on the next tick.
        this.logger.log(`Setting initial EA checkpoint for ${target.key} to match ${latestRaw.matchId}`);
        for (const raw of raws) {
          const parsed = this.eaService.parseMatch(raw, target.clubId);
          const { created } = await this.eaService.recordProcessed({
            guildId: target.guildId,
            clubId: target.clubId,
            raw,
            parsed,
            channelId: target.channelId,
            postPending: false,
          });
          if (created) await this.eaService.recordMatchPlayerStats(String(raw.matchId), target.clubId, raw);
        }
        lastMatchId = String(latestRaw.matchId);
        return { postedCount, latestMatch };
      }

      const webUrl = buildClubWebUrl(this.configService.frontendUrl, target.guildId);
      // Oldest first, so Discord shows them in the order they were played.
      for (const raw of [...raws].reverse()) {
        const parsed = this.eaService.parseMatch(raw, target.clubId);
        const { created, record } = await this.eaService.recordProcessed({
          guildId: target.guildId,
          clubId: target.clubId,
          raw,
          parsed,
          channelId: target.channelId,
          postPending: true,
        });
        if (!created) continue;

        await this.eaService.recordMatchPlayerStats(String(raw.matchId), target.clubId, raw);

        const opponentElo = await this.eaService.getClubElo(target.guildId, parsed.opponentClub.id);
        elo = computeElo(elo, opponentElo, outcomeScore(parsed.outcome));

        if (await this.sendRecord(record, parsed, target.channelId, webUrl)) postedCount++;
      }

      lastMatchId = String(latestRaw.matchId);
      return { postedCount, latestMatch };
    } finally {
      this.inFlight.delete(target.key);
      await this.saveTargetState(target, { lastMatchId, elo }).catch((err) =>
        this.logger.error(`Failed to save EA poll state for ${target.key}: ${err?.message || err}`),
      );
    }
  }

  /** Post one recorded match. Marks it posted only after Discord accepted it. */
  private async sendRecord(
    record: { id: string; postAttempts?: number } | null,
    parsed: ParsedEaMatch,
    channelId: string | null,
    webUrl: string,
  ): Promise<boolean> {
    if (!record) return false;
    try {
      if (!channelId) throw new Error('No Discord channel configured');
      const { embed, row } = buildEaMatchEmbed(parsed, webUrl);
      const sent = await this.discordService.sendMessageToChannel(channelId, embed, [row]);
      await this.prisma.processedEaMatch.update({
        where: { id: record.id },
        data: {
          postPending: false,
          discordMessageId: sent?.id || null,
          channelId,
          postAttempts: { increment: 1 },
          postError: null,
        },
      });
      this.logger.log(`Posted EA match ${parsed.matchId} (${parsed.outcome}) to Discord channel ${channelId}`);
      return true;
    } catch (err: any) {
      const message = String(err?.message || err).slice(0, 500);
      this.logger.error(`Failed to send EA match ${parsed.matchId} to channel ${channelId}: ${message}`);
      await this.prisma.processedEaMatch
        .update({
          where: { id: record.id },
          data: { postAttempts: { increment: 1 }, postError: message },
        })
        .catch(() => undefined);
      return false;
    }
  }

  /** Re-send matches whose Discord post failed earlier (bounded attempts and age). */
  private async retryPendingPosts(target: EaPollTarget): Promise<number> {
    const pending = await this.prisma.processedEaMatch.findMany({
      where: {
        guildId: target.guildId,
        clubId: target.clubId,
        postPending: true,
        postAttempts: { lt: EA_MAX_POST_ATTEMPTS },
        createdAt: { gte: new Date(Date.now() - EA_POST_RETRY_WINDOW_MS) },
      },
      orderBy: { timestamp: 'asc' },
    });
    if (pending.length === 0) return 0;

    const webUrl = buildClubWebUrl(this.configService.frontendUrl, target.guildId);
    let posted = 0;
    for (const record of pending) {
      const raw = record.rawPayload as unknown as EaRawMatch | null;
      if (!raw || typeof raw !== 'object') continue;
      const parsed = this.eaService.parseMatch(raw, target.clubId);
      if (await this.sendRecord(record, parsed, target.channelId || record.channelId, webUrl)) posted++;
    }
    return posted;
  }

  /**
   * Persist checkpoint, poll time and Elo on the rows behind the target. The
   * where clause includes the club, so a poll that raced with a change of the
   * primary club cannot write the old club's checkpoint into the new config.
   */
  private async saveTargetState(target: EaPollTarget, state: { lastMatchId: string | null; elo: number }) {
    const data = {
      lastPolledAt: new Date(),
      ...(state.lastMatchId ? { lastMatchId: state.lastMatchId } : {}),
      elo: state.elo,
    };
    target.lastPolledAt = data.lastPolledAt;
    target.lastMatchId = state.lastMatchId;
    target.elo = state.elo;
    if (target.isPrimary) {
      await this.prisma.clubTrackerConfig.updateMany({
        where: { guildId: target.guildId, clubId: target.clubId, platform: target.platform },
        data,
      });
    }
    if (target.trackedClubId) {
      await this.prisma.trackedClub.updateMany({
        where: { id: target.trackedClubId, clubId: target.clubId, platform: target.platform },
        data,
      });
    }
  }

  async postLatestMatch(
    guildId: string,
    targetChannelId?: string,
  ): Promise<{ success: boolean; match?: ParsedEaMatch; error?: string }> {
    const config = await this.eaService.getOrCreateTrackerConfig(guildId);
    const channelId = targetChannelId || config.channelId;

    if (!channelId) {
      return {
        success: false,
        error: 'No target Discord channel configured. Please select a channel first.',
      };
    }

    let raws: EaRawMatch[];
    try {
      raws = await this.eaService.fetchRecentMatches(config, config.matchTypes, EA_POLL_MATCH_WINDOW);
    } catch {
      raws = [];
    }

    if (raws.length === 0) {
      return {
        success: false,
        error: `No recent matches found for club "${config.clubName}" (ID: ${config.clubId}).`,
      };
    }

    const latest = raws[0];
    const parsed = this.eaService.parseMatch(latest, config.clubId);
    const webUrl = buildClubWebUrl(this.configService.frontendUrl, guildId);
    const { embed, row } = buildEaMatchEmbed(parsed, webUrl);

    const sent = await this.discordService.sendMessageToChannel(channelId, embed, [row]);

    // Record as processed (the poller must not post it again).
    const { created, record } = await this.eaService.recordProcessed({
      guildId,
      clubId: config.clubId,
      raw: latest,
      parsed,
      channelId,
      postPending: false,
      discordMessageId: sent?.id || null,
    });
    if (!created && record?.postPending) {
      await this.prisma.processedEaMatch.update({
        where: { id: record.id },
        data: { postPending: false, discordMessageId: sent?.id || null, channelId, postError: null },
      });
    }
    if (created) {
      await this.eaService.recordMatchPlayerStats(String(latest.matchId), config.clubId, latest);
      // The poller will skip this match now, so apply its Elo change here.
      const [own, opponent] = await Promise.all([
        this.eaService.getClubElo(guildId, config.clubId),
        this.eaService.getClubElo(guildId, parsed.opponentClub.id),
      ]);
      const elo = computeElo(own, opponent, outcomeScore(parsed.outcome));
      await this.prisma.clubTrackerConfig.updateMany({ where: { guildId, clubId: config.clubId }, data: { elo } });
      await this.prisma.trackedClub.updateMany({
        where: { guildId, clubId: config.clubId, platform: config.platform },
        data: { elo },
      });
    }

    await this.prisma.clubTrackerConfig.updateMany({
      where: { guildId, clubId: config.clubId },
      data: {
        lastMatchId: String(latest.matchId),
        lastPolledAt: new Date(),
      },
    });

    return { success: true, match: parsed };
  }

  /** Daily retention: keep processed-match rows but drop their raw EA payload after 30 days. */
  @Cron('0 15 4 * * *', { name: 'ea-raw-payload-retention', timeZone: 'Europe/Bucharest' })
  async pruneRawPayloads(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - EA_RAW_PAYLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    try {
      const count = await this.prisma.$executeRaw`
        UPDATE "processed_ea_matches" SET "raw_payload" = NULL
        WHERE "created_at" < ${cutoff} AND "raw_payload" IS NOT NULL`;
      if (count > 0) this.logger.log(`Cleared raw EA payload of ${count} processed match(es) older than ${EA_RAW_PAYLOAD_RETENTION_DAYS} days.`);
      return count;
    } catch (err: any) {
      this.logger.error(`EA raw payload retention failed: ${err?.message || err}`);
      return 0;
    }
  }
}
