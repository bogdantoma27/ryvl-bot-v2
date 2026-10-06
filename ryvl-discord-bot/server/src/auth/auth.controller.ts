import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService, JwtPayload } from './auth.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './user.decorator';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  OAUTH_STATE_COOKIE,
  createOAuthState,
  parseCookies,
  stateCookieOptions,
  verifyOAuthState,
} from './oauth-state';

@Controller('api/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('discord/start')
  startDiscordAuth(
    @Query('origin') origin: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const ref = origin || req.headers.referer || '';
    const isBot = origin === 'bot' || ref.includes('bot.') || (req.headers.host || '').startsWith('bot.');
    const { state, nonce } = createOAuthState(isBot ? 'bot' : 'web');
    res.cookie(
      OAUTH_STATE_COOKIE,
      nonce,
      stateCookieOptions(this.configService.discordOauthRedirectUri, req.headers.host),
    );
    res.redirect(this.authService.getDiscordAuthUrl(state));
  }

  @Get('discord/callback')
  async handleDiscordCallback(
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const origin = verifyOAuthState(state, parseCookies(req.headers.cookie)[OAUTH_STATE_COOKIE]);
    // One-time nonce: clear it whatever happens next (host-only and parent-domain variants).
    const { maxAge: _maxAge, domain: _domain, ...cookieOptions } = stateCookieOptions(
      this.configService.discordOauthRedirectUri,
      req.headers.host,
    );
    res.clearCookie(OAUTH_STATE_COOKIE, cookieOptions);
    res.clearCookie(OAUTH_STATE_COOKIE, { ...cookieOptions, domain: new URL(this.configService.discordOauthRedirectUri).hostname });

    let frontendUrl = this.configService.frontendUrl;
    if (origin === 'bot') {
      frontendUrl = frontendUrl.replace('://', '://bot.');
    }
    // OAuth belongs to the staff console, not the public homepage. These are
    // fixed local paths; no user-supplied return URL can become an open redirect.
    const loginUrl = new URL('/admin/login', frontendUrl).toString();
    const dashboardUrl = new URL('/admin/dashboard', frontendUrl).toString();

    if (error || !code) {
      this.logger.warn(`Discord OAuth error: ${error || 'missing_code'}`);
      res.redirect(`${loginUrl}?error=${encodeURIComponent(error || 'missing_code')}`);
      return;
    }

    if (!origin) {
      this.logger.warn('Discord OAuth callback rejected: state does not match this browser');
      res.redirect(`${loginUrl}?error=invalid_state`);
      return;
    }

    try {
      const { user, guilds } = await this.authService.exchangeCode(code);

      // Find mutual guilds stored in DB where bot is installed
      const existingGuilds = await this.prisma.guild.findMany({
        select: { id: true },
      });
      const existingGuildIds = new Set(existingGuilds.map((g) => g.id));
      const mutualGuilds = guilds.filter((g) => existingGuildIds.has(g.id));

      let avatarUrl: string;
      if (user.avatar) {
        avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
      } else {
        const defaultIndex = (BigInt(user.id) >> 22n) % 6n;
        avatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
      }

      const displayName = user.global_name || user.username;

      const token = this.authService.signJwt({
        userId: user.id,
        username: displayName,
        avatar: avatarUrl,
        guildId: mutualGuilds[0]?.id,
      });

      this.logger.log(`Discord user authenticated: ${displayName} (${user.id})`);
      res.redirect(`${dashboardUrl}?token=${encodeURIComponent(token)}`);
    } catch (err) {
      this.logger.error(`Discord OAuth token exchange failed: ${err}`);
      res.redirect(`${loginUrl}?error=auth_failed`);
    }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  getCurrentUser(@CurrentUser() user: JwtPayload) {
    return {
      authenticated: true,
      user: {
        id: user.userId,
        username: user.username,
        global_name: user.username,
        avatar: user.avatar,
        avatar_url: user.avatar,
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(): { success: boolean; message: string } {
    return { success: true, message: 'Logged out successfully' };
  }
}
