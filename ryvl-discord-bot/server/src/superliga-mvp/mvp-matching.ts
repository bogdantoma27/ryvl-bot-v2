import { EaRawMatch } from '../ea/ea.types';

// Finds the EA Pro Clubs match that corresponds to a VPG Superliga result.
// VPG gives the scheduled kickoff and the reported score; EA gives each club's
// recent games with a finish timestamp. A candidate must involve the linked
// club(s), finish inside the window around kickoff, and ideally match the score.

export const MATCH_WINDOW_BEFORE_MS = 30 * 60 * 1000;
export const MATCH_WINDOW_AFTER_MS = 4 * 60 * 60 * 1000;

export interface VpgMatchForLinking {
  kickoffAt: Date;
  homeScore: number;
  awayScore: number;
  homeEaClubId?: string | null;
  awayEaClubId?: string | null;
}

export interface LinkedEaMatch {
  raw: EaRawMatch;
  homeEaClubId: string;
  awayEaClubId: string;
  scoreMatches: boolean;
  playedAt: Date;
}

export function eaClubGoals(raw: EaRawMatch, clubId: string): number | null {
  const club = raw.clubs?.[clubId];
  if (!club) return null;
  const value = Number(club.score ?? club.goals);
  return Number.isFinite(value) ? value : null;
}

export function pickEaMatch(candidates: EaRawMatch[], vpg: VpgMatchForLinking): LinkedEaMatch | null {
  const home = vpg.homeEaClubId ? String(vpg.homeEaClubId) : null;
  const away = vpg.awayEaClubId ? String(vpg.awayEaClubId) : null;
  if (!home && !away) return null;

  const kickoff = vpg.kickoffAt.getTime();
  const options: LinkedEaMatch[] = [];
  const seen = new Set<string>();

  for (const raw of candidates) {
    if (!raw || !raw.matchId || seen.has(String(raw.matchId))) continue;
    seen.add(String(raw.matchId));
    const clubIds = Object.keys(raw.clubs || {});
    if (clubIds.length !== 2) continue;
    if (home && !clubIds.includes(home)) continue;
    if (away && !clubIds.includes(away)) continue;

    const playedAt = new Date(Number(raw.timestamp || 0) * 1000);
    const at = playedAt.getTime();
    if (at < kickoff - MATCH_WINDOW_BEFORE_MS || at > kickoff + MATCH_WINDOW_AFTER_MS) continue;

    // When only one team linked its club on VPG, the opponent is the other club in the game.
    const homeId = home ?? clubIds.find((id) => id !== away)!;
    const awayId = away ?? clubIds.find((id) => id !== home)!;
    const scoreMatches = eaClubGoals(raw, homeId) === vpg.homeScore && eaClubGoals(raw, awayId) === vpg.awayScore;
    options.push({ raw, homeEaClubId: homeId, awayEaClubId: awayId, scoreMatches, playedAt });
  }

  if (!options.length) return null;
  // With only one linked club we cannot confirm the opponent, so insist on the score.
  const pool = home && away ? options : options.filter((o) => o.scoreMatches);
  if (!pool.length) return null;

  // Prefer a game whose score equals the reported result, then the one closest to a
  // full game after kickoff (EA timestamps mark the end of the game).
  const typicalEnd = kickoff + 25 * 60 * 1000;
  pool.sort(
    (a, b) =>
      Number(b.scoreMatches) - Number(a.scoreMatches) ||
      Math.abs(a.playedAt.getTime() - typicalEnd) - Math.abs(b.playedAt.getTime() - typicalEnd),
  );
  return pool[0];
}
