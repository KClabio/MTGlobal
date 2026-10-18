// "Đăng nhập bằng Google" against the fake Google of tests/lib/fake-google.mjs (tests/run.mjs gives the test server its address):
// a new account from Google, name/email/photo copied at every Google login, joining an existing email + password account,
// cancel / forged state / unverified email, "Xóa ảnh" keeping a Google photo away, an own photo kept, setting a first password.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { suite, part, check, db, BASE, ROOT, createUser, stamp } from './lib/index.mjs';
import { startFakeGoogle, setNextProfile, cancelNext, FAKE_GOOGLE_PORT } from './lib/fake-google.mjs';

const PUBLIC = path.join(ROOT, 'public');
const PHOTO = (name) => `http://localhost:${FAKE_GOOGLE_PORT}/photo/${name}=s96-c`;
await startFakeGoogle();

// A visitor without a browser: keeps its own session cookie and follows the Google round trip by hand
function visitor() {
  let sid = null;
  const go = async (url, { method = 'GET', body } = {}) => {
    const site = !url.startsWith('http') || url.startsWith(BASE);
    const headers = { accept: 'text/html', cookie: [site && sid && `connect.sid=${sid}`, 'lang=vi'].filter(Boolean).join('; ') };
    const res = await fetch(url.startsWith('http') ? url : BASE + url, { method, body, headers, redirect: 'manual' });
    const set = res.headers.getSetCookie().find((c) => c.startsWith('connect.sid='));
    if (site && set) sid = set.split(';')[0].slice('connect.sid='.length);
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  };
  // "Đăng nhập bằng Google" → Google → back to the site; returns the site's last answer
  const google = async () => {
    const start = await go('/dang-nhap/google');
    if (start.status !== 302) return start;
    const atGoogle = await go(start.location);
    return go(atGoogle.location);
  };
  return { go, google, get sid() { return sid; } };
}

