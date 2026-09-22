import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

interface PlayerProfile {
  id: string;
  name: string;
  gamertag: string;
  position: 'ST' | 'CAM' | 'WINGER' | 'MID' | 'DEF' | 'GK' | 'STAFF';
  positionLabel: string;
  number: number | string;
  role: string;
  nationality: string;
  avatarUrl?: string;
  style: string;
}

const ROSTER_DATA: PlayerProfile[] = [
  // Leadership & Management
  {
    id: '1',
    name: 'Bogdan',
    gamertag: 'RYVL_Bogdan',
    position: 'STAFF',
    positionLabel: 'Founder & Club Captain',
    number: 'C',
    role: 'Captain & Team Lead',
    nationality: 'RO',
    style: 'Strategic playmaker and tactical commander orchestrating team movements.',
  },
  {
    id: '2',
    name: 'Alex',
    gamertag: 'RYVL_Shadow',
    position: 'STAFF',
    positionLabel: 'Co-Founder & Vice-Captain',
    number: 'VC',
    role: 'Vice Captain',
    nationality: 'RO',
    style: 'High press coordinator, elite defensive discipline, and set-piece architect.',
  },

  // Attackers
  {
    id: '3',
    name: 'Denis',
    gamertag: 'RYVL_Striker',
    position: 'ST',
    positionLabel: 'Striker (ST)',
    number: 9,
    role: 'First Team Starter',
    nationality: 'RO',
    style: 'Clinical inside the box, exceptional weak-foot finishing and timed runs.',
  },
  {
    id: '4',
    name: 'Andrei',
    gamertag: 'RYVL_Flash',
    position: 'WINGER',
    positionLabel: 'Left Winger (LW)',
    number: 7,
    role: 'First Team Starter',
    nationality: 'RO',
    style: 'Explosive pace, lethal cut-back delivery, and 1v1 dribbling mastery.',
  },
  {
    id: '5',
    name: 'Raul',
    gamertag: 'RYVL_Viper',
    position: 'WINGER',
    positionLabel: 'Right Winger (RW)',
    number: 11,
    role: 'First Team Starter',
    nationality: 'RO',
    style: 'High work-rate, direct attacking threat, and pinpoint driven crosses.',
  },

  // Midfielders
  {
    id: '6',
    name: 'Mihai',
    gamertag: 'RYVL_Maestro',
    position: 'CAM',
    positionLabel: 'Attacking Mid (CAM)',
    number: 10,
    role: 'First Team Starter',
    nationality: 'RO',
    style: 'Visionary through balls, space creator, and elite transition decision-making.',
  },
  {
    id: '7',
    name: 'Cristi',
    gamertag: 'RYVL_Shield',
    position: 'MID',
    positionLabel: 'Defensive Mid (CDM)',
    number: 6,
    role: 'First Team Starter',
    nationality: 'RO',
    style: 'Aggressive ball-winner, interceptor, and anchor shielding the defensive line.',
  },
  {
    id: '8',
    name: 'Eduard',
    gamertag: 'RYVL_Apex',
    position: 'MID',
    positionLabel: 'Central Mid (CM)',
    number: 8,
    role: 'First Team Starter',
    nationality: 'RO',
    style: 'Box-to-box engine with relentless stamina and dynamic tempo control.',
  },

  // Defenders
  {
    id: '9',
    name: 'Vlad',
    gamertag: 'RYVL_Titan',
    position: 'DEF',
    positionLabel: 'Center Back (CB)',
    number: 4,
    role: 'First Team Starter',
    nationality: 'RO',
    style: 'Imposing aerial dominance, stand-tackle precision, and backline vocal leader.',
  },
  {
    id: '10',
    name: 'Cosmin',
    gamertag: 'RYVL_Wall',
    position: 'DEF',
    positionLabel: 'Center Back (CB)',
    number: 5,
    role: 'First Team Starter',
    nationality: 'RO',
    style: 'Anticipation and jockeying master, stopping counter-attacks before they start.',
  },
  {
    id: '11',
    name: 'Robert',
    gamertag: 'RYVL_Ghost',
    position: 'DEF',
    positionLabel: 'Left Back (LB)',
    number: 3,
    role: 'First Team Starter',
    nationality: 'RO',
    style: 'Solid defensive recovery speed and intelligent overlapping runs.',
  },
  {
    id: '12',
    name: 'Stefan',
    gamertag: 'RYVL_Hawk',
    position: 'DEF',
    positionLabel: 'Right Back (RB)',
    number: 2,
    role: 'First Team Starter',
    nationality: 'RO',
    style: 'Physical wing containment, disciplined positioning, and transition support.',
  },

  // Goalkeepers
  {
    id: '13',
    name: 'Tudor',
    gamertag: 'RYVL_Fortress',
    position: 'GK',
    positionLabel: 'Goalkeeper (GK)',
    number: 1,
    role: 'First Team Starter',
    nationality: 'RO',
    style: 'Acrobatic reflex saves, commanding cross claims, and laser-accurate distributions.',
  },
];

