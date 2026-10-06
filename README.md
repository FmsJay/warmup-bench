# Warmup Bench

Vocal warm-ups on a real piano, in the browser, on phone or desktop.

- **Quick** - pick your voice (or measure your range with the mic), a length, a focus and a
  tempo, and get a routine that steps a semitone at a time and never leaves your range.
- **Library** - the standard exercises in 15 families (straw, trills and hums; sirens; scales;
  arpeggios and leaps; agility, riffs and runs; onsets; registers and mix; resonance and
  vowels; dynamics; style; ear; cool down) and presets built from them.
- **Build** - write any exercise: scale degrees (`1 3 5 8 5 3 1`, `b3`, `5:2`, `5.`, `-`, `_`)
  or note names, any keys, tempo, note length, holds, what the piano plays before each key,
  sirens, breath ladders, drones and guided steps. Save warm-ups with every exercise in place.
- **Sing** - a pitch lane shows the notes to sing and your voice against them, live.
  Record the session with the microphone.
- **Sessions / Coach** - send a session and its recording to your coach; insights and new
  plans come back.

The built-in piano is synthesised. If you have your own piano samples (an `index.json` plus
mp3s), keep them in your Google Drive under `Warmup Bench/piano/` and the app uses them.

## Your own library

Your exercises and saved warm-ups sync through your own Google Drive (`Warmup Bench/`).
A private **pack** (`pack.json` in the same folder) can add exercises and presets that are
yours alone - a teacher's, a course's - without them ever being part of this public app.
On a phone, connect Drive under Coach > Sync with your own Google OAuth client ID.

## Running it

Any static web server works. Over plain http the microphone only works on `localhost`, so
use the hosted https copy on a phone.

    python -m http.server 8000      # then open http://localhost:8000

Nothing you record leaves the device unless you press **Send to coach**.

`node -e "require('./js/core.js')"` loads the music engine without a browser; the files in
`js/` have no build step.
