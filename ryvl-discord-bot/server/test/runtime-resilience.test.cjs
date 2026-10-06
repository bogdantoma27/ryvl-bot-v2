'use strict';
// Interaction error fallback and pollers skipping guilds the bot was removed from.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { answerFailedInteraction, INTERACTION_FAILURE_MESSAGE } = require('../dist/discord/interaction-errors');
const { DiscordService } = require('../dist/discord/discord.service');
const { EaPollerService } = require('../dist/ea/ea-poller.service');
const { VpgPollerService } = require('../dist/vpg/vpg-poller.service');

function fakeInteraction(state = {}) {
  const calls = [];
  const record = (name) => async (payload) => { calls.push([name, payload]); if (state.fail) throw new Error('Unknown interaction'); };
  return {
    calls,
    deferred: false,
    replied: false,
    responded: false,
    ...state,
    isAutocomplete: () => Boolean(state.autocomplete),
    isRepliable: () => !state.autocomplete,
    reply: record('reply'),
    followUp: record('followUp'),
    editReply: record('editReply'),
    respond: record('respond'),
  };
}

test('a failed interaction always gets an answer instead of "did not respond"', async () => {
  const fresh = fakeInteraction();
  await answerFailedInteraction(fresh);
  assert.deepEqual(fresh.calls, [['reply', { content: INTERACTION_FAILURE_MESSAGE, flags: MessageFlags.Ephemeral }]]);

  // deferReply / deferUpdate: a follow-up replaces "is thinking..." without touching the card.
  const deferred = fakeInteraction({ deferred: true });
  await answerFailedInteraction(deferred);
  assert.equal(deferred.calls[0][0], 'followUp');

  const replied = fakeInteraction({ replied: true });
  await answerFailedInteraction(replied);
  assert.equal(replied.calls[0][0], 'followUp');

  const autocomplete = fakeInteraction({ autocomplete: true });
  await answerFailedInteraction(autocomplete);
  assert.deepEqual(autocomplete.calls, [['respond', []]]);

  // An expired interaction must not turn into a second error.
  await assert.doesNotReject(answerFailedInteraction(fakeInteraction({ fail: true })));
});

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
