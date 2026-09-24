'use strict';
// Exercise the real bridge boundary, parser, poller and embed. External EA/Discord
// calls and database writes are isolated; these tests never post to live channels.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EaService } = require('../dist/ea/ea.service');
const { EaPollerService } = require('../dist/ea/ea-poller.service');
const { EaController } = require('../dist/ea/ea.controller');
const { buildEaMatchEmbed, formatMatchType } = require('../dist/discord/embeds/ea-embed.builder');
const clubId = '12345';
function raw(id, matchType = '1') {
  return { matchId: id, timestamp: 1790265600, clubs: {
    [clubId]: { score: 2, matchType, details: { name: 'RYVL Esports' } },
    '54321': { score: 1, matchType, details: { name: 'Fixture Opponent' } },
  }, players: {}, aggregate: {} };
}
function setup(responses, types = Object.keys(responses)) {
  const config = { guildId: 'fixture-guild', clubId, clubName: 'RYVL Esports', platform: 'common-gen5', channelId: 'fixture-channel', matchTypes: types, lastMatchId: 'previous-match', enabled: true };
  const sent = [], saved = [], calls = [];
  const prisma = {
    clubTrackerConfig: { update: async () => config },
    processedEaMatch: {
      findUnique: async ({ where }) => saved.find(item => item.eaMatchId === where.guildId_eaMatchId.eaMatchId) || null,
      create: async ({ data }) => { saved.push(data); return data; },
      upsert: async ({ create }) => { saved.push(create); return create; },
    },
  };
  const ea = new EaService(prisma);
  ea.getOrCreateTrackerConfig = async () => config;
  ea.getDefaultTrackerConfig = async () => config;
  ea.runBridge = async (command, args) => {
    assert.equal(command, 'matches'); calls.push(args);
    return structuredClone(responses[args[2]] || []);
  };
  const discord = { sendMessageToChannel: async (_channel, embed) => { sent.push(embed.toJSON()); return { id: 'fixture-message-' + sent.length }; } };
  const poller = new EaPollerService(prisma, ea, discord, { frontendUrl: 'https://ryvl.top' });
  return { config, ea, poller, controller: new EaController(ea, poller), sent, saved, calls };
}
for (const [type, label] of [['leagueMatch','League Match'], ['friendlyMatch','Friendly Match'], ['playoffMatch','Playoff Match'], ['practiceMatch','Practice Match']]) {
  test('preserves the ' + type + ' request category through numeric club metadata into the embed', async () => {
    const original = raw('fixture-' + type);
    const f = setup({ [type]: [original] });
    const fetched = await f.ea.fetchMatchesRaw(clubId, type, 5, 'common-gen5');
    const parsed = f.ea.parseMatch(fetched[0], clubId);
    assert.equal(parsed.matchType, type);
    assert.equal(buildEaMatchEmbed(parsed, 'https://ryvl.top/club').embed.toJSON().description.split('**')[1], label);
    assert.equal(fetched[0].clubs[clubId].matchType, '1', 'Preserve original EA metadata');
    assert.equal(Object.keys(original).length, 5, 'Do not mutate the input response');
    assert.equal(f.ea.parseMatch(JSON.parse(JSON.stringify(fetched[0])), clubId).matchType, type, 'Category must survive stored raw payload serialization');
  });
}
for (const [value, expected] of [['Friendly Match','Friendly Match'], ['playoffMatch','Playoff Match'], ['practiceMatch','Practice Match'], ['League','League Match'], ['not-a-friendlyMatch','Pro Clubs Match'], ['unknown','Pro Clubs Match'], ['', 'Pro Clubs Match'], ['1','Pro Clubs Match'], [1,'Pro Clubs Match'], [undefined,'Pro Clubs Match'], [null,'Pro Clubs Match']]) {
  test('formatter handles ' + String(value) + ' without a fabricated league default', () => assert.equal(formatMatchType(value), expected));
}
test('missing/unrecognised response types are neutral without request context', () => {
  const f = setup({});
  for (const type of [undefined, null, '1', 1, 'unsupported-game-mode']) {
    const parsed = f.ea.parseMatch(raw('unknown', type), clubId);
    assert.equal(formatMatchType(parsed.matchType), 'Pro Clubs Match');
  }
});
test('explicit practice subtype is not lost in a friendly feed', async () => {
  const item = { ...raw('practice'), matchType: 'practiceMatch' };
  const f = setup({ friendlyMatch: [item] });
  const [fetched] = await f.ea.fetchMatchesRaw(clubId, 'friendlyMatch');
  assert.equal(f.ea.parseMatch(fetched, clubId).matchType, 'practiceMatch');
});
test('automatic polling posts mixed categories with distinct correct labels', async () => {
  const f = setup({ leagueMatch: [raw('league')], friendlyMatch: [raw('friendly')], playoffMatch: [raw('playoff')], practiceMatch: [raw('practice')] });
  const result = await f.poller.pollGuild(f.config);
  assert.equal(result.postedCount, 4);
  assert.deepEqual(f.sent.map(embed => embed.description.split('**')[1]).sort(), ['Friendly Match','League Match','Playoff Match','Practice Match']);
  assert.deepEqual(f.saved.map(item => item.matchType).sort(), ['friendlyMatch','leagueMatch','playoffMatch','practiceMatch']);
  await f.poller.pollGuild(f.config);
  assert.equal(f.sent.length, 4, 'Already processed games must not be reposted');
});
test('manual latest-match posting uses the fetched category too', async () => {
  const f = setup({ friendlyMatch: [raw('friendly')] });
  assert.equal((await f.poller.postLatestMatch('fixture-guild')).success, true);
  assert.match(f.sent[0].description, /\*\*Friendly Match\*\*/);
});
test('public tracker returns the same category and display label as Discord', async () => {
  const f = setup({ friendlyMatch: [raw('friendly')] });
  const [match] = await f.controller.getRecentMatches('fixture-guild');
  assert.equal(match.matchType, 'friendlyMatch');
  assert.equal(match.matchTypeLabel, 'Friendly Match');
});
for (const order of [['leagueMatch','friendlyMatch'], ['friendlyMatch','leagueMatch']]) {
  test('conflicting duplicate feed membership never chooses the last category: ' + order.join(','), async () => {
    const f = setup({ leagueMatch: [raw('same-id')], friendlyMatch: [raw('same-id')] }, order);
    const result = await f.poller.pollGuild(f.config);
    assert.equal(result.postedCount, 1);
    assert.match(f.sent[0].description, /\*\*Pro Clubs Match\*\*/);
    const [match] = await f.controller.getRecentMatches('fixture-guild');
    assert.equal(formatMatchType(match.matchType), 'Pro Clubs Match');
    f.sent.length = 0;
    await f.poller.postLatestMatch('fixture-guild');
    assert.match(f.sent[0].description, /\*\*Pro Clubs Match\*\*/);
  });
}
