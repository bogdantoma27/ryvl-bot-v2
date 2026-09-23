import {
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  TextBasedChannel,
  MessageFlags,
} from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { OccurrenceStatus } from '@prisma/client';
import { EventsService } from '../../events/events.service';
import { PrismaService } from '../../prisma/prisma.service';
import { buildEventEmbed } from '../embeds/event-embed.builder';

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
      .setPlaceholder('2026-10-15 or next friday')
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

    const parsedDate = this.parseDateTime(dateStr, timeStr);
    if (!parsedDate) {
      await interaction.reply({
        content: `Could not parse date "${dateStr}" and time "${timeStr}". Please use format YYYY-MM-DD and HH:mm (e.g., 2026-10-15 at 19:00).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const channelId = interaction.channelId;
      if (!channelId) {
        throw new Error('No channel found for interaction');
      }

      const eventWithOccurrences = await this.eventsService.createEvent(
        guildId,
        interaction.user.id,
        {
          title,
          description: description || undefined,
          channelId,
          startsAt: parsedDate.toISOString(),
          duration: 60,
        },
      );

      const firstOccurrence = eventWithOccurrences.occurrences[0];

      if (firstOccurrence && interaction.channel && 'send' in interaction.channel) {
        const textChannel = interaction.channel as TextBasedChannel;
        const { embed, row } = buildEventEmbed({
          event: eventWithOccurrences,
          occurrence: firstOccurrence,
          rsvps: [],
          creatorName: interaction.user.displayName || interaction.user.username,
        });

        if ('send' in textChannel) {
          const sentMessage = await (textChannel as { send: (options: unknown) => Promise<{ id: string }> }).send({
            embeds: [embed],
            components: [row],
          });

          await this.prisma.eventOccurrence.update({
            where: { id: firstOccurrence.id },
            data: {
              messageId: sentMessage.id,
              channelId,
              status: OccurrenceStatus.PUBLISHED,
              publishedAt: new Date(),
            },
          });
        }
      }

      await interaction.editReply({
        content: `✅ Event **${title}** created successfully!`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating event via Discord: ${msg}`);
      await interaction.editReply({
        content: `❌ Failed to create event: ${msg}`,
      });
    }
  }

  private parseDateTime(dateStr: string, timeStr: string): Date | null {
    const cleanDate = dateStr.toLowerCase().trim();
    const [hoursStr, minutesStr] = timeStr.trim().split(':');
    const hours = parseInt(hoursStr || '0', 10);
    const minutes = parseInt(minutesStr || '0', 10);

    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }

    const now = new Date();
    let target = new Date();

    if (cleanDate === 'today') {
      target = new Date(now);
    } else if (cleanDate === 'tomorrow') {
      target = new Date(now);
      target.setDate(target.getDate() + 1);
    } else if (cleanDate.includes('next ') || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(cleanDate.replace('next ', ''))) {
      const dayName = cleanDate.replace('next ', '').trim();
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDay = days.indexOf(dayName);
      if (targetDay !== -1) {
        const currentDay = now.getDay();
        let daysToAdd = (targetDay - currentDay + 7) % 7;
        if (daysToAdd === 0 || cleanDate.startsWith('next ')) {
          daysToAdd += 7;
        }
        target = new Date(now);
        target.setDate(target.getDate() + daysToAdd);
      } else {
        return null;
      }
    } else {
      // Try parsing standard date string YYYY-MM-DD
      const dateParts = cleanDate.split('-');
      if (dateParts.length === 3) {
        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const day = parseInt(dateParts[2], 10);
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
          return null;
        }
        target = new Date(year, month, day);
      } else {
        const directParsed = new Date(dateStr);
        if (isNaN(directParsed.getTime())) {
          return null;
        }
        target = directParsed;
      }
    }

    target.setHours(hours, minutes, 0, 0);
    return isNaN(target.getTime()) ? null : target;
  }
}
