'use strict';
// Invoke the real start/callback controller with fake Discord/database adapters: no external writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AuthController } = require('../dist/auth/auth.controller');
const { OAUTH_STATE_COOKIE, verifyOAuthState, stateCookieOptions } = require('../dist/auth/oauth-state');
const origin = 'https://ryvl.top';
const redirectUri = 'https://ryvl.top/api/auth/discord/callback';

function setup(exchangeFails = false) {
  const auth = {
    getDiscordAuthUrl: (state) => `https://discord.com/oauth2/authorize?state=${encodeURIComponent(state)}`,
    exchangeCode: async () => {
      if (exchangeFails) throw new Error('simulated exchange error');
      return { user: { id: '999999999999900002', username: 'Fixture Staff', avatar: null }, guilds: [] };
    },
    signJwt: () => 'test-only-token',
  };
  return new AuthController(
    auth,
    { frontendUrl: origin, discordOauthRedirectUri: redirectUri },
    { guild: { findMany: async () => [] } },
  );
}

function fakeRes() {
  const res = { cookies: {}, cleared: [], redirectTo: null };
  res.cookie = (name, value, options) => { res.cookies[name] = { value, options }; };
  res.clearCookie = (name, options) => { res.cleared.push({ name, options }); };
  res.redirect = (value) => { res.redirectTo = new URL(value); };
  return res;
}

// Runs /discord/start, then returns what Discord would send back plus the cookie header.
function start(controller, query = {}, host = 'ryvl.top') {
  const res = fakeRes();
  controller.startDiscordAuth(query.origin, { headers: { host } }, res);
  const state = new URL(res.redirectTo).searchParams.get('state');
  const cookie = res.cookies[OAUTH_STATE_COOKIE];
  return { state, cookie, cookieHeader: `${OAUTH_STATE_COOKIE}=${encodeURIComponent(cookie.value)}` };
}

async function callback(controller, { code, error, state, cookieHeader }) {
  const res = fakeRes();
  await controller.handleDiscordCallback(code, error, state, { headers: { host: 'ryvl.top', cookie: cookieHeader } }, res);
  return res;
}

for (const [name, code, error, fails, target, expectedError] of [
  ['successful staff callback returns directly to dashboard', 'test-code', undefined, false, '/admin/dashboard', null],
  ['denied consent returns to the staff login, not public home', undefined, 'access_denied', false, '/admin/login', 'access_denied'],
  ['missing code returns to the staff login', undefined, undefined, false, '/admin/login', 'missing_code'],
  ['exchange error returns to the staff login', 'test-code', undefined, true, '/admin/login', 'auth_failed'],
]) {
  test(name, async () => {
    const controller = setup(fails);
    const { state, cookieHeader } = start(controller);
    const res = await callback(controller, { code, error, state, cookieHeader });
    assert.equal(res.redirectTo.origin, origin);
    assert.equal(res.redirectTo.pathname, target);
    assert.equal(res.redirectTo.searchParams.get('error'), expectedError);
    assert.equal(res.redirectTo.searchParams.get('token'), expectedError ? null : 'test-only-token');
    assert.ok(res.cleared.some((c) => c.name === OAUTH_STATE_COOKIE), 'state cookie is single-use');
  });
}

test('start sets a random HttpOnly state cookie and passes the matching nonce to Discord', () => {
  const controller = setup();
  const first = start(controller);
  const second = start(controller);
  assert.notEqual(first.state, second.state);
  assert.match(first.state, /^web\.[A-Za-z0-9_-]{16,}$/);
  assert.equal(first.state.slice(4), first.cookie.value);
  assert.equal(first.cookie.options.httpOnly, true);
  assert.equal(first.cookie.options.secure, true);
  assert.equal(first.cookie.options.sameSite, 'lax');
});

test('callback without the state cookie is rejected (login CSRF)', async () => {
  const controller = setup();
  const { state } = start(controller);
  const res = await callback(controller, { code: 'test-code', state, cookieHeader: '' });
  assert.equal(res.redirectTo.pathname, '/admin/login');
  assert.equal(res.redirectTo.searchParams.get('error'), 'invalid_state');
  assert.equal(res.redirectTo.searchParams.get('token'), null);
});

test('callback with a state from another browser is rejected', async () => {
  const controller = setup();
  const mine = start(controller);
  const attacker = start(controller);
  const res = await callback(controller, { code: 'test-code', state: attacker.state, cookieHeader: mine.cookieHeader });
  assert.equal(res.redirectTo.searchParams.get('error'), 'invalid_state');
});

test('bot console logins return to the bot subdomain and share the cookie with the callback host', async () => {
  const controller = setup();
  const { state, cookie, cookieHeader } = start(controller, { origin: 'bot' }, 'bot.ryvl.top');
  assert.match(state, /^bot\./);
  assert.equal(cookie.options.domain, 'ryvl.top');
  const res = await callback(controller, { code: 'test-code', state, cookieHeader });
  assert.equal(res.redirectTo.origin, 'https://bot.ryvl.top');
  assert.equal(res.redirectTo.pathname, '/admin/dashboard');
});

test('state verification rejects malformed values', () => {
  assert.equal(verifyOAuthState('bot', 'abc'), null);
  assert.equal(verifyOAuthState(undefined, 'abcdefghijklmnopqrstuvwx'), null);
  assert.equal(verifyOAuthState('web.abcdefghijklmnopqrstuvwx', undefined), null);
  assert.equal(verifyOAuthState('evil.abcdefghijklmnopqrstuvwx', 'abcdefghijklmnopqrstuvwx'), null);
  assert.equal(verifyOAuthState('web.abcdefghijklmnopqrstuvwx', 'abcdefghijklmnopqrstuvwx'), 'web');
  assert.equal(stateCookieOptions('http://localhost:3000/api/auth/discord/callback', 'localhost:3000').secure, false);
  assert.equal(stateCookieOptions(redirectUri, 'evilryvl.top').domain, undefined);
});
