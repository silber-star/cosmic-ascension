/* COSMIC ASCENSION — data-driven evolutionary stages.
   type: how progress is measured  (mass | jeans | planet | protostar | mainseq | timed | remnant)
   kind: how the body is drawn     (see render/bodies.js)
   next: the ONLY transitions Evo.advance will accept from this stage. */
(function (CA) {
  'use strict';
  const ME = 5.972e24;

  CA.CHAPTERS = {
    1: { name: 'I · The Dark Cloud', palette: 'dark' },
    2: { name: 'II · The Protoplanetary Disk', palette: 'disk' },
    3: { name: 'III · The Star', palette: 'star' },
    4: { name: 'IV · Stellar Remnants', palette: 'remnant' },
  };

  CA.STAGES = [
    {
      id: 'grain', name: 'Dust Grain', chapter: 1, kind: 'grain', type: 'mass',
      massStart: 1e-16, massEnd: 1e-13, gain: 0.13, matterValue: 1,
      spawn: { dust: 1, spark: 0.07, anomaly: 0.004 },
      abilities: ['well'], next: ['cluster'],
      objective: 'Hold the left mouse button to pull drifting dust into your grain.',
      goal: 'Grow 1,000× heavier to become a dust cluster.',
      science: 'Interstellar dust grains are tiny solids (silicates and carbon, ~0.1 µm across) that make up about 1% of a cold molecular cloud\'s mass. At this scale grains stick on contact through van der Waals and electrostatic forces; their gravity is negligible. The "gravity well" here is a gameplay stand-in for the gas motions that push grains together.',
    },
    {
      id: 'cluster', name: 'Dust Cluster', chapter: 1, kind: 'cluster', type: 'mass',
      massStart: 1e-13, massEnd: 1e-10, gain: 0.12, matterValue: 3, merge: true,
      spawn: { dust: 1, spark: 0.07, anomaly: 0.004 },
      abilities: ['well', 'pulse'], next: ['core'],
      objective: 'Use Gravity Pulse (1) to sweep grains inward. Slow grains that touch each other merge.',
      goal: 'Grow to 0.1 ng (another 1,000×). Buy Passive Coagulation for steady growth.',
      science: 'Grains in cold cloud cores grow into fluffy, fractal aggregates. Astronomers see this as "coreshine": dense cores scatter more infrared light than tiny grains alone could. Growth is slow because collisions are gentle and rare.',
    },
    {
      id: 'core', name: 'Dense Cloud Core', chapter: 1, kind: 'core', type: 'jeans', matterValue: 8,
      spawn: { gas: 1, spark: 0.08, anomaly: 0.005 }, merge: true,
      abilities: ['well', 'pulse', 'cool'], next: ['aggregate'],
      objective: 'Gather gas clumps and cool the core (2) until its mass exceeds the Jeans mass.',
      goal: 'Trigger gravitational collapse. A bigger core gives a bigger star later.',
      science: 'A gas cloud collapses when gravity beats thermal pressure — when its mass exceeds the Jeans mass, M_J ≈ 1 M☉ (T/10 K)^1.5 (n/10⁴ cm⁻³)^-0.5 (order of magnitude). Colder, denser gas collapses more easily. Dust helps: grains radiate heat away and keep the core cold.',
    },
    {
      id: 'aggregate', name: 'Fluffy Aggregate', chapter: 2, kind: 'aggregate', type: 'mass',
      massStart: 1e-10, massEnd: 1e-4, gain: 0.14, matterValue: 20, frag: true, merge: true,
      spawn: { dust: 1, heavy: 0.09, spark: 0.06, anomaly: 0.004 },
      abilities: ['well', 'pulse', 'damp'], next: ['pebble'],
      objective: 'Fast impacts shatter fragile aggregates. Slow incoming grains with the Damping Field (3).',
      goal: 'Grow to 0.1 g. Orange grains carry heavy elements.',
      science: 'In a protoplanetary disk, aggregates grow by sticking — but above roughly 1 m/s they bounce, and above ~10 m/s they shatter. These "bouncing" and "fragmentation barriers" are a real puzzle of planet formation.',
    },
    {
      id: 'pebble', name: 'Pebble', chapter: 2, kind: 'pebble', type: 'mass',
      massStart: 1e-4, massEnd: 10, gain: 0.15, matterValue: 60, frag: true, merge: true, wind: true,
      swarm: { count: 16, hold: 3 },
      spawn: { dust: 1, heavy: 0.1, spark: 0.06, anomaly: 0.004 },
      abilities: ['well', 'pulse', 'damp', 'boost'], next: ['planetesimal'],
      objective: 'A gas headwind drags pebbles past you. Catch them, then hold a dense swarm inside the ring.',
      goal: 'Reach 10 kg and keep 16 pebbles in the swarm ring for 3 s → streaming instability.',
      science: 'Pebbles feel a headwind from the slightly slower-orbiting gas and drift toward the star. Where they crowd together, the "streaming instability" can concentrate them until the swarm collapses under its own gravity into a planetesimal tens of kilometres across.',
    },
    {
      id: 'planetesimal', name: 'Planetesimal', chapter: 2, kind: 'planetesimal', type: 'mass',
      massStart: 1e15, massEnd: 1e19, gain: 0.022, matterValue: 200, frag: true, runaway: true, rogue: true,
      spawn: { dust: 1, heavy: 0.12, spark: 0.05, anomaly: 0.004, rogue: 0.025 },
      abilities: ['well', 'pulse', 'damp', 'boost'], next: ['protoplanet'],
      objective: 'Your own gravity now matters: capture grows faster as you grow. Damp rogue impactors (red) before they hit.',
      goal: 'Grow to 10¹⁹ kg (a few hundred km across).',
      science: 'Once a body has significant gravity, it bends the paths of passing material toward itself ("gravitational focusing"). The largest bodies grow fastest — runaway growth. High-speed impacts can still shatter material instead of merging.',
    },
    {
      id: 'protoplanet', name: 'Protoplanet', chapter: 2, kind: 'protoplanet', type: 'mass',
      massStart: 1e19, massEnd: 6e22, gain: 0.02, matterValue: 700, frag: true, runaway: true, rogue: true, zoneChoice: true,
      spawn: { dust: 1, heavy: 0.12, spark: 0.05, anomaly: 0.005, rogue: 0.03 },
      abilities: ['well', 'pulse', 'damp', 'boost', 'orbit'], next: ['planet'],
      objective: 'Use Orbital Adjustment (5) to park debris in orbit; it then spirals in safely.',
      goal: 'Reach a Moon-sized mass (6×10²² kg).',
      science: 'Protoplanets are Moon- to Mars-sized embryos. Their orbit matters: inside the "frost line" only rock and metal condense; beyond it, water ice adds lots of extra solid material, which can make cores big enough to grab gas.',
    },
    {
      id: 'planet', name: 'Planet', chapter: 2, kind: 'planet', type: 'planet',
      massStart: 6e22, massEnd: ME, massCap: 12 * ME, gain: 0.013, matterValue: 2000, frag: true, runaway: true, rogue: true,
      spawn: { dust: 1, heavy: 0.12, spark: 0.05, anomaly: 0.005, rogue: 0.03 },
      abilities: ['well', 'pulse', 'damp', 'boost', 'orbit'], next: ['protostar'],
      objective: 'Grow to at least 1 Earth mass, then Finalize. Heavier planets become other planet types.',
      goal: 'Finalize your planet. Beyond the frost line, a 10 M⊕ core triggers runaway gas accretion.',
      science: 'A planet clears its orbit of most debris. Rocky planets above ~2–3 M⊕ are "super-Earths". In the cold outer disk, a core of ~10 M⊕ can pull in a huge envelope of hydrogen and helium and become a gas giant; smaller icy cores become ice giants.',
    },
    {
      id: 'protostar', name: 'Protostar', chapter: 3, kind: 'protostar', type: 'protostar', matterValue: 5000,
      spawn: { gas: 1, spark: 0.15, anomaly: 0.005 }, merge: true,
      abilities: ['well', 'pulse', 'outflow'], next: ['mainseq'],
      objective: 'Feed infalling gas to heat the core. Outflows (3) shed mass. Ignite at 10 million K.',
      goal: 'Choose your star\'s mass, then ignite hydrogen fusion.',
      science: 'A protostar shines by releasing gravitational energy as it contracts (Kelvin–Helmholtz contraction). Its core heats up until hydrogen fusion starts at roughly 10 million K. Objects below ~0.08 M☉ never get hot enough — they become brown dwarfs.',
    },
    {
      id: 'mainseq', name: 'Main-Sequence Star', chapter: 3, kind: 'star', type: 'mainseq', matterValue: 12000,
      spawn: { comet: 1, heavy: 0.25, spark: 0.12, anomaly: 0.006 },
      abilities: ['well', 'pulse', 'stabilize'], next: ['redgiant', 'supergiant', 'whitedwarf'],
      objective: 'Core Compression raises fusion output but pushes pressure out of balance with gravity. Keep the needle in the band.',
      goal: 'Burn through the core hydrogen. Your initial mass decides what comes next.',
      science: 'A main-sequence star is in hydrostatic equilibrium: inward gravity is balanced by outward pressure from the hot core. More massive stars are far more luminous (L ∝ M³·⁵ roughly) and burn out much sooner.',
    },
    {
      id: 'redgiant', name: 'Red Giant', chapter: 3, kind: 'giant', type: 'timed', duration: 55, matterValue: 15000,
      spawn: { heavy: 1, comet: 0.5, spark: 0.12, anomaly: 0.006 },
      abilities: ['well', 'pulse', 'stabilize'], next: ['agb'],
      objective: 'The core has run out of hydrogen. The envelope swells — collect dredged-up material (orange).',
      goal: 'Survive the giant phase. Inner planets may be engulfed.',
      science: 'With hydrogen exhausted in the core, fusion moves to a shell around a contracting helium core and the envelope expands to hundreds of times the Sun\'s radius. Stars below ~2 M☉ ignite helium explosively in a "helium flash".',
    },
    {
      id: 'agb', name: 'Asymptotic Giant Branch', chapter: 3, kind: 'giant', type: 'timed', duration: 45, matterValue: 18000,
      spawn: { heavy: 1, spark: 0.12, anomaly: 0.006 },
      abilities: ['well', 'pulse', 'capture'], next: ['pnebula'],
      objective: 'Thermal pulses! Press Capture (2) when the pulse ring peaks to harvest freshly made elements.',
      goal: 'Harvest heavy elements while the envelope blows away.',
      science: 'Late giants burn helium and hydrogen in two thin shells that switch on and off in "thermal pulses". Slow neutron capture (the s-process) in these stars makes about half of the elements heavier than iron, such as barium and lead.',
    },
    {
      id: 'pnebula', name: 'Planetary Nebula', chapter: 4, kind: 'pnebula', type: 'timed', duration: 35, matterValue: 20000,
      spawn: { ejecta: 1, anomaly: 0.008 }, collectAtCursor: true,
      abilities: ['well', 'observe'], next: ['whitedwarf'],
      objective: 'The envelope is expanding away. Hold the gravity well on ejecta to catch samples before they escape.',
      goal: 'Collect samples while the nebula glows.',
      science: 'The ejected envelope is lit up by ultraviolet light from the exposed hot core. Despite the name, planetary nebulae have nothing to do with planets — early telescopes just made them look like round planetary disks. They fade in tens of thousands of years.',
    },
    {
      id: 'supergiant', name: 'Red Supergiant', chapter: 3, kind: 'supergiant', type: 'timed', duration: 71, matterValue: 25000,
      spawn: { heavy: 1, spark: 0.12, anomaly: 0.006 },
      abilities: ['well', 'pulse', 'stabilize'], next: ['supernova', 'blackhole'],
      objective: 'The core burns heavier fuels, each faster than the last. Stellar Winds shed mass — and change the core\'s fate.',
      goal: 'Build an iron core. Final mass decides: neutron star or black hole.',
      science: 'Massive stars fuse helium → carbon → neon → oxygen → silicon → iron in onion-like shells; each stage is shorter (silicon burning lasts about a day). Fusing iron releases no energy, so an iron core cannot support itself.',
    },
    {
      id: 'supernova', name: 'Core-Collapse Supernova', chapter: 4, kind: 'supernova', type: 'timed', duration: 24, matterValue: 40000,
      spawn: { ejecta: 1, anomaly: 0.01 }, collectAtCursor: true,
      abilities: ['well', 'observe'], next: ['neutronstar', 'blackhole'],
      objective: 'The shock wave is tearing the star apart. Catch freshly forged ejecta with your gravity well.',
      goal: 'Collect ejecta before the remnant is revealed.',
      science: 'The iron core collapses in under a second to nuclear density. A shock, likely revived by neutrinos, blasts the envelope outward at ~10,000 km/s, briefly outshining a whole galaxy and spreading oxygen, silicon, iron and other elements into space.',
    },
    {
      id: 'whitedwarf', name: 'White Dwarf', chapter: 4, kind: 'wd', type: 'remnant', matterValue: 20000,
      spawn: { comet: 1, spark: 0.1, anomaly: 0.008 },
      abilities: ['well', 'pulse', 'observe'], next: ['inspiral'],
      objective: 'No fusion here: the white dwarf only cools. Observe (3) its spectrum while it is hot for research.',
      goal: 'Watch it cool. Crystallization begins below ~6,000 K. You can seed a new cycle any time.',
      science: 'A white dwarf is the exposed core of a low- or intermediate-mass star: about a Sun\'s mass packed into an Earth-sized ball, held up by electron degeneracy pressure. It cannot exceed ~1.4 M☉ (the Chandrasekhar limit) and simply cools for billions of years.',
    },
    {
      id: 'neutronstar', name: 'Neutron Star', chapter: 4, kind: 'ns', type: 'remnant', matterValue: 40000,
      spawn: { comet: 1, spark: 0.12, anomaly: 0.01 },
      abilities: ['well', 'pulse', 'pulsecap', 'observe'], next: ['inspiral'],
      objective: 'Its beams sweep space like a lighthouse. Press Record (Space) as a beam crosses the detector.',
      goal: 'Time pulses to build research. The pulsar slowly spins down.',
      science: 'A neutron star packs ~1.4 M☉ into a ball ~20 km wide — a teaspoon would weigh about a billion tonnes. Rapid rotation and a magnetic field around a trillion times Earth\'s sweep radio beams across space. We see a pulsar when a beam crosses Earth.',
    },
    {
      id: 'blackhole', name: 'Black Hole', chapter: 4, kind: 'bh', type: 'remnant', matterValue: 60000,
      spawn: { gas: 1, spark: 0.1, anomaly: 0.01 },
      abilities: ['well', 'pulse', 'lens'], next: ['inspiral'],
      objective: 'Feed the accretion disk, but stay under the Eddington limit. Observe (3) when a star crosses the Einstein ring.',
      goal: 'Matter crossing the event horizon is gone. Its energy is released before it falls in.',
      science: 'A black hole\'s event horizon (Schwarzschild radius ≈ 3 km per solar mass) is a boundary nothing can cross back out of, not even light. The glowing accretion disk lies outside it; gas there heats up and radiates up to ~6–42% of its rest-mass energy before falling in.',
    },
    {
      id: 'inspiral', name: 'Binary Inspiral', chapter: 4, kind: 'inspiral', type: 'inspiral', matterValue: 50000,
      spawn: { spark: 1 },
      abilities: ['well', 'pulse', 'gwcap'], next: ['merger', 'snr', 'whitedwarf', 'neutronstar', 'blackhole'],
      objective: 'Gravitational waves drain the orbit. Press Space each time the pair lines up with the detector, and once more at the merger.',
      goal: 'Build up signal-to-noise. SNR 8 counts as a detection.',
      science: 'Two compact objects in orbit radiate gravitational waves, so they spiral together faster and faster. The signal rises in pitch and strength, a "chirp", and its rate of rise gives the chirp mass, the combination of the two masses that sets how fast the orbit shrinks.',
    },
    {
      id: 'merger', name: 'Merger Ejecta', chapter: 4, kind: 'supernova', type: 'timed', duration: 20, matterValue: 60000,
      spawn: { ejecta: 1, anomaly: 0.01 }, collectAtCursor: true,
      abilities: ['well', 'observe'], next: ['snr', 'whitedwarf', 'neutronstar', 'blackhole'],
      objective: 'The merger threw out freshly forged nuclei. Catch them with your gravity well before they fly away.',
      goal: 'Collect ejecta while the debris glows.',
      science: 'A violent merger flings out hot, newly made nuclei. Their radioactive decay keeps the debris glowing for days to weeks, and the expanding cloud carries the new elements into space.',
    },
    {
      id: 'snr', name: 'Supernova Remnant', chapter: 4, kind: 'snr', type: 'remnant', matterValue: 30000,
      spawn: { heavy: 1, spark: 0.1, anomaly: 0.008 },
      abilities: ['well', 'pulse', 'observe'], next: [],
      objective: 'Nothing is left at the centre, only an expanding shell. Observe (3) it and sweep up iron-rich gas.',
      goal: 'A Type Ia explosion leaves no star behind. You can seed a new cycle any time.',
      science: 'A Type Ia explosion destroys the white dwarf completely, so no neutron star or black hole remains. The shell of ejecta keeps ploughing into interstellar gas for thousands of years, as in the remnants of Tycho\'s supernova (1572) and SN 1006.',
    },
  ];

  CA.STAGE = {};
  CA.STAGES.forEach((s, i) => { s.index = i; CA.STAGE[s.id] = s; });

  CA.PLANET_TYPES = {
    terrestrial: { name: 'Terrestrial Planet', color: '#7a8fb0', heavy: 1.0, research: 0.10, matterFrac: 0.10, energy: 0, desc: 'Rocky, metal core. Steady heavy elements.' },
    superearth: { name: 'Super-Earth', color: '#7aa68a', heavy: 1.7, research: 0.18, matterFrac: 0.12, energy: 0, desc: 'A rocky world several Earths in mass. More heavy elements and research.' },
    icegiant: { name: 'Ice Giant', color: '#6fd0e0', heavy: 0.4, research: 0.08, matterFrac: 0.30, energy: 1.2, desc: 'Icy core with a thin H/He envelope. Matter and energy.' },
    gasgiant: { name: 'Gas Giant', color: '#e0a86a', heavy: 0.3, research: 0.12, matterFrac: 0.55, energy: 2.5, desc: 'Hundreds of Earth masses of gas. Strong matter and energy flow.' },
  };

  // Things you can find. Stages are added automatically below.
  CA.DISCOVERIES = [
    { id: 'anomaly', name: 'Presolar Grain', cat: 'Rare', hint: 'Absorb a rare violet mote.', desc: 'Some meteorite grains are older than the Sun — stardust condensed around earlier stars.' },
    { id: 'streaming', name: 'Streaming Instability', cat: 'Process', hint: 'Collapse a pebble swarm.', desc: 'Pebble clumps collapsing directly into planetesimals.' },
    { id: 'runaway', name: 'Runaway Growth', cat: 'Process', hint: 'Grow as a planetesimal.', desc: 'Gravitational focusing makes the biggest bodies grow fastest.' },
    { id: 'terrestrial', name: 'Terrestrial Planet', cat: 'Planet', hint: 'Finalize a rocky planet under 3 M⊕.', desc: CA.PLANET_TYPES.terrestrial.desc },
    { id: 'superearth', name: 'Super-Earth', cat: 'Planet', hint: 'Finalize a rocky planet of 3+ M⊕.', desc: CA.PLANET_TYPES.superearth.desc },
    { id: 'icegiant', name: 'Ice Giant', cat: 'Planet', hint: 'Finalize an outer planet under 10 M⊕.', desc: CA.PLANET_TYPES.icegiant.desc },
    { id: 'gasgiant', name: 'Gas Giant', cat: 'Planet', hint: 'Finalize an outer core of 10+ M⊕.', desc: CA.PLANET_TYPES.gasgiant.desc },
    { id: 'red_dwarf', name: 'Red Dwarf', cat: 'Star', hint: 'Ignite a star under 0.5 M☉.', desc: 'Fully convective, dim, and long-lived: none has ever died in the universe\'s 13.8 billion years.' },
    { id: 'sunlike', name: 'Sun-like Star', cat: 'Star', hint: 'Ignite a star of 0.8–1.2 M☉.', desc: 'A G-type dwarf like the Sun, with a ~10-billion-year main sequence.' },
    { id: 'massive', name: 'Massive Star', cat: 'Star', hint: 'Ignite a star of 8+ M☉.', desc: 'O/B stars: brilliant, hot and short-lived.' },
    { id: 'helium_flash', name: 'Helium Flash', cat: 'Event', hint: 'Evolve a star under 2 M☉ through the red giant phase.', desc: 'Runaway helium ignition in a degenerate core.' },
    { id: 'engulfment', name: 'Planetary Engulfment', cat: 'Event', hint: 'Let a giant swallow an inner planet.', desc: 'Expanding giants can swallow close-in planets.' },
    { id: 'wolf_rayet', name: 'Wolf–Rayet Star', cat: 'Star', hint: 'Strip a massive star with strong winds.', desc: 'A hot, massive star that has lost its hydrogen envelope.' },
    { id: 'failed_sn', name: 'Failed Supernova', cat: 'Event', hint: 'Collapse a very heavy star.', desc: 'Some massive stars may collapse straight into black holes with little or no visible explosion.' },
    { id: 'helium_wd', name: 'Helium White Dwarf', cat: 'Remnant', hint: 'Finish a red dwarf (theoretical).', desc: 'Predicted end of red dwarfs, trillions of years from now. Hypothetical.' },
    { id: 'polluted_wd', name: 'Polluted White Dwarf', cat: 'Remnant', hint: 'Make a white dwarf after a planet was engulfed.', desc: 'Metal lines in white-dwarf spectra reveal swallowed planetary debris.' },
    { id: 'crystal_wd', name: 'Crystallized Core', cat: 'Remnant', hint: 'Cool a white dwarf below ~6,000 K.', desc: 'Old white dwarfs freeze into crystals; the Gaia mission saw the delay this causes in cooling.' },
    { id: 'pulsar', name: 'Pulsar', cat: 'Remnant', hint: 'Record 10 pulses in a row.', desc: 'A rotating neutron star whose beams cross our line of sight.' },
    { id: 'microlensing', name: 'Microlensing', cat: 'Observation', hint: 'Observe a star crossing the Einstein ring.', desc: 'Gravity bending and brightening the light of a background star.' },
    { id: 'nebulium', name: '"Nebulium"', cat: 'Observation', hint: 'Explain the green lines of a planetary nebula (Spectral Analysis, level 4).', desc: 'The bright green lines of nebulae were blamed on a new element, "nebulium", until Ira Bowen showed in 1927 that they are forbidden lines of doubly ionised oxygen, possible only in extremely thin gas.' },
    { id: 'tc_star', name: 'Technetium Star', cat: 'Observation', hint: 'Find technetium in a giant star (Spectral Analysis, level 5).', desc: 'In 1952 Paul Merrill found technetium in S-type giants. It has no stable isotope (the one made in such stars lasts ~200,000 years), so it must have been made inside the star: proof that stars forge elements.' },
    { id: 'dart', name: 'Planetary Defence', cat: 'Observation', hint: 'Shorten a moonlet\'s orbit by an impact (Asteroid Navigation, level 5).', desc: 'In 2022 NASA\'s DART spacecraft hit the moonlet Dimorphos and shortened its 11 h 55 min orbit by about 32 minutes. The debris thrown off pushed even harder than the impact itself.' },
    { id: 'pulsar_planets', name: 'Pulsar Planets', cat: 'Observation', hint: 'Find planets in pulsar timing residuals (Pulsar Timing, level 5).', desc: 'The first exoplanets ever confirmed (1992) orbit the pulsar PSR B1257+12. They were found because they tug the pulsar back and forth, shifting its pulses by milliseconds.' },
    { id: 'photon_sphere', name: 'Photon Sphere', cat: 'Observation', hint: 'Send light once around a black hole (Black Hole Approach, level 5).', desc: 'At 1.5 Schwarzschild radii light itself can orbit a black hole. Rays that skim this photon sphere wrap around before escaping, so its lensed image, about 2.6 rₛ in radius, outlines the black hole\'s shadow — the bright ring imaged for M87* (2019) and Sagittarius A* (2022).' },
    { id: 'sn1987a', name: 'SN 1987A Neutrinos', cat: 'Observation', hint: 'Catch the neutrino burst of a supernova before its light (Supernova Survival, level 5).', desc: 'On 23 February 1987 detectors in Japan, the USA and the Soviet Union recorded about two dozen neutrinos in 13 seconds, some three hours before the light of SN 1987A arrived. Nobody noticed in real time; the burst was found in the data afterwards. It confirmed that a collapsing core sheds almost all its energy as neutrinos.' },
    { id: 'type_ia', name: 'Type Ia Supernova', cat: 'Rare', hint: 'Push a white dwarf past 1.4 M☉, or merge two white dwarfs.', desc: 'A white dwarf that reaches about 1.4 M☉ ignites carbon all at once and is destroyed. Because these explosions are so alike, they work as standard candles: in 1998 they revealed that the expansion of the universe is speeding up.' },
    { id: 'kilonova', name: 'Kilonova', cat: 'Rare', hint: 'Merge two neutron stars.', desc: 'On 17 August 2017 detectors caught the gravitational waves of two merging neutron stars (GW170817). A gamma-ray burst followed 1.7 s later, then a glow from decaying r-process nuclei, direct evidence that such mergers forge gold, platinum and other heavy elements.' },
    { id: 'gw_merger', name: 'Gravitational-Wave Merger', cat: 'Rare', hint: 'Detect the chirp of two merging black holes (SNR 8 or more).', desc: 'On 14 September 2015 LIGO recorded GW150914: black holes of about 36 and 29 M☉ merging 1.3 billion light-years away. About 3 M☉ turned into gravitational-wave energy in a fraction of a second. It was the first direct detection of gravitational waves.' },
    { id: 'magnetar', name: 'Magnetar', cat: 'Rare', hint: 'Strip a star of 20+ M☉ with winds until it collapses to a neutron star. Not every one is a magnetar.', desc: 'A neutron star with a magnetic field around 10¹⁵ G, a thousand times stronger than a normal pulsar\'s. Its field powers X-ray flares; in 2004 a giant flare from SGR 1806−20, 30,000 light-years away, disturbed Earth\'s upper atmosphere.' },
    { id: 'frb', name: 'Fast Radio Burst', cat: 'Rare', hint: 'Observe the instant a magnetar\'s burst crosses the detector ring.', desc: 'A radio flash lasting milliseconds. The first was reported in 2007 and their origin stayed unknown until 28 April 2020, when the Galactic magnetar SGR 1935+2154 produced one: at least some come from magnetars.' },
    { id: 'msp', name: 'Millisecond Pulsar', cat: 'Rare', hint: 'Spin up a neutron-star companion with stable mass transfer.', desc: 'Gas falling from a companion carries angular momentum, spinning an old neutron star up to hundreds of turns per second. These "recycled" pulsars are the steadiest natural clocks known; the fastest, PSR J1748−2446ad, spins 716 times a second.' },
  ];
  CA.STAGES.forEach((s) => CA.DISCOVERIES.push({ id: 'stage:' + s.id, name: s.name, cat: 'Stage', hint: 'Reach this stage.', desc: s.science.split('. ')[0] + '.' }));
  CA.DISCOVERY = {};
  CA.DISCOVERIES.forEach((d) => (CA.DISCOVERY[d.id] = d));
})(globalThis.CA = globalThis.CA || {});
