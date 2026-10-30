/* COSMIC ASCENSION — procedural Web Audio: ambient drone + synthesized effects. Starts only after a user gesture. */
(function (CA) {
  'use strict';
  const A = (CA.Audio = { ctx: null, ready: false });
  let master, ambGain, sfxGain, amb = null, lastBlip = 0, settings = null;

  A.init = function (s) { settings = s; };
  A.unlock = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    master = A.ctx.createGain(); ambGain = A.ctx.createGain(); sfxGain = A.ctx.createGain();
    ambGain.connect(master); sfxGain.connect(master); master.connect(A.ctx.destination);
    A.ready = true;
    A.apply();
    startAmbient();
  };
  A.apply = function () {
    if (!A.ready) return;
    const t = A.ctx.currentTime;
    master.gain.setTargetAtTime(settings.muted ? 0 : settings.master, t, 0.05);
    ambGain.gain.setTargetAtTime(settings.ambient * 0.5, t, 0.3);
    sfxGain.gain.setTargetAtTime(settings.sfx, t, 0.05);
  };

  function noiseBuffer(sec) {
    const n = Math.floor(A.ctx.sampleRate * sec), b = A.ctx.createBuffer(1, n, A.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function startAmbient() {
    const c = A.ctx;
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 420; filt.Q.value = 0.7;
    filt.connect(ambGain);
    const oscs = [55, 82.4, 110.2].map((f, i) => {
      const o = c.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = f;
      const gn = c.createGain(); gn.gain.value = i === 2 ? 0.05 : 0.11;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.05 + i * 0.03;
      const lg = c.createGain(); lg.gain.value = 0.04; lfo.connect(lg); lg.connect(gn.gain); lfo.start();
      o.connect(gn); gn.connect(filt); o.start();
      return o;
    });
    const ns = c.createBufferSource(); ns.buffer = noiseBuffer(4); ns.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 300; nf.Q.value = 0.4;
    const ng = c.createGain(); ng.gain.value = 0.035;
    ns.connect(nf); nf.connect(ng); ng.connect(ambGain); ns.start();
    amb = { filt, oscs, nf };
  }

  /* Chapter mood: shifts pitch and brightness of the drone. */
  A.setMood = function (chapter) {
    if (!amb) return;
    const t = A.ctx.currentTime;
    const base = [0, 55, 61.7, 73.4, 49][chapter] || 55;
    amb.oscs.forEach((o, i) => o.frequency.setTargetAtTime(base * [1, 1.5, 2.003][i], t, 2));
    amb.filt.frequency.setTargetAtTime([0, 380, 520, 760, 600][chapter] || 420, t, 2);
  };

  function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
    if (!A.ready) return;
    const c = A.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(sfxGain); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, freq, vol = 0.3, q = 1, delay = 0) {
    if (!A.ready) return;
    const c = A.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = noiseBuffer(dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(60, t + dur); f.Q.value = q;
    const gn = c.createGain(); gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(gn); gn.connect(sfxGain); s.start(t);
  }

  A.play = function (name, x = 1) {
    if (!A.ready) return;
    const now = A.ctx.currentTime;
    switch (name) {
      case 'collect':
        if (now - lastBlip < 0.045) return; lastBlip = now;
        tone(520 + Math.random() * 380 * x, 0.09, 'sine', 0.05); break;
      case 'heavy': tone(330, 0.15, 'triangle', 0.08); tone(495, 0.12, 'sine', 0.05, 0, 0.04); break;
      case 'spark': tone(1200, 0.08, 'square', 0.025, 1.5); break;
      case 'rare': [660, 880, 1320].forEach((f, i) => tone(f, 0.4, 'sine', 0.08, 0, i * 0.08)); break;
      case 'pulse': tone(140, 0.5, 'sine', 0.25, 0.4); noise(0.35, 600, 0.08); break;
      case 'frag': noise(0.18, 2200, 0.12); break;
      case 'upgrade': [392, 523, 659].forEach((f, i) => tone(f, 0.18, 'triangle', 0.1, 0, i * 0.06)); break;
      case 'deny': tone(110, 0.16, 'sawtooth', 0.06); break;
      case 'click': tone(800, 0.04, 'sine', 0.05); break;
      case 'milestone': [261.6, 329.6, 392, 523.3].forEach((f, i) => tone(f, 1.6, 'sine', 0.09, 0, i * 0.12)); break;
      case 'ignition': noise(1.2, 3000, 0.3); tone(80, 2, 'sine', 0.3, 2); [392, 587, 784].forEach((f, i) => tone(f, 2.2, 'sine', 0.07, 0, 0.3 + i * 0.15)); break;
      case 'supernova': noise(3.5, 5000, 0.55, 0.5); tone(45, 3, 'sine', 0.45, 0.5); break;
      case 'collapse': tone(400, 2.2, 'sine', 0.18, 0.15); noise(1.8, 900, 0.12); break;
      case 'blackhole': tone(60, 3.5, 'sine', 0.35, 0.5); tone(90, 3, 'triangle', 0.08, 0.3, 0.4); break;
      case 'pulsar': tone(1800, 0.05, 'square', 0.05); break;
      case 'gwbeat': tone(90 + 260 * x, 0.07, 'sine', 0.09); break;
      case 'chirp': tone(120, 0.85, 'sine', 0.22, 9); break;
      case 'ia': noise(3, 6000, 0.5, 0.5); tone(70, 2.5, 'sine', 0.35, 0.5); [880, 1320].forEach((f, i) => tone(f, 1.8, 'sine', 0.05, 0, i * 0.2)); break;
      case 'kilonova': noise(2.5, 3500, 0.4, 0.6); tone(55, 3, 'sine', 0.4, 0.6); [523, 659, 880].forEach((f, i) => tone(f, 2.4, 'triangle', 0.06, 0, 0.4 + i * 0.25)); break;
      case 'gw': tone(50, 3, 'sine', 0.35, 0.6); tone(75, 3, 'sine', 0.15, 0.5, 0.3); break;
      case 'ending': [130.8, 196, 261.6, 329.6, 392, 523.3].forEach((f, i) => tone(f, 6, 'sine', 0.07, 0, i * 0.7)); break;
      case 'success': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, 0, i * 0.08)); break;
      case 'fail': tone(300, 0.6, 'sawtooth', 0.08, 0.5); break;
      case 'warn': tone(220, 0.25, 'square', 0.05); tone(220, 0.25, 'square', 0.05, 0, 0.3); break;
    }
  };
})(globalThis.CA = globalThis.CA || {});
