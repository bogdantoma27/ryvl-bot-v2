import { Injectable, signal } from '@angular/core';

type SnackbarKind = 'success' | 'error' | 'info';

interface SnackbarEntry {
  id: number;
  kind: SnackbarKind;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class SnackbarService {
  private readonly entries = signal<SnackbarEntry[]>([]);
  private nextId = 1;

  readonly snackbars = this.entries.asReadonly();

  success(message: string): void {
    this.push('success', message);
  }

  error(message: string): void {
    this.push('error', message);
  }

  info(message: string): void {
    this.push('info', message);
  }

  dismiss(id: number): void {
    this.entries.update(entries => entries.filter(entry => entry.id !== id));
  }

  private push(kind: SnackbarKind, message: string): void {
    const id = this.nextId++;
    this.entries.update(entries => [...entries, { id, kind, message }]);
    window.setTimeout(() => this.dismiss(id), 4500);
  }
}
