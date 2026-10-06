import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LineupAssignments } from '../../core/models';

/** Grid of formation slots with the player assigned to each. */
@Component({
  selector: 'app-lineup-slot-board',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-[#11192e] p-4 rounded-xl border border-slate-700/80">
      <div class="text-xs font-bold text-white mb-2.5 flex items-center justify-between">
        <span>Formation Slot Assignments ({{ formation() }})</span>
        <span class="text-[11px] text-slate-400">Click &times; to unassign a slot</span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        @for (slot of slots(); track slot) {
          <div
            class="p-2 rounded-lg border text-xs flex flex-col justify-between transition"
            [class.bg-slate-800]="!assignments()[slot]"
            [class.border-slate-700]="!assignments()[slot]"
            [class.bg-emerald-950/40]="!!assignments()[slot]"
            [class.border-emerald-700/60]="!!assignments()[slot]"
          >
            <div class="flex items-center justify-between">
              <span class="font-bold text-[#EAE905] uppercase text-[11px]">{{ slot }}</span>
              @if (assignments()[slot]) {
                <button
                  type="button"
                  (click)="unassign.emit(slot)"
                  title="Unassign slot"
                  class="text-slate-400 hover:text-rose-400 text-sm leading-none cursor-pointer"
                >
                  &times;
                </button>
              }
            </div>
            <div class="mt-1 truncate font-medium text-[11px]" [class.text-white]="assignments()[slot]" [class.text-slate-500]="!assignments()[slot]">
              {{ assignments()[slot]?.name || 'Empty' }}
            </div>
            @if (eaNames()[slot]) {
              <div class="truncate text-[10px] text-[#EAE905]/80" title="EA name">{{ eaNames()[slot] }}</div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class LineupSlotBoardComponent {
  readonly formation = input.required<string>();
  readonly slots = input.required<string[]>();
  readonly assignments = input.required<LineupAssignments>();
  readonly eaNames = input<Record<string, string>>({});
  readonly unassign = output<string>();
}