@Component({
  selector: 'app-public-team',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <!-- Section Header -->
      <div class="border-b border-[#EAE905]/15 pb-6">
        <div class="text-xs font-mono text-[#EAE905] uppercase tracking-widest mb-1">Competitive Squad</div>
        <h1 class="text-4xl font-black text-white uppercase tracking-tight">RYVL Roster 2026</h1>
        <p class="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl">
          Meet the players representing RYVL Esports in VPG Superliga România and European 11v11 championships.
        </p>
      </div>

      <!-- Filter Tabs -->
      <div class="flex flex-wrap items-center gap-2">
        @for (f of filters; track f.key) {
          <button
            type="button"
            (click)="selectedFilter.set(f.key)"
            class="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
            [class.bg-[#EAE905]]="selectedFilter() === f.key"
            [class.text-black]="selectedFilter() === f.key"
            [class.bg-[#121214]]="selectedFilter() !== f.key"
            [class.text-slate-300]="selectedFilter() !== f.key"
            [class.border]="selectedFilter() !== f.key"
            [class.border-white-10]="selectedFilter() !== f.key"
            [class.hover:bg-white-5]="selectedFilter() !== f.key"
          >
            {{ f.label }}
          </button>
        }
      </div>

      <!-- Player Cards Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        @for (p of filteredPlayers(); track p.id) {
          <div class="p-6 rounded-2xl bg-[#0c0c0e] border border-white/10 hover:border-[#EAE905]/40 transition group relative overflow-hidden flex flex-col justify-between space-y-6">
            <!-- Top Badges -->
            <div>
              <div class="flex items-center justify-between">
                <span class="text-3xl font-black font-mono text-[#EAE905]/70 group-hover:text-[#EAE905] transition">
                  #{{ p.number }}
                </span>
                <span class="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] font-mono font-bold text-slate-300 uppercase">
                  {{ p.positionLabel }}
                </span>
              </div>

              <!-- Avatar & Name -->
              <div class="mt-6 space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono text-[#EAE905] font-bold">{{ p.nationality }}</span>
                  <span class="text-xs text-slate-500">•</span>
                  <span class="text-[11px] text-slate-400 uppercase font-semibold">{{ p.name }}</span>
                </div>
                <h3 class="text-xl font-black text-white tracking-wide group-hover:text-[#EAE905] transition truncate">
                  {{ p.gamertag }}
                </h3>
                <div class="text-[11px] text-slate-400 font-medium">{{ p.role }}</div>
              </div>
            </div>

            <!-- Playing Style Description -->
            <div class="pt-4 border-t border-white/5 text-xs text-slate-400 leading-relaxed">
              {{ p.style }}
            </div>
          </div>
        }
      </div>

      <!-- Recruitment Prompt -->
      <div class="p-8 rounded-3xl bg-[#0c0c0e] border border-[#EAE905]/20 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 class="text-xl font-bold text-white uppercase">Think You Have What It Takes?</h3>
          <p class="text-xs text-slate-400 mt-1">We run ongoing trials for talented players who want to compete at the highest tier.</p>
        </div>
        <a
          routerLink="/recruitment"
          class="px-6 py-3 rounded-xl bg-[#EAE905] text-black text-xs font-extrabold uppercase tracking-wider hover:bg-[#d8d704] transition shrink-0"
        >
          Apply For Trials
        </a>
      </div>
    </div>
  `,
})
export class TeamComponent {
  readonly selectedFilter = signal<string>('ALL');

  readonly filters = [
    { key: 'ALL', label: 'All Squad' },
    { key: 'STAFF', label: 'Staff & Captains' },
    { key: 'ST', label: 'Strikers' },
    { key: 'WINGER', label: 'Wingers' },
    { key: 'CAM', label: 'Playmakers' },
    { key: 'MID', label: 'Midfielders' },
    { key: 'DEF', label: 'Defenders' },
    { key: 'GK', label: 'Goalkeepers' },
  ];

  readonly players = signal<PlayerProfile[]>(ROSTER_DATA);

  readonly filteredPlayers = computed(() => {
    const filter = this.selectedFilter();
    const list = this.players();
    if (filter === 'ALL') return list;
    return list.filter((p) => p.position === filter);
  });
}
