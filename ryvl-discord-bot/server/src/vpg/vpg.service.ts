import { isRyvlTeam, isRyvlMatch, isRyvlSide, resolveRyvlIdentity, fixturesOnDay, romaniaClock } from './notification-policy';
import { collectPages, completedResult } from './notification-delivery';
import { COMMUNITY_NAME, COMMUNITY_SLUG, SUPERLIGA_LEAGUE_SLUG, SUPERLIGA_NAME } from './league.constants';
import { TtlCache } from './ttl-cache';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  VpgMovementRaw,
  VpgMovementResponse,
  VpgCommunityInfo,
  VpgPlayerContract,
  VpgTransferItem,
  UpdateVpgConfigDto,
  VpgStandingsRow,
  VpgMatchItem,
  VpgLeaderboardEntry,
  RyvlPerformanceStats,
  RyvlPerformanceResponse,
  RyvlCompetitionDto,
  VpgTeamSummary,
  VpgTeamProfile,
} from './vpg.types';

export const VPG_LEAGUE_CACHE_TTL_MS = 45 * 1000;

export type VpgLeaderboardCategory = 'strikers' | 'cam' | 'gk' | 'cb' | 'cdm' | 'wingers';
const LEADERBOARD_NAMES: Record<VpgLeaderboardCategory, string> = {
  strikers: 'top_strikers',
  cam: 'top_cam',
  gk: 'top_gk',
  cb: 'top_cb',
  cdm: 'top_cdm',
  wingers: 'top_wingers',
};

@Injectable()
export class VpgService {
  private readonly logger = new Logger(VpgService.name);

  private readonly API_BASE = 'https://api.virtualprogaming.com/public';
  private readonly COMMUNITY_SLUG = COMMUNITY_SLUG;
  private readonly VPG_CDN = 'https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw';

  private readonly communityIdCache = new Map<string, number>();
  // A player's club history rarely changes; keep it for hours, not forever.
  private readonly historyCache = new TtlCache<string[]>(6 * 60 * 60 * 1000, 2000);
  // League data shared by the notification poller, MVP sync, TOTW and the public site.
  // Short enough that a new result shows up within a minute.
  private readonly leagueCache = new TtlCache<unknown>(VPG_LEAGUE_CACHE_TTL_MS, 500);
  private cachedCommunities: { list: Array<{ id: string | number; name: string; slug: string; logo?: string }>; timestamp: number } | null = null;
  private readonly communityLeaguesCache = new Map<string, { list: any[]; timestamp: number }>();

  constructor(private readonly prisma: PrismaService) {}

  buildLogoUrl(logoId?: string | null): string | null {
    if (!logoId) return null;
    return `${this.VPG_CDN}/${logoId}/xlThumb`;
  }

