// Receive a close friend's invitation, walk along the residential lane, and
// play the visit through its real cards. Debug hooks only arrange late-game
// friendship/time and the invitation; the door and visit use normal actions.
import os from 'node:os';
import path from 'node:path';
import { launch, harness } from './lib.mjs';

const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.SHOTS_DIR || path.join(os.tmpdir(), 'esl-friendhouse-2026-11-19');
const repo = path.resolve(import.meta.dirname, '..');
if (!path.relative(repo, path.resolve(out)).startsWith('..') && !path.isAbsolute(path.relative(repo, path.resolve(out)))) throw new Error('SHOTS_DIR must be outside the repository.');
const { browser, page } = await launch();
const H = harness(page, out);
const { log, shot, sleep, pump, settle, expect } = H;
const ev = (fn, arg) => page.evaluate(fn, arg);
const idle = () => ev(() => window.__esl.mode === 'explore' && !window.__esl.hud.showingCard);

async function walk(x, z) {
  const before = await ev(() => ({ x: window.__esl.player.x, z: window.__esl.player.z }));
  await ev(({ x, z }) => { window.__esl.player.walkTo(x, z); }, { x, z });
  await page.waitForFunction(({ x, z }) => Math.hypot(window.__esl.player.x - x, window.__esl.player.z - z) < 0.35, { x, z }, { timeout: 20000 });
  expect(Math.hypot(before.x - x, before.z - z) > 0.7, 'the pavement route requires actual walking');
  await sleep(650);
}

async function use(id) {
  const nearby = await ev((id) => { const g = window.__esl, it = g.scene.interact.find((i) => i.id === id); return !!it && Math.hypot(g.player.x - it.x, g.player.z - it.z) <= it.r + 0.2; }, id);
  expect(nearby, `${id} is within walking distance`);
  expect(await ev((id) => window.__esl.target?.it?.id === id, id), `the normal action targets ${id}`);
  const action = page.locator('.action');
  await action.waitFor({ state: 'visible', timeout: 5000 });
  await action.click();
}

async function enterHouse() {
  await use('friendHouse');
  await page.locator('.dlg-banner').waitFor({ state: 'visible', timeout: 5000 });
  expect(/It uses your Morning time/.test(await page.locator('.dlg-banner').innerText()) && await page.locator('.dlg-banner small').count() === 1, 'the door shows the one-period cost and Japanese hint before starting');
  expect(await pump(() => ev(() => window.__esl.sceneId === 'friendhouse'), { label: 'enter', max: 30, prefer: ["Let's go!"] }), 'the town door opens the friend-house interior');
}

async function reloadProfile() {
  await page.reload();
  await page.waitForSelector('.profile:not(.new)', { timeout: 30000 });
  await page.locator('.profile:not(.new)').first().click();
  await page.waitForFunction(() => window.__esl?.world, null, { timeout: 30000 });
  await sleep(2500);
  await settle();
}

