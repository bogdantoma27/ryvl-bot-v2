'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../dist/tournaments/tournament-logic.js');

const signup = (userId, pos1, extra = {}) => ({
  id: `s_${userId}`,
  userId,
  displayName: `User ${userId}`,
  gamertag: `GT_${userId}`,
  pos1,
  createdAt: '2026-10-06T00:00:00Z',
  ...extra,
});

test('position families let CB fill any centre-back slot and LW fill LM', () => {
  assert.equal(logic.positionFamily('cb'), 'CB');
  assert.equal(logic.positionFamily('RCB'), 'CB');
  assert.equal(logic.positionFamily('LW'), 'LM');
  assert.equal(logic.resolveOpenSlot('3-1-4-2', [], 'cb'), 'LCB');
  const picks = [{ userId: 'a', displayName: 'a', position: 'LCB' }];
  assert.equal(logic.resolveOpenSlot('3-1-4-2', picks, 'CB'), 'CCB');
  assert.equal(logic.resolveOpenSlot('3-1-4-2', picks, 'CAM'), null, '3-1-4-2 has no CAM slot');
});

test('open slots keep duplicate formation slots until both are filled', () => {
  const one = [{ userId: 'a', displayName: 'a', position: 'CM' }];
  assert.equal(logic.openSlots('3-1-4-2', one).filter((s) => s === 'CM').length, 1);
  const two = [...one, { userId: 'b', displayName: 'b', position: 'CM' }];
  assert.equal(logic.openSlots('3-1-4-2', two).includes('CM'), false);
});

test('draft teams come from managers, who take their own slot, and the snake covers the other 10', () => {
  const signups = [
    signup('m1', 'ST', { isManager: true, teamName: 'Alpha' }),
    signup('m2', 'GK', { isManager: true, teamName: 'Beta' }),
    signup('p1', 'CB'),
    signup('p2', 'CM'),
  ];
  const { teams, draft } = logic.buildDraftTeams(signups, '3-5-2');
  assert.deepEqual(teams.map((t) => t.name), ['Alpha', 'Beta']);
  assert.equal(teams[0].managerId, 'm1');
  assert.equal(teams[0].picks[0].position, 'ST');
  assert.equal(teams[1].picks[0].position, 'GK');
  assert.equal(draft.snakeOrder.length, 20);
  assert.deepEqual(draft.snakeOrder.slice(0, 4), [0, 1, 1, 0]);
  assert.deepEqual(draft.teamJokers, { 0: 4, 1: 4 });
  assert.deepEqual(logic.draftPool(signups, draft).map((s) => s.userId), ['p1', 'p2'], 'managers are not in the pool');
});

test('draw prefers primary position, then secondary, then anyone left', () => {
  const pool = [signup('a', 'ST'), signup('b', 'CM', { pos2: 'CB' }), signup('c', 'GK')];
  const first = () => 0;
  assert.deepEqual(
    [logic.drawCandidate(pool, 'ST', [], first).candidate.userId, logic.drawCandidate(pool, 'ST', [], first).wildcard],
    ['a', false],
  );
  assert.equal(logic.drawCandidate(pool, 'RCB', [], first).candidate.userId, 'b');
  const wild = logic.drawCandidate(pool, 'LM', [], first);
  assert.equal(wild.wildcard, true);
  assert.equal(logic.drawCandidate(pool, 'GK', ['c'], first).wildcard, true, 'joker excludes the rejected player');
  assert.equal(logic.drawCandidate([], 'GK'), null);
});

test('round robin: every pair meets exactly once, nobody plays twice in a round', () => {
  for (const n of [2, 3, 4, 7, 8]) {
    const teams = Array.from({ length: n }, (_, i) => ({ id: `team_${i + 1}`, name: `T${i + 1}`, picks: [] }));
    const fixtures = logic.generateRoundRobin(teams);
    assert.equal(fixtures.length, (n * (n - 1)) / 2, `fixture count for ${n}`);
    const pairs = new Set(fixtures.map((m) => [m.homeTeamId, m.awayTeamId].sort().join('|')));
    assert.equal(pairs.size, fixtures.length);
    const byRound = new Map();
    for (const m of fixtures) {
      const seen = byRound.get(m.round) || new Set();
      assert.ok(!seen.has(m.homeTeamId) && !seen.has(m.awayTeamId), `team twice in round ${m.round}`);
      seen.add(m.homeTeamId).add(m.awayTeamId);
      byRound.set(m.round, seen);
      assert.equal(m.completed, false);
    }
  }
});

test('standings count only completed matches and rank by points, goal difference, goals', () => {
  const teams = ['A', 'B', 'C'].map((name, i) => ({ id: `t${i}`, name, picks: [] }));
  const matches = [
    { id: '1', homeTeam: 'A', awayTeam: 'B', homeScore: 2, awayScore: 0, completed: true },
    { id: '2', homeTeam: 'B', awayTeam: 'C', homeScore: 1, awayScore: 1, completed: true },
    { id: '3', homeTeam: 'C', awayTeam: 'A', homeScore: 0, awayScore: 0, completed: false },
  ];
  const rows = logic.calculateStandings(teams, matches);
  assert.deepEqual(rows.map((r) => [r.team, r.points, r.played]), [
    ['A', 3, 1],
    ['C', 1, 1],
    ['B', 1, 2],
  ]);
});

test('signups: re-signing updates in place, caps differ by tournament type', () => {
  const first = logic.upsertSignup([], signup('u1', 'ST'), 'DRAFT');
  const again = logic.upsertSignup(first, { ...signup('u1', 'CM'), id: 'new', createdAt: 'later' }, 'DRAFT');
  assert.equal(again.length, 1);
  assert.equal(again[0].pos1, 'CM');
  assert.equal(again[0].id, 's_u1', 'keeps original signup id and order');

  const full = Array.from({ length: 32 }, (_, i) => signup(`t${i}`, 'ALL', { teamName: `Team ${i}` }));
  assert.throws(() => logic.upsertSignup(full, signup('late', 'ALL', { teamName: 'Late' }), 'STANDARD'), /32/);
  assert.equal(logic.upsertSignup(full, signup('late', 'ST'), 'DRAFT').length, 33);
});

test('bracket size scales to 8, 16 or 32 teams', () => {
  assert.equal(logic.bracketSizeFor(7), 0);
  assert.equal(logic.bracketSizeFor(8), 8);
  assert.equal(logic.bracketSizeFor(15), 8);
  assert.equal(logic.bracketSizeFor(20), 16);
  assert.equal(logic.bracketSizeFor(40), 32);
});
