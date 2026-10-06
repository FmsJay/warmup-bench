/* Warmup Bench - core: notes, the pattern language, exercise -> events, quick generator.
   No DOM in this file, so it can be tested in Node:  node -e "require('./js/core.js')"  */
(function (root) {
"use strict";

/* ---------------------------------------------------------------- notes */
const NAMES = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
const ASCII = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const mod12 = m => ((m % 12) + 12) % 12;
const noteName = m => NAMES[mod12(m)] + (Math.floor(m / 12) - 1);
const noteAscii = m => ASCII[mod12(m)] + (Math.floor(m / 12) - 1);
function parseNote(s) {
  if (typeof s === "number") return s;
  const m = String(s || "").trim().replace(/♯/g, "#").replace(/♭/g, "b")
    .match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
  return base + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
}
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

/* Scales the degree language can be read against. Degrees above 7 wrap to the next octave,
   so "8" is the octave and "10" the third above it, the way teachers count. */
const SCALES = {
  maj:   { name: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
  min:   { name: "Natural minor", steps: [0, 2, 3, 5, 7, 8, 10] },
  harm:  { name: "Harmonic minor", steps: [0, 2, 3, 5, 7, 8, 11] },
  dor:   { name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
  mix:   { name: "Mixolydian", steps: [0, 2, 4, 5, 7, 9, 10] },
};
function degreeSemis(deg, acc, scale) {
  const st = (SCALES[scale] || SCALES.maj).steps;
  const d = deg - 1, oct = Math.floor(d / 7), idx = ((d % 7) + 7) % 7;
  let s = oct * 12 + st[idx];
  if (acc === "b") s -= 1;
  if (acc === "#") s += 1;
  return s;
}

/* ---------------------------------------------------------------- the pattern language
   Written the way a teacher says it.
     5        scale degree five          b3 #4     accidentals          0  or  -1   below the tonic (7 below = "v7")
     v5       degree five an octave DOWN
     5:2      twice the base note length  5:0.5     half
     5.       staccato                   5>        accented (louder)
     -        hold the previous note one more unit
     _        a rest one unit long
     |        nothing (a bar line, ignored)
   Absolute mode reads note names instead: "C4 E4 G4 C5", same suffixes, and transposes
   by the interval from its first note. */
function parsePattern(str, scale, mode) {
  const out = [], bad = [];
  const toks = String(str || "").trim().split(/[\s,]+/).filter(Boolean);
  let base = null;
  for (const raw of toks) {
    if (raw === "|") continue;
    if (raw === "-") { if (out.length) out[out.length - 1].beats += 1; else bad.push(raw); continue; }
    if (/^_(:\d+(\.\d+)?)?$/.test(raw)) { const b = raw.split(":")[1]; out.push({ semi: null, beats: b ? +b : 1 }); continue; }
    let m, semi = null, rest = raw;
    if (mode === "notes") {
      m = raw.match(/^([A-Ga-g][#b♯♭]?-?\d)(.*)$/);
      if (m) { const n = parseNote(m[1]); if (n !== null) { if (base === null) base = n; semi = n - base; rest = m[2]; } }
    } else {
      m = raw.match(/^(v*)([b#]?)(\d{1,2})(.*)$/);
      if (m && +m[3] >= 1 && +m[3] <= 22) { semi = degreeSemis(+m[3], m[2], scale) - 12 * m[1].length; rest = m[4]; }
      else if ((m = raw.match(/^([b#]?)(0)(.*)$/))) { semi = -1 + (m[1] === "b" ? -1 : 0); rest = m[3]; } // 0 = leading tone below
    }
    if (semi === null) { bad.push(raw); continue; }
    const n = { semi, beats: 1, stacc: false, acc: false };
    const sm = rest.match(/^(?::(\d+(?:\.\d+)?))?([.>]*)$/);
    if (!sm) { bad.push(raw); continue; }
    if (sm[1]) n.beats = parseFloat(sm[1]);
    if (sm[2].includes(".")) n.stacc = true;
    if (sm[2].includes(">")) n.acc = true;
    out.push(n);
  }
  return { notes: out, bad };
}
function span(notes) {
  const s = notes.filter(n => n.semi !== null).map(n => n.semi);
  return s.length ? { lo: Math.min(...s), hi: Math.max(...s) } : { lo: 0, hi: 0 };
}
const triadOf = (r, scale) => [r, r + ((SCALES[scale] || SCALES.maj).steps[2]), r + 7];

/* ---------------------------------------------------------------- voices
   Textbook ranges (vocalrangetester uses the same) plus the singer's own measured range.
   Quick mode sings 2 semitones in from the bottom and 3 in from the top, as that site does. */
const VOICES = [
  { key: "soprano", name: "Soprano", lo: "C4", hi: "C6", shift: 16 },
  { key: "mezzo", name: "Mezzo-soprano", lo: "A3", hi: "A5", shift: 13 },
  { key: "alto", name: "Alto", lo: "F3", hi: "F5", shift: 10 },
  { key: "tenor", name: "Tenor", lo: "C3", hi: "C5", shift: 4 },
  { key: "baritone", name: "Baritone", lo: "A2", hi: "A4", shift: 0 },
  { key: "bass", name: "Bass", lo: "E2", hi: "E4", shift: -3 },
];

/* ---------------------------------------------------------------- exercise -> keys */
function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
function rootSeq(it) {
  // an explicit key list wins: "M-mo on C D E F G" is a set of keys, not a range
  if (Array.isArray(it.keys) && it.keys.length) {
    const reps = Math.max(1, Math.min(6, it.reps || 1)), out = [];
    it.keys.map(parseNote).filter(x => x !== null).forEach(r => { for (let k = 0; k < reps; k++) out.push(r); });
    return out;
  }
  const a = parseNote(it.from), b = parseNote(it.to);
  if (a === null || b === null) return [];
  const st = Math.max(1, Math.min(12, Math.round(it.step || 1)));
  const dir = b >= a ? 1 : -1, seq = [];
  for (let r = a; dir > 0 ? r <= b : r >= b; r += dir * st) seq.push(r);
  if (it.back && seq.length > 1) for (let k = seq.length - 2; k >= 0; k--) seq.push(seq[k]);
  const reps = Math.max(1, Math.min(6, it.reps || 1)), out = [];
  seq.forEach(r => { for (let k = 0; k < reps; k++) out.push(r); });
  return out;
}

/* ---------------------------------------------------------------- exercise -> events
   ONE event list per exercise, in seconds from its start. The same list drives the sound,
   the keyboard, the pitch lane, AND the session log, so what gets scored is what played. */
function buildEvents(it) {
  const ev = [], keys = [];
  let t = 0;
  const click = (at, hi) => ev.push({ t: at, k: "click", hi });
  const type = it.type || "scale";

  if (type === "timer") {
    keys.push({ t: 0, label: it.steps && it.steps.length ? it.steps[0] : "", root: null });
    if (Array.isArray(it.steps) && it.steps.length > 1) {
      const per = Math.max(1, it.secs) / it.steps.length;
      it.steps.forEach((s, i) => { if (i) keys.push({ t: i * per, label: s, root: null }); });
    }
    ev.push({ t: Math.max(1, it.secs) - 0.05, k: "chime" });
    return { ev, keys, dur: Math.max(1, it.secs) + 0.6 };
  }
  if (type === "drone") {
    const n = parseNote(it.note);
    const secs = Math.max(4, it.secs || 60);
    keys.push({ t: 0, label: "Drone on " + noteName(n), root: n });
    ev.push({ t: 0, k: "drone", m: n, dur: secs, fifth: !!it.fifth });
    return { ev, keys, dur: secs + 0.5 };
  }
  if (type === "breath") {
    const spb = 60 / (it.bpm || 100);
    if (it.chugga) {
      /* "Chugga chugga" breathing: sixteenths, OUT on the beat, accent every downbeat,
         for `outCounts` beats, then a rest. */
      for (let r = 0; r < (it.reps || 3); r++) {
        keys.push({ t, label: "OUT in out in · round " + (r + 1), root: null });
        for (let b = 0; b < (it.outCounts || 8) * 4; b++) click(t + b * spb / 4, b % 4 === 0);
        t += (it.outCounts || 8) * spb + (it.rest || 8) * spb;
      }
      return { ev, keys, dur: t };
    }
    for (let b = 0; b < 4; b++) click(t + b * spb, b === 0); t += 4 * spb;
    const ladder = Array.isArray(it.ladder) && it.ladder.length ? it.ladder : null;
    const reps = ladder ? ladder.length : (it.reps || 3);
    for (let r = 0; r < reps; r++) {
      const out = ladder ? ladder[r] : it.outCounts;
      keys.push({ t, label: "In " + it.inCounts + " · out " + out, root: null, count: { t, inC: it.inCounts, outC: out, spb } });
      ev.push({ t, k: "swell", dur: it.inCounts * spb });
      for (let b = 0; b < it.inCounts; b++) click(t + b * spb, true);
      t += it.inCounts * spb;
      for (let b = 0; b < out; b++) click(t + b * spb, b % 4 === 0);
      t += out * spb + (it.rest || 8) * spb;
    }
    return { ev, keys, dur: t };
  }
  if (type === "siren") {
    const lo = parseNote(it.low), hi = parseNote(it.high), spb = 0.6;
    const shape = it.shape || "updown";
    for (let g = 0; g < (it.count || 3); g++) {
      if (it.countIn !== false) { for (let b = 0; b < 4; b++) click(t + b * spb, b === 0); t += 4 * spb + 0.5; }
      keys.push({ t, label: "Glide " + (g + 1) + " of " + (it.count || 3), root: null });
      ev.push({ t, k: "glide", dur: it.secs, lo, hi, shape });
      t += it.secs + (it.gap ?? 4);
    }
    return { ev, keys, dur: t };
  }

  /* scale / arpeggio / custom notes */
  const { notes } = parsePattern(it.pattern, it.scale || it.quality || "maj", it.mode);
  const syl = String(it.syllables || "").trim().split(/\s+/).filter(Boolean);
  const spb = 60 / (it.bpm || 100), unit = (it.beat || 1) * spb;
  const scale = it.scale || it.quality || "maj";
  if (it.countIn !== false) { for (let b = 0; b < 4; b++) click(t + b * spb, b === 0); t += 4 * spb; }
  const roots = rootSeq(it);
  roots.forEach((r, ki) => {
    const first = notes.find(n => n.semi !== null), startNote = r + (first ? first.semi : 0);
    keys.push({ t, label: "", root: r, ki, of: roots.length });
    const ch = triadOf(r, scale);
    // The chord alone is the cue: "chord, then first note" is read as "chord" everywhere,
    // including in saved warm-ups that still say chordnote. Only an explicit "note" plays a note.
    let lead = it.lead || "chord"; if (lead === "chordnote") lead = "chord";
    const strum = it.chordStyle === "broken";
    const playChord = (notesIn, at, dur, kind) => notesIn.forEach((m, j) => ev.push({ t: at + (strum ? j * spb * 0.18 : 0), k: kind, m, dur }));
    if (lead === "chord") { playChord(ch, t, 2 * spb, "chord"); t += 2 * spb; }
    if (lead === "cadence" || lead === "cadence4") {
      const IV = [r + 5 - 12, r + 9 - 12, r], V = [r - 5, r - 1, r + 2];
      const seq = lead === "cadence4" ? [ch, IV, V, ch] : [ch, V, ch];
      seq.forEach(c => { playChord(c, t, spb * 0.95, "chord"); t += spb; });
    }
    if (lead === "note") { ev.push({ t, k: "lead", m: startNote, dur: spb * 0.9 }); t += spb; }
    const exBeats = notes.reduce((s, n) => s + n.beats, 0) * (it.beat || 1) + (it.hold || 0);
    const exDur = exBeats * spb;
    if (it.bed !== false && lead !== "none" || it.bed === true) {
      // One soft chord held under the pattern. Re-striking it every bar was ON by default
      // and on long patterns it sounded like the piano wandering off into its own chords,
      // so it is now opt-in (bedRestrike) for people who want support under long scales.
      if (it.bedRestrike) {
        const bar = 4 * spb;
        for (let s = 0; s < exDur - 0.05; s += bar) ch.forEach(m => ev.push({ t: t + s, k: "bed", m, dur: Math.min(bar, exDur - s) + 0.3 }));
      } else ch.forEach(m => ev.push({ t, k: "bed", m, dur: exDur + 0.3 }));
    }
    if (it.bass) ev.push({ t, k: "bed", m: r - 12, dur: exDur + 0.3 });
    if (it.click) for (let b = 0; b < Math.round(exBeats); b++) click(t + b * spb, b === 0);
    let si = 0;
    notes.forEach((n, i) => {
      let d = n.beats * unit; if (i === notes.length - 1) d += (it.hold || 0) * spb;
      if (n.semi !== null) {
        const sound = n.stacc ? d * 0.45 : Math.min(d * 1.04, d + 0.2);
        ev.push({ t, k: "note", m: r + n.semi, dur: sound, acc: n.acc, syl: syl.length ? syl[si % syl.length] : "" });
        si++;
      }
      t += d;
    });
    t += (it.gap ?? 2) * spb;
  });
  return { ev, keys, dur: t + 0.4 };
}
const itemDur = it => buildEvents(it).dur;
function noteRange(it) {
  const type = it.type || "scale";
  if (type === "siren") return { lo: parseNote(it.low), hi: parseNote(it.high) };
  if (type === "drone") { const n = parseNote(it.note); return { lo: n, hi: n + (it.fifth ? 7 : 0) }; }
  if (type !== "scale") return null;
  const { notes } = parsePattern(it.pattern, it.scale || it.quality, it.mode), sp = span(notes), rs = rootSeq(it);
  if (!rs.length) return null;
  return { lo: Math.min(...rs) + sp.lo, hi: Math.max(...rs) + sp.hi };
}
function fitToRange(it, lo, hi) {
  if ((it.type || "scale") !== "scale") return;
  const { notes } = parsePattern(it.pattern, it.scale || it.quality, it.mode), sp = span(notes);
  let from = lo - sp.lo, to = hi - sp.hi;
  if (to < from) to = from;
  if (it.keysDir === "down") [from, to] = [to, from];
  it.from = noteAscii(from); it.to = noteAscii(to);
}
function fmtTime(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

/* ---------------------------------------------------------------- QUICK MODE
   The vocalrangetester method, reproduced and then extended:
     - range: voice type inset 2 st at the bottom and 3 at the top, or your own notes as given;
     - a FOCUS picks a zone of that range; patterns start centred on the middle, clamped
       into the zone, step one semitone at a time toward the focus, and turn back at the
       zone's edge so no note leaves your range;
     - two beats of breath after every repeat, five seconds between exercises;
     - repeats are chosen so the total lands as close as possible to the length you picked;
     - the same choices always give the same routine (so a link can carry it).
   Additions: a real piano and a chord before each key, more focuses and lengths. */
const QUICK_POOL = {
  breath:   { name: "Slow hiss", type: "breath", vowel: "sss", inCounts: 4, outCounts: 8, rest: 4, block: "breath" },
  hum:      { name: "Humming", pattern: "1 2 3 2 1", vowel: "mm", block: "warmup", cue: "Lips closed, teeth apart. Feel the buzz on your lips." },
  trill:    { name: "Lip trills", pattern: "1 2 3 4 5 4 3 2 1", vowel: "brr", block: "warmup", cue: "Loose lips. If they stall, press your cheeks in gently with two fingers." },
  siren:    { name: "Sirens", type: "siren", vowel: "ng or oo", block: "sirens", cue: "One unbroken line, quiet at both ends." },
  five:     { name: "Five-note scale", pattern: "1 2 3 4 5 4 3 2 1", vowel: "mee meh mah moh moo", syllables: "mee meh mah moh moo mah meh mee mee", block: "warmup" },
  down:     { name: "Descending scale", pattern: "5 4 3 2 1", vowel: "yah", block: "warmup", cue: "Start light at the top and keep it light coming down." },
  arp:      { name: "Arpeggio", pattern: "1 3 5 8 5 3 1", vowel: "ah", block: "warmup" },
  stacc:    { name: "Staccato", pattern: "1. 3. 5. 3. 1.", vowel: "ha", block: "onsets", cue: "Short, light, bouncing from the belly." },
  nay:      { name: "Bratty nay", pattern: "1 3 5 8 5 3 1", vowel: "nay", block: "transition", cue: "Bratty and a little nasal. Keep it small as it climbs." },
  octslide: { name: "Octave slide", type: "siren", vowel: "oo", block: "sirens", shape: "updown", cue: "Up an octave and back, no bumps." },
  messa:    { name: "Swell on one note", pattern: "1:8", vowel: "ah", block: "onsets", cue: "Start soft, grow, then shrink back without the tone changing." },
  coolhum:  { name: "Hum down", pattern: "5 4 3 2 1", vowel: "mm", block: "cooldown", cue: "Easy and quiet. Let it fall." },
  fast:     { name: "Fast five", pattern: "1 2 3 4 5 4 3 2 1 2 3 4 5 4 3 2 1", vowel: "ah", block: "warmup", beatMul: 0.5 },
};
const QUICK_FOCUS = {
  middle:  { name: "Middle voice", sub: "Easy, all-round start", zone: "middle", toward: 1,
             order: ["breath", "hum", "trill", "siren", "five", "arp", "stacc"] },
  low:     { name: "Low notes", sub: "Works down from the middle", zone: "low", toward: -1,
             order: ["breath", "hum", "trill", "siren", "five", "down", "arp"] },
  high:    { name: "High notes", sub: "Works up to your top note", zone: "high", toward: 1,
             order: ["breath", "hum", "trill", "siren", "five", "arp", "stacc", "nay"] },
  agility: { name: "Agility", sub: "Faster scales and staccato", zone: "middle", toward: 1, beat: 0.5,
             order: ["breath", "trill", "siren", "five", "fast", "arp", "stacc"] },
  breath:  { name: "Breath", sub: "Long notes and steady air", zone: "middle", toward: 1, beat: 2,
             order: ["breath", "hum", "trill", "siren", "five", "messa", "stacc"] },
  mix:     { name: "Bridge and mix", sub: "Through the break, small and bratty", zone: "upper-middle", toward: 1,
             order: ["breath", "trill", "siren", "octslide", "nay", "five", "arp"] },
  cool:    { name: "Cool down", sub: "After singing, gentle and low", zone: "low", toward: -1, beat: 1.25,
             order: ["trill", "coolhum", "siren", "down"] },
};
const QUICK_LENGTH_COUNT = { 3: 3, 5: 5, 10: 6, 15: 7, 20: 7 };

function quickRoutine(opt) {
  /* opt: {voice, lo, hi (when own notes), minutes, focus, bpm, piano:bool, chords:bool} */
  let lo, hi;
  if (opt.voice && opt.voice !== "own") {
    const v = VOICES.find(x => x.key === opt.voice) || VOICES[4];
    lo = parseNote(v.lo) + 2; hi = parseNote(v.hi) - 3;
  } else { lo = parseNote(opt.lo); hi = parseNote(opt.hi); }
  if (lo === null || hi === null) throw new Error("Choose a voice type or both of your notes.");
  if (hi - lo < 7) throw new Error("Your two notes must be at least 7 semitones apart, the size of a five-note scale.");
  const F = QUICK_FOCUS[opt.focus] || QUICK_FOCUS.middle;
  const mid = Math.round((lo + hi) / 2), width = hi - lo;
  const zone = {
    middle: [Math.max(lo, mid - Math.ceil(width * 0.35)), Math.min(hi, mid + Math.ceil(width * 0.35))],
    low: [lo, Math.min(hi, mid + 3)],
    high: [Math.max(lo, mid - 3), hi],
    "upper-middle": [Math.max(lo, mid - 2), Math.min(hi, mid + Math.ceil(width * 0.45))],
  }[F.zone];
  const minutes = +opt.minutes || 5;
  const n = Math.min(F.order.length, QUICK_LENGTH_COUNT[minutes] || Math.min(F.order.length, Math.round(minutes / 1.5)));
  const pick = F.order.slice(0, n);
  const bpm = +opt.bpm || 72;
  const spb = 60 / bpm;
  const lead = opt.chords === false ? "note" : "chord";

  // one repeat of each exercise, to price it
  const items = pick.map(k => {
    const p = QUICK_POOL[k];
    const it = Object.assign({ id: uid(), type: "scale", scale: "maj", bpm, beat: (p.beatMul || 1) * (F.beat || 1), hold: 0,
      lead, gap: 2, countIn: false, bed: opt.chords !== false, click: false, step: 1, reps: 1, src: "quick" }, JSON.parse(JSON.stringify(p)));
    delete it.beatMul;
    if (it.type === "breath") { it.bpm = 60; it.reps = 2; }
    if (it.type === "siren") {
      const sp = k === "octslide" ? 12 : Math.min(12, zone[1] - zone[0]);
      const a = Math.max(lo, Math.min(zone[0], mid - Math.floor(sp / 2)));
      it.low = noteAscii(a); it.high = noteAscii(Math.min(hi, a + Math.max(sp, 7)));
      it.secs = 8; it.count = 2; it.gap = 2 * spb; it.countIn = false;
    }
    if (it.type === "scale") {
      let pat = it.pattern;
      const { notes } = parsePattern(pat, "maj"), sp = span(notes);
      // the arpeggio drops its top note when the zone is narrower than an octave
      if (k === "arp" && (zone[1] - zone[0]) < 12) { it.pattern = pat = "1 3 5 3 1"; }
      const s2 = span(parsePattern(pat, "maj").notes);
      it._span = s2;
    }
    return it;
  });

  // repeats: fill the length. Each scale item gets an equal share of the time left after the
  // fixed-length items and the 5 s changes, then rounds to whole repeats (minimum 2).
  const target = minutes * 60;
  const fixed = items.filter(i => i.type !== "scale");
  const scales = items.filter(i => i.type === "scale");
  const fixedDur = fixed.reduce((s, i) => s + itemDur(i), 0) + 5 * (items.length - 1);
  const perScale = Math.max(10, (target - fixedDur) / Math.max(1, scales.length));
  scales.forEach(it => {
    const s = it._span; delete it._span;
    const one = Object.assign({}, it, { from: noteAscii(60), to: noteAscii(60), keys: null });
    const repDur = itemDur(one);
    const reps = Math.max(2, Math.round(perScale / repDur));
    // start centred on the middle, clamped so the whole pattern sits in the zone
    // A pattern wider than its zone may use the whole range instead; one wider than the
    // whole range drops to a triad. Never clamp it into a zone it does not fit, because
    // that is how a top note ends up above the singer's ceiling.
    let z0 = zone[0], z1 = zone[1], sp = s;
    if (z1 - z0 < sp.hi - sp.lo) { z0 = lo; z1 = hi; }
    if (z1 - z0 < sp.hi - sp.lo) { it.pattern = "1 3 5 3 1"; sp = span(parsePattern(it.pattern, "maj").notes); }
    const minR = z0 - sp.lo, maxR = z1 - sp.hi;
    let r = Math.round(mid - (sp.lo + sp.hi) / 2);
    r = Math.max(minR, Math.min(maxR, r));
    // step toward the focus, turning back at the zone edge
    let dir = F.toward;
    const ks = [];
    for (let i = 0; i < reps; i++) {
      ks.push(noteAscii(r));
      if (maxR <= minR) continue;
      if (r + dir > maxR || r + dir < minR) dir = -dir;
      r += dir;
    }
    it.keys = ks; it.from = ks[0]; it.to = ks[ks.length - 1];
  });
  // breath count grows with the length
  fixed.forEach(it => { if (it.type === "breath") it.reps = minutes >= 10 ? 4 : minutes >= 5 ? 3 : 2; });
  const name = F.name + " · " + minutes + " min";
  return { name, voice: opt.voice || "own", range: { lo: noteAscii(lo), hi: noteAscii(hi) }, gapBetween: 5, items, quick: opt };
}

const API = { NAMES, noteName, noteAscii, parseNote, hz, SCALES, parsePattern, span, triadOf, VOICES,
  uid, rootSeq, buildEvents, itemDur, noteRange, fitToRange, fmtTime, quickRoutine, QUICK_FOCUS, QUICK_POOL };
if (typeof module !== "undefined") module.exports = API; else root.WB = Object.assign(root.WB || {}, API);
})(typeof window !== "undefined" ? window : globalThis);
