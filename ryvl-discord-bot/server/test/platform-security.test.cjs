'use strict';
// Channel ownership, slash-command permissions, guild settings and event ownership,
// all against compiled code with fake Discord/database objects (no network).
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { assertChannelInGuild } = require('../dist/discord/channel-guard');
const {
  ADMIN_SUBCOMMANDS,
  isAdminSubcommand,
  canManageGuild,
  ensureManageGuild,
} = require('../dist/discord/commands/command-permissions');
const { getSlashCommands } = require('../dist/discord/commands/register-commands');
const { describeSlashCommands } = require('../dist/website/bot-commands');
const { GuildsService, isValidTimeZone } = require('../dist/guilds/guilds.service');
const { EventsController } = require('../dist/events/events.controller');

const GUILD = '200000000000000001';
const OTHER_GUILD = '200000000000000002';
const TEXT = '300000000000000001';
const FOREIGN_TEXT = '300000000000000002';
const VOICE = '300000000000000003';
const NEWS = '300000000000000004';

function lookup() {
  const send = async () => ({ id: 'm1' });
  const channels = {
    [TEXT]: { id: TEXT, guildId: GUILD, type: ChannelType.GuildText, send },
    [NEWS]: { id: NEWS, guildId: GUILD, type: ChannelType.GuildAnnouncement, send },
    [FOREIGN_TEXT]: { id: FOREIGN_TEXT, guildId: OTHER_GUILD, type: ChannelType.GuildText, send },
    [VOICE]: { id: VOICE, guildId: GUILD, type: ChannelType.GuildVoice, send },
  };
  const fetched = [];
  return {
    fetched,
    channels: {
      fetch: async (id) => {
        fetched.push(id);
        if (!channels[id]) throw new Error('Unknown Channel');
        return channels[id];
      },
    },
  };
}

test('assertChannelInGuild accepts text and announcement channels of the guild', async () => {
  const client = lookup();
  assert.equal((await assertChannelInGuild(client, GUILD, TEXT)).id, TEXT);
  assert.equal((await assertChannelInGuild(client, GUILD, NEWS)).id, NEWS);
});

test('assertChannelInGuild rejects another server\'s channel, non-text channels and unknown ids', async () => {
  const client = lookup();
  for (const id of [FOREIGN_TEXT, VOICE, '399999999999999999']) {
    await assert.rejects(() => assertChannelInGuild(client, GUILD, id), (e) => e.getStatus() === 400, id);
  }
});

test('assertChannelInGuild rejects malformed ids without asking Discord', async () => {
  const client = lookup();
  for (const id of [undefined, null, '', 'general', '123', { id: TEXT }, `${TEXT}/messages`]) {
    await assert.rejects(() => assertChannelInGuild(client, GUILD, id), (e) => e.getStatus() === 400);
  }
  assert.deepEqual(client.fetched, []);
});

function interaction(perms, { inGuild = true, deferred = false } = {}) {
  const sent = [];
  return {
    sent,
    deferred,
    replied: false,
    inGuild: () => inGuild,
    memberPermissions: { has: (bit) => perms.includes(bit) },
    reply: async (o) => sent.push(['reply', o]),
    editReply: async (o) => sent.push(['editReply', o]),
  };
}

test('admin subcommands of mixed commands are listed centrally', () => {
  assert.equal(isAdminSubcommand('ryvl', 'setup'), true);
  assert.equal(isAdminSubcommand('ryvl', 'results'), false);
  assert.equal(isAdminSubcommand('event', 'create'), true);
  assert.equal(isAdminSubcommand('event', 'delete'), true);
  assert.equal(isAdminSubcommand('event', 'list'), false);
  assert.equal(isAdminSubcommand('live_results', 'setup'), true);
  assert.equal(isAdminSubcommand('live_results', 'today'), false);
  assert.equal(isAdminSubcommand('vpg_transfers', 'setup'), true);
  assert.equal(isAdminSubcommand('vpg_transfers', 'latest'), false);
  assert.equal(isAdminSubcommand('tournament', 'create'), false, 'tournament keeps its own role-aware check');
  assert.equal(isAdminSubcommand('ryvl', null), false);
});

