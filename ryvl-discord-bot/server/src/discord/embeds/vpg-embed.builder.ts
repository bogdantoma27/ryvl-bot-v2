import { EmbedBuilder } from 'discord.js';
import { VpgTransferItem } from '../../vpg/vpg.types';

export function buildVpgTransferEmbed(t: VpgTransferItem): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x1f8b4c)
    .setTitle('⚽ HERE WE GO')
    .addFields(
      { name: '👤 Player', value: t.username || 'Unknown Player', inline: false },
      { name: '🏟️ From', value: t.fromName || 'Free Agent', inline: true },
      { name: '➡️ To', value: t.toName || 'Free Agent', inline: true },
      { name: '💰 Fee', value: t.amountFormatted || 'Free Transfer', inline: false },
      { name: '📅 Date', value: t.dateFormattedRo, inline: false },
    );

  if (t.fromLogoUrl) {
    embed.setAuthor({
      name: t.fromName || 'Free Agent',
      iconURL: t.fromLogoUrl,
    });
  }

  if (t.toLogoUrl) {
    embed.setThumbnail(t.toLogoUrl);
  } else if (t.fromLogoUrl) {
    embed.setThumbnail(t.fromLogoUrl);
  }

  if (t.superligaClubs && t.superligaClubs.length > 0) {
    embed.addFields({
      name: '🏆 Superliga clubs',
      value: t.superligaClubs.join(' → '),
      inline: false,
    });
  }

  embed.setFooter({ text: 'VPG Superliga România • powered by RYVL' });

  return embed;
}
