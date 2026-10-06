import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { VpgService } from '../../vpg/vpg.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DiscordService } from '../discord.service';
import { RyvlEmbedBuilder } from '../embeds/ryvl-embed.builder';

@Injectable()
export class RyvlCommands {
  private readonly logger = new Logger(RyvlCommands.name);

  constructor(
    private readonly vpgService: VpgService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => DiscordService))
    private readonly discordService: DiscordService,
  ) {}

  async handleRyvl(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: '❌ This command can only be used in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const compOpt = interaction.options.getString('competition') || undefined;

    if (subcommand === 'setup') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await this.handleSetup(interaction, guildId);
      return;
    }

    await interaction.deferReply();

    try {
      if (subcommand === 'results') {
        await interaction.editReply({ embeds: [await this.ryvlResultsEmbed(guildId, compOpt)] });
        return;
      }
      const performance = await this.vpgService.getRyvlPerformance(guildId, compOpt);

      if (subcommand === 'fixtures') {
        const embed = RyvlEmbedBuilder.buildRyvlFixturesEmbed(
          performance.upcomingFixtures,
          performance.stats.competitionName,
        );
        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'performance' || subcommand === 'leaderboard') {
        // leaderboard is kept as an alias: the overview already includes the league standing.
        const embed = RyvlEmbedBuilder.buildPerformanceOverviewEmbed(performance);
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err: any) {
      this.logger.error(`Error handling /ryvl ${subcommand}: ${err.message}`, err.stack);
      await interaction.editReply({
        content: `❌ Could not retrieve RYVL performance data: ${err.message}`,
      });
    }
  }

  private async handleSetup(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
    const picked = {
      defaultRyvlResultsChannelId: interaction.options.getChannel('results_channel'),
      defaultRyvlFixturesChannelId: interaction.options.getChannel('fixtures_channel'),
      defaultRyvlLeaderboardChannelId: interaction.options.getChannel('leaderboard_channel'),
      defaultContactChannelId: interaction.options.getChannel('contact_channel'),
      defaultRecruitmentChannelId: interaction.options.getChannel('recruitment_channel'),
    };
    const labels: Record<keyof typeof picked, string> = {
      defaultRyvlResultsChannelId: 'Results',
      defaultRyvlFixturesChannelId: 'Fixtures',
      defaultRyvlLeaderboardChannelId: 'Leaderboards',
      defaultContactChannelId: 'Website contact messages',
      defaultRecruitmentChannelId: 'Trial applications',
    };
    const keys = Object.keys(picked) as Array<keyof typeof picked>;

    try {
      const update = Object.fromEntries(
        keys.filter((key) => picked[key]).map((key) => [key, picked[key]!.id]),
      );
      const guild = Object.keys(update).length
        ? await this.prisma.guild.upsert({
            where: { id: guildId },
            update,
            create: { id: guildId, name: interaction.guild?.name || 'Discord Server', ...update },
          })
        : await this.prisma.guild.findUnique({ where: { id: guildId } });

      const lines = keys.map((key) => {
        const channelId = guild?.[key];
        const changed = picked[key] ? ' (updated)' : '';
        return `• ${labels[key]}: ${channelId ? `<#${channelId}>` : 'not set'}${changed}`;
      });
      const header = Object.keys(update).length
        ? '✅ **RYVL channels configured.**'
        : 'ℹ️ No channel was picked, so nothing changed. Current RYVL channels:';
      await interaction.editReply({ content: [header, ...lines].join('\n') });
    } catch (err: any) {
      this.logger.error(`Error handling /ryvl setup: ${err.message}`, err.stack);
      await interaction.editReply({ content: `❌ Could not save the RYVL channels: ${err.message}` });
    }
  }

  /** Body channel ids and stored defaults alike must resolve to a text channel of guildId. */
  private async resolveRyvlChannel(
    guildId: string,
    channelId: string | undefined,
    setting: 'defaultRyvlResultsChannelId' | 'defaultRyvlFixturesChannelId' | 'defaultRyvlLeaderboardChannelId',
  ) {
    const targetChannelId =
      channelId || (await this.prisma.guild.findUnique({ where: { id: guildId } }))?.[setting];
    if (!targetChannelId) return null;
    return this.discordService.assertChannelInGuild(guildId, targetChannelId);
  }

  async postRyvlResultsToChannel(guildId: string, channelId?: string): Promise<{ success: boolean; message: string }> {
    const channel = await this.resolveRyvlChannel(guildId, channelId, 'defaultRyvlResultsChannelId');
    if (!channel) {
      return { success: false, message: 'No target ryvl-results channel configured.' };
    }

    await channel.send({ embeds: [await this.ryvlResultsEmbed(guildId)] });
    return { success: true, message: `Posted RYVL results to #${channel.name}` };
  }

  /** RYVL's latest results in a competition; the same results query `/superliga results` uses. */
  async ryvlResultsEmbed(guildId: string, competitionSlug?: string) {
    const { competition } = await this.vpgService.resolveCompetition(guildId, competitionSlug);
    const { results } = await this.vpgService.getResults({
      leagueSlug: competition.slug,
      season: competition.season,
      ryvlOnly: true,
      limit: 10,
    });
    return RyvlEmbedBuilder.buildRyvlResultsEmbed(results, competition.name);
  }

  async postRyvlFixturesToChannel(guildId: string, channelId?: string): Promise<{ success: boolean; message: string }> {
    const channel = await this.resolveRyvlChannel(guildId, channelId, 'defaultRyvlFixturesChannelId');
    if (!channel) {
      return { success: false, message: 'No target ryvl-fixtures channel configured.' };
    }

    const performance = await this.vpgService.getRyvlPerformance(guildId);
    const embed = RyvlEmbedBuilder.buildRyvlFixturesEmbed(performance.upcomingFixtures, performance.stats.competitionName);

    await channel.send({ embeds: [embed] });
    return { success: true, message: `Posted RYVL fixtures to #${channel.name}` };
  }

  async postRyvlLeaderboardToChannel(guildId: string, channelId?: string): Promise<{ success: boolean; message: string }> {
    const channel = await this.resolveRyvlChannel(guildId, channelId, 'defaultRyvlLeaderboardChannelId');
    if (!channel) {
      return { success: false, message: 'No target ryvl-leaderboard channel configured.' };
    }

    const performance = await this.vpgService.getRyvlPerformance(guildId);
    const embed = RyvlEmbedBuilder.buildPerformanceOverviewEmbed(performance);

    await channel.send({ embeds: [embed] });
    return { success: true, message: `Posted RYVL performance & leaderboard overview to #${channel.name}` };
  }
}
