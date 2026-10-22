// Accounts: show/hide password (eye) on login, register and profile; profile page over HTTP (about/news language,
// avatar + bio rules, password change); role badge (view only); oversized photo refused in the browser.
import { existsSync, readdirSync, unlinkSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { suite, part, check, db, BASE, ROOT, createUser, removeLater, stamp } from './lib/index.mjs';

const PUBLIC = path.join(ROOT, 'public');

await suite(async (b) => {
  const { send, ev, sleep } = b;

  await part(b, 'password eye', async () => {
    const EMAIL = `zztest-eye-${stamp}@example.com`;
    const r0 = await fetch(BASE + '/dang-ky', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ name: 'ZZ Eye', email: EMAIL, password: 'secret1', confirmPassword: 'secret1', agreePrivacy: '1' }) });
    check('test account created', r0.status === 303);
    const posted = [];
    b.on('Network.requestWillBeSent', (p) => { if (p.request.method === 'POST') posted.push({ url: p.request.url, body: p.request.postData || '' }); });
    const nav = (p) => b.nav(p, 400);
    const waitLoad = () => b.waitLoad();
    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const clickSel = async (sel) => { const p = await ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await mouse('mouseMoved', p.x, p.y); await mouse('mousePressed', p.x, p.y, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', p.x, p.y, { button: 'left', buttons: 0, clickCount: 1 }); await sleep(150); };
    const typeInto = async (sel, text) => { await ev(`document.querySelector(${JSON.stringify(sel)}).focus()`); await send('Input.insertText', { text }); };
    const key = async (k, code) => { const text = k === 'Enter' ? String.fromCharCode(13) : k === ' ' ? ' ' : undefined; await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k === ' ' ? 'Space' : k, windowsVirtualKeyCode: code, text }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k === ' ' ? 'Space' : k, windowsVirtualKeyCode: code }); await sleep(120); };
    const boxState = (inputId) => ev(`(() => { const i = document.getElementById('${inputId}'); const b = document.querySelector('[aria-controls="${inputId}"]');
      return { type: i.type, pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label'), eye: getComputedStyle(b.querySelector('.icon-eye')).display !== 'none', eyeOff: getComputedStyle(b.querySelector('.icon-eye-off')).display !== 'none', focused: document.activeElement === i,
        iconRight: Math.round(i.getBoundingClientRect().right - b.getBoundingClientRect().right), inside: b.getBoundingClientRect().top >= i.getBoundingClientRect().top - 1 && b.getBoundingClientRect().bottom <= i.getBoundingClientRect().bottom + 1 }; })()`);

    for (const [p, ids] of [['/dang-nhap', ['loginPassword']], ['/dang-ky', ['regPassword', 'regConfirm']]]) {
      await nav(p);
      const cov = await ev(`({ pw: document.querySelectorAll('input[type=password]').length, toggles: document.querySelectorAll('[data-password-toggle]').length, labels: [...document.querySelectorAll('[data-password-toggle]')].map((b) => b.getAttribute('aria-label')),
        forOk: ${JSON.stringify(ids)}.every((i) => !!document.querySelector('label[for="' + i + '"]')), auto: [...document.querySelectorAll('input[autocomplete]')].map((i) => i.name + ':' + i.getAttribute('autocomplete')) })`);
      check(`${p}: ${ids.length} password box(es), each with one eye button "Hiện mật khẩu", labels linked`, cov.pw === ids.length && cov.toggles === ids.length && cov.labels.every((l) => l === 'Hiện mật khẩu') && cov.forOk, cov);
      check(`${p}: browser hints (email=username, password=${p === '/dang-nhap' ? 'current' : 'new'}-password)`, cov.auto.includes('email:username') && cov.auto.filter((a) => a.endsWith(p === '/dang-nhap' ? ':current-password' : ':new-password')).length === ids.length, cov.auto);
    }
    await nav('/dang-nhap?lang=en');
    check('EN label "Show password"', (await ev(`document.querySelector('[data-password-toggle]').getAttribute('aria-label')`)) === 'Show password');
    await nav('/dang-nhap?lang=vi');

    // Toggle behaviour (login page)
    await typeInto('#loginEmail', EMAIL);
    await typeInto('#loginPassword', 'secret1');
    await ev(`document.getElementById('loginPassword').setSelectionRange(3, 3)`);
    await clickSel('[aria-controls="loginPassword"]');
    let s = await boxState('loginPassword');
    const caret = await ev(`document.getElementById('loginPassword').selectionStart`);
    check('click eye: shown as text, crossed-eye icon, pressed, label "Ẩn mật khẩu", cursor stays in the box', s.type === 'text' && s.eyeOff && !s.eye && s.pressed === 'true' && s.label === 'Ẩn mật khẩu' && s.focused && caret === 3, { s, caret });
    check('eye sits inside the box, on the right', s.inside && s.iconRight >= 0 && s.iconRight <= 12, s);
    await b.shot('eye-login-shown');
    await clickSel('[aria-controls="loginPassword"]');
    s = await boxState('loginPassword');
    check('click again: hidden, eye icon, not pressed, label "Hiện mật khẩu"', s.type === 'password' && s.eye && !s.eyeOff && s.pressed === 'false' && s.label === 'Hiện mật khẩu', s);
    await ev(`document.querySelector('[aria-controls="loginPassword"]').focus()`);
    await key('Enter', 13);
    check('keyboard: Enter on the eye shows the password', (await boxState('loginPassword')).type === 'text');
    await key(' ', 32);
    check('keyboard: Space hides it again', (await boxState('loginPassword')).type === 'password');
    // Log in with the password shown
    await clickSel('[aria-controls="loginPassword"]');
    let l = waitLoad(); await ev(`document.querySelector('form[action="/dang-nhap"]').requestSubmit()`);
    const typeAtSubmit = await ev(`document.getElementById('loginPassword') ? document.getElementById('loginPassword').type : 'gone'`).catch(() => 'navigated');
    await l; await sleep(400);
    check('logging in works with the password shown; the box was hidden again on submit', (await ev('location.pathname')) !== '/dang-nhap' && typeAtSubmit !== 'text', { at: await ev('location.pathname'), typeAtSubmit });

    // Profile: change password with boxes shown
    await nav('/ho-so');
    const unlabelled = await ev(`[...document.querySelectorAll('main input, main select, main textarea')]
      .filter((el) => el.type !== 'hidden' && el.getAttribute('aria-hidden') !== 'true' && !el.labels.length && !el.getAttribute('aria-label'))
      .map((el) => el.name || el.id || el.type)`);
    check('Hồ sơ: every field has a connected label (screen readers name it; clicking the label focuses it)', unlabelled.length === 0, unlabelled);
    check('Hồ sơ: clicking "Họ và tên" puts the cursor in its box', await ev(`(() => { document.querySelector('label[for="pf-name"]').click(); return document.activeElement && document.activeElement.id === 'pf-name'; })()`));
    check('Hồ sơ: "Dữ liệu của bạn" explains the download and deleting, with the Chính sách bảo mật link (underlined, not told apart by colour only)',
      await ev(`(() => { const a = document.querySelector('[data-privacy-hint] a[href="/chinh-sach-bao-mat"]'); return !!a && getComputedStyle(a).textDecorationLine.includes('underline'); })()`));
    const prof = await ev(`(() => { const f = document.querySelector('form[action="/ho-so/mat-khau"]'); const u = f.querySelector('input[autocomplete="username"]');
      return { toggles: f.querySelectorAll('[data-password-toggle]').length, user: u && { name: u.getAttribute('name'), value: u.value, readonly: u.readOnly, hiddenVisually: u.getBoundingClientRect().width <= 1, tab: u.tabIndex },
        current: document.getElementById('currentPassword').getAttribute('autocomplete'), newAc: document.getElementById('newPassword').getAttribute('autocomplete'), confAc: document.getElementById('confirmNewPassword').getAttribute('autocomplete') }; })()`);
    check('profile "Đổi mật khẩu": 3 boxes with eye buttons', prof.toggles === 3, prof);
    check('browser-fill setup: invisible unnamed username = your email; current = current-password, new/confirm = new-password',
      prof.user && prof.user.name === null && prof.user.value === EMAIL && prof.user.readonly && prof.user.hiddenVisually && prof.user.tab === -1 && prof.current === 'current-password' && prof.newAc === 'new-password' && prof.confAc === 'new-password', prof);
    await typeInto('#currentPassword', 'secret1');
    await typeInto('#newPassword', 'secret22');
    await typeInto('#confirmNewPassword', 'secret22');
    await clickSel('[aria-controls="currentPassword"]');
    await clickSel('[aria-controls="newPassword"]');
    const each = await ev(`['currentPassword','newPassword','confirmNewPassword'].map((i) => document.getElementById(i).type)`);
    check('each box toggles on its own (current + new shown, confirm hidden)', JSON.stringify(each) === JSON.stringify(['text', 'text', 'password']), each);
    posted.length = 0;
    l = waitLoad(); await ev(`document.querySelector('form[action="/ho-so/mat-khau"]').requestSubmit()`); await l; await sleep(400);
    const body = new URLSearchParams(posted.find((p) => p.url.endsWith('/ho-so/mat-khau'))?.body || '');
    check('only currentPassword / newPassword / confirmPassword are sent (no username field)', JSON.stringify([...body.keys()].sort()) === JSON.stringify(['confirmPassword', 'currentPassword', 'newPassword']), [...body.keys()]);
    check('password changed with the boxes shown (success message)', await ev(`!!document.querySelector('.form-alert.success')`));
    const tryLogin = async (pw) => (await fetch(BASE + '/dang-nhap', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ email: EMAIL, password: pw }) })).headers.get('location');
    const oldLoc = await tryLogin('secret1'); const newLoc = await tryLogin('secret22');
    check('old password rejected, new password accepted', oldLoc === null && newLoc && newLoc !== '/dang-nhap', { oldLoc, newLoc });
    // back/forward restore hides everything
    await b.clearCookie('connect.sid');
    await nav('/dang-ky');
    await typeInto('#regPassword', 'matkhau123'); await typeInto('#regConfirm', 'matkhau123');
    await clickSel('[aria-controls="regPassword"]');
    await nav('/dang-nhap'); await send('Runtime.evaluate', { expression: 'history.back()' }); await sleep(1200);
    check('coming back to a page via Back: all boxes hidden', (await ev(`[...document.querySelectorAll('[data-password-toggle]')].every((b) => document.getElementById(b.getAttribute('aria-controls')).type === 'password')`)));
  });

  await part(b, 'profile page (HTTP)', async () => {
    const EMAIL = `zztest-profile-${stamp}@example.com`;
    let sid = null;
    const req = async (p, { method = 'GET', body, lang = 'vi', redirect = 'manual' } = {}) => {
      const headers = { cookie: [sid && `connect.sid=${sid}`, `lang=${lang}`].filter(Boolean).join('; ') };
      const res = await fetch(BASE + p, { method, body, headers, redirect });
      const set = res.headers.getSetCookie().find((c) => c.startsWith('connect.sid='));
      if (set) sid = set.split(';')[0].slice('connect.sid='.length);
      return { status: res.status, text: await res.text(), location: res.headers.get('location') };
    };
    const form = (obj) => new URLSearchParams(obj);
    const multipart = (fields, file) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      if (file) fd.append('avatar', new Blob([file.data], { type: file.type }), file.name);
      return fd;
    };
    // Minimal valid 1x1 PNG
    const png = () => {
      const crc = (buf) => { let c; const crcTable = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } let x = 0xffffffff; for (const v of buf) x = crcTable[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
      const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
      const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
      const idat = zlib.deflateSync(Buffer.from([0, 21, 101, 192]));
      return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
    };
    const avatarSrc = (html) => ((html.match(/class="avatar-lg" src="([^"]+)"/) || [])[1] || '').split('?')[0] || null; // the page shows a ?w=320 copy
    const has = (html, s) => html.includes(s);
    const created = new Set();
    try {
      // About page language
      let r = await req('/ve-mtg', { lang: 'en' });
      check('About EN shows English profile', has(r.text, 'MTG works across 3 main areas') && !has(r.text, 'MTG hoạt động trên 3 lĩnh vực'));
      r = await req('/ve-mtg', { lang: 'vi' });
      check('About VI shows Vietnamese profile', has(r.text, 'MTG hoạt động trên 3 lĩnh vực') && !has(r.text, 'MTG works across'));
      // News: the list shows the title in the page's language; the article page keeps the original title
      r = await req('/tin-tuc', { lang: 'en' });
      check('News list EN shows the English title', has(r.text, 'MTG launches 3rd-gen stair-climbing robot'));
      const articlePath = (r.text.match(/href="(\/tin-tuc\/[a-f0-9]+)"/) || [])[1];
      r = await req(articlePath, { lang: 'en' });
      check('Article EN: original title + English body', has(r.text, '<h1>MTG ra mat Robot leo cau thang the he 3</h1>') && has(r.text, 'Article body') && has(r.text, '<title>MTG ra mat Robot'));
      r = await req(articlePath, { lang: 'vi' });
      check('Article VI: original title + Vietnamese body', has(r.text, '<h1>MTG ra mat Robot leo cau thang the he 3</h1>') && has(r.text, 'Noi dung tin tuc'));

      r = await req('/dang-ky', { method: 'POST', body: form({ name: 'Test Người Dùng', email: EMAIL, password: 'oldpass1', confirmPassword: 'oldpass1', agreePrivacy: '1' }) });
      check('register test account (then the login page, not logged in yet)', r.status === 303 && r.location === '/dang-nhap', r.status);
      r = await req('/dang-nhap', { method: 'POST', body: form({ email: EMAIL, password: 'oldpass1' }) });
      r = await req('/ho-so', { lang: 'vi' });
      check('VI: button "Cập nhật", password card, initials', has(r.text, '>Cập nhật</button>') && has(r.text, 'Đổi mật khẩu') && has(r.text, 'avatar-fallback" aria-hidden="true">TD<') && has(r.text, 'Chưa có giới thiệu.'));
      check('two-letter picture: no "Xóa ảnh" button, no Google note', !has(r.text, 'data-avatar-delete') && !has(r.text, 'data-google-note') && has(r.text, 'id="currentPassword"'));
      r = await req('/ho-so', { lang: 'en' });
      check('EN: button "Update", English labels', has(r.text, '>Update</button>') && has(r.text, 'Change password') && has(r.text, 'Member since') && has(r.text, 'No bio yet.'));
      r = await req('/ho-so', { method: 'POST', lang: 'en', body: multipart({ name: '  ', phone: '0912', bio: 'keep me' }) });
      check('empty name rejected (EN message) and typed values kept', r.status === 400 && has(r.text, 'Please enter your full name.') && has(r.text, '>keep me</textarea>'), r.status);
      r = await req('/ho-so', { method: 'POST', body: multipart({ name: 'Test', bio: 'x'.repeat(501) }) });
      check('bio over 500 characters rejected', r.status === 400 && has(r.text, 'Phần giới thiệu tối đa 500 ký tự.'), r.status);
      // 480 chars + 20 line breaks = exactly 500 in the browser's count, but 520 bytes once sent as \r\n
      const fullBio = Array.from({ length: 20 }, () => 'y'.repeat(24)).join('\n') + '\n';
      r = await req('/ho-so', { method: 'POST', body: multipart({ name: 'Test', bio: fullBio }) });
      check('500-char bio with line breaks accepted (\\r\\n counted as one)', r.status === 200 && has(r.text, 'Cập nhật hồ sơ thành công.'), { status: r.status, length: fullBio.length });
      r = await req('/ho-so', { method: 'POST', body: multipart({ name: 'Test' }, { data: Buffer.from('this is not an image, just text'), type: 'image/png', name: 'fake.png' }) });
      check('text file renamed .png (declared image/png) rejected by signature', r.status === 400 && has(r.text, 'Ảnh đại diện phải là file JPG, PNG, WEBP hoặc GIF.'), r.status);
      r = await req('/ho-so', { method: 'POST', body: multipart({ name: 'Test' }, { data: Buffer.from('plain'), type: 'text/plain', name: 'notes.txt' }) });
      check('.txt file rejected', r.status === 400 && has(r.text, 'Ảnh đại diện phải là file JPG'), r.status);
      const MB = 1024 * 1024;
      const uploadsBefore = readdirSync(PUBLIC + '/uploads/images').length;
      const tooBig = Buffer.concat([png(), Buffer.alloc(21 * MB)]);
      r = await req('/ho-so', { method: 'POST', lang: 'en', body: multipart({ name: 'Test' }, { data: tooBig, type: 'image/png', name: 'big.png' }) });
      check('21 MB photo rejected (EN message)', r.status === 400 && has(r.text, 'The profile photo can be at most 20 MB.'), r.status);
      r = await req('/ho-so', { method: 'POST', lang: 'vi', body: multipart({ name: 'Test' }, { data: tooBig, type: 'image/png', name: 'big.png' }) });
      check('21 MB photo rejected (VI message)', r.status === 400 && has(r.text, 'Ảnh đại diện tối đa 20 MB.'), r.status);
      check('rejected 21 MB uploads leave no file behind', readdirSync(PUBLIC + '/uploads/images').length === uploadsBefore);
      const large = Buffer.concat([png(), Buffer.alloc(15 * MB)]);
      r = await req('/ho-so', { method: 'POST', body: multipart({ name: 'Test' }, { data: large, type: 'image/png', name: 'large.png' }) });
      const largeAvatar = avatarSrc(r.text);
      if (largeAvatar) created.add(largeAvatar);
      check('15 MB photo accepted', r.status === 200 && !!largeAvatar && existsSync(PUBLIC + largeAvatar), r.status);
      check('hint shows 20 MB', has(r.text, 'tối đa 20 MB.'));
      r = await req('/ho-so', { method: 'POST', body: multipart({ name: 'Người Kiểm Thử', phone: '0912345678', schoolOrCompany: 'THCS Test', bio: 'Dòng một\nDòng hai' }, { data: png(), type: 'image/png', name: 'me.png' }) });
      const firstAvatar = avatarSrc(r.text);
      if (firstAvatar) created.add(firstAvatar);
      check('valid update with avatar: success + avatar shown + bio in summary', r.status === 200 && has(r.text, 'Cập nhật hồ sơ thành công.') && !!firstAvatar && has(r.text, '<p class="bio-text">Dòng một\nDòng hai</p>'), { status: r.status, firstAvatar });
      check('avatar file exists on disk', !!firstAvatar && existsSync(PUBLIC + firstAvatar));
      r = await req(firstAvatar);
      check('avatar is served', r.status === 200);
      r = await req('/ho-so', { method: 'POST', body: multipart({ name: 'Người Kiểm Thử' }, { data: png(), type: 'image/png', name: 'me2.png' }) });
      const secondAvatar = avatarSrc(r.text);
      if (secondAvatar) created.add(secondAvatar);
      check('replacing avatar removes the old file', !!secondAvatar && secondAvatar !== firstAvatar && !existsSync(PUBLIC + firstAvatar) && existsSync(PUBLIC + secondAvatar));
      check('own photo: "Xóa ảnh" button (its own form) and the confirm box', has(r.text, 'form="avatar-remove"') && has(r.text, 'action="/ho-so/anh-dai-dien/xoa"') && has(r.text, 'Xóa ảnh đại diện?'));
      r = await req('/ho-so/anh-dai-dien/xoa', { method: 'POST' });
      check('"Xóa ảnh": "Đã xóa ảnh đại diện.", initials back, file deleted, no button any more', r.status === 200 && has(r.text, 'Đã xóa ảnh đại diện.') && !avatarSrc(r.text) && has(r.text, 'aria-hidden="true">NT<') && !existsSync(PUBLIC + secondAvatar) && !has(r.text, 'data-avatar-delete'));
      r = await req('/ho-so', { method: 'POST', body: multipart({ name: 'Người Kiểm Thử' }) });
      check('saving the profile afterwards keeps the two letters', r.status === 200 && !avatarSrc(r.text));
      // Password change
      const pw = (o, lang = 'vi') => req('/ho-so/mat-khau', { method: 'POST', lang, body: form(o) });
      r = await pw({ currentPassword: 'wrong', newPassword: 'newpass1', confirmPassword: 'newpass1' });
      check('wrong current password rejected', r.status === 400 && has(r.text, 'Mật khẩu hiện tại không đúng.'));
      r = await pw({ currentPassword: 'oldpass1', newPassword: '123', confirmPassword: '123' }, 'en');
      check('too-short new password rejected (EN)', r.status === 400 && has(r.text, 'at least 6 characters'));
      r = await pw({ currentPassword: 'oldpass1', newPassword: 'oldpass1', confirmPassword: 'oldpass1' });
      check('new = current rejected', r.status === 400 && has(r.text, 'Mật khẩu mới phải khác mật khẩu hiện tại.'));
      r = await pw({ currentPassword: 'oldpass1', newPassword: 'newpass1', confirmPassword: 'newpass2' });
      check('mismatched confirmation rejected', r.status === 400 && has(r.text, 'Mật khẩu xác nhận không khớp.'));
      const sidBefore = sid;
      r = await pw({ currentPassword: 'oldpass1', newPassword: 'newpass1', confirmPassword: 'newpass1' });
      check('valid password change succeeds', r.status === 200 && has(r.text, 'Đổi mật khẩu thành công.'));
      check('session id rotated, still logged in', sid !== sidBefore && (await req('/ho-so')).status === 200);
      check('profile card error/success are separate', !has(r.text, 'Cập nhật hồ sơ thành công.'));
      sid = null;
      r = await req('/dang-nhap', { method: 'POST', body: form({ email: EMAIL, password: 'oldpass1' }) });
      check('old password no longer works', r.status === 400);
      r = await req('/dang-nhap', { method: 'POST', body: form({ email: EMAIL, password: 'newpass1', redirectTo: 'https://evil.example/' }) });
      check('login with new password works and lands on Trang chủ (a redirectTo field is ignored)', r.status === 303 && r.location === '/', r);
    } finally {
      for (const url of created) if (existsSync(PUBLIC + url)) unlinkSync(PUBLIC + url);
    }
  });

  await part(b, 'login attempt limit (HTTP)', async () => {
    const d = await db();
    const u = await createUser('limit', 'customer');
    const login = (email, password, lang = 'vi') => fetch(BASE + '/dang-nhap', { method: 'POST', redirect: 'manual', headers: { cookie: `lang=${lang}` }, body: new URLSearchParams({ email, password }) })
      .then(async (r) => ({ status: r.status, text: await r.text() }));
    const wrongs = async (n, email = u.email) => { for (let i = 0; i < n; i++) await login(email, `wrong-${i}`); };
    const key = `email:${u.email}`;
    await wrongs(3);
    let r = await login(u.email, u.password);
    check('3 wrong passwords, then the right one: logs in normally', r.status === 303, r.status);
    check('… and the right password clears the count', !(await d.collection('loginthrottles').findOne({ _id: key })));
    await wrongs(4);
    check('4 more wrong passwords: still allowed to log in', (await login(u.email, u.password)).status === 303);
    await wrongs(5);
    r = await login(u.email, u.password);
    check('5 wrong passwords within 15 minutes: even the right password is refused (429) with "Bạn đã nhập sai quá nhiều lần… 15 phút"',
      r.status === 429 && r.text.includes('Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.') && r.text.includes(`value="${u.email}"`), r.status);
    const en = await login(u.email, u.password, 'en');
    check('… in English: "Too many failed attempts…"', en.status === 429 && en.text.includes('Too many failed attempts. Please try again in 15 minutes.'));
    const doc = await d.collection('loginthrottles').findOne({ _id: key });
    check('… the lock lasts 15 minutes and is stored with an expiry (deleted by MongoDB afterwards)', doc && Math.abs(new Date(doc.lockedUntil) - Date.now() - 15 * 60000) < 60000 && +doc.expiresAt === +doc.lockedUntil, doc);
    const ttl = (await d.collection('loginthrottles').indexes()).some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0);
    check('… the collection has its automatic clean-up (TTL index)', ttl);
    await d.collection('loginthrottles').updateOne({ _id: key }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
    check('once the 15 minutes are over: the right password works again', (await login(u.email, u.password)).status === 303);
    // Many accounts from one address: 30 wrong passwords block the address
    await d.collection('loginthrottles').deleteMany({ _id: /^ip:/ });
    try {
      for (let i = 0; i < 30; i++) await login(`zztest-nobody-${i}-${stamp}@example.com`, 'wrong');
      r = await login(u.email, u.password);
      check('30 wrong passwords on different accounts from one address: that address waits 15 minutes', r.status === 429 && r.text.includes('15 phút'), r.status);
      const unknown = await d.collection('loginthrottles').findOne({ _id: `email:zztest-nobody-0-${stamp}@example.com` });
      check('… unknown emails are counted like real ones (nothing reveals whether an account exists)', unknown && unknown.fails === 1);
    } finally {
      await d.collection('loginthrottles').deleteMany({ $or: [{ _id: /^ip:/ }, { _id: new RegExp(`^email:zztest-nobody-.*-${stamp}@`) }] });
    }
    check('after the address count is cleared: logs in again', (await login(u.email, u.password)).status === 303);
  });

  await part(b, 'role badge on the profile', async () => {
    const d = await db();
    const accounts = {};
    for (const role of ['owner', 'admin', 'customer']) accounts[role] = await createUser(`role-${role}`, role);
    const profile = async (role, lang = 'vi') => (await fetch(BASE + '/ho-so', { headers: { cookie: `connect.sid=${accounts[role].sid}; lang=${lang}` } })).text();
    const summary = (html) => html.slice(html.indexOf('<aside class="profile-summary">'), html.indexOf('</aside>'));
    const want = {
      owner: { cls: 'tag role-owner', vi: 'Chủ sở hữu', en: 'Owner', crown: true },
      admin: { cls: 'tag role-admin', vi: 'Quản trị viên', en: 'Administrator', crown: false },
      customer: { cls: 'tag', vi: 'Khách hàng', en: 'Customer', crown: false },
    };
    for (const role of Object.keys(want)) for (const lang of ['vi', 'en']) {
      const aside = summary(await profile(role, lang));
      const block = (aside.match(/<div class="profile-bio profile-role">([\s\S]*?)<\/div>/) || [])[1] || '';
      const heading = ((block.match(/<h3>([^<]+)<\/h3>/) || [])[1] || '').trim();
      const span = block.match(/<span class="([^"]+)">([\s\S]*?)<\/span>/) || [];
      const label = (span[2] || '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<%[\s\S]*?%>/g, '').trim();
      const crown = /<svg/.test(span[2] || '');
      const roleAt = aside.indexOf('profile-role'); const bioAt = aside.indexOf('<div class="profile-bio">');
      const bioHeading = ((aside.slice(bioAt).match(/<h3>([^<]+)<\/h3>/) || [])[1] || '').trim();
      check(`[${role}/${lang}] "${heading}": ${label} (${span[1]}${crown ? ', crown' : ''}), right above "${bioHeading}"`,
        heading === (lang === 'en' ? 'Role' : 'Vai trò') && span[1] === want[role].cls && label === want[role][lang] && crown === want[role].crown && roleAt > 0 && roleAt < bioAt
          && bioHeading === (lang === 'en' ? 'About me' : 'Giới thiệu bản thân') && !/<(input|select|textarea)/.test(block),
        { heading, cls: span[1], label, crown, roleAt, bioAt, bioHeading });
    }
    // View only: posting role=owner with the profile form changes nothing
    const fd = new FormData();
    fd.append('name', 'ZZ customer'); fd.append('phone', ''); fd.append('schoolOrCompany', ''); fd.append('bio', 'zz'); fd.append('role', 'owner');
    const res = await fetch(BASE + '/ho-so', { method: 'POST', body: fd, redirect: 'manual', headers: { cookie: `connect.sid=${accounts.customer.sid}` } });
    const after = await d.collection('users').findOne({ email: accounts.customer.email });
    check('customer posting the profile form with role=owner stays a customer (profile still saved)', after.role === 'customer' && after.bio === 'zz' && res.status < 500, { status: res.status, role: after.role, bio: after.bio });
    check('the profile form has no role field', !/name="role"/.test(await profile('customer')));
    await b.login(accounts.owner.sid);
    await b.nav('/ho-so', 600);
    await b.shot('role-owner-light');
  });

  await part(b, 'oversized photo refused in the browser', async () => {
    const user = await createUser('avsize', 'customer');
    const dir = mkdtempSync(path.join(tmpdir(), 'mtg-avatar-'));
    const bigPath = path.join(dir, 'big-25mb.jpg');
    const smallPath = path.join(dir, 'small.jpg');
    writeFileSync(bigPath, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(25 * 1024 * 1024)]));
    writeFileSync(smallPath, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048)]));
    try {
      await send('DOM.enable');
      await b.login(user.sid);
      let requests = 0;
      b.on('Network.requestWillBeSent', (p) => { if (p.request.method === 'POST' && p.request.url.endsWith('/ho-so')) requests++; });
      const chooseFile = async (file) => {
        const { root } = await send('DOM.getDocument');
        const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-avatar-input]' });
        await send('DOM.setFileInputFiles', { nodeId, files: [file] });
        await sleep(300);
      };
      const state = () => ev(`({
        error: (document.querySelector('[data-avatar-error]') || {}).textContent || null,
        files: document.querySelector('[data-avatar-input]').files.length,
        previewTag: document.querySelector('[data-avatar-preview]').tagName,
        previewSrc: (document.querySelector('[data-avatar-preview]').src || '').slice(0, 5),
        href: location.pathname,
      })`);
      for (const lang of ['vi', 'en']) {
        await b.nav(`/ho-so?lang=${lang}`, 300);
        await chooseFile(bigPath);
        const s = await state();
        const expected = lang === 'vi' ? 'Ảnh đại diện tối đa 20 MB.' : 'The profile photo can be at most 20 MB.';
        check(`[${lang}] 25 MB file refused instantly with message`, s.error === expected, s.error);
        check(`[${lang}] input cleared, preview unchanged, nothing uploaded`, s.files === 0 && s.previewTag === 'DIV' && requests === 0 && s.href === '/ho-so', { files: s.files, preview: s.previewTag, posts: requests });
        await chooseFile(smallPath);
        const s2 = await state();
        check(`[${lang}] small file previews and clears the error`, s2.error === null && s2.files === 1 && s2.previewTag === 'IMG' && s2.previewSrc === 'blob:', s2);
        check(`[${lang}] "Bỏ ảnh vừa chọn" appears for the chosen photo`, await ev(`!document.querySelector('[data-avatar-drop]').hidden`));
        await ev(`document.querySelector('[data-avatar-drop]').click()`);
        const s3 = await state();
        check(`[${lang}] … and drops it: two letters back, no file chosen, button gone`, s3.files === 0 && s3.previewTag === 'DIV' && (await ev(`document.querySelector('[data-avatar-drop]').hidden`)), s3);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await part(b, '"Xóa ảnh" in the browser (asks first)', async () => {
    const user = await createUser('avdelete', 'customer');
    const fd = new FormData();
    fd.append('name', 'ZZ Ảnh Xóa');
    fd.append('avatar', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhgHBtcs1RQAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' }), 'me.png');
    await fetch(BASE + '/ho-so', { method: 'POST', body: fd, headers: { cookie: `connect.sid=${user.sid}` } });
    const saved = (await (await db()).collection('users').findOne({ _id: user.id })).avatar;
    check('test photo uploaded', !!saved && existsSync(PUBLIC + saved), saved);
    await b.login(user.sid);
    await b.nav('/ho-so', 400);
    const dialogOpen = () => ev(`document.querySelector('[data-avatar-confirm]').open`);
    check('"Xóa ảnh" shown next to "Chọn ảnh"', await ev(`(() => { const d = document.querySelector('[data-avatar-delete]'); return !!d && !d.hidden && d.getBoundingClientRect().width > 0 && d.textContent.trim() === 'Xóa ảnh'; })()`));
    await b.clickAt('[data-avatar-delete]'); await sleep(200);
    check('clicking it asks "Xóa ảnh đại diện?" first (nothing sent yet)', (await dialogOpen()) && (await ev(`location.pathname`)) === '/ho-so' && (await ev(`document.activeElement.hasAttribute('data-confirm-cancel')`)));
    await b.shot('avatar-delete-confirm');
    await b.clickAt('[data-confirm-cancel]'); await sleep(200);
    check('"Hủy" closes the box and keeps the photo', !(await dialogOpen()) && (await ev(`document.querySelector('[data-avatar-preview]').tagName`)) === 'IMG');
    await b.clickAt('[data-avatar-delete]'); await sleep(200);
    const l = b.waitLoad(); await b.clickAt('[data-confirm-ok]'); await l; await sleep(300);
    const after = await ev(`({ msg: (document.querySelector('.form-alert.success') || {}).textContent, initials: (document.querySelector('.avatar-lg.avatar-fallback') || {}).textContent, del: !!document.querySelector('[data-avatar-delete]') })`);
    check('"Xóa ảnh" confirmed: "Đã xóa ảnh đại diện.", the two letters (ZX), no button', after.msg === 'Đã xóa ảnh đại diện.' && after.initials === 'ZX' && !after.del, after);
    check('… and the photo file is deleted', !existsSync(PUBLIC + saved));
    await b.shot('avatar-deleted');
  });

  await part(b, 'sign-up checks, then login, then Trang chủ', async () => {
    const d = await db();
    const post = async (path, fields, lang = 'vi') => {
      const res = await fetch(BASE + path, { method: 'POST', redirect: 'manual', headers: { cookie: `lang=${lang}` }, body: new URLSearchParams(fields) });
      return { status: res.status, location: res.headers.get('location'), text: await res.text() };
    };
    const errorsIn = (html) => Object.fromEntries([...html.matchAll(/data-error-for="(\w+)">([^<]*)</g)].map((m) => [m[1], m[2].replace(/&#39;/g, "'")]));
    const ok = { name: 'ZZ Signup', email: `zztest-signup-${stamp}@example.com`, phone: '', schoolOrCompany: '', password: 'secret1', confirmPassword: 'secret1', agreePrivacy: '1' };

    // Server checks (the browser checks are bypassed here)
    let r = await post('/dang-ky', { name: ' ', email: '', password: '', confirmPassword: '' });
    let e = errorsIn(r.text);
    check('server: empty form refused, one message per required box (name, email, password, confirmation, consent tick)', r.status === 400 && e.name === 'Vui lòng nhập họ và tên.' && e.email === 'Vui lòng nhập email.' && e.password === 'Vui lòng nhập mật khẩu.' && e.confirmPassword === 'Vui lòng nhập lại mật khẩu.' && e.agreePrivacy === 'Vui lòng đánh dấu đồng ý với Chính sách bảo mật.' && !e.phone, e);
    const { agreePrivacy, ...noTick } = ok;
    r = await post('/dang-ky', noTick);
    e = errorsIn(r.text);
    check('server: everything right but the Chính sách bảo mật tick → refused, only the tick named', r.status === 400 && Object.keys(e).join() === 'agreePrivacy', e);
    check('… the page links the policy next to the tick', /<label class="checkbox-row consent-row" for="regAgree">[\s\S]*?href="\/chinh-sach-bao-mat"/.test(r.text));
    r = await post('/dang-ky', { ...ok, email: 'not-an-email', phone: '12ab', password: 'abc', confirmPassword: 'abd' });
    e = errorsIn(r.text);
    check('server: bad email, bad phone, short password, mismatched confirmation each named', r.status === 400 && e.email === 'Email không hợp lệ.' && e.phone === 'Số điện thoại không hợp lệ.' && e.password === 'Mật khẩu cần tối thiểu 6 ký tự.' && e.confirmPassword === 'Mật khẩu xác nhận không khớp.', e);
    check('server: what was typed is kept (name, email, phone)', r.text.includes('value="ZZ Signup"') && r.text.includes('value="not-an-email"') && r.text.includes('value="12ab"'));
    r = await post('/dang-ky', { ...ok, password: 'secret1', confirmPassword: 'secret2' }, 'en');
    check('server: messages in English on the English site', r.status === 400 && errorsIn(r.text).confirmPassword === "The passwords don't match.", errorsIn(r.text));
    check('server: nothing was saved by the refused sign-ups', !(await d.collection('users').findOne({ email: ok.email })));
    r = await post('/dang-ky', ok);
    check('server: name + email + password + tick is enough (phone and school are optional) → login page, not logged in', r.status === 303 && r.location === '/dang-nhap', r.status);
    const signed = await d.collection('users').findOne({ email: ok.email });
    check('… and the time of consent is saved with the account', signed && signed.privacyAcceptedAt instanceof Date && Date.now() - signed.privacyAcceptedAt < 60000, signed && signed.privacyAcceptedAt);
    r = await post('/dang-ky', { ...ok, email: ok.email.toUpperCase() });
    check('server: an email already registered is refused (on the email box)', r.status === 400 && /đã được đăng ký/.test(errorsIn(r.text).email || ''), errorsIn(r.text));

    // Browser: the form checks before sending
    await b.clearCookie('connect.sid');
    let posts = 0;
    b.on('Network.requestWillBeSent', (p) => { if (p.request.method === 'POST' && p.request.url.endsWith('/dang-ky')) posts++; });
    await b.nav('/dang-ky', 300);
    check('the optional boxes say so; the password box has a hint', await ev(`!!(document.querySelector('label[for="regPhone"] .form-optional') && document.querySelector('label[for="regSchool"] .form-optional') && document.querySelector('[data-hint-for="password"]'))`));
    await ev(`document.querySelector('[data-register-form] button[type=submit]').click()`); await sleep(300);
    let st = await ev(`({ errors: [...document.querySelectorAll('[data-register-form] [data-error-for]')].map((x) => x.getAttribute('data-error-for')), focus: document.activeElement && document.activeElement.name, path: location.pathname })`);
    check('browser: empty form not sent; name, email, password, confirmation and the tick marked; cursor in "Họ và tên"', posts === 0 && JSON.stringify(st.errors) === JSON.stringify(['name', 'email', 'password', 'confirmPassword', 'agreePrivacy']) && st.focus === 'name' && st.path === '/dang-ky', { posts, st });
    await ev(`document.getElementById('regAgree').click()`); await sleep(100);
    check('browser: ticking "Tôi đồng ý" clears its message', await ev(`!document.querySelector('[data-error-for="agreePrivacy"]') && !document.getElementById('regAgree').classList.contains('is-invalid')`));
    check('browser: clicking the words also ticks/unticks the box (label connected)', await ev(`(() => { const l = document.querySelector('label[for="regAgree"] span'); l.click(); const off = !document.getElementById('regAgree').checked; l.click(); return off && document.getElementById('regAgree').checked; })()`));
    const typeIn = async (id, text) => { await ev(`(() => { const i = document.getElementById('${id}'); i.focus(); i.select(); })()`); await send('Input.insertText', { text }); };
    await typeIn('regName', 'ZZ Signup Browser');
    check('browser: the name error goes away while typing', await ev(`!document.querySelector('[data-error-for="name"]') && !document.getElementById('regName').classList.contains('is-invalid')`));
    await typeIn('regEmail', 'abc@'); await ev(`document.getElementById('regEmail').blur()`);
    check('browser: a wrong email is named on leaving the box', (await ev(`(document.querySelector('[data-error-for="email"]') || {}).textContent`)) === 'Email không hợp lệ.');
    // The line under "Mật khẩu" says while typing how many characters are still needed
    const lengthLine = () => ev(`(() => { const p = document.querySelector('[data-password-length]'); return { text: p.textContent, short: p.classList.contains('is-short'), ok: p.classList.contains('is-ok'), shown: !p.hidden }; })()`);
    await typeIn('regPassword', 'abc');
    let len = await lengthLine();
    check('password "abc": "Còn thiếu 3 ký tự (tối thiểu 6)." while typing', len.text === 'Còn thiếu 3 ký tự (tối thiểu 6).' && len.short && len.shown, len);
    await ev(`document.getElementById('regPassword').blur()`);
    check('… and leaving the box with 3 characters names the rule in red', (await ev(`(document.querySelector('[data-error-for="password"]') || {}).textContent`)) === 'Mật khẩu cần tối thiểu 6 ký tự.');
    await ev(`document.getElementById('regPassword').focus()`); await send('Input.insertText', { text: 'def' });
    len = await lengthLine();
    check('6 characters: "Đủ độ dài ✓" in green, the red message gone', len.text === 'Đủ độ dài ✓' && len.ok && len.shown && !(await ev(`!!document.querySelector('[data-error-for="password"]')`)), len);
    await typeIn('regPassword', 'secret1');
    await typeIn('regConfirm', 'secret');
    check('browser: the confirmation says at once when it does not match', (await ev(`(document.querySelector('[data-error-for="confirmPassword"]') || {}).textContent`)) === 'Mật khẩu xác nhận không khớp.');
    await send('Input.insertText', { text: '1' });
    check('… and when it does', await ev(`!document.querySelector('[data-error-for="confirmPassword"]') && (document.querySelector('[data-ok-for="confirmPassword"]') || {}).textContent === 'Mật khẩu xác nhận khớp.'`));
    await b.shot('signup-checks');
    const browserEmail = `zztest-signup2-${stamp}@example.com`;
    await typeIn('regEmail', browserEmail);
    let l = b.waitLoad(); await ev(`document.querySelector('[data-register-form] button[type=submit]').click()`); await l; await sleep(300);
    st = await ev(`({ path: location.pathname, note: (document.querySelector('[data-registered]') || {}).textContent, email: document.getElementById('loginEmail').value, focus: document.activeElement && document.activeElement.id, loggedIn: !!document.querySelector('.user-menu') })`);
    check('sign-up → the login page: welcome note, new email filled in, cursor in the password box, not logged in yet',
      st.path === '/dang-nhap' && /Đăng ký thành công/.test(st.note || '') && st.email === browserEmail && st.focus === 'loginPassword' && !st.loggedIn, st);
    await b.nav('/dang-nhap', 200);
    check('the welcome note shows once only', !(await ev(`!!document.querySelector('[data-registered]')`)));
    await typeIn('loginEmail', browserEmail); await typeIn('loginPassword', 'secret1');
    await b.reducedMotion(false); // normal speed first (this PC has "reduced motion" on); the admin login below checks it on
    l = b.waitLoad(); await ev(`document.querySelector('form[action="/dang-nhap"]').requestSubmit()`); await l; await sleep(300);
    check('logging in → Trang chủ, logged in', await ev(`location.pathname === '/' && !!document.querySelector('.user-menu')`));
    const toast = () => ev(`(() => { const x = document.querySelector('[data-site-toast]'); if (!x) return null; const r = x.getBoundingClientRect(); return { text: x.textContent.replace(/\\s+/g, ' ').trim(), role: x.getAttribute('role'), visible: r.width > 0 && +getComputedStyle(x).opacity > 0.5, belowHeader: r.top >= document.querySelector('.site-header').getBoundingClientRect().bottom }; })()`);
    let tt = await toast();
    check('a notice says "Đăng nhập thành công. Xin chào, ZZ Signup Browser!" under the header', tt && tt.visible && tt.role === 'status' && tt.belowHeader && /^Đăng nhập thành công\. Xin chào, ZZ Signup Browser!/.test(tt.text), tt);
    await b.shot('login-notice');
    // After ~4 s it slides out to the right, off the screen (not a blink), then is removed
    const box = () => ev(`(() => { const x = document.querySelector('[data-site-toast]'); if (!x) return null; const r = x.getBoundingClientRect(); const cs = getComputedStyle(x);
      return { left: Math.round(r.left), top: Math.round(r.top), leaving: x.classList.contains('is-leaving'), anim: cs.animationName, dur: parseFloat(cs.animationDuration) }; })()`);
    const start = await box();
    let leaving = null;
    for (let i = 0; i < 150 && !leaving; i++) { await sleep(40); const x = await box(); if (x && x.leaving) leaving = x; }
    await sleep(Math.round((leaving ? leaving.dur : 0.5) * 1000 * 0.45));
    const mid = await box();
    check('after a few seconds it slides out to the right: still on the way, already moved', !!leaving && leaving.anim === 'site-toast-out' && leaving.dur >= 0.5 && mid && mid.left > start.left + 20, { start, leaving, mid });
    await b.shot('login-notice-leaving');
    await sleep(900);
    check('… and is gone once off the screen', (await toast()) === null);
    await b.nav('/', 200);
    check('reloading Trang chủ doesn\'t show it again', (await toast()) === null);

    // Every role lands on Trang chủ; a logged-out visitor sees no "Quản trị" / "Yêu cầu của tôi"
    const admin = await createUser('flow-admin', 'admin');
    await b.clearCookie('connect.sid');
    await b.nav('/', 200);
    check('logged out: no "Quản trị" or "Yêu cầu của tôi" link anywhere on the page', await ev(`!document.querySelector('a[href="/admin"], a[href^="/admin/"], a[href="/tai-khoan"]')`));
    await b.nav('/admin', 200);
    check('opening /admin logged out → the login page', (await ev('location.pathname')) === '/dang-nhap');
    await typeIn('loginEmail', admin.email); await typeIn('loginPassword', admin.password);
    // This time on a phone, with "reduced motion" on (as on the owner's PC)
    await b.viewport(390, 800); await b.reducedMotion(true);
    l = b.waitLoad(); await ev(`document.querySelector('form[action="/dang-nhap"]').requestSubmit()`); await l; await sleep(300);
    check('an admin logging in also lands on Trang chủ, with "Quản trị" in their name menu', await ev(`location.pathname === '/' && !!document.querySelector('.user-menu a[href="/admin"]')`));
    tt = await toast();
    check('the admin gets the notice too', tt && /Đăng nhập thành công/.test(tt.text), tt);
    const phoneStart = await box();
    check('phone: the notice sits at the bottom of the screen', phoneStart && phoneStart.top > 400, phoneStart);
    await b.hover('[data-site-toast]');
    await sleep(4600);
    const held = await box();
    check('while the pointer is on it, it stays (no countdown)', held && !held.leaving, held);
    await ev(`document.querySelector('[data-site-toast-close]').click()`); await sleep(30);
    const out = await box();
    check('× starts the slide at once; with reduced motion it still lasts a visible while (≥ 0.35 s)', out && out.leaving && out.anim === 'site-toast-out' && out.dur >= 0.35, out);
    await sleep(Math.round(out.dur * 1000 * 0.5));
    const outMid = await box();
    check('phone: it slides down, off the bottom of the screen', outMid && outMid.top > phoneStart.top + 15, { phoneStart, outMid });
    await b.shot('login-notice-phone-leaving');
    await sleep(800);
    check('… then it is gone', (await toast()) === null);
    await b.viewport(1280, 900); await send('Emulation.setEmulatedMedia', { features: [] }); // back to the PC's own setting
    await b.clearCookie('connect.sid');
  });

  await part(b, '"Tải dữ liệu của tôi" + "Xóa tài khoản" (HTTP)', async () => {
    const d = await db();
    const owner = await createUser('dataown', 'customer');
    const other = await createUser('dataother', 'customer');
    const staff = await createUser('datastaff', 'admin');
    const call = async (p, sid, { method = 'GET', body } = {}) => {
      const res = await fetch(BASE + p, { method, body, redirect: 'manual', headers: { accept: 'text/html', cookie: [sid && `connect.sid=${sid}`, 'lang=vi'].filter(Boolean).join('; ') } });
      const set = res.headers.getSetCookie().find((c) => c.startsWith('connect.sid='));
      return { status: res.status, location: res.headers.get('location'), headers: res.headers, text: await res.text(), sid: set ? set.split(';')[0].slice('connect.sid='.length) : null };
    };
    const now = new Date();
    await d.collection('quoterequests').insertMany([
      { name: 'ZZ Data Owner', phone: '0912345678', email: owner.email, schoolOrCompany: 'THCS Dữ Liệu', message: 'ZZ tin nhắn của tôi', interestedIn: 'khac', status: 'da_lien_he', user: owner.id, details: [{ kind: '', labelVi: 'Số lớp', labelEn: 'Classes', valueVi: '3', valueEn: '3' }], createdAt: now, updatedAt: now },
      { name: 'ZZ Data Other', phone: '', email: other.email, schoolOrCompany: '', message: 'ZZ tin nhắn người khác', interestedIn: 'khac', status: 'moi', user: other.id, details: [], createdAt: now, updatedAt: now },
    ]);
    removeLater('quoterequests', { name: /^ZZ Data / });
    // a photo, to check it goes too
    const fd = new FormData();
    fd.append('name', 'ZZ dataown');
    fd.append('avatar', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhgHBtcs1RQAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' }), 'me.png');
    await fetch(BASE + '/ho-so', { method: 'POST', body: fd, headers: { cookie: `connect.sid=${owner.sid}` } });
    const photo = (await d.collection('users').findOne({ _id: owner.id })).avatar;

    let r = await call('/ho-so/du-lieu', owner.sid);
    const data = r.status === 200 ? JSON.parse(r.text) : null;
    check('"Tải dữ liệu của tôi": a JSON file to save (mtg-du-lieu-<date>.json), never cached', r.status === 200 && /attachment; filename="mtg-du-lieu-\d{4}-\d{2}-\d{2}\.json"/.test(r.headers.get('content-disposition') || '')
      && (r.headers.get('content-type') || '').startsWith('application/json') && r.headers.get('cache-control') === 'no-store', { status: r.status, cd: r.headers.get('content-disposition'), cc: r.headers.get('cache-control') });
    check('… with the account (email, photo, joined, consent time) and their own request (status in words, details)', data && data.account.email === owner.email && data.account.avatar === photo && data.account.role === 'customer'
      && !!data.account.joinedAt && !!data.account.privacyAcceptedAt && data.requests.length === 1 && data.requests[0].message === 'ZZ tin nhắn của tôi' && data.requests[0].status === 'Đã liên hệ'
      && data.requests[0].details[0].label === 'Số lớp' && data.requests[0].details[0].value === '3', data);
    check('… nothing of another account, no password hash, no Google id, no database ids', !r.text.includes('người khác') && !/passwordHash|googleId|"_id"|"user"|\$2[aby]\$/.test(r.text));
    r = await call('/ho-so/du-lieu', null);
    check('not logged in: the download sends you to Đăng nhập', r.status === 302 && r.location === '/dang-nhap', r.status);

    r = await call('/ho-so', owner.sid);
    check('Hồ sơ (customer): "Dữ liệu của bạn" with "Tải dữ liệu của tôi" and "Xóa tài khoản" (box asks for the password)', r.text.includes('data-privacy-card') && r.text.includes('href="/ho-so/du-lieu" download')
      && r.text.includes('data-account-delete') && r.text.includes('Nhập mật khẩu để xác nhận') && /id="deleteConfirm" name="confirm" autocomplete="current-password"/.test(r.text));
    r = await call('/ho-so/xoa-tai-khoan', owner.sid, { method: 'POST', body: new URLSearchParams({ confirm: 'wrong-one' }) });
    check('wrong password: refused (400), the box opens again with the error, nothing deleted', r.status === 400 && r.text.includes('data-open-now') && r.text.includes('data-delete-error')
      && !!(await d.collection('users').findOne({ _id: owner.id })) && (await d.collection('quoterequests').countDocuments({ user: owner.id })) === 1);

    // a second login (another device) must stop working too
    const second = await fetch(BASE + '/dang-nhap', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ email: owner.email, password: owner.password }) });
    const sid2 = second.headers.getSetCookie().find((c) => c.startsWith('connect.sid=')).split(';')[0].slice('connect.sid='.length);
    r = await call('/ho-so/xoa-tai-khoan', owner.sid, { method: 'POST', body: new URLSearchParams({ confirm: owner.password }) });
    check('right password: deleted, back to Trang chủ', r.status === 302 && r.location === '/', r.status);
    check('… the account and its request are gone; the other account\'s request stays', !(await d.collection('users').findOne({ _id: owner.id }))
      && (await d.collection('quoterequests').countDocuments({ user: owner.id })) === 0 && (await d.collection('quoterequests').countDocuments({ user: other.id })) === 1);
    check('… the photo file is deleted', !!photo && !existsSync(PUBLIC + photo), photo);
    check('… no login of that account is left (other devices are logged out)', (await d.collection('sessions').countDocuments({ session: { $regex: String(owner.id) } })) === 0
      && (await call('/ho-so', sid2)).location === '/dang-nhap');
    const home = await call('/', r.sid);
    check('Trang chủ says "Đã xoá tài khoản." once (a status notice), logged out', home.text.includes('data-deleted-notice') && home.text.includes('Đã xoá tài khoản.') && /role="status"[^>]*data-deleted-notice/.test(home.text) && !home.text.includes('action="/dang-xuat"'));
    check('… and not again on the next page', !(await call('/', r.sid)).text.includes('data-deleted-notice'));

    r = await call('/ho-so', staff.sid);
    check('Hồ sơ (staff): download yes, no "Xóa tài khoản" (an owner deletes staff in Admin → Người dùng)', r.text.includes('href="/ho-so/du-lieu"') && !r.text.includes('data-account-delete') && r.text.includes('data-staff-no-delete'));
    r = await call('/ho-so/xoa-tai-khoan', staff.sid, { method: 'POST', body: new URLSearchParams({ confirm: staff.password }) });
    check('… and sending the form anyway is refused (403), account kept', r.status === 403 && !!(await d.collection('users').findOne({ _id: staff.id })), r.status);
  });

  await part(b, '"Xóa tài khoản" in the browser (asks for the password first)', async () => {
    const user = await createUser('datadel', 'customer');
    await b.login(user.sid);
    await b.nav('/ho-so', 400);
    const open = () => ev(`document.querySelector('[data-account-confirm]').open`);
    await b.clickAt('[data-account-delete]'); await sleep(200);
    check('"Xóa tài khoản" opens "Xóa tài khoản vĩnh viễn?" with the cursor in the password box (nothing sent)', (await open()) && (await ev(`document.activeElement.id`)) === 'deleteConfirm' && (await ev('location.pathname')) === '/ho-so');
    await b.shot('account-delete-confirm');
    await b.clickAt('[data-account-confirm] [data-confirm-cancel]'); await sleep(200);
    check('"Hủy" closes it, focus back on the button', !(await open()) && (await ev(`document.activeElement.hasAttribute('data-account-delete')`)));
    await b.clickAt('[data-account-delete]'); await sleep(200);
    await b.type('nope123');
    let l = b.waitLoad(); await ev(`document.querySelector('[data-account-delete-form]').requestSubmit()`); await l; await sleep(400);
    check('a wrong password: the page comes back with the box open and the error in it', (await open()) && (await ev(`!!document.querySelector('[data-account-confirm] .field-error') && document.getElementById('deleteConfirm').classList.contains('is-invalid')`)));
    await b.type(user.password);
    l = b.waitLoad(); await ev(`document.querySelector('[data-account-delete-form]').requestSubmit()`); await l; await sleep(400);
    check('the right password: Trang chủ with "Đã xoá tài khoản."', (await ev('location.pathname')) === '/' && (await ev(`!!document.querySelector('[data-deleted-notice]')`)));
    check('… and the account is gone', !(await (await db()).collection('users').findOne({ _id: user.id })));
    await b.clearCookie('connect.sid');
  });
});
