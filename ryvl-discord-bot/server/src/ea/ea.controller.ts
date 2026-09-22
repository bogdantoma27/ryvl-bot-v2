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

@Controller()
export class EaController {
  private readonly logger = new Logger(EaController.name);

  constructor(
    private readonly eaService: EaService,
    private readonly eaPollerService: EaPollerService,
  ) {}

  // ----------------------------------------------------
  // Public Endpoints (Accessible by all users on web)
  // ----------------------------------------------------

  @Get('api/ea/default')
  async getDefaultConfig() {
    const config = await this.eaService.getDefaultTrackerConfig();
    return this.getConfig(config.guildId);
  }

  @Get('api/ea/default/matches')
  async getDefaultMatches(@Query('count') count = '10') {
    const config = await this.eaService.getDefaultTrackerConfig();
    return this.getRecentMatches(config.guildId, count);
  }

  @Get('api/ea/default/members')
  async getDefaultMembers() {
    const config = await this.eaService.getDefaultTrackerConfig();
    return this.getMembers(config.guildId);
  }

  @Get('api/public/roster')
  async getPublicRoster(
    @Query('clubId') clubId?: string,
    @Query('platform') platform = 'common-gen5',
  ) {
    return this.eaService.getPublicRoster(platform, clubId);
  }

  @Get('api/guilds/:guildId/ea/config')
  async getConfig(@Param('guildId') guildId: string) {
    const config =
      guildId === 'default'
        ? await this.eaService.getDefaultTrackerConfig()
        : await this.eaService.getOrCreateTrackerConfig(guildId);

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

  @Get('api/guilds/:guildId/ea/matches')
  async getRecentMatches(
    @Param('guildId') guildId: string,
    @Query('count') count = '10',
  ) {
    const config =
      guildId === 'default'
        ? await this.eaService.getDefaultTrackerConfig()
        : await this.eaService.getOrCreateTrackerConfig(guildId);

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

  @Get('api/guilds/:guildId/ea/members')
  async getMembers(@Param('guildId') guildId: string) {
    const config =
      guildId === 'default'
        ? await this.eaService.getDefaultTrackerConfig()
        : await this.eaService.getOrCreateTrackerConfig(guildId);

    return this.eaService.fetchMemberStats(
      config.clubId,
      config.platform || 'common-gen5',
    );
  }

  // ----------------------------------------------------
  // Protected Admin Actions (Requires AuthGuard)
  // ----------------------------------------------------

  @Patch('api/guilds/:guildId/ea/config')
  @UseGuards(AuthGuard)
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

  @Get('api/guilds/:guildId/ea/search')
  @UseGuards(AuthGuard)
  async searchClubs(
    @Query('query') query: string,
    @Query('platform') platform = 'common-gen5',
  ) {
    if (!query || !query.trim()) return [];
    return this.eaService.searchClubs(query.trim(), platform);
  }

  @Post('api/guilds/:guildId/ea/post-latest')
  @UseGuards(AuthGuard)
  async postLatest(
    @Param('guildId') guildId: string,
    @Body() body: { channelId?: string },
  ) {
    return this.eaPollerService.postLatestMatch(guildId, body.channelId);
  }

  @Post('api/guilds/:guildId/ea/poll-now')
  @UseGuards(AuthGuard)
  async pollNow(@Param('guildId') guildId: string) {
    const config = await this.eaService.getOrCreateTrackerConfig(guildId);
    return this.eaPollerService.pollGuild(config);
  }
}
