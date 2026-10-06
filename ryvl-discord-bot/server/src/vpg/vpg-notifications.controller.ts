import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Post, UseGuards, forwardRef } from '@nestjs/common';
import { ButtonStyle, MessageEditOptions, TextChannel } from 'discord.js';
import { AuthGuard } from '../auth/auth.guard';
import { GuildAdminGuard } from '../auth/guild-admin.guard';
import { ConfigService } from '../config/config.service';
import { buildClubWebUrl } from '../config/public-url';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import { VpgSuperligaPollerService } from './vpg-superliga-poller.service';
import { ROMANIA_TIME_ZONE } from './notification-policy';

@Controller('api/guilds/:guildId/vpg/notifications')
// GuildAdminGuard: signed in and Administrator / Manage Server in :guildId.
@UseGuards(AuthGuard, GuildAdminGuard)
export class VpgNotificationsController {
  constructor(
    private readonly poller: VpgSuperligaPollerService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => DiscordService)) private readonly discord: DiscordService,
  ) {}
  @Get()
  async get(@Param('guildId') guildId: string) {
    const { leaseToken, leaseUntil, ...config } = await this.poller.getConfig(guildId);
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    // The poller schedules fixtures/standings on Bucharest time (notification-policy.ts), so this
    // reports that zone rather than Guild.timezone, which would mislabel the schedule.
    return { config, timezone: ROMANIA_TIME_ZONE, channels: {
      results: guild?.defaultLiveResultsChannelId, ryvlResults: guild?.defaultRyvlResultsChannelId,
      fixtures: guild?.defaultFixturesChannelId, ryvlFixtures: guild?.defaultRyvlFixturesChannelId,
      standings: guild?.defaultStandingsChannelId, ryvlStandings: guild?.defaultRyvlLeaderboardChannelId,
    } };
  }
  @Patch()
  async update(@Param('guildId') guildId: string, @Body() body: unknown) {
    try { await this.poller.updateConfig(guildId, body); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid settings'); }
    return this.get(guildId);
  }
  @Post('check')
  async check(@Param('guildId') guildId: string) {
    return this.poller.checkGuildNow(guildId);
  }
  @Post('repair-club-links')
  async repair(@Param('guildId') guildId: string) {
    // This explicit admin action only edits known bot-owned messages. It never deletes/reposts history.
    const records = await this.prisma.processedEaMatch.findMany({ where: { guildId, discordMessageId: { not: null }, channelId: { not: null } }, orderBy: { createdAt: 'desc' }, take: 200 });
    let updated = 0, skipped = 0, failed = 0;
    for (const record of records) {
      try {
        const channel = await this.discord.client.channels.fetch(record.channelId!) as TextChannel | null;
        if (!channel || channel.guildId !== guildId || !channel.messages) { skipped++; continue; }
        const message = await channel.messages.fetch(record.discordMessageId!);
        if (message.author.id !== this.discord.client.user?.id) { skipped++; continue; }
        let changed = false;
        const rows = message.components.map(row => {
          const json = row.toJSON();
          if (!('components' in json) || !Array.isArray(json.components)) return json;
          const components = json.components.map(component => {
            if (component.type !== 2 || component.style !== ButtonStyle.Link) return component;
            if (!('url' in component) || !/view club on web/i.test(component.label || '')) return component;
            const target = buildClubWebUrl(this.config.frontendUrl, guildId);
            if (component.url === target) return component;
            changed = true;
            return { ...component, url: target };
          });
          return { ...json, components };
        });
        if (changed) {
          await message.edit({ components: rows as MessageEditOptions['components'] });
          updated++;
          await new Promise(resolve => setTimeout(resolve, 300));
        } else skipped++;
      } catch { failed++; }
    }
    return { updated, skipped, failed, inspected: records.length, limit: 200 };
  }
}
