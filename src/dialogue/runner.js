// Conversation runner: frames the people talking, turns them to face each
// other, and exposes say()/ask() for the talk scripts.

import { wait } from '../core/util.js';

export const PLAYER_VOICE = { pitch: 1.3, rate: 0.9 };

export function hearts(level) { return '♥'.repeat(level) + '♡'.repeat(Math.max(0, 5 - level)); }

export class Conversation {
  static async start(game, actors, opts = {}) {
    const c = new Conversation(game, actors);
    await c._begin(opts);
    return c;
  }

  constructor(game, actors) {
    this.game = game;
    this.world = game.world;
    this.ui = game.dialogue;
    this.actors = actors.filter(Boolean);
    this.main = this.actors[0];
    this.done = new Set();
    this.ended = false;
    this.result = null;
  }

  get player() { return this.game.player; }
  get playerName() { return this.world.save.player.name; }

  async _begin({ frame = true } = {}) {
    this.game.setMode('talk');
    this.player.stop();
    for (const a of this.actors) this.game.npcs.engage(a);
    this.arrange();
    if (frame) this.frame();
    this.ui.open();
    await wait(420);
  }

  arrange() {
    const p = this.player.char;
    const chars = this.actors.map((a) => a.char);
    if (chars.length === 1) {
      const a = chars[0];
      p.faceToward(a.root.position.x, a.root.position.z, 7);
      a.faceToward(p.root.position.x, p.root.position.z, 7);
      a.lookAt(null);
    } else {
      const all = [p, ...chars];
      let cx = 0, cz = 0;
      for (const c of all) { cx += c.root.position.x; cz += c.root.position.z; }
      cx /= all.length; cz /= all.length;
      for (const c of all) c.faceToward(cx, cz, 7);
    }
  }

  frame() {
    const inTalk = new Set(this.actors);
    const occluders = this.game.npcs.actors.filter((a) => !inTalk.has(a) && a.char.root.visible).map((a) => a.char.root.position);
    this.game.camera.frameTalk([this.player.char, ...this.actors.map((a) => a.char)], { occluders });
  }

  /** Bring another NPC into the conversation (walks over first). */
  async join(actor) {
    if (!actor || this.actors.includes(actor)) return;
    this.game.npcs.engage(actor);
    const p = this.player.char.root.position;
    const m = this.main.char.root.position;
    // Stand to the side, completing a triangle.
    const dx = m.x - p.x, dz = m.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    const tx = (p.x + m.x) / 2 + nx * 1.15, tz = (p.z + m.z) / 2 + nz * 1.15;
    const spot = this.game.scene.collision.nearestFree(tx, tz, 0.3);
    await this.game.npcs.walkTo(actor, spot.x, spot.z, 4);
    this.actors.push(actor);
    this.arrange();
    this.frame();
    await wait(300);
  }

  async leave(actor) {
    this.actors = this.actors.filter((a) => a !== actor);
    this.game.npcs.release(actor);
    this.arrange();
    this.frame();
  }

  speakerInfo(who) {
    if (who === 'player') return { name: this.playerName, color: '#FF7A59', badge: '', char: this.player.char, voice: PLAYER_VOICE };
    if (who.special) return { name: who.npc.name, color: who.npc.color, badge: who.npc.role || '', char: who.char, voice: who.npc.voice };
    const lvl = this.world.level(who.npc.id);
    return { name: who.npc.name, color: who.npc.color, badge: lvl >= 1 ? hearts(lvl) : '?', char: who.char, voice: who.npc.voice };
  }

  /** NPC (or player) says a line. l: { en, ja, expr?, area? } */
  async say(who, l, { gesture = null, expr = null, auto = 0 } = {}) {
    if (!l) return;
    const info = this.speakerInfo(who);
    const ch = info.char;
    ch.setTalking(true);
    if (expr) ch.setExpression(expr, 3.5);
    if (gesture) ch.play(gesture, 1.5);
    else if (who !== 'player' && Math.random() < 0.55) ch.play('talk', 1.6);
    const talkMs = Math.max(700, l.en.length * 62);
    const stopTalk = setTimeout(() => ch.setTalking(false), talkMs);
    this.world.logLine(l, who === 'player' ? 'said' : 'heard');
    await this.ui.say({ name: info.name, color: info.color, badge: info.badge, en: l.en, ja: l.ja, voiceOpts: info.voice, player: who === 'player', auto });
    clearTimeout(stopTalk);
    ch.setTalking(false);
  }

  /**
   * Player answers with cards (or speech). Shows the chosen sentence as the
   * player's own line so the language stays on screen.
   */
  async ask(options, { prompt = null, banner = null, silent = false, columns = null } = {}) {
    const res = await this.ui.choose(options, { prompt, banner, columns });
    const o = res.option;
    const meta = { expr: o.expr, area: o.area, template: o.template, en: o.en, ja: o.ja };
    this.world.logLine(meta, 'said');
    if (res.via === 'speech') {
      this.world.logLine(meta, 'spoken');
      this.game.hud?.spoke();
    }
    if (!silent) {
      const ch = this.player.char;
      ch.setTalking(true);
      setTimeout(() => ch.setTalking(false), Math.max(600, o.en.length * 55));
      await this.ui.say({
        name: this.playerName, color: '#FF7A59', badge: res.via === 'speech' ? '🎤' : '',
        en: o.say || o.en, ja: o.ja, player: true,
        voiceOpts: res.via === 'speech' || !this.game.settings.readAnswers ? null : PLAYER_VOICE,
        auto: 1100,
      });
      ch.setTalking(false);
    }
    return o;
  }

  async end() {
    if (this.ended) return;
    this.ended = true;
    this.ui.close();
    for (const a of this.actors) this.game.npcs.release(a);
    this.game.camera.release();
    this.game.setMode('explore');
  }
}

/** Shorthand for an answer card. */
export function opt(id, en, ja, extra = {}) {
  return { id, en, ja, ...extra };
}
