'use strict';
// EA Pro Clubs tracking: unified poll path, retries, Elo, scoping and caching.
// Uses the compiled services against an in-memory Prisma stand-in; nothing
// reaches EA, Discord or a database.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EaService, computeElo } = require('../dist/ea/ea.service');
const { EaPollerService, buildPollTargets, isPollDue } = require('../dist/ea/ea-poller.service');

function matchesWhere(row, where = {}) {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') { if (!cond.some((c) => matchesWhere(row, c))) return false; continue; }
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond && !cond.in.includes(value)) return false;
      if ('not' in cond && value === cond.not) return false;
      if ('lt' in cond && !(value < cond.lt)) return false;
      if ('gte' in cond && !(value >= cond.gte)) return false;
      if ('equals' in cond) {
        const eq = cond.mode === 'insensitive' ? String(value).toLowerCase() === String(cond.equals).toLowerCase() : value === cond.equals;
        if (!eq) return false;
      }
      if ('contains' in cond && !String(value).toLowerCase().includes(String(cond.contains).toLowerCase())) return false;
      if ('is' in cond) continue;
    } else if (value !== cond) return false;
  }
  return true;
}
function applyData(row, data) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in v) row[k] = (row[k] || 0) + v.increment;
    else row[k] = v;
  }
  return row;
}
function sortRows(rows, orderBy) {
  const list = [].concat(orderBy || []);
  return rows.slice().sort((a, b) => {
    for (const o of list) {
      const [k, dir] = Object.entries(o)[0];
      if (a[k] < b[k]) return dir === 'asc' ? -1 : 1;
      if (a[k] > b[k]) return dir === 'asc' ? 1 : -1;
    }
    return 0;
  });
}
let ids = 0;
function table(uniqueFields = []) {
  const rows = [];
  const uniqueOf = (where) => {
    const [key, value] = Object.entries(where)[0];
    if (key === 'id' || typeof value !== 'object') return rows.find((r) => r[key] === value);
    return rows.find((r) => Object.entries(value).every(([k, v]) => r[k] === v));
  };
  return {
    rows,
    findMany: async ({ where, orderBy, take } = {}) => {
      const out = sortRows(rows.filter((r) => matchesWhere(r, where)), orderBy);
      return (take ? out.slice(0, take) : out).map((r) => ({ ...r }));
    },
    findFirst: async ({ where, orderBy } = {}) => {
      const row = sortRows(rows.filter((r) => matchesWhere(r, where)), orderBy)[0];
      return row ? { ...row } : null;
    },
    findUnique: async ({ where }) => { const row = uniqueOf(where); return row ? { ...row } : null; },
    create: async ({ data }) => {
      for (const fields of uniqueFields) {
        if (rows.some((r) => fields.every((f) => r[f] === data[f]))) throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const row = { id: 'id-' + ++ids, createdAt: new Date(), postPending: false, postAttempts: 0, ...data };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }) => applyData(uniqueOf(where), data),
    updateMany: async ({ where, data }) => {
      const hit = rows.filter((r) => matchesWhere(r, where));
      hit.forEach((r) => applyData(r, data));
      return { count: hit.length };
    },
    upsert: async ({ where, create, update }) => {
      const found = uniqueOf(where);
      if (found) return applyData(found, update);
      const row = { id: 'id-' + ++ids, createdAt: new Date(), ...create };
      rows.push(row);
      return row;
    },
    deleteMany: async ({ where }) => {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) if (matchesWhere(rows[i], where)) rows.splice(i, 1);
      return { count: before - rows.length };
    },
  };
}
function fakePrisma() {
  return {
    guild: table(),
    clubTrackerConfig: table([['guildId']]),
    trackedClub: table([['guildId', 'clubId']]),
    processedEaMatch: table([['guildId', 'clubId', 'eaMatchId']]),
    eaPlayerMatchStat: Object.assign(table(), { upsert: async () => ({}) }),
    registeredDiscordPlayer: table([['guildId', 'discordUserId']]),
    executed: [],
    $executeRaw(strings, ...values) { this.executed.push({ sql: strings.join('?'), values }); return Promise.resolve(3); },
  };
}

