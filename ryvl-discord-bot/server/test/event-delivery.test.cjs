'use strict';
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventMessageService } = require('../dist/events/event-message.service');
const { EventsController } = require('../dist/events/events.controller');
const { ValidationPipe } = require('@nestjs/common');
const { parseEventDateTime, formatEventDateTime } = require('../dist/events/event-time');
const { RecurrenceService } = require('../dist/events/recurrence.service');

function updater() {
  const event = { id: 'event', title: 'Edited training', description: 'Updated description', timezone: 'Europe/Bucharest', channelId: 'channel', color: '#EAE905' };
  const occurrence = { id: 'occ', index: 0, startsAt: new Date('2030-09-25T16:00:00Z'), endsAt: new Date('2030-09-25T17:00:00Z'), status: 'PUBLISHED', messageId: 'message', channelId: 'channel', event, rsvps: [{ displayName: 'Fixture Attendee', status: 'ACCEPTED' }] };
  const calls = [];
  const service = new EventMessageService({ eventOccurrence: { findMany: async () => [occurrence] } }, { discordToken: 'fixture-token', frontendUrl: 'https://ryvl.top' });
  service.rest = { get: async route => { calls.push(['get', route]); return { embeds: [{ footer: { text: 'Created by Original Creator' } }] }; }, patch: async (route, options) => calls.push(['patch', route, options.body]) };
  return { service, calls, occurrence };
}
test('stored Discord announcement is edited in place with updated time, original creator and RSVPs', async () => {
  const f = updater();
  assert.deepEqual(await f.service.syncEvent('event'), { updated: 1, failed: 0 });
  const call = f.calls.find(item => item[0] === 'patch');
  assert.equal(call[1], '/channels/channel/messages/message');
  const embed = call[2].embeds[0];
  assert.equal(embed.title, 'Edited training');
  assert.equal(embed.description, 'Updated description');
  assert.equal(embed.footer.text, 'Created by Original Creator');
  assert.match(embed.fields.find(field => field.name === 'Time').value, /2030-09-25 · 19:00 \(Europe\/Bucharest\)/);
  assert.match(embed.fields.find(field => field.name.startsWith('✅')).value, /Fixture Attendee/);
  assert.equal(call[2].components[0].components[0].custom_id, 'rsvp:occ:ACCEPTED');
  assert.deepEqual(call[2].allowed_mentions, { parse: [] });
});
test('failed announcement updates remain retryable and are not reported as success', async () => {
  const f = updater();
  f.service.rest.patch = async () => { throw new Error('Missing access'); };
  assert.deepEqual(await f.service.syncEvent('event'), { updated: 0, failed: 1 });
  f.service.rest.patch = async () => {};
  assert.deepEqual(await f.service.syncEvent('event'), { updated: 1, failed: 0 });
});
test('autumn repeated local time has a deterministic instant; invalid zones do not silently become UTC', () => {
  const date = parseEventDateTime('2026-10-25', '03:30', 'Europe/Bucharest');
  assert.equal(date.toISOString(), '2026-10-25T00:30:00.000Z');
  assert.deepEqual(formatEventDateTime(date, 'Europe/Bucharest'), { date: '2026-10-25', time: '03:30' });
  assert.equal(parseEventDateTime('2026-09-24', '19:00', 'MadeUp/Zone'), null);
});
test('HTTP event edit fields survive the actual global validation pipe', async () => {
  const metatype = Reflect.getMetadata('design:paramtypes', EventsController.prototype, 'updateEvent')[1];
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false });
  const input = { title: 'Changed', description: '', startsAt: '2030-09-25T16:00:00Z' };
  assert.deepEqual(await pipe.transform(input, { type: 'body', metatype }), input);
});
test('admin creation date/time/duration payload is converted to the same canonical event instant', async () => {
  let captured;
  const controller = new EventsController({ createEvent: async (_g, _u, body) => { captured = body; return body; } }, {});
  await controller.createEvent('guild', { userId: 'staff' }, { title: 'Training', channelId: 'channel', date: '2030-09-25', time: '19:00', timezone: 'Europe/Bucharest', duration: '1.5h', isRecurring: false, roleMentionIds: ['role'] });
  assert.equal(captured.startsAt, '2030-09-25T16:00:00.000Z');
  assert.equal(captured.duration, 90);
  assert.deepEqual(captured.mentionRoleIds, ['role']);
});
test('admin recurring form keeps the selected local kickoff across Romanian winter-time change', async () => {
  let captured;
  const controller = new EventsController({ createEvent: async (_g, _u, body) => { captured = body; return body; } }, {});
  await controller.createEvent('guild', { userId: 'staff' }, { title: 'Weekly', channelId: 'channel', date: '2026-10-18', time: '19:00', timezone: 'Europe/Bucharest', duration: '1h', isRecurring: true, frequency: 'weekly', weekdays: [0], endCondition: 'after_count', endCount: 3 });
  assert.ok(captured.rrule, 'Recurring form cannot be silently treated as one-off');
  const anchor = new Date(captured.startsAt);
  const occurrences = new RecurrenceService().generateOccurrences({ id: 'event', duration: captured.duration, rrule: captured.rrule }, anchor, 10, anchor);
  assert.equal(occurrences.length, 3);
  assert.equal(occurrences[0].startsAt.toISOString(), '2026-10-18T16:00:00.000Z');
  assert.equal(occurrences[1].startsAt.toISOString(), '2026-10-25T17:00:00.000Z');
});
