'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TtlCache } = require('../dist/vpg/ttl-cache.js');
const schedule = require('../dist/vpg/totw-schedule.js');
const score = require('../dist/superliga-mvp/mvp-score.js');
const poller = require('../dist/vpg/vpg-poller.service.js');
const constants = require('../dist/vpg/league.constants.js');

const safeDatabase = process.env.RUN_DATABASE_TESTS === '1' && /^postgres(?:ql)?:\/\/[^@]+@(?:localhost|127\.0\.0\.1):\d+\/ryvl_[a-z0-9_]+(?:\?|$)/.test(process.env.DATABASE_URL || '');

test('VPG cache shares one load, expires, does not keep failures and caps its size', async () => {
  let now = 0;
  const cache = new TtlCache(1000, 2, () => now);
  let loads = 0;
  const load = async () => { loads++; return [loads]; };
  const [a, b] = await Promise.all([cache.getOrLoad('k', load), cache.getOrLoad('k', load)]);
  assert.equal(loads, 1, 'concurrent callers share one request');
  assert.deepEqual(a, b);
  now = 999;
  await cache.getOrLoad('k', load);
  assert.equal(loads, 1, 'still fresh');
  now = 1000;
  assert.deepEqual(await cache.getOrLoad('k', load), [2], 'reloaded after the TTL');

  await assert.rejects(cache.getOrLoad('bad', async () => { throw new Error('VPG down'); }));
  await new Promise((r) => setImmediate(r));
  assert.equal(await cache.getOrLoad('bad', async () => 'ok'), 'ok', 'a failure is retried, not cached');

  await cache.getOrLoad('x', async () => 1);
  await cache.getOrLoad('y', async () => 1);
  assert.ok(cache.size <= 2, 'oldest entries are evicted past the cap');
});

test('league identity lives in one place', () => {
  assert.equal(constants.SUPERLIGA_LEAGUE_SLUG, 'Superliga-Romania');
  assert.equal(constants.COMMUNITY_SLUG, 'VPGRoPS5');
  assert.equal(constants.DEFAULT_TOTW_CRON, '0 20 * * 6');
  assert.equal(constants.leagueDisplayName('Superliga-Romania'), 'Superliga România');
  assert.equal(constants.leagueDisplayName('Liga-2-Romania'), 'Liga 2 Romania');
});

test('TOTW schedule honours each config cron in its time zone, once per occurrence', () => {
  // Saturday 2026-10-10 20:00 in Bucharest (UTC+3) is 17:00 UTC.
  const sat20 = new Date('2026-10-10T17:00:00Z');
  const at = (ms) => new Date(sat20.getTime() + ms);
  const due = schedule.dueTotwOccurrence('0 20 * * 6', 'Europe/Bucharest', at(30 * 1000), null);
  assert.equal(due && due.toISOString(), sat20.toISOString());
  assert.equal(schedule.dueTotwOccurrence('0 20 * * 6', 'Europe/Bucharest', at(-60 * 1000), null), null, 'not before the time');
  assert.equal(schedule.dueTotwOccurrence('0 20 * * 6', 'Europe/Bucharest', at(5 * 60 * 1000), at(60 * 1000)), null, 'already posted');
  assert.equal(schedule.dueTotwOccurrence('0 20 * * 6', 'Europe/Bucharest', at(3 * 60 * 60 * 1000), null), null, 'too late to catch up');
  assert.ok(schedule.dueTotwOccurrence('0 20 * * 6', 'Europe/Bucharest', at(90 * 60 * 1000), new Date('2026-10-03T17:01:00Z')), 'missed by a restart, still posted');
  // Null and blank schedules use the default; the guild time zone shifts the hour.
  assert.ok(schedule.dueTotwOccurrence(null, null, at(1000), null));
  assert.equal(schedule.dueTotwOccurrence('0 20 * * 6', 'Europe/London', at(1000), null), null, '20:00 London (BST) is 19:00 UTC');
  assert.ok(schedule.dueTotwOccurrence('0 20 * * 6', 'Europe/London', at(2 * 60 * 60 * 1000 + 1000), null));
  assert.ok(schedule.dueTotwOccurrence('0 20 * * 6', 'Not/AZone', at(1000), null), 'an invalid zone falls back to Bucharest');
  // A Monday schedule is not due on Saturday.
  assert.equal(schedule.dueTotwOccurrence('0 18 * * 1', 'Europe/Bucharest', at(1000), null), null);
  assert.equal(schedule.cronScheduleError('0 20 * * 6'), null);
  assert.ok(schedule.cronScheduleError('every saturday'));
  assert.ok(schedule.cronScheduleError('0 25 * * 6'));
  assert.ok(schedule.cronScheduleError('0 0 20 * * 6'), 'six fields (seconds) are rejected');
});

