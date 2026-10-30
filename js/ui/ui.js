/* COSMIC ASCENSION — DOM interface: HUD, stage console, abilities, panels, menus, modals, toasts, tooltips. */
(function (CA) {
  'use strict';
  const U = CA.U, Econ = CA.Econ, Evo = CA.Evo, Bin = CA.Binary;
  const UI = (CA.UI = { panel: null });
  let G, el = {}, consoleStage = null, abilityStage = null, panelT = 0, fpsT = 0, frames = 0;
  let upTab = 'buy', codexTab = 'atlas', atlasSel = null, atlasScroll = 0, atlasSpinning = false;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const tr = CA.t;
  // in Korean, show the English name next to a translated one (codex)
  const origTag = (key) => (CA.I18n.lang === 'en' ? '' : ` <span class="muted small">${esc(CA.I18n.orig(key))}</span>`);

  UI.init = function (game) {
    G = game;
    el = { hud: $('hud'), res: $('res'), chapter: $('sb-chapter'), name: $('sb-name'), bar: $('sb-bar'), todo: $('sb-do'), nextStage: $('sb-next'), badgeUp: $('badge-up'), console: $('console'), abilities: $('abilities'), stagebox: $('stagebox'),
      toasts: $('toasts'), panel: $('panel'), panelBody: $('panel-body'), menu: $('menu'), modal: $('modal'), modalCard: $('modal-card'), cine: $('cine'), tip: $('tooltip'), fps: $('fps'),
      evbox: $('evbox'), evName: $('ev-name'), evPhase: $('ev-phase'), evProg: $('ev-prog'), evBar: $('ev-bar'), evHow: $('ev-how') };
    document.querySelectorAll('#topbtns [data-panel]').forEach((b) => (b.onclick = () => UI.togglePanel(b.dataset.panel)));
    document.querySelectorAll('#panel-tabs [data-tab]').forEach((b) => (b.onclick = () => UI.openPanel(b.dataset.tab)));
    $('panel-close').onclick = () => UI.closePanel();
    $('btn-pause').onclick = () => UI.togglePause();
    $('sb-help').onclick = () => stageCard(true);
    $('cine-skip').onclick = () => G.skipCinematic();
    $('m-continue').onclick = () => { if (G.continueGame()) CA.Audio.play('click'); };
    $('m-new').onclick = () => {
      if (CA.State.hasSave(G.storage)) confirmModal(tr('modal.newTitle'), tr('modal.newBody'), tr('modal.newOk'), () => G.newGame());
      else G.newGame();
    };
    $('m-settings').onclick = () => settingsModal();
    $('m-saves').onclick = () => savesModal();
    $('m-about').onclick = () => aboutModal();
    el.panelBody.addEventListener('click', onPanelClick);
    el.console.addEventListener('click', onConsoleClick);
    el.console.addEventListener('click', (e) => { if (e.target.closest('.c-more')) { el.console.classList.toggle('collapsed'); consoleMore(); } });
    el.console.addEventListener('input', (e) => { if (e.target.id === 'c-comp') G.setCompression(parseFloat(e.target.value)); if (e.target.id === 'c-xfer') G.setValve(parseFloat(e.target.value)); });
    el.abilities.addEventListener('click', (e) => { const b = e.target.closest('[data-ab]'); if (b) G.useAbility(b.dataset.ab); });
    el.modal.addEventListener('click', (e) => { if (e.target === el.modal && !el.modal.dataset.locked) closeModal(); });
    // tooltips
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t) { el.tip.innerHTML = t.dataset.tip; el.tip.classList.add('on'); } else el.tip.classList.remove('on');
    });
    document.addEventListener('mousemove', (e) => {
      if (!el.tip.classList.contains('on')) return;
      const x = Math.min(e.clientX + 14, window.innerWidth - el.tip.offsetWidth - 8), y = Math.min(e.clientY + 16, window.innerHeight - el.tip.offsetHeight - 8);
      el.tip.style.left = x + 'px'; el.tip.style.top = y + 'px';
    });
    CA.MG.initDom();
  };

  /* ---------------- screens ---------------- */
  UI.showMenu = function () {
    el.menu.classList.remove('hidden'); el.hud.classList.add('hidden'); UI.closePanel(); closeModal();
    $('m-continue').disabled = !CA.State.hasSave(G.storage);
  };
  UI.enterGame = function () { el.menu.classList.add('hidden'); el.hud.classList.remove('hidden'); closeModal(); consoleStage = null; abilityStage = null; UI.update(G, true); };

  UI.toast = function (text, type = 'info') {
    const d = document.createElement('div');
    d.className = 'toast ' + type; d.textContent = text;
    el.toasts.prepend(d);
    while (el.toasts.children.length > 4) el.toasts.lastChild.remove();
    const life = type === 'discovery' || type === 'stage' ? 8000 : type === 'warn' ? 6000 : 4500;
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 450); }, life);
  };

  UI.stageChanged = function () { consoleStage = null; abilityStage = null; if (UI.panel) renderPanel(true); };
  // after a language switch: rebuild everything that was rendered as text only once
  UI.refreshLang = function () { UI.stageChanged(); if (G && !G.menu) UI.update(G, true); };

  /* ---------------- per-tick update ---------------- */
  UI.update = function (game, force) {
    if (G.settings.showFps) { frames++; const now = performance.now(); if (now - fpsT > 1000) { el.fps.textContent = frames + ' fps'; frames = 0; fpsT = now; } el.fps.classList.remove('hidden'); }
    else el.fps.classList.add('hidden');
    if (G.menu) return;
    const s = G.state, d = CA.STAGE[s.stage];
    renderRes(s);
    el.chapter.textContent = CA.CHAPTERS[d.chapter].name + (s.cycle > 1 ? tr('ui.cycle', { n: s.cycle }) : '');
    el.name.textContent = d.name;
    el.bar.style.width = (Evo.progress(s) * 100).toFixed(1) + '%';
    const todo = tr(CA.Guide.next(s)), after = CA.Guide.nextStage(s);
    if (el.todo.textContent !== todo) el.todo.textContent = todo;
    el.nextStage.textContent = tr('ui.nextStage', { s: after ? CA.STAGE[after].name : tr('ui.newCycle') });
    const canBuy = CA.Guide.affordable(s);
    el.badgeUp.classList.toggle('hidden', !canBuy); el.badgeUp.textContent = canBuy;
    renderEvent(s);
    if (consoleStage !== s.stage) { el.console.innerHTML = consoleHTML(s, d) + `<button class="c-more"></button>`; consoleMore(); consoleStage = s.stage; }
    consoleUpdate(s, d);
    if (abilityStage !== s.stage) { renderAbilities(s, d); abilityStage = s.stage; }
    updateAbilities(s, d);
    maybeStageCard(s);
    if (window.innerWidth <= 760) viewY = (el.stagebox.getBoundingClientRect().bottom + el.console.getBoundingClientRect().top) / 2;
    panelT -= 0.1;
    if (UI.panel && (force || panelT <= 0)) { panelT = 1; renderPanel(false); }
  };

  let viewY = 0;
  UI.viewCentreY = (sz) => (sz.w <= 760 && viewY ? viewY : sz.h / 2);

  function consoleMore() { const b = el.console.querySelector('.c-more'); if (b) b.textContent = tr(el.console.classList.contains('collapsed') ? 'ui.details' : 'ui.less'); }

  /* ---------------- stage card: explains each stage the first time it is reached ---------------- */
  function maybeStageCard(s) {
    if (!G.settings.tutorials || s.seen['guide:' + s.stage] || G.paused || CA.MG.active) return;
    if (CA.FX.cine || G.cineQueue.length || !el.modal.classList.contains('hidden')) return; // cinematics and choices go first
    stageCard(false);
  }
  function stageCard(again) {
    const s = G.state, d = CA.STAGE[s.stage], shown = again ? d.abilities : CA.Guide.newAbilities(d.id);
    s.seen['guide:' + d.id] = true;
    G.paused = true; G.input.down = false;
    const abilities = shown.map((id) => { const a = CA.ABILITIES[id]; return `<li><b>${esc(a.name)}</b> <kbd>${id === 'well' ? tr('ab.lmb') : a.key}</kbd><br><span class="muted">${esc(a.desc)}</span></li>`; }).join('');
    openModal(`<div class="card-kicker">${esc(CA.CHAPTERS[d.chapter].name)}</div><h2>${esc(d.name)}</h2>
      <p>${esc(d.objective)}</p>
      <div class="goal"><span>${tr('ui.goal')}</span>${esc(d.goal)}</div>
      ${abilities ? `<h3>${tr(again ? 'ui.abilities' : 'ui.newAbilities')}</h3><ul class="ablist">${abilities}</ul>` : ''}
      <p class="muted small">${esc(d.science.split('. ')[0])}.</p>
      <div class="row"><button class="btn primary" id="sc-ok">${tr('ui.gotIt')}</button>${again ? '' : `<button class="btn ghost" id="sc-off">${tr('ui.cardsOff')}</button>`}</div>`);
    $('sc-ok').onclick = () => closeModal();
    if (!again) $('sc-off').onclick = () => { G.settings.tutorials = false; CA.State.saveSettings(G.settings, G.storage); closeModal(); };
    $('sc-ok').focus();
  }
  UI.stageCard = stageCard;

  /* ---------------- cosmic events: banner under the stage box + toasts ---------------- */
  function renderEvent(s) {
    const st = CA.Events.status(s);
    el.evbox.classList.toggle('hidden', !st);
    if (!st) return;
    el.evbox.classList.toggle('alert', st.alert);
    el.evbox.classList.toggle('warn', st.phase === 'warn');
    el.evName.textContent = st.name; el.evPhase.textContent = st.phaseText;
    el.evProg.textContent = st.progress; el.evHow.textContent = st.how;
    el.evBar.style.width = (st.frac * 100).toFixed(1) + '%';
  }
  // first sighting of an event type also explains the science (if tutorial hints are on)
  UI.eventToast = function (def, first) {
    UI.toast('⚠ ' + def.name + ' — ' + def.warnText + (first && G.settings.tutorials ? ' ' + def.science : ''), first ? 'discovery' : 'event');
  };

  const RES = ['matter', 'energy', 'heavy', 'research', 'remnants']; // names: Econ.RES_NAMES, tooltips: 'restip.<k>'
  let resHTML = '';
  function renderRes(s) {
    const r = Econ.rates(s), cap = Econ.energyCap(s);
    let html = '';
    for (const k of RES) {
      const name = Econ.RES_NAMES[k], tip = tr('restip.' + k);
      if (k === 'heavy' && !s.reached.aggregate && s.res.heavy <= 0) continue;
      if (k === 'research' && s.res.research <= 0 && !s.stats.motes) continue;
      if (k === 'remnants' && s.res.remnants <= 0 && CA.STAGE[s.stage].chapter < 4) continue;
      const rate = r[k] > 0 ? '+' + U.fmt(r[k]) + '/s' : '';
      html += `<div class="res-row" data-tip="<b>${name}</b>${rate ? ' ' + rate : ''}<br>${tip}"><span class="dot" style="background:var(--${k === 'remnants' ? 'remnant' : k})"></span><span class="nm">${name}</span><span class="val res-${k}">${U.fmt(s.res[k])}${k === 'energy' ? `<small> / ${U.fmt(cap)}</small>` : ''}</span>`;
      if (k === 'energy') html += `<div class="ebar"><div style="width:${Math.min(100, (s.res.energy / cap) * 100)}%"></div></div>`;
      html += '</div>';
    }
    if (s.buffs.length) html += `<div class="res-buffs">${s.buffs.map((b) => esc(CA.I18n.has('buff.' + b.id) ? tr('buff.' + b.id) : b.name) + ' ' + Math.ceil(b.t) + 's').join(' · ')}</div>`;
    if (html !== resHTML) { el.res.innerHTML = html; resHTML = html; }
  }

  /* ---------------- abilities ---------------- */
  function renderAbilities(s, d) {
    el.abilities.innerHTML = d.abilities.map((id) => {
      const a = CA.ABILITIES[id];
      if (id === 'well') return `<div class="ab glass passive" data-tip="<b>${a.name}</b><br>${a.desc}<br>${tr('ab.drain', { n: CA.BAL.energy.wellDrain })}"><span class="key">${tr('ab.lmb')}</span><span class="nm">${a.name}</span><span class="cost">${tr('ab.hold')}</span></div>`;
      return `<button class="ab btn glass" data-ab="${id}" data-tip="<b>${a.name}</b> [${a.key}]<br>${a.desc}<br>${tr('ab.costcd', { cost: a.cost, cd: a.cd })}"><span class="key">${a.key}</span><span class="nm">${a.name}</span><span class="cost">${a.cost ? a.cost + ' ⚡' : tr('ab.free')}</span><span class="cd"></span></button>`;
    }).join('');
  }
  function updateAbilities(s) {
    el.abilities.querySelectorAll('[data-ab]').forEach((b) => {
      const id = b.dataset.ab, a = CA.ABILITIES[id], st = G.abilityState(id);
      b.disabled = !st.ok;
      const cd = s.cd[id] || 0;
      b.querySelector('.cd').style.height = (cd > 0 ? (cd / a.cd) * 100 : 0) + '%';
    });
  }

  /* ---------------- stage console ---------------- */
  const kv = (rows) => `<div class="kv">${rows.map(([k, key]) => `<span>${k}</span><span data-k="${key}">—</span>`).join('')}</div>`;
  const meter = (id, left, right) => `<div class="meter" id="${id}"><div class="band"></div><div class="needle"></div></div><div class="meter-labels"><span>${left}</span><span>${right}</span></div>`;

  function consoleHTML(s, d) {
    let h = '';
    switch (d.type) {
      case 'mass': case 'planet':
        h = `<h4>${d.name}</h4>` + kv([[tr('con.mass'), 'mass'], [tr('con.prog'), 'prog'], [tr('con.gain'), 'gain'], [tr('con.growth'), 'growth']]);
        if (d.swarm) h += kv([[tr('con.swarm'), 'swarm']]);
        if (d.frag) h += kv([[tr('con.frag'), 'frag']]);
        if (d.zoneChoice || d.type === 'planet') h += kv([[tr('con.zone'), 'zone']]);
        if (d.type === 'planet') h += kv([[tr('con.ptype'), 'ptype']]) + `<div class="actions"><button class="btn gold" id="c-adv" data-act="advance">${tr('btn.finalize')}</button></div>`;
        h += `<p class="note">${esc(d.goal)}</p>`;
        break;
      case 'jeans':
        h = `<h4>${tr('con.cloudCore')}</h4>` + kv([[tr('con.coreMass'), 'cm'], [tr('con.jeans'), 'mj'], [tr('con.temp'), 'T'], [tr('con.density'), 'n']]) + meter('m-jeans', tr('con.stable'), tr('con.collapses100')) +
          `<div class="fate" data-k="fate"></div><div class="actions"><button class="btn gold" id="c-adv" data-act="advance">${tr('btn.collapse')}</button></div>
          <p class="note">${tr('con.jeansNote')}</p>`;
        break;
      case 'protostar':
        h = `<h4>${d.name}</h4>` + kv([[tr('con.mass'), 'm'], [tr('con.coreTemp'), 'tc'], [tr('con.futureType'), 'spec'], [tr('con.msLife'), 'life']]) + meter('m-tc', '1 MK', tr('con.ignition10')) +
          `<div class="fate" data-k="fate"></div><div class="actions"><button class="btn gold" id="c-adv" data-act="advance">${tr('btn.ignite')}</button></div>
          <p class="note">${tr('con.protoNote')}</p>`;
        break;
      case 'mainseq':
        h = `<h4>${tr('con.msStar')} <span data-k="spec"></span></h4>` + kv([[tr('con.coreH'), 'fuel'], [tr('con.mass'), 'm'], [tr('con.lum'), 'L'], [tr('con.surfT'), 'teff'], [tr('con.lifeReal'), 'life'], [tr('con.age'), 'age'], [tr('con.eout'), 'eout']]) +
          `<div style="margin-top:8px" data-tip="${tr('con.pgTip')}">${tr('con.pgBalance')}</div>` + meter('m-pg', tr('con.gravWins'), tr('con.pressWins')) +
          `<label class="small" data-tip="${tr('con.compTip')}">${tr('con.comp')} <b data-k="comp"></b><input type="range" id="c-comp" min="0.6" max="1.6" step="0.01"></label>
          <div class="fate" data-k="fate"></div>`;
        break;
      case 'timed':
        if (d.id === 'supergiant') {
          h = `<h4>${tr('con.rsg')} <span data-k="wr"></span></h4><div class="onion" id="c-onion">${Evo.Star.SG_BURNS.map((b, i) => `<div data-i="${i}"><span>${b.name}</span><span class="ob"><i></i></span><span class="muted">${b.real}</span></div>`).join('')}</div>` +
            kv([[tr('con.massNow'), 'm'], [tr('con.m0'), 'm0'], [tr('con.loss'), 'loss'], [tr('con.z'), 'z']]) +
            `<div class="actions"><button class="btn" id="c-wind" data-act="wind">${tr('con.winds', { s: tr('con.off') })}</button></div><div class="fate" data-k="fate"></div>
            <p class="note">${tr('con.sgNote')}</p>`;
        } else if (d.collectAtCursor) {
          h = `<h4>${d.name}</h4>` + kv([[tr('con.timeLeft'), 'left'], [tr('con.heavy'), 'hv']]) + `<p class="note">${esc(d.objective)}</p>`;
        } else {
          h = `<h4>${d.name}</h4>` + kv([[tr('con.phaseLeft'), 'left'], [tr('con.radius'), 'rad'], [tr('con.mass'), 'm'], [tr('con.yourPlanet'), 'pl']]) +
            (d.id === 'agb' ? `<p class="note">${tr('con.agbNote')}</p>` : `<p class="note">${tr('con.giantNote')}</p>`);
        }
        break;
      case 'remnant': {
        const r = s.remnant;
        if (r.type === 'snr') h = `<h4>${d.name}</h4>` + kv([[tr('con.snrAge'), 'age'], [tr('con.snrShell'), 'shell']]) + `<p class="note">${tr('con.snrNote')}</p>`;
        else if (r.type === 'wd') h = `<h4>${tr('con.wd')} <span data-k="kind"></span></h4>` + kv([[tr('con.surfT'), 'T'], [tr('con.mass'), 'm'], [tr('con.crystBelow'), 'cr'], [tr('con.thermOut'), 'eout']]) + meter('m-cool', tr('con.hot'), tr('con.crystallized'));
        else if (r.type === 'ns') h = `<h4>${tr('con.nsTitle')} ${r.magnetar ? tr('con.magnetar') : ''}</h4>` + kv([[tr('con.streak'), 'streak'], [tr('con.mass'), 'm'], [tr('con.spin'), 'P'], [tr('con.bfield'), 'B'], [tr('con.spindown'), 'eout']]) + `<p class="note">${tr('con.nsNote')}</p>`;
        else h = `<h4>${tr('con.bh')}</h4>` + kv([[tr('con.edd'), 'edd'], [tr('con.mass'), 'm'], [tr('con.rs'), 'rs'], [tr('con.eff'), 'eff']]) + meter('m-edd', tr('con.calm'), tr('con.eddLimit')) +
          `<p class="note">${tr('con.bhNote')}</p>`;
        h += binaryHTML(s, d) + `<div class="fate" data-k="cycle"></div><div class="actions"><button class="btn gold" id="c-cycle" data-act="cycle">${tr('btn.cycle')}</button></div>`;
        return h;
      }
      case 'inspiral':
        h = `<h4>${d.name}</h4>` + kv([[tr('bin.snr'), 'snr'], [tr('bin.hits'), 'hits'], [tr('bin.pair'), 'pair'], [tr('bin.mc'), 'mc'], [tr('bin.tau'), 'tau'], [tr('bin.freq'), 'f']]) + meter('m-snr', '0', 'SNR ' + CA.BAL.binary.chirp.snrMax) + `<p class="note">${tr('bin.insNote')}</p>`;
        break;
    }
    return h + binaryHTML(s, d);
  }

  /* The companion's box: shown in every stage while there is one. */
  function binaryHTML(s, d) {
    const c = s.companion;
    if (!c) return '';
    let h = `<div class="binbox"><b>${tr('bin.title')}</b>` + kv([[tr('bin.status'), 'b-st'], [tr('bin.body'), 'b-body']]);
    if (Bin.DONORS.includes(d.id) && !c.ended) h += kv([[tr('bin.radius'), 'b-rad'], [tr('bin.lobe'), 'b-lobe'], [tr('bin.fed'), 'b-fed']]) + meter('m-xfer', tr('bin.low'), tr('bin.high')) +
      `<label class="small" data-tip="${tr('bin.valveTip')}">${tr('bin.valve')} <b data-k="b-valve"></b><input type="range" id="c-xfer" min="0" max="1" step="0.01"></label>`;
    if (d.type === 'remnant' && d.next.length) h += `<div class="actions"><button class="btn gold" id="c-adv" data-act="advance">${tr('btn.inspiral')}</button></div>`;
    return h + '</div>';
  }
  function binaryUpdate(s, d) {
    const c = s.companion;
    if (!c) return;
    set('b-body', tr('evo.r.' + c.type) + ' ' + U.fmtMsun(c.mass) + (c.type === 'ns' ? ' · ' + (c.P * 1000).toFixed(1) + ' ms' : ''));
    let st = 'bin.stWait';
    if (d.type === 'remnant') st = 'bin.stDouble';
    else if (Bin.DONORS.includes(d.id)) st = c.ended ? 'bin.stEnded' : !Bin.transferring(s) ? 'bin.stDetached' : { low: 'bin.stLow', ok: 'bin.stOk', high: 'bin.stHigh' }[Bin.bandOf(c.x)];
    set('b-st', tr(st));
    if (!$('c-xfer')) return;
    const B = CA.BAL.binary, input = $('c-xfer');
    set('b-rad', Math.round(s.star.rg) + ' R☉'); set('b-lobe', Math.round(Bin.lobe(s)) + ' R☉'); set('b-fed', '+' + c.gained.toFixed(3) + ' M☉' + (c.type === 'wd' ? ' → ' + B.chandra + ' M☉' : ''));
    set('b-valve', Math.round(c.valve * 100) + '%');
    if (document.activeElement !== input) input.value = c.valve;
    setMeter('m-xfer', c.x / 2, [B.band[0] / 2, B.band[1] / 2]);
  }

  function set(key, v) { const n = el.console.querySelector(`[data-k="${key}"]`); if (n && n.innerHTML !== String(v)) n.innerHTML = v; }
  function setMeter(id, frac, band) {
    const m = $(id); if (!m) return;
    m.querySelector('.needle').style.left = (U.clamp(frac, 0, 1) * 100).toFixed(1) + '%';
    const b = m.querySelector('.band');
    if (band) { b.style.left = band[0] * 100 + '%'; b.style.width = (band[1] - band[0]) * 100 + '%'; } else b.style.width = '0';
  }
  function fateText(pred) { return tr('fate.predicted') + `${esc(pred.label)}<br><span class="muted">${esc(pred.path)}</span>`; }

  function consoleUpdate(s, d) {
    const Star = Evo.Star, adv = $('c-adv');
    if (adv) { const c = Evo.canAdvance(s); adv.disabled = !c.ok; adv.dataset.tip = c.ok ? tr('con.ready') : esc(c.reason); }
    binaryUpdate(s, d);
    switch (d.type) {
      case 'inspiral': {
        const c = s.chirp, t = s.stageTime, snr = Bin.snr(c);
        set('pair', tr('bin.pairV', { a: tr('evo.r.' + c.a.type) + ' ' + U.fmtMsun(c.a.mass), b: tr('evo.r.' + c.b.type) + ' ' + U.fmtMsun(c.b.mass) }));
        set('mc', U.fmtMsun(c.Mc)); set('tau', Bin.tau(c, t).toFixed(1) + ' s'); set('f', Bin.freq(c, t).toFixed(2)); set('hits', tr('bin.hitsV', { h: c.hits, n: c.N, f: c.falses })); set('snr', snr.toFixed(1));
        setMeter('m-snr', snr / CA.BAL.binary.chirp.snrMax, [CA.BAL.binary.chirp.snrDetect / CA.BAL.binary.chirp.snrMax, 1]);
        break;
      }
      case 'mass': case 'planet': {
        set('mass', U.fmtMass(s.mass)); set('prog', Math.round(Evo.progress(s) * 100) + '%');
        let g = d.gain * (1 + 0.08 * Econ.lvl(s, 'accretion')) * (s.fx.boost > 0 ? 1.5 : 1) * (d.runaway ? 1 + 0.6 * Evo.progress(s) : 1) * (s.zone === 'outer' ? 1.3 : 1);
        set('gain', tr('con.gainV', { n: (g * 100).toFixed(1) }));
        set('growth', Econ.rates(s).growth > 0 ? '+' + (Econ.rates(s).growth * 100).toFixed(2) + '%/s' : '<span class="muted">' + tr('con.buyCoag') + '</span>');
        if (d.swarm) set('swarm', s.swarmDone ? '<span class="ok">' + tr('con.swarmDone') + '</span>' : tr('con.swarmV', { n: G.world.swarmCount, c: d.swarm.count, t: s.swarmT.toFixed(1), h: d.swarm.hold }));
        if (d.frag) set('frag', Math.round(G.simCtx.fragSpeed) + ' px/s');
        if (d.zoneChoice || d.type === 'planet') set('zone', s.zone ? tr(s.zone === 'inner' ? 'con.inner' : 'con.outer') : '<button class="btn small" data-act="zone">' + tr('con.choose') + '</button>');
        if (d.type === 'planet') set('ptype', CA.PLANET_TYPES[Evo.planetType(s)].name);
        break;
      }
      case 'jeans': {
        const mj = Evo.coreJeans(s), ratio = s.core.M / mj;
        set('cm', U.fmtMsun(s.core.M)); set('mj', U.fmtMsun(mj)); set('T', s.core.T.toFixed(1) + ' K'); set('n', U.fmtSci(Evo.coreDensity(s), 1) + ' cm⁻³');
        setMeter('m-jeans', ratio, [0.999, 1]);
        const M0 = Evo.starMassFromCore(s);
        set('fate', tr('con.starIfNow', { m: U.fmtMsun(M0) }) + fateText(Star.predict(M0, s.Z)));
        break;
      }
      case 'protostar': {
        set('m', U.fmtMsun(s.star.M)); set('tc', s.star.Tc.toFixed(2) + ' MK');
        set('spec', tr('con.specV', { s: Star.spectral(Star.Teff(s.star.M)), t: Math.round(Star.Teff(s.star.M)) })); set('life', U.fmtYears(Star.lifetimeYr(s.star.M)));
        setMeter('m-tc', s.star.Tc / 10);
        set('fate', fateText(Star.predict(s.star.M, s.Z)));
        break;
      }
      case 'mainseq': {
        const st = s.star, M0 = st.M0, T = Star.Teff(M0);
        set('spec', tr('con.specShort', { s: Star.spectral(T) })); set('m', U.fmtMsun(M0)); set('L', U.fmt(Star.L(M0)) + ' L☉'); set('teff', Math.round(T) + ' K');
        set('life', U.fmtYears(Star.lifetimeYr(M0))); set('age', U.fmtYears(st.age)); set('fuel', Math.round(st.fuel * 100) + '%');
        set('eout', tr('con.eoutEff', { e: U.fmt(Evo.energyProduction(s) * Econ.mult(s, 'energy')), p: Math.round(Evo.pgEfficiency(st.pg) * 100) }));
        setMeter('m-pg', (st.pg - 0.5) / 1, [0.4, 0.6]);
        const n = $('m-pg').querySelector('.needle'); n.style.background = Math.abs(st.pg - 1) < 0.1 ? 'var(--ok)' : Math.abs(st.pg - 1) < 0.25 ? 'var(--warn)' : 'var(--bad)';
        const c = $('c-comp'); if (c && document.activeElement !== c) c.value = st.comp;
        set('comp', Math.round(st.comp * 100) + '%');
        let pred = Star.predict(M0, s.Z);
        if (M0 < CA.BAL.star.lowMassLimit) pred = Object.assign({}, pred, { path: pred.path + tr('con.redDwarfNote') });
        set('fate', fateText(pred));
        break;
      }
      case 'timed': {
        const left = Math.max(0, d.duration - s.stageTime);
        if (d.id === 'supergiant') {
          const st = s.star;
          let t = s.stageTime;
          $('c-onion').querySelectorAll('[data-i]').forEach((row, i) => {
            const dur = Star.SG_BURNS[i].dur, f = U.clamp(t / dur, 0, 1); t -= dur;
            row.className = f >= 1 ? 'done' : i === st.burn ? 'now' : '';
            row.querySelector('i').style.width = (f * 100).toFixed(0) + '%';
          });
          set('wr', st.wr ? tr('con.wr') : ''); set('m', U.fmtMsun(st.M)); set('m0', U.fmtMsun(st.M0));
          set('loss', ((Star.windBase(st.M, s.Z) + (st.wind ? Star.windOn : 0)) * 100).toFixed(2) + '%/s'); set('z', s.Z.toFixed(3));
          const w = $('c-wind'); w.textContent = tr('con.winds', { s: tr(st.wind ? 'con.on' : 'con.off') }); w.classList.toggle('gold', st.wind);
          const proj = st.M * (1 - Star.windBase(st.M, s.Z) * left) - (st.wind ? st.M * Star.windOn * left : 0);
          set('fate', tr('con.proj', { m: U.fmtMsun(Math.max(st.M * 0.25, proj)) }) + fateText(Star.predict(st.M0, s.Z, Math.max(st.M * 0.25, proj))));
        } else if (d.collectAtCursor) {
          set('left', left.toFixed(0) + ' s'); set('hv', U.fmt(s.res.heavy));
        } else {
          set('rad', Math.round(s.star.rg) + ' R☉ (' + (s.star.rg / 215).toFixed(2) + ' AU)'); set('m', U.fmtMsun(s.star.M)); set('left', left.toFixed(0) + ' s');
          const p = s.planet;
          set('pl', !p ? tr('con.none') : p.engulfed ? '<span class="bad">' + tr('con.engulfed') + '</span>' : tr('con.orbitV', { a: (Evo.planetOrbitRsun(s) / 215).toFixed(2) }));
        }
        break;
      }
      case 'remnant': {
        const r = s.remnant;
        set('m', U.fmtMsun(r.mass));
        if (r.type === 'snr') { const yr = Bin.snrAgeYr(r.age); set('age', U.fmtYears(yr)); set('shell', Bin.snrRadius(yr).toFixed(1) + ' pc'); }
        else if (r.type === 'wd') {
          set('kind', tr(r.helium ? 'con.wdHe' : r.polluted ? 'con.wdPol' : 'con.wdCO'));
          set('T', Math.round(r.T) + ' K'); set('cr', Math.round(Evo.crystalT(r.mass)) + ' K' + (r.crystal ? ' <span class="ok">✓</span>' : ''));
          set('eout', U.fmt(Evo.energyProduction(s) * Econ.mult(s, 'energy')) + ' ⚡/s');
          setMeter('m-cool', U.clamp(Math.log(1e5 / r.T) / Math.log(1e5 / Evo.crystalT(r.mass)), 0, 1));
        } else if (r.type === 'ns') {
          set('P', (r.P * 1000).toFixed(1) + ' ms'); set('B', U.fmtSci(r.B, 1) + ' G'); set('streak', r.streak + ' (' + r.best + ')');
          set('eout', U.fmt(Evo.energyProduction(s) * Econ.mult(s, 'energy')) + ' ⚡/s');
        } else {
          set('rs', U.fmt(2.95 * r.mass) + ' km'); set('eff', [6, 14, 23, 32, 42][Econ.lvl(s, 'p_kerr')] + '%');
          const e = r.accr / Evo.eddington(s); set('edd', Math.round(e * 100) + '%' + (e > 1 ? ' <span class="bad">' + tr('con.superEdd') + '</span>' : ''));
          setMeter('m-edd', e / 1.4, [0, 1 / 1.4]);
        }
        const rw = Evo.cycleReward(s), ok = Evo.canNewCycle(s), b = $('c-cycle');
        b.disabled = !ok;
        set('cycle', tr('con.cycleV', { r: rw.remnants, z0: s.Z.toFixed(3), z1: Math.min(CA.BAL.cycle.zMax, s.Z + rw.z).toFixed(3), avail: ok ? '' : tr('con.availIn', { n: Math.ceil(20 - s.stageTime) }) }));
        break;
      }
    }
  }

  function onConsoleClick(e) {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'advance') G.advance();
    else if (act === 'zone') UI.showZoneChoice();
    else if (act === 'wind') G.setWind(!G.state.star.wind);
    else if (act === 'cycle') {
      cycleModal();
    }
  }

  /* ---------------- panels ---------------- */
  UI.togglePanel = function (tab) { if (UI.panel === tab) UI.closePanel(); else UI.openPanel(tab); };
  UI.openPanel = function (tab) {
    if (G.menu) return;
    UI.panel = tab; el.panel.classList.remove('hidden');
    document.querySelectorAll('#panel-tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    renderPanel(true);
  };
  UI.closePanel = function () { UI.panel = null; el.panel.classList.add('hidden'); };

  function renderPanel(full) {
    const s = G.state;
    if (UI.panel === 'upgrades') {
      if (full || !el.panelBody.querySelector('.upg')) el.panelBody.innerHTML = upgradesHTML(s);
      el.panelBody.querySelectorAll('.upg').forEach((card) => {
        const id = card.dataset.id, def = CA.UPGRADE[id], l = Econ.lvl(s, id), chk = Econ.canBuy(s, id);
        card.querySelector('.lv').textContent = tr('up.lv', { l, m: def.max });
        card.querySelector('.fx').textContent = l ? tr('up.now', { fx: def.fx(l) + (l < def.max ? ' → ' + def.fx(l + 1) : '') }) : tr('up.next', { fx: def.fx(1) });
        const btn = card.querySelector('.btn');
        if (l >= def.max) { btn.textContent = tr('up.maxed'); btn.disabled = true; }
        else { btn.innerHTML = U.fmt(Econ.cost(def, l)) + ` <span class="res-${def.res}">${tr('resab.' + def.res)}</span>`; btn.disabled = !chk.ok; }
        btn.dataset.tip = chk.ok ? tr('up.buy') : esc(chk.reason);
        card.classList.toggle('locked', !Econ.unlocked(s, def));
        card.classList.toggle('hidden', upTab === 'buy' ? !chk.ok : (upTab === 'perm') !== !!def.perm);
      });
      el.panelBody.querySelectorAll('.ugroup').forEach((g) => g.classList.toggle('hidden', !g.querySelector('.upg:not(.hidden)')));
      el.panelBody.querySelectorAll('.subtabs [data-id]').forEach((b) => b.classList.toggle('on', b.dataset.id === upTab));
      const empty = $('up-empty'), nearest = upTab === 'buy' && !el.panelBody.querySelector('.upg:not(.hidden)') && CA.Guide.nearest(s);
      empty.classList.toggle('hidden', !nearest);
      if (nearest) empty.innerHTML = tr('up.nearest', { name: esc(nearest.def.name), n: U.fmt(nearest.cost), res: Econ.RES_NAMES[nearest.def.res] });
    } else if (UI.panel === 'evolution') el.panelBody.innerHTML = evolutionHTML(s);
    else if (UI.panel === 'minigames') el.panelBody.innerHTML = minigamesHTML(s);
    else if (UI.panel === 'achievements') el.panelBody.innerHTML = achievementsHTML(s);
    else if (UI.panel === 'guide' && full) el.panelBody.innerHTML = guideHTML(s, true);
    else if (UI.panel === 'codex' && full) { el.panelBody.innerHTML = codexHTML(s); drawAtlas(s); }
  }

  function upgradesHTML(s) {
    const cats = {};
    for (const u of CA.UPGRADES) (cats[u.cat] = cats[u.cat] || []).push(u);
    const card = (u) => `<div class="upg" data-id="${u.id}"><span class="nm">${esc(u.name)} <span class="lv"></span></span>
      <button class="btn small" data-act="buy" data-id="${u.id}"></button>
      <span class="ds">${esc(u.desc)}${!Econ.unlocked(s, u) ? ` <span class="warnc">${tr('up.unlocks', { s: u.req === 'remnant' ? tr('up.aRemnant') : CA.STAGE[u.req].name })}</span>` : ''}</span><span class="fx"></span></div>`;
    const tab = (id) => `<button data-act="utab" data-id="${id}">${tr('up.tab.' + id)}</button>`;
    let h = `<div class="subtabs">${tab('buy')}${tab('all')}${tab('perm')}</div><p class="empty hidden" id="up-empty"></p>`;
    for (const c in cats) h += `<section class="ugroup"><h3>${tr('ucat.' + c)}</h3>${cats[c].map(card).join('')}</section>`;
    h += `<section class="ugroup"><h3>${tr('ucat.Permanent')}</h3><p class="muted small">${tr('up.head')}</p>${CA.PERM_UPGRADES.map(card).join('')}</section>`;
    return h;
  }

  /* The guide tab, and the same pages from the main menu. */
  function guideHTML(s, inGame) {
    const row = (k, v) => `<div class="gd-row"><b>${k}</b><span>${v}</span></div>`;
    const chapter = s ? CA.STAGE[s.stage].chapter : 0;
    const road = [1, 2, 3, 4].map((c) => `<li class="${c === chapter ? 'now' : c < chapter ? 'done' : ''}"><b>${esc(CA.CHAPTERS[c].name)}</b><span>${tr('gd.ch' + c)}</span></li>`).join('');
    return `${inGame ? `<button class="btn primary wide" data-act="stagecard">${tr('gd.again')}</button>` : ''}
      <p>${tr('gd.intro')}</p><ol class="road">${road}</ol><p>${tr('gd.cycle')}</p>
      <h3>${tr('gd.h.controls')}</h3>${row(tr('ab.lmb'), tr('gd.c.well'))}${row('1 – 5', tr('gd.c.ab'))}${row('Space', tr('gd.c.space'))}${row('Esc', tr('gd.c.esc'))}
      <h3>${tr('gd.h.res')}</h3>${['matter', 'energy', 'heavy', 'research', 'remnants'].map((k) => row(`<span class="res-${k}">${Econ.RES_NAMES[k]}</span>`, tr('gd.r.' + k))).join('')}
      <h3>${tr('gd.h.menus')}</h3>${['upgrades', 'evolution', 'minigames', 'codex', 'ach'].map((k) => row(tr('top.' + k), tr('gd.m.' + k))).join('')}
      <h3>${tr('gd.h.goal')}</h3><p>${tr('gd.goal')}</p>
      <h3>${tr('about.sci')}</h3><p class="muted">${tr('about.sciText')}</p>`;
  }

  function originsHTML(s) {
    return '<div class="origins">' + Bin.ORIGINS.map((id) => {
      const name = esc(tr('org.' + id + '.name'));
      return s.origins[id] ? `<div class="found" data-tip="${esc(tr('org.' + id + '.desc'))}"><b>${name}</b><br><span>${tr('org.' + id + '.el')}</span></div>` : `<div class="unk"><b>${name}</b><br><span>${esc(tr('org.' + id + '.how'))}</span></div>`;
    }).join('') + '</div>';
  }

  function evolutionHTML(s) {
    const chip = (id) => `<span class="chip ${s.stage === id ? 'now' : s.reached[id] ? 'reached' : s.discovered['stage:' + id] ? 'reached' : ''}">${CA.STAGE[id].name}</span>`;
    const line = (ids) => `<div class="chips">${ids.map(chip).join('<span class="muted">→</span>')}</div>`;
    let h = `<h3>${tr('org.title', { n: Bin.ORIGINS.filter((k) => s.origins[k]).length, t: Bin.ORIGINS.length })}</h3><p class="muted small">${tr('org.head')}</p>` + originsHTML(s);
    if (s.ended) h += `<div class="row"><button class="btn small" data-act="ending">${tr('evo.replayEnd')}</button></div>`;
    h += `<h3>${tr('evo.ch12')}</h3>` + line(['grain', 'cluster', 'core', 'aggregate', 'pebble', 'planetesimal', 'protoplanet', 'planet']);
    h += `<p class="muted small">${tr('evo.planetNote')}</p>`;
    h += `<h3>${tr('evo.ch34')}</h3>` + line(['protostar', 'mainseq']);
    h += `<div class="branch"><b>${tr('evo.b1')}</b><br>${line(['whitedwarf'])}<span class="muted small">${tr('evo.b1n')}</span></div>`;
    h += `<div class="branch"><b>${tr('evo.b2')}</b><br>${line(['redgiant', 'agb', 'pnebula', 'whitedwarf'])}<span class="muted small">${tr('evo.b2n')}</span></div>`;
    h += `<div class="branch"><b>${tr('evo.b3')}</b><br>${line(['supergiant', 'supernova', 'neutronstar'])}${line(['supergiant', 'supernova', 'blackhole'])}${line(['supergiant', 'blackhole'])}<span class="muted small">${tr('evo.b3n')}</span></div>`;
    h += `<div class="branch"><b>${tr('evo.binary')}</b><br>${line(['inspiral', 'merger'])}<span class="muted small">${tr('evo.binaryN')}</span></div>`;
    if (s.star) h += `<div class="sci">${fateText(Evo.Star.predict(s.star.M0 || s.star.M, s.Z, s.stage === 'supergiant' ? s.star.M : undefined))}</div>`;
    else if (s.stage === 'core') h += `<div class="sci">${fateText(Evo.Star.predict(Evo.starMassFromCore(s), s.Z))}</div>`;
    if (s.history.length) h += `<h3>${tr('evo.past')}</h3>` + s.history.map((x) => `<div class="small">${tr('evo.pastV', { n: x.cycle, planet: x.planet ? CA.PLANET_TYPES[x.planet] ? CA.PLANET_TYPES[x.planet].name : x.planet : tr('evo.noPlanet'), m: U.fmtMsun(x.starMass), rem: CA.I18n.has('evo.r.' + x.remnant) ? tr('evo.r.' + x.remnant) : x.remnant })}</div>`).join('');
    const found = CA.DISCOVERIES.filter((d) => s.discovered[d.id]).length;
    h += `<h3>${tr('evo.disc', { f: found, t: CA.DISCOVERIES.length })}</h3><div class="disc">` + CA.DISCOVERIES.filter((d) => !d.id.startsWith('stage:')).map((d) =>
      s.discovered[d.id] ? `<div class="found" data-tip="${esc(d.desc)}"><b>${esc(d.name)}</b><br><span class="muted">${tr('cat.' + d.cat)}</span></div>` : `<div class="unk" data-tip="${esc(d.hint)}">???<br><span>${esc(d.hint)}</span></div>`).join('') + '</div>';
    return h;
  }

  function minigamesHTML(s) {
    return CA.MG.order.map((id) => {
      const def = CA.MG.defs[id], unlocked = CA.MG.unlocked(s, id), rec = s.mg[id];
      let lv = '';
      for (let l = 1; l <= def.levels; l++) {
        const open = unlocked && CA.MG.levelOpen(s, id, l);
        lv += `<button class="btn ${l <= rec.cleared ? 'gold' : ''}" data-act="mg" data-id="${id}" data-level="${l}" ${open ? '' : 'disabled'} data-tip="${rec.best[l] ? tr('mgp.best', { n: U.fmt(rec.best[l]) }) : open ? tr('mgp.play', { n: l }) : tr('mgp.clearPrev')}">${tr('mgp.lv', { n: l })}${l <= rec.cleared ? ' ✓' : ''}</button>`;
      }
      return `<div class="mgcard"><h4>${def.name}</h4><span class="chip">${def.mechanic}</span>
        <p>${unlocked ? esc(def.science.split('. ')[0]) + '.' : `<span class="warnc">${tr('up.unlocks', { s: CA.STAGE[def.unlock].name })}</span>`}</p>
        <div class="lvls">${lv}</div><p class="muted small">${tr('mgp.played', { n: rec.plays })} ${tr('mgp.' + id)}</p></div>`;
    }).join('');
  }

  function achievementsHTML(s) {
    const Ach = CA.Ach, f = Ach.total(s), t = CA.ACHIEVEMENTS.length;
    const card = (a) => {
      const got = Ach.earned(s, a.id), p = Ach.progress(s, a);
      if (a.cat === 'hidden' && !got) return `<div class="ach unk"><b>???</b><span class="ds">${tr('achp.hidden')}</span></div>`;
      const bar = !got && p && p[1] > 1 ? `<span class="pr"><span class="bar"><span class="fill" style="display:block;width:${(p[0] / p[1]) * 100}%"></span></span>${p[0]} / ${p[1]}</span>` : '';
      return `<div class="ach ${got ? 'got' : ''}"><b>${esc(a.name)}</b><span class="rw">${got ? '✓ ' : ''}+${Ach.reward(a)} ${tr('resab.research')}</span><span class="ds">${esc(a.desc)}</span>${bar}</div>`;
    };
    let h = `<p class="muted small">${tr('achp.head', { f, t })}</p><div class="bar"><div class="fill" style="width:${(f / t) * 100}%"></div></div>`;
    for (const c of Ach.CATS) h += `<h3>${tr('achc.' + c)}</h3>` + CA.ACHIEVEMENTS.filter((a) => a.cat === c).map(card).join('');
    return h;
  }

  /* The Codex: bodies (pictures, real numbers, my record) and the science log in a second tab. */
  function codexHTML(s) {
    const tab = (id, label) => `<button class="${codexTab === id ? 'on' : ''}" data-act="ctab" data-id="${id}">${label}</button>`;
    const body = codexTab === 'log' ? logHTML(s) : atlasSel ? atlasEntryHTML(s, CA.ATLAS_BY[atlasSel]) : atlasHTML(s);
    return `<nav class="subtabs">${tab('atlas', tr('atlp.bodies'))}${tab('log', tr('atlp.log'))}</nav>` + body;
  }

  function atlasHTML(s) {
    const At = CA.Atlas;
    const card = (e) => {
      const f = At.found(s, e);
      return `<button class="atl ${f ? '' : 'unk'}" data-act="atlas" data-id="${e.id}"${f ? '' : ` data-tip="${esc(At.hint(e))}"`}><canvas data-body="${e.id}"></canvas><span>${f ? esc(e.name) : '???'}</span></button>`;
    };
    let h = `<p class="muted small">${tr('atlp.head', { f: At.total(s), t: CA.ATLAS.length })}</p>`;
    for (const g of At.GROUPS) h += `<h3>${tr('atlg.' + g)}</h3><div class="atl-grid">${CA.ATLAS.filter((e) => e.group === g).map(card).join('')}</div>`;
    return h;
  }

  function atlasEntryHTML(s, e) {
    const At = CA.Atlas, head = `<button class="btn small" data-act="atlas-back">${tr('atlp.back')}</button><canvas class="atl-big" id="atl-big" data-body="${e.id}"></canvas>`;
    if (!At.found(s, e)) return head + `<h4 class="atl-name">???</h4><p class="muted small">${tr('atlp.unknown')}</p><div class="sci">${esc(At.hint(e))}</div>`;
    const r = s.atlas[e.id], best = r && e.unit && r.v ? ` · ${tr('atlr.' + e.label)} ${At.fmt(e, r.v)}` : '';
    const rec = r && r.n ? tr('atlp.met', { n: r.n }) + best : tr('atlp.noRec');
    const link = (id) => { const x = CA.ATLAS_BY[id], f = At.found(s, x); return `<button class="chip ${f ? 'reached' : ''}" data-act="atlas" data-id="${id}">${f ? esc(x.name) : '???'}</button>`; };
    const fact = (f) => { const [k, v] = f.split(': '); return `<span>${esc(k)}</span><span>${esc(v)}</span>`; };
    return head + `<h4 class="atl-name">${esc(e.name)}${origTag('atl.' + e.id + '.name')}</h4>
      <h3>${tr('atlp.facts')}</h3><div class="atl-facts">${e.facts.split(' | ').map(fact).join('')}</div>
      <div class="sci"><b>${tr('atlp.example', { name: esc(e.example) })}</b><br>${esc(e.text)}</div>
      <h3>${tr('atlp.rec')}</h3><p class="small">${rec}</p>
      <h3>${tr('atlp.rel')}</h3><div class="chips">${e.rel.map(link).join('')}</div>`;
  }

  // view radii in CA.ATLAS are on a canvas 96 units tall, so the same picture works as a thumbnail and full size
  function paintBody(cv, s, t) {
    const e = CA.ATLAS_BY[cv.dataset.body], dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (w < 2 || h < 2) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'), k = (h / 96) * dpr, p = Object.assign({ t, seed: 1, rot: t * 0.05, prog: 0.5 }, e.view.p);
    if (p.beam !== undefined) p.beam += t * 0.5;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(k, 0, 0, k, cv.width / 2, cv.height / 2);
    CA.Bodies.draw(g, e.view.kind, 0, 0, e.view.r, p);
    if (CA.Atlas.found(s, e)) return;
    g.setTransform(1, 0, 0, 1, 0, 0); // not found yet: keep the outline, lose everything else
    g.globalCompositeOperation = 'source-in'; g.fillStyle = '#3a4560'; g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'source-over';
  }
  function drawAtlas(s) {
    el.panelBody.querySelectorAll('canvas[data-body]').forEach((cv) => paintBody(cv, s, 7));
    if (!atlasSpinning && $('atl-big') && !G.settings.reducedMotion) { atlasSpinning = true; requestAnimationFrame(spinAtlas); }
  }
  function spinAtlas(ts) {
    const cv = $('atl-big');
    if (!cv || UI.panel !== 'codex') { atlasSpinning = false; return; }
    paintBody(cv, G.state, ts / 1000);
    requestAnimationFrame(spinAtlas);
  }

  function logHTML(s) {
    let h = `<p class="muted small">${tr('codex.head')}</p>`;
    h += CA.STAGES.filter((st) => s.discovered['stage:' + st.id]).map((st) => `<div class="sci"><b>${st.name}</b>${origTag('stage.' + st.id + '.name')} <span class="muted small">· ${CA.CHAPTERS[st.chapter].name}</span><br>${esc(st.science)}</div>`).join('');
    const extra = CA.DISCOVERIES.filter((d) => !d.id.startsWith('stage:') && s.discovered[d.id]);
    if (extra.length) h += `<h3>${tr('codex.disc')}</h3>` + extra.map((d) => `<div class="sci"><b>${d.name}</b>${origTag('disc.' + d.id + '.name')}<br>${esc(d.desc)}</div>`).join('');
    const seenEv = CA.EVENTS.filter((e) => s.ev && s.ev.count[e.id]);
    if (seenEv.length) h += `<h3>${tr('codex.events')}</h3>` + seenEv.map((e) => `<div class="sci"><b>${esc(e.name)}</b>${origTag('ev.' + e.id + '.name')} <span class="muted small">${tr('codex.evSeen', { n: s.ev.count[e.id], w: s.ev.won[e.id] || 0 })}</span><br>${esc(e.science)}</div>`).join('');
    return h;
  }

  function onPanelClick(e) {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    if (b.dataset.act === 'buy') G.buy(b.dataset.id);
    else if (b.dataset.act === 'mg') { UI.closePanel(); CA.MG.open(b.dataset.id, parseInt(b.dataset.level, 10)); }
    else if (b.dataset.act === 'ending') { UI.closePanel(); G.replayEnding(); }
    else if (b.dataset.act === 'utab') { upTab = b.dataset.id; renderPanel(false); el.panelBody.scrollTop = 0; }
    else if (b.dataset.act === 'stagecard') { UI.closePanel(); stageCard(true); }
    else if (b.dataset.act === 'ctab') { codexTab = b.dataset.id; atlasSel = null; renderPanel(true); el.panelBody.scrollTop = 0; }
    else if (b.dataset.act === 'atlas') { if (!atlasSel) atlasScroll = el.panelBody.scrollTop; atlasSel = b.dataset.id; renderPanel(true); el.panelBody.scrollTop = 0; }
    else if (b.dataset.act === 'atlas-back') { atlasSel = null; renderPanel(true); el.panelBody.scrollTop = atlasScroll; }
  }

  /* ---------------- modals ---------------- */
  function openModal(html, locked) { el.modalCard.innerHTML = html; el.modal.classList.remove('hidden'); el.modal.dataset.locked = locked ? '1' : ''; }
  function closeModal() { el.modal.classList.add('hidden'); el.modal.dataset.locked = ''; if (G && G.paused && !G.menu) { G.paused = false; } }
  UI.closeModal = closeModal;

  function confirmModal(title, body, okLabel, onOk) {
    openModal(`<h2>${title}</h2><p>${body}</p><div class="row"><button class="btn primary" id="cm-ok">${okLabel}</button><button class="btn" id="cm-no">${tr('modal.cancel')}</button></div>`);
    $('cm-ok').onclick = () => { closeModal(); onOk(); };
    $('cm-no').onclick = () => closeModal();
  }

  function cycleModal() {
    const s = G.state, r = s.remnant, rw = Evo.cycleReward(s), keep = Bin.canKeep(s);
    const kept = Math.round(rw.remnants * CA.BAL.binary.keepShare);
    openModal(`<h2>${tr('modal.cycleTitle')}</h2><p>${tr('modal.cycleBody', { r: rw.remnants, z: rw.z.toFixed(3) })}</p>
      ${keep ? `<p>${tr('modal.keepBody', { name: tr('evo.r.' + r.type), m: U.fmtMsun(r.mass), r: kept })}</p>` : ''}
      ${s.companion ? `<p class="warnc">${tr('modal.keepLost')}</p>` : ''}
      <div class="row"><button class="btn primary" id="cy-ok">${tr('modal.cycleOk')}</button>${keep ? `<button class="btn gold" id="cy-keep">${tr('modal.keepOk')}</button>` : ''}<button class="btn" id="cy-no">${tr('modal.cancel')}</button></div>`);
    $('cy-ok').onclick = () => { closeModal(); G.newCycle(false); };
    if (keep) $('cy-keep').onclick = () => { closeModal(); G.newCycle(true); };
    $('cy-no').onclick = () => closeModal();
  }

  UI.showEnding = function () {
    const s = G.state, found = CA.DISCOVERIES.filter((d) => !d.id.startsWith('stage:') && s.discovered[d.id]).length;
    G.paused = true; G.input.down = false; // the ejecta timer waits; closing the window resumes
    openModal(`<h2>${tr('end.title')}</h2><p>${tr('end.body')}</p>${originsHTML(s)}
      <p class="muted small">${tr('end.stats', { c: s.cycle, t: U.fmtTime(s.stats.playTime), d: found })}</p>
      <div class="row"><button class="btn primary" id="end-ok">${tr('end.ok')}</button></div>`, true);
    $('end-ok').onclick = () => closeModal();
  };

  UI.togglePause = function () {
    if (CA.MG.active) return;
    if (!el.modal.classList.contains('hidden')) { if (!el.modal.dataset.locked) closeModal(); return; }
    if (UI.panel) { UI.closePanel(); return; }
    if (G.menu) return;
    G.paused = true; G.input.down = false;
    openModal(`<h2>${tr('pause.title')}</h2><div class="menu-btns" style="margin:12px 0 0">
      <button class="btn primary" id="p-resume">${tr('pause.resume')}</button><button class="btn" id="p-save">${tr('pause.save')}</button>
      <button class="btn" id="p-settings">${tr('pause.settings')}</button><button class="btn" id="p-saves">${tr('pause.saves')}</button>
      <button class="btn" id="p-about">${tr('pause.about')}</button><button class="btn" id="p-menu">${tr('pause.menu')}</button></div>`);
    $('p-resume').onclick = () => closeModal();
    $('p-save').onclick = () => G.save();
    $('p-settings').onclick = () => settingsModal(true);
    $('p-saves').onclick = () => savesModal(true);
    $('p-about').onclick = () => aboutModal(true);
    $('p-menu').onclick = () => { closeModal(); G.toMenu(); };
  };

  function settingsModal(fromPause) {
    const st = G.settings;
    const sl = (k, label) => `<label>${label}<input type="range" min="0" max="1" step="0.05" data-set="${k}" value="${st[k]}"></label>`;
    const ck = (k, label) => `<label class="check"><input type="checkbox" data-set="${k}" ${st[k] ? 'checked' : ''}><span>${label}</span></label>`;
    openModal(`<h2>${tr('set.title')}</h2>
      <label>Language / 언어<select data-set="lang"><option value="ko">한국어</option><option value="en">English</option></select></label>
      ${sl('master', tr('set.master'))}${sl('ambient', tr('set.ambient'))}${sl('sfx', tr('set.sfx'))}${ck('muted', tr('set.muted'))}
      ${ck('reducedMotion', tr('set.motion'))}${ck('reducedFlashing', tr('set.flash'))}
      <label>${tr('set.density')}<select data-set="density"><option value="low">${tr('set.low')}</option><option value="normal">${tr('set.normal')}</option><option value="high">${tr('set.high')}</option></select></label>
      <label>${tr('set.quality')}<select data-set="quality"><option value="auto">${tr('set.auto')}</option><option value="high">${tr('set.high')}</option><option value="normal">${tr('set.normal')}</option><option value="low">${tr('set.low')}</option></select></label>
      ${ck('tutorials', tr('set.tutorials'))}${ck('showFps', tr('set.fps'))}
      <div class="row"><button class="btn primary" id="st-done">${tr('set.done')}</button></div>`, fromPause);
    el.modalCard.querySelector('[data-set="density"]').value = st.density;
    el.modalCard.querySelector('[data-set="quality"]').value = st.quality;
    el.modalCard.querySelector('[data-set="lang"]').value = st.lang;
    el.modalCard.querySelectorAll('[data-set]').forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.set;
      st[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? parseFloat(inp.value) : inp.value;
      CA.State.saveSettings(st, G.storage); CA.Audio.apply();
      if (k === 'lang') { CA.I18n.setLang(st.lang); UI.refreshLang(); settingsModal(fromPause); }
    }));
    $('st-done').onclick = () => (fromPause ? UI.reopenPause() : closeModal());
  }
  UI.reopenPause = () => { el.modal.classList.add('hidden'); G.paused = false; UI.togglePause(); };

  function savesModal(fromPause) {
    const inGame = !G.menu;
    openModal(`<h2>${tr('sv.title')}</h2>
      <p class="muted">${tr('sv.intro', { n: CA.BAL.autosaveSeconds })}</p>
      <div class="row">${inGame ? '<button class="btn primary" id="sv-save">' + tr('pause.save') + '</button>' : ''}<button class="btn" id="sv-export" ${inGame || CA.State.hasSave(G.storage) ? '' : 'disabled'}>${tr('sv.export')}</button></div>
      <textarea id="sv-text" placeholder="${tr('sv.ph')}"></textarea>
      <div class="row"><button class="btn" id="sv-copy">${tr('sv.copy')}</button><button class="btn" id="sv-import">${tr('sv.import')}</button></div>
      <h3 style="margin-top:16px">${tr('sv.danger')}</h3>
      <p class="muted">${tr('sv.resetHelp')}</p>
      <div class="row"><input type="text" id="sv-confirm" placeholder="RESET"><button class="btn" id="sv-reset">${tr('sv.delete')}</button></div>
      <div class="row"><button class="btn" id="sv-close">${tr('ui.close')}</button></div>`, fromPause);
    const ta = $('sv-text');
    if (inGame) $('sv-save').onclick = () => G.save();
    $('sv-export').onclick = () => {
      let st = G.state;
      if (G.menu) { const r = CA.State.load(G.storage); st = r.state; }
      if (st) ta.value = CA.State.exportString(st);
    };
    $('sv-copy').onclick = () => { ta.select(); try { navigator.clipboard.writeText(ta.value); UI.toast(tr('sv.copied'), 'info'); } catch (e) { document.execCommand('copy'); } };
    $('sv-import').onclick = () => {
      const r = CA.State.importString(ta.value);
      if (!r.state) { UI.toast(tr('sv.bad'), 'warn'); return; }
      confirmModal(tr('sv.importTitle'), tr('sv.importBody', { stage: CA.STAGE[r.state.stage].name, c: r.state.cycle, rep: r.warnings.length ? '<br><span class="warnc">' + tr('sv.repaired') + esc(r.warnings.join('; ')) + '</span>' : '' }), tr('sv.importOk'), () => { G.load(r.state, {}); G.save(true); UI.toast(tr('sv.imported'), 'info'); });
    };
    $('sv-reset').onclick = () => {
      if ($('sv-confirm').value.trim() !== 'RESET') { UI.toast(tr('sv.typeReset'), 'warn'); return; }
      closeModal(); G.resetAll(); UI.toast(tr('sv.deleted'), 'info');
    };
    $('sv-close').onclick = () => (fromPause ? UI.reopenPause() : closeModal());
  }

  function aboutModal(fromPause) {
    openModal(`<h2>${tr('about.title')}</h2><div class="guide">${guideHTML(G.menu ? null : G.state, false)}</div>
      <div class="row"><button class="btn primary" id="ab-close">${tr('ui.close')}</button></div>`, fromPause);
    $('ab-close').onclick = () => (fromPause ? UI.reopenPause() : closeModal());
  }

  UI.showOffline = function (sum) {
    const g = sum.gained;
    openModal(`<h2>${tr('off.title')}</h2><p>${tr('off.body', { t: U.fmtTime(sum.seconds), capped: sum.capped ? tr('off.capped') : '', p: Math.round(sum.eff * 100) })}</p>
      <ul>${g.matter > 0 ? `<li>+${U.fmt(g.matter)} ${Econ.RES_NAMES.matter}</li>` : ''}${g.heavy > 0 ? `<li>+${U.fmt(g.heavy)} ${Econ.RES_NAMES.heavy}</li>` : ''}${g.research > 0 ? `<li>+${U.fmt(g.research)} ${Econ.RES_NAMES.research}</li>` : ''}${sum.massGain > 1.0001 ? `<li>${tr('off.mass', { n: sum.massGain.toFixed(2) })}</li>` : ''}</ul>
      <p class="muted small">${tr('off.note')}</p>
      <div class="row"><button class="btn primary" id="off-ok">${tr('menu.continue')}</button></div>`);
    $('off-ok').onclick = () => closeModal();
  };

  UI.showZoneChoice = function () {
    if (G.state.zone) return;
    openModal(`<h2>${tr('zone.title')}</h2><p>${tr('zone.body')}</p>
      <div class="choice">
        <button class="btn" id="z-in"><b>${tr('zone.in')}</b>${tr('zone.inText')} <span class="warnc">${tr('zone.inWarn')}</span></button>
        <button class="btn" id="z-out"><b>${tr('zone.out')}</b>${tr('zone.outText')}</button>
      </div>`, true);
    $('z-in').onclick = () => { closeModal(); G.chooseZone('inner'); };
    $('z-out').onclick = () => { closeModal(); G.chooseZone('outer'); };
  };

  UI.showCinematic = function (def, short) {
    $('cine-title').textContent = def.title;
    $('cine-sub').textContent = def.sub;
    $('cine-body').textContent = short ? '' : def.text;
    el.cine.classList.remove('hidden');
    UI.closePanel();
  };
  UI.hideCinematic = () => el.cine.classList.add('hidden');
})(globalThis.CA = globalThis.CA || {});
