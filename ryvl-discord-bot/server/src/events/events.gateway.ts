import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export type EventStreamAction =
  | 'EVENT_CREATED'
  | 'EVENT_UPDATED'
  | 'EVENT_DELETED'
  | 'OCCURRENCE_UPDATED'
  | 'RSVP_UPDATED';

export interface EventStreamMessage {
  guildId: string;
  type: EventStreamAction;
  data: unknown;
  timestamp: string;
}

/**
 * In-process feed of event changes. It used to be exposed as an unauthenticated SSE
 * route that no client used (and that the guarded `GET :eventId` route shadowed), so it
 * is now internal only; subscribe through `changes` to build a guarded stream later.
 */
@Injectable()
export class EventsGateway {
  private readonly streamSubject = new Subject<EventStreamMessage>();

  emit(guildId: string, type: EventStreamAction, data: unknown): void {
    this.streamSubject.next({
      guildId,
      type,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  readonly changes: Observable<EventStreamMessage> = this.streamSubject.asObservable();
}
