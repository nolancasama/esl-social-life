// Screenshot the dev scene viewer: node scripts/shots.mjs [view ...]
// Needs `npm run dev` running (BASE defaults to http://localhost:5173).
// Uses the installed Google Chrome; no browser download.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR || '.shots';
fs.mkdirSync(out, { recursive: true });
const views = process.argv.slice(2).length ? process.argv.slice(2) : ['town', 'classroom', 'cafe', 'home'];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
for (const v of views) {
  const [name, query = ''] = v.split('?');
  await page.goto(`${base}/?view=${name}${query ? '&' + query : ''}`);
  await page.waitForFunction(() => window.__viewerReady, null, { timeout: 30000 });
  await page.waitForTimeout(900);
  const file = path.join(out, `${name}${query ? '-' + query.replace(/[^a-z0-9]+/gi, '_') : ''}.png`);
  await page.screenshot({ path: file });
  console.log('saved', file);
}
await browser.close();
