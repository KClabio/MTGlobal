// Home page "Lĩnh vực hoạt động" row (layout, texts, sliding by itself and looping, stops under the mouse, ‹ › / wheel / keys,
// drag, "← Về trang chủ" keeps its place), the hero (photo as background, the figures panel and its count-up) and the "← Quay lại" back link on detail pages.
import { suite, part, check, db, BASE, appRequire, tempArticle } from './lib/index.mjs';

const { bannerFor } = appRequire('./lib/banners.js');
const { buildHomeDomains } = appRequire('./lib/home-domains.js');

await suite(async (b) => {
  const { send, ev, sleep } = b;
  const viewport = (w, h = 900) => b.viewport(w, h);
  const waitLoad = () => b.waitLoad();
  const shot = (name) => b.shot(name);

  // "Lĩnh vực hoạt động": 3½ cards in view sliding slowly to the right by themselves and looping, like the partner row
  // (public/js/main.js loopRow); stops under the mouse, ‹ › / the mouse wheel / ← → move one card, drag; the position
  // comes back with "← Về trang chủ".
  await part(b, 'home slider', async () => {
    const d = await db();
    const nav = (p) => b.nav(p, 500);
    const { mouse } = b;
    const ORIG = `[...document.querySelectorAll('[data-domain-slider] > .domain-item:not([data-domain-clone])')]`;
    // The row's shift (px), the loop's length W (one list + gap) and one step (card + gap)
    const geo = () => ev(`(() => { const s = document.querySelector('[data-domain-slider]'); const o = ${ORIG}; const m = getComputedStyle(s).transform;
      return { x: m === 'none' ? 0 : new DOMMatrix(m).m41, W: o[0].offsetLeft - s.firstElementChild.offsetLeft, step: o[1].offsetLeft - o[0].offsetLeft, y: Math.round(scrollY) }; })()`);
    const wrapDiff = (a, c, W) => { let x = (c - a) % W; if (x > W / 2) x -= W; if (x < -W / 2) x += W; return x; };
    const speedOver = async (ms) => { const a = await geo(); const t0 = Date.now(); await sleep(ms); const c = await geo(); return wrapDiff(a.x, c.x, a.W) / ((Date.now() - t0) / 1000); };
    const centre = (expr) => ev(`(() => { const r = (${expr}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const ROW = `document.querySelector('[data-domain-marquee]')`;
    const away = async () => { await mouse('mouseMoved', { x: 5, y: 5 }); };
    const press = async (p) => { await mouse('mousePressed', p, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', p, { button: 'left', buttons: 0, clickCount: 1 }); };
    const click = async (sel) => { const p = await centre(`document.querySelector('${sel}')`); await mouse('mouseMoved', p); await sleep(400); await press(p); };
    const bringIntoView = () => ev(`(() => { const s = document.getElementById('linh-vuc'); window.scrollTo(0, s.getBoundingClientRect().top + scrollY - 80); return true; })()`);
    // The card nearest a point of the row (real or copy: they look the same), and whether the window is always filled
    const cardAt = (frac) => ev(`(() => { const box = ${ROW}.getBoundingClientRect(); const x = box.left + box.width * ${frac};
      const t = [...document.querySelectorAll('[data-domain-slider] > .domain-item')].map((li) => ({ li, r: li.getBoundingClientRect() })).sort((a, z) => Math.abs((a.r.left + a.r.right) / 2 - x) - Math.abs((z.r.left + z.r.right) / 2 - x))[0];
      return t.li.querySelector('a').getAttribute('href'); })()`);
    const filled = () => ev(`(() => { const box = ${ROW}.getBoundingClientRect(); const s = document.querySelector('[data-domain-slider]').getBoundingClientRect(); return s.left <= box.left + 1 && s.right >= box.right - 1; })()`);
    await b.setCookie('theme', 'light');
    await b.reducedMotion(false);
    await b.viewport(1280);

    // ---- 1. Content: 7 cards once for screen readers and Tab; copies hidden ----
    await nav('/'); await bringIntoView(); await away(); await sleep(300);
    const cards = await ev(`${ORIG}.map((li) => li.querySelector('.domain-card')).map((a) => ({ href: a.getAttribute('href'), title: a.querySelector('h3').textContent.trim(), text: (a.querySelector('p') || {}).textContent || '', img: (a.querySelector('img') || {}).src || null }))`);
    check('7 area cards in menu order (one "Dịch vụ" card for all services), each linking with ?from=home', cards.length === 7 && JSON.stringify(cards.map((c) => c.href)) === JSON.stringify(['/san-pham', '/giai-phap/stem-lab', '/giai-phap/thiet-bi', '/giai-phap/workshop', '/giai-phap/dao-tao', '/giai-phap/tap-huan', '/dich-vu'].map((u) => u + '?from=home')), cards.map((c) => c.href));
    check('section title is "Lĩnh vực hoạt động"', (await ev(`document.querySelector('#linh-vuc .section-title').textContent.trim()`)) === 'Lĩnh vực hoạt động');
    // Screen readers: a named list ("Lĩnh vực hoạt động, list, 7 items"); the copies made for the loop are hidden from them and from Tab
    const a11y = await ev(`(() => { const t = document.querySelector('[data-domain-slider]'); const copies = [...t.querySelectorAll(':scope > [data-domain-clone]')];
      return { tag: t.tagName, role: t.getAttribute('role'), label: t.getAttribute('aria-label'), focusable: t.tabIndex === 0, items: t.querySelectorAll(':scope > li').length, real: ${ORIG}.length, copies: copies.length,
        copiesHidden: copies.every((c) => c.tagName === 'LI' && c.getAttribute('aria-hidden') === 'true' && c.querySelector('a').tabIndex === -1 && [...c.querySelectorAll('img')].every((i) => i.alt === '') && !c.inert),
        reachable: [...t.querySelectorAll('a')].filter((a) => !a.closest('[aria-hidden="true"]')).map((a) => a.getAttribute('href')),
        rows: new Set([...t.children].map((li) => Math.round(li.getBoundingClientRect().top))).size, wide: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
    check('slider read as a named list: <ul> without a role, "Lĩnh vực hoạt động" as its name, keyboard-focusable; one line; the 7 cards once (copies <li aria-hidden>, out of Tab); no sideways scroll',
      a11y.tag === 'UL' && a11y.role === null && a11y.label === 'Lĩnh vực hoạt động' && a11y.focusable && a11y.real === 7 && a11y.copies >= 7 && a11y.items === a11y.real + a11y.copies && a11y.copiesHidden
        && JSON.stringify(a11y.reachable) === JSON.stringify(cards.map((c) => c.href)) && a11y.rows === 1 && a11y.wide === 0, a11y);
    // Off-screen cards lazy-load, so check each picture over HTTP instead of waiting for the browser
    const imgs = [];
    for (const card of cards) imgs.push(card.img ? (await fetch(card.img)).headers.get('content-type')?.startsWith('image/') === true : 'art');
    check('all card photos load (Dịch vụ uses colour art until a service photo is uploaded)', JSON.stringify(imgs) === JSON.stringify([true, true, true, true, true, true, 'art']), imgs);
    // 3½ cards fill the window (the container's width)
    const ratio = () => ev(`(() => { const box = ${ROW}; const pad = parseFloat(getComputedStyle(box).paddingLeft); const inner = box.clientWidth - 2 * pad;
      const s = document.querySelector('[data-domain-slider]'); const w = ${ORIG}[0].getBoundingClientRect().width; const gap = parseFloat(getComputedStyle(s).columnGap);
      const c = document.querySelector('.domains-section .container'); const cs = getComputedStyle(c);
      return { perView: Math.round((inner + gap) / (w + gap) * 100) / 100, sameAsContainer: Math.abs(inner - (c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))) <= 1 }; })()`);
    let r = await ratio();
    check(`1280px: 3½ cards in view (${r.perView}), the row as wide as the page content`, Math.abs(r.perView - 3.5) < 0.05 && r.sameAsContainer, r);
    check('the ‹ › buttons are never disabled (a loop has no ends)', await ev(`!document.querySelector('[data-domain-prev]').disabled && !document.querySelector('[data-domain-next]').disabled`));
    await shot('slider-1280-light');

    // ---- 2. Text follows the banner lines / service summaries ----
    const settings = await d.collection('sitesettings').findOne({});
    const services = await d.collection('services').find({}).toArray();
    const expectText = (lang) => ['products', 'stem-lab', 'thiet-bi', 'workshop', 'dao-tao', 'tap-huan'].map((k) => bannerFor(settings, k, lang).subtitle)
      .concat([bannerFor(settings, 'services', lang).subtitle]);
    check('VI card texts = banner lines (the Dịch vụ card: the services banner line)', JSON.stringify(cards.map((c) => c.text.trim())) === JSON.stringify(expectText('vi')), cards.map((c) => c.text));
    await nav('/?lang=en'); await bringIntoView();
    const en = await ev(`({ title: document.querySelector('#linh-vuc .section-title').textContent.trim(), texts: ${ORIG}.map((li) => ((li.querySelector('p') || {}).textContent || '').trim()), titles: ${ORIG}.map((li) => li.querySelector('h3').textContent.trim()), prev: document.querySelector('[data-domain-prev]').getAttribute('aria-label') })`);
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

    // ---- 3. Slides to the right by itself, at the partner row's speed; half speed with reduced motion ----
    await nav('/'); await bringIntoView(); await away(); await sleep(800);
    const v = await speedOver(2000);
    check(`slides to the right by itself at about 24 px/s (${v.toFixed(1)})`, v > 18 && v < 30, v);
    let fills = true;
    for (let i = 0; i < 6; i++) { fills = fills && await filled(); await sleep(250); }
    check('while sliding the window is always filled (copies on both sides, no empty end)', fills);
    await b.reducedMotion(true);
    await nav('/'); await bringIntoView(); await away(); await sleep(800);
    const vSlow = await speedOver(2000);
    check(`reduced motion: still slides, at half speed (${vSlow.toFixed(1)} px/s)`, vSlow > 8 && vSlow < 16, vSlow);
    await b.reducedMotion(false);
    await nav('/'); await bringIntoView(); await away(); await sleep(800);

    // ---- 4. Stops under the mouse (cards and ‹ ›), carries on after ----
    await mouse('mouseMoved', await centre(ROW)); await sleep(700);
    const vRow = await speedOver(1000);
    await mouse('mouseMoved', await centre(`document.querySelector('[data-domain-next]')`)); await sleep(700);
    const vBtn = await speedOver(1000);
    await away(); await sleep(800);
    const vAfter = await speedOver(1000);
    check(`stops under the mouse (cards ${vRow.toFixed(1)}, buttons ${vBtn.toFixed(1)} px/s) and carries on afterwards (${vAfter.toFixed(1)} px/s)`, Math.abs(vRow) < 0.5 && Math.abs(vBtn) < 0.5 && vAfter > 15, { vRow, vBtn, vAfter });

    // ---- 5. ‹ one card right, › one card left; quick clicks add up; 7 × › comes round to the same card ----
    await mouse('mouseMoved', await centre(`document.querySelector('[data-domain-prev]')`)); await sleep(800); // stopped first
    let g0 = await geo();
    await click('[data-domain-prev]'); await sleep(700);
    let g1 = await geo();
    await click('[data-domain-next]'); await press(await centre(`document.querySelector('[data-domain-next]')`)); await sleep(800);
    const g2 = await geo();
    check(`‹ moves the row one card right (${wrapDiff(g0.x, g1.x, g0.W).toFixed(1)} px), two quick › two cards left (${wrapDiff(g1.x, g2.x, g0.W).toFixed(1)} px; a card is ${g0.step} px)`,
      Math.abs(wrapDiff(g0.x, g1.x, g0.W) - g0.step) < 1.5 && Math.abs(wrapDiff(g1.x, g2.x, g0.W) + 2 * g0.step) < 1.5, { g0, g1, g2 });
    g0 = await geo(); const first = await cardAt(0.15);
    fills = true;
    for (let i = 0; i < 7; i++) { await click('[data-domain-next]'); fills = fills && await filled(); }
    await sleep(900);
    g1 = await geo(); const again = await cardAt(0.15);
    check(`7 × › (one whole round): back to the same card (${first}) at the same place, the window filled all the way`,
      first && again === first && Math.abs(wrapDiff(g0.x, g1.x, g0.W)) < 1.5 && g1.x <= 0 && g1.x >= -g1.W && fills && await filled(), { first, again, g0, g1, fills });

    // ---- 6. Mouse wheel over the cards: one card per notch, the page stays put; over the title the page scrolls ----
    await mouse('mouseMoved', await centre(ROW)); await sleep(900);
    g0 = await geo();
    const c0 = await centre(ROW);
    await mouse('mouseWheel', c0, { deltaX: 0, deltaY: 100 }); await sleep(800);
    g1 = await geo();
    check(`one wheel notch down: the row moves one card left (${wrapDiff(g0.x, g1.x, g0.W).toFixed(1)} px), the page stays put`, Math.abs(wrapDiff(g0.x, g1.x, g0.W) + g0.step) < 1.5 && g1.y === g0.y, { g0, g1 });
    for (let i = 0; i < 5; i++) { await mouse('mouseWheel', c0, { deltaX: 0, deltaY: 100 }); await sleep(60); }
    await sleep(900);
    const g5 = await geo();
    check(`5 quick notches: five cards (${(g5.x - g1.x).toFixed(1)} px, wrapped round the loop; 5 cards = ${-5 * g0.step}), the page still put`, Math.abs(wrapDiff(g1.x - 5 * g0.step, g5.x, g0.W)) < 1.5 && g5.y === g0.y, { g1, g5 });
    await mouse('mouseWheel', c0, { deltaX: 0, deltaY: -100 }); await sleep(800);
    const gUp = await geo();
    check('one notch up: one card back to the right', Math.abs(wrapDiff(g5.x, gUp.x, g0.W) - g0.step) < 1.5 && gUp.y === g0.y, { g5, gUp });
    await mouse('mouseWheel', c0, { deltaX: 0, deltaY: 6 }); await sleep(600);
    check('a tiny trackpad step alone does not jump a card', Math.abs(wrapDiff(gUp.x, (await geo()).x, g0.W)) < 1.5);
    const tp = await centre(`document.querySelector('#linh-vuc .section-title')`);
    await mouse('mouseMoved', tp); await sleep(200);
    const yT = (await geo()).y;
    await mouse('mouseWheel', tp, { deltaX: 0, deltaY: 120 }); await sleep(500);
    check('wheel over the section title scrolls the page as usual', (await geo()).y > yT);

    // ---- 7. Keyboard: the list (Tab from ›) stops the row; ← / → move one card; Tab goes through the 7 real cards once, each shown whole ----
    await away(); await bringIntoView(); await sleep(400);
    await ev(`document.querySelector('[data-domain-next]').focus()`);
    const tab = async () => { await b.key('Tab', 'Tab', 9); await sleep(300); };
    await tab();
    const onList = await ev(`document.activeElement === document.querySelector('[data-domain-slider]')`);
    await sleep(700);
    const vList = await speedOver(800);
    const k0 = await geo();
    await b.key('ArrowRight', 'ArrowRight', 39); await sleep(700);
    const k1 = await geo();
    await b.key('ArrowLeft', 'ArrowLeft', 37); await sleep(700);
    const k2 = await geo();
    check(`the list reached with Tab stops the row (${vList.toFixed(1)} px/s) and shows a focus ring; → one card left, ← one card right; the page stays put`,
      onList && Math.abs(vList) < 0.5 && Math.abs(wrapDiff(k0.x, k1.x, k0.W) + k0.step) < 1.5 && Math.abs(wrapDiff(k1.x, k2.x, k0.W) - k0.step) < 1.5 && k2.y === k0.y
        && await ev(`getComputedStyle(${ROW}).outlineStyle !== 'none'`), { onList, vList, k0, k1, k2 });
    const inView = (i) => ev(`(() => { const box = ${ROW}; const pad = parseFloat(getComputedStyle(box).paddingLeft); const bx = box.getBoundingClientRect();
      const q = ${ORIG}[${i}].getBoundingClientRect(); return { inside: q.left >= bx.left + pad - 1 && q.right <= bx.right - pad + 1, scroll: box.scrollLeft, focused: document.activeElement === ${ORIG}[${i}].querySelector('a') }; })()`);
    const seen = [];
    for (let i = 0; i < 7; i++) { await tab(); seen.push(await inView(i)); }
    check('Tab then goes through the 7 real cards in order (copies skipped), each shown whole', seen.every((s) => s.focused && s.inside && s.scroll === 0), seen);
    const gF = await geo();
    await ev(`document.activeElement.blur()`); await sleep(100);
    const gB = await geo();
    await sleep(1200);
    const vBlur = await speedOver(1000);
    check('focus leaves: the row carries on from the same place (no jump)', Math.abs(wrapDiff(gF.x, gB.x, gF.W)) < 1.5 && vBlur > 15, { gF, gB, vBlur });

    // ---- 8. Drag: the row follows the mouse; a drag doesn't open a card; a plain click on any card (copies too) does ----
    const MIDDLE = `(() => { const box = ${ROW}.getBoundingClientRect(); const mid = (box.left + box.right) / 2;
      return [...document.querySelectorAll('[data-domain-slider] > .domain-item')].map((li) => ({ li, r: li.getBoundingClientRect() }))
        .sort((a, z) => Math.abs((a.r.left + a.r.right) / 2 - mid) - Math.abs((z.r.left + z.r.right) / 2 - mid))[0].li; })()`;
    await mouse('mouseMoved', await centre(MIDDLE)); await sleep(800);
    const p = await centre(MIDDLE);
    await mouse('mouseMoved', p); await sleep(100);
    const d0 = await geo();
    await mouse('mousePressed', p, { button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 10; i++) { await mouse('mouseMoved', { x: p.x - i * 20, y: p.y }, { buttons: 1 }); await sleep(16); }
    await mouse('mouseReleased', { x: p.x - 200, y: p.y }, { button: 'left', buttons: 0, clickCount: 1 }); await sleep(300);
    const d1 = await geo();
    check(`drag: the row follows the mouse (${wrapDiff(d0.x, d1.x, d0.W).toFixed(1)} px for -200) and no card opened`, Math.abs(wrapDiff(d0.x, d1.x, d0.W) + 200) < 4 && await ev('location.pathname') === '/', { d0, d1 });
    // A copy on screen opens its page like the real card
    const copy = await ev(`(() => { const box = ${ROW}.getBoundingClientRect(); const c = [...document.querySelectorAll('[data-domain-slider] > [data-domain-clone]')].map((li) => ({ li, r: li.getBoundingClientRect() }))
      .find((o) => o.r.left >= box.left + 20 && o.r.right <= box.right - 20); if (!c) return null; return { x: c.r.left + c.r.width / 2, y: c.r.top + 60, href: c.li.querySelector('a').getAttribute('href') }; })()`);
    if (copy) {
      await mouse('mouseMoved', copy); await sleep(300);
      let l = waitLoad(); await press(copy); await l; await sleep(300);
      check(`a click on a copy opens its page (${copy.href})`, await ev('location.pathname + location.search') === copy.href);
    } else check('a copy is on screen to click', false, 'no copy fully in view');

    // ---- 9. Card → page with "← Về trang chủ" → back to the row at the same spot ----
    await nav('/'); await bringIntoView(); await away(); await sleep(300);
    // The Tập huấn card fully in view (real or copy: they look the same, and the real one is mostly off-screen, as on the partner row)
    const tapHuan = `(() => { const bx = ${ROW}.getBoundingClientRect(); return [...document.querySelectorAll('[data-domain-slider] > .domain-item')].find((li) => { const q = li.getBoundingClientRect(); return li.querySelector('a').getAttribute('href') === '/giai-phap/tap-huan?from=home' && q.left >= bx.left + 30 && q.right <= bx.right - 30; }); })()`;
    // Bring a Tập huấn card fully into view with ›, under the mouse (the row stands still)
    await mouse('mouseMoved', await centre(`document.querySelector('[data-domain-next]')`)); await sleep(800);
    for (let i = 0; i < 12 && !(await ev(`!!${tapHuan}`)); i++) { await click('[data-domain-next]'); await sleep(500); }
    const pt = await centre(tapHuan);
    await mouse('mouseMoved', pt); await sleep(400);
    const savedX = (await geo()).x;
    let l = waitLoad(); await press(pt); await l; await sleep(400);
    let page = await ev(`({ url: location.pathname + location.search, back: (document.querySelector('[data-back-home]') || {}).textContent, href: (document.querySelector('[data-back-home]') || { getAttribute: () => null }).getAttribute('href'), oldBack: !!document.querySelector('[data-back]') })`);
    check('card opens /giai-phap/tap-huan?from=home with "← Về trang chủ" → /#linh-vuc', page.url === '/giai-phap/tap-huan?from=home' && /Về trang chủ/.test(page.back) && page.href === '/#linh-vuc' && !page.oldBack, page);
    await shot('back-link-tap-huan');
    // Language switch keeps it
    l = waitLoad(); await b.clickAt('.lang-switch a[hreflang="en"], .lang-switch a:last-child'); await l; await sleep(400);
    page = await ev(`({ url: location.pathname + location.search, back: (document.querySelector('[data-back-home]') || {}).textContent })`);
    check('after VI → EN the link stays: "← Back to home"', /from=home/.test(page.url) && /Back to home/.test(page.back), page);
    l = waitLoad(); await send('Page.reload'); await l; await sleep(300);
    check('after a reload the link stays', !!(await ev(`!!document.querySelector('[data-back-home]')`)));
    l = waitLoad(); await b.clickAt('.lang-switch a[hreflang="vi"], .lang-switch a:first-child'); await l; await sleep(300);
    // Back to the home page section: the row starts where it was (it then carries on sliding)
    l = waitLoad(); await ev(`document.querySelector('[data-back-home]').click()`); await l;
    const home = await ev(`(() => { const s = document.getElementById('linh-vuc').getBoundingClientRect(); const m = getComputedStyle(document.querySelector('[data-domain-slider]')).transform; return { url: location.pathname + location.hash, sectionTop: Math.round(s.top), x: m === 'none' ? 0 : new DOMMatrix(m).m41 }; })()`);
    const W0 = (await geo()).W;
    check(`"Về trang chủ" lands on the section with the row where it was (${wrapDiff(savedX, home.x, W0).toFixed(1)} px apart)`, home.url === '/#linh-vuc' && home.sectionTop >= -10 && home.sectionTop < 200 && Math.abs(wrapDiff(savedX, home.x, W0)) < 30, { home, savedX });
    await away(); await sleep(1000);
    check('… and carries on sliding', (await speedOver(1000)) > 15);

    // ---- 10. No back link when the page is reached any other way ----
    for (const pg of ['/giai-phap/tap-huan', '/san-pham', '/giai-phap/thiet-bi', '/dich-vu/tu-van-du-hoc']) {
      await nav(pg);
      check(`${pg} opened directly: no "Về trang chủ" link`, !(await ev(`!!document.querySelector('[data-back-home]')`)));
    }
    await nav('/');
    l = waitLoad(); await ev(`document.querySelector('.nav-dropdown-menu a[href="/giai-phap/workshop"]').click()`); await l; await sleep(300);
    check('workshop opened from the menu: no "Về trang chủ" link', !(await ev(`!!document.querySelector('[data-back-home]')`)));
    const pid = (await d.collection('projects').findOne({}))._id;
    await nav(`/giai-phap/du-an/${pid}`);
    check('project detail still has the usual "← Quay lại" and no home link', await ev(`!!document.querySelector('[data-back]') && !document.querySelector('[data-back-home]')`));

    // ---- 11. Responsive + dark ----
    await viewport(1100); await nav('/'); await bringIntoView(); await sleep(300);
    r = await ratio();
    check(`1100px: 2½ cards in view (${r.perView})`, Math.abs(r.perView - 2.5) < 0.05 && r.sameAsContainer, r);
    await viewport(390, 844); await nav('/'); await bringIntoView(); await away(); await sleep(300);
    r = await ratio();
    const wide = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
    check(`390px: 1¼ cards in view (${r.perView}), no sideways page scroll, still sliding`, Math.abs(r.perView - 1.25) < 0.05 && wide === 0 && (await speedOver(1000)) > 15, { r, wide });
    await shot('slider-390');
    await viewport(1280);
    await b.setCookie('theme', 'dark');
    await nav('/'); await bringIntoView(); await sleep(300);
    await shot('slider-1280-dark');
    await b.setCookie('theme', 'light');
    await b.reducedMotion(true);
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

    // ---- 3b. The menu bar: see-through everywhere; on Trang chủ the photo reaches up behind it ----
    const alpha = (c) => { const m = c.match(/\/\s*([\d.]+)\)|rgba\([^)]*,\s*([\d.]+)\)/); return m ? Number(m[1] || m[2]) : 1; };
    const bar = () => ev(`(() => { const h = document.getElementById('siteHeader'); const r = h.getBoundingClientRect(); const hero = document.querySelector('.home-hero');
      return { over: h.classList.contains('is-over-hero'), glass: getComputedStyle(h, '::before').backgroundColor, blur: getComputedStyle(h, '::before').backdropFilter, own: getComputedStyle(h).backgroundColor,
        heroUnder: hero ? hero.getBoundingClientRect().top <= r.top + 1 : null, link: (document.querySelector('.main-nav > a') ? getComputedStyle(document.querySelector('.main-nav > a')).color : null) }; })()`);
    const atTop = await bar();
    await ev(`window.scrollTo(0, document.querySelector('.home-hero').getBoundingClientRect().bottom + scrollY)`); await sleep(400);
    const scrolled = await bar();
    await ev('window.scrollTo(0, 0)'); await sleep(300);
    check('Trang chủ, top: the photo reaches up under the menu bar, which is dark see-through glass with white menu text',
      atTop.over && atTop.heroUnder && atTop.own === 'rgba(0, 0, 0, 0)' && alpha(atTop.glass) < 0.5 && /blur/.test(atTop.blur) && atTop.link === 'rgb(255, 255, 255)', atTop);
    check('Trang chủ, scrolled past the photo: the light frosted bar (see-through, blurred), dark menu text',
      !scrolled.over && alpha(scrolled.glass) > 0.6 && alpha(scrolled.glass) < 1 && /blur/.test(scrolled.blur) && scrolled.link !== 'rgb(255, 255, 255)', scrolled);
    await nav('/lien-he', 300);
    const other = await bar();
    check('other pages: the light frosted bar from the start, the page starts below it', !other.over && alpha(other.glass) > 0.6 && alpha(other.glass) < 1 && other.heroUnder === null && !(await ev(`document.documentElement.hasAttribute('data-page')`)), other);

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
        for (const sel of ['.home-hero h1', '.home-hero-text p', '.fig-num', '.fig-label', '.fig-sub', '.main-nav > a', '.header-actions .btn-ghost']) {
          const el = document.querySelector(sel); if (!el || getComputedStyle(el).display === 'none' || !el.getClientRects().length) continue;
          const r = el.getBoundingClientRect(); out.push({ sel, x: r.left, y: r.top, w: r.width, h: r.height, color: getComputedStyle(el).color });
        }
        document.querySelectorAll('.home-hero-text > *, .fig a > *, .main-nav > a, .header-actions .btn-ghost').forEach((el) => { el.style.visibility = 'hidden'; });
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
