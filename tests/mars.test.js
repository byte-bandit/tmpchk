/* Item 05 — the Mars round trip, and the three pieces of machinery it needed:
   a Kepler step that cannot silently diverge, a transfer solver that works
   INBOUND, and a midcourse trim. */
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { boot, suite } = require('./harness');
const G = boot();
const { BODIES, AU, V, MARS_BAND, SHIELD_RATE, PARK_ALT } = G;
const T = suite('MARS ROUND TRIP');
const ok = (n, c, x) => T.ok(n, c, x);

/* ---------- 1. the Kepler step says when it has failed ---------- */
console.log('\nTHE KEPLER GUARD');
{
  // The arrival hyperbola at Mars' sphere of influence, reached by flying
  // M-08's own transfer. This is the state the old solver diverged on.
  const g = boot(); const s = g.S;
  g.loadMission(8);
  g.exec('PLAN XFER MARS'); g.exec(g.burnLine()); g.exec('WARP 1000000');
  let n = 0; while (n++ < 3e6 && s.status === 'flight' && s.soi !== 'MARS') {
    g.advance(250000); if (s.t > 4 * 365 * 86400) break; }
  const r0 = { ...s.r }, v0 = { ...s.v }, mu = BODIES.MARS.mu;
  const e0 = g.elements(r0, v0, mu);
  ok('the flyby hyperbola is the hard case it was measured on',
     s.soi === 'MARS' && e0.e > 1.7 && e0.e < 1.73,
     `e ${e0.e.toFixed(4)}, periapsis ${e0.rp.toFixed(0)} km, ${g.V.len(r0).toFixed(0)} km out`);

  /** Many small steps: the answer a single step has to match. */
  const ref = (dt, sub = 4000) => {
    let r = { ...r0 }, v = { ...v0 };
    for (let i = 0; i < sub; i++) { const o = g.propagate(r, v, mu, dt / sub); r = o.r; v = o.v; }
    return r;
  };
  const band = [1500, 1764, 2000, 3000], clean = [60, 300, 600, 1000, 3529, 10000, 30000];
  const flagged = band.filter(dt => !g.keplerStep(r0, v0, mu, dt).ok);
  const passed = clean.filter(dt => g.keplerStep(r0, v0, mu, dt).ok);
  ok('the step reports failure across the whole divergent band',
     flagged.length === band.length, `${flagged.join(', ')} s flagged`);
  ok('and reports success everywhere Newton actually converges',
     passed.length === clean.length, `${passed.join(', ')} s clean`);
  let worst = 0, worstDt = 0;
  for (const dt of band.concat(clean)) {
    const a = g.propagate(r0, v0, mu, dt), b = ref(dt);
    const err = Math.hypot(a.r.x - b.x, a.r.y - b.y);
    if (err > worst) { worst = err; worstDt = dt; }
  }
  ok('and propagate() is exact at every one of them, divergent band included',
     worst < 1e-3, `worst ${worst.toExponential(2)} km at dt ${worstDt} s`);
}

/* ---------- 2. a flyby is the same flyby at every warp ---------- */
console.log('\nA FLYBY AT EVERY WARP');
{
  const fly = (warp) => {
    const g = boot(); const s = g.S;
    g.loadMission(8);
    g.exec('PLAN XFER MARS'); g.exec(g.burnLine()); g.exec('WARP 1000000');
    let n = 0; while (n++ < 3e6 && s.status === 'flight' && s.soi !== 'MARS') {
      g.advance(250000); if (s.t > 4 * 365 * 86400) break; }
    const t0 = s.t; g.exec('WARP ' + warp);
    n = 0; while (n++ < 4e6 && s.status === 'flight' && s.soi === 'MARS') {
      g.advance(0.25 * Math.max(s.warp, 1)); if (s.warp === 0) break; if (s.t - t0 > 60 * 86400) break; }
    return g.D.e;
  };
  const runs = [1, 100, 10000, 1000000].map(w => [w, fly(w)]);
  const rp = runs.map(r => r[1].rp / AU), ec = runs.map(r => r[1].e);
  const spreadRp = Math.max(...rp) - Math.min(...rp), spreadE = Math.max(...ec) - Math.min(...ec);
  ok('passing THROUGH Mars gives the same orbit at 1× and at 1,000,000×',
     spreadRp < 1e-3 && spreadE < 1e-3,
     runs.map(r => `${r[0]}×: ${(r[1].rp/AU).toFixed(4)} AU e ${r[1].e.toFixed(4)}`).join('  ·  '));
  ok('and it is a real orbit, not a corrupted one', ec.every(e => e < 1) && rp.every(p => p > 0.5 && p < 2),
     `perihelion ${rp[0].toFixed(3)} AU, e ${ec[0].toFixed(4)}`);
}

