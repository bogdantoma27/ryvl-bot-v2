import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { EaService } from './ea.service';
import { EaPollerService } from './ea-poller.service';

@Controller('api/guilds/:guildId/ea')
@UseGuards(AuthGuard)
export class EaController {
  private readonly logger = new Logger(EaController.name);

  constructor(
    private readonly eaService: EaService,
    private readonly eaPollerService: EaPollerService,
  ) {}

  @Get('config')
  async getConfig(@Param('guildId') guildId: string) {
    const config = await this.eaService.getOrCreateTrackerConfig(guildId);
    let clubInfo = null;
    let overallStats = null;

    try {
      clubInfo = await this.eaService.fetchClubInfo(
        config.clubId,
        config.platform || 'common-gen5',
      );
    } catch (e: any) {
      this.logger.warn(`Could not fetch clubInfo for ${config.clubId}: ${e.message}`);
    }

    try {
      overallStats = await this.eaService.fetchOverallStats(
        config.clubId,
        config.platform || 'common-gen5',
      );
    } catch (e: any) {
      this.logger.warn(`Could not fetch overallStats for ${config.clubId}: ${e.message}`);
    }

    return {
      config,
      clubInfo,
      overallStats,
    };
  }

  @Patch('config')
  async updateConfig(
    @Param('guildId') guildId: string,
    @Body()
    body: {
      clubId?: string;
      clubName?: string;
      platform?: string;
      channelId?: string | null;
      enabled?: boolean;
      matchTypes?: string[];
      pollIntervalSec?: number;
    },
  ) {
    return this.eaService.updateTrackerConfig(guildId, body);
  }

  @Get('search')
  async searchClubs(
    @Query('query') query: string,
    @Query('platform') platform = 'common-gen5',
  ) {
    if (!query || !query.trim()) return [];
    return this.eaService.searchClubs(query.trim(), platform);
  }

  @Get('matches')
  async getRecentMatches(
    @Param('guildId') guildId: string,
    @Query('count') count = '10',
  ) {
    const config = await this.eaService.getOrCreateTrackerConfig(guildId);
    const limit = Math.min(Math.max(parseInt(count, 10) || 10, 1), 20);

    const matchTypes =
      config.matchTypes && config.matchTypes.length > 0
        ? config.matchTypes
        : ['leagueMatch', 'friendlyMatch', 'playoffMatch'];

    const rawMatchesMap = new Map<string, any>();
    for (const mType of matchTypes) {
      try {
        const matches = await this.eaService.fetchMatchesRaw(
          config.clubId,
          mType,
          limit,
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

    const allMatches = Array.from(rawMatchesMap.values())
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);

    return allMatches.map((raw) => this.eaService.parseMatch(raw, config.clubId));
  }

  @Get('members')
  async getMembers(@Param('guildId') guildId: string) {
    const config = await this.eaService.getOrCreateTrackerConfig(guildId);
    return this.eaService.fetchMemberStats(
      config.clubId,
      config.platform || 'common-gen5',
    );
  }

  @Post('post-latest')
  async postLatest(
    @Param('guildId') guildId: string,
    @Body() body: { channelId?: string },
  ) {
    return this.eaPollerService.postLatestMatch(guildId, body.channelId);
  }

  @Post('poll-now')
  async pollNow(@Param('guildId') guildId: string) {
    const config = await this.eaService.getOrCreateTrackerConfig(guildId);
    return this.eaPollerService.pollGuild(config);
  }
}
