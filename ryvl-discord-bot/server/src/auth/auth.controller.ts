import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService, JwtPayload } from './auth.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './user.decorator';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('discord/start')
  startDiscordAuth(@Res() res: Response): void {
    const authUrl = this.authService.getDiscordAuthUrl();
    res.redirect(authUrl);
  }

  @Get('discord/callback')
  async handleDiscordCallback(
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = this.configService.frontendUrl;
    // OAuth belongs to the staff console, not the public homepage. These are
    // fixed local paths; no user-supplied return URL can become an open redirect.
    const loginUrl = new URL('/admin/login', frontendUrl).toString();
    const dashboardUrl = new URL('/admin/dashboard', frontendUrl).toString();

    if (error || !code) {
      this.logger.warn(`Discord OAuth error: ${error || 'missing_code'}`);
      res.redirect(`${loginUrl}?error=${encodeURIComponent(error || 'missing_code')}`);
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
