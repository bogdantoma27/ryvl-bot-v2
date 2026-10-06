import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { ChannelOption, GuildHealth, GuildSettings } from '../../core/models';

type GuildChannelKey =
  | 'defaultChannelId'
  | 'defaultLineupChannelId'
  | 'defaultFixturesChannelId'
  | 'defaultStandingsChannelId'
  | 'defaultLiveResultsChannelId'
  | 'defaultRyvlResultsChannelId'
  | 'defaultRyvlFixturesChannelId'
  | 'defaultRyvlLeaderboardChannelId'
  | 'defaultContactChannelId'
  | 'defaultRecruitmentChannelId';

export interface ChannelRow {
  id: string;
  group: string;
  topic: string;
  description: string;
  channelId: string | null;
  /** Label of the empty choice: what happens when no channel is picked. */
  emptyLabel: string;
  /** Absent for rows that cannot be changed here. */
  save?: (channelId: string | null) => Promise<unknown>;
  /** Shown instead of a picker on read-only rows. */
  note?: string;
  link?: { label: string; tab: string; section: string; view?: string };
}

const GUILD_ROWS: ReadonlyArray<{ key: GuildChannelKey; group: string; topic: string; description: string; ryvlOnly?: boolean; emptyLabel?: string }> = [
  { key: 'defaultChannelId', group: 'Events & lineups', topic: 'Events', description: 'Default channel for new event sign-ups and reminders.' },
  { key: 'defaultLineupChannelId', group: 'Events & lineups', topic: 'Lineups', description: 'Where /lineup and the lineup builder post. Falls back to the events channel.', emptyLabel: 'Events channel' },
  { key: 'defaultLiveResultsChannelId', group: 'Superliga', topic: 'Results', description: 'Superliga match results. Also the default for tracked EA clubs.' },
  { key: 'defaultFixturesChannelId', group: 'Superliga', topic: 'Daily fixtures', description: "Today's Superliga schedule, posted each morning." },
  { key: 'defaultStandingsChannelId', group: 'Superliga', topic: 'Weekly standings', description: 'The league table, posted on Sundays.' },
  { key: 'defaultRyvlResultsChannelId', group: 'RYVL', topic: 'RYVL results', description: 'Results of RYVL matches only.', ryvlOnly: true },
  { key: 'defaultRyvlFixturesChannelId', group: 'RYVL', topic: 'RYVL fixtures', description: 'Upcoming RYVL games.', ryvlOnly: true },
  { key: 'defaultRyvlLeaderboardChannelId', group: 'RYVL', topic: 'RYVL standing & leaderboards', description: 'RYVL weekly standing and team performance summaries.', ryvlOnly: true },
  { key: 'defaultContactChannelId', group: 'Website forms', topic: 'Contact messages', description: 'Messages from the website contact form.' },
  { key: 'defaultRecruitmentChannelId', group: 'Website forms', topic: 'Trial applications', description: 'Applications from the website recruitment form.' },
];

const GROUP_ORDER = ['Events & lineups', 'Superliga', 'RYVL', 'Club tracking', 'Website forms'];

