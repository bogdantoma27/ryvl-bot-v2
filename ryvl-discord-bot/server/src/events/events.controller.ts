import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, ParseBoolPipe, DefaultValuePipe, ParseIntPipe, NotFoundException } from '@nestjs/common';
import { EventStatus } from '@prisma/client';
import { EventsService, EventWithOccurrences } from './events.service';
import { RsvpService, RsvpGrouped } from './rsvp.service';
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
  constructor(private readonly eventsService: EventsService, private readonly rsvpService: RsvpService) {}

  // GuildAdminGuard only proves admin rights in :guildId. Every event/occurrence id in
  // the path must also belong to that guild, or one server's admin could edit another's.
  private async ownedEvent(guildId: string, eventId: string): Promise<EventWithOccurrences> {
    const event = await this.eventsService.getEvent(eventId);
    if (event.guildId !== guildId) throw new NotFoundException(`Event with ID "${eventId}" not found`);
    return event;
  }
  private async ownedOccurrence(guildId: string, occurrenceId: string, eventId?: string): Promise<void> {
    const occurrence = await this.eventsService.getOccurrence(occurrenceId);
    if (occurrence.event.guildId !== guildId || (eventId && occurrence.eventId !== eventId)) {
      throw new NotFoundException(`Occurrence with ID "${occurrenceId}" not found`);
    }
  }

  // Zod in EventsService validates these bodies. An undecorated DTO class would
  // cause the global class-validator whitelist to discard every submitted field.
  @Post()
  async createEvent(@Param('guildId') guildId: string, @CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>): Promise<EventWithOccurrences> {
    return this.eventsService.createEvent(guildId, user.userId, normalizeEventForm(body) as unknown as CreateEventDto);
  }
  @Get()
  async listEvents(@Param('guildId') guildId: string, @Query('status') status?: EventStatus, @Query('upcoming', new DefaultValuePipe(false), ParseBoolPipe) upcoming?: boolean, @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number, @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number): Promise<EventWithOccurrences[]> {
    return this.eventsService.listEvents(guildId, { status, upcoming, page, limit });
  }
  @Get(':eventId')
  async getEvent(@Param('guildId') guildId: string, @Param('eventId') eventId: string): Promise<EventWithOccurrences> { return this.ownedEvent(guildId, eventId); }
  @Patch(':eventId')
  async updateEvent(@Param('guildId') guildId: string, @Param('eventId') eventId: string, @Body() body: Record<string, unknown>): Promise<EventWithOccurrences> {
    await this.ownedEvent(guildId, eventId);
    return this.eventsService.updateEvent(eventId, body as UpdateEventDto);
  }
  @Delete(':eventId')
  async deleteEvent(@Param('guildId') guildId: string, @Param('eventId') eventId: string) {
    await this.ownedEvent(guildId, eventId);
    return this.eventsService.deleteEvent(eventId);
  }
  @Post(':eventId/occurrences/:occurrenceId/cancel')
  async cancelOccurrence(@Param('guildId') guildId: string, @Param('eventId') eventId: string, @Param('occurrenceId') occurrenceId: string) {
    await this.ownedOccurrence(guildId, occurrenceId, eventId);
    return this.eventsService.cancelOccurrence(occurrenceId);
  }
  @Get(':eventId/occurrences/:occurrenceId/rsvps')
  async getOccurrenceRsvps(@Param('guildId') guildId: string, @Param('eventId') eventId: string, @Param('occurrenceId') occurrenceId: string): Promise<RsvpGrouped> {
    await this.ownedOccurrence(guildId, occurrenceId, eventId);
    return this.rsvpService.getRsvps(occurrenceId);
  }
  @Get(':eventId/rsvps')
  async getEventRsvps(@Param('guildId') guildId: string, @Param('eventId') eventId: string, @Query('occurrenceId') occurrenceId?: string): Promise<any[]> {
    if (!occurrenceId) return [];
    await this.ownedOccurrence(guildId, occurrenceId, eventId);
    return this.rsvpService.getFlatRsvps(occurrenceId);
  }
}
