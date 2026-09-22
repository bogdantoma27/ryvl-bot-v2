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
import { VpgService } from './vpg.service';
import { VpgPollerService } from './vpg-poller.service';
import { VpgSuperligaPollerService } from './vpg-superliga-poller.service';
import { UpdateVpgConfigDto } from './vpg.types';

@Controller()
export class VpgController {
  private readonly logger = new Logger(VpgController.name);

  constructor(
    private readonly vpgService: VpgService,
    private readonly vpgPollerService: VpgPollerService,
    private readonly vpgSuperligaPollerService: VpgSuperligaPollerService,
  ) {}

  // ----------------------------------------------------
  // Public Endpoints (Accessible by all users on web)
  // ----------------------------------------------------

  @Get('api/vpg/default')
  async getDefaultConfig() {
    const config = await this.vpgService.getDefaultConfig();
    return {
      config,
      community: {
        slug: 'VPGRoPS5',
        name: 'VPG Romania',
        league: 'Superliga România',
      },
    };
  }

  @Get('api/vpg/default/transfers')
  async getDefaultTransfers(@Query('limit') limit = '20') {
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const transfers = await this.vpgService.fetchTransfers(parsedLimit, 0);
    return {
      transfers,
      total: transfers.length,
    };
  }

  @Get('api/guilds/:guildId/vpg/config')
  async getConfig(@Param('guildId') guildId: string) {
    const config =
      guildId === 'default'
        ? await this.vpgService.getDefaultConfig()
        : await this.vpgService.getOrCreateConfig(guildId);

    return {
      config,
      community: {
        slug: 'VPGRoPS5',
        name: 'VPG Romania',
        league: 'Superliga România',
      },
    };
  }

  @Get('api/guilds/:guildId/vpg/transfers')
  async getGuildTransfers(
    @Param('guildId') guildId: string,
    @Query('limit') limit = '20',
  ) {
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const transfers = await this.vpgService.fetchTransfers(parsedLimit, 0);
    const processed =
      guildId !== 'default'
        ? await this.vpgService.getRecentProcessedTransfers(guildId, 25)
        : [];

    return {
      transfers,
      processedHistory: processed,
      total: transfers.length,
    };
  }

  // ----------------------------------------------------
  // Public Superliga Endpoints (For Organization Website)
  // ----------------------------------------------------

  @Get('api/vpg/superliga/seasons')
  async getSuperligaSeasons() {
    const seasons = await this.vpgService.fetchSeasons();
    const latest = await this.vpgService.fetchLatestSeason();
    return { seasons, latest };
  }

  @Get('api/vpg/superliga/standings')
  async getSuperligaStandings(@Query('season') season?: string) {
    const parsedSeason = season ? parseInt(season, 10) : undefined;
    const standings = await this.vpgService.fetchStandings(parsedSeason);
    return {
      season: parsedSeason || (await this.vpgService.fetchLatestSeason()),
      standings,
      total: standings.length,
    };
  }

  @Get('api/vpg/superliga/fixtures')
  async getSuperligaFixtures(
    @Query('season') season?: string,
    @Query('limit') limit = '20',
  ) {
    const parsedSeason = season ? parseInt(season, 10) : undefined;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const fixtures = await this.vpgService.fetchMatches('scheduled', parsedSeason, parsedLimit);
    return {
      season: parsedSeason || (await this.vpgService.fetchLatestSeason()),
      fixtures,
      total: fixtures.length,
    };
  }

  @Get('api/vpg/superliga/results')
  async getSuperligaResults(
    @Query('season') season?: string,
    @Query('limit') limit = '20',
  ) {
    const parsedSeason = season ? parseInt(season, 10) : undefined;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const results = await this.vpgService.fetchMatches('complete', parsedSeason, parsedLimit);
    return {
      season: parsedSeason || (await this.vpgService.fetchLatestSeason()),
      results,
      total: results.length,
    };
  }

  @Get('api/vpg/superliga/leaderboard')
  async getSuperligaLeaderboard(
    @Query('category') category: 'strikers' | 'cam' | 'gk' | 'cb' | 'cdm' | 'wingers' = 'strikers',
    @Query('season') season?: string,
  ) {
    const parsedSeason = season ? parseInt(season, 10) : undefined;
    const entries = await this.vpgService.fetchLeaderboard(category, parsedSeason);
    return {
      category,
      season: parsedSeason || (await this.vpgService.fetchLatestSeason()),
      leaderboard: entries,
      total: entries.length,
    };
  }

  // ----------------------------------------------------
  // Protected Admin Endpoints (Require AuthGuard)
  // ----------------------------------------------------

  @Patch('api/guilds/:guildId/vpg/config')
  @UseGuards(AuthGuard)
  async updateConfig(
    @Param('guildId') guildId: string,
    @Body() dto: UpdateVpgConfigDto,
  ) {
    const updated = await this.vpgService.updateConfig(guildId, dto);
    this.logger.log(`Updated VPG transfer config for guild ${guildId}`);
    return {
      success: true,
      config: updated,
    };
  }

  @Post('api/guilds/:guildId/vpg/poll-now')
  @UseGuards(AuthGuard)
  async triggerPollNow(@Param('guildId') guildId: string) {
    const result = await this.vpgPollerService.checkGuildNow(guildId);
    return {
      success: true,
      postedCount: result.postedCount,
    };
  }

  @Post('api/guilds/:guildId/vpg/post-latest')
  @UseGuards(AuthGuard)
  async postLatestNow(@Param('guildId') guildId: string) {
    const result = await this.vpgPollerService.postLatestToDiscord(guildId);
    return {
      success: true,
      messageId: result.messageId,
    };
  }

  @Post('api/guilds/:guildId/vpg/superliga/poll-now')
  @UseGuards(AuthGuard)
  async triggerSuperligaPollNow(@Param('guildId') guildId: string) {
    const result = await this.vpgSuperligaPollerService.checkGuildNow(guildId);
    return {
      success: true,
      postedCount: result.postedCount,
    };
  }

  @Post('api/guilds/:guildId/vpg/superliga/post-standings')
  @UseGuards(AuthGuard)
  async postSuperligaStandings(
    @Param('guildId') guildId: string,
    @Body() body: { channelId?: string; season?: number },
  ) {
    const result = await this.vpgSuperligaPollerService.postStandingsToChannel(
      guildId,
      body.channelId,
      body.season,
    );
    return result;
  }

  @Post('api/guilds/:guildId/vpg/superliga/post-fixtures')
  @UseGuards(AuthGuard)
  async postSuperligaFixtures(
    @Param('guildId') guildId: string,
    @Body() body: { channelId?: string; season?: number },
  ) {
    const result = await this.vpgSuperligaPollerService.postFixturesToChannel(
      guildId,
      body.channelId,
      body.season,
    );
    return result;
  }

  @Post('api/guilds/:guildId/vpg/superliga/post-results')
  @UseGuards(AuthGuard)
  async postSuperligaResults(
    @Param('guildId') guildId: string,
    @Body() body: { channelId?: string; season?: number },
  ) {
    const result = await this.vpgSuperligaPollerService.postResultsToChannel(
      guildId,
      body.channelId,
      body.season,
    );
    return result;
  }
}
