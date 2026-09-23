'use strict';
// Exercise the compiled Angular router and shell with isolated session/API fixtures.
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
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const executablePath = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
  const failures = [];
  let passed = 0;
  const guild = { id: '999999999999900001', name: 'Test Guild', iconUrl: null };
  async function check(name, run, options = {}) {
    const context = await browser.newContext({ viewport: options.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
    try {
      if (options.token) await context.addInitScript(token => {
        localStorage.setItem('ryvl_token', token);
        sessionStorage.setItem('ryvl_token', token);
      }, options.token);
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      page.on('pageerror', error => errors.push(error.message));
      const state = { status: options.status || 200, delay: options.delay || 0 };
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        requests.push(url.pathname);
        if (url.pathname === '/api/auth/discord/start') return route.fulfill({ contentType: 'text/html', body: '<h1>OAuth start reached</h1>' });
        if (url.pathname === '/api/auth/me') {
          const status = state.status;
          if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
          return route.fulfill(status === 200 ? { json: { authenticated: true, user: { id: '999999999999900002', username: 'Test Staff' } } } : { status, json: { message: status === 401 ? 'Unauthorized' : 'Unavailable' } });
        }
        if (url.pathname === '/api/guilds') return route.fulfill({ json: [guild] });
        if (url.pathname.endsWith('/bootstrap')) return route.fulfill({ json: { ...guild, channels: [], roles: [], members: [], settings: {} } });
        if (url.pathname.endsWith('/events')) return route.fulfill({ json: [] });
        return route.fulfill({ json: { results: [], fixtures: [], standings: [], transfers: [] } });
      });
      await run({ page, context, state, requests });
      assert.deepEqual(errors, [], 'No Angular runtime exceptions');
      passed++;
      console.log('PASS ' + name);
    } catch (error) {
      failures.push(name);
      console.error('FAIL ' + name + ': ' + error.message);
    } finally { await context.close(); }
  }
  const login = async page => {
    await expect(page).toHaveURL(/\/admin\/login(?:\?|$)/, { timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'RYVL ADMIN CONSOLE', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login with Discord', exact: true })).toBeVisible();
    await expect(page.locator('app-dashboard')).toHaveCount(0);
  };
  const dashboard = async page => {
    await expect(page).toHaveURL(/\/admin\/dashboard(?:\?|$)/);
    await expect(page.getByRole('heading', { name: 'Welcome to Test Guild', exact: true })).toBeVisible({ timeout: 8000 });
  };
  try {
    await check('desktop Admin link opens staff sign-in, not home', async ({ page, requests }) => {
      await page.goto(origin + '/privacy');
      await page.locator('header').getByRole('link', { name: 'Admin', exact: true }).click();
      await login(page);
      assert.ok(!requests.some(url => url.startsWith('/api/guilds')), 'Guests must not load protected workspace data');
      await page.getByRole('button', { name: 'Login with Discord', exact: true }).click();
      await expect(page).toHaveURL(origin + '/api/auth/discord/start');
    });
    await check('footer staff link opens the same sign-in page', async ({ page }) => {
      await page.goto(origin + '/privacy');
      await page.getByRole('link', { name: 'Staff login', exact: true }).click();
      await login(page);
    });
    await check('mobile Admin link opens staff sign-in', async ({ page }) => {
      await page.goto(origin + '/privacy');
      await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
      await page.locator('#public-mobile-navigation').getByRole('link', { name: 'Admin', exact: true }).click();
      await login(page);
    }, { mobile: true });
    for (const target of ['/admin', '/admin/dashboard', '/admin/settings']) {
      await check('signed-out direct link ' + target + ' survives refresh', async ({ page }) => {
        await page.goto(origin + target);
        await login(page);
        await page.reload();
        await login(page);
      });
    }
    await check('expired session redirects to sign-in and removes the expired token', async ({ page }) => {
      await page.goto(origin + '/admin/dashboard');
      await login(page);
      assert.equal(await page.evaluate(() => localStorage.getItem('ryvl_token')), null);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('ryvl_token')), null);
    }, { token: 'expired-fixture-token', status: 401 });
    await check('authenticated staff can open the dashboard', async ({ page }) => {
      await page.goto(origin + '/admin/dashboard');
      await dashboard(page);
    }, { token: 'valid-fixture-token' });
    await check('OAuth return consumes the token and opens the dashboard', async ({ page }) => {
      await page.goto(origin + '/admin/dashboard?token=oauth-fixture-token');
      await dashboard(page);
      assert.equal(await page.evaluate(() => localStorage.getItem('ryvl_token')), 'oauth-fixture-token');
      assert.equal(new URL(page.url()).searchParams.has('token'), false);
    }, { delay: 300 });
    await check('session discovered after public startup also updates the admin shell', async ({ page }) => {
      await page.goto(origin + '/privacy');
      await expect(page.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible();
      await page.evaluate(() => localStorage.setItem('ryvl_token', 'new-fixture-token'));
      await page.locator('header').getByRole('link', { name: 'Admin', exact: true }).click();
      await dashboard(page);
    });
    await check('temporary auth outage is recoverable without silently erasing the session', async ({ page, state }) => {
      await page.goto(origin + '/admin/dashboard');
      await login(page);
      await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
      assert.equal(await page.evaluate(() => localStorage.getItem('ryvl_token')), 'retry-fixture-token');
      state.status = 200;
      await page.getByRole('link', { name: 'Try again', exact: true }).click();
      await dashboard(page);
    }, { token: 'retry-fixture-token', status: 503 });
    await check('cancelled Discord login has a visible retryable error', async ({ page }) => {
      await page.goto(origin + '/admin/login?error=access_denied');
      await login(page);
      await expect(page.getByRole('alert')).toContainText('cancelled');
      await page.getByRole('link', { name: /Return to RYVL/ }).click();
      await expect(page).toHaveURL(origin + '/');
    });
    console.log(`Admin access checks: ${passed} passed, ${failures.length} failed.`);
    if (failures.length) throw new Error('ADMIN_ACCESS_ASSERTIONS_FAILED: ' + failures.join('; '));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error.message); server.close(); process.exitCode = 1; });
