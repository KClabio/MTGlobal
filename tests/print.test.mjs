// Printing (pre-launch finding #12): the page laid out for paper, in light and dark. No menu, buttons, theme switch or
// footer links; black text on white; a Giải pháp page prints whole (folds opened, every photo tab, the full process trail).
import { suite, part, check, db } from './lib/index.mjs';

await suite(async (b) => {
  const { ev, nav, shot } = b;

  await part(b, 'print layout', async () => {
    const d = await db();
    const one = async (col) => (await d.collection(col).findOne({}, { sort: { order: 1, _id: 1 } }))._id;
    const pages = ['/giai-phap/stem-lab', `/giai-phap/du-an/${await one('projects')}`, `/tin-tuc/${await one('articles')}`, '/ve-mtg', '/'];
    const seen = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].some((e) => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0; })`;

    for (const theme of ['light', 'dark']) {
      await b.setCookie('theme', theme);
      for (const p of pages) {
        await b.printMedia(false);
        await nav(p, 300);
        await b.printMedia(true);
        const r = await ev(`({
          logo: ${seen('.site-header .logo')},
          menu: ${seen('.main-nav, .header-actions, .nav-toggle')},
          buttons: ${seen('main .btn')},
          footerLinks: ${seen('.footer-col a[href^="/"], .footer-bottom-link')},
          footerCompany: ${seen('.footer-company')},
          ink: getComputedStyle(document.body).color, paper: getComputedStyle(document.body).backgroundColor,
          heading: getComputedStyle(document.querySelector('h1')).color,
        })`);
        const dark = (c) => { const [r1, g, b1] = c.match(/\d+/g).map(Number); return r1 + g + b1 < 200; };
        check(`${p} (${theme}): logo kept; menu, buttons and footer links left out`, r.logo && !r.menu && !r.buttons && !r.footerLinks && r.footerCompany, r);
        check(`${p} (${theme}): dark text on white paper, headings too`, dark(r.ink) && dark(r.heading) && r.paper === 'rgb(255, 255, 255)', r);
      }
    }

    // A Giải pháp page prints whole: main.js opens the folds before printing and closes them again after
    await b.setCookie('theme', 'light');
    await b.printMedia(false);
    await nav('/giai-phap/stem-lab', 300);
    const closed = await ev(`document.querySelectorAll('details.solution-fold:not([open])').length`);
    await ev(`window.dispatchEvent(new Event('beforeprint'))`);
    await b.printMedia(true);
    const whole = await ev(`({
      folds: document.querySelectorAll('details.solution-fold').length,
      closedFolds: document.querySelectorAll('details.solution-fold:not([open]), details.card-more:not([open])').length,
      panels: document.querySelectorAll('.media-tabpanel').length,
      hiddenPanels: [...document.querySelectorAll('.media-tabpanel')].filter((e) => getComputedStyle(e).display === 'none').length,
      tabButtons: ${seen('.media-tablist')},
      trail: document.querySelectorAll('.process-trail .trail-body').length,
      faintTrail: [...document.querySelectorAll('.process-trail .trail-node, .process-trail .trail-body')].filter((e) => getComputedStyle(e).opacity !== '1').length,
      jump: ${seen('.page-jump')}, explore: ${seen('.next-steps')},
    })`);
    check('/giai-phap/stem-lab: every fold is open for printing', closed > 0 && whole.folds > 0 && whole.closedFolds === 0, { closed, ...whole });
    check('… every photo tab is shown, without the tab buttons', whole.panels > 1 && whole.hiddenPanels === 0 && !whole.tabButtons, whole);
    check('… the process trail is drawn in full', whole.trail > 0 && whole.faintTrail === 0, whole);
    check('… no jump menu, no "Khám phá thêm"', !whole.jump && !whole.explore, whole);
    await shot('print-stem-lab', true);
    await ev(`window.dispatchEvent(new Event('afterprint'))`);
    await b.printMedia(false);
    check('… after printing, the folds close again', await ev(`document.querySelectorAll('details.solution-fold:not([open])').length`) === closed);
  });
});
