import { isRyvlTeam, isRyvlMatch, isRyvlSide, resolveRyvlIdentity } from './notification-policy';
import { collectPages, completedResult } from './notification-delivery';
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

  async fetchSeasons(leagueSlug = 'Superliga-Romania'): Promise<number[]> {
    const response = await fetch(`${this.API_BASE}/leagues/${encodeURIComponent(leagueSlug)}/seasons/`, {
      signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'RYVLBot/2.0' },
    });
    if (!response.ok) throw new Error(`VPG seasons HTTP ${response.status} for ${leagueSlug}`);
    const raw = await response.json();
    const values = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    const seasons = values.map(Number).filter((n: number) => Number.isInteger(n) && n > 0).sort((x: number, y: number) => y - x);
    if (!seasons.length) throw new Error(`No valid VPG season available for ${leagueSlug}`);
    return seasons;
  }

  async fetchLatestSeason(leagueSlug = 'Superliga-Romania'): Promise<number> {
    return (await this.fetchSeasons(leagueSlug))[0];
  }

  async fetchAllMatches(status: 'complete' | 'scheduled', season: number, leagueSlug = 'Superliga-Romania'): Promise<VpgMatchItem[]> {
    // Fetch every page. A late result must not be dropped just because its match date is old.
    return collectPages((limit, offset) => this.fetchMatches(status, season, limit, offset, leagueSlug));
  }

  async fetchStandings(season?: number, leagueSlug = 'Superliga-Romania'): Promise<VpgStandingsRow[]> {
    const targetSeason = season || (await this.fetchLatestSeason(leagueSlug));
    const url = `${this.API_BASE}/leagues/${leagueSlug}/table/?season=${targetSeason}&is_history=false`;
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
    leagueSlug = 'Superliga-Romania',
  ): Promise<VpgMatchItem[]> {
    const targetSeason = season || (await this.fetchLatestSeason(leagueSlug));
    const url = `${this.API_BASE}/leagues/${leagueSlug}/matches/?status=${status}&season=${targetSeason}&limit=${limit}&offset=${offset}`;
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
  }

  async fetchLeaderboard(
    category: 'strikers' | 'cam' | 'gk' | 'cb' | 'cdm' | 'wingers' = 'strikers',
    season?: number,
    leagueSlug = 'Superliga-Romania',
  ): Promise<VpgLeaderboardEntry[]> {
    const targetSeason = season || (await this.fetchLatestSeason(leagueSlug));
    const lbNameMap: Record<string, string> = {
      strikers: 'top_strikers',
      cam: 'top_cam',
      gk: 'top_gk',
      cb: 'top_cb',
      cdm: 'top_cdm',
      wingers: 'top_wingers',
    };
    const lbName = lbNameMap[category] || 'top_strikers';
    const url = `${this.API_BASE}/leagues/${leagueSlug}/leaderboard/?leaderboard=${lbName}&weekly=false&season=${targetSeason}&limit=25&offset=0`;
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

  async getCompetitions(guildId?: string): Promise<RyvlCompetitionDto[]> {
    if (!guildId) {
      const publicGuild = await this.prisma.guild.findFirst({ orderBy: { joinedAt: 'asc' } });
      guildId = publicGuild?.id;
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

    // Default 3 competition slots (Slot 1 active, Slot 2 & 3 ready for easy configuration)
    return [
      {
        id: 'slot-1',
        name: 'VPG Superliga Romania',
        slug: 'Superliga-Romania',
        communitySlug: 'VPGRoPS5',
        active: true,
        displayOrder: 1,
      },
      {
        id: 'slot-2',
        name: 'VPG Competition 2',
        slug: 'vpg-competition-2',
        communitySlug: 'VPGRoPS5',
        active: false,
        displayOrder: 2,
      },
      {
        id: 'slot-3',
        name: 'VPG Competition 3',
        slug: 'vpg-competition-3',
        communitySlug: 'VPGRoPS5',
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
        communitySlug: data.communitySlug || 'VPGRoPS5',
        active: data.active ?? true,
        season: data.season,
        displayOrder: data.displayOrder ?? 1,
      },
    });
  }

  async getRyvlPerformance(
    guildId?: string,
    competitionSlug?: string,
  ): Promise<RyvlPerformanceResponse> {
    const competitions = await this.getCompetitions(guildId);
    const targetComp = competitionSlug
      ? competitions.find((c) => c.slug === competitionSlug) || competitions[0]
      : competitions.find((c) => c.active) || competitions[0];

    const activeSlug = targetComp.slug;
    const activeName = targetComp.name;
    if (!targetComp.active) throw new Error('This competition is not active yet');
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
