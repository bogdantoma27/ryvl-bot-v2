from pathlib import Path
import re
W = Path('ryvl-discord-bot/web')
def put(name, content):
    p=W/name; p.parent.mkdir(parents=True,exist_ok=True); p.write_text(content.lstrip('\n'),encoding='utf-8')

put('src/app/features/public/presentation.ts', r'''
/** One source for community links, shared by all public pages. */
export const SOCIAL_LINKS = {
  discord: 'https://discord.gg/nEvvHvqZQX',
  twitch: 'https://twitch.tv/ryvlesports',
  youtube: 'https://www.youtube.com/@ryvlesports',
} as const;
export function isRyvlName(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
  return name === 'ryvl' || name === 'ryvl esports';
}
export function romanianMatchDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date to be confirmed';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bucharest', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
}
''')

put('src/app/features/public/matches-panel.component.ts', r'''
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { VpgMatchItem } from '../../core/models';
import { isRyvlName, romanianMatchDate } from './presentation';

@Component({
  selector: 'app-matches-panel', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4" [attr.aria-label]="heading()">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-xl font-semibold text-white">{{ heading() }}</h2>
        <span class="text-xs text-slate-400">Kickoff times: Romania</span>
      </div>
      @if(matches().length === 0) {
        <div class="public-empty" role="status">
          <p class="font-medium text-slate-200">{{ emptyMessage() }}</p>
          <p class="mt-1 text-sm text-slate-400">This section updates when VPG publishes new information.</p>
        </div>
      } @else {
        <div class="space-y-3">
          @for(match of matches(); track match.id) {
            <article class="public-card p-4 sm:p-5" [attr.aria-label]="match.homeName + ' versus ' + match.awayName">
              <div class="flex flex-wrap justify-between gap-2 text-xs text-slate-400 mb-3">
                <span>Matchday {{ match.matchDay || '—' }}</span>
                <time [attr.datetime]="match.datetime">{{ dateLabel(match.datetime) }}</time>
              </div>
              <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
                <div class="flex items-center gap-2 min-w-0">
                  @if(match.homeLogoUrl) { <img [src]="match.homeLogoUrl" alt="" loading="lazy" class="h-7 w-7 sm:h-9 sm:w-9 object-contain shrink-0" /> }
                  <span class="text-sm font-semibold break-words" [class.ryvl-highlight]="isRyvl(match.homeName)">{{ match.homeName }}</span>
                </div>
                <div class="text-center shrink-0">
                  @if(match.status === 'complete') {
                    <span class="inline-block rounded-lg bg-black/40 border border-white/10 px-3 py-1.5 font-semibold tabular-nums text-white">{{ match.homeScore ?? '—' }} : {{ match.awayScore ?? '—' }}</span>
                    <span class="block mt-1 text-[11px] text-emerald-400">Final</span>
                  } @else { <span class="px-2 text-xs font-medium text-slate-400">VS</span> }
                </div>
                <div class="flex items-center justify-end gap-2 min-w-0 text-right">
                  <span class="text-sm font-semibold break-words" [class.ryvl-highlight]="isRyvl(match.awayName)">{{ match.awayName }}</span>
                  @if(match.awayLogoUrl) { <img [src]="match.awayLogoUrl" alt="" loading="lazy" class="h-7 w-7 sm:h-9 sm:w-9 object-contain shrink-0" /> }
                </div>
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
})
export class MatchesPanelComponent {
  readonly matches = input<readonly VpgMatchItem[]>([]);
  readonly heading = input('Match results');
  readonly emptyMessage = input('No matches to show yet.');
  readonly isRyvl = isRyvlName;
  readonly dateLabel = romanianMatchDate;
}
''')

