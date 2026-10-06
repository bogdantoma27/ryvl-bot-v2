import { BadRequestException } from '@nestjs/common';
import { ChannelType } from 'discord.js';

// Anything that can look up a channel by id: the discord.js Client in production,
// a plain object in tests.
export interface ChannelLookup {
  channels: { fetch(id: string): Promise<unknown> };
}

export interface GuildPostableChannel {
  id: string;
  guildId: string;
  type: ChannelType;
  name?: string;
  send: (...args: any[]) => Promise<any>;
}

const POSTABLE_TYPES = new Set<ChannelType>([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
const SNOWFLAKE = /^\d{17,20}$/;

/**
 * A channel id that came from a request body, a stored setting or a slash-command
 * option is only trusted once it resolves to a text or announcement channel of the
 * guild the caller is acting for. Being admin of one server must never allow posting
 * into another server's channels.
 */
export async function assertChannelInGuild(
  lookup: ChannelLookup,
  guildId: string,
  channelId: unknown,
): Promise<GuildPostableChannel> {
  if (typeof channelId !== 'string' || !SNOWFLAKE.test(channelId)) {
    throw new BadRequestException('Choose a valid Discord channel');
  }
  const channel = (await lookup.channels.fetch(channelId).catch(() => null)) as Partial<GuildPostableChannel> | null;
  if (
    !channel ||
    channel.guildId !== guildId ||
    channel.type === undefined ||
    !POSTABLE_TYPES.has(channel.type) ||
    typeof channel.send !== 'function'
  ) {
    throw new BadRequestException('That channel is not a text channel in this server');
  }
  return channel as GuildPostableChannel;
}
