// Request forms (Liên hệ, robot pages: checks in the browser, saved category, success message, admin label)
// and the Dịch vụ landing page with its single home-slider card.
import { suite, part, check, db, BASE, ROOT, appRequire, removeLater, restoreLater, stamp, createUser } from './lib/index.mjs';

const ejs = appRequire('ejs');
const { makeTranslator } = appRequire('./lib/i18n.js');
const { isProductLine } = appRequire('./models/QuoteRequest.js');

await suite(async (b) => {
  const { send, ev, sleep } = b;
  const MARK = `ZZTEST-forms-${stamp}`;
  removeLater('quoterequests', { name: { $regex: '^' + MARK } });
  // Requests need an account: the forms are used logged in as a customer whose profile has a phone and an organisation
  const requester = await createUser('requester', 'customer');
  const PROFILE = { name: `ZZ requester`, email: requester.email, phone: '0912 000 111', schoolOrCompany: 'ZZ Trường Thử' };
  await (await db()).collection('users').updateOne({ _id: requester.id }, { $set: { phone: PROFILE.phone, schoolOrCompany: PROFILE.schoolOrCompany } });
  const asRequester = (lang = 'vi') => ({ cookie: `lang=${lang}; connect.sid=${requester.sid}` });

  await part(b, 'form checks in the browser', async () => {
    await b.login(requester.sid);
    // The form opens with the profile filled in: empty it to test the checks
    const navigate = async (url) => { await b.nav(url, 150); await ev(`(() => { const f = document.querySelector('[data-quote-form]'); ['name', 'phone', 'email', 'schoolOrCompany'].forEach((n) => { f.elements[n].value = ''; }); })()`); };
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
    const unlabelled = await ev(`[...document.querySelectorAll('[data-quote-form] input, [data-quote-form] select, [data-quote-form] textarea')]
      .filter((el) => el.type !== 'hidden' && !el.labels.length).map((el) => el.name)`);
    check('every field of the request form has a connected label (screen readers name it)', unlabelled.length === 0, unlabelled);
    check('clicking "Số điện thoại" puts the cursor in its box', await ev(`(() => { document.querySelector('label[for="qf-phone"]').click(); return document.activeElement && document.activeElement.name === 'phone'; })()`));
    check('the "Tôi đồng ý với Chính sách bảo mật" tick starts empty and links the policy (new tab)', await ev(`(() => { const c = document.getElementById('qf-agree'); const a = document.querySelector('label[for="qf-agree"] a'); return !c.checked && a.getAttribute('href') === '/chinh-sach-bao-mat' && a.target === '_blank'; })()`));
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

    check('the consent tick is required: unticked → its own message', s.errs.agreePrivacy === 'Vui lòng đánh dấu đồng ý với Chính sách bảo mật.', s.errs);
    await ev(`document.getElementById('qf-agree').click()`); await sleep(100); s = await formState();
    check('… ticking it clears that message', !s.errs.agreePrivacy && !s.invalid.includes('agreePrivacy'), s);

    await setField('name', MARK); await setField('email', ''); await setField('phone', '0912345678');
    nav = await clickSubmit();
    const success = await ev(`(() => { const c = document.querySelector('[data-request-sent]'); return c && { path: location.pathname + location.search, text: c.querySelector('.request-sent-text').textContent,
      back: c.querySelector('[data-back-to-form]').getAttribute('href'), backText: c.querySelector('[data-back-to-form]').textContent.trim(), mine: c.querySelector('[data-see-requests]').getAttribute('href'), form: !!document.querySelector('[data-quote-form]') }; })()`);
    check('valid name + phone submits: the thank-you card at /lien-he?da-gui=1', nav && success && success.path === '/lien-he?da-gui=1' && /Cảm ơn bạn/.test(success.text) && !success.form, success);
    check('… with "← Quay lại biểu mẫu" (/lien-he) and "Xem yêu cầu của tôi" (/tai-khoan)', success && success.back === '/lien-he' && success.backText === '← Quay lại biểu mẫu' && success.mine === '/tai-khoan', success);
    await b.shot('contact-sent');
    const countSent = async () => (await db()).collection('quoterequests').countDocuments({ name: MARK });
    const before = await countSent();
    await b.nav('/lien-he?da-gui=1', 200);
    check('reloading the thank-you page sends nothing again', (await countSent()) === before && before === 1, before);
    { const l = b.waitLoad(); await ev(`document.querySelector('[data-back-to-form]').click()`); await l; await sleep(200); }
    check('"← Quay lại biểu mẫu" opens the empty form again', await ev(`location.pathname === '/lien-he' && !!document.querySelector('[data-quote-form]') && document.querySelector('[data-quote-form] [name=message]').value === ''`));

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
    // Sent with the consent tick unless a test leaves it out on purpose
    const post = (path, fields, lang = 'vi') => fetch(BASE + path, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ agreePrivacy: '1', ...fields }), headers: asRequester(lang) });
    const get = async (path, lang = 'vi') => (await fetch(BASE + path, { headers: asRequester(lang) })).text();
    for (const robot of ROBOTS) {
      const page = await get(`/san-pham/${robot}`);
      check(`[${robot}] no "interested in" dropdown, form posts to robot route`,
        !page.includes('name="interestedIn"') && page.includes(`action="/san-pham/${robot}/yeu-cau"`));
      const name = `${MARK}-${robot}`;
      const r = await post(`/san-pham/${robot}/yeu-cau`, { name, phone: '0912345678', message: 'Tôi muốn báo giá', interestedIn: 'khac' });
      check(`[${robot}] valid submit -> 303 back to the robot page`, r.status === 303 && r.headers.get('location') === `/san-pham/${robot}?da-gui=1#yeu-cau`, { status: r.status, location: r.headers.get('location') });
      const saved = await col.findOne({ name });
      check(`[${robot}] saved as san-pham-robot even with tampered interestedIn=khac`, saved && saved.interestedIn === 'san-pham-robot', saved && saved.interestedIn);
      const product = await (await db()).collection('products').findOne({ category: robot });
      const line = saved && (saved.details || [])[0];
      check(`[${robot}] the request names the robot ("Sản phẩm: ${product.nameVi}")`, line && line.kind === 'product' && line.labelVi === 'Sản phẩm' && line.valueVi === product.nameVi && line.labelEn === 'Product' && line.valueEn === product.nameEn, saved && saved.details);
      const after = await get(`/san-pham/${robot}?da-gui=1`, 'en');
      check(`[${robot}] success message shown on the robot page, "Back to the form" leads to its own form`, after.includes('Your request has been sent') && after.includes('id="yeu-cau"') && after.includes(`href="/san-pham/${robot}#yeu-cau" data-back-to-form`));
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
    html = await get('/lien-he');
    check('Liên hệ still shows the dropdown and posts to /lien-he', html.includes('name="interestedIn"') && html.includes('action="/lien-he"'));
    const groups = [...html.matchAll(/<optgroup label="([^"]+)">([\s\S]*?)<\/optgroup>/g)].map((m) => [m[1], [...m[2].matchAll(/value="([^"]+)"/g)].map((v) => v[1])]);
    check('"Bạn quan tâm đến": Giải pháp STEM (5) · Sản phẩm (robots) · Dịch vụ (2), then Khác',
      JSON.stringify(groups) === JSON.stringify([['Giải pháp STEM', ['giai-phap-stem-lab', 'thiet-bi-stem', 'workshop-stem', 'dao-tao-stem', 'tap-huan-stem']], ['Sản phẩm', ['san-pham-robot']], ['Dịch vụ', ['tu-van-du-hoc', 'phan-phoi-san-pham']]])
      && /<\/optgroup>\s*<option value="khac"/.test(html), groups);
    for (const [topic, label] of [['workshop-stem', 'Workshop trải nghiệm STEM'], ['dao-tao-stem', 'Đào tạo STEM'], ['tap-huan-stem', 'Tập huấn &amp; triển khai'], ['nonsense', 'Khác']]) {
      const pre = await get(`/lien-he?quan_tam=${topic}`);
      check(`?quan_tam=${topic} pre-selects "${label.replace('&amp;', '&')}"`, (pre.match(/<option value="[^"]+" selected>([^<]+)/) || [])[1] === label);
    }
    r = await post('/lien-he', { name: `${MARK}-workshop`, email: 'an@example.com', message: 'Workshop', interestedIn: 'workshop-stem' });
    check('Liên hệ: sending → 303 to the thank-you page (/lien-he?da-gui=1)', r.status === 303 && r.headers.get('location') === '/lien-he?da-gui=1', { status: r.status, at: r.headers.get('location') });
    check('a new choice is saved as chosen (workshop-stem)', r.status === 303 && (await col.findOne({ name: `${MARK}-workshop` })).interestedIn === 'workshop-stem');
    const consent = (await col.findOne({ name: `${MARK}-workshop` })).privacyAcceptedAt;
    check('… with the time of consent to the Chính sách bảo mật', consent instanceof Date && Date.now() - consent < 60000, consent);
    for (const path of ['/lien-he', '/san-pham/robot-cat-co/yeu-cau']) {
      r = await post(path, { name: `${MARK}-no-tick`, email: 'an@example.com', message: 'Không đánh dấu', interestedIn: 'khac', agreePrivacy: '' });
      html = await r.text();
      check(`${path} without the consent tick → 400, only the tick named, nothing saved`, r.status === 400 && /data-error-for="agreePrivacy">Vui lòng đánh dấu đồng ý với Chính sách bảo mật\./.test(html)
        && (html.match(/data-error-for="/g) || []).length === 1 && !(await col.findOne({ name: `${MARK}-no-tick` })), r.status);
    }
    r = await post('/lien-he', { name: `${MARK}-contact`, email: 'an@example.com', message: 'Hỏi về du học', interestedIn: 'tu-van-du-hoc' });
    const contactSaved = await col.findOne({ name: `${MARK}-contact` });
    check('Liên hệ keeps the chosen category (tu-van-du-hoc)', r.status === 303 && contactSaved && contactSaved.interestedIn === 'tu-van-du-hoc', contactSaved && contactSaved.interestedIn);
    // Admin list label: render the admin view with the saved test records
    const requests = await col.find({ name: { $regex: '^' + MARK } }).sort({ createdAt: -1 }).toArray();
    const adminHtml = await ejs.renderFile(`${ROOT}views/admin/requests.ejs`, { requests, statusFilter: '', statuses: ['moi', 'da_lien_he', 'hoan_tat'], active: 'yeu-cau', user: { name: 'Admin' }, lang: 'vi', theme: 'light', t: makeTranslator('vi'), adminLangUrl: () => '#', flash: null, isProductLine, cspNonce: 'test', asset: (u) => u }, { root: `${ROOT}views` });
    check('admin shows "Sản phẩm Robot thông minh" (4 robot requests)', (adminHtml.match(/>Sản phẩm Robot thông minh</g) || []).length === 4);
    check('admin shows "Tư vấn du học" for the contact request', adminHtml.includes('>Tư vấn du học<') && !adminHtml.includes('>san-pham-robot<'));
    check('admin shows "Workshop trải nghiệm STEM" for the new choice', adminHtml.includes('>Workshop trải nghiệm STEM<'));
    const lawn = (await (await db()).collection('products').findOne({ category: 'robot-cat-co' })).nameVi;
    const lawnRow = [...adminHtml.matchAll(/<tr data-id="[^"]+" data-search="([^"]*)"/g)].map((m) => m[1]).filter((x) => x.includes(`${MARK}-robot-cat-co`));
    check(`admin search text of a robot request includes the robot ("${lawn}")`, lawnRow.length === 1 && lawnRow[0].includes(lawn), lawnRow);
    // The robot's name sits with the category ("Quan tâm"), not with the message ("Nội dung")
    const rowHtml = adminHtml.slice(adminHtml.indexOf(`${MARK}-robot-cat-co`), adminHtml.indexOf('</tr>', adminHtml.indexOf(`${MARK}-robot-cat-co`)));
    const cell = (col) => (rowHtml.match(new RegExp(`data-col="${col}"[^>]*>([\\s\\S]*?)</td>`)) || [])[1] || '';
    check('admin: "Sản phẩm: …" is under the "Quan tâm" tag, not in "Nội dung"', cell('interest').includes('>Sản phẩm</dt>') && cell('interest').includes(`>${lawn}</dd>`) && !cell('message').includes('request-details'), { interest: cell('interest'), message: cell('message') });
  });

  await part(b, 'robot request form (browser)', async () => {
    await b.login(requester.sid);
    await b.nav('/san-pham/robot-leo-cau-thang?lang=vi', 300);
    await b.shot('robot-form-sidebar');
    const name = `${MARK}-browser`;
    await ev(`(() => { const f = document.querySelector('#yeu-cau form');
      f.elements.name.value = ${JSON.stringify(name)}; f.elements.phone.value = '0912345678'; f.elements.message.value = 'Báo giá robot leo cầu thang'; f.elements.agreePrivacy.checked = true; })()`);
    const l = b.waitLoad();
    await ev(`document.querySelector('#yeu-cau button[type=submit]').click()`);
    await l; await sleep(500);
    const s = await ev(`({ path: location.pathname + location.search + location.hash, success: !!document.querySelector('#yeu-cau [data-request-sent]'),
      formTop: Math.round(document.querySelector('#yeu-cau').getBoundingClientRect().top), scrollY: Math.round(scrollY) })`);
    check('lands back on the same robot page', s.path === '/san-pham/robot-leo-cau-thang?da-gui=1#yeu-cau', s.path);
    check('success message shown in the sidebar', s.success);
    check('page scrolled to the form (form just below the sticky header)', s.scrollY > 0 && s.formTop >= 76 && s.formTop < 400, s);
    const saved = await (await db()).collection('quoterequests').findOne({ name });
    check('saved with category san-pham-robot', saved && saved.interestedIn === 'san-pham-robot', saved && saved.interestedIn);
  });

  await part(b, 'requests need an account; the form starts from the profile', async () => {
    const col = (await db()).collection('quoterequests');
    const svc = await (await db()).collection('services').findOne({});
    const guest = (path, init = {}) => fetch(BASE + path, { redirect: 'manual', ...init, headers: { cookie: 'lang=vi', ...(init.headers || {}) } });
    // Logged out
    let r = await guest('/lien-he?quan_tam=workshop-stem');
    check('logged out: Liên hệ (every "Yêu cầu tư vấn" button) → the login page', r.status === 303 && r.headers.get('location') === '/dang-nhap?yeu-cau=1', { status: r.status, at: r.headers.get('location') });
    for (const lang of ['vi', 'en']) {
      const html = await (await fetch(`${BASE}/dang-nhap?yeu-cau=1`, { headers: { cookie: `lang=${lang}` } })).text();
      const note = (html.match(/data-need-login>([^<]*)</) || [])[1];
      check(`login page says why (${lang}): "${note}"`, note === (lang === 'vi' ? 'Xin hãy đăng nhập để yêu cầu tư vấn.' : 'Please log in to request a consultation.') && html.includes('href="/dang-ky?yeu-cau=1"'));
    }
    check('the plain login page has no such note', !(await (await fetch(`${BASE}/dang-nhap`)).text()).includes('data-need-login'));
    const sends = [['/lien-he', {}], ['/san-pham/robot-cat-co/yeu-cau', {}], [`/dich-vu/${svc.slug}/yeu-cau`, {}]];
    for (const [path] of sends) {
      r = await guest(path, { method: 'POST', body: new URLSearchParams({ name: `${MARK}-guest`, phone: '0912345678', message: 'x' }) });
      check(`logged out: sending ${path} → the login page`, r.status === 303 && r.headers.get('location') === '/dang-nhap?yeu-cau=1', r.status);
    }
    check('… and nothing was saved', (await col.countDocuments({ name: `${MARK}-guest` })) === 0);
    await b.nav('/san-pham/robot-cat-co', 300);
    const box = await ev(`(() => { const a = document.querySelector('#yeu-cau [data-login-needed]'); return { form: !!document.querySelector('[data-quote-form]'), box: !!a, text: a && a.textContent.replace(/\\s+/g, ' ').trim(), login: a && a.querySelector('a.btn').getAttribute('href'), register: a && a.querySelector('.login-needed-alt a').getAttribute('href') }; })()`);
    check('logged out: the robot page shows a login box instead of the form', !box.form && box.box && /Bạn cần đăng nhập để gửi yêu cầu tư vấn/.test(box.text) && box.login === '/dang-nhap?yeu-cau=1' && box.register === '/dang-ky?yeu-cau=1', box);
    await b.shot('robot-login-box');
    await b.nav(`/dich-vu/${svc.slug}`, 300);
    check('logged out: the Dịch vụ page too', await ev(`!document.querySelector('[data-quote-form]') && !!document.querySelector('#yeu-cau [data-login-needed]')`));
    let l = b.waitLoad(); await ev(`document.querySelector('#yeu-cau [data-login-needed] a.btn').click()`); await l; await sleep(200);
    check('its button opens the login page with the note', await ev(`location.pathname === '/dang-nhap' && !!document.querySelector('[data-need-login]')`));
    await b.nav('/giai-phap/workshop', 300);
    l = b.waitLoad(); await ev(`document.querySelector('.next-steps .cta-band-btn').click()`); await l; await sleep(200);
    check('a "Đăng ký workshop" / "Yêu cầu tư vấn" button while logged out → the login page with the note', await ev(`location.pathname === '/dang-nhap' && !!document.querySelector('[data-need-login]')`));
    // Logged in: every form starts from the profile, still editable
    await b.login(requester.sid);
    const filled = () => ev(`(() => { const f = document.querySelector('[data-quote-form]'); return { name: f.elements.name.value, email: f.elements.email.value, phone: f.elements.phone.value, schoolOrCompany: f.elements.schoolOrCompany.value, locked: [...f.elements].some((e) => e.readOnly || e.disabled) }; })()`);
    for (const path of ['/lien-he', '/san-pham/robot-cat-co', `/dich-vu/${svc.slug}`]) {
      await b.nav(path, 300);
      const v = await filled();
      check(`logged in: ${path} opens with the profile filled in (name, email, phone, organisation), nothing locked`, JSON.stringify({ ...v, locked: undefined }) === JSON.stringify({ ...PROFILE, locked: undefined }) && !v.locked, v);
    }
    await b.nav('/lien-he', 300);
    await ev(`(() => { const f = document.querySelector('[data-quote-form]'); f.elements.name.value = '${MARK}-own'; f.elements.email.value = 'other.zz@example.com'; f.elements.message.value = 'Email khác'; f.elements.agreePrivacy.checked = true; })()`);
    l = b.waitLoad(); await ev(`document.querySelector('[data-quote-form] button[type=submit]').click()`); await l; await sleep(200);
    const own = await col.findOne({ name: `${MARK}-own` });
    check('a changed email is sent as typed (and the request belongs to the account)', own && own.email === 'other.zz@example.com' && own.phone === PROFILE.phone && String(own.user) === String(requester.id), own && { email: own.email, phone: own.phone });
    await b.shot('contact-prefilled');
  });

  await part(b, 'changing a sent request ("Yêu cầu của tôi" → Sửa)', async () => {
    const col = (await db()).collection('quoterequests');
    const other = await createUser('other-customer', 'customer');
    const as = (who) => ({ cookie: `lang=vi; connect.sid=${who.sid}` });
    const get = async (path, who = requester) => { const r = await fetch(BASE + path, { redirect: 'manual', headers: as(who) }); return { status: r.status, at: r.headers.get('location'), html: await r.text() }; };
    const post = async (path, fields, who = requester) => { const r = await fetch(BASE + path, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ agreePrivacy: '1', ...fields }), headers: as(who) }); return { status: r.status, at: r.headers.get('location'), html: await r.text() }; };

    const NAME = `${MARK}-edit`;
    await post('/lien-he', { name: NAME, phone: '0912345678', email: '', message: 'Nội dung cũ', interestedIn: 'workshop-stem' });
    const sent = await col.findOne({ name: NAME });
    const EDIT = `/tai-khoan/yeu-cau/${sent._id}/sua`;
    let r = await get('/tai-khoan');
    check('"Yêu cầu của tôi": a "Sửa" button for the new ("Mới") request', r.html.includes(`href="${EDIT}" data-edit-request`));

    r = await get(EDIT);
    check('the edit page: the Liên hệ form filled with the request', r.status === 200 && r.html.includes(`action="${EDIT}"`) && r.html.includes(`value="${NAME}"`) && r.html.includes('>Nội dung cũ</textarea>')
      && /<option value="workshop-stem" selected>/.test(r.html) && />Cập nhật yêu cầu<\/button>/.test(r.html) && r.html.includes('href="/tai-khoan">Hủy</a>') && r.html.includes('data-back>&larr; Quay lại'));
    check('… the consent tick starts ticked (given when the request was sent)', /id="qf-agree" name="agreePrivacy" value="1"\s+checked>/.test(r.html));

    r = await post(EDIT, { name: NAME, phone: '0912345678', message: '   ', interestedIn: 'workshop-stem' });
    check('an empty message is refused like a new request (400, values kept, nothing saved)', r.status === 400 && r.html.includes('data-error-for="message"') && r.html.includes(`value="${NAME}"`)
      && (await col.findOne({ _id: sent._id })).message === 'Nội dung cũ', r.status);

    r = await post(EDIT, { name: NAME, phone: '0912345678', schoolOrCompany: 'ZZ Trường Mới', message: 'Nội dung mới', interestedIn: 'dao-tao-stem' });
    let saved = await col.findOne({ _id: sent._id });
    check('a good change: 303 back to "Yêu cầu của tôi"', r.status === 303 && r.at === `/tai-khoan?da-sua=${sent._id}`, r);
    check('… saved: new message, organisation and category, "edited" time set, still the same account', saved.message === 'Nội dung mới' && saved.schoolOrCompany === 'ZZ Trường Mới' && saved.interestedIn === 'dao-tao-stem'
      && saved.editedAt && Date.now() - new Date(saved.editedAt) < 60000 && String(saved.user) === String(requester.id) && saved.status === 'moi', saved);
    r = await get(r.at);
    check('… "Đã cập nhật yêu cầu.", that row highlighted, "Đã sửa" under its date', r.html.includes('Đã cập nhật yêu cầu.') && r.html.includes(`data-request-id="${sent._id}" class="is-just-edited"`) && r.html.includes('>Đã sửa</span>'));

    // A robot request keeps its category and its "Sản phẩm" line
    const robotReq = await col.findOne({ name: `${MARK}-robot-cat-co` });
    r = await get(`/tai-khoan/yeu-cau/${robotReq._id}/sua`);
    check('robot request: its "Sản phẩm" line shown read only, no category list', r.html.includes('data-request-fixed') && r.html.includes('>Sản phẩm</dt>') && !r.html.includes('name="interestedIn"'));
    r = await post(`/tai-khoan/yeu-cau/${robotReq._id}/sua`, { name: robotReq.name, phone: '0912345678', message: 'Đổi nội dung', interestedIn: 'khac' });
    saved = await col.findOne({ _id: robotReq._id });
    check('… changing it keeps san-pham-robot and the robot line (even with interestedIn=khac sent)', r.status === 303 && saved.message === 'Đổi nội dung' && saved.interestedIn === 'san-pham-robot' && JSON.stringify(saved.details) === JSON.stringify(robotReq.details), saved);

    // Only the sender
    r = await get(EDIT, other);
    check('another customer: the edit page is "not found"', r.status === 404);
    r = await post(EDIT, { name: 'ZZ hijack', phone: '0912345678', message: 'hijack' }, other);
    check('… and their change is refused, nothing saved', r.status === 404 && (await col.findOne({ _id: sent._id })).message === 'Nội dung mới');
    check('a wrong address is "not found" too', (await get('/tai-khoan/yeu-cau/not-an-id/sua')).status === 404);
    const guest = await fetch(BASE + EDIT, { redirect: 'manual' });
    check('logged out: to the login page', guest.status === 302 && guest.headers.get('location') === '/dang-nhap', guest.status);

    // Staff mark it "Đã liên hệ": locked
    await col.updateOne({ _id: sent._id }, { $set: { status: 'da_lien_he' } });
    r = await get('/tai-khoan');
    check('once staff act on it: no "Sửa", "Đang xử lý" instead', !r.html.includes(`href="${EDIT}"`) && /data-request-id="[^"]+"[^>]*>[\s\S]*?data-request-in-progress>Đang xử lý/.test(r.html));
    r = await get(EDIT);
    check('… its edit page sends you back with the reason', r.status === 303 && r.at === '/tai-khoan?khoa=1');
    r = await post(EDIT, { name: NAME, phone: '0912345678', message: 'Quá muộn' });
    check('… a change sent anyway is refused', r.status === 303 && r.at === '/tai-khoan?khoa=1' && (await col.findOne({ _id: sent._id })).message === 'Nội dung mới');
    check('… and the list says why', (await get('/tai-khoan?khoa=1')).html.includes('đang được MTG xử lý nên không sửa được nữa'));
    // "Hoàn tất": the row says "Đã xử lý", not "Đang xử lý"
    await col.updateOne({ _id: sent._id }, { $set: { status: 'hoan_tat' } });
    r = await get('/tai-khoan');
    const doneRow = r.html.slice(r.html.indexOf(`data-request-id="${sent._id}"`), r.html.indexOf('</tr>', r.html.indexOf(`data-request-id="${sent._id}"`)));
    check('a "Hoàn tất" request: "Đã xử lý" (not "Đang xử lý"), no "Sửa"', doneRow.includes('data-request-done>Đã xử lý<') && !doneRow.includes('Đang xử lý') && !doneRow.includes('data-edit-request'), doneRow.slice(-300));
    r = await get(EDIT);
    check('… and its edit page still sends you back', r.status === 303 && r.at === '/tai-khoan?khoa=1');

    // Staff see "Đã sửa lúc …"
    const requests = await col.find({ name: { $regex: '^' + MARK } }).sort({ createdAt: -1 }).toArray();
    const adminHtml = await ejs.renderFile(`${ROOT}views/admin/requests.ejs`, { requests, statusFilter: '', statuses: ['moi', 'da_lien_he', 'hoan_tat'], active: 'yeu-cau', user: { name: 'Admin' }, lang: 'vi', theme: 'light', t: makeTranslator('vi'), adminLangUrl: () => '#', flash: null, isProductLine, cspNonce: 'test', asset: (u) => u }, { root: `${ROOT}views` });
    check('admin list: "Đã sửa lúc HH:MM dd/mm" on the changed requests (2)', (adminHtml.match(/data-edited-at title="[^"]+">Đã sửa lúc \d{2}:\d{2} \d{2}\/\d{2}</g) || []).length === 2);

    // In the browser
    await b.login(requester.sid);
    await b.nav('/tai-khoan', 300);
    await b.shot('my-requests-edit');
    await b.nav(`/tai-khoan/yeu-cau/${robotReq._id}/sua`, 300);
    check('edit page in the browser: form ready, "Cập nhật yêu cầu" next to "Hủy"', await ev(`!!document.querySelector('[data-quote-form] .form-actions-row .btn-primary') && document.querySelector('[data-quote-form] [name=message]').value === 'Đổi nội dung'`));
    await b.shot('request-edit');
  });

  await part(b, 'message limit (3,000 characters) and a form too big for the server', async () => {
    const col = (await db()).collection('quoterequests');
    const post = async (path, fields, extra = {}) => {
      const r = await fetch(BASE + path, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ agreePrivacy: '1', ...fields }), headers: { ...asRequester(), ...extra } });
      return { status: r.status, at: r.headers.get('location'), html: await r.text() };
    };
    const form = await (await fetch(BASE + '/lien-he', { headers: asRequester() })).text();
    check('the message box stops at 3,000 characters and shows a "0/3000" counter',
      /<textarea[^>]*name="message"[^>]*maxlength="3000"[^>]*data-count="qf-messageCount"/.test(form) && /<span id="qf-messageCount">0<\/span>\/3000/.test(form));

    const exact = await post('/lien-he', { name: `${MARK}-max`, phone: '0912345678', message: 'á'.repeat(2999) + '\r\n', interestedIn: 'khac' });
    check('3,000 characters (a line break counted once, as the box does) are accepted', exact.status === 303 && !!(await col.findOne({ name: `${MARK}-max` })), exact.status);
    const over = await post('/lien-he', { name: `${MARK}-over`, phone: '0912345678', message: 'b'.repeat(3001), interestedIn: 'khac' });
    check('3,001 characters: refused with the reason under the box, the text kept, nothing saved',
      over.status === 400 && /data-error-for="message">Nội dung tối đa 3\.000 ký tự/.test(over.html) && over.html.includes('b'.repeat(3001) + '</textarea>') && !(await col.findOne({ name: `${MARK}-over` })), over.status);
    const robot = await post('/san-pham/robot-cat-co/yeu-cau', { name: `${MARK}-over-robot`, phone: '0912345678', message: 'c'.repeat(3001) });
    check('… the same limit on a robot page', robot.status === 400 && !(await col.findOne({ name: `${MARK}-over-robot` })), robot.status);
    const sent = await col.findOne({ name: `${MARK}-max` });
    const edit = await post(`/tai-khoan/yeu-cau/${sent._id}/sua`, { name: `${MARK}-max`, phone: '0912345678', message: 'd'.repeat(3001), interestedIn: 'khac' });
    check('… and when changing a sent request', edit.status === 400 && (await col.findOne({ _id: sent._id })).message.startsWith('á'), edit.status);

    const huge = await post('/lien-he', { name: `${MARK}-huge`, phone: '0912345678', message: 'e'.repeat(200000), interestedIn: 'khac' }, { referer: `${BASE}/lien-he` });
    check('200,000 characters: 413 with "Nội dung gửi quá dài", not the general error page',
      huge.status === 413 && /<h1>Nội dung gửi quá dài<\/h1>/.test(huge.html) && !/Đã có lỗi xảy ra/.test(huge.html) && !(await col.findOne({ name: `${MARK}-huge` })), huge.status);
    check('… with "← Quay lại" to the form it came from (the browser steps back, keeping the typed text)', /<a class="btn btn-primary" href="\/lien-he" data-history-back>← Quay lại<\/a>/.test(huge.html));
    const outside = await post('/lien-he', { message: 'e'.repeat(200000) }, { referer: 'https://example.com/x' });
    check('… never back to another website', /href="\/" data-history-back/.test(outside.html));
    const en = await fetch(BASE + '/lien-he', { method: 'POST', body: new URLSearchParams({ message: 'e'.repeat(200000) }), headers: asRequester('en') });
    check('… in English on the English site', en.status === 413 && /<h1>What you sent is too long<\/h1>/.test(await en.text()));

    // In the browser: the counter follows the typing
    await b.login(requester.sid);
    await b.nav('/lien-he', 200);
    await ev(`document.querySelector('[data-quote-form] [name=message]').focus()`);
    await send('Input.insertText', { text: 'Xin chào MTG' });
    check('the counter follows the typing (12/3000)', (await ev(`document.getElementById('qf-messageCount').textContent`)) === '12');
  });

  await part(b, 'choice boxes slide open; Dịch vụ questions slide (Liên hệ, Dịch vụ pages)', async () => {
    await b.login(requester.sid);
    await b.nav('/lien-he?lang=vi', 300);
    const SEL = '[data-quote-form] select[name=interestedIn]';
    const boxState = () => ev(`(() => {
      const sel = document.querySelector('${SEL}'); const box = sel.closest('.choice-box'); const btn = box.querySelector('.choice-box-button'); const list = box.querySelector('.choice-box-list');
      const act = list.querySelector('.is-active'); const lr = list.getBoundingClientRect(); const br = btn.getBoundingClientRect();
      return { value: sel.value, text: btn.textContent.trim(), expanded: btn.getAttribute('aria-expanded'), hidden: list.hidden, opacity: +getComputedStyle(list).opacity,
        below: lr.top >= br.bottom, focus: document.activeElement === btn, active: act && act.textContent, chosen: (list.querySelector('[aria-selected=true]') || {}).textContent }; })()`);
    const look = await ev(`(() => {
      const sel = document.querySelector('${SEL}'); const btn = sel.closest('.choice-box').querySelector('.choice-box-button'); const list = btn.nextElementSibling;
      const other = document.querySelector('[data-quote-form] [name=email]');
      return { selHidden: +getComputedStyle(sel).opacity === 0 && sel.tabIndex === -1, role: btn.getAttribute('role'), named: (btn.getAttribute('aria-labelledby') || '').split(' ').every((id) => document.getElementById(id)),
        h: Math.round(btn.getBoundingClientRect().height), otherH: Math.round(other.getBoundingClientRect().height), font: getComputedStyle(btn).fontFamily === getComputedStyle(other).fontFamily,
        groups: [...list.querySelectorAll('.choice-box-group')].map((g) => g.textContent), rows: list.querySelectorAll('[role=option]').length, options: sel.options.length }; })()`);
    check('Liên hệ "Bạn quan tâm đến": a box over the real (hidden) list, same height and font as the other boxes, named by its label',
      look.selHidden && look.role === 'combobox' && look.named && Math.abs(look.h - look.otherH) <= 2 && look.font, look);
    check('… its list has the same options, under the group headings', look.rows === look.options && JSON.stringify(look.groups) === JSON.stringify(['Giải pháp STEM', 'Sản phẩm', 'Dịch vụ']), look);
    let st = await boxState();
    check('… closed, showing the chosen "Khác"', st.hidden && st.expanded === 'false' && st.text === 'Khác' && st.value === 'khac', st);
    await b.clickAt(`${SEL} ~ .choice-box-button`); await sleep(40);
    const mid = await boxState(); await sleep(500); st = await boxState();
    check('a click opens the list under the box, fading in (not at once)', !mid.hidden && mid.opacity > 0 && mid.opacity < 1 && st.opacity === 1 && st.expanded === 'true' && st.below && st.active === 'Khác', { mid, st });
    await b.shot('choice-box-open');
    // Clicks the option of the open list with this text
    const clickOption = async (text) => { const p = await ev(`(() => { const o = [...document.querySelectorAll('.choice-box-list:not([hidden]) [role=option]')].find((x) => x.textContent === ${JSON.stringify(text)}); o.scrollIntoView({ block: 'nearest' }); const r = o.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await b.mouse('mouseMoved', p); await b.mouse('mousePressed', p, { button: 'left', clickCount: 1 }); await b.mouse('mouseReleased', p, { button: 'left', clickCount: 1 }); };
    await clickOption('Workshop trải nghiệm STEM');
    const picked = await ev(`document.querySelectorAll('${SEL} option')[2].textContent`);
    await sleep(40); const closing = await boxState(); await sleep(500); st = await boxState();
    check('clicking an option chooses it (the real list too) and the list fades out, focus stays on the box',
      st.value === 'workshop-stem' && st.text === picked && picked === 'Workshop trải nghiệm STEM' && !closing.hidden && closing.opacity < 1 && st.hidden && st.focus, { closing, st });
    await b.key('ArrowDown', 'ArrowDown', 40); await sleep(450); st = await boxState();
    check('keyboard: ↓ opens it at the chosen option', st.expanded === 'true' && st.active === 'Workshop trải nghiệm STEM', st);
    await b.key('ArrowDown', 'ArrowDown', 40); await b.key('Enter', 'Enter', 13); await sleep(450); st = await boxState();
    check('… ↓ then Enter chooses the next one and closes', st.value === 'dao-tao-stem' && st.hidden, st);
    await b.key('ArrowDown', 'ArrowDown', 40); await b.key('ArrowDown', 'ArrowDown', 40); await b.key('Escape', 'Escape', 27); await sleep(450); st = await boxState();
    check('… Esc closes without changing it', st.value === 'dao-tao-stem' && st.hidden && st.focus, st);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', text: 'k' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK' }); await sleep(100); st = await boxState();
    check('… typing a letter jumps to the option starting with it ("k" → Khác)', st.value === 'khac' && st.hidden, st);
    await b.clickAt(`${SEL} ~ .choice-box-button`); await sleep(450);
    await b.mouse('mousePressed', { x: 5, y: 300 }, { button: 'left', clickCount: 1 }); await b.mouse('mouseReleased', { x: 5, y: 300 }, { button: 'left', clickCount: 1 }); await sleep(450); st = await boxState();
    check('a click outside closes it', st.hidden && st.expanded === 'false', st);
    await b.reducedMotion();
    await b.clickAt(`${SEL} ~ .choice-box-button`); await sleep(30);
    const rmMid = await boxState(); await sleep(350); const rmEnd = await boxState();
    check('reduced motion: it still fades, just quicker', rmMid.opacity < 1 && rmEnd.opacity === 1, { rmMid, rmEnd });
    await b.key('Escape', 'Escape', 27); await b.reducedMotion(false); await sleep(300);
    // Sent with the box's choice
    await ev(`(() => { const f = document.querySelector('[data-quote-form]'); f.elements.name.value = ${JSON.stringify(MARK + '-choice')}; f.elements.message.value = 'Chọn qua hộp'; f.elements.agreePrivacy.checked = true; })()`);
    await b.clickAt(`${SEL} ~ .choice-box-button`); await sleep(450);
    await clickOption('Tư vấn, thiết kế & triển khai phòng Lab STEM'); await sleep(450);
    { const l = b.waitLoad(); await ev(`document.querySelector('[data-quote-form] button[type=submit]').click()`); await l; await sleep(200); }
    const sent = await (await db()).collection('quoterequests').findOne({ name: MARK + '-choice' });
    check('the request is saved with the option chosen in the box', sent && sent.interestedIn === 'giai-phap-stem-lab', sent && sent.interestedIn);
    // Dark mode: the list keeps the dark card colours
    await b.setCookie('theme', 'dark');
    await b.nav('/lien-he?lang=vi', 300);
    await b.clickAt(`${SEL} ~ .choice-box-button`); await sleep(450);
    const dark = await ev(`(() => { const list = document.querySelector('.choice-box-list'); const o = list.querySelector('[role=option]');
      const lum = (c) => { const [r, g, b] = c.match(/\\d+/g).map(Number).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
      const bg = getComputedStyle(list).backgroundColor; const fg = getComputedStyle(o).color; const a = lum(bg), c = lum(fg);
      return { bg, fg, ratio: +((Math.max(a, c) + .05) / (Math.min(a, c) + .05)).toFixed(2) }; })()`);
    check('dark mode: a dark list with readable options', dark.ratio >= 4.5 && dark.bg !== 'rgb(255, 255, 255)', dark);
    await b.shot('choice-box-dark');
    await b.key('Escape', 'Escape', 27);
    await b.setCookie('theme', 'light');

    // A Dịch vụ page with packages, a required choice question and questions (FAQ), on a service put back afterwards
    const services = (await db()).collection('services');
    const svc = await services.findOne({ slug: 'tu-van-du-hoc' }) || await services.findOne({});
    await restoreLater('services', { _id: svc._id });
    await services.updateOne({ _id: svc._id }, { $set: {
      packages: [{ nameVi: 'ZZ Gói A', nameEn: 'ZZ Package A', featuresVi: ['Một'], featuresEn: ['One'], highlighted: false }, { nameVi: 'ZZ Gói B', nameEn: 'ZZ Package B', featuresVi: ['Hai'], featuresEn: ['Two'], highlighted: true }],
      questions: [{ key: 'zzcountry', labelVi: 'ZZ Quốc gia', labelEn: 'ZZ Country', type: 'choice', options: [{ vi: 'Úc', en: 'Australia' }, { vi: 'Nhật Bản', en: 'Japan' }], required: true }],
      faqs: [{ questionVi: 'ZZ Câu hỏi một?', questionEn: 'ZZ Question one?', answerVi: 'ZZ Trả lời một.\n\nĐoạn thứ hai của câu trả lời.', answerEn: 'ZZ Answer one.' }],
    } });
    await b.nav(`/dich-vu/${svc.slug}?lang=vi`, 300);
    const boxes = await ev(`[...document.querySelectorAll('[data-quote-form] .choice-box')].map((x) => x.querySelector('select').name)`);
    check(`Dịch vụ page (${svc.slug}): the package and its own question are choice boxes`, ['q__package', 'q_zzcountry'].every((n) => boxes.includes(n)), boxes);
    // Real clicks: focus only moves while the page has the focus, as it does for a visitor
    await b.clickAt('[data-choose-package]'); await ev(`document.querySelectorAll('[data-choose-package]')[1].click()`); await sleep(300);
    const pkg = await ev(`(() => { const s = document.getElementById('q__package'); const btn = s.closest('.choice-box').querySelector('.choice-box-button'); return { value: s.value, text: btn.textContent.trim(), focus: document.activeElement === btn }; })()`);
    check('"Chọn gói này" shows the package in its box and puts the focus there', pkg.value === '1' && pkg.text === 'ZZ Gói B' && pkg.focus, pkg);
    await ev(`(() => { const f = document.querySelector('[data-quote-form]'); f.elements.name.value = 'ZZ'; f.elements.phone.value = '0912345678'; f.elements.message.value = 'x'; })()`);
    await b.clickAt('[data-quote-form] button[type=submit]'); await sleep(300);
    const req = await ev(`(() => { const s = document.getElementById('q_zzcountry'); const btn = s.closest('.choice-box').querySelector('.choice-box-button');
      return { invalid: s.classList.contains('is-invalid'), border: getComputedStyle(btn).borderTopColor, focus: document.activeElement === btn, error: (s.closest('.form-group').querySelector('[data-error-for=q_zzcountry]') || {}).textContent, inBox: !!s.closest('.choice-box').querySelector('.field-error') }; })()`);
    check('a required question left empty: its box turns red, gets the focus, the message shows under it', req.invalid && req.border === 'rgb(192, 57, 43)' && req.focus && !!req.error && !req.inBox, req);
    await b.key('ArrowDown', 'ArrowDown', 40); await b.key('ArrowDown', 'ArrowDown', 40); await b.key('Enter', 'Enter', 13); await sleep(450);
    const fixed = await ev(`(() => { const s = document.getElementById('q_zzcountry'); return { value: s.value, invalid: s.classList.contains('is-invalid'), error: !!s.closest('.form-group').querySelector('[data-error-for=q_zzcountry]') }; })()`);
    check('… choosing an answer clears the red box and the message', fixed.value === '0' && !fixed.invalid && !fixed.error, fixed);
    // The questions (FAQ) slide open and shut
    const faq = () => ev(`(() => { const d = document.querySelector('.faq-item'); const a = d.querySelector('.prose-text'); return { open: d.open, h: Math.round(a.getBoundingClientRect().height), full: a.scrollHeight, seen: a.checkVisibility() }; })()`);
    await b.clickAt('.faq-item summary'); await sleep(90);
    const fMid = await faq(); await sleep(500); const fEnd = await faq();
    check('a question (FAQ) slides open: part way after a moment, then the whole answer', fMid.open && fMid.h > 0 && fMid.h < fEnd.h && fEnd.h === fEnd.full, { fMid, fEnd });
    await b.clickAt('.faq-item summary'); await sleep(90);
    const fShut = await faq(); await sleep(500); const fGone = await faq();
    check('… and slides shut, leaving nothing showing', fShut.open && fShut.h < fEnd.h && fShut.h > 0 && !fGone.open && !fGone.seen, { fShut, fGone });
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
