import { resolveEaMatchType, formatEaMatchType, mergeEaRawMatch } from './ea-match-type';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { execFile } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import {
  EaClubSearchResult,
  EaRawMatch,
  ParsedEaMatch,
  ParsedEaPlayer,
  EaMatchPlayerStat,
  PublicRosterMember,
} from './ea.types';

import { existsSync, mkdirSync, copyFileSync } from 'fs';

const execFileAsync = promisify(execFile);

export const EA_CREST_TEMPLATE =
  'https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l{identifier}.png';
export const EA_DEFAULT_CREST =
  'https://media.contentapi.ea.com/content/dam/ea/fc/common/global/tertiary-logo.svg';

export const DEFAULT_EA_MATCH_TYPES = ['leagueMatch', 'friendlyMatch', 'playoffMatch'];
export const DEFAULT_EA_PLATFORM = 'common-gen5';
export const EA_PLATFORMS = ['common-gen5', 'common-gen4', 'nx'] as const;
export const DEFAULT_ELO = 1200;
export const ELO_K_FACTOR = 32;
/** How long ea_bridge.py results are reused before spawning Python again. */
export const EA_BRIDGE_CACHE_TTL_MS = 60_000;
const EA_BRIDGE_CACHE_MAX_ENTRIES = 500;

export interface EaClubRef {
  clubId: string;
  platform?: string | null;
}

/** Values accepted by recordProcessed(); see the ProcessedEaMatch column notes. */
export interface RecordProcessedInput {
  guildId: string;
  clubId: string;
  raw: EaRawMatch;
  parsed: ParsedEaMatch;
  channelId: string | null;
  /** true: the match still has to be posted to Discord (the poller retries it). */
  postPending: boolean;
  discordMessageId?: string | null;
}

/** Discord channel snowflake, or null (also for the string "null" a select can send). */
export function normalizeChannelId(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  return /^\d{15,25}$/.test(text) ? text : null;
}

export function normalizeEaPlatform(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return (EA_PLATFORMS as readonly string[]).includes(text) ? text : DEFAULT_EA_PLATFORM;
}

/** Standard Elo update. score is 1 (win), 0.5 (draw) or 0 (loss). */
export function computeElo(rating: number, opponentRating: number, score: number, k = ELO_K_FACTOR): number {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
  return Math.round(rating + k * (score - expected));
}

/** Per-club poll interval bounds; the poller ticks every EA_POLL_BASE_TICK_SEC. */
export const EA_POLL_BASE_TICK_SEC = 30;
export function clampPollInterval(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 90;
  return Math.min(Math.max(n, EA_POLL_BASE_TICK_SEC), 3600);
}

export function outcomeScore(outcome: 'WIN' | 'LOSS' | 'DRAW'): number {
  return outcome === 'WIN' ? 1 : outcome === 'DRAW' ? 0.5 : 0;
}

@Injectable()
export class EaService {
  private readonly logger = new Logger(EaService.name);
  // Short-lived cache (and in-flight de-duplication) for ea_bridge.py calls, so
  // public page loads and the poller do not spawn a Python process every time.
  private readonly bridgeCache = new Map<string, { expiresAt: number; value: Promise<any> }>();

  constructor(private readonly prisma: PrismaService) {}

  private getScriptPath(): string {
    const candidate1 = join(__dirname, 'scripts', 'ea_bridge.py');
    if (existsSync(candidate1)) return candidate1;

    const candidate2 = join(process.cwd(), 'src', 'ea', 'scripts', 'ea_bridge.py');
    if (existsSync(candidate2)) {
      try {
        const destDir = join(__dirname, 'scripts');
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
        copyFileSync(candidate2, candidate1);
        return candidate1;
      } catch {
        return candidate2;
      }
    }

    const candidate3 = join(__dirname, '..', '..', 'src', 'ea', 'scripts', 'ea_bridge.py');
    if (existsSync(candidate3)) return candidate3;

    return candidate1;
  }

  getCrestUrl(teamId?: number | string, crestAssetId?: number | string): string {
    const identifier = teamId || crestAssetId;
    return identifier ? EA_CREST_TEMPLATE.replace('{identifier}', String(identifier)) : EA_DEFAULT_CREST;
  }

  private getPythonExecutable(): string {
    // Production uses a project-local virtual environment so Python dependencies
    // are isolated from Ubuntu's system Python (PEP 668).
    const venvPython = join(process.cwd(), '.venv', 'bin', 'python');
    if (existsSync(venvPython)) return venvPython;

    // Ubuntu 24.04 provides "python3" by default; "python" may not exist.
    return 'python3';
  }

  private runBridge(command: string, args: string[]): Promise<any> {
    const key = JSON.stringify([command, ...args]);
    const now = Date.now();
    const cached = this.bridgeCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const value = this.spawnBridge(command, args);
    this.bridgeCache.set(key, { expiresAt: now + EA_BRIDGE_CACHE_TTL_MS, value });
    // Failures are never cached: the next caller tries EA again.
    value.catch(() => {
      if (this.bridgeCache.get(key)?.value === value) this.bridgeCache.delete(key);
    });
    if (this.bridgeCache.size > EA_BRIDGE_CACHE_MAX_ENTRIES) {
      for (const [k, entry] of this.bridgeCache) {
        if (entry.expiresAt <= now) this.bridgeCache.delete(k);
      }
      while (this.bridgeCache.size > EA_BRIDGE_CACHE_MAX_ENTRIES) {
        const oldest = this.bridgeCache.keys().next().value;
        if (oldest === undefined) break;
        this.bridgeCache.delete(oldest);
      }
    }
    return value;
  }

  private async spawnBridge(command: string, args: string[]): Promise<any> {
    try {
      const scriptPath = this.getScriptPath();
      const { stdout } = await execFileAsync(
        this.getPythonExecutable(),
        [scriptPath, command, ...args],
        { maxBuffer: 15 * 1024 * 1024, timeout: 20000 },
      );
      return JSON.parse(stdout.trim());
    } catch (error: any) {
      this.logger.error(`Error running ea_bridge command ${command}: ${error.message}`);
      throw error;
    }
  }


