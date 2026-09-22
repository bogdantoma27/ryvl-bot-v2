import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { VpgMatchItem } from '../../core/models';

@Component({
  selector: 'app-public-live',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <!-- Header -->
      <div class="border-b border-[#EAE905]/15 pb-6">
        <div class="flex items-center gap-2 text-xs font-mono text-rose-500 uppercase tracking-widest mb-1">
          <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
          <span>Matchday Broadcast Center</span>
        </div>
        <h1 class="text-4xl font-black text-white uppercase tracking-tight">RYVL Live Match Center</h1>
        <p class="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl">
          Real-time score tracking, game day status, and official broadcasts for RYVL Esports fixtures.
        </p>
      </div>

      <!-- Game Day Banner -->
      <div
        class="p-6 sm:p-8 rounded-3xl border relative overflow-hidden transition"
        [ngClass]="isGameNight() ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-[#0c0c0e] border-white/10'"
      >
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span
                class="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider"
                [ngClass]="isGameNight() ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'"
              >
                {{ isGameNight() ? '🟢 TONIGHT IS GAME NIGHT' : '⚪ TRAINING & PREPARATION DAY' }}
              </span>
              <span class="text-xs text-slate-400 font-mono">{{ todayFormatted() }}</span>
            </div>
            <h2 class="text-2xl font-black text-white uppercase">
              {{ isGameNight() ? 'Official VPG Matchday Active' : 'Next Game Night: Monday / Tuesday / Thursday (22:00)' }}
            </h2>
            <p class="text-xs text-slate-400">
              Matches kickoff in Bucharest Time (Europe/Bucharest). Results update automatically.
            </p>
          </div>

          <button
            type="button"
            (click)="refresh()"
            class="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition flex items-center gap-2 cursor-pointer self-start sm:self-center"
          >
            <svg class="w-3.5 h-3.5" [class.animate-spin]="isLoading()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh Feed</span>
          </button>
        </div>
      </div>

      <!-- Live Stream Embed or Placeholder -->
      <div class="rounded-3xl bg-black border border-white/10 overflow-hidden shadow-2xl space-y-4">
        <div class="aspect-video w-full bg-[#0a0a0d] relative flex flex-col items-center justify-center p-6 text-center">
          <!-- Ambient Glow -->
          <div class="absolute w-72 h-72 bg-[#EAE905]/10 rounded-full blur-3xl pointer-events-none"></div>

          <div class="relative z-10 space-y-4 max-w-md">
            <div class="w-16 h-16 rounded-2xl bg-[#EAE905]/10 border border-[#EAE905]/30 mx-auto flex items-center justify-center text-3xl text-[#EAE905]">
              🔴
            </div>
            <h3 class="text-xl font-bold text-white uppercase tracking-tight">RYVL Official Match Broadcast</h3>
            <p class="text-xs text-slate-400 leading-relaxed">
              Streams go live on match nights (21:45 Bucharest time) featuring squad voice comms and tactical point-of-view commentary.
            </p>
            <div class="flex items-center justify-center gap-3 pt-2">
              <a
                href="https://twitch.tv"
                target="_blank"
                class="px-4 py-2 rounded-xl bg-[#9146FF] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#7c25f8] transition cursor-pointer"
              >
                Watch on Twitch
              </a>
              <a
                href="https://discord.gg"
                target="_blank"
                class="px-4 py-2 rounded-xl bg-[#5865F2] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#4752c4] transition cursor-pointer"
              >
                Join Match Comms
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Today's Superliga Matches Feed -->
      <div class="space-y-6">
        <div class="flex items-center justify-between border-b border-white/10 pb-4">
          <h2 class="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            <span class="text-[#EAE905]">⚽</span>
            <span>Today's Confirmed Match Results</span>
          </h2>
          <span class="text-xs text-slate-400">Bucharest Timezone</span>
        </div>

        @if (isLoading()) {
          <div class="space-y-3">
            @for (i of [1,2,3]; track i) {
              <div class="h-20 rounded-2xl bg-white/5 border border-white/10 animate-pulse"></div>
            }
          </div>
        } @else if (todayMatches().length === 0) {
          <div class="p-12 rounded-2xl bg-[#0c0c0e] border border-white/10 text-center space-y-2">
            <p class="text-sm font-semibold text-white">No confirmed matches recorded today yet.</p>
            <p class="text-xs text-slate-400">
              When tournament matches conclude tonight, results will be published here in real time.
            </p>
          </div>
        } @else {
          <div class="space-y-3">
            @for (m of todayMatches(); track m.id) {
              <div class="p-5 rounded-2xl bg-[#0c0c0e] border border-white/10 hover:border-[#EAE905]/40 transition flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <span class="px-2 py-0.5 rounded bg-[#EAE905]/10 text-[#EAE905] font-mono text-[10px] font-bold">
                    MD {{ m.matchDay }}
                  </span>
                  <span class="text-xs font-bold text-white">{{ m.homeName }}</span>
                </div>

                <div class="px-4 py-1.5 rounded-lg bg-black font-mono font-black text-base text-white border border-white/10">
                  {{ m.homeScore }} : {{ m.awayScore }}
                </div>

                <div class="flex items-center gap-3">
                  <span class="text-xs font-bold text-white">{{ m.awayName }}</span>
                  <span class="text-[10px] text-emerald-400 font-semibold">FINAL</span>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class LiveComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly allMatches = signal<VpgMatchItem[]>([]);
  readonly isLoading = signal<boolean>(true);

  readonly todayMatches = computed(() => {
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Bucharest',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    return this.allMatches().filter((m) => {
      try {
        const mStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Bucharest',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(m.datetime));
        return mStr === todayStr;
      } catch {
        return false;
      }
    });
  });

  isGameNight(): boolean {
    const day = new Date().getDay(); // 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat
    return day === 1 || day === 2 || day === 4; // Mon, Tue, Thu
  }

  todayFormatted(): string {
    return new Date().toLocaleDateString('en-US', {
      timeZone: 'Europe/Bucharest',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.isLoading.set(true);
    try {
      const res = await this.api.getSuperligaResults(undefined, 25);
      this.allMatches.set(res?.results || []);
    } catch (err) {
      console.error('Failed to load live results feed:', err);
    } finally {
      this.isLoading.set(false);
    }
  }
}
