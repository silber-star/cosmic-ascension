/* Minigame: SPECTRAL ANALYSIS — identify elements from their spectral "barcodes", then measure a Doppler shift
   or a temperature (model in models.js). Core mechanic: pattern matching with overlay templates. */
(function (CA) {
  'use strict';
  const U = CA.U, M = CA.Models;

  const SYM = { H: 'H', He: 'He', Na: 'Na', Ca: 'Ca', Mg: 'Mg', Fe: 'Fe', OIII: '[O III]', NII: '[N II]', Ba: 'Ba', Tc: 'Tc' };
  const COL = { H: '#ff6b6b', He: '#ffd166', Na: '#ffa94d', Ca: '#b197fc', Mg: '#69db7c', Fe: '#74c0fc', OIII: '#38d9a9', NII: '#f783ac', Ba: '#e599f7', Tc: '#ffe066' };
  const V_MAX = 15000, T_MIN = 2500, T_MAX = 9000;
  const num = (x) => Math.round(x).toLocaleString('en-US'); // full digits: 9,610 km/s, not 9.61K
  // layout of the fixed 960×600 arena
  const X0 = 40, PW = 880, STRIP = [50, 92], PLOT = [104, 300], LOUPE = { x: 40, y: 340, w: 420, h: 106, half: 10 };
  const SL = { x: 500, w: 420 }, SLV = 372, SLT = 432, BTN_Y = 470, BTN_H = 40, SUB = { x: 780, y: 528, w: 140, h: 40 };

  // visible-light colour for a wavelength (nm); dim outside 380–700
  function lamRGB(l) {
    let r = 0, g = 0, b = 0;
    if (l < 440) { r = (440 - l) / 60; b = 1; } else if (l < 490) { g = (l - 440) / 50; b = 1; } else if (l < 510) { g = 1; b = (510 - l) / 20; }
    else if (l < 580) { r = (l - 510) / 70; g = 1; } else if (l < 645) { r = 1; g = (645 - l) / 65; } else r = 1;
    const f = l < 420 ? 0.3 + 0.7 * U.clamp((l - 380) / 40, 0, 1) : l > 700 ? 0.3 + 0.7 * U.clamp((780 - l) / 80, 0, 1) : 1;
    return [r * f * 255, g * f * 255, b * f * 255];
  }

  CA.MG.register({
    id: 'sa', name: 'Spectral Analysis', mechanic: 'Match line patterns, measure shifts', unlock: 'mainseq', levels: 5,
    science: 'Every element absorbs and emits light only at its own set of wavelengths — a barcode first mapped by Fraunhofer, Kirchhoff and Bunsen in the 1800s. Cooler gas in front of a hot source makes dark absorption lines; thin hot gas on its own glows in bright emission lines. Motion shifts every line by the same factor (the Doppler effect), and the colour of the continuum gives the temperature (Wien\'s law).',
    intro: (l) => {
      const L = M.SA_LEVELS[l];
      return {
        objective: CA.t(L.fitT ? 'sa.objT' : Array.isArray(L.v) ? 'sa.objV' : 'sa.obj', { t: L.time }) + ' ' + CA.t('sa.b' + l),
        controls: [CA.t('sa.c1', { n: L.cands.length }), CA.t('sa.c2')]
          .concat(Array.isArray(L.v) ? [CA.t('sa.c3v')] : [], L.fitT ? [CA.t('sa.c3t')] : [], [CA.t('sa.c4')]),
      };
    },
    create(api, level) {
      const task = M.saNew(level, api.rng);
      const [l0, l1] = task.range, lamX = (l) => X0 + ((l - l0) / (l1 - l0)) * PW, xLam = (x) => l0 + ((x - X0) / PW) * (l1 - l0);
      const yMax = task.kind === 'emis' ? 1.15 : 1.1;
      const plotY = (f) => PLOT[1] - (U.clamp(f, -0.05, yMax) / yMax) * (PLOT[1] - PLOT[0]);
      // noise is tied to the wavelength (0.05 nm bins) so the plot and the loupe agree
      const seed = api.rng() * 1000;
      const nz = (l) => { const x = Math.sin(Math.round(l * 20) * 12.9898 + seed) * 43758.5453; return (x - Math.floor(x) - 0.5) * 2 * task.noise; };
      const observed = (l) => M.saFlux(task, l) + nz(l) * (task.kind === 'emis' ? 1 : M.saContinuum(task.range, l, task.T || 5000));
      const trace = []; // precomputed: the spectrum never changes during a run
      for (let i = 0; i <= PW * 2; i++) { const l = l0 + (i / (PW * 2)) * (l1 - l0); trace.push(observed(l)); }

      const st = { t: 0, sel: [], v: 0, T: 5000, tries: task.tries, hover: (l0 + l1) / 2, hovering: false, drag: null, msg: '', marks: [], wrong: [], done: false, keys: {} };
      const buttons = () => {
        const n = task.cands.length, w = Math.min(118, PW / n - 8);
        return task.cands.map((el, i) => ({ el, x: X0 + i * (w + 8), y: BTN_Y, w, h: BTN_H }));
      };
      const toggle = (el) => { const i = st.sel.indexOf(el); if (i >= 0) st.sel.splice(i, 1); else st.sel.push(el); api.sfx('click'); };
      const setV = (v) => (st.v = U.clamp(Math.round(v / 50) * 50, 0, V_MAX));
      const setT = (T) => (st.T = U.clamp(Math.round(T / 10) * 10, T_MIN, T_MAX));
      const answer = () => task.want.map((e) => SYM[e]).join(', ');

      function submit() {
        if (st.done) return;
        const guess = { els: st.sel.slice(), v: st.v, T: st.T }, c = M.saCheck(task, guess);
        st.tries--;
        if (c.ok) {
          st.done = true;
          let msg = CA.t('sa.win', { els: answer() });
          if (task.fitV) msg += ' ' + CA.t('sa.winV', { v: num(st.v), t: num(task.v) });
          if (task.fitT) msg += ' ' + CA.t('sa.winT', { g: num(st.T), t: num(task.T) });
          api.finish({ success: true, score: M.saScore(task, guess, task.time - st.t, task.tries - st.tries), message: msg });
          return;
        }
        api.sfx('fail');
        const parts = [];
        if (c.unexplained.length) parts.push(CA.t('sa.miss', { n: c.unexplained.length }));
        if (c.extra.length) parts.push(CA.t('sa.extra', { n: c.extra.length }));
        if (!c.vOk) parts.push(CA.t('sa.vOff'));
        if (!c.tOk) parts.push(CA.t('sa.tOff'));
        st.marks = c.unexplained; st.wrong = c.extra;
        if (st.tries <= 0) { st.done = true; api.finish({ success: false, score: 0, message: CA.t('sa.failTries', { els: answer() }), hint: CA.t('sa.hint') }); return; }
        st.msg = parts.join(' ') + ' ' + CA.t('sa.triesLeft', { n: st.tries });
      }

      function sliderHit(x, y) {
        if (x < SL.x - 12 || x > SL.x + SL.w + 12) return null;
        if (task.fitV && Math.abs(y - SLV) < 16) return 'v';
        if (task.fitT && Math.abs(y - SLT) < 16) return 'T';
        return null;
      }
      function dragTo(x) {
        const f = U.clamp((x - SL.x) / SL.w, 0, 1);
        if (st.drag === 'v') setV(f * V_MAX); else if (st.drag === 'T') setT(T_MIN + f * (T_MAX - T_MIN));
      }

      return {
        _dbg: () => ({ task, st, submit, toggle }),
        pointer(type, x, y) {
          if (type === 'down') {
            const b = buttons().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
            if (b) { toggle(b.el); return; }
            if (x >= SUB.x && x <= SUB.x + SUB.w && y >= SUB.y && y <= SUB.y + SUB.h) { submit(); return; }
            st.drag = sliderHit(x, y); if (st.drag) dragTo(x);
          } else if (type === 'move') {
            if (st.drag) dragTo(x);
            st.hovering = x >= X0 && x <= X0 + PW && y >= STRIP[0] && y <= PLOT[1] + 16;
            if (st.hovering) st.hover = xLam(x);
          } else if (type === 'up') st.drag = null;
        },
        key(e, down) {
          if (!down) return;
          const k = CA.U.keyOf(e), n = parseInt(k, 10);
          if (n >= 1 && n <= task.cands.length) { toggle(task.cands[n - 1]); return; }
          const big = e.shiftKey ? 10 : 1;
          if (k === 'Enter') submit();
          else if (task.fitV && (k === 'ArrowLeft' || k === 'ArrowRight')) setV(st.v + (k === 'ArrowRight' ? 50 : -50) * big);
          else if (task.fitT && (k === 'ArrowUp' || k === 'ArrowDown' || ((k === 'ArrowLeft' || k === 'ArrowRight') && !task.fitV))) {
            setT(st.T + (k === 'ArrowUp' || k === 'ArrowRight' ? 20 : -20) * big);
          }
        },
        update(dt) {
          if (st.done) return;
          st.t += dt;
          if (st.t >= task.time) { st.done = true; api.finish({ success: false, score: 0, message: CA.t('sa.failTime', { els: answer() }), hint: CA.t('sa.hint') }); }
        },
        draw(g, W, H) {
          CA.MG.bg(g, W, H, [14, 16, 30]);
          g.font = '12px Inter, system-ui, sans-serif';
          const shifted = (lam0) => lam0 * (1 + st.v / M.C_KMS);
          // spectrograph strip: the light itself, with dark (absorption) or bright (emission) lines
          for (let i = 0; i < PW; i++) {
            const l = xLam(X0 + i + 0.5), f = trace[Math.round(i * 2)], [r, gg, b] = lamRGB(l);
            const k = task.kind === 'emis' ? U.clamp(f, 0, 1) : U.clamp(f, 0, 1) * 0.85 + 0.05;
            g.fillStyle = `rgb(${(r * k) | 0},${(gg * k) | 0},${(b * k) | 0})`;
            g.fillRect(X0 + i, STRIP[0], 1, STRIP[1] - STRIP[0]);
          }
          if (l1 > 720) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.textAlign = 'center'; g.fillText(CA.t('sa.ir'), lamX(Math.min(l1, 860)), STRIP[1] - 6); }
          // intensity plot
          g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
          g.strokeRect(X0, PLOT[0], PW, PLOT[1] - PLOT[0]);
          g.fillStyle = 'rgba(200,210,240,0.7)'; g.textAlign = 'center';
          for (let l = Math.ceil(l0 / 50) * 50; l <= l1; l += 50) { g.fillRect(lamX(l), PLOT[1], 1, 5); g.fillText(l, lamX(l), PLOT[1] + 17); }
          g.textAlign = 'right'; g.fillText(CA.t('sa.axis'), X0 + PW, PLOT[1] + 32);
          g.textAlign = 'left'; g.fillText(CA.t(task.kind === 'emis' ? 'sa.emis' : 'sa.abs'), X0 + 4, PLOT[0] - 2 + 14);
          g.strokeStyle = '#e8f0ff'; g.lineWidth = 1.2; g.beginPath();
          trace.forEach((f, i) => { const x = X0 + i / 2, y = plotY(f); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
          // the player's blackbody guess
          if (task.fitT) {
            g.strokeStyle = 'rgba(255,200,120,0.9)'; g.setLineDash([5, 4]); g.beginPath();
            for (let i = 0; i <= PW; i += 4) { const y = plotY(M.saContinuum(task.range, xLam(X0 + i), st.T)); i ? g.lineTo(X0 + i, y) : g.moveTo(X0 + i, y); }
            g.stroke(); g.setLineDash([]);
            const pk = M.wienPeak(st.T);
            if (pk >= l0 && pk <= l1) { g.fillStyle = 'rgba(255,200,120,0.9)'; g.beginPath(); g.moveTo(lamX(pk), PLOT[0] + 2); g.lineTo(lamX(pk) - 5, PLOT[0] - 6); g.lineTo(lamX(pk) + 5, PLOT[0] - 6); g.fill(); }
          }
          // templates of the selected elements
          st.sel.forEach((el, k) => {
            g.strokeStyle = COL[el]; g.fillStyle = COL[el]; g.globalAlpha = 0.85; g.setLineDash([3, 3]); g.lineWidth = 1;
            let lastX = -99; // one label per cluster of close lines (Na D, Mg b, Ca H&K)
            for (const [lam0] of M.SA_ELEMENTS[el]) {
              const l = shifted(lam0); if (l < l0 || l > l1) continue;
              const x = lamX(l); g.beginPath(); g.moveTo(x, PLOT[0]); g.lineTo(x, PLOT[1]); g.stroke();
              if (Math.abs(x - lastX) > 18) { g.textAlign = 'center'; g.fillText(SYM[el] + (st.wrong.includes(el) ? ' ✕' : ''), x, PLOT[0] + 28 + (k % 4) * 13); lastX = x; }
            }
            g.setLineDash([]); g.globalAlpha = 1;
          });
          // unexplained lines after a wrong submission
          g.fillStyle = '#ff6b6b';
          for (const l of st.marks) { const x = lamX(l); g.beginPath(); g.moveTo(x, PLOT[1] - 1); g.lineTo(x - 5, PLOT[1] - 10); g.lineTo(x + 5, PLOT[1] - 10); g.fill(); }
          // cursor
          if (st.hovering) { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(lamX(st.hover), STRIP[0]); g.lineTo(lamX(st.hover), PLOT[1]); g.stroke(); }
          // loupe: ±10 nm around the cursor
          const Lp = LOUPE, c = U.clamp(st.hover, l0 + Lp.half, l1 - Lp.half), lx = (l) => Lp.x + ((l - (c - Lp.half)) / (2 * Lp.half)) * Lp.w;
          g.fillStyle = 'rgba(8,10,22,0.9)'; g.fillRect(Lp.x, Lp.y, Lp.w, Lp.h);
          g.strokeStyle = 'rgba(255,255,255,0.18)'; g.strokeRect(Lp.x, Lp.y, Lp.w, Lp.h);
          const ly = (f) => Lp.y + Lp.h - 4 - (U.clamp(f, 0, yMax) / yMax) * (Lp.h - 18);
          g.strokeStyle = '#e8f0ff'; g.lineWidth = 1.2; g.beginPath();
          for (let i = 0; i <= Lp.w; i += 2) { const l = c - Lp.half + (i / Lp.w) * 2 * Lp.half, y = ly(observed(l)); i ? g.lineTo(Lp.x + i, y) : g.moveTo(Lp.x + i, y); }
          g.stroke();
          st.sel.forEach((el) => {
            g.strokeStyle = COL[el]; g.fillStyle = COL[el]; g.setLineDash([3, 3]);
            for (const [lam0] of M.SA_ELEMENTS[el]) {
              const l = shifted(lam0); if (Math.abs(l - c) > Lp.half) continue;
              g.beginPath(); g.moveTo(lx(l), Lp.y + 14); g.lineTo(lx(l), Lp.y + Lp.h); g.stroke(); g.textAlign = 'center'; g.fillText(SYM[el], lx(l), Lp.y + 12);
            }
            g.setLineDash([]);
          });
          g.fillStyle = 'rgba(200,210,240,0.8)'; g.textAlign = 'left';
          g.fillText(CA.t('sa.loupe', { l: c.toFixed(1) }), Lp.x + 4, Lp.y + Lp.h + 14);
          // sliders or the level brief
          const slider = (y, f, label) => {
            g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(SL.x, y - 3, SL.w, 6);
            g.fillStyle = '#ffd9a0'; g.beginPath(); g.arc(SL.x + f * SL.w, y, 9, 0, U.TAU); g.fill();
            g.fillStyle = '#e8f0ff'; g.textAlign = 'left'; g.fillText(label, SL.x, y - 16);
          };
          if (task.fitV) slider(SLV, st.v / V_MAX, CA.t('sa.vlab', { v: num(st.v), z: (st.v / M.C_KMS).toFixed(4) }));
          if (task.fitT) slider(SLT, (st.T - T_MIN) / (T_MAX - T_MIN), CA.t('sa.tlab', { t: num(st.T), p: Math.round(M.wienPeak(st.T)) }));
          if (!task.fitV && !task.fitT) wrap(g, CA.t('sa.b' + level), SL.x, SLV - 18, SL.w, 16, 'rgba(200,210,240,0.85)');
          // element buttons
          for (const [i, b] of buttons().entries()) {
            const on = st.sel.includes(b.el);
            g.fillStyle = on ? COL[b.el] : 'rgba(255,255,255,0.06)'; g.fillRect(b.x, b.y, b.w, b.h);
            g.strokeStyle = COL[b.el]; g.lineWidth = 1.5; g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
            g.fillStyle = on ? '#111' : '#e8f0ff'; g.textAlign = 'center';
            g.font = '600 13px Inter, system-ui, sans-serif'; g.fillText(SYM[b.el], b.x + b.w / 2, b.y + 17);
            g.font = '11px Inter, system-ui, sans-serif'; g.fillText((i + 1) + ' · ' + CA.t('sa.el.' + b.el), b.x + b.w / 2, b.y + 32);
          }
          g.font = '12px Inter, system-ui, sans-serif';
          // submit + feedback
          g.fillStyle = 'rgba(125,255,176,0.15)'; g.fillRect(SUB.x, SUB.y, SUB.w, SUB.h);
          g.strokeStyle = '#7dffb0'; g.strokeRect(SUB.x + 0.5, SUB.y + 0.5, SUB.w - 1, SUB.h - 1);
          g.fillStyle = '#7dffb0'; g.textAlign = 'center'; g.font = '600 13px Inter, system-ui, sans-serif'; g.fillText(CA.t('sa.submit'), SUB.x + SUB.w / 2, SUB.y + 25);
          g.font = '12px Inter, system-ui, sans-serif';
          if (st.msg) wrap(g, st.msg, X0, SUB.y + 14, SUB.x - X0 - 20, 16, '#ffd0b0');
        },
        coach() {
          if (!st.sel.length) return CA.t(task.kind === 'emis' ? 'sa.coachPickE' : 'sa.coachPick');
          if (task.fitV && !st.v) return CA.t('sa.coachV');
          return CA.t('sa.coachSubmit');
        },
        hud() {
          return `<span>${CA.t('sa.sel', { n: st.sel.length })}</span><span>${CA.t('sa.tries', { n: st.tries })}</span>
            <span>${CA.t('mgf.time', { t: Math.max(0, task.time - st.t).toFixed(0) })}</span>`;
        },
      };
    },
    reward(s, level) {
      return {
        rewards: { research: 10 + 5 * level, heavy: 3 + 2 * level },
        buff: { id: 'mg_sa', key: 'research', mult: 1.2, t: 150, name: '+20% research' },
      };
    },
    onSuccess(G, level) {
      if (level === 4) return CA.MG.discover(G, 'nebulium');
      if (level === 5) return CA.MG.discover(G, 'tc_star');
      return null;
    },
  });

  // word-wrapped canvas text
  function wrap(g, text, x, y, w, lh, color) {
    g.fillStyle = color; g.textAlign = 'left';
    const words = String(text).split(' ');
    let line = '';
    for (const wd of words) {
      const t = line ? line + ' ' + wd : wd;
      if (g.measureText(t).width > w && line) { g.fillText(line, x, y); y += lh; line = wd; } else line = t;
    }
    if (line) g.fillText(line, x, y);
  }
  CA.MG.wrapText = wrap;
})(globalThis.CA = globalThis.CA || {});
