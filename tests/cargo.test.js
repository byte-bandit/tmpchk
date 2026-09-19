/* Item 04 — cargo, the entry corridor, the canopies, ordered phases,
 * checkpoints, and M-10 flown from a dark pad to a splashdown.
 *
 * The load-bearing test is the first one, as it was for the atmosphere: cargo
 * is mass added to every formula that already weighed the vehicle, so the
 * suite starts by proving that a vehicle carrying none flies bit-for-bit as it
 * did in the page that predates all of this. Everything after it is only worth
 * having if that holds.
 */
const { boot, suite } = require('./harness');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const G = boot();
const { exec, loadMission, advance, V, BODIES, craftMass, burnLine, setOrbit,
        CHUTES, deployChute, chuteArea, CARGO_BAND, CARGO_RATE, airRelative,
        curPhase, lastCheckpoint, freshShield, freshChutes, rig, targetRel,
        SHIELD_LOAD, SHIELD_RATE, PARK_ALT } = G;
const S = G.S;
const T = suite('CARGO, ENTRY & PHASES');
const ok = (n, c, x) => T.ok(n, c, x);
const tail = (n = 1) => G.lines().filter(l => l.trim()).slice(-n).join(' | ');

/* ---------- 1. the shipped missions did not move ---------- */
console.log('\nNO PERTURBATION');

let BASE = null;
try {
  const p = path.join(os.tmpdir(), 'tmpchk-item04-baseline.html');
  fs.writeFileSync(p, execSync('git show fa7742d:index.html', { encoding: 'utf8', maxBuffer: 64e6 }));
  BASE = p;
} catch (e) { /* no git, no baseline — the A/B checks below say so */ }

function flyIn(file, id, seconds, warp) {
  const g = file ? boot(file) : boot();
  g.loadMission(id);
  g.exec('WARP ' + warp);
  let left = seconds;
  while (left > 0 && g.S.status === 'flight') { const dt = Math.min(warp, left); g.advance(dt); left -= dt; }
  return { r: { ...g.S.r }, v: { ...g.S.v }, t: g.S.t, soi: g.S.soi, m: g.craftMass() };
}

if (BASE) {
  for (const [id, secs, warp] of [[2, 3600, 10], [5, 86400, 60], [8, 864000, 600], [3, 7200, 10]]) {
    const a = flyIn(BASE, id, secs, warp), b = flyIn(null, id, secs, warp);
    const dr = Math.hypot(a.r.x - b.r.x, a.r.y - b.r.y);
    const dv = Math.hypot(a.v.x - b.v.x, a.v.y - b.v.y);
    ok(`M-0${id} flies identically to the page before cargo existed`,
       dr === 0 && dv === 0 && a.m === b.m,
       dr === 0 && dv === 0 ? 'bit-for-bit' : `${(dr*1000).toFixed(6)} m, ${(dv*1000).toFixed(9)} m/s`);
  }
  // The lunar landing is the one the landing-frame change puts at risk: the
  // Moon's surface moves at 4.62 m/s, so judging touchdown against the ground
  // there would make M-06 unflyable. It is judged against the stars, as it
  // always was, because the Moon has no air.
  const fly6 = (file) => {
    const g = file ? boot(file) : boot();
    g.loadMission(6);
    g.exec('PLAN PERI 15'); g.exec(g.burnLine()); g.exec('WARP 50');
    let n = 0; while (n++ < 400000 && g.S.status === 'flight' && (g.S.sched || g.S.burn)) g.advance(0.25 * Math.max(g.S.warp, 1));
    g.exec('WARP 20');
    n = 0; while (n++ < 400000 && g.S.status === 'flight' && g.D.tPeri > 4) g.advance(0.25 * Math.max(g.S.warp, 1));
    g.exec('WARP 1');
    n = 0;
    while (n++ < 300000 && g.S.status === 'flight') {
      const alt = g.D.alt * 1000, vert = -g.D.e.vr * 1000;
      const lat = Math.abs(g.V.crs(g.V.unit(g.S.r), g.S.v)) * 1000;
      if (lat > 8) { if (!g.S.burn) g.exec('BURN RET 400'); }
      else { const want = Math.max(1.2, alt / 22);
        if (!g.S.burn && vert > want + 1.5) g.exec('BURN RET 12');
        if (g.S.burn && vert < want - 0.5) g.exec('CANCEL'); }
      g.advance(0.2);
    }
    return { status: g.S.status, r: { ...g.S.r }, t: g.S.t, fuel: g.S.craft.fuel, done: !!g.S.completed };
  };
  const a6 = fly6(BASE), b6 = fly6(null);
  // Not bit-for-bit any more, deliberately: a vehicle commanded to burn before
  // it has finished pointing used to freeze in space for the whole slew, and
  // now coasts through it. M-06's descent is flown with exactly those commands,
  // so it lands about three seconds later on a few more kilograms. It still
  // lands, which is what the mission is, and the missions above that do not
  // burn off-attitude are still bit-for-bit.
  ok('M-06 still lands on the Moon, moved only by the slew-coast correction',
     b6.status === 'landed' && a6.status === b6.status &&
     Math.abs(a6.t - b6.t) < 30 && Math.abs(a6.fuel - b6.fuel) < 50 && a6.done === b6.done,
     `${b6.status} at MET ${G.fmtMET(b6.t)} on ${b6.fuel.toFixed(1)} kg `
     + `(was ${G.fmtMET(a6.t)} on ${a6.fuel.toFixed(1)} kg)`);
} else {
  ok('baseline page available for an A/B comparison', false, 'git show failed');
}

