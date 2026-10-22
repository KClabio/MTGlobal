// 0 · Smoke: the key pages answer, a visitor can log in and send a request, the admin opens
import { Client } from '../lib/http.mjs';
import { crawl } from '../lib/pages.mjs';
import { QA_ACCOUNTS } from '../lib/data.mjs';
import { QA_PASSWORD } from '../lib/infra.mjs';

export const scenarios = [{
  id: 0,
  name: 'Smoke: key pages, log in, send a request, admin opens',
  types: ['Smoke', 'Sanity'],
  async run(ctx) {
    const pages = await crawl(400);
    const bad = pages.filter((p) => p.status >= 400); // 3xx: the contact page asks to log in, the Google button redirects
    ctx.result('pages', { count: pages.length, bad, list: pages.map((p) => p.path) });
    if (bad.length) ctx.finding({ severity: 'high', title: 'Public pages that do not open', detail: bad.map((p) => `${p.path} → ${p.status}`).join(', '), fix: 'Fix the page or the link to it.' });

    const c = new Client();
    await c.login(QA_ACCOUNTS.customer(1), QA_PASSWORD);
    const sent = await c.post('/lien-he', { name: 'Khách hàng QA 1', email: QA_ACCOUNTS.customer(1), phone: '0901234567', schoolOrCompany: 'Trường QA', message: 'Smoke test: yêu cầu thử.', interestedIn: 'khac' });
    const db = await ctx.infra.db();
    const saved = await db.collection('quoterequests').findOne({ message: 'Smoke test: yêu cầu thử.' });
    if (saved) ctx.track('requests', String(saved._id));
    ctx.result('form', { status: sent.status, location: sent.location, saved: !!saved });

    const a = new Client();
    await a.login(QA_ACCOUNTS.admin, QA_PASSWORD);
    const adminPages = {};
    for (const p of ['/admin', '/admin/yeu-cau', '/admin/nguoi-dung']) adminPages[p] = (await a.get(p)).status;
    ctx.result('admin', adminPages);
    const ok = !bad.length && sent.status === 303 && !!saved && Object.values(adminPages).every((s) => s === 200);
    ctx.result('ok', ok);
    ctx.log(`${pages.length} public pages, ${bad.length} bad; form ${sent.status}; admin ${JSON.stringify(adminPages)}`);
  },
  async cleanup(ctx) {
    const ids = (ctx.state.temp && ctx.state.temp.requests) || [];
    if (!ids.length) return;
    const { ObjectId } = await import('mongodb');
    await (await ctx.infra.db()).collection('quoterequests').deleteMany({ _id: { $in: ids.map((i) => new ObjectId(i)) } });
    ctx.state.temp.requests = [];
  },
}];
