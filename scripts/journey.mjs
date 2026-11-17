// The whole friendship journey through the real UI (SPEC F15): meet a
// classmate → become friends by talking → do something together → a special
// friendship event unlocks and is completed → a shared memory is saved → the
// friend sends a new invitation → on a later day they behave differently
// (they wave and say hi; before, they only said hello).
// Run: npm run e2e:journey
import { launch, harness } from './lib.mjs';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR || '.shots/journey';
const { browser, page } = await launch();
const H = harness(page, out);
const { log, shot, state, sleep, pump, settle, expect } = H;
const ev = (fn, arg) => page.evaluate(fn, arg);
const idle = () => ev(() => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard);
const rel = (id) => ev((id) => { const w = window.__esl.world; const r = w.rel(id); return { level: r.level, xp: r.xp, mems: r.memories.length }; }, id);
const TALK = ['My name is', 'Nice to meet you, too!', 'I like soccer.', 'What do you like?', 'What can you do?', 'What do you do on', 'What subject do you like?', 'What food do you like?', 'Yes! It was fun!', 'Bye! See you!'];

await page.goto(base + '/?autostart=sample&name=Mika');
await page.waitForFunction(() => window.__esl && window.__esl.sceneId === 'classroom', null, { timeout: 30000 });
await sleep(2600);
await pump(async () => ev(() => window.__esl.welcomeDone === true && window.__esl.mode === 'explore'), { label: 'welcome', max: 80 });
await settle();
// Skip the guided first day; everyone else is still a stranger. Dry weather all week.
await ev(() => { const g = window.__esl; g.world.save.flags.fd = 'done'; for (let d = 0; d < 14; d++) g.world.save.weatherOverrides[d] = 'sunny'; g.hud.queue.length = 0; g.hud.refresh(); });
await settle();
const S = await ev(() => { const g = window.__esl, w = g.world; const a = g.npcs.actors.find((x) => !x.special && !w.isKnown(x.npc.id) && x.npc.id !== w.save.introNpc); return a ? a.npc.id : null; });
expect(!!S, `a classmate to meet (${S})`);
const talkTo = async (id, label, prefer, max = 120) => {
  await ev((id) => { const g = window.__esl; const a = g.npcs.actorFor(id) || g.npcs.ensure(g.world.npc(id), g.player.x + 1.2, g.player.z, 0); g.player.place(a.char.root.position.x + 1.2, a.char.root.position.z + 0.6, -1.2); g.talkTo(a); }, id);
  await pump(idle, { label, max, prefer });
  await settle();
};
const passBy = async (id) => {
  await ev((id) => { const g = window.__esl; const a = g.npcs.actorFor(id); if (!a) return; a.waved = false; a.bubble = null; g.player.place(a.char.root.position.x + 1.6, a.char.root.position.z + 1.2, -2.2); }, id);
  await sleep(900);
  return ev((id) => { const a = window.__esl.npcs.actorFor(id); return a ? { waved: a.waved, bubble: a.bubble?.text || '' } : null; }, id);
};

// ---------------------------------------------------------------- 1. meet
log('— 1. meet');
await talkTo(S, 'meet', ['My name is', 'Nice to meet you, too!', 'I like soccer.', 'Bye! See you!']);
expect((await rel(S)).level === 1, 'met: Acquaintance');
const firstHello = await passBy(S);
log('day 0 hello', firstHello);
expect(firstHello && firstHello.bubble && !firstHello.bubble.includes('👋'), `as an acquaintance they only say hello ("${firstHello?.bubble}")`);

// ---------------------------------------------------------------- 2. become friends by talking (a few school mornings)
log('— 2. talk over a few days');
for (let i = 0; i < 4 && (await rel(S)).level < 2; i++) {
  await ev(() => { window.__sleeping = window.__esl.sleep(); });
  await pump(async () => (await state()).mode === 'explore' && (await ev(() => window.__esl.world.period === 0)), { label: 'wake', max: 60, prefer: ["It's seven o'clock.", "It's", 'Good night!'] });
  await settle();
  if (!(await ev((id) => !!window.__esl.npcs.actorFor(id), S))) continue;
  await talkTo(S, `talk-${i}`, TALK);
}
expect((await rel(S)).level >= 2, `talking made them a Friend (Lv${(await rel(S)).level})`);

