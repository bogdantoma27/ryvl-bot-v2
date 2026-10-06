'use strict';
// Real disposable PostgreSQL integration for publishing claims, archiving and guild
// scoping. Discord is replaced by an in-memory REST stub. Never use production data.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { EventsService } = require('../dist/events/events.service');
const { EventPublisher } = require('../dist/events/event-publisher.service');
const { RecurrenceService } = require('../dist/events/recurrence.service');
const { RsvpService, RsvpClosedException } = require('../dist/events/rsvp.service');
const { SchedulerService } = require('../dist/scheduler/scheduler.service');
const { LineupService } = require('../dist/lineup/lineup.service');
const enabled = process.env.RUN_DATABASE_TESTS === '1';

function fixture(db) {
  const discord = { posts: [], patches: [], failPosts: 0 };
  const publisher = new EventPublisher(db, { discordToken: 'fixture-token', frontendUrl: 'https://ryvl.top' });
  let nextId = 1;
  publisher.rest = {
    post: async (route, options) => {
      await new Promise(resolve => setTimeout(resolve, 20));
      if (discord.failPosts > 0) { discord.failPosts--; throw new Error('Missing Permissions'); }
      discord.posts.push({ route, body: options.body });
      return { id: `msg-${nextId++}` };
    },
    get: async () => ({ embeds: [{ footer: { text: 'Created by Fixture' } }] }),
    patch: async (route, options) => { discord.patches.push({ route, body: options.body }); },
  };
  // Creating/editing an event triggers an immediate publish; keep tests deterministic.
  const quiet = Object.assign(Object.create(publisher), { publishDue: async () => ({}) });
  const events = new EventsService(db, new RecurrenceService(), { emit() {} }, quiet);
  const scheduler = new SchedulerService(db, publisher, events);
  const rsvps = new RsvpService(db, { emit() {} });
  return { discord, publisher, events, scheduler, rsvps };
}

async function withGuilds(db, ids, run) {
  try {
    for (const id of ids) await db.guild.upsert({ where: { id }, update: {}, create: { id, name: `Fixture ${id}` } });
    await run();
  } finally {
    await db.guild.deleteMany({ where: { id: { in: ids } } });
  }
}

test('an occurrence is posted once even when two workers publish it at the same time; failures release the claim', { skip: !enabled }, async () => {
  const db = new PrismaClient(); const gid = '999999999999908101';
  const f = fixture(db);
  try {
    await withGuilds(db, [gid], async () => {
      const event = await f.events.createEvent(gid, 'creator', { title: 'Claim test', channelId: '123', startsAt: new Date(Date.now() + 86400000).toISOString(), duration: 60 });
      const occ = event.occurrences[0];
      const outcomes = await Promise.all([f.publisher.publishOccurrence(occ.id), f.publisher.publishOccurrence(occ.id), f.publisher.publishDue()]);
      assert.equal(f.discord.posts.length, 1, 'Exactly one announcement is posted');
      // Whichever worker wins the claim posts it; publishDue reports a count instead of an outcome.
      const [workerA, workerB, due] = outcomes;
      assert.equal([workerA, workerB].filter(o => o === 'published').length + due.published, 1);
      let row = await db.eventOccurrence.findUnique({ where: { id: occ.id } });
      assert.equal(row.status, 'PUBLISHED');
      assert.equal(row.messageId, 'msg-1');
      assert.equal(row.publishClaimToken, null);

      const second = await f.events.createEvent(gid, 'creator', { title: 'Retry test', channelId: '123', startsAt: new Date(Date.now() + 86400000).toISOString(), duration: 60 });
      f.discord.failPosts = 1;
      assert.equal(await f.publisher.publishOccurrence(second.occurrences[0].id), 'failed');
      row = await db.eventOccurrence.findUnique({ where: { id: second.occurrences[0].id } });
      assert.equal(row.status, 'SCHEDULED', 'A failed send leaves the occurrence publishable');
      assert.equal(row.publishClaimToken, null, 'and releases its claim for the next run');
      await f.scheduler.processScheduledEvents();
      row = await db.eventOccurrence.findUnique({ where: { id: second.occurrences[0].id } });
      assert.equal(row.status, 'PUBLISHED');
      assert.equal(f.discord.posts.length, 2);
    });
  } finally { await db.$disconnect(); }
});

