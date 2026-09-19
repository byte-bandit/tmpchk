/* Headless DOM stub so index.html's real game code runs unmodified under node.
 *
 * The page is one file with several <script> blocks; extract() concatenates them
 * and eval()s the result, then exports the live bindings from inside that scope.
 * Strict-mode eval keeps declarations local, so the trailing assignment is how
 * anything gets out.
 *
 *   const G = require('./harness').boot();
 *   G.loadMission(1); G.exec('PLAN CIRC AP'); G.advance(10);
 */
const fs = require('fs');
const path = require('path');

const GAME = path.join(__dirname, '..', 'index.html');

function extract(file = GAME) {
  const html = fs.readFileSync(file, 'utf8');
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
}

/* Bindings that only exist in newer copies of the page. A historical
 * index.html booted for an A/B comparison does not have them, and asking for
 * one there is a ReferenceError that would take the whole boot down — so each
 * is exported individually, inside its own try. */
const LATE = [
  'setPad', 'ignite', 'jettisonStage', 'loadStage', 'stepLaunch', 'pitchCommand',
  'pitchToTheta', 'currentPitch', 'launchWindow', 'dynPressure', 'airDensity',
  'airPressure', 'dragAcc', 'inAtmosphere', 'curThrust', 'curIsp', 'curFlow',
  'ASCENT_STACK', 'PITCH_DEFAULT', 'ASCENT_TIME', 'ASCENT_ARC', 'PARK_ALT',
  'Q_BREAK', 'HEAT_NOSE', 'fmtCount', 'rosterList', 'ROSTER_ORDER', 'rig', 'updateHUD',
  'burnStep', 'stepSystems', 'checkHazards', 'padPlace', 'ZEROV', 'stepCount',
  // item 04: cargo, the entry corridor, the canopies, phases and checkpoints
  'CHUTES', 'chuteArea', 'deployChute', 'stepChutes', 'freshShield', 'freshChutes',
  'SHIELD_LOAD', 'SHIELD_RATE', 'CARGO_BAND', 'CARGO_RATE', 'stepCargo', 'airRelative',
  'curPhase', 'checkPhases', 'takeCheckpoint', 'restoreCheckpoint', 'lastCheckpoint',
  'snapState', 'completeMission',
  // item 05: the Kepler convergence guard, the inbound targeter and life support
  'keplerStep', 'KEPLER_TOL', 'CHILDREN', 'trimEncounter', 'o2Rate', 'eclssClosed',
  'ECLSS_OPEN_RATE', 'TRIM_LEAD', 'SYSDEF',
  // item 06: local gravity, the vehicle swap, the surface and the way home
  'surfaceG', 'VEHICLE_KEYS', 'stashVehicle', 'wearVehicle', 'stepAway', 'stepSurf',
  'freshSurf', 'SURF_CYCLE', 'SURF_RATE', 'teiSolve', 'escapeToParent', 'LUNAR_BAND',
  'LANDER_MASS', 'attError',
  // item 07: the Lambert solver, its planner and the arc-transfer command
  'lambert', 'LAMBERT_ZTOP', 'LAMBERT_TOL', 'lambertPlan', 'lambertScan',
  'lambertRealise', 'captureCost', 'aimOffset', 'stumpffC', 'stumpffS',
  'bodyStateIn', 'burnTimeFor', 'MARS_BAND', 'CARGO_BAND', 'PARK_ALT',
  'SHIELD_RATE', 'SHIELD_LOAD', 'rig', 'cmdPlan', 'startBurn', 'setAttMode',
  'setHelio', 'chuteSize', 'CHUTES', 'captureCost', 'aimOffset',
];