put('src/app/features/public/standings-panel.component.ts', r'''
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { VpgStandingsRow } from '../../core/models';
import { isRyvlName } from './presentation';
@Component({
  selector: 'app-standings-panel', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4" aria-label="League standings">
      <h2 class="text-xl font-semibold text-white">League table</h2>
      @if(rows().length === 0) {
        <div class="public-empty" role="status">The league table is not available yet.</div>
      } @else {
        <div class="public-card overflow-x-auto" tabindex="0" role="region" aria-label="League table; scroll horizontally on smaller screens">
          <table class="w-full min-w-[620px] text-sm text-left tabular-nums">
            <caption class="sr-only">Competition standings. RYVL Esports is highlighted.</caption>
            <thead class="text-xs text-slate-400 bg-white/[0.025]">
              <tr><th scope="col" class="p-4">Pos</th><th scope="col" class="p-4">Team</th><th scope="col" class="p-3">P</th><th scope="col" class="p-3">W</th><th scope="col" class="p-3">D</th><th scope="col" class="p-3">L</th><th scope="col" class="p-3">GF</th><th scope="col" class="p-3">GA</th><th scope="col" class="p-3">GD</th><th scope="col" class="p-4">Pts</th></tr>
            </thead>
            <tbody>
              @for(row of rows(); track row.teamSlug || row.teamName) {
                <tr class="border-t border-white/[0.06]" [class.bg-yellow-400/5]="isRyvl(row.teamName)">
                  <td class="p-4 text-slate-400">{{ row.position }}</td>
                  <th scope="row" class="p-4 font-semibold" [class.ryvl-highlight]="isRyvl(row.teamName)">
                    <span class="flex items-center gap-2">@if(row.teamLogoUrl) { <img [src]="row.teamLogoUrl" loading="lazy" alt="" class="h-6 w-6 object-contain" /> } {{ row.teamName }}</span>
                  </th>
                  <td class="p-3">{{ row.played }}</td><td class="p-3">{{ row.wins }}</td><td class="p-3">{{ row.draws }}</td><td class="p-3">{{ row.losses }}</td><td class="p-3">{{ row.scoreFor }}</td><td class="p-3">{{ row.scoreAgainst }}</td><td class="p-3">{{ row.goalDifference > 0 ? '+' : '' }}{{ row.goalDifference }}</td><td class="p-4 font-bold text-white">{{ row.points }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class StandingsPanelComponent {
  readonly rows = input<readonly VpgStandingsRow[]>([]);
  readonly isRyvl = isRyvlName;
}
''')

put('src/app/features/public/performance.component.ts', r'''
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
        @for(comp of competitions(); track comp.slug) {
          <button type="button" class="public-button" [class.public-button-active]="selectedCompSlug() === comp.slug" [attr.aria-pressed]="selectedCompSlug() === comp.slug" [disabled]="!comp.active" (click)="selectCompetition(comp.slug)">
            {{ comp.name }} @if(!comp.active) { <span class="ml-2 text-xs opacity-70">Coming soon</span> }
          </button>
        }
      </div>
      <div class="public-tabs" role="tablist" aria-label="Performance sections">
        @for(tab of tabs; track tab.id; let index = $index) {
          <button type="button" role="tab" class="public-tab" [id]="'performance-tab-' + tab.id" [attr.aria-selected]="selectedTab() === tab.id" [attr.aria-controls]="'performance-panel-' + tab.id" [attr.tabindex]="selectedTab() === tab.id ? 0 : -1" [class.public-tab-active]="selectedTab() === tab.id" (click)="selectedTab.set(tab.id)" (keydown)="onTabKey($event, index)">{{ tab.label }}</button>
        }
      </div>
      <section role="tabpanel" tabindex="0" [id]="'performance-panel-' + selectedTab()" [attr.aria-labelledby]="'performance-tab-' + selectedTab()" [attr.aria-busy]="isLoading()" class="space-y-6">
        @if(isLoading()) {
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="status" aria-label="Loading performance">
            @for(item of [1,2,3,4]; track item) { <div class="public-card h-36 animate-pulse bg-white/5"></div> }
          </div>
        } @else if(error()) {
          <div class="public-error" role="alert"><h2 class="font-semibold text-white">We could not load the competition</h2><p class="mt-2 text-sm">{{ error() }}</p><button type="button" class="public-button mt-4" (click)="loadPerformance()">Try again</button></div>
        } @else if(performanceData(); as data) {
          @if(data.warnings?.length) { <div class="public-notice" role="status">@for(warning of data.warnings || []; track warning) { <p>{{ warning }}</p> }</div> }
          @if(selectedTab() === 'overview') {
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div class="public-card p-5 sm:p-6"><p class="public-metric-label">Win rate</p><p class="public-metric-value ryvl-highlight">{{ statsUnavailable() ? '—' : data.stats.winRate + '%' }}</p><p class="mt-2 text-xs text-slate-400">Across {{ data.stats.played }} completed matches</p></div>
              <div class="public-card p-5 sm:p-6"><p class="public-metric-label">Match record</p><p class="public-metric-value text-xl sm:text-2xl">{{ statsUnavailable() ? '—' : data.stats.wins + ' / ' + data.stats.draws + ' / ' + data.stats.losses }}</p><p class="mt-2 text-xs text-slate-400">Wins / draws / losses</p></div>
              <div class="public-card p-5 sm:p-6"><p class="public-metric-label">Goals scored</p><p class="public-metric-value">{{ statsUnavailable() ? '—' : data.stats.goalsFor }}</p><p class="mt-2 text-xs text-slate-400">{{ data.stats.goalsPerMatch }} per match</p></div>
              <div class="public-card p-5 sm:p-6"><p class="public-metric-label">League position</p><p class="public-metric-value ryvl-highlight">{{ data.stats.standingsPosition ? '#' + data.stats.standingsPosition : '—' }}</p><p class="mt-2 text-xs text-slate-400">{{ data.stats.competitionName }}</p></div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section class="public-card p-6 space-y-4"><h2 class="font-semibold text-white">Recent form</h2><div class="flex flex-wrap items-center gap-2">@for(result of data.stats.currentStreak; track $index) { <span class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-semibold" [class.text-emerald-400]="result === 'W'" [class.text-rose-400]="result === 'L'" [attr.aria-label]="result === 'W' ? 'Win' : result === 'L' ? 'Loss' : 'Draw'">{{ result }}</span> } @if(!data.stats.currentStreak.length) { <span class="text-sm text-slate-400">No completed matches yet.</span> }</div><p class="text-xs text-slate-400">Newest result first</p></section>
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
''')

