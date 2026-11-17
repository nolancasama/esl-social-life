// Friendship Depth Phase 1 through the real UI: behaviour styles, level
// behaviour, a soft approach, a scheduled special-day party, a present
// delivery, an introduction request, a memory follow-up, the best-friend
// milestone, no farming, and save/reload. Run: npm run e2e:friendship
import { launch, harness } from './lib.mjs';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR || '.shots/friendship';
const { browser, page } = await launch();
const H = harness(page, out);
const { log, shot, state, sleep, pump, settle, expect } = H;

// ---------------------------------------------------------------- helpers (in page)
const ev = (fn, arg) => page.evaluate(fn, arg);
const snap = () => ev(() => JSON.parse(JSON.stringify(window.__esl.friendship)));
const setLevel = (id, L) => ev(({ id, L }) => {
  const w = window.__esl.world, r = w.rel(id), XP = [0, 0, 10, 26, 46, 72];
  if (r.level < 1) w.meet(id);
  r.level = L; r.xp = Math.max(r.xp, XP[L]);
  window.__esl.hud.refresh();
}, { id, L });
const relOf = (id) => ev((id) => { const r = window.__esl.world.rel(id); return { level: r.level, xp: r.xp }; }, id);
const talk = (id) => ev((id) => { const g = window.__esl; const a = g.npcs.actorFor(id); if (!a) return false; g.player.place(a.char.root.position.x + 1.2, a.char.root.position.z + 0.6, -1.2); g.talkTo(a); return true; }, id);
const idle = () => ev(() => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard);
const time = () => ev(() => ({ day: window.__esl.world.day, period: window.__esl.world.period }));
const offer = (template, npcId, data) => ev(({ template, npcId, data }) => window.__esl.friendshipDebug.offer(template, npcId, data), { template, npcId, data });

// ---------------------------------------------------------------- start: skip the guided first day
await page.goto(base + '/?autostart=sample&name=Mika');
await page.waitForFunction(() => window.__esl && window.__esl.sceneId === 'classroom', null, { timeout: 30000 });
await sleep(2600);
await pump(async () => ev(() => window.__esl.welcomeDone === true && window.__esl.mode === 'explore'), { label: 'welcome', max: 80 });
await settle();
await ev(() => { const g = window.__esl; g.world.save.flags.fd = 'done'; for (const n of g.world.npcs) g.world.meet(n.id); g.hud.queue.length = 0; g.hud.refresh(); });
await settle();

// ---------------------------------------------------------------- A. styles: stable, varied, never shown
log('— A. behaviour styles');
const s0 = await snap();
const styleIds = Object.values(s0.styles);
expect(styleIds.length >= 11, `every classmate has a style (${styleIds.length})`);
expect(new Set(styleIds).size >= 5, `the class shows ${new Set(styleIds).size} different styles`);
const cast = await ev(() => {
  const w = window.__esl.world;
  const ids = w.npcs.map((n) => n.id).filter((id) => id !== w.save.firstFriend && id !== w.save.introNpc);
  const links = (a, b) => w.link(a, b);
  // giver + target who are friends; requester + someone they do not know.
  let giver = null, target = null, requester = null, stranger = null;
  for (const a of ids) for (const b of ids) if (!giver && a !== b && links(a, b) >= 1) { giver = a; target = b; }
  for (const a of ids) for (const b of ids) if (!requester && a !== b && ![giver, target].includes(a) && ![giver, target].includes(b) && links(a, b) === 0) { requester = a; stranger = b; }
  const rest = ids.filter((id) => ![giver, target, requester, stranger].includes(id));
  return { giver, target, requester, stranger, party: rest[0], approacher: rest[1], lv1: rest[2], lv2: rest[3], lv3: rest[4], all: w.npcs.map((n) => n.id) };
});
log('cast', cast);
await ev(() => window.__esl.menus.open('journal'));
await sleep(600);
const jtext = (await page.locator('.sheet').innerText().catch(() => '')).toLowerCase();
expect(!/outgoing|thoughtful|playful|creative|curious|considerate/.test(jtext), 'no style label in the journal');
await page.keyboard.press('Escape');
await settle();

