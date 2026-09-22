import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import {
  EventItem,
  EventOccurrence,
  EventRsvp,
  VoteStatus,
} from '../../core/models';
import { RsvpBadgeComponent } from '../../shared/components/rsvp-badge.component';

@Component({
  selector: 'app-event-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, RsvpBadgeComponent],
  template: `
    <div class="space-y-6 max-w-7xl w-full mx-auto animate-fadeIn">
      <!-- Breadcrumb Navigation -->
      <nav class="flex items-center gap-2 text-xs text-slate-400">
        <a routerLink="/admin/events" class="hover:text-slate-200">Guild Events</a>
        <span>/</span>
        <span class="text-white font-medium truncate max-w-xs">{{ event()?.title || 'Event Details' }}</span>
      </nav>

      @if (isLoading()) {
        <div class="py-20 text-center text-slate-400">
          <div class="inline-block animate-spin w-8 h-8 border-2 border-[#5865F2] border-t-transparent rounded-full mb-3"></div>
          <p class="text-sm font-medium">Loading event details...</p>
        </div>
      } @else if (!event()) {
        <div class="p-12 text-center rounded-xl bg-[#16213e] border border-slate-700 space-y-3">
          <div class="text-4xl">⚠️</div>
          <h2 class="text-lg font-bold text-white">Event Not Found</h2>
          <p class="text-xs text-slate-400">The event could not be found or was deleted.</p>
          <a routerLink="/admin/events" class="inline-block px-4 py-2 rounded-lg bg-[#5865F2] text-white text-xs font-semibold">
            Return to Events
          </a>
        </div>
      } @else {
        <!-- Event Header Card -->
        <div class="rounded-xl bg-[#16213e] border border-slate-700/60 overflow-hidden shadow-xl">
          <!-- Color Banner Accent -->
          <div class="h-2 w-full" [style.background-color]="event()!.color || '#5865F2'"></div>

          <div class="p-6 space-y-5">
            <!-- Top Controls Row -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <!-- Badges -->
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border"
                  [class.bg-emerald-500/20]="event()!.status === 'active'"
                  [class.text-emerald-400]="event()!.status === 'active'"
                  [class.border-emerald-500/30]="event()!.status === 'active'"
                  [class.bg-amber-500/20]="event()!.status === 'draft'"
                  [class.text-amber-400]="event()!.status === 'draft'"
                  [class.border-amber-500/30]="event()!.status === 'draft'"
                  [class.bg-slate-700/50]="event()!.status === 'archived'"
                  [class.text-slate-400]="event()!.status === 'archived'"
                  [class.border-slate-600]="event()!.status === 'archived'"
                >
                  {{ event()!.status }}
                </span>

                @if (event()!.isRecurring) {
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    <svg class="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {{ event()!.frequency || 'Recurring' }}
                  </span>
                } @else {
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                    One-time Event
                  </span>
                }
              </div>

              <!-- Edit & Delete Buttons -->
              <div class="flex items-center gap-2">
                @if (!isEditing()) {
                  <button
                    type="button"
                    (click)="startEdit()"
                    class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-600 hover:border-slate-500 text-white text-xs font-semibold transition active:scale-95 cursor-pointer"
                  >
                    <svg class="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>Edit Event</span>
                  </button>
                  <button
                    type="button"
                    (click)="deleteEvent()"
                    [disabled]="isDeleting()"
                    class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    @if (isDeleting()) {
                      <span class="inline-block animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                    } @else {
                      <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    }
                    <span>Delete</span>
                  </button>
                } @else {
                  <button
                    type="button"
                    (click)="saveEdit()"
                    class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition cursor-pointer"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    (click)="cancelEdit()"
                    class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-600 text-slate-200 text-xs font-semibold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                }
              </div>
            </div>

            <!-- Title & Description (View or Edit Mode) -->
            @if (!isEditing()) {
              <div>
                <h1 class="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {{ event()!.title }}
                </h1>
                <p class="text-slate-300 text-sm mt-2 leading-relaxed whitespace-pre-line">
                  {{ event()!.description || 'No description provided for this event.' }}
                </p>
              </div>
            } @else {
              <div class="space-y-3 p-4 rounded-lg bg-[#1a1a2e] border border-slate-700">
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1">Title</label>
                  <input
                    type="text"
                    [ngModel]="editTitle()"
                    (ngModelChange)="editTitle.set($event)"
                    class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2]"
                  />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                  <textarea
                    [ngModel]="editDescription()"
                    (ngModelChange)="editDescription.set($event)"
                    rows="3"
                    class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2]"
                  ></textarea>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1">Location</label>
                  <input
                    type="text"
                    [ngModel]="editLocation()"
                    (ngModelChange)="editLocation.set($event)"
                    class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2]"
                  />
                </div>
              </div>
            }

            <!-- Metadata Cards Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div class="p-3 rounded-lg bg-[#11192e] border border-slate-700/60">
                <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Next Kickoff</span>
                <div class="mt-1 flex items-center gap-1.5 text-xs text-white font-medium">
                  <span>📅</span>
                  <span>{{ event()!.nextOccurrence || event()!.startsAt }}</span>
                </div>
              </div>

              <div class="p-3 rounded-lg bg-[#11192e] border border-slate-700/60">
                <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Location / Venue</span>
                <div class="mt-1 flex items-center gap-1.5 text-xs text-white font-medium truncate">
                  <span>📍</span>
                  <span>{{ event()!.location || 'Not specified' }}</span>
                </div>
              </div>

              <div class="p-3 rounded-lg bg-[#11192e] border border-slate-700/60">
                <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Overall RSVPs</span>
                <div class="mt-1">
                  <app-rsvp-badge [counts]="event()!.rsvpsCount" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Occurrences & RSVP Section -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-bold text-white">Event Occurrences</h2>
              <p class="text-xs text-slate-400">Track attendances, inspect respondent lists, and manage single dates.</p>
            </div>
            <span class="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
              {{ occurrences().length }} Scheduled
            </span>
          </div>

          @if (occurrences().length === 0) {
            <div class="p-8 rounded-xl bg-[#16213e] border border-slate-800 text-center text-slate-400 text-xs">
              No occurrences scheduled yet.
            </div>
          } @else {
            <div class="space-y-3">
              @for (occ of occurrences(); track occ.id) {
                <div class="rounded-xl bg-[#16213e] border border-slate-700/60 overflow-hidden transition">
                  <!-- Occurrence Item Header -->
                  <div class="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div class="flex items-center gap-3">
                      <!-- Date Icon Pill -->
                      <div class="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[#5865F2] flex items-center justify-center font-bold text-sm shrink-0">
                        🗓️
                      </div>

                      <div>
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-bold text-white">{{ occ.startsAt }}</span>
                          <!-- Status Badge -->
                          <span
                            class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border"
                            [class.bg-emerald-500/20]="occ.status === 'open' || occ.status === 'scheduled'"
                            [class.text-emerald-400]="occ.status === 'open' || occ.status === 'scheduled'"
                            [class.border-emerald-500/30]="occ.status === 'open' || occ.status === 'scheduled'"
                            [class.bg-rose-500/20]="occ.status === 'cancelled'"
                            [class.text-rose-400]="occ.status === 'cancelled'"
                            [class.border-rose-500/30]="occ.status === 'cancelled'"
                            [class.bg-slate-700]="occ.status === 'closed'"
                            [class.text-slate-300]="occ.status === 'closed'"
                            [class.border-slate-600]="occ.status === 'closed'"
                          >
                            {{ occ.status }}
                          </span>
                        </div>
                        <div class="text-xs text-slate-400 mt-0.5">
                          Closes: {{ occ.closesAt || 'At kickoff' }}
                        </div>
                      </div>
                    </div>

                    <!-- Actions & RSVP Badge -->
                    <div class="flex items-center gap-3 self-end md:self-center">
                      <app-rsvp-badge [counts]="occ.counts" />

                      @if (occ.status !== 'cancelled') {
                        <button
                          type="button"
                          (click)="cancelSingleOccurrence(occ.id)"
                          class="text-xs font-semibold text-rose-200 hover:text-white px-3 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 border border-rose-600/50 shadow-sm transition cursor-pointer"
                          title="Cancel this occurrence"
                        >
                          Cancel
                        </button>
                      }

                      <!-- Toggle RSVPs Viewer Button -->
                      <button
                        type="button"
                        (click)="toggleRsvps(occ.id)"
                        class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-white text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 hover:border-slate-600 transition cursor-pointer"
                      >
                        <span class="text-xs font-medium text-white">Attendees</span>
                        <svg
                          class="w-4 h-4 transition transform duration-200 text-slate-300"
                          [class.rotate-180]="expandedOccurrenceId() === occ.id"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <!-- Expandable RSVP Viewer -->
                  @if (expandedOccurrenceId() === occ.id) {
                    <div class="border-t border-slate-700/60 bg-[#11192e] p-5 animate-fadeIn">
                      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                        RSVP Responses Breakdown
                      </h3>

                      @if (isLoadingRsvps(occ.id)) {
                        <div class="py-6 text-center text-slate-400 text-xs">
                          <div class="inline-block animate-spin w-4 h-4 border-2 border-[#5865F2] border-t-transparent rounded-full mb-1"></div>
                          <p>Loading attendees list...</p>
                        </div>
                      } @else {
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <!-- Accepted Column -->
                          <div class="rounded-lg bg-[#16213e] border border-emerald-500/20 p-3 space-y-2">
                            <div class="flex items-center justify-between pb-2 border-b border-slate-700 text-xs font-semibold text-emerald-400">
                              <span>✅ Accepted ({{ getFilteredRsvps(occ.id, 'accepted').length }})</span>
                            </div>
                            <div class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                              @if (getFilteredRsvps(occ.id, 'accepted').length === 0) {
                                <p class="text-slate-500 text-xs italic py-2">No responses yet</p>
                              } @else {
                                @for (rsvp of getFilteredRsvps(occ.id, 'accepted'); track rsvp.user_discord_id) {
                                  <div class="flex items-center gap-2 p-1.5 rounded bg-slate-800/50 text-xs">
                                    <div class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                                      {{ rsvp.display_name.charAt(0).toUpperCase() }}
                                    </div>
                                    <span class="font-medium text-white truncate">{{ rsvp.display_name }}</span>
                                  </div>
                                }
                              }
                            </div>
                          </div>

                          <!-- Tentative Column -->
                          <div class="rounded-lg bg-[#16213e] border border-amber-500/20 p-3 space-y-2">
                            <div class="flex items-center justify-between pb-2 border-b border-slate-700 text-xs font-semibold text-amber-400">
                              <span>❓ Tentative ({{ getFilteredRsvps(occ.id, 'tentative').length }})</span>
                            </div>
                            <div class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                              @if (getFilteredRsvps(occ.id, 'tentative').length === 0) {
                                <p class="text-slate-500 text-xs italic py-2">No responses yet</p>
                              } @else {
                                @for (rsvp of getFilteredRsvps(occ.id, 'tentative'); track rsvp.user_discord_id) {
                                  <div class="flex items-center gap-2 p-1.5 rounded bg-slate-800/50 text-xs">
                                    <div class="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                                      {{ rsvp.display_name.charAt(0).toUpperCase() }}
                                    </div>
                                    <span class="font-medium text-white truncate">{{ rsvp.display_name }}</span>
                                  </div>
                                }
                              }
                            </div>
                          </div>

                          <!-- Declined Column -->
                          <div class="rounded-lg bg-[#16213e] border border-rose-500/20 p-3 space-y-2">
                            <div class="flex items-center justify-between pb-2 border-b border-slate-700 text-xs font-semibold text-rose-400">
                              <span>❌ Declined ({{ getFilteredRsvps(occ.id, 'declined').length }})</span>
                            </div>
                            <div class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                              @if (getFilteredRsvps(occ.id, 'declined').length === 0) {
                                <p class="text-slate-500 text-xs italic py-2">No responses yet</p>
                              } @else {
                                @for (rsvp of getFilteredRsvps(occ.id, 'declined'); track rsvp.user_discord_id) {
                                  <div class="flex items-center gap-2 p-1.5 rounded bg-slate-800/50 text-xs">
                                    <div class="w-6 h-6 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                                      {{ rsvp.display_name.charAt(0).toUpperCase() }}
                                    </div>
                                    <span class="font-medium text-white truncate">{{ rsvp.display_name }}</span>
                                  </div>
                                }
                              }
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: ``,
})
export class EventDetailComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly guildStore = inject(GuildStore);

  readonly event = signal<EventItem | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly isDeleting = signal<boolean>(false);
  readonly isEditing = signal<boolean>(false);

  // Edit fields
  readonly editTitle = signal<string>('');
  readonly editDescription = signal<string>('');
  readonly editLocation = signal<string>('');

  // RSVPs expansion state
  readonly expandedOccurrenceId = signal<string | null>(null);
  readonly occurrenceRsvps = signal<Record<string, EventRsvp[]>>({});
  readonly loadingRsvps = signal<Record<string, boolean>>({});

  readonly occurrences = computed(() => this.event()?.occurrences ?? []);

  ngOnInit(): void {
    const eventId = this.route.snapshot.paramMap.get('eventId');
    const guildId = this.guildStore.activeGuildId();
    if (eventId) {
      this.loadEvent(guildId, eventId);
    }
  }

  async loadEvent(guildId: string | null, eventId: string): Promise<void> {
    this.isLoading.set(true);
    const gid = guildId || this.guildStore.activeGuildId() || '';
    try {
      const data = await this.api.getEvent(gid, eventId);
      this.event.set(data);
      this.initEditForm(data);
    } catch (err: unknown) {
      console.error('API event detail fetch failed:', err);
      this.event.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  private initEditForm(item: EventItem): void {
    this.editTitle.set(item.title);
    this.editDescription.set(item.description || '');
    this.editLocation.set(item.location || '');
  }

  startEdit(): void {
    this.isEditing.set(true);
  }

  cancelEdit(): void {
    if (this.event()) {
      this.initEditForm(this.event()!);
    }
    this.isEditing.set(false);
  }

  async saveEdit(): Promise<void> {
    const current = this.event();
    const guildId = this.guildStore.activeGuildId();
    if (!current || !guildId) return;

    const updatedData: Partial<EventItem> = {
      title: this.editTitle(),
      description: this.editDescription(),
      location: this.editLocation(),
    };

    try {
      const result = await this.api.updateEvent(guildId, current.id, updatedData);
      this.event.set(result);
    } catch (err) {
      console.error('Save edit failed:', err);
    } finally {
      this.isEditing.set(false);
    }
  }

  async deleteEvent(): Promise<void> {
    const current = this.event();
    const guildId = this.guildStore.activeGuildId();
    if (!current || !guildId) return;

    if (!confirm(`Are you sure you want to delete "${current.title}"?`)) {
      return;
    }

    this.isDeleting.set(true);
    try {
      await this.api.deleteEvent(guildId, current.id);
    } catch (err: unknown) {
      console.error('Delete event failed:', err);
    } finally {
      this.isDeleting.set(false);
      this.router.navigate(['/events']);
    }
  }

  async cancelSingleOccurrence(occurrenceId: string): Promise<void> {
    const current = this.event();
    const guildId = this.guildStore.activeGuildId();
    if (!current || !guildId) return;

    if (!confirm('Are you sure you want to cancel this specific occurrence?')) {
      return;
    }

    try {
      await this.api.cancelOccurrence(guildId, current.id, occurrenceId);
    } catch (err: unknown) {
      console.error('Cancel occurrence failed:', err);
    }

    // Update locally in signal
    const updatedOccurrences = current.occurrences.map((occ) => {
      if (occ.id === occurrenceId) {
        return { ...occ, status: 'cancelled' as const };
      }
      return occ;
    });

    this.event.set({
      ...current,
      occurrences: updatedOccurrences,
    });
  }

  async toggleRsvps(occurrenceId: string): Promise<void> {
    if (this.expandedOccurrenceId() === occurrenceId) {
      this.expandedOccurrenceId.set(null);
      return;
    }

    this.expandedOccurrenceId.set(occurrenceId);

    // If we haven't loaded rsvps yet
    if (!this.occurrenceRsvps()[occurrenceId]) {
      this.setLoadingRsvps(occurrenceId, true);
      const current = this.event();
      const guildId = this.guildStore.activeGuildId();

      try {
        if (current && guildId) {
          const rsvps = await this.api.getRsvps(guildId, current.id, occurrenceId);
          this.setOccurrenceRsvps(occurrenceId, rsvps || []);
        }
      } catch (err: unknown) {
        console.error('Could not fetch RSVPs from API:', err);
        const occ = this.occurrences().find((o) => o.id === occurrenceId);
        this.setOccurrenceRsvps(occurrenceId, occ?.rsvps || []);
      } finally {
        this.setLoadingRsvps(occurrenceId, false);
      }
    }
  }

  isLoadingRsvps(occurrenceId: string): boolean {
    return Boolean(this.loadingRsvps()[occurrenceId]);
  }

  getFilteredRsvps(occurrenceId: string, status: VoteStatus): EventRsvp[] {
    const list = this.occurrenceRsvps()[occurrenceId] || [];
    return list.filter((r) => r.status === status);
  }

  private setOccurrenceRsvps(occurrenceId: string, rsvps: EventRsvp[]): void {
    this.occurrenceRsvps.set({
      ...this.occurrenceRsvps(),
      [occurrenceId]: rsvps,
    });
  }

  private setLoadingRsvps(occurrenceId: string, loading: boolean): void {
    this.loadingRsvps.set({
      ...this.loadingRsvps(),
      [occurrenceId]: loading,
    });
  }
}
