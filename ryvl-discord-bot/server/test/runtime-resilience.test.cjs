'use strict';
// Interaction error fallback and pollers skipping guilds the bot was removed from.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { DiscordService } = require('../dist/discord/discord.service');
const { EaPollerService } = require('../dist/ea/ea-poller.service');
const { VpgPollerService } = require('../dist/vpg/vpg-poller.service');

test('isInGuild is false only for guilds a connected bot is not in', () => {
  const service = Object.create(DiscordService.prototype);
  service.client = { isReady: () => false, guilds: { cache: new Map() } };
  assert.equal(service.isInGuild('1'), true, 'not connected yet: assume present');
  service.client = { isReady: () => true, guilds: { cache: new Map([['1', {}]]) } };
  assert.equal(service.isInGuild('1'), true);
  assert.equal(service.isInGuild('2'), false);
});

test('scheduled EA and VPG transfer polls skip guilds the bot was removed from', async () => {
  const discord = { isInGuild: (id) => id === 'kept' };

  const ea = new EaPollerService({}, {}, discord, { frontendUrl: 'https://ryvl.top' });
  ea.loadPollTargets = async () => [
    { key: 'kept', guildId: 'kept', lastPolledAt: null, pollIntervalSec: 90 },
    { key: 'gone', guildId: 'gone', lastPolledAt: null, pollIntervalSec: 90 },
  ];
  const polledClubs = [];
  ea.pollClub = async (target) => { polledClubs.push(target.guildId); return { postedCount: 0 }; };
  await ea.pollAllGuilds();
  assert.deepEqual(polledClubs, ['kept']);

  const prisma = { vpgTransferConfig: { findMany: async () => [
    { guildId: 'kept', channelId: 'c1', enabled: true, lastPolledAt: null },
    { guildId: 'gone', channelId: 'c2', enabled: true, lastPolledAt: null },
  ] } };
  const vpg = new VpgPollerService(prisma, {}, discord);
  const polledTransfers = [];
  vpg.pollGuild = async (config) => { polledTransfers.push(config.guildId); return { postedCount: 0 }; };
  await vpg.pollAllGuilds();
  assert.deepEqual(polledTransfers, ['kept']);
});

test('startup sync survives one unavailable guild and still registers slash commands', async () => {
  const { Events } = require('discord.js');
  const listeners = {};
  const service = Object.create(DiscordService.prototype);
  service.logger = { log() {}, warn() {}, error() {} };
  const upserted = [];
  service.prisma = { guild: { upsert: async ({ where }) => { upserted.push(where.id); } } };
  const guild = (id, ok) => [id, { fetch: async () => { if (!ok) throw new Error('Unknown Guild'); return { name: id, iconURL: () => null }; } }];
  service.client = {
    user: { tag: 'bot' },
    on: (event, fn) => { listeners[event] = fn; },
    guilds: { fetch: async () => new Map([guild('a', true), guild('b', false), guild('c', true)]) },
  };
  let registered = false;
  service.registerGuildSlashCommands = async () => { registered = true; };
  service.setupEventHandlers();
  await listeners[Events.ClientReady]();
  assert.deepEqual(upserted, ['a', 'c']);
  assert.equal(registered, true);
});

test('the Discord edit modal accepts every description the event API accepts', async () => {
  const { EventEditCommand } = require('../dist/discord/commands/event-edit.command');
  const description = 'd'.repeat(2000);
  const event = {
    id: 'e1', guildId: 'g1', createdById: 'u1', title: 'Training', description, timezone: 'Europe/Bucharest',
    occurrences: [{ id: 'o1', messageId: 'm1', channelId: 'c1', status: 'PUBLISHED', startsAt: new Date('2026-10-10T18:00:00Z') }],
  };
  const command = new EventEditCommand({ event: { findUnique: async () => event } }, null);
  let modal;
  await command.showModal({
    guildId: 'g1', channelId: 'c1', user: { id: 'u1' }, message: { id: 'm1' },
    showModal: async (value) => { modal = value.toJSON(); },
    reply: async () => assert.fail('modal expected'),
  }, 'e1');
  const input = modal.components.map((row) => row.components[0]).find((c) => c.custom_id === 'edit_description');
  assert.equal(input.value.length, 2000);
  assert.ok(input.value.length <= input.max_length, 'Discord rejects a prefilled value longer than max_length');
});
