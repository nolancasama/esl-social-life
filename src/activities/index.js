// Activity framework: runs a shared activity, then awards connection,
// records a memory (with a photo), a souvenir, a thank-you message, and
// advances time. Also hosts the quick lost-item search and the café counter.

import * as THREE from 'three';
import { playBall } from './ballplay.js';
import { playCafe } from './cafe.js';
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

const ACT_NAMES = {
  soccer: { en: 'Soccer at Sakura Park', ja: 'さくら公園でサッカー', thanks: ['Thank you for today! Soccer was fun! ⚽', '今日はありがとう！サッカー楽しかったね！'] },
  catch: { en: 'Playing catch at the park', ja: '公園でキャッチボール', thanks: ['Thank you for today! Playing catch was fun! ⚾', '今日はありがとう！キャッチボール楽しかったね！'] },
  cafe: { en: 'Lunch at Café Komorebi', ja: 'カフェ・こもれびで食事', thanks: ['Thank you for today! The café was so good! ☕', '今日はありがとう！カフェ、おいしかったね！'] },
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

  async run(act, actors, { plan = null, like = null } = {}) {
    const game = this.game;
    const w = game.world;
    game.setMode('activity');
    game.hud.setActivity(true);
    let result = null;
    try {
      result = act === 'cafe' ? await playCafe(game, actors, { plan }) : await playBall(game, actors, { soccer: act === 'soccer', like });
    } catch (err) {
      console.error('[activity] failed', err);
      result = { score: 0, detail: {}, error: true };
    }
    actors = result?.actors || actors;
    game.dialogue.close();
    game.activityHud.hide();
    game.activityTick = null;
    game.activityMove = null;
    // Rewards: connection, memory, souvenir, thank-you message.
    const ids = actors.map((a) => a.npc.id);
    const before = Object.fromEntries(ids.map((id) => [id, w.level(id)]));
    const info = ACT_NAMES[act];
    const mem = w.addMemory({ npcIds: ids, type: 'activity', act, detail: result.detail || {}, photo: result.photo, phrase: result.phrase || null });
    for (const id of ids) {
      w.xp(id, 10, { reason: 'activity' });
      w.xp(id, 4, { key: `act:${act}`, reason: 'first' });
    }
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) w.connect(ids[i], ids[j], 2);
    if (result.photo) addPhoto(w.save.id, { id: mem.id, url: result.photo, day: w.day, act, npcIds: ids, caption: info.en, phrase: result.phrase || '' });
    const souvenir = w.addSouvenir(act, ids[0]);
    w.queueEvening({ type: 'thanks', from: ids[0], en: info.thanks[0], ja: info.thanks[1] });
    if (plan) w.completePlan(plan);
    w.save.stats.activities = (w.save.stats.activities || 0) + 1;
    if (w.save.flags.fd === 'planned' && ids.includes(w.save.introNpc)) { w.save.flags.fd = 'played'; bus.emit('firstday', { stage: 'played' }); }
    game.hud.setActivity(false);
    await game.hud.results({ act, title: info, npcs: actors.map((a) => a.npc), before, result, souvenir, photo: result.photo });
    game.npcs.restoreArea();
    await game.advanceTime({ reason: 'activity' });
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
    w.addMemory({ npcIds: [npc.id], type: 'help', detail: { item: s.item.en, itemJa: s.item.ja, prep: h.prep, obj: h.obj.en } });
    w.xp(npc.id, 8, { key: `help:${w.day}`, reason: 'help' });
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