/* ---------- 3. the transfer solver, inbound ---------- */
console.log('\nINBOUND');
{
  const g = boot(); const s = g.S;
  g.loadMission(8);
  g.setOrbit('SUN', BODIES.MARS.a - BODIES.SUN.R, BODIES.MARS.a - BODIES.SUN.R, 0, 0);
  const n0 = g.lines().length;
  g.exec('PLAN XFER EARTH');
  const bl = g.burnLine();
  ok('PLAN XFER EARTH from Mars\' distance solves a real encounter, not a fallback',
     /AT T\+/.test(bl || '') && !g.since(n0).some(l => /Falling back to the analytic window/.test(l)), bl);
  const peri = (g.since(n0).find(l => /ARRIVAL PERI/.test(l)) || '').trim();
  ok('and it quotes an arrival periapsis over Earth', /ARRIVAL PERI/.test(peri), peri);
  g.exec(bl); g.exec('WARP 1000000');
  let n = 0; while (n++ < 9e6 && s.status === 'flight' && s.soi !== 'EARTH') {
    g.advance(250000); if (s.t > 4 * 365 * 86400) break; }
  ok('and flying it reaches Earth\'s sphere of influence', s.soi === 'EARTH',
     `soi ${s.soi} at MET ${g.fmtMET(s.t)}`);
}

/* ---------- 4. the midcourse trim ---------- */
console.log('\nMIDCOURSE TRIM');
{
  // NEAR mode: on the hyperbola in toward the primary, where PLAN PERI cannot
  // help because there is no apoapsis to burn at.
  const g = boot(); const s = g.S;
  g.loadMission(8);
  g.rig({ name:'TRIMTEST', dry:3200, fuel:8000, thrust:60, isp:326, rcs:40, crew:0 });
  s.pad = null;
  const mu = BODIES.EARTH.mu, R = BODIES.EARTH.R, rp = R - 2205, vinf = 1.5;
  const a = -mu/(vinf*vinf), e = 1 - rp/a, h = Math.sqrt(mu*rp*(1+e));
  const r0 = 290588, v0 = Math.sqrt(vinf*vinf + 2*mu/r0);
  const cg = Math.min(1, h/(r0*v0)), sg = -Math.sqrt(Math.max(0, 1-cg*cg));
  s.soi = 'EARTH'; s.r = { x:r0, y:0 }; s.v = { x:v0*sg, y:v0*cg }; s.t = 0; s.status = 'flight';
  g.derive();
  const before = g.D.perAlt;
  ok('an incoming hyperbola has no apoapsis, so PLAN PERI cannot touch it',
     (g.exec('PLAN PERI 300'), /No apoapsis/.test(g.lines().slice(-4).join(' '))),
     g.lines().slice(-1)[0].slice(0, 58));
  const m0 = g.lines().length;
  g.exec('PLAN TRIM EARTH 300');
  const tl = (g.since(m0).filter(l => /^\s*→\s*BURN /.test(l)).pop() || '').replace(/^\s*→\s*/, '');
  ok('PLAN TRIM solves one', /^BURN /.test(tl), tl);
  g.exec('WARP 1'); g.exec(tl);
  let n = 0; while (n++ < 2e6 && s.status === 'flight' && (s.sched || s.burn)) g.advance(0.25);
  const after = g.D.perAlt;
  ok('and flying it MOVES the periapsis, onto the number it quoted',
     Math.abs(after - 300) < 25 && Math.abs(after - before) > 1000,
     `${before.toFixed(0)} km → ${after.toFixed(0)} km, moved ${(after-before).toFixed(0)} km`);
  ok('an aim inside the atmosphere is legal now, not rejected by construction',
     (() => { const k = g.lines().length; g.exec('PLAN TRIM EARTH 20');
              return g.since(k).some(l => /AFTER TRIM/.test(l)); })(),
     (g.lines().filter(l => /AFTER TRIM/.test(l)).pop() || 'none').trim());
}

