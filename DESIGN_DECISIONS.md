# Design Decisions

This file records meaningful product, UX, visual, architectural, or behavioral decisions for this project.

For each significant decision, record:

- Date
- What was decided or changed
- Why
- Previous approach, if relevant
- Rejected alternatives, if useful

Only record decisions that may be useful to understand later.

Do NOT record:
- trivial UI adjustments
- routine bug fixes
- formatting changes
- mechanical refactors with no design consequence
- every individual code modification

Git is the source of truth for detailed code-change history.

A useful rule:

> If a future developer or AI could reasonably ask, "Why is it designed this way?", record the answer here.

---

## 2026-11-22 — Niji Mall three floors: review of the expansion brief

The user's brief (three floors, solo eating, food prices, arcade, flexible
outings) was accepted as the direction. Claude's review froze these decisions
before implementation. It supersedes parts of 2026-11-17 where noted.

**Floors and scenes (accepted, made concrete)**
- Three separate scenes: `mall` = 1F Shopping (keeps its id so the town door,
  saves, music theme, perf entry and existing e2e keep working), `mall2` = 2F
  Food Court, `mall3` = 3F Game Center. `game.locationId` returns `'mall'` for
  all three, so schedules, `LOCATIONS`, hangouts and plans need no new place.
  **Rejected:** vertical physics or one tall scene; a camera that could show
  other floors.
- Each floor has an up and/or down escalator and an elevator at matching
  positions, named spawns (`door` on 1F only, `escUp`, `escDown`, `elevator`)
  so the player emerges next to the device used. One `game.changeFloor(floor,
  via)` path handles every trip: short fade (well under a second) with an
  ⬆/⬇ cue and a large "2F Food Court / 2かい フードコート" banner. Floor travel
  never advances time. The elevator shows a 1F/2F/3F card panel. Every floor
  has a directory card listing all three floors; 1F keeps the entrance.
- **2026-11-17 superseded:** shops move to 1F and the four counters to 2F; the
  arcade is new on 3F. The "large multi-floor centre" rejection is reversed
  because the user asked for it; the budget stays: every floor ≤ 90 draw calls
  in `e2e:perf`, decor in merged static geometry, background customers as
  merged figures, at most a few animated ambient characters per floor.

**NPC floors**
- A pure `mallFloorFor(npc, slot, day)` in `world/mall.js` decides the floor:
  `shopping` → 1F; eating / meeting (`act: 'mall'`) → 2F; 3F for NPCs whose
  generated interests include games, chosen deterministically from an
  independent hash (never the schedule RNG stream). An NPC is on exactly one
  floor per slot. Companions (engaged actors) move with the player on every
  floor change. No autonomous cross-floor pathfinding.

**Food prices (accepted; reverses the 2026-11-17 "food is free" rule for the mall only)**
- The café stays free. Mall food has fixed round prices shown on every card
  (¥150–¥500, e.g. ramen ¥500, hamburger ¥400, sushi ¥500, rice ball ¥150, ice
  cream ¥200). Money is taken only when the food is handed over. A paid order is
  saved as `save.mallMeal` (`{ id, foodId, bites }`) until it is eaten, so an
  interrupted or reloaded meal is waiting at the counter ("Your food is ready!")
  and is never charged twice. The field is optional; v3 saves load unchanged.
- Not enough money is never a dead end: the shopkeeper says so kindly, and a
  free "Just water, please." / "おみずをください。" option always exists, so the
  player can still sit and eat with friends.
- Group rule: everyone pays for their own food. Ordering for a friend ("It's
  for ___!") is still allowed; the friend pays. The player is never charged for
  friends. **Rejected:** paying for the whole table, borrowing, or XP for paying.

**Solo eating (accepted, the most important fix)**
- After a paid order the player carries a tray/handheld food, walks to any
  free seat (free seats are highlighted), sits, the dish is set on the table and
  is eaten in 3–4 bites, visibly shrinking (ramen level drops, burger shrinks,
  sushi pieces disappear, crêpe/ice cream shrinks), then "It's delicious!", the
  dishes are cleared and the player stands up. A Skip button finishes at once.
  No time passes and no friendship XP is given.
- Group meals use the same consumption helper: each person's own dish, eaten
  in a staggered sequence with occasional reactions, a camera that frames the
  whole table, and dishes cleared at the end.

**Arcade (accepted with changes)**
- Arcade play is free (no yen). **Why:** It does not use up the allowance that
  food and shops need, and a paid crane game feels like gambling for children.
- Crane game: the player moves the claw with ◀ ▶ (and ▲ ▼ for depth), and drops
  it. A win depends only on how well the claw lines up with the prize (a fixed
  tolerance), never on random chance. Cues: "Go left." "Go right." "Stop!" "It's
  under the claw." Six small prizes. Each prize is a souvenir that can be won
  once (bedroom shelf). Winning a prize you already have says "You have it
  already! Try another one." and gives nothing. Rewards are keyed to the prize,
  so retries and interruptions cannot duplicate them.
- Racing: a new lightweight top-down track (canvas or flat 3D), with left/right
  steering and a stop/finish line. Instruction signs and a navigator call "Go
  straight!", "Turn left!", "Turn right!", "Stop!". Solo, or against a friend's
  ghost car with a fixed lap time. Steering is by keys and touch, not by
  speech (speech is too slow for steering). The existing friend-house BOOST
  racing is kept as it is.
- Rhythm: reuse `hobby.js`'s `rhythm()` (exported, with an arcade option:
  Perfect/Good/Miss feedback and a short song); no new music system. Playable
  muted and quiet by default.
