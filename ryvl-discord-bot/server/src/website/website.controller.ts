import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { GuildAdminGuard } from '../auth/guild-admin.guard';
import {
  FixedWindowRateLimiter,
  SubmissionKind,
  clientIp,
  validateContactForm,
  validateRecruitmentForm,
} from './website-forms';
import { WebsiteSubmissionsService } from './website-submissions.service';

const TEN_MINUTES = 10 * 60 * 1000;

@Controller()
export class WebsiteController {
  // Per visitor: a few messages per form every ten minutes. Overall: a ceiling so a
  // botnet cannot flood the staff channels either.
  private readonly perIp = new FixedWindowRateLimiter(3, TEN_MINUTES);
  private readonly overall = new FixedWindowRateLimiter(60, TEN_MINUTES);

  constructor(private readonly submissions: WebsiteSubmissionsService) {}

  private rateLimit(kind: SubmissionKind, req: Request): void {
    const key = `${kind}:${clientIp(req)}`;
    if (!this.perIp.take(key) || !this.overall.take(kind)) {
      throw new HttpException(
        { success: false, message: 'Too many submissions. Please wait a few minutes and try again.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  @Post('api/public/contact')
  async submitContactForm(@Body() body: unknown, @Req() req: Request) {
    const form = validateContactForm(body);
    if (!form.ok) throw new BadRequestException({ success: false, message: form.error });
    this.rateLimit('contact', req);
    const result = await this.submissions.submit('contact', form.value);
    return {
      success: true,
      message: result.delivered
        ? 'Message delivered to RYVL management.'
        : 'Message received. RYVL management will review it shortly.',
    };
  }

  @Post('api/public/recruitment')
  async submitRecruitmentForm(@Body() body: unknown, @Req() req: Request) {
    const form = validateRecruitmentForm(body);
    if (!form.ok) throw new BadRequestException({ success: false, message: form.error });
    this.rateLimit('recruitment', req);
    const result = await this.submissions.submit('recruitment', form.value);
    return {
      success: true,
      message: result.delivered
        ? 'Trial application submitted to RYVL recruitment staff.'
        : 'Trial application received. RYVL recruitment staff will review it shortly.',
    };
  }

  @Get('api/guilds/:guildId/website-submissions')
  @UseGuards(AuthGuard, GuildAdminGuard)
  async listSubmissions(@Param('guildId') guildId: string, @Query('limit') limit?: string) {
    return this.submissions.listForGuild(guildId, limit ? parseInt(limit, 10) : 50);
  }
}
