import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { LineupDraft } from '../../core/models';

@Component({
  selector: 'app-lineup-drafts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  template: `
    <div class="max-w-7xl w-full mx-auto space-y-6">
      <!-- Breadcrumb & Top Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-700/60 pb-4">
        <div>
          <nav class="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <a routerLink="/admin/lineup" class="hover:text-slate-200">Lineup</a>
            <span>/</span>
            <span class="text-[#EAE905] font-bold">Saved Drafts</span>
          </nav>
          <h1 class="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <svg class="w-6 h-6 text-[#EAE905]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>Saved Lineup Drafts</span>
          </h1>
          <p class="text-xs text-slate-400 mt-0.5">Manage previously prepared match formations and continue editing or publishing.</p>
        </div>

        <a
          routerLink="/admin/lineup"
          class="btn-yellow text-xs font-bold px-3.5 py-2 rounded-xl shadow-sm transition flex items-center gap-1.5 self-start sm:self-center"
          style="background-color: #EAE905 !important; color: #111111 !important;"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          <span style="color: #111111 !important;">Create New Lineup</span>
        </a>
      </div>

      <!-- Drafts Table / Grid -->
      <div class="bg-[#16213e] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        @if (isLoading()) {
          <div class="py-16 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <svg class="w-6 h-6 animate-spin text-[#EAE905]" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Loading lineup drafts...</span>
          </div>
        } @else if (drafts().length === 0) {
          <div class="py-16 text-center space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 class="text-sm font-bold text-white">No drafts saved yet</h3>
            <p class="text-xs text-slate-400 max-w-sm mx-auto">
              Build a custom formation on the visual pitch and click "Save Draft" to keep it here for later.
            </p>
            <a
              routerLink="/admin/lineup"
              class="inline-block mt-2 text-xs font-bold text-[#EAE905] hover:underline"
            >
              Start a new lineup &rarr;
            </a>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-300">
              <thead class="bg-[#11192e] text-[11px] text-slate-400 uppercase font-bold tracking-wider border-b border-slate-800">
                <tr>
                  <th class="py-3 px-4">Title</th>
                  <th class="py-3 px-4">Formation</th>
                  <th class="py-3 px-4">Kickoff</th>
                  <th class="py-3 px-4">Positions</th>
                  <th class="py-3 px-4">Last Updated</th>
                  <th class="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60">
                @for (draft of drafts(); track draft.id) {
                  <tr class="hover:bg-[#1f2e54]/50 transition">
                    <td class="py-3.5 px-4 font-bold text-white">
                      {{ draft.title }}
                    </td>
                    <td class="py-3.5 px-4">
                      <span class="px-2.5 py-1 rounded-md bg-slate-800 text-[#EAE905] font-bold border border-slate-700">
                        {{ draft.formation }}
                      </span>
                    </td>
                    <td class="py-3.5 px-4 text-slate-300">
                      {{ draft.kickoffAt ? (draft.kickoffAt | date: 'mediumDate') + ' ' + (draft.kickoffAt | date: 'shortTime') : 'Pending' }}
                    </td>
                    <td class="py-3.5 px-4 text-slate-400">
                      {{ getFilledSlotsCount(draft) }} / 11 filled
                    </td>
                    <td class="py-3.5 px-4 text-slate-400">
                      {{ draft.updatedAt | date: 'short' }}
                    </td>
                    <td class="py-3.5 px-4 text-right space-x-2">
                      <a
                        [routerLink]="['/admin/lineup']"
                        [queryParams]="{ draftId: draft.id }"
                        class="text-xs font-bold text-[#EAE905] hover:underline px-2.5 py-1 rounded hover:bg-slate-800 transition"
                      >
                        Edit
                      </a>
                      <button
                        type="button"
                        (click)="deleteDraft(draft.id)"
                        class="text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded hover:bg-rose-950/30 transition cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `,
})
export class LineupDraftsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly guildStore = inject(GuildStore);

  protected readonly drafts = signal<LineupDraft[]>([]);
  protected readonly isLoading = signal<boolean>(false);

  constructor() {
    effect(() => {
      const gid = this.guildStore.activeGuildId();
      if (gid) {
        this.loadDrafts(gid);
      } else {
        this.drafts.set([]);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    const gid = this.guildStore.activeGuildId();
    if (gid) {
      await this.loadDrafts(gid);
    }
  }

  async loadDrafts(guildId?: string): Promise<void> {
    const targetGuildId = guildId || this.guildStore.activeGuildId();
    if (!targetGuildId) return;

    this.isLoading.set(true);
    try {
      const items = await this.api.getLineupDrafts(targetGuildId);
      this.drafts.set(items);
    } catch (err) {
      console.error('Failed to load drafts:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  getFilledSlotsCount(draft: LineupDraft): number {
    if (!draft.assignments) return 0;
    const map =
      typeof draft.assignments === 'string'
        ? JSON.parse(draft.assignments)
        : draft.assignments;
    return Object.values(map || {}).filter((v) => Boolean(String(v || '').trim())).length;
  }

  async deleteDraft(draftId: string): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;

    if (!confirm('Are you sure you want to delete this lineup draft?')) {
      return;
    }

    try {
      await this.api.deleteLineupDraft(guildId, draftId);
      this.drafts.update((current) => current.filter((d) => d.id !== draftId));
    } catch (err) {
      console.error('Failed to delete draft:', err);
    }
  }
}
