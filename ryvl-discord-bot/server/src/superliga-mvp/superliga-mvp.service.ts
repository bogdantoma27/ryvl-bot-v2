import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VpgService } from '../vpg/vpg.service';
import { VpgMatchItem } from '../vpg/vpg.types';
import { EaService } from '../ea/ea.service';
import { EaRawMatch, EaMatchPlayerStat } from '../ea/ea.types';
import { mergeEaRawMatch } from '../ea/ea-match-type';
import { pickEaMatch, MATCH_WINDOW_AFTER_MS } from './mvp-matching';
import { buildMvpLeaderboard, MVP_FORMULA_DESCRIPTION, MvpLeaderboardEntry } from './mvp-score';

export const SUPERLIGA_LEAGUE_SLUG = 'Superliga-Romania';
// EA only keeps each club's last few games per category, so a VPG result is only
// linkable for a while after kickoff. After this we stop looking.
export const LINK_GIVE_UP_MS = 72 * 60 * 60 * 1000;
// VPG Superliga games are played as private club friendlies, but check every feed.
const EA_MATCH_TYPES = ['friendlyMatch', 'leagueMatch', 'playoffMatch'];
const EA_PLATFORM = 'common-gen5';

export interface MvpSyncResult {
  leagueSlug: string;
  season: number;
  teamsLinkedToEa: number;
  teamsTotal: number;
  newMatches: number;
  linked: number;
  stillPending: number;
  expired: number;
  errors: string[];
}

export interface MvpLeaderboardResponse {
  leagueSlug: string;
  season: number;
  formula: string;
  minMatches: number;
  totalPlayers: number;
  eligiblePlayers: number;
  matches: { linked: number; pending: number; expired: number };
  lastLinkedAt: string | null;
  entries: MvpLeaderboardEntry[];
}

const int = (v: unknown) => parseInt(String(v ?? 0), 10) || 0;

export function parseMvpPlayerStat(stat: EaMatchPlayerStat) {
  return {
    pos: stat.pos ? String(stat.pos) : null,
    rating: parseFloat(String(stat.rating ?? 0)) || 0,
    goals: int(stat.goals),
    assists: int(stat.assists),
    shots: int(stat.shots),
    passesMade: int(stat.passesmade),
    passAttempts: int(stat.passattempts),
    tacklesMade: int(stat.tacklesmade),
    tackleAttempts: int(stat.tackleattempts),
    saves: int(stat.saves),
    goalsConceded: int(stat.goalsconceded),
    cleanSheetDef: int(stat.cleansheetsdef),
    cleanSheetGk: int(stat.cleansheetsgk),
    mom: stat.mom === true || String(stat.mom) === '1' || String(stat.mom).toLowerCase() === 'true' ? 1 : 0,
    redCards: int(stat.redcards),
    secondsPlayed: int(stat.secondsPlayed ?? stat.secondsplayed),
  };
}

