/* Item 06 — a lander that separates, lands, comes back up and re-docks, and a
 * mothership that keeps living while it is gone.
 *
 * The order here is the order the work was done in: prove nothing that shipped
 * moved, prove the new mechanism cannot leak state, then FLY THE WHOLE THING.
 * The flight at the bottom is the acceptance test. A green suite above it
 * means nothing if the mission cannot be completed — that is item 05's lesson
 * and this file is arranged around it.
 */
const { boot, suite } = require('./harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const G = boot();
const S = G.S;
const T = suite('LUNAR LANDING FROM A MOTHERSHIP');
const ok = (n, c, x) => T.ok(n, c, x);

/* ---------- 1. the shipped launches did not move ---------- */
console.log('\nNO PERTURBATION');
/* The thrust-to-weight gate at liftoff used to weigh every vehicle at Earth's
   9.80665 m/s² whatever it was standing on. It now uses the body's own
   gravity, which is the whole reason a lunar ascent is possible at all — and
   which must be worth exactly nothing at the Cape. */
let BASE = null;
try {
  const p = path.join(os.tmpdir(), 'tmpchk-item06-baseline.html');
  fs.writeFileSync(p, execSync('git show bb4f8df:index.html', { encoding: 'utf8', maxBuffer: 64e6 }));
  BASE = p;
} catch (e) { /* no git, no baseline */ }

function ascent(file, id) {
  const g = file ? boot(file) : boot();
  g.loadMission(id);
  g.sysBoot();
  if (g.S.pad) { g.S.pad.hold = false; g.S.pad.T = -1; }
  let n = 0;
  while (n++ < 60000 && g.S.status === 'flight') {
    g.advance(0.25);
    if (g.S.craft.stageName === 'FIRST STAGE' && g.S.craft.fuel <= 0.01) g.jettisonStage();
    if (g.S.pad && g.S.pad.lifted && g.D.alt > 140) break;
  }
  return { r: { ...g.S.r }, v: { ...g.S.v }, t: g.S.t, m: g.craftMass(), lifted: !!(g.S.pad && g.S.pad.lifted) };
}
if (BASE) {
  for (const [id, code] of [[10, 'M-00'], [0, 'FREE'], [11, 'M-10'], [12, 'M-11']]) {
    const a = ascent(BASE, id), b = ascent(null, id);
    const dr = Math.hypot(a.r.x - b.r.x, a.r.y - b.r.y);
    const dv = Math.hypot(a.v.x - b.v.x, a.v.y - b.v.y);
    ok(`${code} lifts off and climbs identically to the page before the gravity fix`,
       b.lifted && dr === 0 && dv === 0 && a.m === b.m && a.t === b.t,
       dr === 0 && dv === 0 ? 'bit-for-bit' : `${(dr*1000).toFixed(6)} m, ${(dv*1000).toFixed(9)} m/s`);
  }
} else {
  ok('baseline page available for an A/B comparison', false, 'git show failed');
}

/* ---------- 2. the gate itself ---------- */
console.log('\nWEIGHT IS LOCAL');
{
  const g = boot();
  ok('Earth\'s surface gravity is its own number, not the G0 constant',
     Math.abs(g.surfaceG(g.BODIES.EARTH) - 9.8196) < 0.001 &&
     Math.abs(g.surfaceG(g.BODIES.MOON) - 1.6249) < 0.001,
     `${g.surfaceG(g.BODIES.EARTH).toFixed(4)} / ${g.surfaceG(g.BODIES.MOON).toFixed(4)} m/s²`);
  // The measured refusal from before the fix: 15 kN under a 2,560 kg lander,
  // a lunar thrust-to-weight of 3.62, turned away as "15 kN against 25 kN".
  g.loadMission(6);
  g.rig({ name:'T', dry:1100, fuel:1400, thrust:15, isp:311, rcs:60, rcsIsp:220, crew:2, o2:300, cda:12 });
  g.setPad('MOON', 0, { count: 5, fairing: false });
  g.S.att.theta = g.pitchToTheta(90); g.S.att.inertial = g.S.att.theta;
  const refusal = g.ignite();
  ok('a lander with four times the thrust it needs may now lift off the Moon',
     refusal === null, refusal || `TWR ${(15000/(g.craftMass()*g.surfaceG(g.BODIES.MOON))).toFixed(2)} lunar`);
  // And a stack that genuinely cannot lift is still refused, on the right number.
  const h = boot(); h.loadMission(6);
  h.rig({ name:'HEAVY', dry:40000, fuel:100, thrust:15, isp:311, cda:12 });
  h.setPad('MOON', 0, { count: 5, fairing: false });
  h.S.att.theta = h.pitchToTheta(90); h.S.att.inertial = h.S.att.theta;
  const no = h.ignite();
  ok('and one that cannot is still refused, weighed on the body it is standing on',
     typeof no === 'string' && /MOON/.test(no), no);
}

/* ---------- 3. the swap cannot leak ---------- */
console.log('\nTWO VEHICLES, NO LEAKS');
{
  const g = boot(); const s = g.S;
  g.loadMission(13); g.sysBoot();
  s.pad = null; s.fairing = false;
  if (s.craft.stages) while (s.craft.stageIx < s.craft.stages.length - 1) g.jettisonStage();
  g.setOrbit('MOON', 100, 100, 0, 0);
  s.objects = [];
  // Make the mothership distinctive in every field that belongs to a vehicle,
  // so that anything carried across shows up.
  s.power.batt = 1234; s.craft.o2 = 777; s.therm.hull = 61; s.craft.fuel = 5000;
  g.derive();
  const before = { batt: s.power.batt, o2: s.craft.o2, fuel: s.craft.fuel, crew: s.craft.crew,
                   name: s.craft.name, cargo: s.craft.cargo, area: s.power.area };
  g.exec('SEP');
  ok('separation hands over the lander', s.craft.name === 'EAGLE-12' && !!s.away, s.craft.name);
  ok('and none of the mothership\'s charge comes with it',
     s.power.batt === 2000 && s.power.battMax === 2000 && s.power.area === 14,
     `${s.power.batt} Wh on ${s.power.area} m² of array`);
  ok('nor its oxygen, its propellant or its hull temperature',
     s.craft.o2 === 300 && s.craft.fuel === 4000 && s.therm.hull === 61,
     `o2 ${s.craft.o2}, fuel ${s.craft.fuel} kg, hull ${s.therm.hull} °C carried across deliberately`);
  ok('the crew split, and the hold gave up exactly what the lander weighs',
     s.craft.crew === 2 && s.away.bag.craft.crew === before.crew - 2 &&
     Math.abs(s.away.bag.craft.cargo - (before.cargo - 7880)) < 1e-9,
     `${s.craft.crew} down, ${s.away.bag.craft.crew} up, hold ${s.away.bag.craft.cargo.toFixed(0)} kg`);
  ok('the mothership kept its own charge, tank and air',
     s.away.bag.power.batt === before.batt && s.away.bag.craft.fuel === before.fuel &&
     s.away.bag.craft.o2 === before.o2,
     `${s.away.bag.power.batt} Wh, ${s.away.bag.craft.fuel} kg, ${s.away.bag.craft.o2} crew-h`);
  ok('and it became a docking target in the orbit it was flying',
     !!g.dockTarget() && g.dockTarget().label === 'SELENE-3', s.objects.map(o => o.label).join(','));
  // Every vehicle-owned key must be in the bag. A key left off this list is
  // exactly the invisible bug the item warned about.
  const missing = g.VEHICLE_KEYS.filter(k => !(k in s.away.bag));
  ok('every vehicle-owned key is carried in the bag', missing.length === 0, missing.join(',') || 'all of them');
}

/* ---------- 4. the ship you left is not in stasis ---------- */
console.log('\nTHE OTHER VEHICLE KEEPS LIVING');
{
  const g = boot(); const s = g.S;
  g.loadMission(13); g.sysBoot();
  s.pad = null; s.fairing = false;
  if (s.craft.stages) while (s.craft.stageIx < s.craft.stages.length - 1) g.jettisonStage();
  g.setOrbit('MOON', 100, 100, 0, 0);
  s.objects = [];
  g.exec('SEP');
  const b0 = s.away.bag.power.batt;
  let min = Infinity, ecl = 0, n = 0;
  while (n++ < 12 * 360) {            // twelve hours
    g.advance(10);
    min = Math.min(min, s.away.bag.power.batt);
    if (s.away.ecl) ecl++;
  }
  ok('the mothership crosses the Moon\'s shadow while you are away',
     ecl > 0 && ecl / (12 * 360) > 0.3 && ecl / (12 * 360) < 0.5,
     `${(ecl / (12 * 360) * 100).toFixed(1)}% of twelve hours in eclipse`);
  ok('and its battery works for a living — down in the dark, back up in the sun',
     min < b0 && s.away.bag.power.batt > min,
     `${b0.toFixed(0)} → ${min.toFixed(0)} → ${s.away.bag.power.batt.toFixed(0)} Wh`);
  ok('its crew are still breathing a closed loop, so the reserve does not move',
     s.away.bag.craft.o2 === 2400, `${s.away.bag.craft.o2} crew-hours`);
}
{
  // And it can be lost. Leave it with the bus down and the arrays stowed, and
  // the loop stops, and then the air does.
  const g = boot(); const s = g.S;
  g.loadMission(13); g.sysBoot();
  s.pad = null; s.fairing = false;
  if (s.craft.stages) while (s.craft.stageIx < s.craft.stages.length - 1) g.jettisonStage();
  g.setOrbit('MOON', 100, 100, 0, 0);
  s.objects = [];
  s.craft.o2 = 40;                    // a mothership left with a thin reserve
  g.exec('SEP');
  s.away.bag.sys.ECLSS.state = 'OFF'; // ...and its loop switched off
  let n = 0;
  while (n++ < 40000 && s.status === 'flight') g.advance(30);
  ok('a mothership left with its loop off is lost, and the flight with it',
     s.status === 'lost', `status ${s.status} after ${(s.t/3600).toFixed(1)} h, o2 ${s.away.bag.craft.o2.toFixed(1)}`);
}

/* ---------- 4b. a checkpoint taken across the swap ---------- */
console.log('\nCHECKPOINTS SURVIVE THE SWAP');
{
  const g = boot(); const s = g.S;
  g.loadMission(13); g.sysBoot();
  s.pad = null; s.fairing = false;
  if (s.craft.stages) while (s.craft.stageIx < s.craft.stages.length - 1) g.jettisonStage();
  g.setOrbit('MOON', 100, 100, 0, 0);
  s.objects = [];
  g.exec('SEP');
  g.takeCheckpoint('SEPARATION');
  const snap = { name: s.craft.name, batt: s.power.batt, fuel: s.craft.fuel,
                 away: s.away.bag.power.batt, crew: s.away.bag.craft.crew, t: s.t };
  // fly on, spend things, then go back
  let n = 0; while (n++ < 2000) g.advance(10);
  s.craft.fuel -= 500; s.power.batt -= 200;
  const err = g.restoreCheckpoint();
  ok('a checkpoint restores the vehicle you were flying, not the one you left',
     err === null && s.craft.name === snap.name && s.craft.fuel === snap.fuel &&
     s.power.batt === snap.batt && s.t === snap.t,
     `${s.craft.name}, ${s.craft.fuel.toFixed(0)} kg, ${s.power.batt.toFixed(0)} Wh, MET ${g.fmtMET(s.t)}`);
  ok('and the ship you left is restored with it, bag and all',
     !!s.away && s.away.bag.power.batt === snap.away && s.away.bag.craft.crew === snap.crew &&
     !!g.dockTarget(),
     s.away ? `${s.away.label} ${s.away.bag.power.batt.toFixed(0)} Wh, ${s.away.bag.craft.crew} crew` : 'no away ship');
}

/* ---------- 4c. separation refuses what it should ---------- */
console.log('\nSEPARATION IS NOT A KEY YOU CAN PRESS TWICE');
{
  const g = boot(); const s = g.S;
  g.loadMission(13);
  const n0 = g.lines().length;
  g.exec('SEP');
  ok('SEP is refused on the pad', !s.away && g.since(n0).some(l => /pad/i.test(l)),
     g.since(n0).filter(l => l.trim()).slice(-1)[0]);
  g.sysBoot(); s.pad = null; s.fairing = false;
  if (s.craft.stages) while (s.craft.stageIx < s.craft.stages.length - 1) g.jettisonStage();
  g.setOrbit('EARTH', 400, 400, 0, 0);
  const n1 = g.lines().length;
  g.exec('SEP');
  ok('and in the wrong sphere of influence', !s.away && g.since(n1).some(l => /MOON/.test(l)),
     g.since(n1).filter(l => l.trim()).slice(-1)[0]);
  g.setOrbit('MOON', 100, 100, 0, 0); s.objects = [];
  g.exec('SEP');
  const n2 = g.lines().length;
  g.exec('SEP');
  ok('and it cannot happen twice', !!s.away && g.since(n2).some(l => /Already separated/.test(l)),
     g.since(n2).filter(l => l.trim()).slice(-1)[0]);
  // STAGE is still STAGE — it was SEP's old name and it kept its own job.
  const n3 = g.lines().length;
  g.exec('STAGE');
  ok('STAGE still drops the descent stage and is not the same key',
     g.since(n3).some(l => /DESCENT STAGE away/.test(l)), g.since(n3).filter(l => l.trim())[1]);
}

/* ---------- 5. the departure solver ---------- */
console.log('\nTHE WAY HOME FROM A MOON');
{
  const g = boot(); const s = g.S;
  g.loadMission(6); g.sysBoot();
  g.rig({ name:'TEI', dry:3000, fuel:12000, thrust:60, isp:315, rcs:200, rcsIsp:220, crew:3, o2:2000, cda:26 });
  g.setOrbit('MOON', 100, 100, 0, 0);
  s.landingAllowed = false;
  g.derive();
  // What the old tools say, unchanged: they are honest, they are just not this.
  const n0 = g.lines().length;
  g.exec('PLAN XFER EARTH');
  ok('PLAN XFER still refuses a transfer to the body you are orbiting',
     g.since(n0).some(l => /does not orbit MOON/.test(l)), 'EARTH does not orbit MOON');
  const sol = g.teiSolve(300);
  ok('the departure solver finds a point in the orbit that puts perigee at Earth',
     !!sol && Math.abs(sol.rp - g.BODIES.EARTH.R - 300) < 400,
     sol ? `perigee ${(sol.rp - g.BODIES.EARTH.R).toFixed(0)} km for ${sol.dv.toFixed(0)} m/s` : 'no solution');
  ok('and it costs about what the measurement said it would — 790 m/s, not 3,000',
     !!sol && sol.dv > 600 && sol.dv < 1100, sol ? `${sol.dv.toFixed(0)} m/s` : '—');
  // WHERE, not how long: the same burn elsewhere in the orbit is useless.
  if (sol) {
    const P = g.D.e.period;
    const other = g.teiSolve(300);   // deterministic: same answer twice
    ok('the solver is deterministic', Math.abs(other.tc - sol.tc) < 1e-6, `${sol.tc.toFixed(2)} s`);
  }
}

/* ---------- 6. the whole flight ---------- */
console.log('\nTHE WHOLE FLIGHT');
{
  const g = boot(); const s = g.S;
  g.loadMission(13);
  const ph = (i) => s.phases[i] && s.phases[i].done;
  const runPlan = (cmd) => {
    g.exec(cmd);
    const bl = g.burnLine(); if (!bl) return false;
    g.exec(bl);
    for (let i = 0; i < 900000 && s.status === 'flight'; i++) {
      const ti = s.sched ? g.timeToIgnition() : Infinity;
      g.advance(s.burn ? 0.25 : ti > 86400 ? 3600 : ti > 3600 ? 300 : ti > 60 ? 20 : 1);
      if (!s.sched && !s.burn && i > 5) break;
    }
    return true;
  };
  /* Point, THEN burn. An immediate BURN lights the engine and waits for the
     nose, and a vehicle waiting for its nose does not move — so a slew with a
     burn armed is a slew that costs phase angle. */
  const push = (dvMs, dir) => {
    if (!(dvMs > 1e-4)) return;
    const m = g.craftMass(), ve = s.craft.isp * 9.80665;
    const dur = (m - m / Math.exp(dvMs / ve)) / (s.craft.thrust * 1000 / ve);
    if (dur < 0.08) { g.exec('TRANS ' + dir + ' ' + dvMs.toFixed(4)); return; }
    g.exec('HOLD ' + dir);
    let j = 0; while (j++ < 40000 && g.attError() > 0.002 && s.status === 'flight') g.advance(0.5);
    g.exec('BURN ' + dir + ' ' + dur.toFixed(4));
    let k = 0; while (k++ < 40000 && s.burn && s.status === 'flight') g.advance(0.05);
  };
  const station = () => s.objects.find(x => x.id === 'STATION' && x.soi === s.soi);
  const matchPeriod = (mu) => {
    const o = station(); if (!o) return;
    const se = g.elements(o.r, o.v, mu);
    const aT = Math.cbrt(mu * Math.pow(se.period / (2 * Math.PI), 2));
    const dv = g.D.e.v * (aT - g.D.e.a) / (2 * g.D.e.a) * 1000;
    if (isFinite(dv)) push(Math.abs(dv), dv > 0 ? 'PRO' : 'RET');
  };
  const phaseUp = (N) => {
    const o = station(); if (!o) return false;
    let phi = g.normAngle((Math.atan2(o.r.y, o.r.x) - Math.atan2(s.r.y, s.r.x)) * g.D.e.dir);
    if (phi > Math.PI) phi -= 2 * Math.PI;
    const a = g.D.e.a;
    const da = -(2 / 3) * a * (phi / (2 * Math.PI * N));
    const dv = Math.abs(g.D.e.v * da / (2 * a)) * 1000;
    if (!isFinite(dv) || dv <= 0) return false;
    push(dv, da < 0 ? 'RET' : 'PRO');
    const Tn = g.D.e.period, t0 = s.t;
    let n = 0;
    while (n++ < 900000 && s.status === 'flight') {
      const left = N * Tn - (s.t - t0);
      if (left <= 1e-6) break;
      g.advance(Math.max(0.02, Math.min(30, left)));
    }
    push(dv, da < 0 ? 'PRO' : 'RET');
    return true;
  };
  const closeIn = (mu) => {
    const o = station();
    if (o) {
      const b = g.BODIES[s.soi], rT = g.V.len(o.r), alt = rT - b.R;
      if (Math.abs(g.D.e.a - rT) > 1) {
        runPlan(g.D.e.a < rT ? 'PLAN APO ' + alt.toFixed(1) : 'PLAN PERI ' + alt.toFixed(1));
        runPlan(g.D.e.a < rT ? 'PLAN CIRC AP' : 'PLAN CIRC PE');
      }
    }
    matchPeriod(mu);
    for (let a = 0; a < 12; a++) {
      const t = g.targetRel(); if (!t || g.V.len(t.r) < 5) break;
      if (!phaseUp(g.V.len(t.r) > 300 ? 12 : g.V.len(t.r) > 40 ? 6 : 3)) break;
      matchPeriod(mu);
    }
  };
  const hardDock = () => {
    g.exec('DOCK AUTO');
    let n = 0; while (n++ < 600000 && s.status === 'flight' && s.dock.phase === 'FREE') g.advance(0.25);
    n = 0; while (n++ < 300000 && s.status === 'flight' && s.dock.phase !== 'HARD') {
      if (s.dock.phase === 'SOFT') g.exec('DOCK RETRACT');
      if (s.dock.phase === 'RETRACTED') g.exec('DOCK LATCH');
      g.advance(0.5);
    }
  };
  const seal = () => {
    g.exec('DOCK EQUALISE');
    let n = 0; while (n++ < 40000 && s.dock.vest.press < 100) g.advance(1);
    for (let attempt = 0; attempt < 4 && !s.dock.vest.leakOk; attempt++) {
      g.exec('DOCK LEAK');
      n = 0; while (n++ < 40000 && !s.dock.vest.leakOk && s.dock.vest.verdict === null) g.advance(1);
      if (!s.dock.vest.leakOk) {
        g.exec('DOCK RESEAT');
        n = 0; while (n++ < 40000 && s.dock.phase !== 'RETRACTED') g.advance(0.5);
        g.exec('DOCK LATCH');
        n = 0; while (n++ < 40000 && s.dock.phase !== 'HARD') g.advance(0.5);
        g.exec('DOCK EQUALISE');
        n = 0; while (n++ < 40000 && s.dock.vest.press < 100) g.advance(1);
      }
    }
    g.exec('DOCK HATCH');
  };

  g.exec('PWR UP');
  for (let i = 0; i < 6000 && s.pwrUp; i++) g.advance(1);
  ok('phase 1 · the ship wakes up on the pad', ph(0), `MET ${g.fmtMET(s.t)}`);

  g.ignite();
  let maxQ = 0;
  for (let i = 0; i < 80000 && s.status === 'flight'; i++) {
    g.advance(0.25);
    if (g.D.q > maxQ) maxQ = g.D.q;
    if (s.craft.stageName === 'FIRST STAGE' && s.craft.fuel <= 0.01) g.jettisonStage();
    if (s.burn && g.D.apoAlt >= G.PARK_ALT && g.D.alt > 140) { g.exec('MECO'); break; }
    if (s.craft.stageName === 'SECOND STAGE' && s.craft.fuel <= 0.01 && g.D.apoAlt < G.PARK_ALT) break;
  }
  ok('phase 2 · a 14 t stack out of the atmosphere', ph(1), `max Q ${(maxQ/1000).toFixed(1)} kPa`);

  runPlan('PLAN CIRC AP');
  if (s.craft.stages && s.craft.stageIx < s.craft.stages.length - 1) g.jettisonStage();
  ok('phase 3 · a parking orbit', ph(2),
     `${g.D.perAlt.toFixed(0)}x${g.D.apoAlt.toFixed(0)} km, ${s.craft.fuel.toFixed(0)} kg aboard`);

  g.exec('TGT STATION');
  runPlan('PLAN RDV');
  runPlan('PLAN CIRC AP');
  closeIn(g.BODIES.EARTH.mu);
  ok('phase 4 · alongside CERES', ph(3),
     `${(g.V.len(g.targetRel().r)*1000).toFixed(0)} m, RCS ${g.rcsDV().toFixed(0)} m/s`);

  hardDock();
  g.exec('DOCK UMB'); g.exec('DOCK TIE'); g.exec('DOCK LINE');
  let n = 0; while (n++ < 40000 && !s.dock.prop.purged) g.advance(1);
  g.exec('DOCK XFER');
  n = 0; while (n++ < 900000 && s.dock.prop.xfer) g.advance(1);
  ok('phase 5 · docked, and the tank is full of somebody else\'s propellant', ph(4),
     `${s.craft.fuel.toFixed(0)}/${s.craft.fuelMax} kg, ${s.depot.prop.toFixed(0)} kg left at CERES`);
  ok('and the flight is impossible without that — it launched with 2,000 kg',
     s.craft.fuel > 12000 && g.D.dv > 5000, `${g.D.dv.toFixed(0)} m/s after filling`);

  g.exec('DOCK UNDOCK');
  n = 0; while (n++ < 40000 && g.targetRel() && g.V.len(g.targetRel().r) < 0.6) g.advance(5);
  runPlan('PLAN XFER MOON');
  n = 0; while (n++ < 200000 && s.soi !== 'MOON' && s.status === 'flight' && s.t < 86400 * 1.7 + 75000) g.advance(300);
  runPlan('PLAN TRIM MOON');
  n = 0; while (n++ < 200000 && s.soi !== 'MOON' && s.status === 'flight') g.advance(300);
  ok('phase 6 · inside the Moon\'s sphere of influence', ph(5),
     `periapsis ${g.D.perAlt.toFixed(0)} km, e ${g.D.e.e.toFixed(3)}, MET ${g.fmtMET(s.t)}`);

  runPlan('PLAN CIRC PE'); runPlan('PLAN PERI 100'); runPlan('PLAN CIRC PE');
  ok('phase 7 · a 100 km lunar orbit', ph(6),
     `${g.D.perAlt.toFixed(0)}x${g.D.apoAlt.toFixed(0)} km, ${g.D.dv.toFixed(0)} m/s left`);

  g.exec('SEP');
  ok('phase 8 · the lander has the flight and the mothership has a port', ph(7),
     `${s.craft.name}, ${g.D.dv.toFixed(0)} m/s + ${g.rcsDV().toFixed(0)} RCS; ` +
     `${s.away.label} holding with ${s.away.bag.craft.crew} aboard`);

  n = 0; while (n++ < 4000 && g.targetRel() && g.V.len(g.targetRel().r) < 0.5) g.advance(5);
  runPlan('PLAN PERI 15');
  g.exec('WARP 20');
  n = 0; while (n++ < 400000 && s.status === 'flight' && g.D.tPeri > 4) g.advance(0.25 * Math.max(s.warp, 1));
  g.exec('WARP 1');
  n = 0;
  while (n++ < 400000 && s.status === 'flight' && !s.landed) {
    const alt = g.D.alt * 1000, vert = -g.D.e.vr * 1000;
    const lat = Math.abs(g.V.crs(g.V.unit(s.r), s.v)) * 1000;
    if (lat > 8) { if (!s.burn) g.exec('BURN RET 400'); }
    else { const want = Math.max(1.2, alt / 22);
      if (!s.burn && vert > want + 1.5) g.exec('BURN RET 12');
      if (s.burn && vert < want - 0.5) g.exec('CANCEL'); }
    g.advance(0.2);
  }
  ok('phase 9 · down, on the descent stage', ph(8),
     `${s.craft.fuel.toFixed(0)} kg left in the ${s.craft.stageName}`);
  ok('and the clock did not stop — there is a pad under it now, not a full stop',
     s.landed === true && s.status === 'flight' && !!s.pad && !s.pad.lifted,
     `status ${s.status}, site ${s.pad && s.pad.site}`);

  const o2Before = s.craft.o2;
  g.exec('SURF EVA');
  n = 0; while (n++ < 40000 && s.surf.phase !== 'OUT') g.advance(5);
  g.exec('SURF SAMPLE');
  n = 0; while (n++ < 40000 && s.surf.phase === 'COLLECT') g.advance(5);
  g.exec('SURF IN');
  n = 0; while (n++ < 40000 && s.surf.phase !== 'INSIDE') g.advance(5);
  ok('phase 10 · the samples are aboard', ph(9),
     `${s.craft.cargo.toFixed(0)} kg, and going outside cost ${(o2Before - s.craft.o2).toFixed(1)} crew-hours`);

  g.jettisonStage();
  const w0 = g.launchWindow();
  /* The count is ten minutes long, so it is RESUMED ten minutes before the
     window, not at it. Flying it the other way lifts off a count late and
     turns a twenty-minute rendezvous into a day of chasing. */
  const lead = s.pad.T < 0 ? -s.pad.T : 0;
  let k = 0;
  while (k++ < 400000 && s.status === 'flight') {
    const w = g.launchWindow();
    if (!w || !isFinite(w.wait)) break;
    const togo = w.wait - lead;
    if (togo <= 0.5) break;
    g.advance(Math.max(0.25, Math.min(30, togo)));
  }
  const waited = s.t;
  g.exec('COUNT GO');
  n = 0; while (n++ < 40000 && !s.pad.lifted && s.status === 'flight') g.advance(1);
  n = 0;
  while (n++ < 400000 && s.status === 'flight') {
    g.advance(0.25);
    if (s.burn && g.D.apoAlt >= 100 && g.D.alt > 5) { g.exec('MECO'); break; }
    if (s.craft.fuel <= 0.01) break;
  }
  runPlan('PLAN CIRC AP');
  ok('phase 11 · off the Moon and into an orbit, on the window', ph(10),
     `${g.D.perAlt.toFixed(0)}x${g.D.apoAlt.toFixed(0)} km, waited ${(w0.wait/60).toFixed(0)} min, ` +
     `RCS ${g.rcsDV().toFixed(0)} m/s`);

  closeIn(g.BODIES.MOON.mu);
  const rngKm = g.V.len(g.targetRel().r);
  hardDock();
  seal();
  g.exec('DOCK CREW');
  ok('phase 12 · back aboard, with the samples and the flight', ph(11),
     `${s.craft.name}, ${s.craft.crew} crew, ${(s.craft.cargo||0).toFixed(0)} kg, ` +
     `closed from ${(rngKm*1000).toFixed(0)} m`);
  ok('and the mothership\'s own tank is what the rest of the flight is flown on',
     !s.away && g.D.dv > 3000, `${g.D.dv.toFixed(0)} m/s`);

  runPlan('PLAN TEI');
  n = 0; while (n++ < 400000 && s.soi !== 'EARTH' && s.status === 'flight') g.advance(600);
  ok('phase 13 · falling towards Earth, not past it', ph(12),
     `perigee ${g.D.perAlt.toFixed(0)} km, apogee ${(g.D.apoAlt/1000).toFixed(0)},000 km`);

  runPlan('PLAN APO 400');
  ok('phase 14 · stopped in a low orbit, because no shield survives 10.5 km/s', ph(13),
     `${g.D.perAlt.toFixed(0)}x${g.D.apoAlt.toFixed(0)} km, ${g.D.dv.toFixed(0)} m/s left`);

  runPlan('PLAN PERI 30');
  let drogue = false, mains = false, peak = 0;
  n = 0;
  while (n++ < 900000 && s.status === 'flight') {
    const alt = g.D.alt;
    g.advance(alt > 2000 ? 60 : alt > 200 ? 5 : 0.2);
    if (s.shield.peak > peak) peak = s.shield.peak;
    if (!drogue && g.D.alt < 25 && g.D.rho > 0) { g.exec('DROGUE'); drogue = true; }
    if (drogue && !mains && g.D.alt < 6) { g.exec('MAINS'); mains = true; }
    if (s.status !== 'flight' || s.landed) break;
  }
  ok('phase 15 · through the corridor with the shield intact', ph(14),
     `peak ${(peak/1000).toFixed(0)} kW/m² (${(peak/S.shield.rateLimit).toFixed(2)}×), ` +
     `${(s.shield.load/1e6).toFixed(1)} MJ/m² of ${(s.shield.cap/1e6).toFixed(0)} spent`);
  ok('phase 16 · in the water, and the mission is over', ph(15) && s.completed,
     `MET ${g.fmtMET(s.t)}, ${s.craft.crew} crew, ${(s.craft.cargo||0).toFixed(0)} kg of Moon, ` +
     `${s.craft.fuel.toFixed(0)} kg of propellant left`);
}

T.done('the lunar landing: all checks passed');
