import { Injectable, Logger } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { VpgService } from '../../vpg/vpg.service';
import { VpgPollerService } from '../../vpg/vpg-poller.service';
import { PrismaService } from '../../prisma/prisma.service';
import { buildVpgTransferEmbed } from '../embeds/vpg-embed.builder';

@Injectable()
export class VpgCommands {
  private readonly logger = new Logger(VpgCommands.name);

  constructor(
    private readonly vpgService: VpgService,
    private readonly vpgPollerService: VpgPollerService,
    private readonly prisma: PrismaService,
  ) {}

  async handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply('This command can only be run inside a Discord server.');
      return;
    }

    const channel = interaction.options.getChannel('channel', true);
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement
    ) {
      await interaction.editReply('Please select a valid text or announcement channel for transfer news.');
      return;
    }

    const enabled = interaction.options.getBoolean('enabled') ?? true;

    try {
      const config = await this.vpgService.updateConfig(guildId, {
        channelId: channel.id,
        enabled,
      });

      const embed = new EmbedBuilder()
        .setColor(0x1f8b4c)
        .setTitle('✅ VPG Superliga Transfers Configured')
        .setDescription(
          `Automated transfer notifications are now **${config.enabled ? 'ENABLED' : 'DISABLED'}** for channel <#${channel.id}>.\n` +
          `Whenever a transfer happens in **VPG Superliga România**, it will be posted here automatically!`,
        )
        .addFields(
          { name: 'Community', value: 'VPGRoPS5 (VPG Romania)', inline: true },
          { name: 'League', value: 'Superliga România', inline: true },
          { name: 'Channel', value: `<#${channel.id}>`, inline: true },
          { name: 'Auto-Check Interval', value: `${config.pollIntervalSec || 120} seconds`, inline: true },
        )
        .setFooter({ text: 'VPG Superliga România • powered by RYVL' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      this.logger.log(`Configured VPG transfers for guild ${guildId} to channel ${channel.id}`);
    } catch (err: any) {
      this.logger.error(`Failed to setup VPG transfers: ${err.message}`);
      await interaction.editReply(`❌ Error setting up VPG transfers: ${err.message}`);
    }
  }

  async handleLatest(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const count = Math.min(Math.max(interaction.options.getInteger('count') || 3, 1), 5);

    try {
      const transfers = await this.vpgService.fetchTransfers(count, 0);
      if (!transfers || transfers.length === 0) {
        await interaction.editReply('No recent VPG transfers found.');
        return;
      }

      const embeds = transfers.map((t) => buildVpgTransferEmbed(t));
      await interaction.editReply({
        content: `📋 **Latest VPG Superliga România Transfers** (Showing ${transfers.length}):`,
        embeds,
      });
    } catch (err: any) {
      this.logger.error(`Failed to fetch latest VPG transfers: ${err.message}`);
      await interaction.editReply(`❌ Error fetching latest transfers: ${err.message}`);
    }
  }

  async handleCheck(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply('This command can only be run inside a Discord server.');
      return;
    }

    try {
      const result = await this.vpgPollerService.checkGuildNow(guildId);
      if (result.postedCount > 0) {
        await interaction.editReply(
          `✅ Checked VPG Superliga transfers! Found and posted **${result.postedCount}** new transfer(s) to the configured channel.`,
        );
      } else {
        await interaction.editReply(
          `ℹ️ Checked VPG Superliga transfers. No new transfers since the last check.`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Error during manual VPG transfers check: ${err.message}`);
      await interaction.editReply(`❌ Error checking transfers: ${err.message}`);
    }
  }
}
