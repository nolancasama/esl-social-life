# Current State

## Status (2026-11-16)
The Friendship Depth expansion (SPEC.md Part 2) is built: all three phases.
Phase 1 covers behaviour styles, data-driven friendship events, level-dependent
behaviour and memory follow-ups. Phase 2 covers group outings and NPC–NPC
friendships. Phase 3 covers home visits. The design review, with what was
accepted, modified and added, is in DESIGN_DECISIONS.md → 2026-11-16. Claude
built it directly at the user's request (no workers).

Committed as `c561e0a`, merged to `main` and deployed to GitHub Pages (2026-11-17): https://nolancasama.github.io/esl-social-life/. The automated suite is green; the remaining checks need a person (see Next Steps).

## What Exists
- **Screens, world, people, talk, speech, activities, directions, systems:** as in the first slice: title, profiles, Teacher Setup, creator, Sakura Town plus classroom, café and bedroom, seeded fictional NPCs with schedules, the first-day script, the topic menu, optional on-device speech, catch/soccer, café, lost item, café counter, the directions visitor, calendar, map, journal, messages, local saves.
- **Behaviour styles** (`world/personality.js`): six positive styles (outgoing, thoughtful, playful, creative, curious, considerate). Each is assigned once per class from the class seed and NPC id only, balanced across the class, and stored on the class NPC. Styles shape greetings, invitation wording, reactions, gestures, preferred likes, event leanings, and in-person vs message initiative. They are never shown as labels and never read by XP code.
- **Level behaviour:** Lv1 friends say hello, Lv2 friends wave, Lv3+ friends say hi and may come over (a soft approach: they wait, and you can walk away). Lv4+ friends ask to visit. Lv5 friends greet you personally and have a one-time best-friend milestone.
- **Friendship events** (`data/events.js`, `world/friendship.js`, `dialogue/events.js`):
  - Hobby Session (draw together, nature spotting, music time) or the friend's sport or café.
  - Help a friend practise.
  - Lost-item favour (the item now matches the friend's interests).
  - Deliver a present to a mutual friend.
  - "Can you introduce us?", using a three-line player introduction (This is… / … is my friend / likes, can or is good at…).
  - Remember-a-memory leading to a plan.
  - Special day (birthday or good news) party at the café, where you order for the friend.
  - Card project for a mutual friend, then delivered.
  - Best-friend milestone on a park bench with a keepsake.
  - Group outing and home visit.

  Events show the time cost first, can be postponed ("How about Saturday?"), never cost connection when declined, missed or expired, and pay XP once per instance.
- **Memories:** event memories store their own recall sentence. Friends reference real memories at most once per 3 days and 3 times in total. The journal friend page has a next-step hint and a memory timeline.
- **Friends ask about you** ("What do you do on Saturdays?", food, pets); best friends use the answers.
- **Group outings:** "📅 Make a plan with friends" on the phone (where → what → when → who, up to three). You can also invite a nearby friend along, or accept a friend's invitation that brings someone. Busy friends give real reasons. Friends take turns in ball play; the café table seats four. Each friend gets 6 XP and the friends become closer, but only one-on-one memories open levels (`focus`).
- **NPC–NPC hangouts** (`world/social.js`): new or stronger links from play lead to the two classmates meeting up; you can join them, and they tell you about it afterwards.
- **Home visits:** a visit request comes by message or in person, or you invite a friend ("Do you want to come to my house?"). The friend walks in from the door and you look at the photo wall together. They ask "How many games do you have?" and then you play the racing game on the new TV or show your souvenirs. They leave through the door.
- **Save version 2** (`world/migrate.js`, idempotent, run in the Game constructor). Version 1 saves keep every level, XP value and memory.
- **Test hooks:** `window.__esl.friendship` (a frozen snapshot) and `window.__esl.friendshipDebug` (offer / complete / approach). Styles are not in the debug panel.

## Verification (observed 2026-11-16, headless Chrome + SwiftShader, 1366×768)
- `npm test`: 52/52 pass (22 existing plus styles, framework, migration and social). `npm run build`: OK.
- E2E runner (`scripts/run-e2e.mjs`) trusted: a baseline run passed; an unknown script exits 2 and a dead server exits 1. A known-bad mutation of the focus rule made the gate unit test fail.
- Full suite (2026-11-17, final code): playthrough, scenarios, speech, hobby, groups, visits and journey PASS; `npm run build` OK.
- `friendship` was flaky because NPC placement is seeded from the save id, which is new every run. Two test-only fixes in `scripts/friendship.mjs`: the best-friend pick falls back to the section-B pass-by friends, and `standNear` picks a spot that passes the game's own clear-walk check. After the fixes: 5/5 fresh-save runs PASS. Its `approach` log line now records clearSpot / actorMode / busy, to diagnose any recurrence.
- Screenshots reviewed by eye:
  - Level greetings, soft approach, delivery goal and journal next-step and timeline.
  - Drawing canvas, card project, shelf souvenirs and photo wall.
  - Park group turn-taking and café table of four.
  - NPC hangout at the café.
  - Visitor arrival on the rug and the racing game at the TV.

## Known Issues / Not Verified
- No run on a real Chromebook. PERF_PENDING. Real microphone and voices are still untested (speech is mocked).
- Characters walk in straight lines. Soft approaches are skipped when the walk is not clear (e.g. between desks); there is no pathfinding.
- Several e2e scripts use debug hooks to set levels or offer a specific event so they can reach late-game content quickly. The journey script plays the natural path (meet → talk → play → an event the friend picked → invitation → later behaviour); only the soft approach is triggered by the hook.
- Bubbles over characters are English only. The Japanese hint appears once you talk.
- Fixed during the full run: the new phone "Make a plan" button reused the accept-button classes and caught the scenarios test's selector, so it now has its own class. Soft approaches through blocked paths cancelled instantly, so they now require a clear walk.
- Not built: Niji Mall interior, NPC houses, music, specialist classrooms.

## Next Steps
1. Play on a classroom Chromebook: frame rate with groups and visits, touch on the composer cards, read-aloud quality.
2. Playtest pacing: how many days to Lv3, Lv4 and Lv5 with one-on-one memories; whether 2 event offers a day feels right; whether soft approaches feel welcome rather than intrusive.
3. Collect classroom transcripts for new phrases (`VARIANTS` in `src/dialogue/intent.js`): "How about ___?", "Can I join?", "This is from ___."
4. Later: NPC houses or visiting a friend's home, the mall food court as an outing place, music.

## Codex / Delegated Work
None. All friendship-depth work was done by Claude directly, at the user's request. No pending worker output.
