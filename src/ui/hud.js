// Exploration HUD. Only essentials stay on screen: when/where, the current
// goal, the contextual action, and a few menu buttons. Big moments (new
// friend, level up, results, a new day) get their own card.

import { el, escapeHtml, wait, angleDelta } from '../core/util.js';
import { bus } from '../core/events.js';
import { sfx } from '../core/audio.js';
import { speech, MIC_REASON } from '../dialogue/speech.js';
import { LEVEL_NAMES, WEATHER, LOCATIONS, DAYS, MONTHS } from '../data/content.js';
import { hearts } from '../dialogue/runner.js';
import { ACT_INFO } from '../game/world.js';
import { instance, openOffers } from '../world/friendship.js';
import { eventTitle } from '../dialogue/events.js';
import { FRIEND_HOUSE_DOOR } from '../world/friendhouse.js';

/** What a plan is called: its friendship event's title, or the activity. */
function planInfo(w, plan) {
  const inst = plan.eventId ? instance(w.save, plan.eventId) : null;
  if (inst) { const t = eventTitle(w, inst); return { en: t.en, ja: t.ja, emoji: t.emoji, event: true }; }
  return ACT_INFO[plan.act] || { en: 'meet up', ja: '会う', emoji: '⭐' };
}

export class HUD {
  constructor(root, game) {
    this.game = game;
    this.root = el('div', { class: 'hud' });
    root.appendChild(this.root);
    const j = () => game.settings.japanese;
    this.j = j;

    // Time card
    this.timeCard = el('div', { class: 'timecard' });
    this.goal = el('button', { class: 'goal', hidden: true });
    this.goal.addEventListener('click', () => this.game.menus.open('map'));
    this.arrow = el('div', { class: 'goal-arrow', hidden: true }, [el('span', { class: 'arr' }, ['➤'])]);
    this.root.append(el('div', { class: 'hud-tl' }, [this.timeCard, this.goal]), this.arrow);

    // Menu buttons
    const btn = (id, icon, label, labelJa) => {
      const b = el('button', { class: 'hbtn', 'data-id': id, title: label }, [el('span', { class: 'ico' }, [icon]), el('span', { class: 'lbl' }, [label]), el('span', { class: 'badge', hidden: true })]);
      b.addEventListener('click', () => { sfx.open(); this.game.menus.open(id); });
      return b;
    };
    this.btns = {
      phone: btn('phone', '📱', 'Messages'),
      journal: btn('journal', '📖', 'Journal'),
      calendar: btn('calendar', '📅', 'Calendar'),
      map: btn('map', '🗺️', 'Map'),
      settings: btn('settings', '⚙️', 'Settings'),
    };
    this.mic = el('button', { class: 'micchip' });
    this.mic.addEventListener('click', () => this.toggleMic());
    this.root.append(el('div', { class: 'hud-tr' }, [this.mic, ...Object.values(this.btns)]));

    // Contextual action
    this.action = el('button', { class: 'action', hidden: true });
    this.action.addEventListener('click', () => this.game.interact());
    this.wait = el('button', { class: 'waitbtn', title: 'Advance time' }, ['⏩']);
    this.wait.addEventListener('click', () => this.game.askAdvance());
    this.root.append(this.action, el('div', { class: 'hud-br' }, [this.wait]));

    this.toasts = el('div', { class: 'toasts' });
    this.cardLayer = el('div', { class: 'cards-layer', hidden: true });
    this.flash = el('div', { class: 'flash' });
    this.banner = el('div', { class: 'locbanner' });
    root.append(this.toasts, this.cardLayer, this.flash, this.banner);

    this.queue = [];
    this.showingCard = false;
    this.manualGoal = null;
    this.activity = false;

    bus.on('met', ({ npcId, by }) => this.queueCard({ kind: 'met', npcId, by }));
    bus.on('levelup', ({ npcId, level }) => { if (level >= 2) this.queueCard({ kind: 'level', npcId, level }); });
    bus.on('fact', ({ npcId, factKey }) => this._factToast(npcId, factKey));
    bus.on('message', () => { this.refresh(); });
    bus.on('xp', ({ npcId, amount }) => this._xpPop(npcId, amount));
    bus.on('link', ({ a, b }) => {
      const w = this.game.world;
      if (!w.isKnown(a) && !w.isKnown(b)) return;
      this.toast({ icon: '🧑‍🤝‍🧑', en: `${w.npc(a)?.name} and ${w.npc(b)?.name} are friends.`, ja: '友達マップに追加！', quiet: true });
    });
    speech.onChange(() => this.renderMic());
    this.renderMic();
  }

