// Simulated visitors ("virtual users"): each one follows a real path through the site, waits between pages like a
// person reading, loads each page's CSS/JS/pictures once (then the browser cache has them), and every request is
// timed. Used by the load, stress, spike and endurance scenarios.
import { Client } from './http.mjs';
import { QA_ACCOUNTS, CUSTOMERS } from './data.mjs';
import { QA_PASSWORD } from './infra.mjs';

export const LOAD_MARK = '[QA-LOAD]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}
export function summarize(records, seconds) {
  const html = records.filter((r) => r.kind === 'page');
  const all = records.map((r) => r.ms).sort((a, b) => a - b);
  const pages = html.map((r) => r.ms).sort((a, b) => a - b);
  const errors = records.filter((r) => r.error || r.status >= 500);
  const r1 = (n) => Math.round(n);
  return {
    requests: records.length, pageViews: html.length, perSecond: +(records.length / seconds).toFixed(1), pagesPerSecond: +(html.length / seconds).toFixed(1),
    pageMs: { p50: r1(pct(pages, 50)), p95: r1(pct(pages, 95)), p99: r1(pct(pages, 99)), max: r1(pages[pages.length - 1] || 0) },
    allMs: { p50: r1(pct(all, 50)), p95: r1(pct(all, 95)), max: r1(all[all.length - 1] || 0) },
    errors: errors.length, errorRate: records.length ? +(100 * errors.length / records.length).toFixed(2) : 0,
    errorKinds: [...new Set(errors.map((e) => e.error || `HTTP ${e.status}`))].slice(0, 5),
    slowest: Object.entries(html.reduce((m, r) => { const k = r.path.replace(/[0-9a-f]{24}/g, ':id'); (m[k] ||= []).push(r.ms); return m; }, {}))
      .map(([k, v]) => [k, r1(v.sort((a, b) => a - b)[Math.floor(v.length * 0.95)] || 0), v.length]).sort((a, b) => b[1] - a[1]).slice(0, 6),
  };
}

const ASSET_RE = /(?:src|href)="(\/(?:css|js|images|assets|uploads|vendor)\/[^"?#]+)/g;

/** The paths people take. Public pages come from the smoke crawl (scenario 0). */
export function makeFlows(pages) {
  const of = (re) => pages.filter((p) => re.test(p));
  const solution = of(/^\/giai-phap\/(stem-lab|workshop|dao-tao|tap-huan)$/);
  const projects = of(/^\/giai-phap\/du-an\/[0-9a-f]{24}$/);
  const equipment = of(/^\/giai-phap\/thiet-bi\/[0-9a-f]{24}$/);
  const robots = of(/^\/san-pham\/[a-z-]+$/);
  const partners = of(/^\/doi-tac\//);
  const browse = () => ['/', pick(['/giai-phap', '/san-pham', '/dich-vu']), pick(solution), pick([...projects, ...equipment]), pick([...robots, ...partners, '/ve-mtg', '/tin-tuc'])];
  return [
    { name: 'browse', weight: 60, steps: browse },
    { name: 'search', weight: 12, steps: () => ['/', '/giai-phap/thiet-bi', `/giai-phap/thiet-bi?q=${pick(['robot', 'cảm biến', 'vex', 'lắp ráp'])}`, '/giai-phap/du-an', `/giai-phap/du-an?q=${pick(['tiểu học', 'THCS', 'Hà Nội'])}`] },
    { name: 'english', weight: 8, steps: () => ['/?lang=en', pick(solution), pick(robots), '/lien-he'] },
    { name: 'request', weight: 15, login: 'customer', steps: () => ['/', pick(robots), 'LOGIN', '/lien-he', 'SEND', '/tai-khoan'] },
    { name: 'admin', weight: 5, login: 'admin', steps: () => ['LOGIN', '/admin', '/admin/yeu-cau', '/admin/nguoi-dung', '/admin/yeu-cau?status=moi'] },
  ];
}

/**
 * Runs `users` simulated people for `seconds` (started evenly over `rampSec`). think: [min, max] ms between pages.
 * Returns the request records. shouldStop() is polled to end early (pause).
 */
export async function runUsers({ users, seconds, rampSec = 10, think = [2000, 6000], flows, shouldStop = () => false, onRecord, keep = true }) {
  const records = [];
  const end = Date.now() + seconds * 1000;
  const total = flows.reduce((s, f) => s + f.weight, 0);
  const chooseFlow = () => { let x = Math.random() * total; for (const f of flows) { if ((x -= f.weight) < 0) return f; } return flows[0]; };
  const rec = (r) => { if (keep) records.push(r); if (onRecord) onRecord(r); };

  async function timed(c, kind, path, opts) {
    const t = Date.now();
    try {
      const r = await c.req(path, opts);
      rec({ t, kind, path, status: r.status, ms: r.ms });
      return r;
    } catch (e) {
      rec({ t, kind, path, status: 0, ms: Date.now() - t, error: e.name === 'TimeoutError' ? 'timeout (30 s)' : (e.cause && e.cause.code) || e.message });
      return null;
    }
  }

  async function person(i) {
    await sleep((rampSec * 1000 * i) / Math.max(1, users));
    while (Date.now() < end && !shouldStop()) {
      const flow = chooseFlow();
      const c = new Client();
      const cache = new Set();
      for (const step of flow.steps()) {
        if (Date.now() >= end || shouldStop()) break;
        if (step === 'LOGIN') {
          const email = flow.login === 'admin' ? QA_ACCOUNTS.admin : QA_ACCOUNTS.customer(1 + Math.floor(Math.random() * CUSTOMERS));
          await timed(c, 'page', '/dang-nhap', { method: 'POST', body: { email, password: QA_PASSWORD } });
          continue;
        }
        if (step === 'SEND') {
          await timed(c, 'page', '/lien-he', { method: 'POST', body: { name: 'Khách hàng QA', email: 'qa-load@example.com', phone: '0901234567', schoolOrCompany: 'Trường QA', message: `${LOAD_MARK} Cần tư vấn phòng STEM.`, interestedIn: 'giai-phap-stem-lab' } });
          continue;
        }
        const r = await timed(c, 'page', step);
        if (r && r.status === 200) {
          // the page's own files, once per visitor (a browser keeps them after the first time)
          // videos are left out: a browser only streams them when played
          const assets = [...new Set([...r.text.matchAll(ASSET_RE)].map((m) => m[1]))].filter((a) => !cache.has(a) && !/\.(mp4|webm|ogg|mov|m4v)$/i.test(a)).slice(0, 12);
          for (const a of assets) cache.add(a);
          await Promise.all(assets.map((a) => timed(c, 'asset', a, { headers: { accept: '*/*' } })));
        }
        await sleep(think[0] + Math.random() * (think[1] - think[0]));
      }
    }
  }
  await Promise.all(Array.from({ length: users }, (_, i) => person(i)));
  return records;
}
