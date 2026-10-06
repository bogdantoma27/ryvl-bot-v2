'use strict';
// Public contact/trial forms: validation, rate limiting, client address, storage-first delivery.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateContactForm,
  validateRecruitmentForm,
  FixedWindowRateLimiter,
  clientIp,
  CONTACT_LIMITS,
} = require('../dist/website/website-forms');
const { WebsiteSubmissionsService } = require('../dist/website/website-submissions.service');
const { WebsiteController } = require('../dist/website/website.controller');

const contact = { name: 'Ana', contact: 'ana#1234', topic: 'Scrims', message: 'Scrim on Friday?' };
const trial = { gamertag: 'RYVL_9', discordTag: 'ana', primaryPosition: 'ST', secondaryPosition: 'None', platform: 'PS5', age: 19, experience: '' };

test('a normal contact form is accepted and trimmed', () => {
  const result = validateContactForm({ ...contact, name: '  Ana  ', guildId: '1' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, contact, 'unknown fields such as guildId are dropped');
});

test('contact form: required fields, lengths and types', () => {
  assert.equal(validateContactForm({ ...contact, message: '   ' }).ok, false);
  assert.equal(validateContactForm({ ...contact, name: undefined }).ok, false);
  assert.equal(validateContactForm({ ...contact, contact: { $gt: '' } }).ok, false);
  assert.equal(validateContactForm({ ...contact, message: 'x'.repeat(CONTACT_LIMITS.message + 1) }).ok, false);
  assert.equal(validateContactForm({ ...contact, message: 'x'.repeat(CONTACT_LIMITS.message) }).ok, true);
  assert.equal(validateContactForm(null).ok, false);
  assert.equal(validateContactForm({ ...contact, topic: '' }).value.topic, 'General');
  assert.equal(validateContactForm({ ...contact, message: 'a\u0000b\nc' }).value.message, 'ab\nc');
});

test('recruitment form: age range and optional fields', () => {
  const ok = validateRecruitmentForm(trial);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.secondaryPosition, null);
  assert.equal(ok.value.experience, null);
  assert.equal(ok.value.age, 19);
  assert.equal(validateRecruitmentForm({ ...trial, age: '19' }).value.age, 19);
  assert.equal(validateRecruitmentForm({ ...trial, age: undefined }).value.age, null);
  for (const age of [5, 150, 18.5, 'old']) assert.equal(validateRecruitmentForm({ ...trial, age }).ok, false, String(age));
  assert.equal(validateRecruitmentForm({ ...trial, gamertag: 'x'.repeat(51) }).ok, false);
  assert.equal(validateRecruitmentForm({ ...trial, primaryPosition: '' }).ok, false);
});

test('rate limiter allows the limit per window, then refuses until the window resets', () => {
  const limiter = new FixedWindowRateLimiter(2, 1000);
  assert.equal(limiter.take('a', 0), true);
  assert.equal(limiter.take('a', 10), true);
  assert.equal(limiter.take('a', 20), false);
  assert.equal(limiter.take('b', 20), true, 'keys are independent');
  assert.equal(limiter.retryAfterSeconds('a', 20), 1);
  assert.equal(limiter.take('a', 1000), true, 'new window');
});

test('rate limiter memory is bounded', () => {
  const limiter = new FixedWindowRateLimiter(1, 60_000, 3);
  for (const key of ['a', 'b', 'c', 'd', 'e']) limiter.take(key, 0);
  assert.ok(limiter['hits'].size <= 3);
});

