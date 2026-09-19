/* Item 07 — the Lambert solver, tested as MATHEMATICS before it is tested as a
 * mission, then the planner built on it, then the one new way of flying a burn
 * that a Lambert solution needs.
 *
 * The end-to-end proof that any of this is worth having is in mars.test.js,
 * which flies M-11 from the dark pad to the water. This suite is the machinery
 * underneath it.
 */
const { boot, suite } = require('./harness');
const G = boot();
const { BODIES, AU, TAU, V, propagate, elements, lambert, setOrbit, setHelio,
        bodyStateInParent, craftMass, curFlow, fmtMET } = G;
const S = G.S;
const T = suite('LAMBERT');
const ok = (n, c, x) => T.ok(n, c, x);
const DAY = 86400;

/* ================================================================
   1. LAMBERT AS MATHEMATICS
   The only honest test of a two-point boundary-value solver: take an orbit
   whose answer is already known, throw away everything but the two endpoints
   and the clock, and see whether the velocities come back.
   ================================================================ */
console.log('\nROUND TRIP AGAINST propagate()');
{
  const MU_E = BODIES.EARTH.mu, MU_S = BODIES.SUN.mu;
  // Every regime the game actually flies: a parking orbit, an eccentric one,
  // a lunar transfer arc, a heliocentric cruise, the e = 0.25 arc a Mars flyby
  // leaves M-11 on, and a hyperbolic flyby.
  const cases = [
    ['LEO circular 400 km', MU_E, {x:6771,y:0}, {x:0,y:Math.sqrt(MU_E/6771)},      [600, 2000, 2700, 4000, 5000]],
    ['LEO e = 0.70',        MU_E, {x:6771,y:0}, {x:0,y:Math.sqrt(MU_E*1.7/6771)},  [600, 3600, 20000, 30000]],
    ['lunar transfer arc',  MU_E, {x:6671,y:0}, {x:0,y:10.85},                     [3600, 86400, 200000, 400000]],
    ['heliocentric 1 AU',   MU_S, {x:AU,y:0},   {x:0,y:Math.sqrt(MU_S/AU)},        [30*DAY, 120*DAY, 250*DAY]],
    ['the flyby arc, e=0.25', MU_S, {x:1.0415*AU,y:0}, {x:0,y:Math.sqrt(MU_S*1.2471/(1.0415*AU))}, [50*DAY, 200*DAY, 400*DAY]],
    ['hyperbolic flyby',    BODIES.MARS.mu, {x:90000,y:0}, {x:-2.0,y:1.5},         [3600, 20000, 90000]],
  ];
  let worstV = 0, worstName = '', worstT = 0, n = 0, solved = 0;
  for (const [name, mu, r0, v0, dts] of dts_all(cases)) {
    n++;
    const p = propagate(r0, v0, mu, dts);
    const L = lambert(r0, p.r, dts, mu, {});
    if (!L || !L.ok) continue;
    solved++;
    const e1 = Math.hypot(L.v1.x - v0.x, L.v1.y - v0.y) * 1000;   // m/s
    const e2 = Math.hypot(L.v2.x - p.v.x, L.v2.y - p.v.y) * 1000;
    const w = Math.max(e1, e2);
    if (w > worstV) { worstV = w; worstName = `${name}, dt ${dts} s`; }
    if (L.resid > worstT) worstT = L.resid;
  }
  function* dts_all(cs) { for (const [nm, mu, r0, v0, list] of cs) for (const dt of list) yield [nm, mu, r0, v0, dt]; }
  ok('every regime the game flies has a solution', solved === n, `${solved} of ${n}`);
  // The one exception is deliberate and it is tested below, not hidden: a dt
  // longer than the period of the arc it was generated on is more than one
  // revolution, and a zero-revolution solver correctly returns a DIFFERENT
  // transfer. Those cases are kept out of this residual.
  ok('and the velocities come back to the ones it started with',
     worstV < 1e-6, `worst ${worstV.toExponential(3)} m/s (${worstName})`);
  ok('with the flight time solved to the tolerance it claims',
     worstT < 1e-6, `worst flight-time residual ${worstT.toExponential(3)} s`);
}

