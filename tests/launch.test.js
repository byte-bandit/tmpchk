/* Launch: atmosphere, drag, max Q, staging, throttle, the pad and the way down.
 *
 * The load-bearing test in here is the first one. Drag is a force added to a
 * simulation that nine missions were flown and tuned in, so the suite starts by
 * proving those flights are untouched — not by argument, but by flying them in
 * the copy of the page that predates the atmosphere and comparing the state
 * vectors. Everything else is only worth having if that holds.
 */
const { boot, suite } = require('./harness');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const G = boot();
const { exec, loadMission, advance, derive, V, BODIES, craftMass, burnLine,
        airDensity, airPressure, dynPressure, inAtmosphere, jettisonStage,
        ignite, curThrust, curIsp, pitchCommand, PITCH_DEFAULT, Q_BREAK,
        PARK_ALT, setOrbit, rcsDV, elements } = G;
const S = G.S;
const out = G.lines;
const T = suite('LAUNCH');
const ok = (n, c, x) => T.ok(n, c, x);
const alt = () => V.len(S.r) - BODIES[S.soi].R;
const tail = (n = 1) => out().slice(-n).join(' | ');

/* ---------- 1. the shipped missions did not move ---------- */
console.log('\nNO PERTURBATION');

/** The last published page, before any of this existed. */
let BASE = null;
try {
  const p = path.join(os.tmpdir(), 'tmpchk-baseline-index.html');
  fs.writeFileSync(p, execSync('git show d68ff61:index.html', { encoding: 'utf8', maxBuffer: 64e6 }));
  BASE = p;
} catch (e) { /* no git, no baseline — the A/B checks below say so */ }

/** Fly a mission open-loop in one page and return where it ended up. */
function flyIn(file, id, seconds, warp) {
  const g = file ? boot(file) : boot();
  g.loadMission(id);
  g.exec('WARP ' + warp);
  let left = seconds;
  while (left > 0 && g.S.status === 'flight') { const dt = Math.min(warp, left); g.advance(dt); left -= dt; }
  return { r: { ...g.S.r }, v: { ...g.S.v }, t: g.S.t, soi: g.S.soi, m: g.craftMass() };
}

/** Fly M-01 the way the mission is meant to be flown: circularise at apoapsis. */
function flyM01(file) {
  const g = file ? boot(file) : boot();
  g.loadMission(1);
  g.exec('PLAN CIRC AP');
  g.exec(g.burnLine());
  g.exec('WARP 20');
  for (let i = 0; i < 4000 && g.S.status === 'flight' && (g.S.sched || g.S.burn); i++) g.advance(20);
  return { r: { ...g.S.r }, v: { ...g.S.v }, t: g.S.t, m: g.craftMass(), done: !!g.S.completed,
           pe: g.D.perAlt, ap: g.D.apoAlt };
}

if (BASE) {
  for (const [id, secs, warp] of [[2, 3600, 10], [5, 86400, 60], [8, 864000, 600]]) {
    const a = flyIn(BASE, id, secs, warp), b = flyIn(null, id, secs, warp);
    const dr = Math.hypot(a.r.x - b.r.x, a.r.y - b.r.y);
    const dv = Math.hypot(a.v.x - b.v.x, a.v.y - b.v.y);
    ok(`M-0${id} flies identically to the page before the atmosphere`,
       dr === 0 && dv === 0 && a.m === b.m,
       dr === 0 && dv === 0 ? 'bit-for-bit' : `${(dr*1000).toFixed(6)} m, ${(dv*1000).toFixed(9)} m/s`);
  }
  // M-01 is the one mission that starts with its periapsis underground, so it
  // has to be flown rather than left alone: coast, circularise, compare.
  const a1 = flyM01(BASE), b1 = flyM01(null);
  const dr1 = Math.hypot(a1.r.x - b1.r.x, a1.r.y - b1.r.y);
  const dv1 = Math.hypot(a1.v.x - b1.v.x, a1.v.y - b1.v.y);
  // This one is NOT bit-for-bit any more, and that is a deliberate correction
  // rather than a leak. A vehicle told to burn before it has finished pointing
  // used to stop dead in space for the whole slew — 46 s and 358 km of a low
  // orbit — while the clock and every other object kept running. It now coasts
  // through the turn, as it always should have. M-01 circularises with a burn
  // commanded off-attitude, so its arc moves by a few kilometres.
  //
  // The guard is still real: the flights that do NOT burn off-attitude above
  // are all still bit-for-bit, so a genuine perturbation would still show.
  ok('M-01 flown as briefed moves only by the slew-coast correction, and completes',
     a1.done === b1.done && dr1 < 20 && dv1 < 0.02,
     `${dr1.toFixed(3)} km, ${(dv1*1000).toFixed(3)} m/s apart, ${b1.pe.toFixed(1)}×${b1.ap.toFixed(1)} km`);
  ok('and it still completes', b1.done && a1.done);

  // The deliberate change: left alone, M-01 now has air to fall into. The
  // briefing has always said this vehicle comes straight back down; before the
  // atmosphere it did that through vacuum, and now the air gets it first.
  const aL = flyIn(BASE, 1, 3600, 10), bL = flyIn(null, 1, 3600, 10);
  const drL = Math.hypot(aL.r.x - bL.r.x, aL.r.y - bL.r.y);
  ok('but an abandoned M-01 now meets the air on the way down', drL > 0,
     `${drL.toFixed(0)} km apart after an hour of doing nothing`);
} else {
  ok('baseline page available for an A/B comparison', false, 'git show failed');
}