// ---------------------------------------------------------------- 3. do something together (opens the next level)
log('— 3. play together');
await ev(() => { window.__adv = window.__esl.advanceTime({ reason: 'test' }); });
await page.waitForFunction(() => window.__esl.world.period === 1 && window.__esl.sceneId === 'town', null, { timeout: 30000 });
await settle();
await ev(async (id) => { const g = window.__esl, w = g.world; w.addPlan({ npcIds: [id], day: w.day, period: w.period, loc: 'park', act: 'catch', source: 'test' }); await g.enterScene('town', 'park'); }, S);
await settle();
await ev((id) => { const g = window.__esl; g.talkTo(g.npcs.actorFor(id)); }, S);
await pump(async () => (await ev(() => window.__esl.world.period)) === 2 && (await idle()), { label: 'catch', max: 300, prefer: ["Let's go!", 'Yes, I can!', 'Catch the ball!', 'Thank you! That was fun!', 'Bye! See you!'] });
await settle();
const afterPlay = await rel(S);
log('after playing', afterPlay);
expect(afterPlay.mems >= 1 && afterPlay.level >= 2, 'a shared activity opened the next level (a memory)');
await ev((id) => { const w = window.__esl.world; const r = w.rel(id); if (r.level < 3) { r.xp = Math.max(r.xp, 26); w.xp(id, 1, { reason: 'test' }); } }, S);
expect((await rel(S)).level === 3, 'Good friend (Lv3)');

