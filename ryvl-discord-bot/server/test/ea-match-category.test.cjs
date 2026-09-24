'use strict';
// Real fetch normalization, parser, poller/controller and embed builder. Only
// external EA, database and Discord I/O is substituted; nothing is posted live.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EaService } = require('../dist/ea/ea.service');
const { EaPollerService } = require('../dist/ea/ea-poller.service');
const { EaController } = require('../dist/ea/ea.controller');
const { buildEaMatchEmbed, formatMatchType } = require('../dist/discord/embeds/ea-embed.builder');

const clubId = 'fixture-club';
function rawMatch(id = 'fixture-match', clubType = '1') {
  return {
    matchId: id, timestamp: 1790265600,
    clubs: {
      [clubId]: { matchType: clubType, goals: '2', score: '2', details: { name: 'RYVL Esports' } },
      opponent: { matchType: clubType, goals: '1', score: '1', details: { name: 'Fixture Opponent' } },
    },
    players: {}, aggregate: {},
  };
}
function fixture(feeds) {
  const saved = [], sent = [], processed = new Map();
  const config = { guildId: 'fixture-guild', clubId, clubName: 'RYVL Esports', channelId: 'fixture-channel', platform: 'common-gen5', matchTypes: Object.keys(feeds), lastMatchId: 'previous-match' };
  const prisma = {
    clubTrackerConfig: { findUnique: async () => config, update: async ({ data }) => ({ ...config, ...data }) },
    processedEaMatch: {
      findUnique: async ({ where }) => processed.get(where.guildId_eaMatchId.eaMatchId) || null,
      create: async ({ data }) => { saved.push(data); processed.set(data.eaMatchId, data); return data; },
      upsert: async ({ create }) => { saved.push(create); processed.set(create.eaMatchId, create); return create; },
    },
  };
  const ea = new EaService(prisma);
  ea.runBridge = async (command, args) => {
    assert.equal(command, 'matches');
    assert.equal(args[1], clubId);
    return structuredClone(feeds[args[2]] || []);
  };
  const discord = { sendMessageToChannel: async (channel, embed, rows) => { sent.push({ channel, embed: embed.toJSON(), rows }); return { id: 'sent-' + sent.length }; } };
  return { ea, config, sent, saved, poller: new EaPollerService(prisma, ea, discord, { frontendUrl: 'https://ryvl.top' }), controller: new EaController(ea, {}) };
}

for (const [category, label] of [
  ['leagueMatch', 'League Match'], ['friendlyMatch', 'Friendly Match'],
  ['playoffMatch', 'Playoff Match'], ['practiceMatch', 'Practice Match'],
]) {
  test(category + ': requested category survives numeric club fields, JSON storage and embedding', async () => {
    const f = fixture({ [category]: [rawMatch()] });
    const fetched = await f.ea.fetchMatchesRaw(clubId, category);
    assert.deepEqual(fetched[0].sourceMatchTypes, [category]);
    const restored = JSON.parse(JSON.stringify(fetched[0]));
    const parsed = f.ea.parseMatch(restored, clubId);
    assert.equal(parsed.matchType, category);
    assert.equal(parsed.matchTypeLabel, label);
    assert.match(buildEaMatchEmbed(parsed, 'https://ryvl.top/club').embed.toJSON().description, new RegExp('\\*\\*' + label + '\\*\\*'));
    assert.equal(parsed.trackedClub.score, 2);
    assert.equal(parsed.opponentClub.score, 1);
  });
}
for (const value of [undefined, null, '', 'unknown', 'unsupportedMatch', '1', 1, '0', 0, {}, 'not-a-friendly-match']) {
  test('unknown match type is neutral and never guessed as league: ' + JSON.stringify(value), () => {
    assert.equal(formatMatchType(value), 'Pro Clubs Match');
  });
}
test('practice name is preserved when a friendly feed explicitly identifies practice', async () => {
  const raw = rawMatch(); raw.matchType = 'practiceMatch';
  const f = fixture({ friendlyMatch: [raw] });
  const [fetched] = await f.ea.fetchMatchesRaw(clubId, 'friendlyMatch');
  const parsed = f.ea.parseMatch(fetched, clubId);
  assert.equal(parsed.matchType, 'practiceMatch');
  assert.equal(formatMatchType(parsed.matchType), 'Practice Match');
});
test('old payload without request context is neutral, while explicit named values still work', () => {
  const ea = new EaService({});
  assert.equal(ea.parseMatch(rawMatch(), clubId).matchType, 'unknown');
  assert.equal(ea.parseMatch(rawMatch('named', 'Friendly Match'), clubId).matchType, 'friendlyMatch');
});
test('automatic poll posts different match labels and saves their provenance without duplicates', async () => {
  const f = fixture({ leagueMatch: [rawMatch('league')], friendlyMatch: [rawMatch('friendly')], playoffMatch: [rawMatch('playoff')], practiceMatch: [rawMatch('practice')] });
  const first = await f.poller.pollGuild(f.config);
  assert.equal(first.postedCount, 4);
  for (const category of f.config.matchTypes) {
    const saved = f.saved.find(item => item.matchType === category);
    assert.ok(saved, 'Persist category ' + category);
    assert.deepEqual(saved.rawPayload.sourceMatchTypes, [category]);
    assert.ok(f.sent.some(item => item.embed.description.includes('**' + formatMatchType(category) + '**')));
  }
  assert.equal((await f.poller.pollGuild(f.config)).postedCount, 0);
  assert.equal(f.sent.length, 4);
});
test('post-latest and public feed agree on the friendly category', async () => {
  const f = fixture({ friendlyMatch: [rawMatch()] });
  const latest = await f.poller.postLatestMatch(f.config.guildId);
  assert.equal(latest.match.matchType, 'friendlyMatch');
  assert.match(f.sent[0].embed.description, /\*\*Friendly Match\*\*/);
  const publicMatches = await f.controller.getRecentMatches(f.config.guildId);
  assert.equal(publicMatches[0].matchType, 'friendlyMatch');
  assert.equal(publicMatches[0].matchTypeLabel, 'Friendly Match');
});
test('same ID returned by conflicting category feeds is deduplicated, not silently reclassified', async () => {
  for (const method of ['poll', 'latest', 'public']) {
    const f = fixture({ leagueMatch: [rawMatch('shared')], friendlyMatch: [rawMatch('shared')] });
    let parsed;
    if (method === 'poll') { parsed = (await f.poller.pollGuild(f.config)).latestMatch; assert.equal(f.sent.length, 1); }
    if (method === 'latest') { parsed = (await f.poller.postLatestMatch(f.config.guildId)).match; assert.equal(f.sent.length, 1); }
    if (method === 'public') { const items = await f.controller.getRecentMatches(f.config.guildId); assert.equal(items.length, 1); parsed = items[0]; }
    assert.equal(parsed.matchType, 'unknown', method + ': ambiguous evidence must not be called League Match');
    assert.equal(formatMatchType(parsed.matchType), 'Pro Clubs Match');
    assert.deepEqual(parsed.rawMatch.sourceMatchTypes.sort(), ['friendlyMatch', 'leagueMatch']);
  }
});
test('normalizing fetched results does not mutate the original EA payload', async () => {
  const original = rawMatch(); const before = structuredClone(original);
  const ea = new EaService({}); ea.runBridge = async () => [original];
  const [fetched] = await ea.fetchMatchesRaw(clubId, 'friendlyMatch');
  assert.notEqual(fetched, original);
  assert.deepEqual(original, before);
  assert.deepEqual(fetched.sourceMatchTypes, ['friendlyMatch']);
});