test('TOTW week is half the VPG session week, rounded up', () => {
  const { totwWeekFromSession } = require('../dist/vpg/totw.service.js');
  assert.equal(totwWeekFromSession(null), null);
  assert.equal(totwWeekFromSession(1), 1);
  assert.equal(totwWeekFromSession(2), 1);
  assert.equal(totwWeekFromSession(3), 2);
  assert.equal(totwWeekFromSession(0), 1);
});

test('TOTW line-up uses the shared VPG leaderboard entries, ratings and clean sheets included', () => {
  const { TotwService } = require('../dist/vpg/totw.service.js');
  const service = new TotwService(null, null, null, null);
  const e = (username, extra = {}) => ({ rank: 1, username, teamName: 'Club', goals: 1, assists: 0, matchesPlayed: 2, rating: 7.84, cleanSheets: 1, userAvatarUrl: 'https://cdn/x', ...extra });
  const players = service.resolvePositions({
    gk: [e('keeper')],
    cb: [e('keeper'), e('cb1'), e('cb2'), e('cb3'), e('cb4')],
    cdm: [e('cdm1'), e('cdm2')],
    cam: [e('cam1')],
    wingers: [e('w1'), e('w2')],
    strikers: [e('s1'), e('s2', { rating: null })],
  });
  assert.deepEqual(players.cb.map((p) => p.username), ['cb1', 'cb2', 'cb3'], 'a player fills one slot only');
  assert.equal(players.gk[0].rating, '7.8');
  assert.equal(players.gk[0].clean_sheets, 1);
  assert.equal(players.gk[0].avatar_url, 'https://cdn/x');
  assert.equal(players.st[1].rating, undefined);
  assert.deepEqual([players.lm[0].username, players.rm[0].username], ['w1', 'w2']);
});

const mvpRow = (playerName, playerProId, stats = {}) => ({
  playerName, playerProId, teamName: 'Team', pos: 'midfielder', rating: 7, goals: 0, assists: 0, shots: 0, passesMade: 0, passAttempts: 0,
  tacklesMade: 0, tackleAttempts: 0, saves: 0, goalsConceded: 0, cleanSheetDef: 0, cleanSheetGk: 0, mom: 0, redCards: 0,
  playedAt: new Date('2026-10-01T19:30:00Z'), ...stats,
});

test('MVP players are grouped by EA player id, survive renames and fall back to the name', () => {
  const rows = [
    mvpRow('OldTag', '1001', { goals: 1, playedAt: new Date('2026-10-01T19:00:00Z') }),
    mvpRow('NewTag', '1001', { goals: 2, playedAt: new Date('2026-10-08T19:00:00Z'), teamName: 'New Club' }),
    mvpRow('Same Name', '2001'),
    mvpRow('same name', '2002'),
    mvpRow('NoId', null),
    mvpRow('noid', ''),
    mvpRow('NoId', '0'),
  ];
  const players = score.aggregatePlayers(rows);
  const renamed = players.find((p) => p.playerName === 'NewTag');
  assert.equal(renamed.totals.matches, 2, 'one player across a gamertag change');
  assert.equal(renamed.totals.goals, 3);
  assert.equal(renamed.teamName, 'New Club');
  assert.deepEqual(renamed.names.sort(), ['NewTag', 'OldTag']);
  // Rows sharing a name (with or without ids) stay one player, as before.
  assert.equal(players.find((p) => p.playerName.toLowerCase() === 'same name').totals.matches, 2);
  assert.equal(players.find((p) => p.playerName.toLowerCase() === 'noid').totals.matches, 3);
  assert.equal(players.length, 3);

  // TOTW picks under either gamertag count, once per pick.
  const count = score.totwCounter([{ names: ['vpg_user', 'OldTag'] }, { names: ['newtag', 'OldTag'] }, { names: ['someone'] }]);
  const board = score.buildMvpLeaderboard(rows, 1, count);
  assert.equal(board.entries.find((e) => e.playerName === 'NewTag').totwCount, 2);
  assert.equal(count('oldtag'), 2, 'a single name still works');
});

