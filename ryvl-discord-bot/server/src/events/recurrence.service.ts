import { Injectable, Logger } from '@nestjs/common';
import { rrulestr, RRule } from 'rrule';
import { OccurrenceStatus } from '@prisma/client';
import { formatEventDateTime, parseEventDateTime } from './event-time';

export interface RecurrenceEventInput {
  id: string;
  rrule?: string | null;
  duration: number; // in minutes
}

export interface GeneratedOccurrence {
  eventId: string;
  index: number;
  startsAt: Date;
  endsAt: Date;
  status: OccurrenceStatus;
}

@Injectable()
export class RecurrenceService {
  private readonly logger = new Logger(RecurrenceService.name);

  generateOccurrences(
    event: RecurrenceEventInput,
    fromDate: Date = new Date(),
    count: number = 10,
    anchorDate: Date = fromDate,
  ): GeneratedOccurrence[] {
    const durationMinutes = Math.max(1, event.duration || 60);

    // If no rrule, this is a one-off event
    if (!event.rrule || event.rrule.trim() === '') {
      const startsAt = anchorDate;
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
      return [
        {
          eventId: event.id,
          index: 0,
          startsAt,
          endsAt,
          status: OccurrenceStatus.SCHEDULED,
        },
      ];
    }

    try {
      // Ensure DTSTART is provided if not present in the RRULE string
      let ruleString = event.rrule.trim();
      const tzidMatch = /TZID=([^:\s;]+)/i.exec(ruleString);
      const tzid = tzidMatch ? tzidMatch[1] : null;

      let rule: RRule;
      if (ruleString.includes('DTSTART')) {
        rule = rrulestr(ruleString) as RRule;
      } else {
        rule = rrulestr(ruleString, { dtstart: anchorDate }) as RRule;
      }

      let queryFrom = fromDate;
      if (tzid) {
        const local = formatEventDateTime(fromDate, tzid);
        queryFrom = new Date(`${local.date}T${local.time}:00.000Z`);
      }

      const occurrences: GeneratedOccurrence[] = [];
      let currentDate: Date | null = rule.after(queryFrom, true);
      let index = 0;

      while (currentDate && index < count) {
        let startsAt: Date;
        if (tzid) {
          const dStr = currentDate.toISOString().slice(0, 10);
          const tStr = currentDate.toISOString().slice(11, 16);
          startsAt = parseEventDateTime(dStr, tStr, tzid) || new Date(currentDate);
        } else {
          startsAt = new Date(currentDate);
        }
        const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

        occurrences.push({
          eventId: event.id,
          index,
          startsAt,
          endsAt,
          status: OccurrenceStatus.SCHEDULED,
        });

        index++;
        currentDate = rule.after(currentDate, false);
      }

      return occurrences;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown rrule parsing error';
      this.logger.error(`Failed to parse RRULE "${event.rrule}": ${msg}`);

      // Fallback to single occurrence if parsing fails
      const fallbackStart = anchorDate;
      const fallbackEnd = new Date(fallbackStart.getTime() + durationMinutes * 60 * 1000);
      return [
        {
          eventId: event.id,
          index: 0,
          startsAt: fallbackStart,
          endsAt: fallbackEnd,
          status: OccurrenceStatus.SCHEDULED,
        },
      ];
    }
  }
}
