import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import { ApiService, DiagnosticsResponse } from '../../core/api.service';
import { SnackbarService } from '../../core/snackbar.service';

@Component({
  selector: 'app-diagnostics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6">
      <header class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Diagnostics</p>
        <h1 class="text-2xl font-semibold text-slate-100">Health and runtime status</h1>
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs text-slate-500">Last refresh: {{ loadedAt() || 'never' }}</p>
          <button class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800" (click)="load()" [disabled]="loading()">
            {{ loading() ? 'Refreshing...' : 'Refresh diagnostics' }}
          </button>
        </div>
      </header>

      @if (diagnostics()) {
        <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <p class="text-xs text-slate-500">API status</p>
            <p class="mt-1 text-sm font-semibold" [class.text-emerald-300]="diagnostics()?.status === 'ok'" [class.text-rose-300]="diagnostics()?.status !== 'ok'">
              {{ diagnostics()?.status || 'n/a' }}
            </p>
          </article>

          <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <p class="text-xs text-slate-500">Database</p>
            <p class="mt-1 text-sm font-semibold" [class.text-emerald-300]="diagnostics()?.database?.ok" [class.text-rose-300]="!diagnostics()?.database?.ok">
              {{ diagnostics()?.database?.ok ? 'OK' : 'ERROR' }}
            </p>
          </article>

          <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <p class="text-xs text-slate-500">Scheduler</p>
            <p class="mt-1 text-sm font-semibold" [class.text-emerald-300]="diagnostics()?.scheduler?.running" [class.text-rose-300]="!diagnostics()?.scheduler?.running">
              {{ diagnostics()?.scheduler?.running ? 'Running' : 'Stopped' }}
            </p>
          </article>

          <article class="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <p class="text-xs text-slate-500">Discord bot</p>
            <p class="mt-1 text-sm font-semibold" [class.text-emerald-300]="diagnostics()?.discord?.bot_connected" [class.text-rose-300]="!diagnostics()?.discord?.bot_connected">
              {{ diagnostics()?.discord?.bot_connected ? 'Connected' : 'Disconnected' }}
            </p>
          </article>
        </section>
      }

      @if (diagnostics()) {
        <section class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <h2 class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Details</h2>
          <dl class="grid gap-2 text-sm md:grid-cols-2">
            <div class="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <dt class="text-slate-500">Environment</dt>
              <dd class="text-slate-100">{{ diagnostics()!.app.environment }}</dd>
            </div>
            <div class="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <dt class="text-slate-500">Uptime</dt>
              <dd class="text-slate-100">{{ formatUptime(diagnostics()!.uptime_seconds) }}</dd>
            </div>
            <div class="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <dt class="text-slate-500">Scheduler interval</dt>
              <dd class="text-slate-100">{{ diagnostics()!.scheduler.interval_seconds }} sec</dd>
            </div>
            <div class="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <dt class="text-slate-500">Last scheduler tick</dt>
              <dd class="text-slate-100">{{ diagnostics()!.scheduler.last_tick_at || 'n/a' }}</dd>
            </div>
          </dl>

          @if (diagnostics()!.database.error) {
            <div class="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              DB error: {{ diagnostics()!.database.error }}
            </div>
          }

          @if (diagnostics()!.scheduler.last_error) {
            <div class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Scheduler warning: {{ diagnostics()!.scheduler.last_error }}
            </div>
          }

          @if (diagnostics()!.discord.error) {
            <div class="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              Discord error: {{ diagnostics()!.discord.error }}
            </div>
          }
        </section>

        <section class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Audit log</h2>
            <p class="text-xs text-slate-500">Latest {{ diagnostics()!.audit_logs.length }} entries</p>
          </div>

          <div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
            <table class="min-w-full text-left text-sm">
              <thead class="bg-slate-900/80 text-xs uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th class="px-3 py-2">Action</th>
                  <th class="px-3 py-2">Entity</th>
                  <th class="px-3 py-2">Actor</th>
                  <th class="px-3 py-2">Created</th>
                  <th class="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                @for (entry of diagnostics()!.audit_logs; track entry.id) {
                  <tr class="border-t border-slate-800">
                    <td class="px-3 py-2 text-slate-100">{{ entry.action }}</td>
                    <td class="px-3 py-2 text-slate-300">{{ entry.entity_type }} #{{ entry.entity_id }}</td>
                    <td class="px-3 py-2 text-slate-300">{{ entry.actor_discord_id || 'system' }}</td>
                    <td class="px-3 py-2 text-slate-300">{{ entry.created_at }}</td>
                    <td class="px-3 py-2 text-xs text-slate-400 wrap-break-word">{{ entry.details || '-' }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td class="px-3 py-4 text-slate-500" colspan="5">No audit log entries yet.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

    </section>
  `,
})
export class DiagnosticsPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(SnackbarService);

  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly loadedAt = signal('');
  protected readonly diagnostics = signal<DiagnosticsResponse | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const diagnostics = await this.api.getDiagnostics();
      this.diagnostics.set(diagnostics);

      this.loadedAt.set(new Date().toLocaleString());
    } catch {
      this.snackbar.error('Failed to load diagnostics from API.');
    } finally {
      this.loading.set(false);
    }
  }

  protected formatUptime(seconds: number | null): string {
    if (seconds === null || Number.isNaN(seconds)) return 'n/a';
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  }
}
