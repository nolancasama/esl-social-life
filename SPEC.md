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
