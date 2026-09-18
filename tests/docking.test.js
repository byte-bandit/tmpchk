const { boot, suite } = require('./harness');
const G = boot();
const { exec, loadMission, advance, derive, V, targetRel, dockGeom, dockGuide,
        dockTarget, utilitiesDone, DOCK_ENV, PORT_ARM, PORT_ARM_STN,
        fmtRange, fmtRate, rcsDV, craftMass, makeStation, LEAK_LIMIT, LEAK_HOLD,
        jettisonStage, setOrbit } = G;
const S = G.S;
const out = G.lines;
const T = suite('DOCKING');
const ok = (n, c, x) => T.ok(n, c, x);
const tail = (n = 1) => out().slice(-n).join(' | ');

/** Put the vehicle on the corridor exactly, in the port's own rotating frame.
 *
 *  Inverts dockGeom: rates are specified as the player reads them, so a test
 *  that asks for 0.06 m/s closing gets 0.06 m/s closing at the interface. */
function place({ axial, lateral = 0, closing = 0, latRate = 0, align = 0 }) {
  const o = dockTarget();
  const stTheta = Math.atan2(o.v.y, o.v.x);
  const axis = { x: Math.cos(stTheta + Math.PI), y: Math.sin(stTheta + Math.PI) };
  const lat  = { x: -axis.y, y: axis.x };
  const wS = V.crs(o.r, o.v) / V.dot(o.r, o.r);
  const aKm = axial / 1000, lKm = lateral / 1000;
  S.att.mode = 'FREE'; S.att.rate = 0;
  S.att.theta = stTheta + align * Math.PI / 180;
  const nose = { x: Math.cos(S.att.theta), y: Math.sin(S.att.theta) };
  const Ps = V.add(o.r, V.mul(axis, PORT_ARM_STN));
  const Pc = V.add(Ps, V.add(V.mul(axis, aKm), V.mul(lat, lKm)));
  S.r = V.sub(Pc, V.mul(nose, PORT_ARM));
  const armS = V.mul(axis, PORT_ARM_STN);
  const Vs = V.add(o.v, V.mul({ x: -armS.y, y: armS.x }, wS));
  const dAx = -closing / 1000 - wS * lKm;
  const dLat = latRate / 1000 + wS * aKm;
  S.v = V.add(Vs, V.add(V.mul(axis, dAx), V.mul(lat, dLat)));
  derive();
}
/** The vehicle as its own ascent leaves it: launcher staged away, in orbit.
 *
 *  The sandbox begins at sea level now, and auto dock is an orbital skill.
 *  Flying the ascent is the launch suite's job; this suite only needs the
 *  vehicle the ascent hands back — spacecraft stage, full tanks, no pad. */
function orbitAfterAscent(altKm) {
  while (jettisonStage() === null) ;   // down to the spacecraft's own stage
  S.pad = null;
  S.fairing = false;                  // thrown away at 140 km on the way up
  setOrbit('EARTH', altKm, altKm, 0, 0);
  derive();
}
/** Run the clock until `done()`, in steps small enough for proximity work. */
const until = (done, lim = 6000) => { let n = 0; while (n++ < lim && !done()) advance(1); return n < lim; };
/** A fresh M-03 vehicle parked on the corridor. */
function corridor(opts) { loadMission(3); exec('WARP 1'); place(opts); return dockGeom(); }

/* ---------- 1. geometry ---------- */
console.log('\nPORT GEOMETRY');
corridor({ axial: 20 });
let g = dockGeom();
ok('the station port faces aft, up its own velocity vector',
   Math.abs(G.normAngle(g.axisAngle - Math.atan2(dockTarget().v.y, dockTarget().v.x) - Math.PI)) < 1e-9,
   (g.axisAngle * 180 / Math.PI).toFixed(1) + '°');
