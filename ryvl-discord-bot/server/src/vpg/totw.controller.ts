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
import { SUPERLIGA_LEAGUE_SLUG } from './league.constants';
import { TtlCache } from './ttl-cache';

/** How long a rendered public TOTW image is reused (VPG league data is cached 45 s). */
export const TOTW_IMAGE_CACHE_TTL_MS = 60 * 1000;

@Controller('api/guilds/:guildId/vpg/totw')
export class TotwController {
  // The image route is public: without this, every anonymous request rendered a new
  // PNG with sharp and downloaded twelve avatars. Concurrent requests share one render.
  private readonly imageCache = new TtlCache<Buffer>(TOTW_IMAGE_CACHE_TTL_MS, 20);

  constructor(private readonly totwService: TotwService) {}

  @Get('config')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async getConfig(
    @Param('guildId') guildId: string,
    @Query('leagueSlug') leagueSlug = SUPERLIGA_LEAGUE_SLUG,
  ) {
    return this.totwService.getConfig(guildId, leagueSlug);
  }

  @Patch('config')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async updateConfig(
    @Param('guildId') guildId: string,
    @Query('leagueSlug') leagueSlug = SUPERLIGA_LEAGUE_SLUG,
    @Body()
    body: {
      channelId?: string | null;
      formation?: string;
      enabled?: boolean;
      cronSchedule?: string | null;
    },
  ) {
    return this.totwService.updateConfig(guildId, leagueSlug, body);
  }

  @Get('preview')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async getPreview(
    @Param('guildId') guildId: string,
    @Query('leagueSlug') leagueSlug = SUPERLIGA_LEAGUE_SLUG,
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

  // Public on purpose: the dashboard loads it through <img src>, which cannot send a
  // bearer token, and it only renders public VPG data without touching the database.
  @Get('image')
  async getImage(
    @Param('guildId') guildId: string,
    @Query('leagueSlug') leagueSlug = SUPERLIGA_LEAGUE_SLUG,
    @Query('isTots') isTots: string,
    @Res() res: Response,
  ) {
    const tots = isTots === 'true';
    const slug = leagueSlug || SUPERLIGA_LEAGUE_SLUG;
    const image = await this.imageCache.getOrLoad(`${slug}:${tots}`, async () =>
      (await this.totwService.generateTotw(slug, tots)).imageBuffer,
    );
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.send(image);
  }

  @Post('post')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async postToDiscord(
    @Param('guildId') guildId: string,
    @Body() body: { channelId?: string; isTots?: boolean; leagueSlug?: string },
  ) {
    return this.totwService.postTotwToDiscord(guildId, body.channelId, body.isTots, body.leagueSlug || SUPERLIGA_LEAGUE_SLUG);
  }
}
