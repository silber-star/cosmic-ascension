/* COSMIC ASCENSION — achievements and the player's atlas records: pure rules on the state.
   Data: js/data/achievements.js, js/data/atlas.js. Numbers: BAL.ach. See SCIENCE.md. No DOM. */
(function (CA) {
  'use strict';
  const U = CA.U;
  const Ach = (CA.Ach = {}), Atlas = (CA.Atlas = {});

  /* ---------------- achievements ---------------- */
  Ach.CATS = ['evolution', 'minigame', 'event', 'discovery', 'endgame', 'hidden'];
  Ach.key = (id) => 'ach:' + id;
  Ach.earned = (s, id) => !!s.granted[Ach.key(id)]; // s.granted survives new cycles, so nothing else needs saving
  Ach.met = (s, a) => (a.count ? a.count(s) >= a.of : !!a.test(s));
  Ach.reward = (a) => CA.BAL.ach.reward[a.tier];
  Ach.progress = (s, a) => (a.count ? [Math.min(a.of, Math.floor(a.count(s))), a.of] : null);
  Ach.total = (s) => CA.ACHIEVEMENTS.filter((a) => Ach.earned(s, a.id)).length;

  // Pays every newly met achievement once. An old save earns what it already deserves on its first check.
  Ach.check = function (s) {
    const got = [];
    for (const a of CA.ACHIEVEMENTS) {
      if (Ach.earned(s, a.id) || !Ach.met(s, a)) continue;
      got.push({ type: 'achievement', id: a.id, rewards: CA.Econ.grantOnce(s, Ach.key(a.id), { research: Ach.reward(a) }) });
    }
    return got;
  };

  /* ---------------- atlas ---------------- */
  Atlas.GROUPS = ['small', 'star', 'death', 'remnant', 'binary'];
  Atlas.found = (s, e) => !!s.discovered[e.disc];
  Atlas.total = (s) => CA.ATLAS.filter((e) => Atlas.found(s, e)).length;
  Atlas.hint = (e) => e.hint || CA.DISCOVERY[e.disc].hint;

  // One sighting per cycle. r.v keeps the best number so far (the largest, or the smallest when e.best is 'lo').
  Atlas.note = function (s, id, v) {
    const e = CA.ATLAS_BY[id];
    if (!e) return;
    const r = s.atlas[id] || (s.atlas[id] = { n: 0, c: 0, v: 0 });
    if (r.c !== s.cycle) { r.c = s.cycle; r.n++; }
    if (U.isNum(v)) r.v = r.v === 0 ? v : e.best === 'lo' ? Math.min(r.v, v) : Math.max(r.v, v);
  };
  Atlas.track = function (s) {
    for (const e of CA.ATLAS) {
      const v = e.now ? e.now(s) : null;
      if (v !== null) Atlas.note(s, e.id, v);
    }
  };
  Atlas.fmt = function (e, v) {
    switch (e.unit) {
      case 'msun': return U.fmtMsun(v);
      case 'mearth': return v.toFixed(1) + ' M⊕';
      case 'rsun': return Math.round(v) + ' R☉';
      case 'ms': return v.toFixed(1) + ' ms';
      case 'count': return String(Math.round(v));
      default: return v.toFixed(1);
    }
  };
})(globalThis.CA = globalThis.CA || {});
