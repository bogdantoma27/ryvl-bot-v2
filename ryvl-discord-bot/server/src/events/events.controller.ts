import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseBoolPipe,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { EventStatus } from '@prisma/client';
import { EventsService, EventWithOccurrences } from './events.service';
import { RsvpService, RsvpGrouped } from './rsvp.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('api/guilds/:guildId/events')
@UseGuards(AuthGuard)
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly rsvpService: RsvpService,
  ) {}

  @Post()
  async createEvent(
    @Param('guildId') guildId: string,
    @CurrentUser() user: JwtPayload,
    @Body() createEventDto: CreateEventDto,
  ): Promise<EventWithOccurrences> {
    return this.eventsService.createEvent(guildId, user.userId, createEventDto);
  }

  @Get()
  async listEvents(
    @Param('guildId') guildId: string,
    @Query('status') status?: EventStatus,
    @Query('upcoming', new DefaultValuePipe(false), ParseBoolPipe) upcoming?: boolean,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ): Promise<EventWithOccurrences[]> {
    return this.eventsService.listEvents(guildId, {
      status,
      upcoming,
      page,
      limit,
    });
  }

  @Get(':eventId')
  async getEvent(
    @Param('eventId') eventId: string,
  ): Promise<EventWithOccurrences> {
    return this.eventsService.getEvent(eventId);
  }

  @Patch(':eventId')
  async updateEvent(
    @Param('eventId') eventId: string,
    @Body() updateEventDto: UpdateEventDto,
  ): Promise<EventWithOccurrences> {
    return this.eventsService.updateEvent(eventId, updateEventDto);
  }

  @Delete(':eventId')
  async deleteEvent(@Param('eventId') eventId: string) {
    return this.eventsService.deleteEvent(eventId);
  }

  @Post(':eventId/occurrences/:occurrenceId/cancel')
  async cancelOccurrence(
    @Param('occurrenceId') occurrenceId: string,
  ) {
    return this.eventsService.cancelOccurrence(occurrenceId);
  }

  @Get(':eventId/occurrences/:occurrenceId/rsvps')
  async getOccurrenceRsvps(
    @Param('occurrenceId') occurrenceId: string,
  ): Promise<RsvpGrouped> {
    return this.rsvpService.getRsvps(occurrenceId);
  }

  @Get(':eventId/rsvps')
  async getEventRsvps(
    @Param('eventId') eventId: string,
    @Query('occurrenceId') occurrenceId?: string,
  ): Promise<any[]> {
    return this.rsvpService.getFlatRsvps(occurrenceId);
  }
}