/* The stronger test, and the one that also covers the >1-revolution case: fly
   whatever Lambert hands back and see where it lands. */
console.log('\nFLY WHAT IT HANDS BACK');
{
  const MU_E = BODIES.EARTH.mu;
  const cases = [
    ['LEO circular, 0.7 rev', MU_E, {x:6771,y:0}, {x:0,y:Math.sqrt(MU_E/6771)}, 4000],
    ['LEO e=0.7, 1.78 revs',  MU_E, {x:6771,y:0}, {x:0,y:Math.sqrt(MU_E*1.7/6771)}, 60000],
    ['lunar arc',             MU_E, {x:6671,y:0}, {x:0,y:10.85}, 400000],
  ];
  let worstR = 0, worstV = 0, rows = [];
  for (const [name, mu, r0, v0, dt] of cases) {
    for (const longWay of [false, true]) {
      const p = propagate(r0, v0, mu, dt);
      const L = lambert(r0, p.r, dt, mu, { longWay });
      if (!L) { rows.push(`${name} long=${longWay}: none`); continue; }
      const fwd = propagate(r0, L.v1, mu, dt);
      const dr = Math.hypot(fwd.r.x - p.r.x, fwd.r.y - p.r.y);
      const dv = Math.hypot(fwd.v.x - L.v2.x, fwd.v.y - L.v2.y) * 1000;
      worstR = Math.max(worstR, dr); worstV = Math.max(worstV, dv);
      rows.push(`${(L.dnu*180/Math.PI).toFixed(0)}°`);
    }
  }
  ok('flying v1 from r1 for dt arrives at r2 with v2, short way and long',
     worstR < 1e-5 && worstV < 1e-5,
     `worst miss ${worstR.toExponential(2)} km, worst velocity ${worstV.toExponential(2)} m/s over ${rows.length} arcs`);
  // More than one revolution: the endpoints came off an arc that went round
  // nearly twice, and a zero-revolution solver must return the single-loop
  // transfer that joins them in the same time. It is a real transfer and it is
  // NOT the one the endpoints came from.
  const mu = BODIES.EARTH.mu, r0 = {x:6771,y:0}, v0 = {x:0,y:Math.sqrt(mu*1.7/6771)};
  const p = propagate(r0, v0, mu, 60000);
  const L = lambert(r0, p.r, 60000, mu, {});
  const back = propagate(r0, L.v1, mu, 60000);
  const e0 = elements(r0, v0, mu), e1 = elements(r0, L.v1, mu);
  ok('a flight time past one revolution returns a real transfer, a different one',
     Math.hypot(back.r.x - p.r.x, back.r.y - p.r.y) < 1e-5 && Math.abs(e1.e - e0.e) > 0.05,
     `e ${e0.e.toFixed(4)} in, e ${e1.e.toFixed(4)} out, arrives within ${Math.hypot(back.r.x-p.r.x, back.r.y-p.r.y).toExponential(2)} km`);
}

console.log('\nWHICH WAY ROUND');
{
  const mu = BODIES.SUN.mu, r1 = {x:AU,y:0}, r2 = {x:0,y:1.1*AU};
  const pro = lambert(r1, r2, 200*DAY, mu, { dir: 1 });
  const ret = lambert(r1, r2, 200*DAY, mu, { dir: -1 });
  const ep = elements(r1, pro.v1, mu), er = elements(r1, ret.v1, mu);
  ok('prograde and retrograde are two different transfers, and the sense is right',
     ep.h > 0 && er.h < 0 && Math.abs(pro.dnu - ret.dnu) > 1,
     `prograde ${(pro.dnu*180/Math.PI).toFixed(0)}° h+, retrograde ${(ret.dnu*180/Math.PI).toFixed(0)}° h−`);
  // In a PLANE these are the same knob, which is worth stating rather than
  // pretending there are four combinations when there are two.
  const lw = lambert(r1, r2, 200*DAY, mu, { longWay: true });
  ok('and in a plane the long way IS the retrograde way — one knob, two spellings',
     Math.abs(lw.dnu - ret.dnu) < 1e-12 && Math.abs(V.len(lw.v1) - V.len(ret.v1)) < 1e-12,
     `${(lw.dnu*180/Math.PI).toFixed(3)}° both ways`);
}