  // ------------------------------------------------------------ refresh
  refresh() {
    const w = this.game.world;
    if (!w) return;
    const d = w.dayInfo;
    const { m, d: dd } = w.date;
    const p = w.periodInfo;
    const wx = WEATHER[w.weather];
    const loc = this.game.locationName();
    this.timeCard.innerHTML = `
      <div class="tc-day" style="--dc:${d.color}"><b>${d.short.toUpperCase()}</b><span>${m}/${dd}</span></div>
      <div class="tc-info"><div class="tc-period">${p.emoji} ${escapeHtml(p.en)}${this.j() ? ` <small>${p.ja}</small>` : ''}</div>
      <div class="tc-loc">${wx.emoji} ${escapeHtml(loc.en)}${this.j() ? ` <small>${escapeHtml(loc.ja)}</small>` : ''}</div></div>`;
    const unread = w.unread();
    const badge = this.btns.phone.querySelector('.badge');
    badge.hidden = !unread;
    badge.textContent = unread;
    this.wait.title = w.evening ? 'Go to bed' : 'Advance time';
    this.wait.textContent = w.evening ? '🛏️' : '⏩';
    this._renderGoal();
  }

  setActivity(on) {
    this.activity = on;
    this.root.classList.toggle('in-activity', on);
  }

  setGoal(goal) { this.manualGoal = goal; this._renderGoal(); }

  currentGoal() {
    if (this.manualGoal) return this.manualGoal;
    const w = this.game.world;
    const fd = w.save.flags.fd;
    const ff = w.npc(w.save.firstFriend), intro = w.npc(w.save.introNpc);
    if (fd === 'start' && ff) return { icon: '💬', en: `Talk to ${ff.name}`, ja: `${ff.name}に話しかけよう`, npc: ff.id };
    if (fd === 'introduced' && intro) return { icon: '💬', en: `Ask ${intro.name} about Saturdays, then invite ${intro.name}!`, ja: `${intro.name}に土曜日のことを聞いて、さそってみよう！`, npc: intro.id };
    if (w.schoolTime && ['musicroom', 'gym', 'artroom'].includes(this.game.sceneId)) return { icon: '🏫', en: 'Talk to classmates. Start class when you are ready!', ja: 'クラスメートと話そう。準備ができたら授業を始めよう！', target: this.game.scene.interact.find((it) => it.id === 'schoolLesson'), quiet: true };
    const plan = w.upcomingPlans()[0];
    if (plan?.loc === 'friendhouse') {
      const n = w.npc(plan.npcIds[0]);
      const now = plan.day === w.day && plan.period === w.period;
      return { icon: '🏡', en: now ? `Visit ${n.name}! Go to the house door.` : `Visit ${n.name}: ${DAYS[((plan.day % 7) + 7) % 7].en}`, ja: now ? `${n.name}の家のドアへ行こう！` : `${n.name}の家に遊びに行く約束`, loc: 'friendhouse', target: { ...FRIEND_HOUSE_DOOR, label: `${n.name}'s house` } };
    }
    if (plan && plan.day === w.day) {
      const n = w.npc(plan.npcIds[0]);
      const a = planInfo(w, plan);
      if (plan.period === w.period) return { icon: '⭐', en: `${a.emoji} Meet ${n.name} at ${LOCATIONS[plan.loc].en}`, ja: `${LOCATIONS[plan.loc].ja}で${n.name}に会おう`, loc: plan.loc, npc: n.id };
      if (w.schoolTime) return { icon: '🪑', en: `After school: ${a.event ? `${a.emoji} ${a.en}` : `${a.en} with ${n.name}`}. Sit at your desk to start class.`, ja: `放課後に${n.name}と約束！席にすわって授業を始めよう。`, desk: true };
    }
    // A present to deliver (kept in the save, so it survives a reload).
    const del = openOffers(w.save).find((i) => i.template === 'delivery' && i.data?.accepted);
    const target = del && w.npc(del.data.target);
    if (target && !w.evening) return { icon: '🎁', en: `Give the ${del.data.present.en} to ${target.name}`, ja: `${target.name}に${del.data.present.ja}をわたそう`, npc: target.id };
    if ((fd === 'played' || fd === 'planned') && w.evening) return { icon: '📖', en: 'Check your journal, then go to bed.', ja: '友達ノートを見て、ねよう。' };
    if (w.evening) return { icon: '🛏️', en: 'Read messages, then go to bed.', ja: 'メッセージを読んで、ねよう。' };
    if (w.schoolTime && fd !== 'start') return { icon: '🪑', en: 'Talk to classmates. Sit at your desk to start class.', ja: 'クラスメートと話そう。席にすわると授業が始まるよ。', desk: true, quiet: true };
    return null;
  }

