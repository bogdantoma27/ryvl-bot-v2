import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { Injectable } from '@nestjs/common';
import { EventsService } from '../../events/events.service';

@Injectable()
export class EventListCommand {
  constructor(private readonly eventsService: EventsService) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'This command can only be used inside a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Acknowledge immediately before querying the database so the interaction
    // does not expire if the production database has network latency.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const events = await this.eventsService.listEvents(guildId, {
      upcoming: true,
      limit: 10,
    });

    if (events.length === 0) {
      await interaction.editReply({
        content: 'No upcoming events found for this server.',
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📅 Upcoming Events in ${interaction.guild?.name || 'Server'}`)
      .setColor(0x5865f2)
      .setDescription(`Found **${events.length}** upcoming event${events.length === 1 ? '' : 's'}:`)
      .setTimestamp();

    for (const event of events) {
      const nextOcc =
        event.occurrences.find((o) => new Date(o.startsAt) >= new Date()) ||
        event.occurrences[0];

      const startUnix = nextOcc
        ? Math.floor(new Date(nextOcc.startsAt).getTime() / 1000)
        : null;

      const dateText = startUnix
        ? `<t:${startUnix}:F> (<t:${startUnix}:R>)`
        : 'Date TBD';

      const rsvpText = nextOcc?.rsvpCounts
        ? `✅ ${nextOcc.rsvpCounts.accepted} • ❓ ${nextOcc.rsvpCounts.tentative} • ❌ ${nextOcc.rsvpCounts.declined}`
        : 'No RSVPs yet';

      embed.addFields({
        name: event.title,
        value: `🗓️ ${dateText}\n👥 ${rsvpText}\n📍 ${event.location || 'No location'}\n🆔 \`${event.id}\``,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }
}
