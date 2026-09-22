import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscordModule } from '../discord/discord.module';
import { AuthModule } from '../auth/auth.module';
import { LineupService } from './lineup.service';
import { LineupRendererService } from './lineup-renderer.service';
import { LineupController } from './lineup.controller';

@Module({
  imports: [PrismaModule, DiscordModule, AuthModule],
  controllers: [LineupController],
  providers: [LineupService, LineupRendererService],
  exports: [LineupService, LineupRendererService],
})
export class LineupModule {}
