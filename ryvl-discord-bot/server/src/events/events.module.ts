import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventPublisher } from './event-publisher.service';
import { EventFixturesService } from './event-fixtures.service';
import { RecurrenceService } from './recurrence.service';
import { RsvpService } from './rsvp.service';
import { EventsGateway } from './events.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [EventsController, EventsGateway],
  providers: [EventPublisher, EventsService, EventFixturesService, RecurrenceService, RsvpService, EventsGateway],
  exports: [EventsService, EventPublisher, RecurrenceService, RsvpService, EventsGateway],
})
export class EventsModule {}