  _renderGoal() {
    const g = this.currentGoal();
    this.goalNow = g;
    if (!g || this.activity) { this.goal.hidden = true; return; }
    this.goal.hidden = false;
    this.goal.classList.toggle('quiet', !!g.quiet);
    this.goal.innerHTML = `<span class="gi">${g.icon}</span><span><b>${escapeHtml(g.en)}</b>${this.j() && g.ja ? `<small>${escapeHtml(g.ja)}</small>` : ''}</span>`;
  }

  /** Arrow pointing toward the goal (town only). */
  updateArrow(camera) {
    const g = this.goalNow;
    const game = this.game;
    let target = null;
    if (g && !this.activity && game.mode === 'explore') {
      if (g.loc && game.sceneId === 'town') {
        if (g.loc === 'park' && game.locationId !== 'park') target = { x: 14, z: 13, label: 'Sakura Park' };
        if (g.loc === 'cafe') target = { x: -12, z: 7.5, label: 'Café' };
        if (g.loc === 'mall') target = { x: 25, z: -14, label: 'Niji Mall' };
      }
      if (g.target) target = g.target;
    }
    if (!target) { this.arrow.hidden = true; return; }
    const p = game.player;
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    if (d < 4) { this.arrow.hidden = true; return; }
    const camYaw = Math.atan2(camera.position.x - p.x, camera.position.z - p.z) + Math.PI;
    const ang = angleDelta(camYaw, Math.atan2(target.x - p.x, target.z - p.z));
    this.arrow.hidden = false;
    this.arrow.firstChild.style.transform = `rotate(${(ang * 180 / Math.PI) - 90}deg)`;
    this.arrow.dataset.label = `${target.label} · ${Math.round(d)}m`;
  }

  // ------------------------------------------------------------ action prompt
  prompt(t) {
    if (!t || this.activity) { this.action.hidden = true; this.promptTarget = null; return; }
    if (this.promptTarget === t.key) return;
    this.promptTarget = t.key;
    this.action.hidden = false;
    this.action.innerHTML = `<span class="ai">${t.icon}</span><span class="at"><b>${escapeHtml(t.en)}</b>${this.j() && t.ja ? `<small>${escapeHtml(t.ja)}</small>` : ''}</span><kbd>E</kbd>`;
    this.action.classList.remove('pop'); void this.action.offsetWidth; this.action.classList.add('pop');
  }

  // ------------------------------------------------------------ mic
  renderMic() {
    const st = speech.status;
    const map = {
      off: ['🎤', 'Mic OFF', 'off'], ready: ['🎤', 'Mic ON', 'on'], listening: ['🎙️', 'Listening', 'on live'],
      unavailable: ['🎤', 'No mic', 'na'], setup: ['🎤', 'Set up mic', 'off'],
    }[st] || ['🎤', 'Mic', 'off'];
    this.mic.className = `micchip ${map[2]}`;
    this.mic.innerHTML = `<span>${map[0]}</span><b>${map[1]}</b>`;
    this.mic.title = st === 'unavailable' ? (MIC_REASON[speech.reason]?.en || 'Speech input is not available here. Tap cards to answer.') : 'Turn the microphone on or off. Turning it off is always OK!';
  }

  async toggleMic() {
    const st = speech.status;
    if (st === 'unavailable') {
      this.toast({ icon: '🎤', en: MIC_REASON[speech.reason]?.en || 'Speech input is not available. Tap cards to answer!', ja: MIC_REASON[speech.reason]?.ja || 'カードをタップして答えてね！' });
      return;
    }
    if (st === 'setup') {
      this.toast({ icon: '⏬', en: 'Preparing speech input (one time)...', ja: '音声入力を準備しています…' });
      await speech.installLocal();
      if (speech.usable || speech.status === 'off') { speech.setUserOn(true); this.game.settings.mic = true; this.game.saveSettings(); }
      return;
    }
    const on = !speech.userOn;
    speech.setUserOn(on);
    this.game.settings.mic = on;
    this.game.saveSettings();
    if (on) sfx.micOn(); else sfx.micOff();
  }

