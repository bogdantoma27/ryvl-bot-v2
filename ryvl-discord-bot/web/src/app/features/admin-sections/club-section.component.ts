import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AdminSectionComponent, SectionTab, TabLoadingComponent, sectionTabs } from './admin-section';
import { EaTrackerComponent } from '../ea-tracker/ea-tracker.component';
import { LineupComponent } from '../lineup/lineup.component';
import { LineupDraftsComponent } from '../lineup/lineup-drafts.component';
import { AdminPerformanceComponent } from '../performance/admin-performance.component';

type ClubTab = 'tracker' | 'lineup' | 'drafts' | 'performance';
const TABS: readonly SectionTab<ClubTab>[] = [
  { id: 'tracker', label: 'EA Tracker' },
  { id: 'lineup', label: 'Lineup' },
  { id: 'drafts', label: 'Lineup drafts' },
  { id: 'performance', label: 'Performance', ryvlOnly: true },
];

// Each tab is a @defer block, so its code is only downloaded when the tab opens.
@Component({
  selector: 'app-club-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminSectionComponent, TabLoadingComponent, EaTrackerComponent, LineupComponent, LineupDraftsComponent, AdminPerformanceComponent],
  template: `
    <app-admin-section title="Club" [tabs]="tabs.visible()" [active]="tabs.active()">
      @switch (tabs.active()) {
        @case ('tracker') { @defer { <app-ea-tracker /> } @placeholder { <app-tab-loading /> } }
        @case ('lineup') { @defer { <app-lineup /> } @placeholder { <app-tab-loading /> } }
        @case ('drafts') { @defer { <app-lineup-drafts /> } @placeholder { <app-tab-loading /> } }
        @case ('performance') { @defer { <app-admin-performance /> } @placeholder { <app-tab-loading /> } }
      }
    </app-admin-section>
  `,
})
export class ClubSectionComponent {
  readonly tabs = sectionTabs(TABS);
}