function raw(id, ts, home, away, homeGoals, awayGoals) {
  return {
    matchId: id, timestamp: ts,
    clubs: {
      [home]: { goals: String(homeGoals), score: String(homeGoals), details: { name: 'Club ' + home } },
      [away]: { goals: String(awayGoals), score: String(awayGoals), details: { name: 'Club ' + away } },
    },
    players: {}, aggregate: {},
  };
}

function setup({ feeds = {}, failSend = () => false } = {}) {
  const prisma = fakePrisma();
  const ea = new EaService(prisma);
  ea.runBridge = async (command, args) => {
    assert.equal(command, 'matches');
    const [, clubId, type] = args;
    return structuredClone((feeds[clubId] || []).filter((m) => (m.type || 'leagueMatch') === type));
  };
  const sent = [];
  const discord = {
    isInGuild: () => true,
    sendMessageToChannel: async (channel, embed) => {
      if (failSend(channel, sent.length)) throw new Error('Missing Access');
      sent.push({ channel, description: embed.toJSON().description });
      return { id: 'msg-' + sent.length };
    },
  };
  const poller = new EaPollerService(prisma, ea, discord, { frontendUrl: 'https://ryvl.top' });
  return { prisma, ea, poller, sent, feeds };
}

const GUILD = '111111111111111111';

test('buildPollTargets merges the primary club with its TrackedClub copy into one target', () => {
  const configs = [{ guildId: GUILD, clubId: '1', platform: 'common-gen5', clubName: 'RYVL', channelId: 'c1', matchTypes: [], pollIntervalSec: 120, lastMatchId: 'x', elo: 1200 }];
  const tracked = [
    { id: 't1', guildId: GUILD, clubId: '1', platform: 'common-gen5', clubName: 'RYVL', channelId: 'c1', elo: 1250, lastMatchId: 'x' },
    { id: 't2', guildId: GUILD, clubId: '2', platform: 'common-gen5', clubName: 'Other', channelId: 'c2', elo: 1200, lastMatchId: null },
    { id: 't3', guildId: GUILD, clubId: '1', platform: 'nx', clubName: 'RYVL Switch', channelId: 'c3', elo: 1200, lastMatchId: null },
  ];
  const targets = buildPollTargets(configs, tracked);
  assert.equal(targets.length, 3);
  const primary = targets.find((t) => t.isPrimary);
  assert.equal(primary.trackedClubId, 't1');
  assert.equal(primary.elo, 1250);
  assert.equal(primary.pollIntervalSec, 120);
  assert.equal(targets.find((t) => t.clubId === '2').pollIntervalSec, 120, 'tracked clubs use the guild interval');
});

test('isPollDue honours the per-club interval', () => {
  const now = Date.now();
  assert.equal(isPollDue({ lastPolledAt: null, pollIntervalSec: 90 }, now), true);
  assert.equal(isPollDue({ lastPolledAt: new Date(now - 30_000), pollIntervalSec: 90 }, now), false);
  assert.equal(isPollDue({ lastPolledAt: new Date(now - 88_000), pollIntervalSec: 90 }, now), true);
  assert.equal(isPollDue({ lastPolledAt: new Date(now - 200_000), pollIntervalSec: 300 }, now), false);
});

test('computeElo uses expected score against the opponent rating', () => {
  assert.equal(computeElo(1200, 1200, 1), 1216);
  assert.equal(computeElo(1200, 1200, 0), 1184);
  assert.equal(computeElo(1200, 1200, 0.5), 1200);
  assert.ok(computeElo(1200, 1600, 1) - 1200 > computeElo(1200, 1000, 1) - 1200, 'beating a stronger club gains more');
});

