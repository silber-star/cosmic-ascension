/* Minigame: GRAVITY ARCHITECT — plan and time gravity wells to deliver scattered matter into a target body.
   Core mechanic: placement + switching of static attractors under an energy budget. */
(function (CA) {
  'use strict';
  const U = CA.U, TAU = U.TAU;

  const LEVELS = [null,
    { n: 34, wells: 4, energy: 120, time: 40, goal: 0.6, hazards: 0, moving: false, targetR: 30 },
    { n: 40, wells: 4, energy: 100, time: 40, goal: 0.62, hazards: 1, moving: false, targetR: 28 },
    { n: 46, wells: 3, energy: 90, time: 42, goal: 0.64, hazards: 1, moving: true, targetR: 26 },
    { n: 52, wells: 3, energy: 85, time: 44, goal: 0.66, hazards: 2, moving: true, targetR: 24 },
    { n: 58, wells: 3, energy: 75, time: 45, goal: 0.68, hazards: 2, moving: true, targetR: 22 },
  ];
  const SUGGEST = [[340, 300], [480, 300], [610, 300]]; // level 1 shows where a working relay goes
  const WELL_RANGE = 230, WELL_S = 9000, WELL_DRAG = 1.3, DRAIN = 5, FRAG_V = 165, TGT_RANGE = 175;

  CA.MG.register({
    id: 'ga', name: 'Gravity Architect', mechanic: 'Plan & switch gravity wells', unlock: 'aggregate', levels: 5,
    science: 'Material falling toward a body has to shed energy to be captured — otherwise it swings past or, if it arrives too fast, shatters on impact. Planet builders face the same problem: gentle, well-aimed collisions grow bodies; violent ones grind them down.',
    intro: (l) => ({
      objective: CA.t('ga.obj', { p: Math.round(LEVELS[l].goal * 100), t: LEVELS[l].time }),
      controls: [
        CA.t('ga.c1', { n: LEVELS[l].wells }),
        CA.t('ga.c2'),
        CA.t('ga.c3', { d: DRAIN }),
        CA.t('ga.c4', { v: FRAG_V }),
      ].concat(LEVELS[l].hazards ? [CA.t('ga.hazard')] : [], LEVELS[l].moving ? [CA.t('ga.moving')] : []),
    }),
    create(api, level) {
      const L = LEVELS[level], rnd = api.rng;
      const w = api.w(), h = api.h();
      const target = { x: w * 0.78, y: h * 0.5, r: L.targetR, ang: 0, cx: w * 0.7, cy: h * 0.5, orbitR: Math.min(w, h) * 0.18 };
      const parts = [];
      let total = 0;
      for (let i = 0; i < L.n; i++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * Math.min(w, h) * 0.22;
        const s = 0.6 + rnd() * 1.2;
        parts.push({ x: w * 0.25 + Math.cos(a) * d, y: h * 0.5 + Math.sin(a) * d * 1.3, vx: (rnd() - 0.5) * 30, vy: (rnd() - 0.5) * 30 + (rnd() - 0.5) * 20, s, alive: true });
        total += s;
      }
      const hazards = [];
      for (let i = 0; i < L.hazards; i++) hazards.push({ x: w * (0.48 + 0.04 * i), y: h * (i ? 0.78 : 0.24), r: Math.min(w, h) * 0.13, push: 2600 });
      const wells = [];
      const st = { phase: 'plan', t: 0, energy: L.energy, delivered: 0, lost: 0, msg: '', hover: null, dry: 0, pulse: 0, fx: [] };

      function wellAt(x, y) { return wells.find((q) => Math.hypot(q.x - x, q.y - y) < 26); }

      function release() {
        if (st.phase !== 'plan') return;
        if (!wells.length) { st.msg = CA.t('ga.needWell'); api.sfx('deny'); return; }
        st.phase = 'run'; st.msg = ''; relayOrder()[0].on = true; api.sfx('pulse'); // the relay starts at the well farthest from the target
      }
      const toTarget = (q) => Math.hypot(q.x - target.x, q.y - target.y);
      const relayOrder = () => wells.slice().sort((a, b) => toTarget(b) - toTarget(a));
      // switching a well off hands the relay to the next well toward the target
      function toggle(q) {
        q.on = !q.on;
        if (!q.on) { const next = relayOrder().find((o) => toTarget(o) < toTarget(q)); if (next) next.on = true; }
      }
      // once the loose matter has settled, the well farthest from the target is the one to pass on
      function readyWell() {
        const on = relayOrder().filter((q) => q.on);
        const al = parts.filter((p) => p.alive), near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 100, mass = (l) => l.reduce((a, p) => a + p.s, 0);
        if (!on.length || !al.some((p) => near(p, on[0]))) return null;
        return mass(al.filter((p) => !on.some((q) => near(p, q)))) < mass(al) * 0.25 ? on[0] : null;
      }

      function end(success, message, hint) {
        st.phase = 'done';
        const frac = st.delivered / total;
        const score = frac * 1000 + st.energy * 3 + Math.max(0, L.time - st.t) * 10;
        api.finish({ success, score, message, frac, hint });
      }

      return {
        _dbg: () => ({ parts, st, target, wells }),
        pointer(type, x, y, button) {
          if (type === 'move') st.hover = { x, y };
          if (type !== 'down') return;
          const hit = wellAt(x, y);
          if (st.phase === 'plan') {
            if (button === 2 || (hit && CA.MG.touch)) { if (hit) wells.splice(wells.indexOf(hit), 1); return; } // no right button on a touch screen
            if (hit) return;
            if (Math.hypot(x - target.x, y - target.y) < target.r + 20) { st.msg = CA.t('ga.tooClose'); return; }
            if (wells.length >= L.wells) { st.msg = CA.t('ga.limit'); api.sfx('deny'); return; }
            wells.push({ x, y, on: false }); api.sfx('click'); st.msg = '';
          } else if (st.phase === 'run' && hit) { toggle(hit); api.sfx('click'); }
        },
        key(e, down) { if (down && e.code === 'Space') { if (st.phase === 'plan') release(); } },
        release,
        update(dt) {
          if (st.phase !== 'run') return;
          st.t += dt;
          st.pulse = Math.max(0, st.pulse - dt * 3);
          for (const f of st.fx) f.t -= dt;
          while (st.fx.length && st.fx[0].t <= 0) st.fx.shift();
          if (L.moving) { target.ang += dt * 0.35; target.x = target.cx + Math.cos(target.ang) * target.orbitR; target.y = target.cy + Math.sin(target.ang) * target.orbitR; }
          const active = wells.filter((q) => q.on);
          st.energy = Math.max(0, st.energy - active.length * DRAIN * dt);
          if (st.energy <= 0) wells.forEach((q) => (q.on = false));
          for (const p of parts) {
            if (!p.alive) continue;
            let ax = 0, ay = 0;
            for (const q of wells) {
              if (!q.on) continue;
              const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
              if (d < WELL_RANGE) {
                const f = 1 - Math.pow(d / WELL_RANGE, 3), a = (WELL_S / (d + 30)) * f;
                ax += (dx / d) * a; ay += (dy / d) * a;
                if (d < 80) { const k = 1 - WELL_DRAG * (1 - d / 80) * dt * 2; p.vx *= k; p.vy *= k; } // wells hold matter: it settles instead of orbiting
              }
            }
            { // target's own gravity
              const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy) || 1;
              if (d < TGT_RANGE) { const a = 2400 / (d + 20); ax += (dx / d) * a; ay += (dy / d) * a; }
            }
            for (const z of hazards) {
              const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) || 1;
              if (d < z.r) { const a = z.push / (d + 40); ax += (dx / d) * a; ay += (dy / d) * a; }
            }
            p.vx = (p.vx + ax * dt) * (1 - 0.15 * dt); p.vy = (p.vy + ay * dt) * (1 - 0.15 * dt);
            p.x += p.vx * dt; p.y += p.vy * dt;
            const td = Math.hypot(p.x - target.x, p.y - target.y);
            if (td < target.r) {
              const tv = L.moving ? Math.hypot(p.vx + Math.sin(target.ang) * target.orbitR * 0.35, p.vy - Math.cos(target.ang) * target.orbitR * 0.35) : Math.hypot(p.vx, p.vy);
              p.alive = false;
              if (tv > FRAG_V) { st.delivered += p.s * 0.6; st.lost += p.s * 0.4; api.sfx('frag'); st.fx.push({ t: 1, x: target.x, y: target.y - target.r - 14 }); }
              else { st.delivered += p.s; api.sfx('collect'); st.pulse = 1; }
            } else if (p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60) { p.alive = false; st.lost += p.s; }
          }
          // mote–mote merging (gentle contacts)
          for (let i = 0; i < parts.length; i++) {
            const a = parts[i]; if (!a.alive) continue;
            for (let j = i + 1; j < parts.length; j++) {
              const b = parts[j]; if (!b.alive) continue;
              const rr = 3 + Math.sqrt(a.s) * 2 + Math.sqrt(b.s) * 2;
              if (Math.abs(a.x - b.x) > rr || Math.abs(a.y - b.y) > rr) continue;
              if (Math.hypot(a.x - b.x, a.y - b.y) < rr && Math.hypot(a.vx - b.vx, a.vy - b.vy) < 60) {
                const s = a.s + b.s; a.vx = (a.vx * a.s + b.vx * b.s) / s; a.vy = (a.vy * a.s + b.vy * b.s) / s; a.s = s; b.alive = false;
              }
            }
          }
          const frac = st.delivered / total;
          if (frac >= L.goal) return end(true, CA.t('ga.win', { p: Math.round(frac * 100) }));
          const remaining = total - st.delivered - st.lost;
          if (st.delivered + remaining < total * L.goal) return end(false, CA.t('ga.lost'), CA.t('ga.hintLost'));
          // out of energy with nothing falling toward the target: no need to sit out the clock
          st.dry = st.energy <= 0 ? st.dry + dt : 0;
          if (st.dry > 4 && !parts.some((p) => p.alive && Math.hypot(p.x - target.x, p.y - target.y) < TGT_RANGE * 1.2)) return end(false, CA.t('ga.noEnergy'), CA.t('ga.hintEnergy'));
          if (st.t >= L.time) end(false, CA.t('ga.timeUp', { p: Math.round(frac * 100), g: Math.round(L.goal * 100) }), CA.t(st.energy <= 0 ? 'ga.hintEnergy' : 'ga.hintReach'));
        },
        draw(g, W, H) {
          CA.MG.bg(g, W, H, [14, 18, 40]);
          for (const z of hazards) { CA.MG.glow(g, z.x, z.y, z.r, [255, 140, 60], 0.25); g.strokeStyle = 'rgba(255,160,90,0.35)'; g.setLineDash([4, 6]); g.beginPath(); g.arc(z.x, z.y, z.r, 0, TAU); g.stroke(); g.setLineDash([]); }
          if (L.moving) { g.strokeStyle = 'rgba(160,190,255,0.12)'; g.beginPath(); g.arc(target.cx, target.cy, target.orbitR, 0, TAU); g.stroke(); }
          g.strokeStyle = 'rgba(255,230,190,0.22)'; g.setLineDash([6, 8]); g.beginPath(); g.arc(target.x, target.y, TGT_RANGE, 0, TAU); g.stroke(); g.setLineDash([]);
          g.fillStyle = 'rgba(255,230,190,0.6)'; g.font = '11px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(CA.t('ga.reach'), target.x, target.y + Math.min(TGT_RANGE + 16, H / 2 - 8));
          CA.MG.glow(g, target.x, target.y, target.r * (2.2 + st.pulse * 1.4), [255, 220, 170], 0.25 + st.pulse * 0.35);
          g.fillStyle = '#a8907a'; g.beginPath(); g.arc(target.x, target.y, target.r * (0.6 + 0.4 * st.delivered / total), 0, TAU); g.fill();
          g.strokeStyle = 'rgba(255,230,190,0.6)'; g.setLineDash([3, 5]); g.beginPath(); g.arc(target.x, target.y, target.r, 0, TAU); g.stroke(); g.setLineDash([]);
          const ready = st.phase === 'run' ? readyWell() : null;
          if (st.phase === 'plan') {
            if (level === 1 && wells.length < SUGGEST.length) for (const [x, y] of SUGGEST.filter(([x, y]) => !wellAt(x, y))) {
              g.strokeStyle = 'rgba(255,214,102,0.8)'; g.setLineDash([3, 4]); g.lineWidth = 2; g.beginPath(); g.arc(x, y, 14, 0, TAU); g.stroke(); g.setLineDash([]); g.lineWidth = 1;
            }
            if (st.hover && wells.length < L.wells && !wellAt(st.hover.x, st.hover.y)) { g.strokeStyle = 'rgba(170,200,255,0.3)'; g.beginPath(); g.arc(st.hover.x, st.hover.y, WELL_RANGE, 0, TAU); g.stroke(); g.beginPath(); g.arc(st.hover.x, st.hover.y, 12, 0, TAU); g.stroke(); }
          }
          for (const q of wells) {
            if (q === ready) { g.strokeStyle = '#ffd666'; g.lineWidth = 3; g.beginPath(); g.arc(q.x, q.y, 20, 0, TAU); g.stroke(); }
            if (q.on) CA.MG.glow(g, q.x, q.y, WELL_RANGE, [130, 160, 255], 0.16);
            g.strokeStyle = q.on ? 'rgba(170,200,255,0.9)' : 'rgba(170,200,255,0.35)'; g.lineWidth = 2;
            g.beginPath(); g.arc(q.x, q.y, 12, 0, TAU); g.stroke();
            g.strokeStyle = 'rgba(170,200,255,0.12)'; g.lineWidth = 1; g.beginPath(); g.arc(q.x, q.y, WELL_RANGE, 0, TAU); g.stroke();
            g.fillStyle = q.on ? '#cfe0ff' : '#5a6a90'; g.beginPath(); g.arc(q.x, q.y, 4, 0, TAU); g.fill();
            if (st.phase === 'run') { g.font = '600 11px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(CA.t(q.on ? 'ga.on' : 'ga.off'), q.x, q.y + 30); }
          }
          g.globalCompositeOperation = 'lighter';
          for (const p of parts) if (p.alive) CA.MG.glow(g, p.x, p.y, 4 + Math.sqrt(p.s) * 4, [230, 210, 190], 0.9);
          g.globalCompositeOperation = 'source-over';
          g.font = '600 13px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffb0a0';
          for (const f of st.fx) { g.globalAlpha = f.t; g.fillText(CA.t('ga.shatter'), f.x, f.y - (1 - f.t) * 20); }
          g.globalAlpha = 1;
        },
        coach() {
          if (st.phase === 'plan') {
            if (st.msg) return { t: st.msg, k: 'warn' };
            return CA.t(level === 1 && wells.length < SUGGEST.length ? 'ga.coachPlace' : 'ga.plan');
          }
          if (st.energy <= 0) return { t: CA.t('ga.coachEmpty'), k: 'warn' };
          if (readyWell()) return { t: CA.t('ga.coachOff'), k: 'ok' };
          if (wells.some((q) => q.on)) return CA.t('ga.coachWait');
          return CA.t(parts.some((p) => p.alive && Math.hypot(p.x - target.x, p.y - target.y) < TGT_RANGE) ? 'ga.coachFall' : 'ga.coachNone');
        },
        hud() {
          const frac = st.delivered / total;
          return `<span>${CA.t('ga.delivered', { p: Math.round(frac * 100), g: Math.round(L.goal * 100) })}</span>
            <span>${CA.t('ga.energy', { e: Math.round(st.energy) })}</span>
            <span>${CA.t('ga.wells', { n: wells.length, m: L.wells })}</span>
            <span>${CA.t('mgf.time', { t: Math.max(0, L.time - st.t).toFixed(0) })}</span>
            ${st.phase === 'plan' ? '<button class="btn small primary" onclick="CA.MG.active.inst.release()">' + CA.t('ga.release') + '</button>' : ''}`;
        },
      };
    },
    reward(s, level, r) {
      return {
        rewards: { matter: CA.MG.matterReward(s, 0.6 + r.frac + level * 0.15), research: 4 + 2 * level },
        buff: { id: 'mg_ga', key: 'matter', mult: 1.25, t: 120, name: '+25% matter' },
      };
    },
    onSuccess(G, level) {
      const s = G.state;
      if (s.stage === 'pebble' && s.mass >= CA.STAGE.pebble.massEnd * 0.9999 && !s.swarmDone) {
        s.swarmDone = true;
        return CA.t('ga.swarm');
      }
      return null;
    },
  });
})(globalThis.CA = globalThis.CA || {});
