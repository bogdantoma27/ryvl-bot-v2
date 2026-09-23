'use strict';
// Invoke the real callback controller with fake Discord/database adapters: no external writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AuthController } = require('../dist/auth/auth.controller');
const origin = 'https://ryvl.top';
function setup(exchangeFails = false) {
  const auth = {
    exchangeCode: async () => {
      if (exchangeFails) throw new Error('simulated exchange error');
      return { user: { id: '999999999999900002', username: 'Fixture Staff', avatar: null }, guilds: [] };
    },
    signJwt: () => 'test-only-token',
  };
  return new AuthController(auth, { frontendUrl: origin }, { guild: { findMany: async () => [] } });
}
for (const [name, code, error, fails, target, expectedError] of [
  ['successful staff callback returns directly to dashboard', 'test-code', undefined, false, '/admin/dashboard', null],
  ['denied consent returns to the staff login, not public home', undefined, 'access_denied', false, '/admin/login', 'access_denied'],
  ['missing code returns to the staff login', undefined, undefined, false, '/admin/login', 'missing_code'],
  ['exchange error returns to the staff login', 'test-code', undefined, true, '/admin/login', 'auth_failed'],
]) {
  test(name, async () => {
    let redirect;
    await setup(fails).handleDiscordCallback(code, error, { redirect: value => { redirect = new URL(value); } });
    assert.equal(redirect.origin, origin);
    assert.equal(redirect.pathname, target);
    assert.equal(redirect.searchParams.get('error'), expectedError);
    assert.equal(redirect.searchParams.get('token'), expectedError ? null : 'test-only-token');
  });
}
