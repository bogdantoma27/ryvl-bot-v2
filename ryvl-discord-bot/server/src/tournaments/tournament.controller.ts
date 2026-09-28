import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { GuildAdminGuard } from '../auth/guild-admin.guard';
import { TournamentService } from './tournament.service';
import { TournamentRendererService } from './tournament-renderer.service';

@Controller('api/guilds/:guildId/tournaments')
export class TournamentController {
  constructor(
    private readonly tournamentService: TournamentService,
    private readonly renderer: TournamentRendererService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async listTournaments(@Param('guildId') guildId: string) {
    return this.tournamentService.listTournaments(guildId);
  }

  @Post()
  @UseGuards(AuthGuard, GuildAdminGuard)
  async createTournament(
    @Param('guildId') guildId: string,
    @Body() body: { name: string; formation?: string; numTeams?: number },
  ) {
    return this.tournamentService.createTournament(guildId, body);
  }

  @Get(':tournamentId')
  @UseGuards(AuthGuard)
  async getTournament(@Param('tournamentId') tournamentId: string) {
    return this.tournamentService.getTournament(tournamentId);
  }

  @Post(':tournamentId/provision-discord')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async provisionDiscord(
    @Param('guildId') guildId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentService.setupTournamentChannels(guildId, tournamentId);
  }

  @Post(':tournamentId/signups')
  @UseGuards(AuthGuard)
  async addSignup(
    @Param('tournamentId') tournamentId: string,
    @Body() body: { userId: string; displayName: string; gamertag: string; pos1: string; pos2?: string; notes?: string },
  ) {
    return this.tournamentService.addSignup(tournamentId, body);
  }

  @Delete(':tournamentId/signups/:userId')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async removeSignup(
    @Param('tournamentId') tournamentId: string,
    @Param('userId') userId: string,
  ) {
    return this.tournamentService.removeSignup(tournamentId, userId);
  }

  @Post(':tournamentId/results')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async recordResult(
    @Param('tournamentId') tournamentId: string,
    @Body() body: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number },
  ) {
    return this.tournamentService.recordMatchResult(tournamentId, body);
  }

  @Get(':tournamentId/standings-image')
  async getStandingsImage(
    @Param('tournamentId') tournamentId: string,
    @Res() res: Response,
  ) {
    const t = await this.tournamentService.getTournament(tournamentId);
    const rows = this.tournamentService.calculateStandings(t);
    const buffer = await this.renderer.renderStandingsPng(t.name, rows);
    res.setHeader('Content-Type', 'image/png');
    return res.send(buffer);
  }

  @Post(':tournamentId/finalize-bracket')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async finalizeBracket(
    @Param('guildId') guildId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentService.finalizeTournamentBracket(tournamentId);
  }
}
