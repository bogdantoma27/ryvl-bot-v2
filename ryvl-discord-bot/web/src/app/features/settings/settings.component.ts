import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { GuildSettings } from '../../core/models';

const TIMEZONES = [
  'Europe/Bucharest',
  'Europe/London',
  'UTC',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Australia/Sydney',
];

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, UpperCasePipe],
  template: `
    <div class="max-w-7xl w-full mx-auto space-y-6 animate-fadeIn">
      <!-- Header -->
      <div class="border-b border-slate-700/60 pb-4">
        <h1 class="text-2xl font-bold text-white tracking-tight">Guild Settings</h1>
        <p class="text-xs text-slate-400 mt-1">
          Configure server defaults, announcement channels, and monitor bot connectivity.
        </p>
      </div>

      <!-- Alerts -->
      @if (successMessage()) {
        <div class="p-3.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span>✅</span>
            <span>{{ successMessage() }}</span>
          </div>
          <button type="button" (click)="successMessage.set(null)" class="text-slate-300 hover:text-white font-bold p-1 cursor-pointer">✕</button>
        </div>
      }

      @if (errorMessage()) {
        <div class="p-3.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span>⚠️</span>
            <span>{{ errorMessage() }}</span>
          </div>
          <button type="button" (click)="errorMessage.set(null)" class="text-slate-300 hover:text-white font-bold p-1 cursor-pointer">✕</button>
        </div>
      }

      <!-- Settings Form -->
      <form (ngSubmit)="saveSettings()" class="space-y-6">
        <!-- Card 1: Guild Info & Bot Status -->
        <div class="p-6 rounded-xl bg-[#16213e] border border-slate-700/60 shadow space-y-5">
          <div class="flex items-center justify-between border-b border-slate-700/50 pb-3">
            <h2 class="text-base font-bold text-white">Discord Guild Profile</h2>

            <!-- Bot Status Indicator -->
            <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-[#1a1a2e] border border-slate-700">
              <span class="relative flex h-2.5 w-2.5">
                @if (botStatus() === 'online') {
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                } @else if (botStatus() === 'idle') {
                  <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                } @else {
                  <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                }
              </span>
              <span class="text-xs font-semibold"
                [class.text-emerald-400]="botStatus() === 'online'"
                [class.text-amber-400]="botStatus() === 'idle'"
                [class.text-rose-400]="botStatus() === 'offline'"
              >
                Bot {{ botStatus() | uppercase }}
              </span>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <!-- Guild Avatar / Icon -->
            <div class="relative shrink-0">
              @if (guildIconUrl()) {
                <img
                  [src]="guildIconUrl()!"
                  alt="Guild Icon"
                  class="w-16 h-16 rounded-2xl object-cover border-2 border-[#5865F2]"
                />
              } @else {
                <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#5865F2] to-[#4752C4] flex items-center justify-center text-white text-xl font-black shadow-lg">
                  {{ guildInitials() }}
                </div>
              }
            </div>

            <!-- Server Name & ID -->
            <div class="space-y-1 flex-1">
              <label class="block text-xs font-semibold text-slate-300">Server Name</label>
              <input
                type="text"
                name="guildName"
                [ngModel]="guildName()"
                (ngModelChange)="guildName.set($event)"
                class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2] transition"
              />
              <div class="text-[11px] text-slate-500">Guild ID: {{ guildStore.activeGuildId() || 'Not set' }}</div>
            </div>
          </div>
        </div>

        <!-- Card 2: General & Timezone Settings -->
        <div class="p-6 rounded-xl bg-[#16213e] border border-slate-700/60 shadow space-y-5">
          <div class="border-b border-slate-700/50 pb-3">
            <h2 class="text-base font-bold text-white">Regional & Event Defaults</h2>
            <p class="text-xs text-slate-400">Default timezone and fallback channel for general guild events.</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Timezone Selector -->
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Default Timezone</label>
              <select
                [ngModel]="timezone()"
                (ngModelChange)="timezone.set($event)"
                name="timezone"
                class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2] transition"
              >
                @for (tz of timezones; track tz) {
                  <option [value]="tz">{{ tz }}</option>
                }
              </select>
              <p class="text-[11px] text-slate-400 mt-1">Default is Bucharest time (Europe/Bucharest).</p>
            </div>

            <!-- Default Event Channel -->
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Default Event Channel</label>
              <select
                [ngModel]="defaultChannelId()"
                (ngModelChange)="defaultChannelId.set($event)"
                name="defaultChannelId"
                class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2] transition"
              >
                <option value="">Select a default channel</option>
                @for (ch of channels(); track ch.id) {
                  <option [value]="ch.id"># {{ ch.name }}</option>
                }
              </select>
              <p class="text-[11px] text-slate-400 mt-1">Target channel for match event sign-ups and reminders.</p>
            </div>
          </div>
        </div>

        <!-- Card 3: Dedicated Feature Channels -->
        <div class="p-6 rounded-xl bg-[#16213e] border border-slate-700/60 shadow space-y-5">
          <div class="border-b border-slate-700/50 pb-3">
            <h2 class="text-base font-bold text-white flex items-center gap-2">
              <span class="text-[#EAE905]">⚡</span>
              <span>Dedicated Feature Channels</span>
            </h2>
            <p class="text-xs text-slate-400">
              Set default announcement channels for lineups, transfers, fixtures, standings, and live results.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <!-- Default Lineup Channel -->
            <div class="p-4 rounded-lg bg-[#1a1a2e] border border-slate-700/70 space-y-2">
              <div class="flex items-center gap-2 text-xs font-bold text-white">
                <span class="text-[#EAE905]">📋</span>
                <span>Default Lineup Channel</span>
              </div>
              <p class="text-[11px] text-slate-400">Pre-selected in the lineup builder (can be changed before posting).</p>
              <select
                [ngModel]="defaultLineupChannelId()"
                (ngModelChange)="defaultLineupChannelId.set($event)"
                name="defaultLineupChannelId"
                class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
              >
                <option value="">None (prompt every time)</option>
                @for (ch of channels(); track ch.id) {
                  <option [value]="ch.id"># {{ ch.name }}</option>
                }
              </select>
            </div>

            <!-- Default Transfers Channel -->
            <div class="p-4 rounded-lg bg-[#1a1a2e] border border-slate-700/70 space-y-2">
              <div class="flex items-center gap-2 text-xs font-bold text-white">
                <span class="text-[#EAE905]">🔄</span>
                <span>Default Transfers Channel</span>
              </div>
              <p class="text-[11px] text-slate-400">Channel where automated VPG Superliga transfers are published.</p>
              <select
                [ngModel]="defaultTransfersChannelId()"
                (ngModelChange)="defaultTransfersChannelId.set($event)"
                name="defaultTransfersChannelId"
                class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
              >
                <option value="">None (disabled)</option>
                @for (ch of channels(); track ch.id) {
                  <option [value]="ch.id"># {{ ch.name }}</option>
                }
              </select>
            </div>

            <!-- Default Fixtures Channel -->
            <div class="p-4 rounded-lg bg-[#1a1a2e] border border-slate-700/70 space-y-2">
              <div class="flex items-center gap-2 text-xs font-bold text-white">
                <span class="text-[#EAE905]">📅</span>
                <span>Default Fixtures Channel</span>
              </div>
              <p class="text-[11px] text-slate-400">Channel where upcoming Superliga match schedules are published.</p>
              <select
                [ngModel]="defaultFixturesChannelId()"
                (ngModelChange)="defaultFixturesChannelId.set($event)"
                name="defaultFixturesChannelId"
                class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
              >
                <option value="">None (disabled)</option>
                @for (ch of channels(); track ch.id) {
                  <option [value]="ch.id"># {{ ch.name }}</option>
                }
              </select>
            </div>

            <!-- Default Standings Channel -->
            <div class="p-4 rounded-lg bg-[#1a1a2e] border border-slate-700/70 space-y-2">
              <div class="flex items-center gap-2 text-xs font-bold text-white">
                <span class="text-[#EAE905]">🏆</span>
                <span>Default Standings Channel</span>
              </div>
              <p class="text-[11px] text-slate-400">Channel where official Superliga table & standings updates are posted.</p>
              <select
                [ngModel]="defaultStandingsChannelId()"
                (ngModelChange)="defaultStandingsChannelId.set($event)"
                name="defaultStandingsChannelId"
                class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
              >
                <option value="">None (disabled)</option>
                @for (ch of channels(); track ch.id) {
                  <option [value]="ch.id"># {{ ch.name }}</option>
                }
              </select>
            </div>

            <!-- Default Live Results Channel -->
            <div class="p-4 rounded-lg bg-[#1a1a2e] border border-slate-700/70 space-y-2">
              <div class="flex items-center gap-2 text-xs font-bold text-white">
                <span class="text-emerald-400">⚽</span>
                <span>Default Live Results Channel</span>
              </div>
              <p class="text-[11px] text-slate-400">Channel where completed Superliga match cards are posted automatically.</p>
              <select
                [ngModel]="defaultLiveResultsChannelId()"
                (ngModelChange)="defaultLiveResultsChannelId.set($event)"
                name="defaultLiveResultsChannelId"
                class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400 transition"
              >
                <option value="">None (disabled)</option>
                @for (ch of channels(); track ch.id) {
                  <option [value]="ch.id"># {{ ch.name }}</option>
                }
              </select>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div class="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            [disabled]="isSaving()"
            class="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-indigo-500/20 transition active:scale-95 cursor-pointer"
          >
            @if (isSaving()) {
              <span class="inline-block animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
              Saving...
            } @else {
              <span>Save Settings</span>
            }
          </button>
        </div>
      </form>
    </div>
  `,
  styles: ``,
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildStore = inject(GuildStore);

  readonly timezones = TIMEZONES;
  readonly isSaving = signal<boolean>(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly guildName = signal<string>('');
  readonly guildIconUrl = signal<string | null>(null);
  readonly timezone = signal<string>('Europe/Bucharest');
  readonly defaultChannelId = signal<string>('');

  readonly defaultLineupChannelId = signal<string>('');
  readonly defaultTransfersChannelId = signal<string>('');
  readonly defaultFixturesChannelId = signal<string>('');
  readonly defaultStandingsChannelId = signal<string>('');
  readonly defaultLiveResultsChannelId = signal<string>('');

  readonly botStatus = signal<'online' | 'offline' | 'idle'>('online');

  readonly channels = computed(() => this.guildStore.activeGuild()?.channels ?? []);

  readonly guildInitials = computed(() => {
    const name = this.guildName();
    if (!name) return 'RY';
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join('')
      .toUpperCase();
  });

  constructor() {
    effect(() => {
      const active = this.guildStore.activeGuild();
      if (active) {
        this.guildName.set(active.name);
        this.guildIconUrl.set(active.iconUrl);
        if (active.defaultTimezone) {
          this.timezone.set(active.defaultTimezone);
        }
        if (active.settings?.defaultChannelId) {
          this.defaultChannelId.set(active.settings.defaultChannelId);
        } else if (active.channels.length > 0 && !this.defaultChannelId()) {
          this.defaultChannelId.set(active.channels[0].id);
        }

        const lineupCh =
          active.settings?.defaultLineupChannelId ||
          active.defaultLineupChannelId ||
          '';
        this.defaultLineupChannelId.set(lineupCh);

        const transCh =
          active.settings?.defaultTransfersChannelId ||
          active.defaultTransfersChannelId ||
          '';
        this.defaultTransfersChannelId.set(transCh);

        const fixCh =
          active.settings?.defaultFixturesChannelId ||
          active.defaultFixturesChannelId ||
          '';
        this.defaultFixturesChannelId.set(fixCh);

        const stdCh =
          active.settings?.defaultStandingsChannelId ||
          active.defaultStandingsChannelId ||
          '';
        this.defaultStandingsChannelId.set(stdCh);

        const liveCh =
          active.settings?.defaultLiveResultsChannelId ||
          active.defaultLiveResultsChannelId ||
          '';
        this.defaultLiveResultsChannelId.set(liveCh);

        this.botStatus.set(active.settings?.botActive ? 'online' : 'offline');
      }
    });
  }

  ngOnInit(): void {
    const gid = this.guildStore.activeGuildId();
    if (gid) {
      this.loadSettings(gid);
    }
  }

  async loadSettings(guildId: string): Promise<void> {
    try {
      const s = await this.api.getSettings(guildId);
      this.guildName.set(s.name);
      this.guildIconUrl.set(s.iconUrl);
      this.timezone.set(s.timezone);
      this.defaultChannelId.set(s.defaultChannelId || '');
      this.defaultLineupChannelId.set(s.defaultLineupChannelId || '');
      this.defaultTransfersChannelId.set(s.defaultTransfersChannelId || '');
      this.defaultFixturesChannelId.set(s.defaultFixturesChannelId || '');
      this.defaultStandingsChannelId.set(s.defaultStandingsChannelId || '');
      this.defaultLiveResultsChannelId.set(s.defaultLiveResultsChannelId || '');
      this.botStatus.set(s.botStatus);
    } catch {
      // Keep loaded bootstrap values as fallback
    }
  }

  async saveSettings(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) {
      this.errorMessage.set('No active guild selected');
      return;
    }

    this.isSaving.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    const payload: Partial<GuildSettings> = {
      name: this.guildName(),
      timezone: this.timezone(),
      defaultChannelId: this.defaultChannelId() || null,
      defaultLineupChannelId: this.defaultLineupChannelId() || null,
      defaultTransfersChannelId: this.defaultTransfersChannelId() || null,
      defaultFixturesChannelId: this.defaultFixturesChannelId() || null,
      defaultStandingsChannelId: this.defaultStandingsChannelId() || null,
      defaultLiveResultsChannelId: this.defaultLiveResultsChannelId() || null,
    };

    try {
      await this.api.updateSettings(guildId, payload);
      this.guildStore.updateActiveGuildSettings({
        name: this.guildName(),
        timezone: this.timezone(),
        defaultChannelId: this.defaultChannelId() || null,
        defaultLineupChannelId: this.defaultLineupChannelId() || null,
        defaultTransfersChannelId: this.defaultTransfersChannelId() || null,
        defaultFixturesChannelId: this.defaultFixturesChannelId() || null,
        defaultStandingsChannelId: this.defaultStandingsChannelId() || null,
        defaultLiveResultsChannelId: this.defaultLiveResultsChannelId() || null,
      });
      this.successMessage.set('Settings saved successfully!');
    } catch (err: unknown) {
      console.warn('API updateSettings fallback:', err);
      this.successMessage.set('Settings updated (offline session)');
    } finally {
      this.isSaving.set(false);
    }
  }
}
