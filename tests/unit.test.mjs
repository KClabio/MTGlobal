// Unit tests: the small helpers in lib/ on their own (no browser, no database)
import { check, result } from './lib/check.mjs';
import { appRequire } from './lib/index.mjs';

const { isValidEmail, isValidPhone, isNonEmpty } = appRequire('./lib/validators.js');
const { escapeHtml, excerpt, slugify, parseContacts, toPlainText } = appRequire('./lib/text.js');
const { isStaff, canDeleteUser, canChangeRole } = appRequire('./lib/roles.js');
const { levelFromSchool, projectLevel, groupProjectsByLevel } = appRequire('./lib/project-levels.js');

// validators
check('email: a normal address is valid', isValidEmail('an.nguyen@truong.edu.vn'));
check('email: missing @ / domain / spaces are refused', !isValidEmail('an.nguyen') && !isValidEmail('an@') && !isValidEmail('an @a.vn') && !isValidEmail(''));
check('phone: Vietnamese and international formats are valid', isValidPhone('0901 234 567') && isValidPhone('+84 90-123-4567') && isValidPhone('(024) 3999 8888'));
check('phone: too short, letters or too long are refused', !isValidPhone('12345') && !isValidPhone('09abc12345') && !isValidPhone('0'.repeat(21)));
check('non-empty: spaces only count as empty', !isNonEmpty('   ') && !isNonEmpty('') && isNonEmpty(' a '));

// text
check('escapeHtml turns markup characters into plain text', escapeHtml('<b a="1">&\'') === '&lt;b a=&quot;1&quot;&gt;&amp;&#39;');
check('slugify: Vietnamese letters, đ and symbols', slugify('Đối tác: Kidscode Education (KC)') === 'doi-tac-kidscode-education-kc');
check('slugify: at most 80 characters, no dash at the end', slugify('a b '.repeat(60)).length <= 80 && !slugify('a b '.repeat(60)).endsWith('-'));
check('excerpt: cut at a word with …', (() => { const e = excerpt('Một hai ba bốn năm sáu bảy tám chín mười '.repeat(5), 40); return e.endsWith('…') && e.length <= 41 && !/\s…$/.test(e); })());
check('excerpt: short text unchanged', excerpt('Ngắn gọn.') === 'Ngắn gọn.');
check('toPlainText removes markup', !/</.test(toPlainText('<p>Xin <b>chào</b></p>')));
const contacts = parseContacts('Điện thoại: 0901 234 567\nEmail: info@mtg.vn\nFax: 024 3999 8888\nWebsite: https://mtg.vn', 'en');
check('contacts: phone → tel:, email → mailto:, fax stays text, label translated', contacts[0].href === 'tel:0901234567' && contacts[0].label === 'Phone' && contacts[1].href === 'mailto:info@mtg.vn' && contacts[2].href === null && contacts[3].href === 'https://mtg.vn', contacts);

// roles
const owner = { _id: 1, role: 'owner' }; const owner2 = { _id: 2, role: 'owner' }; const admin = { _id: 3, role: 'admin' }; const admin2 = { _id: 4, role: 'admin' }; const cust = { _id: 5, role: 'customer' };
check('staff = owner or admin', isStaff('owner') && isStaff('admin') && !isStaff('customer') && !isStaff(undefined));
check('owner deletes admins and customers, never owners or self', canDeleteUser(owner, admin) && canDeleteUser(owner, cust) && !canDeleteUser(owner, owner2) && !canDeleteUser(owner, owner));
check('admin deletes customers only', canDeleteUser(admin, cust) && !canDeleteUser(admin, admin2) && !canDeleteUser(admin, owner) && !canDeleteUser(admin, admin));
check('customer deletes nobody', !canDeleteUser(cust, { _id: 6, role: 'customer' }));
check('only an owner changes roles, never an owner\'s or their own', canChangeRole(owner, admin) && canChangeRole(owner, cust) && !canChangeRole(owner, owner2) && !canChangeRole(owner, owner) && !canChangeRole(admin, cust));

// project school levels
check('school level from the name', levelFromSchool('THCS Cầu Giấy') === 'thcs' && levelFromSchool('Trường Trung học phổ thông Kim Liên') === 'thpt' && levelFromSchool('Đại học Bách khoa') === 'dai-hoc' && levelFromSchool('') === 'khac');
check('a level chosen in the admin wins over the name', projectLevel({ level: 'thpt', schoolName: 'THCS A' }) === 'thpt' && projectLevel({ level: 'x', schoolName: 'THCS A' }) === 'thcs');
const groups = groupProjectsByLevel([{ schoolName: 'THCS A' }, { schoolName: 'THPT B' }]);
check('groups in level order; "Khác" only when it has projects', groups.map((g) => g.key).join() === 'thcs,thpt,dai-hoc' && groups[0].items.length === 1);

