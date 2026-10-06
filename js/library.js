/* Warmup Bench - the generic exercise library and presets.
   Every exercise is a template. Ranges are written for a BARITONE (the app transposes them
   to the chosen voice or the singer's own notes).

   Personal material - a teacher's exercises, a course's drills, your own - is NOT in this
   file. It arrives as a PACK (pack.json) from the user's own Google Drive and is merged in
   with addPack(), so the public app carries only standard pedagogy.
   Patterns use the degree language in core.js: 1-22, b/#, v (octave down), :n, ., >, -, _  */
(function (root) {
"use strict";

const CATS = [
  ["release", "Release and body"], ["breath", "Breath"], ["sovt", "Straw, trills and hums"],
  ["glide", "Sirens and glides"], ["scale", "Scales"], ["arp", "Arpeggios and leaps"],
  ["agility", "Agility, riffs and runs"], ["onset", "Onsets and staccato"],
  ["register", "Registers, bridge and mix"], ["resonance", "Resonance and vowels"],
  ["dynamics", "Dynamics"], ["style", "Style: twang, grit, fry"], ["ear", "Ear and pitch"],
  ["song", "Song work"], ["cool", "Cool down"],
];
const SRC = { classic: "Classic" };

/* shorthand */
const S = (o) => Object.assign({ type: "scale", scale: "maj", bpm: 92, beat: 1, hold: 0, gap: 2,
  lead: "chordnote", bed: true, back: true, step: 1, reps: 1, countIn: false, click: false }, o);
const G = (o) => Object.assign({ type: "siren", low: "E2", high: "E4", secs: 10, count: 3, gap: 4, countIn: true, shape: "updown" }, o);
const B = (o) => Object.assign({ type: "breath", bpm: 72, inCounts: 4, outCounts: 16, reps: 3, rest: 6 }, o);
const T = (o) => Object.assign({ type: "timer", secs: 60 }, o);
const D = (o) => Object.assign({ type: "drone", note: "E3", secs: 120, fifth: true }, o);

const EX = [
  /* ---------------------------------------------------------------- release */
  T({ key: "release", name: "Shoulder, jaw and neck release", cat: "release", src: "classic", secs: 45,
      steps: ["Roll the shoulders back, then let them drop", "Massage the jaw hinge in small circles", "Slow head turns, left and right", "One big yawn"],
      cue: "Loosen off before the first sound." }),
  /* ---------------------------------------------------------------- breath */
  B({ key: "hiss", name: "Slow hiss", cat: "breath", src: "classic", inCounts: 4, outCounts: 8, reps: 3, vowel: "sss",
      cue: "In for four, hiss out steady for eight." }),
  B({ key: "farinelli", name: "Farinelli: in, hold, out", cat: "breath", src: "classic", bpm: 60, inCounts: 4, outCounts: 12, reps: 4, rest: 4, vowel: "sss",
      cue: "In for four, suspend for four without locking the throat, then out for eight." }),
  /* ---------------------------------------------------------------- SOVT */
  T({ key: "straw", name: "Straw in water", cat: "sovt", src: "classic", secs: 90,
      steps: ["Straw about 5 cm into water: steady easy hoo", "Slow slides up and down through the straw", "Take the straw out and slide on an open ah, keeping the same feeling"],
      cue: "Steady bubbles. The last part, without the straw, is the bit that reaches your singing." }),
  S({ key: "liptrill5", name: "Lip trill, five-tone", cat: "sovt", src: "classic", pattern: "1 2 3 4 5 4 3 2 1", vowel: "brr", from: "C3", to: "G3",
      cue: "Loose lips. If they stall, press the cheeks in gently with two fingers." }),
  S({ key: "liptrillarp", name: "Lip trill, octave arpeggio", cat: "sovt", src: "classic", pattern: "1 3 5 8 5 3 1", vowel: "brr", from: "C3", to: "F3" }),
  S({ key: "tonguetrill", name: "Tongue trill, five-tone", cat: "sovt", src: "classic", pattern: "1 2 3 4 5 4 3 2 1", vowel: "rrr", from: "C3", to: "G3" }),
  S({ key: "hum3", name: "Humming", cat: "sovt", src: "classic", pattern: "1 2 3 2 1", vowel: "mm", from: "C3", to: "A3",
      cue: "Lips closed, teeth apart. Buzz on the lips." }),
  S({ key: "mmeh", name: "Hum to vowel: mm-ah", cat: "sovt", src: "classic", pattern: "1:2 3 5 3 1", vowel: "mm-ah", syllables: "mm ah ah ah ah", from: "C3", to: "G3",
      cue: "Start on the hum, open to ah without losing the buzz." }),
  G({ key: "strawsiren", name: "Straw sirens", cat: "sovt", src: "classic", vowel: "straw", low: "D2", high: "D4", secs: 10, count: 3 }),

  /* ---------------------------------------------------------------- glides */
  G({ key: "sirenoo", name: "Siren on oo", cat: "glide", src: "classic", vowel: "oo", low: "E2", high: "D5", secs: 12, count: 3 }),
  G({ key: "octslide", name: "Octave slide", cat: "glide", src: "classic", vowel: "oo", low: "A2", high: "A3", secs: 6, count: 4, gap: 3,
      cue: "Up an octave and back with no bumps." }),
  G({ key: "fifthslide", name: "Fifth slide", cat: "glide", src: "classic", vowel: "ah", low: "C3", high: "G3", secs: 4, count: 4, gap: 3 }),
  G({ key: "twooct", name: "Two-octave glide on a high vowel", cat: "glide", src: "classic", vowel: "ee", low: "E2", high: "E4", secs: 10, count: 3,
      cue: "Titze's second warm-up: glide the whole span on ee or oo, light at the top." }),
  G({ key: "sigh", name: "Descending sigh glides", cat: "glide", src: "classic", vowel: "hah", low: "C3", high: "C4", secs: 3, count: 5, gap: 3, shape: "down",
      cue: "Start high and light, sigh all the way down." }),

  /* ---------------------------------------------------------------- scales */
  S({ key: "three", name: "Three-note scale", cat: "scale", src: "classic", pattern: "1 2 3 2 1", vowel: "mee", from: "C3", to: "A3" }),
  S({ key: "five", name: "Five-tone scale", cat: "scale", src: "classic", pattern: "1 2 3 4 5 4 3 2 1", vowel: "mee meh mah moh moo", syllables: "mee meh mah moh moo moh mah meh mee", from: "C3", to: "G3" }),
  S({ key: "desc5", name: "Descending five", cat: "scale", src: "classic", pattern: "5 4 3 2 1", vowel: "yah", from: "C3", to: "G3" }),
  S({ key: "octscale", name: "Octave scale (1–8–1)", cat: "scale", src: "classic", pattern: "1 2 3 4 5 6 7 8 7 6 5 4 3 2 1", vowel: "ah", beat: 0.5, from: "C3", to: "D3" }),
  S({ key: "nine", name: "Long scale (1–9–1)", cat: "scale", src: "classic", pattern: "1 2 3 4 5 6 7 8 9 8 7 6 5 4 3 2 1", vowel: "ah", beat: 0.5, from: "C3", to: "C3" }),
  S({ key: "rossini", name: "Octave-and-a-half scale (Rossini)", cat: "scale", src: "classic", pattern: "1 3 5 8 10 12 11 9 7 5 4 2 1", vowel: "ah", beat: 0.5, from: "A2", to: "B2",
      cue: "Arpeggio up, scale down. Big intervals, so keep it light at the top.", why: "The hardest of the long patterns; it reaches the top of the range." }),
  S({ key: "ascoct", name: "Ascending octave", cat: "scale", src: "classic", pattern: "1 2 3 4 5 6 7 8", vowel: "ah", back: false, from: "C3", to: "F3" }),
  S({ key: "descoct", name: "Descending octave", cat: "scale", src: "classic", pattern: "8 7 6 5 4 3 2 1", vowel: "hoo", back: false, from: "C3", to: "F3" }),
  S({ key: "minor5", name: "Minor five-tone", cat: "scale", src: "classic", scale: "min", pattern: "1 2 3 4 5 4 3 2 1", vowel: "ah", from: "C3", to: "G3" }),
  S({ key: "chrom5", name: "Chromatic five", cat: "scale", src: "classic", pattern: "1 #1 2 #2 3 #2 2 #1 1", vowel: "ee", from: "C3", to: "A3", cue: "Every half step clean. Slow first." }),

  /* ---------------------------------------------------------------- arpeggios and leaps */
  S({ key: "triad", name: "Triad", cat: "arp", src: "classic", pattern: "1 3 5 3 1", vowel: "mum", from: "C3", to: "A3" }),
  S({ key: "arp8", name: "Octave arpeggio", cat: "arp", src: "classic", pattern: "1 3 5 8 5 3 1", vowel: "ah", from: "C3", to: "F3" }),
  S({ key: "revarp", name: "Reverse arpeggio", cat: "arp", src: "classic", pattern: "8 5 3 1 3 5 8", vowel: "oo", from: "C3", to: "F3" }),
  S({ key: "arp15", name: "Octave-and-a-half arpeggio", cat: "arp", src: "classic", pattern: "1 3 5 8 10 12 10 8 5 3 1", vowel: "ah", beat: 0.75, from: "A2", to: "B2" }),
  S({ key: "arp10", name: "Arpeggio to the tenth", cat: "arp", src: "classic", pattern: "1 3 5 8 10 8 5 3 1", vowel: "nay", from: "A2", to: "D3" }),
  S({ key: "doublearp", name: "Double arpeggio", cat: "arp", src: "classic", pattern: "1 3 5 8 5 3 1 3 5 8 5 3 1", vowel: "ah", beat: 0.5, from: "C3", to: "E3" }),
  S({ key: "brokenarp", name: "Broken arpeggio", cat: "arp", src: "classic", pattern: "1 5 3 8 1", vowel: "ah", from: "C3", to: "F3" }),
  S({ key: "descarp", name: "Descending arpeggio", cat: "arp", src: "classic", pattern: "8 5 3 1", vowel: "boo", back: false, from: "C3", to: "F3" }),
  S({ key: "oct", name: "Octave jump", cat: "arp", src: "classic", pattern: "1 8 1", vowel: "ah", from: "C3", to: "F3" }),
  S({ key: "octhold", name: "Octave jump, held top", cat: "arp", src: "classic", pattern: "1 8:3 1", vowel: "oo", from: "C3", to: "E3" }),
  S({ key: "octrep", name: "Octave repeat", cat: "arp", src: "classic", pattern: "1 3 5 8 8 8 8 5 3 1", vowel: "nay", from: "C3", to: "E3", cue: "Land the top and stay there for the repeats without pushing." }),
  S({ key: "fifth", name: "Fifth jump", cat: "arp", src: "classic", pattern: "1 5 1", vowel: "ah", from: "C3", to: "A3" }),
  S({ key: "158", name: "1–5–8–5–1", cat: "arp", src: "classic", pattern: "1 5 8 5 1", vowel: "ah", from: "C3", to: "F3" }),

  /* ---------------------------------------------------------------- agility */
  S({ key: "fast5", name: "Fast five", cat: "agility", src: "classic", pattern: "1 2 3 4 5 4 3 2 1 2 3 4 5 4 3 2 1", vowel: "ah", beat: 0.5, from: "C3", to: "G3" }),
  S({ key: "fast3", name: "Three-note turns", cat: "agility", src: "classic", pattern: "1 2 3 2 1 2 3 2 1 2 3 2 1", vowel: "ee", beat: 0.5, from: "C3", to: "A3" }),
  S({ key: "thirds", name: "Thirds ladder", cat: "agility", src: "classic", pattern: "1 3 2 4 3 5 4 2 1", vowel: "ah", beat: 0.5, from: "C3", to: "G3" }),
  S({ key: "trill", name: "Trill", cat: "agility", src: "classic", pattern: "1 2 1 2 1 2 1 2 1", vowel: "ah", beat: 0.25, from: "C3", to: "A3", cue: "Loose, light, quick. Let the throat stay still." }),
  S({ key: "turn", name: "Turn on the third", cat: "agility", src: "classic", pattern: "3 4 3 2 3", vowel: "ee", beat: 0.5, from: "C3", to: "A3" }),
  S({ key: "triplet", name: "Triplet arpeggio", cat: "agility", src: "classic", pattern: "1:0.667 3:0.667 5:0.667 8:0.667 5:0.667 3:0.667 1:2", vowel: "ah", from: "C3", to: "F3" }),
  S({ key: "nineFast", name: "Fast nine", cat: "agility", src: "classic", pattern: "1 2 3 4 5 6 7 8 9 8 7 6 5 4 3 2 1", vowel: "ah", beat: 0.25, from: "C3", to: "C3" }),
  S({ key: "penta", name: "Pentatonic run", cat: "agility", src: "classic", pattern: "1 2 3 5 6 8 6 5 3 2 1", vowel: "ee", beat: 0.5, from: "C3", to: "F3", why: "The pentatonic is where most pop, gospel and R&B runs live." }),
  S({ key: "pentariff", name: "Pentatonic riff 6-5-3-2-1", cat: "agility", src: "classic", pattern: "6 5 3 2 1:2", vowel: "yeah", beat: 0.5, from: "C3", to: "A3" }),
  S({ key: "pentawide", name: "Wide pentatonic riff", cat: "agility", src: "classic", pattern: "1 2 3 5 5 6 8 6 5 3 3 2 1:2", vowel: "oh", beat: 0.5, from: "C3", to: "E3" }),
  S({ key: "minpenta", name: "Minor pentatonic riff", cat: "agility", src: "classic", scale: "min", pattern: "8 b7 5 4 b3 1:2", vowel: "ah", beat: 0.5, from: "C3", to: "F3" }),
  S({ key: "blues", name: "Blues scale", cat: "agility", src: "classic", pattern: "1 b3 4 #4 5 b7 8 b7 5 #4 4 b3 1", vowel: "ah", beat: 0.5, from: "C3", to: "D3" }),
  S({ key: "gospel", name: "Gospel run down", cat: "agility", src: "classic", pattern: "8 6 5 3 5 3 2 1:2", vowel: "oh", beat: 0.5, from: "C3", to: "F3" }),

  /* ---------------------------------------------------------------- onsets */
  S({ key: "stacc", name: "Staccato arpeggio", cat: "onset", src: "classic", pattern: "1. 3. 5. 8. 5. 3. 1.", vowel: "ha", from: "C3", to: "F3", cue: "Short and light, each one bouncing from the belly." }),
  S({ key: "stacctriad", name: "Staccato triad", cat: "onset", src: "classic", pattern: "1. 3. 5. 3. 1.", vowel: "ha", from: "C3", to: "A3" }),
  S({ key: "laugh", name: "Laughing ha-ha", cat: "onset", src: "classic", pattern: "5. 4. 3. 2. 1.", vowel: "ha", from: "C3", to: "G3" }),
  /* ---------------------------------------------------------------- registers / mix */
  S({ key: "nay", name: "Bratty nay", cat: "register", src: "classic", pattern: "1 3 5 8 5 3 1", vowel: "nay", from: "C3", to: "F3", cue: "Bratty and a little nasal, getting smaller as it climbs." }),
  S({ key: "mum", name: "Mum", cat: "register", src: "classic", pattern: "1 3 5 3 1", vowel: "mum", from: "C3", to: "A3" }),
  S({ key: "gug", name: "Gug", cat: "register", src: "classic", pattern: "1 3 5 8 5 3 1", vowel: "gug", from: "C3", to: "E3", cue: "A dopey, slightly low-larynx sound to stop the climb from squeezing." }),
  S({ key: "flip", name: "Flip on purpose", cat: "register", src: "classic", pattern: "1 8 1 8 1", vowel: "oo-ee", from: "A2", to: "D3", cue: "Let the voice flip at the top. Then try to slow the flip down." }),
  S({ key: "faldesc", name: "Falsetto down into chest", cat: "register", src: "classic", pattern: "8 7 6 5 4 3 2 1", vowel: "hoo", back: false, from: "C3", to: "F3", cue: "Start light in falsetto and carry the lightness down." }),
  /* ---------------------------------------------------------------- resonance / vowels */
  S({ key: "nyah", name: "Twang: nyeh", cat: "resonance", src: "classic", pattern: "1 2 3 4 5 4 3 2 1", vowel: "nyeh", from: "C3", to: "G3", cue: "Bright and bratty, like a taunt. Small, not loud." }),
  S({ key: "ngah", name: "Ng to ah", cat: "resonance", src: "classic", pattern: "1:2 3 5 3 1", vowel: "ng-ah", syllables: "ng ah ah ah ah", from: "C3", to: "G3" }),
  /* ---------------------------------------------------------------- dynamics */
  S({ key: "messa", name: "Messa di voce (swell)", cat: "dynamics", src: "classic", pattern: "1:8", vowel: "ah", keys: ["C3", "D3", "E3", "F3", "G3"], gap: 3,
      cue: "Start soft, grow, then shrink back, all on one breath, without the tone changing.", why: "Titze's fourth warm-up, and one of the oldest exercises there is." }),
  S({ key: "softloud", name: "Soft-loud-soft five", cat: "dynamics", src: "classic", pattern: "1 2 3 4 5> 4 3 2 1", vowel: "ah", from: "C3", to: "G3", cue: "Grow to the top note and back. Volume from the air, not the throat." }),

  /* ---------------------------------------------------------------- ear */
  S({ key: "intervals", name: "Interval match", cat: "ear", src: "classic", pattern: "1 _ 3 _ 5 _ 8 _ 5 _ 3 _ 1", vowel: "loo", from: "C3", to: "F3", bed: false, cue: "Hear each note, then sing it in the gap." }),
  S({ key: "echo", name: "Echo the phrase", cat: "ear", src: "classic", pattern: "1 3 2 5 _ _ _ _ _", vowel: "echo it", from: "C3", to: "G3", bed: false, cue: "The piano plays four notes; sing them back in the silence." }),

  /* ---------------------------------------------------------------- cool down */
  S({ key: "humdown", name: "Hum down", cat: "cool", src: "classic", pattern: "5 4 3 2 1", vowel: "mm", from: "A3", to: "D3", back: false }),
  S({ key: "trilldown", name: "Lip trill, descending octave", cat: "cool", src: "classic", pattern: "8 7 6 5 4 3 2 1", vowel: "brr", from: "G3", to: "C3", back: false, beat: 0.75 }),
  G({ key: "minisiren", name: "Small sirens", cat: "cool", src: "classic", vowel: "oo", low: "C3", high: "G3", secs: 5, count: 3, gap: 3 }),
  /* ---------------------------------------------------------------- generic standards */
  G({ key: "sirenfull", name: "Full-range siren", cat: "glide", src: "classic", vowel: "ng", low: "E2", high: "E5", secs: 14, count: 3,
      cue: "Lowest to highest and back in one unbroken line. Let it flip; quiet at both ends." }),
  T({ key: "yawn", name: "Yawn-sigh", cat: "release", src: "classic", secs: 40,
      steps: ["A big, open yawn on the breath in", "Sigh it out from high to low", "Again, letting the sound ride on the air"], cue: "Open, easy, no push." }),
  S({ key: "eeohc", name: "Ee-oh, tongue only", cat: "resonance", src: "classic", pattern: "1 2 3 4 5 4 3 2 1", vowel: "ee oh", syllables: "ee oh ee oh ee oh ee oh ee", from: "C3", to: "D#3",
      cue: "Keep the lips and jaw still and let only the tongue change the vowel." }),
  S({ key: "coolfive", name: "Descending five, soft", cat: "cool", src: "classic", pattern: "5 4 3 2 1", vowel: "vuh", from: "D4", to: "F3", back: false, beat: 1.25,
      cue: "Soft, lips brushing the top teeth." }),
];

/* ---------------------------------------------------------------- presets
   Each preset is a list of library keys with optional overrides. */
const P = (key, name, group, desc, items) => ({ key, name, group, desc, items });
const PRESETS = [
  P("titze", "Titze's five", "classic", "The five warm-ups a voice scientist ranked best: SOVT on glides and scales, two-octave glides, tongue work, messa di voce, staccato arpeggios.", [
    "liptrill5", "strawsiren", "twooct", "eeohc", "messa", "stacc"]),
  P("classic10", "Classic ten minutes", "classic", "The standard order: release, breath, trills, hum, scales, arpeggios.", [
    "release", "hiss", "liptrill5", "hum3", "five", "arp8", "stacc", "desc5"]),
  P("agility", "Agility and runs", "classic", "Fast scales, turns, pentatonic and blues runs.", [
    "liptrill5", "fast3", "fast5", "thirds", "trill", "penta", "pentariff", "minpenta", "blues"]),
  P("range", "Range builder", "classic", "Long patterns to the top of the range, light at the top.", [
    "liptrillarp", "sirenfull", "octscale", "nine", "arp10", "arp15", "rossini", "faldesc"]),
  P("cooldown", "Cool down", "classic", "After singing: gentle, low, quiet.", ["trilldown", "humdown", "minisiren", "coolfive", "yawn"]),
];

let byKey = Object.fromEntries(EX.map(e => [e.key, e]));
function instantiate(ref, uidFn) {
  const [k, over] = Array.isArray(ref) ? ref : [ref, null];
  const base = byKey[k];
  if (!base) throw new Error("No exercise '" + k + "'");
  const it = JSON.parse(JSON.stringify(base));
  if (over) Object.assign(it, JSON.parse(JSON.stringify(over)));
  it.id = uidFn ? uidFn() : Math.random().toString(36).slice(2, 10);
  it.lib = k;
  if (!it.block) it.block = ({ sirens: "sirens", glide: "sirens", breath: "breath", onset: "onsets", cool: "cooldown", song: "song" })[it.cat] || (it.type === "timer" ? "rest" : "warmup");
  if (it.cat === "glide") it.block = "sirens";
  return it;
}

/* A pack: {sources: {key: label}, exercises: [...], presets: [...]} from the user's Drive. */
function addPack(pack) {
  if (!pack || !Array.isArray(pack.exercises)) return 0;
  Object.assign(SRC, pack.sources || {});
  let n = 0;
  for (const e of pack.exercises) { if (!byKey[e.key]) { EX.push(e); byKey[e.key] = e; n++; } }
  for (const p of pack.presets || []) if (!PRESETS.some(x => x.key === p.key)) PRESETS.push(p);
  return n;
}
const API = { CATS, SRC, EX, PRESETS, byKey, instantiate, addPack };
if (typeof module !== "undefined") module.exports = API; else root.WBLIB = API;
})(typeof window !== "undefined" ? window : globalThis);
