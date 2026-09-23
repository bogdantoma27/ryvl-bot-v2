import { EmbedBuilder } from 'discord.js';
import {
  VpgStandingsRow,
  VpgMatchItem,
  VpgLeaderboardEntry,
} from '../../vpg/vpg.types';

const RYVL_YELLOW = 0xeae905;
const WIN_GREEN = 0x2ecc71;
const LOSE_RED = 0xe74c3c;
const DRAW_GRAY = 0x95a5a6;

export function buildSuperligaStandingsEmbed(
  rows: VpgStandingsRow[],
  season: number,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(RYVL_YELLOW)
    .setTitle(`🏆 VPG Superliga România — Clasament (Sezon ${season})`)
    .setDescription(
      'Actualizat conform datelor oficiale Virtual Pro Gaming România.',
    )
    .setTimestamp();

  if (!rows || rows.length === 0) {
    embed.addFields({
      name: 'Clasament',
      value: 'Nu există date disponibile pentru acest sezon.',
    });
    return embed;
  }

  // Format a neat monospace table for top 16 teams
  const header = 'Pos  Echipă              M   V   E   Î   GD   Pct\n' +
                 '─────────────────────────────────────────────';

  const lines = rows.slice(0, 16).map((r) => {
    const pos = String(r.position).padStart(2, ' ');
    let name = r.teamName;
    if (name.length > 17) name = name.substring(0, 16) + '…';
    const paddedName = name.padEnd(18, ' ');
    const p = String(r.played).padStart(2, ' ');
    const w = String(r.wins).padStart(2, ' ');
    const d = String(r.draws).padStart(2, ' ');
    const l = String(r.losses).padStart(2, ' ');
    const gd = (r.goalDifference >= 0 ? `+${r.goalDifference}` : `${r.goalDifference}`).padStart(4, ' ');
    const pts = String(r.points).padStart(3, ' ');

    const isRyvl = /^\s*ryvl(?:\s+esports)?\s*$/i.test(r.teamName);
    const prefix = isRyvl ? '►' : ' ';
    return `${prefix}${pos} ${paddedName} ${p}  ${w}  ${d}  ${l} ${gd}  ${pts}`;
  });

  embed.setDescription(
    `\`\`\`text\n${header}\n${lines.join('\n')}\n\`\`\`\n` +
    `*Echipele marcate cu ► reprezintă RYVL Esports.*`,
  );

  embed.setFooter({
    text: `VPG Superliga România • Sezonul ${season} • powered by RYVL`,
  });

  return embed;
}

export function buildSuperligaFixturesEmbed(
  matches: VpgMatchItem[],
  season: number,
  limit = 10,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(RYVL_YELLOW)
    .setTitle(`📅 VPG Superliga România — Program Meciuri (Sezon ${season})`)
    .setDescription(
      'Meciuri programate în Superliga României (ore afișate în fusul orar al României).',
    )
    .setTimestamp()
    .setFooter({
      text: `VPG Superliga România • Sezonul ${season} • powered by RYVL`,
    });

  if (!matches || matches.length === 0) {
    embed.addFields({
      name: 'Program',
      value: 'Nu sunt meciuri programate în acest moment.',
    });
    return embed;
  }

  const items = matches.slice(0, limit);
  const text = items
    .map((m) => {
      const isRyvl = /^\s*ryvl(?:\s+esports)?\s*$/i.test(m.homeName) || /^\s*ryvl(?:\s+esports)?\s*$/i.test(m.awayName);
      const star = isRyvl ? ' ⭐' : '';
      return `⚽ **Etapa ${m.matchDay || '?'}** • ${m.dateFormattedRo}\n` +
             `> **${m.homeName}** 🆚 **${m.awayName}**${star}`;
    })
    .join('\n\n');

  embed.setDescription(text);
  return embed;
}

