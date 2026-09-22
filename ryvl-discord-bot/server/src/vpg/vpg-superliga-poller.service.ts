import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VpgService } from './vpg.service';
import { DiscordService } from '../discord/discord.service';
import {
  buildSuperligaStandingsEmbed,
  buildSuperligaFixturesEmbed,
  buildSuperligaResultsEmbed,
  buildSuperligaLiveResultCardEmbed,
} from '../discord/embeds/superliga-embed.builder';

@Injectable()
export class VpgSuperligaPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VpgSuperligaPollerService.name);
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vpgService: VpgService,
    @Inject(forwardRef(() => DiscordService))
    private readonly discordService: DiscordService,
  ) {}

  onModuleInit(): void {
    this.startPolling();
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }

  private startPolling(): void {
    // Initial delay of 25 seconds after boot to ensure Discord client is logged in
    setTimeout(() => {
      this.pollAllGuildsLiveResults().catch((err) =>
        this.logger.error(`Initial Superliga results poll failed: ${err.message}`),
      );
    }, 25000);

    // Poll every 10 minutes (600,000 ms)
    this.pollInterval = setInterval(() => {
      this.pollAllGuildsLiveResults().catch((err) =>
        this.logger.error(`Periodic Superliga results poll failed: ${err.message}`),
      );
    }, 600000);

    this.logger.log('VPG Superliga Live Results poller initialized (10m interval).');
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.logger.log('VPG Superliga Live Results poller stopped.');
    }
  }

  async pollAllGuildsLiveResults(): Promise<void> {
    if (this.isPolling) {
      this.logger.debug('Superliga results poll already in progress, skipping.');
      return;
    }

    this.isPolling = true;
    try {
      const guilds = await this.prisma.guild.findMany({
        where: {
          defaultLiveResultsChannelId: { not: null },
        },
      });

      if (!guilds || guilds.length === 0) return;

      const latestSeason = await this.vpgService.fetchLatestSeason();
      const completedMatches = await this.vpgService.fetchMatches('complete', latestSeason, 20);

      if (!completedMatches || completedMatches.length === 0) return;

      for (const guild of guilds) {
        if (!guild.defaultLiveResultsChannelId) continue;
        await this.processGuildMatches(guild.id, guild.defaultLiveResultsChannelId, completedMatches);
      }
    } catch (err: any) {
      this.logger.error(`Error during Superliga live results polling: ${err.message}`);
    } finally {
      this.isPolling = false;
    }
  }

  private async processGuildMatches(
    guildId: string,
    channelId: string,
    matches: any[],
  ): Promise<number> {
    let postedCount = 0;

    // Check if guild has ANY processed match yet. If brand new, record existing without spamming.
    const existingCount = await this.prisma.processedVpgMatch.count({
      where: { guildId },
    });

    if (existingCount === 0) {
      this.logger.log(
        `Guild ${guildId} has no processed Superliga matches. Establishing baseline with ${matches.length} matches.`,
      );
      for (const m of matches) {
        await this.vpgService.recordProcessedMatch({
          guildId,
          vpgMatchId: m.id,
          homeName: m.homeName,
          awayName: m.awayName,
          homeScore: m.homeScore ?? 0,
          awayScore: m.awayScore ?? 0,
          matchDay: m.matchDay,
          datetime: new Date(m.datetime),
        });
      }
      return 0;
    }

    // Process from oldest to newest
    const sorted = [...matches].sort(
      (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
    );

    for (const m of sorted) {
      const alreadyProcessed = await this.vpgService.isMatchProcessed(guildId, m.id);
      if (alreadyProcessed) continue;

      let sentMsgId: string | null = null;
      try {
        const embed = buildSuperligaLiveResultCardEmbed(m);
        const sent = await this.discordService.sendMessageToChannel(channelId, embed);
        sentMsgId = sent?.id || null;
        this.logger.log(
          `Posted Superliga result #${m.id} (${m.homeName} ${m.homeScore}-${m.awayScore} ${m.awayName}) to ${channelId}`,
        );
        postedCount++;

        // Also post to dedicated ryvl-results channel if this is a RYVL match
        if (/ryvl|rival/i.test(m.homeName) || /ryvl|rival/i.test(m.awayName)) {
          const g = await this.prisma.guild.findUnique({ where: { id: guildId } });
          if (g?.defaultRyvlResultsChannelId && g.defaultRyvlResultsChannelId !== channelId) {
            await this.discordService.sendMessageToChannel(g.defaultRyvlResultsChannelId, embed).catch(() => null);
          }
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to post Superliga match #${m.id} to channel ${channelId}: ${err.message}`,
        );
      }

      await this.vpgService.recordProcessedMatch({
        guildId,
        vpgMatchId: m.id,
        homeName: m.homeName,
        awayName: m.awayName,
        homeScore: m.homeScore ?? 0,
        awayScore: m.awayScore ?? 0,
        matchDay: m.matchDay,
        datetime: new Date(m.datetime),
        discordMessageId: sentMsgId,
        channelId,
      });
    }

    return postedCount;
  }

  async checkGuildNow(guildId: string): Promise<{ postedCount: number }> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
    });

    if (!guild?.defaultLiveResultsChannelId) {
      return { postedCount: 0 };
    }

    const latestSeason = await this.vpgService.fetchLatestSeason();
    const completedMatches = await this.vpgService.fetchMatches('complete', latestSeason, 20);
    const postedCount = await this.processGuildMatches(
      guildId,
      guild.defaultLiveResultsChannelId,
      completedMatches,
    );

    return { postedCount };
  }

  async postStandingsToChannel(
    guildId: string,
    targetChannelId?: string,
    season?: number,
  ): Promise<{ success: boolean; messageId?: string }> {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    const channelId = targetChannelId || guild?.defaultStandingsChannelId;

    if (!channelId) {
      throw new Error('No channel configured for Superliga Standings.');
    }

    const targetSeason = season || (await this.vpgService.fetchLatestSeason());
    const standings = await this.vpgService.fetchStandings(targetSeason);
    const embed = buildSuperligaStandingsEmbed(standings, targetSeason);

    const sent = await this.discordService.sendMessageToChannel(channelId, embed);
    return { success: true, messageId: sent?.id };
  }

  async postFixturesToChannel(
    guildId: string,
    targetChannelId?: string,
    season?: number,
  ): Promise<{ success: boolean; messageId?: string }> {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    const channelId = targetChannelId || guild?.defaultFixturesChannelId;

    if (!channelId) {
      throw new Error('No channel configured for Superliga Fixtures.');
    }

    const targetSeason = season || (await this.vpgService.fetchLatestSeason());
    const fixtures = await this.vpgService.fetchMatches('scheduled', targetSeason, 15);
    const embed = buildSuperligaFixturesEmbed(fixtures, targetSeason, 12);

    const sent = await this.discordService.sendMessageToChannel(channelId, embed);
    return { success: true, messageId: sent?.id };
  }

  async postResultsToChannel(
    guildId: string,
    targetChannelId?: string,
    season?: number,
  ): Promise<{ success: boolean; messageId?: string }> {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    const channelId = targetChannelId || guild?.defaultLiveResultsChannelId;

    if (!channelId) {
      throw new Error('No channel configured for Superliga Results.');
    }

    const targetSeason = season || (await this.vpgService.fetchLatestSeason());
    const results = await this.vpgService.fetchMatches('complete', targetSeason, 15);
    const embed = buildSuperligaResultsEmbed(results, targetSeason, 12);

    const sent = await this.discordService.sendMessageToChannel(channelId, embed);
    return { success: true, messageId: sent?.id };
  }
}