test('ensureManageGuild refuses members without Manage Server, ephemerally', async () => {
  const member = interaction([]);
  assert.equal(await ensureManageGuild(member), false);
  assert.equal(member.sent[0][0], 'reply');
  assert.ok(member.sent[0][1].flags, 'refusal is ephemeral');

  const deferred = interaction([], { deferred: true });
  assert.equal(await ensureManageGuild(deferred), false);
  assert.equal(deferred.sent[0][0], 'editReply');

  const admin = interaction([PermissionFlagsBits.ManageGuild]);
  assert.equal(await ensureManageGuild(admin), true);
  assert.deepEqual(admin.sent, []);
  assert.equal(canManageGuild(interaction([PermissionFlagsBits.ManageGuild], { inGuild: false })), false);
});

test('setup/admin-only slash commands default to Manage Server; public ones stay public', () => {
  const byName = new Map(getSlashCommands().map((c) => [c.name, c]));
  const manage = String(PermissionFlagsBits.ManageGuild);
  for (const name of ['ea_setup', 'ea_latest', 'track_team', 'lineup_post', 'totw', 'superliga_mvp', 'create_tournament']) {
    assert.equal(byName.get(name)?.default_member_permissions, manage, name);
  }
  for (const name of ['ea_stats', 'stats', 'team_stats', 'superliga', 'register-player', 'unregister-player']) {
    assert.equal(byName.get(name)?.default_member_permissions ?? null, null, name);
  }
  // Mixed commands stay visible; their admin subcommands are checked at runtime.
  for (const name of Object.keys(ADMIN_SUBCOMMANDS)) {
    assert.equal(byName.get(name)?.default_member_permissions ?? null, null, name);
    const subs = byName.get(name).options.map((o) => o.name);
    for (const sub of ADMIN_SUBCOMMANDS[name]) assert.ok(subs.includes(sub), `${name} ${sub} is registered`);
  }
});

test('the docs feed lists every registered command and subcommand with options', () => {
  const docs = describeSlashCommands();
  const names = new Set(docs.map((d) => d.name));
  for (const command of getSlashCommands()) {
    const subs = (command.options || []).filter((o) => o.type === 1);
    if (!subs.length) assert.ok(names.has(`/${command.name}`), command.name);
    for (const sub of subs) assert.ok(names.has(`/${command.name} ${sub.name}`), `${command.name} ${sub.name}`);
  }
  const post = docs.find((d) => d.name === '/totw post');
  assert.equal(post.adminOnly, true);
  assert.deepEqual(post.options.map((o) => [o.name, o.type, o.required]), [
    ['channel', 'channel', false], ['league', 'text', false], ['is_tots', 'true/false', false],
  ]);
  assert.equal(docs.find((d) => d.name === '/ryvl setup').adminOnly, true);
  assert.equal(docs.find((d) => d.name === '/ryvl results').adminOnly, false);
  assert.ok(docs.find((d) => d.name === '/superliga leaderboard').options[0].choices.includes('Top Strikers'));
  assert.ok(!names.has('/club-stats') && !names.has('/vpg-totw'), 'no invented commands');
});

function guildsService({ channels = lookup() } = {}) {
  const writes = [];
  const prisma = {
    guild: {
      findUnique: async () => ({ id: GUILD, name: 'RYVL', timezone: 'Europe/Bucharest', ryvlTeamName: 'RYVL Esports' }),
      update: async (args) => { writes.push(['guild.update', args]); return {}; },
    },
    vpgTransferConfig: { upsert: async (args) => { writes.push(['vpg.upsert', args]); return {}; } },
  };
  const discord = {
    client: { guilds: { cache: new Map(), fetch: async () => null } },
    assertChannelInGuild: (guildId, channelId) => assertChannelInGuild(channels, guildId, channelId),
  };
  return { service: new GuildsService(prisma, discord), writes };
}

test('settings PATCH writes only the fields sent', async () => {
  const { service, writes } = guildsService();
  await service.updateSettings(GUILD, { defaultFixturesChannelId: TEXT });
  assert.deepEqual(writes, [['guild.update', { where: { id: GUILD }, data: { defaultFixturesChannelId: TEXT } }]]);
});

test('settings PATCH clears a channel with null or empty string', async () => {
  const { service, writes } = guildsService();
  await service.updateSettings(GUILD, { defaultStandingsChannelId: '', defaultChannelId: null });
  assert.deepEqual(writes[0][1].data, { defaultStandingsChannelId: null, defaultChannelId: null });
});

