// Activity framework: runs a shared activity, then awards connection,
// records a memory (with a photo), a souvenir, a thank-you message, and
// advances time. Also hosts the quick lost-item search and the café counter.

import * as THREE from 'three';
import { playBall } from './ballplay.js';
import { playCafe } from './cafe.js';
import { playMall, shopAtMall, orderAtMall } from './mall.js';
import { Conversation, opt } from '../dialogue/runner.js';
import { line } from '../dialogue/lines.js';
import { PHRASES } from '../dialogue/intent.js';
import { LOST_ITEMS, DRINKS, FOODS } from '../data/content.js';
import { itemMesh } from '../engine/food.js';
import { addPhoto } from '../core/store.js';
import { sfx } from '../core/audio.js';
import { wait } from '../core/util.js';
import { bus } from '../core/events.js';
import { guideVisitor } from './directions.js';
import { playMilestone } from './milestone.js';
import { startEvent, completeEvent, offerEvent, endEvent } from '../world/friendship.js';
import { eventTitle, FLOWS } from '../dialogue/events.js';
import { makeId } from '../core/util.js';

// Shelf souvenirs for friendship events (engine/food.js draws them).
const EVENT_SOUVENIR = { special_day: 'party', best_friend: 'keepsake', practice: 'medal', project: 'card', home_visit: 'visit', friend_house: 'visit' };
const VARIANT_SOUVENIR = { draw: 'drawing', spot: 'nature', music: 'music' };

function eventSouvenir(event, act, result) {
  if (event.template === 'hobby') return VARIANT_SOUVENIR[result.detail?.variant] || act;
  return EVENT_SOUVENIR[event.template] || act;
}

function eventThanks(event, w, result) {
  const o = event.data?.occasion;
  const v = result.detail?.variant;
  if (event.template === 'best_friend') return [`Thank you for today, ${w.save.player.name}! You're my best friend! 🌟`, `今日はありがとう、${w.save.player.name}！ずっと親友だよ！`];
  if (o?.kind === 'birthday') return ['Thank you for my birthday party! It was the best day! 🎂', 'お誕生日会、ありがとう！最高の一日だった！'];
  if (event.template === 'special_day') return ['Thank you for the party! It was so much fun! 🎉', 'パーティー、ありがとう！すごく楽しかった！'];
  if (event.template === 'practice') return ['Thank you for helping me practice! 💪', '練習を手伝ってくれてありがとう！'];
  if (event.template === 'home_visit') return ['Thank you for inviting me to your house! I had fun! 🏠', '家にさそってくれてありがとう！楽しかった！'];
  if (event.template === 'friend_house') return ['Thank you for coming to my house! See you at school! 🏡', '家に遊びに来てくれてありがとう！学校で会おうね！'];
  if (event.template === 'project') { const r = w.npc(event.data.recipient); return [`Let's give our card to ${r?.name || 'our friend'}! 💌`, `${r?.name || ''}にカードをわたそうね！`]; }
  if (v === 'draw') return ['Thank you for drawing with me! 🎨', 'いっしょに絵をかいてくれてありがとう！'];
  if (v === 'spot') return ['That was a fun adventure! Thank you! 🐞', '楽しいぼうけんだったね！ありがとう！'];
  if (v === 'music') return ['Thank you for the music time! 🎵', '音楽の時間、ありがとう！'];
  return ['Thank you for today! It was fun! 😊', '今日はありがとう！楽しかった！'];
}

