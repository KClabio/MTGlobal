// Admin lists: permissions (owner / admin / customer), green/red notifications, drag-and-drop order (mouse, keyboard,
// endpoint rules, public order), drag look, name search, equipment part chips, request delete, delete dialog, menu scroll.
import { existsSync, writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { suite, part, check, db, BASE, ROOT, appRequire, createUser, removeLater, restoreLater, stamp } from './lib/index.mjs';

const { projectLevel } = appRequire('./lib/project-levels.js');
const MARK = `ZZTEST-lists-${stamp}`;
const form = (o) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.append(k, v); return fd; };

await suite(async (b) => {
  const { send, ev, sleep } = b;
  const shot = (name) => b.shot(name);
  const d = await db();
  // Every list's order is put back afterwards; test records are removed
  for (const c of ['projects', 'products', 'partners', 'articles', 'services']) await restoreLater(c, {});
  await restoreLater('sitesettings', {});
  removeLater('projects', { titleVi: { $regex: '^' + MARK } });
  removeLater('articles', { titleVi: { $regex: '^' + MARK } });
  removeLater('products', { nameVi: { $regex: '^' + MARK } });
  removeLater('partners', { name: { $regex: '^(' + MARK + '|ZZ Temp Partner)' } });
  removeLater('quoterequests', { name: { $regex: '^' + MARK } });
  const admin = await createUser('lists');
  const signIn = async () => { await b.login(admin.sid); await b.setCookie('adminLang', 'vi'); };
  // Test items are removed as soon as a part is done, so later parts see the real lists (counts, chips)
  const purge = async () => {
    for (const [c, field] of [['projects', 'titleVi'], ['articles', 'titleVi'], ['products', 'nameVi'], ['partners', 'name'], ['quoterequests', 'name']]) await d.collection(c).deleteMany({ [field]: { $regex: '^' + MARK } });
  };

  await part(b, 'permissions', async () => {
    const mail = (n) => `zztest-perm-${n}-${stamp}@example.com`;
    const client = () => {
      let sid = null;
      return {
        get sid() { return sid; },
        set sid(v) { sid = v; },
        async req(path, { method = 'GET', body } = {}) {
          const res = await fetch(BASE + path, { method, body, redirect: 'manual', headers: sid ? { cookie: `connect.sid=${sid}` } : {} });
          const set = res.headers.getSetCookie().find((c) => c.startsWith('connect.sid='));
          if (set) sid = set.split(';')[0].slice('connect.sid='.length);
          return { status: res.status, location: res.headers.get('location'), text: await res.text() };
        },
      };
    };
    const users = d.collection('users');
    const names = ['owner', 'owner2', 'admin1', 'admin2', 'cust1', 'cust2'];
    const c = {};
    const id = {};
    for (const n of names) {
      c[n] = client();
      const r = await c[n].req('/dang-ky', { method: 'POST', body: new URLSearchParams({ name: `ZZ ${n}`, email: mail(n), password: 'secret1', confirmPassword: 'secret1' }) });
      if (r.status !== 303) throw new Error(`register ${n} failed: ${r.status}`);
      await c[n].req('/dang-nhap', { method: 'POST', body: new URLSearchParams({ email: mail(n), password: 'secret1' }) }); // signing up doesn't log in
      id[n] = String((await users.findOne({ email: mail(n) }))._id);
    }
    await users.updateMany({ email: { $in: [mail('owner'), mail('owner2')] } }, { $set: { role: 'owner' } });
    await users.updateMany({ email: { $in: [mail('admin1'), mail('admin2')] } }, { $set: { role: 'admin' } });
    // Give cust1 a request and a fake local avatar to check what deletion keeps/removes
    await d.collection('quoterequests').insertOne({ name: `${MARK}-perm-request`, phone: '0912345678', email: '', schoolOrCompany: '', message: 'x', interestedIn: 'khac', status: 'moi', user: new mongoose.Types.ObjectId(id.cust1), createdAt: new Date(), updatedAt: new Date() });
    const avatarUrl = `/uploads/images/zztest-avatar-${stamp}.png`;
    writeFileSync(`${ROOT}public${avatarUrl}`, 'x');
    await users.updateOne({ email: mail('cust1') }, { $set: { avatar: avatarUrl } });
    const exists = async (n) => !!(await users.findOne({ email: mail(n) }));
    const roleOf = async (n) => (await users.findOne({ email: mail(n) }))?.role;
    const del = (actor, target) => c[actor].req(`/admin/nguoi-dung/${id[target]}/xoa`, { method: 'POST' });
    const setRole = (actor, target, role) => c[actor].req(`/admin/nguoi-dung/${id[target]}/vai-tro`, { method: 'POST', body: new URLSearchParams({ role }) });

    check('customer cannot open /admin (403)', (await c.cust2.req('/admin')).status === 403);
    check('owner can open /admin', (await c.owner.req('/admin')).status === 200);
    check('owner sees "Quản trị" link in header menu', (await c.owner.req('/')).text.includes('href="/admin"'));
    let page = await c.admin1.req('/admin/nguoi-dung');
    check('admin sees delete button for customers only', page.text.includes(`/admin/nguoi-dung/${id.cust2}/xoa`) && !page.text.includes(`/admin/nguoi-dung/${id.admin2}/xoa`) && !page.text.includes(`/admin/nguoi-dung/${id.owner}/xoa`));
    check('admin sees no role buttons', !page.text.includes('/vai-tro'));
    let r = await del('admin1', 'admin2');
    check('admin cannot delete another admin (403, still exists)', r.status === 403 && (await exists('admin2')) && r.text.includes('Bạn không có quyền'));
    r = await del('admin1', 'owner');
    check('admin cannot delete the owner (403)', r.status === 403 && (await exists('owner')));
    r = await setRole('admin1', 'cust2', 'admin');
    check('admin cannot promote a customer (403)', r.status === 403 && (await roleOf('cust2')) === 'customer');
    r = await setRole('admin1', 'admin2', 'customer');
    check('admin cannot demote another admin (403)', r.status === 403 && (await roleOf('admin2')) === 'admin');
    const cust1SidBefore = c.cust1.sid;
    r = await del('admin1', 'cust1');
    check('admin deletes a customer (redirect ok=deleted)', r.status === 302 && r.location === '/admin/nguoi-dung' && !(await exists('cust1')));
    const reqDoc = await d.collection('quoterequests').findOne({ name: `${MARK}-perm-request` });
    check('their request is kept, with user unset', reqDoc && reqDoc.user === null);
    const sessLeft = await d.collection('sessions').countDocuments({ session: { $regex: `"userId":"${id.cust1}"` } });
    check('their sessions are deleted', sessLeft === 0);
    c.cust1.sid = cust1SidBefore;
    const afterProfile = await c.cust1.req('/ho-so');
    check('their old cookie is no longer logged in (redirect to login)', afterProfile.status === 302 && afterProfile.location.startsWith('/dang-nhap'));
    check('their avatar file is removed', !existsSync(`${ROOT}public${avatarUrl}`));
    page = await c.owner.req('/admin/nguoi-dung');
    check('owner sees role + delete buttons for admins and customers, none for owners', page.text.includes(`/admin/nguoi-dung/${id.admin2}/xoa`) && page.text.includes(`/admin/nguoi-dung/${id.admin2}/vai-tro`) && !page.text.includes(`/admin/nguoi-dung/${id.owner2}/xoa`) && !page.text.includes(`/admin/nguoi-dung/${id.owner2}/vai-tro`));
    r = await setRole('owner', 'cust2', 'admin');
    check('owner promotes customer to admin', r.location === '/admin/nguoi-dung' && (await roleOf('cust2')) === 'admin');
    r = await setRole('owner', 'cust2', 'customer');
    check('owner demotes admin back to customer', r.location === '/admin/nguoi-dung' && (await roleOf('cust2')) === 'customer');
    r = await setRole('owner', 'cust2', 'owner');
    check('role form cannot create an owner (falls back to customer)', (await roleOf('cust2')) === 'customer');
    r = await del('owner', 'owner');
    check('owner cannot delete themselves (403)', r.status === 403 && (await exists('owner')));
    r = await setRole('owner', 'owner', 'customer');
    check('owner cannot demote themselves (403)', r.status === 403 && (await roleOf('owner')) === 'owner');
    r = await del('owner', 'owner2');
    check('owner cannot delete another owner (403)', r.status === 403 && (await exists('owner2')));
    r = await setRole('owner', 'owner2', 'customer');
    check('owner cannot demote another owner (403)', r.status === 403 && (await roleOf('owner2')) === 'owner');
    r = await del('owner', 'admin2');
    check('owner deletes an admin', r.location === '/admin/nguoi-dung' && !(await exists('admin2')));
    r = await c.owner.req('/admin/nguoi-dung/not-an-id/xoa', { method: 'POST' });
    check('invalid id handled (redirect, no crash)', r.status === 302 && r.location === '/admin/nguoi-dung');
    const fresh = client();
    r = await fresh.req('/dang-nhap', { method: 'POST', body: new URLSearchParams({ email: mail('owner'), password: 'secret1' }) });
    check('owner login lands on Trang chủ (not the admin), like everyone', r.status === 303 && r.location === '/', r);
  });

  await part(b, 'notifications (green / red)', async () => {
    const mail = (n) => `zztest-flash-${n}-${stamp}@example.com`;
    const origService = await d.collection('services').findOne({ slug: 'tu-van-du-hoc' });
    const origSettings = await d.collection('sitesettings').findOne({});
    const client = () => {
      let cookie = 'adminLang=vi';
      return {
        cookie: () => cookie,
        async req(path, { method = 'GET', body, referer } = {}) {
          const headers = { cookie };
          if (referer) headers.referer = BASE + referer;
          const res = await fetch(BASE + path, { method, body, headers, redirect: 'manual' });
          const set = res.headers.getSetCookie().find((c) => c.startsWith('connect.sid='));
          if (set) cookie = set.split(';')[0] + '; adminLang=vi';
          return { status: res.status, location: res.headers.get('location'), text: await res.text() };
        },
        // POST then follow the redirect, returning the page the admin lands on
        async act(path, body, referer) {
          const r = await this.req(path, { method: 'POST', body, referer });
          if (r.status !== 302) return { ...r, landed: r };
          const landed = await this.req(r.location);
          return { ...r, landed };
        },
      };
    };
    const toast = (html) => {
      const m = html.match(/id="adminToast"[^>]*?data-type="(success|error)" data-text="([^"]*)"/);
      return m ? { type: m[1], text: m[2].replace(/&#34;|&quot;/g, '"') } : null;
    };
    const adminC = client(), ownerC = client();
    for (const [c, n] of [[adminC, 'admin'], [ownerC, 'owner']]) {
      await c.req('/dang-ky', { method: 'POST', body: new URLSearchParams({ name: `ZZ ${n}`, email: mail(n), password: 'secret1', confirmPassword: 'secret1' }) });
      await c.req('/dang-nhap', { method: 'POST', body: new URLSearchParams({ email: mail(n), password: 'secret1' }) });
      await d.collection('users').updateOne({ email: mail(n) }, { $set: { role: n } });
    }
    const id = async (col, q) => String((await d.collection(col).findOne(q))._id);
    const expectToast = (label, page, type, includes) => {
      const t = toast(page.text);
      check(label, t && t.type === type && (!includes || t.text.includes(includes)), t);
    };
    // Successes (green)
    let r = await adminC.act('/admin/du-an/moi', form({ titleVi: `${MARK} dự án` }));
    expectToast('project created -> green "Đã thêm"', r.landed, 'success', `Đã thêm “${MARK} dự án”`);
    const pid = await id('projects', { titleVi: `${MARK} dự án` });
    r = await adminC.act(`/admin/du-an/${pid}/sua`, form({ titleVi: `${MARK} dự án 2` }));
    expectToast('project updated -> green "Đã lưu thay đổi"', r.landed, 'success', `“${MARK} dự án 2”`);
    check('notification shows once (reload has none)', toast((await adminC.req('/admin/du-an')).text) === null);
    r = await adminC.act(`/admin/du-an/${pid}/xoa`, new URLSearchParams());
    expectToast('project deleted -> green "Đã xoá"', r.landed, 'success', `Đã xoá “${MARK} dự án 2”`);
    r = await adminC.act('/admin/san-pham/moi', form({ section: 'equipment', nameVi: `${MARK} thiết bị`, category: 'stem-equipment' }));
    expectToast('equipment created -> green', r.landed, 'success', `${MARK} thiết bị`);
    const eid = await id('products', { nameVi: `${MARK} thiết bị` });
    r = await adminC.act(`/admin/san-pham/${eid}/sua`, form({ nameVi: `${MARK} thiết bị`, category: 'stem-equipment' }));
    expectToast('equipment updated -> green', r.landed, 'success');
    r = await adminC.act(`/admin/san-pham/${eid}/xoa`, new URLSearchParams());
    expectToast('equipment deleted -> green, back on STEM list', r.landed, 'success', 'Đã xoá');
    check('... and lands on /admin/thiet-bi', r.location === '/admin/thiet-bi');
    r = await adminC.act('/admin/doi-tac/moi', form({ name: `${MARK} đối tác` }));
    expectToast('partner created -> green', r.landed, 'success');
    const ptid = await id('partners', { name: `${MARK} đối tác` });
    r = await adminC.act(`/admin/doi-tac/${ptid}/sua`, form({ name: `${MARK} đối tác`, url: 'https://example.com' }));
    expectToast('partner updated -> green', r.landed, 'success');
    r = await adminC.act('/admin/tin-tuc/moi', form({ titleVi: `${MARK} tin`, published: 'on' }));
    expectToast('article created -> green', r.landed, 'success');
    const aid = await id('articles', { titleVi: `${MARK} tin` });
    r = await adminC.act(`/admin/tin-tuc/${aid}/sua`, form({ titleVi: `${MARK} tin` }));
    expectToast('article updated -> green', r.landed, 'success');
    r = await adminC.act(`/admin/tin-tuc/${aid}/xoa`, new URLSearchParams());
    expectToast('article deleted -> green', r.landed, 'success');
    r = await adminC.act(`/admin/dich-vu/${origService._id}/sua`, form({ titleVi: origService.titleVi, titleEn: origService.titleEn, summaryVi: origService.summaryVi, summaryEn: origService.summaryEn, bodyVi: origService.bodyVi, bodyEn: origService.bodyEn }));
    expectToast('service updated -> green', r.landed, 'success', origService.titleVi);
    // Company info (Thông tin công ty), saved with its current values
    r = await adminC.act('/admin/thong-tin-cong-ty', new URLSearchParams({ companyProfile: origSettings.companyProfile || '', companyProfileEn: origSettings.companyProfileEn || '', address: origSettings.contactInfo?.address || '', phone: origSettings.contactInfo?.phone || '', email: origSettings.contactInfo?.email || '', mapEmbedUrl: origSettings.contactInfo?.mapEmbedUrl || '' }));
    expectToast('company info saved -> green', r.landed, 'success', 'Đã lưu');
    const reqDoc = await d.collection('quoterequests').insertOne({ name: `${MARK} khách`, phone: '0912345678', email: '', schoolOrCompany: '', message: 'x', interestedIn: 'khac', status: 'moi', user: null, createdAt: new Date(), updatedAt: new Date() });
    r = await adminC.act(`/admin/yeu-cau/${reqDoc.insertedId}/trang-thai`, new URLSearchParams({ status: 'hoan_tat' }), '/admin/yeu-cau');
    expectToast('request status changed -> green, names the status', r.landed, 'success', '“Hoàn tất”');
    check('... and returns to the referring admin page', r.location === '/admin/yeu-cau', r.location);
    const evil = await fetch(BASE + `/admin/yeu-cau/${reqDoc.insertedId}/trang-thai`, { method: 'POST', body: new URLSearchParams({ status: 'moi' }), redirect: 'manual', headers: { cookie: adminC.cookie(), referer: 'https://evil.example/phish' } });
    check('an outside Referer is ignored (no open redirect)', evil.headers.get('location') === '/admin/yeu-cau', evil.headers.get('location'));
    const cust = client();
    await cust.req('/dang-ky', { method: 'POST', body: new URLSearchParams({ name: 'ZZ cust', email: mail('cust'), password: 'secret1', confirmPassword: 'secret1' }) });
    await cust.req('/dang-nhap', { method: 'POST', body: new URLSearchParams({ email: mail('cust'), password: 'secret1' }) });
    const custId = await id('users', { email: mail('cust') });
    r = await ownerC.act(`/admin/nguoi-dung/${custId}/vai-tro`, new URLSearchParams({ role: 'admin' }));
    expectToast('owner promotes user -> green', r.landed, 'success', 'ZZ cust');
    r = await ownerC.act(`/admin/nguoi-dung/${custId}/xoa`, new URLSearchParams());
    expectToast('owner deletes user -> green', r.landed, 'success', 'ZZ cust');
    // Failures (red)
    r = await adminC.act('/admin/du-an/moi', form({ titleVi: '' }));
    expectToast('empty required name -> red toast', r.landed, 'error', 'bắt buộc');
    check('... and the form is re-shown (400) with the inline error', r.status === 400 && r.text.includes('form-alert error'));
    const fd = new FormData(); fd.append('titleVi', `${MARK} x`); fd.append('images', new Blob(['not an image'], { type: 'text/plain' }), 'notes.txt');
    r = await adminC.act('/admin/du-an/moi', fd);
    expectToast('bad upload type -> red toast', r.landed, 'error', 'không được hỗ trợ');
    r = await adminC.act(`/admin/du-an/${pid}/sua`, form({ titleVi: 'x' }));
    expectToast('editing a deleted project -> red "Không tìm thấy"', r.landed, 'error', 'Không tìm thấy');
    r = await adminC.act(`/admin/tin-tuc/${aid}/xoa`, new URLSearchParams());
    expectToast('deleting an already-deleted article -> red', r.landed, 'error', 'Không tìm thấy');
    r = await adminC.req(`/admin/du-an/${pid}/sua`);
    check('opening the edit page of a deleted item -> back to list with red', r.status === 302 && toast((await adminC.req(r.location)).text)?.type === 'error');
    const ownerId = await id('users', { email: mail('owner') });
    r = await adminC.act(`/admin/nguoi-dung/${ownerId}/xoa`, new URLSearchParams());
    check('admin deleting the owner -> 403 with red toast', r.status === 403 && toast(r.text)?.type === 'error');
    // Forced database failure: a collection validator makes the next partner save fail
    await d.command({ collMod: 'partners', validator: { name: { $type: 'int' } }, validationLevel: 'strict', validationAction: 'error' });
    try {
      r = await adminC.act(`/admin/doi-tac/${ptid}/sua`, form({ name: `${MARK} đối tác 2` }), '/admin/doi-tac');
      expectToast('database error on save -> red "Không thực hiện được"', r.landed, 'error', 'Không thực hiện được');
      check('... and the change was not saved', (await d.collection('partners').findOne({ _id: new mongoose.Types.ObjectId(ptid) })).name === `${MARK} đối tác`);
    } finally {
      await d.command({ collMod: 'partners', validator: {}, validationLevel: 'off' });
    }
    r = await adminC.act(`/admin/doi-tac/${ptid}/xoa`, new URLSearchParams());
    expectToast('partner deleted after validator removed -> green', r.landed, 'success');
    // English admin gets English notifications
    const en = await createUser('flash-en');
    const enCookie = `connect.sid=${en.sid}; adminLang=en`;
    r = await fetch(BASE + '/admin/du-an/moi', { method: 'POST', body: form({ titleVi: `${MARK} en` }), redirect: 'manual', headers: { cookie: enCookie } });
    const enPage = await (await fetch(BASE + r.headers.get('location'), { headers: { cookie: enCookie } })).text();
    expectToast('English admin: English success text', { text: enPage }, 'success', `“${MARK} en” was added.`);
    await purge();
  });

  await part(b, 'drag-and-drop order', async () => {
    const cookie = `connect.sid=${admin.sid}`;
    const cust = await createUser('order-cust', 'customer');
    const get = (p, ck = cookie) => fetch(BASE + p, { headers: { cookie: ck }, redirect: 'manual' });
    const postJson = (p, body, ck = cookie) => fetch(BASE + p, { method: 'POST', headers: { cookie: ck, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const postForm = (p, fields) => fetch(BASE + p, { method: 'POST', body: form(fields), redirect: 'manual', headers: { cookie } });
    const rowIds = (html) => [...html.matchAll(/<tr data-id="([a-f0-9]{24})"/g)].map((m) => m[1]);
    // Split
    const robotsHtml = await (await get('/admin/robot')).text();
    const equipHtml = await (await get('/admin/thiet-bi')).text();
    const robotIds = rowIds(robotsHtml), equipIds = rowIds(equipHtml);
    const dbRobots = await d.collection('products').countDocuments({ category: { $ne: 'stem-equipment' } });
    const dbEquip = await d.collection('products').countDocuments({ category: 'stem-equipment' });
    check(`Robot list has only robots (${robotIds.length}) and STEM list only equipment (${equipIds.length})`, robotIds.length === dbRobots && equipIds.length === dbEquip && !robotIds.some((x) => equipIds.includes(x)));
    check('sidebar has Robot and Thiết bị STEM items', robotsHtml.includes('href="/admin/robot"') && robotsHtml.includes('href="/admin/thiet-bi"') && !robotsHtml.includes('href="/admin/san-pham"'));
    const old = await get('/admin/san-pham');
    check('/admin/san-pham redirects to /admin/robot', old.status === 302 && old.headers.get('location') === '/admin/robot');
    check('robot form: robot-type dropdown with the 4 robot types only', await (await get('/admin/robot/moi')).text().then((h) => (h.match(/<option value="robot-/g) || []).length === 4 && !h.includes('value="stem-equipment"')));
    check('equipment form: no type dropdown, has group field', await (await get('/admin/thiet-bi/moi')).text().then((h) => !h.includes('<select class="form-control" name="category"') && h.includes('name="subcategory"')));
    check('no form has an order field', (await Promise.all(['/admin/du-an/moi', '/admin/robot/moi', '/admin/thiet-bi/moi', '/admin/doi-tac/moi', '/admin/tin-tuc/moi'].map(async (p) => (await (await get(p)).text()).includes('name="order"')))).every((x) => !x));
    let r = await postForm('/admin/san-pham/moi', { section: 'equipment', nameVi: `${MARK} TB`, category: 'robot-cat-co', descriptionVi: '' });
    const eq = await d.collection('products').findOne({ nameVi: `${MARK} TB` });
    check('equipment created from STEM section is stem-equipment (posted robot type ignored), back to its list', r.headers.get('location') === '/admin/thiet-bi' && eq && eq.category === 'stem-equipment');
    check('new equipment is appended last', eq && eq.order > Math.max(...(await d.collection('products').find({ category: 'stem-equipment', _id: { $ne: eq._id } }).toArray()).map((p) => p.order || 0)));
    r = await postForm('/admin/san-pham/moi', { section: 'robot', nameVi: `${MARK} RB`, category: 'stem-equipment', descriptionVi: '' });
    check('robot section rejects a non-robot category', r.status === 400 && !(await d.collection('products').findOne({ nameVi: `${MARK} RB` })));
    r = await postForm('/admin/tin-tuc/moi', { titleVi: `${MARK} tin`, bodyVi: '', published: 'on' });
    const newsHtml = await (await fetch(BASE + '/tin-tuc')).text();
    const firstCard = (newsHtml.match(/<a class="card" href="\/tin-tuc\/([a-f0-9]{24})"/) || [])[1];
    const newArt = await d.collection('articles').findOne({ titleVi: `${MARK} tin` });
    check('new article appears first on /tin-tuc', newArt && firstCard === String(newArt._id), { firstCard, newId: newArt && String(newArt._id) });
    // Order endpoint rules
    const projIds = rowIds(await (await get('/admin/du-an')).text());
    check('ids from another section -> 400', (await postJson('/admin/thu-tu/robots', { ids: equipIds })).status === 400);
    check('a missing id -> 400', (await postJson('/admin/thu-tu/projects', { ids: projIds.slice(1) })).status === 400);
    check('an extra id -> 400', (await postJson('/admin/thu-tu/projects', { ids: [...projIds, robotIds[0]] })).status === 400);
    check('duplicate ids -> 400', (await postJson('/admin/thu-tu/projects', { ids: [...projIds.slice(0, -1), projIds[0]] })).status === 400);
    check('unknown type -> 400', (await postJson('/admin/thu-tu/users', { ids: projIds })).status === 400);
    check('customer -> 403', (await postJson('/admin/thu-tu/projects', { ids: projIds }, `connect.sid=${cust.sid}`)).status === 403);
    // Real drags in the browser, then the admin + public order
    await signIn();
    await b.viewport(1280, 1000);
    const nav = (p) => b.nav(p, 300);
    const domIds = () => ev(`[...document.querySelectorAll('tbody[data-sortable] tr[data-id]')].map(r => r.dataset.id)`);
    const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
    const drag = async (from, to) => {
      const pts = await ev(`(() => { const rows = document.querySelectorAll('tbody[data-sortable] tr[data-id]');
        const h = rows[${from}].querySelector('.drag-handle').getBoundingClientRect(); const t = rows[${to}].getBoundingClientRect();
        return { x: h.left + h.width / 2, y: h.top + h.height / 2, ty: t.top + t.height * (${to} > ${from} ? 0.8 : 0.2) }; })()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts.x, y: pts.y });
      await mouse('mousePressed', pts.x, pts.y);
      for (let i = 1; i <= 12; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts.x, y: pts.y + ((pts.ty - pts.y) * i) / 12, button: 'left', buttons: 1 }); await sleep(30); }
      await mouse('mouseReleased', pts.x, pts.ty);
      await sleep(600); // let the save request finish
    };
    const cases = [
      { admin: '/admin/du-an', pub: '/giai-phap/du-an', col: 'projects', marker: (x) => '/giai-phap/du-an/' + x._id },
      { admin: '/admin/robot', pub: '/san-pham', col: 'products', marker: (x) => 'href="/san-pham/' + x.category + '"' },
      { admin: '/admin/thiet-bi', pub: '/giai-phap/thiet-bi', col: 'products', marker: (x) => '/giai-phap/thiet-bi/' + x._id },
      { admin: '/admin/doi-tac', pub: '/', col: 'partners', marker: (x) => x.logo },
      { admin: '/admin/tin-tuc', pub: '/tin-tuc', col: 'articles', marker: (x) => '/tin-tuc/' + x._id },
      { admin: '/admin/dich-vu', pub: '/dich-vu', col: 'services', marker: (x) => 'href="/dich-vu/' + x.slug + '"' },
    ];
    for (const c of cases) {
      await nav(c.admin);
      const before = await domIds();
      if (before.length < 2) continue;
      const target = Math.min(3, before.length - 1);
      await drag(0, target);
      const afterDom = await domIds();
      const toastText = await ev(`document.getElementById('adminToast').textContent`);
      await nav(c.admin);
      const afterReload = await domIds();
      const expected = [...before.slice(1, target + 1), before[0], ...before.slice(target + 1)];
      check(`${c.admin}: dragged first row down, saved, survives reload`, JSON.stringify(afterDom) === JSON.stringify(expected) && JSON.stringify(afterReload) === JSON.stringify(expected) && /lưu|saved/i.test(toastText), { before: before.length, afterReload: afterReload.length, toastText });
      const docs = await d.collection(c.col).find({ _id: { $in: expected.map((x) => new mongoose.Types.ObjectId(x)) } }).toArray();
      const docOf = (x) => docs.find((y) => String(y._id) === x);
      // Projects are shown per school level on the public page: the order holds within one level
      const inLevel = c.col === 'projects' ? expected.filter((x) => projectLevel(docOf(x)) === 'thcs') : expected;
      const names = inLevel.map((x) => c.marker(docOf(x)));
      const fullHtml = await (await fetch(BASE + c.pub)).text();
      const pubHtml = fullHtml.slice(fullHtml.indexOf('</header>'));
      const positions = names.map((n) => pubHtml.indexOf(n)).filter((p) => p > -1);
      check(`${c.pub}: public page follows the new order (${positions.length} items found)`, positions.length >= 2 && positions.every((p, i) => i === 0 || p > positions[i - 1]), { names: names.slice(0, 4), positions: positions.slice(0, 4) });
    }
    // Keyboard path: focus first handle, press ArrowDown
    await nav('/admin/du-an');
    const kbBefore = await domIds();
    await ev(`document.querySelector('tbody[data-sortable] .drag-handle').focus()`);
    await b.key('ArrowDown', 'ArrowDown', 40);
    await sleep(600);
    await nav('/admin/du-an');
    const kbAfter = await domIds();
    check('keyboard ↓ on a handle moves the row down and saves', kbAfter[0] === kbBefore[1] && kbAfter[1] === kbBefore[0]);
    await purge();
    // Logo previews (EN admin)
    await b.setCookie('adminLang', 'en');
    for (const [p, sel] of [['/admin/cai-dat', '.logo-preview'], [`/admin/doi-tac/${(await d.collection('partners').findOne())._id}/sua`, '.logo-preview']]) {
      await nav(p);
      const fit = await ev(`(() => { const img = document.querySelector('${sel} img'); return img ? getComputedStyle(img).objectFit : null; })()`);
      check(`${p}: logo shown with object-fit: contain (not cropped)`, fit === 'contain', fit);
    }
  });

  await part(b, 'drag look', async () => {
    await signIn();
    const nav = (p) => b.nav(p, 350);
    const ids = () => ev(`[...document.querySelectorAll('tbody[data-sortable] tr[data-id]')].map(r => r.dataset.id)`);
    for (const theme of ['light', 'dark']) {
      await b.setCookie('theme', theme);
      await nav('/admin/robot');
      const before = await ids();
      const pts = await ev(`(() => { const rows = document.querySelectorAll('tbody[data-sortable] tr[data-id]');
        const h = rows[0].querySelector('.drag-handle').getBoundingClientRect(); const t = rows[2].getBoundingClientRect();
        return { x: h.left + h.width / 2, y: h.top + h.height / 2, ty: t.top + t.height * 0.8 }; })()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts.x, y: pts.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts.x, y: pts.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 12; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts.x + 40, y: pts.y + ((pts.ty - pts.y) * i) / 12, button: 'left', buttons: 1 }); await sleep(30); }
      await sleep(250);
      const s = await ev(`(() => {
        const clone = document.querySelector('.sortable-fallback');
        const ghost = document.querySelector('tbody tr.sortable-ghost');
        const gs = ghost && getComputedStyle(ghost);
        return {
          cloneExists: !!clone, cloneOpacity: clone ? getComputedStyle(clone).opacity : null,
          ghostOpacity: gs && gs.opacity, ghostBg: gs && gs.backgroundColor, ghostBar: gs && gs.boxShadow,
          visibleCopies: [...document.querySelectorAll('tr[data-id="' + ${JSON.stringify(before[0])} + '"]')].filter(r => getComputedStyle(r).opacity !== '0' && r.offsetParent).length,
          sorting: document.body.classList.contains('is-sorting'),
          movedTo: [...document.querySelectorAll('tbody[data-sortable] tr[data-id]')].findIndex(r => r.dataset.id === ${JSON.stringify(before[0])}),
        };
      })()`);
      check(`[${theme}] floating copy is invisible (opacity 0)`, s.cloneExists && s.cloneOpacity === '0', s);
      check(`[${theme}] exactly one visible copy of the dragged row`, s.visibleCopies === 1, s.visibleCopies);
      check(`[${theme}] in-list row is fully opaque and highlighted (tint + left bar)`, s.ghostOpacity === '1' && s.ghostBg !== 'rgba(0, 0, 0, 0)' && /inset/.test(s.ghostBar), s);
      check(`[${theme}] row has moved down in the list while dragging; grabbing cursor active`, s.movedTo > 0 && s.sorting, s);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts.x + 40, y: pts.ty, button: 'left', buttons: 0, clickCount: 1 });
      await sleep(700);
      const toastBg = await ev(`(() => { const t = document.getElementById('adminToast'); return !t.hidden && getComputedStyle(t).backgroundColor; })()`);
      check(`[${theme}] release: order saved with green notification`, !!toastBg && toastBg !== 'false', toastBg);
      check(`[${theme}] cursor class cleared after drop`, !(await ev(`document.body.classList.contains('is-sorting')`)));
      await nav('/admin/robot');
      const after = await ids();
      check(`[${theme}] new order persists after reload`, JSON.stringify(after) === JSON.stringify([before[1], before[2], before[0], ...before.slice(3)]), { before, after });
    }
  });

  await part(b, 'name search', async () => {
    const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
    const wordsOf = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
    // Word-start rule: every typed word must be the start of some word in nameVi/nameEn or the sub-list topic (after " — ")
    const topic = (sub) => String(sub || '').split(/\s+—\s+/)[1] || '';
    const textOf = (x) => [x.nameVi, x.nameEn, topic(x.subcategory), topic(x.subcategoryEn)].join(' ');
    const hits = (q) => (x) => { const w = wordsOf(textOf(x)); return wordsOf(q).every((y) => w.some((z) => z.startsWith(y))); };
    const sub = (q) => (x) => fold(textOf(x)).includes(fold(q));
    const equipment = await d.collection('products').find({ category: 'stem-equipment', nameVi: { $not: new RegExp('^' + MARK) } }).toArray();
    const expectIds = (pred) => equipment.filter(pred).map((x) => String(x._id)).sort();
    await b.login(admin.sid);
    const nav = (p) => b.nav(p, 350);
    const type = async (text) => { await ev(`(() => { const i = document.querySelector('.list-search input'); i.focus(); i.select(); })()`); await send('Input.insertText', { text }); await sleep(150); };
    const key = async (k) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: { Escape: 27, ArrowUp: 38 }[k] }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k }); await sleep(150); };
    const state = () => ev(`(() => ({
      visible: [...document.querySelectorAll('tbody[data-sortable] tr[data-id]')].filter(r => !r.hidden && r.offsetParent).map(r => r.dataset.id).sort(),
      order: [...document.querySelectorAll('tbody[data-sortable] tr[data-id]')].map(r => r.dataset.id),
      count: document.querySelector('.list-search-count').textContent,
      none: (() => { const n = document.querySelector('.list-search-none'); return n.hidden ? null : n.textContent; })(),
      clearShown: !document.querySelector('.list-search-clear').hidden,
      filtered: document.querySelector('tbody[data-sortable]').classList.contains('is-filtered'),
      hint: document.querySelector('.sort-hint span').textContent,
      url: location.search,
      fetches: window.__fetches || 0,
    }))()`);
    // Robot list: same name search
    const robots = await d.collection('products').find({ category: { $in: ['robot-leo-cau-thang', 'robot-di-theo-nguoi', 'robot-cat-co', 'robot-gia-dinh'] } }).toArray();
    const robotWord = 'cat co'; // "Robot cắt cỏ", typed without accents
    const robotHits = robots.filter((x) => { const w = wordsOf(x.nameVi + ' ' + x.nameEn); return wordsOf(robotWord).every((y) => w.some((z) => z.startsWith(y))); }).map((x) => String(x._id)).sort();
    await nav('/admin/robot');
    check('robot list has a search box with its own placeholder', (await ev(`(document.querySelector('.list-search input') || {}).placeholder`)) === 'Tìm theo tên robot…');
    await type(robotWord);
    const rs = await state();
    check(`robot search "${robotWord}" finds the matching robots only, with a counter, drag paused`, robotHits.length > 0 && JSON.stringify(rs.visible) === JSON.stringify(robotHits)
      && rs.count === `Hiển thị ${robotHits.length} / ${robots.length} robot` && rs.filtered && rs.url.includes('q='), { rs, robotHits });
    check('robot search highlights the match in the name', await ev(`[...document.querySelectorAll('tbody tr:not([hidden]) [data-search-name] mark.search-hit')].some((m) => /^c[aắ]t$/i.test(m.textContent))`));
    await nav('/admin/thiet-bi');
    const layout = await ev(`(() => { const top = document.querySelector('.admin-topbar').getBoundingClientRect(), s = document.querySelector('.list-search').getBoundingClientRect(), tbl = document.querySelector('.data-table').getBoundingClientRect();
      return { below: s.top >= top.bottom, above: s.bottom <= tbl.top, ph: document.querySelector('.list-search input').placeholder }; })()`);
    check('equipment list: search sits under the title row and above the table', layout.below && layout.above, layout);
    check('VI placeholder', layout.ph === 'Tìm theo tên thiết bị…', layout.ph);
    await ev(`(() => { window.__fetches = 0; const f = window.fetch; window.fetch = function () { window.__fetches++; return f.apply(this, arguments); }; })()`);
    const initial = await state();
    const initialNames = await ev(`[...document.querySelectorAll('[data-search-name]')].map(c => c.textContent)`);
    check('initially all rows shown, no counter, no clear button', initial.visible.length === equipment.length && !initial.count && !initial.clearShown && !initial.filtered, initial);
    await type('thiet bi');
    let s = await state();
    let exp = expectIds(hits('thiet bi'));
    check(`"thiet bi" (no accents) -> ${exp.length} accented matches`, JSON.stringify(s.visible) === JSON.stringify(exp) && exp.length > 0 && exp.length < equipment.length, { s, exp });
    check('counter shows shown / total', s.count === `Hiển thị ${exp.length} / ${equipment.length} thiết bị`, s.count);
    check('clear button visible, ?q= in URL, drag paused (hint swapped)', s.clearShown && s.url === '?q=thiet+bi' && s.filtered && s.hint.startsWith('Đang lọc'), s);
    await type('th');
    // Drag attempt while filtered: nothing moves, nothing is saved
    const pts = await ev(`(() => { const rows = [...document.querySelectorAll('tbody[data-sortable] tr[data-id]')].filter(r => !r.hidden);
      const h = rows[0].querySelector('.drag-handle').getBoundingClientRect(); const t = rows[rows.length - 1].getBoundingClientRect();
      return { x: h.left + h.width / 2, y: h.top + h.height / 2, ty: t.top + t.height * 0.8 }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts.x, y: pts.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts.x, y: pts.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 10; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts.x + 30, y: pts.y + ((pts.ty - pts.y) * i) / 10, button: 'left', buttons: 1 }); await sleep(30); }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts.x + 30, y: pts.ty, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(500);
    let s2 = await state();
    check('drag while filtered: order unchanged, no save request', JSON.stringify(s2.order) === JSON.stringify(initial.order) && s2.fetches === 0, s2);
    await ev(`[...document.querySelectorAll('tbody[data-sortable] tr[data-id]')].filter(r => !r.hidden)[1].querySelector('.drag-handle').focus()`);
    await key('ArrowUp');
    s2 = await state();
    check('keyboard ↑ while filtered: order unchanged, no save request', JSON.stringify(s2.order) === JSON.stringify(initial.order) && s2.fetches === 0, s2);
    for (const [q, label] of [['laptop', 'English word "laptop" matches'], ['MAY TINH laptop', 'multi-word, uppercase, any order']]) {
      await type(q);
      s = await state();
      exp = expectIds(hits(q));
      check(label, JSON.stringify(s.visible) === JSON.stringify(exp) && exp.length >= 1, { s, exp });
    }
    await type('đien');
    s = await state();
    exp = expectIds(hits('dien'));
    check('"đien" matches "điện" (đ handled)', JSON.stringify(s.visible) === JSON.stringify(exp) && exp.length >= 1, { s, exp });
    // Word-start (Google-style) rule
    await type('th');
    s = await state();
    exp = expectIds(hits('th'));
    const ha = equipment.find((x) => x.nameVi.startsWith('Hạ tầng'));
    check('"th": only names with a word starting "th"; "Hạ tầng… Internet" hidden', JSON.stringify(s.visible) === JSON.stringify(exp) && exp.length > 0 && (!ha || !s.visible.includes(String(ha._id))), { s, exp });
    const marks = await ev(`[...document.querySelectorAll('tbody tr:not([hidden]) mark.search-hit')].map(m => m.textContent)`);
    check('"th": word starts highlighted with original accents/case', marks.length > 0 && marks.every((m) => m === 'Th' || m === 'th'), marks);
    for (const q of ['inh', 'aptop', 'hiet']) {
      await type(q);
      s = await state();
      exp = expectIds(hits(q));
      const midOnly = expectIds((x) => sub(q)(x) && !hits(q)(x));
      check(`"${q}": mid-word matches hidden (${midOnly.length} substring-only rows excluded)`, JSON.stringify(s.visible) === JSON.stringify(exp) && midOnly.length > 0 && midOnly.every((x) => !s.visible.includes(x)), { s, exp, midOnly });
    }
    await type('ro bot');
    s = await state();
    const makeblock = equipment.find((x) => /Makeblock/.test(x.nameVi));
    check('"ro bot" finds the item of the "Lập trình & Rô-bốt giáo dục" sub-list (topic searched, not shown)', makeblock && JSON.stringify(s.visible) === JSON.stringify([String(makeblock._id)]), s);
    await type('lap');
    s = await state();
    check('"lap" finds "(Laptop)" — word start after punctuation', s.visible.length >= 1 && JSON.stringify(s.visible) === JSON.stringify(expectIds(hits('lap'))), s);
    const lapMark = await ev(`[...document.querySelectorAll('tbody tr:not([hidden]) mark.search-hit')].map(m => m.textContent)`);
    check('"lap" highlight is "Lap"', lapMark.includes('Lap'), lapMark);
    await type('may lap');
    s = await state();
    check('"may lap" matches (two word starts)', s.visible.length >= 1 && JSON.stringify(s.visible) === JSON.stringify(expectIds(hits('may lap'))), s);
    await type('thiết');
    s = await state();
    const accentMarks = await ev(`[...document.querySelectorAll('tbody tr:not([hidden]) mark.search-hit')].map(m => m.textContent)`);
    check('accented query "thiết" works and highlights "Thiết"/"thiết"', JSON.stringify(s.visible) === JSON.stringify(expectIds(hits('thiet'))) && accentMarks.every((m) => /^[Tt]hiết$/.test(m)) && accentMarks.length > 0, { s, accentMarks });
    await type('zzzkhongco');
    s = await state();
    check('no match: all rows hidden, message shown', s.visible.length === 0 && s.none === 'Không tìm thấy thiết bị nào khớp “zzzkhongco”.', s);
    // Clearing
    await key('Escape');
    s = await state();
    check('Esc clears: all rows back, counter/message/clear hidden, hint restored, URL cleaned', s.visible.length === equipment.length && !s.count && !s.none && !s.clearShown && !s.filtered && s.hint.startsWith('Kéo') && s.url === '', s);
    const restored = await ev(`[...document.querySelectorAll('[data-search-name]')].map(c => c.textContent)`);
    check('cleared: no highlight marks, names restored exactly', (await ev(`document.querySelectorAll('mark.search-hit').length`)) === 0 && JSON.stringify(restored) === JSON.stringify(initialNames), { restored, initialNames });
    await type('laptop');
    await ev(`document.querySelector('.list-search-clear').click()`);
    s = await state();
    check('× button clears and returns focus to the box', s.visible.length === equipment.length && !s.filtered && (await ev(`document.activeElement === document.querySelector('.list-search input')`)), s);
    // Drag works again after clearing
    const p2 = await ev(`(() => { const rows = document.querySelectorAll('tbody[data-sortable] tr[data-id]');
      const h = rows[0].querySelector('.drag-handle').getBoundingClientRect(); const t = rows[2].getBoundingClientRect();
      return { x: h.left + h.width / 2, y: h.top + h.height / 2, ty: t.top + t.height * 0.8 }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p2.x, y: p2.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p2.x, y: p2.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p2.x + 40, y: p2.y + ((p2.ty - p2.y) * i) / 12, button: 'left', buttons: 1 }); await sleep(30); }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p2.x + 40, y: p2.ty, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(700);
    s = await state();
    const toastOk = await ev(`!document.getElementById('adminToast').hidden && !document.getElementById('adminToast').classList.contains('is-error')`);
    check('after clearing, drag reorders and saves (green toast)', s.order[2] === initial.order[0] && s.fetches === 1 && toastOk, { s, toastOk });
    // ?q= on load, EN strings, language switch keeps the search
    await b.setCookie('theme', 'dark');
    await nav('/admin/thiet-bi?q=laptop&alang=en');
    s = await state();
    const en = await ev(`({ ph: document.querySelector('.list-search input').placeholder, val: document.querySelector('.list-search input').value, sw: [...document.querySelectorAll('a[href*="alang="]')].map(a => a.getAttribute('href')) })`);
    exp = expectIds(hits('laptop'));
    check('?q=laptop opens prefilled and filtered', en.val === 'laptop' && JSON.stringify(s.visible) === JSON.stringify(exp), { s, en });
    check('EN strings (placeholder, counter, paused hint)', en.ph === 'Search by equipment name…' && s.count === `Showing ${exp.length} / ${equipment.length} items` && s.hint.startsWith('Filtered —'), { en, s });
    check('admin VI/EN switch links keep the search', en.sw.length > 0 && en.sw.every((h) => h.includes('q=laptop')), en.sw);
    await type('zzzz');
    s = await state();
    check('EN no-results message', s.none === 'No equipment matches “zzzz”.', s.none);
    await b.viewport(390, 844);
    await nav('/admin/thiet-bi?alang=vi');
    const narrow = await ev(`(() => { const r = document.querySelector('.list-search').getBoundingClientRect(); return { right: r.right, vw: innerWidth }; })()`);
    check('mobile width: search row fits the screen', narrow.right <= narrow.vw, narrow);
  });

  await part(b, 'equipment part chips', async () => {
    await signIn();
    const nav = (p) => b.nav(p, 300);
    const type = async (sel, text) => { await ev(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); i.focus(); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await send('Input.insertText', { text }); await sleep(150); };
    await nav('/admin/thiet-bi');
    const chips = await ev(`[...document.querySelectorAll('[data-list-filter="equipment"] .filter-chip')].map((b) => ({ v: b.dataset.value, n: +b.querySelector('.filter-chip-count').textContent, rows: b.dataset.value ? document.querySelectorAll('tbody tr[data-filter="' + b.dataset.value + '"]').length : document.querySelectorAll('tbody tr[data-id]').length }))`);
    check('equipment chips: All + one per part, counts match the rows (I 8 / II 3 / III 9 / IV 2)', chips.length >= 5 && chips.every((c) => c.n === c.rows) && JSON.stringify(chips.slice(1, 5).map((c) => c.n)) === '[8,3,9,2]', chips);
    await b.clickAt('[data-list-filter="equipment"] .filter-chip[data-value="phan-3"]'); await sleep(150);
    const f3 = await ev(`(() => { const vis = [...document.querySelectorAll('tbody tr[data-id]')].filter((tr) => !tr.hidden); return { n: vis.length, all3: vis.every((tr) => tr.dataset.filter === 'phan-3'), paused: document.querySelector('tbody').classList.contains('is-filtered'), url: location.search, pressed: document.querySelector('.filter-chip[data-value="phan-3"]').getAttribute('aria-pressed'), count: document.querySelector('.list-search-count').textContent }; })()`);
    check('chip "Phần III": only its 9 rows, drag paused, kept in the URL', f3.n === 9 && f3.all3 && f3.paused && f3.url.includes('phan=phan-3') && f3.pressed === 'true' && /9 \/ 22/.test(f3.count), f3);
    const word = await ev(`document.querySelector('tbody tr[data-filter="phan-3"]').dataset.search.split(/\\s+/)[0]`);
    await type('[data-list-search="equipment"] input', word);
    const both = await ev(`(() => { const vis = [...document.querySelectorAll('tbody tr[data-id]')].filter((tr) => !tr.hidden); const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/đ/g, 'd');
      const expect = [...document.querySelectorAll('tbody tr[data-filter="phan-3"]')].filter((tr) => fold(tr.dataset.search).split(/[^a-z0-9]+/).some((w) => w.startsWith(fold(${JSON.stringify(word)})))).length;
      return { n: vis.length, expect, all3: vis.every((tr) => tr.dataset.filter === 'phan-3'), url: location.search }; })()`);
    check(`chip + search "${word}" are combined (both must match)`, both.n === both.expect && both.n > 0 && both.all3 && both.url.includes('q='), both);
    // Back from an edit page brings the chip and the search back
    { const l = b.waitLoad(); await ev(`document.querySelector('tbody tr[data-filter="phan-3"]:not([hidden]) a[href$="/sua"]').click()`); await l; await sleep(200); }
    await ev('history.back()'); await sleep(1500); // may come back from the page cache (no load event)
    const back = await ev(`({ chip: (document.querySelector('.filter-chip.is-active') || {}).dataset?.value, q: document.querySelector('[data-list-search="equipment"] input').value, n: [...document.querySelectorAll('tbody tr[data-id]')].filter((tr) => !tr.hidden).length })`);
    check('Back from the edit page restores the chip and the search', back.chip === 'phan-3' && back.q === word && back.n === both.n, back);
    await nav('/admin/thiet-bi?phan=phan-3&q=' + encodeURIComponent(word));
    const direct = await ev(`({ chip: (document.querySelector('.filter-chip.is-active') || {}).dataset?.value, q: document.querySelector('[data-list-search="equipment"] input').value, n: [...document.querySelectorAll('tbody tr[data-id]')].filter((tr) => !tr.hidden).length })`);
    check('opening the list with ?phan=…&q=… (Back without page cache) restores both', direct.chip === 'phan-3' && direct.q === word && direct.n === both.n, direct);
    await b.clickAt('[data-list-filter="equipment"] .filter-chip[data-value=""]'); await ev(`document.querySelector('.list-search-clear').click()`); await sleep(100);
    const reset = await ev(`({ n: [...document.querySelectorAll('tbody tr[data-id]')].filter((tr) => !tr.hidden).length, paused: document.querySelector('tbody').classList.contains('is-filtered'), url: location.search })`);
    check('"Tất cả" + clear: whole list again, drag-sort back on', reset.n === 22 && !reset.paused && reset.url === '', reset);
  });

  await part(b, 'request delete', async () => {
    const DEL_NAME = `${MARK} delete`;
    await d.collection('quoterequests').insertOne({ name: DEL_NAME, message: 'zz', phone: '0912345678', email: '', schoolOrCompany: '', interestedIn: 'khac', details: [], user: null, status: 'moi', createdAt: new Date(), updatedAt: new Date() });
    await signIn();
    await b.nav('/admin/yeu-cau?status=moi', 300);
    const delRow = await ev(`(() => { const tr = [...document.querySelectorAll('.data-table tbody tr')].find((r) => r.textContent.includes(${JSON.stringify(DEL_NAME)})); if (!tr) return null; tr.querySelector('form[action$="/xoa"]').setAttribute('data-zz', '1'); return true; })()`);
    check('request list: each row has a delete button', !!delRow && await ev(`[...document.querySelectorAll('.data-table tbody tr')].every((tr) => tr.querySelector('form[action$="/xoa"] button.btn-danger'))`));
    await b.clickAt('form[data-zz] button');
    await sleep(250);
    const dialog = await ev(`(() => { const d = document.getElementById('confirmDialog'); return { open: !d.hidden, text: d.textContent.replace(/\\s+/g, ' ') }; })()`);
    check('delete asks first, naming the requester', dialog.open && dialog.text.includes(DEL_NAME), dialog);
    { const l = b.waitLoad(); await b.clickAt('#confirmDialog [data-confirm-ok]'); await l; await sleep(300); }
    const afterDel = await ev(`({ url: location.pathname + location.search, toast: (document.getElementById('adminToast') || {}).textContent || '', still: document.querySelector('.data-table').textContent.includes(${JSON.stringify(DEL_NAME)}) })`);
    const inDb = await d.collection('quoterequests').countDocuments({ name: DEL_NAME });
    check('deleted: gone from the DB and the list, flash shown, "Mới" filter kept', inDb === 0 && afterDel.url === '/admin/yeu-cau?status=moi' && afterDel.toast.includes(DEL_NAME) && !afterDel.still, { inDb, afterDel });
    const bad = await fetch(BASE + '/admin/yeu-cau/000000000000000000000000/xoa', { method: 'POST', redirect: 'manual', headers: { cookie: `connect.sid=${admin.sid}`, referer: BASE + '/admin/yeu-cau' } });
    const badPage = await (await fetch(BASE + bad.headers.get('location'), { headers: { cookie: `connect.sid=${admin.sid}` } })).text();
    check('deleting a missing request: back to the list with "not found"', bad.status === 302 && badPage.includes('Không tìm thấy mục này'), bad.status);
  });

  await part(b, 'request search + interest chips', async () => {
    // Four temporary requests: 3 new (2 robot, 1 study abroad), 1 done (robot)
    const base = { email: '', schoolOrCompany: '', details: [], user: null, createdAt: new Date(), updatedAt: new Date() };
    await d.collection('quoterequests').insertMany([
      { ...base, name: `${MARK} Nguyễn Thị Hoa`, phone: '0912 345 678', email: 'hoa.zz@example.com', schoolOrCompany: 'Trường Đông Hà', message: 'Cần robot leo cầu thang', interestedIn: 'san-pham-robot', status: 'moi' },
      { ...base, name: `${MARK} Trần Văn Bình`, phone: '0987000111', message: 'Hỏi giá robot', interestedIn: 'san-pham-robot', status: 'moi' },
      { ...base, name: `${MARK} Lê Minh`, phone: '0900000222', message: 'Du học Mỹ', interestedIn: 'tu-van-du-hoc', status: 'moi' },
      { ...base, name: `${MARK} Phạm Thu`, phone: '0900000333', message: 'Robot gia đình', interestedIn: 'san-pham-robot', status: 'hoan_tat' },
    ]);
    const all = await d.collection('quoterequests').find({}).toArray();
    const count = (f) => all.filter(f).length;
    await signIn();
    const nav = (p) => b.nav(p, 350);
    const type = async (text) => { await ev(`(() => { const i = document.querySelector('[data-list-search="requests"] input'); i.focus(); i.select(); })()`); await send('Input.insertText', { text }); await sleep(150); };
    const view = () => ev(`(() => ({
      shown: [...document.querySelectorAll('tbody[data-list="requests"] tr[data-id]')].filter((r) => !r.hidden).map((r) => r.querySelector('[data-search-name]').textContent),
      chips: [...document.querySelectorAll('[data-list-filter="requests"] .filter-chip')].map((c) => c.dataset.value + ':' + c.querySelector('.filter-chip-count').textContent),
      active: (document.querySelector('[data-list-filter="requests"] .filter-chip.is-active') || {}).dataset?.value,
      count: document.querySelector('[data-list-search="requests"] .list-search-count').textContent,
      none: (() => { const n = document.querySelector('[data-list-search-none="requests"]'); return n.hidden ? null : n.textContent; })(),
      url: location.search,
      tabs: [...document.querySelectorAll('a[data-keep-query]')].map((a) => a.getAttribute('href')),
    }))()`);
    await nav('/admin/yeu-cau');
    let v = await view();
    const robotAll = count((r) => r.interestedIn === 'san-pham-robot');
    check('"Tất cả": search box + one chip per interest present, with counts', v.chips[0] === `:${all.length}` && v.chips.includes(`san-pham-robot:${robotAll}`) && v.chips.includes(`tu-van-du-hoc:${count((r) => r.interestedIn === 'tu-van-du-hoc')}`) && !v.chips.some((c) => c.endsWith(':0')), v.chips);
    await type('hoa');
    v = await view();
    check('search by name ignores accents ("hoa" finds "Hoa"), kept in the URL', v.shown.some((n) => n.endsWith('Nguyễn Thị Hoa')) && !v.shown.some((n) => n.endsWith('Lê Minh')) && v.url.includes('q=hoa'), v);
    for (const [q, who] of [['0912345678', 'Nguyễn Thị Hoa'], ['0912 345', 'Nguyễn Thị Hoa'], ['hoa.zz', 'Nguyễn Thị Hoa'], ['dong ha', 'Nguyễn Thị Hoa'], ['du hoc my', 'Lê Minh']]) {
      await type(q);
      v = await view();
      check(`search "${q}" finds ${who} (phone / email / school / message)`, v.shown.length >= 1 && v.shown.some((n) => n.endsWith(who)), v.shown);
    }
    await type(`${MARK.toLowerCase()} robot`);
    v = await view();
    check('several words must all match: the 3 test requests about robots', v.shown.length === 3, v.shown);
    await b.clickAt('[data-list-filter="requests"] .filter-chip[data-value="tu-van-du-hoc"]'); await sleep(150);
    v = await view();
    check('robot words + study-abroad chip → nothing, with a message', v.shown.length === 0 && v.none && v.active === 'tu-van-du-hoc' && v.url.includes('quan-tam=tu-van-du-hoc'), v);
    await b.clickAt('[data-list-filter="requests"] .filter-chip[data-value="san-pham-robot"]'); await sleep(150);
    v = await view();
    check('robot chip + search → the 3 robot test requests', v.shown.length === 3 && v.count === `Hiển thị 3 / ${all.length} yêu cầu`, v);
    check('status tabs keep the search and the chip', v.tabs.every((h) => h.includes('q=') && h.includes('quan-tam=san-pham-robot')), v.tabs);
    // "Mới" tab: the same search box and chips, counted within the tab
    { const l = b.waitLoad(); await b.clickAt('a[data-keep-query][href*="status=moi"]'); await l; await sleep(300); }
    v = await view();
    const newRobot = count((r) => r.status === 'moi' && r.interestedIn === 'san-pham-robot');
    check('"Mới" tab: search and chip carried over, chips counted within the tab', v.active === 'san-pham-robot' && v.url.includes('status=moi') && v.chips.includes(`san-pham-robot:${newRobot}`) && v.shown.length === 2, v);
    await ev(`document.querySelector('[data-list-search="requests"] .list-search-clear').click()`); await b.clickAt('[data-list-filter="requests"] .filter-chip[data-value=""]'); await sleep(150);
    v = await view();
    check('"Mới" tab, cleared: every new request shown', v.shown.length === count((r) => r.status === 'moi') && !v.count, v);
  });

  await part(b, 'lists fade in when switching (chips, request status tabs)', async () => {
    const owner = await createUser('fade-owner', 'owner');
    await b.login(owner.sid); await b.setCookie('adminLang', 'vi');
    const rowsLook = (type) => ev(`[...document.querySelectorAll('tbody[data-sortable="${type}"] tr[data-id], tbody[data-list="${type}"] tr[data-id]')].filter((tr) => !tr.hidden).map((tr) => +getComputedStyle(tr).opacity)`);
    for (const [path, type] of [['/admin/thiet-bi', 'equipment'], ['/admin/du-an', 'projects'], ['/admin/yeu-cau', 'requests'], ['/admin/nguoi-dung', 'users']]) {
      await b.nav(path, 300);
      const chip = await ev(`(() => { const c = [...document.querySelectorAll('[data-list-filter="${type}"] .filter-chip')].find((x) => x.dataset.value && +x.querySelector('.filter-chip-count').textContent > 1); return c ? c.dataset.value : null; })()`);
      if (!chip) { check(`${path}: has a chip with 2+ rows to switch to`, false); continue; }
      await b.clickAt(`[data-list-filter="${type}"] .filter-chip[data-value="${chip}"]`); await sleep(40);
      const mid = await rowsLook(type); await sleep(700); const end = await rowsLook(type);
      if (type === 'equipment') await b.shot('admin-filter-equipment');
      check(`${path}: a chip click (${chip}) fades its rows in, one after another`, mid.length > 1 && mid[0] < 1 && mid[mid.length - 1] <= mid[0] && end.every((o) => o === 1), { mid, end });
      await b.clickAt(`[data-list-filter="${type}"] .filter-chip[data-value=""]`); await sleep(700);
    }
    await b.nav('/admin/thiet-bi', 300);
    await ev(`(() => { const i = document.querySelector('[data-list-search="equipment"] input'); i.focus(); i.value = 'vex'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(30);
    const typed = await rowsLook('equipment');
    check('typing in the search box shows the rows at once (no fade on every key)', typed.length > 0 && typed.every((o) => o === 1), typed);
    await ev(`document.querySelector('[data-list-search="equipment"] .list-search-clear').click()`);
    // Yêu cầu tư vấn status tabs load a new page: its rows fade in (counted as row animations from the page's start)
    const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__rowFades = 0; const _a = Element.prototype.animate; Element.prototype.animate = function () { if (this.tagName === 'TR') window.__rowFades++; return _a.apply(this, arguments); };` });
    try {
      await b.nav('/admin/yeu-cau', 300);
      const plain = await ev('window.__rowFades');
      { const l = b.waitLoad(); await b.clickAt('a[data-keep-query][href*="status=moi"]'); await l; await sleep(200); }
      const viaTab = await ev(`({ fades: window.__rowFades, rows: [...document.querySelectorAll('tbody[data-list="requests"] tr[data-id]')].filter((tr) => !tr.hidden).length, url: location.search })`);
      await b.nav('/admin/yeu-cau?status=moi', 300);
      const reload = await ev('window.__rowFades');
      check('status tab "Mới": the new page fades its rows in; opening the page any other way doesn\'t', plain === 0 && viaTab.url.includes('status=moi') && viaTab.fades === viaTab.rows && viaTab.rows > 0 && reload === 0, { plain, viaTab, reload });
    } finally {
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    }
  });

  await part(b, 'delete confirmation dialog', async () => {
    const custU = await createUser('confirm-cust', 'customer');
    const custId = String(custU.id);
    const custName = 'ZZ confirm-cust';
    const lastPartner = await d.collection('partners').find({}).sort({ order: -1 }).limit(1).toArray();
    const tmpPartner = await d.collection('partners').insertOne({ name: `ZZ Temp Partner ${stamp}`, logo: '/uploads/images/vex-robotics-logo.png', url: null, order: (lastPartner[0]?.order || 0) + 1, createdAt: new Date(), updatedAt: new Date() });
    const partnerId = String(tmpPartner.insertedId);
    const counts = async () => Object.fromEntries(await Promise.all(['projects', 'products', 'partners', 'articles', 'users'].map(async (c) => [c, await d.collection(c).countDocuments()])));
    let nativeDialogs = 0;
    let posts = 0;
    b.on('Page.javascriptDialogOpening', () => { nativeDialogs++; send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {}); });
    b.on('Network.requestWillBeSent', (p) => { if (p.request.method === 'POST') posts++; });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await signIn();
    const nav = (p) => b.nav(p, 400);
    const click = (sel) => b.clickAt(sel);
    const key = (k, code, vk) => b.key(k, code, vk);
    const dialogState = () => ev(`(() => { const o = document.getElementById('confirmDialog'); const d = o.querySelector('.confirm-dialog'); const r = d.getBoundingClientRect(); const m = getComputedStyle(d).transform;
      return { hidden: o.hidden, open: o.classList.contains('is-open'), text: o.querySelector('.confirm-text').textContent, scale: m === 'none' ? 1 : new DOMMatrix(m).a,
        cx: r.left + r.width / 2, cy: r.top + r.height / 2, vw: innerWidth, vh: innerHeight, focus: document.activeElement && document.activeElement.className, locked: document.body.classList.contains('confirm-lock') }; })()`);
    const pages = [
      ['/admin/du-an', 'form[action^="/admin/du-an/"][data-confirm] button[type="submit"]', 'cancel'],
      ['/admin/robot', 'form[action^="/admin/san-pham/"][data-confirm] button[type="submit"]', 'x'],
      ['/admin/thiet-bi', 'form[action^="/admin/san-pham/"][data-confirm] button[type="submit"]', 'esc'],
      ['/admin/doi-tac', `form[action="/admin/doi-tac/${partnerId}/xoa"] button[type="submit"]`, 'backdrop'],
      ['/admin/tin-tuc', 'form[action^="/admin/tin-tuc/"][data-confirm] button[type="submit"]', 'cancel'],
      ['/admin/nguoi-dung', `form[action="/admin/nguoi-dung/${custId}/xoa"] button[type="submit"]`, 'x'],
    ];
    const before = await counts();
    for (const [path, sel, how] of pages) {
      await nav(path);
      const expected = await ev(`document.querySelector(${JSON.stringify(sel)}).closest('form').getAttribute('data-confirm')`);
      posts = 0;
      await click(sel);
      await sleep(40);
      const mid = await dialogState();
      await sleep(400);
      const s = await dialogState();
      check(`${path}: Delete opens the custom dialog with the page's message`, !s.hidden && s.open && s.text === expected && expected.length > 0, { s, expected });
      check(`${path}: expands from the centre (scale ${mid.scale.toFixed(2)} → ${s.scale}) and is centred`, mid.scale > 0 && mid.scale < 1 && s.scale === 1 && Math.abs(s.cx - s.vw / 2) <= 1 && Math.abs(s.cy - s.vh / 2) <= 1, { mid, s });
      check(`${path}: Cancel button has focus; page scroll locked`, /confirm-cancel/.test(s.focus) && s.locked, s);
      if (path === '/admin/nguoi-dung') check('users dialog names the user and email', s.text.includes(custName) && s.text.includes(custU.email), s.text);
      if (how === 'cancel') await click('#confirmDialog .confirm-cancel');
      if (how === 'x') await click('#confirmDialog .confirm-x');
      if (how === 'esc') await key('Escape', 'Escape', 27);
      if (how === 'backdrop') {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 20, y: 20, button: 'left', buttons: 1, clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 20, y: 20, button: 'left', buttons: 0, clickCount: 1 });
      }
      await sleep(400);
      const c = await dialogState();
      const focusBack = await ev(`document.activeElement === document.querySelector(${JSON.stringify(sel)})`);
      check(`${path}: closing by ${how} hides the dialog, sends nothing, returns focus`, c.hidden && !c.locked && posts === 0 && focusBack && (await ev('location.pathname')) === path, { c, posts, focusBack });
    }
    check('nothing deleted by any cancel path', JSON.stringify(await counts()) === JSON.stringify(before), { before, after: await counts() });
    // Colours & text
    await nav('/admin/doi-tac');
    await click(`form[action="/admin/doi-tac/${partnerId}/xoa"] button[type="submit"]`);
    await sleep(400);
    const look = await ev(`(() => { const o = document.getElementById('confirmDialog'); const cs = (s) => getComputedStyle(o.querySelector(s)).backgroundColor;
      return { ok: cs('.confirm-ok'), cancel: cs('.confirm-cancel'), okText: o.querySelector('.confirm-ok').textContent.trim(), cancelText: o.querySelector('.confirm-cancel').textContent.trim(), title: o.querySelector('.confirm-title').textContent, x: !!o.querySelector('.confirm-x'),
        order: [...o.querySelectorAll('.confirm-actions .btn')].map(b => b.className) }; })()`);
    const rgb = (s) => s.match(/\d+/g).map(Number);
    const [or, og, ob] = rgb(look.ok); const [cr, cg, cb] = rgb(look.cancel);
    check('Confirm is green, Cancel is red, × present, Confirm first', og > or && og > ob && cr > cg && cr > cb && look.x && /confirm-ok/.test(look.order[0]) && /confirm-cancel/.test(look.order[1]), look);
    check('VI text: "Xác nhận xoá" / "Xác nhận" / "Huỷ"', look.title === 'Xác nhận xoá' && look.okText === 'Xác nhận' && look.cancelText === 'Huỷ', look);
    await b.shot('confirm-light');
    // Confirm really deletes (partner), green toast
    posts = 0;
    await click('#confirmDialog .confirm-ok');
    await sleep(1200);
    const toastInfo = await ev(`(() => { const t = document.getElementById('adminToast'); return { shown: !t.hidden, error: t.classList.contains('is-error'), text: t.querySelector('.toast-text').textContent }; })()`);
    check('Confirm deletes the partner and shows the green toast', posts === 1 && !(await d.collection('partners').findOne({ _id: tmpPartner.insertedId })) && toastInfo.shown && !toastInfo.error, { posts, toastInfo });
    await nav('/admin/nguoi-dung');
    await click(`form[action="/admin/nguoi-dung/${custId}/xoa"] button[type="submit"]`);
    await sleep(400);
    await click('#confirmDialog .confirm-ok');
    await sleep(1200);
    check('Confirm deletes the customer', !(await d.collection('users').findOne({ email: custU.email })));
    // Keyboard: Tab stays inside the dialog
    await nav('/admin/du-an');
    await click('form[action^="/admin/du-an/"][data-confirm] button[type="submit"]');
    await sleep(400);
    const seen = [];
    for (let i = 0; i < 4; i++) { await key('Tab', 'Tab', 9); seen.push(await ev(`document.getElementById('confirmDialog').contains(document.activeElement)`)); }
    check('Tab keeps focus inside the dialog', seen.every(Boolean), seen);
    await key('Escape', 'Escape', 27);
    await sleep(300);
    // EN, mobile centring, reduced motion
    await b.setCookie('theme', 'dark');
    await nav('/admin/du-an?alang=en');
    await click('form[action^="/admin/du-an/"][data-confirm] button[type="submit"]');
    await sleep(400);
    const en = await ev(`(() => { const o = document.getElementById('confirmDialog'); return [o.querySelector('.confirm-title').textContent, o.querySelector('.confirm-ok').textContent.trim(), o.querySelector('.confirm-cancel').textContent.trim(), o.querySelector('.confirm-x').getAttribute('aria-label')]; })()`);
    check('EN text: Confirm deletion / Confirm / Cancel / Close', JSON.stringify(en) === JSON.stringify(['Confirm deletion', 'Confirm', 'Cancel', 'Close']), en);
    await b.shot('confirm-dark');
    await key('Escape', 'Escape', 27);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await b.setCookie('theme', 'light');
    await nav('/admin/du-an?alang=vi');
    await click('form[action^="/admin/du-an/"][data-confirm] button[type="submit"]');
    await sleep(400);
    const mob = await dialogState();
    const fits = await ev(`(() => { const r = document.querySelector('.confirm-dialog').getBoundingClientRect(); return r.left >= 16 && r.right <= innerWidth - 16; })()`);
    check('mobile 390px: centred and fits with 16px margins', Math.abs(mob.cx - mob.vw / 2) <= 1 && Math.abs(mob.cy - mob.vh / 2) <= 1 && fits, mob);
    await key('Escape', 'Escape', 27); await sleep(300);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await click('form[action^="/admin/du-an/"][data-confirm] button[type="submit"]');
    await sleep(30);
    const rmMid = await dialogState();
    await sleep(400);
    const rm = await dialogState();
    check(`reduced motion: still a gentle expand from the centre (scale ${rmMid.scale.toFixed(2)} → ${rm.scale})`, rmMid.scale >= 0.85 && rmMid.scale < 1 && !rm.hidden && rm.open && rm.scale === 1 && Math.abs(rm.cx - rm.vw / 2) <= 1, { rmMid, rm });
    check('no native browser confirm dialog ever appeared', nativeDialogs === 0, nativeDialogs);
  });

  await part(b, 'admin menu keeps its scroll position', async () => {
    const owner = await createUser('menu', 'owner');
    await b.login(owner.sid);
    await b.setCookie('adminLang', 'vi');
    await b.viewport(1280, 700);
    const nav = (p) => b.nav(p, 300);
    const clickNav = async (href) => { const l = b.waitLoad(); await ev(`document.querySelector('.admin-nav a[href="${href}"]').click()`); await l; await sleep(300); };
    const state = () => ev(`(() => { const bar = document.querySelector('.admin-sidebar'); const a = bar.querySelector('.admin-nav a.active'); const b = bar.getBoundingClientRect(); const r = a ? a.getBoundingClientRect() : null;
      const lang = bar.querySelector('.admin-lang'); const bottom = b.bottom - (getComputedStyle(lang).position === 'sticky' ? lang.offsetHeight : 0);
      return { top: Math.round(bar.scrollTop), left: Math.round(bar.scrollLeft), max: bar.scrollHeight - bar.clientHeight, maxLeft: bar.scrollWidth - bar.clientWidth, page: Math.round(scrollY),
        active: a ? a.getAttribute('href') : null, visibleV: !!r && r.top >= b.top - 1 && r.bottom <= bottom + 1, visibleH: !!r && r.left >= b.left - 1 && r.right <= b.right + 1 }; })()`);
    await nav('/admin'); await ev(`sessionStorage.clear()`);
    await nav('/admin');
    let s = await state();
    check('desktop 1280×700: the menu is taller than the screen (needs scrolling)', s.max > 50, s);
    check('fresh /admin: menu at the top, Tổng quan active and visible', s.top === 0 && s.active === '/admin' && s.visibleV, s);
    await ev(`document.querySelector('.admin-sidebar').scrollTop = 99999`);
    const before = await state();
    await clickNav('/admin/cai-dat');
    s = await state();
    check('after clicking "Cài đặt chung" at the bottom: menu stays scrolled down, item active + visible, page at top', Math.abs(s.top - before.top) <= 2 && s.active === '/admin/cai-dat' && s.visibleV && s.page === 0, { before, after: s });
    await clickNav('/admin/nguoi-dung');
    const s2 = await state();
    check('clicking "Người dùng" next: position still kept', Math.abs(s2.top - s.top) <= 2 && s2.active === '/admin/nguoi-dung' && s2.visibleV, s2);
    await ev(`document.querySelector('.admin-sidebar').scrollTop = 120`);
    await clickNav('/admin/du-an');
    s = await state();
    check('a middle position (120px) is kept exactly when the clicked item is visible', Math.abs(s.top - 120) <= 2 && s.active === '/admin/du-an' && s.visibleV, s);
    await ev(`document.querySelector('.admin-sidebar').scrollTop = 99999`);
    const beforeLang = await state();
    { const l = b.waitLoad(); await ev(`document.querySelector('.admin-lang a[hreflang="en"]').click()`); await l; await sleep(300); }
    s = await state();
    check('switching the admin language VI → EN keeps the menu position', Math.abs(s.top - beforeLang.top) <= 2 && /users|projects/i.test(await ev(`document.querySelector('.admin-nav a.active').textContent`)), { beforeLang, s });
    { const l = b.waitLoad(); await ev(`document.querySelector('.admin-lang a[hreflang="vi"]').click()`); await l; await sleep(300); }
    await ev(`sessionStorage.clear()`);
    await nav('/admin/cai-dat');
    s = await state();
    check('fresh tab straight to /admin/cai-dat: menu scrolls so "Cài đặt chung" is visible', s.active === '/admin/cai-dat' && s.visibleV && s.top > 0, s);
    await ev(`sessionStorage.setItem('adminNavScroll', JSON.stringify({ top: 0, left: 0 }))`);
    await nav('/admin/nguoi-dung');
    s = await state();
    check('saved position that would hide the current item is corrected to show it', s.active === '/admin/nguoi-dung' && s.visibleV, s);
    // Narrow screens (960px and below): the menu is hidden; the round ☰ above the page title slides it in from the left
    const menu = () => ev(`(() => { const bar = document.querySelector('.admin-sidebar'); const r = bar.getBoundingClientRect(); const btn = document.querySelector('.admin-menu-btn');
      const br = btn.getBoundingClientRect(); const h1 = document.querySelector('.admin-topbar h1').getBoundingClientRect(); const scrim = document.querySelector('.admin-scrim');
      return { onScreen: getComputedStyle(bar).visibility === 'visible' && Math.round(r.left) === 0 && r.right > 200, hidden: getComputedStyle(bar).visibility === 'hidden' && r.right <= 1,
        btn: getComputedStyle(btn).display !== 'none' && br.width === 44 && br.height === 44 && getComputedStyle(btn).borderRadius === '50%', btnAboveTitle: br.bottom <= h1.top && br.left <= h1.left + 1,
        expanded: btn.getAttribute('aria-expanded'), scrim: !scrim.hidden && +getComputedStyle(scrim).opacity > .9, pageLocked: getComputedStyle(document.documentElement).overflow === 'hidden', inert: document.querySelector('.admin-main').inert,
        logo: !!bar.querySelector('.admin-brand img') && bar.querySelector('.admin-brand img').naturalWidth > 0, links: bar.querySelectorAll('.admin-nav a').length, groups: [...bar.querySelectorAll('.admin-nav-group')].filter((g) => g.offsetParent).length,
        lang: [...bar.querySelectorAll('.admin-lang a')].map((a) => a.textContent.trim()).join('/'), theme: !!bar.querySelector('.admin-lang [data-theme-toggle]'),
        focus: document.activeElement === btn ? 'button' : (document.activeElement.closest('.admin-sidebar') ? 'menu:' + document.activeElement.textContent.trim() : document.activeElement.tagName),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
    await b.viewport(390, 844);
    await ev(`sessionStorage.clear()`);
    await nav('/admin');
    let m = await menu();
    check('phone 390: menu hidden; a round 44px ☰ button above the "Tổng quan" title; no sideways scrolling', m.hidden && m.btn && m.btnAboveTitle && m.expanded === 'false' && m.overflow <= 1, m);
    await shot('admin-menu-closed-390');
    await b.clickAt('.admin-menu-btn'); await sleep(700);
    m = await menu();
    check('tapping ☰ slides the menu in from the left: logo, all 16 links with their group titles, VI/EN and the light/dark switch',
      m.onScreen && m.logo && m.links === 16 && m.groups === 6 && m.lang === 'VI/EN' && m.theme && m.expanded === 'true', m);
    check('… with a dark backdrop, the page behind locked (no scroll, no Tab) and the focus on the current page "Tổng quan"', m.scrim && m.pageLocked && m.inert && m.focus === 'menu:Tổng quan', m);
    await shot('admin-menu-open-390');
    await b.key('Escape', 'Escape', 27); await sleep(700);
    m = await menu();
    check('Esc closes it; focus back on ☰, page unlocked', m.hidden && m.expanded === 'false' && !m.scrim && !m.pageLocked && !m.inert && m.focus === 'button', m);
    await b.clickAt('.admin-menu-btn'); await sleep(700);
    await b.mouse('mousePressed', { x: 370, y: 400 }, { button: 'left', clickCount: 1 }); await b.mouse('mouseReleased', { x: 370, y: 400 }, { button: 'left', clickCount: 1 }); await sleep(700);
    m = await menu();
    check('a tap on the dark backdrop closes it', m.hidden && m.focus === 'button', m);
    await b.clickAt('.admin-menu-btn'); await sleep(700);
    await b.clickAt('.admin-menu-close'); await sleep(700);
    m = await menu();
    check('× in the menu closes it', m.hidden && m.focus === 'button', m);
    await b.clickAt('.admin-menu-btn'); await sleep(700);
    { const l = b.waitLoad(); await b.clickAt('.admin-nav a[href="/admin/doi-tac"]'); await l; await sleep(400); }
    m = await menu();
    check('choosing "Đối tác đồng hành" in the menu opens that page, with the menu closed', (await ev('location.pathname')) === '/admin/doi-tac' && m.hidden && m.btn, m);
    await ev(`sessionStorage.clear()`);
    await nav('/admin/cai-dat');
    await b.clickAt('.admin-menu-btn'); await sleep(700);
    s = await state();
    check('fresh tab on /admin/cai-dat: the opened menu shows "Cài đặt chung" (scrolled down to it)', s.active === '/admin/cai-dat' && s.visibleV && s.top > 0, s);
    await b.key('Escape', 'Escape', 27); await sleep(500);
    await b.reducedMotion();
    await b.clickAt('.admin-menu-btn');
    await sleep(60);
    const midway = await ev(`Math.round(document.querySelector('.admin-sidebar').getBoundingClientRect().left)`);
    await sleep(500);
    m = await menu();
    check('reduced motion: still a short visible slide, then fully open', midway < 0 && m.onScreen, { midway, m });
    await b.key('Escape', 'Escape', 27); await sleep(400);
    await b.reducedMotion(false);
    await b.setCookie('theme', 'dark');
    await b.viewport(800, 900); await nav('/admin');
    m = await menu();
    check('tablet 800: the same hidden menu and ☰ button', m.hidden && m.btn, m);
    await b.clickAt('.admin-menu-btn'); await sleep(700);
    await shot('admin-menu-open-800-dark');
    await b.viewport(1280, 900); await sleep(500);
    m = await menu();
    check('widening the window past 960px while it is open: the usual menu on the left, ☰ hidden, nothing left locked',
      m.onScreen && !m.btn && !m.scrim && !m.pageLocked && !m.inert && m.expanded === 'false', m);
    await b.setCookie('theme', 'light');
  });

  await part(b, 'Người dùng: profile photos', async () => {
    const admin = await createUser('photos-admin', 'admin');
    const withPhoto = await createUser('photos-yes', 'customer');
    const noPhoto = await createUser('photos-no', 'customer');
    const PHOTO = '/assets/giai-phap/workshop/hoc-sinh-lap-trinh.jpg';
    await d.collection('users').updateOne({ _id: withPhoto.id }, { $set: { avatar: PHOTO } });
    await b.login(admin.sid); await b.setCookie('adminLang', 'vi');
    await b.nav('/admin/nguoi-dung', 400);
    const row = (email) => ev(`(() => { const tr = [...document.querySelectorAll('.data-table tbody tr')].find((r) => r.textContent.includes(${JSON.stringify(email)})); const a = tr.querySelector('.user-avatar'); const r = a.getBoundingClientRect();
      return { tag: a.tagName, img: a.querySelector('img') && a.querySelector('img').getAttribute('src'), loaded: !!(a.querySelector('img') && a.querySelector('img').naturalWidth), text: a.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), round: getComputedStyle(a).borderRadius, label: a.getAttribute('aria-label') }; })()`);
    const yes = await row(withPhoto.email);
    check('a user with a profile photo: a 36px round photo before the name, as a button "Xem ảnh đại diện của …"', yes.tag === 'BUTTON' && yes.img === PHOTO && yes.w === 36 && yes.h === 36 && yes.round === '50%' && yes.label === 'Xem ảnh đại diện của ZZ photos-yes', yes);
    const no = await row(noPhoto.email);
    check('a user without one: their initials in a 36px round badge (not clickable)', no.tag === 'SPAN' && no.text === 'ZP' && no.w === 36 && no.round === '50%', no);
    const dlg = () => ev(`(() => { const g = document.querySelector('[data-avatar-dialog]'); const img = g.querySelector('[data-avatar-img]'); return { open: g.open, src: img.getAttribute('src'), w: Math.round(img.getBoundingClientRect().width), name: g.querySelector('[data-avatar-name]').textContent, email: g.querySelector('[data-avatar-email]').textContent, focus: document.activeElement && (document.activeElement.getAttribute('data-email') || document.activeElement.className) }; })()`);
    const btnSel = `button.user-avatar[data-email="${withPhoto.email}"]`;
    await b.clickAt(btnSel); await sleep(400);
    let g = await dlg();
    check('clicking the photo opens it larger, with the name and email', g.open && g.src === PHOTO && g.w >= 250 && g.name === 'ZZ photos-yes' && g.email === withPhoto.email, g);
    await b.shot('users-photo-open');
    await b.key('Escape', 'Escape', 27); await sleep(250);
    g = await dlg();
    check('Escape closes it and the photo button has the focus again', !g.open && g.focus === withPhoto.email, g);
    await b.clickAt(btnSel); await sleep(300);
    await b.mouse('mousePressed', { x: 5, y: 5 }, { button: 'left', clickCount: 1 }); await b.mouse('mouseReleased', { x: 5, y: 5 }, { button: 'left', clickCount: 1 }); await sleep(250);
    check('a click outside closes it too', !(await dlg()).open);
    await b.clickAt(btnSel); await sleep(300);
    await b.clickAt('[data-avatar-close]'); await sleep(250);
    check('so does the × button', !(await dlg()).open);
  });

  await part(b, 'Người dùng: filter by role, search', async () => {
    const owner = await createUser('roles-owner', 'owner');
    const admin = await createUser('roles-admin', 'admin');
    const customer = await createUser('roles-customer', 'customer');
    const counts = { owner: await d.collection('users').countDocuments({ role: 'owner' }), admin: await d.collection('users').countDocuments({ role: 'admin' }), customer: await d.collection('users').countDocuments({ role: 'customer' }) };
    await b.login(owner.sid); await b.setCookie('adminLang', 'vi');
    await b.nav('/admin/nguoi-dung', 400);
    const chips = await ev(`[...document.querySelectorAll('[data-list-filter="users"] .filter-chip')].map((c) => ({ value: c.dataset.value, label: c.childNodes[0].textContent.trim(), count: +c.querySelector('.filter-chip-count').textContent }))`);
    const total = counts.owner + counts.admin + counts.customer;
    check('chips: Tất cả · Chủ sở hữu · Quản trị viên · Khách hàng, with their counts', JSON.stringify(chips) === JSON.stringify([
      { value: '', label: 'Tất cả', count: total }, { value: 'owner', label: 'Chủ sở hữu', count: counts.owner }, { value: 'admin', label: 'Quản trị viên', count: counts.admin }, { value: 'customer', label: 'Khách hàng', count: counts.customer }]), { chips, counts });
    const shown = () => ev(`[...document.querySelectorAll('tbody[data-list="users"] tr')].filter((tr) => !tr.hidden).map((tr) => tr.dataset.filter)`);
    await b.clickAt('[data-list-filter="users"] .filter-chip[data-value="admin"]'); await sleep(200);
    let rows = await shown();
    check('"Quản trị viên": only admins, and ?vai-tro=admin in the address', rows.length === counts.admin && rows.every((r) => r === 'admin') && (await ev(`location.search`)) === '?vai-tro=admin', rows);
    await b.shot('users-filter-admin');
    await b.clickAt('[data-list-filter="users"] .filter-chip[data-value=""]'); await sleep(200);
    await ev(`document.querySelector('[data-list-search="users"] input').focus()`); await send('Input.insertText', { text: customer.email }); await sleep(300);
    rows = await ev(`[...document.querySelectorAll('tbody[data-list="users"] tr')].filter((tr) => !tr.hidden).map((tr) => tr.dataset.id)`);
    check('searching an email finds just that account', rows.length === 1 && rows[0] === String(customer.id), rows);
    // The chosen filter stays after an action on the list
    await b.nav('/admin/nguoi-dung?vai-tro=customer', 400);
    check('opening ?vai-tro=customer shows only customers', (await shown()).every((r) => r === 'customer'));
    await b.clickAndWait(`tr[data-id="${customer.id}"] form[action$="/vai-tro"] button`, 400);
    check('promoting a customer keeps the "Khách hàng" filter (and the green note)', (await ev(`location.search`)) === '?vai-tro=customer' && (await ev(`document.querySelector('[data-list-filter="users"] .filter-chip.is-active').dataset.value`)) === 'customer'
      && (await d.collection('users').findOne({ _id: customer.id })).role === 'admin', await ev(`location.href`));
    check('… the promoted account now counts under "Quản trị viên"', (await ev(`+document.querySelector('[data-list-filter="users"] .filter-chip[data-value="admin"] .filter-chip-count').textContent`)) === counts.admin + 1);
    void admin;
  });
});
