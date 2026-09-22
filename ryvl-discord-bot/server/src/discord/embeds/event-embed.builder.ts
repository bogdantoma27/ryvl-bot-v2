import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { Event, EventOccurrence, Rsvp, RsvpStatus } from '@prisma/client';

export interface EventEmbedData {
  event: Pick<Event, 'id' | 'title' | 'description' | 'location' | 'color' | 'imageUrl'> & {
    createdById?: string;
  };
  occurrence: Pick<EventOccurrence, 'id' | 'index' | 'startsAt' | 'endsAt' | 'status'>;
  rsvps?: Rsvp[];
  creatorName?: string;
  frontendUrl?: string;
}

export function buildEventEmbed(data: EventEmbedData): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<ButtonBuilder>;
} {
  const { event, occurrence, rsvps = [], creatorName, frontendUrl = 'http://localhost:4201' } = data;

  // Default color to #EAE905 (the exact yellow/gold from the screenshot)
  let colorNumber = 0xeae905;
  if (event.color && event.color.trim() !== '') {
    const parsed = parseInt(event.color.replace('#', ''), 16);
    if (!isNaN(parsed)) {
      colorNumber = parsed;
    }
  }

  const startUnix = Math.floor(occurrence.startsAt.getTime() / 1000);
  const endUnix = occurrence.endsAt
    ? Math.floor(occurrence.endsAt.getTime() / 1000)
    : startUnix + 3600;

  // Google Calendar URL template for [+]
  const gcalStart = new Date(startUnix * 1000).toISOString().replace(/-|:|\.\d\d\d/g, '');
  const gcalEnd = new Date(endUnix * 1000).toISOString().replace(/-|:|\.\d\d\d/g, '');
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${gcalStart}/${gcalEnd}&details=${encodeURIComponent(event.description || '')}`;
  const webUrl = `${frontendUrl.replace(/\/$/, '')}/events/${event.id}`;

  const accepted = rsvps.filter((r) => r.status === RsvpStatus.ACCEPTED);
  const tentative = rsvps.filter((r) => r.status === RsvpStatus.TENTATIVE);
  const declined = rsvps.filter((r) => r.status === RsvpStatus.DECLINED);

  const formatUserList = (list: Rsvp[]): string => {
    if (list.length === 0) return '-';
    return list.map((r) => `> ${r.displayName}`).join('\n');
  };

  const embed = new EmbedBuilder()
    .setTitle(event.title)
    .setColor(colorNumber);

  if (event.description && event.description.trim() !== '') {
    embed.setDescription(event.description);
  }

  if (event.imageUrl) {
    embed.setImage(event.imageUrl);
  }

  // Time field matching the attachment:
  // Tuesday, September 22, 2026 20:00 [+] [View on web]
  // 🕐 in 4 hours
  const timeFieldLines = [
    `<t:${startUnix}:F> [[+]](<${gcalUrl}>) [[View on web]](<${webUrl}>)`,
    `🕐 <t:${startUnix}:R>`,
  ];

  embed.addFields({
    name: 'Time',
    value: timeFieldLines.join('\n'),
    inline: false,
  });

  if (event.location && event.location.trim() !== '') {
    embed.addFields({
      name: 'Location',
      value: event.location,
      inline: false,
    });
  }

  // 3 columns: Accepted, Declined, Tentative (matching attachment layout)
  const acceptedHeader = accepted.length > 0 ? `✅ Accepted (${accepted.length})` : '✅ Accepted';
  const declinedHeader = declined.length > 0 ? `❌ Declined (${declined.length})` : '❌ Declined';
  const tentativeHeader = tentative.length > 0 ? `❓ Tentative (${tentative.length})` : '❓ Tentative';

  embed.addFields(
    {
      name: acceptedHeader,
      value: formatUserList(accepted),
      inline: true,
    },
    {
      name: declinedHeader,
      value: formatUserList(declined),
      inline: true,
    },
    {
      name: tentativeHeader,
      value: formatUserList(tentative),
      inline: true,
    },
  );

  // Footer: "Created by <name>"
  const footerText = creatorName ? `Created by ${creatorName}` : 'RYVL Events';
  embed.setFooter({ text: footerText });

  const isInteractive = occurrence.status === 'PUBLISHED' || occurrence.status === 'SCHEDULED';

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rsvp:${occurrence.id}:ACCEPTED`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✅')
      .setDisabled(!isInteractive),
    new ButtonBuilder()
      .setCustomId(`rsvp:${occurrence.id}:DECLINED`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('❌')
      .setDisabled(!isInteractive),
    new ButtonBuilder()
      .setCustomId(`rsvp:${occurrence.id}:TENTATIVE`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('❓')
      .setDisabled(!isInteractive),
    new ButtonBuilder()
      .setCustomId(`event:edit:${event.id}`)
      .setLabel('Edit')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!isInteractive),
    new ButtonBuilder()
      .setCustomId(`event:delete:${event.id}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!isInteractive),
  );

  return { embed, row };
}