/* ---------- 5. the depot is a quantity ---------- */
console.log('\nTHE DEPOT');
{
  const g = boot(); const s = g.S;
  g.loadMission(12);
  while (g.jettisonStage() === null) ;      // down to the spacecraft's own stage
  s.pad = null;
  ok('M-11 launches with a tank far bigger than what is in it',
     s.craft.fuelMax > s.craft.fuel * 10, `${s.craft.fuel} of ${s.craft.fuelMax} kg`);
  // Read the quantity rather than hard-coding it: the depot is sized against
  // the worst return the trajectory produces and that number is allowed to move.
  const depot0 = s.depot ? s.depot.prop : 0;
  ok('and CERES holds a stated quantity that does not refill itself',
     !!s.depot && depot0 > 0 && s.depot.rate > 0,
     s.depot ? `${depot0} kg at ${s.depot.rate} kg/s` : 'no depot');
  /** Put a vehicle on the far side of a hard dock with the pumps running. */
  const pump = (gg) => {
    gg.S.dock.phase = 'HARD'; gg.S.dock.pwr.tie = true;
    gg.S.dock.prop.line = true; gg.S.dock.prop.purged = true; gg.S.dock.prop.xfer = true;
    let n = 0; while (n++ < 400000 && gg.S.dock.prop.xfer) gg.advance(1);
  };
  // A refuelling happens alongside the station, not on the pad. Left where it
  // lifts off from, the vehicle hits the ground on the first step and the clock
  // stops with six kilos aboard.
  s.pad = null; s.fairing = false;
  g.setOrbit('EARTH', 400, 400, 0, 0); g.derive();
  s.craft.fuel = 600;
  pump(g);
  const tookFromDepot = depot0 - s.depot.prop;
  ok('pumping fills the ship out of the depot, and the depot is drawn down by exactly that',
     s.craft.fuel >= s.craft.fuelMax - 1e-6 && Math.abs(tookFromDepot - (s.craft.fuelMax - 600)) < 1,
     `ship ${s.craft.fuel.toFixed(0)} / ${s.craft.fuelMax.toFixed(0)} kg, ${tookFromDepot.toFixed(0)} kg out of the depot`);
  // The depot holds 26,000 kg against a 26,000 kg tank, so a ship that lifts
  // off with 600 aboard cannot quite drain it. A ship with more room than the
  // depot has propellant can, and that is the case worth seeing.
  {
    const dry = boot(); const ds = dry.S;
    dry.loadMission(12);
    while (dry.jettisonStage() === null) ;
    ds.pad = null; ds.fairing = false;
    dry.setOrbit('EARTH', 400, 400, 0, 0); dry.derive();
    ds.craft.fuel = 0; ds.depot.prop = 4000;
    pump(dry);
    ok('a depot that runs out says so, and hands back what it managed',
       ds.depot.prop < 1e-6 && Math.abs(ds.craft.fuel - 4000) < 1 &&
       dry.lines().some(l => /DEPOT DRY/.test(l)),
       (dry.lines().filter(l => /DEPOT DRY/.test(l))[0] || 'no DEPOT DRY line').slice(0, 76));
  }
  // A station with no depot is the bottomless tap every earlier mission had.
  const h = boot(); h.loadMission(3);
  h.S.craft.fuel = 100;
  pump(h);
  ok('a station without a depot still fills the tanks, exactly as before',
     h.S.craft.fuel >= h.S.craft.fuelMax - 1e-6 && h.S.depot === null,
     `${h.S.craft.fuel.toFixed(0)} / ${h.S.craft.fuelMax.toFixed(0)} kg`);
}

