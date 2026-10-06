/* Warmup Bench - sound and microphone.
   Sampled piano: a set of mp3 samples (index.json lists them) loaded from wherever the user
   keeps them - the public app ships none. Each sample is repitched by at most 1.5 semitones.
   Without samples, a synthesised piano: harmonics through a closing low-pass with a piano's
   decay, which reads as "piano" far better than a bare sine. */
(function (root) {
"use strict";
const A = {};
let ctx = null, master, dry, wet, conv, buses = {};
const BUF = {};
let notesAvail = [], layers = [96, 58];
A.ready = false;
A.instrument = "piano";          // piano (samples, else synth) | synth | sine | triangle

A.ctx = () => ctx;
A.ensure = function () {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  // "playback", not "interactive": everything here is scheduled ahead, so a bigger output
  // buffer costs nothing and stops the crackle and dropouts small buffers cause on Windows.
  ctx = new AC({ latencyHint: "playback" });
  master = ctx.createDynamicsCompressor();
  master.threshold.value = -10; master.knee.value = 8; master.ratio.value = 3;
  master.attack.value = 0.004; master.release.value = 0.2;
  master.connect(ctx.destination);
  dry = ctx.createGain(); dry.connect(master);
  conv = ctx.createConvolver(); conv.buffer = impulse(1.8, 3.2);
  wet = ctx.createGain(); wet.gain.value = 0.18; conv.connect(wet); wet.connect(master);
  for (const b of ["piano", "chord", "click", "guide", "drone"]) {
    const g = ctx.createGain(); g.connect(dry); if (b !== "click") g.connect(conv); buses[b] = g;
  }
  return ctx;
};
function impulse(secs, decay) {
  const n = Math.floor(ctx.sampleRate * secs), ir = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * Math.min(1, i / (ctx.sampleRate * 0.012));
  }
  return ir;
}
A.mix = function (m) {
  if (!ctx) return;
  for (const k of ["piano", "chord", "click", "guide", "drone"]) if (m[k] != null) buses[k].gain.value = +m[k];
  if (m.room != null) wet.gain.value = +m.room;
};

/* fetcher(name) -> Promise<ArrayBuffer>. Defaults to plain fetch from `base`. */
A.loadPiano = async function (base, onProgress, fetcher) {
  A.ensure();
  const get = fetcher || (async n => { const r = await fetch(base + n); if (!r.ok) throw new Error("no samples (" + r.status + ")"); return r.arrayBuffer(); });
  const idx = JSON.parse(new TextDecoder().decode(await get("index.json")));
  notesAvail = idx.notes; layers = idx.layers;
  let done = 0;
  await Promise.all(idx.samples.map(async s => {
    const ab = await get(s.file);
    const buf = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
    // MP3 decoders pad the start differently in every browser: find the hammer in the
    // decoded audio and start 3 ms before it, rather than trusting the file.
    const d = buf.getChannelData(0); let pk = 0;
    for (let i = 0; i < d.length; i += 4) pk = Math.max(pk, Math.abs(d[i]));
    let on = 0; const th = pk * 0.02; while (on < d.length && Math.abs(d[on]) < th) on++;
    BUF[s.note + "_" + s.vel] = { buf, off: Math.max(0, on / buf.sampleRate - 0.003) };
    done++; onProgress && onProgress(done / idx.samples.length);
  }));
  A.ready = true;
};

const alive = new Set();
function track(src, g) { const v = { src, g }; alive.add(v); src.onended = () => alive.delete(v); return v; }
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

A.note = function (m, when, dur, opt) {
  /* opt: {layer: 96|58, bus, vel} */
  const layer = opt.layer || 96, bus = buses[opt.bus || "piano"], vel = opt.vel ?? 0.9;
  if (A.instrument === "sine" || A.instrument === "triangle") return tone(m, when, dur, bus, vel * 0.5, A.instrument);
  if (A.instrument === "synth" || !A.ready) return synthPiano(m, when, dur, bus, vel, layer);
  let s = notesAvail[0];
  for (const n of notesAvail) if (Math.abs(n - m) < Math.abs(s - m)) s = n;
  const e = BUF[s + "_" + layer]; if (!e) return;
  const src = ctx.createBufferSource(); src.buffer = e.buf; src.playbackRate.value = Math.pow(2, (m - s) / 12);
  const g = ctx.createGain(); g.gain.setValueAtTime(vel, when);
  const rel = when + Math.max(0.05, dur);
  g.gain.setValueAtTime(vel, rel); g.gain.setTargetAtTime(0, rel, 0.11);
  src.connect(g); g.connect(bus); src.start(when, e.off); src.stop(rel + 0.9); track(src, g);
};
let pwave = null;
function synthPiano(m, when, dur, bus, vel, layer) {
  if (!pwave) {
    const n = 16, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = Math.pow(k, -1.45) * (k % 7 === 0 ? 0.3 : 1);   // hammer near 1/7 of the string
    pwave = ctx.createPeriodicWave(re, im);
  }
  const f = hz(m), soft = layer === 58;
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), g2 = ctx.createGain();
  o.setPeriodicWave(pwave); o.frequency.value = f; o2.setPeriodicWave(pwave); o2.frequency.value = f; o2.detune.value = 3;  // two strings, slightly apart
  g2.gain.value = 0.5;
  // decay is longer low and shorter high, as on a real string
  const tau = Math.max(0.35, 2.4 - (m - 36) * 0.03), peak = vel * (soft ? 0.18 : 0.26);
  lp.type = "lowpass"; lp.Q.value = 0.3;
  lp.frequency.setValueAtTime(Math.min(16000, f * (soft ? 5 : 9)), when);
  lp.frequency.setTargetAtTime(Math.min(8000, f * 2.2), when + 0.01, tau * 0.5);
  g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(peak, when + 0.006);
  g.gain.setTargetAtTime(peak * 0.25, when + 0.006, tau);
  const rel = when + Math.max(0.05, dur);
  g.gain.cancelScheduledValues(rel); g.gain.setTargetAtTime(0.0001, rel, 0.09);
  o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(bus);
  o.start(when); o2.start(when); o.stop(rel + 0.7); o2.stop(rel + 0.7); track(o, g); track(o2, g2);
}
function tone(m, when, dur, bus, vel, type) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = hz(m);
  g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(Math.max(0.001, vel * 0.6), when + 0.02);
  g.gain.setValueAtTime(Math.max(0.001, vel * 0.5), when + Math.max(0.03, dur - 0.04));
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.08);
  o.connect(g); g.connect(bus); o.start(when); o.stop(when + dur + 0.1); track(o, g);
}
A.click = function (when, hi) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "triangle"; o.frequency.value = hi ? 1760 : 1175;
  g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(hi ? 0.5 : 0.3, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  o.connect(g); g.connect(buses.click); o.start(when); o.stop(when + 0.07); track(o, g);
};
A.glide = function (when, dur, lo, hi, shape) {
  // Exponential ramps move in equal semitones per second, which is how a siren is sung.
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.22, when + 0.25);
  g.gain.setValueAtTime(0.22, when + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  g.connect(buses.guide);
  for (const [mult, amp] of [[1, 1], [2, 0.18]]) {
    const o = ctx.createOscillator(), a = ctx.createGain(); a.gain.value = amp;
    if (shape === "down") { o.frequency.setValueAtTime(hz(hi) * mult, when); o.frequency.exponentialRampToValueAtTime(hz(lo) * mult, when + dur); }
    else if (shape === "up") { o.frequency.setValueAtTime(hz(lo) * mult, when); o.frequency.exponentialRampToValueAtTime(hz(hi) * mult, when + dur); }
    else {
      o.frequency.setValueAtTime(hz(lo) * mult, when);
      o.frequency.exponentialRampToValueAtTime(hz(hi) * mult, when + dur / 2);
      o.frequency.exponentialRampToValueAtTime(hz(lo) * mult, when + dur);
    }
    o.connect(a); a.connect(g); o.start(when); o.stop(when + dur + 0.05); track(o, a);
  }
};
A.drone = function (when, dur, m, fifth) {
  /* A pad, not a piano: a drone must not decay. Three detuned saws through a low-pass,
     root plus (optionally) the fifth, an octave apart for body. */
  const out = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 900; lp.Q.value = 0.4;
  out.gain.setValueAtTime(0.0001, when); out.gain.exponentialRampToValueAtTime(0.12, when + 2.5);
  out.gain.setValueAtTime(0.12, when + dur - 2.5); out.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  lp.connect(out); out.connect(buses.drone);
  const parts = [[m - 12, 0.7], [m, 1]]; if (fifth) parts.push([m + 7, 0.45]);
  for (const [n, amp] of parts) for (const det of [-6, 0, 7]) {
    const o = ctx.createOscillator(), a = ctx.createGain(); o.type = "sawtooth";
    o.frequency.value = hz(n); o.detune.value = det; a.gain.value = amp * 0.12;
    o.connect(a); a.connect(lp); o.start(when); o.stop(when + dur + 0.05); track(o, a);
  }
};
A.swell = function (when, dur) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 220;
  g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.06, when + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g); g.connect(buses.guide); o.start(when); o.stop(when + dur + 0.05); track(o, g);
};
A.chime = function (when) { A.note(84, when, 1.2, { layer: 58, bus: "chord", vel: 0.5 }); };
A.silence = function () {
  const now = ctx ? ctx.currentTime : 0;
  for (const v of alive) { try { v.g.gain.cancelScheduledValues(now); v.g.gain.setTargetAtTime(0, now, 0.03); v.src.stop(now + 0.15); } catch (e) {} }
  alive.clear();
};