test('transfer poller pages back to the checkpoint and returns new transfers oldest first', async () => {
  const feed = Array.from({ length: 130 }, (_, i) => ({ id: 1000 - i, username: `u${i}`, datetime: '2026-10-01T10:00:00Z' }));
  const calls = [];
  const fetchPage = async (limit, offset) => { calls.push(offset); return feed.slice(offset, offset + limit); };
  const { fresh, complete } = await poller.collectTransfersSince(fetchPage, 1000 - 120, 50, 10);
  assert.equal(complete, true);
  assert.equal(fresh.length, 120);
  assert.equal(fresh[0].id, 881);
  assert.equal(fresh.at(-1).id, 1000);
  assert.deepEqual(calls, [0, 50, 100], 'stops at the page holding the checkpoint');

  const capped = await poller.collectTransfersSince(fetchPage, 0, 50, 2);
  assert.equal(capped.complete, false);
  assert.equal(capped.fresh.length, 100);

  const none = await poller.collectTransfersSince(async () => [], 5);
  assert.deepEqual(none, { fresh: [], complete: true });
  assert.equal(poller.transferPollIntervalSec(10), 60);
  assert.equal(poller.transferPollIntervalSec(300), 300);
  assert.equal(poller.transferPollIntervalSec(99999), 3600);
  assert.equal(poller.transferPollIntervalSec(undefined), 120);
});

test('transfer poller only advances past a transfer once it is posted', { skip: !safeDatabase }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const { VpgPollerService } = poller;
  const guildId = '999999999999910001';
  const movements = [12, 11, 10].map((id) => ({ id, username: `player${id}`, datetime: '2026-10-01T10:00:00Z', from_name: 'A', to_name: 'B', amount: 0 }));
  const vpg = {
    fetchRawMovements: async (limit, offset) => movements.slice(offset, offset + limit),
    enrichTransfer: async (raw) => ({ id: raw.id, username: raw.username, fromName: 'A', toName: 'B', amount: 0, amountFormatted: 'Free', datetime: raw.datetime, dateFormattedRo: 'today', superligaClubs: [] }),
    isTransferProcessed: async (g, id) => !!(await prisma.processedVpgTransfer.findUnique({ where: { guildId_transferId: { guildId: g, transferId: id } } })),
    recordProcessedTransfer: (p) => prisma.processedVpgTransfer.upsert({
      where: { guildId_transferId: { guildId: p.guildId, transferId: p.transferId } },
      create: { guildId: p.guildId, transferId: p.transferId, username: p.username, occurredAt: p.occurredAt, discordMessageId: p.discordMessageId, channelId: p.channelId },
      update: { discordMessageId: p.discordMessageId },
    }),
  };
  let failOn = 11;
  const sent = [];
  const discord = { sendMessageToChannel: async (channelId, embed) => {
    const player = embed.data.fields[0].value;
    if (failOn && player === `player${failOn}`) throw new Error('Discord 500');
    sent.push(player);
    return { id: `msg${sent.length}` };
  } };
  const service = new VpgPollerService(prisma, vpg, discord);
  try {
    await prisma.guild.upsert({ where: { id: guildId }, create: { id: guildId, name: 'CI transfers' }, update: {} });
    await prisma.vpgTransferConfig.upsert({ where: { guildId }, create: { guildId, channelId: 'chan', enabled: true, lastTransferId: 9 }, update: { lastTransferId: 9 } });
    let config = await prisma.vpgTransferConfig.findUnique({ where: { guildId } });
    let r = await service.pollGuild(config);
    assert.equal(r.postedCount, 1, '#10 posted, #11 failed');
    config = await prisma.vpgTransferConfig.findUnique({ where: { guildId } });
    assert.equal(config.lastTransferId, 10, 'checkpoint stops before the failed transfer');
    assert.equal(await prisma.processedVpgTransfer.count({ where: { guildId, transferId: 11 } }), 0, 'a failed send is not marked processed');

    failOn = null;
    r = await service.pollGuild(config);
    assert.equal(r.postedCount, 2, '#11 retried, then #12');
    config = await prisma.vpgTransferConfig.findUnique({ where: { guildId } });
    assert.equal(config.lastTransferId, 12);
    assert.equal(await prisma.processedVpgTransfer.count({ where: { guildId, discordMessageId: { not: null } } }), 3);
    assert.deepEqual(sent, ['player10', 'player11', 'player12'], 'posted in order');
  } finally {
    await prisma.guild.deleteMany({ where: { id: guildId } });
    await prisma.$disconnect();
  }
});

