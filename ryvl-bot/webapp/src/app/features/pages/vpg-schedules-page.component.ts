import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService, ChannelOption, VpgLeague, VpgSchedule } from '../../core/api.service';
import { SnackbarService } from '../../core/snackbar.service';

@Component({
  selector: 'app-vpg-schedules-page',
  imports: [DatePipe, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .schedule-grid { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 16px; }
    @media (min-width: 760px) { .schedule-grid { grid-template-columns: 1fr 1fr; } }
    .schedule-card { display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--app-border); border-radius: 10px; background: var(--app-surface); padding: 14px; }
    .schedule-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .schedule-card-header strong { color: var(--app-text); font-size: 15px; }
    .schedule-meta { color: var(--app-text-muted); font-size: 13px; }
    .schedule-error { color: #c94b4b; font-size: 12px; }
    .schedule-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: auto; padding-top: 4px; border-top: 1px solid var(--app-border); }
    .repeat-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 16px; }
  `],
  template: `
    <section class="collection-page space-y-6">
      <header class="page-header">
        <div>
          <p class="eyebrow">Workspace <span>&rsaquo;</span> League centre</p>
          <h1>Recurring schedules</h1>
          <p class="page-subtitle">Post fixtures, results, or standings on a recurring weekly schedule.</p>
        </div>
        <a class="secondary-action" routerLink="/vpg">League centre</a>
      </header>

      <div class="wizard-panel">
        <p class="wizard-kicker">{{ editingId() === null ? 'Create schedule' : 'Edit schedule' }}</p>
        <div class="manage-form-grid">
          <label class="field span-2"><span>League</span><select [(ngModel)]="form.league_slug"><option value="">Select a league</option>@for (league of leagues(); track league.community_slug + league.slug) {<option [value]="league.slug">{{ league.name }} ({{ league.community_name }})</option>}</select></label>
          <label class="field"><span>Content</span><select [(ngModel)]="form.content_type"><option value="fixtures">Fixtures</option><option value="results">Results</option><option value="standings">Standings</option></select></label>
          <label class="field"><span>Channel</span><select [(ngModel)]="form.channel_id"><option value="">Select a channel</option>@for (channel of channels(); track channel.id) {<option [value]="channel.id">#{{ channel.name }}</option>}</select></label>
          <label class="field"><span>Time</span><input #timeInput type="time" [(ngModel)]="form.post_time" (click)="openNativePicker(timeInput)"></label>
          <label class="field"><span>Timezone</span><input [(ngModel)]="form.timezone"></label>
        </div>
        <div class="repeat-row">
          <div class="field">
            <span>Repeat on</span>
            <div class="weekday-row">@for (day of days; track day.value) {<label class="day-choice"><input type="checkbox" [checked]="form.weekdays.includes(day.value)" (change)="toggleDay(day.value)"> {{ day.label }}</label>}</div>
          </div>
          <div class="action-row" style="margin-top: 0;">
            <button class="primary-action" type="button" (click)="save()" [disabled]="saving() || !form.league_slug || !form.channel_id">{{ saving() ? 'Saving...' : (editingId() === null ? 'Add schedule' : 'Save schedule') }}</button>
            @if (editingId() !== null) {<button class="secondary-action" type="button" (click)="cancelEdit()">Cancel edit</button>}
          </div>
        </div>
      </div>

      <div class="wizard-panel">
        <h2>Active schedules</h2>
        @if (!schedules().length) {
          <div class="empty-state">
            <div class="empty-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"></circle>
                <path d="M12 7v5l3 2"></path>
              </svg>
            </div>
            <h2>No schedules yet</h2>
            <p>Add a recurring VPG publication above.</p>
          </div>
        } @else {
          <div class="schedule-grid">
            @for (schedule of schedules(); track schedule.id) {
              <div class="schedule-card">
                <div class="schedule-card-header">
                  <strong>{{ schedule.league_name || schedule.league_slug }}</strong>
                  <button class="status-badge" [class.is-enabled]="schedule.enabled" type="button" (click)="toggle(schedule)">{{ schedule.enabled ? 'Enabled' : 'Paused' }}</button>
                </div>
                <div class="schedule-meta">{{ schedule.content_type }} · {{ schedule.post_time }} ({{ schedule.timezone }}) · {{ daySummary(schedule.weekdays) }}</div>
                <div class="schedule-meta">Channel: #{{ channelName(schedule.channel_id) }}</div>
                @if (schedule.last_run_at) {<div class="schedule-meta">Last run: {{ schedule.last_run_at | date:'medium' }}</div>}
                @if (schedule.last_error) {<div class="schedule-error">{{ schedule.last_error }}</div>}
                <div class="schedule-actions">
                  <button class="secondary-action compact" type="button" (click)="edit(schedule)">Edit</button>
                  <button class="secondary-action compact" type="button" (click)="runNow(schedule.id)">Run now</button>
                  <button class="danger-action" type="button" (click)="remove(schedule.id)">Delete</button>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </section>
  `,
})
export class VpgSchedulesPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(SnackbarService);
  readonly leagues = signal<VpgLeague[]>([]);
  readonly channels = signal<ChannelOption[]>([]);
  readonly schedules = signal<VpgSchedule[]>([]);
  readonly saving = signal(false);
  readonly editingId = signal<number | null>(null);
  form: { league_slug: string; league_name: string; content_type: VpgSchedule['content_type']; channel_id: string; weekdays: number[]; post_time: string; timezone: string; enabled: boolean } = { league_slug: '', league_name: '', content_type: 'fixtures', channel_id: '', weekdays: [0], post_time: '10:00', timezone: 'Europe/Bucharest', enabled: true };
  readonly days = [{ value: 0, label: 'Mon' }, { value: 1, label: 'Tue' }, { value: 2, label: 'Wed' }, { value: 3, label: 'Thu' }, { value: 4, label: 'Fri' }, { value: 5, label: 'Sat' }, { value: 6, label: 'Sun' }];

  ngOnInit(): void {
    this.api.listVpgLeagues().then(items => this.leagues.set(items)).catch(() => this.snackbar.error('Unable to load VPG leagues.'));
    this.api.getBootstrap().then(data => this.channels.set(data.channels)).catch(() => this.snackbar.error('Unable to load Discord channels.'));
    this.refresh();
  }

  refresh(): void { this.api.listVpgSchedules().then(items => this.schedules.set(items)).catch(() => this.snackbar.error('Unable to load VPG schedules.')); }
  openNativePicker(input: HTMLInputElement): void { input.showPicker?.(); }
  toggleDay(day: number): void { this.form.weekdays = this.form.weekdays.includes(day) ? this.form.weekdays.filter(value => value !== day) : [...this.form.weekdays, day].sort(); }

  save(): void {
    const league = this.leagues().find(item => item.slug === this.form.league_slug);
    this.form.league_name = league?.name || this.form.league_name;
    this.saving.set(true);
    const request = this.editingId() === null ? this.api.createVpgSchedule(this.form) : this.api.updateVpgSchedule(this.editingId()!, this.form);
    request.then(() => { this.refresh(); this.cancelEdit(); this.snackbar.success('VPG schedule saved.'); }).catch(() => this.snackbar.error('Unable to save the VPG schedule.')).finally(() => this.saving.set(false));
  }

  edit(schedule: VpgSchedule): void { this.editingId.set(schedule.id); this.form = { league_slug: schedule.league_slug, league_name: schedule.league_name, content_type: schedule.content_type, channel_id: schedule.channel_id, weekdays: [...schedule.weekdays], post_time: schedule.post_time, timezone: schedule.timezone, enabled: schedule.enabled }; }
  cancelEdit(): void { this.editingId.set(null); this.form = { league_slug: '', league_name: '', content_type: 'fixtures', channel_id: '', weekdays: [0], post_time: '10:00', timezone: 'Europe/Bucharest', enabled: true }; }
  remove(id: number): void { this.api.deleteVpgSchedule(id).then(() => { this.refresh(); this.snackbar.success('VPG schedule deleted.'); }).catch(() => this.snackbar.error('Unable to delete the VPG schedule.')); }
  runNow(id: number): void { this.api.runVpgSchedule(id).then(() => { this.refresh(); this.snackbar.success('VPG schedule posted.'); }).catch(() => this.snackbar.error('Unable to run the VPG schedule.')); }
  toggle(schedule: VpgSchedule): void { this.api.setVpgScheduleEnabled(schedule.id, !schedule.enabled).then(() => { this.refresh(); this.snackbar.success(`VPG schedule ${schedule.enabled ? 'paused' : 'enabled'}.`); }).catch(() => this.snackbar.error('Unable to update the VPG schedule.')); }
  channelName(id: string): string { return this.channels().find(channel => channel.id === id)?.name || id; }
  daySummary(days: number[]): string { return days.map(day => this.days[day]?.label).join(', '); }
}