// TRUST_PROXY from .env (text) → what Express expects
const { parseTrustProxy } = appRequire('./lib/trust-proxy.js');
check('TRUST_PROXY empty or missing → not set', parseTrustProxy('') === undefined && parseTrustProxy('  ') === undefined && parseTrustProxy(undefined) === undefined);
check('TRUST_PROXY "1", "2" → number of proxies', parseTrustProxy('1') === 1 && parseTrustProxy(' 2 ') === 2);
check('TRUST_PROXY "true" / "false" → true / false', parseTrustProxy('true') === true && parseTrustProxy('false') === false);
check('TRUST_PROXY names and address lists stay as text', parseTrustProxy('loopback') === 'loopback' && parseTrustProxy('10.0.0.0/8, 127.0.0.1') === '10.0.0.0/8, 127.0.0.1');
{
  // Through Express itself: TRUST_PROXY=1 trusts the proxy in front, so its "this visit is HTTPS" is believed
  const express = appRequire('express');
  const app = express();
  app.set('trust proxy', parseTrustProxy('1'));
  const fn = app.get('trust proxy fn');
  check('Express with TRUST_PROXY=1 trusts the host\'s proxy (it didn\'t when given the text "1")', fn('127.0.0.1', 0) === true && fn('::1', 0) === true);
}

// Login secret (lib/session-secret.js)
const { resolveSessionSecret, PLACEHOLDER } = appRequire('./lib/session-secret.js');
const strong = 'x'.repeat(40);
check('production: no secret → refuses to start', !!resolveSessionSecret({ NODE_ENV: 'production' }).error);
check('production: the .env.example value → refuses to start', !!resolveSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: PLACEHOLDER }).error);
check('production: shorter than 32 characters → refuses to start', /too short/.test(resolveSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: 'abc123' }).error || ''));
check('production: 32+ characters → used as given', resolveSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: strong }).secret === strong);
{
  const a = resolveSessionSecret({}); const b = resolveSessionSecret({});
  check('own computer without a secret: a random one each start, with a warning (never a value from the code)', a.secret && a.secret !== b.secret && a.secret.length >= 64 && !!a.warning && !/mtglobal-dev-secret/.test(a.secret));
  check('own computer with a secret: used as given', resolveSessionSecret({ SESSION_SECRET: 'abc' }).secret === 'abc');
}

// Login attempt limit: lock arithmetic (lib/login-throttle.js; the counting itself is checked through the site in accounts.test.mjs)
const lt = appRequire('./lib/login-throttle.js');
check('login limit: 5 per account, 30 per address, 15 minutes', lt.LIMITS.email === 5 && lt.LIMITS.ip === 30 && lt.WINDOW_MS === 900000 && lt.LOCK_MS === 900000);
check('login limit: minutes left on a lock (rounded up), 0 when free or expired', lt.minutesLeft({ lockedUntil: new Date(Date.now() + 61000) }) === 2 && lt.minutesLeft({ lockedUntil: new Date(Date.now() - 1000) }) === 0 && lt.minutesLeft(null) === 0 && lt.minutesLeft({ lockedUntil: null }) === 0);
check('login limit: keys are case-insensitive', lt.keyFor('email', ' An@Truong.VN ') === 'email:an@truong.vn');

// Cloudinary uploads without the old package (lib/cloudinary-storage.js), with a stand-in for Cloudinary
{
  const { cloudinaryStorage } = appRequire('./lib/cloudinary-storage.js');
  const { Readable, Writable } = await import('node:stream');
  const calls = { upload: null, destroyed: null, bytes: 0 };
  const uploader = {
    upload_stream(options, done) {
      calls.upload = options;
      return new Writable({ write(chunk, enc, cb) { calls.bytes += chunk.length; cb(); }, final(cb) { cb(); done(null, { secure_url: 'https://res.cloudinary.com/demo/image/upload/abc.jpg', public_id: 'mtglobal/images/abc', bytes: calls.bytes, resource_type: 'image' }); } });
    },
    destroy(id, opts, cb) { calls.destroyed = [id, opts.resource_type]; cb(null); },
  };
  const storage = cloudinaryStorage({ uploader, params: () => ({ folder: 'mtglobal/images', resource_type: 'image', public_id: 'abc' }) });
  const stored = await new Promise((resolve, reject) => storage._handleFile({}, { stream: Readable.from([Buffer.alloc(1000, 1)]) }, (err, info) => (err ? reject(err) : resolve(info))));
  check('Cloudinary upload: streamed with the folder, type and name; file gets its https address', calls.upload.folder === 'mtglobal/images' && calls.bytes === 1000 && stored.path.startsWith('https://res.cloudinary.com/') && stored.filename === 'mtglobal/images/abc' && stored.size === 1000, { calls, stored });
  await new Promise((resolve) => storage._removeFile({}, stored, resolve));
  check('Cloudinary upload: a rejected file is deleted from Cloudinary again', calls.destroyed && calls.destroyed[0] === 'mtglobal/images/abc' && calls.destroyed[1] === 'image', calls.destroyed);
  let failed = null;
  const broken = cloudinaryStorage({ uploader: { upload_stream: (o, done) => new Writable({ write(c, e, cb) { cb(); }, final(cb) { cb(); done(new Error('Cloudinary down')); } }) }, params: () => ({}) });
  await new Promise((resolve) => broken._handleFile({}, { stream: Readable.from([Buffer.from('x')]) }, (err) => { failed = err; resolve(); }));
  check('Cloudinary upload: an error from Cloudinary reaches the form (no silent loss)', failed && failed.message === 'Cloudinary down');
}

