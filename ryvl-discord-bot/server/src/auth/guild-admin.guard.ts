import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DiscordService } from '../discord/discord.service';
import { AuthenticatedRequest } from './auth.guard';

const SNOWFLAKE = /^\d{17,20}$/;

/**
 * Requires AuthGuard first. Allows the request only when the signed-in user is the owner
 * of, or has Administrator / Manage Server in, the Discord server named by the route's
 * :guildId (or a guildId in the body/query for routes without one). Routes that name no
 * guild at all (e.g. GET /api/guilds) pass; there is no placeholder guild such as
 * 'default': public reads of the default club live under /api/ea/default and
 * /api/vpg/default and need no guard.
 */
@Injectable()
export class GuildAdminGuard implements CanActivate {
  constructor(
    @Inject(forwardRef(() => DiscordService))
    private readonly discordService: DiscordService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) return false;

    const guildId =
      request.params?.guildId ??
      request.body?.guildId ??
      request.query?.guildId;

    if (guildId === undefined || guildId === null || guildId === '') {
      return true;
    }

    if (typeof guildId !== 'string' || !SNOWFLAKE.test(guildId)) {
      throw new ForbiddenException('Unknown Discord server');
    }

    const isAdmin = await this.discordService.checkUserIsAdmin(guildId, user.userId);
    if (!isAdmin) {
      throw new ForbiddenException(
        `You do not have administrative permissions for Discord server ${guildId}. Multi-server access is restricted to server administrators.`,
      );
    }

    return true;
  }
}
