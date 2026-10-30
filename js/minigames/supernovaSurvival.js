/* Minigame: SUPERNOVA SURVIVAL — a red supergiant's core collapses. Catch the neutrino burst in the detector noise,
   slip through gaps in the shock fronts while collecting O/Si/Fe ejecta, then observe the light curve
   (models in models.js). Core mechanic: read a signal in noise → dodge through gaps → time an observation. */
(function (CA) {
  'use strict';
  const U = CA.U, TAU = U.TAU, M = CA.Models;

  const CX = 480, CY = 300, STAR_R = 42, SHIP_R = 9, VMAX = 210, ACCEL = 700, THICK = 16, DELAY = 4, REV_R0 = 570, EDGE = 575;
  // ejecta clumps: outer layers fly fastest (onion structure); Rayleigh–Taylor fingers bunch them into plumes
  const EL = { O: { c: [125, 255, 176], v: [40, 50] }, Si: { c: [255, 214, 102], v: [30, 38] }, Fe: { c: [255, 150, 120], v: [20, 26] } };
  const DET = { x: 700, y: 14, w: 246, h: 64 }, GRAPH = { x: 70, y: 360, w: 820, h: 200 };

  CA.MG.register({
    id: 'sn', name: 'Supernova Survival', mechanic: 'Neutrino alert, shock dodge, peak timing', unlock: 'supergiant', levels: 5,
    science: 'When a massive star\'s iron core collapses, almost all of the energy leaves within seconds as neutrinos, which escape at once while the shock wave needs hours to reach the surface. Neutrinos are therefore the earliest warning: SN 1987A\'s arrived about 3 hours before its light, and today the SNEWS network alerts telescopes automatically. The shock then throws out the star\'s onion layers (oxygen, silicon, iron) in clumps, and the light that follows is powered by radioactive nickel-56 decaying to cobalt-56 (half-life 6.1 days) and then to iron-56 (77 days).',
    intro: (l) => {
      const L = M.SN_LEVELS[l];
      const need = Object.keys(L.need).map((k) => k + ' ×' + L.need[k]).join(', ');
      return {
        objective: CA.t('sn.obj', { need }) + ' ' + CA.t(L.tail ? 'sn.objTail' : 'sn.objPeak') + ' ' + CA.t('sn.b' + l),
        controls: [CA.t('sn.c1', { f: L.falses }), CA.t('sn.c2'), CA.t('sn.c3', { hp: L.hull }), CA.t(L.tail ? 'sn.c4tail' : 'sn.c4', { n: L.tries || 1 })],
      };
    },
    create(api, level) {
      const L = M.SN_LEVELS[level], rnd = api.rng;
      const nu = M.snNuNew(L, rnd), tb = nu.tc + DELAY; // shock breakout at the surface, DELAY s after the neutrinos
      const tauD = L.tauD[0] + rnd() * (L.tauD[1] - L.tauD[0]), peak = M.snPeak(tauD);
      const mark = L.tail ? { day: L.tail.mark, L: M.snLight(L.tail.mark, tauD) } : null;
      const a0 = rnd() * TAU;
      const ship = { x: Math.cos(a0) * 230, y: Math.sin(a0) * 230, vx: 0, vy: 0, hp: L.hull, inv: 0 };
      const input = { dir: null }, keys = {}, ptr = { down: false, x: 0, y: 0 };
      const gapsOf = (n, w) => { const off = rnd() * TAU; return Array.from({ length: n }, (_, k) => ({ a: off + (k + (rnd() - 0.5) * 0.4) * (TAU / n), w })); };
      const fronts = L.fronts.map((f) => ({ dir: f.dir, v: f.v, t0: tb + f.dt, r0: f.dir > 0 ? STAR_R : REV_R0, gaps: gapsOf(f.gaps, f.w) }));
      const plumes = [0, 1, 2].map(() => rnd() * TAU), clumps = [], got = { O: 0, Si: 0, Fe: 0 };
      for (const el in L.need) for (let i = 0; i < L.need[el] + L.extra; i++) {
        const a = plumes[i % 3] + (rnd() - 0.5) * 0.7, v = EL[el].v[0] + rnd() * (EL[el].v[1] - EL[el].v[0]);
        clumps.push({ el, a, v, t0: tb + 0.3 + rnd() * 1.4, x: 0, y: 0, got: false, gone: false });
      }
      const st = { t: 0, phase: 'watch', alert: null, falses: 0, online: false, shields: false, flash: 0, done: false, msg: '', msgT: 0, msgOk: false, missedNu: false, tries: L.tries || 1, light: null, obs: null };
      const say = (key, vars, good) => { st.msg = CA.t(key, vars); st.msgT = 3.5; st.msgOk = !!good; };

      function finish(success, key, vars, quality = 0) {
        if (st.done) return;
        st.done = true;
        const extra = Object.keys(got).reduce((a, k) => a + Math.max(0, got[k] - (L.need[k] || 0)), 0);
        const score = success ? Math.round(500 + ship.hp * 150 + (st.alert !== null ? 250 : 0) - st.falses * 60 + extra * 40 + quality * 400) : 0;
        api.finish({ success, score, message: CA.t(key, vars), hint: success ? '' : CA.t('sn.hint.' + key.slice(3)) });
      }
      function press() {
        if (st.done) return;
        if (st.phase === 'light') return observe();
        if (st.alert !== null || st.missedNu) return;
        const r = M.snAlert(nu, st.t);
        if (r === 'false') {
          st.falses++; api.sfx('deny'); say('sn.falseAlarm', { n: st.falses, max: L.falses });
          if (st.falses > L.falses) finish(false, 'sn.failFalse');
        } else if (r === 'ok') { st.alert = st.t; st.online = st.shields = true; api.sfx('success'); say('sn.alertOk', { s: (st.t - nu.tc).toFixed(1) }, true); }
      }
      function observe() {
        const lt = st.light, day = lt.day, now = M.snLight(day, tauD);
        if (L.tail) {
          if (day < mark.day) { say('sn.waitMark'); return; }
          const half = day - mark.day, err = Math.abs(half - M.SN_HALF.Co) / M.SN_HALF.Co;
          lt.press = day;
          if (err <= L.tail.tol) finish(true, 'sn.winTail', { d: Math.round(half) }, 1 - err / L.tail.tol);
          else finish(false, 'sn.failHalf', { d: Math.round(half) });
          return;
        }
        lt.press = day;
        if (now >= L.peakTol * peak.L) return finish(true, 'sn.winPeak', { d: Math.round(day), p: Math.round(peak.day) }, (now / peak.L - L.peakTol) / (1 - L.peakTol));
        st.tries--;
        if (st.tries <= 0) return finish(false, day < peak.day ? 'sn.failEarly' : 'sn.failLate', { d: Math.round(day) });
        say('sn.tooEarly', { n: st.tries });
      }
      const rOf = () => Math.hypot(ship.x, ship.y);
      const frontDone = (f, t) => { const R = M.snFrontR(f, t); return f.dir > 0 ? R > EDGE : R < STAR_R; };
      const inArena = (x, y) => Math.abs(x) < CX + 10 && Math.abs(y) < CY + 10;

      return {
        _dbg: () => ({ ship, input, st, nu, tb, fronts, clumps, got, L, peak, tauD, mark, press }),
        pointer(type, x, y, btn) {
          ptr.x = x - CX; ptr.y = y - CY;
          if (type === 'down' && btn === 0) { ptr.down = true; if (st.phase === 'light' || (st.phase === 'watch' && !st.online)) press(); }
          else if (type === 'up') ptr.down = false;
        },
        key(e, down) {
          const k = CA.U.keyOf(e);
          if (k === 'w' || k === 'ArrowUp') keys.u = down;
          if (k === 's' || k === 'ArrowDown') keys.d = down;
          if (k === 'a' || k === 'ArrowLeft') keys.l = down;
          if (k === 'd' || k === 'ArrowRight') keys.r = down;
          if (down && !e.repeat && (e.code === 'Space' || e.key === 'Enter')) press();
        },
        update(dt) {
          if (st.done) return;
          st.t += dt; st.flash = Math.max(0, st.flash - dt); st.msgT = Math.max(0, st.msgT - dt); ship.inv = Math.max(0, ship.inv - dt);
          const t = st.t;
          if (st.alert === null && !st.missedNu && t > nu.tc + M.SN_ALERT_WIN) {
            st.missedNu = true;
            if (L.needAlert) return finish(false, 'sn.failNu');
            say('sn.missedNu');
          }
          if (st.phase === 'watch' && t >= tb) {
            st.phase = 'shock'; st.flash = 1; api.sfx('supernova');
          }
          if (!st.online && t >= tb + 0.6) st.online = true;
          if (st.phase === 'light') {
            st.light.day = (t - st.light.t0) * L.days;
            const day = st.light.day;
            if (L.tail ? day > mark.day + M.SN_HALF.Co * (1 + L.tail.tol) + 5 : day > peak.day && M.snLight(day, tauD) < L.peakTol * peak.L) finish(false, 'sn.failLate', { d: Math.round(day) });
            return;
          }
          // probe: steer toward a desired velocity (keys, held mouse, or the test input)
          if (st.online) {
            let dx = 0, dy = 0, sp = VMAX;
            if (keys.u || keys.d || keys.l || keys.r) { dx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0); dy = (keys.d ? 1 : 0) - (keys.u ? 1 : 0); }
            else if (ptr.down) { dx = ptr.x - ship.x; dy = ptr.y - ship.y; sp = Math.min(VMAX, Math.hypot(dx, dy) * 4); }
            else if (input.dir) { [dx, dy] = input.dir; sp = Math.min(VMAX, Math.hypot(dx, dy) * 4); } // tests: an offset, like the pointer
            const n = Math.hypot(dx, dy), wx = n ? (dx / n) * sp : 0, wy = n ? (dy / n) * sp : 0;
            const ex = wx - ship.vx, ey = wy - ship.vy, e = Math.hypot(ex, ey), k = e > 1e-9 ? Math.min(1, (ACCEL * dt) / e) : 0;
            ship.vx += ex * k; ship.vy += ey * k;
          }
          ship.x = U.clamp(ship.x + ship.vx * dt, -CX + SHIP_R, CX - SHIP_R); ship.y = U.clamp(ship.y + ship.vy * dt, -CY + SHIP_R, CY - SHIP_R);
          const r = rOf();
          if (r < STAR_R + SHIP_R) { const k = (STAR_R + SHIP_R) / (r || 1); ship.x *= k; ship.y *= k; }
          if (st.phase !== 'shock') return;
          // shock fronts: a hit outside a gap damages the probe (twice as much without the neutrino warning)
          const ang = Math.atan2(ship.y, ship.x), rr = rOf();
          for (const f of fronts) {
            if (t < f.t0 || frontDone(f, t)) continue;
            if (Math.abs(rr - M.snFrontR(f, t)) < THICK / 2 + SHIP_R && !M.snInGap(f, ang) && ship.inv <= 0) {
              ship.hp -= st.shields ? 1 : 2; ship.inv = 1.0; st.flash = 0.5; api.sfx('fail'); say(st.shields ? 'sn.hit' : 'sn.hitNoShield');
              if (ship.hp <= 0) return finish(false, 'sn.wrecked');
            }
          }
          for (const c of clumps) {
            if (c.got || c.gone || t < c.t0) continue;
            const R = STAR_R + c.v * (t - c.t0);
            c.x = Math.cos(c.a) * R; c.y = Math.sin(c.a) * R;
            if (Math.hypot(c.x - ship.x, c.y - ship.y) < SHIP_R + 8) { c.got = true; got[c.el]++; api.sfx('click'); }
            else if (!inArena(c.x, c.y)) c.gone = true;
          }
          // not enough left to collect → fail now; everything over → light curve
          for (const el in L.need) {
            const left = clumps.filter((c) => c.el === el && !c.got && !c.gone).length;
            if (got[el] + left < L.need[el]) return finish(false, 'sn.failSamples', { el });
          }
          if (fronts.every((f) => t >= f.t0 && frontDone(f, t)) && clumps.every((c) => c.got || c.gone)) {
            st.phase = 'light'; st.light = { t0: t, day: 0, press: null }; api.sfx('rare'); say(L.tail ? 'sn.lightTail' : 'sn.lightPeak', {}, true);
          }
        },
        draw(g, W, H) {
          CA.MG.bg(g, W, H, [26, 12, 18]);
          const t = st.t;
          g.save(); g.translate(CX, CY);
          if (st.phase === 'watch') {
            // the supergiant; after the core collapses (neutrinos) the surface does not know yet
            CA.Bodies.draw(g, 'supergiant', 0, 0, STAR_R, { t, seed: 2 });
            if (t >= nu.tc) CA.MG.glow(g, 0, 0, STAR_R * 0.4, [200, 220, 255], 0.4 + 0.3 * Math.sin(t * 20));
            if (st.alert !== null) lanes(g, fronts[0], false); // the warning buys time to line up with a gap
          } else {
            const age = t - tb;
            CA.MG.glow(g, 0, 0, STAR_R * (1.6 + Math.min(age, 6)), [255, 210, 170], Math.max(0.12, 0.7 - age * 0.06));
            CA.Bodies.draw(g, 'ns', 0, 0, 6, { t, seed: 1, beam: t * 4, beamLen: 60 });
            for (const f of fronts) drawFront(g, f, t);
            for (const c of clumps) if (!c.got && !c.gone && t >= c.t0) { CA.MG.glow(g, c.x, c.y, 12, EL[c.el].c, 0.9); g.fillStyle = '#fff'; g.font = '600 9px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(c.el, c.x, c.y + 3); }
          }
          if (st.phase !== 'light') drawProbe(g);
          g.restore();
          if (st.flash > 0) { g.fillStyle = `rgba(255,240,220,${st.flash * 0.55})`; g.fillRect(0, 0, W, H); }
          drawDetector(g, t);
          if (st.phase === 'light') drawCurve(g);
        },
        coach() {
          if (st.msgT > 0) return { t: st.msg, k: st.msgOk ? 'ok' : 'warn' };
          if (st.phase === 'light') return CA.t(L.tail ? 'sn.coachTail' : 'sn.coachPeak');
          if (st.phase === 'shock') return CA.t(fronts.every((f) => frontDone(f, st.t)) ? 'sn.coachCollect' : 'sn.coachShock');
          if (st.alert !== null) return { t: CA.t('sn.coachLane', { t: Math.max(0, tb - st.t).toFixed(1) }), k: 'ok' };
          return st.missedNu ? { t: CA.t('sn.asleep'), k: 'warn' } : CA.t('sn.coachWatch');
        },
        hud() {
          const parts = [CA.t('sn.hull', { n: Math.max(0, ship.hp) })];
          parts.push(CA.t(st.alert !== null ? 'sn.alertOn' : st.missedNu ? 'sn.alertMissed' : 'sn.alertWait', { f: st.falses, max: L.falses }));
          parts.push(Object.keys(L.need).map((k) => `${k} <b>${got[k]}</b>/${L.need[k]}`).join(' · '));
          if (st.phase === 'light') parts.push(CA.t('sn.day', { d: Math.round(st.light.day) }));
          return parts.map((p) => `<span>${p}</span>`).join('');
        },
      };

      // safe lanes along each gap, so the player can line up before the front arrives
      function lanes(g, f, faint) {
        for (const gp of f.gaps) {
          g.fillStyle = faint ? 'rgba(140,200,255,0.04)' : 'rgba(140,200,255,0.1)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, EDGE, gp.a - gp.w, gp.a + gp.w); g.closePath(); g.fill();
        }
      }
      function drawFront(g, f, t) {
        const soon = t < f.t0;
        if (soon && (f.dir > 0 || t < f.t0 - 2.5)) return; // the reverse shock is seen forming at the edge 2.5 s ahead
        if (!soon && frontDone(f, t)) return;
        const R = soon ? f.r0 : M.snFrontR(f, t), steps = 180;
        lanes(g, f, soon);
        g.lineWidth = THICK; g.strokeStyle = soon ? 'rgba(255,140,90,0.25)' : f.dir > 0 ? 'rgba(255,170,110,0.85)' : 'rgba(255,120,160,0.85)';
        g.beginPath(); let pen = false;
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * TAU;
          if (M.snInGap(f, a)) { pen = false; continue; }
          const x = Math.cos(a) * R, y = Math.sin(a) * R;
          if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
        }
        g.stroke();
        if (f.dir < 0 && R < 330) { g.font = '11px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,170,200,0.85)'; g.fillText(CA.t('sn.reverse'), 0, -R - 14); }
      }
      function drawProbe(g) {
        g.save(); g.translate(ship.x, ship.y);
        g.globalAlpha = ship.inv > 0 && Math.floor(st.t * 12) % 2 ? 0.4 : 1;
        if (st.shields) { g.strokeStyle = 'rgba(140,220,255,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, SHIP_R + 4, 0, TAU); g.stroke(); }
        g.fillStyle = st.online ? '#dfe8ff' : '#7f8799'; g.beginPath(); g.arc(0, 0, SHIP_R * 0.7, 0, TAU); g.fill();
        g.fillRect(-SHIP_R * 1.4, -1.5, SHIP_R * 2.8, 3); // solar panels
        g.restore();
      }
      function drawDetector(g, t) {
        // a Kamiokande-style tank: each neutrino event is a brief ring of Cherenkov light
        g.fillStyle = 'rgba(5,10,24,0.85)'; g.fillRect(DET.x, DET.y, DET.w, DET.h);
        g.strokeStyle = st.alert !== null ? 'rgba(125,255,176,0.7)' : st.missedNu ? 'rgba(255,255,255,0.2)' : `rgba(255,214,102,${0.45 + 0.35 * Math.sin(t * 4)})`; g.strokeRect(DET.x, DET.y, DET.w, DET.h);
        g.font = '11px Inter, system-ui, sans-serif'; g.textAlign = 'left'; g.fillStyle = 'rgba(200,215,240,0.75)'; g.fillText(CA.t('sn.detector'), DET.x + 4, DET.y + DET.h + 13);
        let i = 0;
        for (const e of nu.ev) {
          i++;
          if (e.t > t) break;
          const age = t - e.t; if (age > 1.2) continue;
          const h = Math.sin(i * 12.9898) * 43758.5453, fx = h - Math.floor(h), fy = (h * 7.31) - Math.floor(h * 7.31);
          g.strokeStyle = `rgba(150,210,255,${0.9 * (1 - age / 1.2)})`; g.lineWidth = 1.5;
          g.beginPath(); g.arc(DET.x + 14 + fx * (DET.w - 28), DET.y + 12 + fy * (DET.h - 24), 4 + age * 10, 0, TAU); g.stroke();
        }
        // events per 0.25 s over the last 8 s
        const bins = 32, cnt = new Array(bins).fill(0);
        for (const e of nu.ev) { if (e.t > t || e.t < t - 8) continue; cnt[Math.min(bins - 1, Math.floor(((e.t - (t - 8)) / 8) * bins))]++; }
        const bx = DET.x, by = DET.y + DET.h + 18, bw = DET.w / bins;
        g.fillStyle = 'rgba(150,210,255,0.8)';
        cnt.forEach((c, k) => { if (c) g.fillRect(bx + k * bw, by + 26 - Math.min(26, c * 4), bw - 1, Math.min(26, c * 4)); });
        g.strokeStyle = 'rgba(255,255,255,0.15)'; g.strokeRect(bx, by, DET.w, 26);
      }
      function drawCurve(g) {
        const lt = st.light, dmax = L.tail ? mark.day + M.SN_HALF.Co * 1.5 : Math.max(60, peak.day * 2.2);
        const top = Math.log10(peak.L) + 0.15, bot = top - (L.tail ? 2.0 : 1.6);
        const X = (d) => GRAPH.x + (d / dmax) * GRAPH.w, Y = (l) => GRAPH.y + GRAPH.h * (1 - U.clamp((Math.log10(Math.max(l, 1e-12)) - bot) / (top - bot), 0, 1));
        g.fillStyle = 'rgba(5,10,20,0.88)'; g.fillRect(GRAPH.x - 50, GRAPH.y - 26, GRAPH.w + 70, GRAPH.h + 50);
        g.strokeStyle = 'rgba(255,255,255,0.15)'; g.strokeRect(GRAPH.x, GRAPH.y, GRAPH.w, GRAPH.h);
        g.font = '11px Inter, system-ui, sans-serif'; g.fillStyle = 'rgba(200,215,240,0.75)'; g.textAlign = 'left';
        g.fillText(CA.t('sn.curve'), GRAPH.x, GRAPH.y - 10);
        g.textAlign = 'center';
        for (let d = 0; d <= dmax; d += dmax > 150 ? 50 : 20) g.fillText(d + (d ? '' : ' d'), X(d), GRAPH.y + GRAPH.h + 14);
        if (mark) { // reference level and the half of it
          g.setLineDash([4, 5]); g.strokeStyle = 'rgba(255,214,102,0.7)';
          g.beginPath(); g.moveTo(X(mark.day), GRAPH.y); g.lineTo(X(mark.day), GRAPH.y + GRAPH.h); g.stroke();
          g.beginPath(); g.moveTo(GRAPH.x, Y(mark.L / 2)); g.lineTo(GRAPH.x + GRAPH.w, Y(mark.L / 2)); g.stroke(); g.setLineDash([]);
          g.fillStyle = 'rgba(255,214,102,0.85)'; g.textAlign = 'left'; g.fillText(CA.t('sn.half'), GRAPH.x + 4, Y(mark.L / 2) - 4);
        }
        g.strokeStyle = '#ffe0b0'; g.lineWidth = 2; g.beginPath();
        for (let d = 0, i = 0; d <= Math.min(lt.day, dmax); d += dmax / 300, i++) { const x = X(d), y = Y(M.snLight(d, tauD)); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
        if (lt.day <= dmax) CA.MG.glow(g, X(lt.day), Y(M.snLight(lt.day, tauD)), 12, [255, 230, 190], 0.9);
      }
    },
    reward(s, level) {
      return {
        rewards: { heavy: 15 + 8 * level, research: 10 + 5 * level },
        buff: { id: 'mg_sn', key: 'matter', mult: 1.3, t: 150, name: '+30% matter' },
      };
    },
    onSuccess(G, level) {
      if (level === 5) return CA.MG.discover(G, 'sn1987a');
      return null;
    },
  });
})(globalThis.CA = globalThis.CA || {});
