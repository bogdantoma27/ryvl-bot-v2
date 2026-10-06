import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LineupAssignments, LineupMemberOption } from '../../core/models';
import { rsvpLabel, slotForMember } from './lineup-assignments';

export interface MemberSlotChoice {
  member: LineupMemberOption;
  /** Target slot, '' for the first empty slot, or null to remove from the pitch. */
  slot: string | null;
}

/**
 * Server members (accepted RSVPs first when a match event is linked) with their
 * EA name and preferred position, plus a guest/trialist input.
 */
@Component({
  selector: 'app-lineup-member-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
      <!-- Custom Trialist / Player Name Input (4 cols) -->
      <div class="md:col-span-4 bg-[#11192e] p-4 rounded-xl border border-slate-700/80 space-y-3">
        <div class="text-xs font-bold text-slate-200 flex items-center gap-1.5">
          <svg class="w-4 h-4 text-[#EAE905]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>Add Guest / Trialist</span>
        </div>
        <p class="text-[11px] text-slate-400">Type any player name and choose which formation position to place them in.</p>
        <div class="space-y-2">
          <input
            type="text"
            [(ngModel)]="guestName"
            placeholder="e.g. GuestPlayer"
            (keyup.enter)="submitGuest()"
            class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#EAE905]"
          />
          <select
            [(ngModel)]="guestSlot"
            class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#EAE905] cursor-pointer"
          >
            <option value="">First empty position</option>
            @for (slot of slots(); track slot) {
              <option [value]="slot">
                {{ slot.toUpperCase() }}{{ assignments()[slot] ? ' (' + assignments()[slot].name + ')' : '' }}
              </option>
            }
          </select>
          <button
            type="button"
            (click)="submitGuest()"
            class="btn-yellow w-full text-xs font-bold py-2 px-3 rounded-lg shadow-sm transition cursor-pointer"
            style="color: #111111 !important;"
          >
            <span style="color: #111111 !important;">Assign Guest Player</span>
          </button>
        </div>
      </div>

      <!-- Server Members Roster (8 cols) -->
      <div class="md:col-span-8 bg-[#11192e] p-4 rounded-xl border border-slate-700/80 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-white">Server Members</span>
            <span class="text-[11px] text-slate-400">({{ filteredMembers().length }} members)</span>
            @if (hasOccurrence()) {
              <span class="text-[11px] text-emerald-400">{{ acceptedCount() }} accepted</span>
            }
          </div>
          <div class="flex items-center gap-2">
            @if (isLoading()) {
              <span class="text-[11px] text-amber-400">Loading roster...</span>
            }
            <button
              type="button"
              (click)="autoFill.emit()"
              [disabled]="!hasOccurrence() || acceptedCount() === 0"
              [title]="hasOccurrence() ? 'Place accepted players by their registered preferred position' : 'Link a match event in step 1 first'"
              class="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-700/70 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold cursor-pointer"
            >
              Auto-fill by preferred position
            </button>
          </div>
        </div>

        <input
          type="text"
          [ngModel]="search()"
          (ngModelChange)="search.set($event)"
          placeholder="Search members or EA names..."
          class="w-full bg-[#16213e] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#EAE905]"
        />

        <div class="max-h-[260px] overflow-y-auto space-y-1.5 pr-1">
          @for (m of filteredMembers(); track m.discordUserId) {
            <div class="flex items-center justify-between p-2 rounded-lg bg-[#16213e]/70 hover:bg-[#1f2e54] border border-slate-800 transition">
              <div class="flex items-center gap-2.5 min-w-0">
                @if (m.avatarUrl) {
                  <img [src]="m.avatarUrl" [alt]="m.displayName" class="w-6 h-6 rounded-full object-cover shrink-0" />
                } @else {
                  <div class="w-6 h-6 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center text-[10px] font-bold shrink-0">
                    {{ m.displayName.charAt(0).toUpperCase() || '?' }}
                  </div>
                }
                <div class="min-w-0">
                  <span class="text-xs font-medium text-slate-200 block truncate">{{ m.displayName }}</span>
                  <span class="text-[10px] text-slate-400 block truncate">
                    @if (hasOccurrence()) {
                      <span
                        [class.text-emerald-400]="m.rsvpStatus === 'ACCEPTED'"
                        [class.text-amber-400]="m.rsvpStatus === 'TENTATIVE'"
                        [class.text-rose-400]="m.rsvpStatus === 'DECLINED'"
                      >{{ rsvpLabel(m.rsvpStatus) }}</span>
                      ·
                    }
                    @if (m.eaPlayerName) {
                      EA: <span class="text-slate-200">{{ m.eaPlayerName }}</span>
                    } @else {
                      Not registered
                    }
                    @if (m.preferredPos) {
                      · {{ m.preferredPos }}
                    }
                  </span>
                  @if (slotOf(m)) {
                    <span class="text-[10px] text-[#EAE905] font-semibold">Assigned: {{ slotOf(m)?.toUpperCase() }}</span>
                  }
                </div>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <select
                  [value]="slotOf(m) || ''"
                  (change)="onSelect(m, $event)"
                  class="bg-[#11192e] border border-slate-700 rounded px-2 py-1 text-[11px] text-[#EAE905] focus:outline-none cursor-pointer"
                >
                  <option value="">{{ slotOf(m) ? 'Move slot...' : 'Assign slot...' }}</option>
                  @if (slotOf(m)) {
                    <option value="__unassign__">Unassign from pitch</option>
                  }
                  @for (slot of slots(); track slot) {
                    <option [value]="slot">
                      {{ slot.toUpperCase() }}{{ assignments()[slot] ? ' (' + assignments()[slot].name + ')' : '' }}
                    </option>
                  }
                </select>

                @if (slotOf(m)) {
                  <button
                    type="button"
                    (click)="choose.emit({ member: m, slot: null })"
                    title="Remove from pitch"
                    class="text-xs text-rose-400 hover:text-rose-300 px-1.5 py-0.5 rounded hover:bg-rose-950/40 cursor-pointer"
                  >
                    &times;
                  </button>
                } @else {
                  <button
                    type="button"
                    (click)="choose.emit({ member: m, slot: '' })"
                    title="Quick assign to next open position"
                    class="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                  >
                    + Add
                  </button>
                }
              </div>
            </div>
          } @empty {
            <div class="text-center py-6 text-xs text-slate-500">
              @if (isLoading()) {
                Loading server members...
              } @else {
                No members found. Click "Refresh Roster" above if members didn't load.
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class LineupMemberPickerComponent {
  readonly members = input.required<LineupMemberOption[]>();
  readonly slots = input.required<string[]>();
  readonly assignments = input.required<LineupAssignments>();
  readonly hasOccurrence = input<boolean>(false);
  readonly isLoading = input<boolean>(false);

  readonly choose = output<MemberSlotChoice>();
  readonly assignGuest = output<{ name: string; slot: string }>();
  readonly autoFill = output<void>();

  protected readonly search = signal('');
  protected guestName = '';
  protected guestSlot = '';
  protected readonly rsvpLabel = rsvpLabel;

  protected readonly acceptedCount = computed(() => this.members().filter((m) => m.rsvpStatus === 'ACCEPTED').length);

  protected readonly filteredMembers = computed(() => {
    const query = this.search().trim().toLowerCase();
    if (!query) return this.members();
    return this.members().filter((m) =>
      [m.displayName, m.username, m.eaPlayerName].some((value) => (value || '').toLowerCase().includes(query)),
    );
  });

  protected slotOf(member: LineupMemberOption): string | null {
    return slotForMember(this.assignments(), member);
  }

  protected onSelect(member: LineupMemberOption, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    select.value = '';
    if (!value) return;
    this.choose.emit({ member, slot: value === '__unassign__' ? null : value });
  }

  protected submitGuest(): void {
    this.assignGuest.emit({ name: this.guestName.trim(), slot: this.guestSlot });
    if (this.guestName.trim()) {
      this.guestName = '';
      this.guestSlot = '';
    }
  }
}
