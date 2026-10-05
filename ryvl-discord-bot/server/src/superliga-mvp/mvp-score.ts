// Superliga MVP score. Pure functions so the formula can be tested and changed in one place.
//
// Each stat has a different scale (goals per match vs pass accuracy %), so a raw median
// would be meaningless. Instead every stat is turned into a percentile rank (0-100) among
// the eligible players of the same role, and the MVP score is the median of those
// percentiles. Goalkeepers are ranked on goalkeeper stats against other goalkeepers;
// everyone else on outfield stats against other outfield players.

export type MvpRole = 'GK' | 'OUTFIELD';

export interface MvpStatRow {
  playerName: string;
  teamName: string;
  pos?: string | null;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  passesMade: number;
  passAttempts: number;
  tacklesMade: number;
  tackleAttempts: number;
  saves: number;
  goalsConceded: number;
  cleanSheetDef: number;
  cleanSheetGk: number;
  mom: number;
  redCards: number;
  playedAt: Date;
}

export interface MvpTotals {
  matches: number;
  goals: number;
  assists: number;
  shots: number;
  passesMade: number;
  passAttempts: number;
  tacklesMade: number;
  tackleAttempts: number;
  saves: number;
  goalsConceded: number;
  cleanSheets: number;
  mom: number;
  redCards: number;
  ratingSum: number;
}

export interface MvpMetricDef {
  key: string;
  label: string;
  higherIsBetter: boolean;
  value: (t: MvpTotals) => number;
}

const perMatch = (n: number, t: MvpTotals) => (t.matches > 0 ? n / t.matches : 0);
const ratio = (made: number, attempts: number) => (attempts > 0 ? (made / attempts) * 100 : 0);

export const OUTFIELD_METRICS: MvpMetricDef[] = [
  { key: 'rating', label: 'Avg rating', higherIsBetter: true, value: (t) => perMatch(t.ratingSum, t) },
  { key: 'goals', label: 'Goals / match', higherIsBetter: true, value: (t) => perMatch(t.goals, t) },
  { key: 'assists', label: 'Assists / match', higherIsBetter: true, value: (t) => perMatch(t.assists, t) },
  { key: 'shots', label: 'Shots / match', higherIsBetter: true, value: (t) => perMatch(t.shots, t) },
  { key: 'passes', label: 'Passes / match', higherIsBetter: true, value: (t) => perMatch(t.passesMade, t) },
  { key: 'passAccuracy', label: 'Pass accuracy %', higherIsBetter: true, value: (t) => ratio(t.passesMade, t.passAttempts) },
  { key: 'tackles', label: 'Tackles / match', higherIsBetter: true, value: (t) => perMatch(t.tacklesMade, t) },
  { key: 'tackleSuccess', label: 'Tackle success %', higherIsBetter: true, value: (t) => ratio(t.tacklesMade, t.tackleAttempts) },
  { key: 'cleanSheets', label: 'Clean sheets / match', higherIsBetter: true, value: (t) => perMatch(t.cleanSheets, t) },
  { key: 'motm', label: 'MOTM / match', higherIsBetter: true, value: (t) => perMatch(t.mom, t) },
  { key: 'redCards', label: 'Red cards / match', higherIsBetter: false, value: (t) => perMatch(t.redCards, t) },
];

export const GK_METRICS: MvpMetricDef[] = [
  { key: 'rating', label: 'Avg rating', higherIsBetter: true, value: (t) => perMatch(t.ratingSum, t) },
  { key: 'saves', label: 'Saves / match', higherIsBetter: true, value: (t) => perMatch(t.saves, t) },
  { key: 'cleanSheets', label: 'Clean sheets / match', higherIsBetter: true, value: (t) => perMatch(t.cleanSheets, t) },
  { key: 'goalsConceded', label: 'Conceded / match', higherIsBetter: false, value: (t) => perMatch(t.goalsConceded, t) },
  { key: 'passAccuracy', label: 'Pass accuracy %', higherIsBetter: true, value: (t) => ratio(t.passesMade, t.passAttempts) },
  { key: 'motm', label: 'MOTM / match', higherIsBetter: true, value: (t) => perMatch(t.mom, t) },
  { key: 'redCards', label: 'Red cards / match', higherIsBetter: false, value: (t) => perMatch(t.redCards, t) },
];

export const MVP_FORMULA_DESCRIPTION =
  'Each stat is converted to a percentile rank (0-100) among eligible players of the same role ' +
  '(goalkeepers vs outfield), and the MVP score is the median of those percentiles. ' +
  'Stats are per-match averages, plus pass and tackle accuracy. Red cards and goals conceded count against. ' +
  'Players need at least the minimum number of tracked Superliga matches to be ranked.';

export interface MvpLeaderboardEntry {
  rank: number;
  playerName: string;
  teamName: string;
  role: MvpRole;
  matches: number;
  score: number;
  totals: MvpTotals;
  metrics: Array<{ key: string; label: string; value: number; percentile: number }>;
}