await suite(async (b) => {
  const d = await db();
  const users = d.collection('users');
  const EMAIL = `zztest-google-${stamp}@example.com`;
  const SUB = `g-${stamp}-1`;

  await part(b, 'Google button on login and register', async () => {
    const v = visitor();
    let r = await v.go('/dang-nhap');
    check('/dang-nhap: "Đăng nhập bằng Google" under the form, after "hoặc"', /class="auth-divider"><span>hoặc<\/span>/.test(r.text) && /href="\/dang-nhap\/google" data-google-login>[\s\S]*?Đăng nhập bằng Google/.test(r.text));
    r = await v.go('/dang-ky');
    check('/dang-ky: "Đăng ký bằng Google"', /data-google-login>[\s\S]*?Đăng ký bằng Google/.test(r.text));
    r = await v.go('/dang-nhap/google');
    const to = r.location ? new URL(r.location) : null;
    check('the button leads to Google with this site\'s address to come back to, a state, and "choose an account"', r.status === 302 && to && to.port === String(FAKE_GOOGLE_PORT)
      && to.searchParams.get('redirect_uri') === `${BASE}/dang-nhap/google/callback` && /^[a-f0-9]{32}$/.test(to.searchParams.get('state') || '') && to.searchParams.get('prompt') === 'select_account'
      && to.searchParams.get('scope') === 'openid email profile', r.location);
  });

  await part(b, 'a new account from Google; name, email and photo follow Google', async () => {
    const v = visitor();
    setNextProfile({ sub: SUB, email: EMAIL, name: 'ZZ Google Một', picture: PHOTO('one') });
    let r = await v.google();
    let u = await users.findOne({ email: EMAIL });
    check('first Google login: Trang chủ, logged in', r.status === 303 && r.location === '/', r);
    check('… a customer account with the Google name, email and a sharper (256 px) photo, no password', u && u.googleId === SUB && u.role === 'customer' && u.name === 'ZZ Google Một'
      && u.avatar === `http://localhost:${FAKE_GOOGLE_PORT}/photo/one=s256-c` && !u.passwordHash && (u.avatarMode || '') === '', u);
    r = await v.go('/');
    check('… and Trang chủ says "Đăng nhập thành công. Xin chào, ZZ Google Một!"', r.text.includes('data-site-toast') && r.text.includes('Xin chào, ZZ Google Một!'));

    r = await v.go('/ho-so');
    check('profile: name locked (read only, not sent), "Đã liên kết Google", the Google note', r.text.includes('readonly aria-describedby="nameFromGoogle" data-google-name') && !/name="name"/.test(r.text)
      && r.text.includes('data-google-linked') && r.text.includes('Tên, email và ảnh đại diện được lấy từ tài khoản Google của bạn'));
    check('profile: the Google photo, with "Xóa ảnh"', r.text.includes(`class="avatar-lg" src="http://localhost:${FAKE_GOOGLE_PORT}/photo/one=s256-c"`) && r.text.includes('data-avatar-delete'));
    check('profile: "Đặt mật khẩu" (no current password to type)', r.text.includes('data-set-password') && !r.text.includes('id="currentPassword"') && />\s*Đặt mật khẩu\s*<\/button>/.test(r.text));

    // Only phone, school and bio are saved from the form; the name stays Google's
    const fd = new FormData();
    fd.append('name', 'Someone Else'); fd.append('phone', '0912345678'); fd.append('schoolOrCompany', 'THCS Google'); fd.append('bio', 'Xin chào');
    r = await v.go('/ho-so', { method: 'POST', body: fd });
    u = await users.findOne({ email: EMAIL });
    check('saving the profile keeps the Google name, saves phone / school / bio', r.status === 200 && u.name === 'ZZ Google Một' && u.phone === '0912345678' && u.schoolOrCompany === 'THCS Google' && u.bio === 'Xin chào', u);

    // Next Google login: Google's new name and photo replace the old ones
    const v2 = visitor();
    setNextProfile({ sub: SUB, email: EMAIL, name: 'ZZ Google Hai', picture: PHOTO('two') });
    r = await v2.google();
    u = await users.findOne({ googleId: SUB });
    check('next Google login: the new Google name and photo are copied; phone etc. stay', r.status === 303 && u.name === 'ZZ Google Hai' && u.avatar.endsWith('/photo/two=s256-c') && u.phone === '0912345678', u);
    check('… a fresh session id at login', !!v2.sid && v2.sid !== v.sid);

    // Password login for an account that has no password: refused cleanly
    r = await v2.go('/dang-nhap', { method: 'POST', body: new URLSearchParams({ email: EMAIL, password: 'anything' }) });
    check('password login before a password is set: "Email hoặc mật khẩu không đúng." (400, not a crash)', r.status === 400 && r.text.includes('Email hoặc mật khẩu không đúng.'), r.status);

    // "Xóa ảnh": the two letters, and the Google photo stays away at later Google logins
    r = await v2.go('/ho-so/anh-dai-dien/xoa', { method: 'POST' });
    u = await users.findOne({ googleId: SUB });
    check('"Xóa ảnh" on a Google photo: two letters (ZH)', r.status === 200 && r.text.includes('Đã xóa ảnh đại diện.') && r.text.includes('avatar-fallback" aria-hidden="true">ZH<') && u.avatar === null && u.avatarMode === 'none', u);
    setNextProfile({ sub: SUB, email: EMAIL, name: 'ZZ Google Hai', picture: PHOTO('three') });
    const v3 = visitor();
    r = await v3.google();
    u = await users.findOne({ googleId: SUB });
    check('… the next Google login doesn\'t bring the photo back', r.status === 303 && u.avatar === null, u.avatar);

    // An own photo isn't replaced by Google
    const up = new FormData();
    up.append('phone', '0912345678');
    up.append('avatar', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhgHBtcs1RQAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' }), 'own.png');
    r = await v3.go('/ho-so', { method: 'POST', body: up });
    u = await users.findOne({ googleId: SUB });
    const own = u.avatar;
    check('uploading an own photo: saved as the person\'s own', r.status === 200 && own && own.startsWith('/uploads/images/') && u.avatarMode === 'own', u);
    setNextProfile({ sub: SUB, email: EMAIL, name: 'ZZ Google Hai', picture: PHOTO('four') });
    const v4 = visitor();
    r = await v4.google();
    u = await users.findOne({ googleId: SUB });
    check('… a later Google login keeps the own photo', r.status === 303 && u.avatar === own, u.avatar);
    r = await v4.go('/ho-so/anh-dai-dien/xoa', { method: 'POST' });
    check('… "Xóa ảnh" deletes the uploaded file', r.status === 200 && !existsSync(PUBLIC + own));

    // Setting a first password, then logging in with it
    r = await v4.go('/ho-so/mat-khau', { method: 'POST', body: new URLSearchParams({ newPassword: 'abc', confirmPassword: 'abc' }) });
    check('first password: too short refused', r.status === 400 && r.text.includes('tối thiểu 6 ký tự'), r.status);
    r = await v4.go('/ho-so/mat-khau', { method: 'POST', body: new URLSearchParams({ newPassword: 'gpass12', confirmPassword: 'gpass12' }) });
    check('first password set: the message, and the card is now "Đổi mật khẩu" with "Mật khẩu hiện tại"', r.status === 200 && r.text.includes('Đã đặt mật khẩu.') && r.text.includes('id="currentPassword"'), r.status);
    r = await visitor().go('/dang-nhap', { method: 'POST', body: new URLSearchParams({ email: EMAIL, password: 'gpass12' }) });
    check('… and the email + password login works too', r.status === 303 && r.location === '/', r.status);
  });

  await part(b, 'joining an existing email + password account', async () => {
    const admin = await createUser('google-join', 'admin');
    const before = await users.findOne({ _id: admin.id });
    setNextProfile({ sub: `g-${stamp}-join`, email: admin.email, name: 'ZZ Joined Name', picture: PHOTO('join') });
    const v = visitor();
    let r = await v.google();
    const u = await users.findOne({ _id: admin.id });
    check('same email: the same account is used (no second account), now joined to Google', r.status === 303 && u.googleId === `g-${stamp}-join` && (await users.countDocuments({ email: admin.email })) === 1, u);
    check('… role (admin) and password kept; name and photo from Google', u.role === 'admin' && u.passwordHash === before.passwordHash && u.name === 'ZZ Joined Name' && u.avatar.endsWith('/photo/join=s256-c'), u);
    r = await visitor().go('/dang-nhap', { method: 'POST', body: new URLSearchParams({ email: admin.email, password: admin.password }) });
    check('… the old password still logs in', r.status === 303);
    r = await v.go('/');
    check('… and the admin still has "Quản trị" in the name menu', r.text.includes('href="/admin"'));

    // Another Google account with that email can't take it over
    setNextProfile({ sub: `g-${stamp}-other`, email: admin.email, name: 'ZZ Intruder' });
    r = await visitor().google();
    check('another Google account with an already joined email: refused with a message', r.status === 400 && r.text.includes('đã được liên kết với một tài khoản Google khác') && (await users.findOne({ _id: admin.id })).name === 'ZZ Joined Name');
  });

  await part(b, 'cancel, forged return, unverified email', async () => {
    let v = visitor();
    cancelNext();
    let r = await v.google();
    check('"Hủy" at Google: back on the login page with "Bạn đã hủy đăng nhập bằng Google."', r.status === 400 && r.text.includes('Bạn đã hủy đăng nhập bằng Google.') && r.text.includes('action="/dang-nhap"'));
    check('… not logged in', !(await v.go('/')).text.includes('user-menu-trigger'));

    v = visitor();
    await v.go('/dang-nhap/google');
    r = await v.go('/dang-nhap/google/callback?code=code-x&state=forged');
    check('a return with the wrong state is refused ("không thành công")', r.status === 400 && r.text.includes('Đăng nhập bằng Google không thành công'));
    r = await visitor().go('/dang-nhap/google/callback?code=code-x&state=x');
    check('a return without starting at the button is refused too', r.status === 400);

    const UNVERIFIED = `zztest-google-unverified-${stamp}@example.com`;
    setNextProfile({ sub: `g-${stamp}-unv`, email: UNVERIFIED, name: 'ZZ Unverified', email_verified: false });
    r = await visitor().google();
    check('an email Google hasn\'t verified: refused, no account made', r.status === 400 && r.text.includes('chưa được Google xác minh') && !(await users.findOne({ email: UNVERIFIED })));
  });

  await part(b, 'in the browser: the button, the notice, the profile', async () => {
    const BROWSER_EMAIL = `zztest-google-browser-${stamp}@example.com`;
    setNextProfile({ sub: `g-${stamp}-browser`, email: BROWSER_EMAIL, name: 'ZZ Trình Duyệt', picture: PHOTO('browser') });
    await b.nav('/dang-nhap', 300);
    const btn = await b.ev(`(() => { const a = document.querySelector('[data-google-login]'); const f = document.querySelector('form[action="/dang-nhap"] button[type=submit]').getBoundingClientRect(); const r = a.getBoundingClientRect();
      return { below: r.top > f.bottom, sameWidth: Math.abs(r.width - f.width) < 2, logo: !!a.querySelector('svg.google-logo') }; })()`);
    check('the Google button sits under "Đăng nhập", as wide, with the G logo', btn.below && btn.sameWidth && btn.logo, btn);
    await b.shot('google-login-button');
    await b.clickAndWait('[data-google-login]', 600);
    check('clicking it (Google answers at once here) lands on Trang chủ with the green notice', await b.ev(`location.pathname === '/' && !!document.querySelector('[data-site-toast]') && /Xin chào, ZZ Trình Duyệt!/.test(document.querySelector('[data-site-toast]').textContent)`));
    await b.ev(`document.querySelector('[data-site-toast-close]').click()`); await b.sleep(40);
    check('… the same notice as the password login: × slides it out (site-toast-out)', await b.ev(`(() => { const x = document.querySelector('[data-site-toast]'); return !!x && x.classList.contains('is-leaving') && getComputedStyle(x).animationName === 'site-toast-out'; })()`));
    await b.nav('/ho-so', 400);
    const p = await b.ev(`({ name: document.querySelector('[data-google-name]').readOnly, photo: document.querySelector('.avatar-lg').tagName, note: !!document.querySelector('[data-google-note]'), del: !!document.querySelector('[data-avatar-delete]') })`);
    check('profile in the browser: name read only, Google photo, note, "Xóa ảnh"', p.name && p.photo === 'IMG' && p.note && p.del, p);
    await b.shot('google-profile');
  });
}); // suite() exits the process, which also stops the fake Google
