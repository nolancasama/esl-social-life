# ESL Social Life — original brief (condensed)

Condensed from the brief supplied on 2026-11-10. Section numbers match the
original so decisions can cite them. Where the build differs, see
`DESIGN_DECISIONS.md`.

**Vision.** Browser-based third-person 3D social simulation for Japanese Grade 5
ESL students. Persona-style friendships, calendar and time choices + an
Animal-Crossing-like friendly neighbourhood, with an original look. The player
is a new student who meets classmates, builds friendships and arranges
activities; English is the main tool for interacting. Not a quiz collection,
not linear; no boss, story, ending or deadline. Loop: explore → meet → communicate
→ make plans → spend time together → improve relationships → discover
opportunities → new day.

1. **Audience/platform:** Grade 5, beginner–intermediate; school Chromebooks
   (1366×768); keyboard, mouse, touch; large child-friendly controls; no
   accounts/paid services/AI APIs/backend; 60 FPS where practical, graceful at
   30; understandable with audio muted.
2. **Player creation:** name; avatar (hair style/colour, skin, clothing) with
   preview; short self-introduction ("My name is…", "I like…", "My birthday
   is…", "I can…"); saved; the player's own name is excluded from NPCs.
3. **Roster:** teacher pastes names (one per line) → one fictional NPC each;
   prototype 8–12, architecture for 25–30+; dedupe, skip blanks, edit/replace,
   default fictional roster; distinct avatars; generated interests, skills,
   preferences, weekly routines; stable via seeds; pre-existing NPC friendships.
   Privacy: generated traits are fictional; never infer from names; no negative
   rankings or public comparison; levels are private progress; local by default.
4. **Third-person exploration:** camera behind/above; WASD/arrows + touch
   joystick; smooth acceleration; walk/turn animation; collisions; proximity
   interaction + prompts; no wild rotation/clipping; cinematic conversation
   camera, then return.
5. **World:** classroom (morning hub), park (catch, soccer, benches), café/snack
   shop (ordering, sharing), shopping mall (food court, game shop, arcade —
   may come later), player's home (sleep, calendar, messages, friendships,
   souvenirs). Small outdoor hub + light interior loading. No free-access
   specialist rooms yet.
6. **Day/week:** weekdays morning school / after school free / evening home;
   weekends morning + afternoon free / evening home. No continuous ticking;
   casual talk free; major activities cost one period (shown before
   committing); Advance Time option; pause in conversations/minigames;
   forgiving missed appointments; unlimited calendar.
7. **NPC schedules:** by day, period, hobbies, places, friendships, events;
   consistent with occasional variation; NPCs physically present; discovered
   through conversation ("What do you do on Saturdays?"); NPCs socialise
   independently.
8. **Connection 0–5:** Stranger, Acquaintance, Friend, Good friend, Close
   friend, Best friend. XP for meeting, learning and remembering information,
   introductions, shared activities, helping, friendship events; no farming;
   never reduced for mic errors, polite refusals or seeing others. Higher
   levels: warmer greetings, personal talk, invitations, introductions,
   messages, home visits, special experiences.
9. **Social network:** NPCs know each other; start knowing one or two; friends
   introduce new people ("This is Yuki. She is my friend…"); network view;
   NPC–NPC links can grow.
10. **Conversations:** modular, context-sensitive (identity, level, place, time,
    known info, plans, nearby NPCs, language history); varied; categories:
    greetings/intros, interests, abilities, schedules, school, possessions,
    family/pets, describing people, plans, inviting, weather, ordering,
    directions, shared experiences; short and purposeful; authored, not LLM.
11. **Curriculum (woven into play, not 14 quizzes):** (1) introducing others,
    (2) weekly activities, (3) time & routines, (4) self-introductions,
    (5) school subjects, (6) possessions, (7) adjectives about people (positive,
    fictional), (8) action verbs, (9) in/on/under/by, (10) places & attractions
    ("The museum is in Fukui. You can see dinosaurs there."), (11) directions,
    (12) weather (affects plans), (13) food & ordering, (14) want to + verb —
    functional, affects destination/activity/food; distinguish "I want a
    hamburger" vs "I want to eat a hamburger".
