import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
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

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event || event.guildId !== guildId) {
      await interaction.reply({
        content: `Event not found or belongs to a different server.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const confirmEmbed = new EmbedBuilder()
      .setTitle('⚠️ Confirm Deletion')
      .setDescription(
        `Are you sure you want to permanently delete event **"${event.title}"**?\nThis will remove all associated occurrences and RSVPs.`,
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

    await interaction.reply({
      embeds: [confirmEmbed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;

    if (customId.startsWith('confirm:delete:')) {
      const eventId = customId.replace('confirm:delete:', '');
      try {
        await this.eventsService.deleteEvent(eventId);
        await interaction.update({
          content: '✅ Event deleted successfully.',
          embeds: [],
          components: [],
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        await interaction.update({
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
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      await interaction.reply({
        content: 'Event not found or already deleted.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const confirmEmbed = new EmbedBuilder()
      .setTitle('⚠️ Confirm Deletion')
      .setDescription(
        `Are you sure you want to permanently delete event **"${event.title}"**?\nThis will remove all associated occurrences and RSVPs.`,
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

    await interaction.reply({
      embeds: [confirmEmbed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }
}
