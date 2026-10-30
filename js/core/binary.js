/* COSMIC ASCENSION — binary endgame rules: a remnant kept as a companion, Roche-lobe mass transfer,
   gravitational-wave inspiral, merger outcomes and the "origin of the elements" table.
   Everything here is a pure rule on the state; numbers live in BAL.binary. See SCIENCE.md. No DOM. */
(function (CA) {
  'use strict';
  const U = CA.U;
  const Bin = (CA.Binary = {});
  const BB = () => CA.BAL.binary;
  const Econ = () => CA.Econ, Evo = () => CA.Evo;

  Bin.DONORS = ['redgiant', 'agb', 'supergiant'];
  Bin.ORIGINS = ['bigbang', 'agb', 'massive', 'ccsn', 'ia', 'kilonova'];
  Bin.STAGE_OF = { none: 'snr', wd: 'whitedwarf', ns: 'neutronstar', bh: 'blackhole' };

  /* ---------------- origin of the elements ---------------- */
  // Marks one cell of the table. The sixth cell ends the game's story (play goes on afterwards).
  Bin.markOrigin = function (s, id) {
    if (s.origins[id] || !Bin.ORIGINS.includes(id)) return [];
    s.origins[id] = true;
    const ev = [{ type: 'origin', id }];
    if (!s.ended && Bin.ORIGINS.every((k) => s.origins[k])) { s.ended = true; ev.push({ type: 'cinematic', id: 'ending' }, { type: 'ending' }); }
    return ev;
  };

  /* ---------------- the companion ---------------- */
  Bin.makeCompanion = (r, cycle) => ({
    type: r.type, mass: r.mass, P: r.P || 0, B: r.B || 0, magnetar: !!r.magnetar, msp: !!r.msp, cycle,
    fed: 0, gained: 0, shell: 0, x: 0, valve: 0.5, ce: 0, ended: false, touched: false,
  });
  Bin.canKeep = (s) => !!(s.remnant && ['wd', 'ns', 'bh'].includes(s.remnant.type));

  // Eggleton (1983) fit for the Roche-lobe radius, q = donor mass / accretor mass.
  Bin.rocheLobe = function (a, q) {
    const q23 = Math.pow(q, 2 / 3);
    return (a * 0.49 * q23) / (0.6 * q23 + Math.log(1 + Math.pow(q, 1 / 3)));
  };
  Bin.lobe = (s) => Bin.rocheLobe(BB().sepRsun, s.star.M / s.companion.mass);
  Bin.isDonor = (s) => !!(s.companion && !s.companion.ended && Bin.DONORS.includes(s.stage));
  Bin.transferring = (s) => Bin.isDonor(s) && s.star.rg > Bin.lobe(s);
  // what the star can give: its envelope (a supergiant keeps a helium core of about 40%)
  Bin.envelope = (s) => (s.stage === 'supergiant' ? 0.6 * s.star.M0 : s.star.M0 - Evo().Star.wdMass(s.star.M0));
  // angular momentum from accreted gas: spin rate grows linearly with accreted mass
  Bin.spinUp = (P, dm) => Math.max(BB().minP, U.TAU / (U.TAU / P + BB().spinUp * dm));
  Bin.bandOf = (x) => (x < BB().band[0] ? 'low' : x > BB().band[1] ? 'high' : 'ok');

  function gain(s, c, dm, ev) {
    const B = BB();
    c.mass += dm; c.gained += dm;
    if (c.type !== 'wd') Econ().add(s, 'energy', B.xrayEnergy * dm);
    if (c.type === 'wd' && c.mass >= B.chandra) { Bin.typeIa(s, ev); return; }
    if (c.type === 'ns') {
      c.P = Bin.spinUp(c.P || 0.033, dm);
      c.B = Math.max(1e8, c.B * Math.exp(-dm / 0.01)); // accreted gas buries the surface field
      if (!c.msp && c.P < B.mspP) {
        c.msp = true;
        Econ().grantOnce(s, 'msp:' + s.cycle, { research: 30 });
        ev.push({ type: 'binary', note: 'bin.msp' }, ...Evo().discover(s, 'msp'));
      }
    }
  }

  /* One step of Roche-lobe overflow. c.valve is the player's control, c.x the resulting rate over the steady
     rate. Too slow: gas piles up in a shell and blows off (nova). Too fast: a common envelope builds up. */
  Bin.tickTransfer = function (s, dt, rand = Math.random) {
    const c = s.companion, B = BB(), ev = [];
    if (!Bin.isDonor(s)) return ev;
    if (!Bin.transferring(s)) { c.x = Math.max(0, c.x - 1.5 * dt); return ev; }
    if (!c.touched) { c.touched = true; ev.push({ type: 'binary', note: 'bin.overflow' }); }
    const left = Bin.envelope(s) - c.fed;
    if (left <= 0) { c.ended = true; ev.push({ type: 'binary', note: 'bin.spent' }); return ev; }
    const target = c.valve * B.valveGain * (1 + B.drift * (Evo().progress(s) - 0.5)); // the swelling star pushes harder and harder
    const gauss = (rand() + rand() + rand() - 1.5) * 2;
    c.x = U.clamp(c.x + (target - c.x) * (1 - Math.exp(-B.relax * dt)) + B.noise * Math.sqrt(dt) * gauss, 0, 2);
    const dm = Math.min(left, B.rate[c.type] * c.x * dt);
    c.fed += dm;
    if (s.stage === 'supergiant') s.star.M = Math.max(s.star.M0 * 0.25, s.star.M - dm);
    const band = Bin.bandOf(c.x);
    if (band === 'low') {
      c.shell += dm;
      c.ce = Math.max(0, c.ce - dt / (2 * B.ceTime));
      if (c.shell >= B.shell) { c.shell = 0; ev.push({ type: 'binary', note: c.type === 'wd' ? 'bin.nova' : 'bin.outburst', flash: true }); }
      return ev;
    }
    if (band === 'high') {
      c.ce = Math.min(1, c.ce + dt / B.ceTime);
      gain(s, c, Math.min(dm, B.rate[c.type] * B.band[1] * dt), ev); // the accretor takes what it can, the rest spreads around it
      if (s.companion && c.ce >= 1) { c.ended = true; ev.push({ type: 'binary', note: 'bin.ce', warn: true }); }
      return ev;
    }
    c.ce = Math.max(0, c.ce - dt / (2 * B.ceTime));
    gain(s, c, dm, ev);
    return ev;
  };

  // Single-degenerate Type Ia: the accreting white dwarf is destroyed, the donor carries on as a lone star.
  Bin.typeIa = function (s, ev) {
    s.companion = null;
    const rewards = Econ().grantOnce(s, 'ia:' + s.cycle, BB().rewards.ia);
    ev.push({ type: 'binary', note: 'bin.ia', rewards }, { type: 'cinematic', id: 'ia' }, ...Evo().discover(s, 'type_ia'), ...Bin.markOrigin(s, 'ia'));
    CA.Atlas.note(s, 'type_ia');
  };

  /* ---------------- gravitational-wave inspiral ----------------
     Quadrupole radiation: time to merger τ, orbital phase ∝ τ^(5/8), frequency ∝ τ^(-3/8), separation ∝ τ^(1/4).
     Phase is counted in gravitational-wave cycles (one half orbit); a whole number is a "beat" when the pair
     lines up with the detector. Beat k has phase k + 1; beat N − 1 (phase N) is the merger itself. */
  const C = () => BB().chirp;
  Bin.chirpMass = (a, b) => Math.pow(a * b, 0.6) / Math.pow(a + b, 0.2);
  Bin.chirpDur = (Mc) => U.clamp(C().T * Math.pow(Mc / 1.2, -0.25), C().Tmin, C().Tmax);
  Bin.newChirp = function (a, b) {
    const Mc = Bin.chirpMass(a.mass, b.mass);
    return { a: { type: a.type, mass: a.mass }, b: { type: b.type, mass: b.mass }, Mc, T: Bin.chirpDur(Mc), N: C().N, idx: 0, hits: 0, w: 0, falses: 0, marks: [], out: null, snr: 0, detected: false };
  };
  Bin.tau = (c, t) => Math.max(0, c.T - t);
  Bin.phase = (c, t) => c.N * (1 - Math.pow(Bin.tau(c, t) / c.T, 0.625));
  Bin.freq = (c, t) => ((0.625 * c.N) / c.T) * Math.pow(Math.max(0.02, Bin.tau(c, t)) / c.T, -0.375); // beats per second
  Bin.sep = (c, t) => Math.pow(Bin.tau(c, t) / c.T, 0.25); // 1 at the start, 0 at merger
  Bin.beatT = (c, k) => c.T * (1 - Math.pow((c.N - 1 - k) / c.N, 1.6));
  Bin.beatWin = function (c, k) {
    if (k >= c.N - 1) return C().winMerge;
    return Math.min(C().winBeat, C().winFrac * (Bin.beatT(c, k) - (k ? Bin.beatT(c, k - 1) : 0)));
  };
  Bin.endT = (c) => c.T + C().winMerge;
  // strain power grows toward merger; the merger counts like the last orbit
  Bin.weight = (c, k) => Math.pow(Math.max(1, c.N - 1 - k) / c.N, -0.8);
  Bin.totalWeight = function (c) { let w = 0; for (let k = 0; k < c.N; k++) w += Bin.weight(c, k); return w; };
  Bin.snr = (c) => Math.max(0, C().snrMax * Math.sqrt(c.w / Bin.totalWeight(c)) - C().falseCost * c.falses);
  Bin.detected = (c) => Bin.snr(c) >= C().snrDetect;
  Bin.yieldMult = (snr) => 0.5 + snr / C().snrMax;
  // waveform for the scope: amplitude ∝ f^(2/3), then a short ringdown
  Bin.strain = function (c, t) {
    if (t > c.T) return Math.exp(-(t - c.T) / 0.12) * Math.cos(U.TAU * c.N + (t - c.T) * 40);
    return Math.min(1, 0.16 * Math.pow(Math.max(0.01, Bin.tau(c, t)) / c.T, -0.25)) * Math.cos(U.TAU * Bin.phase(c, t));
  };

  function skipMissed(c, t) { while (c.idx < c.N && t > Bin.beatT(c, c.idx) + Bin.beatWin(c, c.idx)) c.idx++; }
  Bin.stepChirp = (c, t) => skipMissed(c, t);
  /* The player pressed at time t. Each beat can score once; a press with no beat near it is a false alarm. */
  Bin.press = function (c, t) {
    skipMissed(c, t);
    const k = c.idx;
    if (k < c.N && Math.abs(t - Bin.beatT(c, k)) <= Bin.beatWin(c, k)) {
      c.idx++; c.hits++; c.w += Bin.weight(c, k);
      c.marks.push({ t, ok: true }); if (c.marks.length > 12) c.marks.shift();
      return { hit: true, dt: t - Bin.beatT(c, k), merger: k === c.N - 1 };
    }
    c.falses++;
    c.marks.push({ t, ok: false }); if (c.marks.length > 12) c.marks.shift();
    return { hit: false };
  };

  /* ---------------- what two remnants make ---------------- */
  Bin.outcome = function (a, b) {
    const B = BB(), sum = a.mass + b.mass, t = [a.type, b.type].sort().join('+');
    const of = (type) => (a.type === type ? a : b);
    switch (t) {
      case 'wd+wd': return sum >= B.chandra ? { kind: 'ia', product: 'none', mass: 0.1, ejecta: true } : { kind: 'wdwd', product: 'wd', mass: sum, ejecta: false };
      case 'ns+wd': { const m = of('ns').mass + 0.2 * of('wd').mass; return { kind: 'nswd', product: m >= B.nsMax ? 'bh' : 'ns', mass: m, ejecta: true }; }
      case 'bh+wd': return { kind: 'bhwd', product: 'bh', mass: of('bh').mass + 0.9 * of('wd').mass, ejecta: false };
      case 'bh+ns': return of('bh').mass < B.nsbhLimit ? { kind: 'kilonova', product: 'bh', mass: 0.97 * sum, ejecta: true } : { kind: 'nsbh', product: 'bh', mass: 0.98 * sum, ejecta: false };
      case 'ns+ns': return { kind: 'kilonova', product: sum >= B.nsMax ? 'bh' : 'ns', mass: 0.97 * sum, ejecta: true };
      default: return { kind: 'bbh', product: 'bh', mass: 0.955 * sum, ejecta: false }; // ~4.5% radiated, as in GW150914
    }
  };
  Bin.nextStage = (c) => { const o = Bin.outcome(c.a, c.b); return o.ejecta ? 'merger' : Bin.STAGE_OF[o.product]; };

  // Called once, when the pair merges: rewards scale with how well the signal was recorded.
  Bin.finishMerger = function (s, ev) {
    const c = s.chirp, out = Bin.outcome(c.a, c.b), snr = Bin.snr(c), mult = Bin.yieldMult(snr), rw = {};
    for (const k in BB().rewards[out.kind]) rw[k] = BB().rewards[out.kind][k] * mult;
    c.out = out; c.snr = snr; c.detected = snr >= C().snrDetect;
    s.stats.bestSnr = Math.max(s.stats.bestSnr, snr);
    const rewards = Econ().grantOnce(s, 'merge:' + s.cycle, rw);
    ev.push({ type: 'merged', kind: out.kind, snr, detected: c.detected, rewards });
    const cine = { ia: 'ia', kilonova: 'kilonova' }[out.kind] || 'gw';
    ev.push({ type: 'cinematic', id: cine });
    if (out.kind === 'ia') ev.push(...Evo().discover(s, 'type_ia'), ...Bin.markOrigin(s, 'ia'));
    if (out.kind === 'kilonova') ev.push(...Evo().discover(s, 'kilonova'), ...Bin.markOrigin(s, 'kilonova'));
    if (out.kind === 'bbh' && c.detected) ev.push(...Evo().discover(s, 'gw_merger'));
    const seen = { ia: 'type_ia', kilonova: 'kilonova', bbh: 'gw_merger' }[out.kind];
    if (seen) CA.Atlas.note(s, seen, snr);
  };

  // a supernova remnant: 50 yr per game second, Sedov-like growth R ∝ t^(2/5), scaled to Tycho's ~4 pc at 450 yr
  Bin.snrAgeYr = (age) => 50 * age;
  Bin.snrRadius = (yr) => 4 * Math.pow(yr / 450, 0.4);

  /* ---------------- magnetars ---------------- */
  Bin.rollMagnetar = (M0, rand) => M0 >= BB().magnetar.minM0 && rand() < BB().magnetar.chance;
  Bin.magnetarP = (age) => Math.min(BB().magnetar.maxP, Math.sqrt(0.033 * 0.033 + BB().magnetar.spinDown * age));
})(globalThis.CA = globalThis.CA || {});
