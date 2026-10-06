'use strict';
// The slash-command surface: every registered command and subcommand reaches a handler,
// handlers only branch on registered subcommands, autocomplete options are served, and
// every admin subcommand is gated and labelled as such in the docs feed.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ApplicationCommandOptionType: T } = require('discord.js');
const { getSlashCommands } = require('../dist/discord/commands/register-commands');
const {
  SLASH_COMMAND_ROUTES,
  AUTOCOMPLETE_ROUTES,
  resolveSlashRoute,
  resolveAutocompleteRoute,
} = require('../dist/discord/commands/command-routes');
const { ADMIN_SUBCOMMANDS, TOURNAMENT_ADMIN_SUBCOMMANDS } = require('../dist/discord/commands/command-permissions');
const { describeSlashCommands } = require('../dist/website/bot-commands');
const { SuperligaCommands } = require('../dist/discord/commands/superliga-commands');
const { RyvlCommands } = require('../dist/discord/commands/ryvl-commands');
const { EaCommands } = require('../dist/discord/commands/ea-commands');

const commands = getSlashCommands();
const subcommandsOf = (command) =>
  (command.options || []).filter((o) => o.type === T.Subcommand).map((o) => o.name);
const source = (file) => fs.readFileSync(path.join(__dirname, '../src/discord/commands', file), 'utf8');

test('command names are unique and every registered command has a dispatcher route', () => {
  const names = commands.map((c) => c.name);
  assert.equal(new Set(names).size, names.length, 'duplicate command names');
  assert.deepEqual([...names].sort(), Object.keys(SLASH_COMMAND_ROUTES).sort(), 'registered commands = routed commands');
  for (const command of commands) {
    const route = SLASH_COMMAND_ROUTES[command.name];
    const subs = subcommandsOf(command);
    if (subs.length) {
      assert.equal(route.run, undefined, `${command.name} has subcommands; route them individually`);
      assert.deepEqual(Object.keys(route.subcommands).sort(), [...subs].sort(), `${command.name} subcommands`);
    } else {
      assert.equal(typeof route.run, 'function', `${command.name} has a handler`);
      assert.equal(route.subcommands, undefined, `${command.name} has no subcommands to route`);
    }
  }
  assert.equal(resolveSlashRoute('removed_command', null), null);
  assert.equal(resolveSlashRoute('event', 'unregistered'), null);
});

test('each route calls exactly one handler method', async () => {
  const calls = [];
  const recorder = (group) =>
    new Proxy({}, { get: (_, method) => async () => calls.push(`${group}.${String(method)}`) });
  const handlers = new Proxy({}, { get: (_, group) => recorder(String(group)) });
  for (const command of commands) {
    const subs = subcommandsOf(command);
    for (const sub of subs.length ? subs : [null]) {
      calls.length = 0;
      await resolveSlashRoute(command.name, sub)(handlers, {});
      assert.equal(calls.length, 1, `/${command.name} ${sub ?? ''} -> ${calls.join(', ')}`);
    }
  }
});

test('handlers only branch on subcommands that are registered, and cover all of them', () => {
  const files = {
    'superliga-commands.ts': ['superliga', 'live_results'],
    'ryvl-commands.ts': ['ryvl'],
    'totw-commands.ts': ['totw'],
    'superliga-mvp-commands.ts': ['superliga_mvp'],
    'tournament-commands.ts': ['tournament'],
  };
  const byName = new Map(commands.map((c) => [c.name, c]));
  for (const [file, names] of Object.entries(files)) {
    const registered = new Set(names.flatMap((n) => subcommandsOf(byName.get(n))));
    const branches = new Set(
      [...source(file).matchAll(/\b(?:subcommand|sub)\s*===\s*'([^']+)'/g)].map((m) => m[1]),
    );
    for (const branch of branches) assert.ok(registered.has(branch), `${file} handles unregistered '${branch}'`);
    for (const sub of registered) assert.ok(branches.has(sub), `${file} never handles '${sub}'`);
  }
});

test('every autocomplete option has an autocomplete handler, and vice versa', () => {
  const expected = [];
  for (const command of commands) {
    const scan = (options, sub) => {
      for (const option of options || []) {
        if (option.type === T.Subcommand) scan(option.options, option.name);
        else if (option.autocomplete) expected.push(`${command.name}/${sub}/${option.name}`);
      }
    };
    scan(command.options, '');
  }
  const routed = Object.entries(AUTOCOMPLETE_ROUTES).flatMap(([command, subs]) =>
    Object.entries(subs).flatMap(([sub, options]) => Object.keys(options).map((o) => `${command}/${sub}/${o}`)),
  );
  assert.deepEqual(routed.sort(), expected.sort());
  for (const key of expected) {
    const [command, sub, option] = key.split('/');
    assert.equal(typeof resolveAutocompleteRoute(command, sub || null, option), 'function', key);
  }
  assert.equal(resolveAutocompleteRoute('event', 'delete', 'other'), null);
});

