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
        const results = await this.vpgService.fetchMatches('complete', targetSeason, count);
        const embed = buildSuperligaResultsEmbed(results, targetSeason, count);
        await interaction.editReply({ embeds: [embed] });
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
        const season = await this.vpgService.fetchLatestSeason();
        const matches = await this.vpgService.fetchMatches('complete', season, 20);

        // Filter to matches from today in Bucharest timezone
        const todayStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Bucharest',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date()); // YYYY-MM-DD

        const todayMatches = matches.filter((m) => {
          try {
            const mDateStr = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Europe/Bucharest',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(new Date(m.datetime));
            return mDateStr === todayStr;
          } catch {
            return false;
          }
        });

        if (todayMatches.length === 0) {
          // Show recent results as fallback
          const embed = buildSuperligaResultsEmbed(matches, season, 5);
          embed.setTitle(`🏁 VPG Superliga România — Ultimele Rezultate`);
          embed.setDescription(
            `*Nu s-au găsit meciuri jucate astăzi (${todayStr}). Iată ultimele meciuri încheiate:*`,
          );
          await interaction.editReply({ embeds: [embed] });
        } else {
          const embed = buildSuperligaResultsEmbed(todayMatches, season, 12);
          embed.setTitle(`⚽ VPG Superliga România — Rezultatele de Astăzi`);
          await interaction.editReply({ embeds: [embed] });
        }
      } catch (err: any) {
        this.logger.error(`Error fetching today's results: ${err.message}`);
        await interaction.editReply(`❌ Error fetching today's results: ${err.message}`);
      }
    }
  }
}
