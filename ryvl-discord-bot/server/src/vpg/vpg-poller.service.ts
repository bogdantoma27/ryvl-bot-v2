import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VpgService } from './vpg.service';
import { DiscordService } from '../discord/discord.service';
import { buildVpgTransferEmbed } from '../discord/embeds/vpg-embed.builder';
import { VpgMovementRaw, VpgTransferItem } from './vpg.types';
import { intervalDue } from './notification-policy';

// Every guild is checked on this tick; each one is polled when its own interval is due.
const TICK_MS = 30 * 1000;
export const MIN_TRANSFER_POLL_SEC = 60;
export const MAX_TRANSFER_POLL_SEC = 3600;
const PAGE_SIZE = 50;
const MAX_PAGES = 10;
// A transfer that fails to post this many times in a row is skipped, so one bad item
// cannot hold back every later transfer forever.
export const MAX_TRANSFER_SEND_ATTEMPTS = 5;

export function transferPollIntervalSec(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 120;
  return Math.min(MAX_TRANSFER_POLL_SEC, Math.max(MIN_TRANSFER_POLL_SEC, n));
}

/**
 * Reads the movement feed page by page until it reaches a transfer at or below
 * `lastId`, and returns the newer transfers oldest first. `complete` is false when the
 * page limit was reached before the checkpoint (more transfers than can be caught up).
 */
export async function collectTransfersSince(
  fetchPage: (limit: number, offset: number) => Promise<VpgMovementRaw[]>,
  lastId: number,
  pageSize = PAGE_SIZE,
  maxPages = MAX_PAGES,
): Promise<{ fresh: VpgMovementRaw[]; complete: boolean }> {
  const byId = new Map<number, VpgMovementRaw>();
  for (let page = 0; page < maxPages; page++) {
    const items = await fetchPage(pageSize, page * pageSize);
    let reachedCheckpoint = items.length < pageSize;
    for (const item of items) {
      const id = Number(item?.id);
      if (!Number.isSafeInteger(id)) continue;
      if (id <= lastId) reachedCheckpoint = true;
      else byId.set(id, { ...item, id });
    }
    if (reachedCheckpoint) return { fresh: [...byId.values()].sort((a, b) => a.id - b.id), complete: true };
  }
  return { fresh: [...byId.values()].sort((a, b) => a.id - b.id), complete: false };
}

