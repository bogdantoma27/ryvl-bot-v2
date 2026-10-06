import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LEAGUE_TIMEZONE } from './league.constants';

export const DELIVERY_RETENTION_DAYS = 60;
export const TRANSFER_RETENTION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionResult {
  deliveries: number;
  transfers: number;
  mvpPayloads: number;
}

/**
 * Nightly cleanup of notification bookkeeping that is no longer read:
 * - VPG notification receipts untouched for 60 days. Fixture and standings receipts are
 *   per day, so old ones are never looked at again. Result receipts are only removed for
 *   a season that is behind the newest one the same feed has moved on to and that no
 *   RYVL competition of the guild is pinned to; otherwise a still-listed result would
 *   look unposted and be posted again.
 * - Processed transfers recorded more than 180 days ago (the poller only looks at
 *   transfers newer than its checkpoint).
 * - The raw EA payload of Superliga Awards matches from seasons before the newest one.
 *   Per-player stats, including their raw EA fields, are kept.
 */
@Injectable()
export class VpgRetentionService {
  private readonly logger = new Logger(VpgRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('30 4 * * *', { name: 'vpg-retention', timeZone: LEAGUE_TIMEZONE })
  async nightly(): Promise<void> {
    try {
      const r = await this.cleanup();
      if (r.deliveries || r.transfers || r.mvpPayloads) {
        this.logger.log(`Retention: removed ${r.deliveries} notification receipts, ${r.transfers} processed transfers; cleared ${r.mvpPayloads} old EA match payloads.`);
      }
    } catch (err: any) {
      this.logger.error(`VPG retention cleanup failed: ${err.message}`);
    }
  }

  async cleanup(now = new Date()): Promise<RetentionResult> {
    const deliveryCutoff = new Date(now.getTime() - DELIVERY_RETENTION_DAYS * DAY_MS);
    const transferCutoff = new Date(now.getTime() - TRANSFER_RETENTION_DAYS * DAY_MS);

    // Season of a receipt: "<season>:<match>" for results, "baseline:<scope>:<season>" for markers.
    const deliveries = await this.prisma.$executeRaw`
      WITH keyed AS (
        SELECT d.id, d.guild_id, d.channel_id, d.topic, d.updated_at,
          CASE
            WHEN d.item_key ~ '^[0-9]{1,9}:' THEN split_part(d.item_key, ':', 1)::int
            WHEN d.item_key ~ '^baseline:[^:]*:[0-9]{1,9}$' THEN split_part(d.item_key, ':', 3)::int
          END AS season
        FROM vpg_notification_deliveries d
      ),
      newest AS (
        SELECT guild_id, channel_id, topic, max(season) AS season FROM keyed GROUP BY guild_id, channel_id, topic
      )
      DELETE FROM vpg_notification_deliveries v
      USING keyed k JOIN newest n ON n.guild_id = k.guild_id AND n.channel_id = k.channel_id AND n.topic = k.topic
      WHERE v.id = k.id
        AND k.updated_at < ${deliveryCutoff}
        AND (
          k.topic LIKE 'fixtures:%'
          OR k.topic LIKE 'standings:%'
          OR (
            k.topic LIKE 'result:%'
            AND k.season IS NOT NULL
            AND k.season < n.season
            AND NOT EXISTS (
              SELECT 1 FROM ryvl_competitions c
              WHERE c.guild_id = k.guild_id AND c.season = k.season AND 'result:' || c.slug = k.topic
            )
          )
        )`;

    const transfers = await this.prisma.processedVpgTransfer.deleteMany({ where: { createdAt: { lt: transferCutoff } } });

    // Raw EA payloads are only kept for the newest season of each league.
    const latest = await this.prisma.superligaMvpMatch.groupBy({ by: ['leagueSlug'], _max: { season: true } });
    let mvpPayloads = 0;
    for (const row of latest) {
      if (row._max.season == null) continue;
      const cleared = await this.prisma.$executeRaw`
        UPDATE superliga_mvp_matches SET raw_payload = NULL
        WHERE league_slug = ${row.leagueSlug} AND season < ${row._max.season} AND raw_payload IS NOT NULL`;
      mvpPayloads += cleared;
    }

    return { deliveries, transfers: transfers.count, mvpPayloads };
  }
}
