import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { VpgMatchItem } from '../../core/models';
import { isRyvlName, romanianMatchDate } from './presentation';

@Component({
  selector: 'app-matches-panel', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4" [attr.aria-label]="heading()">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-xl font-semibold text-white">{{ heading() }}</h2>
        <span class="text-xs text-slate-400">Kickoff times: Romania</span>
      </div>
      @if(matches().length === 0) {
        <div class="public-empty" role="status">
          <p class="font-medium text-slate-200">{{ emptyMessage() }}</p>
          <p class="mt-1 text-sm text-slate-400">This section updates when VPG publishes new information.</p>
        </div>
      } @else {
        <div class="space-y-3">
          @for (match of matches(); track match.id) {
            <article class="public-card p-4 sm:p-5" [attr.aria-label]="match.homeName + ' versus ' + match.awayName">
              <div class="flex flex-wrap justify-between gap-2 text-xs text-slate-400 mb-3">
                <span>Matchday {{ match.matchDay || '—' }}</span>
                <time [attr.datetime]="match.datetime">{{ dateLabel(match.datetime) }}</time>
              </div>
              <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
                <div class="flex items-center gap-2 min-w-0">
                  @if(match.homeLogoUrl) { <img [src]="match.homeLogoUrl" alt="" loading="lazy" class="h-7 w-7 sm:h-9 sm:w-9 object-contain shrink-0" /> }
                  <span class="text-sm font-semibold break-words" [class.ryvl-highlight]="isRyvl(match.homeName)">{{ match.homeName }}</span>
                </div>
                <div class="text-center shrink-0">
                  @if(match.status === 'complete') {
                    <span class="inline-block rounded-lg bg-black/40 border border-white/10 px-3 py-1.5 font-semibold tabular-nums text-white">{{ match.homeScore ?? '—' }} : {{ match.awayScore ?? '—' }}</span>
                    <span class="block mt-1 text-[11px] text-emerald-400">Final</span>
                  } @else { <span class="px-2 text-xs font-medium text-slate-400">VS</span> }
                </div>
                <div class="flex items-center justify-end gap-2 min-w-0 text-right">
                  <span class="text-sm font-semibold break-words" [class.ryvl-highlight]="isRyvl(match.awayName)">{{ match.awayName }}</span>
                  @if(match.awayLogoUrl) { <img [src]="match.awayLogoUrl" alt="" loading="lazy" class="h-7 w-7 sm:h-9 sm:w-9 object-contain shrink-0" /> }
                </div>
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
})
export class MatchesPanelComponent {
  readonly matches = input<readonly VpgMatchItem[]>([]);
  readonly heading = input('Match results');
  readonly emptyMessage = input('No matches to show yet.');
  readonly isRyvl = isRyvlName;
  readonly dateLabel = romanianMatchDate;
}
