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

With the dev server running:

```bash
node scripts/playthrough.mjs   # first-day loop through the real UI
node scripts/scenarios.mjs     # café, catch, lost item, rain, weekend, invitations
node scripts/speech.mjs        # speech input with a mocked recognizer
node scripts/shots.mjs town classroom cafe home   # scene screenshots
```

The scripts use the installed Google Chrome (no browser download). Screenshots
go to `SHOTS_DIR` (default `.shots/`). Add `?debug=1` to the URL for an FPS
counter; press the backquote key in game for the debug panel.

See `SPEC.md` for the original brief, `DESIGN_DECISIONS.md` for what changed
and why, and `CURRENT_STATE.md` for status.