ok('placement is exact', Math.abs(g.axial - 20) < 1e-6 && Math.abs(g.lateral) < 1e-6,
   `${g.axial.toFixed(6)} m axial, ${g.lateral.toExponential(1)} m lateral`);

// The corridor rotates with the station. Reported rates must be the rates in
// that frame, or the numbers on the page do not describe what the offsets do.
corridor({ axial: 12, lateral: -0.4, closing: 0.05, latRate: 0.01 });
const a0 = dockGeom(); const ax0 = a0.axial, lt0 = a0.lateral;
advance(1);
const a1 = dockGeom();
ok('reported closing rate is the rate the axial range actually changes at',
   Math.abs((ax0 - a1.axial) - a0.closing) < 2e-3, `${(ax0 - a1.axial).toFixed(5)} vs ${a0.closing.toFixed(5)} m/s`);
ok('reported lateral rate is the rate the offset actually changes at',
   Math.abs((a1.lateral - lt0) - a0.latRate) < 2e-3, `${(a1.lateral - lt0).toFixed(5)} vs ${a0.latRate.toFixed(5)} m/s`);
ok('holding a fixed inertial velocity drifts you off the corridor',
   Math.abs(a0.wS * a0.axial) > 0.01,
   `${(a0.wS * a0.axial * 1000).toFixed(1)} mm/s at ${a0.axial.toFixed(0)} m — most of the ${DOCK_ENV.rateClean} m/s clean budget`);

/* ---------- 2. the step cannot jump the envelope ---------- */
console.log('\nSTEP SIZE');
corridor({ axial: 3, closing: 0.10 });
const big = [];
for (let i = 0; i < 400 && S.dock.phase === 'FREE'; i++) { const b = dockGeom(); big.push(b.axial); advance(30); }
ok('a 30 s clock call cannot step through the capture envelope', S.dock.phase !== 'FREE',
   `captured, ${S.dock.bounces} bounce(s), ${S.dock.offset.toFixed(3)} m off centre`);
ok('warp is held down inside 500 m', (loadMission(3), place({ axial: 40, closing: 0.1 }), exec('WARP 1000'), advance(1), S.warp <= 10),
   S.warp + '×');

/* ---------- 3. capture outcomes ---------- */
console.log('\nCAPTURE OUTCOMES');
corridor({ axial: 1.2, closing: 0.06 });
until(() => S.dock.phase !== 'FREE');
ok('a nominal approach captures cleanly', S.dock.phase === 'SOFT' && S.dock.misalign < DOCK_ENV.alignClean
   && S.dock.offset < DOCK_ENV.latClean, `${S.dock.misalign.toFixed(2)}°, ${S.dock.offset.toFixed(3)} m`);
ok('and says so', /SOFT CAPTURE · clean/.test(tail(2)), tail(1).slice(0, 60));

corridor({ axial: 1.2, closing: 0.30 });
until(() => S.dock.bounces > 0 || S.dock.phase !== 'FREE');
ok('too fast bounces off', S.dock.phase === 'FREE' && S.dock.bounces === 1, tail(1).slice(0, 70));
ok('and the bounce pushes the vehicle back out', dockGeom().closing < 0,
   `now ${fmtRate(dockGeom().closing)}`);
ok('a bounce costs no propellant and loses nothing', S.status === 'flight' && S.craft.rcs === 40, S.status);

corridor({ axial: 1.2, closing: 0.06, align: 15 });
until(() => S.dock.bounces > 0 || S.dock.phase !== 'FREE');
ok('badly misaligned does not capture', S.dock.phase === 'FREE' && S.dock.bounces === 1, tail(1).slice(0, 70));

// close in, so the sideways rate is still inside the ring when it arrives
corridor({ axial: 0.3, lateral: -0.15, closing: 0.12, latRate: 0.09 });
until(() => S.dock.bounces > 0 || S.dock.phase !== 'FREE');
ok('too much lateral rate bounces', S.dock.phase === 'FREE' && S.dock.bounces === 1, tail(1).slice(0, 60));

