import { Injectable, Logger } from '@nestjs/common';
import { rrulestr, RRule } from 'rrule';
import { OccurrenceStatus } from '@prisma/client';

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
      let rule: RRule;

      if (ruleString.includes('DTSTART')) {
        rule = rrulestr(ruleString) as RRule;
      } else {
        rule = rrulestr(ruleString, { dtstart: anchorDate }) as RRule;
      }

      const occurrences: GeneratedOccurrence[] = [];
      let currentDate: Date | null = rule.after(fromDate, true);
      let index = 0;

      while (currentDate && index < count) {
        const startsAt = new Date(currentDate);
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
