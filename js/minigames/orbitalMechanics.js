/* Minigame: ORBITAL MECHANICS — set a launch velocity (direction + magnitude) and trim with small burns
   to reach a stable orbit inside a target band. Core mechanic: vector aiming + trajectory reading. */
(function (CA) {
  'use strict';
  const U = CA.U, TAU = U.TAU, Models = CA.Models;
  const MU = 2.2e6;

  const LEVELS = [null,
    { band: [120, 270], preview: 1, moon: false, binary: false, attempts: 4, fuel: 60, need: 2, time: 120 },
    { band: [150, 225], preview: 1, moon: false, binary: false, attempts: 4, fuel: 50, need: 2, time: 120 },
    { band: [168, 205], preview: 0.4, moon: false, binary: false, attempts: 3, fuel: 45, need: 2, time: 120 },
    { band: [145, 215], preview: 0.4, moon: true, binary: false, attempts: 3, fuel: 50, need: 2, time: 130 },
    { band: [265, 340], preview: 0, moon: false, binary: true, attempts: 3, fuel: 50, need: 2, time: 140 },
  ];

  CA.MG.register({
    id: 'om', name: 'Orbital Mechanics', mechanic: 'Aim velocity vectors, trim burns', unlock: 'planetesimal', levels: 5,
    science: 'An orbit is a balance between falling and moving sideways. Too slow and the path dips into the body; at √2 × circular speed you reach escape velocity and never return. Real orbits are perturbed by other masses — a moon or a second star can pump up eccentricity until an orbit becomes unstable.',
    intro: (l) => ({
      objective: CA.t('om.obj', { a: LEVELS[l].band[0], b: LEVELS[l].band[1], n: LEVELS[l].need }),
      controls: [
        CA.t('om.c1'),
        CA.t('om.c2'),
        CA.t(LEVELS[l].preview >= 1 ? 'om.preview1' : LEVELS[l].preview > 0 ? 'om.previewPart' : 'om.preview0'),
        CA.t('om.c4'),
      ].concat(LEVELS[l].moon ? [CA.t('om.moon')] : [], LEVELS[l].binary ? [CA.t('om.binary')] : []),
    }),
    create(api, level) {
      const L = LEVELS[level];
      const w = api.w(), h = api.h();
      const scale = Math.min(1, Math.min(w, h) / 720);
      const cx = w / 2, cy = h / 2;
      const bodyR = 38 * scale;
      const band = [L.band[0] * scale, L.band[1] * scale];
      const mu = MU * scale * scale * scale; // keep periods similar when the canvas is smaller
      const launch = { x: 0, y: -(band[0] + band[1]) / 2 };
      const masses = () => {
        if (L.binary) {
          const a = st.t * Math.sqrt(mu / Math.pow(55 * scale, 3)) * 0.5, sep = 55 * scale;
          return [{ x: Math.cos(a) * sep, y: Math.sin(a) * sep, mu: mu / 2, r: bodyR * 0.55 }, { x: -Math.cos(a) * sep, y: -Math.sin(a) * sep, mu: mu / 2, r: bodyR * 0.55 }];
        }
        const list = [{ x: 0, y: 0, mu, r: bodyR }];
        if (L.moon) { const mr = 360 * scale, a = st.t * Math.sqrt(mu / (mr * mr * mr)); list.push({ x: Math.cos(a) * mr, y: Math.sin(a) * mr, mu: mu * 0.02, r: 9 * scale }); }
        return list;
      };
      const st = { phase: 'aim', t: 0, attempts: L.attempts, fuel: L.fuel, drag: null, sat: null, trail: [], orbits: 0, angAcc: 0, lastAng: 0, msg: CA.t('om.drag'), best: 1, keys: {} };

      function accel(x, y, list) {
        let ax = 0, ay = 0;
        for (const m of list) { const dx = m.x - x, dy = m.y - y, d2 = dx * dx + dy * dy + 25, d = Math.sqrt(d2); ax += (m.mu * dx) / (d2 * d); ay += (m.mu * dy) / (d2 * d); }
        return [ax, ay];
      }
      function predict(x, y, vx, vy, steps) {
        const pts = []; let t0 = st.t;
        for (let i = 0; i < steps; i++) {
          const saveT = st.t; st.t = t0 + i * 0.05; const list = masses(); st.t = saveT;
          for (let k = 0; k < 2; k++) { const [ax, ay] = accel(x, y, list); vx += ax * 0.025; vy += ay * 0.025; x += vx * 0.025; y += vy * 0.025; }
          pts.push([x, y]);
          if (list.some((m) => Math.hypot(x - m.x, y - m.y) < m.r) || Math.hypot(x, y) > 2000) break;
        }
        return pts;
      }
      function elements() { const s = st.sat; return s ? Models.orbitElements(s.x, s.y, s.vx, s.vy, mu) : null; }
      function inBand(el) { return el && el.bound && el.rp >= band[0] && el.ra <= band[1]; }
      // what an orbit will do: 'in' the band, 'out' of it, an 'impact', or an 'escape'
      function verdict(el) { return !el.bound ? 'escape' : el.rp < bodyR ? 'impact' : inBand(el) ? 'in' : 'out'; }
      function lose(msg, hintKey) {
        st.attempts--; st.sat = null; st.trail = []; st.orbits = 0; st.angAcc = 0; st.phase = 'aim'; st.msg = msg; api.sfx('fail');
        if (st.attempts <= 0) api.finish({ success: false, score: 0, message: msg + CA.t('om.noAttempts'), hint: CA.t(hintKey) });
      }

      return {
        pointer(type, x, y) {
          const lx = cx + launch.x, ly = cy + launch.y;
          if (type === 'down' && st.phase === 'aim') st.drag = { x, y }; // the arrow always starts at the marker, wherever the drag began
          else if (type === 'move' && st.drag) st.drag = { x, y };
          else if (type === 'up' && st.drag) {
            const vx = (st.drag.x - lx) * 1.15, vy = (st.drag.y - ly) * 1.15;
            st.drag = null;
            if (Math.hypot(vx, vy) < 10) return;
            st.sat = { x: launch.x, y: launch.y, vx, vy }; st.phase = 'fly'; st.trail = []; st.orbits = 0; st.angAcc = 0; st.lastAng = Math.atan2(launch.y, launch.x);
            st.msg = ''; api.sfx('pulse');
          }
        },
        key(e, down) { st.keys[e.key] = down; },
        update(dt) {
          st.t += dt;
          if (st.t > L.time) return api.finish({ success: false, score: 0, message: CA.t('om.outOfTime'), hint: CA.t('om.hintOut') });
          const s = st.sat; if (!s || st.phase !== 'fly') return;
          // trim burns
          const sp = Math.hypot(s.vx, s.vy) || 1, r = Math.hypot(s.x, s.y) || 1;
          const burn = 40 * dt;
          if (st.fuel > 0) {
            let bx = 0, by = 0;
            if (st.keys.ArrowRight) { bx += s.vx / sp; by += s.vy / sp; }
            if (st.keys.ArrowLeft) { bx -= s.vx / sp; by -= s.vy / sp; }
            if (st.keys.ArrowUp) { bx += s.x / r; by += s.y / r; }
            if (st.keys.ArrowDown) { bx -= s.x / r; by -= s.y / r; }
            if (bx || by) { const n = Math.hypot(bx, by); s.vx += (bx / n) * burn; s.vy += (by / n) * burn; st.fuel = Math.max(0, st.fuel - 12 * dt); }
          }
          const list = masses();
          const [ax, ay] = accel(s.x, s.y, list);
          s.vx += ax * dt; s.vy += ay * dt; s.x += s.vx * dt; s.y += s.vy * dt;
          st.trail.push([s.x, s.y]); if (st.trail.length > 400) st.trail.shift();
          if (list.some((m) => Math.hypot(s.x - m.x, s.y - m.y) < m.r)) return lose(CA.t('om.impact'), 'om.hintImpact');
          const el = elements();
          if (Math.hypot(s.x, s.y) > Math.max(w, h)) return lose(CA.t(el && !el.bound ? 'om.escape' : 'om.lostRange'), 'om.hintEscape');
          if (st.fuel <= 0 && el && el.bound && !inBand(el)) return lose(CA.t('om.noFuel'), 'om.hintOut');
          const ang = Math.atan2(s.y, s.x);
          let da = ang - st.lastAng; if (da > Math.PI) da -= TAU; if (da < -Math.PI) da += TAU; st.lastAng = ang;
          if (inBand(el) && Math.hypot(s.x, s.y) >= band[0] && Math.hypot(s.x, s.y) <= band[1]) {
            st.angAcc += Math.abs(da);
            st.best = Math.min(st.best, el.e);
            if (st.angAcc >= TAU * (st.orbits + 1)) { st.orbits++; api.sfx('success'); }
            if (st.orbits >= L.need) {
              const score = 1000 * (1 - el.e) + st.fuel * 6 + st.attempts * 200 + Math.max(0, L.time - st.t) * 3;
              api.finish({ success: true, score, message: CA.t('om.win', { e: el.e.toFixed(3), p: Math.round(el.rp / scale), a: Math.round(el.ra / scale) }), e: el.e, a: el.a / scale });
            }
          } else { st.angAcc = st.orbits * TAU; }
        },
        draw(g, W, H) {
          CA.MG.bg(g, W, H, [10, 20, 40]);
          g.save(); g.translate(cx, cy);
          // band
          g.fillStyle = 'rgba(90,220,140,0.07)';
          g.beginPath(); g.arc(0, 0, band[1], 0, TAU); g.arc(0, 0, band[0], 0, TAU, true); g.fill();
          g.strokeStyle = 'rgba(90,220,140,0.45)'; g.setLineDash([4, 6]);
          g.beginPath(); g.arc(0, 0, band[0], 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, band[1], 0, TAU); g.stroke(); g.setLineDash([]);
          for (const m of masses()) {
            if (L.binary || m.mu === mu) CA.Bodies.draw(g, L.binary ? 'star' : 'planet', m.x, m.y, m.r, { t: st.t, T: 5200, ptype: 'terrestrial', seed: 3 });
            else { g.fillStyle = '#c9c9d4'; g.beginPath(); g.arc(m.x, m.y, m.r, 0, TAU); g.fill(); }
          }
          // trail
          g.strokeStyle = 'rgba(160,200,255,0.5)'; g.lineWidth = 1.2; g.beginPath();
          st.trail.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
          // launch marker / aiming
          if (st.phase === 'aim') {
            g.strokeStyle = 'rgba(255,230,160,0.8)'; g.beginPath(); g.arc(launch.x, launch.y, 10, 0, TAU); g.stroke();
            if (st.drag) {
              const vx = (st.drag.x - cx - launch.x) * 1.15, vy = (st.drag.y - cy - launch.y) * 1.15;
              const el = Models.orbitElements(launch.x, launch.y, vx, vy, mu), col = { in: '125,255,176', out: '255,214,102', impact: '255,120,110', escape: '255,120,110' }[verdict(el)];
              g.strokeStyle = `rgb(${col})`; g.lineWidth = 2; g.beginPath(); g.moveTo(launch.x, launch.y); g.lineTo(launch.x + vx * 0.87, launch.y + vy * 0.87); g.stroke();
              if (L.preview > 0) {
                const pts = predict(launch.x, launch.y, vx, vy, Math.round(320 * L.preview));
                g.fillStyle = `rgba(${col},0.7)`; pts.forEach(([x, y], i) => { if (i % 3 === 0) g.fillRect(x - 1, y - 1, 2, 2); });
              }
              g.fillStyle = '#e6eeff'; g.font = '12px Inter, system-ui, sans-serif'; g.textAlign = 'left';
              g.fillText(CA.t('om.speedV', { v: Math.hypot(vx, vy).toFixed(0), c: Math.sqrt(mu / Math.hypot(launch.x, launch.y)).toFixed(0), e: Math.sqrt(2 * mu / Math.hypot(launch.x, launch.y)).toFixed(0) }), launch.x + 16, launch.y - 14);
              g.fillText(el.bound ? CA.t('om.elV', { e: el.e.toFixed(2), p: (el.rp / scale).toFixed(0), a: (el.ra / scale).toFixed(0) }) : CA.t('om.escapeTraj'), launch.x + 16, launch.y + 2);
            } else if (level <= 2) { // a dashed arrow at circular speed shows the first player which way "sideways" is
              const v = Math.sqrt(mu / Math.hypot(launch.x, launch.y)) * 0.87;
              g.strokeStyle = 'rgba(255,230,160,0.55)'; g.lineWidth = 2; g.setLineDash([5, 6]); g.beginPath(); g.moveTo(launch.x + 12, launch.y); g.lineTo(launch.x + v, launch.y); g.stroke(); g.setLineDash([]);
              g.beginPath(); g.moveTo(launch.x + v - 8, launch.y - 6); g.lineTo(launch.x + v, launch.y); g.lineTo(launch.x + v - 8, launch.y + 6); g.stroke();
            }
          }
          if (st.phase === 'fly' && st.angAcc > st.orbits * TAU) { // progress of the current lap, just outside the band
            g.strokeStyle = '#7dffb0'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, band[1] + 8, -Math.PI / 2, -Math.PI / 2 + (st.angAcc - st.orbits * TAU)); g.stroke();
          }
          if (st.sat) { CA.MG.glow(g, st.sat.x, st.sat.y, 10, [200, 230, 255], 0.9); g.fillStyle = '#fff'; g.beginPath(); g.arc(st.sat.x, st.sat.y, 3, 0, TAU); g.fill(); }
          g.restore();
        },
        coach() {
          if (st.phase === 'aim') {
            if (st.drag) {
              const v = verdict(Models.orbitElements(launch.x, launch.y, (st.drag.x - cx - launch.x) * 1.15, (st.drag.y - cy - launch.y) * 1.15, mu));
              return { t: CA.t('om.v.' + v), k: v === 'in' ? 'ok' : 'warn' };
            }
            return st.attempts < L.attempts ? { t: st.msg, k: 'warn' } : CA.t('om.drag');
          }
          const v = verdict(elements());
          return { t: CA.t('om.f.' + v), k: v === 'in' ? 'ok' : 'warn' };
        },
        hud() {
          const el = elements();
          let status = CA.t('om.aiming');
          if (el) status = !el.bound ? '<b class="bad">' + CA.t('om.stEscape') + '</b>' : el.rp < bodyR ? '<b class="bad">' + CA.t('om.stImpact') + '</b>' : inBand(el) ? '<b class="ok">' + CA.t('om.stIn') + '</b>' : '<b class="warnc">' + CA.t('om.stOut') + '</b>';
          return `<span>${status}</span>
            ${el && el.bound ? `<span>e <b>${el.e.toFixed(3)}</b></span><span>${CA.t('om.periApo', { p: (el.rp / scale).toFixed(0), a: (el.ra / scale).toFixed(0) })}</span>` : ''}
            <span>${CA.t('om.orbits', { n: st.orbits, m: L.need })}</span><span>${CA.t('om.fuel', { f: Math.round(st.fuel) })}</span><span>${CA.t('om.attempts', { n: st.attempts })}</span>
            <span>${CA.t('mgf.time', { t: Math.max(0, L.time - st.t).toFixed(0) })}</span>`;
        },
      };
    },
    reward(s, level, r) {
      return {
        rewards: { matter: CA.MG.matterReward(s, 0.8 + level * 0.2), research: 6 + 3 * level + (1 - r.e) * 6 },
        buff: { id: 'mg_om', key: 'research', mult: 1.25, t: 120, name: '+25% research' },
      };
    },
    onSuccess(G, level, r, firstClear) {
      const s = G.state;
      if (s.system.length >= Math.min(6, s.mg.om.cleared)) return null; // one body per cleared level, rebuilt each cycle
      const type = level >= 4 ? 'moon' : 'minor';
      s.system.push({ type, name: (type === 'moon' ? 'Moon ' : 'Body ') + (s.system.length + 1), a: U.clamp((r.a || 180) / 120, 0.5, 6), e: U.clamp(r.e || 0, 0, 0.9) });
      return CA.t(type === 'moon' ? 'om.newMoon' : 'om.newMinor');
    },
  });
})(globalThis.CA = globalThis.CA || {});
