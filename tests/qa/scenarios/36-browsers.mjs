// 9, 10, 11, 12, 36 · Accessibility scans, keyboard, print, and the site in Chrome, Firefox and Safari's engine
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { Client } from '../lib/http.mjs';
import { QA_ACCOUNTS } from '../lib/data.mjs';
import { QA_PASSWORD, QA_DIR, PROGRESS, ROOT, BASE } from '../lib/infra.mjs';

const publicPages = () => JSON.parse(readFileSync(PROGRESS, 'utf8')).steps[0].results.pages.list.filter((p) => !/^\/(dang-nhap\/google|lien-he)$/.test(p));
const AXE = readFileSync(path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const SHOTS = path.join(QA_DIR, 'shots');
const KEY_PAGES = ['/', '/giai-phap/stem-lab', '/giai-phap/thiet-bi', '/giai-phap/du-an', '/san-pham/robot-leo-cau-thang', '/dich-vu/tu-van-du-hoc', '/tin-tuc', '/ve-mtg', '/dang-ky', '/lien-he'];

async function sessionCookie(email) {
  const c = new Client(); await c.login(email, QA_PASSWORD);
  return { name: 'connect.sid', value: c.cookies.get('connect.sid'), domain: 'localhost', path: '/' };
}

export const scenarios = [
  {
    id: 9,
    name: 'Accessibility scan of every page: VI/EN × light/dark × phone/desktop',
    types: ['Color Contrast', 'Screen Reader', 'Alt Text Validation', 'Accessibility'],
    async run(ctx) {
      const browser = await chromium.launch();
      const rules = ctx.state.rules || {};
      const done = new Set(ctx.state.done || []);
      const customer = await sessionCookie(QA_ACCOUNTS.customer(11));
      const admin = await sessionCookie(QA_ACCOUNTS.admin);
      const targets = [...publicPages().map((p) => [p, null]), ['/lien-he', customer], ['/tai-khoan', customer], ['/ho-so', customer], ['/admin', admin], ['/admin/yeu-cau', admin], ['/admin/nguoi-dung', admin], ['/admin/cai-dat', admin]];
      try {
        for (const lang of ['vi', 'en']) for (const theme of ['light', 'dark']) for (const [w, h] of [[1280, 900], [390, 844]]) {
          const variant = `${lang}-${theme}-${w}`;
          if (done.has(variant)) continue;
          const context = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', bypassCSP: true }); // the scanner is added as a script
          for (const [p, cookie] of targets) {
            await context.clearCookies();
            await context.addCookies([{ name: 'lang', value: lang, domain: 'localhost', path: '/' }, { name: 'adminLang', value: lang, domain: 'localhost', path: '/' }, { name: 'theme', value: theme, domain: 'localhost', path: '/' }, ...(cookie ? [cookie] : [])]);
            const page = await context.newPage();
            await page.goto(BASE + p, { waitUntil: 'load' });
            // A process trail on the first screen fades its steps in one after another (about 2.5 s): scan the finished page
            if (await page.$('.process-trail')) await page.waitForFunction(() => [...document.querySelectorAll('.process-trail')].every((t) => t.classList.contains('is-settled') || t.getBoundingClientRect().top > innerHeight), null, { timeout: 6000 }).catch(() => {});
            await page.addScriptTag({ content: AXE });
            const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'], resultTypes: ['violations'] })).violations
              .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + (n.any[0] && n.any[0].data && n.any[0].data.contrastRatio ? ` (contrast ${n.any[0].data.contrastRatio}:1, needs ${n.any[0].data.expectedContrastRatio})` : '')), count: v.nodes.length })));
            for (const v of res) {
              const r = (rules[v.id] ||= { impact: v.impact, help: v.help, pages: {}, samples: [] });
              const key = p.replace(/[0-9a-f]{24}/, ':id');
              r.pages[key] = [...new Set([...(r.pages[key] || []), variant])];
              if (r.samples.length < 6) r.samples.push(`${key} [${variant}]: ${v.nodes.join(' | ')}`);
            }
            await page.close();
          }
          await context.close();
          done.add(variant);
          ctx.log(`${variant}: ${Object.keys(rules).length} kinds of problem so far`);
          if (ctx.checkpoint(`${variant} scanned`, { rules, done: [...done] })) return 'paused';
        }
      } finally { await browser.close(); }
      ctx.result('rules', rules);
      const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
      for (const [id, r] of Object.entries(rules).sort((a, b) => order[a[1].impact] - order[b[1].impact])) {
        const sev = r.impact === 'critical' || r.impact === 'serious' ? 'medium' : 'low';
        ctx.finding({ severity: sev, title: `Accessibility: ${r.help} (${id})`, detail: `${Object.keys(r.pages).length} page(s), e.g. ${r.samples.slice(0, 3).join(' ; ')}`, fix: `See https://dequeuniversity.com/rules/axe/4.10/${id}` });
      }
    },
  },
  {
    id: 10,
    name: 'Keyboard only: focus always visible, never stuck',
    types: ['Keyboard Navigation'],
    async run(ctx) {
      const browser = await chromium.launch();
      const out = {};
      try {
        for (const p of ['/', '/giai-phap/stem-lab', '/giai-phap/thiet-bi', '/dang-ky', '/san-pham/robot-leo-cau-thang']) {
          const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
          await page.goto(BASE + p);
          const seen = []; const invisible = []; let stuck = 0;
          for (let i = 0; i < 80; i++) {
            await page.keyboard.press('Tab');
            const f = await page.evaluate(() => {
              const el = document.activeElement;
              if (!el || el === document.body) return null;
              const cs = getComputedStyle(el);
              const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
              const r = el.getBoundingClientRect();
              return { id: el.tagName + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + ':' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), ring, onScreen: r.width > 0 && r.height > 0 };
            });
            if (!f) continue;
            if (seen.length && seen[seen.length - 1] === f.id) stuck++;
            seen.push(f.id);
            if (!f.ring && f.onScreen) invisible.push(f.id);
          }
          out[p] = { reached: new Set(seen).size, stuckRepeats: stuck, noVisibleFocus: [...new Set(invisible)].slice(0, 8) };
          await page.close();
        }
      } finally { await browser.close(); }
      ctx.result('pages', out);
      const bad = Object.entries(out).filter(([, v]) => v.noVisibleFocus.length);
      if (bad.length) ctx.finding({ severity: 'medium', title: 'Keyboard focus not visible on some elements', detail: bad.map(([p, v]) => `${p}: ${v.noVisibleFocus.join(', ')}`).join(' ; '), fix: 'Give these a :focus-visible outline.' });
    },
  },
  {
    id: 12,
    name: 'Printing a Giải pháp page, a project, a news article and Liên hệ',
    types: ['Print Page Formatting'],
    async run(ctx) {
      const browser = await chromium.launch();
      mkdirSync(path.join(QA_DIR, 'print'), { recursive: true });
      const out = {};
      try {
        const projects = publicPages().filter((p) => /du-an\/[0-9a-f]{24}/.test(p));
        for (const p of ['/giai-phap/stem-lab', projects[0], publicPages().find((x) => /^\/tin-tuc\/[0-9a-f]{24}/.test(x)), '/ve-mtg'].filter(Boolean)) {
          const page = await browser.newPage();
          await page.goto(BASE + p);
          await page.emulateMedia({ media: 'print' });
          const seen = await page.evaluate(() => {
            const vis = (s) => [...document.querySelectorAll(s)].some((e) => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && r.height > 0; });
            return { header: vis('.site-header'), footer: vis('footer'), buttons: vis('main .btn'), themeSwitch: vis('.theme-switch, [data-theme-toggle]'), darkBackground: getComputedStyle(document.body).backgroundColor };
          });
          const file = path.join(QA_DIR, 'print', p.replace(/\W+/g, '_') + '.pdf');
          await page.pdf({ path: file, format: 'A4', printBackground: true });
          const pdf = readFileSync(file).toString('latin1');
          out[p] = { ...seen, pages: (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length, file: path.relative(ROOT, file) };
          await page.close();
        }
      } finally { await browser.close(); }
      ctx.result('pages', out);
      const css = ['base.css', 'layout.css', 'components.css', 'pages.css', 'home.css'].map((f) => readFileSync(path.join(ROOT, 'public', 'css', f), 'utf8')).join('\n');
      ctx.result('hasPrintStyles', /@media\s+print/.test(css));
      if (!/@media\s+print/.test(css)) ctx.finding({ severity: 'low', title: 'No print layout', detail: `Printed pages include the menu, buttons and footer: ${Object.entries(out).map(([p, v]) => `${p} → ${v.pages} A4 page(s)`).join(', ')}`, fix: 'A small @media print block: hide the header menu, buttons, theme switch and sliders; black text on white; show link addresses; avoid splitting pictures.' });
    },
  },
  {
    id: 36,
    name: 'Chrome, Firefox and Safari engine at phone to wide-screen sizes',
    types: ['Cross-Browser', 'Cross-OS', 'Mobile Responsiveness', 'Compatibility'],
    async run(ctx) {
      mkdirSync(SHOTS, { recursive: true });
      const sizes = [[360, 740], [390, 844], [844, 390], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
      const results = ctx.state.results || {};
      const customer = await sessionCookie(QA_ACCOUNTS.customer(12));
      for (const [name, engine] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
        if (results[name]) continue;
        const browser = await engine.launch();
        const r = { problems: [], checked: 0 };
        try {
          for (const [w, h] of sizes) {
            const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: name !== 'firefox' && w < 800, hasTouch: w < 800 });
            await context.addCookies([customer]);
            for (const p of KEY_PAGES) {
              const page = await context.newPage();
              const errors = [];
              page.on('pageerror', (e) => errors.push(e.message));
              page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
              await page.goto(BASE + p, { waitUntil: 'load' });
              await page.waitForTimeout(300);
              const s = await page.evaluate(() => ({
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map((i) => i.getAttribute('src')).slice(0, 3),
                header: !!document.querySelector('.site-header') && document.querySelector('.site-header').getBoundingClientRect().height > 0,
                tinyText: [...document.querySelectorAll('main p, main li')].filter((e) => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 12).length,
              }));
              r.checked++;
              const at = `${p} @${w}×${h}`;
              if (s.overflow > 1) r.problems.push(`${at}: page ${s.overflow}px wider than the screen`);
              if (s.brokenImages.length) r.problems.push(`${at}: pictures not loading ${s.brokenImages.join(', ')}`);
              if (!s.header) r.problems.push(`${at}: header missing`);
              if (s.tinyText) r.problems.push(`${at}: ${s.tinyText} text blocks under 12px`);
              const real = errors.filter((e) => !/favicon|ERR_ABORTED|net::/.test(e));
              if (real.length) r.problems.push(`${at}: script errors: ${real.slice(0, 2).join(' | ')}`);
              if (['/', '/giai-phap/stem-lab'].includes(p) && [390, 1440].includes(w)) await page.screenshot({ path: path.join(SHOTS, `${name}-${p === '/' ? 'home' : 'stem-lab'}-${w}.jpg`), quality: 70, type: 'jpeg' });
              await page.close();
            }
            // On phones the ☰ menu opens
            if (w < 800) {
              const page = await context.newPage();
              await page.goto(BASE + '/');
              const toggle = page.locator('.nav-toggle');
              if (await toggle.isVisible()) {
                await toggle.click();
                await page.waitForTimeout(500);
                const open = await page.evaluate(() => { const m = document.querySelector('.main-nav'); return document.body.classList.contains('nav-open') && !!m && m.getBoundingClientRect().width > 0 && getComputedStyle(m).visibility !== 'hidden'; });
                if (!open) r.problems.push(`☰ menu did not open @${w}×${h}`);
              }
              await page.close();
            }
            await context.close();
          }
        } finally { await browser.close(); }
        results[name] = r;
        ctx.log(`${name}: ${r.checked} page views, ${r.problems.length} problem(s)`);
        if (ctx.checkpoint(`${name} done`, { results })) return 'paused';
      }
      ctx.result('engines', results);
      for (const [name, r] of Object.entries(results)) {
        if (r.problems.length) ctx.finding({ severity: 'medium', title: `Display problems in ${name === 'webkit' ? 'Safari (WebKit)' : name === 'firefox' ? 'Firefox' : 'Chrome/Edge'}`, detail: r.problems.slice(0, 12).join(' ; ') + (r.problems.length > 12 ? ` … (+${r.problems.length - 12})` : ''), fix: 'Fix each layout or script problem listed.' });
      }
    },
  },
];
