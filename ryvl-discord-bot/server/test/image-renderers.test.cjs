'use strict';
// Image renderers: TOTW template fallback, no duplicated TOTW players, escaping, and
// lineup title overflow.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TotwRendererService } = require('../dist/vpg/totw-renderer.service');
const { TotwService } = require('../dist/vpg/totw.service');
const { LineupRendererService, truncateText } = require('../dist/lineup/lineup-renderer.service');

test('TOTW image falls back to the plain render when the template cannot be read', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'totw-'));
  const broken = path.join(dir, 'totw-template.jpg');
  fs.writeFileSync(broken, 'not an image');
  const renderer = new TotwRendererService();
  renderer.getTotwTemplatePath = () => broken;
  try {
    const png = await renderer.renderPng({ leagueName: 'Superliga', players: {} });
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('TOTW card shows every player once and escapes names', () => {
  const service = new TotwService(null, null, null, null);
  const e = (username) => ({ rank: 1, username, teamName: 'Club', goals: 0, assists: 0, matchesPlayed: 1, rating: 7, cleanSheets: 0 });
  const players = service.resolvePositions({
    gk: [e('gk')], cb: [e('cb1'), e('cb2'), e('cb3')], cdm: [e('cdm1'), e('cdm2'), e('cdm3')],
    cam: [e('<cam&co>')], wingers: [e('w1'), e('w2')], strikers: [e('s1'), e('s2')],
  });
  assert.deepEqual(players.cdm.map((p) => p.username), ['cdm1']);
  assert.deepEqual(players.cm.map((p) => p.username), ['cdm2', 'cdm3']);

  const svg = new TotwRendererService().renderSvg({ leagueName: 'Superliga', players });
  for (const name of ['CDM1', 'CDM2', 'CDM3']) {
    assert.equal(svg.split(name).length - 1, 1, `${name} appears once`);
  }
  assert.ok(svg.includes('&lt;CAM&amp;CO&gt;'));
  assert.ok(!svg.includes('<CAM&CO>'));

  // Older line-ups without central midfielders must not repeat the CDM player either.
  const legacy = new TotwRendererService().renderSvg({ leagueName: 'S', players: { cdm: [e('a'), e('b')].map((p) => ({ username: p.username })) } });
  assert.equal(legacy.match(/>\s*A\s*</g).length, 1, 'CDM plate only');
  assert.equal(legacy.match(/>\s*B\s*</g).length, 1, 'LCM plate only');
});

test('a long lineup title is shortened instead of running under the formation pill', () => {
  assert.equal(truncateText('short', 10), 'short');
  assert.equal(truncateText('abcdefghij', 5), 'abcd…');
  assert.equal(truncateText('⚽⚽⚽⚽', 3), '⚽⚽…', 'never splits an emoji');
  const long = 'RYVL Esports vs Some Very Long Opponent Name — Superliga Romania Matchday 12 Final';
  const svg = new LineupRendererService().renderSvg({ formation: '433', players: {}, title: long });
  const title = /class="txt-title" font-size="34">([^<]*)</.exec(svg)[1];
  assert.ok(title.endsWith('…'));
  assert.ok(Array.from(title).length <= 53, `title has ${Array.from(title).length} characters`);
});