test('primary club is polled once per tick even when it was copied into TrackedClub', async () => {
  const f = setup({ feeds: { '1': [raw('m1', 100, '1', '9', 1, 0)] } });
  f.prisma.clubTrackerConfig.rows.push({ id: 'cfg', guildId: GUILD, clubId: '1', clubName: 'RYVL', platform: 'common-gen5', channelId: 'chan', enabled: true, matchTypes: ['leagueMatch'], pollIntervalSec: 90, lastMatchId: 'old', elo: 1200 });
  f.prisma.trackedClub.rows.push({ id: 'tc', guildId: GUILD, clubId: '1', clubName: 'RYVL', platform: 'common-gen5', channelId: 'chan', enabled: true, lastMatchId: 'old', elo: 1200, createdAt: new Date() });
  await f.poller.pollAllGuilds();
  assert.equal(f.sent.length, 1, 'one post, not one per copy');
  assert.equal(f.prisma.processedEaMatch.rows.length, 1);
  assert.equal(f.prisma.processedEaMatch.rows[0].discordMessageId, 'msg-1');
  assert.equal(f.prisma.clubTrackerConfig.rows[0].elo, 1216);
  assert.equal(f.prisma.trackedClub.rows[0].elo, 1216, 'Elo is kept in sync on both records');
  // Polled again immediately: interval not elapsed, nothing fetched or posted.
  f.feeds['1'].push(raw('m2', 200, '1', '9', 0, 0));
  await f.poller.pollAllGuilds();
  assert.equal(f.sent.length, 1);
});

test('first poll records every visible match as history and posts none of them later', async () => {
  const f = setup({ feeds: { '1': [raw('a', 100, '1', '9', 1, 0), raw('b', 200, '9', '1', 2, 2), raw('c', 300, '1', '9', 3, 1)] } });
  const target = buildPollTargets([], [{ id: 'tc', guildId: GUILD, clubId: '1', clubName: 'RYVL', platform: 'common-gen5', channelId: 'chan', lastMatchId: null, elo: 1200 }])[0];
  f.prisma.trackedClub.rows.push({ id: 'tc', guildId: GUILD, clubId: '1', platform: 'common-gen5', elo: 1200 });
  assert.equal((await f.poller.pollClub(target)).postedCount, 0);
  assert.equal(f.prisma.processedEaMatch.rows.length, 3);
  assert.equal(f.prisma.trackedClub.rows[0].lastMatchId, 'c');
  assert.equal((await f.poller.pollClub(target)).postedCount, 0, 'older matches of the first window are not reposted');
  assert.equal(f.sent.length, 0);
});

test('a failed Discord send is not marked processed and is retried on the next poll', async () => {
  let failing = true;
  const f = setup({ feeds: { '1': [raw('m1', 100, '1', '9', 2, 1)] }, failSend: () => failing });
  const target = buildPollTargets([], [{ id: 'tc', guildId: GUILD, clubId: '1', clubName: 'RYVL', platform: 'common-gen5', channelId: 'chan', lastMatchId: 'old', elo: 1200 }])[0];
  f.prisma.trackedClub.rows.push({ id: 'tc', guildId: GUILD, clubId: '1', platform: 'common-gen5', elo: 1200 });
  assert.equal((await f.poller.pollClub(target)).postedCount, 0);
  const row = f.prisma.processedEaMatch.rows[0];
  assert.equal(row.postPending, true);
  assert.equal(row.postAttempts, 1);
  assert.match(row.postError, /Missing Access/);
  assert.equal(f.prisma.trackedClub.rows[0].elo, 1216, 'Elo counts the match even if the post failed');
  failing = false;
  assert.equal((await f.poller.pollClub(target)).postedCount, 1);
  assert.equal(row.postPending, false);
  assert.equal(row.discordMessageId, 'msg-1', 'tracked-club posts keep their Discord message id');
  assert.equal(f.prisma.trackedClub.rows[0].elo, 1216, 'Elo applied exactly once');
  assert.equal((await f.poller.pollClub(target)).postedCount, 0);
});

test('retries stop after the maximum number of attempts', async () => {
  const f = setup({ feeds: { '1': [raw('m1', 100, '1', '9', 2, 1)] }, failSend: () => true });
  const target = buildPollTargets([], [{ id: 'tc', guildId: GUILD, clubId: '1', clubName: 'RYVL', platform: 'common-gen5', channelId: 'chan', lastMatchId: 'old', elo: 1200 }])[0];
  for (let i = 0; i < 8; i++) await f.poller.pollClub(target);
  assert.equal(f.prisma.processedEaMatch.rows[0].postAttempts, 5);
});

