import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Guild, PermissionFlagsBits } from 'discord.js';
import { Guild as PrismaGuild } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService, DiscordChannelInfo, DiscordRoleInfo } from '../discord/discord.service';

export interface UserGuildItem {
  id: string;
  name: string;
  iconUrl: string | null;
  botPresent: boolean;
  hasAdminPermission: boolean;
}

export interface GuildBootstrapData {
  guild: PrismaGuild;
  channels: DiscordChannelInfo[];
  roles: DiscordRoleInfo[];
}

@Injectable()
export class GuildsService {
  private readonly logger = new Logger(GuildsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discordService: DiscordService,
  ) {}

  async upsertGuild(data: {
    id: string;
    name: string;
    iconUrl?: string | null;
  }): Promise<PrismaGuild> {
    return this.prisma.guild.upsert({
      where: { id: data.id },
      update: {
        name: data.name,
        iconUrl: data.iconUrl ?? null,
      },
      create: {
        id: data.id,
        name: data.name,
        iconUrl: data.iconUrl ?? null,
      },
    });
  }

  async getGuild(guildId: string): Promise<PrismaGuild> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
    });

    if (!guild) {
      // If not in DB, check Discord cache and upsert
      const discordGuild = await this.discordService.client.guilds
        .fetch(guildId)
        .catch(() => null);

      if (discordGuild) {
        return this.upsertGuild({
          id: discordGuild.id,
          name: discordGuild.name,
          iconUrl: discordGuild.iconURL(),
        });
      }

      throw new NotFoundException(`Guild with ID "${guildId}" not found`);
    }

    return guild;
  }

  async getBootstrapData(guildId: string): Promise<any> {
    const guild = await this.getGuild(guildId);

    const clientGuild =
      this.discordService.client.guilds.cache.get(guildId) ||
      (await this.discordService.client.guilds.fetch(guildId).catch(() => null));

    const [channels, roles] = await Promise.all([
      this.discordService.getGuildChannels(guildId).catch((): DiscordChannelInfo[] => []),
      this.discordService.getGuildRoles(guildId).catch((): DiscordRoleInfo[] => []),
    ]);

    const realIconUrl =
      clientGuild?.iconURL({ extension: 'png', size: 256 }) || guild.iconUrl;
    const realName = clientGuild?.name || guild.name;

    const defaultChannelId =
      guild.defaultChannelId && channels.some((c) => c.id === guild.defaultChannelId)
        ? guild.defaultChannelId
        : channels[0]?.id || null;

    return {
      id: guild.id,
      name: realName,
      iconUrl: realIconUrl,
      defaultTimezone: guild.timezone || 'UTC',
      guild: {
        id: guild.id,
        name: realName,
        iconUrl: realIconUrl,
        timezone: guild.timezone,
        defaultChannelId,
      },
      channels,
      roles,
      settings: {
        timezone: guild.timezone || 'UTC',
        defaultChannelId,
        botActive: true,
      },
    };
  }

  async getSettings(guildId: string): Promise<any> {
    const guild = await this.getGuild(guildId);
    const clientGuild = this.discordService.client.guilds.cache.get(guildId);
    return {
      guildId: guild.id,
      name: clientGuild?.name || guild.name,
      iconUrl: clientGuild?.iconURL({ extension: 'png', size: 256 }) || guild.iconUrl,
      timezone: guild.timezone || 'UTC',
      defaultChannelId: guild.defaultChannelId || null,
      botStatus: 'online',
    };
  }

  async updateSettings(
    guildId: string,
    data: { name?: string; timezone?: string; defaultChannelId?: string | null },
  ): Promise<any> {
    const guild = await this.prisma.guild.upsert({
      where: { id: guildId },
      update: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.timezone ? { timezone: data.timezone } : {}),
        ...(data.defaultChannelId !== undefined
          ? { defaultChannelId: data.defaultChannelId }
          : {}),
      },
      create: {
        id: guildId,
        name: data.name || 'Discord Server',
        timezone: data.timezone || 'UTC',
        defaultChannelId: data.defaultChannelId || null,
      },
    });

    const clientGuild = this.discordService.client.guilds.cache.get(guildId);
    return {
      guildId: guild.id,
      name: clientGuild?.name || guild.name,
      iconUrl: clientGuild?.iconURL({ extension: 'png', size: 256 }) || guild.iconUrl,
      timezone: guild.timezone,
      defaultChannelId: guild.defaultChannelId,
      botStatus: 'online',
    };
  }

  async listUserGuilds(userId: string): Promise<UserGuildItem[]> {
    const result: UserGuildItem[] = [];
    const client = this.discordService.client;

    try {
      const cachedGuilds = client.guilds.cache;

      for (const [, guild] of cachedGuilds) {
        try {
          const member =
            guild.members.cache.get(userId) ||
            (await guild.members.fetch(userId).catch(() => null));
          const isOwner = guild.ownerId === userId;
          const hasAdmin = member
            ? member.permissions.has(PermissionFlagsBits.Administrator) ||
              member.permissions.has(PermissionFlagsBits.ManageGuild) ||
              isOwner
            : isOwner;

          if (member || isOwner) {
            result.push({
              id: guild.id,
              name: guild.name,
              iconUrl: guild.iconURL({ extension: 'png', size: 256 }) || null,
              botPresent: true,
              hasAdminPermission: hasAdmin,
            });
          }
        } catch (memberErr) {
          this.logger.debug(`Could not check user permissions in guild ${guild.id}: ${memberErr}`);
        }
      }

      if (result.length === 0) {
        const dbGuilds = await this.prisma.guild.findMany();
        for (const g of dbGuilds) {
          const clientGuild = client.guilds.cache.get(g.id);
          result.push({
            id: g.id,
            name: clientGuild?.name || g.name,
            iconUrl: clientGuild?.iconURL({ extension: 'png', size: 256 }) || g.iconUrl,
            botPresent: true,
            hasAdminPermission: true,
          });
        }
      }
    } catch (err) {
      this.logger.error(`Error listing user guilds: ${err}`);
    }

    return result;
  }
}
