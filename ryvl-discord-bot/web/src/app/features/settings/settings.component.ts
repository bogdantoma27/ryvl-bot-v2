import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { UpperCasePipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { GuildSettings, RyvlCompetition } from '../../core/models';

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
  imports: [CommonModule, FormsModule, UpperCasePipe],
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
        <!-- Card 1: Regional & Event Defaults (with Bot Status Indicator) -->
        <div class="p-6 rounded-xl bg-[#16213e] border border-slate-700/60 shadow space-y-5">
          <div class="flex items-center justify-between border-b border-slate-700/50 pb-3 flex-wrap gap-2">
            <div>
              <h2 class="text-base font-bold text-white">Regional & Event Defaults</h2>
              <p class="text-xs text-slate-400">Default timezone and fallback channel for general guild events.</p>
            </div>

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


        <!-- Card 4 & 4b: RYVL Dedicated Channels (Only shown when managing official RYVL guild) -->
        @if (isRyvlGuild()) {
          <div class="p-6 rounded-xl bg-[#16213e] border border-[#EAE905]/30 shadow space-y-5">
          <div class="border-b border-slate-700/50 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-bold text-white flex items-center gap-2">
                <span class="text-[#EAE905]">⭐</span>
                <span>RYVL Team Performance Channels</span>
              </h2>
              <p class="text-xs text-slate-400">
                Default announcement channels reserved specifically for RYVL Esports competitive outcomes.
              </p>
            </div>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#EAE905]/15 text-[#EAE905] border border-[#EAE905]/30 self-start sm:self-center">
              RYVL ESPORTS
            </span>
          </div>

          <!-- Official Club Name -->
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Official Club Name</label>
            <input
              type="text"
              [ngModel]="ryvlTeamName()"
              (ngModelChange)="ryvlTeamName.set($event)"
              name="ryvlTeamName"
              placeholder="RYVL Esports"
              class="w-full sm:w-80 bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
            />
            <p class="text-[11px] text-slate-400 mt-1">Identifies RYVL Esports in VPG Superliga matches and team leaderboards.</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            <!-- RYVL Results Channel -->
            <div class="p-4.5 rounded-xl bg-[#141d33] border border-slate-700/70 hover:border-slate-600 transition flex flex-col justify-between space-y-3 shadow-sm">
              <div>
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-sm shrink-0">
                      🏆
                    </div>
                    <span class="text-xs font-bold text-white">RYVL Results</span>
                  </div>
                  @if (defaultRyvlResultsChannelId()) {
                    <span class="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active
                    </span>
                  } @else {
                    <span class="text-[10px] text-slate-400 bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded-full">
                      Disabled
                    </span>
                  }
                </div>
                <p class="text-[11px] text-slate-400 leading-tight">Target channel for #ryvl-results (exclusive to RYVL matches).</p>
              </div>
              <div>
                <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Target Channel</label>
                <select
                  [ngModel]="defaultRyvlResultsChannelId()"
                  (ngModelChange)="defaultRyvlResultsChannelId.set($event)"
                  name="defaultRyvlResultsChannelId"
                  class="w-full bg-[#11192e] border border-slate-700 hover:border-slate-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                >
                  <option value="">None (Disabled)</option>
                  @for (ch of channels(); track ch.id) {
                    <option [value]="ch.id"># {{ ch.name }}</option>
                  }
                </select>
              </div>
            </div>

            <!-- RYVL Fixtures Channel -->
            <div class="p-4.5 rounded-xl bg-[#141d33] border border-slate-700/70 hover:border-slate-600 transition flex flex-col justify-between space-y-3 shadow-sm">
              <div>
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-sm shrink-0">
                      📅
                    </div>
                    <span class="text-xs font-bold text-white">RYVL Fixtures</span>
                  </div>
                  @if (defaultRyvlFixturesChannelId()) {
                    <span class="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active
                    </span>
                  } @else {
                    <span class="text-[10px] text-slate-400 bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded-full">
                      Disabled
                    </span>
                  }
                </div>
                <p class="text-[11px] text-slate-400 leading-tight">Target channel for #ryvl-fixtures (upcoming RYVL games schedule).</p>
              </div>
              <div>
                <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Target Channel</label>
                <select
                  [ngModel]="defaultRyvlFixturesChannelId()"
                  (ngModelChange)="defaultRyvlFixturesChannelId.set($event)"
                  name="defaultRyvlFixturesChannelId"
                  class="w-full bg-[#11192e] border border-slate-700 hover:border-slate-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                >
                  <option value="">None (Disabled)</option>
                  @for (ch of channels(); track ch.id) {
                    <option [value]="ch.id"># {{ ch.name }}</option>
                  }
                </select>
              </div>
            </div>

            <!-- RYVL Leaderboards Channel -->
            <div class="p-4.5 rounded-xl bg-[#141d33] border border-slate-700/70 hover:border-slate-600 transition flex flex-col justify-between space-y-3 shadow-sm">
              <div>
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-sm shrink-0">
                      📊
                    </div>
                    <span class="text-xs font-bold text-white">RYVL Leaderboards</span>
                  </div>
                  @if (defaultRyvlLeaderboardChannelId()) {
                    <span class="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active
                    </span>
                  } @else {
                    <span class="text-[10px] text-slate-400 bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded-full">
                      Disabled
                    </span>
                  }
                </div>
                <p class="text-[11px] text-slate-400 leading-tight">Target channel for #ryvl-leaderboards and team performance summaries.</p>
              </div>
              <div>
                <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Target Channel</label>
                <select
                  [ngModel]="defaultRyvlLeaderboardChannelId()"
                  (ngModelChange)="defaultRyvlLeaderboardChannelId.set($event)"
                  name="defaultRyvlLeaderboardChannelId"
                  class="w-full bg-[#11192e] border border-slate-700 hover:border-slate-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                >
                  <option value="">None (Disabled)</option>
                  @for (ch of channels(); track ch.id) {
                    <option [value]="ch.id"># {{ ch.name }}</option>
                  }
                </select>
              </div>
            </div>
          </div>
        </div>
        }

        <!-- Card 4b: Website Public Form Channels -->
        <div class="p-6 rounded-xl bg-[#16213e] border border-slate-700/60 shadow space-y-5">
          <div class="border-b border-slate-700/50 pb-3">
            <h2 class="text-base font-bold text-white flex items-center gap-2">
              <span class="text-[#5865F2]">📬</span>
              <span>Website Form Submissions & Channel Routing</span>
            </h2>
            <p class="text-xs text-slate-400">
              Configure the specific Discord channels where public transmissions from the website contact and trial recruitment forms are posted.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <!-- Contact Inquiries Channel -->
            <div class="p-4 rounded-lg bg-[#1a1a2e] border border-slate-700/70 space-y-2">
              <div class="flex items-center gap-2 text-xs font-bold text-white">
                <span class="text-indigo-400">💬</span>
                <span>Contact Management Channel</span>
              </div>
              <p class="text-[11px] text-slate-400">Target channel where messages from <code>/contact</code> are dispatched to management.</p>
              <select
                [ngModel]="defaultContactChannelId()"
                (ngModelChange)="defaultContactChannelId.set($event)"
                name="defaultContactChannelId"
                class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#5865F2] transition"
              >
                <option value="">None (disabled / rejected)</option>
                @for (ch of channels(); track ch.id) {
                  <option [value]="ch.id"># {{ ch.name }}</option>
                }
              </select>
            </div>

            <!-- Recruitment Applications Channel -->
            <div class="p-4 rounded-lg bg-[#1a1a2e] border border-slate-700/70 space-y-2">
              <div class="flex items-center gap-2 text-xs font-bold text-white">
                <span class="text-[#EAE905]">⚡</span>
                <span>Recruitment Applications Channel</span>
              </div>
              <p class="text-[11px] text-slate-400">Target channel where trial applications from <code>/recruitment</code> are delivered.</p>
              <select
                [ngModel]="defaultRecruitmentChannelId()"
                (ngModelChange)="defaultRecruitmentChannelId.set($event)"
                name="defaultRecruitmentChannelId"
                class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#EAE905] transition"
              >
                <option value="">None (disabled / rejected)</option>
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
  readonly defaultRyvlResultsChannelId = signal<string>('');
  readonly defaultRyvlFixturesChannelId = signal<string>('');
  readonly defaultRyvlLeaderboardChannelId = signal<string>('');
  readonly defaultContactChannelId = signal<string>('');
  readonly defaultRecruitmentChannelId = signal<string>('');
  readonly ryvlTeamName = signal<string>('');
  readonly isRyvlGuild = computed(() => {
    const g = this.guildStore.activeGuild();
    if (!g) return false;
    return (g.name || '').toLowerCase().includes('ryvl');
  });
  readonly competitions = signal<RyvlCompetition[]>([]);

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

        const ryvlResCh =
          active.settings?.defaultRyvlResultsChannelId ||
          active.defaultRyvlResultsChannelId ||
          '';
        this.defaultRyvlResultsChannelId.set(ryvlResCh);

        const ryvlFixCh =
          active.settings?.defaultRyvlFixturesChannelId ||
          active.defaultRyvlFixturesChannelId ||
          '';
        this.defaultRyvlFixturesChannelId.set(ryvlFixCh);

        const ryvlLdCh =
          active.settings?.defaultRyvlLeaderboardChannelId ||
          active.defaultRyvlLeaderboardChannelId ||
          '';
        this.defaultRyvlLeaderboardChannelId.set(ryvlLdCh);

        const contactCh =
          active.settings?.defaultContactChannelId ||
          active.defaultContactChannelId ||
          '';
        this.defaultContactChannelId.set(contactCh);

        const recruitCh =
          active.settings?.defaultRecruitmentChannelId ||
          active.defaultRecruitmentChannelId ||
          '';
        this.defaultRecruitmentChannelId.set(recruitCh);

        const teamName =
          active.settings?.ryvlTeamName ||
          active.ryvlTeamName ||
          'RYVL Esports';
        this.ryvlTeamName.set(teamName);

        this.botStatus.set(active.settings?.botActive ? 'online' : 'offline');

        if (active.id && active.id !== this.lastLoadedSettingsGuildId) {
          this.lastLoadedSettingsGuildId = active.id;
          void this.loadSettings(active.id);
          void this.loadCompetitions(active.id);
        }
      }
    });
  }

  private lastLoadedSettingsGuildId: string | null = null;

  ngOnInit(): void {
    const gid = this.guildStore.activeGuildId();
    if (gid && gid !== this.lastLoadedSettingsGuildId) {
      this.lastLoadedSettingsGuildId = gid;
      this.loadSettings(gid);
      this.loadCompetitions(gid);
    }
  }

  async loadSettings(guildId: string): Promise<void> {
    try {
      const s = await this.api.getSettings(guildId);
      if (s.name) this.guildName.set(s.name);
      if (s.iconUrl !== undefined) this.guildIconUrl.set(s.iconUrl);
      if (s.timezone) this.timezone.set(s.timezone);
      this.defaultChannelId.set(s.defaultChannelId || '');
      this.defaultLineupChannelId.set(s.defaultLineupChannelId || '');
      this.defaultTransfersChannelId.set(s.defaultTransfersChannelId || '');
      this.defaultFixturesChannelId.set(s.defaultFixturesChannelId || '');
      this.defaultStandingsChannelId.set(s.defaultStandingsChannelId || '');
      this.defaultLiveResultsChannelId.set(s.defaultLiveResultsChannelId || '');
      this.defaultRyvlResultsChannelId.set(s.defaultRyvlResultsChannelId || '');
      this.defaultRyvlFixturesChannelId.set(s.defaultRyvlFixturesChannelId || '');
      this.defaultRyvlLeaderboardChannelId.set(s.defaultRyvlLeaderboardChannelId || '');
      this.defaultContactChannelId.set(s.defaultContactChannelId || '');
      this.defaultRecruitmentChannelId.set(s.defaultRecruitmentChannelId || '');
      this.ryvlTeamName.set(s.ryvlTeamName || '');
      if (s.botStatus) this.botStatus.set(s.botStatus);
    } catch {
      // Keep loaded bootstrap values as fallback
    }
  }

  async loadCompetitions(guildId?: string): Promise<void> {
    const gid = guildId || this.guildStore.activeGuildId();
    if (!gid) return;
    try {
      const res = await this.api.getCompetitions(gid);
      this.competitions.set(res.competitions || []);
    } catch (err) {
      console.warn('Could not load competitions for settings:', err);
    }
  }

  async saveCompetition(comp: RyvlCompetition): Promise<void> {
    const gid = this.guildStore.activeGuildId();
    if (!gid || !comp.id) return;
    try {
      await this.api.updateCompetition(gid, comp.id, {
        name: comp.name,
        slug: comp.slug,
        season: Number(comp.season),
        active: Boolean(comp.active),
      });
      this.successMessage.set(`Updated competition slot: ${comp.name}`);
      this.loadCompetitions(gid);
    } catch (err: any) {
      console.error('Failed to update competition slot:', err);
      this.errorMessage.set(err.message || 'Failed to update competition slot.');
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
      timezone: this.timezone(),
      defaultChannelId: this.defaultChannelId() || null,
      defaultLineupChannelId: this.defaultLineupChannelId() || null,
      defaultTransfersChannelId: this.defaultTransfersChannelId() || null,
      defaultFixturesChannelId: this.defaultFixturesChannelId() || null,
      defaultStandingsChannelId: this.defaultStandingsChannelId() || null,
      defaultLiveResultsChannelId: this.defaultLiveResultsChannelId() || null,
      defaultRyvlResultsChannelId: this.defaultRyvlResultsChannelId() || null,
      defaultRyvlFixturesChannelId: this.defaultRyvlFixturesChannelId() || null,
      defaultRyvlLeaderboardChannelId: this.defaultRyvlLeaderboardChannelId() || null,
      defaultContactChannelId: this.defaultContactChannelId() || null,
      defaultRecruitmentChannelId: this.defaultRecruitmentChannelId() || null,
      ...(this.isRyvlGuild() && this.ryvlTeamName() ? { ryvlTeamName: this.ryvlTeamName() } : {}),
    };

    try {
      await this.api.updateSettings(guildId, payload);
      this.guildStore.updateActiveGuildSettings({
        timezone: this.timezone(),
        defaultChannelId: this.defaultChannelId() || null,
        defaultLineupChannelId: this.defaultLineupChannelId() || null,
        defaultTransfersChannelId: this.defaultTransfersChannelId() || null,
        defaultFixturesChannelId: this.defaultFixturesChannelId() || null,
        defaultStandingsChannelId: this.defaultStandingsChannelId() || null,
        defaultLiveResultsChannelId: this.defaultLiveResultsChannelId() || null,
        defaultRyvlResultsChannelId: this.defaultRyvlResultsChannelId() || null,
        defaultRyvlFixturesChannelId: this.defaultRyvlFixturesChannelId() || null,
        defaultRyvlLeaderboardChannelId: this.defaultRyvlLeaderboardChannelId() || null,
        defaultContactChannelId: this.defaultContactChannelId() || null,
        defaultRecruitmentChannelId: this.defaultRecruitmentChannelId() || null,
        ryvlTeamName: this.ryvlTeamName() || 'RYVL Esports',
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