// What a member must be allowed to do to run each entry. Update this table deliberately
// when a command is added: it is the review point for the permission model.
const ADMIN_ENTRIES = new Set([
  '/event create', '/event delete',
  '/lineup_post', '/ea_setup', '/ea_latest', '/track_team',
  '/totw post', '/totw preview', '/totw setup',
  '/vpg_transfers setup', '/vpg_transfers check',
  '/live_results check', '/live_results setup',
  '/ryvl setup',
  '/superliga_mvp leaderboard', '/superliga_mvp post', '/superliga_mvp sync',
  '/create_tournament',
  ...TOURNAMENT_ADMIN_SUBCOMMANDS.map((s) => `/tournament ${s}`),
]);

test('admin subcommands are gated and the docs feed labels them correctly', () => {
  const docs = describeSlashCommands();
  for (const doc of docs) {
    assert.equal(doc.adminOnly, ADMIN_ENTRIES.has(doc.name), `${doc.name} admin label`);
  }
  assert.deepEqual(new Set(docs.map((d) => d.name)).size, docs.length);
  for (const name of ADMIN_ENTRIES) assert.ok(docs.some((d) => d.name === name), `${name} is registered`);

  // Configuration-style subcommands of otherwise public commands must be in the runtime list.
  const byName = new Map(commands.map((c) => [c.name, c]));
  for (const command of commands) {
    if (command.default_member_permissions != null || command.name === 'tournament') continue;
    for (const sub of subcommandsOf(command)) {
      if (['setup', 'check', 'sync', 'create', 'delete'].includes(sub)) {
        assert.ok((ADMIN_SUBCOMMANDS[command.name] || []).includes(sub), `/${command.name} ${sub} must be admin-gated`);
      }
    }
  }
  for (const [name, subs] of Object.entries(ADMIN_SUBCOMMANDS)) {
    for (const sub of subs) assert.ok(subcommandsOf(byName.get(name)).includes(sub), `${name} ${sub}`);
  }
});

test('the tournament admin list matches the handler', () => {
  const match = source('tournament-commands.ts').match(/const adminOnly = \[([^\]]+)\]/);
  assert.ok(match, 'adminOnly list found in tournament-commands.ts');
  const handlerList = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...handlerList].sort(), [...TOURNAMENT_ADMIN_SUBCOMMANDS].sort());
});

test('channel options only offer text and announcement channels', () => {
  const walk = (options, where) => {
    for (const option of options || []) {
      if (option.type === T.Subcommand) walk(option.options, `${where} ${option.name}`);
      else if (option.type === T.Channel) {
        assert.deepEqual([...(option.channel_types || [])].sort(), [0, 5], `${where} ${option.name}`);
      }
    }
  };
  for (const command of commands) walk(command.options, `/${command.name}`);
});

test('descriptions fit Discord limits', () => {
  const walk = (options, where) => {
    for (const option of options || []) {
      assert.ok(option.description.length >= 1 && option.description.length <= 100, `${where} ${option.name}`);
      walk(option.options, `${where} ${option.name}`);
    }
  };
  for (const command of commands) {
    assert.ok(command.description.length <= 100, command.name);
    assert.match(command.name, /^[a-z0-9_-]{1,32}$/);
    walk(command.options, `/${command.name}`);
  }
});

function fakeInteraction({ options = {}, guildId = 'g1' } = {}) {
  const replies = [];
  return {
    replies,
    guildId,
    guild: { name: 'Guild' },
    user: { id: 'u1', username: 'ana' },
    deferred: false,
    options: {
      getSubcommand: () => options.subcommand,
      getString: (n) => options[n] ?? null,
      getChannel: (n) => options[n] ?? null,
      getInteger: (n) => options[n] ?? null,
      getBoolean: (n) => options[n] ?? null,
      getUser: (n) => options[n] ?? null,
    },
    async deferReply(opts) { this.deferred = true; this.deferOptions = opts; },
    async editReply(payload) { replies.push(payload); },
    async reply(payload) { replies.push(payload); },
  };
}