console.log('\nWHAT IT REFUSES');
{
  const mu = BODIES.EARTH.mu, r1 = {x:6771,y:0};
  ok('the same point twice has no transfer', lambert(r1, {...r1}, 600, mu, {}) === null);
  ok('a point directly opposite is a plane the solver cannot choose', lambert(r1, {x:-6771,y:0}, 600, mu, {}) === null);
  ok('zero and negative flight times are refused',
     lambert(r1, {x:0,y:6771}, 0, mu, {}) === null && lambert(r1, {x:0,y:6771}, -600, mu, {}) === null);
  ok('a body with no gravity has no transfer either', lambert(r1, {x:0,y:6771}, 600, 0, {}) === null);
  // There is no upper limit on flight time to refuse: every finite dt has a
  // zero-revolution solution, because the joining ellipse simply grows. A
  // four-thousand-day transfer between two points 1 AU apart is a real orbit
  // out past 8 AU, and saying so is more honest than pretending it is illegal.
  ok('a very long flight time is a very large ellipse, not an error',
     (() => { const L = lambert({x:AU,y:0}, {x:0,y:AU}, 4000*DAY, BODIES.SUN.mu, {});
              return !!L && L.ok && elements({x:AU,y:0}, L.v1, BODIES.SUN.mu).ra > 5*AU; })(),
     (() => { const L = lambert({x:AU,y:0}, {x:0,y:AU}, 4000*DAY, BODIES.SUN.mu, {});
              return L ? `aphelion ${(elements({x:AU,y:0}, L.v1, BODIES.SUN.mu).ra/AU).toFixed(1)} AU` : 'none'; })());
}

/* ================================================================
   2. THE PLANNER
   ================================================================ */