/* ---------------------------------------------------------------- microphone
   Raw capture: no echo cancellation, no noise suppression, no auto-gain. Those three exist to
   make speech sound good on a call and they wreck a singing measurement - AGC alone fakes
   an improvement in breath evenness. */
const M = A.mic = { stream: null, src: null, an: null, rec: null, chunks: [], startedAt: null, mime: "" };
M.deviceId = ""; M.chosen = false;
M.recording = () => !!(M.rec && M.rec.state === "recording");
M.open = async function (deviceId) {
  A.ensure();
  if (deviceId) M.chosen = true;
  if (deviceId !== undefined && deviceId && deviceId !== M.deviceId) {
    // never pull the stream out from under a recording: that is how a take ends up empty
    if (M.recording()) throw new Error("Finish the recording before switching microphones.");
    M.close(); M.deviceId = deviceId;
  }
  if (M.stream) return M.stream;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("This browser has no microphone access. Use Chrome, Edge or Safari over https.");
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
  if (M.deviceId) audio.deviceId = { exact: M.deviceId };
  try { M.stream = await navigator.mediaDevices.getUserMedia({ audio }); }
  catch (e) {
    if (e.name === "OverconstrainedError" && M.deviceId) { M.deviceId = ""; delete audio.deviceId; M.stream = await navigator.mediaDevices.getUserMedia({ audio }); }
    else throw e;
  }
  /* No device chosen? Then don't trust the system default. On a desk with Voicemeeter the
     default input is often a VIRTUAL device, which adds its own buffering and processing.
     Prefer an audio interface, and anything over a virtual device. */
  if (!M.deviceId && !M.chosen) {
    const VIRT = /voicemeeter|vb-audio|virtual|cable|stereo mix|wave ?link|loopback|blackhole|soundflower/i;
    const PREF = /focusrite|scarlett|clarett|vocaster|universal audio|apollo|volt|motu|audient|ssl|rme|presonus|steinberg|shure|rode|zoom|behringer|line 6/i;
    const label = (M.stream.getAudioTracks()[0] || {}).label || "";
    if (VIRT.test(label) || !PREF.test(label)) {
      const ins = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications");
      const better = ins.find(d => PREF.test(d.label) && !VIRT.test(d.label)) || (VIRT.test(label) ? ins.find(d => !VIRT.test(d.label)) : null);
      if (better) { M.stream.getTracks().forEach(t => t.stop()); audio.deviceId = { exact: better.deviceId }; M.deviceId = better.deviceId; M.stream = await navigator.mediaDevices.getUserMedia({ audio }); M.autoPicked = better.label; }
    }
  }
  // If the input dies mid-take (unplugged, driver reset), say so instead of failing silently.
  M.stream.getAudioTracks().forEach(t => t.addEventListener("ended", () => { M.ended = true; if (M.onEnded) M.onEnded(); }));
  M.src = ctx.createMediaStreamSource(M.stream);
  // 2048 samples, not 4096: a shorter window is less lag between singing and seeing it
  M.an = ctx.createAnalyser(); M.an.fftSize = 2048; M.src.connect(M.an);
  M.buf = new Float32Array(M.an.fftSize);
  return M.stream;
};
/* What the browser actually gave us. It is free to ignore a constraint, and an AGC that
   quietly stayed on would skew every level measure, so this is reported, not assumed. */
