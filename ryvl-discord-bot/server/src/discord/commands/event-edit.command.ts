import {
  ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ModalSubmitInteraction, MessageFlags, PermissionFlagsBits,
} from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../../events/events.service';
import { DEFAULT_EVENT_TIMEZONE, formatEventDateTime, parseEventDateTime } from '../../events/event-time';

export const EVENT_EDIT_MODAL_PREFIX = 'modal:event:edit:';

@Injectable()
export class EventEditCommand {
  private readonly logger = new Logger(EventEditCommand.name);
  constructor(private readonly prisma: PrismaService, private readonly eventsService: EventsService) {}

  private mayEdit(interaction: ButtonInteraction | ModalSubmitInteraction, event: { guildId: string; createdById: string }): boolean {
    return interaction.guildId === event.guildId && (interaction.user.id === event.createdById ||
      Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents)) ||
      Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)));
  }

  async showModal(interaction: ButtonInteraction, eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, include: { occurrences: { orderBy: { startsAt: 'asc' } } } });
    if (!event || !this.mayEdit(interaction, event)) {
      await interaction.reply({ content: 'Event not found or you do not have permission to edit it.', flags: MessageFlags.Ephemeral });
      return;
    }
    // Select the announcement that was clicked, not the first historical date.
    const occurrence = event.occurrences.find(item => item.messageId === interaction.message.id && item.channelId === interaction.channelId);
    if (!occurrence || occurrence.status === 'CANCELLED') {
      await interaction.reply({ content: 'This announcement no longer has an editable occurrence. Open the event in the admin panel.', flags: MessageFlags.Ephemeral });
      return;
    }
    const zone = event.timezone || DEFAULT_EVENT_TIMEZONE;
    const local = formatEventDateTime(occurrence.startsAt, zone);
    const modal = new ModalBuilder().setCustomId(`${EVENT_EDIT_MODAL_PREFIX}${eventId}:${occurrence.id}`).setTitle(`Edit: ${event.title.slice(0, 35)}`);
    const field = (id: string, label: string, value: string, required = true): TextInputBuilder => {
      const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(id === 'edit_description' ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(required);
      if (value) input.setValue(value);
      return input;
    };
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(field('edit_title', 'Title', event.title).setMaxLength(100)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(field('edit_date', 'Date (YYYY-MM-DD, today or tomorrow)', local.date)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(field('edit_time', `Time (${zone}, 24h)`.slice(0, 45), local.time)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(field('edit_description', 'Description (optional)', event.description || '', false).setMaxLength(1000)),
    );
    await interaction.showModal(modal);
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction, eventId: string, occurrenceId?: string): Promise<void> {
    const receivedAt = new Date();
    // Acknowledge before database writes or Discord message requests can time out.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const event = await this.prisma.event.findUnique({ where: { id: eventId }, include: { occurrences: { orderBy: { startsAt: 'asc' } } } });
      if (!event || !this.mayEdit(interaction, event)) throw new Error('Event not found or you do not have permission to edit it.');
      // Also accept a modal opened before this deployment, using its original message.
      const target = occurrenceId ? event.occurrences.find(item => item.id === occurrenceId) : event.occurrences.find(item => item.messageId === interaction.message?.id);
      if (!target || target.status === 'CANCELLED') throw new Error('This event occurrence can no longer be edited.');
      const title = interaction.fields.getTextInputValue('edit_title').trim();
      const description = interaction.fields.getTextInputValue('edit_description').trim();
      const zone = event.timezone || DEFAULT_EVENT_TIMEZONE;
      const startsAt = parseEventDateTime(interaction.fields.getTextInputValue('edit_date'), interaction.fields.getTextInputValue('edit_time'), zone, receivedAt);
      if (!startsAt) throw new Error(`Invalid date or time. Use YYYY-MM-DD (or today/tomorrow) and HH:mm in ${zone}.`);
      const updated = await this.eventsService.updateEvent(eventId, { title, description, startsAt: startsAt.toISOString() }, target.id);
      if (updated.discordSync?.failed) {
        await interaction.editReply({ content: '⚠️ The event was saved, but Discord could not refresh every announcement. Check the bot’s View Channel and Read Message History permissions, then retry the edit.' });
      } else {
        const local = formatEventDateTime(startsAt, zone);
        await interaction.editReply({ content: `✅ Event **${title}** updated: ${local.date} at ${local.time} (${zone}).` });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error updating event: ${message}`);
      await interaction.editReply({ content: `❌ Failed to update event: ${message}` });
    }
  }
}