/* ---------- 6. the budget only closes with the refuel ---------- */
console.log('\nUNFLYABLE WITHOUT THE REFUEL');
{
  const g = boot(); const s = g.S;
  g.loadMission(12);
  while (g.jettisonStage() === null) ;
  s.pad = null;
  const launched = g.dvRemaining();
  s.craft.fuel = s.craft.fuelMax;
  s.craft.rcs = s.craft.rcsMax;
  const fuelled = g.dvRemaining();
  ok('what a launcher can lift is nowhere near a Mars round trip',
     launched < 1100, `${launched.toFixed(0)} m/s off the pad`);
  ok('and the depot is what makes the flight possible at all',
     fuelled > 14000 && fuelled > launched * 12,
     `${launched.toFixed(0)} m/s → ${fuelled.toFixed(0)} m/s, ${(fuelled/launched).toFixed(0)}× more`);
}

/* ---------- 7. life support over years ---------- */
console.log('\nAIR FOR A DECADE');
{
  // In cruise, where the arrays are out and the bus is carried by the Sun.
  const g = boot(); const s = g.S;
  g.loadMission(12);
  while (g.jettisonStage() === null) ;
  // In orbit BEFORE the clock runs. Powering up on the pad with `pad` nulled
  // flies the vehicle into the ground on the first step, and every loop after
  // that exits immediately on a status that is no longer 'flight'.
  s.pad = null; s.fairing = false;
  g.setOrbit('EARTH', 400, 400, 0, 0); g.derive();
  g.exec('PWR UP');
  for (let i = 0; i < 4000 && s.pwrUp; i++) g.advance(1);
  const o2 = s.craft.o2, t0 = s.t;
  let n = 0; while (n++ < 2000000 && s.status === 'flight' && s.t - t0 < 30 * 86400) g.advance(600);
  ok('a month of flight with the loop closed costs no oxygen at all',
     s.craft.o2 === o2 && g.eclssClosed(),
     `${o2} → ${s.craft.o2} crew-hours over ${((s.t-t0)/86400).toFixed(0)} days with ${s.craft.crew} crew`);
  const hrs = s.craft.o2 / (s.craft.crew * G.ECLSS_OPEN_RATE);
  ok('and the reserve is sized as a reserve, in days, not as the mission clock',
     hrs > 100 && hrs < 400, `${hrs.toFixed(0)} h = ${(hrs/24).toFixed(1)} days with the loop down`);
}


/* ---------- 8. the whole flight, from the dark pad to Earth orbit ----------
 *
 * This is the test the item was missing, and everything else in this suite was
 * green without it while the mission could not be finished. It flies M-11 the
 * way a player does: wake the ship, launch, phase up to CERES, dock, pump the
 * depot, escape, inject, coast to Mars, come home and stop.
 *
 * Two things it pins that nothing else does. The rendezvous is closed by
 * MATCHING THE STATION'S PERIOD first — `PLAN CIRC AP` leaves a finite-burn
 * residue of about ten seconds of period, which drifts the range faster than
 * any phasing can close it. And the capture is a retrograde burn at periapsis
 * into an ELLIPSE; circularising where the ship arrives costs more than it
 * carries.
 */