M.info = function () {
  const t = M.stream && M.stream.getAudioTracks()[0]; if (!t) return null;
  const st = t.getSettings ? t.getSettings() : {};
  return { label: t.label || "Microphone", deviceId: st.deviceId || "", sampleRate: st.sampleRate || (ctx && ctx.sampleRate), channelCount: st.channelCount,
    echoCancellation: st.echoCancellation, noiseSuppression: st.noiseSuppression, autoGainControl: st.autoGainControl, latency: st.latency };
};
A.devices = async function () {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return { inputs: [], outputs: [] };
  const all = await navigator.mediaDevices.enumerateDevices();
  return { inputs: all.filter(d => d.kind === "audioinput"), outputs: all.filter(d => d.kind === "audiooutput") };
};
A.canPickOutput = () => !!(window.AudioContext && AudioContext.prototype.setSinkId);
A.setOutput = async function (id) { A.ensure(); if (!ctx.setSinkId) throw new Error("This browser cannot choose the output; use the system sound settings."); await ctx.setSinkId(id || ""); };
A.outputLabel = async function () {
  const id = ctx && ctx.sinkId; const { outputs } = await A.devices();
  const d = outputs.find(o => o.deviceId === (typeof id === "string" ? id : "")) || outputs.find(o => o.deviceId === "default");
  return d ? d.label || "System default" : "System default";
};
M.close = function () { if (M.stream) M.stream.getTracks().forEach(t => t.stop()); M.stream = null; M.src = null; M.an = null; };
M.pickMime = function () {
  const c = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const t of c) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  return "";
};
M.startRecording = function () {
  return new Promise((resolve, reject) => {
    if (!M.stream) return reject(new Error("Microphone is not open."));
    M.mime = M.pickMime(); M.chunks = [];
    try { M.rec = new MediaRecorder(M.stream, M.mime ? { mimeType: M.mime, audioBitsPerSecond: 128000 } : undefined); }
    catch (e) { return reject(e); }
    M.rec.ondataavailable = e => { if (e.data && e.data.size) M.chunks.push(e.data); };
    // the 'start' event is the closest the browser gets to telling us when sample 0 was taken
    M.rec.onstart = () => { M.startedAt = ctx.currentTime; resolve(M.startedAt); };
    M.rec.onerror = e => reject(e.error || e);
    M.rec.start(1000);
  });
};
M.stopRecording = function () {
  return new Promise(resolve => {
    const done = () => { const b = new Blob(M.chunks, { type: (M.rec && M.rec.mimeType) || M.mime || "audio/webm" }); resolve(b.size ? b : null); };
    if (!M.rec) return resolve(null);
    // a recorder that already stopped on its own (the input died) still holds what it got
    if (M.rec.state === "inactive") return done();
    M.rec.onstop = done;
    try { M.rec.requestData(); } catch (e) {}
    M.rec.stop();
  });
};