// Speed: picture sizes (lib/picture.js), fingerprints and the joined style file (lib/assets.js)
{
  const { picture, resized } = appRequire('./lib/picture.js');
  const { WIDTHS } = appRequire('./lib/images.js');
  check('picture widths: only 320, 480, 800, 1200, 1600 are made', JSON.stringify(WIDTHS) === '[320,480,800,1200,1600]');
  const html = picture('/uploads/images/a.jpg', 'Phòng "STEM"', { sizes: '100vw' });
  check('picture(): a site photo gets srcset 480–1600, sizes, lazy loading and an escaped alt',
    html.includes('src="/uploads/images/a.jpg?w=800"') && html.includes('/uploads/images/a.jpg?w=480 480w') && html.includes('/uploads/images/a.jpg?w=1600 1600w') && html.includes('sizes="100vw"') && html.includes('loading="lazy"') && html.includes('alt="Phòng &quot;STEM&quot;"'), html);
  check('picture(): the first picture of a page is not lazy (fetchpriority high)', /fetchpriority="high"/.test(picture('/assets/x.png', '', { eager: true })) && !/loading=/.test(picture('/assets/x.png', '', { eager: true })));
  const cloud = picture('https://res.cloudinary.com/demo/image/upload/v1/mtglobal/images/abc.jpg', '');
  check('picture(): a Cloudinary photo gets Cloudinary\'s own resizing in its address', cloud.includes('https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_480/v1/mtglobal/images/abc.jpg 480w'), cloud);
  check('picture(): icons, SVG, GIF and other sites stay plain; no picture → nothing', !/srcset/.test(picture('/images/logo.svg', '')) && !/srcset/.test(picture('https://lh3.googleusercontent.com/a/x=s256-c', '')) && picture('', 'x') === '' && resized(null, 320) === '');
  check('resized(): one address at a width (an unknown width becomes 800)', resized('/assets/a.jpg', 1600) === '/assets/a.jpg?w=1600' && resized('/assets/a.jpg', 999) === '/assets/a.jpg?w=800');

  const fs = await import('node:fs'); const path = await import('node:path'); const os = await import('node:os');
  const { createAssets, minify } = appRequire('./lib/assets.js');
  const a = createAssets({ production: false });
  const v1 = a.asset('/js/theme.js');
  check('asset(): a fingerprint of the content is added to the address', /^\/js\/theme\.js\?v=[0-9a-f]{10}$/.test(v1), v1);
  check('asset(): files outside public/ or missing stay unchanged', a.asset('/../server.js') === '/../server.js' && a.asset('/js/nope.js') === '/js/nope.js');
  const site = a.bundle('/css/site.css').text;
  const order = ['fonts', 'theme', 'base', 'layout', 'components', 'home', 'pages'].map((n) => site.indexOf(`/* ${n}.css */`));
  check('site.css joins fonts, theme, base, layout, components, home and pages, in that order', order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), order);
  check('admin-all.css adds admin.css after the website\'s styles', a.bundle('/css/admin-all.css').text.indexOf('/* admin.css */') > a.bundle('/css/admin-all.css').text.indexOf('/* pages.css */'));
  check('production minifying keeps the rules and drops comments and spaces', minify('/* x */ a > b ,  c { color : red ; }\n') === 'a>b,c{color : red}');
  // The fingerprint follows the content: a temporary file in public/js, changed, then removed
  void os;
  const tmp = path.join(appRequire.resolve('./server.js'), '..', 'public', 'js', `zz-fingerprint-${Date.now()}.js`);
  try {
    fs.writeFileSync(tmp, 'var a = 1;');
    const url = '/js/' + path.basename(tmp);
    const before = a.asset(url);
    fs.writeFileSync(tmp, 'var a = 2;');
    fs.utimesSync(tmp, new Date(), new Date(Date.now() + 5000));
    check('asset(): editing a file changes its fingerprint (so browsers fetch the new one)', before !== a.asset(url) && /\?v=/.test(before), [before, a.asset(url)]);
  } finally { try { fs.unlinkSync(tmp); } catch { /* gone */ } }
}

// Database down: pages answer at once with the 503 page (lib/db-guard.js; the real outage is measured by npm run qa -- --only 32)
{
  const { dbGuard, isDbUnavailable, RETRY_AFTER_SECONDS } = appRequire('./lib/db-guard.js');
  const run = (readyState) => {
    const out = { next: false, status: null, headers: {}, view: null };
    const res = { status(s) { out.status = s; return this; }, set(k, v) { out.headers[k] = v; return this; }, render(v) { out.view = v; } };
    dbGuard({ readyState })({}, res, () => { out.next = true; });
    return out;
  };
  check('database connected: the page is answered normally', run(1).next && run(1).status === null);
  const down = run(0); const reconnecting = run(2);
  check('database down or reconnecting: "temporarily unavailable" page at once (503, retry in 30 s, not cached)', !down.next && down.status === 503 && down.view === '503' && down.headers['Retry-After'] === '30' && down.headers['Cache-Control'] === 'no-store' && reconnecting.status === 503 && RETRY_AFTER_SECONDS === 30, down);
  const sel = new Error('Server selection timed out after 5000 ms'); sel.name = 'MongooseServerSelectionError';
  check('"database unreachable" errors get the 503 page; other errors keep the 500 page', isDbUnavailable(sel) && isDbUnavailable(new Error('Operation `users.findOne()` buffering timed out after 10000ms')) && !isDbUnavailable(new Error('Cannot read properties of undefined')) && !isDbUnavailable(null));
}