/* ---------- 2. the atmosphere is bounded ---------- */
console.log('\nATMOSPHERE');
const E = BODIES.EARTH;
ok('sea level density is 1.225 kg/m³', Math.abs(airDensity(E, 0) - 1.225) < 1e-9, airDensity(E, 0).toFixed(4));
ok('one scale height up is 1/e of it', Math.abs(airDensity(E, E.hScale) / 1.225 - Math.exp(-1)) < 1e-9,
   (airDensity(E, E.hScale) / 1.225).toFixed(6));
ok('density is exactly zero at the interface', airDensity(E, E.atmo) === 0, `${E.atmo} km`);
ok('and everywhere above it', airDensity(E, E.atmo + 1e-9) === 0 && airDensity(E, 200) === 0 && airDensity(E, 400) === 0);
ok('the interface is far below every orbit the game flies', E.atmo === 140);
ok('ambient pressure vanishes with it', airPressure(E, E.atmo) === 0 && Math.abs(airPressure(E, 0) - 1) < 1e-12);
ok('airless bodies have no atmosphere at any altitude',
   airDensity(BODIES.MOON, 0) === 0 && airDensity(BODIES.MOON, -5) === 0);
ok('Venus is thick and Mars is thin, as they are',
   BODIES.VENUS.rho0 > 50 && BODIES.MARS.rho0 < 0.03,
   `Venus ${BODIES.VENUS.rho0} vs Mars ${BODIES.MARS.rho0} kg/m³`);

// The one flight that goes anywhere near another atmosphere.
loadMission(8);
let lowMars = Infinity;
exec('WARP 600');
for (let i = 0; i < 2000 && S.status === 'flight'; i++) {
  advance(600);
  if (S.soi === 'MARS') lowMars = Math.min(lowMars, alt());
}
ok('M-08 never reaches the Martian atmosphere', !(lowMars < BODIES.MARS.atmo),
   lowMars === Infinity ? 'no Mars SOI in this window' : `${lowMars.toFixed(0)} km vs ${BODIES.MARS.atmo} km line`);

/* ---------- 3. on the pad ---------- */
console.log('\nTHE PAD');
loadMission(10);
ok('M-00 starts on a pad', !!S.pad && !S.pad.lifted, S.pad && S.pad.site);
ok('at zero altitude and not falling', Math.abs(alt()) < 1e-6, alt().toFixed(9) + ' km');
ok('carried by the planet at its rotation speed', Math.abs(V.len(S.v) * 1000 - 465) < 2,
   (V.len(S.v) * 1000).toFixed(1) + ' m/s');
ok('the air is still around it, so dynamic pressure is nil', dynPressure() < 1,
   dynPressure().toFixed(3) + ' Pa');
ok('the count is holding', S.pad.hold === true || S.pad.T < 0, 'T' + S.pad.T.toFixed(0));
// M-00 is a lesson in ascent, not in switchology, so it stands on the pad with
// its systems already up. Free flight is the one that starts dark.
ok('M-00 stands on the pad with its systems up', G.SYSIDS.every(id => !G.sysFitted(id) || G.sysOn(id)));
{ const g = boot(); g.loadMission(0);
  ok('free flight is the cold and dark one', !!g.S.pad && g.SYSIDS.every(id => !g.sysFitted(id) || !g.sysOn(id)));
  ok('and a dark vehicle refuses to light', typeof g.ignite() === 'string', g.ignite()); }

const tLift = S.t;
ok('a warm vehicle lights', ignite() === null);
ok('and the pad releases it', S.pad.lifted === true);
// The bug this suite exists to keep fixed: at the instant of ignition the
// vehicle is still at zero altitude, moving at 465 m/s. Without a clearance
// gate the impact check reads that as a crash into the ground it is standing on.
advance(1); advance(1);
ok('clearing the tower is not a crash', S.status === 'flight', S.status + ' at ' + alt().toFixed(3) + ' km');
ok('and it is climbing', alt() > 0, alt().toFixed(3) + ' km after ' + (S.t - tLift).toFixed(0) + ' s');

