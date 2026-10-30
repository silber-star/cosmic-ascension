/* COSMIC ASCENSION — dynamic cosmic events (data). Behaviour lives in js/core/events.js.
   mode      how the event plays out
             catch     – tagged motes arrive; catch them before the event ends (grab: touching the well catches)
             impactor  – one large body is aimed at you: damp it (merge), orbit it (moon) or let it hit (shatter)
             calm      – turbulence: absorb material intact; shattered impacts count against you
             front     – an expanding front; use the response ability while it is inside the window
             pulsation – the body oscillates; use the response ability near maximum expansion
   stages    the ONLY stages where the event can start; when(s) adds a science condition
   warn      seconds of telegraph before the event becomes active; dur = seconds of the active phase
   cooldown  seconds before the same event can start again (a global cooldown applies too: BAL.events)
   outcomes  what each result does. reward is paid once per event instance (Econ.grantOnce);
             motes = matter worth that many motes of the current stage. effect is a one-time change:
             progress (± share of the stage's mass range, never below the stage start), moon,
             compress (core mass), drain (share of stored energy). */
(function (CA) {
  'use strict';

  CA.EVENTS = [
    {
      id: 'sn_shock', name: 'Supernova Shock Wave', mode: 'front', geometry: 'plane',
      stages: ['core'], cooldown: 200, weight: 1, warn: 4,
      f0: -5, f1: 5, speed: 1.4, win: [-1.3, 1.3], respond: 'pulse', timeout: 'pass',
      warnText: 'A distant star has exploded. Its shock front is about to sweep through your cloud.',
      how: 'Press Gravity Pulse (1) while the bright front crosses your core to ride the compression.',
      science: 'Shock waves from supernovae and massive-star winds can squeeze nearby clouds past the point of collapse ("triggered star formation"). Short-lived isotopes such as aluminium-26 in old meteorites suggest the Sun\'s birth cloud was enriched by a nearby massive star.',
      outcomes: {
        success: { good: true, effect: 'compress', amount: 0.2, reward: { research: 8 }, discovery: 'triggered_collapse', text: 'You rode the shock: the core was compressed (+20% core mass).' },
        pass: { effect: 'compress', amount: 0.06, heat: 1, text: 'The shock passed: a little compression (+6% core mass), but it heated the gas by 1 K.' },
      },
    },
    {
      id: 'disk_disturbance', name: 'Disk Disturbance', mode: 'calm',
      stages: ['aggregate', 'pebble', 'planetesimal'], cooldown: 170, weight: 1, warn: 4, dur: 18,
      turb: 400, spawnMult: 1.8, fragMult: 0.45, target: 5, brokenCost: 2, respond: 'damp',
      warnText: 'A spiral density wave is sweeping through the disk.',
      how: 'Turbulence speeds up collisions. Use the Damping Field (3) so material arrives slowly: +1 per intact catch, −2 per shattered one.',
      science: 'Disks are stirred by turbulence, spiral waves and passing perturbers, which makes collisions faster and more destructive. Stirred gas can also form pressure bumps and vortices that trap dust — ALMA has imaged a lopsided dust trap around the young star Oph IRS 48.',
      outcomes: {
        success: { good: true, buff: { id: 'ev_dusttrap', key: 'matter', mult: 1.5, t: 60, name: 'Dust trap' }, reward: { research: 8, motes: 20 }, discovery: 'dust_trap', text: 'The wave left a pressure bump that traps dust: +50% matter for 60 s.' },
        fail: { text: 'The turbulence settled. Too much material shattered to form a dust trap.' },
      },
    },
    {
      id: 'meteor_shower', name: 'Meteor Stream', mode: 'catch',
      stages: ['planetesimal', 'protoplanet', 'planet'], cooldown: 160, weight: 1.2, warn: 4, dur: 13,
      spawnDur: 9, count: 26, target: 9, mote: 'meteor', pattern: 'stream', speed: 240, grab: true, respond: 'well',
      warnText: 'A stream of collision debris is approaching from the glowing radiant.',
      how: 'Hold the mouse and sweep your gravity well across the meteors — touching one catches it.',
      science: 'When bodies collide, the fragments spread along the parent\'s orbit into a stream. Today Earth crosses the debris trails of comets: the parallel tracks seem to fan out from one point in the sky, the radiant, which is why each meteor shower is named after a constellation.',
      outcomes: {
        success: { good: true, reward: { heavy: 30, research: 8, motes: 25 }, discovery: 'meteor_stream', text: 'Stream harvested: the fragments carried metal-rich rock.' },
        fail: { text: 'Most of the stream flew past. Every meteor you caught still counts.' },
      },
    },
    {
      id: 'asteroid_impact', name: 'Asteroid Collision', mode: 'impactor',
      stages: ['planetesimal', 'protoplanet', 'planet'], cooldown: 200, weight: 1, warn: 5, dur: 14,
      mote: 'impactor', size: 6, pattern: 'impactor', speed: 215, respond: 'damp',
      roche: 2.44, // body radii: fluid Roche limit for equal densities, 2.44 R (ρ_body/ρ_moon)^(1/3)
      warnText: 'A large body is on a collision course — follow the red trajectory.',
      how: 'Damping Field (3) on its path → it merges gently. Orbital Adjustment (5) near it → it becomes a moon (inside the dashed Roche limit, a ring). Untouched, the fast hit shatters.',
      science: 'Giant impacts were common while planets formed; one probably made Earth\'s Moon. Whether two bodies merge or shatter depends mostly on impact speed. Some moons were captured instead — Neptune\'s Triton orbits backwards, a sign it was once a passing body.',
      outcomes: {
        captured: { good: true, effect: 'moon', reward: { research: 15 }, discovery: 'captured_moon', text: 'Captured into orbit: you have a new moon (+research every second).' },
        ring: { good: true, effect: 'ring', reward: { research: 18, heavy: 10 }, discovery: 'rings', text: 'Captured inside the Roche limit: tides tore it apart into a ring around your world.' },
        merged: { good: true, effect: 'progress', amount: 0.08, reward: { heavy: 25, motes: 15 }, discovery: 'giant_impact', text: 'A slow merger: the impactor\'s mass is now yours.' },
        deflected: { good: true, reward: { research: 6 }, text: 'You pulled it onto a near miss.' },
        shattered: { effect: 'progress', amount: -0.025, reward: { heavy: 10 }, text: 'The fast hit shattered the impactor and blasted off some surface. Recollect the debris.' },
      },
    },
    {
      id: 'stellar_flyby', name: 'Stellar Encounter', mode: 'catch',
      stages: ['protoplanet', 'planet', 'mainseq', 'redgiant', 'whitedwarf', 'neutronstar'], cooldown: 240, weight: 0.8, warn: 4, dur: 16,
      spawnDur: 12, count: 18, target: 7, mote: 'comet', pattern: 'flyby', speed: 120, grab: true, catchBy: 'well', attract: 2600, passB: 0.55, respond: 'well',
      warnText: 'Another star is passing close by.',
      how: 'Its gravity tugs on loose material and knocks comets toward you. Catch the comets with your gravity well.',
      science: 'Stars drift past each other. A close pass stirs the distant Oort cloud and can send a shower of comets inward. The star Gliese 710 is predicted to pass roughly 10,000 AU from the Sun in about 1.3 million years.',
      outcomes: {
        success: { good: true, reward: { heavy: 20, research: 14, motes: 20 }, discovery: 'comet_shower', text: 'Comet shower collected: ices and dust from the edge of the system.' },
        fail: { text: 'The star moved on, taking some loose material with it.' },
      },
    },
    {
      id: 'interstellar', name: 'Interstellar Visitor', mode: 'catch',
      stages: ['protoplanet', 'planet', 'mainseq'], cooldown: 300, weight: 0.35, warn: 4, dur: 11,
      spawnDur: 0.2, count: 1, target: 1, mote: 'comet', size: 2, pattern: 'hyperbolic', speed: 230, passB: 0.4, grab: true, catchBy: 'well', respond: 'well',
      warnText: 'Something is coming in far too fast to belong here: an object from another star system.',
      how: 'It is on an open (hyperbolic) path: it crosses once and leaves forever. Touch it with your gravity well as it passes.',
      science: 'Bodies flung out of other planetary systems drift between the stars. They arrive faster than the Sun\'s escape speed, on open (hyperbolic) orbits, so each passes only once. The first one seen, 1I/ʻOumuamua (2017), was an elongated body with no comet tail; the second, 2I/Borisov (2019), looked like an ordinary comet.',
      outcomes: {
        success: { good: true, reward: { research: 30, heavy: 15 }, discovery: 'oumuamua', text: 'You caught a sample from another star system!' },
        fail: { text: 'It sped away on its hyperbolic orbit, never to return.' },
      },
    },
    {
      id: 'solar_flare', name: 'Stellar Flare', mode: 'catch',
      stages: ['protostar', 'mainseq', 'redgiant'], cooldown: 140, weight: 1.2, warn: 3, dur: 10,
      spawnDur: 2.5, count: 16, target: 6, mote: 'spark', pattern: 'limb', speed: 190, grab: true, catchBy: 'well', respond: 'well',
      onActive: { buff: { id: 'ev_flare', key: 'energy', mult: 1.5, t: 25, name: 'Flare surge' } },
      warnText: 'A magnetic loop is brightening on the stellar surface.',
      how: 'Energetic particles burst from the bright loop. Catch them with your gravity well before they escape.',
      science: 'Flares happen when twisted magnetic field lines snap and reconnect, releasing stored energy as light and fast particles in minutes. Young stars flare far more often and more strongly than the Sun does today.',
      outcomes: {
        success: { good: true, reward: { research: 10, energy: 60 }, discovery: 'stellar_flare', text: 'Flare spectrum recorded from the particles you caught.' },
        fail: { text: 'The flare faded. Its energy surge still helped.' },
      },
    },
    {
      id: 'cme', name: 'Coronal Mass Ejection', mode: 'front', geometry: 'arc',
      stages: ['mainseq', 'redgiant'], cooldown: 190, weight: 1, warn: 4,
      when: (s) => !!(s.planet && !s.planet.engulfed) || s.system.length > 0, // there must be something to protect
      f0: 1, f1: 6.5, speed: 1.0, win: [2.1, 3.7], respond: 'pulse', timeout: 'hit',
      warnText: 'A huge plasma cloud is about to erupt toward your system.',
      how: 'Press Gravity Pulse (1) while the plasma cloud is inside the dashed deflection zone.',
      science: 'A coronal mass ejection hurls billions of tonnes of magnetised plasma into space. A planet\'s magnetic field deflects most of it — here your pulse plays that role. The part that gets through drives geomagnetic storms and aurorae.',
      outcomes: {
        success: { good: true, reward: { heavy: 40, research: 12 }, discovery: 'space_weather', text: 'Deflected! Charged particles slid along the field lines and lit up aurorae.' },
        hit: { effect: 'drain', amount: 0.35, text: 'The CME hit: a geomagnetic storm drained 35% of your stored energy.' },
      },
    },
    {
      id: 'stellar_pulsation', name: 'Pulsational Instability', mode: 'pulsation',
      stages: ['mainseq', 'redgiant', 'supergiant'], cooldown: 180, weight: 1, warn: 3, dur: 30,
      // instability strip: δ Scuti stars (~1.5–2.5 M☉) and β Cephei stars (≥ 8 M☉) on the main sequence,
      // Cepheid-like giants (≥ 3 M☉), and semi-regular red supergiants such as Betelgeuse
      when: (s) => {
        const M = s.star ? s.star.M0 : 0;
        if (s.stage === 'mainseq') return (M >= 1.5 && M <= 2.5) || M >= 8;
        if (s.stage === 'redgiant') return M >= 3;
        return true;
      },
      period: 3.2, window: 0.75, hitsNeeded: 2, radAmp: 0.07, pgPush: 0.35, respond: 'stabilize',
      warnText: 'Your star has entered an instability strip: its outer layers start to swell and shrink.',
      how: 'Press Stellar Stabilization (2) when the star is at its largest (bright ring) — twice — to damp the pulsation.',
      science: 'In some stars a layer of partly ionised helium traps heat when compressed and releases it when expanded, driving regular pulsations (the κ-mechanism). Henrietta Leavitt found that a Cepheid\'s period reveals its true brightness, making these stars cosmic yardsticks.',
      outcomes: {
        success: { good: true, reward: { research: 20, heavy: 20 }, discovery: 'pulsating_star', text: 'Pulsation damped — and its period measured. Period → luminosity: a standard candle.' },
        fail: { effect: 'drain', amount: 0.25, text: 'The pulsation died out on its own, after costing 25% of your stored energy.' },
      },
    },
    {
      id: 'magnetar_burst', name: 'Magnetar Burst', mode: 'front', geometry: 'arc',
      stages: ['neutronstar'], cooldown: 90, weight: 1.5, warn: 4,
      when: (s) => !!(s.remnant && s.remnant.magnetar),
      f0: 0, f1: 10, speed: 3.2, win: [6, 7.2], respond: 'observe', timeout: 'missed',
      warnText: 'The crust of your magnetar is straining: a burst is coming.',
      how: 'A radio flash races outward. Press Observe (3) while it crosses the dashed detector ring. It is over in a moment.',
      science: 'Stress in a magnetar\'s crust and magnetic field is released in sudden bursts. Most are seen in X-rays, but on 28 April 2020 a burst from SGR 1935+2154 came with a millisecond radio flash, tying fast radio bursts to magnetars.',
      outcomes: {
        success: { good: true, reward: { research: 45, remnants: 3 }, discovery: 'frb', text: 'Caught it! A millisecond radio flash on the detector.' },
        missed: { text: 'The flash passed in an instant. Only the X-ray afterglow remains.' },
      },
    },
    {
      id: 'accretion_surge', name: 'Tidal Disruption Surge', mode: 'catch',
      stages: ['blackhole'], cooldown: 150, weight: 1, warn: 5, dur: 32,
      spawnDur: 8, count: 20, target: 8, mote: 'gas', pattern: 'infall', speed: 110, grab: false, countIf: 'subEddington', respond: 'well',
      warnText: 'A star has wandered too close: tides are tearing it apart.',
      how: 'Its debris will flood in. Hold part of the stream back with your gravity well and let it fall in gradually — only clumps eaten below the Eddington limit count.',
      science: 'When a star passes too close to a black hole, tides stretch it into a stream; about half of the debris falls back and powers a flare that lasts months. Telescopes now catch dozens of these tidal disruption events every year.',
      outcomes: {
        success: { good: true, reward: { remnants: 2, research: 20, energy: 200 }, discovery: 'tde', fx: 'jets', text: 'Efficient feeding launched relativistic jets!' },
        fail: { text: 'Most debris fell in above the Eddington limit, where radiation pressure wastes it.' },
      },
    },
  ];

  CA.EVENT = {};
  CA.EVENTS.forEach((e) => (CA.EVENT[e.id] = e));

  // Discoveries that only cosmic events can unlock.
  [
    { id: 'triggered_collapse', name: 'Triggered Star Formation', hint: 'Ride a supernova shock through your cloud core.', desc: 'A shock wave pushed a cloud core into collapse.' },
    { id: 'dust_trap', name: 'Dust Trap', hint: 'Keep material intact through a disk disturbance.', desc: 'Pressure bumps in disks collect dust where it can grow.' },
    { id: 'meteor_stream', name: 'Meteor Stream', hint: 'Catch a stream of collision debris.', desc: 'Fragments of a collision spread along their parent\'s orbit.' },
    { id: 'giant_impact', name: 'Giant Impact', hint: 'Let a big impactor merge gently.', desc: 'Slow collisions between large bodies build planets.' },
    { id: 'captured_moon', name: 'Captured Moon', hint: 'Put an incoming asteroid into orbit.', desc: 'Some moons, like Neptune\'s Triton, were captured.' },
    { id: 'comet_shower', name: 'Comet Shower', hint: 'Catch comets sent by a passing star.', desc: 'Stellar flybys shake comets loose from the Oort cloud.' },
    { id: 'stellar_flare', name: 'Stellar Flare', hint: 'Catch the particles of a flare.', desc: 'Magnetic reconnection releases energy in minutes.' },
    { id: 'space_weather', name: 'Space Weather', hint: 'Deflect a coronal mass ejection.', desc: 'Magnetic fields shield planets from plasma storms.' },
    { id: 'pulsating_star', name: 'Pulsating Star', hint: 'Damp a pulsating star (needs the right mass).', desc: 'Pulsation periods reveal stellar luminosities.' },
    { id: 'tde', name: 'Tidal Disruption Event', hint: 'Feed a torn-apart star to a black hole efficiently.', desc: 'A star shredded by tides lights up its black hole.' },
    { id: 'oumuamua', name: 'ʻOumuamua', cat: 'Rare', hint: 'Catch a visitor from another star system.', desc: 'Found in 2017, 1I/ʻOumuamua was the first object known to come from outside the Solar System: too fast to be bound to the Sun, and shaped unlike any comet or asteroid seen before.' },
    { id: 'rings', name: 'Ring System', cat: 'Rare', hint: 'Capture an impactor inside the Roche limit.', desc: 'Inside the Roche limit a planet\'s tides beat a moon\'s own gravity and pull it apart into a ring. Saturn\'s rings lie inside its Roche limit, and Mars\'s moon Phobos, spiralling inward, may become a ring in some 30–50 million years.' },
  ].forEach((d) => {
    if (CA.DISCOVERY && CA.DISCOVERY[d.id]) return;
    const disc = Object.assign({ cat: 'Event' }, d);
    if (CA.DISCOVERIES) { CA.DISCOVERIES.push(disc); CA.DISCOVERY[d.id] = disc; }
  });
})(globalThis.CA = globalThis.CA || {});
