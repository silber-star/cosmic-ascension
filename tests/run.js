/* Headless logic tests. Run from the project folder:
   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tests/run.js
   (or open tests/index.html in a browser). */
(function () {
  const isShell = typeof window === 'undefined';
  const out = [];
  const log = (m) => (isShell ? print(m) : out.push(m));
  if (isShell) {
    if (typeof btoa === 'undefined') {
      globalThis.btoa = (s) => s; globalThis.atob = (s) => s;
    }
    ['js/core/util.js', 'js/data/i18n.js', 'js/data/balance.js', 'js/data/stages.js', 'js/data/upgrades.js', 'js/data/events.js', 'js/core/state.js', 'js/data/achievements.js', 'js/data/atlas.js',
      'js/core/economy.js', 'js/core/evolution.js', 'js/core/binary.js', 'js/core/records.js', 'js/core/events.js', 'js/core/guide.js', 'js/core/sim.js', 'js/render/bodies.js', 'js/minigames/models.js', 'js/minigames/framework.js', 'js/minigames/gravityArchitect.js', 'js/minigames/orbitalMechanics.js', 'js/minigames/stellarStabilization.js', 'js/minigames/spectralAnalysis.js', 'js/minigames/asteroidNavigation.js', 'js/minigames/pulsarTiming.js', 'js/minigames/blackHoleApproach.js', 'js/minigames/supernovaSurvival.js', 'js/render/fx.js'].forEach((f) => {
      try { load(f); } catch (e) { print('  (could not load ' + f + ': ' + e.message + ')'); }
    });
  }
  const CA = globalThis.CA, S = CA.State, E = CA.Econ, Evo = CA.Evo;
  const BAL_LATE = () => CA.BAL.energy.lateCap;
  let pass = 0, fail = 0;
  function t(name, fn) {
    try { fn(); pass++; log('  ✓ ' + name); }
    catch (e) { fail++; log('  ✗ ' + name + ' — ' + e.message); }
  }
  function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
  function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
  function stub() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => delete m[k], _m: m }; }
  function seeded(seed) { return CA.U.rng(seed); }

  // drive a mass/jeans stage to completion by absorbing motes
  function growUntilLeave(s, type, max = 5000) {
    const from = s.stage; let n = 0;
    while (s.stage === from && n < max) {
      Evo.absorb(s, type, 1, 1);
      const ev = Evo.tick(s, 0.016, { rand: () => 0.5, swarmCount: 99 });
      if (s.stage === from) {
        const c = Evo.canAdvance(s);
        if (c.ok && c.manual) Evo.advance(s);
      }
      n++;
    }
    return n;
  }

  log('State & save');
  t('new game validates without warnings', () => {
    const s = S.create(1000); const v = S.validate(JSON.parse(JSON.stringify(s)), 1000);
    eq(v.warnings.length, 0, 'warnings'); eq(v.state.stage, 'grain');
  });
  t('save → load round trip', () => {
    const st = stub(); const s = S.create(); s.res.matter = 1234; s.upg.range = 3;
    ok(S.save(s, st)); const l = S.load(st); eq(l.source, 'main'); eq(l.state.res.matter, 1234); eq(l.state.upg.range, 3);
  });
  t('corrupted main save falls back to backup', () => {
    const st = stub(); const s = S.create(); s.res.matter = 50; S.save(s, st); s.res.matter = 99; S.save(s, st);
    st.setItem(S.KEY, '{broken json'); const l = S.load(st); eq(l.source, 'backup'); eq(l.state.res.matter, 50);
  });
  t('garbage in both slots → no state, no throw', () => {
    const st = stub(); st.setItem(S.KEY, 'x'); st.setItem(S.BACKUP_KEY, '[1,2'); const l = S.load(st); eq(l.state, null);
  });
  t('validation clamps bad values', () => {
    const s = S.create(); s.res.matter = -50; s.res.energy = NaN; s.stage = 'warp_drive'; s.upg.range = 999; s.upg.hack = 5;
    const v = S.validate(JSON.parse(JSON.stringify(s)));
    eq(v.state.res.matter, 0); eq(v.state.res.energy, 60); eq(v.state.stage, 'grain'); eq(v.state.upg.range, CA.UPGRADE.range.max); eq(v.state.upg.hack, undefined);
  });
  t('future save version is rejected', () => { const v = S.validate({ version: 99 }); eq(v.state, null); });
  t('stellar stage without star data is rebuilt, not crashed', () => {
    const v = S.validate({ version: 1, stage: 'mainseq' }); ok(v.state.star && v.state.star.M0 > 0); ok(v.warnings.length > 0);
  });
  t('remnant stage without remnant is rebuilt', () => {
    const v = S.validate({ version: 1, stage: 'neutronstar' }); eq(v.state.remnant.type, 'ns');
  });

  log('Economy');
  t('cannot buy locked or unaffordable upgrades', () => {
    const s = S.create(); eq(E.buy(s, 'regen'), false, 'locked'); eq(E.buy(s, 'range'), false, 'poor');
    s.res.matter = 1e6; ok(E.buy(s, 'range')); eq(s.upg.range, 1); ok(s.res.matter < 1e6);
  });
  t('upgrade levels stop at max and costs rise', () => {
    const s = S.create(); s.res.matter = 1e30; let n = 0; while (E.buy(s, 'well_strength')) n++;
    eq(n, CA.UPGRADE.well_strength.max); ok(E.cost(CA.UPGRADE.range, 5) > E.cost(CA.UPGRADE.range, 4));
  });
  t('resources never go negative', () => { const s = S.create(); eq(E.spend(s, 'matter', 10), false); eq(s.res.matter, 0); });
  t('one-time rewards cannot be granted twice', () => {
    const s = S.create(); ok(E.grantOnce(s, 'x', { research: 10 })); eq(E.grantOnce(s, 'x', { research: 10 }), null); eq(s.res.research, 10);
  });
  t('a falling energy cap keeps what is stored', () => {
    const s = S.create(); s.stage = 'supernova'; s.star = { M0: 15, M: 12 }; s.res.energy = 50000;
    E.add(s, 'energy', 10); eq(s.res.energy, 50000);
    s.res.energy = 15990; E.add(s, 'energy', 1000); eq(s.res.energy, BAL_LATE());
  });
  t('every stellar and remnant energy upgrade fits under the cap where it is sold', () => {
    const s = S.create(); s.stage = 'mainseq'; s.star = { M0: 1, M: 1, comp: 1, pg: 1, fuel: 1 };
    ok(E.energyCap(s) >= E.cost(CA.UPGRADE.fusion_stab, 3), 'a 1 M☉ star can reach fusion stability 4');
    ok(E.energyCap(s) >= E.cost(CA.UPGRADE.harvest, 2), 'a 1 M☉ star can reach harvest 3');
    s.star = { M0: 20, M: 20, comp: 1, pg: 1, fuel: 1 }; s.upg.harvest = 9; // each harvest level bought raises the cap for the next
    for (const id of ['fusion_stab', 'harvest']) ok(E.energyCap(s) >= E.cost(CA.UPGRADE[id], CA.UPGRADE[id].max - 1), id + ' can be maxed at 20 M☉');
    for (const [stage, mass] of [['whitedwarf', 0.6], ['blackhole', 12], ['neutronstar', 1.4]]) {
      s.stage = stage; s.remnant = Evo.makeRemnant({ whitedwarf: 'wd', blackhole: 'bh', neutronstar: 'ns' }[stage], mass, s);
      ok(E.energyCap(s) >= E.cost(CA.UPGRADE.probes, CA.UPGRADE.probes.max - 1), 'probes can be maxed at a ' + stage);
    }
  });
  t('late matter has a use: core mixing lengthens the main sequence, sky survey pays research', () => {
    const burn = (l) => { const s = S.create(); s.stage = 'mainseq'; s.upg.mixing = l; s.star = { M0: 1, M: 1, comp: 1, pg: 1, fuel: 1, age: 0 }; Evo.tick(s, 1, { rand: () => 0.5 }); return 1 - s.star.fuel; };
    ok(Math.abs(burn(0) / burn(5) - 1.4) < 1e-9, 'level 5 = +40% time');
    const s = S.create(), r0 = E.rates(s).research; s.upg.survey = 3; ok(Math.abs(E.rates(s).research - r0 - 0.3) < 1e-9, 'survey research');
    for (const id of ['mixing', 'survey']) eq(CA.UPGRADE[id].res, 'matter');
  });
  t('the late chapter II stages cannot be rushed in a few motes', () => {
    for (const id of ['planetesimal', 'protoplanet', 'planet']) {
      const s = S.create(); s.stage = id; s.reached[id] = true; s.upg.accretion = 15; s.zone = 'inner'; s.mass = CA.STAGE[id].massStart;
      let n = 0; while (s.mass < CA.STAGE[id].massEnd && n < 500) { Evo.absorb(s, 'dust', 1, 1); n++; }
      ok(n >= 40, id + ' took only ' + n + ' motes at full accretion');
    }
  });
  t('black hole disk: a plain well feeds the hole and nothing piles up', () => {
    const w = new CA.Sim.World(), c = CA.Sim.defaultCtx(), R = CA.U.rng(5), real = Math.random; Math.random = R;
    Object.assign(c, { bodyR: 33, bodyStrength: 3960, spawn: { gas: 1 }, bh: { tidal: 139, disk: 112, superEdd: false } });
    c.well.active = true; w.reset(1280, 800, c);
    let fed = 0; for (let i = 0; i < 3600; i++) for (const e of w.step(1 / 60, c)) if (e.kind === 'absorb') fed++;
    Math.random = real;
    ok(fed >= 30, 'fed ' + fed + ' in 60 s'); ok(w.motes.filter((m) => Math.hypot(m.x, m.y) < 112).length < 12, 'motes stuck in the disk');
  });
  t('guide: every stage says what to do, in both languages', () => {
    for (const st of CA.STAGES) {
      const s = S.create(); s.stage = st.id; s.star = { M0: 1, M: 1, Tc: 2, pg: 1, fuel: 1 }; s.core = { M: 1, T: 8 }; s.remnant = Evo.makeRemnant({ wd: 'wd', ns: 'ns', bh: 'bh', snr: 'snr' }[st.kind] || 'wd', 1, s); s.res.energy = 100; s.chirp = { T: 30 };
      const key = CA.Guide.next(s); ok(CA.I18n.en[key] && CA.I18n.ko[key], st.id + ' → ' + key);
    }
  });
  t('guide: the hint follows the situation', () => {
    const s = S.create(); s.res.energy = 100; eq(CA.Guide.next(s), 'do.grain'); s.res.energy = 2; eq(CA.Guide.next(s), 'do.lowEnergy');
    s.stage = 'planet'; s.res.energy = 100; s.mass = 6e24; eq(CA.Guide.next(s), 'do.finalize');
    s.stage = 'core'; s.core = { M: 0.5, T: 20 }; eq(CA.Guide.next(s), 'do.cool');
    s.stage = 'mainseq'; s.star = { M0: 1, M: 1, pg: 1.4, fuel: 0.5 }; eq(CA.Guide.next(s), 'do.stabilize');
    s.stage = 'whitedwarf'; s.remnant = Evo.makeRemnant('wd', 0.6, s); s.stageTime = 5; eq(CA.Guide.next(s), 'do.whitedwarf'); s.stageTime = 25; eq(CA.Guide.next(s), 'do.cycle');
    eq(CA.Guide.nextStage(s), null); s.stage = 'grain'; eq(CA.Guide.nextStage(s), 'cluster');
  });
  t('guide: affordable count, nearest upgrade, new abilities', () => {
    const s = S.create(); eq(CA.Guide.affordable(s), 0); eq(CA.Guide.nearest(s).def.id, 'well_strength');
    s.res.matter = 12; eq(CA.Guide.affordable(s), 1);
    eq(CA.Guide.newAbilities('grain').join(), 'well'); eq(CA.Guide.newAbilities('cluster').join(), 'pulse'); eq(CA.Guide.newAbilities('merger').join(), '');
  });
  t('energy respects its cap', () => { const s = S.create(); E.add(s, 'energy', 1e9); eq(s.res.energy, E.energyCap(s)); });
  t('buffs refresh instead of stacking', () => {
    const s = S.create(); E.addBuff(s, { id: 'a', key: 'matter', mult: 1.5, t: 10 }); E.addBuff(s, { id: 'a', key: 'matter', mult: 1.5, t: 10 });
    eq(s.buffs.length, 1); eq(E.buffMult(s, 'matter'), 1.5);
  });
  t('offline progress is capped and never completes a stage', () => {
    const s = S.create(); s.reached.cluster = true; s.upg.coagulation = 20;
    const r = E.offline(s, 100 * 3600); ok(r.capped); ok(s.mass < CA.STAGE.grain.massEnd); eq(s.stage, 'grain');
  });

  log('Evolution');
  t('invalid transitions are rejected', () => {
    const s = S.create(); eq(Evo.advance(s, 'blackhole').ok, false); eq(Evo.advance(s).ok, false); eq(s.stage, 'grain');
  });
  t('dust grain → cluster → core by accretion', () => {
    const s = S.create(); growUntilLeave(s, 'dust'); eq(s.stage, 'cluster'); growUntilLeave(s, 'dust'); eq(s.stage, 'core');
  });
  t('core collapses only above the Jeans mass', () => {
    const s = S.create(); s.stage = 'core'; s.reached.core = true; s.core = { M: 0.5, T: 20 };
    eq(Evo.canAdvance(s).ok, false); growUntilLeave(s, 'gas'); eq(s.stage, 'aggregate'); ok(s.reservoir >= 0.08 && s.reservoir < 3, 'reservoir ' + s.reservoir);
  });
  t('a bigger core gives a bigger star', () => {
    const s = S.create(); s.stage = 'core'; s.core = { M: 60, T: 20 }; Evo.advance(s); ok(Math.abs(s.reservoir - 21) < 0.01);
  });
  t('pebble stage needs the swarm, protoplanet needs a zone', () => {
    const s = S.create(); s.stage = 'pebble'; s.mass = 10; eq(Evo.canAdvance(s).ok, false); s.swarmDone = true; ok(Evo.canAdvance(s).ok);
    s.stage = 'protoplanet'; s.mass = 6e22; eq(Evo.canAdvance(s).ok, false); ok(Evo.setZone(s, 'outer')); eq(Evo.setZone(s, 'inner'), false); ok(Evo.canAdvance(s).ok);
  });
  t('planet types follow zone and mass', () => {
    const s = S.create(); s.stage = 'planet';
    s.zone = 'inner'; s.mass = CA.U.M_EARTH; eq(Evo.planetType(s), 'terrestrial'); s.mass = 4 * CA.U.M_EARTH; eq(Evo.planetType(s), 'superearth');
    s.zone = 'outer'; s.mass = 5 * CA.U.M_EARTH; eq(Evo.planetType(s), 'icegiant'); s.mass = 11 * CA.U.M_EARTH; eq(Evo.planetType(s), 'gasgiant');
  });
  t('stellar fates depend on mass', () => {
    eq(Evo.Star.predict(0.3, 0.014).type, 'wd'); eq(Evo.Star.predict(1, 0.014).type, 'wd'); eq(Evo.Star.predict(5, 0.014).type, 'wd');
    eq(Evo.Star.collapse(10).type, 'ns'); eq(Evo.Star.collapse(45).type, 'bh'); eq(Evo.Star.collapse(45).sn, false); eq(Evo.Star.collapse(12).sn, true);
    ok(Evo.Star.wdMass(8) < 1.4, 'Chandrasekhar');
  });
  t('lifetimes shrink with mass', () => { ok(Evo.Star.lifetimeYr(0.3) > Evo.Star.lifetimeYr(1)); ok(Evo.Star.lifetimeYr(1) > Evo.Star.lifetimeYr(20)); ok(Math.abs(Evo.Star.lifetimeYr(1) - 1e10) < 1); });

  function runStar(M0, opts = {}) {
    const s = S.create(); s.stage = 'protostar'; s.reservoir = M0; s.reached.protostar = true;
    s.star = { M0, M: M0, Tc: 1, fuel: 1, pg: 1, comp: 1, wind: false, burn: 0, age: 0, flash: false, wr: false, ignited: false, pulsePhase: 0, rg: 1 };
    if (opts.planet) { s.planet = { type: 'terrestrial', mass: CA.U.M_EARTH, zone: 'inner', engulfed: false, lostBy: '' }; s.zone = 'inner'; }
    const path = [s.stage]; let i = 0; const rnd = seeded(7);
    while (CA.STAGE[s.stage].type !== 'remnant' && i++ < 200000) {
      if (s.stage === 'supergiant') s.star.wind = !!opts.wind;
      const ev = Evo.tick(s, 0.05, { rand: rnd });
      const c = Evo.canAdvance(s); if (c.ok && c.manual) Evo.advance(s);
      if (path[path.length - 1] !== s.stage) path.push(s.stage);
    }
    return { s, path };
  }
  t('1 M☉: main sequence → red giant → AGB → planetary nebula → white dwarf', () => {
    const r = runStar(1); eq(r.path.join('>'), 'protostar>mainseq>redgiant>agb>pnebula>whitedwarf'); ok(r.s.discovered.helium_flash);
  });
  t('0.3 M☉ red dwarf skips the giant phases (helium WD)', () => { const r = runStar(0.3); eq(r.path.join('>'), 'protostar>mainseq>whitedwarf'); ok(r.s.remnant.helium); });
  t('12 M☉ → supergiant → supernova → neutron star', () => { const r = runStar(12); eq(r.path.join('>'), 'protostar>mainseq>supergiant>supernova>neutronstar'); });
  t('60 M☉ without winds → direct collapse black hole (no supernova)', () => { const r = runStar(60); eq(r.path.join('>'), 'protostar>mainseq>supergiant>blackhole'); ok(r.s.discovered.failed_sn); });
  t('30 M☉ with strong winds ends lighter than without', () => {
    const a = runStar(30), b = runStar(30, { wind: true }); ok(b.s.remnant.mass < a.s.remnant.mass, a.s.remnant.mass + ' vs ' + b.s.remnant.mass);
  });
  t('inner planet of a 1 M☉ star is engulfed → polluted white dwarf', () => {
    const r = runStar(1, { planet: true }); ok(r.s.planet.engulfed); ok(r.s.remnant.polluted);
  });
  t('pulsar pulses score once per crossing', () => {
    const s = S.create(); s.stage = 'neutronstar'; s.star = { M0: 12, M: 11 }; s.remnant = Evo.makeRemnant('ns', 1.4, s);
    const per = Evo.nsDisplayPeriod(s.remnant);
    s.remnant.age = per * 0.75; // beam angle 3π/2 → second beam at π/2 … detector at −π/2 ≡ 3π/2 → hit
    const a = Evo.recordPulse(s); ok(a.hit, 'first hit'); const b = Evo.recordPulse(s); eq(b.hit, false, 'double count');
    s.remnant.age = per * 0.1; eq(Evo.recordPulse(s).hit, false, 'off-beam'); eq(s.remnant.streak, 0);
  });
  t('AGB pulse captured once per pulse', () => {
    const s = S.create(); s.stage = 'agb'; s.star = { M0: 1, M: 0.8, pulsePhase: 0 }; s.stageTime = 3;
    const a = Evo.capturePulse(s); ok(a.ok && a.quality > 0.95); eq(Evo.capturePulse(s).ok, false);
  });
  t('new cycle keeps research and remnants, resets the run', () => {
    const s = S.create(); s.stage = 'whitedwarf'; s.star = { M0: 1, M: 0.5 }; s.remnant = Evo.makeRemnant('wd', 0.6, s); s.stageTime = 30;
    s.res.research = 77; s.perm.p_methods = 2; s.res.matter = 1e9; s.upg.range = 5;
    const r = Evo.newCycle(s, 5); eq(r.state.cycle, 2); eq(r.state.res.research, 77); eq(r.state.perm.p_methods, 2); eq(r.state.res.matter, 0); eq(r.state.upg.range, undefined); ok(r.state.res.remnants > 0); ok(r.state.Z > s.Z);
  });
  t('new cycle refused before remnant', () => { const s = S.create(); eq(Evo.newCycle(s), null); });

  if (CA.Sim) {
    log('Simulation');
    t('sim conserves sanity over 60 s (no NaN, bounded count)', () => {
      const w = new CA.Sim.World(); w.reset(800, 600);
      const ctx = CA.Sim.defaultCtx(); ctx.spawn = { dust: 1, spark: 0.1 }; ctx.well = { active: true, x: 20, y: 0 };
      let absorbed = 0;
      for (let i = 0; i < 3600; i++) { const ev = w.step(1 / 60, ctx); absorbed += ev.filter((e) => e.kind === 'absorb').length; }
      ok(w.motes.length <= ctx.maxMotes); ok(w.motes.every((m) => isFinite(m.x) && isFinite(m.vx))); ok(absorbed > 10, 'absorbed ' + absorbed);
    });
  }
  if (CA.Models) {
    log('Minigame models');
    t('orbital elements: circular orbit has e≈0', () => {
      const el = CA.Models.orbitElements(100, 0, 0, Math.sqrt(1000 / 100), 1000); ok(el.e < 1e-6); ok(Math.abs(el.a - 100) < 1e-6);
    });
    t('orbital elements: escape speed gives e≥1', () => {
      const el = CA.Models.orbitElements(100, 0, 0, Math.sqrt(2 * 1000 / 100) * 1.01, 1000); ok(el.e >= 1);
    });
    t('stellar model: idle star drifts out of balance, a simple controller holds it', () => {
      const runCtl = (ctl) => {
        const m = CA.Models.newStar(2); let inBand = 0, n = 0;
        const rnd = CA.U.rng(1); for (let i = 0; i < 60 * 100; i++) { if (ctl) ctl(m); CA.Models.stepStar(m, 1 / 60, rnd); if (Math.abs(m.pg - 1) < m.band) inBand++; n++; if (m.failed || m.won) break; }
        return { frac: inBand / n, failed: m.failed };
      };
      const idle = runCtl(null);
      const ctl = runCtl((m) => {
        const c = m.x > 1 + m.band / 2 ? 0.5 : m.x < 1 - m.band / 2 ? 0.4 : 0.6;
        m.comp += CA.U.clamp(c - m.comp, -0.9 / 60, 0.9 / 60);
        if (m.x > 1 + m.band / 2) CA.Models.vent(m);
      });
      ok(idle.failed, 'idle should fail'); ok(!ctl.failed && ctl.frac > 0.9, 'controlled ' + ctl.frac.toFixed(2) + ' ' + ctl.failed);
    });
  }

  if (CA.MG && CA.MG.defs.ga) {
    log('Minigame playability (headless)');
    const api = (level, seedBase, done) => ({ w: () => 960, h: () => 600, level, rng: CA.U.rng(seedBase + level * 97), sfx: () => {}, finish: done });
    function gaRun(level, wellsXY, reactive) {
      let result = null;
      const inst = CA.MG.defs.ga.create(api(level, 2000, (r) => (result = r)), level), D = inst._dbg();
      wellsXY.forEach(([x, y]) => inst.pointer('down', x, y, 0)); inst.release();
      let cur = 0;
      for (let i = 0; i < 60 * 60 && !result; i++) {
        if (reactive && cur < D.wells.length && i % 6 === 0) {
          const w = D.wells[cur], al = D.parts.filter((p) => p.alive), tot = al.reduce((a, p) => a + p.s, 0);
          const near = al.filter((p) => Math.hypot(p.x - w.x, p.y - w.y) < 70).reduce((a, p) => a + p.s, 0);
          if (tot > 0 && near / tot > 0.75) { inst.pointer('down', w.x, w.y, 0); cur++; }
        }
        inst.update(1 / 60);
      }
      return result;
    }
    t('Gravity Architect: leaving wells on fails; a timed relay succeeds (L1–L3)', () => {
      ok(!gaRun(1, [[360, 300], [580, 300]], false).success, 'idle should fail');
      for (const L of [1, 2, 3]) ok(gaRun(L, [[330, 300], [520, 300], [640, 300]], true).success, 'relay L' + L);
    });
    function omRun(level, speedFactor) {
      let result = null;
      const inst = CA.MG.defs.om.create(api(level, 1, (r) => (result = r)), level);
      const scale = Math.min(1, 600 / 720), band = [null, [120, 270], [150, 225], [168, 205], [145, 215], [265, 340]][level];
      const r0 = ((band[0] + band[1]) / 2) * scale, mu = 2.2e6 * scale * scale * scale, v = Math.sqrt(mu / r0) * speedFactor;
      inst.pointer('down', 480, 300 - r0); inst.pointer('move', 480 + v / 1.15, 300 - r0); inst.pointer('up', 480 + v / 1.15, 300 - r0);
      for (let i = 0; i < 60 * 140 && !result; i++) inst.update(1 / 60);
      return result || { success: false };
    }
    t('Orbital Mechanics: a circular launch clears every level, a sloppy one does not', () => {
      for (const L of [1, 2, 3, 4, 5]) ok(omRun(L, 1).success, 'circular L' + L);
      ok(!omRun(3, 0.9).success, 'too slow at L3 should fail');
    });
  }

  if (CA.MG && CA.MG.defs.bh && CA.MG.defs.sn) {
    log('Minigame quality: a first player can follow the game');
    const api = (level, done) => ({ w: () => 960, h: () => 600, level, rng: CA.U.rng(7000 + level * 97), sfx: () => {}, finish: done });
    const key = (inst, code, k, down) => inst.key({ code, key: k, repeat: false, shiftKey: false }, down);
    t('every minigame says what to do from the first moment, at every level', () => {
      for (const id of CA.MG.order) for (let l = 1; l <= 5; l++) {
        const c = CA.MG.defs[id].create(api(l, () => {}), l).coach();
        ok(c && (c.t || c), id + ' L' + l + ' has no coach line');
      }
    });
    t('a failed run explains how to do better', () => {
      for (const id of CA.MG.order) {
        let r = null; const inst = CA.MG.defs[id].create(api(1, (x) => (r = x)), 1);
        if (id === 'ga') { inst.pointer('down', 400, 300, 0); inst.release(); }
        if (id === 'om') { inst.pointer('down', 480, 200); inst.pointer('move', 480, 200); inst.pointer('up', 480, 200); }
        for (let i = 0; i < 60 * 200 && !r; i++) {
          if (id === 'om' && inst.coach().t === CA.t('om.v.impact')) break;
          if (id === 'an') key(inst, 'KeyW', 'w', true);
          if (id === 'sa' && i % 600 === 0) inst._dbg().submit();
          inst.update(1 / 60);
        }
        if (id === 'om') { for (let n = 0; n < 4 && !r; n++) { inst.pointer('down', 480, 300); inst.pointer('move', 480, 200); inst.pointer('up', 480, 200); for (let i = 0; i < 600 && !r; i++) inst.update(1 / 60); } }
        ok(r && !r.success, id + ' should have failed');
        ok(r.hint, id + ' failure has no hint');
      }
    });
    t('Gravity Architect: no release without wells; L1 suggestions win by following the prompts', () => {
      let r = null; const inst = CA.MG.defs.ga.create(api(1, (x) => (r = x)), 1), D = inst._dbg();
      inst.release(); eq(D.st.phase, 'plan');
      [340, 480, 610].forEach((x) => inst.pointer('down', x, 300, 0)); inst.release();
      for (let i = 0; i < 60 * 45 && !r; i++) {
        const say = inst.coach(); // a person looks a few times a second and does what the line says
        if (i % 24 === 0 && say.t === CA.t('ga.coachOff')) { const w = D.wells.find((q) => q.on); inst.pointer('down', w.x, w.y, 0); }
        if (i % 24 === 0 && say === CA.t('ga.coachNone')) inst.pointer('down', D.wells[1].x, D.wells[1].y, 0);
        inst.update(1 / 60);
      }
      ok(r && r.success, 'relay by prompts');
    });
    t('Gravity Architect: running dry ends the run instead of waiting out the clock', () => {
      let r = null, t0 = 0; const inst = CA.MG.defs.ga.create(api(1, (x) => (r = x)), 1);
      inst.pointer('down', 330, 300, 0); inst.pointer('down', 430, 300, 0); inst.pointer('down', 330, 200, 0); inst.pointer('down', 330, 400, 0); inst.release();
      for (; t0 < 60 * 45 && !r; t0++) inst.update(1 / 60);
      ok(r && !r.success && t0 / 60 < 34, 'ended at ' + (t0 / 60).toFixed(0) + ' s');
      eq(r.hint, CA.t('ga.hintEnergy'));
    });
    t('Orbital Mechanics: a drag can start anywhere and the aim tells whether the orbit fits', () => {
      let r = null; const inst = CA.MG.defs.om.create(api(1, (x) => (r = x)), 1);
      inst.pointer('down', 700, 500); inst.pointer('move', 480 + 77, 300 - 162.5);
      eq(inst.coach().t, CA.t('om.v.in'));
      inst.pointer('move', 480 + 10, 300 - 162.5); eq(inst.coach().t, CA.t('om.v.impact'));
      inst.pointer('move', 480 + 160, 300 - 162.5); eq(inst.coach().t, CA.t('om.v.escape'));
    });
    t('Stellar Stabilization: the on-screen advice wins L1 on every seed, doing nothing does not', () => {
      const M = CA.Models;
      for (let seed = 1; seed <= 10; seed++) {
        const play = (act) => { const m = M.newStar(1), rnd = CA.U.rng(seed); for (let i = 0; i < 60 * 70 && !m.won && !m.failed; i++) { if (act) act(m); M.stepStar(m, 1 / 60, rnd); } return m; };
        ok(!play(null).won, 'idle wins seed ' + seed);
        ok(play((m) => { const c = m.x < 1 - m.band / 2 ? 0.3 : 0.7; m.comp += CA.U.clamp(c - m.comp, -0.015, 0.015); if (m.x > 1 + m.band / 2) M.vent(m); }).won, 'advice loses seed ' + seed);
      }
    });
    t('Asteroid Navigation: a held mouse keeps fuel, Space brakes, the prompts reach the beacon', () => {
      let r = null; const inst = CA.MG.defs.an.create(api(1, (x) => (r = x)), 1), D = inst._dbg();
      inst.pointer('down', 900, 300, 0);
      for (let i = 0; i < 60 * 6; i++) { inst.pointer('move', 900, 300, 0); inst.update(1 / 60); }
      inst.pointer('up', 900, 300, 0);
      ok(D.ship.fuel > 350, 'fuel left ' + D.ship.fuel.toFixed(0));
      key(inst, 'Space', ' ', true);
      for (let i = 0; i < 60 * 5; i++) inst.update(1 / 60);
      key(inst, 'Space', ' ', false);
      ok(Math.hypot(D.ship.vx, D.ship.vy) < 8, 'brake left speed ' + Math.hypot(D.ship.vx, D.ship.vy).toFixed(0));
      r = null; const b = CA.MG.defs.an.create(api(1, (x) => (r = x)), 1), E = b._dbg();
      for (let i = 0; i < 60 * 100 && !r; i++) { // steer by mouse at the beacon; brake when told to
        const tg = E.target(), c = b.coach(), cam = E.st.cam, say = c.t || c;
        const brake = say === CA.t('an.coachBrake') || say.startsWith(CA.t('an.coachSlow', { n: 12 }).slice(0, 6));
        key(b, 'Space', ' ', brake);
        b.pointer(!brake && say === CA.t('an.coachGo') ? 'down' : 'up', tg.x - cam.x, tg.y - cam.y, 0);
        b.update(1 / 60);
      }
      ok(r && r.success, r ? r.message : 'no result');
    });
    t('Black Hole Approach: tapping as the prompts say settles into the L1 band', () => {
      let r = null; const inst = CA.MG.defs.bh.create(api(1, (x) => (r = x)), 1);
      const tap = { u: 0, d: 0 }; let look = 0;
      for (let i = 0; i < 60 * 90 && !r; i++) {
        if (--look <= 0) { // a person looks about four times a second and answers with a short tap
          const c = inst.coach(), say = c.t || c; look = 15;
          if (say === CA.t('bh.coachLower') || say === CA.t('bh.coachRound')) tap.d = 12;
          if (say === CA.t('bh.coachRaise') || say === CA.t('bh.coachFall')) tap.u = 12;
        }
        key(inst, 'KeyW', 'w', tap.u-- > 0); key(inst, 'KeyS', 's', tap.d-- > 0);
        inst.update(1 / 60);
      }
      ok(r && r.success, r ? r.message : 'no result');
    });
    t('Supernova Survival: an alert shows the safe lanes and frees the probe before the shock', () => {
      const inst = CA.MG.defs.sn.create(api(1, () => {}), 1), D = inst._dbg();
      while (D.st.t < D.nu.tc + 0.5) inst.update(1 / 60);
      inst.pointer('down', 100, 100, 0); eq(D.st.alert !== null, true);
      const before = [D.ship.x, D.ship.y];
      for (let i = 0; i < 60; i++) inst.update(1 / 60);
      eq(D.st.phase, 'watch'); ok(Math.hypot(D.ship.x - before[0], D.ship.y - before[1]) > 40, 'probe moved');
    });
  }

  if (CA.MG && CA.MG.defs.sa) {
    log('Phase 5 minigames');
    const Mo = CA.Models;
    const api = (level, seedBase, done) => ({ w: () => 960, h: () => 600, level, rng: CA.U.rng(seedBase + level * 97), sfx: () => {}, finish: done });
    t('Spectral Analysis: every true element shows lines and is a choice; Wien peak of the Sun ≈ 500 nm', () => {
      for (let L = 1; L <= 5; L++) {
        const task = Mo.saNew(L, seeded(L));
        for (const e of task.want) { ok(task.cands.includes(e), 'L' + L + ' candidate ' + e); ok(task.lines.some((ln) => ln.el === e), 'L' + L + ' lines of ' + e); }
      }
      ok(Math.abs(Mo.wienPeak(5800) - 500) < 2);
      const em = Mo.saNew(4, seeded(1)); ok(Mo.saFlux(em, 500.7) > 0.9 && Mo.saFlux(em, 560) < 0.1, 'emission lines on a dark background');
    });
    t('Spectral Analysis: the check finds missing and extra elements, velocity and temperature errors', () => {
      const a = Mo.saNew(2, seeded(3));
      ok(Mo.saCheck(a, { els: a.want.slice() }).ok);
      const miss = Mo.saCheck(a, { els: a.want.filter((e) => e !== 'Fe') }); ok(!miss.ok && miss.missing[0] === 'Fe' && miss.unexplained.length === 6);
      const extra = Mo.saCheck(a, { els: a.want.concat('He') }); ok(!extra.ok && extra.extra[0] === 'He');
      const z = Mo.saNew(3, seeded(4)); ok(z.v >= 3000 && z.v <= 12000);
      ok(Mo.saCheck(z, { els: z.want, v: z.v + 200 }).ok); ok(!Mo.saCheck(z, { els: z.want, v: z.v + 1000 }).ok);
      const c = Mo.saNew(5, seeded(5));
      ok(Mo.saCheck(c, { els: c.want, T: c.T * 1.03 }).ok); ok(!Mo.saCheck(c, { els: c.want, T: c.T * 1.15 }).ok);
    });
    t('Spectral Analysis: a correct answer wins; three wrong answers lose', () => {
      for (let L = 1; L <= 5; L++) {
        let r = null; const D = CA.MG.defs.sa.create(api(L, 4000, (x) => (r = x)), L)._dbg();
        D.task.want.forEach((e) => D.toggle(e)); D.st.v = D.task.v; D.st.T = D.task.T; D.submit();
        ok(r && r.success, 'L' + L);
      }
      let r = null; const D = CA.MG.defs.sa.create(api(2, 4000, (x) => (r = x)), 2)._dbg();
      D.toggle('He'); D.submit(); ok(!r); D.submit(); D.submit(); ok(r && !r.success);
    });
    function ptRun(level, presser) {
      const m = Mo.ptNew(level, seeded(7 + level)), dt = 1 / 120;
      const st = { k: 0, last: 0 };
      while (!m.won && !m.failed && m.t < 200) { Mo.ptStep(m, dt); presser(m, st); }
      return m;
    }
    const perfect = (m, st) => { while (st.k < m.arr.length && m.t >= m.arr[st.k]) { Mo.ptPress(m, m.t); st.k++; } };
    const metronome = (m, st) => { if (m.t >= m.arr[0] + st.k * m.P0) { Mo.ptPress(m, m.t); st.k++; } };
    t('Pulsar Timing: perfect timing clears every level; idle and button-mashing fail', () => {
      for (let L = 1; L <= 5; L++) { const m = ptRun(L, perfect); ok(m.won, 'perfect L' + L + ' ' + m.failed); }
      ok(ptRun(1, () => {}).failed === 'missed');
      ok(ptRun(1, (m, st) => { if (m.t - st.last > 0.1) { st.last = m.t; Mo.ptPress(m, m.t); } }).failed === 'spam');
    });
    t('Pulsar Timing: a constant metronome fails once the period drifts (spin-down, glitch, orbit, planets)', () => {
      ok(ptRun(1, metronome).won, 'a steady pulsar is a metronome');
      for (let L = 2; L <= 5; L++) ok(!ptRun(L, metronome).won, 'metronome should fail L' + L);
    });
    t('Pulsar Timing: following the beat by ear (next = last arrival + last interval) clears every level', () => {
      const ear = (m, st) => {
        const i = st.k; if (i >= m.arr.length) return;
        const due = i < 2 ? m.arr[i] : 2 * m.arr[i - 1] - m.arr[i - 2]; // only pulses already heard
        if (m.t >= due) { Mo.ptPress(m, m.t); st.k++; }
      };
      for (let L = 1; L <= 5; L++) { const m = ptRun(L, ear); ok(m.won, 'by ear L' + L + ': ' + m.hits + ' hits'); }
    });
    t('Pulsar Timing: residuals against a constant clock grow under spin-down', () => {
      const m = ptRun(2, perfect); ok(m.res[m.res.length - 1].model > 1, 'late pulses pile up: ' + m.res[m.res.length - 1].model.toFixed(2));
    });
    function anRun(level, pilot) {
      let r = null;
      const inst = CA.MG.defs.an.create(api(level, 3000, (x) => (r = x)), level), D = inst._dbg();
      for (let i = 0; i < 60 * 200 && !r; i++) { if (pilot) pilot(D); inst.update(1 / 60); }
      return r || { success: false };
    }
    // fly toward a (moving) point with a braking profile, using only rotation + the main engine
    function steer(D, tx, ty, tvx, tvy, stopAt, vmax) {
      const s = D.ship, dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy) || 1;
      const sp = Math.min(vmax, Math.sqrt(2 * 30 * Math.max(0, d - stopAt)));
      const ex = tvx + (dx / d) * sp - s.vx, ey = tvy + (dy / d) * sp - s.vy;
      const want = Math.atan2(ey, ex), da = Math.atan2(Math.sin(want - s.a), Math.cos(want - s.a));
      D.input.turn = Math.max(-1, Math.min(1, da * 4)); D.input.thrust = Math.hypot(ex, ey) > 2 && Math.abs(da) < 0.3 ? 1 : 0;
    }
    t('Asteroid Navigation: drifting does nothing; a pilot that brakes reaches the beacon and the moving target', () => {
      ok(!anRun(1, null).success, 'idle should fail');
      const r1 = anRun(1, (D) => { const tg = D.target(); steer(D, tg.x, tg.y, 0, 0, 5, 45); }); ok(r1.success, 'beacon: ' + r1.message);
      const r2 = anRun(2, (D) => { const tg = D.target(); steer(D, tg.x, tg.y, tg.vx, tg.vy, tg.r + 12, 45); }); ok(r2.success, 'rendezvous: ' + r2.message);
    });
    t('DART: a head-on hit shortens the moonlet\'s period by over 4%, a hit from behind lengthens it', () => {
      const K = Mo.AN_MOON, v = (CA.U.TAU * K.a) / K.P, moon = { x: K.a, y: 0, vx: 0, vy: v };
      const head = Mo.dartImpact(moon, K.mu, { vx: 0, vy: -150 - v }, K.ratio); ok(head.dP < -0.04, 'head-on ' + head.dP.toFixed(3));
      const back = Mo.dartImpact(moon, K.mu, { vx: 0, vy: 150 }, K.ratio); ok(back.dP > 0, 'from behind ' + back.dP.toFixed(3));
      const side = Mo.dartImpact(moon, K.mu, { vx: -150, vy: 0 }, K.ratio); ok(Math.abs(side.dP) < 0.01, 'sideways ' + side.dP.toFixed(4));
    });
    t('Phase 5 records are saved, validated and kept across cycles; cleared levels feed back into the game', () => {
      const s = S.create(); ok(s.mg.sa && s.mg.an && s.mg.pt);
      s.mg.sa.cleared = 3; s.mg.pt.best[2] = 1234;
      const raw = JSON.parse(JSON.stringify(s)); delete raw.mg.an; raw.mg.sa.cleared = 99;
      const v = S.validate(raw).state; eq(v.mg.sa.cleared, 5); eq(v.mg.an.cleared, 0); eq(v.mg.pt.best[2], 1234);
      eq(S.newCycle(s, 0).mg.sa.cleared, 3);
      const h0 = E.mult(s, 'heavy'); s.mg.an.cleared = 5; ok(Math.abs(E.mult(s, 'heavy') / h0 - 1.4) < 1e-9, 'heavy income');
      s.stage = 'whitedwarf'; s.remnant = Evo.makeRemnant('wd', 0.6, s);
      s.mg.sa.cleared = 0; const a = Evo.observe(s); s.mg.sa.cleared = 5; const b = Evo.observe(s); ok(Math.abs(b / a - 1.5) < 1e-6, 'observe ' + (b / a));
      for (const id of ['nebulium', 'tc_star', 'dart', 'pulsar_planets']) ok(CA.DISCOVERY[id], id);
    });
  }

  if (CA.MG && CA.MG.defs.bh) {
    log('Phase 5: black hole approach');
    const Mo = CA.Models, K = Mo.BH, rs = K.rs;
    const api = (level, seedBase, done) => ({ w: () => 960, h: () => 600, level, rng: CA.U.rng(seedBase + level * 97), sfx: () => {}, finish: done });
    t('pseudo-Newtonian potential: ISCO at 3 r_s, unstable orbits inside it, marginally bound orbit at 2 r_s', () => {
      let best = 0, bl = Infinity;
      for (let r = 1.5 * rs; r < 8 * rs; r += 0.01 * rs) { const l = Mo.bhLcirc(r, K.GM, rs); if (l < bl) { bl = l; best = r; } }
      ok(Math.abs(best / rs - 3) < 0.02, 'ISCO ' + (best / rs).toFixed(3));
      const curv = (r) => { const L = Mo.bhLcirc(r, K.GM, rs), h = 0.01 * rs; return Mo.bhVeff(r + h, L, K.GM, rs) - 2 * Mo.bhVeff(r, L, K.GM, rs) + Mo.bhVeff(r - h, L, K.GM, rs); };
      ok(curv(4 * rs) > 0 && curv(2.5 * rs) < 0, 'stable outside, unstable inside');
      const E = (r) => Mo.bhVcirc(r, K.GM, rs) ** 2 / 2 - K.GM / (r - rs);
      ok(Math.abs(E(2 * rs)) < 1e-6 * K.GM / rs && E(2.5 * rs) < 0 && E(1.8 * rs) > 0, 'marginally bound at 2 r_s');
      ok(Math.abs(Mo.bhDilation(4 * rs, rs) - Math.sqrt(0.75)) < 1e-12, 'clock rate');
      ok(Math.abs(Mo.bhTide(3.3 * rs, rs, 3.3) - 1) < 1e-12 && Math.abs(Mo.bhTide(5.6 * rs, rs, 3.3) * 8 - 1) < 1e-9, 'tide ∝ (r − r_s)⁻³');
    });
    t('light: inside b_c = 2.6 r_s it falls in, just outside it circles the hole, far away it bends by 2 r_s / b', () => {
      const R = 9 * rs, bc = Mo.BH_BC * rs;
      ok(Mo.bhPhoton(0.995 * bc, R, rs).captured, 'inside the shadow');
      const near = Mo.bhPhoton(1.005 * bc, R, rs); ok(!near.captured && near.swept > 2 * Math.PI, 'loops ' + near.swept.toFixed(2));
      ok(Math.abs(near.rmin / rs - 1.5) < 0.1, 'skims the photon sphere ' + (near.rmin / rs).toFixed(2));
      const wide = Mo.bhPhoton(1.1 * bc, R, rs); ok(!wide.captured && wide.swept < 2 * Math.PI, 'no loop ' + wide.swept.toFixed(2));
      const b = 60 * rs, Rf = 6000 * rs, far = Mo.bhPhoton(b, Rf, rs, { rOut: Rf, step: 0.0005 });
      const defl = far.swept - (Math.PI - 2 * Math.asin(b / Rf));
      ok(Math.abs(defl / (2 * rs / b) - 1) < 0.05, 'weak-field deflection ' + (defl / (2 * rs / b)).toFixed(3));
    });
    function bhRun(level, pilot) {
      let r = null;
      const inst = CA.MG.defs.bh.create(api(level, 5000, (x) => (r = x)), level), D = inst._dbg();
      for (let i = 0; i < 120 * 200 && !r; i++) { if (pilot) pilot(D); inst.update(1 / 120); }
      return r || { success: false, message: 'timeout' };
    }
    // autopilot: aim for the local circular speed plus a gentle radial approach to radius rt; then thrust prograde
    function hover(D, rt) {
      const s = D.ship, r = Math.hypot(s.x, s.y), rx = s.x / r, ry = s.y / r;
      if (D.st.phase === 'escape') { const v = Math.hypot(s.vx, s.vy); D.input.dir = [s.vx / v, s.vy / v]; return; }
      const vr = Math.max(-25, Math.min(25, 0.9 * (rt * rs - r))), vt = Mo.bhVcirc(r, K.GM, rs);
      const ex = rx * vr - ry * vt - s.vx, ey = ry * vr + rx * vt - s.vy, e = Math.hypot(ex, ey);
      D.input.dir = e > 1.5 ? [ex / e, ey / e] : null;
    }
    t('Black Hole Approach: doing nothing fails; an autopilot clears the band, ISCO, time-dilation and tidal levels', () => {
      for (let L = 1; L <= 4; L++) ok(!bhRun(L, null).success, 'idle L' + L);
      const target = [0, 5, 2.6, 3.3, 3.6];
      for (let L = 1; L <= 4; L++) { const r = bhRun(L, (D) => hover(D, target[L])); ok(r.success, 'L' + L + ': ' + r.message); }
      const deep = bhRun(4, (D) => hover(D, 3.0)); ok(!deep.success, 'tides should tear the probe below 3.3 r_s');
      const dive = bhRun(1, (D) => { D.input.rad = -1; }); ok(!dive.success, 'diving straight in fails');
    });
    t('Black Hole Approach L5: light aimed just outside the shadow circles the hole; inside it, every pulse is lost', () => {
      const shoot = (bFrac, shots) => {
        let r = null; const inst = CA.MG.defs.bh.create(api(5, 5000, (x) => (r = x)), 5), D = inst._dbg();
        D.aim(Math.asin((bFrac * Mo.BH_BC * rs) / D.R));
        for (let k = 0; k < shots && !r; k++) { D.fire(); for (let i = 0; i < 120 * 12 && !r && !(D.st.shot.over && D.st.endT <= 0); i++) inst.update(1 / 120); }
        for (let i = 0; i < 400 && !r; i++) inst.update(1 / 120);
        return r || { success: false };
      };
      ok(shoot(1.01, 1).success, 'one loop');
      ok(!shoot(0.95, 6).success, 'all captured');
      ok(CA.DISCOVERY.photon_sphere && CA.DISCOVERY.sn1987a);
      const s = S.create(); ok(s.mg.bh && s.mg.sn, 'saved');
      s.stage = 'blackhole'; s.remnant = Evo.makeRemnant('bh', 10, s);
      const feed = () => { s.res.energy = 0; s.remnant.accr = 0; return Evo.absorb(s, 'gas', 0.01, 1).energy; }; // tiny feed: stays under the energy cap
      const e0 = feed(); s.mg.bh.cleared = 5;
      ok(e0 > 0 && Math.abs(feed() / e0 - 1.4) < 1e-6, 'accretion energy +8% per level');
    });
  }

  if (CA.MG && CA.MG.defs.sn) {
    log('Phase 5: supernova survival');
    const Mo = CA.Models;
    const api = (level, seedBase, done) => ({ w: () => 960, h: () => 600, level, rng: CA.U.rng(seedBase + level * 97), sfx: () => {}, finish: done });
    t('supernova light curve: peak near day 85 for a slow (SN 1987A-like) diffusion; the tail halves every 77 days', () => {
      const p = Mo.snPeak(65); ok(Math.abs(p.day - 85) < 6, 'peak day ' + p.day);
      const ratio = Mo.snLight(100 + 77.2, 20) / Mo.snLight(100, 20); ok(Math.abs(ratio - 0.5) < 0.005, 'tail ratio ' + ratio.toFixed(4));
      ok(Mo.snPeak(14).day < Mo.snPeak(28).day, 'slower diffusion, later peak');
    });
    t('neutrino record: a burst at the collapse stands out of the background; alerts are judged by time', () => {
      for (let L = 1; L <= 5; L++) {
        const lv = Mo.SN_LEVELS[L], nu = Mo.snNuNew(lv, seeded(20 + L));
        const inBurst = nu.ev.filter((e) => e.t >= nu.tc && e.t <= nu.tc + 2).length, bg = nu.ev.filter((e) => !e.burst && e.t < nu.tc);
        ok(inBurst >= lv.burst, 'L' + L + ' burst'); ok(bg.every((e) => e.t > 0), 'background after t=0');
        eq(Mo.snAlert(nu, nu.tc - 0.1), 'false'); eq(Mo.snAlert(nu, nu.tc + 1), 'ok'); eq(Mo.snAlert(nu, nu.tc + Mo.SN_ALERT_WIN + 0.1), 'late');
      }
    });
    function snRun(level, pilot, seed = 0) {
      let r = null;
      const inst = CA.MG.defs.sn.create(api(level, 6000 + seed, (x) => (r = x)), level), D = inst._dbg();
      for (let i = 0; i < 120 * 120 && !r; i++) { if (pilot) pilot(D); inst.update(1 / 120); }
      return r || { success: false, message: 'timeout' };
    }
    // alert after the burst, slip through the nearest gap when a front is about to cross, chase clumps, observe at the peak
    function snPilot(D, opts = {}) {
      const { st, nu, ship, fronts, clumps, L, peak, tauD, mark } = D, t = st.t;
      if (!opts.noAlert && st.phase === 'watch' && st.alert === null && t >= nu.tc + 0.5) D.press();
      if (st.phase === 'light') {
        const l = Mo.snLight(st.light.day, tauD);
        if (L.tail ? st.light.day >= mark.day && l <= mark.L / 2 : l >= (L.peakTol + (1 - L.peakTol) * 0.3) * peak.L) D.press();
        return;
      }
      const r = Math.hypot(ship.x, ship.y), ang = Math.atan2(ship.y, ship.x);
      const R = (f, tt) => (tt < f.t0 ? f.r0 : Mo.snFrontR(f, tt));
      let target = null;
      for (const f of fronts) {
        if (t < f.t0 - 1.6 || (t > f.t0 && (f.dir > 0 ? R(f, t) > 575 : R(f, t) < 42))) continue;
        const a = R(f, t), b = R(f, t + 1.6), lo = Math.min(a, b) - 28, hi = Math.max(a, b) + 28;
        if (r < lo || r > hi) continue;
        let best = null, bd = Infinity;
        for (const gp of f.gaps) { const d = Math.abs(Math.atan2(Math.sin(gp.a - ang), Math.cos(gp.a - ang))); if (d < bd) { bd = d; best = gp; } }
        target = [Math.cos(best.a) * r, Math.sin(best.a) * r];
        break;
      }
      if (!target) {
        let bd = Infinity;
        for (const c of clumps) {
          if (c.got || c.gone || t < c.t0) continue;
          const d = Math.hypot(c.x - ship.x, c.y - ship.y); if (d < bd) { bd = d; target = [c.x + Math.cos(c.a) * c.v * 0.25, c.y + Math.sin(c.a) * c.v * 0.25]; }
        }
      }
      D.input.dir = target ? [target[0] - ship.x, target[1] - ship.y] : null;
    }
    t('Supernova Survival: idling or spamming the alert fails; a pilot that alerts, dodges and observes clears every level', () => {
      ok(!snRun(1, null).success, 'idle');
      ok(snRun(1, (D) => { if (D.st.phase === 'watch') D.press(); }).message === CA.t('sn.failFalse'), 'spam alert');
      for (let L = 1; L <= 5; L++) for (const seed of [0, 1]) { const r = snRun(L, (D) => snPilot(D), seed); ok(r.success, 'L' + L + ' seed ' + seed + ': ' + r.message); }
      const quiet = snRun(5, (D) => snPilot(D, { noAlert: true })); ok(!quiet.success && quiet.message === CA.t('sn.failNu'), 'level 5 needs the alert');
    });
    t('Supernova Survival is saved; cleared levels raise the supernova ejecta yield', () => {
      const s = S.create(); s.stage = 'supernova';
      const h = () => { s.res.heavy = 0; return Evo.absorb(s, 'ejecta', 1, 1).heavy; };
      const h0 = h(); s.mg.sn.cleared = 5; ok(Math.abs(h() / h0 - 1.5) < 1e-9, 'ejecta +10% per level');
      eq(S.validate(JSON.parse(JSON.stringify(s))).state.mg.sn.cleared, 5);
    });
  }

  if (CA.Events) {
    log('Cosmic events');
    const Ev = CA.Events;
    const PLANET = () => ({ type: 'terrestrial', mass: CA.U.M_EARTH, zone: 'inner', engulfed: false, lostBy: '' });
    // a state sitting in `stage`, past the minimum stage time, with no cooldowns
    function evState(stage, extra) {
      const s = S.create(); s.stage = stage; s.reached[stage] = true; s.stageTime = 100; s.ev.gcd = 0;
      const d = CA.STAGE[stage];
      if (d.type === 'mass' || d.type === 'planet') s.mass = Math.sqrt(d.massStart * d.massEnd);
      if (d.chapter >= 3) s.star = { M0: 1, M: 1, Tc: 5, fuel: 0.5, pg: 1, comp: 1, wind: false, burn: 0, age: 0, flash: false, wr: false, ignited: true, pulsePhase: 0, rg: 1 };
      if (d.type === 'remnant') s.remnant = Evo.makeRemnant(d.kind, d.kind === 'wd' ? 0.6 : d.kind === 'ns' ? 1.4 : 10, s);
      if (extra) extra(s);
      return s;
    }
    // advance the event clock with no player input (rand 0.99: no new random starts)
    function run(s, sec, dt = 0.05) { const evs = []; for (let i = 0; i < sec / dt; i++) evs.push(...Ev.tick(s, dt, { rand: () => 0.99 })); return evs; }
    const endOf = (evs) => evs.find((e) => e.type === 'ev_end');

    t('every event names real stages, timing, and outcomes for its mode', () => {
      const need = { catch: ['success', 'fail'], impactor: ['captured', 'merged', 'deflected', 'shattered'], calm: ['success', 'fail'], front: ['success'], pulsation: ['success', 'fail'] };
      ok(CA.EVENTS.length >= 8);
      for (const d of CA.EVENTS) {
        ok(d.stages.length && d.stages.every((id) => id in CA.STAGE), d.id + ' stages');
        ok(d.cooldown > 0 && d.warn > 0 && Ev.duration(d) > 0, d.id + ' timing');
        need[d.mode].forEach((o) => ok(d.outcomes[o], d.id + ' outcome ' + o));
        if (d.mode === 'front') ok(d.outcomes[d.timeout], d.id + ' timeout outcome');
        for (const o in d.outcomes) if (d.outcomes[o].discovery) ok(CA.DISCOVERY[d.outcomes[o].discovery], d.id + ' discovery');
      }
    });
    t('events start only in their stages, never right after a stage begins', () => {
      eq(Ev.eligible(evState('grain')).length, 0, 'grain');
      eq(Ev.start(evState('mainseq'), 'accretion_surge', { force: true }).length, 0, 'surge outside a black hole');
      eq(Ev.start(evState('grain'), 'meteor_shower', { force: true }).length, 0, 'meteors in grain');
      const s = evState('planetesimal'); s.stageTime = 3; eq(Ev.eligible(s).length, 0, 'too early');
      s.stageTime = 100; eq(Ev.eligible(s).map((d) => d.id).sort().join(), 'asteroid_impact,disk_disturbance,meteor_shower');
      Ev.start(s, 'meteor_shower'); eq(Ev.start(s, 'asteroid_impact', { force: true }).length, 0, 'one event at a time');
    });
    t('science conditions: pulsation needs the instability strip, a CME needs something to hit', () => {
      const ms = (M) => evState('mainseq', (s) => { s.star.M0 = M; });
      ok(!Ev.canStart(ms(1), 'stellar_pulsation').ok, '1 M☉'); ok(Ev.canStart(ms(2), 'stellar_pulsation').ok, '2 M☉'); ok(Ev.canStart(ms(12), 'stellar_pulsation').ok, '12 M☉');
      ok(!Ev.canStart(evState('redgiant'), 'stellar_pulsation').ok, '1 M☉ giant');
      ok(!Ev.canStart(ms(1), 'cme').ok, 'no planet');
      const p = ms(1); p.planet = PLANET(); ok(Ev.canStart(p, 'cme').ok, 'with planet');
      p.planet.engulfed = true; ok(!Ev.canStart(p, 'cme').ok, 'engulfed planet');
    });
    t('random triggering: right stage, cooldowns respected, steady rate (30 min per stage)', () => {
      const rnd = seeded(11);
      for (const stage of ['core', 'pebble', 'planet', 'mainseq', 'blackhole']) {
        const s = evState(stage, (x) => { if (x.star) x.star.M0 = 2; x.planet = PLANET(); });
        let time = 0, lastEnd = -1e9, n = 0; const lastStart = {};
        for (let i = 0; i < 30 * 60 * 10; i++) {
          time += 0.1;
          for (const e of Ev.tick(s, 0.1, { rand: rnd })) {
            if (e.type === 'ev_start') {
              n++; ok(CA.EVENT[e.id].stages.includes(stage), e.id + ' in ' + stage);
              ok(time - lastEnd >= CA.BAL.events.globalCd - 0.2, 'global gap');
              if (lastStart[e.id] !== undefined) ok(time - lastStart[e.id] >= CA.EVENT[e.id].cooldown, 'own cooldown ' + e.id);
              lastStart[e.id] = time;
            }
            if (e.type === 'ev_end') lastEnd = time;
          }
          Ev.drainSpawns(s);
        }
        ok(n >= 4 && n <= 25, stage + ': ' + n + ' events in 30 min');
      }
    });
    t('meteor stream: spawns the stream once, success pays exactly once', () => {
      const s = evState('planetesimal'), def = CA.EVENT.meteor_shower; Ev.start(s, 'meteor_shower', { force: true }); const a = s.ev.active;
      eq(Ev.drainSpawns(s), 0, 'nothing during the warning');
      let spawned = 0; const evs = [];
      for (let i = 0; i < 400 && s.ev.active; i++) {
        evs.push(...Ev.tick(s, 0.05)); spawned += Ev.drainSpawns(s);
        if (a.phase === 'active' && a.caught < def.target + 2) { const c = Ev.onCatch(s, a.uid, { grabbed: true }); if (c) evs.push(...c.events); }
      }
      eq(spawned, def.count, 'stream size');
      const end = endOf(evs); eq(end.outcome, 'success'); ok(end.rewards.heavy > 0 && s.discovered.meteor_stream, 'reward + discovery'); ok(evs.some((e) => e.type === 'ev_goal'));
      const heavy = s.res.heavy;
      eq(Ev.onCatch(s, a.uid, { grabbed: true }), null, 'late catch ignored');
      run(s, 60); eq(s.res.heavy, heavy, 'no second payout'); ok(s.granted[a.uid]);
      s.ev.active = Object.assign({}, a, { done: false, t: 0, phase: 'warn', caught: 99 }); // a replayed instance (same uid)
      const e2 = endOf(run(s, 30)); ok(e2 && e2.duplicate, 'replay flagged'); eq(s.res.heavy, heavy, 'replay pays nothing');
    });
    t('a missed event gives nothing and takes nothing', () => {
      const s = evState('protoplanet'); s.res.matter = 500; const m = s.mass;
      Ev.start(s, 'meteor_shower', { force: true });
      eq(endOf(run(s, 20)).outcome, 'fail'); eq(s.res.matter, 500); eq(s.mass, m); eq(s.stage, 'protoplanet'); ok(s.ev.cd.meteor_shower > 0);
    });
    t('asteroid: damped hit merges, fast hit shatters (never below the stage start), orbit makes a moon', () => {
      const go = (stage) => { const s = evState(stage); Ev.start(s, 'asteroid_impact', { force: true }); run(s, 6); eq(Ev.drainSpawns(s), 1, 'one impactor'); return [s, s.ev.active.uid]; };
      let [s, uid] = go('planetesimal'); const p0 = Evo.progress(s);
      eq(Ev.onImpact(s, uid, 80, 150)[0].outcome, 'merged'); ok(Evo.progress(s) > p0 + 0.07, 'merge adds progress');
      [s, uid] = go('protoplanet'); s.mass = CA.STAGE.protoplanet.massStart * 1.001;
      eq(Ev.onImpact(s, uid, 300, 150)[0].outcome, 'shattered'); eq(s.mass, CA.STAGE.protoplanet.massStart); eq(s.stage, 'protoplanet');
      [s, uid] = go('planet');
      eq(Ev.onOrbit(s, uid)[0].outcome, 'captured'); eq(s.system.length, 1); eq(s.system[0].type, 'moon'); ok(s.discovered.captured_moon);
      eq(Ev.onImpact(s, uid, 80, 150), null, 'already resolved');
      [s, uid] = go('planet'); for (let i = 0; i < 8; i++) s.system.push({ type: 'minor', name: 'x', a: 2, e: 0 });
      const full = Ev.onOrbit(s, uid)[0]; eq(full.effect.added, false); eq(s.system.length, 8); ok(full.rewards.research > 0);
      [s, uid] = go('planet'); eq(Ev.onLost(s, uid)[0].outcome, 'deflected');
    });
    t('interstellar visitor: one fast body on an open path; only catching it with the well finds ʻOumuamua', () => {
      eq(Ev.start(evState('planetesimal'), 'interstellar', { force: true }).length, 0, 'not in the planetesimal stage');
      const s = evState('planet'); Ev.start(s, 'interstellar', { force: true }); run(s, 4.5);
      eq(Ev.drainSpawns(s), 1, 'a single visitor'); const uid = s.ev.active.uid;
      eq(Ev.onCatch(s, uid, { grabbed: false }).counted, false, 'falling onto the body does not count');
      Ev.onCatch(s, uid, { grabbed: true }); eq(endOf(run(s, 12)).outcome, 'success'); ok(s.discovered.oumuamua);
      const m = evState('mainseq'); Ev.start(m, 'interstellar', { force: true }); eq(endOf(run(m, 16)).outcome, 'fail'); ok(!m.discovered.oumuamua);
    });
    t('Roche limit: an impactor captured inside 2.44 body radii becomes a ring (one per system), outside it a moon', () => {
      const s = evState('planet');
      const go = (dist) => { Ev.start(s, 'asteroid_impact', { force: true }); run(s, 6); Ev.drainSpawns(s); return Ev.onOrbit(s, s.ev.active.uid, dist)[0]; };
      const a = go(1.8); eq(a.outcome, 'ring'); eq(a.effect.added, true); eq(s.system[0].type, 'ring'); ok(s.discovered.rings);
      const b = go(2.0); eq(b.outcome, 'ring'); eq(b.effect.added, false, 'only one ring');
      eq(go(3.2).outcome, 'captured'); eq(s.system.length, 2);
      eq(S.validate(JSON.parse(JSON.stringify(s))).state.system[0].type, 'ring', 'saved');
    });
    t('CME: a pulse in the window deflects it, early pulses miss, no pulse only drains energy', () => {
      const def = CA.EVENT.cme, mk = () => evState('mainseq', (s) => { s.planet = PLANET(); s.res.energy = 100; });
      let s = mk(); Ev.start(s, 'cme', { force: true });
      let r = Ev.respond(s, 'pulse'); eq(r.good, false); eq(r.text, 'Too early'); ok(s.ev.active, 'still running');
      for (let i = 0; i < 1000 && !Ev.inWindow(s.ev.active, def); i++) Ev.tick(s, 0.05);
      r = Ev.respond(s, 'pulse'); ok(r.good); eq(r.events[0].outcome, 'success'); ok(s.res.heavy > 0); ok(s.discovered.space_weather);
      s = mk(); Ev.start(s, 'cme', { force: true });
      eq(endOf(run(s, 15)).outcome, 'hit'); ok(Math.abs(s.res.energy - 65) < 1e-6, 'energy ' + s.res.energy); eq(s.stage, 'mainseq'); eq(s.star.fuel, 0.5);
    });
    t('pulsation: stabilizing at maximum twice damps it; ignoring it only costs energy', () => {
      const def = CA.EVENT.stellar_pulsation;
      let s = evState('supergiant', (x) => { x.star.M0 = 20; x.star.M = 20; }); Ev.start(s, 'stellar_pulsation', { force: true });
      const until = (f) => { for (let i = 0; i < 3000 && s.ev.active && !f(); i++) Ev.tick(s, 0.02); };
      until(() => s.ev.active.phase === 'active' && Math.sin(s.ev.active.osc) < -0.5);
      let r = Ev.respond(s, 'stabilize'); eq(r.good, false); ok(s.ev.active.amp > 1, 'mistimed press grows it');
      until(() => Ev.atPeak(s.ev.active, def)); ok(Ev.radiusMult(s) > 1); r = Ev.respond(s, 'stabilize'); ok(r.good, 'first');
      until(() => Math.sin(s.ev.active.osc) < 0); until(() => Ev.atPeak(s.ev.active, def)); r = Ev.respond(s, 'stabilize'); ok(r.good, 'second');
      eq(r.events[0].outcome, 'success'); eq(s.ev.active, null); ok(s.discovered.pulsating_star);
      s = evState('mainseq', (x) => { x.star.M0 = 2; x.res.energy = 80; }); Ev.start(s, 'stellar_pulsation', { force: true });
      let swing = 0; for (let i = 0; i < 700; i++) { Ev.tick(s, 0.05); swing = Math.max(swing, Math.abs(s.star.pg - 1)); }
      ok(swing > 0.1, 'drives P/G ' + swing); eq(s.ev.active, null); ok(Math.abs(s.res.energy - 60) < 1e-6, 'energy'); eq(s.stage, 'mainseq');
    });
    t('accretion surge: only sub-Eddington feeding counts', () => {
      const s = evState('blackhole'); Ev.start(s, 'accretion_surge', { force: true }); run(s, 6); const a = s.ev.active;
      s.remnant.accr = 100; eq(Ev.onCatch(s, a.uid).counted, false); eq(a.wasted, 1);
      s.remnant.accr = 0; ok(Ev.onCatch(s, a.uid).counted); eq(a.caught, 1);
      for (let i = 0; i < 9; i++) Ev.onCatch(s, a.uid);
      const end = endOf(run(s, 40)); eq(end.outcome, 'success'); ok(s.res.remnants >= 2, 'remnants'); eq(end.fx, 'jets');
    });
    t('disk disturbance: intact catches beat shattered ones; success gives a buff', () => {
      let s = evState('aggregate'); Ev.start(s, 'disk_disturbance', { force: true });
      Ev.onAbsorb(s, 1, 'dust'); eq(s.ev.active.intact, 0, 'warning phase does not count');
      run(s, 5); for (let i = 0; i < 12; i++) Ev.onAbsorb(s, 1, 'dust'); Ev.onAbsorb(s, 0.5, 'dust'); Ev.onAbsorb(s, 1, 'spark');
      eq(Ev.calmScore(s.ev.active, CA.EVENT.disk_disturbance), 10);
      run(s, 20); eq(s.buffs.length, 1); eq(E.buffMult(s, 'matter'), 1.5); ok(s.discovered.dust_trap);
      s = evState('aggregate'); Ev.start(s, 'disk_disturbance', { force: true }); run(s, 5); for (let i = 0; i < 12; i++) Ev.onAbsorb(s, 0.3, 'dust');
      eq(endOf(run(s, 20)).outcome, 'fail'); eq(s.buffs.length, 0);
    });
    t('supernova shock: riding it compresses the core more; it never collapses the core by itself', () => {
      const def = CA.EVENT.sn_shock;
      let s = evState('core', (x) => { x.core = { M: 1, T: 20 }; }); Ev.start(s, 'sn_shock', { force: true });
      for (let i = 0; i < 500 && !Ev.inWindow(s.ev.active, def); i++) Ev.tick(s, 0.05);
      ok(Ev.respond(s, 'pulse').good); ok(Math.abs(s.core.M - 1.2) < 1e-9); eq(s.stage, 'core');
      s = evState('core', (x) => { x.core = { M: 1, T: 20 }; }); Ev.start(s, 'sn_shock', { force: true });
      eq(endOf(run(s, 15)).outcome, 'pass'); ok(Math.abs(s.core.M - 1.06) < 1e-9); eq(s.core.T, 21); eq(s.stage, 'core');
    });
    t('an event fades without reward or loss if the stage changes', () => {
      const s = evState('mainseq', (x) => { x.res.energy = 50; }); Ev.start(s, 'solar_flare', { force: true });
      s.stage = 'supergiant'; const end = endOf(run(s, 1));
      eq(end.outcome, 'faded'); eq(end.rewards, null); eq(s.res.energy, 50); ok(s.ev.cd.solar_flare > 0);
    });
    t('saves keep event cooldowns and counters, drop the running event, repair bad data', () => {
      const s = evState('planet'); Ev.start(s, 'meteor_shower', { force: true }); s.ev.cd.cme = 40; s.ev.cd.bogus = 9;
      const v = S.validate(JSON.parse(JSON.stringify(s))).state;
      eq(v.ev.active, null); eq(v.ev.seq, 1); eq(v.ev.count.meteor_shower, 1); eq(v.ev.cd.cme, 40); eq(v.ev.cd.bogus, undefined); ok(v.ev.gcd >= CA.BAL.events.loadDelay);
      const bad = S.validate({ version: 1, stage: 'planet', ev: { seq: -5, cd: { cme: 'x' }, count: null } }).state;
      eq(bad.ev.seq, 0); eq(Object.keys(bad.ev.cd).length, 0);
      ok(S.validate({ version: 1 }).state.ev.gcd > 0, 'old save without events');
    });
    t('event grant keys stay unique across cycles and the save stays small', () => {
      const s = evState('whitedwarf'); s.ev.seq = 7; s.ev.count.stellar_flyby = 3;
      const n = Evo.newCycle(s, 5).state; eq(n.ev.seq, 7); eq(n.ev.count.stellar_flyby, 3);
      const x = evState('blackhole');
      for (let i = 0; i < 200; i++) { Ev.start(x, 'accretion_surge', { force: true }); run(x, 0.1); x.stage = 'mainseq'; run(x, 0.1); x.stage = 'blackhole'; }
      eq(x.ev.seq, 200); ok(Object.keys(x.granted).filter((k) => k.startsWith('ev:')).length <= CA.BAL.events.keepKeys, 'pruned');
    });
    if (CA.Sim) t('sim: tagged motes are caught by touching the well', () => {
      const w = new CA.Sim.World(); w.reset(800, 600); const ctx = CA.Sim.defaultCtx(); ctx.spawnRate = 0; ctx.well = { active: true, x: 200, y: 0 };
      const m = w.make('meteor', 210, 0, 0, 0, 1); m.ev = 'ev:1:1'; m.grab = true; w.make('dust', 300, 200, 0, 0, 1);
      const a = w.step(1 / 60, ctx).find((e) => e.kind === 'absorb'); ok(a && a.ev === 'ev:1:1' && a.grabbed, 'caught at the well'); eq(w.motes.length, 1);
    });
  }

  if (CA.Binary) {
    log('Phase 5: binary endgame');
    const Bin = CA.Binary, BB = CA.BAL.binary, Star = Evo.Star;
    const STAR = (M0) => ({ M0, M: M0, Tc: 10, fuel: 0, pg: 1, comp: 1, wind: false, burn: 0, age: 0, flash: false, wr: false, ignited: true, pulsePhase: 0, rg: Star.R(M0) });
    const rem = (type, mass, s) => Evo.makeRemnant(type, mass, s);
    // a star entering its giant phase with `type` of `mass` as companion; ctrl(c, s) moves the player's slider
    function donor(M0, type, mass, ctrl) {
      const s = S.create(); s.stage = M0 >= 8 ? 'supergiant' : 'redgiant'; s.reached[s.stage] = true; s.star = STAR(M0);
      if (M0 >= 8) s.star.rg = 300;
      s.companion = Bin.makeCompanion(rem(type, mass, s), 1);
      const rnd = seeded(11), evs = [];
      let peak = null, i = 0;
      while (Bin.DONORS.includes(s.stage) && i++ < 5000) {
        if (s.companion) { ctrl(s.companion, s); peak = s.companion; }
        evs.push(...Evo.tick(s, 0.05, { rand: rnd }));
      }
      return { s, evs, c: peak };
    }
    const steady = (c, s) => { c.valve = 0.5 / (1 + BB.drift * (Evo.progress(s) - 0.5)); }; // keeps x ≈ 1 as the star swells
    // a remnant of type a, companion b, ready to spiral in. play(c, t) may press.
    function pairState(a, ma, b, mb) {
      const s = S.create(); s.stage = { wd: 'whitedwarf', ns: 'neutronstar', bh: 'blackhole' }[a]; s.reached[s.stage] = true; s.star = STAR(10);
      s.remnant = rem(a, ma, s); s.companion = Bin.makeCompanion(rem(b, mb, s), 1);
      return s;
    }
    const perfect = (c, t) => { if (c.idx < c.N && t >= Bin.beatT(c, c.idx)) Bin.press(c, t); };
    function runMerger(s, play) {
      const rnd = seeded(5), evs = [];
      const r = Evo.advance(s); ok(r.ok, 'inspiral starts: ' + r.reason); evs.push(...r.events);
      let i = 0;
      while (CA.STAGE[s.stage].type !== 'remnant' && i++ < 20000) {
        if (s.stage === 'inspiral' && play) play(s.chirp, s.stageTime);
        evs.push(...Evo.tick(s, 0.01, { rand: rnd }));
      }
      return evs;
    }

    t('a remnant can stay as the next cycle\'s companion, for half the reward', () => {
      const s = pairState('ns', 1.4, 'wd', 0.6); s.companion = null; s.stageTime = 30; s.res.remnants = 0;
      const full = Evo.newCycle(JSON.parse(JSON.stringify(s)), 1), kept = Evo.newCycle(s, 1, { keep: true });
      eq(full.state.companion, null); eq(kept.state.companion.type, 'ns'); eq(kept.state.companion.mass, 1.4);
      eq(kept.reward.remnants, Math.round(Evo.cycleReward(s).remnants * BB.keepShare));
      ok(kept.state.res.remnants < full.state.res.remnants, 'costs reward');
    });
    t('an unmerged companion is released by the next cycle; a new one can replace it', () => {
      const s = pairState('wd', 0.8, 'bh', 12); s.stageTime = 30;
      const a = Evo.newCycle(JSON.parse(JSON.stringify(s)), 1), b = Evo.newCycle(s, 1, { keep: true });
      eq(a.state.companion, null); eq(b.state.companion.type, 'wd');
    });
    t('Roche lobe: Eggleton fit (0.38 a at q = 1, larger for a heavier donor)', () => {
      ok(Math.abs(Bin.rocheLobe(1, 1) - 0.379) < 0.002); ok(Bin.rocheLobe(1, 5) > Bin.rocheLobe(1, 1)); ok(Bin.rocheLobe(1, 0.2) < Bin.rocheLobe(1, 1));
    });
    t('stable transfer pushes a white dwarf to 1.4 M☉: Type Ia, and the donor lives on', () => {
      const r = donor(3, 'wd', 0.9, steady);
      eq(r.s.companion, null); ok(r.s.discovered.type_ia, 'discovery'); ok(r.s.origins.ia, 'origin'); ok(r.s.res.heavy >= BB.rewards.ia.heavy, 'reward');
      ok(r.evs.some((e) => e.type === 'cinematic' && e.id === 'ia'), 'cinematic'); ok(['agb', 'pnebula'].includes(r.s.stage), 'star survives: ' + r.s.stage);
    });
    t('a light donor has too little envelope to reach Chandrasekhar', () => {
      const r = donor(1, 'wd', 0.6, steady); ok(r.s.companion && r.s.companion.mass < BB.chandra, 'no explosion'); ok(!r.s.origins.ia);
      ok(r.c.fed <= 1 - Star.wdMass(1) + 1e-9, 'never more than the envelope');
    });
    t('too slow → novae blow the gas away, too fast → common envelope ends the transfer', () => {
      const lo = donor(3, 'wd', 0.8, (c) => { c.valve = 0.2; }); eq(lo.c.gained, 0); ok(lo.evs.some((e) => e.note === 'bin.nova'), 'nova'); ok(lo.c.mass === 0.8);
      const hi = donor(3, 'wd', 0.8, (c) => { c.valve = 1; }); ok(hi.c.ended, 'ended'); ok(hi.evs.some((e) => e.note === 'bin.ce'), 'common envelope'); ok(hi.c.mass < BB.chandra);
    });
    t('leaving the slider alone drifts out of the band as the star swells', () => {
      const r = donor(5, 'wd', 0.7, () => {}); ok(!r.s.origins.ia, 'untouched slider must not reach Chandrasekhar'); ok(r.c.mass < BB.chandra);
    });
    t('accretion spins a neutron star up to a millisecond pulsar and buries its field', () => {
      eq(Bin.spinUp(0.033, 0), 0.033); const P = Bin.spinUp(0.033, 0.08); ok(P > 0.0015 && P < 0.0025, '0.08 M☉ gives ~2 ms: ' + P);
      const r = donor(4, 'ns', 1.4, steady); ok(r.s.discovered.msp, 'msp'); ok(r.c.P < BB.mspP && r.c.P >= BB.minP, 'P ' + r.c.P); ok(r.c.B < 1e12, 'field buried');
    });
    t('a supergiant donor loses the mass it transfers; a black hole just feeds', () => {
      const a = donor(14, 'bh', 8, steady), b = donor(14, 'bh', 8, (c) => { c.valve = 0; c.ended = true; });
      ok(a.c.mass > 8.4, 'black hole grew: ' + a.c.mass); ok(a.s.star.M < b.s.star.M, 'donor lighter');
    });
    t('no transfer before the star fills its Roche lobe', () => {
      const s = pairState('wd', 1, 'wd', 1); s.stage = 'redgiant'; s.remnant = null; s.star = STAR(2); s.star.rg = 5;
      ok(!Bin.transferring(s)); s.star.rg = Bin.lobe(s) + 1; ok(Bin.transferring(s));
    });

    t('chirp law: phase ∝ τ^(5/8), frequency ∝ τ^(−3/8), separation ∝ τ^(1/4)', () => {
      const c = Bin.newChirp({ type: 'ns', mass: 1.4 }, { type: 'ns', mass: 1.4 });
      ok(Math.abs(Bin.freq(c, c.T - 1) / Bin.freq(c, c.T - 8) - Math.pow(8, 0.375)) < 1e-9, 'f');
      ok(Math.abs(Bin.sep(c, c.T - 1) / Bin.sep(c, c.T - 16) - 0.5) < 1e-9, 'a'); eq(Bin.phase(c, c.T), c.N);
      for (let k = 0; k < c.N; k++) ok(Math.abs(Bin.phase(c, Bin.beatT(c, k)) - (k + 1)) < 1e-9, 'beat ' + k);
      for (let k = 2; k < c.N; k++) ok(Bin.beatT(c, k) - Bin.beatT(c, k - 1) < Bin.beatT(c, k - 1) - Bin.beatT(c, k - 2), 'beats speed up');
      ok(Bin.beatT(c, c.N - 2) - Bin.beatT(c, c.N - 3) > 0.15, 'the last beats stay playable');
    });
    t('chirp mass matches GW170817 and GW150914; heavier pairs chirp faster', () => {
      ok(Math.abs(Bin.chirpMass(1.46, 1.27) - 1.188) < 0.01, 'GW170817'); ok(Math.abs(Bin.chirpMass(36, 29) - 28.3) < 0.5, 'GW150914 ' + Bin.chirpMass(36, 29));
      ok(Bin.chirpDur(28) < Bin.chirpDur(1.2)); ok(Bin.chirpDur(1000) >= BB.chirp.Tmin && Bin.chirpDur(0.1) <= BB.chirp.Tmax);
    });
    t('SNR: perfect = maximum, nothing = 0, mashing < 8, late beats are worth more than early ones', () => {
      const P = () => Bin.newChirp({ type: 'bh', mass: 30 }, { type: 'bh', mass: 25 });
      const c = P(); for (let k = 0; k < c.N; k++) { const r = Bin.press(c, Bin.beatT(c, k)); ok(r.hit, 'beat ' + k); if (k === c.N - 1) ok(r.merger, 'merger'); }
      ok(Math.abs(Bin.snr(c) - BB.chirp.snrMax) < 1e-9); eq(Bin.snr(P()), 0);
      const m = P(); for (let t2 = 0; t2 < m.T; t2 += 0.07) Bin.press(m, t2); ok(Bin.snr(m) < BB.chirp.snrDetect, 'mash ' + Bin.snr(m));
      const e = P(), l = P(); for (let k = 0; k < 8; k++) Bin.press(e, Bin.beatT(e, k)); for (let k = e.N - 8; k < e.N; k++) Bin.press(l, Bin.beatT(l, k));
      ok(Bin.snr(l) > 2 * Bin.snr(e), 'late beats'); ok(Bin.detected(l), 'the last 8 beats alone are a detection');
      const j = P(), rnd = seeded(3); for (let k = 0; k < j.N; k++) Bin.press(j, Bin.beatT(j, k) + (rnd() - 0.5) * 0.1); ok(Bin.detected(j), 'a human-sized ±50 ms jitter is enough: ' + Bin.snr(j));
    });
    t('each beat scores once and a late press does not count for the next one', () => {
      const c = Bin.newChirp({ type: 'wd', mass: 1 }, { type: 'wd', mass: 1 }), b0 = Bin.beatT(c, 0);
      ok(Bin.press(c, b0).hit); ok(!Bin.press(c, b0 + 0.01).hit, 'second press on one beat'); eq(c.hits, 1); eq(c.falses, 1);
      ok(!Bin.press(c, b0 + 0.6).hit, 'between beats');
    });
    t('every pair of remnants has the right outcome', () => {
      const o = (a, ma, b, mb) => Bin.outcome({ type: a, mass: ma }, { type: b, mass: mb });
      const x = o('wd', 0.8, 'wd', 0.7); eq(x.kind, 'ia'); eq(x.product, 'none');
      const y = o('wd', 0.6, 'wd', 0.6); eq(y.kind, 'wdwd'); eq(y.product, 'wd'); ok(y.mass < BB.chandra);
      eq(o('ns', 1.4, 'ns', 1.4).product, 'bh'); eq(o('ns', 1.25, 'ns', 1.25).product, 'ns'); eq(o('ns', 1.4, 'ns', 1.4).kind, 'kilonova');
      eq(o('bh', 5, 'ns', 1.4).kind, 'kilonova'); eq(o('ns', 1.4, 'bh', 12).kind, 'nsbh'); eq(o('wd', 0.8, 'ns', 1.4).kind, 'nswd'); eq(o('bh', 9, 'wd', 0.8).kind, 'bhwd');
      const b = o('bh', 36, 'bh', 29); eq(b.kind, 'bbh'); ok(Math.abs(65 - b.mass - 3) < 0.2, 'about 3 M☉ radiated, like GW150914');
    });
    t('two neutron stars: inspiral → kilonova ejecta → black hole, cell and discovery', () => {
      const s = pairState('ns', 1.4, 'ns', 1.5), evs = runMerger(s, perfect);
      eq(s.stage, 'blackhole'); ok(Math.abs(s.remnant.mass - 0.97 * 2.9) < 1e-9); ok(s.discovered.kilonova); ok(s.origins.kilonova); ok(s.reached.merger, 'went through the ejecta stage');
      eq(s.companion, null); eq(s.chirp, null); ok(evs.some((e) => e.type === 'cinematic' && e.id === 'kilonova')); ok(!evs.some((e) => e.type === 'cinematic' && e.id === 'blackhole'), 'one cinematic only');
    });
    t('two black holes: detected only above SNR 8; no ejecta; timing scales the reward', () => {
      const a = pairState('bh', 30, 'bh', 25), b = pairState('bh', 30, 'bh', 25);
      runMerger(a, perfect); runMerger(b, null);
      eq(a.stage, 'blackhole'); ok(!a.reached.merger, 'black holes leave no ejecta'); ok(a.discovered.gw_merger); ok(!b.discovered.gw_merger, 'undetected');
      ok(a.res.remnants > b.res.remnants * 2, a.res.remnants + ' vs ' + b.res.remnants);
    });
    t('two white dwarfs over the limit: Type Ia leaves a supernova remnant and a new cycle', () => {
      const s = pairState('wd', 0.8, 'wd', 0.75); runMerger(s, perfect);
      eq(s.stage, 'snr'); ok(s.origins.ia); ok(s.discovered.type_ia); ok(s.discovered['stage:snr']);
      for (let i = 0; i < 500; i++) Evo.tick(s, 0.05, { rand: () => 0.5 });
      ok(Evo.energyProduction(s) > 0 && isFinite(Evo.passive(s).energy)); ok(Evo.observe(s) > 0, 'observable'); ok(!Bin.canKeep(s), 'nothing to keep');
      ok(Math.abs(Bin.snrRadius(450) - 4) < 1e-9, 'Tycho-sized at 450 yr');
      const n = Evo.newCycle(s, 1, { keep: true }); ok(n, 'new cycle'); eq(n.state.companion, null); ok(n.state.origins.ia, 'cell stays');
    });
    t('a merger pays once per cycle', () => {
      const s = pairState('ns', 1.3, 'ns', 1.3); runMerger(s, perfect);
      const before = s.res.research; s.chirp = Bin.newChirp({ type: 'ns', mass: 1.3 }, { type: 'ns', mass: 1.3 }); Bin.finishMerger(s, []); eq(s.res.research, before); s.chirp = null;
    });
    t('remnants without a companion stay final', () => {
      const s = pairState('wd', 0.6, 'wd', 0.6); s.companion = null; ok(!Evo.canAdvance(s).ok); ok(!Evo.advance(s).ok);
    });

    t('magnetars: only neutron stars from 20+ M☉ stars, by chance', () => {
      ok(Bin.rollMagnetar(25, () => 0.1)); ok(!Bin.rollMagnetar(25, () => 0.9)); ok(!Bin.rollMagnetar(12, () => 0));
      const mk = (M0, r) => { const s = S.create(); s.stage = 'supernova'; s.star = STAR(M0); s.star.M = 14; s.star.fate = { type: 'ns', mass: 1.5, sn: true }; s.stageTime = 99; const a = Evo.advance(s, 'neutronstar', { rand: () => r }); ok(a.ok, a.reason); return s; };
      const m = mk(25, 0.1); ok(m.remnant.magnetar); ok(m.remnant.B >= 1e15); ok(m.discovered.magnetar); ok(!mk(25, 0.9).remnant.magnetar); ok(!mk(12, 0).remnant.magnetar);
      for (let i = 0; i < 400; i++) Evo.tick(m, 0.05, { rand: () => 0.5 }); ok(m.remnant.P > 2 && m.remnant.P <= BB.magnetar.maxP, 'slows to seconds: ' + m.remnant.P);
    });
    if (CA.Events) t('a magnetar burst gives an FRB only when observed in the instant it crosses the ring', () => {
      const Ev = CA.Events, def = CA.EVENT.magnetar_burst;
      const mk = () => { const s = pairState('ns', 1.4, 'ns', 1.4); s.companion = null; s.stageTime = 100; s.ev.gcd = 0; s.remnant.magnetar = true; return s; };
      const p = mk(); p.remnant.magnetar = false; ok(!Ev.canStart(p, 'magnetar_burst').ok, 'ordinary pulsar');
      const s = mk(); Ev.start(s, 'magnetar_burst', { rand: () => 0.3 });
      while (Ev.active(s) && !Ev.inWindow(Ev.active(s), def)) Ev.tick(s, 0.02, { rand: () => 0.99 });
      const r = Ev.respond(s, 'observe'); ok(r.good); ok(s.discovered.frb); eq(s.res.remnants, 3);
      const q = mk(); Ev.start(q, 'magnetar_burst', { rand: () => 0.3 }); Ev.tick(q, def.warn + 0.1, { rand: () => 0.99 }); ok(!Ev.respond(q, 'observe').good, 'too early'); ok(!q.discovered.frb);
    });

    t('origin table: six cells, each once; the sixth plays the ending exactly once', () => {
      const s = S.create(); eq(Bin.ORIGINS.length, 6); let evs = [];
      Bin.ORIGINS.slice(0, 5).forEach((id) => evs.push(...Bin.markOrigin(s, id))); ok(!s.ended); ok(!evs.some((e) => e.type === 'ending'));
      eq(Bin.markOrigin(s, 'bigbang').length, 0, 'repeat'); eq(Bin.markOrigin(s, 'nonsense').length, 0);
      evs = Bin.markOrigin(s, 'kilonova'); ok(s.ended); ok(evs.some((e) => e.type === 'cinematic' && e.id === 'ending')); ok(evs.some((e) => e.type === 'ending'));
      s.origins.ia = false; delete s.origins.ia; ok(!Bin.markOrigin(s, 'ia').some((e) => e.type === 'ending'), 'not twice');
    });
    t('the table fills from normal play: core, AGB pulse, silicon, supernova', () => {
      const s = S.create(); s.stage = 'cluster'; s.mass = CA.STAGE.cluster.massEnd; Evo.advance(s); ok(s.origins.bigbang, 'bigbang');
      const r = runStar(12); ok(r.s.origins.massive, 'massive'); ok(r.s.origins.ccsn, 'ccsn');
      const a = runStar(1); ok(!a.s.origins.agb, 'agb needs a captured pulse');
      const g = S.create(); g.stage = 'agb'; g.star = STAR(2); g.stageTime = 3; const cp = Evo.capturePulse(g); ok(cp.heavy > 0); ok(g.origins.agb); eq(cp.events[0].id, 'agb');
    });
    t('endgame state survives a save, and bad data is repaired', () => {
      const s = pairState('wd', 0.8, 'ns', 1.5); s.companion.valve = 0.3; s.companion.msp = true; s.origins.agb = true; s.origins.hacked = true; s.ended = true; s.remnant.magnetar = false;
      const v = S.validate(JSON.parse(JSON.stringify(s))).state;
      eq(v.companion.type, 'ns'); eq(v.companion.valve, 0.3); ok(v.companion.msp); ok(v.origins.agb); ok(!('hacked' in v.origins)); ok(v.ended);
      const bad = JSON.parse(JSON.stringify(s)); bad.companion = { type: 'star', mass: 5 }; eq(S.validate(bad).state.companion, null);
      const bad2 = JSON.parse(JSON.stringify(s)); bad2.companion.mass = 1e9; bad2.companion.x = -3; const c2 = S.validate(bad2).state.companion; eq(c2.mass, 500); eq(c2.x, 0);
    });
    t('reloading mid-inspiral restarts the chirp; mid-ejecta keeps the outcome; an old save has no companion', () => {
      const s = pairState('ns', 1.4, 'ns', 1.4); Evo.advance(s); s.stageTime = 12; s.chirp.hits = 5; s.chirp.w = 3;
      const v = S.validate(JSON.parse(JSON.stringify(s))).state; eq(v.stageTime, 0); eq(v.chirp.hits, 0); eq(v.chirp.a.type, 'ns');
      const m = pairState('ns', 1.4, 'ns', 1.4); Evo.advance(m); m.stageTime = 99; Evo.tick(m, 0.01); eq(m.stage, 'merger');
      const w = S.validate(JSON.parse(JSON.stringify(m))).state; eq(w.chirp.out.kind, 'kilonova'); for (let i = 0; i < 500; i++) Evo.tick(w, 0.05, { rand: () => 0.5 }); eq(w.stage, 'blackhole');
      const o = JSON.parse(JSON.stringify(S.create())); delete o.companion; delete o.chirp; delete o.origins; delete o.ended; const x = S.validate(o); eq(x.warnings.length, 0); eq(x.state.companion, null);
      const broken = JSON.parse(JSON.stringify(s)); delete broken.chirp; const y = S.validate(broken); ok(y.state.chirp, 'rebuilt'); ok(y.warnings.length > 0);
    });
    t('new cycles keep the table and the ending', () => {
      const s = pairState('ns', 1.4, 'ns', 1.4); s.companion = null; s.stageTime = 30; s.origins = { bigbang: true, ia: true }; s.ended = true;
      const n = Evo.newCycle(s, 1).state; ok(n.origins.ia); ok(n.ended);
    });
    t('every stage reachable from a merger has a working console value', () => {
      for (const id of ['inspiral', 'merger', 'snr']) { const d = CA.STAGE[id]; ok(d.spawn && d.abilities.length && d.objective && d.science, id); ok(d.abilities.every((a) => CA.ABILITIES[a]), 'ability ' + id); }
      ok(CA.STAGE.whitedwarf.next.includes('inspiral')); eq(CA.STAGE.snr.next.length, 0);
    });
  }

  if (CA.Ach) {
    log('Phase 5: achievements');
    const A = CA.Ach, ACH = CA.ACHIEVEMENTS, BY = {};
    ACH.forEach((a) => (BY[a.id] = a));
    const earnedBy = (s) => A.check(s).map((e) => e.id);
    const everyStage = () => CA.STAGES.map((d) => {
      const raw = S.create(1); raw.stage = d.id;
      if (d.chapter >= 3) raw.star = { M0: 12, M: 12, ignited: true };
      return S.validate(JSON.parse(JSON.stringify(raw)), 1).state;
    });
    t('about 30 achievements, every category used, data is well formed', () => {
      ok(ACH.length >= 28 && ACH.length <= 36, 'count ' + ACH.length);
      eq(new Set(ACH.map((a) => a.id)).size, ACH.length, 'ids unique');
      for (const a of ACH) {
        ok(A.CATS.includes(a.cat), a.id + ' cat'); ok(CA.BAL.ach.reward[a.tier] > 0, a.id + ' tier'); ok(a.name && a.desc, a.id + ' text');
        ok(a.count ? a.of > 0 : typeof a.test === 'function', a.id + ' rule');
      }
      for (const c of A.CATS) ok(ACH.some((a) => a.cat === c), 'empty category ' + c);
    });
    t('a new game has earned nothing', () => { eq(earnedBy(S.create(1)).length, 0); });
    t('no rule throws in any stage (no star, no remnant, no planet)', () => {
      for (const s of everyStage()) { A.check(s); CA.Atlas.track(s); }
    });
    t('every achievement can be earned', () => {
      const s = S.create(1), got = new Set();
      const take = (st) => earnedBy(st).forEach((id) => got.add(id));
      CA.DISCOVERIES.forEach((d) => (s.discovered[d.id] = true));
      CA.Binary.ORIGINS.forEach((k) => (s.origins[k] = true));
      CA.State.MG_IDS.forEach((id) => (s.mg[id].cleared = 5));
      CA.EVENTS.forEach((e) => { s.ev.count[e.id] = 2; s.ev.won[e.id] = 2; });
      s.ev.won.cme = 30;
      Object.assign(s.stats, { cycles: 5, minigames: 40, bestSnr: 15 }); s.Z = 0.02;
      s.companion = CA.Binary.makeCompanion({ type: 'wd', mass: 0.6 }, 1);
      take(s);
      const fresh = (fn) => { const x = S.create(1); fn(x); take(x); };
      fresh((x) => { x.star = { M0: 45, ignited: true }; });
      fresh((x) => { x.star = { M0: 0.09, ignited: true }; });
      fresh((x) => { x.planet = { type: 'gasgiant', lostBy: 'ejected' }; x.system = [{ type: 'ring' }]; });
      fresh((x) => { x.remnant = Evo.makeRemnant('wd', 0.6, x); x.remnant.age = 601; });
      fresh((x) => { x.remnant = Evo.makeRemnant('ns', 1.4, x); x.remnant.best = 50; });
      const miss = ACH.filter((a) => !got.has(a.id)).map((a) => a.id);
      eq(miss.length, 0, 'never earned: ' + miss.join(', '));
    });
    t('a star that never ignited does not count, and a lost planet is not always ejected', () => {
      const s = S.create(1); s.star = { M0: 50, ignited: false }; s.planet = { type: 'terrestrial', lostBy: 'engulfed' };
      ok(!A.met(s, BY.heavyweight)); ok(!A.met(s, BY.rogue_planet)); s.star.ignited = true; ok(A.met(s, BY.heavyweight));
    });
    t('research is paid once and the second check finds nothing', () => {
      const s = S.create(1); s.discovered['stage:mainseq'] = true; s.res.research = 5;
      const first = A.check(s); eq(first.length, 1); eq(first[0].id, 'first_light'); eq(s.res.research, 5 + CA.BAL.ach.reward[0]);
      eq(A.check(s).length, 0); eq(s.res.research, 5 + CA.BAL.ach.reward[0]); ok(A.earned(s, 'first_light'));
    });
    t('the reward goes through grantOnce: a key already granted pays nothing', () => {
      const s = S.create(1); s.discovered['stage:mainseq'] = true; s.granted[A.key('first_light')] = true;
      eq(A.check(s).length, 0); eq(s.res.research, 0);
    });
    t('progress is clamped to the goal; yes/no achievements have none', () => {
      const s = S.create(1); s.discovered.terrestrial = true; s.discovered.gasgiant = true;
      eq(A.progress(s, BY.all_worlds).join(), '2,4'); s.stats.cycles = 9; eq(A.progress(s, BY.generations).join(), '5,5'); eq(A.progress(s, BY.heavyweight), null);
    });
    t('achievements survive a new cycle and a save and load', () => {
      const s = S.create(1); s.stats.cycles = 1; A.check(s); ok(A.earned(s, 'once_more'));
      s.stage = 'whitedwarf'; s.remnant = Evo.makeRemnant('wd', 0.6, s); s.stageTime = 30;
      const n = Evo.newCycle(s, 2).state; ok(A.earned(n, 'once_more')); eq(n.stats.cycles, 2); eq(A.check(n).length, 0);
      const st = stub(); S.save(n, st); const l = S.load(st).state; ok(A.earned(l, 'once_more')); eq(A.check(l).length, 0);
    });
    t('an old save with no achievements catches up once, without warnings', () => {
      const raw = JSON.parse(JSON.stringify(S.create(1))); delete raw.atlas; delete raw.stats.bestSnr; raw.discovered.terrestrial = true; raw.stats.cycles = 2;
      const v = S.validate(raw, 1); eq(v.warnings.length, 0); eq(earnedBy(v.state).sort().join(), 'first_world,once_more'); eq(A.check(v.state).length, 0); eq(v.state.stats.bestSnr, 0);
    });
    t('a real merger: NS + NS earns Forge of Gold, and a loud signal earns Clean Signal', () => {
      const s = S.create(1); s.stage = 'inspiral'; s.chirp = CA.Binary.newChirp({ type: 'ns', mass: 1.4 }, { type: 'ns', mass: 1.4 });
      for (let k = 0; k < s.chirp.N; k++) CA.Binary.press(s.chirp, CA.Binary.beatT(s.chirp, k));
      s.stageTime = CA.Binary.endT(s.chirp) + 0.01; const r = Evo.advance(s, undefined, { rand: () => 0.5 }); ok(r.ok, r.reason);
      ok(s.stats.bestSnr > 15, 'SNR ' + s.stats.bestSnr); const got = earnedBy(s);
      ok(got.includes('forge_of_gold')); ok(got.includes('clean_signal')); eq(s.atlas.kilonova.n, 1); ok(s.atlas.kilonova.v > 15);
    });
  }

  if (CA.Atlas) {
    log('Phase 5: codex');
    const At = CA.Atlas, L = CA.ATLAS, BY = CA.ATLAS_BY;
    const facts = (e) => e.facts.split(' | ').map((f) => f.split(': '));
    function fakeCtx() { // draws nothing; any canvas call is accepted
      const grad = { addColorStop() {} };
      return new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => grad : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
    }
    t('about 25 entries with the requested real examples and new bodies', () => {
      ok(L.length >= 25 && L.length <= 30, 'count ' + L.length); eq(new Set(L.map((e) => e.id)).size, L.length, 'ids unique');
      const ex = L.map((e) => e.example).join(' | ');
      for (const n of ['Arrokoth', 'Vesta', 'Proxima Centauri', 'Betelgeuse', 'Ring Nebula', 'Sirius B', 'Crab Pulsar', 'Cygnus X-1']) ok(ex.includes(n), 'example ' + n);
      for (const id of ['snr', 'magnetar', 'msp']) ok(BY[id], 'entry ' + id);
    });
    t('every entry unlocks from a real discovery and has a useful hint', () => {
      for (const e of L) {
        ok(At.GROUPS.includes(e.group), e.id + ' group'); ok(CA.DISCOVERY[e.disc], e.id + ' disc ' + e.disc);
        if (e.disc.startsWith('stage:')) ok(e.hint, e.id + ' needs its own hint');
        ok(At.hint(e), e.id + ' hint');
      }
    });
    t('related links point to real entries, never to themselves', () => {
      for (const e of L) { ok(e.rel.length, e.id + ' has links'); for (const r of e.rel) { ok(BY[r], e.id + ' → ' + r); ok(r !== e.id, e.id + ' self link'); } }
    });
    t('facts read as label: value, the same number in both languages', () => {
      const en = {}; for (const e of L) { en[e.id] = facts(e); ok(en[e.id].length >= 3, e.id); ok(en[e.id].every((f) => f.length === 2 && f[0] && f[1]), e.id + ' format'); }
      CA.I18n.setLang('ko');
      try { for (const e of L) { const ko = facts(e); eq(ko.length, en[e.id].length, e.id); ok(ko.every((f) => f.length === 2), e.id + ' ko format'); } }
      finally { CA.I18n.setLang('en'); }
    });
    t('every picture draws without an error, at either size', () => {
      for (const e of L) CA.Bodies.draw(fakeCtx(), e.view.kind, 0, 0, e.view.r, Object.assign({ t: 1, seed: 1, rot: 0.5, prog: 0.5 }, e.view.p));
    });
    t('every record has a label and a format; "lo" records keep the smallest', () => {
      for (const e of L) if (e.unit) { ok(CA.I18n.has('atlr.' + e.label), e.id + ' label'); ok(/\d/.test(At.fmt(e, 1.5)), e.id + ' fmt'); }
      const s = S.create(1); At.note(s, 'red_dwarf', 0.3); At.note(s, 'red_dwarf', 0.1); At.note(s, 'red_dwarf', 0.4); eq(s.atlas.red_dwarf.v, 0.1);
      At.note(s, 'massive', 9); At.note(s, 'massive', 30); At.note(s, 'massive', 12); eq(s.atlas.massive.v, 30);
    });
    t('a new game has found only the dust grain', () => {
      const s = S.create(1); eq(At.total(s), 1); ok(At.found(s, BY.grain));
    });
    t('sightings count once per cycle, and records carry across cycles', () => {
      const s = S.create(1); s.stage = 'mainseq'; s.star = { M0: 1.1, M: 1.1, ignited: true };
      At.track(s); At.track(s); eq(s.atlas.sunlike.n, 1); eq(s.atlas.sunlike.v, 1.1); ok(!s.atlas.massive);
      s.stage = 'whitedwarf'; s.remnant = Evo.makeRemnant('wd', 0.55, s); s.stageTime = 30; At.track(s); eq(s.atlas.whitedwarf.v, 0.55);
      const n = Evo.newCycle(s, 2).state; eq(n.atlas.sunlike.n, 1);
      n.stage = 'mainseq'; n.star = { M0: 0.9, M: 0.9, ignited: true }; At.track(n); eq(n.atlas.sunlike.n, 2); eq(n.atlas.sunlike.v, 1.1);
    });
    t('a magnetar is recorded as a magnetar, a plain pulsar is not', () => {
      const s = S.create(1); s.remnant = Evo.makeRemnant('ns', 1.4, s); s.remnant.best = 12; At.track(s); ok(!s.atlas.magnetar); eq(s.atlas.neutronstar.v, 12);
      s.remnant.magnetar = true; At.track(s); eq(s.atlas.magnetar.n, 1);
    });
    t('atlas records save and load; junk is dropped', () => {
      const s = S.create(1); At.note(s, 'massive', 30); const st = stub(); S.save(s, st); eq(S.load(st).state.atlas.massive.v, 30);
      const raw = JSON.parse(JSON.stringify(s)); raw.atlas = { massive: { n: -4, c: 'x', v: 'y' }, warp: { n: 1, c: 1, v: 1 }, sunlike: 7 };
      const a = S.validate(raw, 1).state.atlas; eq(a.massive.n, 0); eq(a.massive.c, 0); eq(a.massive.v, 0); ok(!a.warp); ok(!a.sunlike);
      raw.atlas = 'nonsense'; eq(Object.keys(S.validate(raw, 1).state.atlas).length, 0);
    });
    t('Type Ia by mass transfer is recorded although the star carries on', () => {
      const s = S.create(1); s.companion = CA.Binary.makeCompanion({ type: 'wd', mass: 1.39 }, 1); CA.Binary.typeIa(s, []); eq(s.atlas.type_ia.n, 1); ok(At.found(s, BY.type_ia));
    });
  }

  if (CA.I18n) {
    log('Language (English / 한국어)');
    const I = CA.I18n, ph = (x) => (String(x).match(/\{\w+\}/g) || []).sort().join();
    t('every English key has a Korean translation', () => {
      const miss = I.allKeys().filter((k) => typeof I.ko[k] !== 'string' || !I.ko[k].trim());
      eq(miss.length, 0, 'missing: ' + miss.slice(0, 8).join(', '));
    });
    t('Korean keeps the same {placeholders} as English', () => {
      const bad = I.allKeys().filter((k) => I.ko[k] && ph(I.ko[k]) !== ph(I.orig(k)));
      eq(bad.length, 0, 'mismatch: ' + bad.slice(0, 8).join(', '));
    });
    t('no Korean-only keys (typos)', () => {
      const all = new Set(I.allKeys()), extra = Object.keys(I.ko).filter((k) => !all.has(k));
      eq(extra.length, 0, 'unknown: ' + extra.slice(0, 8).join(', '));
    });
    t('switching language rewrites data in place and back', () => {
      I.setLang('ko'); eq(CA.STAGE.grain.name, '먼지 알갱이'); eq(CA.t('evr.early'), '너무 일찍'); eq(CA.DISCOVERY['stage:grain'].name, '먼지 알갱이');
      ok(CA.DISCOVERY['stage:grain'].desc.endsWith('다.'), 'stage discovery = first Korean sentence'); eq(CA.U.fmtYears(1e10), '100억 년');
      I.setLang('en'); eq(CA.STAGE.grain.name, 'Dust Grain'); eq(CA.ABILITIES.pulse.name, 'Gravity Pulse'); eq(CA.U.fmtYears(1e10), '10 billion yr');
    });
    t('settings default to Korean and reject unknown languages', () => {
      const st = stub(); eq(S.loadSettings(st).lang, 'ko');
      st.setItem(S.SETTINGS_KEY, JSON.stringify({ lang: 'fr' })); eq(S.loadSettings(st).lang, 'ko');
      st.setItem(S.SETTINGS_KEY, JSON.stringify({ lang: 'en' })); eq(S.loadSettings(st).lang, 'en');
    });
    I.setLang('en');
  }

  {
    log('Phase 6: keys, quality, light');
    const U = CA.U, Bodies = CA.Bodies, FX = CA.FX;
    t('shortcuts work while a Korean IME is on', () => {
      eq(U.keyOf({ key: 'ㅕ', code: 'KeyU' }), 'u'); eq(U.keyOf({ key: 'ㅁ', code: 'KeyA' }), 'a'); eq(U.keyOf({ key: 'Process', code: 'KeyE' }), 'e');
      eq(U.keyOf({ key: 'ㅈ', code: 'KeyW' }), 'w'); eq(U.keyOf({ key: 'Process', code: 'ArrowLeft' }), 'ArrowLeft'); eq(U.keyOf({ key: 'Process', code: 'Digit3' }), '3');
    });
    t('other keys and layouts keep their meaning', () => {
      eq(U.keyOf({ key: 'U', code: 'KeyU' }), 'u'); eq(U.keyOf({ key: 'a', code: 'KeyQ' }), 'a', 'AZERTY'); eq(U.keyOf({ key: 'Escape', code: 'Escape' }), 'Escape');
      eq(U.keyOf({ key: 'ArrowUp', code: 'ArrowUp' }), 'ArrowUp'); eq(U.keyOf({ key: '1', code: 'Digit1' }), '1'); eq(U.keyOf({ key: ' ', code: 'Space' }), ' '); eq(U.keyOf({}), '');
    });
    t('every minigame reads keys through keyOf', () => {
      if (typeof readFile === 'undefined') return;
      for (const f of ['asteroidNavigation', 'blackHoleApproach', 'supernovaSurvival', 'stellarStabilization', 'spectralAnalysis', 'framework'])
        ok(!/e\.key\.toLowerCase|e\.key === 'Arrow|e\.key\.startsWith/.test(readFile('js/minigames/' + f + '.js')), f);
    });
    t('auto quality drops only on sustained slow frames', () => {
      const g = new U.Governor();
      for (let i = 0; i < 3000; i++) g.sample(16.7);
      eq(g.level, 0, 'smooth');
      for (let i = 0; i < 30; i++) g.sample(45); // one second of a heavy moment
      for (let i = 0; i < 300; i++) g.sample(16.7);
      eq(g.level, 0, 'a brief dip');
      g.sample(30000); eq(g.level, 0, 'a tab switch');
      for (let i = 0; i < 100; i++) g.sample(45);
      eq(g.level, 1, 'slow');
      for (let i = 0; i < 1000; i++) g.sample(45);
      eq(g.level, 2, 'stops at the lowest level');
      for (let i = 0; i < 5000; i++) g.sample(16.7);
      eq(g.level, 2, 'does not bounce back');
    });
    t('quality setting defaults to auto and rejects unknown values', () => {
      const st = stub(); eq(S.loadSettings(st).quality, 'auto');
      st.setItem(S.SETTINGS_KEY, JSON.stringify({ quality: 'ultra' })); eq(S.loadSettings(st).quality, 'auto');
      st.setItem(S.SETTINGS_KEY, JSON.stringify({ quality: 'low' })); eq(S.loadSettings(st).quality, 'low');
    });
    t('every body kind has a sane light', () => {
      const kinds = new Set(Object.values(CA.STAGE).map((d) => d.kind));
      let lit = 0;
      for (const k of kinds) {
        const L = Bodies.lightOf(k, { T: 5000, Tc: 5, jeansRatio: 0.5 });
        if (!L) continue;
        lit++;
        ok(L.c.length === 3 && L.c.every((v) => v >= 0 && v <= 255 && v === (v | 0)), k + ' colour'); // integers: they go into rgba() strings
        ok(L.i > 0 && L.i <= 1 && L.reach > 0, k + ' strength');
      }
      ok(lit >= 10, 'stars and remnants shine');
      eq(Bodies.lightOf('grain', {}), null); eq(Bodies.lightOf('planet', {}), null);
    });
    t('a hot star lights the dust bluer than a cool one', () => {
      const hot = Bodies.lightOf('star', { T: 30000 }).c, cool = Bodies.lightOf('star', { T: 3200 }).c;
      ok(hot[2] > hot[0] && cool[2] < cool[0]);
    });
    t('a planet is lit from where the star is', () => {
      const centres = [], fake = new Proxy({}, { get: (o, k) => (k === 'createRadialGradient' ? (x) => { centres.push(x); return { addColorStop() {} }; } : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k in o ? o[k] : () => {}), set: (o, k, v) => ((o[k] = v), true) });
      Bodies.draw(fake, 'planet', 0, 0, 10, { t: 0, seed: 1, ptype: 'inner', lx: 1, ly: 0 });
      ok(centres.some((x) => x > 5), 'lit side faces +x');
      centres.length = 0;
      Bodies.draw(fake, 'planet', 0, 0, 10, { t: 0, seed: 1, ptype: 'inner' });
      ok(!centres.some((x) => x > 0) && centres.some((x) => x < -4), 'default stays upper left');
    });
    t('effects stay capped and the feeding glow fades', () => {
      FX.reset();
      for (let i = 0; i < 400; i++) { FX.burst(0, 0, 30, 'rgba(255,255,255,A)'); FX.ring(0, 0, 1, 2, 1, 'rgba(255,255,255,A)'); }
      ok(FX.items.length <= 500, 'items ' + FX.items.length);
      for (let i = 0; i < 40; i++) FX.fed(2);
      eq(FX.feed, 1);
      FX.update(1); eq(FX.feed, 0);
      FX.fed(2); FX.reset(); eq(FX.feed, 0);
    });
  }

  log((fail ? '✗ ' : '✓ ') + pass + ' passed, ' + fail + ' failed');
  if (!isShell) document.getElementById('out').textContent = out.join('\n');
})();
