'use strict';
// Pure scheduler/view/lineup helpers; no database or Discord.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventPublisher, isOccurrenceDue, MAX_PUBLISH_LEAD_MINUTES } = require('../dist/events/event-publisher.service');
const { toEventView, countRsvps, frequencyFromRrule, occurrenceEnd } = require('../dist/events/event-view');
const { buildEventEmbed } = require('../dist/discord/embeds/event-embed.builder');
const { normalizeAssignments, assignmentNames, autoFillByPreferredPosition, preferenceScore } = require('../dist/lineup/lineup-assignments');
const { sortLineupMembers } = require('../dist/lineup/lineup.service');
const { fixtureOpponent } = require('../dist/events/event-fixtures.service');

const now = new Date('2030-01-10T12:00:00Z');
const hours = h => new Date(now.getTime() + h * 3600000);

test('first occurrence is announced at once; later ones only inside the event lead time', () => {
  const event = { publishLeadMinutes: 2880 };
  assert.equal(isOccurrenceDue({ index: 0, startsAt: hours(24 * 30) }, event, now), true);
  assert.equal(isOccurrenceDue({ index: 3, startsAt: hours(47) }, event, now), true, '2 days ahead is inside a 2880-minute lead');
  assert.equal(isOccurrenceDue({ index: 3, startsAt: hours(49) }, event, now), false);
  assert.equal(isOccurrenceDue({ index: 3, startsAt: hours(0.05) }, { publishLeadMinutes: 0 }, now), false);
  assert.equal(isOccurrenceDue({ index: 3, startsAt: hours(24 * 40) }, { publishLeadMinutes: 10 ** 9 }, now), false, 'Lead is capped');
  assert.equal(MAX_PUBLISH_LEAD_MINUTES, 43200);
});

test('overlapping publish runs coalesce instead of running in parallel', async () => {
  const publisher = new EventPublisher({}, { discordToken: 'x', frontendUrl: 'https://ryvl.top' });
  let calls = 0; let release;
  publisher.publishDueOnce = async () => { calls++; if (calls === 1) await new Promise(r => { release = r; }); return { published: 1, closed: 0, failed: 0, skipped: false }; };
  const first = publisher.publishDue(now);
  await new Promise(r => setImmediate(r));
  const second = await publisher.publishDue(now);
  assert.equal(second.skipped, true, 'A second run while one is active does not start');
  release();
  const result = await first;
  assert.equal(calls, 2, 'The active run repeats once to pick up what the skipped call wanted');
  assert.equal(result.published, 2);
});

test('occurrences without endsAt end after the event duration', () => {
  assert.equal(occurrenceEnd({ startsAt: now, endsAt: null }, 90).toISOString(), hours(1.5).toISOString());
  assert.equal(occurrenceEnd({ startsAt: now, endsAt: hours(3) }, 90).toISOString(), hours(3).toISOString());
});

test('event view exposes uppercase status, next occurrence and one RSVP tally', () => {
  const occ = (id, index, start, status, rsvps = []) => ({ id, eventId: 'e', index, startsAt: start, endsAt: new Date(start.getTime() + 3600000), status, messageId: null, channelId: 'c', publishedAt: null, closedAt: null, publishClaimToken: 'secret', publishClaimedAt: now, createdAt: now, updatedAt: now, rsvps });
  const view = toEventView({
    id: 'e', guildId: 'g', title: 'Training', status: 'ACTIVE', rrule: 'DTSTART;TZID=Europe/Bucharest:20300101T190000\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', duration: 60, publishLeadMinutes: 2880,
    occurrences: [
      occ('later', 2, hours(48), 'SCHEDULED'),
      occ('past', 0, hours(-48), 'CLOSED', [{ status: 'ACCEPTED' }, { status: 'DECLINED' }]),
      occ('cancelled', 1, hours(2), 'CANCELLED', [{ status: 'TENTATIVE' }]),
    ],
  }, now);
  assert.equal(view.status, 'ACTIVE');
  assert.equal(view.isRecurring, true);
  assert.equal(view.frequency, 'biweekly');
  assert.equal(view.nextOccurrence.id, 'later', 'Cancelled and finished dates are not "next"');
  assert.equal(view.startsAt, hours(-48).toISOString());
  assert.deepEqual(view.rsvpsCount, { accepted: 1, tentative: 1, declined: 1, total: 3 });
  assert.deepEqual(view.occurrences.map(o => o.id), ['past', 'cancelled', 'later']);
  assert.deepEqual(view.occurrences[0].rsvpCounts, { accepted: 1, tentative: 0, declined: 1, total: 2 });
  assert.equal('publishClaimToken' in view.occurrences[0], false, 'Claim tokens are internal');
  assert.equal(frequencyFromRrule(null), null);
  assert.equal(frequencyFromRrule('FREQ=DAILY'), 'daily');
  assert.deepEqual(countRsvps([{ status: 'ACCEPTED' }, { status: 'bogus' }]), { accepted: 1, tentative: 0, declined: 0, total: 1 });
});

test('cancelled and closed announcements say so and have no live buttons', () => {
  const event = { id: 'e', title: 'Match', color: '#EAE905', timezone: 'Europe/Bucharest' };
  const occurrence = { id: 'o', index: 0, startsAt: now, endsAt: hours(1), status: 'CANCELLED' };
  const publisher = new EventPublisher({}, { discordToken: 'x', frontendUrl: 'https://ryvl.top' });
  const cancelled = publisher.renderAnnouncement({ ...occurrence, event, rsvps: [] });
  assert.match(cancelled.embeds[0].title, /CANCELLED/);
  assert.deepEqual(cancelled.components, []);
  const closed = publisher.renderAnnouncement({ ...occurrence, status: 'CLOSED', event, rsvps: [] });
  assert.deepEqual(closed.components, []);
  assert.ok(closed.embeds[0].fields.some(f => /ended/.test(f.value)));
  const open = publisher.renderAnnouncement({ ...occurrence, status: 'PUBLISHED', event, rsvps: [] });
  assert.equal(open.components[0].components[0].custom_id, 'rsvp:o:ACCEPTED');
  assert.ok(buildEventEmbed({ event, occurrence: { ...occurrence, status: 'PUBLISHED' } }).embed.toJSON().title === 'Match');
});

