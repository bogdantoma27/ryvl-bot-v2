import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { EventItem } from '../../core/models';
import { RsvpBadgeComponent } from '../../shared/components/rsvp-badge.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RsvpBadgeComponent],
  template: `
    <div class="max-w-7xl w-full mx-auto space-y-8 animate-fadeIn">
      <!-- Welcome Header -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-xl bg-gradient-to-r from-[#16213e] to-[#0f3460] border border-slate-700/50 shadow-lg">
        <div>
          <div class="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#5865F2]/20 text-[#5865F2] border border-[#5865F2]/30 mb-2">
            <span>🛡️</span> Server Hub
          </div>
          <h1 class="text-2xl md:text-3xl font-bold text-white tracking-tight">
            Welcome to {{ guildName() }}
          </h1>
          <p class="text-slate-400 text-sm mt-1">
            Manage your community events, track member RSVPs, and coordinate game days.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <a
            routerLink="/admin/events/new"
            class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold shadow-md hover:shadow-indigo-500/25 transition duration-150 active:scale-95 cursor-pointer"
          >
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <span class="text-white">Create Event</span>
          </a>
          <a
            routerLink="/admin/events"
            class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-600 hover:border-slate-500 text-white text-sm font-semibold transition active:scale-95 cursor-pointer"
          >
            <svg class="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span class="text-white">View Events</span>
          </a>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <!-- Total Events -->
        <div class="p-5 rounded-xl bg-[#16213e] border border-slate-700/60 shadow hover:border-slate-600 transition">
          <div class="flex items-center justify-between">
            <span class="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Events</span>
            <div class="w-9 h-9 rounded-lg bg-indigo-500/15 text-[#5865F2] flex items-center justify-center">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <div class="mt-4 flex items-baseline gap-2">
            <span class="text-3xl font-extrabold text-white tracking-tight">{{ totalEvents() }}</span>
            <span class="text-xs text-slate-400">managed</span>
          </div>
        </div>

        <!-- Upcoming Events -->
        <div class="p-5 rounded-xl bg-[#16213e] border border-slate-700/60 shadow hover:border-slate-600 transition">
          <div class="flex items-center justify-between">
            <span class="text-slate-400 text-xs font-semibold uppercase tracking-wider">Upcoming Events</span>
            <div class="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div class="mt-4 flex items-baseline gap-2">
            <span class="text-3xl font-extrabold text-emerald-400 tracking-tight">{{ upcomingEvents() }}</span>
            <span class="text-xs text-slate-400">scheduled</span>
          </div>
        </div>

        <!-- Total RSVPs -->
        <div class="p-5 rounded-xl bg-[#16213e] border border-slate-700/60 shadow hover:border-slate-600 transition">
          <div class="flex items-center justify-between">
            <span class="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total RSVPs</span>
            <div class="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div class="mt-4 flex items-baseline gap-2">
            <span class="text-3xl font-extrabold text-amber-300 tracking-tight">{{ totalRsvps() }}</span>
            <span class="text-xs text-slate-400">responses</span>
          </div>
        </div>
      </div>

      <!-- Quick Highlights / Recent Activity -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-white">Upcoming Highlights</h2>
          <a routerLink="/admin/events" class="text-xs text-indigo-400 hover:text-indigo-300 font-semibold hover:underline cursor-pointer">
            View all →
          </a>
        </div>

        @if (isLoading()) {
          <div class="p-8 rounded-xl bg-[#16213e] border border-slate-800 text-center text-slate-400">
            <div class="inline-block animate-spin w-6 h-6 border-2 border-[#5865F2] border-t-transparent rounded-full mb-2"></div>
            <p class="text-sm font-medium text-slate-300">Loading guild events...</p>
          </div>
        } @else if (recentEvents().length === 0) {
          <div class="p-8 rounded-xl bg-[#16213e] border border-dashed border-slate-700 text-center space-y-3">
            <div class="text-3xl">📅</div>
            <h3 class="text-white font-bold text-base">No events scheduled yet</h3>
            <p class="text-xs text-slate-300 max-w-sm mx-auto">
              Get started by creating your first community scrim, match, or practice session.
            </p>
            <a
              routerLink="/admin/events/new"
              class="inline-block px-5 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold shadow-md hover:shadow-indigo-500/25 transition cursor-pointer"
            >
              Create New Event
            </a>
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            @for (event of recentEvents(); track event.id) {
              <a
                [routerLink]="['/admin/events', event.id]"
                class="group p-4 rounded-xl bg-[#16213e] border border-slate-700/60 hover:border-[#5865F2]/50 hover:bg-[#1b264a] transition flex flex-col justify-between"
              >
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span
                      class="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider"
                      [class.bg-emerald-500/20]="event.status === 'active'"
                      [class.text-emerald-400]="event.status === 'active'"
                      [class.bg-amber-500/20]="event.status === 'draft'"
                      [class.text-amber-400]="event.status === 'draft'"
                      [class.bg-slate-700]="event.status === 'archived'"
                      [class.text-slate-400]="event.status === 'archived'"
                    >
                      {{ event.status }}
                    </span>
                    @if (event.isRecurring) {
                      <span class="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                        🔄 {{ event.frequency || 'Recurring' }}
                      </span>
                    }
                  </div>

                  <h3 class="text-base font-semibold text-white group-hover:text-[#5865F2] transition line-clamp-1">
                    {{ event.title }}
                  </h3>
                  <p class="text-xs text-slate-400 line-clamp-2">
                    {{ event.description || 'No description provided.' }}
                  </p>
                </div>

                <div class="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                  <div class="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{{ event.nextOccurrence || event.startsAt }}</span>
                  </div>

                  <app-rsvp-badge [counts]="event.rsvpsCount" />
                </div>
              </a>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: ``,
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildStore = inject(GuildStore);

  readonly isLoading = signal<boolean>(true);
  readonly totalEvents = signal<number>(0);
  readonly upcomingEvents = signal<number>(0);
  readonly totalRsvps = signal<number>(0);
  readonly recentEvents = signal<EventItem[]>([]);

  readonly guildName = computed(() => this.guildStore.activeGuild()?.name || 'Discord Community');

  constructor() {
    effect(() => {
      const gid = this.guildStore.activeGuildId();
      if (gid) {
        this.loadDashboardData(gid);
      }
    });
  }

  ngOnInit(): void {
    const gid = this.guildStore.activeGuildId();
    if (gid) {
      this.loadDashboardData(gid);
    } else {
      this.guildStore.loadGuilds();
    }
  }

  async loadDashboardData(guildId: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const events = await this.api.getEvents(guildId);
      this.populateStats(events || []);
    } catch (err: unknown) {
      console.error('Could not load events from API:', err);
      this.populateStats([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  private populateStats(events: EventItem[]): void {
    this.totalEvents.set(events.length);

    const upcoming = events.filter((e) => e.status === 'active');
    this.upcomingEvents.set(upcoming.length);

    let rsvpsCount = 0;
    for (const e of events) {
      rsvpsCount +=
        (e.rsvpsCount?.accepted ?? 0) +
        (e.rsvpsCount?.tentative ?? 0) +
        (e.rsvpsCount?.declined ?? 0);
    }
    this.totalRsvps.set(rsvpsCount);
    this.recentEvents.set(events.slice(0, 6));
  }
}
