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
    const roster: any[] = [];
    const posKeys = ['st', 'cam', 'lm', 'cm', 'rm', 'cdm', 'cb', 'gk', 'sub'];
    for (const key of posKeys) {
      const arr = (data.players as any)[key] || [];
      for (const p of arr) {
        roster.push({
          targetPosition: key.toUpperCase(),
          gamertag: p.display_name || p.username || 'Player',
          club: p.team_name || 'Free Agent',
          gamesPlayed: p.matches_played || 0,
          goals: p.goals || 0,
          assists: p.assists || 0,
          averageRating: p.rating ? Number(p.rating).toFixed(1) : '-',
          manOfTheMatch: p.motm || 0,
          cleanSheets: p.clean_sheets || 0,
          avatarUrl: p.avatar_url,
        });
      }
    }

    return {
      leagueName: data.leagueName,
      season: data.season,
      week: data.week,
      isTots: data.isTots,
      players: data.players,
      roster,
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
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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