/* Round-trip delay: play clicks, hear them come back through the mic, time the gap. With
   earbuds, hold one to the mic. The result is the delay between a note being scheduled and
   the same moment reaching the app through the mic - output + air + input + buffers. */
A.measureDelay = async function () {
  await M.open(M.deviceId || undefined); await ctx.resume();
  const sp = ctx.createScriptProcessor(1024, 1, 1), mute = ctx.createGain(); mute.gain.value = 0;
  const caps = [];
  sp.onaudioprocess = e => { caps.push({ t: e.playbackTime - 1024 / ctx.sampleRate, d: new Float32Array(e.inputBuffer.getChannelData(0)) }); };
  M.src.connect(sp); sp.connect(mute); mute.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.5, gap = 0.6, n = 5;
  for (let i = 0; i < n; i++) A.click(t0 + i * gap, true);
  await new Promise(r => setTimeout(r, (0.5 + n * gap + 0.8) * 1000));
  sp.disconnect(); M.src.disconnect(sp); mute.disconnect();
  const sr = ctx.sampleRate, delays = [];
  let noise = 0, cnt = 0; for (const c of caps) if (c.t < t0 - 0.05) { for (const v of c.d) { noise += v * v; cnt++; } }
  const floor = Math.sqrt(noise / Math.max(1, cnt)) || 1e-4;
  for (let i = 0; i < n; i++) {
    const ct = t0 + i * gap;
    let found = null;
    for (const c of caps) {
      if (c.t + c.d.length / sr < ct || c.t > ct + 0.5) continue;
      for (let j = 0; j < c.d.length; j++) { const tt = c.t + j / sr; if (tt < ct) continue; if (Math.abs(c.d[j]) > Math.max(floor * 8, 0.02)) { found = tt; break; } }
      if (found !== null) break;
    }
    if (found !== null) delays.push(found - ct);
  }
  if (delays.length < 3) throw new Error("Couldn't hear the clicks. Turn the speakers up, or hold an earbud to the mic.");
  delays.sort((a, b) => a - b);
  return { delay: delays[Math.floor(delays.length / 2)], spread: delays[delays.length - 1] - delays[0], heard: delays.length };
};
/* Pitch: YIN (de Cheveigne & Kawahara 2002) on the analyser's window. Returns
   {hz, midi, clarity, rms} or null when unvoiced. Range 60-1100 Hz covers fry-free singing. */