// ---------------------------------------------------------------- B. level behaviour when you walk past
log('— B. level behaviour');
await setLevel(cast.lv2, 2);
await setLevel(cast.lv3, 3);
const passBy = async (id) => {
  await ev((id) => { const g = window.__esl; const a = g.npcs.actorFor(id); a.waved = false; a.bubble = null; g.player.place(a.char.root.position.x + 1.6, a.char.root.position.z + 1.2, -2.2); }, id);
  await sleep(900);
  return ev((id) => { const a = window.__esl.npcs.actorFor(id); return { waved: a.waved, bubble: a.bubble?.text || '' }; }, id);
};
const b1 = await passBy(cast.lv1);
const b2 = await passBy(cast.lv2);
const b3 = await passBy(cast.lv3);
log('pass-by', { b1, b2, b3 });
expect(b1.waved && b1.bubble && !b1.bubble.includes('👋'), `an acquaintance says hello: "${b1.bubble}"`);
expect(b2.waved && (b2.bubble === '' || b2.bubble === '👋'), 'a friend waves');
expect(b3.waved && b3.bubble.includes('👋') && b3.bubble.length > 2, `a good friend says hi and waves: "${b3.bubble}"`);
await shot('level-hello');

// ---------------------------------------------------------------- C. soft approach (optional, never forced)
log('— C. soft approach');
await setLevel(cast.approacher, 4);
const t0 = await time();
// Stand a few steps away on open floor (approaches need a clear walk).
const standNear = (id) => ev((id) => {
  const g = window.__esl, a = g.npcs.actorFor(id), p = a.char.root.position, col = g.scene.collision;
  // Same clear-walk test the game uses before a soft approach (npcs.js), so
  // the approach is not skipped because of where the test put the player.
  const clearWalk = (px, pz) => {
    const ang = Math.atan2(p.x - px, p.z - pz);
    const to = col.nearestFree(px + Math.sin(ang) * 1.6, pz + Math.cos(ang) * 1.6, 0.3);
    return g.npcs._walkable(p.x, p.z, to.x, to.z);
  };
  for (const [dx, dz] of [[2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6], [1.9, 1.9], [-1.9, 1.9], [1.9, -1.9], [-1.9, -1.9]]) {
    if (col.isFree(p.x + dx, p.z + dz, 0.3) && clearWalk(p.x + dx, p.z + dz)) { g.player.place(p.x + dx, p.z + dz, Math.atan2(-dx, -dz)); return true; }
  }
  const s = col.nearestFree(p.x + 2.6, p.z, 0.3);
  g.player.place(s.x, s.z, 0);
  return false;
}, id);
const nearOk = await standNear(cast.approacher);
await ev((id) => window.__esl.friendshipDebug.approach(id), cast.approacher);
await page.waitForFunction((id) => !!window.__esl.npcs.actorFor(id)?.waiting, cast.approacher, { timeout: 15000 }).catch(() => {});
const waiting = await ev((id) => { const g = window.__esl; const a = g.npcs.actorFor(id); return { waiting: !!a.waiting, marker: g.npcs.markerFor(a), bubble: a.bubble?.text || '', mode: g.mode, actorMode: a.mode, busy: !!(g.activities.search || g.activities._directions) }; }, cast.approacher);
waiting.clearSpot = nearOk;
log('approach', waiting);
expect(waiting.waiting && waiting.marker === '💬' && waiting.mode === 'explore', 'the friend came over and waits (no conversation forced)');
await shot('soft-approach');
// Walk away: the friend goes back, nothing happens.
await ev(() => { const g = window.__esl; g.player.place(g.player.x - 9, g.player.z, 0); });
await sleep(1200);
expect(!(await ev((id) => !!window.__esl.npcs.actorFor(id).waiting, cast.approacher)), 'walking away ends the approach');
// Approach again, then talk: they came with an idea; decline politely.
const xpA = (await relOf(cast.approacher)).xp;
await page.waitForFunction((id) => { const a = window.__esl.npcs.actorFor(id); return a && !a.walk && !a.engaged; }, cast.approacher, { timeout: 15000 }).catch(() => {});
await standNear(cast.approacher);
await ev((id) => window.__esl.friendshipDebug.approach(id), cast.approacher);
await page.waitForFunction((id) => !!window.__esl.npcs.actorFor(id)?.waiting, cast.approacher, { timeout: 15000 }).catch(() => {});
await talk(cast.approacher);
await pump(idle, { label: 'approach-talk', max: 80, prefer: ['Maybe next time.', 'Sorry, not today.', 'Bye! See you!'] });
await settle();
const sC = await snap();
expect((await relOf(cast.approacher)).xp >= xpA, 'declining an invitation never lowers connection');
expect(JSON.stringify(await time()) === JSON.stringify(t0), 'talking and the approach did not use time');
log('after approach: offers', sC.offers, 'history', sC.history);

