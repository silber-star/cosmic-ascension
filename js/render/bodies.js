/* COSMIC ASCENSION — procedural drawings of every celestial body kind. */
(function (CA) {
  'use strict';
  const U = CA.U, TAU = U.TAU;
  const Bodies = (CA.Bodies = {});
  const cache = new Map();

  /* Approximate blackbody colour (Tanner Helland fit), T in K → [r,g,b]. */
  Bodies.tempRGB = function (T) {
    const t = U.clamp(T, 1000, 40000) / 100;
    let r, g, b;
    if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
    else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
    return [U.clamp(r, 0, 255) | 0, U.clamp(g, 0, 255) | 0, U.clamp(b, 0, 255) | 0];
  };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map((v) => v | 0);

  function shape(key, n, rough, elong = 1) {
    if (cache.has(key)) return cache.get(key);
    const rnd = U.rng(hash(key));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const r = 1 - rough / 2 + rnd() * rough;
      pts.push([Math.cos(a) * r * elong, Math.sin(a) * r]);
    }
    const craters = [];
    for (let i = 0; i < 9; i++) craters.push([rnd() * 1.4 - 0.7, rnd() * 1.4 - 0.7, 0.08 + rnd() * 0.18]);
    const grains = [];
    for (let i = 0; i < 60; i++) {
      const a = rnd() * TAU, d = Math.pow(rnd(), 0.7);
      grains.push([Math.cos(a) * d, Math.sin(a) * d, 0.16 + rnd() * 0.22, rnd()]);
    }
    const out = { pts, craters, grains, rnd: rnd() };
    cache.set(key, out);
    return out;
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function poly(g, pts, x, y, r, rot) {
    g.beginPath();
    const c = Math.cos(rot), s = Math.sin(rot);
    pts.forEach(([px, py], i) => {
      const X = x + (px * c - py * s) * r, Y = y + (px * s + py * c) * r;
      i ? g.lineTo(X, Y) : g.moveTo(X, Y);
    });
    g.closePath();
  }

  // a glow is a pre-drawn sprite: building a gradient every frame costs far more than stretching an image
  const glows = new Map();
  function glowSprite(c) {
    const key = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
    let s = glows.get(key);
    if (!s) {
      s = document.createElement('canvas'); s.width = s.height = 128;
      const sg = s.getContext('2d'), rg = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
      rg.addColorStop(0, rgba(c, 1)); rg.addColorStop(1, rgba(c, 0));
      sg.fillStyle = rg; sg.fillRect(0, 0, 128, 128);
      glows.set(key, s);
    }
    return s;
  }
  function glow(g, x, y, r, c, a) {
    if (typeof document === 'undefined') { // tests have no canvas to make sprites on
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rgba(c, a)); rg.addColorStop(1, rgba(c, 0));
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
      return;
    }
    const a0 = g.globalAlpha;
    g.globalAlpha = a0 * a; g.drawImage(glowSprite(c), x - r, y - r, r * 2, r * 2); g.globalAlpha = a0;
  }

  /* The light a body casts on the dust around it: colour, strength (0–1), reach in body radii.
     null: it only reflects light. */
  Bodies.lightOf = function (kind, p) {
    const T = Bodies.tempRGB;
    switch (kind) {
      case 'core': return { c: [190, 165, 255], i: 0.12 + 0.15 * U.clamp(p.jeansRatio || 0, 0, 1), reach: 3 };
      case 'protostar': return { c: [255, 165, 105], i: 0.25 + 0.35 * U.clamp((p.Tc || 0) / 10, 0, 1), reach: 9 };
      case 'star': return { c: T(p.T || 5772), i: 0.6, reach: 11 };
      case 'giant': return { c: T(p.T || 3800), i: 0.55, reach: 4.5 };
      case 'supergiant': return { c: T(p.wr ? 40000 : 3500), i: 0.55, reach: 2.4 };
      case 'pnebula': return { c: [150, 225, 255], i: 0.4, reach: 8 };
      case 'supernova': return { c: [255, 235, 205], i: 0.75, reach: 13 };
      case 'wd': return { c: T(p.T || 20000), i: 0.45, reach: 14 };
      case 'ns': return { c: [170, 205, 255], i: 0.4, reach: 18 };
      case 'inspiral': return { c: [190, 210, 255], i: 0.3, reach: 12 };
      case 'bh': return { c: [255, 170, 100], i: 0.35, reach: 6 };
      case 'snr': return { c: [140, 230, 220], i: 0.3, reach: 7 };
    }
    return null;
  };

  // light comes from the upper left (the young star / host star)
  let lightX = -0.707, lightY = -0.707;
  function shade(g, x, y, r, light, dark) {
    const rg = g.createRadialGradient(x + lightX * r * 0.64, y + lightY * r * 0.64, r * 0.1, x, y, r * 1.15);
    rg.addColorStop(0, light); rg.addColorStop(1, dark);
    return rg;
  }

  function rock(g, x, y, r, p, opts) {
    const sh = shape(opts.key, opts.n, opts.rough, opts.elong);
    g.save();
    poly(g, sh.pts, x, y, r, p.rot);
    g.fillStyle = shade(g, x, y, r, opts.light, opts.dark);
    g.fill();
    g.clip();
    if (opts.craters) {
      for (const [cx, cy, cr] of sh.craters) {
        const X = x + cx * r, Y = y + cy * r, R = cr * r;
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.arc(X, Y, R, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,240,220,0.10)'; g.lineWidth = Math.max(0.6, R * 0.18);
        g.beginPath(); g.arc(X - R * 0.1, Y - R * 0.1, R, Math.PI * 0.9, Math.PI * 1.8); g.stroke();
      }
    }
    if (opts.magma) {
      g.strokeStyle = `rgba(255,${120 + 60 * Math.sin(p.t * 2)},40,${0.55 + 0.25 * Math.sin(p.t * 3)})`;
      g.lineWidth = Math.max(1, r * 0.04);
      g.shadowColor = 'rgba(255,120,30,0.9)'; g.shadowBlur = r * 0.15;
      const rnd = U.rng(77);
      for (let i = 0; i < 7; i++) {
        let px = x + (rnd() - 0.5) * r * 1.4, py = y + (rnd() - 0.5) * r * 1.4;
        g.beginPath(); g.moveTo(px, py);
        for (let k = 0; k < 4; k++) { px += (rnd() - 0.5) * r * 0.5; py += (rnd() - 0.5) * r * 0.5; g.lineTo(px, py); }
        g.stroke();
      }
      g.shadowBlur = 0;
    }
    // terminator
    const tg = g.createLinearGradient(x + lightX * r * 1.41, y + lightY * r * 1.41, x - lightX * r * 1.41, y - lightY * r * 1.41);
    tg.addColorStop(0.45, 'rgba(0,0,0,0)'); tg.addColorStop(1, 'rgba(0,0,0,0.65)');
    g.fillStyle = tg; g.fillRect(x - r * 1.5, y - r * 1.5, r * 3, r * 3);
    g.restore();
  }

  function aggregate(g, x, y, r, p, count, key, col) {
    const sh = shape(key, 8, 0.3);
    const n = Math.min(sh.grains.length, count);
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    for (let i = 0; i < n; i++) {
      const [gx, gy, gr, tone] = sh.grains[i];
      const X = x + (gx * c - gy * s) * r, Y = y + (gx * s + gy * c) * r, R = gr * r * (0.7 + 0.3 * (1 - i / n));
      const light = mix(col[0], col[1], tone);
      g.fillStyle = shade(g, X, Y, R, rgba(light, 1), rgba(mix(light, [0, 0, 0], 0.7), 1));
      g.beginPath(); g.arc(X, Y, R, 0, TAU); g.fill();
    }
  }

  const PLANET_LOOK = {
    terrestrial: { base: [40, 90, 160], land: [120, 110, 80], cloud: 0.55, atmo: [120, 170, 255] },
    superearth: { base: [40, 110, 120], land: [90, 130, 80], cloud: 0.65, atmo: [140, 220, 210] },
    icegiant: { bands: [[110, 210, 225], [90, 180, 210], [140, 230, 235]], atmo: [150, 240, 255] },
    gasgiant: { bands: [[225, 180, 130], [190, 130, 90], [240, 215, 175], [170, 110, 80]], atmo: [255, 210, 160], spot: true },
    inner: { base: [90, 70, 60], land: [140, 110, 90], cloud: 0.1, atmo: [255, 160, 110] },
    outer: { base: [120, 150, 170], land: [190, 210, 220], cloud: 0.15, atmo: [170, 220, 255] },
  };

  function planet(g, x, y, r, p) {
    const look = PLANET_LOOK[p.ptype] || PLANET_LOOK.inner;
    glow(g, x, y, r * 1.35, look.atmo, 0.22);
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    if (look.bands) {
      const n = 14;
      for (let i = 0; i < n; i++) {
        const c = look.bands[i % look.bands.length];
        const yy = y - r + (i / n) * 2 * r;
        g.fillStyle = rgba(c, 1);
        g.beginPath();
        for (let k = 0; k <= 24; k++) {
          const xx = x - r + (k / 24) * 2 * r;
          const off = Math.sin(k * 0.8 + i * 1.7 + p.t * 0.6) * r * 0.025;
          k ? g.lineTo(xx, yy + off) : g.moveTo(xx, yy + off);
        }
        g.lineTo(x + r, yy + (2 * r) / n + 2); g.lineTo(x - r, yy + (2 * r) / n + 2); g.closePath(); g.fill();
      }
      if (look.spot) {
        const sx = x + ((p.t * 6) % (r * 3)) - r * 1.5;
        g.fillStyle = 'rgba(200,90,60,0.85)'; g.beginPath(); g.ellipse(sx, y + r * 0.28, r * 0.18, r * 0.1, 0, 0, TAU); g.fill();
      }
    } else {
      g.fillStyle = rgba(look.base, 1); g.fillRect(x - r, y - r, r * 2, r * 2);
      const sh = shape('planet' + p.seed, 8, 0.3);
      const spin = (p.t * 0.05) % 2;
      g.fillStyle = rgba(look.land, 1);
      for (const [gx, gy, gr] of sh.grains.slice(0, 22)) {
        let X = gx + spin * 2 - 2; if (X < -1.4) X += 2.8; if (X > 1.4) X -= 2.8;
        g.beginPath(); g.ellipse(x + X * r, y + gy * r * 0.9, gr * r * 1.3, gr * r * 0.8, 0, 0, TAU); g.fill();
      }
      if (look.cloud > 0.2) {
        g.fillStyle = `rgba(255,255,255,${look.cloud * 0.5})`;
        for (const [gx, gy, gr] of sh.grains.slice(25, 40)) {
          let X = gx + spin * 2.6 - 2; while (X < -1.4) X += 2.8; while (X > 1.4) X -= 2.8;
          g.beginPath(); g.ellipse(x + X * r, y + gy * r * 0.85, gr * r * 1.6, gr * r * 0.35, 0.2, 0, TAU); g.fill();
        }
      }
    }
    const tg = g.createRadialGradient(x + lightX * r * 0.71, y + lightY * r * 0.71, r * 0.2, x, y, r * 1.25);
    tg.addColorStop(0, 'rgba(255,255,255,0.08)'); tg.addColorStop(0.6, 'rgba(0,0,0,0.15)'); tg.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = tg; g.fillRect(x - r, y - r, r * 2, r * 2);
    g.restore();
    g.strokeStyle = rgba(look.atmo, 0.35); g.lineWidth = Math.max(1, r * 0.05);
    g.beginPath(); g.arc(x, y, r, Math.PI * 0.8, Math.PI * 1.75); g.stroke();
  }

  function star(g, x, y, r, p, T, opts = {}) {
    const c = Bodies.tempRGB(T);
    const pulse = 1 + 0.02 * Math.sin(p.t * 1.7);
    glow(g, x, y, r * (opts.corona || 4.2) * pulse, c, opts.glowA || 0.32);
    glow(g, x, y, r * 1.8, mix(c, [255, 255, 255], 0.3), 0.5);
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    const lg = g.createRadialGradient(x, y, 0, x, y, r);
    lg.addColorStop(0, rgba(mix(c, [255, 255, 255], 0.55), 1));
    lg.addColorStop(0.75, rgba(c, 1));
    lg.addColorStop(1, rgba(mix(c, [60, 10, 0], 0.45), 1)); // limb darkening
    g.fillStyle = lg; g.fillRect(x - r, y - r, r * 2, r * 2);
    // granulation / convective cells
    const sh = shape('star' + (opts.cells || 'g'), 8, 0.3);
    const cells = opts.cellCount || 40, big = opts.cellSize || 0.12;
    for (let i = 0; i < Math.min(cells, sh.grains.length); i++) {
      const [gx, gy, gr, tone] = sh.grains[i];
      const fl = 0.5 + 0.5 * Math.sin(p.t * (0.8 + tone) + i);
      g.fillStyle = tone > 0.5 ? rgba(mix(c, [255, 255, 255], 0.4), 0.10 * fl) : rgba(mix(c, [0, 0, 0], 0.5), 0.12 * fl);
      g.beginPath(); g.arc(x + gx * r * 0.95, y + gy * r * 0.95, gr * r * big * 4, 0, TAU); g.fill();
    }
    g.restore();
    if (opts.prominence !== false) {
      const a = p.t * 0.15;
      g.strokeStyle = rgba(mix(c, [255, 120, 80], 0.5), 0.35); g.lineWidth = Math.max(1, r * 0.04);
      g.beginPath(); g.arc(x + Math.cos(a) * r * 1.02, y + Math.sin(a) * r * 1.02, r * 0.22, a + Math.PI * 0.2, a + Math.PI * 1.2); g.stroke();
    }
  }

  Bodies.draw = function (g, kind, x, y, r, p) {
    lightX = p.lx === undefined ? -0.707 : p.lx; lightY = p.ly === undefined ? -0.707 : p.ly; // p.lx, p.ly: unit vector toward the light
    switch (kind) {
      case 'grain': rock(g, x, y, r, p, { key: 'grain' + p.seed, n: 9, rough: 0.55, elong: 1.2, light: '#b9a894', dark: '#3a2f27' }); break;
      case 'cluster': aggregate(g, x, y, r, p, 6 + Math.floor(p.prog * 22), 'cl' + p.seed, [[190, 170, 150], [120, 110, 120]]); break;
      case 'aggregate': aggregate(g, x, y, r, p, 26 + Math.floor(p.prog * 34), 'ag' + p.seed, [[200, 180, 160], [150, 120, 100]]); break;
      case 'pebble': rock(g, x, y, r, p, { key: 'pb' + p.seed, n: 16, rough: 0.16, elong: 1.12, light: '#a99d8f', dark: '#2b2622', craters: false }); break;
      case 'planetesimal': rock(g, x, y, r, p, { key: 'ps' + p.seed, n: 18, rough: 0.32, elong: 1.35, light: '#9c8b7a', dark: '#221c18', craters: true }); break;
      case 'protoplanet': rock(g, x, y, r, p, { key: 'pp' + p.seed, n: 24, rough: 0.12, elong: 1.04, light: '#8a7466', dark: '#1d1512', craters: true, magma: true }); break;
      case 'planet': planet(g, x, y, r, p); break;
      case 'core': {
        const ratio = U.clamp(p.jeansRatio || 0, 0, 2);
        const c1 = mix([70, 80, 120], [140, 120, 200], U.clamp(ratio - 0.5, 0, 1));
        for (let i = 0; i < 6; i++) {
          const a = p.t * 0.05 * (i % 2 ? 1 : -1) + i;
          glow(g, x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.2, r * (1.6 - i * 0.15), c1, 0.12 + 0.05 * ratio);
        }
        glow(g, x, y, r * 0.7, [20, 10, 20], 0.6); // dusty, opaque centre
        glow(g, x, y, r * 0.35 * (0.5 + ratio * 0.5), [255, 200, 170], 0.08 * ratio);
        break;
      }
      case 'protostar': {
        const heat = U.clamp(p.Tc / 10, 0, 1.5);
        const T = 2500 + heat * 2500;
        // envelope
        glow(g, x, y, r * 5, [120, 70, 60], 0.18);
        // bipolar jets
        const jl = r * (3 + heat * 3);
        for (const sgn of [-1, 1]) {
          const jg = g.createLinearGradient(x, y, x, y + sgn * jl);
          jg.addColorStop(0, 'rgba(180,220,255,0.55)'); jg.addColorStop(1, 'rgba(180,220,255,0)');
          g.fillStyle = jg; g.beginPath(); g.moveTo(x - r * 0.15, y); g.lineTo(x - r * 0.5, y + sgn * jl); g.lineTo(x + r * 0.5, y + sgn * jl); g.lineTo(x + r * 0.15, y); g.fill();
        }
        // back half of disk
        diskEllipse(g, x, y, r * 3.2, r * 0.7, [255, 150, 90], 0.35, Math.PI, TAU, p.t);
        star(g, x, y, r, p, T, { corona: 2.5, glowA: 0.25 + heat * 0.15, prominence: false });
        diskEllipse(g, x, y, r * 3.2, r * 0.7, [255, 150, 90], 0.45, 0, Math.PI, p.t);
        break;
      }
      case 'star': star(g, x, y, r, p, p.T || 5772, { corona: p.corona }); break;
      case 'giant': {
        glow(g, x, y, r * 2.2, [255, 110, 60], 0.12); // mass-loss haze
        star(g, x, y, r, p, p.T || 3800, { corona: 2.2, cells: 'giant', cellCount: 14, cellSize: 0.5, glowA: 0.22 });
        break;
      }
      case 'supergiant': {
        const T = p.wr ? 40000 : 3500;
        glow(g, x, y, r * 2.4, p.wr ? [140, 180, 255] : [255, 90, 50], 0.14);
        star(g, x, y, p.wr ? r * 0.35 : r, p, T, { corona: p.wr ? 6 : 2, cells: 'sg', cellCount: 10, cellSize: 0.6, glowA: 0.22 });
        break;
      }
      case 'pnebula': {
        const k = U.clamp(p.prog, 0, 1);
        const R = r * (2 + k * 8);
        g.save(); g.globalCompositeOperation = 'lighter';
        for (const [col, f, w] of [[[60, 220, 200], 0.55, 0.35], [[255, 80, 110], 1, 0.22], [[120, 120, 255], 0.8, 0.18]]) {
          const rg = g.createRadialGradient(x, y, R * f * 0.6, x, y, R * f);
          rg.addColorStop(0, rgba(col, 0)); rg.addColorStop(0.7, rgba(col, w * (1 - k * 0.5))); rg.addColorStop(1, rgba(col, 0));
          g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, R * f, R * f * 0.78, 0.4, 0, TAU); g.fill();
        }
        for (const sgn of [-1, 1]) { // bipolar lobes
          glow(g, x + Math.cos(0.4) * R * 0.6 * sgn, y + Math.sin(0.4) * R * 0.6 * sgn, R * 0.45, [255, 120, 140], 0.12 * (1 - k * 0.4));
        }
        g.restore();
        star(g, x, y, Math.max(3, r * 0.25), p, 90000, { corona: 6, glowA: 0.5, prominence: false, cellCount: 0 });
        break;
      }
      case 'supernova': {
        const k = U.clamp(p.prog, 0, 1);
        const R = r * (1.5 + k * 14);
        g.save(); g.globalCompositeOperation = 'lighter';
        const flash = Math.max(0, 1 - k * 3);
        if (flash > 0) glow(g, x, y, r * 12, [255, 245, 230], 0.8 * flash);
        const sh = shape('sn', 8, 0.3);
        for (let i = 0; i < 48; i++) {
          const [gx, gy, gr, tone] = sh.grains[i];
          const a = Math.atan2(gy, gx), rr = R * (0.85 + tone * 0.25);
          const col = mix([255, 220, 160], [255, 80, 60], U.clamp(k * 1.4 + tone * 0.3, 0, 1));
          glow(g, x + Math.cos(a) * rr, y + Math.sin(a) * rr, R * gr * 0.9, col, 0.16 * (1 - k * 0.5));
        }
        g.strokeStyle = `rgba(255,200,150,${0.35 * (1 - k)})`; g.lineWidth = 2 + 6 * (1 - k);
        g.beginPath(); g.arc(x, y, R, 0, TAU); g.stroke();
        g.restore();
        star(g, x, y, 3, p, 1e6, { corona: 5, glowA: 0.6, prominence: false, cellCount: 0 });
        break;
      }
      case 'wd': {
        const T = p.T || 50000;
        star(g, x, y, r, p, T, { corona: 7, glowA: 0.45, prominence: false, cellCount: 0 });
        if (p.crystal) {
          g.strokeStyle = 'rgba(220,240,255,0.5)'; g.lineWidth = 0.8;
          for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + p.t * 0.1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 2.4, y + Math.sin(a) * r * 2.4); g.stroke(); }
        }
        break;
      }
      case 'ns': {
        const ang = p.beam || 0;
        // magnetic dipole loops, tilted from the spin axis like a real pulsar
        g.strokeStyle = p.magnetar ? 'rgba(210,150,255,0.55)' : 'rgba(120,180,255,0.25)'; g.lineWidth = p.magnetar ? 1.6 : 1;
        for (let k = 1; k <= (p.magnetar ? 7 : 4); k++) {
          for (const sgn of [-1, 1]) {
            g.beginPath(); g.ellipse(x + Math.cos(ang) * r * k * 1.4 * sgn, y + Math.sin(ang) * r * k * 1.4 * sgn, r * k * 1.5, r * k * 0.7, ang, 0, TAU); g.stroke();
          }
        }
        for (const off of [0, Math.PI]) {
          const a = ang + off, L = p.beamLen || 900, wdt = 0.09;
          const bg = g.createLinearGradient(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L);
          bg.addColorStop(0, 'rgba(190,225,255,0.65)'); bg.addColorStop(1, 'rgba(190,225,255,0)');
          g.fillStyle = bg; g.beginPath(); g.moveTo(x, y);
          g.lineTo(x + Math.cos(a - wdt) * L, y + Math.sin(a - wdt) * L); g.lineTo(x + Math.cos(a + wdt) * L, y + Math.sin(a + wdt) * L); g.fill();
        }
        star(g, x, y, r, p, 600000, { corona: 5, glowA: 0.5, prominence: false, cellCount: 0 });
        break;
      }
      case 'bh': blackHole(g, x, y, r, p); break;
      case 'inspiral': { // the two remnants around their centre of mass, with gravitational-wave ripples spreading out
        const k = U.clamp(p.prog, 0, 1);
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const f = (p.t * (0.3 + k) + i / 5) % 1, rr = p.sep * (0.6 + f * 5);
          g.strokeStyle = `rgba(170,200,255,${(0.05 + 0.3 * k) * (1 - f)})`; g.lineWidth = 1.5;
          g.beginPath(); g.ellipse(x, y, rr, rr * 0.92, p.ang, 0, TAU); g.stroke();
        }
        g.restore();
        for (const b of p.pair) Bodies.draw(g, b.type, x + b.x, y + b.y, b.r || (b.type === 'bh' ? 13 : b.type === 'ns' ? 5 : 6), { t: p.t, seed: 3, T: 30000, beam: p.t * 2, beamLen: 60 });
        break;
      }
      case 'kilonova': { // red, lanthanide-rich ejecta along the orbital plane and faster blue ejecta toward the poles
        g.save(); g.globalCompositeOperation = 'lighter';
        for (const [col, sx, sy, a] of [[[255, 90, 50], 3.7, 1.5, 0.6], [[110, 170, 255], 1.5, 3.7, 0.55]]) {
          g.save(); g.translate(x, y); g.rotate(-0.5); g.scale(sx, sy); glow(g, 0, 0, r, col, a); g.restore();
        }
        g.restore();
        star(g, x, y, 2.5, p, 40000, { corona: 5, glowA: 0.6, prominence: false, cellCount: 0 });
        break;
      }
      case 'snr': { // a limb-brightened shell of shocked gas with an empty centre
        const R = r * (2.6 + 5 * (1 - Math.exp(-(p.age || 0) / 40)));
        const sh = shape('snr', 8, 0.3);
        g.save(); g.globalCompositeOperation = 'lighter';
        const rg = g.createRadialGradient(x, y, R * 0.72, x, y, R * 1.06);
        rg.addColorStop(0, 'rgba(120,180,255,0)'); rg.addColorStop(0.75, 'rgba(150,200,255,0.2)'); rg.addColorStop(1, 'rgba(255,150,110,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, R * 1.06, 0, TAU); g.fill();
        for (let i = 0; i < 44; i++) {
          const [gx, gy, gr, tone] = sh.grains[i], a = Math.atan2(gy, gx), rr = R * (0.9 + tone * 0.14);
          glow(g, x + Math.cos(a) * rr, y + Math.sin(a) * rr, R * gr * 0.5, mix([255, 150, 110], [150, 200, 255], tone), 0.14);
        }
        g.restore();
        break;
      }
      default: glow(g, x, y, r, [255, 255, 255], 0.8);
    }
  };

  function diskEllipse(g, x, y, rx, ry, col, a, a0, a1, t) {
    g.save();
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const k = 0.45 + i * 0.11;
      g.strokeStyle = rgba(mix(col, [255, 255, 255], 0.3 * (1 - i / 6)), a * (1 - i / 7));
      g.lineWidth = Math.max(1, ry * 0.18);
      g.beginPath(); g.ellipse(x, y, rx * k, ry * k, 0, a0, a1); g.stroke();
    }
    g.restore();
  }

  /* Black hole: shadow, photon ring, Doppler-beamed accretion disk (front + lensed back image). */
  function blackHole(g, x, y, r, p) {
    const rx = r * 3.4, ry = r * 0.62, t = p.t;
    const hot = [255, 190, 120], white = [255, 245, 225];
    g.save();
    g.globalCompositeOperation = 'lighter';
    // lensed image of the far side of the disk, wrapped above and below the shadow
    for (let i = 0; i < 5; i++) {
      const k = 1.08 + i * 0.12;
      g.strokeStyle = rgba(mix(white, hot, i / 5), 0.42 - i * 0.07);
      g.lineWidth = Math.max(1.2, r * 0.12);
      g.beginPath(); g.ellipse(x, y, r * k * 1.25, r * k * 1.05, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.globalAlpha = 0.5;
      g.beginPath(); g.ellipse(x, y, r * k * 1.15, r * k * 0.9, 0, Math.PI * 0.08, Math.PI * 0.92); g.stroke();
      g.globalAlpha = 1;
    }
    // back half of the disk (behind the shadow)
    diskBH(g, x, y, rx, ry, t, Math.PI, TAU, hot, white);
    g.restore();
    // shadow + photon ring
    g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,235,200,0.9)'; g.lineWidth = Math.max(1, r * 0.06);
    g.beginPath(); g.arc(x, y, r * 1.02, 0, TAU); g.stroke();
    g.save(); g.globalCompositeOperation = 'lighter';
    diskBH(g, x, y, rx, ry, t, 0, Math.PI, hot, white); // front half over the shadow
    g.restore();
  }
  function diskBH(g, x, y, rx, ry, t, a0, a1, hot, white) {
    const N = 7;
    for (let i = 0; i < N; i++) {
      const k = 0.42 + i * 0.1;
      const steps = 28;
      for (let s = 0; s < steps; s++) {
        const a = a0 + ((a1 - a0) * s) / steps, b = a0 + ((a1 - a0) * (s + 1)) / steps;
        // Doppler beaming: material moving toward us (left side, cos a < 0) appears brighter
        const beam = 0.55 + 0.45 * -Math.cos(a);
        const flick = 0.85 + 0.15 * Math.sin(a * 6 - t * (3 - i * 0.3) + i);
        const col = mix(white, hot, i / N);
        g.strokeStyle = rgba(col, (0.5 - i * 0.05) * beam * flick);
        g.lineWidth = Math.max(1, ry * 0.2);
        g.beginPath(); g.ellipse(x, y, rx * k, ry * k, 0, a, b + 0.02); g.stroke();
      }
    }
  }
})(globalThis.CA = globalThis.CA || {});