@Injectable()
export class SuperligaMvpService {
  private readonly logger = new Logger(SuperligaMvpService.name);
  private syncing: Promise<MvpSyncResult> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vpg: VpgService,
    private readonly ea: EaService,
  ) {}

  /** Runs one sync at a time; concurrent callers share the running one. */
  sync(leagueSlug = SUPERLIGA_LEAGUE_SLUG): Promise<MvpSyncResult> {
    if (!this.syncing) {
      this.syncing = this.runSync(leagueSlug).finally(() => {
        this.syncing = null;
      });
    }
    return this.syncing;
  }

  private async runSync(leagueSlug: string): Promise<MvpSyncResult> {
    const season = await this.vpg.fetchLatestSeason(leagueSlug);
    const errors: string[] = [];
    const teamsById = await this.refreshTeams(leagueSlug, errors);

    const completed = await this.vpg.fetchAllMatches('complete', season, leagueSlug);
    const newMatches = await this.recordNewMatches(leagueSlug, season, completed);

    const pending = await this.prisma.superligaMvpMatch.findMany({
      where: { leagueSlug, season, status: 'PENDING' },
      orderBy: { kickoffAt: 'asc' },
    });

    const eaCache = new Map<string, EaRawMatch[]>();
    let linked = 0;
    let expired = 0;
    for (const match of pending) {
      try {
        const outcome = await this.tryLink(match, teamsById, eaCache);
        if (outcome === 'LINKED') linked++;
        if (outcome === 'EXPIRED') expired++;
      } catch (err: any) {
        errors.push(`Match ${match.vpgMatchId}: ${err.message}`);
        this.logger.warn(`Superliga MVP link failed for VPG match ${match.vpgMatchId}: ${err.message}`);
      }
    }

    const stillPending = await this.prisma.superligaMvpMatch.count({ where: { leagueSlug, season, status: 'PENDING' } });
    const linkedTeams = [...teamsById.values()].filter((t) => t.eaClubId).length;
    return { leagueSlug, season, teamsLinkedToEa: linkedTeams, teamsTotal: teamsById.size, newMatches, linked, stillPending, expired, errors };
  }

  private async refreshTeams(leagueSlug: string, errors: string[]) {
    const byId = new Map<number, { name: string; eaClubId: string | null }>();
    let teams: Awaited<ReturnType<VpgService['fetchLeagueTeams']>> = [];
    try {
      teams = await this.vpg.fetchLeagueTeams(leagueSlug);
    } catch (err: any) {
      errors.push(`Could not load league teams: ${err.message}`);
    }
    for (const summary of teams) {
      try {
        const team = await this.vpg.fetchTeam(summary.slug);
        await this.prisma.superligaMvpTeam.upsert({
          where: { leagueSlug_vpgTeamId: { leagueSlug, vpgTeamId: team.id } },
          create: { leagueSlug, vpgTeamId: team.id, slug: team.slug, name: team.name, logoUrl: team.logoUrl ?? summary.logoUrl ?? null, eaClubId: team.eaClubId, eaClubName: team.eaClubName },
          update: { slug: team.slug, name: team.name, logoUrl: team.logoUrl ?? summary.logoUrl ?? null, eaClubId: team.eaClubId, eaClubName: team.eaClubName },
        });
      } catch (err: any) {
        errors.push(`Team ${summary.slug}: ${err.message}`);
      }
    }
    // Fall back to the last stored link when VPG is briefly unavailable.
    const stored = await this.prisma.superligaMvpTeam.findMany({ where: { leagueSlug } });
    for (const t of stored) byId.set(t.vpgTeamId, { name: t.name, eaClubId: t.eaClubId });
    return byId;
  }

  private async recordNewMatches(leagueSlug: string, season: number, completed: VpgMatchItem[]): Promise<number> {
    const playable = completed.filter((m) => m.homeScore != null && m.awayScore != null && !Number.isNaN(Date.parse(m.datetime)));
    if (!playable.length) return 0;
    const known = await this.prisma.superligaMvpMatch.findMany({
      where: { vpgMatchId: { in: playable.map((m) => m.id) } },
      select: { vpgMatchId: true },
    });
    const knownIds = new Set(known.map((k) => k.vpgMatchId));
    const now = Date.now();
    let created = 0;
    for (const m of playable) {
      if (knownIds.has(m.id)) continue;
      const kickoffAt = new Date(m.datetime);
      // Results from before tracking started are too old for EA's short match history.
      const tooOld = now - kickoffAt.getTime() > LINK_GIVE_UP_MS;
      const inserted = await this.prisma.superligaMvpMatch.create({
        data: {
          vpgMatchId: m.id,
          leagueSlug,
          season,
          matchDay: m.matchDay || null,
          kickoffAt,
          homeTeamName: m.homeName,
          awayTeamName: m.awayName,
          homeScore: Number(m.homeScore),
          awayScore: Number(m.awayScore),
          status: tooOld ? 'EXPIRED' : 'PENDING',
          lastError: tooOld ? 'Played before Superliga MVP tracking could reach it in EA match history' : null,
        },
      }).then(() => true).catch((err: any) => {
        // A concurrent sync may have inserted it; anything else is a real error.
        if (err?.code !== 'P2002') throw err;
        return false;
      });
      if (inserted) created++;
    }
    return created;
  }

  private async fetchClubMatches(clubId: string, cache: Map<string, EaRawMatch[]>): Promise<EaRawMatch[]> {
    const hit = cache.get(clubId);
    if (hit) return hit;
    const merged = new Map<string, EaRawMatch>();
    for (const type of EA_MATCH_TYPES) {
      try {
        for (const m of await this.ea.fetchMatchesRaw(clubId, type, 10, EA_PLATFORM)) mergeEaRawMatch(merged, m);
      } catch (err: any) {
        this.logger.warn(`EA ${type} fetch failed for club ${clubId}: ${err.message}`);
      }
    }
    const list = [...merged.values()];
    cache.set(clubId, list);
    return list;
  }

  private async tryLink(
    match: { id: string; vpgMatchId: number; kickoffAt: Date; homeScore: number; awayScore: number; homeVpgTeamId: number | null; awayVpgTeamId: number | null; attempts: number },
    teams: Map<number, { name: string; eaClubId: string | null }>,
    eaCache: Map<string, EaRawMatch[]>,
  ): Promise<'LINKED' | 'PENDING' | 'EXPIRED'> {
    let homeTeamId = match.homeVpgTeamId;
    let awayTeamId = match.awayVpgTeamId;
    if (homeTeamId == null || awayTeamId == null) {
      const detail = await this.vpg.fetchMatchDetail(match.vpgMatchId);
      homeTeamId = detail.homeTeamId;
      awayTeamId = detail.awayTeamId;
    }
    const homeEa = homeTeamId != null ? teams.get(homeTeamId)?.eaClubId ?? null : null;
    const awayEa = awayTeamId != null ? teams.get(awayTeamId)?.eaClubId ?? null : null;
    const giveUp = Date.now() - match.kickoffAt.getTime() > LINK_GIVE_UP_MS;

    const base = {
      homeVpgTeamId: homeTeamId,
      awayVpgTeamId: awayTeamId,
      homeEaClubId: homeEa,
      awayEaClubId: awayEa,
      attempts: match.attempts + 1,
      lastAttemptAt: new Date(),
    };

    let found: ReturnType<typeof pickEaMatch> = null;
    let reason = 'Neither team has linked its FC club on its VPG profile';
    if (homeEa || awayEa) {
      const candidates: EaRawMatch[] = [];
      for (const clubId of [homeEa, awayEa]) {
        if (!clubId) continue;
        candidates.push(...(await this.fetchClubMatches(clubId, eaCache)));
        found = pickEaMatch(candidates, { kickoffAt: match.kickoffAt, homeScore: match.homeScore, awayScore: match.awayScore, homeEaClubId: homeEa, awayEaClubId: awayEa });
        if (found) break;
      }
      reason = Date.now() < match.kickoffAt.getTime() + MATCH_WINDOW_AFTER_MS
        ? 'Waiting for the EA match to appear'
        : 'No EA match between these clubs near kickoff';
    }

    if (!found) {
      await this.prisma.superligaMvpMatch.update({
        where: { id: match.id },
        data: { ...base, status: giveUp ? 'EXPIRED' : 'PENDING', lastError: reason },
      });
      return giveUp ? 'EXPIRED' : 'PENDING';
    }

    const { raw, homeEaClubId, awayEaClubId, playedAt, scoreMatches } = found;
    const playerRows: any[] = [];
    for (const [clubId, teamId] of [[homeEaClubId, homeTeamId], [awayEaClubId, awayTeamId]] as const) {
      const teamName = (teamId != null && teams.get(teamId)?.name) || raw.clubs?.[clubId]?.details?.name || 'Unknown';
      for (const [playerProId, stat] of Object.entries(raw.players?.[clubId] || {})) {
        if (!stat || !stat.playername) continue;
        playerRows.push({
          vpgMatchId: match.vpgMatchId,
          eaMatchId: String(raw.matchId),
          eaClubId: clubId,
          teamName,
          playerProId: String(playerProId),
          playerName: String(stat.playername).trim(),
          ...parseMvpPlayerStat(stat),
          raw: stat as any,
          playedAt,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.superligaMvpMatch.update({
        where: { id: match.id },
        data: {
          ...base,
          homeEaClubId,
          awayEaClubId,
          eaMatchId: String(raw.matchId),
          eaPlayedAt: playedAt,
          status: 'LINKED',
          lastError: scoreMatches ? null : 'Linked by teams and time; EA score differs from the VPG result',
          rawPayload: raw as any,
        },
      });
      await tx.superligaMvpPlayerStat.deleteMany({ where: { matchId: row.id } });
      if (playerRows.length) {
        await tx.superligaMvpPlayerStat.createMany({
          data: playerRows.map((p) => ({ ...p, matchId: row.id, leagueSlug: row.leagueSlug, season: row.season })),
          skipDuplicates: true,
        });
      }
    });
    this.logger.log(`Superliga MVP: linked VPG match ${match.vpgMatchId} to EA match ${raw.matchId} (${playerRows.length} players)`);
    return 'LINKED';
  }

  async resolveSeason(leagueSlug = SUPERLIGA_LEAGUE_SLUG, season?: number | null): Promise<number> {
    if (season && season > 0) return season;
    try {
      return await this.vpg.fetchLatestSeason(leagueSlug);
    } catch {
      const latest = await this.prisma.superligaMvpMatch.findFirst({ where: { leagueSlug }, orderBy: { season: 'desc' } });
      if (latest) return latest.season;
      throw new Error('Could not determine the current Superliga season');
    }
  }

  async getLeaderboard(opts: { season?: number | null; minMatches?: number | null; limit?: number | null } = {}): Promise<MvpLeaderboardResponse> {
    const leagueSlug = SUPERLIGA_LEAGUE_SLUG;
    const season = await this.resolveSeason(leagueSlug, opts.season);
    const [rows, counts, lastLinked] = await Promise.all([
      this.prisma.superligaMvpPlayerStat.findMany({ where: { leagueSlug, season } }),
      this.prisma.superligaMvpMatch.groupBy({ by: ['status'], where: { leagueSlug, season }, _count: { _all: true } }),
      this.prisma.superligaMvpMatch.findFirst({ where: { leagueSlug, season, status: 'LINKED' }, orderBy: { eaPlayedAt: 'desc' } }),
    ]);
    const board = buildMvpLeaderboard(rows, opts.minMatches);
    const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 200) : 50;
    return {
      leagueSlug,
      season,
      formula: MVP_FORMULA_DESCRIPTION,
      minMatches: board.minMatches,
      totalPlayers: board.totalPlayers,
      eligiblePlayers: board.eligiblePlayers,
      matches: { linked: count('LINKED'), pending: count('PENDING'), expired: count('EXPIRED') },
      lastLinkedAt: lastLinked?.eaPlayedAt?.toISOString() ?? null,
      entries: board.entries.slice(0, limit),
    };
  }

  async getMatches(season?: number | null) {
    const leagueSlug = SUPERLIGA_LEAGUE_SLUG;
    const resolved = await this.resolveSeason(leagueSlug, season);
    const [matches, teams] = await Promise.all([
      this.prisma.superligaMvpMatch.findMany({
        where: { leagueSlug, season: resolved },
        orderBy: { kickoffAt: 'desc' },
        select: {
          vpgMatchId: true, matchDay: true, kickoffAt: true, homeTeamName: true, awayTeamName: true,
          homeScore: true, awayScore: true, eaMatchId: true, eaPlayedAt: true, status: true,
          attempts: true, lastError: true, _count: { select: { players: true } },
        },
      }),
      this.prisma.superligaMvpTeam.findMany({ where: { leagueSlug }, orderBy: { name: 'asc' } }),
    ]);
    return {
      season: resolved,
      matches: matches.map(({ _count, ...m }) => ({ ...m, playerCount: _count.players })),
      teams: teams.map((t) => ({ name: t.name, slug: t.slug, logoUrl: t.logoUrl, eaClubId: t.eaClubId, eaClubName: t.eaClubName })),
    };
  }
}
