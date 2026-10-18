// Admin dashboard: numbers match the database; columns split by status + line (grow, draw, glow, dots on each month's total); interest pie (sweep, slices,
// explode, click-through to each group's pie and back); opening animations and their timing; highlights follow the mouse only; legend below the chart; Khách hàng tile.
import { suite, part, check, db, BASE, createUser, removeLater, stamp } from './lib/index.mjs';

await suite(async (b) => {
  const { send, ev, sleep } = b;
  const d = await db();
  const qr = d.collection('quoterequests');
  const owner = await createUser('dash', 'owner');
  const signIn = async () => { await b.login(owner.sid); await b.setCookie('adminLang', 'vi'); };
  const nav = (p, settle = 300) => b.nav(p, settle);
  const motion = (value) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  const hover = async (sel) => { const p = await ev(`(() => { const el = document.querySelector('${sel}'); const box = el.getBoundingClientRect(); if (box.bottom > innerHeight || box.top < 0) el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 }; })()`); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); return p; };

  // Temporary requests over the last 6 months (mid-month, Vietnam time) so the chart has a shape: [received, completed]
  const now = new Date(Date.now() + 7 * 3600e3);
  const PLAN = [[2, 1], [4, 3], [3, 1], [6, 4], [5, 2], [4, 1]];
  const temp = [];
  PLAN.forEach(([n, done], k) => {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - k), 10, 3));
    for (let j = 0; j < n; j++) temp.push({ name: `ZZ chart ${k}-${j}`, message: 'zz', phone: '0912345678', email: '', schoolOrCompany: '', interestedIn: 'khac', details: [], user: null,
      status: j < done ? 'hoan_tat' : (j % 2 ? 'da_lien_he' : 'moi'), createdAt: day, updatedAt: day });
  });
  removeLater('quoterequests', { name: /^ZZ chart / });
  await qr.insertMany(temp);

  await part(b, 'numbers match the database', async () => {
    const MARK = `ZZTEST-dash-${stamp}`;
    removeLater('quoterequests', { name: { $regex: '^' + MARK } });
    const cats = ['san-pham-robot', 'giai-phap-stem-lab', 'tu-van-du-hoc', 'phan-phoi-san-pham', 'khac'];
    const sts = ['moi', 'da_lien_he', 'hoan_tat'];
    const perMonth = [1, 3, 2, 5, 4, 6];
    const docs = [];
    const today = new Date();
    perMonth.forEach((n, i) => {
      for (let j = 0; j < n; j++) {
        const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (perMonth.length - 1 - i), 10 + j, 5));
        if (day > today) day.setTime(today.getTime() - 60000 * (j + 1));
        docs.push({ name: `${MARK}-${i}-${j}`, phone: '0912345678', email: '', schoolOrCompany: '', message: 'test', interestedIn: cats[(i + j) % (j % 2 ? 3 : 5)], status: sts[(i * 2 + j) % 3], user: null, createdAt: day, updatedAt: day });
      }
    });
    await qr.insertMany(docs);
    const html = await (await fetch(BASE + '/admin', { headers: { cookie: `connect.sid=${owner.sid}` } })).text();
    const kpi = [...html.matchAll(/class="kpi-value">(\d+)</g)].map((m) => Number(m[1]));
    const total = await qr.countDocuments();
    const newCount = await qr.countDocuments({ status: 'moi' });
    const done = await qr.countDocuments({ status: 'hoan_tat' });
    const customers = await d.collection('users').countDocuments({ role: 'customer' });
    const published = await d.collection('articles').countDocuments({ published: true });
    check('KPI tiles match DB (new, total, customers, published)', JSON.stringify(kpi) === JSON.stringify([newCount, total, customers, published]), { page: kpi, db: [newCount, total, customers, published] });
    check('completion rate matches', html.includes(`Tỉ lệ hoàn tất <strong>${Math.round((done / total) * 100)}%</strong>`));
    // Hidden table: Tháng · Tổng · Mới · Đã liên hệ · Hoàn tất
    const monthRows = [...html.matchAll(/<tr><td>Tháng (\d+)\/(\d+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><\/tr>/g)]
      .map((m) => ({ key: `${m[2]}-${m[1].padStart(2, '0')}`, n: Number(m[3]), moi: Number(m[4]), da_lien_he: Number(m[5]), hoan_tat: Number(m[6]) }));
    const monthKey = { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } };
    const dbMonths = {};
    for (const x of await qr.aggregate([{ $group: { _id: { m: monthKey, s: '$status' }, n: { $sum: 1 } } }]).toArray()) {
      const row = dbMonths[x._id.m] || (dbMonths[x._id.m] = { n: 0, moi: 0, da_lien_he: 0, hoan_tat: 0 });
      row.n += x.n; row[x._id.s] += x.n;
    }
    const empty = { n: 0, moi: 0, da_lien_he: 0, hoan_tat: 0 };
    check('6 month rows, each matching DB per-month counts, split by status', monthRows.length === 6 && monthRows.every((r) => { const m = dbMonths[r.key] || empty;
      return r.n === m.n && r.moi === m.moi && r.da_lien_he === m.da_lien_he && r.hoan_tat === m.hoan_tat && r.moi + r.da_lien_he + r.hoan_tat === r.n; }), { monthRows, dbMonths });
    // Interest pie: the 4 groups of "Bạn quan tâm đến" (top), and each group's own pie (hidden until opened)
    const pieRows = (view) => {
      const start = html.indexOf(`data-pie-view="${view}"`);
      const part = html.slice(start, html.indexOf('</ul>', start));
      return [...part.matchAll(/legend-label">([^<]+)<\/span>\s*<span class="legend-count">(\d+)<\/span>\s*<span class="legend-pct">(\d+)%/g)].map((m) => ({ label: m[1].replace(/&amp;/g, '&'), n: Number(m[2]), pct: Number(m[3]) }));
    };
    const dbInterest = Object.fromEntries((await qr.aggregate([{ $group: { _id: '$interestedIn', n: { $sum: 1 } } }]).toArray()).map((x) => [x._id, x.n]));
    const n = (code) => dbInterest[code] || 0;
    const GROUPS = { solutions: ['giai-phap-stem-lab', 'thiet-bi-stem', 'workshop-stem', 'dao-tao-stem', 'tap-huan-stem'], products: ['san-pham-robot'], services: ['tu-van-du-hoc', 'phan-phoi-san-pham'] };
    const groupN = Object.fromEntries(Object.entries(GROUPS).map(([g, codes]) => [g, codes.reduce((s, c) => s + n(c), 0)]));
    const expected = [['Giải pháp STEM', groupN.solutions], ['Sản phẩm', groupN.products], ['Dịch vụ', groupN.services], ['Khác', n('khac')]].map(([label, c]) => ({ label, n: c, pct: Math.round((c / total) * 100) }));
    check('interest pie: the 4 groups (Giải pháp STEM, Sản phẩm, Dịch vụ, Khác), counts + % match DB', JSON.stringify(pieRows('top')) === JSON.stringify(expected), { page: pieRows('top'), expected });
    const stem = pieRows('solutions');
    check('"Giải pháp STEM" opens to its 5 choices, counts match DB', stem.length === 5 && stem.map((r) => r.n).join() === GROUPS.solutions.map(n).join() && stem.every((r) => r.pct === (groupN.solutions ? Math.round((r.n / groupN.solutions) * 100) : 0)), stem);
    const svc = pieRows('services');
    check('"Dịch vụ" opens to Tư vấn du học + Phân phối, counts match DB', svc.length === 2 && svc.map((r) => r.n).join() === GROUPS.services.map(n).join(), svc);
    const robotLines = await qr.aggregate([{ $match: { interestedIn: 'san-pham-robot' } }, { $unwind: '$details' }, { $match: { $or: [{ 'details.kind': 'product' }, { 'details.labelVi': 'Sản phẩm' }] } }, { $group: { _id: '$details.valueVi', n: { $sum: 1 } } }]).toArray();
    const robots = pieRows('products');
    const named = robotLines.reduce((s, r) => s + r.n, 0);
    check('"Sản phẩm" opens to the robots named in the requests (+ "Chưa rõ robot" for the rest)', robots.reduce((s, r) => s + r.n, 0) === groupN.products
      && robotLines.every((r) => robots.some((x) => x.label === r._id && x.n === r.n)) && (named === groupN.products || robots.some((x) => x.label === 'Chưa rõ robot' && x.n === groupN.products - named)), { robots, robotLines });
    // Second tab: the STEM equipment catalogue by part (Phần I…IV, else Khác)
    const tabs = [...html.matchAll(/role="tab" data-tab="(\w+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2].trim()]);
    check('pie panel has two tabs: "Theo mục quan tâm" (open first) and "Thiết bị, học liệu, Robot STEM"', JSON.stringify(tabs) === JSON.stringify([['interest', 'Theo mục quan tâm'], ['equipment', 'Thiết bị, học liệu, Robot STEM']]) && /data-tabs data-open="interest"/.test(html), tabs);
    const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
    const byPart = {};
    for (const p of await d.collection('products').find({ category: 'stem-equipment' }).toArray()) {
      const m = String(p.subcategory || '').match(/^Phần\s+([IVX]+)\b/);
      const key = m && ROMAN[m[1]] ? `Phần ${m[1]}` : 'Khác';
      byPart[key] = (byPart[key] || 0) + 1;
    }
    const eqTotal = Object.values(byPart).reduce((s, x) => s + x, 0);
    const eq = pieRows('equipment');
    check('equipment tab: one row per part, counts match the catalogue', eq.length === Object.keys(byPart).length && eq.every((r) => byPart[r.label.split(' · ')[0]] === r.n) && eq.reduce((s, r) => s + r.n, 0) === eqTotal, { eq, byPart });
    check('… with "Trên tổng N mục trong danh mục", percentages adding up to ~100, and no click-through', html.includes(`Trên tổng ${eqTotal} mục trong danh mục`) && Math.abs(eq.reduce((s, r) => s + r.pct, 0) - 100) <= 2
      && !html.slice(html.indexOf('data-panel="equipment"')).split('</section>')[0].includes('data-drill'), eq);
    const hbars = [...html.matchAll(/hbar-label">([^<]+)<\/span>[\s\S]*?hbar-value">(\d+)</g)].map((m) => Number(m[2]));
    const dbCats = (await qr.aggregate([{ $group: { _id: '$interestedIn', n: { $sum: 1 } } }]).toArray()).map((x) => x.n).sort((x, y) => y - x);
    while (dbCats.length < 9) dbCats.push(0); // every "Bạn quan tâm đến" choice has a bar, even at 0
    check('category bars match DB and are sorted', JSON.stringify(hbars) === JSON.stringify(dbCats), { hbars, dbCats });
    check('latest list shows 5 newest', (html.match(/class="latest-main"/g) || []).length === 5);
    await signIn();
    await nav('/admin', 400);
    const pt = await ev(`(() => { const r = document.querySelectorAll('.chart-col .chart-hit')[3].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height - 20 }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
    await sleep(150);
    const tipText = await ev(`(() => { const t = document.getElementById('chartTooltip'); return t.hidden ? null : t.textContent; })()`);
    const tm = (tipText || '').match(/^Tháng \d+\/\d+: (\d+) yêu cầu((?: · (?:Mới|Đã liên hệ|Hoàn tất) \d+)*)$/);
    const tipSum = tm ? [...tm[2].matchAll(/ (\d+)(?= ·|$)/g)].reduce((sum, x) => sum + Number(x[1]), 0) : -1;
    check('hovering a month column shows its tooltip: the total, then each status (adding up)', !!tm && tipSum === Number(tm[1]), tipText);
    await qr.deleteMany({ name: { $regex: '^' + MARK } });
  });

  await part(b, 'bars, line and pie', async () => {
    await signIn();
    await motion('no-preference');
    await nav('/admin', 120);
    const mid = await ev(`(() => { const bars = [...document.querySelectorAll('.chart .chart-bar')]; const last = bars[bars.length - 1]; return { last: getComputedStyle(last).transform, line: getComputedStyle(document.querySelector('.chart-line')).strokeDashoffset }; })()`);
    check('on open the bars start flat (scaleY 0, growing from the baseline) and the line is not drawn yet', /matrix\(1, 0, 0, 0(\.\d+)?,/.test(mid.last) && parseFloat(mid.line) > 0.5, mid);
    await sleep(3000); // bar+line intro: line ends at 0.9s + 1.6s, the last dot pops for 0.26s more
    const done = await ev(`(() => {
      const svg = document.querySelector('.chart');
      const ticks = [...svg.querySelectorAll('.chart-tick')].map((t) => ({ v: +t.textContent, y: +t.getAttribute('y') - 4 }));
      const y0 = ticks[0].y, top = ticks[ticks.length - 1];
      const unit = (y0 - top.y) / top.v; // px per request
      const cols = [...svg.querySelectorAll('.chart-col')].map((c) => {
        const segs = [...c.querySelectorAll('.chart-seg')].map((p) => { const bb = p.getBBox(); return { key: p.dataset.key, n: +p.dataset.n, top: bb.y, bottom: bb.y + bb.height, h: bb.height, round: /Q/.test(p.getAttribute('d')) }; });
        return { n: +c.getAttribute('data-tip').match(/(\\d+) yêu cầu/)[1], i: c.dataset.i, segs };
      });
      const order = ['hoan_tat', 'da_lien_he', 'moi'];
      const segsOk = cols.every((c) => c.segs.reduce((s, g) => s + g.n, 0) === c.n
        && c.segs.every((g, k) => order.indexOf(g.key) > (k ? order.indexOf(c.segs[k - 1].key) : -1)) // bottom → top: Hoàn tất, Đã liên hệ, Mới
        && c.segs.every((g, k) => Math.abs(g.h + (k && g.n * unit > 2 ? 2 : 0) - g.n * unit) < 0.6) // height = its count on the scale (less the 2px gap)
        && c.segs.every((g, k) => !k || Math.abs(c.segs[k - 1].top - g.bottom - 2) < 0.6) // a 2px gap between sections
        && c.segs.every((g, k) => g.round === (k === c.segs.length - 1))); // only the top section rounded
      const dots = [...svg.querySelectorAll('.chart-dot')].map((d) => +d.getAttribute('cy'));
      const expect = cols.map((c) => y0 - c.n * unit);
      return { cols, segsOk, dotsOk: dots.every((y, i) => Math.abs(y - expect[i]) < 0.6), bars: [...svg.querySelectorAll('.chart-bar')].map((b) => getComputedStyle(b).transform),
        line: getComputedStyle(svg.querySelector('.chart-line')).strokeDashoffset, pts: [...svg.querySelectorAll('.chart-pt')].map((p) => getComputedStyle(p).transform),
        legend: [...document.querySelectorAll('.chart-legend li')].map((l) => l.textContent.trim()), table: [...document.querySelectorAll('.panel table.sr-only tr')[0].children].map((c) => c.textContent.trim()).join(' ') };
    })()`);
    // The test's own requests per month: [received, completed]; the others alternate Mới / Đã liên hệ (see PLAN above)
    const planOk = PLAN.every(([n, dn], k) => {
      const got = Object.fromEntries(done.cols[k].segs.map((g) => [g.key, g.n]));
      const contacted = [...Array(n - dn).keys()].map((j) => j + dn).filter((j) => j % 2).length;
      return done.cols[k].n >= n && (got.hoan_tat || 0) >= dn && (got.da_lien_he || 0) >= contacted && (got.moi || 0) >= n - dn - contacted;
    });
    check('each column is split by status (bottom → top: Hoàn tất, Đã liên hệ, Mới), heights on the scale, 2px gaps, only the top rounded', done.segsOk && planOk, done.cols);
    check('line points sit at each month\'s total (the top of its column): growth', done.dotsOk, done.cols.map((c) => c.n));
    check('no number printed above the last column (the tooltip gives each total)', await ev(`!document.querySelector('.chart .chart-value') && [...document.querySelectorAll('.chart text')].every((t) => t.classList.contains('chart-tick') || t.classList.contains('chart-label'))`));
    check('after the intro: every bar full height, line fully drawn, every dot shown', done.bars.every((t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)') && parseFloat(done.line) === 0 && done.pts.every((t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'), done);
    check('key below the chart: Mới, Đã liên hệ, Hoàn tất (as the pie), then the total line; the hidden table has the same columns', JSON.stringify(done.legend) === JSON.stringify(['Mới', 'Đã liên hệ', 'Hoàn tất', 'Tổng yêu cầu']) && done.table === 'Tháng Tổng Mới Đã liên hệ Hoàn tất', { legend: done.legend, table: done.table });
    await hover('.chart-col[data-i="3"] .chart-hit'); await sleep(400);
    const glow = await ev(`(() => ({ g3: +getComputedStyle(document.querySelector('.chart-col[data-i="3"] .chart-bar-glow')).opacity, g1: +getComputedStyle(document.querySelector('.chart-col[data-i="1"] .chart-bar-glow')).opacity,
      d3: +getComputedStyle(document.querySelector('.chart-pt[data-i="3"] .chart-dot-glow')).opacity, d1: +getComputedStyle(document.querySelector('.chart-pt[data-i="1"] .chart-dot-glow')).opacity,
      bright: getComputedStyle(document.querySelector('.chart-col[data-i="3"] .chart-bar')).filter, tip: !document.getElementById('chartTooltip').hidden && document.getElementById('chartTooltip').textContent }))()`);
    check('hovering a month: its bar and its line point glow, the others stay unlit, tooltip shows', glow.g3 > 0.6 && glow.d3 > 0.6 && glow.g1 === 0 && glow.d1 === 0 && /brightness/.test(glow.bright) && /yêu cầu · /.test(glow.tip || ""), glow);
    await b.shot('dash-bar-glow');
    const pie = await ev(`(() => { const slices = [...document.querySelectorAll('[data-pie-view="top"] .pie-slice')]; const rows = [...document.querySelectorAll('[data-pie-view="top"] .legend-row')];
      return { n: slices.length, keys: slices.map((s) => s.dataset.key), counts: rows.map((r) => +r.querySelector('.legend-count').textContent), sweep: getComputedStyle(document.querySelector('.pie-sweep')).strokeDashoffset }; })()`);
    check('pie: one slice per interest group with requests; the sweep mask has finished (offset 0)', pie.n === pie.counts.filter((c) => c > 0).length && parseFloat(pie.sweep) === 0, pie);
    const angles = await ev(`(() => { const total = [...document.querySelectorAll('[data-pie-view="top"] .legend-count')].reduce((s, c) => s + +c.textContent, 0);
      return [...document.querySelectorAll('[data-pie-view="top"] .pie-slice')].map((s) => { const nums = s.getAttribute('d').match(/-?\\d+(\\.\\d+)?/g).map(Number); const c = 110;
        const a1 = Math.atan2(nums[2] - c, -(nums[3] - c)), a2 = Math.atan2(nums[nums.length - 2] - c, -(nums[nums.length - 1] - c)); let sw = a2 - a1; if (sw <= 0) sw += 2 * Math.PI;
        const count = +document.querySelector('[data-pie-view="top"] .legend-row[data-key="' + s.dataset.key + '"] .legend-count').textContent; return { sweep: sw / (2 * Math.PI), share: count / total }; }); })()`);
    check('pie: each slice\'s angle matches its share of requests', angles.every((a) => Math.abs(a.sweep - a.share) < 0.01), angles);
    const layout = await ev(`(() => { const p = document.querySelector('.pie').getBoundingClientRect(), l = document.querySelector('.pie-wrap .legend-list').getBoundingClientRect(), w = document.querySelector('.pie-wrap').getBoundingClientRect();
      return { pie: Math.round(p.width), pieBottom: Math.round(p.bottom), legendTop: Math.round(l.top), centred: Math.abs((p.left + p.right) / 2 - (w.left + w.right) / 2) < 2, legendFull: Math.round(l.width) === Math.round(w.width) }; })()`);
    check('pie: large (at least 200px), centred, with the counts and percentages underneath at full width', layout.pie >= 200 && layout.legendTop >= layout.pieBottom && layout.centred && layout.legendFull, layout);
    const key = pie.keys[0];
    await hover(`.pie-slice[data-key="${key}"]`); await sleep(400);
    const ex = await ev(`(() => { const s = document.querySelector('.pie-slice[data-key="${key}"]'); const others = [...document.querySelectorAll('[data-pie-view="top"] .pie-slice')].filter((o) => o !== s);
      const m = getComputedStyle(s).transform; const dx = parseFloat(s.style.getPropertyValue('--dx')), dy = parseFloat(s.style.getPropertyValue('--dy'));
      return { m, dx, dy, othersDim: others.every((o) => +getComputedStyle(o).opacity < 0.6), row: document.querySelector('[data-pie-view="top"] .legend-row[data-key="${key}"]').classList.contains('is-hot') }; })()`);
    const mm = (ex.m.match(/matrix\(1, 0, 0, 1, (-?[\d.]+), (-?[\d.]+)\)/) || []).slice(1).map(Number);
    check('hovering a slice: it slides out along its middle angle (exploded), others dim, its legend row highlights', mm.length === 2 && Math.abs(mm[0] - ex.dx) < 0.5 && Math.abs(mm[1] - ex.dy) < 0.5 && Math.hypot(ex.dx, ex.dy) > 7 && ex.othersDim && ex.row, ex);
    await hover(`.pie-wrap .legend-row[data-key="${pie.keys[pie.keys.length - 1]}"]`); await sleep(400);
    const viaRow = await ev(`getComputedStyle(document.querySelector('.pie-slice[data-key="${pie.keys[pie.keys.length - 1]}"]')).transform`);
    check('hovering a legend row explodes the same slice', /matrix\(1, 0, 0, 1, (?!0, 0\))/.test(viaRow), viaRow);
    // Click-through: a group opens its own pie with the same opening; "← Tất cả mục quan tâm" comes back
    const shownView = `[...document.querySelectorAll('[data-interest-panel] [data-pie-view]')].filter((v) => !v.hidden).map((v) => v.dataset.pieView).join()`;
    const clickEl = (sel) => ev(`document.querySelector('${sel}').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    await clickEl('[data-pie-view="top"] .pie-slice[data-key="solutions"]'); await sleep(60);
    const zoom = await ev(`(() => { const s = document.querySelector('[data-pie-view="top"] .pie-slice[data-key="solutions"]'); return { zooming: s.classList.contains('is-zooming'), leaving: s.closest('.pie').classList.contains('is-leaving'), still: !s.closest('[data-pie-view]').hidden }; })()`);
    check('clicking "Giải pháp STEM": that slice grows out while the others fade (its own pie not shown yet)', zoom.zooming && zoom.leaving && zoom.still, zoom);
    await b.shot('dash-pie-zoom');
    await sleep(450);
    const opened = await ev(`(() => { const v = document.querySelector('[data-pie-view="solutions"]'); return { shown: !v.hidden, topHidden: document.querySelector('[data-pie-view="top"]').hidden, sweep: parseFloat(getComputedStyle(v.querySelector('.pie-sweep')).strokeDashoffset),
      anim: v.querySelector('.pie').classList.contains('chart-anim'), focus: document.activeElement === v.querySelector('[data-pie-back]'), slices: v.querySelectorAll('.pie-slice').length, crumb: v.querySelector('.pie-crumb-title').textContent }; })()`);
    check('… then the "Giải pháp STEM" pie opens with the same sweep (still drawing), focus on "← Tất cả mục quan tâm"', opened.shown && opened.topHidden && opened.anim && opened.sweep > 0.05 && opened.focus && opened.slices > 0 && /^Giải pháp STEM · \d+ yêu cầu$/.test(opened.crumb), opened);
    await sleep(1200);
    check('… and its sweep completes', parseFloat(await ev(`getComputedStyle(document.querySelector('[data-pie-view="solutions"] .pie-sweep')).strokeDashoffset`)) === 0);
    await b.shot('dash-pie-stem');
    await clickEl('[data-pie-view="solutions"] [data-pie-back]'); await sleep(80);
    const backed = await ev(`({ view: ${shownView}, sweep: parseFloat(getComputedStyle(document.querySelector('[data-pie-view="top"] .pie-sweep')).strokeDashoffset) })`);
    check('"← Tất cả mục quan tâm": back to the 4 groups, which sweep in again', backed.view === 'top' && backed.sweep > 0.05, backed);
    await sleep(1300);
    // Keyboard: Enter on a legend row opens its group, Escape comes back to that group's slice
    await ev(`document.querySelector('[data-pie-view="top"] .legend-row[data-drill="services"]').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(600);
    const kb = await ev(`({ view: ${shownView}, rows: [...document.querySelectorAll('[data-pie-view="services"] .legend-label')].map((l) => l.textContent) })`);
    check('keyboard: Enter on "Dịch vụ" opens its pie (Tư vấn du học, Phân phối)', kb.view === 'services' && kb.rows.length === 2, kb);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(150);
    check('Escape goes back, focus on the "Dịch vụ" slice', await ev(`!document.querySelector('[data-pie-view="top"]').hidden && document.activeElement === document.querySelector('[data-pie-view="top"] .pie-slice[data-key="services"]')`));
    await sleep(1200);
    // "Khác" has nothing inside
    await clickEl('[data-pie-view="top"] .pie-slice[data-key="khac"]'); await sleep(600);
    check('"Khác" has no pie inside: clicking it changes nothing', (await ev(shownView)) === 'top' && (await ev(`!document.querySelector('[data-pie-view="top"] [data-drill="khac"]')`)));
    // Tabs: the equipment catalogue pie, with the same opening; an opened interest group stays open
    await clickEl('[data-pie-view="top"] .pie-slice[data-key="solutions"]'); await sleep(1700);
    await clickEl('[data-pie-panel] [data-tab="equipment"]'); await sleep(80);
    const eqTab = await ev(`(() => { const p = document.querySelector('[data-panel="equipment"]'); return { shown: !p.hidden, interestHidden: document.querySelector('[data-panel="interest"]').hidden,
      selected: document.querySelector('[data-tab="equipment"]').getAttribute('aria-selected'), sweep: parseFloat(getComputedStyle(p.querySelector('.pie-sweep')).strokeDashoffset), slices: p.querySelectorAll('.pie-slice').length }; })()`);
    check('"Thiết bị, học liệu, Robot STEM" tab: its pie shows and sweeps in (the interest pie hidden)', eqTab.shown && eqTab.interestHidden && eqTab.selected === 'true' && eqTab.sweep > 0.05 && eqTab.slices > 0, eqTab);
    await sleep(1300);
    const eqAngles = await ev(`(() => { const p = document.querySelector('[data-panel="equipment"]'); const total = [...p.querySelectorAll('.legend-count')].reduce((s, c) => s + +c.textContent, 0);
      return [...p.querySelectorAll('.pie-slice')].map((s) => { const nums = s.getAttribute('d').match(/-?\\d+(\\.\\d+)?/g).map(Number); const c = 110; const whole = nums.length < 12;
        const a1 = Math.atan2(nums[2] - c, -(nums[3] - c)), a2 = Math.atan2(nums[nums.length - 2] - c, -(nums[nums.length - 1] - c)); let sw = a2 - a1; if (sw <= 0) sw += 2 * Math.PI;
        const count = +p.querySelector('.legend-row[data-key="' + s.dataset.key + '"] .legend-count').textContent; return { sweep: sw / (2 * Math.PI), share: count / total }; }); })()`);
    check('… each slice\'s angle matches its share of the catalogue', eqAngles.length > 0 && eqAngles.every((a) => Math.abs(a.sweep - a.share) < 0.01), eqAngles);
    const firstPart = await ev(`document.querySelector('[data-panel="equipment"] .pie-slice').dataset.key`);
    await hover(`[data-panel="equipment"] .pie-slice[data-key="${firstPart}"]`); await sleep(350);
    check('… hovering a part\'s slice highlights its legend row', await ev(`document.querySelector('[data-panel="equipment"] .legend-row[data-key="${firstPart}"]').classList.contains('is-hot')`));
    await b.shot('dash-pie-equipment');
    await ev(`document.querySelector('[data-tab="equipment"]').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 }); await sleep(100);
    check('← arrow key: back to "Theo mục quan tâm", and the opened "Giải pháp STEM" pie is still open', (await ev(`document.querySelector('[data-tab="interest"]').getAttribute('aria-selected')`)) === 'true' && (await ev(shownView)) === 'solutions');
    await clickEl('[data-pie-view="solutions"] [data-pie-back]'); await sleep(1300);
    // Reduced motion: still animates, shorter, and ends complete
    await motion('reduce');
    await nav('/admin', 60);
    const rm = await ev(`getComputedStyle(document.querySelector('.chart-bar')).animationDuration`);
    await sleep(2500);
    const rmEnd = await ev(`({ line: getComputedStyle(document.querySelector('.chart-line')).strokeDashoffset, sweep: getComputedStyle(document.querySelector('.pie-sweep')).strokeDashoffset })`);
    check('reduced motion: the intro still plays, shorter (0.24s bars), and finishes complete', rm === '0.24s' && parseFloat(rmEnd.line) === 0 && parseFloat(rmEnd.sweep) === 0, { rm, rmEnd });
    await motion('no-preference');
    await b.setCookie('theme', 'dark');
    await nav('/admin', 2500);
    await hover('.chart-col[data-i="3"] .chart-hit'); await sleep(400); await b.shot('dash-dark-glow');
  });

  await part(b, 'opening animations and timing', async () => {
    await signIn();
    // Pie opening: 1s eased sweep + fade/grow, with and without reduced motion
    const sweepAnim = `document.getAnimations().find((a) => a.animationName === 'chart-draw' && a.effect.target.classList.contains('pie-sweep'))`;
    for (const m of ['no-preference', 'reduce']) {
      await motion(m);
      await nav('/admin', 0);
      const info = await ev(`(() => { const s = getComputedStyle(document.querySelector('.pie-sweep')), p = getComputedStyle(document.querySelector('.pie'));
        return { dur: s.animationDuration, ease: s.animationTimingFunction, grow: p.animationName, growDur: p.animationDuration }; })()`);
      const samples = [];
      for (const at of [250, 500, 750]) {
        const t = await ev(`(${sweepAnim} || {}).currentTime || 0`);
        await sleep(Math.max(0, at - t));
        samples.push(+parseFloat(await ev(`getComputedStyle(document.querySelector('.pie-sweep')).strokeDashoffset`)).toFixed(3));
      }
      await sleep(700);
      const end = await ev(`({ off: parseFloat(getComputedStyle(document.querySelector('.pie-sweep')).strokeDashoffset), op: getComputedStyle(document.querySelector('.pie')).opacity, tf: getComputedStyle(document.querySelector('.pie')).transform })`);
      check(`pie opening (${m}): 1s eased sweep + 1s fade/grow`, info.dur === '1s' && info.ease.startsWith('cubic-bezier(0.65') && info.grow === 'pie-grow' && info.growDur === '1s', info);
      check(`pie opening (${m}): slow start, ~half at midpoint, gentle finish, then complete`,
        samples[0] > 0.8 && samples[1] > 0.3 && samples[1] < 0.7 && samples[2] < 0.2 && end.off === 0 && end.op === '1' && (end.tf === 'none' || end.tf === 'matrix(1, 0, 0, 1, 0, 0)'), { samples, end });
    }
    // Line: ease-out, fixed 1.6s, dots pop as the line reaches them
    for (const m of ['no-preference', 'reduce']) {
      await motion(m);
      await nav('/admin', 50);
      const timing = await ev(`(() => { const s = getComputedStyle(document.querySelector('.chart-line')); return { ease: s.animationTimingFunction, dur: s.animationDuration }; })()`);
      check(`line (${m}): ease-out curve, 1.6s`, timing.ease === 'cubic-bezier(0.25, 1, 0.5, 1)' && timing.dur === '1.6s', timing);
    }
    await motion('no-preference');
    await nav('/admin', 50);
    const lineCheck = await ev(`(() => {
      const anims = document.getAnimations();
      const line = anims.find((a) => a.effect.target.classList && a.effect.target.classList.contains('chart-line'));
      const lineDelay = line.effect.getTiming().delay;
      const offsetAt = (t) => { line.pause(); line.currentTime = lineDelay + t; return parseFloat(getComputedStyle(line.effect.target).strokeDashoffset); };
      const quarter = 1 - offsetAt(400);
      const dots = [...document.querySelectorAll('.chart-pt')].map((g) => { const c = g.querySelector('.chart-dot'); return { x: +c.getAttribute('cx'), y: +c.getAttribute('cy'), g }; });
      let run = 0; const lens = dots.map((d, i) => { if (i) run += Math.hypot(d.x - dots[i - 1].x, d.y - dots[i - 1].y); return run; });
      const rows = dots.map((d, i) => {
        const pop = anims.find((a) => a.effect.target === d.g);
        const at = pop.effect.getTiming().delay - lineDelay;
        return { i, at: Math.round(at), frac: +(lens[i] / run).toFixed(3), drawn: +(1 - offsetAt(at)).toFixed(3) };
      });
      line.finish();
      return { quarter: +quarter.toFixed(3), rows };
    })()`);
    check('line: more than half drawn after the first quarter of its time (fast start)', lineCheck.quarter > 0.5, lineCheck);
    check('line: each dot pops exactly when the line reaches it (±0.02 of the length)', lineCheck.rows.every((r) => Math.abs(r.drawn - r.frac) <= 0.02), lineCheck.rows);
    check('line: the gaps between dots get longer toward the latest month (slowing down)', lineCheck.rows.slice(2).every((r, k) => (r.at - lineCheck.rows[k + 1].at) >= (lineCheck.rows[k + 1].at - lineCheck.rows[k].at) - 5 || r.frac - lineCheck.rows[k + 1].frac > lineCheck.rows[k + 1].frac - lineCheck.rows[k].frac + 0.05), lineCheck.rows);
  });

  await part(b, 'highlights follow the mouse only', async () => {
    await signIn();
    await nav('/admin', 2500);
    const click = async (sel) => { const p = await hover(sel); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 }); };
    const away = () => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 60 });
    const colState = () => ev(`(() => { const c = document.querySelector('.chart-col[data-i="3"]');
      return { focused: document.activeElement === c, shade: getComputedStyle(c.querySelector('.chart-hit')).fill, glow: +getComputedStyle(c.querySelector('.chart-bar-glow')).opacity,
        dot: document.querySelector('.chart-pt[data-i="3"]').classList.contains('is-hot'), tip: !document.getElementById('chartTooltip').hidden }; })()`);
    await hover('.chart-col[data-i="3"] .chart-hit'); await sleep(350);
    const hov = await colState();
    check('hovering a column: shaded, glowing, dot lit, tooltip shown', hov.shade !== 'rgba(0, 0, 0, 0)' && hov.glow > 0.6 && hov.dot && hov.tip, hov);
    await click('.chart-col[data-i="3"] .chart-hit'); await sleep(100); await away(); await sleep(350);
    const after = await colState();
    check('clicking a column then moving away: not focused, no shade, no glow, no dot, no tooltip (nothing pinned)', !after.focused && after.shade === 'rgba(0, 0, 0, 0)' && after.glow === 0 && !after.dot && !after.tip, after);
    await hover('.chart-col[data-i="1"] .chart-hit'); await sleep(350);
    const moved = await ev(`({ g1: +getComputedStyle(document.querySelector('.chart-col[data-i="1"] .chart-bar-glow')).opacity, g3: +getComputedStyle(document.querySelector('.chart-col[data-i="3"] .chart-bar-glow')).opacity })`);
    check('hover moves freely to another column', moved.g1 > 0.6 && moved.g3 === 0, moved);
    const key = 'khac'; // a slice that opens nothing (the group slices open their own pie on click)
    await click(`.pie-slice[data-key="${key}"]`); await sleep(100); await away(); await sleep(350);
    const pie = await ev(`(() => { const s = document.querySelector('.pie-slice[data-key="${key}"]'); return { focused: document.activeElement === s, transform: getComputedStyle(s).transform, hot: !!document.querySelector('.pie.has-hot'), tip: !document.getElementById('chartTooltip').hidden }; })()`);
    check('clicking a pie slice then moving away: slice back in place, nothing dimmed, no tooltip', !pie.focused && (pie.transform === 'none' || pie.transform === 'matrix(1, 0, 0, 1, 0, 0)') && !pie.hot && !pie.tip, pie);
    await click('.hbar-row'); await sleep(100); await away(); await sleep(350);
    const row = await ev(`(() => { const r = document.querySelector('.hbar-row'); return { focused: document.activeElement === r, tip: !document.getElementById('chartTooltip').hidden }; })()`);
    check('clicking a category row then moving away: not focused, no tooltip', !row.focused && !row.tip, row);
    // Keyboard still works
    await ev(`document.querySelector('.chart-col[data-i="2"]').focus({ focusVisible: true })`);
    await b.key('Tab', 'Tab', 9);
    await sleep(350);
    const kb = await ev(`(() => { const c = document.activeElement; return { i: c && c.dataset ? c.dataset.i : null, glow: c && c.querySelector ? +getComputedStyle(c.querySelector('.chart-bar-glow')).opacity : 0,
      dot: !!document.querySelector('.chart-pt[data-i="3"].is-hot'), tip: !document.getElementById('chartTooltip').hidden }; })()`);
    check('keyboard: Tab onto a column still highlights it (glow, dot, tooltip)', kb.i === '3' && kb.glow > 0.6 && kb.dot && kb.tip, kb);
  });

  await part(b, 'legend and Khách hàng tile', async () => {
    await signIn();
    await nav('/admin', 2600);
    const legend = await ev(`(() => { const svg = document.querySelector('svg.chart').getBoundingClientRect(); const ul = document.querySelector('.chart-legend'); const r = ul.getBoundingClientRect();
      const lis = [...ul.children].map((li) => li.getBoundingClientRect()); const mid = (lis[0].left + lis[lis.length - 1].right) / 2;
      return { below: r.top >= svg.bottom - 1, center: Math.abs(mid - (r.left + r.width / 2)), afterSvg: ul.previousElementSibling && ul.previousElementSibling.matches('svg.chart') }; })()`);
    check('legend sits below the chart and is centred (within 2px)', legend.below && legend.center <= 2 && legend.afterSvg, legend);
    const kpiSub = await ev(`[...document.querySelectorAll('.kpi')].find((k) => k.getAttribute('href') === '/admin/nguoi-dung').querySelector('.kpi-sub').textContent.trim()`);
    check('Khách hàng tile: only new customers, no admin count', /^\+\d+ trong 30 ngày$/.test(kpiSub), kpiSub);
    await b.viewport(390, 844); await nav('/admin', 2500);
    check('phone: no sideways page scroll on the dashboard', (await ev('document.documentElement.scrollWidth - innerWidth')) <= 1);
    await b.shot('dash-390', true);
  });
});