const ACT_NAMES = {
  soccer: { en: 'Soccer at Sakura Park', ja: 'さくら公園でサッカー', thanks: ['Thank you for today! Soccer was fun! ⚽', '今日はありがとう！サッカー楽しかったね！'] },
  catch: { en: 'Playing catch at the park', ja: '公園でキャッチボール', thanks: ['Thank you for today! Playing catch was fun! ⚾', '今日はありがとう！キャッチボール楽しかったね！'] },
  cafe: { en: 'Lunch at Café Komorebi', ja: 'カフェ・こもれびで食事', thanks: ['Thank you for today! The café was so good! ☕', '今日はありがとう！カフェ、おいしかったね！'] },
  mall: { en: 'A day at Niji Mall', ja: 'にじモールでお出かけ', thanks: ['Thank you for today! Niji Mall was fun! 🛍️', '今日はありがとう！にじモール、楽しかったね！'] },
};

export class Activities {
  constructor(game) {
    this.game = game;
    this.search = null;
    this._directions = null;
  }

  // Detached, frozen semantic state for the debug / acceptance harness.
  get directions() {
    const s = this._directions;
    return s ? Object.freeze({ ...s, availableExitTurns: Object.freeze([...s.availableExitTurns]) }) : null;
  }

  startDirections(actor, event) { return guideVisitor(this.game, actor, event); }
  mallShop(target) { return shopAtMall(this.game, target); }
  mallCounter(target) { return orderAtMall(this.game, target); }

  /** Best-friend milestone (an event activity with its own scene). */
  runMilestone(actor, event, plan) {
    return this.run('best_friend', [actor], { plan, event, play: (game, actors) => playMilestone(game, actors[0]) });
  }

