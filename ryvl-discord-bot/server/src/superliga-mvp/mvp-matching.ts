import { EaRawMatch } from '../ea/ea.types';

// Finds the EA Pro Clubs match that corresponds to a VPG Superliga result.
// VPG gives the scheduled kickoff and the reported score; EA gives each club's
// recent games with a finish timestamp. A candidate must involve the linked
// club(s), finish inside the window, and ideally match the score.
//
// The window runs from shortly before kickoff to a few hours after it, or up to
// when the result was reported if that is later. That covers rescheduled games,
// where VPG can keep the original kickoff but the game is played days later.

export const MATCH_WINDOW_BEFORE_MS = 30 * 60 * 1000;
export const MATCH_WINDOW_AFTER_MS = 4 * 60 * 60 * 1000;

export interface VpgMatchForLinking {
  kickoffAt: Date;
  homeScore: number;
  awayScore: number;
  homeEaClubId?: string | null;
  awayEaClubId?: string | null;
  /** When the bot first saw the result as complete on VPG. */
  reportedAt?: Date | null;
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
  const reported = vpg.reportedAt ? vpg.reportedAt.getTime() : 0;
  const windowEnd = Math.max(kickoff + MATCH_WINDOW_AFTER_MS, reported + MATCH_WINDOW_BEFORE_MS);
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
    if (at < kickoff - MATCH_WINDOW_BEFORE_MS || at > windowEnd) continue;

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

  // Prefer a game whose score equals the reported result. Then, for a result reported
  // on time, the game ending closest to a full game after kickoff (EA timestamps mark
  // the end of the game); for a late result, the last game before it was reported.
  const anchor = reported > kickoff + MATCH_WINDOW_AFTER_MS ? reported : kickoff + 25 * 60 * 1000;
  pool.sort(
    (a, b) =>
      Number(b.scoreMatches) - Number(a.scoreMatches) ||
      Math.abs(a.playedAt.getTime() - anchor) - Math.abs(b.playedAt.getTime() - anchor),
  );
  return pool[0];
}
