const { boot, suite } = require('./harness');
const G = boot();
const { exec, loadMission, advance, derive, BODIES, AU, TAU, V, targetRel,
        fmtMET, fmtT, propagate, elements, setOrbit, vCirc, vAtR,
        tToPeri, tToApo, normAngle, absState, bodyStateInParent } = G;
const S = G.S;
const LOG = G.LOG, out = G.lines, since = G.since, burnLine = G.burnLine;
Object.defineProperty(globalThis, 'D', { get: () => G.D, configurable: true });
const T = suite('MISSIONS — END TO END');
/** advance `seconds` of wall-clock at the current warp */
function runFor(seconds, step = 0.25) {
  let t = 0;
  while (t < seconds && S.status === 'flight') {
    advance(step * S.warp); t += step;
    if (S.warp === 0) break;
  }
}
const ok = (n, c, x) => T.ok(n, c, x);
let fails = 0;

/* ---------- M-01: coast to apoapsis, circularize ---------- */
console.log('\nM-01 ORBITAL INSERTION');
loadMission(1);
ok('mission loaded', S.mission.id===1 && S.status==='flight');
ok('starts on an impact trajectory', D.perAlt < 0, 'peri '+D.perAlt.toFixed(0)+' km');
exec('PLAN CIRC AP');
const b1 = burnLine();
ok('PLAN emits a runnable BURN line', !!b1, b1);
exec(b1);
ok('burn armed for apoapsis', !!S.sched && S.sched.at==='AP');
exec('WARP 50');
runFor(400);
ok('engine fired automatically at the node', S.ledger.burns>0 || !!S.burn);
S.warp=10; runFor(200);
ok('M-01 objective 1 met (periapsis raised)', S.objectives[0].done, 'peri '+D.perAlt.toFixed(1)+' km');
ok('M-01 complete', S.completed, `e=${D.e.e.toFixed(4)} ${D.perAlt.toFixed(0)}x${D.apoAlt.toFixed(0)} km`);
ok('M-01 left propellant to spare', S.craft.fuel>0, S.craft.fuel.toFixed(0)+' kg');

/* ---------- M-02: two-burn Hohmann ---------- */
console.log('\nM-02 HIGH GROUND');
loadMission(2);
const startAlt = D.alt;
exec('PLAN APO 1000');
const b2 = burnLine();
ok('PLAN APO emits a burn', !!b2, b2);
exec(b2); exec('WARP 20'); runFor(600);
ok('apoapsis raised to ~1000 km', S.objectives[0].done, 'apo '+D.apoAlt.toFixed(0)+' km');
exec('PLAN CIRC AP');
const b3 = burnLine();
exec(b3); exec('WARP 20'); runFor(900);
ok('M-02 complete after the second burn', S.completed,
   `${D.perAlt.toFixed(0)}x${D.apoAlt.toFixed(0)} km  e=${D.e.e.toFixed(4)}  used ${S.ledger.dvUsed.toFixed(0)} m/s`);

/* ---------- M-07: escape to solar orbit (SOI transition) ---------- */
console.log('\nM-07 OUTBOUND  (SOI patching)');
loadMission(7);
exec('PLAN ESC');
const b7 = burnLine();
exec(b7); exec('WARP 100'); runFor(400);
ok('reached escape trajectory', S.objectives[0].done || D.e.e>=1, 'e='+D.e.e.toFixed(3));
exec('WARP 10000'); runFor(900);
ok('crossed into solar orbit', S.soi==='SUN', 'ref '+S.soi+'  MET '+fmtMET(S.t));
ok('M-07 complete', S.completed);
ok('heliocentric orbit is sane', S.soi==='SUN' && D.e.r>0.9*AU && D.e.r<1.1*AU, (D.e.r/AU).toFixed(3)+' AU');