put('src/app/features/public/public-shell.component.ts', r'''
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { SOCIAL_LINKS } from './presentation';
@Component({
  selector: 'app-public-shell', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="public-site min-h-screen bg-[#080808] text-slate-200 flex flex-col font-sans selection:bg-[#EAE905] selection:text-black">
      <a href="#main-content" class="public-skip-link">Skip to content</a>
      <header class="sticky top-0 z-50 bg-[#080808]/95 backdrop-blur-md border-b border-white/10">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[76px] flex items-center justify-between gap-5">
          <a routerLink="/" class="flex items-center gap-3 shrink-0" aria-label="RYVL Esports home"><img src="/assets/branding/ryvl-mark.png" alt="" class="h-10 w-auto object-contain" /><span class="text-xl font-bold tracking-wide text-white">RYVL</span></a>
          <nav class="hidden xl:flex items-center gap-1" aria-label="Main navigation">
            @for(item of navigation; track item.path) {
              <a [routerLink]="item.path" routerLinkActive="public-nav-active" [routerLinkActiveOptions]="{ exact: item.path === '/' }" ariaCurrentWhenActive="page" class="public-nav-link">{{ item.label }}</a>
            }
          </nav>
          <div class="hidden xl:flex items-center gap-2 shrink-0"><a [href]="social.discord" target="_blank" rel="noopener noreferrer" class="public-button">Discord</a><a routerLink="/admin/dashboard" class="text-xs text-slate-400 hover:text-white px-2 py-2">Admin</a></div>
          <button type="button" class="xl:hidden public-button" (click)="mobileNavOpen.set(!mobileNavOpen())" [attr.aria-expanded]="mobileNavOpen()" aria-controls="public-mobile-navigation" aria-label="Toggle navigation">{{ mobileNavOpen() ? 'Close' : 'Menu' }}</button>
        </div>
        @if(mobileNavOpen()) {
          <nav id="public-mobile-navigation" class="xl:hidden border-t border-white/10 px-4 py-4 grid gap-1" aria-label="Mobile navigation">
            @for(item of navigation; track item.path) {
              <a [routerLink]="item.path" routerLinkActive="public-nav-active" [routerLinkActiveOptions]="{ exact: item.path === '/' }" ariaCurrentWhenActive="page" (click)="mobileNavOpen.set(false)" class="public-nav-link">{{ item.label }}</a>
            }
            <div class="flex gap-3 pt-3 mt-2 border-t border-white/10"><a [href]="social.discord" target="_blank" rel="noopener noreferrer" class="public-button">Join Discord</a><a routerLink="/admin/dashboard" class="public-button" (click)="mobileNavOpen.set(false)">Admin</a></div>
          </nav>
        }
      </header>
      <main id="main-content" tabindex="-1" class="flex-1 w-full min-w-0"><router-outlet /></main>
      <footer class="border-t border-white/10 bg-[#060606] mt-12">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] gap-9">
            <div class="space-y-4"><a routerLink="/" class="inline-flex items-center gap-3"><img src="/assets/branding/ryvl-mark.png" alt="" class="h-9 w-auto" /><span class="text-xl font-bold text-white">RYVL Esports</span></a><p class="text-sm text-slate-400 max-w-sm leading-relaxed">EA SPORTS FC Pro Clubs. Team performance, competition updates and a community built around the game.</p><p class="text-xs tracking-wider text-slate-500">#WERYVL</p></div>
            <div><h2 class="font-semibold text-sm text-white mb-4">Explore</h2><div class="grid gap-2.5 text-sm text-slate-400"><a routerLink="/performance" class="hover:text-white">Team performance</a><a routerLink="/match-center" class="hover:text-white">Match Center</a><a routerLink="/club" class="hover:text-white">Club tracker</a><a routerLink="/transfers" class="hover:text-white">VPG Romania transfers</a><a routerLink="/recruitment" class="hover:text-white">Join the team</a><a routerLink="/contact" class="hover:text-white">Contact</a></div></div>
            <div><h2 class="font-semibold text-sm text-white mb-4">Follow RYVL</h2><div class="grid gap-2.5 text-sm text-slate-400"><a [href]="social.discord" target="_blank" rel="noopener noreferrer" class="hover:text-white">Discord ↗</a><a [href]="social.twitch" target="_blank" rel="noopener noreferrer" class="hover:text-white">Twitch ↗</a><a [href]="social.youtube" target="_blank" rel="noopener noreferrer" class="hover:text-white">YouTube ↗</a><a href="https://virtualprogaming.com" target="_blank" rel="noopener noreferrer" class="hover:text-white">Virtual Pro Gaming ↗</a></div></div>
          </div>
          <div class="mt-10 pt-6 border-t border-white/10 flex flex-col lg:flex-row justify-between gap-4 text-xs text-slate-500"><p>© {{ year }} RYVL Esports. Powered by Virtual Pro Gaming &amp; RYVL</p><div class="flex flex-wrap gap-5"><a routerLink="/privacy" class="hover:text-white">Privacy Policy</a><a routerLink="/terms" class="hover:text-white">Terms of Service</a><a routerLink="/admin/dashboard" class="hover:text-white">Staff login</a></div></div>
        </div>
      </footer>
    </div>
  `,
})
export class PublicShellComponent {
  readonly mobileNavOpen = signal(false);
  readonly social = SOCIAL_LINKS;
  readonly year = new Date().getFullYear();
  readonly navigation = [
    { path: '/', label: 'Home' }, { path: '/team', label: 'Team' },
    { path: '/performance', label: 'Performance' }, { path: '/match-center', label: 'Match Center' },
    { path: '/recruitment', label: 'Recruitment' }, { path: '/about', label: 'About' }, { path: '/contact', label: 'Contact' },
  ];
  constructor() { inject(Router).events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.mobileNavOpen.set(false)); }
}
''')

