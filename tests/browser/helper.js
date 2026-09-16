/* Browser-side test helpers: real Chromium via Playwright.
 *
 * Two things here are not obvious and cost time to rediscover:
 *  - The published artifact gets a viewport meta injected by the wrapper; the
 *    local file has none, so mobile emulation would otherwise use a ~980px
 *    layout viewport and mask real phone behaviour. injectViewport() fixes that.
 *  - Fullscreen permission cannot be tested over file://, because those origins
 *    are opaque and allow="fullscreen" never matches them. serve() exists for
 *    the iframe cases.
 */
const path = require('path');
const http = require('http');
const fs = require('fs');

const PW = '/opt/node22/lib/node_modules/playwright';
const CHROME = '/opt/pw-browsers/chromium';
const GAME = path.join(__dirname, '..', '..', 'index.html');
const GAME_URL = 'file://' + GAME;

const injectViewport = () => {
  document.addEventListener('DOMContentLoaded', () => {
    const m = document.createElement('meta');
    m.name = 'viewport'; m.content = 'width=device-width, initial-scale=1';
    document.head.prepend(m);
  });
};

async function launch() {
  const { chromium } = require(PW);
  return chromium.launch({ executablePath: CHROME });
}

/** A page at the given viewport, booted past the POWER ON veil. */
async function openConsole(browser, { width = 390, height = 844, touch = true } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch,
  });
  const page = await ctx.newPage();
  await page.addInitScript(injectViewport);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(GAME_URL);
  await page.waitForTimeout(800);
  await (touch ? page.tap('#boot') : page.click('#boot'));
  await page.waitForTimeout(400);
  page.__errors = errors;
  page.__press = (sel) => touch ? page.tap(sel) : page.click(sel);
  return { ctx, page };
}

/** Serve a directory over HTTP; needed because file:// origins are opaque. */
function serve(dir, port) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(f, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

module.exports = { launch, openConsole, serve, GAME, GAME_URL, injectViewport };