/* ---------- M-09: thermal kill, then the fix ---------- */
console.log('\nM-09 SUNDIVE  (hazard model)');
loadMission(9);
exec('WARP 1000000'); runFor(3000);
ok('unmanaged dive destroys the vehicle', S.status==='lost', 'hull peaked '+S.therm.hull.toFixed(0)+' °C');
loadMission(9);
exec('PLAN PERI ' + Math.round(0.26*AU - BODIES.SUN.R));
const b9 = burnLine();
ok('PLAN PERI emits a burn', !!b9, b9);
exec(b9); exec('WARP 20000'); runFor(2500);
ok('perihelion raised', S.objectives[0].done, 'peri '+(D.e.rp/AU).toFixed(3)+' AU');
exec('WARP 500000'); runFor(4000);
ok('survives the passage', S.status!=='lost', 'hull '+S.therm.hull.toFixed(0)+' °C, limit '+S.thermLimit);
ok('M-09 complete', S.completed);

/* ---------- regression: unreachable target must not blame fuel ---------- */
console.log('\nPLANNER GUARDS');
{
  const bl2=()=>{const m=out().filter(l=>/^\s*→\s*BURN /.test(l)).pop();return m?m.replace(/^\s*→\s*/,''):null;};
  loadMission(2);
  exec('PLAN APO 1000'); exec(bl2()); exec('WARP 20');
  let q=0; while(q++<400000 && S.status==='flight' && (S.sched||S.burn)) advance(0.25*Math.max(S.warp,1));
  const apo = globalThis.__G.D.apoAlt, dvLeft = globalThis.__G.D.dv;
  const mark = out().length;
  exec('PLAN PERI 1000');                       // 1.2 km above apoapsis: impossible
  const txt = since(mark).join('\n');
  ok('periapsis above apoapsis is refused', /cannot lift the point/.test(txt), 'apo '+apo.toFixed(1)+' km');
  ok('does NOT blame propellant', !/propellant runs out|not enough propellant/i.test(txt),
     'dV left '+dvLeft.toFixed(0)+' m/s');
  ok('points at the command that works', /PLAN CIRC AP/.test(txt));
  // and that command must actually finish the mission
  exec('PLAN CIRC AP'); exec(bl2()); exec('WARP 20');
  q=0; while(q++<400000 && S.status==='flight' && (S.sched||S.burn)) advance(0.25*Math.max(S.warp,1));
  ok('PLAN CIRC AP completes M-02 from that state', S.completed,
     `${globalThis.__G.D.perAlt.toFixed(1)}x${globalThis.__G.D.apoAlt.toFixed(1)} km`);
  // a genuinely fuel-limited target must still say so
  const mark2 = out().length;
  exec('PLAN APO 400000');
  ok('a real fuel shortfall still reports propellant',
     /not enough propellant|INSUFFICIENT PROPELLANT/i.test(since(mark2).join('\n')));
}

/* ---------- command surface smoke test ---------- */
console.log('\nCOMMAND SURFACE');
loadMission(0);
// Free flight boots dark; wake it so the surface below is exercised against a
// live vehicle rather than ten refusals. The dark surface has its own suite.
exec('PWR UP');
for (let i = 0; i < 900 && S.pwrUp; i++) advance(1);
const before = out().length;
for (const c of ['HELP','HELP ORBIT','HELP BURN','HELP DOCK','STAT','NAV','PWR','FUEL','COMM','THERM','LIFE',
                 'MIS','LOG','TIME','PLAN','PLAN CIRC AP','PLAN CIRC PE','PLAN APO 5000','PLAN PERI 300',
                 'PLAN ESC','PLAN XFER MOON','PLAN XFER MARS','TGT MOON','NAV','HOLD RET','WARP 100','WARP UP',
                 'CANCEL','PWR SCI ON','PWR HEAT OFF','SYS','BOGUS','BURN','BURN PRO','PLAN XFER PLUTO','TRANS TGT 1'])
  { try { exec(c); } catch(e){ ok('command "'+c+'" threw', false, e.message); } }
const errs = since(before).filter(l=>/Console fault|undefined|NaN|\[object/.test(l));
ok('no faults or NaN across the command surface', errs.length===0, errs.slice(0,3).join(' | '));
ok('unknown commands are rejected cleanly', since(before).some(l=>/Unrecognised command "BOGUS"/.test(l)));

T.done();
