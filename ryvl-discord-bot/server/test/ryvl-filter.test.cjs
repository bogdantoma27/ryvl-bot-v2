'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { VpgService } = require('../dist/vpg/vpg.service.js');

// Exercise the real performance service without calling the live VPG or Discord APIs.
function serviceWithFixtures() {
  const guild = { id: 'guild-test', ryvlTeamName: 'RYVL Esports' };
  const competition = { id: 'competition-test', name: 'Superliga România', slug: 'Superliga-Romania', season: 2, active: true, displayOrder: 1 };
  const service = new VpgService({
    guild: { findUnique: async () => guild, findFirst: async () => guild },
    ryvlCompetition: { findMany: async () => [competition] },
  });
  service.getCompetitions = async () => [competition];
  service.fetchLatestSeason = async () => 2;
  const makeMatch = (id, homeName, awayName) => ({
    id, homeName, awayName, homeScore: 2, awayScore: 1,
    status: 'complete', datetime: '2026-09-22T19:00:00Z', matchDay: 1,
    dateFormattedRo: '', dateFormattedEn: '', homeLogoUrl: null, awayLogoUrl: null,
  });
  const matches = [
    makeMatch(1, 'RYVL Esports', 'Opponent'),
    makeMatch(2, 'Rival United', 'Another Club'),
    makeMatch(3, 'NotRYVL', 'Unrelated'),
    makeMatch(4, 'Opponent', ' ryvl '),
  ];
  service.fetchMatches = async () => matches;
  service.fetchAllMatches = async () => matches;
  service.fetchStandings = async () => [
    { position: 1, teamName: 'Rival United', teamSlug: 'rival-united', played: 1, wins: 1, draws: 0, losses: 0, scoreFor: 2, scoreAgainst: 1, goalDifference: 1, points: 3 },
    { position: 2, teamName: 'RYVL Esports', teamSlug: 'ryvl-esports', played: 2, wins: 1, draws: 0, losses: 1, scoreFor: 3, scoreAgainst: 3, goalDifference: 0, points: 3 },
  ];
  return service;
}

test('RYVL performance excludes Rival United and NotRYVL, while accepting the RYVL alias', async () => {
  const response = await serviceWithFixtures().getRyvlPerformance('guild-test', 'Superliga-Romania');
  assert.deepEqual(response.recentResults.map(m => m.id).sort(), [1, 4]);
  assert.equal(response.stats.played, 2);
  assert.equal(response.stats.wins, 1);
  assert.equal(response.stats.losses, 1);
});

test('RYVL league position is not borrowed from a club named Rival', async () => {
  const response = await serviceWithFixtures().getRyvlPerformance('guild-test', 'Superliga-Romania');
  assert.equal(response.stats.standingsPosition, 2);
});

test('RYVL upcoming fixtures use the same strict identity filter', async () => {
  const response = await serviceWithFixtures().getRyvlPerformance('guild-test', 'Superliga-Romania');
  assert.deepEqual(response.upcomingFixtures.map(m => m.id).sort(), [1, 4]);
});