// Search engines: robots.txt and the sitemap (lib/sitemap.js; the live list is checked in nav.test.mjs and npm run qa)
{
  const { siteBase, robotsText, buildSitemap } = appRequire('./lib/sitemap.js');
  const req = { protocol: 'https', get: () => 'mtg.example' };
  check('site address: SITE_URL wins (slash at the end dropped); otherwise the visit\'s own address', siteBase(req, 'https://mtg.vn/') === 'https://mtg.vn' && siteBase(req, '') === 'https://mtg.example' && siteBase(req, 'not a url') === 'https://mtg.example');
  const robots = robotsText('https://mtg.vn');
  check('robots.txt: admin, account and profile pages are off limits; points to the sitemap', ['/admin', '/tai-khoan', '/ho-so'].every((p) => robots.includes(`Disallow: ${p}\n`)) && robots.includes('Sitemap: https://mtg.vn/sitemap.xml') && /^User-agent: \*/.test(robots), robots);
  const xml = buildSitemap('https://mtg.vn', [{ path: '/' }, { path: '/dich-vu/a&b', lastmod: new Date('2026-10-01T10:00:00Z') }]);
  check('sitemap: each page in Vietnamese and English, linked to each other (hreflang vi / en / x-default)',
    (xml.match(/<url>/g) || []).length === 4 && xml.includes('<loc>https://mtg.vn/?lang=en</loc>') && xml.includes('hreflang="en" href="https://mtg.vn/?lang=en"') && xml.includes('hreflang="x-default" href="https://mtg.vn/"'), xml);
  check('sitemap: last change date and escaped characters', xml.includes('<lastmod>2026-10-01</lastmod>') && xml.includes('/dich-vu/a&amp;b?lang=en') && !/a&b/.test(xml));
}

// Page description and link preview (lib/seo.js; the tags on real pages are checked in nav.test.mjs)
{
  const { pageMeta, DESCRIPTION_MAX } = appRequire('./lib/seo.js');
  const base = 'https://mtg.vn';
  const vi = pageMeta({ base, path: '/giai-phap/du-an', lang: 'vi', description: '<p>Phòng Lab <b>STEM</b></p>\n- cho mọi cấp học', image: '/uploads/images/a.jpg' });
  check('preview: description is plain text on one line', vi.description === 'Phòng Lab STEM cho mọi cấp học', vi.description);
  check('preview: Vietnamese page → its own address, both languages as alternates, vi_VN', vi.url === 'https://mtg.vn/giai-phap/du-an' && vi.alternates.en === 'https://mtg.vn/giai-phap/du-an?lang=en' && vi.locale === 'vi_VN' && vi.altLocale === 'en_US');
  const en = pageMeta({ base, path: '/giai-phap/du-an', lang: 'en' });
  check('preview: English page → the ?lang=en address, en_US', en.url === 'https://mtg.vn/giai-phap/du-an?lang=en' && en.locale === 'en_US');
  check('preview: picture → its full 1200 px address', vi.image === 'https://mtg.vn/uploads/images/a.jpg?w=1200', vi.image);
  const long = pageMeta({ base, path: '/', description: 'Robot thông minh '.repeat(30) });
  check('preview: a long description is cut at a word, at most 160 characters', long.description.length <= DESCRIPTION_MAX + 1 && long.description.endsWith('…'), long.description.length);
  const none = pageMeta({ base, path: '/', description: '', fallbackDescription: 'Mô tả chung', image: '/uploads/images/logo.svg' });
  check('preview: no text → the site description; a picture a preview can\'t show (SVG) → the default picture', none.description === 'Mô tả chung' && none.image === 'https://mtg.vn/images/og-default.jpg?w=1200', none);
  const cloud = pageMeta({ base, path: '/', image: 'https://res.cloudinary.com/demo/image/upload/v1/x.jpg', type: 'article' });
  check('preview: Cloudinary picture stays absolute (resized by Cloudinary); news articles are "article"', cloud.image.startsWith('https://res.cloudinary.com/demo/image/upload/') && cloud.image.includes('w_1200') && cloud.type === 'article', cloud.image);
}

// Requests are deleted 24 months after their last change (lib/retention.js); a stand-in replaces the database call
{
  const QuoteRequest = appRequire('./models/QuoteRequest.js');
  const { REQUEST_KEEP_MONTHS, requestCutoff, deleteOldRequests } = appRequire('./lib/retention.js');
  const cut = requestCutoff(new Date('2026-10-22T10:00:00Z'));
  check('retention: requests are kept 24 months; the cut-off is the same day 24 months back', REQUEST_KEEP_MONTHS === 24 && cut.toISOString() === '2024-10-22T10:00:00.000Z', cut);
  const real = QuoteRequest.deleteMany;
  let asked = null;
  QuoteRequest.deleteMany = async (filter) => { asked = filter; return { deletedCount: 3 }; };
  try {
    const count = await deleteOldRequests(new Date('2026-10-22T10:00:00Z'));
    check('retention: deletes by last change (updatedAt) before the cut-off, and says how many', count === 3 && asked && asked.updatedAt && asked.updatedAt.$lt.toISOString() === '2024-10-22T10:00:00.000Z' && Object.keys(asked).length === 1, asked);
  } finally {
    QuoteRequest.deleteMany = real;
  }
}

