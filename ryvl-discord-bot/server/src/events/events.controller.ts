import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, ParseBoolPipe, DefaultValuePipe, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { EventStatus } from '@prisma/client';
import { EventsService, EventWithOccurrences } from './events.service';
import { RsvpService, RsvpGrouped } from './rsvp.service';
import { EventFixturesService } from './event-fixtures.service';
import { normalizeEventForm } from './event-form';
import type { CreateEventDto } from './dto/create-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import { AuthGuard } from '../auth/auth.guard';
import { GuildAdminGuard } from '../auth/guild-admin.guard';
import { CurrentUser } from '../auth/user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('api/guilds/:guildId/events')
@UseGuards(AuthGuard, GuildAdminGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService, private readonly rsvpService: RsvpService, private readonly fixtures?: EventFixturesService) {}

  // Zod in EventsService validates these bodies. An undecorated DTO class would
  // cause the global class-validator whitelist to discard every submitted field.
  @Post()
  async createEvent(@Param('guildId') guildId: string, @CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>): Promise<EventWithOccurrences> {
    return this.eventsService.createEvent(guildId, user.userId, normalizeEventForm(body) as unknown as CreateEventDto);
  }
  @Get()
  async listEvents(@Param('guildId') guildId: string, @Query('status') status?: EventStatus, @Query('upcoming', new DefaultValuePipe(false), ParseBoolPipe) upcoming?: boolean, @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number, @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number): Promise<EventWithOccurrences[]> {
    if (status !== undefined && !Object.values(EventStatus).includes(status)) throw new BadRequestException('Invalid status');
    return this.eventsService.listEvents(guildId, { status, upcoming, page, limit });
  }
  // Declared before ':eventId' so "fixtures" is not taken for an event id.
  @Get('fixtures/upcoming')
  async listUpcomingFixtures(@Param('guildId') guildId: string) { return this.fixtures!.listUpcomingFixtures(guildId); }
  @Post('fixtures/create')
  async createFromFixtures(@Param('guildId') guildId: string, @CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    const matchIds = Array.isArray(body.matchIds) ? body.matchIds.map(Number).filter(Number.isInteger) : undefined;
    const mentionRoleIds = Array.isArray(body.mentionRoleIds) ? body.mentionRoleIds.filter((id): id is string => typeof id === 'string') : undefined;
    const durationMinutes = body.durationMinutes === undefined ? undefined : Number(body.durationMinutes);
    if (durationMinutes !== undefined && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440)) throw new BadRequestException('durationMinutes must be between 1 and 1440');
    return this.fixtures!.createEventsFromFixtures(guildId, user.userId, { channelId: String(body.channelId || ''), matchIds, durationMinutes, mentionRoleIds });
  }
  @Get(':eventId')
  async getEvent(@Param('guildId') guildId: string, @Param('eventId') eventId: string): Promise<EventWithOccurrences> { return this.eventsService.getEvent(guildId, eventId); }
  @Patch(':eventId')
  async updateEvent(@Param('guildId') guildId: string, @Param('eventId') eventId: string, @Body() body: Record<string, unknown>): Promise<EventWithOccurrences> { return this.eventsService.updateEvent(guildId, eventId, body as UpdateEventDto); }
  @Delete(':eventId')
  async deleteEvent(@Param('guildId') guildId: string, @Param('eventId') eventId: string) { return this.eventsService.deleteEvent(guildId, eventId); }
  @Post(':eventId/occurrences/:occurrenceId/cancel')
  async cancelOccurrence(@Param('guildId') guildId: string, @Param('eventId') eventId: string, @Param('occurrenceId') occurrenceId: string) { return this.eventsService.cancelOccurrence(guildId, eventId, occurrenceId); }
  @Get(':eventId/occurrences/:occurrenceId/rsvps')
  async getOccurrenceRsvps(@Param('guildId') guildId: string, @Param('eventId') eventId: string, @Param('occurrenceId') occurrenceId: string): Promise<RsvpGrouped> { return this.rsvpService.getRsvps(guildId, eventId, occurrenceId); }
  @Get(':eventId/rsvps')
  async getEventRsvps(@Param('guildId') guildId: string, @Param('eventId') eventId: string, @Query('occurrenceId') occurrenceId?: string): Promise<Record<string, unknown>[]> { return this.rsvpService.getFlatRsvps(guildId, eventId, occurrenceId); }
}