test("/live_results today keeps the latest results when nothing was played today", async () => {
  const match = { matchDay: 3, dateFormattedRo: '01.10', homeName: 'A', awayName: 'B', homeScore: 2, awayScore: 1 };
  const vpg = {
    leagueToday: () => '2026-10-06',
    getResults: async (q) => (q.day ? { season: 4, results: [] } : { season: 4, results: [match] }),
  };
  const commandsUnderTest = new SuperligaCommands(vpg, {}, {});
  const embed = await commandsUnderTest.resultsEmbed({ today: true });
  assert.match(embed.data.description, /Nu s-au găsit meciuri jucate astăzi/);
  assert.match(embed.data.description, /\*\*A\*\* `2 — 1` \*\*B\*\*/, 'the fallback results are still listed');
});

test('/ryvl setup without channels changes nothing; with one it saves only that one', async () => {
  const writes = [];
  const prisma = {
    guild: {
      upsert: async (args) => { writes.push(args); return { defaultRyvlResultsChannelId: 'c1' }; },
      findUnique: async () => ({ defaultRyvlResultsChannelId: 'old' }),
    },
  };
  const ryvl = new RyvlCommands({}, prisma, {});
  const empty = fakeInteraction({ options: { subcommand: 'setup' } });
  await ryvl.handleRyvl(empty);
  assert.equal(writes.length, 0);
  assert.match(empty.replies.at(-1).content, /nothing changed[\s\S]*Results: <#old>/);

  const one = fakeInteraction({ options: { subcommand: 'setup', results_channel: { id: 'c1' } } });
  await ryvl.handleRyvl(one);
  assert.deepEqual(writes[0].update, { defaultRyvlResultsChannelId: 'c1' });
  assert.match(one.replies.at(-1).content, /configured[\s\S]*Results: <#c1> \(updated\)/);

  prisma.guild.upsert = async () => { throw new Error('db down'); };
  const failing = fakeInteraction({ options: { subcommand: 'setup', results_channel: { id: 'c1' } } });
  await ryvl.handleRyvl(failing);
  assert.match(failing.replies.at(-1).content, /Could not save the RYVL channels: db down/);
});

test("/team_stats with an unknown club does not answer with the default club's stats", async () => {
  const ea = { getClubStats: async () => ({ clubId: '128199', clubName: 'RYVL Esports', topScorers: [] }) };
  const handler = new EaCommands(ea, {}, {});
  const interaction = fakeInteraction({ options: { name: 'Some Other FC' } });
  await handler.handleTeamStats(interaction);
  assert.match(interaction.replies.at(-1), /Some Other FC\*\* is not tracked/);
});

test('/ea_setup does not fall back to the default club when the EA search fails', async () => {
  let saved = false;
  const ea = {
    searchClubs: async () => { throw new Error('EA timeout'); },
    updateTrackerConfig: async () => { saved = true; },
  };
  const handler = new EaCommands(ea, {}, {});
  const interaction = fakeInteraction({ options: { channel: { id: 'c1', type: 0 }, club_name: 'Some FC' } });
  await handler.handleSetup(interaction);
  assert.equal(saved, false);
  assert.match(interaction.replies.at(-1), /Setup cancelled/);
});

test('a handler error still answers the interaction without overwriting public messages', async () => {
  const { DiscordService } = require('../dist/discord/discord.service');
  const report = DiscordService.prototype.reportInteractionError;
  const make = (kind, state) => {
    const calls = [];
    return {
      calls,
      ...state,
      isAutocomplete: () => false,
      isRepliable: () => true,
      isChatInputCommand: () => kind === 'command',
      reply: async (p) => calls.push(['reply', p]),
      editReply: async (p) => calls.push(['editReply', p]),
      followUp: async (p) => calls.push(['followUp', p]),
    };
  };
  const fresh = make('command', { deferred: false, replied: false });
  await report.call({}, fresh);
  assert.equal(fresh.calls[0][0], 'reply');
  assert.ok(fresh.calls[0][1].flags, 'ephemeral');

  const deferredCommand = make('command', { deferred: true, replied: false });
  await report.call({}, deferredCommand);
  assert.equal(deferredCommand.calls[0][0], 'editReply');

  // A button that called deferUpdate(): editReply would replace the announcement itself.
  const deferredButton = make('button', { deferred: true, replied: false });
  await report.call({}, deferredButton);
  assert.equal(deferredButton.calls[0][0], 'followUp');
  assert.ok(deferredButton.calls[0][1].flags, 'ephemeral');
});
