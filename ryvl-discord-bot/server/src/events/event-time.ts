/** Calendar input belongs to an event timezone, never the machine's timezone. */
export const DEFAULT_EVENT_TIMEZONE = 'Europe/Bucharest';

function formatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
}

export function isEventTimezone(value: string): boolean {
  try { formatter(value); return Boolean(value); } catch { return false; }
}

export function formatEventDateTime(value: Date, timeZone = DEFAULT_EVENT_TIMEZONE): { date: string; time: string } {
  const parts = formatter(timeZone).formatToParts(value);
  const part = (name: Intl.DateTimeFormatPartTypes): string => parts.find(p => p.type === name)!.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

/** Reject impossible dates/times rather than letting Date silently roll into another day.
 * On the autumn overlap, choose the earlier occurrence of the repeated local minute.
 * On the spring clock gap, return null because that local minute does not exist.
 */
export function parseEventDateTime(dateInput: string, timeInput: string, timeZone = DEFAULT_EVENT_TIMEZONE, now = new Date()): Date | null {
  if (!isEventTimezone(timeZone) || !Number.isFinite(now.getTime())) return null;
  const clock = /^(\d{1,2}):(\d{2})$/.exec(timeInput.trim());
  if (!clock) return null;
  const hour = Number(clock[1]), minute = Number(clock[2]);
  if (hour > 23 || minute > 59) return null;
  const clean = dateInput.trim().toLowerCase().replace(/\s+/g, ' ');
  let date = clean;
  const today = formatEventDateTime(now, timeZone).date;
  // Use UTC only as a calendar calculator; it is not the timezone of the input.
  const calendar = new Date(`${today}T12:00:00Z`);
  if (clean === 'today' || clean === 'tomorrow') {
    if (clean === 'tomorrow') calendar.setUTCDate(calendar.getUTCDate() + 1);
    date = calendar.toISOString().slice(0, 10);
  } else {
    const weekday = /^(?:next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(clean);
    if (weekday) {
      const index = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(weekday[1]);
      const distance = (index - calendar.getUTCDay() + 7) % 7;
      calendar.setUTCDate(calendar.getUTCDate() + (distance || 7));
      date = calendar.toISOString().slice(0, 10);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (year < 100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(naive).toISOString().slice(0, 10) !== date) return null;
  const targetTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const fmt = formatter(timeZone);
  const offsets = new Set<number>();
  // Sample both sides of a nearby transition, then validate each candidate by
  // round-trip. This also handles half-hour and quarter-hour timezone offsets.
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sample = naive + hours * 3600000;
    const parts = fmt.formatToParts(new Date(sample));
    const part = (name: string): number => Number(parts.find(p => p.type === name)!.value);
    offsets.add(Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')) - sample);
  }
  const candidates = [...offsets].map(offset => new Date(naive - offset)).filter(candidate => {
    const local = formatEventDateTime(candidate, timeZone);
    return local.date === date && local.time === targetTime;
  }).sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] || null;
}
