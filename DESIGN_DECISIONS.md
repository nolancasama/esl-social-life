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
