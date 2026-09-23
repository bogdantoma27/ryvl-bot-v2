'use strict';
// Real compiled Angular pages, deterministic API fixtures, no live submissions.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_NODE_PATH || process.cwd() + '/node_modules', '@playwright/test'));
const browserDir = path.resolve(__dirname, '../dist/web/browser');
const root = fs.existsSync(path.join(browserDir, 'index.html')) ? browserDir : path.resolve(__dirname, '../dist/web');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end(); }
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, 'index.html');
  res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
  res.end(fs.readFileSync(target));
});
const record = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
const performance = { teamName: 'RYVL Esports', activeCompetition: 'Superliga-Romania', competitions: [{ id: 'one', slug: 'Superliga-Romania', name: 'Superliga Romania', season: 2, active: true }], stats: { ...record, competitionName: 'Superliga Romania', competitionSlug: 'Superliga-Romania', points: 0, winRate: 0, goalDifference: 0, goalsPerMatch: 0, concededPerMatch: 0, cleanSheets: 0, currentStreak: [], homeRecord: record, awayRecord: record, standingsPosition: null, totalTeams: 0 }, recentResults: [], upcomingFixtures: [], standings: [], warnings: [] };
const match = { matchId: 'fixture-match', timestamp: '2026-09-23T19:00:00Z', matchType: 'leagueMatch', outcome: 'WIN', trackedClub: { name: 'RYVL Esports', id: '654321', score: 2 }, opponentClub: { name: 'Fixture Opponent', id: '654322', score: 1 }, trackedPlayers: [{ gamertag: 'Fixture Player', position: 'ST', rating: 8, goals: 2, assists: 0, passesMade: 10, passAttempts: 11, tacklesMade: 1, tackleAttempts: 2 }], opponentPlayers: [] };
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const executablePath = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const failures = [], runtimeErrors = [], submissions = [];
  let passed = 0, rosterRequests = 0, clubRequests = 0;
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    const respond = options => route.fulfill({ ...options, headers: { 'access-control-allow-origin': '*' } });
    if (request.method() === 'POST') {
      assert.ok(['/api/public/contact', '/api/public/recruitment'].includes(pathname), 'Only fixture form endpoints may be called');
      submissions.push({ pathname, data: request.postDataJSON() });
      return respond({ json: { success: true } });
    }
    if (pathname === '/api/auth/me') return respond({ status: 401, json: { message: 'Sign in required' } });
    if (pathname === '/api/public/roster') { rosterRequests++; return respond({ json: [] }); }
    if (pathname === '/api/vpg/performance') return respond({ json: performance });
    if (pathname === '/api/vpg/superliga/today') return respond({ json: { fixtures: [], results: [], date: '2026-09-23', updatedAt: '2026-09-23T19:00:00Z' } });
    if (pathname === '/api/ea/default' || pathname.endsWith('/ea/config')) { clubRequests++; return respond({ json: { config: { clubId: '654321', clubName: 'RYVL Esports', platform: 'common-gen5' }, clubInfo: {}, overallStats: [{ wins: 1, losses: 0, ties: 0, goals: 2, goalsAgainst: 1 }] } }); }
    if (pathname.endsWith('/matches')) return respond({ json: [match] });
    if (pathname.endsWith('/members')) return respond({ json: { members: [] } });
    return respond({ json: { guilds: [], results: [], fixtures: [], standings: [], transfers: [] } });
  });
  async function check(name, action) {
    try { await action(); passed++; console.log('PASS ' + name); }
    catch (error) { failures.push(name); console.error('FAIL ' + name + ': ' + error.message); }
  }
  async function open(route) {
    await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('main h1')).toBeVisible();
  }
  async function metrics() {
    return page.locator('main h1').evaluate(heading => {
      const style = getComputedStyle(heading), box = heading.getBoundingClientRect();
      return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, textTransform: style.textTransform, x: box.x, y: box.y };
    });
  }
  try {
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await open('/performance'); const reference = await metrics();
      for (const route of ['/team', '/club', '/recruitment', '/about', '/contact', '/match-center']) {
        await check('consistent page header ' + route + ' at ' + width, async () => {
          await open(route);
          assert.equal(await page.locator('main app-public-page-header').count(), 1, 'Use the shared page header');
          const actual = await metrics();
          for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform']) assert.equal(actual[property], reference[property], property + ' differs from Performance');
          for (const property of ['x', 'y']) assert.ok(Math.abs(actual[property] - reference[property]) < 1, property + ' alignment differs from Performance');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Page must fit without horizontal overflow');
          assert.equal(await page.locator('main app-public-page-header .public-intro:empty').count(), 0, 'No empty subtitle');
        });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await check('roster intro is removed and refresh remains usable', async () => {
      await open('/team');
      await expect(page.getByText('Live player roster and competitive statistics pulled directly from the EA SPORTS FC 27 Pro Clubs API for RYVL Esports.', { exact: true })).toHaveCount(0);
      const before = rosterRequests;
      await page.locator('main').getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect.poll(() => rosterRequests).toBeGreaterThan(before);
    });
    await check('expanded match retains player statistics without telemetry filler', async () => {
      await open('/club');
      await page.getByRole('button', { name: 'View Squad Stats ▼', exact: true }).click();
      await expect(page.getByText('Fixture Player', { exact: true })).toBeVisible();
      await expect(page.getByText('Bucharest Telemetry', { exact: true })).toHaveCount(0);
      assert.doesNotMatch(await page.locator('main').innerText(), /telemetry|Elite 11v11|Match Shutouts|live .*API/i);
      await page.getByRole('button', { name: 'Club statistics', exact: true }).click();
      await expect(page.getByText('Win rate', { exact: true })).toBeVisible();
      assert.equal(new URL(page.url()).pathname, '/club');
      const before = clubRequests;
      await page.locator('main').getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect.poll(() => clubRequests).toBeGreaterThan(before);
    });
    await check('about has no implementation pitch or unsupported founding label', async () => {
      await open('/about');
      assert.doesNotMatch(await page.locator('main').innerText(), /Innovation & Engineering|Technology Behind RYVL|API synchronizers|Visual Identity|Founded 2024/);
      await expect(page.locator('img[src="/assets/branding/ryvl-hero-crystal.png"]')).toBeVisible();
    });
    await check('contact uses plain language and real contact destinations', async () => {
      await open('/contact');
      assert.doesNotMatch(await page.locator('main').innerText(), /Direct Lines|Transmission|Transmitting|scrims@ryvl\.gg|partners@ryvl\.gg/);
      await page.locator('input[name="name"]').fill('Fixture User');
      await page.locator('input[name="contact"]').fill('fixture_discord');
      await page.locator('textarea[name="message"]').fill('A test message intercepted in this isolated browser.');
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(page.getByText('Message Delivered!', { exact: true })).toBeVisible();
      assert.equal(submissions.at(-1).pathname, '/api/public/contact');
      assert.equal(submissions.at(-1).data.contact, 'fixture_discord');
    });
    await check('recruitment retains required fields and its submission flow', async () => {
      await open('/recruitment');
      assert.doesNotMatch(await page.locator('main').innerText(), /Dossier|high-IQ|24–48 hours/);
      await page.locator('input[name="gamertag"]').fill('Fixture Striker');
      await page.locator('input[name="discordTag"]').fill('fixture_player');
      await page.getByRole('button', { name: 'Submit application', exact: true }).click();
      await expect(page.getByText('Application Received!', { exact: true })).toBeVisible();
      assert.equal(submissions.at(-1).pathname, '/api/public/recruitment');
      assert.equal(submissions.at(-1).data.gamertag, 'Fixture Striker');
    });
    await check('match-time context and FC 27 labels remain', async () => {
      await open('/match-center');
      await expect(page.getByText('Kickoff times: Romania', { exact: true }).first()).toBeVisible();
      await open('/club');
      await expect(page.getByText('EA SPORTS FC 27 Pro Clubs', { exact: true })).toBeVisible();
    });
    assert.deepEqual(runtimeErrors, [], 'No Angular runtime errors');
    console.log(`Public header/copy checks: ${passed} passed, ${failures.length} failed.`);
    if (failures.length) throw new Error('PUBLIC_HEADER_ASSERTIONS_FAILED: ' + failures.join('; '));
  } finally { await context.close(); await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error.message); server.close(); process.exitCode = 1; });
