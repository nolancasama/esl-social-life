// Friendship Depth Phase 2 through the real UI: planning group outings from
// the phone (availability, a polite decline with a real reason), a park outing
// with two friends who take turns, a café outing with three friends, group
// rewards (XP for all, closer friends, no level gate), and two classmates who
// became friends meeting up on their own and telling you about it.
// Run: npm run e2e:groups
import { launch, harness } from './lib.mjs';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR || '.shots/groups';
const { browser, page } = await launch();
const H = harness(page, out);
const { log, shot, state, sleep, pump, settle, expect } = H;
const ev = (fn, arg) => page.evaluate(fn, arg);
const idle = () => ev(() => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard);

await page.goto(base + '/?autostart=sample&name=Mika');
await page.waitForFunction(() => window.__esl && window.__esl.sceneId === 'classroom', null, { timeout: 30000 });
await sleep(2600);
await pump(async () => ev(() => window.__esl.welcomeDone === true && window.__esl.mode === 'explore'), { label: 'welcome', max: 80 });
await settle();
await ev(() => { const g = window.__esl; g.world.save.flags.fd = 'done'; for (const n of g.world.npcs) g.world.meet(n.id); for (let d = 0; d < 10; d++) g.world.save.weatherOverrides[d] = 'sunny'; g.hud.queue.length = 0; g.hud.refresh(); });
await settle();

// ---------------------------------------------------------------- cast: someone away at an upcoming slot, and friends who are free
const cast = await ev(async () => {
  const g = window.__esl, w = g.world;
  const O = await import('/src/dialogue/outing.js');
  // The composer offers the next three free slots after now.
  const slots = [];
  for (let d = w.day; d < w.day + 8 && slots.length < 3; d++) for (const p of [0, 1]) { if (d === w.day && p <= w.period) continue; if (slots.length < 3 && ((p === 1) || d % 7 >= 5)) slots.push({ day: d, period: p }); }
  let busy = null, slotIdx = -1;
  for (const [i, s] of slots.entries()) { const n = w.npcs.find((x) => O.busyReason(w, x, s.day, s.period)); if (n) { busy = n.id; slotIdx = i; break; } }
  const free = w.npcs.filter((n) => n.id !== busy && slots.every((s) => !O.busyReason(w, n, s.day, s.period))).map((n) => n.id);
  return { busy, slotIdx, slots, a: free[0], b: free[1], c: free[2], p: free[3], q: free[4] };
});
log('cast', cast);
expect(cast.busy && cast.a && cast.b && cast.c, 'found a classmate who is busy at an upcoming slot, and three who are free');
const XP = [0, 0, 10, 26, 46, 72];
await ev(({ ids }) => { const w = window.__esl.world; for (const id of ids) { const r = w.rel(id); r.level = 2; r.xp = 40; } }, { ids: [cast.busy, cast.a, cast.b, cast.c].filter(Boolean) });

const slotWord = await ev(async ({ slot }) => { const C = await import('/src/dialogue/common.js'); return C.slotWords(window.__esl.world, slot).en; }, { slot: cast.slots[cast.slotIdx] });
const names = await ev((ids) => Object.fromEntries(ids.map((id) => [id, window.__esl.world.npc(id).name])), [cast.busy, cast.a, cast.b, cast.c, cast.p, cast.q].filter(Boolean));

async function compose({ where, what, when, invite }) {
  await ev(() => window.__esl.menus.open('phone'));
  await sleep(500);
  await page.locator('.plan-btn').click();
  const heard = [];
  await pump(async () => {
    const t = await page.locator('.dlg-en').innerText().catch(() => '');
    if (t && !heard.includes(t)) heard.push(t);
    return idle();
  }, { label: 'compose', max: 80, prefer: [where, what, when, ...invite.map((id) => `${names[id]}, do you want to come?`), "That's all!"] });
  await settle();
  return heard;
}

