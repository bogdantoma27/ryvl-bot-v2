// Read-only checks from a GitHub runner: no Discord messages or database writes.
import assert from 'node:assert/strict';
const origin = 'https://ryvl.top';
const expectedRevision = process.env.EXPECTED_REVISION;
assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0', 'TLS validation must remain enabled');
async function request(url, options = {}) {
  return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), ...options });
}
for (const source of ['http://ryvl.top', 'http://www.ryvl.top', 'https://www.ryvl.top']) {
  const response = await request(source + '/club?guildId=123');
  assert.equal(response.status, 308, 'Expected canonical redirect from ' + source);
  assert.equal(response.headers.get('location'), origin + '/club?guildId=123');
}
for (const path of ['/', '/performance', '/match-center', '/privacy', '/terms', '/admin/dashboard']) {
  const response = await request(origin + path);
  assert.equal(response.status, 200, 'Page failed: ' + path);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.match(await response.text(), /<app-root/);
}
const health = await request(origin + '/api/health');
assert.equal(health.status, 200);
assert.match(health.headers.get('content-type') || '', /application\/json/);
assert.equal((await health.json()).status, 'ok');
const revision = await request(origin + '/release.json');
assert.equal(revision.status, 200);
const deployedRevision = (await revision.json()).revision;
assert.match(deployedRevision, /^[a-f0-9]{40}$/);
if (expectedRevision) assert.equal(deployedRevision, expectedRevision, 'The published version is not the expected release');
const login = await request(origin + '/api/auth/discord/start');
assert.equal(login.status, 302);
const destination = new URL(login.headers.get('location'));
assert.equal(destination.hostname, 'discord.com');
assert.equal(destination.searchParams.get('redirect_uri'), origin + '/api/auth/discord/callback');
// Do not log the full OAuth URL: it may contain a state value.
const allowed = await request(origin + '/api/health', { headers: { Origin: origin } });
assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
const denied = await request(origin + '/api/health', { headers: { Origin: 'https://unrelated.example' } });
assert.equal(denied.headers.get('access-control-allow-origin'), null);
console.log('Verified trusted HTTPS, canonical redirects, public pages, API, OAuth callback, CORS and release ' + deployedRevision);
