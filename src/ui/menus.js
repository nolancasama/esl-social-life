// Menu sheets: Messages, Journal, Calendar, Map, Settings, Town board,
// Timetable, Memories. One sheet at a time; the game pauses underneath.

import { el, escapeHtml } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { loadPhotos } from '../core/store.js';
import { LEVEL_NAMES, DAYS, MONTHS, WEATHER, LANGUAGE_AREAS, ATTRACTIONS, TIMETABLE, SUBJECTS, LOCATIONS, interest, ability, dateText } from '../data/content.js';
import { factSentence, FACT_ORDER, P } from '../dialogue/lines.js';
import { hearts } from '../dialogue/runner.js';
import { ACT_INFO } from '../game/world.js';
import { dateOf, dayFor, dow as dowOf, isWeekend, isFreeTime } from '../world/time.js';
import { actPhrase3 } from '../world/schedule.js';
import { voice } from '../dialogue/voice.js';
import { VISITORS } from '../data/content.js';
import { openOffer, openOffers, hobbyOptions, scheduleEvent, declineEvent, nextEventSlot } from '../world/friendship.js';
import { planOuting } from '../dialogue/outing.js';
import { eventTitle } from '../dialogue/events.js';
import { whenPhrase } from '../dialogue/common.js';

/**
 * The gentle "what next?" line on a friend's journal page. Shows plans and
 * open events first, explains a full bar that isn't levelling up, and
 * otherwise suggests something this friend enjoys (only once you know it).
 */
function nextStep(w, n) {
  const id = n.id;
  const lvl = w.level(id);
  const open = openOffer(w.save, id);
  if (open?.status === 'scheduled' && open.slot) {
    const t = eventTitle(w, open), wp = whenPhrase(w, open.slot), L = LOCATIONS[open.slot.loc] || LOCATIONS.park;
    return { icon: t.emoji, en: `${t.en}: ${wp.en} at ${L.the}.`, ja: `${t.ja}：${wp.ja}${L.ja}で。` };
  }
  const del = openOffers(w.save).find((i) => i.template === 'delivery' && i.data?.accepted && i.npcId === id);
  const target = del && w.npc(del.data.target);
  if (target) return { icon: '🎁', en: `Give the ${del.data.present.en} to ${target.name}.`, ja: `${target.name}に${del.data.present.ja}をわたそう。` };
  if (open) return { icon: '💬', en: `${n.name} has an idea for you. Go and talk!`, ja: `${n.name}から話があるみたい。話しかけてみよう！` };
  const plan = w.upcomingPlans().find((p) => p.npcIds.includes(id));
  if (plan) {
    const a = ACT_INFO[plan.act] || { en: 'meet up', emoji: '⭐', ja: '会う' };
    const wp = whenPhrase(w, plan);
    return { icon: '⭐', en: `Plan: ${a.en} ${wp.en}.`, ja: `約束：${wp.ja}${a.ja}。` };
  }
  if (lvl < 2) return { icon: '💬', en: `Talk with ${n.name} and learn more!`, ja: `${n.name}と話して、もっと知ろう！` };
  if (lvl >= 5) return { icon: '🌟', en: `${n.name} is your best friend!`, ja: `${n.name}は親友！` };
  const gate = 2 + Math.min(3, (w.rel(id).memories || []).length);
  if (lvl >= gate && w.progress(id).frac >= 1) return { icon: '📸', en: 'Do something together, just you two!', ja: 'ふたりで何かいっしょにしよう！' };
  const h = hobbyOptions(n, 'sunny').find((o) => o.like && w.knows(id, `like:${n.likes.indexOf(o.like)}`));
  if (h) { const it = interest(h.like); return { icon: it.emoji, en: `${n.name} wants to ${it.verb} with you.`, ja: `${n.name}は、いっしょに${it.jaWant}みたい。` }; }
  return { icon: '💡', en: `Invite ${n.name} to do something fun!`, ja: `${n.name}をさそってみよう！` };
}

/** One line for the memory timeline: what you did, built from the stored memory. */
function memoryCaption(m) {
  const d = m.detail || {};
  if (m.type === 'help') return `🔍 Found the ${d.item || 'lost thing'}`;
  if (d.label?.en) return `${d.label.emoji || '⭐'} ${d.label.en.replace(/!$/, '')}`;
  if (m.type === 'event' && d.recall?.en) return `⭐ ${d.recall.en}`;
  if (m.act === 'cafe') return `☕ Café Komorebi${d.foodEn ? ` (${d.foodEn})` : ''}`;
  if (m.act === 'soccer') return '⚽ Soccer at Sakura Park';
  if (m.act === 'catch') return '⚾ Playing catch at the park';
  return `${ACT_INFO[m.act]?.emoji || '⭐'} ${ACT_INFO[m.act]?.en || 'Time together'}`;
}

const TITLES = {
  phone: ['📱 Messages', 'メッセージ'], journal: ['📖 Friendship Journal', '友達ノート'], calendar: ['📅 Calendar', 'カレンダー'],
  map: ['🗺️ Map', '地図'], settings: ['⚙️ Settings', '設定'], board: ["🗾 Let's go!", '行ってみよう！'], timetable: ['🗓️ Timetable', '時間わり'],
  shelf: ['🧸 Memories', '思い出'],
};