- Solo arcade play takes no time and gives no XP. During a committed mall outing
  the activity counts as the outing (one period, XP once through the existing
  reward path). **Rejected:** XP for each arcade round.

**Flexible outings (accepted)**
- Arriving at the mall on an outing, a friend asks "What do you want to do?";
  friends may say what they would like, based on generated interests and food
  likes; the player chooses "I want to go shopping." / "I want to eat." /
  "I want to play games.". The group goes to that floor together. The outing
  stays `act: 'mall'` (plans, recall, repeat plans unchanged), with
  `detail.mallChoice: 'shop' | 'eat' | 'games'` and recall lines that match
  ("We played games at Niji Mall"). Completion advances exactly one period and
  goes through the existing `completeEvent` / personal-memory paths once,
  however many floors are visited.

**English**
- New lines use the existing card + optional speech pattern with Japanese hints,
  and every conversation ends in a choice: want to + verb (Where/What do you
  want to go/do/eat/buy/play?; I want to go to the third floor.), ordering (A
  hamburger, please. I'd like ramen, please. Here you are. Thank you.), How
  much is it?, directions in racing/crane, prepositions in directory and crane
  lines ("It's by the door." "It's under the claw."), "Let's play together!",
  "It's delicious!". No quizzes, nothing blocked by microphone errors.

**Delivery:** four phases on branch `niji-mall-floors`, each tested before the
next: (1) floors, navigation, signage, NPC floors; (2) solo/group eating and
food prices; (3) arcade floor and minigames; (4) flexible outings and companion
floor changes. `e2e:mall` is extended per phase; perf covers all three floors.

**Phase 1 implementation (2026-11-22)**
- Floor travel preserves engaged actor/Character objects, rather than recreating
  companions: active conversations hold those references. Destination schedules
  exclude their ids and place ordinary classmates around the arrival space.
  All floor trips use `changeFloor`; its frozen `mallTravel` snapshot exposes
  floor, travel-in-progress and device to the acceptance harness.
- Floor assignment gives shopping precedence on 1F and meals/meetings (including
  explicit hangout pairs) on 2F. Other ambient mall slots for games interests may
  visit 3F through the independent id/day hash. Existing schedule variation can
  produce these slots; generated and stored routines are unchanged.
- Existing committed meals stay on 2F, with their optional shop visit returning
  to 1F. This preserves the current outing and reward flow; flexible activity
  choice, paid food, solo eating and arcade interactions remain later phases.
- Three additional occupied dining tables use merged static diners and meal
  geometry; the original sixteen available seats, including T2, remain intact.
  Arcade machine anchors are exported for later interactions with no prompts yet.

## 2026-11-19 — School day: music room, gym and art room

- **What:** Three new school rooms (music room, gym, art room; one shared
  builder in `engine/scenes/schoolrooms.js`). On a weekday whose `TIMETABLE`
  entry has music, P.E. or arts and crafts, the morning starts in that room
  (the first such subject in the list wins); other days keep the ordinary
  classroom morning, and day 0 keeps the authored first-day welcome.
  NPC schedules show the whole class in that room during the morning.
  **Why:** The timetable already existed and was only spoken about; using it
  makes "What do you have today?" true and gives each weekday a different feel
  without new large environments. **Rejected:** separate lesson periods (would
  shift the time model) and random room choice (unpredictable for teachers).
- **What:** The lesson is a short pair activity that reuses existing games:
  music = the timing/rhythm meter (`playHobby` music), P.E. = catch
  (`playBall`, now with a `where` scene option), art = the drawing canvas. The
  teacher says "Today we have ___! Make pairs, please.", the player says "Let's
  go to the ___ room.", the partner "Let's be partners!" / "OK!" and asks "What
  do you have today?". It happens inside the existing morning school period and
  advances time exactly as the classroom desk does; no extra free period.
  Partners come from a seeded ring over the whole class (`world/school.js`), so
  each lesson is a different classmate and the class is covered before repeats.
  **Why:** Pair work introduces classmates the player might not approach and
  reuses tested activity code. **Rejected:** letting the player pick a partner
  (would always pick the same friend and turn lessons into XP farming).
- **What:** Lesson rewards go through the existing fact path with a weekly key
  (`school-lesson:<week>`), so a partner gets at most +2 XP per week from
  lessons and it shares the daily fact cap. Lesson memories use `type: 'lesson'`
  and `focus: []`, so they never count toward Lv3+ gates. The lesson memory is
  also the once-per-day completion marker; an interrupted lesson pays nothing
  and can be replayed (no save version change). **Why:** the user asked that
  lesson memories be capped so pair work can't level up friendships.
- **What:** "What do you have today?" also appears in casual talk, at most once
  per school day across all classmates, and only in a chat where no news,
  offer, plan, quiz or introduction asked the player anything first. Answer
  cards are built from that day's real timetable (full list, or the first two:
  "I have P.E. and math."). **Why:** Codex's first wiring asked it at the start
  of every classmate's first chat each day, which pre-empted hangout reports
  (caught by `social.test.mjs`) and would repeat the same question all day.
  **Rejected:** once per classmate per day (too repetitive for Grade 5).
