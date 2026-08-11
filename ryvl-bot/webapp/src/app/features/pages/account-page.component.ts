import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import { ApiService, AuthState } from '../../core/api.service';
import { ThemeService } from '../../core/theme.service';

@Component({
  selector: 'app-account-page',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6">
      <header class="page-header account-header">
        <div>
          <p class="eyebrow">Workspace <span>&rsaquo;</span> Account</p>
          <h1>Account</h1>
          <p class="page-subtitle">Your profile and personal preferences.</p>
        </div>
      </header>

      <article class="account-card">
        @if (avatarUrl()) {
          <img class="account-avatar" [src]="avatarUrl()" alt="" />
        } @else {
          <span class="account-avatar account-avatar-fallback">{{ initial() }}</span>
        }
        <div>
          <strong>{{ username() }}</strong>
          <p>Signed in with Discord</p>
        </div>
      </article>

      <article class="account-card account-card-stack">
        <div>
          <h2>Theme</h2>
          <p>Choose how the admin panel looks on this device.</p>
        </div>
        <div class="theme-choice-group">
          <button type="button" class="theme-choice" [class.theme-choice-active]="theme.choice() === 'light'" (click)="theme.setChoice('light')">&#9728; Light</button>
          <button type="button" class="theme-choice" [class.theme-choice-active]="theme.choice() === 'dark'" (click)="theme.setChoice('dark')">&#9790; Dark</button>
          <button type="button" class="theme-choice" [class.theme-choice-active]="theme.choice() === 'system'" (click)="theme.setChoice('system')">&#9680; System</button>
        </div>
      </article>
    </section>
  `,
})
export class AccountPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly theme = inject(ThemeService);

  protected readonly authState = signal<AuthState | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.authState.set(await this.api.authMe());
    } catch {
      this.authState.set(null);
    }
  }

  protected username(): string {
    return this.authState()?.user.username || 'Discord user';
  }

  protected initial(): string {
    return this.username().slice(0, 1).toUpperCase();
  }

  protected avatarUrl(): string | null {
    const user = this.authState()?.user;
    if (!user?.avatar) return null;
    const extension = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=96`;
  }
}