corridor({ axial: 1.2, lateral: 3, closing: 0.06 });
until(() => /PAST THE PORT/.test(tail(1)) || S.dock.phase !== 'FREE', 2000);
ok('wide of the ring is a fly-past, not a capture', S.dock.phase === 'FREE' && /PAST THE PORT/.test(tail(1)),
   tail(1).slice(0, 60));
// crossing the port PLANE far out during a rendezvous is not a fly-past
corridor({ axial: -2000, lateral: -1500, closing: 0.4 });
advance(5);
ok('crossing the port plane kilometres out says nothing', !/PAST THE PORT/.test(tail(3)), tail(1).slice(0, 50));

/* ---------- 4. a crooked capture is a crooked outcome ---------- */
console.log('\nCROOKED CAPTURE');
corridor({ axial: 1.2, closing: 0.06, align: 7 });
until(() => S.dock.phase !== 'FREE');
ok('a marginal alignment captures rather than failing', S.dock.phase === 'SOFT', S.dock.phase);
ok('it captures CROOKED, carrying the misalignment', S.dock.misalign > DOCK_ENV.alignClean,
   `${S.dock.misalign.toFixed(1)}° off axis`);
ok('and the console says the latches will not close on it', /CROOKED/.test(tail(2)), tail(2).slice(0, 70));
exec('DOCK LATCH');
ok('the latches refuse until the ring is home', S.dock.phase === 'SOFT' && /not home/.test(tail(1)), tail(1).slice(0, 50));
exec('DOCK RETRACT');
const crookedAt = S.t;
until(() => S.dock.phase === 'RETRACTED');
ok('retracting pulls the interface straight', S.dock.misalign < 0.01, S.dock.misalign.toFixed(4) + '°');
const crookedTook = S.t - crookedAt;
exec('DOCK LATCH');
until(() => S.dock.phase === 'HARD');
ok('then it hard docks', S.dock.phase === 'HARD' && S.dock.latches === 12, `${S.dock.latches}/12`);
// a clean capture should be quicker to straighten than a crooked one
corridor({ axial: 1.2, closing: 0.06 });
until(() => S.dock.phase !== 'FREE');
exec('DOCK RETRACT');
const cleanAt = S.t; until(() => S.dock.phase === 'RETRACTED');
ok('a sloppy capture costs real time to straighten', crookedTook > (S.t - cleanAt) * 1.5,
   `${crookedTook.toFixed(0)} s crooked vs ${(S.t - cleanAt).toFixed(0)} s clean`);

/* ---------- 5. mated behaviour ---------- */
console.log('\nWHILE MATED');
exec('DOCK LATCH'); until(() => S.dock.phase === 'HARD');
const rHold = { ...S.r };
advance(600);
const gm = dockGeom();
ok('the interface holds the vehicle on the port', Math.abs(gm.axial) < 1e-6 && Math.abs(gm.lateral) < 1e-6,
   `${gm.axial.toExponential(1)} m axial after 600 s`);
ok('and it is carried round the orbit, not left behind',
   V.len(V.sub(S.r, rHold)) > 100, V.len(V.sub(S.r, rHold)).toFixed(0) + ' km travelled');
exec('BURN PRO 10');
ok('the main engine is inhibited while mated', !S.burn && /inhibited/.test(tail(1)), tail(1).slice(0, 50));
exec('TRANS TGT 0.1');
ok('translation is inhibited while mated', /MATED/.test(tail(1)), tail(1).slice(0, 50));

