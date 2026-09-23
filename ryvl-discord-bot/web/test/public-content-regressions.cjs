'use strict';
// Exercise the real production build with read-only API fixtures, never live Discord data.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_NODE_PATH || process.cwd() + '/node_modules', '@playwright/test'));
const repo = path.resolve(__dirname, '../../..');
const browserDir = path.resolve(__dirname, '../dist/web/browser');
const root = fs.existsSync(path.join(browserDir, 'index.html')) ? browserDir : path.resolve(__dirname, '../dist/web');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end(); }
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, 'index.html');
  res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
  res.end(fs.readFileSync(target));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const executable = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executable ? { executablePath: executable } : {}), args: ['--no-sandbox'] });
  let passed = 0;
  const failures = [];
  async function check(name, run) {
    try { await run(); passed++; console.log('PASS ' + name); }
    catch (error) { failures.push(name); console.error('FAIL ' + name + ': ' + error.message); }
  }
  const contexts = [];
  async function fixturePage(width = 1440, behavior = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 } }); contexts.push(context);
    const page = await context.newPage();
    const requests = [];
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()); requests.push(url.pathname);
      const fulfill = options => route.fulfill({ ...options, headers: { 'access-control-allow-origin': '*' } });
      if (url.pathname === '/api/vpg/superliga/today') return fulfill({ json: { fixtures: [], results: [], date: '2026-09-23', updatedAt: '2026-09-23T19:00:00Z' } });
      if (url.pathname.endsWith('/ea/config') || url.pathname === '/api/ea/default') {
        if (behavior.configDelay) await new Promise(resolve => setTimeout(resolve, behavior.configDelay));
        if (behavior.configFailure) return fulfill({ status: 503, json: { message: 'Fixture outage' } });
        return fulfill({ json: { config: { guildId: '999999999999900001', clubName: 'RYVL Esports', clubId: '654321', platform: 'common-gen5' }, clubInfo: {}, overallStats: null } });
      }
      if (/\/(ea|default)\/matches$/.test(url.pathname)) {
        if (behavior.matchesFailure) return fulfill({ status: 503, json: { message: 'Fixture outage' } });
        return fulfill({ json: [] });
      }
      if (/\/(ea|default)\/members$/.test(url.pathname)) return fulfill({ json: { members: [] } });
      if (url.pathname === '/api/auth/me') return fulfill({ status: 401, json: { message: 'Sign in required' } });
      return fulfill({ json: { guilds: [], results: [], fixtures: [], standings: [], transfers: [] } });
    });
    return { page, requests };
  }
  try {
    await check('tracked product copy contains no old FC game edition', async () => {
      const files = execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean);
      const matches = [];
      for (const file of files) {
        if (file.includes('/test/') || file.startsWith('.github/') || file.startsWith('.maintenance/') || file.endsWith('package-lock.json')) continue;
        if (!/\.(ts|js|cjs|mjs|html|css|scss|md|json|py|ya?ml|example)$/i.test(file)) continue;
        const text = fs.readFileSync(path.join(repo, file), 'utf8');
        text.split('\n').forEach((line, i) => { if (/\b(?:fc|fifa)[\s_-]*2[56]\b/i.test(line)) matches.push(file + ':' + (i + 1) + ': ' + line.trim()); });
      }
      assert.deepEqual(matches, [], 'Old edition labels must be replaced, not only hidden on one page');
    });
    await check('Match Center has generic empty copy without the redundant VPG note', async () => {
      const { page } = await fixturePage(); await page.goto(origin + '/match-center');
      await expect(page.getByText('There are no scheduled matches today.', { exact: true })).toBeVisible();
      await expect(page.getByText('This section updates when VPG publishes new information.', { exact: true })).toHaveCount(0);
    });
    for (const width of [1024, 1200, 1280, 1440, 1920]) {
      await check('desktop Club Tracker link fits and opens the page at ' + width, async () => {
        const { page } = await fixturePage(width); await page.goto(origin + '/match-center');
        const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
        const link = nav.getByRole('link', { name: 'Club Tracker', exact: true });
        await expect(link).toBeVisible();
        await expect(page.getByRole('button', { name: 'Toggle navigation', exact: true })).toBeHidden();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Header must not overflow');
        const bounds = await page.locator('header').first().evaluate(header => {
          const nodes = [...header.querySelectorAll('a,button')].filter(node => node.getBoundingClientRect().width && node.getBoundingClientRect().height);
          return nodes.map(node => { const rect = node.getBoundingClientRect(); return { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom }; });
        });
        for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
          const a = bounds[i], b = bounds[j];
          assert.ok(!(a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1), 'Header controls overlap');
        }
        await link.click(); await expect(page).toHaveURL(/\/club$/);
        await expect(page.getByRole('heading', { name: /RYVL Club Tracker/ })).toBeVisible();
        await expect(page.getByText('EA SPORTS FC 27 Pro Clubs', { exact: true })).toBeVisible();
      });
    }
    await check('mobile Club Tracker link works and its page has no horizontal overflow', async () => {
      const { page } = await fixturePage(375); await page.goto(origin + '/match-center');
      await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
      await page.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('link', { name: 'Club Tracker', exact: true }).click();
      await expect(page).toHaveURL(/\/club$/); await expect(page.locator('#public-mobile-navigation')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: /RYVL Club Tracker/ })).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Club Tracker must fit a phone viewport');
    });
    await check('Discord club deep links use their explicit guild instead of a cached/default club', async () => {
      const { page, requests } = await fixturePage(); await page.goto(origin + '/club?guildId=999999999999900123');
      await expect.poll(() => requests).toContain('/api/guilds/999999999999900123/ea/config');
      await expect.poll(() => requests).toContain('/api/guilds/999999999999900123/ea/matches');
      await expect.poll(() => requests).toContain('/api/guilds/999999999999900123/ea/members');
    });
    await check('missing EA stats do not invent a rating or division', async () => {
      const { page } = await fixturePage(); await page.goto(origin + '/club');
      await expect(page.getByText('EA SPORTS FC 27 Pro Clubs', { exact: true })).toBeVisible();
      await expect(page.getByText('1689', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Division 1', { exact: true })).toHaveCount(0);
    });
    await check('EA configuration failure shows a retryable error rather than a false empty feed', async () => {
      const behavior = { configFailure: true }; const { page } = await fixturePage(1440, behavior);
      await page.goto(origin + '/club'); await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'No Matches Synchronized', exact: true })).toHaveCount(0);
      behavior.configFailure = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'No Matches Synchronized', exact: true })).toBeVisible();
    });
    await check('match API failures are not reported as no recorded matches', async () => {
      const { page } = await fixturePage(1440, { matchesFailure: true }); await page.goto(origin + '/club');
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'No Matches Synchronized', exact: true })).toHaveCount(0);
    });
    console.log(`Public content/Club Tracker checks: ${passed} passed, ${failures.length} failed.`);
    if (failures.length) throw new Error('CONTENT_TRACKER_ASSERTIONS_FAILED: ' + failures.join('; '));
  } finally {
    await Promise.all(contexts.map(context => context.close())); await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.message); server.close(); process.exitCode = 1; });