M.pitch = function () {
  if (!M.an) return null;
  M.an.getFloatTimeDomainData(M.buf);
  const b = M.buf, sr = ctx.sampleRate;
  let rms = 0; for (let i = 0; i < b.length; i++) rms += b[i] * b[i]; rms = Math.sqrt(rms / b.length);
  if (rms < 0.008) return { hz: 0, midi: null, clarity: 0, rms };
  /* Decimate to ~16 kHz first. At the full rate this loop was ~1.2 million multiply-adds
     every 50 ms on the main thread, which is what starved the piano scheduler. 16 kHz is
     still eight samples per cycle at the top of a soprano range. */
  const dec = Math.max(1, Math.round(sr / 16000)), n = Math.floor(b.length / dec);
  if (!M.dbuf || M.dbuf.length !== n) M.dbuf = new Float32Array(n);
  const x16 = M.dbuf; for (let i = 0; i < n; i++) { let a = 0; for (let k = 0; k < dec; k++) a += b[i * dec + k]; x16[i] = a / dec; }
  const fs = sr / dec;
  // Use the NEWEST samples in the window, not the oldest: the oldest end is ~40 ms stale.
  const W = 384, maxTau = Math.min(Math.floor(fs / 65), n - W - 1), minTau = Math.floor(fs / 1100), o0 = n - W - maxTau - 1;
  const d = new Float32Array(maxTau + 1);
  for (let tau = minTau; tau <= maxTau; tau++) { let s = 0; for (let i = 0; i < W; i++) { const x = x16[o0 + i] - x16[o0 + i + tau]; s += x * x; } d[tau] = s; }
  let run = 0, tau = -1; const cm = new Float32Array(maxTau + 1);
  for (let t = minTau; t <= maxTau; t++) { run += d[t]; cm[t] = run ? d[t] * (t - minTau + 1) / run : 1; }
  for (let t = minTau + 1; t < maxTau; t++) { if (cm[t] < 0.15) { while (t + 1 < maxTau && cm[t + 1] < cm[t]) t++; tau = t; break; } }
  if (tau < 0) return { hz: 0, midi: null, clarity: 0, rms };
  const a = cm[tau - 1] ?? cm[tau], c = cm[tau + 1] ?? cm[tau], den = a + c - 2 * cm[tau];
  const t2 = den ? tau + (a - c) / (2 * den) : tau;
  const f = fs / t2;
  // `age`: how old the analysed audio is, centre of the window, for plotting it in time
  return { hz: f, midi: 69 + 12 * Math.log2(f / 440), clarity: 1 - cm[tau], rms, age: (W / 2 + maxTau) / fs };
};
M.level = function () {
  if (!M.an) return 0; M.an.getFloatTimeDomainData(M.buf);
  let p = 0; for (let i = 0; i < M.buf.length; i++) p = Math.max(p, Math.abs(M.buf[i])); return p;
};

root.WBA = A;
})(window);
