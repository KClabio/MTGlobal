// Request forms (Liên hệ, robot pages: checks in the browser, saved category, success message, admin label)
// and the Dịch vụ landing page with its single home-slider card.
import { suite, part, check, db, BASE, ROOT, appRequire, removeLater, stamp } from './lib/index.mjs';

const ejs = appRequire('ejs');
const { makeTranslator } = appRequire('./lib/i18n.js');

await suite(async (b) => {
  const { send, ev, sleep } = b;
  const MARK = `ZZTEST-forms-${stamp}`;
  removeLater('quoterequests', { name: { $regex: '^' + MARK } });

  await part(b, 'form checks in the browser', async () => {
    const navigate = (url) => b.nav(url, 150);
    const setField = async (name, text) => {
      await ev(`(() => { const f = document.querySelector('[data-quote-form]').elements[${JSON.stringify(name)}]; f.focus(); f.select && f.select(); })()`);
      if (text === '') await b.key('Backspace', 'Backspace', 8);
      else await send('Input.insertText', { text });
    };
    const clickSubmit = async () => {
      const p = await ev(`(() => { const b = document.querySelector('[data-quote-form] button[type=submit]'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      let navigated = false;
      const l = b.waitLoad(3000).then(() => { navigated = true; });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await Promise.race([l.catch(() => {}), sleep(1200)]); await sleep(150);
      return navigated;
    };
    const formState = () => ev(`(() => {
      const f = document.querySelector('[data-quote-form]');
      const errs = {}; f.querySelectorAll('[data-error-for]').forEach(e => { errs[e.dataset.errorFor] = e.textContent; });
      const hint = f.querySelector('[data-contact-hint]');
      return { errs, contactError: hint.classList.contains('is-error') ? hint.textContent : null,
        invalid: [...f.querySelectorAll('.is-invalid')].map(e => e.name), focused: document.activeElement && document.activeElement.name };
    })()`);

    // --- Liên hệ (VI) ---
    await navigate(`${BASE}/lien-he?lang=vi`);
    let nav = await clickSubmit(); let s = await formState();
    check('VI empty submit is blocked (no page load)', !nav);
    check('VI empty: name + message errors, contact hint red', !!(s.errs.name && s.errs.message && s.contactError), s);
    check('VI empty: phone & email outlined, focus on name', s.invalid.includes('phone') && s.invalid.includes('email') && s.focused === 'name', { invalid: s.invalid, focused: s.focused });
    await b.shot('form-error-vi');

    await setField('email', 'an@example.com'); s = await formState();
    check('typing an email clears the contact error', !s.contactError && !s.invalid.includes('phone') && !s.invalid.includes('email'), s);

    await setField('name', '   '); await setField('message', 'Xin chào'); await setField('email', '');
    await setField('phone', 'abc');
    nav = await clickSubmit(); s = await formState();
    check('whitespace-only name rejected', !nav && !!s.errs.name, s.errs);
    check('bad phone "abc" rejected', s.errs.phone === 'Số điện thoại không hợp lệ.', s.errs);

    await setField('phone', ''); await setField('email', 'a@b');
    nav = await clickSubmit(); s = await formState();
    check('bad email "a@b" rejected', !nav && s.errs.email === 'Email không hợp lệ.', s.errs);

    await setField('name', MARK); await setField('email', ''); await setField('phone', '0912345678');
    nav = await clickSubmit();
    const success = await ev(`!!document.querySelector('.form-alert.success')`);
    check('valid name + phone submits and shows success', nav && success, { nav, success });

    // --- Product page sidebar (EN) ---
    await navigate(`${BASE}/san-pham/robot-leo-cau-thang?lang=en`);
    nav = await clickSubmit(); s = await formState();
    check('EN sidebar empty submit is blocked', !nav);
    const pos = await ev(`({ field: document.querySelector('aside [name=name]').getBoundingClientRect().top, header: document.getElementById('siteHeader').getBoundingClientRect().bottom })`);
    check('focused field lands below the sticky header', pos.field >= pos.header, pos);
    check('EN messages', s.errs.name === 'Please enter your full name.' && /phone number or an email/.test(s.contactError || ''), s);
    await b.shot('form-error-en-sidebar');
  });

  await part(b, 'robot request form (HTTP)', async () => {
    const col = (await db()).collection('quoterequests');
    const ROBOTS = ['robot-leo-cau-thang', 'robot-di-theo-nguoi', 'robot-cat-co', 'robot-gia-dinh'];
    const post = (path, fields, lang = 'vi') => fetch(BASE + path, { method: 'POST', redirect: 'manual', body: new URLSearchParams(fields), headers: { cookie: `lang=${lang}` } });
    for (const robot of ROBOTS) {
      const page = await (await fetch(`${BASE}/san-pham/${robot}`)).text();
      check(`[${robot}] no "interested in" dropdown, form posts to robot route`,
        !page.includes('name="interestedIn"') && page.includes(`action="/san-pham/${robot}/yeu-cau"`));
      const name = `${MARK}-${robot}`;
      const r = await post(`/san-pham/${robot}/yeu-cau`, { name, phone: '0912345678', message: 'Tôi muốn báo giá', interestedIn: 'khac' });
      check(`[${robot}] valid submit -> 303 back to the robot page`, r.status === 303 && r.headers.get('location') === `/san-pham/${robot}?da-gui=1#yeu-cau`, { status: r.status, location: r.headers.get('location') });
      const saved = await col.findOne({ name });
      check(`[${robot}] saved as san-pham-robot even with tampered interestedIn=khac`, saved && saved.interestedIn === 'san-pham-robot', saved && saved.interestedIn);
      const after = await (await fetch(`${BASE}/san-pham/${robot}?da-gui=1`, { headers: { cookie: 'lang=en' } })).text();
      check(`[${robot}] success message shown on the robot page`, after.includes('Your request has been sent') && after.includes('id="yeu-cau"'));
    }
    // Validation error stays on the robot page with values kept
    let r = await post('/san-pham/robot-cat-co/yeu-cau', { name: '', email: 'an@example.com', message: 'Giữ lại nội dung' }, 'en');
    let html = await r.text();
    check('empty name -> 400 on the robot page with field error and values kept',
      r.status === 400 && html.includes('Please enter your full name.') && html.includes('value="an@example.com"') && html.includes('>Giữ lại nội dung</textarea>') && html.includes('action="/san-pham/robot-cat-co/yeu-cau"') && !html.includes('name="interestedIn"'), r.status);
    check('nothing saved for the rejected request', (await col.countDocuments({ message: 'Giữ lại nội dung' })) === 0);
    r = await post('/san-pham/khong-ton-tai/yeu-cau', { name: 'X', phone: '0912345678', message: 'x' });
    check('unknown robot -> 404', r.status === 404, r.status);
    // Liên hệ keeps its dropdown and the chosen category
    html = await (await fetch(`${BASE}/lien-he`)).text();
    check('Liên hệ still shows the dropdown and posts to /lien-he', html.includes('name="interestedIn"') && html.includes('action="/lien-he"'));
    r = await post('/lien-he', { name: `${MARK}-contact`, email: 'an@example.com', message: 'Hỏi về du học', interestedIn: 'tu-van-du-hoc' });
    const contactSaved = await col.findOne({ name: `${MARK}-contact` });
    check('Liên hệ keeps the chosen category (tu-van-du-hoc)', r.status === 200 && contactSaved && contactSaved.interestedIn === 'tu-van-du-hoc', contactSaved && contactSaved.interestedIn);
    // Admin list label: render the admin view with the saved test records
    const requests = await col.find({ name: { $regex: '^' + MARK } }).sort({ createdAt: -1 }).toArray();
    const adminHtml = await ejs.renderFile(`${ROOT}views/admin/requests.ejs`, { requests, statusFilter: '', statuses: ['moi', 'da_lien_he', 'hoan_tat'], active: 'yeu-cau', user: { name: 'Admin' }, lang: 'vi', theme: 'light', t: makeTranslator('vi'), adminLangUrl: () => '#', flash: null }, { root: `${ROOT}views` });
    check('admin shows "Sản phẩm Robot thông minh" (4 robot requests)', (adminHtml.match(/>Sản phẩm Robot thông minh</g) || []).length === 4);
    check('admin shows "Tư vấn du học" for the contact request', adminHtml.includes('>Tư vấn du học<') && !adminHtml.includes('>san-pham-robot<'));
  });

  await part(b, 'robot request form (browser)', async () => {
    await b.nav('/san-pham/robot-leo-cau-thang?lang=vi', 300);
    await b.shot('robot-form-sidebar');
    const name = `${MARK}-browser`;
    await ev(`(() => { const f = document.querySelector('#yeu-cau form');
      f.elements.name.value = ${JSON.stringify(name)}; f.elements.phone.value = '0912345678'; f.elements.message.value = 'Báo giá robot leo cầu thang'; })()`);
    const l = b.waitLoad();
    await ev(`document.querySelector('#yeu-cau button[type=submit]').click()`);
    await l; await sleep(500);
    const s = await ev(`({ path: location.pathname + location.search + location.hash, success: !!document.querySelector('#yeu-cau .form-alert.success'),
      formTop: Math.round(document.querySelector('#yeu-cau').getBoundingClientRect().top), scrollY: Math.round(scrollY) })`);
    check('lands back on the same robot page', s.path === '/san-pham/robot-leo-cau-thang?da-gui=1#yeu-cau', s.path);
    check('success message shown in the sidebar', s.success);
    check('page scrolled to the form (form just below the sticky header)', s.scrollY > 0 && s.formTop >= 76 && s.formTop < 400, s);
    const saved = await (await db()).collection('quoterequests').findOne({ name });
    check('saved with category san-pham-robot', saved && saved.interestedIn === 'san-pham-robot', saved && saved.interestedIn);
  });

  await part(b, 'Dịch vụ landing page', async () => {
    const { nav, shot } = b;
    await nav('/dich-vu', 200);
    const svc = await ev(`({ cards: [...document.querySelectorAll('.service-cards .card')].map((c) => ({ href: c.getAttribute('href'), art: !!c.querySelector('.card-media.is-art svg'), img: !!c.querySelector('.card-media img'), title: c.querySelector('h3').textContent })), band: !!document.querySelector('.cta-band .cta-band-btn[href="/lien-he"]'), banner: (document.querySelector('.page-banner p, .page-hero p') || {}).textContent })`);
    check('/dich-vu: a card per service (study abroad with colour art) and the consultation band', svc.cards.length === 2 && svc.cards.some((c) => c.href === '/dich-vu/tu-van-du-hoc' && c.art) && svc.cards.some((c) => c.href === '/dich-vu/phan-phoi-san-pham' && c.img) && svc.band, svc);
    await shot('dich-vu-1280', true);
    await b.setCookie('theme', 'dark'); await nav('/dich-vu', 200); await shot('dich-vu-dark'); await b.setCookie('theme', 'light');
    await nav('/', 300);
    const dom = await ev(`[...document.querySelectorAll('.domain-card')].map((a) => a.getAttribute('href'))`);
    check('home "Lĩnh vực hoạt động": 7 cards, one "Dịch vụ" card for both services', dom.length === 7 && dom.includes('/dich-vu?from=home') && !dom.some((h) => h.startsWith('/dich-vu/')), dom);
    const svcCard = await ev(`(() => { const a = document.querySelector('.domain-card[href="/dich-vu?from=home"]'); return { title: a.querySelector('h3').textContent, text: (a.querySelector('p') || {}).textContent, art: !!a.querySelector('.domain-media.is-art') }; })()`);
    check('the "Dịch vụ" card has its title, line and art', svcCard.title === 'Dịch vụ' && svcCard.text && svcCard.text.length > 10 && svcCard.art, svcCard);
    await nav('/dich-vu?from=home', 200);
    check('opened from the home card, /dich-vu offers the way back to the slider', await ev(`!!document.querySelector('a[href="/#linh-vuc"]')`));
  });
});
