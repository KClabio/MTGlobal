// Request emails (lib/request-mail.js): the staff list in Admin → Cài đặt chung → "Email thông báo", the staff email
// for each new or changed request (Reply-To the sender, "Xem trong trang quản trị" + "Xác nhận yêu cầu"), and the
// sender's confirmation, sent only when staff confirm on Admin → Yêu cầu → Xác nhận: in the request's language, no
// typed text, the request then "Đã liên hệ". tests/run.mjs writes the emails to tests/output/mail instead of sending them.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { suite, part, check, db, BASE, ROOT, createUser, removeLater, restoreLater, stamp, sleep, sidClient, twoStepCode } from './lib/index.mjs';

const MAIL_DIR = path.join(ROOT, 'tests', 'output', 'mail');

await suite(async (b) => {
  const { ev } = b;
  const d = await db();
  const MARK = `ZZTEST-mail-${stamp}`;
  const STAFF = [`zzstaff1-${stamp}@example.com`, `zzstaff2-${stamp}@example.com`];
  const SENDER = `zzsender-${stamp}@example.com`;
  removeLater('quoterequests', { name: { $regex: '^' + MARK } });
  removeLater('loginthrottles', { _id: { $regex: '^(request-ip|confirm-to):' } });
  await d.collection('loginthrottles').deleteMany({ _id: { $regex: '^request-ip:' } }); // guests may send 5 an hour
  const [settingsBackup] = await restoreLater('sitesettings', {});
  const admin = await createUser('mail-admin');
  const customer = await createUser('mail-customer', 'customer');
  const asAdmin = { cookie: `connect.sid=${admin.sid}; adminLang=vi` };

  // Every email of this run that mentions `text` (in its address list, subject or body)
  const mails = () => (existsSync(MAIL_DIR) ? readdirSync(MAIL_DIR) : []).map((f) => JSON.parse(readFileSync(path.join(MAIL_DIR, f), 'utf8')));
  const addresses = (list) => (list || []).map((a) => a.address);
  const waitMails = async (fn, n = 1) => { let found = []; for (let i = 0; i < 40; i++) { found = mails().filter(fn); if (found.length >= n) break; await sleep(100); } await sleep(200); return mails().filter(fn); };
  const toStaff = (m) => addresses(m.to).includes(STAFF[0]);
  const toSender = (m) => addresses(m.to).includes(SENDER);
  const saveEmails = (text) => fetch(BASE + '/admin/cai-dat', { method: 'POST', redirect: 'manual', headers: asAdmin, body: new URLSearchParams({ tab: 'email', requestEmails: text }) });
  const send = (path, fields, headers = { cookie: 'lang=vi' }) => fetch(BASE + path, { method: 'POST', redirect: 'manual', headers, body: new URLSearchParams({ agreePrivacy: '1', phone: '0912345678', ...fields }) });
  // Admin → Yêu cầu → Xác nhận (the "Xác nhận yêu cầu" button of the staff email)
  const confirmPath = (id) => `/admin/yeu-cau/${id}/xac-nhan`;
  const confirmAs = (id, headers = asAdmin) => fetch(BASE + confirmPath(id), { method: 'POST', redirect: 'manual', headers });
  const getAs = async (path, headers) => { const r = await fetch(BASE + path, { redirect: 'manual', headers }); return { status: r.status, location: r.headers.get('location'), text: await r.text() }; };
  const errorCount = async () => (await d.collection('errorlogs').find({}).project({ count: 1 }).toArray()).reduce((n, e) => n + (e.count || 0), 0);
  const requestNamed = (name) => d.collection('quoterequests').findOne({ name });

  try {
    await part(b, 'Cài đặt chung → Email thông báo', async () => {
      await b.login(admin.sid);
      await b.setCookie('adminLang', 'vi');
      await b.nav('/admin/cai-dat?tab=email', 300);
      const tab = await ev(`(() => { const p = document.querySelector('#panel-email'); const box = document.querySelector('#requestEmails'); return { shown: !!p && !p.hidden, label: document.querySelector('label[for="requestEmails"]').textContent.trim(), box: !!box, off: !!document.querySelector('[data-mail-off]'), tab: document.querySelector('#tab-email').textContent.trim() }; })()`);
      check('the "Email thông báo" tab opens with the "Email nhận yêu cầu mới" box', tab.shown && tab.box && tab.tab === 'Email thông báo' && tab.label === 'Email nhận yêu cầu mới', tab);
      check('… no "no email account" warning when the server can send email', !tab.off);
      let r = await saveEmails(`${STAFF[0]}\nkhong-phai-email`);
      let html = await r.text();
      check('a wrong address → 400 "“khong-phai-email” không phải là địa chỉ email hợp lệ.", on the Email tab, typed text kept, nothing saved',
        r.status === 400 && html.includes('“khong-phai-email” không phải là địa chỉ email hợp lệ.') && /id="panel-email"[^>]*>(?![^<]*hidden)/.test(html) && html.includes('khong-phai-email</textarea>')
        && JSON.stringify((await d.collection('sitesettings').findOne({})).requestEmails || []) === JSON.stringify(settingsBackup.requestEmails || []), r.status);
      r = await saveEmails(Array.from({ length: 11 }, (_, i) => `zz${i}@example.com`).join('\n'));
      check('more than 10 addresses → 400 "Tối đa 10 địa chỉ email."', r.status === 400 && (await r.text()).includes('Tối đa 10 địa chỉ email.'));
      r = await saveEmails(`${STAFF[0].toUpperCase()}\n${STAFF[1]}, ${STAFF[0]}`);
      const saved = (await d.collection('sitesettings').findOne({})).requestEmails;
      check('saved: one per line or comma, small letters, each once', r.status === 302 && r.headers.get('location') === '/admin/cai-dat?tab=email' && JSON.stringify(saved) === JSON.stringify(STAFF), saved);
      await b.nav('/admin/cai-dat?tab=email', 300);
      check('… shown again one per line', (await ev(`document.querySelector('#requestEmails').value`)) === STAFF.join('\n'));
      await b.shot('settings-email-tab');
    });

    await part(b, 'a new request: staff email and confirmation', async () => {
      const name = `${MARK}-guest`;
      const robot = await d.collection('products').findOne({ category: 'robot-cat-co' });
      const r = await send('/san-pham/robot-cat-co/yeu-cau', { name, email: SENDER, schoolOrCompany: 'ZZ Trường', message: `Báo giá ${MARK} <b>đậm</b>`, cameFrom: '/giai-phap' });
      check('sent (guest)', r.status === 303, r.status);
      const [staff] = await waitMails((m) => toStaff(m) && (m.subject || '').includes(name));
      check('one email to every staff address, subject "[MTG] Yêu cầu mới: <category> – <name>"', !!staff && JSON.stringify(addresses(staff.to)) === JSON.stringify(STAFF) && staff.subject === `[MTG] Yêu cầu mới: Sản phẩm Robot thông minh – ${name}`, staff && { to: staff.to, subject: staff.subject });
      check('… "Trả lời" answers the sender (Reply-To)', !!staff && JSON.stringify(addresses(staff.replyTo)) === JSON.stringify([SENDER]), staff && staff.replyTo);
      const text = (staff && staff.text) || '';
      check('… holds the whole request: contact, school, robot, message, page, "Khách", admin link',
        text.includes('Số điện thoại: 0912345678') && text.includes(`Email: ${SENDER}`) && text.includes('Trường / Đơn vị: ZZ Trường') && /Sản phẩm: .+/.test(text)
        && text.includes(`Báo giá ${MARK}`) && text.includes(`Gửi từ trang: Sản phẩm/${robot.nameVi}`) && text.includes('Tài khoản: Khách (không đăng nhập)') && text.includes(`${BASE}/admin/yeu-cau`), text);
      check('… no footer on the staff email (no "Bạn nhận email này…", no site link at the end)', !!staff && !(text + staff.html).includes('Bạn nhận email này') && !text.includes('\n--\n'), text.slice(-200));
      // The same email in the MTG layout (lib/mail-layout.js): typed text shown as text, never as HTML
      const html = (staff && staff.html) || '';
      check('… also as HTML in the MTG layout: "Yêu cầu mới" tag, title, the details table, a button to the admin list',
        html.includes('Yêu cầu tư vấn mới') && html.includes('>Yêu cầu mới<') && html.includes('ZZ Trường') && html.includes(`href="${BASE}/admin/yeu-cau"`) && html.includes('Xem trong trang quản trị'), html.slice(0, 300));
      check('… what the sender typed is shown as text: <b>đậm</b> arrives escaped', html.includes('&lt;b&gt;đậm&lt;/b&gt;') && !html.includes('<b>đậm'));
      const saved = await requestNamed(name);
      check('saved with the site\'s language (vi), not confirmed yet, "Mới"', !!saved && saved.lang === 'vi' && !saved.confirmedAt && saved.status === 'moi', saved && { lang: saved.lang, status: saved.status });
      check('… the staff email has two buttons: "Xem trong trang quản trị" and the green "Xác nhận yêu cầu" (this request\'s confirm page)',
        !!saved && html.includes(`href="${BASE}${confirmPath(saved._id)}"`) && html.includes('>Xác nhận yêu cầu<') && html.includes('background:#1e7b34')
        && text.includes(`Xác nhận yêu cầu: ${BASE}${confirmPath(saved._id)}`) && text.includes(`Xem trong trang quản trị: ${BASE}/admin/yeu-cau`), text);
      await sleep(600);
      check('nothing is emailed to the sender by itself (only once staff confirm)', mails().filter(toSender).length === 0, mails().filter(toSender).length);
    });

    await part(b, 'Xác nhận: from the staff email to the customer\'s email', async () => {
      const name = `${MARK}-guest`;
      const request = await requestNamed(name);
      const path = confirmPath(request._id);

      // Staff not logged in click the button in the email: login, two-step code, then straight back to the page
      const c = sidClient('');
      const first = await c.req(path);
      const login = await c.req('/dang-nhap', { method: 'POST', body: new URLSearchParams({ email: admin.email, password: admin.password }) });
      const code = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: new URLSearchParams({ code: twoStepCode(admin.twoStepSecret) }) });
      const back = await c.req(path);
      check('logged out → login → two-step code → back on this request\'s confirm page',
        first.status === 302 && first.location === '/dang-nhap' && login.status === 303 && login.location === '/dang-nhap/xac-minh' && code.status === 303 && code.location === path
        && back.status === 200 && back.text.includes('data-rc-send'), { first: first.location, login: login.location, code: code.location, back: back.status });
      const customerLogin = sidClient('');
      await customerLogin.req(path);
      const asCust = await customerLogin.req('/dang-nhap', { method: 'POST', body: new URLSearchParams({ email: customer.email, password: customer.password }) });
      check('… a customer logging in from that link lands on Trang chủ, not on the admin page', asCust.status === 303 && asCust.location === '/', asCust.location);

      // The page: the request, the page it came from, the email that will go out (subject, language, text)
      const robot = await d.collection('products').findOne({ category: 'robot-cat-co' });
      await b.login(admin.sid); // each part starts with a fresh browser
      await b.setCookie('adminLang', 'vi');
      await b.nav(path, 300);
      const view = await ev(`(() => { const q = (s) => document.querySelector(s); return { h1: q('h1').textContent.trim(), name: q('[data-rc-name]').textContent, page: q('[data-rc-page]').textContent, status: q('[data-rc-status]').textContent, subject: q('[data-rc-subject]').textContent, lang: q('[data-rc-lang]').dataset.rcLang, text: q('[data-rc-text]').textContent, send: q('[data-rc-send]').textContent.trim(), disabled: q('[data-rc-send]').disabled, done: !!q('[data-confirmed]') }; })()`);
      check('the confirm page shows the request, "Sản phẩm/<robot>", "Mới", and the Vietnamese email it will send',
        view.h1 === 'Xác nhận yêu cầu' && view.name === name && view.page === `Sản phẩm/${robot.nameVi}` && view.status === 'Mới' && view.subject === 'MTG đã nhận được yêu cầu tư vấn của bạn'
        && view.lang === 'vi' && view.text.startsWith('Xin chào,') && !view.text.includes(MARK) && view.send === 'Gửi email xác nhận' && !view.disabled && !view.done, view);
      await b.shot('request-confirm');
      check('… opening the page sent nothing', mails().filter(toSender).length === 0);

      // Send: the customer's email, the request "Đã liên hệ", who and when; a green notice on Admin → Yêu cầu
      const errorsBefore = await errorCount();
      await b.clickAndWait('[data-rc-send]', 400);
      const after = await ev(`({ path: location.pathname, toast: (document.getElementById('adminToast') || {}).dataset.text || '' })`);
      check('"Gửi email xác nhận" → back on Admin → Yêu cầu: "Đã gửi email xác nhận đến … Yêu cầu chuyển sang “Đã liên hệ”."',
        after.path === '/admin/yeu-cau' && after.toast === `Đã gửi email xác nhận đến ${SENDER}. Yêu cầu chuyển sang “Đã liên hệ”.`, after);
      const confirmed = await requestNamed(name);
      check('… the request is "Đã liên hệ", with when and by whom', confirmed.status === 'da_lien_he' && !!confirmed.confirmedAt && String(confirmed.confirmedBy) === String(admin.id) && confirmed.confirmedByName === 'ZZ mail-admin', confirmed && { status: confirmed.status, by: confirmed.confirmedByName });
      const [mine] = await waitMails((m) => toSender(m));
      check('the sender gets "MTG đã nhận được yêu cầu tư vấn của bạn"', !!mine && mine.subject === 'MTG đã nhận được yêu cầu tư vấn của bạn' && /yêu cầu tư vấn về "Sản phẩm Robot thông minh" gửi lúc \d\d:\d\d \d\d\/\d\d\/\d{4}/.test(mine.text || ''), mine && mine.text);
      check('… with no text typed into the form (no name, school or message), and no Reply-To', !!mine && !mine.text.includes(MARK) && !mine.text.includes('ZZ Trường') && !mine.replyTo);
      const mineHtml = (mine && mine.html) || '';
      check('… its HTML: "Đã nhận yêu cầu" tag, thank-you title, a button to the website, still nothing typed into the form',
        mineHtml.includes('Đã nhận yêu cầu') && mineHtml.includes('Cảm ơn bạn đã liên hệ MTG') && mineHtml.includes(`href="${BASE}"`) && !mineHtml.includes(MARK) && !mineHtml.includes('ZZ Trường') && !mineHtml.includes('đậm'));
      check('… site in Vietnamese → all Vietnamese, ending "Email tự động từ MTG, vui lòng không trả lời lại email này."',
        !!mine && mineHtml.includes('lang="vi"') && mineHtml.includes('Xem website MTG') && mine.text.endsWith('Email tự động từ MTG, vui lòng không trả lời lại email này.')
        && mineHtml.includes('Email tự động từ MTG, vui lòng không trả lời lại email này.') && !/Request received|Thank you|Visit the|Hello|Kind regards|do not reply/.test(mine.text + mineHtml), mine && mine.text.slice(-200));

      // Opened again: when and by whom, and a "Gửi lại" that really sends again
      await b.nav(path, 300);
      const again = await ev(`({ done: (document.querySelector('[data-confirmed]') || {}).textContent || '', send: document.querySelector('[data-rc-send]').textContent.trim(), status: document.querySelector('[data-rc-status]').textContent })`);
      check('opened again → "Đã gửi email xác nhận lúc …, bởi ZZ mail-admin.", "Đã liên hệ", and "Gửi lại email xác nhận"',
        /^Đã gửi email xác nhận lúc \d\d:\d\d \d\d\/\d\d\/\d{4}, bởi ZZ mail-admin\.$/.test(again.done) && again.status === 'Đã liên hệ' && again.send === 'Gửi lại email xác nhận', again);
      const resend = await confirmAs(request._id);
      await waitMails((m) => toSender(m), 2);
      check('… "Gửi lại" sends the email once more, the status stays "Đã liên hệ"', resend.status === 302 && mails().filter(toSender).length === 2 && (await requestNamed(name)).status === 'da_lien_he', mails().filter(toSender).length);
      check('nothing reached the error log', (await errorCount()) === errorsBefore, (await errorCount()) - errorsBefore);
    });

    await part(b, 'English page, no email, a changed request', async () => {
      const other = `zzsender-en-${stamp}@example.com`;
      await send('/lien-he', { name: `${MARK}-en`, email: other, message: 'Hello', interestedIn: 'workshop-stem' }, { cookie: 'lang=en' });
      await waitMails((m) => toStaff(m) && (m.subject || '').includes(`${MARK}-en`));
      const enRequest = await requestNamed(`${MARK}-en`);
      check('sent from an English page → saved as English, nothing sent to the sender yet', !!enRequest && enRequest.lang === 'en' && !mails().some((m) => addresses(m.to).includes(other)), enRequest && enRequest.lang);
      const page = await getAs(confirmPath(enRequest._id), asAdmin);
      check('… its confirm page (admin in Vietnamese) says the email will be in English', page.status === 200 && page.text.includes('data-rc-lang="en"') && page.text.includes('Tiếng Anh') && page.text.includes('MTG has received your consultation request'), page.status);
      await confirmAs(enRequest._id);
      const [en] = await waitMails((m) => addresses(m.to).includes(other));
      check('… confirmed → the email is in English', !!en && en.subject === 'MTG has received your consultation request' && en.text.includes('about "Hands-on STEM workshops"'), en && en.subject);

      const before = mails().length;
      await send('/lien-he', { name: `${MARK}-noemail`, message: 'Chỉ có số điện thoại' });
      const sent = await waitMails((m) => (m.subject || '').includes(`${MARK}-noemail`));
      await sleep(300);
      check('no email given → the staff email only, without Reply-To', sent.length === 1 && !sent[0].replyTo && mails().length === before + 1, { staff: sent.length, all: mails().length - before });
      check('… sent from Liên hệ → "Gửi từ trang: Liên hệ"', !!sent[0] && sent[0].text.includes('Gửi từ trang: Liên hệ\n'), sent[0] && sent[0].text);
      check('… no "Xác nhận yêu cầu" button, but "Khách không để lại email: liên hệ qua số điện thoại."',
        !!sent[0] && !sent[0].html.includes('/xac-nhan') && !sent[0].text.includes('Xác nhận yêu cầu') && sent[0].text.includes('Khách không để lại email: liên hệ qua số điện thoại.'), sent[0] && sent[0].text);
      const noEmail = await requestNamed(`${MARK}-noemail`);
      const noEmailPage = await getAs(confirmPath(noEmail._id), asAdmin);
      check('… its confirm page explains there is no email, with no send button', noEmailPage.status === 200 && noEmailPage.text.includes('data-rc-no-email') && !noEmailPage.text.includes('data-rc-send'), noEmailPage.status);
      const mailsBefore = mails().length;
      const refused = await confirmAs(noEmail._id);
      await sleep(400);
      check('… sending anyway → back to the page, nothing sent, still "Mới"', refused.status === 302 && refused.headers.get('location') === confirmPath(noEmail._id) && mails().length === mailsBefore && (await requestNamed(`${MARK}-noemail`)).status === 'moi', refused.status);

      // A customer's own request, then changed by them: staff are told both times (with the confirm button), the sender never by itself
      const asCustomer = { cookie: `lang=vi; connect.sid=${customer.sid}` };
      const own = `zzsender-own-${stamp}@example.com`;
      await send('/lien-he', { name: `${MARK}-own`, email: own, message: 'Lần 1' }, asCustomer);
      await waitMails((m) => toStaff(m) && (m.subject || '').includes(`${MARK}-own`));
      const ownRequest = await requestNamed(`${MARK}-own`);
      check('… the account appears in the staff email', mails().some((m) => (m.subject || '').includes(`${MARK}-own`) && m.text.includes(`Tài khoản: ${customer.email}`)));
      const r = await send(`/tai-khoan/yeu-cau/${ownRequest._id}/sua`, { name: `${MARK}-own-changed`, email: own, message: 'Đã sửa', interestedIn: 'khac' }, asCustomer);
      const [changed] = await waitMails((m) => (m.subject || '').includes(`${MARK}-own-changed`));
      check('changing a sent request → staff get "[MTG] Yêu cầu đã sửa: …" with the "Xác nhận yêu cầu" button; the sender gets nothing',
        r.status === 303 && !!changed && changed.subject.startsWith('[MTG] Yêu cầu đã sửa:') && changed.text.startsWith('Người gửi vừa sửa lại') && changed.html.includes(`href="${BASE}${confirmPath(ownRequest._id)}"`)
        && !mails().some((m) => addresses(m.to).includes(own)), changed && changed.subject);
    });

    await part(b, 'language: the confirmation follows the VI / EN switch, staff always get Vietnamese; page names', async () => {
      // As the customer (accounts have no hourly limit), so the guest requests above keep their own count
      const robot = await d.collection('products').findOne({ category: 'robot-cat-co' });
      const contact = ((await d.collection('sitesettings').findOne({})) || {}).contactInfo || {};
      const enAddr = `zzsender-enrobot-${stamp}@example.com`;
      const name = `${MARK}-enrobot`;
      const r = await send('/san-pham/robot-cat-co/yeu-cau', { name, email: enAddr, message: `Báo giá ${name}` }, { cookie: `lang=en; connect.sid=${customer.sid}` });
      check('a request sent with the site in English (robot page)', r.status === 303, r.status);
      const [staff] = await waitMails((m) => toStaff(m) && (m.subject || '').includes(name));
      const s = staff ? staff.text + staff.html : '';
      check('site in English → the staff email is still all Vietnamese (subject, title, labels, page name, button)',
        !!staff && staff.subject === `[MTG] Yêu cầu mới: Sản phẩm Robot thông minh – ${name}` && staff.html.includes('lang="vi"') && s.includes('Yêu cầu tư vấn mới')
        && staff.text.includes('Quan tâm: Sản phẩm Robot thông minh') && staff.text.includes(`Sản phẩm: ${robot.nameVi}`) && staff.text.includes(`Gửi từ trang: Sản phẩm/${robot.nameVi}`)
        && s.includes('Xem trong trang quản trị') && s.includes('Xác nhận yêu cầu') && !/Request|Thank you|Smart Robot|Product:|Contact MTG|Visit the|Hello/.test(s), staff && staff.text);
      const enRobot = await requestNamed(name);
      await sleep(400);
      check('… and the sender gets nothing until staff confirm', enRobot.lang === 'en' && !mails().some((m) => addresses(m.to).includes(enAddr)));
      const sentConfirm = await confirmAs(enRobot._id);
      check('staff confirm it', sentConfirm.status === 302 && sentConfirm.headers.get('location') === '/admin/yeu-cau', sentConfirm.status);
      const [mine] = await waitMails((m) => addresses(m.to).includes(enAddr));
      const c = mine ? mine.text + mine.html : '';
      check('… and the sender\'s confirmation is all English (subject, tag, title, topic, button, footer)',
        !!mine && mine.subject === 'MTG has received your consultation request' && mine.html.includes('lang="en"') && c.includes('Request received') && c.includes('Thank you for contacting MTG')
        && c.includes('about "Smart Robot Products"') && c.includes('Visit the MTG website') && mine.text.endsWith('This is an automatic email from MTG, please do not reply to it.')
        && (!(contact.phone || contact.email) || c.includes('Contact MTG')) && !/Xin chào|Cảm ơn|Đã nhận|Trân trọng|Liên hệ MTG|vui lòng|Sản phẩm/.test(c), mine && mine.text);
      // "Đã liên hệ" where people look: the customer's "Yêu cầu của tôi" (no more "Sửa") and Admin → Yêu cầu
      const mine2 = await getAs('/tai-khoan', { cookie: `lang=vi; connect.sid=${customer.sid}` });
      const row = (mine2.text.split('<tr').find((tr) => tr.includes(`Báo giá ${name}`)) || ''); // rows show the message, not the name
      check('the customer\'s "Yêu cầu của tôi" shows "Đã liên hệ" for it, without "Sửa"', mine2.status === 200 && row.includes('status-da_lien_he') && row.includes('Đã liên hệ') && !row.includes(`/tai-khoan/yeu-cau/${enRobot._id}/sua`), row.slice(0, 200));
      const list = await getAs('/admin/yeu-cau', asAdmin);
      const adminRow = (list.text.split('<tr').find((tr) => tr.includes(`data-id="${enRobot._id}"`)) || '');
      check('… and Admin → Yêu cầu lists it as "Đã liên hệ"', /<option value="da_lien_he" selected/.test(adminRow), adminRow.slice(0, 120));

      // A Dịch vụ page: its required questions answered, as in services.test.mjs
      const svc = (await d.collection('services').findOne({ slug: 'tu-van-du-hoc' })) || (await d.collection('services').findOne({}));
      const answers = Object.fromEntries((svc.questions || []).filter((q) => q.required).map((q) => [`q_${q.key}`, q.type === 'choice' ? '0' : q.type === 'number' ? '1' : 'ZZ']));
      const svcName = `${MARK}-service`;
      const rs = await send(`/dich-vu/${svc.slug}/yeu-cau`, { name: svcName, message: 'Tư vấn', ...answers }, { cookie: `lang=vi; connect.sid=${customer.sid}` });
      const [fromService] = await waitMails((m) => toStaff(m) && (m.subject || '').includes(svcName));
      check(`a request from a Dịch vụ page → "Gửi từ trang: Dịch vụ/${svc.titleVi}"`, rs.status === 303 && !!fromService && fromService.text.includes(`Gửi từ trang: Dịch vụ/${svc.titleVi}\n`), fromService ? fromService.text : rs.status);
    });

    await part(b, 'Xác nhận: only staff', async () => {
      const target = await requestNamed(`${MARK}-own-changed`);
      const asCust = { cookie: `lang=vi; connect.sid=${customer.sid}` };
      const custGet = await getAs(confirmPath(target._id), asCust);
      const custPost = await confirmAs(target._id, asCust);
      check('a customer opening or posting the confirm page → 403', custGet.status === 403 && custPost.status === 403, [custGet.status, custPost.status]);
      const guestPost = await confirmAs(target._id, {});
      check('… a visitor\'s POST → the login page, nothing sent', guestPost.status === 302 && guestPost.headers.get('location') === '/dang-nhap' && (await requestNamed(`${MARK}-own-changed`)).status === 'moi', guestPost.status);
      const unknown = await getAs(confirmPath('6acb527643acc9b993aaddf0'), asAdmin);
      const broken = await getAs(confirmPath('not-an-id'), asAdmin);
      check('… an unknown or broken request id → back to Admin → Yêu cầu', unknown.status === 302 && unknown.location === '/admin/yeu-cau' && broken.status === 302 && broken.location === '/admin/yeu-cau', [unknown.status, broken.status]);
    });

    await part(b, 'no staff address → no staff email', async () => {
      await saveEmails('');
      const before = mails().filter((m) => toStaff(m)).length;
      await send('/lien-he', { name: `${MARK}-nobody`, message: 'Không ai nhận' });
      await sleep(800);
      check('an empty list sends nothing to staff', mails().filter((m) => toStaff(m)).length === before && JSON.stringify((await d.collection('sitesettings').findOne({})).requestEmails) === '[]');
    });
  } finally {
    // Back through an admin save: the server caches the settings
    await saveEmails((settingsBackup.requestEmails || []).join('\n'));
  }
});
