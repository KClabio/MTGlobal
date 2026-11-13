// Zalo / Facebook page chat button (partials/chat-button.ejs, lib/chat-links.js): set in Admin → Thông tin công ty, shown
// at the bottom right of public pages (one link: a plain link; two: a small menu), also in the footer and on Liên hệ.
// Keyboard, phone width, the phone menu drawer, dark mode, print and reduced motion.
import { suite, part, check, db, BASE, createUser, restoreLater, sleep } from './lib/index.mjs';

await suite(async (b) => {
  const { ev } = b;
  const d = await db();
  const [settingsBackup] = await restoreLater('sitesettings', {});
  const admin = await createUser('chat-admin');
  const ci = settingsBackup.contactInfo || {};
  // Thông tin công ty, as the admin form sends it (the other boxes as they are)
  const saveContact = (zalo, messenger) => fetch(BASE + '/admin/thong-tin-cong-ty', { method: 'POST', redirect: 'manual', headers: { cookie: `connect.sid=${admin.sid}` },
    body: new URLSearchParams({ companyProfile: settingsBackup.companyProfile || '', companyProfileEn: settingsBackup.companyProfileEn || '', address: ci.address || '', phone: ci.phone || '', email: ci.email || '', mapEmbedUrl: ci.mapEmbedUrl || '',
      privacyPolicy: settingsBackup.privacyPolicy || '', privacyPolicyEn: settingsBackup.privacyPolicyEn || '', zalo, messenger }) });
  const html = async (path, lang = 'vi') => (await fetch(BASE + path, { headers: { cookie: `lang=${lang}` } })).text();

  try {
    await part(b, 'Thông tin công ty → Zalo and the Facebook page', async () => {
      let r = await saveContact('', '');
      check('both empty → no chat button, nothing in the footer', r.status === 302 && !(await html('/')).includes('data-chat-fab') && !(await html('/')).includes('data-footer-chat'));
      check('… and no Zalo / Facebook buttons on Liên hệ', !(await html('/lien-he')).includes('data-contact-chat'));
      // The page's address as copied from the browser, with Facebook's ?locale=… at the end
      r = await saveContact('0912 345 678', 'https://www.facebook.com/mtg.vn/?locale=vi_VN');
      const saved = (await d.collection('sitesettings').findOne({})).contactInfo;
      check('saved cleaned: Zalo "0912345678", Facebook page "mtg.vn" (no ?locale)', saved.zalo === '0912345678' && saved.messenger === 'mtg.vn', saved);
      const form = await (await fetch(BASE + '/admin/thong-tin-cong-ty', { headers: { cookie: `connect.sid=${admin.sid}; adminLang=vi` } })).text();
      check('the admin form shows them with their labels', form.includes('<label for="zalo">Số Zalo</label>') && form.includes('value="0912345678"') && form.includes('value="mtg.vn"'));
      // A save without these boxes (an older form, or another test's restore) keeps them
      await fetch(BASE + '/admin/thong-tin-cong-ty', { method: 'POST', redirect: 'manual', headers: { cookie: `connect.sid=${admin.sid}` }, body: new URLSearchParams({ companyProfile: settingsBackup.companyProfile || '', address: ci.address || '', phone: ci.phone || '', email: ci.email || '' }) });
      check('a save without the chat boxes keeps them', (await d.collection('sitesettings').findOne({})).contactInfo.zalo === '0912345678');
      const page = await html('/lien-he');
      check('footer and Liên hệ: "Nhắn qua Zalo" / "Trang Facebook", opening in a new tab',
        page.includes('href="https://zalo.me/0912345678" target="_blank" rel="noopener" data-footer-chat="zalo">Nhắn qua Zalo</a>')
        && page.includes('href="https://www.facebook.com/mtg.vn" target="_blank" rel="noopener" data-footer-chat="facebook">Trang Facebook</a>')
        && /data-contact-chat>[\s\S]*?href="https:\/\/www\.facebook\.com\/mtg\.vn"/.test(page));
      const enPage = await html('/lien-he', 'en'), homeVi = await html('/');
      check('no Messenger left: no "Messenger" and no m.me link on Trang chủ and Liên hệ (VI + EN)',
        [page, enPage, homeVi, await html('/', 'en')].every((h) => !/Messenger|m\.me\//.test(h)) && enPage.includes('data-footer-chat="facebook">Facebook page</a>'));
      check('Google company card: the Facebook page among its links', JSON.parse(homeVi.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1]).sameAs.includes('https://www.facebook.com/mtg.vn'));
      check('admin pages have no chat button', !form.includes('data-chat-fab'));
    });

    await part(b, 'two links: a small menu', async () => {
      await b.viewport(1280, 900);
      await b.nav('/', 300);
      const closed = await ev(`(() => { const f = document.querySelector('[data-chat-fab]'); const r = f.getBoundingClientRect(); return { tag: f.tagName, expanded: f.getAttribute('aria-expanded'), name: f.getAttribute('aria-label'), menuHidden: document.querySelector('[data-chat-menu]').hidden, right: innerWidth - r.right, bottom: innerHeight - r.bottom, w: r.width, pos: getComputedStyle(f.closest('[data-chat]')).position }; })()`);
      check('a round button at the bottom right, named "Nhắn tin cho MTG", menu closed', closed.tag === 'BUTTON' && closed.name === 'Nhắn tin cho MTG' && closed.expanded === 'false' && closed.menuHidden && closed.pos === 'fixed' && closed.right >= 16 && closed.right <= 24 && closed.bottom >= 16 && closed.bottom <= 24 && closed.w === 56, closed);
      await ev(`document.querySelector('[data-chat-fab]').focus()`);
      // Enter on the button (with its key text, as a keyboard sends it, so the button is pressed)
      await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await sleep(250);
      const open = await ev(`(() => { const m = document.querySelector('[data-chat-menu]'); return { hidden: m.hidden, expanded: document.querySelector('[data-chat-fab]').getAttribute('aria-expanded'), focus: document.activeElement.getAttribute('href'), links: [...m.querySelectorAll('a')].map((a) => [a.textContent.replace(/\\s+/g, ' ').trim(), a.getAttribute('href'), a.target]) }; })()`);
      check('Enter opens it: Zalo then the Facebook page, focus on the first', !open.hidden && open.expanded === 'true' && open.focus === 'https://zalo.me/0912345678'
        && JSON.stringify(open.links) === JSON.stringify([['Nhắn qua Zalo (mở trong thẻ mới)', 'https://zalo.me/0912345678', '_blank'], ['Trang Facebook (mở trong thẻ mới)', 'https://www.facebook.com/mtg.vn', '_blank']]), open);
      const logos = await ev(`(() => { const ls = [...document.querySelectorAll('[data-chat-menu] a')].map((a) => [...a.querySelectorAll('svg')]);
        return { each: ls.map((s) => s.length === 1 && s[0].matches('.chat-logo[aria-hidden="true"]') && s[0].getBoundingClientRect().width === 28), zalo: ls[0][0].querySelector('rect') && ls[0][0].querySelector('rect').getAttribute('fill'),
          facebook: ls[1][0].matches('.chat-logo--facebook') && ls[1][0].querySelector('path').getAttribute('fill'), disc: !!ls[1][0].querySelector('circle[fill="#fff"]'),
          gradients: document.querySelectorAll('[data-chat-menu] linearGradient').length }; })()`);
      check('each link shows its real logo (hidden from screen readers): Zalo on its blue tile, the blue Facebook mark with a white "f"', logos.each.every(Boolean) && logos.zalo === '#0068ff' && logos.facebook === '#0866ff' && logos.disc && logos.gradients === 0, logos);
      await b.shot('chat-menu');
      await b.key('Escape', 'Escape', 27);
      await sleep(150);
      check('Esc closes it and gives the focus back to the button', await ev(`document.querySelector('[data-chat-menu]').hidden && document.activeElement === document.querySelector('[data-chat-fab]') && document.querySelector('[data-chat-fab]').getAttribute('aria-expanded') === 'false'`));
      await ev(`document.querySelector('[data-chat-fab]').click()`);
      await ev(`document.querySelector('main').click()`);
      check('a click elsewhere closes it', await ev(`document.querySelector('[data-chat-menu]').hidden`));
      await ev(`document.querySelector('[data-chat-fab]').focus()`);
      check('the button shows the focus ring', await ev(`getComputedStyle(document.querySelector('[data-chat-fab]')).outlineStyle !== 'none' || !document.querySelector('[data-chat-fab]').matches(':focus-visible')`));
    });

    await part(b, 'phone width, drawer, dark mode, print, reduced motion', async () => {
      await b.viewport(390, 844);
      await b.nav('/san-pham/robot-cat-co', 300);
      const phone = await ev(`(() => { const r = document.querySelector('[data-chat-fab]').getBoundingClientRect(); return { inside: r.right <= innerWidth && r.bottom <= innerHeight, wide: document.documentElement.scrollWidth <= innerWidth }; })()`);
      check('phone: the button sits inside the screen, no sideways scroll', phone.inside && phone.wide, phone);
      const burger = await ev(`!!document.querySelector('.nav-toggle')`);
      if (burger) {
        await ev(`document.querySelector('.nav-toggle').click()`);
        await sleep(400);
        check('the phone menu drawer hides the chat button', await ev(`document.body.classList.contains('nav-open') && getComputedStyle(document.querySelector('[data-chat]')).display === 'none'`));
        await ev(`document.querySelector('.nav-toggle').click()`);
        await sleep(400);
      }
      await b.shot('chat-phone');
      await b.setCookie('theme', 'dark');
      await b.reducedMotion(true);
      await b.viewport(1280, 900);
      await b.nav('/', 300);
      await ev(`document.querySelector('[data-chat-fab]').click()`);
      await sleep(200);
      const dark = await ev(`(() => { const m = document.querySelector('[data-chat-menu]'); const a = m.querySelector('.chat-link'); return { open: !m.hidden, bg: getComputedStyle(m).backgroundColor, text: getComputedStyle(a).color }; })()`);
      check('dark mode with reduced motion: the menu opens, dark panel with light text', dark.open && dark.bg !== 'rgb(255, 255, 255)' && dark.text !== 'rgb(26, 32, 44)', dark);
      await b.shot('chat-menu-dark');
      await b.reducedMotion(false);
      await b.setCookie('theme', 'light');
      await b.printMedia(true);
      check('printing: no chat button', await ev(`getComputedStyle(document.querySelector('[data-chat]')).display === 'none'`));
      await b.printMedia(false);
    });

    await part(b, 'Liên hệ: the buttons under the form, each with its logo', async () => {
      await b.viewport(1280, 900);
      await b.nav('/lien-he', 300);
      const lay = await ev(`(() => {
        const chat = document.querySelector('[data-contact-chat]'), form = document.querySelector('[data-quote-form]');
        const after = !!(chat && form && (form.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING));
        const btn = (k) => { const a = document.querySelector('[data-contact-chat-link="' + k + '"]'); if (!a) return null; const s = a.querySelector('svg.chat-logo--' + k + '[aria-hidden="true"]'); const r = s && s.getBoundingClientRect(), ar = a.getBoundingClientRect();
          return { logo: !!s, w: r && Math.round(r.width), text: a.textContent.replace(/\\s+/g, ' ').trim(), h: Math.round(ar.height), logoFirst: a.firstElementChild === s, brand: k === 'facebook' ? !!(s && s.querySelector('path[fill="#0866ff"]')) : true }; };
        return { after, zalo: btn('zalo'), facebook: btn('facebook') };
      })()`);
      check('the Zalo / Facebook buttons come after the request form', lay.after, lay);
      check('"Nhắn qua Zalo" starts with the Zalo logo (20 px), "Trang Facebook" with the blue Facebook logo',
        lay.zalo && lay.zalo.logo && lay.zalo.logoFirst && lay.zalo.w === 20 && lay.facebook && lay.facebook.logo && lay.facebook.logoFirst && lay.facebook.w === 20 && lay.facebook.brand, lay);
      check('… the spoken names stay "Nhắn qua Zalo (mở trong thẻ mới)" (the logo is hidden from screen readers), and each button is at least 24 px high',
        lay.zalo.text === 'Nhắn qua Zalo (mở trong thẻ mới)' && lay.facebook.text === 'Trang Facebook (mở trong thẻ mới)' && lay.zalo.h >= 24 && lay.facebook.h >= 24, lay);
      check('… the phone and email lines stay above the form (only the chat buttons moved)', await ev(`(() => { const form = document.querySelector('[data-quote-form]'); const chat = document.querySelector('[data-contact-chat]'); return !chat.contains(form) && !document.querySelector('.container > div [data-contact-chat]'); })()`));
      for (const theme of ['light', 'dark']) {
        await b.setCookie('theme', theme);
        await b.viewport(390, 844);
        await b.nav('/lien-he', 300);
        await ev(`document.querySelector('[data-contact-chat]').scrollIntoView({ block: 'center' })`);
        const fit = await ev(`({ page: document.documentElement.scrollWidth, right: Math.max(...[...document.querySelectorAll('[data-contact-chat] a')].map((a) => a.getBoundingClientRect().right)) })`);
        check(`[${theme}] 390 px: the buttons fit the screen`, fit.page <= 390 && fit.right <= 390, fit);
        await b.shot(`contact-chat-390-${theme}`);
      }
      await b.setCookie('theme', 'light');
      await b.viewport(1280, 900);
    });

    await part(b, 'one link: the button opens it', async () => {
      await saveContact('', 'mtg.vn');
      const contactOne = await html('/lien-he');
      check('Liên hệ with only the Facebook page set: one button, with the Facebook logo', !contactOne.includes('data-contact-chat-link="zalo"') && /data-contact-chat-link="facebook"><svg class="chat-logo chat-logo--facebook/.test(contactOne));
      await b.nav('/', 300);
      const one = await ev(`(() => { const f = document.querySelector('[data-chat-fab]'); return { tag: f.tagName, href: f.getAttribute('href'), target: f.target, name: f.getAttribute('aria-label'), menu: !!document.querySelector('[data-chat-menu]'),
        logo: !!f.querySelector('svg.chat-logo--facebook[aria-hidden="true"] path[fill="#fff"]'), bg: getComputedStyle(f).backgroundColor }; })()`);
      check('only the Facebook page set → the button is a plain link to it, named "Trang Facebook (mở trong thẻ mới)"', one.tag === 'A' && one.href === 'https://www.facebook.com/mtg.vn' && one.target === '_blank' && one.name === 'Trang Facebook (mở trong thẻ mới)' && !one.menu, one);
      check('… showing the white Facebook logo on Facebook blue', one.logo && one.bg === 'rgb(8, 102, 255)', one);
      await b.shot('chat-one-link');
      const en = await html('/', 'en');
      check('in English: "Facebook page (opens in a new tab)"', en.includes('aria-label="Facebook page (opens in a new tab)"'));
    });

    // The company phone box with two numbers: shown side by side as "0988460556 - 0333601279", each its own call link
    await part(b, 'company phone: two numbers side by side', async () => {
      const PHONES = '0988460556 - 0333601279';
      const r = await fetch(BASE + '/admin/thong-tin-cong-ty', { method: 'POST', redirect: 'manual', headers: { cookie: `connect.sid=${admin.sid}` },
        body: new URLSearchParams({ companyProfile: settingsBackup.companyProfile || '', companyProfileEn: settingsBackup.companyProfileEn || '', address: ci.address || '', phone: PHONES, email: ci.email || '', mapEmbedUrl: ci.mapEmbedUrl || '', zalo: ci.zalo || '', messenger: ci.messenger || '' }) });
      check('saved as typed', r.status === 302 && (await d.collection('sitesettings').findOne({})).contactInfo.phone === PHONES);
      const both = /<a href="tel:0988460556">0988460556<\/a> - <a href="tel:0333601279">0333601279<\/a>/;
      const home = await html('/');
      check('footer: "0988460556 - 0333601279", each number its own call link', both.test(home) && !home.includes('href="tel:0988460556 - '), (home.match(/tel:[^"]*/g) || []));
      // Address, phones and email sit under the logo block (after the tagline), not in the "Thông tin liên hệ" column
      const foot = home.slice(home.lastIndexOf('<footer'));
      const brand = foot.slice(foot.indexOf('class="footer-brand"'), foot.indexOf('class="footer-col"'));
      const contactCol = foot.slice(foot.lastIndexOf('class="footer-col"'), foot.indexOf('class="footer-bottom"'));
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;').replace(/'/g, '&#39;');
      check('footer: address, call links and email under the logo block, after the tagline; none left in "Thông tin liên hệ"',
        brand.indexOf('data-footer-contact') > brand.indexOf('footer-about') && both.test(brand) && (!ci.address || brand.includes(`<p>${esc(ci.address)}</p>`)) && (!ci.email || brand.includes(`href="mailto:${esc(ci.email)}"`))
          && !/href="(tel|mailto):/.test(contactCol) && /<a href="\/lien-he">[^<]*<\/a>\s*<a href="\/ho-tro">/.test(contactCol), { brand: brand.slice(-600), contactCol });
      check('Liên hệ: "Điện thoại: 0988460556 - 0333601279" with two call links', /Điện thoại: <a href="tel:0988460556">0988460556<\/a> - <a href="tel:0333601279">0333601279<\/a>/.test(await html('/lien-he')));
      const help = await html('/ho-tro');
      check('Hỗ trợ: one call button per number, no run-together number', help.includes('href="tel:0988460556"') && help.includes('href="tel:0333601279"') && !help.includes('tel:09884605560333601279'));
      const org = JSON.parse(home.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1]);
      check('Google company card: both numbers', JSON.stringify(org.telephone) === '["0988460556","0333601279"]', org.telephone);
      check('the admin form hints how to enter several numbers', (await (await fetch(BASE + '/admin/thong-tin-cong-ty', { headers: { cookie: `connect.sid=${admin.sid}; adminLang=vi` } })).text()).includes('data-phone-hint>Nhiều số: cách nhau bằng dấu « - », ví dụ 0988460556 - 0333601279</'));
      await b.viewport(390, 844);
      for (const p of ['/lien-he', '/ho-tro']) {
        await b.nav(p, 300);
        const ov = await ev(`(() => { const f = document.querySelector('.site-footer, footer'); f && f.scrollIntoView(); return document.documentElement.scrollWidth - innerWidth; })()`);
        check(`390px ${p}: the two numbers fit (no sideways scroll)`, ov <= 1, ov);
        // The call links inside the phone line look like the email and the address (not the default blue link colour)
        const colors = await ev(`(() => { const c = (e) => getComputedStyle(e).color; const box = document.querySelector('[data-footer-contact]'); return { text: c(box.querySelector('p')), links: [...box.querySelectorAll('a')].map(c) }; })()`);
        check(`${p}: footer address, call links and email in the same colour`, colors.links.length === 3 && colors.links.every((x) => x === colors.text), colors);
      }
      await b.viewport(1280, 900);
    });
  } finally {
    // Back through an admin save: the server caches the settings (the phone box goes back too)
    await saveContact(ci.zalo || '', ci.messenger || '');
  }
});
