import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { VpgNotificationResponse, VpgNotificationSettings } from '../../core/models';
type FeedKey = Exclude<keyof VpgNotificationSettings, 'pollIntervalSec' | 'fixturesTime'>;
@Component({
  selector: 'app-vpg-notifications', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="rounded-2xl bg-[#16213e] border border-slate-700/60 p-5 sm:p-6 space-y-5" aria-labelledby="vpg-automation-title">
      <div class="flex flex-col sm:flex-row justify-between gap-3"><div><h2 id="vpg-automation-title" class="text-lg font-semibold text-white">VPG automatic posting</h2><p class="mt-1 text-sm text-slate-400">League-wide and RYVL-only feeds run independently. All schedules use Europe/Bucharest.</p></div><a routerLink="/admin/settings" class="text-sm text-[#EAE905] shrink-0">Configure Discord channels →</a></div>
      @if(message()) { <p role="status" class="rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3 text-sm text-emerald-300">{{ message() }}</p> }
      @if(error()) { <div role="alert" class="rounded-lg bg-rose-500/10 border border-rose-500/25 p-3 text-sm text-rose-300">{{ error() }} <button type="button" class="underline ml-2" (click)="load()">Retry</button></div> }
      @if(loading()) { <p class="text-sm text-slate-400" role="status">Loading notification settings…</p> } @else if(form(); as cfg) {
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          @for (feed of feeds; track feed.key) {
            <label class="flex items-start gap-3 p-3 rounded-xl border border-white/10 bg-black/10 cursor-pointer"><input type="checkbox" class="mt-1 accent-[#EAE905]" [ngModel]="cfg[feed.key]" (ngModelChange)="setEnabled(feed.key, $event)" /><span><span class="block font-medium text-sm text-white">{{ feed.label }}</span><span class="block mt-1 text-xs text-slate-400">{{ details()?.channels?.[feed.channel] ? 'Channel: ' + details()?.channels?.[feed.channel] : 'No channel selected — not posting' }}</span></span></label>
          }
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label class="text-sm text-slate-300">Results polling interval (minutes)<input type="number" min="1" max="60" step="1" class="mt-2 w-full bg-[#11192e] border border-slate-600 rounded-lg px-3 py-2" [ngModel]="cfg.pollIntervalSec / 60" (ngModelChange)="setMinutes($event)" /><span class="block text-xs text-slate-400 mt-1">Default: 2 minutes. Also rechecks fixture changes after the daily post time.</span></label>
          <label class="text-sm text-slate-300">Daily fixtures post time<input type="time" class="mt-2 w-full bg-[#11192e] border border-slate-600 rounded-lg px-3 py-2" [ngModel]="cfg.fixturesTime" (ngModelChange)="setTime($event)" /><span class="block text-xs text-slate-400 mt-1">Only today's matches. Nothing is posted on an empty day.</span></label>
          <div class="rounded-xl bg-black/10 border border-white/10 p-4"><p class="text-sm font-medium text-white">Weekly standings</p><p class="mt-2 text-sm text-[#EAE905]">Sunday · 10:00</p><p class="mt-1 text-xs text-slate-400">Romanian local time, including daylight saving changes.</p></div>
        </div>
        <div class="flex flex-wrap gap-3"><button type="button" class="btn-yellow px-4 py-2 rounded-lg text-sm" [disabled]="busy()" (click)="save()">{{ busy() ? 'Working…' : 'Save settings' }}</button><button type="button" class="px-4 py-2 rounded-lg border border-white/20 text-sm" [disabled]="busy()" (click)="check()">Check now</button><button type="button" class="px-4 py-2 rounded-lg border border-white/20 text-sm" [disabled]="busy()" (click)="repair()">Repair old club links</button></div>
        <p class="text-xs text-slate-400">A newly enabled result feed starts from a saved baseline, without reposting historical matches. Failed sends retry; already delivered messages are not repeated.</p>
        @if(details()?.config?.lastPolledAt) { <p class="text-xs text-slate-400">Last result check: {{ timeLabel(details()?.config?.lastPolledAt) }}</p> }
        @if(details()?.config?.lastError) { <p role="status" class="text-sm text-amber-300">Last background error: {{ details()?.config?.lastError }}. The poller will retry automatically.</p> }
      } @else if(!error()) { <p class="text-sm text-slate-400">Select a Discord server to configure notifications.</p> }
    </section>
  `,
})
export class VpgNotificationsComponent {
  private readonly api = inject(ApiService);
  private readonly store = inject(GuildStore);
  private requestId = 0;
  readonly loading = signal(false); readonly busy = signal(false);
  readonly error = signal<string | null>(null); readonly message = signal<string | null>(null);
  readonly details = signal<VpgNotificationResponse | null>(null);
  readonly form = signal<VpgNotificationSettings | null>(null);
  readonly feeds: readonly { key: FeedKey; channel: string; label: string }[] = [
    { key: 'resultsEnabled', channel: 'results', label: 'Superliga results' }, { key: 'ryvlResultsEnabled', channel: 'ryvlResults', label: 'RYVL results' },
    { key: 'fixturesEnabled', channel: 'fixtures', label: 'Superliga daily fixtures' }, { key: 'ryvlFixturesEnabled', channel: 'ryvlFixtures', label: 'RYVL daily fixtures' },
    { key: 'standingsEnabled', channel: 'standings', label: 'Superliga weekly standings' }, { key: 'ryvlStandingsEnabled', channel: 'ryvlStandings', label: 'RYVL weekly standing' },
  ];
  constructor() { effect(() => { const guildId = this.store.activeGuildId(); void this.load(guildId || undefined); }); }
  private settings(response: VpgNotificationResponse): VpgNotificationSettings {
    const c = response.config;
    return { pollIntervalSec: c.pollIntervalSec, fixturesTime: c.fixturesTime, resultsEnabled: c.resultsEnabled, ryvlResultsEnabled: c.ryvlResultsEnabled, fixturesEnabled: c.fixturesEnabled, ryvlFixturesEnabled: c.ryvlFixturesEnabled, standingsEnabled: c.standingsEnabled, ryvlStandingsEnabled: c.ryvlStandingsEnabled };
  }
  async load(guildId = this.store.activeGuildId() || undefined): Promise<void> {
    const request = ++this.requestId;
    this.form.set(null); this.details.set(null); this.error.set(null); this.message.set(null);
    if (!guildId || guildId === 'default') { this.loading.set(false); return; }
    this.loading.set(true);
    try { const response = await this.api.getVpgNotifications(guildId); if (request === this.requestId) { this.details.set(response); this.form.set(this.settings(response)); } }
    catch { if (request === this.requestId) this.error.set('Could not load notification settings. You need Administrator or Manage Server permission.'); }
    finally { if (request === this.requestId) this.loading.set(false); }
  }
  setEnabled(key: FeedKey, value: boolean): void { this.form.update(c => c ? { ...c, [key]: value === true } : c); }
  setMinutes(value: number): void { this.form.update(c => c ? { ...c, pollIntervalSec: Number(value) * 60 } : c); }
  setTime(value: string): void { this.form.update(c => c ? { ...c, fixturesTime: value } : c); }
  async save(): Promise<void> {
    const guildId = this.store.activeGuildId(); const form = this.form();
    if (!guildId || !form || this.busy()) return;
    if (!Number.isInteger(form.pollIntervalSec / 60) || form.pollIntervalSec < 60 || form.pollIntervalSec > 3600 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(form.fixturesTime)) { this.error.set('Choose a 1–60 minute interval and a valid fixture time.'); return; }
    await this.action(guildId, async () => { const response = await this.api.updateVpgNotifications(guildId, form); if (guildId === this.store.activeGuildId()) this.details.set(response); return 'Notification settings saved. No restart is needed.'; });
  }
  async check(): Promise<void> {
    const guildId = this.store.activeGuildId(); if (!guildId || this.busy()) return;
    await this.action(guildId, async () => { const response = await this.api.checkVpgNotifications(guildId); return response.busy ? 'A check is already running.' : `Check complete: ${response.postedCount} posts and ${response.updatedCount || 0} result corrections. A new feed may have initialized its historical baseline.`; });
  }
  async repair(): Promise<void> {
    const guildId = this.store.activeGuildId(); if (!guildId || this.busy()) return;
    if (!window.confirm('Update website buttons in up to 200 recent bot-owned club messages? No messages will be deleted or reposted.')) return;
    await this.action(guildId, async () => { const response = await this.api.repairClubLinks(guildId); return `Club links: ${response.updated} updated, ${response.skipped} unchanged/unavailable, ${response.failed} failed (${response.inspected} inspected).`; });
  }
  private async action(guildId: string, run: () => Promise<string>): Promise<void> {
    this.busy.set(true); this.error.set(null); this.message.set(null);
    try { const message = await run(); if (guildId === this.store.activeGuildId()) this.message.set(message); }
    catch { if (guildId === this.store.activeGuildId()) this.error.set('The operation failed. Check Discord permissions and backend logs, then try again.'); }
    finally { this.busy.set(false); }
  }
  timeLabel(value?: string | null): string {
    if (!value) return 'Not checked yet';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }
}
