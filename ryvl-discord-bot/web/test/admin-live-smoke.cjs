'use strict';
// Read-only post-deploy browser checks against the real HTTPS website.
// No test identities, session tokens, Discord authorization or form submissions.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_NODE_PATH, '@playwright/test'));
(async () => {
  const executablePath = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
  const origin = 'https://ryvl.top';
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
      try {
        const page = await context.newPage();
        await page.goto(origin + '/privacy', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible({ timeout: 15000 });
        // The public Club Tracker must be reachable from the actual toolbar,
        // independently of whether EA's upstream happens to be available today.
        if (mobile) await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
        const nav = page.getByRole('navigation', { name: mobile ? 'Mobile navigation' : 'Main navigation', exact: true });
        await nav.getByRole('link', { name: 'Club Tracker', exact: true }).click();
        await expect(page).toHaveURL(origin + '/club');
        await expect(page.getByRole('heading', { name: /RYVL Club Tracker/ })).toBeVisible();
        await expect(page.getByText('EA SPORTS FC 27 Pro Clubs', { exact: true })).toBeVisible();
        await expect(page.getByText(/EA SPORTS FC 2[56]/i)).toHaveCount(0);
        console.log('Verified live ' + (mobile ? 'mobile' : 'desktop') + ' Club Tracker navigation and FC 27 branding.');
        // Preserve the admin regression check after using the new public link.
        if (mobile) {
          await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
          await page.locator('#public-mobile-navigation').getByRole('link', { name: 'Admin', exact: true }).click();
        } else {
          await page.locator('header').getByRole('link', { name: 'Admin', exact: true }).click();
        }
        await expect(page).toHaveURL(origin + '/admin/login');
        await expect(page.getByRole('heading', { name: 'RYVL ADMIN CONSOLE', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Login with Discord', exact: true })).toBeVisible();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'Login with Discord', exact: true })).toBeVisible();
        await expect(page.locator('app-dashboard')).toHaveCount(0);
        console.log('Verified live ' + (mobile ? 'mobile' : 'desktop') + ' Admin click and sign-in refresh.');
      } finally { await context.close(); }
    }
    const response = await fetch(origin + '/api/auth/me', { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 401, 'Signed-out requests must remain unauthorized');
    const cancelled = await fetch(origin + '/api/auth/discord/callback?error=access_denied', { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    assert.equal(cancelled.status, 302);
    assert.equal(cancelled.headers.get('location'), origin + '/admin/login?error=access_denied');
    console.log('Verified staff API still requires authentication and cancelled OAuth returns to login.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
