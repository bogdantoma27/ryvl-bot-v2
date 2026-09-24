'use strict';
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { EventsService } = require('../dist/events/events.service');
const { RecurrenceService } = require('../dist/events/recurrence.service');
const { EventEditCommand } = require('../dist/discord/commands/event-edit.command');
const enabled = process.env.RUN_DATABASE_TESTS === '1';
test('editing a later recurring announcement changes only its date while preserving all RSVP/message keys', { skip: !enabled }, async () => {
  const db = new PrismaClient(); const gid = '999999999999908003';
  const service = new EventsService(db, new RecurrenceService(), { emit() {} }, { syncEvent: async () => ({ updated: 1, failed: 0 }) });
  try {
    await db.guild.create({ data: { id: gid, name: 'Recurring fixture' } });
    const event = await service.createEvent(gid, 'creator', { title: 'Weekly fixture', channelId: 'channel', startsAt: '2030-09-24T16:00:00Z', duration: 60, rrule: 'FREQ=WEEKLY;COUNT=3' });
    const target = event.occurrences[1];
    await db.eventOccurrence.update({ where: { id: target.id }, data: { status: 'PUBLISHED', messageId: 'later-message' } });
    await db.rsvp.create({ data: { occurrenceId: target.id, userId: 'attendee', displayName: 'Existing attendee', status: 'TENTATIVE' } });
    const before = await db.eventOccurrence.findMany({ where: { eventId: event.id }, orderBy: { index: 'asc' } });
    let modal;
    await new EventEditCommand(db, service).showModal({ guildId: gid, channelId: 'channel', message: { id: 'later-message' }, user: { id: 'creator' }, memberPermissions: { has: () => false }, showModal: async value => { modal = value.toJSON(); }, reply: async value => { throw new Error(value.content); } }, event.id);
    assert.ok(modal.custom_id.endsWith(':' + target.id), 'Edit the occurrence in the clicked message, not the first occurrence');
    await service.updateEvent(event.id, { title: 'Changed series title', startsAt: '2030-10-02T16:00:00Z' }, target.id);
    const after = await db.eventOccurrence.findMany({ where: { eventId: event.id }, orderBy: { index: 'asc' }, include: { rsvps: true } });
    assert.equal(after.length, before.length);
    assert.deepEqual(after.map(o => o.id), before.map(o => o.id));
    assert.equal(after[0].startsAt.getTime(), before[0].startsAt.getTime());
    assert.equal(after[2].startsAt.getTime(), before[2].startsAt.getTime());
    assert.equal(after[1].startsAt.toISOString(), '2030-10-02T16:00:00.000Z');
    assert.equal(after[1].messageId, 'later-message');
    assert.equal(after[1].rsvps[0].userId, 'attendee');
    await assert.rejects(service.updateEvent(event.id, { title: 'Must roll back', startsAt: '2030-10-03T16:00:00Z' }, 'foreign-occurrence'));
    assert.equal((await db.event.findUnique({ where: { id: event.id } })).title, 'Changed series title');
  } finally { await db.guild.deleteMany({ where: { id: gid } }); await db.$disconnect(); }
});
