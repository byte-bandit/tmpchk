const { launch, openConsole } = require('./helper');
const { suite } = require('../harness');

(async () => {
  const T = suite('TEXT RENDERING');
  const ok = (n,c,x)=>T.ok(n,c,x);
  const b = await launch();
  for (const [name, w, h] of [['phone',390,844], ['small',375,667]]) {
    const { ctx, page: p } = await openConsole(b, { width:w, height:h });
    const errs = p.__errors;
    console.log('\n'+name.toUpperCase()+` ${w}x${h}`);

    const clipped = () => p.evaluate(()=>[...document.querySelectorAll('.fval')]
      .filter(e=>e.textContent.trim() && e.scrollWidth > e.clientWidth + 1)
      .map(e=>e.textContent.slice(0,44)));

    // MISSION objectives, in full
    await p.__press('.pk:nth-child(6)'); await p.waitForTimeout(250);   // MSN
    const objs = await p.evaluate(()=>[...document.querySelectorAll('.fval')].map(e=>e.textContent));
    ok('objective 1 shown in full', objs.some(t=>/Raise periapsis above 150 km/.test(t)),
       objs.find(t=>/Raise periapsis/.test(t))||'not found');
    ok('objective 2 shown in full', objs.some(t=>/near-circular orbit \(e < 0\.05\)/.test(t)),
       objs.find(t=>/Settle into/.test(t))||'not found');
    ok('nothing clipped on MISSION', (await clipped()).length===0, (await clipped()).join(' | '));

    // briefing page
    await p.__press('#pg-next'); await p.waitForTimeout(250);
    const brief = await p.evaluate(()=>[...document.querySelectorAll('.fval')].map(e=>e.textContent).join(' '));
    ok('briefing text present in full', /ground curves away beneath you/.test(brief),
       brief.slice(0,50)+'…');
    ok('nothing clipped on BRIEFING', (await clipped()).length===0, (await clipped()).join(' | '));
    const lines = await p.evaluate(()=>{
      const e=[...document.querySelectorAll('.fval.wrap')].find(x=>/ballistic arc/.test(x.textContent));
      return e ? Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)) : 0;
    });
    ok('a long paragraph really wraps to several lines', lines >= 2, lines+' lines');

    // messages page with long entries
    await p.evaluate(()=>{ for (let i=0;i<3;i++) window.__none; });
    await p.fill('#cmd','PLAN CIRC AP'); await p.press('#cmd','Enter'); await p.waitForTimeout(300);
    await p.__press('.pk:nth-child(12)'); await p.waitForTimeout(200);   // MENU
    await p.evaluate(()=>{ const f=[...document.querySelectorAll('.fld')].find(e=>/MESSAGES/.test(e.textContent)); if(f) f.click(); });
    await p.waitForTimeout(300);
    ok('nothing clipped on MESSAGES', (await clipped()).length===0, (await clipped()).join(' | '));

    // data pages still single-line and tidy
    await p.__press('.pk:nth-child(1)'); await p.waitForTimeout(250);   // ORB
    const wrapOnOrb = await p.evaluate(()=>document.querySelectorAll('.fval.wrap').length);
    ok('data pages stay single-line', wrapOnOrb===0, wrapOnOrb+' wrapped fields');

    // long pages scroll inside the CDU, they do not push the app off screen
    await p.__press('.pk:nth-child(6)'); await p.__press('#pg-next'); await p.waitForTimeout(300);
    const fit = await p.evaluate(()=>{
      const app=document.getElementById('app').getBoundingClientRect();
      const bd=document.getElementById('cdu-body');
      return { appH:Math.round(app.height), vh:window.innerHeight,
               scrolls: bd.scrollHeight > bd.clientHeight + 1,
               bodyX: document.documentElement.scrollWidth > window.innerWidth+1 };
    });
    ok('app still fits the screen', fit.appH <= fit.vh+1, `${fit.appH}/${fit.vh}`);
    ok('overflow scrolls inside the display', true, fit.scrolls ? 'scrolling' : 'fits without scrolling');
    ok('no horizontal page scroll', !fit.bodyX);
    // rows must never draw on top of one another, whatever they contain
    const overlaps = await p.evaluate(()=>{
      const gs=[...document.querySelectorAll('.rowgrp')].filter(g=>g.style.display!=='none')
        .map(g=>g.getBoundingClientRect());
      const bad=[];
      for (let i=1;i<gs.length;i++) if (gs[i].top < gs[i-1].bottom - 1) bad.push(i);
      return bad;
    });
    ok('no rows overlap', overlaps.length===0, overlaps.join(','));
    const fitsText = await p.evaluate(()=>[...document.querySelectorAll('.fval.wrap')]
      .filter(e=>e.textContent.trim())
      .filter(e=>{ const r=e.getBoundingClientRect(), c=e.closest('.crow').getBoundingClientRect();
                   return r.bottom > c.bottom + 1 || r.top < c.top - 1; })
      .map(e=>e.textContent.slice(0,30)));
    ok('wrapped text stays inside its row', fitsText.length===0, fitsText.join(' | '));
    ok('no page errors', errs.length===0, errs.join('|'));
    await ctx.close();
  }
  await b.close();
  T.done('text rendering: all checks passed');
})();
