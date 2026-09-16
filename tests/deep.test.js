const { boot, suite } = require('./harness');
const G = boot();
const { exec, loadMission, advance, derive, BODIES, AU, TAU, V, targetRel, dockGeom,
        fmtMET, fmtT, propagate, elements, setOrbit, vCirc, vAtR,
        tToPeri, tToApo, normAngle, absState, bodyStateInParent } = G;
const S = G.S;
const LOG = G.LOG, out = G.lines, since = G.since, burnLine = G.burnLine;
Object.defineProperty(globalThis, 'D', { get: () => G.D, configurable: true });
const T = suite('DEEP MISSIONS');
const ok = (n, c, x) => T.ok(n, c, x);
let fails = 0;

const D = () => G.D;

/* ---------- M-04 LUNAR FLYBY ---------- */
console.log('\nM-04 LUNAR FLYBY');
loadMission(4);
exec('PLAN XFER MOON');
const b4=burnLine();
ok('PLAN solves a targeted encounter', /AT T\+/.test(b4||''), b4);
exec(b4); exec('WARP 2000');
let g4=0; while(g4++<400000 && S.status==='flight'){ advance(0.25*Math.max(S.warp,1));
  if(S.flags.lunarSOI && S.soi==='EARTH') break; if(S.warp===0) break; }
ok('entered the Moon\'s SOI', S.flags.lunarSOI);
ok('survived the flyby', S.status==='flight');
ok('M-04 complete', S.completed, 'MET '+fmtMET(S.t));

/* ---------- M-05 LUNAR ORBIT ---------- */
console.log('\nM-05 LUNAR ORBIT');
loadMission(5);
exec('PLAN XFER MOON'); exec(burnLine()); exec('WARP 2000');
let g5=0; while(g5++<400000 && S.status==='flight' && S.soi!=='MOON'){ advance(0.25*Math.max(S.warp,1)); if(S.warp===0)break; }
ok('reached the Moon', S.soi==='MOON', 'ref '+S.soi);
if(S.soi==='MOON'){
  ok('arrives hyperbolic', D().e.e>1, 'e='+D().e.e.toFixed(3)+'  peri '+D().perAlt.toFixed(0)+' km');
  exec('WARP 20'); exec('PLAN CIRC PE');
  const b5=burnLine(); ok('PLAN offers a capture burn', !!b5, b5);
  exec(b5);
  let g=0; while(g++<600000 && S.status==='flight' && S.soi==='MOON' && (S.sched||S.burn)) advance(0.25*Math.max(S.warp,1));
  let gg=0; while(gg++<20000 && S.status==='flight') advance(1);
  ok('captured into lunar orbit', S.soi==='MOON' && D().e.e<1,
     `e=${D().e.e.toFixed(4)}  ${D().perAlt.toFixed(0)}x${D().apoAlt.toFixed(0)} km`);
  ok('M-05 complete', S.completed);
}

/* ---------- M-06 TRANQUILLITY ---------- */
console.log('\nM-06 TRANQUILLITY  (powered descent)');
loadMission(6);
ok('landing mode armed by the mission', S.landingAllowed===true);
exec('PLAN PERI 15'); exec(burnLine()); exec('WARP 50');
let g6=0; while(g6++<400000 && S.status==='flight' && (S.sched||S.burn)) advance(0.25*Math.max(S.warp,1));
ok('periapsis dropped', S.objectives[0].done, 'peri '+D().perAlt.toFixed(1)+' km');
exec('WARP 20');
g6=0; while(g6++<400000 && S.status==='flight' && D().tPeri>4) advance(0.25*Math.max(S.warp,1));
exec('WARP 1');
g6=0;
while(g6++<300000 && S.status==='flight'){
  const alt=D().alt*1000, vert=-D().e.vr*1000, lat=Math.abs(V.crs(V.unit(S.r),S.v))*1000;
  if(lat>8){ if(!S.burn) exec('BURN RET 400'); }
  else { const want=Math.max(1.2, alt/22);
    if(!S.burn && vert>want+1.5) exec('BURN RET 12');
    if(S.burn && vert<want-0.5) exec('CANCEL'); }
  advance(0.2);
}
ok('M-06 touchdown', S.status==='landed',
   'status '+S.status+'  vert '+(-D().e.vr*1000).toFixed(2)+' m/s  fuel left '+S.craft.fuel.toFixed(0)+' kg');
ok('M-06 complete', S.completed);

/* ---------- M-08 RED PLANET ---------- */
console.log('\nM-08 RED PLANET');
loadMission(8);
exec('PLAN XFER MARS');
const b8=burnLine();
ok('PLAN XFER MARS produces a plan', !!b8, b8);
exec(b8); exec('WARP 1000000');
let g8=0; while(g8++<600000 && S.status==='flight' && S.soi!=='MARS'){ advance(0.25*Math.max(S.warp,1)); if(S.warp===0)break; if(S.t>6*365*86400)break; }
ok('injection executed', S.ledger.burns>0, 'dV '+S.ledger.dvUsed.toFixed(0)+' m/s');
ok('aphelion raised to Mars', S.objectives[0].done, 'aph '+(D().e.ra/AU).toFixed(3)+' AU');
ok('reached Mars SOI', S.soi==='MARS', 'ref '+S.soi+'  MET '+fmtMET(S.t));
if(S.soi==='MARS'){
  ok('arrives hyperbolic at Mars', D().e.e>1, 'e='+D().e.e.toFixed(3)+'  peri '+D().perAlt.toFixed(0)+' km');
  exec('WARP 100'); exec('PLAN CIRC PE'); const bm=burnLine(); if(bm) exec(bm);
  let g=0; while(g++<600000 && S.status==='flight' && (S.sched||S.burn)) advance(0.25*Math.max(S.warp,1));
  ok('captured into Mars orbit', S.soi==='MARS' && D().e.e<1, `e=${D().e.e.toFixed(4)} ${D().perAlt.toFixed(0)}x${D().apoAlt.toFixed(0)} km`);
  ok('M-08 complete', S.completed);
}

