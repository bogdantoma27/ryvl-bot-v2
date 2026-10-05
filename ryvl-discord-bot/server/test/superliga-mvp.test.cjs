'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const score = require('../dist/superliga-mvp/mvp-score.js');
const { pickEaMatch } = require('../dist/superliga-mvp/mvp-matching.js');

const row = (playerName, pos, stats = {}) => ({
  playerName, teamName: 'Team', pos, rating: 7, goals: 0, assists: 0, shots: 0, passesMade: 0, passAttempts: 0,
  tacklesMade: 0, tackleAttempts: 0, saves: 0, goalsConceded: 0, cleanSheetDef: 0, cleanSheetGk: 0, mom: 0, redCards: 0,
  playedAt: new Date('2026-10-01T19:30:00Z'), ...stats,
});

test('percentile rank uses mid-rank for ties and inverts lower-is-better stats', () => {
  assert.equal(score.percentileRank(3, [1, 2, 3], true), 100);
  assert.equal(score.percentileRank(1, [1, 2, 3], true), 0);
  assert.equal(score.percentileRank(1, [1, 2, 3], false), 100);
  assert.equal(score.percentileRank(2, [2, 2, 2], true), 50);
  assert.equal(score.percentileRank(5, [5], true), 100);
  assert.equal(score.median([10, 50, 90, 30]), 40);
});

test('MVP score is the median stat percentile, ranked within role', () => {
  const rows = [
    row('Striker', 'forward', { goals: 3, assists: 1, shots: 6, rating: 9, passesMade: 20, passAttempts: 25, tacklesMade: 1, tackleAttempts: 3, mom: 1 }),
    row('Mid', 'midfielder', { goals: 1, assists: 2, shots: 2, rating: 8, passesMade: 40, passAttempts: 44, tacklesMade: 4, tackleAttempts: 6 }),
    row('Weak', 'defender', { rating: 5.5, passesMade: 10, passAttempts: 20, redCards: 1 }),
    row('Keeper', 'goalkeeper', { saves: 6, cleanSheetGk: 1, rating: 8.5, passesMade: 10, passAttempts: 12 }),
    row('Keeper2', 'goalkeeper', { saves: 2, goalsConceded: 3, rating: 6, passesMade: 5, passAttempts: 10 }),
  ];
  const board = score.buildMvpLeaderboard(rows);
  assert.equal(board.totalPlayers, 5);
  assert.equal(board.minMatches, 1);
  const by = Object.fromEntries(board.entries.map((e) => [e.playerName, e]));
  assert.equal(by.Keeper.role, 'GK');
  assert.equal(by.Keeper.score, 100, 'best keeper tops every keeper stat');
  assert.equal(by.Keeper2.score, 0);
  assert.equal(by.Striker.role, 'OUTFIELD');
  assert.ok(by.Striker.score > by.Weak.score && by.Mid.score > by.Weak.score);
  assert.deepEqual(board.entries.map((e) => e.rank), [1, 2, 3, 4, 5]);
  // Every metric has a percentile and the score is their median.
  const ps = by.Mid.metrics.map((m) => m.percentile);
  assert.equal(by.Mid.score, Math.round(score.median(ps) * 10) / 10);
});

test('players are merged across clubs by name and need the minimum matches', () => {
  const rows = [
    row('Mover', 'midfielder', { goals: 1, playedAt: new Date('2026-10-01T19:00:00Z'), teamName: 'Old Club' }),
    row(' mover ', 'midfielder', { goals: 1, playedAt: new Date('2026-10-05T19:00:00Z'), teamName: 'New Club' }),
    row('Once', 'midfielder', { goals: 5 }),
  ];
  const board = score.buildMvpLeaderboard(rows);
  assert.equal(board.minMatches, 1, 'half of 2 matches');
  const mover = board.entries.find((e) => e.playerName === 'mover');
  assert.equal(mover.matches, 2);
  assert.equal(mover.teamName, 'New Club');
  const strict = score.buildMvpLeaderboard(rows, 2);
  assert.deepEqual(strict.entries.map((e) => e.playerName), ['mover']);
  assert.equal(strict.eligiblePlayers, 1);
});

const ea = (matchId, ts, clubs) => ({
  matchId, timestamp: ts,
  clubs: Object.fromEntries(Object.entries(clubs).map(([id, goals]) => [id, { goals: String(goals), score: String(goals) }])),
  players: {}, aggregate: {},
});

