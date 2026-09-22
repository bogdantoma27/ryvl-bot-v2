import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { EaService } from '../../ea/ea.service';
import { EaPollerService } from '../../ea/ea-poller.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EaCommands {
  private readonly logger = new Logger(EaCommands.name);

  constructor(
    private readonly eaService: EaService,
    private readonly eaPollerService: EaPollerService,
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
      await interaction.editReply('Please select a valid text channel for match stats notifications.');
      return;
    }

    const customClubName = interaction.options.getString('club_name')?.trim();

    let targetClubId = '128199';
    let targetClubName = 'RYVL Esports';
    let targetPlatform = 'common-gen5';

    if (customClubName) {
      try {
        const searchResults = await this.eaService.searchClubs(customClubName);
        if (searchResults && searchResults.length > 0) {
          const match = searchResults[0];
          targetClubId = String(match.clubId);
          targetClubName = match.name || customClubName;
          targetPlatform = 'common-gen5';
        } else {
          await interaction.editReply(
            `⚠️ Could not find any EA Pro Clubs matching **"${customClubName}"**. Setup cancelled. Please check the spelling or search via the web dashboard.`,
          );
          return;
        }
      } catch (err: any) {
        this.logger.error(`Error searching clubs for setup: ${err.message}`);
      }
    }

    const updatedConfig = await this.eaService.updateTrackerConfig(guildId, {
      clubId: targetClubId,
      clubName: targetClubName,
      platform: targetPlatform,
      channelId: channel.id,
      enabled: true,
    });

    const embed = new EmbedBuilder()
      .setTitle('⚙️ EA Sports Pro Clubs Tracker Configured')
      .setColor(0x57f287)
      .setDescription(
        `Automated match stats notifications have been enabled for **<#${channel.id}>**!`,
      )
      .addFields(
        { name: 'Club Name', value: `**${updatedConfig.clubName}**`, inline: true },
        { name: 'Club ID', value: `\`${updatedConfig.clubId}\``, inline: true },
        { name: 'Notification Channel', value: `<#${updatedConfig.channelId}>`, inline: true },
        { name: 'Check Interval', value: 'Every 90 seconds', inline: true },
        { name: 'Tracked Match Types', value: 'League, Friendly, Playoff', inline: true },
        { name: 'Status', value: '🟢 **Active**', inline: true },
      )
      .setFooter({ text: 'RYVL Esports Bot • EA Pro Clubs Tracker' });

    await interaction.editReply({ embeds: [embed] });
  }

  async handleStats(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply('This command can only be run inside a Discord server.');
      return;
    }

    const config = await this.eaService.getOrCreateTrackerConfig(guildId);
    const customClubName = interaction.options.getString('club_name')?.trim();

    let targetClubId = config.clubId;
    let targetPlatform = config.platform || 'common-gen5';
    let targetClubName = config.clubName;

    if (customClubName) {
      try {
        const searchResults = await this.eaService.searchClubs(customClubName);
        if (searchResults && searchResults.length > 0) {
          const match = searchResults[0];
          targetClubId = String(match.clubId);
          targetClubName = match.name || customClubName;
          targetPlatform = 'common-gen5';
        } else {
          await interaction.editReply(`Could not find club **"${customClubName}"**.`);
          return;
        }
      } catch (err: any) {
        await interaction.editReply(`Error searching club: ${err.message}`);
        return;
      }
    }

    try {
      const [overall, info] = await Promise.all([
        this.eaService.fetchOverallStats(targetClubId, targetPlatform).catch(() => null),
        this.eaService.fetchClubInfo(targetClubId, targetPlatform).catch(() => null),
      ]);

      const statData = Array.isArray(overall) && overall.length > 0 ? overall[0] : overall || {};
      const infoData = info?.[targetClubId] || info || {};

      const wins = parseInt(String(statData.wins || 0), 10);
      const losses = parseInt(String(statData.losses || 0), 10);
      const ties = parseInt(String(statData.ties || 0), 10);
      const totalGames = wins + losses + ties;
      const winRate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : '0.0';

      const goalsScored = parseInt(String(statData.goals || 0), 10);
      const goalsConceded = parseInt(String(statData.goalsAgainst || 0), 10);
      const diff = goalsScored - goalsConceded;
      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;

      const skillRating = statData.skillRating || 'N/A';
      const bestDivision = statData.bestDivision != null ? `Div ${statData.bestDivision}` : 'N/A';

      const crestUrl = this.eaService.getCrestUrl(
        infoData.customKit?.crestAssetId || infoData.teamId,
      );

      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${targetClubName} — EA Pro Clubs Stats`)
        .setColor(0x00d26a)
        .setDescription(
          `**Record**: **${wins}W - ${ties}D - ${losses}L** (${winRate}% win rate)\n` +
          `**Skill Rating**: \`${skillRating}\` • **Best Division**: \`${bestDivision}\``,
        )
        .addFields(
          {
            name: '⚽ Goal Statistics',
            value: `Scored: **${goalsScored}**\nConceded: **${goalsConceded}**\nGoal Diff: **${diffStr}**`,
            inline: true,
          },
          {
            name: '🛡️ Defense & Passing',
            value: `Clean Sheets: **${statData.cleanSheets || 0}**\nPasses Made: **${statData.passesMade || 0}**\nTackles Made: **${statData.tacklesMade || 0}**`,
            inline: true,
          },
          {
            name: '🎮 Club Info',
            value: `Platform: \`${targetPlatform}\`\nClub ID: \`${targetClubId}\`\nTotal Matches: **${totalGames}**`,
            inline: true,
          },
        )
        .setFooter({ text: 'Data provided by EA Sports Pro Clubs API' });

      if (crestUrl) {
        embed.setThumbnail(crestUrl);
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      this.logger.error(`Error in /ea_stats: ${error.message}`);
      await interaction.editReply(`Failed to retrieve stats for ${targetClubName}: ${error.message}`);
    }
  }

  async handleLatest(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply('This command can only be run inside a Discord server.');
      return;
    }

    try {
      const result = await this.eaPollerService.postLatestMatch(
        guildId,
        interaction.channelId,
      );

      if (!result.success) {
        await interaction.editReply(`⚠️ ${result.error || 'Failed to post latest match.'}`);
        return;
      }

      await interaction.editReply('✅ Latest match posted successfully!');
    } catch (error: any) {
      this.logger.error(`Error in /ea_latest: ${error.message}`);
      await interaction.editReply(`❌ Error posting latest match: ${error.message}`);
    }
  }
}
