// Developer / teacher debug panel (toggle with the ` key). Lets you jump
// time, change weather, set friendship levels, see where everyone is, and
// trigger events — without touching the save format.

import { el, escapeHtml } from '../core/util.js';
import { LOCATIONS, DAYS, LOST_ITEMS } from '../data/content.js';
import { LEVEL_XP } from '../world/relationships.js';
import { MORNING, AFTERNOON, EVENING } from '../world/time.js';

let panel = null;
let fpsEl = null;

export function toggleDebug(game) {
  if (panel) { panel.remove(); panel = null; return; }
  panel = el('div', { class: 'debug' });
  document.getElementById('ui').appendChild(panel);
  render(game);
}

function render(game) {
  const w = game.world;
  panel.innerHTML = '';
  const btn = (label, fn) => { const b = el('button', {}, [label]); b.addEventListener('click', async () => { await fn(); render(game); }); return b; };
  const head = el('div', { class: 'dbg-head' }, [el('b', {}, ['🛠 Debug']), btn('✕', () => { panel.remove(); panel = null; })]);
  panel.appendChild(head);
  const info = el('div', { class: 'dbg-info' }, [`Day ${w.day} (${DAYS[w.dow].short}) · period ${w.period} · ${w.weather} · scene ${game.sceneId} · fd=${w.save.flags.fd}`]);
  panel.appendChild(info);
  const time = el('div', { class: 'dbg-row' }, [
    btn('⏩ Next period', () => game.advanceTime({ reason: 'debug' })),
    btn('🌙 Sleep', () => game.sleep()),
    btn('☀️', () => setWeather(game, 'sunny')), btn('☁️', () => setWeather(game, 'cloudy')), btn('☔', () => setWeather(game, 'rainy')),
  ]);
  panel.appendChild(time);
  const go = el('div', { class: 'dbg-row' }, [
    btn('🏫', () => game.enterScene('classroom', 'door')), btn('🌸 Park', () => game.enterScene('town', 'park')), btn('🏘 Town', () => game.enterScene('town', 'crossroads')),
    btn('☕', () => game.enterScene('cafe', 'door')), btn('🏠', () => game.enterScene('home', 'center')),
  ]);
  panel.appendChild(go);
  const ev = el('div', { class: 'dbg-row' }, [
    btn('❗ Lost item here', () => {
      const a = game.npcs.actors.find((x) => !x.special && w.isKnown(x.npc.id)) || game.npcs.actors.find((x) => !x.special);
      if (!a) return;
      w.meet(a.npc.id);
      w.daily.lost = { npcId: a.npc.id, period: w.period, item: LOST_ITEMS[Math.floor(Math.random() * LOST_ITEMS.length)].id, hide: null, variant: Math.random() < 0.5 ? 'clue' : 'search' };
      w.daily.lostDone = false;
      if (game.sceneId === 'town') game.enterScene('town', 'park');
    }),
    btn('📱 Invite msg', () => { const n = w.known()[0]; if (n) { const inv = w.makeInvite(n); w.addMessage({ from: n.id, kind: 'invite', ...inv }); } }),
    btn('🤝 Meet all', () => { for (const n of w.npcs) w.meet(n.id); }),
    btn('📖 Reveal facts', () => { for (const n of w.known()) for (const k of ['like:0', 'like:1', 'like:2', 'can:0', 'can:1', 'subject', 'birthday', 'pet', 'food', 'week:5', 'week:6']) w.learn(n.id, k); }),
    btn('🧭 Skip first day', () => { w.save.flags.fd = 'done'; }),
  ]);
  panel.appendChild(ev);
  const list = el('div', { class: 'dbg-list' });
  for (const n of w.npcs) {
    const slot = w.slot(n);
    const lvl = w.level(n.id);
    const row = el('div', { class: 'dbg-npc' }, [
      el('b', {}, [n.name]),
      el('span', {}, [`${LOCATIONS[slot.loc]?.en || slot.loc} · ${slot.act}${slot.plan ? ' ⭐' : ''}`]),
    ]);
    const sel = el('select', {}, [0, 1, 2, 3, 4, 5].map((l) => el('option', { value: l, selected: l === lvl ? 'selected' : null }, [`Lv${l}`])));
    sel.addEventListener('change', () => {
      const r = w.rel(n.id);
      const L = Number(sel.value);
      r.level = L;
      r.xp = L >= 2 ? LEVEL_XP[L] : 0;
      if (L >= 1 && r.metDay === null) r.metDay = w.day;
      game.hud.refresh();
      render(game);
    });
    const tp = el('button', {}, ['📍']);
    tp.addEventListener('click', () => {
      const a = game.npcs.actorFor(n.id);
      if (a) { const p = a.char.root.position; game.player.place(p.x + 1, p.z + 1, 0); }
    });
    row.append(sel, tp);
    list.appendChild(row);
  }
  panel.appendChild(list);
  panel.appendChild(el('div', { class: 'dbg-info' }, [`Draw calls: ${game.renderer.renderer.info.render.calls} · tris: ${game.renderer.renderer.info.render.triangles} · pixel ratio: ${game.renderer.ratio.toFixed(2)}`]));
}

function setWeather(game, wx) {
  game.world.save.weatherOverrides = game.world.save.weatherOverrides || {};
  game.world.save.weatherOverrides[game.world.day] = wx;
  game.enterScene(game.sceneId, Object.keys(game.scene.spawns)[0], { fade: false });
}

export function showFps(game) {
  if (fpsEl) return;
  fpsEl = el('div', { class: 'fps' });
  document.getElementById('ui').appendChild(fpsEl);
  let frames = 0, t0 = performance.now();
  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - t0 > 1000) { fpsEl.textContent = `${frames} fps · ${game.renderer.renderer.info.render.calls} calls`; frames = 0; t0 = now; }
    requestAnimationFrame(tick);
  };
  tick();
}
