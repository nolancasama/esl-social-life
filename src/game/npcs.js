// NPC actors in the current scene: placement from schedules, ambient life
// (chatting friends, ball games, readers, joggers), markers and approach.

import * as THREE from 'three';
import { FRIEND_HOUSE_DOOR } from '../world/friendhouse.js';
import { Character } from '../engine/character.js';
import { LOCATIONS, interest, VISITORS } from '../data/content.js';
import { NODES, exitsAt, headingBetween } from '../world/directions.js';
import { damp, angleDelta } from '../core/util.js';
import { StaticBuilder } from '../engine/builder.js';
import { makeBlobShadow } from '../engine/materials.js';
import { styleData, styleLine, styleGesture } from '../world/personality.js';
import { canApproach, noteApproach, openOffers } from '../world/friendship.js';

export const TEACHER = {
  id: 'teacher', name: 'Ms. Aoki', role: 'Teacher 先生', color: '#4C6FFF', voice: { pitch: 1.05, rate: 0.9 },
  look: { skin: '#F9D3B2', hairStyle: 'bob', hairColor: '#3B2B24', top: 'jacket', topColor: '#5C7CFA', bottom: 'pants', bottomColor: '#2B3A55', shoes: '#343A40', bag: '#212529', accessory: 'glasses', accColor: '#2E3440', eyes: 'round', height: 1 },
};
export const STAFF = {
  id: 'staff', name: 'Mr. Mori', role: 'Café ☕', color: '#2F9E6E', voice: { pitch: 0.85, rate: 0.92 },
  look: { skin: '#EFC29C', hairStyle: 'short', hairColor: '#5A3A27', top: 'collar', topColor: '#FFFFFF', bottom: 'pants', bottomColor: '#6C4F3D', shoes: '#343A40', bag: '#212529', accessory: 'none', accColor: '#2F9E6E', eyes: 'happy', height: 1 },
};

const STYLE = {
  soccer: { mode: 'ball', prop: 'ball' },
  baseball: { mode: 'ball' },
  dodgeball: { mode: 'ball' },
  basketball: { mode: 'stand', tags: ['hoop', 'open'], gesture: 'cheer', bubble: '🏀' },
  running: { mode: 'route', route: 'park', speed: 2.0, gesture: 'jog', bubble: '🏃' },
  music: { mode: 'sit', tags: ['music', 'bench', 'table', 'stool'], bubble: '🎧' },
  singing: { mode: 'stand', tags: ['singing', 'dancing'], gesture: 'talk', bubble: '🎵' },
  dancing: { mode: 'stand', tags: ['dancing', 'open'], gesture: 'dance', bubble: '💃' },
  drawing: { mode: 'sit', prop: 'sketch', tags: ['drawing', 'bench', 'table'], bubble: '🎨' },
  reading: { mode: 'sit', prop: 'book', tags: ['reading', 'bench', 'table', 'stool', 'terrace'], bubble: '📚' },
  comics: { mode: 'sit', prop: 'book', tags: ['comics', 'bench', 'table'], bubble: '😂' },
  games: { mode: 'sit', prop: 'console', tags: ['games', 'bench'], bubble: '🎮' },
  sweets: { mode: 'sit', tags: ['sweets', 'table', 'terrace'], bubble: '🍰' },
  animals: { mode: 'stand', tags: ['pond', 'animals'], gesture: 'look', bubble: '🐟' },
  bugs: { mode: 'stand', tags: ['tree', 'bugs'], gesture: 'search', bubble: '🐞' },
  skateboarding: { mode: 'route', route: 'park', speed: 2.5, bubble: '🛹' },
  cycling: { mode: 'route', route: 'street', speed: 2.2, bubble: '🚲' },
  shopping: { mode: 'stand', tags: ['shopping', 'board'], bubble: '🛍️' },
  walk: { mode: 'route', route: 'street', speed: 1.25 },
  school: { mode: 'sit', tags: ['desk'] },
};

const CHAT_EMOJI = ['💬', '😄', '❓', '‼️', '🎵', '😆', '👍'];

function zoneFor(loc) { return loc === 'park' ? 'park' : loc === 'town' ? 'street' : 'room'; }

export class NpcManager {
  constructor(game) {
    this.game = game;
    this.actors = [];
    this.balls = [];
    this.approachQueue = [];
    this.time = 0;
  }

  get scene() { return this.game.scene; }

  clear() {
    for (const a of this.actors) { a.char.root.removeFromParent(); a.char.dispose(); }
    for (const b of this.balls) b.mesh.removeFromParent();
    this.actors = [];
    this.balls = [];
    if (this.scene) this.scene.collision.dynamic = [];
    this.approachQueue = [];
  }

