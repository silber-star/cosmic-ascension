# Cosmic Ascension — science notes and simplifications

The game is *science-inspired*, not a scientific simulation. Every major rule below is a deliberate
simplification. Numbers live in `js/data/balance.js` and `js/core/evolution.js`.

## Motion and gravity (`js/core/sim.js`)
- Motes feel only the player's body and the player's fields — there is **no mutual gravity** between motes and no real N-body solver.
- Forces are **softened 1/r** (`a = S / (r + c)`), not Newtonian 1/r², so control feels good on screen.
- Motes merge on gentle contact and bounce or shatter on fast contact (spatial hash, O(n)).
- At grain scale real dust sticks through contact forces (van der Waals, electrostatics); its gravity is negligible.
  The "gravity well" there stands in for the gas motions that push grains together.

## Order of events
- In nature the cloud core collapses first, then the protostar and the planets in its disk grow **at the same time**
  (rocky planets ~10–100 Myr, gas giants within ~10 Myr, the Sun reached the main sequence after ~50 Myr).
  The game plays dust → core collapse → planet → star in sequence. Planets never turn into stars.
- All times are compressed by many orders of magnitude.

## Cloud core and star formation
- Jeans mass, order of magnitude: `M_J ≈ 1 M☉ (T/10 K)^1.5 (n/10⁴ cm⁻³)^-0.5`. Core density is taken as proportional to core mass.
- Heating drift and "Radiative Cooling" are gameplay levers for temperature.
- Star mass = 35% of the core mass at collapse (a typical star-formation efficiency is ~30–50%). Range 0.08–120 M☉.
- Hydrogen ignition at ~10 MK. Below 0.08 M☉ an object would be a brown dwarf (outflows stop there).
- Pair-instability supernovae (> ~130 M☉) are not modelled.

## Main sequence
- Mass–luminosity relation (piecewise textbook fit): `L = 0.23 M^2.3` (M < 0.43), `M^4` (< 2), `1.4 M^3.5` (< 55), `32000 M`.
- Lifetime `t = 10 Gyr · M / L`. Game duration `240 s · (t / 10 Gyr)^0.25`, clamped to 45–900 s.
- Radius `M^0.8` (M < 1) or `M^0.57`; temperature from L and R. Spectral classes from temperature.
- **P/G meter and Core Compression** are a gameplay abstraction of hydrostatic equilibrium. Real stars regulate
  themselves; the player's "compression" has no real-world equivalent.

## Late evolution
- Below 0.5 M☉: no red-giant phase (fully convective). Becoming a helium white dwarf takes far longer than the
  universe's current age — **theoretical**, labelled as such in game.
- Red giant / AGB radii and mass loss follow a simple schedule; most AGB mass loss happens at the end ("superwind").
- Orbits widen as the star loses mass (`a ∝ 1/M`, slow mass loss). Inner-zone planet at 0.8 AU, outer at 5 AU.
  Engulfment happens if the stellar radius exceeds the orbit.
- Helium flash for initial mass < 2 M☉.
- White-dwarf mass from a linear initial–final mass relation (`0.109 M₀ + 0.394`, cf. Kalirai et al. 2008), capped at 1.35 M☉ (< Chandrasekhar).
- Massive stars: burn stages He → C → Ne → O → Si with shrinking (game) durations; real durations are shown in the UI.
- Winds: toy rate `0.0015 (Z/0.014)^0.7 (M/20)^0.8` per game second, plus an optional strong wind chosen by the player.
- Core-collapse outcome from the pre-collapse mass `M_f`:
  - `M_f ≥ 40 M☉` → direct collapse to a black hole with no bright supernova ("failed supernova").
  - otherwise a toy **compactness** `0.12 + 0.012 (M_f − 8) + 0.05 sin(1.7 M_f)`; above 0.25 → black hole (with a supernova), else neutron star.
    The sine term imitates the real, non-monotonic "islands of explodability" seen in simulations; it is not a physical formula.
  - Neutron-star mass 1.2–2.1 M☉; black-hole mass a fixed fraction of `M_f`.
- A supernova that ejects more than half the system's mass unbinds the planet (instant mass-loss rule; kicks ignored).

