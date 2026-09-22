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
} from './vpg.types';

@Injectable()
export class VpgService {
  private readonly logger = new Logger(VpgService.name);

  private readonly API_BASE = 'https://api.virtualprogaming.com/public';
  private readonly COMMUNITY_SLUG = 'VPGRoPS5';
  private readonly VPG_CDN = 'https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw';

  private cachedCommunityId: number | null = null;
  private readonly historyCache = new Map<string, string[]>();

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

  async ensureCommunityId(): Promise<number> {
    if (this.cachedCommunityId) return this.cachedCommunityId;
    try {
      const res = await fetch(`${this.API_BASE}/communities/${this.COMMUNITY_SLUG}/`, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'RYVLBot/2.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as VpgCommunityInfo;
      this.cachedCommunityId = data.id;
      this.logger.log(`Resolved VPG community ${this.COMMUNITY_SLUG} id: ${data.id}`);
      return data.id;
    } catch (err: any) {
      this.logger.warn(`Failed to fetch community ID for ${this.COMMUNITY_SLUG}: ${err.message}`);
      return 0;
    }
  }

  async fetchRawMovements(limit = 15, offset = 0): Promise<VpgMovementRaw[]> {
    const url = `${this.API_BASE}/communities/${this.COMMUNITY_SLUG}/movement/?limit=${limit}&offset=${offset}`;
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

  async fetchPlayerSuperligaHistory(username: string): Promise<string[]> {
    const trimmed = (username || '').trim();
    if (!trimmed) return [];

    if (this.historyCache.has(trimmed)) {
      return this.historyCache.get(trimmed)!;
    }

    const communityId = await this.ensureCommunityId();
    try {
      const url = `${this.API_BASE}/users/${encodeURIComponent(trimmed)}/contracts/`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'RYVLBot/2.0' },
      });
      if (!res.ok) {
        this.historyCache.set(trimmed, []);
        return [];
      }
      const data = await res.json();
      const list: VpgPlayerContract[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : [];

      const seen = new Set<string>();
      const names: string[] = [];

      for (const contract of list) {
        const teamName = contract.team_name?.trim();
        if (
          contract.community_id === communityId &&
          teamName &&
          !seen.has(teamName)
        ) {
          seen.add(teamName);
          names.push(teamName);
        }
      }

      this.historyCache.set(trimmed, names);
      return names;
    } catch (err: any) {
      this.logger.warn(`Could not fetch contract history for ${trimmed}: ${err.message}`);
      this.historyCache.set(trimmed, []);
      return [];
    }
  }