console.log('\nTHE PORKCHOP, FROM AN ECCENTRIC ARC');
{
  // The arc a Mars flyby leaves M-11 on — 1.0415 × 1.7249 AU, e = 0.2471 —
  // rigged directly so this runs in milliseconds instead of a 537-day flight.
  // The SAME arc is reached by actually flying it in mars.test.js.
  const g = boot(); const s = g.S;
  g.loadMission(12);
  while (g.jettisonStage() === null) ;
  s.pad = null; s.fairing = false;
  s.craft.fuel = 12257;
  g.setHelio(1.0415, 1.7249, 40, 0);
  g.derive();
  g.exec('PWR UP'); for (let i = 0; i < 4000 && s.pwrUp; i++) g.advance(1);
  const e = g.D.e;
  ok('the test is set on the arc the mission is actually on, not a circle',
     s.soi === 'SUN' && e.e > 0.24 && e.e < 0.25,
     `${(e.rp/AU).toFixed(4)} × ${(e.ra/AU).toFixed(4)} AU, e ${e.e.toFixed(4)}, period ${(e.period/DAY).toFixed(0)} d`);

  // What the shipped tool says about this orbit, in its own words.
  const k0 = g.lines().length;
  g.exec('PLAN XFER EARTH');
  ok('PLAN XFER still says out loud that it is the wrong tool here',
     g.since(k0).some(l => /not circular/.test(l)),
     (g.since(k0).find(l => /not circular/.test(l)) || '').slice(0, 64));

  const k1 = g.lines().length;
  g.exec('PLAN LAMBERT EARTH 300');
  const rows = g.since(k1);
  const row = (re) => (rows.find(l => re.test(l)) || '').trim();
  ok('PLAN LAMBERT solves one, and quotes an inertial heading to fly it at',
     /BURN INRT/.test(g.burnLine() || ''), g.burnLine());
  ok('and it lands the arrival on the periapsis it was asked for',
     /ARRIVAL PERI\s+30[0-9] km|ARRIVAL PERI\s+300 km/.test(row(/ARRIVAL PERI/)), row(/ARRIVAL PERI/));
  ok('and it goes round Earth the way Earth turns',
     /with the rotation/.test(row(/GOES ROUND/)), row(/GOES ROUND/));
  const P = s.lambert;
  ok('the plan is kept where the page can read it', !!P && P.target === 'EARTH',
     P ? `wait ${(P.wait/DAY).toFixed(1)} d, tof ${(P.tof/DAY).toFixed(1)} d, ${P.evals} trajectories searched` : 'none');
  ok('the finite burn is solved, not quoted impulsively — the residual says so',
     P.resid < 1e-4, `${P.resid.toExponential(2)} m/s between what the burn achieves and what Lambert asks`);

  // The number the whole item exists for.
  // Measured on the flown mission: PLAN XFER's return departs for 2,115 m/s
  // and arrives at v∞ 10.7 km/s, where the capture is 6,839 — 8,954 m/s all
  // told, against 8,274 aboard. Anything under six thousand here is a
  // different mission.
  ok('it is far cheaper than what the Hohmann seed produces from this arc',
     P.dvDep + P.dvCap < 6000 && P.vinf < 4,
     `depart ${P.dvDep.toFixed(0)} + capture ${P.dvCap.toFixed(0)} = ${(P.dvDep+P.dvCap).toFixed(0)} m/s, v∞ ${P.vinf.toFixed(3)} km/s, against 8,954 and 10.679`);

  // ...and the trap that goes with it, which the page has to show.
  ok('the cheapest transfer arrives too heavy to land, and the plan says so',
     P.massAfter > s.craft.entryMax && rows.some(l => /too heavy to come down/.test(l)),
     `${P.massAfter.toFixed(0)} kg against ${s.craft.entryMax} it can land at`);

  const k2 = g.lines().length;
  g.exec('PLAN LAMBERT EARTH 300 30');
  const Q = s.lambert;
  ok('a departure window buys a heavier burn, a lighter arrival and a shorter trip',
     Q.wait < 30*DAY && Q.dvDep > P.dvDep && Q.massAfter < P.massAfter && Q.tArr < P.tArr,
     `leave in ${(Q.wait/DAY).toFixed(1)} d for ${Q.dvDep.toFixed(0)} m/s, home ${((P.tArr-Q.tArr)/DAY).toFixed(0)} days sooner, ${Q.massAfter.toFixed(0)} kg`);
  ok('and that one CAN be landed', Q.massAfter <= s.craft.entryMax &&
     !g.since(k2).some(l => /too heavy to come down/.test(l)),
     `${Q.massAfter.toFixed(0)} kg of ${s.craft.entryMax}`);
}

console.log('\nWHICH SIDE OF THE PLANET, AND WHAT IT IS WORTH');
{
  // The air turns with the body, so the side the arrival passes on decides
  // whether entry speed is v − ωr or v + ωr. Sutton-Graves goes as v³.
  const g = boot(); const s = g.S;
  g.loadMission(12);
  while (g.jettisonStage() === null) ;
  s.pad = null; s.fairing = false; s.craft.fuel = 12257;
  g.setHelio(1.0415, 1.7249, 40, 0); g.derive();
  g.exec('PWR UP'); for (let i = 0; i < 4000 && s.pwrUp; i++) g.advance(1);
  g.exec('PLAN LAMBERT EARTH 300 30');
  const P = s.lambert;
  ok('the planner picks the side that turns with the planet', P.withSpin && P.arrDir === 1,
     `arrival dir ${P.arrDir}, Earth spins +1`);
  // And the size of the prize, computed the way the entry model computes it.
  const wEarth = BODIES.EARTH.rot * (BODIES.EARTH.R + 300);
  const vOrb = Math.sqrt(BODIES.EARTH.mu / (BODIES.EARTH.R + 300));
  const gain = Math.pow((vOrb + wEarth)/(vOrb - wEarth), 3);
  ok('and the wrong side would be worth a large fraction of the heating rate',
     gain > 1.3, `${gain.toFixed(2)}× the peak rate, ${(2*wEarth*1000).toFixed(0)} m/s of air-relative speed`);
}

