// 16, 20, 33, 35 · Security configuration (no attack probing): headers, cookies, sessions, login attempt limit,
// known package flaws, HTTPS readiness
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Client } from '../lib/http.mjs';
import { QA_ACCOUNTS } from '../lib/data.mjs';
import { QA_PASSWORD, ROOT } from '../lib/infra.mjs';

const WANTED_HEADERS = {
  'content-security-policy': 'tells browsers which scripts and pictures may load (limits damage from injected code)',
  'x-frame-options': 'stops other sites from showing this site inside a frame (clickjacking)',
  'x-content-type-options': 'stops browsers from guessing file types',
  'referrer-policy': 'controls what address is passed on to other sites',
  'strict-transport-security': 'keeps visitors on HTTPS once online (HSTS)',
  'permissions-policy': 'switches off camera/microphone/location the site does not use',
};

export const scenarios = [
  {
    id: 16,
    name: 'Log in and out; many wrong passwords in a row',
    types: ['Session Management', 'Brute Force Defense'],
    async run(ctx) {
      const c = new Client();
      const statuses = [];
      for (let i = 0; i < 25; i++) statuses.push((await c.post('/dang-nhap', { email: QA_ACCOUNTS.customer(5), password: `wrong-${i}` })).status);
      const thenRight = await c.post('/dang-nhap', { email: QA_ACCOUNTS.customer(5), password: QA_PASSWORD });
      const limited = statuses.some((s) => s === 429) || thenRight.status !== 303;
      ctx.result('wrongAttempts', { attempts: 25, statuses: [...new Set(statuses)], rightPasswordAfterwards: thenRight.status });
      if (!limited) ctx.finding({ severity: 'high', title: 'No limit on wrong-password attempts', detail: '25 wrong passwords in a row for one account were all answered normally, and the right password still worked straight after. Anyone can keep guessing passwords without being slowed down.', fix: 'Limit attempts per account and per address (e.g. 5 tries, then a 15-minute wait), with a short notice on the login page.' });
      // Logging out really ends the session
      const u = new Client();
      await u.login(QA_ACCOUNTS.customer(6), QA_PASSWORD);
      const sid = u.cookies.get('connect.sid');
      await u.post('/dang-xuat', {});
      const replay = new Client(); replay.cookies.set('connect.sid', sid);
      const after = await replay.get('/tai-khoan');
      ctx.result('logout', { oldCookieAfterLogout: after.status, location: after.location });
      if (after.status === 200) ctx.finding({ severity: 'high', title: 'An old session still works after logging out', detail: 'The session cookie from before logout still opened "Tài khoản".', fix: 'Destroy the session on logout.' });
    },
  },
  {
    id: 20,
    name: 'Sessions and cookies',
    types: ['Session Management', 'Cookie'],
    async run(ctx) {
      const c = new Client();
      const page = await fetch('http://localhost:3001/dang-nhap?lang=en');
      const langCookie = page.headers.getSetCookie().find((x) => x.startsWith('lang=')) || null;
      await c.get('/');
      const before = c.cookies.get('connect.sid') || null;
      const login = await c.post('/dang-nhap', { email: QA_ACCOUNTS.customer(7), password: QA_PASSWORD });
      const raw = login.headers.getSetCookie().find((x) => x.startsWith('connect.sid=')) || '';
      const after = c.cookies.get('connect.sid');
      const flags = { httpOnly: /;\s*HttpOnly/i.test(raw), secure: /;\s*Secure/i.test(raw), sameSite: (raw.match(/SameSite=(\w+)/i) || [])[1] || null, maxAgeDays: Math.round(((raw.match(/Max-Age=(\d+)/i) || [])[1] || 0) / 86400) || ((raw.match(/Expires=([^;]+)/i) || [])[1] ? Math.round((new Date(raw.match(/Expires=([^;]+)/i)[1]) - Date.now()) / 86400000) : null) };
      ctx.result('sessionCookie', { ...flags, newIdAtLogin: !!after && after !== before });
      ctx.result('otherCookies', { lang: langCookie && langCookie.replace(/=[^;]*/, '=…'), theme: 'theme=light|dark (set by the page script)', adminLang: 'adminLang=vi|en' });
      if (!flags.httpOnly) ctx.finding({ severity: 'high', title: 'Session cookie readable by page scripts', detail: raw, fix: 'httpOnly: true' });
      // Two devices at once: both stay logged in, each with its own session
      const d1 = new Client(); const d2 = new Client();
      await d1.login(QA_ACCOUNTS.customer(8), QA_PASSWORD); await d2.login(QA_ACCOUNTS.customer(8), QA_PASSWORD);
      ctx.result('twoDevices', { first: (await d1.get('/tai-khoan')).status, second: (await d2.get('/tai-khoan')).status, different: d1.cookies.get('connect.sid') !== d2.cookies.get('connect.sid') });
      // Session store: how many sessions does the QA database hold, and do they expire?
      const db = await ctx.infra.db();
      const ix = await db.collection('sessions').indexes();
      ctx.result('sessionStore', { count: await db.collection('sessions').countDocuments(), ttlIndex: ix.some((i) => 'expireAfterSeconds' in i) });
      // A built-in fallback secret is used when .env has none (git grep exits with 1 when nothing is found: all good)
      let code = '';
      try { code = execFileSync('git', ['grep', '-n', 'mtglobal-dev-secret', '--', 'server.js'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { if (e.status !== 1) throw e; }
      ctx.result('builtInSecret', code ? 'found' : 'none');
      if (code) ctx.finding({ severity: 'high', title: 'Session secret falls back to a value written in the public code', detail: `${code}. If the live server's .env ever lacks SESSION_SECRET, anyone who reads the public repository could forge logins.`, fix: 'Refuse to start in production without SESSION_SECRET.' });
    },
  },
  {
    id: 33,
    name: 'Security configuration: headers, known package flaws',
    types: ['Vulnerability', 'Security'],
    async run(ctx) {
      const pages = ['/', '/dang-nhap', '/giai-phap/stem-lab', '/css/base.css'];
      const seen = {};
      for (const p of pages) {
        const r = await fetch('http://localhost:3001' + p);
        seen[p] = Object.fromEntries([...Object.keys(WANTED_HEADERS), 'x-powered-by', 'cache-control', 'content-encoding'].map((h) => [h, r.headers.get(h)]));
      }
      // HSTS is sent on the live server only (on a computer without HTTPS it would lock the browser to https://localhost):
      // look at it with the site started as on the live server
      await ctx.infra.restartServer({ env: { NODE_ENV: 'production', SESSION_SECRET: randomBytes(32).toString('hex') } });
      try {
        const live = await fetch('http://localhost:3001/');
        seen['/ (live server settings)'] = { 'strict-transport-security': live.headers.get('strict-transport-security') };
      } finally { await ctx.infra.restartServer({}); }
      ctx.result('headers', seen);
      const live = (h) => h === 'strict-transport-security' ? seen['/ (live server settings)'][h] : seen['/'][h];
      const missing = Object.keys(WANTED_HEADERS).filter((h) => !live(h));
      if (missing.length) ctx.finding({ severity: 'high', title: 'Security headers are missing', detail: missing.map((h) => `${h}: ${WANTED_HEADERS[h]}`).join('; '), fix: 'Add them in one place (the "helmet" package), with a content policy that allows the site\'s own files and Google login.' });
      if (seen['/']['x-powered-by']) ctx.finding({ severity: 'low', title: 'The server says which software it runs', detail: `X-Powered-By: ${seen['/']['x-powered-by']}`, fix: 'app.disable("x-powered-by") (helmet does this).' });
      let audit = null;
      try { audit = JSON.parse(execFileSync('npm', ['audit', '--json', '--omit=dev'], { cwd: ROOT, encoding: 'utf8', shell: true })); } catch (e) { try { audit = JSON.parse(e.stdout); } catch { audit = null; } }
      if (audit) {
        const v = audit.metadata && audit.metadata.vulnerabilities;
        const list = Object.values(audit.vulnerabilities || {}).map((x) => `${x.name} (${x.severity})`);
        ctx.result('npmAudit', { counts: v, packages: list });
        if (v && (v.high || v.critical)) ctx.finding({ severity: 'high', title: 'Packages with known security flaws', detail: list.join(', '), fix: 'Update them (npm audit fix), then run the tests.' });
        else if (v && (v.moderate || v.low)) ctx.finding({ severity: 'low', title: 'Packages with minor known flaws', detail: list.join(', '), fix: 'Update at the next routine update.' });
      }
    },
  },
  {
    id: 35,
    name: 'HTTPS readiness (behind the host\'s HTTPS)',
    types: ['SSL/TLS'],
    async run(ctx) {
      // As on a host: HTTPS ends at the host's proxy, which tells the app with X-Forwarded-Proto
      await ctx.infra.restartServer({ env: { TRUST_PROXY: '1', SESSION_COOKIE_SECURE: 'true' } });
      const r = await fetch('http://localhost:3001/dang-nhap', { method: 'POST', redirect: 'manual', headers: { 'x-forwarded-proto': 'https', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: QA_ACCOUNTS.customer(9), password: QA_PASSWORD }) });
      const cookie = r.headers.getSetCookie().find((x) => x.startsWith('connect.sid=')) || '';
      const plain = await fetch('http://localhost:3001/dang-nhap', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: QA_ACCOUNTS.customer(9), password: QA_PASSWORD }) });
      const plainCookie = plain.headers.getSetCookie().find((x) => x.startsWith('connect.sid=')) || '';
      const home = await fetch('http://localhost:3001/', { headers: { 'x-forwarded-proto': 'https' } });
      const html = await home.text();
      const mixed = [...new Set([...html.matchAll(/(?:src|href)="(http:\/\/[^"]+)"/g)].map((m) => m[1]))];
      const res = { secureCookieOverHttps: /;\s*Secure/i.test(cookie), cookieOverPlainHttp: !!plainCookie, hsts: home.headers.get('strict-transport-security'), mixedContent: mixed, httpToHttpsRedirect: 'done by the host (to check on launch day)' };
      ctx.result('https', res);
      if (!res.secureCookieOverHttps) ctx.finding({ severity: 'high', title: 'Login cookie not marked Secure behind HTTPS', detail: JSON.stringify(res), fix: 'Set TRUST_PROXY and SESSION_COOKIE_SECURE=true on the host.' });
      if (mixed.length) ctx.finding({ severity: 'medium', title: 'Plain-http files on an HTTPS page', detail: mixed.join(', '), fix: 'Use https:// or relative addresses.' });
      await ctx.infra.restartServer({});
    },
  },
];
