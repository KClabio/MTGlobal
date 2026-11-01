// 40, 41 · W3C validity: every page's HTML and the joined style files, checked with the official W3C Nu checker
// (npm package vnu-jar, run locally with Java; nothing is sent out). Pages: the public ones (VI and EN), a customer's
// account pages and the admin pages. Results per message, with the pages where it appears.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '../lib/http.mjs';
import { QA_ACCOUNTS } from '../lib/data.mjs';
import { QA_PASSWORD, QA_DIR, PROGRESS, ROOT } from '../lib/infra.mjs';

const require = createRequire(path.join(ROOT, 'package.json'));
const VNU = () => require('vnu-jar'); // the path of vnu.jar
const publicPages = () => JSON.parse(readFileSync(PROGRESS, 'utf8')).steps[0].results.pages.list.filter((p) => !/^\/(dang-nhap\/google|dang-xuat)/.test(p));
const ACCOUNT_PAGES = ['/tai-khoan', '/ho-so'];
const ADMIN_PAGES = ['/admin', '/admin/yeu-cau', '/admin/san-pham', '/admin/du-an', '/admin/doi-tac', '/admin/tin-tuc', '/admin/dich-vu', '/admin/nguoi-dung', '/admin/cai-dat', '/admin/thong-tin-cong-ty', '/admin/ho-tro', '/admin/nhat-ky-loi'];

function javaReady() {
  try { execFileSync('java', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

/** Runs vnu.jar on files (it writes its JSON report to stderr); → [{ file, type: 'error'|'info', subType, message, extract }] */
function vnuReport(files, extra = []) {
  const r = spawnSync('java', ['-jar', VNU(), '--format', 'json', '--exit-zero-always', ...extra, ...files], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const text = (r.stderr || '').trim() || (r.stdout || '').trim();
  if (!text.startsWith('{')) throw new Error(`vnu.jar gave no report: ${text.slice(0, 300)}`);
  return JSON.parse(text).messages.map((m) => ({ file: path.basename(decodeURIComponent(String(m.url || ''))), type: m.type, subType: m.subType || '', message: m.message, extract: (m.extract || '').replace(/\s+/g, ' ').slice(0, 160) }));
}

/** Groups messages by text: [{ message, type, count, pages: [...] , extract }] most frequent first */
function group(messages, nameOf) {
  const by = new Map();
  for (const m of messages) {
    const key = `${m.type}|${m.subType}|${m.message}`;
    const g = by.get(key) || { type: m.subType === 'warning' ? 'warning' : m.type, message: m.message, count: 0, pages: new Set(), extract: m.extract };
    g.count++; g.pages.add(nameOf(m.file));
    by.set(key, g);
  }
  return [...by.values()].map((g) => ({ ...g, pages: [...g.pages].slice(0, 12), pageCount: g.pages.size })).sort((a, b) => (a.type === 'error' ? 0 : 1) - (b.type === 'error' ? 0 : 1) || b.count - a.count);
}

export const scenarios = [
  {
    id: 40,
    name: 'W3C HTML validity (official Nu checker): public pages VI + EN, account and admin pages',
    types: ['HTML Validation', 'Standards'],
    async run(ctx) {
      if (!javaReady()) throw new Error('Java is not installed (winget install EclipseAdoptium.Temurin.17.JRE)');
      const dir = path.join(QA_DIR, 'html');
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const names = new Map(); // file name -> "VI /page"
      const save = (label, html) => { const f = path.join(dir, `${String(names.size).padStart(3, '0')}.html`); writeFileSync(f, html); names.set(path.basename(f), label); return f; };
      const files = [];
      const vi = new Client();
      const en = new Client(); en.cookies.set('lang', 'en');
      for (const p of publicPages()) {
        for (const [lang, c] of [['VI', vi], ['EN', en]]) {
          const r = await c.get(p);
          if (r.status === 200 && /text\/html/.test(r.headers.get('content-type') || '')) files.push(save(`${lang} ${p}`, r.text));
        }
      }
      const cust = new Client(); await cust.login(QA_ACCOUNTS.customer(7), QA_PASSWORD);
      for (const p of ACCOUNT_PAGES) { const r = await cust.get(p); if (r.status === 200) files.push(save(`customer ${p}`, r.text)); }
      const admin = new Client(); await admin.login(QA_ACCOUNTS.owner, QA_PASSWORD);
      for (const p of ADMIN_PAGES) { const r = await admin.get(p); if (r.status === 200) files.push(save(`owner ${p}`, r.text)); }
      ctx.log(`${files.length} pages saved, checking…`);
      const messages = vnuReport(files);
      const groups = group(messages, (f) => names.get(f) || f);
      const errors = messages.filter((m) => m.type === 'error').length;
      const warnings = messages.filter((m) => m.subType === 'warning').length;
      ctx.result('html', { pages: files.length, errors, warnings, groups: groups.slice(0, 40) });
      ctx.log(`${errors} errors, ${warnings} warnings in ${files.length} pages (${groups.length} different messages)`);
      if (errors) {
        const top = groups.filter((g) => g.type === 'error').slice(0, 6).map((g) => `"${g.message}" (${g.count}×, e.g. ${g.pages.slice(0, 3).join(', ')})`).join('; ');
        ctx.finding({ severity: 'low', title: 'HTML errors found by the W3C checker', detail: `${errors} errors in ${files.length} pages. Most frequent: ${top}.`, fix: 'Correct the markup in the templates named; browsers usually cope, but valid HTML avoids odd behaviour in screen readers and older browsers.' });
      }
    },
  },
  {
    id: 41,
    name: 'W3C CSS validity: the joined style files',
    types: ['CSS Validation', 'Standards'],
    async run(ctx) {
      if (!javaReady()) throw new Error('Java is not installed');
      const dir = path.join(QA_DIR, 'css');
      mkdirSync(dir, { recursive: true });
      const c = new Client();
      const files = [];
      for (const url of ['/css/site.css', '/css/admin-all.css']) {
        const r = await c.get(url);
        const f = path.join(dir, path.basename(url));
        writeFileSync(f, r.text);
        files.push(f);
      }
      const messages = vnuReport(files, ['--css']);
      const groups = group(messages, (f) => f);
      const errors = messages.filter((m) => m.type === 'error').length;
      ctx.result('css', { errors, warnings: messages.filter((m) => m.subType === 'warning').length, groups: groups.slice(0, 30) });
      ctx.log(`${errors} CSS errors`);
      if (errors) ctx.finding({ severity: 'low', title: 'CSS rules the W3C checker does not accept', detail: groups.filter((g) => g.type === 'error').slice(0, 6).map((g) => `"${g.message}" (${g.count}×)`).join('; '), fix: 'Check each: newer CSS the checker does not know yet is fine; real mistakes are corrected.' });
    },
  },
];