// ---------------------------------------------------------------- A. plan a park outing; one friend is busy
log('— A. plan from the phone (someone is busy)');
const heardA = await compose({ where: "Let's go to the park!", what: 'I want to play soccer.', when: `How about ${slotWord}?`, invite: [cast.busy, cast.a, cast.b] });
log('replies', heardA);
expect(heardA.some((t) => /^Sorry, (I have|I go|I'm going)/.test(t)), `a busy friend says why, politely: "${heardA.find((t) => /^Sorry/.test(t))}"`);
const planA = await ev(({ a, b, busy }) => window.__esl.world.save.plans.find((p) => p.status === 'pending' && p.npcIds.includes(a) && p.npcIds.includes(b) && !p.npcIds.includes(busy)) || null, cast);
expect(planA && planA.npcIds.length === 2 && planA.act === 'soccer' && planA.loc === 'park', 'a group plan with the two free friends');

// ---------------------------------------------------------------- B. plan a café outing with three friends
log('— B. plan a café outing with three');
const otherWhen = await ev(async ({ slots, idx }) => { const C = await import('/src/dialogue/common.js'); const s = slots.find((_, i) => i !== idx); return C.slotWords(window.__esl.world, s).en; }, { slots: cast.slots, idx: cast.slotIdx });
await ev(({ c }) => { const w = window.__esl.world; const r = w.rel(c); r.level = 2; r.xp = 40; }, cast);
await compose({ where: "Let's go to the café!", what: 'x', when: `How about ${otherWhen}?`, invite: [cast.a, cast.b, cast.c] });
const planB = await ev(({ a, b, c }) => window.__esl.world.save.plans.find((p) => p.status === 'pending' && p.act === 'cafe' && [a, b, c].every((id) => p.npcIds.includes(id))) || null, cast);
expect(planB && planB.npcIds.length === 3, 'a café plan with three friends');

// ---------------------------------------------------------------- C. the park outing: everyone takes turns
async function goTo(plan) {
  await ev(async (plan) => {
    const g = window.__esl, w = g.world;
    w.save.time = { day: plan.day, period: plan.period };
    w.ensureDaily();
    await g.enterScene(plan.loc === 'cafe' ? 'cafe' : 'town', plan.loc === 'cafe' ? 'door' : 'park');
  }, plan);
  await settle();
}
log('— C. park outing with two friends');
await goTo(planA);
const beforeA = await ev(({ a, b }) => { const w = window.__esl.world; return { xa: w.rel(a).xp, xb: w.rel(b).xp, la: w.level(a), link: w.link(a, b), period: w.period, mems: w.save.memories.length }; }, cast);
await ev((id) => { const g = window.__esl; g.talkTo(g.npcs.actorFor(id)); }, cast.a);
let turnsSeen = new Set();
let shotTaken = false;
await pump(async () => {
  const who = await ev(() => { const g = window.__esl; const c = document.querySelector('.act-call b'); return c ? c.textContent : null; });
  if (who) turnsSeen.add(who);
  if (!shotTaken && await page.locator('.act-btn').isVisible().catch(() => false)) { shotTaken = true; await shot('park-group'); }
  return (await state()).period === beforeA.period + 1 && (await idle());
}, { label: 'park', max: 400, prefer: ["Let's go!", 'Thank you! That was fun!'] });
await settle();
const afterA = await ev(({ a, b }) => {
  const w = window.__esl.world;
  const m = w.save.memories.find((x) => x.npcIds.includes(a) && x.npcIds.includes(b) && x.type === 'activity');
  return { xa: w.rel(a).xp, xb: w.rel(b).xp, la: w.level(a), link: w.link(a, b), period: w.period, focus: m?.focus ?? null, npcIds: m?.npcIds || [] };
}, cast);
log('park', { beforeA, afterA, turnsSeen: [...turnsSeen] });
expect(afterA.period === beforeA.period + 1, 'the group outing used one period');
expect(afterA.npcIds.length === 2 && Array.isArray(afterA.focus) && afterA.focus.length === 0, 'one shared memory for both friends (no level focus)');
expect(afterA.xa > beforeA.xa && afterA.xb > beforeA.xb, `both friends got connection (+${afterA.xa - beforeA.xa}, +${afterA.xb - beforeA.xb})`);
expect(afterA.la === 2, 'group time alone does not open the next level');
expect(afterA.link >= 2, 'the two friends are closer now');
expect(turnsSeen.size >= 2, `both friends took turns (${[...turnsSeen].join(', ')})`);

// ---------------------------------------------------------------- D. the café outing with three friends
log('— D. café outing with three friends');
await goTo(planB);
const seats = await ev((ids) => ids.map((id) => { const a = window.__esl.npcs.actorFor(id); return a ? `${a.char.root.position.x.toFixed(1)},${a.char.root.position.z.toFixed(1)}` : null; }), [cast.a, cast.b, cast.c]);
expect(seats.every(Boolean) && new Set(seats).size === 3, `three friends wait at three different seats (${seats.join(' | ')})`);
await shot('cafe-group-arrive');
const beforeB = await ev(() => window.__esl.world.period);
await ev((id) => { const g = window.__esl; g.talkTo(g.npcs.actorFor(id)); }, cast.b);
let cafeShot = false;
await pump(async () => {
  const t = await page.locator('.dlg-en').innerText().catch(() => '');
  if (!cafeShot && /Everyone is here/.test(t)) { cafeShot = true; await sleep(300); await shot('cafe-group'); }
  return (await state()).period === beforeB + 1 && (await idle());
}, { label: 'cafe', max: 400, prefer: ["Let's go!", 'I want to eat', ', please.', 'Thank you!', "Yes, I do! It's delicious!", 'Thank you! See you!'] });
await settle();
const memB = await ev(({ a, b, c }) => { const w = window.__esl.world; const m = w.save.memories.find((x) => x.act === 'cafe' && [a, b, c].every((id) => x.npcIds.includes(id))); return m ? { n: m.npcIds.length, focus: m.focus } : null; }, cast);
expect(memB && memB.n === 3, 'the café outing remembered all three friends');

// ---------------------------------------------------------------- E. classmates who became friends meet up on their own
log('— E. NPC–NPC hangout');
const hang = await ev(({ p, q }) => {
  const g = window.__esl, w = g.world;
  let pair = [p, q];
  if (w.link(p, q) > 0) pair = (() => { for (const x of w.npcs) for (const y of w.npcs) if (x.id < y.id && w.link(x.id, y.id) === 0) return [x.id, y.id]; return null; })();
  if (!pair) return null;
  w.connect(pair[0], pair[1], 1, 'intro');
  const h = w.save.npcPlans.find((x) => x.pair === [...pair].sort().join('|') && x.status === 'pending');
  return h ? { ...h } : null;
}, cast);
log('hangout', hang);
expect(!!hang, 'an introduction led to a planned hangout');
if (hang) {
  await goTo({ day: hang.day, period: hang.period, loc: hang.loc });
  const together = await ev((h) => {
    const g = window.__esl;
    const A = g.npcs.actorFor(h.a), B = g.npcs.actorFor(h.b);
    if (!A || !B) return null;
    return Math.hypot(A.char.root.position.x - B.char.root.position.x, A.char.root.position.z - B.char.root.position.z);
  }, hang);
  log('distance between them', together);
  expect(together !== null && together < 6, 'the two friends are out together');
  if (together !== null) {
    await ev((h) => { const g = window.__esl; const A = g.npcs.actorFor(h.a); g.player.place(A.char.root.position.x + 2.2, A.char.root.position.z + 2.2, -2.3); }, hang);
    await sleep(800);
    await shot('hangout-together');
  }
  // Next day: one of them tells you about it.
  await ev(async (h) => {
    const g = window.__esl, w = g.world;
    w.save.time = { day: h.day + 1, period: 1 };
    w.ensureDaily();
    const { settleHangouts } = await import('/src/world/social.js');
    settleHangouts(w.save, w.day, w.period);
    await g.enterScene('town', 'park');
  }, hang);
  await settle();
  let report = '';
  await ev((h) => { const g = window.__esl; const w = g.world; const a = g.npcs.ensure(w.npc(h.a), g.player.x + 1.2, g.player.z, 0); g.talkTo(a); }, hang);
  await pump(async () => {
    const t = await page.locator('.dlg-en').innerText().catch(() => '');
    if (/with .*(yesterday|on |today)/.test(t) && !report) report = t;
    return idle();
  }, { label: 'report', max: 80, prefer: ['Can I come next time?', 'Bye! See you!'] });
  await settle();
  log('report', report);
  expect(/Thank you for introducing us/.test(report), `they tell you about it: "${report}"`);
  const plan3 = await ev((h) => window.__esl.world.save.plans.find((p) => p.status === 'pending' && p.npcIds.includes(h.a) && p.npcIds.includes(h.b)) || null, hang);
  expect(!!plan3, 'asking to come next time made a group plan with both');
}

await browser.close();
if (H.errors.length) { console.log('\nFAILED with', H.errors.length, 'problem(s):'); for (const e of H.errors) console.log(' -', e); process.exit(1); }
console.log('\nGROUP CHECKS PASSED');
