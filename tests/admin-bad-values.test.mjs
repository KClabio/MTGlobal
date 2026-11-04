// Admin forms given values no browser form would send (a repeated field, a field with [brackets], one value where the
// page keeps a list), and two saves of the settings at the same moment. The answer may be a message or a saved value
// without the extras, but never a server error. In the admin area a failed save doesn't show as a 500: it is logged, and
// the owner is sent back with a red "failed" notice. Sent without a Referer, that means a redirect to /admin, which
// no normal save answers with. The error log must not grow either.
import { suite, part, check, db, appRequire, createUser, removeLater, restoreLater, stamp, sidClient } from './lib/index.mjs';
import { BASE } from './lib/browser.mjs';

const MARK = `ZZTEST-badvalues-${stamp}`;

const FIELDS = {
  project: ['titleVi', 'titleEn', 'schoolName', 'location', 'level', 'descriptionVi', 'descriptionEn', 'featured', 'videos', 'images', 'imageOrder', 'removeImages', 'videoUrl'],
  product: ['nameVi', 'nameEn', 'category', 'section', 'subcategory', 'subcategoryEn', 'descriptionVi', 'descriptionEn', 'featured', 'comingSoon', 'specs', 'specKey', 'specKeyEn', 'specValue', 'specValueEn', 'images', 'videos', 'imageOrder', 'removeImages', 'removeVideos'],
  partner: ['name', 'url', 'slug', 'descriptionVi', 'descriptionEn', 'contacts', 'logo'],
  article: ['titleVi', 'titleEn', 'bodyVi', 'bodyEn', 'published', 'coverImage', 'uploadedBy'],
};
const REQUIRED = {
  project: { titleVi: MARK },
  product: { nameVi: MARK, category: 'robot-cat-co' },
  partner: { name: MARK },
  article: { titleVi: MARK },
};

/** Every way of sending one field that no browser form sends */
/** What the server counted so far in Nhật ký lỗi: one row per kind of error, each with its count */
const errorTotal = async (d) => (await d.collection('errorlogs').find({}).toArray()).reduce((sum, e) => sum + (e.count || 1), 0);
const failed = (r) => r.status >= 500 || r.location === '/admin';

const SHAPES = {
  'one value': (field) => [[field, `${MARK}-x`]],
  repeated: (field) => [[field, `${MARK}-a`], [field, `${MARK}-b`]],
  brackets: (field) => [[`${field}[x]`, `${MARK}-n`]],
};

