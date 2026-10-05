import { Injectable, Logger } from '@nestjs/common';
import { ChannelType, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { SuperligaMvpService } from '../../superliga-mvp/superliga-mvp.service';
import { buildSuperligaMvpEmbed } from '../embeds/superliga-mvp-embed.builder';

@Injectable()
export class SuperligaMvpCommands {
  private readonly logger = new Logger(SuperligaMvpCommands.name);

  constructor(private readonly mvp: SuperligaMvpService) {}

  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    // Admin-only whatever the server's command permission overrides say.
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: '❌ Superliga MVP is available to server admins only (Manage Server).', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });
    try {
      if (sub === 'sync') {
        const r = await this.mvp.sync();
        await interaction.editReply(
          `✅ Superliga MVP sync (season ${r.season}): ${r.newMatches} new result(s), ${r.linked} linked to EA, ` +
            `${r.stillPending} still waiting, ${r.expired} given up. ${r.teamsLinkedToEa}/${r.teamsTotal} teams have linked their FC club on VPG.` +
            (r.errors.length ? `\n⚠️ ${r.errors.slice(0, 5).join('\n')}` : ''),
        );
        return;
      }

      const board = await this.mvp.getLeaderboard({
        season: interaction.options.getInteger('season'),
        minMatches: interaction.options.getInteger('min_matches'),
      });
      const count = interaction.options.getInteger('count') || 15;
      const embed = buildSuperligaMvpEmbed(board, count);

      if (sub === 'leaderboard') {
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (sub === 'post') {
        const picked = interaction.options.getChannel('channel');
        const channel = picked
          ? await interaction.guild?.channels.fetch(picked.id).catch(() => null)
          : interaction.channel;
        if (!channel || !('send' in channel) || (picked && picked.type !== ChannelType.GuildText && picked.type !== ChannelType.GuildAnnouncement)) {
          await interaction.editReply('❌ Pick a text or announcement channel in this server.');
          return;
        }
        await channel.send({ embeds: [embed] });
        await interaction.editReply(`✅ Superliga MVP leaderboard posted in <#${channel.id}>.`);
      }
    } catch (err: any) {
      this.logger.error(`/superliga_mvp ${sub} failed: ${err.message}`);
      await interaction.editReply(`❌ Superliga MVP error: ${err.message}`);
    }
  }
}
