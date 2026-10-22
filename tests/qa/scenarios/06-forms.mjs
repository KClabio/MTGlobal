// 6, 15, 18, 19, 21, 23 · Forms and their messages, sign-up, profile photos, my requests, permissions, dashboard numbers
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from '../lib/http.mjs';
import { QA_ACCOUNTS } from '../lib/data.mjs';
import { QA_PASSWORD, ROOT } from '../lib/infra.mjs';

const MARK = '[QA-FORM]';
const errorsIn = (html) => [...html.matchAll(/class="(?:form-error|field-error)[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1].trim());

export const scenarios = [
  {
    id: 6,
    name: 'Liên hệ form: correct, empty, wrong, very long, emoji and accents',
    types: ['Form Validation', 'Error Message'],
    async run(ctx) {
      const c = new Client(); await c.login(QA_ACCOUNTS.customer(13), QA_PASSWORD);
      const base = { name: 'Nguyễn Văn Thử', email: 'thu@example.com', phone: '0901234567', schoolOrCompany: 'THCS Thử', message: `${MARK} Cần tư vấn.`, interestedIn: 'khac' };
      const cases = [
        ['correct', {}, 303],
        ['empty name', { name: '   ' }, 400],
        ['no phone and no email', { phone: '', email: '' }, 400],
        ['wrong email', { email: 'thu@' }, 400],
        ['wrong phone', { phone: '12ab' }, 400],
        ['empty message', { message: '' }, 400],
        ['emoji and accents', { name: 'Trần Thị Ánh 🌟', message: `${MARK} Ứng dụng 🤖 cho học sinh lớp 6–9 “STEM”.` }, 303],
        ['unknown interest is replaced by "Khác"', { interestedIn: 'abc' }, 303],
        ['message of 20,000 characters', { message: `${MARK} ` + 'a'.repeat(20000) }, null],
        ['message of 200,000 characters (bigger than the server accepts)', { message: `${MARK} ` + 'b'.repeat(200000) }, null],
      ];
      const out = [];
      for (const [label, patch, want] of cases) {
        const r = await c.post('/lien-he', { ...base, ...patch });
        out.push({ label, status: r.status, want, messages: errorsIn(r.text).slice(0, 3), errorPage: /500|Đã xảy ra lỗi|Something went wrong/i.test((r.text.match(/<title>([^<]*)/) || [])[1] || '') });
      }
      ctx.result('cases', out);
      const wrong = out.filter((o) => o.want !== null && o.status !== o.want);
      if (wrong.length) ctx.finding({ severity: 'medium', title: 'Liên hệ form answers wrongly', detail: wrong.map((w) => `${w.label}: ${w.status}`).join('; '), fix: 'Check the validation.' });
      const longOk = out.find((o) => o.label.startsWith('message of 20,000'));
      if (longOk.status === 303) ctx.finding({ severity: 'low', title: 'No length limit on request messages', detail: 'A 20,000-character message was accepted and saved.', fix: 'Limit the message (e.g. 3,000 characters) with a counter, like the profile bio.' });
      const huge = out.find((o) => o.label.startsWith('message of 200,000'));
      if (huge.status >= 500 || huge.errorPage) ctx.finding({ severity: 'low', title: 'A too-large form shows the general error page', detail: `HTTP ${huge.status}: the visitor sees "something went wrong" instead of a message about the length.`, fix: 'Answer 413 with a clear message (or limit the field in the page).' });
      const db = await ctx.infra.db();
      const emoji = await db.collection('quoterequests').findOne({ name: 'Trần Thị Ánh 🌟' });
      ctx.result('emojiSaved', !!emoji && emoji.message.includes('🤖'));
    },
    async cleanup(ctx) { await (await ctx.infra.db()).collection('quoterequests').deleteMany({ message: { $regex: '\\[QA-FORM\\]' } }); },
  },
  {
    id: 15,
    name: 'Sign up: duplicates, weak password, two sign-ups at the same moment',
    types: ['Form Validation', 'Database', 'Error Message'],
    async run(ctx) {
      const db = await ctx.infra.db();
      const stamp = Date.now();
      const reg = (body) => new Client().post('/dang-ky', { name: 'QA Đăng ký', password: 'abcdef', confirmPassword: 'abcdef', ...body });
      const out = {};
      out.ok = (await reg({ email: `qa-signup-${stamp}@example.com` })).status;
      const dupCase = await reg({ email: `QA-SIGNUP-${stamp}@Example.com` });
      out.duplicateOtherCapitals = { status: dupCase.status, message: errorsIn(dupCase.text)[0] || null };
      out.shortPassword = (await reg({ email: `qa-signup2-${stamp}@example.com`, password: 'abc', confirmPassword: 'abc' })).status;
      out.mismatch = (await reg({ email: `qa-signup3-${stamp}@example.com`, confirmPassword: 'abcdeX' })).status;
      out.badEmail = (await reg({ email: 'not-an-email' })).status;
      const same = `qa-signup-race-${stamp}@example.com`;
      const race = await Promise.all([reg({ email: same }), reg({ email: same }), reg({ email: same })]);
      out.sameMoment = { statuses: race.map((r) => r.status), accounts: await db.collection('users').countDocuments({ email: same }), errorPages: race.filter((r) => r.status >= 500).length };
      ctx.result('cases', out);
      if (out.duplicateOtherCapitals.status !== 400) ctx.finding({ severity: 'high', title: 'The same email can sign up twice with other capitals', detail: JSON.stringify(out.duplicateOtherCapitals), fix: 'Lower-case before checking.' });
      if (out.sameMoment.accounts !== 1) ctx.finding({ severity: 'high', title: 'Two accounts with the same email', detail: JSON.stringify(out.sameMoment), fix: 'Unique index on email.' });
      if (out.sameMoment.errorPages) ctx.finding({ severity: 'low', title: 'Signing up twice at the same moment shows the error page', detail: `${out.sameMoment.errorPages} of 3 simultaneous sign-ups with one email got the "something went wrong" page instead of "this email is already registered" (only one account was made, correctly).`, fix: 'Catch the duplicate-key error on save and show the normal message.' });
      out.minPassword = 6;
      ctx.result('passwordRule', 'at least 6 characters, nothing else required');
      ctx.finding({ severity: 'low', title: 'Weak passwords are accepted', detail: 'The only rule is 6 characters: "123456" or "aaaaaa" work.', fix: 'At least 8 characters, and refuse the most common passwords.' });
    },
    async cleanup(ctx) { await (await ctx.infra.db()).collection('users').deleteMany({ email: /^qa-signup/ }); },
  },
  {
    id: 18,
    name: 'Profile photo: real image, too large, renamed document, empty file, SVG',
    types: ['File Upload', 'Form Validation', 'Error Message'],
    async run(ctx) {
      const c = new Client(); await c.login(QA_ACCOUNTS.customer(14), QA_PASSWORD);
      const jpg = readFileSync(path.join(ROOT, 'public', 'assets', 'giai-phap', 'workshop', 'hoc-sinh-lap-rap-1.jpg'));
      const send = async (bytes, name, type) => { const fd = new FormData(); fd.set('name', 'Khách hàng QA 14'); fd.set('avatar', new Blob([bytes], { type }), name); const r = await c.post('/ho-so', fd); return { status: r.status, message: (r.text.match(/class="form-alert error">\s*([^<]+)/) || [])[1]?.trim() || null }; };
      const out = {
        realJpg: await send(jpg, 'anh.jpg', 'image/jpeg'),
        tooLarge21MB: await send(Buffer.alloc(21 * 1024 * 1024, 1), 'lon.jpg', 'image/jpeg'),
        textRenamedJpg: await send(Buffer.from('%PDF-1.4 not really a picture'), 'tai-lieu.jpg', 'image/jpeg'),
        emptyFile: await send(Buffer.alloc(0), 'trong.jpg', 'image/jpeg'),
        svg: await send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'), 'hinh.svg', 'image/svg+xml'),
      };
      ctx.result('uploads', out);
      const db = await ctx.infra.db();
      const u = await db.collection('users').findOne({ email: QA_ACCOUNTS.customer(14) });
      ctx.result('avatarAfter', u.avatar);
      const accepted = Object.entries(out).filter(([k, v]) => k !== 'realJpg' && v.status === 200 && !v.message);
      if (accepted.length) ctx.finding({ severity: 'medium', title: 'Unsuitable profile photos accepted', detail: accepted.map(([k]) => k).join(', '), fix: 'Check type and content.' });
      if (out.realJpg.status !== 200) ctx.finding({ severity: 'high', title: 'A normal photo upload fails', detail: JSON.stringify(out.realJpg), fix: 'Investigate.' });
    },
    async cleanup(ctx) {
      const db = await ctx.infra.db();
      const u = await db.collection('users').findOne({ email: QA_ACCOUNTS.customer(14) });
      if (u && /^\/uploads\/images\//.test(u.avatar || '')) { try { (await import('node:fs')).unlinkSync(path.join(ROOT, 'public', u.avatar)); } catch { /* gone */ } }
      await db.collection('users').updateOne({ email: QA_ACCOUNTS.customer(14) }, { $set: { avatar: '' } });
    },
  },
  {
    id: 19,
    name: 'My requests: only my own can be opened or changed',
    types: ['Functional', 'Access control'],
    async run(ctx) {
      const db = await ctx.infra.db();
      const a = await db.collection('users').findOne({ email: QA_ACCOUNTS.customer(15) });
      const theirs = await db.collection('quoterequests').findOne({ user: { $ne: a._id }, status: 'moi' });
      const c = new Client(); await c.login(QA_ACCOUNTS.customer(15), QA_PASSWORD);
      const view = await c.get(`/tai-khoan/yeu-cau/${theirs._id}/sua`);
      const change = await c.post(`/tai-khoan/yeu-cau/${theirs._id}/sua`, { name: 'Đổi tên', message: 'Đổi nội dung', phone: '0901234567' });
      const after = await db.collection('quoterequests').findOne({ _id: theirs._id });
      const r = { openOther: view.status, changeOther: change.status, unchanged: after.message === theirs.message };
      ctx.result('otherPersonsRequest', r);
      if (view.status === 200 || !r.unchanged) ctx.finding({ severity: 'critical', title: 'A customer can open or change someone else\'s request', detail: JSON.stringify(r), fix: 'Check the owner of the request.' });
    },
  },
  {
    id: 21,
    name: 'Permissions: each role opens only its own admin pages',
    types: ['Security', 'Access control', 'Navigation'],
    async run(ctx) {
      const pages = ['/admin', '/admin/yeu-cau', '/admin/nguoi-dung', '/admin/cai-dat', '/admin/thong-tin-cong-ty', '/admin/trang/stem-lab', '/admin/robot', '/admin/du-an', '/admin/tin-tuc', '/admin/doi-tac', '/admin/dich-vu'];
      const who = { guest: new Client(), customer: new Client(), admin: new Client(), owner: new Client() };
      await who.customer.login(QA_ACCOUNTS.customer(16), QA_PASSWORD);
      await who.admin.login(QA_ACCOUNTS.admin, QA_PASSWORD);
      await who.owner.login(QA_ACCOUNTS.owner, QA_PASSWORD);
      const grid = {};
      for (const p of pages) grid[p] = Object.fromEntries(await Promise.all(Object.entries(who).map(async ([k, c]) => [k, (await c.get(p)).status])));
      ctx.result('grid', grid);
      const leaks = Object.entries(grid).filter(([, g]) => g.guest === 200 || g.customer === 200 || g.admin !== 200 || g.owner !== 200);
      if (leaks.length) ctx.finding({ severity: 'critical', title: 'Admin pages open for the wrong people', detail: JSON.stringify(leaks), fix: 'requireAdmin on every admin route.' });
      // An admin can't change roles (only the owner can)
      const db = await ctx.infra.db();
      const cust = await db.collection('users').findOne({ email: QA_ACCOUNTS.customer(17) });
      const r = await who.admin.post(`/admin/nguoi-dung/${cust._id}/vai-tro`, { role: 'admin' });
      const role = (await db.collection('users').findOne({ _id: cust._id })).role;
      ctx.result('adminPromotes', { status: r.status, roleAfter: role });
      if (role !== 'customer') ctx.finding({ severity: 'critical', title: 'An admin could make someone admin', detail: JSON.stringify({ status: r.status, role }), fix: 'canChangeRole on the route.' });
    },
    async cleanup(ctx) { await (await ctx.infra.db()).collection('users').updateOne({ email: QA_ACCOUNTS.customer(17) }, { $set: { role: 'customer' } }); },
  },
  {
    id: 23,
    name: 'Dashboard numbers match the database; query speed and indexes',
    types: ['Database', 'Functional', 'Integration'],
    async run(ctx) {
      const db = await ctx.infra.db();
      const a = new Client(); await a.login(QA_ACCOUNTS.admin, QA_PASSWORD);
      const html = (await a.get('/admin')).text;
      const total = await db.collection('quoterequests').countDocuments();
      const byStatus = Object.fromEntries(await Promise.all(['moi', 'da_lien_he', 'hoan_tat'].map(async (s) => [s, await db.collection('quoterequests').countDocuments({ status: s })])));
      const shown = [...html.matchAll(/data-count(?:-to)?="(\d+)"/g)].map((m) => +m[1]);
      const nums = [...html.replace(/<[^>]+>/g, ' ').matchAll(/\b\d{1,5}\b/g)].map((m) => +m[0]);
      ctx.result('dashboard', { total, byStatus, totalShown: nums.includes(total) || shown.includes(total), newShown: nums.includes(byStatus.moi) || shown.includes(byStatus.moi) });
      // How the main lists are read: whole-collection scans are fine at this size, but not at 100× more
      const plans = {};
      const explain = async (name, coll, filter, sort) => {
        const e = await db.collection(coll).find(filter).sort(sort).explain('executionStats');
        const stage = JSON.stringify(e.queryPlanner.winningPlan).match(/"stage":"(COLLSCAN|IXSCAN)"/);
        plans[name] = { stage: stage ? stage[1] : '?', docsExamined: e.executionStats.totalDocsExamined, returned: e.executionStats.nReturned, ms: e.executionStats.executionTimeMillis };
      };
      await explain('requests by date (admin list, dashboard)', 'quoterequests', {}, { createdAt: -1 });
      await explain('requests with one status (status tabs)', 'quoterequests', { status: 'moi' }, { createdAt: -1 });
      await explain('my requests (Tài khoản)', 'quoterequests', { user: (await db.collection('users').findOne({ email: QA_ACCOUNTS.customer(1) }))._id }, { createdAt: -1 });
      await explain('users by date (Người dùng)', 'users', {}, { createdAt: -1 });
      await explain('login by email', 'users', { email: QA_ACCOUNTS.customer(1) }, {});
      ctx.result('queries', plans);
      const scans = Object.entries(plans).filter(([, p]) => p.stage === 'COLLSCAN');
      if (scans.length) ctx.finding({ severity: 'low', title: 'Request lists read the whole collection (no index)', detail: scans.map(([k, p]) => `${k}: ${p.docsExamined} records read for ${p.returned}`).join('; ') + '. Fast today (hundreds of requests); slower with tens of thousands.', fix: 'Indexes on quoterequests { createdAt: -1 }, { status: 1, createdAt: -1 }, { user: 1, createdAt: -1 }.' });
    },
  },
];
