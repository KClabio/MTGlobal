// Hỗ trợ (/ho-tro): the page for visitors (groups, search, topic tiles, links to one question, phone width),
// the links to it (footer, account menu, login / sign-up / request forms, Hồ sơ) and Admin → Hỗ trợ
// (add / check / edit / hide / order within a group / delete, search across the groups).
import { suite, part, check, db, BASE, createUser, removeLater, restoreLater } from './lib/index.mjs';

const GROUPS = ['tai-khoan', 'gui-yeu-cau', 'san-pham', 'quyen-rieng-tu', 'su-dung'];
const page = async (p, lang = 'vi', sid = null) => {
  const r = await fetch(BASE + p, { headers: { cookie: `lang=${lang}; alang=vi${sid ? `; connect.sid=${sid}` : ''}` } });
  return { status: r.status, html: await r.text() };
};

await suite(async (b) => {
  const { ev, sleep } = b;
  const d = await db();
  await page('/ho-tro'); // the first visit saves the starter questions (lib/help-topics.js)
  removeLater('helpitems', { questionVi: /^ZZ / });
  await restoreLater('helpitems', {}); // the order check re-saves a group: put every question back exactly
  const admin = await createUser('help');
  const customer = await createUser('help-customer', 'customer');

  await part(b, 'the page and the links to it (HTTP)', async () => {
    const shown = await d.collection('helpitems').find({ published: true }).sort({ order: 1, _id: 1 }).toArray();
    const { status, html } = await page('/ho-tro');
    const groupIds = [...html.matchAll(/<section class="help-group" id="([^"]+)"/g)].map((m) => m[1]);
    const items = [...html.matchAll(/<details class="faq-item" id="q-([a-f0-9]{24})"/g)].map((m) => m[1]);
    check('open to visitors who are not logged in', status === 200);
    check('the groups with questions, in the fixed order', JSON.stringify(groupIds) === JSON.stringify(GROUPS.filter((g) => shown.some((s) => s.group === g))), groupIds);
    check(`every shown question once (${shown.length})`, items.length === shown.length && shown.every((s) => items.includes(String(s._id))), { items: items.length, shown: shown.length });
    check('a topic tile per group, linking to it', JSON.stringify([...html.matchAll(/<a class="help-topic" href="#([^"]+)"/g)].map((m) => m[1])) === JSON.stringify(groupIds));
    check('"Vẫn cần hỗ trợ?" band with the request button', /Vẫn cần hỗ trợ\?/.test(html) && /class="btn cta-band-btn" href="\/lien-he"/.test(html));
    const en = (await page('/ho-tro', 'en')).html;
    const firstEn = shown.find((s) => s.questionEn);
    check('English page: English title and questions', /<h1>Help<\/h1>/.test(en) && en.includes(`<summary>${firstEn.questionEn.replace(/'/g, '&#39;')}</summary>`), firstEn.questionEn);
    const sitemap = await (await fetch(BASE + '/sitemap.xml')).text();
    check('in the sitemap', sitemap.includes(`<loc>${BASE}/ho-tro</loc>`));

    const home = (await page('/')).html;
    check('footer: "Hỗ trợ" under the contact links', /<a href="\/lien-he">[^<]*<\/a>\s*<a href="\/ho-tro">Hỗ trợ<\/a>/.test(home));
    check('login page: "Gặp khó khăn khi đăng nhập?" → the account questions', /Gặp khó khăn khi đăng nhập\? <a href="\/ho-tro#tai-khoan">Xem hướng dẫn<\/a>/.test((await page('/dang-nhap')).html));
    check('sign-up page: → the account questions', /<a href="\/ho-tro#tai-khoan">/.test((await page('/dang-ky')).html));
    const logged = (p) => page(p, 'vi', customer.sid);
    check('account menu: "Hỗ trợ" after Hồ sơ', /<a href="\/ho-so">Hồ sơ<\/a>\s*<a href="\/ho-tro">Hỗ trợ<\/a>/.test((await logged('/')).html));
    check('contact form and Yêu cầu của tôi: → the request questions', /<a href="\/ho-tro#gui-yeu-cau">/.test((await logged('/lien-he')).html) && /<a href="\/ho-tro#gui-yeu-cau">/.test((await logged('/tai-khoan')).html));
    check('Hồ sơ, "Dữ liệu của bạn": → the privacy questions', /<a href="\/ho-tro#quyen-rieng-tu">/.test((await logged('/ho-so')).html));
  });

  await part(b, 'search, tiles and links to one question (browser)', async () => {
    await b.nav('/ho-tro', 400);
    const state = () => ev(`({
      shown: [...document.querySelectorAll('.faq-item')].filter((e) => !e.hidden).length,
      total: document.querySelectorAll('.faq-item').length,
      groups: [...document.querySelectorAll('.help-group')].filter((g) => !g.hidden).map((g) => g.id),
      none: !document.querySelector('[data-search-none]').hidden,
      count: document.querySelector('.card-search-count').textContent,
    })`);
    const start = await state();
    check('search box shown; nothing hidden at first', start.shown === start.total && start.total > 0 && !(await ev(`document.querySelector('[data-card-search]').hidden`)), start);
    await b.clickAt('[data-card-search] input');
    await b.type('google');
    const g = await state();
    check('"google": only matching questions, groups without one step aside, count shown', g.shown > 0 && g.shown < g.total && g.groups.includes('tai-khoan') && !g.groups.includes('su-dung') && /phù hợp/.test(g.count), g);
    await ev(`(() => { const i = document.querySelector('[data-card-search] input'); i.value = 'mat khau'; i.dispatchEvent(new Event('input')); })()`);
    check('accents optional: "mat khau" finds the password questions', (await ev(`[...document.querySelectorAll('.faq-item:not([hidden]) summary')].some((s) => /mật khẩu/i.test(s.textContent))`)));
    await ev(`(() => { const i = document.querySelector('[data-card-search] input'); i.value = 'zzqxw'; i.dispatchEvent(new Event('input')); })()`);
    const none = await state();
    check('no match: the "Không tìm thấy" line', none.shown === 0 && none.none && none.groups.length === 0, none);
    await b.key('Escape');
    const back = await state();
    check('Esc empties the search: everything back', back.shown === back.total && !back.none && back.groups.length === start.groups.length, back);

    await b.clickAt('.help-topic[href="#quyen-rieng-tu"]');
    await sleep(600);
    check('a topic tile jumps to its group, clear of the sticky header', await ev(`(() => { const t = document.getElementById('quyen-rieng-tu').getBoundingClientRect().top; const h = document.querySelector('.site-header').getBoundingClientRect().bottom; return location.hash === '#quyen-rieng-tu' && t >= h - 2 && t < h + 120; })()`));

    const target = await ev(`document.querySelectorAll('#su-dung .faq-item')[1].id`);
    await b.nav(`/ho-tro?lang=vi#${target}`, 500); // another address than the page open now, so it loads again
    check('/ho-tro#q-… opens that question, and only that one', await ev(`document.getElementById(${JSON.stringify(target)}).open && document.querySelectorAll('.faq-item[open]').length === 1`));

    await b.reducedMotion();
    await b.nav('/ho-tro', 300);
    await b.clickAt('#tai-khoan .faq-item summary');
    await sleep(500);
    check('reduced motion: a question still opens on click, answer visible', await ev(`(() => { const d = document.querySelector('#tai-khoan .faq-item'); return d.open && d.querySelector('.prose-text').getBoundingClientRect().height > 20; })()`));
    await b.reducedMotion(false);

    await b.viewport(390, 844);
    await b.nav('/ho-tro', 400);
    const phone = await ev(`({ wide: document.documentElement.scrollWidth > document.documentElement.clientWidth, cols: getComputedStyle(document.querySelector('.help-topics')).gridTemplateColumns.split(' ').length })`);
    check('phone width: no sideways scroll, topic tiles two by two', !phone.wide && phone.cols === 2, phone);
    await b.shot('help-phone', true);
    await b.viewport(1280, 900);
    await b.setCookie('theme', 'dark');
    await b.nav('/ho-tro', 400);
    await b.shot('help-dark');
    await b.setCookie('theme', 'light');
    await b.nav('/ho-tro', 400);
    await b.shot('help', true);
  });

  await part(b, 'Admin → Hỗ trợ (HTTP)', async () => {
    const post = (p, fields) => fetch(BASE + p, { method: 'POST', body: new URLSearchParams(fields), redirect: 'manual', headers: { cookie: `connect.sid=${admin.sid}; alang=vi` } });
    const list = await page('/admin/ho-tro', 'vi', admin.sid);
    check('the list: one table per group, sortable within the group', list.status === 200 && GROUPS.every((g) => list.html.includes(`data-sortable="help-${g}"`) || list.html.includes(`/admin/ho-tro/moi?nhom=${g}`)));
    check('sidebar: "Hỗ trợ" highlighted', /<a href="\/admin\/ho-tro" class="active" aria-current="page">/.test(list.html));
    check('"+" of a group picks that group', /<option value="san-pham" selected>/.test((await page('/admin/ho-tro/moi?nhom=san-pham', 'vi', admin.sid)).html));

    const r1 = await post('/admin/ho-tro/moi', { group: 'san-pham', questionVi: 'ZZ Câu hỏi thử?', questionEn: 'ZZ Test question?', answerVi: 'Trả lời thử.\n- Dòng một', answerEn: 'Test answer.', published: 'on' });
    const item = await d.collection('helpitems').findOne({ questionVi: 'ZZ Câu hỏi thử?' });
    const lastInGroup = await d.collection('helpitems').find({ group: 'san-pham' }).sort({ order: -1 }).limit(1).next();
    check('add: saved at the end of its group, shown; back on that group tab', r1.status === 302 && r1.headers.get('location') === '/admin/ho-tro?nhom=san-pham' && item && item.published && String(lastInGroup._id) === String(item._id), { item, to: r1.headers.get('location') });
    const pub = (await page('/ho-tro')).html;
    check('… and on the page, the answer\'s list line as a list', pub.includes(`id="q-${item._id}"`) && /<p>Trả lời thử\.<\/p>\s*<ul><li>Dòng một<\/li><\/ul>/.test(pub));

    const bad = await post('/admin/ho-tro/moi', { group: 'san-pham', questionVi: '  ', answerVi: 'x', published: 'on' });
    const badHtml = await bad.text();
    check('no Vietnamese question: refused with a message, what was typed kept, nothing saved', bad.status === 400 && /Câu hỏi \(Tiếng Việt\) là bắt buộc/.test(badHtml) && /<option value="san-pham" selected>/.test(badHtml) && (await d.collection('helpitems').countDocuments({ answerVi: 'x' })) === 0);
    const badGroup = await post('/admin/ho-tro/moi', { group: 'khong-co', questionVi: 'ZZ x', answerVi: 'x' });
    check('an unknown group is refused', badGroup.status === 400 && !(await d.collection('helpitems').findOne({ questionVi: 'ZZ x' })));

    const r2 = await post(`/admin/ho-tro/${item._id}/sua`, { group: 'su-dung', questionVi: 'ZZ Câu hỏi đã sửa?', questionEn: '', answerVi: 'Đã sửa.', answerEn: '' });
    const edited = await d.collection('helpitems').findOne({ _id: item._id });
    check('edit: moved to another group, unticked = hidden; back on the new group tab', r2.status === 302 && r2.headers.get('location') === '/admin/ho-tro?nhom=su-dung' && edited.group === 'su-dung' && !edited.published && edited.questionVi === 'ZZ Câu hỏi đã sửa?', edited);
    check('… a hidden question is not on the page, but stays in the admin list with "Ẩn"', !(await page('/ho-tro')).html.includes(`q-${item._id}`) && /ZZ Câu hỏi đã sửa\?<\/td>\s*<td><span class="tag">Ẩn<\/span>/.test((await page('/admin/ho-tro', 'vi', admin.sid)).html));

    const ids = (await d.collection('helpitems').find({ group: 'su-dung' }).sort({ order: 1, _id: 1 }).toArray()).map((x) => String(x._id));
    const sortPost = (type, list) => fetch(`${BASE}/admin/thu-tu/${type}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `connect.sid=${admin.sid}` }, body: JSON.stringify({ ids: list }) });
    const so = await sortPost('help-su-dung', [...ids].reverse());
    const after = (await d.collection('helpitems').find({ group: 'su-dung' }).sort({ order: 1 }).toArray()).map((x) => String(x._id));
    check('drag order within a group saves', so.status === 200 && JSON.stringify(after) === JSON.stringify([...ids].reverse()));
    const other = await d.collection('helpitems').findOne({ group: 'tai-khoan' });
    check('a question from another group can\'t be mixed in', (await sortPost('help-su-dung', [...ids, String(other._id)])).status === 400);
    await sortPost('help-su-dung', ids);

    const r3 = await post(`/admin/ho-tro/${item._id}/xoa`, {});
    check('delete; back on its group tab', r3.status === 302 && r3.headers.get('location') === '/admin/ho-tro?nhom=su-dung' && !(await d.collection('helpitems').findOne({ _id: item._id })));
    const dash = (await page('/admin', 'vi', admin.sid)).html;
    check('dashboard: Hỗ trợ in the content list', (dash.match(/href="\/admin\/ho-tro"/g) || []).length >= 2); // sidebar + content list
  });

  await part(b, 'Admin → Hỗ trợ search across groups (browser)', async () => {
    await b.login(admin.sid);
    await b.nav('/admin/ho-tro', 400);
    const total = await ev(`document.querySelectorAll('tr[data-id]').length`);
    await b.clickAt('[data-list-search="help"] input');
    await b.type('google');
    await sleep(200);
    const s = await ev(`({
      shown: [...document.querySelectorAll('tr[data-id]')].filter((r) => !r.hidden).length,
      groups: [...document.querySelectorAll('[data-list-group="help"]')].filter((g) => !g.hidden).length,
      paused: [...document.querySelectorAll('tbody[data-list-part="help"]')].every((t) => t.classList.contains('is-filtered')),
      marked: document.querySelectorAll('tr[data-id]:not([hidden]) mark.search-hit').length,
    })`);
    check('search covers every group, hides the rest, pauses dragging, marks the matches', s.shown > 0 && s.shown < total && s.groups >= 1 && s.groups < GROUPS.length && s.paused && s.marked > 0, s);
    await b.key('Escape');
    await sleep(200);
    check('Esc: all questions and groups back', (await ev(`[...document.querySelectorAll('tr[data-id]')].filter((r) => !r.hidden).length`)) === total && (await ev(`[...document.querySelectorAll('[data-list-group="help"]')].every((g) => !g.hidden)`)));
    await b.shot('help-admin');
  });

  await part(b, 'Admin → Hỗ trợ: one tab per group (browser)', async () => {
    const counts = {};
    for (const g of GROUPS) counts[g] = await d.collection('helpitems').countDocuments({ group: g });
    await b.login(admin.sid);
    await b.nav('/admin/ho-tro', 400);
    const chips = await ev(`[...document.querySelectorAll('[data-list-filter="help"] .filter-chip')].map((c) => ({ value: c.dataset.value, count: +c.querySelector('.filter-chip-count').textContent, on: c.classList.contains('is-active') }))`);
    const total = Object.values(counts).reduce((a, n) => a + n, 0);
    check('chips: Tất cả + one per group, in order, with their counts; Tất cả chosen',
      JSON.stringify(chips.map((c) => c.value)) === JSON.stringify(['', ...GROUPS]) && chips[0].count === total && chips[0].on && GROUPS.every((g, i) => chips[i + 1].count === counts[g]), chips);

    const view = () => ev(`({
      groups: [...document.querySelectorAll('[data-list-group="help"]')].filter((g) => !g.hidden).map((g) => g.dataset.listGroupKey),
      rows: [...document.querySelectorAll('tr[data-id]')].filter((r) => !r.hidden).length,
      url: location.search,
      add: document.querySelector('.admin-topbar a[href^="/admin/ho-tro/moi"]').getAttribute('href'),
      drag: (() => { const t = document.querySelector('tbody[data-sortable="help-san-pham"]'); return !t.classList.contains('is-filtered') && !(t._sortable && t._sortable.option('disabled')); })(),
      paused: document.querySelector('.sort-hint').classList.contains('is-paused'),
      none: !document.querySelector('[data-list-search-none="help"]').hidden,
    })`);
    await b.clickAt('[data-list-filter="help"] .filter-chip[data-value="san-pham"]');
    await sleep(300);
    const tab = await view();
    check('"Sản phẩm & giải pháp": only that group, all its questions, kept in the address; the top "+" starts in that group',
      JSON.stringify(tab.groups) === '["san-pham"]' && tab.rows === counts['san-pham'] && /nhom=san-pham/.test(tab.url) && /^\/admin\/ho-tro\/moi\?.*nhom=san-pham/.test(tab.add) && !tab.none, tab);
    check('… dragging stays on inside the tab (whole group shown), no "paused" hint', tab.drag && !tab.paused, tab);

    // ↓ on the first handle moves that question down, saved at once; ↑ puts it back
    const order = () => d.collection('helpitems').find({ group: 'san-pham' }).sort({ order: 1, _id: 1 }).toArray().then((l) => l.map((x) => String(x._id)));
    const before = await order();
    await ev(`document.querySelector('tbody[data-sortable="help-san-pham"] .drag-handle').focus()`);
    await b.key('ArrowDown', 'ArrowDown', 40);
    await sleep(700);
    const moved = await order();
    check('… a question moved inside the tab is saved in its new place', moved[0] === before[1] && moved[1] === before[0], { before, moved });
    await b.key('ArrowUp', 'ArrowUp', 38);
    await sleep(700);
    check('… and moved back', JSON.stringify(await order()) === JSON.stringify(before));

    await b.clickAt('[data-list-search="help"] input');
    await b.type('video');
    await sleep(200);
    const found = await view();
    check('search inside a tab: only matches of that group, dragging paused while searching', JSON.stringify(found.groups) === '["san-pham"]' && found.rows >= 1 && found.rows < counts['san-pham'] && found.paused, found);
    await b.key('Escape');

    await b.nav('/admin/ho-tro?nhom=gui-yeu-cau', 400);
    const back = await view();
    check('opening the list with ?nhom=… (after saving a question) lands on that tab', JSON.stringify(back.groups) === '["gui-yeu-cau"]' && (await ev(`document.querySelector('.filter-chip[data-value="gui-yeu-cau"]').classList.contains('is-active')`)), back);
    await b.shot('help-admin-tab');
    await b.clickAt('[data-list-filter="help"] .filter-chip[data-value=""]');
    await sleep(300);
    const all = await view();
    check('"Tất cả": every group back, the address cleared', all.groups.length === GROUPS.length && all.rows === total && !/nhom=/.test(all.url), all);
  });
});
