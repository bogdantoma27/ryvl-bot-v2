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
  ],
})
export class AppModule {}

