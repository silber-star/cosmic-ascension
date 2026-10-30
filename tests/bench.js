/* COSMIC ASCENSION — frame cost per stage. Not part of the game or the build.
   Open index.html?sandbox, then in the console:
     var s = document.createElement('script'); s.src = 'tests/bench.js'; document.body.append(s);
   and when it has loaded: await CA.bench()
   Prints median ms per frame: update (logic), js (drawing calls), and with CA.bench(90, true) also cpu.
   Canvas work is queued on the GPU, so js leaves out the pixels. cpu forces them by reading one pixel
   back, which makes the browser paint on the CPU from then on: a worst case, and only for one page load. */
(function (CA) {
  'use strict';
  const G = CA.Game;
  const STAGES = {
    grain: (s) => { s.stage = 'grain'; },
    core: (s) => { s.stage = 'core'; },
    planet: (s) => { s.stage = 'planet'; s.zone = 'inner'; s.mass = 6e24; },
    mainseq: (s) => { s.stage = 'mainseq'; s.star = Object.assign(s.star || {}, { M0: 1.2, M: 1.2, Tc: 10, fuel: 1, pg: 1, comp: 1, rg: 1, ignited: true }); },
    supergiant: (s) => { s.stage = 'supergiant'; s.star = Object.assign(s.star || {}, { M0: 15, M: 15, Tc: 10, fuel: 1, pg: 1, comp: 1, rg: 80, ignited: true }); },
    neutronstar: (s) => { s.stage = 'neutronstar'; s.remnant = Object.assign(s.remnant || {}, { type: 'ns', mass: 1.4, P: 1, phase: 0, T: 1e6, age: 0 }); },
    blackhole: (s) => { s.stage = 'blackhole'; s.remnant = Object.assign(s.remnant || {}, { type: 'bh', mass: 10, accr: 0, age: 0 }); },
  };
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const p95 = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)];

  CA.bench = async function (frames = 90, read = false) {
    const ctx = document.getElementById('cosmos').getContext('2d'), rows = [];
    const saved = G.state, wasMenu = G.menu;
    G.menu = false; G.paused = false;
    for (const id in STAGES) {
      const s = CA.State.create();
      STAGES[id](s); G.state = s; G.lens = null;
      G.world.reset(window.innerWidth, window.innerHeight, null);
      for (let i = 0; i < 400; i++) G.update(1 / 60); // let the field fill up
      const up = [], js = [], px = [];
      for (let i = 0; i < frames; i++) { // JavaScript only: what the page spends before handing the frame to the GPU
        let t = performance.now();
        G.update(1 / 60); up.push(performance.now() - t);
        t = performance.now();
        CA.Render.draw(G); js.push(performance.now() - t);
      }
      rows.push({ stage: id, motes: G.world.motes.length, update: +med(up).toFixed(2), js: +med(js).toFixed(2), jsP95: +p95(js).toFixed(2) });
      if (read) {
        for (let i = 0; i < frames; i++) {
          const t = performance.now();
          CA.Render.draw(G); ctx.getImageData(0, 0, 1, 1); px.push(performance.now() - t);
        }
        rows[rows.length - 1].cpu = +med(px).toFixed(2);
      }
      await new Promise((r) => setTimeout(r));
    }
    G.state = saved; G.menu = wasMenu;
    return rows;
  };
})(globalThis.CA);
