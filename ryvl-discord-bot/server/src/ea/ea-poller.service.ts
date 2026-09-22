import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EaService } from './ea.service';
import { DiscordService } from '../discord/discord.service';
import { ConfigService } from '../config/config.service';
import { buildEaMatchEmbed } from '../discord/embeds/ea-embed.builder';
import { EaRawMatch, ParsedEaMatch } from './ea.types';

@Injectable()
export class EaPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EaPollerService.name);
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eaService: EaService,
    @Inject(forwardRef(() => DiscordService))
    private readonly discordService: DiscordService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.startPolling();
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }

  private startPolling(): void {
    // Initial delay of 15 seconds after boot to let Discord client connect
    setTimeout(() => {
      this.pollAllGuilds().catch((err) =>
        this.logger.error(`Initial EA poll failed: ${err.message}`),
      );
    }, 15000);

    // Poll every 90 seconds
    this.pollInterval = setInterval(() => {
      this.pollAllGuilds().catch((err) =>
        this.logger.error(`Periodic EA poll failed: ${err.message}`),
      );
    }, 90000);

    this.logger.log('EA Sports Pro Clubs match poller initialized (90s interval).');
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.logger.log('EA Sports Pro Clubs match poller stopped.');
    }
  }

  async pollAllGuilds(): Promise<void> {
    if (this.isPolling) {
      this.logger.debug('EA poll already in progress, skipping tick.');
      return;
    }

    this.isPolling = true;
    try {
      const activeConfigs = await this.prisma.clubTrackerConfig.findMany({
        where: {
          enabled: true,
          channelId: { not: null },
        },
      });

      for (const config of activeConfigs) {
        try {
          await this.pollGuild(config);
        } catch (guildErr: any) {
          this.logger.error(
            `Error polling EA club for guild ${config.guildId} (${config.clubName}): ${guildErr.message}`,
          );
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  async pollGuild(config: any): Promise<{ postedCount: number; latestMatch?: ParsedEaMatch }> {
    const matchTypes =
      config.matchTypes && config.matchTypes.length > 0
        ? config.matchTypes
        : ['leagueMatch', 'friendlyMatch', 'playoffMatch'];

    // Fetch matches across configured types
    const rawMatchesMap = new Map<string, EaRawMatch>();

    for (const mType of matchTypes) {
      try {
        const matches = await this.eaService.fetchMatchesRaw(
          config.clubId,
          mType,
          5,
          config.platform || 'common-gen5',
        );
        if (Array.isArray(matches)) {
          for (const m of matches) {
            if (m && m.matchId) {
              rawMatchesMap.set(String(m.matchId), m);
            }
          }
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to fetch ${mType} for club ${config.clubId}: ${err.message}`,
        );
      }
    }

    const allMatches = Array.from(rawMatchesMap.values()).sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
    );

    if (allMatches.length === 0) {
      await this.prisma.clubTrackerConfig.update({
        where: { guildId: config.guildId },
        data: { lastPolledAt: new Date() },
      });
      return { postedCount: 0 };
    }

    const latestRaw = allMatches[0];
    const latestParsed = this.eaService.parseMatch(latestRaw, config.clubId);

    // Initial run: if no lastMatchId, set checkpoint to avoid spamming historical games
    if (!config.lastMatchId) {
      this.logger.log(
        `Setting initial EA checkpoint for guild ${config.guildId} to matchId ${latestRaw.matchId}`,
      );
      await this.prisma.clubTrackerConfig.update({
        where: { guildId: config.guildId },
        data: {
          lastMatchId: String(latestRaw.matchId),
          lastPolledAt: new Date(),
        },
      });

      // Mark the latest as already processed
      await this.prisma.processedEaMatch.upsert({
        where: {
          guildId_eaMatchId: {
            guildId: config.guildId,
            eaMatchId: String(latestRaw.matchId),
          },
        },
        update: {},
        create: {
          guildId: config.guildId,
          eaMatchId: String(latestRaw.matchId),
          clubId: config.clubId,
          matchType: latestParsed.matchType,
          homeClubName: latestParsed.trackedClub.name,
          awayClubName: latestParsed.opponentClub.name,
          homeScore: latestParsed.trackedClub.score,
          awayScore: latestParsed.opponentClub.score,
          timestamp: latestParsed.timestamp,
          channelId: config.channelId,
          rawPayload: latestRaw as any,
        },
      });

      return { postedCount: 0, latestMatch: latestParsed };
    }

    let postedCount = 0;
    const webBase = process.env.WEB_BASE_URL || 'http://localhost:4201';
    const webUrl = `${webBase}/club?guildId=${config.guildId}`;

    // Process from oldest to newest among new matches
    const matchesToProcess = allMatches.slice(0, 5).reverse();

    for (const raw of matchesToProcess) {
      const matchId = String(raw.matchId);
      const alreadyProcessed = await this.prisma.processedEaMatch.findUnique({
        where: {
          guildId_eaMatchId: {
            guildId: config.guildId,
            eaMatchId: matchId,
          },
        },
      });

      if (!alreadyProcessed) {
        const parsed = this.eaService.parseMatch(raw, config.clubId);
        const { embed, row } = buildEaMatchEmbed(parsed, webUrl);

        let sentMessageId: string | null = null;
        try {
          const sent = await this.discordService.sendMessageToChannel(
            config.channelId,
            embed,
            [row],
          );
          sentMessageId = sent?.id || null;
          this.logger.log(
            `Posted EA match ${matchId} (${parsed.outcome}) to Discord channel ${config.channelId}`,
          );
          postedCount++;
        } catch (sendErr: any) {
          this.logger.error(
            `Failed to send EA match ${matchId} to channel ${config.channelId}: ${sendErr.message}`,
          );
        }

        await this.prisma.processedEaMatch.create({
          data: {
            guildId: config.guildId,
            eaMatchId: matchId,
            clubId: config.clubId,
            matchType: parsed.matchType,
            homeClubName: parsed.trackedClub.name,
            awayClubName: parsed.opponentClub.name,
            homeScore: parsed.trackedClub.score,
            awayScore: parsed.opponentClub.score,
            timestamp: parsed.timestamp,
            discordMessageId: sentMessageId,
            channelId: config.channelId,
            rawPayload: raw as any,
          },
        });

        await this.prisma.clubTrackerConfig.update({
          where: { guildId: config.guildId },
          data: {
            lastMatchId: matchId,
            lastPolledAt: new Date(),
          },
        });
      }
    }

    await this.prisma.clubTrackerConfig.update({
      where: { guildId: config.guildId },
      data: { lastPolledAt: new Date() },
    });

    return { postedCount, latestMatch: latestParsed };
  }

  async postLatestMatch(
    guildId: string,
    targetChannelId?: string,
  ): Promise<{ success: boolean; match?: ParsedEaMatch; error?: string }> {
    const config = await this.eaService.getOrCreateTrackerConfig(guildId);
    const channelId = targetChannelId || config.channelId;

    if (!channelId) {
      return {
        success: false,
        error: 'No target Discord channel configured. Please select a channel first.',
      };
    }

    const matchTypes =
      config.matchTypes && config.matchTypes.length > 0
        ? config.matchTypes
        : ['leagueMatch', 'friendlyMatch', 'playoffMatch'];

    const rawMatchesMap = new Map<string, EaRawMatch>();
    for (const mType of matchTypes) {
      try {
        const matches = await this.eaService.fetchMatchesRaw(
          config.clubId,
          mType,
          5,
          config.platform || 'common-gen5',
        );
        if (Array.isArray(matches)) {
          for (const m of matches) {
            if (m && m.matchId) {
              rawMatchesMap.set(String(m.matchId), m);
            }
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to fetch ${mType}: ${err.message}`);
      }
    }

    const allMatches = Array.from(rawMatchesMap.values()).sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
    );

    if (allMatches.length === 0) {
      return {
        success: false,
        error: `No recent matches found for club "${config.clubName}" (ID: ${config.clubId}).`,
      };
    }

    const latest = allMatches[0];
    const parsed = this.eaService.parseMatch(latest, config.clubId);
    const webBase = process.env.WEB_BASE_URL || 'http://localhost:4201';
    const webUrl = `${webBase}/club?guildId=${guildId}`;
    const { embed, row } = buildEaMatchEmbed(parsed, webUrl);

    const sent = await this.discordService.sendMessageToChannel(channelId, embed, [row]);

    // Record as processed
    await this.prisma.processedEaMatch.upsert({
      where: {
        guildId_eaMatchId: {
          guildId,
          eaMatchId: String(latest.matchId),
        },
      },
      update: {},
      create: {
        guildId,
        eaMatchId: String(latest.matchId),
        clubId: config.clubId,
        matchType: parsed.matchType,
        homeClubName: parsed.trackedClub.name,
        awayClubName: parsed.opponentClub.name,
        homeScore: parsed.trackedClub.score,
        awayScore: parsed.opponentClub.score,
        timestamp: parsed.timestamp,
        discordMessageId: sent?.id || null,
        channelId,
        rawPayload: latest as any,
      },
    });

    await this.prisma.clubTrackerConfig.update({
      where: { guildId },
      data: {
        lastMatchId: String(latest.matchId),
        lastPolledAt: new Date(),
      },
    });

    return { success: true, match: parsed };
  }
}