  // ------------------------------------------------------------ placement
  populate() {
    this.clear();
    const game = this.game;
    const w = game.world;
    const scene = this.scene;
    const sceneId = game.sceneId;
    this.placed = [];
    this.usedSpots = new Set();
    this.usedGroups = new Set();
    const present = [];
    for (const n of w.npcs) {
      const inSchoolRoom = w.schoolTime && ['musicroom', 'gym', 'artroom'].includes(sceneId);
      const slot = inSchoolRoom ? { loc: sceneId, act: 'school', with: [] } : w.slot(n);
      const L = LOCATIONS[slot.loc];
      if (!L || L.scene !== sceneId) continue;
      present.push({ n, slot, zone: zoneFor(slot.loc) });
    }
    const take = (id) => { const i = present.findIndex((p) => p.n.id === id); return i >= 0 ? present.splice(i, 1)[0] : null; };

    // Adults
    const visitor = w.daily.visitor;
    if (sceneId === 'town' && visitor && !visitor.done && visitor.period === w.period && w.weather !== 'rainy') {
      const p = NODES[visitor.start];
      const next = exitsAt(visitor.start, null)[0].to;
      const heading = headingBetween(visitor.start, next);
      this._spawn({ npc: VISITORS.find((v) => v.id === visitor.visitorId), special: 'visitor', adult: true }, p.x - Math.cos(heading) * 1.2, p.z + Math.sin(heading) * 1.2, heading, 'stand');
    }
    if (['classroom', 'musicroom', 'gym', 'artroom'].includes(sceneId) && w.schoolTime) {
      const t = scene.teacherSpot;
      this._spawn({ npc: TEACHER, special: 'teacher', adult: true }, t.x, t.z, t.yaw, 'stand');
    }
    if (['cafe', 'mall'].includes(sceneId) && !w.evening) {
      const s = scene.staffSpot;
      const staff = sceneId === 'mall' ? { ...STAFF, name: 'Food Court', role: 'Food Court フードコート' } : STAFF;
      this._spawn({ npc: staff, special: 'staff', adult: true }, s.x, s.z, s.yaw, 'stand');
    }

    // First day: the friend and the classmate they will introduce, side by side.
    if (sceneId === 'classroom' && w.save.flags.fd === 'start') {
      const f = take(w.save.firstFriend), y = take(w.save.introNpc);
      const cx = -2.5, cz = 5.25;
      if (f) this._spawn(f, cx - 0.55, cz, Math.PI / 2, 'chat', { center: { x: cx, z: cz } });
      if (y) this._spawn(y, cx + 0.55, cz, -Math.PI / 2, 'chat', { center: { x: cx, z: cz } });
    }

    // Plans with the player happen at the activity spot.
    for (const plan of w.plansNow()) {
      const n = plan.npcIds.length;
      plan.npcIds.forEach((id, k) => {
        const e = take(id);
        if (!e) return;
        if (sceneId === 'town' && plan.loc === 'friendhouse') {
          this._spawn(e, FRIEND_HOUSE_DOOR.x + 0.55, FRIEND_HOUSE_DOOR.z + 0.84, Math.PI / 2, 'stand', { plan: true });
        } else if (sceneId === 'town' && plan.loc === 'park') {
          const f = scene.field;
          this._spawn(e, f.b.x + k * 1.2 - (n - 1) * 0.6, f.b.z, 0, 'stand', { gesture: 'cheer', plan: true, prop: k === 0 && plan.act === 'soccer' ? 'ball' : k === 0 && plan.act === 'catch' ? 'baseball' : null });
        } else if (sceneId === 'cafe' || sceneId === 'mall') {
          const seat = scene.seats.find((s) => s.id === `T2-${[1, 3, 2][k] ?? 1}`) || scene.seats.find((s) => s.id === 'T2-1');
          this._spawn(e, seat.x, seat.z, seat.yaw, 'sit', { seatY: seat.seatY, plan: true });
        } else if (sceneId === 'home') {
          this._arriveHome(e, k);
        } else {
          this._placeSingle(e);
        }
      });
    }

    // Explicit hangouts reserve their pair and space before routine companions
    // or a lost-item search can pull one of the friends away.
    const hangouts = new Set(present.map((e) => e.slot.hangout).filter(Boolean));
    for (const id of hangouts) {
      const group = present.filter((e) => e.slot.hangout === id);
      if (group.length !== 2) continue;
      for (const e of group) take(e.n.id);
      this._placeGroup(group);
    }

    // Lost item: the classmate is searching near the playground.
    const lost = w.daily.lost;
    if (lost && !w.daily.lostDone && sceneId === 'town' && w.period === lost.period) {
      const e = take(lost.npcId);
      if (e) this._spawn(e, 19.5, 27.3, Math.PI, 'search', { gesture: 'search', expr: 'worried' });
    }

    // Friend groups that share this slot.
    const groups = this._groupsOf(present);
    for (const g of groups) {
      if (g.length === 1) continue;
      for (const e of g) take(e.n.id);
      this._placeGroup(g);
    }
    // In the classroom, friends who are not grouped still chat before class.
    if (sceneId === 'classroom' && w.save.flags.fd !== 'start') {
      const rest = present.slice();
      while (rest.length >= 2 && this.usedGroups.size < 4) {
        const a = rest.shift();
        const bi = rest.findIndex((b) => w.link(a.n.id, b.n.id) >= 2);
        if (bi < 0) continue;
        const b = rest.splice(bi, 1)[0];
        take(a.n.id); take(b.n.id);
        this._placeGroup([a, b]);
      }
    }
    for (const e of present.slice()) { take(e.n.id); this._placeSingle(e); }

    // Approaches. The day-one friend comes over the next morning (scripted).
    // From Lv3, friends may come over on their own: a "soft" approach (wave,
    // one line, then they wait; walking away is fine). Limits: one per scene
    // entry, two a day, one per friend a day; the style changes how often a
    // friend comes in person (the rest of their initiative goes to messages).
    const fdDone = w.save.flags.fd === 'done';
    for (const a of this.actors) {
      if (a.special || a.plan) continue;
      const id = a.npc.id;
      if (w.daily.approached[id]) continue;
      if (w.save.flags.fd === 'slept' && id === w.save.introNpc) { this.approachQueue.unshift({ actor: a, delay: 1.0, scripted: true }); continue; }
      const lvl = w.level(id);
      if (!fdDone || lvl < 3 || a.mode === 'ball' || a.mode === 'search' || !canApproach(w.save, w.day, id)) continue;
      const chance = (0.2 + 0.5 * styleData(a.npc).initiative.approach) * (lvl >= 4 ? 1 : 0.7);
      if (Math.random() < chance) this.approachQueue.push({ actor: a, delay: 4 + Math.random() * 3, scripted: false });
    }
    this.approachQueue = this.approachQueue.slice(0, 1);
  }

