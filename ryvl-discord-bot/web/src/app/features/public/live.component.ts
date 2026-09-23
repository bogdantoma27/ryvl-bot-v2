import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { VpgMatchItem } from '../../core/models';
import { MatchesPanelComponent } from './matches-panel.component';
import { SOCIAL_LINKS, romanianMatchDate } from './presentation';
@Component({
  selector: 'app-public-live', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatchesPanelComponent],
  template: `
    <div class="public-page space-y-8">
      <header class="flex flex-col sm:flex-row sm:items-end justify-between gap-5 border-b border-white/10 pb-6"><div><p class="public-eyebrow">VPG Superliga România</p><h1 class="public-title">Match Center</h1><p class="public-intro">Today's fixtures and confirmed results, directly from VPG.</p></div><button type="button" class="public-button" (click)="refresh()" [disabled]="isLoading()">{{ isLoading() ? 'Refreshing…' : 'Refresh' }}</button></header>
      <div class="public-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><h2 class="text-base font-semibold text-white">Follow the team</h2><p class="text-sm text-slate-400 mt-1">Watch RYVL streams and catch up with the community.</p></div><div class="flex flex-wrap gap-2"><a [href]="social.twitch" target="_blank" rel="noopener noreferrer" class="social-brand-link public-button"><img src="/assets/brands/twitch.svg" class="social-brand-icon" width="24" height="24" alt="" aria-hidden="true" />Twitch ↗</a><a [href]="social.youtube" target="_blank" rel="noopener noreferrer" class="social-brand-link public-button"><img src="/assets/brands/youtube.svg" class="social-brand-icon" width="24" height="24" alt="" aria-hidden="true" />YouTube ↗</a><a [href]="social.discord" target="_blank" rel="noopener noreferrer" class="social-brand-link public-button"><img src="/assets/brands/discord.svg" class="social-brand-icon" width="24" height="24" alt="" aria-hidden="true" />Discord ↗</a></div></div>
      @if(error()) { <div class="public-error" role="alert">{{ error() }} <button type="button" class="underline ml-2" (click)="refresh()">Try again</button></div> }
      @if(isLoading() && !updatedAt()) { <div class="public-card p-10 text-slate-400" role="status">Loading today's matches…</div> } @else {
        <app-matches-panel [matches]="fixtures()" heading="Today's fixtures" emptyMessage="There are no scheduled matches today." />
        <app-matches-panel [matches]="results()" heading="Today's confirmed results" emptyMessage="No results have been confirmed for today yet." />
      }
      @if(updatedAt()) { <p class="text-xs text-slate-500" role="status">Last checked {{ dateLabel(updatedAt()!) }} · Europe/Bucharest · Refreshes every two minutes while this page is open.</p> }
    </div>
  `,
})
export class LiveComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroy = inject(DestroyRef);
  private disposed = false;
  readonly social = SOCIAL_LINKS;
  readonly results = signal<VpgMatchItem[]>([]);
  readonly fixtures = signal<VpgMatchItem[]>([]);
  readonly updatedAt = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly dateLabel = romanianMatchDate;
  ngOnInit(): void {
    void this.refresh();
    const timer = setInterval(() => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') void this.refresh(); }, 120000);
    this.destroy.onDestroy(() => { this.disposed = true; clearInterval(timer); });
  }
  async refresh(): Promise<void> {
    if (this.isLoading() || this.disposed) return;
    this.isLoading.set(true); this.error.set(null);
    try {
      const data = await this.api.getSuperligaToday();
      if (this.disposed) return;
      this.results.set(data.results); this.fixtures.set(data.fixtures); this.updatedAt.set(data.updatedAt);
    } catch { if (!this.disposed) this.error.set('VPG is temporarily unavailable. Previously loaded matches may be out of date.'); }
    finally { if (!this.disposed) this.isLoading.set(false); }
  }
}
