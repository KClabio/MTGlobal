// Two-step login for staff (lib/two-factor.js, routes/auth.js, middleware/auth.js): setup with QR code and backup codes,
// the code page after the password, backup codes, wrong-code limit, customers untouched, Hồ sơ ("Tạo mã dự phòng mới",
// "Đổi điện thoại"), "Đặt lại 2 bước" in Admin → Người dùng, and the pages at phone width in light and dark.
// Code reuse within 30 s is allowed on the test server (TWO_STEP_TEST_REUSE=1); refusing it is in unit.test.mjs.
import { suite, part, check, db, BASE, createUser, sidClient, passTwoStep, twoStepCode, sleep, clearLocalLoginLimit, restoreLater, removeLater } from './lib/index.mjs';

const form = (o) => new URLSearchParams(o);
/** A fresh visitor's client (no session yet) with the same req() as sidClient */
const fresh = () => sidClient('none');
const login = async (email, password) => {
  const c = fresh();
  const r = await c.req('/dang-nhap', { method: 'POST', body: form({ email, password }) });
  return { c, r };
};

await suite(async (b) => {
  const d = await db();
  const users = d.collection('users');
  const twoFactorOf = async (id) => (await users.findOne({ _id: id })).twoFactor;
  // "the clocks differ" lines this file causes in Nhật ký lỗi: real ones from before are put back, new ones removed
  const errorLogs = d.collection('errorlogs');
  const CLOCK = /^Two-step code refused/;
  const clockBefore = await restoreLater('errorlogs', { message: CLOCK });
  removeLater('errorlogs', { message: CLOCK, _id: { $nin: clockBefore.map((x) => x._id) } });
  // The "Không nhập được mã?" guide under the code box, and whether it is open
  const isHelp = (html) => html.includes('data-two-step-help') && html.includes('Không nhập được mã?');
  const helpOpen = (html) => /data-two-step-help open>/.test(html);
  const waitFor = async (fn) => { for (let i = 0; i < 40; i++) { const v = await fn(); if (v) return v; await sleep(100); } return null; };

  // An account that is a customer first, then made admin in the database: its next visit to Quản trị starts the setup
  const staff = await createUser('2fa-staff', 'customer');
  await users.updateOne({ _id: staff.id }, { $set: { role: 'admin' } });
  let secret = null;
  let backup = [];

  await part(b, 'setup: the first time Quản trị is opened', async () => {
    const c = sidClient(staff.sid);
    let r = await c.req('/admin/yeu-cau');
    check('a staff session without two-step: Quản trị sends to the code page', r.status === 302 && r.location === '/dang-nhap/xac-minh', r);
    r = await c.req('/dang-nhap/xac-minh');
    const key = (r.text.match(/data-two-step-key>([^<]+)</) || [])[1] || '';
    check('setup page: "Bật đăng nhập 2 bước", 3 steps, the QR picture (with a description) and the key in groups of 4', r.status === 200 && r.text.includes('data-two-step="setup"') && r.text.includes('Bật đăng nhập 2 bước')
      && /<img class="two-step-qr" src="data:image\/png;base64,[^"]+" width="220" height="220" alt="Mã QR để thêm tài khoản MTG vào ứng dụng xác thực"/.test(r.text) && /^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/.test(key.trim()), key);
    check('… the code box has its label, the phone keypad and the browser\'s one-time-code hint', /<label for="twoStepCode">Mã xác minh<\/label>/.test(r.text) && /id="twoStepCode" name="code"[^>]*autocomplete="one-time-code"[^>]*inputmode="numeric"/.test(r.text));
    const head = await fetch(BASE + '/dang-nhap/xac-minh', { headers: { cookie: `connect.sid=${c.sid}` } });
    check('… never cached, and kept out of search engines', head.headers.get('cache-control') === 'no-store' && r.text.includes('noindex'), head.headers.get('cache-control'));
    const again = await c.req('/dang-nhap/xac-minh');
    check('reloading shows the same key (one key per setup)', again.text.includes(key));
    check('setup page: the "Không nhập được mã?" guide, closed, with "scan the QR code on this page" and no backup-code step', isHelp(r.text) && !helpOpen(r.text)
      && r.text.includes('Quét mã QR trên trang này') && !r.text.includes('Nhập một mã dự phòng (dạng abcd-2345) vào ô trên') && !r.text.includes('data-two-step-help-reset'));
    secret = key.replace(/\s/g, '');
    const right = twoStepCode(secret);
    const wrongCode = String((Number(right) + 500000) % 1000000).padStart(6, '0');
    r = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: wrongCode }) });
    check('a wrong code: refused (400) with a message, the box marked invalid, nothing saved', r.status === 400 && r.text.includes('Mã không đúng') && r.text.includes('aria-invalid="true"') && !(await twoFactorOf(staff.id)));
    check('… after one refused code the guide stays closed', isHelp(r.text) && !helpOpen(r.text));
    r = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: twoStepCode(secret, Date.now() + 120000) }) });
    check('a code from a phone 2 minutes ahead: refused, saying the clocks differ by about 120 seconds, nothing saved', r.status === 400 && r.text.includes('lệch nhau khoảng 120 giây')
      && r.text.includes('aria-invalid="true"') && !(await twoFactorOf(staff.id)), r.status);
    check('… it says to tell the technical person if the phone is right, and the guide is open', r.text.includes('báo cho người phụ trách kỹ thuật') && helpOpen(r.text));
    const ahead = await waitFor(() => errorLogs.findOne({ message: /^Two-step code refused: .* about 120 s \(phone ahead\)/ }));
    check('… and it is in Nhật ký lỗi as "Two-step login" (the server clock may be wrong)', ahead && ahead.where === 'Two-step login' && ahead.status === 400, ahead);
    const sidBefore = c.sid;
    r = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: right }) });
    check('the right code: on (303 → the backup codes page), with a new session id', r.status === 303 && r.location === '/dang-nhap/ma-du-phong' && c.sid !== sidBefore, r);
    const tf = await twoFactorOf(staff.id);
    check('stored: the key locked (not readable), 10 backup codes as hashes, the time it was turned on', tf && !tf.secret.includes(secret) && tf.secret.startsWith('v1.') && tf.backupCodes.length === 10
      && tf.backupCodes.every((h) => /^[0-9a-f]{64}$/.test(h)) && !!tf.enabledAt, tf);
    r = await c.req('/dang-nhap/ma-du-phong');
    backup = [...r.text.matchAll(/<li><code>([a-z0-9-]+)<\/code><\/li>/g)].map((m) => m[1]);
    check('backup codes page: 10 codes, "Tải xuống", "In", and "Tiếp tục" back to the page that was asked for', r.status === 200 && backup.length === 10 && r.text.includes('data-backup-download') && r.text.includes('data-backup-print')
      && /href="\/admin\/yeu-cau" data-backup-continue/.test(r.text), backup);
    check('… without the "Đăng nhập thành công" notice (on a phone it would cover the codes)', !r.text.includes('data-site-toast'));
    r = await c.req('/dang-nhap/ma-du-phong');
    check('… shown once: opening it again goes on to that page', r.status === 302 && r.location === '/admin/yeu-cau', r);
    check('Quản trị now opens', (await c.req('/admin/yeu-cau')).status === 200);
  });

  await part(b, 'logging in: password, then the code', async () => {
    let { c, r } = await login(staff.email, staff.password);
    check('the password is right: the code page next, not logged in yet', r.status === 303 && r.location === '/dang-nhap/xac-minh' && !(await c.req('/')).text.includes('action="/dang-xuat"'), r);
    check('… Quản trị is still closed (login page)', (await c.req('/admin')).location === '/dang-nhap');
    r = await c.req('/dang-nhap/xac-minh');
    check('code page: "Đăng nhập 2 bước", a backup-code hint, "Hủy và đăng xuất"; no QR code', r.text.includes('data-two-step="verify"') && r.text.includes('mã dự phòng') && r.text.includes('Hủy và đăng xuất') && !r.text.includes('data-two-step-qr'));
    const steps = (r.text.match(/data-two-step-help[\s\S]*?<\/details>/) || [''])[0].match(/<li/g) || [];
    check('… the "Không nhập được mã?" guide, closed, 5 steps; for an admin the last is "ask an owner for Đặt lại 2 bước"', isHelp(r.text) && !helpOpen(r.text) && steps.length === 5
      && /data-two-step-help-reset>[^<]*nhờ một chủ sở hữu[^<]*Đặt lại 2 bước/.test(r.text) && r.text.includes('xoá các dòng cũ'), steps.length);
    r = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: twoStepCode(secret) }) });
    check('the app code logs in: Trang chủ with "Đăng nhập thành công"', r.status === 303 && r.location === '/' && (await c.req('/')).text.includes('Đăng nhập thành công'), r);
    check('… and Quản trị opens', (await c.req('/admin')).status === 200);

    ({ c, r } = await login(staff.email, staff.password));
    r = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: backup[0].toUpperCase().replace('-', ' ') }) });
    check('a backup code logs in too (capitals and a space are fine), and is used up (9 left)', r.status === 303 && r.location === '/' && (await twoFactorOf(staff.id)).backupCodes.length === 9, r);
    ({ c, r } = await login(staff.email, staff.password));
    r = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: backup[0] }) });
    check('… the same backup code a second time: refused', r.status === 400 && r.text.includes('Mã không đúng'));

    // A phone clock 2½ minutes slow (or the server's fast): the code is refused, and the page says why
    ({ c, r } = await login(staff.email, staff.password));
    r = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: twoStepCode(secret, Date.now() - 150000) }) });
    check('a code from a phone 150 s behind: refused (400), "lệch nhau khoảng 150 giây", still on the code page', r.status === 400 && r.text.includes('lệch nhau khoảng 150 giây') && r.text.includes('data-two-step="verify"'), r.status);
    check('… in Nhật ký lỗi too', !!(await waitFor(() => errorLogs.findOne({ message: /about 150 s \(phone behind\)/ }))));
    r = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: twoStepCode(secret) }) });
    check('… then the right code logs in', r.status === 303 && r.location === '/', r);

    // 5 wrong codes lock the code step for 15 minutes, even for the right code
    ({ c, r } = await login(staff.email, staff.password));
    const right = twoStepCode(secret);
    const wrongCode = String((Number(right) + 500000) % 1000000).padStart(6, '0');
    const first = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: wrongCode }) });
    const second = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: wrongCode }) });
    check('the guide: closed after the 1st wrong code, open after the 2nd', !helpOpen(first.text) && helpOpen(second.text));
    for (let i = 0; i < 2; i++) await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: wrongCode }) });
    r = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: wrongCode }) });
    const locked = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: twoStepCode(secret) }) });
    check('5 wrong codes: the right one is refused too (429, "thử lại sau 15 phút"), with the guide open', locked.status === 429 && locked.text.includes('15 phút') && helpOpen(locked.text), locked.status);
    await d.collection('loginthrottles').deleteOne({ _id: `code:${staff.id}` });
    await clearLocalLoginLimit(); // the wrong codes also counted for this computer's address

    r = await fresh().req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: '123456' }) });
    check('the code page with no password given (or after 10 minutes): "Phiên đăng nhập đã hết hạn", back to the login form', r.status === 400 && r.text.includes('Phiên đăng nhập đã hết hạn') && r.text.includes('action="/dang-nhap"'));
  });

  await part(b, 'customers never see it', async () => {
    const cust = await createUser('2fa-cust', 'customer');
    const { c, r } = await login(cust.email, cust.password);
    check('a customer logs in straight to Trang chủ', r.status === 303 && r.location === '/', r);
    const page = await c.req('/ho-so');
    check('… Hồ sơ has no "Đăng nhập 2 bước" card', page.status === 200 && !page.text.includes('data-two-step-card'));
    const post = await c.req('/ho-so/2-buoc/ma-du-phong', { method: 'POST', body: form({ code: '123456' }) });
    check('… and can\'t use its actions (403)', post.status === 403);
  });

  await part(b, 'Hồ sơ: new backup codes, change phone', async () => {
    let { c } = await login(staff.email, staff.password);
    await passTwoStep(c, { secret });
    let r = await c.req('/ho-so');
    check('Hồ sơ (staff): "Đăng nhập 2 bước", on since a date, backup codes left, two buttons', r.text.includes('data-two-step-card') && /Đang bật từ \d{1,2}\/\d{1,2}\/\d{4}\./.test(r.text) && r.text.includes('Còn 9 mã dự phòng.')
      && r.text.includes('Tạo mã dự phòng mới') && r.text.includes('formaction="/ho-so/2-buoc/doi-dien-thoai"'));
    const data = await c.req('/ho-so/du-lieu');
    check('"Tải dữ liệu của tôi" never includes the two-step key or backup codes', data.status === 200 && !/twoFactor|backupCodes|secret|v1\./.test(data.text));
    r = await c.req('/ho-so/2-buoc/ma-du-phong', { method: 'POST', body: form({ code: 'abc' }) });
    check('"Tạo mã dự phòng mới" with a wrong code: refused on Hồ sơ with the message', r.status === 400 && r.text.includes('data-two-step-error') && r.text.includes('Mã không đúng'));
    const oldHashes = (await twoFactorOf(staff.id)).backupCodes;
    r = await c.req('/ho-so/2-buoc/ma-du-phong', { method: 'POST', body: form({ code: twoStepCode(secret) }) });
    const tf = await twoFactorOf(staff.id);
    check('… with the code: 10 new codes (the old ones stop working), shown once, then back to Hồ sơ', r.location === '/dang-nhap/ma-du-phong' && tf.backupCodes.length === 10 && !tf.backupCodes.some((h) => oldHashes.includes(h))
      && /href="\/ho-so" data-backup-continue/.test((await c.req('/dang-nhap/ma-du-phong')).text));

    r = await c.req('/ho-so/2-buoc/doi-dien-thoai', { method: 'POST', body: form({ code: twoStepCode(secret) }) });
    check('"Đổi điện thoại" with the code: the setup page for the new phone, with a new key', r.status === 303 && r.location === '/dang-nhap/xac-minh', r);
    r = await c.req('/dang-nhap/xac-minh');
    const newKey = ((r.text.match(/data-two-step-key>([^<]+)</) || [])[1] || '').replace(/\s/g, '');
    check('… "Đổi điện thoại", a different key, "← Quay lại Hồ sơ" instead of logging out', r.text.includes('data-two-step="change"') && newKey && newKey !== secret && r.text.includes('href="/ho-so"') && !r.text.includes('Hủy và đăng xuất'));
    check('… until confirmed, the old phone still works (Quản trị open, old key stored)', (await c.req('/admin')).status === 200 && (await twoFactorOf(staff.id)).secret === tf.secret);
    r = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: twoStepCode(newKey) }) });
    check('… confirmed with the new phone\'s code: new backup codes, then back to Hồ sơ', r.location === '/dang-nhap/ma-du-phong' && /href="\/ho-so"/.test((await c.req('/dang-nhap/ma-du-phong')).text));
    const oldSecret = secret;
    secret = newKey;
    ({ c } = await login(staff.email, staff.password));
    r = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: twoStepCode(oldSecret) }) });
    check('the old phone\'s code no longer works; the new one does', r.status === 400 && (await c.req('/dang-nhap/xac-minh', { method: 'POST', body: form({ code: twoStepCode(secret) }) })).location === '/');
  });

  await part(b, 'Admin → Người dùng: "Đặt lại 2 bước" (owner only), and losing the admin role', async () => {
    const owner = await createUser('2fa-owner', 'owner');
    const otherAdmin = await createUser('2fa-admin2', 'admin');
    const ownerC = sidClient(owner.sid);
    const ownerLogin = await login(owner.email, owner.password);
    const ownerPage = await ownerLogin.c.req('/dang-nhap/xac-minh');
    check('an owner\'s code page: the last step of the guide sends to the technical person, not to "Đặt lại 2 bước"', ownerPage.text.includes('data-two-step="verify"')
      && /data-two-step-help-reset>[^<]*người phụ trách kỹ thuật của website/.test(ownerPage.text) && !/data-two-step-help-reset>[^<]*Đặt lại 2 bước/.test(ownerPage.text));
    let r = await ownerC.req('/admin/nguoi-dung');
    check('the owner sees "Đặt lại 2 bước" for an admin with it on, not for owners or customers', r.text.includes(`/admin/nguoi-dung/${staff.id}/2-buoc/dat-lai`) && !r.text.includes(`/admin/nguoi-dung/${owner.id}/2-buoc/dat-lai`));
    const adminC = sidClient(otherAdmin.sid);
    check('an admin sees no such button', !(await adminC.req('/admin/nguoi-dung')).text.includes('/2-buoc/dat-lai'));
    r = await adminC.req(`/admin/nguoi-dung/${staff.id}/2-buoc/dat-lai`, { method: 'POST' });
    check('… and posting it anyway is refused (403), nothing changes', r.status === 403 && !!(await twoFactorOf(staff.id)));
    const live = await login(staff.email, staff.password);
    await passTwoStep(live.c, { secret });
    r = await ownerC.req(`/admin/nguoi-dung/${staff.id}/2-buoc/dat-lai`, { method: 'POST' });
    check('the owner resets it: a green notice, two-step removed', r.status === 302 && !(await twoFactorOf(staff.id)), r);
    check('… the admin is logged out everywhere', (await live.c.req('/admin')).location === '/dang-nhap' && (await d.collection('sessions').countDocuments({ session: { $regex: `"userId":"${staff.id}"` } })) === 0);
    const { c } = await login(staff.email, staff.password);
    r = await c.req('/dang-nhap/xac-minh');
    check('… and sets it up again (new QR code) at the next login', r.text.includes('data-two-step="setup"'));
    ({ secret } = await passTwoStep(c));

    r = await ownerC.req(`/admin/nguoi-dung/${otherAdmin.id}/vai-tro`, { method: 'POST', body: form({ role: 'customer' }) });
    check('made a customer: their two-step login goes too', r.status === 302 && !(await twoFactorOf(otherAdmin.id)), r.status);
  });

  await part(b, 'the pages at 390 px, light and dark; keyboard', async () => {
    const shown = await createUser('2fa-look', 'customer');
    await users.updateOne({ _id: shown.id }, { $set: { role: 'admin' } });
    await b.viewport(390, 860);
    for (const theme of ['light', 'dark']) {
      await b.setCookie('theme', theme);
      await b.login(shown.sid);
      await b.nav('/admin', 500);
      check(`[${theme}] opening Quản trị lands on the setup page, the cursor in the code box`, await b.ev(`location.pathname === '/dang-nhap/xac-minh' && document.activeElement.id === 'twoStepCode'`));
      const fit = await b.ev(`({ page: document.documentElement.scrollWidth, qr: document.querySelector('.two-step-qr').getBoundingClientRect().right, key: document.querySelector('.two-step-key').getBoundingClientRect().right })`);
      check(`[${theme}] 390 px: nothing wider than the screen (QR code and key inside)`, fit.page <= 390 && fit.qr <= 390 && fit.key <= 390, fit);
      await b.ev(`document.querySelector('[data-two-step-help]').open = true`);
      await sleep(300);
      const helpFit = await b.ev(`({ page: document.documentElement.scrollWidth, help: document.querySelector('[data-two-step-help]').getBoundingClientRect().right })`);
      check(`[${theme}] 390 px: the guide opened fits the screen`, helpFit.page <= 390 && helpFit.help <= 390, helpFit);
      await b.shot(`two-step-help-390-${theme}`);
      await b.ev(`document.querySelector('[data-two-step-help]').open = false`);
      const qrBg = await b.ev(`getComputedStyle(document.querySelector('.two-step-qr')).backgroundColor`);
      check(`[${theme}] the QR code sits on white (phones read it in dark mode too)`, qrBg === 'rgb(255, 255, 255)', qrBg);
      await b.shot(`two-step-setup-390-${theme}`);
    }
    const key = (await b.ev(`document.querySelector('[data-two-step-key]').textContent`)).replace(/\s/g, '');
    await b.ev(`document.getElementById('twoStepCode').focus()`);
    await b.type(twoStepCode(key));
    const l = b.waitLoad(); await b.ev(`document.querySelector('form[action="/dang-nhap/xac-minh"]').requestSubmit()`); await l; await sleep(300);
    check('typing the code and pressing the button: the backup codes page', await b.ev(`location.pathname === '/dang-nhap/ma-du-phong' && document.querySelectorAll('[data-backup-list] li').length === 10`));
    const codesFit = await b.ev(`document.documentElement.scrollWidth`);
    check('[dark] 390 px: the codes page fits the screen', codesFit <= 390, codesFit);
    await b.shot('two-step-codes-390-dark');
    await b.printMedia(true);
    const printed = await b.ev(`({ buttons: getComputedStyle(document.querySelector('.backup-actions')).display, go: getComputedStyle(document.querySelector('[data-backup-continue]')).display, list: getComputedStyle(document.querySelector('[data-backup-list]')).display })`);
    check('printing the codes page: just the codes (no buttons)', printed.buttons === 'none' && printed.go === 'none' && printed.list !== 'none', printed);
    await b.printMedia(false);
    await b.setCookie('theme', 'light');
  });
});
