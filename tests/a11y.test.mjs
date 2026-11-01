// Screen-reader structure checked with axe-core (the same engine as the pre-launch test, use case #9) on one page of
// each kind and the admin overview: heading levels in order, card pictures that don't repeat the card title, lists
// made of list items, no clickable parts inside a picture or another control, spoken names that start with the
// visible text, and no table column without a name (the admin lists' action and drag columns).
// Also: keyboard focus shows a ring on form fields, search boxes, partner logos and videos (pre-launch finding #10).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { suite, part, check, db, createUser, ROOT } from './lib/index.mjs';

const AXE = readFileSync(path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const RULES = ['heading-order', 'image-redundant-alt', 'list', 'listitem', 'nested-interactive', 'aria-prohibited-attr', 'label-content-name-mismatch', 'empty-table-header'];

await suite(async (b) => {
  const { ev, nav } = b;
  const audit = async (url) => {
    await nav(url, 400);
    await ev(AXE);
    return ev(`axe.run(document, { runOnly: { type: 'rule', values: ${JSON.stringify(RULES)} }, resultTypes: ['violations'] })
      .then((r) => r.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')))`);
  };
  const checkPages = async (urls, note = '') => {
    for (const lang of ['vi', 'en']) {
      for (const url of urls) {
        const found = await audit(url + (url.includes('?') ? '&' : '?') + 'lang=' + lang);
        check(`${url} (${lang}${note}): headings in order, no repeated picture text, clean lists and controls`, found.length === 0, found);
      }
    }
  };

  await part(b, 'public pages', async () => {
    const d = await db();
    const one = async (col, filter = {}) => (await d.collection(col).findOne(filter, { sort: { order: 1, _id: 1 } }))._id;
    await checkPages([
      '/', '/san-pham', '/san-pham/robot-leo-cau-thang', '/san-pham/robot-cat-co',
      '/giai-phap', '/giai-phap/stem-lab', '/giai-phap/thiet-bi', '/giai-phap/workshop', '/giai-phap/dao-tao', '/giai-phap/du-an', '/giai-phap/tap-huan',
      `/giai-phap/thiet-bi/${await one('products', { category: 'stem-equipment' })}`, `/giai-phap/du-an/${await one('projects')}`,
      '/dich-vu', '/dich-vu/tu-van-du-hoc', '/dich-vu/phan-phoi-san-pham', '/tin-tuc', `/tin-tuc/${await one('articles')}`,
      '/ve-mtg', '/lien-he', '/ho-tro', '/dang-nhap', '/dang-ky',
    ]);
  });

  await part(b, 'account pages and the admin overview', async () => {
    const customer = await createUser('a11y', 'customer');
    await b.login(customer.sid);
    await checkPages(['/tai-khoan', '/ho-so', '/lien-he', '/san-pham/robot-leo-cau-thang'], ', logged in');
    const owner = await createUser('a11y-owner', 'owner');
    await b.login(owner.sid);
    for (const lang of ['vi', 'en']) {
      await b.setCookie('adminLang', lang);
      const found = await audit('/admin');
      check(`/admin (${lang}): the pies are pictures, their legends the controls`, found.length === 0, found);
      for (const url of ['/admin/yeu-cau', '/admin/nguoi-dung', '/admin/du-an', '/admin/robot', '/admin/dich-vu', '/admin/doi-tac', '/admin/ho-tro', '/admin/tin-tuc']) {
        const named = await audit(url);
        check(`${url} (${lang}): every table column has a name (hidden for the action and drag columns)`, named.length === 0, named);
      }
    }
    await b.setCookie('adminLang', 'vi');
    // The four W3C checker errors of QA use case 40 stay fixed
    await b.nav('/admin/nguoi-dung', 300);
    check('W3C: the avatar dialog picture has an address (an empty src is invalid)', await b.ev(`!!document.querySelector('[data-avatar-img]').getAttribute('src')`));
    await b.nav('/admin/thong-tin-cong-ty', 300);
    check('W3C: Thông tin công ty goes h1 → h2 (no level skipped)', await b.ev(`(() => { const hs = [...document.querySelectorAll('main h1, main h2, main h3, main h4, .admin-main h1, .admin-main h2, .admin-main h3')].map((h) => +h.tagName[1]); return hs.length > 1 && hs.every((n, i) => i === 0 || n <= hs[i - 1] + 1); })()`));
  });

  await part(b, 'W3C fixes on public pages (QA use case 40)', async () => {
    await b.login('none');
    await b.nav('/giai-phap/stem-lab', 400);
    const inButtons = await b.ev(`[...document.querySelectorAll('button')].filter((x) => x.querySelector('div, p, figure, section, ul')).length`);
    check('STEM Lab: no block element (div…) inside a button; the zoomable photos still open from their button', inButtons === 0 && await b.ev(`document.querySelectorAll('.media-zoom .media-frame').length > 0 && getComputedStyle(document.querySelector('.media-zoom .media-frame')).display === 'block'`), inButtons);
    await b.nav('/dang-nhap', 300);
    check('login page: no hidden attribute on an <svg> (the password eye switches by CSS)', await b.ev(`document.querySelectorAll('svg[hidden]').length === 0`));
    const eye = await b.ev(`(() => { const btn = document.querySelector('[data-password-toggle]'); const shows = (s) => getComputedStyle(btn.querySelector(s)).display !== 'none'; const before = [shows('.icon-eye'), shows('.icon-eye-off')]; btn.click(); const after = [shows('.icon-eye'), shows('.icon-eye-off')]; btn.click(); return { before, after }; })()`);
    check('… the open eye shows first, the crossed-out eye after a click', JSON.stringify(eye) === JSON.stringify({ before: [true, false], after: [false, true] }), eye);
  });

  await part(b, 'keyboard focus is visible (form fields, search boxes, partner logos, videos)', async () => {
    // Tab until the focus lands on the element, then read its outline (or its search pill's)
    const ringOn = async (url, sel) => {
      await nav(url, 400);
      for (let i = 0; i < 120; i++) {
        await b.key('Tab', 'Tab', 9);
        const r = await ev(`(() => { const el = document.activeElement; if (!el || !el.matches(${JSON.stringify(sel)})) return null;
          const ring = (e) => { const cs = getComputedStyle(e); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2; };
          return { ring: ring(el) || !!(el.closest('.search-pill, .equip-search') && ring(el.closest('.search-pill, .equip-search'))) }; })()`);
        if (r) return r.ring;
      }
      return 'never reached';
    };
    check('/dang-ky: a form field shows a ring', await ringOn('/dang-ky', 'input.form-control') === true);
    check('/giai-phap/thiet-bi: the search box shows a ring', await ringOn('/giai-phap/thiet-bi', '[data-equip-search]') === true);
    check('/: a partner logo shows a ring', await ringOn('/', '.partner-tile a') === true);
    check('/san-pham/robot-leo-cau-thang: a video shows a ring', await ringOn('/san-pham/robot-leo-cau-thang', 'video') === true);
  });
});
