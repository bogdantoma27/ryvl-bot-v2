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
      request.params?.guildId ||
      request.body?.guildId ||
      request.query?.guildId;

    if (!guildId || guildId === 'default') {
      return true;
    }

    const isAdmin = await this.discordService.checkUserIsAdmin(String(guildId), user.userId);
    if (!isAdmin) {
      throw new ForbiddenException(
        `You do not have administrative permissions for Discord server ${guildId}. Multi-server access is restricted to server administrators.`,
      );
    }

    return true;
  }
}