## Remnants
- White-dwarf cooling: toy curve `T = 100 000 K · (1 + t/12 s)^-0.75`. Crystallization below `6000 K · √(M/0.6)`.
- Neutron star: magnetic-dipole spin-down `P² = P₀² + k t`; spin-down power ∝ `P⁻⁴`. The beam rotation is shown **~50× slower** than reality so it can be timed.
- Black hole: horizon radius ≈ 2.95 km per M☉. Radiative efficiency 6% (non-spinning) up to 42% (maximal spin, "Frame Dragging" upgrade).
  The Eddington limit is a game-unit feeding rate.
- Gravitational lensing: point-mass lens equation `β = θ − θ_E²/θ` applied to the background image per pixel (reduced resolution).
  The accretion-disk picture (lensed far side, Doppler-brightened approaching side) is an artistic approximation.
- Nothing escapes after crossing the event horizon; motes that reach it disappear.

## Minigame models (`js/minigames/models.js`)
- **Stellar Stabilization**: toy two-variable feedback loop (core temperature and P/G) with fusion rate `∝ T^ν`
  (ν from 3 to 6.3 by level, standing in for pp-chain vs CNO sensitivity). Not a stellar-structure model.
- **Orbital Mechanics**: two-body orbital elements from position and velocity; flight is integrated numerically with
  softening; moons and binary stars perturb the orbit. Circumbinary orbits are only stable well outside the binary, as in reality.
- **Gravity Architect**: softened attractors with local damping; impacts above a speed shatter part of the mass.
- **Spectral Analysis**: real rest wavelengths (nm, air) for H (Balmer), He I, Na D, Ca II H&K, Mg b, Fe I, [O III],
  [N II], Ba II and Tc I; Gaussian lines on a Planck continuum (λ_peak = 2.898×10⁶ nm·K / T). Line strengths are set by
  hand per level, not from radiative transfer. The galaxy level shows a single-star spectrum with a redshift
  (non-relativistic Doppler, fine for z ≲ 0.05). The level-5 "S-type star" has no TiO/ZrO molecular bands.
- **Asteroid Navigation**: Newtonian flight with no friction and a Δv budget; rocks are static obstacles. The belt is
  hugely compressed: real asteroids are typically hundreds of thousands of km apart. In the Kirkwood level the x axis
  is semi-major axis (2.1–3.3 AU), so the gaps at the 3:1, 5:2, 7:3 and 2:1 Jupiter resonances appear as empty bands;
  in a real snapshot, eccentric orbits cross the gaps. The DART level uses momentum transfer Δv = β(m/M)v_rel with
  β = 3.6 (the DART result) and vis-viva for the new orbit; the mass ratio is chosen so a ~150 px/s head-on hit
  gives a ~5% period change, like DART's ~32 min out of 11 h 55 min.
- **Pulsar Timing**: periods (0.6–0.95 s) are real pulsar values, but spin-down, glitch size (−6%) and orbital/planet
  delays (tens of ms over seconds) are exaggerated by many orders of magnitude to be audible. Real glitches change the
  period by ~10⁻⁹–10⁻⁶; the Hulse–Taylor orbit is 7.75 h; PSR B1257+12's planets shift pulses by ~1 ms over months.
- **Black Hole Approach** (levels 1–4): the probe moves in the Paczyński–Wiita pseudo-Newtonian potential
  `Φ = −GM/(r − r_s)`. It reproduces the Schwarzschild ISCO (3 r_s) and marginally bound orbit (2 r_s) exactly, but not
  everything else: its circular speed grows without limit toward r_s (in relativity no orbit exists inside 1.5 r_s and
  nothing reaches c), and there are no special-relativistic effects. The arena is 1 r_s = 22 px, so orbital periods are
  seconds. The clock rate `√(1 − r_s/r)` is a *hovering* clock (gravitational part only); an orbiting clock would run
  slower still (`√(1 − 1.5 r_s/r)` on a circular orbit). Tides are `2GMℓ/(r − r_s)³` from the same potential; the level-4
  tidal limit (3.3 r_s) is a gameplay value for a sturdy probe — near a 10 M☉ hole a human would be torn apart dozens
  of r_s out. Levels 1–3 behave as if the hole were massive enough for tides not to matter.
