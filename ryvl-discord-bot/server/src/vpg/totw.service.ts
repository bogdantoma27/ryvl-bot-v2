import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChannelType } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import { TotwRendererService, TotwPositionsMap, TotwPlayer } from './totw-renderer.service';
import { VpgService, VpgLeaderboardCategory } from './vpg.service';
import { VpgLeaderboardEntry } from './vpg.types';
import { COMMUNITY_SLUG, DEFAULT_TOTW_CRON, LEAGUE_TIMEZONE, SUPERLIGA_LEAGUE_SLUG, leagueDisplayName } from './league.constants';
import { cronScheduleError, dueTotwOccurrence } from './totw-schedule';

const POSITIONS: VpgLeaderboardCategory[] = ['gk', 'cb', 'cdm', 'cam', 'wingers', 'strikers'];
// After a failed scheduled post, wait this long before trying again (within the catch-up window).
const SCHEDULED_RETRY_MS = 10 * 60 * 1000;

/**
 * VPG's weekly leaderboards report a `week` that counts match sessions, and Superliga
 * plays two sessions per calendar week, so the Team of the Week number is half of it,
 * rounded up. VPG's match list has no week field (only `match_day`, one per session),
 * so the leaderboard week is the only week source. Kept as-is so the week numbers of
 * already stored TOTW picks stay comparable.
 */
export function totwWeekFromSession(sessionWeek: number | null | undefined): number | null {
  if (sessionWeek == null || !Number.isFinite(Number(sessionWeek))) return null;
  return Math.max(1, Math.ceil(Number(sessionWeek) / 2));
}

