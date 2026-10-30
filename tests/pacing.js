/* COSMIC ASCENSION — bot that plays whole cycles on the real rules and prints the pacing. Not part of the game or the build.
   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tests/pacing.js -- [cycles] [seed]
   The bot catches motes with the real particle sim, buys the cheapest upgrade it can, and uses no minigames or events,
   so a real player earns a bit more and aims a bit better or worse. Its times are for comparing balance changes. */
(function () {
  ['js/core/util.js', 'js/data/i18n.js', 'js/data/balance.js', 'js/data/stages.js', 'js/data/upgrades.js', 'js/data/events.js', 'js/core/state.js',
    'js/core/economy.js', 'js/core/evolution.js', 'js/core/binary.js', 'js/core/events.js', 'js/core/sim.js'].forEach((f) => load(f));
  const CA = globalThis.CA, U = CA.U, E = CA.Econ, Evo = CA.Evo, BAL = CA.BAL, B = BAL.sim, S = CA.State;
  const arg = globalThis.arguments || [];
  const CYCLES = +arg[0] || 3, rng = U.rng(+arg[1] || 1);
  Math.random = rng;
  const PLAN = [1, 15, 30, 1.2, 15, 30]; // target star mass per cycle
  const DT = 1 / 30, W = 1280, H = 800;
  const fmtT = (t) => (t >= 60 ? Math.floor(t / 60) + 'm' + String(Math.round(t % 60)).padStart(2, '0') : Math.round(t) + 's');
  const pad = (v, n) => String(v).padEnd(n);

  function radius(s) { // same as bodyRBase in game.js
    const d = CA.STAGE[s.stage], p = Evo.progress(s), St = Evo.Star;
    switch (d.kind) {
      case 'grain': return 9 + 7 * p;
      case 'cluster': return 13 + 9 * p;
      case 'core': return 46 + 20 * p;
      case 'aggregate': return 16 + 10 * p;
      case 'pebble': return 18 + 10 * p;
      case 'planetesimal': return 22 + 12 * p;
      case 'protoplanet': return 28 + 12 * p;
      case 'planet': return 34 + 6 * Math.log10(Math.max(1, s.mass / 6e22));
      case 'protostar': return 22 + 6 * Math.log10(1 + s.star.M);
      case 'star': return 18 + 14 * Math.log10(1 + St.R(s.star.M0));
      case 'giant': return 22 * Math.pow(Math.max(1, s.star.rg), 0.45);
      case 'supergiant': return 190;
      case 'pnebula': case 'supernova': return 30;
      case 'wd': return 7;
      case 'ns': return 6;
      case 'inspiral': return 12;
      case 'snr': return 26;
      case 'bh': return 28 + 5 * Math.log10(Math.max(1, s.remnant.mass));
    }
    return 20;
  }

  function ctxFor(s, c, bodyR) {
    const d = CA.STAGE[s.stage], L = (id) => E.lvl(s, id), p = Evo.progress(s);
    c.bodyR = bodyR;
    c.captureMult = (d.kind === 'core' ? 0.75 : 1) * (1 + 0.1 * L('focusing')) * (s.fx.boost > 0 ? 1.4 : 1);
    c.bodyStrength = B.bodyStrength * (d.type === 'mass' || d.type === 'planet' ? 1 + 0.8 * p : 1) * (d.runaway ? 1.4 : 1) * (d.kind === 'bh' ? 2.2 : 1);
    c.bodyRange = B.bodyRange * (1 + 0.12 * L('range')) * Math.max(1, Math.sqrt(bodyR / 25));
    c.wellStrength = B.wellStrength * (1 + 0.2 * L('well_strength'));
    c.wellRange = B.wellRange * (1 + 0.12 * L('range'));
    c.maxMotes = Math.round(B.maxMotes * (1 + 0.05 * L('flow')));
    c.spawnRate = B.spawnRate * (1 + 0.12 * L('flow')) * (d.collectAtCursor ? 1.6 : 1);
    const w = Object.assign({}, d.spawn);
    if (w.heavy) w.heavy *= U.clamp(s.Z / 0.01, 0.5, 2.5) * (s.zone === 'inner' ? 1.5 : s.zone === 'outer' ? 0.6 : 1);
    if (s.zone === 'outer' && w.dust) { w.ice = w.dust * 0.6; w.dust *= 0.4; }
    c.spawn = w;
    c.funnel = L('funnel');
    c.wind = d.wind ? { x: 55, y: 0 } : null;
    c.merge = !!d.merge;
    c.stickSpeed = B.stickSpeed * (1 + 0.15 * L('sticking'));
    c.frag = !!d.frag;
    c.fragSpeed = B.fragSpeed * (1 + 0.15 * L('sticking')) * (d.runaway ? 1 + 0.5 * p : 1);
    c.collectAtCursor = !!d.collectAtCursor;
    c.ejectaSpeed = s.stage === 'supernova' || s.stage === 'merger' ? 150 : 70;
    c.bh = d.kind === 'bh' ? { tidal: bodyR * 4.2, disk: bodyR * 3.4, superEdd: s.remnant.accr > Evo.eddington(s) } : null;
    c.swarmR = d.swarm ? bodyR * 4 : 0;
    return c;
  }

  function buyAll(s, log) {
    for (;;) {
      let best = null, bc = Infinity;
      for (const u of CA.UPGRADES.concat(CA.PERM_UPGRADES)) {
        const r = E.canBuy(s, u.id);
        if (r.ok && r.cost / (s.res[u.res] || 1) < bc) { bc = r.cost / (s.res[u.res] || 1); best = u; }
      }
      if (!best) return;
      E.buy(s, best.id); log.bought++;
    }
  }

  function playCycle(s, target) {
    const w = new CA.Sim.World(), c = CA.Sim.defaultCtx(), rows = [];
    let bodyR = radius(s);
    let stage = s.stage, t0 = 0, t = 0, cd = {}, log = { bought: 0, absorbed: 0 };
    w.reset(W, H, ctxFor(s, c, bodyR));
    const mark = () => rows.push({ id: stage, dt: t - t0, res: Object.assign({}, s.res), cap: E.energyCap(s), bought: log.bought, abs: log.absorbed, sec: t0 });
    const useCd = (id, n) => { cd[id] = cd[id] || 0; if (t >= cd[id]) { cd[id] = t + n; return true; } return false; };
    while (t < 7200) {
      t += DT;
      bodyR = radius(s);
      ctxFor(s, c, bodyR);
      // the well: chase the nearest loose mote while energy lasts
      const d = CA.STAGE[s.stage];
      let near = null, nd = Infinity;
      for (const m of w.motes) { const q = Math.hypot(m.x, m.y); if (q < nd) { nd = q; near = m; } }
      const drain = BAL.energy.wellDrain * (1 - 0.08 * E.lvl(s, 'efficiency')) * DT;
      c.well.active = !!near && s.res.energy > 20 && s.res.energy >= drain;
      if (c.well.active) { s.res.energy -= drain; const k = c.collectAtCursor ? 1 : Math.min(60, nd) / (nd || 1); c.well.x = near.x * k; c.well.y = near.y * k; }
      if (d.swarm && s.mass >= d.massEnd * 0.9999) { c.well.active = s.res.energy >= drain; c.well.x = bodyR * 2.6; c.well.y = 0; } // gather the swarm beside the body, not on it
      for (const e of w.step(DT, c)) if (e.kind === 'absorb') { Evo.absorb(s, e.type, e.s, e.frac); log.absorbed++; }
      if (d.abilities.includes('pulse') && s.res.energy > 60 && useCd('pulse', 6)) { s.res.energy -= 25; w.pulse(c, B.pulseRange, B.pulseKick); }
      if (d.id === 'core' && s.res.energy >= 15 && s.core.T > BAL.jeans.Tmin + 0.5 && useCd('cool', 3)) { s.res.energy -= 15; s.core.T = Math.max(BAL.jeans.Tmin, s.core.T - BAL.jeans.coolStep); }
      if (d.zoneChoice && !s.zone) Evo.setZone(s, target > 10 ? 'outer' : 'inner');
      if (d.id === 'mainseq') { s.star.comp = 1.2; if (Math.abs(s.star.pg - 1) > 0.15 && s.res.energy > 30 && useCd('stab', 10)) { s.res.energy -= 30; s.star.pg = 1 + (s.star.pg - 1) * 0.3; } }
      if (d.id === 'protostar' && s.star.M > target * 1.05 && s.res.energy > 20 && useCd('out', 2)) { s.res.energy -= 20; s.star.M *= 0.92; }
      if (d.id === 'agb' && (s.stageTime % 6) / 6 > 0.48) Evo.capturePulse(s);
      if (d.abilities.includes('observe') && s.res.energy >= 40 && useCd('obs', 15)) { s.res.energy -= 40; Evo.observe(s); }
      if (d.id === 'neutronstar' && Math.abs(Math.sin(Evo.nsBeamAngle(s.remnant))) > 0.998) Evo.recordPulse(s);
      for (const ev of Evo.tick(s, DT, { rand: rng, swarmCount: w.swarmCount })) { void ev; }
      E.tick(s, DT);
      const chk = Evo.canAdvance(s);
      if (chk.ok && chk.manual && d.type !== 'remnant') {
        const big = d.id === 'core' && Evo.starMassFromCore(s) < target && s.stageTime < 240; // keep feeding for a bigger star
        const heavier = d.id === 'planet' && s.zone === 'outer' && s.mass < 10 * U.M_EARTH && s.stageTime < 120;
        if (!big && !heavier) Evo.advance(s);
      }
      if (t % 1 < DT) buyAll(s, log);
      if (s.stage !== stage) { mark(); stage = s.stage; t0 = t; w.reset(W, H, ctxFor(s, c, bodyR)); }
      if (CA.STAGE[s.stage].type === 'remnant' && s.stageTime >= 60) { mark(); break; }
    }
    return { rows, t, s };
  }

  CA.I18n.setLang('en');
  if (arg[2] === 'bh') { // how fast does a plain well on the hole feed it?
    for (const funnel of [0, 8]) {
      const s = S.create(0); s.stage = 'blackhole'; s.star = { M0: 30, M: 12 }; s.remnant = Evo.makeRemnant('bh', 12, s);
      const w = new CA.Sim.World(), c = CA.Sim.defaultCtx(); ctxFor(s, c, radius(s)); c.funnel = funnel; w.reset(W, H, c);
      c.well.active = true; c.well.x = 0; c.well.y = 0;
      let n = 0, T = 120;
      for (let t = 0; t < T; t += DT) for (const e of w.step(DT, c)) if (e.kind === 'absorb' && e.type === 'gas') n++;
      let orbiting = 0; for (const m of w.motes) if (Math.hypot(m.x, m.y) < c.bh.disk) orbiting++;
      print(`funnel ${funnel}: ${(n / T).toFixed(2)} gas/s fed, ${orbiting} stuck in the disk, Eddington ${Evo.eddington(s).toFixed(2)}`);
    }
    return;
  }
  let s = S.create(0), total = 0;
  for (let i = 0; i < CYCLES; i++) {
    const target = PLAN[i % PLAN.length], r = playCycle(s, target);
    s = r.s; total += r.t;
    print(`\n== cycle ${i + 1}  target ${target} M☉ → M0 ${s.star ? s.star.M0.toFixed(2) : '?'} (${r.rows[r.rows.length - 1].id})  ${fmtT(r.t)}, total ${fmtT(total)}  Z ${s.Z.toFixed(3)}`);
    print(pad('stage', 14) + pad('time', 8) + pad('at', 8) + pad('matter', 10) + pad('heavy', 9) + pad('energy', 9) + pad('cap', 8) + pad('research', 9) + pad('remn', 6) + 'motes/s bought');
    let pa = 0;
    for (const w of r.rows) {
      print(pad(w.id, 14) + pad(fmtT(w.dt), 8) + pad(fmtT(w.sec), 8) + pad(U.fmt(w.res.matter), 10) + pad(U.fmt(w.res.heavy), 9) + pad(U.fmt(w.res.energy), 9) + pad(U.fmt(w.cap), 8) + pad(U.fmt(w.res.research), 9) + pad(U.fmt(w.res.remnants), 6) + pad(((w.abs - pa) / Math.max(1, w.dt)).toFixed(1), 8) + w.bought);
      pa = w.abs;
    }
    const left = CA.UPGRADES.filter((u) => E.lvl(s, u.id) < u.max).map((u) => `${u.id} ${E.lvl(s, u.id)}/${u.max} (next ${U.fmt(E.cost(u, E.lvl(s, u.id)))} ${u.res})`);
    print('not maxed: ' + (left.join(', ') || 'none'));
    print('perm: ' + CA.PERM_UPGRADES.map((u) => `${u.id} ${E.lvl(s, u.id)}/${u.max}`).join(', '));
    const nc = Evo.newCycle(s, 0); if (!nc) { print('cannot start a new cycle'); break; }
    s = nc.state;
  }
})();