function boot(file = GAME) {
  const LOG = [];
  let mkEl = (id) => ({
    id, textContent: '', innerHTML: '', className: '', value: '',
    classList: { add(){}, remove(){}, contains(){ return true; }, toggle(){} },
    style: {}, childElementCount: 0, firstChild: null, disabled: false,
    appendChild(c) { if (c.__line !== undefined) LOG.push(c); },
    removeChild(){}, addEventListener(){}, focus(){}, setAttribute(){},
    getAttribute(){ return null; }, removeAttribute(){},
    getBoundingClientRect: () => ({ width: 400, height: 300 }),
    parentElement: undefined,
    getContext: () => new Proxy({}, { get: (t, k) =>
      k === 'createRadialGradient' ? () => ({ addColorStop(){} }) : () => {} }),
  });
  const base = mkEl;
  mkEl = (id) => { const e = base(id); if (e.parentElement === undefined) e.parentElement = base(id + '__parent'); return e; };

  const els = {};
  global.document = {
    getElementById: (id) => els[id] || (els[id] = mkEl(id)),
    createElement: () => {
      const e = mkEl('p'); e.__line = '';
      return new Proxy(e, {
        set(t, k, v) { if (k === 'innerHTML') t.__line = String(v).replace(/<[^>]*>/g, ''); t[k] = v; return true; },
        get: (t, k) => t[k],
      });
    },
    querySelectorAll: () => [],
    addEventListener(){},
  };
  els['scope'] = mkEl('scope'); els['scope'].parentElement = mkEl('wrap');
  global.window = { addEventListener(){}, devicePixelRatio: 1, matchMedia: () => ({ matches: false }), claude: undefined };
  global.requestAnimationFrame = () => {};
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } };

  (0, eval)(extract(file) + `
;globalThis.__G = {
  exec, loadMission, advance, derive, say, fmtMET, fmtT, fmtDist, fmtVel, fmtDV,
  BODIES, AU, TAU, V, el, elements, propagate, soiBody, craftMass, targetRel,
  absState, bodyStateInParent, normAngle, angDiff, vCirc, vAtR, tToApo, tToPeri,
  simBurn, coastEncounter, transferWindow, solveBurn, targetEncounter,
  setOrbit, MISSIONS, startBurn, timeToIgnition, rcsDV, dvRemaining,
  PAGES, CDU, PAGEKEYS, MSGS, gotoPage, renderCDU, fire, armSolution,
  dockGeom, dockGuide, dockTarget, rcsPulse, utilitiesDone, DOCK_ENV,
  inProxOps, fmtRange, fmtRate, commandedTheta, attError, makeStation,
  PORT_ARM, PORT_ARM_STN, dockLeg, stepDock, DOCK_HOLD, DOCK_STAND,
  LEAK_LIMIT, LEAK_HOLD, rollSeal,
  SYSTEMS, SYSDEF, SYSIDS, sysOn, sysState, sysBlocker, sysStart, sysStop, sysBoot,
  sysFitted, stepSys, tripBus, alignLeft, ALIGN_TIME, ALIGN_DRIFT, ALIGN_OK, darkRows,
  get S(){ return S; }, get D(){ return D; },
  get CURRENT(){ return CURRENT; }, get spMessage(){ return spMessage; },
  get keplerSplits(){ return keplerSplits; },
};
` + LATE.map(n => `try { globalThis.__G.${n} = ${n}; } catch (e) {}`).join('\n'));

  // The descent readout, so a test can assert the frame it is displayed in.
  globalThis.__G.LAT_EL = global.document.getElementById('d-tapo');
  const G = globalThis.__G;
  G.LOG = LOG;
  G.lines = () => LOG.map(l => l.__line);
  G.since = (n) => G.lines().slice(n);
  /** The BURN line a PLAN solution prints, ready to hand back to exec(). */
  G.burnLine = () => {
    const m = G.lines().filter(l => /^\s*→\s*BURN /.test(l)).pop();
    return m ? m.replace(/^\s*→\s*/, '') : null;
  };
  /** Run the simulation until `done()` or the step budget is spent. */
  G.runUntil = (done, { steps = 400000, dt = 0.25 } = {}) => {
    let n = 0;
    while (n++ < steps && G.S.status === 'flight' && !done()) {
      if (G.S.warp === 0) break;
      G.advance(dt * Math.max(G.S.warp, 1));
    }
    return n < steps;
  };
  return G;
}

/* tiny assertion helper shared by every suite */
function suite(name) {
  let fails = 0;
  console.log(name);
  return {
    ok(label, cond, extra = '') {
      console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (extra ? '   ' + extra : ''));
      if (!cond) fails++;
      return !!cond;
    },
    done(msg) {
      console.log('\n' + (fails ? fails + ' FAILURE(S) in ' + name : msg || name + ': all checks passed'));
      process.exitCode = fails ? 1 : 0;
      return fails;
    },
    get fails() { return fails; },
  };
}

module.exports = { boot, extract, suite, GAME };