// Personal photos stored on Cloudinary are deleted with the account (middleware/upload.js removeUpload)
{
  const { cloudinaryPublicId } = appRequire('./lib/cloudinary-storage.js');
  check('Cloudinary id: our photo address gives its id and type', JSON.stringify(cloudinaryPublicId('https://res.cloudinary.com/mtg/image/upload/v1712/mtglobal/images/4b1c-9f.jpg', 'mtg')) === JSON.stringify({ publicId: 'mtglobal/images/4b1c-9f', resourceType: 'image' }));
  check('Cloudinary id: another cloud, a folder that is not ours, a Google photo or a local file give nothing',
    cloudinaryPublicId('https://res.cloudinary.com/other/image/upload/v1/mtglobal/images/a.jpg', 'mtg') === null
    && cloudinaryPublicId('https://res.cloudinary.com/mtg/image/upload/v1/samples/a.jpg', 'mtg') === null
    && cloudinaryPublicId('https://lh3.googleusercontent.com/a/abc=s256-c', 'mtg') === null
    && cloudinaryPublicId('/uploads/images/a.jpg', 'mtg') === null && cloudinaryPublicId(null, 'mtg') === null);
}

// Photo order after an admin save (product / project / service photos dragged into place)
{
  const { orderMedia } = appRequire('./lib/media-order.js');
  const [a, b, c] = ['/a.jpg', '/b.jpg', '/c.jpg'];
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  check('orderMedia: the order the form sent', eq(orderMedia([a, b, c], [c, a, b]), [c, a, b]));
  check('orderMedia: addresses not on the record, and repeats, are ignored', eq(orderMedia([a, b], ['https://evil.example/x.jpg', b, b, a]), [b, a]));
  check('orderMedia: photos the form left out stay, after the others, in their old order', eq(orderMedia([a, b, c], [c]), [c, a, b]));
  check('orderMedia: ticked photos are dropped; one value or none works too', eq(orderMedia([a, b, c], [c, b, a], [b]), [c, a]) && eq(orderMedia([a, b], b, a), [b]) && eq(orderMedia([a, b]), [a, b]) && eq(orderMedia(undefined, [a]), []));
}

// Visit counts are deleted with the same 24-month cut-off (lib/retention.js); a stand-in replaces the database call
{
  const PageView = appRequire('./models/PageView.js');
  const { deleteOldPageViews } = appRequire('./lib/retention.js');
  const real = PageView.deleteMany;
  let asked = null;
  PageView.deleteMany = async (filter) => { asked = filter; return { deletedCount: 2 }; };
  try {
    const count = await deleteOldPageViews(new Date('2026-10-22T10:00:00Z'));
    check('retention: visit counts of days before 2024-10-22 are deleted', count === 2 && asked && asked.day && asked.day.$lt === '2024-10-22', asked);
  } finally {
    PageView.deleteMany = real;
  }
}

// Which page views count (lib/page-views.js): public pages shown to a real browser, not staff, robots or the admin
{
  const { shouldCount, cleanPath, dayOf } = appRequire('./lib/page-views.js');
  const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  const view = ({ method = 'GET', path = '/ve-mtg', status = 200, type = 'text/html; charset=utf-8', agent = CHROME, user = null, purpose = '' } = {}) => shouldCount(
    { method, path, user, get: (h) => ({ 'User-Agent': agent, 'Sec-Purpose': purpose })[h] || '' },
    { statusCode: status, get: () => type },
  );
  check('counted: a public page shown in a browser, to a visitor or a customer', view() && view({ user: { role: 'customer' } }));
  check('not counted: staff, the admin and account pages, errors and redirects, files, HEAD',
    !view({ user: { role: 'admin' } }) && !view({ user: { role: 'owner' } }) && !view({ path: '/admin/yeu-cau' }) && !view({ path: '/tai-khoan' }) && !view({ path: '/dang-nhap' })
    && !view({ status: 404 }) && !view({ status: 303 }) && !view({ type: 'application/json' }) && !view({ method: 'HEAD' }));
  check('not counted: search engines, link previews, headless browsers, scripts, prefetches',
    !view({ agent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }) && !view({ agent: 'facebookexternalhit/1.1' }) && !view({ agent: 'Mozilla/5.0 HeadlessChrome/130' }) && !view({ agent: 'curl/8.4' }) && !view({ agent: 'node' }) && !view({ purpose: 'prefetch' }));
  check('pages are counted by their address in small letters, without a trailing slash', cleanPath('/San-Pham/Robot-Cat-Co/') === '/san-pham/robot-cat-co' && cleanPath('/') === '/' && cleanPath('') === '/');
  check("the day is Vietnam's: 17:30 UTC on 30 Oct is already 31 Oct", dayOf(new Date('2026-10-30T17:30:00Z')) === '2026-10-31' && dayOf(new Date('2026-10-30T16:30:00Z')) === '2026-10-30');
}

