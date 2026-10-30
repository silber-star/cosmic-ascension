/* COSMIC ASCENSION — upgrades and abilities.
   cost(level) = ceil(base × growth^level). Run upgrades reset each cycle; permanent ones persist.
   req = stage id that must have been reached this cycle ("remnant" = any remnant stage).
   Names and descriptions are translated in place by data/i18n.js; fx text comes from its 'fx.<id>' keys. */
(function (CA) {
  'use strict';

  CA.UPGRADES = [
    { id: 'well_strength', name: 'Gravity Well Strength', cat: 'Gravity', res: 'matter', base: 10, growth: 1.55, max: 12, req: 'grain',
      desc: 'Your cursor well pulls harder.', fx: (l) => CA.t('fx.well_strength', { n: 20 * l }) },
    { id: 'range', name: 'Attraction Range', cat: 'Gravity', res: 'matter', base: 18, growth: 1.6, max: 10, req: 'grain',
      desc: 'Wider reach for both your body and your well.', fx: (l) => CA.t('fx.range', { n: 12 * l }) },
    { id: 'accretion', name: 'Accretion Efficiency', cat: 'Accretion', res: 'matter', base: 25, growth: 1.62, max: 15, req: 'grain',
      desc: 'Each absorbed mote adds more mass.', fx: (l) => CA.t('fx.accretion', { n: 8 * l }) },
    { id: 'capacitor', name: 'Field Capacitor', cat: 'Energy', res: 'matter', base: 22, growth: 1.6, max: 10, req: 'grain',
      desc: 'Store more energy for abilities.', fx: (l) => CA.t('fx.capacitor', { n: 25 * l }) },
    { id: 'regen', name: 'Charge Regeneration', cat: 'Energy', res: 'matter', base: 40, growth: 1.6, max: 10, req: 'cluster',
      desc: 'Energy refills faster.', fx: (l) => CA.t('fx.regen', { n: (0.8 * l).toFixed(1) }) },
    { id: 'coagulation', name: 'Passive Coagulation', cat: 'Production', res: 'matter', base: 30, growth: 1.5, max: 20, req: 'cluster',
      desc: 'Background collisions add matter and slow, steady growth — even while you are away.', fx: (l) => CA.t('fx.coagulation', { a: (0.25 * l).toFixed(2), b: (0.4 * l).toFixed(1) }) },
    { id: 'flow', name: 'Material Inflow', cat: 'Production', res: 'matter', base: 60, growth: 1.7, max: 10, req: 'cluster',
      desc: 'More material drifts into view.', fx: (l) => CA.t('fx.flow', { n: 12 * l }) },
    { id: 'efficiency', name: 'Field Efficiency', cat: 'Energy', res: 'matter', base: 150, growth: 1.7, max: 8, req: 'core',
      desc: 'The gravity well drains less energy.', fx: (l) => CA.t('fx.efficiency', { n: 8 * l }) },
    { id: 'sticking', name: 'Sticky Surfaces', cat: 'Collisions', res: 'matter', base: 600, growth: 1.7, max: 8, req: 'aggregate',
      desc: 'Higher safe impact speed before material shatters.', fx: (l) => CA.t('fx.sticking', { n: 15 * l }) },
    { id: 'sorting', name: 'Mineral Sorting', cat: 'Production', res: 'heavy', base: 4, growth: 1.8, max: 10, req: 'aggregate',
      desc: 'Extract more heavy elements from orange grains.', fx: (l) => CA.t('fx.sorting', { n: 25 * l }) },
    { id: 'funnel', name: 'Gravitational Funnel', cat: 'Automation', res: 'matter', base: 4000, growth: 1.8, max: 8, req: 'pebble',
      desc: 'Automation: a gentle, free attraction field around your body.', fx: (l) => (l ? CA.t('fx.funnel', { n: l }) : CA.t('fx.off')) },
    { id: 'focusing', name: 'Gravitational Focusing', cat: 'Collisions', res: 'heavy', base: 20, growth: 1.8, max: 8, req: 'planetesimal',
      desc: 'Bigger capture radius.', fx: (l) => CA.t('fx.focusing', { n: 10 * l }) },
    { id: 'sweep', name: 'Orbital Sweep', cat: 'Automation', res: 'heavy', base: 60, growth: 1.9, max: 5, req: 'protoplanet',
      desc: 'Automation: a free gravity pulse at regular intervals.', fx: (l) => (l ? CA.t('fx.sweep', { n: 20 - 2.5 * l }) : CA.t('fx.off')) },
    { id: 'observatory', name: 'Planetary Observatory', cat: 'Research', res: 'heavy', base: 150, growth: 1.8, max: 10, req: 'protostar',
      desc: 'Instruments on your planet study the sky.', fx: (l) => CA.t('fx.observatory', { n: (0.15 * l).toFixed(2) }) },
    { id: 'fusion_stab', name: 'Fusion Stability', cat: 'Stellar', res: 'energy', base: 400, growth: 1.8, max: 8, req: 'protostar',
      desc: 'Smaller pressure fluctuations in your star.', fx: (l) => CA.t('fx.fusion_stab', { n: 12 * l }) },
    { id: 'harvest', name: 'Radiation Harvesting', cat: 'Stellar', res: 'energy', base: 600, growth: 1.6, max: 10, req: 'mainseq',
      desc: 'Capture more of your star\'s light as energy.', fx: (l) => CA.t('fx.harvest', { n: 15 * l }) },
    { id: 'mixing', name: 'Core Mixing', cat: 'Stellar', res: 'matter', base: 2e5, growth: 2.2, max: 6, req: 'mainseq',
      desc: 'Stir fresh hydrogen into the burning core: the main sequence lasts longer.', fx: (l) => CA.t('fx.mixing', { n: 8 * l }) },
    { id: 'survey', name: 'Sky Survey', cat: 'Research', res: 'matter', base: 5e5, growth: 2.4, max: 6, req: 'mainseq',
      desc: 'Turn gathered matter into telescopes that map the galaxy, in any stage.', fx: (l) => CA.t('fx.survey', { n: (0.1 * l).toFixed(1) }) },
    { id: 'probes', name: 'Remnant Probes', cat: 'Research', res: 'energy', base: 1500, growth: 1.6, max: 6, req: 'remnant',
      desc: 'Better instruments for observing remnants.', fx: (l) => CA.t('fx.probes', { n: 25 * l }) },
  ];

  CA.PERM_UPGRADES = [
    { id: 'p_methods', name: 'Scientific Method', cat: 'Permanent', res: 'research', base: 25, growth: 2, max: 10,
      desc: 'All research gains increase.', fx: (l) => CA.t('fx.p_methods', { n: 10 * l }) },
    { id: 'p_inherit', name: 'Primordial Inheritance', cat: 'Permanent', res: 'research', base: 40, growth: 2.2, max: 5,
      desc: 'New cycles begin with free levels of Accretion Efficiency and Field Capacitor.', fx: (l) => CA.t('fx.p_inherit', { n: l }) },
    { id: 'p_deep', name: 'Deep Time', cat: 'Permanent', res: 'research', base: 30, growth: 2, max: 5,
      desc: 'Longer and more efficient offline progress.', fx: (l) => CA.t('fx.p_deep', { a: 8 + 2 * l, b: 50 + 10 * l }) },
    { id: 'p_light', name: 'Ancient Light', cat: 'Permanent', res: 'research', base: 50, growth: 2.1, max: 8,
      desc: 'More energy from every source.', fx: (l) => CA.t('fx.p_light', { n: 10 * l }) },
    { id: 'p_rare', name: 'Rare Phenomena', cat: 'Permanent', res: 'research', base: 60, growth: 2.2, max: 5,
      desc: 'Rare violet anomalies appear more often.', fx: (l) => CA.t('fx.p_rare', { n: 30 * l }) },
    { id: 'p_fidelity', name: 'Simulation Fidelity', cat: 'Permanent', res: 'research', base: 45, growth: 2, max: 6,
      desc: 'Bigger minigame rewards.', fx: (l) => CA.t('fx.p_fidelity', { n: 12 * l }) },
    { id: 'p_legacy', name: 'Remnant Legacy', cat: 'Permanent', res: 'remnants', base: 10, growth: 2, max: 10,
      desc: 'Enriched clouds: more matter from everything.', fx: (l) => CA.t('fx.p_legacy', { n: 10 * l }) },
    { id: 'p_kerr', name: 'Frame Dragging', cat: 'Permanent', res: 'remnants', base: 40, growth: 2.5, max: 4,
      desc: 'Spinning black holes convert more infalling mass into radiation.', fx: (l) => CA.t('fx.p_kerr', { n: [6, 14, 23, 32, 42][l] }) },
  ];

  CA.UPGRADE = {};
  CA.UPGRADES.forEach((u) => { u.perm = false; CA.UPGRADE[u.id] = u; });
  CA.PERM_UPGRADES.forEach((u) => { u.perm = true; CA.UPGRADE[u.id] = u; });

  /* Abilities. key = keyboard shortcut. cost in energy, cd = cooldown (s). */
  CA.ABILITIES = {
    well: { name: 'Gravity Well', key: 'Mouse', cost: 0, cd: 0, desc: 'Hold the left mouse button: attract nearby material toward the cursor. Drains energy while held.' },
    pulse: { name: 'Gravity Pulse', key: '1', cost: 25, cd: 6, desc: 'A wave that pulls everything within a wide radius toward your body.' },
    cool: { name: 'Radiative Cooling', key: '2', cost: 15, cd: 3, desc: 'Dust radiates heat away: lowers core temperature, which lowers the Jeans mass.' },
    damp: { name: 'Damping Field', key: '3', cost: 20, cd: 6, dur: 4, desc: 'Slows material near the cursor for 4 s, so impacts stay below the shattering speed.' },
    boost: { name: 'Accretion Boost', key: '4', cost: 40, cd: 30, dur: 10, desc: 'For 10 s: +50% mass per mote and +40% capture radius.' },
    orbit: { name: 'Orbital Adjustment', key: '5', cost: 35, cd: 14, desc: 'Turns the velocity of nearby material into circular orbits. Orbiting debris spirals in gently.' },
    stabilize: { name: 'Stellar Stabilization', key: '2', cost: 30, cd: 10, desc: 'Pushes pressure back toward balance with gravity (P/G → 1).' },
    outflow: { name: 'Bipolar Outflow', key: '3', cost: 20, cd: 2, desc: 'Jets carry away 8% of the protostar\'s mass, giving energy. Use it to aim for a lower-mass star.' },
    capture: { name: 'Pulse Capture', key: '2', cost: 0, cd: 1.2, desc: 'Press when the thermal pulse ring peaks. Better timing = more heavy elements.' },
    observe: { name: 'Observe', key: '3', cost: 40, cd: 15, desc: 'Take a spectrum of the remnant for research.' },
    pulsecap: { name: 'Record Pulse', key: 'Space', cost: 0, cd: 0.25, desc: 'Press as a pulsar beam crosses the detector line.' },
    gwcap: { name: 'Record Wave', key: 'Space', cost: 0, cd: 0.06, desc: 'Press as the pair crosses the detector line, and once more at the moment of merger.' },
    lens: { name: 'Lensing Observation', key: '3', cost: 30, cd: 8, desc: 'Observe as a background star crosses the Einstein ring for a big research payoff.' },
  };
})(globalThis.CA = globalThis.CA || {});
