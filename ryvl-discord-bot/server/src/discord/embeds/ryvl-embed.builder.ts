import { EmbedBuilder } from 'discord.js';
import {
  RyvlPerformanceResponse,
  VpgMatchItem,
  ContactFormPayload,
  RecruitmentFormPayload,
} from '../../vpg/vpg.types';

export class RyvlEmbedBuilder {
  private static readonly BRAND_YELLOW = 0xeae905;
  private static readonly BRAND_DARK = 0x111116;
  private static readonly WIN_GREEN = 0x22c55e;
  private static readonly LOSS_RED = 0xef4444;
  private static readonly DRAW_GRAY = 0x94a3b8;

  static buildPerformanceOverviewEmbed(data: RyvlPerformanceResponse): EmbedBuilder {
    const { stats, teamName } = data;
    const streakStr =
      stats.currentStreak.length > 0
        ? stats.currentStreak
            .map((s) => (s === 'W' ? '🟢 W' : s === 'L' ? '🔴 L' : '⚪ D'))
            .join(' ')
        : 'N/A';

    const embed = new EmbedBuilder()
      .setColor(this.BRAND_YELLOW)
      .setTitle(`⚡ ${teamName.toUpperCase()} — TEAM PERFORMANCE`)
      .setDescription(
        `Official competitive records and campaign statistics across **${stats.competitionName}**.\n*"We challenge ourselves first. Then we rival the best."*`,
      )
      .addFields(
        {
          name: '🏆 Overall Record',
          value: `**${stats.played}** Played | **${stats.wins}** Wins | **${stats.draws}** Draws | **${stats.losses}** Losses\nPoints: **${stats.points}** PTS | Win Rate: **${stats.winRate}%**`,
          inline: false,
        },
        {
          name: '🔥 Current Form',
          value: streakStr,
          inline: true,
        },
        {
          name: '🛡️ Clean Sheets',
          value: `**${stats.cleanSheets}** matches`,
          inline: true,
        },
        {
          name: '⚽ Goal Metrics',
          value: `Scored: **${stats.goalsFor}** (${stats.goalsPerMatch}/game)\nConceded: **${stats.goalsAgainst}** (${stats.concededPerMatch}/game)\nDifference: **${stats.goalDifference > 0 ? '+' : ''}${stats.goalDifference}**`,
          inline: true,
        },
        {
          name: '🏠 Home vs Away',
          value: `Home: ${stats.homeRecord.wins}W - ${stats.homeRecord.draws}D - ${stats.homeRecord.losses}L (${stats.homeRecord.goalsFor}:${stats.homeRecord.goalsAgainst})\nAway: ${stats.awayRecord.wins}W - ${stats.awayRecord.draws}D - ${stats.awayRecord.losses}L (${stats.awayRecord.goalsFor}:${stats.awayRecord.goalsAgainst})`,
          inline: false,
        },
      )
      .setFooter({
        text: `RYVL Esports • Competition: ${stats.competitionName}`,
      })
      .setTimestamp();

    if (stats.standingsPosition) {
      embed.addFields({
        name: '📊 League Standing',
        value: `Position: **#${stats.standingsPosition}** / ${stats.totalTeams || 16}`,
        inline: true,
      });
    }

    return embed;
  }

  static buildRyvlResultsEmbed(results: VpgMatchItem[], compName: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(this.BRAND_YELLOW)
      .setTitle(`⚡ RYVL ESPORTS — MATCH RESULTS`)
      .setDescription(`Recent match outcomes in **${compName}**.`);

    if (!results || results.length === 0) {
      embed.setDescription(`No completed matches found for RYVL Esports in ${compName}.`);
      return embed;
    }

    const lines = results.slice(0, 10).map((m) => {
      const isHome = /ryvl|rival/i.test(m.homeName);
      const ryvlScore = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
      const oppScore = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);
      const oppName = isHome ? m.awayName : m.homeName;
      const outcome = ryvlScore > oppScore ? '🟢 WIN' : ryvlScore < oppScore ? '🔴 LOSS' : '⚪ DRAW';

      const dateStr = m.dateFormattedEn || m.dateFormattedRo;
      return `${outcome} **${ryvlScore} : ${oppScore}** vs ${oppName} • MD ${m.matchDay} (${dateStr})`;
    });

    embed.addFields({
      name: 'Recent Clashes',
      value: lines.join('\n') || 'None recorded',
    });

    embed.setFooter({ text: 'RYVL Esports Official Feed' }).setTimestamp();
    return embed;
  }

  static buildRyvlFixturesEmbed(fixtures: VpgMatchItem[], compName: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(this.BRAND_YELLOW)
      .setTitle(`📅 RYVL ESPORTS — UPCOMING FIXTURES`)
      .setDescription(`Scheduled upcoming matches in **${compName}**.`);

    if (!fixtures || fixtures.length === 0) {
      embed.setDescription(`No upcoming scheduled matches for RYVL Esports in ${compName}.`);
      return embed;
    }

    const lines = fixtures.slice(0, 8).map((m) => {
      const isHome = /ryvl|rival/i.test(m.homeName);
      const oppName = isHome ? m.awayName : m.homeName;
      const venue = isHome ? '🏠 Home' : '✈️ Away';
      const dateStr = m.dateFormattedEn || m.dateFormattedRo;
      return `• **MD ${m.matchDay}** vs **${oppName}** (${venue})\n  ⏰ ${dateStr}`;
    });

    embed.addFields({
      name: 'Scheduled Games',
      value: lines.join('\n\n') || 'No scheduled games.',
    });

    embed.setFooter({ text: 'RYVL Esports • Bucharest Time' }).setTimestamp();
    return embed;
  }

  static buildContactSubmissionEmbed(contact: ContactFormPayload): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(this.BRAND_YELLOW)
      .setTitle('📬 NEW WEBSITE CONTACT TRANSMISSION')
      .setDescription(`A visitor submitted a transmission via the official RYVL Esports website.`)
      .addFields(
        { name: '👤 Sender Name', value: contact.name, inline: true },
        { name: '📫 Contact Info', value: contact.contact, inline: true },
        { name: '🏷️ Topic', value: contact.topic, inline: true },
        { name: '📝 Message Content', value: contact.message, inline: false },
      )
      .setFooter({ text: 'RYVL Management Inquiries' })
      .setTimestamp();
  }

  static buildRecruitmentSubmissionEmbed(rec: RecruitmentFormPayload): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(this.BRAND_YELLOW)
      .setTitle('⚡ NEW RYVL TRIAL APPLICATION')
      .setDescription(`A player submitted an application to join the competitive RYVL squad.`)
      .addFields(
        { name: '🎮 Gamertag', value: rec.gamertag, inline: true },
        { name: '💬 Discord Tag', value: rec.discordTag, inline: true },
        { name: '🕹️ Platform', value: rec.platform, inline: true },
        { name: '⚽ Primary Position', value: rec.primaryPosition, inline: true },
        { name: '🔄 Secondary Position', value: rec.secondaryPosition || 'None', inline: true },
        { name: '🎂 Age', value: String(rec.age), inline: true },
        { name: '📜 Prior Experience', value: rec.experience || 'Not specified', inline: false },
      )
      .setFooter({ text: 'RYVL Esports Recruitment Desk' })
      .setTimestamp();
  }
}
