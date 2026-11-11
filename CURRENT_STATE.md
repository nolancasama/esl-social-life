# Current State

## Status (2026-11-10)
First vertical slice is playable end to end in Chrome: create a character,
meet classmates, get introduced, make a plan in English, play together after
school, see the friendship grow, go home, sleep, and the friend remembers you
the next morning. Built directly by Claude at the user's request ("no router").
Not a git repository yet (no commits made).

## What Exists
- **Screens:** title with player profiles over the 3D town; Teacher Setup (press-and-hold) with roster paste, per-name pronoun (he / she / use name), 🎲 new look, speech policy, profiles, export/import, wipe; character creator (name from class list or typed, look editor with 3D preview, self-introduction step).
- **World:** Sakura Town hub (school, Niji Mall "opening soon", Sakura Park with field/pond/playground, café, residential lane with the player's house, shrine, utility poles, rain); interiors: Classroom 5-1, Café Komorebi, the player's room. Dollhouse cameras indoors, follow camera outdoors, conversation framing that avoids bystanders.
- **People:** seeded fictional NPCs from the roster (12-name sample class by default), distinct procedural chibi models with expressions, weekly schedules + variation + rain + plans, friend groups chatting, ambient catch games, readers/joggers/umbrellas, close friends approach you. Teacher (Ms. Aoki) and café staff (Mr. Mori).
- **Talk:** day-one homeroom welcome; scripted first-friend introduction (matches the brief); meeting strangers; NPC-led and player-led introductions; topic menu (likes, abilities, weekly routines, subjects, food, birthday, pets, wake-up time, games, friends, dream places, weather, time, want-to, invitations); memory quiz; birthdays; shared-memory callbacks. English + Grade-5 Japanese hints, read-aloud with on-device voices.
- **Speech:** optional press-to-talk (Space / 🎤), on-device recognition by default, distinct feedback for no speech / timeout / unrelated / blocked / no mic; mic off is never a failure; acceptance-biased intent matcher with Japanese-accent variants.
- **Activities:** soccer pass / catch (move to the ring, time the button, power meter), café outing (want to eat → please → here you are → eat and chat), lost-item search (prepositions, no time cost), café counter quick order. Results card with memory photo, souvenirs on the shelf, photos on the bedroom wall.
- **Systems:** periods (weekday morning school / after school / evening; weekend morning / afternoon / evening), Advance Time, missed plans handled gently, evening messages (thanks, invitations with accept / decline / another day), calendar (plans, birthdays, 3-day weather), map with known friend locations and direction arrow, journal (friends, friend map, "My English" phrase book, memories, me), connection Lv0–5 with daily fact cap and memory gates for Lv3+, language-need steering, local saves per profile, debug panel.

## Verification (observed, headless Chrome + SwiftShader, 1366×768)
- `npm test`: 16/16 pass. `npm run build`: OK.
- `scripts/playthrough.mjs`: PASS (whole first-day loop through the UI). Known-bad check: sabotaging the memory callback makes it FAIL as expected.
- `scripts/scenarios.mjs`: PASS (café, weekend wake-up choice, catch, lost item, rain empties park, invitation → plan).
- `scripts/speech.mjs`: PASS with a mocked recognizer.
- Screenshots reviewed by eye for title, creator, classroom, welcome, conversation, park activity, café, home, journal, messages, friend map, rain.

## Known Issues / Not Verified
- No run on a real Chromebook; headless software rendering showed 13–33 FPS, which says nothing about GPU performance (draw calls: town ≈40, classroom ≈120). Adaptive quality lowers pixel ratio/shadows if slow.
- Real microphone, Chrome's on-device language download, and read-aloud voices are untested (speech was mocked; headless has no voices).
- Classes of 25–30 are supported by the generator and 25 desks, but not visually tested.
- Niji Mall interior, directions activity, home visits, rank-up events and music are not built (see DESIGN_DECISIONS.md → Deferred).
- Teacher Setup is protected only by press-and-hold.

## Next Steps
1. Play on a classroom Chromebook: frame rate, touch joystick, mic setup flow, read-aloud voice quality.
2. Collect real classroom transcripts to extend `VARIANTS` in `src/dialogue/intent.js`.
3. Directions mini-activity in town (speech as control: "Turn left!"), then the mall (food court reuses the café flow).
4. More variety in daily events and greetings once playtesting shows what repeats.

## Codex / Delegated Work
None. No pending worker output.