- **Built by:** Codex (stopped on a usage limit before validation); Claude
  finished it at the user's request: the casual-question priority above, two
  test-fixture fixes in `scripts/school.mjs` (dismiss queued HUD cards before
  pressing ⏩; make the casual-talk check a quiet chat), harness proof and the
  full-suite run.

## 2026-11-19 — Visiting a close friend's home

- **What:** Add `friend_house`, the inverse of `home_visit`, at the same Lv4
  gate, one-free-period cost and existing 12 XP personal-event reward. Friends
  can invite in person or by message; the player can ask “Can I come to your
  house?” in the topic menu. Acceptance books an event; the host waits by the
  blue-roof neighbour north of the player's home. The map and goal lead there.
  The door confirms the cost before starting; without a current visit it gives
  a friendly not-now choice. Busy friends use their actual calendar reasons;
  postponement, missing and decline retain the existing forgiving lifecycle.
  **Why:** Walking to an existing landmark makes the inverse visit understandable
  without a new travel system. **Rejected:** Automatic teleport on acceptance,
  entering any house without an invitation, new level gates or reward amounts.
- **What:** Message selection retains the original home-visit request's priority
  when both directions are eligible; the inverse invitation shares that nightly
  roll during the request's existing cooldown. In-person offers and the player's
  topic can choose the inverse visit at any eligible Lv4+ conversation.
  **Why:** Replacing the first request could leave an unanswered inverse offer
  blocking the established request stream. Both directions keep the same offer
  budget and unchanged eligibility rather than doubling a friend's initiative.
  **Rejected:** Two independent nightly invitation rolls, changing the old visit
  harness assertions, or adding a completion prerequisite to visit eligibility.
- **What:** Use one bright cutaway interior layout, with merged static furniture
  and pets. Wall colour is independently hashed from class seed and NPC id;
  pet type/count and interest props come only from generated class data.
  Home activities, then interests, select one racing game, drawing, music or
  photo activity. Drawing/music reuse Hobby Session with indoor staging; racing
  reuses the bedroom game. Photos show a stored shared photo or a fresh room
  photo, with no invented family or travel history. Every new exchange has
  Japanese hints and card intents shared with optional speech. Style-bank
  reactions and gestures flavour the host without reading names or pronouns.
  **Why:** One layout and static pets keep the scene small for school Chromebooks.
  **Rejected:** Per-friend scene files, family characters, animated pet actors,
  name-based decor, a second game/reward framework or mandatory speech.
- **What:** Reuse saved event instances/plans, their personal `focus` memory,
  once-only completion key and interrupted-event recovery. The memory has its
  own host-view recall sentence and journal label. Keep save version 3: no new
  persistent fields are needed. The unfinished visit remains the saved snapshot
  until the result card is dismissed, when reward and time save together.
  Leaving restores the same residential pavement even when the period ends.
  **Why:** A reload can replay an unfinished visit without retaining free XP or
  stranding the player in an interior. **Rejected:** A new save version for
  derived decor, persisting activity steps, or awarding partial-visit XP.
- **What:** Add pure eligibility/calendar/personalisation/reload/reward tests,
  `e2e:friendhouse` with an actual walk and external screenshots, viewer support
  and the same 90-draw-call performance ceiling as café/mall. Prove the harness
  with a good run and a deliberately broken assertion, then restore it.
  **Why:** The entrance, time cost and personal reward need observable checks;
  final aesthetic judgment remains with Claude.

## 2026-11-17 — Hangout news before ordinary memory recalls

- **What:** A completed, unreported NPC hangout defers the greeting's ordinary
  memory recall until a later conversation. The existing friendship-event flow
  tells the news and offers “Can I come next time?”; existing open event offers
  and the scripted first-day callback keep their priority.
  **Why:** A recall could otherwise start another outing and end the conversation
  before the friend reported the hangout. Its memory remains unreferenced, so it
  can still be recalled later. This ordering defect existed before the mall diff.
  **Rejected:** Hiding the competing memory in tests or consuming it without
  telling it, changing event XP, or changing level gates.
- **What:** Place explicit NPC hangout pairs before routine companion groups
  and lost-item searches, after plans with the player. Both friends reserve
  their group space together at the planned venue, including the mall.
  **Why:** One-sided routine companion links could absorb one member into a
  different four-person group, or a park search could place one member alone.
  The resolved hangout already overrides both friends' free routines; placement
  must respect that same pair rather than treating it as an ordinary routine.
- **What (2026-11-18):** When a friend has several hangouts to report, the one
  that came from the player introducing them is told first, then the oldest;
  the rest follow on later talks.
  **Why:** The introduction report carries "Thank you for introducing us!",
  which is the payoff for the player's introduction. With the mall adding more
  hangouts, a friend often had two to report, and the payoff was lost.
  **Rejected:** Newest first (the introduction payoff could still be skipped);
  reporting all of them in one conversation (too long for Grade 5 readers).

