import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AdminSectionComponent, SectionTab, TabLoadingComponent, sectionTabs } from './admin-section';
import { SettingsComponent } from '../settings/settings.component';
import { ChannelsComponent } from '../settings/channels.component';
import { WebsiteFormsComponent } from '../settings/website-forms.component';

type ServerTab = 'general' | 'channels' | 'forms';
const TABS: readonly SectionTab<ServerTab>[] = [
  { id: 'general', label: 'General' },
  { id: 'channels', label: 'Channels' },
  { id: 'forms', label: 'Website forms' },
];

@Component({
  selector: 'app-server-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminSectionComponent, TabLoadingComponent, SettingsComponent, ChannelsComponent, WebsiteFormsComponent],
  template: `
    <app-admin-section title="Server" [tabs]="tabs.visible()" [active]="tabs.active()">
      @switch (tabs.active()) {
        @case ('general') { @defer { <app-settings /> } @placeholder { <app-tab-loading /> } }
        @case ('channels') { @defer { <app-channels /> } @placeholder { <app-tab-loading /> } }
        @case ('forms') { @defer { <app-website-forms /> } @placeholder { <app-tab-loading /> } }
      }
    </app-admin-section>
  `,
})
export class ServerSectionComponent {
  readonly tabs = sectionTabs(TABS);
}