  async enrichTransfer(raw: VpgMovementRaw): Promise<VpgTransferItem> {
    const username = (raw.username || '').trim();
    const superligaClubs = await this.fetchPlayerSuperligaHistory(username);

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

  async fetchTransfers(limit = 15, offset = 0): Promise<VpgTransferItem[]> {
    const rawList = await this.fetchRawMovements(limit, offset);
    rawList.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());

    const enriched = await Promise.all(rawList.map((item) => this.enrichTransfer(item)));
    return enriched;
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
          communitySlug: this.COMMUNITY_SLUG,
          leagueSlug: 'Superliga-Romania',
          leagueName: 'Superliga România',
          enabled: true,
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
      leagueSlug: 'Superliga-Romania',
      leagueName: 'Superliga România',
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
    await this.getOrCreateConfig(guildId);

    return this.prisma.vpgTransferConfig.update({
      where: { guildId },
      data: {
        ...(dto.channelId !== undefined ? { channelId: dto.channelId } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.pollIntervalSec !== undefined ? { pollIntervalSec: dto.pollIntervalSec } : {}),
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

  async fetchSeasons(): Promise<number[]> {
    try {
      const res = await fetch(`${this.API_BASE}/leagues/Superliga-Romania/seasons/`, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'RYVLBot/2.0' },
      });
      if (!res.ok) return [2];
      const data = await res.json();
      const seasons = Array.isArray(data) ? data.map(Number).sort((a, b) => b - a) : [2];
      return seasons.length > 0 ? seasons : [2];
    } catch {
      return [2];
    }
  }

  async fetchLatestSeason(): Promise<number> {
    const seasons = await this.fetchSeasons();
    return seasons[0] || 2;
  }

  async fetchStandings(season?: number): Promise<VpgStandingsRow[]> {
    const targetSeason = season || (await this.fetchLatestSeason());
    const url = `${this.API_BASE}/leagues/Superliga-Romania/table/?season=${targetSeason}&is_history=false`;
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
  }

  async fetchMatches(
    status: 'complete' | 'scheduled',
    season?: number,
    limit = 20,
    offset = 0,
  ): Promise<VpgMatchItem[]> {
    const targetSeason = season || (await this.fetchLatestSeason());
    const url = `${this.API_BASE}/leagues/Superliga-Romania/matches/?status=${status}&season=${targetSeason}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'RYVLBot/2.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${status} matches`);
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

    return list.map((m: any) => ({
      id: Number(m.id),
      datetime: m.datetime,
      dateFormattedRo: this.formatDateRo(m.datetime),
      status: m.status || status,
      matchDay: Number(m.match_day || 0),
      homeName: m.home_name || 'Home Team',
      awayName: m.away_name || 'Away Team',
      homeScore: m.home_score != null ? Number(m.home_score) : null,
      awayScore: m.away_score != null ? Number(m.away_score) : null,
      homeLogoUrl: this.buildLogoUrl(m.home_logo),
      awayLogoUrl: this.buildLogoUrl(m.away_logo),
    }));
  }

  async fetchLeaderboard(
    category: 'strikers' | 'cam' | 'gk' | 'cb' | 'cdm' | 'wingers' = 'strikers',
    season?: number,
  ): Promise<VpgLeaderboardEntry[]> {
    const targetSeason = season || (await this.fetchLatestSeason());
    const lbNameMap: Record<string, string> = {
      strikers: 'top_strikers',
      cam: 'top_cam',
      gk: 'top_gk',
      cb: 'top_cb',
      cdm: 'top_cdm',
      wingers: 'top_wingers',
    };
    const lbName = lbNameMap[category] || 'top_strikers';
    const url = `${this.API_BASE}/leagues/Superliga-Romania/leaderboard/?leaderboard=${lbName}&weekly=false&season=${targetSeason}&limit=25&offset=0`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'RYVLBot/2.0' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : [];

    return list.map((entry: any, index: number) => ({
      rank: index + 1,
      username: (entry.username || '').trim(),
      userAvatarUrl: entry.user_avatar ? `${this.VPG_CDN}/${entry.user_avatar}/public` : null,
      nationality: entry.user_nationality || 'RO',
      teamName: entry.team_name || 'Team',
      teamLogoUrl: this.buildLogoUrl(entry.team_logo),
      goals: Number(entry.goals || 0),
      assists: Number(entry.assists || 0),
      shots: entry.shots != null ? Number(entry.shots) : null,
      cleanSheets: entry.clean_sheet != null ? Number(entry.clean_sheet) : null,
      matchesPlayed: Number(entry.matches_played || 0),
      rating: entry.match_rating != null ? Number(entry.match_rating) : null,
      points: entry.points != null ? Number(entry.points) : null,
    }));
  }

  async isMatchProcessed(guildId: string, vpgMatchId: number): Promise<boolean> {
    const existing = await this.prisma.processedVpgMatch.findUnique({
      where: {
        guildId_vpgMatchId: {
          guildId,
          vpgMatchId,
        },
      },
    });
    return !!existing;
  }

  async recordProcessedMatch(params: {
    guildId: string;
    vpgMatchId: number;
    homeName: string;
    awayName: string;
    homeScore: number;
    awayScore: number;
    matchDay?: number;
    datetime: Date;
    discordMessageId?: string | null;
    channelId?: string | null;
  }) {
    return this.prisma.processedVpgMatch.upsert({
      where: {
        guildId_vpgMatchId: {
          guildId: params.guildId,
          vpgMatchId: params.vpgMatchId,
        },
      },
      create: {
        guildId: params.guildId,
        vpgMatchId: params.vpgMatchId,
        homeName: params.homeName,
        awayName: params.awayName,
        homeScore: params.homeScore,
        awayScore: params.awayScore,
        matchDay: params.matchDay,
        datetime: params.datetime,
        discordMessageId: params.discordMessageId,
        channelId: params.channelId,
      },
      update: {
        discordMessageId: params.discordMessageId,
        channelId: params.channelId,
      },
    });
  }
}
