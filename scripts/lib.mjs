// Shared Playwright helpers for the e2e scripts.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export async function launch() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  return { browser, page };
}

export function harness(page, out) {
  fs.mkdirSync(out, { recursive: true });
  const errors = [];
  const log = (...a) => console.log('•', ...a);
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[console.error]', m.text()); } });
  let shotN = 0;
  const shot = async (name) => { const f = path.join(out, `${String(++shotN).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: f }); log('shot', f); };
  const state = () => page.evaluate(() => { const g = window.__esl; if (!g) return null; return { mode: g.mode, scene: g.sceneId, day: g.world.day, period: g.world.period, fd: g.world.save.flags.fd, loc: g.locationId }; });
  const sleep = (ms) => page.waitForTimeout(ms);
  async function pump(done, { max = 120, prefer = [], label = '' } = {}) {
    for (let i = 0; i < max; i++) {
      if (await done()) return true;
      const cardsVisible = await page.locator('.dlg-cards .card').first().isVisible().catch(() => false);
      const choicesShown = await page.locator('.dlg-choices').isVisible().catch(() => false);
      if (cardsVisible && choicesShown) {
        let clicked = false;
        for (const p of prefer) {
          const c = page.locator('.dlg-cards .card', { hasText: p }).first();
          if (await c.isVisible().catch(() => false)) { await c.click(); clicked = true; log(label, 'pick:', p); break; }
        }
        if (!clicked) {
          const hl = page.locator('.dlg-cards .card.hl').first();
          if (await hl.isVisible().catch(() => false)) { log(label, 'pick (✨):', (await hl.innerText()).split('\n')[0]); await hl.click(); }
          else { const c = page.locator('.dlg-cards .card').first(); log(label, 'pick:', (await c.innerText()).split('\n')[0]); await c.click(); }
        }
        await sleep(350);
        continue;
      }
      if (await page.locator('.bc-btn').isVisible().catch(() => false)) { await page.locator('.bc-btn').click(); await sleep(400); continue; }
      if (await page.locator('.act-btn').isVisible().catch(() => false)) { await page.keyboard.press('Space'); await sleep(300); continue; }
      if (await page.locator('.dlg-panel').isVisible().catch(() => false)) {
        const txt = await page.locator('.dlg-en').innerText().catch(() => '');
        if (txt) log(label, '›', txt.slice(0, 90));
        await page.keyboard.press('Space');
        await sleep(420);
        continue;
      }
      await sleep(350);
    }
    return done();
  }
  async function settle() {
    for (let i = 0; i < 60; i++) {
      if (await page.locator('.bc-btn').isVisible().catch(() => false)) {
        log('card:', (await page.locator('.bc-title').innerText().catch(() => '')).split('\n')[0]);
        await page.locator('.bc-btn').click();
        await sleep(500);
        continue;
      }
      const idle = await page.evaluate(() => { const g = window.__esl; return g && g.mode === 'explore' && !g.hud.showingCard && g.hud.queue.length === 0; });
      if (idle) { await sleep(600); if (await page.evaluate(() => { const g = window.__esl; return g.mode === 'explore' && !g.hud.showingCard && g.hud.queue.length === 0; })) return; }
      await sleep(300);
    }
  }
  function expect(cond, msg) { if (!cond) { errors.push('EXPECT: ' + msg); console.log('✗', msg); } else log('✓', msg); }
  return { errors, log, shot, state, sleep, pump, settle, expect };
}
