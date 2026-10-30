/* COSMIC ASCENSION — what the player should do right now, and what the HUD tells them about it. No DOM. */
(function (CA) {
  'use strict';
  const Guide = (CA.Guide = {});
  const Evo = () => CA.Evo, Econ = () => CA.Econ;
  const LOW_ENERGY = 15; // below this the well is about to cut out

  /* The i18n key of the single most useful thing to do now. */
  Guide.next = function (s) {
    const d = CA.STAGE[s.stage], E = Evo(), can = E.canAdvance(s);
    switch (d.type) {
      case 'mass': case 'planet':
        if (d.zoneChoice && !s.zone) return 'do.zone';
        if (d.type === 'planet' && can.ok) return 'do.finalize';
        if (d.swarm && s.mass >= d.massEnd * 0.9999 && !s.swarmDone) return 'do.swarm';
        break;
      case 'jeans':
        if (can.ok) return 'do.collapse';
        if (s.core.T > CA.BAL.jeans.Tmin + 1 && s.res.energy >= CA.ABILITIES.cool.cost) return 'do.cool';
        break;
      case 'protostar':
        if (can.ok) return 'do.ignite';
        break;
      case 'mainseq':
        if (Math.abs(s.star.pg - 1) > 0.25) return 'do.stabilize';
        break;
      case 'remnant':
        if (s.companion && can.ok) return 'do.startInspiral';
        if (E.canNewCycle(s)) return 'do.cycle';
        return 'do.' + d.id;
    }
    if (d.abilities.includes('well') && s.res.energy < LOW_ENERGY) return 'do.lowEnergy';
    return 'do.' + d.id;
  };

  /* Where this stage leads, as a stage id, or null when the road ends in a new cycle. */
  Guide.nextStage = function (s) {
    const d = CA.STAGE[s.stage];
    if (d.type === 'remnant' && !s.companion) return null;
    return Evo().nextId(s);
  };

  Guide.affordable = (s) => CA.UPGRADES.concat(CA.PERM_UPGRADES).filter((u) => Econ().canBuy(s, u.id).ok).length;

  /* The upgrade closest to being affordable, for the empty "can buy" list. */
  Guide.nearest = function (s) {
    let best = null, gap = Infinity;
    for (const u of CA.UPGRADES.concat(CA.PERM_UPGRADES)) {
      const E = Econ(), l = E.lvl(s, u.id);
      if (l >= u.max || !E.unlocked(s, u)) continue;
      const cost = E.cost(u, l), ratio = cost / Math.max(1, s.res[u.res]);
      if (ratio < gap) { gap = ratio; best = { def: u, cost }; }
    }
    return best;
  };

  /* Abilities a stage introduces: those no earlier stage has. */
  Guide.newAbilities = function (id) {
    const d = CA.STAGE[id], known = new Set();
    for (const st of CA.STAGES) if (st.index < d.index) st.abilities.forEach((a) => known.add(a));
    return d.abilities.filter((a) => !known.has(a));
  };
})(globalThis.CA = globalThis.CA || {});
