/* COSMIC ASCENSION — shared helpers (no DOM access, safe for the test runner). */
(function (CA) {
  'use strict';
  const U = (CA.U = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = (t) => t * t * (3 - 2 * t);
  U.rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  U.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.isNum = (v) => typeof v === 'number' && isFinite(v);
  U.TAU = Math.PI * 2;

  // Deterministic RNG (mulberry32) — used for minigame layouts so a level is the same every replay.
  U.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Weighted pick from {key: weight}
  U.weighted = function (weights, r = Math.random()) {
    let total = 0;
    for (const k in weights) total += Math.max(0, weights[k]);
    if (total <= 0) return null;
    let x = r * total;
    for (const k in weights) {
      x -= Math.max(0, weights[k]);
      if (x <= 0) return k;
    }
    return Object.keys(weights)[0];
  };

  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  U.fmt = function (n, digits = 2) {
    if (!U.isNum(n)) return '0';
    const neg = n < 0; n = Math.abs(n);
    let s;
    if (n < 10) s = n.toFixed(n < 1 && n > 0 ? 2 : 1).replace(/\.0$/, '');
    else if (n < 1000) s = Math.floor(n).toString();
    else {
      const e = Math.floor(Math.log10(n) / 3);
      if (e < SUFFIX.length) s = (n / Math.pow(1000, e)).toFixed(digits).replace(/\.?0+$/, '') + SUFFIX[e];
      else s = n.toExponential(2);
    }
    return (neg ? '-' : '') + s;
  };

  U.fmtSci = function (n, d = 2) {
    if (!U.isNum(n)) return '0';
    if (n === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(n)));
    const m = n / Math.pow(10, e);
    return m.toFixed(d) + '×10' + U.sup(e);
  };
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  U.sup = (e) => String(e).split('').map((c) => SUP[c] || c).join('');

  U.M_EARTH = 5.972e24;
  U.M_SUN = 1.989e30;

  U.fmtMass = function (kg) {
    if (!U.isNum(kg) || kg <= 0) return '0 kg';
    const tbl = [
      [1e-12, 1e-15, 'pg'], [1e-9, 1e-12, 'ng'], [1e-6, 1e-9, 'µg'], [1e-3, 1e-6, 'mg'],
      [1, 1e-3, 'g'], [1e3, 1, 'kg'], [1e12, 1e3, 't'],
    ];
    for (const [lim, unit, name] of tbl) if (kg < lim) return trim(kg / unit) + ' ' + name;
    if (kg < 6e21) return U.fmtSci(kg, 1) + ' kg';
    return trim(kg / U.M_EARTH, 3) + ' M⊕';
  };
  function trim(v, d = 3) {
    if (v >= 1e3) return U.fmt(v);
    return Number(v.toPrecision(d)).toString();
  }
  U.fmtMsun = (m) => (m >= 10 ? m.toFixed(1) : m >= 1 ? m.toFixed(2) : m.toFixed(3)) + ' M☉';

  // Korean counts in 만 (10⁴), 억 (10⁸) and 조 (10¹²) instead of thousand / million / billion.
  const ko = () => !!(CA.I18n && CA.I18n.lang === 'ko');
  const trimKo = (v) => (v >= 1e3 ? String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : Number(v.toPrecision(3)).toString());

  U.fmtTime = function (s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (ko()) return h ? h + '시간 ' + m + '분' : m ? m + '분 ' + sec + '초' : sec + '초';
    if (h) return h + 'h ' + m + 'm';
    if (m) return m + 'm ' + String(sec).padStart(2, '0') + 's';
    return sec + 's';
  };

  U.fmtYears = function (yr) {
    if (!U.isNum(yr)) return '—';
    if (ko()) {
      if (yr >= 1e12) return trimKo(yr / 1e12) + '조 년';
      if (yr >= 1e8) return trimKo(yr / 1e8) + '억 년';
      if (yr >= 1e4) return trimKo(yr / 1e4) + '만 년';
      if (yr >= 1) return trimKo(yr) + '년';
      if (yr * 365 >= 1) return trimKo(yr * 365) + '일';
      return trimKo(yr * 365 * 24 * 3600) + '초';
    }
    if (yr >= 1e12) return trim(yr / 1e12) + ' trillion yr';
    if (yr >= 1e9) return trim(yr / 1e9) + ' billion yr';
    if (yr >= 1e6) return trim(yr / 1e6) + ' million yr';
    if (yr >= 1e3) return trim(yr / 1e3) + ' thousand yr';
    if (yr >= 1) return trim(yr) + ' yr';
    if (yr * 365 >= 1) return trim(yr * 365) + ' days';
    return trim(yr * 365 * 24 * 3600) + ' s';
  };

  // Uniform-grid spatial hash for neighbour queries (keeps collisions O(n)).
  class SpatialGrid {
    constructor(cell) { this.cell = cell; this.map = new Map(); }
    clear() { this.map.clear(); }
    key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }
    insert(item, x, y) {
      const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
      let b = this.map.get(k);
      if (!b) { b = []; this.map.set(k, b); }
      b.push(item);
    }
    near(x, y, fn) {
      const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const b = this.map.get(this.key(cx + i, cy + j));
        if (b) for (let n = 0; n < b.length; n++) fn(b[n]);
      }
    }
  }
  U.SpatialGrid = SpatialGrid;

  /* The key the player means, lower-cased. e.key is 'ㅕ' or 'Process' while a Korean IME is on,
     so non-Latin values fall back to the physical key; a Latin e.key is kept so other layouts work. */
  U.keyOf = function (e) {
    const k = e.key || '';
    if (k.length === 1 && k.charCodeAt(0) < 128) return k.toLowerCase();
    if (k.length > 1 && k !== 'Process' && k !== 'Unidentified') return k;
    const m = /^(?:Key|Digit|Numpad)(\w)$/.exec(e.code || '');
    return m ? m[1].toLowerCase() : e.code || k;
  };

  /* Auto quality. requestAnimationFrame is capped by the display, so frame time cannot show spare
     power: the level only goes down, and a reload tries full quality again. */
  U.Governor = class {
    constructor(max = 2) { this.max = max; this.level = 0; this.ema = 16; this.slow = 0; }
    sample(ms) {
      if (ms <= 0 || ms > 400) return this.level; // a tab switch says nothing about the device
      this.ema += (ms - this.ema) * 0.05;
      this.slow = this.ema > 26 ? this.slow + ms : 0;
      if (this.slow > 2500 && this.level < this.max) { this.level++; this.slow = 0; this.ema = 16; }
      return this.level;
    }
  };

  U.deepClone = (o) => JSON.parse(JSON.stringify(o));
})(globalThis.CA = globalThis.CA || {});
