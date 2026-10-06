/* Warmup Bench - MY LIBRARY: your own exercises, your saved warm-ups and your range, kept in
   Google Drive so the phone and the desktop share one library.

   Two ways to reach Drive:
     server  - on the desktop the app is served by bench_server.py, which writes
               G:/My Drive/Warmup Bench/library.json; Google Drive for desktop syncs it.
     gdrive  - anywhere else (the phone), the app talks to the Drive API directly, signed in
               with Google. Needs a Google Cloud OAuth client ID, set once in Coach > Sync.

   MERGE RULE: every exercise and warm-up carries `updatedAt`; on sync the newest copy of each
   id wins, and a deletion is a tombstone ({id, deleted, updatedAt}) so it travels too.
   Nothing is ever overwritten wholesale, so two devices editing different things both keep
   their changes. */
(function (root) {
"use strict";
const KEY = "wb:mylib", GKEY = "wb:gdrive";
const ML = { data: null, status: "local", detail: "", lastSync: 0, provider: null, listeners: [], busy: false };
const blank = () => ({ v: 1, updatedAt: 0, exercises: [], routines: [], settings: {} });
ML.on = fn => ML.listeners.push(fn);
const emit = () => ML.listeners.forEach(f => { try { f(); } catch (e) {} });
ML.load = () => {
  try { ML.data = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) { ML.data = blank(); }
  return ML.data;
};
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(ML.data)); } catch (e) {} };
ML.list = kind => (ML.data[kind] || []).filter(x => !x.deleted);
ML.get = (kind, id) => (ML.data[kind] || []).find(x => x.id === id && !x.deleted) || null;
ML.put = (kind, obj) => {
  const o = JSON.parse(JSON.stringify(obj)); o.updatedAt = Date.now();
  const arr = ML.data[kind], i = arr.findIndex(x => x.id === o.id);
  if (i >= 0) arr[i] = o; else arr.unshift(o);
  ML.data.updatedAt = Date.now(); persist(); emit(); ML.schedule(); return o;
};
ML.remove = (kind, id) => {
  const arr = ML.data[kind], i = arr.findIndex(x => x.id === id);
  if (i >= 0) arr[i] = { id, deleted: true, updatedAt: Date.now() };
  ML.data.updatedAt = Date.now(); persist(); emit(); ML.schedule();
};
ML.adopt = d => { ML.data = d; persist(); emit(); ML.schedule(); };
ML.setting = (k, v) => {
  if (v === undefined) return (ML.data.settings[k] || {}).v;
  ML.data.settings[k] = { v, t: Date.now() }; persist(); ML.schedule();
};
function mergeList(a, b) {
  const m = new Map();
  for (const x of [...(a || []), ...(b || [])]) { const y = m.get(x.id); if (!y || (x.updatedAt || 0) > (y.updatedAt || 0)) m.set(x.id, x); }
  return [...m.values()].sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
}
ML.merge = (a, b) => {
  const out = blank();
  out.exercises = mergeList(a.exercises, b.exercises);
  out.routines = mergeList(a.routines, b.routines);
  const ks = new Set([...Object.keys(a.settings || {}), ...Object.keys(b.settings || {})]);
  for (const k of ks) { const x = (a.settings || {})[k], y = (b.settings || {})[k]; out.settings[k] = !x ? y : !y ? x : ((y.t || 0) > (x.t || 0) ? y : x); }
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
};

/* ---------------------------------------------------------------- providers */
const server = {
  name: "server",
  async read() { const r = await fetch("api/library", { cache: "no-store" }); if (!r.ok) throw new Error("server " + r.status); return await r.json(); },
  async write(d) { const r = await fetch("api/library", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }); if (!r.ok) throw new Error("server " + r.status); },
};

