import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { EventsService } from '../../events/events.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EventDeleteCommand {
  private readonly logger = new Logger(EventDeleteCommand.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Same rule as editing: the creator, or members who can manage events or the server. */
  private mayDelete(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    event: { guildId: string; createdById: string },
  ): boolean {
    return interaction.guildId === event.guildId && (interaction.user.id === event.createdById ||
      Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents)) ||
      Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)));
  }

  private async findEvent(guildId: string | null, eventId: string) {
    if (!guildId) return null;
    return this.prisma.event.findFirst({ where: { id: eventId, guildId } });
  }

  async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.respond([]);
      return;
    }

    const focusedValue = interaction.options.getFocused().toLowerCase();

    try {
      const events = await this.prisma.event.findMany({
        where: {
          guildId,
          title: {
            contains: focusedValue,
            mode: 'insensitive',
          },
        },
        take: 25,
      });

      await interaction.respond(
        events.map((event) => ({
          name: `${event.title.slice(0, 80)} (${event.id.slice(0, 8)})`,
          value: event.id,
        })),
      );
    } catch (error) {
      this.logger.error('Autocomplete query error', error);
      await interaction.respond([]);
    }
  }

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'This command can only be used inside a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const eventId = interaction.options.getString('title', true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const event = await this.findEvent(guildId, eventId);

    if (!event || !this.mayDelete(interaction, event)) {
      await interaction.editReply({
        content: `Event not found or you do not have permission to delete it.`,
      });
      return;
    }

    const confirmEmbed = new EmbedBuilder()
      .setTitle('⚠️ Confirm Deletion')
      .setDescription(
        `Are you sure you want to permanently delete event **"${event.title}"**?\nIts announcements will be marked as cancelled and all occurrences and RSVPs removed.`,
      )
      .setColor(0xed4245);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm:delete:${eventId}`)
        .setLabel('Confirm Delete')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️'),
      new ButtonBuilder()
        .setCustomId(`cancel:delete:${eventId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({
      embeds: [confirmEmbed],
      components: [row],
    });
  }

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;

    if (customId.startsWith('confirm:delete:')) {
      const eventId = customId.replace('confirm:delete:', '');

      // Deleting can involve several database operations, so acknowledge the
      // button immediately before doing the work.
      await interaction.deferUpdate();

      const owned = await this.findEvent(interaction.guildId, eventId);
      if (!owned || !this.mayDelete(interaction, owned)) {
        await interaction.editReply({
          content: '⛔ You can only delete events you created, unless you can manage events.',
          embeds: [],
          components: [],
        });
        return;
      }

      try {
        const event = await this.findEvent(interaction.guildId, eventId);
        if (!event || !this.mayDelete(interaction, event)) {
          throw new Error('Event not found or you do not have permission to delete it.');
        }
        const deleted = await this.eventsService.deleteEvent(event.guildId, eventId);
        await interaction.editReply({
          content: deleted.discordSync.failed
            ? '✅ Event deleted. Some announcements could not be marked as cancelled; check the bot can read message history there.'
            : '✅ Event deleted and its announcements marked as cancelled.',
          embeds: [],
          components: [],
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        await interaction.editReply({
          content: `❌ Failed to delete event: ${msg}`,
          embeds: [],
          components: [],
        });
      }
    } else if (customId.startsWith('cancel:delete:')) {
      await interaction.update({
        content: 'Deletion cancelled.',
        embeds: [],
        components: [],
      });
    }
  }

  async promptDelete(interaction: ButtonInteraction, eventId: string): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const event = await this.findEvent(interaction.guildId, eventId);

    if (!event) {
      await interaction.editReply({
        content: 'Event not found or already deleted.',
      });
      return;
    }

    if (!this.mayDelete(interaction, event)) {
      await interaction.editReply({
        content: '⛔ You can only delete events you created, unless you can manage events.',
      });
      return;
    }

    const confirmEmbed = new EmbedBuilder()
      .setTitle('⚠️ Confirm Deletion')
      .setDescription(
        `Are you sure you want to permanently delete event **"${event.title}"**?\nIts announcements will be marked as cancelled and all occurrences and RSVPs removed.`,
      )
      .setColor(0xed4245);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm:delete:${eventId}`)
        .setLabel('Confirm Delete')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️'),
      new ButtonBuilder()
        .setCustomId(`cancel:delete:${eventId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({
      embeds: [confirmEmbed],
      components: [row],
    });
  }
}
