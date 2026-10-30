/* COSMIC ASCENSION — pure models used by minigames (testable without a browser). */
(function (CA) {
  'use strict';
  const U = CA.U;
  const M = (CA.Models = {});

  /* Two-body orbital elements from position/velocity relative to a central mass (mu = G·M). */
  M.orbitElements = function (x, y, vx, vy, mu) {
    const r = Math.hypot(x, y), v2 = vx * vx + vy * vy;
    const energy = v2 / 2 - mu / r;
    const h = x * vy - y * vx;
    const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (mu * mu)));
    if (energy < 0 && e < 1) {
      const a = -mu / (2 * energy);
      return { a, e, rp: a * (1 - e), ra: a * (1 + e), energy, h, bound: true, period: U.TAU * Math.sqrt((a * a * a) / mu) };
    }
    return { a: Infinity, e: Math.max(1, e), rp: (h * h) / (mu * (1 + e)), ra: Infinity, energy, h, bound: false, period: Infinity };
  };

  /* ---------- Stellar Stabilization toy model ----------
     T : core temperature (1 = equilibrium)        ε = F^0.3 · T^ν   (fusion rate, very temperature-sensitive)
     x : P/G — pressure over effective gravity (1 = hydrostatic equilibrium)
     c : the player's core compression (0–1). Squeezing raises effective gravity at once,
         and heats the core over time (compressional heating).
     dT/dt = a(c − ½) + (ε − 1)/C − k(x − 1)    compression + fusion heat; expansion (x>1) cools
     dx/dt = (T / G_eff − x)/τ                   pressure follows temperature with a lag
     G_eff = (1 + 0.2(1 − F)) · (0.75 + 0.5c)     helium ash makes the core need more pressure
     Low ν is self-regulating (a real star's thermostat); high ν needs active control.           */
  // goal = energy to deliver while in balance; fuel allows at most 1/burn, so burn = 1/(1.3·goal).
  const SS_LEVELS = [
    null,
    // auth: how strongly the compression slider acts; low levels forgive a late or large move
    { nu: 3, fb: 0.8, goal: 52, time: 60, band: 0.12, plume: 0.06, warn: 1.5, ash: 0, auth: 0.35 },
    { nu: 4, fb: 0.6, goal: 80, time: 62, band: 0.11, plume: 0.07, warn: 1.3, ash: 0.2, auth: 0.5 },
    { nu: 5, fb: 0.55, goal: 76, time: 70, band: 0.10, plume: 0.08, warn: 1.1, ash: 0.2, auth: 0.7 },
    { nu: 5.8, fb: 0.55, goal: 82, time: 75, band: 0.095, plume: 0.085, warn: 0.9, ash: 0.2, auth: 0.85 },
    { nu: 6.3, fb: 0.55, goal: 88, time: 80, band: 0.09, plume: 0.09, warn: 0.7, ash: 0.2, auth: 1 },
  ];
  SS_LEVELS.forEach((l) => l && (l.burn = 1 / (1.3 * l.goal)));
  M.SS_LEVELS = SS_LEVELS;
  M.SS_PARAMS = { a: 0.5, C: 4, k: 1.5, tau: 0.8 };

  M.newStar = function (level) {
    const L = SS_LEVELS[U.clamp(level, 1, 5)];
    return {
      level, nu: L.nu, ash: L.ash, auth: L.auth, fb: L.fb, goal: L.goal, timeLimit: L.time, band: L.band, burnRate: L.burn,
      T: 1, x: 1, dpg: 0, pg: 1, comp: 0.5, F: 1, G: 1, eps: 1, t: 0,
      output: 0, inBand: 0, outTimer: 0, failed: null, won: false,
      nextPlume: 6, plumeAt: -1, plumeMag: 0, plumeWarnLead: L.warn, plumeSize: L.plume,
      ventCd: 0, vents: 0,
    };
  };

  M.vent = function (m) {
    if (m.ventCd > 0 || m.failed || m.won) return false;
    m.T -= 0.06; m.ventCd = 2; m.vents++;
    return true;
  };

  M.stepStar = function (m, dt, rand = Math.random) {
    if (m.failed || m.won) return;
    m.t += dt;
    m.ventCd = Math.max(0, m.ventCd - dt);
    const P = M.SS_PARAMS, c = U.clamp(m.comp, 0, 1);
    const push = (c - 0.5) * m.auth;
    m.G = (1 + m.ash * (1 - m.F)) * (1 + 0.5 * push);
    m.eps = Math.min(5, Math.pow(m.F, 0.3) * Math.pow(Math.max(0.2, m.T), m.nu));
    const dT = P.a * push + m.fb * (m.eps - 1) / P.C - P.k * (m.x - 1);
    const dx = (m.T / m.G - m.x) / P.tau;
    m.dT = dT;
    m.T = U.clamp(m.T + dT * dt, 0.3, 2);
    m.x = U.clamp(m.x + dx * dt, 0.2, 2.5);
    m.dpg = dx; m.pg = m.x;
    m.F = Math.max(0, m.F - m.eps * m.burnRate * dt);

    // telegraphed convective plumes
    if (m.plumeAt < 0 && m.t >= m.nextPlume - m.plumeWarnLead) {
      m.plumeAt = m.nextPlume;
      m.plumeMag = (rand() < 0.5 ? -1 : 1) * m.plumeSize * (0.7 + rand() * 0.6);
    }
    if (m.plumeAt >= 0 && m.t >= m.plumeAt) {
      m.T += m.plumeMag;
      m.plumeAt = -1;
      m.nextPlume = m.t + 5 + rand() * 4;
    }

    const inBand = Math.abs(m.x - 1) < m.band;
    if (inBand) { m.inBand += dt; m.output += m.eps * dt; }
    if (m.x < 0.65 || m.x > 1.45 || m.T > 1.7) m.outTimer += dt; else m.outTimer = Math.max(0, m.outTimer - dt);
    if (m.outTimer > 2) m.failed = m.x < 1 ? 'collapse' : 'runaway';
    else if (m.F <= 0) m.failed = 'fuel';
    else if (m.t >= m.timeLimit && m.output < m.goal) m.failed = 'time';
    if (!m.failed && m.output >= m.goal) m.won = true;
  };

  M.starScore = (m) => Math.round(m.output * 10 + (m.inBand / Math.max(1, m.t)) * 600 + m.F * 400 + Math.max(0, m.timeLimit - m.t) * 5);

  /* ---------- Spectral Analysis ----------
     Rest wavelengths (nm, air) with relative strengths. A task is a spectrum built from a level's true elements:
     absorption dips on a blackbody continuum, or emission lines on a dark background. Lines are shifted by the
     Doppler effect, λ = λ₀(1 + v/c) (non-relativistic; fine for v ≪ c).                                       */
  M.C_KMS = 299792.458;
  M.SA_ELEMENTS = {
    H: [[656.3, 1], [486.1, 0.8], [434.0, 0.65], [410.2, 0.5]], // Balmer series
    He: [[587.6, 1], [667.8, 0.6], [447.1, 0.7], [501.6, 0.5]],
    Na: [[589.0, 1], [589.6, 0.8]], // sodium D doublet
    Ca: [[393.4, 1], [396.8, 0.9]], // Ca II K and H
    Mg: [[516.7, 0.8], [517.3, 0.9], [518.4, 1]], // Mg I b triplet
    Fe: [[404.6, 0.7], [438.4, 0.8], [440.5, 0.6], [495.7, 0.5], [527.0, 0.8], [532.8, 0.6]],
    OIII: [[500.7, 1], [495.9, 0.33]], // forbidden [O III], once blamed on "nebulium"
    NII: [[658.4, 1], [654.8, 0.33]], // forbidden [N II], on both sides of Hα
    Ba: [[455.4, 1], [493.4, 0.8], [614.2, 0.6], [649.7, 0.5]], // Ba II, an s-process element
    Tc: [[403.1, 0.8], [423.8, 1], [426.2, 0.9], [429.7, 0.8]], // Tc I: technetium has no stable isotope
  };
  // els: element → [depth or height, line width σ in nm]. v and T are fixed numbers or [min, max] ranges to measure.
  const SA_LEVELS = [null,
    { kind: 'abs', T: 9500, els: { H: [0.6, 1.6] }, cands: ['H', 'He', 'Na'], v: 0, range: [370, 720], noise: 0.01, time: 90 },
    { kind: 'abs', T: 5800, els: { H: [0.3, 0.5], Na: [0.55, 0.35], Ca: [0.75, 1.0], Mg: [0.4, 0.3], Fe: [0.35, 0.25] }, cands: ['H', 'He', 'Na', 'Ca', 'Mg', 'Fe'], v: 0, range: [370, 720], noise: 0.015, time: 110 },
    { kind: 'abs', T: 5200, els: { Ca: [0.7, 0.9], Mg: [0.45, 0.3], Na: [0.5, 0.35], H: [0.3, 0.5] }, cands: ['H', 'He', 'Na', 'Ca', 'Mg', 'Fe'], v: [3000, 12000], range: [370, 720], noise: 0.02, time: 120 },
    { kind: 'emis', T: 0, els: { H: [0.6, 0.35], He: [0.18, 0.3], OIII: [1, 0.3], NII: [0.45, 0.3] }, cands: ['H', 'He', 'Na', 'OIII', 'NII', 'Fe'], v: 0, range: [370, 720], noise: 0.02, time: 120 },
    { kind: 'abs', T: [3000, 3800], fitT: true, els: { Na: [0.6, 0.4], Ca: [0.5, 0.8], Ba: [0.45, 0.3], Tc: [0.4, 0.3] }, cands: ['H', 'He', 'Na', 'Ca', 'Fe', 'Ba', 'Tc'], v: 0, range: [370, 1000], noise: 0.02, time: 130 },
  ];
  M.SA_LEVELS = SA_LEVELS;
  M.planck = (lam, T) => 1 / (Math.pow(lam, 5) * (Math.exp(1.4388e7 / (lam * T)) - 1)); // λ in nm; hc/k = 1.4388×10⁷ nm·K
  M.wienPeak = (T) => 2.898e6 / T; // Wien's law, nm
  // blackbody normalised to 1 at its brightest point inside the range (the curve has one peak)
  M.saContinuum = (range, lam, T) => M.planck(lam, T) / M.planck(U.clamp(M.wienPeak(T), range[0], range[1]), T);

  M.saNew = function (level, rand = Math.random) {
    const L = SA_LEVELS[U.clamp(level, 1, 5)];
    const pick = (x) => (Array.isArray(x) ? x[0] + rand() * (x[1] - x[0]) : x);
    const v = Math.round(pick(L.v) / 10) * 10, T = Math.round(pick(L.T) / 10) * 10;
    const lines = [];
    for (const el in L.els) {
      const [d, w] = L.els[el];
      for (const [lam0, str] of M.SA_ELEMENTS[el]) {
        const lam = lam0 * (1 + v / M.C_KMS);
        if (lam >= L.range[0] && lam <= L.range[1]) lines.push({ el, lam, depth: d * str, w });
      }
    }
    return {
      level, kind: L.kind, want: Object.keys(L.els), cands: L.cands.slice(), v, T, range: L.range.slice(), lines, noise: L.noise, time: L.time,
      fitV: Array.isArray(L.v), fitT: !!L.fitT, vTol: 300, tTol: 0.06, tries: 3,
    };
  };
  M.saFlux = function (task, lam) {
    let s = 0;
    for (const ln of task.lines) { const x = (lam - ln.lam) / ln.w; if (x * x < 30) s += ln.depth * Math.exp(-0.5 * x * x); }
    if (task.kind === 'emis') return 0.04 + s;
    return M.saContinuum(task.range, lam, task.T) * (1 - Math.min(0.95, s));
  };
  // guess: { els: [...], v, T }
  M.saCheck = function (task, guess) {
    const got = guess.els || [];
    const missing = task.want.filter((e) => !got.includes(e)), extra = got.filter((e) => !task.want.includes(e));
    const vOk = !task.fitV || Math.abs((guess.v || 0) - task.v) <= task.vTol;
    const tOk = !task.fitT || Math.abs((guess.T || 0) - task.T) / task.T <= task.tTol;
    const unexplained = task.lines.filter((ln) => !got.includes(ln.el)).map((ln) => ln.lam);
    return { ok: !missing.length && !extra.length && vOk && tOk, missing, extra, vOk, tOk, unexplained };
  };
  M.saScore = function (task, guess, timeLeft, triesUsed) {
    let s = 1000 + Math.max(0, timeLeft) * 8 - (triesUsed - 1) * 250;
    if (task.fitV) s += 300 * (1 - Math.min(1, Math.abs(guess.v - task.v) / task.vTol));
    if (task.fitT) s += 300 * (1 - Math.min(1, Math.abs(guess.T - task.T) / task.T / task.tTol));
    return Math.round(Math.max(100, s));
  };

  /* ---------- DART: kinetic impact on a moonlet ----------
     The impactor's momentum, multiplied by β (extra push from the ejecta; DART measured β ≈ 3.6), changes the moonlet's
     velocity: Δv = β (m/M) v_rel. Its new orbit around the primary follows from vis-viva.                          */
  M.DART_BETA = 3.6;
  M.dartImpact = function (moon, mu, rel, massRatio, beta = M.DART_BETA) {
    const before = M.orbitElements(moon.x, moon.y, moon.vx, moon.vy, mu);
    const k = beta * massRatio;
    const vx = moon.vx + k * rel.vx, vy = moon.vy + k * rel.vy;
    const after = M.orbitElements(moon.x, moon.y, vx, vy, mu);
    return { vx, vy, before, after, dP: after.bound ? after.period / before.period - 1 : Infinity };
  };

  /* ---------- Pulsar Timing ----------
     Pulses are emitted once per half turn (two beams). Arrival = emission + delays: light-travel (Rømer) delay
     from an orbit (binary pulsar) or from planets tugging the pulsar. Spin-down stretches the period;
     a glitch suddenly shortens it. Effects are exaggerated by many orders of magnitude so they are playable.  */
  const PT_LEVELS = [null,
    { P: 0.9, n: 26, need: 20, win: 0.09, faint: 0, falses: 8, show: true },
    { P: 0.7, Pend: 0.95, n: 28, need: 21, win: 0.08, faint: 0, falses: 8, show: true },
    { P: 0.8, glitch: 0.5, dP: -0.06, n: 30, need: 22, win: 0.08, faint: 0.25, falses: 7 },
    { P: 0.75, orbits: [{ A: 0.12, Pb: 13, ph: 0 }], n: 32, need: 23, win: 0.075, faint: 0.35, falses: 7 },
    { P: 0.6, orbits: [{ A: 0.07, Pb: 7, ph: 1 }, { A: 0.045, Pb: 11.5, ph: 2.5 }], n: 36, need: 26, win: 0.07, faint: 0.55, falses: 6 },
  ];
  M.PT_LEVELS = PT_LEVELS;
  M.ptDelay = (L, t) => (L.orbits || []).reduce((a, o) => a + o.A * Math.sin(U.TAU * t / o.Pb + o.ph), 0);
  M.ptNew = function (level, rand = Math.random) {
    const L = PT_LEVELS[U.clamp(level, 1, 5)];
    const emit = [], arr = [], per = [], faint = [];
    let te = 2.5;
    for (let i = 0; i < L.n; i++) {
      let P = L.Pend ? U.lerp(L.P, L.Pend, i / (L.n - 1)) : L.P;
      if (L.glitch && i >= Math.floor(L.n * L.glitch)) P *= 1 + L.dP;
      if (i > 0) te += P;
      emit.push(te); per.push(P); arr.push(te + M.ptDelay(L, te));
      faint.push(i > 2 && rand() < L.faint);
    }
    return { level, L, emit, arr, per, faint, P0: L.P, t: 0, idx: 0, hit: arr.map(() => false), res: [], hits: 0, misses: 0, falses: 0, won: false, failed: null };
  };
  // a key press at time t: scores the nearest unscored pulse within the window
  M.ptPress = function (m, t) {
    if (m.won || m.failed) return { hit: false };
    let best = -1, bd = Infinity;
    for (let i = Math.max(0, m.idx - 1); i < m.arr.length && m.arr[i] < t + m.L.win + 0.01; i++) {
      const d = Math.abs(t - m.arr[i]);
      if (!m.hit[i] && d <= m.L.win && d < bd) { bd = d; best = i; }
    }
    if (best < 0) { m.falses++; if (m.falses > m.L.falses) m.failed = 'spam'; return { hit: false }; }
    m.hit[best] = true; m.hits++;
    // timing residual against a constant-period clock started at the first pulse — reveals spin-down, glitches, orbits
    m.res.push({ i: best, t, dt: t - m.arr[best], model: t - (m.arr[0] + best * m.P0) });
    return { hit: true, i: best, dt: t - m.arr[best] };
  };
  M.ptStep = function (m, dt) {
    if (m.won || m.failed) return;
    m.t += dt;
    while (m.idx < m.arr.length && m.t > m.arr[m.idx] + m.L.win) { if (!m.hit[m.idx]) m.misses++; m.idx++; }
    if (m.misses > m.L.n - m.L.need) m.failed = 'missed';
    else if (m.idx >= m.arr.length) { if (m.hits >= m.L.need) m.won = true; else m.failed = 'missed'; }
  };
  M.ptScore = (m) => Math.round(m.hits * 40 + m.res.reduce((a, r) => a + Math.max(0, 1 - Math.abs(r.dt) / m.L.win) * 30, 0) - m.falses * 25);

  /* ---------- Black Hole Approach ----------
     The probe moves in the pseudo-Newtonian potential Φ = −GM/(r − r_s) (Paczyński & Wiita 1980). Like a
     non-spinning black hole it has its innermost stable circular orbit (ISCO) at 3 r_s and its marginally bound
     orbit at 2 r_s. Light (level 5) follows the exact Schwarzschild photon-orbit equation d²u/dφ² = −u + 1.5 r_s u²
     (u = 1/r): photon sphere at 1.5 r_s, critical impact parameter b_c = (√27/2) r_s ≈ 2.6 r_s.
     A hovering clock runs slow by √(1 − r_s/r); tides stretch a probe of length ℓ by 2GMℓ/(r − r_s)³.          */
  M.BH = { rs: 22, GM: 6e5 }; // arena units: px and s
  M.BH_BC = Math.sqrt(27) / 2; // critical impact parameter in r_s
  M.bhAccel = function (x, y, GM, rs) { const r = Math.hypot(x, y), k = -GM / ((r - rs) * (r - rs) * r); return [k * x, k * y]; };
  M.bhVcirc = (r, GM, rs) => Math.sqrt(GM * r) / (r - rs);
  M.bhLcirc = (r, GM, rs) => (r * Math.sqrt(GM * r)) / (r - rs);
  M.bhVeff = (r, L, GM, rs) => (L * L) / (2 * r * r) - GM / (r - rs); // effective potential per unit mass
  M.bhDilation = (r, rs) => Math.sqrt(Math.max(0, 1 - rs / r));
  // tidal stretch relative to the probe's limit: 1 at radius tideR (in r_s), growing as (r − r_s)⁻³
  M.bhTide = (r, rs, tideR) => (tideR ? Math.pow(((tideR - 1) * rs) / Math.max(1e-9, r - rs), 3) : 0);
  // Trace a light ray launched inward from radius R with impact parameter b (RK4 in φ). Returns whether it fell in,
  // the angle it swept around the hole, its closest approach, and with opts.every the path as [r, φ] samples.
  M.bhPhoton = function (b, R, rs, opts = {}) {
    const h = opts.step || 0.002, rOut = opts.rOut || R * 1.5, every = opts.every || 0, pts = [];
    const f = (u) => -u + 1.5 * rs * u * u;
    let u = 1 / R, du = Math.sqrt(Math.max(0, 1 / (b * b) - u * u + rs * u * u * u)), phi = 0, umax = u;
    for (let i = 0; i < 400000; i++) {
      if (every && i % every === 0) pts.push([1 / u, phi]);
      const k1u = du, k1v = f(u), k2u = du + 0.5 * h * k1v, k2v = f(u + 0.5 * h * k1u);
      const k3u = du + 0.5 * h * k2v, k3v = f(u + 0.5 * h * k2u), k4u = du + h * k3v, k4v = f(u + h * k3u);
      u += (h / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
      du += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
      phi += h;
      if (u > umax) umax = u;
      if (u >= 1 / rs) { if (every) pts.push([rs, phi]); return { captured: true, swept: phi, rmin: rs, pts }; }
      if (u <= 1 / rOut && du < 0) { if (every) pts.push([1 / u, phi]); return { captured: false, swept: phi, rmin: 1 / umax, pts }; }
    }
    return { captured: true, swept: phi, rmin: 1 / umax, pts };
  };

  /* ---------- Supernova Survival ----------
     Neutrinos: a collapsing core sheds ~99% of its energy as neutrinos within ~10 s. They leave at once, while the
     shock needs hours to reach the surface (SN 1987A: neutrinos ~3 h before the light). A detector sees a short
     burst of events on top of a random background.
     Light curve (toy): radioactive heating by ⁵⁶Ni → ⁵⁶Co → ⁵⁶Fe (half-lives 6.1 d and 77.2 d) seen through a
     diffusion delay, L(t) = (1 − e^{−(t/τ_d)²}) · [(1 − k) e^{−t/τ_Ni} + k e^{−t/τ_Co}], k = ε_Co/ε_Ni ≈ 0.174.   */
  M.SN_HALF = { Ni: 6.1, Co: 77.2 };
  M.snLight = function (d, tauD) {
    const tNi = M.SN_HALF.Ni / Math.LN2, tCo = M.SN_HALF.Co / Math.LN2, k = 0.174;
    return (1 - Math.exp(-Math.pow(d / tauD, 2))) * ((1 - k) * Math.exp(-d / tNi) + k * Math.exp(-d / tCo));
  };
  M.snPeak = function (tauD) { // day and value of maximum light (the curve has one peak)
    let best = 0, bd = 0;
    for (let d = 0.5; d < 400; d += 0.5) { const l = M.snLight(d, tauD); if (l > best) { best = l; bd = d; } }
    return { day: bd, L: best };
  };
  // fronts: dir +1 expands from the star, −1 is a reverse shock moving inward. A point is safe inside a gap.
  M.snFrontR = (f, t) => (f.dir > 0 ? f.r0 + f.v * (t - f.t0) : f.r0 - f.v * (t - f.t0));
  M.snInGap = (f, ang) => f.gaps.some((gp) => Math.abs(Math.atan2(Math.sin(ang - gp.a), Math.cos(ang - gp.a))) <= gp.w);
  const SN_LEVELS = [null,
    { bg: 0.35, burst: 16, watch: [4, 7], falses: 2, fronts: [{ dir: 1, v: 95, dt: 0, gaps: 3, w: 0.34 }], need: { O: 5 }, extra: 4, hull: 3, tauD: [14, 24], days: 4, peakTol: 0.95, tries: 2 },
    { bg: 0.5, burst: 14, watch: [4, 8], falses: 2, fronts: [{ dir: 1, v: 105, dt: 0, gaps: 3, w: 0.28 }], need: { O: 4, Si: 4 }, extra: 3, hull: 3, tauD: [14, 26], days: 4, peakTol: 0.97, tries: 2 },
    { bg: 0.6, burst: 13, watch: [5, 9], falses: 1, fronts: [{ dir: 1, v: 110, dt: 0, gaps: 2, w: 0.26 }, { dir: -1, v: 90, dt: 6, gaps: 2, w: 0.26 }], need: { O: 3, Si: 3, Fe: 3 }, extra: 3, hull: 3, tauD: [16, 28], days: 4, peakTol: 0.98, tries: 2 },
    { bg: 0.6, burst: 13, watch: [5, 9], falses: 1, fronts: [{ dir: 1, v: 115, dt: 0, gaps: 2, w: 0.24 }, { dir: -1, v: 95, dt: 5, gaps: 2, w: 0.24 }], need: { O: 3, Si: 3, Fe: 3 }, extra: 2, hull: 2, tauD: [16, 28], days: 12, tail: { mark: 100, tol: 0.1 } },
    { bg: 1.1, burst: 11, watch: [6, 10], falses: 1, needAlert: true, fronts: [{ dir: 1, v: 120, dt: 0, gaps: 2, w: 0.22 }, { dir: -1, v: 100, dt: 5, gaps: 2, w: 0.22 }], need: { O: 3, Si: 3, Fe: 3 }, extra: 2, hull: 2, tauD: [60, 70], days: 10, peakTol: 0.985, tries: 1 },
  ];
  M.SN_LEVELS = SN_LEVELS;
  M.SN_ALERT_WIN = 3; // seconds after the first burst neutrino in which an alert counts
  // the neutrino record of one run: background events plus a burst at the collapse time tc
  M.snNuNew = function (L, rand) {
    const tc = L.watch[0] + rand() * (L.watch[1] - L.watch[0]), ev = [];
    for (let t = -Math.log(1 - rand()) / L.bg; t < tc + 30; t += -Math.log(1 - rand()) / L.bg) ev.push({ t, burst: false });
    for (let i = 0; i < L.burst; i++) ev.push({ t: tc + (i ? Math.pow(rand(), 2) * 2 : 0), burst: true }); // front-loaded, like a cooling core
    ev.sort((a, b) => a.t - b.t);
    return { tc, ev };
  };
  // an alert at time t: 'ok' inside the window, 'false' before the collapse, 'late' after the window
  M.snAlert = (nu, t) => (t < nu.tc ? 'false' : t <= nu.tc + M.SN_ALERT_WIN ? 'ok' : 'late');
})(globalThis.CA = globalThis.CA || {});
