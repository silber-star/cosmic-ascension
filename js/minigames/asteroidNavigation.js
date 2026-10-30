/* Minigame: ASTEROID NAVIGATION — fly a probe with rotation + thrust and no friction, on a limited Δv budget.
   Core mechanic: inertial piloting — to meet something you must match its velocity, not just reach its position.
   The last level is a DART-style kinetic impact (model in models.js). */
(function (CA) {
  'use strict';
  const U = CA.U, TAU = U.TAU, M = CA.Models;

  const THRUST = 90, RETRO = 45, TURN = 3.4, SHIP_R = 9, CRUISE = 160; // a held mouse stops accelerating at CRUISE
  const LEVELS = [null,
    { kind: 'beacon', world: [2000, 1200], rocks: 26, fuel: 600, time: 100, hp: 3, safe: 55 },
    { kind: 'rendezvous', world: [2200, 1300], rocks: 34, fuel: 560, time: 110, hp: 3, safe: 55 },
    { kind: 'kirkwood', world: [2400, 1500], rocks: 110, fuel: 900, time: 170, hp: 3, safe: 55, samples: 3 },
    { kind: 'binary', world: [1800, 1100], rocks: 22, fuel: 520, time: 130, hp: 3, safe: 50 },
    { kind: 'dart', world: [1800, 1100], rocks: 16, fuel: 600, time: 120, hp: 2, safe: 50, needDP: -0.04 },
  ];
  M.AN_LEVELS = LEVELS;
  // Kirkwood level: world x is the distance from the Sun (semi-major axis), 2.1–3.3 AU
  const AU0 = 2.1, AU1 = 3.3;
  const GAPS = [{ au: 2.50, name: '3:1', hw: 70 }, { au: 2.82, name: '5:2', hw: 60 }, { au: 2.95, name: '7:3', hw: 38 }, { au: 3.27, name: '2:1', hw: 60 }];
  // binary asteroid (Didymos–Dimorphos analogue): moonlet orbit radius and period
  const MOON_A = 190, MOON_P = 22, MU = Math.pow((TAU * MOON_A) / MOON_P, 2) * MOON_A, MASS_RATIO = 0.0018;
  M.AN_MOON = { a: MOON_A, P: MOON_P, mu: MU, ratio: MASS_RATIO };

  CA.MG.register({
    id: 'an', name: 'Asteroid Navigation', mechanic: 'Inertial piloting & rendezvous', unlock: 'planetesimal', levels: 5,
    science: 'In space nothing slows you down: a probe keeps its velocity until it fires its engine again, and every burn spends Δv (change in velocity) from a fixed fuel budget. To meet an asteroid you must match its velocity, not just reach its position. The real asteroid belt is mostly empty space; the gaps in it (Kirkwood gaps) are orbits cleared by resonances with Jupiter.',
    intro: (l) => {
      const L = LEVELS[l];
      return {
        objective: CA.t('an.obj' + l, { n: L.samples || 1, p: Math.round(-(L.needDP || 0) * 100) }),
        controls: [CA.t('an.c1'), CA.t('an.brake'), CA.t('an.c2'), CA.t('an.c3', { v: L.safe, hp: L.hp }), CA.t('an.c4')],
      };
    },
    create(api, level) {
      const L = LEVELS[level], [WW, WH] = L.world, rnd = api.rng;
      const auX = (au) => ((au - AU0) / (AU1 - AU0)) * WW;
      const ship = { x: 200, y: WH / 2, vx: 0, vy: 0, a: 0, hp: L.hp, fuel: L.fuel, inv: 0, thrust: 0 };
      const input = { turn: 0, thrust: 0 }, keys = {}, ptr = { down: false, x: 0, y: 0 };
      const rocks = [], targets = [];
      const st = { t: 0, hold: 0, done: false, msg: '', cam: { x: 0, y: 0 }, sampled: 0, impact: null, endT: 0, flash: 0, empty: 0 };
      const primary = L.kind === 'binary' || L.kind === 'dart' ? { x: WW / 2, y: WH / 2, r: 62, vx: 0, vy: 0 } : null;
      const moon = primary ? { r: 18, ang: rnd() * TAU, x: 0, y: 0, vx: 0, vy: 0, free: false } : null;
      const placeMoon = () => {
        if (moon.free) return;
        moon.x = primary.x + Math.cos(moon.ang) * MOON_A; moon.y = primary.y + Math.sin(moon.ang) * MOON_A;
        const w = TAU / MOON_P; moon.vx = -Math.sin(moon.ang) * MOON_A * w; moon.vy = Math.cos(moon.ang) * MOON_A * w;
      };

      function makeRock(x, y, r, vx, vy) {
        const n = 10, shape = []; for (let i = 0; i < n; i++) shape.push(0.75 + rnd() * 0.4);
        return { x, y, r, vx, vy, rot: rnd() * TAU, spin: (rnd() - 0.5) * 0.6, shape };
      }
      const clearOf = (x, y, r, pad) => rocks.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + r + pad);
      function density(x) { // Kirkwood level: few rocks inside the resonance gaps
        if (L.kind !== 'kirkwood') return 1;
        for (const gp of GAPS) if (Math.abs(x - auX(gp.au)) < gp.hw) return 0.04;
        return 1;
      }
      // keep-out zones: start, targets, the binary system
      const keepOut = [];
      if (L.kind === 'beacon') { const b = { x: WW - 260, y: WH * (0.3 + rnd() * 0.4), r: 45, beacon: true, vx: 0, vy: 0 }; targets.push(b); keepOut.push([b.x, b.y, 160]); }
      if (L.kind === 'rendezvous') {
        // drifts across the field toward the start side, slowly enough to stay inside it for the whole run
        const a = Math.PI + (rnd() - 0.5) * 0.6, tg = makeRock(WW - 260, WH / 2, 26, Math.cos(a) * 20, Math.sin(a) * 20); tg.target = true; targets.push(tg); keepOut.push([tg.x, tg.y, 200]);
      }
      if (L.kind === 'kirkwood') { ship.x = auX(2.5); ship.y = WH - 140; ship.a = -Math.PI / 2; }
      if (primary) { ship.x = 160; keepOut.push([primary.x, primary.y, MOON_A + 140]); }
      keepOut.push([ship.x, ship.y, 170]);
      if (L.kind === 'beacon') for (let f = 0.15; f < 1; f += 0.1) keepOut.push([U.lerp(ship.x, targets[0].x, f), U.lerp(ship.y, targets[0].y, f), 110]); // the first flight has a clear run
      for (let i = 0, tries = 0; i < L.rocks && tries < 5000; tries++) {
        const x = 40 + rnd() * (WW - 80), y = 40 + rnd() * (WH - 80), r = 10 + Math.pow(rnd(), 2) * 32;
        if (rnd() > density(x)) continue;
        if (keepOut.some(([kx, ky, kr]) => Math.hypot(x - kx, y - ky) < kr)) continue;
        if (!clearOf(x, y, r, 14)) continue;
        rocks.push(makeRock(x, y, r, (rnd() - 0.5) * 8, (rnd() - 0.5) * 8)); i++;
      }
      if (L.kind === 'kirkwood') { // three sample rocks in the crowded bands, far apart
        const pool = rocks.filter((o) => o.r > 16 && o.x > 300 && density(o.x) === 1);
        for (let k = 0; k < 200 && targets.length < L.samples; k++) {
          const o = pool[Math.floor(rnd() * pool.length)];
          if (o && !o.target && targets.every((t) => Math.hypot(t.x - o.x, t.y - o.y) > 600) && Math.hypot(o.x - ship.x, o.y - ship.y) > 500) { o.target = true; targets.push(o); }
        }
      }
      rocks.push(...targets.filter((t) => !t.beacon && !rocks.includes(t)));
      if (moon) { placeMoon(); moon.target = true; targets.push(moon); }
      const target = () => targets.find((t) => !t.got) || null;

      function finish(success, msgKey, vars) {
        if (st.done) return;
        st.done = true;
        const score = success ? Math.round(500 + Math.max(0, L.time - st.t) * 6 + ship.fuel + ship.hp * 150 + (st.impact ? -st.impact.dP * 5000 : 0)) : 0;
        api.finish({ success, score, message: CA.t(msgKey, vars), dP: st.impact ? st.impact.dP : 0, hint: success ? '' : CA.t('an.hint.' + msgKey.slice(3)) });
      }
      function collide(o, isMoon) {
        const dx = ship.x - o.x, dy = ship.y - o.y, d = Math.hypot(dx, dy), min = o.r + SHIP_R;
        if (d >= min || d === 0) return;
        const nx = dx / d, ny = dy / d, rvx = ship.vx - o.vx, rvy = ship.vy - o.vy, vn = rvx * nx + rvy * ny;
        if (L.kind === 'dart' && isMoon) { impact(rvx, rvy); return; }
        if (vn < 0) {
          if (-vn > L.safe && ship.inv <= 0) { ship.hp--; ship.inv = 0.8; st.flash = 0.4; api.sfx('fail'); }
          ship.vx -= 1.4 * vn * nx; ship.vy -= 1.4 * vn * ny;
        }
        ship.x = o.x + nx * min; ship.y = o.y + ny * min;
      }
      function impact(rvx, rvy) {
        const rel = { vx: rvx, vy: rvy }, mrel = { x: moon.x - primary.x, y: moon.y - primary.y, vx: moon.vx, vy: moon.vy };
        const r = M.dartImpact(mrel, MU, rel, MASS_RATIO);
        st.impact = { dP: r.dP, speed: Math.hypot(rvx, rvy), P0: r.before.period, P1: r.after.period };
        moon.free = true; moon.vx = r.vx; moon.vy = r.vy;
        st.endT = 3; ship.hp = 0; ship.dead = true; st.flash = 0.6; api.sfx('pulse');
      }
      function gravity(x, y) { // primary only (moonlet and rocks are too small to matter)
        if (!primary) return [0, 0];
        const dx = primary.x - x, dy = primary.y - y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
        return [(MU * dx) / (d2 * d), (MU * dy) / (d2 * d)];
      }

      return {
        _dbg: () => ({ ship, input, st, target, rocks, moon, primary, L }),
        pointer(type, x, y, btn) {
          ptr.sx = x; ptr.sy = y; // a screen position: the camera moves while the button is held
          if (type === 'down' && btn === 0) ptr.down = true; else if (type === 'up') ptr.down = false;
        },
        key(e, down) {
          const k = CA.U.keyOf(e);
          if (k === 'a' || k === 'ArrowLeft') keys.l = down;
          if (k === 'd' || k === 'ArrowRight') keys.r = down;
          if (k === 'w' || k === 'ArrowUp') keys.u = down;
          if (k === 's' || k === 'ArrowDown') keys.d = down;
          if (e.code === 'Space') keys.b = down;
        },
        update(dt) {
          if (st.done) return;
          st.t += dt; st.flash = Math.max(0, st.flash - dt); ship.inv = Math.max(0, ship.inv - dt);
          // input: keyboard, or hold the mouse to fly toward the pointer; tests drive `input` directly
          let turn = input.turn, thrust = input.thrust;
          if (keys.l || keys.r || keys.u || keys.d) { turn = (keys.r ? 1 : 0) - (keys.l ? 1 : 0); thrust = keys.u ? 1 : keys.d ? -1 : 0; }
          else if (ptr.down) {
            const want = Math.atan2(ptr.sy + st.cam.y - ship.y, ptr.sx + st.cam.x - ship.x), da = Math.atan2(Math.sin(want - ship.a), Math.cos(want - ship.a));
            const along = ship.vx * Math.cos(want) + ship.vy * Math.sin(want);
            turn = U.clamp(da * 3, -1, 1); thrust = Math.abs(da) < 0.5 && along < CRUISE ? 1 : 0;
          }
          if (keys.b) { // automatic brake: face against the motion relative to the target and burn
            const tg = target(), rx = ship.vx - (tg ? tg.vx : 0), ry = ship.vy - (tg ? tg.vy : 0), da = Math.atan2(Math.sin(Math.atan2(-ry, -rx) - ship.a), Math.cos(Math.atan2(-ry, -rx) - ship.a));
            const moving = Math.hypot(rx, ry) > 2;
            turn = moving ? U.clamp(da * 4, -1, 1) : 0; thrust = moving && Math.abs(da) < 0.35 ? 1 : 0;
          }
          if (!ship.dead) {
            ship.a += U.clamp(turn, -1, 1) * TURN * dt;
            const acc = thrust > 0 ? THRUST : thrust < 0 ? -RETRO : 0;
            ship.thrust = ship.fuel > 0 ? thrust : 0;
            if (acc && ship.fuel > 0) { const dv = Math.min(ship.fuel, Math.abs(acc) * dt); ship.fuel -= dv; ship.vx += Math.cos(ship.a) * Math.sign(acc) * dv; ship.vy += Math.sin(ship.a) * Math.sign(acc) * dv; }
            const [gx, gy] = gravity(ship.x, ship.y); ship.vx += gx * dt; ship.vy += gy * dt;
            ship.x += ship.vx * dt; ship.y += ship.vy * dt;
          }
          for (const o of rocks) { o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.spin * dt; }
          if (moon) {
            if (moon.free) { const [gx, gy] = gravity(moon.x, moon.y); moon.vx += gx * dt; moon.vy += gy * dt; moon.x += moon.vx * dt; moon.y += moon.vy * dt; }
            else { moon.ang += (TAU / MOON_P) * dt; placeMoon(); }
          }
          if (!ship.dead) {
            for (const o of rocks) collide(o, false);
            if (primary) collide(primary, false);
            if (moon && !st.done) collide(moon, true);
          }
          // camera follows the ship inside the world
          st.cam.x = U.clamp(ship.x - api.w() / 2, 0, Math.max(0, WW - api.w()));
          st.cam.y = U.clamp(ship.y - api.h() / 2, 0, Math.max(0, WH - api.h()));
          if (st.impact) {
            st.endT -= dt;
            if (st.endT <= 0) {
              const p = (st.impact.dP * 100).toFixed(1);
              if (st.impact.dP <= L.needDP) finish(true, 'an.dartWin', { p, s: Math.round(st.impact.speed) });
              else finish(false, st.impact.dP > 0 ? 'an.dartWrong' : 'an.dartWeak', { p, need: Math.round(-L.needDP * 100) });
            }
            return;
          }
          if (ship.hp <= 0) return finish(false, 'an.wrecked');
          if (ship.x < -100 || ship.y < -100 || ship.x > WW + 100 || ship.y > WH + 100) return finish(false, 'an.lost');
          if (st.t >= L.time) return finish(false, 'an.time');
          // no fuel left and still moving: the probe can never stop, so end now instead of drifting out the clock
          const left = target();
          st.empty = ship.fuel <= 0 && left && L.kind !== 'dart' && Math.hypot(ship.vx - left.vx, ship.vy - left.vy) >= 14 ? st.empty + dt : 0;
          if (st.empty > 3) return finish(false, 'an.noFuel');
          // rendezvous: stay close with a small relative speed
          const tg = target();
          if (tg && L.kind !== 'dart') {
            const d = Math.hypot(ship.x - tg.x, ship.y - tg.y) - (tg.beacon ? 0 : tg.r), rv = Math.hypot(ship.vx - tg.vx, ship.vy - tg.vy);
            const ok = tg.beacon ? d < tg.r && rv < 12 : d < 30 && rv < 14, need = tg.beacon ? 1.5 : 2;
            st.hold = ok ? st.hold + dt : Math.max(0, st.hold - dt * 2);
            if (st.hold >= need) {
              tg.got = true; st.sampled++; st.hold = 0; api.sfx('success');
              if (!target()) finish(true, tg.beacon ? 'an.winBeacon' : 'an.win', { n: st.sampled });
            }
          }
        },
        draw(g, W, H) {
          CA.MG.bg(g, W, H, [24, 20, 30]);
          g.save(); g.translate(-st.cam.x, -st.cam.y);
          g.strokeStyle = 'rgba(255,120,120,0.35)'; g.setLineDash([8, 8]); g.strokeRect(0, 0, WW, WH); g.setLineDash([]);
          if (L.kind === 'kirkwood') {
            g.font = '12px Inter, system-ui, sans-serif'; g.textAlign = 'center';
            for (const gp of GAPS) {
              const x = auX(gp.au); g.fillStyle = 'rgba(120,170,255,0.06)'; g.fillRect(x - gp.hw, 0, gp.hw * 2, WH);
              g.fillStyle = 'rgba(160,200,255,0.75)'; g.fillText(CA.t('an.gap', { r: gp.name }), x, st.cam.y + 70);
            }
            g.fillStyle = 'rgba(200,210,240,0.5)';
            for (let au = 2.2; au <= 3.25; au += 0.1) g.fillText(au.toFixed(1) + ' AU', auX(au), st.cam.y + H - 40);
          }
          if (primary) {
            g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(primary.x, primary.y, MOON_A, 0, TAU); g.stroke();
            CA.Bodies.draw(g, 'planetesimal', primary.x, primary.y, primary.r, { seed: 3, t: st.t, prog: 0.5, rot: st.t * 0.05 });
          }
          for (const o of rocks) drawRock(g, o);
          if (moon) {
            CA.Bodies.draw(g, 'planetesimal', moon.x, moon.y, moon.r, { seed: 7, t: st.t, prog: 0.5, rot: st.t * 0.3 });
            if (moon.free) drawOrbit(g, moon);
          }
          for (const t of targets) {
            if (t.got || st.impact) continue;
            const pulse = 0.5 + 0.5 * Math.sin(st.t * 4);
            g.strokeStyle = t.beacon ? `rgba(125,255,176,${0.5 + pulse * 0.4})` : `rgba(255,214,102,${0.5 + pulse * 0.4})`; g.lineWidth = 2;
            g.beginPath(); g.arc(t.x, t.y, t.beacon ? t.r : t.r + 30, 0, TAU); g.stroke();
            if (t === target() && st.hold > 0) { g.strokeStyle = '#7dffb0'; g.lineWidth = 4; g.beginPath(); g.arc(t.x, t.y, (t.beacon ? t.r : t.r + 30) + 6, -Math.PI / 2, -Math.PI / 2 + TAU * st.hold / (t.beacon ? 1.5 : 2)); g.stroke(); }
            if (t.beacon) { CA.MG.glow(g, t.x, t.y, 18, [125, 255, 176], 0.8); }
          }
          if (!ship.dead) drawShip(g);
          g.restore();
          // pointer to an off-screen target, and the relative-velocity readout
          const tg = target();
          if (tg && !st.impact) {
            const sx = tg.x - st.cam.x, sy = tg.y - st.cam.y;
            if (sx < 0 || sy < 0 || sx > W || sy > H) {
              const a = Math.atan2(sy - H / 2, sx - W / 2), ex = W / 2 + Math.cos(a) * (W / 2 - 30), ey = H / 2 + Math.sin(a) * (H / 2 - 30);
              g.fillStyle = '#ffd666'; g.beginPath(); g.moveTo(ex + Math.cos(a) * 12, ey + Math.sin(a) * 12); g.lineTo(ex + Math.cos(a + 2.5) * 10, ey + Math.sin(a + 2.5) * 10); g.lineTo(ex + Math.cos(a - 2.5) * 10, ey + Math.sin(a - 2.5) * 10); g.fill();
              g.font = '11px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(Math.round(Math.hypot(tg.x - ship.x, tg.y - ship.y)), ex - Math.cos(a) * 18, ey - Math.sin(a) * 18 + 4);
            }
          }
          if (st.flash > 0) { g.fillStyle = `rgba(255,120,100,${st.flash * 0.5})`; g.fillRect(0, 0, W, H); }
        },
        coach() {
          if (st.impact) return { t: CA.t('an.period', { a: (st.impact.P0 / MOON_P * 11.92).toFixed(2), b: (st.impact.P1 / MOON_P * 11.92).toFixed(2), p: (st.impact.dP * 100).toFixed(1) }), k: 'ok' };
          if (ship.fuel < L.fuel * 0.2) return { t: CA.t('an.coachFuel'), k: 'warn' };
          const tg = target(); if (!tg) return null;
          if (L.kind === 'dart') return CA.t('an.coachDart');
          const rv = Math.hypot(ship.vx - tg.vx, ship.vy - tg.vy), limit = tg.beacon ? 12 : 14;
          const d = Math.hypot(ship.x - tg.x, ship.y - tg.y) - (tg.beacon ? 0 : tg.r), near = tg.beacon ? tg.r : 30;
          if (d < near) return rv < limit ? { t: CA.t('an.coachHold'), k: 'ok' } : { t: CA.t('an.coachSlow', { n: limit }), k: 'warn' };
          if (rv > 30 && d < near + stopDist(rv)) return { t: CA.t('an.coachBrake'), k: 'warn' };
          return CA.t('an.coachGo');
        },
        hud() {
          const tg = target(), rv = tg ? Math.hypot(ship.vx - tg.vx, ship.vy - tg.vy) : 0;
          return `<span>${CA.t('an.speed', { v: Math.round(Math.hypot(ship.vx, ship.vy)) })}</span>
            ${tg ? `<span>${CA.t('an.rel', { v: Math.round(rv) })}</span>` : ''}
            <span>${CA.t('an.fuel', { f: Math.round(ship.fuel) })}</span><span>${CA.t('an.hull', { n: Math.max(0, ship.hp) })}</span>
            ${L.samples ? `<span>${CA.t('an.samples', { n: st.sampled, m: L.samples })}</span>` : ''}
            <span>${CA.t('mgf.time', { t: Math.max(0, L.time - st.t).toFixed(0) })}</span>`;
        },
      };

      // distance covered while turning around and braking from relative speed v
      function stopDist(v) { return (v * v) / (2 * THRUST) + v * (Math.PI / TURN); }
      function drawRock(g, o) {
        g.save(); g.translate(o.x, o.y); g.rotate(o.rot);
        g.fillStyle = o.target ? '#6b5a44' : '#4d4540'; g.strokeStyle = o.target ? '#ffd666' : '#867a70'; g.lineWidth = 1.2;
        g.beginPath(); o.shape.forEach((k, i) => { const a = (i / o.shape.length) * TAU; i ? g.lineTo(Math.cos(a) * o.r * k, Math.sin(a) * o.r * k) : g.moveTo(Math.cos(a) * o.r * k, Math.sin(a) * o.r * k); });
        g.closePath(); g.fill(); g.stroke(); g.restore();
      }
      function drawShip(g) {
        g.save(); g.translate(ship.x, ship.y);
        // velocity (green) and velocity relative to the target (gold)
        const tg = target();
        g.lineWidth = 1.5; g.strokeStyle = 'rgba(125,255,176,0.8)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(ship.vx * 0.8, ship.vy * 0.8); g.stroke();
        if (tg) { g.strokeStyle = 'rgba(255,214,102,0.8)'; g.beginPath(); g.moveTo(0, 0); g.lineTo((ship.vx - tg.vx) * 0.8, (ship.vy - tg.vy) * 0.8); g.stroke(); }
        if (level <= 2) { // where the probe would come to rest if it braked now
          const sp = Math.hypot(ship.vx, ship.vy), k = sp > 20 ? stopDist(sp) / sp : 0;
          if (k) { g.strokeStyle = 'rgba(255,255,255,0.45)'; g.setLineDash([3, 4]); g.beginPath(); g.arc(ship.vx * k, ship.vy * k, 9, 0, TAU); g.stroke(); g.setLineDash([]); }
        }
        g.rotate(ship.a);
        if (ship.thrust > 0) { g.fillStyle = 'rgba(255,170,90,0.9)'; g.beginPath(); g.moveTo(-8, -4); g.lineTo(-18 - Math.random() * 6, 0); g.lineTo(-8, 4); g.fill(); }
        if (ship.thrust < 0) { g.fillStyle = 'rgba(255,170,90,0.8)'; g.fillRect(8, -6, 6, 2); g.fillRect(8, 4, 6, 2); }
        g.globalAlpha = ship.inv > 0 && Math.floor(st.t * 12) % 2 ? 0.4 : 1;
        g.fillStyle = '#dfe8ff'; g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -7); g.lineTo(-4, 0); g.lineTo(-8, 7); g.closePath(); g.fill();
        g.restore();
      }
      function drawOrbit(g, o) { // the moonlet's new orbit after the impact
        let x = o.x - primary.x, y = o.y - primary.y, vx = o.vx, vy = o.vy;
        g.strokeStyle = 'rgba(255,214,102,0.7)'; g.setLineDash([4, 5]); g.beginPath(); g.moveTo(o.x, o.y);
        for (let i = 0; i < 600; i++) { const d2 = x * x + y * y, d = Math.sqrt(d2), dt = 0.06; vx -= (MU * x) / (d2 * d) * dt; vy -= (MU * y) / (d2 * d) * dt; x += vx * dt; y += vy * dt; g.lineTo(primary.x + x, primary.y + y); }
        g.stroke(); g.setLineDash([]);
      }
    },
    reward(s, level, r) {
      return {
        rewards: { heavy: 8 + 5 * level, matter: CA.MG.matterReward(s, 0.6 + 0.15 * level) },
        buff: { id: 'mg_an', key: 'heavy', mult: 1.3, t: 150, name: '+30% heavy elements' },
      };
    },
    onSuccess(G, level) {
      if (level === 5) return CA.MG.discover(G, 'dart');
      return null;
    },
  });
})(globalThis.CA = globalThis.CA || {});