/* ---------- 6. utilities refuse out of order ---------- */
console.log('\nUTILITY PROCEDURES');
ok('the hatch will not open onto vacuum', (exec('DOCK HATCH'), !S.dock.vest.hatch && /Leak check/.test(tail(1))), tail(1).slice(0, 50));
ok('a leak check needs pressure first', (exec('DOCK LEAK'), S.dock.vest.check < 0 && /equalise/i.test(tail(1))), tail(1).slice(0, 50));
ok('the bus tie needs an umbilical first', (exec('DOCK TIE'), !S.dock.pwr.tie && /umbilical/i.test(tail(1))), tail(1).slice(0, 50));
ok('the air duct needs an open hatch first', (exec('DOCK DUCT'), !S.dock.air.duct && /hatch/i.test(tail(1))), tail(1).slice(0, 50));
ok('the fan needs a duct first', (exec('DOCK FAN'), !S.dock.air.fan), tail(1).slice(0, 50));
ok('transfer needs a purged line first', (exec('DOCK XFER'), !S.dock.prop.xfer && /purged/.test(tail(1))), tail(1).slice(0, 50));

exec('DOCK EQUALISE');
ok('the vestibule pressurises on the clock, not instantly',
   (advance(10), S.dock.vest.press > 5 && S.dock.vest.press < 60), S.dock.vest.press.toFixed(1) + ' kPa after 10 s');
until(() => S.dock.vest.press >= 101);
ok('and reaches cabin pressure', S.dock.vest.press > 101, S.dock.vest.press.toFixed(1) + ' kPa');
exec('DOCK LEAK');
ok('the leak check closes the equalisation valve', !S.dock.vest.valve);
advance(20); exec('DOCK EQUALISE');
ok('reopening the valve aborts the leak check', S.dock.vest.check < 0 && /ABORTED/.test(tail(1)), tail(1).slice(0, 60));

/** Put the vestibule back up to cabin pressure, whatever state the valve is in.
 *  DOCK EQUALISE is a toggle, so firing it blind closed the valve about one run
 *  in six: a randomly bad seal on the first capture bleeds the vestibule below
 *  101.2 kPa during the twenty-second hold above, and the next step then waited
 *  for a pressure that was falling away from it. */
function reEqualise() { if (!S.dock.vest.valve) exec('DOCK EQUALISE'); }

/* ---- 6b. the leak check has a verdict worth waiting for ---- */
// The seal is rolled when the latches close, so the tests set it directly:
// the roll itself is checked statistically further down.
S.dock.vest.leak = 0.62;                                  // kPa/min — a seal that did not seat
reEqualise(); until(() => S.dock.vest.press >= 101.2);
exec('DOCK LEAK');
advance(8);
const early = S.dock.vest.decay * 60 / S.dock.vest.check;
ok('a bad seal is readable long before the verdict', early > LEAK_LIMIT * 2,
   `projected ${early.toFixed(2)} kPa after 8 s, limit ${LEAK_LIMIT.toFixed(2)}`);
until(() => S.dock.vest.verdict);
ok('and it fails, with the numbers and the limit stated', S.dock.vest.verdict === 'FAIL' && !S.dock.vest.leakOk,
   tail(1).slice(0, 72));
ok('the vestibule really lost that pressure', S.dock.vest.press < 101.3 - LEAK_LIMIT,
   S.dock.vest.press.toFixed(2) + ' kPa');
exec('DOCK HATCH');
ok('a failed check still keeps the hatch shut', !S.dock.vest.hatch, tail(1).slice(0, 45));
// re-running the check on the same seal must fail again — the seal is the problem
reEqualise(); until(() => S.dock.vest.press >= 101.2); exec('DOCK LEAK');
until(() => S.dock.vest.verdict);
ok('re-running the check on the same seal fails again', S.dock.vest.verdict === 'FAIL');
// re-seating is the fix, and it costs a vented vestibule and a second latch drive
const reseatAt = S.t;
exec('DOCK RESEAT');
ok('re-seating breaks the latches and vents the vestibule',
   S.dock.phase === 'RETRACT' && S.dock.vest.press === 0 && S.dock.reseats === 1, S.dock.phase);