export function buildSuperligaResultsEmbed(
  matches: VpgMatchItem[],
  season: number,
  limit = 10,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`🏁 VPG Superliga România — Ultimele Rezultate (Sezon ${season})`)
    .setDescription(
      'Ultimele meciuri finalizate oficiale din Superliga României.',
    )
    .setTimestamp()
    .setFooter({
      text: `VPG Superliga România • Sezonul ${season} • powered by RYVL`,
    });

  if (!matches || matches.length === 0) {
    embed.addFields({
      name: 'Rezultate',
      value: 'Nu s-au găsit meciuri finalizate recente.',
    });
    return embed;
  }

  const items = matches.slice(0, limit);
  const text = items
    .map((m) => {
      const hs = m.homeScore != null ? m.homeScore : '-';
      const as = m.awayScore != null ? m.awayScore : '-';
      const isRyvl = /^\s*ryvl(?:\s+esports)?\s*$/i.test(m.homeName) || /^\s*ryvl(?:\s+esports)?\s*$/i.test(m.awayName);
      const star = isRyvl ? ' ⭐' : '';
      return `📌 **Etapa ${m.matchDay || '?'}** • ${m.dateFormattedRo}\n` +
             `> **${m.homeName}** \`${hs} — ${as}\` **${m.awayName}**${star}`;
    })
    .join('\n\n');

  embed.setDescription(text);
  return embed;
}

export function buildSuperligaLeaderboardEmbed(
  entries: VpgLeaderboardEntry[],
  category: string,
  season: number,
): EmbedBuilder {
  const categoryNames: Record<string, string> = {
    strikers: 'Golgheteri (Top Strikers)',
    cam: 'Creatori de Joc (Top CAM)',
    wingers: 'Extreme (Top Wingers)',
    cdm: 'Mijlocași Defensivi (Top CDM)',
    cb: 'Fundași Centrali (Top CB)',
    gk: 'Portari (Top Portari)',
  };

  const catName = categoryNames[category] || category.toUpperCase();

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`⭐ VPG Superliga România — ${catName} (Sezon ${season})`)
    .setDescription(
      `Top 10 jucători în clasamentul individual VPG România.`,
    )
    .setTimestamp()
    .setFooter({
      text: `VPG Superliga România • Sezonul ${season} • powered by RYVL`,
    });

  if (!entries || entries.length === 0) {
    embed.addFields({
      name: 'Clasament Individual',
      value: 'Nu există date înregistrate pentru această categorie.',
    });
    return embed;
  }

  const items = entries.slice(0, 10);
  const text = items
    .map((e) => {
      const rank = e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : `\`#${e.rank}\``;
      const stats =
        category === 'gk' || category === 'cb'
          ? `CS: **${e.cleanSheets ?? 0}** | Note: **${e.rating ?? '-'}** | M: ${e.matchesPlayed}`
          : `Goluri: **${e.goals}** | Pase: **${e.assists}** | M: ${e.matchesPlayed}`;
      return `${rank} **${e.username}** (${e.teamName})\n> ${stats}`;
    })
    .join('\n\n');

  embed.setDescription(text);
  return embed;
}

export function buildSuperligaLiveResultCardEmbed(match: VpgMatchItem): EmbedBuilder {
  const hs = match.homeScore != null ? match.homeScore : 0;
  const as = match.awayScore != null ? match.awayScore : 0;

  const isHomeRyvl = /^\s*ryvl(?:\s+esports)?\s*$/i.test(match.homeName);
  const isAwayRyvl = /^\s*ryvl(?:\s+esports)?\s*$/i.test(match.awayName);
  let color = RYVL_YELLOW;

  if (isHomeRyvl) {
    if (hs > as) color = WIN_GREEN;
    else if (hs < as) color = LOSE_RED;
    else color = DRAW_GRAY;
  } else if (isAwayRyvl) {
    if (as > hs) color = WIN_GREEN;
    else if (as < hs) color = LOSE_RED;
    else color = DRAW_GRAY;
  } else {
    if (hs > as) color = WIN_GREEN;
    else if (as > hs) color = 0x3498db;
    else color = DRAW_GRAY;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`⚽ REZULTAT FINAL: ${match.homeName} ${hs} — ${as} ${match.awayName}`)
    .setURL(`https://virtualprogaming.com/match/${match.id}`)
    .setDescription(
      `🏆 **VPG Superliga România** • Etapa **${match.matchDay || '?'}**\n` +
      `📅 **Data:** ${match.dateFormattedRo}\n` +
      `🟢 **Status:** Meci Încheiat (Confirmat)`,
    )
    .addFields(
      {
        name: `🏠 Gazde`,
        value: `**${match.homeName}**\nScor: **${hs}**`,
        inline: true,
      },
      {
        name: `✈️ Oaspeți`,
        value: `**${match.awayName}**\nScor: **${as}**`,
        inline: true,
      },
    )
    .setTimestamp(new Date(match.datetime))
    .setFooter({
      text: `VPG Superliga România • ID Meci: ${match.id} • powered by RYVL`,
    });

  if (match.homeLogoUrl) {
    embed.setThumbnail(match.homeLogoUrl);
  }

  return embed;
}
