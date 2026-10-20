// Giải pháp: menu, every page + picture/video loads, /giai-phap landing (+ admin banner override), STEM Lab page
// (jump menu, folds, compact cards, picture tabs, all facts kept), "Khám phá thêm" closing section,
// STEM equipment tabs + search, process trails.
import { suite, part, check, db, BASE, appRequire, createUser, restoreLater } from './lib/index.mjs';

const { bannerFor, BANNERS } = appRequire('./lib/banners.js');
const MENU = {
  vi: ['Tư vấn, thiết kế và triển khai phòng Lab STEM', 'Thiết bị, học liệu, Robot STEM', 'Workshop trải nghiệm STEM', 'Đào tạo STEM', 'Dự án tham khảo', 'Tập huấn & triển khai'],
  en: ['STEM Lab consulting, design & deployment', 'Equipment, learning materials & STEM robots', 'Hands-on STEM workshops', 'STEM training', 'Reference projects', 'Training & rollout'],
};
const HREFS = ['/giai-phap/stem-lab', '/giai-phap/thiet-bi', '/giai-phap/workshop', '/giai-phap/dao-tao', '/giai-phap/du-an', '/giai-phap/tap-huan'];
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#34;/g, '"');
const get = (p, lang = 'vi') => fetch(BASE + p, { headers: { cookie: `lang=${lang}` } });

