import { ChangeDetectionStrategy, Component, Signal, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { GuildStore } from '../../core/guild.store';

export interface SectionTab<T extends string = string> {
  id: T;
  label: string;
  /** Shown only while a RYVL server is active (as the old RYVL-only pages were). */
  ryvlOnly?: boolean;
}

/**
 * The tab of a section page comes from `?tab=`; an unknown or hidden tab falls back
 * to the first visible one. Nested tabs inside a tab use `?view=`.
 */
export function sectionTabs<T extends string>(tabs: readonly SectionTab<T>[]): {
  visible: Signal<SectionTab<T>[]>;
  active: Signal<T>;
} {
  const route = inject(ActivatedRoute);
  const store = inject(GuildStore);
  const param = toSignal(route.queryParamMap.pipe(map((p) => p.get('tab'))), { initialValue: null });
  const visible = computed(() => tabs.filter((t) => !t.ryvlOnly || store.isRyvlGuild()));
  const active = computed<T>(() => {
    const list = visible();
    return (list.find((t) => t.id === param()) ?? list[0] ?? tabs[0]).id;
  });
  return { visible, active };
}

/** Shared header of the tabbed admin sections: section name and its tab bar. */
@Component({
  selector: 'app-admin-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="max-w-7xl w-full mx-auto space-y-6">
      <div class="border-b border-slate-700/60">
        <p class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{{ title() }}</p>
        <nav class="mt-2 -mb-px flex gap-1 overflow-x-auto" role="tablist" [attr.aria-label]="title() + ' sections'">
          @for (t of tabs(); track t.id) {
            <a
              role="tab"
              [routerLink]="[]"
              [queryParams]="{ tab: t.id }"
              [attr.aria-selected]="t.id === active()"
              [attr.aria-current]="t.id === active() ? 'page' : null"
              class="shrink-0 px-3.5 py-2 text-xs font-bold border-b-2 transition whitespace-nowrap"
              [class]="t.id === active() ? 'border-[#5865F2] text-white' : 'border-transparent text-slate-400 hover:text-white hover:border-slate-600'"
            >
              {{ t.label }}
            </a>
          }
        </nav>
      </div>
      <ng-content />
    </div>
  `,
})
export class AdminSectionComponent {
  readonly title = input.required<string>();
  readonly tabs = input.required<SectionTab[]>();
  readonly active = input.required<string>();
}

/** Placeholder while a tab's code is downloaded. */
@Component({
  selector: 'app-tab-loading',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="py-10 text-center text-xs text-slate-400" role="status">Loading…</p>`,
})
export class TabLoadingComponent {}