- **Black Hole Approach** (level 5): light follows the exact Schwarzschild photon orbit equation `d²u/dφ² = −u + 1.5 r_s u²`
  (RK4 in φ), with the photon sphere at 1.5 r_s and the critical impact parameter b_c = (√27/2) r_s ≈ 2.6 r_s. The aim
  angle is turned into b with flat geometry (`b = R sin ψ`), ignoring the ~6% local-angle correction at 9 r_s. Light is
  drawn moving at 650 px/s, not at c. Weak-field bending matches `2 r_s / b` (tested).
- **Supernova Survival**: the burst (11–16 events in ~2 s) and background rates are game values; SN 1987A gave about
  24 events over 13 s in three detectors (Kamiokande-II, IMB, Baksan). The ~3 h between the neutrinos and the light is
  compressed to 4 s. The alert "waking the probe and raising shields" is a game mechanic; the real alert network
  (SNEWS) only tells telescopes where to look. Real shock fronts have no holes: the gaps stand in for lumpy, asymmetric
  explosions. A reverse shock is real (it forms when ejecta run into surrounding gas — in SN 1987A the ejecta reached
  the inner ring around 2001), but it comes years later, not seconds. Ejecta keep the onion order in speed (O fastest,
  Fe slowest) and are bunched into three Rayleigh–Taylor-like plumes. The light curve is a toy, not an Arnett model:
  `L(t) = (1 − e^{−(t/τ_d)²}) · [(1 − k) e^{−t/τ_Ni} + k e^{−t/τ_Co}]`, k = ε_Co/ε_Ni ≈ 0.174, half-lives 6.1 d and 77.2 d.
  It has no hydrogen-recombination plateau, which a real red-supergiant (Type II-P) supernova would show. Level 5 uses
  τ_d ≈ 60–70 d so the peak lands near SN 1987A's ~85 days (whose progenitor, Sanduleak −69 202, was actually a blue
  supergiant). After ~day 100 the nickel is gone and the model tail halves every 77.2 days exactly.

## Cosmic events (`js/data/events.js`, `js/core/events.js`)
Events are real phenomena, staged at moments where they matter for gameplay. Frequencies are wildly compressed
(minutes instead of thousands or millions of years), and the player's responses are game mechanics.
- **Supernova shock** (cloud core): shock-triggered collapse is real; "riding" it with a pulse is not. Compression adds
  core mass (our density proxy); an unridden shock also heats the gas a little.
- **Disk disturbance**: turbulence is a random acceleration on motes and a lower safe impact speed (×0.45). The
  reward stands in for a pressure bump / vortex dust trap; real traps last far longer.
- **Meteor stream**: parallel tracks from one radiant, as with real streams; here the stream is collision debris in the
  forming system (today's showers come mostly from comet debris).
- **Asteroid collision**: merge vs shatter is decided by impact speed only (real outcomes also depend on mass ratio,
  angle and material). "Capturing" an impactor into orbit with an ability is fictional; captured moons such as Triton are real.
- **Stellar encounter**: the passing star is a softened attractor on a straight path; the comet shower is a compressed
  version of Oort-cloud perturbations. Gliese 710's predicted pass (~10,000 AU in ~1.3 Myr) is from Gaia-based estimates.
- **Flare / CME**: flare particles and the CME are drawn as motes and an expanding arc. In reality a planet's own
  magnetic field deflects CME plasma; the player's pulse stands in for it. A missed CME drains stored energy (a
  "geomagnetic storm" abstraction).
- **Pulsational instability**: the trigger follows real instability regions (δ Scuti ~1.5–2.5 M☉ and β Cephei ≥ 8 M☉ on
  the main sequence, Cepheid-like giants ≥ 3 M☉, semi-regular red supergiants), but pulsating stars are not "damped" by
  anything in nature — that is the game mechanic.
- **Interstellar visitor**: one body crosses on a straight line at a fixed game speed (your gravity barely bends it), the way
  an unbound (hyperbolic) object passes once. Real visitors come at tens of km/s ('Oumuamua: ~26 km/s before the Sun's
  pull) and are found every few years by survey telescopes, not every few minutes.
