'use strict';
// Reflects on the compiled controllers' Nest metadata: every route under
// api/guilds/:guildId must require the guild-admin guard, except a short, reviewed list
// of public reads. Also exercises GuildAdminGuard itself with a fake Discord service.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } = require('@nestjs/common/constants');
const { RequestMethod } = require('@nestjs/common');
const { GuildAdminGuard } = require('../dist/auth/guild-admin.guard');
const { AuthGuard } = require('../dist/auth/auth.guard');

const dist = path.join(__dirname, '..', 'dist');

// Public GETs that must stay reachable without a session (public club page, <img> preview).
const PUBLIC_GUILD_READS = new Set([
  'GET /api/guilds/:guildId/ea/config',
  'GET /api/guilds/:guildId/ea/matches',
  'GET /api/guilds/:guildId/ea/members',
  'GET /api/guilds/:guildId/vpg/totw/image',
]);
// Tournament reads belong to the tournaments PR; its mutations are still checked below.
const isTournamentRead = (route) => route.startsWith('GET /api/guilds/:guildId/tournaments');

function controllerFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(full);
    return entry.name.endsWith('.controller.js') ? [full] : [];
  });
}

function join(...parts) {
  return '/' + parts.flatMap((p) => (Array.isArray(p) ? p[0] : p) || '').join('/').split('/').filter(Boolean).join('/');
}

function routes() {
  const list = [];
  for (const file of controllerFiles(dist)) {
    for (const exported of Object.values(require(file))) {
      if (typeof exported !== 'function') continue;
      const prefix = Reflect.getMetadata(PATH_METADATA, exported);
      if (prefix === undefined) continue;
      const classGuards = Reflect.getMetadata(GUARDS_METADATA, exported) || [];
      for (const name of Object.getOwnPropertyNames(exported.prototype)) {
        const handler = exported.prototype[name];
        if (typeof handler !== 'function' || name === 'constructor') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue;
        const guards = [...classGuards, ...(Reflect.getMetadata(GUARDS_METADATA, handler) || [])];
        list.push({
          route: `${RequestMethod[method]} ${join(prefix, Reflect.getMetadata(PATH_METADATA, handler))}`,
          method,
          guards,
          controller: exported.name,
        });
      }
    }
  }
  return list;
}

test('the reflection finds the guild-scoped routes', () => {
  const all = routes().filter((r) => r.route.includes('/api/guilds/:guildId'));
  assert.ok(all.length > 50, `only ${all.length} guild routes found`);
  assert.ok(all.some((r) => r.route === 'PATCH /api/guilds/:guildId/vpg/config'));
});

test('every mutation under api/guilds/:guildId requires AuthGuard and GuildAdminGuard', () => {
  const offenders = routes()
    .filter((r) => r.route.includes('/api/guilds/:guildId') && r.method !== RequestMethod.GET)
    .filter((r) => !r.guards.includes(GuildAdminGuard) || r.guards.indexOf(AuthGuard) > r.guards.indexOf(GuildAdminGuard) || !r.guards.includes(AuthGuard))
    .map((r) => `${r.controller}: ${r.route}`);
  assert.deepEqual(offenders, []);
});

test('every read under api/guilds/:guildId requires GuildAdminGuard unless reviewed as public', () => {
  const offenders = routes()
    .filter((r) => r.route.includes('/api/guilds/:guildId') && r.method === RequestMethod.GET)
    .filter((r) => !PUBLIC_GUILD_READS.has(r.route) && !isTournamentRead(r.route))
    .filter((r) => !r.guards.includes(GuildAdminGuard))
    .map((r) => `${r.controller}: ${r.route}`);
  assert.deepEqual(offenders, []);
});

test('the reviewed public reads are really unguarded GETs (list stays accurate)', () => {
  const byRoute = new Map(routes().map((r) => [r.route, r]));
  for (const route of PUBLIC_GUILD_READS) {
    assert.ok(byRoute.has(route), `${route} no longer exists`);
    assert.deepEqual(byRoute.get(route).guards, [], `${route} gained guards; drop it from the list`);
  }
});

function context(params, user = { userId: '111111111111111111' }, body = {}, query = {}) {
  return { switchToHttp: () => ({ getRequest: () => ({ params, user, body, query }) }) };
}
function guard(adminOf = []) {
  const calls = [];
  const g = new GuildAdminGuard({
    checkUserIsAdmin: async (guildId, userId) => {
      calls.push([guildId, userId]);
      return adminOf.includes(guildId);
    },
  });
  return { g, calls };
}

test('GuildAdminGuard: admins of the guild pass', async () => {
  const { g, calls } = guard(['222222222222222222']);
  assert.equal(await g.canActivate(context({ guildId: '222222222222222222' })), true);
  assert.deepEqual(calls, [['222222222222222222', '111111111111111111']]);
});

test('GuildAdminGuard: non-admins are forbidden', async () => {
  const { g } = guard([]);
  await assert.rejects(() => g.canActivate(context({ guildId: '222222222222222222' })), (e) => e.getStatus() === 403);
});

test("GuildAdminGuard: the 'default' placeholder no longer bypasses the check", async () => {
  const { g, calls } = guard(['222222222222222222']);
  await assert.rejects(() => g.canActivate(context({ guildId: 'default' })), (e) => e.getStatus() === 403);
  await assert.rejects(() => g.canActivate(context({ guildId: '../1' })), (e) => e.getStatus() === 403);
  assert.deepEqual(calls, []);
});

test('GuildAdminGuard: body/query guildId is checked when the route has none; no guild at all passes', async () => {
  const { g } = guard([]);
  await assert.rejects(() => g.canActivate(context({}, undefined, { guildId: '333333333333333333' })), (e) => e.getStatus() === 403);
  await assert.rejects(() => g.canActivate(context({}, undefined, {}, { guildId: '333333333333333333' })), (e) => e.getStatus() === 403);
  assert.equal(await g.canActivate(context({})), true);
});

test('GuildAdminGuard: no signed-in user is refused', async () => {
  const { g } = guard(['222222222222222222']);
  assert.equal(await g.canActivate(context({ guildId: '222222222222222222' }, null)), false);
});
