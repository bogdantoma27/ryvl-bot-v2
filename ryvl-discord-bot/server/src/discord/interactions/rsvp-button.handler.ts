import {
  ButtonInteraction,
  GuildMember,
  MessageFlags,
} from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { RsvpStatus } from '@prisma/client';
import { RsvpService } from '../../events/rsvp.service';
import { PrismaService } from '../../prisma/prisma.service';
import { buildEventEmbed } from '../embeds/event-embed.builder';

@Injectable()
export class RsvpButtonHandler {
  private readonly logger = new Logger(RsvpButtonHandler.name);

  constructor(
    private readonly rsvpService: RsvpService,
    private readonly prisma: PrismaService,
  ) {}

  async handle(interaction: ButtonInteraction): Promise<void> {
    const parts = interaction.customId.split(':');
    if (parts.length !== 3 || parts[0] !== 'rsvp') {
      return;
    }

    const occurrenceId = parts[1];
    const statusString = parts[2] as keyof typeof RsvpStatus;

    if (!(statusString in RsvpStatus)) {
      await interaction.reply({
        content: 'Invalid RSVP status option.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Acknowledge the button before database work/message edits. This prevents
    // Discord "Unknown interaction" errors when cloud/database latency exceeds
    // the initial interaction response window.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const status = RsvpStatus[statusString];
    const userId = interaction.user.id;
    const member = interaction.member as GuildMember | null;
    const displayName =
      member?.displayName || interaction.user.globalName || interaction.user.username;
    const avatarUrl = interaction.user.displayAvatarURL();

    try {
      await this.rsvpService.upsertRsvp(
        occurrenceId,
        userId,
        displayName,
        avatarUrl,
        status,
      );

      // Re-fetch occurrence, event, and all RSVPs to update the message embed
      const occurrence = await this.prisma.eventOccurrence.findUnique({
        where: { id: occurrenceId },
        include: {
          event: true,
          rsvps: true,
        },
      });

      if (occurrence) {
        const existingFooter = interaction.message.embeds[0]?.footer?.text;
        let creatorName = 'bgd';
        if (existingFooter && existingFooter.startsWith('Created by ')) {
          creatorName = existingFooter.replace('Created by ', '');
        }

        const { embed, row } = buildEventEmbed({
          event: occurrence.event,
          occurrence,
          rsvps: occurrence.rsvps,
          creatorName,
        });

        await interaction.message.edit({
          embeds: [embed],
          components: [row],
        });
      }

      const statusLabels: Record<RsvpStatus, string> = {
        [RsvpStatus.ACCEPTED]: 'Accepted ✅',
        [RsvpStatus.TENTATIVE]: 'Tentative ❓',
        [RsvpStatus.DECLINED]: 'Declined ❌',
      };

      await interaction.editReply({
        content: `Your RSVP has been recorded as **${statusLabels[status]}**!`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing RSVP button: ${msg}`);
      await interaction.editReply({
        content: `Could not process your RSVP: ${msg}`,
      });
    }
  }
}
