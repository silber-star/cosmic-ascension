/* COSMIC ASCENSION — particle simulation (gameplay physics, not a real N-body solver).
   Only the body and the player's fields act on motes; motes interact with each other through
   contact (merge/bounce) using a spatial hash. World units = CSS pixels at zoom 1, body at (0,0). No DOM. */
(function (CA) {
  'use strict';
  const U = CA.U, B = CA.BAL.sim;
  const Sim = (CA.Sim = {});

  const RADIUS = { dust: 2.2, heavy: 2.5, gas: 5, spark: 1.8, anomaly: 3.2, rogue: 7, comet: 2.8, ejecta: 2.6, ice: 2.3, meteor: 2.6, impactor: 7.5 };
  const MERGEABLE = { dust: 1, heavy: 1, gas: 1, ice: 1 };
  Sim.RADIUS = RADIUS;

  Sim.defaultCtx = () => ({
    bodyR: 30, bodyStrength: B.bodyStrength, bodyRange: B.bodyRange, captureMult: 1,
    maxMotes: B.maxMotes, spawnRate: B.spawnRate, spawn: { dust: 1 },
    well: { active: false, x: 0, y: 0 }, wellStrength: B.wellStrength, wellRange: B.wellRange,
    damp: { active: false, x: 0, y: 0, range: 130 },
    funnel: 0, wind: null, drag: 0.04, merge: false, stickSpeed: B.stickSpeed, frag: false, fragSpeed: B.fragSpeed,
    collectAtCursor: false, ejectaSpeed: 90, bh: null, swarmR: 0, rogueSpeed: 230,
    grabR: 30, attr: null, turb: 0, // cosmic events: well catch radius for tagged motes, a passing star, turbulence
  });

  let nextId = 1;

  class World {
    constructor() { this.motes = []; this.grid = new U.SpatialGrid(28); this.spawnAcc = 0; this.swarmCount = 0; this.w = 800; this.h = 600; this.viewR = 500; }

    reset(w, h, ctx) {
      this.motes = [];
      this.resize(w, h);
      this.spawnAcc = 0;
      if (ctx) for (let i = 0; i < Math.min(40, ctx.maxMotes * 0.3); i++) this.spawn(ctx, true);
    }
    resize(w, h) { this.w = w; this.h = h; this.viewR = 0.5 * Math.sqrt(w * w + h * h); }

    make(type, x, y, vx, vy, s = 1) {
      const m = { id: nextId++, type, x, y, vx, vy, s, r: RADIUS[type] * Math.sqrt(Math.min(s, 12)), age: 0, orbit: 0, stretch: 0, px: x, py: y };
      this.motes.push(m);
      return m;
    }

    spawn(ctx, initial) {
      const type = U.weighted(ctx.spawn) || 'dust';
      if (ctx.collectAtCursor && type !== 'anomaly') {
        const a = Math.random() * U.TAU, r = ctx.bodyR * 1.3 + (initial ? Math.random() * this.viewR * 0.5 : 0);
        const v = ctx.ejectaSpeed * U.rand(0.6, 1.4);
        return this.make(type, Math.cos(a) * r, Math.sin(a) * r, Math.cos(a) * v, Math.sin(a) * v, U.rand(0.8, 1.6));
      }
      if (ctx.wind) {
        const y = U.rand(-this.h / 2, this.h / 2) * 0.95;
        const x = -Math.sign(ctx.wind.x || 1) * (this.w / 2 + 10) + (initial ? U.rand(0, this.w) * Math.sign(ctx.wind.x || 1) : 0);
        return this.make(type, x, y, ctx.wind.x * U.rand(0.7, 1.2), ctx.wind.y + U.rand(-8, 8), 1);
      }
      const a = Math.random() * U.TAU;
      const r = initial ? U.rand(ctx.bodyR * 3, this.viewR * 0.9) : U.rand(0.78, 0.98) * this.viewR;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (type === 'rogue') {
        const aim = Math.atan2(-y, -x) + U.rand(-0.12, 0.12);
        const m = this.make(type, x, y, Math.cos(aim) * ctx.rogueSpeed, Math.sin(aim) * ctx.rogueSpeed, 5);
        m.warn = true;
        return m;
      }
      if (initial) {
        const tang = U.rand(10, 30);
        return this.make(type, x, y, -Math.sin(a) * tang, Math.cos(a) * tang, 1);
      }
      // drift across the view toward a random point near the centre, with a slight common swirl
      const ta = Math.random() * U.TAU, tr = Math.random() * this.viewR * 0.45;
      const tx = Math.cos(ta) * tr - x, ty = Math.sin(ta) * tr - y, tl = Math.hypot(tx, ty) || 1;
      const sp = U.rand(22, 48) * (type === 'comet' ? 1.8 : type === 'gas' ? 0.8 : 1);
      return this.make(type, x, y, (tx / tl) * sp - Math.sin(a) * 8, (ty / tl) * sp + Math.cos(a) * 8, 1);
    }

    pulse(ctx, range, kick) {
      let n = 0;
      for (const m of this.motes) {
        const d = Math.hypot(m.x, m.y);
        if (d < range && d > 1) { const k = kick * Math.sqrt(1 - d / range); m.vx -= (m.x / d) * k; m.vy -= (m.y / d) * k; n++; }
      }
      return n;
    }

    // Orbital Adjustment: give nearby motes circular velocity around the body.
    orbitize(ctx, cx, cy, radius) {
      let n = 0;
      for (const m of this.motes) {
        if (Math.hypot(m.x - cx, m.y - cy) > radius || m.type === 'rogue') continue;
        const d = Math.hypot(m.x, m.y);
        if (d < ctx.bodyR * 1.2) continue;
        const a = (ctx.bodyStrength * 1.6) / (d + 30);
        const v = Math.sqrt(a * d);
        const dir = (m.x * m.vy - m.y * m.vx) >= 0 ? 1 : -1;
        m.vx = (-m.y / d) * v * dir; m.vy = (m.x / d) * v * dir; m.orbit = 1;
        n++;
      }
      return n;
    }

    step(dt, ctx) {
      const ev = [];
      const motes = this.motes;
      // spawn
      this.spawnAcc += ctx.spawnRate * dt;
      while (this.spawnAcc >= 1) { this.spawnAcc -= 1; if (motes.length < ctx.maxMotes) this.spawn(ctx, false); }

      const well = ctx.well, damp = ctx.damp, wind = ctx.wind, bh = ctx.bh;
      const capR = ctx.bodyR * ctx.captureMult;
      const drag = 1 - ctx.drag * dt;
      let swarm = 0;

      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        m.age += dt; m.px = m.x; m.py = m.y;
        let ax = 0, ay = 0;
        const d2 = m.x * m.x + m.y * m.y, d = Math.sqrt(d2) || 1;
        const bodyPull = m.orbit ? 1.6 : 1;
        if (d < ctx.bodyRange || m.orbit || m.plunge) { // plunge: event bodies on infall orbits (impactors, tidal debris) feel you from afar
          const a = (ctx.bodyStrength * bodyPull) / (d + 30); // softened 1/r: gameplay-friendly, not Newtonian
          ax -= (m.x / d) * a; ay -= (m.y / d) * a;
        }
        if (ctx.funnel > 0 && d < ctx.bodyRange * 2.4 && !ctx.collectAtCursor) {
          const a = (ctx.funnel * 900) / (d + 60);
          ax -= (m.x / d) * a; ay -= (m.y / d) * a;
        }
        if (well.active) {
          const dx = well.x - m.x, dy = well.y - m.y, wd = Math.sqrt(dx * dx + dy * dy) || 1;
          if (wd < ctx.wellRange) {
            const fall = Math.sqrt(1 - wd / ctx.wellRange);
            const a = (ctx.wellStrength / (wd + 40)) * fall;
            ax += (dx / wd) * a; ay += (dy / wd) * a;
            const k = 1 - B.wellDrag * dt; m.vx *= k; m.vy *= k;
          }
        }
        if (ctx.attr) { // a passing star tugs on everything (softened, like the well)
          const dx = ctx.attr.x - m.x, dy = ctx.attr.y - m.y, ad = Math.hypot(dx, dy) || 1, a = ctx.attr.k / (ad + 40);
          ax += (dx / ad) * a; ay += (dy / ad) * a;
        }
        if (ctx.turb && !m.orbit) { ax += (Math.random() - 0.5) * 2 * ctx.turb; ay += (Math.random() - 0.5) * 2 * ctx.turb; }
        if (damp.active && Math.hypot(damp.x - m.x, damp.y - m.y) < damp.range) { const k = 1 - 3.5 * dt; m.vx *= k; m.vy *= k; }
        if (wind && !m.orbit) { const k = 0.9 * dt; m.vx += (wind.x - m.vx) * k; m.vy += (wind.y - m.vy) * k; }
        if (bh) {
          if (bh.superEdd && d < ctx.bodyR * 5) { const a = 2600 / (d + 20); ax += (m.x / d) * a; ay += (m.y / d) * a; }
          m.stretch = U.clamp((bh.tidal - d) / (bh.tidal - ctx.bodyR), 0, 1);
          if (d < bh.disk && !m.plunge) { // the disk evens motes onto prograde near-circular orbits that drift inward (fresh plunging debris has not joined it)
            const vc = Math.sqrt((ctx.bodyStrength * d) / (d + 30)), k = Math.min(1, B.diskRelax * dt);
            m.vx += ((-m.y / d) * vc - (m.x / d) * B.diskInflow - m.vx) * k;
            m.vy += ((m.x / d) * vc - (m.y / d) * B.diskInflow - m.vy) * k;
          }
        }
        if (m.orbit) { m.vx *= 1 - 0.18 * dt; m.vy *= 1 - 0.18 * dt; } // slow orbital decay → gentle spiral
        m.vx = (m.vx + ax * dt) * drag; m.vy = (m.vy + ay * dt) * drag;
        const sp = Math.hypot(m.vx, m.vy);
        if (sp > B.maxSpeed) { m.vx *= B.maxSpeed / sp; m.vy *= B.maxSpeed / sp; }
        m.x += m.vx * dt; m.y += m.vy * dt;

        const nd = Math.hypot(m.x, m.y);
        // collection
        // collect-at-cursor stages, and event motes marked "grab", are caught by touching the well
        if (well.active && (ctx.collectAtCursor || m.grab) && Math.hypot(well.x - m.x, well.y - m.y) < (m.grab ? ctx.grabR : 24) + m.r) {
          ev.push({ kind: 'absorb', type: m.type, s: m.s, frac: 1, speed: sp, x: m.x, y: m.y, ev: m.ev, grabbed: true });
          motes.splice(i, 1); continue;
        }
        if (!ctx.collectAtCursor && nd < capR + m.r) {
          let frac = 1;
          if (ctx.frag && sp > ctx.fragSpeed && !bh) {
            frac = U.clamp(ctx.fragSpeed / sp, 0.25, 1);
            if (frac < 0.92 && motes.length < ctx.maxMotes + 6) {
              const rest = (m.s * (1 - frac)) / 2;
              for (const turn of [-0.7, 0.7]) {
                const ang = Math.atan2(m.y, m.x) + turn, out = sp * 0.33;
                const big = m.type === 'rogue' || m.type === 'impactor';
                const deb = this.make(big ? 'dust' : m.type, Math.cos(ang) * (capR + 6), Math.sin(ang) * (capR + 6), Math.cos(ang) * out, Math.sin(ang) * out, Math.max(0.3, rest));
                deb.debris = true;
              }
            }
            ev.push({ kind: 'frag', x: m.x, y: m.y, speed: sp, rogue: m.type === 'rogue' || m.type === 'impactor' });
          }
          ev.push({ kind: 'absorb', type: m.type, s: m.s, frac, speed: sp, x: m.x, y: m.y, horizon: !!bh, ev: m.ev });
          motes.splice(i, 1); continue;
        }
        if (nd > this.viewR * 1.3) { motes.splice(i, 1); continue; }
        if (ctx.swarmR && nd < ctx.swarmR && sp < 90) swarm++;
      }
      this.swarmCount = swarm;

      if (ctx.merge) this.collide(ctx, ev);
      return ev;
    }

    collide(ctx, ev) {
      const g = this.grid, motes = this.motes;
      g.clear();
      for (const m of motes) g.insert(m, m.x, m.y);
      const dead = new Set();
      for (const a of motes) {
        if (dead.has(a.id) || !MERGEABLE[a.type]) continue;
        g.near(a.x, a.y, (b) => {
          if (b.id <= a.id || dead.has(b.id) || dead.has(a.id) || !MERGEABLE[b.type]) return;
          const dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy), rr = a.r + b.r;
          if (dd >= rr || dd === 0) return;
          const rvx = b.vx - a.vx, rvy = b.vy - a.vy, rel = Math.hypot(rvx, rvy);
          if (rel < ctx.stickSpeed && a.s + b.s <= 12) {
            const s = a.s + b.s;
            a.vx = (a.vx * a.s + b.vx * b.s) / s; a.vy = (a.vy * a.s + b.vy * b.s) / s;
            a.x = (a.x * a.s + b.x * b.s) / s; a.y = (a.y * a.s + b.y * b.s) / s;
            if (b.type === 'heavy' || (b.s > a.s && b.type !== a.type)) a.type = b.type;
            a.s = s; a.r = RADIUS[a.type] * Math.sqrt(Math.min(s, 12)); a.orbit = a.orbit || b.orbit;
            dead.add(b.id);
            ev.push({ kind: 'merge', x: a.x, y: a.y, s });
          } else {
            const nx = dx / dd, ny = dy / dd, vn = rvx * nx + rvy * ny;
            if (vn < 0) { const j = -vn * 0.8; a.vx -= nx * j * 0.5; a.vy -= ny * j * 0.5; b.vx += nx * j * 0.5; b.vy += ny * j * 0.5; }
            const push = (rr - dd) / 2; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
          }
        });
      }
      if (dead.size) this.motes = motes.filter((m) => !dead.has(m.id));
    }
  }
  Sim.World = World;
})(globalThis.CA = globalThis.CA || {});