put('src/app/features/public/live.component.ts', r'''
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
      <div class="public-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><h2 class="text-base font-semibold text-white">Follow the team</h2><p class="text-sm text-slate-400 mt-1">Watch RYVL streams and catch up with the community.</p></div><div class="flex flex-wrap gap-2"><a [href]="social.twitch" target="_blank" rel="noopener noreferrer" class="public-button">Twitch ↗</a><a [href]="social.youtube" target="_blank" rel="noopener noreferrer" class="public-button">YouTube ↗</a><a [href]="social.discord" target="_blank" rel="noopener noreferrer" class="public-button">Discord ↗</a></div></div>
      @if(error()) { <div class="public-error" role="alert">{{ error() }} <button type="button" class="underline ml-2" (click)="refresh()">Try again</button></div> }
      @if(isLoading() && !updatedAt()) { <div class="public-card p-10 text-slate-400" role="status">Loading today's matches…</div> } @else {
        <app-matches-panel [matches]="fixtures()" heading="Today's fixtures" emptyMessage="There are no scheduled Superliga matches today." />
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
''')

put('src/app/features/public/legal.component.ts', r'''
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SOCIAL_LINKS } from './presentation';
@Component({
  selector: 'app-legal', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, imports: [RouterLink],
  template: `
    <article class="public-page max-w-3xl space-y-7">
      <header class="border-b border-white/10 pb-6"><p class="public-eyebrow">RYVL Esports</p><h1 class="public-title">{{ privacy ? 'Privacy Policy' : 'Terms of Service' }}</h1><p class="mt-3 text-xs text-slate-500">Last updated: 23 September 2026</p></header>
      @if(privacy) {
        <section class="legal-section"><h2>About this notice</h2><p>This notice describes information handled by the RYVL Esports website and its connected Discord bot. You can browse public match information without signing in. For questions about your information, use our <a routerLink="/contact">contact page</a> or contact the administrators through the <a [href]="social.discord" target="_blank" rel="noopener noreferrer">official Discord server</a>.</p></section>
        <section class="legal-section"><h2>Information used by the application</h2><p>Discord sign-in provides your account identifier, display name, avatar and server information needed for access to administration features. Event, RSVP and lineup features can store Discord identifiers, display names, attendance choices, channel settings and lineup content. Public VPG and EA integrations display information such as club names, player names, transfers, fixtures, standings and results.</p><p>Contact and recruitment forms send the details you enter to the Discord channels configured by the site administrators. Do not include passwords, payment details or other sensitive information in these forms.</p></section>
        <section class="legal-section"><h2>Browser storage and third-party requests</h2><p>When you sign in, the application stores an authentication token in your browser's local and session storage under <code>ryvl_token</code>. The current token expires after seven days; signing out removes the stored token. Public browsing does not require this token.</p><p>The site loads the Inter typeface from the font publisher's CDN and may request club images from VPG or EA image services. Those services receive the network information needed to answer the request, including your IP address. Opening Discord, Twitch, YouTube or VPG links takes you to services with their own privacy practices.</p></section>
        <section class="legal-section"><h2>Hosting, access and retention</h2><p>The application is hosted on an Oracle Cloud VM and uses a PostgreSQL database. Authorized site administrators manage application records and the configured Discord channels. Records and forwarded Discord messages do not currently have a universal automatic deletion schedule. Their retention depends on the feature and administrative management; requests for review or removal can be sent through the contact options above.</p><p>Infrastructure and external service providers can process operational logs and network information under their own terms. This site does not ask for your Discord password; authentication takes place on Discord.</p></section>
        <section class="legal-section"><h2>Questions, correction and removal</h2><p>Contact the administrators to ask about information relating to you, request a correction or request removal of application-held records. Include enough information to identify the relevant account or submission, but never send an authentication token. Data published by VPG or EA may also need to be corrected with the original provider.</p></section>
      } @else {
        <section class="legal-section"><h2>Using the website</h2><p>The RYVL Esports website provides team information, competition data and tools connected to its Discord community. Use the site and bot lawfully and respectfully. Do not attempt to bypass access controls, interfere with the service, submit spam, impersonate other people or upload content that you are not entitled to share.</p></section>
        <section class="legal-section"><h2>Accounts and administration</h2><p>Discord authentication identifies your account. Administration features are intended for authorized server staff. Keep your accounts and devices secure, and notify the administrators through the <a routerLink="/contact">contact page</a> if you notice unauthorized activity.</p></section>
        <section class="legal-section"><h2>Competition information</h2><p>Fixtures, transfers, standings and results are obtained from external VPG and EA integrations. They may be delayed, changed or temporarily unavailable. This website's display does not replace the organizer's official competition decisions or rules. Published kickoff times are presented in Europe/Bucharest unless stated otherwise.</p></section>
        <section class="legal-section"><h2>Submissions and community features</h2><p>Only submit contact, recruitment, lineup and event information that you have permission to provide. Recruitment submissions do not guarantee a place on the team. Administrators may moderate inappropriate content or restrict access to protect the community and service.</p></section>
        <section class="legal-section"><h2>Availability and external services</h2><p>Features may change, require maintenance or become unavailable. External links and integrations are operated by their respective providers and are subject to their own terms. RYVL does not control the availability of Discord, VPG, EA, Twitch or YouTube.</p></section>
        <section class="legal-section"><h2>Contact and updates</h2><p>Questions about these terms can be sent through the <a routerLink="/contact">contact page</a> or the <a [href]="social.discord" target="_blank" rel="noopener noreferrer">official Discord server</a>. This page will be updated when the website's features or operating practices change. See the <a routerLink="/privacy">Privacy Policy</a> for information about data handling.</p></section>
      }
    </article>
  `,
})
export class LegalComponent {
  readonly privacy = inject(ActivatedRoute).snapshot.data['kind'] === 'privacy';
  readonly social = SOCIAL_LINKS;
}
''')

