import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '../config/config.module';
import { DiscordModule } from '../discord/discord.module';
import { AuthModule } from '../auth/auth.module';
import { VpgService } from './vpg.service';
import { VpgPollerService } from './vpg-poller.service';
import { VpgSuperligaPollerService } from './vpg-superliga-poller.service';
import { VpgController } from './vpg.controller';
import { VpgNotificationsController } from './vpg-notifications.controller';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    AuthModule,
    forwardRef(() => DiscordModule),
  ],
  providers: [VpgService, VpgPollerService, VpgSuperligaPollerService],
  controllers: [VpgController, VpgNotificationsController],
  exports: [VpgService, VpgPollerService, VpgSuperligaPollerService],
})
export class VpgModule {}
