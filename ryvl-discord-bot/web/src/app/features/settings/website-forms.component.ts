import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { GuildStore } from '../../core/guild.store';
import { WebsiteSubmissionItem } from '../../core/models';

const LABELS: Record<string, string> = {
  name: 'Name', contact: 'Contact', topic: 'Topic', message: 'Message',
  gamertag: 'Gamertag', discordTag: 'Discord', primaryPosition: 'Position',
  secondaryPosition: 'Secondary', platform: 'Platform', age: 'Age', experience: 'Experience',
};

// Every contact / trial submission is stored, even when the Discord post failed.
@Component({
  selector: 'app-website-forms',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <section class="p-6 rounded-xl bg-[#16213e] border border-slate-700/60 shadow space-y-4" aria-labelledby="website-forms-heading">
      <div class="flex items-center justify-between gap-3 border-b border-slate-700/50 pb-3 flex-wrap">
        <div>
          <h1 id="website-forms-heading" class="text-base font-bold text-white">Website Forms</h1>
          <p class="text-xs text-slate-400">
            The 50 most recent contact messages and trial applications sent from the public website.
            Choose where they are posted on the Channels tab.
          </p>
        </div>
        <button
          type="button"
          (click)="load()"
          [disabled]="loading()"
          class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold transition cursor-pointer"
        >
          {{ loading() ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      @if (error()) {
        <p class="text-xs text-rose-300" role="alert">{{ error() }}</p>
      } @else if (!loading() && submissions().length === 0) {
        <p class="text-xs text-slate-400">No website submissions yet.</p>
      } @else {
        <ul class="space-y-3">
          @for (item of submissions(); track item.id) {
            <li class="p-4 rounded-lg bg-[#1a1a2e] border border-slate-700/70 space-y-2">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <span class="text-xs font-bold text-white">
                  {{ item.kind === 'recruitment' ? 'Trial application' : 'Contact message' }}
                </span>
                <span class="flex items-center gap-2 text-[11px] text-slate-400">
                  <time [attr.datetime]="item.createdAt">{{ item.createdAt | date: 'medium' }}</time>
                  @if (item.delivered) {
                    <span class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Posted to Discord</span>
                  } @else {
                    <span class="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">Not posted</span>
                  }
                </span>
              </div>
              <dl class="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-xs">
                @for (field of summary(item); track field[0]) {
                  <dt class="text-slate-400">{{ field[0] }}</dt>
                  <dd class="text-slate-200 whitespace-pre-wrap break-words">{{ field[1] }}</dd>
                }
              </dl>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class WebsiteFormsComponent {
  private readonly api = inject(ApiService);
  private readonly guildStore = inject(GuildStore);
  private request = 0;

  readonly submissions = signal<WebsiteSubmissionItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const gid = this.guildStore.activeGuildId();
      if (gid) void this.load(gid);
    });
  }

  async load(guildId = this.guildStore.activeGuildId()): Promise<void> {
    if (!guildId) return;
    const request = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    try {
      const items = await this.api.getWebsiteSubmissions(guildId, 50);
      if (request === this.request) this.submissions.set(Array.isArray(items) ? items : []);
    } catch {
      if (request === this.request) this.error.set('Website form submissions could not be loaded.');
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  summary(item: WebsiteSubmissionItem): Array<[string, string]> {
    return Object.entries(item.payload || {})
      .filter(([, value]) => value !== null && value !== '')
      .map(([key, value]) => [LABELS[key] || key, String(value)]);
  }
}
