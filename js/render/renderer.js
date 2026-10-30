/* COSMIC ASCENSION — main canvas renderer. Reads game state; never mutates it. */
(function (CA) {
  'use strict';
  const U = CA.U, TAU = U.TAU;
  const R = (CA.Render = {});

  const COLORS = {
    dust: [205, 190, 170], heavy: [255, 150, 60], gas: [120, 170, 255], spark: [160, 250, 255], anomaly: [205, 120, 255],
    rogue: [255, 90, 90], comet: [190, 230, 255], ejecta: [255, 200, 110], ice: [210, 240, 255],
    meteor: [255, 225, 160], impactor: [255, 120, 80],
  };
  let canvas, g, W = 0, H = 0, DPR = 1, bg = null, bgKey = '', sprites = {}, vignette = null;
  let lensCv = null, lensData = null, lensN = 0, lensFrame = 0, lensKey = '', lensMap = null;
  let quality = 0; // 0 full, 1 medium, 2 low (see U.Governor)
  const DPR_CAP = [2, 1.5, 1];
  const TRAIL = {}, tints = new Map(), pools = new Map();

  R.init = function (cv) {
    canvas = cv; g = cv.getContext('2d');
    for (const k in COLORS) { const c = COLORS[k]; sprites[k] = makeSprite(c); TRAIL[k] = [`rgba(${c[0]},${c[1]},${c[2]},0.8)`, `rgba(${c[0]},${c[1]},${c[2]},0.35)`, `rgba(${c[0]},${c[1]},${c[2]},0.6)`, `rgba(${c[0]},${c[1]},${c[2]},0.12)`]; }
  };
  R.setQuality = function (q) {
    if (q === quality) return;
    quality = q;
    document.body.classList.toggle('lowfx', q > 0);
    R.resize();
  };
  R.resize = function () {
    DPR = Math.min(DPR_CAP[quality], window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    bgKey = ''; vignette = null;
  };
  R.size = () => ({ w: W, h: H });
  R.dprCap = () => DPR_CAP[quality];
  // on a phone the HUD is stacked above the sim, so a detector line starts lower
  const hudTop = () => (W <= 760 ? 205 : 150);

  function makeSprite(c) {
    const s = document.createElement('canvas'); s.width = s.height = 32;
    const sg = s.getContext('2d'), rg = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.18, `rgba(${c[0]},${c[1]},${c[2]},0.95)`);
    rg.addColorStop(0.45, `rgba(${c[0]},${c[1]},${c[2]},0.25)`); rg.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    sg.fillStyle = rg; sg.fillRect(0, 0, 32, 32);
    return s;
  }

  // the same soft dot in the colour of the body's light, laid over a mote to tint it
  function tintSprite(c) {
    const key = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
    if (!tints.has(key)) tints.set(key, makeSprite(c));
    return tints.get(key);
  }
  // the light falling on the gas around the body
  function poolSprite(c) {
    const key = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
    if (!pools.has(key)) {
      const s = document.createElement('canvas'); s.width = s.height = 256;
      const sg = s.getContext('2d'), rg = sg.createRadialGradient(128, 128, 0, 128, 128, 128);
      rg.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},1)`); rg.addColorStop(0.3, `rgba(${c[0]},${c[1]},${c[2]},0.32)`);
      rg.addColorStop(0.65, `rgba(${c[0]},${c[1]},${c[2]},0.07)`); rg.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      sg.fillStyle = rg; sg.fillRect(0, 0, 256, 256);
      pools.set(key, s);
    }
    return pools.get(key);
  }

  function ensureBg(name, density) {
    const key = name + W + 'x' + H + density;
    if (key !== bgKey) { bg = CA.BG.build(name, W, H, density); bgKey = key; }
  }

  /* Visual parameters for the current body. */
  R.bodyParams = function (G) {
    const s = G.state, d = CA.STAGE[s.stage], Star = CA.Evo.Star;
    const p = { t: G.time, prog: CA.Evo.progress(s), seed: s.cycle, rot: G.time * 0.05 };
    switch (d.kind) {
      case 'core': p.jeansRatio = s.core.M / CA.Evo.coreJeans(s); break;
      case 'planet': p.ptype = s.zone === 'outer' ? (s.mass >= 10 * U.M_EARTH ? 'gasgiant' : 'outer') : 'inner'; break;
      case 'protostar': p.Tc = s.star.Tc; break;
      case 'star': p.T = Star.Teff(s.star.M0); break;
      case 'giant': p.T = s.stage === 'agb' ? 3000 : 3900 - 600 * p.prog; break;
      case 'supergiant': p.wr = s.star.wr; break;
      case 'wd': p.T = s.remnant.T; p.crystal = s.remnant.crystal; break;
      case 'ns': p.beam = CA.Evo.nsBeamAngle(s.remnant); p.beamLen = Math.max(W, H); p.magnetar = s.remnant.magnetar; break;
      case 'snr': p.age = s.remnant.age; break;
      case 'inspiral': { // centre-of-mass orbit: the lighter body swings wider; at a beat the pair stands on the vertical line
        const c = s.chirp, Bin = CA.Binary, t = s.stageTime, f = c.b.mass / (c.a.mass + c.b.mass);
        p.sep = 18 + 150 * Bin.sep(c, t); p.ang = -Math.PI / 2 + Math.PI * Bin.phase(c, t);
        const ux = Math.cos(p.ang), uy = Math.sin(p.ang);
        p.pair = [{ type: c.a.type, x: ux * p.sep * f, y: uy * p.sep * f }, { type: c.b.type, x: -ux * p.sep * (1 - f), y: -uy * p.sep * (1 - f) }];
        break;
      }
    }
    if (d.kind === 'planet' && s.stage !== 'planet') p.ptype = s.planet && s.planet.type;
    return { kind: d.kind, p };
  };

  R.toScreen = (G, x, y) => ({ x: W / 2 + (x - G.cam.x) * G.cam.zoom, y: H / 2 + (y - G.cam.y) * G.cam.zoom });
  R.toWorld = (G, sx, sy) => ({ x: (sx - W / 2) / G.cam.zoom + G.cam.x, y: (sy - H / 2) / G.cam.zoom + G.cam.y });

  R.draw = function (G) {
    if (W !== window.innerWidth || H !== window.innerHeight) R.resize();
    if (W < 2 || H < 2) return;
    const s = G.state, d = CA.STAGE[s.stage];
    const settings = G.settings;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const palette = G.menu ? 'star' : CA.CHAPTERS[d.chapter].palette;
    ensureBg(palette, settings.density === 'low' ? 0.6 : 1);
    const ox = (G.input.mx - W / 2) * 0.03 + G.cam.x * 0.1, oy = (G.input.my - H / 2) * 0.03 + G.cam.y * 0.1;
    const crop = CA.BG.draw(g, bg, W, H, settings.reducedMotion ? 0 : ox, settings.reducedMotion ? 0 : oy);

    const z = G.cam.zoom, shake = CA.FX.shake;
    const sxk = shake ? (Math.random() - 0.5) * shake : 0, syk = shake ? (Math.random() - 0.5) * shake : 0;
    const center = R.toScreen(G, 0, 0);
    if (d.kind === 'bh' && !G.menu) drawLens(G, center.x, center.y, G.bodyR * z, crop);
    const bp = R.bodyParams(G), light = CA.Bodies.lightOf(bp.kind, bp.p);

    g.save();
    g.translate(W / 2 + sxk, H / 2 + syk); g.scale(z, z); g.translate(-G.cam.x, -G.cam.y);
    if (!G.menu) drawOverlaysBehind(G, s, d);
    if (!G.menu) CA.FX.drawEvent(g, G.evView, G.time, 'back');
    if (light && quality < 2) drawLightPool(G, light);
    drawMotes(G, light);
    CA.Bodies.draw(g, bp.kind, 0, 0, G.bodyR * (d.kind === 'core' ? 1 : 1), bp.p);
    if (!G.menu) { drawSystem(G, s, d); drawFields(G, s, d); }
    CA.FX.drawWorld(g);
    if (!G.menu) CA.FX.drawEvent(g, G.evView, G.time, 'front');
    CA.FX.drawCinematicWorld(g, G.bodyR, G.time);
    g.restore();

    CA.FX.drawTexts(g, (x, y) => R.toScreen(G, x, y));
    if (!G.menu && d.kind === 'inspiral') drawChirpScope(s);
    if (!vignette) vignette = makeVignette();
    g.drawImage(vignette, 0, 0, W, H);
    CA.FX.drawFlash(g, W, H);
    if (G.cine && G.cine.letterbox) drawLetterbox(G.cine.letterbox);
  };

  function makeVignette() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const vg = c.getContext('2d'), rg = vg.createRadialGradient(128, 128, 60, 128, 128, 182);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.55)');
    vg.fillStyle = rg; vg.fillRect(0, 0, 256, 256);
    return c;
  }
  function drawLetterbox(k) {
    const h = H * 0.09 * k;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, h); g.fillRect(0, H - h, W, h);
  }

  function dashedCircle(r, color, width = 1, dash = [6, 8], a0 = 0, a1 = TAU) {
    g.save(); g.setLineDash(dash); g.strokeStyle = color; g.lineWidth = width;
    g.beginPath(); g.arc(0, 0, r, a0, a1); g.stroke(); g.restore();
  }

  function drawOverlaysBehind(G, s, d) {
    const r = G.bodyR, ctx = G.simCtx;
    if (!d.collectAtCursor && d.kind !== 'bh' && d.kind !== 'inspiral') dashedCircle(r * ctx.captureMult + 2, 'rgba(180,200,255,0.10)', 1, [2, 6]);
    if (d.type === 'jeans') {
      const ratio = s.core.M / CA.Evo.coreJeans(s);
      dashedCircle(r * 1.45, 'rgba(200,180,255,0.35)', 1.5, [4, 6]);
      g.strokeStyle = ratio >= 1 ? 'rgba(255,200,140,0.9)' : 'rgba(150,170,255,0.8)'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, r * 1.45, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, ratio)); g.stroke();
    }
    if (d.swarm) {
      const R2 = ctx.swarmR, k = s.swarmT / d.swarm.hold, n = G.world.swarmCount;
      dashedCircle(R2, n >= d.swarm.count ? 'rgba(255,220,150,0.5)' : 'rgba(160,190,255,0.25)', 1.5, [5, 7]);
      if (k > 0) { g.strokeStyle = 'rgba(255,220,150,0.95)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, R2, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, k)); g.stroke(); }
      g.fillStyle = 'rgba(220,230,255,0.75)'; g.font = '600 11px Inter, system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(CA.t('rend.swarm', { n, c: d.swarm.count }), 0, -R2 - 8);
    }
    if (d.kind === 'bh') {
      const bh = ctx.bh;
      dashedCircle(bh.tidal, 'rgba(255,90,90,0.35)', 1, [3, 6]);
      g.fillStyle = 'rgba(255,120,120,0.6)'; g.font = '10px Inter, system-ui, sans-serif'; g.textAlign = 'left';
      g.fillText(CA.t('rend.tidal'), bh.tidal * 0.72, -bh.tidal * 0.72);
      dashedCircle(G.einsteinR, 'rgba(200,220,255,0.28)', 1, [1, 5]);
      const L = G.lens;
      if (L) {
        const near = Math.abs(Math.hypot(L.x, L.y) - G.einsteinR) < G.einsteinR * 0.18;
        g.save(); g.globalCompositeOperation = 'lighter';
        const rr = near ? 16 : 9;
        const rg = g.createRadialGradient(L.x, L.y, 0, L.x, L.y, rr);
        rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(1, 'rgba(180,210,255,0)');
        g.fillStyle = rg; g.fillRect(L.x - rr, L.y - rr, rr * 2, rr * 2);
        g.restore();
      }
    }
    if (s.stage === 'agb') { // thermal pulse ring: capture at the peak
      const ph = CA.Evo.agbPhase(s), k = Math.sin(Math.PI * ph), peak = Math.abs(ph - 0.5) < 0.12;
      g.strokeStyle = peak ? 'rgba(255,230,160,0.95)' : `rgba(255,170,110,${0.25 + 0.5 * k})`; g.lineWidth = peak ? 4 : 2;
      g.beginPath(); g.arc(0, 0, r * (1.05 + 0.45 * k), 0, TAU); g.stroke();
      dashedCircle(r * 1.5, 'rgba(255,230,160,0.35)', 1, [3, 5]);
    }
    if (d.kind === 'inspiral') { // detector line: one beat each time the pair stands on it
      const c = s.chirp, Bin = CA.Binary, t = s.stageTime, top = -(H / 2 - hudTop()) / G.cam.zoom + G.cam.y, k = c.idx < c.N ? Math.abs(t - Bin.beatT(c, c.idx)) / Bin.beatWin(c, c.idx) : 9, hot = k <= 1;
      g.save(); g.setLineDash([3, 6]); g.strokeStyle = hot ? 'rgba(140,255,200,0.95)' : 'rgba(190,210,255,0.5)'; g.lineWidth = hot ? 2.5 : 1.5;
      g.beginPath(); g.moveTo(0, top); g.lineTo(0, -top); g.stroke(); g.restore();
      g.fillStyle = hot ? '#9dffcf' : 'rgba(210,225,255,0.85)'; g.font = '600 12px Inter, system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(CA.t(hot ? 'bin.lineUp' : 'bin.detector'), 0, top - 8);
    }
    if (d.kind === 'ns') {
      const top = -(H / 2 - hudTop()) / G.cam.zoom + G.cam.y;
      const ang = CA.Evo.nsBeamAngle(s.remnant);
      const err = Math.abs(((ang + Math.PI / 2) / Math.PI) - Math.round((ang + Math.PI / 2) / Math.PI)) * Math.PI;
      const hot = err < 0.22;
      g.save(); g.setLineDash([3, 6]);
      g.strokeStyle = hot ? 'rgba(140,255,200,0.95)' : 'rgba(190,210,255,0.55)'; g.lineWidth = hot ? 2.5 : 1.5;
      g.beginPath(); g.moveTo(0, -r * 3); g.lineTo(0, top); g.stroke(); g.restore();
      g.fillStyle = hot ? '#9dffcf' : 'rgba(210,225,255,0.85)';
      g.beginPath(); g.moveTo(0, top + 2); g.lineTo(-7, top - 10); g.lineTo(7, top - 10); g.closePath(); g.fill();
      g.font = '600 12px Inter, system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(CA.t(hot ? 'rend.record' : 'rend.detector'), 0, top - 16);
    }
  }

  // the detector's strain over the last 3 s; green ticks are recorded beats, red ones false alarms
  function drawChirpScope(s) {
    const c = s.chirp, Bin = CA.Binary, t = s.stageTime, sw = Math.min(560, W - 32), sh = 76, x = (W - sw) / 2, y = H - 190, span = 3;
    g.save(); g.fillStyle = 'rgba(5,10,20,0.78)'; g.fillRect(x, y, sw, sh); g.strokeStyle = 'rgba(255,255,255,0.14)'; g.strokeRect(x, y, sw, sh);
    g.strokeStyle = '#8fe3ff'; g.lineWidth = 1.2; g.beginPath();
    for (let i = 0; i <= sw; i += 1.5) {
      const tt = t - span + (i / sw) * span, v = tt > 0 ? Bin.strain(c, tt) : 0, py = y + sh / 2 - v * (sh / 2 - 6);
      i ? g.lineTo(x + i, py) : g.moveTo(x + i, py);
    }
    g.stroke();
    for (const m of c.marks) { const px = x + sw - ((t - m.t) / span) * sw; if (px > x) { g.fillStyle = m.ok ? '#7dffb0' : '#ff8a7a'; g.fillRect(px - 1, y + 3, 2, 10); } }
    g.fillStyle = 'rgba(200,210,240,0.75)'; g.font = '11px Inter, system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(CA.t('bin.scope'), x + 4, y - 5);
    g.restore();
  }

  function drawLightPool(G, light) {
    const calm = G.settings.reducedMotion, Rl = light.reach * G.bodyR * (calm ? 1 : 1 + 0.03 * Math.sin(G.time * 0.7));
    g.save(); g.globalCompositeOperation = 'lighter';
    g.globalAlpha = Math.min(1, light.i * 0.3 * (1 + 0.7 * CA.FX.feed));
    g.drawImage(poolSprite(light.c), -Rl, -Rl, Rl * 2, Rl * 2);
    g.restore();
  }

  function drawMotes(G, light) {
    const motes = G.world.motes, star = CA.STAGE[G.state.stage].chapter >= 3, t = G.time, twinkle = !G.settings.reducedMotion;
    const tint = light && quality < 2 ? tintSprite(light.c) : null, lr = light ? light.reach * G.bodyR : 0, lr2 = lr * lr;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const spr = sprites[m.type] || sprites.dust, tr = TRAIL[m.type] || TRAIL.dust;
      const sp = Math.hypot(m.vx, m.vy);
      if (m.stretch > 0.05) { // spaghettification near a black hole
        const d = Math.hypot(m.x, m.y) || 1, ux = m.x / d, uy = m.y / d, L = m.r * (1 + m.stretch * 9);
        g.strokeStyle = tr[0]; g.lineWidth = Math.max(0.6, m.r * (1 - m.stretch * 0.6));
        g.beginPath(); g.moveTo(m.x - ux * L, m.y - uy * L); g.lineTo(m.x + ux * L, m.y + uy * L); g.stroke();
        continue;
      }
      if (sp > 110 || m.type === 'comet') {
        const k = m.type === 'comet' ? 0 : Math.min(3, sp / 120);
        g.strokeStyle = tr[m.type === 'rogue' ? 2 : 1]; g.lineWidth = Math.max(0.7, m.r * 0.7);
        g.beginPath();
        if (m.type === 'comet' && star) { const d = Math.hypot(m.x, m.y) || 1; g.moveTo(m.x, m.y); g.lineTo(m.x + (m.x / d) * 16, m.y + (m.y / d) * 16); }
        else { g.moveTo(m.x, m.y); g.lineTo(m.x - m.vx * 0.03 * k, m.y - m.vy * 0.03 * k); }
        g.stroke();
        if (quality === 0 && m.type !== 'comet') { // a fainter, wider wake behind the bright streak
          g.strokeStyle = tr[3]; g.lineWidth = Math.max(1.2, m.r * 1.5);
          g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x - m.vx * 0.06 * k, m.y - m.vy * 0.06 * k); g.stroke();
        }
      }
      const size = m.r * (m.type === 'gas' ? 3.2 : 4.2);
      g.globalAlpha = twinkle && m.type !== 'rogue' && m.type !== 'impactor' ? 0.82 + 0.18 * Math.sin(t * 2.3 + m.id * 1.7) : 1;
      g.drawImage(spr, m.x - size / 2, m.y - size / 2, size, size);
      if (tint) {
        const d2 = m.x * m.x + m.y * m.y;
        if (d2 < lr2) { // lit by the body: strongest close in
          const k = (1 - Math.sqrt(d2) / lr) * light.i, s2 = size * (1 + 0.6 * k);
          g.globalAlpha = Math.min(1, k * 1.3);
          g.drawImage(tint, m.x - s2 / 2, m.y - s2 / 2, s2, s2);
        }
      }
      g.globalAlpha = 1;
      if (m.warn) {
        g.save(); g.globalCompositeOperation = 'source-over'; g.setLineDash([4, 6]);
        g.strokeStyle = 'rgba(255,90,90,0.45)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x + m.vx * 1.5, m.y + m.vy * 1.5); g.stroke(); g.restore();
      }
    }
    g.restore();
  }

  function drawSystem(G, s, d) {
    const t = G.time, r = G.bodyR;
    // a ring belongs to your world: around the body itself, or around the planet once that orbits the star
    let ringAt = d.chapter >= 3 ? null : { x: 0, y: 0, r };
    // your planet, once it orbits the star
    if (s.planet && !s.planet.engulfed && d.chapter >= 3) {
      let orbit;
      if (d.type === 'remnant' || d.kind === 'inspiral') orbit = d.kind === 'inspiral' ? 250 : 170;
      else orbit = r * (1.15 + 1.25 * Math.log10(Math.max(1, CA.Evo.planetOrbitRsun(s) / Math.max(1, s.star.rg)))) + 12;
      const a = t * (s.planet.zone === 'outer' ? 0.12 : 0.25);
      g.strokeStyle = 'rgba(160,190,255,0.10)'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(0, 0, orbit, orbit * 0.92, 0, 0, TAU); g.stroke();
      const px = Math.cos(a) * orbit, py = Math.sin(a) * orbit * 0.92;
      const pd = Math.hypot(px, py) || 1; // lit from the star at the centre, not from the usual upper left
      CA.Bodies.draw(g, 'planet', px, py, s.planet.type === 'gasgiant' ? 9 : 6, { t, seed: s.cycle, ptype: s.planet.type, lx: -px / pd, ly: -py / pd });
      ringAt = { x: px, y: py, r: s.planet.type === 'gasgiant' ? 9 : 6 };
    }
    // the binary companion, with a gas stream from the star while it overflows its Roche lobe
    if (s.companion && d.chapter >= 3 && d.kind !== 'inspiral') {
      const c = s.companion, orbit = Math.max(r * 1.75, 120), a = t * 0.16 + 1.1, cx = Math.cos(a) * orbit, cy = Math.sin(a) * orbit * 0.86;
      g.strokeStyle = 'rgba(200,190,255,0.09)'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(0, 0, orbit, orbit * 0.86, 0, 0, TAU); g.stroke();
      if (CA.Binary.transferring(s)) {
        const al = U.clamp(0.25 + 0.5 * c.x, 0, 0.9), band = CA.Binary.bandOf(c.x), col = band === 'ok' ? '160,235,255' : band === 'high' ? '255,150,110' : '190,190,220';
        g.save(); g.globalCompositeOperation = 'lighter';
        const lg = g.createLinearGradient(cx * (r / orbit), cy * (r / orbit), cx, cy);
        lg.addColorStop(0, `rgba(255,190,130,${al})`); lg.addColorStop(1, `rgba(${col},${al})`);
        g.strokeStyle = lg; g.lineWidth = 2 + 3 * Math.min(1.5, c.x);
        g.beginPath(); g.moveTo(cx * (r / orbit), cy * (r / orbit)); g.quadraticCurveTo(cx * 0.82 - cy * 0.16, cy * 0.82 + cx * 0.16, cx, cy); g.stroke();
        g.strokeStyle = `rgba(${col},${al * 0.7})`; g.lineWidth = 2;
        g.beginPath(); g.ellipse(cx, cy, 13, 5, -0.35, 0, TAU); g.stroke();
        g.restore();
      }
      CA.Bodies.draw(g, c.type, cx, cy, c.type === 'bh' ? 11 : 5, { t, seed: 2, T: 30000, beam: t * 1.3, beamLen: 70, magnetar: c.magnetar });
    }
    // minor bodies placed in the Orbital Mechanics minigame
    s.system.forEach((b, i) => {
      if (b.type === 'ring') { // debris torn apart inside the Roche limit, seen slightly tilted
        if (!ringAt) return;
        const { x, y, r: pr } = ringAt, bands = [[1.55, 0.35, 0.16], [1.85, 0.5, 0.22], [2.15, 0.28, 0.12]];
        const arc = (a0, a1) => bands.forEach(([k, al, w]) => { g.strokeStyle = `rgba(225,210,185,${al})`; g.lineWidth = Math.max(1, pr * w); g.beginPath(); g.ellipse(x, y, pr * k, pr * k * 0.32, -0.35, a0, a1); g.stroke(); });
        g.save(); g.beginPath(); g.rect(x - pr * 3, y - pr * 3, pr * 6, pr * 6); g.arc(x, y, pr, 0, TAU, true); g.clip('evenodd'); arc(Math.PI, TAU); g.restore(); // far half: hidden behind the planet
        arc(0, Math.PI); // near half: in front
        return;
      }
      const orbit = r * (1.6 + b.a * 0.55), a = t * (0.5 / Math.sqrt(b.a)) + i * 1.9;
      g.fillStyle = b.type === 'moon' ? 'rgba(220,220,230,0.85)' : 'rgba(190,170,150,0.8)';
      g.beginPath(); g.arc(Math.cos(a) * orbit, Math.sin(a) * orbit * (1 - b.e * 0.5), b.type === 'moon' ? 2.6 : 1.8, 0, TAU); g.fill();
    });
  }

  function drawFields(G, s, d) {
    const inp = G.input, ctx = G.simCtx;
    if (ctx.well.active) {
      const x = ctx.well.x, y = ctx.well.y, Rw = ctx.wellRange;
      g.save(); g.globalCompositeOperation = 'lighter';
      const rg = g.createRadialGradient(x, y, 0, x, y, Rw);
      rg.addColorStop(0, 'rgba(140,170,255,0.22)'); rg.addColorStop(1, 'rgba(140,170,255,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, Rw, 0, TAU); g.fill();
      for (let i = 0; i < 3; i++) {
        const k = 1 - ((G.time * 0.8 + i / 3) % 1);
        g.strokeStyle = `rgba(170,200,255,${0.35 * (1 - k)})`; g.lineWidth = 1.2;
        g.beginPath(); g.arc(x, y, Rw * k, 0, TAU); g.stroke();
      }
      g.restore();
    } else if (!G.menu && inp.inside) {
      const w = R.toWorld(G, inp.mx, inp.my);
      g.strokeStyle = 'rgba(170,200,255,0.12)'; g.lineWidth = 1;
      g.beginPath(); g.arc(w.x, w.y, ctx.wellRange, 0, TAU); g.stroke();
    }
    if (ctx.damp.active) {
      g.save(); g.setLineDash([2, 4]); g.strokeStyle = 'rgba(120,230,255,0.6)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(ctx.damp.x, ctx.damp.y, ctx.damp.range, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(120,230,255,0.05)'; g.fill(); g.restore();
    }
  }

  /* The lens equation only depends on the geometry, so it is solved once per size: for each pixel,
     where its light comes from (dx, dy from the hole), how much it brightens, and its edge fade.
     mag = 0 marks the shadow. */
  function buildLensMap(N, Rl, rShadow) {
    const thE = rShadow * 2.4, scale = (2 * Rl) / N, n = N * N;
    const m = { off: new Float32Array(n * 2), mag: new Float32Array(n), alpha: new Float32Array(n) };
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const dx = (i + 0.5) * scale - Rl, dy = (j + 0.5) * scale - Rl, th = Math.hypot(dx, dy), o = j * N + i;
        if (th > Rl) continue;
        m.alpha[o] = 255 * U.clamp((Rl - th) / (Rl * 0.45), 0, 1);
        if (th <= rShadow * 0.98) continue;
        const beta = th - (thE * thE) / th, ring = (th - thE) / (0.07 * thE);
        m.off[o * 2] = (dx / th) * beta; m.off[o * 2 + 1] = (dy / th) * beta;
        m.mag[o] = 1 + 0.6 * Math.exp(-ring * ring); // images bunch up and brighten near the Einstein ring
      }
    }
    return m;
  }

  /* Point-mass gravitational lensing of the background, computed per pixel at reduced resolution. */
  function drawLens(G, cx, cy, rShadow, crop) {
    const Rl = Math.min(rShadow * 7, Math.min(W, H) * 0.48);
    const N = Math.max(32, Math.round(Rl * (quality ? 0.9 : 1.4))); // ~0.7× resolution: N px cover 2·Rl screen px
    if (!lensCv || N !== lensN) {
      lensCv = document.createElement('canvas'); lensCv.width = lensCv.height = N; lensN = N;
      lensData = lensCv.getContext('2d').createImageData(N, N);
      lensFrame = 0;
    }
    const key = N + ':' + rShadow.toFixed(1);
    if (key !== lensKey) { lensMap = buildLensMap(N, Rl, rShadow); lensKey = key; lensFrame = 0; }
    if (lensFrame++ % (quality ? 5 : 3) === 0) {
      const src = bg.pixels(), sw = bg.W, sh = bg.H, out = lensData.data, data = src.data, { off, mag, alpha } = lensMap;
      const ox = cx + crop.sx, oy = cy + crop.sy, xMax = sw - 2, yMax = sh - 2, n = N * N, smooth = quality === 0;
      for (let o = 0; o < n; o++) {
        const p = o * 4, a = alpha[o];
        out[p + 3] = a;
        if (!a) continue;
        const k = mag[o];
        if (!k) { out[p] = out[p + 1] = out[p + 2] = 0; continue; }
        let sx = ox + off[o * 2], sy = oy + off[o * 2 + 1];
        sx = sx < 0 ? 0 : sx > xMax ? xMax : sx; sy = sy < 0 ? 0 : sy > yMax ? yMax : sy;
        const x0 = sx | 0, y0 = sy | 0, q = (y0 * sw + x0) * 4;
        if (smooth) { // blending the four nearest pixels keeps stars from flickering into a moiré at the edge
          const fx = sx - x0, fy = sy - y0, w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy, q2 = q + sw * 4;
          out[p] = (data[q] * w00 + data[q + 4] * w10 + data[q2] * w01 + data[q2 + 4] * w11) * k;
          out[p + 1] = (data[q + 1] * w00 + data[q + 5] * w10 + data[q2 + 1] * w01 + data[q2 + 5] * w11) * k;
          out[p + 2] = (data[q + 2] * w00 + data[q + 6] * w10 + data[q2 + 2] * w01 + data[q2 + 6] * w11) * k;
        } else { out[p] = data[q] * k; out[p + 1] = data[q + 1] * k; out[p + 2] = data[q + 2] * k; }
      }
      lensCv.getContext('2d').putImageData(lensData, 0, 0);
    }
    g.imageSmoothingQuality = 'high';
    g.drawImage(lensCv, cx - Rl, cy - Rl, Rl * 2, Rl * 2);
    g.imageSmoothingQuality = 'low';
  }
})(globalThis.CA = globalThis.CA || {});
