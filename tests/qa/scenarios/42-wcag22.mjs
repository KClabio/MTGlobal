// 42 · WCAG 2.2 AA: the rules axe can't check by itself, measured in a real browser (Playwright, Chromium)
//  2.5.8 target size (at least 24 × 24 px, or enough space around), 2.4.11 focus not hidden (sticky header, chat
//  button), 1.4.10 reflow at 320 px, 1.4.12 text spacing, 2.5.7 a way to reorder without dragging, 3.3.8 pasting
//  passwords and codes allowed.
import { chromium } from 'playwright';
import { Client } from '../lib/http.mjs';
import { QA_ACCOUNTS } from '../lib/data.mjs';
import { QA_PASSWORD, BASE } from '../lib/infra.mjs';

const PUBLIC = ['/', '/giai-phap/stem-lab', '/giai-phap/thiet-bi', '/san-pham/robot-cat-co', '/giai-phap/du-an', '/tin-tuc', '/ho-tro', '/lien-he', '/dang-nhap', '/dang-ky'];
const SIGNED_IN = ['/ho-so', '/tai-khoan'];
const ADMIN = ['/admin', '/admin/yeu-cau', '/admin/san-pham', '/admin/doi-tac'];

// In the page: undersized targets that also lack the spacing exception (a 24 px circle around each must not touch another target)
const TARGETS = `(() => {
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [tabindex]:not([tabindex="-1"])';
  const all = [...document.querySelectorAll(sel)].filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('[hidden],[inert]'); });
  const rects = all.map((el) => el.getBoundingClientRect());
  const inlineLink = (el) => el.tagName === 'A' && el.parentElement && /^(P|LI|TD|DD|SPAN|LABEL|SMALL)$/.test(el.parentElement.tagName) && el.parentElement.textContent.trim().length > el.textContent.trim().length + 15;
  const out = [];
  all.forEach((el, i) => {
    const r = rects[i];
    if (r.width >= 24 && r.height >= 24) return;
    if (inlineLink(el) || el.closest('.prose-text, .faq-item .prose-text')) return; // links inside a sentence are exempt
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const clash = rects.some((o, j) => j !== i && !all[j].contains(el) && !el.contains(all[j]) && Math.max(o.left - cx, 0, cx - o.right) ** 2 + Math.max(o.top - cy, 0, cy - o.bottom) ** 2 < 144);
    if (!clash) return; // enough space around: the spacing exception
    out.push({ what: (el.getAttribute('aria-label') || el.textContent || el.name || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 40), cls: String(el.className || '').slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
  });
  return out;
})()`;

