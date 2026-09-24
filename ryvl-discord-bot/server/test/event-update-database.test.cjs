'use strict';
// Real disposable PostgreSQL integration. Never use production credentials for tests.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { EventsService } = require('../dist/events/events.service');
const { RecurrenceService } = require('../dist/events/recurrence.service');
const enabled = process.env.RUN_DATABASE_TESTS === '1';
test('published event edits preserve occurrence/message/RSVP identities and refresh Discord', { skip: !enabled }, async () => {
  const db = new PrismaClient(); const guildId = '999999999999908002'; const synced = [];
  const service = new EventsService(db, new RecurrenceService(), { emit() {} }, { syncEvent: async id => { synced.push(id); return { updated: 1, failed: 0 }; } });
  try {
    await db.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId, name: 'Event edit fixture' } });
    const event = await service.createEvent(guildId, 'fixture-user', { title: 'Initial title', channelId: 'fixture-channel', startsAt: '2030-09-24T16:00:00Z', timezone: 'Europe/Bucharest', duration: 60 });
    const occ = event.occurrences[0];
    await db.eventOccurrence.update({ where: { id: occ.id }, data: { status: 'PUBLISHED', messageId: 'fixture-message', publishedAt: new Date() } });
    const rsvp = await db.rsvp.create({ data: { occurrenceId: occ.id, userId: 'fixture-attendee', displayName: 'Attendee', status: 'ACCEPTED' } });
    await service.updateEvent(event.id, { title: 'Edited title', startsAt: '2030-09-25T16:00:00Z', description: '' }, occ.id);
    let occurrences = await db.eventOccurrence.findMany({ where: { eventId: event.id }, include: { rsvps: true } });
    assert.equal(occurrences.length, 1, 'An edit must not create a second event announcement');
    assert.equal(occurrences[0].id, occ.id);
    assert.equal(occurrences[0].startsAt.toISOString(), '2030-09-25T16:00:00.000Z');
    assert.equal(occurrences[0].endsAt.toISOString(), '2030-09-25T17:00:00.000Z');
    assert.equal(occurrences[0].messageId, 'fixture-message');
    assert.equal(occurrences[0].status, 'PUBLISHED');
    assert.equal(occurrences[0].rsvps[0].id, rsvp.id);
    assert.ok(synced.includes(event.id), 'The service must refresh messages for both web and Discord edits');
    await service.updateEvent(event.id, { duration: 90 });
    occurrences = await db.eventOccurrence.findMany({ where: { eventId: event.id } });
    assert.equal(occurrences.length, 1);
    assert.equal(occurrences[0].startsAt.toISOString(), '2030-09-25T16:00:00.000Z', 'Duration-only edits must not move kickoff to now');
    assert.equal(occurrences[0].endsAt.toISOString(), '2030-09-25T17:30:00.000Z');
    const before = synced.length;
    await service.updateEvent(event.id, { description: 'Metadata-only web edit' });
    assert.equal(synced.length, before + 1, 'Metadata-only edits must refresh the published embed too');
    await service.updateEvent(event.id, { description: '' });
    assert.equal((await db.event.findUnique({ where: { id: event.id } })).description, '');
  } finally { await db.guild.deleteMany({ where: { id: guildId } }); await db.$disconnect(); }
});
