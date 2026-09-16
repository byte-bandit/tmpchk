const { boot, suite } = require('./harness');
const G = boot();
const { exec, loadMission, advance, derive, BODIES, AU, TAU, V, targetRel,
        fmtMET, fmtT, propagate, elements, setOrbit, vCirc, vAtR,
        tToPeri, tToApo, normAngle, absState, bodyStateInParent } = G;
const S = G.S;
const LOG = G.LOG, out = G.lines, since = G.since, burnLine = G.burnLine;
Object.defineProperty(globalThis, 'D', { get: () => G.D, configurable: true });
const T = suite('CDU PAGES & KEYS');
const ok = (n, c, x) => T.ok(n, c, x);
let fails = 0;

loadMission(1); exec('PLAN CIRC AP');            // so PLAN shows its REVIEW> link
const ids = Object.keys(G.PAGES);
console.log('PAGE INVENTORY  (' + ids.length + ' pages)');
const keyed = G.PAGEKEYS.map(k => k[1]);
const linked = new Set(keyed);
// walk MENU and any page that navigates, to find everything reachable
for (const id of ids) {
  G.gotoPage(id); G.renderCDU();
  for (const r of G.CURRENT) for (const f of [r.l, r.r, r.full])
    if (f && typeof f.act === 'string') linked.add(f.act);
}
const unreachable = ids.filter(i => !linked.has(i));
ok('every page is reachable by key or link', unreachable.length === 0, unreachable.join(',') || 'none');
ok('12 function keys, all page ids', keyed.length === 12 && keyed.every(k => ids.includes(k)));

/* ---- every page builds cleanly in every mission state ---- */
let bad = [];
for (const m of [1,2,3,4,5,6,7,8,9,0]) {
  loadMission(m);
  for (const id of ids) {
    const count = G.PAGES[id].count ? G.PAGES[id].count() : 1;
    for (let sub = 0; sub < count; sub++) {
      try {
        G.gotoPage(id, sub); G.renderCDU();
        for (const r of G.CURRENT) for (const f of [r.l, r.r, r.full]) {
          if (!f) continue;
          const t = String(f.val) + String(f.lab);
          if (/undefined|NaN|\[object/.test(t)) bad.push(`M${m} ${id}/${sub}: ${t.slice(0,40)}`);
        }
      } catch (e) { bad.push(`M${m} ${id}/${sub} THREW ${e.message}`); }
    }
  }
}
ok('all pages build cleanly across all missions', bad.length === 0, bad.slice(0,4).join(' | '));

/* ---- separation: function keys only navigate, never change vehicle state ---- */
loadMission(2);
const snap = () => JSON.stringify({t:S.t, r:S.r, v:S.v, fuel:S.craft.fuel, sched:S.sched, burn:S.burn, warp:S.warp});
const before = snap();
for (const [,id] of G.PAGEKEYS) G.gotoPage(id);
ok('function keys never touch vehicle state', snap() === before);

/* ---- line-select keys: plan, review, arm ---- */
loadMission(1);
G.gotoPage('PLAN'); G.renderCDU();
const circ = G.CURRENT[0].l;
ok('PLAN page offers CIRC AT APO on 1L', /CIRC AT APO/.test(circ.val) && typeof circ.act === 'function', circ.val);
G.fire(0, 'l');
ok('selecting it computes a solution', !!S.solution, S.solution ? S.solution.name : 'none');
ok('and opens the solution page', G.CDU.page === 'PLANR', G.CDU.page);
G.renderCDU();
const armFld = G.CURRENT[5].r;
ok('6R offers ARM BURN*', /ARM BURN\*/.test(armFld.val), armFld.val);
G.fire(5, 'r');
ok('arming schedules the burn', !!S.sched, S.sched ? `${S.sched.dir} ${S.sched.dur.toFixed(1)}s at ${S.sched.at}` : 'none');
ok('and jumps to the BURN page', G.CDU.page === 'BURN', G.CDU.page);

/* the armed burn must actually fly and complete the mission */
exec('WARP 50');
let g=0; while(g++<400000 && S.status==='flight' && (S.sched||S.burn)) advance(0.25*Math.max(S.warp,1));
ok('LSK-armed burn flies and meets the objective', S.completed,
   `${G.D.perAlt.toFixed(1)}x${G.D.apoAlt.toFixed(1)} km`);

/* ---- pages update with the world, once per second ---- */
loadMission(1);
G.gotoPage('ORB'); G.renderCDU();
const t0 = G.CURRENT[0].r.val;                 // T-Apo
exec('WARP 10'); for (let i=0;i<200;i++) advance(2.5);
G.renderCDU();
const t1 = G.CURRENT[0].r.val;
ok('page data tracks the simulation', t0 !== t1, `${t0} → ${t1}`);

/* ---- scratchpad entry feeds a line-select key ---- */
loadMission(2);
G.gotoPage('PLAN'); G.renderCDU();
document.getElementById('cmd').value = '1000';
G.fire(1, 'l');                                 // <SET APOAPSIS
ok('typed value is consumed by the key', !!S.solution && /APOAPSIS/.test(S.solution.name),
   S.solution ? S.solution.name : 'none');
ok('scratchpad is cleared after entry', document.getElementById('cmd').value === '');
G.gotoPage('PLAN'); G.renderCDU();
G.fire(1, 'l');                                 // no entry this time
ok('empty scratchpad prompts rather than failing', /SCRATCHPAD/.test(out().slice(-3).join(' ')),
   out().slice(-1)[0]);

/* ---- messages reach the scratchpad line and the MSG page ---- */
loadMission(1);
const n0 = G.MSGS.length;
G.say('TEST ADVISORY', 'warn');
ok('message posts to the scratchpad line', G.spMessage && G.spMessage.text === 'TEST ADVISORY',
   G.spMessage ? G.spMessage.sev : 'none');
ok('and is logged', G.MSGS.length === n0 + 1);
G.gotoPage('MSG'); G.renderCDU();
ok('MSG page shows it newest-first', /TEST ADVISORY/.test(G.CURRENT[0].full.val), G.CURRENT[0].full.val);

/* ---- a standing warning is not wiped by an advisory ---- */
loadMission(1);
G.say('ENGINE FAILURE', 'err');
G.say('routine note', 'sys');
ok('an advisory cannot clear a warning', G.spMessage.text === 'ENGINE FAILURE', G.spMessage.text);
G.say('SECOND FAILURE', 'err');
ok('equal severity does replace it', G.spMessage.text === 'SECOND FAILURE', G.spMessage.text);

T.done();
