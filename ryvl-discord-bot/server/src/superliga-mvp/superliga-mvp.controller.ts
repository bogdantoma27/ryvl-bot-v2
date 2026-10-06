import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { GuildAdminGuard } from '../auth/guild-admin.guard';
import { DiscordService } from '../discord/discord.service';
import { buildSuperligaMvpEmbed } from '../discord/embeds/superliga-mvp-embed.builder';
import { SuperligaMvpService } from './superliga-mvp.service';

const optInt = (v: unknown) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Admin dashboard API. Every route needs a signed-in admin of the guild.
@Controller('api/guilds/:guildId/superliga-mvp')
@UseGuards(AuthGuard, GuildAdminGuard)
export class SuperligaMvpController {
  constructor(
    private readonly mvp: SuperligaMvpService,
    private readonly discord: DiscordService,
  ) {}

  @Get('leaderboard')
  leaderboard(@Query('season') season?: string, @Query('minMatches') minMatches?: string, @Query('limit') limit?: string) {
    return this.mvp.getLeaderboard({ season: optInt(season), minMatches: optInt(minMatches), limit: optInt(limit) ?? 100 });
  }

  @Get('matches')
  matches(@Query('season') season?: string) {
    return this.mvp.getMatches(optInt(season));
  }

  @Post('sync')
  sync() {
    return this.mvp.sync();
  }

  @Post('post')
  async post(
    @Param('guildId') guildId: string,
    @Body() body: { channelId?: string; season?: number; minMatches?: number; count?: number },
  ) {
    if (!body?.channelId) throw new BadRequestException('Choose a channel to post in');
    // Only channels of this guild: being admin here must not allow posting elsewhere.
    const channel = await this.discord.assertChannelInGuild(guildId, body.channelId);
    const board = await this.mvp.getLeaderboard({ season: optInt(body.season), minMatches: optInt(body.minMatches) });
    const message = await channel.send({ embeds: [buildSuperligaMvpEmbed(board, optInt(body.count) ?? 15)] });
    return { success: true, messageId: message.id };
  }
}
