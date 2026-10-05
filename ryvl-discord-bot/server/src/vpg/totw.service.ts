import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import { TotwRendererService, TotwPositionsMap, TotwPlayer } from './totw-renderer.service';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { VpgService } from './vpg.service';

const POSITIONS = ['gk', 'cb', 'cdm', 'cam', 'wingers', 'strikers'];
const LEADERBOARD_NAMES: Record<string, string> = {
  gk: 'top_gk',
  cb: 'top_cb',
  cdm: 'top_cdm',
  cam: 'top_cam',
  wingers: 'top_wingers',
  strikers: 'top_strikers',
};
const POS_PRIORITY: Record<string, number> = {
  gk: 0,
  cb: 1,
  cdm: 2,
  cam: 3,
  wingers: 4,
  strikers: 5,
};

@Injectable()
export class TotwService {
  private readonly logger = new Logger(TotwService.name);
  private readonly baseUrl = 'https://api.virtualprogaming.com/public/leagues';

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: TotwRendererService,
    @Inject(forwardRef(() => DiscordService))
    private readonly discordService: DiscordService,
    private readonly vpgService: VpgService,
  ) {}

  /**
   * Stores who made a posted weekly Team of the Week, replacing any earlier record of
   * the same week. Superliga MVP uses the count as its tiebreaker.
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

  async getOrCreateConfig(guildId: string, leagueSlug = 'Superliga-Romania') {
    const existing = await this.prisma.totwConfig.findUnique({
      where: {
        guildId_leagueSlug: { guildId, leagueSlug },
      },
    });
    if (existing) return existing;

    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });

    return this.prisma.totwConfig.create({
      data: {
        guildId,
        leagueSlug,
        communitySlug: 'VPGRoPS5',
        channelId: guild?.defaultChannelId || null,
        formation: '3-5-2',
        cronSchedule: '0 20 * * 6', // Saturdays at 20:00 Romania time
        enabled: true,
      },
    });
  }

  async updateConfig(
    guildId: string,
    leagueSlug: string,
    data: { channelId?: string | null; formation?: string; enabled?: boolean; cronSchedule?: string },
  ) {
    return this.prisma.totwConfig.upsert({
      where: {
        guildId_leagueSlug: { guildId, leagueSlug },
      },
      update: {
        ...(data.channelId !== undefined ? { channelId: data.channelId } : {}),
        ...(data.formation ? { formation: data.formation } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.cronSchedule !== undefined ? { cronSchedule: data.cronSchedule } : {}),
      },
      create: {
        guildId,
        leagueSlug,
        communitySlug: 'VPGRoPS5',
        channelId: data.channelId || null,
        formation: data.formation || '3-5-2',
        cronSchedule: data.cronSchedule || '0 20 * * 6',
        enabled: data.enabled !== undefined ? data.enabled : true,
      },
    });
  }

  async fetchLeagueSeasons(slug: string): Promise<number[]> {
    try {
      const res = await fetch(`${this.baseUrl}/${slug}/seasons/`, {
        headers: { 'User-Agent': 'RYVLBot/2.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [1];
      const data = await res.json();
      const arr = Array.isArray(data) ? data.map(Number).sort((a, b) => b - a) : [1];
      return arr.length ? arr : [1];
    } catch {
      return [1];
    }
  }

  async fetchLeaderboard(slug: string, position: string, season: number, weekly: boolean) {
    const lbName = LEADERBOARD_NAMES[position];
    if (!lbName) return { entries: [], sessionWeek: null };
    const url = `${this.baseUrl}/${slug}/leaderboard/?leaderboard=${lbName}&weekly=${weekly}&season=${season}&limit=25&offset=0`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RYVLBot/2.0' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return { entries: [], sessionWeek: null };
      const data = await res.json();
      return {
        entries: Array.isArray(data?.data) ? data.data : [],
        sessionWeek: data?.week ?? null,
      };
    } catch (e: any) {
      this.logger.warn(`Failed to fetch leaderboard ${position} for ${slug}: ${e.message}`);
      return { entries: [], sessionWeek: null };
    }
  }

  resolvePositions(leaderboards: Record<string, any[]>): TotwPositionsMap {
    // Phase 1: determine each player's highest ranked role
    const bestFor = new Map<string, { pos: string; rank: number; player: any }>();

    for (const pos of POSITIONS) {
      const list = leaderboards[pos] || [];
      list.forEach((p, idx) => {
        const rank = idx + 1;
        const username = p.username || p.player_name || `player_${idx}`;
        const existing = bestFor.get(username);
        if (
          !existing ||
          rank < existing.rank ||
          (rank === existing.rank && (POS_PRIORITY[pos] || 0) > (POS_PRIORITY[existing.pos] || 0))
        ) {
          bestFor.set(username, { pos, rank, player: p });
        }
      });
    }

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

    const VPG_CDN = 'https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw';

    const buildAvatarUrl = (raw: any): string | undefined => {
      const av = raw.user_avatar || raw.avatar_url || raw.avatar || raw.player_avatar || raw.photo;
      if (!av) return undefined;
      if (typeof av === 'string' && (av.startsWith('http://') || av.startsWith('https://'))) {
        return av;
      }
      return `${VPG_CDN}/${av}/public`;
    };

    const mapToPlayer = (raw: any): TotwPlayer => ({
      username: raw.username || raw.player_name || 'Player',
      display_name: raw.display_name || raw.username || raw.player_name,
      team_name: raw.team_name || raw.team || '',
      team_logo: raw.team_logo || null,
      avatar_url: buildAvatarUrl(raw),
      rating: raw.rating || raw.avg_rating || null,
      goals: Number(raw.goals || 0),
      assists: Number(raw.assists || 0),
      clean_sheets: Number(raw.clean_sheets || 0),
      matches_played: Number(raw.matches_played || 0),
    });

    const fillSlot = (slotKey: keyof TotwPositionsMap, sourcePos: string, count: number) => {
      const list = leaderboards[sourcePos] || [];
      if (!result[slotKey]) result[slotKey] = [];
      const slot = result[slotKey]!;
      for (const p of list) {
        if (slot.length >= count) break;
        const u = p.username || p.player_name;
        if (used.has(u)) continue;

        const best = bestFor.get(u);
        if (!best || best.pos === sourcePos || slot.length < count) {
          used.add(u);
          slot.push(mapToPlayer(p));
        }
      }
    };

    // Phase 2: greedy allocation for standard 3-4-3 formation
    fillSlot('gk', 'gk', 1);
    fillSlot('cb', 'cb', 3);
    fillSlot('cdm', 'cdm', 2);
    fillSlot('cam', 'cam', 1);
    fillSlot('lm', 'wingers', 1);
    fillSlot('rm', 'wingers', 1);
    fillSlot('st', 'strikers', 2);

    return result;
  }

  async generateTotw(slug = 'Superliga-Romania', isTots = false) {
    const seasons = await this.fetchLeagueSeasons(slug);
    const season = seasons[0] || 1;
    const weekly = !isTots;

    const lbResults = await Promise.all(
      POSITIONS.map((pos) => this.fetchLeaderboard(slug, pos, season, weekly)),
    );

    const leaderboards: Record<string, any[]> = {};
    let sessionWeek: number | null = null;

    POSITIONS.forEach((pos, idx) => {
      leaderboards[pos] = lbResults[idx].entries;
      if (sessionWeek === null && lbResults[idx].sessionWeek != null) {
        sessionWeek = lbResults[idx].sessionWeek;
      }
    });

    const week = weekly
      ? sessionWeek != null
        ? Math.max(1, Math.ceil(sessionWeek / 2))
        : null
      : null;

    const players = this.resolvePositions(leaderboards);

    const leagueDisplayName =
      slug === 'Superliga-Romania'
        ? 'Superliga România'
        : slug.replace(/-/g, ' ');

    const imageBuffer = await this.renderer.renderPng({
      leagueName: leagueDisplayName,
      season,
      week,
      isTots,
      players,
      accentColor: isTots ? '#FFB800' : '#00E5FF',
    });

    return {
      leagueName: leagueDisplayName,
      season,
      week,
      isTots,
      players,
      imageBuffer,
    };
  }

  async postTotwToDiscord(guildId: string, channelId?: string, isTots = false) {
    const config = await this.getOrCreateConfig(guildId);
    const targetChannelId = channelId || config.channelId;

    if (!targetChannelId) {
      throw new NotFoundException('No channel configured for Team of the Week announcements.');
    }

    const totwData = await this.generateTotw(config.leagueSlug, isTots);

    const title = isTots
      ? `🌟 TEAM OF THE SEASON — ${totwData.leagueName}`
      : `⭐ TEAM OF THE WEEK — ${totwData.leagueName}`;

    const subtitle = [
      `**Season ${totwData.season}**`,
      totwData.week ? `**Week ${totwData.week}**` : null,
    ]
      .filter(Boolean)
      .join(' • ');

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(isTots ? 0xffc107 : 0x00e5ff)
      .setDescription(
        `${subtitle}\n\nHere is the official **Top 11** lineup selected based on verified performance metrics from the VPG ${totwData.leagueName} platform.`,
      )
      .setImage('attachment://totw.png')
      .setFooter({ text: 'RYVL Esports • VPG Team of the Week' });

    const message = await this.discordService.sendImageMessageToChannel(
      targetChannelId,
      totwData.imageBuffer,
      'totw.png',
    );

    if (!isTots) {
      await this.recordWeeklySelections(config.leagueSlug, totwData.season, totwData.week, totwData.players).catch((err: any) =>
        this.logger.warn(`Could not record TOTW selections: ${err.message}`),
      );
    }

    return {
      success: true,
      messageId: message.id,
      channelId: targetChannelId,
      season: totwData.season,
      week: totwData.week,
    };
  }

  @Cron('0 20 * * 6', { name: 'totw-weekly-publisher', timeZone: 'Europe/Bucharest' })
  async handleWeeklyTotwPublish(): Promise<void> {
    this.logger.log('Executing weekly Team of the Week publisher (Saturday 20:00 Romania)...');
    try {
      const activeConfigs = await this.prisma.totwConfig.findMany({
        where: { enabled: true, channelId: { not: null } },
      });
      for (const config of activeConfigs) {
        if (!config.channelId) continue;
        try {
          await this.postTotwToDiscord(config.guildId, config.channelId, false);
          this.logger.log(`Posted weekly TOTW for guild ${config.guildId} to channel ${config.channelId}`);
        } catch (err: any) {
          this.logger.warn(`Failed posting weekly TOTW for guild ${config.guildId}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in weekly TOTW publisher: ${err.message}`);
    }
  }
}