/* ---------- 2. cargo is mass ---------- */
console.log('\nCARGO IS MASS');
loadMission(1);
const m0 = craftMass(), dv0 = G.dvRemaining();
ok('a vehicle with no manifest carries no cargo and no capacity',
   S.craft.cargo === 0 && S.craft.cargoMax === 0, `${S.craft.cargo} / ${S.craft.cargoMax} kg`);
S.craft.cargo = 500;
ok('cargo counts in the all-up mass', craftMass() === m0 + 500, `${m0.toFixed(0)} → ${craftMass().toFixed(0)} kg`);
ok('and a loaded ship has less ΔV in the same tank', G.dvRemaining() < dv0,
   `${dv0.toFixed(0)} → ${G.dvRemaining().toFixed(0)} m/s`);
S.craft.cargo = 0;
ok('and taking it off puts the number back exactly', craftMass() === m0 && G.dvRemaining() === dv0);

// The trajectory has to feel it, not just the readout. Two ways it must:
// the solver has to plan a LONGER burn for the same orbit, and the same burn
// flown open-loop has to land somewhere else.
function circWith(cargo) {
  const g = boot(); g.loadMission(1); g.S.craft.cargo = cargo;
  g.exec('PLAN CIRC AP');
  const secs = g.S.solution.secs;
  g.exec(g.burnLine()); g.exec('WARP 20');
  for (let i = 0; i < 4000 && g.S.status === 'flight' && (g.S.sched || g.S.burn); i++) g.advance(20);
  return { secs, pe: g.D.perAlt, ap: g.D.apoAlt, used: g.S.craft.fuelMax - g.S.craft.fuel };
}
const light = circWith(0), heavy = circWith(500);
ok('the solver plans a longer burn for the same orbit when the hold is full',
   heavy.secs > light.secs + 1,
   `${light.secs.toFixed(1)} s empty vs ${heavy.secs.toFixed(1)} s with 500 kg`);
ok('and it costs real propellant to carry it', heavy.used > light.used + 1,
   `${light.used.toFixed(1)} kg empty vs ${heavy.used.toFixed(1)} kg with 500 kg — ` +
   `${(heavy.used - light.used).toFixed(1)} kg to move 500 kg`);
function openLoop(cargo) {
  const g = boot(); g.loadMission(1); g.S.craft.cargo = cargo;
  g.exec('WARP 20');
  for (let i = 0; i < 200 && g.S.status === 'flight'; i++) g.advance(20);
  g.exec('BURN PRO 60'); g.exec('WARP 1');
  for (let i = 0; i < 4000 && g.S.status === 'flight' && g.S.burn; i++) g.advance(1);
  return { pe: g.D.perAlt, ap: g.D.apoAlt };
}
const lo2 = openLoop(0), hv2 = openLoop(500);
ok('the same 60 s burn on a heavier ship reaches a different orbit',
   Math.abs(hv2.ap - lo2.ap) > 1 || Math.abs(hv2.pe - lo2.pe) > 1,
   `${lo2.pe.toFixed(1)}×${lo2.ap.toFixed(1)} km empty vs ${hv2.pe.toFixed(1)}×${hv2.ap.toFixed(1)} km with 500 kg`);

/* ---------- 3. cargo moves across a hard dock ---------- */
console.log('\nCARGO ACROSS THE HATCH');
loadMission(11);
ok('M-10 lifts off with the delivery aboard', S.craft.cargo === 1800 && S.manifest.deliver === 1800,
   `${S.craft.cargo} kg of ${S.craft.cargoMax} kg capacity`);
exec('DOCK UNLOAD');
ok('and nothing moves without a hard dock', /Hard dock required/.test(tail()), tail().slice(0, 40));
// stand it up in a hard dock with the hatch open, the way the flight gets there
S.dock.phase = 'HARD'; S.dock.vest.leakOk = true; S.dock.vest.hatch = true;
const massBefore = craftMass();
exec('DOCK UNLOAD');
ok('with the hatch open the delivery starts', S.dock.cargo.moving === 'OUT', tail().slice(0, 44));
for (let i = 0; i < 2000 && S.dock.cargo.moving; i++) advance(1);
ok('the whole manifest comes off', Math.abs(S.dock.cargo.out - 1800) < 0.01 && S.craft.cargo < 0.01,
   `${S.dock.cargo.out.toFixed(1)} kg off, ${S.craft.cargo.toFixed(2)} kg left aboard`);
ok('and the vehicle is lighter by exactly that', Math.abs((massBefore - craftMass()) - 1800) < 0.01,
   `${massBefore.toFixed(0)} → ${craftMass().toFixed(0)} kg`);
ok('at the stated rate', Math.abs(1800 / CARGO_RATE - 450) < 1, `${CARGO_RATE} kg/s`);
exec('DOCK LOAD');
for (let i = 0; i < 2000 && S.dock.cargo.moving; i++) advance(1);
ok('the return load comes aboard', Math.abs(S.craft.cargo - 1200) < 0.01, `${S.craft.cargo.toFixed(1)} kg`);
ok('and the manifest is then complete', S.dock.cargo.done === true, tail().slice(0, 40));
ok('the hold never takes more than it holds', S.craft.cargo <= S.craft.cargoMax,
   `${S.craft.cargo.toFixed(0)} / ${S.craft.cargoMax} kg`);
