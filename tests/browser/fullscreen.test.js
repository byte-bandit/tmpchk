const path = require('path');
const fs = require('fs');
const os = require('os');
const { launch, openConsole, serve, GAME } = require('./helper');
const { suite } = require('../harness');

const PORT = 8213;

(async () => {
  const T = suite('FULLSCREEN');
  const ok = (n, c, x) => T.ok(n, c, x);
  const b = await launch();

  /* ---- top level: what "open it in its own tab" gives you ---- */
  {
    const { ctx, page: p } = await openConsole(b);
    console.log('\nTOP-LEVEL PAGE');
    ok('fullscreenEnabled is true', await p.evaluate(() => document.fullscreenEnabled));
    ok('button reads FULL', (await p.textContent('#fs')) === 'FULL');
    await p.tap('#fs'); await p.waitForTimeout(500);
    ok('entered fullscreen', await p.evaluate(() => !!document.fullscreenElement));
    ok('button flips to EXIT', (await p.textContent('#fs')) === 'EXIT');
    const fill = await p.evaluate(() => ({
      appH: Math.round(document.getElementById('app').getBoundingClientRect().height),
      vh: window.innerHeight }));
    ok('app fills the viewport', Math.abs(fill.appH - fill.vh) <= 8, JSON.stringify(fill));
    await p.tap('#fs'); await p.waitForTimeout(400);
    ok('exits again', !(await p.evaluate(() => !!document.fullscreenElement)));
    ok('no page errors', p.__errors.length === 0, p.__errors.join('|'));
    await ctx.close();
  }

  /* ---- embedded: permission cannot be tested over file://, so serve it ---- */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dv-fs-'));
  fs.copyFileSync(GAME, path.join(dir, 'game.html'));
  const frame = (allow) =>
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
     <style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style>
     <iframe id="f" allow="${allow}" src="./game.html"></iframe>`;
  fs.writeFileSync(path.join(dir, 'allow.html'), frame('fullscreen'));
  fs.writeFileSync(path.join(dir, 'block.html'), frame("fullscreen 'none'"));
  const server = await serve(dir, PORT);

  for (const [label, file, expect] of [['allow="fullscreen"', 'allow.html', true],
                                       ['allow="fullscreen \'none\'"', 'block.html', false]]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/${file}`);
    await p.waitForTimeout(1000);
    const fr = p.frames().find(f => /game\.html/.test(f.url()));
    const f = p.frameLocator('#f');
    await f.locator('#boot').tap(); await p.waitForTimeout(350);
    console.log('\nEMBEDDED, ' + label);
    ok('fullscreenEnabled === ' + expect, (await fr.evaluate(() => document.fullscreenEnabled)) === expect);
    await f.locator('#fs').tap(); await p.waitForTimeout(700);
    const inFs = await fr.evaluate(() => !!document.fullscreenElement);
    const txt = await f.locator('#fs').textContent();
    if (expect) {
      ok('enters fullscreen from inside the frame', inFs);
      ok('button reads EXIT', txt === 'EXIT', txt);
      await f.locator('#fs').tap(); await p.waitForTimeout(400);
      ok('exits cleanly', !(await fr.evaluate(() => !!document.fullscreenElement)));
    } else {
      ok('does not enter fullscreen', !inFs);
      ok('button stays FULL', txt === 'FULL', txt);
      ok('explains the alternative',
         /FULLSCREEN NOT PERMITTED/.test(await f.locator('#spmsg').innerText()));
    }
    await ctx.close();
  }

  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  await b.close();
  T.done('fullscreen: all checks passed');
})();