  _groupsOf(present) {
    const out = [];
    const seen = new Set();
    for (const p of present) {
      if (seen.has(p.n.id)) continue;
      const comp = [p];
      seen.add(p.n.id);
      for (let i = 0; i < comp.length; i++) {
        for (const q of present) {
          if (seen.has(q.n.id) || q.zone !== comp[i].zone) continue;
          const linked = (comp[i].slot.with || []).includes(q.n.id) || (q.slot.with || []).includes(comp[i].n.id);
          if (linked && comp.length < 4) { comp.push(q); seen.add(q.n.id); }
        }
      }
      out.push(comp);
    }
    return out;
  }

  _free(x, z) {
    if (!this.scene.collision.isFree(x, z, 0.26)) return false;
    for (const p of this.placed) if ((p.x - x) ** 2 + (p.z - z) ** 2 < 0.72 * 0.72) return false;
    const pl = this.game.player;
    if (pl && (pl.x - x) ** 2 + (pl.z - z) ** 2 < 1.0) return false;
    return true;
  }

  _placeGroup(g) {
    const scene = this.scene;
    const zone = g[0].zone;
    const act = g[0].slot.act;
    const style = STYLE[act] || {};
    if (style.mode === 'ball' && zone === 'park') {
      const pairSpot = scene.spots.find((s) => s.pair && !this.usedSpots.has(s.id) && !this.usedSpots.has(s.pair));
      if (pairSpot) {
        const other = scene.spots.find((s) => s.id === pairSpot.pair);
        this.usedSpots.add(pairSpot.id); this.usedSpots.add(other.id);
        const a = this._spawn(g[0], pairSpot.x, pairSpot.z, pairSpot.yaw, 'ball');
        const b = this._spawn(g[1], other.x, other.z, other.yaw, 'ball');
        this._makeBallGame(a, b, act === 'soccer');
        for (const e of g.slice(2)) this._placeSingle(e, { near: { x: (pairSpot.x + other.x) / 2 + 2.2, z: (pairSpot.z + other.z) / 2 }, gesture: 'cheer' });
        return;
      }
    }
    const centers = (scene.groups || []).filter((c) => c.zone === zone && !this.usedGroups.has(c.id));
    for (const c of centers.sort(() => Math.random() - 0.5)) {
      const pts = g.map((_, i) => {
        const ang = (i / g.length) * Math.PI * 2 + 0.6;
        return { x: c.x + Math.cos(ang) * c.r, z: c.z + Math.sin(ang) * c.r };
      });
      if (!pts.every((p) => this._free(p.x, p.z))) continue;
      this.usedGroups.add(c.id);
      g.forEach((e, i) => {
        const p = pts[i];
        this._spawn(e, p.x, p.z, Math.atan2(c.x - p.x, c.z - p.z), 'chat', { center: { x: c.x, z: c.z } });
      });
      return;
    }
    for (const e of g) this._placeSingle(e);
  }