  /**
   * Run a shared activity. With `event` (a friendship event instance) the
   * rewards go through completeEvent: one memory, the event's XP once, its
   * cooldown and history; otherwise the ordinary activity rewards apply.
   */
  async run(act, actors, { plan = null, like = null, event = null, variant = null, play = null } = {}) {
    const game = this.game;
    const w = game.world;
    if (event?.template === 'friend_house' && event.status !== 'scheduled') return;
    game.setMode('activity');
    game.hud.setActivity(true);
    if (event) startEvent(w.save, event.id);
    let result = null;
    try {
      if (play) result = await play(game, actors);
      else if (act === 'cafe') result = await playCafe(game, actors, { plan, celebrate: variant?.celebrate || null });
      else if (act === 'mall') result = await playMall(game, actors);
      else result = await playBall(game, actors, { soccer: act === 'soccer', like });
    } catch (err) {
      console.error('[activity] failed', err);
      result = { score: 0, detail: {}, error: true };
    }
    actors = result?.actors || actors;
    game.dialogue.close();
    game.activityHud.hide();
    game.activityTick = null;
    game.activityMove = null;
    if (event?.template === 'friend_house' && result?.error) {
      endEvent(w.save, event.id);
      game.player.char.setProp(null);
      game.player.char.setBase('idle');
      game.sitting = false;
      game.hud.setActivity(false);
      await game.enterScene('town', 'friendHouseDoor');
      game.setMode('explore');
      game.save(true);
      return;
    }
    // The door/scene transition saved the unfinished plan. Keep that snapshot
    // until the result card is dismissed and advanceTime saves reward + time
    // together. A reload on the result card can replay, never keep free XP.
    if (event?.template === 'friend_house') clearTimeout(game.saveTimer);
    // Rewards: connection, memory, souvenir, thank-you message.
    const ids = actors.map((a) => a.npc.id);
    const before = Object.fromEntries(ids.map((id) => [id, w.level(id)]));
    let info = ACT_NAMES[act] || { en: 'A fun time together', ja: 'いっしょに楽しい時間', thanks: ['Thank you for today! 😊', '今日はありがとう！'] };
    let mem;
    let souvenir;
    if (event) {
      const t = eventTitle(w, event);
      info = { en: `${t.emoji} ${t.en}`, ja: t.ja, thanks: eventThanks(event, w, result) };
      const r = completeEvent(w, event.id, { act: ACT_NAMES[act] ? act : null, detail: result.detail || {}, photo: result.photo, phrase: result.phrase || null, remembered: !!result.remembered });
      mem = r.memory || { id: makeId('mem') };
      souvenir = w.addSouvenir(eventSouvenir(event, act, result), ids[0]);
      if (!r.already) FLOWS[event.template]?.after?.(game, event, result);
    } else if (ids.length >= 2) {
      // Group outing: XP for every friend and closer friends, but no level gate
      // (only one-on-one time opens levels; DESIGN_DECISIONS 2026-11-16).
      const inst = offerEvent(w, { template: 'group_outing', npcId: ids[0], data: { with: ids.slice(1), act } });
      const pairs = [];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j], 2]);
      const r = completeEvent(w, inst.id, { npcIds: ids, xpTo: ids, act, links: pairs, detail: result.detail || {}, photo: result.photo, phrase: result.phrase || null });
      for (const id of ids) w.xp(id, 4, { key: `act:${act}`, reason: 'first' });
      mem = r.memory;
      souvenir = w.addSouvenir(act, ids[0]);
      info = { ...info, en: `${info.en} with friends`, ja: `${info.ja}（みんなで）` };
    } else {
      mem = w.addMemory({ npcIds: ids, type: 'activity', act, detail: result.detail || {}, photo: result.photo, phrase: result.phrase || null });
      for (const id of ids) {
        w.xp(id, 10, { reason: 'activity' });
        w.xp(id, 4, { key: `act:${act}`, reason: 'first' });
      }
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) w.connect(ids[i], ids[j], 2);
      souvenir = w.addSouvenir(act, ids[0]);
    }
    if (result.photo) addPhoto(w.save.id, { id: mem.id, url: result.photo, day: w.day, act, npcIds: ids, caption: info.en, phrase: result.phrase || '' });
    w.queueEvening({ type: 'thanks', from: ids[0], en: info.thanks[0], ja: info.thanks[1] });
    if (plan) w.completePlan(plan);
    w.save.stats.activities = (w.save.stats.activities || 0) + 1;
    if (w.save.flags.fd === 'planned' && ids.includes(w.save.introNpc)) { w.save.flags.fd = 'played'; bus.emit('firstday', { stage: 'played' }); }
    game.hud.setActivity(false);
    await game.hud.results({ act, title: info, npcs: actors.map((a) => a.npc), before, result, souvenir, photo: result.photo });
    game.npcs.restoreArea();
    await game.advanceTime({ reason: 'activity' });
    if (event?.template === 'friend_house') await game.enterScene('town', 'friendHouseDoor');
  }

  // ------------------------------------------------------------ lost item search (no time cost)
  startSearch(actor, lost, hide) {
    const game = this.game;
    const scene = game.scene;
    const item = LOST_ITEMS.find((x) => x.id === lost.item);
    const cands = (lost.variant === 'clue' ? scene.hides.filter((h) => h.obj.en === hide.obj.en) : scene.hides).map((h) => ({ ...h, checked: false }));
    const mesh = itemMesh(item.id);
    mesh.position.set(hide.item.x, hide.item.y, hide.item.z);
    mesh.visible = false;
    scene.root.add(mesh);
    this.search = { actor, lost, hide, item, cands, mesh, found: false };
    const clue = lost.variant === 'clue' ? `“It's ${hide.prep} the ${hide.obj.en}.”` : '“Look around the park!”';
    game.hud.setGoal({ icon: '🔍', en: `Find ${actor.npc.name}'s ${item.en}! ${clue}`, ja: `${actor.npc.name}の${item.ja}をさがそう！` });
    game.extraInteract = cands.map((h) => ({
      id: `look:${h.id}`, x: h.look.x, z: h.look.z, r: 1.25, kind: 'look', icon: '🔍', hide: h,
      label: { en: `Look ${h.prep} the ${h.obj.en}`, ja: `${h.obj.ja}${{ in: 'の中', on: 'の上', under: 'の下', by: 'のそば' }[h.prep]}を見る` },
    }));
    game.sparkles = cands.map((h) => ({ x: h.item.x, y: h.item.y + 0.5, z: h.item.z, id: h.id }));
  }

  async look(target) {
    const game = this.game;
    const s = this.search;
    if (!s) return;
    const h = target.hide;
    if (h.id !== s.hide.id) {
      sfx.deny();
      game.player.char.play('shake', 0.9);
      game.hud.toast({ icon: '🤔', en: `Not ${h.prep} the ${h.obj.en}...`, ja: 'ここにはないみたい…' });
      game.extraInteract = game.extraInteract.filter((x) => x !== target);
      game.sparkles = game.sparkles.filter((x) => x.id !== h.id);
      return;
    }
    // Found it!
    s.found = true;
    game.extraInteract = [];
    game.sparkles = [];
    s.mesh.visible = true;
    s.mesh.scale.setScalar(0.01);
    sfx.discover();
    game.player.char.play('surprised', 0.8);
    game.setMode('talk');
    const start = performance.now();
    await new Promise((res) => {
      const grow = () => {
        const t = Math.min(1, (performance.now() - start) / 450);
        s.mesh.scale.setScalar(0.01 + t * (1 + Math.sin(t * Math.PI) * 0.4));
        if (t < 1) requestAnimationFrame(grow); else res();
      };
      grow();
    });
    s.mesh.scale.setScalar(1);
    const npc = s.actor.npc;
    const right = `It's ${h.prep} the ${h.obj.en}.`;
    const preps = ['in', 'on', 'under', 'by'];
    const wrong = preps.filter((p) => p !== h.prep).sort(() => Math.random() - 0.5).slice(0, 3);
    const objs = { in: 'box', on: 'bench', under: 'bench', by: 'tree' };
    const cards = [{ p: h.prep, o: h.obj.en }, ...wrong.map((p) => ({ p, o: p === h.prep ? h.obj.en : (Math.random() < 0.5 ? h.obj.en : objs[p]) }))]
      .sort(() => Math.random() - 0.5)
      .map((x, i) => opt(`${x.p}:${x.o}:${i}`, `It's ${x.p} the ${x.o}.`, `${x.o === 'bench' ? 'ベンチ' : x.o === 'box' ? '箱' : x.o === 'tree' ? '木' : x.o === 'slide' ? 'すべり台' : 'ふん水'}${{ in: 'の中', on: 'の上', under: 'の下', by: 'のそば' }[x.p]}にあるよ。`, { emoji: '📍', keys: [[x.p], [x.o]], area: 'prepositions', expr: `p.${x.p}`, template: "It's in / on / under / by the ___." }));
    const c = new Conversation(game, [s.actor]);
    game.camera.frameTalk([game.player.char, { root: s.mesh }]);
    const r = await c.ask(cards, { prompt: { name: '🔍', color: '#FF7A59', en: `You found ${npc.name}'s ${s.item.en}! Tell ${npc.name} where it is.`, ja: `見つけた！${npc.name}にどこにあるか教えよう。` } });
    const [p, o] = r.id.split(':');
    if (p === h.prep && o === h.obj.en) {
      await c.say(s.actor, line(`${h.prep.charAt(0).toUpperCase() + h.prep.slice(1)} the ${h.obj.en}? I see it!`, 'あ、見えた！'), { expr: 'surprised' });
    } else {
      await c.say(s.actor, line(`${p.charAt(0).toUpperCase() + p.slice(1)} the ${o}? Hmm... Oh! ${right}`, `うーん…あ！${h.obj.ja}${{ in: 'の中', on: 'の上', under: 'の下', by: 'のそば' }[h.prep]}だ！`, { area: 'prepositions', expr: `p.${h.prep}` }), { expr: 'surprised' });
    }
    game.dialogue.close();
    // The friend runs over, picks it up and thanks you.
    game.npcs.engage(s.actor);
    const near = game.scene.collision.nearestFree(h.look.x + 0.5, h.look.z + 0.4, 0.3);
    game.camera.frameTalk([game.player.char, s.actor.char]);
    await game.npcs.walkTo(s.actor, near.x, near.z, 3.2);
    s.mesh.removeFromParent();
    s.actor.char.setProp(s.item.id === 'ball' ? 'ball' : s.item.id === 'book' ? 'book' : null);
    s.actor.char.setExpression('happy', 4);
    s.actor.char.play('happy', 1.2);
    game.camera.frameTalk([game.player.char, s.actor.char]);
    s.actor.char.faceToward(game.player.x, game.player.z);
    game.player.char.faceToward(s.actor.char.root.position.x, s.actor.char.root.position.z);
    const c2 = new Conversation(game, [s.actor]);
    await c2.say(s.actor, line(`My ${s.item.en}! Thank you, ${game.world.save.player.name}! You're so kind!`, `わたしの${s.item.ja}！ありがとう、${game.world.save.player.name}！やさしいね！`, { area: 'adjectives', expr: 'adj.kind', template: "You're kind!" }), { gesture: 'happy', expr: 'happy' });
    await c2.ask([opt('welcome', "You're welcome!", 'どういたしまして！', { emoji: '😊', phrases: ["you're welcome", 'you are welcome', 'no problem', 'welcome'], keys: [['welcome', 'problem']] })]);
    const w = game.world;
    // The favour is a friendship event (template `find`): memory, XP once, history.
    const inst = offerEvent(w, { template: 'find', npcId: npc.id, data: { item: s.item.id } });
    completeEvent(w, inst.id, { act: null, detail: { item: s.item.en, itemJa: s.item.ja, prep: h.prep, obj: h.obj.en } });
    w.addSouvenir('help', npc.id);
    w.queueEvening({ type: 'thanks', from: npc.id, en: `Thank you for finding my ${s.item.en}! You're my hero! 🦸`, ja: `${s.item.ja}を見つけてくれてありがとう！` });
    w.daily.lostDone = true;
    this.search = null;
    game.hud.setGoal(null);
    await c2.end();
    game.hud.refresh();
    s.actor.char.setProp(null);
    game.npcs.release(s.actor);
    game.save();
  }

  // ------------------------------------------------------------ café counter (quick, no time)
  async cafeCounter(staff) {
    const game = this.game;
    const c = await Conversation.start(game, [staff]);
    try {
      await c.say(staff, line('Welcome to Café Komorebi! What do you want?', 'いらっしゃいませ！何にしますか？', { area: 'food', expr: 'q.whatwant', template: 'What do you want?' }), { gesture: 'wave', expr: 'happy' });
      const picks = [FOODS.find((f) => f.id === 'icecream'), FOODS.find((f) => f.id === 'cake'), ...DRINKS.slice().sort(() => Math.random() - 0.5).slice(0, 2)];
      const r = await c.ask(picks.map((x) => opt(x.id, `${x.a.charAt(0).toUpperCase() + x.a.slice(1)}, please.`, `${x.ja}をください。`, { emoji: x.emoji, keys: [[x.en]], phrases: [`${x.a} please`, `i want ${x.a}`], area: 'food', expr: 'a.please', template: '___, please.' })));
      await c.say(staff, line('Here you are.', 'はい、どうぞ。', { area: 'food', expr: 'a.hereyouare', template: 'Here you are.' }), { gesture: 'hold' });
      if (r.id === 'icecream') game.player.char.setProp('icecream');
      await c.ask([opt('thanks', 'Thank you!', 'ありがとう！', { emoji: '😊', phrases: PHRASES.thanks, keys: [['thank']], area: 'food', expr: 'a.thanks', template: 'Thank you!' })]);
      await c.say(staff, line('Enjoy!', 'ごゆっくりどうぞ！'), { expr: 'happy' });
    } finally {
      await c.end();
      setTimeout(() => game.player.char.setProp(null), 6000);
    }
  }
}
