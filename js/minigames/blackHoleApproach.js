/* Minigame: BLACK HOLE APPROACH — pilot a probe near a black hole (model in models.js: pseudo-Newtonian potential).
   Core mechanic: orbital piloting where gravity is steeper than Newton's. Below the ISCO (3 r_s) no orbit is stable,
   clocks run slow, and around a small black hole tides pull the probe apart. Level 5 aims light instead of the probe. */
(function (CA) {
  'use strict';
  const U = CA.U, TAU = U.TAU, M = CA.Models;

  const RS = M.BH.rs, GM = M.BH.GM, CX = 480, CY = 300, ACC = 55, OUT = 13.5;
  // radii in r_s. band: hold inside [a, b]; lag: collect a clock difference; escape: then climb out past that radius.
  const LEVELS = [null,
    { goal: 'band', band: [4, 6], hold: 6, start: 10, fuel: 220, time: 90, acc: 30 }, // gentle engine: a tap is a small change
    { goal: 'band', band: [2.3, 2.9], hold: 4, start: 8, fuel: 320, time: 100, escape: 10 },
    { goal: 'lag', lag: 4, start: 9, fuel: 320, time: 80, escape: 10 }, // waiting at 9 r_s would take ~70 s
    { goal: 'lag', lag: 5, start: 9, fuel: 340, time: 90, escape: 10, tide: 3.3 },
    { goal: 'photon', start: 9, shots: 6, time: 120 },
  ];
  M.BH_LEVELS = LEVELS;

  CA.MG.register({
    id: 'bh', name: 'Black Hole Approach', mechanic: 'Dive, orbit and climb out', unlock: 'blackhole', levels: 5,
    science: 'Near a black hole gravity grows faster than Newton\'s law. Inside about 3 Schwarzschild radii (the ISCO, innermost stable circular orbit) no orbit is stable: the smallest nudge sends you in or out, which is where accretion disks end. Clocks there tick slower (gravitational time dilation), and close to a small black hole the difference in pull across your body stretches you apart. At 1.5 r_s even light can circle the hole: the photon sphere, whose lensed image is the bright ring in the Event Horizon Telescope pictures.',
    intro: (l) => {
      const L = LEVELS[l];
      if (L.goal === 'photon') return { objective: CA.t('bh.obj5'), controls: [CA.t('bh.c5a'), CA.t('bh.c5b'), CA.t('bh.c5c', { n: L.shots })] };
      return {
        objective: CA.t('bh.obj' + l, { a: L.band ? L.band[0] : 0, b: L.band ? L.band[1] : 0, h: L.hold || 0, l: L.lag || 0, e: L.escape || 0, t: L.tide || 0 }),
        controls: [CA.t('bh.c1'), CA.t('bh.c2'), CA.t(L.tide ? 'bh.c3t' : 'bh.c3', { f: L.fuel })],
      };
    },
    create(api, level) {
      const L = LEVELS[level];
      return L.goal === 'photon' ? light(api, level, L) : flight(api, level, L);
    },
    reward(s, level) {
      return {
        rewards: { energy: 80 + 40 * level, research: 10 + 5 * level },
        buff: { id: 'mg_bh', key: 'energy', mult: 1.3, t: 150, name: '+30% energy' },
      };
    },
    onSuccess(G, level) {
      if (level === 5) return CA.MG.discover(G, 'photon_sphere');
      return null;
    },
  });

  /* ---------- levels 1–4: fly the probe ---------- */
  function flight(api, level, L) {
    const r0 = L.start * RS;
    const ship = { x: 0, y: -r0, vx: M.bhVcirc(r0, GM, RS), vy: 0, fuel: L.fuel, thrust: null };
    const input = { pro: 0, rad: 0, dir: null }, keys = {}, ptr = { down: false, x: 0, y: 0 };
    const st = { t: 0, hold: 0, lag: 0, tide: 0, phase: 'goal', done: false, trail: [], trailT: 0 };
    const rOf = () => Math.hypot(ship.x, ship.y);

    function finish(success, key, vars) {
      if (st.done) return;
      st.done = true;
      const score = success ? Math.round(500 + ship.fuel * 2 + Math.max(0, L.time - st.t) * 5 + st.lag * 100) : 0;
      api.finish({ success, score, message: CA.t(key, vars), hint: success ? '' : CA.t('bh.hint.' + key.slice(3)) });
    }
    function goalReached() {
      api.sfx('success');
      if (L.escape) { st.phase = 'escape'; return; }
      finish(true, 'bh.win' + level, { a: L.band[0], b: L.band[1] });
    }

    return {
      _dbg: () => ({ ship, input, st, L, rOf }),
      pointer(type, x, y, btn) {
        ptr.x = x; ptr.y = y;
        if (type === 'down' && btn === 0) ptr.down = true; else if (type === 'up') ptr.down = false;
      },
      key(e, down) {
        const k = CA.U.keyOf(e);
        if (k === 'w' || k === 'ArrowUp') keys.u = down;
        if (k === 's' || k === 'ArrowDown') keys.d = down;
        if (k === 'a' || k === 'ArrowLeft') keys.l = down;
        if (k === 'd' || k === 'ArrowRight') keys.r = down;
      },
      update(dt) {
        if (st.done) return;
        st.t += dt;
        // thrust direction: keys = prograde/retrograde + radial in/out; held mouse = toward the pointer; tests set `input`
        const r = rOf(), rx = ship.x / r, ry = ship.y / r, v = Math.hypot(ship.vx, ship.vy) || 1, px = ship.vx / v, py = ship.vy / v;
        let pro = input.pro, rad = input.rad, dir = input.dir;
        if (keys.u || keys.d || keys.l || keys.r) { pro = (keys.u ? 1 : 0) - (keys.d ? 1 : 0); rad = (keys.r ? 1 : 0) - (keys.l ? 1 : 0); dir = null; }
        else if (ptr.down) { const dx = ptr.x - CX - ship.x, dy = ptr.y - CY - ship.y, d = Math.hypot(dx, dy); dir = d > 4 ? [dx / d, dy / d] : null; pro = rad = 0; }
        let ax = 0, ay = 0;
        if (dir) { ax = dir[0]; ay = dir[1]; }
        else if (pro || rad) { ax = pro * px + rad * rx; ay = pro * py + rad * ry; const n = Math.hypot(ax, ay) || 1; ax /= n; ay /= n; }
        ship.thrust = null;
        if ((ax || ay) && ship.fuel > 0) { const dv = Math.min(ship.fuel, (L.acc || ACC) * dt); ship.fuel -= dv; ship.vx += ax * dv; ship.vy += ay * dv; ship.thrust = [ax, ay]; }
        const [gx, gy] = M.bhAccel(ship.x, ship.y, GM, RS);
        ship.vx += gx * dt; ship.vy += gy * dt; ship.x += ship.vx * dt; ship.y += ship.vy * dt;
        st.trailT += dt;
        if (st.trailT > 0.05) { st.trailT = 0; st.trail.push([ship.x, ship.y]); if (st.trail.length > 140) st.trail.shift(); }

        const r2 = rOf(), rr = r2 / RS;
        st.lag += dt * (1 - M.bhDilation(r2, RS));
        st.tide = M.bhTide(r2, RS, L.tide);
        if (rr <= 1.03) return finish(false, 'bh.fell');
        if (st.tide > 1) return finish(false, 'bh.torn');
        if (rr > OUT) return finish(false, 'bh.lost');
        if (st.t >= L.time) return finish(false, 'bh.time');
        if (st.phase === 'goal') {
          if (L.goal === 'band') {
            st.hold = rr >= L.band[0] && rr <= L.band[1] ? st.hold + dt : Math.max(0, st.hold - dt * 2);
            if (st.hold >= L.hold) goalReached();
          } else if (st.lag >= L.lag) goalReached();
        } else if (rr >= L.escape) finish(true, 'bh.win' + level, { l: st.lag.toFixed(1), e: L.escape });
      },
      draw(g, W, H) {
        CA.MG.bg(g, W, H, [16, 10, 26]);
        g.save(); g.translate(CX, CY);
        if (L.tide) { // inside the tidal limit the probe is pulled apart
          const rg = g.createRadialGradient(0, 0, RS, 0, 0, L.tide * RS);
          rg.addColorStop(0, 'rgba(255,60,60,0.28)'); rg.addColorStop(1, 'rgba(255,60,60,0.04)');
          g.fillStyle = rg; g.beginPath(); g.arc(0, 0, L.tide * RS, 0, TAU); g.fill();
        }
        if (L.band) {
          g.fillStyle = 'rgba(125,255,176,0.08)'; g.beginPath(); g.arc(0, 0, L.band[1] * RS, 0, TAU); g.arc(0, 0, L.band[0] * RS, 0, TAU, true); g.fill();
          ring(g, L.band[0] * RS, 'rgba(125,255,176,0.5)', [], ''); ring(g, L.band[1] * RS, 'rgba(125,255,176,0.5)', [], CA.t('bh.lBand'));
        }
        drawHole(g, st.t);
        ring(g, 3 * RS, 'rgba(255,170,90,0.6)', [6, 6], CA.t('bh.lIsco'));
        if (L.tide) ring(g, L.tide * RS, 'rgba(255,110,110,0.75)', [3, 4], CA.t('bh.lTide'), 0.5);
        if (L.escape) ring(g, L.escape * RS, st.phase === 'escape' ? 'rgba(140,200,255,0.8)' : 'rgba(140,200,255,0.25)', [10, 8], CA.t('bh.lEscape', { r: L.escape }), 2.2);
        // where the probe goes if it does nothing (a few seconds ahead)
        const pr = predict(ship);
        g.setLineDash([3, 5]); g.lineWidth = 1.2; g.strokeStyle = pr.fall ? 'rgba(255,110,110,0.75)' : 'rgba(220,230,255,0.45)';
        g.beginPath(); g.moveTo(ship.x, ship.y); pr.pts.forEach(([x, y]) => g.lineTo(x, y)); g.stroke(); g.setLineDash([]);
        // trail
        g.strokeStyle = 'rgba(160,220,255,0.35)'; g.lineWidth = 1.5; g.beginPath();
        st.trail.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.lineTo(ship.x, ship.y); g.stroke();
        drawProbe(g, ship.x, ship.y, Math.atan2(ship.vy, ship.vx), ship.thrust, st.tide);
        g.restore();
        if (L.goal === 'lag') drawClocks(g, st.t, st.t - st.lag);
      },
      hud() {
        const r = rOf(), rr = r / RS, parts = [CA.t('bh.r', { r: rr.toFixed(2) })];
        if (L.goal === 'lag') parts.push(CA.t('bh.clock', { k: M.bhDilation(r, RS).toFixed(3) }));
        if (st.phase === 'escape') parts.push(CA.t('bh.escapeNow', { r: L.escape }));
        else if (L.goal === 'band') parts.push(CA.t('bh.hold', { h: st.hold.toFixed(1), n: L.hold }));
        else parts.push(CA.t('bh.lag', { l: st.lag.toFixed(2), n: L.lag }));
        if (L.tide) parts.push(CA.t('bh.tide', { p: Math.round(st.tide * 100) }));
        parts.push(CA.t('bh.fuel', { f: Math.round(ship.fuel) }), CA.t('mgf.time', { t: Math.max(0, L.time - st.t).toFixed(0) }));
        return parts.map((p) => `<span>${p}</span>`).join('');
      },
      coach() {
        const pr = predict(ship), r = rOf() / RS, rs = pr.pts.map(([x, y]) => Math.hypot(x, y) / RS).concat(r), lo = Math.min(...rs), hi = Math.max(...rs);
        if (st.phase === 'escape') return { t: CA.t('bh.coachOut', { r: L.escape }), k: 'ok' };
        if (pr.fall) return { t: CA.t('bh.coachFall'), k: 'warn' };
        if (L.tide && st.tide > 0.7) return { t: CA.t('bh.coachTide'), k: 'warn' };
        if (L.goal !== 'band') return CA.t('bh.coachLag');
        const [a, b] = L.band, inside = r >= a && r <= b;
        if (inside && lo >= a && hi <= b) return { t: CA.t('bh.coachHold'), k: 'ok' };
        if (lo > b) return CA.t('bh.coachLower');
        if (r > b) return CA.t('bh.coachWait');
        if (lo < a) return CA.t('bh.coachRaise');
        return CA.t('bh.coachRound');
      },
    };
  }

  // coast without thrust for up to 6 s (stops at the horizon or the edge of the zone)
  function predict(ship) {
    let x = ship.x, y = ship.y, vx = ship.vx, vy = ship.vy;
    const pts = [], dt = 1 / 60;
    for (let i = 0; i < 360; i++) {
      const [gx, gy] = M.bhAccel(x, y, GM, RS);
      vx += gx * dt; vy += gy * dt; x += vx * dt; y += vy * dt;
      const r = Math.hypot(x, y);
      if (r < RS * 1.03) { pts.push([x, y]); return { pts, fall: true }; }
      if (r > OUT * RS) break;
      if (i % 3 === 0) pts.push([x, y]);
    }
    return { pts, fall: false };
  }

  /* ---------- level 5: bend light around the photon sphere ---------- */
  function light(api, level, L) {
    const R = L.start * RS, D2R = Math.PI / 180;
    const st = { t: 0, psi: 24 * D2R, shots: L.shots, shot: null, old: [], done: false, msg: '', msgOk: false, endT: 0, win: null };
    const bOf = () => (R * Math.sin(Math.abs(st.psi))) / RS;
    let dragging = false;

    function finish(success, key, vars) {
      if (st.done) return;
      st.done = true;
      const loops = success ? Math.floor((st.win.swept - TAU) / TAU) : 0;
      const score = success ? Math.round(800 + st.shots * 150 + Math.max(0, L.time - st.t) * 3 + loops * 200) : 0;
      api.finish({ success, score, message: CA.t(key, vars), hint: success ? '' : CA.t('bh.hint.' + key.slice(3)) });
    }
    function fire() {
      if (st.done || st.win || (st.shot && !st.shot.over) || st.shots <= 0) return;
      const res = M.bhPhoton(bOf() * RS, R, RS, { every: 3, rOut: OUT * RS }), sg = st.psi >= 0 ? 1 : -1;
      // φ runs from the launcher (left of the hole); aiming up turns the ray clockwise on screen
      const pts = res.pts.map(([r, ph]) => { const th = Math.PI + sg * ph; return [Math.cos(th) * r, Math.sin(th) * r]; });
      const len = [0];
      for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      if (st.shot) { st.old.push(st.shot); if (st.old.length > 3) st.old.shift(); }
      st.shot = { pts, len, shown: 0, res, b: bOf(), over: false };
      st.shots--; st.msg = '';
      api.sfx('pulsar');
    }
    function judge(sh) {
      const deg = Math.round((sh.res.swept * 180) / Math.PI);
      if (sh.res.captured) { st.msg = CA.t('bh.shotIn', { b: sh.b.toFixed(3) }); st.msgOk = false; api.sfx('fail'); }
      else if (sh.res.swept >= TAU) { st.msg = CA.t('bh.shotLoop', { d: deg }); st.msgOk = true; st.win = sh.res; st.endT = 1.4; api.sfx('success'); }
      else { st.msg = CA.t('bh.shotOut', { d: deg }); st.msgOk = false; }
      if (!st.win && st.shots <= 0) st.endT = 1.4;
    }
    function aimAt(x, y) { st.psi = U.clamp(-Math.atan2(y - CY, x - (CX - R)), -1.2, 1.2); }

    return {
      _dbg: () => ({ st, fire, bOf, R, aim: (rad) => (st.psi = rad) }),
      pointer(type, x, y, btn) {
        if (type === 'down' && btn === 0) { dragging = true; aimAt(x, y); }
        else if (type === 'move' && dragging) aimAt(x, y);
        else if (type === 'up') dragging = false;
      },
      key(e, down) {
        if (!down) return;
        const k = CA.U.keyOf(e), big = e.shiftKey ? 5 : 1;
        if (k === 'a' || k === 'ArrowLeft') st.psi += 0.25 * D2R * big;
        if (k === 'd' || k === 'ArrowRight') st.psi -= 0.25 * D2R * big;
        if (k === 'w' || k === 'ArrowUp') st.psi += 0.02 * D2R;
        if (k === 's' || k === 'ArrowDown') st.psi -= 0.02 * D2R;
        st.psi = U.clamp(st.psi, -1.2, 1.2);
        if (!e.repeat && (e.code === 'Space' || e.key === 'Enter')) fire();
      },
      update(dt) {
        if (st.done) return;
        st.t += dt;
        const sh = st.shot;
        if (sh && !sh.over) {
          sh.shown += 650 * dt;
          if (sh.shown >= sh.len[sh.len.length - 1]) { sh.over = true; judge(sh); }
        }
        if (st.endT > 0) {
          st.endT -= dt;
          if (st.endT <= 0) return st.win ? finish(true, 'bh.win5', { d: Math.round((st.win.swept * 180) / Math.PI) }) : finish(false, 'bh.noShots');
        }
        if (st.t >= L.time && !st.win) finish(false, 'bh.time');
      },
      draw(g, W, H) {
        CA.MG.bg(g, W, H, [16, 10, 26]);
        g.save(); g.translate(CX, CY);
        ring(g, OUT * RS, 'rgba(140,200,255,0.18)', [2, 8], '');
        drawHole(g, st.t);
        ring(g, M.BH_BC * RS, 'rgba(255,214,102,0.55)', [5, 5], CA.t('bh.lShadow'), -0.9);
        ring(g, 1.5 * RS, 'rgba(255,235,200,0.0)', [], CA.t('bh.lPhoton'), 0.6);
        st.old.forEach((s) => path(g, s, s.pts.length - 1, 'rgba(190,225,255,0.16)', 1));
        const sh = st.shot;
        if (sh) {
          let n = 0; while (n < sh.len.length - 1 && sh.len[n + 1] <= sh.shown) n++;
          path(g, sh, n, 'rgba(210,235,255,0.9)', 2);
          if (!sh.over) { const [x, y] = sh.pts[n]; CA.MG.glow(g, x, y, 14, [220, 240, 255], 0.95); }
        }
        // launcher and its aim line (a straight line: what the ray would do without gravity)
        const lx = -R, ux = Math.cos(st.psi), uy = -Math.sin(st.psi);
        g.setLineDash([4, 6]); g.strokeStyle = 'rgba(255,214,102,0.5)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(lx, 0); g.lineTo(lx + ux * R * 1.15, uy * R * 1.15); g.stroke(); g.setLineDash([]);
        drawProbe(g, lx, 0, Math.atan2(uy, ux), null, 0);
        g.restore();
      },
      coach() { return st.msg ? { t: st.msg, k: st.msgOk ? 'ok' : 'warn' } : CA.t('bh.coachAim'); },
      hud() {
        return [CA.t('bh.b', { b: bOf().toFixed(3) }), CA.t('bh.aim', { a: ((st.psi * 180) / Math.PI).toFixed(2) }), CA.t('bh.shots', { n: st.shots }), CA.t('mgf.time', { t: Math.max(0, L.time - st.t).toFixed(0) })]
          .map((p) => `<span>${p}</span>`).join('');
      },
    };
  }

  /* ---------- drawing helpers (origin at the hole) ---------- */
  function drawHole(g, t) {
    CA.MG.glow(g, 0, 0, RS * 6, [255, 160, 100], 0.12);
    // gas spiralling in on near-circular orbits, faster closer in
    for (let i = 0; i < 46; i++) {
      const r = RS * (3.1 + ((i * 0.618) % 1) * 3.2), a = i * 2.39 + (M.bhVcirc(r, GM, RS) / r) * t;
      g.fillStyle = `rgba(255,${190 + (i % 3) * 20},140,${0.18 + 0.25 * (RS * 3 / r)})`;
      g.fillRect(Math.cos(a) * r - 1, Math.sin(a) * r - 1, 2, 2);
    }
    CA.MG.glow(g, 0, 0, RS * 1.9, [255, 230, 190], 0.35);
    g.strokeStyle = 'rgba(255,235,200,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 1.5 * RS, 0, TAU); g.stroke();
    g.fillStyle = '#000'; g.beginPath(); g.arc(0, 0, RS, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,190,140,0.4)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, RS, 0, TAU); g.stroke();
  }
  function ring(g, r, color, dash, label, at = -0.75) {
    g.setLineDash(dash); g.strokeStyle = color; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); g.setLineDash([]);
    if (label) {
      g.font = '11px Inter, system-ui, sans-serif'; g.textAlign = 'left'; g.fillStyle = 'rgba(225,230,245,0.8)';
      g.fillText(label, Math.cos(at) * r + 4, Math.sin(at) * r - 3);
    }
  }
  function drawProbe(g, x, y, ang, thrust, tide) {
    g.save(); g.translate(x, y);
    if (thrust) { // exhaust opposite to the thrust direction
      g.fillStyle = 'rgba(255,170,90,0.9)'; g.beginPath();
      const bx = -thrust[0], by = -thrust[1];
      g.moveTo(bx * 6 - by * 3, by * 6 + bx * 3); g.lineTo(bx * (14 + Math.random() * 5), by * (14 + Math.random() * 5)); g.lineTo(bx * 6 + by * 3, by * 6 - bx * 3); g.fill();
    }
    g.rotate(ang);
    const s = 1 + Math.min(1, tide) * 0.6; // stretched along the radius as the tides grow (drawn along the velocity: close enough)
    g.scale(s, 1 / Math.sqrt(s));
    g.fillStyle = tide > 0.7 ? '#ffb0a0' : '#dfe8ff';
    g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, -6); g.lineTo(-3, 0); g.lineTo(-7, 6); g.closePath(); g.fill();
    g.restore();
  }
  function drawClocks(g, far, ship) {
    const dial = (x, y, t, label, c) => {
      g.strokeStyle = 'rgba(220,230,255,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 22, 0, TAU); g.stroke();
      const a = (t / 10) * TAU - Math.PI / 2;
      g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); g.stroke();
      g.font = '11px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(225,230,245,0.85)';
      g.fillText(label, x, y + 38); g.fillText(t.toFixed(1) + ' s', x, y + 52);
    };
    dial(50, 50, far, CA.t('bh.lFar'), '#9ec5ff');
    dial(130, 50, ship, CA.t('bh.lShip'), '#ffd666');
  }
  function path(g, sh, n, color, w) {
    g.strokeStyle = color; g.lineWidth = w; g.beginPath();
    for (let i = 0; i <= n; i++) { const [x, y] = sh.pts[i]; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
})(globalThis.CA = globalThis.CA || {});
