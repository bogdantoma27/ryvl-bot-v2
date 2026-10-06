'use strict';
// End-to-end tournament flows through TournamentService with an in-memory Prisma
// and a fake Discord client: signups → start → draft → fixtures → results → completion.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TournamentService } = require('../dist/tournaments/tournament.service.js');

function fakePrisma() {
  const rows = new Map();
  let clock = Date.parse('2026-10-06T00:00:00Z');
  const tick = () => new Date((clock += 1));
  const matches = (row, where) => Object.entries(where).every(([k, v]) => (v instanceof Date ? row[k]?.getTime() === v.getTime() : row[k] === v));
  return {
    rows,
    tournamentInstance: {
      async create({ data }) {
        const row = { id: `t${rows.size + 1}`, discordCategoryId: null, discordChannels: null, createdAt: tick(), updatedAt: tick(), ...data };
        rows.set(row.id, structuredClone(row));
        return structuredClone(row);
      },
      async findFirst({ where }) {
        const row = [...rows.values()].find((r) => matches(r, where));
        return row ? structuredClone(row) : null;
      },
      async findMany({ where }) {
        return [...rows.values()].filter((r) => matches(r, where)).reverse().map((r) => structuredClone(r));
      },
      async update({ where, data }) {
        const row = rows.get(where.id);
        Object.assign(row, structuredClone(data), { updatedAt: tick() });
        return structuredClone(row);
      },
      async updateMany({ where, data }) {
        const row = rows.get(where.id);
        if (!row || !matches(row, where)) return { count: 0 };
        Object.assign(row, structuredClone(data), { updatedAt: tick() });
        return { count: 1 };
      },
    },
    tournamentConfig: {
      async findUnique() {
        return { guildId: 'g1', adminRoleIds: [] };
      },
    },
  };
}

function fakeDiscord() {
  const sent = [];
  let nextId = 1;
  const messages = new Map();
  const channel = (id) => ({
    id,
    async send(payload) {
      const msg = { id: `m${nextId++}`, channelId: id, payload, async edit(p) { msg.payload = p; msg.edits = (msg.edits || 0) + 1; return msg; } };
      messages.set(msg.id, msg);
      sent.push(msg);
      return msg;
    },
    messages: { async fetch(mid) { return messages.get(mid) || null; } },
  });
  const guild = {
    id: 'g1',
    channels: {
      async create({ name }) { return { id: `c_${name}`, name }; },
      async fetch() { return null; },
    },
  };
  return {
    sent,
    client: {
      guilds: { cache: new Map([['g1', guild]]), async fetch() { return guild; } },
      channels: { async fetch(id) { return channel(id); } },
      users: { async fetch() { return { async send() {} }; } },
    },
    async sendMessageToChannel(id, payload) { return channel(id).send(payload); },
  };
}

const renderer = {
  async renderStandingsPng() { return Buffer.from('png'); },
  async renderRosterPng() { return Buffer.from('png'); },
};

function setup() {
  const prisma = fakePrisma();
  const discord = fakeDiscord();
  return { prisma, discord, service: new TournamentService(prisma, renderer, discord) };
}

const player = (i, pos1, extra = {}) => ({ userId: `u${i}`, displayName: `P${i}`, gamertag: `GT${i}`, pos1, ...extra });

