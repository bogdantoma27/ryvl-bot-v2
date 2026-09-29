import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Guild, PermissionFlagsBits } from 'discord.js';
import { Guild as PrismaGuild } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService, DiscordChannelInfo, DiscordRoleInfo, DiscordMemberInfo } from '../discord/discord.service';

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

    const [channels, roles, members] = await Promise.all([
      this.discordService.getGuildChannels(guildId).catch((): DiscordChannelInfo[] => []),
      this.discordService.getGuildRoles(guildId).catch((): DiscordRoleInfo[] => []),
      this.discordService.getGuildMembers(guildId).catch((): DiscordMemberInfo[] => []),
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
      defaultTimezone: guild.timezone || 'Europe/Bucharest',
      guild: {
        id: guild.id,
        name: realName,
        iconUrl: realIconUrl,
        timezone: guild.timezone || 'Europe/Bucharest',
        defaultChannelId,
        defaultLineupChannelId: guild.defaultLineupChannelId || null,
        defaultTransfersChannelId: guild.defaultTransfersChannelId || null,
        defaultFixturesChannelId: guild.defaultFixturesChannelId || null,
        defaultStandingsChannelId: guild.defaultStandingsChannelId || null,
        defaultLiveResultsChannelId: guild.defaultLiveResultsChannelId || null,
        defaultRyvlResultsChannelId: guild.defaultRyvlResultsChannelId || null,
        defaultRyvlFixturesChannelId: guild.defaultRyvlFixturesChannelId || null,
        defaultRyvlLeaderboardChannelId: guild.defaultRyvlLeaderboardChannelId || null,
        defaultContactChannelId: guild.defaultContactChannelId || null,
        defaultRecruitmentChannelId: guild.defaultRecruitmentChannelId || null,
        ryvlTeamName: guild.ryvlTeamName || 'RYVL Esports',
      },
      channels,
      roles,
      members,
      settings: {
        timezone: guild.timezone || 'Europe/Bucharest',
        defaultChannelId,
        defaultLineupChannelId: guild.defaultLineupChannelId || null,
        defaultTransfersChannelId: guild.defaultTransfersChannelId || null,
        defaultFixturesChannelId: guild.defaultFixturesChannelId || null,
        defaultStandingsChannelId: guild.defaultStandingsChannelId || null,
        defaultLiveResultsChannelId: guild.defaultLiveResultsChannelId || null,
        defaultRyvlResultsChannelId: guild.defaultRyvlResultsChannelId || null,
        defaultRyvlFixturesChannelId: guild.defaultRyvlFixturesChannelId || null,
        defaultRyvlLeaderboardChannelId: guild.defaultRyvlLeaderboardChannelId || null,
        defaultContactChannelId: guild.defaultContactChannelId || null,
        defaultRecruitmentChannelId: guild.defaultRecruitmentChannelId || null,
        ryvlTeamName: guild.ryvlTeamName || 'RYVL Esports',
        botActive: true,
      },
    };
  }

  async getMembers(guildId: string): Promise<DiscordMemberInfo[]> {
    return this.discordService.getGuildMembers(guildId).catch(() => []);
  }

  async getSettings(guildId: string): Promise<any> {
    const guild = await this.getGuild(guildId);
    const clientGuild = this.discordService.client.guilds.cache.get(guildId);
    return {
      guildId: guild.id,
      name: clientGuild?.name || guild.name,
      iconUrl: clientGuild?.iconURL({ extension: 'png', size: 256 }) || guild.iconUrl,
      timezone: guild.timezone || 'Europe/Bucharest',
      defaultChannelId: guild.defaultChannelId || null,
      defaultLineupChannelId: guild.defaultLineupChannelId || null,
      defaultTransfersChannelId: guild.defaultTransfersChannelId || null,
      defaultFixturesChannelId: guild.defaultFixturesChannelId || null,
      defaultStandingsChannelId: guild.defaultStandingsChannelId || null,
      defaultLiveResultsChannelId: guild.defaultLiveResultsChannelId || null,
      defaultRyvlResultsChannelId: guild.defaultRyvlResultsChannelId || null,
      defaultRyvlFixturesChannelId: guild.defaultRyvlFixturesChannelId || null,
      defaultRyvlLeaderboardChannelId: guild.defaultRyvlLeaderboardChannelId || null,
      defaultContactChannelId: guild.defaultContactChannelId || null,
      defaultRecruitmentChannelId: guild.defaultRecruitmentChannelId || null,
      ryvlTeamName: guild.ryvlTeamName || 'RYVL Esports',
      botStatus: 'online',
    };
  }

  async updateSettings(
    guildId: string,
    data: {
      name?: string;
      timezone?: string;
      defaultChannelId?: string | null;
      defaultLineupChannelId?: string | null;
      defaultTransfersChannelId?: string | null;
      defaultFixturesChannelId?: string | null;
      defaultStandingsChannelId?: string | null;
      defaultLiveResultsChannelId?: string | null;
      defaultRyvlResultsChannelId?: string | null;
      defaultRyvlFixturesChannelId?: string | null;
      defaultRyvlLeaderboardChannelId?: string | null;
      defaultContactChannelId?: string | null;
      defaultRecruitmentChannelId?: string | null;
      ryvlTeamName?: string;
    },
  ): Promise<any> {
    const guild = await this.prisma.guild.upsert({
      where: { id: guildId },
      update: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.timezone ? { timezone: data.timezone } : {}),
        ...(data.defaultChannelId !== undefined ? { defaultChannelId: data.defaultChannelId } : {}),
        ...(data.defaultLineupChannelId !== undefined ? { defaultLineupChannelId: data.defaultLineupChannelId } : {}),
        ...(data.defaultTransfersChannelId !== undefined ? { defaultTransfersChannelId: data.defaultTransfersChannelId } : {}),
        ...(data.defaultFixturesChannelId !== undefined ? { defaultFixturesChannelId: data.defaultFixturesChannelId } : {}),
        ...(data.defaultStandingsChannelId !== undefined ? { defaultStandingsChannelId: data.defaultStandingsChannelId } : {}),
        ...(data.defaultLiveResultsChannelId !== undefined ? { defaultLiveResultsChannelId: data.defaultLiveResultsChannelId } : {}),
        ...(data.defaultRyvlResultsChannelId !== undefined ? { defaultRyvlResultsChannelId: data.defaultRyvlResultsChannelId } : {}),
        ...(data.defaultRyvlFixturesChannelId !== undefined ? { defaultRyvlFixturesChannelId: data.defaultRyvlFixturesChannelId } : {}),
        ...(data.defaultRyvlLeaderboardChannelId !== undefined ? { defaultRyvlLeaderboardChannelId: data.defaultRyvlLeaderboardChannelId } : {}),
        ...(data.defaultContactChannelId !== undefined ? { defaultContactChannelId: data.defaultContactChannelId } : {}),
        ...(data.defaultRecruitmentChannelId !== undefined ? { defaultRecruitmentChannelId: data.defaultRecruitmentChannelId } : {}),
        ...(data.ryvlTeamName !== undefined ? { ryvlTeamName: data.ryvlTeamName } : {}),
      },
      create: {
        id: guildId,
        name: data.name || 'Discord Server',
        timezone: data.timezone || 'Europe/Bucharest',
        defaultChannelId: data.defaultChannelId || null,
        defaultLineupChannelId: data.defaultLineupChannelId || null,
        defaultTransfersChannelId: data.defaultTransfersChannelId || null,
        defaultFixturesChannelId: data.defaultFixturesChannelId || null,
        defaultStandingsChannelId: data.defaultStandingsChannelId || null,
        defaultLiveResultsChannelId: data.defaultLiveResultsChannelId || null,
        defaultRyvlResultsChannelId: data.defaultRyvlResultsChannelId || null,
        defaultRyvlFixturesChannelId: data.defaultRyvlFixturesChannelId || null,
        defaultRyvlLeaderboardChannelId: data.defaultRyvlLeaderboardChannelId || null,
        defaultContactChannelId: data.defaultContactChannelId || null,
        defaultRecruitmentChannelId: data.defaultRecruitmentChannelId || null,
        ryvlTeamName: data.ryvlTeamName || 'RYVL Esports',
      },
    });

    // If defaultTransfersChannelId is updated, synchronize vpgTransferConfig
    if (data.defaultTransfersChannelId !== undefined) {
      await this.prisma.vpgTransferConfig.upsert({
        where: { guildId },
        update: { channelId: data.defaultTransfersChannelId },
        create: {
          guildId,
          channelId: data.defaultTransfersChannelId,
          enabled: true,
        },
      });
    }

    const clientGuild = this.discordService.client.guilds.cache.get(guildId);
    return {
      guildId: guild.id,
      name: clientGuild?.name || guild.name,
      iconUrl: clientGuild?.iconURL({ extension: 'png', size: 256 }) || guild.iconUrl,
      timezone: guild.timezone,
      defaultChannelId: guild.defaultChannelId,
      defaultLineupChannelId: guild.defaultLineupChannelId,
      defaultTransfersChannelId: guild.defaultTransfersChannelId,
      defaultFixturesChannelId: guild.defaultFixturesChannelId,
      defaultStandingsChannelId: guild.defaultStandingsChannelId,
      defaultLiveResultsChannelId: guild.defaultLiveResultsChannelId,
      botStatus: 'online',
    };
  }

  async listUserGuilds(userId: string): Promise<UserGuildItem[]> {
    const result: UserGuildItem[] = [];
    const client = this.discordService.client;

    try {
      // 1. Fetch current list of all bot guilds from Discord API (guarantees newly invited guilds appear)
      const fetchedOAuth = await client.guilds.fetch().catch(() => null);
      const guildIds = new Set<string>();

      if (fetchedOAuth && fetchedOAuth.size > 0) {
        for (const [id] of fetchedOAuth) {
          guildIds.add(id);
        }
      }
      for (const [id] of client.guilds.cache) {
        guildIds.add(id);
      }
      const dbGuilds = await this.prisma.guild.findMany({ select: { id: true } }).catch(() => []);
      for (const g of dbGuilds) {
        guildIds.add(g.id);
      }

      for (const guildId of guildIds) {
        try {
          const guild =
            client.guilds.cache.get(guildId) ||
            (await client.guilds.fetch(guildId).catch(() => null));

          if (!guild) continue;

          // Automatically sync guild to database
          await this.prisma.guild.upsert({
            where: { id: guild.id },
            update: {
              name: guild.name,
              iconUrl: guild.iconURL({ extension: 'png', size: 256 }) || null,
            },
            create: {
              id: guild.id,
              name: guild.name,
              iconUrl: guild.iconURL({ extension: 'png', size: 256 }) || null,
            },
          }).catch(() => {});

          const hasAdmin = await this.discordService.checkUserIsAdmin(guild.id, userId);

          if (hasAdmin) {
            result.push({
              id: guild.id,
              name: guild.name,
              iconUrl: guild.iconURL({ extension: 'png', size: 256 }) || null,
              botPresent: true,
              hasAdminPermission: true,
            });
          }
        } catch (memberErr) {
          this.logger.debug(`Could not check user permissions in guild ${guildId}: ${memberErr}`);
        }
      }
    } catch (err) {
      this.logger.error(`Error listing user guilds: ${err}`);
    }

    return result;
  }
}
