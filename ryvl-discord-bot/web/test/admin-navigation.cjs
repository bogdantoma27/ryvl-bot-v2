'use strict';
// Admin console structure: five tabbed sections, old URLs redirecting to their tab,
// dashboard health cards and the Channels tab, against the compiled app with API fixtures.
// Never authorize against Discord or write to the live application/database.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_NODE_PATH || process.cwd() + '/node_modules', '@playwright/test'));
const browserDir = path.resolve(__dirname, '../dist/web/browser');
const root = fs.existsSync(path.join(browserDir, 'index.html')) ? browserDir : path.resolve(__dirname, '../dist/web');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const requested = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (requested !== root && !requested.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  const file = fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(root, 'index.html');
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

const GUILD_ID = '999999999999900001';
const channels = [{ id: '111111111111111111', name: 'general' }, { id: '222222222222222222', name: 'results' }];
const off = { status: 'off', reason: 'Not set up' };
const health = {
  generatedAt: '2026-10-06T12:00:00Z',
  eaTracker: { status: 'error', reason: '2 match posts gave up after 5 attempts', configured: true, enabled: true, clubId: '128199', clubName: 'Test FC', channelId: '222222222222222222', lastPolledAt: '2026-10-06T11:59:00Z', pollIntervalSec: 90, pendingPosts: 0, failedPosts: 2 },
  trackedClubs: { status: 'ok', reason: '2 clubs tracked', total: 2, enabled: 2, clubs: [
    { clubId: '128199', clubName: 'Test FC', platform: 'common-gen5', enabled: true, channelId: '222222222222222222', lastPolledAt: null },
    { clubId: '5', clubName: 'Rival FC', platform: 'common-gen5', enabled: true, channelId: null, lastPolledAt: null },
  ] },
  vpgTransfers: { status: 'warning', reason: 'Last checked 45 min ago', configured: true, enabled: true, channelId: '111111111111111111', lastPolledAt: '2026-10-06T11:15:00Z', pollIntervalSec: 120 },
  vpgNotifications: { ...off, configured: false, lastPolledAt: null, lastSuccessAt: null, lastError: null, retryAfter: null, pollIntervalSec: null },
  superligaMvp: { status: 'ok', reason: '3 linked, 0 pending', season: 7, counts: { LINKED: 3 }, lastAttemptAt: null, lastError: null },
  totw: { ...off, configs: [] },
  events: { status: 'ok', reason: 'Next: Scrim', nextOccurrence: { eventId: 'e1', title: 'Scrim', startsAt: '2026-10-07T18:00:00Z' }, stuckClaims: 0, overdue: 0 },
};
const settings = { guildId: GUILD_ID, timezone: 'Europe/Bucharest', defaultChannelId: '111111111111111111', defaultLiveResultsChannelId: null, ryvlTeamName: 'RYVL Esports', botStatus: 'online' };

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const executablePath = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
  const failures = [];
  let passed = 0;
  async function check(name, run, options = {}) {
    const context = await browser.newContext({ viewport: options.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
    try {
      await context.addInitScript(() => localStorage.setItem('ryvl_token', 'valid-fixture-token'));
      const page = await context.newPage();
      const errors = [];
      const writes = [];
      page.on('pageerror', error => errors.push(error.message));
      const guild = { id: GUILD_ID, name: options.guildName || 'Test Guild', iconUrl: null };
      await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const json = body => route.fulfill({ json: body });
        if (request.method() !== 'GET') {
          writes.push({ method: request.method(), path: url.pathname, query: url.search, body: request.postDataJSON() });
          return json({ success: true });
        }
        if (url.pathname === '/api/auth/me') return json({ authenticated: true, user: { id: '999999999999900002', username: 'Test Staff' } });
        if (url.pathname === '/api/guilds') return json([guild]);
        if (url.pathname.endsWith('/bootstrap')) return json({ ...guild, channels, roles: [], members: [], settings: { timezone: 'Europe/Bucharest', defaultChannelId: null, botActive: true } });
        if (url.pathname.endsWith('/health')) return json(health);
        if (url.pathname.endsWith('/settings')) return json(settings);
        if (url.pathname.endsWith('/events')) return json([]);
        if (url.pathname.endsWith('/website-submissions')) return json([]);
        return json({ results: [], fixtures: [], standings: [], transfers: [] });
      });
      await run({ page, writes });
      assert.deepEqual(errors, [], 'No Angular runtime exceptions');
      passed++;
      console.log('PASS ' + name);
    } catch (error) {
      failures.push(name);
      console.error('FAIL ' + name + ': ' + error.message);
    } finally { await context.close(); }
  }
  const sidebar = page => page.getByRole('navigation', { name: 'Admin sections', exact: true });
  const tab = (page, name) => page.getByRole('tab', { name, exact: true });
  try {
    await check('sidebar has the five sections and Bot Docs', async ({ page }) => {
      await page.goto(origin + '/admin/dashboard');
      const nav = sidebar(page);
      for (const name of ['Overview', 'Club', 'Superliga', 'Community', 'Server']) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible({ timeout: 8000 });
      await expect(nav.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('link', { name: 'Bot Docs', exact: true })).toHaveAttribute('href', '/docs');
      await expect(nav.getByText('Official RYVL Esports')).toHaveCount(0);
    });
    await check('dashboard shows a health card per feed with status and a link to its tab', async ({ page }) => {
      await page.goto(origin + '/admin/dashboard');
      await expect(page.getByRole('heading', { name: 'Bot health', exact: true })).toBeVisible({ timeout: 8000 });
      const ea = page.locator('[data-health="eaTracker"]');
      await expect(ea).toContainText('Error');
      await expect(ea).toContainText('2 match posts gave up');
      await expect(page.locator('[data-health="vpgTransfers"]')).toContainText('Warning');
      await expect(page.locator('[data-health="events"]')).toContainText('Next: Scrim');
      await expect(page.locator('[data-health="vpgNotifications"]')).toHaveCount(0);
      await page.locator('[data-health="totw"]').getByRole('link').click();
      await expect(page).toHaveURL(/\/admin\/superliga\?tab=awards&view=totw$/);
      await expect(tab(page, 'Awards')).toHaveAttribute('aria-selected', 'true');
      await expect(sidebar(page).getByRole('link', { name: 'Superliga', exact: true })).toHaveAttribute('aria-current', 'page');
    });
    const redirects = [
      ['/admin/events', /\/admin\/community\?tab=events$/, 'Events'],
      ['/admin/tournaments', /\/admin\/community\?tab=tournaments$/, 'Tournaments'],
      ['/admin/lineup?draftId=abc', /\/admin\/club\?draftId=abc&tab=lineup$/, 'Lineup'],
      ['/admin/lineup/drafts', /\/admin\/club\?tab=drafts$/, 'Lineup drafts'],
      ['/admin/club', /\/admin\/club$/, 'EA Tracker'],
      ['/admin/transfers', /\/admin\/superliga\?tab=transfers$/, 'Transfers'],
      ['/admin/superliga-awards?tab=totw', /\/admin\/superliga\?tab=awards&view=totw$/, 'Awards'],
      ['/admin/totw', /\/admin\/superliga\?tab=awards&view=totw$/, 'Awards'],
      ['/admin/superliga-mvp', /\/admin\/superliga\?tab=awards&view=mvp$/, 'Awards'],
      ['/admin/settings', /\/admin\/server\?tab=general$/, 'General'],
      // RYVL-only tab on another server: falls back to the section's first tab.
      ['/admin/performance', /\/admin\/club\?tab=performance$/, 'EA Tracker'],
      ['/events', /\/admin\/community\?tab=events$/, 'Events'],
      ['/totw', /\/admin\/superliga\?tab=awards&view=totw$/, 'Awards'],
      ['/settings', /\/admin\/server\?tab=general$/, 'General'],
    ];
    await check('old admin URLs open the matching section tab', async ({ page }) => {
      for (const [from, to, selected] of redirects) {
        await page.goto(origin + from);
        await expect(page, from).toHaveURL(to, { timeout: 8000 });
        await expect(tab(page, selected), from).toHaveAttribute('aria-selected', 'true');
      }
      await page.goto(origin + '/admin/totw');
      await expect(page.getByRole('tab', { name: '⭐ Team of the Week' })).toHaveAttribute('aria-selected', 'true');
      await page.goto(origin + '/admin/events/new');
      await expect(sidebar(page).getByRole('link', { name: 'Community', exact: true })).toHaveAttribute('aria-current', 'page');
    });
    await check('RYVL-only tabs are hidden on other servers and shown on RYVL', async ({ page }) => {
      await page.goto(origin + '/admin/club');
      await expect(tab(page, 'EA Tracker')).toBeVisible({ timeout: 8000 });
      await expect(tab(page, 'Performance')).toHaveCount(0);
      await page.goto(origin + '/admin/superliga');
      await expect(tab(page, 'Transfers')).toHaveAttribute('aria-selected', 'true');
      await expect(tab(page, 'Notifications')).toHaveCount(0);
    });
    await check('RYVL server shows Performance and Notifications tabs', async ({ page }) => {
      await page.goto(origin + '/admin/superliga');
      await expect(tab(page, 'Notifications')).toHaveAttribute('aria-selected', 'true', { timeout: 8000 });
      await expect(page.getByRole('heading', { name: 'VPG automatic posting', exact: true })).toBeVisible();
      await tab(page, 'Transfers').click();
      await expect(page).toHaveURL(/\/admin\/superliga\?tab=transfers$/);
      await page.goto(origin + '/admin/club?tab=performance');
      await expect(tab(page, 'Performance')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('heading', { name: 'VPG automatic posting', exact: true })).toHaveCount(0);
      await expect(sidebar(page).getByText('Official RYVL Esports')).toBeVisible();
    }, { guildName: 'RYVL Esports' });
    await check('server tabs: general, channels and website forms', async ({ page }) => {
      await page.goto(origin + '/admin/server');
      await expect(page.getByRole('heading', { name: 'General Settings', exact: true })).toBeVisible({ timeout: 8000 });
      await expect(page.getByLabel('Default Timezone')).toBeVisible();
      await tab(page, 'Website forms').click();
      await expect(page).toHaveURL(/\/admin\/server\?tab=forms$/);
      await expect(page.getByRole('heading', { name: 'Website Forms', exact: true })).toBeVisible();
      await expect(page.getByText('No website submissions yet.', { exact: true })).toBeVisible();
    });
    await check('channels tab lists every topic and saves through each endpoint', async ({ page, writes }) => {
      await page.goto(origin + '/admin/server?tab=channels');
      await expect(page.getByRole('heading', { name: 'Channels', exact: true })).toBeVisible({ timeout: 8000 });
      for (const topic of ['Events', 'Lineups', 'Results', 'Transfers', 'Team of the Week', 'EA tracker: Test FC', 'Tracked club: Rival FC', 'Contact messages', 'Trial applications']) {
        await expect(page.getByRole('rowheader', { name: new RegExp('^' + topic) })).toBeVisible();
      }
      // The main club is not listed twice; RYVL-only rows are hidden here.
      await expect(page.getByRole('rowheader', { name: /^Tracked club: Test FC/ })).toHaveCount(0);
      await expect(page.getByRole('rowheader', { name: /^RYVL results/ })).toHaveCount(0);
      await expect(page.getByLabel('Events channel', { exact: true })).toHaveValue('111111111111111111');
      await page.getByLabel('Results channel', { exact: true }).selectOption('222222222222222222');
      await page.getByLabel('Transfers channel', { exact: true }).selectOption('');
      await page.getByLabel('EA tracker: Test FC channel', { exact: true }).selectOption('111111111111111111');
      await page.getByLabel('Tracked club: Rival FC channel', { exact: true }).selectOption('222222222222222222');
      await page.getByLabel('Team of the Week channel', { exact: true }).selectOption('111111111111111111');
      await expect.poll(() => writes.length).toBe(5);
      assert.deepEqual(writes.map(w => [w.method, w.path.replace('/api/guilds/' + GUILD_ID, ''), w.body]), [
        ['PATCH', '/settings', { defaultLiveResultsChannelId: '222222222222222222' }],
        ['PATCH', '/vpg/config', { channelId: null }],
        ['PATCH', '/ea/config', { channelId: '111111111111111111' }],
        ['PATCH', '/ea/tracked-clubs/5', { channelId: '222222222222222222' }],
        ['PATCH', '/vpg/totw/config', { channelId: '111111111111111111' }],
      ]);
      assert.equal(writes[4].query, '?leagueSlug=Superliga-Romania');
      await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
    });
    await check('community tabs: events list and tournaments; create stays a page', async ({ page }) => {
      await page.goto(origin + '/admin/community');
      await expect(page.getByRole('heading', { name: 'Guild Events', exact: true })).toBeVisible({ timeout: 8000 });
      await page.getByRole('link', { name: 'Create Event', exact: true }).first().click();
      await expect(page).toHaveURL(/\/admin\/events\/new$/);
      await page.goto(origin + '/admin/community?tab=tournaments');
      await expect(tab(page, 'Tournaments')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('app-admin-tournaments')).toBeAttached();
    });
    await check('mobile: section tabs fit and the sidebar opens', async ({ page }) => {
      await page.goto(origin + '/admin/club?tab=drafts');
      await expect(page.getByRole('heading', { name: 'Saved Lineup Drafts' })).toBeVisible({ timeout: 8000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'No horizontal page overflow');
      await page.getByRole('button', { name: 'Toggle menu', exact: true }).click();
      await sidebar(page).getByRole('link', { name: 'Server', exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/server$/);
      await expect(page.getByRole('heading', { name: 'General Settings', exact: true })).toBeVisible();
    }, { mobile: true });
    console.log(`Admin navigation checks: ${passed} passed, ${failures.length} failed.`);
    if (failures.length) throw new Error('ADMIN_NAVIGATION_ASSERTIONS_FAILED: ' + failures.join('; '));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error.message); server.close(); process.exitCode = 1; });
