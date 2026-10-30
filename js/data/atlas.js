/* COSMIC ASCENSION — the atlas of bodies shown in the Codex panel (data). Rules live in js/core/records.js.
   group  small | star | death | remnant | binary
   disc   the discovery that unlocks the entry; until then only a silhouette and a hint are shown
   hint   needed when disc is a stage (its own hint is only "reach this stage"); otherwise the discovery's hint is used
   view   what CA.Bodies.draw paints: kind, radius on a 96-unit canvas, extra parameters
   facts  'Label: value | Label: value', typical real numbers, rounded (see SCIENCE.md)
   example, text  a real object of this kind
   now    s → a number while this body exists in the current cycle, else null: a sighting for "My record"
   unit, label, best  how that number is shown; no unit means the record only counts sightings
   rel    related entries */
(function (CA) {
  'use strict';
  const one = () => 1;
  const stage = (id, v = one) => (s) => (s.stage === id ? v(s) : null);
  const star = (lo, hi) => (s) => (s.star && s.star.ignited && s.star.M0 >= lo && s.star.M0 < hi ? s.star.M0 : null);
  const planet = (type) => (s) => (s.planet && s.planet.type === type ? s.planet.mass / CA.U.M_EARTH : null);
  const remnant = (type, v, when) => (s) => (s.remnant && s.remnant.type === type && (!when || when(s.remnant)) ? v(s.remnant) : null);
  const mass = (r) => r.mass;

  CA.ATLAS = [
    /* ---------- dust, rocks and planets ---------- */
    { id: 'grain', group: 'small', disc: 'stage:grain', view: { kind: 'grain', r: 24, p: { seed: 1 } }, now: stage('grain'), rel: ['pebble', 'core'],
      name: 'Dust Grain', hint: 'Where everything begins.',
      facts: 'Size: about 0.1 µm | Made of: silicates and carbon | Share of a cloud: about 1% by mass',
      example: 'Presolar grains',
      text: 'Tiny grains inside meteorites such as Murchison formed around other stars before the Sun existed. The oldest measured are about 7 billion years old.' },
    { id: 'pebble', group: 'small', disc: 'stage:pebble', view: { kind: 'pebble', r: 26, p: { seed: 1 } }, now: stage('pebble'), rel: ['grain', 'planetesimal'],
      name: 'Pebble', hint: 'Grow a fluffy aggregate until it packs together.',
      facts: 'Size: millimetres to decimetres | Where: protoplanetary disks | Drift: a 1 m body at 1 AU falls inward in about 100 years',
      example: 'Chondrules',
      text: 'Chondritic meteorites are packed with once-molten beads, mostly under a few millimetres across, that formed in the Sun\'s disk about 4.56 billion years ago. They are the closest thing we have to real pebbles from that time.' },
    { id: 'planetesimal', group: 'small', disc: 'stage:planetesimal', view: { kind: 'planetesimal', r: 26, p: { seed: 1 } }, now: stage('planetesimal'), rel: ['pebble', 'protoplanet'],
      name: 'Planetesimal', hint: 'Collapse a swarm of pebbles.',
      facts: 'Size: kilometres to hundreds of km | Mass: about 10¹⁵–10¹⁹ kg | Growth: runaway, by gravitational focusing',
      example: 'Arrokoth',
      text: 'A contact binary 36 km long in the Kuiper belt, about 44 AU from the Sun. New Horizons flew past on 1 January 2019. Its two lobes touched gently, as expected if a cloud of pebbles collapsed directly.' },
    { id: 'protoplanet', group: 'small', disc: 'stage:protoplanet', view: { kind: 'protoplanet', r: 28, p: { seed: 1 } }, now: stage('protoplanet'), rel: ['planetesimal', 'terrestrial', 'icegiant'],
      name: 'Protoplanet', hint: 'Grow a planetesimal past 10¹⁹ kg.',
      facts: 'Size: hundreds of km up to Moon or Mars size | Mass: above about 10¹⁹ kg | Interior: melted, then split into core and mantle',
      example: 'Vesta',
      text: 'An asteroid 525 km across with a mass of 2.6×10²⁰ kg and an iron core, often called a surviving protoplanet. NASA\'s Dawn orbited it in 2011–2012, and a whole family of meteorites (HED) comes from it.' },
    { id: 'terrestrial', group: 'small', disc: 'terrestrial', view: { kind: 'planet', r: 30, p: { ptype: 'terrestrial', seed: 2 } }, now: planet('terrestrial'), unit: 'mearth', label: 'heaviest', rel: ['protoplanet', 'superearth'],
      name: 'Terrestrial Planet',
      facts: 'Mass: up to about 3 M⊕ in this game | Density: 3.9–5.5 g/cm³ | Made of: rock around an iron core',
      example: 'Earth',
      text: 'Mass 5.97×10²⁴ kg, radius 6,371 km, 1 AU from the Sun. It is still the only world known to host life.' },
    { id: 'superearth', group: 'small', disc: 'superearth', view: { kind: 'planet', r: 32, p: { ptype: 'superearth', seed: 3 } }, now: planet('superearth'), unit: 'mearth', label: 'heaviest', rel: ['terrestrial', 'icegiant'],
      name: 'Super-Earth',
      facts: 'Mass: about 2–10 M⊕ | Radius: rocky ones stop near 1.8 R⊕ | In our Solar System: none',
      example: '55 Cancri e',
      text: 'About 8 M⊕ and 1.9 R⊕, 41 light-years away. It circles its star in under 18 hours, so close that its dayside is probably molten.' },
    { id: 'icegiant', group: 'small', disc: 'icegiant', view: { kind: 'planet', r: 30, p: { ptype: 'icegiant', seed: 4 } }, now: planet('icegiant'), unit: 'mearth', label: 'heaviest', rel: ['superearth', 'gasgiant'],
      name: 'Ice Giant',
      facts: 'Mass: about 15–17 M⊕ | Radius: about 4 R⊕ | Made of: water, ammonia and methane under a thin H/He layer',
      example: 'Neptune',
      text: '17 M⊕ and 3.9 R⊕, 30 AU from the Sun. It was found in 1846 at the spot predicted from the unexplained pull on Uranus.' },
    { id: 'gasgiant', group: 'small', disc: 'gasgiant', view: { kind: 'planet', r: 34, p: { ptype: 'gasgiant', seed: 5 } }, now: planet('gasgiant'), unit: 'mearth', label: 'heaviest', rel: ['icegiant', 'protoplanet'],
      name: 'Gas Giant',
      facts: 'Mass: about 95–318 M⊕ in the Solar System | Radius: about 9–11 R⊕ | Made of: mostly hydrogen and helium',
      example: 'Jupiter',
      text: '318 M⊕ and 11.2 R⊕, 5.2 AU from the Sun: about two and a half times the mass of all the other planets together. Its Great Red Spot is a storm wider than Earth.' },

    /* ---------- stars ---------- */
    { id: 'core', group: 'star', disc: 'stage:core', view: { kind: 'core', r: 26, p: { jeansRatio: 1.2 } }, now: stage('core', (s) => s.core.M), unit: 'msun', label: 'heaviest', rel: ['grain', 'protostar'],
      name: 'Dense Cloud Core', hint: 'Grow a dust cluster.',
      facts: 'Temperature: about 10–20 K | Density: about 10⁴–10⁵ molecules/cm³ | Size: about 0.1 pc',
      example: 'Barnard 68',
      text: 'A dark globule about 400 light-years away, roughly 2 M☉ and 16 K. It holds so much dust that it blocks all the visible light of the stars behind it.' },
    { id: 'protostar', group: 'star', disc: 'stage:protostar', view: { kind: 'protostar', r: 8, p: { Tc: 8 } }, now: stage('protostar', (s) => s.star.M), unit: 'msun', label: 'heaviest', rel: ['core', 'red_dwarf', 'sunlike', 'massive'],
      name: 'Protostar', hint: 'Finish your planet in the disk.',
      facts: 'Energy source: gravitational contraction | Core: heating toward 10 million K | Time to the main sequence: tens of millions of years at 1 M☉',
      example: 'HL Tauri',
      text: 'A very young star about 450 light-years away. In 2014 the ALMA telescope showed rings and gaps in its disk, possibly carved by forming planets.' },
    { id: 'red_dwarf', group: 'star', disc: 'red_dwarf', view: { kind: 'star', r: 13, p: { T: 3000, corona: 3.4 } }, now: star(0, 0.5), unit: 'msun', label: 'lightest', best: 'lo', rel: ['protostar', 'sunlike', 'whitedwarf'],
      name: 'Red Dwarf',
      facts: 'Mass: 0.08–0.5 M☉ | Surface: about 2,500–3,800 K | Share of all stars: about three quarters | Lifetime: trillions of years',
      example: 'Proxima Centauri',
      text: 'The nearest star to the Sun, 4.25 light-years away: 0.12 M☉ and about 3,000 K. It has violent flares and hosts an Earth-mass planet, Proxima b.' },
    { id: 'sunlike', group: 'star', disc: 'sunlike', view: { kind: 'star', r: 17, p: { T: 5772, corona: 2.7 } }, now: star(0.8, 1.2001), unit: 'msun', label: 'heaviest', rel: ['protostar', 'redgiant', 'whitedwarf'],
      name: 'Sun-like Star',
      facts: 'Mass: 0.8–1.2 M☉ | Surface: about 5,000–6,000 K | Main sequence: about 10 billion years at 1 M☉',
      example: 'The Sun',
      text: '1 M☉, 5,772 K and 4.6 billion years old. Every second it turns about 600 million tonnes of hydrogen into helium.' },
    { id: 'massive', group: 'star', disc: 'massive', view: { kind: 'star', r: 21, p: { T: 38000, corona: 2.2 } }, now: star(8, Infinity), unit: 'msun', label: 'heaviest', rel: ['protostar', 'supergiant', 'wolf_rayet'],
      name: 'Massive Star',
      facts: 'Mass: 8 M☉ and up | Surface: about 10,000–50,000 K | Lifetime: a few to a few tens of millions of years',
      example: 'θ¹ Orionis C',
      text: 'The brightest star of the Trapezium, about 33 M☉ and 39,000 K. Its ultraviolet light makes the Orion Nebula glow, about 1,300 light-years away.' },
    { id: 'redgiant', group: 'star', disc: 'stage:redgiant', view: { kind: 'giant', r: 21, p: { T: 3900 } }, now: stage('redgiant', (s) => s.star.rg), unit: 'rsun', label: 'largest', rel: ['sunlike', 'agb'],
      name: 'Red Giant', hint: 'Burn out a star of 0.5–8 M☉.',
      facts: 'Radius: tens to hundreds of R☉ | Surface: about 3,000–4,500 K | Energy: hydrogen burning in a shell around a helium core',
      example: 'Arcturus',
      text: 'An orange giant 37 light-years away, about 1.1 M☉ but 25 R☉ wide: a preview of the Sun in about 5 billion years.' },
    { id: 'agb', group: 'star', disc: 'stage:agb', view: { kind: 'giant', r: 22, p: { T: 3000 } }, now: stage('agb', (s) => s.star.rg), unit: 'rsun', label: 'largest', rel: ['redgiant', 'pnebula'],
      name: 'Asymptotic Giant Branch', hint: 'Survive the red giant phase.',
      facts: 'Radius: several hundred R☉ | Thermal pulses: every 10⁴–10⁵ years | Makes: about half of the elements heavier than iron',
      example: 'Mira',
      text: 'A pulsating giant about 300 light-years away. Over 332 days it swings from naked-eye brightness to invisible, and it trails a tail of shed gas 13 light-years long.' },
    { id: 'supergiant', group: 'star', disc: 'stage:supergiant', view: { kind: 'supergiant', r: 20, p: {} }, now: stage('supergiant', (s) => s.star.M0), unit: 'msun', label: 'heaviest', rel: ['massive', 'wolf_rayet', 'supernova'],
      name: 'Red Supergiant', hint: 'Burn out a star of 8 M☉ or more.',
      facts: 'Mass: about 8–40 M☉ at birth | Radius: hundreds to over 1,000 R☉ | Core: onion shells up to iron',
      example: 'Betelgeuse',
      text: 'About 17 M☉ and 550 light-years away, with a radius near 760 R☉: in the Sun\'s place it would reach past Mars. It dimmed sharply in 2019–2020 after throwing off a cloud of dust.' },
    { id: 'wolf_rayet', group: 'star', disc: 'wolf_rayet', view: { kind: 'supergiant', r: 20, p: { wr: true } }, now: (s) => (s.star && s.star.wr ? s.star.M0 : null), unit: 'msun', label: 'heaviest', rel: ['massive', 'supergiant', 'blackhole'],
      name: 'Wolf–Rayet Star',
      facts: 'Surface: about 30,000–200,000 K | Wind: up to about 10⁻⁵ M☉ a year | Lost: its hydrogen envelope',
      example: 'WR 124',
      text: 'A star of about 30 M☉, roughly 15,000 light-years away, inside the nebula M1-67 made of its own shed layers. JWST imaged it in 2023; it has already thrown off about 10 M☉.' },

    /* ---------- how stars die ---------- */
    { id: 'pnebula', group: 'death', disc: 'stage:pnebula', view: { kind: 'pnebula', r: 9, p: { prog: 0.35 } }, now: stage('pnebula'), rel: ['agb', 'whitedwarf'],
      name: 'Planetary Nebula', hint: 'Let an AGB star shed its envelope.',
      facts: 'Size: about 1 light-year | Expansion: about 20 km/s | Lifetime: tens of thousands of years',
      example: 'Ring Nebula (M57)',
      text: 'A shell of gas thrown off by a dying Sun-like star, about 2,500 light-years away and about 1 light-year across. A white dwarf of about 125,000 K lights it from the centre.' },
    { id: 'supernova', group: 'death', disc: 'stage:supernova', view: { kind: 'supernova', r: 5, p: { prog: 0.42 } }, now: stage('supernova', (s) => s.star.M), unit: 'msun', label: 'heaviest', rel: ['supergiant', 'neutronstar', 'blackhole', 'snr'],
      name: 'Core-Collapse Supernova', hint: 'Let an iron core collapse.',
      facts: 'Energy: about 10⁴⁶ J, 99% in neutrinos | Ejecta speed: about 10,000 km/s | Brightness: a whole galaxy, for weeks',
      example: 'SN 1987A',
      text: 'The nearest supernova seen in nearly 400 years, in the Large Magellanic Cloud about 168,000 light-years away. Its star, Sanduleak −69° 202, was a blue supergiant of about 20 M☉. JWST found signs of the neutron star inside in 2024.' },
    { id: 'snr', group: 'death', disc: 'stage:snr', view: { kind: 'snr', r: 5.5, p: { age: 80 } }, now: stage('snr'), rel: ['type_ia', 'supernova'],
      name: 'Supernova Remnant', hint: 'Blow a white dwarf apart with nothing left behind.',
      facts: 'Size: a few to tens of parsecs | Young shell speed: thousands of km/s | Lifetime: up to hundreds of thousands of years',
      example: 'Tycho\'s remnant (SN 1572)',
      text: 'The shell of the Type Ia explosion that Tycho Brahe recorded in 1572, roughly 8,000 light-years away and about 8 pc wide. No compact remnant has been found at its centre.' },

    /* ---------- what is left ---------- */
    { id: 'whitedwarf', group: 'remnant', disc: 'stage:whitedwarf', view: { kind: 'wd', r: 7, p: { T: 25000 } }, now: remnant('wd', mass), unit: 'msun', label: 'heaviest', rel: ['pnebula', 'red_dwarf', 'type_ia'],
      name: 'White Dwarf', hint: 'Follow a low-mass star to its end.',
      facts: 'Mass: up to 1.4 M☉ | Size: about Earth | Density: about a tonne per cm³',
      example: 'Sirius B',
      text: 'The faint companion of the brightest star in the night sky, 8.6 light-years away: 1.02 M☉ in a ball smaller than Earth, about 25,000 K. Predicted from Sirius\'s wobble in 1844 and first seen in 1862.' },
    { id: 'neutronstar', group: 'remnant', disc: 'stage:neutronstar', view: { kind: 'ns', r: 4, p: { beam: 0.7, beamLen: 46 } }, now: remnant('ns', (r) => r.best), unit: 'count', label: 'streak', rel: ['supernova', 'magnetar', 'msp', 'kilonova'],
      name: 'Neutron Star', hint: 'Survive a core-collapse supernova of moderate mass.',
      facts: 'Mass: about 1.4 M☉ | Diameter: about 20–25 km | Density: about 10¹⁴ g/cm³ | Magnetic field: about 10¹² G',
      example: 'Crab Pulsar',
      text: 'The core left by the supernova of 1054, about 6,500 light-years away. It spins 30 times a second (33 ms) and slows by a few tens of nanoseconds a day.' },
    { id: 'magnetar', group: 'remnant', disc: 'magnetar', view: { kind: 'ns', r: 2.4, p: { beam: 1.1, beamLen: 40, magnetar: true } }, now: remnant('ns', one, (r) => r.magnetar), rel: ['neutronstar', 'supernova'],
      name: 'Magnetar',
      facts: 'Magnetic field: about 10¹⁴–10¹⁵ G | Spin period: about 2–12 s | Active life: about 10⁴ years',
      example: 'SGR 1806−20',
      text: 'On 27 December 2004 it released, in a fraction of a second, more energy than the Sun gives off in 100,000 years. The flare disturbed Earth\'s upper atmosphere from about 30,000 light-years away.' },
    { id: 'msp', group: 'remnant', disc: 'msp', view: { kind: 'ns', r: 3.4, p: { beam: 2.1, beamLen: 46 } }, now: (s) => (s.companion && s.companion.msp ? s.companion.P * 1000 : null), unit: 'ms', label: 'fastest', best: 'lo', rel: ['neutronstar', 'redgiant'],
      name: 'Millisecond Pulsar',
      facts: 'Spin period: about 1–10 ms | Magnetic field: about 10⁸–10⁹ G | Origin: spun up by gas from a companion',
      example: 'PSR J1748−2446ad',
      text: 'The fastest pulsar known, turning 716 times a second in the globular cluster Terzan 5, about 18,000 light-years away.' },
    { id: 'blackhole', group: 'remnant', disc: 'stage:blackhole', view: { kind: 'bh', r: 12, p: {} }, now: remnant('bh', mass), unit: 'msun', label: 'heaviest', rel: ['supernova', 'wolf_rayet', 'gw_merger'],
      name: 'Black Hole', hint: 'Collapse the core of a very heavy star.',
      facts: 'Mass: about 3 M☉ and up | Event horizon: about 3 km per M☉ | Accretion: radiates up to 6–42% of rest-mass energy',
      example: 'Cygnus X-1',
      text: 'The first widely accepted black hole, about 21 M☉ and 7,200 light-years away. It pulls gas from a blue supergiant on a 5.6-day orbit and shines in X-rays.' },

    /* ---------- binary endings ---------- */
    { id: 'type_ia', group: 'binary', disc: 'type_ia', view: { kind: 'supernova', r: 6, p: { prog: 0.24 } }, unit: 'snr', label: 'snr', rel: ['whitedwarf', 'snr'],
      name: 'Type Ia Supernova',
      facts: 'Trigger: a white dwarf near 1.4 M☉ | Peak brightness: about 5 billion L☉ | Makes: about 0.6 M☉ of nickel-56',
      example: 'SN 2011fe',
      text: 'Spotted within a day of exploding in the Pinwheel Galaxy (M101), 21 million light-years away. It was one of the nearest of its kind in decades.' },
    { id: 'kilonova', group: 'binary', disc: 'kilonova', view: { kind: 'kilonova', r: 12, p: {} }, unit: 'snr', label: 'snr', rel: ['neutronstar', 'gw_merger'],
      name: 'Kilonova',
      facts: 'Cause: neutron stars merging | Ejecta: about 0.05 M☉ of r-process nuclei | Fades: over days to weeks',
      example: 'GW170817 / AT 2017gfo',
      text: 'In the galaxy NGC 4993, 130 million light-years away. It was the first merger seen in both gravitational waves and light, and its spectrum showed freshly made heavy elements such as strontium.' },
    { id: 'gw_merger', group: 'binary', disc: 'gw_merger', view: { kind: 'inspiral', r: 12, p: { prog: 0.9, sep: 9, ang: 0.4, pair: [{ type: 'bh', r: 7.5, x: -18, y: -7 }, { type: 'bh', r: 7.5, x: 18, y: 7 }] } }, unit: 'snr', label: 'snr', rel: ['blackhole', 'kilonova'],
      name: 'Black Hole Merger',
      facts: 'Signal: a chirp rising in pitch, under a second for heavy pairs | Radiated: about 5% of the total mass | Peak power: more than all the stars we can see',
      example: 'GW150914',
      text: 'Black holes of about 36 and 29 M☉ merged about 1.3 billion light-years away into one of 62 M☉. The missing 3 M☉ left as gravitational waves. It was the first direct detection of them, in September 2015.' },
  ];

  CA.ATLAS_BY = {};
  CA.ATLAS.forEach((e) => (CA.ATLAS_BY[e.id] = e));
})(globalThis.CA = globalThis.CA || {});
