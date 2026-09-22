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

    if (error || !code) {
      this.logger.warn(`Discord OAuth error: ${error || 'missing_code'}`);
      res.redirect(`${frontendUrl}?error=${encodeURIComponent(error || 'missing_code')}`);
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
      res.redirect(`${frontendUrl}?token=${encodeURIComponent(token)}`);
    } catch (err) {
      this.logger.error(`Discord OAuth token exchange failed: ${err}`);
      res.redirect(`${frontendUrl}?error=auth_failed`);
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
