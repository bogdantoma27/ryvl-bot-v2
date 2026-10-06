import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PUBLISH_LEAD_OPTIONS } from './event-display';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type MonthlyRule = 'day_of_month' | 'nth_weekday';
export type RecurrenceEnd = 'never' | 'after_count' | 'on_date';

const WEEKDAYS = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 0, label: 'Sun' },
];

/** Repeat rules for an event (one-time vs. recurring, frequency, end, announcement lead). */
@Component({
  selector: 'app-recurrence-builder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <!-- Toggle One-time vs Recurring -->
    <div class="p-4 rounded-xl bg-[#1a1a2e] border border-slate-700 flex items-center justify-between">
      <div>
        <div class="text-sm font-semibold text-white">Recurring Event</div>
        <div class="text-xs text-slate-400">Automatically generate future occurrences and post RSVP alerts</div>
      </div>
      <label class="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          [checked]="isRecurring()"
          (change)="isRecurring.set(!isRecurring())"
          class="sr-only peer"
        />
        <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5865F2]"></div>
      </label>
    </div>

    @if (isRecurring()) {
      <div class="space-y-4 pt-2">
        <!-- Frequency -->
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">Frequency</label>
          <select
            [ngModel]="frequency()"
            (ngModelChange)="frequency.set($event)"
            class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2] transition"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly (Every 2 weeks)</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <!-- Weekday checkboxes (if Weekly or Biweekly) -->
        @if (frequency() === 'weekly' || frequency() === 'biweekly') {
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-2">Repeat on Days</label>
            <div class="flex flex-wrap gap-2">
              @for (day of weekdayOptions; track day.id) {
                <button
                  type="button"
                  (click)="toggleWeekday(day.id)"
                  class="px-3.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer"
                  [class.bg-[#5865F2]]="weekdays().includes(day.id)"
                  [class.border-[#5865F2]]="weekdays().includes(day.id)"
                  [class.text-white]="weekdays().includes(day.id)"
                  [class.shadow-sm]="weekdays().includes(day.id)"
                  [class.bg-slate-800]="!weekdays().includes(day.id)"
                  [class.border-slate-700]="!weekdays().includes(day.id)"
                  [class.text-slate-200]="!weekdays().includes(day.id)"
                >
                  {{ day.label }}
                </button>
              }
            </div>
          </div>
        }

        <!-- Monthly Options -->
        @if (frequency() === 'monthly') {
          <div class="space-y-2">
            <label class="block text-xs font-semibold text-slate-300 mb-1">Monthly Rule</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                (click)="monthlyType.set('day_of_month')"
                class="p-3 rounded-lg border cursor-pointer flex items-center gap-2"
                [class.border-[#5865F2]]="monthlyType() === 'day_of_month'"
                [class.bg-indigo-500/10]="monthlyType() === 'day_of_month'"
                [class.border-slate-700]="monthlyType() !== 'day_of_month'"
              >
                <input type="radio" name="monthlyRule" [checked]="monthlyType() === 'day_of_month'" class="text-[#5865F2]" />
                <span class="text-xs text-slate-200">On this day of the month</span>
              </label>
              <label
                (click)="monthlyType.set('nth_weekday')"
                class="p-3 rounded-lg border cursor-pointer flex items-center gap-2"
                [class.border-[#5865F2]]="monthlyType() === 'nth_weekday'"
                [class.bg-indigo-500/10]="monthlyType() === 'nth_weekday'"
                [class.border-slate-700]="monthlyType() !== 'nth_weekday'"
              >
                <input type="radio" name="monthlyRule" [checked]="monthlyType() === 'nth_weekday'" class="text-[#5865F2]" />
                <span class="text-xs text-slate-200">On the Nth weekday</span>
              </label>
            </div>
          </div>
        }

        <!-- End Condition -->
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">End Condition</label>
          <select
            [ngModel]="endCondition()"
            (ngModelChange)="endCondition.set($event)"
            class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2] transition"
          >
            <option value="never">Never (Keep generating)</option>
            <option value="after_count">After a specific number of occurrences</option>
            <option value="on_date">On a specific date</option>
          </select>

          @if (endCondition() === 'after_count') {
            <div class="mt-2 flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="52"
                [ngModel]="endCount()"
                (ngModelChange)="endCount.set($event)"
                class="w-28 bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              />
              <span class="text-xs text-slate-400">occurrences</span>
            </div>
          }

          @if (endCondition() === 'on_date') {
            <div class="mt-2">
              <input
                type="date"
                [ngModel]="endDate()"
                (ngModelChange)="endDate.set($event)"
                class="w-full sm:w-64 bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              />
            </div>
          }
        </div>

        <!-- Announcement lead time -->
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">Announce later dates</label>
          <select
            [ngModel]="publishLeadMinutes()"
            (ngModelChange)="publishLeadMinutes.set(+$event)"
            class="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5865F2] transition"
          >
            @for (option of leadOptions; track option.minutes) {
              <option [value]="option.minutes">{{ option.label }}</option>
            }
          </select>
          <p class="text-[11px] text-slate-400 mt-1">The first date is announced right away; each later date is posted this long before kickoff.</p>
        </div>
      </div>
    }
  `,
})
export class RecurrenceBuilderComponent {
  readonly isRecurring = model<boolean>(false);
  readonly frequency = model<RecurrenceFrequency>('weekly');
  readonly weekdays = model<number[]>([1]);
  readonly monthlyType = model<MonthlyRule>('day_of_month');
  readonly endCondition = model<RecurrenceEnd>('never');
  readonly endCount = model<number>(5);
  readonly endDate = model<string>('');
  readonly publishLeadMinutes = model<number>(2880);

  readonly weekdayOptions = WEEKDAYS;
  readonly leadOptions = PUBLISH_LEAD_OPTIONS;

  toggleWeekday(dayId: number): void {
    const current = this.weekdays();
    if (current.includes(dayId)) {
      if (current.length > 1) {
        this.weekdays.set(current.filter((d) => d !== dayId));
      }
    } else {
      this.weekdays.set([...current, dayId]);
    }
  }
}