// closing the hatch mid-transfer stops it, as the air duct is stopped
S.dock.cargo = { moving:null, out:0, in:0, done:false };
S.craft.cargo = 500; S.manifest = { deliver: 500, collect: 0 };
exec('DOCK UNLOAD');
S.dock.vest.hatch = false;
advance(1);
ok('closing the hatch stops the transfer', S.dock.cargo.moving === null && /hatch closed/.test(tail()),
   tail().slice(0, 44));

/* ---------- 4. the entry corridor ---------- */
console.log('\nTHE CORRIDOR');
ok('the shield carries a budget and a rate, not a hull temperature',
   SHIELD_LOAD === 90e6 && SHIELD_RATE === 420e3,
   `${(SHIELD_LOAD/1e6).toFixed(0)} MJ/m² and ${(SHIELD_RATE/1000).toFixed(0)} kW/m²`);

/** Put AURIGA-10 in the state it comes home in and fly it down. */
function comeHome(peri, opts = {}) {
  const g = boot(); g.loadMission(11);
  g.S.pad = null; g.S.fairing = false;
  g.rig({ name:'AURIGA-10', dry:2400, fuel: opts.fuel != null ? opts.fuel : 1371,
          thrust:28, isp:311, rcs:110, rcsIsp:220, crew:2, o2:870,
          cargo:1200, cargoMax:2200, cda:26 });
  g.S.shield = g.freshShield(); g.S.shield.fitted = true;
  g.S.chute = g.freshChutes(); g.S.landingAllowed = true;
  g.S.phases = null; g.S.objectives = [];
  g.setOrbit('EARTH', peri, 400, 180, 0);
  g.derive();
  const dro = opts.drogue === undefined ? 25 : opts.drogue;
  const mai = opts.main === undefined ? 6 : opts.main;
  let passes = 0, inside = false, lastVV = 0, lastHV = 0, lastInertialHV = 0;
  for (let n = 0; n < 8000000 && g.S.status === 'flight'; n++) {
    g.advance(0.25);
    const D = g.D;
    if (D.alt < 1 && D.alt > 0 && g.S.status === 'flight') {
      // A landing zeroes the velocity, so the arrival speed has to be caught
      // on the way in rather than read off the wreck.
      const a2 = g.airRelative(g.S.r, g.S.v, g.BODIES.EARTH);
      lastVV = Math.abs(g.V.dot(a2, g.V.unit(g.S.r))) * 1000;
      lastHV = Math.abs(g.V.crs(g.V.unit(g.S.r), a2)) * 1000;
      lastInertialHV = Math.abs(g.V.crs(g.V.unit(g.S.r), g.S.v)) * 1000;
    }
    if (D.alt < 140) { if (!inside) { inside = true; passes++; } } else if (inside) inside = false;
    if (dro != null && D.alt <= dro && g.S.chute.DROGUE.state === 'STOWED') g.deployChute('DROGUE');
    if (mai != null && D.alt <= mai && g.S.chute.MAIN.state === 'STOWED') g.deployChute('MAIN');
    if (g.S.t > 400000) break;
  }
  return { status: g.S.status, passes, peak: g.S.shield.peak, load: g.S.shield.load,
           gone: g.S.shield.gone, mass: g.craftMass(),
           left: 100 - g.S.shield.load / g.S.shield.cap * 100,
           drogue: g.S.chute.DROGUE.state, main: g.S.chute.MAIN.state,
           vv: lastVV, hv: lastHV, inertialHV: lastInertialHV,
           why: (g.lines().filter(l => /VEHICLE LOST|SPLASHDOWN/.test(l)).pop() || '').slice(0, 78) };
}

const mid = comeHome((CARGO_BAND[0] + CARGO_BAND[1]) / 2);
ok('aiming at the middle of the published corridor brings it home',
   mid.status === 'landed',
   `peak ${(mid.peak/1000).toFixed(0)} kW/m², ${(mid.load/1e6).toFixed(1)} MJ/m² spent, ${mid.left.toFixed(0)}% shield left`);
const lo = comeHome(CARGO_BAND[0]), hi = comeHome(CARGO_BAND[1]);
ok('and so does either published edge of it', lo.status === 'landed' && hi.status === 'landed',
   `${CARGO_BAND[0]} km: peak ${(lo.peak/1000).toFixed(0)} kW/m², ${lo.left.toFixed(0)}% left  ·  ` +
   `${CARGO_BAND[1]} km: peak ${(hi.peak/1000).toFixed(0)} kW/m², ${hi.left.toFixed(0)}% left`);
ok('the published corridor sits inside the rate limit with margin at both edges',
   lo.peak < SHIELD_RATE && hi.peak < SHIELD_RATE && lo.peak / SHIELD_RATE < 0.98,
   `${(lo.peak/SHIELD_RATE*100).toFixed(0)}% of the limit at the steep edge`);

const steep = comeHome(-160);
ok('TOO STEEP is lost, and lost to the heating rate',
   steep.status === 'lost' && /heat shield failed/.test(steep.why),
   `${(steep.peak/1000).toFixed(0)} kW/m² — ${steep.why.replace('VEHICLE LOST — ', '').slice(0, 52)}`);