- **Roche limit ring**: an impactor captured with Orbital Adjustment closer than 2.44 body radii (the fluid Roche limit
  for equal densities, `2.44 R (ρ_body/ρ_moon)^(1/3)`) becomes a ring at once; in nature the debris spreads over time,
  and rigid bodies can survive somewhat closer (~1.26 R). One ring per system; it follows the planet once that orbits the star.
- **Tidal disruption surge**: debris falls in on plunging orbits and only clumps eaten below the (game-unit) Eddington
  limit count; real TDE flares last months. Plunging debris skips the game's disk-swirl force until it is eaten.

## Binary endgame (`js/core/binary.js`, numbers in `BAL.binary`)
- **Order of events**: real binaries form both stars together and the heavier one dies first. The game keeps a remnant and
  grows a new star beside it, so that each cycle stays a full playthrough. A star forming around an old remnant is not a
  real channel. The orbit is a fixed 200 R☉ throughout: mass transfer and winds do not change it.
- **Surviving the explosion**: the binary always survives the second star's death. In reality kicks and sudden mass loss
  disrupt most massive binaries; those that survive have usually been stripped first, often in a common-envelope phase.
- **Roche lobe**: the Eggleton (1983) fit, real. Transfer starts when the star's radius passes it.
- **Transfer rate**: the slider is a game mechanic; nothing steers a real star. The idea behind the green band is real: a
  white dwarf burns hydrogen steadily only in a narrow range of accretion rates (Nomoto 1982). Below it gas piles up and
  blows off in novae; above it the gas swells into an envelope. Here the band, the rates and the 0.02 M☉ nova shell are
  game values, and all gas in the band is kept, while real retention is much lower. A supergiant overfilling its lobe
  2.5 times would in reality go straight to a common envelope.
- **Type Ia**: triggered at exactly 1.4 M☉. Whether accretion (single degenerate) or merging white dwarfs (double
  degenerate) makes most Type Ia supernovae is still unsettled, and sub-Chandrasekhar explosions also exist. Searches for
  surviving donors have found few candidates; in the game the donor always carries on unharmed.
- **Millisecond pulsars**: accreted gas adds angular momentum, so spin rate grows linearly with accreted mass
  (39,000 rad/s per M☉, from the specific angular momentum at ~20 km), floored at 1.4 ms (PSR J1748−2446ad). The field
  burial `B ∝ exp(−Δm/0.01 M☉)` is a toy. Recycling really takes ~10⁸ yr. Accretion-induced collapse is not modelled.
- **Inspiral**: leading-order quadrupole laws, exact in shape: phase ∝ τ^(5/8), frequency ∝ τ^(−3/8), separation ∝ τ^(1/4).
  One beat is one gravitational-wave cycle, which is half an orbit (f_GW = 2 f_orb), real. The scale is not: 24 beats over
  22–40 s for every pair, where GW170817 swept ~3,000 cycles in ~100 s and GW150914 only ~8 in 0.2 s. Duration
  `34 s (M_c/1.2)^(−1/4)` is a game value; the real time ∝ M_c^(−5/3) f^(−8/3). White-dwarf pairs merge far below LIGO's band
  (they are LISA sources). The orbit is drawn around the centre of mass.
- **SNR**: `16 √(recorded/total)` minus 0.6 per false alarm, each beat weighted ∝ τ^(−1/2) so late beats count most, as
  real signal power does. SNR 8 is roughly LIGO's detection threshold, but a real SNR comes from matched filtering against
  templates, not from anyone pressing a key. The gravitational-wave discovery needs SNR ≥ 8; the merger itself happens anyway.
- **Merger outcomes** are rules of thumb. White dwarfs merge into a Type Ia if the total reaches 1.4 M☉ (real mergers can also
  leave a massive white dwarf or an R CrB star). Two neutron stars leave a black hole above 2.7 M☉ total, roughly the
  rigidly spinning maximum mass; this limit is uncertain, and the remnant of GW170817 is debated. A black hole lighter than 6 M☉
  tears a neutron star apart and gives a kilonova; a heavier one swallows it (real disruption also depends on spin and
  neutron-star radius; GW200105 and GW200115 had no light). 3% of the mass of a neutron-star merger is removed, where real
  ejecta are ~0.05 M☉. Black-hole pairs lose 4.5%, as in GW150914 (~3 of 65 M☉).