// Chat button links (lib/chat-links.js): Zalo as digits, Messenger as the Facebook page name
{
  const { cleanZalo, cleanMessenger, chatLinks } = appRequire('./lib/chat-links.js');
  check('Zalo: spaces, dots and + are dropped; too short or not a number → empty', cleanZalo('0912 345.678') === '0912345678' && cleanZalo('+84 912 345 678') === '84912345678' && cleanZalo('123') === '' && cleanZalo('abc') === '');
  check('Messenger: a page name, an m.me or facebook.com link all give the name; anything else → empty',
    cleanMessenger('mtg.vn') === 'mtg.vn' && cleanMessenger('https://m.me/mtg.vn') === 'mtg.vn' && cleanMessenger('https://www.facebook.com/mtg.vn/?ref=x') === 'mtg.vn'
    && cleanMessenger('javascript:alert(1)') === '' && cleanMessenger('https://evil.example/x/y') === '' && cleanMessenger('') === '');
  check('chat links: only the filled ones, Zalo first', JSON.stringify(chatLinks({ zalo: '0912345678', messenger: 'mtg.vn' })) === JSON.stringify([{ kind: 'zalo', url: 'https://zalo.me/0912345678' }, { kind: 'messenger', url: 'https://m.me/mtg.vn' }])
    && JSON.stringify(chatLinks({ messenger: 'mtg.vn' })) === JSON.stringify([{ kind: 'messenger', url: 'https://m.me/mtg.vn' }]) && chatLinks({}).length === 0 && chatLinks(undefined).length === 0);
}

// The sender's confirmation never carries what was typed into the form (lib/request-mail.js)
{
  const { senderMail, staffMail } = appRequire('./lib/request-mail.js');
  const request = { name: 'Visit evil.example now', email: 'x@example.com', phone: '', schoolOrCompany: 'Spam Co', message: 'Click http://evil.example', interestedIn: 'khac', details: [], createdAt: new Date('2026-10-30T03:00:00Z') };
  const mine = senderMail(request, { lang: 'vi', settings: { contactInfo: { phone: '1900 1234', email: 'info@mtg.vn' } }, base: 'https://mtg.vn' });
  check("confirmation: no name, school or message, only the category label, the time and the company's own contacts",
    !/evil|Spam/.test(mine.text + mine.subject) && mine.text.includes('"Khác"') && mine.text.includes('10:00 30/10/2026') && mine.text.includes('Điện thoại: 1900 1234') && mine.text.includes('Email: info@mtg.vn'), mine.text);
  const staff = staffMail({ ...request, name: 'An\r\nBcc: x@evil.example' }, { base: 'https://mtg.vn', user: null, changed: false });
  check("staff email: a line break typed in the name can't reach the subject line", !/[\r\n]/.test(staff.subject) && staff.subject.includes('An Bcc: x@evil.example'), staff.subject);
}

