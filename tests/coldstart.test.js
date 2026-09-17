const { boot, suite } = require('./harness');
const G = boot();
const { exec, loadMission, advance, derive, fmtT, fmtMET,
        SYSTEMS, SYSDEF, SYSIDS, sysOn, sysState, sysBlocker, sysFitted,
        ALIGN_TIME, ALIGN_OK, MISSIONS } = G;
const S = G.S;
const out = G.lines;
const T = suite('COLD START');
const ok = (n, c, x) => T.ok(n, c, x);
const tail = (n = 1) => out().slice(-n).join(' | ');
/** Run the clock a second at a time until `done()`. */
const until = (done, lim = 4000) => { let n = 0; while (n++ < lim && !done()) advance(1); return n < lim; };
const allUp = () => SYSIDS.every(id => !sysFitted(id) || sysOn(id));

/* ---------- 1. the graph itself ---------- */
console.log('\nTHE GRAPH');
loadMission(0);
ok('free flight boots dark', SYSIDS.every(id => sysState(id) === 'OFF'),
   SYSIDS.map(id => sysState(id)).join(',').slice(0, 40));
ok('and it boots on the pad, held down, with the count stopped',
   !!S.pad && !S.pad.lifted && S.pad.hold && S.pad.T < 0,
   S.pad ? `T${G.fmtCount(S.pad.T)}` : 'no pad');
ok('nothing is generating — the arrays are behind the fairing',
   G.D.gen === 0 && S.fairing && !sysOn('ARRAY'), `gen ${G.D.gen} W`);
ok('the pack is all the power there is until the fairing goes',
   S.power.batt > 0 && S.power.batt < S.power.battMax,
   `${S.power.batt} / ${S.power.battMax} Wh`);
ok('a dark vehicle draws nothing', G.D.load === 0, G.D.load + ' W');
ok('every system except the battery has a prerequisite',
   SYSTEMS.every(d => d.id === 'BATT' ? d.needs.length === 0 : d.needs.length > 0));
ok('the graph is acyclic and rooted at the battery',
   SYSTEMS.every((d, i) => d.needs.every(n => SYSIDS.indexOf(n) < i)),
   SYSTEMS.map(d => d.tag + '←' + (d.needs[0] || '·')).join(' '));

/* ---------- 2. an invalid order is refused, with a reason ---------- */
console.log('\nOUT OF ORDER');
loadMission(0);
const refusals = [];
for (const d of SYSTEMS) {
  if (d.id === 'BATT' || !sysFitted(d.id)) continue;
  exec('START ' + d.id);
  const msg = tail(1);
  refusals.push([d.id, sysState(d.id) === 'OFF' && /needs/.test(msg), msg]);
}
ok('every system downstream of the battery is refused on a dark vehicle',
   refusals.every(r => r[1]), refusals.filter(r => !r[1]).map(r => r[0]).join(',') || 'all refused');
ok('and the refusal names what it is waiting for',
   /GUIDANCE PLATFORM needs ATTITUDE CONTROL/.test(refusals.find(r => r[0] === 'GNC')[2]),
   refusals.find(r => r[0] === 'GNC')[2].slice(0, 60));
ok('nothing started', SYSIDS.every(id => sysState(id) === 'OFF'));

/* ---------- 3. the console is dark until the battery is found ---------- */
console.log('\nA DARK CONSOLE');
loadMission(0);
G.gotoPage('ORB'); G.renderCDU();
const darkVals = G.CURRENT.map(r => [r.l, r.r, r.full].map(f => f ? f.val : '').join(' ')).join(' ');
ok('every page renders the dark screen, whatever page is selected',
   /CLOSE BATTERY TIE\*/.test(darkVals), darkVals.slice(0, 50));
ok('the title line says why', document.getElementById('cdu-sub').textContent === 'UNPOWERED');
const lit = G.CURRENT.filter(r => [r.l, r.r, r.full].some(f => f && f.act));
ok('exactly one key is live on it, so it cannot be missed', lit.length === 1,
   lit.length + ' live');
ok('the dark screen says what it is and what to do',
   G.CURRENT.some(r => r.full && /battery tie/i.test(r.full.val)));
ok('and the scratchpad is standing on the same instruction',
   /CONSOLE UNPOWERED/.test(G.spMessage ? G.spMessage.text : ''), G.spMessage && G.spMessage.text.slice(0, 40));
// the page renders rather than throwing, which is what the suites depend on
let threw = null;
for (const id of Object.keys(G.PAGES)) {
  try { G.gotoPage(id); G.renderCDU(); } catch (e) { threw = id + ': ' + e.message; }
}
ok('a dark console never throws, for any page', !threw, threw || 'none');
// pressing the one live key wakes it
G.gotoPage('ORB'); G.renderCDU(); G.fire(1, 'l');
ok('pressing it closes the battery tie', sysOn('BATT'));
G.renderCDU();
ok('and the console comes up', !/CLOSE BATTERY TIE/.test(
   G.CURRENT.map(r => [r.l, r.r, r.full].map(f => f ? f.val : '').join(' ')).join(' ')));

