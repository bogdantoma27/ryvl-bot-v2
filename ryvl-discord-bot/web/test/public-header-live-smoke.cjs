'use strict';
// Read-only live verification. Never submit forms or authenticate to Discord here.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_NODE_PATH, '@playwright/test'));
(async () => {
  const executablePath = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      try {
        const page = await context.newPage();
        let reference;
        for (const route of ['/performance', '/team', '/club', '/recruitment', '/about', '/contact', '/match-center']) {
          await page.goto('https://ryvl.top' + route, { waitUntil: 'domcontentloaded' });
          const header = page.locator('main app-public-page-header');
          await expect(header).toHaveCount(1, { timeout: 15000 });
          await expect(header.locator('h1')).toBeVisible();
          const actual = await header.locator('h1').evaluate(element => {
            const style = getComputedStyle(element);
            return { fontFamily: style.fontFamily, fontWeight: style.fontWeight, fontSize: style.fontSize, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, textTransform: style.textTransform };
          });
          if (!reference) reference = actual;
          else assert.deepEqual(actual, reference, route + ' must match Performance typography');
          assert.doesNotMatch(await page.locator('main').innerText(), /Bucharest Telemetry|Live player roster and competitive statistics pulled directly|Refresh Telemetry|Campaign Telemetry|Send Transmission|Submit Your Dossier|API synchronizers|scrims@ryvl\.gg|partners@ryvl\.gg/i);
        }
        console.log('Verified live shared headers and concise copy at ' + width + 'px; no forms submitted.');
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