// Staff two-step login codes (lib/two-factor.js)
{
  const tf = appRequire('./lib/two-factor.js');
  const { canResetTwoStep } = appRequire('./lib/roles.js');
  // RFC 6238 Appendix B (HMAC-SHA1, 8 digits, key "12345678901234567890")
  const rfcKey = Buffer.from('12345678901234567890');
  const rfc = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']];
  const got = rfc.map(([s]) => tf.codeFor(rfcKey, Math.floor(s / 30), { digits: 8 }));
  check('TOTP: the 6 official RFC 6238 test values', rfc.every(([, want], i) => got[i] === want), got);
  check('Base32: RFC 4648 example and round trip', tf.base32Encode(Buffer.from('foobar')) === 'MZXW6YTBOI' && tf.base32Decode('mzxw 6ytb oi').toString() === 'foobar');
  const secret = tf.newSecret();
  check('a new app key: 32 Base32 letters (160 bits), different each time', /^[A-Z2-7]{32}$/.test(secret) && secret !== tf.newSecret(), secret);
  const now = Date.UTC(2026, 9, 31, 8, 0, 15);
  const at = (ms) => tf.codeFor(tf.base32Decode(secret), tf.stepAt(ms));
  const ok = tf.checkCode(secret, at(now), { now, allowReuse: false });
  check('the current code is accepted, also typed with a space ("123 456")', ok.ok && tf.checkCode(secret, at(now).replace(/^(\d{3})/, '$1 '), { now, allowReuse: false }).ok);
  check('a phone clock 30 s off still works; 90 s off does not', tf.checkCode(secret, at(now - 30000), { now, allowReuse: false }).ok && tf.checkCode(secret, at(now + 30000), { now, allowReuse: false }).ok
    && !tf.checkCode(secret, at(now - 90000), { now, allowReuse: false }).ok);
  const behind = tf.checkCode(secret, at(now - 90000), { now, allowReuse: false });
  const ahead = tf.checkCode(secret, at(now + 90000), { now, allowReuse: false });
  check('a code from 90 s earlier or later: refused, and the gap is told (phone behind −90, ahead +90)', !behind.ok && behind.offBy === -90 && !ahead.ok && ahead.offBy === 90, { behind, ahead });
  const far = tf.checkCode(secret, at(now + 11 * 60000), { now, allowReuse: false });
  check('a code from more than 10 minutes away: just wrong (no clock hint)', !far.ok && far.offBy === undefined || [-1, 0, 1].some((d) => at(now + d * 30000) === at(now + 11 * 60000)), far);
  check('the 10-minute hint never accepts a code', [2, 5, 20].every((n) => !tf.checkCode(secret, at(now + n * 30000), { now, allowReuse: true }).ok));
  const again = tf.checkCode(secret, at(now), { now, lastStep: ok.step, allowReuse: false });
  check('a code already used is refused (and said so); an older one too', !again.ok && again.reused && !tf.checkCode(secret, at(now - 30000), { now, lastStep: ok.step, allowReuse: false }).ok);
  check('the next code after a used one is accepted', tf.checkCode(secret, at(now + 30000), { now: now + 30000, lastStep: ok.step, allowReuse: false }).ok);
  const wrong = at(now).replace(/^\d/, (d) => String((Number(d) + 1) % 10));
  check('a wrong code is refused', !tf.checkCode(secret, wrong, { now, allowReuse: false }).ok || [at(now - 30000), at(now + 30000)].includes(wrong));
  check('… and letters, 5 digits, empty', !tf.checkCode(secret, 'abcdef', { now }).ok && !tf.checkCode(secret, '12345', { now }).ok && !tf.checkCode(secret, '', { now }).ok);
  check('code reuse is allowed only on a test server (TWO_STEP_TEST_REUSE=1), never with NODE_ENV=production',
    tf.reuseAllowed({ TWO_STEP_TEST_REUSE: '1' }) && !tf.reuseAllowed({ TWO_STEP_TEST_REUSE: '1', NODE_ENV: 'production' }) && !tf.reuseAllowed({}));
  tf.init('a'.repeat(40));
  const sealed = tf.seal(secret);
  check('the stored key is locked: not readable, opens back, a changed copy is refused', !sealed.includes(secret) && tf.open(sealed) === secret && tf.open(sealed.slice(0, -2) + 'xx') === null && tf.open('plain') === null);
  tf.init('b'.repeat(40));
  check('after SESSION_SECRET changes, the old key can\'t be opened (staff set up again)', tf.open(sealed) === null && !tf.isEnabled({ twoFactor: { secret: sealed, enabledAt: new Date() } }));
  tf.init('a'.repeat(40));
  const { codes, hashes } = tf.newBackupCodes();
  check('10 backup codes like "abcd-2345", all different, stored only as hashes', codes.length === 10 && new Set(codes).size === 10 && codes.every((c) => /^[a-z2-9]{4}-[a-z2-9]{4}$/.test(c)) && hashes.every((h, i) => /^[0-9a-f]{64}$/.test(h) && !h.includes(codes[i])), codes);
  check('a backup code is found with or without the dash, in capitals or with spaces; others are not', tf.findBackup(hashes, codes[4]) === 4 && tf.findBackup(hashes, codes[4].replace('-', '').toUpperCase()) === 4
    && tf.findBackup(hashes, ` ${codes[4].replace('-', ' ')} `) === 4 && tf.findBackup(hashes, 'zzzz-zzzz') === -1 && tf.findBackup(hashes, '123456') === -1);
  check('the QR address names MTG and the email, with the key', tf.otpauthUri('an@mtg.vn', secret) === `otpauth://totp/MTG%3Aan%40mtg.vn?secret=${secret}&issuer=MTG&algorithm=SHA1&digits=6&period=30`);
  const withTwoStep = { ...admin, twoFactor: { enabledAt: new Date() } };
  check('"Đặt lại 2 bước": an owner, for an admin with it on; never an owner, a customer, oneself or by an admin',
    canResetTwoStep(owner, withTwoStep) && !canResetTwoStep(owner, admin) && !canResetTwoStep(owner, { ...owner2, twoFactor: { enabledAt: new Date() } })
    && !canResetTwoStep(admin2, withTwoStep) && !canResetTwoStep({ ...admin, role: 'owner' }, withTwoStep) && !canResetTwoStep(owner, { ...cust, twoFactor: { enabledAt: new Date() } }));
}

