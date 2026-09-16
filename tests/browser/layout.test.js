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
    ok('no page errors', errs.length===0, errs.join('|'));
    await ctx.close();
  }
  await b.close();
  T.done('layout: all checks passed');
})();
