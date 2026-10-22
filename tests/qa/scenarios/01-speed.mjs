// 1 · Page speed (Lighthouse): the main pages on a mid-range phone over 4G and on a desktop
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';
import { chromium } from 'playwright';
import { QA_DIR, BASE } from '../lib/infra.mjs';

const PAGES = ['/', '/giai-phap', '/giai-phap/stem-lab', '/giai-phap/thiet-bi', '/giai-phap/du-an', '/san-pham', '/san-pham/robot-leo-cau-thang', '/dich-vu', '/tin-tuc', '/ve-mtg'];

export const scenarios = [{
  id: 1,
  name: 'Page speed of the 10 main pages, phone and desktop (Lighthouse)',
  types: ['Page Speed', 'Performance', 'SEO', 'Best Practices'],
  async run(ctx) {
    mkdirSync(path.join(QA_DIR, 'lighthouse'), { recursive: true });
    const done = ctx.state.pages || {};
    const chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox'] });
    try {
      for (const p of PAGES) for (const device of ['mobile', 'desktop']) {
        const key = `${device} ${p}`;
        if (done[key]) continue;
        const r = await lighthouse(BASE + p, { port: chrome.port, output: 'html', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] }, device === 'desktop' ? desktopConfig : undefined);
        const a = r.lhr.audits;
        const n = (id) => (a[id] && a[id].numericValue != null ? Math.round(a[id].numericValue) : null);
        done[key] = {
          scores: Object.fromEntries(Object.entries(r.lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)])),
          fcpMs: n('first-contentful-paint'), lcpMs: n('largest-contentful-paint'), tbtMs: n('total-blocking-time'), cls: a['cumulative-layout-shift'] ? +a['cumulative-layout-shift'].numericValue.toFixed(3) : null,
          weightKB: Math.round((n('total-byte-weight') || 0) / 1024),
          opportunities: Object.values(a).filter((x) => x.details && x.details.type === 'opportunity' && (x.details.overallSavingsMs > 100 || x.details.overallSavingsBytes > 50000))
            .map((x) => `${x.title}: save ~${Math.round(x.details.overallSavingsMs || 0)} ms / ${Math.round((x.details.overallSavingsBytes || 0) / 1024)} KB`).slice(0, 6),
          biggest: ((a['total-byte-weight'] && a['total-byte-weight'].details && a['total-byte-weight'].details.items) || []).slice(0, 4).map((i) => `${i.url.replace(BASE, '')} ${Math.round(i.totalBytes / 1024)} KB`),
          failedSeo: Object.values(a).filter((x) => r.lhr.categories.seo.auditRefs.some((ref) => ref.id === x.id) && x.score === 0).map((x) => x.title),
        };
        writeFileSync(path.join(QA_DIR, 'lighthouse', `${device}${p.replace(/\W+/g, '_') || '_home'}.html`), r.report);
        ctx.log(`${key}: perf ${done[key].scores.performance}, LCP ${done[key].lcpMs} ms, ${done[key].weightKB} KB`);
        if (ctx.checkpoint(`${key} measured`, { pages: done })) return 'paused';
      }
    } finally { await chrome.kill(); }
    ctx.result('pages', done);
    const slow = Object.entries(done).filter(([k, v]) => k.startsWith('mobile') && (v.scores.performance < 70 || v.lcpMs > 4000));
    if (slow.length) ctx.finding({ severity: 'medium', title: 'Slow on phones (Lighthouse, 4G)', detail: slow.map(([k, v]) => `${k.replace('mobile ', '')}: score ${v.scores.performance}, main picture after ${(v.lcpMs / 1000).toFixed(1)} s, ${v.weightKB} KB`).join('; '), fix: 'See the speed items in the report.' });
    const heavy = Object.entries(done).filter(([k, v]) => k.startsWith('mobile') && v.weightKB > 2500);
    if (heavy.length) ctx.finding({ severity: 'medium', title: 'Heavy pages for phones', detail: heavy.map(([k, v]) => `${k.replace('mobile ', '')}: ${v.weightKB} KB (${v.biggest.slice(0, 2).join(', ')})`).join('; '), fix: 'Resize/convert pictures (WebP), srcset, lazy loading.' });
  },
}];
