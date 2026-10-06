import {
  ButtonInteraction,
  GuildMember,
  MessageFlags,
} from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { OccurrenceStatus, RsvpStatus } from '@prisma/client';
import { RsvpClosedException, RsvpService } from '../../events/rsvp.service';
import { EventPublisher } from '../../events/event-publisher.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RsvpButtonHandler {
  private readonly logger = new Logger(RsvpButtonHandler.name);

  constructor(
    private readonly rsvpService: RsvpService,
    private readonly prisma: PrismaService,
    private readonly publisher: EventPublisher,
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
      await this.rsvpService.upsertRsvp(occurrenceId, userId, displayName, avatarUrl, status);
    } catch (error) {
      if (error instanceof RsvpClosedException) {
        await interaction.editReply({ content: `❌ ${error.message}` });
        // The card still showed buttons: bring it up to date for everyone.
        if (error.occurrenceStatus === OccurrenceStatus.CLOSED || error.occurrenceStatus === OccurrenceStatus.CANCELLED) {
          await this.refreshMessage(interaction, occurrenceId).catch(() => undefined);
        }
        return;
      }
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing RSVP button: ${msg}`);
      await interaction.editReply({ content: `Could not process your RSVP: ${msg}` });
      return;
    }

    try {
      await this.refreshMessage(interaction, occurrenceId);
    } catch (error) {
      this.logger.warn(`RSVP saved but message refresh failed: ${error instanceof Error ? error.message : error}`);
    }

    const statusLabels: Record<RsvpStatus, string> = {
      [RsvpStatus.ACCEPTED]: 'Accepted ✅',
      [RsvpStatus.TENTATIVE]: 'Tentative ❓',
      [RsvpStatus.DECLINED]: 'Declined ❌',
    };
    await interaction.editReply({
      content: `Your RSVP has been recorded as **${statusLabels[status]}**!`,
    });
  }

  /** Re-renders the clicked card from fresh data, keeping its "Created by" footer. */
  private async refreshMessage(interaction: ButtonInteraction, occurrenceId: string): Promise<void> {
    const occurrence = await this.prisma.eventOccurrence.findUnique({
      where: { id: occurrenceId },
      include: { event: true, rsvps: true },
    });
    if (!occurrence) return;
    const footer = interaction.message.embeds[0]?.footer?.text;
    const creatorName = footer?.startsWith('Created by ') ? footer.slice('Created by '.length) : undefined;
    await interaction.message.edit(this.publisher.renderAnnouncement(occurrence, creatorName));
  }
}
