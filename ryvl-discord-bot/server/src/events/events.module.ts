import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { RecurrenceService } from './recurrence.service';
import { RsvpService } from './rsvp.service';
import { EventsGateway } from './events.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [EventsController, EventsGateway],
  providers: [EventsService, RecurrenceService, RsvpService, EventsGateway],
  exports: [EventsService, RecurrenceService, RsvpService, EventsGateway],
})
export class EventsModule {}