// ---------------------------------------------------------------- D. delivery (a present for a mutual friend; no time)
log('— D. delivery');
await setLevel(cast.giver, 3);
const presentData = await ev(async ({ target }) => { const F = await import('/src/world/friendship.js'); return { target, present: F.presentFor(window.__esl.world.npc(target)) }; }, cast);
const delId = await offer('delivery', cast.giver, presentData);
await talk(cast.giver);
await pump(idle, { label: 'delivery-ask', max: 80, prefer: ['Sure! I can do it!', 'Bye! See you!'] });
await settle();
expect((await snap()).offers.some((o) => o.id === delId), 'the delivery is in progress');
await shot('delivery-goal');
await talk(cast.target);
await pump(idle, { label: 'delivery-give', max: 80, prefer: ['Here you are!', 'is kind!', 'Bye! See you!'] });
await settle();
const sD = await snap();
const del = await ev(({ giver, target, delId }) => {
  const w = window.__esl.world;
  const m = w.save.memories.find((x) => x.detail?.eventId === delId);
  return { done: !window.__esl.friendship.offers.some((o) => o.id === delId), link: w.link(giver, target), recall: m?.detail?.recall?.en || null, focus: m?.focus || null };
}, { ...cast, delId });
log('delivery', del);
expect(del.done && del.link >= 2, 'the present was delivered and the two friends are closer');
expect(del.recall && del.recall.includes('present'), `the giver remembers it: "${del.recall}"`);
expect(JSON.stringify(await time()) === JSON.stringify(t0), 'a favour uses no time');

// ---------------------------------------------------------------- E. meet request ("Can you introduce us?")
log('— E. meet request');
await setLevel(cast.requester, 3);
await ev((s) => window.__esl.world.learn(s, 'like:0'), cast.stranger);
const meetId = await offer('meet_request', cast.requester, { target: cast.stranger });
await talk(cast.requester);
await pump(idle, { label: 'meet', max: 100, prefer: ['Come here!', 'This is', 'is my friend.', 'likes', 'can', 'good at', 'Bye! See you!'] });
await settle();
const meet = await ev(({ requester, stranger }) => { const w = window.__esl.world; return { link: w.link(requester, stranger), known: w.npcLinkKnown(requester, stranger) }; }, cast);
expect(meet.link >= 1 && meet.known, 'the player introduced them; they are friends now and it shows on the friend map');
expect((await snap()).history.some((h) => h.id === meetId), 'the introduction is in the event history');
await shot('introduced');

