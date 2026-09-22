import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import {
  LineupService,
  LineupRenderDto,
  LineupPostDto,
  LineupDraftPayload,
} from './lineup.service';

@Controller('api/guilds/:guildId/lineup')
export class LineupController {
  constructor(private readonly lineupService: LineupService) {}

  @Get('formations')
  listFormations() {
    return this.lineupService.listFormations();
  }

  @Post('render')
  async renderLineup(
    @Body() dto: LineupRenderDto,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    if (format === 'png') {
      const png = await this.lineupService.renderPng(dto);
      res.setHeader('Content-Type', 'image/png');
      return res.send(png);
    }

    if (format === 'svg-raw') {
      const svg = this.lineupService.renderSvg(dto);
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(svg);
    }

    // Default JSON with SVG content
    const svg = this.lineupService.renderSvg(dto);
    return res.json({ svg });
  }

  @Post('post')
  @UseGuards(AuthGuard)
  async postLineup(
    @Param('guildId') guildId: string,
    @Body() dto: LineupPostDto,
  ) {
    return this.lineupService.postLineup(guildId, dto);
  }

  @Get('drafts')
  @UseGuards(AuthGuard)
  async listDrafts(@Param('guildId') guildId: string) {
    return this.lineupService.listDrafts(guildId);
  }

  @Get('drafts/:draftId')
  @UseGuards(AuthGuard)
  async getDraft(
    @Param('guildId') guildId: string,
    @Param('draftId') draftId: string,
  ) {
    return this.lineupService.getDraft(guildId, draftId);
  }

  @Post('drafts')
  async createDraft(
    @Param('guildId') guildId: string,
    @CurrentUser() user: JwtPayload,
    @Body() payload: LineupDraftPayload,
  ) {
    return this.lineupService.createDraft(guildId, user.userId, payload);
  }

  @Patch('drafts/:draftId')
  async updateDraft(
    @Param('guildId') guildId: string,
    @Param('draftId') draftId: string,
    @Body() payload: LineupDraftPayload,
  ) {
    return this.lineupService.updateDraft(guildId, draftId, payload);
  }

  @Delete('drafts/:draftId')
  async deleteDraft(
    @Param('guildId') guildId: string,
    @Param('draftId') draftId: string,
  ) {
    return this.lineupService.deleteDraft(guildId, draftId);
  }
}