test('scheduled TOTW posts each due config once, in its league, and retries a failed post', { skip: !safeDatabase }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const { TotwService } = require('../dist/vpg/totw.service.js');
  const guildId = '999999999999920001';
  const discord = { client: { isReady: () => true }, isInGuild: () => true };
  const service = new TotwService(prisma, null, discord, null);
  const posts = [];
  let fail = true;
  service.postTotwToDiscord = async (g, channelId, isTots, leagueSlug) => {
    if (fail) throw new Error('Discord down');
    posts.push([g, channelId, isTots, leagueSlug]);
    return { success: true };
  };
  try {
    await prisma.guild.upsert({ where: { id: guildId }, create: { id: guildId, name: 'CI totw', timezone: 'Europe/Bucharest' }, update: {} });
    await prisma.totwConfig.createMany({ data: [
      { guildId, leagueSlug: 'Superliga-Romania', channelId: 'c1', cronSchedule: '0 20 * * 6', enabled: true },
      { guildId, leagueSlug: 'Liga-2-Romania', channelId: 'c2', cronSchedule: '30 20 * * 6', enabled: true },
      { guildId, leagueSlug: 'Off', channelId: 'c3', cronSchedule: '0 20 * * 6', enabled: false },
    ] });
    const sat = (hhmm) => new Date(`2026-10-10T${hhmm}:00+03:00`);
    assert.equal(await service.handleScheduledTotwPosts(sat('20:00')), 0, 'a failed post is not recorded');
    assert.equal((await prisma.totwConfig.findFirst({ where: { guildId, leagueSlug: 'Superliga-Romania' } })).lastPostedAt, null);
    fail = false;
    assert.equal(await service.handleScheduledTotwPosts(sat('20:05')), 0, 'waits before retrying');
    assert.equal(await service.handleScheduledTotwPosts(sat('20:11')), 1);
    assert.equal(await service.handleScheduledTotwPosts(sat('20:12')), 0, 'never twice for one occurrence');
    assert.equal(await service.handleScheduledTotwPosts(sat('20:31')), 1, 'the second config follows its own schedule');
    assert.deepEqual(posts, [[guildId, 'c1', false, 'Superliga-Romania'], [guildId, 'c2', false, 'Liga-2-Romania']]);
    assert.equal(await service.handleScheduledTotwPosts(new Date('2026-10-17T20:31:00+03:00')), 2, 'next week, both');
  } finally {
    await prisma.guild.deleteMany({ where: { id: guildId } });
    await prisma.$disconnect();
  }
});