until(() => S.dock.phase === 'RETRACTED');
exec('DOCK LATCH'); until(() => S.dock.phase === 'HARD');
ok('and the interface seats again', S.dock.phase === 'HARD' && S.dock.latches === 12,
   `${((S.t - reseatAt)).toFixed(0)} s to re-seat`);
ok('with a freshly rolled seal', S.dock.vest.leak !== 0.62, S.dock.vest.leak.toFixed(3) + ' kPa/min');
S.dock.vest.leak = 0.04;                                  // a good one this time
reEqualise(); until(() => S.dock.vest.press >= 101.2); exec('DOCK LEAK');
until(() => S.dock.vest.verdict);
ok('a good seal passes, with its margin stated', S.dock.vest.verdict === 'PASS' && S.dock.vest.leakOk,
   tail(1).slice(0, 62));
exec('DOCK HATCH');
ok('now the hatch opens', S.dock.vest.hatch);
ok('a failed seal is never a dead end', S.dock.phase === 'HARD' && S.status === 'flight');

// the stated failure rate: 1 in 6 after a clean capture, 1 in 2 at the 10° limit
{
  const sample = (mis) => { let f = 0; for (let i = 0; i < 4000; i++) {
    S.dock.misalign0 = mis; S.dock.phase = 'LATCHING'; S.dock.latches = 11.9;
    S.dock.vest.leak = 0; advance(1);
    if (S.dock.vest.leak * 1 > LEAK_LIMIT) f++;
    S.dock.phase = 'HARD';
  } return f / 4000; };
  const clean = sample(0), sloppy = sample(10);
  ok('a clean capture seats badly about 1 time in 6', clean > 0.12 && clean < 0.22,
     `${(clean*100).toFixed(1)}% over ${4000} seatings`);
  ok('a capture at the alignment limit seats badly about 1 time in 2', sloppy > 0.42 && sloppy < 0.58,
     `${(sloppy*100).toFixed(1)}%`);
  ok('so how well you fly the approach decides how much work follows it', sloppy > clean * 2,
     `${(clean*100).toFixed(0)}% vs ${(sloppy*100).toFixed(0)}%`);
}
// leave it hard docked with an open hatch for the sections that follow
S.dock.phase = 'HARD'; S.dock.latches = 12; S.dock.misalign = 0;
S.dock.vest.leak = 0.04; S.dock.vest.leakOk = true; S.dock.vest.verdict = 'PASS';
S.dock.vest.press = 101.3; S.dock.vest.hatch = true;

/* ---------- 7. the power tie has to be worth pressing ---------- */
console.log('\nPOWER TIE');
S.loads.SCI = true; S.power.batt = 400;
until(() => G.D.ecl, 6000);                       // wait for eclipse, where the battery carries the load
const b0 = S.power.batt;
advance(300);
const drain = (b0 - S.power.batt) / 300 * 3600;
ok('in eclipse the battery is carrying the vehicle', drain > 100, drain.toFixed(0) + ' W drawn from the battery');
exec('DOCK UMB'); exec('DOCK TIE');
ok('the bus tie closes', S.dock.pwr.tie && G.D.tie > 0, G.D.tie.toFixed(0) + ' W from the station');
const b1 = S.power.batt;
advance(300);
ok('and the battery stops draining', S.power.batt >= b1, `${b1.toFixed(0)} → ${S.power.batt.toFixed(0)} Wh`);
ok('it charges instead', S.power.batt > b1, '+' + (S.power.batt - b1).toFixed(1) + ' Wh');

/* ---------- 8. ECLSS has to be worth pressing too ---------- */
console.log('\nECLSS');
// The loop is regenerative (item 05): with ECLSS running the reserve does not
// move. Stop it and the crew are on the tank — which is what the station's air
// then takes back over.
exec('STOP ECLSS');
const o2a = S.craft.o2; advance(3600);
ok('with the loop down the crew draw on their own reserve', S.craft.o2 < o2a,
   `${o2a.toFixed(1)} → ${S.craft.o2.toFixed(1)} crew-hours in an hour with ${S.craft.crew} aboard`);
