import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { GuildHealth, HealthState, HealthVerdict } from '../../core/models';

type FeedKey = Exclude<keyof GuildHealth, 'generatedAt'>;

interface FeedDef {
  key: FeedKey;
  label: string;
  section: string;
  tab: string;
  view?: string;
  ryvlOnly?: boolean;
}

const FEEDS: readonly FeedDef[] = [
  { key: 'eaTracker', label: 'EA tracker', section: 'club', tab: 'tracker' },
  { key: 'trackedClubs', label: 'Tracked clubs', section: 'club', tab: 'tracker', view: 'clubs' },
  { key: 'vpgTransfers', label: 'VPG transfers', section: 'superliga', tab: 'transfers' },
  { key: 'vpgNotifications', label: 'VPG notifications', section: 'superliga', tab: 'notifications', ryvlOnly: true },
  { key: 'superligaMvp', label: 'Superliga MVP sync', section: 'superliga', tab: 'awards', view: 'mvp' },
  { key: 'totw', label: 'Team of the Week', section: 'superliga', tab: 'awards', view: 'totw' },
  { key: 'events', label: 'Events scheduler', section: 'community', tab: 'events' },
];

export interface HealthCard extends HealthVerdict {
  key: FeedKey;
  label: string;
  detail: string | null;
  link: { path: string[]; queryParams: Record<string, string> } | null;
}

const STATE_LABEL: Record<HealthState, string> = { ok: 'OK', warning: 'Warning', error: 'Error', off: 'Off' };

function when(value: string | null | undefined): string {
  if (!value) return 'never';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

/** A secondary line with the raw facts behind a verdict. */
export function healthDetail(key: FeedKey, health: GuildHealth): string | null {
  switch (key) {
    case 'eaTracker':
      return health.eaTracker.configured ? `Last poll ${when(health.eaTracker.lastPolledAt)}` : null;
    case 'trackedClubs':
      return health.trackedClubs.total ? `${health.trackedClubs.enabled} of ${health.trackedClubs.total} active` : null;
    case 'vpgTransfers':
      return health.vpgTransfers.configured ? `Last poll ${when(health.vpgTransfers.lastPolledAt)}` : null;
    case 'vpgNotifications':
      return health.vpgNotifications.configured ? `Last success ${when(health.vpgNotifications.lastSuccessAt)}` : null;
    case 'superligaMvp': {
      const c = health.superligaMvp.counts;
      return health.superligaMvp.season === null
        ? null
        : `Season ${health.superligaMvp.season}: ${c['LINKED'] || 0} linked · ${c['PENDING'] || 0} pending · ${c['SCHEDULED'] || 0} scheduled`;
    }
    case 'totw': {
      const last = health.totw.configs.map((c) => c.lastPostedAt).filter(Boolean).sort().pop();
      return health.totw.configs.length ? `Last posted ${when(last)}` : null;
    }
    case 'events':
      return health.events.nextOccurrence ? `Next ${when(health.events.nextOccurrence.startsAt)}` : null;
  }
}

export function healthCards(health: GuildHealth, isRyvl: boolean): HealthCard[] {
  return FEEDS.filter((f) => !f.ryvlOnly || isRyvl || health[f.key].status !== 'off').map((f) => ({
    key: f.key,
    label: f.label,
    status: health[f.key].status,
    reason: health[f.key].reason,
    detail: healthDetail(f.key, health),
    // RYVL-only tabs are hidden on other servers: no link to a tab that is not there.
    link: f.ryvlOnly && !isRyvl ? null : { path: ['/admin', f.section], queryParams: { tab: f.tab, ...(f.view ? { view: f.view } : {}) } },
  }));
}

@Component({
  selector: 'app-dashboard-health',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'block' },
  template: `
    <section class="space-y-4" aria-labelledby="health-heading">
      <div class="flex items-center justify-between gap-3">
        <h2 id="health-heading" class="text-lg font-semibold text-white">Bot health</h2>
        <button type="button" (click)="load()" [disabled]="loading()"
          class="text-xs text-indigo-400 hover:text-indigo-300 font-semibold disabled:opacity-50 cursor-pointer">
          {{ loading() ? 'Checking…' : 'Refresh' }}
        </button>
      </div>
      @if (error()) {
        <p class="p-4 rounded-xl bg-[#16213e] border border-slate-700/60 text-xs text-rose-300" role="alert">{{ error() }}</p>
      } @else if (cards().length === 0) {
        <p class="p-4 rounded-xl bg-[#16213e] border border-slate-700/60 text-xs text-slate-400" role="status">Checking background feeds…</p>
      } @else {
        <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          @for (card of cards(); track card.key) {
            <li class="p-4 rounded-xl bg-[#16213e] border shadow flex flex-col gap-2"
              [class.border-slate-700/60]="card.status === 'ok' || card.status === 'off'"
              [class.border-amber-500/40]="card.status === 'warning'"
              [class.border-rose-500/50]="card.status === 'error'"
              [attr.data-health]="card.key">
              <div class="flex items-center justify-between gap-2">
                <h3 class="text-sm font-semibold text-white">{{ card.label }}</h3>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                  [class]="badge(card.status)">{{ stateLabel[card.status] }}</span>
              </div>
              <p class="text-xs text-slate-300 break-words">{{ card.reason }}</p>
              @if (card.detail) { <p class="text-[11px] text-slate-400">{{ card.detail }}</p> }
              @if (card.link) {
                <a [routerLink]="card.link.path" [queryParams]="card.link.queryParams"
                  class="mt-auto text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 hover:underline">
                  Open {{ card.label }} →
                </a>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class DashboardHealthComponent {
  private readonly api = inject(ApiService);
  private readonly guildStore = inject(GuildStore);
  private request = 0;

  readonly stateLabel = STATE_LABEL;
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly health = signal<GuildHealth | null>(null);
  readonly cards = computed(() => {
    const health = this.health();
    return health ? healthCards(health, this.guildStore.isRyvlGuild()) : [];
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
    try {
      const health = await this.api.getGuildHealth(guildId);
      if (request !== this.request) return;
      // Guard against an unexpected body (e.g. an older server without the endpoint).
      this.health.set(health && health.events ? health : null);
      if (!health?.events) this.error.set('Bot health is not available from this server version.');
    } catch {
      if (request === this.request) {
        this.health.set(null);
        this.error.set('Bot health could not be loaded.');
      }
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  badge(status: HealthState): string {
    switch (status) {
      case 'ok': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'warning': return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
      case 'error': return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
      default: return 'bg-slate-700/40 text-slate-400 border-slate-600/50';
    }
  }
}
