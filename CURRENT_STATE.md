# Current State

## Status (2026-11-19)
School-life expansion in progress on branch `school-life-expansion`. Part 1, Niji Mall
(shops, food court, mall outings, save v3), is committed as `d078832`; see
DESIGN_DECISIONS.md 2026-11-17. Part 2, visiting a friend's home, is implemented
without a new save version; see the 2026-11-19 decision entry. Parts 3-4 are next.

The Friendship Depth expansion (SPEC.md Part 2) is built: all three phases.
Phase 1 covers behaviour styles, data-driven friendship events, level-dependent
behaviour and memory follow-ups. Phase 2 covers group outings and NPC–NPC
friendships. Phase 3 covers home visits. The design review, with what was
accepted, modified and added, is in DESIGN_DECISIONS.md → 2026-11-16. Claude
built it directly at the user's request (no workers).

Committed as `c561e0a`, merged to `main` and deployed to GitHub Pages (2026-11-17): https://nolancasama.github.io/esl-social-life/. The automated suite is green; the remaining checks need a person (see Next Steps).

## What Exists
- **Visiting a friend's home (2026-11-19):** Lv4+ friends invite by message or
  in person, or the player asks “Can I come to your house?” in the topic menu.
  The existing event cards handle acceptance, another day and decline; real
  schedules explain busy replies. A booked host waits at the blue-roof neighbour
  north of the player's home, with map/goal directions. The door confirms the
  one-free-period cost; without a current plan it offers a friendly not-now card.
  One shared dollhouse interior derives wall colour, exact pet type/count and
  interest props from existing generated data. Greeting, room tour, optional pet
  counting, juice offer, one drawing/music/racing/photo activity and goodbye all
  use Japanese-hinted cards. Hobby Session and racing are reused. The existing
  personal-event path awards 12 XP once, stores a journal/recall memory focused
  on the host, advances one period and returns to the same pavement. Reloading
  an unfinished visit keeps a replayable plan without awarding partial rewards.
  The viewer and 90-call café/mall perf budget include `friendhouse`.
- **Niji Mall (2026-11-17):** the town door opens a new indoor scene with an
  entrance planter/directory, three shops with nine round-yen purchases, four
  food counters and shared four-seat tables. Saved weekly pocket money cannot
  go negative; purchases appear on the bedroom shelf. Solo counter service is
  free/no-time, like the café. Friends order their known favorites before eating
  together, and can optionally visit one shop. Phone, nearby/friend invitations,
  NPC hangouts, map goals and fresh weekend schedules all support mall outings.
  Existing group rewards/focus and one-on-one memory gates remain unchanged.
  Save version 3 adds the wallet while loading v1 and v2 saves idempotently.
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
- **Save version 3** (`world/migrate.js`, idempotent, run in the Game constructor). Version 1/2 saves keep every level, XP value and memory.
- **Test hooks:** `window.__esl.friendship` (a frozen snapshot) and `window.__esl.friendshipDebug` (offer / complete / approach). Styles are not in the debug panel.

## Verification (observed 2026-11-19, headless Chrome + SwiftShader, 1366×768)
- `npm test` 72/72 PASS, including nine new personalisation/lifecycle/message tests.
- `npm run e2e` PASS: playthrough, scenarios and mocked speech. The initial
  attempt was interrupted by Vite hot reloads during source edits; the clean
  run passed with source frozen.
- `npm run e2e:friendhouse` PASS: real invitation cards, walking along the
  residential lane, normal door action and time confirmation, greeting, pet,
  snack, racing, goodbye, exact one-period advance, 12 event XP, one personal
  memory, journal timeline, same-door pavement return and duplicate completion
  after reload. It also reloads at the greeting, verifies no partial rewards or
  time cost, then walks back and completes the same scheduled visit.
- Harness trust proof: the known-good friend-house run exited 0; changing its
  greeting selector to `.dlg-en.friendhouse-deliberately-broken` produced the
  expected exit 1 (15-second timeout). The selector was restored. Negative
  proof screenshots use a separate external directory.