exec('DOCK DUCT'); exec('DOCK FAN');
const o2b = S.craft.o2; advance(3600);
ok('with the station breathing for them it stops', S.craft.o2 === o2b, S.craft.o2.toFixed(1) + ' crew-hours');

/* ---------- 9. propellant transfer ---------- */
console.log('\nPROPELLANT TRANSFER');
// This vehicle was placed on the corridor rather than flown there, so its
// tanks are still full. Draw them down to what a real arrival looks like.
S.craft.fuel = 400; S.craft.rcs = 22;
const fuel0 = S.craft.fuel;
exec('DOCK LINE');
ok('the line purges before it will flow', !S.dock.prop.purged);
until(() => S.dock.prop.purged);
exec('DOCK TIE');                                  // open the tie: the pumps lose power
exec('DOCK XFER');
ok('the pumps refuse without the station bus', !S.dock.prop.xfer && /bus tie/.test(tail(1)), tail(1).slice(0, 50));
exec('DOCK TIE'); exec('DOCK XFER');
ok('with power it flows', S.dock.prop.xfer);
until(() => !S.dock.prop.xfer, 20000);
ok('and fills the tanks', S.craft.fuel >= S.craft.fuelMax - 0.01 && S.craft.rcs >= S.craft.rcsMax - 0.01,
   `${fuel0.toFixed(1)} → ${S.craft.fuel.toFixed(1)} kg main, RCS ${S.craft.rcs.toFixed(1)} kg, ${S.dock.prop.moved.toFixed(1)} kg moved`);
ok('a full vehicle is told there is nothing to move', (S.dock.prop.done = false,
   exec('DOCK XFER'), S.dock.prop.done && /ALREADY FULL/.test(tail(1))), tail(1).slice(0, 45));
ok('all four utilities now read connected', utilitiesDone());
ok('M-03 is complete', S.completed, `${S.objectives.filter(o => o.done).length}/4 objectives`);

/* ---------- 10. departure ---------- */
console.log('\nDEPARTURE');
exec('DOCK UNDOCK');
ok('undocking returns the vehicle to free flight', S.dock.phase === 'FREE' && !S.dock.pwr.tie && !S.dock.vest.hatch);
ok('and pushes it off the port', dockGeom().closing < 0, fmtRate(dockGeom().closing));
until(() => dockGeom().axial > 5, 3000);
ok('it drifts clear of the corridor', dockGeom().axial > 5, fmtRange(dockGeom().axial));
exec('BURN PRO 5');
ok('the main engine is available again', !!S.burn || S.ledger.burns > 0);

/* ---------- 11. running dry is a drift, not a loss ---------- */
console.log('\nOUT OF PROPELLANT');
corridor({ axial: 30, closing: 0.05 });
S.craft.rcs = 0;
exec('TRANS TGT 0.5');
ok('an empty RCS tank refuses the pulse', /RCS remains/.test(tail(1)), tail(1).slice(0, 50));
advance(600);
ok('and the vehicle is still flying, just drifting', S.status === 'flight' && !S.completed, S.status);

/* ---------- 12. auto dock ---------- */
console.log('\nAUTO DOCK');
loadMission(3); exec('WARP 1'); place({ axial: 25, lateral: 4, closing: 0 });
exec('DOCK AUTO');
ok('M-03 does not offer auto dock — the skill is learned by hand once',
   !S.dock.auto && /not fitted to this vehicle/.test(tail(1)), tail(1).slice(0, 60));
G.gotoPage('DOCK'); G.renderCDU();
const autoFld = G.CURRENT.map(r => [r.l, r.r].map(f => f ? f.lab + ' ' + f.val : '').join(' ')).join(' ');
ok('and the page says the same thing the command does', /Auto dock NOT FITTED/.test(autoFld),
   (autoFld.match(/Auto dock [A-Z ]+/) || ['none'])[0]);

