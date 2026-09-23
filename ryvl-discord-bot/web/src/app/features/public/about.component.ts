import { PublicPageHeaderComponent } from './public-page-header.component';
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
  imports: [CommonModule, RouterLink, PublicPageHeaderComponent],
  template: `
    <div class="public-page space-y-8">
      <app-public-page-header heading="About RYVL Esports" eyebrow="RYVL Esports" />

      <!-- Core Story & Philosophy -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div class="space-y-6">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EAE905]/10 border border-[#EAE905]/30 text-[#EAE905] text-xs font-mono font-bold uppercase">
            #WERYVL
          </div>

          <h2 class="text-3xl sm:text-4xl font-semibold text-white tracking-tight leading-tight">
            We Challenge Ourselves First. <br />
            <span class="text-[#EAE905]">Then We Rival The Best.</span>
          </h2>

          <p class="text-sm text-slate-300 leading-relaxed">
            RYVL Esports brings players together for competitive EA SPORTS FC 27 Pro Clubs.
          </p>

          <p class="text-xs sm:text-sm text-slate-400 leading-relaxed">
            We focus on teamwork, communication and improving together in our VPG competitions.
          </p>


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

            <div class="text-lg font-black text-white uppercase tracking-wide">DRIVEN. RELENTLESS. UNCOMPROMISING.</div>
          </div>
        </div>
      </div>



      <!-- Call to Action -->
      <div class="text-center space-y-4 max-w-xl mx-auto pt-6">
        <h3 class="text-2xl font-semibold text-white tracking-tight">Become Part Of The Community</h3>
        <p class="text-xs text-slate-400">
          Connect with our players, follow game night streams, or submit your trial application today.
        </p>
        <div class="flex flex-wrap items-center justify-center gap-4 pt-2">
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
