import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { ApiService, ChannelOption, RoleOption } from '../../core/api.service';
import { SnackbarService } from '../../core/snackbar.service';
import { MultiSelectComponent } from '../../shared/multi-select.component';

const todayDateInput = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

type WizardStep = 1 | 2 | 3 | 4;

@Component({
  selector: 'app-event-wizard-page',
  imports: [FormsModule, MultiSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .wizard-layout { min-height: 0; }
    .wizard-layout > form { display: flex; flex-direction: column; height: auto; min-height: 0; }
    .wizard-layout > form > .wizard-panel { flex: none; height: auto; min-height: 0; overflow: visible; }
    .wizard-layout > form > .wizard-panel .grid { align-items: start; }
    .wizard-layout .stepper-circle { width: 40px; height: 40px; font-size: 16px; }
    .wizard-layout .stepper-item { gap: 16px; padding-bottom: 36px; }
    .wizard-layout .stepper-connector { left: 19px; top: 40px; }
    .wizard-layout .stepper-label { padding-top: 7px; font-size: 16px; }
    @media (max-width: 900px) {
      .wizard-layout > form > .wizard-panel { height: auto; min-height: 0; overflow: visible; }
      .wizard-layout .stepper-item { padding-bottom: 0; }
    }
  `],
  template: `
    <section class="collection-page page-viewport space-y-6">
      <header class="page-header">
        <div>
          <p class="eyebrow">Workspace <span>&rsaquo;</span> Events <span>&rsaquo;</span> Create</p>
          <h1>Create an event</h1>
          <p class="page-subtitle">Build a one-time or recurring Discord event, then review it before publishing.</p>
        </div>
      </header>

      <div class="wizard-layout">
        <nav class="stepper" aria-label="Event creation steps">
          @for (item of steps; track item.number) {
            <button type="button" class="stepper-item" [class.is-active]="step() === item.number" [class.is-done]="step() > item.number" (click)="goToStep(item.number)">
              <span class="stepper-connector"></span>
              <span class="stepper-circle">{{ step() > item.number ? '✓' : item.number }}</span>
              <span class="stepper-label">{{ item.title }}</span>
            </button>
          }
        </nav>

      <form class="space-y-5" (ngSubmit)="submit()">
        @if (step() === 1) {
          <section class="wizard-panel">
            <h2>Event details</h2>
            <div class="grid gap-4 md:grid-cols-2">
              <label class="field md:col-span-2"><span>Post channel</span><select [(ngModel)]="form.channel_id" name="channel_id" required><option value="">Select a channel</option>@for (channel of channels(); track channel.id) { <option [value]="channel.id">#{{ channel.name }}</option> }</select></label>
              <label class="field"><span>Title</span><input [(ngModel)]="form.title" name="title" required /></label>
              <label class="field"><span>Timezone</span><select [(ngModel)]="form.timezone" name="timezone"><option value="Europe/Bucharest">Europe/Bucharest</option><option value="Europe/London">Europe/London</option><option value="UTC">UTC</option></select></label>
              <label class="field md:col-span-2"><span>Description</span><textarea [(ngModel)]="form.description" name="description" rows="4"></textarea></label>
            </div>
          </section>
        }

        @if (step() === 2) {
          <section class="wizard-panel">
            <h2>Schedule and recurrence</h2>
            <div class="grid gap-4 md:grid-cols-2">
              <label class="field"><span>Kickoff date</span><input #kickoffDateInput type="date" [(ngModel)]="form.kickoff_date" name="kickoff_date" required (click)="openNativePicker(kickoffDateInput)" /></label>
              <label class="field"><span>Kickoff time</span><input #kickoffTimeInput type="time" [(ngModel)]="form.kickoff_time" name="kickoff_time" required (click)="openNativePicker(kickoffTimeInput)" /></label>
              <label class="switch md:col-span-2">
                <input type="checkbox" class="switch-input" [checked]="form.recurrence === 'weekly'" (change)="toggleRecurrence($any($event.target).checked)" />
                <span class="switch-slider"></span>
                <span>Repeat this event weekly</span>
              </label>
              @if (form.recurrence === 'weekly') {
                <label class="field"><span>Ends</span><select [(ngModel)]="form.ends_mode" name="ends_mode"><option value="never">Never</option><option value="after_count">After a number of weeks</option><option value="on_date">On a date</option></select></label>
                <div class="field md:col-span-2">
                  <span>Repeat on</span>
                  <div class="weekday-row">
                    @for (day of weekdays; track day.value) {
                      <label class="day-choice"><input type="checkbox" [checked]="form.weekdays.includes(day.value)" (change)="toggleWeekday(day.value)"> {{ day.label }}</label>
                    }
                  </div>
                </div>
                @if (form.ends_mode === 'after_count') { <label class="field"><span>Number of weeks</span><input type="number" min="1" max="52" [(ngModel)]="form.repeat_count" name="repeat_count" /></label> }
                @if (form.ends_mode === 'on_date') { <label class="field"><span>End date</span><input #endDateInput type="date" [(ngModel)]="form.end_date" name="end_date" (click)="openNativePicker(endDateInput)" /></label> }
              }
            </div>
          </section>
        }

        @if (step() === 3) {
          <section class="wizard-panel">
            <h2>Connections and posting</h2>
            <div class="grid gap-4 md:grid-cols-2">
              <label class="field md:col-span-2"><span>Post timing</span><select [(ngModel)]="form.post_timing_mode" name="post_timing_mode"><option value="at_event_start">When the event starts</option><option value="before_event_start">Before the event starts</option><option value="when_previous_event_ends">When the previous event ends</option><option value="after_previous_event_ends">After the previous event ends</option><option value="at_specific_time">At a specific time</option></select></label>
              @if (form.post_timing_mode === 'before_event_start' || form.post_timing_mode === 'after_previous_event_ends') { <label class="field"><span>Minutes</span><input type="number" min="0" max="10080" [(ngModel)]="form.post_timing_value" name="post_timing_value" /></label> }
              @if (form.post_timing_mode === 'at_specific_time') { <label class="field"><span>Weekly time</span><input placeholder="sun,18:00" [(ngModel)]="form.post_timing_value" name="specific_time" /></label> }
              <div class="field md:col-span-2">
                <span>Mention roles</span>
                <app-multi-select
                  [options]="roleOptions()"
                  [selected]="form.mention_role_ids"
                  placeholder="No mention roles selected"
                  emptyText="No Discord roles available."
                  (selectedChange)="onRolesChange($event)"
                />
              </div>
            </div>
          </section>
        }

        @if (step() === 4) {
          <section class="wizard-panel">
            <h2>Review and publish</h2>
            <div class="grid gap-3 md:grid-cols-2">
              <div class="review-item"><span>Event</span><strong>{{ form.title || 'Untitled event' }}</strong><p>{{ form.description || 'No description' }}</p></div>
              <div class="review-item"><span>Schedule</span><strong>{{ form.kickoff_date }} at {{ form.kickoff_time }}</strong><p>{{ form.timezone }} · {{ form.recurrence === 'weekly' ? 'Weekly' : 'One time' }}</p></div>
              <div class="review-item"><span>Posting</span><strong>{{ timingLabel() }}</strong><p>{{ form.post_timing_value || 'No additional offset' }}</p></div>
              <div class="review-item"><span>Destination</span><strong>#{{ channelName() }}</strong><p>{{ form.mention_role_ids.length }} role mentions</p></div>
            </div>
          </section>
        }

        <div class="flex flex-wrap items-center justify-between gap-3">
          <button type="button" class="wizard-secondary" [disabled]="step() === 1 || loading()" (click)="previous()">Back</button>
          <div class="flex gap-2">
            @if (step() === 4) { <button type="button" class="wizard-secondary" [disabled]="loading()" (click)="saveDraft()">Save draft</button> }
            @if (step() < 4) { <button type="button" class="wizard-primary" (click)="next()">Continue</button> } @else { <button type="submit" class="wizard-primary" [disabled]="loading()">{{ loading() ? 'Publishing...' : 'Publish event' }}</button> }
          </div>
        </div>
      </form>
      </div>
    </section>
  `,
})
export class EventWizardPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(SnackbarService);
  private draftId: number | null = null;

  protected readonly step = signal<WizardStep>(1);
  protected readonly loading = signal(false);
  protected readonly channels = signal<ChannelOption[]>([]);
  protected readonly roles = signal<RoleOption[]>([]);
  protected readonly steps = [
    { number: 1 as WizardStep, title: 'Details', caption: 'Name and destination' },
    { number: 2 as WizardStep, title: 'Schedule', caption: 'When it happens' },
    { number: 3 as WizardStep, title: 'Connections', caption: 'Posting and mentions' },
    { number: 4 as WizardStep, title: 'Review', caption: 'Publish or save' },
  ];
  protected readonly weekdays = [
    { value: 0, label: 'Mon' }, { value: 1, label: 'Tue' }, { value: 2, label: 'Wed' },
    { value: 3, label: 'Thu' }, { value: 4, label: 'Fri' }, { value: 5, label: 'Sat' }, { value: 6, label: 'Sun' },
  ];
  protected readonly weekdayOptions = this.weekdays.map(day => ({ value: String(day.value), label: day.label }));
  protected readonly form = {
    channel_id: '', title: 'New event', description: '', timezone: 'Europe/Bucharest', mention_role_ids: [] as string[],
    kickoff_date: todayDateInput(), kickoff_time: '21:45', recurrence: 'none' as 'none' | 'weekly', repeat_count: 6,
    weekdays: [] as number[], ends_mode: 'never' as 'never' | 'after_count' | 'on_date', end_date: '',
    post_timing_mode: 'at_event_start' as 'at_event_start' | 'before_event_start' | 'when_previous_event_ends' | 'after_previous_event_ends' | 'at_specific_time',
    post_timing_value: '',
  };

  async ngOnInit(): Promise<void> {
    try {
      const bootstrap = await this.api.getBootstrap();
      this.channels.set(bootstrap.channels || []);
      this.roles.set(bootstrap.roles || []);
      this.form.channel_id = bootstrap.channels?.[0]?.id || '';
      this.form.timezone = bootstrap.default_timezone || this.form.timezone;
      const draftId = Number(this.route.snapshot.queryParamMap.get('draftId'));
      if (Number.isInteger(draftId) && draftId > 0) {
        const draft = (await this.api.listEventDrafts()).find(item => item.id === draftId);
        if (draft) this.loadDraft(draft);
      }
    } catch {
      this.snackbar.error('Failed to load Discord event options.');
    }
  }

  protected goToStep(value: WizardStep): void {
    if (value <= this.step()) { this.step.set(value); return; }
    for (let current = this.step(); current < value; current++) {
      const error = this.validateStep(current as WizardStep);
      if (error) { this.snackbar.error(error); return; }
    }
    this.step.set(value);
  }
  protected next(): void {
    const error = this.validateStep(this.step());
    if (error) { this.snackbar.error(error); return; }
    if (this.step() < 4) this.step.update(value => (value + 1) as WizardStep);
  }
  protected previous(): void { if (this.step() > 1) this.step.update(value => (value - 1) as WizardStep); }
  protected weekdaySelection(): string[] { return this.form.weekdays.map(String); }
  protected onWeekdaysChange(next: string[]): void { this.form.weekdays = next.map(Number).sort(); }
  protected toggleWeekday(day: number): void { this.form.weekdays = this.form.weekdays.includes(day) ? this.form.weekdays.filter(value => value !== day) : [...this.form.weekdays, day].sort(); }
  protected openNativePicker(input: HTMLInputElement): void { input.showPicker?.(); }
  protected toggleRecurrence(checked: boolean): void { this.form.recurrence = checked ? 'weekly' : 'none'; }
  protected roleOptions(): { value: string; label: string }[] { return this.roles().map(role => ({ value: role.id, label: `@${role.name}` })); }
  protected onRolesChange(next: string[]): void { this.form.mention_role_ids = next; }
  protected channelName(): string { return this.channels().find(channel => channel.id === this.form.channel_id)?.name || 'not selected'; }
  protected timingLabel(): string { return ({ at_event_start: 'When event starts', before_event_start: 'Before event starts', when_previous_event_ends: 'When previous event ends', after_previous_event_ends: 'After previous event ends', at_specific_time: 'At a specific time' } as Record<string, string>)[this.form.post_timing_mode]; }

  private validateStep(step: WizardStep): string | null {
    if (step === 1) {
      if (!this.form.channel_id) return 'Choose a post channel.';
      if (!this.form.title.trim()) return 'Enter an event title.';
    }
    if (step === 2) {
      if (!this.form.kickoff_date) return 'Choose a kickoff date.';
      if (!this.form.kickoff_time) return 'Choose a kickoff time.';
      if (this.form.recurrence === 'weekly' && !this.form.weekdays.length) return 'Choose at least one recurring weekday.';
    }
    return null;
  }

  protected async saveDraft(): Promise<void> { await this.create(true); }
  protected async submit(): Promise<void> { await this.create(false); }

  private async create(saveAsDraft: boolean): Promise<void> {
    for (const step of [1, 2] as WizardStep[]) {
      const error = this.validateStep(step);
      if (error) { this.snackbar.error(error); this.step.set(step); return; }
    }
    this.loading.set(true);
    try {
      const payload = {
        channel_id: this.form.channel_id, title: this.form.title.trim(), description: this.form.description.trim(), timezone: this.form.timezone,
        mention_role_ids: this.form.mention_role_ids, starts_at: this.wallTimeToUtcIso(this.form.kickoff_date, this.form.kickoff_time, this.form.timezone),
        recurrence: this.form.recurrence, repeat_count: this.form.recurrence === 'weekly' && this.form.ends_mode === 'after_count' ? this.form.repeat_count : null,
        weekdays: this.form.recurrence === 'weekly' ? this.form.weekdays : [], ends_mode: this.form.recurrence === 'weekly' ? this.form.ends_mode : 'never',
        end_date: this.form.recurrence === 'weekly' && this.form.ends_mode === 'on_date' ? this.wallTimeToUtcIso(this.form.end_date, '23:59', this.form.timezone) : null,
        post_timing_mode: this.form.recurrence === 'weekly' ? this.form.post_timing_mode : 'at_event_start', post_timing_value: this.form.post_timing_value || null,
        save_as_draft: saveAsDraft,
      };
      if (this.draftId !== null) {
        await this.api.updateEventDraft(this.draftId, payload);
        if (!saveAsDraft) await this.api.publishEventDraft(this.draftId);
      } else {
        const created = await this.api.createEvent(payload);
        if (saveAsDraft) this.draftId = created.id;
      }
      this.snackbar.success(saveAsDraft ? 'Draft saved. Resume it from Drafts.' : 'Event published to Discord.');
      if (!saveAsDraft) this.step.set(1);
    } catch {
      this.snackbar.error(saveAsDraft ? 'Failed to save event draft.' : 'Failed to publish event. Check the schedule and channel.');
    } finally { this.loading.set(false); }
  }

  private loadDraft(draft: import('../../core/api.service').EventSeries): void {
    this.draftId = draft.id;
    this.form.channel_id = draft.channel_id;
    this.form.title = draft.title;
    this.form.description = draft.description;
    this.form.timezone = draft.timezone;
    this.form.mention_role_ids = [];
    this.form.recurrence = draft.recurrence;
    this.form.repeat_count = draft.repeat_count || 6;
    this.form.weekdays = [...(draft.weekdays || [])];
    this.form.ends_mode = draft.ends_mode;
    this.form.end_date = draft.end_date ? this.toDateInput(new Date(draft.end_date)) : '';
    this.form.post_timing_mode = draft.post_timing_mode;
    this.form.post_timing_value = draft.post_timing_value || '';
    const kickoff = draft.anchor_starts_at || draft.events[0]?.closes_at;
    if (kickoff) {
      const date = new Date(kickoff);
      this.form.kickoff_date = this.toDateInput(date);
      this.form.kickoff_time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
  }

  private toDateInput(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private wallTimeToUtcIso(dateInput: string, timeInput: string, timezoneName: string): string {
    const [year, month, day] = dateInput.split('-').map(Number);
    const [hour, minute] = timeInput.split(':').map(Number);
    const wallTimeUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    let candidate = wallTimeUtc;
    for (let index = 0; index < 3; index += 1) {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezoneName, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, hourCycle: 'h23' }).formatToParts(new Date(candidate));
      const values = new Map(parts.map(part => [part.type, part.value]));
      const zonedAsUtc = Date.UTC(Number(values.get('year')), Number(values.get('month')) - 1, Number(values.get('day')), Number(values.get('hour')), Number(values.get('minute')), Number(values.get('second')));
      const next = wallTimeUtc - (zonedAsUtc - candidate);
      if (next === candidate) break;
      candidate = next;
    }
    return new Date(candidate).toISOString();
  }
}
