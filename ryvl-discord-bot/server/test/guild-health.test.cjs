'use strict';
// GET api/guilds/:guildId/health: shape and per-feed verdicts, against a fake Prisma.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PATH_METADATA, GUARDS_METADATA } = require('@nestjs/common/constants');
const { HealthService, isStale } = require('../dist/health/health.service');
const { HealthController } = require('../dist/health/health.controller');
const { AuthGuard } = require('../dist/auth/auth.guard');
const { GuildAdminGuard } = require('../dist/auth/guild-admin.guard');

const NOW = new Date('2026-10-06T12:00:00Z');
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000);

/** Records every query; each model answers from the given fixtures. */
function fakePrisma(f = {}) {
  const calls = [];
  const log = (model, op, args) => calls.push({ model, op, args });
  return {
    calls,
    clubTrackerConfig: { findUnique: async (a) => (log('clubTrackerConfig', 'findUnique', a), f.tracker ?? null) },
    processedEaMatch: {
      count: async (a) => {
        log('processedEaMatch', 'count', a);
        return a.where.postAttempts.lt !== undefined ? f.pending ?? 0 : f.failed ?? 0;
      },
    },
    trackedClub: { findMany: async (a) => (log('trackedClub', 'findMany', a), f.clubs ?? []) },
    vpgTransferConfig: { findUnique: async (a) => (log('vpgTransferConfig', 'findUnique', a), f.transfers ?? null) },
    vpgNotificationConfig: { findUnique: async (a) => (log('vpgNotificationConfig', 'findUnique', a), f.notifications ?? null) },
    superligaMvpMatch: {
      findFirst: async (a) => {
        log('superligaMvpMatch', 'findFirst', a);
        if (a.select?.season) return f.mvpSeason ? { season: f.mvpSeason } : null;
        return f.mvpAttempt ?? null;
      },
      groupBy: async (a) => (log('superligaMvpMatch', 'groupBy', a), f.mvpGroups ?? []),
    },
    totwConfig: { findMany: async (a) => (log('totwConfig', 'findMany', a), f.totw ?? []) },
    eventOccurrence: {
      findFirst: async (a) => (log('eventOccurrence', 'findFirst', a), f.next ?? null),
      count: async (a) => {
        log('eventOccurrence', 'count', a);
        return a.where.publishClaimToken ? f.stuck ?? 0 : f.overdue ?? 0;
      },
    },
  };
}

const FEEDS = ['eaTracker', 'trackedClubs', 'vpgTransfers', 'vpgNotifications', 'superligaMvp', 'totw', 'events'];
const STATES = new Set(['ok', 'warning', 'error', 'off']);

test('the route is GET api/guilds/:guildId/health behind AuthGuard and GuildAdminGuard', () => {
  assert.equal(Reflect.getMetadata(PATH_METADATA, HealthController), 'api/guilds');
  assert.equal(Reflect.getMetadata(PATH_METADATA, HealthController.prototype.getHealth), ':guildId/health');
  const guards = Reflect.getMetadata(GUARDS_METADATA, HealthController);
  assert.ok(guards.includes(AuthGuard) && guards.includes(GuildAdminGuard));
});

test('an empty guild reports every feed as off, scoped to that guild', async () => {
  const prisma = fakePrisma();
  const health = await new HealthService(prisma).getGuildHealth('g1', NOW);
  assert.equal(health.generatedAt, NOW.toISOString());
  for (const key of FEEDS) {
    assert.ok(STATES.has(health[key].status), `${key} has a status`);
    assert.equal(typeof health[key].reason, 'string', `${key} has a reason`);
  }
  assert.deepEqual(FEEDS.map((k) => health[k].status), FEEDS.map(() => 'off'));
  assert.equal(health.eaTracker.pendingPosts, 0);
  assert.deepEqual(health.trackedClubs.clubs, []);
  assert.deepEqual(health.totw.configs, []);
  assert.equal(health.events.nextOccurrence, null);
  // Every guild-owned query filters by the guild (the MVP sync is league-wide).
  for (const call of prisma.calls.filter((c) => c.model !== 'superligaMvpMatch')) {
    const where = call.args.where;
    assert.ok(where.guildId === 'g1' || where.event?.guildId === 'g1', `${call.model}.${call.op} is scoped`);
  }
});

