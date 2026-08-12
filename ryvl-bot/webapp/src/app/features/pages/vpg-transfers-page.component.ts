import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService, ChannelOption, VpgCommunity, VpgTransferFeed, VpgTransferRecord } from '../../core/api.service';
import { SnackbarService } from '../../core/snackbar.service';

@Component({
  selector: 'app-vpg-transfers-page',
  imports: [DatePipe, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; min-width: 0; max-width: 100%; overflow-x: clip; }
    .page-viewport { gap: 24px; }
    .transfer-preview { display: block; width: 100%; max-height: 320px; object-fit: contain; margin-top: 16px; border-radius: 8px; border: 1px solid var(--app-border); background: #07090e; }
    .transfer-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid var(--app-border); border-radius: 8px; background: var(--app-surface); padding: 12px 14px; flex-wrap: wrap; min-width: 0; }
    .transfer-row > * { min-width: 0; max-width: 100%; }
    .transfer-row > strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .transfer-move { color: var(--app-text-muted); overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .transfer-move strong { color: var(--app-text); }
    .polling-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; min-width: 0; margin-top: 16px; }
    .polling-toggle { display: inline-flex; align-items: center; min-width: 0; white-space: nowrap; }
    .polling-row > .action-row { min-width: 0; max-width: 100%; }
    .polling-row .action-row button { flex: 0 1 auto; }
    @media (max-width: 640px) {
      .polling-row { align-items: center; }
      .polling-row > .action-row { justify-content: flex-end; }
    }
    .status-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; border: 1px solid var(--app-border); border-radius: 10px; background: var(--app-surface); padding: 12px 16px; margin-bottom: 16px; }
    .status-card-copy { min-width: 0; }
    .status-card-copy p { margin: 2px 0 0; color: var(--app-text-muted); font-size: 13px; }
    .status-card-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    .page-viewport > .wizard-panel:first-of-type { flex: none; min-height: 0; overflow: visible; }
    .page-viewport > .transfers-columns { flex: 1; min-height: 320px; }
    .transfers-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: stretch; min-width: 0; }
    .transfers-columns > .wizard-panel { min-width: 0; display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    .panel-body { overflow-y: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; }
    @media (max-width: 900px) {
      .page-viewport > .transfers-columns { flex: none; min-height: 0; }
      .transfers-columns { grid-template-columns: 1fr; }
      .transfers-columns > .wizard-panel { height: auto; max-height: none; }
      .status-card { flex-direction: column; align-items: stretch; }
      .status-card-actions { justify-content: flex-end; }
    }
  `],
  template: `
    <section class="collection-page page-viewport">
      <header class="page-header">
        <div>
          <p class="eyebrow">Workspace <span>&rsaquo;</span> League centre</p>
          <h1>Transfer feed</h1>
          <p class="page-subtitle">Poll a VPG community for new transfers and post them to Discord.</p>
        </div>
        <a class="secondary-action" routerLink="/vpg">League centre</a>
      </header>

      <div class="wizard-panel">
        <p class="wizard-kicker">Feed settings</p>
        <div class="manage-form-grid">
          <label class="field"><span>Community</span><select [(ngModel)]="form.community_slug"><option value="">Select a community</option>@for (community of communities(); track community.slug) {<option [value]="community.slug">{{ community.name }}</option>}</select></label>
          <label class="field"><span>Channel</span><select [(ngModel)]="form.channel_id"><option value="">Select a channel</option>@for (channel of channels(); track channel.id) {<option [value]="channel.id">#{{ channel.name }}</option>}</select></label>
          <label class="field"><span>Poll interval (minutes)</span><input type="number" min="1" [(ngModel)]="form.poll_interval_minutes"></label>
          <label class="field"><span>Timezone</span><input [(ngModel)]="timezone"></label>
        </div>
        <div class="polling-row">
          <label class="switch polling-toggle"><input class="switch-input" type="checkbox" [(ngModel)]="form.enabled"><span class="switch-slider"></span>Enable automatic polling</label>
          <div class="action-row" style="margin-top: 0;">
            <button class="primary-action" type="button" (click)="save()" [disabled]="busy() || !form.community_slug || !form.channel_id">{{ busy() ? 'Saving...' : 'Save feed' }}</button>
            <button class="secondary-action" type="button" (click)="poll()" [disabled]="busy() || !form.community_slug || !form.channel_id">Poll now</button>
            <button class="secondary-action" type="button" (click)="preview()" [disabled]="busy()">Preview banner</button>
          </div>
        </div>
        @if (feed()?.last_error) {<p class="page-subtitle">{{ feed()?.last_error }}</p>}
        @if (previewUrl()) {<img class="transfer-preview" [src]="previewUrl()" alt="VPG transfer banner preview" />}
      </div>

      <div class="transfers-columns">
        <div class="wizard-panel">
          <h2>Active pollings</h2>
          <div class="panel-body">
            @if (feed()) {
              <div class="status-card">
                <div class="status-card-copy">
                  <span class="status-badge" [class.is-enabled]="feed()!.enabled">{{ feed()!.enabled ? 'Polling active' : 'Polling paused' }}</span>
                  <p>{{ communityName() }} &middot; #{{ channelName() }} &middot; every {{ feed()!.poll_interval_minutes }} min{{ feed()!.last_polled_at ? ' · Last poll: ' + (feed()!.last_polled_at | date:'medium') : '' }}</p>
                </div>
                <div class="status-card-actions">
                  <button class="secondary-action" type="button" (click)="toggleFeedEnabled()" [disabled]="busy()">{{ feed()!.enabled ? 'Pause' : 'Resume' }}</button>
                  <button class="secondary-action danger-action" type="button" (click)="deleteFeed()" [disabled]="busy()">Delete</button>
                </div>
              </div>
            } @else {
              <div class="empty-state card-empty">
                <div class="empty-icon">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M7 7h11M7 7l3-3M7 7l3 3M17 17H6M17 17l-3-3M17 17l-3 3"></path>
                  </svg>
                </div>
                <h2>No active polling</h2>
                <p>Configure and save a feed to start polling.</p>
              </div>
            }
          </div>
        </div>

        <div class="wizard-panel">
          <h2>Recent transfers</h2>
          <div class="panel-body">
            @if (!transfers().length) {
              <div class="empty-state card-empty">
                <div class="empty-icon">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M7 7h11M7 7l3-3M7 7l3 3M17 17H6M17 17l-3-3M17 17l-3 3"></path>
                  </svg>
                </div>
                <h2>No transfers recorded</h2>
                <p>Run a poll after configuring the feed.</p>
              </div>
            } @else {
              <div class="event-list">
                @for (row of transfers(); track row.id) {
                  <div class="transfer-row">
                    <strong>{{ row.username }}</strong>
                    <span class="transfer-move"><strong>{{ row.from_name || 'Free agent' }}</strong> &rarr; <strong>{{ row.to_name || 'Unknown team' }}</strong></span>
                    <small>{{ row.occurred_at ? (row.occurred_at | date:'medium') : 'Date pending' }}</small>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    </section>
  `,
})
export class VpgTransfersPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(SnackbarService);
  readonly communities = signal<VpgCommunity[]>([]);
  readonly channels = signal<ChannelOption[]>([]);
  readonly transfers = signal<VpgTransferRecord[]>([]);
  readonly feed = signal<VpgTransferFeed | null>(null);
  readonly previewUrl = signal('');
  readonly busy = signal(false);
  timezone = 'Europe/Bucharest';
  communitySlugs: string[] = [];
  form = { community_slug: '', channel_id: '', poll_interval_minutes: 20, enabled: false };

  ngOnInit(): void {
    Promise.all([this.api.getBootstrap(), this.api.listVpgCommunities(), this.api.getVpgSettings(), this.api.getVpgTransferFeed()]).then(([bootstrap, communities, settings, feed]) => {
      this.channels.set(bootstrap.channels);
      this.communities.set(communities);
      this.communitySlugs = settings.community_slugs;
      this.timezone = settings.timezone;
      this.form.community_slug = feed?.community_slug || settings.community_slug;
      if (feed) this.form = { ...this.form, ...feed };
      this.feed.set(feed);
    }).catch(() => this.snackbar.error('Unable to load transfer feed settings.'));
    this.refresh();
  }

  refresh(): void { this.api.listVpgTransfers().then(rows => this.transfers.set(rows)).catch(() => this.snackbar.error('Unable to load recent transfers.')); }

  channelName(): string { return this.channels().find(channel => channel.id === this.feed()?.channel_id)?.name || 'unknown channel'; }

  communityName(): string { return this.communities().find(community => community.slug === this.feed()?.community_slug)?.name || this.feed()?.community_slug || 'unknown community'; }

  toggleFeedEnabled(): void {
    const current = this.feed();
    if (!current) return;
    this.busy.set(true);
    const payload = { ...this.form, enabled: !current.enabled };
    this.api.updateVpgTransferFeed(payload).then(feed => {
      this.feed.set(feed);
      this.form.enabled = feed.enabled;
      this.snackbar.success(feed.enabled ? 'Automatic polling resumed.' : 'Automatic polling paused.');
    }).catch(() => this.snackbar.error('Unable to update the transfer feed.')).finally(() => this.busy.set(false));
  }

  deleteFeed(): void {
    if (!this.feed() || !confirm('Delete this transfer feed configuration? This cannot be undone.')) return;
    this.busy.set(true);
    this.api.deleteVpgTransferFeed().then(() => {
      this.feed.set(null);
      this.form = { community_slug: '', channel_id: '', poll_interval_minutes: 20, enabled: false };
      this.snackbar.success('Transfer feed deleted.');
    }).catch(() => this.snackbar.error('Unable to delete the transfer feed.')).finally(() => this.busy.set(false));
  }

  save(): void {
    this.busy.set(true);
    Promise.all([this.api.updateVpgTransferFeed(this.form), this.api.updateVpgSettings({ community_slug: this.form.community_slug, community_slugs: this.communitySlugs, timezone: this.timezone })]).then(([feed]) => { this.feed.set(feed); this.snackbar.success('VPG transfer feed saved.'); }).catch(() => this.snackbar.error('Unable to save VPG transfer feed.')).finally(() => this.busy.set(false));
  }

  poll(): void {
    if (!this.form.community_slug || !this.form.channel_id) return;
    this.busy.set(true);
    Promise.all([
      this.api.updateVpgTransferFeed(this.form),
      this.api.updateVpgSettings({ community_slug: this.form.community_slug, community_slugs: this.communitySlugs, timezone: this.timezone }),
    ]).then(([feed]) => {
      this.feed.set(feed);
      return this.api.pollVpgTransfers();
    }).then(result => {
      this.snackbar.success(`${result.posted} transfer(s) posted.`);
      this.refresh();
    }).catch(() => this.snackbar.error('Polling failed. Check the backend status.')).finally(() => this.busy.set(false));
  }

  preview(): void { this.busy.set(true); this.api.previewVpgTransfer(this.form.community_slug).then(blob => { const previous = this.previewUrl(); this.previewUrl.set(URL.createObjectURL(blob)); if (previous) URL.revokeObjectURL(previous); }).catch(() => this.snackbar.error('No transfer preview is available.')).finally(() => this.busy.set(false)); }
}
