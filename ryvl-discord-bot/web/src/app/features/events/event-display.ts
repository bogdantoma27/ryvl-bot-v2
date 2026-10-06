import { EventItem, EventStatus, OccurrenceStatus } from '../../core/models';

/** Formats an instant in the event's own timezone, e.g. "Mon 12 Oct 2026, 19:00". */
export function formatEventDate(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return 'No upcoming date';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return 'No upcoming date';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || undefined,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString().replace('T', ' ').slice(0, 16);
  }
}

export function eventStatusLabel(status: EventStatus): string {
  return status === 'ACTIVE' ? 'Active' : status === 'ARCHIVED' ? 'Archived' : 'Draft';
}

export function occurrenceStatusLabel(status: OccurrenceStatus): string {
  switch (status) {
    case 'SCHEDULED':
      return 'Scheduled';
    case 'PUBLISHED':
      return 'Announced';
    case 'CLOSED':
      return 'Ended';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

/** An active event with an occurrence that has not ended or been cancelled. */
export function isUpcomingEvent(event: EventItem): boolean {
  return event.status === 'ACTIVE' && event.nextOccurrence !== null;
}

/** Human description of a publish lead time in minutes. */
export function describeLeadMinutes(minutes: number): string {
  if (!minutes) return 'at kickoff';
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'} before`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'} before`;
  return `${minutes} minutes before`;
}

export const PUBLISH_LEAD_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 60, label: '1 hour before' },
  { minutes: 360, label: '6 hours before' },
  { minutes: 1440, label: '1 day before' },
  { minutes: 2880, label: '2 days before (default)' },
  { minutes: 4320, label: '3 days before' },
  { minutes: 10080, label: '1 week before' },
];
