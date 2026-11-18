// Friendship Depth Phase 2 through the real UI: planning group outings from
// the phone (availability, a polite decline with a real reason), a park outing
// with two friends who take turns, a café outing with three friends, group
// rewards (XP for all, closer friends, no level gate), and two classmates who
// became friends meeting up on their own and telling you about it.
// Run: npm run e2e:groups
import { launch, harness } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

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
  // Generated routines need not include an away appointment in the first
  // three composer slots. Find a real calendar window that exercises declining.
  const firstDay = w.day, period = w.period;
  for (let day = firstDay; day < firstDay + 7; day++) {
    const slots = [];
    for (let d = day; d < day + 8 && slots.length < 3; d++) for (const p of [0, 1]) { if (d === day && p <= period) continue; if (slots.length < 3 && ((p === 1) || d % 7 >= 5)) slots.push({ day: d, period: p }); }
    let busy = null, slotIdx = -1;
    for (const [i, s] of slots.entries()) { const n = w.npcs.find((x) => O.busyReason(w, x, s.day, s.period)); if (n) { busy = n.id; slotIdx = i; break; } }
    const free = w.npcs.filter((n) => n.id !== busy && slots.every((s) => !O.busyReason(w, n, s.day, s.period))).map((n) => n.id);
    if (!busy || free.length < 5) continue;
    w.save.time = { day, period }; w.ensureDaily();
    return { busy, slotIdx, slots, a: free[0], b: free[1], c: free[2], p: free[3], q: free[4] };
  }
  throw new Error('No real calendar window has a busy classmate and five free friends');
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
    await g.enterScene(['cafe', 'mall'].includes(plan.loc) ? plan.loc : 'town', ['cafe', 'mall'].includes(plan.loc) ? 'door' : 'park');
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
const introduction = await ev(async ({ p, q }) => {
  const g = window.__esl, w = g.world;
  const { npcFree } = await import('/src/world/friendship.js');
  const { DAILY_HANGOUTS, scheduleHangout } = await import('/src/world/social.js');
  const { World } = await import('/src/game/world.js');
  const { dow, isFreeTime } = await import('/src/world/time.js');
  const before = { cls: structuredClone(w.cls), save: structuredClone(w.save) };
  const pairs = w.link(p, q) === 0 ? [[p, q]] : [];
  for (const x of w.npcs) for (const y of w.npcs) {
    if (x.id < y.id && w.link(x.id, y.id) === 0 && !pairs.some((pair) => pair.includes(x.id) && pair.includes(y.id))) pairs.push([x.id, y.id]);
  }
  const attempts = [];
  for (const pair of pairs) {
    // Outings have changed the calendar since the cast was chosen. Ask the
    // actual planner on an isolated save; never insert a probe into live play.
    const probe = new World(w.cls, structuredClone(w.save));
    const proposed = scheduleHangout(probe, ...pair, { source: 'intro' });
    const candidates = [];
    for (let day = w.day + 1; day <= w.day + 4; day++) for (const period of [0, 1]) {
      const reasons = [];
      if (!isFreeTime(day, period)) reasons.push('school');
      if (w.save.npcPlans.filter((h) => h.status === 'pending' && h.day === day).length >= DAILY_HANGOUTS) reasons.push('daily cap');
      const friends = pair.map((id) => {
        const base = w.npc(id).schedule[dow(day)][period];
        const plans = w.save.plans.filter((h) => h.status === 'pending' && h.day === day && h.period === period && h.npcIds.includes(id));
        const hangouts = w.save.npcPlans.filter((h) => h.status === 'pending' && h.day === day && h.period === period && (h.a === id || h.b === id));
        if (plans.length) reasons.push(`${id}: player plan`);
        if (hangouts.length) reasons.push(`${id}: NPC hangout`);
        if (base.act.startsWith('away:')) reasons.push(`${id}: ${base.act}`);
        return { id, base, free: npcFree(w, id, day, period), plans, hangouts };
      });
      candidates.push({ day, period, reasons, friends });
    }
    attempts.push({ pair, proposed, candidates });
    if (!proposed) continue;
    w.connect(pair[0], pair[1], 1, 'intro');
    const h = w.save.npcPlans.find((x) => x.pair === [...pair].sort().join('|') && x.status === 'pending');
    return { hang: h ? { ...h } : null, day: w.day, attempts, before };
  }
  return { hang: null, reason: 'no schedulable unlinked pair', day: w.day, attempts, before };
}, cast);
fs.writeFileSync(path.join(out, 'introduction-state.json'), JSON.stringify(introduction, null, 2));
log('introduction candidates', JSON.stringify({ ...introduction, before: undefined }));
const hang = introduction.hang;
log('hangout', hang);
expect(!!hang, 'an introduction led to a planned hangout');
if (hang) {
  await goTo({ day: hang.day, period: hang.period, loc: hang.loc });
  log('hangout placement', JSON.stringify(await ev((h) => {
    const g = window.__esl, w = g.world;
    return { scene: g.sceneId, lost: w.daily.lost, lostDone: w.daily.lostDone, friends: [h.a, h.b].map((id) => {
      const a = g.npcs.actorFor(id);
      return { id, slot: w.slot(w.npc(id)), mode: a?.mode, home: a?.home, position: a ? { x: a.char.root.position.x, z: a.char.root.position.z } : null };
    }) };
  }, hang)));
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
  // Afterwards, talk when the friend is not attending another meetup. The
  // next afternoon may already belong to a different NPC hangout (also at the mall).
  const reportVisit = await ev(async (h) => {
    const w = window.__esl.world;
    const { LOCATIONS } = await import('/src/data/content.js');
    for (let day = h.day + 1; day <= h.day + 3; day++) for (const period of [0, 1]) {
      for (const id of [h.a, h.b]) {
        const slot = w.slot(w.npc(id), day, period);
        const scene = LOCATIONS[slot.loc]?.scene;
        if (scene && !slot.hangout && !w.planWith(id, day, period) && !slot.act.startsWith('away:')) return { id, day, period, loc: slot.loc, scene };
      }
    }
    return null;
  }, hang);
  expect(!!reportVisit, 'a friend has an available reporting slot within the report window');
  if (!reportVisit) throw new Error('No available friend to report the hangout');
  log('report visit', reportVisit);
  await ev(async (visit) => {
    const g = window.__esl, w = g.world;
    w.save.time = { day: visit.day, period: visit.period };
    w.ensureDaily();
    const { settleHangouts } = await import('/src/world/social.js');
    settleHangouts(w.save, w.day, w.period);
    await g.enterScene(visit.scene, visit.scene === 'town' ? 'park' : 'door');
  }, reportVisit);
  await settle();
  let report = '';
  log('before report', JSON.stringify(await ev(async (h) => {
    const w = window.__esl.world;
    const F = await import('/src/world/friendship.js');
    const S = await import('/src/world/social.js');
    return { day: w.day, hangout: S.hangoutToReport(w.save, h.a, w.day), memories: F.memoryRefs(w, h.a), open: F.openOffer(w.save, h.a) };
  }, { a: reportVisit.id })));
  await ev((id) => { const g = window.__esl; const a = g.npcs.actorFor(id); if (!a) throw new Error('Reporting friend is absent from the resolved scene'); g.talkTo(a); }, reportVisit.id);
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
