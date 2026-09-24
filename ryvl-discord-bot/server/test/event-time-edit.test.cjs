'use strict';
// Exercise real command handlers, dates and embeds without sending anything to Discord.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventCreateCommand } = require('../dist/discord/commands/event-create.command');
const { EventEditCommand } = require('../dist/discord/commands/event-edit.command');
const { buildEventEmbed } = require('../dist/discord/embeds/event-embed.builder');
const gid = '999999999999908001';
const eid = '11111111-1111-4111-8111-111111111111';
const oid = '22222222-2222-4222-8222-222222222222';
function fixture(date, time, zone = 'Europe/Bucharest') {
  const calls = [], created = [];
  const event = { id: eid, guildId: gid, title: 'Fixture training', timezone: zone, description: 'Old description', duration: 60, createdById: 'staff', channelId: 'channel', color: '#EAE905' };
  const occurrence = { id: oid, eventId: eid, index: 0, startsAt: new Date('2026-09-24T16:00:00Z'), endsAt: new Date('2026-09-24T17:00:00Z'), status: 'PUBLISHED', messageId: 'message', channelId: 'channel', rsvps: [] };
  const prisma = {
    guild: { findUnique: async () => { calls.push('guild'); return { timezone: zone }; } },
    event: { findUnique: async () => { calls.push('event'); return { ...event, occurrences: [occurrence] }; } },
    eventOccurrence: { update: async () => occurrence, findFirst: async () => ({ ...occurrence, event }), findUnique: async () => ({ ...occurrence, event }) },
  };
  const service = { createEvent: async (_gid, _uid, data) => { created.push(data); return { ...event, ...data, occurrences: [{ ...occurrence, startsAt: new Date(data.startsAt) }] }; }, updateEvent: async (...args) => { calls.push(['update', ...args]); return { ...event, occurrences: [occurrence], discordSync: { updated: 1, failed: 0 } }; } };
  const fields = { event_title: 'Fixture training', event_date: date, event_time: time, event_description: '', edit_title: 'Edited training', edit_date: date, edit_time: time, edit_description: '' };
  const interaction = { guildId: gid, channelId: 'channel', message: { id: 'message' }, user: { id: 'staff', displayName: 'Fixture Staff', username: 'staff' }, memberPermissions: { has: () => true }, fields: { getTextInputValue: key => fields[key] }, channel: { send: async () => ({ id: 'message' }) }, client: { channels: { fetch: async () => ({ messages: { fetch: async () => ({ edit: async () => calls.push('messageEdit') }) } }) } }, deferReply: async () => calls.push('defer'), reply: async value => calls.push(['reply', value]), editReply: async value => calls.push(['editReply', value]), showModal: async value => calls.push(['modal', value.toJSON()]) };
  return { calls, created, prisma, service, interaction, event, occurrence };
}
for (const [name, date, time, now, zone, expected] of [
  ['19:00 is Romanian wall time, not the VM timezone', '2026-09-24', '19:00', '2026-09-24T08:00:00Z', 'Europe/Bucharest', '2026-09-24T16:00:00.000Z'],
  ['Today uses the Romanian date after local midnight', 'Today', '19:00', '2026-09-23T22:30:00Z', 'Europe/Bucharest', '2026-09-24T16:00:00.000Z'],
  ['Tomorrow follows the Romanian date after local midnight', 'tomorrow', '19:00', '2026-09-23T22:30:00Z', 'Europe/Bucharest', '2026-09-25T16:00:00.000Z'],
  ['Today is never silently rolled to tomorrow when its time has passed', 'today', '19:00', '2026-09-24T18:00:00Z', 'Europe/Bucharest', '2026-09-24T16:00:00.000Z'],
  ['winter offsets are calculated from the event date', '2026-12-24', '19:00', '2026-09-24T08:00:00Z', 'Europe/Bucharest', '2026-12-24T17:00:00.000Z'],
  ['00:15 keeps its local calendar date', '2026-09-25', '00:15', '2026-09-24T08:00:00Z', 'Europe/Bucharest', '2026-09-24T21:15:00.000Z'],
  ['next Friday means the next Friday, not an extra week', 'next friday', '19:00', '2026-09-24T08:00:00Z', 'Europe/Bucharest', '2026-09-25T16:00:00.000Z'],
  ['guild timezone is respected', '2026-09-24', '19:00', '2026-09-24T08:00:00Z', 'America/New_York', '2026-09-24T23:00:00.000Z'],
]) {
  test(name, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(now).getTime() });
    const f = fixture(date, time, zone);
    await new EventCreateCommand(f.service, f.prisma).handleModalSubmit(f.interaction);
    assert.equal(f.created.length, 1, 'Valid input must create exactly one event');
    assert.equal(f.created[0].startsAt, expected);
    assert.equal(f.created[0].timezone, zone);
    assert.equal(f.calls[0], 'defer', 'Acknowledge before remote database work');
  });
}
for (const [date, time] of [['2026-02-30','19:00'], ['2026-09-24','19:00junk'], ['2026-09-24',''], ['2026-09-24','24:00'], ['2026-03-29','03:30']]) {
  test('invalid/nonexistent local time is rejected: ' + date + ' ' + time, async () => {
    const f = fixture(date, time);
    await new EventCreateCommand(f.service, f.prisma).handleModalSubmit(f.interaction);
    assert.equal(f.created.length, 0);
    assert.ok(f.calls.some(call => Array.isArray(call) && /invalid|could not|cannot/i.test(call[1]?.content || '')), 'Explain invalid input rather than adjusting it silently');
  });
}
test('edit modal formats both date and hour in the event timezone', async () => {
  const f = fixture('2026-09-25', '00:30'); f.occurrence.startsAt = new Date('2026-09-24T21:30:00Z');
  await new EventEditCommand(f.prisma, f.service).showModal(f.interaction, eid);
  const modal = f.calls.find(call => call[0] === 'modal')?.[1];
  assert.ok(modal);
  const fields = modal.components.flatMap(row => row.components);
  assert.equal(fields.find(field => field.custom_id === 'edit_date').value, '2026-09-25');
  assert.equal(fields.find(field => field.custom_id === 'edit_time').value, '00:30');
  assert.ok(modal.custom_id.includes(oid), 'Bind editing to the occurrence in the clicked message');
});
test('edit submit acknowledges first, preserves 19:00 and supports clearing description', async () => {
  const f = fixture('2026-09-25', '19:00');
  await new EventEditCommand(f.prisma, f.service).handleModalSubmit(f.interaction, eid, oid);
  assert.equal(f.calls[0], 'defer');
  const update = f.calls.find(call => call[0] === 'update');
  assert.equal(update[2].startsAt, '2026-09-25T16:00:00.000Z');
  assert.equal(update[2].description, '');
  assert.equal(update[3], oid);
});
test('event embed contains the correct instant, explicit event timezone and working staff URL', () => {
  const f = fixture('', '');
  const { embed } = buildEventEmbed({ event: f.event, occurrence: f.occurrence, frontendUrl: 'https://ryvl.top' });
  const field = embed.toJSON().fields.find(field => field.name === 'Time').value;
  assert.ok(field.includes(`<t:${Math.floor(f.occurrence.startsAt.getTime()/1000)}:F>`));
  assert.match(field, /19:00/); assert.match(field, /Europe\/Bucharest/);
  assert.match(field, /https:\/\/ryvl.top\/admin\/events\//);
});