const G = ML.gdrive = {
  name: "gdrive", token: null, exp: 0, folder: null, sessFolder: null, files: {},
  cfg() { try { return JSON.parse(localStorage.getItem(GKEY) || "{}"); } catch (e) { return {}; } },
  setCfg(c) { try { localStorage.setItem(GKEY, JSON.stringify(c)); } catch (e) {} },
  configured() { return !!this.cfg().clientId; },
  loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.onload = res; s.onerror = () => rej(new Error("Could not load Google sign-in")); document.head.appendChild(s); });
  },
  /* Interactive only from a tap: browsers block the Google popup otherwise. */
  async connect(interactive) {
    const c = this.cfg(); if (!c.clientId) throw new Error("No Google client ID set");
    if (this.token && Date.now() < this.exp - 60000) return this.token;
    if (!interactive) throw new Error("reconnect");
    await this.loadGis();
    const tok = await new Promise((res, rej) => {
      const tc = google.accounts.oauth2.initTokenClient({ client_id: c.clientId, scope: "https://www.googleapis.com/auth/drive",
        callback: r => r.error ? rej(new Error(r.error)) : res(r), error_callback: e => rej(new Error(e.type || "sign-in closed")) });
      tc.requestAccessToken({ prompt: c.connected ? "" : "consent" });
    });
    this.token = tok.access_token; this.exp = Date.now() + (tok.expires_in || 3600) * 1000;
    this.setCfg(Object.assign(c, { connected: true }));
    return this.token;
  },
  async api(url, opt = {}) {
    const r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({ Authorization: "Bearer " + this.token }, opt.headers || {}) }));
    if (r.status === 401) { this.token = null; throw new Error("reconnect"); }
    if (!r.ok) throw new Error("Drive " + r.status + ": " + (await r.text()).slice(0, 120));
    return r;
  },
  async findOrMake(name, parent, folder) {
    const q = `name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents and trashed=false` + (folder ? " and mimeType='application/vnd.google-apps.folder'" : "");
    const j = await (await this.api("https://www.googleapis.com/drive/v3/files?fields=files(id,name)&q=" + encodeURIComponent(q))).json();
    if (j.files && j.files.length) return j.files[0].id;
    if (!folder) return null;
    const r = await this.api("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent] }) });
    return (await r.json()).id;
  },
  async ensureFolders() {
    if (!this.folder) this.folder = await this.findOrMake("Warmup Bench", "root", true);
    if (!this.sessFolder) this.sessFolder = await this.findOrMake("sessions", this.folder, true);
  },
  async readJson(name) {
    await this.ensureFolders();
    const id = this.files[name] || await this.findOrMake(name, this.folder, false);
    if (!id) return null; this.files[name] = id;
    return await (await this.api("https://www.googleapis.com/drive/v3/files/" + id + "?alt=media")).json();
  },
  async upload(name, parent, blob, type) {
    const key = parent + "/" + name;
    let id = this.files[key] || await this.findOrMake(name, parent, false);
    if (id) { await this.api("https://www.googleapis.com/upload/drive/v3/files/" + id + "?uploadType=media", { method: "PATCH", headers: { "Content-Type": type }, body: blob }); }
    else {
      const meta = new Blob([JSON.stringify({ name, parents: [parent] })], { type: "application/json" });
      const form = new FormData(); form.append("metadata", meta); form.append("file", blob instanceof Blob ? blob : new Blob([blob], { type }));
      id = (await (await this.api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", body: form })).json()).id;
    }
    this.files[key] = id; return id;
  },
  async read() { await this.connect(false); return await this.readJson("library.json") || {}; },
  async write(d) { await this.connect(false); await this.ensureFolders(); await this.upload("library.json", this.folder, new Blob([JSON.stringify(d, null, 1)], { type: "application/json" }), "application/json"); },
  async sendSession(id, json, blob, ext) {
    await this.connect(true); await this.ensureFolders();
    await this.upload(id + ".session.json", this.sessFolder, json, "application/json");
    if (blob) await this.upload(id + "." + ext, this.sessFolder, blob, blob.type || "audio/webm");
  },
  async coach() { await this.connect(false); return await this.readJson("coach.json"); },
  async pack() { await this.connect(false); return await this.readJson("pack.json"); },
  /* a file inside a subfolder of Warmup Bench, as bytes: used for the piano samples */
  async readBin(sub, name) {
    await this.ensureFolders();
    const fk = "sub:" + sub;
    if (!this.files[fk]) this.files[fk] = await this.findOrMake(sub, this.folder, true);
    const key = fk + "/" + name;
    const id = this.files[key] || await this.findOrMake(name, this.files[fk], false);
    if (!id) throw new Error(name + " is not in Warmup Bench/" + sub);
    this.files[key] = id;
    return await (await this.api("https://www.googleapis.com/drive/v3/files/" + id + "?alt=media")).arrayBuffer();
  },
};

ML.useServer = () => { ML.provider = server; };
ML.useDrive = () => { ML.provider = G.configured() ? G : null; };
let t = null;
ML.schedule = () => { clearTimeout(t); t = setTimeout(() => ML.sync(false), 1500); };
ML.sync = async (interactive) => {
  if (!ML.provider || ML.busy) { if (!ML.provider) { ML.status = "local"; emit(); } return; }
  ML.busy = true; ML.status = "syncing"; emit();
  try {
    if (ML.provider === G) await G.connect(!!interactive);
    const remote = await ML.provider.read();
    ML.data = ML.merge(ML.data, Object.assign(blank(), remote || {}));
    persist();
    await ML.provider.write(ML.data);
    ML.status = "synced"; ML.lastSync = Date.now(); ML.detail = "";
  } catch (e) {
    ML.status = e.message === "reconnect" ? "reconnect" : "error"; ML.detail = e.message;
  }
  ML.busy = false; emit();
};
root.WBML = ML;
})(window);
