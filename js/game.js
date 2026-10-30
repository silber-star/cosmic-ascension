/* COSMIC ASCENSION — game controller: fixed-timestep loop, input, abilities, and wiring between
   the simulation, economy, evolution, renderer and UI. */
(function (CA) {
  'use strict';
  const U = CA.U, BAL = CA.BAL, B = CA.BAL.sim, Econ = CA.Econ, Evo = CA.Evo, Ev = CA.Events, tr = CA.t;

  const G = (CA.Game = {
    state: null, settings: null, world: new CA.Sim.World(), menu: true, paused: false, inMinigame: false,
    cam: { x: 0, y: 0, zoom: 1, target: 1 }, input: { mx: 0, my: 0, down: false, inside: false },
    time: 0, bodyR: 20, simCtx: CA.Sim.defaultCtx(), dampPos: { x: 0, y: 0 }, lens: null, einsteinR: 60,
    cineQueue: [], cine: null, storage: null, governor: new U.Governor(), sinceAnomaly: 0, sweepT: 0, autosaveT: 0, uiT: 0, recT: 1, lastBeamHalf: null,
  });

  G.storage = (function () {
    // ?sandbox in the URL keeps a separate save (handy for testing without touching the real one)
    const prefix = typeof location !== 'undefined' && /sandbox/.test(location.search) ? 'sandbox.' : '';
    try {
      const k = '__ca_test'; localStorage.setItem(k, '1'); localStorage.removeItem(k);
      return { getItem: (k) => localStorage.getItem(prefix + k), setItem: (k, v) => localStorage.setItem(prefix + k, v), removeItem: (k) => localStorage.removeItem(prefix + k) };
    } catch (e) { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; }
  })();

  G.boot = function () {
    G.settings = CA.State.loadSettings(G.storage);
    CA.I18n.setLang(G.settings.lang); // before the UI is built: data and static page text in the chosen language
    CA.FX.settings = G.settings;
    CA.Audio.init(G.settings);
    const cv = document.getElementById('cosmos');
    CA.Render.init(cv);
    CA.Render.resize();
    G.state = CA.State.create();
    G.state.stage = 'mainseq'; // menu backdrop: a quiet star
    G.state.star = { M0: 1.2, M: 1.2, Tc: 10, fuel: 1, pg: 1, comp: 1, rg: 1, ignited: true };
    G.world.reset(window.innerWidth, window.innerHeight, null);
    bindInput(cv);
    CA.UI.init(G);
    CA.UI.showMenu();
    G.last = performance.now(); G.acc = 0;
    requestAnimationFrame(G.frame);
  };

  /* ---------------- lifecycle ---------------- */
  G.newGame = function () {
    CA.Audio.unlock();
    G.load(CA.State.create(), { fresh: true });
    CA.UI.toast(tr('game.newGame'), 'info');
    G.save(true);
  };
  G.continueGame = function () {
    CA.Audio.unlock();
    const res = CA.State.load(G.storage);
    if (!res.state) { CA.UI.toast(tr('game.noSave'), 'warn'); return false; }
    if (res.warnings.length) CA.UI.toast(tr('game.repaired', { w: res.warnings.slice(0, 2).join('; ') }), 'warn');
    const away = (Date.now() - res.state.lastSaved) / 1000;
    G.load(res.state, {});
    if (away > 60) {
      const sum = Econ.offline(G.state, away);
      if (sum) CA.UI.showOffline(sum);
    }
    return true;
  };
  G.load = function (state, opts) {
    G.state = state;
    G.menu = false; G.paused = false;
    CA.FX.reset();
    G.cineQueue = []; G.cine = null;
    G.lens = null; G.sweepT = 0;
    G.onStageEnter(true);
    CA.UI.enterGame();
  };
  G.save = function (silent) {
    if (G.menu || !G.state) return false;
    const ok = CA.State.save(G.state, G.storage);
    if (!silent) CA.UI.toast(tr(ok ? 'game.saved' : 'game.saveFail'), ok ? 'info' : 'warn');
    return ok;
  };
  G.toMenu = function () { G.save(true); G.menu = true; G.paused = false; CA.UI.showMenu(); };
  G.resetAll = function () {
    try { G.storage.removeItem(CA.State.KEY); G.storage.removeItem(CA.State.BACKUP_KEY); } catch (e) { /* ignore */ }
    G.menu = true; CA.UI.showMenu();
  };

  /* ---------------- main loop ---------------- */
  G.frame = function (ts) {
    requestAnimationFrame(G.frame);
    try { tick(ts); } catch (e) {
      if (!G._errShown) { G._errShown = true; console.error(e); CA.UI.toast(tr('game.error', { m: e.message }), 'warn'); }
    }
  };
  function tick(ts) {
    let dt = (ts - G.last) / 1000;
    G.last = ts;
    if (!G.inMinigame) CA.Render.setQuality(qualityLevel(dt * 1000));
    if (dt > 5 && !G.menu && G.state) { // tab was hidden: treat the gap as offline time
      const sum = Econ.offline(G.state, dt);
      if (sum) CA.UI.showOffline(sum);
      dt = 0;
    }
    dt = Math.min(dt, BAL.sim.maxFrame);
    G.acc += dt;
    const step = BAL.sim.step;
    let n = 0;
    while (G.acc >= step && n < 8) { G.update(step); G.acc -= step; n++; }
    if (n === 8) G.acc = 0;
    if (!G.inMinigame) CA.Render.draw(G); // a minigame covers the whole screen
    G.uiT -= dt;
    if (G.uiT <= 0) { G.uiT = 0.1; CA.UI.update(G); }
  }

  function qualityLevel(ms) {
    const q = G.settings.quality;
    return q === 'auto' ? G.governor.sample(ms) : q === 'low' ? 2 : q === 'normal' ? 1 : 0;
  }

  G.update = function (dt) {
    G.time += dt;
    CA.FX.update(dt);
    const s = G.state;
    if (G.menu) { menuUpdate(dt); return; }
    if (G.paused) return;
    if (G.inMinigame) { Econ.tick(s, dt); return; }

    // cinematics: the world keeps drifting in slow motion, game logic waits
    if (!CA.FX.cine && G.cineQueue.length) startCinematic(G.cineQueue.shift());
    if (G.endingPending && !CA.FX.cine && !G.cineQueue.length) { G.endingPending = false; CA.UI.showEnding(); }
    if (CA.FX.cine) {
      CA.FX.updateCinematic(dt);
      G.cine = CA.FX.cine ? { letterbox: Math.min(1, CA.FX.cine.t * 2, (CA.FX.cine.dur - CA.FX.cine.t) * 2) } : null;
      if (!CA.FX.cine) CA.UI.hideCinematic();
      G.world.step(dt * 0.25, G.simCtx);
      updateCamera(dt);
      return;
    }

    G.bodyR = computeBodyR(s);
    buildCtx(dt);
    const evs = G.world.step(dt, G.simCtx);
    for (const e of evs) handleSimEvent(e);
    Econ.tick(s, dt);
    const ev2 = Evo.tick(s, dt, { swarmCount: G.world.swarmCount });
    handleEvents(ev2);
    handleCosmic(Ev.tick(s, dt));
    eventWorld();
    stageExtras(dt);
    s.stats.playTime += dt;
    G.recT -= dt;
    if (G.recT <= 0) { G.recT = 1; checkRecords(s); }
    updateCamera(dt);
    G.autosaveT += dt;
    if (G.autosaveT >= BAL.autosaveSeconds) { G.autosaveT = 0; G.save(true); }
  };

  /* Once a second, outside minigames and cinematics, so a toast is never hidden behind them. */
  function checkRecords(s) {
    CA.Atlas.track(s);
    const got = CA.Ach.check(s);
    if (!got.length) return;
    CA.Audio.play('rare');
    if (got.length > 3) { // an old save catching up: one toast, not a pile
      const r = got.reduce((n, e) => n + e.rewards.research, 0);
      CA.UI.toast(tr('achp.many', { n: got.length }) + ' ' + fmtRewards({ research: r }), 'ach');
      return;
    }
    for (const e of got) CA.UI.toast(tr('achp.toast', { name: CA.ACHIEVEMENTS.find((a) => a.id === e.id).name }) + ' ' + fmtRewards(e.rewards), 'ach');
  }

  function menuUpdate(dt) {
    G.bodyR = 24;
    const c = G.simCtx;
    Object.assign(c, CA.Sim.defaultCtx(), { bodyR: 24, spawn: { comet: 1, spark: 0.2 }, spawnRate: 3, maxMotes: 90 });
    c.well.active = false;
    G.world.step(dt, c);
    G.cam.zoom = 1; G.cam.x = 0; G.cam.y = 0;
  }

  /* ---------------- body size, camera, sim context ---------------- */
  function computeBodyR(s) { return bodyRBase(s) * Ev.radiusMult(s); } // pulsating stars swell and shrink
  function bodyRBase(s) {
    const d = CA.STAGE[s.stage], p = Evo.progress(s), Star = Evo.Star;
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
      case 'star': return 18 + 14 * Math.log10(1 + Star.R(s.star.M0));
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

  function updateCamera(dt) {
    const sz = CA.Render.size();
    G.cam.target = Math.min(1, (Math.min(sz.w, sz.h) * 0.2) / G.bodyR);
    const k = 1 - Math.exp(-dt * 2.5);
    G.cam.zoom += (G.cam.target - G.cam.zoom) * k;
    // on a phone the body sits in the free space between the stacked HUD panels
    G.cam.y += ((sz.h / 2 - CA.UI.viewCentreY(sz)) / G.cam.zoom - G.cam.y) * k;
  }

  function buildCtx(dt) {
    const s = G.state, d = CA.STAGE[s.stage], c = G.simCtx, L = (id) => Econ.lvl(s, id);
    const p = Evo.progress(s);
    c.bodyR = G.bodyR;
    c.captureMult = (d.kind === 'core' ? 0.75 : 1) * (1 + 0.1 * L('focusing')) * (s.fx.boost > 0 ? 1.4 : 1);
    const grow = d.type === 'mass' || d.type === 'planet' ? 1 + 0.8 * p : 1;
    c.bodyStrength = B.bodyStrength * grow * (d.runaway ? 1.4 : 1) * (d.kind === 'bh' ? 2.2 : 1);
    c.bodyRange = B.bodyRange * (1 + 0.12 * L('range')) * Math.max(1, Math.sqrt(G.bodyR / 25));
    c.wellStrength = B.wellStrength * (1 + 0.2 * L('well_strength'));
    c.wellRange = B.wellRange * (1 + 0.12 * L('range'));
    const dens = G.settings.density === 'low' ? 0.5 : G.settings.density === 'high' ? 1.4 : 1;
    c.maxMotes = Math.round(B.maxMotes * dens * (1 + 0.05 * L('flow')));
    c.spawnRate = B.spawnRate * (1 + 0.12 * L('flow')) * (d.collectAtCursor ? 1.6 : 1);
    // spawn mix
    const w = Object.assign({}, d.spawn);
    if (w.heavy) w.heavy *= U.clamp(s.Z / 0.01, 0.5, 2.5) * (s.zone === 'inner' ? 1.5 : s.zone === 'outer' ? 0.6 : 1);
    if (s.zone === 'outer' && w.dust) { w.ice = w.dust * 0.6; w.dust *= 0.4; }
    if (w.anomaly) w.anomaly *= (1 + 0.3 * L('p_rare')) * (1 + G.sinceAnomaly / 60);
    if (G.sinceAnomaly > 250 && w.anomaly) w.anomaly = 1e3; // pity timer: a rare find is guaranteed eventually
    c.spawn = w;
    // fields
    const draining = G.input.down && !G.inMinigame;
    const drain = BAL.energy.wellDrain * (1 - 0.08 * L('efficiency')) * dt;
    if (draining && s.res.energy >= drain) { s.res.energy -= drain; c.well.active = true; }
    else { c.well.active = false; if (draining && !G._warnedEnergy) { G._warnedEnergy = true; CA.UI.toast(tr('game.noEnergy'), 'warn'); } }
    if (!draining) G._warnedEnergy = false;
    const wp = CA.Render.toWorld(G, G.input.mx, G.input.my);
    c.well.x = wp.x; c.well.y = wp.y;
    c.damp.active = s.fx.damp > 0; c.damp.x = G.dampPos.x; c.damp.y = G.dampPos.y; c.damp.range = 130;
    c.funnel = L('funnel');
    c.wind = d.wind ? { x: 55, y: 0 } : null;
    c.merge = !!d.merge;
    c.stickSpeed = B.stickSpeed * (1 + 0.15 * L('sticking'));
    c.frag = !!d.frag;
    c.fragSpeed = B.fragSpeed * (1 + 0.15 * L('sticking')) * (d.runaway ? 1 + 0.5 * p : 1);
    c.collectAtCursor = !!d.collectAtCursor;
    c.ejectaSpeed = s.stage === 'supernova' || s.stage === 'merger' ? 150 : 70;
    c.bh = d.kind === 'bh' ? { tidal: G.bodyR * 4.2, disk: G.bodyR * 3.4, superEdd: s.remnant.accr > Evo.eddington(s) } : null;
    c.swarmR = d.swarm ? G.bodyR * 4 : 0;
    // cosmic events: turbulence and extra material (disk disturbance), a passing star's pull (stellar encounter)
    const ea = Ev.active(s), edef = ea && ea.phase === 'active' ? CA.EVENT[ea.id] : null;
    c.turb = edef && edef.mode === 'calm' ? edef.turb : 0;
    if (c.turb) { c.spawnRate *= edef.spawnMult; c.fragSpeed *= edef.fragMult; } // stirred aggregates break more easily
    c.attr = edef && edef.attract && G.evView && G.evView.passer ? { x: G.evView.passer.x, y: G.evView.passer.y, k: edef.attract } : null;
    G.einsteinR = G.bodyR * 2.4;
  }

  /* ---------------- events ---------------- */
  function handleSimEvent(e) {
    const s = G.state;
    if (e.kind === 'absorb') {
      // an event's impactor is resolved by the event (merge / shatter), not by normal accretion
      if (e.ev && e.type === 'impactor') { const out = Ev.onImpact(s, e.ev, e.speed, G.simCtx.fragSpeed); if (out) { handleCosmic(out); return; } }
      if (e.ev) eventCatch(e);
      Ev.onAbsorb(s, e.frac, e.type);
      const r = Evo.absorb(s, e.type, e.s, e.frac);
      if (e.type === 'anomaly') { G.sinceAnomaly = 0; CA.Audio.play('rare'); CA.FX.burst(e.x, e.y, 18, 'rgba(210,140,255,A)', 120); CA.FX.text(e.x, e.y - 10, tr('game.plusResearch', { n: U.fmt(r.research) }), '#d6a8ff'); }
      else G.sinceAnomaly++;
      if (e.type === 'spark') { CA.Audio.play('spark'); CA.FX.text(e.x, e.y - 8, '+' + U.fmt(r.energy) + ' ⚡', '#9ff6ff'); }
      else if (e.type === 'heavy' || e.type === 'ejecta' || e.type === 'meteor') { CA.Audio.play('heavy'); if (r.heavy) CA.FX.text(e.x, e.y - 8, tr('game.plusHeavy', { n: U.fmt(r.heavy) }), '#ffb070'); }
      else if (e.type !== 'anomaly') CA.Audio.play('collect', e.s);
      if (e.horizon) CA.FX.ring(e.x, e.y, 2, 10, 0.4, 'rgba(255,200,150,A)', 1);
      else CA.FX.ring(e.x, e.y, 1, 6 + e.s * 2, 0.35, 'rgba(255,240,220,A)', 1);
      CA.FX.fed(e.s);
      handleEvents(r.events);
    } else if (e.kind === 'frag') {
      CA.Audio.play('frag');
      CA.FX.burst(e.x, e.y, e.rogue ? 22 : 8, 'rgba(255,170,120,A)', 140);
      if (e.rogue) { CA.FX.doShake(6); CA.FX.text(e.x, e.y - 12, tr('game.highSpeed'), '#ff9b8a'); }
      if (!s.seen['hint:frag']) { s.seen['hint:frag'] = true; CA.UI.toast(tr('game.fragHint'), 'info'); }
    } else if (e.kind === 'merge' && e.s >= 4 && Math.random() < 0.3) {
      CA.FX.ring(e.x, e.y, 1, 8, 0.3, 'rgba(200,220,255,A)', 1);
    }
  }

  function handleEvents(evs) {
    if (!evs) return;
    for (const e of evs) {
      switch (e.type) {
        case 'advanced': G.onStageEnter(false, e.from); break;
        case 'cinematic': G.cineQueue.push(e.id); break;
        case 'discovery': {
          const d = CA.DISCOVERY[e.id];
          if (!e.id.startsWith('stage:')) { CA.UI.toast(tr('game.discovery', { name: d.name, desc: d.desc }), 'discovery'); CA.Audio.play('rare'); }
          break;
        }
        case 'warning': CA.UI.toast(e.text, 'warn'); CA.Audio.play('warn'); break;
        case 'flare': CA.UI.toast(e.text, 'warn'); CA.Audio.play('warn'); CA.FX.ring(0, 0, G.bodyR, G.bodyR * 3, 1, 'rgba(255,180,120,A)', 3); CA.FX.doShake(4); break;
        case 'milestone':
          CA.Audio.play('milestone');
          CA.FX.ring(0, 0, G.bodyR, G.bodyR * 5, 1.4, 'rgba(255,230,190,A)', 3);
          if (e.id === 'helium_flash') { CA.FX.doFlash('rgba(255,240,200,A)', 0.4, 0.8); CA.UI.toast(tr('game.heFlash'), 'discovery'); }
          if (e.id === 'crystal') CA.UI.toast(tr('game.crystal'), 'discovery');
          break;
        case 'binary': // something changed in the binary: the console is rebuilt to match
          CA.UI.toast(tr(e.note) + (e.rewards ? ' ' + fmtRewards(e.rewards) : ''), e.warn ? 'warn' : e.note === 'bin.ia' || e.note === 'bin.msp' ? 'discovery' : 'info');
          if (e.flash) { CA.FX.doFlash('rgba(235,240,255,A)', 0.3, 0.6); CA.Audio.play('warn'); }
          CA.UI.stageChanged();
          break;
        case 'merged':
          CA.UI.toast(tr('bin.m.' + e.kind) + ' ' + tr(e.detected ? 'bin.det' : 'bin.nodet', { s: e.snr.toFixed(1) }) + ' ' + fmtRewards(e.rewards), 'discovery');
          break;
        case 'origin':
          CA.UI.toast(tr('org.title', { n: CA.Binary.ORIGINS.filter((k) => G.state.origins[k]).length, t: CA.Binary.ORIGINS.length }) + ': ' + tr('org.' + e.id + '.name') + ' (' + tr('org.' + e.id + '.el') + ')', 'discovery');
          CA.Audio.play('rare');
          break;
        case 'ending': G.endingPending = true; break;
      }
    }
  }

  function startCinematic(id) {
    const seen = !!G.state.seen['cine:' + id];
    G.state.seen['cine:' + id] = true;
    CA.FX.playCinematic(id, seen);
    CA.Audio.play(id === 'neutron' ? 'milestone' : id === 'planet' ? 'milestone' : id);
    CA.UI.showCinematic(CA.FX.CINEMATICS[id], seen);
  }
  G.skipCinematic = function () { CA.FX.skipCinematic(); G.cine = null; CA.UI.hideCinematic(); };

  G.onStageEnter = function (loading, from) {
    const s = G.state, d = CA.STAGE[s.stage];
    G.bodyR = computeBodyR(s);
    const sz = CA.Render.size();
    G.world.reset(sz.w / Math.max(0.2, G.cam.zoom), sz.h / Math.max(0.2, G.cam.zoom), G.simCtx);
    buildCtx(0);
    if (!loading) {
      G.cam.zoom *= 1.35; // brief push-in, eases back
      CA.FX.ring(0, 0, G.bodyR, G.bodyR * 6, 1.6, 'rgba(200,220,255,A)', 2);
      if (!['collapse', 'ignition', 'planet', 'supernova', 'ia', 'kilonova', 'gw'].some((c) => G.cineQueue.includes(c))) CA.Audio.play('milestone');
      CA.UI.toast(d.name + ' — ' + d.goal, 'stage');
      G.save(true);
    } else G.cam.zoom = Math.min(1, (Math.min(sz.w, sz.h) * 0.2) / G.bodyR);
    if (d.zoneChoice && !s.zone) CA.UI.showZoneChoice();
    CA.Audio.setMood(d.chapter);
    CA.UI.stageChanged(G);
    G.lens = null;
  };

  /* ---------------- stage extras ---------------- */
  function stageExtras(dt) {
    const s = G.state, d = CA.STAGE[s.stage];
    const sweep = Econ.lvl(s, 'sweep');
    if (sweep) {
      G.sweepT += dt;
      if (G.sweepT >= 20 - 2.5 * sweep) { G.sweepT = 0; G.world.pulse(G.simCtx, B.pulseRange, B.pulseKick * 0.7); CA.FX.ring(0, 0, B.pulseRange, G.bodyR, 0.8, 'rgba(160,200,255,A)', 1.5); }
    }
    if (d.kind === 'ns') {
      const half = Math.floor((Evo.nsBeamAngle(s.remnant) + Math.PI / 2) / Math.PI + 0.5);
      if (G.lastBeamHalf !== null && half !== G.lastBeamHalf) CA.Audio.play('pulsar');
      G.lastBeamHalf = half;
    }
    if (d.kind === 'inspiral') { // a tick on every beat, then the final sweep up
      const c = s.chirp, beat = Math.floor(CA.Binary.phase(c, s.stageTime));
      if (G.lastChirpBeat !== undefined && beat > G.lastChirpBeat && beat < c.N) CA.Audio.play('gwbeat', beat / c.N);
      G.lastChirpBeat = beat;
      if (!G.chirpSwept && CA.Binary.tau(c, s.stageTime) < 0.85) { G.chirpSwept = true; CA.Audio.play('chirp'); }
    } else { G.lastChirpBeat = undefined; G.chirpSwept = false; }
    if (d.kind === 'bh') {
      if (!G.lens) {
        const sz = CA.Render.size(), span = Math.max(sz.w, sz.h) / G.cam.zoom / 2;
        const b = (Math.random() * 1.4 - 0.7) * G.einsteinR, dir = Math.random() < 0.5 ? 1 : -1;
        G.lens = { x: -dir * span, y: b, vx: dir * 38, vy: 0 };
      }
      G.lens.x += G.lens.vx * dt; G.lens.y += G.lens.vy * dt;
      if (Math.abs(G.lens.x) > Math.max(CA.Render.size().w, 800) / G.cam.zoom) G.lens = null;
    }
  }

  /* ---------------- abilities ---------------- */
  G.abilityState = function (id) {
    const s = G.state, a = CA.ABILITIES[id], d = CA.STAGE[s.stage];
    if (!d.abilities.includes(id)) return { ok: false, reason: 'not available here' };
    const cd = s.cd[id] || 0;
    if (cd > 0) return { ok: false, cd, reason: 'cooling down' };
    if (s.res.energy < a.cost) return { ok: false, reason: 'need ' + a.cost + ' energy' };
    return { ok: true };
  };

  G.useAbility = function (id) {
    if (G.menu || G.paused || G.inMinigame || CA.FX.cine) return false;
    const s = G.state, a = CA.ABILITIES[id];
    const st = G.abilityState(id);
    if (!st.ok) { if (st.reason !== 'not available here') CA.Audio.play('deny'); return false; }
    const wp = CA.Render.toWorld(G, G.input.mx, G.input.my);
    let used = true;
    switch (id) {
      case 'pulse': {
        const range = B.pulseRange * (1 + 0.12 * Econ.lvl(s, 'range'));
        G.world.pulse(G.simCtx, range, B.pulseKick);
        CA.FX.ring(0, 0, range, G.bodyR, 0.7, 'rgba(170,200,255,A)', 2.5);
        CA.Audio.play('pulse'); s.stats.pulses++;
        break;
      }
      case 'cool':
        if (s.core.T <= BAL.jeans.Tmin + 0.01) { CA.UI.toast(tr('game.coolMin'), 'info'); used = false; break; }
        s.core.T = Math.max(BAL.jeans.Tmin, s.core.T - BAL.jeans.coolStep);
        CA.FX.ring(0, 0, G.bodyR * 1.6, G.bodyR * 0.6, 0.8, 'rgba(140,200,255,A)', 2);
        CA.Audio.play('click');
        break;
      case 'damp':
        s.fx.damp = a.dur; G.dampPos = { x: wp.x, y: wp.y };
        CA.FX.ring(wp.x, wp.y, 10, 130, 0.5, 'rgba(120,230,255,A)', 2); CA.Audio.play('click');
        break;
      case 'boost':
        s.fx.boost = a.dur; CA.FX.ring(0, 0, G.bodyR, G.bodyR * 2.2, 0.8, 'rgba(255,220,150,A)', 3); CA.Audio.play('upgrade');
        break;
      case 'orbit': {
        const n = G.world.orbitize(G.simCtx, wp.x, wp.y, 170);
        const imp = G.world.motes.find((m) => m.ev && m.type === 'impactor' && m.orbit); // an incoming asteroid caught in orbit → moon
        if (imp) { G.world.motes.splice(G.world.motes.indexOf(imp), 1); CA.FX.ring(imp.x, imp.y, 4, 40, 0.8, 'rgba(220,230,255,A)', 2); handleCosmic(Ev.onOrbit(s, imp.ev, Math.hypot(imp.x, imp.y) / G.bodyR)); }
        CA.FX.ring(wp.x, wp.y, 170, 20, 0.6, 'rgba(180,255,200,A)', 1.5);
        if (!n) CA.UI.toast(tr('game.noOrbit'), 'info');
        CA.Audio.play('click');
        break;
      }
      case 'stabilize':
        if (!s.star) { used = false; break; }
        s.star.pg = 1 + (s.star.pg - 1) * 0.3;
        CA.FX.ring(0, 0, G.bodyR * 2.5, G.bodyR * 1.05, 0.7, 'rgba(255,240,200,A)', 2); CA.Audio.play('click');
        break;
      case 'outflow':
        if (s.star.M <= BAL.star.minMass * 1.001) { CA.UI.toast(tr('game.brownDwarf'), 'info'); used = false; break; }
        s.star.M = Math.max(BAL.star.minMass, s.star.M * 0.92);
        Econ.add(s, 'energy', 15);
        CA.FX.ring(0, -G.bodyR * 3, 4, 30, 0.6, 'rgba(180,220,255,A)', 2); CA.FX.ring(0, G.bodyR * 3, 4, 30, 0.6, 'rgba(180,220,255,A)', 2);
        CA.Audio.play('pulse');
        break;
      case 'capture': {
        const r = Evo.capturePulse(s);
        if (!r.ok) { used = false; CA.Audio.play('deny'); break; }
        if (r.heavy) { CA.FX.text(0, -G.bodyR - 14, (r.quality > 0.9 ? tr('game.perfect') : '') + tr('game.plusHeavy', { n: U.fmt(r.heavy) }), '#ffb070'); CA.Audio.play('heavy'); CA.FX.ring(0, 0, G.bodyR, G.bodyR * 1.8, 0.5, 'rgba(255,190,120,A)', 3); handleEvents(r.events); }
        else CA.FX.text(0, -G.bodyR - 14, tr('game.missed'), '#9aa4b8');
        break;
      }
      case 'observe': {
        const got = Evo.observe(s);
        CA.FX.text(0, -G.bodyR - 16, tr('game.plusResearch', { n: U.fmt(got) }), '#b8d8ff');
        CA.FX.ring(0, 0, 4, 60, 0.6, 'rgba(190,220,255,A)', 1.5); CA.Audio.play('rare');
        break;
      }
      case 'pulsecap': {
        const r = Evo.recordPulse(s);
        if (r.hit) { CA.FX.text(0, -G.bodyR * 4, tr('game.pulseV', { n: s.remnant.streak, r: U.fmt(r.research) }), '#9dffcf'); CA.Audio.play('spark'); handleEvents(r.events); }
        else { CA.FX.text(0, -G.bodyR * 4, tr('game.offBeam'), '#ff9b8a'); CA.Audio.play('deny'); }
        break;
      }
      case 'gwcap': {
        const r = CA.Binary.press(s.chirp, s.stageTime);
        if (r.merger) { CA.FX.text(0, -G.bodyR * 4, tr('game.gwMerger', { s: (r.dt >= 0 ? '+' : '') + Math.round(r.dt * 1000) }), '#ffe6a8'); CA.Audio.play('rare'); }
        else if (r.hit) { CA.FX.text(0, -G.bodyR * 4, tr('game.gwHit', { n: s.chirp.hits }), '#9dffcf'); CA.Audio.play('spark'); }
        else { CA.FX.text(0, -G.bodyR * 4, tr('game.gwFalse'), '#ff9b8a'); CA.Audio.play('deny'); }
        break;
      }
      case 'lens': {
        const L = G.lens;
        const dist = L ? Math.abs(Math.hypot(L.x, L.y) - G.einsteinR) : Infinity;
        const q = 1 - dist / (G.einsteinR * 0.18);
        if (q > 0) {
          const got = Econ.add(s, 'research', 40 * q * (1 + 0.25 * Econ.lvl(s, 'probes')));
          CA.FX.text(L.x, L.y - 14, tr('game.microlens', { n: U.fmt(got) }), '#cfe6ff');
          CA.FX.ring(L.x, L.y, 4, 40, 0.7, 'rgba(220,235,255,A)', 2);
          handleEvents(Evo.discover(s, 'microlensing'));
          CA.Audio.play('rare'); G.lens = null;
        } else { CA.FX.text(0, -G.bodyR * 3, tr('game.noLens'), '#9aa4b8'); CA.Audio.play('deny'); }
        break;
      }
      default: used = false;
    }
    if (used) { s.res.energy = Math.max(0, s.res.energy - a.cost); s.cd[id] = a.cd; eventRespond(id); }
    return used;
  };

  /* ---------------- stage actions (buttons) ---------------- */
  G.advance = function () {
    const r = Evo.advance(G.state);
    if (!r.ok) { CA.UI.toast(r.reason, 'warn'); CA.Audio.play('deny'); return false; }
    handleEvents([{ type: 'advanced', from: r.from, to: r.to }, ...r.events]);
    return true;
  };
  G.chooseZone = function (z) { if (Evo.setZone(G.state, z)) { CA.UI.toast(tr(z === 'inner' ? 'game.zoneIn' : 'game.zoneOut'), 'info'); G.save(true); } };
  G.setCompression = function (v) { if (G.state.stage === 'mainseq') G.state.star.comp = U.clamp(v, 0.6, 1.6); };
  G.setWind = function (on) { if (G.state.stage === 'supergiant') G.state.star.wind = !!on; };
  G.newCycle = function (keep) {
    const r = Evo.newCycle(G.state, Date.now(), { keep });
    if (!r) { CA.UI.toast(tr('game.cycleWait'), 'warn'); return; }
    G.load(r.state, {});
    G.save(true);
    const c = r.state.companion;
    if (c) CA.UI.toast(tr('game.cycleKept', { c: r.state.cycle, name: tr('evo.r.' + c.type), r: r.reward.remnants, z: r.state.Z.toFixed(3) }), 'discovery');
    else CA.UI.toast(tr('game.cycleStart', { c: r.state.cycle, r: r.reward.remnants, z: r.state.Z.toFixed(3) }), 'discovery');
  };
  G.setValve = function (v) { if (G.state.companion) G.state.companion.valve = U.clamp(v, 0, 1); };
  G.replayEnding = function () { delete G.state.seen['cine:ending']; G.endingPending = true; G.cineQueue.push('ending'); };
  G.buy = function (id) {
    if (Econ.buy(G.state, id)) { CA.Audio.play('upgrade'); CA.UI.update(G, true); return true; }
    CA.Audio.play('deny'); return false;
  };

  /* Minigame rewards — the framework passes a unique run id so a run can pay out only once. */
  G.applyMinigameReward = function (runKey, rewards, buff) {
    const s = G.state;
    if (s.granted[runKey]) return null;
    s.granted[runKey] = true;
    const got = {};
    for (const k in rewards) got[k] = Econ.add(s, k, rewards[k], { raw: k === 'remnants' });
    if (buff) Econ.addBuff(s, buff);
    // keep the granted map small: per-run keys are pruned, first-clear keys are kept
    const runKeys = Object.keys(s.granted).filter((k) => k.startsWith('run:'));
    if (runKeys.length > 200) runKeys.slice(0, runKeys.length - 200).forEach((k) => delete s.granted[k]);
    G.save(true);
    return got;
  };

  /* ---------------- input ---------------- */
  function bindInput(cv) {
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      CA.Audio.unlock();
      G.input.down = true; G.input.mx = e.clientX; G.input.my = e.clientY;
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    });
    const up = () => { G.input.down = false; };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    window.addEventListener('pointermove', (e) => { G.input.mx = e.clientX; G.input.my = e.clientY; });
    cv.addEventListener('pointerenter', () => { G.input.inside = true; });
    cv.addEventListener('pointerleave', () => { G.input.inside = false; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => { CA.Render.resize(); G.world.resize(window.innerWidth / G.cam.zoom, window.innerHeight / G.cam.zoom); });
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (CA.MG && CA.MG.active) { CA.MG.key(e); return; }
      const k = U.keyOf(e);
      if (k === 'Escape') { if (CA.FX.cine) G.skipCinematic(); else CA.UI.togglePause(); e.preventDefault(); return; }
      if (G.menu || G.paused) return;
      const d = CA.STAGE[G.state.stage];
      if (e.code === 'Space') {
        e.preventDefault();
        if (CA.FX.cine) { G.skipCinematic(); return; }
        if (d.abilities.includes('pulsecap')) G.useAbility('pulsecap');
        if (d.abilities.includes('gwcap')) G.useAbility('gwcap');
        return;
      }
      if (k === 's' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); G.save(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return; // Cmd+C and the like stay the browser's
      if (/^[1-5]$/.test(k)) {
        const id = d.abilities.find((a) => CA.ABILITIES[a].key === k);
        if (id) G.useAbility(id);
        return;
      }
      if (k === 'u') CA.UI.togglePanel('upgrades');
      if (k === 'h') CA.UI.togglePanel('guide');
      else if (k === 'e') CA.UI.togglePanel('evolution');
      else if (k === 'g') CA.UI.togglePanel('minigames');
      else if (k === 'c') CA.UI.togglePanel('codex');
      else if (k === 'a') CA.UI.togglePanel('achievements');
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) G.save(true); });
    window.addEventListener('beforeunload', () => G.save(true));
  }

  /* ---------------- cosmic events (rules: core/events.js; data: data/events.js) ---------------- */
  function handleCosmic(evs) {
    if (!evs) return;
    const s = G.state;
    for (const e of evs) {
      const def = CA.EVENT[e.id];
      switch (e.type) {
        case 'ev_start': {
          const first = !s.seen['ev:' + e.id];
          s.seen['ev:' + e.id] = true;
          CA.UI.eventToast(def, first);
          CA.Audio.play('warn');
          break;
        }
        case 'ev_active': {
          const a = Ev.active(s);
          if (!a || a.uid !== e.uid) break;
          const v = eventGeometry(a, def), R = G.bodyR;
          if (def.pattern === 'limb') { CA.FX.doFlash('rgba(255,225,180,A)', 0.22, 0.5); CA.FX.ring(v.ux * R, v.uy * R, 2, R * 0.8, 0.6, 'rgba(255,230,180,A)', 3); }
          if (def.mode === 'front') { CA.FX.doShake(3); CA.Audio.play('pulse'); }
          break;
        }
        case 'ev_goal': CA.FX.text(0, -G.bodyR - 22, tr('game.evGoal', { name: def.name }), '#9dffcf'); CA.Audio.play('rare'); break;
        case 'ev_end': eventEnded(def, e); break;
        default: handleEvents([e]); // discoveries
      }
    }
  }

  function eventEnded(def, e) {
    // a leftover impactor leaves with its event: a deflected rock never comes back to hit later
    if (def.mode === 'impactor') G.world.motes = G.world.motes.filter((m) => !(m.ev === e.uid && m.type === 'impactor'));
    if (e.duplicate || e.outcome === 'faded') return;
    const rw = fmtRewards(e.rewards), R = G.bodyR;
    CA.UI.toast(def.name + ': ' + e.text + (rw ? ' ' + rw : ''), e.good ? 'event' : 'warn');
    CA.Audio.play(e.good ? 'success' : 'fail');
    if (e.good) CA.FX.ring(0, 0, R, R * 3, 1, 'rgba(160,255,210,A)', 2);
    if (e.fx === 'jets') CA.FX.jets(R, 4);
    const k = e.effect && e.effect.kind;
    if (k === 'drain') { CA.FX.doFlash('rgba(255,120,90,A)', 0.25, 0.6); CA.FX.doShake(6); }
    if (k === 'progress' && e.effect.ratio < 1) CA.FX.burst(0, 0, 26, 'rgba(255,170,120,A)', 160);
    if (k === 'compress') CA.FX.ring(0, 0, R * 2.4, R, 0.9, 'rgba(200,190,255,A)', 3);
    if (k === 'moon' && e.effect.added) CA.FX.text(0, -R - 26, tr('game.newMoon'), '#e6ecff');
    if (k === 'ring') { CA.FX.burst(0, 0, 30, 'rgba(220,210,190,A)', 90); if (e.effect.added) CA.FX.text(0, -R - 26, tr('game.newRing'), '#e6ecff'); }
    G.save(true);
  }
  function fmtRewards(r) {
    if (!r) return '';
    const parts = Object.keys(r).filter((k) => r[k] > 0).map((k) => '+' + U.fmt(r[k]) + ' ' + Econ.RES_NAMES[k].toLowerCase());
    return parts.length ? '(' + parts.join(' · ') + ')' : '';
  }

  function eventCatch(e) {
    const c = Ev.onCatch(G.state, e.ev, { grabbed: !!e.grabbed });
    if (!c) return;
    if (c.counted) CA.FX.text(e.x, e.y - 18, c.caught + ' / ' + c.target, '#9dffcf');
    else if (c.wasted) CA.FX.text(e.x, e.y - 18, tr('game.wasted'), '#ff9b8a');
    if (e.grabbed) CA.FX.ring(e.x, e.y, 2, 16, 0.35, 'rgba(160,255,210,A)', 1.5);
    handleCosmic(c.events);
  }

  function eventRespond(id) {
    const r = Ev.respond(G.state, id);
    if (!r) return;
    CA.FX.text(0, -G.bodyR * 1.6 - 14, r.text, r.good ? '#9dffcf' : '#ff9b8a');
    if (!r.good) CA.Audio.play('deny');
    handleCosmic(r.events);
  }

  // per update: geometry for drawing, tagged motes to spawn, impactor gone off-screen, pulsation peaks
  function eventWorld() {
    const s = G.state, a = Ev.active(s);
    if (!a || !isFinite(G.world.viewR) || !isFinite(G.bodyR)) { G.evView = null; return; } // (a 0×0 window can leave the view size undefined)
    const def = CA.EVENT[a.id], v = (G.evView = eventGeometry(a, def));
    for (let n = Ev.drainSpawns(s); n > 0; n--) spawnEventMote(a, def, v);
    if (def.mode === 'impactor' && a.phase === 'active' && a.spawned && !G.world.motes.some((m) => m.ev === a.uid)) handleCosmic(Ev.onLost(s, a.uid));
    if (def.mode === 'pulsation' && a.phase === 'active') {
      if (v.peak && !G._evPeak) CA.FX.ring(0, 0, G.bodyR, G.bodyR * 1.5, 0.7, 'rgba(255,230,170,A)', 2.5);
      G._evPeak = v.peak;
    }
  }

  function eventGeometry(a, def) {
    const R = G.bodyR, vr = G.world.viewR, ux = Math.cos(a.angle), uy = Math.sin(a.angle);
    const v = { id: a.id, def, a, R, vr, ux, uy, zoom: G.cam.zoom, phase: a.phase,
      warnK: a.phase === 'warn' ? U.clamp(a.t / def.warn, 0, 1) : 1, at: Math.max(0, a.t - def.warn) };
    if (def.mode === 'front') { v.front = Ev.front(a, def); v.inWin = Ev.inWindow(a, def); }
    if (def.mode === 'pulsation') v.peak = Ev.atPeak(a, def);
    if (def.attract) { // the passing star crosses the view on a straight line, passB·viewR from the body
      const u = -1 + 2 * U.clamp(v.at / def.dur, 0, 1), b = def.passB * vr;
      v.passer = { x: ux * b - uy * u * vr, y: uy * b + ux * u * vr };
    }
    return v;
  }

  function spawnEventMote(a, def, v) {
    const W = G.world, sp = def.speed * U.rand(0.85, 1.15);
    let m = null;
    switch (def.pattern) {
      case 'stream': { // parallel tracks from the radiant cross the view side by side
        const off = U.rand(-0.65, 0.65) * v.vr, x = v.ux * v.vr * 1.02 - v.uy * off, y = v.uy * v.vr * 1.02 + v.ux * off;
        m = W.make(def.mote, x, y, (-v.ux + U.rand(-0.05, 0.05)) * sp, (-v.uy + U.rand(-0.05, 0.05)) * sp, 1);
        break;
      }
      case 'impactor': {
        // always faster than the safe impact speed, so an untouched hit shatters (upgrades don't make it harmless)
        const x = v.ux * v.vr * 0.98, y = v.uy * v.vr * 0.98, aim = Math.atan2(-y, -x) + U.rand(-0.03, 0.03), spd = Math.max(def.speed, G.simCtx.fragSpeed * 1.3);
        m = W.make(def.mote, x, y, Math.cos(aim) * spd, Math.sin(aim) * spd, def.size);
        m.warn = true;
        break;
      }
      case 'limb': { // particles burst out of the flaring loop
        const r0 = v.R * G.simCtx.captureMult + 8, ang = a.angle + U.rand(-0.2, 0.2), out = ang + U.rand(-0.45, 0.45);
        m = W.make(def.mote, Math.cos(ang) * r0, Math.sin(ang) * r0, Math.cos(out) * sp, Math.sin(out) * sp, 1);
        break;
      }
      case 'flyby': { // comets knocked loose near the passing star fall inward, mostly past you
        const p = v.passer, off = U.rand(-0.45, 0.45) * v.vr, tx = -v.uy * off - p.x, ty = v.ux * off - p.y, d = Math.hypot(tx, ty) || 1;
        m = W.make(def.mote, p.x + U.rand(-40, 40), p.y + U.rand(-40, 40), (tx / d) * sp, (ty / d) * sp, 1);
        break;
      }
      case 'hyperbolic': { // one fast body crossing the view once on an open orbit, passB·viewR from you
        const b = def.passB * v.vr, x = v.ux * b + v.uy * v.vr * 1.02, y = v.uy * b - v.ux * v.vr * 1.02;
        m = W.make(def.mote, x, y, -v.uy * sp, v.ux * sp, def.size || 1);
        break;
      }
      case 'infall': { // tidal debris falls in from one side, carrying angular momentum
        const ang = a.angle + U.rand(-0.15, 0.15), r0 = v.vr * 0.92, cx = Math.cos(ang), cy = Math.sin(ang);
        m = W.make(def.mote, cx * r0, cy * r0, -cx * sp - cy * sp * 0.08, -cy * sp + cx * sp * 0.08, 1.2);
        break;
      }
    }
    if (m) { m.ev = a.uid; m.grab = !!def.grab; m.plunge = def.mode === 'impactor' || def.pattern === 'infall'; }
  }

  // debug hook for the browser console: CA.Game.debugEvent('cme') starts an event now if the stage allows it
  G.debugEvent = function (id) { const out = Ev.start(G.state, id, { force: true }); handleCosmic(out); return out.length > 0; };

  G.handleEvents = handleEvents;
  G._test = { computeBodyR, buildCtx, checkRecords };
})(globalThis.CA = globalThis.CA || {});
