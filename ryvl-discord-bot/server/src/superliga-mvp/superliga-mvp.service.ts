import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VpgService } from '../vpg/vpg.service';
import { VpgMatchItem } from '../vpg/vpg.types';
import { EaService } from '../ea/ea.service';
import { EaRawMatch, EaMatchPlayerStat } from '../ea/ea.types';
import { mergeEaRawMatch } from '../ea/ea-match-type';
import { pickEaMatch } from './mvp-matching';
import { buildMvpLeaderboard, totwCounter, MVP_FORMULA_DESCRIPTION, MvpLeaderboardEntry } from './mvp-score';

import { SUPERLIGA_LEAGUE_SLUG } from '../vpg/league.constants';

export { SUPERLIGA_LEAGUE_SLUG };
// EA only keeps each club's last few games per category, so a VPG result is only
// linkable for a while after it is played. We look for this long after the later of
// kickoff and the moment the result appeared on VPG (a rescheduled game can be
// reported days after its original kickoff).
export const LINK_GIVE_UP_MS = 72 * 60 * 60 * 1000;
// A fixture still not reported this long after kickoff is shown as not played yet.
export const OVERDUE_AFTER_MS = 4 * 60 * 60 * 1000;
// After the season changes, an earlier season's fixture that is still unplayed this long
// after kickoff is closed as cancelled, so the sync stops looking at that season.
export const PREVIOUS_SEASON_CLOSE_MS = 30 * 24 * 60 * 60 * 1000;
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
  matches: { linked: number; pending: number; expired: number; scheduled: number; overdue: number; cancelled: number };
  totwWeeks: number;
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
    let scheduled: VpgMatchItem[] | null = null;
    try {
      scheduled = await this.vpg.fetchAllMatches('scheduled', season, leagueSlug);
    } catch (err: any) {
      errors.push(`Could not load upcoming fixtures: ${err.message}`);
    }
    const newMatches = await this.syncFixtures(leagueSlug, season, completed, scheduled);

    const eaCache = new Map<string, EaRawMatch[]>();
    const counts = { linked: 0, expired: 0 };
    await this.linkPending(leagueSlug, season, teamsById, eaCache, counts, errors);
    await this.syncPreviousSeasons(leagueSlug, season, teamsById, eaCache, counts, errors);
    const { linked, expired } = counts;

    const stillPending = await this.prisma.superligaMvpMatch.count({ where: { leagueSlug, season, status: 'PENDING' } });
    const linkedTeams = [...teamsById.values()].filter((t) => t.eaClubId).length;
    return { leagueSlug, season, teamsLinkedToEa: linkedTeams, teamsTotal: teamsById.size, newMatches, linked, stillPending, expired, errors };
  }

  private async linkPending(
    leagueSlug: string,
    season: number,
    teamsById: Map<number, { name: string; eaClubId: string | null }>,
    eaCache: Map<string, EaRawMatch[]>,
    counts: { linked: number; expired: number },
    errors: string[],
  ): Promise<void> {
    const pending = await this.prisma.superligaMvpMatch.findMany({
      where: { leagueSlug, season, status: 'PENDING' },
      orderBy: { kickoffAt: 'asc' },
    });
    for (const match of pending) {
      try {
        const outcome = await this.tryLink(match, teamsById, eaCache);
        if (outcome === 'LINKED') counts.linked++;
        if (outcome === 'EXPIRED') counts.expired++;
      } catch (err: any) {
        errors.push(`Match ${match.vpgMatchId}: ${err.message}`);
        this.logger.warn(`Superliga MVP link failed for VPG match ${match.vpgMatchId}: ${err.message}`);
      }
    }
  }

  /**
   * When VPG moves to a new season, the last games of the previous one can still be
   * waiting for their EA match or be reported late. Keep syncing an earlier season while
   * it has open fixtures: its late results are picked up, pending ones are linked or
   * expire as usual, and fixtures never played are eventually closed as cancelled.
   */
  private async syncPreviousSeasons(
    leagueSlug: string,
    currentSeason: number,
    teamsById: Map<number, { name: string; eaClubId: string | null }>,
    eaCache: Map<string, EaRawMatch[]>,
    counts: { linked: number; expired: number },
    errors: string[],
  ): Promise<void> {
    const closeBefore = new Date(Date.now() - PREVIOUS_SEASON_CLOSE_MS);
    const open = await this.prisma.superligaMvpMatch.groupBy({
      by: ['season'],
      where: {
        leagueSlug,
        season: { lt: currentSeason },
        OR: [{ status: 'PENDING' }, { status: 'SCHEDULED', kickoffAt: { gte: closeBefore } }],
      },
    });
    for (const { season } of open) {
      try {
        const completed = await this.vpg.fetchAllMatches('complete', season, leagueSlug);
        const scheduled = await this.vpg.fetchAllMatches('scheduled', season, leagueSlug);
        await this.syncFixtures(leagueSlug, season, completed, scheduled);
      } catch (err: any) {
        errors.push(`Season ${season}: ${err.message}`);
      }
      await this.linkPending(leagueSlug, season, teamsById, eaCache, counts, errors);
    }
    await this.prisma.superligaMvpMatch.updateMany({
      where: { leagueSlug, season: { lt: currentSeason }, status: 'SCHEDULED', kickoffAt: { lt: closeBefore } },
      data: { status: 'CANCELLED', lastError: 'The season ended without a result for this fixture' },
    });
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

  /**
   * Keeps one row per Superliga fixture: upcoming ones as SCHEDULED (following any
   * kickoff change VPG makes), and completed ones as PENDING until their EA match is
   * found. Returns how many results were newly seen as complete.
   */
  private async syncFixtures(leagueSlug: string, season: number, completed: VpgMatchItem[], scheduled: VpgMatchItem[] | null) {
    const valid = (m: VpgMatchItem) => Number.isFinite(m.id) && !Number.isNaN(Date.parse(m.datetime));
    const done = completed.filter((m) => valid(m) && m.homeScore != null && m.awayScore != null);
    const upcoming = (scheduled ?? []).filter(valid);
    const existing = await this.prisma.superligaMvpMatch.findMany({ where: { leagueSlug, season } });
    const byId = new Map(existing.map((r) => [r.vpgMatchId, r]));
    // On the very first sync of a season, results older than the EA history were played
    // before tracking started. Later, any newly completed result is fresh, even when its
    // kickoff is old because the game was rescheduled.
    const isBackfill = existing.length === 0;
    const now = new Date();

    const kickoffChange = (row: (typeof existing)[number] | undefined, kickoffAt: Date) =>
      row && row.kickoffAt.getTime() !== kickoffAt.getTime()
        ? { kickoffAt, originalKickoffAt: row.originalKickoffAt ?? row.kickoffAt }
        : {};
    const create = (data: any) =>
      this.prisma.superligaMvpMatch.create({ data }).then(() => true).catch((err: any) => {
        // Another server process may have inserted it; anything else is a real error.
        if (err?.code !== 'P2002') throw err;
        return false;
      });

    for (const m of upcoming) {
      const kickoffAt = new Date(m.datetime);
      const row = byId.get(m.id);
      if (!row) {
        await create({ vpgMatchId: m.id, leagueSlug, season, matchDay: m.matchDay || null, kickoffAt, homeTeamName: m.homeName, awayTeamName: m.awayName, status: 'SCHEDULED' });
      } else if (row.status === 'SCHEDULED' || row.status === 'CANCELLED') {
        await this.prisma.superligaMvpMatch.update({
          where: { id: row.id },
          data: { status: 'SCHEDULED', homeTeamName: m.homeName, awayTeamName: m.awayName, matchDay: m.matchDay || row.matchDay, ...kickoffChange(row, kickoffAt) },
        });
      }
    }

    let newlyCompleted = 0;
    for (const m of done) {
      const kickoffAt = new Date(m.datetime);
      const scores = { homeScore: Number(m.homeScore), awayScore: Number(m.awayScore) };
      const row = byId.get(m.id);
      if (!row) {
        const tooOld = isBackfill && now.getTime() - kickoffAt.getTime() > LINK_GIVE_UP_MS;
        const inserted = await create({
          vpgMatchId: m.id, leagueSlug, season, matchDay: m.matchDay || null, kickoffAt,
          homeTeamName: m.homeName, awayTeamName: m.awayName, ...scores, completedAt: now,
          status: tooOld ? 'EXPIRED' : 'PENDING',
          lastError: tooOld ? 'Played before Superliga MVP tracking could reach it in EA match history' : null,
        });
        if (inserted) newlyCompleted++;
      } else if (row.status === 'SCHEDULED' || row.status === 'CANCELLED') {
        await this.prisma.superligaMvpMatch.update({
          where: { id: row.id },
          data: { ...scores, ...kickoffChange(row, kickoffAt), status: 'PENDING', completedAt: now, lastError: null },
        });
        newlyCompleted++;
      } else if (row.homeScore !== scores.homeScore || row.awayScore !== scores.awayScore) {
        // A corrected result. Stats already stored stay; an unlinked match retries with the new score.
        await this.prisma.superligaMvpMatch.update({ where: { id: row.id }, data: scores });
      }
    }

    // A fixture that disappeared from both lists was removed from the calendar.
    if (scheduled) {
      const listed = new Set([...done, ...upcoming].map((m) => m.id));
      const gone = existing.filter((r) => r.status === 'SCHEDULED' && !listed.has(r.vpgMatchId)).map((r) => r.id);
      if (gone.length) await this.prisma.superligaMvpMatch.updateMany({ where: { id: { in: gone } }, data: { status: 'CANCELLED' } });
    }
    return newlyCompleted;
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
    match: { id: string; vpgMatchId: number; kickoffAt: Date; completedAt: Date | null; createdAt: Date; homeScore: number | null; awayScore: number | null; homeVpgTeamId: number | null; awayVpgTeamId: number | null; attempts: number },
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
    const reportedAt = match.completedAt ?? match.createdAt;
    const giveUp = Date.now() - Math.max(match.kickoffAt.getTime(), reportedAt.getTime()) > LINK_GIVE_UP_MS;

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
        found = pickEaMatch(candidates, { kickoffAt: match.kickoffAt, reportedAt, homeScore: match.homeScore ?? 0, awayScore: match.awayScore ?? 0, homeEaClubId: homeEa, awayEaClubId: awayEa });
        if (found) break;
      }
      reason = giveUp ? 'No EA match between these clubs was found' : 'Waiting for the EA match to appear';
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
    const [rows, counts, lastLinked, totw, overdue] = await Promise.all([
      this.prisma.superligaMvpPlayerStat.findMany({ where: { leagueSlug, season } }),
      this.prisma.superligaMvpMatch.groupBy({ by: ['status'], where: { leagueSlug, season }, _count: { _all: true } }),
      this.prisma.superligaMvpMatch.findFirst({ where: { leagueSlug, season, status: 'LINKED' }, orderBy: { eaPlayedAt: 'desc' } }),
      this.prisma.superligaMvpTotwSelection.findMany({ where: { leagueSlug, season } }),
      this.prisma.superligaMvpMatch.count({ where: { leagueSlug, season, status: 'SCHEDULED', kickoffAt: { lt: new Date(Date.now() - OVERDUE_AFTER_MS) } } }),
    ]);
    const countTotw = totwCounter(totw.map((t) => ({ names: [t.vpgUsername, ...t.eaNames] })));
    const board = buildMvpLeaderboard(rows, opts.minMatches, countTotw);
    const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 200) : 50;
    return {
      leagueSlug,
      season,
      formula: MVP_FORMULA_DESCRIPTION,
      minMatches: board.minMatches,
      totalPlayers: board.totalPlayers,
      eligiblePlayers: board.eligiblePlayers,
      matches: {
        linked: count('LINKED'),
        pending: count('PENDING'),
        expired: count('EXPIRED'),
        scheduled: count('SCHEDULED') - overdue,
        overdue,
        cancelled: count('CANCELLED'),
      },
      totwWeeks: new Set(totw.map((t) => t.week)).size,
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
        orderBy: [{ kickoffAt: 'desc' }, { vpgMatchId: 'desc' }],
        select: {
          vpgMatchId: true, matchDay: true, kickoffAt: true, originalKickoffAt: true, completedAt: true, homeTeamName: true, awayTeamName: true,
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
