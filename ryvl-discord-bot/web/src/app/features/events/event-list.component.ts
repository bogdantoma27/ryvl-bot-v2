import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { EventItem } from '../../core/models';
import { RsvpBadgeComponent } from '../../shared/components/rsvp-badge.component';

type FilterTab = 'all' | 'active' | 'draft' | 'archived';

@Component({
  selector: 'app-event-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, RsvpBadgeComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-white tracking-tight">Guild Events</h1>
          <p class="text-sm text-slate-400 mt-0.5">
            Manage scheduled fixtures, scrims, and practice sessions.
          </p>
        </div>

        <a
          routerLink="/events/new"
          class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold shadow-md hover:shadow-indigo-500/25 transition active:scale-95 cursor-pointer"
        >
          <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          <span class="text-white">Create Event</span>
        </a>
      </div>

      <!-- Filters & Search Bar -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-3 rounded-xl bg-[#16213e] border border-slate-700/60">
        <!-- Tabs -->
        <div class="flex items-center gap-1 bg-[#1a1a2e] p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            (click)="setTab('all')"
            [class.bg-[#5865F2]]="selectedTab() === 'all'"
            [class.text-white]="selectedTab() === 'all'"
            [class.font-bold]="selectedTab() === 'all'"
            [class.shadow-sm]="selectedTab() === 'all'"
            [class.text-slate-300]="selectedTab() !== 'all'"
            class="px-3 py-1.5 rounded-md text-xs font-medium hover:text-white hover:bg-slate-800/80 transition cursor-pointer"
          >
            All ({{ allCount() }})
          </button>
          <button
            type="button"
            (click)="setTab('active')"
            [class.bg-[#5865F2]]="selectedTab() === 'active'"
            [class.text-white]="selectedTab() === 'active'"
            [class.font-bold]="selectedTab() === 'active'"
            [class.shadow-sm]="selectedTab() === 'active'"
            [class.text-slate-300]="selectedTab() !== 'active'"
            class="px-3 py-1.5 rounded-md text-xs font-medium hover:text-white hover:bg-slate-800/80 transition cursor-pointer"
          >
            Active ({{ activeCount() }})
          </button>
          <button
            type="button"
            (click)="setTab('draft')"
            [class.bg-[#5865F2]]="selectedTab() === 'draft'"
            [class.text-white]="selectedTab() === 'draft'"
            [class.font-bold]="selectedTab() === 'draft'"
            [class.shadow-sm]="selectedTab() === 'draft'"
            [class.text-slate-300]="selectedTab() !== 'draft'"
            class="px-3 py-1.5 rounded-md text-xs font-medium hover:text-white hover:bg-slate-800/80 transition cursor-pointer"
          >
            Draft ({{ draftCount() }})
          </button>
          <button
            type="button"
            (click)="setTab('archived')"
            [class.bg-[#5865F2]]="selectedTab() === 'archived'"
            [class.text-white]="selectedTab() === 'archived'"
            [class.font-bold]="selectedTab() === 'archived'"
            [class.shadow-sm]="selectedTab() === 'archived'"
            [class.text-slate-300]="selectedTab() !== 'archived'"
            class="px-3 py-1.5 rounded-md text-xs font-medium hover:text-white hover:bg-slate-800/80 transition cursor-pointer"
          >
            Archived ({{ archivedCount() }})
          </button>
        </div>

        <!-- Search input -->
        <div class="relative w-full sm:w-64">
          <input
            type="text"
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
            placeholder="Search events..."
            class="w-full bg-[#1a1a2e] border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#5865F2] transition"
          />
          <svg class="w-4 h-4 text-slate-400 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <!-- Events Grid -->
      @if (isLoading()) {
        <div class="py-16 text-center text-slate-400">
          <div class="inline-block animate-spin w-8 h-8 border-2 border-[#5865F2] border-t-transparent rounded-full mb-3"></div>
          <p class="text-sm font-medium text-slate-300">Fetching events...</p>
        </div>
      } @else if (filteredEvents().length === 0) {
        <div class="py-16 text-center rounded-xl bg-[#16213e] border border-dashed border-slate-700 space-y-3">
          <div class="text-4xl">🔍</div>
          <h3 class="text-white font-bold text-base">No events found</h3>
          <p class="text-xs text-slate-300 max-w-sm mx-auto">
            @if (searchQuery()) {
              No events matched "{{ searchQuery() }}". Try adjusting your search query or clear the filter.
            } @else {
              No events in this category. Click below to schedule a new one.
            }
          </p>
          <a
            routerLink="/events/new"
            class="inline-block px-5 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold shadow-md hover:shadow-indigo-500/25 transition cursor-pointer"
          >
            Create Event
          </a>
        </div>
      } @else {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          @for (event of filteredEvents(); track event.id) {
            <div
              (click)="openDetail(event.id)"
              class="group cursor-pointer rounded-xl bg-[#16213e] border border-slate-700/60 hover:border-[#5865F2] hover:shadow-xl hover:shadow-indigo-500/10 transition duration-150 flex flex-col justify-between overflow-hidden"
            >
              <!-- Colored Accent Bar -->
              <div
                class="h-1.5 w-full"
                [style.background-color]="event.color || '#5865F2'"
              ></div>

              <div class="p-5 space-y-3">
                <!-- Badges Row -->
                <div class="flex items-center justify-between gap-2">
                  <span
                    class="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider"
                    [class.bg-emerald-500/20]="event.status === 'active'"
                    [class.text-emerald-400]="event.status === 'active'"
                    [class.border]="true"
                    [class.border-emerald-500/30]="event.status === 'active'"
                    [class.bg-amber-500/20]="event.status === 'draft'"
                    [class.text-amber-400]="event.status === 'draft'"
                    [class.border-amber-500/30]="event.status === 'draft'"
                    [class.bg-slate-700/60]="event.status === 'archived'"
                    [class.text-slate-400]="event.status === 'archived'"
                    [class.border-slate-600]="event.status === 'archived'"
                  >
                    {{ event.status }}
                  </span>

                  @if (event.isRecurring) {
                    <span class="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-md border border-indigo-500/30">
                      <svg class="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {{ event.frequency || 'Recurring' }}
                    </span>
                  } @else {
                    <span class="text-[11px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
                      One-time
                    </span>
                  }
                </div>

                <!-- Event Title & Desc -->
                <div>
                  <h3 class="text-base font-bold text-white group-hover:text-[#5865F2] transition line-clamp-1">
                    {{ event.title }}
                  </h3>
                  <p class="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {{ event.description || 'No description provided.' }}
                  </p>
                </div>

                <!-- Details Row -->
                <div class="space-y-1.5 pt-2 text-xs text-slate-300">
                  <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-[#5865F2] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span class="font-medium text-white">{{ event.nextOccurrence || event.startsAt }}</span>
                  </div>

                  @if (event.location) {
                    <div class="flex items-center gap-2 text-slate-400">
                      <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span class="truncate">{{ event.location }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- Footer with RSVP badge & Action -->
              <div class="px-5 py-3 bg-[#11192e] border-t border-slate-700/50 flex items-center justify-between">
                <app-rsvp-badge [counts]="event.rsvpsCount" />

                <span class="text-xs text-slate-300 group-hover:text-white flex items-center gap-1 font-semibold transition">
                  Details
                  <svg class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: ``,
})
export class EventListComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly guildStore = inject(GuildStore);

  readonly events = signal<EventItem[]>([]);
  readonly selectedTab = signal<FilterTab>('all');
  readonly searchQuery = signal<string>('');
  readonly isLoading = signal<boolean>(true);

  readonly allCount = computed(() => this.events().length);
  readonly activeCount = computed(() => this.events().filter((e) => e.status === 'active').length);
  readonly draftCount = computed(() => this.events().filter((e) => e.status === 'draft').length);
  readonly archivedCount = computed(() => this.events().filter((e) => e.status === 'archived').length);

  readonly filteredEvents = computed(() => {
    const tab = this.selectedTab();
    const query = this.searchQuery().toLowerCase().trim();

    return this.events().filter((event) => {
      const matchesTab = tab === 'all' || event.status === tab;
      const matchesQuery =
        !query ||
        event.title.toLowerCase().includes(query) ||
        (event.description && event.description.toLowerCase().includes(query)) ||
        (event.location && event.location.toLowerCase().includes(query));

      return matchesTab && matchesQuery;
    });
  });

  constructor() {
    effect(() => {
      const gid = this.guildStore.activeGuildId();
      if (gid) {
        this.loadEvents(gid);
      }
    });
  }

  ngOnInit(): void {
    const gid = this.guildStore.activeGuildId();
    if (gid) {
      this.loadEvents(gid);
    }
  }

  setTab(tab: FilterTab): void {
    this.selectedTab.set(tab);
  }

  openDetail(eventId: string): void {
    this.router.navigate(['/events', eventId]);
  }

  async loadEvents(guildId: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const list = await this.api.getEvents(guildId);
      this.events.set(list || []);
    } catch (err: unknown) {
      console.error('Failed to fetch events from API:', err);
      this.events.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }
}
