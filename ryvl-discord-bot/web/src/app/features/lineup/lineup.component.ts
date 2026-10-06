import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import {
  LineupAssignments,
  LineupDraft,
  LineupDraftPayload,
  LineupFormationsResponse,
  LineupMatchOccurrence,
  LineupMemberOption,
  LineupPostPayload,
  LineupRenderPayload,
} from '../../core/models';
import { assignToSlot, eaNamesForAssignments, localDateTimeParts, normalizeAssignments } from './lineup-assignments';
import { LineupDraftPanelComponent } from './lineup-draft-panel.component';
import { LineupMemberPickerComponent, MemberSlotChoice } from './lineup-member-picker.component';
import { LineupSlotBoardComponent } from './lineup-slot-board.component';

type LineupStep = 1 | 2 | 3 | 4;

const DEFAULT_SLOTS = ['gk', 'lb', 'lcb', 'rcb', 'rb', 'lcm', 'cm', 'rcm', 'lw', 'st', 'rw'];

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function errorMessage(err: unknown, fallback: string): string {
  const e = err as { error?: { message?: string | string[] }; message?: string } | null;
  const msg = e?.error?.message ?? e?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg || fallback;
}

@Component({
  selector: 'app-lineup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, LineupMemberPickerComponent, LineupSlotBoardComponent, LineupDraftPanelComponent],
  template: `
    <div class="max-w-7xl w-full mx-auto space-y-6">
      <!-- Breadcrumb & Top Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-700/60 pb-4">
        <div>
          <nav class="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <span class="text-slate-200">Lineups</span>
            <span>/</span>
            <span class="text-[#EAE905] font-bold">{{ draftId() ? 'Edit Lineup' : 'New Lineup' }}</span>
          </nav>
          <h1 class="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <svg class="w-6 h-6 text-[#EAE905]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>Match Lineup Creator</span>
          </h1>
          <p class="text-xs text-slate-400 mt-0.5">Build a match formation, assign players, and publish an official graphic to Discord.</p>
        </div>

        <div class="flex items-center gap-2 self-start sm:self-center">
          <a
            routerLink="/admin/lineup/drafts"
            class="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 transition flex items-center gap-1.5"
          >
            <span>Saved Drafts</span>
          </a>

          <button
            type="button"
            [disabled]="isSavingDraft()"
            (click)="saveDraft()"
            class="btn-yellow text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            style="color: #111111 !important;"
          >
            <span style="color: #111111 !important;">{{ isSavingDraft() ? 'Saving...' : 'Save Draft' }}</span>
          </button>
        </div>
      </div>

      @if (notification()) {
        <div
          class="p-3.5 rounded-xl text-xs flex items-center justify-between border transition"
          [class.bg-emerald-950/50]="notification()!.type === 'success'"
          [class.border-emerald-700]="notification()!.type === 'success'"
          [class.text-emerald-200]="notification()!.type === 'success'"
          [class.bg-rose-950/50]="notification()!.type === 'error'"
          [class.border-rose-700]="notification()!.type === 'error'"
          [class.text-rose-200]="notification()!.type === 'error'"
        >
          <span>{{ notification()!.message }}</span>
          <button type="button" (click)="notification.set(null)" class="text-slate-400 hover:text-white text-base leading-none">&times;</button>
        </div>
      }

      <!-- Stepper Navigation -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#16213e] p-2 rounded-xl border border-slate-800">
        @for (s of steps; track s.num) {
          <button
            type="button"
            (click)="goToStep(s.num)"
            class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer"
            [class.bg-[#5865F2]]="currentStep() === s.num"
            [class.text-white]="currentStep() === s.num"
            [class.text-slate-400]="currentStep() !== s.num"
          >
            <span
              class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              [class.bg-white]="currentStep() === s.num"
              [class.text-[#5865F2]]="currentStep() === s.num"
              [class.bg-slate-700]="currentStep() !== s.num"
              [class.text-slate-300]="currentStep() !== s.num"
            >
              {{ currentStep() > s.num ? '✓' : s.num }}
            </span>
            <span class="truncate">{{ s.label }}</span>
          </button>
        }
      </div>

      <div class="bg-[#16213e] border border-slate-800 rounded-2xl p-6 shadow-xl min-h-[460px]">
        <!-- STEP 1: Match Details -->
        @if (currentStep() === 1) {
          <div class="max-w-2xl space-y-6">
            <div>
              <h2 class="text-base font-bold text-white">Match Details & Colors</h2>
              <p class="text-xs text-slate-400 mt-1">Configure match title, formation setup, and dual kickoff timetable.</p>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Linked Match Event (optional)</label>
                <select
                  [ngModel]="occurrenceId()"
                  (ngModelChange)="onOccurrenceChange($event)"
                  class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                >
                  <option value="">No linked event</option>
                  @for (occ of occurrences(); track occ.occurrenceId) {
                    <option [value]="occ.occurrenceId">
                      {{ occ.title }} · {{ formatOccurrence(occ.startsAt) }} · {{ occ.counts.accepted }} accepted
                    </option>
                  }
                </select>
                <p class="text-[11px] text-slate-400 mt-1">Linking an event lists its accepted players first and enables auto-fill by preferred position.</p>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Lineup Title</label>
                <input
                  type="text"
                  [(ngModel)]="title"
                  placeholder="RYVL Match Lineup"
                  class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#EAE905] transition"
                />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Formation</label>
                  <select
                    [ngModel]="selectedFormation()"
                    (ngModelChange)="onFormationChange($event)"
                    class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                  >
                    @for (fmt of formationList(); track fmt) {
                      <option [value]="fmt">{{ formationLabels()[fmt] || fmt }} ({{ fmt }})</option>
                    }
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Timezone</label>
                  <select
                    [(ngModel)]="timezone"
                    class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                  >
                    <option value="Europe/Bucharest">Europe/Bucharest (Romania 🇷🇴)</option>
                    <option value="Europe/London">Europe/London (UK 🇬🇧)</option>
                    <option value="UTC">UTC</option>
                    <option value="Europe/Paris">Europe/Paris (CET)</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Kickoff Date</label>
                  <input
                    type="date"
                    [(ngModel)]="kickoffDate"
                    class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                  />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Kickoff Time</label>
                  <input
                    type="time"
                    [(ngModel)]="kickoffTime"
                    class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                  />
                </div>
              </div>

              <div class="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Primary Jersey Color</label>
                  <div class="flex items-center gap-2">
                    <input type="color" [(ngModel)]="primaryColor" class="w-10 h-10 rounded-lg bg-transparent border-0 cursor-pointer p-0" />
                    <input type="text" [(ngModel)]="primaryColor" class="flex-1 bg-[#11192e] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white uppercase font-mono" />
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-300 mb-1.5">Secondary / Trim Color</label>
                  <div class="flex items-center gap-2">
                    <input type="color" [(ngModel)]="secondaryColor" class="w-10 h-10 rounded-lg bg-transparent border-0 cursor-pointer p-0" />
                    <input type="text" [(ngModel)]="secondaryColor" class="flex-1 bg-[#11192e] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white uppercase font-mono" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- STEP 2: Fill Positions -->
        @if (currentStep() === 2) {
          <div class="space-y-6">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h2 class="text-base font-bold text-white flex items-center gap-2">
                  <span>Fill Formation Positions</span>
                  <span class="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-[#EAE905] border border-slate-700 font-bold">
                    {{ filledCount() }}/11 Filled
                  </span>
                </h2>
                <p class="text-xs text-slate-400 mt-0.5">Assign server members or custom trialists to each position in {{ selectedFormation() }}.</p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <label class="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    [checked]="showEaNames()"
                    (change)="toggleEaNames()"
                    class="rounded border-slate-600 bg-slate-900 text-[#EAE905] focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                  />
                  EA names on graphic
                </label>
                <button
                  type="button"
                  (click)="refreshMembers()"
                  class="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 transition cursor-pointer"
                >
                  Refresh Roster
                </button>
                <button
                  type="button"
                  (click)="clearAllSlots()"
                  class="text-xs text-rose-400 hover:text-rose-300 px-3 py-1.5 rounded-lg border border-rose-900/60 hover:bg-rose-950/30 transition cursor-pointer"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  (click)="refreshPreview()"
                  class="btn-yellow text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition cursor-pointer"
                  style="color: #111111 !important;"
                >
                  <span style="color: #111111 !important;">Update Graphic</span>
                </button>
              </div>
            </div>

            <app-lineup-slot-board
              [formation]="selectedFormation()"
              [slots]="currentSlots()"
              [assignments]="assignments()"
              [eaNames]="eaNames()"
              (unassign)="unassignSlot($event)"
            />

            <app-lineup-member-picker
              [members]="members()"
              [slots]="currentSlots()"
              [assignments]="assignments()"
              [hasOccurrence]="!!occurrenceId()"
              [isLoading]="isLoadingMembers()"
              (choose)="onMemberChoice($event)"
              (assignGuest)="assignGuestPlayer($event)"
              (autoFill)="autoFill()"
            />

            <div class="bg-[#11192e] p-6 rounded-2xl border border-slate-700/80 space-y-3">
              <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 class="text-sm font-bold text-white">Pitch Formation Graphic Preview</h3>
                  <p class="text-xs text-slate-400 mt-0.5">Preview of the exact graphic posted to Discord.</p>
                </div>
              </div>
              <div class="w-full flex justify-center py-4">
                @if (isLoadingPreview()) {
                  <div class="py-28 text-xs text-slate-400">Rendering pitch formation...</div>
                } @else if (previewSvg()) {
                  <div class="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-slate-700 bg-black" [innerHTML]="safePreviewSvg()"></div>
                } @else {
                  <div class="py-20 text-center text-slate-500 text-xs">
                    <p>No preview generated yet.</p>
                    <button
                      type="button"
                      (click)="refreshPreview()"
                      class="btn-yellow mt-3 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                      style="color: #111111 !important;"
                    >
                      <span style="color: #111111 !important;">Generate Pitch Graphic</span>
                    </button>
                  </div>
                }
              </div>
            </div>
          </div>
        }

        <!-- STEP 3: Connections -->
        @if (currentStep() === 3) {
          <div class="max-w-2xl space-y-6">
            <div>
              <h2 class="text-base font-bold text-white">Discord Destination & Mentions</h2>
              <p class="text-xs text-slate-400 mt-1">Select the target text channel and which roles to ping when publishing.</p>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Target Discord Text Channel</label>
                <select
                  [ngModel]="channelId()"
                  (ngModelChange)="channelId.set($event)"
                  class="w-full bg-[#11192e] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#EAE905] transition cursor-pointer"
                >
                  <option value="">Select a channel...</option>
                  @for (ch of guildStore.activeGuild()?.channels; track ch.id) {
                    <option [value]="ch.id">#{{ ch.name }}</option>
                  }
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Mention Roles (Optional)</label>
                <div class="bg-[#11192e] border border-slate-700/80 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1.5">
                  @for (role of guildStore.activeGuild()?.roles; track role.id) {
                    <label class="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer">
                      <input
                        type="checkbox"
                        [checked]="selectedRoleIds().includes(role.id)"
                        (change)="toggleRole(role.id)"
                        class="rounded border-slate-600 bg-slate-900 text-[#EAE905] focus:ring-0 w-4 h-4 cursor-pointer"
                      />
                      <span class="text-xs font-medium text-slate-200" [style.color]="role.color || '#fff'">{{ role.name }}</span>
                    </label>
                  } @empty {
                    <div class="text-slate-500 text-xs text-center py-2">No roles available in this server.</div>
                  }
                </div>
              </div>
            </div>
          </div>
        }

        <!-- STEP 4: Review & Publish -->
        @if (currentStep() === 4) {
          <app-lineup-draft-panel
            [title]="title"
            [matchLabel]="selectedOccurrence()?.title ?? null"
            [formationLabel]="formationLabels()[selectedFormation()] || selectedFormation()"
            [filledCount]="filledCount()"
            [kickoffLines]="kickoffLines()"
            [channelName]="targetChannelName()"
            [mentionText]="selectedMentionRolesText()"
            [previewHtml]="safePreviewSvg()"
            [isPosting]="isPosting()"
            [canPost]="!!channelId()"
            [postedMessageId]="lastPostedMessageId()"
            [postedAtLabel]="lastPostedAtLabel()"
            [showEaNames]="showEaNames()"
            (showEaNamesChange)="toggleEaNames($event)"
            (post)="publishToDiscord($event)"
          />
        }

        <!-- Bottom Wizard Step Navigation -->
        <div class="flex items-center justify-between pt-6 mt-6 border-t border-slate-800">
          <div>
            @if (currentStep() > 1) {
              <button
                type="button"
                (click)="prevStep()"
                class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 hover:bg-slate-800 transition cursor-pointer"
              >
                &larr; Back
              </button>
            }
          </div>
          <div>
            @if (currentStep() < 4) {
              <button
                type="button"
                (click)="nextStep()"
                class="btn-yellow px-5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                style="color: #111111 !important;"
              >
                <span style="color: #111111 !important;">Continue &rarr;</span>
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LineupComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildStore = inject(GuildStore);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly steps = [
    { num: 1 as LineupStep, label: 'Details' },
    { num: 2 as LineupStep, label: 'Fill Positions' },
    { num: 3 as LineupStep, label: 'Connections' },
    { num: 4 as LineupStep, label: 'Review & Publish' },
  ];

  protected readonly currentStep = signal<LineupStep>(1);
  protected readonly formationList = signal<string[]>([]);
  protected readonly formationLabels = signal<Record<string, string>>({});
  protected readonly slotsByFmt = signal<Record<string, string[]>>({});

  // Form state
  protected readonly draftId = signal<string | null>(null);
  protected title = 'RYVL Match Lineup';
  protected readonly selectedFormation = signal<string>('433');
  protected kickoffDate = getTodayDateString();
  protected kickoffTime = '21:45';
  protected timezone = 'Europe/Bucharest';
  protected primaryColor = '#EAE905';
  protected secondaryColor = '#111111';
  protected readonly channelId = signal<string>('');
  protected readonly selectedRoleIds = signal<string[]>([]);
  protected readonly assignments = signal<LineupAssignments>({});
  protected readonly occurrenceId = signal<string>('');
  protected readonly showEaNames = signal<boolean>(false);
  protected readonly lastPostedMessageId = signal<string | null>(null);
  protected readonly lastPostedAt = signal<string | null>(null);

  // Data
  protected readonly members = signal<LineupMemberOption[]>([]);
  protected readonly occurrences = signal<LineupMatchOccurrence[]>([]);

  // UI state
  protected readonly previewSvg = signal<string>('');
  protected readonly isLoadingPreview = signal<boolean>(false);
  protected readonly isLoadingMembers = signal<boolean>(false);
  protected readonly isSavingDraft = signal<boolean>(false);
  protected readonly isPosting = signal<boolean>(false);
  protected readonly notification = signal<{ message: string; type: 'success' | 'error' } | null>(null);

  protected readonly currentSlots = computed(() => this.slotsByFmt()[this.selectedFormation()] || DEFAULT_SLOTS);

  protected readonly filledCount = computed(() => {
    const assigned = this.assignments();
    return this.currentSlots().filter((s) => Boolean(assigned[s]?.name?.trim())).length;
  });

  protected readonly eaNames = computed(() => eaNamesForAssignments(this.assignments(), this.members()));

  protected readonly selectedOccurrence = computed(
    () => this.occurrences().find((o) => o.occurrenceId === this.occurrenceId()) ?? null,
  );

  protected readonly safePreviewSvg = computed(() => {
    const raw = this.previewSvg();
    if (!raw) return '';
    // Strip XML processing instructions to ensure standard inline HTML SVG rendering
    const clean = raw.replace(/<\?xml[\s\S]*?\?>/gi, '').trim();
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  });

  protected readonly targetChannelName = computed(() => {
    const ch = this.guildStore.activeGuild()?.channels?.find((c) => c.id === this.channelId());
    return ch ? ch.name : 'Not selected';
  });

  protected readonly selectedMentionRolesText = computed(() => {
    const roles = this.guildStore.activeGuild()?.roles || [];
    const selected = this.selectedRoleIds();
    if (!selected.length) return 'None';
    return roles
      .filter((r) => selected.includes(r.id))
      .map((r) => `@${r.name}`)
      .join(', ');
  });

  protected readonly lastPostedAtLabel = computed(() => {
    const at = this.lastPostedAt();
    return at ? this.formatInstant(at, this.timezone) : null;
  });

  private lastLoadedGuildId: string | null = null;

  constructor() {
    effect(() => {
      const active = this.guildStore.activeGuild();
      const guildId = this.guildStore.activeGuildId();
      if (active && (!this.channelId() || guildId !== this.lastLoadedGuildId)) {
        const preferred =
          active.settings?.defaultLineupChannelId ||
          active.defaultLineupChannelId ||
          active.settings?.defaultChannelId ||
          active.channels?.[0]?.id ||
          '';
        this.channelId.set(preferred);
      }
      if (guildId && guildId !== this.lastLoadedGuildId) {
        this.lastLoadedGuildId = guildId;
        void this.initLineupData(guildId);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (guildId && guildId !== this.lastLoadedGuildId) {
      this.lastLoadedGuildId = guildId;
      await this.initLineupData(guildId);
    }
  }

  private async initLineupData(guildId: string): Promise<void> {
    try {
      const res: LineupFormationsResponse = await this.api.getLineupFormations(guildId);
      this.formationList.set(res.formations);
      this.formationLabels.set(res.labels_by_formation);
      this.slotsByFmt.set(res.slots_by_formation);
    } catch (err) {
      console.error('Failed to load formations:', err);
    }

    try {
      this.occurrences.set(await this.api.getLineupOccurrences(guildId));
    } catch (err) {
      console.error('Failed to load match events:', err);
      this.occurrences.set([]);
    }

    const queryDraftId = this.route.snapshot.queryParamMap.get('draftId');
    if (queryDraftId) {
      await this.loadDraft(guildId, queryDraftId);
    }
    await this.refreshMembers();
    await this.refreshPreview();
  }

  async refreshMembers(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;
    this.isLoadingMembers.set(true);
    try {
      this.members.set(await this.api.getLineupMembers(guildId, this.occurrenceId() || null));
    } catch (err) {
      console.error('Failed to refresh members:', err);
    } finally {
      this.isLoadingMembers.set(false);
    }
  }

  private async loadDraft(guildId: string, draftId: string): Promise<void> {
    try {
      const drafts = await this.api.getLineupDrafts(guildId);
      const draft = drafts.find((d) => d.id === draftId);
      if (!draft) {
        this.notification.set({ message: 'That lineup draft no longer exists.', type: 'error' });
        return;
      }
      this.applyDraft(draft);
    } catch (err) {
      console.error('Failed to load draft:', err);
    }
  }

  private applyDraft(draft: LineupDraft): void {
    this.draftId.set(draft.id);
    this.title = draft.title || this.title;
    this.selectedFormation.set(draft.formation || '433');
    if (draft.channelId) this.channelId.set(draft.channelId);
    if (draft.timezone) this.timezone = draft.timezone;
    if (draft.mentionRoleIds) this.selectedRoleIds.set(draft.mentionRoleIds);
    this.assignments.set(normalizeAssignments(draft.assignments));
    this.occurrenceId.set(draft.occurrenceId ?? '');
    this.showEaNames.set(Boolean(draft.showEaNames));
    this.lastPostedMessageId.set(draft.lastPostedMessageId ?? null);
    this.lastPostedAt.set(draft.lastPostedAt ?? null);
    if (draft.kickoffAt) {
      // Kickoff is shown in the draft's own timezone, not UTC.
      const parts = localDateTimeParts(draft.kickoffAt, this.timezone);
      if (parts) {
        this.kickoffDate = parts.date;
        this.kickoffTime = parts.time;
      }
    }
  }

  protected goToStep(step: LineupStep): void {
    this.currentStep.set(step);
    if (step === 2) {
      void this.refreshMembers();
      void this.refreshPreview();
    } else if (step === 4) {
      void this.refreshPreview();
    }
  }

  protected nextStep(): void {
    this.goToStep(Math.min(4, this.currentStep() + 1) as LineupStep);
  }

  protected prevStep(): void {
    this.goToStep(Math.max(1, this.currentStep() - 1) as LineupStep);
  }

  protected onOccurrenceChange(id: string): void {
    this.occurrenceId.set(id || '');
    const occ = this.selectedOccurrence();
    if (occ) {
      const parts = localDateTimeParts(occ.startsAt, this.timezone);
      if (parts) {
        this.kickoffDate = parts.date;
        this.kickoffTime = parts.time;
      }
      if (!this.title || this.title === 'RYVL Match Lineup') this.title = occ.title;
    }
    void this.refreshMembers();
  }

  protected formatOccurrence(iso: string): string {
    return this.formatInstant(iso, this.timezone);
  }

  private formatInstant(iso: string, timeZone: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    } catch {
      return d.toISOString().replace('T', ' ').slice(0, 16);
    }
  }

  protected onFormationChange(newFormation: string): void {
    if (!newFormation || newFormation === this.selectedFormation()) return;
    this.selectedFormation.set(newFormation);

    const newSlots = this.currentSlots();
    const valid = new Set(newSlots);
    const next: LineupAssignments = {};
    const unmapped: LineupAssignments[string][] = [];

    // Keep players whose slot exists in the new formation; queue the rest.
    for (const [slot, entry] of Object.entries(this.assignments())) {
      if (valid.has(slot)) next[slot] = entry;
      else unmapped.push(entry);
    }
    // Place queued players into the remaining empty slots.
    for (const slot of newSlots) {
      if (!next[slot] && unmapped.length > 0) next[slot] = unmapped.shift()!;
    }

    this.assignments.set(next);
    void this.refreshPreview();
  }

  protected unassignSlot(slot: string): void {
    const current = { ...this.assignments() };
    delete current[slot];
    this.assignments.set(current);
    void this.refreshPreview();
  }

  protected clearAllSlots(): void {
    this.assignments.set({});
    void this.refreshPreview();
  }

  private firstEmptySlot(): string | null {
    return this.currentSlots().find((s) => !this.assignments()[s]) ?? null;
  }

  protected onMemberChoice(choice: MemberSlotChoice): void {
    const { member } = choice;
    if (choice.slot === null) {
      const next: LineupAssignments = {};
      for (const [slot, entry] of Object.entries(this.assignments())) {
        const same = entry.discordUserId ? entry.discordUserId === member.discordUserId : entry.name === member.displayName;
        if (!same) next[slot] = entry;
      }
      this.assignments.set(next);
      void this.refreshPreview();
      return;
    }

    const slot = choice.slot || this.firstEmptySlot();
    if (!slot) {
      this.notification.set({
        message: 'All 11 slots are already filled. Use the dropdown to choose which slot to assign.',
        type: 'error',
      });
      return;
    }
    this.assignments.set(
      assignToSlot(this.assignments(), slot, { discordUserId: member.discordUserId, name: member.displayName }),
    );
    void this.refreshPreview();
  }

  protected assignGuestPlayer(guest: { name: string; slot: string }): void {
    const name = guest.name.trim();
    if (!name) {
      this.notification.set({ message: 'Please enter a guest player name.', type: 'error' });
      return;
    }
    const slot = guest.slot || this.firstEmptySlot();
    if (!slot) {
      this.notification.set({
        message: 'All 11 slots are currently filled. Select a specific slot in the dropdown to replace it.',
        type: 'error',
      });
      return;
    }
    this.assignments.set(assignToSlot(this.assignments(), slot, { name }));
    void this.refreshPreview();
  }

  protected async autoFill(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    const occurrenceId = this.occurrenceId();
    if (!guildId || !occurrenceId) return;
    try {
      const res = await this.api.autoFillLineup(guildId, {
        formation: this.selectedFormation(),
        occurrence_id: occurrenceId,
        assignments: this.assignments(),
      });
      this.assignments.set(normalizeAssignments(res.assignments));
      this.notification.set({
        message: res.unplaced.length
          ? `Auto-filled. No slot left for: ${res.unplaced.join(', ')}.`
          : 'Auto-filled accepted players by preferred position.',
        type: 'success',
      });
      void this.refreshPreview();
    } catch (err) {
      this.notification.set({ message: `Auto-fill failed: ${errorMessage(err, 'unknown error')}`, type: 'error' });
    }
  }

  protected toggleEaNames(value?: boolean): void {
    this.showEaNames.set(value ?? !this.showEaNames());
    void this.refreshPreview();
  }

  protected toggleRole(roleId: string): void {
    this.selectedRoleIds.update((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId],
    );
  }

  private buildKickoffDate(): Date | null {
    if (!this.kickoffDate) return null;
    const time = this.kickoffTime || '20:00';
    const tz = this.timezone || 'Europe/Bucharest';
    try {
      const naive = new Date(`${this.kickoffDate}T${time}:00.000Z`);
      if (isNaN(naive.getTime())) return null;
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(naive);
      const get = (type: string) => parts.find((p) => p.type === type)?.value;
      const hour = get('hour') === '24' ? '00' : get('hour');
      const inTz = new Date(`${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}Z`);
      return new Date(naive.getTime() - (inTz.getTime() - naive.getTime()));
    } catch {
      const fallback = new Date(`${this.kickoffDate}T${time}:00Z`);
      return isNaN(fallback.getTime()) ? null : fallback;
    }
  }

  protected kickoffLines(): string[] {
    const d = this.buildKickoffDate();
    if (!d) return ['Kickoff pending'];
    return [`🇷🇴 ${this.formatInstant(d.toISOString(), 'Europe/Bucharest')}`, `🇬🇧 ${this.formatInstant(d.toISOString(), 'Europe/London')}`];
  }

  private renderPayload(): LineupRenderPayload {
    return {
      formation: this.selectedFormation(),
      title: this.title,
      assignments: this.assignments(),
      ea_names: this.eaNames(),
      show_ea_names: this.showEaNames(),
      kickoff_at: this.buildKickoffDate()?.toISOString() || null,
      primary_color: this.primaryColor,
      secondary_color: this.secondaryColor,
      show_slot_tags: true,
    };
  }

  protected async refreshPreview(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;
    this.isLoadingPreview.set(true);
    try {
      const res = await this.api.renderLineup(guildId, this.renderPayload());
      if (res?.svg) this.previewSvg.set(res.svg);
    } catch (err) {
      console.error('Failed to render lineup preview:', err);
    } finally {
      this.isLoadingPreview.set(false);
    }
  }

  private draftPayload(): LineupDraftPayload {
    return {
      title: this.title,
      channel_id: this.channelId() || null,
      formation: this.selectedFormation(),
      kickoff_at: this.buildKickoffDate()?.toISOString() || null,
      timezone: this.timezone,
      mention_role_ids: this.selectedRoleIds(),
      assignments: this.assignments(),
      occurrence_id: this.occurrenceId() || null,
      show_ea_names: this.showEaNames(),
    };
  }

  /** Creates or updates the draft; returns its id. */
  private async persistDraft(guildId: string): Promise<string> {
    const id = this.draftId();
    const saved = id
      ? await this.api.updateLineupDraft(guildId, id, this.draftPayload())
      : await this.api.createLineupDraft(guildId, this.draftPayload());
    this.draftId.set(saved.id);
    this.lastPostedMessageId.set(saved.lastPostedMessageId ?? null);
    this.lastPostedAt.set(saved.lastPostedAt ?? null);
    return saved.id;
  }

  protected async saveDraft(): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId) return;
    this.isSavingDraft.set(true);
    try {
      await this.persistDraft(guildId);
      this.notification.set({ message: 'Lineup draft saved successfully!', type: 'success' });
    } catch (err) {
      console.error('Failed to save draft:', err);
      this.notification.set({ message: `Failed to save lineup draft: ${errorMessage(err, 'unknown error')}`, type: 'error' });
    } finally {
      this.isSavingDraft.set(false);
    }
  }

  protected async publishToDiscord(updateExisting = false): Promise<void> {
    const guildId = this.guildStore.activeGuildId();
    if (!guildId || !this.channelId()) {
      this.notification.set({ message: 'Please select a Discord target channel in Step 3.', type: 'error' });
      return;
    }

    this.isPosting.set(true);
    try {
      // Save first so the posted message is recorded on the draft and can be updated later.
      const draftId = await this.persistDraft(guildId);
      const payload: LineupPostPayload = {
        ...this.renderPayload(),
        channel_id: this.channelId(),
        mention_role_ids: this.selectedRoleIds(),
        draft_id: draftId,
        update_existing: updateExisting && Boolean(this.lastPostedMessageId()),
      };
      const res = await this.api.postLineup(guildId, payload);
      this.lastPostedMessageId.set(res.message_id);
      this.lastPostedAt.set(new Date().toISOString());
      this.notification.set({
        message: res.updated ? 'Posted lineup updated in Discord.' : 'Lineup graphic posted to Discord.',
        type: 'success',
      });
    } catch (err) {
      console.error('Failed to post lineup to Discord:', err);
      this.notification.set({
        message: `Failed to post lineup: ${errorMessage(err, 'Check bot permissions')}`,
        type: 'error',
      });
    } finally {
      this.isPosting.set(false);
    }
  }
}