/* ---------- 4. no avionics, no numbers ---------- */
console.log('\nNO AVIONICS, NO NUMBERS');
ok('the orbit page has nothing to show', G.CDU.page === 'ORB' &&
   G.CURRENT.some(r => r.l && /NO DATA/.test(r.l.val)), G.CURRENT[0].l.val);
G.updateHUD ? G.updateHUD() : null;
exec('PLAN CIRC AP');
ok('the solver refuses without the flight computer', !S.solution && /AVIONICS OFF/.test(tail(1)),
   tail(1).slice(0, 40));
exec('HOLD RET');
ok('and attitude hold has nothing to hold against', S.att.mode === 'FREE' && /ATTITUDE CONTROL IS OFF/.test(tail(1)),
   tail(1).slice(0, 40));

/* ---------- 5. a valid order powers the vehicle up ---------- */
console.log('\nA VALID ORDER');
loadMission(0);
const order = ['BATT', 'BUS', 'ARRAY', 'AVIO', 'THERM', 'ECLSS', 'ATT', 'PRESS', 'COMM', 'GNC'];
for (const id of order) {
  until(() => !sysBlocker(id), 600);
  exec('START ' + id);
}
until(() => allUp(), 900);
const bySlowestPath = S.t;
ok('a valid order brings everything up', allUp(),
   SYSIDS.filter(id => !sysOn(id) && sysFitted(id)).join(',') || 'all on line');
ok('and takes the four to five minutes it is meant to',
   bySlowestPath > 3.5 * 60 && bySlowestPath < 5.5 * 60, fmtT(bySlowestPath));
ok('the guidance alignment is the long pole', ALIGN_TIME >= 150,
   ALIGN_TIME + ' s of ' + bySlowestPath.toFixed(0));
ok('a warm vehicle and a finished cold start are the same thing',
   G.D.load === 340, G.D.load + ' W');

/* ---------- 6. the battery pays for the warm-up ---------- */
console.log('\nTHE BATTERY PAYS');
loadMission(0);
const b0 = S.power.batt;
exec('PWR UP');
until(() => !S.pwrUp, 900);
ok('the auto sequence runs the same graph and takes the same time',
   allUp() && S.t > 3.5 * 60 && S.t < 5.5 * 60, fmtT(S.t));
ok('and it cost real battery, on the pad, off the pack',
   S.power.batt < b0 && G.D.gen === 0,
   `${b0.toFixed(0)} → ${S.power.batt.toFixed(0)} Wh`);
// On the pad the arrays are worth nothing no matter where the Sun is: they are
// folded behind a fairing. Deploy them and watch the number stay at zero.
exec('START ARRAY');
until(() => sysOn('ARRAY') || S.t > 1200, 1500);
ok('deployed arrays still generate nothing behind the fairing',
   G.D.gen === 0 && S.fairing, `${G.D.gen.toFixed(0)} W`);
const beforeCount = S.power.batt;
advance(300);
ok('and idling in the count costs real charge',
   S.power.batt < beforeCount, `${beforeCount.toFixed(0)} → ${S.power.batt.toFixed(0)} Wh`);

/* ---------- 7. the alignment is a thing you watch, and can spoil ---------- */
console.log('\nTHE ALIGNMENT');
loadMission(0);
exec('PWR UP');
until(() => sysState('GNC') === 'START', 900);
const d0 = S.sys.GNC.drift;
advance(30);
const d1 = S.sys.GNC.drift;
ok('the residual drift is readable and falling', d0 > d1 && d1 > 0,
   `${d0.toFixed(2)} → ${d1.toFixed(2)} °/h`);
G.gotoPage('SYS', 1); G.renderCDU();      // guidance is the eighth system, so page two
const gncRow = G.CURRENT.map(r => r.l ? r.l.lab + ' ' + r.l.val : '').find(v => /GUIDANCE/.test(v));
ok('and the page shows the drift and the time left', /drift/.test(gncRow || '') && /T−/.test(gncRow || ''),
   (gncRow || 'none').slice(0, 60));
// firing thrusters through an aligning platform pushes it back
exec('TGT STATION');
const before = S.sys.GNC.t;
exec('TRANS PRO 0.5');
// The pulse prints its own ΔV line and a range line after the disturbance, so
// the notice is a line or two back rather than last.
ok('firing thrusters through it costs alignment', S.sys.GNC.t < before && /PLATFORM DISTURBED/.test(tail(4)),
   `${before.toFixed(0)} s → ${S.sys.GNC.t.toFixed(0)} s`);
