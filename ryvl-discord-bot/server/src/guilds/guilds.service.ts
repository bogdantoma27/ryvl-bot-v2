import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
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

export const GUILD_CHANNEL_SETTING_KEYS = [
  'defaultChannelId',
  'defaultLineupChannelId',
  'defaultTransfersChannelId',
  'defaultFixturesChannelId',
  'defaultStandingsChannelId',
  'defaultLiveResultsChannelId',
  'defaultRyvlResultsChannelId',
  'defaultRyvlFixturesChannelId',
  'defaultRyvlLeaderboardChannelId',
  'defaultContactChannelId',
  'defaultRecruitmentChannelId',
] as const;

export type GuildChannelSettingKey = (typeof GUILD_CHANNEL_SETTING_KEYS)[number];

export type GuildSettingsPatch = Partial<Record<GuildChannelSettingKey, string | null>> & {
  timezone?: string;
  ryvlTeamName?: string;
};

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
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
        : null;

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

  /**
   * Partial update: only keys present in the body change. A channel key set to null or ''
   * clears that setting; any other value must be a text channel of this guild.
   */
  async updateSettings(guildId: string, data: GuildSettingsPatch): Promise<any> {
    const patch = await this.validateSettingsPatch(guildId, data || {});
    await this.getGuild(guildId);
    await this.prisma.guild.update({ where: { id: guildId }, data: patch });

    // The transfers poller reads its own config row: keep its channel in step, but never
    // create an enabled tracker as a side effect of choosing a channel here.
    if (patch.defaultTransfersChannelId !== undefined) {
      await this.prisma.vpgTransferConfig.upsert({
        where: { guildId },
        update: { channelId: patch.defaultTransfersChannelId },
        create: { guildId, channelId: patch.defaultTransfersChannelId, enabled: false },
      });
    }

    return this.getSettings(guildId);
  }

  async validateSettingsPatch(guildId: string, data: GuildSettingsPatch): Promise<Partial<Record<keyof GuildSettingsPatch, any>>> {
    const patch: Partial<Record<keyof GuildSettingsPatch, any>> = {};
    if (data.timezone !== undefined) {
      if (typeof data.timezone !== 'string' || !isValidTimeZone(data.timezone)) {
        throw new BadRequestException('Unknown timezone');
      }
      patch.timezone = data.timezone;
    }
    if (data.ryvlTeamName !== undefined) {
      const name = typeof data.ryvlTeamName === 'string' ? data.ryvlTeamName.trim() : '';
      if (!name || name.length > 100) throw new BadRequestException('Club name must be 1-100 characters');
      patch.ryvlTeamName = name;
    }
    for (const key of GUILD_CHANNEL_SETTING_KEYS) {
      const value = data[key];
      if (value === undefined) continue;
      if (value === null || value === '') {
        patch[key] = null;
        continue;
      }
      await this.discordService.assertChannelInGuild(guildId, value);
      patch[key] = value;
    }
    return patch;
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