## 2026-11-17 — Niji Mall and food court

- **What:** Open the existing Niji Mall town door into a separate, bright indoor
  cutaway scene, with an entrance planter and directory, three pocket shops
  (toys/games, books/stationery, sports/clothes), and ramen, burger, sushi and
  crepe/ice-cream counters surrounding four tables with four seats each. Leaving
  returns to the pavement outside the same town door. The map and weekend goal
  cards now lead there. Register the scene in the dev viewer.
  **Why:** The existing landmark becomes a useful outing destination while
  keeping the familiar dollhouse layout and short walking distances for Grade 5
  learners on 1366×768 Chromebooks. Fixtures, merchandise and three shopkeepers
  are merged static geometry; signs use the existing common helpers.
  **Rejected:** A large multi-floor shopping centre, external brand names,
  separate scenes per shop, or animated shopkeepers adding character draw calls.
- **What:** Each shop offers three fixed items at round ¥100 prices. Cards model
  “Can I see ___, please?” → “How much is it?” → “It's ___ yen.” → “I'll take it!”
  or “No, thank you.” → “Thank you!” A saved wallet starts with ¥1,000 and grants
  another ¥1,000 once per elapsed in-game week, with unspent money carried over.
  Checks deduct only when the full price is available; no borrowing. Old saves
  start with the current week's allowance, without retrospective backpay.
  **Why:** A simple weekly limit makes number practice meaningful without
  connection penalties, grinding, or a real-money store. Shopping takes no time
  and awards no XP. A rejected purchase ends with a reassuring choice.
  **Rejected:** Negative balances, daily refills, randomized prices, spending
  friendship XP, or charging for food that the existing café serves freely.
- **What:** Purchases use the existing souvenir save/shelf system, with small
  toy, book, stationery, ball and clothing models. A purchase is moved to the
  front of the shelf list so it remains visible when the twelve display slots
  are full. Repeated item kinds reuse that display slot. The existing present
  and delivery events retain their own objects and rewards.
  **Why:** Bedroom keepsakes make a purchase tangible without inventing a new
  inventory, gift economy, or replacing an outstanding delivery.
  **Rejected:** Extra XP for buying gifts, silently completing existing delivery
  events, or storing possessions in a separate inventory UI.
- **What:** Food ordering follows the café's conversation/card pattern with
  “What do you want to eat?”, “I want ___.”, “I'd like ___, please.” and “Here
  you are.” Solo orders are quick, free and create no friendship memory. Mall
  outings visit the relevant food counters first; friends order their generated
  food likes, and a player who knows a favorite can order for that friend. The
  existing foods remain available alongside ramen, sushi and crepes, so no
  friend is assigned an invented favorite. Everyone then sits at table T2, eats
  and takes a memory photo; the closing cards offer one optional shop together
  or goodbye. Every new line/card has a readable Japanese hint and every new
  conversation ends in a choice; optional speech uses the same card intents.
  **Why:** Counter service fits a food court and keeps all companions involved.
  **Rejected:** Reusing the café's hard-coded waiter walking routes, auto-buying
  during outings, or forcing a shopping stop.
- **What:** Add mall to phone planning, in-person/nearby invitations, friend
  messages and NPC–NPC hangouts. Keep all existing XP values, level gates and
  event reward paths: group completion uses `completeEvent` (6 XP per friend,
  existing first-activity bonus, `focus: []`); one-on-one outings use the existing
  personal-memory path. Mall memories support real recalls and repeat plans.
  Indoor NPC pairs choose café/mall from an independent deterministic pair seed;
  stored plans keep their venue. The existing group e2e's scene resolver now
  understands mall as an indoor venue without changing its assertions.
  **Why:** The mall should participate in the same social world as the café.
  **Rejected:** New reward values, group memories opening level gates, or any
  connection loss for declining or lacking money.
- **What:** Add an independently hashed Saturday-morning or Sunday-afternoon
  mall slot to some newly generated NPC schedules, only when the slot has no
  companions or away appointment. Keep stored schedules, Saturday-afternoon
  signature activities, and the old generation RNG stream. Shopping mall slots
  are stable across weekly variation and rain; player plans still override them.
  **Why:** Populate the destination predictably without reshuffling saved
  classmates. **Rejected:** Regenerating existing schedules or consuming the
  established schedule RNG for the added slot.
- **What:** Save version 3 adds `pocketMoney: { balance, week }` through an
  idempotent migration, preserving v1/v2 levels, XP, facts, memories and plans.
  Pure tests cover prices, overspending, allowance rollover, migration and
  schedule determinism. `e2e:mall` exercises the real town entrance, purchase,
  solo order, two-friend phone plan, meal, exit and bedroom shelf; prove the
  harness with a reverted broken selector. Add mall to the existing performance
  script with the café's unchanged 90-call budget, and store visual evidence in
  an external `SHOTS_DIR`. **Why:** Money and scene integration need observable
  regression protection without changing existing test thresholds.

## 2026-11-10 — Review of the original brief (SPEC.md) and what changed

The brief was accepted as the product direction. Built as the first vertical
slice; everything below records where the build deliberately differs.

