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
  /** Group letter in a group-stage tournament. */
  group?: string;
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
  /** Set on group-stage tournaments; matches without it belong to a plain league. */
  stage?: 'GROUP' | 'KNOCKOUT';
  group?: string;
  /** Penalty shoot-out score, only for knockout matches level after extra time. */
  homePens?: number;
  awayPens?: number;
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

// ----------------------------------------------------
// Group stage + knockouts (standard tournaments)
// ----------------------------------------------------

export const GROUP_SIZE = 4;
export const GROUP_QUALIFIERS = 2;

export function isCupFormat(matches: TournamentMatchItem[]): boolean {
  return matches.some((m) => m.stage === 'GROUP' || m.stage === 'KNOCKOUT');
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Random group draw into groups of 4 (8 teams → 2 groups, 16 → 4, 32 → 8), then a
 * round robin inside each group.
 */
export function generateGroupStage(
  teams: TournamentTeam[],
  random: () => number = Math.random,
): { teams: TournamentTeam[]; matches: TournamentMatchItem[] } {
  const groupCount = Math.max(1, Math.round(teams.length / GROUP_SIZE));
  const drawn = shuffle(teams, random);
  const grouped = teams.map((t) => ({ ...t }));
  const byId = new Map(grouped.map((t) => [t.id, t]));
  drawn.forEach((t, i) => (byId.get(t.id)!.group = String.fromCharCode(65 + (i % groupCount))));

  const matches: TournamentMatchItem[] = [];
  for (let g = 0; g < groupCount; g++) {
    const letter = String.fromCharCode(65 + g);
    const members = grouped.filter((t) => t.group === letter);
    for (const m of generateRoundRobin(members)) {
      matches.push({ ...m, id: `g${letter}_${m.id}`, stage: 'GROUP', group: letter });
    }
  }
  return { teams: grouped, matches };
}

export function groupLetters(teams: TournamentTeam[]): string[] {
  return Array.from(new Set(teams.map((t) => t.group).filter((g): g is string => Boolean(g)))).sort();
}

export function groupStandings(
  teams: TournamentTeam[],
  matches: TournamentMatchItem[],
): Array<{ group: string; rows: TournamentStandingsRow[] }> {
  return groupLetters(teams).map((group) => ({
    group,
    rows: calculateStandings(
      teams.filter((t) => t.group === group),
      matches.filter((m) => m.stage === 'GROUP' && m.group === group),
    ),
  }));
}

export function knockoutRoundName(matchesInRound: number): string {
  if (matchesInRound === 1) return 'Finala';
  if (matchesInRound === 2) return 'Semifinale';
  if (matchesInRound === 4) return 'Sferturi';
  if (matchesInRound === 8) return 'Optimi';
  if (matchesInRound === 16) return 'Șaisprezecimi';
  return `Runda eliminatorie (${matchesInRound * 2} echipe)`;
}

/** Winner of a completed knockout match (penalties decide a draw); null when undecided. */
export function knockoutWinnerSide(m: TournamentMatchItem): 'home' | 'away' | null {
  if (!m.completed) return null;
  if (m.homeScore !== m.awayScore) return m.homeScore > m.awayScore ? 'home' : 'away';
  if (m.homePens === undefined || m.awayPens === undefined || m.homePens === m.awayPens) return null;
  return m.homePens > m.awayPens ? 'home' : 'away';
}

function knockoutMatch(
  round: number,
  index: number,
  home: { id?: string; name: string },
  away: { id?: string; name: string },
): TournamentMatchItem {
  return {
    id: `ko_r${round}_${index + 1}`,
    round,
    stage: 'KNOCKOUT',
    homeTeam: home.name,
    awayTeam: away.name,
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeScore: 0,
    awayScore: 0,
    completed: false,
  };
}

/**
 * Matches the next stage needs once the current one is finished: the first knockout
 * round after the groups (A1–B2, C1–D2 … then B1–A2, D1–C2 … so a group's two
 * qualifiers sit in opposite halves), or the next knockout round from the winners.
 * Returns [] while the current stage is still being played.
 */
export function nextStageMatches(teams: TournamentTeam[], matches: TournamentMatchItem[]): TournamentMatchItem[] {
  if (!isCupFormat(matches)) return [];
  const knockout = matches.filter((m) => m.stage === 'KNOCKOUT');

  if (knockout.length === 0) {
    const groupMatches = matches.filter((m) => m.stage === 'GROUP');
    if (groupMatches.length === 0 || groupMatches.some((m) => !m.completed)) return [];
    const tables = groupStandings(teams, matches);
    const byName = new Map(teams.map((t) => [t.name, t]));
    const place = (group: number, pos: number) => {
      const row = tables[group]?.rows[pos];
      return { id: byName.get(row?.team ?? '')?.id, name: row?.team ?? '?' };
    };
    if (tables.length === 1) return [knockoutMatch(1, 0, place(0, 0), place(0, 1))];
    const first: TournamentMatchItem[] = [];
    const second: TournamentMatchItem[] = [];
    for (let g = 0; g + 1 < tables.length; g += 2) {
      first.push(knockoutMatch(1, 0, place(g, 0), place(g + 1, 1)));
      second.push(knockoutMatch(1, 0, place(g + 1, 0), place(g, 1)));
    }
    return [...first, ...second].map((m, i) => ({ ...m, id: `ko_r1_${i + 1}` }));
  }

  const lastRound = Math.max(...knockout.map((m) => m.round ?? 1));
  const current = knockout.filter((m) => (m.round ?? 1) === lastRound);
  if (current.length < 2 || current.some((m) => !knockoutWinnerSide(m))) return [];
  const winner = (m: TournamentMatchItem) =>
    knockoutWinnerSide(m) === 'home' ? { id: m.homeTeamId, name: m.homeTeam } : { id: m.awayTeamId, name: m.awayTeam };
  const next: TournamentMatchItem[] = [];
  for (let i = 0; i + 1 < current.length; i += 2) {
    next.push(knockoutMatch(lastRound + 1, next.length, winner(current[i]), winner(current[i + 1])));
  }
  return next;
}

/** Winner of the final, once it has been played. */
export function cupChampion(matches: TournamentMatchItem[]): string | null {
  const knockout = matches.filter((m) => m.stage === 'KNOCKOUT');
  if (knockout.length === 0) return null;
  const lastRound = Math.max(...knockout.map((m) => m.round ?? 1));
  const final = knockout.filter((m) => (m.round ?? 1) === lastRound);
  if (final.length !== 1) return null;
  const side = knockoutWinnerSide(final[0]);
  if (!side) return null;
  return side === 'home' ? final[0].homeTeam : final[0].awayTeam;
}
