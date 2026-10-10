'use strict';
// EA relay for the FC Draft RO site: only whitelisted read-only paths and params reach EA.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EaRelayController } = require('../dist/ea/ea-relay.controller');

function relay(result = []) {
  const calls = [];
  const ea = { relay: async (path, params) => { calls.push([path, params]); if (result instanceof Error) throw result; return result; } };
  return { controller: new EaRelayController(ea), calls };
}

test('forwards whitelisted paths with only known params', async () => {
  const { controller, calls } = relay([{ matchId: '1' }]);
  const data = await controller.relayTwo('clubs', 'matches', { platform: 'common-gen5', clubIds: '123', matchType: 'friendlyMatch', evil: 'x' });
  assert.deepEqual(data, [{ matchId: '1' }]);
  assert.deepEqual(calls, [['/clubs/matches', { platform: 'common-gen5', clubIds: '123', matchType: 'friendlyMatch' }]]);
  await controller.relayThree('members', 'career', 'stats', { clubId: '5' });
  assert.deepEqual(calls[1], ['/members/career/stats', { clubId: '5' }]);
});

test('unknown paths are not forwarded', async () => {
  const { controller, calls } = relay();
  await assert.rejects(() => controller.relayTwo('settings', 'admin', {}), error => error.getStatus?.() === 404);
  assert.equal(calls.length, 0);
});

test('EA failures and bridge errors become 502', async () => {
  await assert.rejects(() => relay(new Error('blocked')).controller.relayTwo('clubs', 'info', {}), error => error.getStatus?.() === 502);
  await assert.rejects(() => relay({ error: 'HTTP 403' }).controller.relayTwo('clubs', 'info', {}), error => error.getStatus?.() === 502);
});

test('requests beyond the per-minute limit are refused', async () => {
  const { controller } = relay();
  for (let index = 0; index < 60; index++) await controller.relayTwo('clubs', 'info', {});
  await assert.rejects(() => controller.relayTwo('clubs', 'info', {}), error => error.getStatus?.() === 429);
});
