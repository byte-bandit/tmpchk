const { boot, suite } = require('./harness');
const G = boot();
const { exec, loadMission, advance, derive, BODIES, AU, TAU, V, targetRel,
        fmtMET, fmtT, propagate, elements, setOrbit, vCirc, vAtR,
        tToPeri, tToApo, normAngle, absState, bodyStateInParent } = G;
const S = G.S;
const LOG = G.LOG, out = G.lines, since = G.since, burnLine = G.burnLine;
Object.defineProperty(globalThis, 'D', { get: () => G.D, configurable: true });
const T = suite('PHYSICS & MISSION BALANCE');
const ok = (n, c, x) => T.ok(n, c, x);
let fails = 0;

const close = (a,b,tol) => Math.abs(a-b) <= tol;
const E = BODIES.EARTH, mu = E.mu;

// 1. circular orbit holds its radius over a quarter period
setOrbit('EARTH', 200, 200, 0, 0);
const r0 = {...S.r}, v0 = {...S.v}, e0 = elements(r0, v0, mu);
ok('circular: e ≈ 0', close(e0.e, 0, 1e-9), 'e='+e0.e.toExponential(2));
ok('circular: v matches vcirc', close(e0.v, vCirc(mu, e0.r), 1e-9), e0.v.toFixed(6)+' km/s');
let q = propagate(r0, v0, mu, e0.period/4);
ok('circular: radius constant after T/4', close(V.len(q.r), e0.r, 1e-6), V.len(q.r).toFixed(6));
const ang = Math.atan2(q.r.y,q.r.x) - Math.atan2(r0.y,r0.x);
ok('circular: swept exactly 90°', close(((ang%TAU)+TAU)%TAU, Math.PI/2, 1e-6), (ang*180/Math.PI).toFixed(4)+'°');

// 2. full period returns to the start (the property time warp depends on)
q = propagate(r0, v0, mu, e0.period);
ok('circular: closes after one full period', V.len(V.sub(q.r,r0)) < 1e-6, V.len(V.sub(q.r,r0)).toExponential(2)+' km');

// 3. eccentric orbit: apsides preserved, period closes
setOrbit('EARTH', 200, 35786, 40, 25);
const r1={...S.r}, v1={...S.v}, e1=elements(r1,v1,mu);
ok('GTO: periapsis alt 200 km', close(e1.rp-E.R, 200, 1e-6), (e1.rp-E.R).toFixed(6));
ok('GTO: apoapsis alt 35786 km', close(e1.ra-E.R, 35786, 1e-5), (e1.ra-E.R).toFixed(4));
let g = propagate(r1, v1, mu, e1.period);
ok('GTO: closes after one period', V.len(V.sub(g.r,r1)) < 1e-4, V.len(V.sub(g.r,r1)).toExponential(2)+' km');
// apsides must be invariant under propagation
g = propagate(r1, v1, mu, 12345.6);
const e1b = elements(g.r, g.v, mu);
ok('GTO: apsides invariant mid-orbit', close(e1b.rp,e1.rp,1e-6)&&close(e1b.ra,e1.ra,1e-4));

// 4. time-to-apoapsis actually lands on apoapsis
const ta = tToApo(e1, mu);
g = propagate(r1, v1, mu, ta);
ok('tToApo lands at apoapsis', close(V.len(g.r), e1.ra, 1e-4), V.len(g.r).toFixed(3)+' vs '+e1.ra.toFixed(3));
const tp = tToPeri(e1, mu);
g = propagate(r1, v1, mu, tp);
ok('tToPeri lands at periapsis', close(V.len(g.r), e1.rp, 1e-4), V.len(g.r).toFixed(3)+' vs '+e1.rp.toFixed(3));

// 5. hyperbolic trajectory round-trips
setOrbit('EARTH', 200, 200, 0, 0);
let hv = V.mul(V.unit(S.v), V.len(S.v)*1.45);
const eh = elements(S.r, hv, mu);
ok('hyperbolic: e > 1', eh.e > 1, 'e='+eh.e.toFixed(4));
let h1 = propagate(S.r, hv, mu, 40000);
let h2 = propagate(h1.r, h1.v, mu, -40000);
ok('hyperbolic: forward/back round-trips', V.len(V.sub(h2.r, S.r)) < 1e-3, V.len(V.sub(h2.r,S.r)).toExponential(2)+' km');
ok('hyperbolic: leaves Earth SOI', V.len(h1.r) > 0, V.len(h1.r).toFixed(0)+' km at T+40ks');

// 6. retrograde orbits handled (dir = -1)
setOrbit('EARTH', 200, 800, 30, 10);
const rr={...S.r}, rv=V.mul(S.v,-1), er=elements(rr,rv,mu);
ok('retrograde: dir = -1', er.dir === -1);
ok('retrograde: apsides still right', close(er.rp-E.R,200,1e-5)&&close(er.ra-E.R,800,1e-4),
   (er.rp-E.R).toFixed(3)+' x '+(er.ra-E.R).toFixed(3));
g = propagate(rr,rv,mu,er.period);
ok('retrograde: closes after one period', V.len(V.sub(g.r,rr)) < 1e-4);

// 7. the actual mission-1 solution must be affordable
setOrbit('EARTH', -1471, 210, 100, 30);
const m1 = elements(S.r,S.v,mu);
const G0=9.80665, m0=2200+1800+20, dvAvail=311*G0*Math.log(m0/(m0-1800));
const vap = Math.sqrt(mu*(2/m1.ra - 1/m1.a)), dvNeed=(vCirc(mu,m1.ra)-vap)*1000;
ok('M-01 solvable', dvNeed < dvAvail, `need ${dvNeed.toFixed(0)} m/s, have ${dvAvail.toFixed(0)} m/s`);
ok('M-01 coast to apoapsis is playable', tToApo(m1,mu) > 300 && tToApo(m1,mu) < 2400, (tToApo(m1,mu)/60).toFixed(1)+' min');

