/* COSMIC ASCENSION — reusable minigame framework: intro → play (pause/restart/exit) → result → rewards.
   Each minigame registers { id, name, mechanic, unlock, levels, intro(level), science, create(api, level), reward(...) }. */
(function (CA) {
  'use strict';
  const U = CA.U;
  const MG = (CA.MG = { defs: {}, order: [], active: null });

  MG.register = function (def) { MG.defs[def.id] = def; MG.order.push(def.id); };
  MG.unlocked = (s, id) => !!s.discovered['stage:' + MG.defs[id].unlock];
  MG.levelOpen = (s, id, level) => level >= 1 && level <= MG.defs[id].levels && level <= (s.mg[id].cleared || 0) + 1;

  let el = {}, raf = 0, last = 0, runCounter = 0;

  function $(id) { return document.getElementById(id); }
  MG.initDom = function () {
    el = {
      root: $('mg'), canvas: $('mg-canvas'), title: $('mg-title'), level: $('mg-level'), hud: $('mg-hud'),
      intro: $('mg-intro'), result: $('mg-result'), pause: $('mg-pause'), coach: $('mg-coach'),
    };
    $('mg-btn-pause').onclick = () => MG.togglePause();
    $('mg-btn-restart').onclick = () => MG.restart();
    $('mg-btn-exit').onclick = () => MG.close();
    // touch screens have no Space bar: this button stands in for it
    const space = (down) => { const a = MG.active; if (a && a.running && a.inst.key) a.inst.key({ code: 'Space', key: ' ', repeat: false, shiftKey: false }, down); };
    $('mg-touch').addEventListener('pointerdown', (e) => { e.preventDefault(); space(true); });
    $('mg-touch').addEventListener('pointerup', () => space(false));
    const cv = el.canvas;
    const pos = (e) => { const r = cv.getBoundingClientRect(), a = MG.active; return { x: (e.clientX - r.left - a.ox) / a.sc, y: (e.clientY - r.top - a.oy) / a.sc }; };
    cv.addEventListener('pointerdown', (e) => { if (!MG.active || !MG.active.running) return; MG.touch = e.pointerType === 'touch'; const p = pos(e); cv.setPointerCapture && cv.setPointerCapture(e.pointerId); MG.active.inst.pointer && MG.active.inst.pointer('down', p.x, p.y, e.button); });
    cv.addEventListener('pointermove', (e) => { if (!MG.active || !MG.active.running) return; const p = pos(e); MG.active.inst.pointer && MG.active.inst.pointer('move', p.x, p.y, e.button); });
    cv.addEventListener('pointerup', (e) => { if (!MG.active || !MG.active.running) return; const p = pos(e); MG.active.inst.pointer && MG.active.inst.pointer('up', p.x, p.y, e.button); });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keyup', (e) => { if (MG.active && MG.active.running && MG.active.inst.key) MG.active.inst.key(e, false); });
    window.addEventListener('resize', () => MG.active && sizeCanvas());
  };

  // Minigames run in a fixed logical arena (LW×LH), letterboxed to fit any screen, so difficulty
  // does not depend on window size.
  const LW = 960, LH = 600;
  MG.LW = LW; MG.LH = LH;
  function sizeCanvas() {
    const r = el.canvas.getBoundingClientRect(), dpr = Math.min(CA.Render.dprCap(), window.devicePixelRatio || 1);
    el.canvas.width = Math.round(r.width * dpr); el.canvas.height = Math.round(r.height * dpr);
    if (MG.active) {
      const a = MG.active, sc = Math.min(r.width / LW, r.height / LH) || 1;
      Object.assign(a, { w: LW, h: LH, dpr, sc, ox: (r.width - LW * sc) / 2, oy: (r.height - LH * sc) / 2 });
    }
  }

  MG.open = function (id, level) {
    const G = CA.Game, s = G.state, def = MG.defs[id];
    if (!def || !MG.unlocked(s, id)) { CA.UI.toast(CA.t('mgf.locked'), 'warn'); return; }
    if (!MG.levelOpen(s, id, level)) { CA.UI.toast(CA.t('mgf.clearPrev'), 'warn'); return; }
    CA.Audio.unlock();
    G.inMinigame = true; G.input.down = false;
    MG.active = { id, def, level, running: false, paused: false, done: false, inst: null, w: LW, h: LH, dpr: 1, sc: 1, ox: 0, oy: 0 };
    el.root.classList.remove('hidden');
    el.title.textContent = def.name;
    el.level.textContent = CA.t('mgf.level', { l: level, n: def.levels });
    sizeCanvas();
    showIntro();
  };

  function showIntro() {
    const a = MG.active, def = a.def, info = def.intro(a.level);
    el.result.classList.add('hidden'); el.pause.classList.add('hidden');
    el.root.classList.remove('live'); el.hud.innerHTML = ''; setCoach(null);
    el.intro.innerHTML = `
      <h3>${def.name} <span class="muted">${CA.t('mgf.levelShort', { l: a.level })}</span></h3>
      <p class="mg-obj"><b>${CA.t('mgf.objective')}</b> ${info.objective}</p>
      <ul class="mg-controls">${info.controls.map((c) => `<li>${c}</li>`).join('')}</ul>
      <details class="mg-sci"><summary>${CA.t('mgf.sciMore')}</summary>${def.science}</details>
      <div class="row"><button class="btn primary" id="mg-start" data-enter>${CA.t('mgf.start')} <kbd>Enter</kbd></button><button class="btn" id="mg-cancel">${CA.t('mgf.back')}</button></div>`;
    el.intro.classList.remove('hidden');
    $('mg-start').onclick = () => MG.start();
    $('mg-cancel').onclick = () => MG.close();
    drawIdle();
  }

  // the one line under the header that says what to do right now; a game returns a string, or { t, k: 'ok' | 'warn' }
  function setCoach(c) {
    const t = c ? c.t || c : '', k = (c && c.k) || '', cls = 'mg-coach ' + k + (t ? '' : ' hidden');
    if (el.coach.textContent !== t) el.coach.textContent = t;
    if (el.coach.className !== cls) el.coach.className = cls;
  }

  function frameTransform(g) {
    const a = MG.active;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#010208'; g.fillRect(0, 0, el.canvas.width, el.canvas.height);
    g.setTransform(a.dpr * a.sc, 0, 0, a.dpr * a.sc, a.dpr * a.ox, a.dpr * a.oy);
  }
  function drawIdle() {
    const a = MG.active, g = el.canvas.getContext('2d');
    frameTransform(g);
    MG.bg(g, a.w, a.h);
  }

  MG.start = function () {
    const a = MG.active;
    el.intro.classList.add('hidden'); el.result.classList.add('hidden'); el.pause.classList.add('hidden');
    el.root.classList.add('live');
    sizeCanvas();
    a.runId = ++runCounter;
    a.done = false; a.paused = false; a.running = true;
    const api = {
      w: () => a.w, h: () => a.h, level: a.level,
      rng: U.rng(1000 * a.def.id.length + a.level * 97),
      sfx: (n) => CA.Audio.play(n),
      finish: (result) => finish(result),
      state: CA.Game.state,
    };
    a.inst = a.def.create(api, a.level);
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
    CA.Game.state.mg[a.id].plays++;
  };

  MG.restart = function () { if (MG.active) MG.start(); };

  MG.togglePause = function () {
    const a = MG.active; if (!a || !a.running) return;
    a.paused = !a.paused;
    el.pause.classList.toggle('hidden', !a.paused);
    el.pause.innerHTML = a.paused ? `<h3>${CA.t('mgf.paused')}</h3><div class="row"><button class="btn primary" id="mg-resume">${CA.t('mgf.resume')}</button><button class="btn" id="mg-p-restart">${CA.t('mgf.restart')}</button><button class="btn" id="mg-p-exit">${CA.t('mgf.exit')}</button></div>` : '';
    if (a.paused) { $('mg-resume').onclick = () => MG.togglePause(); $('mg-p-restart').onclick = () => MG.restart(); $('mg-p-exit').onclick = () => MG.close(); }
  };

  MG.key = function (e) {
    const a = MG.active; if (!a) return;
    const k = CA.U.keyOf(e);
    if (k === 'Escape') { e.preventDefault(); if (a.running) MG.togglePause(); else MG.close(); return; }
    // Enter presses the panel's main button; the short lock keeps a last in-game keypress from skipping the result
    if (k === 'Enter' && !a.running && !e.repeat && performance.now() - (a.doneAt || 0) > 600) {
      const b = document.querySelector('.mg-panel:not(.hidden) [data-enter]');
      if (b) { e.preventDefault(); b.click(); }
      return;
    }
    if (!a.running || a.paused) return;
    if (k === 'r' && !e.repeat && !e.metaKey && !e.ctrlKey) { MG.restart(); return; }
    if (a.inst.key) { a.inst.key(e, true); if (e.code === 'Space' || k.startsWith('Arrow')) e.preventDefault(); }
  };

  function loop(ts) {
    const a = MG.active;
    if (!a || !a.running) return;
    let dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (!a.paused) {
      const steps = Math.max(1, Math.round(dt / (1 / 120)));
      for (let i = 0; i < steps && a.running; i++) a.inst.update(dt / steps);
    }
    const g = el.canvas.getContext('2d');
    frameTransform(g);
    g.save(); g.beginPath(); g.rect(0, 0, a.w, a.h); g.clip();
    a.inst.draw(g, a.w, a.h);
    g.restore();
    if (a.running) {
      el.hud.innerHTML = a.inst.hud ? a.inst.hud() : '';
      setCoach(a.inst.coach ? a.inst.coach() : null);
      raf = requestAnimationFrame(loop);
    }
  }

  function finish(result) {
    const a = MG.active; if (!a || a.done) return;
    a.done = true; a.running = false; a.doneAt = performance.now();
    el.root.classList.remove('live'); setCoach(null);
    const G = CA.Game, s = G.state, rec = s.mg[a.id];
    const prevBest = rec.best[a.level] || 0;
    let lines = [];
    if (result.success) {
      CA.Audio.play('success');
      rec.best[a.level] = Math.max(prevBest, Math.round(result.score));
      const firstClear = rec.cleared < a.level;
      rec.cleared = Math.max(rec.cleared, a.level);
      s.stats.minigames++;
      const rw = a.def.reward(s, a.level, result);
      const fid = 1 + 0.12 * CA.Econ.lvl(s, 'p_fidelity');
      for (const k in rw.rewards) rw.rewards[k] *= fid;
      const got = G.applyMinigameReward('run:' + a.id + ':' + a.runId + ':' + Date.now(), rw.rewards, rw.buff);
      if (got) for (const k in got) if (got[k] > 0) lines.push('+' + U.fmt(got[k]) + ' ' + CA.Econ.RES_NAMES[k]);
      if (rw.buff) lines.push(CA.t('mgf.buffV', { name: CA.I18n.has('buff.' + rw.buff.id) ? CA.t('buff.' + rw.buff.id) : rw.buff.name, t: Math.round(rw.buff.t) }));
      if (firstClear) {
        const bonus = CA.Econ.grantOnce(s, 'mg:' + a.id + ':L' + a.level, { research: 10 + 6 * a.level });
        if (bonus) lines.push(CA.t('mgf.firstClear', { n: U.fmt(bonus.research), res: CA.Econ.RES_NAMES.research }));
      }
      if (a.def.onSuccess) { const extra = a.def.onSuccess(G, a.level, result, firstClear); if (extra) lines.push(extra); }
    } else CA.Audio.play('fail');
    const canNext = result.success && a.level < a.def.levels && MG.levelOpen(s, a.id, a.level + 1);
    const ok = result.success, enter = ' data-enter', key = ' <kbd>Enter</kbd>';
    el.result.innerHTML = `
      <h3 class="${ok ? 'ok' : 'bad'}">${CA.t(ok ? 'mgf.success' : 'mgf.failed')} <span class="muted">${CA.t('mgf.levelShort', { l: a.level })}</span></h3>
      <p>${result.message || ''}</p>
      ${!ok && result.hint ? `<p class="mg-hint"><b>${CA.t('mgf.hint')}</b> ${result.hint}</p>` : ''}
      ${ok ? `<p class="mg-score">${CA.t('mgf.score', { s: Math.round(result.score || 0).toLocaleString('en-US'), b: Math.max(prevBest, Math.round(result.score)).toLocaleString('en-US') })}</p>` : ''}
      ${lines.length ? `<ul class="mg-rewards">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
      ${ok ? `<p class="mg-sci">${a.def.science.split('. ').slice(0, 2).join('. ').replace(/\.?$/, '.')}</p>` : '<p class="muted small">' + CA.t('mgf.noReward') + '</p>'}
      <div class="row">
        ${canNext ? `<button class="btn primary" id="mg-next"${enter}>${CA.t('mgf.next')}${key}</button>` : ''}
        <button class="btn ${canNext ? '' : 'primary'}" id="mg-replay"${canNext ? '' : enter}>${CA.t('mgf.replay')}${canNext ? '' : key}</button>
        <button class="btn" id="mg-exit2">${CA.t('mgf.exit')}</button>
      </div>`;
    el.result.classList.remove('hidden');
    $('mg-replay').onclick = () => MG.start();
    if (canNext) $('mg-next').onclick = () => { a.level++; el.level.textContent = CA.t('mgf.level', { l: a.level, n: a.def.levels }); showIntro(); };
    $('mg-exit2').onclick = () => MG.close();
    CA.UI.update(G, true);
  }

  MG.close = function () {
    cancelAnimationFrame(raf);
    MG.active = null;
    el.root.classList.add('hidden');
    CA.Game.inMinigame = false;
    CA.UI.update(CA.Game, true);
  };

  /* shared drawing helpers */
  MG.bg = function (g, w, h, tint = [20, 30, 70]) {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    gr.addColorStop(0, `rgb(${tint[0]},${tint[1]},${tint[2]})`); gr.addColorStop(1, '#02030a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = U.rng(5);
    g.fillStyle = 'rgba(220,230,255,0.6)';
    for (let i = 0; i < 140; i++) g.fillRect(r() * w, r() * h, r() < 0.9 ? 1 : 2, 1);
  };
  MG.glow = function (g, x, y, r, c, a) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`); rg.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  // a minigame can reveal a discovery; returns the reward-list line, or null if it was already known
  MG.discover = function (G, id) {
    const evs = CA.Evo.discover(G.state, id);
    if (!evs.length) return null;
    G.handleEvents(evs);
    return CA.t('mgf.discovery', { name: CA.DISCOVERY[id].name });
  };
  MG.matterReward = (s, mult) => CA.STAGE[s.stage].matterValue * CA.BAL.minigame.rewardMatterMotes * mult;
})(globalThis.CA = globalThis.CA || {});