test('draft tournament: managers form teams, draft runs, fixtures and results finish it', async () => {
  const { service, discord } = setup();
  let t = await service.createTournament('g1', { name: 'Cupa Draft', type: 'DRAFT', formation: '3-5-2' });
  assert.equal(t.type, 'DRAFT');
  assert.equal(t.status, 'SIGNUPS_OPEN');
  await service.setupTournamentChannels('g1', t.id);
  t = await service.getTournament(t.id, 'g1');
  assert.ok(service.channels(t).draft, 'draft channel saved with the others');

  await service.addSignup(t.id, player(1, 'ST', { teamName: 'Alpha' }), { guildId: 'g1' });
  await service.addSignup(t.id, player(2, 'GK', { teamName: 'Beta' }), { guildId: 'g1' });
  await service.addSignup(t.id, player(3, 'GK', { teamName: 'Gamma' }), { guildId: 'g1' });
  const positions = ['GK', 'GK', 'CB', 'CB', 'CB', 'CB', 'CB', 'CB', 'CM', 'CM', 'CM', 'CM', 'LM', 'RM', 'CAM', 'ST', 'ST', 'ST', 'LW', 'RW'];
  for (let i = 0; i < positions.length; i++) await service.addSignup(t.id, player(10 + i, positions[i]), { guildId: 'g1' });

  await assert.rejects(service.addSignup(t.id, player(99, 'ST'), { guildId: 'other-guild' }), /not found/, 'other servers cannot reach it');
  await assert.rejects(service.spinDraftWheel(t.id, 'ST', 'g1'), /nu a început/);

  const started = await service.startTournament(t.id, 'g1');
  t = started.tournament;
  assert.equal(t.status, 'DRAFTING');
  assert.deepEqual(service.teams(t).map((tm) => tm.name), ['Alpha', 'Beta', 'Gamma']);
  await assert.rejects(service.addSignup(t.id, player(98, 'ST'), { guildId: 'g1' }), /închise/);
  await assert.rejects(service.removeSignup(t.id, 'u10', 'g1'), /început/);

  // Alpha's manager plays ST, so one ST slot is left for them.
  assert.deepEqual(service.currentOpenSlots(t).filter((s) => s === 'ST'), ['ST']);
  const spin = await service.spinDraftWheel(t.id, 'gk', 'g1');
  assert.equal(spin.position, 'GK');
  assert.equal(spin.candidate.pos1, 'GK');
  await assert.rejects(service.spinDraftWheel(t.id, 'ST', 'g1'), /deja/);
  const joker = await service.useDraftJoker(t.id, 'g1');
  assert.equal(joker.jokersLeft, 3);
  assert.notEqual(joker.candidate.userId, spin.candidate.userId);
  const pick = await service.confirmDraftPick(t.id, 'g1');
  assert.equal(pick.pick.teamName, 'Alpha');
  assert.equal(pick.pick.position, 'GK');
  t = pick.tournament;
  assert.equal(service.currentDraftTeam(t).team.name, 'Beta');
  await assert.rejects(service.spinDraftWheel(t.id, 'GK', 'g1'), /nu mai este liberă/, 'Beta manager is already the GK');

  t = await service.autoDraftRemaining(t.id, 'g1');
  assert.equal(t.status, 'ACTIVE');
  const teams = service.teams(t);
  const allPicked = teams.flatMap((tm) => tm.picks.map((p) => p.userId));
  assert.equal(new Set(allPicked).size, allPicked.length, 'nobody drafted twice');
  assert.equal(allPicked.length, 23, 'all 3 managers and 20 players placed');
  for (const tm of teams) {
    const slots = tm.picks.map((p) => p.position);
    assert.equal(new Set(slots.filter((s) => !['CB', 'CM', 'ST'].includes(s))).size, slots.filter((s) => !['CB', 'CM', 'ST'].includes(s)).length, `no duplicate unique slot in ${tm.name}`);
  }

  const fixtures = service.matches(t);
  assert.equal(fixtures.length, 3);
  await assert.rejects(service.recordMatchResult(t.id, { matchId: fixtures[0].id, homeScore: -1, awayScore: 2 }, 'g1'), /0 și 99/);
  for (const [i, m] of fixtures.entries()) {
    const res = await service.recordMatchResult(t.id, { matchId: m.id, homeScore: i + 1, awayScore: 0 }, 'g1');
    t = res.tournament;
  }
  assert.equal(t.status, 'COMPLETED');
  assert.ok(discord.sent.some((m) => JSON.stringify(m.payload).includes('Campioni')), 'winner announced');
});

test('standard tournament: 9 teams → 8-team bracket, fixtures by name either way round', async () => {
  const { service } = setup();
  let t = await service.createTournament('g1', { name: 'Cupa Standard' });
  assert.equal(t.type, 'STANDARD');
  await assert.rejects(service.addSignup(t.id, player(1, undefined), { guildId: 'g1' }), /echipei/);
  for (let i = 1; i <= 9; i++) await service.addSignup(t.id, player(i, undefined, { teamName: `Team ${i}` }), { guildId: 'g1' });
  await assert.rejects(service.addSignup(t.id, player(50, undefined, { teamName: 'team 3' }), { guildId: 'g1' }), /deja folosit/);

  t = await service.toggleSignups(t.id, 'g1');
  assert.equal(t.status, 'SIGNUPS_CLOSED');
  const res = await service.startTournament(t.id, 'g1');
  t = res.tournament;
  assert.equal(t.status, 'ACTIVE');
  assert.equal(service.teams(t).length, 8);
  assert.equal(service.teams(t)[0].managerId, 'u1', 'captain manages the team');
  assert.equal(service.matches(t).length, 12, '2 groups of 4, 6 matches each');
  assert.deepEqual(service.toDto(t).groups.map((g) => g.rows.length), [4, 4]);
  assert.equal(service.signups(t)[8].isBackup, true);
  await assert.rejects(service.toggleSignups(t.id, 'g1'), /început/);

  const first = service.matches(t)[0];
  const r = await service.recordMatchResult(
    t.id,
    { homeTeam: first.awayTeam, awayTeam: first.homeTeam, homeScore: 3, awayScore: 1 },
    'g1',
  );
  assert.equal(r.match.id, first.id);
  assert.equal(r.match.awayScore, 3, 'score is stored the right way round');
  await assert.rejects(
    service.recordMatchResult(t.id, { homeTeam: 'Team 1', awayTeam: 'Nobody', homeScore: 1, awayScore: 0 }, 'g1'),
    /Nu există/,
  );
  const group = service.toDto(r.tournament).groups.find((g) => g.group === first.group);
  assert.equal(group.rows[0].team, first.awayTeam);
  assert.equal(group.rows[0].points, 3);
});