test('healthy feeds are ok and expose the fields the dashboard and channels tab use', async () => {
  const prisma = fakePrisma({
    tracker: { clubId: '128199', clubName: 'RYVL', channelId: 'c1', enabled: true, lastPolledAt: minutesAgo(1), pollIntervalSec: 90 },
    clubs: [{ clubId: '5', clubName: 'Rivals', platform: 'common-gen5', enabled: true, channelId: 'c2', lastPolledAt: minutesAgo(2) }],
    transfers: { channelId: 'c3', enabled: true, lastPolledAt: minutesAgo(1), pollIntervalSec: 120 },
    notifications: { lastPolledAt: minutesAgo(1), lastSuccessAt: minutesAgo(1), lastError: null, retryAfter: null, pollIntervalSec: 120 },
    mvpSeason: 7,
    mvpGroups: [{ status: 'LINKED', _count: { _all: 10 } }, { status: 'SCHEDULED', _count: { _all: 3 } }],
    mvpAttempt: { lastAttemptAt: minutesAgo(30), lastError: null, status: 'LINKED' },
    totw: [{ leagueSlug: 'Superliga-Romania', enabled: true, channelId: 'c4', cronSchedule: '0 20 * * 6', lastPostedAt: minutesAgo(60 * 24 * 3), updatedAt: minutesAgo(60 * 24 * 30) }],
    next: { startsAt: minutesAgo(-60), event: { id: 'e1', title: 'Scrim' } },
  });
  const health = await new HealthService(prisma).getGuildHealth('g1', NOW);
  assert.deepEqual(FEEDS.map((k) => health[k].status), FEEDS.map(() => 'ok'));
  assert.equal(health.eaTracker.channelId, 'c1');
  assert.equal(health.trackedClubs.clubs[0].channelId, 'c2');
  assert.equal(health.vpgTransfers.channelId, 'c3');
  assert.equal(health.totw.configs[0].channelId, 'c4');
  assert.deepEqual(health.superligaMvp.counts, { LINKED: 10, SCHEDULED: 3 });
  assert.equal(health.superligaMvp.season, 7);
  assert.deepEqual(health.events.nextOccurrence, { eventId: 'e1', title: 'Scrim', startsAt: minutesAgo(-60) });
  // The result must survive JSON serialisation (it is the HTTP body).
  assert.doesNotThrow(() => JSON.stringify(health));
});

test('problems turn into warnings and errors with a reason', async () => {
  const prisma = fakePrisma({
    tracker: { clubId: '1', clubName: 'RYVL', channelId: 'c1', enabled: true, lastPolledAt: minutesAgo(1), pollIntervalSec: 90 },
    failed: 2,
    pending: 1,
    clubs: [{ clubId: '5', clubName: 'Rivals', platform: 'common-gen5', enabled: true, channelId: null, lastPolledAt: null }],
    transfers: { channelId: null, enabled: true, lastPolledAt: null, pollIntervalSec: 120 },
    notifications: { lastPolledAt: minutesAgo(1), lastSuccessAt: minutesAgo(60 * 30), lastError: 'VPG 503', retryAfter: minutesAgo(-5), pollIntervalSec: 120 },
    mvpSeason: 7,
    mvpGroups: [{ status: 'PENDING', _count: { _all: 2 } }],
    mvpAttempt: { lastAttemptAt: minutesAgo(5), lastError: 'No EA match found yet', status: 'PENDING' },
    totw: [{ leagueSlug: 'Superliga-Romania', enabled: true, channelId: null, cronSchedule: null, lastPostedAt: null, updatedAt: minutesAgo(10) }],
    stuck: 1,
    overdue: 3,
  });
  const h = await new HealthService(prisma).getGuildHealth('g1', NOW);
  assert.equal(h.eaTracker.status, 'error');
  assert.match(h.eaTracker.reason, /2 match posts gave up/);
  assert.equal(h.eaTracker.failedPosts, 2);
  assert.equal(h.eaTracker.pendingPosts, 1);
  assert.equal(h.trackedClubs.status, 'warning');
  assert.match(h.trackedClubs.reason, /Rivals/);
  assert.equal(h.vpgTransfers.status, 'error');
  assert.equal(h.vpgNotifications.status, 'error', 'failing for over a day');
  assert.match(h.vpgNotifications.reason, /VPG 503/);
  assert.equal(h.superligaMvp.status, 'warning');
  assert.equal(h.superligaMvp.lastError, 'No EA match found yet');
  assert.equal(h.totw.status, 'error');
  assert.equal(h.events.status, 'error');
  assert.equal(h.events.stuckClaims, 1);
  assert.equal(h.events.overdue, 3);
});

test('a recent notifications error is only a warning; a stale poll is a warning', async () => {
  const h = await new HealthService(fakePrisma({
    notifications: { lastPolledAt: minutesAgo(1), lastSuccessAt: minutesAgo(10), lastError: 'timeout', retryAfter: null, pollIntervalSec: 120 },
    transfers: { channelId: 'c', enabled: true, lastPolledAt: minutesAgo(45), pollIntervalSec: 120 },
  })).getGuildHealth('g1', NOW);
  assert.equal(h.vpgNotifications.status, 'warning');
  assert.equal(h.vpgTransfers.status, 'warning');
  assert.match(h.vpgTransfers.reason, /45 min ago/);
});

test('isStale allows three intervals and at least ten minutes', () => {
  assert.equal(isStale(null, 90, NOW), true);
  assert.equal(isStale(minutesAgo(9), 60, NOW), false);
  assert.equal(isStale(minutesAgo(11), 60, NOW), true);
  assert.equal(isStale(minutesAgo(25), 600, NOW), false);
});