console.log('\nTHE WHOLE FLIGHT');
{
  const g = boot(); const s = g.S;
  g.loadMission(12);
  const ph = (i) => s.phases[i] && s.phases[i].done;
  g.exec('PWR UP');
  for (let i = 0; i < 4000 && s.pwrUp; i++) g.advance(1);
  ok('phase 1 · the ship wakes up on the pad', ph(0), `MET ${g.fmtMET(s.t)}`);

  g.ignite();
  let staged = null, maxQ = 0;
  for (let i = 0; i < 40000 && s.status === 'flight'; i++) {
    g.advance(0.25);
    if (g.D.q > maxQ) maxQ = g.D.q;
    if (staged === null && s.craft.stageName === 'FIRST STAGE' && s.craft.fuel <= 0.01) { g.jettisonStage(); staged = s.t; }
    if (s.burn && g.D.apoAlt >= G.PARK_ALT && g.D.alt > 140) { g.exec('MECO'); break; }
  }
  ok('phase 2 · out of the atmosphere', ph(1), `max Q ${(maxQ/1000).toFixed(1)} kPa, staged T+${staged.toFixed(0)} s`);

  // advance() takes SIM seconds and sub-steps internally, so a scheduled burn
  // ninety days out is coasted in big strides, not stepped at one second.
  const runPlan = (cmd) => {
    g.exec(cmd);
    const bl = g.burnLine(); if (!bl) return false;
    g.exec(bl);
    for (let i = 0; i < 400000 && s.status === 'flight'; i++) {
      const ti = s.sched ? g.timeToIgnition() : Infinity;
      g.advance(s.burn ? 0.5 : ti > 86400 ? 21600 : ti > 3600 ? 600 : ti > 60 ? 20 : 1);
      if (!s.sched && !s.burn && i > 5) break;
    }
    return true;
  };
  runPlan('PLAN CIRC AP');
  if (s.craft.stages && s.craft.stageIx < s.craft.stages.length - 1) g.jettisonStage();
  ok('phase 3 · a parking orbit', ph(2),
     `${g.D.perAlt.toFixed(1)}x${g.D.apoAlt.toFixed(1)} km, e=${g.D.e.e.toFixed(4)}`);

  g.exec('TGT STATION');
  runPlan('PLAN RDV');
  runPlan('PLAN CIRC AP');
  const matchPeriod = () => {
    const o = s.objects.find(x => x.id === 'STATION'); if (!o) return;
    const mu = G.BODIES.EARTH.mu;
    const se = g.elements(o.r, o.v, mu);
    const aT = Math.cbrt(mu * Math.pow(se.period / (2 * Math.PI), 2));
    const dv = g.D.e.v * (aT - g.D.e.a) / (2 * g.D.e.a) * 1000;
    if (isFinite(dv) && Math.abs(dv) > 1e-4) g.exec((dv > 0 ? 'TRANS PRO ' : 'TRANS RET ') + Math.abs(dv).toFixed(4));
  };
  const phaseUp = (N) => {
    const o = s.objects.find(x => x.id === 'STATION'); if (!o) return false;
    const thC = Math.atan2(s.r.y, s.r.x), thT = Math.atan2(o.r.y, o.r.x);
    let phi = g.normAngle((thT - thC) * g.D.e.dir);
    if (phi > Math.PI) phi -= 2 * Math.PI;
    const T = g.D.e.period, a = g.D.e.a;
    const da = -(2 / 3) * a * (phi * T / (2 * Math.PI * N)) / T;
    const dv = Math.abs(g.D.e.v * da / (2 * a)) * 1000;
    if (!isFinite(dv) || dv <= 0) return false;
    g.exec((da < 0 ? 'TRANS RET ' : 'TRANS PRO ') + dv.toFixed(4));
    const Tnew = g.D.e.period, t0 = s.t;
    let n = 0; while (n++ < 200000 && s.t - t0 < N * Tnew) g.advance(60);
    g.exec((da < 0 ? 'TRANS PRO ' : 'TRANS RET ') + dv.toFixed(4));
    return true;
  };
  matchPeriod();
  for (let a = 0; a < 10; a++) {
    const t = g.targetRel(); if (!t || g.V.len(t.r) < 20) break;
    if (!phaseUp(g.V.len(t.r) > 300 ? 20 : g.V.len(t.r) > 40 ? 10 : 5)) break;
    matchPeriod();
  }
  ok('phase 4 · alongside CERES, on a phasing orbit rather than a chase', ph(3),
     `${(g.V.len(g.targetRel().r)*1000).toFixed(0)} m, ${g.rcsDV().toFixed(1)} m/s RCS left`);

  g.exec('DOCK AUTO');
  let n = 0; while (n++ < 400000 && s.status === 'flight' && s.dock.phase === 'FREE') g.advance(0.25);
  n = 0; while (n++ < 300000 && s.status === 'flight' && s.dock.phase !== 'HARD') {
    if (s.dock.phase === 'SOFT') g.exec('DOCK RETRACT');
    if (s.dock.phase === 'RETRACTED') g.exec('DOCK LATCH');
    g.advance(0.5);
  }
  g.exec('DOCK UMB'); g.exec('DOCK TIE'); g.exec('DOCK LINE');
  n = 0; while (n++ < 20000 && !s.dock.prop.purged) g.advance(1);
  g.exec('DOCK XFER');
  n = 0; while (n++ < 400000 && s.dock.prop.xfer) g.advance(1);
  ok('phase 5 · docked, and the depot is most of the way into the tank', ph(4),
     `${s.craft.fuel.toFixed(0)}/${s.craft.fuelMax} kg aboard, ${s.depot.prop.toFixed(0)} kg left at CERES`);
  ok('and the ship only becomes a Mars ship once it is full',
     g.D.dv > 15000, `${g.D.dv.toFixed(0)} m/s`);

  g.exec('DOCK UNDOCK');
  n = 0; while (n++ < 20000 && g.V.len(g.targetRel().r) < 0.6) g.advance(5);
  runPlan('PLAN ESC');
  n = 0; while (n++ < 40000 && s.soi !== 'SUN' && s.status === 'flight') g.advance(600);
  runPlan('PLAN XFER MARS');
  ok('phase 6 · trans-Mars injection', ph(5),
     `aphelion ${(g.D.e.ra/g.AU).toFixed(3)} AU, ${g.D.dv.toFixed(0)} m/s left`);

  n = 0; while (n++ < 200000 && s.status === 'flight' && !ph(6)) g.advance(3600);
  ok('phase 7 · past Mars and back out into the Sun\'s sphere', ph(6),
     `MET ${g.fmtMET(s.t)}, on ${(g.D.e.rp/g.AU).toFixed(3)}x${(g.D.e.ra/g.AU).toFixed(3)} AU`);

  runPlan('PLAN XFER EARTH');
  n = 0; while (n++ < 200000 && s.status === 'flight' && s.soi !== 'EARTH') g.advance(3600);
  ok('phase 8 · home, on a hyperbola', ph(7),
     `Earth SOI at MET ${g.fmtMET(s.t)}, periapsis ${g.D.perAlt.toFixed(0)} km, e ${g.D.e.e.toFixed(3)}`);

  // Capture into an ELLIPSE. Circularising at the arrival periapsis costs more
  // than the ship carries and would strand it with no way down.
  {
    const mu = G.BODIES.EARTH.mu, R = G.BODIES.EARTH.R, e0 = g.D.e, rp = e0.rp;
    const vNow = Math.sqrt(mu * (1 + e0.e) / rp);
    const aWant = (rp + R + 18000) / 2;
    const dv = (vNow - Math.sqrt(mu * (2 / rp - 1 / aWant))) * 1000;
    const m0 = g.craftMass(), isp = s.craft.isp;
    const secs = (m0 - m0 / Math.exp(dv / (isp * 9.80665))) / (s.craft.thrust * 1000 / (isp * 9.80665));
    ok('the capture is affordable on the fast arrival, not just the lucky one',
       dv < g.D.dv, `${dv.toFixed(0)} m/s needed, ${g.D.dv.toFixed(0)} aboard`);
    g.exec(`BURN RET ${secs.toFixed(1)} AT PE`);
    n = 0; while (n++ < 600000 && s.status === 'flight' && (s.sched || s.burn)) g.advance(1);
  }
  ok('phase 9 · captured into Earth orbit, and the mission is over', ph(8) && s.completed,
     `${g.D.perAlt.toFixed(0)}x${g.D.apoAlt.toFixed(0)} km, e=${g.D.e.e.toFixed(3)}, ${g.D.dv.toFixed(0)} m/s spare`);
  ok('the air held for the whole flight, because the loop never opened',
     s.craft.o2 > 1900 && s.power.batt > 0,
     `${s.craft.o2.toFixed(0)} crew-hours of reserve still aboard after ${(s.t/86400/365.25).toFixed(2)} years`);
}

T.done('the Mars round trip: all checks passed');
