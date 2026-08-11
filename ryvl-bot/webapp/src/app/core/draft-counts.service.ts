import { Injectable, inject, signal } from '@angular/core';

import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class DraftCountsService {
  private readonly api = inject(ApiService);

  readonly eventDrafts = signal(0);
  readonly lineupDrafts = signal(0);

  async refresh(): Promise<void> {
    try {
      this.eventDrafts.set((await this.api.listEventDrafts()).length);
    } catch {
      this.eventDrafts.set(0);
    }
    try {
      this.lineupDrafts.set((await this.api.listLineupDrafts()).length);
    } catch {
      this.lineupDrafts.set(0);
    }
  }
}

