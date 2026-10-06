import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AdminSectionComponent, SectionTab, TabLoadingComponent, sectionTabs } from './admin-section';
import { VpgNotificationsComponent } from '../performance/vpg-notifications.component';
import { VpgTransfersComponent } from '../vpg-transfers/vpg-transfers.component';
import { AdminSuperligaAwardsComponent } from '../superliga-awards/admin-superliga-awards.component';

type SuperligaTab = 'notifications' | 'transfers' | 'awards';
const TABS: readonly SectionTab<SuperligaTab>[] = [
  // Was part of the RYVL-only Performance page; stays RYVL-only.
  { id: 'notifications', label: 'Notifications', ryvlOnly: true },
  { id: 'transfers', label: 'Transfers' },
  { id: 'awards', label: 'Awards' },
];

@Component({
  selector: 'app-superliga-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminSectionComponent, TabLoadingComponent, VpgNotificationsComponent, VpgTransfersComponent, AdminSuperligaAwardsComponent],
  template: `
    <app-admin-section title="Superliga" [tabs]="tabs.visible()" [active]="tabs.active()">
      @switch (tabs.active()) {
        @case ('notifications') { @defer { <app-vpg-notifications /> } @placeholder { <app-tab-loading /> } }
        @case ('transfers') { @defer { <app-vpg-transfers /> } @placeholder { <app-tab-loading /> } }
        @case ('awards') { @defer { <app-admin-superliga-awards /> } @placeholder { <app-tab-loading /> } }
      }
    </app-admin-section>
  `,
})
export class SuperligaSectionComponent {
  readonly tabs = sectionTabs(TABS);
}
