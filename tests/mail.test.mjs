// Request emails (lib/request-mail.js): the staff list in Admin → Cài đặt chung → "Email thông báo", the staff email
// for each new or changed request (Reply-To the sender), and the sender's confirmation: page language, no typed text,
// at most 3 a day to one address. tests/run.mjs writes the emails to tests/output/mail instead of sending them.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { suite, part, check, db, BASE, ROOT, createUser, removeLater, restoreLater, stamp, sleep } from './lib/index.mjs';

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
      const [mine] = await waitMails((m) => toSender(m));
      check('the sender gets "MTG đã nhận được yêu cầu tư vấn của bạn"', !!mine && mine.subject === 'MTG đã nhận được yêu cầu tư vấn của bạn' && /yêu cầu tư vấn về "Sản phẩm Robot thông minh" gửi lúc \d\d:\d\d \d\d\/\d\d\/\d{4}/.test(mine.text || ''), mine && mine.text);
      check('… with no text typed into the form (no name, school or message), and no Reply-To', !!mine && !mine.text.includes(MARK) && !mine.text.includes('ZZ Trường') && !mine.replyTo);
      const mineHtml = (mine && mine.html) || '';
      check('… its HTML: "Đã nhận yêu cầu" tag, thank-you title, a button to the website, still nothing typed into the form',
        mineHtml.includes('Đã nhận yêu cầu') && mineHtml.includes('Cảm ơn bạn đã liên hệ MTG') && mineHtml.includes(`href="${BASE}"`) && !mineHtml.includes(MARK) && !mineHtml.includes('ZZ Trường') && !mineHtml.includes('đậm'));
      check('… site in Vietnamese → all Vietnamese, ending "Email tự động từ MTG, vui lòng không trả lời lại email này."',
        !!mine && mineHtml.includes('lang="vi"') && mineHtml.includes('Xem website MTG') && mine.text.endsWith('Email tự động từ MTG, vui lòng không trả lời lại email này.')
        && mineHtml.includes('Email tự động từ MTG, vui lòng không trả lời lại email này.') && !/Request received|Thank you|Visit the|Hello|Kind regards|do not reply/.test(mine.text + mineHtml), mine && mine.text.slice(-200));
    });

    await part(b, 'English page, no email, the daily limit, a changed request', async () => {
      const other = `zzsender-en-${stamp}@example.com`;
      await send('/lien-he', { name: `${MARK}-en`, email: other, message: 'Hello', interestedIn: 'workshop-stem' }, { cookie: 'lang=en' });
      const [en] = await waitMails((m) => addresses(m.to).includes(other));
      check('sent from an English page → the confirmation is in English', !!en && en.subject === 'MTG has received your consultation request' && en.text.includes('about "Hands-on STEM workshops"'), en && en.subject);
      const before = mails().length;
      await send('/lien-he', { name: `${MARK}-noemail`, message: 'Chỉ có số điện thoại' });
      const sent = await waitMails((m) => (m.subject || '').includes(`${MARK}-noemail`));
      await sleep(300);
      check('no email given → the staff email only, without Reply-To', sent.length === 1 && !sent[0].replyTo && mails().length === before + 1, { staff: sent.length, all: mails().length - before });
      check('… sent from Liên hệ → "Gửi từ trang: Liên hệ"', !!sent[0] && sent[0].text.includes('Gửi từ trang: Liên hệ\n'), sent[0] && sent[0].text);
      // An account isn't limited per address, so this tests the per-recipient limit alone: 3 confirmations a day
      const asCustomer = { cookie: `lang=vi; connect.sid=${customer.sid}` };
      const limited = `zzsender-many-${stamp}@example.com`;
      for (let i = 1; i <= 4; i++) await send('/lien-he', { name: `${MARK}-many-${i}`, email: limited, message: `Lần ${i}` }, asCustomer);
      await waitMails((m) => (m.subject || '').includes(`${MARK}-many-4`));
      const confirmations = await waitMails((m) => addresses(m.to).includes(limited), 4);
      check('4 requests with the same email in a day → 3 confirmations (staff still get all 4)', confirmations.length === 3 && mails().filter((m) => toStaff(m) && (m.subject || '').includes(`${MARK}-many-`)).length === 4, confirmations.length);
      const own = await d.collection('quoterequests').findOne({ name: `${MARK}-many-1` });
      check('… the account appears in the staff email', mails().some((m) => (m.subject || '').includes(`${MARK}-many-1`) && m.text.includes(`Tài khoản: ${customer.email}`)));
      const r = await send(`/tai-khoan/yeu-cau/${own._id}/sua`, { name: `${MARK}-many-1-changed`, email: limited, message: 'Đã sửa', interestedIn: 'khac' }, asCustomer);
      const [changed] = await waitMails((m) => (m.subject || '').includes(`${MARK}-many-1-changed`));
      check('changing a sent request → staff get "[MTG] Yêu cầu đã sửa: …", the sender no new confirmation', r.status === 303 && !!changed && changed.subject.startsWith('[MTG] Yêu cầu đã sửa:') && changed.text.startsWith('Người gửi vừa sửa lại') && mails().filter((m) => addresses(m.to).includes(limited)).length === 3, changed && changed.subject);
    });

    await part(b, 'language: the confirmation follows the VI / EN switch, staff always get Vietnamese; page names', async () => {
      // As the customer (accounts have no hourly limit), so the guest requests above keep their own count
      const robot = await d.collection('products').findOne({ category: 'robot-cat-co' });
      const contact = ((await d.collection('sitesettings').findOne({})) || {}).contactInfo || {};
      const enAddr = `zzsender-enrobot-${stamp}@example.com`;
      const name = `${MARK}-enrobot`;
      const r = await send('/san-pham/robot-cat-co/yeu-cau', { name, email: enAddr, message: 'Báo giá' }, { cookie: `lang=en; connect.sid=${customer.sid}` });
      check('a request sent with the site in English (robot page)', r.status === 303, r.status);
      const [staff] = await waitMails((m) => toStaff(m) && (m.subject || '').includes(name));
      const s = staff ? staff.text + staff.html : '';
      check('site in English → the staff email is still all Vietnamese (subject, title, labels, page name, button)',
        !!staff && staff.subject === `[MTG] Yêu cầu mới: Sản phẩm Robot thông minh – ${name}` && staff.html.includes('lang="vi"') && s.includes('Yêu cầu tư vấn mới')
        && staff.text.includes('Quan tâm: Sản phẩm Robot thông minh') && staff.text.includes(`Sản phẩm: ${robot.nameVi}`) && staff.text.includes(`Gửi từ trang: Sản phẩm/${robot.nameVi}`)
        && s.includes('Xem trong trang quản trị') && !/Request|Thank you|Smart Robot|Product:|Contact MTG|Visit the|Hello/.test(s), staff && staff.text);
      const [mine] = await waitMails((m) => addresses(m.to).includes(enAddr));
      const c = mine ? mine.text + mine.html : '';
      check('… and the sender\'s confirmation is all English (subject, tag, title, topic, button, footer)',
        !!mine && mine.subject === 'MTG has received your consultation request' && mine.html.includes('lang="en"') && c.includes('Request received') && c.includes('Thank you for contacting MTG')
        && c.includes('about "Smart Robot Products"') && c.includes('Visit the MTG website') && mine.text.endsWith('This is an automatic email from MTG, please do not reply to it.')
        && (!(contact.phone || contact.email) || c.includes('Contact MTG')) && !/Xin chào|Cảm ơn|Đã nhận|Trân trọng|Liên hệ MTG|vui lòng|Sản phẩm/.test(c), mine && mine.text);

      // A Dịch vụ page: its required questions answered, as in services.test.mjs
      const svc = (await d.collection('services').findOne({ slug: 'tu-van-du-hoc' })) || (await d.collection('services').findOne({}));
      const answers = Object.fromEntries((svc.questions || []).filter((q) => q.required).map((q) => [`q_${q.key}`, q.type === 'choice' ? '0' : q.type === 'number' ? '1' : 'ZZ']));
      const svcName = `${MARK}-service`;
      const rs = await send(`/dich-vu/${svc.slug}/yeu-cau`, { name: svcName, message: 'Tư vấn', ...answers }, { cookie: `lang=vi; connect.sid=${customer.sid}` });
      const [fromService] = await waitMails((m) => toStaff(m) && (m.subject || '').includes(svcName));
      check(`a request from a Dịch vụ page → "Gửi từ trang: Dịch vụ/${svc.titleVi}"`, rs.status === 303 && !!fromService && fromService.text.includes(`Gửi từ trang: Dịch vụ/${svc.titleVi}\n`), fromService ? fromService.text : rs.status);
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