test('group stage + knockouts: 16 teams play groups, quarters, semis and a final decided on penalties', async () => {
  const { service, discord } = setup();
  let t = await service.createTournament('g1', { name: 'Cupa' });
  await service.setupTournamentChannels('g1', t.id);
  for (let i = 1; i <= 16; i++) await service.addSignup(t.id, player(i, undefined, { teamName: `Team ${i}` }), { guildId: 'g1' });
  t = (await service.startTournament(t.id, 'g1')).tournament;
  assert.equal(service.toDto(t).format, 'GROUPS_KNOCKOUT');
  assert.equal(service.toDto(t).groups.length, 4);

  // Home side wins every group match, so each group table is decided.
  const groupMatches = service.matches(t);
  for (const [i, m] of groupMatches.entries()) {
    const res = await service.recordMatchResult(t.id, { matchId: m.id, homeScore: 2, awayScore: i % 2 }, 'g1');
    t = res.tournament;
    if (i < groupMatches.length - 1) assert.equal(res.newStage.length, 0);
    else assert.equal(res.newStage.length, 4, 'quarter-finals drawn after the last group match');
  }
  const tables = service.toDto(t).groups;
  const quarters = service.matches(t).filter((m) => m.stage === 'KNOCKOUT');
  assert.deepEqual(
    quarters.map((m) => [m.homeTeam, m.awayTeam]),
    [
      [tables[0].rows[0].team, tables[1].rows[1].team],
      [tables[2].rows[0].team, tables[3].rows[1].team],
      [tables[1].rows[0].team, tables[0].rows[1].team],
      [tables[3].rows[0].team, tables[2].rows[1].team],
    ],
  );
  await assert.rejects(
    service.recordMatchResult(t.id, { matchId: groupMatches[0].id, homeScore: 0, awayScore: 5 }, 'g1'),
    /grupe nu mai pot/,
    'group scores are frozen once the knockouts are drawn',
  );
  await assert.rejects(
    service.recordMatchResult(t.id, { matchId: quarters[0].id, homeScore: 1, awayScore: 1 }, 'g1'),
    /penalty/,
    'knockout draws need penalties',
  );

  for (const m of quarters) t = (await service.recordMatchResult(t.id, { matchId: m.id, homeScore: 1, awayScore: 0 }, 'g1')).tournament;
  const semis = service.matches(t).filter((m) => m.stage === 'KNOCKOUT' && m.round === 2);
  assert.deepEqual(semis.map((m) => [m.homeTeam, m.awayTeam]), [
    [quarters[0].homeTeam, quarters[1].homeTeam],
    [quarters[2].homeTeam, quarters[3].homeTeam],
  ]);
  for (const m of semis) t = (await service.recordMatchResult(t.id, { matchId: m.id, homeScore: 0, awayScore: 2 }, 'g1')).tournament;
  const final = service.matches(t).find((m) => m.stage === 'KNOCKOUT' && m.round === 3);
  assert.equal(final.homeTeam, semis[0].awayTeam);
  const res = await service.recordMatchResult(t.id, { matchId: final.id, homeScore: 2, awayScore: 2, homePens: 3, awayPens: 5 }, 'g1');
  assert.equal(res.completed, true);
  assert.equal(res.tournament.status, 'COMPLETED');
  assert.equal(service.toDto(res.tournament).champion, final.awayTeam);
  assert.ok(discord.sent.some((m) => JSON.stringify(m.payload).includes(`Campioni: ${final.awayTeam}`)));
});

test('panels are edited in place instead of reposted', async () => {
  const { service, discord } = setup();
  let t = await service.createTournament('g1', { name: 'Panels', type: 'DRAFT' });
  await service.setupTournamentChannels('g1', t.id);
  const registrationPosts = () => discord.sent.filter((m) => m.channelId === 'c_registration');
  assert.equal(registrationPosts().length, 1);
  await service.addSignup(t.id, player(1, 'ST'), { guildId: 'g1' });
  await service.addSignup(t.id, player(2, 'CM'), { guildId: 'g1' });
  await service.refreshTournamentEmbeds(t.id, 'g1');
  assert.equal(registrationPosts().length, 1);
  assert.equal(registrationPosts()[0].edits, 3);
});
