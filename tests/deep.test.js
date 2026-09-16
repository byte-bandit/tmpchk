const { boot, suite } = require('./harness');
const G = boot();
const { exec, loadMission, advance, derive, BODIES, AU, TAU, V, targetRel,
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
// final approach on RCS
if (t3 && V.len(t3.r) < 60) {
  let n=0;
  while(n++<4000 && S.status==='flight'){
    const t=targetRel(); if(!t) break;
    const rng=V.len(t.r)*1000, rel=V.len(t.v)*1000;
    const closing=-V.dot(V.unit(t.r),t.v)*1000;
    if(rng<20 && rel<0.30) break;
    if(rel>0.05 && (closing<0 || closing > Math.max(0.25, rng/100))) exec('TRANS NULL');
    else if(rng>25) exec('TRANS TGT '+Math.min(2, Math.max(0.12, rng/140)).toFixed(3));
    for(let q=0;q<40;q++) advance(1);
  }
  const tf=targetRel();
  ok('docked', S.objectives[1].done, tf?('range '+(V.len(tf.r)*1000).toFixed(1)+' m  rel '+(V.len(tf.v)*1000).toFixed(3)+' m/s  RCS left '+S.craft.rcs.toFixed(1)+' kg'):'-');
  ok('M-03 complete', S.completed);
}
T.done();