  _placeSingle(e, { near = null, gesture = null } = {}) {
    const scene = this.scene;
    const style = STYLE[e.slot.act] || (e.slot.act.startsWith('home:') ? STYLE.reading : {});
    const zone = e.zone;
    if (style.mode === 'route' && scene.routes && (scene.routes[style.route] || scene.routes.street)) {
      const pts = scene.routes[style.route] || scene.routes.street;
      const i = Math.floor(Math.random() * pts.length);
      const p = pts[i];
      const j = (i + 1) % pts.length;
      const t = Math.random();
      const x = p[0] + (pts[j][0] - p[0]) * t, z = p[1] + (pts[j][1] - p[1]) * t;
      const a = this._spawn(e, x, z, 0, 'route', { route: { pts, i: j, speed: style.speed }, gesture: style.gesture, bubble: style.bubble });
      if (e.slot.umbrella || this.game.world.weather === 'rainy') { a.char.setProp('umbrella'); a.holdGesture = 'umbrella'; }
      return a;
    }
    const wantSit = style.mode === 'sit' || (zone === 'room' && this.game.sceneId === 'classroom');
    const tags = style.tags || [];
    let zoneSpots = scene.spots.filter((s) => s.zone === zone && !this.usedSpots.has(s.id) && !s.pair && this._free(s.x, s.z));
    // Homeroom on day one: everyone sits at a desk.
    if (this.game.sceneId === 'classroom' && this.game.world.save.flags.fd === 'start') {
      const desks = zoneSpots.filter((s) => s.tags.includes('desk'));
      if (desks.length) zoneSpots = desks;
    }
    let spot = null;
    if (near) {
      spot = null;
      const p = this.scene.collision.nearestFree(near.x, near.z, 0.3);
      if (this._free(p.x, p.z)) return this._spawn(e, p.x, p.z, Math.atan2(near.x - 2.2 - p.x, 0) || 0, 'stand', { gesture });
    }
    const inClass = this.game.sceneId === 'classroom';
    const front = (s) => (inClass && s.tags.includes('desk') ? (6 - s.z) * 0.35 : 0);
    const score = (s) => (tags.some((t) => s.tags.includes(t)) ? 5 : 0) + (wantSit === (s.kind === 'sit') ? 2 : 0) + front(s) + Math.random();
    spot = zoneSpots.sort((a, b) => score(b) - score(a))[0];
    if (!spot) {
      const p = this.scene.collision.nearestFree((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, 0.3);
      return this._spawn(e, p.x, p.z, Math.random() * 6, 'stand');
    }
    this.usedSpots.add(spot.id);
    const fitsTag = tags.some((t) => spot.tags.includes(t));
    return this._spawn(e, spot.x, spot.z, spot.yaw, spot.kind === 'sit' ? 'sit' : 'stand', {
      seatY: spot.seatY, prop: fitsTag || spot.kind === 'sit' ? style.prop : null,
      gesture: spot.kind === 'sit' ? null : (fitsTag ? style.gesture : null), bubble: style.bubble, spot,
    });
  }

  _spawn(entry, x, z, yaw, mode, o = {}) {
    const npc = entry.npc || entry.n;
    const char = new Character(npc.look, { id: npc.id, adult: !!entry.adult });
    char.setPosition(x, z);
    char.setYaw(yaw);
    const w = this.game.world;
    const a = {
      npc, char, special: entry.special || null, slot: entry.slot || null, mode, home: { x, z, yaw },
      center: o.center || null, route: o.route || null, gesture: o.gesture || null, bubbleEmoji: o.bubble || null,
      seatY: o.seatY ?? 0.45, plan: !!o.plan, engaged: false, collider: { x, z, r: 0.3, owner: null },
      chatT: 1 + Math.random() * 3, bubble: null, waved: false, walk: null, spot: o.spot || null,
    };
    a.collider.owner = a;
    if (mode === 'sit') char.setBase('sit', { height: o.seatY ?? 0.45 });
    if (o.prop) char.setProp(o.prop);
    if (o.expr) char.setExpression(o.expr);
    if (mode === 'search') char.hold('search');
    else if (o.gesture && mode !== 'route') char.hold(o.gesture);
    const outdoorsAfterSchool = this.game.sceneId === 'town' && !w.weekend && w.period === 1;
    char.showBag(outdoorsAfterSchool && mode === 'route');
    this.scene.root.add(char.root);
    this.scene.collision.dynamic.push(a.collider);
    this.actors.push(a);
    this.placed.push({ x, z });
    return a;
  }

  _makeBallGame(a, b, soccer) {
    const bld = new StaticBuilder();
    if (soccer) { bld.sphere(0.11, '#FFFFFF', 0, 0, 0); bld.sphere(0.045, '#2E3440', 0, 0.09, 0.05); bld.sphere(0.045, '#2E3440', 0.08, -0.03, 0.05); }
    else bld.sphere(0.075, '#FFFFFF', 0, 0, 0);
    const mesh = bld.build();
    mesh.matrixAutoUpdate = true;
    const shadow = makeBlobShadow(0.3);
    const group = new THREE.Group();
    group.add(mesh);
    this.scene.root.add(group, shadow);
    const ball = { mesh: group, ball: mesh, shadow, from: a, to: b, t: 0, phase: 'hold', wait: 0.6 + Math.random(), soccer };
    a.ballGame = ball; b.ballGame = ball;
    this.balls.push(ball);
    a.char.setProp(null); b.char.setProp(null);
  }

  // ------------------------------------------------------------ queries
  actorFor(id) { return this.actors.find((a) => a.npc.id === id) || null; }

  /**
   * The actor for a classmate in this scene, spawning them near (x, z) when
   * they are not here (an activity moved scenes, a visitor arrives, …).
   */
  ensure(npc, x = 0, z = 0, yaw = 0) {
    const have = this.actorFor(npc.id);
    if (have) return have;
    this.placed = this.placed || [];
    const p = this.scene.collision.nearestFree(x, z, 0.3);
    return this._spawn({ n: npc, slot: null, zone: 'room' }, p.x, p.z, yaw, 'stand');
  }

  removeActor(a) {
    a.char.root.removeFromParent();
    a.char.dispose();
    this.scene.collision.dynamic = this.scene.collision.dynamic.filter((c) => c !== a.collider);
    this.actors = this.actors.filter((actor) => actor !== a);
    this.approachQueue = this.approachQueue.filter((q) => q.actor !== a);
  }

  nearby(actor, r) {
    const p = actor.char.root.position;
    return this.actors.filter((o) => o !== actor && !o.special && (o.char.root.position.x - p.x) ** 2 + (o.char.root.position.z - p.z) ** 2 < r * r);
  }

  /** Best actor to talk to near the player (in front preferred). */
  talkTarget(px, pz, yaw) {
    let best = null, bestScore = Infinity;
    for (const a of this.actors) {
      if (a.engaged) continue;
      const q = a.char.root.position;
      const d = Math.hypot(q.x - px, q.z - pz);
      if (d > 2.1) continue;
      const ang = Math.abs(angleDelta(yaw, Math.atan2(q.x - px, q.z - pz)));
      const s = d + ang * 0.5;
      if (s < bestScore) { bestScore = s; best = a; }
    }
    return best;
  }

  markerFor(a) {
    const w = this.game.world;
    if (a.special === 'visitor') return w.daily.visitor && !w.daily.visitor.done ? '❗' : '';
    if (a.special) return '';
    const id = a.npc.id;
    const lost = w.daily.lost;
    if (lost && lost.npcId === id && !w.daily.lostDone && w.period === lost.period) return '❗';
    if (w.planWith(id) && (w.planWith(id).loc === this.game.locationId)) return '⭐';
    if (w.save.flags.fd === 'start' && id === w.save.firstFriend) return '💬';
    if (w.save.flags.fd === 'introduced' && id === w.save.introNpc) return '💬';
    if (a.waiting) return '💬';
    if (openOffers(w.save).some((i) => i.template === 'delivery' && i.data?.accepted && i.data.target === id)) return '🎁';
    const { m, d } = w.date;
    if (a.npc.birthday.m === m && a.npc.birthday.d === d && w.knows(id, 'birthday') && !w.daily.wished[id]) return '🎂';
    return '';
  }

  // ------------------------------------------------------------ engagement
  engage(a) {
    if (!a || a.engaged) return;
    a.engaged = true;
    a.walk = null;
    a.waiting = null;
    a.savedMode = a.mode;
    if (a.char.base === 'sit') a.char.setBase('idle');
    a.char.stopGesture();
    a.char.lookAt(null);
    if (a.ballGame) { a.ballGame.paused = true; }
  }

  release(a) {
    if (!a || !a.engaged) return;
    a.engaged = false;
    const m = a.savedMode || a.mode;
    a.mode = m;
    const h = a.home;
    const back = () => {
      if (a.engaged) return;
      if (m === 'sit') { a.char.setPosition(h.x, h.z); a.char.setYaw(h.yaw); a.char.setBase('sit', { height: a.seatY }); }
      else if (m === 'chat' || m === 'stand' || m === 'ball' || m === 'search') { a.char.turnTo(a.center ? Math.atan2(a.center.x - h.x, a.center.z - h.z) : h.yaw); }
      if (m === 'search') a.char.hold('search');
      else if (a.gesture && m !== 'route') a.char.hold(a.gesture);
      if (a.ballGame) a.ballGame.paused = false;
    };
    const p = a.char.root.position;
    if (m !== 'route' && Math.hypot(p.x - h.x, p.z - h.z) > 0.4) this.walkTo(a, h.x, h.z, 1.6).then(back);
    else back();
  }

  walkTo(a, x, z, speed = 1.7) {
    return new Promise((resolve) => {
      if (a.char.base === 'sit') a.char.setBase('idle');
      a.walk = { x, z, speed, resolve, t: 0 };
    });
  }

  // ------------------------------------------------------------ update
  update(dt) {
    this.time += dt;
    const game = this.game;
    const pl = game.player;
    const px = pl.x, pz = pl.z;
    for (const a of this.actors) {
      const c = a.char;
      const pos = c.root.position;
      const dPlayer = Math.hypot(pos.x - px, pos.z - pz);
      c.lod = dPlayer > 24 ? 1 : 0;
      if (a.walk) {
        this._stepWalk(a, dt);
      } else if (a.waiting && !a.engaged) {
        this._stepWaiting(a, dt, dPlayer);
      } else if (!a.engaged) {
        if (a.mode === 'route') this._stepRoute(a, dt, dPlayer);
        else if (a.mode === 'chat') this._stepChat(a, dt);
        // Look at the player when close. Acquaintances say hello; friends wave.
        if (a.mode !== 'route' && a.mode !== 'ball') {
          if (dPlayer < 3.4 && game.mode === 'explore') {
            c.lookAt(px, 1, pz);
            if (!a.waved && !a.special && dPlayer < 3) this._greetNearby(a);
          } else c.lookAt(null);
        }
      }
      a.collider.x = pos.x; a.collider.z = pos.z;
      if (a.bubble) { a.bubble.t -= dt; if (a.bubble.t <= 0) a.bubble = null; }
      c.update(dt);
    }
    for (const b of this.balls) this._stepBall(b, dt);
    // Approaches
    if (this.approachQueue.length && game.mode === 'explore') {
      const q = this.approachQueue[0];
      const busy = game.activities.search || game.activities._directions;
      if (!q.scripted && busy) this.approachQueue.shift();
      else q.delay -= dt;
      if (this.approachQueue[0] === q && q.delay <= 0 && !q.started) {
        const a = q.actor;
        const w = game.world;
        // Soft approaches need a clear walk (no weaving between desks); otherwise skip quietly.
        if (!q.scripted) {
          const p0 = game.player, from = a.char.root.position;
          const ang0 = Math.atan2(from.x - p0.x, from.z - p0.z);
          const to = this.scene.collision.nearestFree(p0.x + Math.sin(ang0) * 1.6, p0.z + Math.cos(ang0) * 1.6, 0.3);
          if (!this._walkable(from.x, from.z, to.x, to.z)) { this.approachQueue.shift(); return; }
        }
        q.started = true;
        w.daily.approached[a.npc.id] = true;
        if (!q.scripted) noteApproach(w.save, w.day, a.npc.id);
        a.engaged = true;
        a.savedMode = a.mode;
        if (a.char.base === 'sit') a.char.setBase('idle');
        a.char.stopGesture();
        a.char.play(q.scripted ? 'wave' : styleGesture(a.npc, 'greet'), 1.4);
        a.bubble = { text: q.scripted ? '👋' : this._line(a, 'approach'), t: q.scripted ? 2.5 : 9 };
        const p = game.player;
        const ang = Math.atan2(a.char.root.position.x - p.x, a.char.root.position.z - p.z);
        const r = q.scripted ? 1.3 : 1.6;
        const s = this.scene.collision.nearestFree(p.x + Math.sin(ang) * r, p.z + Math.cos(ang) * r, 0.3);
        a.walk = {
          x: s.x, z: s.z, speed: 2.4, t: 0, resolve: () => {
            this.approachQueue.shift();
            a.engaged = false;
            if (q.scripted) {
              if (game.mode === 'explore') game.talkTo(a);
              else { a.engaged = true; this.release(a); }
              return;
            }
            // Soft approach: they came to see you and wait a little. Talking
            // opens what they came for; walking away is fine.
            a.waiting = { t: 8 };
            a.approached = true;
            a.char.faceToward(game.player.x, game.player.z, 6);
          },
        };
      }
    }
  }

  /** A friend visiting the player's room (home_visit): in through the door, over to the rug, a wave. */
  _arriveHome(e, k = 0) {
    const door = this.scene.spawns.door;
    const a = this._spawn(e, door.x + 0.2, door.z + 0.3 * k, -Math.PI / 2, 'stand', { plan: true });
    const spot = this.scene.collision.nearestFree(0.9 + k * 0.8, 1.1, 0.3);
    a.home = { x: spot.x, z: spot.z, yaw: Math.PI };
    this.walkTo(a, spot.x, spot.z, 1.8).then(() => {
      if (a.engaged) return;
      a.char.faceToward(this.game.player.x, this.game.player.z, 6);
      a.char.play('wave', 1.3);
      a.bubble = { text: `${this._line(a, 'hello')} 🏠`, t: 3 };
    });
    return a;
  }

  /** Can someone walk straight from A to B? (The first steps are ignored: a seated friend starts at their desk.) */
  _walkable(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    if (d < 0.9) return true;
    const t0 = Math.min(0.9, 0.7 / d);
    return this.scene.collision.clearLine(ax + (bx - ax) * t0, az + (bz - az) * t0, bx, bz, 0.22);
  }

  /** A short English bubble from the friend's style ("Hello!", "Rio! Over here!"). */
  _line(a, key) {
    return styleLine(a.npc, key, { name: this.game.world.save.player.name, period: this.game.world.period })?.en || '👋';
  }

  /** Level-dependent hello when the player walks past (once per scene visit). */
  _greetNearby(a) {
    const w = this.game.world;
    const lvl = w.level(a.npc.id);
    if (lvl < 1) return;
    a.waved = true;
    const sitting = a.mode === 'sit';
    if (lvl === 1) {
      // Acquaintance: a small nod and "Hello!".
      if (!sitting) a.char.play('nod', 1.0);
      a.bubble = { text: this._line(a, 'hello'), t: 2.2 };
      return;
    }
    // Friends wave (their own way; a 👋 bubble when seated); good friends and closer also say hi.
    if (!sitting) a.char.play(styleGesture(a.npc, 'greet'), 1.3);
    if (lvl >= 3) a.bubble = { text: `${this._line(a, 'hello')} 👋`, t: 2.2 };
    else if (sitting) a.bubble = { text: '👋', t: 1.6 };
  }

  _stepWaiting(a, dt, dPlayer) {
    const g = this.game;
    a.waiting.t -= dt;
    if (dPlayer < 6) a.char.lookAt(g.player.x, 1, g.player.z);
    if (a.waiting.t <= 0 || dPlayer > 6 || g.mode !== 'explore') {
      if (g.mode === 'talk' && a.engaged) return;
      a.waiting = null;
      a.approached = false;
      a.bubble = null;
      a.engaged = true;
      this.release(a);
    }
  }

  _stepWalk(a, dt) {
    const c = a.char;
    const p = c.root.position;
    const wk = a.walk;
    wk.t += dt;
    const dx = wk.x - p.x, dz = wk.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.12 || wk.t > 10) {
      a.walk = null;
      c.speed = 0;
      c.setBase('idle');
      wk.resolve?.();
      return;
    }
    const step = Math.min(d, wk.speed * dt);
    const r = this.scene.collision.resolve(p.x + (dx / d) * step, p.z + (dz / d) * step, 0.28, a);
    p.x = r.x; p.z = r.z;
    c.turnTo(Math.atan2(dx, dz), 10);
    c.speed = wk.speed;
    c.setBase('walk');
  }

