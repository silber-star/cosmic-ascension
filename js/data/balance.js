/* COSMIC ASCENSION — every tunable number lives here so balance changes never touch logic code. */
(function (CA) {
  'use strict';
  CA.BAL = {
    saveVersion: 1,
    sim: {
      step: 1 / 60,          // fixed simulation timestep (s)
      maxFrame: 0.1,         // longest frame we integrate; longer gaps become "offline" time
      maxMotes: 240,         // density "normal"; low = 0.5×, high = 1.4×
      spawnRate: 5,          // motes per second at base
      wellRange: 150,        // px at zoom 1
      wellStrength: 6000,
      wellDrag: 0.9,         // velocity damping inside the well, 1/s (keeps it controllable)
      bodyRange: 95,         // natural influence range of the body
      bodyStrength: 1800,
      maxSpeed: 520,
      stickSpeed: 70,        // mote–mote merge threshold
      fragSpeed: 150,        // body impact speed above which fragile bodies shatter
      pulseKick: 170,
      pulseRange: 420,
      diskInflow: 40,        // px/s: how fast disk material drifts in on its near-circular orbit
      diskRelax: 4,          // 1/s: how fast the disk evens motes out onto that orbit
    },
    energy: { cap: 100, capPerLvl: 25, regen: 5, regenPerLvl: 0.8, wellDrain: 9, spark: 12,
      starCapSeconds: 300,   // a star's battery holds this many seconds of its output
      lateCap: 16000 },      // floor once the star is gone (chapter IV): enough for the last Remnant Probes level

    offline: { maxHours: 8, hoursPerLvl: 2, efficiency: 0.5, effPerLvl: 0.1 },
    passive: { matterPerLvl: 0.25, growthPerLvl: 0.004 },
    autosaveSeconds: 30,
    star: {
      sfe: 0.35,             // star-formation efficiency: share of the collapsing core that ends up in the star
      minMass: 0.08,         // hydrogen-burning limit
      maxMass: 120,
      igniteTc: 10,          // MK, hydrogen fusion ignition (order of magnitude)
      msBaseSeconds: 240,    // game seconds a 1 M☉ star spends on the main sequence (×(t/10 Gyr)^0.25)
      msMin: 45, msMax: 900,
      lowMassLimit: 0.5,     // below: no red-giant phase (fully convective)
      ccLimit: 8,            // initial mass above which the core collapses
      directCollapse: 40,    // pre-collapse mass above which no bright supernova occurs
    },
    jeans: { T0: 20, Tmin: 7, Tmax: 30, n0: 1000, M0: 0.5, heat: 0.12, coolStep: 1.6 },
    cycle: { zStart: 0.004, zMax: 0.04, zFromWD: 0.003, zFromSN: 0.008, zFromBH: 0.004, zFromIa: 0.01 },
    minigame: { rewardMatterMotes: 40 },
    ach: { reward: [10, 25, 60, 150] }, // research paid once, by achievement tier
    binary: {
      chandra: 1.4,          // M☉: Chandrasekhar limit
      sepRsun: 200,          // orbital separation while the star evolves (R☉)
      keepShare: 0.5,        // share of the new-cycle remnant reward left when the remnant stays as a companion
      rate: { wd: 0.015, ns: 0.002, bh: 0.02 }, // M☉ per game second at x = 1 (centre of the stable band)
      band: [0.75, 1.25],    // x = rate / steady rate: below → novae, above → common envelope builds up
      valveGain: 2, drift: 0.7, relax: 1.6, noise: 0.16,
      shell: 0.02,           // M☉ of unburnt shell that sets off a nova
      ceTime: 6,             // seconds above the band until a common envelope forms
      xrayEnergy: 2000,      // energy per M☉ accreted by a neutron star or black hole
      spinUp: 39000, minP: 0.0014, mspP: 0.003, // rad/s per M☉ accreted; fastest known spin; "true" millisecond pulsar
      nsMax: 2.7,            // M☉: above this a merged neutron star cannot hold itself up (rigidly spinning TOV limit)
      nsbhLimit: 6,          // M☉: a black hole heavier than this swallows a neutron star whole
      chirp: { T: 34, Tmin: 22, Tmax: 40, N: 24, winBeat: 0.14, winFrac: 0.4, winMerge: 0.12, snrMax: 16, snrDetect: 8, falseCost: 0.6 },
      magnetar: { minM0: 20, chance: 0.5, B: 1e15, maxP: 8, spinDown: 2 },
      rewards: {
        ia: { heavy: 800, research: 70, remnants: 12 }, kilonova: { heavy: 1500, research: 120, remnants: 25 },
        bbh: { research: 150, remnants: 30 }, nsbh: { research: 90, remnants: 18 }, bhwd: { research: 60, remnants: 12 },
        nswd: { heavy: 300, research: 60, remnants: 12 }, wdwd: { heavy: 100, research: 40, remnants: 8 },
      },
    },
    events: {
      firstDelay: 60,        // s before the first cosmic event of a new game
      loadDelay: 20,         // minimum quiet time after loading a save
      globalCd: 55,          // s between any two events
      rate: 1 / 55,          // chance per second that an eligible event starts (Poisson)
      maxGap: 200,           // pity timer: an eligible event is forced after this long without one
      minStageTime: 15,      // never right after entering a stage
      keepKeys: 120,         // per-event grant keys kept in the save
    },
  };
})(globalThis.CA = globalThis.CA || {});
