import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RsvpCounts } from '../../core/models';

@Component({
  selector: 'app-rsvp-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#16213e] border border-slate-700/60 text-xs font-medium shadow-sm">
      <span class="inline-flex items-center gap-1 text-emerald-400" title="Accepted">
        <span class="text-xs">✅</span>
        <span class="font-semibold">{{ acceptedCount() }}</span>
      </span>
      <span class="text-slate-600">|</span>
      <span class="inline-flex items-center gap-1 text-amber-400" title="Tentative">
        <span class="text-xs">❓</span>
        <span class="font-semibold">{{ tentativeCount() }}</span>
      </span>
      <span class="text-slate-600">|</span>
      <span class="inline-flex items-center gap-1 text-rose-400" title="Declined">
        <span class="text-xs">❌</span>
        <span class="font-semibold">{{ declinedCount() }}</span>
      </span>
    </div>
  `,
  styles: ``,
})
export class RsvpBadgeComponent {
  readonly counts = input<RsvpCounts | null | undefined>(undefined);
  readonly accepted = input<number | undefined>(undefined);
  readonly tentative = input<number | undefined>(undefined);
  readonly declined = input<number | undefined>(undefined);

  readonly acceptedCount = computed(() => {
    const c = this.counts();
    if (c) return c.accepted ?? 0;
    return this.accepted() ?? 0;
  });

  readonly tentativeCount = computed(() => {
    const c = this.counts();
    if (c) return c.tentative ?? 0;
    return this.tentative() ?? 0;
  });

  readonly declinedCount = computed(() => {
    const c = this.counts();
    if (c) return c.declined ?? 0;
    return this.declined() ?? 0;
  });
}
