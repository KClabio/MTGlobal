// Form posts sent from another website are refused (lib/same-origin.js): guest request, profile, admin save,
// logout; the same forms from this site (and clients that send no Origin/Referer) still work; pages can still be
// opened from links on other sites.
import { suite, part, check, db, createUser, sidClient, removeLater, stamp } from './lib/index.mjs';

const form = (o) => new URLSearchParams(o);
const EVIL = { origin: 'https://example.org', referer: 'https://example.org/trang' };
const OWN = { origin: 'http://localhost:3001', referer: 'http://localhost:3001/lien-he' };
const REFUSED_TEXT = 'được gửi từ một trang web khác';

await suite(async (b) => {
  const d = await db();
  const NAME = `ZZ security ${stamp}`;
  const QUESTION = `ZZ security question ${stamp}`;
  removeLater('quoterequests', { name: { $regex: '^ZZ security' } });
  removeLater('helpitems', { questionVi: { $regex: '^ZZ security' } });
  const request = (extra = {}) => form({ name: NAME, phone: '0912345678', email: '', message: 'cross-site check', interestedIn: 'khac', agreePrivacy: '1', ...extra });
  const saved = async () => d.collection('quoterequests').countDocuments({ name: NAME });

  await part(b, 'guest request form', async () => {
    const guest = sidClient('none');
    let r = await guest.req('/lien-he', { method: 'POST', body: request(), headers: EVIL });
    check('sent from another website: refused (403) with a clear message, in the page language', r.status === 403 && r.text.includes(REFUSED_TEXT), r.status);
    check('… nothing saved', (await saved()) === 0);
    r = await guest.req('/lien-he', { method: 'POST', body: request(), headers: { referer: 'https://example.org/x' } });
    check('only a Referer of another site (no Origin): refused too', r.status === 403);
    r = await guest.req('/lien-he', { method: 'POST', body: request(), headers: { origin: 'null' } });
    check('Origin "null" (a sandboxed frame or a data: page): refused', r.status === 403);
    r = await guest.req('/lien-he', { method: 'POST', body: request(), headers: { origin: 'http://localhost:3001.example.org' } });
    check('a look-alike address (localhost:3001.example.org): refused', r.status === 403);
    check('… still nothing saved', (await saved()) === 0);
    r = await guest.req('/lien-he', { headers: EVIL });
    check('opening a page from a link on another site still works (200)', r.status === 200);
  });

  await part(b, 'logged-in customer', async () => {
    const cust = await createUser('sec-cust', 'customer');
    const c = sidClient(cust.sid);
    let r = await c.req('/lien-he', { method: 'POST', body: request(), headers: OWN });
    check('the same request from this site: sent (303 → thank-you)', r.status === 303 && (await saved()) === 1, r.status);
    r = await c.req('/lien-he', { method: 'POST', body: request(), headers: {} });
    check('… and with no Origin/Referer at all (a script, an old browser): sent', r.status === 303 && (await saved()) === 2, r.status);
    r = await c.req('/ho-so', { method: 'POST', body: form({ name: 'ZZ hacked name', phone: '', schoolOrCompany: '', bio: '' }), headers: EVIL });
    const user = await d.collection('users').findOne({ _id: cust.id });
    check('a profile change sent from another site: refused, the name unchanged', r.status === 403 && user.name !== 'ZZ hacked name', { status: r.status, name: user.name });
    r = await c.req('/dang-xuat', { method: 'POST', headers: EVIL });
    check('logging out from another site: refused, still logged in', r.status === 403 && (await c.req('/ho-so')).status === 200);
  });

  await part(b, 'admin save', async () => {
    const admin = await createUser('sec-admin', 'admin');
    const c = sidClient(admin.sid);
    const help = form({ group: 'su-dung', questionVi: QUESTION, questionEn: '', answerVi: 'x', answerEn: '', published: 'on' });
    let r = await c.req('/admin/ho-tro/moi', { method: 'POST', body: help, headers: EVIL });
    check('an admin save sent from another site: refused, nothing created', r.status === 403 && !(await d.collection('helpitems').findOne({ questionVi: QUESTION })), r.status);
    r = await c.req('/admin/ho-tro/moi', { method: 'POST', body: help, headers: { origin: 'http://localhost:3001' } });
    check('… the same save from this site works', r.status === 302 && !!(await d.collection('helpitems').findOne({ questionVi: QUESTION })), r.status);
  });

  await part(b, 'a real browser on this site', async () => {
    const cust = await createUser('sec-browser', 'customer');
    await b.login(cust.sid);
    await b.nav('/lien-he', 400);
    await b.ev(`(() => { const f = document.querySelector('form[action="/lien-he"]'); f.querySelector('[name=name]').value = ${JSON.stringify(NAME)}; f.querySelector('[name=phone]').value = '0912345678'; f.querySelector('[name=message]').value = 'browser check'; const tick = f.querySelector('[name=agreePrivacy]'); if (tick) tick.checked = true; })()`);
    const l = b.waitLoad(); await b.ev(`document.querySelector('form[action="/lien-he"]').requestSubmit()`); await l;
    check('Chrome sends the form with this site\'s Origin: accepted (thank-you page)', (await b.ev('location.search')).includes('da-gui') && (await saved()) === 3, await b.ev('location.href'));
  });
});
