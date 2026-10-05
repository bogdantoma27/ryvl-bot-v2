import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { DiscordModule } from '../discord/discord.module';
import { VpgModule } from '../vpg/vpg.module';
import { EaModule } from '../ea/ea.module';
import { SuperligaMvpService } from './superliga-mvp.service';
import { SuperligaMvpPollerService } from './superliga-mvp-poller.service';
import { SuperligaMvpController } from './superliga-mvp.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    forwardRef(() => DiscordModule),
    forwardRef(() => VpgModule),
    forwardRef(() => EaModule),
  ],
  providers: [SuperligaMvpService, SuperligaMvpPollerService],
  controllers: [SuperligaMvpController],
  exports: [SuperligaMvpService],
})
export class SuperligaMvpModule {}
