// 8, 13, 34 · Links and files, redirects, error pages, sitemap/robots, language completeness
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from '../lib/http.mjs';
import { linksIn } from '../lib/pages.mjs';
import { ROOT, PROGRESS } from '../lib/infra.mjs';
import { QA_ACCOUNTS } from '../lib/data.mjs';
import { QA_PASSWORD } from '../lib/infra.mjs';

const publicPages = () => JSON.parse(readFileSync(PROGRESS, 'utf8')).steps[0].results.pages.list.filter((p) => p !== '/dang-nhap/google');
const FILE_RE = /(?:src|href|poster)="(\/[^"#?]+\.(?:css|js|jpe?g|png|webp|gif|svg|ico|mp4|webm|pdf|woff2?))"/gi;

export const scenarios = [
  {
    id: 34,
    name: 'Every link, picture and file; redirects; sitemap and robots',
    types: ['Link', 'Broken Redirect', 'Sitemap & Robots'],
    async run(ctx) {
      const c = new Client();
      const pages = publicPages();
      const links = new Map(); // target -> first page it was found on
      const files = new Map();
      const done = new Set(ctx.state.donePages || []);
      const broken = ctx.state.broken || [];
      for (const p of pages) {
        if (done.has(p)) continue;
        const r = await c.get(p);
        for (const l of linksIn(r.text)) if (!links.has(l)) links.set(l, p);
        for (const m of r.text.matchAll(FILE_RE)) if (!files.has(m[1])) files.set(m[1], p);
        done.add(p);
      }
      // Every internal link and file answers (a redirect is followed once and its code noted)
      const redirects = [];
      for (const [target, from] of [...links, ...files]) {
        if (/^\/(dang-xuat|dang-nhap\/google)/.test(target)) continue;
        const r = await fetch('http://localhost:3001' + target, { redirect: 'manual', headers: { 'sec-fetch-dest': /\.(mp4|webm)$/.test(target) ? 'video' : 'document' } });
        if (r.status >= 300 && r.status < 400) {
          const loc = r.headers.get('location');
          const next = await fetch(new URL(loc, 'http://localhost:3001'), { redirect: 'manual' });
          redirects.push({ target, status: r.status, to: loc, then: next.status });
        } else if (r.status >= 400) broken.push({ target, status: r.status, from });
      }
      ctx.result('counts', { pages: pages.length, links: links.size, files: files.size });
      ctx.result('broken', broken);
      ctx.result('redirects', redirects);
      if (broken.length) ctx.finding({ severity: 'medium', title: 'Broken links or files', detail: broken.map((b) => `${b.target} (${b.status}) on ${b.from}`).join('; '), fix: 'Fix each link or put the file back.' });
      const chains = redirects.filter((r) => r.then >= 300 && r.then < 400);
      if (chains.length) ctx.finding({ severity: 'low', title: 'Redirect chains', detail: JSON.stringify(chains), fix: 'Point links at the final address.' });
      // Temporary vs permanent: old admin addresses use 302
      const perm = await fetch('http://localhost:3001/admin/san-pham', { redirect: 'manual' });
      ctx.result('oldAddressRedirect', { path: '/admin/san-pham', status: perm.status, to: perm.headers.get('location') });
      // Search engine files
      const sitemap = await fetch('http://localhost:3001/sitemap.xml');
      const robots = await fetch('http://localhost:3001/robots.txt');
      const seo = { sitemap: sitemap.status, robots: robots.status };
      if (sitemap.status === 200 && robots.status === 200) {
        // Every address in the sitemap opens (200, no redirect), and robots.txt keeps search engines out of private pages
        const locs = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
        const broken = [];
        for (const u of locs) { const r = await fetch(u, { redirect: 'manual' }); if (r.status !== 200) broken.push(`${r.status} ${u.replace('http://localhost:3001', '')}`); }
        const rt = await robots.text();
        Object.assign(seo, { addresses: locs.length, english: locs.filter((u) => u.endsWith('lang=en')).length, broken, robotsDisallow: ['/admin', '/tai-khoan', '/ho-so'].filter((p) => rt.includes(`Disallow: ${p}`)), robotsPointsToSitemap: /Sitemap: http.*\/sitemap\.xml/.test(rt) });
        if (broken.length) ctx.finding({ severity: 'medium', title: 'Sitemap lists pages that do not open', detail: broken.slice(0, 10).join('; '), fix: 'Only list pages that exist (lib/sitemap.js).' });
      }
      ctx.result('seoFiles', seo);
      if (sitemap.status !== 200 || robots.status !== 200) ctx.finding({ severity: 'medium', title: 'No sitemap.xml and no robots.txt', detail: `sitemap.xml → ${sitemap.status}, robots.txt → ${robots.status}. Search engines find fewer pages, and nothing tells them to stay out of /admin.`, fix: 'Serve a sitemap built from the pages, projects, equipment and news (both languages), and a robots.txt that points to it and excludes /admin, /tai-khoan and /ho-so.' });
      // Page titles and descriptions for search results and link previews
      const meta = [];
      for (const p of pages) {
        const html = (await c.get(p)).text;
        meta.push({ p, title: (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '', desc: !!/<meta name="description"/.test(html), og: !!/<meta property="og:/.test(html), canonical: !!/rel="canonical"/.test(html), hreflang: !!/hreflang=/.test(html) });
      }
      const titles = meta.map((m) => m.title);
      const dupTitles = titles.filter((t, i) => titles.indexOf(t) !== i);
      ctx.result('meta', { pages: meta.length, withDescription: meta.filter((m) => m.desc).length, withOpenGraph: meta.filter((m) => m.og).length, withCanonical: meta.filter((m) => m.canonical).length, duplicateTitles: [...new Set(dupTitles)] });
      if (meta.filter((m) => !m.og).length) ctx.finding({ severity: 'low', title: 'No link previews (Open Graph) for Facebook and Zalo', detail: `${meta.filter((m) => !m.og).length} of ${meta.length} pages have no og: tags; ${meta.filter((m) => !m.desc).length} have no description`, fix: 'Add og:title, og:description, og:image and a description to the shared page head.' });
    },
  },
  {
    id: 13,
    name: 'Old or wrong addresses: 404, 403, redirects, never a crash',
    types: ['Error Message', 'Broken Redirect', 'Navigation'],
    async run(ctx) {
      const guest = new Client();
      const cust = new Client(); await cust.login(QA_ACCOUNTS.customer(10), QA_PASSWORD);
      const cases = [
        ['guest', '/khong-ton-tai', 404], ['guest', '/giai-phap/du-an/000000000000000000000000', 404], ['guest', '/giai-phap/du-an/abc', 404],
        ['guest', '/tin-tuc/abc', 404], ['guest', '/doi-tac/khong-co', 404], ['guest', '/san-pham/khong-co', 404], ['guest', '/dich-vu/khong-co', 404],
        ['guest', '/admin', 302], ['guest', '/tai-khoan', 302], ['guest', '/ho-so', 302],
        ['customer', '/admin', 403], ['customer', '/admin/nguoi-dung', 403], ['customer', '/tai-khoan/yeu-cau/abc/sua', 404],
      ];
      const out = [];
      for (const [who, p, want] of cases) {
        const r = await (who === 'guest' ? guest : cust).get(p);
        out.push({ who, p, status: r.status, want, ok: r.status === want || (want === 302 && r.status === 303), page: /<title>([^<]*)/.exec(r.text)?.[1] || '' });
      }
      ctx.result('cases', out);
      const bad = out.filter((o) => !o.ok);
      if (bad.length) ctx.finding({ severity: bad.some((b) => b.status >= 500) ? 'high' : 'low', title: 'Wrong answer for an old or wrong address', detail: bad.map((b) => `${b.who} ${b.p}: ${b.status} (expected ${b.want})`).join('; '), fix: 'Return the 404/403 page for these.' });
    },
  },
  {
    id: 8,
    name: 'VI ↔ EN: nothing left untranslated',
    types: ['Localization', 'Internationalization'],
    async run(ctx) {
      const vi = JSON.parse(readFileSync(path.join(ROOT, 'locales', 'vi.json'), 'utf8'));
      const en = JSON.parse(readFileSync(path.join(ROOT, 'locales', 'en.json'), 'utf8'));
      const keys = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${pre}${k}.`) : [`${pre}${k}`]));
      const kv = new Set(keys(vi)); const ke = new Set(keys(en));
      const onlyVi = [...kv].filter((k) => !ke.has(k)); const onlyEn = [...ke].filter((k) => !kv.has(k));
      ctx.result('localeKeys', { vi: kv.size, en: ke.size, onlyVi, onlyEn });
      if (onlyVi.length || onlyEn.length) ctx.finding({ severity: 'medium', title: 'Texts missing in one language', detail: `only in vi.json: ${onlyVi.join(', ') || '—'}; only in en.json: ${onlyEn.join(', ') || '—'}`, fix: 'Add the missing translations.' });
      // English pages: words with Vietnamese letters outside names/addresses, and raw keys like "nav.home"
      const c = new Client(); await c.get('/?lang=en');
      const VI = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
      const report = [];
      for (const p of publicPages()) {
        const r = await c.get(p);
        if (r.status !== 200) continue; // e.g. Liên hệ sends logged-out visitors to the login page
        const lang = (r.text.match(/<html lang="([^"]+)"/) || [])[1];
        const body = r.text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n');
        const lines = body.split('\n').map((s) => s.replace(/&[a-z#0-9]+;/g, ' ').trim()).filter(Boolean);
        const viLines = lines.filter((l) => VI.test(l));
        const rawKeys = lines.filter((l) => /^[a-z]+(\.[a-zA-Z]+){1,4}$/.test(l));
        report.push({ p, lang, viLines: viLines.length, sample: viLines.slice(0, 4), rawKeys });
      }
      ctx.result('englishPages', report);
      const wrongLang = report.filter((r) => r.lang !== 'en');
      if (wrongLang.length) ctx.finding({ severity: 'medium', title: 'English pages not marked as English', detail: wrongLang.map((r) => r.p).join(', '), fix: 'Set <html lang> from the chosen language.' });
      const raw = report.filter((r) => r.rawKeys.length);
      if (raw.length) ctx.finding({ severity: 'medium', title: 'Untranslated text keys shown on English pages', detail: raw.map((r) => `${r.p}: ${r.rawKeys.join(', ')}`).join('; '), fix: 'Add the keys to en.json.' });
    },
  },
];
