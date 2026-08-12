import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiService, EventOccurrence, EventSeries } from '../../core/api.service';
import { SnackbarService } from '../../core/snackbar.service';

interface EventRow {
  seriesId: number;
  seriesTitle: string;
  recurring: boolean;
  event: EventOccurrence;
}

interface EventGroup {
  dateLabel: string;
  rows: EventRow[];
}

@Component({
  selector: 'app-events-list-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="collection-page page-viewport">
      <header class="page-header">
        <div>
          <p class="eyebrow">Workspace <span>&rsaquo;</span> Events</p>
          <h1>Events</h1>
          <p class="page-subtitle">Every scheduled and open event across your server.</p>
        </div>
        <a class="primary-action" routerLink="/events/new">Create event</a>
      </header>

      @if (loading()) {
        <div class="empty-state"><p>Loading events...</p></div>
      } @else if (!groups().length) {
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="2"></rect>
              <path d="M3 10h18M8 3v4M16 3v4"></path>
            </svg>
          </div>
          <h2>No events yet</h2>
          <p>Create an event to see it show up here.</p>
          <a class="secondary-action" routerLink="/events/new">Create an event</a>
        </div>
      } @else {
        <div class="event-list">
          @for (group of groups(); track group.dateLabel) {
            <p class="event-date-heading">{{ group.dateLabel }}</p>
            @for (row of group.rows; track row.event.id) {
              <a class="event-row event-row-link" routerLink="/events/manage" [queryParams]="{ seriesId: row.seriesId, eventId: row.event.id }">
                <div class="event-accent" [class.event-accent-open]="row.event.status === 'open'"></div>
                <div class="event-row-copy">
                  <strong>{{ row.seriesTitle }}</strong>
                  <span>{{ timeLabel(row.event) }}</span>
                </div>
                <span class="event-meta">{{ row.recurring ? 'Recurring' : 'One time' }}</span>
                <span class="event-status" [class.event-status-open]="row.event.status === 'open'">{{ statusLabel(row.event.status) }}</span>
              </a>
            }
          }
        </div>
      }
    </section>
  `,
})
export class EventsListPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(SnackbarService);

  protected readonly loading = signal(true);
  protected readonly groups = signal<EventGroup[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const series = await this.api.listEvents();
      this.groups.set(this.buildGroups(series));
    } catch {
      this.snackbar.error('Failed to load events.');
    } finally {
      this.loading.set(false);
    }
  }

  private buildGroups(series: EventSeries[]): EventGroup[] {
    const rows: EventRow[] = [];
    for (const item of series) {
      for (const event of item.events) {
        if (event.status === 'cancelled') continue;
        rows.push({ seriesId: item.id, seriesTitle: item.title, recurring: item.recurrence === 'weekly', event });
      }
    }
    rows.sort((a, b) => new Date(a.event.closes_at).getTime() - new Date(b.event.closes_at).getTime());

    const groups: EventGroup[] = [];
    const byLabel = new Map<string, EventRow[]>();
    for (const row of rows) {
      const label = new Date(row.event.closes_at).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      if (!byLabel.has(label)) {
        byLabel.set(label, []);
        groups.push({ dateLabel: label, rows: byLabel.get(label)! });
      } else {
        groups.find(group => group.dateLabel === label)!.rows.push(row);
      }
    }
    return groups;
  }

  protected timeLabel(event: EventOccurrence): string {
    return new Date(event.closes_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  protected statusLabel(status: EventOccurrence['status']): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
