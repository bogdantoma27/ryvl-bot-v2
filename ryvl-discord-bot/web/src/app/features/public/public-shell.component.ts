import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { SOCIAL_LINKS } from './presentation';
@Component({
  selector: 'app-public-shell', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="public-site min-h-screen bg-[#080808] text-slate-200 flex flex-col font-sans selection:bg-[#EAE905] selection:text-black">
      <a href="#main-content" class="public-skip-link">Skip to content</a>
      <header class="sticky top-0 z-50 bg-[#080808]/95 backdrop-blur-md border-b border-white/10">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[76px] flex items-center justify-between gap-3">
          <a routerLink="/" class="flex items-center gap-3 shrink-0" aria-label="RYVL Esports home"><img src="/assets/branding/ryvl-mark.png" alt="" class="h-10 w-auto object-contain" /><span class="text-xl font-bold tracking-wide text-white lg:hidden xl:inline">RYVL</span></a>
          <nav class="hidden lg:flex items-center gap-1" aria-label="Main navigation">
            @for (item of navigation; track item.path) {
              <a [routerLink]="item.path" routerLinkActive="public-nav-active" [routerLinkActiveOptions]="{ exact: item.path === '/' }" ariaCurrentWhenActive="page" class="public-nav-link">{{ item.label }}</a>
            }
          </nav>
          <div class="hidden lg:flex items-center gap-2 shrink-0"><a [href]="social.discord" target="_blank" rel="noopener noreferrer" class="social-brand-link public-button"><img src="/assets/brands/discord.svg" class="social-brand-icon" width="24" height="24" alt="" aria-hidden="true" />Discord</a><a routerLink="/admin/dashboard" class="text-xs text-slate-400 hover:text-white px-2 py-2">Admin</a></div>
          <button type="button" #menuToggle class="lg:hidden public-button" (click)="mobileNavOpen.set(!mobileNavOpen())" [attr.aria-expanded]="mobileNavOpen()" aria-controls="public-mobile-navigation" aria-label="Toggle navigation">{{ mobileNavOpen() ? 'Close' : 'Menu' }}</button>
        </div>
        @if(mobileNavOpen()) {
          <nav id="public-mobile-navigation" (keydown.escape)="mobileNavOpen.set(false); menuToggle.focus()" class="lg:hidden border-t border-white/10 px-4 py-4 grid gap-1" aria-label="Mobile navigation">
            @for (item of navigation; track item.path) {
              <a [routerLink]="item.path" routerLinkActive="public-nav-active" [routerLinkActiveOptions]="{ exact: item.path === '/' }" ariaCurrentWhenActive="page" (click)="mobileNavOpen.set(false)" class="public-nav-link">{{ item.label }}</a>
            }
            <div class="flex gap-3 pt-3 mt-2 border-t border-white/10"><a [href]="social.discord" target="_blank" rel="noopener noreferrer" class="social-brand-link public-button"><img src="/assets/brands/discord.svg" class="social-brand-icon" width="24" height="24" alt="" aria-hidden="true" />Join Discord</a><a routerLink="/admin/dashboard" class="public-button" (click)="mobileNavOpen.set(false)">Admin</a></div>
          </nav>
        }
      </header>
      <main id="main-content" tabindex="-1" class="flex-1 w-full min-w-0"><router-outlet /></main>
      <footer class="border-t border-white/10 bg-[#060606] mt-12">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] gap-9">
            <div class="space-y-4"><a routerLink="/" class="inline-flex items-center gap-3"><img src="/assets/branding/ryvl-mark.png" alt="" class="h-9 w-auto" /><span class="text-xl font-bold text-white">RYVL Esports</span></a><p class="text-sm text-slate-400 max-w-sm leading-relaxed">EA SPORTS FC Pro Clubs. Team performance, competition updates and a community built around the game.</p><p class="text-xs tracking-wider text-slate-500">#WERYVL</p></div>
            <div><h2 class="font-semibold text-sm text-white mb-4">Explore</h2><div class="grid gap-2.5 text-sm text-slate-400"><a routerLink="/performance" class="hover:text-white">Team performance</a><a routerLink="/match-center" class="hover:text-white">Match Center</a><a routerLink="/club" class="hover:text-white">Club tracker</a><a routerLink="/transfers" class="hover:text-white">VPG Romania transfers</a><a routerLink="/recruitment" class="hover:text-white">Join the team</a><a routerLink="/contact" class="hover:text-white">Contact</a></div></div>
            <div><h2 class="font-semibold text-sm text-white mb-4">Follow RYVL</h2><div class="grid gap-2.5 text-sm text-slate-400"><a [href]="social.discord" target="_blank" rel="noopener noreferrer" class="social-brand-link hover:text-white"><img src="/assets/brands/discord.svg" class="social-brand-icon" width="24" height="24" alt="" aria-hidden="true" />Discord ↗</a><a [href]="social.twitch" target="_blank" rel="noopener noreferrer" class="social-brand-link hover:text-white"><img src="/assets/brands/twitch.svg" class="social-brand-icon" width="24" height="24" alt="" aria-hidden="true" />Twitch ↗</a><a [href]="social.youtube" target="_blank" rel="noopener noreferrer" class="social-brand-link hover:text-white"><img src="/assets/brands/youtube.svg" class="social-brand-icon" width="24" height="24" alt="" aria-hidden="true" />YouTube ↗</a><a href="https://virtualprogaming.com" target="_blank" rel="noopener noreferrer" class="hover:text-white">Virtual Pro Gaming ↗</a></div></div>
          </div>
          <div class="mt-10 pt-6 border-t border-white/10 flex flex-col lg:flex-row justify-between gap-4 text-xs text-slate-500"><p>© {{ year }} RYVL Esports. Powered by Virtual Pro Gaming &amp; RYVL</p><div class="flex flex-wrap gap-5"><a routerLink="/privacy" class="hover:text-white">Privacy Policy</a><a routerLink="/terms" class="hover:text-white">Terms of Service</a><a routerLink="/admin/dashboard" class="hover:text-white">Staff login</a></div></div>
        </div>
      </footer>
    </div>
  `,
})
export class PublicShellComponent {
  readonly mobileNavOpen = signal(false);
  readonly social = SOCIAL_LINKS;
  readonly year = new Date().getFullYear();
  readonly navigation = [
    { path: '/', label: 'Home' }, { path: '/team', label: 'Team' },
    { path: '/performance', label: 'Performance' }, { path: '/match-center', label: 'Match Center' },
    { path: '/recruitment', label: 'Recruitment' }, { path: '/about', label: 'About' }, { path: '/contact', label: 'Contact' },
  ];
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Navigation closes the drawer; the subscription is disposed with this shell.
    inject(Router).events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed(),
    ).subscribe(() => this.mobileNavOpen.set(false));

    // CSS controls visibility. Clear the mobile state when returning to desktop,
    // so resizing back to mobile cannot reopen a stale drawer. Browser-only API.
    afterNextRender(() => {
      const desktop = window.matchMedia('(min-width: 64rem)');
      const closeOnDesktop = () => {
        if (desktop.matches) this.mobileNavOpen.set(false);
      };
      closeOnDesktop();
      desktop.addEventListener('change', closeOnDesktop);
      this.destroyRef.onDestroy(() => desktop.removeEventListener('change', closeOnDesktop));
    });
  }
}
