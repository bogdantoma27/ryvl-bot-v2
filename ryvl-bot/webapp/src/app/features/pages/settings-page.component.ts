import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminSettings, ApiService, BootstrapResponse } from '../../core/api.service';
import { SnackbarService } from '../../core/snackbar.service';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6">
      <header class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Settings</p>
        <h1 class="text-2xl font-semibold text-slate-100">System settings</h1>
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs text-slate-500">Last refresh: {{ loadedAt() || 'never' }}</p>
          <button class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800" (click)="load()" [disabled]="loading()">
            {{ loading() ? 'Refreshing...' : 'Refresh settings' }}
          </button>
        </div>
      </header>

      <section class="grid gap-4 lg:grid-cols-2">
        <article class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Server defaults</h2>
            <button class="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50" (click)="saveDefaults()" [disabled]="loading() || !settings()">
              Save defaults
            </button>
          </div>
          @if (settings()) {
            <dl class="space-y-2 text-sm">
              <div class="flex items-center justify-between gap-4">
                <dt class="text-slate-400">Guild ID</dt>
                <dd class="truncate text-slate-100">{{ settings()!.guild_id || 'Not set' }}</dd>
              </div>

              <label class="space-y-1">
                <span class="text-xs text-slate-400">Default timezone</span>
                <select class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [(ngModel)]="draft.default_timezone" name="default_timezone">
                  <option value="Europe/Bucharest">Europe/Bucharest</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="UTC">UTC</option>
                </select>
              </label>

              <label class="space-y-1">
                <span class="text-xs text-slate-400">Default attendance channel</span>
                <select class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [(ngModel)]="draft.default_attendance_channel_id" name="default_attendance_channel_id">
                  <option value="">Not set</option>
                  @for (channel of bootstrap()?.channels || []; track channel.id) {
                    <option [value]="channel.id">#{{ channel.name }}</option>
                  }
                </select>
              </label>

              <label class="space-y-1">
                <span class="text-xs text-slate-400">Default lineup channel</span>
                <select class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" [(ngModel)]="draft.default_lineup_channel_id" name="default_lineup_channel_id">
                  <option value="">Not set</option>
                  @for (channel of bootstrap()?.channels || []; track channel.id) {
                    <option [value]="channel.id">#{{ channel.name }}</option>
                  }
                </select>
              </label>

              <div class="space-y-1">
                <span class="text-xs text-slate-400">Default attendance mention roles</span>
                <div class="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-2">
                  @for (role of bootstrap()?.roles || []; track role.id) {
                    <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-slate-100 hover:bg-slate-900">
                      <input type="checkbox" class="h-4 w-4" [checked]="draft.default_attendance_role_ids.includes(role.id)" (change)="toggleDefaultAttendanceRole(role.id, $any($event.target).checked)" />
                      <span>@{{ role.name }}</span>
                    </label>
                  } @empty {
                    <p class="px-2 py-1 text-xs text-slate-500">No roles available.</p>
                  }
                </div>
                <p class="text-xs text-slate-500">Used automatically when creating attendance without manual role selection on default attendance channel.</p>
              </div>

              <div class="flex items-center justify-between gap-4">
                <dt class="text-slate-400">Loaded channels</dt>
                <dd class="text-slate-100">{{ bootstrap()?.channels?.length ?? 0 }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt class="text-slate-400">Loaded roles</dt>
                <dd class="text-slate-100">{{ bootstrap()?.roles?.length ?? 0 }}</dd>
              </div>
            </dl>
          } @else {
            <p class="text-sm text-slate-500">No settings loaded.</p>
          }
        </article>

        <article class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 class="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Access control</h2>
          @if (settings()) {
            <p class="mb-2 text-xs text-slate-500">Users with one of these roles can access admin features.</p>
            <div class="flex flex-wrap gap-2">
              @for (roleId of settings()!.admin_role_ids; track roleId) {
                <span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                  {{ resolveRoleName(roleId) }}
                </span>
              } @empty {
                <span class="text-xs text-slate-500">No ADMIN_ROLE_IDS configured.</span>
              }
            </div>
          } @else {
            <p class="text-sm text-slate-500">No access rules loaded.</p>
          }
        </article>
      </section>

    </section>
  `,
})
export class SettingsPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(SnackbarService);

  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly loadedAt = signal('');
  protected readonly settings = signal<AdminSettings | null>(null);
  protected readonly bootstrap = signal<BootstrapResponse | null>(null);
  protected readonly draft = {
    default_timezone: 'Europe/Bucharest',
    default_attendance_channel_id: '',
    default_lineup_channel_id: '',
    default_attendance_role_ids: [] as string[],
  };

  protected readonly channelsById = computed(() => {
    const map = new Map<string, string>();
    for (const channel of this.bootstrap()?.channels || []) {
      map.set(channel.id, channel.name);
    }
    return map;
  });

  protected readonly rolesById = computed(() => {
    const map = new Map<string, string>();
    for (const role of this.bootstrap()?.roles || []) {
      map.set(role.id, role.name);
    }
    return map;
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    let settingsLoadFailed = false;
    try {
      const settings = await this.api.getAdminSettings();
      this.settings.set(settings);
      this.draft.default_timezone = settings.default_timezone || 'Europe/Bucharest';
      this.draft.default_attendance_channel_id = settings.default_attendance_channel_id || '';
      this.draft.default_lineup_channel_id = settings.default_lineup_channel_id || '';
      this.draft.default_attendance_role_ids = [...(settings.default_attendance_role_ids || [])];
    } catch {
      settingsLoadFailed = true;
      this.settings.set(null);
    }

    try {
      const bootstrap = await this.api.getBootstrap();
      this.bootstrap.set(bootstrap);
    } catch {
      this.bootstrap.set(null);
    }

    if (settingsLoadFailed) {
      this.snackbar.error('Failed to load settings from API.');
    } else if (this.bootstrap() === null) {
      this.snackbar.error('Settings loaded, but channels/roles could not be fetched from Discord right now.');
    }

    try {
      this.loadedAt.set(new Date().toLocaleString());
    } finally {
      this.loading.set(false);
    }
  }

  protected resolveChannelName(channelId: string): string {
    if (!channelId) return 'Not set';
    const name = this.channelsById().get(channelId);
    return name ? `#${name}` : channelId;
  }

  protected resolveRoleName(roleId: string): string {
    const name = this.rolesById().get(roleId);
    return name ? `@${name}` : roleId;
  }

  protected toggleDefaultAttendanceRole(roleId: string, checked: boolean): void {
    const current = [...this.draft.default_attendance_role_ids];
    const exists = current.includes(roleId);
    if (checked && !exists) {
      current.push(roleId);
    }
    if (!checked && exists) {
      const index = current.indexOf(roleId);
      current.splice(index, 1);
    }
    this.draft.default_attendance_role_ids = current;
  }

  protected async saveDefaults(): Promise<void> {
    if (!this.settings()) return;
    this.loading.set(true);
    try {
      const updated = await this.api.updateAdminSettings({
        default_timezone: this.draft.default_timezone,
        default_attendance_channel_id: this.draft.default_attendance_channel_id,
        default_lineup_channel_id: this.draft.default_lineup_channel_id,
        default_attendance_role_ids: this.draft.default_attendance_role_ids,
      });
      this.settings.set(updated);
      this.loadedAt.set(new Date().toLocaleString());
      this.snackbar.success('Default settings saved.');
    } catch {
      this.snackbar.error('Failed to save default settings.');
    } finally {
      this.loading.set(false);
    }
  }
}
