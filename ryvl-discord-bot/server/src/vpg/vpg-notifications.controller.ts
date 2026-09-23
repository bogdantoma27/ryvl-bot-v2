import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Post, Req, UseGuards, forwardRef } from '@nestjs/common';
import { PermissionFlagsBits, ButtonStyle, MessageEditOptions, TextChannel } from 'discord.js';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { ConfigService } from '../config/config.service';
import { buildClubWebUrl } from '../config/public-url';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import { VpgSuperligaPollerService } from './vpg-superliga-poller.service';

@Controller('api/guilds/:guildId/vpg/notifications')
@UseGuards(AuthGuard)
export class VpgNotificationsController {
  constructor(
    private readonly poller: VpgSuperligaPollerService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => DiscordService)) private readonly discord: DiscordService,
  ) {}
  private async authorize(guildId: string, request: AuthenticatedRequest): Promise<void> {
    if (!request.user?.userId || !/^\d{10,25}$/.test(guildId)) throw new ForbiddenException('Invalid Discord server');
    try {
      const guild = await this.discord.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(request.user.userId);
      if (!member.permissions.has(PermissionFlagsBits.Administrator) && !member.permissions.has(PermissionFlagsBits.ManageGuild)) throw new Error('Not an administrator');
    } catch { throw new ForbiddenException('Administrator or Manage Server permission is required for this server'); }
  }
  @Get()
  async get(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest) {
    await this.authorize(guildId, request);
    const { leaseToken, leaseUntil, ...config } = await this.poller.getConfig(guildId);
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    return { config, timezone: 'Europe/Bucharest', channels: {
      results: guild?.defaultLiveResultsChannelId, ryvlResults: guild?.defaultRyvlResultsChannelId,
      fixtures: guild?.defaultFixturesChannelId, ryvlFixtures: guild?.defaultRyvlFixturesChannelId,
      standings: guild?.defaultStandingsChannelId, ryvlStandings: guild?.defaultRyvlLeaderboardChannelId,
    } };
  }
  @Patch()
  async update(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest, @Body() body: unknown) {
    await this.authorize(guildId, request);
    try { await this.poller.updateConfig(guildId, body); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid settings'); }
    return this.get(guildId, request);
  }
  @Post('check')
  async check(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest) {
    await this.authorize(guildId, request);
    return this.poller.checkGuildNow(guildId);
  }
  @Post('repair-club-links')
  async repair(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest) {
    await this.authorize(guildId, request);
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
