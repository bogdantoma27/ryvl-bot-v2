import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '../config/config.module';
import { DiscordModule } from '../discord/discord.module';
import { AuthModule } from '../auth/auth.module';
import { VpgService } from './vpg.service';
import { VpgPollerService } from './vpg-poller.service';
import { VpgSuperligaPollerService } from './vpg-superliga-poller.service';
import { TotwService } from './totw.service';
import { TotwRendererService } from './totw-renderer.service';
import { VpgController } from './vpg.controller';
import { VpgNotificationsController } from './vpg-notifications.controller';
import { TotwController } from './totw.controller';
import { VpgRetentionService } from './vpg-retention.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    AuthModule,
    forwardRef(() => DiscordModule),
  ],
  providers: [
    VpgService,
    VpgPollerService,
    VpgSuperligaPollerService,
    TotwService,
    TotwRendererService,
    VpgRetentionService,
  ],
  controllers: [VpgController, VpgNotificationsController, TotwController],
  exports: [
    VpgService,
    VpgPollerService,
    VpgSuperligaPollerService,
    TotwService,
    TotwRendererService,
  ],
})
export class VpgModule {}
