from pathlib import Path
base = Path('ryvl-discord-bot/server/src')
def change(path, old, new):
    p = base / path
    s = p.read_text()
    assert old in s, f'Missing patch anchor in {path}: {old[:90]}'
    p.write_text(s.replace(old, new, 1))

# The create command must resolve the guild timezone after acknowledging Discord.
p = base / 'discord/commands/event-create.command.ts'
s = p.read_text()
s = "import { DEFAULT_EVENT_TIMEZONE, parseEventDateTime, formatEventDateTime } from '../../events/event-time';\n" + s
start = s.index('    const parsedDate = this.parseDateTime(')
end = s.index('      const channelId = interaction.channelId;', start)
s = s[:start] + '''    const receivedAt = new Date();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const guild = await this.prisma.guild.findUnique({ where: { id: guildId }, select: { timezone: true } });
      const timezone = guild?.timezone || DEFAULT_EVENT_TIMEZONE;
      const parsedDate = parseEventDateTime(dateStr, timeStr, timezone, receivedAt);
      if (!parsedDate) {
        await interaction.editReply({ content: `Invalid date or time. Use YYYY-MM-DD (or today/tomorrow) and HH:mm in ${timezone}.` });
        return;
      }
''' + s[end:]
s = s.replace('          startsAt: parsedDate.toISOString(),', '          startsAt: parsedDate.toISOString(),\n          timezone,')
s = s.replace('content: `✅ Event **${title}** created successfully!`,', 'content: `✅ Event **${title}** created: ${formatEventDateTime(parsedDate, timezone).date} at ${formatEventDateTime(parsedDate, timezone).time} (${timezone}).`,')
s = s[:s.index('  private parseDateTime(')] + '}\n'
s = s.replace(".setPlaceholder('2026-10-15 or next friday')", ".setPlaceholder('today, tomorrow, next friday or 2026-10-15')")
p.write_text(s)

# Keep both the event and clicked occurrence in the modal routing data.
change('discord/discord.service.ts', "const eventId = interaction.customId.replace(EVENT_EDIT_MODAL_PREFIX, '');\n            await this.eventEditCommand.handleModalSubmit(interaction, eventId);", "const [eventId, occurrenceId] = interaction.customId.slice(EVENT_EDIT_MODAL_PREFIX.length).split(':');\n            await this.eventEditCommand.handleModalSubmit(interaction, eventId, occurrenceId);")

# All announcement rebuilds (including scheduler and RSVP updates) use the same time/link convention.
p = base / 'discord/embeds/event-embed.builder.ts'
s = p.read_text()
s = "import { DEFAULT_EVENT_TIMEZONE, formatEventDateTime } from '../../events/event-time';\n" + s
s = s.replace('    createdById?: string;', '    createdById?: string;\n    timezone?: string;')
s = s.replace("frontendUrl = 'http://localhost:4201'", "frontendUrl = process.env.FRONTEND_URL || 'https://ryvl.top'")
s = s.replace('/events/${event.id}', '/admin/events/${event.id}')
s = s.replace('  const timeFieldLines = [', '''  const timeZone = event.timezone || DEFAULT_EVENT_TIMEZONE;
  const local = formatEventDateTime(occurrence.startsAt, timeZone);
  const timeFieldLines = [
    `**${local.date} · ${local.time} (${timeZone})**`,''')
p.write_text(s)

# Register a REST-only updater without a circular dependency on the gateway bot.
p = base / 'events/events.module.ts'
s = p.read_text()
s = "import { EventMessageService } from './event-message.service';\n" + s
s = s.replace('providers: [EventsService,', 'providers: [EventMessageService, EventsService,')
p.write_text(s)

