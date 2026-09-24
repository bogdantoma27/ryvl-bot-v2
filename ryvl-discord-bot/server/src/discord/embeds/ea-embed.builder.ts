import { formatEaMatchType } from '../../ea/ea-match-type';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { ParsedEaMatch, ParsedEaPlayer } from '../../ea/ea.types';

export function formatMatchType(matchType: unknown): string {
  return formatEaMatchType(matchType);
}

export function buildEaMatchEmbed(
  match: ParsedEaMatch,
  webUrl = 'http://localhost:4201/club',
) {
  const matchTypeLabel = formatMatchType(match.matchType);
  const tracked = match.trackedClub;
  const opponent = match.opponentClub;

  let color = 0xfee75c; // Yellow / Draw
  let outcomeHeader = '🤝 DRAW';

  if (match.outcome === 'WIN') {
    color = 0x57f287; // Green
    outcomeHeader = '🏆 VICTORY';
  } else if (match.outcome === 'LOSS') {
    color = 0xed4245; // Red
    outcomeHeader = '💔 DEFEAT';
  }

  const timestampUnix = Math.floor(match.timestamp.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setTitle(`${outcomeHeader} | ${tracked.name} ${tracked.score} - ${opponent.score} ${opponent.name}`)
    .setColor(color)
    .setDescription(`🎮 **${matchTypeLabel}** • Match ended <t:${timestampUnix}:R> (<t:${timestampUnix}:t>)`)
    .setFooter({
      text: 'EA SPORTS FC 27 Pro Clubs Match Tracker • RYVL',
    });

  if (opponent.crestUrl) {
    embed.setThumbnail(opponent.crestUrl);
  }

  // Aggregate Stats Comparison
  const tAgg = tracked.aggregate;
  const oAgg = opponent.aggregate;

  if (tAgg || oAgg) {
    const tPassMade = tAgg?.passesmade ?? 0;
    const tPassAtt = tAgg?.passattempts ?? 0;
    const tPassPct = tPassAtt > 0 ? Math.round((tPassMade / tPassAtt) * 100) : 0;

    const oPassMade = oAgg?.passesmade ?? 0;
    const oPassAtt = oAgg?.passattempts ?? 0;
    const oPassPct = oPassAtt > 0 ? Math.round((oPassMade / oPassAtt) * 100) : 0;

    const tTklMade = tAgg?.tacklesmade ?? 0;
    const tTklAtt = tAgg?.tackleattempts ?? 0;
    const tTklPct = tTklAtt > 0 ? Math.round((tTklMade / tTklAtt) * 100) : 0;

    const oTklMade = oAgg?.tacklesmade ?? 0;
    const oTklAtt = oAgg?.tackleattempts ?? 0;
    const oTklPct = oTklAtt > 0 ? Math.round((oTklMade / oTklAtt) * 100) : 0;

    const statsComparison = [
      `\`Shots:          \` **${tAgg?.shots ?? 0}** vs **${oAgg?.shots ?? 0}**`,
      `\`Pass Accuracy:  \` **${tPassPct}%** (${tPassMade}/${tPassAtt}) vs **${oPassPct}%** (${oPassMade}/${oPassAtt})`,
      `\`Tackle Success: \` **${tTklPct}%** (${tTklMade}/${tTklAtt}) vs **${oTklPct}%** (${oTklMade}/${oTklAtt})`,
      `\`Saves:          \` **${tAgg?.saves ?? 0}** vs **${oAgg?.saves ?? 0}**`,
      `\`Red Cards:      \` **${tAgg?.redcards ?? 0}** vs **${oAgg?.redcards ?? 0}**`,
    ].join('\n');

    embed.addFields({
      name: `📊 Team Statistics (${tracked.name} vs ${opponent.name})`,
      value: statsComparison,
      inline: false,
    });
  }

  // Key Performers
  const allPlayers = [...match.trackedPlayers, ...match.opponentPlayers];
  const momPlayer = allPlayers.find((p) => p.isMom);
  const goalScorers = match.trackedPlayers.filter((p) => p.goals > 0);
  const assistMakers = match.trackedPlayers.filter((p) => p.assists > 0);

  const highlights: string[] = [];
  if (momPlayer) {
    highlights.push(`⭐ **Man of the Match**: **${momPlayer.gamertag}** (${momPlayer.rating.toFixed(1)})`);
  }
  if (goalScorers.length > 0) {
    const goalsList = goalScorers
      .map((p) => `${p.gamertag}${p.goals > 1 ? ` (${p.goals})` : ''}`)
      .join(', ');
    highlights.push(`⚽ **Goals**: ${goalsList}`);
  }
  if (assistMakers.length > 0) {
    const assistsList = assistMakers
      .map((p) => `${p.gamertag}${p.assists > 1 ? ` (${p.assists})` : ''}`)
      .join(', ');
    highlights.push(`🅰️ **Assists**: ${assistsList}`);
  }

  if (highlights.length > 0) {
    embed.addFields({
      name: '🌟 Key Highlights',
      value: highlights.join('\n'),
      inline: false,
    });
  }

  // Squad Scorecard
  if (match.trackedPlayers.length > 0) {
    const playerRows = match.trackedPlayers.map((p: ParsedEaPlayer) => {
      const pos = (p.position || 'ply').toUpperCase().slice(0, 3);
      const star = p.isMom ? '⭐ ' : '';
      const goalIcon = p.goals > 0 ? ' ⚽'.repeat(p.goals) : '';
      const assistIcon = p.assists > 0 ? ' 🅰️'.repeat(p.assists) : '';

      return `\`${pos}\` ${star}**${p.gamertag}** — **${p.rating.toFixed(1)}**${goalIcon}${assistIcon} \`(${p.passesMade}/${p.passAttempts} pass, ${p.tacklesMade} tkl)\``;
    });

    embed.addFields({
      name: `👥 ${tracked.name} Player Ratings`,
      value: playerRows.slice(0, 15).join('\n'),
      inline: false,
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('View Club on Web')
      .setStyle(ButtonStyle.Link)
      .setURL(webUrl),
  );

  return { embed, row };
}
