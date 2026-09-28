import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { GuildAdminGuard } from '../auth/guild-admin.guard';
import { TotwService } from './totw.service';

@Controller('api/guilds/:guildId/vpg/totw')
export class TotwController {
  constructor(private readonly totwService: TotwService) {}

  @Get('config')
  @UseGuards(AuthGuard)
  async getConfig(
    @Param('guildId') guildId: string,
    @Query('leagueSlug') leagueSlug = 'Superliga-Romania',
  ) {
    return this.totwService.getOrCreateConfig(guildId, leagueSlug);
  }

  @Patch('config')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async updateConfig(
    @Param('guildId') guildId: string,
    @Query('leagueSlug') leagueSlug = 'Superliga-Romania',
    @Body()
    body: {
      channelId?: string | null;
      formation?: string;
      enabled?: boolean;
      cronSchedule?: string;
    },
  ) {
    return this.totwService.updateConfig(guildId, leagueSlug, body);
  }

  @Get('preview')
  @UseGuards(AuthGuard)
  async getPreview(
    @Param('guildId') guildId: string,
    @Query('leagueSlug') leagueSlug = 'Superliga-Romania',
    @Query('isTots') isTots?: string,
  ) {
    const data = await this.totwService.generateTotw(leagueSlug, isTots === 'true');
    return {
      leagueName: data.leagueName,
      season: data.season,
      week: data.week,
      isTots: data.isTots,
      players: data.players,
    };
  }

  @Get('image')
  async getImage(
    @Param('guildId') guildId: string,
    @Query('leagueSlug') leagueSlug = 'Superliga-Romania',
    @Query('isTots') isTots: string,
    @Res() res: Response,
  ) {
    const data = await this.totwService.generateTotw(leagueSlug, isTots === 'true');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(data.imageBuffer);
  }

  @Post('post')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async postToDiscord(
    @Param('guildId') guildId: string,
    @Body() body: { channelId?: string; isTots?: boolean },
  ) {
    return this.totwService.postTotwToDiscord(guildId, body.channelId, body.isTots);
  }
}
