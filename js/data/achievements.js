/* COSMIC ASCENSION — achievements (data). Rules live in js/core/records.js.
   cat    evolution | minigame | event | discovery | endgame | hidden (hidden ones show ??? until earned)
   tier   index into BAL.ach.reward: research paid once
   count  s → a number, earned at `of`, with progress on the card. Otherwise test: s → true when earned.
   Long goals use what survives a new cycle (s.discovered, s.origins, s.stats, s.ev, s.mg). Conditions on
   s.star or s.remnant are fine too: they are checked every second while the body exists. */
(function (CA) {
  'use strict';
  const has = (s, ids) => ids.filter((id) => s.discovered[id]).length;
  const sum = (o) => Object.keys(o).reduce((n, k) => n + o[k], 0);
  const mgAt = (s, level) => CA.State.MG_IDS.filter((id) => s.mg[id].cleared >= level).length;
  const kinds = (o) => CA.EVENTS.filter((e) => o[e.id]).length;
  const inCat = (c) => CA.DISCOVERIES.filter((d) => d.cat === c).map((d) => d.id);
  const finds = () => CA.DISCOVERIES.filter((d) => !d.id.startsWith('stage:')).map((d) => d.id);
  const PLANETS = Object.keys(CA.PLANET_TYPES), FATES = ['stage:whitedwarf', 'stage:neutronstar', 'stage:blackhole'], MG_N = CA.State.MG_IDS.length;
  const RARE = inCat('Rare'), OBS = inCat('Observation'), ALL = CA.DISCOVERIES.map((d) => d.id);
  const ignited = (s) => !!(s.star && s.star.ignited);

  CA.ACHIEVEMENTS = [
    // evolution
    { id: 'first_world', cat: 'evolution', tier: 0, name: 'A World of Your Own', desc: 'Finalize your first planet.', count: (s) => has(s, PLANETS), of: 1 },
    { id: 'all_worlds', cat: 'evolution', tier: 2, name: 'Planetary Survey', desc: 'Finalize all four types of planet.', count: (s) => has(s, PLANETS), of: PLANETS.length },
    { id: 'first_light', cat: 'evolution', tier: 0, name: 'First Light', desc: 'Ignite hydrogen fusion in a star.', test: (s) => s.discovered['stage:mainseq'] },
    { id: 'heavyweight', cat: 'evolution', tier: 1, name: 'Heavyweight', desc: 'Ignite a star of 40 M☉ or more.', test: (s) => ignited(s) && s.star.M0 >= 40 },
    { id: 'three_fates', cat: 'evolution', tier: 2, name: 'Three Fates', desc: 'Reach a white dwarf, a neutron star and a black hole.', count: (s) => has(s, FATES), of: FATES.length },
    { id: 'once_more', cat: 'evolution', tier: 0, name: 'Once More', desc: 'Seed your first new cycle.', count: (s) => s.stats.cycles, of: 1 },
    { id: 'generations', cat: 'evolution', tier: 2, name: 'Generations of Stars', desc: 'Complete 5 cycles.', count: (s) => s.stats.cycles, of: 5 },
    { id: 'solar_metals', cat: 'evolution', tier: 1, name: 'Solar Metallicity', desc: 'Enrich the gas to Z = 0.014, about the Sun\'s value.', test: (s) => s.Z >= 0.014 },

    // minigames
    { id: 'mg_first', cat: 'minigame', tier: 0, name: 'First Experiment', desc: 'Clear any minigame level.', count: (s) => s.stats.minigames, of: 1 },
    { id: 'mg_one_master', cat: 'minigame', tier: 1, name: 'Specialist', desc: 'Clear level 5 of any minigame.', count: (s) => mgAt(s, 5), of: 1 },
    { id: 'mg_all_tried', cat: 'minigame', tier: 1, name: 'All-Round Scientist', desc: 'Clear level 1 of all eight minigames.', count: (s) => mgAt(s, 1), of: MG_N },
    { id: 'mg_all_master', cat: 'minigame', tier: 3, name: 'Full Professor', desc: 'Clear level 5 of all eight minigames.', count: (s) => mgAt(s, 5), of: MG_N },

    // cosmic events
    { id: 'ev_first', cat: 'event', tier: 0, name: 'Weather Watcher', desc: 'Handle a cosmic event well.', count: (s) => sum(s.ev.won), of: 1 },
    { id: 'ev_twenty', cat: 'event', tier: 1, name: 'Storm Chaser', desc: 'Handle 20 cosmic events well.', count: (s) => sum(s.ev.won), of: 20 },
    { id: 'ev_all_seen', cat: 'event', tier: 2, name: 'Seen It All', desc: 'Witness every kind of cosmic event.', count: (s) => kinds(s.ev.count), of: CA.EVENTS.length },
    { id: 'ev_all_won', cat: 'event', tier: 3, name: 'Nothing Surprises You', desc: 'Handle every kind of cosmic event well.', count: (s) => kinds(s.ev.won), of: CA.EVENTS.length },

    // discoveries
    { id: 'disc_ten', cat: 'discovery', tier: 0, name: 'Curious Mind', desc: 'Make 10 discoveries (stages do not count).', count: (s) => has(s, finds()), of: 10 },
    { id: 'obs_all', cat: 'discovery', tier: 2, name: 'Observatory', desc: 'Make every Observation discovery.', count: (s) => has(s, OBS), of: OBS.length },
    { id: 'rare_all', cat: 'discovery', tier: 2, name: 'Rare Collection', desc: 'Make every Rare discovery.', count: (s) => has(s, RARE), of: RARE.length },
    { id: 'disc_all', cat: 'discovery', tier: 3, name: 'Complete Catalogue', desc: 'Make every discovery, stages included.', count: (s) => has(s, ALL), of: ALL.length },

    // binary endgame
    { id: 'not_alone', cat: 'endgame', tier: 0, name: 'Not Alone', desc: 'Keep a remnant as a binary companion.', test: (s) => s.companion },
    { id: 'standard_candle', cat: 'endgame', tier: 1, name: 'Standard Candle', desc: 'Set off a Type Ia supernova.', test: (s) => s.discovered.type_ia },
    { id: 'forge_of_gold', cat: 'endgame', tier: 2, name: 'Forge of Gold', desc: 'Merge neutron stars into a kilonova.', test: (s) => s.discovered.kilonova },
    { id: 'we_heard_it', cat: 'endgame', tier: 2, name: 'We Heard It', desc: 'Detect the chirp of two merging black holes.', test: (s) => s.discovered.gw_merger },
    { id: 'clean_signal', cat: 'endgame', tier: 2, name: 'Clean Signal', desc: 'Record any merger with SNR 14 or more.', test: (s) => s.stats.bestSnr >= 14 },
    { id: 'stardust', cat: 'endgame', tier: 3, name: 'We Are Stardust', desc: 'Fill the whole origin-of-the-elements table.', count: (s) => CA.Binary.ORIGINS.filter((k) => s.origins[k]).length, of: 6 },

    // hidden
    { id: 'goodbye_world', cat: 'hidden', tier: 1, name: 'Goodbye, World', desc: 'Your own star swallowed your planet.', test: (s) => s.discovered.engulfment },
    { id: 'rogue_planet', cat: 'hidden', tier: 1, name: 'Rogue Planet', desc: 'A supernova flung your planet into the dark.', test: (s) => s.planet && s.planet.lostBy === 'ejected' },
    { id: 'barely_a_star', cat: 'hidden', tier: 1, name: 'Barely a Star', desc: 'Ignite a star under 0.1 M☉, just above the brown-dwarf limit.', test: (s) => ignited(s) && s.star.M0 < 0.1 },
    { id: 'no_black_dwarfs', cat: 'hidden', tier: 1, name: 'No Black Dwarfs Yet', desc: 'Watch one white dwarf for 10 minutes. The universe is still too young for any to have cooled to black.', test: (s) => s.remnant && s.remnant.type === 'wd' && s.remnant.age >= 600 },
    { id: 'metronome', cat: 'hidden', tier: 1, name: 'Metronome', desc: 'Record 50 pulsar pulses in a row.', test: (s) => s.remnant && s.remnant.best >= 50 },
    { id: 'like_saturn', cat: 'hidden', tier: 1, name: 'Like Saturn', desc: 'Give a gas giant a ring system.', test: (s) => s.planet && s.planet.type === 'gasgiant' && s.system.some((b) => b.type === 'ring') },
  ];
})(globalThis.CA = globalThis.CA || {});