test('settings PATCH rejects channels of another server and unknown timezones', async () => {
  const { service, writes } = guildsService();
  await assert.rejects(() => service.updateSettings(GUILD, { defaultContactChannelId: FOREIGN_TEXT }), (e) => e.getStatus() === 400);
  await assert.rejects(() => service.updateSettings(GUILD, { timezone: 'Mars/Olympus' }), (e) => e.getStatus() === 400);
  await assert.rejects(() => service.updateSettings(GUILD, { ryvlTeamName: '   ' }), (e) => e.getStatus() === 400);
  assert.deepEqual(writes, []);
  assert.equal(isValidTimeZone('Europe/London'), true);
});

test('choosing a transfers channel never creates an enabled transfer tracker', async () => {
  const { service, writes } = guildsService();
  await service.updateSettings(GUILD, { defaultTransfersChannelId: TEXT });
  const upsert = writes.find(([kind]) => kind === 'vpg.upsert')[1];
  assert.equal(upsert.create.enabled, false);
  assert.deepEqual(upsert.update, { channelId: TEXT });
});

function eventsController() {
  const calls = [];
  const events = {
    getEvent: async (id) => ({ id, guildId: id === 'mine' ? GUILD : OTHER_GUILD, occurrences: [] }),
    getOccurrence: async (id) => ({ id, eventId: 'mine', event: { guildId: id === 'occ-mine' ? GUILD : OTHER_GUILD } }),
    updateEvent: async (id) => { calls.push(['update', id]); return { id }; },
    deleteEvent: async (id) => { calls.push(['delete', id]); return { id }; },
    cancelOccurrence: async (id) => { calls.push(['cancel', id]); return { id }; },
  };
  const rsvps = { getRsvps: async () => ({}), getFlatRsvps: async () => [] };
  return { controller: new EventsController(events, rsvps), calls };
}

test('event routes refuse ids that belong to another server', async () => {
  const { controller, calls } = eventsController();
  await assert.rejects(() => controller.getEvent(GUILD, 'theirs'), (e) => e.getStatus() === 404);
  await assert.rejects(() => controller.updateEvent(GUILD, 'theirs', {}), (e) => e.getStatus() === 404);
  await assert.rejects(() => controller.deleteEvent(GUILD, 'theirs'), (e) => e.getStatus() === 404);
  await assert.rejects(() => controller.cancelOccurrence(GUILD, 'mine', 'occ-theirs'), (e) => e.getStatus() === 404);
  await assert.rejects(() => controller.getEventRsvps(GUILD, 'mine', 'occ-theirs'), (e) => e.getStatus() === 404);
  assert.deepEqual(calls, []);
  await controller.updateEvent(GUILD, 'mine', {});
  await controller.cancelOccurrence(GUILD, 'mine', 'occ-mine');
  assert.deepEqual(calls, [['update', 'mine'], ['cancel', 'occ-mine']]);
});

test('the public event Delete button only lets the creator or event managers delete', async () => {
  const { EventDeleteCommand } = require('../dist/discord/commands/event-delete.command');
  const deleted = [];
  const prisma = { event: { findUnique: async () => ({ id: 'e1', guildId: GUILD, createdById: 'creator', title: 'Training' }) } };
  const command = new EventDeleteCommand({ deleteEvent: async (id) => deleted.push(id) }, prisma);
  const click = (userId, perms = []) => {
    const replies = [];
    return {
      replies,
      customId: 'confirm:delete:e1',
      guildId: GUILD,
      user: { id: userId },
      memberPermissions: { has: (bit) => perms.includes(bit) },
      deferUpdate: async () => {},
      deferReply: async () => {},
      editReply: async (o) => replies.push(o),
    };
  };
  const stranger = click('someone');
  await command.handleButton(stranger);
  const prompted = click('someone');
  await command.promptDelete(prompted, 'e1');
  assert.deepEqual(deleted, []);
  assert.match(stranger.replies[0].content, /only delete events you created/);
  assert.match(prompted.replies[0].content, /only delete events you created/);
  await command.handleButton(click('creator'));
  await command.handleButton(click('mod', [PermissionFlagsBits.ManageEvents]));
  assert.deepEqual(deleted, ['e1', 'e1']);
});