test('client address: proxy-appended X-Forwarded-For only behind a private proxy', () => {
  assert.equal(clientIp({ socket: { remoteAddress: '172.18.0.3' }, headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' } }), '203.0.113.9');
  assert.equal(clientIp({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: { 'x-forwarded-for': '203.0.113.9' } }), '203.0.113.9');
  assert.equal(clientIp({ socket: { remoteAddress: '198.51.100.7' }, headers: { 'x-forwarded-for': '1.2.3.4' } }), '198.51.100.7', 'spoofed header ignored');
  assert.equal(clientIp({ socket: { remoteAddress: '198.51.100.7' }, headers: {} }), '198.51.100.7');
});

const GUILD_A = '200000000000000001';
const GUILD_B = '200000000000000002';

function service({ pinned, guilds, channelFails = false } = {}) {
  const rows = [];
  const sent = [];
  const prisma = {
    guild: {
      findUnique: async ({ where }) => guilds.find((g) => g.id === where.id) || null,
      findMany: async () => guilds,
    },
    websiteSubmission: {
      create: async ({ data }) => { const row = { id: `s${rows.length + 1}`, ...data }; rows.push(row); return row; },
      update: async ({ where, data }) => Object.assign(rows.find((r) => r.id === where.id), data),
    },
  };
  const discord = {
    assertChannelInGuild: async (guildId, channelId) => {
      if (channelFails) throw new Error('Discord is down');
      return { send: async (msg) => { sent.push({ guildId, channelId, msg }); return { id: 'msg-1' }; } };
    },
  };
  return { svc: new WebsiteSubmissionsService(prisma, { ryvlGuildId: pinned }, discord), rows, sent };
}

test('submissions are stored, then posted, and the message id recorded', async () => {
  const { svc, rows, sent } = service({ guilds: [{ id: GUILD_A, defaultContactChannelId: '300000000000000001' }] });
  const result = await svc.submit('contact', contact);
  assert.deepEqual(result, { id: 's1', delivered: true });
  assert.equal(rows[0].guildId, GUILD_A);
  assert.equal(rows[0].kind, 'contact');
  assert.equal(rows[0].deliveredMessageId, 'msg-1');
  assert.deepEqual(sent[0].msg.allowedMentions, { parse: [] });
});

test('a Discord failure or missing channel keeps the stored submission', async () => {
  const down = service({ guilds: [{ id: GUILD_A, defaultContactChannelId: '300000000000000001' }], channelFails: true });
  assert.deepEqual(await down.svc.submit('contact', contact), { id: 's1', delivered: false });
  assert.equal(down.rows.length, 1);
  const unconfigured = service({ guilds: [{ id: GUILD_A }] });
  assert.deepEqual(await unconfigured.svc.submit('recruitment', validateRecruitmentForm(trial).value), { id: 's1', delivered: false });
  assert.equal(unconfigured.rows[0].guildId, GUILD_A);
});

test('RYVL_GUILD_ID pins the receiving server; otherwise the oldest configured server wins', async () => {
  const guilds = [
    { id: GUILD_A, defaultContactChannelId: null },
    { id: GUILD_B, defaultContactChannelId: '300000000000000002', defaultRecruitmentChannelId: null },
  ];
  assert.equal((await service({ guilds }).svc.resolveTargetGuild('contact')).id, GUILD_B);
  assert.equal((await service({ guilds, pinned: GUILD_A }).svc.resolveTargetGuild('contact')).id, GUILD_A);
  assert.equal(await service({ guilds, pinned: '200000000000000009' }).svc.resolveTargetGuild('contact'), null);
});

test('controller rejects invalid forms with 400 and floods with 429', async () => {
  const submitted = [];
  const controller = new WebsiteController({ submit: async (kind, value) => { submitted.push([kind, value]); return { id: 'x', delivered: true }; } });
  const req = { socket: { remoteAddress: '198.51.100.20' }, headers: {} };
  await assert.rejects(() => controller.submitContactForm({ name: 'A' }, req), (e) => e.getStatus() === 400);
  for (let i = 0; i < 3; i++) assert.equal((await controller.submitContactForm(contact, req)).success, true);
  await assert.rejects(() => controller.submitContactForm(contact, req), (e) => e.getStatus() === 429);
  assert.equal((await controller.submitContactForm(contact, { socket: { remoteAddress: '198.51.100.21' }, headers: {} })).success, true);
  assert.equal(submitted.length, 4);
});
