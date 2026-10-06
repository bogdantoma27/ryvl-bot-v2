import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { GuildsModule } from './guilds/guilds.module';
import { EventsModule } from './events/events.module';
import { DiscordModule } from './discord/discord.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { LineupModule } from './lineup/lineup.module';
import { EaModule } from './ea/ea.module';
import { VpgModule } from './vpg/vpg.module';
import { TournamentModule } from './tournaments/tournament.module';
import { SuperligaMvpModule } from './superliga-mvp/superliga-mvp.module';
import { WebsiteModule } from './website/website.module';

import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    GuildsModule,
    EventsModule,
    DiscordModule,
    SchedulerModule,
    LineupModule,
    EaModule,
    VpgModule,
    TournamentModule,
    SuperligaMvpModule,
    WebsiteModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