  spoke() { this.toast({ icon: '🎤', en: 'Great speaking!', ja: 'じょうずに言えたね！', quiet: true }); }

  // ------------------------------------------------------------ toasts
  toast({ icon = '✨', en, ja = '', quiet = false, ms = 2600 }) {
    const t = el('div', { class: `toast${quiet ? ' quiet' : ''}` }, [el('span', { class: 'ti' }, [icon]), el('span', {}, [el('b', {}, [en]), this.j() && ja ? el('small', {}, [ja]) : null])]);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }

  _factToast(npcId, key) {
    if (key.startsWith('week')) return;
    sfx.discover();
    const n = this.game.world.npc(npcId);
    this.toast({ icon: '📖', en: `Journal: new note about ${n.name}!`, ja: `友達ノートに${n.name}のことを書いたよ！`, quiet: true, ms: 1800 });
  }

  _xpPop(npcId, amount) {
    if (amount <= 0) return;
    const a = this.game.npcs.actorFor(npcId);
    if (!a) return;
    a.bubble = { text: `💗+${amount}`, t: 1.4 };
  }

  planToast(plan) {
    if (!plan) return;
    const w = this.game.world;
    const n = w.npc(plan.npcIds[0]);
    const a = planInfo(w, plan);
    const day = plan.day === w.day ? 'Today' : DAYS[((plan.day % 7) + 7) % 7].en;
    const per = plan.period === 0 ? 'morning' : (((plan.day % 7) + 7) % 7) >= 5 ? 'afternoon' : 'after school';
    sfx.great();
    if (a.event) this.toast({ icon: a.emoji, en: `New plan! ${day} ${per}: ${a.en}`, ja: `約束ができた！${a.ja}`, ms: 3800 });
    else this.toast({ icon: '⭐', en: `New plan! ${day} ${per}: ${a.en} with ${n.name}`, ja: `約束ができた！${n.name}と${a.ja}`, ms: 3800 });
    this.refresh();
  }

  flashPhoto() {
    this.flash.classList.remove('go'); void this.flash.offsetWidth; this.flash.classList.add('go');
  }

  location(name) {
    this.banner.innerHTML = `<b>${escapeHtml(name.en)}</b>${this.j() ? `<small>${escapeHtml(name.ja)}</small>` : ''}`;
    this.banner.classList.remove('show'); void this.banner.offsetWidth; this.banner.classList.add('show');
  }

  // ------------------------------------------------------------ cards
  queueCard(c) { this.queue.push(c); this.pump(); }

  async pump() {
    if (this.showingCard || !this.queue.length) return;
    if (this.game.mode !== 'explore' || this.game.menus?.isOpen) { setTimeout(() => this.pump(), 400); return; }
    this.showingCard = true;
    const c = this.queue.shift();
    try { await this._card(c); } finally { this.showingCard = false; this.pump(); }
  }

  async _card(c) {
    const w = this.game.world;
    if (c.kind === 'met' || c.kind === 'level') {
      const n = w.npc(c.npcId);
      if (!n) return;
      const lvl = c.kind === 'met' ? 1 : c.level;
      const L = LEVEL_NAMES[lvl];
      const img = this.game.portrait(n);
      sfx.levelUp();
      const title = c.kind === 'met' ? 'New friend!' : 'Connection up!';
      const titleJa = c.kind === 'met' ? '新しい友達！' : 'なかよし度アップ！';
      const perks = { 2: ['Friends can invite you to play.', '遊びにさそってくれるようになるよ。'], 3: ['Ask where they want to go!', '行きたい場所を聞いてみよう！'], 4: [`${n.name} will come to say hi!`, `${n.name}から話しかけてくれるよ！`], 5: ['Best friends! 🎉', '親友になった！'] }[lvl];
      await this.showCard(`
        <div class="bigcard level">
          <div class="bc-title">${title}${this.j() ? `<small>${titleJa}</small>` : ''}</div>
          <div class="bc-portrait" style="--c:${n.color}"><img src="${img}" alt=""></div>
          <div class="bc-name">${escapeHtml(n.name)}</div>
          <div class="bc-hearts">${hearts(lvl)}</div>
          <div class="bc-level">Lv ${lvl} · ${L.en}${this.j() ? ` <small>${L.ja}</small>` : ''}</div>
          ${perks ? `<div class="bc-perk">✨ ${escapeHtml(perks[0])}${this.j() ? `<small>${escapeHtml(perks[1])}</small>` : ''}</div>` : ''}
        </div>`, 'Yay!');
    }
  }