test('a match between two clubs tracked in the same guild is posted for both', async () => {
  const both = raw('derby', 100, '1', '2', 3, 1);
  const f = setup({ feeds: { '1': [both], '2': [both] } });
  const tracked = [
    { id: 'a', guildId: GUILD, clubId: '1', clubName: 'One', platform: 'common-gen5', channelId: 'c1', lastMatchId: 'old', elo: 1200, enabled: true, createdAt: new Date(1) },
    { id: 'b', guildId: GUILD, clubId: '2', clubName: 'Two', platform: 'common-gen5', channelId: 'c2', lastMatchId: 'old', elo: 1300, enabled: true, createdAt: new Date(2) },
  ];
  f.prisma.trackedClub.rows.push(...tracked.map((t) => ({ ...t })));
  await f.poller.pollAllGuilds();
  assert.equal(f.sent.length, 2);
  const rows = f.prisma.processedEaMatch.rows;
  assert.deepEqual(rows.map((r) => [r.clubId, r.homeScore, r.awayScore]).sort(), [['1', 3, 1], ['2', 1, 3]], 'home* is always the tracked club');
  const elo1 = f.prisma.trackedClub.rows.find((r) => r.clubId === '1').elo;
  const elo2 = f.prisma.trackedClub.rows.find((r) => r.clubId === '2').elo;
  assert.equal(elo1, computeElo(1200, 1300, 1), 'opponent rating comes from its tracked Elo');
  assert.ok(elo2 < 1300);
});

test('changing the primary club resets its checkpoint; same club keeps it', async () => {
  const f = setup();
  f.prisma.clubTrackerConfig.rows.push({ id: 'cfg', guildId: GUILD, clubId: '1', clubName: 'RYVL', platform: 'common-gen5', channelId: 'chan', enabled: true, matchTypes: [], pollIntervalSec: 90, lastMatchId: 'm9', elo: 1300 });
  await f.ea.updateTrackerConfig(GUILD, { clubId: '1', clubName: 'RYVL renamed' });
  assert.equal(f.prisma.clubTrackerConfig.rows[0].lastMatchId, 'm9');
  await f.ea.updateTrackerConfig(GUILD, { clubId: '2', clubName: 'Other' });
  assert.equal(f.prisma.clubTrackerConfig.rows[0].lastMatchId, null);
  assert.equal(f.prisma.clubTrackerConfig.rows[0].elo, 1200);
  const demoted = f.prisma.trackedClub.rows.find((r) => r.clubId === '1');
  assert.ok(demoted, 'the previous primary club stays tracked');
  assert.deepEqual([demoted.channelId, demoted.lastMatchId, demoted.elo], ['chan', 'm9', 1300]);
  f.prisma.clubTrackerConfig.rows[0].lastMatchId = 'z';
  await f.ea.updateTrackerConfig(GUILD, { platform: 'nx' });
  assert.equal(f.prisma.clubTrackerConfig.rows[0].lastMatchId, null, 'a platform change is a different feed too');
});

test('changing a tracked club platform resets its checkpoint and ignores non-whitelisted fields', async () => {
  const f = setup();
  f.prisma.trackedClub.rows.push({ id: 'tc', guildId: GUILD, clubId: '5', clubName: 'X', platform: 'common-gen5', channelId: 'c', enabled: true, lastMatchId: 'm1', elo: 1400 });
  await f.ea.updateTrackedClub(GUILD, '5', { platform: 'common-gen4', guildId: 'evil', elo: 9999 });
  const row = f.prisma.trackedClub.rows[0];
  assert.equal(row.platform, 'common-gen4');
  assert.equal(row.lastMatchId, null);
  assert.equal(row.guildId, GUILD);
  assert.equal(row.elo, 1200);
});

