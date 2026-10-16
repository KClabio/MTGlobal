// Headless Chrome over the DevTools protocol (no extra packages: Node's own fetch + WebSocket, Node 22+).
// launch() opens one tab on a fresh temp profile; close() ends Chrome and removes the profile.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = process.env.TEST_BASE || 'http://localhost:3001';
export const OUTPUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'output');
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.unref();
  srv.on('error', reject);
  srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
});

export async function launch({ width = 1280, height = 900, cookies = { theme: 'light', lang: 'vi' } } = {}) {
  const exe = CHROME_PATHS.find((p) => existsSync(p));
  if (!exe) throw new Error('Chrome not found: set CHROME_PATH');
  const port = await freePort();
  const profile = mkdtempSync(path.join(tmpdir(), 'mtg-test-'));
  const chrome = spawn(exe, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });

  let targets;
  for (let i = 0; i < 60 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(250); }
  }
  if (!targets) { chrome.kill(); throw new Error('Chrome did not start'); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });

  let id = 0;
  const pending = new Map();
  const waiters = []; // one-off waits for an event
  const handlers = []; // lasting event handlers
  const jsErrors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (!m.method) return;
    if (m.method === 'Runtime.exceptionThrown') jsErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    for (const h of handlers) if (h.method === m.method) h.fn(m.params);
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === m.method) { waiters[i].resolve(m.params); waiters.splice(i, 1); }
  });

  /** Sends a DevTools command and returns its result (throws on a protocol error). */
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const waitEvent = (method, timeout = 20000) => {
    const p = new Promise((resolve, reject) => {
      const w = { method, resolve };
      waiters.push(w);
      setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); reject(new Error(`timeout waiting for ${method}`)); } }, timeout);
    });
    p.catch(() => {}); // a wait raced against a timer and never awaited must not crash the run
    return p;
  };
  const on = (method, fn) => handlers.push({ method, fn });

  /** Runs an expression in the page (awaits promises) and returns its JSON value. */
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');

  const b = {
    send, ev, on, waitEvent, jsErrors, sleep,
    /** Opens BASE + path and waits for the load event, then `settle` ms. */
    async nav(p, settle = 250) {
      const loaded = waitEvent('Page.loadEventFired');
      await send('Page.navigate', { url: /^(https?|about):/.test(p) ? p : BASE + p });
      await loaded;
      await sleep(settle);
    },
    /** Waits for the next page load (e.g. after a click on a link or a form submit). */
    waitLoad: (timeout) => waitEvent('Page.loadEventFired', timeout),
    viewport: (w, h = 900) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 }),
    reducedMotion: (on = true) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : 'no-preference' }] }),
    setCookie: (name, value) => send('Network.setCookie', { name, value, url: BASE }),
    clearCookie: (name) => send('Network.deleteCookies', { name, url: BASE }),
    /** Logs the tab in with a session id from fixtures.createUser(). */
    login: (sid) => send('Network.setCookie', { name: 'connect.sid', value: sid, url: BASE, httpOnly: true }),
    /** Scrolls the element into view and returns its centre point. */
    point: (sel) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('not found: ' + ${JSON.stringify(sel)}); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`),
    mouse: (type, p, extra = {}) => send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, ...extra }),
    async hover(sel) { const p = await b.point(sel); await b.mouse('mouseMoved', p); return p; },
    async clickAt(sel) {
      const p = await b.point(sel);
      await b.mouse('mouseMoved', p);
      await b.mouse('mousePressed', p, { button: 'left', clickCount: 1 });
      await b.mouse('mouseReleased', p, { button: 'left', clickCount: 1 });
      return p;
    },
    /** Clicks something that opens another page and waits for it to load. */
    async clickAndWait(sel, settle = 200) { const l = waitEvent('Page.loadEventFired'); await b.clickAt(sel); await l; await sleep(settle); },
    async key(key, code = key, keyCode = 0) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
    },
    type: (text) => send('Input.insertText', { text }),
    /** Screenshot to tests/output/<name>.jpg, only with `npm test -- --shots`. */
    async shot(name, full = false) {
      if (process.env.TEST_SHOTS !== '1') return;
      const opts = { format: 'jpeg', quality: 80 };
      if (full) {
        const size = await ev('({ w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight })');
        Object.assign(opts, { clip: { x: 0, y: 0, width: size.w, height: size.h, scale: 1 }, captureBeyondViewport: true });
      }
      const { data } = await send('Page.captureScreenshot', opts);
      mkdirSync(OUTPUT, { recursive: true });
      writeFileSync(path.join(OUTPUT, `${name}.jpg`), Buffer.from(data, 'base64'));
    },
    /** Back to a fresh start between parts of a file: blank tab, no cookies/storage, light theme, VI, 1280×900. */
    async reset() {
      await b.nav('about:blank', 0);
      await send('Network.clearBrowserCookies');
      await send('Storage.clearDataForOrigin', { origin: new URL(BASE).origin, storageTypes: 'all' });
      await send('Emulation.setEmulatedMedia', { features: [] });
      await b.viewport(width, height);
      for (const [name, value] of Object.entries(cookies)) await b.setCookie(name, value);
    },
    async close() {
      try { ws.close(); } catch {}
      chrome.kill();
      await sleep(300);
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
    },
  };
  await b.viewport(width, height);
  for (const [name, value] of Object.entries(cookies)) await b.setCookie(name, value);
  return b;
}
