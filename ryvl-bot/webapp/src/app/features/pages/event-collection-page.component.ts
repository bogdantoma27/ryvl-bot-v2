import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ApiService, EventSeries } from '../../core/api.service';
import { SnackbarService } from '../../core/snackbar.service';

type CollectionMode = 'drafts' | 'recurring' | 'scheduled';

@Component({
  selector: 'app-event-collection-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="collection-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Workspace <span>›</span> Events</p>
          <h1>{{ title() }}</h1>
          <p class="page-subtitle">{{ subtitle() }}</p>
        </div>
        <a class="primary-action" routerLink="/events/new">Create event</a>
      </header>

      @if (loading()) {
        <div class="empty-state"><p>Loading events...</p></div>
      } @else if (!items().length) {
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="2"></rect>
              <path d="M3 10h18M8 3v4M16 3v4"></path>
            </svg>
          </div>
          <h2>{{ emptyTitle() }}</h2>
          <p>{{ emptySubtitle() }}</p>
          <a class="secondary-action" routerLink="/events/new">Create an event</a>
        </div>
      } @else {
        <div class="event-list">
          @for (series of items(); track series.id) {
            <article class="event-row">
              <a class="event-row-link-area" [routerLink]="rowLink(series)" [queryParams]="rowQueryParams(series)">
                <div class="event-accent"></div>
                <div class="event-row-copy">
                  <strong>{{ series.title }}</strong>
                  <span>{{ summary(series) }}</span>
                </div>
                <span class="event-meta">{{ series.recurrence === 'weekly' ? 'Recurring' : 'One time' }}</span>
              </a>
              @if (mode === 'drafts') {
                <button type="button" class="secondary-action compact" (click)="publish(series.id)">Publish</button>
              }
            </article>
          }
        </div>
      }
    </section>
  `,
})
export class EventCollectionPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(SnackbarService);

  protected readonly mode = (this.route.snapshot.data['mode'] || 'scheduled') as CollectionMode;
  protected readonly loading = signal(true);
  protected readonly items = signal<EventSeries[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const rows = this.mode === 'drafts'
        ? await this.api.listEventDrafts()
        : this.mode === 'recurring'
          ? await this.api.listRecurringEvents()
          : (await this.api.listEvents()).filter(series => series.events.some(event => event.status === 'scheduled'));
      this.items.set(rows);
    } catch {
      this.snackbar.error('Failed to load events.');
    } finally {
      this.loading.set(false);
    }
  }

  protected title(): string {
    return this.mode === 'drafts' ? 'Drafts' : this.mode === 'recurring' ? 'Recurring events' : 'Scheduled posts';
  }

  protected subtitle(): string {
    return this.mode === 'drafts' ? 'Continue building events before publishing them.' : this.mode === 'recurring' ? 'Manage your repeating weekly event series.' : 'Upcoming event polls waiting to be posted.';
  }

  protected emptyTitle(): string {
    return this.mode === 'drafts' ? 'No drafts' : this.mode === 'recurring' ? 'No recurring events' : 'Nothing scheduled';
  }

  protected emptySubtitle(): string {
    return this.mode === 'drafts' ? 'Events you leave before publishing will appear here.' : this.mode === 'recurring' ? 'Create a weekly event to see it here.' : 'Events with scheduled posts will show up here.';
  }

  protected summary(series: EventSeries): string {
    const weekdays = (series.weekdays || []).map(day => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day]).join(', ');
    if (series.recurrence === 'weekly') return `${weekdays || 'Weekly'} · ${this.timingLabel(series)}`;
    const event = series.events[0];
    return event ? new Date(event.closes_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not published';
  }

  protected timingLabel(series: EventSeries): string {
    const labels: Record<string, string> = {
      at_event_start: 'When events start',
      before_event_start: `Before events${series.post_timing_value ? ` · ${series.post_timing_value} min` : ''}`,
      when_previous_event_ends: 'When previous event ends',
      after_previous_event_ends: 'After previous event ends',
      at_specific_time: series.post_timing_value || 'At a specific time',
    };
    return labels[series.post_timing_mode] || 'Scheduled';
  }

  protected async publish(seriesId: number): Promise<void> {
    try {
      await this.api.publishEventDraft(seriesId);
      this.items.update(items => items.filter(item => item.id !== seriesId));
      this.snackbar.success('Event published to Discord.');
    } catch {
      this.snackbar.error('Failed to publish draft.');
    }
  }

  protected rowLink(series: EventSeries): string {
    return this.mode === 'drafts' ? '/events/new' : '/events/manage';
  }

  protected rowQueryParams(series: EventSeries): Record<string, number> {
    return this.mode === 'drafts' ? { draftId: series.id } : { seriesId: series.id };
  }
}
