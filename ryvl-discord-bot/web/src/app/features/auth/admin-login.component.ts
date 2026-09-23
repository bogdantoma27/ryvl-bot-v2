import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';

// This page is intentionally unguarded. Protected admin routes redirect here;
// being able to view this form does not grant any API or administrative access.
@Component({
  selector: 'app-admin-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
        <!-- Unauthenticated State: Discord Login Screen for Admin Console -->
        <div class="min-h-screen bg-[#080808] flex items-center justify-center p-4 relative overflow-hidden">
          <div class="absolute -top-40 -left-40 w-96 h-96 bg-[#EAE905]/10 rounded-full blur-3xl pointer-events-none"></div>
          <div class="absolute -bottom-40 -right-40 w-96 h-96 bg-[#5865F2]/20 rounded-full blur-3xl pointer-events-none"></div>

          <div class="w-full max-w-md bg-[#0d0d10] border border-[#EAE905]/30 rounded-3xl p-8 shadow-2xl relative z-10 text-center space-y-6">
            <!-- Logo & Brand -->
            <div class="space-y-3">
              <div class="w-16 h-16 rounded-2xl bg-black border-2 border-[#EAE905] mx-auto flex items-center justify-center shadow-lg shadow-[#EAE905]/20">
                <img src="/assets/branding/ryvl-logo.png" alt="RYVL" class="w-10 h-10 object-contain" />
              </div>
              <h1 class="text-2xl font-black text-white tracking-tight uppercase">RYVL ADMIN CONSOLE</h1>
              <p class="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                Sign in with Discord to manage events, lineups, club tracker, transfers, and bot settings.
              </p>
            </div>

            <!-- Login Button -->
            <div class="space-y-3 pt-2">
              @if(errorMessage()) {
                <p role="alert" class="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">{{ errorMessage() }}</p>
              }
              @if(isUnavailable()) {
                <a routerLink="/admin/dashboard" class="block rounded-xl border border-white/20 px-4 py-3 text-sm text-white hover:bg-white/10">Try again</a>
              }
              <button
                type="button"
                (click)="loginWithDiscord()"
                class="w-full inline-flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-500/25 transition duration-150 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <svg class="w-5 h-5 text-white shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
                </svg>
                <span>Login with Discord</span>
              </button>

              <a
                routerLink="/"
                class="block w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition"
              >
                &larr; Return to RYVL Organization Website
              </a>
            </div>

            <div class="pt-2 text-[11px] text-slate-500">
              Requires server administrator or designated manager permissions.
            </div>
          </div>
        </div>
  `,
})
export class AdminLoginComponent {
  private readonly api = inject(ApiService);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
  readonly isUnavailable = computed(() => this.params()?.get('error') === 'unavailable');
  readonly errorMessage = computed(() => {
    // Use fixed messages, never reflect arbitrary OAuth error text into the UI.
    switch (this.params()?.get('error')) {
      case 'access_denied': return 'Discord sign-in was cancelled. You can try again.';
      case 'session_expired': return 'Your session has expired. Sign in with Discord again.';
      case 'unavailable': return 'Sign-in verification is temporarily unavailable. Please try again.';
      case 'auth_failed':
      case 'missing_code': return 'Discord sign-in could not be completed. Please try again.';
      default: return '';
    }
  });

  loginWithDiscord(): void {
    // The existing same-origin endpoint keeps the configured HTTPS callback.
    window.location.assign(this.api.getDiscordLoginUrl());
  }
}
