import { ChangeDetectionStrategy, Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { UpcomingFixture } from '../../core/models';
import { formatEventDate } from './event-display';

/** Small dialog: pick a channel and create one-off match events from RYVL's upcoming fixtures. */
@Component({
  selector: 'app-fixture-events-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" (click)="close()">
      <div
        class="w-full max-w-lg rounded-xl bg-[#16213e] border border-slate-700 shadow-2xl p-5 space-y-4"
        role="dialog"
        aria-labelledby="fixtures-dialog-title"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 id="fixtures-dialog-title" class="text-base font-bold text-white">Create match events from fixtures</h2>
            <p class="text-xs text-slate-400 mt-0.5">One event per upcoming RYVL fixture that does not have an event yet.</p>
          </div>
          <button type="button" (click)="close()" class="text-slate-400 hover:text-white text-lg leading-none cursor-pointer" aria-label="Close">&times;</button>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">Announce in channel</label>
          <select
            [ngModel]="channelId()"
            (ngModelChange)="channelId.set($event)"
            class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2]"
          >
            <option value="">Select a channel</option>
            @for (ch of channels(); track ch.id) {
              <option [value]="ch.id"># {{ ch.name }}</option>
            }
          </select>
        </div>

        <div class="max-h-64 overflow-y-auto space-y-1.5 pr-1">
          @if (isLoading()) {
            <p class="text-xs text-slate-400 py-6 text-center">Loading fixtures…</p>
          } @else if (error()) {
            <p class="text-xs text-rose-300 py-6 text-center">{{ error() }}</p>
          } @else if (fixtures().length === 0) {
            <p class="text-xs text-slate-400 py-6 text-center">No upcoming RYVL fixtures found in the active competitions.</p>
          } @else {
            @for (fixture of fixtures(); track fixture.vpgMatchId) {
              <label
                class="flex items-center gap-3 p-2 rounded-lg border text-xs"
                [class.border-slate-700]="!fixture.eventId"
                [class.border-emerald-700/50]="!!fixture.eventId"
                [class.opacity-60]="!!fixture.eventId"
              >
                <input
                  type="checkbox"
                  [disabled]="!!fixture.eventId"
                  [checked]="!fixture.eventId && selected().has(fixture.vpgMatchId)"
                  (change)="toggle(fixture.vpgMatchId)"
                  class="w-4 h-4"
                />
                <span class="flex-1 min-w-0">
                  <span class="block font-semibold text-white truncate">{{ fixture.title }}</span>
                  <span class="block text-slate-400">{{ formatDate(fixture.kickoff, timezone()) }} · {{ fixture.competition }}</span>
                </span>
                @if (fixture.eventId) {
                  <span class="text-emerald-400 font-semibold">Created</span>
                }
              </label>
            }
          }
        </div>

        @if (resultMessage()) {
          <p class="text-xs text-emerald-300">{{ resultMessage() }}</p>
        }

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-700/60">
          <button type="button" (click)="close()" class="px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-xs font-semibold cursor-pointer">
            Close
          </button>
          <button
            type="button"
            (click)="create()"
            [disabled]="isCreating() || !channelId() || selectedCount() === 0"
            class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
          >
            {{ isCreating() ? 'Creating…' : 'Create ' + selectedCount() + ' event' + (selectedCount() === 1 ? '' : 's') }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class FixtureEventsDialogComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly guildStore = inject(GuildStore);

  readonly closed = output<void>();
  readonly created = output<void>();

  readonly fixtures = signal<UpcomingFixture[]>([]);
  readonly selected = signal<Set<number>>(new Set());
  readonly isLoading = signal(true);
  readonly isCreating = signal(false);
  readonly error = signal<string | null>(null);
  readonly resultMessage = signal<string | null>(null);
  readonly formatDate = formatEventDate;

  readonly channels = computed(() => this.guildStore.activeGuild()?.channels ?? []);
  readonly timezone = computed(() => this.guildStore.activeGuild()?.defaultTimezone || 'Europe/Bucharest');
  readonly channelId = signal<string>('');
  readonly selectedCount = computed(
    () => this.fixtures().filter((f) => !f.eventId && this.selected().has(f.vpgMatchId)).length,
  );

  async ngOnInit(): Promise<void> {
    const guild = this.guildStore.activeGuild();
    this.channelId.set(
      guild?.settings?.defaultLineupChannelId || guild?.defaultLineupChannelId || guild?.settings?.defaultChannelId || '',
    );
    await this.load();
  }

  private async load(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const list = await this.api.getUpcomingFixtures(guildId);
      this.fixtures.set(list);
      this.selected.set(new Set(list.filter((f) => !f.eventId).map((f) => f.vpgMatchId)));
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Could not load fixtures from VPG.');
    } finally {
      this.isLoading.set(false);
    }
  }

  toggle(matchId: number): void {
    const next = new Set(this.selected());
    if (next.has(matchId)) next.delete(matchId);
    else next.add(matchId);
    this.selected.set(next);
  }

  close(): void {
    this.closed.emit();
  }

  async create(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId || !this.channelId()) return;
    const matchIds = this.fixtures().filter((f) => !f.eventId && this.selected().has(f.vpgMatchId)).map((f) => f.vpgMatchId);
    this.isCreating.set(true);
    try {
      const result = await this.api.createEventsFromFixtures(guildId, { channelId: this.channelId(), matchIds });
      this.resultMessage.set(
        `Created ${result.created.length} event${result.created.length === 1 ? '' : 's'}` +
          (result.skipped ? ` (${result.skipped} already existed).` : '.'),
      );
      this.created.emit();
      await this.load();
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Could not create events.');
    } finally {
      this.isCreating.set(false);
    }
  }
}