  /** Show a modal card; resolves when continued. */
  showCard(html, btnLabel = 'OK') {
    return new Promise((resolve) => {
      const token = (this.cardToken = (this.cardToken || 0) + 1);
      clearTimeout(this.cardHideTimer);
      this.cardLayer.classList.remove('out');
      this.cardLayer.hidden = false;
      this.cardLayer.innerHTML = html;
      const b = el('button', { class: 'bc-btn' }, [btnLabel]);
      this.cardLayer.firstElementChild.appendChild(b);
      const prevMode = this.game.mode;
      this.game.setMode('results');
      const shownAt = performance.now();
      let done = false;
      const onKey = (e) => {
        if (!['Space', 'Enter', 'KeyE', 'Escape'].includes(e.code)) return;
        e.preventDefault();
        e.stopPropagation();
        // Ignore the key press that may still be held from the last dialogue line.
        if (performance.now() - shownAt < 350) return;
        finish();
      };
      const finish = () => {
        if (done) return;
        done = true;
        sfx.click();
        window.removeEventListener('keydown', onKey, true);
        this.cardLayer.classList.add('out');
        this.cardHideTimer = setTimeout(() => {
          if (this.cardToken !== token) return;
          this.cardLayer.hidden = true;
          this.cardLayer.classList.remove('out');
          this.cardLayer.innerHTML = '';
        }, 250);
        if (this.game.mode === 'results') this.game.setMode(prevMode === 'results' ? 'explore' : prevMode);
        resolve();
      };
      window.addEventListener('keydown', onKey, true);
      b.addEventListener('click', finish);
    });
  }

  async results({ act, title, npcs, before, result, souvenir, photo }) {
    const w = this.game.world;
    const rows = npcs.map((n) => {
      const pr = w.progress(n.id);
      const up = w.level(n.id) > before[n.id];
      return `<div class="rs-row"><img src="${this.game.portrait(n)}" alt=""><div><b>${escapeHtml(n.name)}</b> <span class="hearts">${hearts(w.level(n.id))}</span>
        <div class="bar"><i style="width:${Math.round(pr.frac * 100)}%"></i></div>${up ? `<span class="up">Lv ${w.level(n.id)} ${LEVEL_NAMES[w.level(n.id)].en}!</span>` : ''}</div></div>`;
    }).join('');
    sfx.great();
    while (this.showingCard) await wait(200);
    this.showingCard = true;
    await this.showCard(`
      <div class="bigcard results">
        <div class="bc-title">${escapeHtml(title.en)}${this.j() ? `<small>${escapeHtml(title.ja)}</small>` : ''}</div>
        ${photo ? `<div class="polaroid"><img src="${photo}" alt=""><span>${escapeHtml(result.phrase || '')}</span></div>` : ''}
        ${rows}
        ${souvenir ? `<div class="bc-perk">🎁 New souvenir for your room!${this.j() ? '<small>部屋にかざる思い出の品をもらった！</small>' : ''}</div>` : ''}
      </div>`, 'Continue');
    this.showingCard = false;
    // Level-up cards that happened during the activity show once exploring again.
  }

  /** Full-screen card between periods / days. */
  async transition({ icon, title, sub, ja = '', ms = 1700 }) {
    const t = el('div', { class: 'transition' }, [
      el('div', { class: 'tr-inner' }, [el('div', { class: 'tr-icon' }, [icon]), el('div', { class: 'tr-title' }, [title]), el('div', { class: 'tr-sub' }, [sub]), this.j() && ja ? el('div', { class: 'tr-ja' }, [ja]) : null]),
    ]);
    document.getElementById('ui').appendChild(t);
    sfx.whoosh();
    await wait(60);
    t.classList.add('in');
    await wait(ms);
    t.classList.add('out');
    await wait(450);
    t.remove();
  }
}