test('equal MVP scores are broken by Team of the Week picks', () => {
  const twin = (name) => row(name, 'midfielder', { goals: 1, rating: 7.5 });
  const count = score.totwCounter([{ names: ['vpg_b', 'Twin B'] }, { names: ['twin b'] }, { names: ['Twin A'] }]);
  const board = score.buildMvpLeaderboard([twin('Twin A'), twin('Twin B')], null, count);
  assert.equal(board.entries[0].score, board.entries[1].score);
  assert.deepEqual(board.entries.map((e) => [e.playerName, e.totwCount]), [['Twin B', 2], ['Twin A', 1]]);
});

test('EA match linking requires both clubs, the time window and prefers the reported score', () => {
  const kickoff = new Date('2026-10-01T19:00:00Z');
  const t = (min) => kickoff.getTime() / 1000 + min * 60;
  const vpg = { kickoffAt: kickoff, homeScore: 2, awayScore: 1, homeEaClubId: '100', awayEaClubId: '200' };
  const candidates = [
    ea('friendly-vs-other', t(25), { 100: 2, 300: 1 }),
    ea('too-early', t(-120), { 100: 2, 200: 1 }),
    ea('disconnect-replay', t(10), { 100: 0, 200: 0 }),
    ea('real', t(40), { 200: 1, 100: 2 }),
  ];
  const found = pickEaMatch(candidates, vpg);
  assert.equal(found.raw.matchId, 'real');
  assert.equal(found.homeEaClubId, '100');
  assert.equal(found.scoreMatches, true);
  // Score mismatch still links when both clubs are known.
  assert.equal(pickEaMatch([candidates[2]], vpg).raw.matchId, 'disconnect-replay');
  assert.equal(pickEaMatch([candidates[0], candidates[1]], vpg), null);
  assert.equal(pickEaMatch(candidates, { ...vpg, homeEaClubId: null, awayEaClubId: null }), null);
});

test('with one linked club the opponent is inferred but the score must match', () => {
  const kickoff = new Date('2026-10-01T19:00:00Z');
  const t = (min) => kickoff.getTime() / 1000 + min * 60;
  const vpg = { kickoffAt: kickoff, homeScore: 3, awayScore: 0, homeEaClubId: null, awayEaClubId: '200' };
  const found = pickEaMatch([ea('scrim', t(30), { 999: 1, 200: 1 }), ea('league', t(35), { 555: 3, 200: 0 })], vpg);
  assert.equal(found.raw.matchId, 'league');
  assert.equal(found.homeEaClubId, '555');
  assert.equal(pickEaMatch([ea('scrim', t(30), { 999: 1, 200: 1 })], vpg), null);
});

test('a rescheduled game played days after the original kickoff is found up to when it was reported', () => {
  const kickoff = new Date('2026-10-01T19:00:00Z');
  const day = 24 * 60 * 60;
  const t = (min) => kickoff.getTime() / 1000 + min * 60;
  const reportedAt = new Date(kickoff.getTime() + 7 * day * 1000 + 60 * 60 * 1000);
  const vpg = { kickoffAt: kickoff, homeScore: 1, awayScore: 1, homeEaClubId: '100', awayEaClubId: '200' };
  const replayed = ea('played-a-week-later', t(7 * 24 * 60 + 30), { 100: 1, 200: 1 });
  const friendly = ea('midweek-friendly', t(3 * 24 * 60), { 100: 4, 200: 0 });
  assert.equal(pickEaMatch([replayed, friendly], vpg), null, 'without a report time only the original window counts');
  assert.equal(pickEaMatch([friendly, replayed], { ...vpg, reportedAt }).raw.matchId, 'played-a-week-later');
  // Same score twice: take the last game before the result was reported.
  const earlierSameScore = ea('earlier-1-1', t(2 * 24 * 60), { 100: 1, 200: 1 });
  assert.equal(pickEaMatch([earlierSameScore, replayed], { ...vpg, reportedAt }).raw.matchId, 'played-a-week-later');
});