// One table of everything the bot posts and where; each row saves through its own feature's endpoint.
@Component({
  selector: 'app-channels',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="space-y-6 animate-fadeIn">
      <div>
        <h1 class="text-2xl font-bold text-white tracking-tight">Channels</h1>
        <p class="text-xs text-slate-400 mt-1">Every topic the bot posts about and the Discord channel it posts to. Changes save immediately.</p>
      </div>

      @if (error()) {
        <div class="p-3.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs" role="alert">
          {{ error() }} <button type="button" class="underline ml-2" (click)="load()">Retry</button>
        </div>
      }

      @if (loading() && rows().length === 0) {
        <p class="text-xs text-slate-400" role="status">Loading channels…</p>
      } @else {
        <div class="rounded-xl bg-[#16213e] border border-slate-700/60 shadow overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-300">
            <thead class="bg-[#11192e] text-[11px] text-slate-400 uppercase font-bold tracking-wider border-b border-slate-800">
              <tr>
                <th scope="col" class="py-3 px-4">Topic</th>
                <th scope="col" class="py-3 px-4 min-w-[14rem]">Channel</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.id; let i = $index) {
                @if (i === 0 || rows()[i - 1].group !== row.group) {
                  <tr class="bg-[#1a1a2e]/60">
                    <th scope="rowgroup" colspan="2" class="py-2 px-4 text-[10px] uppercase tracking-wider font-extrabold text-slate-400">{{ row.group }}</th>
                  </tr>
                }
                <tr class="border-t border-slate-800/80 align-top">
                  <th scope="row" class="py-3 px-4 font-normal">
                    <span class="block text-sm font-semibold text-white">{{ row.topic }}</span>
                    <span class="block text-[11px] text-slate-400 mt-0.5">{{ row.description }}</span>
                  </th>
                  <td class="py-3 px-4">
                    @if (row.save) {
                      <select
                        [attr.aria-label]="row.topic + ' channel'"
                        [value]="row.channelId || ''"
                        (change)="change(row, $any($event.target))"
                        [disabled]="saving()[row.id]"
                        class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#5865F2] transition disabled:opacity-60"
                      >
                        <option value="" [selected]="!row.channelId">{{ row.emptyLabel }}</option>
                        @for (ch of optionsFor(row); track ch.id) {
                          <option [value]="ch.id" [selected]="ch.id === row.channelId"># {{ ch.name }}</option>
                        }
                      </select>
                    } @else {
                      <span class="block text-xs text-slate-200">{{ row.channelId ? '# ' + channelName(row.channelId) : row.emptyLabel }}</span>
                      @if (row.note) { <span class="block text-[11px] text-slate-400 mt-0.5">{{ row.note }}</span> }
                    }
                    @if (row.link) {
                      <a [routerLink]="['/admin', row.link.section]" [queryParams]="{ tab: row.link.tab, view: row.link.view }" class="inline-block mt-1 text-[11px] text-indigo-400 hover:underline">{{ row.link.label }} →</a>
                    }
                    @if (status()[row.id]; as s) {
                      <span class="block mt-1 text-[11px]" role="status" [class.text-emerald-400]="s === 'Saved'" [class.text-rose-300]="s !== 'Saved'">{{ s }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class ChannelsComponent {
  private readonly api = inject(ApiService);
  private readonly guildStore = inject(GuildStore);
  private request = 0;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly settings = signal<GuildSettings | null>(null);
  readonly health = signal<GuildHealth | null>(null);
  readonly saving = signal<Record<string, boolean>>({});
  readonly status = signal<Record<string, string>>({});

  readonly channels = computed<ChannelOption[]>(() => this.guildStore.activeGuild()?.channels ?? []);

  readonly rows = computed<ChannelRow[]>(() => {
    const settings = this.settings();
    const health = this.health();
    const gid = this.guildStore.activeGuildId();
    if (!settings || !gid) return [];
    const rows: ChannelRow[] = [];
    const ryvl = this.guildStore.isRyvlGuild();
    for (const def of GUILD_ROWS) {
      if (def.ryvlOnly && !ryvl) continue;
      rows.push({
        id: def.key,
        group: def.group,
        topic: def.topic,
        description: def.description,
        channelId: settings[def.key] || null,
        emptyLabel: def.emptyLabel || 'None (not posted)',
        save: (channelId) => this.saveGuildChannel(gid, def.key, channelId),
      });
    }
    // The transfer feed has its own config; its endpoint keeps the guild default in step.
    rows.splice(rows.findIndex((r) => r.group === 'Superliga'), 0, {
      id: 'transfers',
      group: 'Superliga',
      topic: 'Transfers',
      description: 'New VPG transfers, as they happen.',
      channelId: health?.vpgTransfers.channelId ?? settings.defaultTransfersChannelId ?? null,
      emptyLabel: 'None (not posted)',
      save: async (channelId) => {
        await this.api.updateVpgConfig(gid, { channelId });
        await this.reloadQuietly();
      },
      link: { label: 'Transfer feed settings', section: 'superliga', tab: 'transfers' },
    });

    if (health) {
      const totw = health.totw.configs.length
        ? health.totw.configs
        : [{ leagueSlug: 'Superliga-Romania', enabled: false, channelId: null, cronSchedule: null, lastPostedAt: null }];
      for (const config of totw) {
        rows.push({
          id: 'totw:' + config.leagueSlug,
          group: 'Superliga',
          topic: totw.length > 1 ? `Team of the Week (${config.leagueSlug})` : 'Team of the Week',
          description: config.enabled ? 'Weekly Team of the Week, posted automatically.' : 'Automatic posting is off; manual posts use this channel.',
          channelId: config.channelId,
          emptyLabel: 'None (not posted)',
          save: (channelId) => this.saveTotw(gid, config.leagueSlug, channelId),
          link: { label: 'Team of the Week settings', section: 'superliga', tab: 'awards', view: 'totw' },
        });
      }

      const ea = health.eaTracker;
      rows.push({
        id: 'ea',
        group: 'Club tracking',
        topic: ea.clubName ? `EA tracker: ${ea.clubName}` : 'EA tracker',
        description: 'Results of the main tracked EA club.',
        channelId: ea.channelId,
        emptyLabel: 'None (not posted)',
        ...(ea.configured
          ? { save: async (channelId: string | null) => { await this.api.updateEaConfig(gid, { channelId }); await this.reloadQuietly(); } }
          : { note: 'The EA tracker is not set up yet.' }),
        link: { label: 'EA tracker settings', section: 'club', tab: 'tracker' },
      });
      for (const club of health.trackedClubs.clubs) {
        // The main club also has a tracked-club row; both are kept in sync by the server.
        if (ea.configured && club.clubId === ea.clubId) continue;
        rows.push({
          id: 'club:' + club.clubId,
          group: 'Club tracking',
          topic: `Tracked club: ${club.clubName}`,
          description: club.enabled ? 'Match results of this club.' : 'Paused: nothing is posted.',
          channelId: club.channelId,
          emptyLabel: 'Default (Superliga results channel)',
          save: (channelId) => this.saveTrackedClub(gid, club.clubId, channelId),
        });
      }
    }
    // Group rows (the sort is stable, so the order inside a group is kept).
    return rows.sort((x, y) => GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group));
  });

  constructor() {
    effect(() => {
      const gid = this.guildStore.activeGuildId();
      if (gid) void this.load(gid);
    });
  }

  async load(guildId = this.guildStore.activeGuildId()): Promise<void> {
    if (!guildId) return;
    const request = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    this.status.set({});
    const [settings, health] = await Promise.allSettled([this.api.getSettings(guildId), this.api.getGuildHealth(guildId)]);
    if (request !== this.request) return;
    this.settings.set(settings.status === 'fulfilled' ? settings.value : null);
    this.health.set(health.status === 'fulfilled' ? health.value : null);
    if (settings.status === 'rejected') this.error.set('Channel settings could not be loaded. You need Administrator or Manage Server permission.');
    else if (health.status === 'rejected') this.error.set('Feed channels (EA tracker, tracked clubs, Team of the Week) could not be loaded.');
    this.loading.set(false);
  }

  optionsFor(row: ChannelRow): ChannelOption[] {
    const list = this.channels();
    // Keep a channel the bot no longer sees selectable, so the select shows the truth.
    if (row.channelId && !list.some((c) => c.id === row.channelId)) {
      return [...list, { id: row.channelId, name: `unknown channel (${row.channelId})` }];
    }
    return list;
  }

  channelName(id: string): string {
    return this.channels().find((c) => c.id === id)?.name ?? id;
  }

  async change(row: ChannelRow, select: HTMLSelectElement): Promise<void> {
    if (!row.save) return;
    const channelId = select.value || null;
    if (channelId === row.channelId) return;
    const guildId = this.guildStore.activeGuildId();
    this.saving.update((s) => ({ ...s, [row.id]: true }));
    this.status.update((s) => ({ ...s, [row.id]: '' }));
    try {
      await row.save(channelId);
      if (guildId !== this.guildStore.activeGuildId()) return;
      this.status.update((s) => ({ ...s, [row.id]: 'Saved' }));
    } catch (err: unknown) {
      if (guildId !== this.guildStore.activeGuildId()) return;
      const message = (err as { error?: { message?: string | string[] } })?.error?.message;
      this.status.update((s) => ({ ...s, [row.id]: (Array.isArray(message) ? message.join(' ') : message) || 'Could not save this channel.' }));
      // Show what is actually stored again.
      select.value = row.channelId || '';
    } finally {
      this.saving.update((s) => ({ ...s, [row.id]: false }));
    }
  }

  private async saveGuildChannel(guildId: string, key: GuildChannelKey, channelId: string | null): Promise<void> {
    await this.api.updateSettings(guildId, { [key]: channelId });
    this.settings.update((s) => (s ? { ...s, [key]: channelId } : s));
    this.guildStore.updateActiveGuildSettings({ [key]: channelId });
  }

  private async saveTotw(guildId: string, leagueSlug: string, channelId: string | null): Promise<void> {
    await this.api.updateTotwConfig(guildId, leagueSlug, { channelId });
    await this.reloadQuietly();
  }

  private async saveTrackedClub(guildId: string, clubId: string, channelId: string | null): Promise<void> {
    await this.api.updateTrackedClub(guildId, clubId, { channelId });
    // "Default" is resolved by the server; show the channel it picked.
    await this.reloadQuietly();
  }

  private async reloadQuietly(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;
    try {
      const [settings, health] = await Promise.all([this.api.getSettings(guildId), this.api.getGuildHealth(guildId)]);
      if (guildId !== this.guildStore.activeGuildId()) return;
      this.settings.set(settings);
      this.health.set(health);
    } catch {
      // The row status already reports the failure.
    }
  }
}