  formatFee(amount?: number | null): string {
    if (!amount || amount <= 0) return 'Free Transfer';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  formatDateEn(isoDate: string): string {
    try {
      const d = new Date(isoDate);
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Bucharest',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d);

      const day = parts.find((p) => p.type === 'day')?.value || '';
      const month = parts.find((p) => p.type === 'month')?.value || '';
      const year = parts.find((p) => p.type === 'year')?.value || '';
      const hour = parts.find((p) => p.type === 'hour')?.value || '';
      const minute = parts.find((p) => p.type === 'minute')?.value || '';

      return `${day} ${month} ${year}, ${hour}:${minute} Bucharest Time`;
    } catch {
      return isoDate;
    }
  }

  formatDateRo(dateStr: string): string {
    try {
      const formatted = new Date(dateStr).toLocaleString('ro-RO', {
        timeZone: 'Europe/Bucharest',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      return `${formatted} (ora României)`;
    } catch {
      return dateStr;
    }
  }

  async ensureCommunityId(communitySlug = this.COMMUNITY_SLUG): Promise<number> {
    const slug = communitySlug || this.COMMUNITY_SLUG;
    if (this.communityIdCache.has(slug)) return this.communityIdCache.get(slug)!;
    try {
      const res = await fetch(`${this.API_BASE}/communities/${encodeURIComponent(slug)}/`, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'RYVLBot/2.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as VpgCommunityInfo;
      this.communityIdCache.set(slug, data.id);
      this.logger.log(`Resolved VPG community ${slug} id: ${data.id}`);
      return data.id;
    } catch (err: any) {
      this.logger.warn(`Failed to fetch community ID for ${slug}: ${err.message}`);
      return 0;
    }
  }

  async fetchRawMovements(limit = 15, offset = 0, communitySlug = this.COMMUNITY_SLUG): Promise<VpgMovementRaw[]> {
    const slug = communitySlug || this.COMMUNITY_SLUG;
    const url = `${this.API_BASE}/communities/${encodeURIComponent(slug)}/movement/?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'RYVLBot/2.0' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching VPG movements`);
    }
    const json = (await res.json()) as VpgMovementResponse;
    return Array.isArray(json.data) ? json.data : [];
  }

  async fetchPlayerSuperligaHistory(username: string, communitySlug = this.COMMUNITY_SLUG): Promise<string[]> {
    const trimmed = (username || '').trim();
    if (!trimmed) return [];

    const slug = communitySlug || this.COMMUNITY_SLUG;
    try {
      return await this.historyCache.getOrLoad(`${slug}:${trimmed}`, async () => {
        const communityId = await this.ensureCommunityId(slug);
        // Unknown community: do not cache an empty history for hours.
        if (!communityId) throw new Error(`community ${slug} could not be resolved`);
        const url = `${this.API_BASE}/users/${encodeURIComponent(trimmed)}/contracts/`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: { 'User-Agent': 'RYVLBot/2.0' },
        });
        // A missing profile is an answer; a server error is retried next time.
        if (res.status === 404) return [];
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list: VpgPlayerContract[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
          ? data.data
          : [];

        const names: string[] = [];
        for (const contract of list) {
          const teamName = contract.team_name?.trim();
          if (contract.community_id === communityId && teamName && !names.includes(teamName)) {
            names.push(teamName);
          }
        }
        return names;
      });
    } catch (err: any) {
      this.logger.warn(`Could not fetch contract history for ${trimmed}: ${err.message}`);
      return [];
    }
  }

  async enrichTransfer(raw: VpgMovementRaw, communitySlug = this.COMMUNITY_SLUG): Promise<VpgTransferItem> {
    const username = (raw.username || '').trim();
    const superligaClubs = await this.fetchPlayerSuperligaHistory(username, communitySlug);

    return {
      id: raw.id,
      username: username || 'Unknown Player',
      fromName: raw.from_name?.trim() || 'Free Agent',
      fromSlug: raw.from_slug,
      fromLogoUrl: this.buildLogoUrl(raw.from_logo),
      toName: raw.to_name?.trim() || 'Free Agent',
      toSlug: raw.to_slug,
      toLogoUrl: this.buildLogoUrl(raw.to_logo),
      amount: raw.amount || 0,
      amountFormatted: this.formatFee(raw.amount),
      datetime: raw.datetime,
      dateFormattedRo: this.formatDateRo(raw.datetime),
      superligaClubs,
    };
  }

  async fetchTransfers(limit = 15, offset = 0, communitySlug = this.COMMUNITY_SLUG): Promise<VpgTransferItem[]> {
    const rawList = await this.fetchRawMovements(limit, offset, communitySlug);
    rawList.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());

    const enriched = await Promise.all(rawList.map((item) => this.enrichTransfer(item, communitySlug)));
    return enriched;
  }

  async listCommunities(query?: string): Promise<Array<{ id: string | number; name: string; slug: string; logo?: string }>> {
    const now = Date.now();
    if (!this.cachedCommunities || now - this.cachedCommunities.timestamp > 3600000) {
      try {
        let all: Array<{ id: string | number; name: string; slug: string; logo?: string }> = [];
        let offset = 0;
        while (true) {
          const res = await fetch(`${this.API_BASE}/communities/?limit=50&offset=${offset}`, {
            headers: { 'User-Agent': 'RYVLBot/2.0' },
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) break;
          const data = await res.json();
          const list = Array.isArray(data) ? data : data?.data || [];
          if (!list.length) break;
          all = all.concat(
            list.map((c: any) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
              logo: c.logo || c.logo_id,
            }))
          );
          offset += list.length;
          if (list.length < 50 || all.length >= 250) break;
        }
        if (all.length > 0) {
          this.cachedCommunities = { list: all, timestamp: now };
        }
      } catch (err: any) {
        this.logger.warn(`Failed to fetch VPG communities: ${err.message}`);
      }
    }

    const communities = this.cachedCommunities?.list || [
      { id: '1', name: COMMUNITY_NAME, slug: COMMUNITY_SLUG },
      { id: '2', name: 'VPG Europe Cross-Play', slug: 'VPG-Europe' },
      { id: '3', name: 'VPG Italy', slug: 'VPG-Italy' },
      { id: '4', name: 'VPG España', slug: 'VPG-espana-ps5' },
      { id: '5', name: 'VPG Germany', slug: 'VPGGERSummer' },
      { id: '6', name: 'VPG Portugal', slug: 'VPGPortugal' },
    ];

