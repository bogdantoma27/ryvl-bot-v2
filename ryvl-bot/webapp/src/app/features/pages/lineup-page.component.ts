import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { ApiService, ChannelOption, GuildMemberOption, RoleOption } from '../../core/api.service';
import { DraftCountsService } from '../../core/draft-counts.service';
import { SnackbarService } from '../../core/snackbar.service';
import { MultiSelectComponent } from '../../shared/multi-select.component';

const LINEUP_DRAFT_STORAGE_KEY = 'ryvl.lineup.draft.v1';
// Legacy per-browser drafts list, migrated to the database on first load of the drafts page.
export const LINEUP_DRAFTS_STORAGE_KEY = 'ryvl.lineup.drafts.v1';
// Vertical offset (px, in the 900x1400 render space) between a formation slot's raw
// coordinate and where the rendered PNG actually draws the shirt; keeps the empty-slot
// markers aligned with the filled shirts drawn by lineup_renderer.py's _draw_player().
const PLAYER_MARKER_Y_OFFSET = 108;

function todayDateInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sanitizeDate(value: string | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayDateInput();
}

function sanitizeTime(value: string | undefined): string {
  return value && /^\d{2}:\d{2}$/.test(value) ? value : '21:45';
}

type LineupDraftForm = {
  channelId: string;
  formation: string;
  kickoffDate: string;
  kickoffTime: string;
  timezone: string;
  title: string;
  mentionRoleIds: string[];
};

export type LineupDraftRecord = {
  id: string;
  savedAt: string;
  form: LineupDraftForm;
  assignedBySlot: Record<string, string>;
};

const DEFAULT_LINEUP_FORM: LineupDraftForm = {
  channelId: '',
  formation: '4231',
  kickoffDate: todayDateInput(),
  kickoffTime: '21:45',
  timezone: 'Europe/Bucharest',
  title: 'RYVL Match Lineup',
  mentionRoleIds: [],
};

const STEPS = [
  { number: 1, label: 'Details' },
  { number: 2, label: 'Fill positions' },
  { number: 3, label: 'Connections' },
  { number: 4, label: 'Review & publish' },
];

