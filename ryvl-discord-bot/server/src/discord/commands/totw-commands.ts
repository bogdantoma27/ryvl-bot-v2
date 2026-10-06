import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
  AttachmentBuilder,
} from 'discord.js';
import { TotwService } from '../../vpg/totw.service';
import { SUPERLIGA_LEAGUE_SLUG } from '../../vpg/league.constants';

@Injectable()
export class TotwCommands {
  private readonly logger = new Logger(TotwCommands.name);

  constructor(
    @Inject(forwardRef(() => TotwService))
    private readonly totwService: TotwService,
  ) {}

  async handleTotw(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'This command can only be run inside a Discord server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'post') {
      // The image goes to the TOTW channel; the confirmation is only for the admin.
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const channel = interaction.options.getChannel('channel');
      const leagueSlug = interaction.options.getString('league')?.trim() || SUPERLIGA_LEAGUE_SLUG;
      const isTots = interaction.options.getBoolean('is_tots') || false;

      try {
        const result = await this.totwService.postTotwToDiscord(
          guildId,
          channel?.id,
          isTots,
          leagueSlug,
        );
        await interaction.editReply(
          `✅ **${isTots ? 'Team of the Season' : 'Team of the Week'}** successfully posted to <#${result.channelId}>!`,
        );
      } catch (err: any) {
        this.logger.error(`Error in /totw post: ${err?.message || err}`);
        await interaction.editReply(`❌ Failed to post TOTW: ${err?.message || err}`);
      }
    } else if (subcommand === 'preview') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const leagueSlug = interaction.options.getString('league')?.trim() || SUPERLIGA_LEAGUE_SLUG;
      const isTots = interaction.options.getBoolean('is_tots') || false;

      try {
        const totwData = await this.totwService.generateTotw(leagueSlug, isTots);
        const attachment = new AttachmentBuilder(totwData.imageBuffer, { name: 'totw-preview.png' });
        const embed = new EmbedBuilder()
          .setTitle(`Preview: ${isTots ? 'Team of the Season' : 'Team of the Week'}`)
          .setColor(0x00e5ff)
          .setDescription(`League: **${totwData.leagueName}** (Season ${totwData.season}${totwData.week ? `, Week ${totwData.week}` : ''})`)
          .setImage('attachment://totw-preview.png');

        await interaction.editReply({ embeds: [embed], files: [attachment] });
      } catch (err: any) {
        this.logger.error(`Error in /totw preview: ${err?.message || err}`);
        await interaction.editReply(`❌ Failed to generate TOTW preview: ${err?.message || err}`);
      }
    } else if (subcommand === 'setup') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const channel = interaction.options.getChannel('channel', true);
      const leagueSlug = interaction.options.getString('league')?.trim() || SUPERLIGA_LEAGUE_SLUG;

      if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        await interaction.editReply('Please select a valid text channel for announcements.');
        return;
      }

      try {
        // Setting a channel is the admin's intent to publish there: enable the weekly post.
        await this.totwService.updateConfig(guildId, leagueSlug, { channelId: channel.id, enabled: true });
        await interaction.editReply(`✅ Configured **<#${channel.id}>** as the announcement channel for **${leagueSlug}** Team of the Week!`);
      } catch (err: any) {
        await interaction.editReply(`❌ Failed to update TOTW config: ${err?.message || err}`);
      }
    }
  }
}