### Accepted as written
- Core loop (explore → meet → talk → plan → do something together → connection → new day), no deadline, unlimited calendar.
- Period-based time (never ticks while exploring); casual talk is free; shared activities cost one period and say so *before* committing.
- Connection levels 0–5 that never decrease; forgiving missed plans (gentle message + one-tap reschedule).
- Seeded, fictional NPC generation from a teacher roster; player's own name excluded; local-only storage; separate player profiles.
- Hybrid speech/tap answers; tapping always works; mic on/off is never a failure.
- Three playable shared activities first (catch/soccer, café ordering, find an object). Mall deferred but anticipated.
- The day-one script, nearly word for word (Ken: "This is Yuki. She is my friend. She likes soccer. She can run fast." → "What do you do on Saturdays?" → "Do you want to play soccer?" → "Let's meet at the park!" → next morning "Soccer was fun yesterday!").

### Modified
- **Pronouns come from the teacher, never from the name.** Roster lines accept `Name, he` / `Name, she`; otherwise the game says the name ("Aoi likes music. Aoi can swim."). Guessing he/she from a real student's name would misgender kids in front of their class. Hair/skirt pools follow the teacher's pronoun choice only; teachers can re-roll any look (🎲).
- **Speech privacy.** Chrome's classic Web Speech API streams audio to a cloud service, which conflicts with "names and data stay local". Default policy is *on-device recognition only* (feature-detected `processLocally` / `available()`); if unsupported, the mic shows as unavailable and cards are used. Teacher Setup can opt in to the online service. Read-aloud uses only on-device voices unless that same opt-in is on (cloud TTS would receive classmates' names).
- **Adjectives about roster NPCs are positive only** (kind, friendly, funny, cool, active, brave). "Smart", "popular", "famous" are reserved for non-roster characters, per the classroom rules.
- **No ranking of real names.** The journal orders friends by when you met them, never by level. Every NPC is generated with at least two NPC friends so no classmate's name appears friendless.
- **Friendship pacing (Persona-style):** talking alone can reach Lv2 (Friend). Each shared activity or favour (a memory) unlocks one more level, so Lv3–5 require spending time together. Fact XP is small (+2) and capped at three facts per friend per day; conversations are capped at five topics. Rejected: XP purely from questions — a playtest took a stranger to Lv3 in one long chat.
- **"Find an object" is a quick favour that costs no time**, unlike hangouts. It is event-driven (a friend at the park shows ❗), so it cannot be farmed, and it practises prepositions both ways: the friend's clue ("I think it's under the bench") and the player telling them ("It's under the slide.").
- **Brand names removed** ("Nintendo Switch" → "video games"; no real theme parks). Real Japanese places stay (Fukui dinosaur museum etc.).
- **Park is part of the outdoor town scene** (not a separate load), so classmates are visibly out and about; interiors (classroom, café, home) are separate dollhouse scenes with the south wall cut away.

