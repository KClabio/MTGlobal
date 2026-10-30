// Visit counter (lib/page-views.js): real browser views of public pages are counted per page and day, not robots,
// staff or the admin; Admin → Tổng quan shows "Lượt xem trang" with the pages that bring requests.
// Only the views this test adds are counted, and they are taken off again at the end.
import { suite, part, check, db, BASE, createUser, removeLater, stamp, sleep } from './lib/index.mjs';

await suite(async (b) => {
  const { ev } = b;
  const d = await db();
  const views = d.collection('pageviews');
  const MARK = `ZZTEST-visits-${stamp}`;
  removeLater('quoterequests', { name: { $regex: '^' + MARK } });
  removeLater('loginthrottles', { _id: { $regex: '^request-ip:' } });
  const admin = await createUser('visits-admin');
  const customer = await createUser('visits-customer', 'customer');
  const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  const PAGE = '/ve-mtg';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const count = async (path = PAGE) => ((await views.findOne({ day: today, path })) || {}).views || 0;
  const added = {}; // path → views this test added, taken off at the end
  const visit = async (path, headers = {}, method = 'GET') => { await fetch(BASE + path, { method, redirect: 'manual', headers: { 'user-agent': CHROME, accept: 'text/html', ...headers } }); };
  const settle = () => sleep(300); // the count is written after the page is sent

  try {
    await part(b, 'what is counted', async () => {
      const before = await count();
      await visit(PAGE);
      await visit(PAGE, { cookie: `connect.sid=${customer.sid}` });
      await visit('/VE-MTG/');
      await settle();
      added[PAGE] = (await count()) - before;
      check('a visitor, a customer and the same page in capitals with a slash → 3 views of /ve-mtg', added[PAGE] === 3, added[PAGE]);
      await visit(PAGE, { cookie: `connect.sid=${admin.sid}` });
      await visit(PAGE, { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
      await visit(PAGE, { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/130.0' });
      await visit(PAGE, { 'user-agent': 'node' });
      await visit(PAGE, {}, 'HEAD');
      await visit(PAGE, { 'sec-purpose': 'prefetch' });
      await visit('/admin');
      await visit('/zz-khong-co-trang-nay');
      await settle();
      const now = (await count()) - before;
      check('not counted: staff, Googlebot, headless browsers, scripts, HEAD, prefetch', now === 3, now);
      check('… nor the admin or a missing page', !(await views.findOne({ path: { $in: ['/admin', '/zz-khong-co-trang-nay'] } })));
      const doc = await views.findOne({ day: today, path: PAGE });
      check('a count holds only the day, the page and the number (nothing about the visitor)', JSON.stringify(Object.keys(doc).sort()) === JSON.stringify(['_id', 'day', 'path', 'views']), Object.keys(doc));
    });

    await part(b, 'Admin → Tổng quan: "Lượt xem trang"', async () => {
      // A guest request sent from Liên hệ right after /ve-mtg: brought by /ve-mtg
      const r = await fetch(BASE + '/lien-he', { method: 'POST', redirect: 'manual', headers: { cookie: 'lang=vi' }, body: new URLSearchParams({ name: `${MARK}-req`, phone: '0912345678', message: 'x', agreePrivacy: '1', cameFrom: PAGE }) });
      check('a request sent after reading /ve-mtg', r.status === 303);
      const since = new Date(Date.now() - 29 * 24 * 3600e3).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const total = (await views.aggregate([{ $match: { day: { $gte: since } } }, { $group: { _id: null, n: { $sum: '$views' } } }]).toArray())[0]?.n || 0;
      const pageViews = (await views.aggregate([{ $match: { day: { $gte: since }, path: PAGE } }, { $group: { _id: null, n: { $sum: '$views' } } }]).toArray())[0]?.n || 0;
      const sinceDate = new Date(`${since}T00:00:00+07:00`);
      const brought = await d.collection('quoterequests').countDocuments({ createdAt: { $gte: sinceDate }, $or: [{ sourcePage: PAGE }, { sourcePage: '/lien-he', cameFrom: PAGE }] });

      await b.login(admin.sid);
      await b.setCookie('adminLang', 'vi');
      await b.nav('/admin', 400);
      const panel = await ev(`(() => {
        const p = document.querySelector('[data-visits]'); if (!p) return null;
        const svg = p.querySelector('.visits-chart svg');
        const top = [...p.querySelectorAll('[data-visits-top] li')].map((li) => ({ path: li.querySelector('.hbar-label').textContent.trim(), n: Number(li.querySelector('.hbar-value').textContent) }));
        const rows = [...p.querySelectorAll('[data-visits-requests] tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
        return { title: p.querySelector('h2').textContent.trim(), total: p.querySelector('[data-visits-total]').textContent.trim(), role: svg.getAttribute('role'), label: svg.getAttribute('aria-label'),
          focusable: svg.querySelectorAll('[tabindex], a, button').length, top, rows, heads: [...p.querySelectorAll('[data-visits-requests] th')].map((th) => th.textContent.trim()) };
      })()`);
      check('the panel "Lượt xem trang" is on the overview', !!panel && panel.title === 'Lượt xem trang', panel && panel.title);
      check('its total is the views of the last 30 days', !!panel && panel.total.replace(/\D/g, '') === String(total), panel && { shown: panel.total, total });
      check('the day bars are one picture with a spoken summary, nothing focusable inside', !!panel && panel.role === 'img' && /^Lượt xem mỗi ngày, 30 ngày từ .+: tổng cộng \d+ lượt\.$/.test(panel.label) && panel.focusable === 0, panel && panel.label);
      const mine = panel && panel.top.find((t) => t.path === PAGE);
      check('"Trang được xem nhiều nhất" lists /ve-mtg with its views (or 10 busier pages)', !!panel && ((mine && mine.n === pageViews) || (panel.top.length === 10 && panel.top[9].n >= pageViews)), panel && panel.top);
      const row = panel && panel.rows.find((cells) => cells[0] === PAGE);
      const per100 = Math.round((brought / pageViews) * 1000) / 10;
      check('"Trang mang lại yêu cầu": /ve-mtg with its requests, views and requests per 100 views', !!row && row[1] === String(brought) && row[2] === String(pageViews) && row[3] === per100.toLocaleString('vi-VN'), { row, brought, pageViews, per100 });
      check('… its columns are named', !!panel && JSON.stringify(panel.heads) === JSON.stringify(['Trang', 'Yêu cầu', 'Lượt xem', 'Trên 100 lượt xem']), panel && panel.heads);
      await b.setCookie('adminLang', 'en');
      await b.nav('/admin', 300);
      check('in English: "Page views" and "Pages that bring requests"', await ev(`document.querySelector('[data-visits] h2').textContent.trim() === 'Page views' && [...document.querySelectorAll('[data-visits] h3')].some((h) => h.textContent.trim() === 'Pages that bring requests')`));
      await b.setCookie('adminLang', 'vi');
      // Long page addresses in both lists (they once made the panel 421 px wide on a 390 px phone)
      const LONG = ['/giai-phap/stem-lab', '/san-pham/robot-leo-cau-thang', '/doi-tac/vex-robotics', '/giai-phap/thiet-bi', '/giai-phap/du-an',
        '/san-pham/robot-di-theo-nguoi', '/san-pham/robot-gia-dinh', '/dich-vu/tu-van-du-hoc', '/dich-vu/phan-phoi-san-pham', '/chinh-sach-bao-mat'];
      for (const path of LONG) { await views.updateOne({ day: today, path }, { $inc: { views: 50 } }, { upsert: true }); added[path] = (added[path] || 0) + 50; }
      await d.collection('quoterequests').insertOne({ name: `${MARK}-long`, phone: '0912345678', message: 'x', interestedIn: 'khac', status: 'new', user: null, sourcePage: '/san-pham/robot-leo-cau-thang', cameFrom: '', createdAt: new Date(), updatedAt: new Date() });
      await b.viewport(390, 844);
      await b.nav('/admin', 300);
      const phone = await ev(`(() => { const p = document.querySelector('[data-visits]'); return { page: document.documentElement.scrollWidth - innerWidth, panel: Math.round(p.getBoundingClientRect().right - innerWidth), top: p.querySelectorAll('[data-visits-top] li').length, rows: [...p.querySelectorAll('[data-visits-requests] tbody td:first-child')].map((td) => td.textContent.trim()) }; })()`);
      check('phone width with long page addresses: the panel fits (no sideways scroll)', phone.page <= 0 && phone.panel <= 0 && phone.top === 10 && phone.rows.includes('/san-pham/robot-leo-cau-thang'), phone);
      await b.shot('dashboard-visits-phone');
      await b.viewport(1280, 900);
      await b.nav('/admin', 300);
      await ev(`document.querySelector('[data-visits]').scrollIntoView()`);
      await b.shot('dashboard-visits');
    });
  } finally {
    for (const [path, n] of Object.entries(added)) if (n > 0) await views.updateOne({ day: today, path }, { $inc: { views: -n } });
    await views.deleteMany({ day: today, views: { $lte: 0 } });
  }
});
