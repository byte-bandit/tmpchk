const { launch, openConsole } = require('./helper');
const { suite } = require('../harness');

(async () => {
  const T = suite('LAYOUT');
  const ok = (n,c,x)=>T.ok(n,c,x);
  const b = await launch();
  for (const [name, w, h] of [['phone',390,844], ['small',375,667], ['wide',1100,780]]) {
    const { ctx, page: p } = await openConsole(b, { width:w, height:h, touch: name !== 'wide' });
    const errs = p.__errors;
    console.log('\n' + name.toUpperCase() + ` ${w}x${h}`);
    const g = await p.evaluate(()=>{
      const rowsOf = el => new Set([...el.children].map(c=>Math.round(c.getBoundingClientRect().top))).size;
      const pk=document.getElementById('pagekeys');
      const app=document.getElementById('app').getBoundingClientRect();
      return {
        pkCount: pk.children.length, pkRows: rowsOf(pk),
        lskL: document.querySelectorAll('.rowgrp > .lsk:first-child').length,
        lskR: document.querySelectorAll('.rowgrp > .lsk:last-child').length,
        crows: [...document.querySelectorAll('.rowgrp')].filter(g=>g.style.display!=='none').length,
        railScroll: document.getElementById('rail').scrollWidth > document.getElementById('rail').clientWidth+1,
        bodyScrollX: document.documentElement.scrollWidth > window.innerWidth+1,
        appH: Math.round(app.height), vh: window.innerHeight,
        scopeH: Math.round(document.querySelector('.scope').getBoundingClientRect().height),
        cduH: Math.round(document.querySelector('.cdu').getBoundingClientRect().height),
        title: document.getElementById('cdu-t').textContent,
      };
    });
    console.log('  ', JSON.stringify(g));
    ok('12 function keys in 2 rows', g.pkCount===12 && g.pkRows===2);
    ok('a line-select key each side of every row', g.lskL===g.crows && g.lskR===g.crows, `${g.lskL}/${g.crows}`);
    ok('at least 6 display rows', g.crows>=6, g.crows+' rows');
    ok('status rail fits', !g.railScroll);
    ok('no horizontal scroll', !g.bodyScrollX);
    ok('everything inside the viewport', g.appH <= g.vh+1, `${g.appH} / ${g.vh}`);
    ok('scope still usable', g.scopeH >= 110, g.scopeH+'px');
    // page keys navigate
    const before = await p.textContent('#cdu-t');
    await p.__press('.pk:nth-child(7)');   // PWR
    await p.waitForTimeout(200);
    const after = await p.textContent('#cdu-t');
    ok('function key changes page', before!==after && /ELECTRIC/i.test(after), `${before} → ${after}`);
    // an LSK toggles a load without opening the keyboard
    const act = await p.evaluate(()=>document.activeElement && document.activeElement.id);
    ok('no keyboard raised by page key', act!=='cmd', act||'(none)');
    const lit = await p.evaluate(()=>[...document.querySelectorAll('.pk.cur')].map(e=>e.textContent));
    ok('exactly the open page is lit', lit.length===1 && lit[0]==='PWR', lit.join(',')||'none');

    // Docking pages carry the most content of anything in the console: eight
    // rows with gauges on the approach page and four sub-pages of procedures.
    // Put a vehicle on the corridor and walk the lot at this viewport.
    await p.fill('#cmd','MIS 3'); await p.press('#cmd','Enter'); await p.waitForTimeout(150);
    await p.__press('.pk:nth-child(5)');            // DOCK
    await p.waitForTimeout(250);
    const dock = await p.evaluate(()=>{
      const clip = [...document.querySelectorAll('.fval')]
        .filter(e=>e.textContent.trim() && e.scrollWidth > e.clientWidth + 1).map(e=>e.textContent.slice(0,40));
      return { clip, rows: [...document.querySelectorAll('.rowgrp')].filter(g=>g.style.display!=='none').length,
               scrollX: document.documentElement.scrollWidth > window.innerWidth+1,
               title: document.getElementById('cdu-t').textContent };
    });
    ok('DOCK page fits without horizontal scroll', !dock.scrollX, dock.rows+' rows, "'+dock.title+'"');
    ok('nothing clipped on DOCK', dock.clip.length===0, dock.clip.join(' | '));
    await p.__press('#pg-next'); await p.waitForTimeout(200);
    const cap = await p.evaluate(()=>({ title: document.getElementById('cdu-t').textContent,
      scrollX: document.documentElement.scrollWidth > window.innerWidth+1 }));
    ok('CAPTURE sub-page reachable by the page keys', /CAPTURE/.test(cap.title) && !cap.scrollX, cap.title);
    // UTIL is reached by a link, not a thirteenth function key
    await p.evaluate(()=>{ const f=[...document.querySelectorAll('.fld')].find(e=>/UTILITIES/.test(e.textContent)); if(f) f.click(); });
    await p.waitForTimeout(250);
    let utilBad = [];
    for (let i=0;i<4;i++) {
      const u = await p.evaluate(()=>({ title: document.getElementById('cdu-t').textContent,
        sub: document.getElementById('cdu-sub').textContent,
        scrollX: document.documentElement.scrollWidth > window.innerWidth+1,
        clip: [...document.querySelectorAll('.fval')]
          .filter(e=>e.textContent.trim() && e.scrollWidth > e.clientWidth + 1).map(e=>e.textContent.slice(0,30)) }));
      if (!/UTILITIES/.test(u.title) || u.scrollX || u.clip.length) utilBad.push(u.sub+':'+(u.clip.join(',')||'scroll'));
      await p.__press('#pg-next'); await p.waitForTimeout(180);
    }
    ok('all four UTILITIES sub-pages fit', utilBad.length===0, utilBad.join(' | ') || 'vestibule/electrical/eclss/propellant');
    ok('still 12 function keys — UTIL is a link, not a 13th', g.pkCount===12);

    // A cold, dark vehicle and the systems page it opens on. Free flight boots
    // dark, so this is the first thing a player ever sees at this width.
    await p.fill('#cmd','MIS 0'); await p.press('#cmd','Enter'); await p.waitForTimeout(250);
    const dark = await p.evaluate(()=>({
      sub: document.getElementById('cdu-sub').textContent,
      live: [...document.querySelectorAll('.lsk')].filter(b=>!b.disabled).length,
      text: document.getElementById('cdu-body').textContent,
      scrollX: document.documentElement.scrollWidth > window.innerWidth+1,
      clip: [...document.querySelectorAll('.fval')]
        .filter(e=>e.textContent.trim() && e.scrollWidth > e.clientWidth + 1).map(e=>e.textContent.slice(0,30)) }));
    ok('a dark console fits and says what it is', !dark.scrollX && /UNPOWERED/.test(dark.sub)
       && /BATTERY TIE/.test(dark.text), dark.sub);
    ok('and offers exactly one lit key to get out of it', dark.live===1, dark.live+' live keys');
    ok('nothing clipped on the dark screen', dark.clip.length===0, dark.clip.join(' | '));
    // wake it, then walk both systems pages
    await p.evaluate(()=>{ const f=[...document.querySelectorAll('.fld')].find(e=>/BATTERY TIE/.test(e.textContent)); if(f) f.click(); });
    await p.waitForTimeout(250);
    let sysBad = [];
    for (let i=0;i<2;i++) {
      const s = await p.evaluate(()=>({ title: document.getElementById('cdu-t').textContent,
        sub: document.getElementById('cdu-sub').textContent,
        rows: [...document.querySelectorAll('.rowgrp')].filter(gr=>gr.style.display!=='none').length,
        scrollX: document.documentElement.scrollWidth > window.innerWidth+1,
        clip: [...document.querySelectorAll('.fval')]
          .filter(e=>e.textContent.trim() && e.scrollWidth > e.clientWidth + 1).map(e=>e.textContent.slice(0,30)) }));
      if (!/SYSTEMS/.test(s.title) || s.scrollX || s.clip.length) sysBad.push((s.sub||s.title)+':'+(s.clip.join(',')||'scroll'));
      await p.__press('#pg-next'); await p.waitForTimeout(180);
    }
    ok('both SYSTEMS pages fit, with the bus load in the title', sysBad.length===0,
       sysBad.join(' | ') || 'two pages of five systems');
    ok('still 12 function keys — SYS is a link too', g.pkCount===12);

    // The launch pages are the newest and the densest: a pitch program is five
    // altitude/pitch pairs with an edit key beside each, which is what pushed a
    // value off the side of a 375 px screen once already.
    await p.fill('#cmd','MIS 10'); await p.press('#cmd','Enter'); await p.waitForTimeout(300);
    await p.fill('#cmd','LAUNCH'); await p.press('#cmd','Enter'); await p.waitForTimeout(300);
    let lnchBad = [], seen = [];
    for (let i=0;i<3;i++) {
      const l = await p.evaluate(()=>({ title: document.getElementById('cdu-t').textContent.trim(),
        scrollX: document.documentElement.scrollWidth > window.innerWidth+1,
        clip: [...document.querySelectorAll('.fval, .flab')]
          .filter(e=>e.textContent.trim() && e.scrollWidth > e.clientWidth + 1).map(e=>e.textContent.slice(0,30)) }));
      seen.push(l.title);
      if (l.scrollX || l.clip.length) lnchBad.push(l.title+':'+(l.clip.join(',')||'scroll'));
      await p.__press('#pg-next'); await p.waitForTimeout(200);
    }
    ok('all three LAUNCH pages fit, labels and values', lnchBad.length===0,
       lnchBad.join(' | ') || seen.join(' / '));

    // Coming home. The ENTRY pages carry the corridor, the shield budget and
    // the canopy envelopes, and the fifth UTILITIES sub-page carries the cargo
    // — all of it added by item 04 and none of it seen at 375 px before.
    await p.fill('#cmd','MIS 11'); await p.press('#cmd','Enter'); await p.waitForTimeout(300);
    await p.evaluate(()=>{ const f=[...document.querySelectorAll('.fld')].find(e=>/BATTERY TIE/.test(e.textContent)); if(f) f.click(); });
    await p.waitForTimeout(250);
    await p.fill('#cmd','ENTRY'); await p.press('#cmd','Enter'); await p.waitForTimeout(300);
    let entBad = [], entSeen = [];
    for (let i=0;i<2;i++) {
      const e = await p.evaluate(()=>({ title: document.getElementById('cdu-t').textContent.trim(),
        scrollX: document.documentElement.scrollWidth > window.innerWidth+1,
        text: document.getElementById('cdu-body').textContent,
        clip: [...document.querySelectorAll('.fval, .flab')]
          .filter(el=>el.textContent.trim() && el.scrollWidth > el.clientWidth + 1).map(el=>el.textContent.slice(0,30)) }));
      entSeen.push(e.title);
      if (e.scrollX || e.clip.length) entBad.push(e.title+':'+(e.clip.join(',')||'scroll'));
      await p.__press('#pg-next'); await p.waitForTimeout(200);
    }
    ok('both ENTRY pages fit, labels and values', entBad.length===0,
       entBad.join(' | ') || entSeen.join(' / '));
    ok('and the corridor is readable before committing to it', /Corridor/.test(
       await p.evaluate(()=>{ gotoPage('ENTR',0); renderCDU(); return document.getElementById('cdu-body').textContent; })));
    ok('ENTRY is a link, not a 13th function key', g.pkCount===12);

    // Stand the vehicle in a hard dock with the hatch open so the cargo page
    // is the real one rather than the INHIBITED placeholder.
    await p.evaluate(()=>{ S.dock.phase='HARD'; S.dock.vest.leakOk=true; S.dock.vest.hatch=true;
                           S.dock.pwr.umb=true; S.dock.pwr.tie=true; derive(); gotoPage('UTIL',4); renderCDU(); });
    await p.waitForTimeout(250);
    const cargoPg = await p.evaluate(()=>({ title: document.getElementById('cdu-t').textContent.trim(),
      sub: document.getElementById('cdu-sub').textContent.trim(),
      text: document.getElementById('cdu-body').textContent,
      scrollX: document.documentElement.scrollWidth > window.innerWidth+1,
      clip: [...document.querySelectorAll('.fval, .flab')]
        .filter(el=>el.textContent.trim() && el.scrollWidth > el.clientWidth + 1).map(el=>el.textContent.slice(0,30)) }));
    ok('the CARGO sub-page of UTILITIES fits', !cargoPg.scrollX && cargoPg.clip.length===0 && cargoPg.sub==='CARGO',
       cargoPg.sub + ' — ' + (cargoPg.clip.join(' | ') || 'clean'));
    ok('and it shows the hold, the manifest and what carrying it costs',
       /DELIVER CARGO/.test(cargoPg.text) && /1800/.test(cargoPg.text) && /remaining/.test(cargoPg.text),
       (cargoPg.text.match(/In the hold[^A-Z]*/) || ['—'])[0].slice(0, 40));

    ok('no page errors', errs.length===0, errs.join('|'));
    await ctx.close();
  }
  await b.close();
  T.done('layout: all checks passed');
})();
