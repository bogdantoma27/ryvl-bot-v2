import { BadRequestException } from '@nestjs/common';
import { DEFAULT_EVENT_TIMEZONE, formatEventDateTime, parseEventDateTime } from './event-time';

/** Adapt the existing admin form to the canonical DTO; EventsService still
 * validates every persisted field with Zod. Discord already sends this DTO.
 */
export function normalizeEventForm(body: Record<string, unknown>): Record<string, unknown> {
  if (body.startsAt !== undefined || (body.date === undefined && body.time === undefined)) return body;
  const timezone = typeof body.timezone === 'string' ? body.timezone : DEFAULT_EVENT_TIMEZONE;
  if (typeof body.date !== 'string' || typeof body.time !== 'string') throw new BadRequestException('Date and time are required.');
  const start = parseEventDateTime(body.date, body.time, timezone);
  if (!start) throw new BadRequestException(`Invalid date or time in ${timezone}. Use YYYY-MM-DD and HH:mm.`);
  let duration: unknown = body.duration ?? 60;
  if (typeof duration === 'string') {
    const match = /^(\d+(?:\.\d+)?)(h|min)$/.exec(duration.trim());
    duration = match ? Number(match[1]) * (match[2] === 'h' ? 60 : 1) : Number(duration);
  }
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 1 || duration > 1440) throw new BadRequestException('Duration must be between 1 and 1440 minutes.');

  let rrule: string | null = null;
  if (body.isRecurring === true) {
    const frequencies: Record<string, string> = { daily: 'DAILY', weekly: 'WEEKLY', biweekly: 'WEEKLY', monthly: 'MONTHLY' };
    const frequency = typeof body.frequency === 'string' ? body.frequency : '';
    if (!Object.prototype.hasOwnProperty.call(frequencies, frequency)) throw new BadRequestException('Invalid recurrence frequency.');
    const local = formatEventDateTime(start, timezone);
    const calendar = new Date(`${local.date}T12:00:00Z`);
    const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const parts = [`FREQ=${frequencies[frequency]}`];
    if (frequency === 'biweekly') parts.push('INTERVAL=2');
    if (frequency === 'weekly' || frequency === 'biweekly') {
      const weekdays = body.weekdays;
      if (!Array.isArray(weekdays) || !weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new BadRequestException('Choose valid weekdays for a weekly event.');
      parts.push(`BYDAY=${[...new Set(weekdays as number[])].map(day => days[day]).join(',')}`);
    }
    if (frequency === 'monthly') {
      if (body.monthlyType === 'nth_weekday') parts.push(`BYDAY=${Math.ceil(calendar.getUTCDate() / 7)}${days[calendar.getUTCDay()]}`);
      else if (body.monthlyType === undefined || body.monthlyType === 'day_of_month') parts.push(`BYMONTHDAY=${calendar.getUTCDate()}`);
      else throw new BadRequestException('Invalid monthly recurrence.');
    }
    if (body.endCondition === 'after_count') {
      const count = Number(body.endCount);
      if (!Number.isInteger(count) || count < 1 || count > 1000) throw new BadRequestException('Recurrence count must be between 1 and 1000.');
      parts.push(`COUNT=${count}`);
    } else if (body.endCondition === 'on_date') {
      const end = typeof body.endDate === 'string' ? parseEventDateTime(body.endDate, '23:59', timezone) : null;
      if (!end || end < start) throw new BadRequestException('Recurrence end date must not be before the start.');
      parts.push(`UNTIL=${end.toISOString().replace(/[-:]/g, '').replace('.000', '')}`);
    } else if (body.endCondition !== undefined && body.endCondition !== 'never') {
      throw new BadRequestException('Invalid recurrence end condition.');
    }
    // DTSTART is a local wall-clock value with TZID, not a fixed UTC hour.
    // This preserves 19:00 across daylight-saving changes for recurring events.
    rrule = `DTSTART;TZID=${timezone}:${local.date.replace(/-/g, '')}T${local.time.replace(':', '')}00\nRRULE:${parts.join(';')}`;
  } else if (body.isRecurring !== undefined && body.isRecurring !== false) {
    throw new BadRequestException('isRecurring must be a boolean.');
  }
  return { ...body, startsAt: start.toISOString(), timezone, duration, rrule, mentionRoleIds: body.roleMentionIds ?? body.mentionRoleIds ?? [] };
}
