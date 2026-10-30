/* Minigame: PULSAR TIMING — press as each pulse arrives (model in models.js). The timing residuals against a
   constant-period clock reveal spin-down, a glitch, an orbit, or planets. Core mechanic: rhythm with a drifting tempo. */
(function (CA) {
  'use strict';
  const U = CA.U, TAU = U.TAU, M = CA.Models;

  const PSR = { x: 200, y: 200 }, DISH = { x: 860, y: 200 }, TRAVEL = 1.2; // visual light-travel time (s)
  const SCOPE = { x: 40, y: 318, w: 880, h: 96, span: 3 }, RES = { x: 40, y: 452, w: 880, h: 116 };

  CA.MG.register({
    id: 'pt', name: 'Pulsar Timing', mechanic: 'Keep the beat of a drifting clock', unlock: 'neutronstar', levels: 5,
    science: 'A pulsar is one of nature\'s most precise clocks. Astronomers time each pulse, compare it with a model, and study the residuals: a slow drift shows spin-down, a sudden jump is a glitch, a regular swing is the extra light-travel time across an orbit. Timing a binary pulsar (Hulse–Taylor, 1974) gave the first evidence of gravitational waves, and timing PSR B1257+12 revealed the first known exoplanets in 1992.',
    intro: (l) => {
      const L = M.PT_LEVELS[l];
      return {
        objective: CA.t('pt.obj', { need: L.need, n: L.n, w: Math.round(L.win * 1000) }) + ' ' + CA.t('pt.b' + l),
        controls: [CA.t('pt.c1'), CA.t(L.show ? 'pt.c2show' : 'pt.c2hide'), CA.t('pt.c3', { f: L.falses }), CA.t('pt.c4')],
      };
    },
    create(api, level) {
      const m = M.ptNew(level, api.rng), L = m.L;
      const seed = api.rng() * 1000;
      const nz = (t) => { const x = Math.sin(Math.round(t * 400) * 12.9898 + seed) * 43758.5453; return x - Math.floor(x) - 0.5; };
      const fx = []; // floating feedback
      let nextSound = 0, done = false, seenMisses = 0;
      const delayAmp = (L.orbits || []).reduce((a, o) => a + o.A, 0);

      function press() {
        if (done) return;
        const r = M.ptPress(m, m.t);
        if (r.hit) {
          const ms = Math.round(Math.abs(r.dt) * 1000), good = Math.abs(r.dt) < L.win / 2;
          api.sfx('click'); fx.push({ t: 0.9, text: CA.t(good ? 'pt.good' : r.dt >= 0 ? 'pt.late' : 'pt.early', { n: ms }), c: good ? '#7dffb0' : '#ffd666' });
        }
        else fx.push({ t: 0.9, text: CA.t('pt.off'), c: '#ff8a8a' });
      }
      // beam angle from the emission times (shifted back by the visual travel time); one beam faces us at each emission
      function beamAngle(t) {
        const te = t + TRAVEL;
        let j = 0; while (j < m.emit.length - 1 && m.emit[j + 1] <= te) j++;
        const P = m.per[Math.min(j + 1, m.per.length - 1)];
        return Math.PI * (j + (te - m.emit[j]) / P);
      }
      function signal(t) {
        let s = 0;
        for (let i = Math.max(0, m.idx - 3); i < m.arr.length && m.arr[i] < t + 0.2; i++) { const x = (t - m.arr[i]) / 0.018; if (x * x < 20) s += (m.faint[i] ? 0.22 : 1) * Math.exp(-x * x); }
        return s + nz(t) * 0.32;
      }

      return {
        _dbg: () => ({ m, press }),
        pointer(type) { if (type === 'down') press(); },
        key(e, down) { if (down && !e.repeat && (e.code === 'Space' || e.key === 'Enter')) press(); },
        update(dt) {
          if (done) return;
          M.ptStep(m, dt);
          while (nextSound < m.arr.length && m.t >= m.arr[nextSound]) { api.sfx('pulsar'); nextSound++; }
          if (m.misses > seenMisses) { seenMisses = m.misses; fx.push({ t: 0.9, text: CA.t('pt.miss'), c: '#ff8a8a' }); }
          for (const f of fx) f.t -= dt;
          while (fx.length && fx[0].t <= 0) fx.shift();
          if (m.won) {
            done = true;
            const rms = Math.sqrt(m.res.reduce((a, r) => a + r.dt * r.dt, 0) / Math.max(1, m.res.length)) * 1000;
            let extra = '';
            if (level === 2) extra = CA.t('pt.res2', { a: L.P.toFixed(2), b: L.Pend.toFixed(2) });
            if (level === 3) extra = CA.t('pt.res3', { p: Math.round(-L.dP * 100) });
            if (level === 4) extra = CA.t('pt.res4', { a: Math.round(L.orbits[0].A * 1000), b: L.orbits[0].Pb });
            if (level === 5) extra = CA.t('pt.res5', { a: L.orbits[0].Pb, b: L.orbits[1].Pb });
            api.finish({ success: true, score: M.ptScore(m), message: CA.t('pt.win', { h: m.hits, n: L.n, r: rms.toFixed(0) }) + ' ' + extra });
          } else if (m.failed) { done = true; api.finish({ success: false, score: M.ptScore(m) * 0.2, message: CA.t(m.failed === 'spam' ? 'pt.failSpam' : 'pt.failMissed'), hint: CA.t(m.failed === 'spam' ? 'pt.hintSpam' : L.show ? 'pt.hintMissed' : 'pt.hintBeat') }); }
        },
        draw(g, W, H) {
          CA.MG.bg(g, W, H, [10, 18, 36]);
          const t = m.t, ang = beamAngle(t);
          // the pulsar moves along our line of sight in an orbit: farther away → pulses arrive later
          const off = delayAmp ? -(M.ptDelay(L, t + TRAVEL) / delayAmp) * 50 : 0, px = PSR.x + off;
          if (L.orbits && level === 4) { CA.MG.glow(g, PSR.x - off * 1.6, PSR.y, 22, [255, 200, 140], 0.6); g.fillStyle = '#ffd9a0'; g.beginPath(); g.arc(PSR.x - off * 1.6, PSR.y + 30, 7, 0, TAU); g.fill(); }
          if (level === 5) L.orbits.forEach((o, k) => { const a = (TAU * (t + TRAVEL)) / o.Pb + o.ph; g.fillStyle = '#9ec5ff'; g.beginPath(); g.arc(px + Math.cos(a) * (40 + 22 * k), PSR.y + Math.sin(a) * (40 + 22 * k) * 0.4, 3, 0, TAU); g.fill(); });
          CA.Bodies.draw(g, 'ns', px, PSR.y, 12, { beam: ang, beamLen: 240, t, seed: 1 });
          // dish
          g.strokeStyle = '#cfd8ee'; g.lineWidth = 3; g.beginPath(); g.arc(DISH.x + 18, DISH.y, 26, Math.PI * 0.62, Math.PI * 1.38); g.stroke();
          g.lineWidth = 2; g.beginPath(); g.moveTo(DISH.x + 10, DISH.y); g.lineTo(DISH.x + 34, DISH.y + 40); g.stroke();
          // pulses in flight (training levels only; real radio pulses are invisible until they arrive)
          if (L.show) for (let i = m.idx; i < m.arr.length && m.arr[i] - TRAVEL < t; i++) {
            const f = 1 - (m.arr[i] - t) / TRAVEL; if (f < 0 || f > 1) continue;
            const x = U.lerp(px + 20, DISH.x, f);
            CA.MG.glow(g, x, PSR.y, 14, [190, 225, 255], 0.9); g.fillStyle = '#fff'; g.fillRect(x - 1, PSR.y - 6, 2, 12);
          }
          if (L.show) { // the stretch of the beam where a press counts
            const hw = L.win * ((DISH.x - px - 20) / TRAVEL);
            g.fillStyle = 'rgba(125,255,176,0.1)'; g.fillRect(DISH.x - hw, PSR.y - 22, hw * 2, 44);
            g.strokeStyle = 'rgba(125,255,176,0.45)'; g.lineWidth = 1; g.strokeRect(DISH.x - hw, PSR.y - 22, hw * 2, 44);
          }
          // flash at the dish when a pulse arrives
          for (let i = Math.max(0, m.idx - 2); i < m.arr.length && m.arr[i] <= t; i++) { const a = 1 - (t - m.arr[i]) / 0.25; if (a > 0) CA.MG.glow(g, DISH.x, DISH.y, 40, [190, 225, 255], a * (m.faint[i] ? 0.25 : 0.9)); }
          g.font = '600 14px Inter, system-ui, sans-serif'; g.textAlign = 'center';
          fx.forEach((f, k) => { g.fillStyle = f.c; g.globalAlpha = Math.min(1, f.t * 2); g.fillText(f.text, DISH.x - 10, DISH.y - 44 - k * 16 - (0.9 - f.t) * 20); });
          g.globalAlpha = 1;
          // oscilloscope: the last 3 s of radio signal, newest at the right
          g.fillStyle = 'rgba(5,10,20,0.85)'; g.fillRect(SCOPE.x, SCOPE.y, SCOPE.w, SCOPE.h);
          g.strokeStyle = 'rgba(255,255,255,0.15)'; g.strokeRect(SCOPE.x, SCOPE.y, SCOPE.w, SCOPE.h);
          g.strokeStyle = '#8fe3ff'; g.lineWidth = 1.2; g.beginPath();
          for (let i = 0; i <= SCOPE.w; i += 2) {
            const tt = t - SCOPE.span + (i / SCOPE.w) * SCOPE.span, y = SCOPE.y + SCOPE.h * 0.78 - U.clamp(signal(tt), -0.3, 1.2) * SCOPE.h * 0.6;
            i ? g.lineTo(SCOPE.x + i, y) : g.moveTo(SCOPE.x + i, y);
          }
          g.stroke();
          g.fillStyle = 'rgba(200,210,240,0.7)'; g.font = '12px Inter, system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(CA.t('pt.scope'), SCOPE.x + 4, SCOPE.y - 5);
          g.textAlign = 'right'; g.fillText(CA.t('pt.now'), SCOPE.x + SCOPE.w, SCOPE.y - 5);
          // presses on the scope
          for (const r of m.res) { const x = SCOPE.x + SCOPE.w - ((t - r.t) / SCOPE.span) * SCOPE.w; if (x > SCOPE.x) { g.fillStyle = '#7dffb0'; g.fillRect(x - 1, SCOPE.y + 4, 2, 10); } }
          // residual plot: arrival minus a constant-period clock
          g.fillStyle = 'rgba(5,10,20,0.85)'; g.fillRect(RES.x, RES.y, RES.w, RES.h);
          g.strokeStyle = 'rgba(255,255,255,0.15)'; g.strokeRect(RES.x, RES.y, RES.w, RES.h);
          const span = Math.max(0.1, ...m.res.map((r) => Math.abs(r.model))) * 1.15, mid = RES.y + RES.h / 2;
          g.strokeStyle = 'rgba(255,255,255,0.2)'; g.beginPath(); g.moveTo(RES.x, mid); g.lineTo(RES.x + RES.w, mid); g.stroke();
          for (const r of m.res) {
            const x = RES.x + 10 + (r.i / (L.n - 1)) * (RES.w - 20), y = mid - (r.model / span) * (RES.h / 2 - 8);
            g.fillStyle = Math.abs(r.dt) < L.win / 2 ? '#7dffb0' : '#ffd666'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill();
          }
          g.fillStyle = 'rgba(200,210,240,0.7)'; g.textAlign = 'left'; g.fillText(CA.t('pt.resid', { s: Math.round(span * 1000) }), RES.x + 4, RES.y - 5);
        },
        coach() {
          if (L.n - L.need - m.misses <= 1) return { t: CA.t('pt.coachLast'), k: 'warn' };
          if (L.falses - m.falses <= 1) return { t: CA.t('pt.coachFalse'), k: 'warn' };
          return CA.t(L.show ? (m.hits ? 'pt.coachKeep' : 'pt.coachFirst') : 'pt.coachBeat');
        },
        hud() {
          return `<span>${CA.t('pt.pulse', { i: Math.min(m.idx + 1, L.n), n: L.n })}</span><span>${CA.t('pt.hits', { h: m.hits, need: L.need })}</span>
            <span>${CA.t('pt.missed', { n: m.misses, max: L.n - L.need })}</span><span>${CA.t('pt.falses', { n: m.falses, max: L.falses })}</span>`;
        },
      };
    },
    reward(s, level) {
      return {
        rewards: { research: 8 + 4 * level, energy: 50 + 25 * level },
        buff: { id: 'mg_pt', key: 'energy', mult: 1.25, t: 150, name: '+25% energy' },
      };
    },
    onSuccess(G, level) {
      if (level === 5) return CA.MG.discover(G, 'pulsar_planets');
      return null;
    },
  });
})(globalThis.CA = globalThis.CA || {});
