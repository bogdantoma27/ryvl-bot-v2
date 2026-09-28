import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscordModule } from '../discord/discord.module';
import { AuthModule } from '../auth/auth.module';
import { TournamentService } from './tournament.service';
import { TournamentRendererService } from './tournament-renderer.service';
import { TournamentController } from './tournament.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    forwardRef(() => DiscordModule),
  ],
  providers: [
    TournamentService,
    TournamentRendererService,
  ],
  controllers: [TournamentController],
  exports: [
    TournamentService,
    TournamentRendererService,
  ],
})
export class TournamentModule {}
