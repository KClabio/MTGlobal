// 39 · OWASP ASVS level 1 probes that fit an automatic run (the rest is the written review in the report):
//  - form posts sent from another site (V4.2.2 / V50: cross-site request forgery) to a guest form, a customer's
//    profile and an admin save, with the browser's Origin / Referer of that other site;
//  - HTTP methods the site doesn't use (PUT, DELETE, PATCH, TRACE, OPTIONS) and GET on POST-only addresses;
//  - two-step login: Quản trị stays closed after the password alone;
//  - error pages show no technical details.
import { Client } from '../lib/http.mjs';
import { QA_ACCOUNTS } from '../lib/data.mjs';
import { QA_PASSWORD, BASE, QA_MONGO, QA_DB } from '../lib/infra.mjs';

const EVIL = 'https://example.org';

export const scenarios = [
  {
    id: 39,
    name: 'OWASP ASVS level 1 probes: cross-site form posts, HTTP methods, two-step gate, error details',
    types: ['Security', 'OWASP ASVS', 'CSRF'],
    async run(ctx) {
      const out = { crossSite: {}, methods: {}, getOnPost: {}, twoStepGate: null, errorDetails: {} };
      const foreign = { origin: EVIL, referer: `${EVIL}/page`, 'sec-fetch-site': 'cross-site' };

      // 1. Cross-site form posts (what a hostile page could make a visitor's browser send)
      const guest = new Client();
      const g = await guest.post('/lien-he', { name: 'ZZ QA cross-site', phone: '0912345678', email: '', message: 'cross-site probe', interestedIn: 'khac', privacy: 'on' }, { headers: foreign });
      out.crossSite.guestRequest = g.status;
      const cust = new Client(); await cust.login(QA_ACCOUNTS.customer(9), QA_PASSWORD);
      const prof = await cust.post('/ho-so', { name: 'Khách hàng QA 9', phone: '', bio: 'cross-site probe' }, { headers: foreign });
      out.crossSite.customerProfile = prof.status;
      const owner = new Client(); await owner.login(QA_ACCOUNTS.owner, QA_PASSWORD);
      const before = await owner.get('/admin/ho-tro');
      const adminPost = await owner.post('/admin/ho-tro/moi', { group: 'chung', questionVi: 'ZZ QA cross-site', questionEn: '', answerVi: 'x', answerEn: '' }, { headers: foreign });
      out.crossSite.adminSave = adminPost.status;
      out.crossSite.adminPageOk = before.status;
      const logout = await cust.post('/dang-xuat', {}, { headers: foreign });
      out.crossSite.logout = logout.status;
      // Anything but a refusal (403) means no origin check stopped it (a 400 is the form's own check, not protection)
      const accepted = Object.entries(out.crossSite).filter(([k, v]) => k !== 'adminPageOk' && v !== 403);
      if (accepted.length) ctx.finding({ severity: 'medium', title: 'Form posts from another website are accepted', detail: `Posts carrying another site's Origin/Referer were answered normally (${accepted.map(([k, v]) => `${k}: ${v}`).join(', ')}). Today only the login cookie's SameSite=Lax setting stops a hostile page from using a visitor's login; there is no second check, which OWASP ASVS asks for.`, fix: 'Refuse POSTs whose Origin (or Referer when Origin is missing) is not this site, before the routes, with a short 403 page; keep SameSite=Lax as the first layer.' });

      // 2. Methods the site doesn't use
      // (TRACE can't be sent with Node's fetch; ZAP's scan covers it.) OPTIONS answering 200 with an Allow list is
      // Express's normal reply and opens nothing, as long as no other site is allowed in (Access-Control-Allow-Origin)
      for (const m of ['PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
        const r = await fetch(BASE + '/lien-he', { method: m, redirect: 'manual' }).catch((e) => ({ status: `error ${e.message}`, headers: new Headers() }));
        out.methods[m] = { status: r.status, cors: r.headers.get('access-control-allow-origin') || '' };
      }
      const bad = Object.entries(out.methods).filter(([m, x]) => typeof x.status !== 'number' || x.status >= 500 || x.cors === '*' || (m !== 'OPTIONS' && x.status === 200));
      if (bad.length) ctx.finding({ severity: 'low', title: 'Unused HTTP methods are not refused cleanly', detail: bad.map(([m, x]) => `${m}: ${x.status}${x.cors ? ` (open to ${x.cors})` : ''}`).join(', '), fix: 'Answer 404/405 for methods the site doesn\'t use.' });
      for (const p of ['/dang-xuat', '/admin/yeu-cau/000000000000000000000000/xoa']) out.getOnPost[p] = (await new Client().get(p)).status;

      // 3. Two-step: password alone doesn't open Quản trị
      const half = new Client();
      const pw = await half.post('/dang-nhap', { email: QA_ACCOUNTS.admin, password: QA_PASSWORD });
      const adm = await half.get('/admin');
      out.twoStepGate = { afterPassword: pw.location, admin: adm.status, to: adm.location };
      if (adm.status === 200) ctx.finding({ severity: 'high', title: 'Quản trị opens after the password alone', detail: JSON.stringify(out.twoStepGate), fix: 'Require the two-step code before any admin page.' });

      // 4. Error pages: no stack traces or framework names
      for (const p of ['/giai-phap/du-an/not-an-id', '/admin/yeu-cau/%E0%A4%A', '/%']) {
        const r = await new Client().get(p);
        out.errorDetails[p] = { status: r.status, leaks: /at [\w.]+ \(|node_modules|Express|mongoose|CastError|stack/i.test(r.text) };
      }
      const leaks = Object.entries(out.errorDetails).filter(([, v]) => v.leaks || v.status >= 500);
      if (leaks.length) ctx.finding({ severity: 'medium', title: 'An error page shows technical details or fails', detail: leaks.map(([p, v]) => `${p}: ${v.status}${v.leaks ? ' with technical text' : ''}`).join(', '), fix: 'Show the normal error page without details.' });

      ctx.result('asvs', out);
      ctx.log(JSON.stringify(out));
    },
    async cleanup(ctx) {
      // the made-up records of the probes live only in the QA copy's database; remove them anyway
      const { MongoClient } = await import('mongodb');
      const m = new MongoClient(QA_MONGO); await m.connect();
      const d = m.db(QA_DB);
      await d.collection('quoterequests').deleteMany({ name: 'ZZ QA cross-site' });
      await d.collection('helpitems').deleteMany({ questionVi: 'ZZ QA cross-site' });
      await m.close();
      void ctx;
    },
  },
];
