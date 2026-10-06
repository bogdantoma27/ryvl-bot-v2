// Pure tournament rules shared by the Discord bot and the admin dashboard API.
// Kept free of Nest/Prisma/Discord imports so the rules can be unit tested directly.

export const DRAFT_FORMATIONS: Record<string, string[]> = {
  '3-1-4-2': ['GK', 'LCB', 'CCB', 'RCB', 'CDM', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'],
  '3-5-2': ['GK', 'LCB', 'CCB', 'RCB', 'CM', 'CM', 'LM', 'RM', 'CAM', 'ST', 'ST'],
};

export const DRAFT_JOKERS_PER_TEAM = 4;
export const STANDARD_MAX_TEAMS = 32;
export const DRAFT_MAX_SIGNUPS = 150;

export type TournamentType = 'STANDARD' | 'DRAFT';
export type TournamentStatus =
  | 'SIGNUPS_OPEN'
  | 'SIGNUPS_CLOSED'
  | 'DRAFTING'
  | 'ACTIVE'
  | 'COMPLETED';

export interface TournamentSignupItem {
  id: string;
  userId: string;
  displayName: string;
  gamertag: string;
  teamName?: string;
  pos1?: string;
  pos2?: string;
  isBackup?: boolean;
  isManager?: boolean;
  notes?: string;
  createdAt: string;
}

export interface TournamentPick {
  userId: string;
  displayName: string;
  gamertag?: string;
  position: string;
  isManager?: boolean;
}

export interface TournamentTeam {
  id: string;
  name: string;
  crestUrl?: string;
  managerId?: string;
  managerName?: string;
  picks: TournamentPick[];
}

export interface TournamentMatchItem {
  id: string;
  round?: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeScore: number;
  awayScore: number;
  completed: boolean;
  date?: string;
  reportedBy?: string;
}

export interface DraftPickRecord {
  teamIndex: number;
  teamName: string;
  userId: string;
  gamertag: string;
  displayName: string;
  position: string;
}

export interface DraftState {
  snakeOrder: number[];
  currentTurn: number;
  teamJokers: Record<number, number>;
  currentLockedPosition?: string | null;
  currentCandidate?: TournamentSignupItem | null;
  /** True when the candidate was drawn from the whole pool because nobody plays that position. */
  currentCandidateWildcard?: boolean;
  picks: DraftPickRecord[];
  complete: boolean;
}

export interface TournamentStandingsRow {
  rank: number;
  team: string;
  crestUrl?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export function normalizeDraftFormation(formation?: string): string {
  if (!formation) return '3-1-4-2';
  const clean = formation.replace(/[^0-9]/g, '');
  if (clean === '352') return '3-5-2';
  return '3-1-4-2';
}

export function getFormationSlots(formation?: string): string[] {
  return DRAFT_FORMATIONS[normalizeDraftFormation(formation)];
}

export function getBasePositions(formation?: string): string[] {
  return Array.from(new Set(getFormationSlots(formation)));
}

/** Groups equivalent positions so a signup for "CB" can fill LCB/CCB/RCB, "LW" can fill LM, etc. */
export function positionFamily(position?: string | null): string {
  const p = String(position || '').trim().toUpperCase();
  if (['CB', 'LCB', 'CCB', 'RCB'].includes(p)) return 'CB';
  if (['LM', 'LW', 'LWB', 'LB'].includes(p)) return 'LM';
  if (['RM', 'RW', 'RWB', 'RB'].includes(p)) return 'RM';
  if (['ST', 'CF', 'LS', 'RS'].includes(p)) return 'ST';
  if (['CM', 'LCM', 'RCM'].includes(p)) return 'CM';
  return p;
}

/** Formation slots a team still has to fill, one entry per free slot (e.g. CM twice in 3-1-4-2). */
export function openSlots(formation: string | undefined, picks: TournamentPick[]): string[] {
  const remaining = [...getFormationSlots(formation)];
  for (const pick of picks) {
    const idx = remaining.indexOf(pick.position);
    if (idx >= 0) remaining.splice(idx, 1);
  }
  return remaining;
}

/** Resolves what a captain typed (e.g. "cb") to a free slot of their team (e.g. "LCB"). */
export function resolveOpenSlot(
  formation: string | undefined,
  picks: TournamentPick[],
  requested: string,
): string | null {
  const free = openSlots(formation, picks);
  const wanted = String(requested || '').trim().toUpperCase();
  if (free.includes(wanted)) return wanted;
  const family = positionFamily(wanted);
  return free.find((slot) => positionFamily(slot) === family) ?? null;
}

export function draftPool(signups: TournamentSignupItem[], draft: DraftState): TournamentSignupItem[] {
  const picked = new Set(draft.picks.map((p) => p.userId));
  return signups.filter((s) => !s.isManager && !s.isBackup && !picked.has(s.userId));
}

/**
 * Picks a random player for a position: primary position first, then secondary,
 * then anyone left so the draft never gets stuck on an empty position.
 */
export function drawCandidate(
  pool: TournamentSignupItem[],
  position: string,
  excludeUserIds: string[] = [],
  random: () => number = Math.random,
): { candidate: TournamentSignupItem; wildcard: boolean } | null {
  const family = positionFamily(position);
  const available = pool.filter((s) => !excludeUserIds.includes(s.userId));
  if (available.length === 0) return null;
  const tiers = [
    available.filter((s) => positionFamily(s.pos1) === family),
    available.filter((s) => positionFamily(s.pos2) === family),
  ];
  for (const tier of tiers) {
    if (tier.length > 0) return { candidate: tier[Math.floor(random() * tier.length)], wildcard: false };
  }
  return { candidate: available[Math.floor(random() * available.length)], wildcard: true };
}

export function buildSnakeOrder(numTeams: number, rounds: number): number[] {
  const order: number[] = [];
  for (let round = 0; round < rounds; round++) {
    const roundOrder = Array.from({ length: numTeams }, (_, i) => i);
    if (round % 2 === 1) roundOrder.reverse();
    order.push(...roundOrder);
  }
  return order;
}

/**
 * Draft teams are the managers who signed up. Each manager is the first player of
 * their own team, placed in the slot that matches their main position.
 */
export function buildDraftTeams(
  signups: TournamentSignupItem[],
  formation: string | undefined,
): { teams: TournamentTeam[]; draft: DraftState } {
  const managers = signups.filter((s) => s.isManager && !s.isBackup);
  const teams: TournamentTeam[] = managers.map((m, idx) => {
    const slot = resolveOpenSlot(formation, [], m.pos1 || '') ?? getFormationSlots(formation)[1];
    return {
      id: `team_${idx + 1}`,
      name: m.teamName || `${m.displayName}'s Team`,
      managerId: m.userId,
      managerName: m.displayName,
      picks: [{ userId: m.userId, displayName: m.displayName, gamertag: m.gamertag, position: slot, isManager: true }],
    };
  });
  const rounds = getFormationSlots(formation).length - 1;
  const teamJokers: Record<number, number> = {};
  teams.forEach((_, idx) => (teamJokers[idx] = DRAFT_JOKERS_PER_TEAM));
  return {
    teams,
    draft: {
      snakeOrder: buildSnakeOrder(teams.length, rounds),
      currentTurn: 0,
      teamJokers,
      currentLockedPosition: null,
      currentCandidate: null,
      currentCandidateWildcard: false,
      picks: [],
      complete: false,
    },
  };
}

/** Standard tournaments: every accepted signup is a team captained by the person who signed up. */
export function bracketSizeFor(total: number): number {
  if (total >= 32) return 32;
  if (total >= 16) return 16;
  if (total >= 8) return 8;
  return 0;
}

export function buildStandardTeams(accepted: TournamentSignupItem[]): TournamentTeam[] {
  return accepted.map((s, idx) => ({
    id: `team_${idx + 1}`,
    name: s.teamName || `${s.displayName}'s Team`,
    managerId: s.userId,
    managerName: s.displayName,
    picks: [],
  }));
}

/** Single round-robin (circle method). Every team plays every other team once. */
export function generateRoundRobin(teams: TournamentTeam[]): TournamentMatchItem[] {
  const ids: (TournamentTeam | null)[] = [...teams];
  if (ids.length < 2) return [];
  if (ids.length % 2 === 1) ids.push(null);
  const n = ids.length;
  const matches: TournamentMatchItem[] = [];
  let rotation = [...ids];
  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];
      if (!a || !b) continue;
      // Alternate home/away so the fixed team is not always at home.
      const [home, away] = round % 2 === 0 ? [a, b] : [b, a];
      matches.push({
        id: `match_r${round + 1}_${matches.length + 1}`,
        round: round + 1,
        homeTeam: home.name,
        awayTeam: away.name,
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeScore: 0,
        awayScore: 0,
        completed: false,
      });
    }
    rotation = [rotation[0], rotation[n - 1], ...rotation.slice(1, n - 1)];
  }
  return matches;
}