console.log('\nIT IS NOT A ONE-MISSION TOOL');
{
  // The same command, from a circular parking orbit to the Moon — where
  // PLAN XFER is perfectly happy and the two should agree about the physics.
  const g = boot(); const s = g.S;
  g.loadMission(4);
  const k = g.lines().length;
  g.exec('PLAN LAMBERT MOON 870');
  const P = s.lambert;
  ok('PLAN LAMBERT MOON works from a parking orbit too', !!P && P.entered,
     P ? `depart in ${(P.wait/3600).toFixed(1)} h, ${(P.tof/DAY).toFixed(2)} d out, ${P.dvDep.toFixed(0)} m/s, arrive ${P.periAlt.toFixed(0)} km` : 'no plan');
  ok('and it aims where it is told', !!P && Math.abs(P.periAlt - 870) < 60,
     P ? `${P.periAlt.toFixed(0)} km against 870 asked` : '—');
  ok('it refuses a body that does not orbit the one you are at',
     (g.exec('PLAN LAMBERT MARS'), /does not orbit/.test(g.lines().slice(-1)[0])),
     g.lines().slice(-1)[0].slice(0, 60));
}

/* ================================================================
   3. FLYING A VECTOR: the inertial burn
   ================================================================ */
console.log('\nBURN INRT');
{
  const g = boot(); const s = g.S;
  g.loadMission(2);
  g.exec('BURN INRT 37.5 20');
  ok('BURN INRT holds an angle somebody else decided',
     s.att.mode === 'INRT' && Math.abs(s.att.inertial*180/Math.PI - 37.5) < 1e-9,
     `${(s.att.inertial*180/Math.PI).toFixed(3)}°`);
  // Fly it, and check the velocity change actually came out along that heading.
  const v0 = { ...s.v };
  let n = 0; while (n++ < 40000 && s.status === 'flight' && s.burn) g.advance(0.25);
  const dvv = V.sub(s.v, v0);
  ok('and the engine pushes along it, not along prograde',
     Math.abs(V.len(dvv)) > 0.01, `Δv ${(V.len(dvv)*1000).toFixed(1)} m/s`);
  // simBurn must reproduce the flown burn, because the planner solves against
  // simBurn and the player flies burnStep. The nose is put on the heading
  // first: the burn clock stops while the vehicle turns, so a burn commanded
  // from the wrong attitude starts late and from somewhere else, which is a
  // difference in the SLEW and not in the integration.
  const g2 = boot(); const s2 = g2.S;
  g2.loadMission(2);
  const hdg = 37.5*Math.PI/180;
  g2.setAttMode('INRT', hdg); s2.att.theta = hdg; s2.att.rate = 0;
  const r0 = { ...s2.r }, vv0 = { ...s2.v }, m0 = g2.craftMass();
  const sim = g2.simBurn(r0, vv0, BODIES.EARTH.mu, 'INRT', 20, m0, hdg);
  g2.exec('BURN INRT 37.5 20');
  let k = 0; while (k++ < 40000 && s2.status === 'flight' && s2.burn) g2.advance(0.25);
  const dr = Math.hypot(sim.r.x - s2.r.x, sim.r.y - s2.r.y);
  const dv = Math.hypot(sim.v.x - s2.v.x, sim.v.y - s2.v.y)*1000;
  ok('and simBurn INRT agrees with the burn the vehicle actually flies',
     dr < 0.05 && dv < 0.5, `${dr.toExponential(2)} km, ${dv.toExponential(2)} m/s apart after 20 s`);
  ok('an armed inertial burn keeps its heading through the wait',
     (() => { const g3 = boot(); g3.loadMission(2);
              g3.exec('BURN INRT 200 15 AT T+600');
              const held = g3.S.sched && Math.abs(g3.S.sched.inrt*180/Math.PI - 200) < 1e-9;
              let i = 0; while (i++ < 40000 && g3.S.status === 'flight' && (g3.S.sched || g3.S.burn)) g3.advance(0.5);
              return held && Math.abs(g3.S.att.inertial*180/Math.PI - 200) < 1e-9; })(),
     'armed, waited, fired on the same heading');
  ok('the four steering references still take the arguments they always did',
     (() => { const g4 = boot(); g4.loadMission(2); g4.exec('BURN PRO 12');
              return !!g4.S.burn && g4.S.burn.dir === 'PRO' && Math.abs(g4.S.burn.total - 12) < 1e-9; })());
}