test('weekly TOTW picks are recorded without a post, and a recorded week is kept', { skip: !safeDatabase }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const { TotwService } = require('../dist/vpg/totw.service.js');
  const entry = (username) => ({ rank: 1, username, teamName: 'Club', goals: 1, assists: 0, matchesPlayed: 1 });
  let week = 7;
  const vpg = {
    fetchLatestSeason: async () => 98,
    fetchLeaderboardPage: async (pos, season, slug, weekly) => {
      assert.equal(weekly, true);
      return { season, week, entries: [entry(`${pos}-a`), entry(`${pos}-b`), entry(`${pos}-c`)] };
    },
    fetchUserGamertags: async (u) => [`${u}-psn`],
  };
  const service = new TotwService(prisma, null, null, vpg);
  const where = { leagueSlug: 'Superliga-Romania', season: 98 };
  try {
    await prisma.superligaMvpTotwSelection.deleteMany({ where });
    // One pick per nameplate on the card: GK, 3 CB, CDM, 2 CM, CAM, LM, RM, 2 ST.
    assert.equal(await service.recordSuperligaWeek(), 12);
    const rows = await prisma.superligaMvpTotwSelection.findMany({ where: { ...where, week: 4 } });
    assert.equal(rows.length, 12, 'session week 7 is TOTW week 4');
    assert.deepEqual(rows.find((r) => r.vpgUsername === 'gk-a').eaNames, ['gk-a-psn']);
    assert.equal(await service.recordSuperligaWeek(), 0, 'already recorded');
    week = null;
    assert.equal(await service.recordSuperligaWeek(), 0, 'no week, nothing recorded');
    vpg.fetchLeaderboardPage = async () => { throw new Error('VPG down'); };
    assert.equal(await service.recordSuperligaWeek(), 0, 'VPG errors are not recorded as an empty week');
    assert.equal(await prisma.superligaMvpTotwSelection.count({ where }), 12);
  } finally {
    await prisma.superligaMvpTotwSelection.deleteMany({ where });
    await prisma.$disconnect();
  }
});

test('nightly retention keeps receipts the poller still reads', { skip: !safeDatabase }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const { VpgRetentionService } = require('../dist/vpg/vpg-retention.service.js');
  const guildId = '999999999999930001';
  const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const service = new VpgRetentionService(prisma);
  try {
    await prisma.guild.upsert({ where: { id: guildId }, create: { id: guildId, name: 'CI retention' }, update: {} });
    await prisma.ryvlCompetition.create({ data: { guildId, name: 'Pinned', slug: 'Pinned-League', season: 3 } });
    const receipt = (channelId, topic, itemKey) => ({ guildId, channelId, topic, itemKey, fingerprint: 'f' });
    await prisma.vpgNotificationDelivery.createMany({ data: [
      receipt('c', 'result:Superliga-Romania', '5:1'), // old season of a feed that moved on -> removed
      receipt('c', 'result:Superliga-Romania', 'baseline:general:5'), // -> removed
      receipt('c', 'result:Superliga-Romania', '6:2'), // current season -> kept even when old
      receipt('c', 'result:Pinned-League', '3:3'), // pinned competition season -> kept
      receipt('c', 'result:Pinned-League', '4:4'),
      receipt('c', 'fixtures:Superliga-Romania', '6:2026-01-01:0'), // past day -> removed
      receipt('c', 'standings:Superliga-Romania', '6:2026-01-04'), // past day -> removed
    ] });
    await prisma.vpgNotificationDelivery.updateMany({ where: { guildId }, data: { updatedAt: old } });
    await prisma.vpgNotificationDelivery.create({ data: receipt('c', 'fixtures:Superliga-Romania', '6:today:0') });
    await prisma.processedVpgTransfer.createMany({ data: [
      { guildId, transferId: 1, username: 'old', occurredAt: old, createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) },
      { guildId, transferId: 2, username: 'new', occurredAt: old },
    ] });
    const match = (vpgMatchId, season) => ({ vpgMatchId, leagueSlug: 'CI-Retention', season, kickoffAt: old, homeTeamName: 'H', awayTeamName: 'A', status: 'LINKED', rawPayload: { matchId: String(vpgMatchId) } });
    await prisma.superligaMvpMatch.createMany({ data: [match(970001, 1), match(970002, 2)] });

    const r = await service.cleanup();
    const keys = (await prisma.vpgNotificationDelivery.findMany({ where: { guildId } })).map((d) => `${d.topic}|${d.itemKey}`).sort();
    assert.deepEqual(keys, [
      'fixtures:Superliga-Romania|6:today:0',
      'result:Pinned-League|3:3',
      'result:Pinned-League|4:4',
      'result:Superliga-Romania|6:2',
    ]);
    assert.equal(r.deliveries, 4);
    assert.deepEqual((await prisma.processedVpgTransfer.findMany({ where: { guildId } })).map((t) => t.transferId), [2]);
    const payloads = await prisma.superligaMvpMatch.findMany({ where: { leagueSlug: 'CI-Retention' }, orderBy: { season: 'asc' } });
    assert.equal(payloads[0].rawPayload, null);
    assert.deepEqual(payloads[1].rawPayload, { matchId: '970002' });
  } finally {
    await prisma.superligaMvpMatch.deleteMany({ where: { leagueSlug: 'CI-Retention' } });
    await prisma.guild.deleteMany({ where: { id: guildId } });
    await prisma.$disconnect();
  }
});

