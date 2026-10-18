// Admin editors: sidebar mirrors the website menu; Giải pháp page editor (round-trip, uploads, validation, reset, display
// options); Cài đặt chung (banners, home hero, logo) + Thông tin công ty; content forms save plain text.
import { existsSync, unlinkSync } from 'node:fs';
import { suite, part, check, db, BASE, ROOT, appRequire, createUser, removeLater, restoreLater, stamp } from './lib/index.mjs';

const { BANNERS } = appRequire('./lib/banners.js');
const PUB = `${ROOT}public`;
const MARK = `ZZTEST-editor-${stamp}`;
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#34;/g, '"');
const navOf = (html) => {
  const nav = html.slice(html.indexOf('<nav class="admin-nav">'), html.indexOf('</nav>', html.indexOf('<nav class="admin-nav">')));
  const groups = []; let cur = [null, []]; groups.push(cur);
  for (const m of nav.matchAll(/<span class="admin-nav-group">([^<]+)<\/span>|<a href="([^"]+)" class="([^"]*)"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g)) {
    if (m[1]) { cur = [decode(m[1]), []]; groups.push(cur); } else if (m[2] !== '/') cur[1].push({ href: m[2], active: m[3] === 'active', label: decode(m[4]) });
  }
  return groups;
};

await suite(async (b) => {
  const { send, ev, sleep } = b;
  const d = await db();
  const admin = await createUser('editor');
  const cust = await createUser('editor-cust', 'customer');
  const adminGet = (p) => fetch(BASE + p, { headers: { cookie: `connect.sid=${admin.sid}` }, redirect: 'manual' });
  const pub = async (p, lang = 'vi') => (await fetch(BASE + p, { headers: { cookie: `lang=${lang}` } })).text();
  const signIn = async () => { await b.login(admin.sid); await b.setCookie('adminLang', 'vi'); };
  const nav = (p) => b.nav(p, 400);
  const click = (sel) => b.clickAt(sel);
  const setVal = (selector, value) => ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const setFiles = async (selector, files) => { const doc = await send('DOM.getDocument', { depth: -1 }); const n = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector }); await send('DOM.setFileInputFiles', { nodeId: n.nodeId, files }); };
  await send('DOM.enable');
  await restoreLater('solutionpages', {});
  await restoreLater('services', {});
  const settingsBackup = (await restoreLater('sitesettings', {}))[0];
  // Site settings are cached by the server: after putting the document back, one save of "Thông tin công ty" with the
  // original values makes the server read it again (otherwise it would keep showing the test logo/text).
  const restoreSettingsNow = async () => {
    await d.collection('sitesettings').replaceOne({ _id: settingsBackup._id }, settingsBackup);
    const ci = settingsBackup.contactInfo || {};
    await fetch(BASE + '/admin/thong-tin-cong-ty', { method: 'POST', redirect: 'manual', headers: { cookie: `connect.sid=${admin.sid}` },
      body: new URLSearchParams({ companyProfile: settingsBackup.companyProfile || '', companyProfileEn: settingsBackup.companyProfileEn || '', address: ci.address || '', phone: ci.phone || '', email: ci.email || '', mapEmbedUrl: ci.mapEmbedUrl || '' }) });
  };
  removeLater('products', { nameVi: { $regex: '^' + MARK } });
  removeLater('projects', { titleVi: { $regex: '^' + MARK } });
  removeLater('articles', { titleVi: { $regex: '^' + MARK } });

  await part(b, 'sidebar and access', async () => {
    const EXPECTED_NAV = {
      vi: [[null, ['Tổng quan']], ['Robotics thông minh', ['Sản phẩm robot']], ['Giải pháp', ['Tư vấn, thiết kế & triển khai', 'Thiết bị, học liệu, Robot STEM', 'Workshop trải nghiệm STEM', 'Đào tạo STEM', 'Dự án tham khảo', 'Tập huấn & triển khai']], ['Dịch vụ', ['Dịch vụ']], ['Tin tức', ['Tin tức']], ['Về MTG & Liên hệ', ['Thông tin công ty', 'Đối tác đồng hành']], ['Quản lý', ['Yêu cầu tư vấn', 'Người dùng', 'Cài đặt chung']]],
      en: [[null, ['Overview']], ['Smart Robotics', ['Robot products']], ['Solutions', ['Consulting, design & deployment', 'Equipment, materials & STEM robots', 'Hands-on STEM workshops', 'STEM training', 'Reference projects', 'Training & rollout']], ['Services', ['Services']], ['News', ['News']], ['About & Contact', ['Company info', 'Partners']], ['Management', ['Consultation requests', 'Users', 'General settings']]],
    };
    for (const lang of ['vi', 'en']) {
      const groups = navOf(await (await adminGet(`/admin/trang/workshop?alang=${lang}`)).text());
      const shape = groups.map(([g, items]) => [g, items.map((i) => i.label)]);
      check(`[${lang}] sidebar groups & items mirror the website menu, in order`, JSON.stringify(shape) === JSON.stringify(EXPECTED_NAV[lang]), shape);
      const active = groups.flatMap(([, items]) => items).filter((i) => i.active).map((i) => i.href);
      check(`[${lang}] only "Workshop" is highlighted on its editor`, JSON.stringify(active) === '["/admin/trang/workshop"]', active);
    }
    const allLinks = navOf(await (await adminGet('/admin')).text()).flatMap(([, items]) => items.map((i) => i.href));
    const statuses = await Promise.all(allLinks.map(async (h) => [h, (await adminGet(h)).status]));
    check(`all ${allLinks.length} sidebar links open (200)`, statuses.every(([, s]) => s === 200), statuses.filter(([, s]) => s !== 200));
    const equipHtml = await (await adminGet('/admin/thiet-bi')).text();
    check('equipment list heading "Thiết bị, học liệu, Robot STEM", highlighted in the sidebar', /<h1>Thiết bị, học liệu, Robot STEM/.test(equipHtml) && navOf(equipHtml).flatMap(([, i]) => i).find((i) => i.active)?.href === '/admin/thiet-bi');
    check('headings: "Robotics thông minh", "Thông tin công ty", "Cài đặt chung"', /<h1>Robotics thông minh/.test(await (await adminGet('/admin/robot')).text()) && /<h1>Thông tin công ty/.test(await (await adminGet('/admin/thong-tin-cong-ty')).text()) && /<h1>Cài đặt chung/.test(await (await adminGet('/admin/cai-dat')).text()));
    for (const [path, key] of [['/admin/cai-dat', 'Cài đặt chung'], ['/admin/thong-tin-cong-ty', 'Thông tin công ty']]) {
      const g = navOf(await (await adminGet(path)).text());
      const active = g.flatMap(([, i]) => i).filter((i) => i.active).map((i) => i.label);
      check(`${path}: "${key}" highlighted`, JSON.stringify(active) === JSON.stringify([key]), active);
    }
    for (const p of ['/admin/trang/workshop', '/admin/cai-dat', '/admin/thong-tin-cong-ty']) {
      const r = await fetch(BASE + p, { headers: { cookie: `connect.sid=${cust.sid}` }, redirect: 'manual' });
      check(`customer gets 403 on ${p}`, r.status === 403, r.status);
    }
    const custPost = await fetch(BASE + '/admin/cai-dat/khoi-phuc', { method: 'POST', body: new URLSearchParams({ pages: 'workshop' }), headers: { cookie: `connect.sid=${cust.sid}` }, redirect: 'manual' });
    check('customer cannot reset a page (403)', custPost.status === 403, custPost.status);
  });

  await part(b, 'page editor round-trip', async () => {
    const workshopDoc = () => d.collection('solutionpages').findOne({ slug: 'workshop' });
    let nativeDialogs = 0;
    b.on('Page.javascriptDialogOpening', () => { nativeDialogs++; });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await signIn();
    let uploaded = [];
    try {
      await nav('/admin/trang/workshop');
      check('editor has no banner fields (they live in Cài đặt chung)', !(await ev("!!document.querySelector('#subtitleVi')")));
      const before = await ev(`[...document.querySelectorAll('[data-section-list] > [data-section]')].map(s => s.getAttribute('data-kind'))`);
      check('editor lists the 4 workshop sections with the right types', JSON.stringify(before) === '["text","cards","gallery","buttons"]', before);
      check('all sections start closed: one short line each', await ev(`[...document.querySelectorAll('[data-section-list] > [data-section]')].every((s) => !s.classList.contains('is-open') && s.querySelector('.ps-body').hidden)`));
      // Shown for its type = not hidden by data-kinds / data-item-kinds (sections are closed, so not on screen yet)
      const vis = await ev(`(() => { const s = document.querySelectorAll('[data-section-list] > [data-section]');
        const shown = (sec, sel) => { const el = sec.querySelector(sel); return !!el && !el.closest('[data-kinds][hidden], [data-item-kinds][hidden]'); };
        return { cardsMedia: shown(s[1], '[data-media-list]'), cardsItems: shown(s[1], '[data-item-list]'), galleryItems: shown(s[2], '[data-item-list]'), galleryMedia: shown(s[2], '[data-media-list]'), num: s[2].querySelector('[data-row-num]').textContent,
          itemLabel: s[1].querySelector('[data-item] [data-item-label]').textContent,
          buttonsHide: ['[data-field="titleVi"]', '[data-field="subtitleVi"]', '[data-field="textVi"]', '[data-media-list]', '[data-add-item]', '[data-item] [data-remove-item]', '[data-item] [data-move]', '[data-item] .item-drag'].every(sel => !shown(s[3], sel)),
          buttonsLabel: shown(s[3], '[data-item] [data-item-field="titleVi"]') && shown(s[3], '[data-item] [data-item-field="titleEn"]'),
          linkHidden: [...s[3].querySelectorAll('[data-item-field="url"], [data-item-field="primary"]')].every((i) => i.type === 'hidden'),
          textNoButtons: !shown(s[0], '[data-item-list]'),
          noSettings: !document.querySelector('.ps-options, [data-lang-switch], [data-section] select') }; })()`);
      check('fields follow the section type (cards: items, no media; gallery: media, no items); rows numbered', !vis.cardsMedia && vis.cardsItems && !vis.galleryItems && vis.galleryMedia && vis.num === '3' && vis.itemLabel === 'Thẻ', vis);
      check('buttons: only their wording (VI + EN) can be changed: no link, no "main button", no add / move / delete', vis.buttonsHide && vis.buttonsLabel && vis.linkHidden, vis);
      check('a text section has no button area; no "Tuỳ chọn hiển thị", no language switch, no dropdowns', vis.textNoButtons && vis.noSettings, vis);
      await setVal('[data-section-list] > [data-section]:nth-child(2) [data-item] [data-item-field="titleVi"]', 'Lắp ráp & chế tạo ZZ');
      // Add a steps section with two steps, through the type picker
      await click('[data-add-section]');
      await sleep(300);
      check('"Thêm mục mới" opens the type picker with 5 types (no "Nút bấm")', await ev(`!document.querySelector('[data-type-picker]').hidden && document.querySelectorAll('[data-type-picker] [data-add-kind]').length === 5 && !document.querySelector('[data-add-kind="buttons"]')`));
      await click('[data-type-picker] [data-add-kind="steps"]');
      await sleep(300);
      const added = await ev(`(() => { const s = document.querySelector('[data-section-list] > [data-section]:last-child'); return { kind: s.getAttribute('data-kind'), open: s.classList.contains('is-open'), others: document.querySelectorAll('[data-section].is-open').length, picker: document.querySelector('[data-type-picker]').hidden, focus: document.activeElement && document.activeElement.getAttribute('data-field') }; })()`);
      check('picked "Các bước": new section added open (the only open one), picker closed, title box focused', added.kind === 'steps' && added.open && added.others === 1 && added.picker && added.focus === 'titleVi', added);
      await setVal('[data-section-list] > [data-section]:last-child [data-field="titleVi"]', 'ZZ Quy trình workshop');
      await setVal('[data-section-list] > [data-section]:last-child [data-field="titleEn"]', 'ZZ Workshop flow');
      for (const [vi, en] of [['ZZ Bước một', 'ZZ Step one'], ['ZZ Bước hai', 'ZZ Step two']]) {
        await click('[data-section-list] > [data-section]:last-child [data-add-item]');
        await sleep(150);
        await setVal('[data-section-list] > [data-section]:last-child [data-item]:last-child [data-item-field="titleVi"]', vi);
        await setVal('[data-section-list] > [data-section]:last-child [data-item]:last-child [data-item-field="titleEn"]', en);
      }
      const stepLabels = await ev(`[...document.querySelectorAll('[data-section-list] > [data-section]:last-child [data-item] [data-item-label]')].map(l => l.textContent + ' ' + l.nextElementSibling.textContent)`);
      check('new section: type "Các bước", items labelled "Bước 1/2"', JSON.stringify(stepLabels) === '["Bước 1","Bước 2"]', stepLabels);
      // Move the new section to the top (same DOM move the drag performs)
      await ev(`(() => { const l = document.querySelector('[data-section-list]'); l.insertBefore(l.lastElementChild, l.firstElementChild); return true; })()`);
      await sleep(150);
      const side = await ev(`(() => { const s = document.querySelector('[data-section-list] > [data-section]:first-child'); const r = (sel) => s.querySelector(sel).getBoundingClientRect();
        const vi = r('[data-field="titleVi"]'), en = r('[data-field="titleEn"]'), ivi = r('[data-item].is-open [data-item-field="titleVi"]'), ien = r('[data-item].is-open [data-item-field="titleEn"]');
        return { section: Math.abs(vi.top - en.top) < 2 && vi.right < en.left, item: Math.abs(ivi.top - ien.top) < 2 && ivi.right < ien.left, cont: s.querySelector('[data-field="continued"]').value }; })()`);
      check('Vietnamese box on the left, English on the right (section and step); a new section is not joined to the one above', side.section && side.item && side.cont === '0', side);
      // Gallery: open it (the steps section closes), then a real drag of the 2nd photo tile onto the 1st
      const gallerySel = '[data-section-list] > [data-section][data-kind="gallery"]';
      await click(`${gallerySel} .ps-summary`); await sleep(300);
      check('opening the gallery closes the other section', await ev(`document.querySelectorAll('[data-section].is-open').length === 1 && document.querySelector('${gallerySel}').classList.contains('is-open')`));
      const mediaBefore = await ev(`[...document.querySelectorAll('${gallerySel} [data-media] [data-media-field="src"]')].map(i => i.value)`);
      const pts = await ev(`(() => { const m = document.querySelectorAll('${gallerySel} [data-media]'); m[1].scrollIntoView({ block: 'center' }); const h = m[1].querySelector('.media-drag').getBoundingClientRect(); const t = m[0].getBoundingClientRect(); return { x: h.left + h.width / 2, y: h.top + h.height / 2, tx: h.left + h.width / 2, ty: t.top + t.height * 0.3 }; })()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts.x, y: pts.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts.x, y: pts.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 10; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts.x + ((pts.tx - pts.x) * i) / 10, y: pts.y + ((pts.ty - pts.y) * i) / 10, button: 'left', buttons: 1 }); await sleep(30); }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts.tx, y: pts.ty, button: 'left', buttons: 0, clickCount: 1 });
      await sleep(300);
      const mediaAfterDrag = await ev(`[...document.querySelectorAll('${gallerySel} [data-media] [data-media-field="src"]')].map(i => i.value)`);
      check('dragging a photo reorders the gallery', mediaAfterDrag[0] === mediaBefore[1] && mediaAfterDrag[1] === mediaBefore[0], { mediaBefore, mediaAfterDrag });
      // Remove one shipped photo (/assets file must survive), upload a new image + video
      const removedSrc = '/assets/giai-phap/workshop/hoc-sinh-lap-rap-2.jpg';
      await click(`${gallerySel} [data-media]:has([value="${removedSrc}"]) [data-remove-media]`);
      await setFiles(`${gallerySel} [data-media-input]`, [`${PUB}/assets/giai-phap/workshop/hoc-sinh-lap-trinh.jpg`, `${PUB}/assets/giai-phap/workshop/vex-iq-thi-dau.mp4`]);
      await sleep(200);
      const pendingText = await ev(`document.querySelector('${gallerySel} [data-media-pending]').hidden ? '' : document.querySelector('${gallerySel} [data-media-pending-list]').textContent`);
      check('picked files are listed before saving', pendingText.includes('hoc-sinh-lap-trinh.jpg') && pendingText.includes('vex-iq-thi-dau.mp4'), pendingText);
      let l = b.waitLoad(); await click('.page-form-actions button[type="submit"]'); await l; await sleep(500);
      const toast = await ev(`(() => { const t = document.getElementById('adminToast'); return { shown: !t.hidden, error: t.classList.contains('is-error'), text: t.querySelector('.toast-text').textContent, path: location.pathname }; })()`);
      check('save → green "updated" notification, back on the editor', toast.shown && !toast.error && /lưu thay đổi|cập nhật/i.test(toast.text) && toast.path === '/admin/trang/workshop', toast);
      let docNow = await workshopDoc();
      const gal = docNow.sections.find((s) => s.kind === 'gallery');
      uploaded = gal.media.filter((m) => m.src.startsWith('/uploads/')).map((m) => m.src);
      check('saved: edited card, new steps section first, section order', docNow.sections[0].kind === 'steps' && docNow.sections[0].items.map((i) => i.titleVi).join() === 'ZZ Bước một,ZZ Bước hai'
        && docNow.sections.map((s) => s.kind).join() === 'steps,text,cards,gallery,buttons'
        && docNow.sections[2].items[0].titleVi === 'Lắp ráp & chế tạo ZZ', docNow.sections.map((s) => s.kind));
      check('saved gallery: dragged order, removed photo gone, 1 new image + 1 new video appended', gal.media[0].src === mediaBefore[1] && !gal.media.some((m) => m.src === removedSrc)
        && uploaded.length === 2 && gal.media.slice(-2).map((m) => m.type).join() === 'image,video' && /^\/uploads\/videos\//.test(gal.media.at(-1).src), gal.media.map((m) => m.src));
      check('removed shipped /assets photo still exists on disk', existsSync(PUB + removedSrc));
      check('new uploads exist on disk', uploaded.every((u) => existsSync(PUB + u)), uploaded);
      // Caption the new files after saving
      await setVal(`${gallerySel} [data-media]:has([value="${uploaded[0]}"]) [data-media-field="captionVi"]`, 'ZZ Ảnh mới');
      await setVal(`${gallerySel} [data-media]:has([value="${uploaded[0]}"]) [data-media-field="captionEn"]`, 'ZZ New photo');
      await setVal(`${gallerySel} [data-media]:has([value="${uploaded[1]}"]) [data-media-field="captionVi"]`, 'ZZ Video mới');
      l = b.waitLoad(); await click('.page-form-actions button[type="submit"]'); await l; await sleep(400);
      docNow = await workshopDoc();
      const galNow = docNow.sections.find((s) => s.kind === 'gallery');
      check('captions for the new files saved', galNow.media.find((m) => m.src === uploaded[0])?.captionEn === 'ZZ New photo' && galNow.media.find((m) => m.src === uploaded[1])?.captionVi === 'ZZ Video mới');
      // Public page reflects everything, both languages
      for (const lang of ['vi', 'en']) {
        const html = await pub('/giai-phap/workshop', lang);
        const body = decode(html.slice(html.indexOf('</header>')));
        const exp = lang === 'vi' ? ['ZZ Quy trình workshop', 'ZZ Bước hai', 'Lắp ráp & chế tạo ZZ', 'ZZ Ảnh mới'] : ['ZZ Workshop flow', 'ZZ Step two', 'ZZ New photo'];
        const order = body.indexOf(lang === 'vi' ? 'ZZ Quy trình workshop' : 'ZZ Workshop flow') < body.indexOf(lang === 'vi' ? 'Trải nghiệm STEM là một' : 'STEM experiences are one');
        check(`[${lang}] public workshop page shows the edits, new section first, removed photo gone, new files linked`, exp.every((s) => body.includes(s)) && order && !body.includes(removedSrc) && uploaded.every((u) => body.includes(u)), exp.filter((s) => !body.includes(s)));
      }
      await nav('/giai-phap/workshop');
      const loaded = await ev(`(async () => { document.querySelectorAll('img[loading="lazy"]').forEach(i => i.loading = 'eager'); const imgs = [...document.images]; await Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 6000); })));
        const vids = [...document.querySelectorAll('video')]; const ok = await Promise.all(vids.map(v => v.readyState >= 1 ? true : new Promise(r => { v.onloadedmetadata = () => r(true); v.onerror = () => r(false); v.load(); setTimeout(() => r(false), 8000); })));
        return { broken: imgs.filter(i => !i.naturalWidth).map(i => i.src), vids: vids.length, badVids: ok.filter(x => !x).length }; })()`);
      check('public page: every image decodes and both videos (incl. the uploaded one) load', loaded.broken.length === 0 && loaded.vids === 2 && loaded.badVids === 0, loaded);
      // Validation
      await nav('/admin/trang/workshop');
      await click('[data-add-section]'); await sleep(200); await click('[data-add-kind="cards"]'); await sleep(200);
      await click('[data-add-section]'); await sleep(200); await click('[data-add-kind="steps"]'); await sleep(200);
      await setVal('[data-section-list] > [data-section]:last-child [data-field="titleVi"]', 'ZZ Các bước');
      await click('[data-section-list] > [data-section]:last-child [data-add-item]'); await sleep(100);
      await setVal('[data-section-list] > [data-section]:last-child [data-item] [data-item-field="textVi"]', 'ZZ Bước không có tiêu đề');
      const savedBefore = JSON.stringify(await workshopDoc());
      l = b.waitLoad(); await click('.page-form-actions button[type="submit"]'); await l; await sleep(400);
      const err = await ev(`(() => ({ alert: (document.querySelector('.form-alert.error') || {}).textContent || '', toastErr: document.getElementById('adminToast').classList.contains('is-error'), sections: document.querySelectorAll('[data-section-list] > [data-section]').length, typed: document.querySelector('[data-section-list] > [data-section]:last-child [data-item] [data-item-field="textVi"]').value }))()`);
      check('invalid save: red error lists the empty section and the step without a title', err.toastErr && /Mục 6: chưa có tiêu đề/.test(err.alert) && /Mục 7, dòng 1: vui lòng nhập tiêu đề/.test(err.alert), err);
      check('invalid save keeps what was typed (7 sections, the step text) and saves nothing', err.sections === 7 && err.typed === 'ZZ Bước không có tiêu đề' && JSON.stringify(await workshopDoc()) === savedBefore, { sections: err.sections });
      const marked = await ev(`[...document.querySelectorAll('[data-section-list] > [data-section]')].map((s, i) => (i + 1) + (s.classList.contains('has-error') ? '!' : '') + (s.classList.contains('is-open') ? 'o' : ''))`);
      check('the sections named in the errors are marked, and the first of them is open', marked[5] === '6!o' && marked[6] === '7!' && marked.slice(0, 5).every((x) => /^\d$/.test(x)), marked);
      const badStep = await ev(`(() => { const it = document.querySelector('[data-section-list] > [data-section]:nth-child(7) [data-item]'); return { err: it.classList.contains('has-error'), open: it.classList.contains('is-open') && !it.querySelector('.pi-body').hidden }; })()`);
      check('"Mục 7, dòng 1": that step is marked and already open inside its section', badStep.err && badStep.open, badStep);
      // Reset to defaults: no longer in the page editor, but in Cài đặt chung → Khôi phục mặc định, through the confirm dialog
      await nav('/admin/trang/workshop');
      check('the page editor has no "Khôi phục nội dung mặc định" button any more', await ev(`!document.querySelector('form[action*="mac-dinh"]') && !/Khôi phục nội dung mặc định/.test(document.querySelector('.admin-main, main, body').textContent)`));
      const otherBefore = (await d.collection('solutionpages').findOne({ slug: 'dao-tao' })).updatedAt;
      await nav('/admin/cai-dat?tab=reset');
      const resetTab = () => ev(`(() => { const btn = document.querySelector('[data-reset-submit]'); return { open: !document.getElementById('panel-reset').hidden, saveBar: !document.querySelector('[data-save-bar]').hidden && getComputedStyle(document.querySelector('[data-save-bar]')).display !== 'none',
        rows: [...document.querySelectorAll('[data-reset-page]')].map((x) => x.value), disabled: btn.disabled, picked: document.querySelector('[data-reset-picked]').textContent }; })()`);
      let rt = await resetTab();
      check('Cài đặt chung → "Khôi phục mặc định" tab: one box per Giải pháp page, button off until a page is ticked, no "Lưu cài đặt" bar',
        rt.open && !rt.saveBar && JSON.stringify(rt.rows) === JSON.stringify(['stem-lab', 'workshop', 'dao-tao', 'tap-huan']) && rt.disabled && rt.picked === '', rt);
      await click('[data-reset-page][value="workshop"]'); await sleep(100);
      rt = await resetTab();
      check('ticking "Workshop trải nghiệm STEM" turns the button on ("Đã chọn 1 trang")', !rt.disabled && rt.picked === 'Đã chọn 1 trang', rt);
      await b.shot('settings-reset-tab');
      await click('[data-reset-submit]'); await sleep(450);
      const dlg = await ev(`(() => { const o = document.getElementById('confirmDialog'); return { open: !o.hidden, title: o.querySelector('.confirm-title').textContent, text: o.querySelector('.confirm-text').textContent }; })()`);
      check('reset asks first in the custom dialog, naming the page', dlg.open && dlg.title === 'Khôi phục nội dung mặc định' && /“Workshop trải nghiệm STEM”/.test(dlg.text), dlg);
      l = b.waitLoad(); await click('#confirmDialog .confirm-ok'); await l; await sleep(400);
      docNow = await workshopDoc();
      check('reset: default content back (4 sections), green toast naming the page, back on the same tab', docNow.sections.map((s) => s.kind).join() === 'text,cards,gallery,buttons'
        && await ev(`!document.getElementById('adminToast').classList.contains('is-error') && /khôi phục/i.test(document.getElementById('adminToast').textContent) && /Workshop/.test(document.getElementById('adminToast').textContent) && !document.getElementById('panel-reset').hidden`));
      check('reset: the pages that were not ticked are untouched', String((await d.collection('solutionpages').findOne({ slug: 'dao-tao' })).updatedAt) === String(otherBefore));
      const none = await fetch(BASE + '/admin/cai-dat/khoi-phuc', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ pages: 'not-a-page' }), headers: { cookie: `connect.sid=${admin.sid}` } });
      check('nothing (or an unknown page) ticked: nothing reset, back to the tab', none.status === 302 && none.headers.get('location') === '/admin/cai-dat?tab=reset');
      await adminGet('/admin/cai-dat?tab=reset'); // shows (and clears) its red notice
      check('reset deleted the uploaded test files, kept shipped assets', uploaded.every((u) => !existsSync(PUB + u)) && existsSync(PUB + removedSrc), uploaded.filter((u) => existsSync(PUB + u)));
      await nav('/admin/du-an');
      await click('form[data-confirm] button[type="submit"]'); await sleep(400);
      check('delete dialogs keep their own heading', (await ev(`document.querySelector('#confirmDialog .confirm-title').textContent`)) === 'Xác nhận xoá');
      await b.key('Escape', 'Escape', 27);
      await b.viewport(390, 844);
      await nav('/admin/trang/tap-huan');
      const mob = await ev(`({ groupsShown: [...document.querySelectorAll('.admin-nav-group')].some(g => g.offsetParent), overflow: document.documentElement.scrollWidth - innerWidth })`);
      check('390px: group headings hidden in the compact strip, no page overflow', !mob.groupsShown && mob.overflow <= 1, mob);
      check('no native browser dialogs', nativeDialogs === 0, nativeDialogs);
    } finally {
      uploaded.forEach((u) => { try { unlinkSync(PUB + u); } catch {} });
    }
  });

  await part(b, 'page editor: outline, VI | EN side by side, undo, ▲▼, unsaved changes', async () => {
    const workshop = () => d.collection('solutionpages').findOne({ slug: 'workshop' });
    const S = (n) => `[data-section-list] > [data-section]:nth-child(${n})`;
    const kinds = () => ev(`[...document.querySelectorAll('[data-section-list] > [data-section]')].map((s) => s.getAttribute('data-kind')).join()`);
    const toastNow = () => ev(`(() => { const t = document.getElementById('adminToast'); const a = t.querySelector('.toast-action'); return { shown: !t.hidden, text: t.querySelector('.toast-text').textContent, action: a.hidden ? '' : a.textContent }; })()`);
    try {
      await signIn();
      await b.reducedMotion();
      await nav('/admin/trang/workshop');
      const sum = await ev(`[...document.querySelectorAll('[data-section-list] > [data-section]')].map((s) => s.querySelector('[data-kind-label]').textContent + '|' + s.querySelector('[data-summary-title]').textContent + '|' + s.querySelector('[data-summary-meta]').textContent)`);
      check('closed sections show their type, title (or the start of the text) and what they hold', sum[0].startsWith('Đoạn văn|Trải nghiệm STEM là một') && /^Thẻ thông tin\|.+\|3 thẻ$/.test(sum[1]) && sum[2] === 'Ảnh & video|Hình ảnh workshop|4 ảnh/video' && /^Nút bấm\|.+\|2 nút$/.test(sum[3]), sum);
      check('nothing changed yet: no "unsaved" marker, leaving is not held up', await ev(`(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return document.querySelector('[data-unsaved]').hidden && !e.defaultPrevented; })()`));
      await click(`${S(2)} .ps-summary`);
      check('reduced motion: the section opens straight away', await ev(`document.querySelector('${S(2)}').classList.contains('is-open')`));
      // Cards fold inside the section: one line each, one open at a time
      const itemState = (n) => ev(`[...document.querySelectorAll('${S(n)} [data-item]')].map((it) => (it.classList.contains('is-open') && !it.querySelector('.pi-body').hidden ? 'o:' : '-:') + it.querySelector('[data-item-summary]').textContent)`);
      let cardsNow = await itemState(2);
      check('cards start closed, each line shows its title', cardsNow.length === 3 && cardsNow.every((x) => x.startsWith('-:') && x.length > 3), cardsNow);
      await click(`${S(2)} [data-item]:nth-child(1) .pi-summary`);
      await click(`${S(2)} [data-item]:nth-child(2) [data-item-toggle].pi-edit`);
      cardsNow = await itemState(2);
      check('opening card 2 closes card 1 (one open at a time)', cardsNow.map((x) => x[0]).join('') === '-o-', cardsNow);
      await click(`${S(2)} [data-item]:nth-child(1) .pi-summary`);
      const both = await ev(`(() => { const s = document.querySelector('${S(2)}'); const on = (sel) => !!s.querySelector(sel).offsetParent; return ['[data-field="titleVi"]', '[data-field="titleEn"]', '[data-item] [data-item-field="titleVi"]', '[data-item] [data-item-field="titleEn"]', '[data-item] [data-item-field="textVi"]', '[data-item] [data-item-field="textEn"]'].every(on); })()`);
      check('Vietnamese and English boxes both show (section and open card)', both);
      await setVal(`${S(2)} [data-item] [data-item-field="titleEn"]`, '');
      let en = await ev(`({ ph: document.querySelector('${S(2)} [data-item] [data-item-field="titleEn"]').placeholder, vi: document.querySelector('${S(2)} [data-item] [data-item-field="titleVi"]').value, flag: !document.querySelector('${S(2)} [data-flag-en]').hidden, unsaved: !document.querySelector('[data-unsaved]').hidden })`);
      check('an empty English box shows the Vietnamese text as a hint; the section is flagged EN; "unsaved" shows', en.ph === en.vi && en.vi && en.flag && en.unsaved, en);
      check('with unsaved changes, leaving the page asks first', await ev(`(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()`));
      check('… and the card line has its own EN mark', await ev(`!document.querySelector('${S(2)} [data-item]:nth-child(1) [data-item-flag-en]').hidden && document.querySelector('${S(2)} [data-item]:nth-child(2) [data-item-flag-en]').hidden`));
      await click(`${S(2)} [data-item] [data-item-field="titleEn"]`); await b.type('ZZ Build');
      en = await ev(`({ flag: !document.querySelector('${S(2)} [data-flag-en]').hidden, item: !document.querySelector('${S(2)} [data-item] [data-item-flag-en]').hidden, line: document.querySelector('${S(2)} [data-item] [data-item-summary]').textContent, vi: document.querySelector('${S(2)} [data-item] [data-item-field="titleVi"]').value })`);
      check('filling it in clears the flags; the card line keeps showing the Vietnamese title', !en.flag && !en.item && en.line === en.vi, en);
      // A closed section still shows its EN mark
      const btnEn = await ev(`document.querySelector('${S(4)} [data-item] [data-item-field="titleEn"]').value`);
      await setVal(`${S(4)} [data-item] [data-item-field="titleEn"]`, '');
      check('a closed section still shows the EN mark', await ev(`!document.querySelector('${S(4)}').classList.contains('is-open') && !document.querySelector('${S(4)} [data-flag-en]').hidden`));
      await setVal(`${S(4)} [data-item] [data-item-field="titleEn"]`, btnEn);
      // Button lines show only the wording (the link is the developer's)
      const btnLine = await ev(`document.querySelector('${S(4)} [data-item] [data-item-summary]').textContent`);
      check('button lines show only the wording, not the link', btnLine && !btnLine.includes('→') && !btnLine.includes('/'), btnLine);
      // "+ Thêm thẻ": the new card opens (the others close) with its box focused
      await click(`${S(2)} [data-add-item]`); await sleep(100);
      const added = await ev(`(() => { const its = [...document.querySelectorAll('${S(2)} [data-item]')]; const last = its.at(-1); return { n: its.length, open: its.map((it) => it.classList.contains('is-open') ? 'o' : '-').join(''), focus: document.activeElement === last.querySelector('[data-item-field="titleVi"]'), line: last.querySelector('[data-item-summary]').textContent }; })()`);
      check('"+ Thêm thẻ" adds an open, focused card; the others close; empty line says so', added.n === 4 && added.open === '---o' && added.focus && added.line === '(chưa có nội dung)', added);
      await click(`${S(2)} [data-item]:nth-child(4) [data-remove-item]`); await sleep(150);
      // Undo a deleted section
      const galleryName = await ev(`document.querySelector('${S(3)} [data-summary-title]').textContent`);
      await click(`${S(3)} [data-remove-section]`); await sleep(200);
      let t = await toastNow();
      check('deleting a section: it goes, and the notification names it as shown, with "Hoàn tác"', (await kinds()) === 'text,cards,buttons' && t.shown && galleryName && t.text.includes(galleryName) && t.action === 'Hoàn tác', { t, galleryName });
      await click('#adminToast .toast-action'); await sleep(200);
      check('"Hoàn tác" puts it back in its place', (await kinds()) === 'text,cards,gallery,buttons');
      // ▲ / ▼ for sections and items
      await click(`${S(1)} .ps-tools [data-move="down"]`);
      const moved = await ev(`(() => { const s = [...document.querySelectorAll('[data-section-list] > [data-section]')]; return { kinds: s.map((x) => x.getAttribute('data-kind')).join(), nums: s.map((x) => x.querySelector('[data-row-num]').textContent).join(), upFirst: s[0].querySelector('.ps-tools [data-move="up"]').disabled, downLast: s[3].querySelector('.ps-tools [data-move="down"]').disabled }; })()`);
      check('▼ moves a section down; numbers follow; ▲ off on the first, ▼ off on the last', moved.kinds === 'cards,text,gallery,buttons' && moved.nums === '1,2,3,4' && moved.upFirst && moved.downLast, moved);
      const items = () => ev(`[...document.querySelectorAll('${S(1)} [data-item] [data-item-field="titleVi"]')].map((i) => i.value)`);
      const itemsBefore = await items();
      await click(`${S(1)} [data-item]:nth-child(2) [data-move="up"]`);
      const itemsAfter = await items();
      check('▲ on a card swaps it with the one above', itemsAfter[0] === itemsBefore[1] && itemsAfter[1] === itemsBefore[0], { itemsBefore, itemsAfter });
      await click(`${S(1)} [data-item]:nth-child(3) [data-remove-item]`); await sleep(150);
      t = await toastNow();
      check('deleting a card: gone, with "Hoàn tác"', (await items()).length === 2 && t.action === 'Hoàn tác', t);
      await click('#adminToast .toast-action'); await sleep(150);
      check('… and undo brings it back last', JSON.stringify(await items()) === JSON.stringify(itemsAfter));
      // Phone width: an open section fits, VI above EN
      await b.viewport(390, 844); await sleep(200);
      await click(`${S(1)} [data-item]:nth-child(1) .pi-summary`); await sleep(100);
      const phone = await ev(`(() => { const it = document.querySelector('${S(1)} [data-item]:nth-child(1)'); const vi = it.querySelector('[data-item-field="titleVi"]').getBoundingClientRect(), en = it.querySelector('[data-item-field="titleEn"]').getBoundingClientRect(); return { stacked: en.top > vi.bottom, overflow: document.documentElement.scrollWidth - innerWidth }; })()`);
      check('390px: an open section with an open card fits the screen; English goes under Vietnamese', phone.stacked && phone.overflow <= 1, phone);
      await b.viewport(1280, 900);
      // Delete the gallery for real, then save: what was done in English is kept with the Vietnamese
      await click(`${S(3)} [data-remove-section]`); await sleep(150);
      { const l = b.waitLoad(); await click('.page-form-actions button[type="submit"]'); await l; await sleep(400); }
      const doc = await workshop();
      const cards = doc.sections[0];
      check('saved: new order, gallery gone, swapped cards, English edit next to the Vietnamese', doc.sections.map((s) => s.kind).join() === 'cards,text,buttons' && cards.items.map((i) => i.titleVi).join('|') === itemsAfter.join('|')
        && cards.items.find((i) => i.titleEn === 'ZZ Build')?.titleVi === itemsBefore[0], doc.sections.map((s) => s.kind));
      const btns = doc.sections[2].items;
      check('saved: the buttons keep their links and main button (set by the developer)', btns.length === 2 && btns.every((x) => /^\//.test(x.url)) && btns.some((x) => x.primary), btns);
    } finally {
      await b.reducedMotion(false);
      await fetch(BASE + '/admin/cai-dat/khoi-phuc', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ pages: 'workshop' }), headers: { cookie: `connect.sid=${admin.sid}` } });
    }
  });

  await part(b, 'section display options (STEM Lab editor)', async () => {
    const before = await d.collection('solutionpages').findOne({ slug: 'stem-lab' });
    try {
      await signIn();
      await nav('/admin/trang/stem-lab');
      const ed = await ev(`[...document.querySelectorAll('[data-section-list] > [data-section]')].map((s) => s.querySelector('[data-field="kind"]').value + ':' + s.querySelector('[data-field="display"]').value)`);
      // Compared with the page as it is now (the owner may have edited it), not with the original order
      const want = before.sections.map((s) => s.kind + ':' + (s.display || ''));
      check('editor carries each section\'s type and display setting', JSON.stringify(ed) === JSON.stringify(want) && ed.some((x) => /:(collapsed|compact|tabs)$/.test(x)), { ed, want });
      check('display settings are kept as hidden values, not shown to the admin', await ev(`[...document.querySelectorAll('[data-section-list] [data-field="kind"], [data-section-list] [data-field="display"], [data-section-list] [data-field="columns"], [data-section-list] [data-field="ratio"], [data-section-list] [data-field^="nav"], [data-section-list] [data-field="continued"]')].every((i) => i.type === 'hidden')`));
      // Photos: one row each (number, preview, VI | EN captions side by side), a count in the header, no "Hiện trọn ảnh" box
      const tabsSel = '[data-section-list] > [data-section][data-kind="gallery"]:has([data-field="display"][value="tabs"])';
      await click(`${tabsSel} .ps-summary`); await sleep(300);
      const media = await ev(`(() => { const s = document.querySelector('${tabsSel}'); const rows = [...s.querySelectorAll('[data-media]')];
        const vi = rows[0].querySelector('[data-media-field="captionVi"]').getBoundingClientRect(), en = rows[0].querySelector('[data-media-field="captionEn"]').getBoundingClientRect(), th = rows[0].querySelector('.page-media-thumb').getBoundingClientRect();
        return { n: rows.length, nums: rows.map((r) => r.querySelector('[data-media-num]').textContent).join(), count: s.querySelector('[data-media-count]').textContent, title: getComputedStyle(s.querySelector('[data-media-title]')).fontSize,
          side: Math.abs(vi.top - en.top) < 2 && vi.right < en.left && th.right < vi.left, thumb: Math.round(th.width), wholeCaption: rows.every((r) => { const c = r.querySelector('[data-media-field="captionVi"]'); return c.scrollHeight <= c.clientHeight + 2; }),
          checkbox: s.querySelectorAll('[data-media] input[type="checkbox"]').length, contain: rows.map((r) => r.querySelector('[data-media-field="contain"]')).every((h) => h && h.type === 'hidden') }; })()`);
      check('photos: one row each, numbered, captions VI | EN side by side next to a large preview, whole caption visible', media.n > 1 && media.nums === Array.from({ length: media.n }, (_, i) => i + 1).join() && media.side && media.thumb >= 170 && media.wholeCaption, media);
      check(`photos: header says "${media.count}" with a larger title (${media.title})`, media.count === `${media.n} ảnh` && parseFloat(media.title) >= 16, media);
      check('photos: no "Hiện trọn ảnh" box; that setting travels as a hidden value', media.checkbox === 0 && media.contain, media);
      await click(`${tabsSel} [data-media]:first-child [data-media-field="captionVi"]`);
      await b.key('End', 'End', 35); await b.key('Enter', 'Enter', 13);
      check('a caption stays one line (Enter adds nothing)', !(await ev(`document.querySelector('${tabsSel} [data-media] [data-media-field="captionVi"]').value.includes('\\n')`)));
      await b.shot('editor-media-rows');
      { const l = b.waitLoad(); await ev(`document.querySelector('[data-page-form]').requestSubmit()`); await l; await sleep(300); }
      const stored = await d.collection('solutionpages').findOne({ slug: 'stem-lab' });
      const pick = (doc) => doc.sections.map((s) => [s.display, s.columns, s.ratio, s.continued, s.navVi, s.navEn].map(String).join('/'));
      check('saving the page keeps the display options (style, columns, picture shape, joined)', JSON.stringify(pick(stored)) === JSON.stringify(pick(before)), { now: pick(stored), before: pick(before) });
      check('saving the page keeps the short menu names', stored.sections.some((s) => s.navVi) && JSON.stringify(stored.sections.map((s) => s.navVi + '|' + s.navEn)) === JSON.stringify(before.sections.map((s) => s.navVi + '|' + s.navEn)));
      check('saving without changes stores exactly the same page (every section, item, photo, both languages)', JSON.stringify(stored.sections) === JSON.stringify(before.sections));
      const bogus = await fetch(BASE + '/admin/trang/stem-lab', { method: 'POST', redirect: 'manual', headers: { cookie: `connect.sid=${admin.sid}` },
        body: new URLSearchParams({ 'sections[0][uid]': 'zzbogus1', 'sections[0][kind]': 'text', 'sections[0][titleVi]': 'x', 'sections[0][display]': 'constructor' }) });
      const afterBogus = await d.collection('solutionpages').findOne({ slug: 'stem-lab' });
      check('a made-up display value is ignored (no crash)', bogus.status === 302 && afterBogus.sections.length === 1 && afterBogus.sections[0].display === '', { status: bogus.status, d: afterBogus.sections[0] && afterBogus.sections[0].display });
    } finally {
      await d.collection('solutionpages').replaceOne({ _id: before._id }, before); // put the real page back straight away
    }
  });

  await part(b, 'developer link under numbers (Tập huấn editor)', async () => {
    const before = await d.collection('solutionpages').findOne({ slug: 'tap-huan' });
    try {
      await signIn();
      await nav('/admin/trang/tap-huan');
      const vexSel = '[data-section-list] > [data-section][data-kind="stats"]';
      const ed = await ev(`(() => { const s = [...document.querySelectorAll('${vexSel}')].find((x) => /VEX/.test(x.querySelector('[data-field="titleVi"]').value)); const items = [...s.querySelectorAll('[data-item]')];
        return { all: items.length, hidden: items.filter((it) => it.hidden && it.hasAttribute('data-link-item')).length, meta: s.querySelector('[data-summary-meta]').textContent, note: (s.querySelector('.page-link-note') || {}).textContent || '' }; })()`);
      check('the VEX numbers: the "Khám phá VEX Robotics" button is kept but hidden; the line counts only the 4 numbers; a note names the link',
        ed.all === 5 && ed.hidden === 1 && /^4 /.test(ed.meta) && /Khám phá VEX Robotics/.test(ed.note) && /vexrobotics\.com/.test(ed.note), ed);
      { const l = b.waitLoad(); await ev(`document.querySelector('[data-page-form]').requestSubmit()`); await l; await sleep(300); }
      const stored = await d.collection('solutionpages').findOne({ slug: 'tap-huan' });
      // (Compared item by item: an older saved page also gains empty fields added since, which is harmless)
      const items = (doc) => JSON.stringify(doc.sections.map((x) => x.items || []));
      const vexItems = (doc) => doc.sections.find((x) => x.kind === 'stats' && /VEX/.test(x.titleVi)).items;
      check('saving keeps the link button exactly (label, address, main button) and every other item', items(stored) === items(before) && vexItems(stored).at(-1).url === 'https://www.vexrobotics.com/' && vexItems(stored).at(-1).primary === true, vexItems(stored).at(-1));
    } finally {
      await d.collection('solutionpages').replaceOne({ _id: before._id }, before);
    }
  });

  await part(b, 'Cài đặt chung + Thông tin công ty', async () => {
    const PHOTO = `${PUB}/assets/giai-phap/workshop/hoc-sinh-lap-trinh.jpg`;
    const PHOTO2 = `${PUB}/assets/giai-phap/tap-huan/giao-luu-clb-stem.jpg`;
    const hero = (html) => { const h = html.slice(html.indexOf('<section class="page-hero'), html.indexOf('</section>', html.indexOf('<section class="page-hero'))); return { cls: (h.match(/class="(page-hero[^"]*)"/) || [])[1], image: (h.match(/url\(&#39;([^&]+)&#39;\)/) || h.match(/url\('([^']+)'\)/) || [])[1] || null, sub: decode((h.match(/<p>([^<]*)<\/p>/) || [])[1] || '') }; };
    const newFiles = new Set();
    const getSettings = () => d.collection('sitesettings').findOne({});
    const save = async () => { const l = b.waitLoad(); await click(await ev("document.querySelector('.page-form-actions button[type=submit]') ? '.page-form-actions button[type=submit]' : 'form button[type=submit].btn-primary'")); await l; await sleep(400); return ev(`(() => { const t = document.getElementById('adminToast'); return { shown: !t.hidden, error: t.classList.contains('is-error'), text: t.textContent.trim(), url: location.pathname + location.search }; })()`); };
    try {
      const en = navOf(await (await adminGet('/admin/cai-dat?alang=en')).text());
      check('EN sidebar: "General settings" under Management, "Company info" under About & Contact', en.find(([n]) => n === 'Management')[1].at(-1).label === 'General settings' && en.find(([n]) => n === 'About & Contact')[1][0].label === 'Company info');
      // Defaults: every banner shows today's line, no image
      const bad = [];
      for (const bn of BANNERS) for (const lang of ['vi', 'en']) {
        const h = hero(await pub(bn.url, lang));
        const want = lang === 'en' ? bn.defaultEn : bn.defaultVi;
        if (h.sub !== want || h.image) bad.push({ key: bn.key, lang, got: h.sub, want });
      }
      check(`all ${BANNERS.length} page banners show their default line (VI+EN), no image`, bad.length === 0, bad);
      await signIn();
      // Page editor links to its banner; the link lands on the Banners tab with the card targeted
      await nav('/admin/trang/workshop');
      const editor = await ev(`({ subtitleField: !!document.querySelector('#subtitleVi'), link: (document.querySelector('[data-banner-link]') || {}).getAttribute && document.querySelector('[data-banner-link]').getAttribute('href') })`);
      check('page editor: no banner text fields, link to the page\'s banner in Cài đặt chung', !editor.subtitleField && editor.link === '/admin/cai-dat?tab=banners#banner-workshop', editor);
      let l = b.waitLoad(); await click('[data-banner-link]'); await l; await sleep(500);
      const landed = await ev(`({ tabOpen: !document.querySelector('[data-panel="banners"]').hidden, active: document.querySelector('[data-tab="banners"]').classList.contains('is-active'), target: document.querySelector(':target') && document.querySelector(':target').id, inView: (() => { const r = document.getElementById('banner-workshop').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })(),
        placeholder: document.querySelector('#bannerVi_workshop').placeholder, groups: [...document.querySelectorAll('.banner-group-title')].map(h => h.textContent.trim()) })`);
      check('lands on Banners tab, Workshop row targeted and in view, default shown as placeholder', landed.tabOpen && landed.active && landed.target === 'banner-workshop' && landed.inView && landed.placeholder === BANNERS.find((x) => x.key === 'workshop').defaultVi, landed);
      check('banner rows grouped like the website menu', JSON.stringify(landed.groups) === JSON.stringify(['Robotics thông minh', 'Giải pháp', 'Dịch vụ', 'Tin tức', 'Về MTG', 'Liên hệ']), landed.groups);
      const rowsNow = () => ev(`[...document.querySelectorAll('[data-banner-row]')].map((r) => ({ key: r.id.slice(7), open: r.classList.contains('is-open'), editor: !r.querySelector('.banner-editor').hidden,
        badges: [...r.querySelectorAll('[data-badge]')].filter((x) => !x.hidden).map((x) => x.dataset.badge).join(), line: r.querySelector('[data-banner-summary]').textContent, live: r.querySelector('[data-banner-live-line]').textContent }))`);
      let rows = await rowsNow();
      check(`one row per page (${BANNERS.length}); only the Workshop row is open; all show "Mặc định" and today's line`, rows.length === BANNERS.length && rows.filter((r) => r.open && r.editor).map((r) => r.key).join() === 'workshop'
        && rows.every((r) => r.badges === 'default') && rows.find((r) => r.key === 'workshop').line === BANNERS.find((x) => x.key === 'workshop').defaultVi, rows.filter((r) => r.open || r.badges !== 'default'));
      // Opening another row closes this one; typing updates the preview, the row line and the badge
      await click('#banner-dao-tao [data-banner-toggle]'); await sleep(150);
      await click('#bannerVi_dao-tao'); await b.type('ZZ thử');
      rows = await rowsNow();
      const dt = rows.find((r) => r.key === 'dao-tao');
      check('one row open at a time; typing updates the live preview, the row line and the badge', rows.filter((r) => r.open).map((r) => r.key).join() === 'dao-tao' && dt.live === 'ZZ thử' && dt.line === 'ZZ thử' && dt.badges === 'custom', dt);
      check('"Dùng câu mặc định" shows only when a line is typed', await ev(`!document.querySelector('#banner-dao-tao [data-banner-default]').hidden && document.querySelector('#banner-workshop [data-banner-default]').hidden`));
      await click('#banner-dao-tao [data-banner-default]');
      const cleared = (await rowsNow()).find((r) => r.key === 'dao-tao');
      check('"Dùng câu mặc định" empties the box: default line and badge back', (await ev(`document.querySelector('#bannerVi_dao-tao').value`)) === '' && cleared.line === BANNERS.find((x) => x.key === 'dao-tao').defaultVi && cleared.badges === 'default', cleared);
      const bannerSide = await ev(`(() => { const vi = document.querySelector('#bannerVi_dao-tao').getBoundingClientRect(), en = document.querySelector('#bannerEn_dao-tao').getBoundingClientRect(); return { side: Math.abs(vi.top - en.top) < 2 && vi.right < en.left, switch: !!document.querySelector('[data-lang-switch]') }; })()`);
      check('banner: Vietnamese box on the left, English on the right, no language switch', bannerSide.side && !bannerSide.switch, bannerSide);
      await click('#bannerEn_dao-tao'); await sleep(100);
      const enView = await ev(`({ live: document.querySelector('#banner-dao-tao [data-banner-live-line]').textContent, title: [...document.querySelectorAll('#banner-dao-tao [data-live-title]')].filter((x) => !x.hidden).map((x) => x.textContent).join(), line: document.querySelector('#banner-dao-tao [data-banner-summary]').textContent })`);
      check('typing in the English box: the preview shows English; the row line stays Vietnamese', enView.live === BANNERS.find((x) => x.key === 'dao-tao').defaultEn && enView.title === 'STEM training' && enView.line === BANNERS.find((x) => x.key === 'dao-tao').defaultVi, enView);
      await click('#banner-workshop [data-banner-toggle]'); await sleep(150);
      // Workshop: text + image; Services: image
      await setVal('#bannerVi_workshop', 'ZZ Banner workshop mới');
      await setVal('#bannerEn_workshop', 'ZZ New workshop banner');
      await setFiles('#banner_workshop', [PHOTO]);
      await setFiles('#banner_services', [PHOTO2]);
      await sleep(200);
      const picked = await ev(`({ thumb: document.querySelector('#banner-services [data-banner-thumb]').style.getPropertyValue('--hero-image'), badges: [...document.querySelectorAll('#banner-services [data-badge]')].filter((x) => !x.hidden).map((x) => x.dataset.badge).join(), name: document.querySelector('#banner-services [data-banner-file-name]').textContent })`);
      check('a picked image shows at once in the row (thumbnail, "Có ảnh", file name)', /^url\('blob:/.test(picked.thumb) && picked.badges === 'default,image' && picked.name === 'giao-luu-clb-stem.jpg', picked);
      const t1 = await save();
      check('save banners → green toast, back on the Banners tab', t1.shown && !t1.error && t1.url === '/admin/cai-dat?tab=banners', t1);
      let st = await getSettings();
      const wsImg = st.banners.workshop.image; const svImg = st.banners.services.image;
      [wsImg, svImg].forEach((u) => u && newFiles.add(u));
      check('saved: workshop text VI/EN + image, services image', st.banners.workshop.subtitleVi === 'ZZ Banner workshop mới' && st.banners.workshop.subtitleEn === 'ZZ New workshop banner' && /^\/uploads\/images\//.test(wsImg) && /^\/uploads\/images\//.test(svImg) && existsSync(PUB + wsImg), st.banners.workshop);
      const hv = hero(await pub('/giai-phap/workshop')); const he = hero(await pub('/giai-phap/workshop', 'en'));
      check('public Workshop banner: new line (VI/EN) over the image', hv.sub === 'ZZ Banner workshop mới' && he.sub === 'ZZ New workshop banner' && hv.cls === 'page-hero has-image' && hv.image === wsImg, { hv, he });
      const svc = await d.collection('services').findOne({});
      const sd = hero(await pub(`/dich-vu/${svc.slug}`));
      check('service detail page shares the Dịch vụ image and keeps its own subtitle', sd.image === svImg && sd.sub === decode(svc.summaryVi || '').trim(), sd);
      check('other banners unchanged', hero(await pub('/giai-phap/dao-tao')).sub === BANNERS.find((x) => x.key === 'dao-tao').defaultVi && !hero(await pub('/giai-phap/dao-tao')).image);
      await nav('/giai-phap/workshop');
      const bgOk = await ev(`(async () => { const s = getComputedStyle(document.querySelector('.page-hero')).backgroundImage; const url = (s.match(/url\\("([^"]+)"\\)/) || [])[1]; if (!url) return { s }; const img = new Image(); img.src = url; await img.decode().catch(() => {}); return { url, w: img.naturalWidth }; })()`);
      check('banner background image actually loads', bgOk.w > 0, bgOk);
      // Clear the text + remove the image → default back, file deleted
      await nav('/admin/cai-dat?tab=banners');
      const savedRow = (await rowsNow()).find((r) => r.key === 'workshop');
      check('after saving, the Workshop row shows "Đã sửa" + "Có ảnh" and the new line', savedRow.badges === 'custom,image' && savedRow.line === 'ZZ Banner workshop mới' && !savedRow.open, savedRow);
      await click('#banner-workshop [data-banner-toggle]'); await sleep(150);
      await setVal('#bannerVi_workshop', ''); await setVal('#bannerEn_workshop', '');
      await click('input[name="removeBanner_workshop"]');
      await save();
      st = await getSettings();
      const back = hero(await pub('/giai-phap/workshop'));
      check('cleared: default line back, image gone, file deleted; services image kept', back.sub === BANNERS.find((x) => x.key === 'workshop').defaultVi && !back.image && !st.banners.workshop.image && !existsSync(PUB + wsImg) && st.banners.services.image === svImg, { back, ws: st.banners.workshop });
      // Home hero: title override + image
      await nav('/admin/cai-dat?tab=home');
      check('?tab=home opens the Home tab', await ev(`!document.querySelector('[data-panel="home"]').hidden && document.querySelector('[data-panel="brand"]').hidden`));
      await setVal('#heroTitleVi', 'ZZ Tiêu đề trang chủ');
      await setFiles('input[name="heroHome"]', [PHOTO]);
      const t2 = await save();
      st = await getSettings(); if (st.heroImages.home) newFiles.add(st.heroImages.home);
      let home = await pub('/');
      check('home hero: title override + new image shown; returns to Home tab', home.includes('<h1>ZZ Tiêu đề trang chủ</h1>') && home.includes(`src="${st.heroImages.home}"`) && t2.url === '/admin/cai-dat?tab=home', { t2, img: st.heroImages.home });
      const enTitle = (await pub('/', 'en')).match(/<h1>([^<]+)<\/h1>/)[1];
      check('EN home title is still the default text', enTitle && !enTitle.includes('ZZ'), enTitle);
      await setVal('#heroTitleVi', '');
      await save();
      home = await pub('/');
      check('cleared title → default home title back', !home.includes('ZZ Tiêu đề trang chủ') && home.includes('<h1>Giải pháp công nghệ'), (home.match(/<h1>([^<]+)/) || [])[1]);
      // Logo
      await nav('/admin/cai-dat');
      await setFiles('input[name="logo"]', [PHOTO2]);
      await save();
      st = await getSettings(); newFiles.add(st.logo);
      check('logo uploaded in Cài đặt chung shows in the site header', (await pub('/')).includes(`class="logo-img" src="${st.logo}"`), st.logo);
      check('the previous logo file is kept on disk', existsSync(PUB + settingsBackup.logo));
      // Company info
      await nav('/admin/thong-tin-cong-ty');
      const ci = await ev(`({ logoField: !!document.querySelector('input[name="logo"]'), heroField: !!document.querySelector('[name^="hero"]') })`);
      check('Thông tin công ty has no logo/hero fields any more', !ci.logoField && !ci.heroField, ci);
      await setVal('#phone', '0999 000 111');
      await setVal('#companyProfile', 'ZZ Giới thiệu công ty thử nghiệm');
      const t3 = await save();
      check('company info saves (green toast) and shows on Về MTG / Liên hệ', t3.shown && !t3.error && (await pub('/ve-mtg')).includes('ZZ Giới thiệu công ty thử nghiệm') && (await pub('/lien-he')).includes('0999 000 111'), t3);
      await b.viewport(390, 844);
      await nav('/admin/cai-dat?tab=banners');
      check('390px: settings page has no horizontal overflow', (await ev('document.documentElement.scrollWidth - innerWidth')) <= 1);
    } finally {
      await restoreSettingsNow();
      const keep = new Set([settingsBackup.logo, settingsBackup.heroImages && settingsBackup.heroImages.home].filter(Boolean));
      newFiles.forEach((u) => { if (u && !keep.has(u)) { try { unlinkSync(PUB + u); } catch {} } });
    }
    check('after the test the site shows the original logo again', (await pub('/')).includes(`class="logo-img" src="${settingsBackup.logo}"`));
  });

  await part(b, 'company introduction is plain text', async () => {
    const original = settingsBackup;
    const post = (vi, en) => fetch(BASE + '/admin/thong-tin-cong-ty', { method: 'POST', redirect: 'manual', headers: { cookie: `connect.sid=${admin.sid}` },
      body: new URLSearchParams({ companyProfile: vi, companyProfileEn: en, address: original.contactInfo?.address || '', phone: original.contactInfo?.phone || '', email: original.contactInfo?.email || '', mapEmbedUrl: original.contactInfo?.mapEmbedUrl || '' }) });
    const about = async (lang) => (await fetch(BASE + '/ve-mtg', { headers: { cookie: `lang=${lang}` } })).text();
    try {
      const r = await post('<p>Đoạn <strong>một</strong>.</p><p>Đoạn hai &amp; ba.</p>', 'First <b>para</b>.<br>Same para, new line.\r\n\r\nSecond para.');
      const saved = await d.collection('sitesettings').findOne({});
      check('save redirects back to Thông tin công ty', r.status === 302 && r.headers.get('location') === '/admin/thong-tin-cong-ty', r.status);
      check('VI saved without tags', saved.companyProfile === 'Đoạn một.\n\nĐoạn hai & ba.', saved.companyProfile);
      check('EN saved without tags', saved.companyProfileEn === 'First para.\nSame para, new line.\n\nSecond para.', saved.companyProfileEn);
      check('contact details untouched', JSON.stringify(saved.contactInfo) === JSON.stringify(original.contactInfo));
      const page = await (await adminGet('/admin/thong-tin-cong-ty')).text();
      check('the form shows the plain-text hint and the text without tags', page.includes('Chỉ nhập văn bản thường, không cần thẻ HTML.') && /name="companyProfile" rows="\d+">Đoạn một\.\n\nĐoạn hai &amp; ba\.<\/textarea>/.test(page));
      let html = await about('vi');
      check('About VI: two paragraphs, & shown correctly', html.includes('<p>Đoạn một.</p>\n<p>Đoạn hai &amp; ba.</p>'));
      html = await about('en');
      check('About EN: line break + second paragraph', html.includes('<p>First para.<br>Same para, new line.</p>\n<p>Second para.</p>'));
      await post('<script>alert(1)</script>Văn bản', 'x');
      html = await about('vi');
      check('script tag stripped on save, nothing injected on page', !html.includes('<script>alert(1)</script>') && html.includes('<p>alert(1)Văn bản</p>'));
    } finally {
      await restoreSettingsNow();
    }
    const back = await d.collection('sitesettings').findOne({});
    check('real introduction restored exactly', back.companyProfile === original.companyProfile && back.companyProfileEn === original.companyProfileEn);
  });

  await part(b, 'content forms save plain text', async () => {
    const cookie = `connect.sid=${admin.sid}`;
    const PASTED = '<p>Giới thiệu <strong>ngắn</strong>.</p><ul><li>Ý một</li><li>Ý hai</li></ul>';
    const TYPED = 'Intro line.\r\nSecond line.\r\n\r\n- Point A\r\n- Point B';
    const EXPECT_VI = 'Giới thiệu ngắn.\n\n- Ý một\n- Ý hai';
    const EXPECT_EN = 'Intro line.\nSecond line.\n\n- Point A\n- Point B';
    const HTML_VI = '<p>Giới thiệu ngắn.</p>\n<ul><li>Ý một</li><li>Ý hai</li></ul>';
    const HTML_EN = '<p>Intro line.<br>Second line.</p>\n<ul><li>Point A</li><li>Point B</li></ul>';
    const adminPost = (path, fields) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); return fetch(BASE + path, { method: 'POST', body: fd, redirect: 'manual', headers: { cookie } }); };
    const page = (path, lang) => pub(path, lang);
    const service = await d.collection('services').findOne({ slug: 'tu-van-du-hoc' });
    try {
      for (const p of ['/admin/san-pham/moi', '/admin/du-an/moi', '/admin/tin-tuc/moi', `/admin/dich-vu/${service._id}/sua`]) {
        const html = await (await fetch(BASE + p, { headers: { cookie } })).text();
        check(`${p}: 2 plain-text hints, no "HTML đơn giản"`, (html.match(/Chỉ nhập văn bản thường/g) || []).length === 2 && !html.includes('HTML đơn giản'));
      }
      await adminPost('/admin/san-pham/moi', { nameVi: `${MARK} thiết bị`, nameEn: `${MARK} device`, category: 'stem-equipment', subcategory: '', descriptionVi: PASTED, descriptionEn: TYPED, order: '0' });
      const prod = await d.collection('products').findOne({ nameVi: `${MARK} thiết bị` });
      check('product saved as plain text (VI pasted HTML, EN typed)', prod && prod.descriptionVi === EXPECT_VI && prod.descriptionEn === EXPECT_EN, prod && [prod.descriptionVi, prod.descriptionEn]);
      check('equipment page VI shows paragraph + list', (await page(`/giai-phap/thiet-bi/${prod._id}`, 'vi')).includes(`<div class="prose-text prose-text-start">${HTML_VI}</div>`));
      check('equipment page EN shows line break + list', (await page(`/giai-phap/thiet-bi/${prod._id}`, 'en')).includes(`<div class="prose-text prose-text-start">${HTML_EN}</div>`));
      await adminPost('/admin/du-an/moi', { titleVi: `${MARK} dự án`, titleEn: '', schoolName: '', location: '', descriptionVi: PASTED, descriptionEn: TYPED, order: '0' });
      const proj = await d.collection('projects').findOne({ titleVi: `${MARK} dự án` });
      check('project saved as plain text', proj && proj.descriptionVi === EXPECT_VI && proj.descriptionEn === EXPECT_EN);
      check('project page shows paragraph + list', (await page(`/giai-phap/du-an/${proj._id}`, 'vi')).includes(HTML_VI));
      await adminPost('/admin/tin-tuc/moi', { titleVi: `${MARK} tin`, titleEn: '', bodyVi: PASTED, bodyEn: TYPED, published: 'on' });
      const art = await d.collection('articles').findOne({ titleVi: `${MARK} tin` });
      check('article saved as plain text', art && art.bodyVi === EXPECT_VI && art.bodyEn === EXPECT_EN);
      check('article page EN shows formatted body', (await page(`/tin-tuc/${art._id}`, 'en')).includes(`<div class="prose-text">${HTML_EN}</div>`));
      await adminPost(`/admin/dich-vu/${service._id}/sua`, { titleVi: service.titleVi, titleEn: service.titleEn, summaryVi: service.summaryVi, summaryEn: service.summaryEn, bodyVi: PASTED, bodyEn: TYPED, order: String(service.order || 0) });
      const svc = await d.collection('services').findOne({ _id: service._id });
      check('service saved as plain text', svc.bodyVi === EXPECT_VI && svc.bodyEn === EXPECT_EN);
      check('service page shows paragraph + list', (await page('/dich-vu/tu-van-du-hoc', 'vi')).includes(`<div class="prose-text prose-text-start">${HTML_VI}</div>`));
      // Real content
      let html = await page('/san-pham/robot-leo-cau-thang', 'vi');
      const lis = (html.match(/<div class="prose-text prose-text-start">[\s\S]*?<\/div>/) || [''])[0].match(/<li>/g) || [];
      check('stair robot page: paragraph + 4-item list', html.includes('<div class="prose-text prose-text-start"><p>Máy leo cầu thang') && lis.length === 4, lis.length);
      for (const p of ['/', '/san-pham']) {
        html = await page(p, 'vi');
        const cards = [...html.matchAll(/<div class="card-body">\s*<h3>[^<]*<\/h3>\s*<p>([^<]*)<\/p>/g)].map((m) => m[1]);
        check(`${p}: product card previews have no "<p>" / "&lt;"`, cards.length >= 4 && cards.every((t) => !t.includes('&lt;') && !t.startsWith('- ')), cards.slice(0, 2));
      }
      html = await page('/dich-vu/phan-phoi-san-pham', 'vi');
      check('real service page renders a paragraph', html.includes('<div class="prose-text prose-text-start"><p>MTG là đơn vị phân phối'));
    } finally {
      await d.collection('services').replaceOne({ _id: service._id }, service);
      for (const [c, f] of [['products', 'nameVi'], ['projects', 'titleVi'], ['articles', 'titleVi']]) await d.collection(c).deleteMany({ [f]: { $regex: '^' + MARK } });
    }
  });
});
