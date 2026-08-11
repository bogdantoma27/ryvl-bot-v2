import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService, ChannelOption, VpgCommunity, VpgLeague } from '../../core/api.service';
import { SnackbarService } from '../../core/snackbar.service';

type ViewMode = 'fixtures' | 'results' | 'standings';

@Component({
  selector: 'app-vpg-overview-page',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .vpg-preview { display: grid; gap: 12px; margin-top: 16px; }
    .vpg-preview img { max-width: 100%; max-height: 640px; object-fit: contain; border: 1px solid var(--app-border); border-radius: 8px; background: #07090e; margin: 0 auto; }
    .vpg-preview-empty { display: grid; place-items: center; text-align: center; min-height: 200px; gap: 10px; }
    .vpg-spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--app-border); border-top-color: #dba51d; animation: vpg-spin 0.8s linear infinite; margin: 0 auto; }
    @keyframes vpg-spin { to { transform: rotate(360deg); } }
    .channel-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 16px; }
  `],
  template: `
    <section class="collection-page space-y-6">
      <header class="page-header">
        <div>
          <p class="eyebrow">Workspace <span>&rsaquo;</span> League centre</p>
          <h1>League centre</h1>
          <p class="page-subtitle">Preview and post fixtures, results, and standings for the configured VPG communities.</p>
        </div>
        <div class="action-row">
          <a class="secondary-action" routerLink="/vpg/schedules">Schedules</a>
          <a class="secondary-action" routerLink="/vpg/transfers">Transfers</a>
        </div>
      </header>

      <div class="wizard-panel">
        <p class="wizard-kicker">Filters</p>
        <div class="manage-form-grid">
          <label class="field"><span>Quick shortcut</span><select [(ngModel)]="selectedCommunity" (ngModelChange)="filterLeagues()"><option value="">All leagues</option><option value="balkan">Balkan leagues</option><option value="elite">Elite leagues</option><option value="premier">Premier leagues</option><option value="romania">VPG Romania</option></select></label>
          <label class="field"><span>League</span><select [(ngModel)]="selectedSlug" (ngModelChange)="selectLeague($event)"><option value="">Select a league</option>@for (league of visibleLeagues(); track league.community_slug + league.slug) {<option [value]="league.slug">{{ league.name }} ({{ league.community_name }})</option>}</select></label>
          <label class="field"><span>Season</span><select [(ngModel)]="selectedSeason" (ngModelChange)="preview()" [disabled]="previewLoading()"><option [ngValue]="null">Latest</option>@for (season of seasons(); track season) {<option [ngValue]="season">{{ season }}</option>}</select></label>
          <label class="field"><span>Content</span><select [ngModel]="mode()" (ngModelChange)="setMode($event)" [disabled]="previewLoading()"><option value="fixtures">Fixtures</option><option value="results">Results</option><option value="standings">Standings</option></select></label>
        </div>
        <div class="channel-row">
          <label class="field"><span>Channel</span><select [(ngModel)]="postChannelId"><option value="">Select a channel</option>@for (channel of channels(); track channel.id) {<option [value]="channel.id">#{{ channel.name }}</option>}</select></label>
          <div class="action-row" style="margin-top: 0;">
            <button class="secondary-action" type="button" (click)="preview()" [disabled]="previewLoading() || !selectedSlug">{{ previewLoading() ? 'Rendering...' : 'Refresh preview' }}</button>
            <button class="primary-action" type="button" (click)="postNow()" [disabled]="previewLoading() || posting() || !selectedSlug || !postChannelId">{{ posting() ? 'Posting...' : 'Post now' }}</button>
          </div>
        </div>

        @if (!selectedSlug) {
          <div class="empty-state vpg-preview-empty"><h2>Select a league</h2><p>Choose a community shortcut and league to render a preview.</p></div>
        } @else if (previewLoading()) {
          <div class="empty-state vpg-preview-empty"><div class="vpg-spinner" aria-hidden="true"></div><h2>Rendering preview</h2><p>Generating the {{ mode() }} image for this league.</p></div>
        } @else if (previewError()) {
          <div class="empty-state vpg-preview-empty"><h2>Unable to render preview</h2><p>{{ previewError() }}</p></div>
        } @else if (previewUrl()) {
          <div class="vpg-preview"><img [src]="previewUrl()" alt="VPG Discord post preview" /></div>
        }
      </div>
    </section>
  `,
})
export class VpgOverviewPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(SnackbarService);
  readonly communities = signal<VpgCommunity[]>([]);
  readonly leagues = signal<VpgLeague[]>([]);
  readonly seasons = signal<number[]>([]);
  readonly channels = signal<ChannelOption[]>([]);
  readonly mode = signal<ViewMode>('fixtures');
  readonly loading = signal(false);
  readonly previewLoading = signal(false);
  readonly posting = signal(false);
  readonly previewUrl = signal('');
  readonly previewError = signal('');
  selectedCommunity = '';
  selectedSlug = '';
  selectedSeason: number | null = null;
  postChannelId = '';

  ngOnInit(): void {
    this.loading.set(true);
    Promise.all([this.api.getBootstrap(), this.api.listVpgCommunities(), this.api.listVpgLeagues()]).then(([bootstrap, communities, leagues]) => {
      this.channels.set(bootstrap.channels);
      this.communities.set(communities);
      this.leagues.set(leagues);
      if (leagues[0]) this.selectLeague(leagues[0].slug);
    }).catch(() => this.snackbar.error('Unable to load VPG communities and leagues.')).finally(() => this.loading.set(false));
  }

  visibleLeagues(): VpgLeague[] {
    return this.leagues().filter(league => {
      if (!this.selectedCommunity) return true;
      if (this.selectedCommunity === 'balkan') return league.community_slug === 'VPG-Balkan';
      if (this.selectedCommunity === 'elite') return league.community_slug === 'VPG-Europe' && league.name.toLowerCase().startsWith('elite');
      if (this.selectedCommunity === 'premier') return league.community_slug === 'VPG-Europe' && league.name.toLowerCase().includes('premier');
      if (this.selectedCommunity === 'romania') return league.community_slug === 'VPGRoPS5';
      return false;
    });
  }

  filterLeagues(): void {
    const current = this.visibleLeagues().find(league => league.slug === this.selectedSlug);
    if (!current) this.selectLeague('');
  }

  selectLeague(slug: string): void {
    this.selectedSlug = slug;
    this.selectedSeason = null;
    this.seasons.set([]);
    this.clearPreview();
    if (!slug) return;
    this.loading.set(true);
    this.api.listVpgSeasons(slug).then(items => { this.seasons.set(items); this.selectedSeason = items.at(-1) ?? null; this.preview(); }).catch(() => this.snackbar.error('Unable to load VPG seasons.')).finally(() => this.loading.set(false));
  }

  setMode(mode: ViewMode): void {
    this.mode.set(mode);
    this.preview();
  }

  preview(): void {
    if (!this.selectedSlug || this.selectedSeason === null || this.previewLoading()) return;
    this.previewLoading.set(true);
    this.previewError.set('');
    this.api.previewVpg({ league_slug: this.selectedSlug, content_type: this.mode(), season: this.selectedSeason }).then(blob => {
      const previous = this.previewUrl();
      this.previewUrl.set(URL.createObjectURL(blob));
      if (previous) URL.revokeObjectURL(previous);
    }).catch(() => {
      this.previewUrl.set('');
      this.previewError.set(`This league has no ${this.mode()} data for the selected season.`);
    }).finally(() => this.previewLoading.set(false));
  }

  postNow(): void {
    if (!this.selectedSlug || this.selectedSeason === null || !this.postChannelId || this.posting()) return;
    this.posting.set(true);
    this.api.postVpg({ league_slug: this.selectedSlug, content_type: this.mode(), season: this.selectedSeason, channel_id: this.postChannelId }).then(result => this.snackbar.success(`Posted to channel ${result.channel_id}.`)).catch(() => this.snackbar.error('Unable to post the VPG image.')).finally(() => this.posting.set(false));
  }

  private clearPreview(): void {
    const previous = this.previewUrl();
    this.previewUrl.set('');
    this.previewError.set('');
    if (previous) URL.revokeObjectURL(previous);
  }
}
