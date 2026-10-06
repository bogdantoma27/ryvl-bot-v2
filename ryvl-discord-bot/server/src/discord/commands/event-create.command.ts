import { DEFAULT_EVENT_TIMEZONE, parseEventDateTime, formatEventDateTime } from '../../events/event-time';
import {
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  MessageFlags,
} from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { EventsService } from '../../events/events.service';
import { PrismaService } from '../../prisma/prisma.service';

export const EVENT_CREATE_MODAL_ID = 'modal:event:create';

@Injectable()
export class EventCreateCommand {
  private readonly logger = new Logger(EventCreateCommand.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly prisma: PrismaService,
  ) {}

  async showModal(interaction: ChatInputCommandInteraction): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId(EVENT_CREATE_MODAL_ID)
      .setTitle('Create New Event');

    const titleInput = new TextInputBuilder()
      .setCustomId('event_title')
      .setLabel('Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Event title')
      .setRequired(true)
      .setMaxLength(100);

    const dateInput = new TextInputBuilder()
      .setCustomId('event_date')
      .setLabel('Date')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('today, tomorrow, next friday or 2026-10-15')
      .setRequired(true);

    const timeInput = new TextInputBuilder()
      .setCustomId('event_time')
      .setLabel('Time (24h format)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('19:00')
      .setRequired(true);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('event_description')
      .setLabel('Description (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe what this event is about...')
      .setRequired(false)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(dateInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
    );

    await interaction.showModal(modal);
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'This command can only be used inside a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const title = interaction.fields.getTextInputValue('event_title').trim();
    const dateStr = interaction.fields.getTextInputValue('event_date').trim();
    const timeStr = interaction.fields.getTextInputValue('event_time').trim();
    const description = interaction.fields.getTextInputValue('event_description')?.trim();

    const receivedAt = new Date();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const guild = await this.prisma.guild.findUnique({ where: { id: guildId }, select: { timezone: true } });
      const timezone = guild?.timezone || DEFAULT_EVENT_TIMEZONE;
      const parsedDate = parseEventDateTime(dateStr, timeStr, timezone, receivedAt);
      if (!parsedDate) {
        await interaction.editReply({ content: `Invalid date or time. Use YYYY-MM-DD (or today/tomorrow) and HH:mm in ${timezone}.` });
        return;
      }
      const channelId = interaction.channelId;
      if (!channelId) {
        throw new Error('No channel found for interaction');
      }

      // The event publisher posts the announcement (immediately for a new event), so
      // this command never sends its own copy that could race the scheduler.
      await this.eventsService.createEvent(
        guildId,
        interaction.user.id,
        {
          title,
          description: description || undefined,
          channelId,
          startsAt: parsedDate.toISOString(),
          timezone,
          duration: 60,
        },
      );

      await interaction.editReply({
        content: `✅ Event **${title}** created: ${formatEventDateTime(parsedDate, timezone).date} at ${formatEventDateTime(parsedDate, timezone).time} (${timezone}). The announcement will appear in this channel shortly.`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating event via Discord: ${msg}`);
      await interaction.editReply({
        content: `❌ Failed to create event: ${msg}`,
      });
    }
  }

}