until(() => sysOn('GNC'), 900);
ok('it still converges afterwards', sysOn('GNC') && S.sys.GNC.drift === 0,
   `aligned at ${fmtT(S.t)}, drift limit ${ALIGN_OK} °/h`);

/* ---------- 8. guidance gates flight ---------- */
console.log('\nGUIDANCE GATES FLIGHT');
loadMission(0);
exec('BATT'); until(() => sysOn('BATT'));
exec('START BUS'); until(() => sysOn('BUS'));
exec('START AVIO'); until(() => sysOn('AVIO'));
exec('START PRESS'); until(() => sysOn('PRESS'));
exec('BURN PRO 10');
ok('no aligned platform, no ignition', !S.burn && /GUIDANCE NOT ALIGNED/.test(tail(1)), tail(1).slice(0, 44));
exec('START ATT'); until(() => sysOn('ATT'));
exec('START GNC');
exec('BURN PRO 10');
ok('and an alignment in progress says how long it has to go',
   !S.burn && /GUIDANCE ALIGNING/.test(tail(1)), tail(1).slice(0, 52));
until(() => sysOn('GNC'), 900);
exec('BURN PRO 10');
ok('once aligned, the engine lights', !!S.burn, S.burn ? S.burn.dir + ' ' + S.burn.total + ' s' : 'no burn');
exec('CANCEL');
// propulsion pressurisation gates the engine and the thrusters alike
exec('STOP PRESS');
exec('BURN PRO 10');
ok('unpressurised tanks refuse the engine', !S.burn && /NOT PRESSURISED/.test(tail(1)), tail(1).slice(0, 40));
exec('TGT STATION');                             // so the refusal under test is the gate
exec('TRANS PRO 0.1');
ok('and refuse the thrusters', /NOT PRESSURISED/.test(tail(1)), tail(1).slice(0, 40));

/* ---------- 9. the one real failure: the bus lets go ---------- */
console.log('\nBUS TRIP');
loadMission(0);
exec('PWR UP'); until(() => !S.pwrUp, 900);
exec('STOP ARRAY');                              // stow them again, in eclipse
exec('PWR SCI ON');
const warnedAt = [];
until(() => { if (/MIN OF BUS LEFT/.test(tail(1)) && !warnedAt.length) warnedAt.push(S.power.batt);
              return !sysOn('BUS'); }, 9000);
ok('the bus trips when the pack runs out', !sysOn('BUS'), 'at ' + fmtMET(S.t));
ok('and it was called well before it happened', warnedAt.length > 0,
   warnedAt.length ? `warned with ${warnedAt[0].toFixed(0)} Wh left` : 'no warning');
ok('everything downstream of the battery drops with it',
   SYSIDS.every(id => id === 'BATT' ? sysOn(id) : !sysOn(id)));
ok('including the alignment — that is the real cost', sysState('GNC') === 'OFF' && S.sys.GNC.drift > 0,
   `drift back to ${S.sys.GNC.drift.toFixed(1)} °/h`);
ok('the battery itself is not the way back — the reserve is',
   S.power.batt > 0 && S.power.batt <= S.power.battMax * 0.05,
   `${S.power.batt.toFixed(0)} Wh reserve of ${S.power.battMax}`);
// and it is recoverable: bus, arrays, sunlight, everything back
exec('PWR SCI OFF');
exec('START BUS'); until(() => sysOn('BUS'), 60);
exec('START ARRAY'); until(() => sysOn('ARRAY'), 400);
ok('the reserve is enough to close the bus and get the arrays out', sysOn('ARRAY'),
   `${S.power.batt.toFixed(1)} Wh left`);
until(() => S.power.batt > S.power.battMax * 0.5, 9000);
exec('PWR UP'); until(() => !S.pwrUp, 900);
ok('nothing is unrecoverable', allUp(), 'back up at ' + fmtMET(S.t));

/* ---------- 10. life support is in the graph, and air is lethal ---------- */
console.log('\nLIFE SUPPORT');
loadMission(0);
ok('life support is fitted to a crewed vehicle and hangs off the bus',
   sysFitted('ECLSS') && SYSDEF.ECLSS.needs.includes('BUS'));
loadMission(1);
ok('and is not fitted to one with no crew', !sysFitted('ECLSS') && sysState('ECLSS') === 'OFF',
   'M-01 carries ' + S.craft.crew + ' crew');
ok('an uncrewed vehicle therefore draws less, never more', G.D.load === 315, G.D.load + ' W');

loadMission(3);                                   // crewed, warm, life support running
const o2a = S.craft.o2; advance(3600);
const rateOn = o2a - S.craft.o2;
exec('STOP ECLSS');
const o2b = S.craft.o2; advance(3600);
const rateOff = o2b - S.craft.o2;
ok('with life support running the crew use one crew-hour each per hour',
   Math.abs(rateOn - S.craft.crew) < 0.05, rateOn.toFixed(2) + ' crew-h/h');
