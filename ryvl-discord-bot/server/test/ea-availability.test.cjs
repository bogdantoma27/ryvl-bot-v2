'use strict';
// Use the actual controller and simulated upstream replies; no real EA/Discord traffic.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EaController } = require('../dist/ea/ea.controller');
const { EaService } = require('../dist/ea/ea.service');
function controller(fetchMatchesRaw) {
  const config = { clubId: '654321', guildId: 'fixture', platform: 'common-gen5', matchTypes: ['leagueMatch', 'friendlyMatch'] };
  // Real EaService (shared fetch-and-merge), only EA I/O and config lookup substituted.
  const ea = new EaService({});
  Object.assign(ea, { getOrCreateTrackerConfig: async () => config, getDefaultTrackerConfig: async () => config, fetchMatchesRaw, parseMatch: match => match });
  return new EaController(ea, {});
}
test('total EA match outage returns 503 instead of an empty successful feed', async () => {
  const value = controller(async () => { throw new Error('simulated upstream failure'); });
  await assert.rejects(() => value.getRecentMatches('fixture'), error => error.getStatus?.() === 503);
});
test('malformed upstream match responses are not treated as successful empty lists', async () => {
  const value = controller(async () => ({ error: 'upstream unavailable' }));
  await assert.rejects(() => value.getRecentMatches('fixture'), error => error.getStatus?.() === 503);
});
test('valid empty upstream responses are still legitimate empty feeds', async () => {
  assert.deepEqual(await controller(async () => []).getRecentMatches('fixture'), []);
});
test('one unavailable match type does not discard a successful match type', async () => {
  const match = { matchId: 'one', timestamp: 100 };
  const value = controller(async (_club, type) => { if (type === 'leagueMatch') throw new Error('fixture failure'); return [match]; });
  assert.deepEqual(await value.getRecentMatches('fixture'), [match]);
});