await suite(async (b) => {
  const { send, ev, sleep, nav, shot } = b;
  const d = await db();
  const admin = await createUser('sol');
  await restoreLater('sitesettings', {}); // the banner override is saved through the admin, then cleared

  await part(b, 'menu, pages and assets', async () => {
    const vexItems = await d.collection('products').find({ category: 'stem-equipment', subcategory: /VEX/ }).toArray();
    for (const lang of ['vi', 'en']) {
      const html = await (await get('/', lang)).text();
      const menus = [...html.matchAll(/<div class="nav-dropdown-menu">([\s\S]*?)<\/div>/g)].map((m) => [...m[1].matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((a) => ({ href: a[1], text: decode(a[2].trim()) })));
      const solMenu = menus.find((m) => m.some((a) => a.href.startsWith('/giai-phap/')));
      check(`[${lang}] Giải pháp menu has exactly a→f in order`, JSON.stringify(solMenu.map((a) => a.text)) === JSON.stringify(MENU[lang]) && JSON.stringify(solMenu.map((a) => a.href)) === JSON.stringify(HREFS), solMenu);
      const trigger = [...html.matchAll(/class="nav-dropdown-trigger"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
      check(`[${lang}] top-level "${lang === 'vi' ? 'Robotics thông minh' : 'Smart Robotics'}" replaces "Sản phẩm/Products"`, trigger[0] === (lang === 'vi' ? 'Robotics thông minh' : 'Smart Robotics') && !trigger.includes('Sản phẩm') && !trigger.includes('Products'), trigger);
    }
    // Every page 200, every asset loads with the right type (both languages)
    const pages = [...HREFS, ...vexItems.map((v) => `/giai-phap/thiet-bi/${v._id}`), '/san-pham', '/'];
    const assetSeen = new Map();
    const hkHits = [];
    const notOk = [];
    for (const lang of ['vi', 'en']) {
      for (const p of pages) {
        const r = await get(p, lang);
        const html = await r.text();
        if (r.status !== 200) { notOk.push(`${lang} ${p} ${r.status}`); continue; }
        const urls = [...html.matchAll(/(?:<img[^>]+src|<source[^>]+src|poster)="([^"]+)"/g)].map((m) => m[1]).filter((u) => u.startsWith('/'));
        for (const u of urls) if (!assetSeen.has(u)) assetSeen.set(u, p);
        if (/HKD|2152 ?0727|ap-sales@/.test(html)) hkHits.push(`${lang} ${p}`);
      }
    }
    check(`all ${pages.length} pages × 2 languages return 200`, notOk.length === 0, notOk);
    const badAssets = [];
    for (const [u, from] of assetSeen) {
      const r = await fetch(BASE + u, { method: 'GET', headers: { range: 'bytes=0-0' } });
      const type = r.headers.get('content-type') || '';
      if (![200, 206].includes(r.status) || !/^(image|video)\//.test(type)) badAssets.push({ u, from, status: r.status, type });
    }
    check(`every <img>/<video>/poster URL on those pages loads (${assetSeen.size} assets)`, badAssets.length === 0, badAssets);
    check('no VEX Hong Kong phone/email/HKD text on any page', hkHits.length === 0, hkHits);
    // Catalog groups + VEX items
    const cat = await (await get('/giai-phap/thiet-bi')).text();
    const groupTitles = [...cat.matchAll(/<h2 class="equipment-group-title">([^<]+)</g)].map((m) => decode(m[1]));
    check('catalog grouped: Phần I, Phần II…, Phần III Robot STEM, Phần IV học liệu (in that order)', groupTitles.indexOf('Phần III: Robot STEM – VEX Robotics') > groupTitles.indexOf('Phần I: Thiết bị hạ tầng') && groupTitles.indexOf('Phần IV: Học liệu số & phát triển chuyên môn – VEX') === groupTitles.indexOf('Phần III: Robot STEM – VEX Robotics') + 1, groupTitles);
    const catEn = await (await get('/giai-phap/thiet-bi', 'en')).text();
    check('EN catalog shows English group titles', catEn.includes('Part III: STEM robots – VEX Robotics') && catEn.includes('Part I: Infrastructure equipment'));
    check('11 VEX items (overview + 10 lines), each with ≥1 image and VI+EN text', vexItems.length === 11 && vexItems.every((v) => v.images.length && v.descriptionVi.length > 100 && v.descriptionEn.length > 100), vexItems.map((v) => [v.nameEn, v.images.length]));
    const iq = vexItems.find((v) => /^VEX IQ/.test(v.nameEn));
    const iqHtml = await (await get(`/giai-phap/thiet-bi/${iq._id}`)).text();
    check('VEX IQ detail page: description list + extra image thumbnails', iqHtml.includes('<li>') && iqHtml.includes('detail-thumbs') && iqHtml.includes('VEXcode IQ'));

    // Browser: images decode, videos load metadata
    for (const theme of ['light', 'dark']) {
      await b.setCookie('theme', theme);
      for (const p of HREFS) {
        await nav(p, 300);
        const res = await ev(`(async () => {
          document.querySelectorAll('img[loading="lazy"]').forEach(i => i.loading = 'eager');
          const imgs = [...document.images];
          await Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 8000); })));
          const vids = [...document.querySelectorAll('video')];
          const vres = await Promise.all(vids.map(v => v.readyState >= 1 ? true : new Promise(r => { v.preload = 'metadata'; v.onloadedmetadata = () => r(true); v.onerror = () => r(false); v.load(); setTimeout(() => r(false), 10000); })));
          return { imgs: imgs.length, broken: imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute('src')), vids: vids.length, badVids: vres.filter(x => !x).length };
        })()`);
        check(`[${theme}] ${p}: ${res.imgs} images decode, ${res.vids} videos load`, res.broken.length === 0 && res.badVids === 0, res);
      }
    }
    await b.setCookie('theme', 'light');
    await b.viewport(390, 844);
    for (const p of HREFS) {
      await nav(p, 300);
      const ov = await ev('document.documentElement.scrollWidth - innerWidth');
      check(`390px ${p}: no horizontal page scroll`, ov <= 1, ov);
    }
    await nav('/', 300);
    const mob = await ev(`[...document.querySelectorAll('#mainNav .nav-dropdown')].map(d => [...d.querySelectorAll('.nav-dropdown-menu a')].map(a => a.textContent.trim())).find(x => x.some(t => t.startsWith('Tư vấn')))`);
    check('mobile nav: Giải pháp lists the same 6 items', JSON.stringify(mob) === JSON.stringify(MENU.vi), mob);
    await b.viewport(1280);
    await b.login(admin.sid);
    await nav('/admin/thiet-bi?q=vex%20iq', 300);
    const found = await ev(`[...document.querySelectorAll('tbody tr[data-id]')].filter(r => !r.hidden).map(r => r.querySelector('[data-search-name]').textContent.trim())`);
    check('admin Thiết bị STEM search "vex iq" finds the VEX IQ item', found.length >= 1 && found.every((n) => /VEX IQ/i.test(n)), found);
  });

  await part(b, '/giai-phap landing page', async () => {
    const settings = await d.collection('sitesettings').findOne({});
    const page = async (p, lang = 'vi') => (await get(p, lang)).text();
    const want = ['stem-lab', 'thiet-bi', 'workshop', 'dao-tao', 'du-an', 'tap-huan'];
    for (const lang of ['vi', 'en']) {
      const html = await page('/giai-phap', lang);
      const h1 = decode((html.match(/<h1>([^<]+)<\/h1>/) || [])[1] || '');
      const sub = decode((html.match(/<section class="page-hero[^"]*"[^>]*>[\s\S]*?<p>([^<]*)<\/p>/) || [])[1] || '');
      check(`[${lang}] /giai-phap: heading "${h1}", banner line = default`, h1 === (lang === 'en' ? 'Solutions' : 'Giải pháp') && sub === bannerFor(settings, 'solutions', lang).subtitle, { h1, sub });
      const cards = [...html.matchAll(/<a class="card" href="([^"]+)">[\s\S]*?<img src="([^"]+)"[\s\S]*?<h3>([^<]+)<\/h3>\s*(?:<p>([^<]*)<\/p>)?/g)].map((m) => ({ href: m[1], img: m[2], title: decode(m[3]), text: decode(m[4] || '') }));
      check(`[${lang}] 6 cards in menu order (a–f)`, JSON.stringify(cards.map((c) => c.href)) === JSON.stringify(want.map((k) => `/giai-phap/${k}`)), cards.map((c) => c.href));
      check(`[${lang}] each card's text = that page's banner line`, cards.every((c, i) => c.text === bannerFor(settings, want[i], lang).subtitle), cards.map((c) => c.text));
      if (lang === 'vi') {
        const st = await Promise.all(cards.map(async (c) => [(await fetch(BASE + c.href)).status, (await fetch(BASE + c.img)).headers.get('content-type')]));
        check('every card opens its page (200) and every picture is an image', st.every(([s, ct]) => s === 200 && /^image\//.test(ct)), st);
        check('card titles match the menu', JSON.stringify(cards.map((c) => c.title)) === JSON.stringify(MENU.vi), cards.map((c) => c.title));
      }
    }
    for (const p of ['/', '/dich-vu', '/giai-phap/workshop', '/lien-he']) {
      const html = await page(p);
      const foot = html.slice(html.lastIndexOf('<footer'));
      check(`footer Quick Links on ${p}: Giải pháp → /giai-phap`, /<a href="\/giai-phap">Giải pháp<\/a>/.test(foot) && !/href="\/giai-phap\/stem-lab">Giải pháp/.test(foot));
    }
    check('BANNERS has the "solutions" entry first in the Giải pháp group', BANNERS.filter((x) => x.group === 'solutions')[0].key === 'solutions' && BANNERS.length === 12);
    // Admin banner card + override round-trip
    await b.login(admin.sid);
    await nav('/admin/cai-dat?tab=banners', 500);
    const adminCard = await ev(`(() => { const g = [...document.querySelectorAll('.banner-group-title')].find((h) => h.textContent.trim() === 'Giải pháp'); const card = document.getElementById('banner-solutions');
      return { exists: !!card, view: card && card.querySelector('a[href="/giai-phap"]') ? true : false, placeholder: (document.getElementById('bannerVi_solutions') || {}).placeholder,
        firstInGroup: !!g && card && (g.nextElementSibling === card || (g.nextElementSibling && g.nextElementSibling.firstElementChild === card)), tabCount: (document.querySelector('[data-tab="banners"]') || {}).textContent }; })()`);
    check('Cài đặt chung → Banner các trang: "Giải pháp" card first in its group, default as placeholder, "Xem trang" → /giai-phap',
      adminCard.exists && adminCard.view && adminCard.firstInGroup && adminCard.placeholder === bannerFor(settings, 'solutions', 'vi').subtitle && /12/.test(adminCard.tabCount), adminCard);
    const saveForm = async () => { const l = b.waitLoad(); await ev(`document.querySelector('.page-form-actions button[type=submit], form button[type=submit].btn-primary').click()`); await l; await sleep(400); };
    const heroLine = async () => decode(((await page('/giai-phap')).match(/<section class="page-hero[^"]*"[^>]*>[\s\S]*?<p>([^<]*)<\/p>/) || [])[1] || '');
    await ev(`(() => { const el = document.getElementById('bannerVi_solutions'); el.value = 'ZZ Dòng giới thiệu giải pháp'; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await saveForm();
    const sub1 = await heroLine();
    check('an override saved in Cài đặt chung shows under the /giai-phap heading', sub1 === 'ZZ Dòng giới thiệu giải pháp', sub1);
    await nav('/admin/cai-dat?tab=banners', 500);
    await ev(`(() => { const el = document.getElementById('bannerVi_solutions'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await saveForm();
    const sub2 = await heroLine();
    check('clearing it brings the default line back', sub2 === bannerFor(settings, 'solutions', 'vi').subtitle, sub2);
  });

  await part(b, 'STEM Lab page', async () => {
    await nav('/giai-phap/stem-lab', 500);
    const jumps = await ev(`[...document.querySelectorAll('.page-jump-link')].map((a) => ({ href: a.getAttribute('href'), text: a.querySelector('.page-jump-text').textContent, num: a.querySelector('.page-jump-num').textContent }))`);
    check('jump menu: 6 numbered topics with their short names, after a "Trên trang này" label', JSON.stringify(jumps.map((j) => j.num + ' ' + j.text)) === JSON.stringify(['1 Vì sao cần Lab STEM', '2 Lab STEM là gì', '3 Quy mô & phân khu', '4 Mẫu thiết kế', '5 Lợi ích', '6 Triển khai'])
      && (await ev(`document.querySelector('.page-jump-label').textContent.trim()`)) === 'Trên trang này', jumps);
    const menuState = () => ev(`(() => { const n = document.querySelector('.page-jump'); const r = n.getBoundingClientRect(); return { shown: n.classList.contains('is-shown'), visible: getComputedStyle(n).visibility === 'visible', top: Math.round(r.top), header: Math.round(document.querySelector('.site-header').getBoundingClientRect().bottom), hidden: n.getAttribute('aria-hidden'), tab: n.querySelector('a').getAttribute('tabindex') }; })()`);
    let m = await menuState();
    check('top of the page: the jump menu is out of sight (and out of the keyboard order)', !m.shown && !m.visible && m.hidden === 'true' && m.tab === '-1', m);
    check('top of the page: the key numbers lead straight into "Vì sao cần phòng Lab STEM?" (no button row between)', await ev(`(() => { const s = [...document.querySelectorAll('main section.section')]; return s[0].querySelector('.stat-grid') && !s[0].querySelector('.section-cta') && /Vì sao cần phòng Lab STEM/.test(s[1].textContent); })()`));
    await ev(`window.scrollTo(0, document.querySelector('.page-hero').getBoundingClientRect().bottom + scrollY + 50)`); await sleep(500);
    m = await menuState();
    check('scrolled past the banner: the menu slides in, stuck under the header', m.shown && m.visible && m.top === m.header && m.hidden === null && m.tab === null, m);
    // Reading progress: topics above the current one are "read" (blue number), the current one is a solid pill, the bar fills
    const reading = () => ev(`(() => { const n = document.querySelector('.page-jump'); const links = [...n.querySelectorAll('.page-jump-link')]; const cur = n.querySelector('.is-current');
      return { read: +n.style.getPropertyValue('--read'), bar: Math.round(n.querySelector('.page-jump-progress > span').getBoundingClientRect().width), state: links.map((a) => a.classList.contains('is-current') ? 'C' : a.classList.contains('is-read') ? 'R' : '-').join(''),
        pill: cur && getComputedStyle(cur).backgroundColor, pillText: cur && getComputedStyle(cur).color, readNum: (n.querySelector('.is-read .page-jump-num') && getComputedStyle(n.querySelector('.is-read .page-jump-num')).backgroundColor) || null }; })()`);
    const early = await reading();
    await ev(`document.getElementById(${JSON.stringify(jumps[3].href.slice(1))}).scrollIntoView({ block: 'start', behavior: 'instant' })`); await sleep(500);
    const mid = await reading();
    check('reading progress: the topic being read is a solid blue pill with white text; the ones above it are marked read', mid.state === 'RRRC--' && mid.pill === 'rgb(21, 101, 192)' && mid.pillText === 'rgb(255, 255, 255)' && mid.readNum === 'rgb(21, 101, 192)', mid);
    check('reading progress: the bar along the menu grows as the page is read', early.read < mid.read && mid.read > 0.3 && mid.read < 0.95 && mid.bar > early.bar, { early, mid });
    await ev(`window.scrollTo(0, document.documentElement.scrollHeight)`); await sleep(500);
    const end = await reading();
    check('… and is full at the end of the page', end.read === 1 && end.state === 'RRRRRC', end);
    await ev(`document.getElementById(${JSON.stringify(jumps[3].href.slice(1))}).scrollIntoView({ block: 'start', behavior: 'instant' })`); await sleep(400);
    await shot('jump-menu-reading-1280');
    await ev(`window.scrollTo(0, 0)`); await sleep(500);
    m = await menuState();
    check('back at the top: the menu disappears again', !m.shown && !m.visible, m);
    await ev(`window.scrollTo(0, 700)`); await sleep(500);
    const stuck = [];
    for (const j of jumps) {
      await b.clickAt(`.page-jump-link[href="${j.href}"]`); await sleep(900);
      stuck.push(await ev(`(() => { const nav = document.querySelector('.page-jump').getBoundingClientRect(); const t = document.querySelector(${JSON.stringify(j.href)}).getBoundingClientRect(); const cur = document.querySelector('.page-jump-link.is-current');
        return { id: ${JSON.stringify(j.href)}, gap: Math.round(t.top - nav.bottom), navTop: Math.round(nav.top), current: cur && cur.getAttribute('href') }; })()`));
    }
    const header = await ev(`Math.round(document.querySelector('.site-header').getBoundingClientRect().height)`);
    check('each jump link brings its topic just under the sticky menu and marks it as current', stuck.every((s, i) => s.navTop === header && s.gap >= 0 && s.gap <= 30 && (s.current === s.id || i === stuck.length - 1)), { header, stuck });
    await ev('window.scrollTo(0, 0)'); await sleep(300);
    await shot('stemlab-top-1280');
    check('jump menu fits on one row at 1280px', await ev(`(() => { const u = document.querySelector('.page-jump-list'); return u.scrollWidth <= u.clientWidth; })()`));
    const fold = await ev(`(() => { const d = document.querySelector('.solution-fold'); return { n: document.querySelectorAll('.solution-fold').length, open: d.open, title: d.querySelector('summary').textContent.trim(), visibleCards: d.querySelector('.card').checkVisibility() }; })()`);
    check('legal basis is folded under its title', fold.n === 1 && !fold.open && fold.title === 'Các căn cứ và tiêu chuẩn khi xây dựng phòng Lab STEM' && fold.visibleCards === false, fold);
    await b.clickAt('.solution-fold summary'); await sleep(200);
    check('clicking the title opens it (both lists shown)', await ev(`document.querySelector('.solution-fold').open && document.querySelector('.solution-fold').textContent.includes('1002/QĐ-TTg') && document.querySelector('.solution-fold .card').getBoundingClientRect().height > 50`));
    // It slides shut and open again (part way after a moment); nothing of it shows while shut. Also with reduced motion.
    const foldBody = () => ev(`(() => { const d = document.querySelector('.solution-fold'); const body = d.querySelector('.solution-fold-body'); return { open: d.open, h: Math.round(body.getBoundingClientRect().height), full: body.scrollHeight, seen: body.checkVisibility() }; })()`);
    for (const motion of ['normal', 'reduced']) {
      if (motion === 'reduced') await b.reducedMotion();
      await sleep(450);
      const fOpen = await foldBody();
      await b.clickAt('.solution-fold summary'); await sleep(70);
      const fClosing = await foldBody(); await sleep(500); const fClosed = await foldBody();
      await b.clickAt('.solution-fold summary'); await sleep(70);
      const fOpening = await foldBody(); await sleep(500); const fOpened = await foldBody();
      if (motion === 'normal') await b.shot('stemlab-fold-open');
      check(`[${motion}] "Các căn cứ…" slides shut and open again, nothing showing while shut`, fOpen.h === fOpen.full && fClosing.open && fClosing.h > 0 && fClosing.h < fOpen.h
        && !fClosed.open && !fClosed.seen && fOpening.open && fOpening.h > 0 && fOpening.h < fOpened.h && fOpened.h === fOpened.full, { fOpen, fClosing, fClosed, fOpening, fOpened });
    }
    await b.reducedMotion(false);
    const compact = await ev(`[...document.querySelectorAll('.is-compact .card')].map((c) => ({ title: c.querySelector('h3').textContent, summary: c.querySelector('.card-text > p').textContent, more: !!c.querySelector('details.card-more'), open: c.querySelector('details.card-more').open, hiddenH: c.querySelector('details.card-more ul').checkVisibility() }))`);
    check('zone cards: a one-line summary each, details folded', compact.length === 4 && compact.every((c) => c.more && !c.open && c.hiddenH === false && c.summary.length < 90), compact);
    // "Xem chi tiết" slides open and closed (height grows from 0), also with "reduced motion" (only shorter)
    const moreSel = '.is-compact .card:nth-child(4) details.card-more';
    const slideState = () => ev(`(() => { const d = document.querySelector('${moreSel}'); const body = d.querySelector('.card-more-body');
      return { open: d.open, h: Math.round(body.getBoundingClientRect().height), full: body.scrollHeight, anims: body.getAnimations().length, clipped: body.classList.contains('is-animating') }; })()`);
    const slide = async () => { await b.clickAt(`${moreSel} summary`); await sleep(60); const mid = await slideState(); await sleep(600); return { mid, end: await slideState() }; };
    let so = await slide();
    check('"Xem chi tiết" slides open: part-way after a moment, then fully open', so.mid.open && so.mid.anims === 1 && so.mid.h > 0 && so.mid.h < so.mid.full && so.end.anims === 0 && !so.end.clipped && Math.abs(so.end.h - so.end.full) <= 1, so);
    const sc = await slide();
    check('… and slides closed again (still open part-way, closed at the end)', sc.mid.open && sc.mid.h > 0 && sc.mid.h < so.end.full && !sc.end.open, sc);
    await b.reducedMotion(); await nav('/giai-phap/stem-lab', 500);
    await ev(`document.querySelector('.is-compact').scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(200);
    so = await slide();
    check('reduced motion: the details still slide open (shorter), then fully open', so.mid.open && so.mid.h > 0 && so.mid.h < so.mid.full && Math.abs(so.end.h - so.end.full) <= 1, so);
    await b.reducedMotion(false);
    check('"Xem chi tiết" opens the full zone details', await ev(`(() => { const d = document.querySelector('${moreSel}'); return d.open && d.textContent.includes('phòng cháy chữa cháy') && d.querySelector('ul').getBoundingClientRect().height > 40; })()`));
    const tabs = await ev(`(() => { const w = document.querySelector('[data-media-tabs]'); return { tabs: [...w.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim()), shown: [...w.querySelectorAll('[role="tabpanel"]')].map((p) => !p.hidden), listShown: !w.querySelector('[role="tablist"]').hidden }; })()`);
    check('sample rooms: 4 tabs (Mầm non, Tiểu học, THCS, THPT), one picture at a time', JSON.stringify(tabs.tabs) === '["Mầm non","Tiểu học","THCS","THPT"]' && JSON.stringify(tabs.shown) === '[true,false,false,false]' && tabs.listShown, tabs);
    await b.clickAt('[data-media-tabs] [role="tab"]:nth-child(4)'); await sleep(200);
    const t4 = await ev(`(() => { const w = document.querySelector('[data-media-tabs]'); const p = [...w.querySelectorAll('[role="tabpanel"]')]; const x = p[3];
      return { shown: p.map((y) => !y.hidden), title: x.querySelector('.media-tabpanel-title').textContent, lead: x.querySelector('.media-tabpanel-lead').textContent,
        items: [...x.querySelectorAll('.media-tabpanel-list li')].map((li) => li.textContent), sel: w.querySelector('[aria-selected="true"]').textContent.trim() }; })()`);
    check('clicking "THPT" shows its plan with its description beside it (lead + list; "(in 3D, CNC, khắc laser)" stays one item)', JSON.stringify(t4.shown) === '[false,false,false,true]' && t4.sel === 'THPT' && t4.title === 'THPT'
      && t4.lead === 'Mẫu phòng THPT, 80–120 m²' && t4.items[0] === 'Hệ tủ trưng bày vừa kích thước tường' && t4.items.includes('Khu đặt máy (in 3D, CNC, khắc laser)') && t4.items.length === 5, t4);
    // Picture left, description right: tabs + picture + description fit a laptop screen (1280×720) at once
    const layout = () => ev(`(() => { const w = document.querySelector('[data-media-tabs]'); const p = [...w.querySelectorAll('[role="tabpanel"]')].find((x) => !x.hidden);
      const css = getComputedStyle(document.documentElement); const top = (parseFloat(css.getPropertyValue('--header-h')) || 0) + (parseFloat(css.getPropertyValue('--jump-h')) || 0);
      const list = w.querySelector('[role="tablist"]'); window.scrollBy(0, list.getBoundingClientRect().top - top - 8);
      const img = p.querySelector('.media-figure').getBoundingClientRect(); const txt = p.querySelector('.media-tabpanel-text').getBoundingClientRect();
      return { imgR: Math.round(img.right), imgB: Math.round(img.bottom), txtL: Math.round(txt.left), txtT: Math.round(txt.top), txtB: Math.round(txt.bottom), topGap: Math.round(Math.abs(img.top - txt.top)),
        tabsTop: Math.round(list.getBoundingClientRect().top), vh: innerHeight, caption: !!p.querySelector('figcaption'), alt: p.querySelector('img').alt,
        full: p.querySelector('.media-tabpanel-full') && p.querySelector('.media-tabpanel-full').getAttribute('data-full'), src: p.querySelector('img').getAttribute('src'), sideScroll: document.documentElement.scrollWidth > innerWidth }; })()`);
    const tabTo = async (k) => { await b.clickAt(`[data-media-tabs] [role="tab"]:nth-child(${k})`); await sleep(200); };
    await b.viewport(1280, 720); await sleep(300);
    for (const k of [1, 2, 3, 4]) {
      await tabTo(k);
      const L = await layout();
      check(`sample room ${k} at 1280×720: picture left, description right, top-aligned, all on screen`, L.imgR <= L.txtL && L.topGap <= 2 && L.tabsTop >= 0 && Math.max(L.imgB, L.txtB) <= L.vh && !L.caption && !L.sideScroll, L);
      if (k === 2) check('"Xem ảnh lớn" points to the full picture; the picture keeps its whole caption as its text', L.full === L.src && /^Tiểu học — Phòng Lab STEM Tiểu học/.test(L.alt), L);
    }
    const listSizes = await ev(`[...document.querySelectorAll('[data-media-tabs] [role="tabpanel"]')].map((p) => p.querySelectorAll('.media-tabpanel-list li').length)`);
    check('every sample room lists what is in it (Mầm non and THCS included)', listSizes.every((n) => n >= 5), listSizes);
    await tabTo(2); await layout(); await shot('stemlab-sample-layouts-1280x720');
    // "Xem ảnh lớn": a button that shows the picture full size in a pop-up on the page; "← Quay lại", Back, Esc or the dark area close it
    const fullBtn = '[data-media-tabs] [role="tabpanel"]:not([hidden]) .media-tabpanel-full';
    const btnInfo = await ev(`(() => { const a = document.querySelector('${fullBtn}'); const tab = document.querySelector('[data-media-tabs] [role="tab"]');
      return { tag: a.tagName, type: a.type, href: a.getAttribute('href'), btn: a.classList.contains('btn'), text: a.textContent.trim(), font: getComputedStyle(a).fontFamily, pageFont: getComputedStyle(document.body).fontFamily, h: Math.round(a.getBoundingClientRect().height),
        noscript: !!a.parentElement.querySelector('noscript') }; })()`);
    check('"Xem ảnh lớn" is a real button with no link address (nothing to preview on hover), in the site font; a <noscript> link stands in without JS',
      btnInfo.tag === 'BUTTON' && btnInfo.type === 'button' && btnInfo.href === null && btnInfo.btn && btnInfo.text === 'Xem ảnh lớn' && btnInfo.font === btnInfo.pageFont && btnInfo.h >= 34 && btnInfo.h <= 40 && btnInfo.noscript, btnInfo);
    // Hovering it adds nothing to the page and shows no address
    const bodyCount = await ev('document.body.querySelectorAll("*").length');
    await b.hover(fullBtn); await sleep(800);
    check('hovering "Xem ảnh lớn" shows no preview (nothing added to the page)', (await ev('document.body.querySelectorAll("*").length')) === bodyCount && !(await ev(`document.querySelector('${fullBtn}').closest('a')`)));
    const viewerState = () => ev(`(() => { const v = document.querySelector('.plan-zoom'); const pageImg = document.querySelector('[data-media-tabs] [role="tabpanel"]:not([hidden]) .media-frame img');
      const r = v && v.querySelector('.plan-zoom-img').getBoundingClientRect(); const pr = pageImg.getBoundingClientRect();
      const fitK = Math.min(pr.width / pageImg.naturalWidth, pr.height / pageImg.naturalHeight); // the page picture is drawn "contain" in its frame
      return { open: !!(v && v.open), src: v && v.querySelector('.plan-zoom-img').src, pageSrc: pageImg.currentSrc, title: v && v.querySelector('.plan-zoom-title').textContent,
        back: v && v.querySelector('.plan-zoom-back').textContent.trim(), w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0, pageW: Math.round(pageImg.naturalWidth * fitK), pageH: Math.round(pageImg.naturalHeight * fitK),
        inside: !!r && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1, url: location.pathname + location.search + location.hash, viewerStep: !!(history.state && history.state.planZoom),
        focusBtn: document.activeElement === document.querySelector('${fullBtn}'), focusBack: !!v && document.activeElement === v.querySelector('.plan-zoom-back'), locked: document.documentElement.classList.contains('has-plan-zoom'),
        box: v ? (() => { const q = v.getBoundingClientRect(); return { l: Math.round(q.left), t: Math.round(q.top), r: Math.round(innerWidth - q.right), b: Math.round(innerHeight - q.bottom), w: Math.round(q.width), h: Math.round(q.height),
          imgIn: !!r && r.left >= q.left && r.right <= q.right + 0.5 && r.top >= q.top && r.bottom <= q.bottom + 0.5 }; })() : null,
        shape: r && r.height ? +(r.width / r.height).toFixed(2) : 0,
        natShape: v && v.querySelector('.plan-zoom-img').naturalWidth ? +(v.querySelector('.plan-zoom-img').naturalWidth / v.querySelector('.plan-zoom-img').naturalHeight).toFixed(2) : 0,
        loading: !!v && !v.querySelector('.plan-zoom-note').hidden, note: v ? v.querySelector('.plan-zoom-note').textContent : '' }; })()`);
    const openViewer = async () => { await b.clickAt(fullBtn); await sleep(400); return viewerState(); };
    const urlBefore = await ev(`location.pathname + location.search + location.hash`);
    let v = await openViewer();
    check('pop-up opens on the page with that room\'s picture, its name and "← Quay lại"; bigger than on the page and fully on screen (1280×720)',
      v.open && v.src === v.pageSrc && v.title === 'Tiểu học' && v.back === '← Quay lại' && v.w > v.pageW && v.h > v.pageH && v.inside && v.url === urlBefore && v.viewerStep && v.focusBack && v.locked, v);
    check('it is a centred box, not full screen; the picture sits inside it with its own shape and the loading text gone',
      v.box.l > 20 && v.box.t > 10 && Math.abs(v.box.l - v.box.r) <= 2 && Math.abs(v.box.t - v.box.b) <= 2 && v.box.imgIn && Math.abs(v.shape - v.natShape) <= 0.02 && !v.loading, v);
    await shot('stemlab-image-viewer-1280x720');
    const scrollBefore = await ev('scrollY');
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY: 600 }); await sleep(300);
    check('the page behind does not scroll while the pop-up is open', (await ev('scrollY')) === scrollBefore);
    await b.clickAt('.plan-zoom-back'); await sleep(400);
    v = await viewerState();
    check('"← Quay lại" closes it: same page, history step taken out, focus back on the button', !v.open && v.url === urlBefore && !v.viewerStep && v.focusBtn && !v.locked, v);
    v = await openViewer();
    await ev('history.back()'); await sleep(500);
    v = await viewerState();
    check('the browser\'s Back button closes the pop-up and stays on the page', !v.open && v.url === urlBefore && !v.viewerStep, v);
    v = await openViewer();
    await b.key('Escape', 'Escape', 27); await sleep(400);
    v = await viewerState();
    check('Esc closes it (history step taken out)', !v.open && v.url === urlBefore && !v.viewerStep, v);
    v = await openViewer();
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 6, y: 700, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 6, y: 700, button: 'left', buttons: 0, clickCount: 1 }); await sleep(400);
    v = await viewerState();
    check('a click on the dark area closes it', !v.open && !v.viewerStep, v);
    // A picture that can't be loaded: the box says so (with a link) instead of staying empty
    const realHref = await ev(`document.querySelector('${fullBtn}').getAttribute('data-full')`);
    const setPlan = (src) => ev(`(async () => { const a = document.querySelector('${fullBtn}'); const im = a.closest('.media-tabpanel').querySelector('.media-frame img');
      a.setAttribute('data-full', ${JSON.stringify(src)}); im.src = ${JSON.stringify(src)};
      await new Promise((r) => { if (im.complete) r(); else { im.onload = im.onerror = r; } }); return true; })()`);
    await setPlan('/assets/zz-missing-plan.jpg');
    await openViewer(); await sleep(300); v = await viewerState();
    check('a picture that cannot be loaded shows "Không tải được ảnh." with an "Mở ảnh" link', v.open && v.loading && v.note.trim() === 'Không tải được ảnh. Mở ảnh' && v.box.w > 200, v);
    await b.clickAt('.plan-zoom-back'); await sleep(400);
    await setPlan(realHref);
    await b.reducedMotion();
    v = await openViewer();
    const rmOpen = v.open && v.inside && v.w > v.pageW && !v.loading;
    await b.clickAt('.plan-zoom-back'); await sleep(400);
    v = await viewerState();
    check('reduced motion: the pop-up still opens and "← Quay lại" closes it', rmOpen && !v.open && !v.viewerStep, v);
    await b.reducedMotion(false);
    await b.viewport(390, 844); await sleep(300);
    const P = await layout();
    check('phone: the description goes under the picture, no sideways scroll', P.txtT >= P.imgB && !P.sideScroll, P);
    await shot('stemlab-sample-layouts-390');
    v = await openViewer();
    check('phone: the pop-up box and its picture fit the screen', v.open && v.inside && v.w > 280 && v.box.l >= 0 && v.box.r >= 0 && v.box.imgIn, v);
    await b.clickAt('.plan-zoom-back'); await sleep(400);
    await b.viewport(1280, 900); await sleep(300);
    // The owner's path: another page first, then STEM Lab in the same tab. The "← Quay lại" page links then point at the
    // previous page; the "Xem ảnh lớn" buttons must keep pointing at their pictures (they once became "/")
    await nav('/'); await nav('/giai-phap/stem-lab', 500);
    const hrefs = await ev(`[...document.querySelectorAll('.media-tabpanel-full')].map((a) => a.getAttribute('data-full'))`);
    check('coming from Trang chủ: every "Xem ảnh lớn" still points at its floor plan', hrefs.length === 4 && hrefs.every((h) => /\/mau-[a-z0-9-]+\.jpg$/.test(h)), hrefs);
    const asked = [];
    b.on('Network.requestWillBeSent', (q) => { if (/\/mau-[a-z0-9-]+\.jpg/.test(q.request.url)) asked.push(q.request.url); });
    const rooms = [];
    for (const k of [1, 2, 3, 4]) {
      await tabTo(k); await sleep(300);
      asked.length = 0;
      v = await openViewer();
      rooms.push({ k, open: v.open, same: v.src === v.pageSrc, w: v.w, loading: v.loading, failed: await ev(`document.querySelector('.plan-zoom').classList.contains('is-failed')`), downloads: asked.length });
      await b.clickAt('.plan-zoom-back'); await sleep(400);
    }
    check('… and each room\'s box shows its picture, taken from the page (no new download)', rooms.every((r) => r.open && r.same && r.w > 300 && !r.loading && !r.failed && r.downloads === 0), rooms);
    const names = await ev(`[document.querySelector('.plan-zoom'), ...document.querySelectorAll('.plan-zoom *')].map((e) => (e.className || '') + ' ' + e.id + ' ' + (e.getAttribute('aria-labelledby') || '')).join(' ') + ' ' + document.documentElement.className`);
    check('no names in the box that blocker add-ons hide (popup, modal, overlay, lightbox)', !/popup|modal|overlay|lightbox/i.test(names), names);
    // A blocker add-on that hides the box anyway: the picture opens in the tab itself, and Back returns to the page
    await tabTo(2);
    await ev(`(() => { const st = document.createElement('style'); st.textContent = '.plan-zoom { display: none !important; }'; document.head.appendChild(st); })()`);
    { const l = b.waitLoad(); await b.clickAt(fullBtn); await l; await sleep(300); }
    const inTab = await ev(`({ path: location.pathname, type: document.contentType })`);
    check('if an add-on hides the box, the picture opens in the tab instead', inTab.path === '/assets/giai-phap/tu-van-thiet-ke/mau-tieu-hoc-50m2.jpg' && /^image\//.test(inTab.type), inTab);
    await ev('history.back()'); await sleep(1200);
    check('… and Back returns to the STEM Lab page', (await ev('location.pathname')) === '/giai-phap/stem-lab');
    await nav('/giai-phap/stem-lab', 500);
    await tabTo(4);
    await b.key('ArrowRight', 'ArrowRight', 39); await sleep(150);
    check('arrow keys move between tabs', await ev(`document.activeElement.textContent.trim() === 'Mầm non' && document.activeElement.getAttribute('aria-selected') === 'true'`));
    // Switching level: the picture and its description fade in (the description a moment after the picture)
    const levelLook = () => ev(`(() => { const p = [...document.querySelectorAll('.media-tabpanel')].find((x) => !x.hidden); return { tab: document.querySelector('.media-tab[aria-selected=true]').textContent.trim(), pic: +getComputedStyle(p.children[0]).opacity, text: +getComputedStyle(p.children[1]).opacity }; })()`);
    await ev(`[...document.querySelectorAll('.media-tab')].find((t) => t.textContent.trim() === 'THCS').click()`); await sleep(40);
    const lvMid = await levelLook(); await sleep(500); const lvEnd = await levelLook();
    check('switching level (THCS): picture and description fade in, the description just after', lvMid.tab === 'THCS' && lvMid.pic < 1 && lvMid.text <= lvMid.pic && lvEnd.pic === 1 && lvEnd.text === 1, { lvMid, lvEnd });
    // "Thiết kế 3D": a picture grid ('zoom' display) whose pictures react to the mouse and open larger in the same box
    const zoomSel = (n) => `.media-figure.is-zoomable:nth-child(${n})`;
    const zoomList = await ev(`[...document.querySelectorAll('.media-zoom')].map((z) => ({ tag: z.tagName, href: z.getAttribute('href'), full: z.getAttribute('data-full'), src: z.querySelector('img').getAttribute('src'),
      label: z.getAttribute('aria-label'), grid: !!z.closest('.media-grid') }))`);
    check('Thiết kế 3D: 6 pictures, each a button (no link address) that opens its own picture',
      zoomList.length === 6 && zoomList.every((z) => z.tag === 'BUTTON' && z.href === null && z.full === z.src && /\/3d-[a-z-]+\.jpg$/.test(z.src) && /^Xem ảnh lớn: /.test(z.label) && z.grid), zoomList);
    const zoomLook = (n) => ev(`(() => { const f = document.querySelector('${zoomSel(n)}'); const im = f.querySelector('img'); const badge = f.querySelector('.media-zoom-badge');
      return { lift: Math.round(new DOMMatrix(getComputedStyle(f).transform).m42), scale: +new DOMMatrix(getComputedStyle(im).transform).a.toFixed(3), badge: +getComputedStyle(badge).opacity,
        cursor: getComputedStyle(f.querySelector('.media-zoom')).cursor, border: getComputedStyle(f).borderTopColor, count: document.body.querySelectorAll('*').length }; })()`);
    await b.point(zoomSel(2)); await b.mouse('mouseMoved', { x: 2, y: 2 }); await sleep(500);
    const calm = await zoomLook(2);
    await b.hover(`${zoomSel(2)} .media-zoom`); await sleep(600);
    let hov = await zoomLook(2);
    check('hovering a 3D picture: the card lifts, the picture grows a little, an expand badge shows, the cursor is a magnifier; nothing else is added',
      calm.lift === 0 && calm.scale === 1 && calm.badge === 0 && hov.lift === -4 && hov.scale === 1.05 && hov.badge === 1 && hov.cursor === 'zoom-in' && hov.border !== calm.border && hov.count === calm.count, { calm, hov });
    await shot('stemlab-3d-hover-1280');
    await b.mouse('mouseMoved', { x: 2, y: 2 }); await sleep(600);
    const left = await zoomLook(2);
    check('… and it settles back when the mouse leaves', left.lift === 0 && left.scale === 1 && left.badge === 0, left);
    await b.reducedMotion(); await sleep(100);
    await b.hover(`${zoomSel(3)} .media-zoom`); await sleep(400);
    hov = await zoomLook(3);
    check('reduced motion: the same hover look (just quicker)', hov.lift === -4 && hov.scale === 1.05 && hov.badge === 1, hov);
    await b.reducedMotion(false); await b.mouse('mouseMoved', { x: 2, y: 2 }); await sleep(500);
    const shots3d = [];
    b.on('Network.requestWillBeSent', (q) => { if (/\/3d-[a-z-]+\.jpg/.test(q.request.url)) shots3d.push(q.request.url); });
    const zoomState = () => ev(`(() => { const v = document.querySelector('.plan-zoom'); const i = v && v.querySelector('.plan-zoom-img'); const r = i && i.getBoundingClientRect();
      const g = document.querySelector('${zoomSel(2)} img').getBoundingClientRect();
      return { open: !!(v && v.open), src: i && i.src, pageSrc: document.querySelector('${zoomSel(2)} img').currentSrc, title: v && v.querySelector('.plan-zoom-title').textContent,
        caption: document.querySelector('${zoomSel(2)} figcaption').textContent, w: r ? Math.round(r.width) : 0, gridW: Math.round(g.width), nat: i ? i.naturalWidth : 0,
        inside: !!r && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1, loading: !!v && !v.querySelector('.plan-zoom-note').hidden,
        focus: document.activeElement === document.querySelector('${zoomSel(2)} .media-zoom') }; })()`);
    shots3d.length = 0;
    await b.clickAt(`${zoomSel(2)} .media-zoom`); await sleep(500);
    let zs = await zoomState();
    check('clicking a 3D picture opens it larger in the box: same picture, its caption as the title, whole picture on screen, no new download',
      zs.open && zs.src === zs.pageSrc && zs.title === zs.caption && zs.title === 'Góc nhìn hướng tới hệ tủ robot' && zs.nat > 0 && zs.w > zs.gridW && zs.inside && !zs.loading && shots3d.length === 0, { ...zs, downloads: shots3d.length });
    await b.clickAt('.plan-zoom-back'); await sleep(450);
    zs = await zoomState();
    check('"← Quay lại" closes it and the picture has the focus again', !zs.open && zs.focus && (await ev('location.pathname')) === '/giai-phap/stem-lab', zs);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: String.fromCharCode(13) }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(500);
    zs = await zoomState();
    const kbOpen = zs.open && zs.title === 'Góc nhìn hướng tới hệ tủ robot';
    await b.key('Escape', 'Escape', 27); await sleep(450);
    zs = await zoomState();
    check('keyboard: Enter on a picture opens it, Esc closes it', kbOpen && !zs.open && zs.focus, zs);
    check('other picture galleries are not clickable pictures (only the 3D one)', (await ev(`document.querySelectorAll('.media-figure.is-zoomable').length`)) === 6);
    await b.viewport(390, 844); await sleep(300);
    const phoneBadge = await ev(`matchMedia('(hover: none)').matches ? +getComputedStyle(document.querySelector('${zoomSel(1)} .media-zoom-badge')).opacity : 'hover device'`);
    await b.clickAt(`${zoomSel(1)} .media-zoom`); await sleep(500);
    const phoneBox = await ev(`(() => { const r = document.querySelector('.plan-zoom-img').getBoundingClientRect(); return { open: document.querySelector('.plan-zoom').open, w: Math.round(r.width), inside: r.left >= 0 && r.right <= innerWidth + 1 }; })()`);
    check('phone: a tap opens the picture in a box that fits the screen', phoneBox.open && phoneBox.inside && phoneBox.w > 280, { phoneBox, phoneBadge });
    await b.clickAt('.plan-zoom-back'); await sleep(450);
    await b.viewport(1280, 900); await sleep(300);
    const facts = await ev(`document.body.textContent.replace(/\\s+/g, ' ')`);
    const TERMS = ['57-NQ/TW', '71-NQ/TW', '3089/BGDĐT-GDTrH', '909/BGDĐT-GDTH', '1002/QĐ-TTg', 'Thông tư 36, 37, 38, 39 và 14/2020/TT-BGDĐT', 'NGSS', 'ISTE', 'CSTA', 'CCSS Math', 'Fab Lab',
      '40 m² – 60 m² – 80 m² – 120 m²', 'người sáng tạo tri thức', 'người học thụ động', '4–8 học sinh', 'cạnh bo tròn an toàn', 'Internet vạn vật (IoT)', 'máy CNC, khắc laser', 'hạn chế rung', 'ổ cắm sạc',
      'camera giám sát', 'tủ sơ cứu', 'phòng cháy chữa cháy', 'Sinh học, Tin học', 'chuyển đổi số và cách mạng công nghiệp 4.0', 'hội nhập, thực tiễn và bền vững', 'phát hiện sai sót và cải tiến sản phẩm', 'VEX GO / IQ', 'Thiết kế 3D — STEM INNOVATION Petrovietnam'];
    const missing = TERMS.filter((x) => !facts.toLowerCase().includes(x.toLowerCase()));
    check('all key facts of the old page are still on it', !missing.length, missing);
    await b.viewport(390); await nav('/giai-phap/stem-lab', 600);
    const phone = await ev(`({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, navScroll: document.querySelector('.page-jump-list').scrollWidth > document.querySelector('.page-jump-list').clientWidth })`);
    check('phone: no sideways page scroll; the jump menu scrolls inside itself', phone.overflow === 0 && phone.navScroll, phone);
    await shot('stemlab-full-390', true);
  });

  await part(b, '"Khám phá thêm" closing section', async () => {
    const PAGES = [['stem-lab', '/giai-phap/stem-lab'], ['thiet-bi', '/giai-phap/thiet-bi'], ['workshop', '/giai-phap/workshop'], ['dao-tao', '/giai-phap/dao-tao'], ['du-an', '/giai-phap/du-an'], ['tap-huan', '/giai-phap/tap-huan']];
    for (const [key, url] of PAGES) {
      await nav(url, 200);
      const r = await ev(`(() => { const ns = document.querySelector('.next-steps'); if (!ns) return null; const links = [...ns.querySelectorAll('.next-link')].map((a) => ({ href: a.getAttribute('href'), title: a.querySelector('strong').textContent, text: (a.querySelector('.next-link-text') || {}).textContent || '' }));
        return { afterMain: [...document.querySelectorAll('section.section')].pop() === ns, links, cta: [...ns.querySelectorAll('.cta-band-btn')].map((b) => b.textContent.trim() + ' ' + b.getAttribute('href')), oldRow: [...document.querySelectorAll('.section-cta')].filter((c) => !c.closest('.next-steps')).map((c) => c.textContent.replace(/\\s+/g, ' ').trim()) }; })()`);
      const ok = r && r.afterMain && r.links.length === 5 && !r.links.some((l) => l.href === url) && r.links.every((l) => l.href.startsWith('/giai-phap/') && l.text.length > 10) && r.cta.length === 1;
      check(`${url}: ends with "Khám phá thêm" (5 other pages, each with its line) + consultation band`, ok, r);
      if (key === 'workshop') check('workshop: its own button "Đăng ký workshop" is the band\'s button; the old pill row is gone', r.cta[0].startsWith('Đăng ký workshop') && !r.oldRow.length, r);
      // The band's button opens the contact form on this page's own "Bạn quan tâm đến" choice
      const topic = { 'stem-lab': 'giai-phap-stem-lab', 'thiet-bi': 'thiet-bi-stem', workshop: 'workshop-stem', 'dao-tao': 'dao-tao-stem', 'du-an': 'giai-phap-stem-lab', 'tap-huan': 'tap-huan-stem' }[key];
      check(`${url}: the consultation band asks about "${topic}"`, r.cta[0].endsWith(`/lien-he?quan_tam=${topic}`), r.cta);
      if (key === 'stem-lab') check('stem-lab: no button rows left on the page (the closing row became "Khám phá thêm", the one under the key facts is gone)', r.oldRow.length === 0 && r.cta[0] === 'Yêu cầu tư vấn → /lien-he?quan_tam=giai-phap-stem-lab', r);
    }
    await nav('/giai-phap/stem-lab', 300);
    await ev(`document.querySelector('.next-steps').scrollIntoView({ block: 'start' })`); await sleep(300);
    await b.hover('.next-links li:first-child .next-link'); await sleep(400);
    const lift = await ev(`(() => { const a = document.querySelector('.next-links li:first-child .next-link'); return { t: getComputedStyle(a).transform, arrow: getComputedStyle(a.querySelector('.next-link-arrow')).transform }; })()`);
    check('link card lifts and its arrow slides on hover', lift.t !== 'none' && lift.arrow !== 'none', lift);
    await shot('next-steps-1280');
    await b.clickAndWait('.next-links li:first-child .next-link');
    check('a card opens its page', await ev('location.pathname') === '/giai-phap/thiet-bi');
    await b.viewport(390); await nav('/giai-phap/dao-tao', 200); await ev(`document.querySelector('.next-steps').scrollIntoView({ block: 'start' })`); await sleep(300);
    const phone = await ev(`({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, cols: getComputedStyle(document.querySelector('.next-links')).gridTemplateColumns.split(' ').length })`);
    check('phone: cards stack in one column, no sideways scroll', phone.overflow === 0 && phone.cols === 1, phone);
  });

  await part(b, 'STEM equipment tabs + search', async () => {
    const noJs = await (await fetch(BASE + '/giai-phap/thiet-bi')).text();
    check('without JS: tools are hidden and every part is in the page (22 cards, no hidden panel)', /data-equip-tools hidden/.test(noJs) && (noJs.match(/class="card" href="\/giai-phap\/thiet-bi\//g) || []).length === 22 && !/data-panel="[^"]+"[^>]*hidden/.test(noJs));
    await nav('/giai-phap/thiet-bi', 300);
    const eq = () => ev(`(() => ({ hash: location.hash, sel: document.querySelector('.equip-tab[aria-selected="true"]').dataset.tab,
      visible: [...document.querySelectorAll('[data-panel]')].filter((p) => !p.hidden).map((p) => ({ part: p.dataset.panel, cards: p.querySelectorAll('.card').length, note: /VEX Robotics/.test((p.querySelector('.section-subtitle') || {}).textContent || '') })),
      results: !document.querySelector('[data-equip-results]').hidden }))()`);
    let e1 = await eq();
    check('Phần I opens first with 8 items; only one part shown', e1.sel === 'phan-1' && e1.visible.length === 1 && e1.visible[0].cards === 8 && e1.hash === '#phan-1', e1);
    await ev(`document.querySelector('.equip-tab[data-tab="phan-2"]').click()`); e1 = await eq();
    check('Phần II shows both of its lists (3 items) with the sub-heading', e1.sel === 'phan-2' && e1.visible[0].cards === 3 && await ev(`!!document.querySelector('[data-panel="phan-2"] .equipment-subgroup-title')`), e1);
    await ev(`document.querySelector('.equip-tab[data-tab="phan-3"]').click()`); e1 = await eq();
    check('Phần III: 9 items + the VEX note; address becomes #phan-3', e1.sel === 'phan-3' && e1.visible[0].cards === 9 && e1.visible[0].note && e1.hash === '#phan-3', e1);
    await ev(`document.querySelector('.equip-tab[data-tab="phan-3"]').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    e1 = await eq();
    check('arrow key moves to the next tab (Phần IV, 2 items) and focuses it', e1.sel === 'phan-4' && e1.visible[0].cards === 2 && await ev(`document.activeElement.dataset.tab`) === 'phan-4', e1);
    // Switching part: its cards fade in one after another (the first 8); the search results show at once
    const partLook = () => ev(`[...document.querySelectorAll('[data-panel="phan-1"] .card')].map((c) => +getComputedStyle(c).opacity)`);
    await ev(`document.querySelector('.equip-tab[data-tab="phan-1"]').click()`); await sleep(40);
    const pMid = await partLook(); await sleep(700); const pEnd = await partLook();
    await b.shot('equipment-tab-switch');
    check('switching part (Phần I): the cards fade in one after another', pMid[0] > 0 && pMid[0] < 1 && pMid[7] < pMid[0] && pEnd.every((o) => o === 1), { pMid, pEnd });
    await ev(`(() => { const i = document.querySelector('[data-equip-search]'); i.value = 'vex'; i.dispatchEvent(new Event('input')); })()`); await sleep(40);
    const instant = await ev(`[...document.querySelectorAll('[data-equip-grid] .card')].map((c) => +getComputedStyle(c).opacity)`);
    check('… while typing a search the results show at once (no fade on every key)', instant.length > 0 && instant.every((o) => o === 1), instant);
    await ev(`(() => { const i = document.querySelector('[data-equip-search]'); i.value = ''; i.dispatchEvent(new Event('input')); })()`);
    await ev(`document.querySelector('.equip-tab[data-tab="phan-4"]').click()`); await sleep(600);
    await nav('/lien-he'); await nav('/giai-phap/thiet-bi#phan-4', 300); e1 = await eq();
    check('opening the page at #phan-4 shows Phần IV', e1.sel === 'phan-4', e1);
    // Back from an item returns to its tab
    await nav('/lien-he'); await nav('/giai-phap/thiet-bi#phan-3', 300);
    { const l = b.waitLoad(); await ev(`document.querySelector('[data-panel="phan-3"] .card').click()`); await l; await sleep(300); }
    const back = await ev(`document.querySelector('.hero-back').getAttribute('href')`);
    { const l = b.waitLoad(); await ev(`document.querySelector('.hero-back').click()`); await l; await sleep(300); }
    e1 = await eq();
    check('item page "Quay lại" goes back to the same tab (Phần III)', back === '/giai-phap/thiet-bi#phan-3' && e1.sel === 'phan-3' && e1.visible[0].part === 'phan-3', { back, e1 });
    // Search
    const typeSearch = async (q) => { await ev(`(() => { const i = document.querySelector('[data-equip-search]'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); await sleep(150);
      return ev(`(() => ({ results: !document.querySelector('[data-equip-results]').hidden, n: document.querySelectorAll('[data-equip-grid] .card').length, parts: [...new Set([...document.querySelectorAll('[data-equip-grid] .card-part')].map((p) => p.textContent))],
        names: [...document.querySelectorAll('[data-equip-grid] .card h3')].map((h) => h.textContent), count: document.querySelector('[data-equip-count]').textContent, empty: !document.querySelector('[data-equip-empty]').hidden,
        panels: [...document.querySelectorAll('[data-panel]')].filter((p) => !p.hidden).length, dim: document.querySelector('[data-equip-tools]').classList.contains('is-searching') }))()`); };
    let s = await typeSearch('vex');
    check('search "vex": matches from several parts, each labelled with its part; tabs step back', s.results && s.n >= 9 && s.parts.length >= 2 && s.panels === 0 && s.dim && new RegExp(`^${s.n} thiết bị`).test(s.count), s);
    const accentName = await ev(`(() => [...document.querySelectorAll('[data-panel] .card h3')].map((x) => x.textContent).find((t) => /[à-ỹ]/i.test(t)))()`);
    const plain = accentName.split(' ').slice(0, 2).join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
    s = await typeSearch(plain);
    check(`search without accents ("${plain}") finds "${accentName}"`, s.names.includes(accentName), s);
    s = await typeSearch('zzqx khong co');
    check('a search with no match shows the "not found" note', s.n === 0 && s.empty, s);
    // Same rule as the admin search: each word must start a word of the names (VI + EN) or of the sub-list topic,
    // never matched inside a word or through the shared "Phần …" title
    const allEquip = await d.collection('products').find({ category: 'stem-equipment' }).toArray();
    s = await typeSearch('thiet bi');
    const withThietBi = allEquip.filter((x) => /thiết bị/i.test(x.nameVi)).length;
    check(`search "thiet bi": only the ${withThietBi} items named "Thiết bị…" (not every Phần I/II item)`, s.n === withThietBi && s.names.every((n) => /thiết bị/i.test(n)), s);
    s = await typeSearch('phan');
    check('search "phan": not every item (the word "Phần" of the part titles does not count)', s.n > 0 && s.n < allEquip.length && s.names.every((n) => /phần/i.test(n)), s);
    s = await typeSearch('in');
    check('search "in": words starting with "in" only (Internet, industrial…), not "trình" or "sinh"', s.n > 0 && !s.names.some((n) => /^VEX 123|^Hệ sinh thái/.test(n)) && s.names.some((n) => /Internet/.test(n)), s);
    s = await typeSearch('vex-iq');
    check('search "vex-iq": punctuation counts as a space -> VEX IQ', s.n === 1 && /^VEX IQ/.test(s.names[0]), s);
    s = await typeSearch('ro bot');
    check('search "ro bot": finds the item of the "Lập trình & Rô-bốt giáo dục" sub-list', s.n === 1 && /Makeblock/.test(s.names[0]), s);
    s = await typeSearch('');
    e1 = await eq();
    check('clearing the search brings back the tab that was open', !s.results && s.panels === 1 && e1.sel === 'phan-3', { s, e1 });
    await nav('/giai-phap/thiet-bi?lang=en', 400);
    s = await typeSearch('may tinh');
    check('English page: a Vietnamese search ("may tinh") still finds the laptops item', s.n === 1 && /laptops/i.test(s.names[0]), s);
    await nav('/giai-phap/thiet-bi?lang=vi', 300);
    await b.viewport(390, 844); await nav('/giai-phap/thiet-bi', 300); await ev(`window.scrollTo(0, 240)`); await sleep(200);
    check('phone: no sideways page scroll (tabs scroll inside their own row)', !(await ev(`document.documentElement.scrollWidth > innerWidth`)));
  });

  await part(b, 'process trails', async () => {
    for (const [slug, steps] of [['stem-lab', 4], ['tap-huan', 4], ['dao-tao', 6]]) {
      for (const width of [1280, 390]) {
        await b.viewport(width, width === 390 ? 844 : 900);
        await nav(`/giai-phap/${slug}`, 300);
        await ev(`document.querySelector('.process-trail').scrollIntoView({ block: 'center' })`);
        await sleep(1000);
        if (width === 1280) {
          const early = await ev(`[...document.querySelectorAll('.process-trail .trail-node')].filter((x) => +getComputedStyle(x).opacity > 0.99).length`);
          check(`${slug}: after 1 s the trail is still drawing (${early} of ${steps} stops shown)`, early >= 1 && early < steps, early);
        }
        await sleep(2300); // the whole trail takes about 2.8 s
        const tr = await ev(`(() => { const t = document.querySelector('.process-trail'); const li = [...t.querySelectorAll('.trail-step')];
          const nodes = li.map((l) => l.querySelector('.trail-node').getBoundingClientRect());
          const segs = li.slice(0, -1).map((l, i) => { const a = getComputedStyle(l, '::after'); const r = l.getBoundingClientRect();
            const horizontal = ${width} > 900; const start = horizontal ? r.left + parseFloat(a.left) : r.top + parseFloat(a.top); const len = horizontal ? parseFloat(a.width) : parseFloat(a.height);
            const from = horizontal ? nodes[i].left + nodes[i].width / 2 : nodes[i].top + nodes[i].height / 2; const to = horizontal ? nodes[i + 1].left + nodes[i + 1].width / 2 : nodes[i + 1].top + nodes[i + 1].height / 2;
            return { gapStart: Math.round(start - from), gapEnd: Math.round(start + len - to), filled: a.transform === 'none' || a.transform === 'matrix(1, 0, 0, 1, 0, 0)' }; });
          return { n: li.length, drawn: t.classList.contains('is-drawn'), row: nodes.every((n) => Math.abs(n.top - nodes[0].top) < 2), col: nodes.every((n) => Math.abs(n.left - nodes[0].left) < 2),
            shown: li.every((l) => +getComputedStyle(l.querySelector('.trail-node')).opacity === 1 && +getComputedStyle(l.querySelector('.trail-body')).opacity === 1), arrows: li.slice(0, -1).every((l) => +getComputedStyle(l.querySelector('.trail-body'), '::before').opacity === 1), segs, overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
        const connected = tr.segs.every((g) => Math.abs(g.gapStart) <= 2 && Math.abs(g.gapEnd) <= 2 && g.filled);
        check(`${slug} @${width}: ${steps} stops on one continuous filled line (${width > 900 ? 'across' : 'down'}), all shown, no overflow`,
          tr.n === steps && tr.drawn && (width > 900 ? tr.row : tr.col) && connected && tr.shown && tr.arrows && !tr.overflow, tr);
        await shot(`trail-${slug}-${width}`);
      }
    }
    // Reduced motion: the same ~2.8 s (the owner's choice), then hover lights up a step
    await b.viewport(1280, 900); await b.reducedMotion();
    await nav('/giai-phap/tap-huan', 300);
    await ev(`document.querySelector('.process-trail').scrollIntoView({ block: 'center' })`);
    await sleep(1000);
    const slow = await ev(`[...document.querySelectorAll('.process-trail .trail-node')].filter((x) => +getComputedStyle(x).opacity > 0.99).length`);
    check('reduced motion: the trail still takes its time (not finished after 1 s)', slow < 4, slow);
    await sleep(2500);
    check('… and is complete and settled after about 3 s', await ev(`(() => { const t = document.querySelector('.process-trail'); return t.classList.contains('is-settled') && [...t.querySelectorAll('.trail-node')].every((x) => +getComputedStyle(x).opacity > 0.99); })()`));
    const look = () => ev(`(() => { const s = document.querySelector('.process-trail .trail-step:nth-child(2)'); return { node: getComputedStyle(s.querySelector('.trail-node')).transform, bg: getComputedStyle(s.querySelector('.trail-body')).backgroundColor, title: getComputedStyle(s.querySelector('h3')).color }; })()`);
    const calm = await look();
    await b.hover('.process-trail .trail-step:nth-child(2) .trail-body h3'); await sleep(300);
    const lit = await look();
    check('hovering a step lights it up (bigger node, tinted text box, blue title)', /^matrix\(1\.1/.test(lit.node) && lit.bg !== calm.bg && lit.title !== calm.title, { calm, lit });
    await b.mouse('mouseMoved', { x: 5, y: 5 }); await sleep(300);
    check('… and goes back when the pointer leaves', JSON.stringify(await look()) === JSON.stringify(calm));
    await shot('trail-hover');
    // Tập huấn: "Kết nối cùng hệ sinh thái VEX Robotics toàn cầu": number cards light up on hover, and a button opens the VEX website
    const vex = await ev(`(() => { const block = [...document.querySelectorAll('.solution-block[data-section-kind="stats"]')].find((x) => /VEX Robotics/.test(x.textContent)); const a = block.querySelector('.section-cta a');
      return { cards: block.querySelectorAll('.stat-card').length, buttons: block.querySelectorAll('.section-cta a').length, text: a.textContent.replace(/\\s+/g, ' ').trim(), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), below: a.getBoundingClientRect().top > block.querySelector('.stat-grid').getBoundingClientRect().bottom }; })()`);
    check('VEX section: 4 number cards, then a "Khám phá VEX Robotics" button to vexrobotics.com that opens in a new tab', vex.cards === 4 && vex.buttons === 1 && /^Khám phá VEX Robotics ↗/.test(vex.text) && /mở trong thẻ mới/.test(vex.text)
      && vex.href === 'https://www.vexrobotics.com/' && vex.target === '_blank' && vex.rel === 'noopener' && vex.below, vex);
    const cardSel = '.solution-block[data-section-kind="stats"]:has(a[href*="vexrobotics"]) .stat-card:nth-child(2)';
    const cardLook = () => ev(`(() => { const c = document.querySelector('${cardSel}'); return { t: getComputedStyle(c).transform, border: getComputedStyle(c).borderTopColor, num: getComputedStyle(c.querySelector('.num')).transform }; })()`);
    await b.mouse('mouseMoved', { x: 5, y: 5 }); await sleep(250);
    const cardCalm = await cardLook();
    await b.hover(cardSel); await sleep(350);
    const cardLit = await cardLook();
    check('VEX section: hovering a number card lifts it, outlines it in blue and enlarges the number', cardLit.t !== cardCalm.t && cardLit.border === 'rgb(21, 101, 192)' && /^matrix\(1\.0[5-9]/.test(cardLit.num), { cardCalm, cardLit });
    await shot('vex-hover');
    await b.mouse('mouseMoved', { x: 5, y: 5 }); await sleep(250);
    // Dịch vụ pages: numbered steps light up on hover too
    const svc = await d.collection('services').findOne({ 'steps.0': { $exists: true } });
    if (svc) {
      await nav(`/dich-vu/${svc.slug}`, 300);
      await ev(`document.querySelector('.timeline-item').scrollIntoView({ block: 'center' })`);
      const border = () => ev(`getComputedStyle(document.querySelector('.timeline-item')).borderColor`);
      const before = await border();
      await b.hover('.timeline-item'); await sleep(300);
      check('Dịch vụ: hovering a step highlights it (blue border)', (await border()) !== before);
    }
    await b.reducedMotion(false);
  });
});