/* ---------- 4. the ascent ---------- */
console.log('\nASCENT');
let maxQ = 0, maxQalt = 0, staged = null, dvIdeal = 0;
let meco = null;
for (let i = 0; i < 1400 && S.status === 'flight'; i++) {
  const th = curThrust() * 1000, m = craftMass();
  advance(1);
  dvIdeal += th / m;
  const D = G.D;
  if (D.q > maxQ) { maxQ = D.q; maxQalt = alt(); }
  if (staged === null && S.craft.stageName === 'FIRST STAGE' && S.craft.fuel <= 0.01) {
    jettisonStage(); staged = S.t;
  }
  if (meco === null && S.burn && D.apoAlt >= PARK_ALT && alt() > 100) { exec('MECO'); meco = S.t; break; }
}
ok('dynamic pressure builds and peaks inside the atmosphere', maxQ > 20000 && maxQalt > 5 && maxQalt < 25,
   `${(maxQ/1000).toFixed(1)} kPa at ${maxQalt.toFixed(1)} km`);
ok('the filed program stays under the design limit', maxQ < S.craft.qMax || maxQ < 40000,
   `${(maxQ/1000).toFixed(1)} kPa against 40 kPa`);
ok('the first stage separates', staged !== null && S.craft.stageName === 'SECOND STAGE',
   staged !== null ? `at T+${staged.toFixed(0)} s` : 'never');
ok('and shedding it costs real mass', craftMass() < 200000, craftMass().toFixed(0) + ' kg');
ok('MECO comes at the parking apoapsis', meco !== null && Math.abs(G.D.apoAlt - PARK_ALT) < 2,
   `apo ${G.D.apoAlt.toFixed(1)} km at T+${meco ? meco.toFixed(0) : '—'} s`);
ok('on a ballistic arc, not an orbit', G.D.perAlt < 0, `periapsis ${G.D.perAlt.toFixed(0)} km`);
const gained = V.len(S.v) * 1000 - 465;
const losses = dvIdeal - gained;
ok('the ascent pays a real gravity and drag bill', losses > 1200 && losses < 2200,
   `${losses.toFixed(0)} m/s of ${dvIdeal.toFixed(0)} spent`);
ok('the planet handed over its 465 m/s', dvIdeal > gained, `${gained.toFixed(0)} m/s of inertial speed bought`);

/* ---------- 5. and into orbit ---------- */
exec('PLAN CIRC AP');
const bl = burnLine();
ok('the circularisation is plannable from the arc', !!bl, bl || tail(1).slice(0, 70));
exec(bl);
for (let i = 0; i < 60000 && S.status === 'flight'; i++) {
  exec(S.sched && G.timeToIgnition() > 300 ? 'WARP 50' : 'WARP 1');
  advance(1);
  if (!S.sched && !S.burn && i > 50) break;
}
ok('the launch reaches a circular parking orbit', G.D.e.e < 0.01 && G.D.perAlt > 150,
   `${G.D.perAlt.toFixed(1)}×${G.D.apoAlt.toFixed(1)} km, e=${G.D.e.e.toFixed(4)}`);
ok('and the mission completes', !!S.completed, tail(1).slice(0, 60));
ok('above the atmosphere, where drag is exactly nothing', !inAtmosphere() && G.D.q === 0);

/* ---------- 6. max Q is a limit, not a caution ---------- */
console.log('\nSTRUCTURAL LIMIT');
loadMission(10); exec('PWR UP');
for (let i = 0; i < 1200 && S.pwrUp; i++) advance(1);
// Flatten the turn: pitching over early keeps the vehicle low and lets it build
// speed in thick air, which is exactly what the limit is there to catch. Flying
// straight up does the opposite — it leaves the atmosphere before q can build.
S.pad.program = [[0, 90], [1.5, 35], [8, 20], [200, 15]];
ignite();
let broke = false, qPeak = 0;
for (let i = 0; i < 400 && S.status === 'flight'; i++) {
  advance(1);
  qPeak = Math.max(qPeak, G.D.q);
  if (S.craft.stageName === 'FIRST STAGE' && S.craft.fuel <= 0.01) jettisonStage();
  if (S.status !== 'flight') { broke = true; break; }
}
ok('a vertical ascent overruns the design limit', qPeak > 40000, `${(qPeak/1000).toFixed(1)} kPa`);
ok('and past the margin the vehicle comes apart', S.status === 'lost' && /structural/i.test(tail(2)),
   S.status + ' — ' + (tail(2).match(/structural failure at [\d.]+ kPa/) || ['no break-up'])[0]);
