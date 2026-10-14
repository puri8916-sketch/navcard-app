/* navcard sync client — offline-first document store, synced to the Google Apps Script web app
 * in apps_script/Code.gs. Shared by the daily log and the ×3.2808 calculator.
 * Data is cached in this browser (works offline); changes queue up and are sent when the sheet is reachable. */
(function () {
  if (window.SyncStore) return;
  const CFG = "navsync_cfg", CACHE = "navsync_v1";
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  let S = { cols: {}, meta: {}, outbox: [], since: 0, migrated: {}, url: "" };
  const L = new Set(), SL = new Set();
  let status = "local", lastErr = "", busy = false, again = false, started = false, kickT = null, readyRes;
  const ready = new Promise(r => (readyRes = r));

  function getCfg() {
    let c = null;
    try { c = JSON.parse(ls.get(CFG) || "null"); } catch (e) {}
    const inj = window.__SYNC__ || {};
    return { url: ((c && c.url) || inj.url || "").trim(), key: ((c && c.key) || inj.key || "").trim() };
  }
  // remember a server-injected config so every menu on this device (incl. the merge page) can use it
  (function () { const inj = window.__SYNC__; if (inj && inj.url && !ls.get(CFG)) ls.set(CFG, JSON.stringify({ url: inj.url, key: inj.key || "" })); })();

  function load() {
    try { const c = JSON.parse(ls.get(CACHE) || "null"); if (c) S = Object.assign(S, c); } catch (e) {}
  }
  function save() { if (!ls.set(CACHE, JSON.stringify(S))) console.warn("sync cache not saved"); }
  function emit() { L.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
  function setStatus(s, e) { status = s; lastErr = e || ""; SL.forEach(f => { try { f(s, lastErr, S.outbox.length); } catch (x) {} }); }
  function col(c) { return S.cols[c] || (S.cols[c] = {}); }
  function meta(c) { return S.meta[c] || (S.meta[c] = {}); }
  function queue(op) { S.outbox = S.outbox.filter(o => !(o.col === op.col && o.id === op.id)); S.outbox.push(op); }

  function put(c, id, doc, opts) {
    opts = opts || {};
    const u = opts.updated || Date.now();
    const copy = JSON.parse(JSON.stringify(doc));
    col(c)[id] = copy; meta(c)[id] = u;
    queue({ op: "put", col: c, id: id, doc: copy, updated: u });
    save(); if (!opts.quiet) emit(); kick();
  }
  function del(c, id) {
    const u = Date.now();
    delete col(c)[id]; meta(c)[id] = u;
    queue({ op: "del", col: c, id: id, updated: u });
    save(); emit(); kick();
  }

  async function api(method, body, cfg) {
    const c = cfg || getCfg();
    const sep = c.url.indexOf("?") >= 0 ? "&" : "?";
    const r = method === "GET"
      ? await fetch(c.url + sep + body + "&key=" + encodeURIComponent(c.key))
      : await fetch(c.url, { method: "POST", body: JSON.stringify({ key: c.key, ops: body }) });
    const t = await r.text();
    let j;
    try { j = JSON.parse(t); } catch (e) { throw new Error(r.ok ? "URL นี้ไม่ใช่ Web app ของสคริปต์ (ตรวจว่าลงท้าย /exec และตั้ง Who has access: Anyone)" : "เชื่อมต่อไม่ได้ (HTTP " + r.status + ")"); }
    if (!j.ok) throw new Error(j.error === "bad_key" ? "รหัสเข้าใช้ไม่ถูกต้อง" : (j.error || "เกิดข้อผิดพลาด"));
    return j;
  }

  async function cycle() {
    const c = getCfg();
    if (!c.url) { setStatus("local"); readyRes(); return; }
    if (busy) { again = true; return; }
    busy = true;
    if (S.url !== c.url) { S.since = 0; S.url = c.url; save(); }   // new sheet → full download
    setStatus("syncing", "");
    try {
      while (S.outbox.length) {
        const ops = S.outbox.slice(0, 100);
        await api("POST", ops);
        S.outbox = S.outbox.filter(o => ops.indexOf(o) < 0);
        save();
      }
      const j = await api("GET", "action=load&since=" + encodeURIComponent(S.since));
      let changed = false;
      for (const d of j.docs) {
        if (S.outbox.some(o => o.col === d.col && o.id === d.id)) continue;   // our newer edit is still on its way
        const m = meta(d.col);
        if ((m[d.id] || 0) > d.updated) continue;
        m[d.id] = d.updated;
        if (d.deleted) { if (col(d.col)[d.id] !== undefined) { delete col(d.col)[d.id]; changed = true; } }
        else if (JSON.stringify(col(d.col)[d.id]) !== JSON.stringify(d.doc)) { col(d.col)[d.id] = d.doc; changed = true; }
      }
      S.since = Math.max(S.since, j.now || 0);
      save();
      if (changed) emit();
      setStatus("online");
    } catch (e) {
      setStatus(navigator.onLine === false ? "offline" : "error", e.message || String(e));
    } finally {
      busy = false; readyRes();
      if (again) { again = false; kick(); }
    }
  }
  function kick(ms) { if (!started) return; clearTimeout(kickT); kickT = setTimeout(cycle, ms == null ? 400 : ms); }

  /** Copy data saved by an older version (kept only in this browser) into the synced store once.
   *  It is written as "very old" so it never overwrites newer data already in the sheet. */
  function migrate(key, fn) {
    if (S.migrated[key]) return;
    S.migrated[key] = true;
    const raw = ls.get(key);
    if (raw) { try { fn(JSON.parse(raw), (c, id, doc) => { if (col(c)[id] === undefined) put(c, id, doc, { updated: 1, quiet: true }); }); } catch (e) { console.warn(e); } }
    save();
  }

  load();
  window.SyncStore = {
    ready,
    start() {
      if (started) return ready;
      started = true; kick(0);
      setInterval(() => { if (document.visibilityState !== "hidden") cycle(); }, window.__SYNC_POLL__ || 15000);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") cycle(); });
      window.addEventListener("online", () => cycle());
      window.addEventListener("storage", e => { if (e.key === CACHE) { load(); emit(); } });
      return ready;
    },
    all: c => col(c),
    put, del, migrate,
    replaceAll(c, docs) { Object.keys(col(c)).forEach(id => { if (!(id in docs)) del(c, id); }); Object.keys(docs).forEach(id => put(c, id, docs[id], { quiet: true })); emit(); },
    on(f) { L.add(f); return () => L.delete(f); },
    onStatus(f) { SL.add(f); f(status, lastErr, S.outbox.length); return () => SL.delete(f); },
    config: getCfg,
    connected: () => !!getCfg().url,
    pending: () => S.outbox.length,
    syncNow: () => cycle(),
    async test(url, key) { return api("GET", "action=ping", { url: url.trim(), key: key.trim() }); },
    setConfig(url, key) {
      if (url) ls.set(CFG, JSON.stringify({ url: url.trim(), key: (key || "").trim() }));
      else { try { localStorage.removeItem(CFG); } catch (e) {} }
      S.since = 0; save(); kick(0);
    }
  };
})();
