import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
} from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../../events/events.service';
import { buildEventEmbed } from '../embeds/event-embed.builder';

export const EVENT_EDIT_MODAL_PREFIX = 'modal:event:edit:';

@Injectable()
export class EventEditCommand {
  private readonly logger = new Logger(EventEditCommand.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async showModal(interaction: ButtonInteraction, eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        occurrences: {
          orderBy: { startsAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!event) {
      await interaction.reply({
        content: 'Event not found.',
        ephemeral: true,
      });
      return;
    }

    const firstOccurrence = event.occurrences[0];
    const startsAt = firstOccurrence ? firstOccurrence.startsAt : new Date();

    const dateStr = startsAt.toISOString().split('T')[0];
    const hours = String(startsAt.getHours()).padStart(2, '0');
    const minutes = String(startsAt.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    const modal = new ModalBuilder()
      .setCustomId(`${EVENT_EDIT_MODAL_PREFIX}${eventId}`)
      .setTitle(`Edit: ${event.title.slice(0, 35)}`);

    const titleInput = new TextInputBuilder()
      .setCustomId('edit_title')
      .setLabel('Title')
      .setStyle(TextInputStyle.Short)
      .setValue(event.title)
      .setRequired(true)
      .setMaxLength(100);

    const dateInput = new TextInputBuilder()
      .setCustomId('edit_date')
      .setLabel('Date (YYYY-MM-DD)')
      .setStyle(TextInputStyle.Short)
      .setValue(dateStr)
      .setRequired(true);

    const timeInput = new TextInputBuilder()
      .setCustomId('edit_time')
      .setLabel('Time (24h format, e.g. 20:00)')
      .setStyle(TextInputStyle.Short)
      .setValue(timeStr)
      .setRequired(true);

    const descInput = new TextInputBuilder()
      .setCustomId('edit_description')
      .setLabel('Description (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(event.description || '')
      .setRequired(false)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(dateInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
    );

    await interaction.showModal(modal);
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction, eventId: string): Promise<void> {
    const title = interaction.fields.getTextInputValue('edit_title').trim();
    const dateStr = interaction.fields.getTextInputValue('edit_date').trim();
    const timeStr = interaction.fields.getTextInputValue('edit_time').trim();
    const description = interaction.fields.getTextInputValue('edit_description').trim();

    const [year, month, day] = dateStr.split('-').map((v) => parseInt(v, 10));
    const [hours, minutes] = timeStr.split(':').map((v) => parseInt(v, 10));

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
      await interaction.reply({
        content: '❌ Invalid date or time format. Please use YYYY-MM-DD and HH:mm.',
        ephemeral: true,
      });
      return;
    }

    const newStartsAt = new Date(year, month - 1, day, hours, minutes);

    try {
      await this.eventsService.updateEvent(eventId, {
        title,
        description: description || undefined,
        startsAt: newStartsAt.toISOString(),
      });

      // Update the Discord message if available
      const occurrence = await this.prisma.eventOccurrence.findFirst({
        where: { eventId },
        orderBy: { startsAt: 'asc' },
        include: {
          event: true,
          rsvps: true,
        },
      });

      if (occurrence && occurrence.channelId && occurrence.messageId) {
        try {
          const channel = await interaction.client.channels.fetch(occurrence.channelId);
          if (channel && 'messages' in channel) {
            const message = await (channel as any).messages.fetch(occurrence.messageId);
            if (message) {
              const { embed, row } = buildEventEmbed({
                event: occurrence.event,
                occurrence,
                rsvps: occurrence.rsvps,
                creatorName: interaction.user.displayName || interaction.user.username,
              });
              await message.edit({
                embeds: [embed],
                components: [row],
              });
            }
          }
        } catch (msgErr) {
          this.logger.warn(`Could not refresh Discord message after edit: ${msgErr}`);
        }
      }

      await interaction.reply({
        content: `✅ Event **${title}** updated successfully!`,
        ephemeral: true,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error updating event: ${msg}`);
      await interaction.reply({
        content: `❌ Failed to update event: ${msg}`,
        ephemeral: true,
      });
    }
  }
}
