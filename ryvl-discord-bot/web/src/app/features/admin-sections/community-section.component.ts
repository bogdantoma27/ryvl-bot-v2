import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AdminSectionComponent, SectionTab, TabLoadingComponent, sectionTabs } from './admin-section';
import { EventListComponent } from '../events/event-list.component';
import { AdminTournamentsComponent } from '../tournaments/admin-tournaments.component';

type CommunityTab = 'events' | 'tournaments';
const TABS: readonly SectionTab<CommunityTab>[] = [
  { id: 'events', label: 'Events' },
  { id: 'tournaments', label: 'Tournaments' },
];

// Creating and viewing a single event stay on their own routes (/admin/events/new, /admin/events/:id).
@Component({
  selector: 'app-community-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminSectionComponent, TabLoadingComponent, EventListComponent, AdminTournamentsComponent],
  template: `
    <app-admin-section title="Community" [tabs]="tabs.visible()" [active]="tabs.active()">
      @switch (tabs.active()) {
        @case ('events') { @defer { <app-event-list /> } @placeholder { <app-tab-loading /> } }
        @case ('tournaments') { @defer { <app-admin-tournaments /> } @placeholder { <app-tab-loading /> } }
      }
    </app-admin-section>
  `,
})
export class CommunitySectionComponent {
  readonly tabs = sectionTabs(TABS);
}
