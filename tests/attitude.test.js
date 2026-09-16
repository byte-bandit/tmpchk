const { boot, suite } = require('./harness');
const G = boot();
const { exec, loadMission, advance, V, BODIES, fmtT } = G;
const S = G.S;
const T = suite('ATTITUDE');
const ok = (n, c, x) => T.ok(n, c, x);
const deg = (r) => r * 180 / Math.PI;
/** Advance until the autopilot has settled. The slewing flag is only set once
 *  stepAttitude has run, so a while-loop that tests it first exits at once. */
function settle(budget = 40000) {
  let n = 0;
  do { advance(0.25); } while (n++ < budget && S.att.slewing);
  return n;
}
const err = () => {
  const cmd = Math.atan2(S.v.y, S.v.x);
  let d = (cmd - S.att.theta) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
};

/* ---- the vehicle starts pointed, and holds ---- */
loadMission(1);
ok('starts pointed prograde', err() < 1e-6, deg(err()).toExponential(2) + '°');
ok('attitude is state, not a string', typeof S.att === 'object' && 'theta' in S.att);
exec('WARP 10');
for (let i = 0; i < 400; i++) advance(2.5);
// attitude is refreshed once per simulation chunk, so while coasting at a coarse
// chunk the nose lags the rotating reference by at most one chunk's worth
ok('holds prograde while the reference rotates', err() < 0.5 * Math.PI/180, deg(err()).toFixed(4) + '°');

/* ---- a commanded reversal takes real time and respects the rate limit ---- */
loadMission(1);
S.warp = 1;
exec('HOLD RET');
ok('HOLD sets the mode', S.att.mode === 'RET');
const t0 = S.t;
let n = settle();
const elapsed = S.t - t0;
ok('a 180° reversal takes real time', elapsed > 20 && elapsed < 200, elapsed.toFixed(1) + ' s');
ok('it never exceeds the rate limit', Math.abs(S.att.rate) <= S.craft.slewRate + 1e-9,
   deg(S.att.rate).toFixed(3) + '°/s vs limit ' + deg(S.craft.slewRate).toFixed(1));
const retErr = Math.abs(Math.abs(((Math.atan2(S.v.y, S.v.x) + Math.PI) - S.att.theta) % (2*Math.PI)));
ok('and arrives pointed retrograde', retErr < 0.01 || Math.abs(retErr - 2*Math.PI) < 0.01,
   deg(retErr).toFixed(4) + '°');

/* ---- turning costs power, not propellant ---- */
loadMission(1);
const rcs0 = S.craft.rcs;
S.warp = 1;
advance(1);
const idleLoad = G.D.load;
exec('HOLD RET');
advance(0.25);
const slewLoad = G.D.load;                    // measured while actually turning
settle();
ok('a slew spends no propellant', S.craft.rcs === rcs0, `${rcs0} → ${S.craft.rcs}`);
ok('reaction wheels draw power while turning', slewLoad === idleLoad + S.craft.slewPower,
   `${idleLoad} W idle → ${slewLoad} W slewing`);
advance(1);
ok('and stop drawing once settled', G.D.load === idleLoad, G.D.load + ' W');

/* ---- an engine will not fire until the vehicle is pointed ---- */
loadMission(1);
S.warp = 1;
exec('HOLD RET');                                        // point the wrong way
settle();
const fuel0 = S.craft.fuel;
exec('BURN PRO 20');
advance(0.5);
ok('ignition waits on attitude', S.aligning === true && S.craft.fuel === fuel0,
   'aligning=' + S.aligning);
ok('and the burn clock does not run while it waits', S.burn && S.burn.left === S.burn.total,
   S.burn ? S.burn.left.toFixed(2) + '/' + S.burn.total : 'no burn');
n = 0; while (n++ < 40000 && S.burn) advance(0.25);
ok('the full commanded duration is still burned', S.craft.fuel < fuel0,
   (fuel0 - S.craft.fuel).toFixed(2) + ' kg');

/* ---- arming points the vehicle early, so ignition is still on time ---- */
loadMission(1);
exec('PLAN CIRC AP');
const line = G.burnLine();
exec(line);
ok('arming commands the attitude immediately', S.att.mode === 'PRO', S.att.mode);
exec('WARP 50');
n = 0; while (n++ < 400000 && S.status === 'flight' && (S.sched || S.burn)) advance(0.25 * Math.max(S.warp, 1));
ok('M-01 still completes to the same orbit', S.completed,
   `${G.D.perAlt.toFixed(1)}x${G.D.apoAlt.toFixed(1)} km`);
ok('and lands within a kilometre of the pre-attitude result',
   Math.abs(G.D.perAlt - 400.0) < 1 && Math.abs(G.D.apoAlt - 400.4) < 1,
   `${G.D.perAlt.toFixed(2)} / ${G.D.apoAlt.toFixed(2)}`);

/* ---- target-relative pointing, which docking will need ---- */
loadMission(3);
S.warp = 1;
exec('TGT STATION');
exec('HOLD TGT');
settle();
const t = G.targetRel();
const want = Math.atan2(t.r.y, t.r.x);
let e2 = Math.abs((want - S.att.theta) % (2 * Math.PI));
if (e2 > Math.PI) e2 = 2 * Math.PI - e2;
ok('HOLD TGT points at the target', e2 < 0.01, deg(e2).toFixed(3) + '°');

/* ---- no power, no wheels ---- */
loadMission(1);
S.power.batt = 0; S.power.area = 0;                      // dead bus
S.warp = 1; advance(1);
exec('HOLD RET');
const th0 = S.att.theta;
for (let i = 0; i < 200; i++) advance(0.25);
ok('a dead bus means no attitude control', Math.abs(S.att.theta - th0) < 1e-9,
   deg(Math.abs(S.att.theta - th0)).toExponential(2) + '°');

T.done('attitude: all checks passed');
