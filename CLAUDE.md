# ESL Social Life — working notes

Read `CURRENT_STATE.md` first, then `DESIGN_DECISIONS.md`. The original brief
is `SPEC.md` (section numbers are cited in decisions).

## Commands
- `npm run dev` — Vite dev server on :5173 (needed by the e2e scripts)
- `npm test` — node unit tests for pure logic (`src/**/*.test.mjs`)
- `npm run build` — static build in `dist/` (relative base path)
- `node scripts/playthrough.mjs` — first-day loop through the real UI (must pass)
- `node scripts/scenarios.mjs` — café, catch, lost item, rain, weekend, invitations
- `node scripts/speech.mjs` — speech input with a mocked recognizer
- `node scripts/shots.mjs <scene>[?query]` — dev scene viewer screenshots (`/?view=town&lineup=1`)
  Set `SHOTS_DIR` to keep screenshots out of the repo.

## Map
- `src/world/` pure logic: `generator.js` (roster → fictional NPCs, links, schedules),
  `schedule.js`, `time.js`, `relationships.js` (XP, level gates), `progression.js`.
- `src/game/` runtime: `game.js` (orchestrator, time flow, interaction), `world.js`
  (per-player model: plans, messages, memories, daily events), `npcs.js` (placement and
  ambient behaviour), `player.js`, `input.js`.
- `src/dialogue/` `talk.js` (all conversation flows), `lines.js` (sentence builders, en+ja),
  `runner.js` (say/ask), `ui.js` (dialogue box + cards + mic), `intent.js` (speech matching),
  `speech.js`, `voice.js`.
- `src/activities/` `ballplay.js` (catch/soccer), `cafe.js`, `index.js` (rewards, lost-item search, counter).
- `src/engine/` three.js: `builder.js` (merged vertex-colour geometry), `character.js`,
  `camera.js`, `collision.js`, `renderer.js`, `scenes/*`.
- `src/ui/` HUD, menus, screens (title/teacher/creator), overlay, debug, CSS.

## Rules of the road
- Every NPC trait is generated; never derive anything from a real name. Pronouns only from the teacher's roster line.
- Conversations must always end in a choice; never a dead end. New lines need `ja` hints written for Grade 5 readers.
- Connection never decreases. Fact XP is capped per day; Lv3+ needs shared memories (see relationships.js).
- Speech failures (no speech, timeout, mic off, denied) are never penalised and never force a mode.
- Judge visual changes from screenshots, not from the code.
