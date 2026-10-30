/* COSMIC ASCENSION — resources, multipliers, upgrades, passive production, rewards. No DOM. */
(function (CA) {
  'use strict';
  const U = CA.U, BAL = CA.BAL;
  const E = (CA.Econ = {});
  const REMNANT_STAGES = ['whitedwarf', 'neutronstar', 'blackhole'];

  E.lvl = (s, id) => (CA.UPGRADE[id] && CA.UPGRADE[id].perm ? s.perm[id] : s.upg[id]) || 0;
  E.cost = (def, level) => Math.ceil(def.base * Math.pow(def.growth, level));

  E.unlocked = function (s, def) {
    if (def.perm) return true;
    if (def.req === 'remnant') return REMNANT_STAGES.some((id) => s.reached[id]);
    return !!s.reached[def.req];
  };

  E.canBuy = function (s, id) {
    const def = CA.UPGRADE[id];
    if (!def) return { ok: false, reason: 'unknown' };
    const l = E.lvl(s, id);
    if (!E.unlocked(s, def)) return { ok: false, reason: CA.t('econ.requires', { s: def.req === 'remnant' ? CA.t('up.aRemnant') : CA.STAGE[def.req].name }) };
    if (l >= def.max) return { ok: false, reason: CA.t('up.maxed') };
    const c = E.cost(def, l);
    if (s.res[def.res] < c) return { ok: false, reason: CA.t('econ.need', { n: U.fmt(c), res: E.RES_NAMES[def.res] }) };
    return { ok: true, cost: c };
  };

  E.buy = function (s, id) {
    const chk = E.canBuy(s, id);
    if (!chk.ok) return false;
    const def = CA.UPGRADE[id];
    s.res[def.res] -= chk.cost;
    if (s.res[def.res] < 0) s.res[def.res] = 0;
    const bag = def.perm ? s.perm : s.upg;
    bag[id] = (bag[id] || 0) + 1;
    return true;
  };

  E.RES_NAMES = { matter: 'Matter', energy: 'Energy', heavy: 'Heavy Elements', research: 'Research', remnants: 'Stellar Remnants' };

  /* ---------- buffs (temporary multipliers; same id refreshes instead of stacking) ---------- */
  E.addBuff = function (s, buff) {
    const i = s.buffs.findIndex((b) => b.id === buff.id);
    const b = { id: buff.id, key: buff.key, mult: U.clamp(buff.mult, 1, 3), t: buff.t, name: buff.name || buff.id };
    if (i >= 0) s.buffs[i] = b; else s.buffs.push(b);
  };
  E.buffMult = function (s, key) {
    let m = 1;
    for (const b of s.buffs) if (b.key === key && b.t > 0) m *= b.mult;
    return m;
  };

  E.mult = function (s, res) {
    switch (res) {
      case 'matter': return (1 + 0.1 * E.lvl(s, 'p_legacy')) * E.buffMult(s, 'matter');
      case 'research': return (1 + 0.1 * E.lvl(s, 'p_methods')) * E.buffMult(s, 'research');
      case 'energy': return (1 + 0.1 * E.lvl(s, 'p_light')) * E.buffMult(s, 'energy');
      case 'heavy': return (1 + 0.25 * E.lvl(s, 'sorting')) * (1 + 0.08 * ((s.mg.an && s.mg.an.cleared) || 0)) * E.buffMult(s, 'heavy');
      default: return 1;
    }
  };

  /* Add a resource with multipliers. opts.raw skips multipliers. Energy respects the cap. */
  E.add = function (s, res, amount, opts = {}) {
    if (!U.isNum(amount) || amount <= 0) return 0;
    const v = opts.raw ? amount : amount * E.mult(s, res);
    if (res === 'energy') {
      const cap = E.energyCap(s);
      const before = s.res.energy;
      s.res.energy = Math.max(before, Math.min(cap, before + v)); // a lower cap stops new charge; it never takes energy away
      return s.res.energy - before;
    }
    s.res[res] = Math.min(1e300, s.res[res] + v);
    if (res === 'matter') s.stats.matterTotal += v;
    return v;
  };

  E.spend = function (s, res, amount) {
    if (!U.isNum(amount) || amount < 0 || s.res[res] < amount) return false;
    s.res[res] = Math.max(0, s.res[res] - amount);
    return true;
  };

  /* One-time rewards keyed by a unique string — the guard against duplicated payouts. */
  E.grantOnce = function (s, key, rewards) {
    if (s.granted[key]) return null;
    s.granted[key] = true;
    const out = {};
    for (const r in rewards) out[r] = E.add(s, r, rewards[r], { raw: r === 'remnants' });
    return out;
  };

  E.energyCap = function (s) {
    const base = BAL.energy.cap + BAL.energy.capPerLvl * E.lvl(s, 'capacitor');
    const star = CA.Evo ? CA.Evo.energyProduction(s) : 0;
    return Math.max(base, star * BAL.energy.starCapSeconds, CA.STAGE[s.stage].chapter >= 4 ? BAL.energy.lateCap : 0);
  };
  E.energyRegen = (s) => (BAL.energy.regen + BAL.energy.regenPerLvl * E.lvl(s, 'regen'));

  /* Passive production per second (before multipliers for display = after; see rates). */
  E.rates = function (s) {
    const st = CA.STAGE[s.stage];
    const r = { matter: 0, energy: 0, heavy: 0, research: 0, remnants: 0, growth: 0 };
    const coag = E.lvl(s, 'coagulation');
    r.matter += coag * BAL.passive.matterPerLvl * st.matterValue;
    if (st.type === 'mass' || st.type === 'planet') r.growth = coag * BAL.passive.growthPerLvl;
    r.energy += E.energyRegen(s);
    if (s.planet && !s.planet.engulfed) {
      const p = CA.PLANET_TYPES[s.planet.type];
      r.heavy += p.heavy; r.research += p.research; r.matter += p.matterFrac * st.matterValue; r.energy += p.energy;
    }
    for (const b of s.system) { r.research += b.type === 'moon' ? 0.06 : b.type === 'ring' ? 0.05 : 0.04; r.matter += 0.02 * st.matterValue; }
    const obs = E.lvl(s, 'observatory');
    if (obs && ((s.planet && !s.planet.engulfed) || s.system.length)) r.research += 0.15 * obs;
    r.research += 0.1 * E.lvl(s, 'survey');
    if (CA.Evo) {
      const ev = CA.Evo.passive(s);
      for (const k in ev) r[k] += ev[k];
    }
    // apply multipliers so the HUD shows what is actually gained
    for (const k of ['matter', 'energy', 'heavy', 'research']) r[k] *= E.mult(s, k);
    return r;
  };

  E.tick = function (s, dt) {
    const r = E.rates(s);
    for (const k of ['matter', 'heavy', 'research']) if (r[k] > 0) E.add(s, k, r[k] * dt, { raw: true });
    if (r.energy > 0) E.add(s, 'energy', r.energy * dt, { raw: true });
    if (r.remnants > 0) E.add(s, 'remnants', r.remnants * dt, { raw: true });
    for (const b of s.buffs) b.t -= dt;
    s.buffs = s.buffs.filter((b) => b.t > 0);
    for (const k in s.cd) { s.cd[k] -= dt; if (s.cd[k] <= 0) delete s.cd[k]; }
    s.fx.boost = Math.max(0, s.fx.boost - dt);
    s.fx.damp = Math.max(0, s.fx.damp - dt);
    return r;
  };

  /* Offline progress: passive resources only, capped, at reduced efficiency.
     Stage transitions and stellar evolution do NOT advance offline (protects progression). */
  E.offline = function (s, seconds) {
    const deep = E.lvl(s, 'p_deep');
    const cap = (BAL.offline.maxHours + BAL.offline.hoursPerLvl * deep) * 3600;
    const eff = BAL.offline.efficiency + BAL.offline.effPerLvl * deep;
    const t = U.clamp(seconds, 0, cap);
    if (t < 60) return null;
    const r = E.rates(s);
    const before = Object.assign({}, s.res), massBefore = s.mass;
    for (const k of ['matter', 'heavy', 'research']) E.add(s, k, r[k] * t * eff, { raw: true });
    E.add(s, 'energy', r.energy * t, { raw: true });
    const st = CA.STAGE[s.stage];
    if (r.growth > 0 && (st.type === 'mass' || st.type === 'planet')) {
      const top = st.type === 'planet' ? st.massCap : st.massEnd * 0.999; // never auto-complete a stage offline
      s.mass = Math.min(top, s.mass * Math.exp(r.growth * t * eff));
    }
    return {
      seconds: t, capped: seconds > cap, eff,
      gained: { matter: s.res.matter - before.matter, heavy: s.res.heavy - before.heavy, research: s.res.research - before.research },
      massGain: s.mass / massBefore,
    };
  };
})(globalThis.CA = globalThis.CA || {});
