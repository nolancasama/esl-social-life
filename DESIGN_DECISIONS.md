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