test('a tracked club set back to the default channel uses the guild results channel, never "null"', async () => {
  const f = setup();
  f.prisma.guild.rows.push({ id: GUILD, defaultLiveResultsChannelId: '222222222222222222', defaultChannelId: '333333333333333333' });
  f.prisma.trackedClub.rows.push({ id: 'tc', guildId: GUILD, clubId: '5', clubName: 'X', platform: 'common-gen5', channelId: '444444444444444444', enabled: true });
  await f.ea.updateTrackedClub(GUILD, '5', { channelId: 'null' });
  assert.equal(f.prisma.trackedClub.rows[0].channelId, '222222222222222222');
  const added = await f.ea.addTrackedClub(GUILD, '6', 'Y', 'null', 'common-gen5');
  assert.equal(added.channelId, '222222222222222222');
});

test('getClubStats reads the tracked club from home* without name matching', async () => {
  const f = setup();
  f.prisma.clubTrackerConfig.rows.push({ id: 'cfg', guildId: GUILD, clubId: '1', clubName: 'RYVL', platform: 'common-gen5', elo: 1234 });
  // Opponent name contains the tracked name; the old heuristic flipped these.
  f.prisma.processedEaMatch.rows.push(
    { guildId: GUILD, clubId: '1', eaMatchId: 'a', homeClubName: 'RYVL', awayClubName: 'RYVL Academy', homeScore: 2, awayScore: 0, timestamp: new Date(2) },
    { guildId: GUILD, clubId: '1', eaMatchId: 'b', homeClubName: 'Renamed Club', awayClubName: 'Rivals', homeScore: 1, awayScore: 3, timestamp: new Date(1) },
  );
  const stats = await f.ea.getClubStats(GUILD, '1', { exact: true });
  assert.equal(stats.wins, 1);
  assert.equal(stats.losses, 1);
  assert.equal(stats.goalsFor, 3);
  assert.equal(stats.goalsAgainst, 3);
  assert.equal(stats.cleanSheets, 1);
  assert.equal(stats.elo, 1234);
  assert.equal(await f.ea.getClubStats(GUILD, '404', { exact: true }), null);
});

test('player stats only count matches of the guild clubs, without a 50-match cap', async () => {
  const f = setup();
  f.prisma.clubTrackerConfig.rows.push({ id: 'cfg', guildId: GUILD, clubId: '1', clubName: 'RYVL', platform: 'common-gen5' });
  f.prisma.trackedClub.rows.push({ id: 'tc', guildId: GUILD, clubId: '2', clubName: 'B', platform: 'common-gen5' });
  const stat = (clubId, i) => ({ clubId, playerProName: 'Striker', goals: 1, assists: 0, shots: 0, passesMade: 0, passAttempts: 0, tacklesMade: 1, tackleAttempts: 2, saves: 0, mom: 0, cleanSheetDef: 0, cleanSheetGk: 0, redCards: 0, rating: 7, timestamp: new Date(i) });
  for (let i = 0; i < 60; i++) f.prisma.eaPlayerMatchStat.rows.push(stat(i % 2 ? '1' : '2', i));
  for (let i = 0; i < 10; i++) f.prisma.eaPlayerMatchStat.rows.push(stat('other-guild-club', 100 + i));
  const stats = await f.ea.getPlayerStats(GUILD, 'striker');
  assert.equal(stats.totalMatches, 60);
  assert.equal(stats.goals, 60);
  assert.equal(stats.tackleSuccessRate, 50);
  assert.deepEqual(stats.clubIds.sort(), ['1', '2']);
});

test('getTrackedClubs lists the primary once without copying it into TrackedClub', async () => {
  const f = setup();
  f.prisma.clubTrackerConfig.rows.push({ id: 'cfg', guildId: GUILD, clubId: '1', clubName: 'RYVL', platform: 'common-gen5', enabled: true, channelId: 'c', elo: 1210 });
  let clubs = await f.ea.getTrackedClubs(GUILD);
  assert.equal(clubs.length, 1);
  assert.equal(clubs[0].isPrimary, true);
  assert.equal(clubs[0].elo, 1210);
  assert.equal(f.prisma.trackedClub.rows.length, 0);
  f.prisma.trackedClub.rows.push({ id: 'tc', guildId: GUILD, clubId: '1', clubName: 'RYVL', platform: 'common-gen5', createdAt: new Date() });
  clubs = await f.ea.getTrackedClubs(GUILD);
  assert.equal(clubs.length, 1);
  assert.equal(clubs[0].id, 'tc');
  assert.equal(clubs[0].isPrimary, true);
});

