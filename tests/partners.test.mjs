// Partners: logo strips link to /doi-tac/<slug>; each partner page (text, logo, website button, contacts, back link);
// admin add / edit / validation / order / delete; tiles at most 6 per row on Về MTG, float + glow on hover;
// Trang chủ's sliding row (one line moving right and looping, stops under the mouse, ‹ › steps, drag, keyboard, print).
import { suite, part, check, db, BASE, createUser, removeLater, restoreLater } from './lib/index.mjs';

const SLUGS = ['vsi-education', 'vex-robotics', 'kc-education', 'nexta', 'robot-steam-viet-nam', 'hi-steam', 'tpe'];
const URLS = { 'vsi-education': 'https://web.facebook.com/vsi.education', 'vex-robotics': 'https://www.vexrobotics.com/', 'kc-education': 'https://kcedu.vn/', nexta: 'https://nexta.edu.vn/', 'robot-steam-viet-nam': 'https://robotsteam.vn/', 'hi-steam': 'https://histeam.vn/', tpe: 'https://tpe.vn/' };
const EMAILS = { 'vsi-education': ['vsi.stemedu@gmail.com'], 'vex-robotics': ['ap-cs@vexrobotics.com', 'ap-events@vex.com', 'ap-media@vex.com'], 'kc-education': ['stem@kidscode.edu.vn'], nexta: ['hotro@nexta.edu.vn'], 'robot-steam-viet-nam': ['hotro@robotsteam.vn'], 'hi-steam': ['info@histeam.vn'], tpe: ['info@tpe.vn'] };
const TELS = { 'vsi-education': [], 'vex-robotics': ['+85221520727'], 'kc-education': ['0888424222'], nexta: ['0866077568', '1800556813'], 'robot-steam-viet-nam': ['0934458255'], 'hi-steam': ['0983251086'], tpe: ['0868280666'] };
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#34;/g, '"');
const page = async (p, lang = 'vi') => { const r = await fetch(BASE + p, { headers: { cookie: `lang=${lang}` } }); return { status: r.status, html: await r.text() }; };