const safeDatabase = process.env.RUN_DATABASE_TESTS === '1' && /^postgres(?:ql)?:\/\/[^@]+@(?:localhost|127\.0\.0\.1):5432\/ryvl_ci(?:\?|$)/.test(process.env.DATABASE_URL || '');
test('sync links a VPG result to its EA match and stores every player stat', { skip: !safeDatabase }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const { SuperligaMvpService } = require('../dist/superliga-mvp/superliga-mvp.service.js');
  const kickoff = new Date(Date.now() - 60 * 60 * 1000);
  const ids = [990001, 990002, 990003, 990004, 990005];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const lists = {
    complete: [
      { id: ids[0], datetime: kickoff.toISOString(), matchDay: 3, homeName: 'Home FC', awayName: 'Away FC', homeScore: 2, awayScore: 1 },
      { id: ids[1], datetime: kickoff.toISOString(), matchDay: 3, homeName: 'Away FC', awayName: 'Nobody', homeScore: 1, awayScore: 1 },
      { id: ids[2], datetime: '2020-01-01T19:00:00Z', matchDay: 1, homeName: 'Home FC', awayName: 'Away FC', homeScore: 0, awayScore: 0 },
    ],
    scheduled: [
      // Postponed: kickoff was a week ago and it has not been played yet.
      { id: ids[3], datetime: weekAgo.toISOString(), matchDay: 2, homeName: 'Away FC', awayName: 'Home FC' },
      { id: ids[4], datetime: nextWeek.toISOString(), matchDay: 4, homeName: 'Home FC', awayName: 'Away FC' },
    ],
  };
  const vpg = {
    fetchLatestSeason: async () => 99,
    fetchLeagueTeams: async () => [{ id: 1, slug: 'home', name: 'Home FC' }, { id: 2, slug: 'away', name: 'Away FC' }],
    fetchTeam: async (slug) => slug === 'home'
      ? { id: 1, slug, name: 'Home FC', eaClubId: '100', eaClubName: 'Home EA' }
      : { id: 2, slug, name: 'Away FC', eaClubId: null, eaClubName: null },
    fetchAllMatches: async (status) => lists[status],
    fetchMatchDetail: async (id) => id === ids[0] ? { id, homeTeamId: 1, awayTeamId: 2 } : id === ids[3] ? { id, homeTeamId: 2, awayTeamId: 1 } : { id, homeTeamId: 2, awayTeamId: 3 },
  };
  const player = (name, extra) => ({ playername: name, pos: 'forward', rating: '8.1', goals: '1', assists: '0', shots: '3', passesmade: '10', passattempts: '12', tacklesmade: '1', tackleattempts: '2', saves: '0', mom: '0', redcards: '0', cleansheetsdef: '0', cleansheetsgk: '0', match_event_aggregate_0: '214:1', ...extra });
  const raw = {
    matchId: 'ea-1', timestamp: Math.floor(kickoff.getTime() / 1000) + 30 * 60,
    clubs: { 100: { goals: '2', score: '2', details: { name: 'Home EA' } }, 200: { goals: '1', score: '1', details: { name: 'Away EA' } } },
    players: { 100: { p1: player('HomeStar', { goals: '2', mom: '1' }) }, 200: { p2: player('AwayKeeper', { pos: 'goalkeeper', saves: '5', goals: '0' }) } },
    aggregate: {},
  };
  let eaCalls = 0;
  const eaService = { fetchMatchesRaw: async (clubId, type) => { eaCalls++; return clubId === '100' && type === 'friendlyMatch' ? [{ ...raw, sourceMatchTypes: [type] }] : []; } };
  const service = new SuperligaMvpService(prisma, vpg, eaService);
  const cleanup = async () => {
    await prisma.superligaMvpMatch.deleteMany({ where: { vpgMatchId: { in: ids } } });
    await prisma.superligaMvpTotwSelection.deleteMany({ where: { leagueSlug: 'Superliga-Romania', season: 99 } });
    await prisma.superligaMvpTeam.deleteMany({ where: { leagueSlug: 'Superliga-Romania', vpgTeamId: { in: [1, 2] } } });
  };
  try {
    await cleanup();
    const first = await service.sync();
    assert.equal(first.newMatches, 3);
    assert.equal(first.linked, 1);
    assert.equal(first.teamsLinkedToEa, 1);
    const linked = await prisma.superligaMvpMatch.findUnique({ where: { vpgMatchId: ids[0] }, include: { players: true } });
    assert.equal(linked.status, 'LINKED');
    assert.equal(linked.awayEaClubId, '200', 'opponent club inferred from the EA game');
    assert.equal(linked.players.length, 2);
    const star = linked.players.find((p) => p.playerName === 'HomeStar');
    assert.equal(star.goals, 2); assert.equal(star.teamName, 'Home FC'); assert.equal(star.raw.match_event_aggregate_0, '214:1');
    assert.equal((await prisma.superligaMvpMatch.findUnique({ where: { vpgMatchId: ids[1] } })).status, 'PENDING');
    assert.equal((await prisma.superligaMvpMatch.findUnique({ where: { vpgMatchId: ids[2] } })).status, 'EXPIRED');
    const postponed = await prisma.superligaMvpMatch.findUnique({ where: { vpgMatchId: ids[3] } });
    assert.equal(postponed.status, 'SCHEDULED'); assert.equal(postponed.homeScore, null);

    const callsBefore = eaCalls;
    const second = await service.sync();
    assert.equal(second.newMatches, 0); assert.equal(second.linked, 0);
    assert.equal(await prisma.superligaMvpPlayerStat.count({ where: { vpgMatchId: ids[0] } }), 2, 'no duplicate stats');
    assert.equal(eaCalls, callsBefore, 'linked matches are not looked up again; unlinked teams cost no EA calls');

    // The postponed game is played and reported today, with its original kickoff kept.
    // The other fixture is moved once, then removed from the calendar.
    const movedTo = new Date(nextWeek.getTime() + 2 * 24 * 60 * 60 * 1000);
    lists.scheduled = [{ ...lists.scheduled[1], datetime: movedTo.toISOString() }];
    await service.sync();
    const moved = await prisma.superligaMvpMatch.findUnique({ where: { vpgMatchId: ids[4] } });
    assert.equal(moved.kickoffAt.getTime(), movedTo.getTime()); assert.equal(moved.originalKickoffAt.getTime(), nextWeek.getTime());
    lists.scheduled = [];
    lists.complete = [...lists.complete, { id: ids[3], datetime: weekAgo.toISOString(), matchDay: 2, homeName: 'Away FC', awayName: 'Home FC', homeScore: 0, awayScore: 2 }];
    const lateRaw = { ...raw, matchId: 'ea-late', timestamp: Math.floor(Date.now() / 1000) - 20 * 60, clubs: { 100: { goals: '2', score: '2' }, 200: { goals: '0', score: '0' } } };
    eaService.fetchMatchesRaw = async (clubId, type) => clubId === '100' && type === 'friendlyMatch' ? [lateRaw, raw] : [];
    const third = await service.sync();
    assert.equal(third.newMatches, 1); assert.equal(third.linked, 1);
    const late = await prisma.superligaMvpMatch.findUnique({ where: { vpgMatchId: ids[3] } });
    assert.equal(late.status, 'LINKED'); assert.equal(late.eaMatchId, 'ea-late');
    assert.equal(late.homeEaClubId, '200'); assert.equal(late.awayEaClubId, '100');
    assert.ok(late.completedAt, 'completion time recorded');
    assert.equal((await prisma.superligaMvpMatch.findUnique({ where: { vpgMatchId: ids[4] } })).status, 'CANCELLED');

    // TOTW picks are matched to EA gamertags through the VPG profile names.
    await prisma.superligaMvpTotwSelection.deleteMany({ where: { leagueSlug: 'Superliga-Romania', season: 99 } });
    await prisma.superligaMvpTotwSelection.createMany({ data: [
      { leagueSlug: 'Superliga-Romania', season: 99, week: 1, vpgUsername: 'vpg_star', eaNames: ['homestar'], position: 'ST' },
      { leagueSlug: 'Superliga-Romania', season: 99, week: 2, vpgUsername: 'HomeStar', eaNames: [], position: 'ST' },
    ] });

    const board = await service.getLeaderboard({ season: 99 });
    assert.equal(board.matches.linked, 2); assert.equal(board.matches.pending, 1); assert.equal(board.matches.expired, 1);
    assert.equal(board.matches.cancelled, 1); assert.equal(board.totwWeeks, 2);
    assert.equal(board.entries.find((e) => e.playerName === 'HomeStar').totwCount, 2);
    assert.deepEqual(board.entries.map((e) => [e.playerName, e.role]).sort(), [['AwayKeeper', 'GK'], ['HomeStar', 'OUTFIELD']]);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
});