test('catching up after downtime closes ended occurrences without posting and respects the lead time', { skip: !enabled }, async () => {
  const db = new PrismaClient(); const gid = '999999999999908102';
  const f = fixture(db);
  try {
    await withGuilds(db, [gid], async () => {
      const past = await f.events.createEvent(gid, 'creator', { title: 'Missed', channelId: '123', startsAt: new Date(Date.now() - 3 * 3600000).toISOString(), duration: 60 });
      const start = new Date(Date.now() + 3600000);
      const series = await f.events.createEvent(gid, 'creator', { title: 'Daily', channelId: '123', startsAt: start.toISOString(), duration: 60, rrule: 'FREQ=DAILY;COUNT=6', publishLeadMinutes: 2880 });
      await f.publisher.publishDue();
      const missed = await db.eventOccurrence.findFirst({ where: { eventId: past.id } });
      assert.equal(missed.status, 'CLOSED');
      assert.equal(missed.messageId, null, 'Ended occurrences are never announced');
      const occs = await db.eventOccurrence.findMany({ where: { eventId: series.id }, orderBy: { index: 'asc' } });
      assert.deepEqual(occs.map(o => o.status), ['PUBLISHED', 'PUBLISHED', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED'],
        'Kickoffs within 48 hours (in 1h and 25h) are announced; the one in 49h waits');
      assert.equal(f.discord.posts.length, 2);
      await f.scheduler.closeExpiredEvents();
      assert.equal((await db.event.findUnique({ where: { id: past.id } })).status, 'ARCHIVED', 'A finished one-off event is archived, not deleted');
    });
  } finally { await db.$disconnect(); }
});

test('closing uses startsAt + duration when endsAt is missing; events are archived, listed and purged after 180 days', { skip: !enabled }, async () => {
  const db = new PrismaClient(); const gid = '999999999999908103';
  const f = fixture(db);
  try {
    await withGuilds(db, [gid], async () => {
      const event = await f.events.createEvent(gid, 'creator', { title: 'Legacy row', channelId: '123', startsAt: new Date(Date.now() + 86400000).toISOString(), duration: 30 });
      const occ = event.occurrences[0];
      await db.eventOccurrence.update({ where: { id: occ.id }, data: { status: 'PUBLISHED', messageId: 'legacy-msg', endsAt: null, startsAt: new Date(Date.now() - 45 * 60000) } });
      await f.scheduler.closeExpiredEvents();
      const closed = await db.eventOccurrence.findUnique({ where: { id: occ.id } });
      assert.equal(closed.status, 'CLOSED');
      const patch = f.discord.patches.find(p => p.route.endsWith('/legacy-msg'));
      assert.ok(patch, 'The announcement is edited');
      assert.deepEqual(patch.body.components, [], 'Buttons are removed when closed');

      const listed = await f.events.listEvents(gid, {});
      assert.equal(listed.length, 1, 'Listing never deletes events');
      assert.equal(listed[0].status, 'ARCHIVED');
      assert.equal((await f.events.listEvents(gid, { status: 'ARCHIVED' })).length, 1);

      const recent = await f.events.createEvent(gid, 'creator', { title: 'Recently archived', channelId: '123', startsAt: new Date(Date.now() + 86400000).toISOString(), duration: 30 });
      await db.event.update({ where: { id: recent.id }, data: { status: 'ARCHIVED', archivedAt: new Date(Date.now() - 10 * 86400000) } });
      await db.event.update({ where: { id: event.id }, data: { archivedAt: new Date(Date.now() - 181 * 86400000) } });
      await f.scheduler.purgeArchivedEvents();
      assert.equal(await db.event.count({ where: { id: event.id } }), 0, 'Archived more than 180 days ago: removed');
      assert.equal(await db.event.count({ where: { id: recent.id } }), 1, 'Recently archived: kept');
    });
  } finally { await db.$disconnect(); }
});

test('a recurring series is topped up instead of archived when its generated batch runs out', { skip: !enabled }, async () => {
  const db = new PrismaClient(); const gid = '999999999999908104';
  const f = fixture(db);
  try {
    await withGuilds(db, [gid], async () => {
      const start = new Date(Date.now() - 20 * 86400000);
      const event = await f.events.createEvent(gid, 'creator', { title: 'Weekly forever', channelId: '123', startsAt: start.toISOString(), duration: 60, rrule: 'FREQ=WEEKLY' });
      // Simulate a batch that has all happened: close every generated occurrence.
      await db.eventOccurrence.updateMany({ where: { eventId: event.id }, data: { status: 'CLOSED' } });
      assert.equal(await f.events.archiveIfFinished(event.id), false, 'Not archived: the rule still has future dates');
      const open = await db.eventOccurrence.findMany({ where: { eventId: event.id, status: 'SCHEDULED' } });
      assert.ok(open.length >= 5, 'Future occurrences were generated first');
      assert.ok(open.every(o => o.startsAt > new Date()), 'Only future dates are generated');
      assert.equal((await db.event.findUnique({ where: { id: event.id } })).status, 'ACTIVE');

      const finite = await f.events.createEvent(gid, 'creator', { title: 'Three sessions', channelId: '123', startsAt: start.toISOString(), duration: 60, rrule: 'FREQ=DAILY;COUNT=3' });
      await db.eventOccurrence.updateMany({ where: { eventId: finite.id }, data: { status: 'CLOSED' } });
      assert.equal(await f.events.archiveIfFinished(finite.id), true, 'An exhausted rule is archived');
    });
  } finally { await db.$disconnect(); }
});

test('events, occurrences, RSVPs and lineup drafts are only reachable through their own guild', { skip: !enabled }, async () => {
  const db = new PrismaClient(); const gid = '999999999999908105'; const other = '999999999999908106';
  const f = fixture(db);
  try {
    await withGuilds(db, [gid, other], async () => {
      const event = await f.events.createEvent(gid, 'creator', { title: 'Private', channelId: '123', startsAt: new Date(Date.now() + 86400000).toISOString(), duration: 60 });
      const occ = event.occurrences[0];
      await f.publisher.publishOccurrence(occ.id);
      await f.rsvps.upsertRsvp(occ.id, 'member', 'Member', null, 'ACCEPTED');

      await assert.rejects(f.events.getEvent(other, event.id), /not found/);
      await assert.rejects(f.events.updateEvent(other, event.id, { title: 'Hijacked' }), /not found/);
      await assert.rejects(f.events.cancelOccurrence(other, event.id, occ.id), /not found/);
      await assert.rejects(f.events.deleteEvent(other, event.id), /not found/);
      assert.deepEqual(await f.rsvps.getFlatRsvps(other, event.id, occ.id), []);
      assert.deepEqual((await f.rsvps.getRsvps(other, event.id, occ.id)).accepted, []);
      assert.equal((await f.rsvps.getFlatRsvps(gid, event.id, occ.id)).length, 1);
      assert.equal((await f.events.getEvent(gid, event.id)).title, 'Private');

      const lineup = new LineupService(db, { getGuildMembers: async () => [] }, {});
      const draft = await lineup.createDraft(gid, 'creator', { title: 'Draft', assignments: { gk: 'Keeper' }, occurrence_id: occ.id });
      assert.deepEqual(draft.assignments, { gk: { name: 'Keeper' } });
      await assert.rejects(lineup.getDraft(other, draft.id), /not found/);
      await assert.rejects(lineup.updateDraft(other, draft.id, { title: 'x' }), /not found/);
      await assert.rejects(lineup.createDraft(other, 'creator', { occurrence_id: occ.id }), /not found/, 'Cannot link another guild\'s event');
      const members = await lineup.getLineupMembers(other, occ.id);
      assert.deepEqual(members, [], 'RSVPs of another guild are not exposed');
    });
  } finally { await db.$disconnect(); }
});

test('cancelling marks the Discord message cancelled and later RSVPs are rejected', { skip: !enabled }, async () => {
  const db = new PrismaClient(); const gid = '999999999999908107';
  const f = fixture(db);
  try {
    await withGuilds(db, [gid], async () => {
      const event = await f.events.createEvent(gid, 'creator', { title: 'To cancel', channelId: '123', startsAt: new Date(Date.now() + 86400000).toISOString(), duration: 60 });
      const occ = event.occurrences[0];
      await assert.rejects(f.rsvps.upsertRsvp(occ.id, 'early', 'Early', null, 'ACCEPTED'), RsvpClosedException, 'Not announced yet');
      await f.publisher.publishOccurrence(occ.id);
      const result = await f.events.cancelOccurrence(gid, event.id, occ.id);
      assert.equal(result.status, 'CANCELLED');
      assert.deepEqual(result.discordSync, { updated: 1, failed: 0 });
      const patch = f.discord.patches.at(-1);
      assert.match(patch.body.embeds[0].title, /CANCELLED/);
      assert.deepEqual(patch.body.components, []);
      await assert.rejects(f.rsvps.upsertRsvp(occ.id, 'late', 'Late', null, 'ACCEPTED'), RsvpClosedException);
      assert.equal((await db.event.findUnique({ where: { id: event.id } })).status, 'ARCHIVED', 'Nothing left to run');

      const doomed = await f.events.createEvent(gid, 'creator', { title: 'To delete', channelId: '123', startsAt: new Date(Date.now() + 86400000).toISOString(), duration: 60 });
      await f.publisher.publishOccurrence(doomed.occurrences[0].id);
      const before = f.discord.patches.length;
      await f.events.deleteEvent(gid, doomed.id);
      assert.equal(f.discord.patches.length, before + 1, 'Deleting edits the live announcement');
      assert.deepEqual(f.discord.patches.at(-1).body.components, []);
      assert.equal(await db.event.count({ where: { id: doomed.id } }), 0);
    });
  } finally { await db.$disconnect(); }
});