- **Magnetars**: a neutron star from a star of 20+ M☉ becomes one with 50% chance, with B = 10¹⁵ G. This rule is an invention
  to make them findable; how magnetars really form is unknown (fast-spinning cores, strong dynamos and massive progenitors
  are all proposed). Spin-down is compressed from ~10⁴ yr to seconds (`P² = P₀² + 2t`, capped at 8 s), and the beam is
  drawn at a fixed 3 s. Power is a flat value standing in for field decay.
- **Fast radio bursts**: the burst event is a compressed form of the single known case, SGR 1935+2154 (28 April 2020).
  A real FRB lasts milliseconds, not the 0.4 s window here. Magnetars explain at least some FRBs, not necessarily all.
- **Supernova remnant**: 50 yr per game second, radius `4 pc (t/450 yr)^0.4` (Sedov-like growth, scaled to Tycho's remnant).
  Young remnants actually expand faster than Sedov at first.
- **Origin of the elements**: six cells for play. Real elements have several sources: carbon comes from AGB and massive stars,
  iron about two-thirds from Type Ia in the Sun's neighbourhood and the rest from core collapse, and the share of the r-process
  from neutron-star mergers versus rare supernovae (collapsars) is debated. Cosmic-ray spallation (Li, Be, B) is left out.

## Codex and achievements (`js/data/atlas.js`, `js/data/achievements.js`, rules in `js/core/records.js`)
- **Real numbers in the Codex describe real objects, not the game.** They are rounded on purpose, and they do not always match
  the game's own ranges: stage masses, stellar lifetimes and the 0.5 / 8 / 20 / 40 M☉ boundaries are simplified as listed above.
  "Terrestrial" here means under 3 M⊕, while astronomers have no agreed line between a large rocky planet and a super-Earth.
- **Pictures are `Bodies.draw` illustrations**, not to scale with each other and not images of the named example. Colours follow
  blackbody temperature only roughly.
- **Figures with real uncertainty**, shown as one rounded value: Betelgeuse's distance (about 500–700 ly) and radius; WR 124's
  distance (NASA's 2023 JWST release says 15,000 ly, some catalogues give nearly twice that); SGR 1806−20 (about 30,000–50,000 ly);
  the Ring Nebula (2,000–2,600 ly); Tycho's remnant (about 8,000–10,000 ly).
- **Interpretations, not settled facts**: planets as the cause of the gaps around HL Tauri; a collapsing pebble cloud as the origin
  of Arrokoth (its gentle contact fits, but does not prove it); the 7-billion-year age of the oldest presolar grains, which depends
  on a cosmic-ray exposure model. SN 1987A's neutron star is inferred from JWST spectra of the ionised gas around it (2024).
- **Kilonova picture**: blue polar and red equatorial ejecta is the standard two-component model used for AT 2017gfo. The colours
  are exaggerated and the real geometry is still studied.
- **Solar metallicity**: Z = 0.014 is the modern estimate (about 0.0134 in Asplund et al. 2009); older books use 0.02.
- **"No Black Dwarfs Yet"**: a white dwarf needs far longer than the 13.8-billion-year age of the universe to fade to black
  (commonly quoted as 10¹⁵ years, order of magnitude). The ten-minute wait is a joke about that, not a cooling calculation.
- **My record** counts one sighting per cycle and keeps the best number seen. It is checked once a second, except mergers and
  Type Ia, which are noted when they happen. Records start empty in older saves, even for bodies already found.

## Lighting (`Bodies.lightOf`)

The colour of a star's light uses the same blackbody fit as the star itself, so it follows real temperature. The pool of light and the tint on nearby dust are drawn for looks: their strength and reach are chosen, not computed from luminosity, and real space has no gas everywhere to show them.

## Fictional abstractions
- The player is a "cosmic will" that steers gravity; abilities, compression, and outflows on demand are game mechanics.
- **New cycles** abstract the enrichment of the interstellar medium by earlier stars (metallicity Z rises each cycle).
