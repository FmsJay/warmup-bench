/* Warmup Bench - the app. Views: Quick (the vocalrangetester method, improved), Library
   (every exercise and preset), Build (advanced: write your own), Sing (player with a live
   pitch lane and recording), Sessions (your takes, sent to the coach), Coach (insights and
   plans coming back). */
(function () {
"use strict";
const W = window.WB, L = window.WBLIB, A = window.WBA, ML = window.WBML;
const el = id => document.getElementById(id);
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = W.fmtTime;
function toast(m) { const t = el("toast"); t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2800); }
function pill(id, cls, text) { const p = el(id); p.hidden = false; p.className = "pill " + cls; p.lastElementChild.textContent = text; }
const LS = {
  get(k, d) { try { const v = localStorage.getItem("wb:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("wb:" + k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------------------------------------------------------------- IndexedDB: sessions + audio */
const DB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open("warmup-bench", 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("sessions", { keyPath: "id" }); d.createObjectStore("audio"); };
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async tx(store, mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => { const t = d.transaction(store, mode), s = t.objectStore(store); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); });
  },
  putSession(s) { return this.tx("sessions", "readwrite", st => st.put(s)); },
  delSession(id) { return Promise.all([this.tx("sessions", "readwrite", st => st.delete(id)), this.tx("audio", "readwrite", st => st.delete(id))]); },
  async allSessions() { const d = await this.open(); return new Promise((res, rej) => { const r = d.transaction("sessions").objectStore("sessions").getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); },
  putAudio(id, blob) { return this.tx("audio", "readwrite", st => st.put(blob, id)); },
  async getAudio(id) { const d = await this.open(); return new Promise((res, rej) => { const r = d.transaction("audio").objectStore("audio").get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); },
};

/* ---------------------------------------------------------------- settings + range */
const S = Object.assign({
  voice: "baritone", lo: "E2", hi: "G4", useOwn: false, instrument: "piano", speak: true, shortCues: false,
  mix: { piano: 1, chord: 0.6, click: 0.6, guide: 0.7, drone: 0.8, room: 0.18 }, record: true, clap: false, lane: true,
}, LS.get("settings", {}));
// voice: off | short (name + vowel) | full (name, vowel, cue). OFF by default, his call on
// 6 Oct: the cues were too long-winded. The cue text still shows on screen. The one-time
// flag resets browsers that saved the older default, so nobody is left with voice on.
if (!S.voiceOffDefault) { S.voiceMode = "off"; S.voiceOffDefault = true; }
// The sync clap is no longer needed: the app records the take itself, knows when recording
// started, and the analysis lines the voice up against the notes the app played.
if (!S.clapOffDefault) { S.clap = false; S.clapOffDefault = true; }
// The personal pack (teacher, course, our own) arrives from Drive; a cached copy keeps it
// available offline and on the first paint.
{ const cached = LS.get("pack", null); if (cached) L.addPack(cached); }
const saveS = () => {
  LS.set("settings", S);
  const rg = { lo: S.lo, hi: S.hi, useOwn: S.useOwn, voice: S.voice, rangeMeasured: S.rangeMeasured, voiceMode: S.voiceMode };
  const prev = window.WBML && WBML.data && WBML.setting("range");
  if (window.WBML && WBML.data && JSON.stringify(prev) !== JSON.stringify(rg)) { WBML.setting("range", rg); S.rangeT = Date.now(); LS.set("settings", S); }
};
const BARI_MID = 57; // A3, the middle of a baritone's A2-A4: library defaults are written there
function myRange() {
  if (S.useOwn) return { lo: W.parseNote(S.lo), hi: W.parseNote(S.hi) };
  const v = W.VOICES.find(x => x.key === S.voice) || W.VOICES[4];
  return { lo: W.parseNote(v.lo), hi: W.parseNote(v.hi) };
}
function voiceShift() {
  if (S.useOwn) { const r = myRange(); return Math.round((r.lo + r.hi) / 2 - BARI_MID); }
  return (W.VOICES.find(x => x.key === S.voice) || W.VOICES[4]).shift;
}
function voiceLabel() { if (S.useOwn) return "your notes " + W.noteName(W.parseNote(S.lo)) + "–" + W.noteName(W.parseNote(S.hi)); return (W.VOICES.find(x => x.key === S.voice) || {}).name; }
function transposeItem(it, d) {
  if (!d) return it;
  const tr = n => { const m = W.parseNote(n); return m === null ? n : W.noteAscii(m + d); };
  if (it.from) it.from = tr(it.from); if (it.to) it.to = tr(it.to);
  if (Array.isArray(it.keys)) it.keys = it.keys.map(tr);
  if (it.low) it.low = tr(it.low); if (it.high) it.high = tr(it.high);
  if (it.note) it.note = tr(it.note);
  return it;
}
/* After transposing, nudge any scale whose notes fall outside the singer's range back in. */
function clampItem(it) {
  if ((it.type || "scale") !== "scale") return it;
  const r = myRange(), nr = W.noteRange(it); if (!nr) return it;
  let d = 0; if (nr.hi > r.hi) d = r.hi - nr.hi; if (nr.lo + d < r.lo) d = r.lo - nr.lo;
  return transposeItem(it, d);
}
/* A library reference is a built-in key ("blah") or one of YOUR exercises ("mine:<id>").
   Built-ins are written for a baritone; yours were saved at whatever voice you had then,
   so they move by the difference. */
function fromLibrary(ref) {
  if (typeof ref === "string" && ref.startsWith("mine:")) {
    const m = ML.get("exercises", ref.slice(5)); if (!m) throw new Error("That exercise is no longer in your library");
    const it = JSON.parse(JSON.stringify(m)); it.mineId = m.id; it.id = W.uid();
    delete it.updatedAt; return clampItem(transposeItem(it, voiceShift() - (m.shiftAt || 0)));
  }
  return clampItem(transposeItem(L.instantiate(ref, W.uid), voiceShift()));
}
const SRC_ALL = new Proxy({}, { get: (_, k) => k === "mine" ? "Mine" : L.SRC[k], ownKeys: () => ["mine", ...Object.keys(L.SRC)], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
function mineAsEx(m) { return Object.assign({}, m, { key: "mine:" + m.id, src: "mine", cat: m.cat || guessCat(m) }); }
function guessCat(it) { const t = it.type || "scale"; return t === "siren" ? "glide" : t === "breath" ? "breath" : t === "drone" ? "ear" : t === "timer" ? "release" : (({ sirens: "glide", onsets: "onset", cooldown: "cool", transition: "register", breath: "breath" })[it.block] || "scale"); }

/* ---------------------------------------------------------------- routine state */
let routine = LS.get("routine", null);
ML.load();
let sel = 0;
function presetRoutine(key) {
  const p = L.PRESETS.find(x => x.key === key);
  return { name: p.name, source: p.group, preset: p.key, items: p.items.map(fromLibrary), gapBetween: 3 };
}
if (!routine || !Array.isArray(routine.items)) routine = presetRoutine(L.PRESETS.some(p => p.key === "daily") ? "daily" : "classic10");
const saveR = () => LS.set("routine", routine);
function routineDur(r) { return r.items.reduce((s, it) => s + W.itemDur(it), 0) + (r.gapBetween || 3) * Math.max(0, r.items.length - 1); }

/* ---------------------------------------------------------------- tabs */
function showTab(name) {
  $$(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.tab === name));
  $$(".view").forEach(v => v.hidden = v.id !== "view-" + name);
  LS.set("tab", name);
  if (name === "practice") { renderPractice(); }
  if (name === "build") renderBuild();
  if (name === "sessions") renderSessions();
  if (name === "coach") renderCoach();
  window.scrollTo({ top: 0 });
}

/* ================================================================ QUICK */
let quick = LS.get("quick", { voice: "baritone", lo: "", hi: "", minutes: 5, focus: "middle", bpm: 72, chords: true });
let quickOut = null;
const NOTE_OPTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function notePicker(id, val) {
  const m = W.parseNote(val); const n = m === null ? "" : NOTE_OPTS[((m % 12) + 12) % 12], o = m === null ? "" : Math.floor(m / 12) - 1;
  return `<div class="notepick"><select class="inline" id="${id}n" aria-label="Note"><option value="">Note</option>${NOTE_OPTS.map(x => `<option ${x === n ? "selected" : ""}>${x}</option>`).join("")}</select>
    <select class="inline" id="${id}o" aria-label="Octave"><option value="">Octave</option>${[1, 2, 3, 4, 5, 6].map(x => `<option ${x === o ? "selected" : ""}>${x}</option>`).join("")}</select></div>`;
}
const readPick = id => { const n = el(id + "n").value, o = el(id + "o").value; return n && o ? n + o : ""; };
function renderQuick() {
  const v = el("view-quick");
  const own = quick.voice === "own";
  v.innerHTML = `
  <div class="grid2">
    <div class="panel qsteps">
      <h2>Your warm-up</h2>
      <div class="qstep"><span class="num">1</span><div class="stack">
        <span class="flabel">Your voice</span>
        <div class="seg" id="qVoiceMode"><button aria-pressed="${!own}" data-v="type">Voice type</button><button aria-pressed="${own}" data-v="own">My own notes</button></div>
        ${own ? `<div class="fields"><div class="field"><label>Lowest comfortable note</label>${notePicker("qLo", quick.lo || S.lo)}</div>
              <div class="field"><label>Highest comfortable note</label>${notePicker("qHi", quick.hi || S.hi)}</div></div>
              <div class="row"><button class="btn small" id="qFind">Find my range with the mic</button><button class="btn small ghost" id="qSwap">Swap the notes</button></div>
              <span class="faint small">Use notes you can sing easily, not your extremes. Middle C is C4.</span>`
            : `<div class="chips" id="qVoices">${W.VOICES.map(x => `<button class="chip" data-v="${x.key}" aria-pressed="${quick.voice === x.key}">${x.name}</button>`).join("")}</div>`}
      </div></div>
      <div class="qstep"><span class="num">2</span><div class="stack"><span class="flabel">Length</span>
        <div class="seg" id="qLen">${[3, 5, 10, 15, 20].map(m => `<button data-v="${m}" aria-pressed="${quick.minutes == m}">${m} min</button>`).join("")}</div></div></div>
      <div class="qstep"><span class="num">3</span><div class="stack"><span class="flabel">Focus</span>
        <div class="focusgrid" id="qFocus">${Object.entries(W.QUICK_FOCUS).map(([k, f]) => `<button class="fcard" data-v="${k}" aria-pressed="${quick.focus === k}"><b>${esc(f.name)}</b><span>${esc(f.sub)}</span></button>`).join("")}</div></div></div>
      <div class="qstep"><span class="num">4</span><div class="stack"><span class="flabel">Tempo</span>
        <div class="seg" id="qBpm">${[[60, "Slow"], [72, "Medium"], [84, "Brisk"], [96, "Fast"]].map(([b, l]) => `<button data-v="${b}" aria-pressed="${quick.bpm == b}">${l} ${b}</button>`).join("")}</div></div></div>
      <div class="qstep"><span class="num">5</span><div class="stack"><span class="flabel">Sound</span>
        <div class="seg" id="qSound">${[["piano", "Piano"], ["synth", "Synth piano"], ["sine", "Soft (sine)"], ["triangle", "Bright (triangle)"]].map(([k, l]) => `<button data-v="${k}" aria-pressed="${S.instrument === k}">${l}</button>`).join("")}</div>
        <label class="check"><input type="checkbox" id="qChords" ${quick.chords ? "checked" : ""}> Play the chord before each key</label></div></div>
      <div class="row"><button class="btn primary big" id="qGo">Generate my warm-up</button><button class="btn ghost" id="qClear">Clear</button></div>
      <div id="qErr"></div>
    </div>
    <div class="panel stack" id="qOut"></div>
  </div>`;
  const pressIn = (id, fn) => $$("#" + id + " [data-v]").forEach(b => b.addEventListener("click", () => fn(b.dataset.v)));
  pressIn("qVoiceMode", m => { quick.voice = m === "own" ? "own" : (quick.lastType || "baritone"); LS.set("quick", quick); renderQuick(); });
  pressIn("qVoices", k => { quick.voice = k; quick.lastType = k; LS.set("quick", quick); renderQuick(); });
  pressIn("qLen", m => { quick.minutes = +m; LS.set("quick", quick); renderQuick(); });
  pressIn("qFocus", k => { quick.focus = k; LS.set("quick", quick); renderQuick(); });
  pressIn("qBpm", b => { quick.bpm = +b; LS.set("quick", quick); renderQuick(); });
  pressIn("qSound", k => { S.instrument = k; A.instrument = k; saveS(); renderQuick(); });
  el("qChords").addEventListener("change", e => { quick.chords = e.target.checked; LS.set("quick", quick); });
  if (own) {
    const upd = () => { quick.lo = readPick("qLo"); quick.hi = readPick("qHi"); LS.set("quick", quick); };
    $$("#view-quick select").forEach(s => s.addEventListener("change", upd));
    el("qSwap").addEventListener("click", () => { upd(); [quick.lo, quick.hi] = [quick.hi, quick.lo]; LS.set("quick", quick); renderQuick(); });
    el("qFind").addEventListener("click", () => rangeFinder(r => { quick.lo = r.lo; quick.hi = r.hi; LS.set("quick", quick); renderQuick(); }));
  }
  el("qGo").addEventListener("click", generateQuick);
  el("qClear").addEventListener("click", () => { quickOut = null; renderQuickOut(); });
  renderQuickOut();
}
function generateQuick() {
  el("qErr").innerHTML = "";
  try {
    if (quick.voice === "own") { quick.lo = readPick("qLo"); quick.hi = readPick("qHi"); let a = W.parseNote(quick.lo), b = W.parseNote(quick.hi); if (a !== null && b !== null && a > b) [quick.lo, quick.hi] = [quick.hi, quick.lo]; }
    quickOut = W.quickRoutine(quick);
    LS.set("quick", quick);
    history.replaceState(null, "", "#" + encodeQuick());
  } catch (e) { el("qErr").innerHTML = `<div class="callout rose">${esc(e.message)}</div>`; quickOut = null; }
  renderQuickOut();
}
function encodeQuick() { const q = quick; return "q=" + [q.voice, q.voice === "own" ? q.lo + "-" + q.hi : "", q.minutes, q.focus, q.bpm, q.chords ? 1 : 0].join("."); }
function decodeQuick(h) {
  const m = /q=([^&]+)/.exec(h); if (!m) return false;
  const [voice, rng, minutes, focus, bpm, chords] = m[1].split(".");
  Object.assign(quick, { voice, minutes: +minutes || 5, focus: focus || "middle", bpm: +bpm || 72, chords: chords !== "0" });
  if (voice === "own" && rng) { const [lo, hi] = rng.split("-"); quick.lo = lo; quick.hi = hi; }
  return true;
}
function renderQuickOut() {
  const o = el("qOut"); if (!o) return;
  if (!quickOut) { o.innerHTML = `<h2>Your routine</h2><div class="empty">No routine yet. Choose a voice type or your own notes, then press <b>Generate my warm-up</b>.</div>
    <div class="summary"><div><span class="label">Voice</span><b>–</b></div><div><span class="label">Notes used</span><b>–</b></div><div><span class="label">Total time</span><b>–</b></div><div><span class="label">Exercises</span><b>–</b></div></div>`; return; }
  const r = quickOut; let lo = 999, hi = -1;
  r.items.forEach(it => { const x = W.noteRange(it); if (x) { lo = Math.min(lo, x.lo); hi = Math.max(hi, x.hi); } });
  const total = routineDur({ items: r.items, gapBetween: 5 });
  o.innerHTML = `<div class="spread"><h2>${esc(r.name)}</h2><span class="mono faint small">${fmt(total)}</span></div>
    <div class="summary"><div><span class="label">Voice</span><b>${esc(quick.voice === "own" ? "Own notes" : (W.VOICES.find(v => v.key === quick.voice) || {}).name)}</b></div>
      <div><span class="label">Notes used</span><b>${W.noteName(lo)}–${W.noteName(hi)}</b></div><div><span class="label">Total time</span><b>${fmt(total)}</b></div><div><span class="label">Exercises</span><b>${r.items.length}</b></div></div>
    <div class="routine-out">${r.items.map((it, i) => {
      let det = "";
      if (it.type === "scale") {
        const { notes } = W.parsePattern(it.pattern, it.scale); const r0 = W.parseNote(it.keys[0]);
        det = notes.filter(n => n.semi !== null).map(n => W.noteName(r0 + n.semi)).join(" ") + ` · ${it.keys.length} repeats from ${it.keys.map(k => W.noteName(W.parseNote(k))).join(" ")}`;
      } else if (it.type === "siren") det = `${W.noteName(W.parseNote(it.low))} up to ${W.noteName(W.parseNote(it.high))} and back · ${it.count} glides`;
      else if (it.type === "breath") det = `in ${it.inCounts}, out ${it.outCounts} · ${it.reps} breaths`;
      return `<div class="rex"><div><span class="nm">${i + 1}. ${esc(it.name)}</span> <span class="faint">${esc(it.vowel || "")}</span></div>
        <button class="btn small" data-from="${i}">Play from here</button><div class="det">${esc(det)} · ${fmt(W.itemDur(it))}</div></div>`;
    }).join("")}</div>
    <div class="row"><button class="btn primary" id="qPlay">▶ Play</button><button class="btn" id="qEdit">Edit in Build</button><button class="btn ghost" id="qCopy">Copy routine</button><button class="btn ghost" id="qShare">Share link</button></div>
    <p class="faint small">Stop if anything strains or hurts. Warm-ups should feel easy.</p>`;
  const asRoutine = () => ({ name: r.name, source: "quick", items: JSON.parse(JSON.stringify(r.items)), gapBetween: 5 });
  el("qPlay").addEventListener("click", () => { routine = asRoutine(); saveR(); showTab("practice"); startRoutine(0); });
  $$("[data-from]", o).forEach(b => b.addEventListener("click", () => { routine = asRoutine(); saveR(); showTab("practice"); startRoutine(+b.dataset.from); }));
  el("qEdit").addEventListener("click", () => { routine = asRoutine(); sel = 0; saveR(); showTab("build"); });
  el("qCopy").addEventListener("click", () => {
    const txt = r.name + "\n" + r.items.map((it, i) => `${i + 1}. ${it.name} (${it.vowel || ""}) ${it.type === "scale" ? it.pattern + " from " + it.keys[0] : ""}`).join("\n") + "\n" + location.href.split("#")[0] + "#" + encodeQuick();
    navigator.clipboard.writeText(txt).then(() => toast("Routine copied"), () => toast("Could not copy"));
  });
  el("qShare").addEventListener("click", () => {
    const url = location.href.split("#")[0] + "#" + encodeQuick();
    if (navigator.share) navigator.share({ title: "Warm-up: " + r.name, url }).catch(() => {}); else navigator.clipboard.writeText(url).then(() => toast("Link copied"));
  });
}

/* ================================================================ RANGE FINDER */
function sheet(html) { el("sheet").innerHTML = html; el("sheet").hidden = false; el("sheetBack").hidden = false; }
function closeSheet() { el("sheet").hidden = true; el("sheetBack").hidden = true; el("sheet").innerHTML = ""; if (sheet.onClose) { sheet.onClose(); sheet.onClose = null; } }
async function rangeFinder(done) {
  try { await A.mic.open(S.micId || ""); } catch (e) { toast("Microphone: " + (e.message || e.name)); return; }
  await A.ctx().resume();
  const steps = [
    { key: "neutral", title: "Your natural note", say: "Sing an easy, natural 'ah', the note that comes out when you're relaxed. Hold it." },
    { key: "low", title: "Down to fry", say: "From there, slide down slowly, staying relaxed, until the voice starts to croak into fry. Then stop." },
    { key: "break", title: "Up to the break", say: "Back to your natural note, then slide up at the SAME volume until the voice wants to flip." },
    { key: "high", title: "Louder at the top", say: "Now sing that top note as loud as is still comfortable, and push up a little further. No strain." },
  ];
  let i = 0; const got = {}; let frames = []; let raf = 0, live = true;
  const draw = () => {
    const s = steps[i];
    sheet(`<div class="stack"><span class="label">Step ${i + 1} of 4 · range finder</span><h2>${s.title}</h2><p class="muted">${s.say}</p>
      <div class="big-note" id="rfNote">·</div><div class="meter" style="max-width:none"><i id="rfMeter"></i></div>
      <div class="row"><button class="btn primary" id="rfNext">${i < 3 ? "Got it, next" : "Finish"}</button><button class="btn ghost" id="rfRedo">Redo this step</button><button class="btn ghost" id="rfCancel">Cancel</button></div>
      <p class="faint small">Measured from the frames where the mic hears a clear pitch. Fry itself has no clean pitch, so your lowest note is the last clear one before it.</p></div>`);
    frames = [];
    el("rfNext").onclick = next; el("rfRedo").onclick = () => { frames = []; }; el("rfCancel").onclick = () => { live = false; closeSheet(); };
  };
  const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
  function next() {
    const k = steps[i].key;
    if (frames.length < 8) { toast("I didn't hear enough. Sing a little longer."); return; }
    got[k] = k === "low" ? pct(frames, 0.05) : k === "neutral" ? pct(frames, 0.5) : pct(frames, 0.95);
    i++;
    if (i < steps.length) { draw(); return; }
    live = false;
    const lo = Math.round(got.low), hi = Math.round(Math.max(got.high, got.break));
    sheet(`<div class="stack"><h2>Your comfortable range</h2>
      <div class="summary"><div><span class="label">Lowest</span><b>${W.noteName(lo)}</b></div><div><span class="label">Natural</span><b>${W.noteName(Math.round(got.neutral))}</b></div>
      <div><span class="label">Break</span><b>${W.noteName(Math.round(got.break))}</b></div><div><span class="label">Highest</span><b>${W.noteName(hi)}</b></div></div>
      <p class="muted small">Write it down. It is a starting line, and it will move.</p>
      <div class="row"><button class="btn primary" id="rfUse">Use ${W.noteName(lo)}–${W.noteName(hi)}</button><button class="btn ghost" id="rfClose">Close</button></div></div>`);
    el("rfUse").onclick = () => {
      S.lo = W.noteAscii(lo); S.hi = W.noteAscii(hi); S.useOwn = true; S.rangeMeasured = { at: new Date().toISOString(), lo: S.lo, hi: S.hi, neutral: W.noteAscii(Math.round(got.neutral)), brk: W.noteAscii(Math.round(got.break)) };
      saveS(); closeSheet(); done && done({ lo: S.lo, hi: S.hi }); toast("Range saved");
    };
    el("rfClose").onclick = closeSheet;
  }
  draw();
  let last = 0;
  const loop = (t) => {
    if (!live) return;
    if (t - last > 45) {
      last = t; const p = A.mic.pitch(); const m = el("rfMeter");
      if (m && p) m.style.width = Math.min(100, p.rms * 600) + "%";
      if (p && p.midi && p.clarity > 0.8 && p.midi > 30 && p.midi < 90) { frames.push(p.midi); const n = el("rfNote"); if (n) n.textContent = W.noteName(Math.round(p.midi)); }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  sheet.onClose = () => { live = false; cancelAnimationFrame(raf); };
}

/* ================================================================ LIBRARY */
let libFilter = LS.get("libFilter", { cat: "", src: "", q: "", pgroup: "ours" });
function miniContour(it) {
  if ((it.type || "scale") !== "scale") return "";
  const { notes } = W.parsePattern(it.pattern, it.scale, it.mode); if (!notes.length) return "";
  const total = notes.reduce((s, n) => s + n.beats, 0), sp = W.span(notes), rng = Math.max(4, sp.hi - sp.lo);
  let x = 0, out = "";
  notes.forEach(n => { const w = n.beats / total * 296; if (n.semi !== null) { const y = 26 - (n.semi - sp.lo) / rng * 22; out += `<rect x="${2 + x}" y="${y - 2}" width="${Math.max(2, (n.stacc ? .45 : 1) * w - 1.5)}" height="4" rx="2" fill="var(--teal)"/>`; } x += w; });
  return `<svg class="mini" viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true">${out}</svg>`;
}
function exSummary(e) {
  if (e.type === "timer") return fmt(e.secs) + " guided" + (e.steps ? " · " + e.steps.length + " steps" : "");
  if (e.type === "breath") return e.chugga ? "sixteenths, OUT on the beat" : (e.ladder ? "in " + e.inCounts + ", out " + e.ladder.join(" · ") : "in " + e.inCounts + ", out " + e.outCounts + " × " + e.reps);
  if (e.type === "siren") return e.low + "–" + e.high + " · " + e.count + " × " + e.secs + " s";
  if (e.type === "drone") return "drone on " + e.note + " · " + fmt(e.secs);
  return e.pattern + (e.keys ? " · keys " + e.keys.join(" ") : "");
}
function renderLibrary() {
  const v = el("view-library");
  // preset groups: yours first, then whatever the pack brought, then the generic ones
  const groups = [["mine", "My warm-ups"], ...Object.entries(L.SRC).filter(([k]) => k !== "classic" && L.PRESETS.some(p => p.group === k)), ["classic", "Classic"]];
  if (!groups.some(g => g[0] === libFilter.pgroup)) libFilter.pgroup = "mine";
  const mineR = ML.list("routines");
  const ps = libFilter.pgroup === "mine" ? [] : L.PRESETS.filter(p => p.group === libFilter.pgroup);
  const q = libFilter.q.trim().toLowerCase();
  const allEx = [...ML.list("exercises").map(mineAsEx), ...L.EX];
  const ex = allEx.filter(e => (!libFilter.cat || e.cat === libFilter.cat) && (!libFilter.src || e.src === libFilter.src) &&
    (!q || (e.name + " " + (e.vowel || "") + " " + (e.cue || "") + " " + (e.pattern || "")).toLowerCase().includes(q)));
  const mineCards = libFilter.pgroup !== "mine" ? "" : (mineR.length ? mineR.map(r => `<div class="pcard"><div class="spread"><h3>${esc(r.name)}</h3><span class="src ${r.from === "coach" ? "ours" : "mine"}">${r.from === "coach" ? "From coach" : "Mine"}</span></div>
        ${r.why ? `<p>${esc(r.why)}</p>` : ""}<span class="mono faint small">${r.items.length} exercises · ${fmt(routineDur(r))}${r.updatedAt ? " · saved " + new Date(r.updatedAt).toLocaleDateString() : ""}</span>
        <div class="row"><button class="btn small primary" data-msing="${esc(r.id)}">▶ Sing it</button><button class="btn small" data-mload="${esc(r.id)}">Open in Build</button><button class="btn small ghost danger" data-mdel="${esc(r.id)}">Delete</button></div></div>`).join("")
      : `<div class="empty">Your saved warm-ups live here, synced through Google Drive. Build one, or open a preset and press <b>Save warm-up</b>.</div>`);
  v.innerHTML = `
    <div class="stack"><div class="spread"><h2>Presets</h2><span class="faint small">Transposed for ${esc(voiceLabel())}</span></div>
      <div class="seg" id="pGroups">${groups.map(([k, l]) => `<button data-v="${k}" aria-pressed="${libFilter.pgroup === k}">${l}</button>`).join("")}</div>
      <div class="pcards">${mineCards}${ps.map(p => { const items = p.items.map(fromLibrary); return `<div class="pcard"><div class="spread"><h3>${esc(p.name)}</h3><span class="src ${p.group}">${esc(SRC_ALL[p.group] || L.SRC[p.group] || p.group)}</span></div>
        <p>${esc(p.desc)}</p><span class="mono faint small">${items.length} exercises · ${fmt(routineDur({ items, gapBetween: 3 }))}</span>
        <div class="row"><button class="btn small primary" data-psing="${p.key}">▶ Sing it</button><button class="btn small" data-pload="${p.key}">Open in Build</button></div></div>`; }).join("")}</div></div>
    <div class="stack"><div class="spread"><h2>Exercises</h2><span class="faint small">${ex.length} of ${allEx.length}</span></div>
      <input class="search" id="libQ" type="search" placeholder="Search: siren, staccato, gong, fry…" value="${esc(libFilter.q)}">
      <div class="chips" id="libSrc"><button class="chip" data-v="" aria-pressed="${!libFilter.src}">All sources</button>${Object.entries(SRC_ALL).map(([k, l]) => `<button class="chip" data-v="${k}" aria-pressed="${libFilter.src === k}">${l}</button>`).join("")}</div>
      <div class="chips" id="libCat"><button class="chip" data-v="" aria-pressed="${!libFilter.cat}">Everything</button>${L.CATS.map(([k, l]) => `<button class="chip" data-v="${k}" aria-pressed="${libFilter.cat === k}">${l}</button>`).join("")}</div>
      <div class="libgrid">${ex.map(e => `<div class="lcard"><div class="top"><div class="nm">${esc(e.name)}</div><span class="src ${e.src}">${esc(SRC_ALL[e.src])}${e.week ? " W" + e.week : ""}${e.lesson ? " " + e.lesson.slice(5).replace("-", "/") : ""}</span></div>
        ${miniContour(e)}<div class="pat">${esc(exSummary(e))}${e.vowel ? " · " + esc(e.vowel) : ""}</div>
        ${e.cue ? `<div class="cue">${esc(e.cue)}</div>` : ""}${e.why ? `<div class="cue faint">${esc(e.why)}</div>` : ""}
        <div class="acts"><button class="btn small" data-hear="${esc(e.key)}">▶ Hear</button><button class="btn small primary" data-add="${esc(e.key)}">+ Add</button>${e.src === "mine"
          ? `<button class="btn small ghost" data-edit="${esc(e.key)}">Edit</button><button class="btn small ghost danger" data-xdel="${esc(e.id)}">Delete</button>`
          : `<button class="btn small ghost" data-edit="${esc(e.key)}">Customize</button>`}</div></div>`).join("") || `<div class="empty">Nothing matches. Clear a filter.</div>`}</div></div>`;
  const press = (id, fn) => $$("#" + id + " [data-v]").forEach(b => b.addEventListener("click", () => fn(b.dataset.v)));
  press("pGroups", g => { libFilter.pgroup = g; LS.set("libFilter", libFilter); renderLibrary(); });
  press("libSrc", s => { libFilter.src = s; LS.set("libFilter", libFilter); renderLibrary(); });
  press("libCat", c => { libFilter.cat = c; LS.set("libFilter", libFilter); renderLibrary(); });
  el("libQ").addEventListener("input", e => { libFilter.q = e.target.value; LS.set("libFilter", libFilter); clearTimeout(renderLibrary._t); renderLibrary._t = setTimeout(() => { renderLibrary(); const i = el("libQ"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
  $$("[data-psing]", v).forEach(b => b.addEventListener("click", () => { routine = presetRoutine(b.dataset.psing); saveR(); showTab("practice"); startRoutine(0); }));
  $$("[data-pload]", v).forEach(b => b.addEventListener("click", () => { routine = presetRoutine(b.dataset.pload); sel = 0; saveR(); showTab("build"); toast("Opened " + routine.name); }));
  $$("[data-hear]", v).forEach(b => b.addEventListener("click", () => previewItem(fromLibrary(b.dataset.hear))));
  $$("[data-add]", v).forEach(b => b.addEventListener("click", () => { routine.items.push(fromLibrary(b.dataset.add)); saveR(); toast("Added to " + routine.name + " (" + routine.items.length + ")"); }));
  // Customize / Edit: put it in the current warm-up and open it in the editor, where
  // "Save to My library" keeps the changed version
  $$("[data-edit]", v).forEach(b => b.addEventListener("click", () => { const it = fromLibrary(b.dataset.edit); routine.items.push(it); sel = routine.items.length - 1; saveR(); showTab("build"); toast(it.mineId ? "Editing your exercise. Save to My library when done." : "Change it, then press Save to My library."); }));
  $$("[data-xdel]", v).forEach(b => b.addEventListener("click", () => { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Delete for good?"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Delete"; }, 3000); return; } ML.remove("exercises", b.dataset.xdel); renderLibrary(); toast("Deleted from your library"); }));
  const byR = id => ML.get("routines", id);
  $$("[data-msing]", v).forEach(b => b.addEventListener("click", () => { routine = JSON.parse(JSON.stringify(byR(b.dataset.msing))); saveR(); showTab("practice"); startRoutine(0); }));
  $$("[data-mload]", v).forEach(b => b.addEventListener("click", () => { routine = JSON.parse(JSON.stringify(byR(b.dataset.mload))); sel = 0; saveR(); showTab("build"); toast("Opened " + routine.name); }));
  $$("[data-mdel]", v).forEach(b => b.addEventListener("click", () => { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Delete for good?"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Delete"; }, 3000); return; } ML.remove("routines", b.dataset.mdel); renderLibrary(); }));
}

/* ================================================================ BUILD (advanced) */
const BLOCKS = ["warmup", "blah", "eeoh", "vowels", "sirens", "transition", "onsets", "breath", "straw", "posture", "rest", "range", "spoken", "song", "cooldown", "other"];
function summary(it) {
  const t = it.type || "scale";
  if (t === "scale") { const rs = W.rootSeq(it); const dir = it.keys && it.keys.length ? "keys" : (it.back ? "↑↓" : (W.parseNote(it.to) >= W.parseNote(it.from) ? "↑" : "↓")); return it.pattern + " · " + (it.keys && it.keys.length ? it.keys.join(" ") : (it.from || "?") + "→" + (it.to || "?")) + " " + dir + " · " + rs.length + " keys · " + it.bpm + " bpm"; }
  return exSummary(it);
}
function renderBuild() {
  const v = el("view-build");
  if (!routine.items.length) sel = 0; else sel = Math.min(sel, routine.items.length - 1);
  v.innerHTML = `<div class="bgrid">
    <div class="stack">
      <div class="panel stack">
        <input class="rname" id="rName" value="${esc(routine.name)}" aria-label="Routine name">
        <div class="spread"><span class="mono faint small" id="rTotal"></span>
          <div class="row"><button class="btn small ghost" data-tr="-12">−8va</button><button class="btn small ghost" data-tr="-1">−½</button><button class="btn small ghost" data-tr="1">+½</button><button class="btn small ghost" data-tr="12">+8va</button><button class="btn small ghost" id="fitAll">Fit all to my range</button></div></div>
        <ol class="items" id="items"></ol>
        <div class="row"><button class="btn small" data-new="scale">+ Pattern</button><button class="btn small" data-new="siren">+ Siren</button><button class="btn small" data-new="breath">+ Breath</button><button class="btn small" data-new="drone">+ Drone</button><button class="btn small" data-new="timer">+ Guided</button><button class="btn small ghost" id="toLib">From library</button></div>
        <div class="row"><button class="btn primary" id="bSing">▶ Sing this warm-up</button><button class="btn brass" id="bSave">${routine.id && ML.get("routines", routine.id) ? "Save changes" : "Save warm-up"}</button><button class="btn ghost" id="bSaveAs" ${routine.id ? "" : "hidden"}>Save as new</button><button class="btn ghost" id="bNew">New</button></div>
      </div>
      <div class="panel stack"><div class="spread"><h3>My warm-ups</h3><span class="faint small" id="libState"></span></div><div id="savedList" class="stack"></div>
        <div class="row"><button class="btn small ghost" id="bExport">Export routine file</button><label class="btn small ghost">Import<input type="file" id="bImport" accept="application/json,.json" hidden></label></div></div>
    </div>
    <div class="panel" id="editor"></div></div>`;
  renderItems(); renderSaved(); renderEditor();
  el("rName").addEventListener("input", e => { routine.name = e.target.value; saveR(); });
  $$("[data-tr]", v).forEach(b => b.addEventListener("click", () => { routine.items.forEach(it => transposeItem(it, +b.dataset.tr)); saveR(); renderBuild(); }));
  el("fitAll").addEventListener("click", () => { const r = myRange(); routine.items.forEach(it => { if ((it.type || "scale") === "scale" && !(it.keys && it.keys.length)) W.fitToRange(it, r.lo, r.hi); else clampItem(it); }); saveR(); renderBuild(); toast("Fitted to " + voiceLabel()); });
  $$("[data-new]", v).forEach(b => b.addEventListener("click", () => { routine.items.splice(sel + 1, 0, newItem(b.dataset.new)); sel = Math.min(sel + 1, routine.items.length - 1); saveR(); renderBuild(); }));
  el("toLib").addEventListener("click", () => showTab("library"));
  el("bSing").addEventListener("click", () => { showTab("practice"); startRoutine(0); });
  el("bSave").addEventListener("click", () => saveRoutine(false));
  el("bSaveAs").addEventListener("click", () => saveRoutine(true));
  el("bNew").addEventListener("click", () => { routine = { name: "New warm-up", items: [], gapBetween: 3 }; sel = 0; saveR(); renderBuild(); });
  libState();
  el("bExport").addEventListener("click", () => downloadBlob(new Blob([JSON.stringify(routine, null, 1)], { type: "application/json" }), slug(routine.name) + ".warmup.json"));
  el("bImport").addEventListener("change", async e => { const f = e.target.files[0]; if (!f) return; try { const r = JSON.parse(await f.text()); if (!Array.isArray(r.items)) throw 0; r.items.forEach(it => it.id = it.id || W.uid()); routine = r; sel = 0; saveR(); renderBuild(); toast("Imported " + r.name); } catch (er) { toast("That file is not a warm-up routine"); } });
}
function newItem(type) {
  const r = myRange();
  if (type === "siren") return { id: W.uid(), type, name: "Siren", block: "sirens", vowel: "ng", cue: "One unbroken line, quiet at both ends.", low: W.noteAscii(r.lo), high: W.noteAscii(r.hi + 5), secs: 12, count: 3, gap: 4, countIn: true, shape: "updown" };
  if (type === "breath") return { id: W.uid(), type, name: "Breath", block: "breath", vowel: "sss", cue: "In on the high clicks, hiss out steady.", bpm: 80, inCounts: 4, outCounts: 16, reps: 3, rest: 6 };
  if (type === "drone") return { id: W.uid(), type, name: "Drone", block: "other", vowel: "ah", cue: "Sing freely over the drone, inside your comfortable range.", note: W.noteAscii(Math.round((r.lo + r.hi) / 2) - 5), secs: 120, fifth: true };
  if (type === "timer") return { id: W.uid(), type, name: "Guided", block: "rest", vowel: "", cue: "", secs: 60, steps: ["First step", "Second step"] };
  const it = { id: W.uid(), type: "scale", name: "Five-tone scale", block: "warmup", vowel: "ah", cue: "", pattern: "1 2 3 4 5 4 3 2 1", scale: "maj", mode: "degrees", syllables: "",
    from: "", to: "", back: true, step: 1, reps: 1, bpm: 92, beat: 1, hold: 0, lead: "chord", chordStyle: "block", bed: true, bass: false, gap: 2, click: false, countIn: false };
  W.fitToRange(it, r.lo, r.hi); return it;
}
function renderItems() {
  const ul = el("items"); ul.innerHTML = "";
  routine.items.forEach((it, i) => {
    const li = document.createElement("li");
    li.className = "item"; li.tabIndex = 0; li.setAttribute("aria-current", i === sel);
    const t = it.type || "scale";
    li.innerHTML = `<span class="n">${i + 1}</span><div style="min-width:0"><div class="nm"><span class="kind ${t}">${t === "scale" ? "PATTERN" : t.toUpperCase()}</span>${esc(it.name)}${it.vowel ? ` <span class="faint" style="font-weight:400">· ${esc(it.vowel)}</span>` : ""}</div>
      <div class="sm">${esc(summary(it))} · ${fmt(W.itemDur(it))}</div></div>
      <div class="ctl"><button class="btn ghost icon small" data-a="play" aria-label="Hear it">▶</button><button class="btn ghost icon small" data-a="up" aria-label="Move up">↑</button><button class="btn ghost icon small" data-a="down" aria-label="Move down">↓</button><button class="btn ghost icon small" data-a="dup" aria-label="Duplicate">⧉</button><button class="btn ghost icon small danger" data-a="del" aria-label="Remove">✕</button></div>`;
    li.addEventListener("click", e => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (!a) { sel = i; renderItems(); renderEditor(); return; }
      e.stopPropagation();
      if (a === "play") previewItem(it);
      if (a === "up" && i > 0) { [routine.items[i - 1], routine.items[i]] = [routine.items[i], routine.items[i - 1]]; sel = i - 1; }
      if (a === "down" && i < routine.items.length - 1) { [routine.items[i + 1], routine.items[i]] = [routine.items[i], routine.items[i + 1]]; sel = i + 1; }
      if (a === "dup") { const c = JSON.parse(JSON.stringify(it)); c.id = W.uid(); routine.items.splice(i + 1, 0, c); sel = i + 1; }
      if (a === "del") { routine.items.splice(i, 1); sel = Math.max(0, Math.min(sel, routine.items.length - 1)); }
      saveR(); renderItems(); renderEditor();
    });
    ul.appendChild(li);
  });
  el("rTotal").textContent = routine.items.length + " exercises · " + fmt(routineDur(routine));
}
const fld = (label, html, cls, hint) => `<div class="field ${cls || ""}"><label>${label}</label>${html}${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
const inp = (k, val, type, extra) => `<input data-k="${k}" type="${type || "text"}" value="${esc(val ?? "")}" ${extra || ""}>`;
const selx = (k, val, opts) => `<select data-k="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const chk = (k, val, label) => `<label class="check"><input type="checkbox" data-k="${k}" ${val ? "checked" : ""}> ${label}</label>`;
const NUMERIC = ["bpm", "secs", "count", "gap", "inCounts", "outCounts", "reps", "rest", "step", "beat", "hold"];
function renderEditor() {
  const ed = el("editor"); const it = routine.items[sel];
  if (!it) { ed.innerHTML = `<div class="empty">This warm-up is empty. Add a pattern, siren, breath set, drone or guided step, or add exercises from the Library.</div>`; return; }
  const t = it.type || "scale";
  let h = `<div class="spread" style="margin-bottom:10px"><h2>${esc(it.name)}</h2><span class="label">${sel + 1} of ${routine.items.length} · ${fmt(W.itemDur(it))}</span></div>
  <div class="fields">${fld("Name", inp("name", it.name))}${fld("Vowel or syllable", inp("vowel", it.vowel), "", "Shown big while you sing")}
    ${fld("Analysis block", selx("block", it.block || "warmup", BLOCKS.map(b => [b, b])), "", "How the coach measures it")}
    ${fld("Cue", `<textarea data-k="cue" rows="2">${esc(it.cue || "")}</textarea>`, "wide", "Read out before the exercise")}</div>`;
  if (t === "scale") {
    const P = W.parsePattern(it.pattern, it.scale || "maj", it.mode);
    const keyMode = it.keys && it.keys.length ? "keys" : "range";
    h += `<div class="section-h"><span class="label">Shape</span></div>
      <div class="chips" style="max-height:132px;overflow:auto">${L.EX.filter(e => (e.type || "scale") === "scale" && e.pattern).map(e => `<button class="chip" data-libpat="${e.key}" title="${esc(e.pattern)}" aria-pressed="${it.pattern === e.pattern}">${esc(e.name)}</button>`).join("")}</div>
      <div class="fields" style="margin-top:10px">
        ${fld("Write it as", selx("mode", it.mode || "degrees", [["degrees", "Scale degrees"], ["notes", "Note names"]]))}
        ${fld("Scale", selx("scale", it.scale || "maj", Object.entries(W.SCALES).map(([k, s]) => [k, s.name])))}
        ${fld(it.mode === "notes" ? "Notes (first note is the key)" : "Pattern in scale degrees", inp("pattern", it.pattern, "text", `class="pat" aria-invalid="${P.bad.length > 0}" spellcheck="false" autocapitalize="off"`), "wide",
          P.bad.length ? `Not understood: ${esc(P.bad.join(" "))}` : (it.mode === "notes" ? `Like <span class="mono">C4 E4 G4 C5</span>. Same suffixes as degrees.` : `<span class="mono">1–22</span>, <span class="mono">b3 #4</span>, <span class="mono">v5</span> octave down, <span class="mono">5:2</span> longer, <span class="mono">5.</span> staccato, <span class="mono">5&gt;</span> accent, <span class="mono">-</span> hold, <span class="mono">_</span> rest`))}
        ${fld("Syllables, one per note", inp("syllables", it.syllables), "wide", "Optional: mee meh mah moh moo. Cycles if shorter than the pattern.")}
      </div>
      <svg class="contour" id="contour" viewBox="0 0 600 96" preserveAspectRatio="none" aria-label="Shape of the pattern"></svg>
      <div class="section-h"><span class="label">Keys</span></div>
      <div class="seg" id="keyMode"><button data-v="range" aria-pressed="${keyMode === "range"}">A range of keys</button><button data-v="keys" aria-pressed="${keyMode === "keys"}">Specific keys</button></div>
      ${keyMode === "range" ? `<div class="fields" style="margin-top:8px">${fld("First key", inp("from", it.from), "", "e.g. F2, C#3")}${fld("Last key", inp("to", it.to))}
        ${fld("Step", selx("step", it.step || 1, [[1, "Half step"], [2, "Whole step"], [3, "Minor third"], [4, "Major third"], [5, "Fourth"]]))}${fld("Each key", selx("reps", it.reps || 1, [[1, "Once"], [2, "Twice"], [3, "Three times"], [4, "Four times"]]))}</div>
        <div class="row" style="margin-top:6px">${chk("back", it.back, "Come back to the first key")}<button class="btn small" id="fitBtn">Fit to my range</button><span class="mono faint small" id="rangeNote"></span></div>`
      : `<div class="fields" style="margin-top:8px">${fld("Keys, in order", `<input data-k="keystext" type="text" value="${esc((it.keys || []).join(" "))}" class="pat">`, "wide", "Space-separated: C3 D3 E3 F3 G3")}${fld("Each key", selx("reps", it.reps || 1, [[1, "Once"], [2, "Twice"], [3, "Three times"]]))}</div><span class="mono faint small" id="rangeNote"></span>`}
      <div class="section-h"><span class="label">Timing</span></div>
      <div class="fields">${fld("Tempo (bpm)", inp("bpm", it.bpm, "number", 'min="30" max="220" inputmode="numeric"'))}
        ${fld("Note length", selx("beat", it.beat || 1, [[0.25, "¼ beat"], [0.333, "⅓ beat (triplet)"], [0.5, "½ beat"], [0.75, "¾ beat"], [1, "1 beat"], [1.25, "1¼ beats"], [1.5, "1½ beats"], [2, "2 beats"], [3, "3 beats"], [4, "4 beats"]]))}
        ${fld("Hold last note", selx("hold", it.hold || 0, [[0, "No"], [1, "+1 beat"], [2, "+2 beats"], [4, "+4 beats"], [8, "+8 beats"]]))}
        ${fld("Gap between keys", selx("gap", it.gap ?? 2, [[0, "None"], [1, "1 beat"], [2, "2 beats"], [2.5, "2½ beats"], [3, "3 beats"], [4, "4 beats"], [6, "6 beats"]]))}</div>
      <div class="section-h"><span class="label">Piano</span></div>
      <div class="fields">${fld("Before each key", selx("lead", (it.lead === "chordnote" ? "chord" : it.lead) || "chord", [["chord", "Chord"], ["cadence", "I–V–I"], ["cadence4", "I–IV–V–I"], ["note", "First note only"], ["none", "Nothing"]]))}
        ${fld("Chord style", selx("chordStyle", it.chordStyle || "block", [["block", "Block"], ["broken", "Rolled"]]))}</div>
      <div class="row" style="margin-top:6px">${chk("bed", it.bed !== false, "Chord under the pattern")}${chk("bass", it.bass, "Bass root")}${chk("click", it.click, "Click while singing")}${chk("countIn", it.countIn, "Count in")}</div>`;
  } else if (t === "siren") {
    h += `<div class="section-h"><span class="label">Glide</span></div><div class="fields">
      ${fld("Lowest note", inp("low", it.low))}${fld("Highest note", inp("high", it.high))}
      ${fld("Shape", selx("shape", it.shape || "updown", [["updown", "Up and back"], ["up", "Up only"], ["down", "Down only"]]))}
      ${fld("Seconds per glide", inp("secs", it.secs, "number", 'min="2" max="40"'))}${fld("Glides", inp("count", it.count, "number", 'min="1" max="12"'))}${fld("Gap (s)", inp("gap", it.gap, "number", 'min="0" max="20"'))}</div>
      <div class="row" style="margin-top:6px">${chk("countIn", it.countIn !== false, "Four clicks before each glide")}</div><p class="faint small">The guide is a sine tone, because a piano cannot glide.</p>`;
  } else if (t === "breath") {
    h += `<div class="section-h"><span class="label">Counts</span></div><div class="fields">
      ${fld("Tempo (bpm)", inp("bpm", it.bpm, "number", 'min="40" max="160"'))}${fld("Breathe in (counts)", inp("inCounts", it.inCounts, "number", 'min="1" max="16"'))}
      ${fld("Out (counts)", inp("outCounts", it.outCounts, "number", 'min="4" max="96"'))}${fld("Breaths", inp("reps", it.reps, "number", 'min="1" max="10"'))}
      ${fld("Rest (counts)", inp("rest", it.rest, "number", 'min="0" max="32"'))}
      ${fld("Ladder", `<input data-k="laddertext" type="text" value="${esc((it.ladder || []).join(" "))}" class="pat">`, "", "Optional: 8 16 24 32")}</div>
      <div class="row" style="margin-top:6px">${chk("chugga", it.chugga, "Chugga chugga (sixteenths)")}</div>`;
  } else if (t === "drone") {
    h += `<div class="section-h"><span class="label">Drone</span></div><div class="fields">${fld("Note", inp("note", it.note))}${fld("Seconds", inp("secs", it.secs, "number", 'min="10" max="1200"'))}</div>
      <div class="row" style="margin-top:6px">${chk("fifth", it.fifth, "Add the fifth")}</div><p class="faint small">A sustained pad, so it never decays the way a piano does.</p>`;
  } else {
    h += `<div class="section-h"><span class="label">Guided</span></div><div class="fields">${fld("Seconds", inp("secs", it.secs, "number", 'min="5" max="1800"'))}
      ${fld("Steps, one per line", `<textarea data-k="stepstext" rows="5">${esc((it.steps || []).join("\n"))}</textarea>`, "wide", "Shown one at a time, spread across the time")}</div>`;
  }
  h += `<div class="row" style="margin-top:16px"><button class="btn primary" id="edPlay">▶ Hear it</button><button class="btn brass" id="edSaveLib">${it.mineId && ML.get("exercises", it.mineId) ? "Update in My library" : "Save to My library"}</button><button class="btn ghost" id="edStop">Stop</button></div>`;
  ed.innerHTML = h;
  $$("[data-k]", ed).forEach(c => {
    const k = c.dataset.k, ev = (c.tagName === "SELECT" || c.type === "checkbox") ? "change" : "input";
    c.addEventListener(ev, () => {
      let v = c.type === "checkbox" ? c.checked : c.value;
      if (NUMERIC.includes(k)) v = parseFloat(v) || 0;
      if (k === "keystext") it.keys = String(v).split(/[\s,]+/).filter(Boolean);
      else if (k === "laddertext") it.ladder = String(v).split(/[\s,]+/).map(Number).filter(x => x > 0);
      else if (k === "stepstext") it.steps = String(v).split("\n").map(s => s.trim()).filter(Boolean);
      else it[k] = v;
      saveR();
      if (c.tagName === "SELECT" || c.type === "checkbox") { renderItems(); renderEditor(); } else softRefresh();
    });
  });
  $$("[data-libpat]", ed).forEach(b => b.addEventListener("click", () => { const e = L.byKey[b.dataset.libpat]; it.pattern = e.pattern; it.mode = "degrees"; if (e.scale) it.scale = e.scale; if (!it.vowel) it.vowel = e.vowel; const r = myRange(); if (!(it.keys && it.keys.length)) W.fitToRange(it, r.lo, r.hi); saveR(); renderItems(); renderEditor(); }));
  const km = el("keyMode"); if (km) $$("[data-v]", km).forEach(b => b.addEventListener("click", () => {
    if (b.dataset.v === "keys") { it.keys = W.rootSeq(Object.assign({}, it, { keys: null, reps: 1, back: false })).slice(0, 8).map(W.noteAscii); }
    else { if (it.keys && it.keys.length) { it.from = it.keys[0]; it.to = it.keys[it.keys.length - 1]; } it.keys = null; }
    saveR(); renderItems(); renderEditor();
  }));
  const fb = el("fitBtn"); if (fb) fb.addEventListener("click", () => { const r = myRange(); W.fitToRange(it, r.lo, r.hi); saveR(); renderItems(); renderEditor(); });
  el("edPlay").addEventListener("click", () => previewItem(it));
  el("edSaveLib").addEventListener("click", () => { saveExercise(it); renderEditor(); });
  el("edStop").addEventListener("click", stopAll);
  drawContour(it); rangeNote(it);
}
function softRefresh() {
  const it = routine.items[sel], row = el("items").children[sel];
  if (row) row.querySelector(".sm").textContent = summary(it) + " · " + fmt(W.itemDur(it));
  const pat = $('[data-k="pattern"]', el("editor"));
  if (pat) pat.setAttribute("aria-invalid", W.parsePattern(it.pattern, it.scale, it.mode).bad.length > 0);
  drawContour(it); rangeNote(it);
  el("rTotal").textContent = routine.items.length + " exercises · " + fmt(routineDur(routine));
}
function rangeNote(it) {
  const n = el("rangeNote"); if (!n) return;
  const r = W.noteRange(it); if (!r) { n.textContent = "Check the keys"; return; }
  const me = myRange(), out = r.lo < me.lo || r.hi > me.hi;
  n.textContent = "You sing " + W.noteName(r.lo) + " to " + W.noteName(r.hi) + (out ? " · outside " + voiceLabel() : "");
  n.style.color = out ? "var(--rose)" : "";
}
function drawContour(it) {
  const svg = el("contour"); if (!svg) return;
  const { notes } = W.parsePattern(it.pattern, it.scale, it.mode); if (!notes.length) { svg.innerHTML = ""; return; }
  const total = notes.reduce((s, n) => s + n.beats, 0), sp = W.span(notes), rng = Math.max(4, sp.hi - sp.lo), Wd = 600, H = 96, pad = 12;
  let x = 0, out = "";
  const syl = String(it.syllables || "").trim().split(/\s+/).filter(Boolean); let si = 0;
  for (let s = sp.lo; s <= sp.hi; s++) { const y = H - pad - (s - sp.lo) / rng * (H - 2 * pad); if ([0, 2, 4, 5, 7, 9, 11].includes(((s % 12) + 12) % 12)) out += `<line x1="0" x2="${Wd}" y1="${y}" y2="${y}" stroke="var(--line)" vector-effect="non-scaling-stroke"/>`; }
  notes.forEach(n => {
    const w = n.beats / total * (Wd - 2 * pad);
    if (n.semi !== null) { const y = H - pad - (n.semi - sp.lo) / rng * (H - 2 * pad); out += `<rect x="${pad + x + 1}" y="${y - 4}" width="${Math.max(3, (n.stacc ? .45 : 1) * w - 2)}" height="8" rx="3" fill="${n.acc ? "var(--brass)" : "var(--teal)"}"/>`; si++; }
    x += w;
  });
  svg.innerHTML = out;
}
function libState() {
  const e = el("libState"); if (!e) return;
  e.textContent = ML.status === "synced" ? "Synced to Google Drive " + new Date(ML.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : ML.status === "syncing" ? "Syncing…" : ML.status === "reconnect" ? "Drive: tap Coach › Sync to reconnect" : ML.status === "error" ? "Sync failed: " + ML.detail : "On this device only";
}
function renderSaved() {
  const box = el("savedList"); if (!box) return;
  const mine = ML.list("routines");
  if (!mine.length) { box.innerHTML = `<span class="faint small">Warm-ups you save appear here with every exercise in place, on every device signed in to the same Google Drive.</span>`; return; }
  box.innerHTML = mine.map(r => `<div class="spread" style="border-bottom:1px solid var(--line);padding-bottom:6px"><div style="min-width:0"><b>${esc(r.name)}</b> ${r.from === "coach" ? `<span class="src ours">From coach</span>` : ""} <span class="mono faint small">${r.items.length} · ${fmt(routineDur(r))}</span></div>
    <div class="row"><button class="btn small" data-load="${esc(r.id)}">Load</button><button class="btn small primary" data-sing="${esc(r.id)}" aria-label="Sing ${esc(r.name)}">▶</button><button class="btn small ghost danger" data-del="${esc(r.id)}">Delete</button></div></div>`).join("");
  $$("[data-load]", box).forEach(b => b.addEventListener("click", () => { routine = JSON.parse(JSON.stringify(ML.get("routines", b.dataset.load))); sel = 0; saveR(); renderBuild(); toast("Loaded " + routine.name); }));
  $$("[data-sing]", box).forEach(b => b.addEventListener("click", () => { routine = JSON.parse(JSON.stringify(ML.get("routines", b.dataset.sing))); saveR(); showTab("practice"); startRoutine(0); }));
  $$("[data-del]", box).forEach(b => b.addEventListener("click", () => {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Delete for good?"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Delete"; }, 3000); return; }
    ML.remove("routines", b.dataset.del); if (routine.id === b.dataset.del) delete routine.id; renderSaved();
  }));
}
function saveRoutine(asNew) {
  if (asNew || !routine.id) { routine.id = W.uid(); if (asNew) routine.name = routine.name + " (copy)"; }
  const doc = JSON.parse(JSON.stringify(routine)); doc.shiftAt = voiceShift(); doc.voice = voiceLabel();
  ML.put("routines", doc); saveR(); renderBuild(); toast("Saved " + doc.name + (ML.provider ? " · syncing to Google Drive" : ""));
}
function saveExercise(it) {
  const doc = JSON.parse(JSON.stringify(it));
  const existed = !!(it.mineId && ML.get("exercises", it.mineId));
  const id = existed ? it.mineId : W.uid(); doc.id = id; delete doc.mineId; doc.src = "mine"; doc.shiftAt = voiceShift(); doc.cat = doc.cat || guessCat(doc);
  ML.put("exercises", doc); it.mineId = id; saveR();
  toast((existed ? "Updated " : "Added ") + doc.name + (existed ? " in" : " to") + " My library");
}
const slug = s => String(s || "routine").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "routine";
function downloadBlob(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

/* ================================================================ PLAYER */
const P = { mode: null, state: "idle", items: [], idx: 0, built: null, t0: 0, sched: 0, timer: null, raf: 0, log: null, sessT0: 0, pitchHist: [], cancelCue: null, pausePos: 0 };
const synth = window.speechSynthesis || null;
function speak(text) {
  return new Promise(resolve => {
    const words = text.split(/\s+/).filter(Boolean).length, dwell = Math.max(1.6, words * 0.36) * 1000 + 400;
    if (S.voiceMode === "off" || !text.trim()) { setTimeout(resolve, 700); return; }
    if (!synth) { setTimeout(resolve, Math.min(dwell, 2600)); return; }
    let done = false; const fin = () => { if (!done) { done = true; resolve(); } };
    try {
      synth.cancel();
      const parts = text.match(/[^.!?]+[.!?]*/g) || [text];   // Chrome drops utterances over ~15 s
      const en = synth.getVoices().filter(v => /^en/i.test(v.lang));
      const pick = en.find(v => /natural|neural|premium|enhanced|google|samantha|daniel|aria|guy/i.test(v.name)) || en[0];
      parts.forEach((p, i) => { const u = new SpeechSynthesisUtterance(p.trim()); u.rate = 1.03; if (pick) u.voice = pick; if (i === parts.length - 1) { u.onend = () => setTimeout(fin, 250); u.onerror = fin; } synth.speak(u); });
    } catch (e) { fin(); }
    setTimeout(fin, dwell + 6000);   // an utterance that never reports its end must not stall the session
  });
}
let wake = null;
async function holdWake() { try { wake = await navigator.wakeLock?.request("screen"); } catch (e) {} }
function releaseWake() { try { wake?.release(); } catch (e) {} wake = null; }
/* The scheduler ticks from a Worker. Main-thread timers are throttled in background tabs
   and stalled by any heavy drawing; a worker's timer keeps a steady beat either way. */
let ticker = null;
function setTick(on) {
  if (!ticker) {
    try {
      ticker = new Worker(URL.createObjectURL(new Blob(["let t=null;onmessage=e=>{clearInterval(t);t=null;if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}"], { type: "text/javascript" })));
      ticker.onmessage = () => tick();
    } catch (e) { ticker = { postMessage(ms) { clearInterval(this.t); this.t = ms > 0 ? setInterval(tick, ms) : null; } }; }
  }
  ticker.postMessage(on ? 25 : 0); P.timer = on;
}
function stopAll() {
  setTick(false); cancelAnimationFrame(P.raf);
  if (synth) try { synth.cancel(); } catch (e) {}
  if (P.cancelCue) P.cancelCue();
  if (A.ctx()) A.silence();
  P.mode = null; P.state = "idle"; releaseWake();
  const pb = el("playBtn"); if (pb) { pb.textContent = "Start"; ["backBtn", "skipBtn", "stopBtn"].forEach(b => el(b) && (el(b).disabled = true)); }
}
async function previewItem(it) {
  if (!A.ready && S.instrument === "piano") { toast("The piano is still loading"); return; }
  stopAll(); A.ensure(); await A.ctx().resume(); A.mix(S.mix);
  P.mode = "preview"; P.items = [it]; P.idx = 0; startItem(false);
}
async function startRoutine(from) {
  if (!A.ready && S.instrument === "piano") { toast("The piano is still loading"); return; }
  if (!routine.items.length) { toast("Add an exercise first"); return; }
  stopAll(); A.ensure(); const ctx = A.ctx(); await ctx.resume(); A.mix(S.mix); holdWake();
  if (synth && S.voiceMode !== "off") try { synth.speak(new SpeechSynthesisUtterance(" ")); } catch (e) {}
  P.items = JSON.parse(JSON.stringify(routine.items)); P.idx = from || 0; P.mode = "routine"; P.state = "playing"; P.pitchHist = [];
  if (S.restrike) P.items.forEach(it => { if (it.bedRestrike === undefined) it.bedRestrike = true; });
  renderPractice();
  el("postPanel").hidden = true;
  let recStart = null, recErr = null;
  if (S.outId && A.canPickOutput()) try { await A.setOutput(S.outId); } catch (e) {}
  if (S.record) {
    try { await A.mic.open(S.micId || ""); recStart = await A.mic.startRecording(); } catch (e) { recErr = e; toast("Not recording: " + (e.message || e.name)); }
    A.mic.onEnded = () => { toast("The microphone stopped. What was recorded so far is kept."); if (P.log) P.log.events.push({ t: rel(A.ctx().currentTime), e: "mic-ended", i: P.idx }); };
  } else if (S.lane) { try { await A.mic.open(S.micId || ""); } catch (e) {} }
  P.sessT0 = ctx.currentTime + 0.4;
  P.log = { v: 2, app: "warmup-bench/web-1", id: "s" + new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12) + W.uid().slice(0, 3),
    startedAt: new Date().toISOString(), routineName: routine.name, routineSource: routine.source || "", voice: voiceLabel(), routine: P.items,
    clapAt: S.clap ? 1.8 : null, events: [], melody: [], lead: [], chord: [], startIndex: P.idx,
    audio: { sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency || 0, outputLatency: ctx.outputLatency || 0 },
    recording: recStart !== null ? { mime: A.mic.mime, recStartCtx: +recStart.toFixed(4), sessT0Ctx: +P.sessT0.toFixed(4),
      // seconds of recording before the app's t = 0, BEFORE the clap refines it
      offsetS: +(P.sessT0 - recStart + (ctx.outputLatency || 0)).toFixed(4) } : null,
    recordError: recErr ? String(recErr.message || recErr) : null, mic: A.mic.info(), micAutoPicked: A.mic.autoPicked || null, delayMs: S.delayMs ?? null };
  el("playBtn").textContent = "Pause"; ["backBtn", "skipBtn", "stopBtn"].forEach(b => el(b).disabled = false);
  if (S.clap) {
    // THE SYNC CLAP. Four clicks; he claps on the fourth. Its app time is logged; its time in
    // the take is found by the analysis. The difference is the clock offset to a few ms.
    setNow("Sync", "Clap on the fourth click", "", S.record ? "One sharp clap on the fourth click lines your recording up exactly." : "");
    for (let b = 0; b < 4; b++) A.click(P.sessT0 + b * 0.6, true);
    P.log.events.push({ t: 0, e: "sync" });
    await waitUntil(P.sessT0 + 1.8 + 1.4);
  } else { P.log.events.push({ t: 0, e: "sync" }); await waitUntil(P.sessT0); }
  if (P.mode !== "routine") return;
  startItem(true);
}
function waitUntil(t) { return new Promise(r => { const f = () => { if (!A.ctx() || A.ctx().currentTime >= t || P.mode === null) r(); else setTimeout(f, 40); }; f(); }); }
const rel = t => +(t - P.sessT0).toFixed(3);
function setNow(pos, name, vowel, cue) { const s = (id, v) => { const e = el(id); if (e) e.textContent = v; }; s("nowPos", pos); s("nowName", name); s("nowVowel", vowel); s("nowCue", cue); }
async function startItem(withCue) {
  const it = P.items[P.idx]; if (!it) { finishRoutine(); return; }
  const ctx = A.ctx();
  setNow(P.mode === "preview" ? "Preview" : `Exercise ${P.idx + 1} of ${P.items.length}`, it.name, it.vowel || "", it.cue || "");
  renderQueue();
  P.built = W.buildEvents(it); P.sched = 0;
  if (withCue) {
    const text = S.voiceMode === "off" ? "" : [it.name, it.vowel, S.voiceMode === "full" ? it.cue : ""].filter(Boolean).join(". ");
    P.log && P.log.events.push({ t: rel(ctx.currentTime), e: "cue", i: P.idx });
    let cancelled = false; P.cancelCue = () => { cancelled = true; };
    await speak(text); P.cancelCue = null;
    if (cancelled || P.mode === null) return;
  }
  P.t0 = ctx.currentTime + 0.25;
  if (P.log && P.mode === "routine") P.log.events.push({ t: rel(P.t0), e: "start", i: P.idx, block: it.block, name: it.name, vowel: it.vowel || "", type: it.type || "scale" });
  P.state = "playing";
  setTick(true); tick(); loop();
}
function logNote(kind, at, e) { if (P.log && P.mode === "routine") P.log[kind].push(rel(at), +e.dur.toFixed(3), e.m); }
function tick() {
  if (P.state !== "playing" || !P.built) return;
  // Schedule 1.5 s ahead. Background tabs and locked phones throttle timers to about one
  // tick a second, and with a short horizon notes arrived late and were dropped: a test run
  // logged 2 of 10 sung notes. Anything already scheduled is still cut instantly by
  // A.silence() on pause or skip, so the long horizon costs nothing.
  const ctx = A.ctx(), horizon = ctx.currentTime + 1.5, ev = P.built.ev;
  // FELL BEHIND? Slide the rest of the exercise later instead of firing the backlog at once.
  // Playing every late note "now" is what turned a scale into a chord. The log keeps the
  // real times, so the analysis still lines up with what he actually heard.
  const first = ev[P.sched];
  if (first && P.t0 + first.t < ctx.currentTime + 0.02) {
    const slip = ctx.currentTime + 0.06 - (P.t0 + first.t);
    P.t0 += slip;
    if (P.log && P.mode === "routine" && slip > 0.05) P.log.events.push({ t: rel(ctx.currentTime), e: "slip", i: P.idx, s: +slip.toFixed(3) });
  }
  while (P.sched < ev.length && P.t0 + ev[P.sched].t < horizon) {
    const e = ev[P.sched++];
    const at = Math.max(P.t0 + e.t, ctx.currentTime + 0.005);
    if (e.k === "note") { A.note(e.m, at, e.dur, { layer: 96, bus: "piano", vel: e.acc ? 1.0 : 0.88 }); logNote("melody", at, e); }
    else if (e.k === "lead") { A.note(e.m, at, e.dur, { layer: 96, bus: "piano", vel: 0.62 }); logNote("lead", at, e); }
    else if (e.k === "chord") { A.note(e.m, at, e.dur, { layer: 58, bus: "chord", vel: 0.75 }); logNote("chord", at, e); }
    else if (e.k === "bed") { A.note(e.m, at, e.dur, { layer: 58, bus: "chord", vel: 0.48 }); logNote("chord", at, e); }
    else if (e.k === "click") A.click(at, e.hi);
    else if (e.k === "glide") { A.glide(at, e.dur, e.lo, e.hi, e.shape); P.log && P.mode === "routine" && P.log.events.push({ t: rel(at), e: "glide", i: P.idx, dur: e.dur, lo: e.lo, hi: e.hi, shape: e.shape }); }
    else if (e.k === "drone") { A.drone(at, e.dur, e.m, e.fifth); P.log && P.mode === "routine" && P.log.events.push({ t: rel(at), e: "drone", i: P.idx, dur: e.dur, m: e.m }); }
    else if (e.k === "swell") A.swell(at, e.dur);
    else if (e.k === "chime") A.chime(at);
  }
  if (ctx.currentTime > P.t0 + P.built.dur) {
    setTick(false);
    if (P.log && P.mode === "routine") P.log.events.push({ t: rel(ctx.currentTime), e: "end", i: P.idx });
    if (P.mode === "routine") { P.idx++; const gap = (routine.gapBetween ?? 3); setTimeout(() => P.mode === "routine" && P.state === "playing" && startItem(true), Math.max(0, gap - 2.2) * 1000); }
    else stopAll();
  }
}
function pauseResume() {
  if (P.mode !== "routine") return;
  const ctx = A.ctx();
  if (P.state === "playing") {
    // Pause restarts the CURRENT KEY on resume, as vocalrangetester does. The audio clock
    // keeps running, so the log stays in real time and lines up with the recording.
    P.pausePos = ctx.currentTime - P.t0; P.state = "paused"; A.silence(); if (synth) try { synth.cancel(); } catch (e) {}
    P.log && P.log.events.push({ t: rel(ctx.currentTime), e: "pause", i: P.idx });
    el("playBtn").textContent = "Resume";
  } else if (P.state === "paused") {
    const keys = P.built.keys; let k = keys[0] ? keys[0].t : 0; for (const x of keys) if (x.t <= P.pausePos) k = x.t;
    P.t0 = ctx.currentTime + 0.4 - k; P.sched = P.built.ev.findIndex(e => e.t >= k); if (P.sched < 0) P.sched = P.built.ev.length;
    P.log && P.log.events.push({ t: rel(ctx.currentTime), e: "resume", i: P.idx, from: +k.toFixed(3) });
    P.state = "playing"; el("playBtn").textContent = "Pause";
    setTick(true);
  }
}
function jump(d, to) {
  if (P.mode !== "routine") return;
  const target = to != null ? to : Math.max(0, Math.min(P.items.length, P.idx + d));
  setTick(false); A.silence(); if (synth) try { synth.cancel(); } catch (e) {}
  if (P.cancelCue) P.cancelCue();
  P.log && P.log.events.push({ t: rel(A.ctx().currentTime), e: d > 0 ? "skip" : "back", i: P.idx });
  P.idx = target; P.state = "playing"; el("playBtn").textContent = "Pause"; startItem(true);
}
async function finishRoutine(stopped) {
  const log = P.log, ctx = A.ctx();
  if (log) { const t = rel(ctx.currentTime); log.events.push({ t, e: stopped ? "stop" : "finish", i: P.idx }); log.durationS = t; }
  const wasRec = !!(log && log.recording);
  stopAll();
  let blob = null; if (wasRec) blob = await A.mic.stopRecording();
  setNow(stopped ? "Stopped" : "Done", stopped ? "Stopped early" : "Routine finished", "", "Rate it below and save the session.");
  if (log && log.events.some(e => e.e === "start")) renderPost(log, blob);
}
/* -------- live view: pitch lane + keyboard */
function loop() {
  cancelAnimationFrame(P.raf);
  let lastPitch = 0;
  const f = (now) => {
    if (P.mode === null) return;
    const ctx = A.ctx();
    if (P.built && ctx) {
      const pos = ctx.currentTime - P.t0, ev = P.built.ev, it = P.items[P.idx];
      let cur = null; for (const e of ev) { if (e.t > pos) break; if (e.k === "note" && pos < e.t + e.dur) cur = e; }
      let key = null; for (const k of P.built.keys) { if (k.t <= pos) key = k; else break; }
      const lit = [];
      if (cur) { el("nowNote").textContent = W.noteName(cur.m); el("nowSyl").textContent = cur.syl || ""; lit.push(cur.m); }
      else if ((it?.type) === "siren") {
        const g = ev.find(e => e.k === "glide" && pos >= e.t && pos < e.t + e.dur);
        if (g) { const m = glideAt(g, pos); el("nowNote").textContent = W.noteName(Math.round(m)); lit.push(Math.round(m)); } else el("nowNote").textContent = "·";
      } else if ((it?.type) === "drone") { el("nowNote").textContent = W.noteName(W.parseNote(it.note)); }
      if (key) {
        if (key.root !== null && (it.type || "scale") === "scale") { el("nowKey").textContent = `Key ${W.noteName(key.root)} · ${key.ki + 1} of ${key.of}`; W.triadOf(key.root, it.scale).forEach(m => lit.push(-m - 1)); }
        else el("nowKey").textContent = key.label || "";
        if (key.count) { const into = pos - key.count.t, c = Math.floor(into / key.count.spb); el("nowNote").textContent = c < key.count.inC ? "In " + (c + 1) : (c - key.count.inC < key.count.outC ? String(c - key.count.inC + 1) : "Rest"); }
        if ((it?.type) === "timer" && key.label) { el("nowCue").textContent = key.label; el("nowNote").textContent = fmt(Math.max(0, P.built.dur - pos)); }
      }
      // pitch, 20 times a second, and only when something shows it
      if (A.mic.an && S.lane && now - lastPitch > 50) {
        lastPitch = now; const p = A.mic.pitch();
        const lv = el("micMeter"); if (lv && p) { lv.style.width = Math.min(100, p.rms * 500) + "%"; lv.parentElement.classList.toggle("hot", p.rms > 0.3); }
        if (p && p.midi && p.clarity > 0.75) {
          /* Where was this sung, on the piano's timeline? Detected now, but the audio is
             p.age old, it took the input latency to arrive, and the note he was singing
             against reached his ears outLat after it was scheduled. Measured delay wins. */
          const outLat = (ctx.baseLatency || 0) + (ctx.outputLatency || 0), inLat = ((A.mic.info() || {}).latency || 0.01);
          const back = S.delayMs != null ? S.delayMs / 1000 + p.age : p.age + inLat + outLat;
          const ts = ctx.currentTime - back;
          P.pitchHist.push({ t: ts, m: p.midi });
          let tgt = null; const posV = ts - P.t0; for (const e of ev) { if (e.t > posV) break; if (e.k === "note" && posV < e.t + e.dur) tgt = e; }
          const target = tgt ? tgt.m : null;
          const c = el("nowCents");
          if (c) { if (target !== null) { const d = Math.round((p.midi - target) * 100); c.textContent = (Math.abs(d) <= 15 ? "● on pitch " : d > 0 ? "▲ " : "▼ ") + (d > 0 ? "+" : "") + d + "¢"; c.style.color = Math.abs(d) <= 15 ? "var(--sage)" : Math.abs(d) <= 35 ? "var(--brass)" : "var(--rose)"; } else { c.textContent = "you: " + W.noteName(Math.round(p.midi)); c.style.color = ""; } }
        }
        if (P.pitchHist.length > 600) P.pitchHist.splice(0, 200);
      }
      if (now - (loop.lastDraw || 0) > 33) { loop.lastDraw = now; drawLane(pos); }
      drawKbd(lit);
      const d = P.built.dur; el("bItem").style.width = Math.max(0, Math.min(100, pos / d * 100)) + "%"; el("tItem").textContent = fmt(Math.max(0, pos)) + " / " + fmt(d);
      if (P.mode === "routine") { const before = P.items.slice(0, P.idx).reduce((s, x) => s + W.itemDur(x), 0), all = P.items.reduce((s, x) => s + W.itemDur(x), 0); el("bAll").style.width = Math.min(100, (before + Math.max(0, pos)) / all * 100) + "%"; el("tAll").textContent = fmt(before + Math.max(0, pos)) + " / " + fmt(all); }
    }
    P.raf = requestAnimationFrame(f);
  };
  P.raf = requestAnimationFrame(f);
}
function glideAt(g, pos) { const ph = (pos - g.t) / g.dur; if (g.shape === "up") return g.lo + (g.hi - g.lo) * ph; if (g.shape === "down") return g.hi - (g.hi - g.lo) * ph; return ph < .5 ? g.lo + (g.hi - g.lo) * ph * 2 : g.hi - (g.hi - g.lo) * (ph - .5) * 2; }
function laneRange() {
  let lo = 999, hi = -1; (P.items.length ? P.items : routine.items).forEach(it => { const r = W.noteRange(it); if (r) { lo = Math.min(lo, r.lo); hi = Math.max(hi, r.hi); } });
  if (hi < 0) { const r = myRange(); lo = r.lo; hi = r.hi; } return { lo: lo - 2, hi: hi + 2 };
}
function drawLane(pos) {
  const cv = el("lane"); if (!cv || !S.lane) return;
  const dpr = window.devicePixelRatio || 1, Wd = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Wd * dpr) { cv.width = Wd * dpr; cv.height = H * dpr; }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, Wd, H);
  if (!drawLane.col) { const cs = getComputedStyle(document.documentElement); drawLane.col = {}; ["--line", "--text-3", "--target", "--sung"].forEach(k => drawLane.col[k] = cs.getPropertyValue(k).trim()); }
  const col = n => drawLane.col[n];
  const { lo, hi } = laneRange(), past = 3, ahead = 5, x = t => (t - pos + past) / (past + ahead) * Wd, y = m => H - 6 - (m - lo) / (hi - lo) * (H - 12);
  g.strokeStyle = col("--line"); g.lineWidth = 1; g.font = "10px IBM Plex Mono, monospace"; g.fillStyle = col("--text-3");
  for (let m = Math.ceil(lo); m <= hi; m++) if (m % 12 === 0) { g.beginPath(); g.moveTo(0, y(m)); g.lineTo(Wd, y(m)); g.stroke(); g.fillText(W.noteName(m), 4, y(m) - 2); }
  g.fillStyle = col("--target");
  for (const e of P.built.ev) {
    if (e.t > pos + ahead) break;
    if (e.k === "note" && e.t + e.dur > pos - past) { const x0 = x(e.t), x1 = x(e.t + e.dur); g.globalAlpha = e.t <= pos && pos < e.t + e.dur ? 1 : 0.55; g.fillRect(x0, y(e.m) - 3, Math.max(2, x1 - x0 - 1), 6); }
    if (e.k === "glide" && e.t + e.dur > pos - past) { g.globalAlpha = .5; g.strokeStyle = col("--target"); g.lineWidth = 3; g.beginPath(); for (let k = 0; k <= 40; k++) { const tt = e.t + e.dur * k / 40, xx = x(tt), yy = y(glideAt(e, tt)); k ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke(); }
  }
  g.globalAlpha = 1;
  g.strokeStyle = col("--text-3"); g.lineWidth = 1; g.beginPath(); g.moveTo(x(pos), 0); g.lineTo(x(pos), H); g.stroke();
  const ctxT = A.ctx().currentTime; g.fillStyle = col("--sung");
  for (const p of P.pitchHist) { const tt = p.t - P.t0; if (tt < pos - past) continue; const yy = y(p.m); if (yy < 0 || yy > H) continue; g.beginPath(); g.arc(x(tt), yy, 2.4, 0, 7); g.fill(); }
}
function drawKbd(lit) {
  const svg = el("kbd"); if (!svg) return;
  let { lo, hi } = laneRange(); lo = Math.floor(lo / 12) * 12; hi = Math.ceil((hi + 1) / 12) * 12;
  // Rebuilding this SVG sixty times a second was the other half of the lag. Only redraw
  // when the lit keys or the range actually change.
  const sig = lo + ":" + hi + ":" + lit.slice().sort((a, b) => a - b).join(",");
  if (svg.dataset.sig === sig) return; svg.dataset.sig = sig;
  const whites = []; for (let m = lo; m < hi; m++) if ([0, 2, 4, 5, 7, 9, 11].includes(m % 12)) whites.push(m);
  const Wd = 1000, H = 74, w = Wd / whites.length, mel = new Set(lit.filter(x => x >= 0)), chd = new Set(lit.filter(x => x < 0).map(x => -x - 1));
  const me = myRange(); let s = "";
  whites.forEach((m, i) => { const on = mel.has(m), ch = chd.has(m), inR = m >= me.lo && m <= me.hi;
    s += `<rect x="${i * w + .5}" y=".5" width="${w - 1}" height="${H - 1}" rx="2" fill="${on ? "var(--key-lit)" : ch ? "var(--key-zone)" : "var(--key-white)"}" stroke="var(--line)"/>`;
    if (!inR) s += `<rect x="${i * w + .5}" y="${H - 4}" width="${w - 1}" height="3" fill="var(--line)"/>`;
    if (m % 12 === 0) s += `<text x="${i * w + w / 2}" y="${H - 8}" text-anchor="middle" font-size="10" font-family="IBM Plex Mono, monospace" fill="var(--text-3)">C${m / 12 - 1}</text>`; });
  whites.forEach((m, i) => { if ([0, 2, 5, 7, 9].includes(m % 12) && m + 1 < hi) { const b = m + 1, on = mel.has(b), ch = chd.has(b); s += `<rect x="${(i + 1) * w - w * .32}" y=".5" width="${w * .64}" height="${H * .6}" rx="2" fill="${on ? "var(--key-lit)" : ch ? "var(--text-3)" : "var(--key-black)"}"/>`; } });
  svg.setAttribute("viewBox", `0 0 ${Wd} ${H}`); svg.innerHTML = s;
}
function renderQueue() {
  const q = el("queue"); if (!q) return; const items = P.mode === "routine" ? P.items : routine.items;
  q.innerHTML = items.map((it, i) => `<button class="qi ${P.mode === "routine" && i < P.idx ? "done" : ""} ${P.mode === "routine" && i === P.idx ? "cur" : ""}" data-q="${i}">${i + 1}. ${esc(it.name)}${it.vowel ? " · " + esc(it.vowel) : ""}</button>`).join("");
  $$("[data-q]", q).forEach(b => b.addEventListener("click", () => { if (P.mode === "routine") jump(0, +b.dataset.q); else { showTab("practice"); startRoutine(+b.dataset.q); } }));
}
function renderPractice() {
  const v = el("view-practice");
  if (v.dataset.built === "1") { renderQueue(); drawKbd([]); return; }
  v.dataset.built = "1";
  v.innerHTML = `<div class="stage">
      <div class="now"><div style="min-width:0"><div class="label" id="nowPos">Ready</div><div class="ex" id="nowName">${esc(routine.name)}</div><div class="vowel" id="nowVowel"></div><div class="cue" id="nowCue">${routine.items.length} exercises · ${fmt(routineDur(routine))}</div></div>
        <div class="right"><div class="notebig" id="nowNote">·</div><div class="syl" id="nowSyl"></div><div class="keyinfo" id="nowKey"></div><div class="cents" id="nowCents"></div></div></div>
      <canvas class="lane" id="lane" aria-label="Pitch lane: the notes to sing, and your voice"></canvas>
      <div class="kbd"><svg id="kbd" role="img" aria-label="Keyboard"></svg></div>
      <div class="stack" style="gap:5px"><div class="spread"><span class="label">This exercise</span><span class="mono faint small" id="tItem"></span></div><div class="bar"><i id="bItem"></i></div>
        <div class="spread"><span class="label">Warm-up</span><span class="mono faint small" id="tAll"></span></div><div class="bar total"><i id="bAll"></i></div></div>
      <div class="spread"><span class="label">Spoken cues</span><div class="seg" id="sVoice">${[["off", "Voice off"], ["short", "Short"], ["full", "Full cue"]].map(([k, l]) => `<button data-v="${k}" aria-pressed="${S.voiceMode === k}">${l}</button>`).join("")}</div></div>
      <div class="transport"><button class="btn big primary" id="playBtn">Start</button><button class="btn" id="backBtn" disabled>◂◂ Back</button><button class="btn" id="skipBtn" disabled>Next ▸▸</button><button class="btn ghost" id="stopBtn" disabled>Stop</button>
        <span class="row" style="margin-left:auto"><span class="label">Mic</span><span class="meter"><i id="micMeter"></i></span></span></div>
      <div class="queue" id="queue"></div></div>
    <div class="grid2">
      <div class="panel stack"><div class="spread"><h3>Record and send to the coach</h3></div>
        <label class="check"><input type="checkbox" id="sRec" ${S.record ? "checked" : ""}> Record my voice during the warm-up</label>
        <label class="check"><input type="checkbox" id="sClap" ${S.clap ? "checked" : ""}> Extra sync: four clicks, clap on the fourth (not needed)</label>
        <label class="check"><input type="checkbox" id="sLane" ${S.lane ? "checked" : ""}> Show my pitch on the lane</label>
        <p class="faint small">Wear earbuds so the piano stays out of your recording. The take stays on this device until you send it.</p></div>
      <div class="panel stack"><h3>Sound</h3>
        <div class="seg" id="sInst">${[["piano", A.ready ? "Pianoteq" : "Piano"], ["synth", "Synth piano"], ["sine", "Soft sine"], ["triangle", "Bright triangle"]].map(([k, l]) => `<button data-v="${k}" aria-pressed="${S.instrument === k}">${l}</button>`).join("")}</div>
        <div class="mixer">${[["piano", "Piano"], ["chord", "Chord"], ["click", "Click"], ["guide", "Siren guide"], ["drone", "Drone"], ["room", "Room"]].map(([k, l]) => `<label>${l}<input type="range" data-mix="${k}" min="0" max="${k === "room" ? 1 : 1.4}" step="0.01" value="${S.mix[k]}"></label>`).join("")}</div>
        <label class="check"><input type="checkbox" id="sRestrike" ${S.restrike ? "checked" : ""}> Re-strike the chord every bar on long patterns</label></div></div>
    <div class="grid2">
      <div class="panel stack" id="devPanel"><div class="spread"><h3>Microphone and speakers</h3><button class="btn small" id="devTest">Test mic</button></div><div id="devBody" class="stack"><span class="faint small">Loading devices…</span></div></div>
      <div class="panel stack"><h3>Free take</h3><p class="muted small">Record anything outside a routine, a song, a phrase, an exercise you made up, and send it for analysis like any session.</p>
        <div class="fields"><div class="field wide"><label for="ftLabel">What is it?</label><input id="ftLabel" placeholder="Chorus of my song, octave slides on ng…"></div>
          <div class="field"><label for="ftKind">Analyse as</label><select id="ftKind"><option value="song">Singing (song or phrase)</option><option value="warmup">An exercise</option><option value="sirens">Sirens or slides</option><option value="spoken">Speaking</option></select></div>
          <div class="field"><label for="ftDrone">Drone under it</label><select id="ftDrone"><option value="">None</option>${["C3", "D3", "E3", "F3", "G3", "A3", "Bb3", "C4", "D4", "E4"].map(n => `<option>${n}</option>`).join("")}</select></div></div>
        <div class="row"><button class="btn brass" id="ftGo">● Record</button><span class="mono small" id="ftTime"></span><span class="meter"><i id="ftMeter"></i></span></div></div></div>
    <div class="panel stack" id="postPanel" hidden></div>`;
  el("playBtn").addEventListener("click", () => { if (P.mode === "routine") pauseResume(); else startRoutine(0); });
  el("skipBtn").addEventListener("click", () => jump(1)); el("backBtn").addEventListener("click", () => jump(-1));
  el("stopBtn").addEventListener("click", () => { if (P.mode === "routine") finishRoutine(true); else stopAll(); });
  const bind = (id, k) => el(id).addEventListener("change", e => { S[k] = e.target.checked; saveS(); });
  bind("sRec", "record"); bind("sClap", "clap"); bind("sLane", "lane"); bind("sRestrike", "restrike");
  $$("#sVoice [data-v]").forEach(b => b.addEventListener("click", () => { S.voiceMode = b.dataset.v; saveS(); $$("#sVoice [data-v]").forEach(x => x.setAttribute("aria-pressed", x === b)); if (S.voiceMode === "off" && synth) try { synth.cancel(); } catch (e) {} toast(S.voiceMode === "off" ? "Cues off: the text still shows on screen" : S.voiceMode === "short" ? "Short cues: name and vowel" : "Full cues"); }));
  $$("#sInst [data-v]").forEach(b => b.addEventListener("click", () => { S.instrument = b.dataset.v; A.instrument = S.instrument; saveS(); $$("#sInst [data-v]").forEach(x => x.setAttribute("aria-pressed", x === b)); }));
  $$("[data-mix]", v).forEach(r => r.addEventListener("input", () => { S.mix[r.dataset.mix] = +r.value; saveS(); A.mix(S.mix); }));
  document.addEventListener("keydown", e => { if (e.code === "Space" && P.mode === "routine" && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); pauseResume(); } });
  el("devTest").addEventListener("click", testMic);
  el("ftGo").addEventListener("click", freeTake);
  renderDevices();
  renderQueue(); drawKbd([]);
}
/* ---------------- devices */
async function renderDevices() {
  const body = el("devBody"); if (!body) return;
  let d = { inputs: [], outputs: [] }; try { d = await A.devices(); } catch (e) {}
  const named = d.inputs.some(x => x.label);
  const info = A.mic.info();
  const flag = (k, label) => info && info[k] !== undefined ? `<span class="pill ${info[k] ? "warn" : "ok"}"><span class="dot"></span>${label} ${info[k] ? "on" : "off"}</span>` : "";
  body.innerHTML = `
    <div class="field"><label for="devMic">Microphone</label><select id="devMic">${d.inputs.length ? d.inputs.map((x, i) => `<option value="${esc(x.deviceId)}" ${x.deviceId === (S.micId || "default") || (!S.micId && i === 0) ? "selected" : ""}>${esc(x.label || "Microphone " + (i + 1))}</option>`).join("") : `<option value="">System default</option>`}</select>
      ${named ? "" : `<span class="hint">Names appear once the mic is allowed. Press Test mic.</span>`}</div>
    <div class="field"><label for="devOut">Speakers or headphones</label>${A.canPickOutput() && d.outputs.length
      ? `<select id="devOut">${d.outputs.map((x, i) => `<option value="${esc(x.deviceId)}" ${x.deviceId === (S.outId || "default") ? "selected" : ""}>${esc(x.label || "Output " + (i + 1))}</option>`).join("")}</select>`
      : `<span class="muted small">${esc(await A.outputLabel())}. This browser only plays to the system output, so change it in your sound settings.</span>`}</div>
    <div class="row"><button class="btn small" id="devDelay">Measure delay</button><span class="small muted" id="devDelayOut">${S.delayMs != null ? "Round trip " + Math.round(S.delayMs) + " ms (measured)" : "Not measured yet: the lane uses the browser's estimate"}</span></div>
    ${A.mic.autoPicked ? `<span class="faint small">Picked <b>${esc(A.mic.autoPicked)}</b> over the system default, which was a virtual device.</span>` : ""}
    ${info ? `<div class="stack" style="gap:6px"><span class="small">In use: <b>${esc(info.label)}</b> · <span class="mono">${info.sampleRate ? (info.sampleRate / 1000).toFixed(1) + " kHz" : ""}${info.channelCount ? " · " + info.channelCount + " ch" : ""}</span></span>
      <div class="row">${flag("autoGainControl", "Auto-gain")}${flag("echoCancellation", "Echo cancel")}${flag("noiseSuppression", "Noise suppression")}</div>
      ${info.autoGainControl || info.echoCancellation || info.noiseSuppression ? `<div class="callout small">The browser kept some voice processing on despite the request. Pitch is fine, but level and breathiness readings will not be comparable.</div>` : ""}</div>` : ""}`;
  const dm = el("devMic"); dm.addEventListener("change", async () => {
    if (A.mic.recording()) { toast("Finish the recording before switching microphones."); renderDevices(); return; }
    S.micId = dm.value; saveS(); if (A.mic.stream) { try { await A.mic.open(S.micId); } catch (e) { toast("Microphone: " + e.message); } } renderDevices(); });
  el("devDelay").addEventListener("click", async () => {
    const o = el("devDelayOut"); o.textContent = "Listening… (with earbuds, hold one to the mic)";
    try { const r = await A.measureDelay(); S.delayMs = Math.round(r.delay * 1000); saveS(); o.textContent = "Round trip " + S.delayMs + " ms (" + r.heard + " of 5 clicks, spread " + Math.round(r.spread * 1000) + " ms)"; }
    catch (e) { o.textContent = e.message; }
  });
  const dout = el("devOut"); if (dout) dout.addEventListener("change", async () => { S.outId = dout.value; saveS(); try { await A.setOutput(S.outId); toast("Playing through " + dout.options[dout.selectedIndex].text); } catch (e) { toast(e.message); } });
}
let micTest = null;
async function testMic() {
  if (micTest) { micTest = null; el("devTest").textContent = "Test mic"; return; }
  try { await A.mic.open(S.micId || ""); await A.ctx().resume(); } catch (e) { toast("Microphone: " + (e.message || e.name)); return; }
  await renderDevices();
  el("devTest").textContent = "Stop test"; micTest = { until: performance.now() + 15000 };
  const box = document.createElement("div"); box.className = "row"; box.innerHTML = `<span class="meter" style="max-width:none;flex:1"><i id="devMeter"></i></span><span class="mono" id="devNote">·</span>`;
  el("devBody").appendChild(box);
  const f = t => {
    if (!micTest || t > micTest.until) { micTest = null; const b = el("devTest"); if (b) b.textContent = "Test mic"; return; }
    const p = A.mic.pitch(); const m = el("devMeter"); if (m && p) m.style.width = Math.min(100, p.rms * 500) + "%";
    if (p && p.midi && p.clarity > 0.8) el("devNote").textContent = W.noteName(Math.round(p.midi));
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}
/* ---------------- free take */
let ft = null;
async function freeTake() {
  const btn = el("ftGo");
  if (ft) {
    const ctx = A.ctx(), dur = ctx.currentTime - ft.t0; clearInterval(ft.timer); A.silence();
    const blob = await A.mic.stopRecording();
    const label = el("ftLabel").value.trim() || "Free take", kind = el("ftKind").value;
    const log = { v: 2, app: "warmup-bench/web-1", type: "free", id: "f" + new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12) + W.uid().slice(0, 3),
      startedAt: ft.startedAt, routineName: label, voice: voiceLabel(),
      routine: [{ type: "timer", name: label, block: kind, vowel: "", secs: Math.round(dur) }], clapAt: null,
      events: [{ t: 0, e: "sync" }, { t: 0, e: "start", i: 0, block: kind, name: label, type: "timer" }, { t: +dur.toFixed(3), e: "end", i: 0 }, { t: +dur.toFixed(3), e: "finish" }],
      melody: [], lead: [], chord: [], durationS: +dur.toFixed(3), drone: ft.drone || null,
      recording: { mime: A.mic.mime, offsetS: 0, recStartCtx: +ft.t0.toFixed(4), sessT0Ctx: +ft.t0.toFixed(4) }, mic: A.mic.info() };
    ft = null; btn.textContent = "● Record"; el("ftTime").textContent = "";
    showTab("practice"); renderPost(log, blob); return;
  }
  try { await A.mic.open(S.micId || ""); A.ensure(); await A.ctx().resume(); A.mix(S.mix); } catch (e) { toast("Microphone: " + (e.message || e.name)); return; }
  const t0 = await A.mic.startRecording().catch(e => { toast("Not recording: " + e.message); return null; }); if (t0 === null) return;
  const drone = el("ftDrone").value; if (drone) A.drone(A.ctx().currentTime + 0.1, 1800, W.parseNote(drone), true);
  ft = { t0, startedAt: new Date().toISOString(), drone };
  btn.textContent = "■ Stop and save";
  ft.timer = setInterval(() => { el("ftTime").textContent = fmt(A.ctx().currentTime - t0); const p = A.mic.pitch(); const m = el("ftMeter"); if (m && p) m.style.width = Math.min(100, p.rms * 500) + "%"; }, 200);
}

/* ================================================================ AFTER: rate, save, send */
let post = null;
function renderPost(log, blob) {
  post = { log, blob, ratings: {}, throat: "", energy: 0 };
  const pp = el("postPanel"); pp.hidden = false;
  const sung = [...new Set(log.events.filter(e => e.e === "start").map(e => e.i))];
  pp.innerHTML = `<div class="spread"><h2>How did it go?</h2><span class="mono faint small">${fmt(log.durationS || 0)} · ${sung.length} exercises${blob ? " · " + (blob.size / 1e6).toFixed(1) + " MB recorded" : ""}</span></div>
    ${blob ? `<audio controls src="${URL.createObjectURL(blob)}" style="width:100%"></audio>` : (log.recordError ? `<div class="callout rose">Not recorded: ${esc(log.recordError)}</div>` : "")}
    <div>${sung.map(i => { const it = log.routine[i]; return `<div class="rate"><div style="min-width:0"><b>${esc(it.name)}</b> <span class="faint">${esc(it.vowel || "")}</span></div>
      <div class="row"><div class="seg" data-rate="${i}">${["Easy", "Okay", "Hard"].map(x => `<button aria-pressed="false" data-v="${x}">${x}</button>`).join("")}</div>
      ${it.type === "siren" ? `<label class="check">Flips <input type="number" min="0" max="40" inputmode="numeric" data-flips="${i}" style="width:4.5em;background:var(--ground);border:1px solid var(--line);border-radius:6px;padding:4px 6px"></label>` : ""}</div></div>`; }).join("")}</div>
    <div class="fields"><div class="field"><label>Throat</label><div class="seg" id="pThroat">${["Fine", "Tired", "Scratchy", "Sore"].map(x => `<button aria-pressed="false" data-v="${x}">${x}</button>`).join("")}</div></div>
      <div class="field"><label>Energy</label><div class="seg" id="pEnergy">${[1, 2, 3, 4, 5].map(x => `<button aria-pressed="false" data-v="${x}">${x}</button>`).join("")}</div></div></div>
    <div class="callout rose" id="soreNote" hidden>Sore is a stop sign. Rest the voice today, drink water, and tell your teacher if it's still there tomorrow.</div>
    <div class="field"><label for="pNotes">Notes, in your words</label><textarea id="pNotes" rows="3" placeholder="What felt smooth, what flipped, anything that grabbed"></textarea></div>
    <div class="row"><button class="btn brass" id="pSave">Save session</button><button class="btn ghost" id="pDiscard">Discard</button></div>`;
  $$("[data-rate]", pp).forEach(g => g.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; $$("button", g).forEach(x => x.setAttribute("aria-pressed", x === b)); post.ratings[g.dataset.rate] = Object.assign(post.ratings[g.dataset.rate] || {}, { feel: b.dataset.v }); }));
  $$("[data-flips]", pp).forEach(n => n.addEventListener("input", () => { post.ratings[n.dataset.flips] = Object.assign(post.ratings[n.dataset.flips] || {}, { flips: parseInt(n.value, 10) }); }));
  for (const [id, k] of [["pThroat", "throat"], ["pEnergy", "energy"]]) el(id).addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; $$("button", el(id)).forEach(x => x.setAttribute("aria-pressed", x === b)); post[k] = b.dataset.v; if (k === "throat") el("soreNote").hidden = b.dataset.v !== "Sore"; });
  el("pSave").addEventListener("click", savePost);
  el("pDiscard").addEventListener("click", () => { if (el("pDiscard").dataset.armed !== "1") { el("pDiscard").dataset.armed = "1"; el("pDiscard").textContent = "Discard the take?"; return; } pp.hidden = true; post = null; });
  pp.scrollIntoView({ behavior: "smooth", block: "start" });
}
async function savePost() {
  const log = post.log;
  Object.assign(log, { ratings: post.ratings, throat: post.throat, energy: post.energy ? +post.energy : null, notes: el("pNotes").value.trim(), savedAt: new Date().toISOString() });
  if (post.blob && log.recording) { log.recording.bytes = post.blob.size; log.recording.type = post.blob.type; }
  if (!post.blob && log.recording) { log.recording.lost = true; toast("The recording came back empty. The microphone may have stopped during the session."); }
  try { await DB.putSession(log); if (post.blob) await DB.putAudio(log.id, post.blob); }
  catch (e) { toast("Could not save on this device: " + e.message); return; }
  el("postPanel").innerHTML = `<div class="callout sage"><b>Saved on this device.</b> Send it to the coach from <b>Sessions</b>${SYNC.server ? " (one tap: the coach server is connected)" : ""}.</div><div class="row"><button class="btn primary" id="pSend">Send to coach now</button></div>`;
  el("pSend").addEventListener("click", () => sendSession(log.id));
  updateCounts();
}

/* ================================================================ SESSIONS + SYNC
   Two routes back to the coach:
     1. the desktop server (tools/bench_server.py in the coaching repo): the app is served from
        it, and a session goes straight into the coach's inbox with one tap;
     2. anywhere else (the phone): the share sheet sends session.json + the recording to Google
        Drive / Files / email, and the coach picks it up from there. */
const SYNC = { server: false };
async function detectServer() {
  // the coach server only ever runs on this computer; don't probe for it on the public site
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname))
    try { const r = await fetch("api/ping", { cache: "no-store" }); if (r.ok) { const j = await r.json(); SYNC.server = !!j.ok; } } catch (e) {}
  if (SYNC.server) pill("pSync", "ok", "Coach server connected"); else pill("pSync", "", "Phone mode: share sessions");
}
function audioExt(type) { return /mp4|aac|m4a/.test(type || "") ? "m4a" : /ogg/.test(type || "") ? "ogg" : "webm"; }
async function sendSession(id) {
  const all = await DB.allSessions(); const s = all.find(x => x.id === id); if (!s) return;
  const blob = await DB.getAudio(id);
  const json = new Blob([JSON.stringify(s)], { type: "application/json" });
  if (SYNC.server) {
    try {
      let r = await fetch("api/session?id=" + encodeURIComponent(id), { method: "POST", headers: { "Content-Type": "application/json" }, body: json });
      if (!r.ok) throw new Error("server said " + r.status);
      if (blob) { r = await fetch("api/audio?id=" + encodeURIComponent(id) + "&ext=" + audioExt(blob.type), { method: "PUT", body: blob }); if (!r.ok) throw new Error("the recording upload failed (" + r.status + ")"); }
      else if (s.recording) toast("This session has no recording saved, so only the log was sent.");
      s.sentAt = new Date().toISOString(); s.sentVia = "server"; await DB.putSession(s); toast("Sent to the coach"); renderSessions(); return;
    } catch (e) { toast("Server send failed (" + e.message + "). Using share instead."); }
  }
  if (ML.gdrive.configured()) {
    try { await ML.gdrive.sendSession(id, json, blob, blob ? audioExt(blob.type) : ""); s.sentAt = new Date().toISOString(); s.sentVia = "gdrive"; await DB.putSession(s); toast("Sent to Google Drive"); renderSessions(); return; }
    catch (e) { toast("Google Drive send failed (" + e.message + "). Sharing instead."); }
  }
  const files = [new File([json], id + ".session.json", { type: "application/json" })];
  if (blob) files.push(new File([blob], id + "." + audioExt(blob.type), { type: blob.type || "audio/webm" }));
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, title: "Warmup Bench session " + id, text: "For the coach: save both files to the Warmup Bench folder in Google Drive." }); s.sentAt = new Date().toISOString(); s.sentVia = "share"; await DB.putSession(s); renderSessions(); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  files.forEach(f => downloadBlob(f, f.name)); s.sentAt = new Date().toISOString(); s.sentVia = "download"; await DB.putSession(s); renderSessions();
  toast("Downloaded. Put both files in the Warmup Bench Drive folder.");
}
async function renderSessions() {
  const v = el("view-sessions");
  let all = []; try { all = await DB.allSessions(); } catch (e) {}
  all.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  v.innerHTML = `<div class="spread"><h2>Sessions</h2><span class="faint small">${SYNC.server ? "Coach server connected: sending is one tap." : "Send shares the session and its recording, for example to Google Drive."}</span></div>
    ${all.length ? "" : `<div class="empty">No sessions yet. Turn on recording in <b>Sing</b>, run a warm-up, then rate it and save.</div>`}
    <div class="stack" id="sessList">${all.map(s => { const d = new Date(s.startedAt), starts = (s.events || []).filter(e => e.e === "start");
      return `<details class="sess"><summary><div style="min-width:0"><b>${esc(s.routineName || "Warm-up")}</b> <span class="meta">${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · ${fmt(s.durationS || 0)}</span></div>
        <div class="row">${s.recording ? `<span class="pill ok"><span class="dot"></span>Recorded</span>` : `<span class="pill warn"><span class="dot"></span>No recording</span>`}${s.sentAt ? `<span class="pill ok"><span class="dot"></span>Sent</span>` : `<span class="pill"><span class="dot"></span>Not sent</span>`}</div></summary>
        <div data-audio="${esc(s.id)}"></div>
        ${s.notes ? `<p class="muted" style="margin-top:10px">“${esc(s.notes)}”</p>` : ""}
        <div class="timeline">${starts.map((e, k) => { const end = (s.events || []).find(x => (x.e === "end" || x.e === "skip" || x.e === "back" || x.e === "stop" || x.e === "finish") && x.t > e.t); const a = e.t + ((s.recording || {}).offsetS || 0), b = (end ? end.t : e.t + 30) + ((s.recording || {}).offsetS || 0);
          return `<span>${s.recording ? `<button class="btn ghost small" data-clip="${esc(s.id)}" data-a="${a.toFixed(2)}" data-b="${b.toFixed(2)}" aria-label="Play ${esc(e.name)}">▶ ${fmt(e.t)}</button>` : fmt(e.t)}</span><span style="align-self:center">${esc(e.name)}${e.vowel ? " · " + esc(e.vowel) : ""}${s.ratings && s.ratings[e.i] ? " · " + esc([s.ratings[e.i].feel, s.ratings[e.i].flips != null ? s.ratings[e.i].flips + " flips" : ""].filter(Boolean).join(", ")) : ""}</span>`; }).join("")}</div>
        <div class="row" style="margin-top:10px"><button class="btn small primary" data-send="${esc(s.id)}">${s.sentAt ? "Send again" : "Send to coach"}</button><button class="btn small ghost" data-dl="${esc(s.id)}">Download</button><button class="btn small ghost danger" data-rm="${esc(s.id)}">Delete</button></div></details>`; }).join("")}</div>`;
  $$("details.sess", v).forEach(dt => dt.addEventListener("toggle", async () => { if (!dt.open) return; await sessionAudio(dt); }));
  // Each exercise is its own clip: the app logged when every one started and ended, so a
  // tap plays exactly that stretch of the take.
  $$("[data-clip]", v).forEach(b => b.addEventListener("click", async () => {
    const dt = b.closest("details.sess"), au = await sessionAudio(dt); if (!au) return;
    const a = +b.dataset.a, z = +b.dataset.b;
    au.currentTime = a; au.play().catch(() => {});
    const stop = () => { if (au.currentTime >= z) { au.pause(); au.removeEventListener("timeupdate", stop); } };
    au.addEventListener("timeupdate", stop);
  }));
  $$("[data-send]", v).forEach(b => b.addEventListener("click", () => sendSession(b.dataset.send)));
  $$("[data-dl]", v).forEach(b => b.addEventListener("click", async () => { const s = all.find(x => x.id === b.dataset.dl); downloadBlob(new Blob([JSON.stringify(s)], { type: "application/json" }), s.id + ".session.json"); const a = await DB.getAudio(s.id); if (a) downloadBlob(a, s.id + "." + audioExt(a.type)); }));
  $$("[data-rm]", v).forEach(b => b.addEventListener("click", async () => { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Delete for good?"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Delete"; }, 3000); return; } await DB.delSession(b.dataset.rm); renderSessions(); updateCounts(); }));
  updateCounts();
}
/* MediaRecorder writes WebM with no index, so browsers report its duration as Infinity and
   refuse to seek. Seeking once to the far end makes them scan it; after that, seeking works. */
async function sessionAudio(dt) {
  const box = $("[data-audio]", dt); if (!box) return null;
  if (box.firstElementChild) return box.firstElementChild;
  const b = await DB.getAudio(box.dataset.audio); if (!b) return null;
  const au = document.createElement("audio"); au.controls = true; au.preload = "metadata"; au.src = URL.createObjectURL(b); box.appendChild(au);
  await new Promise(res => { au.addEventListener("loadedmetadata", () => {
    if (au.duration === Infinity || isNaN(au.duration)) { au.currentTime = 1e7; au.addEventListener("durationchange", function f() { au.removeEventListener("durationchange", f); au.currentTime = 0; res(); }); }
    else res(); }, { once: true }); setTimeout(res, 3000); });
  return au;
}
async function updateCounts() { try { const all = await DB.allSessions(); el("cSess").textContent = all.filter(s => !s.sentAt).length || ""; } catch (e) {} }

/* ================================================================ COACH
   coach.json comes from the desktop server, or is imported on the phone. Shape:
   {updatedAt, insights:[{date, headline, worked:[], focus:[], reportUrl}],
    plans:[{id, title, why, forDate, routine:{name, items}}], replies:[{text, reply, status}]} */
let coach = LS.get("coach", null);
let feedback = LS.get("feedback", []);
async function loadCoach() {
  if (!SYNC.server) {
    if (ML.gdrive.configured() && ML.gdrive.token) try { const j = await ML.gdrive.coach(); if (j && (j.insights || j.plans)) { coach = j; LS.set("coach", j); mergeReplies(j); } } catch (e) {}
    updateCoachCount(); return;
  }
  try { const r = await fetch("api/coach", { cache: "no-store" }); if (r.ok) { const j = await r.json(); if (j && (j.insights || j.plans)) { coach = j; LS.set("coach", coach); } } } catch (e) {}
  updateCoachCount();
}
function updateCoachCount() { el("cCoach").textContent = coach && coach.plans ? (coach.plans.filter(p => !(LS.get("plansSeen", []).includes(p.id))).length || "") : ""; }
function renderCoach() {
  const v = el("view-coach");
  const ins = (coach && coach.insights) || [], plans = (coach && coach.plans) || [];
  v.innerHTML = `<div class="grid2"><div class="stack"><div class="spread"><h2>From your coach</h2><span class="faint small">${coach ? "Updated " + esc(new Date(coach.updatedAt).toLocaleDateString()) : ""}</span></div>
      ${ins.length ? ins.slice(0, 6).map(x => `<article class="insight"><div class="label">${esc(x.date || "")}${x.routineName ? " · " + esc(x.routineName) : ""}</div><h3>${esc(x.headline || "Session analysed")}</h3>
        ${x.worked && x.worked.length ? `<div class="label" style="margin-top:8px">What worked</div><ul>${x.worked.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
        ${x.focus && x.focus.length ? `<div class="label" style="margin-top:8px">Next time</div><ul>${x.focus.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
        ${x.reportUrl ? `<p style="margin-top:10px"><a href="${esc(x.reportUrl)}" target="_blank" rel="noopener">Open the full report</a></p>` : ""}</article>`).join("")
        : `<div class="empty">After a session is analysed, the findings land here: what worked, and one or two things for next time.</div>`}
      <h2 style="margin-top:6px">Plans to sing</h2>
      ${plans.length ? plans.map(p => `<div class="panel stack" style="gap:8px"><div class="spread"><div><div class="label">${esc(p.forDate || "")}</div><h3>${esc(p.title || p.routine?.name || "Plan")}</h3></div><div class="row"><button class="btn small primary" data-plan="${esc(p.id)}">▶ Sing</button><button class="btn small" data-planb="${esc(p.id)}">Open</button></div></div>
        ${p.why ? `<p class="muted small">${esc(p.why)}</p>` : ""}<span class="mono faint small">${(p.routine?.items || []).length} exercises · ${fmt(routineDur({ items: p.routine?.items || [], gapBetween: 3 }))}</span></div>`).join("")
        : `<div class="empty">Plans built from your last session appear here, ready to sing.</div>`}
      <div class="row">${SYNC.server ? `<button class="btn small" id="cRefresh">Check for updates</button>` : ""}<label class="btn small ghost">Import coach file<input type="file" id="cImport" accept="application/json,.json" hidden></label></div></div>
    <div class="stack"><h2>Sync</h2>
      <div class="panel stack"><div class="spread"><b>My library</b><span class="pill ${ML.status === "synced" ? "ok" : ML.status === "error" || ML.status === "reconnect" ? "warn" : ""}"><span class="dot"></span>${esc(ML.status === "synced" ? "Synced " + new Date(ML.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ML.status === "local" ? "This device only" : ML.status)}</span></div>
        <p class="muted small">${ML.list("exercises").length} exercises and ${ML.list("routines").length} warm-ups. ${SYNC.server ? "Stored in <b>Google Drive › Warmup Bench</b> through Drive for desktop." : ML.gdrive.configured() ? "Stored in <b>Google Drive › Warmup Bench</b> through your Google sign-in." : "Kept on this device until you connect Google Drive below."}</p>
        ${ML.detail && ML.status === "error" ? `<div class="callout rose small">${esc(ML.detail)}</div>` : ""}
        <div class="row"><button class="btn small primary" id="syncNow">${ML.status === "reconnect" ? "Reconnect and sync" : "Sync now"}</button><button class="btn small ghost" id="libExport">Export library file</button><label class="btn small ghost">Import<input type="file" id="libImport" accept="application/json,.json" hidden></label></div>
        ${SYNC.server ? "" : `<details><summary class="small" style="cursor:pointer">Google Drive on this phone</summary><div class="stack" style="margin-top:8px">
          <div class="field"><label for="gClient">Google OAuth client ID</label><input id="gClient" value="${esc(ML.gdrive.cfg().clientId || "")}" placeholder="1234…apps.googleusercontent.com" autocapitalize="off" spellcheck="false"></div>
          <div class="row"><button class="btn small brass" id="gConnect">Connect Google Drive</button></div>
          <ol class="steps small"><li><span>console.cloud.google.com › new project › enable the <b>Google Drive API</b>.</span></li><li><span>OAuth consent screen: External, Testing, add your own Gmail as a test user.</span></li><li><span>Credentials › OAuth client ID › <b>Web application</b>; add this page's address (<span class="mono">${esc(location.origin)}</span>) as an authorised JavaScript origin.</span></li><li><span>Paste the client ID here and connect. It is not a secret.</span></li></ol></div></details>`}
      </div>
      <h2>Improve the app</h2>
      <div class="panel stack"><div class="field"><label for="fbText">What should change? A missing exercise, something confusing, a sound you want.</label><textarea id="fbText" rows="3"></textarea></div>
        <div class="row"><button class="btn primary small" id="fbSend">Add to the list</button></div><p class="faint small">${SYNC.server ? "Goes straight to the coach." : "Travels with your next sent session."}</p></div>
      ${feedback.map(f => `<div class="panel" style="padding:12px 14px"><div class="spread"><span class="label">${esc(new Date(f.at).toLocaleDateString())}</span><span class="pill ${f.status === "done" ? "ok" : ""}"><span class="dot"></span>${f.status === "done" ? "Done" : "Open"}</span></div><p style="margin-top:6px">${esc(f.text)}</p>${f.reply ? `<p class="muted small" style="margin-top:6px">Coach: ${esc(f.reply)}</p>` : ""}</div>`).join("")}</div></div>`;
  const usePlan = (id, sing) => { const p = plans.find(x => x.id === id); if (!p) return; routine = JSON.parse(JSON.stringify(p.routine)); routine.items.forEach(it => it.id = it.id || W.uid()); routine.source = "coach-plan"; saveR(); LS.set("plansSeen", [...new Set([...LS.get("plansSeen", []), id])]); updateCoachCount(); if (sing) { showTab("practice"); startRoutine(0); } else { sel = 0; showTab("build"); } };
  $$("[data-plan]", v).forEach(b => b.addEventListener("click", () => usePlan(b.dataset.plan, true)));
  $$("[data-planb]", v).forEach(b => b.addEventListener("click", () => usePlan(b.dataset.planb, false)));
  const cr = el("cRefresh"); if (cr) cr.addEventListener("click", async () => { await loadCoach(); renderCoach(); toast("Up to date"); });
  el("cImport").addEventListener("change", async e => { try { const j = JSON.parse(await e.target.files[0].text()); if (!j.insights && !j.plans) throw 0; coach = j; LS.set("coach", j); mergeReplies(j); renderCoach(); updateCoachCount(); toast("Coach file loaded"); } catch (er) { toast("That isn't a coach file"); } });
  el("syncNow").addEventListener("click", async () => { await ML.sync(true); renderCoach(); toast(ML.status === "synced" ? "Library synced" : "Sync: " + (ML.detail || ML.status)); });
  el("libExport").addEventListener("click", () => downloadBlob(new Blob([JSON.stringify(ML.data, null, 1)], { type: "application/json" }), "warmup-bench-library.json"));
  el("libImport").addEventListener("change", async e => { try { const j = JSON.parse(await e.target.files[0].text()); if (!j.exercises) throw 0; ML.adopt(ML.merge(ML.data, j)); renderCoach(); toast("Library merged"); } catch (er) { toast("That is not a library file"); } });
  const gc = el("gConnect"); if (gc) gc.addEventListener("click", async () => {
    const id = el("gClient").value.trim(); if (!/apps\.googleusercontent\.com$/.test(id)) { toast("That doesn't look like an OAuth client ID"); return; }
    ML.gdrive.setCfg(Object.assign(ML.gdrive.cfg(), { clientId: id })); ML.useDrive();
    try { await ML.gdrive.connect(true); await ML.sync(true); await loadCoach(); await loadPack(); loadSampledPiano(); toast("Google Drive connected"); } catch (er) { toast("Google: " + er.message); }
    renderCoach();
  });
  el("fbSend").addEventListener("click", async () => {
    const t = el("fbText").value.trim(); if (!t) return;
    const f = { id: "f" + Date.now().toString(36), text: t, at: new Date().toISOString(), status: "open" };
    feedback.unshift(f); LS.set("feedback", feedback);
    if (SYNC.server) try { await fetch("api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }); } catch (e) {}
    renderCoach(); toast("Added");
  });
}
function mergeReplies(j) { (j.replies || []).forEach(r => { const f = feedback.find(x => x.id === r.id); if (f) Object.assign(f, { status: r.status, reply: r.reply }); }); LS.set("feedback", feedback); }

/* The personal pack and the sampled piano both come from the user's own Drive: through the
   desktop server, or the Drive API when signed in. Neither is in the public app. */
async function loadPack() {
  let pack = null;
  try {
    if (SYNC.server) { const r = await fetch("api/pack", { cache: "no-store" }); if (r.ok) pack = await r.json(); }
    else if (ML.gdrive.configured() && ML.gdrive.token) pack = await ML.gdrive.pack();
  } catch (e) {}
  if (pack && Array.isArray(pack.exercises) && pack.exercises.length) {
    LS.set("pack", pack); const n = L.addPack(pack);
    if (n) { renderLibrary(); if (!el("view-quick").hidden) renderQuick(); }
  }
}
async function loadSampledPiano() {
  if (A.ready) return;
  const prog = p => pill("pPiano", "warn", "Loading Pianoteq " + Math.round(p * 100) + "%");
  try {
    if (SYNC.server) await A.loadPiano("piano/", prog);
    else if (ML.gdrive.configured() && ML.gdrive.token) await A.loadPiano("", prog, n => ML.gdrive.readBin("piano", n));
    else throw new Error("none");
    pill("pPiano", "ok", "Pianoteq piano");
  } catch (e) { pill("pPiano", "", "Synth piano"); }
}
function emitLib() { if (!el("view-library").hidden) renderLibrary(); libState(); }
/* ================================================================ BOOT */
function boot() {
  A.instrument = S.instrument;
  $$(".tab").forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));
  el("sheetBack").addEventListener("click", closeSheet);
  const fromHash = decodeQuick(location.hash);
  renderQuick(); renderLibrary();
  if (fromHash) { generateQuick(); showTab("quick"); }
  else showTab(["quick", "library", "build", "practice", "sessions", "coach"].includes(location.hash.slice(1)) ? location.hash.slice(1) : LS.get("tab", "quick"));
  pill("pPiano", "warn", "Synth piano");
  // old saved routines (before My library) move into it once
  const old = LS.get("saved", []); if (old.length) { old.forEach(r => ML.put("routines", Object.assign({}, r, { id: r.id || W.uid() }))); LS.set("saved", []); }
  ML.on(() => { libState(); renderSaved(); const lp = el("pLib"); if (lp) pill("pLib", ML.status === "synced" ? "ok" : ML.status === "local" ? "" : "warn", ML.status === "synced" ? "Library in Google Drive" : ML.status === "syncing" ? "Syncing library" : ML.status === "local" ? "Library on this device" : "Library: reconnect Drive"); });
  detectServer().then(async () => {
    if (SYNC.server) ML.useServer(); else ML.useDrive();
    await ML.sync(false);
    await loadPack(); loadSampledPiano();
    // Seed My library ONCE, after the first sync, so a second device never duplicates it.
    if (!ML.list("routines").length && !ML.setting("seeded")) {
      for (const k of ["daily", "gig", "dall", "d0915", "bridge"].filter(k => L.PRESETS.some(p => p.key === k))) { const r = presetRoutine(k); r.id = "seed-" + k; r.shiftAt = voiceShift(); ML.put("routines", r); }
      ML.setting("seeded", true);
    }
    // the range and the voice setting travel with the library
    const rg = ML.setting("range"); if (rg && rg.t > (S.rangeT || 0)) { Object.assign(S, rg.v); S.rangeT = rg.t; saveS(); }
    loadCoach(); if (coach) mergeReplies(coach); updateCounts(); updateCoachCount(); emitLib();
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") ML.sync(false); });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  // the piano and mic need an AudioContext, which browsers only start after a tap
  document.addEventListener("pointerdown", () => { A.ensure(); A.ctx().resume(); }, { once: true });
}
boot();
})();
