import { LineupAssignments, LineupMemberOption, LineupRsvpStatus } from '../../core/models';

/**
 * Reads both the current `{ slot: { discordUserId?, name } }` format and the legacy
 * `{ slot: "name" }` format (and JSON strings of either). Mirrors the server helper.
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
      if (entry.trim()) result[key] = { name: entry.trim() };
    } else if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
      const id = typeof record['discordUserId'] === 'string' ? record['discordUserId'] : undefined;
      if (name) result[key] = id ? { discordUserId: id, name } : { name };
    }
  }
  return result;
}

/** The slot a member occupies: matched by Discord ID, or by name for legacy/guest entries. */
export function slotForMember(assignments: LineupAssignments, member: Pick<LineupMemberOption, 'discordUserId' | 'displayName'>): string | null {
  for (const [slot, entry] of Object.entries(assignments)) {
    if (entry.discordUserId ? entry.discordUserId === member.discordUserId : entry.name === member.displayName) return slot;
  }
  return null;
}

/** Assigns a member or guest to a slot, freeing any slot they held before. */
export function assignToSlot(assignments: LineupAssignments, slot: string, entry: { discordUserId?: string; name: string }): LineupAssignments {
  const next: LineupAssignments = {};
  for (const [key, value] of Object.entries(assignments)) {
    const same = entry.discordUserId
      ? value.discordUserId === entry.discordUserId
      : !value.discordUserId && value.name.toLowerCase() === entry.name.toLowerCase();
    if (!same) next[key] = value;
  }
  next[slot] = entry.discordUserId ? { discordUserId: entry.discordUserId, name: entry.name } : { name: entry.name };
  return next;
}

/** Slot → EA name for assigned members who registered one. */
export function eaNamesForAssignments(assignments: LineupAssignments, members: LineupMemberOption[]): Record<string, string> {
  const byId = new Map(members.map((m) => [m.discordUserId, m.eaPlayerName]));
  const result: Record<string, string> = {};
  for (const [slot, entry] of Object.entries(assignments)) {
    const eaName = entry.discordUserId ? byId.get(entry.discordUserId) : null;
    if (eaName) result[slot] = eaName;
  }
  return result;
}

export function rsvpLabel(status: LineupRsvpStatus): string {
  switch (status) {
    case 'ACCEPTED':
      return '✅ Accepted';
    case 'TENTATIVE':
      return '❓ Tentative';
    case 'DECLINED':
      return '❌ Declined';
    default:
      return 'No answer';
  }
}

/** "YYYY-MM-DD" and "HH:mm" of an instant in a timezone (for date/time inputs). */
export function localDateTimeParts(iso: string, timeZone: string): { date: string; time: string } | null {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` };
  } catch {
    return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
  }
}