/* ================================================================
   4. THE PAGE
   ================================================================ */
console.log('\nTHE ARC TRANSFER PAGE');
{
  const g = boot();
  g.loadMission(4);
  g.gotoPage('PLAN'); g.renderCDU();
  const link = g.CURRENT.map(r => [r.l, r.r]).flat().filter(Boolean).find(f => f.act === 'LAMB');
  ok('PLAN carries a link to it — a link, not a thirteenth function key', !!link,
     link ? link.val : 'missing');
  ok('there are still exactly twelve function keys', g.PAGEKEYS.length === 12);
  g.gotoPage('LAMB'); g.renderCDU();
  const empty = g.CURRENT.map(r => r.full && r.full.val).filter(Boolean).join(' ');
  ok('with nothing solved it explains what it is for', /arc you are actually on/.test(empty),
     empty.slice(0, 60) + '…');
  g.exec('PLAN LAMBERT MOON 870');
  g.gotoPage('LAMB'); g.renderCDU();
  const txt = g.CURRENT.map(r => [r.l, r.r].filter(Boolean).map(f => f.lab + ' ' + f.val).join(' | ')).join(' ‖ ');
  ok('and once solved it shows the trip, the cost and the mass it leaves',
     /Depart in/.test(txt) && /Arrival v/.test(txt) && /Mass after/.test(txt) && !/undefined|NaN/.test(txt),
     txt.slice(0, 100) + '…');
}

/* ================================================================
   5. THE CANOPIES BELONG TO THE AIRFRAME
   ================================================================ */
console.log('\nCANOPIES ARE PER-VEHICLE, LIKE THE SHIELD ALWAYS WAS');
{
  const g = boot();
  // `cda` on the loaded craft is the LIT STAGE's — a launcher's own drag area
  // while one is under it. The spacecraft's own is `cdaPayload`, and that is
  // the one an entry is flown on.
  g.loadMission(11);                       // M-10, the reference capsule
  ok('a vehicle that declares no canopies flies the reference set',
     g.S.craft.chutes == null && g.chuteSize('MAIN') === G.CHUTES.MAIN.area &&
     g.chuteSize('DROGUE') === G.CHUTES.DROGUE.area,
     `${g.chuteSize('DROGUE')} / ${g.chuteSize('MAIN')} m², shield face ${g.S.craft.cdaPayload} m²`);
  g.loadMission(12);                       // M-11, which comes home at 7.4 t
  ok('and one that does gets its own, sized for the mass it lands at',
     g.chuteSize('MAIN') === 1500 && g.chuteSize('DROGUE') === 150 && g.S.craft.cdaPayload === 39,
     `${g.chuteSize('DROGUE')} / ${g.chuteSize('MAIN')} m², shield face ${g.S.craft.cdaPayload} m²`);
  g.loadMission(13);                       // M-12, untouched
  ok('every other airframe is untouched by that',
     g.S.craft.chutes == null && g.S.craft.cdaPayload === 26 && g.S.craft.entryMax == null,
     `M-12 ${g.chuteSize('DROGUE')} / ${g.chuteSize('MAIN')} m², ${g.S.craft.cdaPayload} m², no landing-mass advisory`);
}

T.done('the Lambert solver and its planner: all checks passed');
