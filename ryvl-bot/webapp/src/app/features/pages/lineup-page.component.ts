import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService, ChannelOption, GuildMemberOption, RoleOption } from '../../core/api.service';
import { SnackbarService } from '../../core/snackbar.service';

const LINEUP_DRAFT_STORAGE_KEY = 'ryvl.lineup.draft.v1';

function todayDateInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type LineupDraftForm = {
  channelId: string;
  formation: string;
  kickoffDate: string;
  kickoffTime: string;
  title: string;
  mentionRoleIds: string[];
  messagePrefix: string;
  messageSuffix: string;
  filename: string;
};

const DEFAULT_LINEUP_FORM: LineupDraftForm = {
  channelId: '',
  formation: '4231',
  kickoffDate: todayDateInput(),
  kickoffTime: '21:45',
  title: 'RYVL Match Lineup',
  mentionRoleIds: [],
  messagePrefix: '',
  messageSuffix: '',
  filename: '',
};

@Component({
  selector: 'app-lineup-page',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6">
      <header class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Lineup</p>
        <h1 class="text-2xl font-semibold text-slate-100">Lineup planning</h1>
      </header>

      <form class="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-2">
        <div class="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Match details</p>

          <label class="space-y-1">
            <span class="text-xs text-slate-400">Post channel</span>
            <select class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [(ngModel)]="form.channelId" (ngModelChange)="persistDraft()" name="channelId">
              <option value="">Select a channel</option>
              @for (channel of channels(); track channel.id) {
                <option [value]="channel.id">#{{ channel.name }}</option>
              }
            </select>
          </label>

          <label class="space-y-1">
            <span class="text-xs text-slate-400">Formation</span>
            <select class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [(ngModel)]="form.formation" (ngModelChange)="onFormationChange()" name="formation">
              @for (formation of formations(); track formation) {
                <option [value]="formation">{{ formation }}</option>
              }
            </select>
          </label>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1">
              <span class="text-xs text-slate-400">Kickoff date</span>
              <input #kickoffDateInput class="picker-input w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" type="date" [(ngModel)]="form.kickoffDate" (click)="openNativePicker(kickoffDateInput)" (focus)="openNativePicker(kickoffDateInput)" (ngModelChange)="persistDraft()" name="kickoffDate" />
            </label>

            <label class="space-y-1">
              <span class="text-xs text-slate-400">Kickoff time</span>
              <input #kickoffTimeInput class="picker-input w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" type="time" [(ngModel)]="form.kickoffTime" (click)="openNativePicker(kickoffTimeInput)" (focus)="openNativePicker(kickoffTimeInput)" (ngModelChange)="persistDraft()" name="kickoffTime" />
            </label>
          </div>

          <div class="space-y-1">
            <span class="text-xs text-slate-400">Mention roles (optional)</span>
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              (click)="toggleRolePicker()"
            >
              <span class="truncate text-left">{{ selectedRolesSummary() }}</span>
              <span class="text-xs text-slate-500">{{ rolePickerOpen() ? 'Hide' : 'Select' }}</span>
            </button>
            @if (rolePickerOpen()) {
              <div class="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-2">
                @for (role of roles(); track role.id) {
                  <label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-100 hover:bg-slate-900">
                    <input
                      class="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
                      type="checkbox"
                      [checked]="isRoleSelected(role.id)"
                      (change)="toggleRoleSelection(role.id)"
                    />
                    <span class="truncate">@{{ role.name }}</span>
                  </label>
                } @empty {
                  <p class="px-2 py-1 text-xs text-slate-500">No roles available.</p>
                }
              </div>
            }
          </div>
        </div>

        <div class="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Message options</p>

          <label class="space-y-1">
            <span class="text-xs text-slate-400">Title</span>
            <input class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [(ngModel)]="form.title" (ngModelChange)="persistDraft()" name="title" placeholder="RYVL Match Lineup" />
          </label>

          <label class="space-y-1">
            <span class="text-xs text-slate-400">Message prefix (optional)</span>
            <input class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [(ngModel)]="form.messagePrefix" (ngModelChange)="persistDraft()" name="messagePrefix" placeholder="Starting XI for tonight" />
          </label>

          <label class="space-y-1">
            <span class="text-xs text-slate-400">Message suffix (optional)</span>
            <input class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [(ngModel)]="form.messageSuffix" (ngModelChange)="persistDraft()" name="messageSuffix" placeholder="Good luck everyone" />
          </label>

          <label class="space-y-1">
            <span class="text-xs text-slate-400">Image file name (optional)</span>
            <input class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [(ngModel)]="form.filename" (ngModelChange)="persistDraft()" name="filename" placeholder="lineup-matchday" />
          </label>
        </div>

        <div class="md:col-span-2 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-50"
            [disabled]="posting() || previewing()"
            (click)="resetDraft()"
          >
            Reset draft
          </button>
          <button
            type="button"
            class="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:opacity-50"
            [disabled]="previewing()"
            (click)="previewLineup()"
          >
            {{ previewing() ? 'Rendering...' : 'Preview lineup' }}
          </button>
          <button
            type="button"
            class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            [disabled]="posting() || !form.channelId"
            (click)="postLineup()"
          >
            {{ posting() ? 'Posting...' : 'Post lineup to Discord' }}
          </button>
        </div>
      </form>

      <section class="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 lg:grid-cols-[1fr_2fr]">
        <div
          class="rounded-xl border border-slate-700 bg-slate-950/70 p-3"
          (dragover)="allowDrop($event)"
          (drop)="dropToPool($event)"
        >
          <h2 class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Server members</h2>
          <p class="mb-3 text-xs text-slate-500">Drag users into slots. Drop back here to remove from lineup.</p>
          <div class="max-h-110 space-y-2 overflow-y-auto pr-1">
            @for (member of unassignedMembers(); track member.id) {
              <div class="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    draggable="true"
                    (dragstart)="dragMember(member.id)"
                    class="flex flex-1 items-center gap-2 text-left transition hover:border-slate-500"
                  >
                    @if (member.avatar_url) {
                      <img [src]="member.avatar_url" [alt]="member.display_name" class="h-7 w-7 rounded-full" />
                    } @else {
                      <span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-xs">{{ member.display_name.slice(0, 1) }}</span>
                    }
                    <span class="truncate">{{ member.display_name }}</span>
                  </button>

                  <button
                    type="button"
                    class="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-200 md:hidden"
                    (click)="toggleMobileMemberPicker(member.id)"
                  >
                    Add
                  </button>
                </div>

                @if (isMobileMemberPickerOpen(member.id)) {
                  <div class="mt-2 grid gap-2 sm:grid-cols-2">
                    @for (slot of currentSlots(); track slot) {
                      <button
                        type="button"
                        class="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300 md:hidden"
                        (click)="assignMemberToSlot(member.id, slot)"
                      >
                        {{ slot }}
                      </button>
                    }
                  </div>
                }
              </div>
            } @empty {
              <p class="rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-500">All loaded members are already assigned to slots.</p>
            }
          </div>
        </div>

        <div class="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h2 class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Formation slots</h2>
            <button type="button" class="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800" (click)="clearAllSlots()">Clear all</button>
          </div>

          <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            @for (slot of currentSlots(); track slot) {
              <div
                class="rounded-lg border border-slate-700 bg-slate-900/80 p-2"
                (dragover)="allowDrop($event)"
                (drop)="dropToSlot(slot, $event)"
              >
                <div class="mb-1 flex items-center justify-between">
                  <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{{ slot }}</span>
                  @if (assignedBySlot()[slot]) {
                    <button type="button" class="text-[11px] text-slate-500 hover:text-slate-300" (click)="clearSlot(slot)">clear</button>
                  }
                </div>

                @if (assignedMemberName(slot)) {
                  <button
                    type="button"
                    draggable="true"
                    (dragstart)="dragMember(assignedBySlot()[slot])"
                    class="w-full rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-2 text-left text-sm text-emerald-200"
                  >
                    {{ assignedMemberName(slot) }}
                  </button>
                } @else {
                  <div class="rounded-md border border-dashed border-slate-700 px-2 py-3 text-xs text-slate-500">Drop player here</div>
                }
              </div>
            }
          </div>
        </div>
      </section>

      @if (previewUrl()) {
        <section class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 class="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Preview</h2>
          <img [src]="previewUrl()" alt="Lineup preview" class="w-full rounded-lg border border-slate-700 bg-black/20" />
        </section>
      }
    </section>
  `,
  styles: [
    `
      .picker-input::-webkit-calendar-picker-indicator {
        filter: invert(1) brightness(1.25);
        opacity: 1;
        cursor: pointer;
      }
    `,
  ],
})
export class LineupPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(SnackbarService);

  protected readonly channels = signal<ChannelOption[]>([]);
  protected readonly members = signal<GuildMemberOption[]>([]);
  protected readonly roles = signal<RoleOption[]>([]);
  protected readonly formations = signal<string[]>([]);
  protected readonly slotsByFormation = signal<Record<string, string[]>>({});
  protected readonly assignedBySlot = signal<Record<string, string>>({});
  protected readonly draggedMemberId = signal<string>('');
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly posting = signal(false);
  protected readonly previewing = signal(false);
  protected readonly previewUrl = signal('');
  protected readonly defaultLineupChannelId = signal('');
  protected readonly rolePickerOpen = signal(false);
  protected readonly selectedMobileMemberId = signal('');

  protected readonly unassignedMembers = computed(() => {
    const assigned = new Set(Object.values(this.assignedBySlot()));
    return this.members().filter(member => !assigned.has(member.id));
  });

  protected readonly form: LineupDraftForm = { ...DEFAULT_LINEUP_FORM };

  async ngOnInit(): Promise<void> {
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

      this.defaultLineupChannelId.set(bootstrap.default_lineup_channel_id || bootstrap.channels?.[0]?.id || '');
      if (this.formations().length && !this.formations().includes(this.form.formation)) {
        this.form.formation = this.formations()[0];
      }
      this.restoreDraft();
      this.form.channelId = this.defaultLineupChannelId();
      this.onFormationChange();
    } catch {
      this.snackbar.error('Failed to load channels or formations. Check API and bot permissions.');
    }
  }

  protected persistDraft(): void {
    try {
      const payload = {
        form: this.form,
        assignedBySlot: this.assignedBySlot(),
      };
      localStorage.setItem(LINEUP_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors (private mode/quota/full).
    }
  }

  protected resetDraft(): void {
    try {
      localStorage.removeItem(LINEUP_DRAFT_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }

    Object.assign(this.form, DEFAULT_LINEUP_FORM);
    this.form.channelId = this.defaultLineupChannelId();
    this.assignedBySlot.set({});

    const previous = this.previewUrl();
    if (previous) {
      URL.revokeObjectURL(previous);
    }
    this.previewUrl.set('');
    this.snackbar.info('Draft reset.');
  }

  private restoreDraft(): void {
    try {
      const raw = localStorage.getItem(LINEUP_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        form?: Partial<LineupDraftForm>;
        assignedBySlot?: Record<string, string>;
      };

      if (parsed.form) {
        Object.assign(this.form, parsed.form);
      }
      if (parsed.assignedBySlot && typeof parsed.assignedBySlot === 'object') {
        this.assignedBySlot.set(parsed.assignedBySlot);
      }
    } catch {
      // Ignore malformed storage payloads.
    }
  }

  protected currentSlots(): string[] {
    return this.slotsByFormation()[this.form.formation] || ['gk'];
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
  }

  protected clearSlot(slot: string): void {
    const next: Record<string, string> = { ...this.assignedBySlot() };
    delete next[slot];
    this.assignedBySlot.set(next);
    this.persistDraft();
  }

  protected clearAllSlots(): void {
    this.assignedBySlot.set({});
    this.persistDraft();
  }

  protected assignedMemberName(slot: string): string {
    const memberId = this.assignedBySlot()[slot];
    if (!memberId) return '';
    const member = this.members().find(item => item.id === memberId);
    return member?.display_name || '';
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

  protected toggleRolePicker(): void {
    this.rolePickerOpen.update(value => !value);
  }

  protected isRoleSelected(roleId: string): boolean {
    return this.form.mentionRoleIds.includes(roleId);
  }

  protected toggleRoleSelection(roleId: string): void {
    if (this.form.mentionRoleIds.includes(roleId)) {
      this.form.mentionRoleIds = this.form.mentionRoleIds.filter(value => value !== roleId);
    } else {
      this.form.mentionRoleIds = [...this.form.mentionRoleIds, roleId];
    }
    this.persistDraft();
  }

  protected selectedRolesSummary(): string {
    if (!this.form.mentionRoleIds.length) return 'No mention roles selected';
    const roleNames = this.roles()
      .filter(role => this.form.mentionRoleIds.includes(role.id))
      .map(role => `@${role.name}`);
    if (!roleNames.length) return `${this.form.mentionRoleIds.length} role(s) selected`;
    return roleNames.join(', ');
  }

  protected openNativePicker(input: HTMLInputElement): void {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    }
  }

  async previewLineup(): Promise<void> {
    this.previewing.set(true);

    try {
      const kickoffAt = this.form.kickoffDate && this.form.kickoffTime
        ? new Date(`${this.form.kickoffDate}T${this.form.kickoffTime}:00`).toISOString()
        : null;
      const players = this.lineupPlayersPayload();

      const blob = await this.api.renderLineupPreview({
        formation: this.form.formation,
        title: this.form.title.trim(),
        players,
        kickoff_at: kickoffAt,
      });

      const previous = this.previewUrl();
      if (previous) URL.revokeObjectURL(previous);
      this.previewUrl.set(URL.createObjectURL(blob));
    } catch {
      this.snackbar.error('Failed to render lineup preview. Check selected formation and players.');
    } finally {
      this.previewing.set(false);
    }
  }

  async postLineup(): Promise<void> {
    if (!this.form.channelId) {
      this.snackbar.error('Select a channel before posting lineup.');
      return;
    }

    this.posting.set(true);
    try {
      const kickoffAt = this.form.kickoffDate && this.form.kickoffTime
        ? new Date(`${this.form.kickoffDate}T${this.form.kickoffTime}:00`).toISOString()
        : null;
      const players = this.lineupPlayersPayload();

      const result = await this.api.sendLineup({
        channel_id: this.form.channelId,
        title: this.form.title.trim(),
        formation: this.form.formation,
        players,
        kickoff_at: kickoffAt,
        mention_role_ids: this.mentionRoleIds(),
        message_prefix: this.form.messagePrefix || null,
        message_suffix: this.form.messageSuffix || null,
        filename: this.form.filename || null,
      });

      this.snackbar.success(`Lineup posted. Message ID: ${result.message_id}`);
    } catch {
      this.snackbar.error('Failed to post lineup. Verify bot connection and channel permissions.');
    } finally {
      this.posting.set(false);
    }
  }
}