await suite(async (b) => {
  const d = await db();
  const owner = await createUser('badvalues-owner', 'owner');
  const c = sidClient(owner.sid);
  const errorsBefore = await errorTotal(d);
  const named = { $regex: `^${MARK}` };
  removeLater('projects', { titleVi: named });
  removeLater('products', { nameVi: named });
  removeLater('partners', { name: named });
  removeLater('articles', { titleVi: named });

  const now = new Date();
  const project = (await d.collection('projects').insertOne({ titleVi: `${MARK} project`, images: ['/assets/a.jpg'], order: 0, createdAt: now, updatedAt: now })).insertedId;
  const product = (await d.collection('products').insertOne({ nameVi: `${MARK} product`, category: 'robot-cat-co', images: ['/assets/a.jpg'], videos: [], specs: [{ key: 'k', value: 'v' }], order: 0, createdAt: now, updatedAt: now })).insertedId;
  const partner = (await d.collection('partners').insertOne({ name: `${MARK} partner`, slug: `${MARK}-partner`.toLowerCase(), order: 0, createdAt: now, updatedAt: now })).insertedId;
  const article = (await d.collection('articles').insertOne({ titleVi: `${MARK} article`, slug: `${MARK}-article`.toLowerCase(), published: false, createdAt: now, updatedAt: now })).insertedId;

  const ROUTES = [
    ['project', '/admin/du-an/moi'], ['project', `/admin/du-an/${project}/sua`],
    ['product', '/admin/san-pham/moi'], ['product', `/admin/san-pham/${product}/sua`],
    ['partner', '/admin/doi-tac/moi'], ['partner', `/admin/doi-tac/${partner}/sua`],
    ['article', '/admin/tin-tuc/moi'], ['article', `/admin/tin-tuc/${article}/sua`],
  ];

  for (const [kind, url] of ROUTES) {
    await part(b, `${kind}: ${url.replace(/[0-9a-f]{24}/, ':id')}`, async () => {
      const broken = [];
      const answers = new Set();
      for (const field of FIELDS[kind]) {
        for (const [shape, make] of Object.entries(SHAPES)) {
          // Once with the required fields filled in (it may save), once without (the form comes back with a message)
          for (const filled of [true, false]) {
            const pairs = [...(filled ? Object.entries(REQUIRED[kind]).filter(([k]) => k !== field) : []), ...make(field)];
            const r = await c.req(url, { method: 'POST', body: new URLSearchParams(pairs) });
            answers.add(r.location && !r.location.startsWith('/admin') ? `away:${r.location}` : r.status);
            if (failed(r)) broken.push(`${field} ${shape}${filled ? '' : ' (nothing else filled in)'}`);
          }
        }
      }
      check(`the form itself answered: ${kind} ${url.includes('moi') ? 'new' : 'edit'}`, answers.has(400) && ![...answers].some((a) => String(a).startsWith('away') || a === 404), [...answers].join(','));
      check(`no value in any field gives a server error: ${kind} ${url.includes('moi') ? 'new' : 'edit'}`, broken.length === 0, broken.slice(0, 12).join('; '));
    });
  }

  await part(b, 'a message on the form keeps what was saved', async () => {
    await d.collection('products').updateOne({ _id: product }, { $set: { images: ['/assets/a.jpg'], specs: [{ key: 'k', value: 'v' }] } });
    const r = await c.req(`/admin/san-pham/${product}/sua`, { method: 'POST', body: new URLSearchParams({ nameVi: '', images: 'x', specs: 'x', videos: 'x' }) });
    check('the form comes back with a message (400)', r.status === 400, `${r.status} ${r.location}`);
    check('the saved photo is still listed', r.text.includes('value="/assets/a.jpg"'));
    check('the saved specification is still listed', r.text.includes('value="k"'));
  });

  await part(b, 'a help answer with nothing left in it', async () => {
    removeLater('helpitems', { questionVi: named });
    for (const answerVi of ['<b></b>', '<p> </p>', '<br>']) {
      const r = await c.req('/admin/ho-tro/moi', { method: 'POST', body: new URLSearchParams({ group: 'tai-khoan', questionVi: `${MARK} q`, answerVi }) });
      check(`"${answerVi}" as the answer: the form says what is missing`, r.status === 400 && !failed(r), `${r.status} ${r.location}`);
    }
  });

  await part(b, 'saves of the same record at the same moment', async () => {
    const answers = await Promise.all(Array.from({ length: 12 }, (_, i) => c.req(`/admin/san-pham/${product}/sua`, {
      method: 'POST',
      body: new URLSearchParams({ nameVi: `${MARK} product`, category: 'robot-cat-co', specKey: `k${i}`, specValue: `v${i}`, descriptionEn: `d${i}` }),
    })));
    check('12 saves of one product: all saved', answers.every((r) => r.status === 302 && !failed(r)), answers.map((r) => `${r.status} ${r.location}`).join(','));
    const saved = await d.collection('products').findOne({ _id: product });
    check('the product holds one whole save, not a mix', saved.specs.length === 1 && saved.specs[0].key === `k${saved.descriptionEn.slice(1)}`, JSON.stringify(saved.specs));

    // Each of these saves replaces its lists whole, so a version number has nothing to protect and only makes saves fail
    for (const [file, name] of [['Product', 'product'], ['Project', 'project'], ['Service', 'service'], ['SolutionPage', 'page'], ['SiteSettings', 'settings']]) {
      check(`${name}: saves at the same moment don't refuse each other`, appRequire(`./models/${file}.js`).schema.options.versionKey === false);
    }
  });

  await part(b, 'partner saves at the same moment with the same address', async () => {
    const slug = `${MARK}-same`.toLowerCase();
    const others = await d.collection('partners').insertMany(Array.from({ length: 6 }, (_, i) => ({ name: `${MARK} p${i}`, slug: `${MARK}-p${i}`.toLowerCase(), order: 0, createdAt: now, updatedAt: now })));
    const edits = Object.values(others.insertedIds).map((id, i) => c.req(`/admin/doi-tac/${id}/sua`, { method: 'POST', body: new URLSearchParams({ name: `${MARK} p${i}`, slug }) }));
    const creates = Array.from({ length: 6 }, (_, i) => c.req('/admin/doi-tac/moi', { method: 'POST', body: new URLSearchParams({ name: `${MARK} n${i}`, slug }) }));
    const answers = await Promise.all([...edits, ...creates]);
    check('12 saves asking for one address: none fails', answers.every((r) => !failed(r)), answers.map((r) => r.location).join(','));
    const slugs = (await d.collection('partners').find({ slug: { $regex: `^${slug}` } }).toArray()).map((p) => p.slug);
    check('each got its own address', slugs.length === 12 && new Set(slugs).size === 12, slugs.join(','));
  });

  await part(b, 'two saves of the settings at the same moment', async () => {
    const backup = (await restoreLater('sitesettings', {}))[0];
    const ci = backup.contactInfo || {};
    const general = (i) => {
      const body = new URLSearchParams({ tab: 'email', heroTitleVi: backup.homeHero?.titleVi || '', heroTitleEn: backup.homeHero?.titleEn || '', heroSubtitleVi: backup.homeHero?.subtitleVi || '', heroSubtitleEn: backup.homeHero?.subtitleEn || '', requestEmails: `zztest-${i}-${stamp}@example.com` });
      for (const [key, value] of Object.entries(backup.banners || {})) {
        body.set(`bannerVi_${key}`, value.subtitleVi || '');
        body.set(`bannerEn_${key}`, value.subtitleEn || '');
      }
      return body;
    };
    const company = () => new URLSearchParams({ companyProfile: backup.companyProfile || '', companyProfileEn: backup.companyProfileEn || '', address: ci.address || '', phone: ci.phone || '', email: ci.email || '', mapEmbedUrl: ci.mapEmbedUrl || '', zalo: ci.zalo || '', messenger: ci.messenger || '', privacyPolicy: backup.privacyPolicy || '', privacyPolicyEn: backup.privacyPolicyEn || '' });
    const answers = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 3 === 2
      ? c.req('/admin/thong-tin-cong-ty', { method: 'POST', body: company() })
      : c.req('/admin/cai-dat', { method: 'POST', body: general(i) }))));
    const statuses = answers.map((r) => r.status);
    check('12 saves at the same moment: none gives a server error', answers.every((r) => !failed(r)), statuses.join(','));

    check('nothing was added to the error log', (await errorTotal(d)) === errorsBefore, (await errorTotal(d)) - errorsBefore);

    // Back as it was: the server keeps the settings in memory until the next save
    await d.collection('sitesettings').replaceOne({ _id: backup._id }, backup);
    await fetch(`${BASE}/admin/thong-tin-cong-ty`, { method: 'POST', redirect: 'manual', headers: { cookie: `connect.sid=${c.sid}` }, body: company() });
  });
});
