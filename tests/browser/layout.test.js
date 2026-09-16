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

    ok('no page errors', errs.length===0, errs.join('|'));
    await ctx.close();
  }
  await b.close();
  T.done('layout: all checks passed');
})();
