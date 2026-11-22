// Shared recovery after an activity, interaction or scene change fails.
// Nothing is rewarded here: the caller has already decided the outcome. This
// only returns the game to a usable explore state without reloading the page.

import { ArcadeScreen } from '../ui/arcadescreen.js';
import { speech } from '../dialogue/speech.js';
import { endEvent } from '../world/friendship.js';

// Temporary DOM that activities add to the UI root.
const TEMP_UI = '.act-temp, .sketch, .arc, .mall-meal-skip';

/** Register a disposer that runs when the current activity ends (success or failure). */
export function onActivityCleanup(game, fn) {
  (game.activityCleanup ||= []).push(fn);
}

/** Run and clear every registered disposer. Each one is isolated. */
export function runActivityCleanup(game) {
  const list = game.activityCleanup || [];
  game.activityCleanup = [];
  for (const fn of list.reverse()) {
    try { fn(); } catch (err) { console.error('[cleanup]', err); }
  }
}

const safe = (fn) => { try { fn(); } catch (err) { console.error('[recover]', err); } };

/**
 * Restore controls, camera, HUD, characters and temporary objects.
 * `actors` are the NPC actors who took part; `event` an active friendship
 * event instance (its pending plan and instance are kept for a retry).
 */
export function recoverGame(game, { actors = [], event = null, toast = true } = {}) {
  safe(() => game.activityAbort?.(new Error('recovered')));
  game.activityTick = null;
  game.activityMove = null;
  game.activityAbort = null;
  safe(() => runActivityCleanup(game));
  safe(() => ArcadeScreen.closeAll());
  safe(() => game.uiRoot.querySelectorAll(TEMP_UI).forEach((n) => n.remove()));
  safe(() => game.activityHud.hide());
  safe(() => game.dialogue.close());
  safe(() => speech.abort?.());
  safe(() => game.fadeEl?.classList.remove('on'));
  safe(() => game.input?.release());
  game.extraInteract = [];
  game.sparkles = [];
  game.sitting = false;
  game._floorTravel = false;
  game.saveHold = false;
  safe(() => {
    const ch = game.player.char;
    ch.setProp(null);
    ch.setBase('idle');
    ch.stopGesture?.();
    game.player.stop?.();
  });
  for (const a of actors) {
    safe(() => { a.char.setProp(null); a.char.setBase('idle'); a.char.stopGesture?.(); });
    safe(() => game.npcs.release(a));
  }
  safe(() => game.npcs.restoreArea());
  if (event) safe(() => endEvent(game.world.save, event.id));
  safe(() => {
    game.camera.release();
    if (game.scene) game.camera.configure(game.scene.camera, game.player.char, game.scene.collision);
  });
  safe(() => game.hud.setActivity(false));
  safe(() => game.setMode('explore'));
  safe(() => game.hud.refresh());
  if (toast) safe(() => game.hud.toast({ icon: '🔧', en: "Oops! Something went wrong. Let's try again later!", ja: 'あれ？うまくいかなかった。あとでもう一度やってみよう！', ms: 4000 }));
  game.lastRecovery = { at: Date.now(), event: event?.id || null };
}