### Added
- **Day-one homeroom welcome:** the teacher introduces the player, the class claps, the player self-introduces — then the guided first-friend meeting.
- **Morning alarm ("What time is it?")** and a weekend "What do you want to do today?" choice that sets a goal arrow — time and want-to language that changes what happens.
- **Memory photos:** each shared activity takes an in-game snapshot (polaroid) shown on the results card, in the journal and on the bedroom memory wall, with the key phrase as caption. Souvenirs appear on the shelf.
- **Phrase book ("My English")** as a sticker collection (👂 heard / 💬 said / 🎤 spoke), never a score. Least-practised language areas quietly raise matching topics and events (e.g. lost-item events when prepositions are rare).
- **Teacher/debug panel** (` key or Shift+Alt+D) for time, weather, levels, positions, events.

### Deferred (extension points left in place)
- Niji Mall (building exists, "opening soon"; schedules already send NPCs there off-screen).
- Directions activity was added on 2026-11-11 (see below).
- Group outings beyond two people (activities accept an actor array; ball play positions a third person; café seats three).
- Friends visiting your room, special rank-up events, music.

## 2026-11-10 — Architecture

- Plain JS + Three.js 0.187 + Vite 8, no framework: smallest footprint for Chromebooks and matches the sibling project esl-likes.
- Static geometry and each character limb are merged into vertex-coloured meshes with one shared toon material (≈8 draw calls per character; town ≈40 calls, classroom with a full class ≈120). Faces are shared canvas textures swapped per expression.
- Pure logic (generator, schedules, time, relationships, intent matching) has no DOM/three imports and is unit-tested with `node --test`.
- Conversations are async scripts (`say()` / `ask()`), which keeps branching readable and guarantees every branch ends in a choice.

## 2026-11-11 — Directions favour for a visitor

- Directions is a no-time-cost favour for an authored fictional adult visitor. Visitors are independent of the class roster, so helping gives phrase-book stickers and a postcard, with no classmate connection XP.
- Left and right are relative to the visitor. The camera moves behind the visitor before showing turn choices, so screen-left matches the visitor's left.
- Wrong turns are gentle detours, never failures. The visitor names a visible landmark and asks again; after two detours the correct arrow pulses with a Japanese hint. Tapping and optional speech use the same choices.
- Niji Mall is a directions landmark only. Its interior remains deferred.
- Speech matching follows esl-likes' rule: err toward acceptance; the meaningful key word (food, day, yes) decides, grammar never blocks.

## 2026-11-16 — Friendship Depth expansion: review of the brief (SPEC.md Part 2)

The brief was accepted as the direction. It builds what the first slice
deferred: rank-up events, group outings, friends visiting your room. Build
order follows F16: Phase 1 (styles, events, level behaviour, memory
follow-ups), then Phase 2 (groups, NPC–NPC), then Phase 3 (home visits).

### Accepted as written
- Levels 0–5 stay, and each one changes visible behaviour, not just how long the dialogue is (table below).
- About ten data-driven event templates, filled in from interests, style, memories and level. No hand-written story per character.
- Time rules: casual talk is free. Period events show their cost first and advance time only after they finish. Favours cost no time. Declining, missing, postponing or rain never cost connection.
- NPCs start interactions at higher levels, within limits. The player always chooses.
- NPC–NPC links grow through play. Seeded links are never lowered (`setNpcLink` is max-only).
- Group outings with 2–3 NPCs at the park and café reuse the existing activities. Home visits use the existing bedroom; no NPC houses.
- Memory references come only from stored memories.
- No mall, no new large environments, no AI APIs or backend, no new dependencies.

### Modified
- **Six behaviour styles replace the four-value `personality`:** outgoing, thoughtful, playful, creative, curious and considerate. Each class NPC gets a style once. It is assigned from the class seed and the NPC id, balanced so a class shows a spread, and stored on the class NPC. It never comes from what a name means, the pronoun, the look or the interests. Old classes get styles on load without regenerating anything else. The old `personality` field stays in the data for compatibility but is no longer read. *Why:* the style is deterministic and survives roster edits and reloads. Keeping it independent of interests gives varied combinations, like an outgoing reader or a quiet soccer player.
- **Styles are never shown as labels.** The journal still shows only likes, abilities and the six positive adjectives. The style shows only in behaviour. *Why:* a label like "quiet" next to a real classmate's name can be repeated in class as a tease.
- **A style changes how a friend takes the initiative, never how much.** Every style has the same initiative budget per level. Outgoing friends spend more of it coming over in person; thoughtful friends spend more of it on messages and quieter suggestions. XP code never reads the style. *Why:* the brief asks both for invitation frequency to vary by personality and for no style to have an XP advantage. Equal budgets satisfy both. Rejected: different invitation rates per style, which would make some classmates systematically easier to befriend.
- **Only one-on-one experiences open the next level.** Each memory records `focus`: the NPCs for whom it was a personal experience. Solo outings, favours and friendship events focus on their NPC. Group outings have no focus, though each companion still earns XP and their NPC–NPC links grow. A celebration focuses on its host. The level gate counts focus memories; a memory without `focus` counts for all its NPCs, so existing saves level exactly as before. Group companions earn 6 XP each instead of 10. *Why:* otherwise one three-friend outing opens three levels in one period, becomes the only sensible choice, and removes the "whom do I spend time with" decision. XP is banked, so group time still pays off once the gate opens.
- **A friend's special day is not only a birthday.** Day 0 is April 13 and birthdays are spread across the year, so most never arrive during play. A special day is the real birthday when it falls within the next 14 in-game days. Otherwise it is a small "good news" occasion built from the NPC's own generated data, such as a new ability or a new book for a reader. It never invents facts that contradict known ones.
- **The Lv5 milestone is a celebration, not a gate.** Reaching Lv5 works as before. Afterwards the friend offers the best-friend event once, including to players who reached Lv5 before this update. *Why:* a missed or unavailable event must never block a friendship.
- **Spontaneous approaches are "soft".** From Lv3, an NPC may walk over, wave, say one bubble line and wait about 8 s next to a marker. Talking opens what they came for; walking away cancels it. Limits: one approach per scene entry, two per day in total, one per NPC per day. None during the first-day script, during an active goal (lost item, directions), or in the first seconds after entering a scene. The scripted first-day morning approach stays as it is. *Previous:* Lv4+ friends walked over and started a conversation automatically.
- **Adjectives stay within the classroom rule.** The brief lists "strong" and "talented". Both stay reserved for non-roster characters, along with smart, popular, cute and famous. Roster NPCs are described as kind, friendly, funny, cool, active or brave. New: "He is good at ___.", built from generated abilities and interests.
- **Persona 5 is a mechanics reference only.** No arcana or tarot, no "Confidant" or "Rank" wording, and no Persona-like UI. The game keeps its own "Connection" terms and celebration cards.

### Added
- **A "next step" hint on each friend's journal page**, e.g. "🎨 Yuki wants to draw with you.", "📸 Do something together, just you two!" when the level gate is closed, or "💌 Saturday at the park". Ten-year-olds need to see what to do next, and the hint also explains a full bar that is not levelling up.
- **A per-friend memory timeline** on the friend page: day, what you did, where, and a caption.
- **Save version 2 with an idempotent `migrateSave`**, tested against a version 1 save fixture.
- **A read-only harness snapshot, `window.__esl.friendship`,** with open offers, the active event, recent history and today's approach count, plus debug actions to offer or run any template. E2E tests assert state instead of scraping text.
- **E2E scripts start their own dev server**, so acceptance can run unattended.

### Connection levels: behaviour table
| Lv | Name | Around town | When you talk | They start |
|---|---|---|---|---|
| 0 | Stranger | Busy with their own thing | Meeting: "What's your name?" | — |
| 1 | Acquaintance | Look at you; "Hello!" bubble when you're close | Polite greeting; discover interests | — |
| 2 | Friend | Wave when you pass | Greet you by name; ordinary hangouts and invitations | Evening invitation messages (existing) |
| 3 | Good friend | May come over (soft approach) | Their own interests (hobby events); introduce you to friends; ask for small help | Soft approaches; messages about tomorrow |
| 4 | Close friend | Come over, recall a past outing and suggest another | Special day, shared project, practice help; home-visit requests (Phase 3) | Weekend outing invitations |
| 5 | Best friend | Personal greeting that uses what you told them; may bring a friend over to introduce | Best-friend milestone once, then recurring special interactions | Spontaneous invitations and introductions |

### Friendship event templates
| id | Kind | From | Cost | What the player does |
|---|---|---|---|---|
| hobby | Shared interest | Lv2 | 1 period | Joins the friend's favourite thing. Either a new Hobby Session (draw together, nature spotting, music time) or the existing soccer, catch or café when that is their interest |
| practice | Help a friend | Lv3 | 1 period | Coaches the friend at catch or soccer, or keeps the beat for music; the friend improves over the rounds |
| find | Help a friend | Lv1 | none | The existing lost-item search; the item now comes from the friend's interests |
| delivery | Help a friend | Lv3 | none | Carries a present to a third classmate: "This is from Ken. Here you are!" |
| meet_request | Introducing friends | Lv3 | none | "I want to meet Hana." The player introduces them in three lines: This is… / … is my friend / likes, can or is good at… |
| remember | Remembering | Lv2 | none | The friend recalls a real memory; the player picks "again", "something different" or "next time", which becomes a plan |
| special_day | Special day | Lv4 | 1 period | Birthday or good-news celebration at the café; the player orders for the friend from what they know the friend likes |
| project | Shared project | Lv4 | 1 period | Makes a card or drawing for a mutual friend together (Hobby Session draw), then delivers it |
| best_friend | Milestone | Lv5 | 1 period, once | A special place; the friend recalls real memories; the player picks their favourite day and receives a personal keepsake |
| group_outing | Group (Phase 2) | Lv2 | 1 period | Invites 2–3 friends; availability is checked; everyone plays together |
| npc_hangout | NPC–NPC (Phase 2) | — | none | Linked classmates are seen together; a friend mentions it and may ask "Do you want to come?" |
| home_visit | Home (Phase 3) | Lv4 | 1 period | A friend visits your room: photos and souvenirs, then one home game |

Rules for every template:
- At most one open offer per NPC, and at most two new offers per day across the class, plus one "remember".
- A per-NPC cooldown follows completion or decline.
- XP is awarded once per event instance; completing the same instance twice (after a reload or a double tap) does nothing.
- An offer that is never taken expires quietly and can come back later.
- Wrong or unknown answers inside an event never fail it. The friend gently corrects or fills in, and the event completes.

### Implementation notes (built 2026-11-16, all three phases)
- **Where things live.** `src/world/personality.js` holds styles and their line banks. `src/data/events.js` holds templates and the interest → activity, lost item and present tables. `src/world/friendship.js` holds the pure event lifecycle, availability, memory references and approach limits. `src/world/social.js` holds NPC–NPC hangouts. `src/world/migrate.js` holds the save upgrade. Flows are in `src/dialogue/events.js` (registry), `src/dialogue/outing.js` (phone plan composer) and `src/activities/{hobby,milestone,visit}.js`. A template is offered only when a flow is registered for it.
- **Save shape.** `save.friendship` holds instances, counts (so ids stay deterministic), done counts, cooldowns, history, memory-reference counters, daily counters and `activeId`. `save.npcPlans` holds hangouts and `save.player.answers` holds what the player told friends. Save version 2; `migrateSave` runs in the Game constructor on every save and is idempotent. `activeId` is cleared on every load, so an event cut off by a reload simply stays offered or scheduled with nothing awarded.
- **Style assignment** deals the least-represented style first, so a 12-NPC class gets exactly two of each. Newcomers fill the gaps and existing styles never move.
- **XP values.** Remember 3 (it is a conversation that leads to a plan). Lost-item favour 8, unchanged. Other no-time favours 6. Period events 12, replacing an activity's usual 10 + 4 rather than adding to it. Group outings 6 per friend plus the existing first-time activity bonus. Correctly remembering a fact inside an event (the friend's favourite food at their party, a card about what the friend likes) adds +2 once.
- **Memory references.** Only real memories are used. Each is referenced at most once per 3 days and 3 times in total. Events store their own `recall` sentence, written from the friend's point of view, so references never invent detail. The first-day morning callback keeps the brief's exact script. A light "thank you for yesterday" callback stays for memories from yesterday when the daily remember budget is used up.
- **Spontaneous approaches.** The chance per scene entry is `(0.2 + 0.5 × style approach share) × (0.7 at Lv3, 1.0 at Lv4+)`. Evening invitation chances are multiplied by `0.6 + 0.8 × message share`, so styles move initiative between channels while the totals stay about equal. A friend who came over always has something to offer when you talk to them.
- **Level-dependent ambience.** Lv1 friends say a hello bubble. Lv2 friends wave (a 👋 bubble when seated). Lv3+ friends say hi and wave. All of this happens once per scene visit.
- **Group outings.** They can be planned three ways: from the phone ("Make a plan with friends": where → what → "How about ___?" → who, up to three), by bringing a nearby friend along ("Let's invite Hana, too!"), or by accepting a friend's message that brings a friend along. Busy friends give a real reason (piano lessons, grandparents, library, another plan, meeting another classmate). Every `away:*` slot now counts as busy for event scheduling. In ball play the partner rotates every two turns so every friend plays. Café table T2 got a fourth chair, so the staff serving spot moved to the corner; the second friend takes the chair facing the camera and the camera rises for a table of four.
- **NPC–NPC hangouts.** Any link increase made through play (an introduction, a delivered present, a group outing) schedules one hangout within 4 days on a slot where both are free. Limits: two a day, one pending per pair, one per pair every 4 days. A player plan always wins, and a friend never waits alone when their partner is busy with the player. Meeting them during the hangout lets you join; afterwards either one tells you about it once and can turn it into a group plan.
- **Hobby Session.** It is card-driven so it stays reliable on Chromebooks and with touch. Drawing paints on a 2D canvas overlay, and the finished drawing becomes the memory photo. Nature spotting moves the camera to park hide points and asks "How many?" with number cards. Music uses the existing timing meter with notes. Practice inverts ball play (the player throws, the friend learns). A project card becomes a delivery when the activity ends.
- **Home visits.** The bedroom got a TV corner on the north wall (a low stand, a TV, two controllers). The visitor walks in from the door to a free spot on the rug and waits with the plan marker. The visit covers the photo wall (a real memory), "How many games do you have?", then the player chooses a racing game or a souvenir tour; the friend then leaves through the door. Visits happen only in free periods, so they never collide with sleep. Sleeping through a planned visit is a gentle miss and the offer comes back.
- **Friends ask about you.** At Lv2+, a friend sometimes asks "What do you do on Saturdays?", "What food do you like?" or "Do you have a pet?" (once each per friend). Best friends then use the answers in personal greetings.

## 2026-11-19 — Procedural background music (school-life Part 4)

- **What:** Nine distinct pentatonic loops for town, classroom, café, bedroom,
  mall, friend's home, music room, gym and art room. Unknown places use town;
  title and creator remain silent. Soft sine bass and triangle melody at
  70–96 BPM share the existing AudioContext, with an independent music gain.
  Quiet (20%) is the default; Off, Quiet and Normal (40%) in Teacher Setup
  seed new profiles. The player's Music / 音楽 slider saves independently of
  sound-effects mute. Older saves use Quiet without changing save version 3
  or the idempotent v1–v3 migration path.
- **Why:** Music adds warmth without carrying information or competing with
  English. Muted classrooms lose nothing. Microphone listening fades music to
  silence; read-aloud uses 15% of the chosen level; Music Time (also used by
  the school lesson) uses 2.5%. Idempotent holds protect overlapping sessions,
  cancellation, late callbacks and missing browser completion events.
- **Implementation decision:** One 100ms look-ahead scheduler schedules only
  250ms ahead on Web Audio time, with few overlapping voices and explicit node
  cleanup. Places crossfade over one second; retired tracks disconnect after
  fading. Music waits for the existing audio unlock from a pointer/key gesture.
  A frozen `window.__esl.music` snapshot supports deterministic state checks.
- **Rejected:** Audio files (downloads, licensing and asset weight), another
  AudioContext (unnecessary device cost), per-note JavaScript intervals (timing
  jitter), dense chords/percussion (compete with speech), and coupling music
  to SFX mute (teachers and players need separate controls).
- **Verification approach:** Fake-context node checks cover scheduling,
  crossfades and cleanup; `e2e:music` covers the actual settings/default UI,
  reloads, all place identities and mocked speech lifecycle. Automated checks
  cannot judge musical balance through classroom speakers; listening on a real
  Chromebook remains a human review task.

## 2026-11-19 — Fixed weekly school rhythm: homeroom on Tuesday and Thursday

- **What:** Only a specialist subject in **period 1** moves the morning to its
  room (`lessonForDay`). `TIMETABLE` was reordered so the week is Monday gym
  (P.E.), Tuesday homeroom, Wednesday music room, Thursday homeroom, Friday art
  room. Specialist subjects later in the day (Tuesday music and arts, Thursday
  P.E.) are still in the timetable, the wall chart and "What do you have
  today?", but the morning stays at the homeroom desk.
- **Why:** The old rule ("first specialist subject that day") plus a timetable
  with one on every weekday meant the ordinary homeroom morning never happened
  after day 0. Homeroom is where the class feels like a class; each room stays a
  weekly event; a fixed pattern ("Monday is P.E.") gives students real schedule
  language. Lesson XP is capped per partner per week, so pacing is unchanged.
- **Rejected:** A realistic Japanese Grade 5 timetable (P.E. about three times a
  week), which would bring back the always-a-lesson problem; seeded random
  lesson days, which are less predictable for students talking about the week.
  Decided with the user in conversation, 2026-11-19.
