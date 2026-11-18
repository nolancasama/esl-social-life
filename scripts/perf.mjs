// Performance proxy (headless Chrome + SwiftShader — NOT a Chromebook GPU
// measurement): draw calls and average frame time per scene. Draw calls are
// the useful number here (they track GPU cost on real hardware); frame time
// in software rendering is only a relative signal. Fails if draw calls go
// over the budgets below (baseline 2026-11-11: town ≈40, classroom ≈120).
// Run: npm run e2e:perf
import { launch, harness } from './lib.mjs';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR || '.shots/perf';
const { browser, page } = await launch();
const H = harness(page, out);
const { log, sleep, pump, settle, expect } = H;
const BUDGET = { classroom: 150, town: 70, cafe: 90, mall: 90, home: 60, friendhouse: 90 };

await page.goto(base + '/?autostart=sample&name=Mika');
await page.waitForFunction(() => window.__esl && window.__esl.sceneId === 'classroom', null, { timeout: 30000 });
await sleep(2600);
await pump(async () => page.evaluate(() => window.__esl.welcomeDone === true && window.__esl.mode === 'explore'), { label: 'welcome', max: 80 });
await settle();
await page.evaluate(() => { const g = window.__esl; g.world.save.flags.fd = 'done'; for (const n of g.world.npcs) g.world.meet(n.id); g.hud.queue.length = 0; });

const rows = [];
for (const [scene, spawn, period] of [['classroom', 'door', 0], ['town', 'park', 1], ['cafe', 'door', 1], ['mall', 'door', 1], ['home', 'door', 1], ['friendhouse', 'door', 1]]) {
  await page.evaluate(async ({ scene, spawn, period }) => { const g = window.__esl; g.world.save.time.period = period; await g.enterScene(scene, spawn); }, { scene, spawn, period });
  await settle();
  await sleep(1500);
  const m = await page.evaluate(() => new Promise((resolve) => {
    const g = window.__esl;
    const times = [];
    let last = performance.now();
    let calls = 0, tris = 0;
    const tick = (t) => {
      times.push(t - last); last = t;
      const info = g.renderer.renderer.info.render;
      calls = Math.max(calls, info.calls); tris = Math.max(tris, info.triangles);
      if (times.length < 90) requestAnimationFrame(tick);
      else resolve({ calls, tris, ms: times.slice(10).reduce((a, b) => a + b, 0) / (times.length - 10), actors: g.npcs.actors.length });
    };
    requestAnimationFrame(tick);
  }));
  // The scene without its characters (static cost; comparable across runs and branches).
  const staticCalls = await page.evaluate(() => new Promise((resolve) => {
    const g = window.__esl;
    const shown = g.npcs.actors.filter((a) => a.char.root.visible);
    for (const a of shown) a.char.root.visible = false;
    g.player.char.root.visible = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const calls = g.renderer.renderer.info.render.calls;
      for (const a of shown) a.char.root.visible = true;
      g.player.char.root.visible = true;
      resolve(calls);
    }));
  }));
  rows.push({ scene, ...m, staticCalls });
  log(`${scene.padEnd(9)} draw calls ${String(m.calls).padStart(4)} (static ${String(staticCalls).padStart(3)}) · triangles ${String(m.tris).padStart(7)} · ${m.ms.toFixed(1)} ms/frame (software) · ${m.actors} characters`);
  expect(m.calls <= BUDGET[scene], `${scene}: draw calls ${m.calls} within budget ${BUDGET[scene]}`);
}

await browser.close();
if (H.errors.length) { console.log('\nFAILED with', H.errors.length, 'problem(s):'); for (const e of H.errors) console.log(' -', e); process.exit(1); }
console.log('\nPERF CHECK PASSED');
