// Reference projects (school levels, school search, admin level chips/column/search, level picker in the form)
// and news search (public: title + text; admin: title), EN news cards.
import { suite, part, check, db, createUser, restoreLater } from './lib/index.mjs';

await suite(async (b) => {
  const { send, ev, sleep, nav } = b;
  const d = await db();
  const admin = await createUser('projnews');
  const type = async (sel, text) => { await ev(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); i.focus(); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await send('Input.insertText', { text }); await sleep(150); };

  await part(b, 'projects', async () => {
    const petro = await d.collection('projects').findOne({ schoolName: '' });
    await restoreLater('projects', { _id: petro._id }); // its level is changed through the form below
    await nav('/giai-phap/du-an', 300);
    const groups = await ev(`[...document.querySelectorAll('[data-search-group]')].map((g) => ({ id: g.id, h: g.querySelector('h2').textContent, n: g.querySelectorAll('[data-search-item]').length, badge: +g.querySelector('[data-search-group-count]').textContent, empty: !!g.querySelector('[data-search-empty]') }))`);
    check('public projects: THCS 4, THPT 3, Đại học empty with a note, Khác 1', JSON.stringify(groups.map((g) => [g.id, g.n, g.badge])) === JSON.stringify([['thcs', 4, 4], ['thpt', 3, 3], ['dai-hoc', 0, 0], ['khac', 1, 1]]) && groups[2].empty, groups);
    const cardHead = await ev(`[...document.querySelectorAll('#thcs .card h3')].map((h) => h.textContent.trim())`);
    check('project cards lead with the school name', cardHead.includes('THCS Cầu Giấy') && cardHead.every((h) => h.startsWith('THCS')), cardHead);
    await b.shot('projects-1280');
    await type('[data-card-search] input', 'tay mo');
    const s1 = await ev(`({ vis: [...document.querySelectorAll('[data-search-item]')].filter((c) => !c.hidden).map((c) => c.querySelector('h3').textContent.trim()), groups: [...document.querySelectorAll('[data-search-group]')].filter((g) => !g.hidden).map((g) => g.id), count: document.querySelector('.card-search-count').textContent })`);
    check('search "tay mo" (no accents) finds the two Tây Mỗ schools; other levels step aside', JSON.stringify(s1.vis) === JSON.stringify(['THCS Tây Mỗ', 'THCS Tây Mỗ 3']) && JSON.stringify(s1.groups) === '["thcs"]' && s1.count === 'Tìm thấy 2 dự án', s1);
    await type('[data-card-search] input', 'phong stem');
    const s2 = await ev(`({ vis: [...document.querySelectorAll('[data-search-item]')].filter((c) => !c.hidden).length, none: !document.querySelector('[data-search-none]').hidden, text: document.querySelector('[data-search-none]').textContent })`);
    check('search by project name ("phong stem") finds nothing: it searches schools only', s2.vis === 0 && s2.none && s2.text.includes('phong stem'), s2);
    await type('[data-card-search] input', 'ha noi');
    check('search by place ("ha noi") finds the Hà Nội schools', (await ev(`[...document.querySelectorAll('[data-search-item]')].filter((c) => !c.hidden).length`)) === 3);
    await nav('/giai-phap/du-an?lang=en', 300);
    check('EN: level headings in English', JSON.stringify(await ev(`[...document.querySelectorAll('[data-search-group] h2')].map((h) => h.textContent)`)) === JSON.stringify(['Lower secondary', 'Upper secondary', 'University', 'Other']));
    await nav('/giai-phap/du-an?lang=vi', 300);

    await b.login(admin.sid);
    await b.setCookie('adminLang', 'vi');
    await nav('/admin/du-an', 300);
    const adm = await ev(`({ chips: [...document.querySelectorAll('[data-list-filter="projects"] .filter-chip')].map((b) => b.dataset.value + ':' + b.querySelector('.filter-chip-count').textContent), col: [...document.querySelectorAll('tbody tr')].map((tr) => tr.children[3].textContent.trim()) })`);
    check('admin projects: level chips and a level column', JSON.stringify(adm.chips) === JSON.stringify([':8', 'thcs:4', 'thpt:3', 'dai-hoc:0', 'khac:1']) && adm.col.filter((c) => c === 'THCS').length === 4, adm);
    await type('[data-list-search="projects"] input', 'kim lien');
    const as1 = await ev(`({ vis: [...document.querySelectorAll('tbody tr[data-id]')].filter((tr) => !tr.hidden).map((tr) => tr.children[2].querySelector('strong').textContent), mark: !!document.querySelector('tbody tr:not([hidden]) mark.search-hit') })`);
    check('admin projects: search by school ("kim lien") with the match highlighted', as1.vis.length === 1 && as1.vis[0].startsWith('THPT Kim Liên') && as1.mark, as1);
    await type('[data-list-search="projects"] input', 'phong');
    check('admin projects: the project name is not searched', (await ev(`[...document.querySelectorAll('tbody tr[data-id]')].filter((tr) => !tr.hidden).length`)) === 0);
    // Form: choose a level for the project without a school, save through the real form
    await nav(`/admin/du-an/${petro._id}/sua`, 300);
    const sel = await ev(`({ opts: [...document.querySelectorAll('#projectLevel option')].map((o) => o.value + '=' + o.textContent.trim()), val: document.getElementById('projectLevel').value })`);
    check('project form: level picker, automatic shows the current guess', sel.val === '' && sel.opts[0] === '=Tự nhận theo tên trường (hiện: Khác)' && sel.opts.length === 5, sel);
    { await ev(`document.getElementById('projectLevel').value = 'dai-hoc'`); const l = b.waitLoad(); await ev(`document.getElementById('projectLevel').form.requestSubmit()`); await l; await sleep(200); }
    const saved = await d.collection('projects').findOne({ _id: petro._id });
    check('saving the form stores the chosen level', saved.level === 'dai-hoc' && saved.titleVi === petro.titleVi && saved.descriptionVi === petro.descriptionVi, { level: saved.level });
    await nav('/giai-phap/du-an', 300);
    const moved = await ev(`[...document.querySelectorAll('[data-search-group]')].map((g) => g.id + ':' + g.querySelectorAll('[data-search-item]').length).join(' ')`);
    check('the project moves into the Đại học section (and "Khác" disappears)', moved === 'thcs:4 thpt:3 dai-hoc:1', moved);
    await d.collection('projects').updateOne({ _id: petro._id }, { $set: { level: petro.level || '' } });
  });

  await part(b, 'news search', async () => {
    await nav('/tin-tuc', 300);
    const art = await d.collection('articles').findOne({ published: true });
    const firstWord = art.titleVi.split(' ')[3] || art.titleVi.split(' ')[0];
    await type('[data-card-search] input', firstWord.toLowerCase());
    const n1 = await ev(`({ vis: [...document.querySelectorAll('[data-search-item]')].filter((c) => !c.hidden).length, count: document.querySelector('.card-search-count').textContent })`);
    check(`public news: search "${firstWord.toLowerCase()}" finds the article`, n1.vis === 1 && n1.count === 'Tìm thấy 1 bài viết', n1);
    await type('[data-card-search] input', 'zzqqxx');
    const n2 = await ev(`({ vis: [...document.querySelectorAll('[data-search-item]')].filter((c) => !c.hidden).length, none: !document.querySelector('[data-search-none]').hidden })`);
    check('public news: no match shows the note', n2.vis === 0 && n2.none, n2);
    await nav('/tin-tuc?lang=en', 300);
    const enTitle = await ev(`document.querySelector('.card h3').textContent.trim()`);
    check('EN news card uses the English title (or the Vietnamese one when there is none)', enTitle === (art.titleEn || art.titleVi), enTitle);
    await nav('/tin-tuc?lang=vi', 300);
    await b.login(admin.sid);
    await b.setCookie('adminLang', 'vi');
    await nav('/admin/tin-tuc', 300);
    await type('[data-list-search="articles"] input', firstWord.toLowerCase());
    const n3 = await ev(`({ vis: [...document.querySelectorAll('tbody tr[data-id]')].filter((tr) => !tr.hidden).length, mark: !!document.querySelector('mark.search-hit') })`);
    await type('[data-list-search="articles"] input', 'zzqqxx');
    const n4 = await ev(`({ vis: [...document.querySelectorAll('tbody tr[data-id]')].filter((tr) => !tr.hidden).length, none: !document.querySelector('[data-list-search-none="articles"]').hidden })`);
    check('admin news: title search highlights the match; no match shows the note', n3.vis === 1 && n3.mark && n4.vis === 0 && n4.none, { n3, n4 });
  });
});