12. **Speech/input:** suggested expressions; speak, say something equivalent,
    or tap; optional browser speech recognition with reliable fallback;
    tolerate pronunciation/grammar when meaning is clear; distinguish wrong
    answer / no speech / timeout / mic off / permission unavailable; mic
    on/off is never a failure and never forces a mode; clear mic status;
    friendly retry; never punish friendship; Japanese support.
13. **Shared activities (real interaction):** park catch (timing/positioning),
    café ordering (food shown delivered), find an object (in/on/under/by,
    navigate to it); repeatable with variations. Later: soccer, shopping,
    arcade, drawing, baking, pets, cycling, music, group outings, trips.
14. **Group activities:** system allows several NPCs (availability, interests,
    location, relationships); can create NPC–NPC relationships.
15. **Home:** bedroom, bed/sleep, calendar, messages (accept/decline/
    reschedule), friendship journal, profile, souvenirs; later visits.
16. **Interface:** colourful, child-friendly, Japanese-social-RPG inspired
    (not Persona's UI); day/period, location, prompt, NPC name/level, dialogue,
    invitations, calendar, map, journal, notifications, settings, teacher/debug
    menus; minimal on-screen info; works at 1366×768 without clipping.
17. **Animation:** walk between spots, sit, talk to each other, wave, face the
    speaker, simple expressions and gestures, join activities, approach the
    player at higher levels; light, procedural, distinct silhouettes.
18. **Persistence:** roster, NPC profiles, player, time, schedules, known
    characters, XP, discoveries, messages, plans, events, language history,
    souvenirs; separate profiles per student; roster separate from saves;
    reset/new game; nothing sent remotely.
19. **Language progression:** track encountered/practised expressions; no
    test-like scores; steer opportunities toward less-used language; never
    require perfect grammar.
20. **Open-ended:** meet everyone, reach Lv5 with all, events, stories, outings;
    no grinding; NPCs remember conversations and shared experiences.
21. **First vertical slice:** creation, roster entry, 8–12 NPCs, walking and
    interaction, classroom, park, café, home, connected town, weekday/weekend,
    context conversations, hybrid input, intros/self-intros, likes/abilities/
    routines/want-to, levels 0–5, schedules, one friend introducing another,
    three activities, time advance, calendar + journal, local save.
22. **First day:** begins at home or in the classroom; player knows one NPC who
    is talking to another; introduction; "What do you do on Saturdays?" → "I
    play soccer on Saturdays." → "Do you want to play soccer?" → "Yes! Let's go
    to the park!"; after school play together; connection improves; time
    advances; journal at home; sleep; next morning the NPC refers to the
    shared activity.
23. **Quality:** no placeholder boxes for major gameplay; attractive 3D; real
    movement; working schedules; no spawning in walls; comfortable dialogue
    framing; characters face each other; clear feedback; no repetitive generic
    dialogue; never blocked by mic failure; no dead ends; no broken time
    transitions; no overlapping panels; low CPU for inactive NPCs; debug menu.
24. **Implementation:** modular (world/navigation, player/camera, NPC
    generation, schedules, relationships, dialogue/intents, activities,
    calendar/time, UI, persistence, roster config); small working increments;
    vertical slice first with documented extension points.

---

# Part 2 — Friendship Depth expansion (brief supplied 2026-11-16, condensed)

Goal: make developing friendships the central, enjoyable experience. Extend the
existing systems (do not rebuild). Persona-5-style social links as a mechanics
reference only; original identity; Grade-5-appropriate; still open-ended with
no deadline and no required friendship completion. Decisions and deviations:
`DESIGN_DECISIONS.md` → 2026-11-16.

- **F1 Review first:** preserve first-day intro and activity loop; reuse NPC
  personalities, interests, schedules, network; old saves stay compatible; no
  AI APIs/accounts/backend; run tests after each meaningful change.
- **F2 Levels feel different:** keep Lv0–5; each level changes visible
  behaviour (acquaintance says hello → friend waves → good friend may approach
  → close friend remembers outings and suggests more → best friend invites
  spontaneously and introduces people). Every level stays achievable; nothing is
  permanently blocked by a missed event or an ordinary choice.
- **F3 Personalities:** a few positive behaviour styles (outgoing, quiet/
  thoughtful, playful, creative, curious, helpful/considerate) affecting
  openings, preferred activities, invitations, minigame reactions, gestures,
  event types, ways of showing appreciation. Not rankings. Never inferred from
  real names, appearance or pronouns. No style has an XP advantage.
  Deterministic and stable across saves.
- **F4 Special friendship events:** a reusable framework with ~8–12 templates
  built from interests, personality, memories and level (help a friend, shared
  interests, introducing friends, remembering an experience, a friend's special
  day). The player must actually do something; not a long talk plus XP.
- **F5 Time:** casual talk free; major events usually cost one free period,
  shown before starting, time advances after; small favours free; no loss for
  being busy, declining or missing; events can be rescheduled; never break an
  existing commitment or the calendar.
- **F6 NPCs initiate:** at higher levels they wave, approach, invite, ask about
  past outings, introduce friends, message about tomorrow, suggest weekend
  outings. Limited so exploring stays free; never advances time; the player
  chooses; NPCs keep their own schedules.
- **F7 NPC–NPC friendships:** independent of the player, discoverable, grown
  by group interactions and introductions (later seen together); seeded links
  never overwritten; fictional, positive, private.
- **F8 Group outings:** invite 2–3 NPCs to the park or café; availability
  checked; polite declines; plan-making English ("Do you want to come?", "How
  about Saturday?"); companions shown together, take part, each gains
  progress; NPC–NPC links update; reuse existing activities; no XP farming.
- **F9 Home visits:** close friends occasionally visit the player's room
  (message or in person; accept/decline/another day); visitor spawns, walks to
  a sensible spot, talks, does one simple activity (tabletop game, photos and
  souvenirs, hobbies/pets talk), faces the player, leaves cleanly. Uses time and
  memory systems; sleep, menus and saving keep working.
- **F10 Memories:** NPCs reference specific stored memories ("We played catch
  on Saturday!"); memories influence later choices and invitations; journal
  shows a readable history; never invent or repeat memories wrongly.
- **F11 Curriculum:** introductions (This is… / He is my friend / She likes… /
  He can… / She is good at…), weekly routines, plans (Where/What do you want
  to…? Do you want to come?), time, interests and possessions, positive
  describing words, directions and in/on/under/by, food ordering. Existing
  speech/tap system; no compulsory quizzes, punitive scores or above-Grade-5
  grammar.
- **F12 Conversation variety:** consider level, personality, interests, time,
  place, recent activities, known info, nearby friends, pending invitations,
  past events; don't re-ask known answers; NPCs sometimes ask the player about
  themselves; speech optional; technical speech failures never cost anything.
- **F13 Classroom safety:** no traits from names; no public ranking; fiction
  never implies real students; no bullying, humiliation, exclusion, romance;
  no reward for insults; no voice storage; local data; separate profiles.
- **F14 Technical:** data-driven event definitions; testable eligibility,
  selection, completion, history, personality, availability, visitors, memory
  references; current XP and memory gates kept; existing Lv3–5 friendships keep
  their progress; no duplicate events after save/load; interrupted events
  handled; no new dependencies; light CPU.
- **F15 Tests:** unit + Playwright for the 19 acceptance points (first day
  still works; levels persist; styles stable; styles differ; events unlock by
  level; completion records memory and progress; no farming; casual talk free;
  major activities advance exactly one period; NPC invitations optional;
  groups of 2 and 3; NPC–NPC links update; visitor enters and leaves; old saves
  load; names never drive styles; speech-off fully playable; no stuck or
  in-wall characters; usable at 1366×768; no big Chromebook regression), plus
  one end-to-end journey (meet → grow → unlock event → complete → memory → new
  invitation → different behaviour on a later day).
- **F16 Order:** Phase 1 personality, events, level behaviour, memory-aware
  follow-ups → Phase 2 groups, availability, NPC–NPC changes → Phase 3 home
  visits. Each phase complete and tested before the next. No mall, no new
  classrooms, no large environments.
