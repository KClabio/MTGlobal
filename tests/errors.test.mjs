// Error log (lib/error-log.js): a failing page is saved once per kind of error and counted, listed in Admin → Nhật ký lỗi
// with a red count in the menu and a dashboard notice, and emailed at most once an hour (tests/run.mjs writes the
// emails to tests/output/mail instead of sending them). Customers can't open the page.
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { suite, part, check, db, BASE, ROOT, appRequire, createUser, removeLater, restoreLater, sleep } from './lib/index.mjs';

const MAIL_DIR = path.join(ROOT, 'tests', 'output', 'mail');
const MESSAGE = 'ZZ test error';
const { kindKey } = appRequire('./lib/error-log.js');

await suite(async (b) => {
  const { ev } = b;
  const d = await db();
  await restoreLater('errorlogs', { message: { $ne: MESSAGE } }); // "Đánh dấu tất cả đã xem" also touches real entries
  removeLater('errorlogs', { message: MESSAGE });
  await d.collection('errorlogs').deleteMany({ message: MESSAGE }); // left over from an interrupted run
  rmSync(MAIL_DIR, { recursive: true, force: true });
  mkdirSync(MAIL_DIR, { recursive: true });
  const admin = await createUser('errors');
  const customer = await createUser('errors-cust', 'customer');
  const boom = () => fetch(BASE + '/__test/boom?token=secret123', { headers: { accept: 'text/html' } });
  const waitFor = async (fn) => { for (let i = 0; i < 40; i++) { const v = await fn(); if (v) return v; await sleep(100); } return null; };

  await part(b, 'saved and counted', async () => {
    const first = await boom();
    check('a failing page shows the error page (500)', first.status === 500 && (await first.text()).includes('</html>'), first.status);
    await waitFor(() => d.collection('errorlogs').findOne({ message: MESSAGE }));
    await boom();
    const doc = await waitFor(() => d.collection('errorlogs').findOne({ message: MESSAGE, count: 2 }));
    check('the same error twice: one record, counted twice', !!doc && (await d.collection('errorlogs').countDocuments({ message: MESSAGE })) === 1, doc && doc.count);
    check('the record keeps the page without its query, the stack, and no user for a visitor', !!doc && doc.where === 'GET /__test/boom' && /server\.js/.test(doc.stack) && doc.userId === null && doc.seen === false, doc && { where: doc.where, userId: doc.userId });
    const fail = (message) => new Error(message); // same place in the code, as when one page fails for two records
    check('errors that differ only by an id or a number count as one kind', kindKey(fail('Cast failed for 6acb527643acc9b993aaddf8 at 12')) === kindKey(fail('Cast failed for 6acb527643acc9b993aaddf9 at 99')) && kindKey(fail('Cast failed')) !== kindKey(fail('Other failure')));
  });

  await part(b, 'one email an hour', async () => {
    // Only the alerts: the same folder also gets the request emails of other test files (lib/request-mail.js)
    const alertFiles = () => readdirSync(MAIL_DIR).filter((f) => readFileSync(path.join(MAIL_DIR, f), 'utf8').includes('alerts@example.com'));
    const mails = await waitFor(() => { const f = alertFiles(); return f.length ? f : null; });
    await sleep(300);
    const files = alertFiles();
    const mail = mails ? JSON.parse(readFileSync(path.join(MAIL_DIR, files[0]), 'utf8')) : {};
    check('two errors of the same kind send one email', files.length === 1, files.length);
    check('the email goes to ALERT_EMAIL_TO and names the error and the admin page', JSON.stringify(mail.to || '').includes('alerts@example.com') && (mail.subject || '').includes(MESSAGE) && (mail.text || '').includes('/admin/nhat-ky-loi') && !(mail.text || '').includes('secret123'), { to: mail.to, subject: mail.subject });
  });

  await part(b, 'admin page', async () => {
    await b.login(admin.sid);
    await b.setCookie('adminLang', 'vi');
    await b.nav('/admin', 300);
    const dash = await ev(`({ notice: (document.querySelector('.error-notice') || {}).textContent || '', badge: (document.querySelector('.admin-nav a[href="/admin/nhat-ky-loi"] .admin-nav-badge') || {}).textContent || '' })`);
    check('dashboard: a red notice with a link to the error log', /lỗi máy chủ chưa xem/.test(dash.notice) && /Xem nhật ký lỗi/.test(dash.notice), dash.notice);
    check('menu: "Nhật ký lỗi" shows the number of unseen errors, read out as "N lỗi mới"', /\d+.*\(\d+ lỗi mới\)/.test(dash.badge.trim()), dash.badge);
    await b.nav('/admin/nhat-ky-loi', 300);
    const row = await ev(`(() => { const r = [...document.querySelectorAll('.error-table tbody tr')].find((tr) => tr.textContent.includes(${JSON.stringify(MESSAGE)})); return r && { id: r.dataset.id, isNew: !!r.querySelector('.tag-red'), cells: [...r.children].map((td) => td.textContent.trim().replace(/\\s+/g, ' ')), stack: !!r.querySelector('details pre') }; })()`);
    check('the error log lists it: new, page, count 2, technical details folded', !!row && row.isNew && row.cells[1] === 'GET /__test/boom' && row.cells[2] === '2' && row.stack, row);
    check('the page says where alert emails go', (await ev(`document.querySelector('.error-email').textContent`)).includes('alerts@example.com'));
    // "Đã xem" on this row
    await b.clickAndWait(`.error-table tr[data-id="${row && row.id}"] form[action$="/da-xem"] button`, 300);
    const seen = await d.collection('errorlogs').findOne({ message: MESSAGE });
    check('"Đã xem" marks it seen, with a green notice', seen.seen === true && /Đã đánh dấu đã xem/.test(await ev(`document.body.textContent`)));
    // It happens again: new again, count 3
    await boom();
    const again = await waitFor(() => d.collection('errorlogs').findOne({ message: MESSAGE, count: 3 }));
    check('the same error again: count 3 and new again', !!again && again.seen === false);
    // "Đánh dấu tất cả đã xem" (only shown while something is unseen)
    await b.nav('/admin/nhat-ky-loi', 300);
    await b.clickAndWait('form[action="/admin/nhat-ky-loi/da-xem"] button', 300);
    check('"Đánh dấu tất cả đã xem": nothing unseen, no badge, no dashboard notice', (await d.collection('errorlogs').countDocuments({ seen: false })) === 0 && !(await ev(`!!document.querySelector('.admin-nav-badge')`)));
    await b.nav('/admin', 300);
    check('dashboard: no notice once everything is seen', !(await ev(`!!document.querySelector('.error-notice')`)));
    // Xoá (through the form's POST; the dialog itself is covered in admin-lists)
    const del = await fetch(BASE + `/admin/nhat-ky-loi/${row && row.id}/xoa`, { method: 'POST', redirect: 'manual', headers: { cookie: `connect.sid=${admin.sid}` } });
    check('Xoá removes it from the log', del.status === 302 && !(await d.collection('errorlogs').findOne({ message: MESSAGE })), del.status);
  });

  await part(b, 'permissions', async () => {
    const res = await fetch(BASE + '/admin/nhat-ky-loi', { redirect: 'manual', headers: { cookie: `connect.sid=${customer.sid}` } });
    check('customers get 403 on the error log', res.status === 403, res.status);
    const guest = await fetch(BASE + '/admin/nhat-ky-loi', { redirect: 'manual' });
    check('logged out: sent to the login page', guest.status === 302 && /dang-nhap/.test(guest.headers.get('location') || ''), guest.status);
  });
});
