import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { VpgMatchItem } from '../../core/models';

@Component({
  selector: 'app-public-fixtures',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#EAE905]/15 pb-6">
        <div>
          <div class="text-xs font-mono text-[#EAE905] uppercase tracking-widest mb-1">Schedule & Calendar</div>
          <h1 class="text-4xl font-black text-white uppercase tracking-tight">Superliga Fixtures</h1>
          <p class="text-xs sm:text-sm text-slate-400 mt-2">
            Upcoming matches scheduled in VPG Superliga România (all kickoff times in Bucharest timezone).
          </p>
        </div>

        <!-- Controls: Season & Filter -->
        <div class="flex flex-wrap items-center gap-3">
          <!-- Filter Toggle: RYVL Only vs All -->
          <div class="bg-[#121214] p-1 rounded-xl border border-white/10 flex items-center">
            <button
              type="button"
              (click)="onlyRyvl.set(false)"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase transition cursor-pointer"
              [class.bg-[#EAE905]]="!onlyRyvl()"
              [class.text-black]="!onlyRyvl()"
              [class.text-slate-300]="onlyRyvl()"
            >
              All Matches
            </button>
            <button
              type="button"
              (click)="onlyRyvl.set(true)"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase transition cursor-pointer flex items-center gap-1.5"
              [class.bg-[#EAE905]]="onlyRyvl()"
              [class.text-black]="onlyRyvl()"
              [class.text-slate-300]="!onlyRyvl()"
            >
              <span class="text-xs">⭐</span>
              <span>RYVL Only</span>
            </button>
          </div>

          <!-- Season Selector -->
          <select
            [ngModel]="selectedSeason()"
            (ngModelChange)="onSeasonChange($event)"
            class="bg-[#121214] border border-white/10 text-white rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-[#EAE905] cursor-pointer"
          >
            @for (s of seasons(); track s) {
              <option [value]="s">Season {{ s }}</option>
            }
          </select>

          <!-- Refresh Button -->
          <button
            type="button"
            (click)="loadFixtures()"
            [disabled]="isLoading()"
            class="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
            title="Refresh fixtures"
          >
            <svg class="w-4 h-4" [class.animate-spin]="isLoading()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Fixtures Feed -->
      @if (isLoading()) {
        <div class="space-y-4">
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <div class="h-28 rounded-2xl bg-white/5 border border-white/10 animate-pulse"></div>
          }
        </div>
      } @else if (filteredFixtures().length === 0) {
        <div class="p-16 rounded-3xl bg-[#0c0c0e] border border-white/10 text-center space-y-3">
          <div class="text-3xl">📅</div>
          <h3 class="text-lg font-bold text-white">No Scheduled Matches Found</h3>
          <p class="text-xs text-slate-400 max-w-sm mx-auto">
            {{ onlyRyvl() ? 'No upcoming matches scheduled for RYVL in this season.' : 'All scheduled matches for this season have concluded or are awaiting announcement.' }}
          </p>
          @if (onlyRyvl()) {
            <button
              (click)="onlyRyvl.set(false)"
              class="px-4 py-2 rounded-xl bg-[#EAE905] text-black text-xs font-black uppercase mt-2 cursor-pointer"
            >
              Show All League Fixtures
            </button>
          }
        </div>
      } @else {
        <div class="space-y-4">
          @for (m of filteredFixtures(); track m.id) {
            <div
              class="p-5 sm:p-6 rounded-2xl border transition group hover:border-[#EAE905]/40"
              [ngClass]="isRyvlMatch(m) ? 'border-[#EAE905]/50 bg-[#121214]' : 'bg-[#0c0c0e] border-white/10'"
            >
              <div class="flex flex-col md:flex-row items-center justify-between gap-6">
                <!-- Matchday & Time -->
                <div class="flex md:flex-col items-center md:items-start justify-between w-full md:w-44 shrink-0 text-left">
                  <div class="flex items-center gap-2">
                    <span class="px-2.5 py-0.5 rounded bg-[#EAE905]/10 border border-[#EAE905]/30 text-[#EAE905] font-mono text-[11px] font-bold">
                      MATCHDAY {{ m.matchDay || '?' }}
                    </span>
                    @if (isRyvlMatch(m)) {
                      <span class="text-[10px] font-bold text-[#EAE905] uppercase tracking-wider">RYVL MATCH</span>
                    }
                  </div>
                  <div class="text-[11px] text-slate-400 mt-1 font-medium">{{ m.dateFormattedEn || m.dateFormattedRo }}</div>
                </div>

                <!-- Matchup (Home vs Away) -->
                <div class="flex-1 w-full flex items-center justify-center gap-4 sm:gap-8">
                  <!-- Home Team -->
                  <div class="flex items-center justify-end gap-3 flex-1 min-w-0 text-right">
                    <span class="text-sm sm:text-base font-bold text-white truncate" [class.text-[#EAE905]]="/ryvl|rival/i.test(m.homeName)">
                      {{ m.homeName }}
                    </span>
                    @if (m.homeLogoUrl) {
                      <img [src]="m.homeLogoUrl" alt="" class="w-9 h-9 sm:w-11 sm:h-11 object-contain shrink-0" />
                    } @else {
                      <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-black text-slate-400 shrink-0">FC</div>
                    }
                  </div>

                  <!-- VS Badge -->
                  <div class="px-4 py-1.5 rounded-xl bg-black/60 border border-white/15 text-xs font-mono font-black text-[#EAE905] tracking-widest shrink-0">
                    VS
                  </div>

                  <!-- Away Team -->
                  <div class="flex items-center justify-start gap-3 flex-1 min-w-0 text-left">
                    @if (m.awayLogoUrl) {
                      <img [src]="m.awayLogoUrl" alt="" class="w-9 h-9 sm:w-11 sm:h-11 object-contain shrink-0" />
                    } @else {
                      <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-black text-slate-400 shrink-0">FC</div>
                    }
                    <span class="text-sm sm:text-base font-bold text-white truncate" [class.text-[#EAE905]]="/ryvl|rival/i.test(m.awayName)">
                      {{ m.awayName }}
                    </span>
                  </div>
                </div>

                <!-- Status & VPG Link -->
                <div class="shrink-0 w-full md:w-auto text-center md:text-right">
                  <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    Scheduled
                  </span>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class FixturesComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly seasons = signal<number[]>([2, 1]);
  readonly selectedSeason = signal<number>(2);
  readonly onlyRyvl = signal<boolean>(false);
  readonly fixtures = signal<VpgMatchItem[]>([]);
  readonly isLoading = signal<boolean>(true);

  readonly filteredFixtures = computed(() => {
    const list = this.fixtures();
    if (!this.onlyRyvl()) return list;
    return list.filter((m) => this.isRyvlMatch(m));
  });

  async ngOnInit(): Promise<void> {
    await this.initSeasons();
    await this.loadFixtures();
  }

  async initSeasons(): Promise<void> {
    try {
      const data = await this.api.getSuperligaSeasons();
      if (data?.seasons?.length) {
        this.seasons.set(data.seasons);
        this.selectedSeason.set(data.latest || data.seasons[0]);
      }
    } catch {
      // fallback
    }
  }

  async loadFixtures(): Promise<void> {
    this.isLoading.set(true);
    try {
      const data = await this.api.getSuperligaFixtures(this.selectedSeason(), 40);
      this.fixtures.set(data?.fixtures || []);
    } catch (err) {
      console.error('Failed to load Superliga fixtures:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  onSeasonChange(newSeason: number): void {
    this.selectedSeason.set(Number(newSeason));
    this.loadFixtures();
  }

  isRyvlMatch(m: VpgMatchItem): boolean {
    return /ryvl|rival/i.test(m.homeName) || /ryvl|rival/i.test(m.awayName);
  }
}
