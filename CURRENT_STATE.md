# Current State

## Living World & Meaningful Possessions (2026-11-23, live since 2026-11-24)
Design review, frozen decisions and phase notes: DESIGN_DECISIONS.md →
2026-11-23. Phase 1 (reliability) is `c294902`; Phases 2–5 are `d70341f`.
Built by Claude directly (no worker run). Fast-forwarded to `main`
(`42e266f`) and deployed to GitHub Pages on 2026-11-24 (gh-pages `b94f84d`).
`living-world` is pushed as well.
- **Pre-deploy rerun (2026-11-24, Claude):** `npm test` 124/124, build,
  playthrough, scenarios, speech and `e2e:living` PASS. The first
  `e2e:living` attempt failed in the robot section. The harness read the
  pose and the path in two separate calls, so a level change between them
  gave a goal off the board. `42e266f` plans from one snapshot and fails
  fast on an off-board goal. Test-only fix; game code unchanged.
- **Reliability:** activity results are `completed / failed / cancelled`;
  only completed ones reward. Failures recover to explore (bilingual toast,
  no time cost, plan kept). Rewards and time are saved together. Duplicate
  unique purchases are refused for free. Dev-only fault points
  (`window.__esl.fault`).
- **My Things** (phone, bedroom shelf): ball (park kick-ups; soccer fans
  notice it and play), board game (Picture Pairs with a friend's real turns),
  robot (Go straight / Turn left / Turn right / Stop on a grid), book and
  comic (four-page read-aloud stories), coloured pencils (drawing hangs above
  the bed), cap and T-shirt (mirror; persists, restores the original look),
  kendama. State in `save.things` (idempotent, no save-version bump).
- **Shared play:** racing against a live simulated rival car, rhythm duets,
  home visits ask "What do you want to play?" and the choice decides the
  activity. Memories record item, place, game and result, and recall them.
- **NPC walks** stop after 0.8 s without progress (was: walk in place for
  10 s).
- Test hooks: `window.__esl.thingPlay` (frozen), `.reliability`, `.fault`.
- **Verification (2026-11-23, Claude, headless Chrome + SwiftShader
  1366×768):** `npm test` 124/124, build, playthrough 4/4, scenarios,
  speech, friendship-all, friendhouse, school, mall, arcade, recovery, music,
  perf (home 14/60, town 46/70, mall floors 16–27/90) all PASS. `e2e:living`
  passed, and with `LIVING_HARNESS_BROKEN_ASSERTION=1` it failed on exactly
  that assertion (exit 1). Its earlier failures were harness races and
  setup ambiguity, fixed in the script (DESIGN_DECISIONS Phase 5 notes).
  Screenshots inspected by Claude: `%TEMP%\esl-living-review\`,
  `%TEMP%\esl-living-probe\` (kick-ups camera, robot board).

## Niji Mall three floors (2026-11-22, live)
Design review and all phase notes: DESIGN_DECISIONS.md → 2026-11-22. Phase 1
`ae0bc7b` and Phase 2 `edfbd94` were built by Codex and reviewed by Claude;
Phases 3–4 (`29ad715`) were built by Claude directly at the user's request
(Codex hit a usage limit). Fast-forwarded to `main` and deployed to GitHub
Pages on 2026-11-22 (gh-pages `f6be597`); the live page serves the new build.
Local `main` is still the stale worktree at `428f2e3` (see Next Steps 5);
`origin/main` is current.
- **Floors:** scenes `mall` (1F Shopping), `mall2` (2F Food Court), `mall3` (3F
  Game Center); all are location `mall`. Escalators, an elevator panel and a
  directory on every floor; `game.changeFloor` never advances time and carries
  engaged companions. NPC floor per slot from `mallFloorFor` (plans → 1F
  entrance, shopping → 1F, meals/hangouts → 2F, some games fans → 3F).
- **Food (2F):** fixed yen prices, paid at hand-over, free water fallback,
  pending meal saved (`save.mallMeal`) so reloads never charge twice. Solo meals:
  carry the tray, sit at a free seat, four shrinking bites, Skip, dishes cleared;
  no time or XP. Group meals: own dishes, staggered bites, player pays only for
  their own food. Café food stays free.
- **Game Center (3F):** racing (steer ◀ ▶, navigator calls turns, STOP at the
  finish, ghost car), crane (choose a prize, steer with cues, grab by position
  only, six souvenir prizes each won once) and rhythm (shared `rhythm()` with
  Perfect/Good/Miss). Canvas cabinet screens in `ui/arcadescreen.js`; rules in
  `world/arcade.js`; play in `activities/arcade.js`. Solo play is free, no time/XP.
- **Outings:** "What do you want to do?" → shop / eat / games, friends state
  wishes from generated interests, "Where do you want to go?", the group travels
  together; one period and one reward per outing; `detail.mallChoice` drives
  recall and the journal line.
- Test hooks: `window.__esl.mallTravel`, `.mallMeal`, `.arcade` (frozen).
- **Verification (2026-11-22, Claude, headless Chrome + SwiftShader 1366×768):**
  `npm test` 106/106, build, `e2e` (playthrough, scenarios, speech),
  `e2e:mall`, `e2e:arcade` (new), `e2e:perf` (mall 16, mall2 26, mall3 18 of 90
  draw calls), `e2e:friendship-all`, `e2e:friendhouse`, `e2e:school`,
  `e2e:music` all PASS. `e2e:scenarios` failed once on the lost-item/directions
  section and passed on rerun (not mall code). Harness trust: Phase 2's
  `MALL_HARNESS_BROKEN_ASSERTION=1` fails with exit 1; `ARCADE_HARNESS_BROKEN_ASSERTION=1`
  is the arcade equivalent. Screenshots inspected by Claude:
  `%TEMP%\esl-mall-p4-review\` (1F, 3F), `%TEMP%\esl-arcade-review2\`
  (crane, racing, rhythm, outing with a friend), `%TEMP%\esl-mall-p2-review\`
  (solo and group meals).

## Status (2026-11-19)
School-life expansion built on branch `school-life-expansion`. Part 1, Niji Mall, is committed as `d078832`; Part 2, visiting a friend's home, as `e0274e1`; Part 3, the school day with the music room, gym and art room, as `3af830f` (see DESIGN_DECISIONS.md 2026-11-19); Part 4, procedural music, as `2d8c0e7`. All four parts were merged to `main` (fast-forward) and deployed to GitHub Pages on 2026-11-19 (gh-pages `0fc4ee7`).

The Friendship Depth expansion (SPEC.md Part 2) is built: all three phases.
Phase 1 covers behaviour styles, data-driven friendship events, level-dependent
behaviour and memory follow-ups. Phase 2 covers group outings and NPC–NPC
friendships. Phase 3 covers home visits. The design review, with what was
accepted, modified and added, is in DESIGN_DECISIONS.md → 2026-11-16. Claude
built it directly at the user's request (no workers).

Committed as `c561e0a`, merged to `main` and deployed to GitHub Pages (2026-11-17): https://nolancasama.github.io/esl-social-life/. The automated suite is green; the remaining checks need a person (see Next Steps).

## What Exists
- **Music (2026-11-19, Part 4):** nine quiet procedural place loops, one-second
  crossfades, independent Music / 音楽 volume, and Teacher Setup defaults for
  new players. Music pauses for the microphone, ducks for read-aloud and Music
  Time (including the school lesson), and starts only after an audio-unlock
  gesture. No audio files or new dependencies; old profiles default to Quiet.
  `window.__esl.music` exposes a frozen test snapshot.
- **School day (2026-11-19):** music room, gym and art room. When period 1 is music, P.E. or arts and crafts the morning starts in that room: Monday gym, Wednesday music room, Friday art room; Tuesday and Thursday stay in homeroom (DESIGN_DECISIONS 2026-11-19, fixed weekly rhythm); the teacher introduces the lesson, a rotating partner (seeded ring over the whole class) does a short pair activity (rhythm meter, catch, drawing canvas), then time advances like the classroom desk. Lesson XP is at most +2 per partner per week through the fact cap; lesson memories never open level gates. "What do you have today?" also appears once per school day in a quiet casual chat, answered from the real timetable. `e2e:school` covers it; perf includes the three rooms.
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

## Part 4 verification (2026-11-19, headless Chrome + SwiftShader, 1366×768)
- Claude's rerun after the timetable change: `npm test` 80/80, build, `e2e`,
  `e2e:school`, `e2e:music`, `e2e:mall`, `e2e:friendhouse`,
  `e2e:friendship-all`, `e2e:perf` all PASS. (`e2e:school` and `e2e:mall`
  need `SHOTS_DIR` set to a folder outside the repo.)
- `npm test`: 80/80 PASS, including the fake-context music lifecycle test.
- `npm run build`: PASS.
- `npm run e2e`: PASS (playthrough, scenarios and mocked speech).
- `npm run e2e:perf`: PASS for all nine scenes. Draw calls: classroom 96/150,
  music room 119/150, gym 118/150, art room 118/150, town 56/70, café 62/90,
  mall 25/90, bedroom 14/60, friend's home 13/90. Software-rendering proxies,
  not real Chromebook measurements.
- `npm run e2e:music`: PASS on the final script. Covers pre-gesture silence,
  all nine themes, the Teacher Setup default applied through creator UI,
  player volume persistence, independent SFX mute, mocked mic/read-aloud
  overlap/error/cancel and late callbacks, and a real music-room rhythm lesson
  with activity ducking and restoration. The new script initially needed two
  harness corrections: finish the replayed welcome after reload; start the
  held read-aloud without awaiting its completion promise before asserting.
- Harness trust proof: a known-good music run exited 0; deliberately changing
  the theme expectation to `scene + '-broken'` failed with exit 1 on all nine
  themes. That break was reverted; the final extended run exited 0.
- Visual evidence: settings and music-room rhythm screenshots captured outside
  the repo in `C:\Users\nolan\AppData\Local\Temp\esl-music\` and inspected
  at 1366×768. Claude retains final aesthetic judgment; musical balance needs
  human listening on a real Chromebook.

### Earlier verification (2026-11-19)
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
- Music's acoustic balance on real classroom speakers and real-device speech
  coordination still need a Chromebook listening check; automated audio state
  checks use mocked speech and do not listen to the output.
- `e2e:friendship` is occasionally flaky: in section H the best friend can start the random lost-ball favour instead of the milestone (seen once in 3 runs on 2026-11-19; not caused by the school work).
- School rooms (perf: 118-119 of 150 draw calls each): classmates stand in loose spots around the room during the lesson; in the gym the teacher stands behind the catch partner. Fine for now; polish if playtests show it matters.

## Next Steps
00. Living World is live. On a Chromebook check the robot and Picture Pairs
   touch input, kick-up timing and the book overlay.
0. Niji Mall three floors is live. On a Chromebook check the arcade touch
   buttons (hold to steer), crane difficulty (3 tries, grip radius 0.065) and
   race length (~21 s).
1. Play on a classroom Chromebook: frame rate with groups and visits, touch on the composer cards, read-aloud quality.
2. Playtest pacing: how many days to Lv3, Lv4 and Lv5 with one-on-one memories; whether 2 event offers a day feels right; whether soft approaches feel welcome rather than intrusive.
3. Collect classroom transcripts for new phrases (`VARIANTS` in `src/dialogue/intent.js`): "How about ___?", "Can I join?", "This is from ___."
4. School-life expansion is live. Listen to the music on a classroom Chromebook
   (balance, speech ducking) and fix anything found on `main`.

## Codex / Delegated Work
Living World (all five phases): Claude's own work, no worker output pending.

Niji Mall floors: Phase 1–2 Codex output reviewed and committed (Phase 2's run
ended on a Codex usage limit; Claude reviewed the partial diff, ran acceptance
and capped meal receipts). Phases 3–4 are Claude's own work. No pending worker
output.

Part 4 (music) was built by Codex and reviewed by Claude: diff read, scene ids checked against theme names, screenshots inspected, full suite rerun by Claude. Claude then made the fixed-weekly-rhythm timetable change directly (content.js, school.js, school tests, e2e:school/e2e:music day fixtures). No pending worker output.

Part 3 was built by Codex (stopped on a usage limit before validation) and finished by Claude at the user's request: casual-question priority fix, two e2e fixture fixes, harness proof (known-good pass; a deliberately broken intro line failed with exit 1, reverted), full suite rerun. No pending worker output.

Niji Mall (first version) was built by Codex and reviewed by Claude (diff, screenshots, full suite rerun by Claude), then committed as `d078832`. The hangout-report priority rule was a direct Claude edit. Codex implemented the friend's-home part (run timed out during final validation); Claude reviewed the diff, made the cat model read as a cat (pointed ears, whiskers, upright tail instead of a curled shiba tail), reran the full suite (unit + 9 e2e suites, all PASS, perf friendhouse 13/90 draw calls) and committed it. No pending worker output.
