import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ApiService, LineupDraft } from '../../core/api.service';
import { DraftCountsService } from '../../core/draft-counts.service';
import { SnackbarService } from '../../core/snackbar.service';
import { LINEUP_DRAFTS_STORAGE_KEY, LineupDraftRecord } from './lineup-page.component';

@Component({
  selector: 'app-lineup-drafts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="collection-page space-y-6">
      <header class="page-header">
        <div>
          <p class="eyebrow">Lineup <span>&rsaquo;</span> Drafts</p>
          <h1>Lineup drafts</h1>
          <p class="page-subtitle">Resume a saved lineup draft or start a new one.</p>
        </div>
        <button type="button" class="primary-action" (click)="createNew()">New lineup</button>
      </header>

      @if (!drafts().length) {
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="2"></rect>
              <path d="M3 10h18M8 3v4M16 3v4"></path>
            </svg>
          </div>
          <h2>No saved drafts yet</h2>
          <p>Start a lineup and use "Save as draft" to keep it here.</p>
          <button type="button" class="secondary-action" (click)="createNew()">Start a lineup</button>
        </div>
      } @else {
        <div class="wizard-panel space-y-3">
          @for (draft of drafts(); track draft.id) {
            <div class="review-item flex items-center justify-between gap-3">
              <div>
                <span>{{ draft.title || 'Untitled lineup' }}</span>
                <strong>{{ draft.formation }}</strong>
                <p>Saved {{ formatSavedAt(draft.updated_at) }}</p>
              </div>
              <div class="flex gap-2">
                <button type="button" class="secondary-action compact" (click)="resume(draft.id)">Resume</button>
                <button type="button" class="secondary-action compact danger-action" (click)="remove(draft.id)">Delete</button>
              </div>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class LineupDraftsPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);
  private readonly draftCounts = inject(DraftCountsService);
  protected readonly drafts = signal<LineupDraft[]>([]);

  async ngOnInit(): Promise<void> {
    await this.migrateLegacyDrafts();
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      this.drafts.set(await this.api.listLineupDrafts());
    } catch {
      this.snackbar.error('Failed to load lineup drafts.');
    }
  }

  protected resume(id: number): void {
    this.router.navigate(['/lineup'], { queryParams: { draftId: id } });
  }

  protected createNew(): void {
    this.router.navigate(['/lineup']);
  }

  protected async remove(id: number): Promise<void> {
    try {
      await this.api.deleteLineupDraft(id);
      this.drafts.update(items => items.filter(draft => draft.id !== id));
      void this.draftCounts.refresh();
    } catch {
      this.snackbar.error('Failed to delete lineup draft.');
    }
  }

  protected formatSavedAt(value: string): string {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }

  // One-time migration: move drafts that used to live in this browser's
  // localStorage into the database so they sync across devices.
  private async migrateLegacyDrafts(): Promise<void> {
    let legacy: LineupDraftRecord[];
    try {
      const raw = localStorage.getItem(LINEUP_DRAFTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      legacy = Array.isArray(parsed) ? parsed : [];
    } catch {
      return;
    }
    if (!legacy.length) {
      localStorage.removeItem(LINEUP_DRAFTS_STORAGE_KEY);
      return;
    }
    for (const record of legacy) {
      try {
        await this.api.saveLineupDraft({
          title: record.form.title || 'RYVL Match Lineup',
          channel_id: record.form.channelId || '',
          formation: record.form.formation || '4231',
          kickoff_at: record.form.kickoffDate && record.form.kickoffTime
            ? new Date(`${record.form.kickoffDate}T${record.form.kickoffTime}:00`).toISOString()
            : null,
          mention_role_ids: record.form.mentionRoleIds || [],
          assignments: record.assignedBySlot || {},
        });
      } catch {
        // Skip remaining migration on failure; the legacy key stays for a retry next visit.
        return;
      }
    }
    localStorage.removeItem(LINEUP_DRAFTS_STORAGE_KEY);
  }
}
