/* COSMIC ASCENSION — transient visual effects and milestone cinematics.
   Effects only describe what already happened in the game state; they never change it. */
(function (CA) {
  'use strict';
  const U = CA.U, TAU = U.TAU;
  const FX = (CA.FX = { items: [], texts: [], flash: null, shake: 0, feed: 0, settings: null });
  const MAX_ITEMS = 500;

  FX.reset = () => { FX.items = []; FX.texts = []; FX.flash = null; FX.shake = 0; FX.feed = 0; };
  const motion = () => !(FX.settings && FX.settings.reducedMotion);
  const flashOK = () => !(FX.settings && FX.settings.reducedFlashing);

  FX.ring = (x, y, r0, r1, dur, color, width = 2) => { if (FX.items.length < MAX_ITEMS) FX.items.push({ kind: 'ring', x, y, r0, r1, dur, color, width, t: 0 }); };
  FX.burst = function (x, y, n, color, speed = 120, dur = 0.7) {
    if (!motion()) n = Math.ceil(n / 3);
    n = Math.min(n, MAX_ITEMS - FX.items.length);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * U.rand(0.3, 1);
      FX.items.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, dur: dur * U.rand(0.6, 1.2), color, t: 0 });
    }
  };
  FX.text = function (x, y, text, color = '#cfe6ff') {
    if (FX.texts.length > 40) FX.texts.shift();
    FX.texts.push({ x, y, text, color, t: 0, dur: 1.2 });
  };
  FX.doFlash = function (color, strength = 0.6, dur = 0.6) {
    if (!flashOK()) { strength *= 0.25; dur *= 1.8; }
    FX.flash = { color, a: strength, dur, t: 0 };
  };
  FX.doShake = (amt) => { if (motion()) FX.shake = Math.max(FX.shake, amt); };
  FX.jets = (R, dur = 4) => FX.items.push({ kind: 'jet', x: 0, y: 0, R, dur, t: 0 });

  // the body brightens for a moment as it swallows material
  FX.fed = function (s) { FX.feed = Math.min(1, FX.feed + (flashOK() ? 0.05 : 0.02) * Math.min(4, 1 + s)); };

  // soft round sprites for sparks, one per colour string ('rgba(r,g,b,A)')
  const sparkSprites = new Map();
  function sparkSprite(color) {
    if (typeof document === 'undefined') return null;
    let s = sparkSprites.get(color);
    if (!s) {
      s = document.createElement('canvas'); s.width = s.height = 16;
      const sg = s.getContext('2d'), rg = sg.createRadialGradient(8, 8, 0, 8, 8, 8);
      rg.addColorStop(0, color.replace('A', '1')); rg.addColorStop(0.35, color.replace('A', '0.7')); rg.addColorStop(1, color.replace('A', '0'));
      sg.fillStyle = rg; sg.fillRect(0, 0, 16, 16);
      sparkSprites.set(color, s);
    }
    return s;
  }

  FX.update = function (dt) {
    FX.feed = Math.max(0, FX.feed - dt * 1.6);
    for (const it of FX.items) {
      it.t += dt;
      if (it.kind === 'spark') { it.x += it.vx * dt; it.y += it.vy * dt; it.vx *= 1 - 2 * dt; it.vy *= 1 - 2 * dt; }
    }
    FX.items = FX.items.filter((it) => it.t < it.dur);
    for (const t of FX.texts) { t.t += dt; t.y -= 22 * dt; }
    FX.texts = FX.texts.filter((t) => t.t < t.dur);
    if (FX.flash) { FX.flash.t += dt; if (FX.flash.t > FX.flash.dur) FX.flash = null; }
    FX.shake = Math.max(0, FX.shake - dt * 18);
  };

  FX.drawWorld = function (g) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const it of FX.items) {
      const k = it.t / it.dur;
      if (it.kind === 'ring') {
        g.strokeStyle = it.color.replace('A', (1 - k).toFixed(3)); g.lineWidth = it.width * (1 - k * 0.6);
        g.beginPath(); g.arc(it.x, it.y, U.lerp(it.r0, it.r1, U.smooth(k)), 0, TAU); g.stroke();
      } else if (it.kind === 'jet') { // relativistic jets along the spin axis
        const a = Math.sin(Math.PI * k), L = it.R * (3 + 12 * Math.min(1, k * 3));
        for (const sgn of [-1, 1]) {
          const lg = g.createLinearGradient(0, 0, 0, sgn * L);
          lg.addColorStop(0, `rgba(190,220,255,${0.8 * a})`); lg.addColorStop(1, 'rgba(150,190,255,0)');
          g.fillStyle = lg; g.beginPath(); g.moveTo(-it.R * 0.18, 0); g.lineTo(it.R * 0.18, 0); g.lineTo(it.R * 0.5, sgn * L); g.lineTo(-it.R * 0.5, sgn * L); g.closePath(); g.fill();
        }
      } else {
        const spr = sparkSprite(it.color), size = 7 - 4 * k;
        if (spr) { g.globalAlpha = 1 - k; g.drawImage(spr, it.x - size / 2, it.y - size / 2, size, size); g.globalAlpha = 1; }
        else { g.fillStyle = it.color.replace('A', (1 - k).toFixed(3)); g.fillRect(it.x - 1.2, it.y - 1.2, 2.4, 2.4); }
      }
    }
    g.restore();
  };

  FX.drawTexts = function (g, toScreen) {
    g.save(); g.font = '600 12px Inter, system-ui, sans-serif'; g.textAlign = 'center';
    for (const t of FX.texts) {
      const p = toScreen(t.x, t.y);
      g.globalAlpha = 1 - t.t / t.dur; g.fillStyle = t.color; g.fillText(t.text, p.x, p.y);
    }
    g.restore();
  };

  FX.drawFlash = function (g, w, h) {
    if (!FX.flash) return;
    const f = FX.flash, a = f.a * (1 - f.t / f.dur);
    g.fillStyle = f.color.replace('A', a.toFixed(3)); g.fillRect(0, 0, w, h);
  };

  /* ---------------- cosmic events ----------------
     v = geometry from the game (body radius R, view radius vr, event direction ux/uy, phase, warnK 0→1 during
     the warning, front position, passing star …). layer 'back' is drawn under the motes, 'front' over the body. */
  FX.drawEvent = function (g, v, t, layer) {
    if (!v || !isFinite(v.R) || !isFinite(v.vr) || !isFinite(v.zoom)) return;
    const R = v.R, vr = v.vr, a = v.a, def = v.def, ux = v.ux, uy = v.uy, warn = v.phase === 'warn';
    const fs = 12 / Math.max(0.05, v.zoom);
    const label = (txt, x, y, color) => { g.save(); g.globalCompositeOperation = 'source-over'; g.font = `700 ${fs}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.fillStyle = color; g.fillText(txt, x, y); g.restore(); };
    const glow = (x, y, r, rgb, alpha) => {
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(${rgb},${alpha})`); rg.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const pulse = 0.6 + 0.4 * Math.sin(t * 6);
    g.save(); g.globalCompositeOperation = 'lighter';
    if (layer === 'back') {
      if (v.id === 'meteor_shower') { // the radiant, and the direction the stream will take
        const rx = ux * vr * 0.95, ry = uy * vr * 0.95;
        glow(rx, ry, 70 + 40 * v.warnK, '255,225,170', (warn ? 0.35 * v.warnK : 0.2) * pulse);
        if (warn) {
          g.setLineDash([6, 10]); g.strokeStyle = `rgba(255,225,170,${0.35 * v.warnK})`; g.lineWidth = 1.5;
          for (let i = -2; i <= 2; i++) { const o = i * vr * 0.25; g.beginPath(); g.moveTo(rx - uy * o, ry + ux * o); g.lineTo(rx - uy * o - ux * vr * 0.6, ry + ux * o - uy * vr * 0.6); g.stroke(); }
        }
      } else if (v.id === 'disk_disturbance') { // two trailing spiral density waves sweeping round
        const k = warn ? 0.12 * v.warnK : 0.26;
        g.strokeStyle = `rgba(190,170,255,${k})`; g.lineWidth = 10;
        for (const arm of [0, Math.PI]) {
          g.beginPath();
          for (let r = R * 1.4; r < vr; r *= 1.06) { const th = a.angle + arm + Math.log(r / R) * 2.2 + t * 0.7, x = Math.cos(th) * r, y = Math.sin(th) * r; r === R * 1.4 ? g.moveTo(x, y) : g.lineTo(x, y); }
          g.stroke();
        }
      } else if (v.id === 'stellar_flyby') {
        const p = v.passer;
        if (p) {
          g.setLineDash([3, 9]); g.strokeStyle = 'rgba(220,230,255,0.18)'; g.lineWidth = 1;
          const b = def.passB * vr; g.beginPath(); g.moveTo(ux * b + uy * vr, uy * b - ux * vr); g.lineTo(ux * b - uy * vr, uy * b + ux * vr); g.stroke(); g.setLineDash([]);
          glow(p.x, p.y, warn ? 30 * v.warnK + 10 : 46, '255,240,215', warn ? 0.5 * v.warnK : 0.9);
          glow(p.x, p.y, 8, '255,255,255', 0.95);
        }
      } else if (v.id === 'interstellar') { // its open (hyperbolic) path: nearly straight, crossed only once
        const b = def.passB * vr;
        g.setLineDash([6, 9]); g.strokeStyle = `rgba(205,185,255,${warn ? 0.5 * v.warnK : 0.28})`; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(ux * b + uy * vr, uy * b - ux * vr); g.lineTo(ux * b - uy * vr, uy * b + ux * vr); g.stroke(); g.setLineDash([]);
        if (warn) label(CA.t('fxl.iso'), ux * b + uy * vr * 0.25, uy * b - ux * vr * 0.25 - fs, '#d9ccff'); // near closest approach: on screen
      } else if (v.id === 'accretion_surge') { // a star being stretched by tides, then its debris stream
        const d = vr * 0.82, x = ux * d, y = uy * d;
        g.save(); g.translate(x, y); g.rotate(a.angle + Math.PI / 2);
        g.scale(1 + (warn ? 3 * v.warnK : 4), warn ? 1 - 0.5 * v.warnK : 0.5);
        glow(0, 0, 18, '255,220,190', warn ? 0.85 : 0.4);
        g.restore();
        if (!warn) { g.strokeStyle = 'rgba(255,200,160,0.12)'; g.lineWidth = 30; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x * 0.4 - uy * d * 0.3, y * 0.4 + ux * d * 0.3, 0, 0); g.stroke(); }
      }
    } else {
      if (v.id === 'asteroid_impact' && def.roche) { // Roche limit: an impactor captured inside it becomes a ring
        g.save(); g.globalCompositeOperation = 'source-over'; g.setLineDash([3, 7]); g.strokeStyle = 'rgba(205,195,255,0.5)'; g.lineWidth = 1.2;
        g.beginPath(); g.arc(0, 0, R * def.roche, 0, TAU); g.stroke(); g.restore();
        label(CA.t('fxl.roche'), 0, R * def.roche + fs * 1.3, '#cfc6ff');
      }
      if (v.id === 'asteroid_impact' && warn) { // predicted trajectory and target reticle
        g.globalCompositeOperation = 'source-over';
        g.setLineDash([8, 8]); g.strokeStyle = `rgba(255,90,80,${0.3 + 0.5 * v.warnK * pulse})`; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ux * vr * 0.98, uy * vr * 0.98); g.lineTo(ux * R * 1.2, uy * R * 1.2); g.stroke(); g.setLineDash([]);
        g.strokeStyle = `rgba(255,110,90,${0.6 * pulse})`; g.beginPath(); g.arc(0, 0, R * (1.6 - 0.4 * v.warnK), 0, TAU); g.stroke();
        label(CA.t('fxl.impact', { s: Math.ceil(def.warn - a.t) }), 0, -R * 1.7 - fs, '#ff9b8a');
      } else if (v.id === 'solar_flare') { // a magnetic loop rooted on the surface
        const k = warn ? v.warnK : Math.max(0, 1 - v.at / 2.5), h = R * (0.25 + 0.55 * k), ang = a.angle;
        const x0 = Math.cos(ang - 0.18) * R, y0 = Math.sin(ang - 0.18) * R, x1 = Math.cos(ang + 0.18) * R, y1 = Math.sin(ang + 0.18) * R;
        const cx = Math.cos(ang) * (R + h * 2), cy = Math.sin(ang) * (R + h * 2);
        g.strokeStyle = `rgba(255,${warn ? 200 : 240},170,${(warn ? 0.4 + 0.5 * k : k) * pulse})`; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
        glow(Math.cos(ang) * (R + h), Math.sin(ang) * (R + h), R * 0.5, '255,230,190', 0.4 * k);
      } else if (v.id === 'cme') { // deflection zone + the expanding plasma cloud
        const span = 0.7, a0 = a.angle - span, a1 = a.angle + span;
        g.setLineDash([5, 7]); g.lineWidth = 1.5; g.strokeStyle = v.inWin ? 'rgba(140,255,200,0.9)' : 'rgba(170,200,255,0.45)';
        for (const w of def.win) { g.beginPath(); g.arc(0, 0, R * w, a0, a1); g.stroke(); }
        g.setLineDash([]);
        if (warn) glow(ux * R, uy * R, R * 0.7, '255,200,150', 0.5 * v.warnK * pulse);
        else {
          g.strokeStyle = `rgba(255,170,120,${0.55 * Math.max(0.2, 1 - (v.front - def.win[1]) / 3)})`; g.lineWidth = R * 0.35;
          g.beginPath(); g.arc(0, 0, R * v.front, a.angle - 0.55, a.angle + 0.55); g.stroke();
        }
        if (v.inWin) label(CA.t('fxl.pulse'), ux * R * (def.win[1] + 0.6), uy * R * (def.win[1] + 0.6), '#9dffcf');
      } else if (v.id === 'magnetar_burst') { // a thin radio flash racing outward; the ring is the detector
        const k = vr / 11;
        g.setLineDash([4, 8]); g.lineWidth = 1.5; g.strokeStyle = v.inWin ? 'rgba(140,255,200,0.9)' : 'rgba(205,185,255,0.45)';
        for (const w of def.win) { g.beginPath(); g.arc(0, 0, k * w, 0, TAU); g.stroke(); }
        g.setLineDash([]);
        if (warn) glow(0, 0, vr * 0.18 * v.warnK, '205,170,255', 0.5 * pulse);
        else { g.strokeStyle = 'rgba(240,225,255,0.95)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, k * v.front, 0, TAU); g.stroke(); }
        if (v.inWin) label(CA.t('fxl.frb'), 0, -k * def.win[1] - fs, '#9dffcf');
      } else if (v.id === 'sn_shock') { // a straight shock front sweeping through
        const px = -uy, py = ux, L = vr * 1.3;
        const line = (f, color, w) => { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.moveTo(ux * f * R + px * L, uy * f * R + py * L); g.lineTo(ux * f * R - px * L, uy * f * R - py * L); g.stroke(); };
        g.setLineDash([4, 8]);
        for (const w of def.win) line(w, v.inWin ? 'rgba(140,255,200,0.6)' : 'rgba(200,190,255,0.25)', 1);
        g.setLineDash([]);
        line(v.front, `rgba(220,200,255,${warn ? 0.25 * v.warnK * pulse : 0.75})`, warn ? 3 : 6);
        if (v.inWin) label(CA.t('fxl.pulse'), 0, -R * 1.6 - fs, '#9dffcf');
      } else if (v.id === 'stellar_pulsation' && !warn) {
        g.setLineDash([3, 6]); g.lineWidth = v.peak ? 3 : 1.2;
        g.strokeStyle = v.peak ? 'rgba(255,235,170,0.95)' : 'rgba(255,220,170,0.35)';
        g.beginPath(); g.arc(0, 0, R * 1.12, 0, TAU); g.stroke(); g.setLineDash([]);
        if (v.peak) label(CA.t('fxl.stab'), 0, -R * 1.25 - fs, '#ffe6a8');
      }
    }
    g.restore();
  };

  /* ---------------- cinematics ---------------- */
  FX.CINEMATICS = {
    collapse: { dur: 7, title: 'Gravitational Collapse', sub: 'The core can no longer hold itself up.', text: 'Gravity wins over thermal pressure. In ~100,000 years the core falls inward, spinning up into a protostar wrapped in a flattened disk of gas and dust — the birthplace of planets.' },
    planet: { dur: 7, title: 'A Planet Is Born', sub: 'Your world has cleared its orbit.', text: 'Collisions have built a body massive enough to dominate its neighbourhood. It now settles into its orbit around the young star.' },
    ignition: { dur: 7, title: 'Fusion Ignition', sub: 'Hydrogen becomes helium.', text: 'At about 10 million K, protons fuse into helium. The energy released pushes back against gravity: the star settles into hydrostatic equilibrium on the main sequence.' },
    supernova: { dur: 8, title: 'Supernova', sub: 'An iron core collapses in under a second.', text: 'The core implodes to nuclear density and rebounds; neutrinos revive the shock that tears the star apart. For weeks it outshines billions of stars.' },
    neutron: { dur: 7, title: 'Neutron Star', sub: 'A city-sized atomic nucleus.', text: 'Electrons and protons are crushed into neutrons. The remnant spins many times a second, sweeping beams of radiation across space.' },
    blackhole: { dur: 8, title: 'Black Hole', sub: 'Not even light escapes.', text: 'No known force can stop the collapse. An event horizon forms: a one-way boundary. Light bends around it, and infalling gas glows in a disk outside it.' },
    ia: { dur: 8, title: 'Type Ia Supernova', sub: 'A white dwarf burns in an instant.', text: 'Near the Chandrasekhar limit, carbon ignites and the whole star burns within seconds. Nothing is left behind. Only iron-peak elements spread into space.' },
    kilonova: { dur: 9, title: 'Kilonova', sub: 'This is how gold is born.', text: 'Torn neutron stars fling out neutron-rich matter. In about a second, nuclei capture neutrons and become gold, platinum and uranium. Their decay glows red for days.' },
    gw: { dur: 8, title: 'Gravitational Waves', sub: 'Spacetime itself rings.', text: 'The two bodies orbit at a large fraction of light speed, then become one. The ripples pass through everything and reach Earth as a stretch far smaller than a proton.' },
    ending: { dur: 18, title: 'Ashes of Stars', sub: 'You are made of this.', text: 'The hydrogen in water came from the Big Bang. The carbon in your cells came from dying giants, the oxygen you breathe from massive stars, the iron in your blood mostly from exploded white dwarfs, the gold in a ring from colliding neutron stars. You followed every step, from one grain of dust to the place where the universe understands itself.' },
  };

  FX.cine = null;
  FX.playCinematic = function (id, seen) {
    const def = FX.CINEMATICS[id];
    if (!def) return false;
    const short = seen; // replays of already-seen milestones are brief
    FX.cine = { id, def, t: 0, dur: short ? 2.2 : def.dur, short };
    if (id === 'supernova') { FX.doFlash('rgba(255,250,240,A)', 0.95, 1.6); FX.doShake(14); }
    if (id === 'ignition') { FX.doFlash('rgba(255,230,190,A)', 0.7, 1.2); FX.doShake(5); }
    if (id === 'collapse') FX.doShake(3);
    if (id === 'blackhole') FX.doShake(8);
    if (id === 'ia') { FX.doFlash('rgba(235,245,255,A)', 0.95, 1.8); FX.doShake(12); }
    if (id === 'kilonova') { FX.doFlash('rgba(255,190,140,A)', 0.85, 2.2); FX.doShake(10); }
    if (id === 'gw') FX.doShake(6);
    return true;
  };
  FX.skipCinematic = () => { FX.cine = null; };
  FX.updateCinematic = function (dt) {
    if (!FX.cine) return;
    FX.cine.t += dt;
    if (FX.cine.t >= FX.cine.dur) FX.cine = null;
  };

  /* Cinematic visuals drawn in world space around the body. */
  FX.drawCinematicWorld = function (g, bodyR, t0) {
    const c = FX.cine; if (!c) return;
    const k = c.t / c.dur, t = c.t;
    g.save(); g.globalCompositeOperation = 'lighter';
    if (c.id === 'collapse') {
      for (let i = 0; i < 80; i++) {
        const a = (i / 80) * TAU + i * 0.37, r = (1 - ((t * 0.35 + i * 0.013) % 1)) * 600;
        g.strokeStyle = `rgba(160,170,255,${0.25 * (1 - k)})`; g.lineWidth = 1;
        g.beginPath(); g.moveTo(Math.cos(a) * r, Math.sin(a) * r); g.lineTo(Math.cos(a) * (r + 40), Math.sin(a) * (r + 40)); g.stroke();
      }
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, bodyR * (1 + k * 2));
      rg.addColorStop(0, `rgba(255,190,140,${0.6 * k})`); rg.addColorStop(1, 'rgba(255,190,140,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, bodyR * (1 + k * 2), 0, TAU); g.fill();
    } else if (c.id === 'ignition') {
      const R = bodyR * (1 + k * 10);
      g.strokeStyle = `rgba(255,220,170,${0.6 * (1 - k)})`; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
    } else if (c.id === 'planet') {
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * TAU + t * (0.8 + (i % 5) * 0.1), r = bodyR * (1.3 + (1 - k) * (2 + (i % 7) * 0.4));
        g.fillStyle = `rgba(230,200,170,${0.6 * (1 - k * 0.7)})`; g.fillRect(Math.cos(a) * r, Math.sin(a) * r * 0.45, 2, 2);
      }
    } else if (c.id === 'supernova') {
      const R = bodyR * (1 + k * 18);
      g.strokeStyle = `rgba(255,200,140,${0.7 * (1 - k)})`; g.lineWidth = 8 * (1 - k) + 1;
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
    } else if (c.id === 'neutron') {
      g.strokeStyle = `rgba(170,210,255,${0.4 * (1 - k)})`; g.lineWidth = 2;
      for (let i = 1; i < 6; i++) { g.beginPath(); g.arc(0, 0, bodyR * i * 3 * (0.3 + k), 0, TAU); g.stroke(); }
    } else if (c.id === 'blackhole') {
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = `rgba(0,0,0,${0.5 * Math.sin(Math.PI * k)})`; g.fillRect(-3000, -3000, 6000, 6000);
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(255,230,190,${0.6 * (1 - k)})`; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, bodyR * (6 - k * 4.8), 0, TAU); g.stroke();
    } else if (c.id === 'ia') { // a clean, sharp shell: nothing remains at the centre
      const R = bodyR * (1 + k * 22);
      g.strokeStyle = `rgba(215,235,255,${0.8 * (1 - k)})`; g.lineWidth = 5 * (1 - k) + 1;
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
      g.strokeStyle = `rgba(255,225,170,${0.4 * (1 - k)})`; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, R * 0.82, 0, TAU); g.stroke();
    } else if (c.id === 'kilonova') { // blue early ejecta fading into the red glow of the heaviest nuclei
      for (let i = 0; i < 70; i++) {
        const a = i * 2.399, r = (0.2 + ((i * 0.618) % 1) * 0.8) * bodyR * (2 + k * 20);
        g.fillStyle = `rgba(${Math.round(150 + 105 * k)},${Math.round(190 - 110 * k)},${Math.round(255 - 195 * k)},${0.7 * (1 - k * 0.6)})`;
        g.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2.6, 2.6);
      }
    } else if (c.id === 'gw') { // ripples of the merger, spreading out from the centre
      for (let i = 0; i < 7; i++) {
        const f = (t * 0.45 + i / 7) % 1;
        g.strokeStyle = `rgba(180,210,255,${0.45 * (1 - f)})`; g.lineWidth = 2.5 * (1 - f) + 0.5;
        g.beginPath(); g.ellipse(0, 0, 40 + f * 760, (40 + f * 760) * (0.94 + 0.06 * Math.sin(t * 5 + i)), 0, 0, TAU); g.stroke();
      }
    } else if (c.id === 'ending') { // the six birthplaces drifting together into dust
      for (let i = 0; i < 120; i++) {
        const a = i * 2.399 + t * 0.06, r = (0.15 + ((i * 0.618) % 1) * 0.85) * 520 * (1.1 - k * 0.45);
        const col = [[120, 170, 255], [255, 170, 110], [160, 230, 255], [255, 120, 90], [235, 240, 255], [255, 215, 130]][i % 6];
        g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.55 * Math.min(1, t / 2) * Math.min(1, (c.dur - t) / 2)})`;
        g.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2.2, 2.2);
      }
    }
    g.restore();
  };
})(globalThis.CA = globalThis.CA || {});
