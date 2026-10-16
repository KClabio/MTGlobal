// Partners: logo strips link to /doi-tac/<slug>; each partner page (text, logo, website button, contacts, back link);
// admin add / edit / validation / order / delete; tiles at most 6 per row, float + glow on hover.
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
      const strip = html.slice(html.indexOf('class="partner-strip"'), html.indexOf('</section>', html.indexOf('class="partner-strip"')));
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
        const mails = [...html.matchAll(/href="mailto:([^"]+)"/g)].map((m) => m[1]);
        const tels = [...html.matchAll(/href="tel:([^"]+)"/g)].map((m) => m[1]);
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
    const tiles = await ev(`[...document.querySelectorAll('.partner-strip .partner-tile img')].map((i) => { const r = i.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), nat: i.naturalWidth > 0 }; })`);
    check('home strip: 7 logos loaded, each visible inside its tile (>=40px wide, 40–76px tall)', tiles.length === 7 && tiles.every((t) => t.nat && t.w >= 40 && t.h >= 40 && t.h <= 76), tiles);
    await ev(toStrip); await shot('partners-strip-1280-light');
    const l = b.waitLoad(); await ev(`document.querySelector('.partner-strip a[href="/doi-tac/vex-robotics"]').click()`); await l; await sleep(400);
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
    for (const [w, per] of [[1280, 6], [800, 4], [390, 3]]) {
      await b.viewport(w); await nav('/', 200);
      const rows = await ev(`(() => { const tiles = [...document.querySelectorAll('.partner-strip .partner-tile')]; const strip = document.querySelector('.partner-strip').getBoundingClientRect(); const byRow = {};
        tiles.forEach((t) => { const r = t.getBoundingClientRect(); const k = Math.round(r.top); (byRow[k] = byRow[k] || []).push(r); });
        const rs = Object.values(byRow); const last = rs[rs.length - 1]; const mid = (last[0].left + last[last.length - 1].right) / 2;
        return { counts: rs.map((r) => r.length), lastCentred: Math.abs(mid - (strip.left + strip.width / 2)) < 2, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
      const exp = []; for (let n = 7; n > 0; n -= per) exp.push(Math.min(per, n));
      check(`partners at ${w}px: rows of ${JSON.stringify(exp)}, last row centred`, JSON.stringify(rows.counts) === JSON.stringify(exp) && rows.lastCentred && rows.overflow === 0, rows);
    }
    await b.viewport(1280);
    for (const theme of ['light', 'dark']) {
      await b.setCookie('theme', theme); await nav('/', 200);
      await ev(`document.querySelector('.partner-strip').scrollIntoView({ block: 'center' })`); await sleep(200);
      const before = await ev(`(() => { const t = document.querySelector('.partner-strip .partner-tile:nth-child(2)'); return { top: t.getBoundingClientRect().top, shadow: getComputedStyle(t).boxShadow, bg: getComputedStyle(t).backgroundColor }; })()`);
      const p = await ev(`(() => { const r = document.querySelector('.partner-strip .partner-tile:nth-child(2) a').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await mouse('mouseMoved', p); await sleep(500);
      const during = await ev(`(() => { const t = document.querySelector('.partner-strip .partner-tile:nth-child(2)'); return { top: t.getBoundingClientRect().top, shadow: getComputedStyle(t).boxShadow }; })()`);
      await shot(`partner-hover-${theme}`);
      await mouse('mouseMoved', { x: 5, y: 5 }); await sleep(500);
      const after = await ev(`document.querySelector('.partner-strip .partner-tile:nth-child(2)').getBoundingClientRect().top`);
      const glow = /rgba\((21, 101, 192|110, 170, 255)/.test(during.shadow) && (during.shadow.match(/rgba/g) || []).length >= 3;
      check(`partner hover (${theme}): floats up ~6px with a glow around the tile, then settles back; tile stays white`, Math.round(before.top - during.top) === 6 && glow && Math.round(after) === Math.round(before.top) && before.bg === 'rgb(255, 255, 255)', { before, during, after });
    }
  });
});
