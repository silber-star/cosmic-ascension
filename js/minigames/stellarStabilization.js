/* Minigame: STELLAR STABILIZATION — balance gravity and pressure in a toy stellar core (model in models.js).
   Core mechanic: continuous control of a lagging, nonlinear feedback system with telegraphed disturbances. */
(function (CA) {
  'use strict';
  const U = CA.U, TAU = U.TAU, M = CA.Models;

  CA.MG.register({
    id: 'ss', name: 'Stellar Stabilization', mechanic: 'Steer a lagging feedback loop', unlock: 'protostar', levels: 5,
    science: 'A star is a thermostat. Fusion heats the core, heat raises pressure, extra pressure makes the core expand, and expansion cools it again. Squeezing the core (more gravity) heats it. Fusion\'s steep temperature dependence — roughly T⁴ for the proton–proton chain and far steeper for the CNO cycle in heavier stars — makes the loop twitchy.',
    intro: (l) => {
      const L = M.SS_LEVELS[l];
      return {
        objective: CA.t('ss.obj', { g: L.goal, b: Math.round(L.band * 100), t: L.time }),
        controls: [
          CA.t('ss.c1'), CA.t('ss.c2'), CA.t('ss.c3'), CA.t('ss.c4'),
        ].concat(l >= 3 ? [CA.t('ss.nu', { nu: L.nu })] : []),
      };
    },
    create(api, level) {
      const m = M.newStar(level);
      const hist = [];
      let keyL = false, keyR = false, dragging = false, histT = 0;
      const slider = () => { const w = api.w(), h = api.h(); return { x: w * 0.2, y: h - 54, w: w * 0.6, h: 14 }; };
      const setFromX = (x) => { const s = slider(); m.comp = U.clamp((x - s.x) / s.w, 0, 1); };

      return {
        pointer(type, x, y) {
          const s = slider();
          if (type === 'down' && y > s.y - 24 && y < s.y + s.h + 24 && x > s.x - 20 && x < s.x + s.w + 20) { dragging = true; setFromX(x); }
          else if (type === 'move' && dragging) setFromX(x);
          else if (type === 'up') dragging = false;
        },
        key(e, down) {
          const k = CA.U.keyOf(e);
          if (k === 'a' || k === 'ArrowLeft') keyL = down;
          if (k === 'd' || k === 'ArrowRight') keyR = down;
          if (down && (e.code === 'Space' || k === 'v')) { if (M.vent(m)) api.sfx('pulse'); }
        },
        update(dt) {
          if (keyL) m.comp = U.clamp(m.comp - dt * 0.9, 0, 1);
          if (keyR) m.comp = U.clamp(m.comp + dt * 0.9, 0, 1);
          M.stepStar(m, dt);
          histT += dt;
          if (histT > 0.1) { histT = 0; hist.push([m.x, m.T]); if (hist.length > 200) hist.shift(); }
          if (m.won) api.finish({ success: true, score: M.starScore(m), message: CA.t('ss.win', { f: Math.round(m.F * 100), b: Math.round((m.inBand / m.t) * 100) }) });
          else if (m.failed) api.finish({ success: false, score: M.starScore(m) * 0.2, message: CA.t('ss.' + m.failed), hint: CA.t('ss.hint.' + m.failed) });
        },
        draw(g, W, H) {
          CA.MG.bg(g, W, H, [30, 14, 20]);
          const cx = W * 0.5, cy = H * 0.42, R = Math.min(W, H) * 0.14 * U.clamp(Math.pow(m.x, 1.5), 0.6, 1.6);
          const T = 4500 + (m.T - 1) * 9000 + 1500;
          CA.Bodies.draw(g, 'star', cx, cy, R, { t: m.t, T: U.clamp(T, 2500, 20000) });
          // gravity (inward) vs pressure (outward) arrows
          const Pg = m.x, Gl = 46, Pl = 46 * Pg;
          g.lineWidth = 2;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + 0.2, b = a + TAU / 16; // gravity and pressure arrows alternate around the star
            const gx = cx + Math.cos(a) * (R + 12), gy = cy + Math.sin(a) * (R + 12);
            g.strokeStyle = 'rgba(140,170,255,0.9)';
            arrow(g, gx + Math.cos(a) * Gl, gy + Math.sin(a) * Gl, gx, gy);
            const px = cx + Math.cos(b) * (R + 8), py = cy + Math.sin(b) * (R + 8);
            g.strokeStyle = 'rgba(255,170,110,0.9)';
            arrow(g, px, py, px + Math.cos(b) * Pl, py + Math.sin(b) * Pl);
          }
          g.fillStyle = '#9fb6ff'; g.font = '11px Inter, system-ui, sans-serif'; g.textAlign = 'left';
          g.fillText(CA.t('ss.arrows'), cx - R - 40, cy + R + 70);
          // P/G meter
          const mx = 40, my = H * 0.12, mh = H * 0.56, mw = 18;
          g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(mx, my, mw, mh);
          const yOf = (v) => my + mh * (1 - U.clamp((v - 0.5) / 1.1, 0, 1));
          g.fillStyle = 'rgba(90,220,140,0.25)'; g.fillRect(mx, yOf(1 + m.band), mw, yOf(1 - m.band) - yOf(1 + m.band));
          g.fillStyle = Math.abs(m.x - 1) < m.band ? '#7dffb0' : '#ff8a7a'; g.fillRect(mx - 6, yOf(m.x) - 2, mw + 12, 4);
          g.fillStyle = '#cfd8f0'; g.font = '11px Inter, system-ui, sans-serif'; g.textAlign = 'left';
          g.fillText(CA.t('con.pressWins'), mx + mw + 8, my + 10); g.fillText('P/G', mx + mw + 8, yOf(1) + 4); g.fillText(CA.t('con.gravWins'), mx + mw + 8, my + mh);
          // history plot
          const px = W - 260, py = H * 0.12, pw = 220, ph = 110;
          g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(px, py, pw, ph);
          g.strokeStyle = 'rgba(90,220,140,0.25)'; g.strokeRect(px, py + ph / 2 - ph * m.band, pw, ph * m.band * 2);
          for (const [idx, col] of [[0, '#7dffb0'], [1, '#ffb070']]) {
            g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath();
            hist.forEach((v, i) => { const X = px + (i / 200) * pw, Y = py + ph / 2 - (v[idx] - 1) * ph * 1.5; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
            g.stroke();
          }
          g.fillStyle = '#9aa4b8'; g.fillText(CA.t('ss.hist'), px, py + ph + 14);
          // slider
          const s = slider();
          g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(s.x, s.y, s.w, s.h);
          g.fillStyle = 'rgba(140,170,255,0.5)'; g.fillRect(s.x, s.y, s.w * m.comp, s.h);
          g.fillStyle = '#e6eeff'; g.beginPath(); g.arc(s.x + s.w * m.comp, s.y + s.h / 2, 10, 0, TAU); g.fill();
          g.font = '12px Inter, system-ui, sans-serif'; g.textAlign = 'center';
          g.fillText(CA.t('ss.comp', { p: Math.round(m.comp * 100) }), s.x + s.w / 2, s.y - 10);
          g.textAlign = 'left'; g.fillText(CA.t('ss.relax'), s.x, s.y + s.h + 16); g.textAlign = 'right'; g.fillText(CA.t('ss.squeeze'), s.x + s.w, s.y + s.h + 16);
          g.textAlign = 'left';
        },
        coach() {
          if (m.outTimer > 0.15) return { t: CA.t('ss.danger', { t: Math.max(0, 2 - m.outTimer).toFixed(1), what: CA.t(m.x < 1 ? 'ss.lower' : 'ss.raise') }), k: 'warn' };
          if (m.plumeAt >= 0) return { t: CA.t('ss.plume', { t: (m.plumeAt - m.t).toFixed(1), what: CA.t(m.plumeMag > 0 ? 'ss.heat' : 'ss.cool') }), k: 'warn' };
          if (m.x > 1 + m.band) return { t: CA.t('ss.coachHigh'), k: 'warn' };
          if (m.x < 1 - m.band) return { t: CA.t('ss.coachLow'), k: 'warn' };
          const need = (m.goal - m.output) / Math.max(1, m.timeLimit - m.t); // energy per second still required
          return m.eps < need ? { t: CA.t('ss.coachSlow', { r: m.eps.toFixed(2), n: need.toFixed(2) }), k: 'warn' } : { t: CA.t('ss.coachOk'), k: 'ok' };
        },
        hud() {
          return `<span>${CA.t('ss.energy', { o: m.output.toFixed(0), g: m.goal })}</span>
            <span>${CA.t('ss.rate', { r: m.eps.toFixed(2) })}</span>
            <span>${CA.t('ss.coreT', { t: m.T.toFixed(3) })} ${m.dT > 0.01 ? '▲' : m.dT < -0.01 ? '▼' : '•'}</span>
            <span>${CA.t('ss.fuelPct', { f: Math.round(m.F * 100) })}</span>
            <span>${CA.t('ss.vent', { v: m.ventCd > 0 ? m.ventCd.toFixed(1) + 's' : '<b>' + CA.t('ss.ready') + '</b>' })}</span>
            <span>${CA.t('mgf.time', { t: Math.max(0, m.timeLimit - m.t).toFixed(0) })}</span>`;
        },
      };
    },
    reward(s, level, r) {
      return {
        rewards: { energy: 60 + 30 * level, research: 6 + 3 * level, matter: CA.MG.matterReward(s, 0.4 + level * 0.1) },
        buff: { id: 'mg_ss', key: 'energy', mult: 1.3, t: 150, name: '+30% energy' },
      };
    },
    onSuccess(G) {
      const s = G.state;
      if (s.stage === 'protostar' && s.star.Tc < CA.BAL.star.igniteTc) { s.star.Tc = CA.BAL.star.igniteTc; return CA.t('ss.ignite'); }
      if (s.stage === 'mainseq') { s.star.pg = 1; return CA.t('ss.settle'); }
      return null;
    },
  });

  function arrow(g, x0, y0, x1, y1) {
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - Math.cos(a - 0.4) * 7, y1 - Math.sin(a - 0.4) * 7);
    g.moveTo(x1, y1); g.lineTo(x1 - Math.cos(a + 0.4) * 7, y1 - Math.sin(a + 0.4) * 7); g.stroke();
  }
})(globalThis.CA = globalThis.CA || {});