  async searchClubs(query: string, platform = 'common-gen5'): Promise<EaClubSearchResult[]> {
    if (!query || !query.trim()) return [];
    return this.runBridge('search', [platform, query.trim()]);
  }

  async fetchMatchesRaw(
    clubId: string,
    matchType = 'leagueMatch',
    count = 10,
    platform = 'common-gen5',
  ): Promise<EaRawMatch[]> {
    const matches = await this.runBridge('matches', [platform, String(clubId), matchType, String(count)]);
    if (!Array.isArray(matches)) throw new Error('Invalid upstream match response');
    // Keep the endpoint category through merging, persistence and embed creation.
    // Copy each object so EA's original fields remain intact for diagnostics.
    return matches.filter((match): match is EaRawMatch => Boolean(match && typeof match === 'object' && match.matchId))
      .map(match => ({ ...match, sourceMatchTypes: [matchType] }));
  }

  /**
   * Fetch the newest `count` matches of a club across several EA match types,
   * merged by match ID (keeping fetch provenance) and sorted newest first.
   * Throws 503 when every match-type request failed, so callers can tell an
   * outage from a club that has simply not played.
   */
  async fetchRecentMatches(
    club: EaClubRef,
    types?: string[] | null,
    count = 5,
  ): Promise<EaRawMatch[]> {
    const matchTypes = types && types.length > 0 ? types : DEFAULT_EA_MATCH_TYPES;
    const merged = new Map<string, EaRawMatch>();
    let successfulRequests = 0;
    for (const matchType of matchTypes) {
      try {
        const matches = await this.fetchMatchesRaw(club.clubId, matchType, count, club.platform || DEFAULT_EA_PLATFORM);
        if (!Array.isArray(matches)) throw new Error('Invalid upstream match response');
        successfulRequests++;
        for (const m of matches) {
          if (m && m.matchId) mergeEaRawMatch(merged, m);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to fetch ${matchType} for club ${club.clubId}: ${err?.message || err}`);
      }
    }
    if (successfulRequests === 0) {
      throw new ServiceUnavailableException('Match data is temporarily unavailable. Please try again.');
    }
    return Array.from(merged.values())
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, count);
  }

  /**
   * Store a match for (guild, tracked club). Returns created=false when the row
   * already exists, so only the first caller posts it and applies Elo.
   * home* columns always hold the tracked club, away* the opponent.
   */
  async recordProcessed(input: RecordProcessedInput): Promise<{ created: boolean; record: any }> {
    const { guildId, clubId, raw, parsed } = input;
    const eaMatchId = String(raw.matchId);
    try {
      const record = await this.prisma.processedEaMatch.create({
        data: {
          guildId,
          eaMatchId,
          clubId,
          matchType: parsed.matchType,
          homeClubName: parsed.trackedClub.name,
          awayClubName: parsed.opponentClub.name,
          homeScore: parsed.trackedClub.score,
          awayScore: parsed.opponentClub.score,
          timestamp: parsed.timestamp,
          discordMessageId: input.discordMessageId ?? null,
          channelId: input.channelId,
          rawPayload: raw as any,
          postPending: input.postPending,
        },
      });
      return { created: true, record };
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      const record = await this.prisma.processedEaMatch.findUnique({
        where: { guildId_clubId_eaMatchId: { guildId, clubId, eaMatchId } },
      });
      return { created: false, record };
    }
  }

  /** Club IDs whose stored matches belong to a guild: its primary club plus all tracked clubs. */
  async getGuildClubIds(guildId: string): Promise<string[]> {
    const [config, tracked] = await Promise.all([
      this.prisma.clubTrackerConfig.findUnique({ where: { guildId }, select: { clubId: true } }),
      this.prisma.trackedClub.findMany({ where: { guildId }, select: { clubId: true } }),
    ]);
    return [...new Set([config?.clubId, ...tracked.map((t) => t.clubId)].filter((id): id is string => Boolean(id)))];
  }

  /** Current Elo of a club inside a guild, or the default for clubs the guild does not track. */
  async getClubElo(guildId: string, clubId: string): Promise<number> {
    if (!clubId) return DEFAULT_ELO;
    const tracked = await this.prisma.trackedClub.findFirst({ where: { guildId, clubId }, select: { elo: true } });
    if (tracked) return tracked.elo;
    const config = await this.prisma.clubTrackerConfig.findFirst({ where: { guildId, clubId }, select: { elo: true } });
    return config?.elo ?? DEFAULT_ELO;
  }

  async fetchClubInfo(clubId: string, platform = 'common-gen5'): Promise<any> {
    return this.runBridge('club_info', [platform, String(clubId)]);
  }

  async fetchOverallStats(clubId: string, platform = 'common-gen5'): Promise<any> {
    return this.runBridge('overall_stats', [platform, String(clubId)]);
  }

  async fetchMemberStats(clubId: string, platform = 'common-gen5'): Promise<any> {
    return this.runBridge('member_stats', [platform, String(clubId)]);
  }

  private mapPosition(proPos: any, favoritePosition?: string): { position: string; positionGroup: 'forward' | 'midfielder' | 'defender' | 'goalkeeper' } {
    const code = parseInt(String(proPos), 10);
    switch (code) {
      case 0:
        return { position: 'GK', positionGroup: 'goalkeeper' };
      case 1:
        return { position: 'SW', positionGroup: 'defender' };
      case 2:
        return { position: 'RWB', positionGroup: 'defender' };
      case 3:
        return { position: 'RB', positionGroup: 'defender' };
      case 4:
      case 5:
      case 6:
        return { position: 'CB', positionGroup: 'defender' };
      case 7:
        return { position: 'LB', positionGroup: 'defender' };
      case 8:
        return { position: 'LWB', positionGroup: 'defender' };
      case 9:
      case 10:
      case 11:
        return { position: 'CDM', positionGroup: 'midfielder' };
      case 12:
        return { position: 'RM', positionGroup: 'midfielder' };
      case 13:
      case 14:
      case 15:
        return { position: 'CM', positionGroup: 'midfielder' };
      case 16:
        return { position: 'LM', positionGroup: 'midfielder' };
      case 17:
      case 18:
      case 19:
        return { position: 'CAM', positionGroup: 'midfielder' };
      case 20:
      case 21:
      case 22:
        return { position: 'CF', positionGroup: 'forward' };
      case 23:
        return { position: 'RW', positionGroup: 'forward' };
      case 24:
      case 25:
      case 26:
        return { position: 'ST', positionGroup: 'forward' };
      case 27:
        return { position: 'LW', positionGroup: 'forward' };
      default: {
        const fav = (favoritePosition || '').toLowerCase();
        if (fav.includes('forward')) return { position: 'FW', positionGroup: 'forward' };
        if (fav.includes('midfield')) return { position: 'MID', positionGroup: 'midfielder' };
        if (fav.includes('defen')) return { position: 'DEF', positionGroup: 'defender' };
        if (fav.includes('goal') || fav.includes('keeper')) return { position: 'GK', positionGroup: 'goalkeeper' };
        return { position: 'PRO', positionGroup: 'midfielder' };
      }
    }
  }

  async getPublicRoster(platform = 'common-gen5', clubId?: string): Promise<PublicRosterMember[]> {
    let targetClubId = clubId;
    if (!targetClubId) {
      // Same deterministic "default" club as the public club page.
      const config = await this.getDefaultTrackerConfig();
      targetClubId = config.clubId || '128199'; // Default RYVL Esports club ID
      platform = config.platform || platform;
    }

    try {
      const data = await this.fetchMemberStats(targetClubId, platform);
      const members = Array.isArray(data?.members) ? data.members : [];

      return members.map((m: any) => {
        const posInfo = this.mapPosition(m.proPos, m.favoritePosition);
        return {
          name: m.name || 'Unknown',
          proName: m.proName || m.name || 'Virtual Pro',
          proOverall: parseInt(String(m.proOverall || 80), 10) || 80,
          position: posInfo.position,
          positionGroup: posInfo.positionGroup,
          gamesPlayed: parseInt(String(m.gamesPlayed || 0), 10) || 0,
          goals: parseInt(String(m.goals || 0), 10) || 0,
          assists: parseInt(String(m.assists || 0), 10) || 0,
          ratingAve: parseFloat(String(m.ratingAve || 0.0)) || 0.0,
          cleanSheets: parseInt(String(m.cleanSheetsGK || m.cleanSheetsDef || 0), 10) || 0,
          manOfTheMatch: parseInt(String(m.manOfTheMatch || 0), 10) || 0,
          passSuccessRate: parseInt(String(m.passSuccessRate || 0), 10) || 0,
          tackleSuccessRate: parseInt(String(m.tackleSuccessRate || 0), 10) || 0,
          shotSuccessRate: parseInt(String(m.shotSuccessRate || 0), 10) || 0,
          nationality: String(m.proNationality || '39'),
          height: parseInt(String(m.proHeight || 180), 10) || 180,
        };
      });
    } catch (err: any) {
      this.logger.error(`Failed to get public roster for club ${targetClubId}: ${err.message}`);
      return [];
    }
  }

  parsePlayer(stat: EaMatchPlayerStat): ParsedEaPlayer {
    const passesMade = parseInt(String(stat.passesmade || 0), 10) || 0;
    const passAttempts = parseInt(String(stat.passattempts || 0), 10) || 0;
    const tacklesMade = parseInt(String(stat.tacklesmade || 0), 10) || 0;
    const tackleAttempts = parseInt(String(stat.tackleattempts || 0), 10) || 0;
    const goals = parseInt(String(stat.goals || 0), 10) || 0;
    const assists = parseInt(String(stat.assists || 0), 10) || 0;
    const shots = parseInt(String(stat.shots || 0), 10) || 0;
    const saves = parseInt(String(stat.saves || 0), 10) || 0;
    const cleanSheetsGk = parseInt(String(stat.cleansheetsgk || 0), 10) || 0;
    const redCards = parseInt(String(stat.redcards || 0), 10) || 0;
    const rating = parseFloat(String(stat.rating || 0)) || 0;
    const isMom = String(stat.mom) === '1' || String(stat.mom).toLowerCase() === 'true';

    return {
      gamertag: stat.playername || 'Unknown',
      rating,
      goals,
      assists,
      shots,
      passesMade,
      passAttempts,
      tacklesMade,
      tackleAttempts,
      saves,
      cleanSheetsGk,
      isMom,
      position: stat.pos || 'player',
      redCards,
    };
  }

  parseMatch(raw: EaRawMatch, trackedClubId: string): ParsedEaMatch {
    const clubIds = Object.keys(raw.clubs || {});
    const homeClubId = clubIds[0] || '';
    const awayClubId = clubIds[1] || '';

    const isHome = String(homeClubId) === String(trackedClubId);
    const opponentClubId = isHome ? awayClubId : homeClubId;

    const trackedClubData = raw.clubs?.[trackedClubId];
    const opponentClubData = raw.clubs?.[opponentClubId];

    const trackedScore = parseInt(String(trackedClubData?.score ?? trackedClubData?.goals ?? 0), 10);
    const opponentScore = parseInt(String(opponentClubData?.score ?? opponentClubData?.goals ?? 0), 10);

    let outcome: 'WIN' | 'LOSS' | 'DRAW' = 'DRAW';
    if (trackedScore > opponentScore) outcome = 'WIN';
    else if (trackedScore < opponentScore) outcome = 'LOSS';

    const trackedDetails = trackedClubData?.details;
    const opponentDetails = opponentClubData?.details;

    const trackedCrestUrl = this.getCrestUrl(
      trackedDetails?.teamId,
      trackedDetails?.customKit?.crestAssetId,
    );
    const opponentCrestUrl = this.getCrestUrl(
      opponentDetails?.teamId,
      opponentDetails?.customKit?.crestAssetId,
    );

    const trackedPlayersRaw = raw.players?.[trackedClubId] || {};
    const opponentPlayersRaw = raw.players?.[opponentClubId] || {};

    const trackedPlayers: ParsedEaPlayer[] = Object.values(trackedPlayersRaw)
      .map((p) => this.parsePlayer(p))
      .sort((a, b) => b.rating - a.rating);

    const opponentPlayers: ParsedEaPlayer[] = Object.values(opponentPlayersRaw)
      .map((p) => this.parsePlayer(p))
      .sort((a, b) => b.rating - a.rating);

    const matchType = resolveEaMatchType(raw, trackedClubId);
    const trackedAggregate = raw.aggregate?.[trackedClubId];
    const opponentAggregate = raw.aggregate?.[opponentClubId];

    return {
      matchId: String(raw.matchId),
      timestamp: new Date((raw.timestamp || Date.now() / 1000) * 1000),
      matchType,
      matchTypeLabel: formatEaMatchType(matchType),
      trackedClubId,
      isHome,
      outcome,
      trackedClub: {
        id: trackedClubId,
        name: trackedDetails?.name || 'RYVL Esports',
        score: trackedScore,
        crestUrl: trackedCrestUrl,
        aggregate: trackedAggregate,
      },
      opponentClub: {
        id: opponentClubId,
        name: opponentDetails?.name || 'Opponent',
        score: opponentScore,
        crestUrl: opponentCrestUrl,
        aggregate: opponentAggregate,
      },
      trackedPlayers,
      opponentPlayers,
      rawMatch: raw,
    };
  }

  async getOrCreateTrackerConfig(guildId: string) {
    const existing = await this.prisma.clubTrackerConfig.findUnique({
      where: { guildId },
    });
    if (existing) return existing;

    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    return this.prisma.clubTrackerConfig.create({
      data: {
        guildId,
        clubId: '128199',
        clubName: 'RYVL Esports',
        platform: 'common-gen5',
        channelId: guild?.defaultChannelId || null,
        enabled: true,
        matchTypes: ['leagueMatch', 'friendlyMatch', 'playoffMatch'],
        pollIntervalSec: 90,
      },
    });
  }

  async updateTrackerConfig(
    guildId: string,
    data: {
      clubId?: string;
      clubName?: string;
      platform?: string;
      channelId?: string | null;
      enabled?: boolean;
      matchTypes?: string[];
      pollIntervalSec?: number;
    },
  ) {
    const existing = await this.prisma.clubTrackerConfig.findUnique({ where: { guildId } });
    const nextClubId = data.clubId ? String(data.clubId) : existing?.clubId ?? '128199';
    const nextPlatform = data.platform ? normalizeEaPlatform(data.platform) : existing?.platform ?? DEFAULT_EA_PLATFORM;
    // A different club (or platform) must start from a fresh checkpoint, otherwise
    // the old club's lastMatchId never matches and recent history gets reposted.
    const clubChanged = !!existing && (existing.clubId !== nextClubId || existing.platform !== nextPlatform);
    const trackedRow = clubChanged
      ? await this.prisma.trackedClub.findFirst({ where: { guildId, clubId: nextClubId }, select: { elo: true } })
      : null;
    const matchTypes = Array.isArray(data.matchTypes)
      ? data.matchTypes.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim())
      : undefined;
    const pollIntervalSec = data.pollIntervalSec ? clampPollInterval(Number(data.pollIntervalSec)) : undefined;

    const config = await this.prisma.clubTrackerConfig.upsert({
      where: { guildId },
      update: {
        ...(data.clubId ? { clubId: nextClubId } : {}),
        ...(data.clubName ? { clubName: String(data.clubName) } : {}),
        ...(data.platform ? { platform: nextPlatform } : {}),
        ...(data.channelId !== undefined ? { channelId: normalizeChannelId(data.channelId) } : {}),
        ...(data.enabled !== undefined ? { enabled: Boolean(data.enabled) } : {}),
        ...(matchTypes && matchTypes.length ? { matchTypes } : {}),
        ...(pollIntervalSec ? { pollIntervalSec } : {}),
        ...(clubChanged ? { lastMatchId: null, elo: trackedRow?.elo ?? DEFAULT_ELO } : {}),
      },
      create: {
        guildId,
        clubId: nextClubId,
        clubName: data.clubName ? String(data.clubName) : 'RYVL Esports',
        platform: nextPlatform,
        channelId: normalizeChannelId(data.channelId),
        enabled: data.enabled !== undefined ? Boolean(data.enabled) : true,
        matchTypes: matchTypes && matchTypes.length ? matchTypes : DEFAULT_EA_MATCH_TYPES,
        pollIntervalSec: pollIntervalSec ?? 90,
        lastMatchId: null,
      },
    });

    // The primary club and a TrackedClub row for the same club are one logical
    // subscription (the poller polls it once); keep their channel/enabled in sync.
    if (data.channelId !== undefined || data.enabled !== undefined) {
      await this.prisma.trackedClub.updateMany({
        where: { guildId, clubId: config.clubId, platform: config.platform },
        data: {
          ...(data.channelId !== undefined ? { channelId: normalizeChannelId(data.channelId) } : {}),
          ...(data.enabled !== undefined ? { enabled: Boolean(data.enabled) } : {}),
        },
      });
    }

    // A club that stops being the primary keeps being tracked (as before, when
    // the primary was always mirrored into TrackedClub): "switching" the viewed
    // club in the dashboard must not silently stop the previous one.
    if (clubChanged && existing) {
      await this.prisma.trackedClub.upsert({
        where: { guildId_clubId: { guildId, clubId: existing.clubId } },
        update: {},
        create: {
          guildId,
          clubId: existing.clubId,
          clubName: existing.clubName,
          channelId: existing.channelId,
          platform: existing.platform,
          enabled: existing.enabled,
          lastMatchId: existing.lastMatchId,
          elo: existing.elo ?? DEFAULT_ELO,
        },
      });
    }
    return config;
  }

  /**
   * The guild whose club is shown on the public site. Deterministic: the
   * RYVL_GUILD_ID environment variable when it names a known guild, otherwise
   * the oldest guild (by joinedAt) with an enabled tracker, otherwise the
   * oldest guild.
   */
  async resolveDefaultGuildId(): Promise<string | null> {
    const envGuildId = process.env.RYVL_GUILD_ID?.trim();
    if (envGuildId) {
      const guild = await this.prisma.guild.findUnique({ where: { id: envGuildId }, select: { id: true } });
      if (guild) return guild.id;
      this.logger.warn(`RYVL_GUILD_ID=${envGuildId} is not a known guild; falling back to the oldest guild.`);
    }
    const order = [{ joinedAt: 'asc' as const }, { id: 'asc' as const }];
    const tracked = await this.prisma.guild.findFirst({
      where: { clubTrackerConfig: { is: { enabled: true } } },
      orderBy: order,
      select: { id: true },
    });
    if (tracked) return tracked.id;
    const oldest = await this.prisma.guild.findFirst({ orderBy: order, select: { id: true } });
    return oldest?.id ?? null;
  }

  /** Read-only: never creates a config row for a public request. */
  async getDefaultTrackerConfig() {
    const guildId = await this.resolveDefaultGuildId();
    if (guildId) {
      const existing = await this.prisma.clubTrackerConfig.findUnique({ where: { guildId } });
      if (existing) return existing;
    }

    return {
      id: 'default',
      guildId: guildId ?? 'default',
      clubId: '128199',
      clubName: 'RYVL Esports',
      platform: 'common-gen5',
      channelId: null,
      enabled: true,
      matchTypes: ['leagueMatch', 'friendlyMatch', 'playoffMatch'],
      pollIntervalSec: 90,
      lastPolledAt: null,
      lastMatchId: null,
      elo: DEFAULT_ELO,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async recordMatchPlayerStats(matchId: string, clubId: string, raw: EaRawMatch): Promise<void> {
    try {
      const clubPlayers = raw.players?.[clubId];
      if (!clubPlayers || typeof clubPlayers !== 'object') return;

      const timestamp = new Date((raw.timestamp || Date.now() / 1000) * 1000);

      for (const [playerProId, stat] of Object.entries(clubPlayers)) {
        if (!stat || !stat.playername) continue;

        const rating = parseFloat(String(stat.rating || '0')) || 0;
        const goals = parseInt(String(stat.goals || '0'), 10) || 0;
        const assists = parseInt(String(stat.assists || '0'), 10) || 0;
        const shots = parseInt(String(stat.shots || '0'), 10) || 0;
        const passesMade = parseInt(String(stat.passesmade || '0'), 10) || 0;
        const passAttempts = parseInt(String(stat.passattempts || '0'), 10) || 0;
        const tacklesMade = parseInt(String(stat.tacklesmade || '0'), 10) || 0;
        const tackleAttempts = parseInt(String(stat.tackleattempts || '0'), 10) || 0;
        const saves = parseInt(String(stat.saves || '0'), 10) || 0;
        const mom = stat.mom === true || stat.mom === 1 || String(stat.mom) === '1' ? 1 : 0;
        const cleanSheetDef = parseInt(String(stat.cleansheetsdef || '0'), 10) || 0;
        const cleanSheetGk = parseInt(String(stat.cleansheetsgk || '0'), 10) || 0;
        const cleanSheetsAny = parseInt(String(stat.cleansheetsany || '0'), 10) || 0;
        const redCards = parseInt(String(stat.redcards || '0'), 10) || 0;
        const yellowCards = parseInt(String(stat.yellowcards || '0'), 10) || 0;
        const fouls = parseInt(String(stat.fouls || '0'), 10) || 0;
        const dribbles = parseInt(String(stat.dribbles || '0'), 10) || 0;
        const secondsPlayed = parseInt(String(stat.secondsplayed || '0'), 10) || 0;
        const goalsConceded = parseInt(String(stat.goalsconceded || '0'), 10) || 0;
        const matchEventAggregate0 = stat.match_event_aggregate_0 ? String(stat.match_event_aggregate_0) : null;
        const matchEventAggregate1 = stat.match_event_aggregate_1 ? String(stat.match_event_aggregate_1) : null;
        const matchEventAggregate2 = stat.match_event_aggregate_2 ? String(stat.match_event_aggregate_2) : null;
        const matchEventAggregate3 = stat.match_event_aggregate_3 ? String(stat.match_event_aggregate_3) : null;

        await this.prisma.eaPlayerMatchStat.upsert({
          where: {
            eaMatchId_playerProName_clubId: {
              eaMatchId: matchId,
              playerProName: stat.playername,
              clubId,
            },
          },
          update: {
            rating,
            goals,
            assists,
            shots,
            passesMade,
            passAttempts,
            tacklesMade,
            tackleAttempts,
            saves,
            mom,
            cleanSheetDef,
            cleanSheetGk,
            cleanSheetsAny,
            redCards,
            yellowCards,
            fouls,
            dribbles,
            secondsPlayed,
            goalsConceded,
            matchEventAggregate0,
            matchEventAggregate1,
            matchEventAggregate2,
            matchEventAggregate3,
            pos: stat.pos || null,
            timestamp,
          },
          create: {
            eaMatchId: matchId,
            clubId,
            playerProId: String(playerProId),
            playerProName: stat.playername,
            pos: stat.pos || null,
            rating,
            goals,
            assists,
            shots,
            passesMade,
            passAttempts,
            tacklesMade,
            tackleAttempts,
            saves,
            mom,
            cleanSheetDef,
            cleanSheetGk,
            cleanSheetsAny,
            redCards,
            yellowCards,
            fouls,
            dribbles,
            secondsPlayed,
            goalsConceded,
            matchEventAggregate0,
            matchEventAggregate1,
            matchEventAggregate2,
            matchEventAggregate3,
            timestamp,
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to persist player match stats for match ${matchId}: ${err?.message || err}`);
    }
  }

  async getPlayerStats(guildId: string, playerIdentifier: string) {
    const trimmed = playerIdentifier.trim();

    // Check if playerIdentifier is a Discord user ID or mention (<@123456>)
    const mentionMatch = trimmed.match(/^<@!?(\d+)>$/);
    const discordId = mentionMatch ? mentionMatch[1] : trimmed;

    let registered = await this.prisma.registeredDiscordPlayer.findFirst({
      where: {
        guildId,
        OR: [
          { discordUserId: discordId },
          { eaPlayerName: { equals: trimmed, mode: 'insensitive' } },
        ],
      },
    });

    const eaName = registered ? registered.eaPlayerName : trimmed;

    // Only matches played for this guild's clubs (primary + tracked). EA
    // gamertags are not unique, so an unscoped name match would merge stats of
    // unrelated players from other servers. Every stored match is counted.
    const clubIds = await this.getGuildClubIds(guildId);
    const stats = clubIds.length
      ? await this.prisma.eaPlayerMatchStat.findMany({
          where: {
            playerProName: { equals: eaName, mode: 'insensitive' },
            clubId: { in: clubIds },
          },
          orderBy: { timestamp: 'desc' },
        })
      : [];

    const totalMatches = stats.length;
    let totalGoals = 0;
    let totalAssists = 0;
    let totalShots = 0;
    let totalPassesMade = 0;
    let totalPassAttempts = 0;
    let totalTacklesMade = 0;
    let totalTackleAttempts = 0;
    let totalSaves = 0;
    let totalMom = 0;
    let totalCleanSheets = 0;
    let totalRedCards = 0;
    let ratingSum = 0;

    for (const s of stats) {
      totalGoals += s.goals;
      totalAssists += s.assists;
      totalShots += s.shots;
      totalPassesMade += s.passesMade;
      totalPassAttempts += s.passAttempts;
      totalTacklesMade += s.tacklesMade;
      totalTackleAttempts += s.tackleAttempts;
      totalSaves += s.saves;
      totalMom += s.mom;
      totalCleanSheets += Math.max(s.cleanSheetDef, s.cleanSheetGk);
      totalRedCards += s.redCards;
      ratingSum += s.rating;
    }

    // Decode event aggregates from matchEventAggregate0..3 across all matches
    const allBuckets: string[] = [];
    for (const s of stats) {
      if (s.matchEventAggregate0) allBuckets.push(s.matchEventAggregate0);
      if (s.matchEventAggregate1) allBuckets.push(s.matchEventAggregate1);
      if (s.matchEventAggregate2) allBuckets.push(s.matchEventAggregate2);
      if (s.matchEventAggregate3) allBuckets.push(s.matchEventAggregate3);
    }
    const decodedEvents = decodeMatchEvents(...allBuckets);

    const avgRating = totalMatches > 0 ? (ratingSum / totalMatches).toFixed(2) : '0.0';
    const passAccuracy = totalPassAttempts > 0 ? Math.round((totalPassesMade / totalPassAttempts) * 100) : 0;

    return {
      eaPlayerName: eaName,
      discordUserId: registered?.discordUserId || null,
      preferredPos: registered?.preferredPos || stats[0]?.pos || null,
      totalMatches,
      goals: totalGoals,
      assists: totalAssists,
      shots: totalShots,
      avgRating,
      passesMade: totalPassesMade,
      passAttempts: totalPassAttempts,
      passAccuracy,
      tacklesMade: totalTacklesMade,
      tackleAttempts: totalTackleAttempts,
      tackleSuccessRate:
        totalTackleAttempts > 0 ? Math.round((totalTacklesMade / totalTackleAttempts) * 100) : 0,
      saves: totalSaves,
      cleanSheets: totalCleanSheets,
      redCards: totalRedCards,
      momAwards: totalMom,
      events: decodedEvents,
      // Scope of the figures above: every stored match for these clubs.
      clubIds,
      firstMatchAt: stats.length ? stats[stats.length - 1].timestamp : null,
      recentMatches: stats.slice(0, 5),
    };
  }

  // ----------------------------------------------------
  // Multi-Club Tracking Methods
  // ----------------------------------------------------

  /**
   * Tracked clubs of a guild. The primary club (ClubTrackerConfig) is always
   * listed first with isPrimary=true; when it has no TrackedClub row of its
   * own a read-only entry is synthesised instead of copying it into the table
   * (copying made the poller post every match of the primary club twice).
   */
  async getTrackedClubs(guildId: string) {
    const [config, rows] = await Promise.all([
      this.prisma.clubTrackerConfig.findUnique({ where: { guildId } }),
      this.prisma.trackedClub.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } }),
    ]);
    const isPrimary = (row: { clubId: string; platform: string }) =>
      !!config && row.clubId === config.clubId && row.platform === config.platform;
    const clubs: any[] = rows.map((row) => ({ ...row, isPrimary: isPrimary(row) }));
    if (config && !clubs.some((c) => c.isPrimary)) {
      clubs.unshift({
        id: `primary:${config.id}`,
        guildId,
        clubId: config.clubId,
        clubName: config.clubName,
        channelId: config.channelId,
        platform: config.platform,
        enabled: config.enabled,
        lastMatchId: config.lastMatchId,
        lastPolledAt: config.lastPolledAt,
        crestUrl: null,
        elo: config.elo,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        isPrimary: true,
      });
    }
    return clubs.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  }

  async addTrackedClub(
    guildId: string,
    clubId: string,
    clubName: string,
    channelId?: string | null,
    platform = 'common-gen5',
    crestUrl?: string | null,
  ) {
    const normalizedPlatform = normalizeEaPlatform(platform);
    const targetChannel = normalizeChannelId(channelId) ?? (await this.getDefaultResultsChannelId(guildId));

    const existing = await this.prisma.trackedClub.findUnique({
      where: { guildId_clubId: { guildId, clubId } },
    });
    const platformChanged = !!existing && existing.platform !== normalizedPlatform;

    return this.prisma.trackedClub.upsert({
      where: {
        guildId_clubId: { guildId, clubId },
      },
      update: {
        clubName,
        channelId: targetChannel,
        platform: normalizedPlatform,
        enabled: true,
        // Keep a known crest when re-adding without one.
        ...(crestUrl ? { crestUrl } : {}),
        ...(platformChanged ? { lastMatchId: null, elo: DEFAULT_ELO } : {}),
      },
      create: {
        guildId,
        clubId,
        clubName,
        channelId: targetChannel,
        platform: normalizedPlatform,
        enabled: true,
        crestUrl: crestUrl || null,
        elo: await this.getClubElo(guildId, clubId),
      },
    });
  }

  /** "Default" channel for tracked clubs: the guild's live results channel, else its default channel. */
  private async getDefaultResultsChannelId(guildId: string): Promise<string | null> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { defaultLiveResultsChannelId: true, defaultChannelId: true },
    });
    return guild?.defaultLiveResultsChannelId || guild?.defaultChannelId || null;
  }

  async removeTrackedClub(guildId: string, clubId: string) {
    return this.prisma.trackedClub.deleteMany({
      where: { guildId, clubId },
    });
  }

  async updateTrackedClub(
    guildId: string,
    clubId: string,
    body: { enabled?: boolean; channelId?: string | null; platform?: string; clubName?: string },
  ) {
    // Whitelist: the request body used to be passed to Prisma as-is, which let
    // a caller rewrite elo, lastMatchId or even guildId.
    const data: { enabled?: boolean; channelId?: string | null; platform?: string; clubName?: string; lastMatchId?: null; elo?: number } = {};
    if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
    // "Default" resolves to the guild's results channel: a tracked club without
    // a channel is never polled.
    if (body.channelId !== undefined) {
      data.channelId = normalizeChannelId(body.channelId) ?? (await this.getDefaultResultsChannelId(guildId));
    }
    if (body.clubName) data.clubName = String(body.clubName);

    const existing = await this.prisma.trackedClub.findUnique({
      where: { guildId_clubId: { guildId, clubId } },
    });
    if (body.platform) {
      data.platform = normalizeEaPlatform(body.platform);
      if (existing && existing.platform !== data.platform) {
        data.lastMatchId = null; // new feed: start from a fresh checkpoint
        data.elo = DEFAULT_ELO;
      }
    }

    const result = await this.prisma.trackedClub.updateMany({
      where: { guildId, clubId },
      data,
    });

    // Channel/enabled of the primary club live on ClubTrackerConfig; keep both in sync.
    const config = await this.prisma.clubTrackerConfig.findUnique({ where: { guildId } });
    if (
      config &&
      config.clubId === clubId &&
      config.platform === (data.platform ?? existing?.platform ?? config.platform) &&
      (data.enabled !== undefined || data.channelId !== undefined)
    ) {
      await this.prisma.clubTrackerConfig.update({
        where: { guildId },
        data: {
          ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
          ...(data.channelId !== undefined ? { channelId: data.channelId } : {}),
        },
      });
      return { count: Math.max(result.count, 1) };
    }
    return result;
  }

  /**
   * Record, goals and top scorers of one club from the matches stored for this
   * guild. With exact=true, clubNameOrId must be the club ID of the primary or
   * a tracked club (returns null otherwise); without it a partial name is
   * accepted and the first tracked club is used as a fallback (/team_stats).
   */
  async getClubStats(guildId: string, clubNameOrId?: string, options: { exact?: boolean } = {}) {
    const query = clubNameOrId?.trim();
    const config = await this.prisma.clubTrackerConfig.findUnique({ where: { guildId } });
    let trackedClub: { clubId: string; clubName: string; elo: number } | null = null;

    if (query) {
      trackedClub = await this.prisma.trackedClub.findFirst({
        where: options.exact
          ? { guildId, clubId: query }
          : {
              guildId,
              OR: [{ clubId: query }, { clubName: { contains: query, mode: 'insensitive' } }],
            },
        orderBy: { createdAt: 'asc' },
      });
      if (!trackedClub && config) {
        const matchesPrimary = options.exact
          ? config.clubId === query
          : config.clubId === query || config.clubName.toLowerCase().includes(query.toLowerCase());
        if (matchesPrimary) trackedClub = config;
      }
      if (!trackedClub && options.exact) return null;
    }

    if (!trackedClub) {
      trackedClub =
        config ??
        (await this.prisma.trackedClub.findFirst({
          where: { guildId, enabled: true },
          orderBy: { createdAt: 'asc' },
        }));
    }

    const targetClubId = trackedClub?.clubId ?? '128199';
    const targetClubName = trackedClub?.clubName ?? 'RYVL Esports';
    const elo = await this.getClubElo(guildId, targetClubId);

    // Rows store the tracked club in home* and its opponent in away*.
    const matches = await this.prisma.processedEaMatch.findMany({
      where: { guildId, clubId: targetClubId },
      orderBy: { timestamp: 'desc' },
      take: 50,
      select: {
        eaMatchId: true,
        matchType: true,
        homeClubName: true,
        awayClubName: true,
        homeScore: true,
        awayScore: true,
        timestamp: true,
      },
    });

    let wins = 0;
    let losses = 0;
    let draws = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    let cleanSheets = 0;

    for (const m of matches) {
      const teamScore = m.homeScore;
      const oppScore = m.awayScore;

      goalsFor += teamScore;
      goalsAgainst += oppScore;

      if (oppScore === 0) cleanSheets += 1;
      if (teamScore > oppScore) wins += 1;
      else if (teamScore < oppScore) losses += 1;
      else draws += 1;
    }

    // Top scorers from eaPlayerMatchStat for this club
    const playerStats = await this.prisma.eaPlayerMatchStat.findMany({
      where: { clubId: targetClubId },
      select: { playerProName: true, goals: true, assists: true },
    });

    const goalsByPlayer = new Map<string, { name: string; goals: number; assists: number; matches: number }>();
    for (const ps of playerStats) {
      const cur = goalsByPlayer.get(ps.playerProName) || { name: ps.playerProName, goals: 0, assists: 0, matches: 0 };
      cur.goals += ps.goals;
      cur.assists += ps.assists;
      cur.matches += 1;
      goalsByPlayer.set(ps.playerProName, cur);
    }

    const topScorers = Array.from(goalsByPlayer.values())
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
      .slice(0, 5);

    return {
      clubId: targetClubId,
      clubName: targetClubName,
      elo,
      // Record and goals cover the most recent `totalMatches` stored matches (max 50).
      totalMatches: matches.length,
      matchWindow: 50,
      wins,
      draws,
      losses,
      winRate: matches.length > 0 ? Math.round((wins / matches.length) * 100) : 0,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      cleanSheets,
      topScorers,
      recentMatches: matches.slice(0, 5),
    };
  }

  /**
   * Discord ↔ EA gamertag links of a guild, for other features (e.g. lineups).
   * Served at GET api/guilds/:guildId/ea/registrations.
   */
  async getRegistrationsForGuild(
    guildId: string,
  ): Promise<{ discordUserId: string; eaPlayerName: string; preferredPos: string | null }[]> {
    return this.prisma.registeredDiscordPlayer.findMany({
      where: { guildId },
      orderBy: { eaPlayerName: 'asc' },
      select: { discordUserId: true, eaPlayerName: true, preferredPos: true },
    });
  }

  async getRegisteredPlayers(guildId: string) {
    return this.prisma.registeredDiscordPlayer.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async registerPlayer(
    guildId: string,
    discordUserId: string,
    eaPlayerName: string,
    preferredPos?: string,
    actorId = 'system',
  ) {
    const record = await this.prisma.registeredDiscordPlayer.upsert({
      where: {
        guildId_discordUserId: { guildId, discordUserId },
      },
      update: {
        eaPlayerName: eaPlayerName.trim(),
        preferredPos: preferredPos?.trim() || null,
      },
      create: {
        guildId,
        discordUserId,
        eaPlayerName: eaPlayerName.trim(),
        preferredPos: preferredPos?.trim() || null,
      },
    });

    await this.prisma.playerRegistrationAudit.create({
      data: {
        guildId,
        action: 'LINK',
        discordUserId,
        eaPlayerName: eaPlayerName.trim(),
        performedById: actorId,
      },
    });

    return record;
  }

  async unregisterPlayer(guildId: string, discordUserId: string, actorId = 'system') {
    const existing = await this.prisma.registeredDiscordPlayer.findUnique({
      where: { guildId_discordUserId: { guildId, discordUserId } },
    });

    if (existing) {
      await this.prisma.registeredDiscordPlayer.delete({
        where: { id: existing.id },
      });

      await this.prisma.playerRegistrationAudit.create({
        data: {
          guildId,
          action: 'UNLINK',
          discordUserId,
          eaPlayerName: existing.eaPlayerName,
          performedById: actorId,
        },
      });
    }

    return { success: true };
  }

  async getRegistrationAuditLog(guildId: string) {
    return this.prisma.playerRegistrationAudit.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

export function decodeMatchEvents(...buckets: (string | null | undefined)[]) {
  const counts = new Map<number, number>();
  for (const bucket of buckets) {
    if (!bucket || typeof bucket !== 'string') continue;
    for (const item of bucket.split(',')) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        const eventId = parseInt(parts[0], 10);
        const count = parseInt(parts[1], 10);
        if (!isNaN(eventId) && !isNaN(count)) {
          counts.set(eventId, (counts.get(eventId) || 0) + count);
        }
      }
    }
  }

  const e = (id: number) => counts.get(id) || 0;

  return {
    yellowCards: e(95) + e(213),
    fouls: e(2) + e(3),
    penaltiesConceded: e(94),
    cornersConceded: e(10),
    passesFailed: e(216),
    passesForwardSuccess: e(30),
    passesForwardFailed: e(31),
    passesBackwardSuccess: e(32),
    passesBackwardFailed: e(33),
    passesSidewaysSuccess: e(34),
    passesSidewaysFailed: e(35),
    passesShortSuccess: e(24),
    passesShortFailed: e(25),
    passesMediumSuccess: e(26),
    passesMediumFailed: e(27),
    passesLongSuccess: e(28),
    passesLongFailed: e(29),
    crossesSuccess: e(36),
    crossesFailed: e(37),
    offsidePasses: e(153),
    cornersAttempted: e(145),
    crossesAttempted: e(157),
    crossesBlocked: e(156),
    throughBalls: e(152),
    firstTouchPasses: e(143),
    flairPasses: e(147),
    eventGoals: e(214),
    eventAssists: e(11),
    eventSecondAssists: e(115),
    shotsOnTarget: e(217),
    shotsOffTarget: e(218),
    shotsOnTargetInBox: e(13),
    shotsOnTargetOutBox: e(18),
    shotsOffTargetInBox: e(14),
    shotsOffTargetOutBox: e(19),
    shotsSaved: e(202),
    standingTacklesWon: e(229),
    slidingTacklesWon: e(230),
    tacklesLost: e(1),
    dangerousTackles: e(163),
    cleanTackles: e(164),
    dispossessedOpponent: e(158),
    dribblesCompleted: e(174),
    dribbleBeat: Math.max(0, e(112) - e(38)),
    dribbleSkillBeat: e(38),
  };
}