ok('and it is the rate that binds there, not the budget',
   steep.load < SHIELD_LOAD, `${(steep.load/1e6).toFixed(1)} of ${(SHIELD_LOAD/1e6).toFixed(0)} MJ/m² spent`);

const shallow = comeHome(125);
ok('TOO SHALLOW skims, comes round again, and spends the shield every lap',
   shallow.passes > 1 && shallow.gone,
   `${shallow.passes} passes through the air, ${(shallow.load/1e6).toFixed(1)} MJ/m² absorbed`);
ok('and once the shield is through, the hull is what is left',
   shallow.status === 'lost' && /thermal failure/.test(shallow.why),
   shallow.why.replace('VEHICLE LOST — ', '').slice(0, 56));
ok('a shallow pass never throws the vehicle onto a HIGHER orbit — drag only takes',
   true, 'apoapsis falls monotonically; checked below');
{
  // Drag is not conservative and never adds energy: prove the apoapsis after
  // each skimming pass is lower than the one before, which is why "skips back
  // out onto a worse orbit" is not a thing this simulation can do.
  const g = boot(); g.loadMission(1);
  g.S.thermLimit = 1e9; g.S.landingAllowed = true; g.S.craft.fuel = 0; g.S.craft.rcs = 0;
  g.setOrbit('EARTH', 138, 400, 180, 0); g.derive();
  const apo = []; let inside = false;
  for (let n = 0; n < 4000000 && g.S.status === 'flight' && apo.length < 6; n++) {
    g.advance(0.25);
    if (g.D.alt < 140) inside = true;
    else if (inside) { inside = false; apo.push(g.D.apoAlt); }
  }
  let falling = true;
  for (let i = 1; i < apo.length; i++) if (apo[i] >= apo[i-1]) falling = false;
  ok('measured over six passes, apoapsis only ever falls', falling && apo.length >= 4,
     apo.map(a => a.toFixed(0)).join(' → ') + ' km');
}

/* ---------- 5. the canopies ---------- */
console.log('\nDROGUE AND MAINS');
ok('the mains are armed lower than the drogue, and tear far more easily',
   CHUTES.MAIN.arm < CHUTES.DROGUE.arm && CHUTES.MAIN.qTear < CHUTES.DROGUE.qTear,
   `drogue ${CHUTES.DROGUE.arm} km / ${(CHUTES.DROGUE.qTear/1000).toFixed(1)} kPa, ` +
   `mains ${CHUTES.MAIN.arm} km / ${(CHUTES.MAIN.qTear/1000).toFixed(2)} kPa`);
loadMission(11);
ok('a stowed canopy adds exactly no drag area', chuteArea() === 0);
ok('and one on the pad is behind the fairing', /fairing/.test(String(deployChute('DROGUE'))),
   String(deployChute('DROGUE')).slice(0, 52));
{
  const g = boot(); g.loadMission(1);            // in orbit, no fairing
  ok('and one in orbit is far above its arming altitude',
     /ARMED BELOW/.test(String(g.deployChute('DROGUE'))),
     String(g.deployChute('DROGUE')).slice(0, 56));
}

const nominal = comeHome(20);
ok('drogue then mains is a splashdown', nominal.status === 'landed' &&
   nominal.drogue === 'OUT' && nominal.main === 'OUT',
   `${nominal.vv.toFixed(2)} m/s vertical, ${nominal.hv.toFixed(2)} m/s lateral, ${nominal.mass.toFixed(0)} kg`);
ok('and it arrives inside the water limits with real margin',
   nominal.vv < 10 && nominal.vv > 5, `${nominal.vv.toFixed(2)} m/s against a 10 m/s gate`);

const noDrogue = comeHome(20, { drogue: null });
ok('the mains alone are torn away — the drogue is what makes them survivable',
   noDrogue.main === 'TORN' && noDrogue.status === 'lost',
   `mains ${noDrogue.main}, arrival ${noDrogue.vv.toFixed(0)} m/s — ${noDrogue.why.replace('VEHICLE LOST — ','').slice(0,44)}`);
const droOnly = comeHome(20, { main: null });
ok('and the drogue alone is not enough to land on',
   droOnly.status === 'lost' && droOnly.vv > 10,
   `${droOnly.vv.toFixed(1)} m/s under the drogue alone`);
const tooLate = comeHome(20, { main: 0.05 });
ok('a canopy streamed too low does not finish inflating in time',
   tooLate.status === 'lost' && tooLate.main === 'OUT',
   `streamed at 50 m, arrived at ${tooLate.vv.toFixed(1)} m/s`);

/* ---------- 6. which frame a touchdown is judged in ---------- */
console.log('\nGROUND, NOT STARS');
ok('Earth turns at 465 m/s and the Moon at 4.6',
   Math.abs(BODIES.EARTH.rot * BODIES.EARTH.R * 1000 - 464.6) < 0.5 &&
   Math.abs(BODIES.MOON.rot * BODIES.MOON.R * 1000 - 4.62) < 0.05,
   `${(BODIES.EARTH.rot*BODIES.EARTH.R*1000).toFixed(1)} / ${(BODIES.MOON.rot*BODIES.MOON.R*1000).toFixed(2)} m/s`);
ok('under canopies it reads 465 m/s in the old frame and nothing against the ground',
   nominal.hv < 0.05 && Math.abs(nominal.inertialHV - 464.6) < 1,
   `${nominal.inertialHV.toFixed(2)} m/s inertial, ${nominal.hv.toFixed(3)} m/s ground-relative`);
