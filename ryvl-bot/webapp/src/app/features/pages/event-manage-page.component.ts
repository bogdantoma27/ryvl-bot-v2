import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService, EventOccurrence, EventSeries, ChannelOption, GuildMemberOption, VoteStatus } from '../../core/api.service';
import { SnackbarService } from '../../core/snackbar.service';

interface EventOption {
  id: number;
  label: string;
}

interface ManageEventRow {
  id: number;
  title: string;
  occurrence_number: number;
  starts_at: string;
  timezone: string;
  status: EventOccurrence['status'];
  votes_count: number;
  channel_id: string;
}

type ManageStatusFilter = 'all' | EventOccurrence['status'];
type VoteBucket = 'accepted' | 'declined' | 'tentative';

@Component({
  selector: 'app-event-manage-page',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="collection-page space-y-6">
      <header class="page-header">
        <div>
          <p class="eyebrow">Workspace <span>&rsaquo;</span> Events <span>&rsaquo;</span> Manage</p>
          <h1>Manage events</h1>
          <p class="page-subtitle">Reschedule, respond to, or cancel existing events.</p>
        </div>
        <a class="primary-action" routerLink="/events/new">New event</a>
      </header>

      <section class="wizard-panel space-y-4">
        <div class="flex items-center justify-between">
          <h2>Manage events</h2>
          <button type="button" class="secondary-action compact" (click)="load()">Refresh</button>
        </div>

        <div class="manage-filters">
          <label class="field">
            <span>Select event</span>
            <select [ngModel]="selectedEventId()" (ngModelChange)="pickEvent($event)" name="selected_event_id">
              <option [ngValue]="null">Select event</option>
              @for (option of eventOptions(); track option.id) {
                <option [ngValue]="option.id">{{ option.label }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span>Filter by status</span>
            <select [ngModel]="manageStatusFilter()" (ngModelChange)="setManageStatusFilter($event)" name="manage_status_filter">
              <option value="all">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label class="field">
            <span>Search</span>
            <input [ngModel]="manageSearch()" (ngModelChange)="setManageSearch($event)" name="manage_search" placeholder="title, channel, id" />
          </label>
        </div>

        <div class="manage-toolbar">
          <label class="inline-flex items-center gap-2">
            <input type="checkbox" [checked]="areAllVisibleManageRowsSelected()" (change)="selectVisibleManageRows($any($event.target).checked)" />
            <span>Select visible rows</span>
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <span>{{ selectedManageRows().length }} selected</span>
            <button type="button" class="secondary-action compact" [disabled]="!selectedManageRows().length || loading()" (click)="cancelSelectedManageEvents()">Cancel selected</button>
            <button type="button" class="secondary-action compact danger-action" [disabled]="!hasSelectedCancelledManageRows() || loading()" (click)="deleteSelectedCancelledManageEvents()">Delete cancelled</button>
            <button type="button" class="secondary-action compact" (click)="clearManageSelection()">Clear</button>
          </div>
        </div>

        <div class="manage-table-wrap">
          <table class="manage-table">
            <thead>
              <tr>
                <th><span class="sr-only">Select</span></th>
                <th>Event ID</th>
                <th>Title</th>
                <th>Occ.</th>
                <th>Kickoff</th>
                <th>Status</th>
                <th>Votes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              @for (row of pagedManageRows(); track row.id) {
                <tr
                  [class.is-selected]="selectedEventId() === row.id"
                  [class.is-clickable]="row.status !== 'cancelled'"
                  (click)="pickEventFromRow(row.id, row.status)"
                >
                  <td>
                    <input type="checkbox" [checked]="isManageRowSelected(row.id)" (click)="$event.stopPropagation()" (change)="toggleManageRowSelection(row.id, $any($event.target).checked)" />
                  </td>
                  <td>#{{ row.id }}</td>
                  <td>{{ row.title }}</td>
                  <td>{{ row.occurrence_number }}</td>
                  <td>{{ formatKickoffInTimezone(row.starts_at, row.timezone) }}</td>
                  <td><span class="status-badge" [class.is-positive]="row.status === 'open' || row.status === 'scheduled'" [class.is-negative]="row.status === 'closed' || row.status === 'cancelled'">{{ row.status }}</span></td>
                  <td>{{ row.votes_count }}</td>
                  <td>
                    @if (row.status === 'cancelled') {
                      <button class="secondary-action compact danger-action" type="button" (click)="$event.stopPropagation(); deleteCancelledEvent(row.id)">Delete permanently</button>
                    } @else {
                      <button class="secondary-action compact" type="button" (click)="$event.stopPropagation(); pickEvent(row.id)">Edit</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="8">No events yet.</td>
                </tr>
              }
            </tbody>
          </table>
          <div class="manage-pagination">
            <p>Showing {{ pageStartIndex() }}-{{ pageEndIndex() }} of {{ filteredManageRows().length }}</p>
            <div class="flex items-center gap-2">
              <button class="secondary-action compact" type="button" [disabled]="managePage() <= 1" (click)="prevManagePage()">Prev</button>
              <span>Page {{ managePage() }} / {{ manageTotalPages() }}</span>
              <button class="secondary-action compact" type="button" [disabled]="managePage() >= manageTotalPages()" (click)="nextManagePage()">Next</button>
            </div>
          </div>
        </div>

        @if (selectedEvent()) {
          <form class="edit-card space-y-3">
            <p class="edit-card-kicker">Edit event #{{ selectedEvent()!.id }}</p>
            <p class="edit-card-note">Changes are local until you press Save changes.</p>
            @if (selectedEvent()!.status === 'cancelled') {
              <div class="edit-card-warning">This event is cancelled and cannot be edited. You can only permanently delete it from history.</div>
            }
            <div class="manage-form-grid">
              <label class="field span-2">
                <span>Title</span>
                <input [(ngModel)]="manage.title" (ngModelChange)="onManageFormChanged(true)" name="manage_title" [disabled]="selectedEvent()!.status === 'cancelled'" />
              </label>
              <label class="field span-2">
                <span>Description</span>
                <textarea rows="3" [(ngModel)]="manage.description" (ngModelChange)="onManageFormChanged(true)" name="manage_description" [disabled]="selectedEvent()!.status === 'cancelled'"></textarea>
              </label>
              <label class="field">
                <span>Timezone</span>
                <select [(ngModel)]="manage.timezone" (ngModelChange)="onManageFormChanged()" name="manage_timezone" [disabled]="selectedEvent()!.status === 'cancelled'">
                  <option value="Europe/Bucharest">Europe/Bucharest</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="UTC">UTC</option>
                </select>
              </label>
              <label class="field">
                <span>New kickoff date</span>
                <input #rescheduleDateInput type="date" [(ngModel)]="manage.reschedule_date" (ngModelChange)="onManageFormChanged()" name="reschedule_date" [disabled]="selectedEvent()!.status === 'cancelled'" (click)="openNativePicker(rescheduleDateInput)" />
              </label>
              <label class="field">
                <span>New kickoff time</span>
                <input #rescheduleTimeInput type="time" [(ngModel)]="manage.reschedule_time" (ngModelChange)="onManageFormChanged()" name="reschedule_time" [disabled]="selectedEvent()!.status === 'cancelled'" (click)="openNativePicker(rescheduleTimeInput)" />
              </label>
              <label class="field">
                <span>New appearance time</span>
                <input #publishTimeInput type="time" [(ngModel)]="manage.publish_time" (ngModelChange)="onManageFormChanged()" name="manage_publish_time" [disabled]="selectedEvent()!.status === 'cancelled'" (click)="openNativePicker(publishTimeInput)" />
              </label>
              <label class="field span-2">
                <span>Reschedule scope</span>
                <select [(ngModel)]="manage.reschedule_scope" (ngModelChange)="onManageFormChanged()" name="reschedule_scope" [disabled]="selectedEvent()!.status === 'cancelled'">
                  <option value="this_occurrence_only">Only this occurrence</option>
                  <option value="this_and_following">This occurrence and following</option>
                </select>
              </label>
            </div>

            <div class="vote-board" [class.is-disabled]="selectedEvent()!.status === 'cancelled'">
              <div class="vote-column" (dragover)="allowDrop($event)" (drop)="dropToPool($event)">
                <p class="vote-column-title">Server members</p>
                <p class="vote-column-hint">Drag a voted member back here to remove their vote. Changes are saved live.</p>
                <div class="vote-column-list">
                  @for (member of poolMembers(); track member.id) {
                    <div class="vote-card" draggable="true" (dragstart)="dragMember(member.id)">
                      <div class="vote-card-row">
                        @if (member.avatar_url) {
                          <img [src]="member.avatar_url" [alt]="member.display_name" class="vote-card-avatar" />
                        } @else {
                          <span class="vote-card-avatar-fallback">{{ member.display_name.slice(0, 1) }}</span>
                        }
                        <p class="truncate">{{ member.display_name }}</p>
                      </div>
                      <div class="vote-card-actions">
                        <button type="button" class="vote-chip is-accept" (click)="moveMemberToStatus(member.id, 'accepted')" [disabled]="selectedEvent()!.status === 'cancelled'">Accept</button>
                        <button type="button" class="vote-chip is-decline" (click)="moveMemberToStatus(member.id, 'declined')" [disabled]="selectedEvent()!.status === 'cancelled'">Decline</button>
                        <button type="button" class="vote-chip is-tentative" (click)="moveMemberToStatus(member.id, 'tentative')" [disabled]="selectedEvent()!.status === 'cancelled'">Tentative</button>
                      </div>
                    </div>
                  } @empty {
                    <p class="vote-column-empty">All members currently assigned to a vote bucket.</p>
                  }
                </div>
              </div>

              @for (status of voteBuckets(); track status) {
                <div class="vote-column" (dragover)="allowDrop($event)" (drop)="dropToStatus(status, $event)">
                  <p class="vote-column-title" [class.is-accept]="status === 'accepted'" [class.is-decline]="status === 'declined'" [class.is-tentative]="status === 'tentative'">{{ status }} ({{ voteDraft()[status].length }})</p>
                  <div class="vote-column-list">
                    @for (memberId of voteDraft()[status]; track memberId) {
                      <div class="vote-card" draggable="true" (dragstart)="dragMember(memberId)">
                        <p class="truncate">{{ memberName(memberId) }}</p>
                        <div class="vote-card-actions">
                          @if (status !== 'accepted') {
                            <button type="button" class="vote-chip is-accept" (click)="moveMemberToStatus(memberId, 'accepted')" [disabled]="selectedEvent()!.status === 'cancelled'">A</button>
                          }
                          @if (status !== 'declined') {
                            <button type="button" class="vote-chip is-decline" (click)="moveMemberToStatus(memberId, 'declined')" [disabled]="selectedEvent()!.status === 'cancelled'">D</button>
                          }
                          @if (status !== 'tentative') {
                            <button type="button" class="vote-chip is-tentative" (click)="moveMemberToStatus(memberId, 'tentative')" [disabled]="selectedEvent()!.status === 'cancelled'">T</button>
                          }
                          <button type="button" class="vote-chip" (click)="removeMemberVote(memberId)" [disabled]="selectedEvent()!.status === 'cancelled'">Remove</button>
                        </div>
                      </div>
                    } @empty {
                      <p class="vote-column-empty">Drop members here.</p>
                    }
                  </div>
                </div>
              }
            </div>

            <div class="edit-card-actions">
              @if (selectedEvent()!.status === 'cancelled') {
                <button class="primary-action danger-action" [disabled]="loading()" type="button" (click)="deleteCancelledEvent(selectedEvent()!.id)">Delete permanently</button>
              } @else {
                <button class="primary-action" [disabled]="loading() || !manageDraftDirty()" type="button" (click)="saveEventChanges()">Save changes</button>
                <button class="secondary-action danger-action" [disabled]="loading()" type="button" (click)="cancelSelectedEvent()">Cancel event</button>
              }
              <button class="secondary-action" [disabled]="loading()" type="button" (click)="clearSelectedEvent()">Close editor</button>
            </div>
          </form>
        }
      </section>

    </section>
  `,
  styles: [
    `
      .manage-filters { display: grid; gap: 12px; grid-template-columns: repeat(3, 1fr); }
      .manage-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid var(--app-border); border-radius: 8px; background: var(--app-surface-muted); padding: 8px 12px; font-size: 12px; color: var(--app-text-muted); }
      .manage-table-wrap { overflow-x: auto; border: 1px solid var(--app-border); border-radius: 8px; background: var(--app-surface); }
      .manage-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
      .manage-table th { padding: 10px 12px; background: var(--app-surface-muted); color: var(--app-text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
      .manage-table td { padding: 10px 12px; border-top: 1px solid var(--app-border); color: var(--app-text); }
      .manage-table tr.is-clickable { cursor: pointer; }
      .manage-table tr.is-clickable:hover td { background: var(--app-surface-muted); }
      .manage-table tr.is-selected td { background: var(--app-surface-muted); }
      .manage-pagination { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--app-border); padding: 8px 12px; font-size: 12px; color: var(--app-text-muted); }
      .status-badge { font-weight: 700; text-transform: capitalize; }
      .status-badge.is-positive { color: #2f9e5b; }
      .status-badge.is-negative { color: #c94b4b; }
      .edit-card { border: 1px solid var(--app-border); border-radius: 8px; background: var(--app-surface-muted); padding: 14px; }
      .edit-card-kicker { margin: 0; color: var(--app-text-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
      .edit-card-note { margin: 6px 0 0; border-radius: 6px; background: rgb(37 99 235 / 10%); padding: 8px 10px; color: var(--app-text); font-size: 12px; }
      .edit-card-warning { margin: 6px 0 0; border: 1px solid rgb(201 75 75 / 40%); border-radius: 6px; background: rgb(201 75 75 / 10%); padding: 8px 10px; color: #c94b4b; font-size: 13px; }
      .manage-form-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, 1fr); margin-top: 12px; }
      .manage-form-grid .span-2 { grid-column: span 2; }
      .vote-board { display: grid; gap: 10px; grid-template-columns: repeat(4, 1fr); margin-top: 14px; }
      .vote-board.is-disabled { opacity: .5; pointer-events: none; }
      .vote-column { border: 1px solid var(--app-border); border-radius: 8px; background: var(--app-surface); padding: 8px; }
      .vote-column-title { margin: 0 0 8px; color: var(--app-text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
      .vote-column-title.is-accept { color: #2f9e5b; }
      .vote-column-title.is-decline { color: #c94b4b; }
      .vote-column-title.is-tentative { color: #b8860b; }
      .vote-column-hint { margin: 0 0 8px; color: var(--app-text-muted); font-size: 11px; }
      .vote-column-list { display: grid; gap: 6px; max-height: 220px; overflow-y: auto; }
      .vote-column-empty { color: var(--app-text-muted); font-size: 12px; }
      .vote-card { border: 1px solid var(--app-border); border-radius: 6px; background: var(--app-surface-muted); padding: 6px 8px; font-size: 13px; color: var(--app-text); }
      .vote-card-row { display: flex; align-items: center; gap: 8px; }
      .vote-card-avatar { width: 22px; height: 22px; border-radius: 999px; }
      .vote-card-avatar-fallback { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 999px; background: var(--app-border); font-size: 11px; }
      .vote-card-actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
      .vote-chip { border: 1px solid var(--app-border); border-radius: 4px; background: transparent; padding: 2px 6px; color: var(--app-text-muted); font-size: 11px; cursor: pointer; }
      .vote-chip.is-accept { border-color: rgb(47 158 91 / 45%); color: #2f9e5b; }
      .vote-chip.is-decline { border-color: rgb(201 75 75 / 45%); color: #c94b4b; }
      .vote-chip.is-tentative { border-color: rgb(184 134 11 / 45%); color: #b8860b; }
      .edit-card-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 14px; border-top: 1px solid var(--app-border); padding-top: 12px; }

      @media (max-width: 720px) {
        .manage-filters { grid-template-columns: 1fr; }
        .manage-form-grid { grid-template-columns: 1fr; }
        .manage-form-grid .span-2 { grid-column: span 1; }
        .vote-board { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class EventManagePageComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(SnackbarService);
  private eventUpdatesSource: EventSource | null = null;
  private suppressManageLiveSync = false;

  protected readonly loading = signal(false);
  protected readonly channels = signal<ChannelOption[]>([]);
  protected readonly members = signal<GuildMemberOption[]>([]);
  protected readonly seriesList = signal<EventSeries[]>([]);
  protected readonly selectedEventId = signal<number | null>(null);
  protected readonly manageStatusFilter = signal<ManageStatusFilter>('all');
  protected readonly manageSearch = signal('');
  protected readonly managePage = signal(1);
  protected readonly managePageSize = signal(10);
  protected readonly selectedManageEventIds = signal<number[]>([]);
  protected readonly manageDraftDirty = signal(false);
  protected readonly voteDraftDirty = signal(false);
  protected readonly voteDraft = signal<Record<VoteBucket, string[]>>({
    accepted: [],
    declined: [],
    tentative: [],
  });
  protected readonly draggedMemberId = signal('');
  protected readonly defaultTimezone = signal('Europe/Bucharest');
  protected readonly voteBuckets = signal<VoteBucket[]>(['accepted', 'declined', 'tentative']);

  protected readonly eventOptions = computed<EventOption[]>(() => {
    const options: EventOption[] = [];
    for (const series of this.seriesList()) {
      for (const event of series.events) {
        options.push({
          id: event.id,
          label: `${series.title} | Occurrence ${event.occurrence_number} | ${this.formatKickoffInTimezone(event.starts_at, series.timezone || this.defaultTimezone())}`,
        });
      }
    }
    return options.sort((a, b) => a.id - b.id);
  });

  protected readonly manageRows = computed<ManageEventRow[]>(() => {
    const rows: ManageEventRow[] = [];
    for (const series of this.seriesList()) {
      for (const event of series.events) {
        rows.push({
          id: event.id,
          title: series.title,
          occurrence_number: event.occurrence_number,
          starts_at: event.starts_at,
          timezone: series.timezone || this.defaultTimezone(),
          status: event.status,
          votes_count: event.votes.length,
          channel_id: series.channel_id,
        });
      }
    }
    return rows.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  });

  protected readonly filteredManageRows = computed<ManageEventRow[]>(() => {
    const statusFiltered = this.manageStatusFilter() === 'all'
      ? this.manageRows()
      : this.manageRows().filter(row => row.status === this.manageStatusFilter());

    const term = this.manageSearch().trim().toLowerCase();
    if (!term) return statusFiltered;

    return statusFiltered.filter(row => {
      const channelName = this.channelName(row.channel_id).toLowerCase();
      return row.title.toLowerCase().includes(term)
        || String(row.id).includes(term)
        || String(row.occurrence_number).includes(term)
        || channelName.includes(term)
        || row.status.toLowerCase().includes(term);
    });
  });

  protected readonly manageTotalPages = computed<number>(() => {
    const total = this.filteredManageRows().length;
    const size = this.managePageSize();
    return Math.max(1, Math.ceil(total / size));
  });

  protected readonly pagedManageRows = computed<ManageEventRow[]>(() => {
    const page = Math.min(this.managePage(), this.manageTotalPages());
    const size = this.managePageSize();
    const start = (page - 1) * size;
    return this.filteredManageRows().slice(start, start + size);
  });

  protected readonly pageStartIndex = computed<number>(() => {
    const total = this.filteredManageRows().length;
    if (!total) return 0;
    const page = Math.min(this.managePage(), this.manageTotalPages());
    return (page - 1) * this.managePageSize() + 1;
  });

  protected readonly pageEndIndex = computed<number>(() => {
    const total = this.filteredManageRows().length;
    if (!total) return 0;
    const page = Math.min(this.managePage(), this.manageTotalPages());
    return Math.min(page * this.managePageSize(), total);
  });

  protected readonly selectedManageRows = computed<ManageEventRow[]>(() => {
    const selected = new Set(this.selectedManageEventIds());
    return this.manageRows().filter(row => selected.has(row.id));
  });

  protected readonly hasSelectedCancelledManageRows = computed<boolean>(() =>
    this.selectedManageRows().some(row => row.status === 'cancelled'),
  );

  protected readonly selectedSeries = computed<EventSeries | null>(() => {
    const event = this.selectedEvent();
    if (!event) return null;
    return this.seriesList().find(series => series.id === event.series_id) || null;
  });

  protected readonly poolMembers = computed<GuildMemberOption[]>(() => {
    const assigned = new Set([
      ...this.voteDraft().accepted,
      ...this.voteDraft().declined,
      ...this.voteDraft().tentative,
    ]);
    return this.members().filter(member => !assigned.has(member.id));
  });

  protected readonly selectedEvent = computed<EventOccurrence | null>(() => {
    const eventId = this.selectedEventId();
    if (eventId === null) return null;
    for (const series of this.seriesList()) {
      const match = series.events.find(event => event.id === eventId);
      if (match) return match;
    }
    return null;
  });

  protected readonly manage = {
    title: 'Event',
    description: '',
    timezone: this.defaultTimezone(),
    reschedule_date: '',
    reschedule_time: '21:45',
    publish_time: '18:00',
    reschedule_scope: 'this_occurrence_only' as 'this_occurrence_only' | 'this_and_following',
  };

  async ngOnInit(): Promise<void> {
    await this.loadBootstrap();
    await this.load();
    this.startRealtimeStream();
  }

  ngOnDestroy(): void {
    this.eventUpdatesSource?.close();
    this.eventUpdatesSource = null;
  }

  private startRealtimeStream(): void {
    if (typeof window === 'undefined' || this.eventUpdatesSource) return;
    const baseUrl = this.api.getBaseUrl();
    const sessionToken = this.api.getSessionToken();
    const url = new URL(`${baseUrl}/api/admin/events/stream`);
    if (sessionToken) {
      url.searchParams.set('session_token', sessionToken);
    }
    this.eventUpdatesSource = new EventSource(url.toString(), { withCredentials: true });
    this.eventUpdatesSource.addEventListener('event-update', () => {
      void this.load(false);
    });
    this.eventUpdatesSource.onerror = () => {
      if (this.eventUpdatesSource) {
        this.eventUpdatesSource.close();
        this.eventUpdatesSource = null;
      }
      setTimeout(() => this.startRealtimeStream(), 5000);
    };
  }

  private async loadBootstrap(): Promise<void> {
    try {
      const bootstrap = await this.api.getBootstrap();
      this.channels.set(bootstrap.channels || []);
      this.members.set(bootstrap.members || []);
      this.defaultTimezone.set(String(bootstrap.default_timezone || 'Europe/Bucharest').trim() || 'Europe/Bucharest');
      this.manage.timezone = this.defaultTimezone();
    } catch {
      this.snackbar.error('Failed to load server channels from Discord.');
    }
  }

  protected channelName(channelId: string): string {
    return this.channels().find(channel => channel.id === channelId)?.name || channelId;
  }

  protected setManageStatusFilter(value: ManageStatusFilter): void {
    this.manageStatusFilter.set(value);
    this.managePage.set(1);
  }

  protected setManageSearch(value: string): void {
    this.manageSearch.set(String(value || ''));
    this.managePage.set(1);
  }

  protected prevManagePage(): void {
    this.managePage.update(page => Math.max(1, page - 1));
  }

  protected nextManagePage(): void {
    this.managePage.update(page => Math.min(this.manageTotalPages(), page + 1));
  }

  protected isManageRowSelected(eventId: number): boolean {
    return this.selectedManageEventIds().includes(eventId);
  }

  protected toggleManageRowSelection(eventId: number, checked: boolean): void {
    const next = new Set(this.selectedManageEventIds());
    if (checked) {
      next.add(eventId);
    } else {
      next.delete(eventId);
    }
    this.selectedManageEventIds.set([...next]);
  }

  protected clearManageSelection(): void {
    this.selectedManageEventIds.set([]);
  }

  protected selectVisibleManageRows(checked: boolean): void {
    const visibleIds = this.pagedManageRows().map(row => row.id);
    const next = new Set(this.selectedManageEventIds());
    for (const id of visibleIds) {
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }
    this.selectedManageEventIds.set([...next]);
  }

  protected areAllVisibleManageRowsSelected(): boolean {
    const visibleIds = this.pagedManageRows().map(row => row.id);
    return visibleIds.length > 0 && visibleIds.every(id => this.selectedManageEventIds().includes(id));
  }

  protected pickEventFromRow(eventId: number, status: EventOccurrence['status']): void {
    if (status === 'cancelled') return;
    this.pickEvent(eventId);
  }

  protected pickEvent(value: number | null): void {
    this.selectedEventId.set(value);
    this.manageDraftDirty.set(false);
    this.voteDraftDirty.set(false);
    const event = this.selectedEvent();
    if (!event) return;

    this.suppressManageLiveSync = true;

    const series = this.selectedSeries();
    if (series) {
      this.manage.title = series.title;
      this.manage.description = series.description;
      this.manage.timezone = series.timezone || this.defaultTimezone();
    }

    const kickoff = this.toDateTimeInputsInTimezone(event.starts_at, this.manage.timezone || this.defaultTimezone());
    this.manage.reschedule_date = kickoff.date;
    this.manage.reschedule_time = kickoff.time;
    const publish = this.toDateTimeInputsInTimezone(event.publish_at || event.starts_at, this.manage.timezone || this.defaultTimezone());
    this.manage.publish_time = publish.time;

    const nextDraft: Record<VoteBucket, string[]> = { accepted: [], declined: [], tentative: [] };
    for (const vote of event.votes) {
      const bucket = vote.status as VoteBucket;
      if (nextDraft[bucket] && !nextDraft[bucket].includes(vote.user_discord_id)) {
        nextDraft[bucket].push(vote.user_discord_id);
      }
    }
    this.voteDraft.set(nextDraft);

    setTimeout(() => {
      this.suppressManageLiveSync = false;
    }, 0);
  }

  protected memberName(memberId: string): string {
    const member = this.members().find(item => item.id === memberId);
    if (member) return member.display_name;
    const vote = this.selectedEvent()?.votes.find(item => item.user_discord_id === memberId);
    if (vote) return vote.display_name;
    return memberId;
  }

  private toDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toTimeInput(date: Date): string {
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${hour}:${minute}`;
  }

  private extractPartsInTimezone(date: Date, timezoneName: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezoneName,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    }).formatToParts(date);

    const byType = new Map(parts.map(part => [part.type, part.value]));
    return {
      year: Number(byType.get('year') || '0'),
      month: Number(byType.get('month') || '1'),
      day: Number(byType.get('day') || '1'),
      hour: Number(byType.get('hour') || '0'),
      minute: Number(byType.get('minute') || '0'),
      second: Number(byType.get('second') || '0'),
    };
  }

  private timezoneOffsetMs(date: Date, timezoneName: string): number {
    const parts = this.extractPartsInTimezone(date, timezoneName);
    const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return zonedAsUtc - date.getTime();
  }

  private wallTimeToUtcIso(dateInput: string, timeInput: string, timezoneName: string): string {
    const [year, month, day] = dateInput.split('-').map(value => Number(value));
    const [hour, minute] = timeInput.split(':').map(value => Number(value));
    const wallTimeUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

    let candidate = wallTimeUtc;
    for (let i = 0; i < 3; i += 1) {
      const offset = this.timezoneOffsetMs(new Date(candidate), timezoneName);
      const next = wallTimeUtc - offset;
      if (next === candidate) break;
      candidate = next;
    }

    return new Date(candidate).toISOString();
  }

  private toDateTimeInputsInTimezone(iso: string, timezoneName: string): { date: string; time: string } {
    const parts = this.extractPartsInTimezone(this.parseApiDate(iso), timezoneName);
    const date = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    const time = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
    return { date, time };
  }

  protected formatKickoffInTimezone(iso: string, timezoneName: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezoneName,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(this.parseApiDate(iso));
  }

  private parseApiDate(iso: string): Date {
    const raw = String(iso || '').trim();
    if (!raw) return new Date(NaN);

    const hasZoneDesignator = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
    const normalized = hasZoneDesignator ? raw : `${raw}Z`;
    return new Date(normalized);
  }

  private draftFromEvent(event: EventOccurrence): Record<VoteBucket, string[]> {
    const draft: Record<VoteBucket, string[]> = { accepted: [], declined: [], tentative: [] };
    for (const vote of event.votes) {
      const bucket = vote.status as VoteBucket;
      if (!draft[bucket].includes(vote.user_discord_id)) {
        draft[bucket].push(vote.user_discord_id);
      }
    }
    return draft;
  }

  private apiErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const payload = error.error as { detail?: string } | string | null;
      const detail = typeof payload === 'string'
        ? payload
        : typeof payload?.detail === 'string'
          ? payload.detail
          : '';
      if (detail.trim()) {
        if (detail.includes('cannot move kickoff to the past')) {
          return 'Cannot move kickoff to the past. Choose a future date and time.';
        }
        if (detail.includes('event changed by another admin')) {
          return 'Failed to save event changes. Another admin may have changed this event; refresh and try again.';
        }
        return detail;
      }
    }
    return fallback;
  }

  private resetMessages(): void {
    void 0;
  }

  async load(resetMessages = true): Promise<void> {
    if (resetMessages) {
      this.resetMessages();
    }
    try {
      const data = await this.api.listEvents();
      this.seriesList.set(data);
      this.managePage.update(page => Math.min(page, this.manageTotalPages()));
      const selectedId = this.selectedEventId();
      if (selectedId !== null && !data.some(series => series.events.some(event => event.id === selectedId))) {
        this.selectedEventId.set(null);
        this.voteDraftDirty.set(false);
      } else if (selectedId !== null && !this.voteDraftDirty()) {
        this.pickEvent(selectedId);
      }
    } catch {
      this.snackbar.error('Failed to load event data.');
    }
  }

  private voteMapFromDraft(): Record<string, VoteBucket> {
    const result: Record<string, VoteBucket> = {};
    for (const memberId of this.voteDraft().accepted) result[memberId] = 'accepted';
    for (const memberId of this.voteDraft().declined) result[memberId] = 'declined';
    for (const memberId of this.voteDraft().tentative) result[memberId] = 'tentative';
    return result;
  }

  private eventVoteMap(event: EventOccurrence): Record<string, VoteBucket> {
    const result: Record<string, VoteBucket> = {};
    for (const vote of event.votes) {
      result[vote.user_discord_id] = vote.status as VoteBucket;
    }
    return result;
  }

  private async syncVoteDraft(selected: EventOccurrence): Promise<void> {
    const current = this.eventVoteMap(selected);
    const next = this.voteMapFromDraft();
    const allMemberIds = new Set<string>([...Object.keys(current), ...Object.keys(next)]);

    for (const memberId of allMemberIds) {
      const currentStatus = current[memberId];
      const nextStatus = next[memberId];
      if (currentStatus === nextStatus) continue;

      if (!nextStatus) {
        await this.api.removeEventVote(selected.id, memberId);
        continue;
      }

      await this.api.setEventVote(selected.id, {
        user_discord_id: memberId,
        display_name: this.memberName(memberId),
        status: nextStatus,
      });
    }
  }

  private voteUpdatesPayload(draft: Record<VoteBucket, string[]>): Array<{ user_discord_id: string; display_name: string; status: VoteStatus }> {
    const entries: Array<{ user_discord_id: string; display_name: string; status: VoteStatus }> = [];
    for (const memberId of draft.accepted) {
      entries.push({ user_discord_id: memberId, display_name: this.memberName(memberId), status: 'accepted' });
    }
    for (const memberId of draft.declined) {
      entries.push({ user_discord_id: memberId, display_name: this.memberName(memberId), status: 'declined' });
    }
    for (const memberId of draft.tentative) {
      entries.push({ user_discord_id: memberId, display_name: this.memberName(memberId), status: 'tentative' });
    }
    return entries;
  }

  async applyVoteChanges(): Promise<void> {
    this.resetMessages();
    const selected = this.selectedEvent();
    if (!selected) {
      this.snackbar.error('Select an event first.');
      return;
    }
    if (selected.status === 'cancelled') {
      this.snackbar.error('Cancelled events cannot be edited.');
      return;
    }

    this.loading.set(true);
    const originalDraft = this.draftFromEvent(selected);
    try {
      await this.syncVoteDraft(selected);
      this.voteDraftDirty.set(false);
      await this.load(false);
      this.pickEvent(selected.id);
      this.snackbar.success('Votes updated and synced to Discord.');
    } catch (error) {
      this.voteDraft.set(originalDraft);
      this.voteDraftDirty.set(false);
      this.snackbar.error(this.apiErrorMessage(error, 'Failed to update votes.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected clearAllDraftVotes(): void {
    this.voteDraft.set({ accepted: [], declined: [], tentative: [] });
    this.voteDraftDirty.set(true);
  }

  protected onManageFormChanged(debounce = false): void {
    if (this.suppressManageLiveSync) return;
    this.manageDraftDirty.set(true);
  }

  protected openNativePicker(input: HTMLInputElement): void { input.showPicker?.(); }

  protected dragMember(memberId: string): void {
    this.draggedMemberId.set(memberId);
  }

  protected allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  protected dropToStatus(status: VoteBucket, event: DragEvent): void {
    event.preventDefault();
    const memberId = this.draggedMemberId();
    if (!memberId) return;
    this.moveMemberToStatus(memberId, status);
    this.draggedMemberId.set('');
  }

  protected dropToPool(event: DragEvent): void {
    event.preventDefault();
    const memberId = this.draggedMemberId();
    if (!memberId) return;
    this.removeMemberVote(memberId);
    this.draggedMemberId.set('');
  }

  protected moveMemberToStatus(memberId: string, status: VoteBucket): void {
    const selected = this.selectedEvent();
    if (!selected) return;
    if (selected.status === 'cancelled') return;

    const current = this.voteMapFromDraft()[memberId] || null;
    if (current === status) return;

    const next: Record<VoteBucket, string[]> = {
      accepted: this.voteDraft().accepted.filter(value => value !== memberId),
      declined: this.voteDraft().declined.filter(value => value !== memberId),
      tentative: this.voteDraft().tentative.filter(value => value !== memberId),
    };
    next[status] = [...next[status], memberId];
    this.voteDraft.set(next);
    this.voteDraftDirty.set(true);
    this.manageDraftDirty.set(true);
  }

  protected removeMemberVote(memberId: string): void {
    const selected = this.selectedEvent();
    if (!selected) return;
    if (selected.status === 'cancelled') return;

    const current = this.voteMapFromDraft()[memberId] || null;
    if (!current) return;

    this.voteDraft.set({
      accepted: this.voteDraft().accepted.filter(value => value !== memberId),
      declined: this.voteDraft().declined.filter(value => value !== memberId),
      tentative: this.voteDraft().tentative.filter(value => value !== memberId),
    });
    this.voteDraftDirty.set(true);
    this.manageDraftDirty.set(true);
  }

  async saveEventChanges(): Promise<void> {
    this.resetMessages();
    const selected = this.selectedEvent();
    if (!selected) {
      this.snackbar.error('Select an event first.');
      return;
    }
    if (selected.status === 'cancelled') {
      this.snackbar.error('Cancelled events cannot be edited.');
      return;
    }
    if (!this.manage.reschedule_date || !this.manage.reschedule_time) {
      this.snackbar.error('Select both reschedule date and time.');
      return;
    }

    this.loading.set(true);
    const originalDraft = this.draftFromEvent(selected);
    try {
      const pendingVoteDraft = {
        accepted: [...this.voteDraft().accepted],
        declined: [...this.voteDraft().declined],
        tentative: [...this.voteDraft().tentative],
      };
      const startsAt = this.wallTimeToUtcIso(this.manage.reschedule_date, this.manage.reschedule_time, this.manage.timezone || this.defaultTimezone());
      await this.api.editEvent(selected.id, {
        title: this.manage.title.trim(),
        description: this.manage.description.trim(),
        timezone: this.manage.timezone,
        starts_at: startsAt,
        publish_time: this.manage.publish_time || null,
        scope: this.manage.reschedule_scope,
        expected_updated_at: selected.updated_at,
        vote_updates: this.voteUpdatesPayload(pendingVoteDraft),
      });

      await this.load(false);
      this.snackbar.success('Event changes saved and synced to Discord.');
      this.pickEvent(selected.id);
      this.manageDraftDirty.set(false);
      this.voteDraftDirty.set(false);
    } catch (error) {
      this.voteDraft.set(originalDraft);
      this.voteDraftDirty.set(false);
      this.snackbar.error(this.apiErrorMessage(error, 'Failed to save event changes.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected clearSelectedEvent(): void {
    this.selectedEventId.set(null);
    this.manageDraftDirty.set(false);
    this.voteDraftDirty.set(false);
    this.manage.title = 'Event';
    this.manage.description = '';
    this.manage.timezone = this.defaultTimezone();
    this.manage.reschedule_date = '';
    this.manage.reschedule_time = '21:45';
    this.manage.publish_time = '18:00';
    this.manage.reschedule_scope = 'this_occurrence_only';
    this.voteDraft.set({ accepted: [], declined: [], tentative: [] });
  }

  async cancelSelectedEvent(): Promise<void> {
    this.resetMessages();
    const selected = this.selectedEvent();
    if (!selected) {
      this.snackbar.error('Select an event first.');
      return;
    }
    if (selected.status === 'cancelled') {
      this.snackbar.error('Event is already cancelled.');
      return;
    }

    this.loading.set(true);
    try {
      await this.api.cancelEvent(selected.id);
      await this.load();
      this.clearSelectedEvent();
      this.snackbar.success('Event cancelled and Discord message removed.');
    } catch {
      this.snackbar.error('Failed to cancel event.');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteCancelledEvent(eventId: number): Promise<void> {
    this.resetMessages();
    this.loading.set(true);
    try {
      await this.api.deleteEvent(eventId);
      await this.load(false);
      if (this.selectedEventId() === eventId) {
        this.clearSelectedEvent();
      }
      this.snackbar.success('Cancelled event deleted permanently from history.');
    } catch {
      this.snackbar.error('Failed to delete cancelled event.');
    } finally {
      this.loading.set(false);
    }
  }

  async cancelSelectedManageEvents(): Promise<void> {
    this.resetMessages();
    const selectedIds = this.selectedManageRows().filter(row => row.status !== 'cancelled').map(row => row.id);
    if (!selectedIds.length) {
      this.snackbar.error('Select at least one non-cancelled event to cancel.');
      return;
    }

    this.loading.set(true);
    try {
      for (const eventId of selectedIds) {
        await this.api.cancelEvent(eventId);
      }
      await this.load();
      this.clearManageSelection();
      this.snackbar.success(`Cancelled ${selectedIds.length} event(s).`);
    } catch {
      this.snackbar.error('Failed to cancel selected events.');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteSelectedCancelledManageEvents(): Promise<void> {
    this.resetMessages();
    const selectedIds = this.selectedManageRows().filter(row => row.status === 'cancelled').map(row => row.id);
    if (!selectedIds.length) {
      this.snackbar.error('Select at least one cancelled event to delete.');
      return;
    }

    this.loading.set(true);
    try {
      for (const eventId of selectedIds) {
        await this.api.deleteEvent(eventId);
      }
      await this.load(false);
      if (this.selectedEventId() !== null && selectedIds.includes(this.selectedEventId()!)) {
        this.clearSelectedEvent();
      }
      this.clearManageSelection();
      this.snackbar.success(`Deleted ${selectedIds.length} cancelled event(s).`);
    } catch {
      this.snackbar.error('Failed to delete selected cancelled events.');
    } finally {
      this.loading.set(false);
    }
  }
}