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
import { UpdateVpgConfigDto } from './vpg.types';

@Controller()
export class VpgController {
  private readonly logger = new Logger(VpgController.name);

  constructor(
    private readonly vpgService: VpgService,
    private readonly vpgPollerService: VpgPollerService,
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
}
