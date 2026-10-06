/** One filled lineup slot. Members picked from Discord carry their user ID. */
export interface LineupSlotAssignment {
  discordUserId?: string;
  name: string;
}

export type LineupAssignments = Record<string, LineupSlotAssignment>;

const MAX_NAME_LENGTH = 40;

/**
 * Reads both the current `{ slot: { discordUserId?, name } }` format and the legacy
 * `{ slot: "name" }` format (and JSON strings of either). Empty slots are dropped and
 * slot keys are lower-cased to match formation keys.
 */
export function normalizeAssignments(raw: unknown): LineupAssignments {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: LineupAssignments = {};
  for (const [slot, entry] of Object.entries(value as Record<string, unknown>)) {
    const key = slot.trim().toLowerCase();
    if (!key) continue;
    if (typeof entry === 'string') {
      const name = entry.trim().slice(0, MAX_NAME_LENGTH);
      if (name) result[key] = { name };
      continue;
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name.trim().slice(0, MAX_NAME_LENGTH) : '';
      const id = typeof record.discordUserId === 'string' && /^\d{5,25}$/.test(record.discordUserId) ? record.discordUserId : undefined;
      if (!name) continue;
      result[key] = id ? { discordUserId: id, name } : { name };
    }
  }
  return result;
}

/** Slot → display name, the shape the renderer expects. */
export function assignmentNames(assignments: LineupAssignments): Record<string, string> {
  return Object.fromEntries(Object.entries(assignments).map(([slot, entry]) => [slot, entry.name]));
}

export interface AutoFillCandidate {
  discordUserId: string;
  name: string;
  preferredPos?: string | null;
}

/** Position families, from most to least specific, used to match a preference to a slot. */
const SLOT_GROUPS: Record<string, string> = {
  gk: 'GK',
  lb: 'DEF', lwb: 'DEF', lcb: 'DEF', cb: 'DEF', rcb: 'DEF', rb: 'DEF', rwb: 'DEF',
  cdm: 'MID', lcdm: 'MID', rcdm: 'MID', lm: 'MID', lcm: 'MID', cm: 'MID', rcm: 'MID', rm: 'MID',
  lam: 'MID', cam: 'MID', ram: 'MID',
  lw: 'FWD', lf: 'FWD', cf: 'FWD', rf: 'FWD', rw: 'FWD', ls: 'FWD', st: 'FWD', rs: 'FWD',
};

const PREFERENCE_ALIASES: Record<string, string> = {
  GOALKEEPER: 'GK', KEEPER: 'GK', PORTAR: 'GK',
  DEFENDER: 'DEF', DEFENCE: 'DEF', DEFENSE: 'DEF', FUNDAS: 'DEF',
  MIDFIELDER: 'MID', MIDFIELD: 'MID', MIJLOCAS: 'MID',
  FORWARD: 'FWD', ATTACKER: 'FWD', STRIKER: 'ST', ATACANT: 'FWD',
};

/** Slot without its left/right prefix: lcb → cb, rcdm → cdm, ls → st. */
function baseSlot(slot: string): string {
  const s = slot.toLowerCase();
  if (s === 'ls' || s === 'rs') return 'st';
  if (s === 'lf' || s === 'rf') return 'cf';
  if (s === 'lw' || s === 'rw') return 'w';
  if (s === 'lb' || s === 'rb' || s === 'lwb' || s === 'rwb') return 'fb';
  if (s === 'lm' || s === 'rm') return 'wm';
  if (/^[lr](cb|cdm|cm|am)$/.test(s)) return s.slice(1) === 'am' ? 'cam' : s.slice(1);
  return s;
}

/** 3 = exact slot, 2 = same position ignoring side, 1 = same line, 0 = no match. */
export function preferenceScore(slot: string, preferredPos: string | null | undefined): number {
  if (!preferredPos) return 0;
  const tokens = preferredPos.toUpperCase().split(/[^A-Z]+/).filter(Boolean).map((t) => PREFERENCE_ALIASES[t] || t);
  const slotKey = slot.toLowerCase();
  let best = 0;
  for (const token of tokens) {
    const pref = token.toLowerCase();
    if (pref === slotKey) return 3;
    if (SLOT_GROUPS[pref] && baseSlot(pref) === baseSlot(slotKey)) best = Math.max(best, 2);
    const group = SLOT_GROUPS[pref] || (['GK', 'DEF', 'MID', 'FWD'].includes(token) ? token : undefined);
    if (group && group === SLOT_GROUPS[slotKey]) best = Math.max(best, 1);
  }
  return best;
}

/**
 * Places candidates (accepted RSVPs, in RSVP order) into empty slots: exact preferred
 * position first, then the same position on the other side, then the same line, and
 * finally anyone left into whatever is still empty. Existing assignments are kept.
 */
export function autoFillByPreferredPosition(
  slots: string[],
  candidates: AutoFillCandidate[],
  existing: LineupAssignments = {},
): LineupAssignments {
  const result: LineupAssignments = {};
  for (const slot of slots) if (existing[slot]) result[slot] = existing[slot];
  const placed = new Set(Object.values(result).map((entry) => entry.discordUserId).filter(Boolean));
  const remaining = candidates.filter((c) => !placed.has(c.discordUserId));
  for (const minimum of [3, 2, 1]) {
    for (const slot of slots) {
      if (result[slot]) continue;
      const index = remaining.findIndex((c) => preferenceScore(slot, c.preferredPos) >= minimum);
      if (index === -1) continue;
      const [candidate] = remaining.splice(index, 1);
      result[slot] = { discordUserId: candidate.discordUserId, name: candidate.name };
    }
  }
  for (const slot of slots) {
    if (result[slot] || !remaining.length) continue;
    const candidate = remaining.shift()!;
    result[slot] = { discordUserId: candidate.discordUserId, name: candidate.name };
  }
  return result;
}
