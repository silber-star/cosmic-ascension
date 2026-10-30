/* COSMIC ASCENSION — game state, versioned save schema, validation and migration. No DOM. */
(function (CA) {
  'use strict';
  const U = CA.U;

  const S = (CA.State = {
    KEY: 'cosmicAscension.save',
    BACKUP_KEY: 'cosmicAscension.backup',
    SETTINGS_KEY: 'cosmicAscension.settings',
  });

  S.defaultSettings = function () {
    return {
      master: 0.7, ambient: 0.5, sfx: 0.7, muted: false,
      reducedMotion: false, reducedFlashing: false, density: 'normal', // low | normal | high
      showFps: false, tutorials: true, lang: 'ko', // ko | en
      quality: 'auto', // auto | high | normal | low
    };
  };

  S.create = function (now = Date.now()) {
    return {
      version: CA.BAL.saveVersion,
      created: now, lastSaved: now,
      cycle: 1,
      stage: 'grain', stageTime: 0,
      mass: CA.STAGE.grain.massStart,
      res: { matter: 0, energy: 60, heavy: 0, research: 0, remnants: 0 },
      upg: {}, perm: {},
      reached: { grain: true },
      discovered: { 'stage:grain': true },
      granted: {},
      seen: {},
      zone: null,
      planet: null,
      system: [],
      core: { M: CA.BAL.jeans.M0, T: CA.BAL.jeans.T0 },
      reservoir: 0,
      star: null,
      remnant: null,
      companion: null, chirp: null, // binary endgame: see core/binary.js
      origins: {}, ended: false,
      Z: CA.BAL.cycle.zStart,
      swarmT: 0, swarmDone: false,
      cd: {}, fx: { boost: 0, damp: 0 },
      buffs: [],
      ev: { active: null, cd: {}, gcd: CA.BAL.events.firstDelay, seq: 0, idle: 0, count: {}, won: {} },
      mg: Object.fromEntries(S.MG_IDS.map((id) => [id, S.mgDefault()])),
      stats: { motes: 0, matterTotal: 0, playTime: 0, cycles: 0, minigames: 0, pulses: 0, bestSnr: 0 },
      history: [],
      atlas: {}, // my records per body: {n: sightings, c: last cycle, v: best number}, see core/records.js
    };
  };
  S.mgDefault = () => ({ cleared: 0, best: {}, plays: 0 });
  S.MG_IDS = ['ga', 'om', 'ss', 'sa', 'an', 'pt', 'bh', 'sn'];

  /* Start a new cycle. Keeps research, remnants, permanent upgrades, discoveries, minigame records. */
  S.newCycle = function (old, zGain, now = Date.now()) {
    const s = S.create(now);
    s.cycle = old.cycle + 1;
    s.res.research = old.res.research;
    s.res.remnants = old.res.remnants;
    s.perm = Object.assign({}, old.perm);
    s.discovered = Object.assign({}, old.discovered);
    s.granted = Object.assign({}, old.granted);
    s.seen = Object.assign({}, old.seen);
    s.origins = Object.assign({}, old.origins);
    s.ended = !!old.ended;
    s.mg = Object.assign(s.mg, U.deepClone(old.mg));
    s.stats = Object.assign({}, old.stats, { cycles: (old.stats.cycles || 0) + 1 });
    s.history = old.history.slice(-20);
    s.atlas = U.deepClone(old.atlas);
    s.Z = U.clamp(old.Z + zGain, CA.BAL.cycle.zStart, CA.BAL.cycle.zMax);
    if (old.ev) { s.ev.seq = old.ev.seq; s.ev.count = Object.assign({}, old.ev.count); s.ev.won = Object.assign({}, old.ev.won); } // event grant keys stay unique
    const inherit = s.perm.p_inherit || 0;
    if (inherit) { s.upg.accretion = inherit; s.upg.capacitor = inherit; }
    return s;
  };

  /* ---------- validation helpers ---------- */
  function num(v, def, min = 0, max = Infinity) { return U.isNum(v) ? U.clamp(v, min, max) : def; }
  function int(v, def, min, max) { return Math.round(num(v, def, min, max)); }
  function bool(v) { return v === true; }
  function boolMap(v, allowed) {
    const out = {};
    if (v && typeof v === 'object') for (const k in v) if (v[k] === true && (!allowed || allowed(k))) out[k] = true;
    return out;
  }

  function validCompanion(c) {
    if (!c || !['wd', 'ns', 'bh'].includes(c.type)) return null;
    const ns = c.type === 'ns';
    return {
      type: c.type, mass: num(c.mass, c.type === 'wd' ? 0.6 : ns ? 1.4 : 10, 0.1, 500), P: num(c.P, ns ? 0.033 : 0, 0, 100), B: num(c.B, ns ? 1e12 : 0, 0, 1e16),
      magnetar: bool(c.magnetar), msp: bool(c.msp), cycle: int(c.cycle, 1, 1, 1e6),
      fed: num(c.fed, 0, 0, 500), gained: num(c.gained, 0, 0, 500), shell: num(c.shell, 0, 0, 1), x: num(c.x, 0, 0, 2),
      valve: num(c.valve, 0.5, 0, 1), ce: num(c.ce, 0, 0, 1), ended: bool(c.ended), touched: bool(c.touched),
    };
  }

  /* Validate an untrusted object. Never throws; returns {state, warnings}. */
  S.validate = function (raw, now = Date.now()) {
    const w = [];
    if (!raw || typeof raw !== 'object') return { state: null, warnings: ['not an object'] };
    raw = S.migrate(raw, w);
    if (!raw) return { state: null, warnings: w.concat('unsupported version') };
    const s = S.create(now);

    s.created = num(raw.created, now, 0, now + 864e5);
    s.lastSaved = num(raw.lastSaved, now, 0, Infinity);
    s.cycle = int(raw.cycle, 1, 1, 1e6);
    if (raw.stage in CA.STAGE) s.stage = raw.stage; else w.push('unknown stage, reset to Dust Grain');
    s.stageTime = num(raw.stageTime, 0, 0, 1e9);
    const st = CA.STAGE[s.stage];

    const r = raw.res || {};
    for (const k of Object.keys(s.res)) s.res[k] = num(r[k], s.res[k], 0, 1e300);

    for (const [key, list] of [['upg', CA.UPGRADES], ['perm', CA.PERM_UPGRADES]]) {
      const src = raw[key] || {};
      for (const u of list) {
        const l = int(src[u.id], 0, 0, u.max);
        if (l) s[key][u.id] = l;
      }
    }

    s.reached = boolMap(raw.reached, (k) => k in CA.STAGE);
    s.reached[s.stage] = true;
    s.discovered = boolMap(raw.discovered, (k) => k in CA.DISCOVERY);
    s.granted = boolMap(raw.granted);
    s.seen = boolMap(raw.seen);
    s.zone = raw.zone === 'inner' || raw.zone === 'outer' ? raw.zone : null;
    s.Z = num(raw.Z, CA.BAL.cycle.zStart, 0.0001, CA.BAL.cycle.zMax);

    if (raw.planet && typeof raw.planet === 'object' && raw.planet.type in CA.PLANET_TYPES) {
      s.planet = {
        type: raw.planet.type,
        mass: num(raw.planet.mass, U.M_EARTH, 1e20, 1e28),
        zone: raw.planet.zone === 'outer' ? 'outer' : 'inner',
        engulfed: bool(raw.planet.engulfed),
        lostBy: raw.planet.lostBy === 'engulfed' || raw.planet.lostBy === 'ejected' ? raw.planet.lostBy : '',
      };
      if (s.planet.engulfed && !s.planet.lostBy) s.planet.lostBy = 'engulfed';
    }
    if (Array.isArray(raw.system)) {
      s.system = raw.system.slice(0, 8).filter((b) => b && typeof b === 'object').map((b, i) => ({
        type: b.type === 'moon' || b.type === 'ring' ? b.type : 'minor',
        name: typeof b.name === 'string' ? b.name.slice(0, 40) : 'Body ' + (i + 1),
        a: num(b.a, 1.5 + i * 0.4, 0.5, 6),
        e: num(b.e, 0, 0, 0.9),
      }));
    }

    const c = raw.core || {};
    s.core = { M: num(c.M, CA.BAL.jeans.M0, 0.01, 1000), T: num(c.T, CA.BAL.jeans.T0, CA.BAL.jeans.Tmin, CA.BAL.jeans.Tmax) };
    s.reservoir = num(raw.reservoir, 0, 0, 1000);

    // mass is only meaningful for mass-type stages; clamp it inside that stage's band
    if (st.type === 'mass' || st.type === 'planet') {
      s.mass = num(raw.mass, st.massStart, st.massStart, st.massCap || st.massEnd);
    } else s.mass = num(raw.mass, 1e-10, 1e-20, 1e30);

    // stellar stages need a star
    if (st.chapter >= 3 || raw.star) {
      const t = raw.star || {};
      if (!raw.star && st.chapter >= 3) w.push('star data missing — rebuilt with defaults');
      const M0 = num(t.M0, 1, CA.BAL.star.minMass, CA.BAL.star.maxMass);
      s.star = {
        M0, M: num(t.M, M0, 0.05, M0),
        Tc: num(t.Tc, 1, 0, 50), fuel: num(t.fuel, 1, 0, 1),
        pg: num(t.pg, 1, 0.2, 2), comp: num(t.comp, 1, 0.6, 1.6),
        wind: bool(t.wind), burn: int(t.burn, 0, 0, 6), age: num(t.age, 0, 0, 1e12),
        flash: bool(t.flash), wr: bool(t.wr), ignited: bool(t.ignited) || st.index >= CA.STAGE.mainseq.index,
        pulsePhase: num(t.pulsePhase, 0, 0, 1e9), rg: num(t.rg, 1, 1, 2000),
      };
      if (st.id === 'protostar' && s.star.ignited) s.star.ignited = false;
      if (t.fate && (t.fate.type === 'ns' || t.fate.type === 'bh')) {
        s.star.fate = { type: t.fate.type, mass: num(t.fate.mass, 1.4, 0.5, 500), sn: bool(t.fate.sn) };
      } else if (st.id === 'supernova' && CA.Evo) s.star.fate = CA.Evo.Star.collapse(s.star.M);
    }
    if (st.type === 'remnant') {
      const t = raw.remnant || {};
      const type = st.kind;
      if (!raw.remnant || raw.remnant.type !== type) w.push('remnant data rebuilt');
      s.remnant = CA.Evo ? CA.Evo.makeRemnant(type, num(t.mass, type === 'wd' ? 0.6 : type === 'ns' ? 1.4 : 10, 0.1, 500), s) : { type };
      if (raw.remnant && raw.remnant.type === type) {
        s.remnant.age = num(t.age, 0, 0, 1e12);
        s.remnant.T = num(t.T, s.remnant.T || 0, 0, 1e6);
        s.remnant.P = num(t.P, s.remnant.P || 0, 0, 100);
        s.remnant.streak = int(t.streak, 0, 0, 1e6);
        s.remnant.best = int(t.best, 0, 0, 1e6);
        s.remnant.crystal = bool(t.crystal);
        s.remnant.polluted = bool(t.polluted);
        s.remnant.helium = bool(t.helium);
        s.remnant.lastBeam = int(t.lastBeam, -1, -1, 1e9);
        s.remnant.accr = num(t.accr, 0, 0, 1000);
        if (type === 'ns') { s.remnant.B = num(t.B, 1e12, 1e8, 1e16); s.remnant.magnetar = bool(t.magnetar); s.remnant.msp = bool(t.msp); }
      }
    }

    s.companion = validCompanion(raw.companion);
    s.origins = boolMap(raw.origins, (k) => CA.Binary.ORIGINS.includes(k));
    s.ended = bool(raw.ended);
    if (st.id === 'inspiral' || st.id === 'merger') { // nothing is paid until the merger, so a chirp in progress simply restarts
      const c = raw.chirp || {}, a = validCompanion(c.a), b = validCompanion(c.b);
      if (!a || !b) w.push('binary data rebuilt');
      s.chirp = CA.Binary.newChirp(a || { type: 'wd', mass: 0.8 }, b || { type: 'wd', mass: 0.8 });
      if (st.id === 'merger') s.chirp.out = CA.Binary.outcome(s.chirp.a, s.chirp.b); else s.stageTime = 0;
    }

    s.swarmT = num(raw.swarmT, 0, 0, 100);
    s.swarmDone = bool(raw.swarmDone);
    const cd = raw.cd || {};
    for (const k in CA.ABILITIES) { const v = num(cd[k], 0, 0, 120); if (v) s.cd[k] = v; }
    const fx = raw.fx || {};
    s.fx = { boost: num(fx.boost, 0, 0, 60), damp: num(fx.damp, 0, 0, 60) };
    if (Array.isArray(raw.buffs)) {
      s.buffs = raw.buffs.slice(0, 10).filter((b) => b && typeof b.id === 'string' && typeof b.key === 'string')
        .map((b) => ({ id: b.id.slice(0, 40), key: b.key.slice(0, 20), mult: num(b.mult, 1, 1, 3), t: num(b.t, 0, 0, 3600), name: String(b.name || '').slice(0, 40) }));
    }
    // cosmic events: cooldowns and counters persist; an event in progress is not restored
    // (its motes are gone after a reload, and it had not paid out yet, so nothing is lost or duplicated)
    const ev = raw.ev || {}, EV = CA.EVENT || {};
    s.ev.seq = int(ev.seq, 0, 0, 1e12);
    s.ev.gcd = Math.max(CA.BAL.events.loadDelay, num(ev.gcd, CA.BAL.events.firstDelay, 0, 3600));
    for (const k in EV) {
      const c = num(ev.cd && ev.cd[k], 0, 0, 3600); if (c) s.ev.cd[k] = c;
      const n = int(ev.count && ev.count[k], 0, 0, 1e7); if (n) s.ev.count[k] = n;
      const w = int(ev.won && ev.won[k], 0, 0, 1e7); if (w) s.ev.won[k] = w;
    }
    const mg = raw.mg || {};
    for (const id of S.MG_IDS) {
      const m = mg[id] || {};
      s.mg[id] = { cleared: int(m.cleared, 0, 0, 5), plays: int(m.plays, 0, 0, 1e7), best: {} };
      if (m.best && typeof m.best === 'object') for (let l = 1; l <= 5; l++) { const v = num(m.best[l], 0, 0, 1e7); if (v) s.mg[id].best[l] = Math.round(v); }
    }
    const stt = raw.stats || {};
    for (const k of Object.keys(s.stats)) s.stats[k] = num(stt[k], 0, 0, 1e300);
    if (Array.isArray(raw.history)) s.history = raw.history.slice(-20).filter((h) => h && typeof h === 'object').map((h) => ({
      cycle: int(h.cycle, 1, 1, 1e6), starMass: num(h.starMass, 0, 0, 200), remnant: String(h.remnant || '').slice(0, 20), planet: String(h.planet || '').slice(0, 20),
    }));
    const at = raw.atlas && typeof raw.atlas === 'object' ? raw.atlas : {};
    for (const e of CA.ATLAS) {
      const r = at[e.id];
      if (r && typeof r === 'object') s.atlas[e.id] = { n: int(r.n, 0, 0, 1e7), c: int(r.c, 0, 0, 1e6), v: num(r.v, 0, 0, 1e30) };
    }
    return { state: s, warnings: w };
  };

  /* Upgrade older schemas in place. Unknown future versions are rejected. */
  S.migrate = function (raw, w) {
    const v = raw.version;
    if (v === CA.BAL.saveVersion) return raw;
    if (v === undefined) { w.push('unversioned save — treated as v1'); return raw; }
    return null;
  };

  S.serialize = function (state, now = Date.now()) {
    state.lastSaved = now;
    return JSON.stringify(state);
  };

  /* storage = any object with getItem/setItem (localStorage, or a stub in tests). */
  S.save = function (state, storage, now = Date.now()) {
    try {
      const prev = storage.getItem(S.KEY);
      const data = S.serialize(state, now);
      if (prev) storage.setItem(S.BACKUP_KEY, prev);
      storage.setItem(S.KEY, data);
      return true;
    } catch (e) { return false; }
  };

  S.load = function (storage, now = Date.now()) {
    const tryKey = (key) => {
      let txt;
      try { txt = storage.getItem(key); } catch (e) { return null; }
      if (!txt) return null;
      try { return S.validate(JSON.parse(txt), now); } catch (e) { return { state: null, warnings: ['corrupted JSON'] }; }
    };
    const main = tryKey(S.KEY);
    if (main && main.state) return { state: main.state, source: 'main', warnings: main.warnings };
    const bak = tryKey(S.BACKUP_KEY);
    if (bak && bak.state) return { state: bak.state, source: 'backup', warnings: (main ? main.warnings : []).concat(['main save unreadable — restored backup']) };
    return { state: null, source: null, warnings: main ? main.warnings : [] };
  };

  S.hasSave = function (storage) {
    try { return !!storage.getItem(S.KEY) || !!storage.getItem(S.BACKUP_KEY); } catch (e) { return false; }
  };

  S.exportString = (state) => btoa(unescape(encodeURIComponent(S.serialize(state))));
  S.importString = function (str, now = Date.now()) {
    try { return S.validate(JSON.parse(decodeURIComponent(escape(atob(str.trim())))), now); }
    catch (e) { return { state: null, warnings: ['could not decode save string'] }; }
  };

  S.loadSettings = function (storage) {
    const d = S.defaultSettings();
    try {
      const raw = JSON.parse(storage.getItem(S.SETTINGS_KEY) || '{}');
      for (const k of ['master', 'ambient', 'sfx']) d[k] = num(raw[k], d[k], 0, 1);
      for (const k of ['muted', 'reducedMotion', 'reducedFlashing', 'showFps']) if (typeof raw[k] === 'boolean') d[k] = raw[k];
      if (typeof raw.tutorials === 'boolean') d.tutorials = raw.tutorials;
      if (['low', 'normal', 'high'].includes(raw.density)) d.density = raw.density;
      if (['ko', 'en'].includes(raw.lang)) d.lang = raw.lang;
      if (['auto', 'high', 'normal', 'low'].includes(raw.quality)) d.quality = raw.quality;
    } catch (e) { /* defaults */ }
    return d;
  };
  S.saveSettings = function (settings, storage) {
    try { storage.setItem(S.SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* storage full or blocked */ }
  };
})(globalThis.CA = globalThis.CA || {});