// Free flight starts cold and dark on the pad now, so the sandbox has to be woken up
// before it can fly anything. PWR UP runs the real sequence at real speed.
loadMission(0); exec('PWR UP');
for (let i = 0; i < 900 && S.pwrUp; i++) advance(1);
ok('free flight wakes from a cold start', G.SYSIDS.every(id => !G.sysFitted(id) || G.sysOn(id)),
   'powered up in ' + (S.t / 60).toFixed(1) + ' min');
orbitAfterAscent(400);
ok('and the ascent hands back the spacecraft, not the launcher',
   S.craft.stageName === 'TESTBED' && !S.pad, `${S.craft.stageName}, ${rcsDV().toFixed(0)} m/s RCS`);
exec('WARP 1'); exec('TGT STATION');
ok('free flight has a station to dock with', !!dockTarget());
place({ axial: -40, lateral: 30, closing: 0 });
exec('DOCK AUTO');
ok('and the vehicle is fitted with auto dock', S.dock.auto);
const rcsA = rcsDV(), tA = S.t;
until(() => S.dock.phase !== 'FREE', 20000);
ok('auto dock flies the corridor to capture', S.dock.phase !== 'FREE',
   `${((S.t - tA) / 60).toFixed(1)} min, ${S.dock.bounces} bounce(s)`);
ok('and captures cleanly', S.dock.misalign < DOCK_ENV.alignClean && S.dock.offset < DOCK_ENV.latClean,
   `${S.dock.misalign.toFixed(2)}°, ${S.dock.offset.toFixed(3)} m off centre`);
ok('spending a sane amount of RCS', rcsA - rcsDV() < 15, (rcsA - rcsDV()).toFixed(2) + ' m/s');
ok('auto dock uses the attitude autopilot, not magic', S.att.mode === 'FREE' || S.att.mode === 'PAXS', S.att.mode);

/* ---------- 13. the numbers have to be readable ---------- */
console.log('\nREADOUTS');
ok('metres resolve to centimetres up close', fmtRange(0.15) === '0.15 m' && fmtRange(0.25) === '0.25 m',
   `${fmtRange(0.15)} / ${fmtRange(0.25)}`);
ok('rates resolve to millimetres per second', fmtRate(0.03) === '0.030 m/s' && fmtRate(0.15) === '0.150 m/s',
   `${fmtRate(0.03)} / ${fmtRate(0.15)}`);
ok('the old formatters could not tell those apart',
   G.fmtDist(0.00015) === G.fmtDist(0.00025) && G.fmtVel(0.00003) === '0.0 m/s',
   `${G.fmtDist(0.00015)} = ${G.fmtDist(0.00025)}, ${G.fmtVel(0.00003)}`);

/* ---------- 14. the pages ---------- */
console.log('\nPAGES');
loadMission(3); place({ axial: 20, lateral: 0.5, closing: 0.08 });
G.gotoPage('DOCK'); G.renderCDU();
const dockTxt = G.CURRENT.map(r => [r.l, r.r, r.full].map(f => f ? f.lab + ' ' + f.val : '').join(' ')).join(' | ');
ok('the approach page shows axial range, offset and alignment',
   /Axial range/.test(dockTxt) && /Off centre/.test(dockTxt) && /Nose off axis/.test(dockTxt));
ok('and names the leg the guidance law is flying', /IN THE CORRIDOR|CLOSE IN|FINAL|CENTRE UP/.test(dockTxt),
   (dockTxt.match(/IN THE CORRIDOR|CLOSE IN|FINAL|CENTRE UP|GO ASTERN|MOVE CLEAR/) || ['none'])[0]);
G.gotoPage('UTIL'); G.renderCDU();
ok('utilities are inhibited before a hard dock',
   G.CURRENT.some(r => r.l && /INHIBITED/.test(r.l.val) || r.r && /INHIBITED/.test(r.r.val)));

T.done('docking: all checks passed');