@Injectable()
export class TotwService {
  private readonly logger = new Logger(TotwService.name);
  private scheduling = false;
  private readonly retryAfter = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: TotwRendererService,
    @Inject(forwardRef(() => DiscordService))
    private readonly discordService: DiscordService,
    private readonly vpgService: VpgService,
  ) {}

  /**
   * Stores who made a weekly Team of the Week, replacing any earlier record of the same
   * week. Superliga MVP uses the count as its tiebreaker.
   */
  async recordWeeklySelections(leagueSlug: string, season: number, week: number | null, players: TotwPositionsMap): Promise<number> {
    if (!week) {
      this.logger.warn(`TOTW for ${leagueSlug} S${season} has no week number; selections not recorded.`);
      return 0;
    }
    const rows: Array<{ vpgUsername: string; position: string; teamName: string | null }> = [];
    for (const [position, list] of Object.entries(players)) {
      for (const p of list || []) {
        if (p?.username && !rows.some((r) => r.vpgUsername === p.username)) {
          rows.push({ vpgUsername: p.username, position: position.toUpperCase(), teamName: p.team_name || null });
        }
      }
    }
    // An empty week (VPG reset the weekly boards, nobody has played yet) must not wipe a recorded one.
    if (!rows.length) return 0;
    const withNames = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        eaNames: await this.vpgService.fetchUserGamertags(r.vpgUsername).catch(() => [] as string[]),
      })),
    );
    await this.prisma.$transaction([
      this.prisma.superligaMvpTotwSelection.deleteMany({ where: { leagueSlug, season, week } }),
      this.prisma.superligaMvpTotwSelection.createMany({
        data: withNames.map((r) => ({ leagueSlug, season, week, ...r })),
        skipDuplicates: true,
      }),
    ]);
    return withNames.length;
  }

  // Unsaved defaults for a guild that never configured TOTW. Reads must not create rows,
  // and nothing is posted until an admin picks a channel and enables the schedule.
  defaultConfig(guildId: string, leagueSlug = SUPERLIGA_LEAGUE_SLUG) {
    const now = new Date();
    return {
      id: '',
      guildId,
      leagueSlug,
      communitySlug: COMMUNITY_SLUG,
      channelId: null as string | null,
      formation: '3-5-2',
      cronSchedule: DEFAULT_TOTW_CRON,
      enabled: false,
      lastPostedAt: null as Date | null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getConfig(guildId: string, leagueSlug = SUPERLIGA_LEAGUE_SLUG) {
    const existing = await this.prisma.totwConfig.findUnique({
      where: {
        guildId_leagueSlug: { guildId, leagueSlug },
      },
    });
    return existing ?? this.defaultConfig(guildId, leagueSlug);
  }

  async updateConfig(
    guildId: string,
    leagueSlug: string,
    data: { channelId?: string | null; formation?: string; enabled?: boolean; cronSchedule?: string | null },
  ) {
    let cronSchedule: string | undefined;
    if (data.cronSchedule !== undefined) {
      cronSchedule = data.cronSchedule && data.cronSchedule.trim() ? data.cronSchedule.trim().replace(/\s+/g, ' ') : DEFAULT_TOTW_CRON;
      const error = cronScheduleError(cronSchedule);
      if (error) throw new BadRequestException(error);
    }
    if (data.channelId) await this.discordService.assertChannelInGuild(guildId, data.channelId);
    return this.prisma.totwConfig.upsert({
      where: {
        guildId_leagueSlug: { guildId, leagueSlug },
      },
      update: {
        ...(data.channelId !== undefined ? { channelId: data.channelId } : {}),
        ...(data.formation ? { formation: data.formation } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(cronSchedule !== undefined ? { cronSchedule } : {}),
      },
      create: {
        guildId,
        leagueSlug,
        communitySlug: COMMUNITY_SLUG,
        channelId: data.channelId || null,
        formation: data.formation || '3-5-2',
        cronSchedule: cronSchedule || DEFAULT_TOTW_CRON,
        enabled: data.enabled !== undefined ? data.enabled : false,
      },
    });
  }

  resolvePositions(leaderboards: Record<string, VpgLeaderboardEntry[]>): TotwPositionsMap {
    const used = new Set<string>();
    const result: TotwPositionsMap = {
      gk: [],
      cb: [],
      cdm: [],
      cam: [],
      lm: [],
      rm: [],
      st: [],
    };

    const mapToPlayer = (p: VpgLeaderboardEntry): TotwPlayer => ({
      username: p.username || 'Player',
      display_name: p.displayName || p.username || 'Player',
      team_name: p.teamName || '',
      team_logo: p.teamLogoUrl || undefined,
      avatar_url: p.userAvatarUrl || undefined,
      rating: p.rating != null && p.rating > 0 ? p.rating.toFixed(1) : undefined,
      goals: Number(p.goals || 0),
      assists: Number(p.assists || 0),
      clean_sheets: Number(p.cleanSheets || 0),
      matches_played: Number(p.matchesPlayed || 0),
    });

    const fillSlot = (slotKey: keyof TotwPositionsMap, sourcePos: string, count: number) => {
      const list = leaderboards[sourcePos] || [];
      if (!result[slotKey]) result[slotKey] = [];
      const slot = result[slotKey]!;
      for (const p of list) {
        if (slot.length >= count) break;
        const u = p.username;
        if (!u || used.has(u)) continue;
        used.add(u);
        slot.push(mapToPlayer(p));
      }
    };

    // Greedy allocation for the 3-4-3 card; a player fills the first position that lists them.
    fillSlot('gk', 'gk', 1);
    fillSlot('cb', 'cb', 3);
    fillSlot('cdm', 'cdm', 2);
    fillSlot('cam', 'cam', 1);
    fillSlot('lm', 'wingers', 1);
    fillSlot('rm', 'wingers', 1);
    fillSlot('st', 'strikers', 2);

    return result;
  }

  /** The Team of the Week (or Season) line-up, without the image. Throws when VPG fails. */
  async buildTotw(slug = SUPERLIGA_LEAGUE_SLUG, isTots = false) {
    const leagueSlug = slug || SUPERLIGA_LEAGUE_SLUG;
    const season = await this.vpgService.fetchLatestSeason(leagueSlug);
    const weekly = !isTots;

    const pages = await Promise.all(
      POSITIONS.map((pos) => this.vpgService.fetchLeaderboardPage(pos, season, leagueSlug, weekly)),
    );

    const leaderboards: Record<string, VpgLeaderboardEntry[]> = {};
    let sessionWeek: number | null = null;
    POSITIONS.forEach((pos, idx) => {
      leaderboards[pos] = pages[idx].entries;
      if (sessionWeek === null && pages[idx].week != null) sessionWeek = pages[idx].week;
    });

    return {
      leagueSlug,
      leagueName: leagueDisplayName(leagueSlug),
      season,
      week: weekly ? totwWeekFromSession(sessionWeek) : null,
      isTots,
      players: this.resolvePositions(leaderboards),
    };
  }

  async generateTotw(slug = SUPERLIGA_LEAGUE_SLUG, isTots = false) {
    const data = await this.buildTotw(slug, isTots);
    const imageBuffer = await this.renderer.renderPng({
      leagueName: data.leagueName,
      season: data.season,
      week: data.week,
      isTots,
      players: data.players,
      accentColor: isTots ? '#FFB800' : '#00E5FF',
    });
    return { ...data, imageBuffer };
  }

  async postTotwToDiscord(guildId: string, channelId?: string, isTots = false, leagueSlug = SUPERLIGA_LEAGUE_SLUG) {
    const slug = leagueSlug || SUPERLIGA_LEAGUE_SLUG;
    const config = await this.prisma.totwConfig.findUnique({ where: { guildId_leagueSlug: { guildId, leagueSlug: slug } } });
    const targetChannelId = channelId || config?.channelId;

    if (!targetChannelId) {
      throw new NotFoundException('No channel configured for Team of the Week announcements.');
    }
    const channel = await this.discordService.assertChannelInGuild(guildId, targetChannelId);

    const totwData = await this.generateTotw(slug, isTots);

    const title = isTots
      ? `🌟 TEAM OF THE SEASON — ${totwData.leagueName}`
      : `⭐ TEAM OF THE WEEK — ${totwData.leagueName}`;
    const subtitle = [`Season ${totwData.season}`, totwData.week ? `Week ${totwData.week}` : null].filter(Boolean).join(' • ');

    const message = await this.discordService.sendImageMessageToChannel(
      targetChannelId,
      totwData.imageBuffer,
      'totw.png',
      `**${title}**\n${subtitle}`,
    );

    // The posted line-up is the official one, so it replaces any automatic record of the week.
    if (!isTots && slug === SUPERLIGA_LEAGUE_SLUG) {
      await this.recordWeeklySelections(slug, totwData.season, totwData.week, totwData.players).catch((err: any) =>
        this.logger.warn(`Could not record TOTW selections: ${err.message}`),
      );
    }

    return {
      success: true,
      messageId: message.id,
      channelId: targetChannelId,
      leagueSlug: slug,
      season: totwData.season,
      week: totwData.week,
    };
  }

  /**
   * Posts every enabled Team of the Week whose own schedule (cronSchedule, in the guild's
   * time zone) is due. lastPostedAt is claimed before posting, so a tick that overlaps
   * another server process or a slow post never posts the same week twice.
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'totw-scheduled-publisher' })
  async handleScheduledTotwPosts(now = new Date()): Promise<number> {
    if (this.scheduling || !this.discordService.client.isReady()) return 0;
    this.scheduling = true;
    let posted = 0;
    try {
      const configs = await this.prisma.totwConfig.findMany({
        where: { enabled: true, channelId: { not: null } },
        include: { guild: { select: { timezone: true } } },
      });
      for (const config of configs) {
        const due = dueTotwOccurrence(config.cronSchedule, config.guild?.timezone, now, config.lastPostedAt);
        if (!this.discordService.isInGuild(config.guildId)) continue;
        if (!due || (this.retryAfter.get(config.id) ?? 0) > now.getTime()) continue;
        const claimed = await this.prisma.totwConfig.updateMany({
          where: { id: config.id, OR: [{ lastPostedAt: null }, { lastPostedAt: { lt: due } }] },
          data: { lastPostedAt: now },
        });
        if (!claimed.count) continue;
        try {
          await this.postTotwToDiscord(config.guildId, config.channelId!, false, config.leagueSlug);
          this.retryAfter.delete(config.id);
          posted++;
          this.logger.log(`Posted scheduled TOTW (${config.leagueSlug}) for guild ${config.guildId} to channel ${config.channelId}`);
        } catch (err: any) {
          // Release the claim so the week is retried, unless a newer post happened meanwhile.
          await this.prisma.totwConfig.updateMany({ where: { id: config.id, lastPostedAt: now }, data: { lastPostedAt: config.lastPostedAt } });
          this.retryAfter.set(config.id, now.getTime() + SCHEDULED_RETRY_MS);
          this.logger.warn(`Failed posting scheduled TOTW (${config.leagueSlug}) for guild ${config.guildId}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in scheduled TOTW publisher: ${err.message}`);
    } finally {
      this.scheduling = false;
    }
    return posted;
  }

  /**
   * Records each week's Superliga Team of the Week picks for the Superliga Awards
   * tiebreaker, whether or not any server posts the TOTW. Runs at the default TOTW time
   * and retries hourly that evening; a week already recorded (by a post or an earlier
   * run) is left alone, since a posted line-up is the official one.
   */
  @Cron('0 20-23 * * 6', { name: 'totw-selection-recorder', timeZone: LEAGUE_TIMEZONE })
  async recordSuperligaWeek(): Promise<number> {
    try {
      const data = await this.buildTotw(SUPERLIGA_LEAGUE_SLUG, false);
      if (!data.week) {
        this.logger.warn('Weekly TOTW recorder: VPG reported no week number; nothing recorded.');
        return 0;
      }
      const existing = await this.prisma.superligaMvpTotwSelection.count({
        where: { leagueSlug: SUPERLIGA_LEAGUE_SLUG, season: data.season, week: data.week },
      });
      if (existing) return 0;
      const count = await this.recordWeeklySelections(SUPERLIGA_LEAGUE_SLUG, data.season, data.week, data.players);
      if (count) this.logger.log(`Recorded ${count} Superliga TOTW picks for S${data.season} week ${data.week}.`);
      return count;
    } catch (err: any) {
      this.logger.warn(`Weekly TOTW recorder failed: ${err.message}`);
      return 0;
    }
  }
}
