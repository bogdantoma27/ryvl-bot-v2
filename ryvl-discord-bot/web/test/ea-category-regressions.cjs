'use strict';
// Read the compiled public Club Tracker with isolated API fixtures.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_NODE_PATH, '@playwright/test'));
const browserDir = path.resolve(__dirname, '../dist/web/browser');
const root = fs.existsSync(path.join(browserDir, 'index.html')) ? browserDir : path.resolve(__dirname, '../dist/web');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end(); }
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, 'index.html');
  res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
  res.end(fs.readFileSync(target));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const executablePath = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  const cases = [['leagueMatch', 'League Match'], ['friendlyMatch', 'Friendly Match'], ['playoffMatch', 'Playoff Match'], ['practiceMatch', 'Practice Match'], ['unknown', 'Pro Clubs Match']];
  const matches = cases.map(([matchType, matchTypeLabel], i) => ({ matchId: 'category-' + i, matchType, matchTypeLabel, timestamp: '2026-09-24T16:00:00Z', outcome: 'WIN', trackedClub: { id: 'club', name: 'RYVL Esports', score: 2 }, opponentClub: { id: 'other', name: 'Fixture Opponent', score: 1 }, trackedPlayers: [], opponentPlayers: [] }));
  try {
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const respond = options => route.fulfill({ ...options, headers: { 'access-control-allow-origin': '*' } });
      if (url.pathname.endsWith('/matches')) return respond({ json: matches });
      if (url.pathname.endsWith('/members')) return respond({ json: { members: [] } });
      if (url.pathname === '/api/ea/default' || url.pathname.endsWith('/ea/config')) return respond({ json: { config: { clubId: 'club', clubName: 'RYVL Esports', platform: 'common-gen5' }, clubInfo: {}, overallStats: null } });
      if (url.pathname === '/api/auth/me') return respond({ status: 401, json: {} });
      return respond({ json: {} });
    });
    await page.goto(origin + '/club');
    for (const [, label] of cases) await expect(page.locator('main').getByText(label, { exact: true })).toHaveCount(1, { timeout: 3000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    console.log('All five API category labels displayed correctly on Club Tracker.');
  } finally { await context.close(); await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error('EA_CATEGORY_UI_ASSERTION: ' + error.message); server.close(); process.exitCode = 1; });
