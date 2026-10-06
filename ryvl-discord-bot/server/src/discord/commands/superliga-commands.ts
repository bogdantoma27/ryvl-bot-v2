import { Injectable, Logger } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';
import { VpgService } from '../../vpg/vpg.service';
import { VpgSuperligaPollerService } from '../../vpg/vpg-superliga-poller.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildSuperligaStandingsEmbed,
  buildSuperligaFixturesEmbed,
  buildSuperligaResultsEmbed,
  buildSuperligaLeaderboardEmbed,
} from '../embeds/superliga-embed.builder';
import { SUPERLIGA_NAME } from '../../vpg/league.constants';

@Injectable()
export class SuperligaCommands {
  private readonly logger = new Logger(SuperligaCommands.name);

  constructor(
    private readonly vpgService: VpgService,
    private readonly pollerService: VpgSuperligaPollerService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------------------------------------------------------------------------
  // /superliga command handler
  // ---------------------------------------------------------------------------

  async handleSuperliga(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const seasonOpt = interaction.options.getInteger('season') || undefined;

    await interaction.deferReply();

    try {
      const targetSeason = seasonOpt || (await this.vpgService.fetchLatestSeason());

      if (subcommand === 'standings') {
        const standings = await this.vpgService.fetchStandings(targetSeason);
        const embed = buildSuperligaStandingsEmbed(standings, targetSeason);
        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'fixtures') {
        const count = interaction.options.getInteger('count') || 10;
        const fixtures = await this.vpgService.fetchMatches('scheduled', targetSeason, count);
        const embed = buildSuperligaFixturesEmbed(fixtures, targetSeason, count);
        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'results') {
        const count = interaction.options.getInteger('count') || 10;
        await interaction.editReply({ embeds: [await this.resultsEmbed({ season: targetSeason, count })] });
      } else if (subcommand === 'leaderboard') {
        const category = (interaction.options.getString('category') || 'strikers') as any;
        const entries = await this.vpgService.fetchLeaderboard(category, targetSeason);
        const embed = buildSuperligaLeaderboardEmbed(entries, category, targetSeason);
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err: any) {
      this.logger.error(`Error executing /superliga ${subcommand}: ${err.message}`);
      await interaction.editReply(`❌ Error retrieving Superliga data: ${err.message}`);
    }
  }

  /**
   * Superliga results embed shared by `/superliga results` (latest `count` results) and
   * `/live_results today` (today's results, else the latest five).
   */
  async resultsEmbed(opts: { season?: number; count?: number; today?: boolean }) {
    if (opts.today) {
      const day = this.vpgService.leagueToday();
      const today = await this.vpgService.getResults({ season: opts.season, day });
      if (today.results.length) {
        return buildSuperligaResultsEmbed(today.results, today.season, 12)
          .setTitle(`⚽ VPG ${SUPERLIGA_NAME} — Rezultatele de Astăzi`);
      }
      const recent = await this.vpgService.getResults({ season: today.season, limit: 5 });
      return buildSuperligaResultsEmbed(recent.results, recent.season, 5)
        .setTitle(`🏁 VPG ${SUPERLIGA_NAME} — Ultimele Rezultate`)
        .setDescription(`*Nu s-au găsit meciuri jucate astăzi (${day}). Iată ultimele meciuri încheiate:*`);
    }
    const count = opts.count || 10;
    const { season, results } = await this.vpgService.getResults({ season: opts.season, limit: count });
    return buildSuperligaResultsEmbed(results, season, count);
  }

  // ---------------------------------------------------------------------------
  // /live_results command handler
  // ---------------------------------------------------------------------------

  async handleLiveResults(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
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
        await interaction.editReply('Please select a valid text channel.');
        return;
      }

      try {
        await this.prisma.guild.update({
          where: { id: guildId },
          data: { defaultLiveResultsChannelId: channel.id },
        });

        const embed = new EmbedBuilder()
          .setColor(0xeae905)
          .setTitle('✅ Superliga Live Results Configured')
          .setDescription(
            `Automated live results for **VPG Superliga România** will now be published to <#${channel.id}> as matches conclude!`,
          )
          .addFields(
            { name: 'Channel', value: `<#${channel.id}>`, inline: true },
            { name: 'League', value: 'VPG Superliga România', inline: true },
          )
          .setFooter({ text: 'VPG Superliga România • powered by RYVL' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (err: any) {
        this.logger.error(`Failed to setup live results channel: ${err.message}`);
        await interaction.editReply(`❌ Could not update channel: ${err.message}`);
      }
      return;
    }

    if (subcommand === 'check') {
      await interaction.deferReply({ ephemeral: true });
      const guildId = interaction.guildId;
      if (!guildId) {
        await interaction.editReply('This command can only be run inside a Discord server.');
        return;
      }

      try {
        const result = await this.pollerService.checkGuildNow(guildId);
        if (result.postedCount > 0) {
          await interaction.editReply(
            `✅ Checked Superliga live results! Posted **${result.postedCount}** new match result(s) to the configured channel.`,
          );
        } else {
          await interaction.editReply(
            `ℹ️ No new unposted completed matches found at this time.`,
          );
        }
      } catch (err: any) {
        this.logger.error(`Error checking live results: ${err.message}`);
        await interaction.editReply(`❌ Error checking live results: ${err.message}`);
      }
      return;
    }

    if (subcommand === 'today') {
      await interaction.deferReply();
      try {
        await interaction.editReply({ embeds: [await this.resultsEmbed({ today: true })] });
      } catch (err: any) {
        this.logger.error(`Error fetching today's results: ${err.message}`);
        await interaction.editReply(`❌ Error fetching today's results: ${err.message}`);
      }
    }
  }
}
