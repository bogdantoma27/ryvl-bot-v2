import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
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

  async handleTrackTeam(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply('This command can only be run inside a Discord server.');
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.editReply('⛔ Only server administrators can configure tracked clubs.');
      return;
    }

    const teamName = interaction.options.getString('name', true).trim();
    // The channel option is optional: default to the channel the command was run in.
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    if (
      !channel ||
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement
    ) {
      await interaction.editReply('Please select a valid text channel for match stats notifications.');
      return;
    }

    try {
      const searchResults = await this.eaService.searchClubs(teamName);
      if (!searchResults || searchResults.length === 0) {
        await interaction.editReply(
          `⚠️ Could not find any EA Pro Clubs matching **"${teamName}"** on EA servers. Please verify the exact spelling.`,
        );
        return;
      }

      const match = searchResults[0];
      const tracked = await this.eaService.addTrackedClub(
        guildId,
        String(match.clubId),
        match.name || teamName,
        channel.id,
        'common-gen5',
        match.crestUrl,
      );

      const embed = new EmbedBuilder()
        .setTitle('⚽ EA Pro Club Added to Multi-Club Tracking')
        .setColor(0x00d26a)
        .setDescription(
          `**${tracked.clubName}** has been verified and registered for continuous match tracking!`,
        )
        .addFields(
          { name: 'Club Name', value: `**${tracked.clubName}**`, inline: true },
          { name: 'Club ID', value: `\`${tracked.clubId}\``, inline: true },
          { name: 'Initial ELO', value: `⭐ **${tracked.elo}**`, inline: true },
          { name: 'Channel', value: `<#${tracked.channelId}>`, inline: true },
          { name: 'Division', value: match.currentDivision ? `Div ${match.currentDivision}` : 'Pro Clubs', inline: true },
          { name: 'Record', value: `${match.wins || 0}W - ${match.ties || 0}D - ${match.losses || 0}L`, inline: true },
        )
        .setFooter({ text: 'RYVL Esports Bot • Multi-Club Pro Clubs Tracking' });

      if (tracked.crestUrl) {
        embed.setThumbnail(tracked.crestUrl);
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      this.logger.error(`Error in /track_team: ${err?.message || err}`);
      await interaction.editReply(`❌ Error verifying club: ${err?.message || err}`);
    }
  }

  async handleTeamStats(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply('This command can only be run inside a Discord server.');
      return;
    }

    const clubName = interaction.options.getString('name')?.trim();

    try {
      const stats = await this.eaService.getClubStats(guildId, clubName);

      const diff = stats.goalDifference;
      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;

      const topScorersList = stats.topScorers.length > 0
        ? stats.topScorers.map((s, idx) => `${idx + 1}. **${s.name}** — **${s.goals}** goals, **${s.assists}** assists (${s.matches} games)`).join('\n')
        : 'No player match stats recorded yet.';

      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${stats.clubName} — Club Stats & Form`)
        .setColor(0x00d26a)
        .setDescription(
          `**Record**: **${stats.wins}W - ${stats.draws}D - ${stats.losses}L** (${stats.winRate}% win rate)\n` +
          `**ELO Rating**: ⭐ **${stats.elo}** • **Tracked Matches**: **${stats.totalMatches}**`,
        )
        .addFields(
          {
            name: '⚽ Goal Telemetry',
            value: `Scored: **${stats.goalsFor}**\nConceded: **${stats.goalsAgainst}**\nGoal Diff: **${diffStr}**`,
            inline: true,
          },
          {
            name: '🛡️ Defense & Consistency',
            value: `Clean Sheets: **${stats.cleanSheets}**\nClub ID: \`${stats.clubId}\``,
            inline: true,
          },
          {
            name: '👟 Top Club Performers',
            value: topScorersList,
            inline: false,
          },
        )
        .setFooter({ text: 'RYVL Esports Bot • Continuous Pro Clubs Telemetry' });

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      this.logger.error(`Error in /team_stats: ${err?.message || err}`);
      await interaction.editReply(`❌ Error retrieving team stats: ${err?.message || err}`);
    }
  }

  async handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
      .setTitle('⚙️ EA SPORTS FC 27 Pro Clubs Tracker Configured')
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

    const config = await this.eaService.findTrackerConfigOrDefault(guildId);
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
        .setFooter({ text: 'Data provided by EA SPORTS FC 27 Pro Clubs API' });

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

  async handlePlayerStats(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply('This command can only be run inside a Discord server.');
      return;
    }

    const targetUser = interaction.options.getUser('user');
    const targetName = interaction.options.getString('player')?.trim() || interaction.options.getString('name')?.trim();

    let identifier = targetName || (targetUser ? targetUser.id : interaction.user.id);
    if (identifier.toLowerCase() === 'me') {
      identifier = interaction.user.id;
    }

    try {
      const stats = await this.eaService.getPlayerStats(guildId, identifier);

      if (stats.totalMatches === 0 && !stats.discordUserId) {
        await interaction.editReply(
          `⚠️ No stats found for **${stats.eaPlayerName}**.\n\n` +
          `• If you want to link your account, run: \`/register-player <gamertag>\`\n` +
          `• Or search by exact in-game Pro Clubs name: \`/stats player: <gamertag>\``,
        );
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`👤 ${stats.eaPlayerName} — Pro Clubs Player Stats`)
        .setColor(0x00d26a)
        .setDescription(
          (stats.discordUserId ? `Linked Discord: <@${stats.discordUserId}>\n` : '') +
          `Position: **${stats.preferredPos || 'All-Rounder'}** • Tracked Matches: **${stats.totalMatches}**`,
        )
        .addFields(
          {
            name: '⚽ Attack & Output',
            value:
              `Goals: **${stats.goals}**\n` +
              `Assists: **${stats.assists}**\n` +
              `Shots: **${stats.shots}**` +
              (stats.events?.shotsOnTarget ? ` (${stats.events.shotsOnTarget} on target)` : ''),
            inline: true,
          },
          {
            name: '⭐ Performance & Awards',
            value:
              `Average Rating: **${stats.avgRating}**\n` +
              `Man of the Match: **${stats.momAwards}**\n` +
              `Red Cards: **${stats.redCards}**` +
              (stats.events?.yellowCards ? ` • Yellow: **${stats.events.yellowCards}**` : ''),
            inline: true,
          },
          {
            name: '🎯 Passing & Playmaking',
            value:
              `Pass Accuracy: **${stats.passAccuracy}%** (${stats.passesMade}/${stats.passAttempts})\n` +
              (stats.events
                ? `Short: **${stats.events.passesShortSuccess}** • Long: **${stats.events.passesLongSuccess}**\nThrough Balls: **${stats.events.throughBalls}** • Crosses: **${stats.events.crossesSuccess}**`
                : ''),
            inline: true,
          },
          {
            name: '🛡️ Defending & Dribbling',
            value:
              `Tackles Made: **${stats.tacklesMade}**` +
              (stats.events ? ` (${stats.events.cleanTackles} clean)` : '') +
              `\nClean Sheets: **${stats.cleanSheets}**` +
              (stats.saves > 0 ? ` • Saves: **${stats.saves}**` : '') +
              (stats.events?.dribblesCompleted ? `\nDribbles Completed: **${stats.events.dribblesCompleted}** (${stats.events.dribbleBeat} beat opp)` : ''),
            inline: false,
          },
        )
        .setFooter({ text: 'RYVL Esports Bot • Continuous Pro Clubs Telemetry (EA Event Aggregates)' });

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      this.logger.error(`Error in /stats command: ${err?.message || err}`);
      await interaction.editReply(`❌ Error retrieving player stats: ${err?.message || err}`);
    }
  }

  async handleRegisterPlayer(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply('This command can only be run inside a Discord server.');
      return;
    }

    const gamertag = interaction.options.getString('gamertag', true).trim();
    const position = interaction.options.getString('position')?.trim() || undefined;

    try {
      await this.eaService.registerPlayer(
        guildId,
        interaction.user.id,
        gamertag,
        position,
        interaction.user.id,
      );

      await interaction.editReply(
        `✅ Successfully linked your Discord account to EA Pro Clubs gamertag **${gamertag}**` +
        (position ? ` (Preferred: **${position}**)` : '') +
        `!\n\nYour match statistics are tracked continuously. You and other members can now check your stats anytime with \`/stats me\` or \`/stats user:@${interaction.user.username}\`.`,
      );
    } catch (err: any) {
      this.logger.error(`Error registering player: ${err?.message || err}`);
      await interaction.editReply(`❌ Failed to register player: ${err?.message || err}`);
    }
  }

  async handleUnregisterPlayer(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply('This command can only be run inside a Discord server.');
      return;
    }

    try {
      await this.eaService.unregisterPlayer(guildId, interaction.user.id, interaction.user.id);
      await interaction.editReply('✅ Successfully unlinked your Pro Clubs gamertag.');
    } catch (err: any) {
      this.logger.error(`Error unregistering player: ${err?.message || err}`);
      await interaction.editReply(`❌ Failed to unlink player: ${err?.message || err}`);
    }
  }
}