/* ---------- M-03 RENDEZVOUS & DOCK ---------- */
console.log('\nM-03 RENDEZVOUS & DOCK');
loadMission(3);
ok('station present and targeted', S.target==='STATION' && !!targetRel());
exec('PLAN RDV');
const b3=burnLine();
ok('PLAN RDV emits a timed burn', /AT T\+/.test(b3||''), b3);
exec(b3); exec('WARP 200');
let g3=0; while(g3++<800000 && S.status==='flight' && (S.sched||S.burn)) advance(0.25*Math.max(S.warp,1));
ok('phasing burn executed', S.ledger.burns>0, 'dV '+S.ledger.dvUsed.toFixed(1)+' m/s');
exec('WARP 100');
exec('PLAN CIRC AP'); const c3=burnLine(); if(c3) exec(c3);
let g5b=0; while(g5b++<800000 && S.status==='flight' && (S.sched||S.burn)) advance(0.25*Math.max(S.warp,1));
const t3=targetRel();
ok('arrived near the station', t3 && V.len(t3.r) < 60,
   t3?('range '+V.len(t3.r).toFixed(2)+' km  relV '+(V.len(t3.v)*1000).toFixed(1)+' m/s'):'lost');

/* The terminal approach is flown by the vehicle's own guidance law. M-03 does
 * not offer the AUTO DOCK key to the player, so the test drives dockGuide()
 * directly: same control law, exercised step by step. There is deliberately no
 * second controller here to drift out of step with the one that ships. */
if (t3 && V.len(t3.r) < 60) {
  const g0 = dockGeom();
  ok('rendezvous leaves the vehicle OFF the corridor', g0.axial < 0 || Math.abs(g0.lateral) > 10,
     `${g0.axial.toFixed(1)} m astern, ${g0.lateral.toFixed(1)} m across, ${g0.corridor.toFixed(0)}° off axis`);
  exec('WARP 1'); exec('HOLD DOCK');
  const rcs0 = G.rcsDV(), tStart = S.t;
  const legs = [];
  let n=0;
  while(n++<20000 && S.status==='flight' && S.dock.phase==='FREE'){
    const q = dockGeom(); if(!q) break;
    const c = G.dockGuide(q, S.dock.leg);
    if (legs[legs.length-1] !== c.leg) legs.push(c.leg);
    if (G.attError() < 2*Math.PI/180) {
      if (c.axial)   G.rcsPulse(V.mul(q.axis, -Math.sign(c.axial)),   Math.abs(c.axial));
      if (c.lateral) G.rcsPulse(V.mul(q.lat,   Math.sign(c.lateral)), Math.abs(c.lateral));
    }
    advance(2);
  }
  const mins = (S.t-tStart)/60, spent = rcs0 - G.rcsDV();
  ok('the guidance law flies a box round onto the axis', legs.join('>').includes('CENTRE'), legs.join(' > '));
  ok('soft capture', S.dock.phase!=='FREE', `after ${mins.toFixed(1)} min, ${S.dock.bounces} bounce(s)`);
  ok('and it is a clean one', S.dock.misalign < 4 && S.dock.offset < 0.10,
     `${S.dock.misalign.toFixed(2)}° off axis, ${S.dock.offset.toFixed(3)} m off centre`);
  ok('approach fits the 5-8 minute budget', mins < 10, mins.toFixed(1)+' min');
  ok('approach fits the RCS budget', spent < rcs0*0.5,
     `spent ${spent.toFixed(2)} m/s of ${rcs0.toFixed(2)}, ${G.rcsDV().toFixed(2)} left`);

  // hard dock
  exec('DOCK RETRACT');
  let h=0; while(h++<4000 && S.dock.phase!=='RETRACTED') advance(1);
  exec('DOCK LATCH');
  h=0; while(h++<4000 && S.dock.phase!=='HARD') advance(1);
  ok('ring retracts and the latches close', S.dock.phase==='HARD' && S.dock.latches===12,
     `${S.dock.phase}  ${S.dock.latches}/12  misalign ${S.dock.misalign.toFixed(2)}°`);
  ok('hard dock meets objective 3', S.objectives[2].done);

  // utilities, in order
  exec('DOCK EQUALISE');
  h=0; while(h++<4000 && S.dock.vest.press < 101) advance(1);
  exec('DOCK LEAK');
  h=0; while(h++<4000 && !S.dock.vest.leakOk) advance(1);
  exec('DOCK HATCH');
  exec('DOCK UMB'); exec('DOCK TIE');
  exec('DOCK DUCT'); exec('DOCK FAN');
  exec('DOCK LINE');
  h=0; while(h++<4000 && !S.dock.prop.purged) advance(1);
  exec('DOCK XFER');
  h=0; while(h++<20000 && S.dock.prop.xfer) advance(1);
  ok('all four utilities connect', G.utilitiesDone(),
     `hatch ${S.dock.vest.hatch}  tie ${S.dock.pwr.tie}  fan ${S.dock.air.fan}  prop ${S.dock.prop.moved.toFixed(1)} kg`);
  ok('M-03 complete', S.completed, `MET ${fmtMET(S.t)}  RCS left ${S.craft.rcs.toFixed(1)} kg`);
}
T.done();