ok('Earth is the body with an ocean under it', BODIES.EARTH.ocean === true &&
   !BODIES.MOON.ocean && !BODIES.MARS.ocean);
ok('and the splashdown says so', /SPLASHDOWN/.test(nominal.why), nominal.why.slice(0, 56));
// The gate and the instrument have to agree. They did not: the touchdown check
// was moved to the ground frame while the descent readout stayed inertial, so a
// capsule hanging dead still under its canopies showed 464.6 m/s of lateral
// drift, in red, on the one display the player watches all the way down.
{
  const g = boot();
  g.loadMission(11);
  g.exec('PWR UP');                        // a dark console reads "no nav data", not a frame
  for (let i = 0; i < 900 && g.S.pwrUp; i++) g.advance(1);
  g.S.landingAllowed = true;               // puts the readout into descent mode
  g.derive(); g.updateHUD();
  const lateral = g.LAT_EL ? g.LAT_EL.textContent : null;
  const shown = parseFloat(String(lateral).replace(/[^\d.-]/g, ''));
  ok('the descent readout is in the same frame as the gate that judges it',
     lateral != null && Math.abs(shown) < 1,
     `standing on the pad, LATERAL reads ${lateral}`);
}

/* ---------- 7. warp is bounded through an entry ---------- */
console.log('\nWARP THROUGH THE AIR');
{
  const g = boot(); g.loadMission(1);
  g.S.thermLimit = 1e9; g.S.landingAllowed = true;
  g.setOrbit('EARTH', 40, 400, 180, 0); g.derive();
  g.exec('WARP 100000');
  ok('a high warp is accepted in vacuum', g.S.warp === 100000, String(g.S.warp));
  let n = 0, deepest = 0;
  while (n++ < 4000000 && g.S.status === 'flight') {
    g.advance(0.1 * Math.max(g.S.warp, 1));
    if (g.inAtmosphere()) { deepest = 140 - g.D.alt; break; }
  }
  const warpAtInterface = g.S.warp;
  // The interface is already an event the chunk is bounded by, so a millionfold
  // clock does not carry the vehicle deep into the air before it is noticed.
  ok('the interface is not stepped over, even at a million times real time',
     deepest < 40, `first sample ${deepest.toFixed(1)} km inside the air`);
  g.advance(1);
  ok('and the clock is pulled back to 10× once there is air', g.S.warp === 10,
     `${warpAtInterface} crossing the line, ${g.S.warp} a step later`);
  ok('with a line saying why', /Warp limited to 10× inside the atmosphere/.test(g.lines().join(' ')));
}

/* ---------- 8. ordered phases ---------- */
console.log('\nORDERED PHASES');
loadMission(1);
ok('a mission that declares objectives is still a flat, unordered list',
   S.phases === null && S.objectives.length > 0, `${S.objectives.length} objectives`);
loadMission(11);
ok('a mission that declares phases gets them in order',
   Array.isArray(S.phases) && S.phases.length === 10, `${S.phases.length} phases`);
ok('and starts on the first of them', curPhase().name === 'POWER UP', curPhase().name);
{
  // The point of ordering: a later check that is ALREADY TRUE must not latch.
  // M-10's last phase is "status landed"; its first is the power-up. Force the
  // landed state and prove only the current phase is ever looked at.
  const g = boot(); g.loadMission(11);
  g.S.status = 'landed';
  g.checkPhases();
  ok('a later phase cannot latch out of turn',
     g.S.phases[9].done === false && g.curPhase().name === 'POWER UP',
     `phase 10 "${g.S.phases[9].name}" is ${g.S.phases[9].done ? 'MET' : 'open'} with the vehicle landed`);
}
{
  // The console is dark until the battery tie is closed, so bring it up first:
  // what is under test is the page, not the cold start.
  const g = boot(); g.loadMission(11); g.sysBoot();
  g.gotoPage('MSN'); g.renderCDU();
  const txt = g.CURRENT.map(r => [r.l, r.r, r.full].map(f => f ? f.lab + ' ' + f.val : '').join(' ')).join(' | ');
  ok('the MSN page shows the phase it is on, not a wall of ten',
     /Phase 1 of 10/.test(txt) && /POWER UP/.test(txt) && !/SPLASHDOWN/.test(txt),
     (txt.match(/Phase [0-9]+ of [0-9]+[^|]*/) || ['none'])[0].trim().slice(0, 60));
  ok('and it offers the way back to the last checkpoint', /FROM THE PAD\*/.test(txt));
}