export function calculateStandings(teams: TournamentTeam[], matches: TournamentMatchItem[]): TournamentStandingsRow[] {
  const blank = () => ({ played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, pts: 0 });
  const statsMap = new Map<string, ReturnType<typeof blank>>();
  for (const team of teams) statsMap.set(team.name, blank());

  for (const m of matches) {
    if (!m.completed) continue;
    const home = statsMap.get(m.homeTeam) || blank();
    const away = statsMap.get(m.awayTeam) || blank();
    home.played++;
    away.played++;
    home.gf += m.homeScore;
    home.ga += m.awayScore;
    away.gf += m.awayScore;
    away.ga += m.homeScore;
    if (m.homeScore > m.awayScore) {
      home.wins++;
      home.pts += 3;
      away.losses++;
    } else if (m.homeScore < m.awayScore) {
      away.wins++;
      away.pts += 3;
      home.losses++;
    } else {
      home.draws++;
      home.pts++;
      away.draws++;
      away.pts++;
    }
    statsMap.set(m.homeTeam, home);
    statsMap.set(m.awayTeam, away);
  }

  const rows: TournamentStandingsRow[] = Array.from(statsMap.entries()).map(([team, s]) => ({
    rank: 1,
    team,
    played: s.played,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
    goalsFor: s.gf,
    goalsAgainst: s.ga,
    goalDifference: s.gf - s.ga,
    points: s.pts,
  }));
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.team.localeCompare(b.team),
  );
  rows.forEach((r, idx) => (r.rank = idx + 1));
  return rows;
}

/** Adds or replaces a signup. Throws a user-facing message string when the signup is not allowed. */
export function upsertSignup(
  signups: TournamentSignupItem[],
  entry: TournamentSignupItem,
  type: TournamentType,
): TournamentSignupItem[] {
  const next = [...signups];
  const existingIdx = next.findIndex((s) => s.userId === entry.userId);
  if (existingIdx >= 0) {
    next[existingIdx] = { ...next[existingIdx], ...entry, id: next[existingIdx].id, createdAt: next[existingIdx].createdAt };
    return next;
  }
  const cap = type === 'DRAFT' ? DRAFT_MAX_SIGNUPS : STANDARD_MAX_TEAMS;
  if (next.length >= cap) {
    throw new Error(
      type === 'DRAFT'
        ? `Turneul este complet (maxim ${cap} jucători înscriși).`
        : `Turneul este deja complet (maxim ${cap} echipe).`,
    );
  }
  next.push(entry);
  return next;
}

export function teamForUser(teams: TournamentTeam[], userId: string): TournamentTeam | undefined {
  return teams.find((t) => t.managerId === userId);
}
