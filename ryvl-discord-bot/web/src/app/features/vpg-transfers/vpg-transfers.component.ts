import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';

interface VpgTransfer {
  id: number;
  username: string;
  fromName: string;
  fromSlug?: string | null;
  fromLogoUrl?: string | null;
  toName: string;
  toSlug?: string | null;
  toLogoUrl?: string | null;
  amount: number;
  amountFormatted: string;
  datetime: string;
  dateFormattedRo: string;
  superligaClubs: string[];
}

@Component({
  selector: 'app-vpg-transfers',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6 pb-12">
      <!-- Toast Notification -->
      @if (toast()) {
        <div
          class="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium transition-all transform animate-bounce"
          [ngClass]="toast()!.type === 'error' ? 'bg-rose-900 border border-rose-600 text-rose-100' : 'bg-emerald-900 border border-emerald-600 text-emerald-100'"
        >
          <span>{{ toast()!.text }}</span>
          <button (click)="toast.set(null)" class="text-xs opacity-75 hover:opacity-100 font-bold ml-2">✕</button>
        </div>
      }

      <!-- Page Header & VPG Banner -->
      <div class="bg-gradient-to-r from-[#16213e] via-[#142938] to-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div class="absolute -right-10 -bottom-10 w-64 h-64 bg-[#1f8b4c]/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div class="flex items-center gap-5">
            <!-- League Crest / Badge -->
            <div class="w-20 h-20 rounded-2xl bg-[#0f172a] border-2 border-emerald-500/40 p-3 flex items-center justify-center shrink-0 shadow-lg">
              <span class="text-3xl">⚽</span>
            </div>

            <div>
              <div class="flex items-center gap-3 flex-wrap">
                <h1 class="text-2xl font-black text-white tracking-tight">
                  VPG Superliga România
                </h1>
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  VPGRoPS5
                </span>
                @if (config()?.enabled) {
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-900/60 text-emerald-300 border border-emerald-600 flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Transfer Poller Active
                  </span>
                } @else {
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                    Poller Inactive
                  </span>
                }
              </div>

              <p class="text-xs text-slate-400 mt-1.5 flex items-center gap-2 flex-wrap">
                <span>Real-time transfer updates, contracts, and player movements in VPG Romania Superliga.</span>
                @if (channelName()) {
                  <span class="text-slate-500">•</span>
                  <span class="text-emerald-400 font-medium">Auto-posting to #{{ channelName() }}</span>
                }
              </p>
            </div>
          </div>

          <!-- Quick Actions & Status -->
          <div class="flex items-center gap-3 self-end md:self-center">
            @if (isAdmin()) {
              <button
                type="button"
                (click)="onPollNow()"
                [disabled]="isPollingAction()"
                class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1f8b4c] hover:bg-[#18723e] text-white text-xs font-semibold shadow-md shadow-emerald-900/30 transition disabled:opacity-50 cursor-pointer"
              >
                <svg class="w-3.5 h-3.5 shrink-0" [class.animate-spin]="isPollingAction()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{{ isPollingAction() ? 'Checking...' : 'Check Transfers Now' }}</span>
              </button>
            }

            <button
              type="button"
              (click)="loadData()"
              [disabled]="isLoading()"
              class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
              title="Refresh transfer list"
            >
              <svg class="w-3.5 h-3.5" [class.animate-spin]="isLoading()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Navigation Tabs (Only for Admins) -->
      @if (isAdmin()) {
        <div class="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            (click)="activeTab.set('transfers')"
            class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
            [ngClass]="activeTab() === 'transfers' ? 'bg-[#1f8b4c] text-white shadow-md shadow-emerald-900/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span>Transfers Feed</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] bg-black/30 text-white font-mono">
              {{ filteredTransfers().length }}
            </span>
          </button>

          <button
            type="button"
            (click)="activeTab.set('settings')"
            class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
            [ngClass]="activeTab() === 'settings' ? 'bg-[#1f8b4c] text-white shadow-md shadow-emerald-900/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Tracker Settings & Channel</span>
          </button>
        </div>
      }

      <!-- TAB 1: TRANSFERS FEED -->
      @if (activeTab() === 'transfers' || !isAdmin()) {
        <!-- Search and Filter Bar -->
        <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <!-- Search Input -->
          <div class="relative flex-1">
            <svg class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              [(ngModel)]="searchQuery"
              placeholder="Search player, team, or club..."
              class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl pl-10 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
            @if (searchQuery()) {
              <button
                (click)="searchQuery.set('')"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            }
          </div>

          <!-- Filter Pills -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              (click)="filterType.set('all')"
              class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap"
              [ngClass]="filterType() === 'all' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-800/80 text-slate-400 hover:text-white'"
            >
              All ({{ transfers().length }})
            </button>
            <button
              type="button"
              (click)="filterType.set('signings')"
              class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap"
              [ngClass]="filterType() === 'signings' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-800/80 text-slate-400 hover:text-white'"
            >
              Free Agent Signings
            </button>
            <button
              type="button"
              (click)="filterType.set('club_to_club')"
              class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap"
              [ngClass]="filterType() === 'club_to_club' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-800/80 text-slate-400 hover:text-white'"
            >
              Club to Club
            </button>
            <button
              type="button"
              (click)="filterType.set('departures')"
              class="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap"
              [ngClass]="filterType() === 'departures' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-800/80 text-slate-400 hover:text-white'"
            >
              Released
            </button>
          </div>
        </div>

        <!-- Transfer Cards Grid -->
        @if (isLoading()) {
          <div class="py-16 text-center text-slate-400 space-y-3">
            <div class="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p class="text-xs">Fetching latest VPG Superliga transfers...</p>
          </div>
        } @else if (filteredTransfers().length === 0) {
          <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3">
            <div class="text-4xl">🔍</div>
            <h3 class="text-base font-bold text-white">No transfers found</h3>
            <p class="text-xs max-w-sm mx-auto text-slate-400">
              No transfers match your current filter or search criteria.
            </p>
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            @for (t of filteredTransfers(); track t.id) {
              <div class="bg-[#16213e] border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 shadow-lg transition-all duration-200 hover:-translate-y-0.5 space-y-4">
                <!-- Card Header: HERE WE GO & Fee Badge -->
                <div class="flex items-center justify-between gap-3">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <span>⚽</span>
                    <span>HERE WE GO</span>
                  </span>

                  <span
                    class="px-2.5 py-0.5 rounded-lg text-xs font-bold"
                    [ngClass]="t.amount > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-emerald-300 border border-slate-700'"
                  >
                    {{ t.amountFormatted }}
                  </span>
                </div>

                <!-- Player Title -->
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-white text-sm font-black shrink-0">
                    👤
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-base font-bold text-white truncate">{{ t.username }}</div>
                    <div class="text-[11px] text-slate-400">Transfer #{{ t.id }}</div>
                  </div>
                </div>

                <!-- Movement Transition Visualizer -->
                <div class="bg-[#11192e] rounded-xl p-3 border border-slate-800/80 grid grid-cols-5 items-center gap-2">
                  <!-- FROM -->
                  <div class="col-span-2 flex items-center gap-2.5 min-w-0">
                    @if (t.fromLogoUrl) {
                      <img [src]="t.fromLogoUrl" [alt]="t.fromName" class="w-8 h-8 rounded-lg object-contain bg-slate-900/80 p-0.5 border border-slate-700 shrink-0" />
                    } @else {
                      <div class="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-400 shrink-0">
                        FA
                      </div>
                    }
                    <div class="min-w-0">
                      <div class="text-[9px] uppercase tracking-wider text-slate-500 font-bold">From</div>
                      <div class="text-xs font-semibold text-slate-200 truncate" [title]="t.fromName">{{ t.fromName }}</div>
                    </div>
                  </div>

                  <!-- ARROW -->
                  <div class="col-span-1 flex items-center justify-center">
                    <div class="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xs font-bold">
                      →
                    </div>
                  </div>

                  <!-- TO -->
                  <div class="col-span-2 flex items-center gap-2.5 min-w-0">
                    @if (t.toLogoUrl) {
                      <img [src]="t.toLogoUrl" [alt]="t.toName" class="w-8 h-8 rounded-lg object-contain bg-slate-900/80 p-0.5 border border-slate-700 shrink-0" />
                    } @else {
                      <div class="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-400 shrink-0">
                        FA
                      </div>
                    }
                    <div class="min-w-0">
                      <div class="text-[9px] uppercase tracking-wider text-slate-500 font-bold">To</div>
                      <div class="text-xs font-semibold text-emerald-300 truncate" [title]="t.toName">{{ t.toName }}</div>
                    </div>
                  </div>
                </div>

                <!-- Career Timeline if Available -->
                @if (t.superligaClubs && t.superligaClubs.length > 0) {
                  <div class="text-[11px] text-slate-400 bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-800 flex items-center gap-2 flex-wrap">
                    <span class="text-amber-400 font-semibold shrink-0">🏆 Superliga:</span>
                    <span class="text-slate-300 font-medium">{{ t.superligaClubs.join(' → ') }}</span>
                  </div>
                }

                <!-- Footer: Date in Bucharest Time -->
                <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
                  <span class="flex items-center gap-1.5">
                    <span>📅</span>
                    <span>{{ t.dateFormattedRo }}</span>
                  </span>
                  <span class="font-mono text-[10px]">VPG Superliga</span>
                </div>
              </div>
            }
          </div>
        }
      }

      <!-- TAB 2: TRACKER SETTINGS & CHANNEL (ADMIN ONLY) -->
      @if (activeTab() === 'settings' && isAdmin()) {
        <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 max-w-3xl">
          <div class="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 class="text-lg font-bold text-white tracking-tight">VPG Superliga Tracker Settings</h2>
              <p class="text-xs text-slate-400 mt-0.5">Configure the Discord channel for automatic Superliga transfer announcements.</p>
            </div>
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
              Admin Control
            </span>
          </div>

          <div class="space-y-5">
            <!-- Channel Picker -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Discord Announcement Channel
              </label>
              <select
                [(ngModel)]="selectedChannelId"
                class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition cursor-pointer"
              >
                <option value="">-- Select a text channel --</option>
                @for (ch of availableChannels(); track ch.id) {
                  <option [value]="ch.id">#{{ ch.name }}</option>
                }
              </select>
              <p class="text-[11px] text-slate-500">
                New transfer cards with "⚽ HERE WE GO", fees, dates, and club badges will be posted here.
              </p>
            </div>

            <!-- Auto-Posting Toggle -->
            <div class="flex items-center justify-between p-4 bg-[#11192e] rounded-xl border border-slate-800">
              <div>
                <div class="text-xs font-bold text-white">Enable Automated Posting</div>
                <div class="text-[11px] text-slate-400">Regularly check VPG API and announce new transfers in Discord.</div>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  [(ngModel)]="isAutoPostingEnabled"
                  class="sr-only peer"
                />
                <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <!-- Polling Interval -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Poll Interval
              </label>
              <select
                [(ngModel)]="pollIntervalSec"
                class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition cursor-pointer"
              >
                <option [value]="60">Every 1 minute (60 seconds)</option>
                <option [value]="120">Every 2 minutes (120 seconds - Recommended)</option>
                <option [value]="300">Every 5 minutes (300 seconds)</option>
                <option [value]="600">Every 10 minutes (600 seconds)</option>
              </select>
            </div>

            <!-- Action Buttons -->
            <div class="pt-4 border-t border-slate-800 flex flex-wrap items-center gap-3">
              <button
                type="button"
                (click)="onSaveSettings()"
                [disabled]="isSaving()"
                class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-900/30 transition disabled:opacity-50 cursor-pointer"
              >
                {{ isSaving() ? 'Saving...' : 'Save Settings' }}
              </button>

              <button
                type="button"
                (click)="onPostLatestToDiscord()"
                [disabled]="isPostingLatest() || !selectedChannelId"
                class="px-4 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold text-xs shadow-md shadow-indigo-900/30 transition disabled:opacity-50 cursor-pointer"
              >
                {{ isPostingLatest() ? 'Posting...' : 'Post Latest Transfer to Discord' }}
              </button>
            </div>

            <!-- Telemetry & Status Card -->
            <div class="bg-slate-900/60 rounded-xl p-4 border border-slate-800/80 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-500 block">Community</span>
                <span class="font-mono text-slate-300">VPGRoPS5</span>
              </div>
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-500 block">Last Polled</span>
                <span class="text-slate-300">{{ config()?.lastPolledAt ? (config()!.lastPolledAt | date:'medium') : 'Never' }}</span>
              </div>
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-500 block">Last Transfer ID</span>
                <span class="font-mono text-emerald-400">#{{ config()?.lastTransferId || 'N/A' }}</span>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class VpgTransfersComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildStore = inject(GuildStore);
  private readonly route = inject(ActivatedRoute);

  readonly transfers = signal<VpgTransfer[]>([]);
  readonly config = signal<any>(null);
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly isPollingAction = signal<boolean>(false);
  readonly isPostingLatest = signal<boolean>(false);
  readonly activeTab = signal<'transfers' | 'settings'>('transfers');

  readonly searchQuery = signal<string>('');
  readonly filterType = signal<'all' | 'signings' | 'club_to_club' | 'departures'>('all');
  readonly toast = signal<{ text: string; type: 'success' | 'error' } | null>(null);

  // Settings form model
  selectedChannelId = '';
  isAutoPostingEnabled = true;
  pollIntervalSec = 120;

  readonly isAdmin = computed(() => Boolean(this.api.getSessionToken()));

  readonly availableChannels = computed(() => {
    return this.guildStore.activeGuild()?.channels || [];
  });

  readonly channelName = computed(() => {
    const chId = this.config()?.channelId;
    if (!chId) return null;
    const found = this.availableChannels().find((c: any) => c.id === chId);
    return found ? found.name : chId;
  });

  readonly filteredTransfers = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const filter = this.filterType();

    return this.transfers().filter((t) => {
      // Search matching
      const matchesSearch =
        !q ||
        t.username.toLowerCase().includes(q) ||
        t.fromName.toLowerCase().includes(q) ||
        t.toName.toLowerCase().includes(q) ||
        (t.superligaClubs && t.superligaClubs.some((c) => c.toLowerCase().includes(q)));

      if (!matchesSearch) return false;

      // Filter matching
      if (filter === 'signings') {
        return t.fromName.toLowerCase() === 'free agent';
      }
      if (filter === 'departures') {
        return t.toName.toLowerCase() === 'free agent';
      }
      if (filter === 'club_to_club') {
        return t.fromName.toLowerCase() !== 'free agent' && t.toName.toLowerCase() !== 'free agent';
      }
      return true;
    });
  });

  async ngOnInit(): Promise<void> {
    const queryGuildId = this.route.snapshot.queryParamMap.get('guildId');
    if (queryGuildId && queryGuildId !== this.guildStore.activeGuildId()) {
      this.guildStore.setActiveGuild(queryGuildId);
    }

    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading.set(true);
    const activeGuildId = this.guildStore.activeGuildId();

    try {
      const [configRes, transfersRes] = await Promise.all([
        this.api.getVpgConfig(activeGuildId),
        this.api.getVpgTransfers(activeGuildId, 30),
      ]);

      if (configRes && configRes.config) {
        this.config.set(configRes.config);
        this.selectedChannelId = configRes.config.channelId || '';
        this.isAutoPostingEnabled = configRes.config.enabled ?? true;
        this.pollIntervalSec = configRes.config.pollIntervalSec || 120;
      }

      if (transfersRes && Array.isArray(transfersRes.transfers)) {
        this.transfers.set(transfersRes.transfers);
      }
    } catch (err: any) {
      this.showToast(`Failed to load VPG transfers: ${err.message}`, 'error');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onSaveSettings(): Promise<void> {
    const activeGuildId = this.guildStore.activeGuildId();
    if (!activeGuildId || activeGuildId === 'default') {
      this.showToast('Please select a Discord server to save settings.', 'error');
      return;
    }

    this.isSaving.set(true);
    try {
      const res = await this.api.updateVpgConfig(activeGuildId, {
        channelId: this.selectedChannelId || null,
        enabled: this.isAutoPostingEnabled,
        pollIntervalSec: Number(this.pollIntervalSec),
      });

      if (res && res.config) {
        this.config.set(res.config);
      }
      this.showToast('VPG Superliga tracker settings saved successfully!', 'success');
    } catch (err: any) {
      this.showToast(`Error saving settings: ${err.message}`, 'error');
    } finally {
      this.isSaving.set(false);
    }
  }

  async onPollNow(): Promise<void> {
    const activeGuildId = this.guildStore.activeGuildId();
    if (!activeGuildId || activeGuildId === 'default') {
      this.showToast('Select a Discord server first.', 'error');
      return;
    }

    this.isPollingAction.set(true);
    try {
      const res = await this.api.pollVpgTransfersNow(activeGuildId);
      if (res.postedCount > 0) {
        this.showToast(`Found and posted ${res.postedCount} new transfer(s) to Discord!`, 'success');
      } else {
        this.showToast('Checked VPG transfers. No new transfers found since last check.', 'success');
      }
      await this.loadData();
    } catch (err: any) {
      this.showToast(`Failed checking transfers: ${err.message}`, 'error');
    } finally {
      this.isPollingAction.set(false);
    }
  }

  async onPostLatestToDiscord(): Promise<void> {
    const activeGuildId = this.guildStore.activeGuildId();
    if (!activeGuildId || activeGuildId === 'default') {
      this.showToast('Select a Discord server first.', 'error');
      return;
    }

    this.isPostingLatest.set(true);
    try {
      await this.api.postVpgTransferLatest(activeGuildId);
      this.showToast('Posted latest transfer card to Discord channel!', 'success');
      await this.loadData();
    } catch (err: any) {
      this.showToast(`Error posting to Discord: ${err.message}`, 'error');
    } finally {
      this.isPostingLatest.set(false);
    }
  }

  private showToast(text: string, type: 'success' | 'error'): void {
    this.toast.set({ text, type });
    setTimeout(() => {
      if (this.toast()?.text === text) {
        this.toast.set(null);
      }
    }, 4500);
  }
}