@Injectable()
export class VpgPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VpgPollerService.name);
  private pollInterval: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private readonly sendFailures = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly vpgService: VpgService,
    @Inject(forwardRef(() => DiscordService))
    private readonly discordService: DiscordService,
  ) {}

  onModuleInit(): void {
    this.startPolling();
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }

  private startPolling(): void {
    // Initial delay of 20 seconds after boot to let Discord client connect
    this.initialTimer = setTimeout(() => {
      this.pollAllGuilds().catch((err) =>
        this.logger.error(`Initial VPG transfers poll failed: ${err.message}`),
      );
    }, 20000);
    this.initialTimer.unref?.();

    this.pollInterval = setInterval(() => {
      this.pollAllGuilds().catch((err) =>
        this.logger.error(`Periodic VPG transfers poll failed: ${err.message}`),
      );
    }, TICK_MS);
    this.pollInterval.unref?.();

    this.logger.log('VPG transfers poller initialized (per-guild interval, 60-3600s).');
  }

  private stopPolling(): void {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.logger.log('VPG Superliga transfers poller stopped.');
    }
  }

  async pollAllGuilds(now = new Date()): Promise<void> {
    if (this.isPolling) {
      this.logger.debug('VPG poll already in progress, skipping tick.');
      return;
    }

    this.isPolling = true;
    try {
      const activeConfigs = await this.prisma.vpgTransferConfig.findMany({
        where: {
          enabled: true,
          channelId: { not: null },
        },
      });

      for (const config of activeConfigs) {
        if (!intervalDue(config.lastPolledAt, transferPollIntervalSec(config.pollIntervalSec), now)) continue;
        if (!this.discordService.isInGuild(config.guildId)) continue;
        try {
          await this.pollGuild(config);
        } catch (guildErr: any) {
          this.logger.error(
            `Error polling VPG transfers for guild ${config.guildId}: ${guildErr.message}`,
          );
          // Back off to the guild's interval instead of retrying on every tick.
          await this.prisma.vpgTransferConfig
            .update({ where: { guildId: config.guildId }, data: { lastPolledAt: new Date() } })
            .catch(() => undefined);
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  private async recordTransfer(guildId: string, t: VpgTransferItem, discordMessageId: string | null, channelId: string | null) {
    await this.vpgService.recordProcessedTransfer({
      guildId,
      transferId: t.id,
      username: t.username,
      fromName: t.fromName,
      fromSlug: t.fromSlug,
      fromLogo: t.fromLogoUrl,
      toName: t.toName,
      toSlug: t.toSlug,
      toLogo: t.toLogoUrl,
      amount: t.amount,
      occurredAt: new Date(t.datetime),
      discordMessageId,
      channelId,
    });
  }

  async pollGuild(config: any): Promise<{ postedCount: number; latestTransfer?: VpgTransferItem }> {
    if (!config.channelId) {
      return { postedCount: 0 };
    }
    const communitySlug = config.communitySlug || undefined;

    // Baseline run: no checkpoint yet, so start from the newest transfer instead of
    // posting the whole history.
    if (config.lastTransferId === null || config.lastTransferId === undefined) {
      const firstPage = await this.vpgService.fetchRawMovements(PAGE_SIZE, 0, communitySlug);
      const ids = firstPage.map((t) => Number(t.id)).filter((id) => Number.isSafeInteger(id));
      if (!ids.length) {
        await this.prisma.vpgTransferConfig.update({ where: { guildId: config.guildId }, data: { lastPolledAt: new Date() } });
        return { postedCount: 0 };
      }
      const maxId = Math.max(...ids);
      this.logger.log(`Setting initial VPG transfer checkpoint for guild ${config.guildId} to transferId ${maxId}`);
      const latest = await this.vpgService.enrichTransfer(firstPage.find((t) => Number(t.id) === maxId)!, communitySlug);
      await this.recordTransfer(config.guildId, latest, null, null);
      await this.prisma.vpgTransferConfig.update({
        where: { guildId: config.guildId },
        data: { lastTransferId: maxId, lastPolledAt: new Date() },
      });
      return { postedCount: 0, latestTransfer: latest };
    }

    const lastId = Number(config.lastTransferId);
    const { fresh, complete } = await collectTransfersSince(
      (limit, offset) => this.vpgService.fetchRawMovements(limit, offset, communitySlug),
      lastId,
    );
    if (!complete) {
      this.logger.warn(`More than ${PAGE_SIZE * MAX_PAGES} new VPG transfers for guild ${config.guildId}; posting the newest ones only.`);
    }

    // The checkpoint only moves past a transfer once it is posted (or given up on), so a
    // failed send is retried on the next poll, in order.
    let checkpoint = lastId;
    let postedCount = 0;
    let latestTransfer: VpgTransferItem | undefined;
    for (const raw of fresh) {
      if (await this.vpgService.isTransferProcessed(config.guildId, raw.id)) {
        checkpoint = raw.id;
        continue;
      }
      const t = await this.vpgService.enrichTransfer(raw, communitySlug);
      latestTransfer = t;
      const failureKey = `${config.guildId}:${t.id}`;
      try {
        const sent = await this.discordService.sendMessageToChannel(config.channelId, buildVpgTransferEmbed(t));
        await this.recordTransfer(config.guildId, t, sent?.id || null, config.channelId);
        this.sendFailures.delete(failureKey);
        checkpoint = t.id;
        postedCount++;
        this.logger.log(
          `Posted VPG transfer #${t.id} (${t.username}: ${t.fromName} -> ${t.toName}) to channel ${config.channelId}`,
        );
      } catch (sendErr: any) {
        const attempts = (this.sendFailures.get(failureKey) || 0) + 1;
        if (attempts < MAX_TRANSFER_SEND_ATTEMPTS) {
          this.sendFailures.set(failureKey, attempts);
          this.logger.warn(
            `Failed to post VPG transfer #${t.id} to channel ${config.channelId} (attempt ${attempts}); retrying next poll: ${sendErr.message}`,
          );
          break;
        }
        this.sendFailures.delete(failureKey);
        this.logger.error(
          `Giving up on VPG transfer #${t.id} for channel ${config.channelId} after ${attempts} attempts: ${sendErr.message}`,
        );
        await this.recordTransfer(config.guildId, t, null, config.channelId);
        checkpoint = t.id;
      }
    }

    await this.prisma.vpgTransferConfig.update({
      where: { guildId: config.guildId },
      data: {
        lastTransferId: Math.max(lastId, checkpoint),
        lastPolledAt: new Date(),
      },
    });

    return { postedCount, latestTransfer };
  }

  async checkGuildNow(guildId: string): Promise<{ postedCount: number }> {
    const config = await this.vpgService.getOrCreateConfig(guildId);
    const result = await this.pollGuild(config);
    return { postedCount: result.postedCount };
  }

  async postLatestToDiscord(guildId: string, customChannelId?: string): Promise<{ success: boolean; messageId?: string }> {
    const config = await this.vpgService.getOrCreateConfig(guildId);
    const channelId = customChannelId || config.channelId;

    if (!channelId) {
      throw new Error('No Discord channel configured for VPG transfers.');
    }

    const transfers = await this.vpgService.fetchTransfers(1, 0, config.communitySlug);
    if (!transfers || transfers.length === 0) {
      throw new Error('No transfers available from VPG API.');
    }

    const latest = transfers[0];
    const embed = buildVpgTransferEmbed(latest);
    const sent = await this.discordService.sendMessageToChannel(channelId, embed);
    await this.recordTransfer(guildId, latest, sent?.id || null, channelId);

    return { success: true, messageId: sent?.id };
  }
}