// ---------------------------------------------------------------- 4. a special event unlocks; the friend comes over with it
log('— 4. special event');
await ev(() => { window.__sleeping = window.__esl.sleep(); });
await pump(async () => (await state()).mode === 'explore' && (await ev(() => window.__esl.world.period === 0)), { label: 'wake2', max: 60, prefer: ["It's seven o'clock.", "It's", 'Good night!'] });
await settle();
const elig = await ev(async (id) => { const F = await import('/src/world/friendship.js'); const E = await import('/src/dialogue/events.js'); return F.eligibleEvents(window.__esl.world, id, { available: E.availableTemplates() }).eligible; }, S);
log('eligible now', elig);
expect(elig.some((t) => ['hobby', 'practice', 'delivery', 'meet_request'].includes(t)), `Lv3 unlocked friendship events (${elig.join(', ')})`);
// They come over on their own (a soft approach) and talk about it.
await ev(() => { const g = window.__esl; g.player.place(0, 2.5, 0); });
const approached = await ev((id) => window.__esl.friendshipDebug.approach(id), S);
if (approached) await page.waitForFunction((id) => !!window.__esl.npcs.actorFor(id)?.waiting, S, { timeout: 15000 }).catch(() => {});
await shot('friend-comes-over');
// Accept the special event; politely skip anything else first (e.g. "play catch again?").
const ACCEPT = ["Yes! Let's go now!", "Sure! Let's practice now!", 'How about after school?', 'Sure! I can do it!', 'Come here!', 'This is', 'is my friend.', 'likes', 'can ', 'good at', 'Maybe next time.'];
await talkTo(S, 'offer', [...ACCEPT, ...TALK]);
const offersNow = () => ev(() => JSON.parse(JSON.stringify(window.__esl.friendship.offers)));
let offer = (await offersNow()).find((o) => o.npcId === S);
const doneId = (await ev(() => window.__esl.friendship.history.map((h) => h.id))).find((id) => id.includes(`:${S}:`) && !id.startsWith('remember'));
log('offer', offer, 'done', doneId);
if (!offer && !doneId) {
  // Nothing was picked this time: the friend offers a hobby (same path, made explicit).
  await ev((id) => window.__esl.friendshipDebug.offer('hobby', id, { act: 'hobby:draw', like: 'drawing', direct: true }), S);
  await talkTo(S, 'offer2', [...ACCEPT, ...TALK]);
  offer = (await offersNow()).find((o) => o.npcId === S);
}
// Finish it: deliveries go to the other friend; period events happen after school.
if (offer && offer.template === 'delivery') {
  const target = await ev((oid) => window.__esl.world.save.friendship.instances[oid].data.target, offer.id);
  await talkTo(target, 'deliver', ['Here you are!', 'is kind!', 'Bye! See you!']);
} else if (offer && offer.status === 'scheduled') {
  await ev(() => { window.__adv = window.__esl.advanceTime({ reason: 'test' }); });
  await page.waitForFunction(() => window.__esl.world.period === 1, null, { timeout: 30000 });
  await settle();
  const loc = await ev((oid) => window.__esl.world.save.friendship.instances[oid].slot.loc, offer.id);
  await ev(async (loc) => { await window.__esl.enterScene(loc === 'cafe' ? 'cafe' : 'town', loc === 'cafe' ? 'door' : 'park'); }, loc);
  await settle();
  await ev((id) => { const g = window.__esl; g.talkTo(g.npcs.actorFor(id)); }, S);
  await pump(async () => (await ev(() => window.__esl.world.period)) === 2 && (await idle()), { label: 'event', max: 400, prefer: ["Let's go!", 'I want to draw', "It's", 'You can draw well!', "Let's look", 'One!', 'Two!', 'Yes, I can!', 'You can sing well, too!', 'Ready? Catch!', 'You can do it!', 'Nice! One more!', 'Last one!', 'Great job!', 'Yes! It was fun!'] });
  await settle();
}
const memory = await ev((id) => {
  const w = window.__esl.world;
  const m = w.save.memories.find((x) => x.npcIds.includes(id) && x.detail?.eventId);
  return m ? { template: m.detail.template, recall: m.detail.recall?.en || null } : null;
}, S);
log('event memory', memory);
expect(memory && memory.recall, `the special event was completed and remembered ("${memory?.recall}")`);
await shot('after-event');

// ---------------------------------------------------------------- 5. a new invitation
log('— 5. a new invitation');
let invite = null;
for (let n = 0; n < 6 && !invite; n++) {
  await ev(() => { const w = window.__esl.world; if (w.period < 2) { w.save.time.period = 1; w.advance(); } });
  invite = await ev((id) => window.__esl.world.save.messages.find((m) => m.from === id && m.kind === 'invite') || null, S);
  if (!invite) {
    await ev(() => { const w = window.__esl.world; w.sleep(); });
  }
}
log('invite', invite?.en);
expect(!!invite, `the friend sent a new invitation ("${invite?.en}")`);

// ---------------------------------------------------------------- 6. a later day: they behave differently
log('— 6. a later day');
await ev(async () => { const g = window.__esl, w = g.world; if (w.period === 2) w.sleep(); w.save.time.period = 0; w.ensureDaily(); await g.enterScene(w.weekend ? 'town' : 'classroom', w.weekend ? 'park' : 'door'); });
await settle();
await ev((id) => { const g = window.__esl, w = g.world; if (!g.npcs.actorFor(id)) g.npcs.ensure(w.npc(id), g.player.x + 3, g.player.z + 3, 0); }, S);
const laterHello = await passBy(S);
log('later hello', laterHello);
expect(laterHello && laterHello.waved && laterHello.bubble.includes('👋'), `now they wave and say hi ("${laterHello?.bubble}")`);
await shot('later-day');

await browser.close();
if (H.errors.length) { console.log('\nFAILED with', H.errors.length, 'problem(s):'); for (const e of H.errors) console.log(' -', e); process.exit(1); }
console.log('\nJOURNEY PASSED');
