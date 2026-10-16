// Header menus (hover-only dropdowns, clickable group titles, keyboard, account menu, phone drawer)
// and the light/dark switches (guest header, account menu, admin), shared preference, admin toasts, dark-mode contrast.
import { suite, part, check, createUser, restoreLater } from './lib/index.mjs';

await suite(async (b) => {
  const { send, ev, sleep } = b;
  const user = await createUser('nav', 'customer');
  const admin = await createUser('theme', 'admin');
  await restoreLater('services', {}); // the toast check moves a service with the keyboard and back

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
    const shown = (i) => ev(`(() => { const d = document.querySelectorAll('.main-nav .nav-dropdown')[${i}]; const m = d.querySelector('.nav-dropdown-menu'); return { shown: getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().height > 0, aria: d.querySelector('.nav-dropdown-trigger').getAttribute('aria-expanded'), inline: m.getAttribute('style') }; })()`);
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

    // Account menu (logged in)
    await b.login(user.sid);
    await nav('/'); await away();
    const um = () => ev(`getComputedStyle(document.querySelector('.user-menu-dropdown')).display !== 'none'`);
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
    await b.clearCookie('connect.sid');

    // Phone drawer
    await viewport(390, 844);
    await nav('/');
    await ev(`document.getElementById('navToggle').click()`); await sleep(200);
    const drawer = await ev(`({ menus: [...document.querySelectorAll('.main-nav .nav-dropdown-menu')].map((m) => getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().height > 0), titles: [...document.querySelectorAll('.nav-dropdown-trigger')].map((a) => a.getAttribute('href') + ':' + (a.getBoundingClientRect().height > 0)) })`);
    check('phone: the ☰ drawer lists all 3 submenus, with the titles as visible links', drawer.menus.length === 3 && drawer.menus.every(Boolean) && JSON.stringify(drawer.titles) === '["/san-pham:true","/giai-phap:true","/dich-vu:true"]', drawer);
    const tp = await center('.main-nav .nav-dropdown:nth-of-type(2) .nav-dropdown-trigger');
    { const l = waitLoad();
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tp.x, y: tp.y }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await l; await sleep(250); }
    check('phone: tapping a section title opens its landing page (/giai-phap)', (await ev('location.pathname')) === '/giai-phap');
    const l = waitLoad(); await ev(`document.querySelector('.main-nav a[href="/giai-phap/workshop"]').click()`); await l;
    check('phone: a submenu link opens its page', (await ev('location.pathname')) === '/giai-phap/workshop');
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
    await sleep(400);
    check('close button hides the toast', await ev(`document.getElementById('adminToast').hidden`));
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
    for (const [p, name, w] of [['/', 'theme-home-dark', 1280], ['/admin/robot', 'theme-admin-list-dark', 1280], ['/', 'theme-home-dark-mobile', 390]]) {
      await nav(p);
      await shot(name, w);
    }
  });
});