/* ---------- 9. checkpoints restore exactly ---------- */
console.log('\nCHECKPOINTS');
{
  const g = boot(); g.loadMission(3);          // any flying mission will do
  g.exec('WARP 10');
  for (let i = 0; i < 200; i++) g.advance(10);
  g.takeCheckpoint('TEST');
  const cp = g.lastCheckpoint();
  ok('a checkpoint is taken and remembered', !!cp && cp.name === 'TEST', cp ? g.fmtMET(cp.t) : 'none');
  ok('and it is plain data, small enough to keep', JSON.stringify(cp.snap).length < 16384,
     JSON.stringify(cp.snap).length + ' bytes');
  const mark = { r: { ...g.S.r }, v: { ...g.S.v }, t: g.S.t, m: g.craftMass() };
  // fly on, then put it back and fly the same span again
  for (let i = 0; i < 400; i++) g.advance(10);
  const straight = { r: { ...g.S.r }, v: { ...g.S.v }, t: g.S.t, m: g.craftMass(),
                     o2: g.S.craft.o2, batt: g.S.power.batt, hull: g.S.therm.hull };
  g.restoreCheckpoint();
  ok('restoring lands on the snapshot exactly',
     g.S.r.x === mark.r.x && g.S.r.y === mark.r.y && g.S.v.x === mark.v.x &&
     g.S.v.y === mark.v.y && g.S.t === mark.t && g.craftMass() === mark.m);
  g.exec('WARP 10');
  for (let i = 0; i < 400; i++) g.advance(10);
  const dr = Math.hypot(straight.r.x - g.S.r.x, straight.r.y - g.S.r.y);
  const dv = Math.hypot(straight.v.x - g.S.v.x, straight.v.y - g.S.v.y);
  ok('and flying on from it matches the uninterrupted flight, bit for bit',
     dr === 0 && dv === 0 && straight.m === g.craftMass() &&
     straight.o2 === g.S.craft.o2 && straight.batt === g.S.power.batt && straight.hull === g.S.therm.hull,
     dr === 0 && dv === 0 ? 'identical over 4,000 s' : `${(dr*1000).toFixed(9)} m`);
  // cargo, the shield and the canopies come back with it
  g.S.craft.cargo = 777; g.S.shield.load = 1e7; g.S.chute.DROGUE.state = 'TORN';
  g.takeCheckpoint('LOADED');
  g.S.craft.cargo = 0; g.S.shield.load = 0; g.S.chute.DROGUE.state = 'STOWED';
  g.restoreCheckpoint();
  ok('a checkpoint carries the cargo, the shield budget and the canopies',
     g.S.craft.cargo === 777 && g.S.shield.load === 1e7 && g.S.chute.DROGUE.state === 'TORN',
     `${g.S.craft.cargo} kg, ${(g.S.shield.load/1e6).toFixed(0)} MJ/m², drogue ${g.S.chute.DROGUE.state}`);
}
{
  const g = boot(); g.loadMission(11);
  g.exec('RESTART');
  ok('RESTART on an ordered mission with no checkpoint starts over from the pad',
     !!g.S.pad && !g.S.pad.lifted && g.S.t === 0);
  g.takeCheckpoint('LIFT OFF'); g.S.phases[0].done = true; g.S.phase = 1;
  g.exec('RESTART');
  const said = g.lines().filter(l => l.trim()).slice(-4).join(' ');
  ok('and with one it offers both, rather than choosing for you',
     /RESTART PHASE/.test(said) && /RESTART PAD/.test(said), said.slice(-64));
  g.exec('RESTART PAD');
  ok('RESTART PAD is the old behaviour, unchanged', g.S.t === 0 && !!g.S.pad && g.S.phase === 0);
}
{
  const g = boot(); g.loadMission(1);
  const before = g.S.objectives.map(o => o.done);
  g.exec('RESTART');
  ok('and a flat mission\'s RESTART is untouched by any of it',
     g.S.t === 0 && g.S.objectives.every(o => !o.done) && g.S.objectives.length === before.length);
}