- Five friend-house screenshots (town door, greeting, pet, activity, goodbye):
  `C:\Users\nolan\AppData\Local\Temp\esl-friendhouse-2026-11-19\`.
  Door and pet frames inspected for readable English/Japanese and visible host,
  player and generated pet. Claude retains final aesthetic review.

### Prior verification (2026-11-18, headless Chrome + SwiftShader, 1366×768)
- `npm test` 63/63 PASS; `npm run build` PASS.
- Full suite on the final mall code: playthrough, scenarios, speech, friendship, hobby, visits, journey and mall PASS; groups PASS 4/4 after the hangout-report priority fix (below).
- `e2e:mall` proven trusted: known-good pass plus a deliberately broken selector failing with exit 1 (reverted). It covers the town door, a ¥500 purchase, a solo food order, a phone-composed two-friend meal (`focus: []`), exact XP, the exit spawn and the bedroom souvenir.
- `e2e:journey` 5/5. Its earlier flakiness predated the mall (reproduced on a clean `git archive` of e555c40): an ambient 💬 bubble replaced the greeting before the test read it, and the test chose "Maybe next time." over a proposed date. The test now watches animation frames and attends the booked slot; the assertions are unchanged or stricter.
- Groups fixes, all in game logic with regression unit tests: (1) a pending hangout report is told before an ordinary memory recall (`talk.js`); (2) explicit hangout pairs are placed before routine groups and lost-item searches, so a pair is never split (`npcs.js`); (3) when a friend has several hangouts to report, the introduction hangout comes first, then the oldest (`social.js hangoutToReport`). The test now picks a calendar window with a real busy classmate and an introduction pair that can actually meet; `hangout null` was legitimate when a pair had no common free slot.
- Perf (`e2e:perf`): mall 25 draw calls / 9 static; café 37 / 5; both under the 90-call ceiling. SwiftShader proxies, not Chromebook numbers.
- Mall screenshots reviewed by eye: atrium (closed entrance and corner), shop counter, food court with a table of three. Outside the repo under `%TEMP%/esl-niji-mall-2026-11-17*` and `%TEMP%/esl-mall-correction-20261117/`.
- Earlier verification of the Friendship Depth expansion (2026-11-16/17) still stands: runner trusted, `friendship` 5/5 after its test-only fixes, and the screenshots listed in git history were reviewed.

## Known Issues / Not Verified
- No run on a real Chromebook. Real microphone and voices are untested (speech is mocked).
- Food-court counter signs are small from the dollhouse camera; the walk-up prompt shows each counter's name. Polish later if playtests show it matters.
- Characters walk in straight lines; soft approaches are skipped when the walk is not clear. No pathfinding.
- Several e2e scripts use debug hooks to reach late-game content quickly; the journey script plays the natural path.
- Bubbles over characters are English only; the Japanese hint appears once you talk.
- Not built yet in this expansion: specialist classrooms and the school day,
  music (queued, see Next Steps).

## Next Steps
1. Play on a classroom Chromebook: frame rate with groups and visits, touch on the composer cards, read-aloud quality.
2. Playtest pacing: how many days to Lv3, Lv4 and Lv5 with one-on-one memories; whether 2 event offers a day feels right; whether soft approaches feel welcome rather than intrusive.
3. Collect classroom transcripts for new phrases (`VARIANTS` in `src/dialogue/intent.js`): "How about ___?", "Can I join?", "This is from ___."
4. School-life expansion (user asked for all four, 2026-11-17), in this order on branch `school-life-expansion`: Niji Mall (done, `d078832`), visiting a friend's home (done), then:
   - **Part 3, school day and specialist classrooms:** a music room, gym and art room. On days the timetable has music, P.E. or art, the morning lesson happens in that room as a short pair activity with a different classmate each time (music: rhythm game; P.E.: ball play; art: drawing canvas). New lines such as "What do you have today?" / "I have P.E. and math." Lesson memories are capped so pair work cannot level up friendships.
   - **Part 4, music:** gentle background music generated in the browser (no audio files), a different loop per place; pauses while the mic is listening and ducks during read-aloud; a music volume setting plus a default in Teacher Setup.
   Each part has its own e2e script and a full-suite run before the next starts.

## Codex / Delegated Work
Niji Mall was built by Codex and reviewed by Claude (diff, screenshots, full suite rerun by Claude), then committed as `d078832`. The hangout-report priority rule was a direct Claude edit. Codex implemented the friend's-home part (run timed out during final validation); Claude reviewed the diff, made the cat model read as a cat (pointed ears, whiskers, upright tail instead of a curled shiba tail), reran the full suite (unit + 9 e2e suites, all PASS, perf friendhouse 13/90 draw calls) and committed it. No pending worker output.
