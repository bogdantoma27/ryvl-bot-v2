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
import { VpgTransferItem } from './vpg.types';

@Injectable()
export class VpgPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VpgPollerService.name);
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

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
    setTimeout(() => {
      this.pollAllGuilds().catch((err) =>
        this.logger.error(`Initial VPG transfers poll failed: ${err.message}`),
      );
    }, 20000);

    // Poll every 120 seconds
    this.pollInterval = setInterval(() => {
      this.pollAllGuilds().catch((err) =>
        this.logger.error(`Periodic VPG transfers poll failed: ${err.message}`),
      );
    }, 120000);

    this.logger.log('VPG Superliga transfers poller initialized (120s interval).');
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.logger.log('VPG Superliga transfers poller stopped.');
    }
  }

  async pollAllGuilds(): Promise<void> {
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
        try {
          await this.pollGuild(config);
        } catch (guildErr: any) {
          this.logger.error(
            `Error polling VPG transfers for guild ${config.guildId}: ${guildErr.message}`,
          );
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  async pollGuild(config: any): Promise<{ postedCount: number; latestTransfer?: VpgTransferItem }> {
    if (!config.channelId) {
      return { postedCount: 0 };
    }

    const transfers = await this.vpgService.fetchTransfers(15, 0);
    if (!transfers || transfers.length === 0) {
      await this.prisma.vpgTransferConfig.update({
        where: { guildId: config.guildId },
        data: { lastPolledAt: new Date() },
      });
      return { postedCount: 0 };
    }

    const maxId = Math.max(...transfers.map((t) => t.id));

    // Baseline run: if no lastTransferId recorded yet, set baseline to avoid spamming historical transfers
    if (config.lastTransferId === null || config.lastTransferId === undefined) {
      this.logger.log(
        `Setting initial VPG transfer checkpoint for guild ${config.guildId} to transferId ${maxId}`,
      );

      await this.prisma.vpgTransferConfig.update({
        where: { guildId: config.guildId },
        data: {
          lastTransferId: maxId,
          lastPolledAt: new Date(),
        },
      });

      // Optionally post the single latest transfer as a welcome / verification if channel is ready
      const latest = transfers[0];
      await this.vpgService.recordProcessedTransfer({
        guildId: config.guildId,
        transferId: latest.id,
        username: latest.username,
        fromName: latest.fromName,
        fromSlug: latest.fromSlug,
        fromLogo: latest.fromLogoUrl,
        toName: latest.toName,
        toSlug: latest.toSlug,
        toLogo: latest.toLogoUrl,
        amount: latest.amount,
        occurredAt: new Date(latest.datetime),
      });

      return { postedCount: 0, latestTransfer: latest };
    }

    // Filter all transfers with ID > lastTransferId
    const fresh = transfers.filter((t) => t.id > config.lastTransferId);
    let postedCount = 0;

    // Send in chronological order (oldest new transfer first)
    for (const t of fresh.slice().reverse()) {
      const alreadyProcessed = await this.vpgService.isTransferProcessed(config.guildId, t.id);
      if (alreadyProcessed) continue;

      let sentMessageId: string | null = null;
      try {
        const embed = buildVpgTransferEmbed(t);
        const sent = await this.discordService.sendMessageToChannel(config.channelId, embed);
        sentMessageId = sent?.id || null;
        this.logger.log(
          `Posted VPG transfer #${t.id} (${t.username}: ${t.fromName} -> ${t.toName}) to channel ${config.channelId}`,
        );
        postedCount++;
      } catch (sendErr: any) {
        this.logger.error(
          `Failed to post VPG transfer #${t.id} to channel ${config.channelId}: ${sendErr.message}`,
        );
      }

      await this.vpgService.recordProcessedTransfer({
        guildId: config.guildId,
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
        discordMessageId: sentMessageId,
        channelId: config.channelId,
      });
    }

    const newLastId = Math.max(config.lastTransferId, maxId);
    await this.prisma.vpgTransferConfig.update({
      where: { guildId: config.guildId },
      data: {
        lastTransferId: newLastId,
        lastPolledAt: new Date(),
      },
    });

    return { postedCount, latestTransfer: transfers[0] };
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

    const transfers = await this.vpgService.fetchTransfers(1, 0);
    if (!transfers || transfers.length === 0) {
      throw new Error('No transfers available from VPG API.');
    }

    const latest = transfers[0];
    const embed = buildVpgTransferEmbed(latest);
    const sent = await this.discordService.sendMessageToChannel(channelId, embed);

    await this.vpgService.recordProcessedTransfer({
      guildId,
      transferId: latest.id,
      username: latest.username,
      fromName: latest.fromName,
      fromSlug: latest.fromSlug,
      fromLogo: latest.fromLogoUrl,
      toName: latest.toName,
      toSlug: latest.toSlug,
      toLogo: latest.toLogoUrl,
      amount: latest.amount,
      occurredAt: new Date(latest.datetime),
      discordMessageId: sent?.id || null,
      channelId,
    });

    return { success: true, messageId: sent?.id };
  }
}