// In the page: the focused element is entirely covered by a fixed / sticky box (header, chat button…)
const FOCUS_HIDDEN = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null; // scrolled out of view: not "covered"
  // What the browser actually paints at the control's centre (paint order counts: a sticky box under the header's
  // z-index hides nothing). Comparing boxes alone reported Hồ sơ's header link "under" the profile box: a false alarm.
  const top = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
  if (!top || el === top || el.contains(top) || top.contains(el)) return null;
  const area = el.closest('nav, header, footer, aside, main, section');
  // Name the covering box by its nearest ancestor with a class (e.g. "admin-lang", not just "A")
  let cover = top;
  while (cover && !String(cover.className || '').trim() && cover.parentElement) cover = cover.parentElement;
  return { what: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 40), href: el.getAttribute('href') || '', in: area ? (area.tagName + '.' + String(area.className).split(' ')[0]) : '', under: String(cover.className || cover.tagName).slice(0, 40) };
})()`;

const SPACING_CSS = '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }';
const CLIPPED = `(() => [...document.querySelectorAll('body *')].filter((el) => {
  const s = getComputedStyle(el);
  if (!/(hidden|clip)/.test(s.overflow + s.overflowX + s.overflowY) || el.closest('[hidden]')) return false;
  const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  return text && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) && !/sr-only|visually-hidden/.test(el.className);
}).slice(0, 12).map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 40), text: el.textContent.trim().slice(0, 40) })))()`;

async function sidFor(email) {
  const c = new Client();
  await c.login(email, QA_PASSWORD);
  return c.cookies.get('connect.sid');
}

export const scenarios = [
  {
    id: 42,
    name: 'WCAG 2.2 AA rules axe cannot check: target size, focus not hidden, reflow, text spacing, dragging, pasting',
    types: ['Accessibility', 'WCAG 2.2'],
    async run(ctx) {
      const browser = await chromium.launch();
      const results = { targets: {}, focus: {}, reflow: {}, spacing: {}, dragging: null, paste: {} };
      try {
        const contextFor = async (sid) => {
          const c = await browser.newContext({ viewport: { width: 1280, height: 860 } });
          await c.addCookies([{ name: 'lang', value: 'vi', url: BASE }, ...(sid ? [{ name: 'connect.sid', value: sid, url: BASE }] : [])]);
          return c;
        };
        const sets = [['guest', null, PUBLIC], ['customer', await sidFor(QA_ACCOUNTS.customer(8)), SIGNED_IN], ['owner', await sidFor(QA_ACCOUNTS.owner), ADMIN]];
        for (const [who, sid, pages] of sets) {
          const context = await contextFor(sid);
          const page = await context.newPage();
          for (const p of pages) {
            for (const [w, h] of [[1280, 860], [390, 844]]) {
              await page.setViewportSize({ width: w, height: h });
              await page.goto(BASE + p, { waitUntil: 'load' });
              const small = await page.evaluate(TARGETS);
              if (small.length) results.targets[`${who} ${p} @${w}`] = small.slice(0, 8);
              // Tab through the page (up to 60 stops): a focused control must never sit fully under the header or the chat button
              const hidden = [];
              await page.evaluate(() => window.scrollTo(0, 0));
              for (let i = 0; i < 60; i++) {
                await page.keyboard.press('Tab');
                await page.waitForTimeout(350); // let a sliding menu (the Giải pháp jump menu) finish moving first
                const h2 = await page.evaluate(FOCUS_HIDDEN);
                if (h2) hidden.push(h2);
              }
              if (hidden.length) results.focus[`${who} ${p} @${w}`] = hidden.slice(0, 5);
            }
            // 1.4.10: 320 px wide (= 1280 px at 400% zoom) without sideways scrolling
            await page.setViewportSize({ width: 320, height: 640 });
            await page.goto(BASE + p, { waitUntil: 'load' });
            const wide = await page.evaluate(() => document.documentElement.scrollWidth);
            if (wide > 321) results.reflow[`${who} ${p}`] = wide;
            // 1.4.12: wider letter, word and line spacing must not cut text off
            await page.setViewportSize({ width: 1280, height: 860 });
            await page.goto(BASE + p, { waitUntil: 'load' });
            await page.addStyleTag({ content: SPACING_CSS });
            await page.waitForTimeout(150);
            const cut = await page.evaluate(CLIPPED);
            if (cut.length) results.spacing[`${who} ${p}`] = cut;
          }
          // 2.5.7: admin lists can be reordered without dragging (a tap or click alone)
          if (who === 'owner') {
            await page.goto(BASE + '/admin/san-pham', { waitUntil: 'load' });
            results.dragging = await page.evaluate(() => {
              const rows = [...document.querySelectorAll('[data-sortable] tr')];
              const tapOnly = rows.filter((r) => r.querySelector('[data-move-row], [data-move], [data-order-up], [data-order-down], button[aria-label*="lên" i], button[aria-label*="xuống" i]')).length;
              return { rows: rows.length, withTapButtons: tapOnly };
            });
          }
          await context.close();
        }
        // 3.3.8: the password box and the two-step code box accept pasting
        const context = await contextFor(null);
        const page = await context.newPage();
        const pasteAllowed = (selector) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() }); el.dispatchEvent(ev); return !ev.defaultPrevented && el.getAttribute('onpaste') === null; }, selector);
        await page.goto(BASE + '/dang-nhap', { waitUntil: 'load' });
        results.paste.password = await pasteAllowed('input[type=password]');
        await page.fill('input[name=email]', QA_ACCOUNTS.owner);
        await page.fill('input[type=password]', QA_PASSWORD);
        await Promise.all([page.waitForNavigation(), page.click('form[action="/dang-nhap"] button[type=submit]')]);
        results.paste.twoStepCode = await pasteAllowed('#twoStepCode');
        results.paste.codeAutocomplete = await page.evaluate(() => document.querySelector('#twoStepCode')?.getAttribute('autocomplete'));
        await context.close();
      } finally {
        await browser.close();
      }
      ctx.result('wcag22', results);
      const n = (o) => Object.keys(o).length;
      ctx.log(`targets: ${n(results.targets)} page/width with small targets · focus hidden: ${n(results.focus)} · reflow: ${n(results.reflow)} · spacing: ${n(results.spacing)} · dragging: ${JSON.stringify(results.dragging)} · paste: ${JSON.stringify(results.paste)}`);
      if (n(results.targets)) ctx.finding({ severity: 'low', title: 'WCAG 2.2: some buttons or links are smaller than 24 × 24 px with no space around', detail: Object.entries(results.targets).slice(0, 5).map(([k, v]) => `${k}: ${v.map((x) => `"${x.what}" ${x.w}×${x.h}`).join(', ')}`).join(' · '), fix: 'Give those controls at least 24 × 24 px (padding counts), or more space between them.' });
      if (n(results.focus)) ctx.finding({ severity: 'medium', title: 'WCAG 2.2: the keyboard focus can disappear under the sticky header or the chat button', detail: Object.entries(results.focus).slice(0, 5).map(([k, v]) => `${k}: ${v.map((x) => `"${x.what}"${x.href ? ` (${x.href})` : ''} in ${x.in} under ${x.under}`).join(', ')}`).join(' · '), fix: 'scroll-padding-top / scroll-margin for the header height, and keep the chat button clear of focused controls.' });
      if (n(results.reflow)) ctx.finding({ severity: 'medium', title: 'WCAG 2.2: some pages scroll sideways at 320 px (400% zoom)', detail: Object.entries(results.reflow).map(([k, v]) => `${k}: ${v} px`).join(', '), fix: 'Let the wide part wrap or scroll inside its own box.' });
      if (n(results.spacing)) ctx.finding({ severity: 'low', title: 'WCAG 2.2: wider text spacing cuts some text off', detail: Object.entries(results.spacing).slice(0, 5).map(([k, v]) => `${k}: ${v.map((x) => `${x.tag}.${x.cls} "${x.text}"`).join(', ')}`).join(' · '), fix: 'Avoid fixed heights with overflow hidden on boxes with text.' });
      if (results.dragging && results.dragging.rows && results.dragging.withTapButtons < results.dragging.rows) ctx.finding({ severity: 'medium', title: 'WCAG 2.2: admin lists can be reordered only by dragging (or the keyboard)', detail: `Admin → Sản phẩm: ${results.dragging.rows} rows, ${results.dragging.withTapButtons} with buttons to move them. On a touch screen without a keyboard the order can only be changed by dragging (2.5.7 Dragging Movements).`, fix: 'Small "Lên" / "Xuống" buttons beside the drag handle, using the same save as ↑ / ↓.' });
      if (results.paste.password === false || results.paste.twoStepCode === false) ctx.finding({ severity: 'medium', title: 'WCAG 2.2: pasting a password or code is blocked', detail: JSON.stringify(results.paste), fix: 'Allow pasting (3.3.8 Accessible Authentication).' });
    },
  },
];