// ---------------------------------------------------------------- F. special day, scheduled for after school
log('— F. special day (scheduled)');
await setLevel(cast.party, 4);
await ev((id) => window.__esl.world.learn(id, 'food'), cast.party);
const partyId = await offer('special_day', cast.party, { occasion: { kind: 'birthday', day: (await time()).day } });
const xpP0 = (await relOf(cast.party)).xp;
await talk(cast.party);
await pump(idle, { label: 'party-ask', max: 80, prefer: ['Happy birthday!', "Let's have a party at the café!", 'How about after school?', 'Bye! See you!'] });
await settle();
const planned = await ev((id) => { const w = window.__esl.world; return w.save.plans.find((p) => p.eventId === id && p.status === 'pending') || null; }, partyId);
expect(planned && planned.period === 1 && planned.loc === 'cafe', 'the party is on the calendar for after school at the café');
// After school: go to the café, meet them there.
await ev(() => { window.__advance = window.__esl.advanceTime({ reason: 'test' }); });
await page.waitForFunction(() => window.__esl.sceneId === 'town' && window.__esl.world.period === 1, null, { timeout: 30000 });
await settle();
await ev(() => window.__esl.enterScene('cafe', 'door'));
await settle();
const tF = await time();
await talk(cast.party);
const favLine = await ev((id) => { const w = window.__esl.world; const f = w.npc(id).food; return f; }, cast.party);
await pump(async () => (await state()).period === 2 && (await idle()), {
  label: 'party', max: 300,
  prefer: ["Let's go!", 'Happy birthday!', 'I want to eat', "It's for", 'Thank you!', "You're welcome! See you!", 'Pancakes, please.', 'A hamburger, please.', ', please.'],
});
await settle();
const tF2 = await time();
const party = await ev(({ id, partyId }) => {
  const w = window.__esl.world;
  const m = w.save.memories.find((x) => x.detail?.eventId === partyId);
  return { mem: m ? { type: m.type, template: m.detail.template, recall: m.detail.recall?.en, focus: m.focus } : null, souvenir: w.save.souvenirs.some((s) => s.kind === 'party' && s.npcId === id), xp: w.rel(id).xp };
}, { id: cast.party, partyId });
log('party', party, 'fav', favLine);
expect(tF2.day === tF.day && tF2.period === tF.period + 1, `the party used exactly one period (${tF.period} → ${tF2.period})`);
expect(party.mem && party.mem.template === 'special_day' && party.mem.recall, `a party memory was saved: "${party.mem?.recall}"`);
expect(party.souvenir, 'a party souvenir is on the shelf');
expect(party.xp - xpP0 >= 12, `the event gave its XP (+${party.xp - xpP0})`);
const again = await ev((id) => window.__esl.friendshipDebug.complete(id, {}), partyId);
expect(again.already === true && again.xpGained === 0, 'the same event cannot be farmed again');

// ---------------------------------------------------------------- G. next day: the friend remembers the party
log('— G. remember');
await ev(() => { window.__sleeping = window.__esl.sleep(); });
await sleep(1200);
await pump(async () => { const s = await state(); return s.day === tF.day + 1 && s.mode === 'explore'; }, { label: 'wake', max: 60, prefer: ["It's seven o'clock.", "It's", 'Good night!'] });
await settle();
const day1 = (await time()).day;
await ev(() => { const g = window.__esl; for (const a of g.npcs.actors) a.approached = false; g.npcs.approachQueue = []; });
const plansBefore = await ev(() => window.__esl.world.save.plans.filter((p) => p.status === 'pending').length);
await talk(cast.party);
let heard = '';
await pump(async () => {
  const t = await page.locator('.dlg-en').innerText().catch(() => '');
  if (/yesterday/i.test(t)) heard = t;
  return idle();
}, { label: 'remember', max: 80, prefer: ["Let's go to the café again!", 'again!', 'Bye! See you!'] });
await settle();
const plansAfter = await ev(() => window.__esl.world.save.plans.filter((p) => p.status === 'pending'));
log('heard', heard);
expect(/party|café/i.test(heard), `the friend remembers the real party: "${heard}"`);
expect(plansAfter.length > plansBefore && plansAfter.some((p) => p.npcIds.includes(cast.party)), 'remembering turned into a new plan');
await ev(() => { for (const p of window.__esl.world.save.plans) if (p.status === 'pending') p.status = 'cancelled'; });