export interface MvpLeaderboardResult {
  minMatches: number;
  totalPlayers: number;
  eligiblePlayers: number;
  entries: MvpLeaderboardEntry[];
}

export function isGoalkeeperPos(pos?: string | null): boolean {
  const p = String(pos ?? '').trim().toLowerCase();
  return p === 'goalkeeper' || p === 'gk' || p === '0';
}

export function playerKey(name: string): string {
  return String(name || '').trim().toLowerCase();
}

/** Percentile rank in [0, 100] using the mid-rank for ties. A lone player gets 100. */
export function percentileRank(value: number, all: number[], higherIsBetter: boolean): number {
  const n = all.length;
  if (n <= 1) return 100;
  let below = 0;
  let equal = 0;
  for (const v of all) {
    const better = higherIsBetter ? value > v : value < v;
    if (better) below++;
    else if (v === value) equal++;
  }
  // equal includes the player itself
  return ((below + (equal - 1) / 2) / (n - 1)) * 100;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

interface PlayerAgg {
  playerName: string;
  teamName: string;
  latestAt: number;
  gkMatches: number;
  totals: MvpTotals;
}

export function aggregatePlayers(rows: MvpStatRow[]): PlayerAgg[] {
  const byKey = new Map<string, PlayerAgg>();
  for (const r of rows) {
    const key = playerKey(r.playerName);
    if (!key) continue;
    let agg = byKey.get(key);
    if (!agg) {
      agg = {
        playerName: r.playerName.trim(),
        teamName: r.teamName,
        latestAt: 0,
        gkMatches: 0,
        totals: {
          matches: 0, goals: 0, assists: 0, shots: 0, passesMade: 0, passAttempts: 0,
          tacklesMade: 0, tackleAttempts: 0, saves: 0, goalsConceded: 0, cleanSheets: 0,
          mom: 0, redCards: 0, ratingSum: 0,
        },
      };
      byKey.set(key, agg);
    }
    const t = agg.totals;
    const gk = isGoalkeeperPos(r.pos);
    t.matches++;
    t.goals += r.goals;
    t.assists += r.assists;
    t.shots += r.shots;
    t.passesMade += r.passesMade;
    t.passAttempts += r.passAttempts;
    t.tacklesMade += r.tacklesMade;
    t.tackleAttempts += r.tackleAttempts;
    t.saves += r.saves;
    t.goalsConceded += r.goalsConceded;
    t.cleanSheets += gk ? r.cleanSheetGk : r.cleanSheetDef;
    t.mom += r.mom;
    t.redCards += r.redCards;
    t.ratingSum += r.rating;
    if (gk) agg.gkMatches++;
    const at = r.playedAt instanceof Date ? r.playedAt.getTime() : new Date(r.playedAt).getTime();
    // Show the club the player most recently played for (players can transfer mid-season).
    if (at >= agg.latestAt) {
      agg.latestAt = at;
      agg.teamName = r.teamName;
      agg.playerName = r.playerName.trim();
    }
  }
  return [...byKey.values()];
}

/** Default eligibility: half the matches of the most active player, at least 1. */
export function defaultMinMatches(maxMatches: number): number {
  return Math.max(1, Math.ceil(maxMatches / 2));
}

export function buildMvpLeaderboard(rows: MvpStatRow[], minMatches?: number | null): MvpLeaderboardResult {
  const players = aggregatePlayers(rows);
  const maxMatches = players.reduce((m, p) => Math.max(m, p.totals.matches), 0);
  const threshold = minMatches && minMatches > 0 ? Math.floor(minMatches) : defaultMinMatches(maxMatches);
  const eligible = players.filter((p) => p.totals.matches >= threshold);

  const scored: Omit<MvpLeaderboardEntry, 'rank'>[] = [];
  for (const role of ['GK', 'OUTFIELD'] as MvpRole[]) {
    const group = eligible.filter((p) => (p.gkMatches * 2 > p.totals.matches ? 'GK' : 'OUTFIELD') === role);
    const defs = role === 'GK' ? GK_METRICS : OUTFIELD_METRICS;
    const columns = defs.map((d) => group.map((p) => d.value(p.totals)));
    for (const p of group) {
      const metrics = defs.map((d, i) => {
        const value = d.value(p.totals);
        return { key: d.key, label: d.label, value: Math.round(value * 100) / 100, percentile: round1(percentileRank(value, columns[i], d.higherIsBetter)) };
      });
      scored.push({
        playerName: p.playerName,
        teamName: p.teamName,
        role,
        matches: p.totals.matches,
        score: round1(median(metrics.map((m) => m.percentile))),
        totals: p.totals,
        metrics,
      });
    }
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.totals.ratingSum / b.matches - a.totals.ratingSum / a.matches ||
      b.matches - a.matches ||
      a.playerName.localeCompare(b.playerName),
  );

  return {
    minMatches: threshold,
    totalPlayers: players.length,
    eligiblePlayers: eligible.length,
    entries: scored.map((e, i) => ({ ...e, rank: i + 1 })),
  };
}