export class Menus {
  constructor(root, game) {
    this.game = game;
    this.root = el('div', { class: 'sheet-wrap', hidden: true });
    this.sheet = el('div', { class: 'sheet' });
    this.root.appendChild(this.sheet);
    root.appendChild(this.root);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => {
      if (this.root.hidden) return;
      if (e.code === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.current = null;
  }

  get isOpen() { return !this.root.hidden; }
  get j() { return this.game.settings.japanese; }

  open(id, opts = {}) {
    if (this.game.mode !== 'explore' && !opts.force) return;
    this.current = id;
    this.root.hidden = false;
    this.prevMode = this.game.mode;
    this.game.setMode('menu');
    this.game.player.stop();
    this.render(opts);
  }

  close() {
    if (this.root.hidden) return;
    sfx.close();
    this.root.hidden = true;
    this.sheet.innerHTML = '';
    if (this.game.mode === 'menu') this.game.setMode('explore');
    this.current = null;
    this.game.hud.refresh();
    this.game.onMenuClosed?.();
  }

  render(opts = {}) {
    const [t, tj] = TITLES[this.current] || ['', ''];
    this.sheet.className = `sheet sheet-${this.current}`;
    this.sheet.innerHTML = '';
    const close = el('button', { class: 'sheet-close', 'aria-label': 'Close' }, ['✕']);
    close.addEventListener('click', () => this.close());
    const head = el('div', { class: 'sheet-head' }, [el('h2', {}, [t, this.j ? el('small', {}, [tj]) : null]), close]);
    const body = el('div', { class: 'sheet-body' });
    this.sheet.append(head, body);
    this.body = body;
    const fn = {
      phone: () => this.phone(), journal: () => this.journal(opts.tab || 'friends', opts.npc), calendar: () => this.calendar(opts.month), map: () => this.map(),
      settings: () => this.settings(), board: () => this.board(), timetable: () => this.timetable(), shelf: () => this.memories(),
    }[this.current];
    fn?.();
  }

  // ------------------------------------------------------------ phone
  phone() {
    const w = this.game.world;
    const msgs = w.save.messages;
    // Plan an outing with friends (group outings, Phase 2).
    const mk = el('button', { class: 'plan-btn' }, ['📅 Make a plan with friends', this.j ? el('small', {}, ['友達と約束をする']) : null]);
    mk.addEventListener('click', async () => { this.close(); await planOuting(this.game); this.game.hud.refresh(); });
    this.body.appendChild(el('div', { class: 'plan-row' }, [mk]));
    if (!msgs.length) {
      this.body.appendChild(el('div', { class: 'empty' }, ['No messages yet. Make friends, and they will write to you!', this.j ? el('small', {}, ['まだメッセージはないよ。友達ができるとメッセージが来るよ！']) : null]));
      return;
    }
    for (const m of msgs) {
      const n = w.npc(m.from);
      if (!n) continue;
      const wasUnread = !m.read;
      m.read = true;
      const card = el('div', { class: `msg${wasUnread ? ' new' : ''}` });
      const day = DAYS[dowOf(m.day)];
      card.innerHTML = `<img class="msg-pic" src="${this.game.portrait(n)}" alt=""><div class="msg-main"><div class="msg-from"><b>${escapeHtml(n.name)}</b> <span>${day.short} ${dateOf(m.day).m}/${dateOf(m.day).d}</span></div>
        <div class="msg-bubble">${escapeHtml(m.en)}${this.j && m.ja ? `<small>${escapeHtml(m.ja)}</small>` : ''}</div></div>`;
      const main = card.querySelector('.msg-main');
      if (m.kind === 'invite' && m.invite) {
        const inv = m.invite;
        const row = el('div', { class: 'msg-replies' });
        // An event invitation (a home visit) can only be answered while that event is still open.
        const stillOpen = !inv.eventId || openOffers(w.save).some((i) => i.id === inv.eventId && i.status === 'offered');
        if (inv.status === 'pending' && inv.day >= w.day && stillOpen) {
          const reply = (en, ja, fn, tone = '') => { const b = el('button', { class: `reply ${tone}` }, [en, this.j ? el('small', {}, [ja]) : null]); b.addEventListener('click', fn); row.appendChild(b); };
          // Event invitations (home visits) go on the calendar through the event; group ones book everyone.
          const book = (day, period) => (inv.eventId
            ? scheduleEvent(w, inv.eventId, { day, period, loc: inv.loc, act: inv.act })
            : w.addPlan({ npcIds: [n.id, ...(inv.with || [])], day, period, loc: inv.loc, act: inv.act, source: 'invite' }));
          reply("Sure! Let's go!", 'いいよ！行こう！', () => {
            const plan = book(inv.day, inv.period);
            if (!plan) { this.game.hud.toast({ icon: '📅', en: 'You already have a plan then. Try "How about another day?"', ja: 'その時は予定があるよ。ほかの日にしよう。' }); return; }
            inv.status = 'accepted';
            w.logLine({ expr: 'a.sure', area: 'wantto', en: "Sure! Let's go!", template: "Sure! Let's go!" }, 'said');
            w.xp(n.id, 1, { key: `invite:${m.id}`, reason: 'invite' });
            this.game.hud.planToast(plan);
            this.game.save();
            this.render();
          }, 'go');
          reply("Sorry, I can't.", 'ごめん、行けないんだ。', () => {
            inv.status = 'declined';
            if (inv.eventId) declineEvent(w.save, inv.eventId, w.day);
            w.logLine({ expr: 'a.sorry', area: 'wantto', en: "Sorry, I can't.", template: "Sorry, I can't." }, 'said');
            w.addMessage({ from: n.id, kind: 'reply', en: "OK! Maybe next time! 😊", ja: 'オッケー！また今度ね！', read: true });
            this.game.save();
            this.render();
          });
          reply('How about another day?', 'ほかの日はどう？', () => {
            row.innerHTML = '';
            const opts = [];
            let d = inv.day;
            for (let k = 0; k < 3; k++) {
              const s = nextEventSlot(w, [n.id, ...(inv.with || [])], { fromDay: d + 1, fromPeriod: 0 }) || w.nextFreeSlot(n.id, d + 1, 0);
              opts.push(s); d = s.day;
            }
            for (const s of opts) {
              const dd = DAYS[dowOf(s.day)];
              const label = `How about ${dd.en}?`;
              const b = el('button', { class: 'reply' }, [label, this.j ? el('small', {}, [`${dd.ja}はどう？`]) : null]);
              b.addEventListener('click', () => {
                const plan = book(s.day, s.period);
                if (!plan) return;
                inv.status = 'rescheduled';
                w.logLine({ expr: 'a.howabout', area: 'weekly', en: label, template: 'How about (day)?' }, 'said');
                w.addMessage({ from: n.id, kind: 'reply', en: `OK! See you on ${dd.en}! 🙌`, ja: `オッケー！${dd.ja}に会おうね！`, read: true });
                this.game.hud.planToast(plan);
                this.game.save();
                this.render();
              });
              row.appendChild(b);
            }
          });
        } else {
          row.appendChild(el('div', { class: 'msg-status' }, [{ accepted: '✅ You said yes!', declined: '🙂 Maybe next time', rescheduled: '📅 Another day', pending: '⌛ This day has passed' }[inv.status] || '']));
        }
        main.appendChild(row);
      }
      if (m.kind === 'missed' && m.offer && !m.done) {
        const row = el('div', { class: 'msg-replies' });
        const s = w.nextFreeSlot(n.id, w.day + 1, 0, { weekendFirst: true });
        const dd = DAYS[dowOf(s.day)];
        const b = el('button', { class: 'reply go' }, [`Let's play on ${dd.en}!`, this.j ? el('small', {}, [`${dd.ja}に遊ぼう！`]) : null]);
        b.addEventListener('click', () => {
          m.done = true;
          const plan = w.addPlan({ npcIds: [n.id], day: s.day, period: s.period, loc: m.offer.loc, act: m.offer.act, source: 'invite' });
          w.addMessage({ from: n.id, kind: 'reply', en: 'Yay! See you then! 😄', ja: 'やった！じゃあね！', read: true });
          this.game.hud.planToast(plan);
          this.game.save();
          this.render();
        });
        row.appendChild(b);
        main.appendChild(row);
      }
      this.body.appendChild(card);
    }
    this.game.save();
  }

  // ------------------------------------------------------------ journal
  journal(tab = 'friends', npcId = null) {
    const tabs = [['friends', '🧑‍🤝‍🧑 Friends', '友達'], ['network', '🕸️ Friend map', '友達マップ'], ['phrases', '💬 My English', '英語メモ'], ['memories', '📸 Memories', '思い出'], ['me', '🙋 Me', 'わたし']];
    const bar = el('div', { class: 'tabs' });
    for (const [id, en, ja] of tabs) {
      const b = el('button', { class: `tab${id === tab ? ' on' : ''}` }, [en, this.j ? el('small', {}, [ja]) : null]);
      b.addEventListener('click', () => { sfx.click(); this.body.innerHTML = ''; this.journal(id); });
      bar.appendChild(b);
    }
    this.body.appendChild(bar);
    const pane = el('div', { class: 'tabpane' });
    this.body.appendChild(pane);
    if (tab === 'friends') npcId ? this.friendDetail(pane, npcId) : this.friendsGrid(pane);
    if (tab === 'network') this.network(pane);
    if (tab === 'phrases') this.phrases(pane);
    if (tab === 'memories') this.memories(pane);
    if (tab === 'me') this.me(pane);
  }

  friendsGrid(pane) {
    const w = this.game.world;
    // Ordered by when you met them — never ranked by level.
    const known = w.known().sort((a, b) => (w.rel(a.id).metDay ?? -9) - (w.rel(b.id).metDay ?? -9));
    const heard = (w.save.heard || []).map((id) => w.npc(id)).filter((n) => n && !w.isKnown(n.id));
    const grid = el('div', { class: 'fgrid' });
    for (const n of known) {
      const pr = w.progress(n.id);
      const c = el('button', { class: 'fcard', style: `--c:${n.color}` });
      c.innerHTML = `<img src="${this.game.portrait(n)}" alt=""><b>${escapeHtml(n.name)}</b><span class="hearts">${hearts(pr.level)}</span><span class="lv">${LEVEL_NAMES[pr.level].en}</span><div class="bar"><i style="width:${Math.round(pr.frac * 100)}%"></i></div>`;
      c.addEventListener('click', () => { sfx.click(); pane.innerHTML = ''; this.friendDetail(pane, n.id); });
      grid.appendChild(c);
    }
    for (const n of heard) {
      const c = el('div', { class: 'fcard heard' });
      c.innerHTML = `<div class="sil">?</div><b>${escapeHtml(n.name)}</b><span class="lv">Not met yet</span>`;
      grid.appendChild(c);
    }
    const unknownCount = w.npcs.length - known.length - heard.length;
    if (unknownCount > 0) {
      const c = el('div', { class: 'fcard heard' });
      c.innerHTML = `<div class="sil">+${unknownCount}</div><b>Classmates</b><span class="lv">Say hello!</span>`;
      grid.appendChild(c);
    }
    pane.appendChild(grid);
    pane.appendChild(el('p', { class: 'note' }, ['Everyone in the game is a made-up character. Your friendship levels are just for you.', this.j ? el('small', {}, ['ゲームの中の人物はみんな作られたキャラクターです。なかよし度はあなただけのものです。']) : null]));
  }

  friendDetail(pane, id) {
    const w = this.game.world;
    const n = w.npc(id);
    const pr = w.progress(id);
    const back = el('button', { class: 'back' }, ['‹ Friends']);
    back.addEventListener('click', () => { pane.innerHTML = ''; this.friendsGrid(pane); });
    pane.appendChild(back);
    const head = el('div', { class: 'fd-head', style: `--c:${n.color}` });
    head.innerHTML = `<img src="${this.game.portrait(n)}" alt=""><div><h3>${escapeHtml(n.name)}</h3><div class="hearts big">${hearts(pr.level)}</div>
      <div class="lv">Lv ${pr.level} · ${LEVEL_NAMES[pr.level].en}${this.j ? ` <small>${LEVEL_NAMES[pr.level].ja}</small>` : ''}</div><div class="bar"><i style="width:${Math.round(pr.frac * 100)}%"></i></div></div>`;
    pane.appendChild(head);
    const ns = nextStep(w, n);
    pane.appendChild(el('div', { class: 'nextstep' }, [el('span', { class: 'ns-i' }, [ns.icon]), el('span', {}, [ns.en, this.j ? el('small', {}, [ns.ja]) : null])]));
    const cols = el('div', { class: 'fd-cols' });
    // Facts
    const facts = el('div', { class: 'fd-box' }, [el('h4', {}, ['What I know', this.j ? el('small', {}, ['知っていること']) : null])]);
    const known = FACT_ORDER.filter((k) => w.knows(id, k) && !k.startsWith('week'));
    if (w.knows(id, 'adj')) known.push('adj');
    for (const k of known) {
      const s = factSentence(n, k, w);
      const row = el('div', { class: 'fact' }, [el('span', { class: 'fe' }, [s.emoji || '•']), el('span', {}, [s.en, this.j ? el('small', {}, [s.ja]) : null])]);
      row.addEventListener('click', () => voice.speak(s.en));
      facts.appendChild(row);
    }
    if (!known.length) facts.appendChild(el('div', { class: 'empty small' }, ['Ask questions to learn more!']));
    const hints = [];
    if (![0, 1, 2].every((i) => w.knows(id, `like:${i}`))) hints.push('What do you like?');
    if (![0, 1].every((i) => w.knows(id, `can:${i}`))) hints.push('What can you do?');
    if (!w.knows(id, 'week:5')) hints.push('What do you do on Saturdays?');
    if (pr.level >= 2 && !w.knows(id, 'birthday')) hints.push('When is your birthday?');
    if (hints.length) facts.appendChild(el('div', { class: 'tryask' }, ['❓ Try asking: ', el('b', {}, [hints.slice(0, 2).join('  /  ')])]));
    cols.appendChild(facts);
    // Week
    const week = el('div', { class: 'fd-box' }, [el('h4', {}, [`${n.name}'s week`, this.j ? el('small', {}, ['1週間']) : null])]);
    const grid = el('div', { class: 'weekgrid' });
    for (let d = 0; d < 7; d++) {
      const k = w.knows(id, `week:${d}`);
      const slot = n.schedule[d][w.primaryPeriodFor(n, d)];
      const ph = actPhrase3(slot.act, P(n).p);
      const cell = el('div', { class: `wd${k ? ' known' : ''}${d === w.dow ? ' today' : ''}`, title: k ? `${n.name} ${ph.en}` : '?' }, [el('b', {}, [DAYS[d].short]), el('span', {}, [k ? ph.emoji : '?']), el('small', {}, [k ? (LOCATIONS[slot.loc]?.en || '') : ''])]);
      grid.appendChild(cell);
    }
    week.appendChild(grid);
    const knownDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => w.knows(id, `week:${d}`));
    for (const d of knownDays.slice(0, 3)) { const s = factSentence(n, `week:${d}`, w); week.appendChild(el('div', { class: 'fact small' }, [s.en])); }
    // Friends of this NPC (discovered)
    const fr = w.friendsOf(id).filter((o) => w.npcLinkKnown(id, o.id));
    if (fr.length) week.appendChild(el('div', { class: 'fd-friends' }, ['🧑‍🤝‍🧑 Friends: ', ...fr.map((o) => el('b', {}, [o.name + ' ']))]));
    cols.appendChild(week);
    pane.appendChild(cols);
    // Memories with this friend
    const photos = loadPhotos(w.save.id).filter((p) => (p.npcIds || []).includes(id)).slice(0, 4);
    const mems = w.memoriesWith(id).slice(0, 8);
    if (photos.length || mems.length) {
      const box = el('div', { class: 'fd-box' }, [el('h4', {}, ['Memories together', this.j ? el('small', {}, ['いっしょの思い出']) : null])]);
      if (photos.length) {
        const row = el('div', { class: 'photorow' });
        for (const p of photos) row.appendChild(el('div', { class: 'polaroid sm' }, [el('img', { src: p.url, alt: '' }), el('span', {}, [p.caption])]));
        box.appendChild(row);
      }
      // A readable history, newest first: when, and what you did together.
      const tl = el('div', { class: 'timeline' });
      for (const m of mems) {
        const dt = dateOf(m.day);
        const when = `${DAYS[dowOf(m.day)].short} ${MONTHS[dt.m - 1].slice(0, 3)} ${dt.d}`;
        const others = m.npcIds.filter((x) => x !== id).map((x) => w.npc(x)?.name).filter(Boolean);
        tl.appendChild(el('div', { class: 'tl-row' }, [el('b', {}, [when]), el('span', {}, [memoryCaption(m) + (others.length ? ` · with ${others.join(', ')}` : '')]), m.hasPhoto ? el('i', {}, ['📷']) : null]));
      }
      box.appendChild(tl);
      pane.appendChild(box);
    }
  }

  network(pane) {
    const w = this.game.world;
    const known = w.known();
    const W = 920, H = 400, cx = W / 2, cy = H / 2 - 6;
    const R = Math.min(140, 60 + known.length * 10);
    const pos = new Map();
    known.forEach((n, i) => {
      const a = (i / Math.max(1, known.length)) * Math.PI * 2 - Math.PI / 2;
      pos.set(n.id, { x: cx + Math.cos(a) * R * 2.0, y: cy + Math.sin(a) * R });
    });
    let lines = '';
    for (const k of w.save.discoveredLinks) {
      const [a, b] = k.split('|');
      if (!pos.has(a) || !pos.has(b)) continue;
      const p = pos.get(a), q = pos.get(b);
      lines += `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" class="nl"/>`;
    }
    for (const n of known) {
      const p = pos.get(n.id);
      const lvl = w.level(n.id);
      lines += `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" class="pl" style="stroke-width:${1 + lvl * 1.2}"/>`;
    }
    let nodes = `<g class="me"><circle cx="${cx}" cy="${cy}" r="34"/><image href="${this.game.playerPortrait()}" x="${cx - 30}" y="${cy - 30}" width="60" height="60" clip-path="circle(30px)"/><text x="${cx}" y="${cy + 50}">${escapeHtml(w.save.player.name)}</text></g>`;
    for (const n of known) {
      const p = pos.get(n.id);
      nodes += `<g class="node" data-id="${n.id}"><circle cx="${p.x}" cy="${p.y}" r="27" style="stroke:${n.color}"/><image href="${this.game.portrait(n)}" x="${p.x - 24}" y="${p.y - 24}" width="48" height="48" clip-path="circle(24px)"/><text x="${p.x}" y="${p.y + 42}">${escapeHtml(n.name)}</text></g>`;
    }
    const svg = `<svg class="netsvg" viewBox="0 0 ${W} ${H}">${lines}${nodes}</svg>`;
    const wrap = el('div', { class: 'netwrap', html: svg });
    wrap.addEventListener('click', (e) => {
      const g = e.target.closest('.node');
      if (g) { pane.innerHTML = ''; this.friendDetail(pane, g.dataset.id); }
    });
    pane.appendChild(wrap);
    pane.appendChild(el('p', { class: 'note' }, ['Lines between classmates appear when you learn they are friends. Introduce friends to each other!', this.j ? el('small', {}, ['友達どうしをしょうかいすると、線がふえるよ！']) : null]));
  }

  phrases(pane) {
    const w = this.game.world;
    const L = w.save.lang || { expr: {}, areas: {} };
    const grid = el('div', { class: 'phrasegrid' });
    for (const [id, a] of Object.entries(LANGUAGE_AREAS)) {
      const exprs = Object.entries(L.expr).filter(([, e]) => e.area === id);
      const said = exprs.filter(([, e]) => e.said > 0).length;
      const box = el('div', { class: `pbox${exprs.length ? '' : ' empty'}` });
      box.innerHTML = `<div class="ph"><span>${a.emoji}</span><b>${a.en}</b>${this.j ? `<small>${a.ja}</small>` : ''}<span class="stickers">${'⭐'.repeat(Math.min(5, said))}</span></div>`;
      for (const [, e] of exprs.slice(0, 6)) {
        const row = el('div', { class: 'pr' }, [
          el('span', { class: 'pt' }, [e.template || e.example]),
          el('span', { class: 'marks' }, [e.heard ? '👂' : '', e.said ? '💬' : '', e.spoken ? '🎤' : '']),
        ]);
        row.title = e.example || '';
        row.addEventListener('click', () => voice.speak(e.example || e.template));
        box.appendChild(row);
      }
      if (!exprs.length) box.appendChild(el('div', { class: 'pr dim' }, ['Not yet — explore and talk!']));
      grid.appendChild(box);
    }
    pane.appendChild(el('p', { class: 'note' }, ['👂 heard   💬 said   🎤 spoke with the mic', this.j ? el('small', {}, ['聞いた・言った・マイクで話した']) : null]));
    pane.appendChild(grid);
  }

  memories(pane = this.body) {
    const w = this.game.world;
    const photos = loadPhotos(w.save.id);
    const sv = w.save.souvenirs || [];
    if (sv.length) {
      const row = el('div', { class: 'souvenirs' });
      const icon = { soccer: '⚽', catch: '⚾', cafe: '☕', help: '🏅', postcard: '💌' };
      for (const s of sv) {
        const n = w.npc(s.npcId);
        const visitor = VISITORS.find((v) => v.id === s.npcId);
        row.appendChild(el('div', { class: 'souv' }, [el('span', {}, [icon[s.kind] || '🎁']), el('small', {}, [visitor ? `from ${visitor.name}` : n ? `with ${n.name}` : ''])]));
      }
      pane.appendChild(el('h4', {}, ['Souvenirs on your shelf', this.j ? el('small', {}, ['たなの思い出の品']) : null]));
      pane.appendChild(row);
    }
    if (!photos.length) {
      pane.appendChild(el('div', { class: 'empty' }, ['No photos yet. Do something fun with a friend!', this.j ? el('small', {}, ['友達と遊ぶと写真がふえるよ！']) : null]));
      return;
    }
    const grid = el('div', { class: 'photogrid' });
    for (const p of photos) {
      const names = (p.npcIds || []).map((id) => w.npc(id)?.name).filter(Boolean).join(' & ');
      const d = dateOf(p.day);
      grid.appendChild(el('div', { class: 'polaroid' }, [el('img', { src: p.url, alt: '' }), el('span', {}, [`${d.m}/${d.d} · ${names}`]), p.phrase ? el('em', {}, [p.phrase]) : null]));
    }
    pane.appendChild(grid);
  }

  me(pane) {
    const w = this.game.world;
    const p = w.save.player;
    const like = interest(p.likes?.[0] || p.intro?.like);
    const lines = [
      [`My name is ${p.name}.`, `わたしの名前は${p.name}です。`],
      like ? [`I like ${like.en}.`, `${like.ja}が好きです。`] : null,
      p.birthday ? [`My birthday is ${dateText(p.birthday.m, p.birthday.d)}.`, `誕生日は${p.birthday.m}月${p.birthday.d}日です。`] : null,
      p.intro?.can && ability(p.intro.can) ? [`I can ${ability(p.intro.can).en}.`, ability(p.intro.can).ja] : null,
    ].filter(Boolean);
    const box = el('div', { class: 'mebox' });
    box.innerHTML = `<img src="${this.game.playerPortrait()}" alt=""><div>${lines.map(([en, ja]) => `<div class="fact"><span>${escapeHtml(en)}${this.j ? `<small>${escapeHtml(ja)}</small>` : ''}</span></div>`).join('')}</div>`;
    pane.appendChild(box);
    const stats = el('div', { class: 'mestats' });
    stats.innerHTML = `<div><b>${w.known().length}</b><span>friends met</span></div><div><b>${w.save.memories.length}</b><span>memories</span></div><div><b>${w.day + 1}</b><span>days</span></div>`;
    pane.appendChild(stats);
  }

  // ------------------------------------------------------------ calendar
  calendar(monthOffset = 0) {
    const w = this.game.world;
    const today = w.date;
    let y = today.y, m = today.m + monthOffset;
    while (m > 12) { m -= 12; y++; }
    while (m < 1) { m += 12; y--; }
    const nav = el('div', { class: 'calnav' });
    const prev = el('button', {}, ['‹']);
    const next = el('button', {}, ['›']);
    prev.addEventListener('click', () => { this.body.innerHTML = ''; this.calendar(monthOffset - 1); });
    next.addEventListener('click', () => { this.body.innerHTML = ''; this.calendar(monthOffset + 1); });
    nav.append(prev, el('b', {}, [`${MONTHS[m - 1]}`]), next);
    this.body.appendChild(nav);
    const grid = el('div', { class: 'calgrid' });
    for (const d of DAYS) grid.appendChild(el('div', { class: 'calh', style: `color:${d.color}` }, [d.short]));
    const first = dayFor(y, m, 1);
    const pad = dowOf(first);
    for (let i = 0; i < pad; i++) grid.appendChild(el('div', { class: 'calc pad' }));
    const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const known = w.known();
    for (let d = 1; d <= daysIn; d++) {
      const di = dayFor(y, m, d);
      const items = [];
      for (const p of w.save.plans.filter((p) => p.day === di && p.status !== 'missed')) {
        const n = w.npc(p.npcIds[0]);
        items.push(`<span class="ci plan${p.status === 'done' ? ' done' : ''}">${ACT_INFO[p.act]?.emoji || '⭐'} ${escapeHtml(n?.name || '')}</span>`);
      }
      for (const n of known) if (n.birthday.m === m && n.birthday.d === d && w.knows(n.id, 'birthday')) items.push(`<span class="ci bday">🎂 ${escapeHtml(n.name)}</span>`);
      if (w.save.player.birthday && w.save.player.birthday.m === m && w.save.player.birthday.d === d) items.push('<span class="ci bday">🎉 You!</span>');
      const wx = di >= w.day && di <= w.day + 2 ? WEATHER[w.weatherOn(di)].emoji : '';
      const hadMem = w.save.memories.some((mm) => mm.day === di);
      const cls = `calc${di === w.day ? ' today' : ''}${di < w.day ? ' past' : ''}${isWeekend(di) ? ' we' : ''}`;
      grid.appendChild(el('div', { class: cls, html: `<b>${d}</b><span class="wx">${wx}${hadMem ? '📸' : ''}</span>${items.join('')}` }));
    }
    this.body.appendChild(grid);
    if (!w.weekend) {
      const subs = TIMETABLE[w.dow].map((s) => SUBJECTS.find((x) => x.id === s));
      this.body.appendChild(el('div', { class: 'today-classes', html: `<b>Today's classes:</b> ${subs.map((s) => `${s.emoji} ${escapeHtml(s.en)}`).join(' · ')}` }));
    }
  }

  // ------------------------------------------------------------ map
  map() {
    const w = this.game.world;
    const places = [
      { id: 'classroom', x: 22, y: 20, icon: '🏫', target: { x: -23.4, z: -7.5 } },
      { id: 'mall', x: 75, y: 20, icon: '🛍️', target: { x: 25, z: -14 } },
      { id: 'park', x: 72, y: 70, icon: '🌸', target: { x: 14, z: 13 } },
      { id: 'cafe', x: 36, y: 58, icon: '☕', target: { x: -12, z: 7.2 } },
      { id: 'home', x: 18, y: 80, icon: '🏠', target: { x: -22, z: 22.2 } },
    ];
    const wrap = el('div', { class: 'mapwrap' });
    const board = el('div', { class: 'mapboard' });
    board.innerHTML = '<div class="road h"></div><div class="road v"></div><div class="road lane"></div>';
    const where = new Map();
    for (const n of w.known()) {
      const slot = w.slot(n);
      const knowsToday = w.knows(n.id, `week:${w.dow}`) || this.game.npcs.actorFor(n.id);
      if (!knowsToday) continue;
      const loc = slot.loc === 'town' ? null : slot.loc;
      if (loc && LOCATIONS[loc]?.scene) where.set(loc, [...(where.get(loc) || []), n]);
    }
    for (const p of places) {
      const L = LOCATIONS[p.id];
      const friends = where.get(p.id) || [];
      const b = el('button', { class: `mapspot${p.id === 'mall' ? ' soon' : ''}`, style: `left:${p.x}%;top:${p.y}%` }, [
        el('span', { class: 'mi' }, [p.icon]),
        el('b', {}, [L.en]),
        this.j ? el('small', {}, [L.ja]) : null,
        friends.length ? el('span', { class: 'mf' }, friends.slice(0, 4).map((n) => el('img', { src: this.game.portrait(n), alt: n.name, title: n.name }))) : null,
      ]);
      b.addEventListener('click', () => {
        if (p.id === 'mall') { this.game.hud.toast({ icon: '🛍️', en: 'Niji Mall is opening soon!', ja: 'にじモールはもうすぐオープン！' }); return; }
        this.game.hud.setGoal({ icon: p.icon, en: `Go to ${L.en}`, ja: `${L.ja}へ行こう`, target: { ...p.target, label: L.en }, loc: p.id, temp: true });
        this.close();
      });
      board.appendChild(b);
    }
    if (this.game.sceneId === 'town') {
      const px = this.game.player.x, pz = this.game.player.z;
      const me = el('div', { class: 'mapme', style: `left:${50 + (px / 84) * 100}%;top:${50 + (pz / 76) * 100}%` }, ['📍']);
      board.appendChild(me);
    }
    wrap.appendChild(board);
    wrap.appendChild(el('p', { class: 'note' }, ['Friends appear on the map when you know where they are today. Tap a place to get directions.', this.j ? el('small', {}, ['今日どこにいるか知っている友達が地図に出るよ。場所をタップすると道案内！']) : null]));
    this.body.appendChild(wrap);
  }

  // ------------------------------------------------------------ settings
  settings() {
    const s = this.game.settings;
    const row = (label, ja, key, extra = null) => {
      const b = el('button', { class: `toggle${s[key] ? ' on' : ''}` }, [s[key] ? 'ON' : 'OFF']);
      b.addEventListener('click', () => {
        s[key] = !s[key];
        this.game.saveSettings();
        this.game.applySettings();
        this.body.innerHTML = '';
        this.settings();
      });
      return el('div', { class: 'setrow' }, [el('span', {}, [label, this.j || key === 'japanese' ? el('small', {}, [ja]) : null]), b, extra]);
    };
    this.body.append(
      row('Japanese hints', '日本語のヒント', 'japanese'),
      row('Read English aloud', '英語を読み上げる', 'voice'),
      row('Read my answers aloud', '自分の答えも読み上げる', 'readAnswers'),
      row('Sound effects', '効果音', 'sfx'),
    );
    const q = el('div', { class: 'setrow' }, [el('span', {}, ['Graphics', this.j ? el('small', {}, ['画質']) : null])]);
    for (const [id, label] of [['auto', 'Auto'], ['high', 'High'], ['low', 'Fast']]) {
      const b = el('button', { class: `toggle${s.quality === id ? ' on' : ''}` }, [label]);
      b.addEventListener('click', () => { s.quality = id; this.game.saveSettings(); this.game.applySettings(); this.body.innerHTML = ''; this.settings(); });
      q.appendChild(b);
    }
    this.body.appendChild(q);
    const mic = el('div', { class: 'setrow' }, [el('span', {}, ['Microphone', this.j ? el('small', {}, ['マイク — 上の🎤ボタンでいつでもON/OFF']) : null]), el('em', {}, [this.game.hud.mic.textContent])]);
    this.body.appendChild(mic);
    const quit = el('button', { class: 'bigbtn' }, ['💾 Save and go to the title', this.j ? el('small', {}, ['セーブしてタイトルへ']) : null]);
    quit.addEventListener('click', () => { this.close(); this.game.quitToTitle(); });
    this.body.appendChild(quit);
    this.body.appendChild(el('p', { class: 'note' }, ['Your progress saves automatically on this device. Nothing is sent to the internet.', this.j ? el('small', {}, ['進み具合はこの機械に自動でセーブされます。インターネットには送られません。']) : null]));
  }

  // ------------------------------------------------------------ town board & timetable
  board() {
    const w = this.game.world;
    const grid = el('div', { class: 'boardgrid' });
    for (const a of ATTRACTIONS) {
      const en1 = `${a.thing} is in ${a.place}.`;
      const en2 = `You can ${a.can} there.`;
      const c = el('button', { class: 'attr' }, [el('span', { class: 'ae' }, [a.emoji]), el('b', {}, [a.place]), el('span', {}, [en1]), el('span', {}, [en2]), this.j ? el('small', {}, [`${a.placeJa}には${a.thingJa}があります。${a.canJa}。`]) : null]);
      c.addEventListener('click', () => { voice.speak(`${en1} ${en2}`); w.logLine({ expr: 'a.isin', area: 'places', en: en1, template: 'The ___ is in ___.' }, 'heard'); w.logLine({ expr: 'a.youcan', area: 'places', en: en2, template: 'You can ___ there.' }, 'heard'); });
      grid.appendChild(c);
    }
    this.body.appendChild(el('p', { class: 'note' }, ['Tap a card to listen. Ask friends: “Where do you want to go?”', this.j ? el('small', {}, ['カードをタップすると聞けるよ。友達に「どこに行きたい？」と聞いてみよう！']) : null]));
    this.body.appendChild(grid);
  }

  timetable() {
    const w = this.game.world;
    const t = el('table', { class: 'tt' });
    let html = '<tr><th></th>' + DAYS.slice(0, 5).map((d, i) => `<th class="${i === w.dow ? 'today' : ''}" style="color:${d.color}">${d.short}</th>`).join('') + '</tr>';
    for (let p = 0; p < 5; p++) {
      html += `<tr><th>${p + 1}</th>` + TIMETABLE.map((list, d) => { const s = SUBJECTS.find((x) => x.id === list[p]); return `<td class="${d === w.dow ? 'today' : ''}" data-en="${escapeHtml(s.en)}">${s.emoji}<span>${escapeHtml(s.en)}</span>${this.j ? `<small>${s.ja}</small>` : ''}</td>`; }).join('') + '</tr>';
    }
    t.innerHTML = html;
    t.addEventListener('click', (e) => { const td = e.target.closest('td'); if (td) voice.speak(td.dataset.en); });
    this.body.appendChild(t);
    this.body.appendChild(el('p', { class: 'note' }, ['“What subject do you like?” — “I like science. We have science on Mondays.”']));
  }
}
