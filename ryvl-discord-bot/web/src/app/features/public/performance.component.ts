import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { RyvlPerformanceResponse } from '../../core/models';
import { MatchesPanelComponent } from './matches-panel.component';
import { StandingsPanelComponent } from './standings-panel.component';
type PerformanceTab = 'overview' | 'results' | 'fixtures' | 'standings';
@Component({
  selector: 'app-public-performance', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatchesPanelComponent, StandingsPanelComponent],
  template: `
    <div class="public-page space-y-8">
      <header class="flex flex-col lg:flex-row lg:items-end justify-between gap-5 border-b border-white/10 pb-6">
        <div>
          <p class="public-eyebrow">RYVL Esports</p>
          <h1 class="public-title">Team performance</h1>
          <p class="public-intro">Results, fixtures and league progress from our VPG competitions.</p>
        </div>
        <button type="button" class="public-button" (click)="loadPerformance()" [disabled]="isLoading()">{{ isLoading() ? 'Refreshing…' : 'Refresh' }}</button>
      </header>
      <div class="flex flex-wrap gap-2" aria-label="Select a competition">
        @for (comp of competitions(); track comp.slug) {
          <button type="button" class="public-button" [class.public-button-active]="selectedCompSlug() === comp.slug" [attr.aria-pressed]="selectedCompSlug() === comp.slug" [disabled]="!comp.active" (click)="selectCompetition(comp.slug)">
            {{ comp.name }} @if(!comp.active) { <span class="ml-2 text-xs opacity-70">Coming soon</span> }
          </button>
        }
      </div>
      <div class="public-tabs" role="tablist" aria-label="Performance sections">
        @for (tab of tabs; track tab.id; let index = $index) {
          <button type="button" role="tab" class="public-tab" [id]="'performance-tab-' + tab.id" [attr.aria-selected]="selectedTab() === tab.id" [attr.aria-controls]="'performance-panel-' + tab.id" [attr.tabindex]="selectedTab() === tab.id ? 0 : -1" [class.public-tab-active]="selectedTab() === tab.id" (click)="selectedTab.set(tab.id)" (keydown)="onTabKey($event, index)">{{ tab.label }}</button>
        }
      </div>
      <section role="tabpanel" tabindex="0" [id]="'performance-panel-' + selectedTab()" [attr.aria-labelledby]="'performance-tab-' + selectedTab()" [attr.aria-busy]="isLoading()" class="space-y-6">
        @if(isLoading()) {
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="status" aria-label="Loading performance">
            @for (item of [1,2,3,4]; track item) { <div class="public-card h-36 animate-pulse bg-white/5"></div> }
          </div>
        } @else if(error()) {
          <div class="public-error" role="alert"><h2 class="font-semibold text-white">We could not load the competition</h2><p class="mt-2 text-sm">{{ error() }}</p><button type="button" class="public-button mt-4" (click)="loadPerformance()">Try again</button></div>
        } @else if(performanceData(); as data) {
          @if(data.warnings?.length) { <div class="public-notice" role="status">@for (warning of data.warnings || []; track warning) { <p>{{ warning }}</p> }</div> }
          @if(selectedTab() === 'overview') {
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div class="public-card p-5 sm:p-6"><p class="public-metric-label">Win rate</p><p class="public-metric-value ryvl-highlight">{{ statsUnavailable() ? '—' : data.stats.winRate + '%' }}</p><p class="mt-2 text-xs text-slate-400">Across {{ data.stats.played }} completed matches</p></div>
              <div class="public-card p-5 sm:p-6"><p class="public-metric-label">Match record</p><p class="public-metric-value text-xl sm:text-2xl">{{ statsUnavailable() ? '—' : data.stats.wins + ' / ' + data.stats.draws + ' / ' + data.stats.losses }}</p><p class="mt-2 text-xs text-slate-400">Wins / draws / losses</p></div>
              <div class="public-card p-5 sm:p-6"><p class="public-metric-label">Goals scored</p><p class="public-metric-value">{{ statsUnavailable() ? '—' : data.stats.goalsFor }}</p><p class="mt-2 text-xs text-slate-400">{{ data.stats.goalsPerMatch }} per match</p></div>
              <div class="public-card p-5 sm:p-6"><p class="public-metric-label">League position</p><p class="public-metric-value ryvl-highlight">{{ data.stats.standingsPosition ? '#' + data.stats.standingsPosition : '—' }}</p><p class="mt-2 text-xs text-slate-400">{{ data.stats.competitionName }}</p></div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section class="public-card p-6 space-y-4"><h2 class="font-semibold text-white">Recent form</h2><div class="flex flex-wrap items-center gap-2">@for (result of data.stats.currentStreak; track $index) { <span class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-semibold" [class.text-emerald-400]="result === 'W'" [class.text-rose-400]="result === 'L'" [attr.aria-label]="result === 'W' ? 'Win' : result === 'L' ? 'Loss' : 'Draw'">{{ result }}</span> } @if(!data.stats.currentStreak.length) { <span class="text-sm text-slate-400">No completed matches yet.</span> }</div><p class="text-xs text-slate-400">Newest result first</p></section>
              <section class="public-card p-6 space-y-4"><h2 class="font-semibold text-white">Home and away</h2><dl class="grid grid-cols-2 gap-4 text-sm"><div><dt class="text-slate-400 mb-2">Home</dt><dd>{{ data.stats.homeRecord.wins }} W · {{ data.stats.homeRecord.draws }} D · {{ data.stats.homeRecord.losses }} L</dd></div><div><dt class="text-slate-400 mb-2">Away</dt><dd>{{ data.stats.awayRecord.wins }} W · {{ data.stats.awayRecord.draws }} D · {{ data.stats.awayRecord.losses }} L</dd></div></dl><p class="text-xs text-slate-400">{{ data.stats.cleanSheets }} clean sheets · {{ data.stats.goalsAgainst }} goals conceded</p></section>
            </div>
            <app-matches-panel [matches]="data.upcomingFixtures.slice(0, 4)" heading="Next RYVL fixtures" emptyMessage="No upcoming RYVL fixtures have been announced." />
            <app-matches-panel [matches]="data.recentResults.slice(0, 4)" heading="Recent RYVL results" emptyMessage="No RYVL results have been published yet." />
          } @else if(selectedTab() === 'results') {
            <app-matches-panel [matches]="data.recentResults" heading="RYVL match results" emptyMessage="No completed RYVL matches in this competition yet." />
          } @else if(selectedTab() === 'fixtures') {
            <app-matches-panel [matches]="data.upcomingFixtures" heading="RYVL fixtures" emptyMessage="No upcoming RYVL fixtures in this competition yet." />
          } @else {
            <app-standings-panel [rows]="data.standings || []" />
          }
        }
      </section>
    </div>
  `,
})
export class PerformanceComponent implements OnInit {
  private readonly api = inject(ApiService);
  private requestId = 0;
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);
  readonly performanceData = signal<RyvlPerformanceResponse | null>(null);
  readonly selectedCompSlug = signal('Superliga-Romania');
  readonly selectedTab = signal<PerformanceTab>('overview');
  readonly competitions = computed(() => this.performanceData()?.competitions || []);
  readonly statsUnavailable = computed(() => this.performanceData()?.warnings?.some(w => w.startsWith('Completed matches')) || false);
  readonly tabs: readonly { id: PerformanceTab; label: string }[] = [
    { id: 'overview', label: 'Overview' }, { id: 'results', label: 'Match Results' },
    { id: 'fixtures', label: 'Fixtures' }, { id: 'standings', label: 'League Table' },
  ];
  ngOnInit(): void { void this.loadPerformance(); }
  selectCompetition(slug: string): void { this.selectedCompSlug.set(slug); void this.loadPerformance(); }
  onTabKey(event: KeyboardEvent, index: number): void {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % this.tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + this.tabs.length - 1) % this.tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.tabs.length - 1;
    else return;
    event.preventDefault();
    this.selectedTab.set(this.tabs[next].id);
    (event.currentTarget as HTMLElement | null)?.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
  async loadPerformance(): Promise<void> {
    const request = ++this.requestId;
    this.isLoading.set(true); this.error.set(null);
    try {
      const response = await this.api.getRyvlPerformance(this.selectedCompSlug());
      if (request !== this.requestId) return;
      this.performanceData.set(response);
      this.selectedCompSlug.set(response.activeCompetition);
    } catch {
      if (request === this.requestId) this.error.set('The VPG data service is temporarily unavailable. Please try again.');
    } finally { if (request === this.requestId) this.isLoading.set(false); }
  }
}
