'use strict';
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EaService } = require('../dist/ea/ea.service');
const { withEaMatchType, mergeEaMatch, resolveEaMatchType } = require('../dist/ea/ea-match-type');
const { buildEaMatchEmbed } = require('../dist/discord/embeds/ea-embed.builder');

// Reduced structural fixtures from the read-only EA diagnosis, not live requests.
// The real friendly response had numeric string "5", not the word "friendly".
for (const [requested, code, label] of [['leagueMatch', '1', 'League Match'], ['friendlyMatch', '5', 'Friendly Match']]) {
  test('observed EA code ' + code + ' in ' + requested + ' keeps the correct embed category', async () => {
    const raw = { matchId: 'fixture-' + code, timestamp: 1790265600, clubs: { tracked: { matchType: code, score: 1, details: { name: 'RYVL Esports' } }, opponent: { matchType: code, score: 0, details: { name: 'Fixture Opponent' } } }, players: {}, aggregate: {} };
    const ea = new EaService({});
    ea.runBridge = async () => [structuredClone(raw)];
    const [response] = await ea.fetchMatchesRaw('tracked', requested);
    const parsed = ea.parseMatch(response, 'tracked');
    assert.equal(parsed.matchTypeLabel, label);
    assert.equal(buildEaMatchEmbed(parsed, 'https://ryvl.top/club').embed.toJSON().description.split('**')[1], label);
    assert.equal(parsed.rawMatch.clubs.tracked.matchType, code);
  });
}
test('practice rendering does not enable a practice endpoint or invent a practice numeric code', () => {
  const raw = { matchId: 'practice-fixture', timestamp: 1790265600, matchType: 'practiceMatch', clubs: {}, players: {}, aggregate: {} };
  assert.equal(resolveEaMatchType(withEaMatchType(raw, 'friendlyMatch')), 'practiceMatch');
  assert.equal(resolveEaMatchType({ ...raw, matchType: '999' }), 'unknown');
});
test('named category evidence survives duplicate merging even when the next response omits it', () => {
  const raw = { matchId: 'same', timestamp: 1790265600, clubs: {}, players: {}, aggregate: {} };
  const named = withEaMatchType({ ...raw, matchType: 'practiceMatch' }, 'friendlyMatch');
  const plain = withEaMatchType(raw, 'leagueMatch');
  assert.equal(resolveEaMatchType(mergeEaMatch(named, plain)), 'practiceMatch');
  assert.equal(resolveEaMatchType(mergeEaMatch(plain, named)), 'practiceMatch');
});
