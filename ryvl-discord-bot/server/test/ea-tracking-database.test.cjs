'use strict';
// Runs only against a local throw-away database (RUN_DATABASE_TESTS=1).
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const safeDatabase = process.env.RUN_DATABASE_TESTS === '1' && /^postgres(?:ql)?:\/\/[^@]+@(?:localhost|127\.0\.0\.1):\d+\/ryvl_\w+(?:\?|$)/.test(process.env.DATABASE_URL || '');

test('processed EA matches are unique per guild, club and match; retention keeps rows', { skip: !safeDatabase }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const { EaService } = require('../dist/ea/ea.service');
  const { EaPollerService } = require('../dist/ea/ea-poller.service');
  const prisma = new PrismaClient();
  const guildId = '999999999999900110';
  try {
    await prisma.guild.upsert({ where: { id: guildId }, create: { id: guildId, name: 'EA CI' }, update: {} });
    const ea = new EaService(prisma);
    const raw = { matchId: 'derby-1', timestamp: 1790265600, clubs: { a: { score: '2', details: { name: 'A' } }, b: { score: '1', details: { name: 'B' } } }, players: {}, aggregate: {} };
    for (const clubId of ['a', 'b']) {
      const parsed = ea.parseMatch(raw, clubId);
      const first = await ea.recordProcessed({ guildId, clubId, raw, parsed, channelId: 'c', postPending: true });
      assert.equal(first.created, true, 'both clubs of a derby get a row');
      const again = await ea.recordProcessed({ guildId, clubId, raw, parsed, channelId: 'c', postPending: true });
      assert.equal(again.created, false);
      assert.equal(again.record.id, first.record.id);
    }
    const rows = await prisma.processedEaMatch.findMany({ where: { guildId }, orderBy: { clubId: 'asc' } });
    assert.deepEqual(rows.map((r) => [r.clubId, r.homeScore, r.awayScore, r.postPending]), [['a', 2, 1, true], ['b', 1, 2, true]]);

    await prisma.processedEaMatch.updateMany({ where: { guildId, clubId: 'a' }, data: { createdAt: new Date(Date.now() - 40 * 86400000) } });
    const poller = new EaPollerService(prisma, ea, {}, { frontendUrl: 'https://ryvl.top' });
    assert.ok((await poller.pruneRawPayloads()) >= 1);
    const after = await prisma.processedEaMatch.findMany({ where: { guildId }, orderBy: { clubId: 'asc' } });
    assert.equal(after.length, 2, 'rows are kept');
    assert.equal(after[0].rawPayload, null);
    assert.notEqual(after[1].rawPayload, null);
  } finally {
    await prisma.guild.deleteMany({ where: { id: guildId } });
    await prisma.$disconnect();
  }
});
