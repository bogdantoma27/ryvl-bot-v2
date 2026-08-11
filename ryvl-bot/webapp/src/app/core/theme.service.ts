import { Injectable, signal } from '@angular/core';

type ThemeChoice = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'ryvl.theme';
  readonly choice = signal<ThemeChoice>(this.readChoice());

  constructor() {
    this.apply(this.choice());
  }

  setChoice(choice: ThemeChoice): void {
    this.choice.set(choice);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(this.storageKey, choice);
    }
    this.apply(choice);
  }

  cycle(): void {
    const next: ThemeChoice = this.choice() === 'system' ? 'light' : this.choice() === 'light' ? 'dark' : 'system';
    this.setChoice(next);
  }

  label(): string {
    return this.choice() === 'system' ? 'System theme' : `${this.choice()[0].toUpperCase()}${this.choice().slice(1)} theme`;
  }

  private readChoice(): ThemeChoice {
    if (typeof window === 'undefined') return 'system';
    const stored = window.localStorage.getItem(this.storageKey);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  }

  private apply(choice: ThemeChoice): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
    root.dataset['theme'] = choice;
  }
}