test('MVP sync keeps resolving the previous season after VPG moves to a new one', { skip: !safeDatabase }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const { SuperligaMvpService } = require('../dist/superliga-mvp/superliga-mvp.service.js');
  const ids = [960001, 960002, 960003];
  const league = 'CI-Previous-Season';
  const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const lists = {
    96: { complete: [{ id: ids[0], datetime: recent, matchDay: 9, homeName: 'H', awayName: 'A', homeScore: 1, awayScore: 0 }], scheduled: [] },
    97: { complete: [], scheduled: [] },
  };
  const vpg = {
    fetchLatestSeason: async () => 96,
    fetchLeagueTeams: async () => [],
    fetchAllMatches: async (status, season) => lists[season][status],
    fetchMatchDetail: async (id) => ({ id, homeTeamId: null, awayTeamId: null }),
  };
  const service = new SuperligaMvpService(prisma, vpg, { fetchMatchesRaw: async () => [] });
  const where = { vpgMatchId: { in: ids } };
  try {
    await prisma.superligaMvpMatch.deleteMany({ where });
    await service.sync(league);
    assert.equal((await prisma.superligaMvpMatch.findUnique({ where: { vpgMatchId: ids[0] } })).status, 'PENDING');
    // Season 97 starts. Season 96's last result is reported late; an old unplayed fixture is closed.
    lists[96].complete.push({ id: ids[1], datetime: recent, matchDay: 10, homeName: 'H', awayName: 'B', homeScore: 2, awayScore: 2 });
    await prisma.superligaMvpMatch.create({ data: { vpgMatchId: ids[2], leagueSlug: league, season: 96, kickoffAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), homeTeamName: 'H', awayTeamName: 'C', status: 'SCHEDULED' } });
    vpg.fetchLatestSeason = async () => 97;
    await prisma.superligaMvpMatch.update({ where: { vpgMatchId: ids[0] }, data: { completedAt: new Date(Date.now() - 80 * 60 * 60 * 1000), kickoffAt: new Date(Date.now() - 80 * 60 * 60 * 1000) } });
    const r = await service.sync(league);
    assert.equal(r.season, 97);
    const byId = Object.fromEntries((await prisma.superligaMvpMatch.findMany({ where })).map((m) => [m.vpgMatchId, m.status]));
    assert.deepEqual(byId, { [ids[0]]: 'EXPIRED', [ids[1]]: 'PENDING', [ids[2]]: 'CANCELLED' });
    assert.ok(r.expired >= 1);
  } finally {
    await prisma.superligaMvpMatch.deleteMany({ where });
    await prisma.$disconnect();
  }
});
