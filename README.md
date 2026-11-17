# ESL Social Life 🌸

A third-person 3D social life game for Japanese Grade 5 English learners.
Students make friends with (fictional versions of) their classmates by talking
in English, make plans, play together, and come back the next day to find their
friends remember them.

Runs in Chrome on school Chromebooks. No accounts, no servers, no AI services —
everything stays on the device.

## For teachers

1. Open the game. On the title screen, **press and hold “🍎 Teacher”** for a moment.
2. Paste your class list, one name per line. Add `, he` or `, she` after a name
   if you want the game to use that pronoun; otherwise it uses the name
   (“Aoi likes music.”). Press **Use this list**.
3. Every looks, hobby, skill and routine is **made up by the game** — nothing
   is based on the real student. Use 🎲 to give anyone a new look.
4. Choose speech input:
   - **On-device only (recommended)** — voices never leave the Chromebook.
     Chrome may need a one-time language download (students see “Set up mic”).
   - **Allow online speech service** — uses the browser maker's speech service.
   - **Off** — students tap answer cards.
5. Each student taps **New player**, finds their name (so they don't meet
   themselves), makes a character and introduces themselves.

Students sharing a Chromebook each get their own profile. Teacher Setup can
delete profiles, export a backup file, or import one.

### How friendships grow

- Each classmate has their own way of behaving (some come over to say hi, some
  send messages, some love making things). These styles are made up by the game,
  are never shown as labels, and never make anyone easier or harder to befriend.
- Talking makes classmates **Friends**. Deeper friendship needs time together,
  just the two of you: playing, helping, and **friendship events** such as drawing
  together, looking for bugs, music time, helping a friend practise, carrying a
  present to another friend, introducing two classmates, a birthday party at the
  café, and a best-friend moment.
- Friends remember what you did together, ask about you, invite you (sometimes
  with another friend), come over to say hi, and close friends ask to visit your
  room.
- Students can plan outings with two or three friends from the phone. Friends say
  politely when they are busy. Classmates who became friends through you meet up
  on their own, and you may see them together in town.
- Nothing is ever lost by saying "Maybe next time", missing a plan, or rain.
  Group time is fun, but only one-on-one time moves a friendship to the next level.

## Controls

| | Keyboard | Touch / mouse |
|---|---|---|
| Walk | WASD / arrow keys | joystick, or tap the ground |
| Talk / use | E, Space, Enter | tap the person or the orange button |
| Answer | 1–4, or Space to speak | tap a card (🔊 to hear it) |
| Turn camera | — | drag the screen |
| Journal / Map / Messages / Calendar | J / M / P / C | top-right buttons |

## For developers

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (pure logic)
npm run build        # static site in dist/ (relative paths; host anywhere)
```

End-to-end checks (each starts and stops its own dev server):

```bash
npm run e2e                  # first day, scenarios (café, catch, lost item, rain, …), speech
npm run e2e:friendship-all   # friendship events, hobby sessions, group outings, home visits, full journey
npm run e2e:perf             # draw calls per scene (headless proxy, not a Chromebook measurement)
```

With `npm run dev` running you can also call a script directly
(`node scripts/playthrough.mjs`) or take scene screenshots
(`node scripts/shots.mjs town classroom cafe home`).

The scripts use the installed Google Chrome (no browser download). Screenshots
go to `SHOTS_DIR` (default `.shots/`). Add `?debug=1` to the URL for an FPS
counter; press the backquote key in game for the debug panel.

See `SPEC.md` for the original brief, `DESIGN_DECISIONS.md` for what changed
and why, and `CURRENT_STATE.md` for status.
