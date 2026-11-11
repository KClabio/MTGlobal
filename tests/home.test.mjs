// Home page "Lĩnh vực hoạt động" slider (layout, texts, wheel, smooth slides, drag/throw, arrows, "← Về trang chủ"),
// the hero (photo as background, the figures panel and its count-up) and the "← Quay lại" back link on detail pages.
import { suite, part, check, db, BASE, appRequire, tempArticle } from './lib/index.mjs';

const { bannerFor } = appRequire('./lib/banners.js');
const { buildHomeDomains } = appRequire('./lib/home-domains.js');

await suite(async (b) => {
  const { send, ev, sleep } = b;
  const viewport = (w, h = 900) => b.viewport(w, h);
  const waitLoad = () => b.waitLoad();
  const shot = (name) => b.shot(name);

  await part(b, 'home slider', async () => {
    const d = await db();
    const nav = (p) => b.nav(p, 500);
    const mouse = async (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const click = async (selector) => {
      const pt = await ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 120), y: r.top + Math.min(r.height / 2, 60) }; })()`);
      if (!pt) throw new Error('not found: ' + selector);
      await mouse('mouseMoved', pt.x, pt.y);
      await mouse('mousePressed', pt.x, pt.y, { button: 'left', buttons: 1, clickCount: 1 });
      await mouse('mouseReleased', pt.x, pt.y, { button: 'left', buttons: 0, clickCount: 1 });
    };
    const state = () => ev(`(() => { const t = document.querySelector('[data-domain-slider]'); return { left: Math.round(t.scrollLeft), max: t.scrollWidth - t.clientWidth, y: Math.round(scrollY),
      prev: document.querySelector('[data-domain-prev]').disabled, next: document.querySelector('[data-domain-next]').disabled }; })()`);
    // Fraction of each card visible inside the container's content box (the track bleeds into the 20px padding)
    const visible = () => ev(`(() => { const c = document.querySelector('.domains-section .container'); const cs = getComputedStyle(c); const cr = c.getBoundingClientRect();
      const L = cr.left + parseFloat(cs.paddingLeft), R = cr.right - parseFloat(cs.paddingRight);
      return [...document.querySelectorAll('.domain-item')].map((li) => { const r = li.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(R, r.right) - Math.max(L, r.left)) / r.width * 100) / 100; }); })()`);
    const trackCenter = () => ev(`(() => { const r = document.querySelector('[data-domain-slider]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const wheel = async (deltaY, times = 1) => { const c = await trackCenter(); for (let i = 0; i < times; i++) { await mouse('mouseWheel', c.x, c.y, { deltaX: 0, deltaY }); await sleep(60); } await sleep(700); };
    const bringIntoView = () => ev(`(() => { const s = document.getElementById('linh-vuc'); window.scrollTo(0, s.getBoundingClientRect().top + scrollY - 80); return true; })()`);

    // ---- 1. Layout at 1280px ----
    await nav('/');
    await bringIntoView(); await sleep(200);
    const cards = await ev(`[...document.querySelectorAll('.domain-card')].map((a) => ({ href: a.getAttribute('href'), title: a.querySelector('h3').textContent.trim(), text: (a.querySelector('p') || {}).textContent || '', img: (a.querySelector('img') || {}).src || null }))`);
    check('7 area cards in menu order (one "Dịch vụ" card for all services), each linking with ?from=home', cards.length === 7 && JSON.stringify(cards.map((c) => c.href)) === JSON.stringify(['/san-pham', '/giai-phap/stem-lab', '/giai-phap/thiet-bi', '/giai-phap/workshop', '/giai-phap/dao-tao', '/giai-phap/tap-huan', '/dich-vu'].map((u) => u + '?from=home')), cards.map((c) => c.href));
    check('section title is "Lĩnh vực hoạt động"', (await ev(`document.querySelector('#linh-vuc .section-title').textContent.trim()`)) === 'Lĩnh vực hoạt động');
    // Screen readers: a named list ("Lĩnh vực hoạt động, list, 7 items"), not a region that hides the list
    const a11y = await ev(`(() => { const t = document.querySelector('[data-domain-slider]'); return { tag: t.tagName, role: t.getAttribute('role'), label: t.getAttribute('aria-label'), focusable: t.tabIndex === 0, items: t.querySelectorAll(':scope > li').length }; })()`);
    check('slider read as a named list: <ul> without a role, "Lĩnh vực hoạt động" as its name, one <li> per card, keyboard-focusable',
      a11y.tag === 'UL' && a11y.role === null && a11y.label === 'Lĩnh vực hoạt động' && a11y.items === cards.length && a11y.focusable, a11y);
    // Off-screen cards lazy-load, so check each picture over HTTP instead of waiting for the browser
    const imgs = [];
    for (const card of cards) imgs.push(card.img ? (await fetch(card.img)).headers.get('content-type')?.startsWith('image/') === true : 'art');
    check('all card photos load (Dịch vụ uses colour art until a service photo is uploaded)', JSON.stringify(imgs) === JSON.stringify([true, true, true, true, true, true, 'art']), imgs);
    let vis = await visible();
    check('1280px: cards 1–3 fully visible, card 4 about half, card 5 hidden', vis[0] === 1 && vis[1] === 1 && vis[2] === 1 && vis[3] >= 0.4 && vis[3] <= 0.6 && vis[4] === 0, vis);
    let st = await state();
    check('at the start: ◀ disabled, ▶ enabled', st.prev && !st.next, st);
    await shot('slider-1280-light');

    // ---- 2. Text follows the banner lines / service summaries ----
    const settings = await d.collection('sitesettings').findOne({});
    const services = await d.collection('services').find({}).toArray();
    const expectText = (lang) => ['products', 'stem-lab', 'thiet-bi', 'workshop', 'dao-tao', 'tap-huan'].map((k) => bannerFor(settings, k, lang).subtitle)
      .concat([bannerFor(settings, 'services', lang).subtitle]);
    check('VI card texts = banner lines (the Dịch vụ card: the services banner line)', JSON.stringify(cards.map((c) => c.text.trim())) === JSON.stringify(expectText('vi')), cards.map((c) => c.text));
    await nav('/?lang=en'); await bringIntoView();
    const en = await ev(`({ title: document.querySelector('#linh-vuc .section-title').textContent.trim(), texts: [...document.querySelectorAll('.domain-card')].map((a) => ((a.querySelector('p') || {}).textContent || '').trim()), titles: [...document.querySelectorAll('.domain-card h3')].map((h) => h.textContent.trim()), prev: document.querySelector('[data-domain-prev]').getAttribute('aria-label') })`);
    check('EN: "What We Do", English texts and titles, arrow labels', en.title === 'What We Do' && JSON.stringify(en.texts) === JSON.stringify(expectText('en')) && en.titles[6] === 'Services' && en.prev === 'Previous area', en);
    await nav('/?lang=vi');

    // A banner override in Cài đặt chung shows on the card (checked at the function level with the same settings shape)
    const t = (k) => k;
    const fake = { banners: { workshop: { subtitleVi: 'ZZ dòng mới' } } };
    const built = buildHomeDomains({ settings: fake, lang: 'vi', t, services });
    check('a workshop banner override in Cài đặt chung becomes the workshop card text', built.find((x) => x.key === 'workshop').text === 'ZZ dòng mới');
    const withPhoto = buildHomeDomains({ settings: {}, lang: 'vi', t, services: [{ ...services[0], heroImage: '/uploads/images/svc.jpg' }] });
    const noServices = buildHomeDomains({ settings: {}, lang: 'vi', t, services: [] });
    check('an uploaded service hero image replaces the default picture; no services = no Dịch vụ card',
      withPhoto.find((x) => x.key === 'dich-vu').image === '/uploads/images/svc.jpg' && withPhoto.length === 7 && noServices.length === 6, withPhoto.map((x) => [x.key, x.image]));
    // The robot card keeps its own picture (the stair-climbing machine on white), even now the robot has photos
    check('the Robotics card shows the stair-climbing machine picture', /\/assets\/home\/robot-leo-cau-thang\.jpg/.test(cards[0].img || ''), cards[0].img);

    // ---- 3. Mouse wheel (the owner's PC prefers reduced motion; the eased path is tested too) ----
    for (const motion of ['reduce', 'no-preference']) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion }] });
      await nav('/'); await bringIntoView(); await sleep(200);
      const before = await state();
      await wheel(100, 3);
      const after = await state();
      check(`[${motion}] wheel down over the slider scrolls it sideways, the page stays put`, after.left > before.left + 150 && after.y === before.y && !after.prev, { before, after });
      // One tick at a time until the slider reports its end, so no extra ticks reach the page
      let atEnd = await state();
      for (let i = 0; i < 40 && !atEnd.next; i++) { await wheel(100); atEnd = await state(); }
      check(`[${motion}] wheel reaches the end exactly: ▶ disabled, page still put`, atEnd.left === atEnd.max && atEnd.next && atEnd.y === before.y, atEnd);
      await wheel(100, 5);
      const pastEnd = await state();
      check(`[${motion}] at the end, 5 more wheel ticks down do nothing: page and slider stay put`, pastEnd.y === atEnd.y && pastEnd.left === atEnd.left, { atEnd, pastEnd });
      const y0 = (await state()).y;
      let atStart = await state();
      for (let i = 0; i < 40 && !atStart.prev; i++) { await wheel(-100); atStart = await state(); }
      check(`[${motion}] wheel up goes back to the start exactly (◀ disabled), page still put`, atStart.left === 0 && atStart.prev && atStart.y === y0, { y0, atStart });
      await wheel(-100, 5);
      const pastStart = await state();
      check(`[${motion}] at the start, 5 more wheel ticks up do nothing: page and slider stay put`, pastStart.y === y0 && pastStart.left === 0, { y0, pastStart });
      // The lock is only over the card row: over the title / the gap above the cards the page scrolls as usual
      for (const [where, expr] of [['the section title', `(() => { const r = document.querySelector('#linh-vuc .section-title').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`],
        ['the gap between title and cards', `(() => { const h = document.querySelector('#linh-vuc .section-head').getBoundingClientRect(); const t = document.querySelector('[data-domain-slider]').getBoundingClientRect(); return { x: 300, y: (h.bottom + t.top) / 2 }; })()`]]) {
        await bringIntoView(); await sleep(150);
        const before2 = await state();
        const p = await ev(expr);
        await mouse('mouseWheel', p.x, p.y, { deltaX: 0, deltaY: 120 }); await sleep(500);
        const after2 = await state();
        check(`[${motion}] wheel over ${where} scrolls the page (slider untouched)`, after2.y > before2.y && after2.left === before2.left, { before2, after2, p });
      }
    }
    // ---- 3b. Smooth animation (sampled every animation frame inside the page) ----
    const startSampling = () => ev(`(() => { const t = document.querySelector('[data-domain-slider]'); window.__s = []; const t0 = performance.now();
      (function f(now) { window.__s.push([Math.round(now - t0), t.scrollLeft]); if (now - t0 < 1600) requestAnimationFrame(f); })(t0); return true; })()`);
    const samples = async (ms = 1700) => { await sleep(ms); return ev('window.__s'); };
    const monotonic = (xs, dir = 1) => xs.every((x, i) => i === 0 || (x - xs[i - 1]) * dir >= -0.5);
    const analyse = (s) => { const xs = s.map((p) => p[1]); const first = xs[0], last = xs[xs.length - 1];
      const moving = s.filter((p) => Math.abs(p[1] - first) > 0.5 && Math.abs(p[1] - last) > 0.5);
      const startT = (s.find((p) => Math.abs(p[1] - first) > 0.5) || [0])[0]; const endT = (s.find((p) => Math.abs(p[1] - last) <= 0.5 && p[0] >= startT) || [0])[0];
      return { first, last, distinct: new Set(moving.map((p) => Math.round(p[1]))).size, dur: endT - startT, xs }; };
    const stepPx = async () => ev(`(() => { const t = document.querySelector('[data-domain-slider]'); return document.querySelector('.domain-item').getBoundingClientRect().width + parseFloat(getComputedStyle(t).columnGap); })()`);
    const onEdge = async (x) => ev(`(() => { const t = document.querySelector('[data-domain-slider]'); const max = t.scrollWidth - t.clientWidth; const s = document.querySelector('.domain-item').getBoundingClientRect().width + parseFloat(getComputedStyle(t).columnGap);
      return Math.abs(${x} - max) <= 1 || Math.abs(${x} / s - Math.round(${x} / s)) * s <= 1; })()`);
    for (const motion of ['reduce', 'no-preference']) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion }] });
      const expectDur = motion === 'reduce' ? 270 : 450;
      await nav('/'); await bringIntoView(); await sleep(200);
      const sp = await stepPx();
      // One ▶ click
      await startSampling(); await click('[data-domain-next]');
      let a = analyse(await samples());
      check(`[${motion}] ▶ slides smoothly: ${a.distinct} in-between frames over ${a.dur} ms, always forward, ends one card along`,
        a.distinct >= 8 && monotonic(a.xs) && Math.abs(a.last - sp) <= 1 && a.dur >= expectDur * 0.7 && a.dur <= expectDur * 1.5, { distinct: a.distinct, dur: a.dur, last: a.last, sp });
      // Two fast clicks: one continuous slide two cards along
      await startSampling(); await click('[data-domain-next]'); await sleep(120); await click('[data-domain-next]');
      a = analyse(await samples());
      const stalls = a.xs.slice(1).filter((x, i) => Math.abs(x - a.xs[i]) < 0.3 && Math.abs(x - a.first) > 0.5 && Math.abs(x - a.last) > 0.5).length;
      check(`[${motion}] two quick ▶ clicks blend into one slide (no reverse, no pause), ending two cards further`,
        monotonic(a.xs) && stalls === 0 && Math.abs(a.last - 3 * sp) <= 1, { stalls, last: a.last, want: 3 * sp });
      // Three wheel ticks: one glide, then rest on a card edge
      await nav('/'); await bringIntoView(); await sleep(200);
      const c0 = await trackCenter();
      await startSampling();
      for (let i = 0; i < 3; i++) { await mouse('mouseWheel', c0.x, c0.y, { deltaX: 0, deltaY: 100 }); await sleep(40); }
      a = analyse(await samples());
      check(`[${motion}] 3 wheel ticks: one smooth forward glide (${a.distinct} frames), resting on a card edge`, a.distinct >= 8 && monotonic(a.xs) && a.last > 250 && await onEdge(a.last), { distinct: a.distinct, last: a.last, sp });
      // A single wheel notch still moves one card (settles forward, not back)
      await nav('/'); await bringIntoView(); await sleep(200);
      await mouse('mouseWheel', c0.x, c0.y, { deltaX: 0, deltaY: 100 }); await sleep(900);
      check(`[${motion}] one wheel notch moves exactly one card`, Math.abs((await state()).left - sp) <= 1, await state());
      // Mouse throw: keeps moving after release, slows down, rests on a card edge.
      // Timing-sensitive in a headless browser: the drag is retried once if the glide was too short to measure.
      let throwOk = false;
      let info;
      for (let attempt = 0; attempt < 2 && !throwOk; attempt++) {
        await nav('/'); await bringIntoView(); await sleep(200);
        const c1 = await trackCenter();
        await mouse('mouseMoved', c1.x, c1.y);
        await mouse('mousePressed', c1.x, c1.y, { button: 'left', buttons: 1, clickCount: 1 });
        for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', c1.x - i * 25, c1.y, { buttons: 1 }); await sleep(12); }
        const atRelease = (await state()).left;
        await startSampling();
        await mouse('mouseReleased', c1.x - 200, c1.y, { button: 'left', buttons: 0, clickCount: 1 });
        a = analyse(await samples());
        info = { atRelease, last: a.last, distinct: a.distinct };
        throwOk = a.last > atRelease + 20 && monotonic(a.xs) && await onEdge(a.last) && (await ev('location.pathname')) === '/';
      }
      check(`[${motion}] mouse throw glides on after release, slowing down, onto a card edge, no card opened`, throwOk, info);
    }
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

    // ---- 4. Arrows ----
    await nav('/'); await bringIntoView(); await sleep(200);
    const stepW = await stepPx();
    await click('[data-domain-next]'); await sleep(500);
    st = await state();
    check('▶ moves by one card', Math.abs(st.left - stepW) <= 2 && !st.prev, { st, stepW });
    for (let i = 0; i < 8; i++) { await click('[data-domain-next]'); await sleep(250); }
    st = await state();
    check('▶ repeatedly: stops at the end and is disabled', st.left >= st.max - 1 && st.next, st);
    vis = await visible();
    check('at the end the last card is fully visible', vis[vis.length - 1] === 1, vis);
    await click('[data-domain-prev]'); await sleep(400);
    check('◀ moves back', (await state()).left < st.left);

    // ---- 5. Mouse drag ----
    await nav('/'); await bringIntoView(); await sleep(200);
    const c = await trackCenter();
    await mouse('mouseMoved', c.x, c.y);
    await mouse('mousePressed', c.x, c.y, { button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 10; i++) { await mouse('mouseMoved', c.x - i * 30, c.y, { buttons: 1 }); await sleep(16); }
    await mouse('mouseReleased', c.x - 300, c.y, { button: 'left', buttons: 0, clickCount: 1 });
    await sleep(500);
    const afterDrag = await ev(`({ left: Math.round(document.querySelector('[data-domain-slider]').scrollLeft), url: location.pathname })`);
    check('dragging with the mouse scrolls the slider and does not open a card', afterDrag.left >= 280 && afterDrag.url === '/', afterDrag);

    // ---- 6. Card → page with "← Về trang chủ" → back to the slider at the same spot ----
    await nav('/'); await bringIntoView(); await sleep(200);
    for (let i = 0; i < 3; i++) { await click('[data-domain-next]'); await sleep(300); }
    const savedLeft = (await state()).left;
    vis = await visible();
    check('after 3 × ▶, card 6 (Tập huấn) is in view', vis[5] === 1, vis);
    let l = waitLoad(); await click('.domain-item:nth-child(6) .domain-card'); await l; await sleep(400);
    let page = await ev(`({ url: location.pathname + location.search, back: (document.querySelector('[data-back-home]') || {}).textContent, href: (document.querySelector('[data-back-home]') || { getAttribute: () => null }).getAttribute('href'), oldBack: !!document.querySelector('[data-back]') })`);
    check('card opens /giai-phap/tap-huan?from=home with "← Về trang chủ" → /#linh-vuc', page.url === '/giai-phap/tap-huan?from=home' && /Về trang chủ/.test(page.back) && page.href === '/#linh-vuc' && !page.oldBack, page);
    await shot('back-link-tap-huan');
    // Language switch keeps it
    l = waitLoad(); await click('.lang-switch a[hreflang="en"], .lang-switch a:last-child'); await l; await sleep(400);
    page = await ev(`({ url: location.pathname + location.search, back: (document.querySelector('[data-back-home]') || {}).textContent })`);
    check('after VI → EN the link stays: "← Back to home"', /from=home/.test(page.url) && /Back to home/.test(page.back), page);
    l = waitLoad(); await send('Page.reload'); await l; await sleep(300);
    check('after a reload the link stays', !!(await ev(`!!document.querySelector('[data-back-home]')`)));
    l = waitLoad(); await click('.lang-switch a[hreflang="vi"], .lang-switch a:first-child'); await l; await sleep(300);
    // Back to the home page section
    l = waitLoad(); await click('[data-back-home]'); await l; await sleep(700);
    const home = await ev(`(() => { const s = document.getElementById('linh-vuc').getBoundingClientRect(); return { url: location.pathname + location.hash, sectionTop: Math.round(s.top), left: Math.round(document.querySelector('[data-domain-slider]').scrollLeft) }; })()`);
    vis = await visible();
    check('"Về trang chủ" lands on the home slider section with the same slider position (card 6 still in view)', home.url === '/#linh-vuc' && home.sectionTop >= -10 && home.sectionTop < 200 && Math.abs(home.left - savedLeft) <= 2 && vis[5] === 1, { home, savedLeft, vis });

    // ---- 7. No back link when the page is reached any other way ----
    for (const p of ['/giai-phap/tap-huan', '/san-pham', '/giai-phap/thiet-bi', '/dich-vu/tu-van-du-hoc']) {
      await nav(p);
      check(`${p} opened directly: no "Về trang chủ" link`, !(await ev(`!!document.querySelector('[data-back-home]')`)));
    }
    // through the menu
    await nav('/');
    l = waitLoad(); await ev(`document.querySelector('.nav-dropdown-menu a[href="/giai-phap/workshop"]').click()`); await l; await sleep(300);
    check('workshop opened from the menu: no "Về trang chủ" link', !(await ev(`!!document.querySelector('[data-back-home]')`)));
    // detail pages keep their normal back link
    const pid = (await d.collection('projects').findOne({}))._id;
    await nav(`/giai-phap/du-an/${pid}`);
    check('project detail still has the usual "← Quay lại" and no home link', await ev(`!!document.querySelector('[data-back]') && !document.querySelector('[data-back-home]')`));

    // ---- 8. Responsive + dark ----
    await viewport(1100); await nav('/'); await bringIntoView(); await sleep(300);
    vis = await visible();
    check('1100px: 2 cards fully visible + about half of the 3rd', vis[0] === 1 && vis[1] === 1 && vis[2] >= 0.4 && vis[2] <= 0.6, vis);
    await viewport(390, 844); await nav('/'); await bringIntoView(); await sleep(300);
    vis = await visible();
    check('390px: 1 card + about a quarter of the next', vis[0] === 1 && vis[1] >= 0.15 && vis[1] <= 0.35, vis);
    await shot('slider-390');
    await viewport(1280);
    await b.setCookie('theme', 'dark');
    await nav('/'); await bringIntoView(); await sleep(300);
    await shot('slider-1280-dark');
  });

  // Trang chủ hero: the photo fills the section behind the text; a glass panel on it shows live counts of projects,
  // products and partners (lib/home-domains.js buildHeroFigures), counted up once by public/js/main.js.
  await part(b, 'hero photo + figures', async () => {
    const d = await db();
    const { buildHeroFigures } = appRequire('./lib/home-domains.js');
    const sharp = appRequire('sharp');
    const nav = (p, settle = 300) => b.nav(p, settle);
    const page = async (lang = 'vi') => (await fetch(BASE + '/', { headers: { cookie: `lang=${lang}` } })).text();
    await b.setCookie('theme', 'light');
    await viewport(1280);

    // ---- 1. Which figures (plain logic) ----
    const keys = (o) => buildHeroFigures(o).map((f) => `${f.key}:${f.n}:${f.href}`).join(' ');
    check('figures: projects, products, partners in that order, each with the page that shows them',
      keys({ projects: 8, products: 26, partners: 7 }) === 'projects:8:/giai-phap/du-an products:26:/san-pham partners:7:#doi-tac', keys({ projects: 8, products: 26, partners: 7 }));
    check('figures: a count of 0 (or not a number) is left out; nothing to count → no panel',
      keys({ projects: 0, products: 3, partners: 0 }) === 'products:3:/san-pham' && buildHeroFigures({}).length === 0 && buildHeroFigures({ projects: NaN, partners: 2.5 }).length === 0);

    // ---- 2. The real numbers are in the HTML from the start (search engines, screen readers, no JavaScript) ----
    const counts = { projects: await d.collection('projects').countDocuments(), products: await d.collection('products').countDocuments(), partners: await d.collection('partners').countDocuments() };
    const figs = buildHeroFigures(counts);
    const html = await page();
    const inHtml = [...html.matchAll(/data-fig-count="(\d+)"/g)].map((m) => Number(m[1]));
    check(`HTML carries the database counts ${JSON.stringify(counts)}`, figs.length > 0 && JSON.stringify(inHtml) === JSON.stringify(figs.map((f) => f.n)), inHtml);
    check('screen readers get one sentence per row ("8 dự án đã triển khai"); the moving digits are hidden from them',
      html.includes(`<span class="sr-only">${counts.projects} dự án đã triển khai</span>`) && /class="fig-num" data-fig-count="\d+" style="[^"]*" aria-hidden="true">\d+</.test(html) && html.includes('aria-label="MTG qua các con số"'));
    const htmlEn = await page('en');
    check('English: "MTG in numbers", "<n> products robots & STEM equipment"', htmlEn.includes('aria-label="MTG in numbers"') && htmlEn.includes(`<span class="sr-only">${counts.products} products robots &amp; STEM equipment</span>`));
    check('the partner row leads to the partner strip on Trang chủ (#doi-tac)', /<section class="section section-alt" id="doi-tac">[\s\S]{0,3000}partner-strip/.test(html));

    // ---- 3. The photo fills the section, under the text ----
    // Records every number the panel shows while counting, with the time and the panel's height (installed before the page runs)
    const RECORDER = `(() => { window.__fig = { seen: [], heights: [] };
      document.addEventListener('DOMContentLoaded', () => {
        const panel = document.querySelector('[data-hero-figures]'); if (!panel) return;
        const nums = [...panel.querySelectorAll('[data-fig-count]')];
        const note = () => { const now = performance.now();
          nums.forEach((el, i) => { const s = (window.__fig.seen[i] = window.__fig.seen[i] || []); const v = Number(el.textContent); if (!s.length || s[s.length - 1].v !== v) s.push({ t: now, v }); });
          window.__fig.heights.push(Math.round(panel.getBoundingClientRect().height * 10) / 10); };
        note(); new MutationObserver(note).observe(panel, { childList: true, characterData: true, subtree: true });
      }); })()`;
    const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
    const countUp = async () => {
      await nav('/', 3200); // the count runs about 2.2 s (delays included)
      return ev(`(() => { const i = window.__fig.seen.reduce((best, s, k, all) => (s[s.length - 1].v > all[best][all[best].length - 1].v ? k : best), 0); const s = window.__fig.seen[i];
        const moving = s.filter((x) => x.v > 0);
        return { values: s.map((x) => x.v), final: [...document.querySelectorAll('[data-fig-count]')].map((el) => Number(el.textContent)),
          ms: moving.length ? Math.round(moving[moving.length - 1].t - moving[0].t) : 0, heights: [...new Set(window.__fig.heights)],
          ready: document.querySelector('[data-hero-figures]').classList.contains('is-ready'), opacity: getComputedStyle(document.querySelector('[data-hero-figures]')).opacity }; })()`);
    };
    // Said explicitly: the test browser otherwise follows the computer's own setting (the owner's PC asks for less motion)
    await b.reducedMotion(false);
    const normal = await countUp();
    const cover =await ev(`(() => { const box = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(','); };
      const hero = document.querySelector('.home-hero'), img = document.querySelector('.home-hero-art img'), h1 = document.querySelector('.home-hero h1'), r = h1.getBoundingClientRect();
      return { hero: box(hero), img: box(img), fit: getComputedStyle(img).objectFit, loaded: img.naturalWidth, h1OnTop: document.elementFromPoint(r.left + 20, r.top + r.height / 2) === h1,
        panelOnTop: !!document.elementFromPoint(document.querySelector('.fig-num').getBoundingClientRect().left + 5, document.querySelector('.fig-num').getBoundingClientRect().top + 10).closest('[data-hero-figures]'),
        side: document.querySelector('[data-hero-figures]').getBoundingClientRect().left > r.right }; })()`);
    check('1280px: the photo fills the whole section (cropped to cover) and has loaded', cover.hero === cover.img && cover.fit === 'cover' && cover.loaded > 0, cover);
    check('1280px: the title and the figures sit on top of the photo; the panel is to the right of the text', cover.h1OnTop && cover.panelOnTop && cover.side, cover);

    // ---- 4. The count-up: plays once, really counts, ends on the real numbers, the panel doesn't move ----
    check('count-up: ends on the real numbers, panel shown', JSON.stringify(normal.final) === JSON.stringify(inHtml) && normal.ready && normal.opacity === '1', normal);
    const top = normal.values[normal.values.length - 1];
    check(`count-up: passes through numbers between 0 and ${top}, never going down`, normal.values.some((v) => v > 0 && v < top) && normal.values.every((v, i, a) => i === 0 || v >= a[i - 1]), normal.values);
    check(`count-up: takes about 2 seconds (${normal.ms} ms from the first number above 0 to the last)`, normal.ms >= 1500 && normal.ms <= 2500, normal.ms);
    check('count-up: the panel keeps its height while counting', normal.heights.length === 1, normal.heights);
    await b.reducedMotion(true);
    const reduced = await countUp();
    await b.reducedMotion(false);
    check(`reduced motion: still counts up, shorter (${reduced.ms} ms vs ${normal.ms} ms), ends on the real numbers`,
      reduced.values.some((v) => v > 0 && v < top) && reduced.ms > 0 && reduced.ms < normal.ms * 0.7 && JSON.stringify(reduced.final) === JSON.stringify(inHtml), { reduced, normal: normal.ms });
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });

    // ---- 5. Readable over any photo: a pure white photo is the worst case for white text ----
    // The photo is hidden and its place painted white; the text is hidden; the brightest pixel behind each text is read.
    const lum = ([r, g, bl]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
    const worstContrast = async (label) => {
      await nav('/', 1500);
      const texts = await ev(`(() => {
        const art = document.querySelector('.home-hero-art'); art.style.background = '#fff'; art.querySelector('img').style.visibility = 'hidden';
        const out = [];
        for (const sel of ['.home-hero h1', '.home-hero-text p', '.fig-num', '.fig-label', '.fig-sub']) {
          const el = document.querySelector(sel); if (!el || getComputedStyle(el).display === 'none' || !el.getClientRects().length) continue;
          const r = el.getBoundingClientRect(); out.push({ sel, x: r.left, y: r.top, w: r.width, h: r.height, color: getComputedStyle(el).color });
        }
        document.querySelectorAll('.home-hero-text > *, .fig a > *').forEach((el) => { el.style.visibility = 'hidden'; });
        return out; })()`);
      await sleep(300);
      const out = [];
      for (const tx of texts) {
        const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: tx.x, y: tx.y, width: Math.max(1, tx.w), height: Math.max(1, tx.h), scale: 1 } });
        const { data: px, info } = await sharp(Buffer.from(data, 'base64')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        let bright = [0, 0, 0], max = -1;
        for (let i = 0; i < px.length; i += info.channels) { const c = [px[i], px[i + 1], px[i + 2]]; const L = lum(c); if (L > max) { max = L; bright = c; } }
        const [r, g, bl, a = 1] = (tx.color.match(/[\d.]+/g) || []).map(Number);
        const fg = [r, g, bl].map((v, k) => v * a + bright[k] * (1 - a));
        const L1 = lum(fg), L2 = lum(bright);
        out.push({ sel: tx.sel, ratio: Math.round((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05) * 10) / 10 });
      }
      const low = out.filter((o) => o.ratio < 4.5);
      check(`${label}: every hero text keeps >= 4.5:1 even over a white photo (lowest ${Math.min(...out.map((o) => o.ratio))}:1)`, out.length >= 4 && low.length === 0, out);
    };
    await worstContrast('1280px');

    // ---- 6. Phones: the figures become a row of 3 under the button ----
    await viewport(390, 844);
    await worstContrast('390px');
    await nav('/', 1500);
    const phone = await ev(`(() => { const figs = [...document.querySelectorAll('.fig')].map((f) => f.getBoundingClientRect());
      const btn = document.querySelector('.home-hero .btn').getBoundingClientRect(), panel = document.querySelector('[data-hero-figures]').getBoundingClientRect();
      return { wide: document.documentElement.scrollWidth, oneRow: new Set(figs.map((r) => Math.round(r.top))).size === 1, under: panel.top >= btn.bottom, right: Math.round(panel.right),
        cover: (() => { const h = document.querySelector('.home-hero').getBoundingClientRect(), i = document.querySelector('.home-hero-art img').getBoundingClientRect(); return Math.round(h.height) === Math.round(i.height) && Math.round(h.width) === Math.round(i.width); })() }; })()`);
    check('390px: no sideways scroll; the figures are one row under the button, inside the screen; the photo still fills the section',
      phone.wide <= 390 && phone.oneRow && phone.under && phone.right <= 390 - 12 && phone.cover, phone);
    await shot('hero-390');
    await viewport(1280);
    await b.setCookie('theme', 'dark');
    await nav('/', 1800);
    await shot('hero-1280-dark');
    await b.setCookie('theme', 'light');

    // ---- 7. Printing: text, the figures as one plain line, then the photo ----
    await b.printMedia(true); await sleep(200);
    const printed = await ev(`(() => { const p = document.querySelector('[data-hero-figures]'), cs = getComputedStyle(p), art = document.querySelector('.home-hero-art');
      return { opacity: cs.opacity, glass: cs.backdropFilter, bg: cs.backgroundColor, art: getComputedStyle(art).position, artBelow: art.getBoundingClientRect().top >= p.getBoundingClientRect().bottom,
        numColor: getComputedStyle(document.querySelector('.fig-num')).color, icons: getComputedStyle(document.querySelector('.fig-icon')).display }; })()`);
    await b.printMedia(false);
    check('print: figures shown as plain dark text (no glass, no icons), the photo below them in the page flow',
      printed.opacity === '1' && printed.glass === 'none' && printed.bg === 'rgba(0, 0, 0, 0)' && printed.art === 'static' && printed.artBelow && printed.icons === 'none' && printed.numColor !== 'rgb(255, 255, 255)', printed);
  });

  await part(b, 'back link', async () => {
    const evaluate = ev;
    const eq = (label, actual, expected) => check(`${label}: ${JSON.stringify(actual)}`, actual === expected, { expected });
    const navigate = (url) => b.nav(url, 150);
    const clickAndWait = async (selector) => {
      const loaded = waitLoad();
      const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
      if (!ok) throw new Error('No element for ' + selector + ' on ' + await evaluate('location.href'));
      await loaded; await sleep(150);
    };
    const state = () => evaluate(`({ path: location.pathname + location.search, lang: document.documentElement.lang, back: (document.querySelector('.hero-back') || {}).getAttribute ? document.querySelector('.hero-back').getAttribute('href') : null })`);

    // Flow 1: header -> Dự án tham khảo -> project -> switch to EN -> Back
    await navigate(`${BASE}/?lang=vi`);
    await clickAndWait('a[href="/giai-phap/du-an"]');
    await clickAndWait('a.card[href^="/giai-phap/du-an/"]');
    let s = await state();
    eq('project detail: back href', s.back, '/giai-phap/du-an');
    await clickAndWait('.lang-switch a[href*="lang=en"]');
    s = await state();
    eq('after VI->EN: page lang', s.lang, 'en');
    eq('after VI->EN: back href still list', s.back, '/giai-phap/du-an');
    await clickAndWait('.hero-back');
    s = await state();
    eq('Back lands on the project list', s.path, '/giai-phap/du-an');
    eq('the list keeps EN', s.lang, 'en');
    await clickAndWait('a.card[href^="/giai-phap/du-an/"]');
    s = await state();
    eq('open another project: back href', s.back, '/giai-phap/du-an');

    // Flow 2: home -> featured project -> Back returns home
    await navigate(`${BASE}/`);
    await clickAndWait('a.card[href^="/giai-phap/du-an/"]');
    s = await state();
    eq('project from home: back href', s.back, '/');
    await clickAndWait('.hero-back');
    s = await state();
    eq('Back lands on home', s.path, '/');

    // Flow 3: equipment list -> item -> EN->VI -> Back
    await navigate(`${BASE}/giai-phap/thiet-bi`);
    await clickAndWait('a.card[href^="/giai-phap/thiet-bi/"]');
    await clickAndWait('.lang-switch a[href*="lang=vi"]');
    s = await state();
    // the link returns to the tab of the item's part (#phan-N)
    check(`equipment after EN->VI: back href ${s.back} is the list, at the item's part`, /^\/giai-phap\/thiet-bi(#phan-\d+)?$/.test(s.back || ''), s);
    await clickAndWait('.hero-back');
    s = await state();
    eq('Back lands on the equipment list', s.path, '/giai-phap/thiet-bi');
    eq('the list keeps VI', s.lang, 'vi');

    // Flow 4: news list -> article -> Back
    await tempArticle('home');
    await navigate(`${BASE}/tin-tuc`);
    await clickAndWait('a.card[href^="/tin-tuc/"]');
    s = await state();
    eq('article: back href', s.back, '/tin-tuc');
    await clickAndWait('.hero-back');
    eq('Back lands on the news list', (await state()).path, '/tin-tuc');

    // Flow 5: home -> news -> article -> browser back -> another article -> Back returns to news
    await navigate(`${BASE}/`);
    await clickAndWait('a[href="/tin-tuc"]');
    await clickAndWait('a.card[href^="/tin-tuc/"]');
    {
      const loaded = waitLoad().catch(() => {});
      await evaluate('history.back()');
      await Promise.race([loaded, sleep(1500)]); await sleep(200);
    }
    eq('browser back lands on the news list', (await state()).path, '/tin-tuc');
    await clickAndWait('a.card[href^="/tin-tuc/"]');
    s = await state();
    eq('article after browser back: back href', s.back, '/tin-tuc');
    await clickAndWait('.hero-back');
    eq('Back lands on the news list again', (await state()).path, '/tin-tuc');
    const trail = await evaluate(`sessionStorage.getItem('mtgTrail')`);
    eq('the trail ends home -> news', JSON.parse(trail).slice(-2).join(' > '), '/ > /tin-tuc');

    // Flow 6: fresh tab (no trail) opened directly on a project -> falls back to the list
    const projectUrl = await evaluate(`fetch('/giai-phap/du-an').then(r => r.text()).then(t => t.match(/href="(\\/giai-phap\\/du-an\\/[a-f0-9]+)"/)[1])`);
    await evaluate('sessionStorage.clear()');
    await navigate(`${BASE}${projectUrl}`);
    s = await state();
    eq('direct visit: fallback back href', s.back, '/giai-phap/du-an');
  });
});
