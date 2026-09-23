'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../dist/vpg/notification-policy.js');
const { buildClubWebUrl } = require('../dist/config/public-url.js');

test('strict RYVL aliases normalize case/spacing but exclude look-alike teams', () => {
  for (const name of ['RYVL', 'RYVL Esports', '  ryvl   ESPORTS ', 'ＲＹＶＬ']) assert.equal(policy.isRyvlTeam(name), true, name);
  for (const name of ['Rival United', 'NotRYVL', 'RYVL Academy', 'RYVL Esports B', '', null]) assert.equal(policy.isRyvlTeam(name), false, String(name));
});
test('a resolved team slug takes precedence when match slugs exist', () => {
  const identity = policy.resolveRyvlIdentity([{teamName:'RYVL Esports',teamSlug:'actual-ryvl'}]);
  assert.equal(policy.isRyvlSide('RYVL Esports', 'another-club', identity), false);
  assert.equal(policy.isRyvlSide('Renamed club', 'actual-ryvl', identity), true);
  assert.equal(policy.isRyvlSide(' ryvl ', null, identity), true);
});
test('Sunday post starts at 10:00 Romania during summer time', () => {
  assert.equal(policy.standingsDue(new Date('2026-09-27T06:59:59Z')), false);
  assert.equal(policy.standingsDue(new Date('2026-09-27T07:00:00Z')), true);
  assert.equal(policy.standingsDue(new Date('2026-09-28T07:00:00Z')), false);
});
test('Sunday post remains at 10:00 Romania after daylight saving ends', () => {
  assert.equal(policy.standingsDue(new Date('2026-11-01T07:59:59Z')), false);
  assert.equal(policy.standingsDue(new Date('2026-11-01T08:00:00Z')), true);
  assert.equal(policy.standingsDue(new Date('2026-10-25T08:00:00Z')), true);
});
test('daily fixture filtering uses Romanian midnight, deduplicates and ignores invalid dates', () => {
  const rows = [{id:1,datetime:'2026-09-22T20:59:59Z'}, {id:2,datetime:'2026-09-22T21:00:00Z'}, {id:3,datetime:'2026-09-23T20:59:59Z'}, {id:4,datetime:'2026-09-23T21:00:00Z'}, {id:5,datetime:'invalid'}];
  assert.deepEqual(policy.fixturesOnDay([...rows,rows[1]], '2026-09-23').map(m=>m.id), [2,3]);
});
test('daily fixture schedule is configurable without changing server timezone', () => {
  assert.equal(policy.dailyTimeReached(new Date('2026-09-23T06:59:00Z'), '10:00'), false);
  assert.equal(policy.dailyTimeReached(new Date('2026-09-23T07:00:00Z'), '10:00'), true);
  assert.equal(policy.dailyTimeReached(new Date('2026-09-23T07:00:00Z'), '12:30'), false);
});
test('poll interval uses elapsed time and first check is immediately due', () => {
  const now = new Date('2026-09-23T10:00:00Z');
  assert.equal(policy.intervalDue(null, 120, now), true);
  assert.equal(policy.intervalDue(new Date('2026-09-23T09:58:01Z'), 120, now), false);
  assert.equal(policy.intervalDue(new Date('2026-09-23T09:58:00Z'), 120, now), true);
});
test('notification settings reject unexpected fields and unsafe intervals', () => {
  assert.deepEqual(policy.validateNotificationSettings({pollIntervalSec:120,fixturesTime:'10:00',resultsEnabled:true}), {pollIntervalSec:120,fixturesTime:'10:00',resultsEnabled:true});
  for (const value of [{pollIntervalSec:0},{pollIntervalSec:3601},{pollIntervalSec:'120'},{fixturesTime:'25:00'},{resultsEnabled:'true'},{guildId:'another-guild'}]) assert.throws(()=>policy.validateNotificationSettings(value));
});
test('club button uses FRONTEND_URL for both Oracle IP and a later custom domain', () => {
  assert.equal(buildClubWebUrl('http://130.61.228.100', '12345'), 'http://130.61.228.100/club?guildId=12345');
  assert.equal(buildClubWebUrl('https://app.example.com/', '12345'), 'https://app.example.com/club?guildId=12345');
  assert.throws(()=>buildClubWebUrl('ftp://example.com', '12345'));
});