await suite(async (b) => {
  const { ev, sleep } = b;
  const d = await db();
  const partners = await d.collection('partners').find().sort({ order: 1, _id: 1 }).toArray();
  const admin = await createUser('partner');
  removeLater('partners', { name: /^ZZ / });
  await restoreLater('partners', {}); // the order check re-saves every partner (new updatedAt): put them back exactly

  await part(b, 'partner strips and pages (HTTP)', async () => {
    check('DB holds the 7 partners in the requested order', JSON.stringify(partners.map((p) => p.slug)) === JSON.stringify(SLUGS), partners.map((p) => p.slug));
    for (const p of ['/', '/ve-mtg']) {
      const { html } = await page(p);
      const at = html.search(/class="partner-strip[" ]/); // Trang chủ: "partner-strip is-marquee"
      const strip = html.slice(at, html.indexOf('</section>', at));
      const hrefs = [...strip.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
      check(`${p}: 7 logos, each linking to its own page in order`, JSON.stringify(hrefs) === JSON.stringify(SLUGS.map((s) => `/doi-tac/${s}`)), hrefs);
      check(`${p}: no logo opens an outside site directly (no target=_blank in the strip)`, !/target="_blank"|https?:\/\//.test(strip.replace(/src="[^"]*"/g, '')));
    }
    const logoTypes = await Promise.all(partners.map(async (p) => (await fetch(BASE + p.logo)).headers.get('content-type')));
    check('every logo file loads as an image', logoTypes.every((t) => /^image\/png/.test(t)), logoTypes);
    for (const slug of SLUGS) {
      const doc = partners.find((p) => p.slug === slug);
      for (const lang of ['vi', 'en']) {
        const { status, html } = await page(`/doi-tac/${slug}`, lang);
        const h1 = decode((html.match(/<h1>([^<]+)<\/h1>/) || [])[1] || '');
        const visit = html.match(/<a class="btn btn-primary btn-block partner-visit" href="([^"]+)" target="_blank" rel="noopener">\s*([^<]+)/);
        // The partner's own contacts: the page before the site footer (which carries MTG's own email and phones)
        const own = html.slice(0, html.indexOf('<footer') > 0 ? html.indexOf('<footer') : html.length);
        const mails = [...own.matchAll(/href="mailto:([^"]+)"/g)].map((m) => m[1]);
        const tels = [...own.matchAll(/href="tel:([^"]+)"/g)].map((m) => m[1]);
        const firstLine = (lang === 'en' ? doc.descriptionEn : doc.descriptionVi).split('\n').find((l) => l && !l.startsWith('-')).replace(/^[-*•]\s+/, '');
        const ok = status === 200 && h1 === doc.name && visit && decode(visit[1]) === URLS[slug] && visit[2].trim() === (lang === 'en' ? 'Visit website' : 'Truy cập website')
          && JSON.stringify(mails) === JSON.stringify(EMAILS[slug]) && JSON.stringify(tels) === JSON.stringify(TELS[slug])
          && decode(html).includes(firstLine) && html.includes(`src="${doc.logo}"`) && /href="\/ve-mtg#doi-tac" class="hero-back"/.test(html);
        check(`[${lang}] /doi-tac/${slug}: name, text, logo, website button, ${mails.length} email + ${tels.length} phone links, back link`, ok,
          { status, h1, visit: visit && visit.slice(1), mails, tels, firstLine, hasText: decode(html).includes(firstLine) });
      }
    }
    const vi = (await page('/doi-tac/vex-robotics')).html; const en = (await page('/doi-tac/vex-robotics', 'en')).html;
    check('VEX fax stays plain text (not a phone link), labelled "Fax"', /partner-contact-label">Fax<\/span>\s*<span>\+852-2117-9335<\/span>/.test(vi));
    check('contact labels: "Điện thoại" on VI, "Phone" on EN; VEX department names kept', /label">Điện thoại</.test(vi) && /label">Phone</.test(en) && /VEX Competition Support/.test(en));
    const nx = (await page('/doi-tac/nexta', 'en')).html;
    check('Nexta EN: "Tổng đài" shown as "Call centre", Hotline kept', /label">Call centre</.test(nx) && /label">Hotline</.test(nx));
    check('unknown partner address → 404', (await page('/doi-tac/khong-co-doi-tac-nay')).status === 404);
  });

  await part(b, 'partner admin (HTTP)', async () => {
    const adminPost = (p, fields) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); return fetch(BASE + p, { method: 'POST', body: fd, redirect: 'manual', headers: { cookie: `connect.sid=${admin.sid}; alang=vi` } }); };
    const created = [];
    const r1 = await adminPost('/admin/doi-tac/moi', { name: 'ZZ Đối tác thử', url: 'zz-example.vn', descriptionVi: 'Giới thiệu thử.\n- Mục một', descriptionEn: 'Test intro.', contacts: 'Email: zz@example.vn\nĐiện thoại: 0912 345 678' });
    const d1 = await d.collection('partners').findOne({ name: 'ZZ Đối tác thử' }); if (d1) created.push(d1._id);
    check('admin: new partner saved (redirect), slug made from the Vietnamese name, website completed to https://', r1.status === 302 && d1 && d1.slug === 'zz-doi-tac-thu' && d1.url === 'https://zz-example.vn/' && d1.order === 7, d1 && { slug: d1.slug, url: d1.url, order: d1.order });
    const r2 = await adminPost('/admin/doi-tac/moi', { name: 'ZZ Đối tác thử', url: '', descriptionVi: '', descriptionEn: '', contacts: '' });
    const d2 = await d.collection('partners').find({ name: 'ZZ Đối tác thử' }).sort({ _id: -1 }).limit(1).next(); if (d2 && String(d2._id) !== String(d1._id)) created.push(d2._id);
    check('admin: same name again gets its own address (…-2)', r2.status === 302 && d2.slug === 'zz-doi-tac-thu-2', d2 && d2.slug);
    const p2 = (await page('/doi-tac/zz-doi-tac-thu-2')).html;
    check('a partner without website/description: no button, "being updated" note, no contact list', !/partner-visit/.test(p2) && /Thông tin giới thiệu đang được cập nhật/.test(p2) && !/partner-contacts/.test(p2));
    const bad = await adminPost('/admin/doi-tac/moi', { name: 'ZZ Bad', url: 'javascript:alert(1)', descriptionVi: '', descriptionEn: '', contacts: '' });
    const badHtml = await bad.text();
    check('admin: a non-web address is refused with a message and nothing is saved', bad.status === 400 && /Website chưa đúng/.test(badHtml) && !(await d.collection('partners').findOne({ name: 'ZZ Bad' })));
    const r3 = await adminPost(`/admin/doi-tac/${d1._id}/sua`, { name: 'ZZ Đối tác thử', url: 'https://zz-example.vn/gioi-thieu', slug: 'zz-doi-tac-thu', descriptionVi: 'Nội dung đã sửa ZZ.', descriptionEn: 'Edited ZZ.', contacts: 'Hotline: 1900 1234' });
    const p1 = (await page('/doi-tac/zz-doi-tac-thu')).html;
    check('admin: edit saves text, website and contacts, and keeps the address', r3.status === 302 && /Nội dung đã sửa ZZ\./.test(p1) && /href="https:\/\/zz-example.vn\/gioi-thieu"/.test(p1) && /href="tel:19001234"/.test(p1));
    const r4 = await adminPost(`/admin/doi-tac/${d2._id}/sua`, { name: 'ZZ Khác', url: '', slug: 'zz-doi-tac-thu', descriptionVi: '', descriptionEn: '', contacts: '' });
    const d2b = await d.collection('partners').findOne({ _id: d2._id });
    check("admin: typing another partner's address is made unique, never duplicated", r4.status === 302 && d2b.slug === 'zz-doi-tac-thu-2', d2b.slug);
    const formHtml = await (await fetch(`${BASE}/admin/doi-tac/${d1._id}/sua`, { headers: { cookie: `connect.sid=${admin.sid}; alang=vi` } })).text();
    check('admin form: description VI/EN, contacts, website, address fields; "view page" opens the partner page',
      ['descriptionVi', 'descriptionEn', 'contacts', 'url', 'slug'].every((n) => formHtml.includes(`name="${n}"`)) && formHtml.includes('href="/doi-tac/zz-doi-tac-thu"'));
    // Drag order still works (reverse, then put back)
    const ids = (await d.collection('partners').find().sort({ order: 1, _id: 1 }).toArray()).map((p) => String(p._id));
    const sortPost = (list) => fetch(BASE + '/admin/thu-tu/partners', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `connect.sid=${admin.sid}` }, body: JSON.stringify({ ids: list }) });
    const so = await sortPost([...ids].reverse());
    const after = (await d.collection('partners').find().sort({ order: 1 }).toArray()).map((p) => String(p._id));
    await sortPost(ids);
    check('admin: drag-reorder still saves the new order', so.status === 200 && JSON.stringify(after) === JSON.stringify([...ids].reverse()));
    for (const id of created) await adminPost(`/admin/doi-tac/${id}/xoa`, {});
    check('admin: delete works', (await d.collection('partners').countDocuments({ _id: { $in: created } })) === 0);
    check('the 7 partners are back in order', JSON.stringify((await d.collection('partners').find().sort({ order: 1 }).toArray()).map((p) => p.slug)) === JSON.stringify(SLUGS));
  });

  await part(b, 'partner pages in the browser', async () => {
    const nav = async (p) => { await b.nav(p, 500); await ev(`Promise.race([Promise.all([...document.images].map((i) => { i.loading = 'eager'; return i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; }); })), new Promise((r) => setTimeout(r, 4000))])`); };
    const shot = (name) => b.shot(name);
    const toStrip = `(() => { const s = document.querySelector('.partner-strip'); window.scrollTo(0, s.getBoundingClientRect().top + scrollY - 300); return true; })()`;
    await nav('/');
    const tiles = await ev(`[...document.querySelectorAll('.partner-strip .partner-tile:not([data-partner-clone]) img')].map((i) => { const r = i.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), nat: i.naturalWidth > 0 }; })`);
    check('home strip: 7 logos loaded, each visible inside its tile (>=40px wide, 40–76px tall)', tiles.length === 7 && tiles.every((t) => t.nat && t.w >= 40 && t.h >= 40 && t.h <= 76), tiles);
    await ev(toStrip); await shot('partners-strip-1280-light');
    const l = b.waitLoad(); await ev(`document.querySelector('.partner-strip .partner-tile:not([data-partner-clone]) a[href="/doi-tac/vex-robotics"]').click()`); await l; await sleep(400);
    check('clicking the VEX logo opens /doi-tac/vex-robotics in the same tab', await ev('location.pathname') === '/doi-tac/vex-robotics');
    const layout = await ev(`(() => { const c = document.querySelector('.partner-card').getBoundingClientRect(); const m = document.querySelector('.partner-detail-main').getBoundingClientRect(); return { side: c.left > m.right, overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
    check('partner page (1280): card beside the text, no sideways scroll', layout.side && !layout.overflow, layout);
    await shot('partner-vex-1280-light');
    await b.setCookie('theme', 'dark');
    await nav('/doi-tac/nexta'); await shot('partner-nexta-1280-dark');
    await b.setCookie('theme', 'light');
    await b.viewport(390, 844);
    await nav('/doi-tac/robot-steam-viet-nam');
    const mob = await ev(`(() => { const c = document.querySelector('.partner-card').getBoundingClientRect(); const m = document.querySelector('.partner-detail-main').getBoundingClientRect(); return { cardFirst: c.top < m.top, overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
    check('partner page (390): logo card first, then the text, no sideways scroll', mob.cardFirst && !mob.overflow, mob);
    await ev('window.scrollTo(0, 260)'); await shot('partner-robotsteam-390');
    await b.login(admin.sid);
    await b.viewport(1280);
    await nav(`/admin/doi-tac/${partners[1]._id}/sua`); await shot('admin-partner-form');
  });

  await part(b, 'partner tiles: rows, float + glow', async () => {
    const { nav, mouse, shot } = b;
    // Về MTG keeps the grid of tiles (Trang chủ slides them in one line: next part)
    for (const [w, per] of [[1280, 6], [800, 4], [390, 3]]) {
      await b.viewport(w); await nav('/ve-mtg', 200);
      const rows = await ev(`(() => { const tiles = [...document.querySelectorAll('.partner-strip .partner-tile')]; const strip = document.querySelector('.partner-strip').getBoundingClientRect(); const byRow = {};
        tiles.forEach((t) => { const r = t.getBoundingClientRect(); const k = Math.round(r.top); (byRow[k] = byRow[k] || []).push(r); });
        const rs = Object.values(byRow); const last = rs[rs.length - 1]; const mid = (last[0].left + last[last.length - 1].right) / 2;
        return { counts: rs.map((r) => r.length), lastCentred: Math.abs(mid - (strip.left + strip.width / 2)) < 2, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
      const exp = []; for (let n = 7; n > 0; n -= per) exp.push(Math.min(per, n));
      check(`partners at ${w}px: rows of ${JSON.stringify(exp)}, last row centred`, JSON.stringify(rows.counts) === JSON.stringify(exp) && rows.lastCentred && rows.overflow === 0, rows);
    }
    await b.viewport(1280);
    // The second real logo of Trang chủ's sliding row (the copies around it are not hoverable: inert)
    const TILE2 = `document.querySelectorAll('.partner-strip .partner-tile:not([data-partner-clone])')[1]`;
    for (const theme of ['light', 'dark']) {
      await b.setCookie('theme', theme); await nav('/', 200);
      await ev(`document.querySelector('.partner-strip').scrollIntoView({ block: 'center' })`); await sleep(200);
      const before = await ev(`(() => { const t = ${TILE2}; return { top: t.getBoundingClientRect().top, shadow: getComputedStyle(t).boxShadow, bg: getComputedStyle(t).backgroundColor }; })()`);
      const p = await ev(`(() => { const r = ${TILE2}.querySelector('a').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await mouse('mouseMoved', p); await sleep(500);
      const during = await ev(`(() => { const t = ${TILE2}; return { top: t.getBoundingClientRect().top, shadow: getComputedStyle(t).boxShadow }; })()`);
      await shot(`partner-hover-${theme}`);
      await mouse('mouseMoved', { x: 5, y: 5 }); await sleep(500);
      const after = await ev(`${TILE2}.getBoundingClientRect().top`);
      const glow = /rgba\((21, 101, 192|110, 170, 255)/.test(during.shadow) && (during.shadow.match(/rgba/g) || []).length >= 3;
      check(`partner hover (${theme}): floats up ~6px with a glow around the tile, then settles back; tile stays white`, Math.round(before.top - during.top) === 6 && glow && Math.round(after) === Math.round(before.top) && before.bg === 'rgb(255, 255, 255)', { before, during, after });
    }
  });

  // Trang chủ: one line of logos sliding slowly to the right and looping (public/js/main.js); stops while the mouse is
  // over the row or the ‹ › buttons, which step one logo; drag; keyboard focus brings a logo into view.
  await part(b, 'home partner slider', async () => {
    const { nav, mouse } = b;
    const ORIG = `[...document.querySelectorAll('.partner-strip.is-marquee > .partner-tile:not([data-partner-clone])')]`;
    // The row's shift (px), the loop's length W (one list + gap) and one step (logo + gap)
    const geo = () => ev(`(() => { const s = document.querySelector('.partner-strip.is-marquee'); const o = ${ORIG}; const m = getComputedStyle(s).transform;
      return { x: m === 'none' ? 0 : new DOMMatrix(m).m41, W: o[0].offsetLeft - s.firstElementChild.offsetLeft, step: o[1].offsetLeft - o[0].offsetLeft }; })()`);
    const wrapDiff = (a, c, W) => { let d = (c - a) % W; if (d > W / 2) d -= W; if (d < -W / 2) d += W; return d; };
    const speedOver = async (ms) => { const a = await geo(); const t0 = Date.now(); await sleep(ms); const c = await geo(); return wrapDiff(a.x, c.x, a.W) / ((Date.now() - t0) / 1000); };
    const centre = (expr) => ev(`(() => { const r = (${expr}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const toRow = () => ev(`(() => { document.getElementById('doi-tac').scrollIntoView({ block: 'center' }); return true; })()`);
    await b.setCookie('theme', 'light');
    await b.reducedMotion(false);
    await b.viewport(1280);
    await nav('/', 300); await toRow(); await mouse('mouseMoved', { x: 5, y: 5 }); await sleep(800);

    // ---- 1. One line; each partner once for screen readers and Tab; copies hidden ----
    const info = await ev(`(() => { const all = [...document.querySelectorAll('.partner-strip.is-marquee > .partner-tile')]; const copies = all.filter((t) => t.hasAttribute('data-partner-clone'));
      return { rows: new Set(all.map((t) => Math.round(t.getBoundingClientRect().top))).size, real: ${ORIG}.length, copies: copies.length,
        reachable: [...document.querySelectorAll('.partner-strip.is-marquee a')].filter((a) => !a.closest('[aria-hidden="true"]')).map((a) => a.getAttribute('href')),
        copiesHidden: copies.every((t) => t.getAttribute('aria-hidden') === 'true' && t.querySelector('a').tabIndex === -1 && t.querySelector('img').alt === '' && !t.hasAttribute('role') && !t.inert),
        list: document.querySelector('.partner-strip.is-marquee').getAttribute('role'), items: ${ORIG}.every((t) => t.getAttribute('role') === 'listitem'),
        wide: document.documentElement.scrollWidth - document.documentElement.clientWidth, arrows: document.querySelectorAll('#doi-tac [data-partner-prev], #doi-tac [data-partner-next]').length }; })()`);
    check('home partners: one line; the 7 logos once in a list (copies hidden from screen readers and Tab); ‹ › buttons; no sideways scroll',
      info.rows === 1 && info.real === 7 && info.copies >= 7 && JSON.stringify(info.reachable) === JSON.stringify(SLUGS.map((s) => `/doi-tac/${s}`)) && info.copiesHidden && info.list === 'list' && info.items && info.wide === 0 && info.arrows === 2, info);

    // ---- 2. Slides to the right, slowly ----
    const v = await speedOver(2000);
    check(`slides to the right at about 24 px/s (${v.toFixed(1)})`, v > 18 && v < 30, v);

    // ---- 3. Stops while the mouse is over the row, and over the buttons; carries on after ----
    await mouse('mouseMoved', await centre(`${ORIG}[2]`)); await sleep(700);
    const vRow = await speedOver(1000);
    await mouse('mouseMoved', await centre(`document.querySelector('[data-partner-next]')`)); await sleep(700);
    const vBtn = await speedOver(1000);
    await mouse('mouseMoved', { x: 5, y: 5 }); await sleep(800);
    const vAfter = await speedOver(1000);
    check(`stops under the mouse (row ${vRow.toFixed(1)}, buttons ${vBtn.toFixed(1)} px/s) and carries on afterwards (${vAfter.toFixed(1)} px/s)`, Math.abs(vRow) < 0.5 && Math.abs(vBtn) < 0.5 && vAfter > 15, { vRow, vBtn, vAfter });

    // ---- 4. ‹ one logo right, › one logo left; 7 × › comes round to the same partner at the same place ----
    const click = async (sel) => { const p = await centre(`document.querySelector('${sel}')`); await mouse('mouseMoved', p); await sleep(400);
      await mouse('mousePressed', p, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', p, { button: 'left', buttons: 0, clickCount: 1 }); };
    await mouse('mouseMoved', await centre(`document.querySelector('[data-partner-prev]')`)); await sleep(800); // stopped first
    let g0 = await geo();
    await click('[data-partner-prev]'); await sleep(700);
    let g1 = await geo();
    await click('[data-partner-next]'); await click('[data-partner-next]'); await sleep(700);
    const g2 = await geo();
    check(`‹ moves the row one logo right (${wrapDiff(g0.x, g1.x, g0.W).toFixed(1)} px), › one logo left (${wrapDiff(g1.x, g2.x, g0.W).toFixed(1)} px; a logo is ${g0.step} px)`,
      Math.abs(wrapDiff(g0.x, g1.x, g0.W) - g0.step) < 1.5 && Math.abs(wrapDiff(g1.x, g2.x, g0.W) + 2 * g0.step) < 1.5, { g0, g1, g2 });
    // The partner whose logo centre is nearest a point near the row's left edge (copies count: they look the same)
    const atLeft = () => ev(`(() => { const box = document.querySelector('[data-partner-marquee]').getBoundingClientRect(); const x = box.left + 160;
      const dist = (el) => { const r = el.getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - x); };
      const t = [...document.querySelectorAll('.partner-strip.is-marquee > .partner-tile')].sort((a, c) => dist(a) - dist(c))[0];
      return t ? t.querySelector('a').getAttribute('href') : null; })()`);
    g0 = await geo(); const first = await atLeft();
    for (let i = 0; i < 7; i++) { await click('[data-partner-next]'); }
    await sleep(900);
    g1 = await geo(); const again = await atLeft();
    check(`7 × › (one whole list): back to the same partner (${first}) at the same place, the row's shift stays within one list`,
      first && again === first && Math.abs(wrapDiff(g0.x, g1.x, g0.W)) < 1.5 && g1.x <= 0 && g1.x >= -g1.W, { first, again, g0, g1 });
    await mouse('mouseMoved', { x: 5, y: 5 });

    // ---- 5. Tab to a logo: it stops and that logo is fully in view (also the last one) ----
    const inView = (i) => ev(`(() => { const box = document.querySelector('[data-partner-marquee]'); const pad = parseFloat(getComputedStyle(box).paddingLeft); const b = box.getBoundingClientRect();
      const r = ${ORIG}[${i}].getBoundingClientRect(); return { inside: r.left >= b.left + pad - 1 && r.right <= b.right - pad + 1, scroll: box.scrollLeft, mask: getComputedStyle(box).maskImage || getComputedStyle(box).webkitMaskImage }; })()`);
    // Real Tab presses from the › button: the copies before the logos are skipped (tabindex -1)
    await ev(`document.querySelector('[data-partner-next]').focus()`);
    const tab = async () => { await b.key('Tab', 'Tab', 9); await sleep(300); };
    await tab();
    const onFirst = await ev(`document.activeElement === ${ORIG}[0].querySelector('a')`);
    const f0 = await inView(0); const vF = await speedOver(800);
    for (let i = 0; i < 6; i++) await tab();
    const onLast = await ev(`document.activeElement === ${ORIG}[6].querySelector('a')`);
    const f6 = await inView(6);
    check('Tab from › goes to the first real logo, then through the 7 logos once', onFirst && onLast, { onFirst, onLast });
    check(`keyboard focus: the first and the last logo are each shown whole, no faded edge, the row stands still (${vF.toFixed(1)} px/s)`,
      f0.inside && f6.inside && f0.scroll === 0 && f6.scroll === 0 && f0.mask === 'none' && Math.abs(vF) < 0.5, { f0, f6, vF });
    const gF = await geo();
    await ev(`document.activeElement.blur()`); await sleep(100);
    const gB = await geo();
    await sleep(1200);
    const vBlur = await speedOver(1000);
    check('focus leaves: the row carries on from the same place (no jump)', Math.abs(wrapDiff(gF.x, gB.x, gF.W)) < 1.5 && vBlur > 15, { gF, gB, vBlur });

    // ---- 6. Drag: the row follows the mouse; a drag doesn't open a logo, a plain click does ----
    // The logo nearest the middle of the row (real or copy: they look the same; the real one may be off-screen)
    const MIDDLE = `(() => { const box = document.querySelector('[data-partner-marquee]').getBoundingClientRect(); const mid = (box.left + box.right) / 2;
      return [...document.querySelectorAll('.partner-strip.is-marquee > .partner-tile')].map((t) => ({ t, r: t.getBoundingClientRect() }))
        .sort((a, z) => Math.abs((a.r.left + a.r.right) / 2 - mid) - Math.abs((z.r.left + z.r.right) / 2 - mid))[0].t; })()`;
    await mouse('mouseMoved', await centre(MIDDLE)); await sleep(800); // stopped under the mouse first
    const p = await centre(MIDDLE);
    await mouse('mouseMoved', p); await sleep(100);
    const d0 = await geo();
    await mouse('mousePressed', p, { button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 10; i++) { await mouse('mouseMoved', { x: p.x + i * 12, y: p.y }, { buttons: 1 }); await sleep(16); }
    await mouse('mouseReleased', { x: p.x + 120, y: p.y }, { button: 'left', buttons: 0, clickCount: 1 }); await sleep(300);
    const d1 = await geo();
    check(`drag: the row follows the mouse (${wrapDiff(d0.x, d1.x, d0.W).toFixed(1)} px for 120) and no partner page opened`, Math.abs(wrapDiff(d0.x, d1.x, d0.W) - 120) < 4 && await ev('location.pathname') === '/', { d0, d1 });
    await mouse('mouseMoved', await centre(MIDDLE)); await sleep(500);
    const q = await centre(MIDDLE);
    const qHref = await ev(`${MIDDLE}.querySelector('a').getAttribute('href')`);
    const loaded = b.waitLoad();
    await mouse('mousePressed', q, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', q, { button: 'left', buttons: 0, clickCount: 1 });
    await loaded; await sleep(200);
    check(`a plain click on a sliding logo opens its partner page (${qHref})`, SLUGS.some((s) => qHref === `/doi-tac/${s}`) && await ev('location.pathname') === qHref, await ev('location.pathname'));
    // A copy (about half the logos on screen) opens its partner too: ‹ three times brings copies in from the left
    await nav('/', 300); await toRow(); await sleep(400);
    for (let i = 0; i < 3; i++) await click('[data-partner-prev]');
    await sleep(900);
    const copy = await ev(`(() => { const box = document.querySelector('[data-partner-marquee]').getBoundingClientRect(); const mid = (box.left + box.right) / 2;
      const c = [...document.querySelectorAll('.partner-strip.is-marquee > [data-partner-clone]')].map((t) => ({ t, r: t.getBoundingClientRect() }))
        .filter((o) => o.r.left > box.left + 60 && o.r.right < box.right - 60).sort((a, z) => Math.abs((a.r.left + a.r.right) / 2 - mid) - Math.abs((z.r.left + z.r.right) / 2 - mid))[0];
      return c ? { x: (c.r.left + c.r.right) / 2, y: (c.r.top + c.r.bottom) / 2, href: c.t.querySelector('a').getAttribute('href') } : null; })()`);
    if (copy) {
      await mouse('mouseMoved', copy); await sleep(500);
      const pos = await ev(`(() => { const e = document.elementFromPoint(${copy.x}, ${copy.y}); const a = e && e.closest('a'); return a ? a.getAttribute('href') : null; })()`);
      const loadedCopy = b.waitLoad();
      await mouse('mousePressed', copy, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', copy, { button: 'left', buttons: 0, clickCount: 1 });
      await loadedCopy; await sleep(200);
      check(`a click on a copy of a logo opens that partner (${copy.href})`, pos === copy.href && await ev('location.pathname') === copy.href, { copy, pos });
    } else check('a copy of a logo is in view to click', false, 'none found');

    // ---- 7. Less motion: still slides, at half speed ----
    await b.reducedMotion(true);
    await nav('/', 300); await toRow(); await mouse('mouseMoved', { x: 5, y: 5 }); await sleep(900);
    const vSlow = await speedOver(2500);
    await b.reducedMotion(false);
    check(`reduced motion: still slides right, at about half speed (${vSlow.toFixed(1)} px/s)`, vSlow > 8 && vSlow < 16, vSlow);

    // ---- 8. Phone width ----
    await b.viewport(390, 844);
    await nav('/', 300); await toRow(); await sleep(600);
    const phone = await ev(`(() => { const all = [...document.querySelectorAll('.partner-strip.is-marquee > .partner-tile')]; const head = document.querySelector('#doi-tac .domains-head'); const btn = document.querySelector('[data-partner-next]').getBoundingClientRect();
      const title = head.querySelector('.section-title').getBoundingClientRect();
      return { rows: new Set(all.map((t) => Math.round(t.getBoundingClientRect().top))).size, w: Math.round(all[0].getBoundingClientRect().width), wide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sameLine: Math.abs((btn.top + btn.bottom) / 2 - (title.top + title.bottom) / 2) < 14, btnInside: btn.right <= 390 }; })()`);
    check('390px: one line of 150px logos, no sideways scroll, ‹ › on the title line', phone.rows === 1 && phone.w === 150 && phone.wide === 0 && phone.sameLine && phone.btnInside, phone);
    await b.shot('partners-slider-390');
    await b.viewport(1280);

    // ---- 9. Printing: the logos once, in rows, standing still ----
    await nav('/', 300);
    await b.printMedia(true); await sleep(200);
    const printed = await ev(`(() => { const all = [...document.querySelectorAll('.partner-strip.is-marquee > .partner-tile')]; const shown = all.filter((t) => getComputedStyle(t).display !== 'none');
      return { shown: shown.length, rows: new Set(shown.map((t) => Math.round(t.getBoundingClientRect().top))).size, transform: getComputedStyle(document.querySelector('.partner-strip.is-marquee')).transform,
        arrows: getComputedStyle(document.querySelector('[data-partner-arrows]')).display }; })()`);
    await b.printMedia(false);
    check('print: the 7 logos once, in rows, not shifted; no ‹ › buttons', printed.shown === 7 && printed.rows >= 1 && printed.transform === 'none' && printed.arrows === 'none', printed);
  });
});
