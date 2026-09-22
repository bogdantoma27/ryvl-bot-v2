import { Controller, Injectable, Param, Sse, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

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

@Injectable()
@Controller('api/guilds/:guildId/events')
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

  @Sse('stream')
  streamEvents(@Param('guildId') guildId: string): Observable<MessageEvent> {
    return this.streamSubject.asObservable().pipe(
      filter((msg) => msg.guildId === guildId),
      map(
        (msg): MessageEvent => ({
          data: {
            type: msg.type,
            data: msg.data,
            timestamp: msg.timestamp,
          },
        }),
      ),
    );
  }
}
