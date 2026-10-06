import { fixturesOnDay } from './notification-policy';
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
import { GuildAdminGuard } from '../auth/guild-admin.guard';
import { DiscordService } from '../discord/discord.service';
import { VpgService } from './vpg.service';
import { VpgPollerService } from './vpg-poller.service';
import { VpgSuperligaPollerService } from './vpg-superliga-poller.service';
import { UpdateVpgConfigDto } from './vpg.types';
import { RyvlCommands } from '../discord/commands/ryvl-commands';
import { COMMUNITY_NAME, COMMUNITY_SLUG, SUPERLIGA_NAME } from './league.constants';

@Controller()
export class VpgController {
  private readonly logger = new Logger(VpgController.name);

  constructor(
    private readonly vpgService: VpgService,
    private readonly vpgPollerService: VpgPollerService,
    private readonly vpgSuperligaPollerService: VpgSuperligaPollerService,
    private readonly ryvlCommands: RyvlCommands,
    private readonly discordService: DiscordService,
  ) {}

  // ----------------------------------------------------
  // Public Endpoints (Accessible by all users on web)
  // ----------------------------------------------------

  @Get('api/vpg/communities')
  async getCommunities(@Query('q') q?: string) {
    const data = await this.vpgService.listCommunities(q);
    return { data };
  }

  @Get('api/vpg/communities/:communitySlug/leagues')
  async getCommunityLeagues(@Param('communitySlug') communitySlug: string) {
    const data = await this.vpgService.listCommunityLeagues(communitySlug);
    return { data };
  }

  @Get('api/vpg/leagues/search')
  async searchLeagues(@Query('q') q?: string) {
    const leagues = await this.vpgService.searchLeagues(q);
    return { leagues };
  }

  @Get('api/vpg/default')
  async getDefaultConfig() {
    const config = await this.vpgService.getDefaultConfig();
    return {
      config,
      community: {
        slug: config.communitySlug || COMMUNITY_SLUG,
        name: config.leagueName || COMMUNITY_NAME,
        league: config.leagueName || SUPERLIGA_NAME,
      },
    };
  }

  @Get('api/vpg/default/transfers')
  async getDefaultTransfers(@Query('limit') limit = '20') {
    const config = await this.vpgService.getDefaultConfig();
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const transfers = await this.vpgService.fetchTransfers(parsedLimit, 0, config.communitySlug);
    return {
      transfers,
      total: transfers.length,
    };
  }

  // Admin reads: the dashboard's transfer settings and the processed-transfer history.
  @Get('api/guilds/:guildId/vpg/config')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async getConfig(@Param('guildId') guildId: string) {
    const config = await this.vpgService.findConfigOrDefault(guildId);

    return {
      config,
      community: {
        slug: config.communitySlug || COMMUNITY_SLUG,
        name: config.leagueName || COMMUNITY_NAME,
        league: config.leagueName || SUPERLIGA_NAME,
      },
    };
  }

  @Get('api/guilds/:guildId/vpg/transfers')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async getGuildTransfers(
    @Param('guildId') guildId: string,
    @Query('limit') limit = '20',
  ) {
    const config = await this.vpgService.findConfigOrDefault(guildId);
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const transfers = await this.vpgService.fetchTransfers(parsedLimit, 0, config.communitySlug);
    const processed = await this.vpgService.getRecentProcessedTransfers(guildId, 25);

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
    return { seasons, latest: seasons[0] };
  }

  @Get('api/vpg/superliga/standings')
  async getSuperligaStandings(@Query('season') season?: string) {
    const parsedSeason = (season ? parseInt(season, 10) : 0) || (await this.vpgService.fetchLatestSeason());
    const standings = await this.vpgService.fetchStandings(parsedSeason);
    return {
      season: parsedSeason,
      standings,
      total: standings.length,
    };
  }

  @Get('api/vpg/superliga/fixtures')
  async getSuperligaFixtures(
    @Query('season') season?: string,
    @Query('limit') limit = '20',
  ) {
    const parsedSeason = (season ? parseInt(season, 10) : 0) || (await this.vpgService.fetchLatestSeason());
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const fixtures = await this.vpgService.fetchMatches('scheduled', parsedSeason, parsedLimit);
    return {
      season: parsedSeason,
      fixtures,
      total: fixtures.length,
    };
  }

  @Get('api/vpg/superliga/results')
  async getSuperligaResults(
    @Query('season') season?: string,
    @Query('limit') limit = '20',
  ) {
    const parsedSeason = (season ? parseInt(season, 10) : 0) || (await this.vpgService.fetchLatestSeason());
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const { results } = await this.vpgService.getResults({ season: parsedSeason, limit: parsedLimit });
    return {
      season: parsedSeason,
      results,
      total: results.length,
    };
  }

