import {
  ChangeDetectionStrategy,
  Component,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-public-about',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-20">
      <!-- Header -->
      <div class="border-b border-[#EAE905]/15 pb-6">
        <div class="text-xs font-mono text-[#EAE905] uppercase tracking-widest mb-1">Organization Profile</div>
        <h1 class="text-4xl font-black text-white uppercase tracking-tight">About RYVL Esports</h1>
        <p class="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl">
          Forged by discipline, powered by technology, and united by the pursuit of competitive perfection.
        </p>
      </div>

      <!-- Core Story & Philosophy -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div class="space-y-6">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EAE905]/10 border border-[#EAE905]/30 text-[#EAE905] text-xs font-mono font-bold uppercase">
            #WERYVL • Founded 2024
          </div>

          <h2 class="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight leading-tight">
            We Challenge Ourselves First. <br />
            <span class="text-[#EAE905]">Then We Rival The Best.</span>
          </h2>

          <p class="text-sm text-slate-300 leading-relaxed">
            RYVL Esports was founded on an unapologetic belief: elite competitive performance is not an accident of talent, but the result of relentless daily discipline and tactical cohesion.
          </p>

          <p class="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Competing in the highest tier of European EA FC 11v11 Pro Clubs and VPG competitions, our squad represents modern digital athletics. Every formation, pressing trigger, and set piece is rehearsed to automatic perfection.
          </p>

          <div class="flex items-center gap-6 pt-2">
            <div>
              <div class="text-2xl font-black text-white">100%</div>
              <div class="text-[10px] text-slate-400 uppercase font-mono">Manual 11v11</div>
            </div>
            <div class="h-8 w-px bg-white/10"></div>
            <div>
              <div class="text-2xl font-black text-[#EAE905]">VPG</div>
              <div class="text-[10px] text-slate-400 uppercase font-mono">Tier 1 Circuit</div>
            </div>
            <div class="h-8 w-px bg-white/10"></div>
            <div>
              <div class="text-2xl font-black text-white">#WERYVL</div>
              <div class="text-[10px] text-slate-400 uppercase font-mono">Organization Creed</div>
            </div>
          </div>
        </div>

        <!-- Brand Visual Artwork Card -->
        <div class="relative rounded-3xl overflow-hidden border border-[#EAE905]/20 shadow-2xl bg-black">
          <img
            src="/assets/branding/ryvl-hero-crystal.png"
            alt="RYVL Crystal Star Artwork"
            class="w-full h-full object-cover transform hover:scale-105 transition duration-700"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
          <div class="absolute bottom-6 left-6 right-6">
            <span class="text-[11px] font-mono text-[#EAE905] uppercase tracking-widest">Visual Identity</span>
            <div class="text-lg font-black text-white uppercase tracking-wide">DRIVEN. RELENTLESS. UNCOMPROMISING.</div>
          </div>
        </div>
      </div>

      <!-- Technological Edge -->
      <div class="p-8 sm:p-12 rounded-3xl bg-[#0c0c0e] border border-white/10 space-y-8">
        <div class="max-w-2xl space-y-2">
          <div class="text-xs font-mono text-[#EAE905] uppercase tracking-widest">Innovation & Engineering</div>
          <h3 class="text-2xl sm:text-3xl font-black text-white uppercase">The Technology Behind RYVL</h3>
          <p class="text-xs sm:text-sm text-slate-400">
            Unlike traditional clubs, RYVL operates a proprietary software suite integrating automated Discord management, real-time match telemetry, tactical pitch graphic generators, and VPG API synchronizers.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <div class="p-6 rounded-2xl bg-[#121214] border border-white/5 space-y-2">
            <div class="text-xl">🤖</div>
            <h4 class="text-base font-bold text-white">Automated Bot Ecosystem</h4>
            <p class="text-xs text-slate-400 leading-relaxed">
              Autonomous background schedulers monitoring VPG match results, player transfers, and automated channel notifications.
            </p>
          </div>

          <div class="p-6 rounded-2xl bg-[#121214] border border-white/5 space-y-2">
            <div class="text-xl">📊</div>
            <h4 class="text-base font-bold text-white">Tactical Pitch Studio</h4>
            <p class="text-xs text-slate-400 leading-relaxed">
              Bespoke visual formation studio producing ultra-sharp match graphics, role assignments, and kickoff notifications.
            </p>
          </div>

          <div class="p-6 rounded-2xl bg-[#121214] border border-white/5 space-y-2">
            <div class="text-xl">🌐</div>
            <h4 class="text-base font-bold text-white">Unified Web Platform</h4>
            <p class="text-xs text-slate-400 leading-relaxed">
              Integrated organization portal combining public results feeds with secured role-based administration consoles.
            </p>
          </div>
        </div>
      </div>

      <!-- Call to Action -->
      <div class="text-center space-y-4 max-w-xl mx-auto pt-6">
        <h3 class="text-2xl font-black text-white uppercase tracking-tight">Become Part Of The Community</h3>
        <p class="text-xs text-slate-400">
          Connect with our players, follow game night streams, or submit your trial application today.
        </p>
        <div class="flex items-center justify-center gap-4 pt-2">
          <a
            routerLink="/recruitment"
            class="btn-yellow px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition"
          >
            Apply For Trials
          </a>
          <a
            routerLink="/contact"
            class="px-6 py-3 rounded-xl bg-white/10 text-white text-xs font-bold uppercase tracking-wider hover:bg-white/15 transition border border-white/10"
          >
            Contact Management
          </a>
        </div>
      </div>
    </div>
  `,
})
export class AboutComponent {}