/* ---------- 10. M-10, dark pad to splashdown ---------- */
console.log('\nM-10 CARGO RUN, END TO END');
{
  const g = boot(); const s = g.S;
  g.loadMission(11);
  const o2Start = s.craft.o2;
  ok('M-10 starts cold, dark and on the pad with the delivery aboard',
     !!s.pad && !s.pad.lifted && g.SYSIDS.every(id => !g.sysFitted(id) || !g.sysOn(id)) && s.craft.cargo === 1800,
     `${s.craft.cargo} kg aboard, ${s.craft.crew} crew, ${s.craft.o2} crew-hours`);

  g.exec('PWR UP');
  for (let i = 0; i < 3000 && s.pwrUp; i++) g.advance(1);
  ok('phase 1 · the vehicle wakes up', s.phases[0].done, `MET ${g.fmtMET(s.t)}`);

  g.ignite();
  let staged = null, maxQ = 0;
  for (let i = 0; i < 30000 && s.status === 'flight'; i++) {
    g.advance(0.25);
    if (g.D.q > maxQ) maxQ = g.D.q;
    if (staged === null && s.craft.stageName === 'FIRST STAGE' && s.craft.fuel <= 0.01) { g.jettisonStage(); staged = s.t; }
    if (s.burn && g.D.apoAlt >= PARK_ALT && g.D.alt > 140) { g.exec('MECO'); break; }
  }
  ok('phase 2 · it flies out of the atmosphere', s.phases[1].done,
     `max Q ${(maxQ/1000).toFixed(1)} kPa against 40, first stage away T+${staged.toFixed(0)} s`);
  ok('and the filed program stays under the design limit', maxQ < 40000, `${(maxQ/1000).toFixed(1)} kPa`);

  const runPlan = (cmd, warp) => {
    g.exec(cmd);
    const bl = g.burnLine(); if (!bl) return false;
    g.exec(bl);
    for (let i = 0; i < 400000 && s.status === 'flight'; i++) {
      g.exec(s.sched && g.timeToIgnition() > 300 ? 'WARP ' + warp : 'WARP 1');
      g.advance(1);
      if (!s.sched && !s.burn && i > 20) break;
    }
    g.exec('WARP 1'); return true;
  };
  runPlan('PLAN CIRC AP', 50);
  if (s.craft.stages && s.craft.stageIx < s.craft.stages.length - 1) g.jettisonStage();
  ok('phase 3 · a parking orbit', s.phases[2].done,
     `${g.D.perAlt.toFixed(1)}×${g.D.apoAlt.toFixed(1)} km, e=${g.D.e.e.toFixed(4)}, MET ${g.fmtMET(s.t)}`);

  g.exec('TGT STATION');
  runPlan('PLAN RDV', 100);
  runPlan('PLAN CIRC AP', 100);
  // Close the along-track gap the way the lesson says: a lower orbit is a
  // faster one. Two RCS pulses per attempt, drop and re-match.
  for (let attempt = 0; attempt < 14; attempt++) {
    const t = g.targetRel(); if (!t) break;
    const rng = g.V.len(t.r);
    if (rng < 0.35) break;
    const along = g.V.dot(t.r, g.V.unit(s.v));
    const N = rng > 20 ? 3 : 2;
    const da = Math.min(8, Math.abs(along) / (3 * Math.PI * N));
    let dv = Math.max(0.04, Math.min(4, 0.5 * g.D.e.v * da / g.D.e.a * 1000));
    g.exec((along > 0 ? 'TRANS RET ' : 'TRANS PRO ') + dv.toFixed(3));
    let prev = rng, n = 0;
    while (n++ < 200000) {
      g.exec('WARP 20'); g.advance(20);
      const rr = g.V.len(g.targetRel().r);
      if (rr > prev + 0.005 || rr < 0.2) break;
      prev = rr;
    }
    g.exec((along > 0 ? 'TRANS PRO ' : 'TRANS RET ') + dv.toFixed(3));
    if (s.t > 4 * 86400) break;
  }
  ok('phase 4 · alongside CERES', s.phases[3].done,
     `${(g.V.len(g.targetRel().r)*1000).toFixed(0)} m, MET ${g.fmtMET(s.t)}, ${g.rcsDV().toFixed(1)} m/s RCS left`);

  g.exec('WARP 1'); g.exec('DOCK AUTO');
  let n = 0; while (n++ < 400000 && s.status === 'flight' && s.dock.phase === 'FREE') g.advance(0.25);
  n = 0; while (n++ < 200000 && s.status === 'flight' && s.dock.phase !== 'HARD') {
    if (s.dock.phase === 'SOFT') g.exec('DOCK RETRACT');
    if (s.dock.phase === 'RETRACTED') g.exec('DOCK LATCH');
    g.advance(0.5);
  }
  ok('phase 5 · hard dock', s.phases[4].done && s.dock.phase === 'HARD',
     `${s.dock.latches} latches, MET ${g.fmtMET(s.t)}`);

  // The seal is rolled fresh on every seating and fails about one time in six
  // after a clean capture — that is deliberate, and docking.test.js measures it
  // at 17.2% over 4,000 seatings. Re-seating ONCE therefore leaves this whole
  // flight failing about 3% of the time, which is a coin toss hidden inside the
  // suite that gates every release. The game's own promise is that a failed
  // seal is never a dead end, so the test flies it the way a crew would: keep
  // re-seating until the vestibule holds.
  const proveTheSeal = () => {
    g.exec('DOCK EQUALISE');
    n = 0; while (n++ < 20000 && s.dock.vest.press < 101) g.advance(1);
    g.exec('DOCK EQUALISE'); g.exec('DOCK LEAK');
    n = 0; while (n++ < 20000 && !s.dock.vest.verdict) g.advance(1);
    return s.dock.vest.verdict === 'PASS';
  };
  let seatings = 1;
  while (!proveTheSeal() && seatings < 12) {
    seatings++;
    g.exec('DOCK RESEAT');
    n = 0; while (n++ < 20000 && s.dock.phase !== 'HARD') { if (s.dock.phase === 'RETRACTED') g.exec('DOCK LATCH'); g.advance(0.5); }
  }
  ok('the vestibule seal is proven, re-seating as often as it takes',
     s.dock.vest.leakOk, seatings === 1 ? 'first seating held' : `held on seating ${seatings}`);
  g.exec('DOCK HATCH');
  const massDocked = g.craftMass();
  g.exec('DOCK UNLOAD');
  n = 0; while (n++ < 20000 && s.dock.cargo.moving) g.advance(1);
  const massStripped = g.craftMass();
  g.exec('DOCK LOAD');
  n = 0; while (n++ < 20000 && s.dock.cargo.moving) g.advance(1);
  ok('phase 6 · the manifest is swapped', s.phases[5].done,
     `${massDocked.toFixed(0)} kg → ${massStripped.toFixed(0)} kg → ${g.craftMass().toFixed(0)} kg`);
  ok('and the ship that leaves is lighter than the one that arrived',
     g.craftMass() < massDocked && g.craftMass() > massStripped,
     `600 kg lighter: 1,800 kg delivered against 1,200 kg taken on`);

  g.exec('DOCK UNDOCK');
  n = 0; while (n++ < 200000 && g.V.len(g.targetRel().r) * 1000 < 130) g.advance(1);
  ok('phase 7 · clear of the station', s.phases[6].done,
     `${(g.V.len(g.targetRel().r)*1000).toFixed(0)} m off the port`);

  g.exec('WARP 1');
  runPlan('PLAN PERI 20', 100);
  ok('phase 8 · periapsis inside the published corridor', s.phases[7].done,
     `${g.D.perAlt.toFixed(0)} km, corridor ${CARGO_BAND[0]} to ${CARGO_BAND[1]} km`);

  g.exec('WARP 50');
  let peak = 0, droAlt = null, mainAlt = null, warpInAir = null;
  n = 0;
  while (n++ < 6000000 && s.status === 'flight') {
    g.advance(0.25 * Math.max(s.warp, 1));
    if (g.inAtmosphere() && warpInAir === null) warpInAir = s.warp;
    if (s.shield.rate > peak) peak = s.shield.rate;
    if (g.D.alt <= 25 && s.chute.DROGUE.state === 'STOWED' && !g.deployChute('DROGUE')) droAlt = g.D.alt;
    if (g.D.alt <= 6 && s.chute.MAIN.state === 'STOWED' && !g.deployChute('MAIN')) mainAlt = g.D.alt;
    if (s.t > 10 * 86400) break;
  }
  ok('the clock was pulled back to 10× as it met the air', warpInAir === 10, String(warpInAir));
  ok('phase 9 · through the corridor with the shield intact', s.phases[8].done && !s.shield.gone,
     `peak ${(peak/1000).toFixed(0)} kW/m² of ${(SHIELD_RATE/1000).toFixed(0)}, ` +
     `${(s.shield.load/1e6).toFixed(1)} MJ/m² of ${(s.shield.cap/1e6).toFixed(0)} spent`);
  const ar = g.airRelative(s.r, s.v, g.BODIES.EARTH);
  ok('phase 10 · splashdown', s.phases[9].done && s.status === 'landed',
     `${(Math.abs(g.V.dot(ar, g.V.unit(s.r)))*1000).toFixed(2)} m/s vertical, ` +
     `drogue ${droAlt ? droAlt.toFixed(1) : '—'} km, mains ${mainAlt ? mainAlt.toFixed(1) : '—'} km`);
  ok('and the mission completes', !!s.completed, `MET ${g.fmtMET(s.t)}`);
  ok('a checkpoint was taken at every phase boundary', s.checkpoints.length === 10,
     `${s.checkpoints.length} checkpoints, last "${lastCheckpointName(s)}"`);
  const hours = s.t / 3600, used = o2Start - s.craft.o2;
  ok('the air covered the flight with the ladder\'s margin',
     (o2Start / s.craft.crew) / hours > 10,
     `${used.toFixed(0)} crew-hours used of ${o2Start} in a ${hours.toFixed(1)} h flight — ` +
     `${((o2Start/s.craft.crew)/hours).toFixed(0)}× margin`);
  ok('and the battery was never flat', s.power.batt > 0,
     `${(s.power.batt/s.power.battMax*100).toFixed(0)}% at splashdown`);
}
function lastCheckpointName(s) {
  return s.checkpoints.length ? s.checkpoints[s.checkpoints.length - 1].name : 'none';
}

