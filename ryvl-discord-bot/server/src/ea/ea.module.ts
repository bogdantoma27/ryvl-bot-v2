import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '../config/config.module';
import { DiscordModule } from '../discord/discord.module';
import { AuthModule } from '../auth/auth.module';
import { EaService } from './ea.service';
import { EaPollerService } from './ea-poller.service';
import { EaController } from './ea.controller';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    AuthModule,
    forwardRef(() => DiscordModule),
  ],
  providers: [EaService, EaPollerService],
  controllers: [EaController],
  exports: [EaService, EaPollerService],
})
export class EaModule {}