function wallTimeToUtcIso(dateInput: string, timeInput: string, timezoneName: string): string {
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

@Component({
  selector: 'app-lineup-page',
  imports: [FormsModule, MultiSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="collection-page space-y-6">
      <header class="page-header">
        <div>
          <p class="eyebrow">Workspace <span>&rsaquo;</span> Lineup</p>
          <h1>New lineup</h1>
          <p class="page-subtitle">Build a formation lineup and post it to Discord.</p>
        </div>
        <button type="button" class="secondary-action" [disabled]="posting()" (click)="saveAsDraft()">Save as draft</button>
      </header>

      <div class="wizard-layout">
        <nav class="stepper" aria-label="Lineup steps">
          @for (step of steps; track step.number) {
            <button type="button" class="stepper-item" [class.is-active]="currentStep() === step.number" [class.is-done]="currentStep() > step.number" (click)="goToStep(step.number)">
              <span class="stepper-connector"></span>
              <span class="stepper-circle">{{ currentStep() > step.number ? '✓' : step.number }}</span>
              <span class="stepper-label">{{ step.label }}</span>
            </button>
          }
        </nav>

      <div class="wizard-panel space-y-5">
          @if (currentStep() === 1) {
            <p class="wizard-kicker">Match details</p>

            <label class="field">
              <span>Title</span>
              <input [(ngModel)]="form.title" name="title" placeholder="RYVL Match Lineup" required />
            </label>

            <label class="field">
              <span>Formation</span>
              <select [(ngModel)]="form.formation" (ngModelChange)="onFormationChange()" name="formation" required>
                @for (formation of formations(); track formation) {
                  <option [value]="formation">{{ formation }}</option>
                }
              </select>
            </label>

            <div class="lineup-row-2">
              <label class="field">
                <span>Kickoff date</span>
                <input #kickoffDateInput class="picker-input" type="date" [(ngModel)]="form.kickoffDate" (click)="openNativePicker(kickoffDateInput)" name="kickoffDate" required />
              </label>

              <label class="field">
                <span>Kickoff time</span>
                <input #kickoffTimeInput class="picker-input" type="time" [(ngModel)]="form.kickoffTime" (click)="openNativePicker(kickoffTimeInput)" name="kickoffTime" required />
              </label>
            </div>

            <label class="field">
              <span>Timezone</span>
              <select [(ngModel)]="form.timezone" name="timezone">
                <option value="Europe/Bucharest">Europe/Bucharest</option>
                <option value="Europe/London">Europe/London</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
          }

          @if (currentStep() === 2) {
            <p class="wizard-kicker">Fill positions</p>
            <p class="lineup-hint">Drag a player from the roster directly onto a position on the pitch. Render the preview when ready.</p>

            <div class="lineup-columns lineup-board">
              <div class="lineup-panel" (dragover)="allowDrop($event)" (drop)="dropToPool($event)">
                <div class="roster-list">
                  @for (member of unassignedMembers(); track member.id) {
                    <div class="roster-card">
                      <div class="roster-card-row">
                        <button type="button" draggable="true" (dragstart)="dragMember(member.id)" class="roster-drag-btn">
                          @if (member.avatar_url) {
                            <img [src]="member.avatar_url" [alt]="member.display_name" class="roster-avatar" />
                          } @else {
                            <span class="roster-avatar-fallback">{{ member.display_name.slice(0, 1) }}</span>
                          }
                          <span class="truncate">{{ member.display_name }}</span>
                        </button>
                        <button type="button" class="roster-add-btn" (click)="toggleMobileMemberPicker(member.id)">Add</button>
                      </div>
                      @if (isMobileMemberPickerOpen(member.id)) {
                        <div class="roster-mobile-slots">
                          @for (slot of currentSlots(); track slot) {
                            <button type="button" class="roster-mobile-slot" (click)="assignMemberToSlot(member.id, slot)">{{ slot }}</button>
                          }
                        </div>
                      }
                    </div>
                  } @empty {
                    <p class="lineup-empty-hint">All loaded members are already assigned to slots.</p>
                  }
                </div>
              </div>

              <div class="lineup-panel">
                <div class="lineup-board-toolbar">
                  <p class="lineup-hint">Click a filled position to unassign it, or drag it back to the roster.</p>
                  <button type="button" class="secondary-action compact" (click)="clearAllSlots()">Clear all</button>
                </div>

                <div class="pitch-canvas-wrap">
                  @if (!previewUrl() && !previewError()) {
                    <div class="pitch-placeholder">
                      <p>Preview has not been rendered yet.</p>
                      <button type="button" class="secondary-action compact" (click)="renderPreview()">Render preview</button>
                    </div>
                  }
                  @if (previewError()) {
                    <div class="pitch-placeholder">
                      <p>{{ previewError() }}</p>
                      <button type="button" class="secondary-action compact" (click)="renderPreview()">Retry</button>
                    </div>
                  }
                  <canvas
                    #pitchCanvas
                    class="pitch-canvas"
                    [class.hidden]="!previewUrl()"
                    draggable="true"
                    (dragstart)="onCanvasDragStart($event)"
                    (dragover)="onCanvasDragOver($event)"
                    (dragleave)="onCanvasDragLeave()"
                    (drop)="dropToCanvas($event)"
                    (click)="onCanvasClick($event)"
                  ></canvas>
                </div>
              </div>
            </div>
          }

          @if (currentStep() === 3) {
            <p class="wizard-kicker">Event connections</p>

            <label class="field">
              <span>Post channel</span>
              <select [(ngModel)]="form.channelId" name="channelId" required>
                <option value="">Select a channel</option>
                @for (channel of channels(); track channel.id) {
                  <option [value]="channel.id">#{{ channel.name }}</option>
                }
              </select>
            </label>

            <div class="field">
              <span>Mention roles (optional)</span>
              <app-multi-select
                [options]="roleOptions()"
                [selected]="form.mentionRoleIds"
                placeholder="No mention roles selected"
                emptyText="No roles available."
                (selectedChange)="onRolesChange($event)"
              />
            </div>
          }

          @if (currentStep() === 4) {
            <p class="wizard-kicker">Review & publish</p>

            <div class="review-item">
              <span>Lineup</span>
              <strong>{{ form.title }}</strong>
              <p>Formation {{ form.formation }} &middot; {{ filledSlotCount() }}/{{ currentSlots().length }} positions filled</p>
            </div>

            <div class="review-item">
              <span>Kickoff</span>
              <strong>{{ formattedKickoff() }}</strong>
              <p>{{ form.timezone }}</p>
            </div>

            <div class="review-item">
              <span>Destination</span>
              <strong>#{{ channelName() }}</strong>
              <p>{{ form.mentionRoleIds.length }} role mentions</p>
            </div>

            @if (previewUrl()) {
              <img [src]="previewUrl()" alt="Lineup preview" class="lineup-preview-image" />
            }
          }

          <div class="lineup-actions">
            @if (currentStep() > 1) {
              <button type="button" class="secondary-action" (click)="previous()">Back</button>
            }
            @if (currentStep() < 4) {
              <button type="button" class="primary-action" (click)="next()">Continue</button>
            } @else {
              <button type="button" class="primary-action" [disabled]="posting() || !form.channelId" (click)="postLineup()">{{ posting() ? 'Posting...' : 'Post lineup to Discord' }}</button>
            }
          </div>
        </div>
      </div>
    </section>
  `,
})
export class LineupPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(SnackbarService);
  private readonly route = inject(ActivatedRoute);
  private readonly draftCounts = inject(DraftCountsService);
  private draftId: number | null = null;

  protected readonly steps = STEPS;
  protected readonly currentStep = signal(1);
  protected readonly channels = signal<ChannelOption[]>([]);
  protected readonly members = signal<GuildMemberOption[]>([]);
  protected readonly roles = signal<RoleOption[]>([]);
  protected readonly formations = signal<string[]>([]);
  protected readonly slotsByFormation = signal<Record<string, string[]>>({});
  protected readonly coordsByFormation = signal<Record<string, Record<string, [number, number]>>>({});
  protected readonly canvasWidth = signal(900);
  protected readonly canvasHeight = signal(1400);
  protected readonly assignedBySlot = signal<Record<string, string>>({});
  protected readonly draggedMemberId = signal<string>('');
  protected readonly posting = signal(false);
  protected readonly previewUrl = signal('');
  protected readonly previewError = signal('');
  protected readonly hoverSlot = signal('');
  protected readonly defaultLineupChannelId = signal('');
  protected readonly selectedMobileMemberId = signal('');
  protected readonly pitchCanvas = viewChild<ElementRef<HTMLCanvasElement>>('pitchCanvas');
  private previewImage: HTMLImageElement | null = null;

  protected readonly unassignedMembers = computed(() => {
    const assigned = new Set(Object.values(this.assignedBySlot()));
    return this.members().filter(member => !assigned.has(member.id));
  });

  protected readonly form: LineupDraftForm = { ...DEFAULT_LINEUP_FORM };

  constructor() {
    effect(() => {
      // Canvas is only rendered while on step 2; re-run once it appears
      // instead of racing the queueMicrotask that used to miss it.
      this.pitchCanvas();
      this.assignedBySlot();
      this.hoverSlot();
      this.drawCanvas();
    });
  }

  async ngOnInit(): Promise<void> {
    const draftIdParam = Number(this.route.snapshot.queryParamMap.get('draftId'));
    const draftId = Number.isInteger(draftIdParam) && draftIdParam > 0 ? draftIdParam : null;

    try {
      const [bootstrap, formationResponse] = await Promise.all([
        this.api.getBootstrap(),
        this.api.listLineupFormations(),
      ]);

      this.channels.set(bootstrap.channels || []);
      this.members.set(bootstrap.members || []);
      this.roles.set(bootstrap.roles || []);
      this.formations.set(formationResponse.formations || []);
      this.slotsByFormation.set(formationResponse.slots_by_formation || {});
      this.coordsByFormation.set(formationResponse.coords_by_formation || {});
      this.canvasWidth.set(formationResponse.canvas_width || 900);
      this.canvasHeight.set(formationResponse.canvas_height || 1400);

      this.defaultLineupChannelId.set(bootstrap.channels?.[0]?.id || '');
      this.form.timezone = bootstrap.default_timezone || this.form.timezone;
      if (this.formations().length && !this.formations().includes(this.form.formation)) {
        this.form.formation = this.formations()[0];
      }

      if (draftId) {
        await this.loadDraft(draftId);
      } else {
        this.restoreDraft();
      }
      if (!this.form.channelId) {
        this.form.channelId = this.defaultLineupChannelId();
      }
    } catch {
      this.snackbar.error('Failed to load channels or formations. Check API and bot permissions.');
    }
  }

  protected goToStep(step: number): void {
    if (step <= this.currentStep()) {
      this.currentStep.set(step);
      return;
    }
    for (let current = this.currentStep(); current < step; current++) {
      const error = this.validateStep(current);
      if (error) { this.snackbar.error(error); return; }
    }
    this.currentStep.set(step);
  }

  protected next(): void {
    const error = this.validateStep(this.currentStep());
    if (error) { this.snackbar.error(error); return; }
    this.currentStep.update(step => Math.min(4, step + 1));
  }

  protected previous(): void {
    this.currentStep.update(step => Math.max(1, step - 1));
  }

  private validateStep(step: number): string | null {
    if (step === 1) {
      if (!this.form.title.trim()) return 'Enter a lineup title.';
      if (!this.form.formation) return 'Choose a formation.';
      if (!this.form.kickoffDate) return 'Choose a kickoff date.';
      if (!this.form.kickoffTime) return 'Choose a kickoff time.';
    }
    if (step === 2) {
      if (!this.filledSlotCount()) return 'Assign at least one player to a position.';
    }
    if (step === 3) {
      if (!this.form.channelId) return 'Select a post channel.';
    }
    return null;
  }

  protected currentSlots(): string[] {
    return this.slotsByFormation()[this.form.formation] || ['gk'];
  }

  protected filledSlotCount(): number {
    return this.currentSlots().filter(slot => !!this.assignedBySlot()[slot]).length;
  }

  protected initials(name: string): string {
    return name.split(/\s+/).map(part => part.slice(0, 1)).join('').slice(0, 2).toUpperCase();
  }

  protected onFormationChange(): void {
    const allowed = new Set(this.currentSlots());
    const next: Record<string, string> = {};
    for (const [slot, memberId] of Object.entries(this.assignedBySlot())) {
      if (allowed.has(slot)) {
        next[slot] = memberId;
      }
    }
    this.assignedBySlot.set(next);
    this.persistDraft();
    this.drawCanvas();
  }

  protected dragMember(memberId: string): void {
    this.draggedMemberId.set(memberId);
  }

  protected toggleMobileMemberPicker(memberId: string): void {
    this.selectedMobileMemberId.update(current => current === memberId ? '' : memberId);
  }

  protected isMobileMemberPickerOpen(memberId: string): boolean {
    return this.selectedMobileMemberId() === memberId;
  }

  protected allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  protected onCanvasDragStart(event: DragEvent): void {
    const slot = this.hitTestSlot(event.clientX, event.clientY);
    const memberId = slot ? this.assignedBySlot()[slot] : '';
    if (!memberId) {
      event.preventDefault();
      return;
    }
    this.draggedMemberId.set(memberId);
    event.dataTransfer?.setData('text/plain', memberId);
  }

  protected dropToSlot(slot: string, event: DragEvent): void {
    event.preventDefault();
    const memberId = this.draggedMemberId();
    if (!memberId) return;

    const next: Record<string, string> = { ...this.assignedBySlot() };
    for (const [key, value] of Object.entries(next)) {
      if (value === memberId) delete next[key];
    }
    next[slot] = memberId;
    this.assignedBySlot.set(next);
    this.draggedMemberId.set('');
    this.persistDraft();
    this.drawCanvas();
  }

  protected dropToCanvas(event: DragEvent): void {
    event.preventDefault();
    this.hoverSlot.set('');
    const slot = this.hitTestSlot(event.clientX, event.clientY);
    if (!slot) return;
    this.dropToSlot(slot, event);
  }

  protected onCanvasDragOver(event: DragEvent): void {
    event.preventDefault();
    this.hoverSlot.set(this.hitTestSlot(event.clientX, event.clientY));
  }

  protected onCanvasDragLeave(): void {
    this.hoverSlot.set('');
  }

  protected onCanvasClick(event: MouseEvent): void {
    const slot = this.hitTestSlot(event.clientX, event.clientY);
    if (!slot || !this.assignedBySlot()[slot]) return;
    const next: Record<string, string> = { ...this.assignedBySlot() };
    delete next[slot];
    this.assignedBySlot.set(next);
    this.persistDraft();
    this.drawCanvas();
  }

  private hitTestSlot(clientX: number, clientY: number): string {
    const canvasEl = this.pitchCanvas()?.nativeElement;
    if (!canvasEl) return '';
    const rect = canvasEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return '';
    const scaleX = canvasEl.width / rect.width;
    const scaleY = canvasEl.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const coords = this.coordsByFormation()[this.form.formation] || {};
    let nearestSlot = '';
    let nearestDist = Infinity;
    for (const slot of this.currentSlots()) {
      const point = coords[slot];
      if (!point) continue;
      const dist = Math.hypot(point[0] - x, point[1] + PLAYER_MARKER_Y_OFFSET - y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestSlot = slot;
      }
    }
    return nearestDist <= 70 ? nearestSlot : '';
  }

  private drawCanvas(): void {
    const canvasEl = this.pitchCanvas()?.nativeElement;
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    canvasEl.width = this.canvasWidth();
    canvasEl.height = this.canvasHeight();
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    if (this.previewImage) {
      ctx.drawImage(this.previewImage, 0, 0, canvasEl.width, canvasEl.height);
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    }

    const coords = this.coordsByFormation()[this.form.formation] || {};
    const hovered = this.hoverSlot();
    const radius = 46;
    for (const slot of this.currentSlots()) {
      const point = coords[slot];
      if (!point) continue;
      const x = point[0];
      const y = point[1] + PLAYER_MARKER_Y_OFFSET;
      const filled = !!this.assignedBySlot()[slot];
      const isHovered = slot === hovered;

      // The rendered PNG already draws a shirt + name plate for filled slots,
      // so only mark empty ones here to avoid double markers.
      if (filled && !isHovered) continue;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? 'rgba(234, 233, 5, 0.35)' : 'rgba(15, 23, 42, 0.4)';
      ctx.fill();
      ctx.setLineDash(isHovered ? [] : [8, 6]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = isHovered ? '#eae905' : 'rgba(255, 255, 255, 0.75)';
      ctx.stroke();
      ctx.setLineDash([]);

      if (!filled) {
        ctx.fillStyle = '#e5e7eb';
        ctx.font = '600 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(slot, x, y);
      }
    }
  }

  private loadPreviewImage(url: string): void {
    if (!url) {
      this.previewImage = null;
      this.drawCanvas();
      return;
    }
    const image = new Image();
    const previous = this.previewImage;
    image.onload = () => {
      this.previewImage = image;
      this.drawCanvas();
      if (previous) URL.revokeObjectURL(previous.src);
    };
    image.onerror = () => {
      this.previewError.set('Preview image failed to load.');
    };
    image.src = url;
  }

  protected assignMemberToSlot(memberId: string, slot: string): void {
    const next: Record<string, string> = { ...this.assignedBySlot() };
    for (const [key, value] of Object.entries(next)) {
      if (value === memberId) delete next[key];
    }
    next[slot] = memberId;
    this.assignedBySlot.set(next);
    this.selectedMobileMemberId.set('');
    this.persistDraft();
    this.drawCanvas();
  }

  protected dropToPool(event: DragEvent): void {
    event.preventDefault();
    const memberId = this.draggedMemberId();
    if (!memberId) return;

    const next: Record<string, string> = { ...this.assignedBySlot() };
    for (const [slot, value] of Object.entries(next)) {
      if (value === memberId) delete next[slot];
    }
    this.assignedBySlot.set(next);
    this.draggedMemberId.set('');
    this.persistDraft();
    this.drawCanvas();
  }

  protected clearAllSlots(): void {
    this.assignedBySlot.set({});
    this.persistDraft();
    this.drawCanvas();
  }

  protected assignedMemberName(slot: string): string {
    const memberId = this.assignedBySlot()[slot];
    if (!memberId) return '';
    const member = this.members().find(item => item.id === memberId);
    return member?.display_name || '';
  }

  protected channelName(): string {
    return this.channels().find(channel => channel.id === this.form.channelId)?.name || 'No channel selected';
  }

  protected roleOptions(): { value: string; label: string }[] {
    return this.roles().map(role => ({ value: role.id, label: `@${role.name}` }));
  }

  protected onRolesChange(next: string[]): void {
    this.form.mentionRoleIds = next;
    this.persistDraft();
  }

  protected openNativePicker(input: HTMLInputElement): void {
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch {
        // Ignore: showPicker requires a user gesture and can be a no-op in some browsers.
      }
    }
  }

  private lineupPlayersPayload(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const slot of this.currentSlots()) {
      const memberId = this.assignedBySlot()[slot];
      if (!memberId) continue;
      const member = this.members().find(item => item.id === memberId);
      if (!member) continue;
      result[slot] = member.display_name;
    }
    return result;
  }

  private mentionRoleIds(): string[] {
    return (this.form.mentionRoleIds || [])
      .map(value => String(value).trim())
      .filter(value => value.length > 0);
  }

  protected formattedKickoff(): string {
    if (!this.form.kickoffDate || !this.form.kickoffTime) return 'Not set';
    try {
      return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(`${this.form.kickoffDate}T${this.form.kickoffTime}:00`));
    } catch {
      return `${this.form.kickoffDate} ${this.form.kickoffTime}`;
    }
  }

  private kickoffAtIso(): string | null {
    return this.form.kickoffDate && this.form.kickoffTime
      ? wallTimeToUtcIso(this.form.kickoffDate, this.form.kickoffTime, this.form.timezone)
      : null;
  }

  protected async renderPreview(): Promise<void> {
    try {
      const blob = await this.api.renderLineupPreview({
        formation: this.form.formation,
        title: this.form.title.trim() || 'RYVL Match Lineup',
        players: this.lineupPlayersPayload(),
        kickoff_at: this.kickoffAtIso(),
      });

      this.previewError.set('');
      this.previewUrl.set(URL.createObjectURL(blob));
      this.loadPreviewImage(this.previewUrl());
    } catch {
      this.previewError.set('Preview failed to render.');
    }
  }

  protected persistDraft(): void {
    try {
      const payload = { form: this.form, assignedBySlot: this.assignedBySlot() };
      localStorage.setItem(LINEUP_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors (private mode/quota/full).
    }
  }

  private restoreDraft(): void {
    try {
      const raw = localStorage.getItem(LINEUP_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { form?: Partial<LineupDraftForm>; assignedBySlot?: Record<string, string> };
      if (parsed.form) Object.assign(this.form, parsed.form);
      this.form.kickoffDate = sanitizeDate(this.form.kickoffDate);
      this.form.kickoffTime = sanitizeTime(this.form.kickoffTime);
      if (parsed.assignedBySlot && typeof parsed.assignedBySlot === 'object') {
        this.assignedBySlot.set(parsed.assignedBySlot);
      }
    } catch {
      // Ignore malformed storage payloads.
    }
  }

  protected async saveAsDraft(): Promise<void> {
    const payload = {
      title: this.form.title.trim() || 'RYVL Match Lineup',
      channel_id: this.form.channelId,
      formation: this.form.formation,
      kickoff_at: this.kickoffAtIso(),
      mention_role_ids: this.mentionRoleIds(),
      assignments: { ...this.assignedBySlot() },
    };
    try {
      const draft = this.draftId
        ? await this.api.updateLineupDraft(this.draftId, payload)
        : await this.api.saveLineupDraft(payload);
      this.draftId = draft.id;
      void this.draftCounts.refresh();
      this.snackbar.success('Lineup saved as draft.');
    } catch {
      this.snackbar.error('Failed to save draft.');
    }
  }

  private async loadDraft(id: number): Promise<void> {
    try {
      const drafts = await this.api.listLineupDrafts();
      const draft = drafts.find(item => item.id === id);
      if (!draft) return;
      this.draftId = draft.id;
      this.form.title = draft.title;
      this.form.channelId = draft.channel_id;
      this.form.formation = draft.formation;
      this.form.mentionRoleIds = [...draft.mention_role_ids];
      if (draft.kickoff_at) {
        const date = new Date(draft.kickoff_at);
        this.form.kickoffDate = sanitizeDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
        this.form.kickoffTime = sanitizeTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
      } else {
        this.form.kickoffDate = sanitizeDate(undefined);
        this.form.kickoffTime = sanitizeTime(undefined);
      }
      this.assignedBySlot.set({ ...draft.assignments });
    } catch {
      this.snackbar.error('Failed to load lineup draft.');
    }
  }

  async postLineup(): Promise<void> {
    for (const step of [1, 2, 3]) {
      const error = this.validateStep(step);
      if (error) { this.snackbar.error(error); this.currentStep.set(step); return; }
    }

    this.posting.set(true);
    try {
      const result = await this.api.sendLineup({
        channel_id: this.form.channelId,
        title: this.form.title.trim(),
        formation: this.form.formation,
        players: this.lineupPlayersPayload(),
        kickoff_at: this.kickoffAtIso(),
        mention_role_ids: this.mentionRoleIds(),
      });

      this.snackbar.success(`Lineup posted. Message ID: ${result.message_id}`);
    } catch {
      this.snackbar.error('Failed to post lineup. Verify bot connection and channel permissions.');
    } finally {
      this.posting.set(false);
    }
  }
}
