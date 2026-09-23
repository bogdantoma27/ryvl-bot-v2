'use strict';
// Exercise the compiled application, not a simplified CSS mock. No live APIs or Discord writes.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_NODE_PATH || process.cwd() + '/node_modules', '@playwright/test'));
const browserDir = path.resolve(__dirname, '../dist/web/browser');
const root = fs.existsSync(path.join(browserDir, 'index.html')) ? browserDir : path.resolve(__dirname, '../dist/web');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, 'index.html');
  res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
  res.end(fs.readFileSync(target));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const executablePath = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--disable-features=OverlayScrollbar'] });
  const failures = [];
  let passed = 0;
  async function check(name, run) {
    try { await run(); passed++; console.log('PASS ' + name); }
    catch (error) { failures.push(name); console.error('FAIL ' + name + ': ' + error.message); }
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    await page.goto(origin + '/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible();
    for (const width of [1024, 1200, 1280, 1440, 1920]) {
      await check('desktop navigation without menu at ' + width, async () => {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByRole('button', { name: 'Toggle navigation', exact: true })).toBeHidden({ timeout: 1500 });
        await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toBeVisible();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Header must fit without horizontal overflow');
        const nav = await page.getByRole('navigation', { name: 'Main navigation', exact: true }).boundingBox();
        const button = await page.locator('header a[href="https://discord.gg/nEvvHvqZQX"]').first().boundingBox();
        assert.ok(nav && button && nav.x + nav.width <= button.x + 1, 'Navigation must not overlap the Discord button');
      });
    }
    await check('mobile menu and resize lifecycle', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      const toggle = page.getByRole('button', { name: 'Toggle navigation', exact: true });
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.locator('#public-mobile-navigation')).toBeVisible();
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(toggle).toBeHidden({ timeout: 1500 });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#public-mobile-navigation')).toHaveCount(0);
    });
    await check('global scrollbar gutter prevents width and centering shifts', async () => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(origin + '/privacy');
      const gutter = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter);
      assert.match(gutter, /stable/, 'The root scroll container must reserve its gutter');
      const positions = await page.evaluate(async () => {
        const main = document.querySelector('main');
        document.querySelector('footer').style.display = 'none';
        document.querySelector('.public-site').style.minHeight = '0';
        main.style.flex = 'none';
        main.innerHTML = '<div class="public-page" id="gutter-probe" style="height:80px">Layout probe</div>';
        const probe = document.getElementById('gutter-probe');
        const snapshot = () => ({ x: probe.getBoundingClientRect().x, width: probe.getBoundingClientRect().width, headerX: document.querySelector('header > div').getBoundingClientRect().x });
        await new Promise(requestAnimationFrame);
        const short = snapshot();
        probe.style.height = '3000px';
        await new Promise(requestAnimationFrame);
        return { short, long: snapshot() };
      });
      for (const key of ['x', 'width', 'headerX']) assert.ok(Math.abs(positions.short[key] - positions.long[key]) < 1, key + ' shifted');
      await page.goto(origin + '/privacy');
    });
    await check('RYVL favicon and legacy ICO are real image assets', async () => {
      await page.goto(origin + '/privacy');
      const icon = page.locator('link[rel="icon"][type="image/png"]').first();
      await expect(icon).toHaveAttribute('href', /ryvl-favicon-32\.png/);
      const dimensions = await page.evaluate(async () => {
        const link = document.querySelector('link[rel="icon"][type="image/png"]');
        const bitmap = await createImageBitmap(await (await fetch(link.href)).blob());
        return [bitmap.width, bitmap.height];
      });
      assert.deepEqual(dimensions, [32, 32]);
      const response = await context.request.get(origin + '/favicon.ico');
      const body = await response.body();
      assert.equal(body.readUInt16LE(0), 0); assert.equal(body.readUInt16LE(2), 1);
      assert.equal(body.readUInt16LE(4), 3, 'ICO contains 16, 32 and 48px variants');
    });
    await check('recognizable local social logos keep accessible link names', async () => {
      for (const brand of ['discord', 'twitch', 'youtube']) {
        const link = page.locator('footer a').filter({ has: page.locator('img[src="/assets/brands/' + brand + '.svg"]') });
        await expect(link).toHaveCount(1);
        await expect(link.locator('img')).toHaveAttribute('alt', '');
        assert.ok(await link.locator('img').evaluate(img => img.complete && img.naturalWidth > 0));
        assert.match(await link.innerText(), new RegExp(brand, 'i'));
      }
    });
    await check('visitor privacy is plain language with truthful staff-only details', async () => {
      await page.goto(origin + '/privacy');
      const text = await page.locator('main').innerText();
      assert.doesNotMatch(text, /Oracle Cloud|PostgreSQL|ryvl_token/);
      await expect(page.getByText('Public browsing does not require an account.', { exact: true })).toBeVisible();
      const staff = page.locator('details');
      await expect(staff).toHaveCount(1);
      await staff.locator('summary').click();
      await expect(staff).toContainText('Discord');
      await expect(staff).toContainText('staff');
      await page.goto(origin + '/terms');
      await expect(page.getByRole('heading', { name: 'Terms of Service', exact: true })).toBeVisible();
    });
    await check('EA match loading says only Loading...', async () => {
      const loadingPage = await context.newPage();
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      await loadingPage.route('**/api/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname.includes('matches')) { await gate; return route.fulfill({ json: [] }).catch(() => {}); }
        if (pathname.includes('config')) return route.fulfill({ json: { config: { clubId: '128199', clubName: 'RYVL Esports' }, clubInfo: {}, overallStats: {} } });
        return route.fulfill({ json: {} });
      });
      try {
        await loadingPage.goto(origin + '/club');
        await expect(loadingPage.getByText('Loading...', { exact: true }).first()).toBeVisible({ timeout: 2500 });
        await expect(loadingPage.getByText(/Synchronizing.*EA/)).toHaveCount(0);
      } finally { release(); await loadingPage.close(); }
    });
    await context.close();
    console.log(`UI review regression checks: ${passed} passed, ${failures.length} failed.`);
    if (failures.length) throw new Error('UI_REVIEW_ASSERTIONS_FAILED: ' + failures.join('; '));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error.message); server.close(); process.exitCode = 1; });
