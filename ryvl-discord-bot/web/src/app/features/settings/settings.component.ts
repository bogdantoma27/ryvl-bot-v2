import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { EditableSettings, changedSettings } from './settings-diff';

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

// General server settings. Every Discord posting channel lives on the Channels tab.
@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, UpperCasePipe, RouterLink],
  template: `
    <div class="space-y-6 animate-fadeIn">
      <div>
        <h1 class="text-2xl font-bold text-white tracking-tight">General Settings</h1>
        <p class="text-xs text-slate-400 mt-1">
          Server defaults and bot status. Choose where the bot posts on the
          <a routerLink="/admin/server" [queryParams]="{ tab: 'channels' }" class="text-indigo-400 hover:underline">Channels</a> tab.
        </p>
      </div>

      @if (successMessage()) {
        <div class="p-3.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between" role="status">
          <span>{{ successMessage() }}</span>
          <button type="button" (click)="successMessage.set(null)" class="text-slate-300 hover:text-white font-bold p-1 cursor-pointer" aria-label="Dismiss">✕</button>
        </div>
      }
      @if (errorMessage()) {
        <div class="p-3.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between" role="alert">
          <span>{{ errorMessage() }}</span>
          <button type="button" (click)="errorMessage.set(null)" class="text-slate-300 hover:text-white font-bold p-1 cursor-pointer" aria-label="Dismiss">✕</button>
        </div>
      }

      <form (ngSubmit)="saveSettings()" class="space-y-6">
        <div class="p-6 rounded-xl bg-[#16213e] border border-slate-700/60 shadow space-y-5">
          <div class="flex items-center justify-between border-b border-slate-700/50 pb-3 flex-wrap gap-2">
            <div>
              <h2 class="text-base font-bold text-white">Regional Defaults</h2>
              <p class="text-xs text-slate-400">Default timezone for events and schedules.</p>
            </div>
            <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-[#1a1a2e] border border-slate-700">
              <span class="relative inline-flex rounded-full h-2.5 w-2.5"
                [class.bg-emerald-500]="botStatus() === 'online'"
                [class.bg-amber-500]="botStatus() === 'idle'"
                [class.bg-rose-500]="botStatus() === 'offline'"></span>
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
            <div>
              <label for="settings-timezone" class="block text-xs font-semibold text-slate-300 mb-1">Default Timezone</label>
              <select
                id="settings-timezone"
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

            @if (guildStore.isRyvlGuild()) {
              <div>
                <label for="settings-club-name" class="block text-xs font-semibold text-slate-300 mb-1">Official Club Name</label>
                <input
                  id="settings-club-name"
                  type="text"
                  [ngModel]="ryvlTeamName()"
                  (ngModelChange)="ryvlTeamName.set($event)"
                  name="ryvlTeamName"
                  placeholder="RYVL Esports"
                  class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EAE905] transition"
                />
                <p class="text-[11px] text-slate-400 mt-1">Identifies RYVL Esports in VPG Superliga matches and team leaderboards.</p>
              </div>
            }
          </div>
        </div>

        <div class="flex items-center justify-end gap-3">
          <button
            type="submit"
            [disabled]="isSaving()"
            class="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-indigo-500/20 transition active:scale-95 cursor-pointer"
          >
            {{ isSaving() ? 'Saving...' : 'Save Settings' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class SettingsComponent {
  private readonly api = inject(ApiService);
  readonly guildStore = inject(GuildStore);

  readonly timezones = TIMEZONES;
  readonly isSaving = signal<boolean>(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly timezone = signal<string>('Europe/Bucharest');
  readonly ryvlTeamName = signal<string>('');
  readonly botStatus = signal<'online' | 'offline' | 'idle'>('online');

  /** Values as last loaded from the server; saving sends only what differs from these. */
  private loaded: EditableSettings = {};
  private request = 0;

  constructor() {
    effect(() => {
      const gid = this.guildStore.activeGuildId();
      if (gid) void this.loadSettings(gid);
    });
  }

  private currentValues(): EditableSettings {
    return { timezone: this.timezone(), ryvlTeamName: this.ryvlTeamName() };
  }

  async loadSettings(guildId: string): Promise<void> {
    const request = ++this.request;
    // Bootstrap values first, so the form is never blank while the request runs.
    const active = this.guildStore.activeGuild();
    if (active && active.id === guildId) {
      this.timezone.set(active.settings?.timezone || active.defaultTimezone || 'Europe/Bucharest');
      this.ryvlTeamName.set(active.settings?.ryvlTeamName || active.ryvlTeamName || 'RYVL Esports');
      this.botStatus.set(active.settings?.botActive === false ? 'offline' : 'online');
      this.loaded = this.currentValues();
    }
    try {
      const s = await this.api.getSettings(guildId);
      if (request !== this.request) return;
      if (s.timezone) this.timezone.set(s.timezone);
      this.ryvlTeamName.set(s.ryvlTeamName || '');
      if (s.botStatus) this.botStatus.set(s.botStatus);
      this.loaded = this.currentValues();
    } catch {
      // Keep the bootstrap values as a fallback.
    }
  }

  async saveSettings(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) {
      this.errorMessage.set('No active guild selected');
      return;
    }
    this.successMessage.set(null);
    this.errorMessage.set(null);

    const patch = changedSettings(this.loaded, this.currentValues());
    // The club name is only editable on the RYVL server and can't be blanked.
    if (!this.guildStore.isRyvlGuild() || !patch.ryvlTeamName) delete patch.ryvlTeamName;
    if (Object.keys(patch).length === 0) {
      this.successMessage.set('No changes to save.');
      return;
    }

    this.isSaving.set(true);
    try {
      const saved = await this.api.updateSettings(guildId, patch);
      this.guildStore.updateActiveGuildSettings({
        ...patch,
        ...(saved?.ryvlTeamName ? { ryvlTeamName: saved.ryvlTeamName } : {}),
      } as Parameters<GuildStore['updateActiveGuildSettings']>[0]);
      this.loaded = this.currentValues();
      this.successMessage.set('Settings saved successfully!');
    } catch (err: unknown) {
      const message =
        (err as { error?: { message?: string | string[] } })?.error?.message ?? 'Settings could not be saved.';
      this.errorMessage.set(Array.isArray(message) ? message.join(' ') : message);
    } finally {
      this.isSaving.set(false);
    }
  }
}