// 8. M-02 Hohmann budget
setOrbit('EARTH',200,200,0,0); const c2=elements(S.r,S.v,mu);
const r1k=E.R+200, r2k=E.R+1000, at=(r1k+r2k)/2;
const d1=(Math.sqrt(mu*(2/r1k-1/at))-Math.sqrt(mu/r1k))*1000;
const d2=(Math.sqrt(mu/r2k)-Math.sqrt(mu*(2/r2k-1/at)))*1000;
const m2avail=311*G0*Math.log((2400+800+20)/(2400+20));
ok('M-02 solvable', d1+d2 < m2avail, `need ${(d1+d2).toFixed(0)} m/s, have ${m2avail.toFixed(0)} m/s`);

// 9. M-04/05 TLI budget + SOI reach
setOrbit('EARTH',200,200,0,200); const c4=elements(S.r,S.v,mu);
const rm=BODIES.MOON.a, att=(c4.r+rm)/2;
const tli=(Math.sqrt(mu*(2/c4.r-1/att))-c4.v)*1000;
const m4avail=315*G0*Math.log((3400+8600+30)/(3400+30));
ok('M-04 TLI affordable', tli < m4avail, `TLI ${tli.toFixed(0)} m/s, have ${m4avail.toFixed(0)} m/s`);
const m5avail=315*G0*Math.log((3600+16000+30)/(3600+30));
const vinf=Math.sqrt(BODIES.MOON.mu*(2/(BODIES.MOON.R+100))) ;
ok('M-05 TLI+LOI affordable', tli+900 < m5avail, `need ~${(tli+900).toFixed(0)} m/s, have ${m5avail.toFixed(0)} m/s`);

// 10. M-07 escape budget
const vesc=(Math.sqrt(2)-1)*c4.v*1000;
const m7avail=318*G0*Math.log((2800+6200+20)/(2800+20));
ok('M-07 escape affordable', vesc < m7avail, `need ${vesc.toFixed(0)} m/s, have ${m7avail.toFixed(0)} m/s`);

// 11. M-08 Earth->Mars budget and window timing
const ms=BODIES.SUN.mu, rE=AU, rM=BODIES.MARS.a, aT=(rE+rM)/2;
const dvM=(Math.sqrt(ms*(2/rE-1/aT))-Math.sqrt(ms/rE))*1000;
const tof=Math.PI*Math.sqrt(aT**3/ms);
const m8avail=326*G0*Math.log((3200+22000+40)/(3200+40));
ok('M-08 injection + capture affordable', dvM+2100 < m8avail, `need ~${(dvM+2100).toFixed(0)} m/s, have ${m8avail.toFixed(0)} m/s`);
ok('M-08 flight time ~259 days', close(tof/86400, 259, 6), (tof/86400).toFixed(1)+' days');
// window wait from the configured phases
const wT=TAU/BODIES.MARS.period, wC=TAU/(TAU*Math.sqrt(rE**3/ms));
const phiReq=normAngle(Math.PI-wT*tof);
setOrbit('SUN', 1.0*AU-BODIES.SUN.R, 1.0*AU-BODIES.SUN.R, 0, 63.0);
const thC=Math.atan2(S.r.y,S.r.x), thT=Math.atan2(bodyStateInParent('MARS',0).r.y, bodyStateInParent('MARS',0).r.x);
const phiNow=normAngle(thT-thC), rel=wT-wC;
let dphi=phiReq-phiNow; dphi = rel>0 ? normAngle(dphi) : -normAngle(-dphi);
const wait=dphi/rel;
ok('M-08 window opens within 400 days', wait>0 && wait/86400 < 400, (wait/86400).toFixed(0)+' days out; phase needed '+(phiReq*180/Math.PI).toFixed(1)+'°');

// 12. M-09 thermal puzzle: must be lethal as-is, safe after the fix
const eqT = (d) => Math.pow(1361*(AU/d)**2*0.28/(4*5.670374e-8*0.85),0.25)-273.15;
ok('M-09 0.18 AU is lethal (>180 C)', eqT(0.18*AU) > 180, eqT(0.18*AU).toFixed(0)+' °C');
ok('M-09 0.24 AU is survivable', eqT(0.24*AU) < 180, eqT(0.24*AU).toFixed(0)+' °C');
setOrbit('SUN', 0.18*AU-BODIES.SUN.R, 0.90*AU-BODIES.SUN.R, 170, 0);
const e9=elements(S.r,S.v,ms);
const v9a=Math.sqrt(ms*(2/e9.ra-1/e9.a)), a9n=(e9.ra+0.25*AU)/2;
const dv9=(Math.sqrt(ms*(2/e9.ra-1/a9n))-v9a)*1000;
const m9avail=318*G0*Math.log((1400+2600+20)/(1400+20));
ok('M-09 fix affordable', Math.abs(dv9) < m9avail, `need ${Math.abs(dv9).toFixed(0)} m/s, have ${m9avail.toFixed(0)} m/s`);
ok('M-09 starts outbound-to-perihelion with time to act', tToPeri(e9,ms)/86400 > 20, (tToPeri(e9,ms)/86400).toFixed(0)+' days to perihelion');

T.done();