// Trang chủ's data kept in memory (lib/memo-cache.js)
{
  const { memo, clearMemo, homeCacheSeconds } = appRequire('./lib/memo-cache.js');
  check('memory time: 60 s on the live server, off elsewhere, HOME_CACHE_SECONDS wins',
    homeCacheSeconds({ NODE_ENV: 'production' }) === 60 && homeCacheSeconds({}) === 0 && homeCacheSeconds({ NODE_ENV: 'production', HOME_CACHE_SECONDS: '0' }) === 0
    && homeCacheSeconds({ HOME_CACHE_SECONDS: '30' }) === 30 && homeCacheSeconds({ HOME_CACHE_SECONDS: 'abc' }) === 0);
  let reads = 0;
  const load = () => { reads += 1; return new Promise((r) => setTimeout(() => r(reads), 20)); };
  clearMemo();
  const [a, b] = await Promise.all([memo('u1', 60, load), memo('u1', 60, load)]);
  check('two visits at the same moment share one read', reads === 1 && a === 1 && b === 1, { reads, a, b });
  check('a fresh value is reused', (await memo('u1', 60, load)) === 1 && reads === 1);
  clearMemo();
  check('after clearMemo the next visit reads again', (await memo('u1', 60, load)) === 2 && reads === 2);
  await memo('u2', 0.05, load);
  await new Promise((r) => setTimeout(r, 80));
  check('an expired value is read again', (await memo('u2', 0.05, load)) === 4 && reads === 4, reads);
  check('0 seconds: every visit reads', (await memo('u3', 0, load)) === 5 && (await memo('u3', 0, load)) === 6);
  let fail = true;
  const flaky = async () => { if (fail) { fail = false; throw new Error('db down'); } return 'ok'; };
  const first = await memo('u4', 60, flaky).catch((e) => e.message);
  check('a failed read is not kept: the next visit tries again', first === 'db down' && (await memo('u4', 60, flaky)) === 'ok');
  clearMemo();
}

// Minified scripts (lib/assets.js)
{
  const fs = await import('node:fs');
  const vm = await import('node:vm');
  const { createAssets, minifyJs, JS_FILES } = appRequire('./lib/assets.js');
  for (const url of JS_FILES) {
    const src = fs.readFileSync(new URL(`../public${url}`, import.meta.url), 'utf8');
    const min = await minifyJs(src);
    let parses = true;
    try { new vm.Script(min); } catch { parses = false; }
    check(`${url}: minified, still valid JavaScript, at most 60% of the size`, parses && min.length <= src.length * 0.6, { from: src.length, to: min.length });
  }
  // A route call with fake req/res: what it sends, or whether it hands over to express.static (next)
  const call = (route, url, query = {}) => new Promise((resolve) => {
    const res = { headers: {}, type() { return this; }, set(k, v) { this.headers[k] = v; return this; }, status() { return this; },
      end() { resolve({ sent: '' }); }, send(body) { resolve({ sent: body, headers: this.headers }); } };
    route({ path: url, query, fresh: false }, res, () => resolve({ next: true }));
  });
  const on = createAssets({ production: false, minifyScripts: true });
  const sent = await call(on.scriptRoute, '/js/main.js');
  check('minifying on: main.js is sent minified, browsers re-check it on a test computer', !!sent.sent && sent.sent.length < 60000 && sent.headers['Cache-Control'] === 'no-cache', sent.headers);
  check('minifying on: other files go on to express.static', (await call(on.scriptRoute, '/js/nope.js')).next && (await call(on.scriptRoute, '/css/site.css')).next);
  const off = createAssets({ production: false, minifyScripts: false });
  check('minifying off: main.js is sent as written', (await call(off.scriptRoute, '/js/main.js')).next);
  const live = createAssets({ production: true });
  const hash = live.asset('/js/main.js').split('v=')[1];
  check('live server: minified by default, kept a year with its fingerprint', (await call(live.scriptRoute, '/js/main.js', { v: hash })).headers['Cache-Control'].includes('31536000'));
  const broken = createAssets({ production: false, minifyScripts: true, minifier: async () => { throw new Error('test'); } });
  const origError = console.error; console.error = () => {};
  const fallback = await call(broken.scriptRoute, '/js/theme.js');
  console.error = origError;
  check('minifying fails: the original file is sent instead (express.static)', fallback.next === true);
}

// Form posts from another website (lib/same-origin.js)
{
  const { crossSiteReason } = appRequire('./lib/same-origin.js');
  const req = (method, headers, host = 'mtg.vn') => ({ method, protocol: 'http', get: (n) => ({ host, ...headers })[n.toLowerCase()] });
  check('GET from anywhere is fine (links from other sites)', crossSiteReason(req('GET', { origin: 'https://evil.example' })) === '');
  check('POST with this site\'s Origin: fine, also https behind a proxy that reports http', crossSiteReason(req('POST', { origin: 'http://mtg.vn' })) === '' && crossSiteReason(req('POST', { origin: 'https://mtg.vn' })) === '');
  check('POST from another site, a look-alike host or Origin "null": refused', !!crossSiteReason(req('POST', { origin: 'https://evil.example' })) && !!crossSiteReason(req('POST', { origin: 'https://mtg.vn.evil.example' })) && !!crossSiteReason(req('POST', { origin: 'null' })));
  check('no Origin: the Referer decides; neither: fine (not a browser on a hostile page)', !!crossSiteReason(req('POST', { referer: 'https://evil.example/x' })) && crossSiteReason(req('POST', { referer: 'https://mtg.vn/lien-he' })) === '' && crossSiteReason(req('POST', {})) === '');
  check('SITE_URL counts as this site (the request came in on another host name)', crossSiteReason(req('POST', { origin: 'https://www.mtg.vn' }, 'internal:3000'), 'https://www.mtg.vn') === '' && !!crossSiteReason(req('POST', { origin: 'https://www.mtg.vn' }, 'internal:3000')));
}

process.exit(result() ? 1 : 0);