ok('with it off they burn emergency oxygen four times as fast',
   Math.abs(rateOff - 4 * rateOn) < 0.1, rateOff.toFixed(2) + ' crew-h/h');

loadMission(3);
S.craft.o2 = S.craft.crew * 25;                   // a day and an hour of air
advance(3700);
ok('a day out, the crew are told', /CAUTION · OXYGEN/.test(out().join('\n').split('CAUTION · OXYGEN').length > 1 ? 'CAUTION · OXYGEN' : ''),
   (out().filter(l => /OXYGEN/.test(l))[0] || 'none').slice(0, 52));
S.craft.o2 = S.craft.crew * 4.5;
advance(2000);
ok('four hours out, again and louder',
   out().some(l => /WARNING · OXYGEN/.test(l)),
   (out().filter(l => /WARNING · OXYGEN/.test(l))[0] || 'none').slice(0, 52));
S.craft.o2 = S.craft.crew * 0.02;
advance(300);
ok('and running out ends the flight', S.status === 'lost' && /oxygen exhausted/i.test(out().join('\n').slice(-400)),
   S.status + ' — ' + (out().filter(l => /CREW LOST/.test(l))[0] || '').slice(0, 44));

/* ---------- 11. every crewed mission has air to spare ---------- */
console.log('\nOXYGEN MARGINS');
// The endurance a mission carries, against the time it actually takes to fly.
// These are the numbers that decide whether making air lethal broke anything.
const FLOWN = { 3: 5.4, 5: 77.6, 6: 1.9, 0: 0.1 };   // hours, measured from the suites
for (const id of [3, 5, 6, 0]) {
  loadMission(id);
  const hrs = S.craft.o2 / S.craft.crew;
  const need = FLOWN[id];
  ok(`${S.mission.code} carries air for its flight`, hrs > need * 3,
     `${hrs.toFixed(0)} h of air (${S.craft.crew} crew, ${S.craft.o2} crew-h) for a ${need} h flight — ${(hrs/need).toFixed(0)}× margin`);
}

/* ---------- 12. warm missions are untouched ---------- */
console.log('\nWARM MISSIONS ARE UNTOUCHED');
const warmLoads = [];
for (const m of MISSIONS) {
  if (m.id === 0) continue;
  loadMission(m.id);
  warmLoads.push([m.code, G.D.load, allUp(), S.craft.crew]);
}
ok('every scripted mission still boots with everything running',
   warmLoads.every(w => w[2]), warmLoads.filter(w => !w[2]).map(w => w[0]).join(',') || 'all warm');
ok('a crewed one draws exactly the 340 W it always drew',
   warmLoads.filter(w => w[3] > 0).every(w => w[1] === 340),
   warmLoads.filter(w => w[3] > 0).map(w => w[0] + ' ' + w[1] + 'W').join(' '));
ok('an uncrewed one draws 315 W — less than before, never more',
   warmLoads.filter(w => !w[3]).every(w => w[1] === 315),
   warmLoads.filter(w => !w[3]).map(w => w[0] + ' ' + w[1] + 'W').join(' '));
ok('and nothing is starting, so the warm-up chunk bound never applies to one',
   !G.SYSIDS.some(id => sysState(id) === 'START'));

/* ---------- 13. a mission may start partly cold ---------- */
console.log('\nPARTLY COLD');
loadMission(0);
G.sysBoot(['BATT', 'BUS', 'AVIO']);               // the shape a future mission would declare
derive();
ok('a named subset starts running and the rest does not',
   sysOn('BATT') && sysOn('BUS') && sysOn('AVIO') && !sysOn('GNC') && !sysOn('PRESS'),
   SYSIDS.filter(id => sysOn(id)).join(','));
ok('the console is alive and the numbers are back', G.D.load > 0, G.D.load + ' W');
exec('START PRESS');
ok('and what it does carry unblocks the next step', sysState('PRESS') === 'START', sysState('PRESS'));

/* ---------- 14. the page ---------- */
console.log('\nTHE SYSTEMS PAGE');
loadMission(1);
G.gotoPage('SYS');
for (const pg of [0, 1]) {
  G.renderCDU(); G.CDU.sub = pg; G.renderCDU();
  const txt = G.CURRENT.map(r => [r.l, r.r, r.full].map(f => f ? f.lab + ' ' + f.val : '').join(' ')).join(' ');
  ok(`page ${pg+1} lists five systems with no gaps in the text`,
     !/undefined|NaN|\[object/.test(txt), txt.slice(0, 46));
}
ok('it is reachable without a thirteenth function key',
   !G.PAGEKEYS.some(k => k[1] === 'SYS') && G.PAGEKEYS.length === 12);

T.done('cold start: all checks passed');