# Add typed automation settings/API methods without changing existing admin channel selection.
p = W/'src/app/core/models.ts'
s = p.read_text().replace('export interface RyvlPerformanceResponse {', 'export interface RyvlPerformanceResponse {\n  standings?: VpgStandingsRow[];\n  season?: number;\n  warnings?: string[];')
s += r'''

export interface VpgNotificationSettings {
  pollIntervalSec: number;
  fixturesTime: string;
  resultsEnabled: boolean;
  ryvlResultsEnabled: boolean;
  fixturesEnabled: boolean;
  ryvlFixturesEnabled: boolean;
  standingsEnabled: boolean;
  ryvlStandingsEnabled: boolean;
}
export interface VpgNotificationResponse {
  config: VpgNotificationSettings & { lastPolledAt?: string | null; lastSuccessAt?: string | null; lastError?: string | null; retryAfter?: string | null };
  timezone: string;
  channels: Record<string, string | null | undefined>;
}
'''
p.write_text(s)
p=W/'src/app/core/api.service.ts';s=p.read_text()
s="import { VpgNotificationSettings, VpgNotificationResponse } from './models';\n"+s
pos=s.rfind('\n}')
assert pos!=-1
s=s[:pos]+r'''
  getSuperligaToday(): Promise<{ date: string; season: number; results: VpgMatchItem[]; fixtures: VpgMatchItem[]; updatedAt: string }> {
    return firstValueFrom(this.http.get<{ date: string; season: number; results: VpgMatchItem[]; fixtures: VpgMatchItem[]; updatedAt: string }>(`${this.baseUrl}/api/vpg/superliga/today`));
  }
  getVpgNotifications(guildId: string): Promise<VpgNotificationResponse> {
    return firstValueFrom(this.http.get<VpgNotificationResponse>(`${this.baseUrl}/api/guilds/${guildId}/vpg/notifications`, { headers: this.headers() }));
  }
  updateVpgNotifications(guildId: string, value: VpgNotificationSettings): Promise<VpgNotificationResponse> {
    return firstValueFrom(this.http.patch<VpgNotificationResponse>(`${this.baseUrl}/api/guilds/${guildId}/vpg/notifications`, value, { headers: this.headers() }));
  }
  checkVpgNotifications(guildId: string): Promise<{ postedCount: number; updatedCount?: number; busy?: boolean }> {
    return firstValueFrom(this.http.post<{ postedCount: number; updatedCount?: number; busy?: boolean }>(`${this.baseUrl}/api/guilds/${guildId}/vpg/notifications/check`, {}, { headers: this.headers() }));
  }
  repairClubLinks(guildId: string): Promise<{ updated: number; skipped: number; failed: number; inspected: number; limit: number }> {
    return firstValueFrom(this.http.post<{ updated: number; skipped: number; failed: number; inspected: number; limit: number }>(`${this.baseUrl}/api/guilds/${guildId}/vpg/notifications/repair-club-links`, {}, { headers: this.headers() }));
  }
'''+s[pos:]
# VpgMatchItem is normally already imported; ensure a new explicit import only if needed.
if not re.search(r'\bVpgMatchItem\b[\s\S]*?from [\'\"]\./models',s[:s.index('@Injectable')]):
    s="import { VpgMatchItem } from './models';\n"+s
