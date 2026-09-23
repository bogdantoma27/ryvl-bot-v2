import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { VpgStandingsRow } from '../../core/models';
import { isRyvlName } from './presentation';
@Component({
  selector: 'app-standings-panel', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4" aria-label="League standings">
      <h2 class="text-xl font-semibold text-white">League table</h2>
      @if(rows().length === 0) {
        <div class="public-empty" role="status">The league table is not available yet.</div>
      } @else {
        <div class="public-card overflow-x-auto" tabindex="0" role="region" aria-label="League table; scroll horizontally on smaller screens">
          <table class="w-full min-w-[620px] text-sm text-left tabular-nums">
            <caption class="sr-only">Competition standings. RYVL Esports is highlighted.</caption>
            <thead class="text-xs text-slate-400 bg-white/[0.025]">
              <tr><th scope="col" class="p-4">Pos</th><th scope="col" class="p-4">Team</th><th scope="col" class="p-3">P</th><th scope="col" class="p-3">W</th><th scope="col" class="p-3">D</th><th scope="col" class="p-3">L</th><th scope="col" class="p-3">GF</th><th scope="col" class="p-3">GA</th><th scope="col" class="p-3">GD</th><th scope="col" class="p-4">Pts</th></tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.teamSlug || row.teamName) {
                <tr class="border-t border-white/[0.06]" [class.bg-yellow-400/5]="isRyvl(row.teamName)">
                  <td class="p-4 text-slate-400">{{ row.position }}</td>
                  <th scope="row" class="p-4 font-semibold" [class.ryvl-highlight]="isRyvl(row.teamName)">
                    <span class="flex items-center gap-2">@if(row.teamLogoUrl) { <img [src]="row.teamLogoUrl" loading="lazy" alt="" class="h-6 w-6 object-contain" /> } {{ row.teamName }}</span>
                  </th>
                  <td class="p-3">{{ row.played }}</td><td class="p-3">{{ row.wins }}</td><td class="p-3">{{ row.draws }}</td><td class="p-3">{{ row.losses }}</td><td class="p-3">{{ row.scoreFor }}</td><td class="p-3">{{ row.scoreAgainst }}</td><td class="p-3">{{ row.goalDifference > 0 ? '+' : '' }}{{ row.goalDifference }}</td><td class="p-4 font-bold text-white">{{ row.points }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class StandingsPanelComponent {
  readonly rows = input<readonly VpgStandingsRow[]>([]);
  readonly isRyvl = isRyvlName;
}
