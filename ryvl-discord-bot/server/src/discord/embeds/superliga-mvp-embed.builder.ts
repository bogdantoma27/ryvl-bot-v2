import { EmbedBuilder } from 'discord.js';
import type { MvpLeaderboardResponse } from '../../superliga-mvp/superliga-mvp.service';

const MVP_GOLD = 0xf5b301;
const MEDALS = ['🥇', '🥈', '🥉'];

export function buildSuperligaMvpEmbed(board: MvpLeaderboardResponse, count = 15): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(MVP_GOLD)
    .setTitle(`🏅 Superliga MVP — Season ${board.season}`)
    .setTimestamp()
    .setFooter({
      text: `${board.matches.linked} Superliga matches tracked • min ${board.minMatches} match${board.minMatches === 1 ? '' : 'es'} to qualify • powered by RYVL`,
    });

  const top = board.entries.slice(0, Math.max(1, Math.min(count, 25)));
  if (!top.length) {
    embed.setDescription(
      board.matches.linked
        ? 'No player has enough tracked matches to qualify yet.'
        : 'No Superliga matches have been tracked yet. Stats appear once matches are played and linked to EA.',
    );
    return embed;
  }

  const lines = top.map((e) => {
    const badge = MEDALS[e.rank - 1] ?? `\`${String(e.rank).padStart(2, ' ')}.\``;
    const t = e.totals;
    const avg = t.matches ? (t.ratingSum / t.matches).toFixed(1) : '0.0';
    const line = e.role === 'GK'
      ? `${t.saves} saves · ${t.cleanSheets} CS`
      : `${t.goals}G ${t.assists}A`;
    return `${badge} **${e.playerName}** · ${e.teamName}${e.role === 'GK' ? ' · GK' : ''}\n` +
      `   Score **${e.score.toFixed(1)}** · ${e.matches} MP · ${avg} avg · ${line}` +
      (e.totwCount ? ` · ⭐ ${e.totwCount} TOTW` : '');
  });

  let description = lines.join('\n');
  if (description.length > 4000) description = description.slice(0, 3990) + '…';
  embed.setDescription(description);
  return embed;
}