p.write_text(s)

put('src/app/features/performance/vpg-notifications.component.ts', r'''
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
          @for(feed of feeds; track feed.key) {
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
    if (!guildId || guildId === 'default') return;
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
''')

p=W/'src/app/features/performance/admin-performance.component.ts';s=p.read_text()
s="import { VpgNotificationsComponent } from './vpg-notifications.component';\n"+s
s=s.replace('imports: [CommonModule, FormsModule, RouterLink]', 'imports: [CommonModule, FormsModule, RouterLink, VpgNotificationsComponent]')
s=s.replace('      <!-- Section 1: Multi-Competition Tracking Slots -->', '      <app-vpg-notifications />\n\n      <!-- Section 1: Multi-Competition Tracking Slots -->')
p.write_text(s)

# Preserve the home artwork and main layout; remove the obsolete slogan/stat blocks.
p=W/'src/app/features/public/home.component.ts';s=p.read_text()
s=re.sub(r'\s*<!-- Slogan Badge -->.*?(?=\s*<!-- Main Hero Headline -->)', '\n', s, flags=re.S)
s=re.sub(r'\s*<!-- Stats Bar Section -->.*?(?=\s*<!-- Latest Matches Teaser)', '\n', s, flags=re.S)
s=s.replace('min-h-[85vh]', 'min-h-[70vh]').replace('space-y-24 pb-20', 'space-y-16 pb-12')
s=s.replace('Official competitive organization dominating EA FC 11v11 Pro Clubs and premier Romanian esports circuits.', 'EA SPORTS FC 11v11 Pro Clubs, competitive teamwork and a community that keeps improving.')
s=s.replace("const res = await this.api.getSuperligaResults(undefined, 3);\n      this.recentMatches.set(res?.results || []);", "const res = await this.api.getRyvlPerformance();\n      this.recentMatches.set((res?.recentResults || []).slice(0, 3));")
s=s.replace('Recent Match Results', 'Recent RYVL Results').replace('No completed matches found for current Superliga season.', 'No completed RYVL matches have been published for this competition yet.')
p.write_text(s)

