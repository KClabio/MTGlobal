// Header menus (hover-only dropdowns, clickable group titles, keyboard, account menu, phone drawer)
// and the light/dark switches (guest header, account menu, admin), shared preference, admin toasts, dark-mode contrast.
import { suite, part, check, createUser, restoreLater, db, BASE } from './lib/index.mjs';

await suite(async (b) => {
  const { send, ev, sleep } = b;
  const user = await createUser('nav', 'customer');
  const admin = await createUser('theme', 'admin');
  await restoreLater('services', {}); // the toast check moves a service with the keyboard and back

  await part(b, 'security headers (lib/security-headers.js)', async () => {
    const head = async (p) => { const r = await fetch(BASE + p, { redirect: 'manual' }); return { h: Object.fromEntries(r.headers), text: await r.text() }; };
    for (const p of ['/', '/css/base.css', '/admin']) {
      const { h } = await head(p);
      const csp = h['content-security-policy'] || '';
      check(`${p}: content policy (own scripts with a nonce, no plugins, framing only by the site)`, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/.test(csp) && csp.includes("object-src 'none'") && csp.includes("frame-ancestors 'self'") && csp.includes("form-action 'self'"), csp);
      check(`${p}: X-Frame-Options SAMEORIGIN, nosniff, referrer kept within the site, camera/mic/location off`, h['x-frame-options'] === 'SAMEORIGIN' && h['x-content-type-options'] === 'nosniff' && h['referrer-policy'] === 'strict-origin-when-cross-origin' && /camera=\(\)/.test(h['permissions-policy'] || ''), h);
      check(`${p}: no "X-Powered-By", no HTTPS-only rule outside production`, !h['x-powered-by'] && !h['strict-transport-security'], h);
    }
    const one = await head('/'); const two = await head('/');
    const nonceOf = (r) => ((r.h['content-security-policy'] || '').match(/'nonce-([^']+)'/) || [])[1];
    check('each page gets its own nonce, and its inline script carries it', nonceOf(one) && nonceOf(one) !== nonceOf(two) && one.text.includes(`<script nonce="${nonceOf(one)}">`));
    // In the browser: nothing the site needs is blocked (any refused script, style, picture or font is counted)
    const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__cspBlocked = []; document.addEventListener('securitypolicyviolation', (e) => window.__cspBlocked.push(e.violatedDirective + ' ' + (e.blockedURI || 'inline')));` });
    try {
      const blocked = {};
      const visit = async (p) => { await b.nav(p, 500); const v = await ev('window.__cspBlocked'); const js = await ev(`document.documentElement.classList.contains('js')`); if (v.length || !js) blocked[p] = { v, inlineRan: js }; };
      for (const p of ['/', '/giai-phap/stem-lab', '/giai-phap/thiet-bi', '/giai-phap/du-an', '/san-pham', '/dang-nhap', '/dang-ky']) await visit(p);
      await b.login(admin.sid);
      for (const p of ['/', '/lien-he', '/ho-so', '/admin', '/admin/yeu-cau', '/admin/nguoi-dung', '/admin/trang/stem-lab', '/admin/cai-dat']) await visit(p);
      check('pages and admin: nothing blocked by the content policy, and the inline scripts ran', !Object.keys(blocked).length, blocked);
    } finally {
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      await b.clearCookie('connect.sid');
    }
  });

  await part(b, 'search engines: robots.txt and sitemap.xml (lib/sitemap.js)', async () => {
    const robots = await fetch(BASE + '/robots.txt');
    const rt = await robots.text();
    check('robots.txt: plain text, keeps search engines out of admin / account / profile, points to the sitemap', robots.status === 200 && /text\/plain/.test(robots.headers.get('content-type')) && ['/admin', '/tai-khoan', '/ho-so'].every((p) => rt.includes(`Disallow: ${p}\n`)) && rt.includes(`Sitemap: ${BASE}/sitemap.xml`), rt);
    const read = async () => { const r = await fetch(BASE + '/sitemap.xml'); return { status: r.status, type: r.headers.get('content-type'), xml: await r.text() }; };
    const s = await read();
    const locs = [...s.xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(BASE, ''));
    check('sitemap.xml: XML with the main pages in Vietnamese and English', s.status === 200 && /xml/.test(s.type) && ['/', '/giai-phap/stem-lab', '/giai-phap/thiet-bi', '/giai-phap/du-an', '/tin-tuc', '/?lang=en', '/giai-phap/stem-lab?lang=en'].every((p) => locs.includes(p)), locs.slice(0, 12));
    check('sitemap.xml: no admin, account, login or Liên hệ pages', !locs.some((p) => /^\/(admin|tai-khoan|ho-so|dang-nhap|dang-ky|dang-xuat|lien-he)/.test(p)));
    check('sitemap.xml: every page twice (VI + EN), each with its hreflang pair', locs.length % 2 === 0 && locs.filter((p) => p.endsWith('lang=en')).length === locs.length / 2 && (s.xml.match(/hreflang="en"/g) || []).length === locs.length);
    // A new project shows by itself, and is gone again once deleted
    const d = await db();
    const { insertedId } = await d.collection('projects').insertOne({ titleVi: 'ZZ sitemap dự án', titleEn: 'ZZ sitemap project', schoolName: 'ZZ', images: [], order: 999, createdAt: new Date(), updatedAt: new Date() });
    try {
      check('a new project appears in the sitemap (both languages)', (await read()).xml.includes(`/giai-phap/du-an/${insertedId}?lang=en`));
    } finally { await d.collection('projects').deleteOne({ _id: insertedId }); }
    check('… and disappears once deleted', !(await read()).xml.includes(`/giai-phap/du-an/${insertedId}`));
    check('sitemap.xml: the Chính sách bảo mật page (both languages)', locs.includes('/chinh-sach-bao-mat') && locs.includes('/chinh-sach-bao-mat?lang=en'));
    check('sitemap.xml: the Hỗ trợ page (both languages)', locs.includes('/ho-tro') && locs.includes('/ho-tro?lang=en'));
  });

  await part(b, 'search engines and link previews: description, canonical, Open Graph (lib/seo.js)', async () => {
    const head = async (path, lang = 'vi') => {
      const html = await (await fetch(BASE + path, { headers: { cookie: `lang=${lang}` } })).text();
      const h = (html.match(/<head>([\s\S]*?)<\/head>/) || [])[1] || '';
      const tag = (re) => { const m = h.match(re); return m ? m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null; };
      return {
        h, description: tag(/<meta name="description" content="([^"]*)"/), canonical: tag(/<link rel="canonical" href="([^"]*)"/),
        ogTitle: tag(/<meta property="og:title" content="([^"]*)"/), ogDesc: tag(/<meta property="og:description" content="([^"]*)"/),
        ogImage: tag(/<meta property="og:image" content="([^"]*)"/), ogUrl: tag(/<meta property="og:url" content="([^"]*)"/),
        ogType: tag(/<meta property="og:type" content="([^"]*)"/), locale: tag(/<meta property="og:locale" content="([^"]*)"/),
        noindex: /<meta name="robots" content="noindex">/.test(h),
      };
    };
    const ok = (m) => m.description && m.description.length >= 30 && m.description.length <= 161 && m.ogDesc === m.description && m.ogTitle && /^https?:\/\//.test(m.ogImage) && m.ogUrl === m.canonical;
    const home = await head('/');
    check('Trang chủ: description, canonical and Open Graph tags, vi_VN', ok(home) && home.canonical === BASE + '/' && home.locale === 'vi_VN' && home.h.includes(`hreflang="en" href="${BASE}/?lang=en"`), home);
    const robot = await head('/san-pham/robot-leo-cau-thang');
    check('a robot page: its own description and picture', ok(robot) && robot.ogImage.includes('?w=1200') && robot.canonical === BASE + '/san-pham/robot-leo-cau-thang', robot);
    const enLab = await head('/giai-phap/stem-lab', 'en');
    check('an English page: the ?lang=en address, en_US, English text', ok(enLab) && enLab.canonical === BASE + '/giai-phap/stem-lab?lang=en' && enLab.locale === 'en_US' && /STEM Lab/.test(enLab.description), enLab);
    const d = await db();
    const project = await d.collection('projects').findOne({ 'images.0': { $exists: true } });
    if (project) {
      const p = await head(`/giai-phap/du-an/${project._id}`);
      check('a project with photos: its first photo is the preview picture', ok(p) && (p.ogImage.startsWith(BASE + project.images[0].split('?')[0]) || p.ogImage.includes('cloudinary')), p.ogImage);
    }
    const img = await fetch(home.ogImage, { headers: { accept: 'image/*' } });
    check('the preview picture opens as a JPEG for Facebook / Zalo (no WebP asked)', img.status === 200 && /image\/(jpeg|png)/.test(img.headers.get('content-type')), [img.status, img.headers.get('content-type'), home.ogImage]);
    const article = await d.collection('articles').findOne({ published: true });
    if (article) check('a news article: og:type article', (await head(`/tin-tuc/${article._id}`)).ogType === 'article');
    for (const path of ['/dang-nhap', '/dang-ky', '/khong-co-trang-nay']) {
      const m = await head(path);
      check(`${path}: noindex, no description or preview tags`, m.noindex && !m.description && !m.ogTitle, m.h.slice(0, 300));
    }
  });

  await part(b, 'Chính sách bảo mật page (lib/privacy-policy.js)', async () => {
    const page = async (lang) => { const r = await fetch(BASE + '/chinh-sach-bao-mat', { headers: { cookie: `lang=${lang}` } }); return { status: r.status, text: await r.text() }; };
    const body = (html) => (html.match(/data-privacy-text>([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/) || [])[1] || '';
    const settings = await (await db()).collection('sitesettings').findOne({});
    const ownVi = settings && settings.privacyPolicy;
    for (const [lang, title, decree] of [['vi', 'Chính sách bảo mật', 'Nghị định 13/2023'], ['en', 'Privacy Policy', 'Decree 13/2023']]) {
      const p = await page(lang);
      const text = body(p.text);
      check(`${lang}: the page opens with its title "${title}"`, p.status === 200 && p.text.includes(`>${title}</h1>`) && p.text.includes(`<title>${title} - MTG</title>`), p.status);
      if (ownVi) continue; // the staff's own text: only the page itself is checked
      check(`${lang}: the default draft, 12 numbered sections shown as headings, under ${decree}`, (text.match(/<h2>\d{1,2}\. /g) || []).length === 12 && text.includes(decree), (text.match(/<h2>[^<]*/g) || []).slice(0, 3));
      check(`${lang}: says how long requests are kept (24 months, then deleted automatically) and where to download / delete in Hồ sơ`,
        lang === 'vi' ? text.includes('24 tháng kể từ lần cập nhật cuối') && text.includes('Tải dữ liệu của tôi') && text.includes('Xóa tài khoản')
          : text.includes('24 months from their last update') && text.includes('Download my data') && text.includes('Delete account'));
      check(`${lang}: the company address from Thông tin công ty is filled in, no blanks left`, (!settings.contactInfo.address || text.includes(settings.contactInfo.address)) && !/\$\{|undefined|\bnull\b/.test(text));
    }
    const home = await (await fetch(BASE + '/')).text();
    check('the footer links the page (after the © line)', /&copy;[\s\S]{0,200}<a class="footer-bottom-link" href="\/chinh-sach-bao-mat">Chính sách bảo mật<\/a>/.test(home));
  });

  await part(b, 'buttons and form fields use the site font (Safari showed Times)', async () => {
    const sameFont = (url) => ev(`(() => { const body = getComputedStyle(document.body).fontFamily;
      return [...document.querySelectorAll('button, input:not([type=hidden]), select, textarea')].filter((el) => getComputedStyle(el).fontFamily !== body)
        .map((el) => (el.className || el.tagName) + ': ' + getComputedStyle(el).fontFamily).slice(0, 5); })()`);
    for (const url of ['/dang-nhap', '/dang-ky', '/giai-phap/thiet-bi']) {
      await b.nav(url, 200);
      const odd = await sameFont(url);
      check(`${url}: every button and box in Be Vietnam Pro, like the page`, odd.length === 0, odd);
    }
    await b.login(user.sid);
    await b.nav('/', 200);
    check('logged in: the account button too', (await ev(`getComputedStyle(document.querySelector('.user-menu-trigger')).fontFamily === getComputedStyle(document.body).fontFamily`)));
    await b.clearCookie('connect.sid');
  });

  await part(b, 'header dropdowns', async () => {
    const nav = (p) => b.nav(p, 400);
    const viewport = (w, h = 900) => b.viewport(w, h);
    const waitLoad = () => b.waitLoad();
    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const center = (sel) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const moveTo = async (sel) => { const p = await center(sel); await mouse('mouseMoved', p.x, p.y); await sleep(120); return p; };
    const clickAt = async (p) => { await mouse('mousePressed', p.x, p.y, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', p.x, p.y, { button: 'left', buttons: 0, clickCount: 1 }); await sleep(150); };
    const away = async () => { await mouse('mouseMoved', 640, 700); await sleep(150); };
    const key = async (k) => { const code = k === 'Tab' ? 9 : 0; await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code }); await sleep(120); };
    // Menus fade in and out: wait for that to end, then a shown menu is visible with a real height
    const shown = (i) => ev(`(async () => { const d = document.querySelectorAll('.main-nav .nav-dropdown')[${i}]; const m = d.querySelector('.nav-dropdown-menu');
      await Promise.all(m.getAnimations().map((a) => a.finished.catch(() => {})));
      return { shown: getComputedStyle(m).visibility === 'visible' && +getComputedStyle(m).opacity === 1 && m.getBoundingClientRect().height > 0, aria: d.querySelector('.nav-dropdown-trigger').getAttribute('aria-expanded'), inline: m.getAttribute('style') }; })()`);
    const markIds = (i) => ev(`(() => { const d = document.querySelectorAll('.main-nav .nav-dropdown')[${i}]; d.querySelector('.nav-dropdown-trigger').id = 'zzTrig${i}'; d.querySelector('.nav-dropdown-menu a:last-child').id = 'zzLast${i}'; return true; })()`);

    await nav('/');
    const names = ['Robotics thông minh', 'Giải pháp', 'Dịch vụ'];
    for (let i = 0; i < 3; i++) {
      await markIds(i);
      await away();
      check(`${names[i]}: hidden before hovering`, !(await shown(i)).shown);
      const p = await moveTo(`#zzTrig${i}`);
      let s = await shown(i);
      check(`${names[i]}: hovering the item shows the dropdown (aria-expanded=true)`, s.shown && s.aria === 'true', s);
      // slide straight down into the menu, then onto its last link
      const last = await center(`#zzLast${i}`);
      for (let k = 1; k <= 6; k++) { await mouse('mouseMoved', p.x, p.y + (last.y - p.y) * k / 6); await sleep(25); }
      await mouse('mouseMoved', last.x, last.y); await sleep(120);
      check(`${names[i]}: moving into the dropdown keeps it open`, (await shown(i)).shown);
      await away();
      s = await shown(i);
      check(`${names[i]}: leaving item + dropdown hides it (aria-expanded=false)`, !s.shown && s.aria === 'false', s);
      // The title is a link to the group's landing page: a click opens it, and the menu is not left pinned there
      const landing = ['/san-pham', '/giai-phap', '/dich-vu'][i];
      { const l = waitLoad(); await moveTo(`#zzTrig${i}`); await clickAt(p); await l; await sleep(150); }
      check(`${names[i]}: clicking the title opens ${landing}`, (await ev('location.pathname')) === landing);
      await away();
      s = await shown(i);
      check(`${names[i]}: on the new page the menu is closed once the pointer is away`, !s.shown && !s.inline, s);
      await nav('/');
    }

    // Keyboard: Tab onto a group opens it, Tab through its links keeps it open, Tab past the last link closes it
    await nav('/'); await away();
    await ev(`document.querySelector('.main-nav > a[href="/"]').focus()`);
    await key('Tab');
    let k = await ev(`({ active: document.activeElement.textContent.trim(), fv: document.activeElement.matches(':focus-visible') })`);
    let s = await shown(0);
    check('keyboard: Tab onto "Robotics thông minh" opens its dropdown', /Robotics thông minh/.test(k.active) && k.fv && s.shown && s.aria === 'true', { k, s });
    for (let n = 0; n < 5; n++) await key('Tab');
    k = await ev(`({ active: document.activeElement.textContent.trim(), fv: document.activeElement.matches(':focus-visible') })`);
    s = await shown(1);
    const s0 = await shown(0);
    check('keyboard: Tab on to "Giải pháp" opens it and closes the previous one', /Giải pháp/.test(k.active) && k.fv && s.shown && s.aria === 'true' && !s0.shown && s0.aria === 'false', { k, s, s0 });
    for (let n = 0; n < 6; n++) await key('Tab');
    k = await ev(`document.activeElement.getAttribute('href')`);
    check('keyboard: Tab through all 6 links keeps it open', k === '/giai-phap/tap-huan' && (await shown(1)).shown, k);
    await key('Tab');
    s = await shown(1);
    check('keyboard: Tab past the last link closes it', !s.shown && s.aria === 'false', s);
    s = await shown(2);
    check('keyboard: …and opens the next one (Dịch vụ)', s.shown && s.aria === 'true', s);
    await key('Tab'); // into Dịch vụ's first link
    await b.key('Escape', 'Escape', 27); await sleep(150);
    s = await shown(2);
    k = await ev(`document.activeElement.textContent.trim()`);
    check('keyboard: Esc closes it and returns focus to "Dịch vụ"', !s.shown && s.aria === 'false' && /^Dịch vụ/.test(k), { s, k });
    await key('Tab');
    k = await ev(`document.activeElement.getAttribute('href')`);
    check('keyboard: Tab after Esc skips the closed menu and moves on to "Tin tức"', k === '/tin-tuc' && !(await shown(2)).shown, k);
    // A mouse click after keyboard use does not pin it
    await nav('/'); await away();
    await markIds(1);
    const pg = await moveTo('#zzTrig1');
    { const l = waitLoad(); await clickAt(pg); await l; await sleep(150); } await away();
    check('mouse click on a title after keyboard use: opens /giai-phap, menu not kept open', (await ev('location.pathname')) === '/giai-phap' && !(await shown(1)).shown);

    // Smooth: a menu fades and slides in while its ▾ turns; on leaving it waits a moment, then fades out. Also with reduced motion.
    const look = (sel, caret) => ev(`(() => { const m = document.querySelector('${sel}'); const c = document.querySelector('${caret}');
      return { vis: getComputedStyle(m).visibility, opacity: +(+getComputedStyle(m).opacity).toFixed(2), y: Math.round(new DOMMatrix(getComputedStyle(m).transform).m42), caret: Math.round(Math.atan2(new DOMMatrix(getComputedStyle(c).transform).b, new DOMMatrix(getComputedStyle(c).transform).a) * 180 / Math.PI) }; })()`);
    for (const motion of ['normal', 'reduced']) {
      await b.reducedMotion(motion === 'reduced');
      await nav('/'); await away(); await sleep(300); await markIds(1);
      const rest = await look('#zzTrig1 + .nav-dropdown-menu', '#zzTrig1 .nav-caret');
      const p = await center('#zzTrig1'); await mouse('mouseMoved', p.x, p.y); await sleep(motion === 'reduced' ? 25 : 50);
      const opening = await look('#zzTrig1 + .nav-dropdown-menu', '#zzTrig1 .nav-caret'); await sleep(400);
      const open = await look('#zzTrig1 + .nav-dropdown-menu', '#zzTrig1 .nav-caret');
      if (motion === 'normal') await b.shot('nav-menu-open');
      await mouse('mouseMoved', 640, 700); await sleep(motion === 'reduced' ? 15 : 40);
      const pause = await look('#zzTrig1 + .nav-dropdown-menu', '#zzTrig1 .nav-caret'); await sleep(motion === 'reduced' ? 60 : 130);
      const closing = await look('#zzTrig1 + .nav-dropdown-menu', '#zzTrig1 .nav-caret'); await sleep(500);
      const closed = await look('#zzTrig1 + .nav-dropdown-menu', '#zzTrig1 .nav-caret');
      check(`[${motion}] "Giải pháp" menu fades and slides in while ▾ turns; leaving waits a moment, then it fades out and is gone`,
        rest.vis === 'hidden' && rest.opacity === 0 && rest.caret === 0 && opening.vis === 'visible' && opening.opacity > 0 && opening.opacity < 1 && opening.y < 0
        && open.opacity === 1 && open.y === 0 && Math.abs(open.caret) === 180 && pause.opacity >= .95 && (motion === 'reduced' || (closing.vis === 'visible' && closing.opacity < 1)) && closed.vis === 'hidden' && closed.opacity === 0 && closed.caret === 0,
        { rest, opening, open, pause, closing, closed });
    }
    await b.reducedMotion(false);

    // Account menu (logged in)
    await b.login(user.sid);
    await nav('/'); await away();
    const um = () => ev(`(async () => { const m = document.querySelector('.user-menu-dropdown'); await Promise.all(m.getAnimations().map((a) => a.finished.catch(() => {}))); return getComputedStyle(m).visibility === 'visible' && +getComputedStyle(m).opacity === 1; })()`);
    check('account menu hidden at rest', !(await um()));
    const up = await moveTo('.user-menu-trigger');
    check('account menu: hover opens it', await um());
    await clickAt(up); await away();
    check('account menu: click + leave closes it (not pinned)', !(await um()));
    await moveTo('.user-menu-trigger');
    const theme0 = await ev(`document.documentElement.getAttribute('data-theme')`);
    // move down into the menu (through the bridge) and click the theme switch
    const tt = await center('.user-menu-dropdown .theme-toggle');
    for (let n = 1; n <= 6; n++) { await mouse('mouseMoved', up.x + (tt.x - up.x) * n / 6, up.y + (tt.y - up.y) * n / 6); await sleep(25); }
    await clickAt(tt); await sleep(300);
    const theme1 = await ev(`document.documentElement.getAttribute('data-theme')`);
    check('account menu: the theme switch inside still works while hovering', theme0 !== theme1 && (await um()), { theme0, theme1 });
    await clickAt(tt); await sleep(300); // switch back
    await away();
    check('account menu: closes when the pointer leaves', !(await um()));
    { const p = await center('.user-menu-trigger'); await away(); await sleep(300); await mouse('mouseMoved', p.x, p.y); await sleep(50); }
    const uOpening = await look('.user-menu-dropdown', '.user-menu-trigger .nav-caret'); await sleep(400);
    const uOpen = await look('.user-menu-dropdown', '.user-menu-trigger .nav-caret');
    const uTrigger = await ev(`getComputedStyle(document.querySelector('.user-menu-trigger')).backgroundColor`);
    await b.shot('account-menu-open');
    await away(); await sleep(500);
    const uClosed = await look('.user-menu-dropdown', '.user-menu-trigger .nav-caret');
    check('account menu fades and slides in (▾ turns, the name turns blue-tinted), then fades out',
      uOpening.opacity > 0 && uOpening.opacity < 1 && uOpen.opacity === 1 && Math.abs(uOpen.caret) === 180 && uClosed.vis === 'hidden' && uClosed.caret === 0 && uTrigger !== 'rgb(255, 255, 255)', { uOpening, uOpen, uClosed, uTrigger });
    await b.clearCookie('connect.sid');

    // Phone drawer
    await viewport(390, 844);
    await nav('/');
    await ev(`document.getElementById('navToggle').click()`); await sleep(400);
    const drawer = await ev(`({ menus: [...document.querySelectorAll('.main-nav .nav-dropdown-menu')].map((m) => getComputedStyle(m).visibility === 'visible' && +getComputedStyle(m).opacity === 1 && m.getBoundingClientRect().height > 0), titles: [...document.querySelectorAll('.nav-dropdown-trigger')].map((a) => a.getAttribute('href') + ':' + (a.getBoundingClientRect().height > 0)) })`);
    check('phone: the ☰ drawer lists all 3 submenus, with the titles as visible links', drawer.menus.length === 3 && drawer.menus.every(Boolean) && JSON.stringify(drawer.titles) === '["/san-pham:true","/giai-phap:true","/dich-vu:true"]', drawer);
    const drawerLook = () => ev(`(() => { const n = document.querySelector('.main-nav'); return { open: document.body.classList.contains('nav-open'), shown: getComputedStyle(n).display !== 'none', opacity: +(+getComputedStyle(n).opacity).toFixed(2) }; })()`);
    await ev(`document.getElementById('navToggle').click()`); await sleep(60);
    const dClosing = await drawerLook(); await sleep(500); const dGone = await drawerLook();
    await ev(`document.getElementById('navToggle').click()`); await sleep(60);
    const dOpening = await drawerLook(); await sleep(450); const dOpen = await drawerLook();
    check('phone: ☰ slides the drawer shut (then it is gone) and open again', dClosing.shown && dClosing.opacity < 1 && !dGone.open && !dGone.shown && dOpening.shown && dOpening.opacity < 1 && dOpen.opacity === 1, { dClosing, dGone, dOpening, dOpen });
    const tp = await center('.main-nav .nav-dropdown:nth-of-type(2) .nav-dropdown-trigger');
    { const l = waitLoad();
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tp.x, y: tp.y }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await l; await sleep(250); }
    check('phone: tapping a section title opens its landing page (/giai-phap)', (await ev('location.pathname')) === '/giai-phap');
    const l = waitLoad(); await ev(`document.querySelector('.main-nav a[href="/giai-phap/workshop"]').click()`); await l;
    check('phone: a submenu link opens its page', (await ev('location.pathname')) === '/giai-phap/workshop');
  });

  await part(b, 'logo always shown', async () => {
    // Logged out the header also holds the light/dark switch and "Đăng nhập" / "Đăng ký": the logo must still fit
    const fit = () => ev(`(() => { const h = document.querySelector('.site-header .header-inner'); const end = h.getBoundingClientRect().right - parseFloat(getComputedStyle(h).paddingRight);
      const shown = [...h.children].filter((c) => getComputedStyle(c).display !== 'none');
      return { logo: Math.round(document.querySelector('.site-header .logo-img, .site-header .logo-text').getBoundingClientRect().width), inside: shown.every((c) => c.getBoundingClientRect().right <= end + 1),
        menu: getComputedStyle(document.querySelector('.main-nav')).display !== 'none', drawer: getComputedStyle(document.getElementById('navToggle')).display !== 'none' }; })()`);
    const bad = [];
    for (const who of ['guest', 'user']) {
      if (who === 'user') await b.login(user.sid);
      for (const lang of ['vi', 'en']) {
        await b.setCookie('lang', lang);
        for (const w of [1440, 1280, 1241, 1240, 1101, 1100, 960, 640, 400, 390, 360, 340, 320]) {
          await b.viewport(w, 800); await b.nav('/', 150);
          const f = await fit();
          // the full menu needs 1241px when logged out (1101px logged in); below that it sits behind ☰
          const wide = w > (who === 'guest' ? 1240 : 1100);
          if (f.logo < 80 || !f.inside || f.menu !== wide || f.drawer === wide) bad.push({ who, lang, w, ...f });
        }
      }
    }
    check('the logo shows at full size at every width, logged in or out, in both languages; nothing spills out of the header', bad.length === 0, bad);

    // A long name in the account button: shortened with "…" instead of pushing the page wider (360 px Android phones)
    const LONG = 'ZZ Nguyễn Thị Phương Thảo – Trường THPT Chuyên Hà Nội - Amsterdam';
    const d = await db();
    await d.collection('users').updateOne({ _id: user.id }, { $set: { name: LONG } });
    try {
      await b.setCookie('lang', 'vi');
      const wide = [];
      for (const w of [320, 360, 390, 640, 1101, 1280]) {
        await b.viewport(w, 800); await b.nav('/', 150);
        const s = await ev(`(() => { const n = document.querySelector('.user-menu-name'); const t = document.querySelector('.user-menu-trigger');
          return { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, cut: n.scrollWidth > n.clientWidth + 1, title: t.title, right: Math.round(t.getBoundingClientRect().right) }; })()`);
        if (s.over > 1 || !s.cut || s.title !== LONG || s.right > w) wide.push({ w, ...s });
      }
      check('a long name ends in "…" at every width (full name in the tooltip); the page never gets wider than the screen', wide.length === 0, wide);
      await b.viewport(360, 800); await b.nav('/', 150);
      await b.hover('.user-menu-trigger'); await sleep(400);
      const open = await ev(`(() => { const m = document.querySelector('.user-menu-dropdown'); const r = m.getBoundingClientRect(); return { shown: getComputedStyle(m).visibility === 'visible' && r.height > 0, left: Math.round(r.left), right: Math.round(r.right) }; })()`);
      check('360 px: the account menu still opens, inside the screen', open.shown && open.left >= 0 && open.right <= 360, open);
    } finally {
      await d.collection('users').updateOne({ _id: user.id }, { $set: { name: 'ZZ nav' } });
    }
    await b.nav('/', 100);
    check('a short name is shown in full', !(await ev(`(() => { const n = document.querySelector('.user-menu-name'); return n.scrollWidth > n.clientWidth + 1; })()`)));
    await b.setCookie('lang', 'vi'); await b.clearCookie('connect.sid'); await b.viewport(1280, 900);
  });

  await part(b, 'theme switches', async () => {
    const nav = (p) => b.nav(p, 350);
    const themeNow = () => ev(`document.documentElement.getAttribute('data-theme')`);
    const cookieTheme = () => ev(`(document.cookie.match(/(?:^|; )theme=([^;]+)/) || [])[1] || null`);
    const click = async (selector) => {
      const p = await ev(`(() => { const el = document.querySelector('${selector}'); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!p) return false;
      await b.mouse('mouseMoved', p);
      await b.mouse('mousePressed', p, { button: 'left', clickCount: 1 });
      await b.mouse('mouseReleased', p, { button: 'left', clickCount: 1 });
      await sleep(400);
      return true;
    };
    const shot = async (name, width = 1280) => { if (width !== 1280) await b.viewport(width, 900); await sleep(200); await b.shot(name, true); if (width !== 1280) await b.viewport(1280, 900); };

    // ---- 1. Guest: default light, compact toggle in header ----
    await nav('/');
    check('guest: default theme is light', (await themeNow()) === 'light');
    check('guest: compact toggle next to VI|EN', await ev(`!!document.querySelector('.header-actions .lang-switch + .theme-toggle--compact[data-theme-toggle]')`));
    await click('.header-actions .theme-toggle');
    check('guest: click switches to dark without reload, cookie set', (await themeNow()) === 'dark' && (await cookieTheme()) === 'dark' && (await ev(`document.querySelector('.header-actions .theme-toggle').getAttribute('aria-checked')`)) === 'true');
    await nav('/lien-he');
    check('dark persists across pages (server renders it)', (await themeNow()) === 'dark');
    await click('.header-actions .theme-toggle');
    check('guest: click again -> light', (await themeNow()) === 'light');

    // ---- 2. Logged in: the switch is the first row of the account menu, above "Quản trị" ----
    await b.login(admin.sid);
    await nav('/');
    const order = await ev(`[...document.querySelector('.user-menu-dropdown').children].map(c => c.classList.contains('user-menu-theme') ? 'THEME' : (c.textContent || '').trim()).slice(0, 2)`);
    check('account menu: theme switch is the first row, above "Quản trị"', order[0] === 'THEME' && order[1] === 'Quản trị', order);
    check('logged-in: no extra header toggle', await ev(`!document.querySelector('.header-actions > .theme-toggle')`));
    await b.hover('.user-menu-trigger'); await sleep(200);
    await click('.user-menu-theme .theme-toggle');
    check('account menu switch -> dark', (await themeNow()) === 'dark');

    // ---- 3. Admin: compact switch right of VI|EN; shared preference ----
    await nav('/admin');
    check('admin opens in dark (shared with the website)', (await themeNow()) === 'dark');
    const pos = await ev(`(() => { const en = [...document.querySelectorAll('.admin-lang a')].pop().getBoundingClientRect(); const t = document.querySelector('.admin-lang .theme-toggle').getBoundingClientRect(); return { right: t.left >= en.right, sameRow: Math.abs((t.top + t.height / 2) - (en.top + en.height / 2)) < 6 }; })()`);
    check('admin: switch sits to the right of VI|EN, same row', pos.right && pos.sameRow, pos);
    await shot('theme-admin-dashboard-dark');
    await click('.admin-lang .theme-toggle');
    check('admin switch -> light', (await themeNow()) === 'light' && (await cookieTheme()) === 'light');
    await nav('/');
    check('website follows the admin choice (light)', (await themeNow()) === 'light');

    // ---- 4. Toast: green / red, auto-hide, close ----
    await nav('/admin/du-an/moi');
    { const l = b.waitLoad(); await ev(`document.querySelector('input[name=titleVi]').removeAttribute('required'); document.querySelector('form').submit()`); await l; await sleep(600); }
    let t = await ev(`(() => { const t = document.getElementById('adminToast'); const cs = getComputedStyle(t); return { visible: !t.hidden && t.classList.contains('is-visible'), bg: cs.backgroundColor, role: t.getAttribute('role'), icon: !!t.querySelector('.toast-icon svg'), text: t.querySelector('.toast-text').textContent }; })()`);
    check('red toast for a failed save (error colour, alert role, icon, message)', t.visible && t.bg === 'rgb(192, 57, 43)' && t.role === 'alert' && t.icon && /bắt buộc/.test(t.text), t);
    await click('#adminToast .toast-close');
    await b.mouse('mouseMoved', { x: 5, y: 450 }); // off the notification, so the next one isn't held by the pointer
    await sleep(900);
    check('close button hides the toast (after sliding out)', await ev(`document.getElementById('adminToast').hidden`));
    // green toast after saving the services order with the keyboard
    await nav('/admin/dich-vu');
    await ev(`document.querySelector('tbody[data-sortable] .drag-handle').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await sleep(700);
    t = await ev(`(() => { const t = document.getElementById('adminToast'); return { visible: !t.hidden, bg: getComputedStyle(t).backgroundColor, text: t.querySelector('.toast-text').textContent }; })()`);
    check('green toast after saving (success colour)', t.visible && t.bg === 'rgb(30, 126, 52)', t);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 }); // put it back
    await sleep(5000);
    check('green toast hides by itself after ~4s', await ev(`document.getElementById('adminToast').hidden || !document.getElementById('adminToast').classList.contains('is-visible')`));

    // ---- 4b. The notification slides in from the right and back out off the screen (also with reduced motion) ----
    await b.reducedMotion(true);
    await nav('/admin/dich-vu');
    const tb = () => ev(`(() => { const t = document.getElementById('adminToast'); const r = t.getBoundingClientRect(); return { hidden: t.hidden, visible: t.classList.contains('is-visible'), left: Math.round(r.left), top: Math.round(r.top), dur: parseFloat(getComputedStyle(t).transitionDuration) }; })()`);
    const arrow = (key, code) => send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code });
    const firstShown = async () => { for (let i = 0; i < 100; i++) { const x = await tb(); if (!x.hidden) return x; await sleep(15); } return null; };
    await ev(`document.querySelector('tbody[data-sortable] .drag-handle').focus()`);
    await arrow('ArrowDown', 40);
    const arriving = await firstShown();
    await sleep(700);
    const settled = await tb();
    check('a notification slides in from the right (starts further right, then settles)', !!arriving && settled.visible && arriving.left > settled.left + 10, { arriving, settled });
    check('… with reduced motion the slide still takes a visible while (≥ 0.29 s)', settled.dur >= 0.29, settled.dur);
    await b.hover('#adminToast .toast-text');
    await sleep(4600);
    check('while the pointer is on it, it stays', (await tb()).visible);
    await b.shot('admin-toast-held');
    await click('#adminToast .toast-close'); // (click waits 400 ms)
    await b.mouse('mouseMoved', { x: 5, y: 450 });
    let gone = await tb();
    check('× slides it out to the right (still in the page, already moved)', !gone.visible && (gone.hidden || gone.left > settled.left + 20), { gone, settled });
    await sleep(700);
    check('… then it is hidden', (await tb()).hidden);
    // Phone: it sits at the bottom and slides down off the screen
    await b.viewport(390, 844); await sleep(200);
    await ev(`document.querySelector('tbody[data-sortable] .drag-handle').focus()`);
    await arrow('ArrowDown', 40); // the first row down again: puts the order back
    await firstShown(); await sleep(600);
    const phoneAt = await tb();
    await ev(`document.querySelector('#adminToast .toast-close').click()`); await sleep(260); // it starts slowly, then speeds away
    const phoneOut = await tb();
    check('phone: the notification slides down, off the bottom', phoneAt.visible && !phoneOut.visible && phoneOut.top > phoneAt.top + 10, { phoneAt, phoneOut });
    await b.shot('admin-toast-phone-leaving');
    await sleep(700);
    await b.viewport(1280, 900); await send('Emulation.setEmulatedMedia', { features: [] });

    // ---- 5. Dark-mode contrast on key text ----
    await b.setCookie('theme', 'dark');
    const contrastScript = `(() => {
      const lum = (c) => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const parse = (s) => (s.match(/[\\d.]+/g) || []).map(Number);
      const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > 0.5)) return c.slice(0, 3); } return [255, 255, 255]; };
      const out = [];
      for (const sel of SELECTORS) {
        const el = document.querySelector(sel); if (!el || !el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
        const fg = parse(getComputedStyle(el).color).slice(0, 3), bg = bgOf(el);
        const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        out.push({ sel, ratio: Math.round(ratio * 10) / 10 });
      }
      return out;
    })()`;
    const pages = {
      '/': ['.main-nav > a', '.home-hero h1', '.section-title', '.pillar-card h3', '.pillar-card p', '.card-body h3', '.card-body p', '.footer-col a', '.footer-brand .footer-about', '.lang-switch a'],
      '/lien-he': ['.form-group label', '.form-control', '.contact-hint', '.page-hero h1'],
      '/admin': ['.admin-nav a', '.admin-nav a.active', '.kpi-label', '.kpi-value', '.kpi-sub', '.panel-head h2', '.panel-head p', '.legend-label', '.hbar-label', '.latest-main strong', '.latest-main span', '.mini-label', '.tag'],
      '/admin/robot': ['.data-table th', '.data-table td', '.admin-hint span', '.btn-ghost', '.tag'],
      '/admin/nguoi-dung': ['.tag.role-owner', '.tag.role-admin', '.btn-danger-ghost', '.data-table td'],
    };
    let worst = 99;
    const bad = [];
    for (const [p, sels] of Object.entries(pages)) {
      await nav(p);
      const res = await ev(contrastScript.replace('SELECTORS', JSON.stringify(sels)));
      for (const r of res) { worst = Math.min(worst, r.ratio); if (r.ratio < 4.5) bad.push(`${p} ${r.sel}: ${r.ratio}`); }
    }
    check(`dark mode: all checked text >= 4.5:1 contrast (worst ${worst}:1)`, bad.length === 0, bad);
    // Small labels the accessibility scan flagged: "Hoàn tất" tag, the count in a selected chip / tab, the selected tab's name (both themes)
    const small = {
      '/admin': ['.tag.status-hoan_tat'],
      '/admin/yeu-cau': ['.filter-chip.is-active .filter-chip-count', '.tag.status-hoan_tat'],
      '/admin/nguoi-dung': ['.filter-chip.is-active .filter-chip-count'],
      '/giai-phap/thiet-bi': ['.equip-tab[aria-selected="true"] .equip-tab-name', '.equip-tab[aria-selected="true"] .equip-tab-count'],
    };
    const smallBad = []; let smallSeen = 0;
    for (const theme of ['light', 'dark']) {
      await b.setCookie('theme', theme);
      for (const [p, sels] of Object.entries(small)) {
        await nav(p);
        for (const r of await ev(contrastScript.replace('SELECTORS', JSON.stringify(sels)))) { smallSeen++; if (r.ratio < 4.5) smallBad.push(`${theme} ${p} ${r.sel}: ${r.ratio}`); }
      }
    }
    check(`"Hoàn tất" tag, selected chip/tab counts and tab name >= 4.5:1 in light and dark (${smallSeen} checked)`, smallSeen >= 8 && smallBad.length === 0, smallBad);
    // "Chưa có tài khoản? Đăng ký": the link is underlined, so it doesn't rely on colour (dark mode: same brightness as the text)
    await nav('/');
    const under = await ev(`(() => { const box = document.createElement('div'); box.innerHTML = '<p class="auth-switch">x <a href="#">a</a></p><p class="login-needed-alt">x <a href="#">b</a></p>'; document.querySelector('main').appendChild(box);
      const r = [...box.querySelectorAll('a')].map((a) => getComputedStyle(a).textDecorationLine); box.remove(); return r; })()`);
    check('dark mode: "Đăng ký" / "Đăng nhập" links in the login lines are underlined', under.length === 2 && under.every((d) => d.includes('underline')), under);
    await b.setCookie('theme', 'dark');
    for (const [p, name, w] of [['/', 'theme-home-dark', 1280], ['/admin/robot', 'theme-admin-list-dark', 1280], ['/', 'theme-home-dark-mobile', 390]]) {
      await nav(p);
      await shot(name, w);
    }
  });

  await part(b, 'VI / EN switch keeps the reading position', async () => {
    const nav = (p) => b.nav(p, 500);
    // The heading nearest to the top of the screen, and where it sits
    const spot = () => ev(`(() => { const line = document.querySelector('.site-header').getBoundingClientRect().bottom;
      const h = [...document.querySelectorAll('main h2, main h3')].find((x) => x.getBoundingClientRect().top >= line);
      return { lang: document.documentElement.lang, text: h && h.textContent.trim(), top: h && Math.round(h.getBoundingClientRect().top), y: Math.round(scrollY), path: location.pathname }; })()`);
    const switchTo = async (lang) => { const l = b.waitLoad(); await ev(`document.querySelector('.lang-switch a[href*="lang=${lang}"]').click()`); await l; await sleep(700); };
    for (const [path, heading] of [['/giai-phap/stem-lab', 'h2'], ['/giai-phap/workshop', 'h2']]) {
      await nav(path + '?lang=vi');
      await ev(`(() => { const h = [...document.querySelectorAll('main ${heading}')]; h[Math.floor(h.length / 2)].scrollIntoView(); window.scrollBy(0, -150); return true; })()`); await sleep(400);
      const vi = await spot();
      await switchTo('en');
      const en = await spot();
      check(`${path}: VI → EN stays on the same part of the page (not back at the top)`, en.lang === 'en' && en.y > 300 && Math.abs(en.top - vi.top) <= 60 && en.path === path, { vi, en });
      await switchTo('vi');
      const back = await spot();
      check(`${path}: EN → VI comes back to the same heading`, back.lang === 'vi' && back.text === vi.text && Math.abs(back.top - vi.top) <= 60, { vi, back });
    }
    // At the top of a page it stays at the top
    await nav('/giai-phap/tap-huan?lang=vi');
    await switchTo('en');
    check('switching at the top of a page stays at the top', (await spot()).y === 0);
    await switchTo('vi');
  });

  await part(b, 'smooth switches: light ↔ dark and VI ↔ EN fade', async () => {
    const themeNow = () => ev(`document.documentElement.getAttribute('data-theme')`);
    const toggle = () => ev(`document.querySelector('.header-actions .theme-toggle').click()`);
    // The fade's own animations (the browser's view transition), read while it runs
    const fadeAnims = () => ev(`document.getAnimations().filter((a) => a.effect && (a.effect.pseudoElement || '').startsWith('::view-transition'))
      .map((a) => ({ p: a.effect.pseudoElement, d: Math.round(a.effect.getTiming().duration) }))`);

    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await b.nav('/', 400);
    const theme0 = await themeNow();
    const other = theme0 === 'dark' ? 'light' : 'dark';
    check('the browser fades between whole pages / states (view transitions)', await ev(`typeof document.startViewTransition === 'function'`));
    await toggle(); await sleep(60);
    const during = await fadeAnims();
    check('light ↔ dark: the page cross-fades (≈ 0.35 s) instead of jumping', during.some((a) => a.p === '::view-transition-old(root)' && a.d === 350) && during.some((a) => a.p === '::view-transition-new(root)' && a.d === 350), during);
    await sleep(500);
    check('… then the new theme is set, the cookie and the switch follow, and the fade is over', (await themeNow()) === other && (await ev(`document.cookie.includes('theme=${other}')`))
      && (await ev(`!document.documentElement.classList.contains('theme-switching') && document.getAnimations().every((a) => !(a.effect && a.effect.pseudoElement))`)));
    await b.reducedMotion();
    await toggle(); await sleep(40);
    const reduced = await fadeAnims();
    check('"reduced motion": still a fade, just shorter (≈ 0.14 s)', reduced.some((a) => a.p === '::view-transition-old(root)' && a.d === 140), reduced);
    await sleep(400);
    check('… back to the first theme', (await themeNow()) === theme0);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    // A browser without view transitions: every colour eases for that one switch, then normal timings come back
    await ev(`document.startViewTransition = undefined`);
    await toggle(); await sleep(40);
    const fallback = await ev(`({ cls: document.documentElement.classList.contains('theme-fading'), body: getComputedStyle(document.body).transitionDuration, theme: document.documentElement.getAttribute('data-theme') })`);
    check('older browsers: a 0.3 s colour transition on every element, theme set at once', fallback.cls && fallback.body.split(',')[0].trim() === '0.3s' && fallback.theme === other, fallback);
    await sleep(600);
    check('… removed again afterwards (hover effects keep their own timing)', !(await ev(`document.documentElement.classList.contains('theme-fading')`)));
    await toggle(); await sleep(600);

    // VI ↔ EN: only the language switch fades; normal links stay plain page loads
    const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `addEventListener('pagereveal', (e) => { window.__faded = !!e.viewTransition; });` });
    try {
      await b.nav('/?lang=vi', 400);
      await b.nav('/ve-mtg', 400);
      check('a page opened by a normal link does not ask for a fade', (await ev(`window.__faded`)) === false && !(await ev(`[...document.querySelectorAll('style')].some((s) => s.textContent.includes('@view-transition'))`)));
      let l = b.waitLoad(); await ev(`document.querySelector('.lang-switch a[href*="lang=en"]').click()`); await l; await sleep(600);
      check('VI → EN: the old page fades into the English one', (await ev(`window.__faded`)) === true && (await ev('document.documentElement.lang')) === 'en');
      check('… which waits for its scripts before showing (the reading position is restored first)', await ev(`!!document.querySelector('link[rel="expect"][href="#page-end"][blocking="render"]') && !!document.getElementById('page-end')`));
      check('… and afterwards the header is back to normal (held still only during the fade)', await ev(`!document.documentElement.classList.contains('lang-fading') && getComputedStyle(document.querySelector('.site-header')).viewTransitionName === 'none'`));
      l = b.waitLoad(); await ev(`document.querySelector('a[href="/san-pham"]').click()`); await l; await sleep(400);
      const plain = await ev(`({ faded: window.__faded, path: location.pathname })`);
      check('a normal link from that page: no fade', plain.faded === false && plain.path === '/san-pham', plain);
      l = b.waitLoad(); await ev(`document.querySelector('.lang-switch a[href*="lang=vi"]').click()`); await l; await sleep(600);
      check('EN → VI fades too', (await ev(`window.__faded`)) === true && (await ev('document.documentElement.lang')) === 'vi');
      await ev('history.back()'); await sleep(900);
      l = b.waitLoad(); await ev(`document.querySelector('a[href="/"]').click()`); await l; await sleep(400);
      check('after the browser\'s Back, a normal link does not fade', (await ev(`window.__faded`)) === false);
    } finally {
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    }
  });
});
