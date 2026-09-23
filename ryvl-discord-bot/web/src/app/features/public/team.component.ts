import { PublicPageHeaderComponent } from './public-page-header.component';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { RosterPlayer } from '../../core/models';

@Component({
  selector: 'app-public-team',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, PublicPageHeaderComponent],
  template: `
    <div class="public-page space-y-8">
      <app-public-page-header heading="RYVL Active Roster" eyebrow="RYVL Esports">
        <button header-actions type="button" class="public-button" (click)="loadRoster()" [disabled]="isLoading()">Refresh</button>
      </app-public-page-header>

      <!-- Filter Tabs -->
      <div class="flex flex-wrap items-center gap-2">
        @for (f of filters; track f.key) {
          <button
            type="button"
            (click)="selectedFilter.set(f.key)"
            class="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5"
            [ngClass]="selectedFilter() === f.key ? 'bg-[#EAE905] !text-black font-extrabold shadow-md shadow-[#EAE905]/15' : 'bg-[#121214] text-slate-300 border border-white/10 hover:bg-white/5'"
          >
            <span [class.!text-black]="selectedFilter() === f.key">{{ f.label }}</span>
            <span
              class="text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold"
              [ngClass]="selectedFilter() === f.key ? 'bg-black/20 !text-black' : 'bg-white/10 text-slate-400'"
            >
              {{ getCountForFilter(f.key) }}
            </span>
          </button>
        }
      </div>

      <!-- Loading State -->
      @if(isLoading()) {
        <div class="p-16 rounded-3xl bg-[#0c0c0e] border border-white/10 text-center space-y-4">
          <div class="w-10 h-10 border-2 border-[#EAE905] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p class="text-sm font-bold text-slate-300">Loading...</p>
        </div>
      } @else if (error()) {
        <div class="p-12 rounded-3xl bg-rose-950/30 border border-rose-600/40 text-center space-y-3">
          <div class="text-3xl">⚠️</div>
          <h3 class="text-base font-semibold text-rose-300">Unable to load club roster</h3>
          <p class="text-xs text-slate-400">{{ error() }}</p>
          <button
            type="button"
            (click)="loadRoster()"
            class="btn-yellow px-5 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      } @else if (filteredPlayers().length === 0) {
        <div class="p-12 rounded-2xl bg-[#0c0c0e] border border-white/10 text-center text-slate-400 text-sm">
          No players found in this category.
        </div>
      } @else {
        <!-- Player Cards Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          @for (p of filteredPlayers(); track p.name) {
            <div class="p-6 rounded-2xl bg-[#0c0c0e] border border-white/10 hover:border-[#EAE905]/40 transition group relative overflow-hidden flex flex-col justify-between space-y-6">
              <!-- Top Header: OVR + Position -->
              <div>
                <div class="flex items-center justify-between">
                  <!-- OVR Rating Badge -->
                  <div class="flex items-baseline gap-1.5">
                    <span class="text-3xl font-black font-mono text-[#EAE905] tracking-tight group-hover:scale-105 transition transform">
                      {{ p.proOverall }}
                    </span>
                    <span class="text-[10px] font-mono text-slate-400 uppercase font-bold">OVR</span>
                  </div>

                  <!-- Position Badge -->
                  <span
                    class="px-2.5 py-1 rounded-md text-xs font-mono font-black uppercase tracking-wider"
                    [ngClass]="getPositionBadgeClass(p.positionGroup)"
                  >
                    {{ p.position }}
                  </span>
                </div>

                <!-- Player Identity -->
                <div class="mt-5 space-y-1">
                  <div class="text-xs font-mono text-[#EAE905] font-bold flex items-center gap-1.5">
                    <span>🇷🇴</span>
                    <span class="truncate">&#64;{{ p.name }}</span>
                  </div>
                  <h3 class="text-xl font-semibold text-white tracking-wide group-hover:text-[#EAE905] transition truncate">
                    {{ p.proName }}
                  </h3>
                  <div class="text-[11px] text-slate-400 font-medium capitalize">
                    {{ p.positionGroup }} • {{ p.height }} cm
                  </div>
                </div>
              </div>

              <!-- Match Stats Telemetry -->
              <div class="pt-4 border-t border-white/5 space-y-3">
                <div class="grid grid-cols-3 gap-2 text-center">
                  <div class="p-2 rounded-lg bg-white/5 border border-white/5">
                    <div class="text-[10px] font-mono text-slate-400 uppercase">GP</div>
                    <div class="text-sm font-mono font-black text-white">{{ p.gamesPlayed }}</div>
                  </div>
                  <div class="p-2 rounded-lg bg-white/5 border border-white/5">
                    <div class="text-[10px] font-mono text-slate-400 uppercase">Goals</div>
                    <div class="text-sm font-mono font-black text-[#EAE905]">{{ p.goals }}</div>
                  </div>
                  <div class="p-2 rounded-lg bg-white/5 border border-white/5">
                    <div class="text-[10px] font-mono text-slate-400 uppercase">Assists</div>
                    <div class="text-sm font-mono font-black text-white">{{ p.assists }}</div>
                  </div>
                </div>

                <div class="grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div class="p-1.5 rounded-lg bg-black/40 border border-white/5">
                    <span class="text-slate-400 text-[10px] block">Rating</span>
                    <span class="font-bold text-amber-400 font-mono">★ {{ p.ratingAve }}</span>
                  </div>
                  <div class="p-1.5 rounded-lg bg-black/40 border border-white/5">
                    <span class="text-slate-400 text-[10px] block">MOTM</span>
                    <span class="font-bold text-emerald-400 font-mono">🏅 {{ p.manOfTheMatch }}</span>
                  </div>
                  <div class="p-1.5 rounded-lg bg-black/40 border border-white/5">
                    <span class="text-slate-400 text-[10px] block">Pass %</span>
                    <span class="font-bold text-slate-200 font-mono">{{ p.passSuccessRate }}%</span>
                  </div>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Recruitment Prompt -->
      <div class="p-8 rounded-3xl bg-[#0c0c0e] border border-[#EAE905]/20 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 class="text-xl font-semibold text-white">Think You Have What It Takes?</h3>
          <p class="text-xs text-slate-400 mt-1">We run ongoing trials for talented players who want to compete at the highest tier.</p>
        </div>
        <a
          routerLink="/recruitment"
          class="btn-yellow px-6 py-3 rounded-xl text-xs font-extrabold uppercase tracking-wider transition shrink-0 cursor-pointer"
        >
          Apply For Trials
        </a>
      </div>
    </div>
  `,
})
export class TeamComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly isLoading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly selectedFilter = signal<string>('ALL');
  readonly players = signal<RosterPlayer[]>([]);

  readonly filters = [
    { key: 'ALL', label: 'All Squad' },
    { key: 'forward', label: 'Forwards' },
    { key: 'midfielder', label: 'Midfielders' },
    { key: 'defender', label: 'Defenders' },
    { key: 'goalkeeper', label: 'Goalkeepers' },
  ];

  readonly filteredPlayers = computed(() => {
    const filter = this.selectedFilter();
    const list = this.players();
    if (filter === 'ALL') return list;
    return list.filter((p) => p.positionGroup === filter);
  });

  ngOnInit(): void {
    this.loadRoster();
  }

  async loadRoster(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const roster = await this.api.getPublicRoster();
      this.players.set(roster);
    } catch (err: any) {
      console.error('Failed to load roster:', err);
      this.error.set(err.message || 'Error connecting to EA Pro Clubs API.');
    } finally {
      this.isLoading.set(false);
    }
  }

  getCountForFilter(key: string): number {
    const list = this.players();
    if (key === 'ALL') return list.length;
    return list.filter((p) => p.positionGroup === key).length;
  }

  getPositionBadgeClass(group: string): string {
    switch (group) {
      case 'forward':
        return 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
      case 'midfielder':
        return 'bg-[#EAE905]/15 text-[#EAE905] border border-[#EAE905]/30';
      case 'defender':
        return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      case 'goalkeeper':
        return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      default:
        return 'bg-white/10 text-slate-300 border border-white/15';
    }
  }
}