    if (!query) return communities;
    const q = query.toLowerCase().trim();
    return communities.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q));
  }

  async listCommunityLeagues(communitySlug: string): Promise<Array<{ id: number | string; name: string; slug: string; logo?: string }>> {
    const slug = communitySlug || this.COMMUNITY_SLUG;
    const now = Date.now();
    const cached = this.communityLeaguesCache.get(slug);
    if (cached && now - cached.timestamp < 1800000) {
      return cached.list;
    }

    try {
      const res = await fetch(`${this.API_BASE}/communities/${encodeURIComponent(slug)}/leagues/`, {
        headers: { 'User-Agent': 'RYVLBot/2.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data) ? data : data?.data || [];
      const formatted = list.map((l: any) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        logo: l.logo,
      }));
      this.communityLeaguesCache.set(slug, { list: formatted, timestamp: now });
      return formatted;
    } catch (err: any) {
      this.logger.warn(`Failed to fetch leagues for community ${slug}: ${err.message}`);
      return [];
    }
  }

  async searchLeagues(query?: string): Promise<Array<{ communitySlug: string; communityName: string; leagueSlug: string; leagueName: string }>> {
    const knownLeagues: Array<{ communitySlug: string; communityName: string; leagueSlug: string; leagueName: string }> = [
      { communitySlug: COMMUNITY_SLUG, communityName: COMMUNITY_NAME, leagueSlug: SUPERLIGA_LEAGUE_SLUG, leagueName: SUPERLIGA_NAME },
      { communitySlug: COMMUNITY_SLUG, communityName: COMMUNITY_NAME, leagueSlug: 'Liga-2-Romania', leagueName: 'Liga 2 România' },
      { communitySlug: COMMUNITY_SLUG, communityName: COMMUNITY_NAME, leagueSlug: 'Cupa-Romaniei', leagueName: 'Cupa României' },
      { communitySlug: 'VPG-Europe', communityName: 'VPG Europe', leagueSlug: 'Europe-Premier', leagueName: 'Europe Premier' },
      { communitySlug: 'VPG-Europe', communityName: 'VPG Europe', leagueSlug: 'Europe-Championship', leagueName: 'Europe Championship' },
      { communitySlug: 'VPG-Europe', communityName: 'VPG Europe', leagueSlug: 'Europe-League-1', leagueName: 'Europe League 1' },
      { communitySlug: 'VPG-Europe', communityName: 'VPG Europe', leagueSlug: 'Europe-League-2', leagueName: 'Europe League 2' },
      { communitySlug: 'VPG-Italy', communityName: 'VPG Italy', leagueSlug: 'Serie-A', leagueName: 'Serie A Italy' },
      { communitySlug: 'VPG-Italy', communityName: 'VPG Italy', leagueSlug: 'Serie-B', leagueName: 'Serie B Italy' },
      { communitySlug: 'VPG-espana-ps5', communityName: 'VPG España', leagueSlug: 'La-Liga', leagueName: 'La Liga Spain' },
      { communitySlug: 'VPG-espana-ps5', communityName: 'VPG España', leagueSlug: 'Segunda-Division', leagueName: 'Segunda Division Spain' },
      { communitySlug: 'VPGGERSummer', communityName: 'VPG Germany', leagueSlug: 'Bundesliga', leagueName: 'Bundesliga Germany' },
      { communitySlug: 'VPGPortugal', communityName: 'VPG Portugal', leagueSlug: 'Liga-Portugal', leagueName: 'Primeira Liga Portugal' },
      { communitySlug: 'VPG-England', communityName: 'VPG England', leagueSlug: 'Premiership', leagueName: 'Premiership England' },
      { communitySlug: 'VPG-England', communityName: 'VPG England', leagueSlug: 'Championship', leagueName: 'Championship England' },
    ];

    // Fetch live communities without query filtering so we can search leagues within ALL communities
    const communities = await this.listCommunities();
    const topCommunities = communities.slice(0, 15);
    const liveLeagues: Array<{ communitySlug: string; communityName: string; leagueSlug: string; leagueName: string }> = [];

    await Promise.all(
      topCommunities.map(async (c) => {
        try {
          const leagues = await this.listCommunityLeagues(c.slug);
          for (const l of leagues) {
            liveLeagues.push({
              communitySlug: c.slug,
              communityName: c.name,
              leagueSlug: l.slug,
              leagueName: l.name,
            });
          }
        } catch {
          // ignore error and proceed with known list
        }
      })
    );

    // Merge and deduplicate by leagueSlug
    const map = new Map<string, { communitySlug: string; communityName: string; leagueSlug: string; leagueName: string }>();
    for (const item of [...knownLeagues, ...liveLeagues]) {
      if (!map.has(item.leagueSlug)) {
        map.set(item.leagueSlug, item);
      }
    }

    const all = Array.from(map.values());
    if (!query) {
      return all;
    }

    const q = query.toLowerCase().trim();
    return all.filter(
      (item) =>
        item.leagueName.toLowerCase().includes(q) ||
        item.leagueSlug.toLowerCase().includes(q) ||
        item.communityName.toLowerCase().includes(q) ||
        item.communitySlug.toLowerCase().includes(q)
    );
  }

  // ---------------------------------------------------------------------------
  // Database Configuration & Processed Records
  // ---------------------------------------------------------------------------

  async getOrCreateConfig(guildId: string) {
    let config = await this.prisma.vpgTransferConfig.findUnique({
      where: { guildId },
    });

    if (!config) {
      config = await this.prisma.vpgTransferConfig.create({
        data: {
          guildId,
          communitySlug: '',
          leagueSlug: '',
          leagueName: '',
          channelId: null,
          enabled: false,
          pollIntervalSec: 120,
        },
      });
    }

    return config;
  }

  async getDefaultConfig() {
    const firstConfig = await this.prisma.vpgTransferConfig.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (firstConfig) return firstConfig;

    const firstGuild = await this.prisma.guild.findFirst();
    if (firstGuild) {
      return this.getOrCreateConfig(firstGuild.id);
    }

    return {
      id: 'default',
      guildId: 'default',
      communitySlug: this.COMMUNITY_SLUG,
      leagueSlug: SUPERLIGA_LEAGUE_SLUG,
      leagueName: SUPERLIGA_NAME,
      channelId: null,
      enabled: true,
      pollIntervalSec: 120,
      lastPolledAt: null,
      lastTransferId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async updateConfig(guildId: string, dto: UpdateVpgConfigDto) {
    const current = await this.getOrCreateConfig(guildId);
    // Another community has its own transfer feed: start again from its newest transfer.
    const communityChanged = dto.communitySlug !== undefined && (dto.communitySlug || COMMUNITY_SLUG) !== (current.communitySlug || COMMUNITY_SLUG);

    if (dto.channelId !== undefined) {
      await this.prisma.guild.update({
        where: { id: guildId },
        data: { defaultTransfersChannelId: dto.channelId },
      }).catch(() => {});
    }

    return this.prisma.vpgTransferConfig.update({
      where: { guildId },
      data: {
        ...(dto.channelId !== undefined ? { channelId: dto.channelId } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.pollIntervalSec !== undefined ? { pollIntervalSec: Math.min(3600, Math.max(60, Math.round(Number(dto.pollIntervalSec)) || 120)) } : {}),
        ...(dto.communitySlug !== undefined ? { communitySlug: dto.communitySlug } : {}),
        ...(communityChanged ? { lastTransferId: null } : {}),
        ...(dto.leagueSlug !== undefined ? { leagueSlug: dto.leagueSlug } : {}),
        ...(dto.leagueName !== undefined ? { leagueName: dto.leagueName } : {}),
      },
    });
  }

  async getRecentProcessedTransfers(guildId: string, limit = 25) {
    return this.prisma.processedVpgTransfer.findMany({
      where: { guildId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
  }

  async isTransferProcessed(guildId: string, transferId: number): Promise<boolean> {
    const existing = await this.prisma.processedVpgTransfer.findUnique({
      where: {
        guildId_transferId: {
          guildId,
          transferId,
        },
      },
    });
    return !!existing;
  }

  async recordProcessedTransfer(params: {
    guildId: string;
    transferId: number;
    username: string;
    fromName?: string | null;
    fromSlug?: string | null;
    fromLogo?: string | null;
    toName?: string | null;
    toSlug?: string | null;
    toLogo?: string | null;
    amount?: number;
    occurredAt: Date;
    discordMessageId?: string | null;
    channelId?: string | null;
  }) {
    return this.prisma.processedVpgTransfer.upsert({
      where: {
        guildId_transferId: {
          guildId: params.guildId,
          transferId: params.transferId,
        },
      },
      create: {
        guildId: params.guildId,
        transferId: params.transferId,
        username: params.username,
        fromName: params.fromName,
        fromSlug: params.fromSlug,
        fromLogo: params.fromLogo,
        toName: params.toName,
        toSlug: params.toSlug,
        toLogo: params.toLogo,
        amount: params.amount || 0,
        occurredAt: params.occurredAt,
        discordMessageId: params.discordMessageId,
        channelId: params.channelId,
      },
      update: {
        discordMessageId: params.discordMessageId,
        channelId: params.channelId,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Superliga Romania Competitions, Standings, Fixtures, Results, Leaderboards
  // ---------------------------------------------------------------------------

  /** Shared, short-lived cache of league reads. Callers get their own copy of a list. */
  private cachedList<T>(key: string, load: () => Promise<T[]>): Promise<T[]> {
    return (this.leagueCache.getOrLoad(key, load) as Promise<T[]>).then((list) => list.slice());
  }

  /** Drops cached league data, e.g. before a manual "check now". */
  clearLeagueCache(): void {
    this.leagueCache.clear();
  }

  async fetchSeasons(leagueSlug = SUPERLIGA_LEAGUE_SLUG): Promise<number[]> {
    return this.cachedList(`seasons:${leagueSlug}`, async () => {
      const response = await fetch(`${this.API_BASE}/leagues/${encodeURIComponent(leagueSlug)}/seasons/`, {
        signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'RYVLBot/2.0' },
      });
      if (!response.ok) throw new Error(`VPG seasons HTTP ${response.status} for ${leagueSlug}`);
      const raw = await response.json();
      const values = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      const seasons = values.map(Number).filter((n: number) => Number.isInteger(n) && n > 0).sort((x: number, y: number) => y - x);
      if (!seasons.length) throw new Error(`No valid VPG season available for ${leagueSlug}`);
      return seasons;
    });
  }

  async fetchLatestSeason(leagueSlug = SUPERLIGA_LEAGUE_SLUG): Promise<number> {
    return (await this.fetchSeasons(leagueSlug))[0];
  }

  async fetchAllMatches(status: 'complete' | 'scheduled', season: number, leagueSlug = SUPERLIGA_LEAGUE_SLUG): Promise<VpgMatchItem[]> {
    // Fetch every page. A late result must not be dropped just because its match date is old.
    return this.cachedList(`all:${status}:${leagueSlug}:${season}`, () =>
      collectPages((limit, offset) => this.fetchMatches(status, season, limit, offset, leagueSlug)),
    );
  }

  async fetchStandings(season?: number, leagueSlug = SUPERLIGA_LEAGUE_SLUG): Promise<VpgStandingsRow[]> {
    const targetSeason = season || (await this.fetchLatestSeason(leagueSlug));
    return this.cachedList(`table:${leagueSlug}:${targetSeason}`, async () => {
      const url = `${this.API_BASE}/leagues/${encodeURIComponent(leagueSlug)}/table/?season=${targetSeason}&is_history=false`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'RYVLBot/2.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching standings`);
      const raw = await res.json();
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];

      return list.map((item: any, idx: number) => ({
        position: idx + 1,
        teamName: item.team_name || 'Unknown Team',
        teamAbbr: item.team_abbr,
        teamSlug: item.team_slug,
        teamLogoUrl: this.buildLogoUrl(item.team_logo),
        played: Number(item.played || 0),
        wins: Number(item.wins || 0),
        draws: Number(item.draws || 0),
        losses: Number(item.losses || 0),
        scoreFor: Number(item.score_for || 0),
        scoreAgainst: Number(item.score_against || 0),
        goalDifference: Number(item.goal_difference || (item.score_for - item.score_against) || 0),
        points: Number(item.points || 0),
      }));
    });
  }

  async fetchMatches(
    status: 'complete' | 'scheduled',
    season?: number,
    limit = 20,
    offset = 0,
    leagueSlug = SUPERLIGA_LEAGUE_SLUG,
  ): Promise<VpgMatchItem[]> {
    const targetSeason = season || (await this.fetchLatestSeason(leagueSlug));
    return this.cachedList(`page:${status}:${leagueSlug}:${targetSeason}:${limit}:${offset}`, async () => {
      const url = `${this.API_BASE}/leagues/${encodeURIComponent(leagueSlug)}/matches/?status=${status}&season=${targetSeason}&limit=${limit}&offset=${offset}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'RYVLBot/2.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${status} matches`);
      const json = await res.json();
      if (!Array.isArray(json?.data) && !Array.isArray(json)) throw new Error('VPG returned an invalid match page');
      const list = Array.isArray(json?.data) ? json.data : json;

      return list.map((m: any) => ({
        id: Number(m.id),
        datetime: m.datetime,
        dateFormattedRo: this.formatDateRo(m.datetime),
        dateFormattedEn: this.formatDateEn(m.datetime),
        status: m.status || status,
        matchDay: Number(m.match_day || 0),
        homeSlug: m.home_slug || null,
        awaySlug: m.away_slug || null,
        homeName: m.home_name || 'Home Team',
        awayName: m.away_name || 'Away Team',
        homeScore: m.home_score != null ? Number(m.home_score) : null,
        awayScore: m.away_score != null ? Number(m.away_score) : null,
        homeLogoUrl: this.buildLogoUrl(m.home_logo),
        awayLogoUrl: this.buildLogoUrl(m.away_logo),
      }));
    });
  }

  /**
   * Completed results, newest first. One implementation behind `/superliga results`,
   * `/live_results today`, `/ryvl results` and the public "today" endpoint.
   * `day` (YYYY-MM-DD, league time zone) keeps only that day's games; `ryvlOnly` keeps
   * only games RYVL played.
   */
  async getResults(
    opts: { leagueSlug?: string; season?: number; limit?: number; day?: string; ryvlOnly?: boolean } = {},
  ): Promise<{ season: number; leagueSlug: string; results: VpgMatchItem[] }> {
    const leagueSlug = opts.leagueSlug || SUPERLIGA_LEAGUE_SLUG;
    const season = opts.season || (await this.fetchLatestSeason(leagueSlug));
    let results = (await this.fetchAllMatches('complete', season, leagueSlug)).filter((m) => completedResult(m));
    if (opts.ryvlOnly) {
      const table = await this.fetchStandings(season, leagueSlug).catch(() => [] as VpgStandingsRow[]);
      const identity = resolveRyvlIdentity(table);
      results = results.filter((m) => isRyvlMatch(m, identity));
    }
    if (opts.day) results = fixturesOnDay(results, opts.day);
    results.sort((a, b) => Date.parse(b.datetime) - Date.parse(a.datetime) || b.id - a.id);
    return { season, leagueSlug, results: opts.limit && opts.limit > 0 ? results.slice(0, opts.limit) : results };
  }

  /** Today's date in the league time zone, as YYYY-MM-DD. */
  leagueToday(now = new Date()): string {
    return romaniaClock(now).date;
  }

  /**
   * One VPG leaderboard page, plus the VPG week it covers (weekly boards only).
   * Throws when VPG fails, so a caller can tell "no players" from "VPG is down".
   */
  async fetchLeaderboardPage(
    category: VpgLeaderboardCategory,
    season?: number,
    leagueSlug = SUPERLIGA_LEAGUE_SLUG,
    weekly = false,
  ): Promise<{ season: number; week: number | null; entries: VpgLeaderboardEntry[] }> {
    const targetSeason = season || (await this.fetchLatestSeason(leagueSlug));
    const lbName = LEADERBOARD_NAMES[category] || LEADERBOARD_NAMES.strikers;
    const page = (await this.leagueCache.getOrLoad(`lb:${leagueSlug}:${targetSeason}:${lbName}:${weekly}`, async () => {
      const url = `${this.API_BASE}/leagues/${encodeURIComponent(leagueSlug)}/leaderboard/?leaderboard=${lbName}&weekly=${weekly}&season=${targetSeason}&limit=25&offset=0`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'RYVLBot/2.0' },
      });
      if (!res.ok) throw new Error(`VPG leaderboard ${lbName} HTTP ${res.status} for ${leagueSlug}`);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      const week = json?.week != null && Number.isFinite(Number(json.week)) ? Number(json.week) : null;
      return { week, entries: list.map((entry: any, index: number) => this.mapLeaderboardEntry(entry, index)) };
    })) as { week: number | null; entries: VpgLeaderboardEntry[] };
    return { season: targetSeason, week: page.week, entries: page.entries.slice() };
  }

  private mapLeaderboardEntry(entry: any, index: number): VpgLeaderboardEntry {
    const num = (...values: unknown[]) => {
      const v = values.find((x) => x != null && x !== '');
      return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
    };
    return {
      rank: index + 1,
      username: String(entry.username || entry.player_name || '').trim(),
      displayName: entry.display_name ? String(entry.display_name).trim() : null,
      userAvatarUrl: entry.user_avatar ? `${this.VPG_CDN}/${entry.user_avatar}/public` : null,
      nationality: entry.user_nationality || 'RO',
      teamName: entry.team_name || 'Team',
      teamLogoUrl: this.buildLogoUrl(entry.team_logo),
      goals: Number(entry.goals || 0),
      assists: Number(entry.assists || 0),
      shots: num(entry.shots),
      cleanSheets: num(entry.clean_sheet, entry.clean_sheets),
      matchesPlayed: Number(entry.matches_played || 0),
      rating: num(entry.match_rating, entry.rating, entry.avg_rating),
      points: num(entry.points),
    };
  }

  /** Season leaderboard for the public site and `/superliga leaderboard`; empty when VPG fails. */
  async fetchLeaderboard(
    category: VpgLeaderboardCategory = 'strikers',
    season?: number,
    leagueSlug = SUPERLIGA_LEAGUE_SLUG,
  ): Promise<VpgLeaderboardEntry[]> {
    try {
      return (await this.fetchLeaderboardPage(category, season, leagueSlug, false)).entries;
    } catch (err: any) {
      this.logger.warn(`VPG leaderboard ${category} unavailable: ${err.message}`);
      return [];
    }
  }

  private async getJson(path: string): Promise<any> {
    const res = await fetch(`${this.API_BASE}${path}`, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'RYVLBot/2.0' },
    });
    if (!res.ok) throw new Error(`VPG HTTP ${res.status} for ${path}`);
    return res.json();
  }

  /** Teams currently in a league. The list omits the EA link; use fetchTeam for that. */
  async fetchLeagueTeams(leagueSlug = SUPERLIGA_LEAGUE_SLUG): Promise<VpgTeamSummary[]> {
    const json = await this.getJson(`/leagues/${encodeURIComponent(leagueSlug)}/teams/?limit=100&offset=0`);
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    return list
      .filter((t: any) => t && t.id != null && t.slug)
      .map((t: any) => ({ id: Number(t.id), slug: String(t.slug), name: String(t.name || t.slug), logoUrl: this.buildLogoUrl(t.logo) }));
  }

  /** A team's profile, including the FC in-game club it linked on VPG. */
  async fetchTeam(teamSlug: string): Promise<VpgTeamProfile> {
    const t = await this.getJson(`/teams/${encodeURIComponent(teamSlug)}/`);
    return {
      id: Number(t.id),
      slug: String(t.slug || teamSlug),
      name: String(t.name || teamSlug),
      logoUrl: this.buildLogoUrl(t.logo_id),
      eaClubId: t.ea_club_id != null && String(t.ea_club_id).trim() ? String(t.ea_club_id).trim() : null,
      eaClubName: t.ea_club_name ? String(t.ea_club_name) : null,
    };
  }

  /**
   * The console/EA names a VPG user linked (PSN, Xbox, EA), used to match them to EA
   * match gamertags. The profile also holds personal data, which is deliberately dropped.
   */
  async fetchUserGamertags(username: string): Promise<string[]> {
    const u = await this.getJson(`/users/${encodeURIComponent(username)}/`);
    return [u?.psn, u?.xbox, u?.origin]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim());
  }

  /** Single match, which (unlike the list endpoint) carries both team ids. */
  async fetchMatchDetail(matchId: number): Promise<{ id: number; homeTeamId: number | null; awayTeamId: number | null; season: number | null }> {
    const m = await this.getJson(`/matches/${encodeURIComponent(String(matchId))}/`);
    return {
      id: Number(m.id),
      homeTeamId: m.home_id != null ? Number(m.home_id) : null,
      awayTeamId: m.away_id != null ? Number(m.away_id) : null,
      season: m.season != null ? Number(m.season) : null,
    };
  }

  /** The guild whose settings the public site shows: RYVL_GUILD_ID, else the longest-joined guild. */
  async resolvePublicGuildId(): Promise<string | undefined> {
    const configured = process.env.RYVL_GUILD_ID?.trim();
    if (configured) return configured;
    const publicGuild = await this.prisma.guild.findFirst({ orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }] });
    return publicGuild?.id;
  }

  async getCompetitions(guildId?: string): Promise<RyvlCompetitionDto[]> {
    if (!guildId) {
      guildId = await this.resolvePublicGuildId();
    }
    if (guildId) {
      const comps = await this.prisma.ryvlCompetition.findMany({
        where: { guildId },
        orderBy: { displayOrder: 'asc' },
      });
      if (comps.length > 0) {
        return comps.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          communitySlug: c.communitySlug,
          season: c.season ?? undefined,
          active: c.active,
          displayOrder: c.displayOrder,
        }));
      }
    }

    // Default 3 competition slots (Unassigned until configured by admin)
    return [
      {
        id: 'slot-1',
        name: 'Slot 1 (Unassigned)',
        slug: '',
        communitySlug: '',
        active: false,
        displayOrder: 1,
      },
      {
        id: 'slot-2',
        name: 'Slot 2 (Unassigned)',
        slug: '',
        communitySlug: '',
        active: false,
        displayOrder: 2,
      },
      {
        id: 'slot-3',
        name: 'Slot 3 (Unassigned)',
        slug: '',
        communitySlug: '',
        active: false,
        displayOrder: 3,
      },
    ];
  }

  async upsertCompetition(guildId: string, compId: string, data: Partial<RyvlCompetitionDto>) {
    const existing = await this.prisma.ryvlCompetition.findFirst({
      where: {
        guildId,
        OR: [{ id: compId }, { slug: data.slug || '' }],
      },
    });

    if (existing) {
      return this.prisma.ryvlCompetition.update({
        where: { id: existing.id },
        data: {
          name: data.name ?? existing.name,
          slug: data.slug ?? existing.slug,
          communitySlug: data.communitySlug ?? existing.communitySlug,
          active: data.active !== undefined ? data.active : existing.active,
          season: data.season ?? existing.season,
          displayOrder: data.displayOrder ?? existing.displayOrder,
        },
      });
    }

    return this.prisma.ryvlCompetition.create({
      data: {
        guildId,
        name: data.name || 'VPG Competition',
        slug: data.slug || `competition-${Date.now()}`,
        communitySlug: data.communitySlug || COMMUNITY_SLUG,
        active: data.active ?? true,
        season: data.season,
        displayOrder: data.displayOrder ?? 1,
      },
    });
  }

  /** The RYVL competition asked for (by slug), else the guild's first active one. Throws when it is not active. */
  async resolveCompetition(guildId?: string, competitionSlug?: string): Promise<{ competitions: RyvlCompetitionDto[]; competition: RyvlCompetitionDto }> {
    const competitions = await this.getCompetitions(guildId);
    const competition = competitionSlug
      ? competitions.find((c) => c.slug === competitionSlug) || competitions[0]
      : competitions.find((c) => c.active) || competitions[0];
    if (!competition.active || !competition.slug) throw new Error('This competition is not active yet');
    return { competitions, competition };
  }

  async getRyvlPerformance(
    guildId?: string,
    competitionSlug?: string,
  ): Promise<RyvlPerformanceResponse> {
    const { competitions, competition: targetComp } = await this.resolveCompetition(guildId, competitionSlug);
    const activeSlug = targetComp.slug;
    const activeName = targetComp.name;
    const targetSeason = targetComp.season || (await this.fetchLatestSeason(activeSlug));
    const warnings: string[] = [];

    let teamName = 'RYVL Esports';
    if (guildId) {
      const g = await this.prisma.guild.findUnique({ where: { id: guildId } });
      if (g?.ryvlTeamName && isRyvlTeam(g.ryvlTeamName)) teamName = g.ryvlTeamName;
    }

    let allMatches: VpgMatchItem[] = [];
    let scheduledMatches: VpgMatchItem[] = [];
    let standings: VpgStandingsRow[] = [];

    try {
      allMatches = await this.fetchAllMatches('complete', targetSeason, activeSlug);
    } catch {
      warnings.push('Completed matches are temporarily unavailable.');
      allMatches = [];
    }

    try {
      scheduledMatches = await this.fetchAllMatches('scheduled', targetSeason, activeSlug);
    } catch {
      warnings.push('Fixtures are temporarily unavailable.');
      scheduledMatches = [];
    }

    try {
      standings = await this.fetchStandings(targetSeason, activeSlug);
    } catch {
      warnings.push('League standings are temporarily unavailable.');
      standings = [];
    }

    if (warnings.length === 3) throw new Error('VPG is temporarily unavailable. Please try again.');
    const identity = resolveRyvlIdentity(standings);
    const teamMatcher = { test: (name: string) => isRyvlTeam(name) };
    allMatches.sort((a, b) => Date.parse(b.datetime) - Date.parse(a.datetime) || b.id - a.id);
    scheduledMatches.sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime) || a.id - b.id);

    const ryvlMatches = allMatches.filter(
      (m) => isRyvlMatch(m, identity) && completedResult(m),
    );

    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    let cleanSheets = 0;

    const homeRecord = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
    const awayRecord = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };

    const streak: ('W' | 'D' | 'L')[] = [];

    for (const m of ryvlMatches) {
      const isHome = isRyvlSide(m.homeName, m.homeSlug, identity);
      const ryvlScore = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
      const oppScore = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);

      goalsFor += ryvlScore;
      goalsAgainst += oppScore;

      if (oppScore === 0) cleanSheets++;

      if (isHome) {
        homeRecord.played++;
        homeRecord.goalsFor += ryvlScore;
        homeRecord.goalsAgainst += oppScore;
      } else {
        awayRecord.played++;
        awayRecord.goalsFor += ryvlScore;
        awayRecord.goalsAgainst += oppScore;
      }

      if (ryvlScore > oppScore) {
        wins++;
        if (isHome) homeRecord.wins++;
        else awayRecord.wins++;
        if (streak.length < 5) streak.push('W');
      } else if (ryvlScore < oppScore) {
        losses++;
        if (isHome) homeRecord.losses++;
        else awayRecord.losses++;
        if (streak.length < 5) streak.push('L');
      } else {
        draws++;
        if (isHome) homeRecord.draws++;
        else awayRecord.draws++;
        if (streak.length < 5) streak.push('D');
      }
    }

    const played = ryvlMatches.length;
    const points = wins * 3 + draws * 1;
    const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;
    const goalDifference = goalsFor - goalsAgainst;
    const goalsPerMatch = played > 0 ? Number((goalsFor / played).toFixed(2)) : 0;
    const concededPerMatch = played > 0 ? Number((goalsAgainst / played).toFixed(2)) : 0;

    const standingsRow = standings.find((r) => isRyvlSide(r.teamName, r.teamSlug, identity));
    const standingsPosition = standingsRow ? standingsRow.position : null;

    const ryvlUpcoming = scheduledMatches
      .filter((m) => isRyvlMatch(m, identity))
      ;

    const stats: RyvlPerformanceStats = {
      competitionName: activeName,
      competitionSlug: activeSlug,
      played,
      wins,
      draws,
      losses,
      points,
      winRate,
      goalsFor,
      goalsAgainst,
      goalDifference,
      goalsPerMatch,
      concededPerMatch,
      cleanSheets,
      currentStreak: streak,
      homeRecord,
      awayRecord,
      standingsPosition,
      totalTeams: standings.length || null,
    };

    return {
      teamName,
      activeCompetition: activeSlug,
      competitions,
      stats,
      recentResults: ryvlMatches,
      standings,
      season: targetSeason,
      warnings,
      upcomingFixtures: ryvlUpcoming,
    };
  }
}