test('lineup assignments read the legacy {slot: name} format and the new {slot: {discordUserId, name}} format', () => {
  assert.deepEqual(normalizeAssignments({ GK: 'Keeper', st: '  ', cb: 'Old Name' }), { gk: { name: 'Keeper' }, cb: { name: 'Old Name' } });
  assert.deepEqual(normalizeAssignments('{"gk":"Keeper"}'), { gk: { name: 'Keeper' } });
  assert.deepEqual(
    normalizeAssignments({ gk: { discordUserId: '123456789012345678', name: 'Keeper' }, st: { discordUserId: 'not-an-id', name: 'Guest' }, cm: { name: '' } }),
    { gk: { discordUserId: '123456789012345678', name: 'Keeper' }, st: { name: 'Guest' } },
  );
  assert.deepEqual(normalizeAssignments(null), {});
  assert.deepEqual(normalizeAssignments('not json'), {});
  assert.deepEqual(assignmentNames(normalizeAssignments({ gk: 'A', st: { name: 'B', discordUserId: '123456789012345678' } })), { gk: 'A', st: 'B' });
});

test('auto-fill places accepted players by preferred position, keeps manual picks and fills the rest', () => {
  assert.equal(preferenceScore('lcb', 'LCB'), 3);
  assert.equal(preferenceScore('rcb', 'CB'), 2);
  assert.equal(preferenceScore('rw', 'LW'), 2);
  assert.equal(preferenceScore('cm', 'Midfielder'), 1);
  assert.equal(preferenceScore('gk', 'ST'), 0);
  const slots = ['gk', 'lcb', 'rcb', 'cm', 'st'];
  const candidates = [
    { discordUserId: '100001', name: 'Striker', preferredPos: 'ST' },
    { discordUserId: '100002', name: 'Keeper', preferredPos: 'GK' },
    { discordUserId: '100003', name: 'Centre back', preferredPos: 'CB' },
    { discordUserId: '100004', name: 'Defender', preferredPos: 'defender' },
    { discordUserId: '100005', name: 'No preference', preferredPos: null },
    { discordUserId: '100006', name: 'Bench', preferredPos: 'GK' },
  ];
  const result = autoFillByPreferredPosition(slots, candidates, { cm: { name: 'Manual pick' } });
  assert.equal(result.gk.name, 'Keeper');
  assert.equal(result.st.name, 'Striker');
  assert.equal(result.lcb.name, 'Centre back');
  assert.equal(result.rcb.name, 'Defender');
  assert.deepEqual(result.cm, { name: 'Manual pick' }, 'Existing assignments are not overwritten');
  assert.equal(Object.keys(result).length, 5);
  assert.equal(result.gk.discordUserId, '100002');
});

test('lineup picker lists accepted RSVPs first, then tentative, then the rest', () => {
  const member = (name, rsvpStatus) => ({ discordUserId: name, displayName: name, rsvpStatus });
  const sorted = sortLineupMembers([member('Zed', null), member('Dec', 'DECLINED'), member('Tom', 'TENTATIVE'), member('Bob', 'ACCEPTED'), member('Amy', 'ACCEPTED'), member('Abe', null)]);
  assert.deepEqual(sorted.map(m => m.displayName), ['Amy', 'Bob', 'Tom', 'Abe', 'Zed', 'Dec']);
});

test('fixture events are titled after the opponent on either side', () => {
  assert.equal(fixtureOpponent({ homeName: 'RYVL Esports', awayName: 'FC Rival' }), 'FC Rival');
  assert.equal(fixtureOpponent({ homeName: 'FC Rival', awayName: 'RYVL Esports' }), 'FC Rival');
});

test('RSVP buttons on a cancelled occurrence answer privately and refresh the stale card', async () => {
  const { RsvpButtonHandler } = require('../dist/discord/interactions/rsvp-button.handler');
  const { RsvpClosedException } = require('../dist/events/rsvp.service');
  const calls = [];
  const occurrence = { id: 'o', index: 0, startsAt: now, endsAt: hours(1), status: 'CANCELLED', event: { id: 'e', title: 'Match', color: '#EAE905' }, rsvps: [] };
  const handler = new RsvpButtonHandler(
    { upsertRsvp: async () => { throw new RsvpClosedException('CANCELLED'); } },
    { eventOccurrence: { findUnique: async () => occurrence } },
    new EventPublisher({}, { discordToken: 'x', frontendUrl: 'https://ryvl.top' }),
  );
  await handler.handle({
    customId: 'rsvp:o:ACCEPTED', user: { id: 'u', username: 'u', displayAvatarURL: () => null }, member: null,
    deferReply: async options => calls.push(['defer', options.flags]),
    editReply: async value => calls.push(['reply', value.content]),
    message: { embeds: [], edit: async value => calls.push(['edit', value.components]) },
  });
  assert.equal(calls[0][0], 'defer');
  assert.ok(calls[0][1], 'Deferred as ephemeral');
  assert.match(calls.find(c => c[0] === 'reply')[1], /cancelled/);
  assert.deepEqual(calls.find(c => c[0] === 'edit')[1], [], 'Stale buttons are removed');
});