  _stepRoute(a, dt, dPlayer) {
    const c = a.char;
    const p = c.root.position;
    const rt = a.route;
    const target = rt.pts[rt.i];
    const dx = target[0] - p.x, dz = target[1] - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) { rt.i = (rt.i + 1) % rt.pts.length; return; }
    // Pause politely if the player is right in front.
    const pl = this.game.player;
    const ahead = Math.hypot(pl.x - (p.x + (dx / d) * 0.8), pl.z - (p.z + (dz / d) * 0.8));
    if (ahead < 0.75) { c.speed = 0; c.setBase('idle'); c.lookAt(pl.x, 1, pl.z); return; }
    c.lookAt(null);
    const step = rt.speed * dt;
    const r = this.scene.collision.resolve(p.x + (dx / d) * step, p.z + (dz / d) * step, 0.28, a);
    p.x = r.x; p.z = r.z;
    c.turnTo(Math.atan2(dx, dz), 8);
    c.speed = rt.speed;
    c.setBase('walk');
    if (a.holdGesture && !c.gesture) c.hold(a.holdGesture);
    if (Math.random() < dt * 0.05 && a.bubbleEmoji) a.bubble = { text: a.bubbleEmoji, t: 2 };
  }

  _stepChat(a, dt) {
    a.chatT -= dt;
    if (a.chatT > 0) return;
    a.chatT = 2.5 + Math.random() * 4;
    const r = Math.random();
    if (r < 0.55) { a.char.play('talk', 1.8); a.char.setTalking(true); setTimeout(() => a.char.setTalking(false), 1500); a.bubble = { text: a.bubbleEmoji && Math.random() < 0.4 ? a.bubbleEmoji : CHAT_EMOJI[Math.floor(Math.random() * CHAT_EMOJI.length)], t: 2.2 }; }
    else if (r < 0.75) { a.char.play('happy', 1.0); a.char.setExpression('happy', 1.5); }
    else if (r < 0.85) a.char.play('nod', 1.0);
  }

  _stepBall(b, dt) {
    if (b.paused) return;
    const A = b.from.char.root.position, B = b.to.char.root.position;
    if (b.phase === 'hold') {
      b.wait -= dt;
      const hand = b.from.char.root.position;
      b.mesh.position.set(hand.x + Math.sin(b.from.char.yaw) * 0.35, b.soccer ? 0.11 : 0.95, hand.z + Math.cos(b.from.char.yaw) * 0.35);
      if (b.wait <= 0) {
        b.phase = 'fly'; b.t = 0;
        b.from.char.play(b.soccer ? 'kick' : 'throw', 0.6);
        b.start = b.mesh.position.clone();
      }
    } else {
      b.t += dt / (b.soccer ? 1.3 : 1.1);
      const t = Math.min(1, b.t);
      const end = new THREE.Vector3(B.x - Math.sin(b.to.char.yaw) * -0.35, b.soccer ? 0.11 : 0.95, B.z - Math.cos(b.to.char.yaw) * -0.35);
      end.x = B.x + Math.sin(b.to.char.yaw) * 0.35; end.z = B.z + Math.cos(b.to.char.yaw) * 0.35;
      b.mesh.position.lerpVectors(b.start, end, t);
      if (!b.soccer) b.mesh.position.y += Math.sin(t * Math.PI) * 1.4;
      b.ball.rotation.x += dt * 8;
      if (t >= 1) {
        b.to.char.play(b.soccer ? 'idle' : 'catch', 0.5);
        const f = b.from; b.from = b.to; b.to = f;
        b.phase = 'hold'; b.wait = 0.7 + Math.random() * 0.8;
      }
    }
    b.shadow.position.set(b.mesh.position.x, 0.02, b.mesh.position.z);
  }

  /** Move non-participants out of an activity area. */
  clearArea(x, z, r, keep = []) {
    for (const a of this.actors) {
      if (keep.includes(a) || a.special) continue;
      const p = a.char.root.position;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) {
        a.char.root.visible = false;
        a.hiddenForActivity = true;
        a.collider.r = 0;
        if (a.ballGame) { a.ballGame.mesh.visible = false; a.ballGame.shadow.visible = false; a.ballGame.paused = true; }
      }
    }
  }

  restoreArea() {
    for (const a of this.actors) {
      if (!a.hiddenForActivity) continue;
      a.char.root.visible = true; a.hiddenForActivity = false; a.collider.r = 0.3;
      if (a.ballGame) { a.ballGame.mesh.visible = true; a.ballGame.shadow.visible = true; a.ballGame.paused = false; }
    }
  }
}
