// Zalo / Messenger chat button (partials/chat-button.ejs, lib/chat-links.js): set in Admin → Thông tin công ty, shown
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
    await part(b, 'Thông tin công ty → Zalo and Messenger', async () => {
      let r = await saveContact('', '');
      check('both empty → no chat button, nothing in the footer', r.status === 302 && !(await html('/')).includes('data-chat-fab') && !(await html('/')).includes('data-footer-chat'));
      check('… and no Zalo / Messenger buttons on Liên hệ', !(await html('/lien-he')).includes('data-contact-chat'));
      r = await saveContact('0912 345 678', 'https://www.facebook.com/mtg.vn/');
      const saved = (await d.collection('sitesettings').findOne({})).contactInfo;
      check('saved cleaned: Zalo "0912345678", Messenger "mtg.vn"', saved.zalo === '0912345678' && saved.messenger === 'mtg.vn', saved);
      const form = await (await fetch(BASE + '/admin/thong-tin-cong-ty', { headers: { cookie: `connect.sid=${admin.sid}; adminLang=vi` } })).text();
      check('the admin form shows them with their labels', form.includes('<label for="zalo">Số Zalo</label>') && form.includes('value="0912345678"') && form.includes('value="mtg.vn"'));
      // A save without these boxes (an older form, or another test's restore) keeps them
      await fetch(BASE + '/admin/thong-tin-cong-ty', { method: 'POST', redirect: 'manual', headers: { cookie: `connect.sid=${admin.sid}` }, body: new URLSearchParams({ companyProfile: settingsBackup.companyProfile || '', address: ci.address || '', phone: ci.phone || '', email: ci.email || '' }) });
      check('a save without the chat boxes keeps them', (await d.collection('sitesettings').findOne({})).contactInfo.zalo === '0912345678');
      const page = await html('/lien-he');
      check('footer and Liên hệ: "Nhắn qua Zalo" / "Nhắn qua Messenger", opening in a new tab',
        page.includes('href="https://zalo.me/0912345678" target="_blank" rel="noopener" data-footer-chat="zalo">Nhắn qua Zalo</a>') && page.includes('data-footer-chat="messenger">Nhắn qua Messenger</a>')
        && /data-contact-chat>[\s\S]*?href="https:\/\/m\.me\/mtg\.vn"/.test(page));
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
      check('Enter opens it: Zalo then Messenger, focus on the first', !open.hidden && open.expanded === 'true' && open.focus === 'https://zalo.me/0912345678'
        && JSON.stringify(open.links) === JSON.stringify([['Nhắn qua Zalo (mở trong thẻ mới)', 'https://zalo.me/0912345678', '_blank'], ['Nhắn qua Messenger (mở trong thẻ mới)', 'https://m.me/mtg.vn', '_blank']]), open);
      const logos = await ev(`(() => { const ls = [...document.querySelectorAll('[data-chat-menu] a')].map((a) => [...a.querySelectorAll('svg')]);
        const grad = document.querySelector('[data-chat-menu] .chat-logo--messenger linearGradient');
        return { each: ls.map((s) => s.length === 1 && s[0].matches('.chat-logo[aria-hidden="true"]') && s[0].getBoundingClientRect().width === 28), zalo: ls[0][0].querySelector('rect') && ls[0][0].querySelector('rect').getAttribute('fill'),
          messenger: ls[1][0].querySelector('path').getAttribute('fill'), gradId: grad && grad.id, gradCount: grad ? document.querySelectorAll('[id="' + grad.id + '"]').length : 0 }; })()`);
      check('each link shows its real logo (hidden from screen readers): Zalo on its blue tile, Messenger gradient', logos.each.every(Boolean) && logos.zalo === '#0068ff' && logos.messenger === `url(#${logos.gradId})` && logos.gradCount === 1, logos);
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
          return { logo: !!s, w: r && Math.round(r.width), text: a.textContent.replace(/\\s+/g, ' ').trim(), h: Math.round(ar.height), logoFirst: a.firstElementChild === s, gradient: k === 'messenger' ? !!a.querySelector('linearGradient#contact-chat-messenger') : true }; };
        return { after, zalo: btn('zalo'), messenger: btn('messenger') };
      })()`);
      check('the Zalo / Messenger buttons come after the request form', lay.after, lay);
      check('"Nhắn qua Zalo" starts with the Zalo logo (20 px), "Nhắn qua Messenger" with the Messenger logo (its own gradient)',
        lay.zalo && lay.zalo.logo && lay.zalo.logoFirst && lay.zalo.w === 20 && lay.messenger && lay.messenger.logo && lay.messenger.logoFirst && lay.messenger.w === 20 && lay.messenger.gradient, lay);
      check('… the spoken names stay "Nhắn qua Zalo (mở trong thẻ mới)" (the logo is hidden from screen readers), and each button is at least 24 px high',
        lay.zalo.text === 'Nhắn qua Zalo (mở trong thẻ mới)' && lay.messenger.text === 'Nhắn qua Messenger (mở trong thẻ mới)' && lay.zalo.h >= 24 && lay.messenger.h >= 24, lay);
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
      check('Liên hệ with only Messenger set: one button, with the Messenger logo', !contactOne.includes('data-contact-chat-link="zalo"') && /data-contact-chat-link="messenger"><svg class="chat-logo chat-logo--messenger/.test(contactOne));
      await b.nav('/', 300);
      const one = await ev(`(() => { const f = document.querySelector('[data-chat-fab]'); return { tag: f.tagName, href: f.getAttribute('href'), target: f.target, name: f.getAttribute('aria-label'), menu: !!document.querySelector('[data-chat-menu]'),
        logo: !!f.querySelector('svg.chat-logo--messenger[aria-hidden="true"] path[fill="#fff"]'), bg: getComputedStyle(f).backgroundImage }; })()`);
      check('only Messenger set → the button is a plain link to it, named "Nhắn qua Messenger (mở trong thẻ mới)"', one.tag === 'A' && one.href === 'https://m.me/mtg.vn' && one.target === '_blank' && one.name === 'Nhắn qua Messenger (mở trong thẻ mới)' && !one.menu, one);
      check('… showing the white Messenger logo on the Messenger gradient', one.logo && one.bg.startsWith('linear-gradient'), one);
      await b.shot('chat-one-link');
      const en = await html('/', 'en');
      check('in English: "Message on Messenger (opens in a new tab)"', en.includes('aria-label="Message on Messenger (opens in a new tab)"'));
    });
  } finally {
    // Back through an admin save: the server caches the settings
    await saveContact(ci.zalo || '', ci.messenger || '');
  }
});