// ---------------------------------------------------------------- H. best-friend milestone, now (after school, town)
log('— H. best friend');
await ev(() => { window.__advance = window.__esl.advanceTime({ reason: 'test' }); });
await page.waitForFunction(() => window.__esl.sceneId === 'town' && window.__esl.world.period === 1, null, { timeout: 30000 });
await settle();
// Who is out in town depends on the save id (random per run), so prefer a
// classmate the test has not used yet, then fall back to the section-B pass-by
// friends, who are not needed again.
const bf = await ev(({ used, spare }) => {
  const free = window.__esl.npcs.actors.filter((a) => !a.special && a.mode !== 'ball');
  return (free.find((a) => !used.includes(a.npc.id)) || free.find((a) => spare.includes(a.npc.id)))?.npc.id || null;
}, { used: Object.values(cast), spare: [cast.lv1, cast.lv2, cast.lv3] });
expect(!!bf, `someone is out in town to be best friends with (${bf})`);
if (bf) {
  await ev((id) => { const w = window.__esl.world; w.addMemory({ npcIds: [id], type: 'activity', act: 'soccer', detail: { score: 4 } }); w.save.memories[0].day -= 3; }, bf);
  await setLevel(bf, 5);
  const bfId = await offer('best_friend', bf, {});
  const tH = await time();
  await talk(bf);
  await pump(async () => (await state()).period === 2 && (await idle()), { label: 'bestfriend', max: 200, prefer: ["Let's go!", 'Playing soccer!', "You're my best friend, too!", 'Thank you! I love it!', 'Every day was fun!', "That's great!", 'Have fun!', 'Thank you, too!', 'Maybe next time.', 'Just us two!'] });
  await settle();
  const bfr = await ev(({ id, bfId }) => {
    const w = window.__esl.world;
    return { done: window.__esl.friendship.history.some((h) => h.id === bfId), keepsake: w.save.souvenirs.some((s) => s.kind === 'keepsake' && s.npcId === id), period: w.period };
  }, { id: bf, bfId });
  expect(bfr.done && bfr.keepsake, 'best friends: the milestone happened and a keepsake is on the shelf');
  expect(bfr.period === tH.period + 1, 'the milestone used one period');
  const elig = await ev(async (id) => { const F = await import('/src/world/friendship.js'); return F.eligibleEvents(window.__esl.world, id, { available: new Set(['best_friend']) }).eligible; }, bf);
  expect(!elig.includes('best_friend'), 'the milestone happens only once');
}
await shot('evening-after-milestone');

// ---------------------------------------------------------------- I. save and reload
log('— I. reload');
await ev(() => window.__esl.save(true));
const before = await snap();
const counts = await ev(() => ({ inst: Object.keys(window.__esl.world.save.friendship.instances).length, mem: window.__esl.world.save.memories.length }));
await page.reload();
await page.waitForSelector('.profile:not(.new)', { timeout: 30000 });
await page.locator('.profile:not(.new)').first().click();
await page.waitForFunction(() => window.__esl && window.__esl.world, null, { timeout: 30000 });
await sleep(2500);
await settle();
const after = await snap();
const counts2 = await ev(() => ({ inst: Object.keys(window.__esl.world.save.friendship.instances).length, mem: window.__esl.world.save.memories.length }));
expect(JSON.stringify(after.styles) === JSON.stringify(before.styles), 'styles are the same after reloading');
expect(after.history.length === before.history.length && counts2.inst === counts.inst && counts2.mem === counts.mem, 'no event or memory was duplicated by reloading');
expect(after.activeId === null, 'no event is stuck as active after reloading');
await ev(() => window.__esl.menus.open('journal'));
await sleep(500);
if (bf) {
  await ev((id) => { const m = window.__esl.menus; const pane = document.querySelector('.sheet-body') || m.body; if (pane) { pane.innerHTML = ''; m.friendDetail(pane, id); } }, bf);
  await sleep(500);
  const page2 = await page.locator('.sheet').innerText().catch(() => '');
  expect(/best friend/i.test(page2) && /Memories together/i.test(page2), 'the journal shows the friendship and its memory timeline');
  await shot('journal-friend');
}
await page.keyboard.press('Escape');

await browser.close();
if (H.errors.length) { console.log('\nFAILED with', H.errors.length, 'problem(s):'); for (const e of H.errors) console.log(' -', e); process.exit(1); }
console.log('\nFRIENDSHIP CHECKS PASSED');
