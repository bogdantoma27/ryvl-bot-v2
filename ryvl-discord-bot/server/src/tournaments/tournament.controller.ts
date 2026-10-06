import {
  Controller,
  Get,
  Post,
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

// Every route is scoped by :guildId, so a server admin can only see and change that
// server's tournaments.
@Controller('api/guilds/:guildId/tournaments')
export class TournamentController {
  constructor(
    private readonly tournamentService: TournamentService,
    private readonly renderer: TournamentRendererService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async listTournaments(@Param('guildId') guildId: string) {
    const list = await this.tournamentService.listTournaments(guildId);
    return list.map((t) => this.tournamentService.toDto(t));
  }

  @Post()
  @UseGuards(AuthGuard, GuildAdminGuard)
  async createTournament(
    @Param('guildId') guildId: string,
    @Body() body: { name: string; type?: string; formation?: string },
  ) {
    const t = await this.tournamentService.createTournament(guildId, body);
    return this.tournamentService.toDto(t);
  }

  @Get(':tournamentId')
  @UseGuards(AuthGuard)
  async getTournament(@Param('guildId') guildId: string, @Param('tournamentId') tournamentId: string) {
    return this.tournamentService.toDto(await this.tournamentService.getTournament(tournamentId, guildId));
  }

  @Post(':tournamentId/provision-discord')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async provisionDiscord(@Param('guildId') guildId: string, @Param('tournamentId') tournamentId: string) {
    return this.tournamentService.setupTournamentChannels(guildId, tournamentId);
  }

  @Post(':tournamentId/refresh-discord')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async refreshDiscord(@Param('guildId') guildId: string, @Param('tournamentId') tournamentId: string) {
    return this.tournamentService.toDto(await this.tournamentService.refreshTournamentEmbeds(tournamentId, guildId));
  }

  @Post(':tournamentId/toggle-signups')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async toggleSignups(@Param('guildId') guildId: string, @Param('tournamentId') tournamentId: string) {
    return this.tournamentService.toDto(await this.tournamentService.toggleSignups(tournamentId, guildId));
  }

  /** Closes signups and starts play: bracket + fixtures (standard) or the draft (draft). */
  @Post(':tournamentId/start')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async start(@Param('guildId') guildId: string, @Param('tournamentId') tournamentId: string) {
    const res = await this.tournamentService.startTournament(tournamentId, guildId);
    return { tournament: this.tournamentService.toDto(res.tournament), message: res.message };
  }

  @Post(':tournamentId/draft/auto')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async autoDraft(@Param('guildId') guildId: string, @Param('tournamentId') tournamentId: string) {
    return this.tournamentService.toDto(await this.tournamentService.autoDraftRemaining(tournamentId, guildId));
  }

  @Post(':tournamentId/signups')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async addSignup(
    @Param('guildId') guildId: string,
    @Param('tournamentId') tournamentId: string,
    @Body()
    body: { userId: string; displayName: string; gamertag: string; teamName?: string; pos1?: string; pos2?: string; notes?: string },
  ) {
    const t = await this.tournamentService.addSignup(tournamentId, body, { guildId, byAdmin: true });
    return this.tournamentService.toDto(t);
  }

  @Delete(':tournamentId/signups/:userId')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async removeSignup(
    @Param('guildId') guildId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('userId') userId: string,
  ) {
    return this.tournamentService.toDto(await this.tournamentService.removeSignup(tournamentId, userId, guildId));
  }

  @Post(':tournamentId/results')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async recordResult(
    @Param('guildId') guildId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() body: { matchId?: string; homeTeam?: string; awayTeam?: string; homeScore: number; awayScore: number },
  ) {
    const res = await this.tournamentService.recordMatchResult(tournamentId, body, guildId);
    return { tournament: this.tournamentService.toDto(res.tournament), match: res.match, completed: res.completed };
  }

  // Unauthenticated so it can be used as an <img> source; still limited to the server's own tournament.
  @Get(':tournamentId/standings-image')
  async getStandingsImage(
    @Param('guildId') guildId: string,
    @Param('tournamentId') tournamentId: string,
    @Res() res: Response,
  ) {
    const t = await this.tournamentService.getTournament(tournamentId, guildId);
    const buffer = await this.renderer.renderStandingsPng(t.name, this.tournamentService.calculateStandings(t));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(buffer);
  }

  /** Kept for older dashboard builds; `start` does the same for both tournament types. */
  @Post(':tournamentId/finalize-bracket')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async finalizeBracket(@Param('guildId') guildId: string, @Param('tournamentId') tournamentId: string) {
    const res = await this.tournamentService.startTournament(tournamentId, guildId);
    return { tournament: this.tournamentService.toDto(res.tournament), message: res.message };
  }
}