ok('the break-up margin is the stated one', Q_BREAK === 1.4, String(Q_BREAK));

/* ---------- 7. throttle ---------- */
console.log('\nTHROTTLE');
loadMission(2);
const fullT = curThrust(), fullI = curIsp();
ok('throttle defaults to full', S.throttle === 1, String(S.throttle));
exec('THR 50');
ok('half throttle is half the thrust', Math.abs(curThrust() - fullT * 0.5) < 1e-9,
   `${curThrust().toFixed(2)} of ${fullT.toFixed(2)} kN`);
ok('and does not change specific impulse', Math.abs(curIsp() - fullI) < 1e-9, curIsp().toFixed(1) + ' s');
exec('THR 100');
ok('and it goes back exactly', curThrust() === fullT, curThrust().toFixed(6) + ' kN');
ok('a vacuum craft is untouched by back-pressure', curThrust() === S.craft.thrust * S.throttle);

/* ---------- 8. staging ---------- */
console.log('\nSTAGING');
loadMission(10);
ok('the stack is two stages under the spacecraft', S.craft.stages.length === 3,
   S.craft.stages.map(s => s.name).join(' / '));
const shipName = S.craft.stages[2].name;
ok('the spacecraft is the last stage of its own stack',
   S.craft.stages[2].spacecraft === true && shipName === 'AURIGA-0', shipName);
ok('the first stage loses Isp to sea-level back-pressure', S.craft.ispSL < S.craft.isp,
   `${S.craft.ispSL} s at the pad vs ${S.craft.isp} s in vacuum`);
const mFull = craftMass();
jettisonStage();
ok('dropping a stage drops its mass', craftMass() < mFull * 0.3,
   `${mFull.toFixed(0)} → ${craftMass().toFixed(0)} kg`);
jettisonStage();
ok('and the last drop hands back the spacecraft with full tanks',
   S.craft.stageName === shipName && S.craft.fuel === S.craft.fuelMax,
   `${shipName}, ${S.craft.fuel.toFixed(0)} kg, ${rcsDV().toFixed(0)} m/s RCS`);
ok('there is nothing under it to drop', typeof jettisonStage() === 'string', jettisonStage());
ok('a vehicle with no stack never touches any of it', (loadMission(1), S.craft.stages) == null);

/* ---------- 9. the way down ---------- */
console.log('\nREENTRY');
loadMission(0);
// Put it where an ascent leaves it, then aim the periapsis deep into the air.
while (jettisonStage() === null) ;
S.pad = null; S.fairing = false;     // the ascent throws it away at 140 km
setOrbit('EARTH', 40, 300, 180, 0);
derive();
ok('a periapsis inside the atmosphere is a decaying orbit', G.D.perAlt < BODIES.EARTH.atmo,
   `${G.D.perAlt.toFixed(0)} km periapsis`);
let vTop = V.len(S.v) * 1000, hullPeak = S.therm.hull;
exec('WARP 10');
for (let i = 0; i < 40000 && S.status === 'flight'; i++) {
  advance(10);
  hullPeak = Math.max(hullPeak, S.therm.hull);
}
ok('the air takes the orbital speed out of it', S.status !== 'flight',
   `${(vTop/1000).toFixed(2)} km/s on entry, ${S.status}`);
ok('and it ends on the ground, not in orbit',
   /surface impact|thermal failure|structural/i.test(tail(3)),
   (tail(3).match(/(thermal failure|structural failure|surface impact)[^|]*/i) || ['still flying'])[0].slice(0, 58));

// A steep entry is the one that burns: straight down from a high arc gives the
// hull no time to shed the heat it is picking up.
loadMission(0);
while (jettisonStage() === null) ;
S.pad = null; S.fairing = false;
setOrbit('EARTH', -2000, 400, 179, 0);
derive();
const hull0 = S.therm.hull;
exec('WARP 5');
for (let i = 0; i < 40000 && S.status === 'flight'; i++) advance(5);
ok('a steep entry heats the hull hard', S.therm.hull > hull0 + 100 || /thermal/i.test(tail(3)),
   `${hull0.toFixed(0)} → ${S.therm.hull.toFixed(0)} °C, limit ${S.thermLimit || 800}`);
ok('and that is survivable only if you are shallow enough', S.status !== 'flight',
   (tail(3).match(/(thermal failure|surface impact)[^|]*/i) || ['still flying'])[0].slice(0, 58));

T.done();