# Preserve identity and timing of an already published occurrence on edits.
p = base / 'events/events.service.ts'
s = p.read_text()
s = "import { EventMessageService, EventDiscordSync } from './event-message.service';\n" + s
s = s.replace('export type EventWithOccurrences = Event & {', 'export type EventWithOccurrences = Event & {\n  discordSync?: EventDiscordSync;')
s = s.replace('    private readonly eventsGateway: EventsGateway,', '    private readonly eventsGateway: EventsGateway,\n    private readonly eventMessages: EventMessageService,')
start = s.index('  async updateEvent(')
end = s.index('\n  async deleteEvent(', start)
s = s[:start] + '''  async updateEvent(eventId: string, data: UpdateEventDto, occurrenceId?: string): Promise<EventWithOccurrences> {
    const parsed = updateEventSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(`Validation error: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    const validData = parsed.data;
    // Commit event metadata and occurrence changes together. Lock the parent so
    // concurrent edits cannot regenerate or overwrite each other's schedule.
    const updatedEvent = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`);
      const existing = await tx.event.findUnique({ where: { id: eventId }, include: { occurrences: { orderBy: { startsAt: 'asc' }, include: { rsvps: true } } } });
      if (!existing) throw new NotFoundException(`Event with ID "${eventId}" not found`);
      const now = new Date();
      const active = existing.occurrences.filter(o => o.status === OccurrenceStatus.SCHEDULED || o.status === OccurrenceStatus.PUBLISHED);
      const target = occurrenceId ? existing.occurrences.find(o => o.id === occurrenceId) :
        active.find(o => (o.endsAt || o.startsAt) >= now) || active[0] || (!existing.rrule ? existing.occurrences[0] : undefined);
      if (occurrenceId && (!target || target.status === OccurrenceStatus.CANCELLED)) throw new BadRequestException('Invalid or cancelled event occurrence');
      const recurrenceChanged = validData.rrule !== undefined && validData.rrule !== existing.rrule;
      const { startsAt: requestedStart, ...metadata } = validData;
      const event = await tx.event.update({ where: { id: eventId }, data: { ...metadata, imageUrl: validData.imageUrl === '' ? null : validData.imageUrl } });
      let anchor = target?.startsAt || existing.occurrences[0]?.startsAt || now;
      if (requestedStart !== undefined) {
        anchor = new Date(requestedStart);
        if (!Number.isFinite(anchor.getTime())) throw new BadRequestException('Invalid startsAt');
        const endsAt = new Date(anchor.getTime() + event.duration * 60000);
        if (target) {
          // Do not delete/recreate the row: its message and attendee keys depend on its ID.
          const reopen = target.status === OccurrenceStatus.CLOSED && endsAt > now;
          await tx.eventOccurrence.update({ where: { id: target.id }, data: {
            startsAt: anchor, endsAt,
            ...(reopen ? { status: target.messageId ? OccurrenceStatus.PUBLISHED : OccurrenceStatus.SCHEDULED, closedAt: null } : {}),
          } });
        } else {
          const index = Math.max(-1, ...existing.occurrences.map(o => o.index)) + 1;
          await tx.eventOccurrence.create({ data: { eventId, index, startsAt: anchor, endsAt, channelId: event.channelId } });
        }
      }
      if (validData.duration !== undefined) {
        for (const occurrence of active) {
          if (requestedStart !== undefined && occurrence.id === target?.id) continue;
          await tx.eventOccurrence.update({ where: { id: occurrence.id }, data: { endsAt: new Date(occurrence.startsAt.getTime() + event.duration * 60000) } });
        }
      }
      if (validData.channelId !== undefined) {
        // An existing Discord message stays in its original channel.
        await tx.eventOccurrence.updateMany({ where: { eventId, status: OccurrenceStatus.SCHEDULED, messageId: null }, data: { channelId: event.channelId } });
      }
      if (recurrenceChanged) {
        // Regenerate only unannounced future dates without attendee records.
        await tx.eventOccurrence.deleteMany({ where: { eventId, status: OccurrenceStatus.SCHEDULED, messageId: null, startsAt: { gte: now }, rsvps: { none: {} }, ...(target ? { id: { not: target.id } } : {}) } });
        if (event.rrule) {
          const remaining = await tx.eventOccurrence.findMany({ where: { eventId } });
          const occupied = new Set(remaining.map(o => o.startsAt.getTime()));
          const generated = this.recurrenceService.generateOccurrences({ id: eventId, rrule: event.rrule, duration: event.duration }, new Date(Math.max(now.getTime(), anchor.getTime())), 10, anchor);
          let index = Math.max(-1, ...remaining.map(o => o.index)) + 1;
          const fresh = generated.filter(o => !occupied.has(o.startsAt.getTime()));
          if (fresh.length) await tx.eventOccurrence.createMany({ data: fresh.map(o => ({ eventId, index: index++, startsAt: o.startsAt, endsAt: o.endsAt, status: OccurrenceStatus.SCHEDULED, channelId: event.channelId })) });
        }
      }
      return event;
    });
    const fullEvent = await this.getEvent(eventId);
    this.eventsGateway.emit(updatedEvent.guildId, 'EVENT_UPDATED', fullEvent);
    // Web and Discord edits now refresh the same stored announcements.
    let discordSync: EventDiscordSync;
    try { discordSync = await this.eventMessages.syncEvent(eventId); }
    catch (error) {
      this.logger.warn(`Event saved but announcement refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      discordSync = { updated: 0, failed: 1 };
    }
    return { ...fullEvent, discordSync };
  }
''' + s[end:]
p.write_text(s)

# Zod is the validator for event DTOs. The global class-validator whitelist was
# stripping all fields from these undecorated DTO classes before Zod saw them.
p = base / 'events/events.controller.ts'
s = p.read_text().replace("import { CreateEventDto }", "import type { CreateEventDto }").replace("import { UpdateEventDto }", "import type { UpdateEventDto }")
p.write_text(s)
print('Patched event date parsing, occurrence identity and shared announcement refresh.')
