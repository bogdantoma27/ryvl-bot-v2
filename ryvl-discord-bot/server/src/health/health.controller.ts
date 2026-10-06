import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { GuildAdminGuard } from '../auth/guild-admin.guard';
import { GuildHealth, HealthService } from './health.service';

@Controller('api/guilds')
@UseGuards(AuthGuard, GuildAdminGuard)
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Status of every background feed (pollers, schedulers) of the guild. */
  @Get(':guildId/health')
  async getHealth(@Param('guildId') guildId: string): Promise<GuildHealth> {
    return this.healthService.getGuildHealth(guildId);
  }
}
