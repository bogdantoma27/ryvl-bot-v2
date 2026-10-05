import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SuperligaMvpService } from './superliga-mvp.service';

// EA keeps only each club's most recent games, so results must be linked soon after
// they are played. Every 10 minutes is frequent enough and light on VPG and EA.
const SYNC_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class SuperligaMvpPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SuperligaMvpPollerService.name);
  private timer: NodeJS.Timeout | null = null;
  private startTimer: NodeJS.Timeout | null = null;

  constructor(private readonly mvp: SuperligaMvpService) {}

  onModuleInit(): void {
    this.startTimer = setTimeout(() => void this.tick(), 60_000);
    this.timer = setInterval(() => void this.tick(), SYNC_INTERVAL_MS);
    this.logger.log('Superliga MVP stats sync initialized (10 min interval).');
  }

  onModuleDestroy(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    try {
      const r = await this.mvp.sync();
      if (r.newMatches || r.linked || r.expired || r.errors.length) {
        this.logger.log(
          `Superliga MVP sync S${r.season}: ${r.newMatches} new, ${r.linked} linked, ${r.stillPending} pending, ${r.expired} expired, ${r.teamsLinkedToEa}/${r.teamsTotal} teams linked to EA` +
            (r.errors.length ? `; ${r.errors.length} error(s): ${r.errors.slice(0, 3).join(' | ')}` : ''),
        );
      }
    } catch (err: any) {
      this.logger.error(`Superliga MVP sync failed: ${err.message}`);
    }
  }
}
