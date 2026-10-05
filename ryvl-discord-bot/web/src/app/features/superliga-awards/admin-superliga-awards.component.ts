import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AdminTotwComponent } from '../totw/admin-totw.component';
import { AdminSuperligaMvpComponent } from '../superliga-mvp/admin-superliga-mvp.component';

type AwardsTab = 'mvp' | 'totw';

// Superliga Awards: the weekly Team of the Week and the season MVP race on one page.
// They are linked: Team of the Week picks break ties between equal MVP scores.
@Component({
  selector: 'app-admin-superliga-awards',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminTotwComponent, AdminSuperligaMvpComponent],
  template: `
    <div class="max-w-7xl w-full mx-auto space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-black text-white tracking-tight">🏆 Superliga Awards</h1>
          <p class="text-xs text-slate-400 mt-0.5">
            Weekly Team of the Week and the season MVP race. Each posted Team of the Week is saved and breaks ties between equal MVP scores.
          </p>
        </div>
        <div class="inline-flex rounded-xl bg-[#11192e] border border-slate-800 p-1 self-start" role="tablist">
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'mvp'" (click)="select('mvp')"
            class="px-4 py-1.5 rounded-lg text-xs font-bold transition"
            [class]="tab() === 'mvp' ? 'bg-amber-500 text-black' : 'text-slate-300 hover:text-white'">
            🏅 MVP race
          </button>
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'totw'" (click)="select('totw')"
            class="px-4 py-1.5 rounded-lg text-xs font-bold transition"
            [class]="tab() === 'totw' ? 'bg-amber-500 text-black' : 'text-slate-300 hover:text-white'">
            ⭐ Team of the Week
          </button>
        </div>
      </div>

      @if (tab() === 'mvp') {
        <app-admin-superliga-mvp />
      } @else {
        <app-admin-totw />
      }
    </div>
  `,
})
export class AdminSuperligaAwardsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tabParam = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('tab'))), { initialValue: null });

  readonly tab = computed<AwardsTab>(() => (this.tabParam() === 'totw' ? 'totw' : 'mvp'));

  select(tab: AwardsTab): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab }, replaceUrl: true });
  }
}