  @Get('api/vpg/superliga/today')
  async getTodayMatches() {
    const season = await this.vpgService.fetchLatestSeason();
    const date = this.vpgService.leagueToday();
    const [today, fixtures] = await Promise.all([
      this.vpgService.getResults({ season, day: date }),
      this.vpgService.fetchAllMatches('scheduled', season),
    ]);
    // Oldest first, as the day's schedule reads.
    const results = today.results.reverse();
    return { date, season, results, fixtures: fixturesOnDay(fixtures, date), updatedAt: new Date().toISOString() };
  }

  @Get('api/vpg/superliga/leaderboard')
  async getSuperligaLeaderboard(
    @Query('category') category: 'strikers' | 'cam' | 'gk' | 'cb' | 'cdm' | 'wingers' = 'strikers',
    @Query('season') season?: string,
  ) {
    const parsedSeason = (season ? parseInt(season, 10) : 0) || (await this.vpgService.fetchLatestSeason());
    const entries = await this.vpgService.fetchLeaderboard(category, parsedSeason);
    return {
      category,
      season: parsedSeason,
      leaderboard: entries,
      total: entries.length,
    };
  }

  // ----------------------------------------------------
  // Protected Admin Endpoints (signed in + admin of :guildId)
  // ----------------------------------------------------

  @Patch('api/guilds/:guildId/vpg/config')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async updateConfig(
    @Param('guildId') guildId: string,
    @Body() dto: UpdateVpgConfigDto,
  ) {
    if (dto.channelId) await this.discordService.assertChannelInGuild(guildId, dto.channelId);
    const updated = await this.vpgService.updateConfig(guildId, dto);
    this.logger.log(`Updated VPG transfer config for guild ${guildId}`);
    return {
      success: true,
      config: updated,
    };
  }

  @Post('api/guilds/:guildId/vpg/poll-now')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async triggerPollNow(@Param('guildId') guildId: string) {
    const result = await this.vpgPollerService.checkGuildNow(guildId);
    return {
      success: true,
      postedCount: result.postedCount,
    };
  }

  @Post('api/guilds/:guildId/vpg/post-latest')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async postLatestNow(@Param('guildId') guildId: string) {
    const result = await this.vpgPollerService.postLatestToDiscord(guildId);
    return {
      success: true,
      messageId: result.messageId,
    };
  }

  @Post('api/guilds/:guildId/vpg/superliga/poll-now')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async triggerSuperligaPollNow(@Param('guildId') guildId: string) {
    const result = await this.vpgSuperligaPollerService.checkGuildNow(guildId);
    return {
      success: true,
      postedCount: result.postedCount,
    };
  }

  @Post('api/guilds/:guildId/vpg/superliga/post-standings')
  @UseGuards(AuthGuard, GuildAdminGuard)
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
  @UseGuards(AuthGuard, GuildAdminGuard)
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
  @UseGuards(AuthGuard, GuildAdminGuard)
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

  // ----------------------------------------------------
  // RYVL Team Performance & Multi-Competition Endpoints
  // ----------------------------------------------------

  @Get('api/vpg/performance')
  async getRyvlPerformance(
    @Query('guildId') guildId?: string,
    @Query('competition') competition?: string,
  ) {
    return this.vpgService.getRyvlPerformance(guildId, competition);
  }

  @Get('api/guilds/:guildId/vpg/competitions')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async getGuildCompetitions(@Param('guildId') guildId: string) {
    const competitions = await this.vpgService.getCompetitions(guildId);
    return { competitions };
  }

  @Patch('api/guilds/:guildId/vpg/competitions/:id')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async updateGuildCompetition(
    @Param('guildId') guildId: string,
    @Param('id') compId: string,
    @Body() body: any,
  ) {
    const updated = await this.vpgService.upsertCompetition(guildId, compId, body);
    return { success: true, competition: updated };
  }

  @Post('api/guilds/:guildId/vpg/performance/post-results')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async postRyvlResults(
    @Param('guildId') guildId: string,
    @Body() body: { channelId?: string },
  ) {
    return this.ryvlCommands.postRyvlResultsToChannel(guildId, body.channelId);
  }

  @Post('api/guilds/:guildId/vpg/performance/post-fixtures')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async postRyvlFixtures(
    @Param('guildId') guildId: string,
    @Body() body: { channelId?: string },
  ) {
    return this.ryvlCommands.postRyvlFixturesToChannel(guildId, body.channelId);
  }

  @Post('api/guilds/:guildId/vpg/performance/post-leaderboard')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async postRyvlLeaderboard(
    @Param('guildId') guildId: string,
    @Body() body: { channelId?: string },
  ) {
    return this.ryvlCommands.postRyvlLeaderboardToChannel(guildId, body.channelId);
  }
}
