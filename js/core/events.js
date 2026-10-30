/* COSMIC ASCENSION — dynamic cosmic events: triggering, timing, responses and one-time outcomes.
   Data lives in js/data/events.js. No DOM: positions are in body radii or normalized units, so all rules
   are testable headless. Guarantees:
   - an event starts only in its listed stages (and when(s) holds), after BAL.events.minStageTime,
     outside its own cooldown and the global cooldown;
   - it never changes the stage; losses are clamped (energy, or a small share of the stage's mass range);
   - each instance resolves once and pays out once (its uid is the Econ.grantOnce key). */
(function (CA) {
  'use strict';
  const U = CA.U, BAL = CA.BAL;
  const Ev = (CA.Events = {});
  const EB = () => BAL.events;
  const Econ = () => CA.Econ, Evo = () => CA.Evo;

  Ev.newState = () => ({ active: null, cd: {}, gcd: EB().firstDelay, seq: 0, idle: 0, count: {}, won: {} });
  function st(s) { if (!s.ev) s.ev = Ev.newState(); return s.ev; }
  Ev.active = (s) => (s.ev && s.ev.active) || null;
  Ev.duration = (def) => (def.mode === 'front' ? (def.f1 - def.f0) / def.speed : def.dur);

  /* ---------------- triggering ---------------- */
  Ev.canStart = function (s, id, force) {
    const def = CA.EVENT[id], E = st(s);
    if (!def) return { ok: false, reason: 'unknown event' };
    if (!def.stages.includes(s.stage)) return { ok: false, reason: 'not in this stage' };
    if (def.when && !def.when(s)) return { ok: false, reason: 'conditions not met' };
    if (E.active) return { ok: false, reason: 'another event is running' };
    if (!force) {
      if (s.stageTime < (def.minStageTime || EB().minStageTime)) return { ok: false, reason: 'stage just began' };
      if (E.cd[id] > 0) return { ok: false, reason: 'cooling down' };
    }
    return { ok: true };
  };
  Ev.eligible = (s) => CA.EVENTS.filter((d) => Ev.canStart(s, d.id).ok);

  /* Start an event now. opts.force skips timing and cooldowns, never the stage/science conditions. */
  Ev.start = function (s, id, opts = {}) {
    if (!Ev.canStart(s, id, opts.force).ok) return [];
    const E = st(s), rand = opts.rand || Math.random;
    E.seq++;
    E.active = {
      id, uid: 'ev:' + s.cycle + ':' + E.seq, t: 0, phase: 'warn', angle: rand() * U.TAU,
      spawnAcc: 0, spawned: 0, caught: 0, wasted: 0, intact: 0, broken: 0, hits: 0, misses: 0, amp: 1, osc: 0, front: 0, goal: false,
    };
    E.count[id] = (E.count[id] || 0) + 1;
    E.idle = 0;
    return [{ type: 'ev_start', id, uid: E.active.uid }];
  };

  /* Per-tick update. ctx.rand can be injected for deterministic tests. Returns events for FX/UI. */
  Ev.tick = function (s, dt, ctx = {}) {
    const E = st(s), out = [];
    E.gcd = Math.max(0, E.gcd - dt);
    for (const k in E.cd) { E.cd[k] -= dt; if (E.cd[k] <= 0) delete E.cd[k]; }
    if (E.active) { step(s, E.active, dt, out); return out; }
    if (E.gcd > 0) return out;
    const list = Ev.eligible(s);
    if (!list.length) return out;
    E.idle += dt;
    const rand = ctx.rand || Math.random;
    // Poisson trigger, plus a pity timer so long sessions always see events
    if (E.idle >= EB().maxGap || rand() < 1 - Math.exp(-EB().rate * dt)) {
      const w = {};
      for (const d of list) w[d.id] = (d.weight || 1) / (1 + 0.5 * Math.min(4, E.count[d.id] || 0)); // favour the unfamiliar
      out.push(...Ev.start(s, U.weighted(w, rand()), { rand }));
    }
    return out;
  };

  function step(s, a, dt, out) {
    const def = CA.EVENT[a.id];
    if (!def || !def.stages.includes(s.stage)) { finish(s, a, 'faded', out); return; } // stage changed: no reward, no loss
    a.t += dt;
    if (a.phase === 'warn') {
      if (a.t < def.warn) return;
      a.phase = 'active';
      out.push({ type: 'ev_active', id: a.id, uid: a.uid });
      if (def.onActive && def.onActive.buff && !s.granted[a.uid + ':on']) { s.granted[a.uid + ':on'] = true; Econ().addBuff(s, def.onActive.buff); }
      if (def.mode === 'impactor') a.spawnAcc = 1;
    }
    const at = a.t - def.warn, dur = Ev.duration(def);
    switch (def.mode) {
      case 'catch':
        if (at >= def.spawnDur) a.spawnAcc = def.count - a.spawned; // flush rounding
        else a.spawnAcc = Math.min(def.count - a.spawned, a.spawnAcc + (def.count / def.spawnDur) * dt);
        if (at >= dur) finish(s, a, a.caught >= def.target ? 'success' : 'fail', out);
        break;
      case 'impactor':
        if (at >= dur) finish(s, a, 'deflected', out);
        break;
      case 'calm':
        if (at >= dur) finish(s, a, Ev.calmScore(a, def) >= def.target ? 'success' : 'fail', out);
        break;
      case 'front':
        a.front = Ev.front(a, def);
        if (a.front >= def.f1) finish(s, a, def.timeout, out);
        break;
      case 'pulsation':
        a.osc = (U.TAU * at) / def.period;
        if (s.stage === 'mainseq' && s.star) s.star.pg = U.clamp(s.star.pg + def.pgPush * a.amp * Math.cos(a.osc) * dt, 0.4, 1.8);
        if (at >= dur) finish(s, a, 'fail', out);
        break;
    }
  }

  /* ---------------- geometry helpers (normalized) ---------------- */
  Ev.front = (a, def) => def.f0 + def.speed * Math.max(0, a.t - def.warn); // body radii
  Ev.inWindow = (a, def) => { const f = Ev.front(a, def); return a.phase === 'active' && f >= def.win[0] && f <= def.win[1]; };
  Ev.atPeak = (a, def) => a.phase === 'active' && Math.sin(a.osc) >= def.window;
  Ev.calmScore = (a, def) => a.intact - def.brokenCost * a.broken;
  Ev.radiusMult = function (s) {
    const a = Ev.active(s);
    if (!a || a.phase !== 'active') return 1;
    const def = CA.EVENT[a.id];
    return def.mode === 'pulsation' ? 1 + def.radAmp * a.amp * Math.sin(a.osc) : 1;
  };

  /* Number of tagged motes the game should spawn now (each is handed out once). */
  Ev.drainSpawns = function (s) {
    const a = Ev.active(s);
    if (!a || a.phase !== 'active') return 0;
    const n = Math.floor(a.spawnAcc + 1e-9);
    a.spawnAcc -= n; a.spawned += n;
    return n;
  };

  /* ---------------- interactions reported by the game ---------------- */
  // A tagged mote was absorbed (by the body, or grabbed by the well).
  Ev.onCatch = function (s, uid, info = {}) {
    const a = Ev.active(s);
    if (!a || a.uid !== uid || a.phase !== 'active') return null;
    const def = CA.EVENT[a.id];
    if (def.mode !== 'catch') return null;
    if (def.catchBy === 'well' && !info.grabbed) return { counted: false, events: [] };
    if (def.countIf === 'subEddington' && s.remnant && s.remnant.accr > Evo().eddington(s)) { a.wasted++; return { counted: false, wasted: true, events: [] }; }
    a.caught++;
    const events = [];
    if (!a.goal && a.caught >= def.target) { a.goal = true; events.push({ type: 'ev_goal', id: a.id, uid }); }
    return { counted: true, caught: a.caught, target: def.target, events };
  };

  // Any absorption during a calm-mode event: intact (+1) or shattered (−brokenCost).
  Ev.onAbsorb = function (s, frac, type) {
    const a = Ev.active(s);
    if (!a || a.phase !== 'active' || CA.EVENT[a.id].mode !== 'calm' || type === 'spark' || type === 'anomaly') return;
    if (frac >= 0.92) a.intact++; else a.broken++;
  };

  function impactorOutcome(s, uid, outcome) {
    const a = Ev.active(s);
    if (!a || a.uid !== uid || a.phase !== 'active' || CA.EVENT[a.id].mode !== 'impactor') return null;
    const out = [];
    finish(s, a, outcome, out);
    return out;
  }
  Ev.onImpact = (s, uid, speed, safeSpeed) => impactorOutcome(s, uid, speed > safeSpeed ? 'shattered' : 'merged');
  // dist = capture distance in body radii: inside the event's Roche limit the body is torn into a ring
  Ev.onOrbit = (s, uid, dist) => { const a = Ev.active(s), def = a && CA.EVENT[a.id]; return impactorOutcome(s, uid, def && def.roche && dist < def.roche ? 'ring' : 'captured'); };
  Ev.onLost = (s, uid) => impactorOutcome(s, uid, 'deflected');

  /* The player used an ability. Returns null if it does not concern the running event. */
  Ev.respond = function (s, ability) {
    const a = Ev.active(s);
    if (!a) return null;
    const def = CA.EVENT[a.id];
    if (def.respond !== ability) return null;
    const out = [];
    if (def.mode === 'front') {
      const f = Ev.front(a, def);
      if (a.phase === 'active' && f >= def.win[0] && f <= def.win[1]) { a.hits++; finish(s, a, 'success', out); return { good: true, text: CA.t('evr.perfect'), events: out }; }
      a.misses++;
      return { good: false, text: CA.t(f < def.win[0] || a.phase === 'warn' ? 'evr.early' : 'evr.late'), events: out };
    }
    if (def.mode === 'pulsation') {
      if (Ev.atPeak(a, def)) {
        a.hits++; a.amp *= 0.45;
        if (a.hits >= def.hitsNeeded) finish(s, a, 'success', out);
        return { good: true, text: CA.t('evr.damped', { h: a.hits, n: def.hitsNeeded }), events: out };
      }
      a.misses++; a.amp = Math.min(1.4, a.amp * 1.15);
      return { good: false, text: CA.t('evr.grew'), events: out };
    }
    return null;
  };

  /* ---------------- resolution (exactly once per instance) ---------------- */
  function finish(s, a, outcome, out) {
    const E = st(s), def = CA.EVENT[a.id];
    if (E.active === a) E.active = null;
    if (a.done) return;
    a.done = true;
    E.cd[a.id] = def ? def.cooldown : 60;
    E.gcd = Math.max(E.gcd, EB().globalCd);
    E.idle = 0;
    const spec = (def && def.outcomes[outcome]) || {};
    const res = { type: 'ev_end', id: a.id, uid: a.uid, outcome, good: !!spec.good, text: spec.text || '', rewards: null, effect: null, fx: spec.fx || null };
    const rw = Econ().grantOnce(s, a.uid, outcome === 'faded' ? {} : scaleReward(s, spec.reward));
    if (!rw) { res.duplicate = true; res.text = ''; out.push(res); return; } // already resolved earlier: nothing paid again
    if (Object.keys(rw).length) res.rewards = rw;
    if (spec.buff) Econ().addBuff(s, spec.buff);
    if (spec.effect) res.effect = applyEffect(s, spec);
    if (spec.good) E.won[a.id] = (E.won[a.id] || 0) + 1;
    out.push(res);
    if (spec.discovery) out.push(...Evo().discover(s, spec.discovery));
    prune(s);
  }

  // motes → matter worth that many motes of the current stage; everything else is a fixed amount
  function scaleReward(s, r) {
    const out = {};
    if (r) for (const k in r) {
      if (k === 'motes') out.matter = (out.matter || 0) + r.motes * CA.STAGE[s.stage].matterValue;
      else out[k] = (out[k] || 0) + r[k];
    }
    return out;
  }
  Ev.rewardPreview = (s, id, outcome) => scaleReward(s, (CA.EVENT[id].outcomes[outcome] || {}).reward);

  function applyEffect(s, spec) {
    const d = CA.STAGE[s.stage];
    switch (spec.effect) {
      case 'progress': { // ± share of the stage's logarithmic mass range; never below the stage start, never above its cap
        if (d.type !== 'mass' && d.type !== 'planet') return null;
        const before = s.mass, cap = d.type === 'planet' ? d.massCap : d.massEnd;
        s.mass = U.clamp(s.mass * Math.pow(d.massEnd / d.massStart, spec.amount), d.massStart, cap);
        if (spec.amount > 0) s.mass = Math.max(s.mass, before);
        return { kind: 'progress', ratio: s.mass / before };
      }
      case 'moon': {
        if (s.system.length >= 8) return { kind: 'moon', added: false };
        const n = s.system.filter((b) => b.type === 'moon').length + 1;
        s.system.push({ type: 'moon', name: 'Captured Moon ' + n, a: U.clamp(1.2 + 0.35 * s.system.length, 0.5, 6), e: 0.15 });
        return { kind: 'moon', added: true };
      }
      case 'ring': { // one ring per system
        if (s.system.some((b) => b.type === 'ring') || s.system.length >= 8) return { kind: 'ring', added: false };
        s.system.push({ type: 'ring', name: 'Ring', a: 0.5, e: 0 });
        return { kind: 'ring', added: true };
      }
      case 'compress':
        if (!s.core) return null;
        s.core.M = Math.min(1000, s.core.M * (1 + spec.amount));
        if (spec.heat) s.core.T = U.clamp(s.core.T + spec.heat, BAL.jeans.Tmin, BAL.jeans.Tmax);
        return { kind: 'compress' };
      case 'drain': {
        const lost = s.res.energy * spec.amount;
        s.res.energy = Math.max(0, s.res.energy - lost);
        return { kind: 'drain', lost };
      }
    }
    return null;
  }

  // per-instance grant keys are unique forever (cycle + monotonic seq), so old ones can be dropped
  function prune(s) {
    const keys = Object.keys(s.granted).filter((k) => k.startsWith('ev:'));
    if (keys.length > EB().keepKeys) keys.slice(0, keys.length - EB().keepKeys).forEach((k) => delete s.granted[k]);
  }

  /* ---------------- status line for the HUD ---------------- */
  Ev.status = function (s) {
    const a = Ev.active(s);
    if (!a) return null;
    const def = CA.EVENT[a.id], dur = Ev.duration(def), at = a.t - def.warn;
    const r = { id: a.id, name: def.name, phase: a.phase, how: def.how, alert: false, progress: '' };
    if (a.phase === 'warn') {
      r.left = Math.max(0, def.warn - a.t); r.frac = U.clamp(a.t / def.warn, 0, 1);
      r.phaseText = CA.t('evs.incoming', { s: Math.ceil(r.left) }); r.progress = def.warnText;
      return r;
    }
    r.left = Math.max(0, dur - at); r.frac = U.clamp(at / dur, 0, 1); r.phaseText = CA.t('evs.left', { s: Math.ceil(r.left) });
    switch (def.mode) {
      case 'catch': r.progress = CA.t(def.countIf === 'subEddington' ? 'evs.fed' : 'evs.caught', { c: a.caught, t: def.target }) + (a.wasted ? CA.t('evs.wasted', { n: a.wasted }) : ''); break;
      case 'impactor': r.progress = CA.t('evs.impactor'); break;
      case 'calm': r.progress = CA.t('evs.calm', { s: Ev.calmScore(a, def), t: def.target, i: a.intact, b: a.broken }); break;
      case 'front': {
        const f = Ev.front(a, def);
        r.alert = f >= def.win[0] && f <= def.win[1];
        r.progress = CA.t(r.alert ? 'evs.inWin' : f < def.win[0] ? 'evs.approach' : 'evs.past');
        break;
      }
      case 'pulsation':
        r.alert = Ev.atPeak(a, def);
        r.progress = CA.t('evs.damped', { h: a.hits, n: def.hitsNeeded, a: Math.round(a.amp * 100) }) + (r.alert ? CA.t('evs.stabNow') : '');
        break;
    }
    return r;
  };
})(globalThis.CA = globalThis.CA || {});
