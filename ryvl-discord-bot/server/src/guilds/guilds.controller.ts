import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { GuildsService, UserGuildItem, GuildBootstrapData, GuildSettingsPatch } from './guilds.service';
import { AuthGuard } from '../auth/auth.guard';
import { GuildAdminGuard } from '../auth/guild-admin.guard';
import { CurrentUser } from '../auth/user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('api/guilds')
@UseGuards(AuthGuard, GuildAdminGuard)
export class GuildsController {
  constructor(private readonly guildsService: GuildsService) {}

  @Get()
  async listUserGuilds(
    @CurrentUser() user: JwtPayload,
  ): Promise<UserGuildItem[]> {
    return this.guildsService.listUserGuilds(user.userId);
  }

  @Get(':guildId/bootstrap')
  async getBootstrapData(
    @Param('guildId') guildId: string,
  ): Promise<GuildBootstrapData> {
    return this.guildsService.getBootstrapData(guildId);
  }

  @Get(':guildId/members')
  async getMembers(@Param('guildId') guildId: string) {
    return this.guildsService.getMembers(guildId);
  }

  @Get(':guildId/settings')
  async getSettings(@Param('guildId') guildId: string) {
    return this.guildsService.getSettings(guildId);
  }

  @Patch(':guildId/settings')
  async updateSettings(
    @Param('guildId') guildId: string,
    @Body() body: GuildSettingsPatch,
  ) {
    return this.guildsService.updateSettings(guildId, body);
  }
}