# Remove the two requested vanity metrics, including separators, without deleting the story/artwork.
p=W/'src/app/features/public/about.component.ts';s=p.read_text()
a=s.index('          <div class="flex items-center gap-6 pt-2">');b=s.index('\n        </div>',a)
s=s[:a]+s[b:];p.write_text(s)

# Replace outdated social URLs everywhere in the public site, using the shared source.
for p in (W/'src/app/features/public').glob('*.ts'):
    if p.name in ['presentation.ts','public-shell.component.ts','live.component.ts','legal.component.ts']: continue
    s=p.read_text()
    mapping={'https://discord.gg':'discord','https://twitch.tv':'twitch','https://www.youtube.com':'youtube'}
    touched=False
    for prefix,key in mapping.items():
        pattern=r'href="'+re.escape(prefix)+r'[^"\s]*"'
        s,n=re.subn(pattern, '[href]="social.'+key+'"',s)
        touched=touched or n>0
    if touched:
        s="import { SOCIAL_LINKS } from './presentation';\n"+s
        s=re.sub(r'(export class \w+[^\{]*\{)',r'\1\n  readonly social = SOCIAL_LINKS;',s,count=1)
    # Use exact RYVL aliases for highlighting; do not highlight unrelated Rival teams.
    if '/ryvl|rival/i' in s:
        s=s.replace('/ryvl|rival/i', '/^\\s*ryvl(?:\\s+esports)?\\s*$/i')
    s=s.replace('routerLink="/live"','routerLink="/match-center"').replace('routerLink="/competitions"','routerLink="/performance"')
    s=s.replace('Powered by Virtual Pro Gaming România', 'Powered by Virtual Pro Gaming &amp; RYVL')
    p.write_text(s)

p=W/'src/app/app.routes.ts';s=p.read_text()
s=re.sub(r"      \{\s*path: 'competitions',\s*loadComponent: \(\) =>\s*import\('./features/public/competitions.component'\).then\(\(m\) => m.CompetitionsComponent\),\s*\},", "      { path: 'competitions', pathMatch: 'full', redirectTo: 'performance' },", s)
s=s.replace("        path: 'live',", "        path: 'match-center',")
s=s.replace("    children: [", "    children: [\n      { path: 'live', pathMatch: 'full', redirectTo: 'match-center' },\n      { path: 'privacy', title: 'Privacy Policy | RYVL Esports', data: { kind: 'privacy' }, loadComponent: () => import('./features/public/legal.component').then(m => m.LegalComponent) },\n      { path: 'terms', title: 'Terms of Service | RYVL Esports', data: { kind: 'terms' }, loadComponent: () => import('./features/public/legal.component').then(m => m.LegalComponent) },",1)
p.write_text(s)
(W/'src/app/features/public/competitions.component.ts').unlink()

