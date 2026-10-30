/* COSMIC ASCENSION — procedural deep-space backgrounds (pre-rendered once per palette/size). */
(function (CA) {
  'use strict';
  const U = CA.U;
  const BG = (CA.BG = {});

  const PALETTES = {
    dark: { base: ['#05030a', '#0b0610'], neb: [[90, 40, 30], [60, 30, 45], [40, 25, 20]], nebA: 0.07, lanes: 0.55, stars: 260, starA: 0.5 },
    disk: { base: ['#070409', '#120a08'], neb: [[200, 120, 60], [150, 80, 50], [90, 60, 90]], nebA: 0.08, lanes: 0.35, stars: 520, starA: 0.75, glow: [255, 190, 120] },
    star: { base: ['#03040c', '#080a1c'], neb: [[60, 80, 200], [140, 60, 170], [40, 140, 180]], nebA: 0.085, lanes: 0.25, stars: 900, starA: 0.9 },
    remnant: { base: ['#02050a', '#060c16'], neb: [[30, 160, 170], [120, 60, 190], [190, 70, 110]], nebA: 0.08, lanes: 0.2, stars: 1100, starA: 1, band: true },
  };
  BG.PALETTES = PALETTES;

  function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

  function starColor(r) {
    // rough stellar colour distribution: many red/orange dwarfs, few blue giants
    if (r < 0.08) return [170, 200, 255];
    if (r < 0.25) return [215, 225, 255];
    if (r < 0.6) return [255, 245, 230];
    if (r < 0.85) return [255, 215, 170];
    return [255, 180, 140];
  }

  /* Build layers: far (nebula+faint stars, also used as the lensing source), mid stars, near stars. */
  BG.build = function (name, w, h, density = 1) {
    const P = PALETTES[name] || PALETTES.dark;
    const rnd = U.rng(name.length * 977 + 13);
    const W = Math.ceil(w * 1.12), H = Math.ceil(h * 1.12);
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const far = mk(), mid = mk(), near = mk();
    const g = far.getContext('2d');
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, P.base[0]); grad.addColorStop(1, P.base[1]);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);

    if (P.band) { // faint galactic band
      g.save(); g.translate(W / 2, H / 2); g.rotate(-0.45);
      const bg2 = g.createLinearGradient(0, -H * 0.3, 0, H * 0.3);
      bg2.addColorStop(0, 'rgba(0,0,0,0)'); bg2.addColorStop(0.5, 'rgba(120,130,170,0.10)'); bg2.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = bg2; g.fillRect(-W, -H * 0.3, W * 2, H * 0.6); g.restore();
    }
    // nebula blobs (additive)
    g.globalCompositeOperation = 'lighter';
    const blobs = 46;
    for (let i = 0; i < blobs; i++) {
      const c = P.neb[Math.floor(rnd() * P.neb.length)];
      const x = rnd() * W, y = rnd() * H, r = (0.12 + rnd() * 0.35) * Math.max(W, H);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      const a = P.nebA * (0.4 + rnd() * 0.8);
      rg.addColorStop(0, rgba(c, a)); rg.addColorStop(0.5, rgba(c, a * 0.4)); rg.addColorStop(1, rgba(c, 0));
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (P.glow) { // light from the young star, off-screen to the upper left
      const rg = g.createRadialGradient(-W * 0.1, -H * 0.15, 0, -W * 0.1, -H * 0.15, Math.max(W, H) * 0.9);
      rg.addColorStop(0, rgba(P.glow, 0.28)); rg.addColorStop(0.4, rgba(P.glow, 0.07)); rg.addColorStop(1, rgba(P.glow, 0));
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    }
    // dark dust lanes
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 18; i++) {
      const x = rnd() * W, y = rnd() * H, r = (0.08 + rnd() * 0.25) * Math.max(W, H);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(0,0,0,${P.lanes * (0.3 + rnd() * 0.5)})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // stars
    const n = Math.round(P.stars * density * (W * H) / (1600 * 1000));
    const layers = [[far, 0.55], [mid, 0.3], [near, 0.15]];
    for (const [cv, share] of layers) {
      const sg = cv.getContext('2d');
      const count = Math.round(n * share * (cv === far ? 1.6 : 1));
      for (let i = 0; i < count; i++) {
        const x = rnd() * W, y = rnd() * H, c = starColor(rnd());
        const bright = Math.pow(rnd(), cv === near ? 2.2 : 3.2);
        const s = (cv === far ? 0.5 : cv === mid ? 0.8 : 1.1) + bright * 1.6;
        sg.fillStyle = rgba(c, P.starA * (0.25 + bright * 0.75));
        sg.beginPath(); sg.arc(x, y, s * 0.6, 0, U.TAU); sg.fill();
        if (bright > 0.55) {
          const rg = sg.createRadialGradient(x, y, 0, x, y, s * 5);
          rg.addColorStop(0, rgba(c, 0.35 * P.starA)); rg.addColorStop(1, rgba(c, 0));
          sg.fillStyle = rg; sg.fillRect(x - s * 5, y - s * 5, s * 10, s * 10);
          if (bright > 0.8 && cv !== far) { // diffraction spikes
            sg.strokeStyle = rgba(c, 0.25 * P.starA); sg.lineWidth = 0.6;
            sg.beginPath(); sg.moveTo(x - s * 7, y); sg.lineTo(x + s * 7, y); sg.moveTo(x, y - s * 7); sg.lineTo(x, y + s * 7); sg.stroke();
          }
        }
      }
    }
    let data = null;
    return {
      name, W, H, far, mid, near,
      pixels() { if (!data) data = g.getImageData(0, 0, W, H); return data; },
    };
  };

  /* Draw with parallax: ox/oy is a small camera offset in px. */
  BG.draw = function (ctx, bg, w, h, ox, oy) {
    const bx = (bg.W - w) / 2, by = (bg.H - h) / 2;
    const clampX = (v) => U.clamp(v, 0, bg.W - w), clampY = (v) => U.clamp(v, 0, bg.H - h);
    // whole pixels stay sharp, and the three layers are merged once until the view moves
    const fx = Math.round(clampX(bx + ox * 0.15)), fy = Math.round(clampY(by + oy * 0.15));
    const mx = Math.round(clampX(bx + ox * 0.35)), my = Math.round(clampY(by + oy * 0.35));
    const nx = Math.round(clampX(bx + ox * 0.7)), ny = Math.round(clampY(by + oy * 0.7));
    const key = fx + ',' + fy + ',' + mx + ',' + my + ',' + nx + ',' + ny;
    if (key !== bg.compKey) {
      if (!bg.comp) { bg.comp = document.createElement('canvas'); bg.comp.width = w; bg.comp.height = h; bg.compG = bg.comp.getContext('2d', { alpha: false }); }
      const c = bg.compG;
      c.drawImage(bg.far, fx, fy, w, h, 0, 0, w, h);
      c.drawImage(bg.mid, mx, my, w, h, 0, 0, w, h);
      c.drawImage(bg.near, nx, ny, w, h, 0, 0, w, h);
      bg.compKey = key;
    }
    ctx.drawImage(bg.comp, 0, 0, w, h);
    return { sx: fx, sy: fy };
  };
})(globalThis.CA = globalThis.CA || {});
