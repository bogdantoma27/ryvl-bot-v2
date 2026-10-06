import { Event, EventOccurrence, OccurrenceStatus, Rsvp, RsvpStatus } from '@prisma/client';

export interface RsvpTally {
  accepted: number;
  tentative: number;
  declined: number;
  total: number;
}

export type EventFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

export type OccurrenceView = Omit<EventOccurrence, 'publishClaimToken' | 'publishClaimedAt'> & { rsvpCounts: RsvpTally };

/** What the admin API returns for an event: the stored row plus fields derived for display. */
export type EventView = Event & {
  isRecurring: boolean;
  frequency: EventFrequency | null;
  /** First scheduled kickoff of the series (ISO), null when nothing was generated. */
  startsAt: string | null;
  /** The next occurrence that has not ended and is not cancelled. */
  nextOccurrence: OccurrenceView | null;
  rsvpsCount: RsvpTally;
  occurrences: OccurrenceView[];
};

export function countRsvps(rsvps: Pick<Rsvp, 'status'>[]): RsvpTally {
  const tally: RsvpTally = { accepted: 0, tentative: 0, declined: 0, total: 0 };
  for (const rsvp of rsvps) {
    if (rsvp.status === RsvpStatus.ACCEPTED) tally.accepted++;
    else if (rsvp.status === RsvpStatus.TENTATIVE) tally.tentative++;
    else if (rsvp.status === RsvpStatus.DECLINED) tally.declined++;
    else continue;
    tally.total++;
  }
  return tally;
}

/** End of an occurrence; rows without endsAt last for the event's duration. */
export function occurrenceEnd(occurrence: Pick<EventOccurrence, 'startsAt' | 'endsAt'>, durationMinutes: number): Date {
  return occurrence.endsAt ?? new Date(occurrence.startsAt.getTime() + Math.max(1, durationMinutes || 60) * 60000);
}

export function frequencyFromRrule(rrule: string | null | undefined): EventFrequency | null {
  if (!rrule || !rrule.trim()) return null;
  const freq = /FREQ=([A-Z]+)/.exec(rrule)?.[1];
  const interval = Number(/INTERVAL=(\d+)/.exec(rrule)?.[1] || 1);
  if (freq === 'DAILY' && interval === 1) return 'daily';
  if (freq === 'WEEKLY' && interval === 1) return 'weekly';
  if (freq === 'WEEKLY' && interval === 2) return 'biweekly';
  if (freq === 'MONTHLY' && interval === 1) return 'monthly';
  return 'custom';
}

export function toEventView(
  event: Event & { occurrences: (EventOccurrence & { rsvps: Pick<Rsvp, 'status'>[] })[] },
  now: Date = new Date(),
): EventView {
  const occurrences: OccurrenceView[] = [...event.occurrences]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map(({ rsvps, publishClaimToken: _token, publishClaimedAt: _claimedAt, ...rest }) => ({ ...rest, rsvpCounts: countRsvps(rsvps) }));
  const allRsvps = event.occurrences.flatMap((occurrence) => occurrence.rsvps);
  const nextOccurrence =
    occurrences.find(
      (occurrence) =>
        (occurrence.status === OccurrenceStatus.SCHEDULED || occurrence.status === OccurrenceStatus.PUBLISHED) &&
        occurrenceEnd(occurrence, event.duration).getTime() > now.getTime(),
    ) ?? null;
  return {
    ...event,
    isRecurring: Boolean(event.rrule && event.rrule.trim()),
    frequency: frequencyFromRrule(event.rrule),
    startsAt: occurrences[0]?.startsAt.toISOString() ?? null,
    nextOccurrence,
    rsvpsCount: countRsvps(allRsvps),
    occurrences,
  };
}