# Inter was previously named in CSS but never loaded; load it from the publisher, not a platform-specific fallback.
p=W/'src/index.html';s=p.read_text().replace('<title>Web</title>','<title>RYVL Esports</title>')
s=s.replace('</head>', '<meta name="description" content="RYVL Esports: team performance, VPG fixtures and results, club updates and community." />\n  <link rel="preconnect" href="https://rsms.me" />\n  <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />\n</head>')
p.write_text(s)
p=W/'src/styles.css';s=p.read_text()
s += r'''

/* Public-site refinement: keep the RYVL colours/artwork, improve rhythm and readability. */
@theme {
  --font-sans: 'InterVariable', 'Inter', ui-sans-serif, system-ui, sans-serif;
}
.public-site { font-family: var(--font-sans); font-feature-settings: 'cv11', 'ss01'; }
.public-site .font-mono { font-family: var(--font-sans); }
.public-site p { line-height: 1.7; }
.public-site .shadow-2xl { box-shadow: 0 8px 28px rgb(0 0 0 / 14%); }
.public-site .text-xs { font-size: .8125rem; }
.public-site :is(a, button, input, select, textarea, [tabindex]):focus-visible { outline: 2px solid #EAE905; outline-offset: 4px; }
.public-site button:disabled { cursor: not-allowed; opacity: .55; }
.public-page { width: 100%; max-width: 80rem; margin: 0 auto; padding: 2.5rem 1rem; }
.public-title { font-size: clamp(1.85rem, 4vw, 2.75rem); color: #fff; font-weight: 700; letter-spacing: -.035em; line-height: 1.2; }
.public-eyebrow { color: #EAE905; font-size: .75rem; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; margin-bottom: .65rem; }
.public-intro { color: #94a3b8; margin-top: .8rem; font-size: .9375rem; max-width: 42rem; }
.public-card { border: 1px solid rgb(255 255 255 / 9%); background: #101012; border-radius: 1rem; }
.public-empty { padding: 2rem 1.25rem; border: 1px dashed rgb(255 255 255 / 15%); border-radius: 1rem; text-align: center; color: #94a3b8; }
.public-error { padding: 1.5rem; border: 1px solid rgb(244 63 94 / 30%); background: rgb(244 63 94 / 6%); border-radius: 1rem; color: #fda4af; }
.public-notice { padding: 1rem 1.25rem; border: 1px solid rgb(250 204 21 / 25%); border-radius: .75rem; color: #fde68a; font-size: .875rem; }
.public-button { display: inline-flex; align-items: center; justify-content: center; min-height: 2.5rem; padding: .6rem 1rem; border: 1px solid rgb(255 255 255 / 14%); border-radius: .65rem; background: rgb(255 255 255 / 4%); color: #e2e8f0; font-size: .8125rem; font-weight: 500; transition: background-color .15s, border-color .15s; cursor: pointer; }
.public-button:hover { background: rgb(255 255 255 / 8%); border-color: rgb(255 255 255 / 25%); }
.public-button-active { background: #EAE905; border-color: #EAE905; color: #101012; font-weight: 650; }
.public-button-active:hover { background: #dedc05; }
.public-tabs { display: flex; gap: .3rem; overflow-x: auto; border-bottom: 1px solid rgb(255 255 255 / 12%); }
.public-tab { padding: .8rem 1rem; white-space: nowrap; font-size: .875rem; font-weight: 500; color: #94a3b8; border-bottom: 2px solid transparent; cursor: pointer; }
.public-tab:hover { color: #fff; }
.public-tab-active { color: #EAE905; border-color: #EAE905; }
.public-metric-label { font-size: .8125rem; color: #94a3b8; }
.public-metric-value { margin-top: .75rem; color: #fff; font-weight: 700; font-size: clamp(1.55rem, 3vw, 2.35rem); letter-spacing: -.035em; font-variant-numeric: tabular-nums; }
.ryvl-highlight { color: #EAE905 !important; }
.public-nav-link { display: block; padding: .65rem .75rem; border-radius: .5rem; color: #a9b1bf; font-size: .8125rem; font-weight: 500; transition: color .15s, background-color .15s; }
.public-nav-link:hover, .public-nav-active { color: #EAE905; background: rgb(234 233 5 / 6%); }
.public-skip-link { position: absolute; top: .5rem; left: 1rem; z-index: 100; transform: translateY(-200%); background: #EAE905; color: #000; padding: .7rem 1rem; border-radius: .5rem; }
.public-skip-link:focus { transform: translateY(0); }
.legal-section h2 { font-size: 1.125rem; font-weight: 600; color: #fff; margin-bottom: .75rem; }
.legal-section p { margin-top: .75rem; color: #a9b1bf; font-size: .9375rem; }
.legal-section a { color: #EAE905; text-decoration: underline; text-underline-offset: 3px; }
@media (min-width: 640px) { .public-page { padding: 3rem 1.5rem; } }
@media (min-width: 1024px) { .public-page { padding-left: 2rem; padding-right: 2rem; } }
@media (prefers-reduced-motion: reduce) { .public-site *, .public-site *::before, .public-site *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
'''
p.write_text(s)
print('Prepared public UX, real legal pages, inline tabs, social links and admin automation controls.')