test('getRegistrationsForGuild returns the small registration shape', async () => {
  const f = setup();
  let args;
  f.prisma.registeredDiscordPlayer.findMany = async (a) => { args = a; return [{ discordUserId: '1', eaPlayerName: 'Gamer', preferredPos: 'ST' }]; };
  assert.deepEqual(await f.ea.getRegistrationsForGuild(GUILD), [{ discordUserId: '1', eaPlayerName: 'Gamer', preferredPos: 'ST' }]);
  assert.deepEqual(args.where, { guildId: GUILD });
  assert.deepEqual(args.select, { discordUserId: true, eaPlayerName: true, preferredPos: true });
});

test('ea_bridge results are cached per command and arguments; failures are not cached', async () => {
  const ea = new EaService(fakePrisma());
  let spawns = 0;
  let fail = true;
  ea.spawnBridge = async (command, args) => {
    spawns++;
    if (fail) throw new Error('boom');
    return { command, args };
  };
  await assert.rejects(() => ea.fetchClubInfo('1'));
  fail = false;
  await ea.fetchClubInfo('1');
  await Promise.all([ea.fetchClubInfo('1'), ea.fetchClubInfo('1')]);
  assert.equal(spawns, 2, 'one failed call, then a single cached success');
  await ea.fetchClubInfo('2');
  await ea.fetchOverallStats('1');
  assert.equal(spawns, 4);
});

test('default club uses RYVL_GUILD_ID, else the oldest tracked guild, without creating rows', async () => {
  const f = setup();
  f.prisma.guild.rows.push({ id: 'young', joinedAt: new Date(3) }, { id: 'old', joinedAt: new Date(1) }, { id: 'middle', joinedAt: new Date(2) });
  f.prisma.clubTrackerConfig.rows.push({ guildId: 'middle', clubId: 'm', enabled: true }, { guildId: 'young', clubId: 'y', enabled: true });
  // The fake does not understand relation filters; emulate "has an enabled tracker".
  const original = f.prisma.guild.findFirst;
  f.prisma.guild.findFirst = async (args) => {
    if (args?.where?.clubTrackerConfig) {
      const withConfig = f.prisma.guild.rows.filter((g) => f.prisma.clubTrackerConfig.rows.some((c) => c.guildId === g.id && c.enabled));
      return sortRows(withConfig, args.orderBy)[0] || null;
    }
    return original(args);
  };
  const previous = process.env.RYVL_GUILD_ID;
  try {
    delete process.env.RYVL_GUILD_ID;
    assert.equal((await f.ea.getDefaultTrackerConfig()).clubId, 'm');
    process.env.RYVL_GUILD_ID = 'young';
    assert.equal((await f.ea.getDefaultTrackerConfig()).clubId, 'y');
    process.env.RYVL_GUILD_ID = 'old';
    const synthetic = await f.ea.getDefaultTrackerConfig();
    assert.equal(synthetic.guildId, 'old');
    assert.equal(f.prisma.clubTrackerConfig.rows.length, 2, 'no row created');
  } finally {
    if (previous === undefined) delete process.env.RYVL_GUILD_ID; else process.env.RYVL_GUILD_ID = previous;
  }
});

test('retention clears raw payloads older than 30 days and keeps rows', async () => {
  const f = setup();
  const now = new Date('2026-10-06T00:00:00Z');
  assert.equal(await f.poller.pruneRawPayloads(now), 3);
  const [call] = f.prisma.executed;
  assert.match(call.sql, /SET "raw_payload" = NULL/);
  assert.doesNotMatch(call.sql, /DELETE/i);
  assert.equal(call.values[0].toISOString(), '2026-09-06T00:00:00.000Z');
});
