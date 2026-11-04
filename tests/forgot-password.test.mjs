// "Quên mật khẩu" (lib/password-reset.js): the page, the emailed link and what it changes. tests/run.mjs writes the
// emails to tests/output/mail instead of sending them.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { suite, part, check, db, ROOT, createUser, removeLater, sidClient, passTwoStep, sleep } from './lib/index.mjs';

const MAIL_DIR = path.join(ROOT, 'tests', 'output', 'mail');
const form = (o) => new URLSearchParams(o);
const allMail = () => (existsSync(MAIL_DIR) ? readdirSync(MAIL_DIR) : []).map((f) => JSON.parse(readFileSync(path.join(MAIL_DIR, f), 'utf8')));
const mailTo = (email) => allMail().filter((m) => JSON.stringify(m.envelope || m).includes(email));
async function waitForMail(email, count) {
  for (let i = 0; i < 40; i += 1) {
    if (mailTo(email).length >= count) return mailTo(email);
    await sleep(100);
  }
  return mailTo(email);
}
const linkIn = (mail) => (String(mail.text || '').match(/\/dat-lai-mat-khau\/[a-f0-9]{64}/) || [])[0];
const textOf = (r) => r.text;
const SENT_VI = 'Nếu email này có tài khoản';

await suite(async (b) => {
  const d = await db();
  const clearLimits = () => d.collection('loginthrottles').deleteMany({ _id: { $regex: '^reset-' } });
  await clearLimits();
  removeLater('loginthrottles', { _id: { $regex: '^reset-' } });
  const guest = () => sidClient('');
  const ask = (email, c = guest()) => c.req('/quen-mat-khau', { method: 'POST', body: form({ email }) });
  async function freshLink(user, already) {
    await clearLimits();
    await ask(user.email);
    const mails = await waitForMail(user.email, already + 1);
    return linkIn(mails[mails.length - 1]);
  }

  await part(b, 'the page and the same answer for any email', async () => {
    let r = await guest().req('/dang-nhap');
    check('the login page links to "Quên mật khẩu?"', r.text.includes('href="/quen-mat-khau"') && r.text.includes('Quên mật khẩu?'));
    r = await guest().req('/quen-mat-khau');
    check('the page opens with its form, kept out of search', r.status === 200 && r.text.includes('action="/quen-mat-khau"') && r.text.includes('noindex'));
    r = await ask('not-an-email');
    check('a wrong email shape: a message', r.status === 400 && r.text.includes('Email không hợp lệ'));

    const user = await createUser('forgot-same', 'customer');
    const known = await ask(user.email);
    const unknownEmail = `zztest-nobody-${Date.now()}@example.com`;
    const unknown = await ask(unknownEmail);
    check('known and unknown email get the same page', known.status === 200 && unknown.status === 200 && known.text.includes(SENT_VI) && unknown.text.includes(SENT_VI) && known.text.replace(/nonce="[^"]+"/g, '') === unknown.text.replace(/nonce="[^"]+"/g, ''));
    const mails = await waitForMail(user.email, 1);
    check('the known email gets one email with a link', mails.length === 1 && !!linkIn(mails[0]), mails.length);
    await sleep(300);
    check('the unknown email gets none', mailTo(unknownEmail).length === 0);
    const stored = await d.collection('users').findOne({ _id: user.id });
    const token = linkIn(mails[0]).split('/').pop();
    check('the database holds a hash, not the link\'s token', stored.passwordReset && stored.passwordReset.tokenHash !== token && !JSON.stringify(stored).includes(token));

    const c = sidClient(user.sid);
    r = await c.req('/ho-so/du-lieu');
    check('"Tải dữ liệu của tôi" doesn\'t include it', r.status === 200 && !r.text.includes('tokenHash'));
  });

  await part(b, 'the link: password rules, one use, other devices logged out', async () => {
    const user = await createUser('forgot-use', 'customer');
    const otherDevice = sidClient(user.sid);
    const link = await freshLink(user, 0);
    check('an email with a link arrives', !!link);
    let r = await guest().req(link);
    check('the link opens the new password form', r.status === 200 && r.text.includes(`action="${link}"`) && r.text.includes('noindex'));
    const save = (newPassword, confirmPassword = newPassword) => guest().req(link, { method: 'POST', body: form({ newPassword, confirmPassword }) });
    r = await save('short');
    check('too short: refused', r.status === 400 && r.text.includes('tối thiểu 8 ký tự'));
    r = await save('12345678');
    check('too common: refused', r.status === 400 && r.text.includes('quá phổ biến'));
    r = await save('reset-pass-77', 'reset-pass-78');
    check('not the same twice: refused, the form stays', r.status === 400 && r.text.includes('không khớp') && r.text.includes(`action="${link}"`));
    check('… the old password still works after refused tries', (await guest().req('/dang-nhap', { method: 'POST', body: form({ email: user.email, password: user.password }) })).status === 303);

    const browser = guest();
    r = await browser.req(link, { method: 'POST', body: form({ newPassword: 'reset-pass-77', confirmPassword: 'reset-pass-77' }) });
    check('a good password is saved, on to the login page', r.status === 303 && r.location === '/dang-nhap', r.status);
    r = await browser.req('/dang-nhap');
    check('… which says so with the email filled in', r.text.includes('data-reset-done') && r.text.includes(`value="${user.email}"`));
    check('… only once', !(await browser.req('/dang-nhap')).text.includes('data-reset-done'));
    check('the other device is logged out', (await otherDevice.req('/ho-so')).status === 302);
    check('the old password no longer works', (await guest().req('/dang-nhap', { method: 'POST', body: form({ email: user.email, password: user.password }) })).status === 400);
    check('the new one does', (await guest().req('/dang-nhap', { method: 'POST', body: form({ email: user.email, password: 'reset-pass-77' }) })).status === 303);
    r = await guest().req(link);
    check('the link can\'t be opened again', r.status === 410 && r.text.includes('data-reset-bad') && !r.text.includes('<form method="POST" action="/dat-lai'));
    r = await guest().req(link, { method: 'POST', body: form({ newPassword: 'again-pass-77', confirmPassword: 'again-pass-77' }) });
    check('… nor used again', r.status === 410);
    const mails = await waitForMail(user.email, 2);
    check('an email says the password was changed', mails.some((m) => String(m.subject || '').includes('đã được thay đổi')), mails.map((m) => m.subject));
  });

  await part(b, 'links that no longer work', async () => {
    const user = await createUser('forgot-old', 'customer');
    const first = await freshLink(user, 0);
    const second = await freshLink(user, 1);
    check('a newer link replaces an older one', first !== second && (await guest().req(first)).status === 410 && (await guest().req(second)).status === 200);
    await d.collection('users').updateOne({ _id: user.id }, { $set: { 'passwordReset.expiresAt': new Date(Date.now() - 1000) } });
    check('after its time limit it stops working', (await guest().req(second)).status === 410);
    check('a made-up link is refused', (await guest().req(`/dat-lai-mat-khau/${'a'.repeat(64)}`)).status === 410 && (await guest().req('/dat-lai-mat-khau/abc')).status === 410);
    const expired = await guest().req(second, { method: 'POST', body: form({ newPassword: 'late-pass-7777', confirmPassword: 'late-pass-7777' }) });
    check('… and an old link can\'t save a password', expired.status === 410 && (await guest().req('/dang-nhap', { method: 'POST', body: form({ email: user.email, password: 'late-pass-7777' }) })).status === 400);
  });

  await part(b, 'limits and locks', async () => {
    const user = await createUser('forgot-limit', 'customer');
    await clearLimits();
    for (let i = 0; i < 5; i += 1) {
      const r = await ask(user.email);
      check(`request ${i + 1}: the same answer`, r.status === 200 && r.text.includes(SENT_VI));
    }
    await sleep(800);
    check('at most 3 emails an hour to one address', mailTo(user.email).length === 3, mailTo(user.email).length);

    // Sent at the same moment, when the count is just starting: none may slip past it
    for (let round = 1; round <= 3; round += 1) {
      const same = await createUser(`forgot-same-moment-${round}`, 'customer');
      await clearLimits();
      await Promise.all(Array.from({ length: 8 }, () => ask(same.email)));
      await sleep(1000);
      check(`8 requests at the same moment (round ${round}): still at most 3 emails`, mailTo(same.email).length === 3, mailTo(same.email).length);
    }

    // The login limit counts wrong passwords sent together on a fresh count, too
    const burst = await createUser('forgot-burst', 'customer');
    await Promise.all(Array.from({ length: 8 }, () => guest().req('/dang-nhap', { method: 'POST', body: form({ email: burst.email, password: 'wrong-password' }) })));
    const counted = await d.collection('loginthrottles').findOne({ _id: `email:${burst.email}` });
    check('8 wrong passwords at the same moment: all counted, and the account is locked', counted && counted.fails === 8 && !!counted.lockedUntil, counted);

    const locked = await createUser('forgot-locked', 'customer');
    for (let i = 0; i < 5; i += 1) await guest().req('/dang-nhap', { method: 'POST', body: form({ email: locked.email, password: 'wrong-password' }) });
    check('5 wrong passwords lock the account', (await guest().req('/dang-nhap', { method: 'POST', body: form({ email: locked.email, password: locked.password }) })).status === 429);
    const link = await freshLink(locked, 0);
    await guest().req(link, { method: 'POST', body: form({ newPassword: 'locked-pass-77', confirmPassword: 'locked-pass-77' }) });
    check('a new password through the email ends the lock', (await guest().req('/dang-nhap', { method: 'POST', body: form({ email: locked.email, password: 'locked-pass-77' }) })).status === 303);
  });

  await part(b, 'staff still need the two-step code', async () => {
    const admin = await createUser('forgot-staff', 'admin');
    const link = await freshLink(admin, 0);
    await guest().req(link, { method: 'POST', body: form({ newPassword: 'staff-pass-7777', confirmPassword: 'staff-pass-7777' }) });
    const c = guest();
    const r = await c.req('/dang-nhap', { method: 'POST', body: form({ email: admin.email, password: 'staff-pass-7777' }) });
    check('the new password leads to the code page', r.status === 303 && r.location === '/dang-nhap/xac-minh', r.location);
    check('… and isn\'t in yet', (await c.req('/admin')).status !== 200);
    await passTwoStep(c, { secret: admin.twoStepSecret });
    check('… with the code it is', (await c.req('/admin')).status === 200);
  });

  await part(b, 'an account made with Google can use it too', async () => {
    const user = await createUser('forgot-google', 'customer');
    await d.collection('users').updateOne({ _id: user.id }, { $set: { passwordHash: null, googleId: `g-forgot-${Date.now()}` } });
    const link = await freshLink(user, 0);
    const r = await guest().req(link, { method: 'POST', body: form({ newPassword: 'first-pass-7777', confirmPassword: 'first-pass-7777' }) });
    check('it sets a first password', r.status === 303 && (await guest().req('/dang-nhap', { method: 'POST', body: form({ email: user.email, password: 'first-pass-7777' }) })).status === 303);
  });

  await part(b, 'in a browser: phone width, both languages, not counted as a visit', async () => {
    const { ev } = b;
    await b.viewport(390, 844);
    for (const lang of ['vi', 'en']) {
      await b.nav(`/quen-mat-khau?lang=${lang}`);
      const page = await ev(`({ wide: document.documentElement.scrollWidth, label: !!document.querySelector('label[for=forgotEmail]'), text: document.querySelector('h1').textContent })`);
      check(`390 px, ${lang}: fits, with a labelled box`, page.wide <= 390 && page.label, page);
    }
    await b.nav('/dang-nhap');
    const linkHeight = await ev(`document.querySelector('[data-forgot-link]').getBoundingClientRect().height`);
    check('the login page\'s link is big enough to tap (24 px or more)', linkHeight >= 24, linkHeight);
    const user = await createUser('forgot-browser', 'customer');
    const link = await freshLink(user, 0);
    await b.nav(link);
    const page = await ev(`({ wide: document.documentElement.scrollWidth, eyes: document.querySelectorAll('.password-toggle, [data-password-toggle]').length, labels: document.querySelectorAll('label[for=resetPassword], label[for=resetConfirm]').length })`);
    check('390 px: the new password form fits, boxes labelled', page.wide <= 390 && page.labels === 2, page);
    const counted = await d.collection('pageviews').countDocuments({ path: { $regex: '^/(quen-mat-khau|dat-lai-mat-khau)' } });
    check('these pages aren\'t in the visit counter', counted === 0, counted);
  });

  await part(b, 'no email account on the server: the page says to contact MTG', async () => {
    const PORT = 3003;
    const env = { ...process.env, PORT: String(PORT), SMTP_USER: '', SMTP_PASS: '', MAIL_TEST_DIR: '' };
    const copy = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
    try {
      let ok = false;
      for (let i = 0; i < 100 && !ok; i += 1) {
        try { ok = (await fetch(`http://localhost:${PORT}/health`)).ok; } catch { await sleep(200); }
      }
      check('a second copy without email starts', ok);
      const page = await (await fetch(`http://localhost:${PORT}/quen-mat-khau`, { headers: { cookie: 'lang=vi' } })).text();
      check('no form, and it says whom to ask', page.includes('data-reset-off') && !page.includes('action="/quen-mat-khau"'));
    } finally {
      copy.kill();
    }
  });
});