/* ---------- 11. the roster did not get renumbered ---------- */
console.log('\nTHE ROSTER');
// Item 05 added M-11 on id 12, the next free one. M-10 keeps id 11 and no
// mission before it was renumbered — the ids live in the flight record.
ok('M-10 kept the id it took, and M-11 took the next free one',
   G.MISSIONS.filter(m => m.id === 11).length === 1 &&
   G.MISSIONS.find(m => m.id === 12) && G.MISSIONS.find(m => m.id === 12).code === 'M-11' &&
   G.MISSIONS.map(m => m.id).sort((a, b) => a - b).join(',') === '0,1,2,3,4,5,6,7,8,9,10,11,12,13',
   G.MISSIONS.map(m => m.id).join(','));
ok('and no other mission was renumbered',
   G.MISSIONS.find(m => m.id === 10).code === 'M-00' && G.MISSIONS.find(m => m.id === 0).code === 'FREE');
ok('M-09 now chains forwards to it instead of backwards to the launch tutorial',
   G.MISSIONS.find(m => m.id === 9).next === 11);
ok('the roster runs the ladder and ends with the sandbox',
   G.ROSTER_ORDER.join(',') === '10,1,2,3,4,5,6,7,8,9,11,12,13,0', G.ROSTER_ORDER.join(','));
ok('and M-10 chains forwards to the Mars round trip',
   G.MISSIONS.find(m => m.id === 11).next === 12);
// The chaining papercut, now caught by a rule rather than by a reader: every
// mission that names a successor must name one that EXISTS and that comes
// after it in the roster. Three consecutive items shipped a `next` pointing at
// the sandbox because the item after them had not been written yet.
{
  const pos = (id) => G.ROSTER_ORDER.indexOf(id);
  const bad = G.MISSIONS.filter(m => m.next != null && m.next !== 0)
    .filter(m => !G.MISSIONS.some(x => x.id === m.next) || pos(m.next) <= pos(m.id));
  ok('every mission that chains, chains forwards to a mission that exists',
     bad.length === 0, bad.map(m => m.code + '->' + m.next).join(',') || 'all forward');
  const last = G.ROSTER_ORDER[G.ROSTER_ORDER.length - 2];   // the sandbox is last
  ok('and the newest mission is the one that hands over to the sandbox',
     G.MISSIONS.find(m => m.id === last).next === 0,
     G.MISSIONS.find(m => m.id === last).code + ' -> ' + G.MISSIONS.find(m => m.id === last).next);
}

T.done('cargo, entry and phases: all checks passed');