try {
  await page.goto(base + '/?autostart=sample&name=Mika');
  await page.waitForFunction(() => window.__esl?.sceneId === 'classroom', null, { timeout: 30000 });
  await sleep(2600);
  expect(await pump(() => ev(() => window.__esl.welcomeDone && window.__esl.mode === 'explore'), { label: 'welcome', max: 80 }), 'welcome finished');
  await settle();
  const friend = await ev(async () => {
    const g = window.__esl, w = g.world;
    const { houseFor } = await import('/src/world/friendhouse.js');
    const { busyReason } = await import('/src/dialogue/outing.js');
    w.save.flags.fd = 'done';
    w.save.time = { day: 5, period: 0 }; w.ensureDaily();
    for (let d = 5; d < 20; d++) w.save.weatherOverrides[d] = 'sunny';
    const choices = w.npcs.filter((n) => n.pet && !busyReason(w, n, 5, 0));
    const n = choices.find((n) => ['race', 'photos'].includes(houseFor(w.cls.seed, n).activity)) || choices[0];
    if (!n) throw new Error('Sample class has no available friend with a generated pet.');
    w.meet(n.id); w.rel(n.id).level = 4; w.rel(n.id).xp = 50;
    // Isolate event XP from the existing +2 award for learning a new fact.
    // A close friend may already have told the player about this pet.
    w.learn(n.id, 'pet');
    w.markTalked(n.id);
    g.hud.queue.length = 0;
    await g.enterScene('town', 'homeDoor');
    const inst = g.friendshipDebug.offer('friend_house', n.id, {});
    const existing = g.npcs.actorFor(n.id);
    if (existing) g.npcs.removeActor(existing);
    const a = g.npcs.ensure(n, g.player.x + 1.1, g.player.z, 0);
    return { id: n.id, name: n.name, pet: n.pet, activity: houseFor(w.cls.seed, n).activity, instanceId: inst, actor: !!a };
  });
  log('host', friend);
  await settle();
  await useTalk(friend.id);
  const heard = [];
  expect(await pump(async () => {
    const en = await page.locator('.dlg-en').textContent().catch(() => '');
    if (en && !heard.includes(en)) heard.push(en);
    return idle();
  }, { label: 'invitation', max: 100, prefer: ["Yes! Let's go now!", "Let's go now!", "Let's go!", 'Yes, please.', 'See you there!', 'Bye! See you!'] }), 'invitation ends with a choice');
  expect(heard.some((s) => /Do you want to come to my house\?/.test(s)), 'the host invites the player to their house');
  await settle();
  const planned = await ev((id) => { const g = window.__esl, i = g.world.save.friendship.instances[id]; return { status: i.status, accepted: !!i.data.accepted, slot: i.slot, scene: g.sceneId, day: g.world.day, period: g.world.period }; }, friend.instanceId);
  expect(planned.scene === 'town' && (planned.accepted || planned.status === 'scheduled'), 'accepting keeps the visit pending until the player reaches the town door');
  expect(planned.day === 5 && planned.period === 0, 'planning the visit uses no time');
  expect(await ev(() => { const g = window.__esl, goal = g.hud.currentGoal(); return !!goal && (goal.target?.x === -24.15 || goal.target?.id === 'friendHouse' || goal.loc === 'friendhouse'); }), 'pending goal points to the friend-house door');
  expect(await ev((id) => !!window.__esl.npcs.actorFor(id), friend.id), 'the host waits outside the house');
  // Unlike the existing mall helper, these movements traverse the lane: no
  // teleport to the interaction and no direct call to enterScene(friendhouse).
  await walk(-22, 10.96);
  await walk(-23.75, 10.96);
  await shot('house-door-town');
  const before = await ev((id) => { const w = window.__esl.world; return { day: w.day, period: w.period, xp: w.rel(id).xp, memories: w.save.memories.length }; }, friend.id);
  await enterHouse();
  // Save while the host is greeting, reload, and return through the same door.
  // No cards from the unfinished visit have awarded XP or consumed time.
  await page.waitForFunction(() => document.querySelector('.dlg-en')?.textContent === 'Welcome! Come in.', null, { timeout: 15000 });
  expect(await ev(() => window.__esl.friendship.activeId !== null), 'the greeting is an active unfinished visit');
  await ev(() => window.__esl.save(true));
  await reloadProfile();
  const interrupted = await visitState(friend);
  expect(interrupted.activeId === null && interrupted.status === 'scheduled' && await idle(), 'reload clears the active visit and leaves its plan available');
  expect(interrupted.day === before.day && interrupted.period === before.period && interrupted.xp === before.xp && interrupted.memories === before.memories, 'an interrupted visit awards no XP or memory and uses no period');
  await ev(() => window.__esl.enterScene('town', 'homeDoor'));
  await settle();
  await walk(-22, 10.96);
  await walk(-23.75, 10.96);
  await enterHouse();
  const shots = { greeting: false, pet: false, activity: false, goodbye: false };
  const lines = [];
  expect(await pump(async () => {
    const en = await page.locator('.dlg-en').textContent().catch(() => '');
    if (en && !lines.includes(en)) lines.push(en);
    if (!shots.greeting && /Welcome! Come in\./.test(en)) { await sleep(150); await shot('entrance-greeting'); shots.greeting = true; }
    if (!shots.pet && /I have .* (dogs?|cats?|fish|birds?|hamsters?|rabbits?|turtles?)\./.test(en)) { await sleep(150); await shot('pet-moment'); shots.pet = true; }
    const playing = await page.locator('.act-btn:visible, .sketch:visible').first().isVisible().catch(() => false);
    if (!shots.activity && (playing || /photos|picture|photo/.test(en))) { await sleep(150); await shot('shared-activity'); shots.activity = true; }
    if (!shots.goodbye && /See you at school!/.test(en)) { await sleep(150); await shot('goodbye'); shots.goodbye = true; }
    return ev(({ day, period }) => { const g = window.__esl; return g.world.day === day && g.world.period === period + 1 && g.sceneId === 'town' && g.mode === 'explore' && !g.hud.showingCard; }, before);
  }, { label: 'visit', max: 300, prefer: ['Thank you for having me!', 'See you at school!', 'Thank you!', 'How many', "It's cute!", 'They are cute!', 'Yes, please.', 'I want to', 'That was fun!', 'Your picture is beautiful!', 'You can sing well, too!'] }), 'the full visit finishes and leaves in one period');
  await settle();
  const after = await visitState(friend);
  expect(lines.some((s) => s === 'This is my room.'), 'the friend shows their room');
  expect(lines.some((s) => s === 'Do you want some juice?'), 'the snack offer was shown');
  expect(Object.values(shots).every(Boolean), 'greeting, pet, activity and goodbye screenshots were captured');
  expect(after.day === before.day && after.period === before.period + 1, 'the visit costs exactly one free period');
  expect(after.xp - before.xp === 12, 'the visit gives the existing 12 event XP exactly once');
  expect(after.memories === before.memories + 1 && after.memory?.focus?.length === 1 && after.memory.focus[0] === friend.id, 'one personal memory focuses on the host');
  expect(after.memory?.detail.recall?.en && /house|home/.test(after.memory.detail.recall.en), 'the visit stores its own house recall sentence');
  expect(after.status === 'done' && after.activeId === null, 'the event finishes with no active state');
  expect(after.scene === 'town' && Math.hypot(after.x + 22, after.z - 10.96) < 0.1, 'leaving returns to the pavement outside the same door');

  await ev((id) => window.__esl.menus.open('journal', { npc: id }), friend.id);
  await sleep(500);
  expect(await page.locator('.timeline .tl-row').count() > 0 && /house|home/i.test(await page.locator('.timeline').innerText()), 'the journal timeline renders the house visit');
  await page.keyboard.press('Escape');
  await settle();
  await ev(() => window.__esl.save(true));
  await reloadProfile();
  const duplicate = await ev((id) => window.__esl.friendshipDebug.complete(id, {}), friend.instanceId);
  const reloaded = await visitState(friend);
  expect(duplicate.already === true && reloaded.xp === after.xp && reloaded.memories === after.memories && reloaded.period === after.period && reloaded.day === after.day, 'reload and repeated completion add no memory, XP or time');
  expect(reloaded.activeId === null, 'reload leaves no stuck active visit');
  log('friend house summary', { friend, before, after: { xp: after.xp, period: after.period, recall: after.memory?.detail.recall?.en }, shots: out });
} finally { await browser.close(); }
if (H.errors.length) { console.error('FRIEND HOUSE CHECKS FAILED:', H.errors.join('; ')); process.exit(1); }
console.log('FRIEND HOUSE CHECKS PASSED');

async function useTalk(id) {
  const near = await ev((id) => { const g = window.__esl, a = g.npcs.actorFor(id); return a && Math.hypot(a.char.root.position.x - g.player.x, a.char.root.position.z - g.player.z) < 1.9; }, id);
  expect(near, 'the invited friend is within Talk range');
  await page.locator('.action').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('.action').click();
}

async function visitState(friend) {
  return ev(({ id, instanceId }) => { const g = window.__esl, w = g.world; return { day: w.day, period: w.period, xp: w.rel(id).xp, memories: w.save.memories.length, memory: w.save.memories.find((m) => m.detail?.eventId === instanceId), status: w.save.friendship.instances[instanceId]?.status, activeId: g.friendship.activeId, scene: g.sceneId, x: g.player.x, z: g.player.z }; }, friend);
}
