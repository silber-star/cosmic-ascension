/* COSMIC ASCENSION — evolution rules: stage progress, validated transitions, simplified stellar physics.
   All progression-critical rules are deterministic. See SCIENCE.md for the simplifications. No DOM. */
(function (CA) {
  'use strict';
  const U = CA.U, BAL = CA.BAL, SB = CA.BAL.star;
  const Evo = (CA.Evo = {});
  const Econ = () => CA.Econ, Bin = () => CA.Binary;

  /* ---------------- simplified stellar physics ---------------- */
  const Star = (Evo.Star = {});
  // Textbook piecewise mass–luminosity relation (L☉, M☉).
  Star.L = (M) => (M < 0.43 ? 0.23 * Math.pow(M, 2.3) : M < 2 ? Math.pow(M, 4) : M < 55 ? 1.4 * Math.pow(M, 3.5) : 32000 * M);
  Star.R = (M) => (M < 1 ? Math.pow(M, 0.8) : Math.pow(M, 0.57)); // R☉
  Star.Teff = (M) => 5772 * Math.pow(Star.L(M) / Math.pow(Star.R(M), 2), 0.25);
  Star.lifetimeYr = (M) => 1e10 * M / Star.L(M);
  Star.msSeconds = (M) => U.clamp(SB.msBaseSeconds * Math.pow(Star.lifetimeYr(M) / 1e10, 0.25), SB.msMin, SB.msMax);
  Star.spectral = (T) => (T >= 30000 ? 'O' : T >= 10000 ? 'B' : T >= 7500 ? 'A' : T >= 6000 ? 'F' : T >= 5200 ? 'G' : T >= 3700 ? 'K' : 'M');
  // Initial–final mass relation for white dwarfs (linear fit, e.g. Kalirai et al. 2008), capped below Chandrasekhar.
  Star.wdMass = (M0) => (M0 < SB.lowMassLimit ? Math.min(0.45, M0 * 0.95) : Math.min(1.35, 0.109 * M0 + 0.394));
  // Core-collapse outcome from the pre-collapse mass. "compactness" is a toy stand-in for the real,
  // non-monotonic explodability found in simulations (islands of black-hole formation).
  Star.compactness = (Mf) => 0.12 + 0.012 * (Mf - 8) + 0.05 * Math.sin(Mf * 1.7);
  Star.collapse = function (Mf) {
    if (Mf >= SB.directCollapse) return { type: 'bh', mass: 0.8 * Mf, sn: false };
    if (Star.compactness(Mf) > 0.25) return { type: 'bh', mass: Math.min(0.9 * Mf, 0.35 * Mf + 1.5), sn: true };
    return { type: 'ns', mass: U.clamp(1.2 + 0.035 * (Mf - 8), 1.2, 2.1), sn: true };
  };
  Star.windBase = (M, Z) => 0.0015 * Math.pow(Z / 0.014, 0.7) * Math.pow(M / 20, 0.8); // fraction of mass per game second
  Star.windOn = 0.006;
  Star.SG_BURNS = [
    { name: 'Helium', dur: 30, real: '~1 million yr' },
    { name: 'Carbon', dur: 16, real: '~1,000 yr' },
    { name: 'Neon', dur: 10, real: '~1 yr' },
    { name: 'Oxygen', dur: 8, real: '~1 yr' },
    { name: 'Silicon', dur: 7, real: '~1 day' },
  ];

  /* Fate preview from initial mass (and projected final mass for massive stars). */
  Star.predict = function (M0, Z, Mf) {
    if (M0 < SB.lowMassLimit) return { type: 'wd', mass: Star.wdMass(M0), label: CA.t('fate.heWd'), path: CA.t('fate.heWdPath') };
    if (M0 < SB.ccLimit) return { type: 'wd', mass: Star.wdMass(M0), label: CA.t('fate.wd', { m: U.fmtMsun(Star.wdMass(M0)) }), path: CA.t('fate.wdPath') };
    const mf = Mf !== undefined ? Mf : M0 * (1 - Star.windBase(M0, Z) * 71);
    const c = Star.collapse(mf);
    const near = Math.abs(Star.compactness(mf) - 0.25) < 0.04 || Math.abs(mf - SB.directCollapse) < 3;
    return {
      type: c.type, mass: c.mass, sn: c.sn, uncertain: near,
      label: CA.t(c.type === 'ns' ? 'fate.ns' : c.sn ? 'fate.bhSn' : 'fate.bhDirect', { m: U.fmtMsun(c.mass) }) + (near ? CA.t('fate.uncertain') : ''),
      path: CA.t('fate.sgPath', { sn: CA.t(c.sn ? 'fate.snStep' : 'fate.noSn'), end: CA.t(c.type === 'ns' ? 'fate.nsEnd' : 'fate.bhEnd') }),
    };
  };

  // Jeans mass in M☉: order-of-magnitude form M_J ≈ 1 M☉ (T/10 K)^1.5 (n/1e4 cm^-3)^-0.5
  Evo.jeansMass = (T, n) => Math.pow(T / 10, 1.5) * Math.pow(n / 1e4, -0.5);
  Evo.coreDensity = (s) => BAL.jeans.n0 * (s.core.M / BAL.jeans.M0);
  Evo.coreJeans = (s) => Evo.jeansMass(s.core.T, Evo.coreDensity(s));
  Evo.starMassFromCore = (s) => U.clamp(s.core.M * SB.sfe, SB.minMass, SB.maxMass);

  Evo.def = (s) => CA.STAGE[s.stage];

  /* ---------------- progress & transitions ---------------- */
  Evo.progress = function (s) {
    const d = Evo.def(s);
    switch (d.type) {
      case 'mass': case 'planet':
        return U.clamp(Math.log(s.mass / d.massStart) / Math.log(d.massEnd / d.massStart), 0, 1);
      case 'jeans': return U.clamp(s.core.M / Evo.coreJeans(s), 0, 1);
      case 'protostar': return U.clamp(s.star.Tc / SB.igniteTc, 0, 1);
      case 'mainseq': return U.clamp(1 - s.star.fuel, 0, 1);
      case 'timed': return U.clamp(s.stageTime / d.duration, 0, 1);
      case 'remnant': return U.clamp(s.stageTime / 20, 0, 1);
      case 'inspiral': return U.clamp(s.stageTime / s.chirp.T, 0, 1);
    }
    return 0;
  };

  /* Can the current stage be left? manual = player must press a button. */
  Evo.canAdvance = function (s) {
    const d = Evo.def(s);
    switch (d.type) {
      case 'mass':
        if (s.mass < d.massEnd * 0.9999) return { ok: false, reason: CA.t('adv.grow', { m: U.fmtMass(d.massEnd) }) };
        if (d.swarm && !s.swarmDone) return { ok: false, reason: CA.t('adv.swarm') };
        if (d.zoneChoice && !s.zone) return { ok: false, reason: CA.t('adv.zone') };
        return { ok: true, manual: false };
      case 'planet':
        if (s.mass < d.massEnd * 0.9999) return { ok: false, reason: CA.t('adv.reach1') };
        return { ok: true, manual: true, label: CA.t('btn.finalize') };
      case 'jeans':
        if (s.core.M < Evo.coreJeans(s)) return { ok: false, reason: CA.t('adv.belowJeans') };
        return { ok: true, manual: true, label: CA.t('btn.collapse') };
      case 'protostar':
        if (s.star.Tc < SB.igniteTc) return { ok: false, reason: CA.t('adv.core10') };
        return { ok: true, manual: true, label: CA.t('btn.ignite') };
      case 'mainseq':
        return s.star.fuel <= 0 ? { ok: true, manual: false } : { ok: false, reason: CA.t('adv.coreH') };
      case 'timed':
        return s.stageTime >= d.duration ? { ok: true, manual: false } : { ok: false, reason: CA.t('adv.phase') };
      case 'remnant':
        if (s.companion && d.next.length) return { ok: true, manual: true, label: CA.t('btn.inspiral') };
        return { ok: false, reason: CA.t('adv.final') };
      case 'inspiral':
        return s.stageTime >= Bin().endT(s.chirp) ? { ok: true, manual: false } : { ok: false, reason: CA.t('adv.phase') };
    }
    return { ok: false, reason: '?' };
  };

  /* The single deterministic successor of the current stage. */
  Evo.nextId = function (s) {
    const d = Evo.def(s);
    if (!d.next.length) return null;
    if (d.id === 'mainseq') return s.star.M0 < SB.lowMassLimit ? 'whitedwarf' : s.star.M0 < SB.ccLimit ? 'redgiant' : 'supergiant';
    if (d.id === 'supergiant') return Star.collapse(s.star.M).sn ? 'supernova' : 'blackhole';
    if (d.id === 'supernova') return s.star.fate && s.star.fate.type === 'bh' ? 'blackhole' : 'neutronstar';
    if (d.id === 'inspiral') return Bin().nextStage(s.chirp);
    if (d.id === 'merger') return Bin().STAGE_OF[Bin().outcome(s.chirp.a, s.chirp.b).product];
    return d.next[0];
  };

  /* Validated transition. Returns {ok, from, to, events[]} — events are for FX/UI only. */
  Evo.advance = function (s, toId, ctx = {}) {
    const d = Evo.def(s);
    const target = Evo.nextId(s);
    if (!target) return { ok: false, reason: 'no successor' };
    if (toId && toId !== target) return { ok: false, reason: 'invalid transition ' + d.id + ' → ' + toId };
    if (!d.next.includes(target)) return { ok: false, reason: 'not allowed' };
    const chk = Evo.canAdvance(s);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    const events = [];
    exitStage(s, d, target, events);
    enterStage(s, CA.STAGE[target], events, ctx.rand || Math.random);
    return { ok: true, from: d.id, to: target, events };
  };

  function discover(s, id, events) {
    if (!CA.DISCOVERY[id] || s.discovered[id]) return;
    s.discovered[id] = true;
    events.push({ type: 'discovery', id });
    const key = 'disc:' + id;
    const rw = Econ().grantOnce(s, key, { research: id.startsWith('stage:') ? 4 + CA.STAGE[id.slice(6)].index * 3 : 12 });
    if (rw) events.push({ type: 'reward', key, rewards: rw });
  }
  Evo.discover = (s, id) => { const ev = []; discover(s, id, ev); return ev; };

  function exitStage(s, d, target, events) {
    switch (d.id) {
      case 'core':
        s.reservoir = Evo.starMassFromCore(s);
        events.push({ type: 'cinematic', id: 'collapse' });
        break;
      case 'pebble':
        discover(s, 'streaming', events);
        events.push({ type: 'milestone', id: 'streaming' });
        break;
      case 'planet': {
        const type = Evo.planetType(s);
        s.planet = { type, mass: type === 'gasgiant' ? Math.max(s.mass, 95 * U.M_EARTH) : s.mass, zone: s.zone || 'inner', engulfed: false, lostBy: '' };
        discover(s, type, events);
        events.push({ type: 'cinematic', id: 'planet' });
        break;
      }
      case 'protostar':
        s.star.M0 = s.star.M;
        s.star.ignited = true;
        events.push({ type: 'cinematic', id: 'ignition' });
        if (s.star.M0 < 0.5) discover(s, 'red_dwarf', events);
        if (s.star.M0 >= 0.8 && s.star.M0 <= 1.2) discover(s, 'sunlike', events);
        if (s.star.M0 >= 8) discover(s, 'massive', events);
        break;
      case 'redgiant':
        if (s.star.M0 < 2) { s.star.flash = true; discover(s, 'helium_flash', events); events.push({ type: 'milestone', id: 'helium_flash' }); }
        break;
      case 'supergiant': {
        const fate = Star.collapse(s.star.M);
        s.star.fate = fate;
        if (!fate.sn) discover(s, 'failed_sn', events); // the black-hole cinematic plays on entering the remnant
        else { events.push({ type: 'cinematic', id: 'supernova' }); events.push(...Bin().markOrigin(s, 'ccsn')); }
        break;
      }
      case 'whitedwarf': case 'neutronstar': case 'blackhole':
        s.chirp = Bin().newChirp(s.remnant, s.companion);
        s.companion = null; s.remnant = null;
        break;
      case 'inspiral': Bin().finishMerger(s, events); break;
    }
  }

  function enterStage(s, d, events, rand = Math.random) {
    const prev = s.stage;
    s.stage = d.id;
    s.stageTime = 0;
    s.reached[d.id] = true;
    discover(s, 'stage:' + d.id, events);
    if (d.type === 'mass' || d.type === 'planet') s.mass = Math.max(s.mass, d.massStart);
    switch (d.id) {
      case 'core': s.core = { M: BAL.jeans.M0, T: BAL.jeans.T0 }; events.push(...Bin().markOrigin(s, 'bigbang')); break;
      case 'planetesimal': s.mass = d.massStart; discover(s, 'runaway', events); break;
      case 'protostar':
        s.star = { M0: s.reservoir || 1, M: s.reservoir || 1, Tc: 1, fuel: 1, pg: 1, comp: 1, wind: false, burn: 0, age: 0, flash: false, wr: false, ignited: false, pulsePhase: 0, rg: 1 };
        break;
      case 'mainseq': Object.assign(s.star, { fuel: 1, pg: 1, comp: 1, age: 0, rg: Star.R(s.star.M0) }); break;
      case 'redgiant': s.star.rg = Star.R(s.star.M0); break;
      case 'supergiant': s.star.burn = 0; s.star.rg = 300; break;
      case 'pnebula': s.star.M = Star.wdMass(s.star.M0); break;
      case 'snr': s.remnant = Evo.makeRemnant('snr', 0.1, s); s.chirp = null; break;
      case 'whitedwarf': {
        const helium = prev === 'mainseq', merged = s.chirp && s.chirp.out;
        s.remnant = Evo.makeRemnant('wd', merged ? merged.mass : Star.wdMass(s.star.M0), s);
        s.chirp = null;
        s.remnant.helium = helium;
        if (helium) discover(s, 'helium_wd', events);
        if (s.planet && s.planet.lostBy === 'engulfed') { s.remnant.polluted = true; discover(s, 'polluted_wd', events); }
        break;
      }
      case 'neutronstar': case 'blackhole': {
        const merged = s.chirp && s.chirp.out;
        if (merged) { s.remnant = Evo.makeRemnant(d.kind, merged.mass, s); s.chirp = null; break; } // the merger's cinematic has played
        const fate = s.star.fate || Star.collapse(s.star.M);
        s.remnant = Evo.makeRemnant(d.kind, fate.mass, s);
        if (d.kind === 'ns' && Bin().rollMagnetar(s.star.M0, rand)) { // simplified: see SCIENCE.md
          s.remnant.magnetar = true; s.remnant.B = BAL.binary.magnetar.B;
          discover(s, 'magnetar', events);
        }
        if (fate.sn && s.planet && !s.planet.engulfed && s.star.M - fate.mass > s.star.M / 2) {
          s.planet.engulfed = true; s.planet.lostBy = 'ejected';
          events.push({ type: 'warning', text: CA.t('evt.flung') });
        }
        events.push({ type: 'cinematic', id: d.id === 'neutronstar' ? 'neutron' : 'blackhole' });
        break;
      }
    }
    if (d.chapter >= 3 && !s.star) enterStage(s, CA.STAGE.protostar, events); // safety net (should not happen)
  }

  Evo.makeRemnant = function (type, mass, s) {
    const r = { type, mass, age: 0, T: 0, P: 0, streak: 0, best: 0, crystal: false, polluted: false, helium: false, lastBeam: -1, accr: 0, lensCd: 0 };
    if (type === 'wd') r.T = 100000;
    if (type === 'ns') { r.P = 0.033; r.B = 1e12 * (1 + Math.max(0, ((s && s.star && s.star.M) || 10) - 8) / 20); }
    return r;
  };

  Evo.planetType = function (s) {
    const me = s.mass / U.M_EARTH;
    if (s.zone === 'outer') return me >= 10 ? 'gasgiant' : 'icegiant';
    return me >= 3 ? 'superearth' : 'terrestrial';
  };

  Evo.setZone = function (s, zone) {
    if (s.stage !== 'protoplanet' || s.zone || (zone !== 'inner' && zone !== 'outer')) return false;
    s.zone = zone;
    return true;
  };

  /* ---------------- absorption of a mote (called by the game for each sim event) ---------------- */
  Evo.absorb = function (s, type, size, frac) {
    const d = Evo.def(s), E = Econ();
    const out = { matter: 0, energy: 0, heavy: 0, research: 0, events: [] };
    const acc = 1 + 0.08 * E.lvl(s, 'accretion');
    const boost = s.fx.boost > 0 ? 1.5 : 1;
    const amount = size * frac;
    s.stats.motes++;
    if (type === 'spark') { out.energy = E.add(s, 'energy', BAL.energy.spark * amount); return out; }
    if (type === 'anomaly') {
      out.research = E.add(s, 'research', 3 + d.index * 0.6);
      discover(s, 'anomaly', out.events);
      return out;
    }
    if (d.type === 'mass' || d.type === 'planet') {
      let g = d.gain * acc * boost;
      if (d.runaway) g *= 1 + 0.6 * Evo.progress(s);
      if (s.zone === 'outer') g *= 1.3;
      if (type === 'rogue' || type === 'impactor') g *= 2.5;
      if (type === 'meteor') g *= 0.35; // small, fast fragments: a whole stream is worth a few big motes
      const cap = d.type === 'planet' ? d.massCap : d.massEnd;
      s.mass = Math.min(cap, s.mass * (1 + g * amount));
    } else if (d.type === 'jeans' && type === 'gas') {
      s.core.M = Math.min(1000, s.core.M * (1 + 0.075 * acc * boost * amount));
    } else if (d.type === 'protostar' && type === 'gas') {
      s.star.Tc = Math.min(SB.igniteTc * 1.5, s.star.Tc + 0.12 * amount);
    } else if (d.kind === 'bh') {
      const r = s.remnant;
      r.accr += amount;
      const eff = [0.06, 0.14, 0.23, 0.32, 0.42][E.lvl(s, 'p_kerr')];
      const over = r.accr > Evo.eddington(s);
      const bhLv = (s.mg.bh && s.mg.bh.cleared) || 0; // Black Hole Approach levels: +8% each
      out.energy = E.add(s, 'energy', 150 * (eff / 0.06) * amount * (over ? 0.4 : 1) * (1 + 0.08 * bhLv));
    }
    out.matter = E.add(s, 'matter', d.matterValue * amount);
    if (type === 'heavy' || type === 'ejecta' || type === 'comet' || type === 'meteor') {
      const snLv = d.id === 'supernova' && s.mg.sn ? s.mg.sn.cleared : 0; // Supernova Survival levels: +10% ejecta yield each
      const hv = (type === 'ejecta' ? 6 * (1 + 0.1 * snLv) : type === 'comet' ? 0.6 : type === 'meteor' ? 1.5 + 0.5 * Math.max(0, d.index - 3) : 1 + 0.5 * Math.max(0, d.index - 3)) * (d.chapter >= 3 && type === 'heavy' ? 4 : 1);
      out.heavy = E.add(s, 'heavy', hv * amount);
      if (type === 'ejecta') out.research = E.add(s, 'research', 0.5 * amount);
    }
    return out;
  };

  Evo.eddington = (s) => 2.6 + 0.5 * Math.log10(Math.max(1, s.remnant ? s.remnant.mass : 1)); // motes per second (game units)

  /* ---------------- per-stage energy production & passive extras ---------------- */
  Evo.energyProduction = function (s) {
    const d = Evo.def(s);
    const harvest = 1 + 0.15 * Econ().lvl(s, 'harvest');
    switch (d.type) {
      case 'protostar': return 2 * Math.sqrt(s.star.M);
      case 'mainseq': return 8 * Math.pow(Star.L(s.star.M0), 0.3) * s.star.comp * Evo.pgEfficiency(s.star.pg) * harvest;
      case 'timed':
        if (d.kind === 'giant' || d.kind === 'supergiant') return 12 * Math.pow(Star.L(s.star.M0), 0.3) * harvest;
        return 0;
      case 'remnant': {
        const r = s.remnant;
        if (r.type === 'wd') return 30 * r.mass * Math.pow(r.T / 1e5, 1.2) + 2;
        if (r.magnetar) return 80; // powered by its decaying field, not by spin
        if (r.type === 'ns') return 200 * Math.pow(0.033 / r.P, 4) + 4;
        if (r.type === 'snr') return 2;
        return 3;
      }
    }
    return 0;
  };
  Evo.pgEfficiency = (pg) => Math.exp(-Math.pow((pg - 1) / 0.22, 2));

  Evo.passive = function (s) {
    const d = Evo.def(s);
    const out = { energy: Evo.energyProduction(s) };
    if (d.chapter >= 3) out.research = 0.2;
    if (d.type === 'remnant') {
      const m = s.remnant.mass;
      out.remnants = s.remnant.type === 'snr' ? 0 : s.remnant.type === 'wd' ? 0.01 * m : s.remnant.type === 'ns' ? 0.02 * m : 0.012 * Math.log10(1 + m) * 4;
    }
    return out;
  };

  /* ---------------- per-stage continuous logic ----------------
     ctx: { rand(): number in [0,1) } so tests can inject determinism.
     Returns events (auto transitions, warnings, flares). */
  Evo.tick = function (s, dt, ctx = {}) {
    const rand = ctx.rand || Math.random;
    const d = Evo.def(s), E = Econ();
    const events = [];
    s.stageTime += dt;
    const growth = E.rates(s).growth;
    if ((d.type === 'mass' || d.type === 'planet') && growth > 0) {
      const cap = d.type === 'planet' ? d.massCap : d.massEnd;
      s.mass = Math.min(cap, s.mass * Math.exp(growth * dt));
    }

    switch (d.type) {
      case 'jeans': {
        const heat = BAL.jeans.heat * (1 + 0.5 * Math.log10(Math.max(1, s.core.M / BAL.jeans.M0)));
        s.core.T = U.clamp(s.core.T + heat * dt, BAL.jeans.Tmin, BAL.jeans.Tmax);
        break;
      }
      case 'protostar':
        s.star.Tc = Math.min(SB.igniteTc * 1.5, s.star.Tc + 0.15 * Math.pow(s.star.M, 0.35) * dt);
        break;
      case 'mainseq': {
        const st = s.star;
        const stab = 1 - 0.12 * E.lvl(s, 'fusion_stab');
        const sigma = 0.11 * stab;
        const gauss = (rand() + rand() + rand() - 1.5) * 2; // ~N(0,1)
        st.pg += (0.5 * (st.comp - 1) * stab - 1.0 * (st.pg - 1)) * dt + sigma * Math.sqrt(dt) * gauss;
        st.pg = U.clamp(st.pg, 0.4, 1.8);
        if ((st.pg > 1.45 || st.pg < 0.6) && !(s.cd._flare > 0)) {
          st.comp = 1;
          st.pg = st.pg > 1 ? 1.15 : 0.9;
          s.res.energy *= 0.9;
          s.cd._flare = 5;
          events.push({ type: 'flare', text: CA.t(st.pg > 1 ? 'evt.puff' : 'evt.contract') });
        }
        const burn = Math.pow(st.comp, 1.5) / (Star.msSeconds(st.M0) * (1 + 0.08 * E.lvl(s, 'mixing')));
        st.fuel = Math.max(0, st.fuel - burn * dt);
        st.age += dt * burn * Star.lifetimeYr(st.M0);
        break;
      }
      case 'timed':
        tickTimed(s, d, dt, events);
        events.push(...Bin().tickTransfer(s, dt, rand));
        break;
      case 'remnant': tickRemnant(s, dt, events); break;
      case 'inspiral': Bin().stepChirp(s.chirp, s.stageTime); break;
    }

    if (d.type === 'mass' && d.swarm && ctx.swarmCount !== undefined) {
      if (ctx.swarmCount >= d.swarm.count && s.mass >= d.massEnd * 0.9999) s.swarmT += dt; else s.swarmT = Math.max(0, s.swarmT - dt * 0.5);
      if (s.swarmT >= d.swarm.hold) s.swarmDone = true;
    }

    // automatic transitions
    const chk = Evo.canAdvance(s);
    if (chk.ok && !chk.manual) {
      const res = Evo.advance(s, undefined, ctx);
      if (res.ok) events.push({ type: 'advanced', from: res.from, to: res.to }, ...res.events);
    }
    return events;
  };

  function tickTimed(s, d, dt, events) {
    const st = s.star, p = Evo.progress(s), wdm = Star.wdMass(st.M0);
    if (d.id === 'redgiant') {
      st.M = st.M0 - 0.3 * (st.M0 - wdm) * p;
      st.rg = Star.R(st.M0) + (150 * Math.pow(st.M0, 0.4) - Star.R(st.M0)) * p * p;
      checkEngulf(s, events);
    } else if (d.id === 'agb') {
      const mStart = st.M0 - 0.3 * (st.M0 - wdm);
      st.M = mStart - (mStart - wdm) * p * p * p; // the "superwind" removes most of the envelope at the very end
      st.rg = 150 * Math.pow(st.M0, 0.4) + 100 * Math.pow(st.M0, 0.4) * Math.min(1, p * 2.5);
      checkEngulf(s, events);
    } else if (d.id === 'supergiant') {
      const loss = Star.windBase(st.M, s.Z) + (st.wind ? Star.windOn : 0);
      st.M = Math.max(st.M * 0.25, st.M - st.M * loss * dt);
      if (st.wind) Econ().add(s, 'heavy', 0.8 * dt * Math.sqrt(st.M));
      let t = s.stageTime, b = 0;
      while (b < Star.SG_BURNS.length - 1 && t > Star.SG_BURNS[b].dur) { t -= Star.SG_BURNS[b].dur; b++; }
      st.burn = b;
      if (b >= 4) events.push(...Bin().markOrigin(s, 'massive')); // silicon burning: the shells up to iron are complete
      if (st.M0 >= 25 && st.M < 0.65 * st.M0 && !st.wr) {
        st.wr = true;
        events.push(...Evo.discover(s, 'wolf_rayet'));
        events.push({ type: 'milestone', id: 'wolf_rayet' });
      }
    }
  }

  // Orbit widens as the star loses mass (adiabatic mass loss: a ∝ 1/M).
  Evo.planetOrbitRsun = (s) => (s.planet ? (s.planet.zone === 'outer' ? 1075 : 172) * (s.star.M0 / s.star.M) : 0);
  function checkEngulf(s, events) {
    const p = s.planet;
    if (!p || p.engulfed) return;
    if (s.star.rg > Evo.planetOrbitRsun(s)) {
      p.engulfed = true; p.lostBy = 'engulfed';
      Econ().add(s, 'heavy', 40);
      events.push(...Evo.discover(s, 'engulfment'));
      events.push({ type: 'warning', text: CA.t('evt.engulfed', { planet: CA.PLANET_TYPES[p.type].name.toLowerCase() }) });
    }
  }

  function tickRemnant(s, dt, events) {
    const r = s.remnant;
    r.age += dt;
    if (r.type === 'wd') {
      r.T = 100000 * Math.pow(1 + r.age / 12, -0.75);
      if (!r.crystal && r.T < Evo.crystalT(r.mass)) {
        r.crystal = true;
        events.push(...Evo.discover(s, 'crystal_wd'));
        events.push({ type: 'milestone', id: 'crystal' });
      }
    } else if (r.type === 'ns') {
      r.P = r.magnetar ? Bin().magnetarP(r.age) : Math.sqrt(0.033 * 0.033 + 0.01 * 0.033 * 0.033 * r.age);
    } else if (r.type === 'bh') {
      r.accr *= Math.exp(-dt / 3); // moving average of feeding rate
    }
    r.lensCd = Math.max(0, (r.lensCd || 0) - dt);
  }
  Evo.crystalT = (m) => 6000 * Math.sqrt(m / 0.6);

  /* Pulsar beam geometry (display slowed down; see SCIENCE.md). */
  Evo.nsDisplayPeriod = (r) => (r.magnetar ? 3 : 1.6 * Math.sqrt(r.P / 0.033));
  Evo.nsBeamAngle = (r) => (r.age / Evo.nsDisplayPeriod(r)) * U.TAU;

  /* Record a pulsar pulse. Returns {hit, research}. Each beam crossing can be scored once. */
  Evo.recordPulse = function (s) {
    const r = s.remnant;
    if (!r || r.type !== 'ns') return { hit: false };
    const ang = Evo.nsBeamAngle(r);
    // beams at ang and ang+π; detector at −π/2 (top of screen)
    const halfTurns = (ang + Math.PI / 2) / Math.PI;
    const nearest = Math.round(halfTurns);
    const err = Math.abs(halfTurns - nearest) * Math.PI;
    const win = 0.22 * (1 + 0.06 * ((s.mg.pt && s.mg.pt.cleared) || 0)); // Pulsar Timing levels widen the window
    if (err < win && nearest !== r.lastBeam) {
      r.lastBeam = nearest;
      r.streak++;
      r.best = Math.max(r.best, r.streak);
      const res = Econ().add(s, 'research', 1.5 * (1 + Math.min(2, r.streak * 0.1)) * (1 + 0.25 * Econ().lvl(s, 'probes')) * (1 - err / (2 * win)));
      const ev = r.streak >= 10 ? Evo.discover(s, 'pulsar') : [];
      return { hit: true, research: res, quality: 1 - err / win, events: ev };
    }
    r.streak = 0;
    return { hit: false };
  };

  /* AGB thermal pulse capture. period 6 s, peak at phase 0.5. */
  Evo.agbPhase = (s) => (s.stageTime % 6) / 6;
  Evo.capturePulse = function (s) {
    if (s.stage !== 'agb') return { ok: false };
    const idx = Math.floor(s.stageTime / 6);
    if (s.star.pulsePhase === idx + 1) return { ok: false, reason: 'already captured' };
    const q = 1 - Math.abs(Evo.agbPhase(s) - 0.5) / 0.5;
    s.star.pulsePhase = idx + 1;
    if (q < 0.55) return { ok: true, quality: q, heavy: 0 };
    const heavy = Econ().add(s, 'heavy', (q > 0.9 ? 30 : 15) * q * Math.sqrt(s.star.M0));
    return { ok: true, quality: q, heavy, events: Bin().markOrigin(s, 'agb') };
  };

  /* White dwarf spectrum: hotter = more informative. */
  Evo.observe = function (s) {
    const r = s.remnant, d = Evo.def(s), probes = (1 + 0.25 * Econ().lvl(s, 'probes')) * (1 + 0.1 * ((s.mg.sa && s.mg.sa.cleared) || 0));
    if (d.collectAtCursor) return Econ().add(s, 'research', (d.id === 'pnebula' ? 15 : 30) * probes);
    if (!r) return 0;
    if (r.type === 'wd') return Econ().add(s, 'research', 8 * Math.sqrt(r.T / 1e4) * (r.polluted ? 1.5 : 1) * probes);
    if (r.type === 'ns') return Econ().add(s, 'research', 6 * probes);
    if (r.type === 'snr') return Econ().add(s, 'research', 12 * probes);
    return 0;
  };

  /* ---------------- new cycle ---------------- */
  Evo.cycleReward = function (s) {
    const r = s.remnant;
    if (!r) return null;
    const rem = r.type === 'snr' ? 15 : r.type === 'wd' ? 3 + 6 * r.mass : r.type === 'ns' ? 12 + 8 * r.mass : 20 + 6 * Math.sqrt(r.mass);
    const z = r.type === 'snr' ? BAL.cycle.zFromIa : r.type === 'wd' ? BAL.cycle.zFromWD : r.type === 'ns' ? BAL.cycle.zFromSN : BAL.cycle.zFromBH;
    return { remnants: Math.round(rem), z };
  };
  Evo.canNewCycle = (s) => Evo.def(s).type === 'remnant' && s.stageTime >= 20;
  /* opts.keep: the remnant stays as the next star's binary companion instead of being recycled (half the reward).
     A companion that never merged is released either way. */
  Evo.newCycle = function (s, now, opts = {}) {
    if (!Evo.canNewCycle(s)) return null;
    const rw = Evo.cycleReward(s), keep = !!opts.keep && Bin().canKeep(s);
    if (keep) rw.remnants = Math.round(rw.remnants * BAL.binary.keepShare);
    const hist = { cycle: s.cycle, starMass: s.star ? s.star.M0 : 0, remnant: s.remnant.type, planet: s.planet ? s.planet.type : '' };
    const fresh = CA.State.newCycle(s, rw.z, now);
    fresh.res.remnants += rw.remnants;
    if (keep) fresh.companion = Bin().makeCompanion(s.remnant, s.cycle);
    fresh.history.push(hist);
    return { state: fresh, reward: rw };
  };
})(globalThis.CA = globalThis.CA || {});
