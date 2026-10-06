import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ChatInputCommandInteraction } from 'discord.js';
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
      await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
      return;
    }

    const compOpt = interaction.options.getString('competition') || undefined;

    if (subcommand === 'setup') {
      const resultsChan = interaction.options.getChannel('results_channel');
      const fixturesChan = interaction.options.getChannel('fixtures_channel');
      const lbChan = interaction.options.getChannel('leaderboard_channel');
      const contactChan = interaction.options.getChannel('contact_channel');
      const recruitChan = interaction.options.getChannel('recruitment_channel');

      await interaction.deferReply({ ephemeral: true });

      await this.prisma.guild.upsert({
        where: { id: guildId },
        update: {
          ...(resultsChan ? { defaultRyvlResultsChannelId: resultsChan.id } : {}),
          ...(fixturesChan ? { defaultRyvlFixturesChannelId: fixturesChan.id } : {}),
          ...(lbChan ? { defaultRyvlLeaderboardChannelId: lbChan.id } : {}),
          ...(contactChan ? { defaultContactChannelId: contactChan.id } : {}),
          ...(recruitChan ? { defaultRecruitmentChannelId: recruitChan.id } : {}),
        },
        create: {
          id: guildId,
          name: interaction.guild?.name || 'Discord Server',
          defaultRyvlResultsChannelId: resultsChan?.id || null,
          defaultRyvlFixturesChannelId: fixturesChan?.id || null,
          defaultRyvlLeaderboardChannelId: lbChan?.id || null,
          defaultContactChannelId: contactChan?.id || null,
          defaultRecruitmentChannelId: recruitChan?.id || null,
        },
      });

      const msg = [
        '✅ **RYVL Channels Configured!**',
        resultsChan ? `• Results: <#${resultsChan.id}>` : null,
        fixturesChan ? `• Fixtures: <#${fixturesChan.id}>` : null,
        lbChan ? `• Leaderboards: <#${lbChan.id}>` : null,
        contactChan ? `• Contact Management: <#${contactChan.id}>` : null,
        recruitChan ? `• Recruitment Applications: <#${recruitChan.id}>` : null,
      ]
        .filter(Boolean)
        .join('\n');

      await interaction.editReply({ content: msg });
      return;
    }

    await interaction.deferReply();

    try {
      const performance = await this.vpgService.getRyvlPerformance(guildId, compOpt);

      if (subcommand === 'performance') {
        const embed = RyvlEmbedBuilder.buildPerformanceOverviewEmbed(performance);
        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'results') {
        const embed = RyvlEmbedBuilder.buildRyvlResultsEmbed(
          performance.recentResults,
          performance.stats.competitionName,
        );
        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'fixtures') {
        const embed = RyvlEmbedBuilder.buildRyvlFixturesEmbed(
          performance.upcomingFixtures,
          performance.stats.competitionName,
        );
        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'leaderboard' || subcommand === 'standings') {
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

    const performance = await this.vpgService.getRyvlPerformance(guildId);
    const embed = RyvlEmbedBuilder.buildRyvlResultsEmbed(performance.recentResults, performance.stats.competitionName);

    await channel.send({ embeds: [embed] });
    return { success: true, message: `Posted RYVL results to #${channel.name}` };
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
