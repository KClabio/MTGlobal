const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Project = require('../models/Project');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Partner = require('../models/Partner');
const Article = require('../models/Article');
const QuoteRequest = require('../models/QuoteRequest');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const HelpItem = require('../models/HelpItem');

const { requireAdmin } = require('../middleware/auth');
const { uploadMedia, uploadServiceMedia, uploadPageMedia, uploadSingleImage, uploadSettingsImages, fileUrl, fileUrls, wrapUpload, removeLocalUpload, removeUpload, removeLocalMedia, PAGE_MEDIA_PREFIX } = require('../middleware/upload');
const { clearSiteSettingsCache } = require('../lib/settings');
const { loadAdminLanguage, makeTranslator } = require('../lib/i18n');
const { isNonEmpty } = require('../lib/validators');
const { isStaff, canDeleteUser, canChangeRole } = require('../lib/roles');
const { getDashboardData } = require('../lib/dashboard');
const { toPlainText, slugify } = require('../lib/text');
const { orderMedia } = require('../lib/media-order');
const { defaultPolicy } = require('../lib/privacy-policy');
const { PRODUCT_SECTIONS, sectionForCategory } = require('../lib/admin-sections');
const { parseServiceSections } = require('../lib/service-content');
const SolutionPage = require('../models/SolutionPage');
const { getSolutionPage, resetSolutionPage, TITLE_KEYS: SOLUTION_TITLE_KEYS, SLUGS: SOLUTION_SLUGS } = require('../lib/solution-pages');
const { parseSolutionPageForm } = require('../lib/solution-page-form');
const { BANNERS } = require('../lib/banners');
const { partSlug, groupEquipmentByPart } = require('../lib/equipment-parts');
const { LEVELS: PROJECT_LEVELS, projectLevel } = require('../lib/project-levels');
const { HELP_GROUPS, HELP_GROUP_KEYS, getHelpItems, groupHelpItems } = require('../lib/help-topics');

router.use(requireAdmin);
router.use(loadAdminLanguage);

// One-time notifications shown after a redirect: green for success, red for errors (see admin/partials/foot.ejs)
function flash(req, type, text) {
  req.session.flash = { type, text };
}
router.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  if (req.session.flash) delete req.session.flash;
  next();
});
// Where to go back to after an action: the referring admin page on this site, never an outside URL
function safeBack(req, fallback) {
  try {
    const ref = new URL(req.get('Referer') || '', `${req.protocol}://${req.get('host')}`);
    if (ref.host === req.get('host') && ref.pathname.startsWith('/admin')) return ref.pathname + ref.search;
  } catch (err) { /* no or malformed Referer */ }
  return fallback;
}
const done = (req, res, key, vars, to) => { flash(req, 'success', res.locals.t(key, vars)); res.redirect(to); };

function parseSpecs(body) {
  const keys = [].concat(body.specKey || []);
  const values = [].concat(body.specValue || []);
  return keys
    .map((key, i) => ({ key: (key || '').trim(), value: (values[i] || '').trim() }))
    .filter((s) => s.key);
}

// Translated message for a failed upload (wrapUpload stores the multer error code)
function uploadErrorText(req, t) {
  const code = String(req.uploadErrorCode || '');
  if (code === 'LIMIT_FILE_SIZE') return t('admin.upload.tooLarge');
  if (code.startsWith('Định dạng') || code.startsWith('Trường file')) return t('admin.upload.badType');
  return t('admin.upload.failed');
}

// Display order for a new item: after the last one (or before the first, for news)
async function nextOrder(Model, filter = {}, position = 'last') {
  const edge = await Model.findOne(filter).sort({ order: position === 'last' ? -1 : 1 }).select('order').lean();
  if (!edge) return 0;
  return position === 'last' ? (edge.order || 0) + 1 : (edge.order || 0) - 1;
}

// The item was deleted meanwhile (or the link is wrong): back to its list with a red notification
const notFound = (req, res, listPath) => { flash(req, 'error', res.locals.t('admin.flash.notFound')); res.redirect(listPath); };

// ---- Dashboard ----
router.get('/', async (req, res) => {
  res.render('admin/dashboard', { dash: await getDashboardData(res.locals.t, res.locals.lang) });
});

// ---- Drag-and-drop ordering ----
// Each list page posts the full list of ids in their new order; position becomes the "order" field
const SORTABLE = {
  projects: { Model: Project, filter: {} },
  robots: { Model: Product, filter: PRODUCT_SECTIONS.robot.filter },
  equipment: { Model: Product, filter: PRODUCT_SECTIONS.equipment.filter },
  partners: { Model: Partner, filter: {} },
  articles: { Model: Article, filter: {} },
  services: { Model: Service, filter: {} },
  // Hỗ trợ questions are ordered within their own group: help-tai-khoan, help-gui-yeu-cau, …
  ...Object.fromEntries(HELP_GROUP_KEYS.map((key) => [`help-${key}`, { Model: HelpItem, filter: { group: key } }])),
};

router.post('/thu-tu/:type', async (req, res) => {
  const target = SORTABLE[req.params.type];
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(String) : null;
  if (!target || !ids || !ids.length || new Set(ids).size !== ids.length || !ids.every((id) => mongoose.isValidObjectId(id))) {
    return res.status(400).json({ ok: false });
  }
  // The list must be exactly the items of this section: none missing, none from elsewhere
  const [inList, total] = await Promise.all([
    target.Model.countDocuments({ ...target.filter, _id: { $in: ids } }),
    target.Model.countDocuments(target.filter),
  ]);
  if (inList !== ids.length || total !== ids.length) return res.status(400).json({ ok: false });

  await target.Model.bulkWrite(ids.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: index } } } })));
  res.json({ ok: true });
});

// ---- Projects (dự án tham khảo) ----
// The chosen school level, or '' = worked out from the school name (lib/project-levels.js)
const readLevel = (value) => (PROJECT_LEVELS.includes(value) ? value : '');

router.get('/du-an', async (req, res) => {
  const projects = (await Project.find().sort({ order: 1, createdAt: -1 }).lean()).map((p) => ({ ...p, levelKey: projectLevel(p) }));
  const levels = PROJECT_LEVELS.map((key) => ({ key, count: projects.filter((p) => p.levelKey === key).length }))
    .filter((l) => l.key !== 'khac' || l.count);
  res.render('admin/projects', { projects, levels });
});

router.get('/du-an/moi', (req, res) => {
  res.render('admin/project-form', { project: null, error: null });
});

router.post('/du-an/moi', wrapUpload(uploadMedia, async (req, res) => {
  const t = res.locals.t;
  if (req.uploadError) return res.status(400).render('admin/project-form', { project: req.body, error: uploadErrorText(req, t) });
  const { titleVi, titleEn, schoolName, location, descriptionVi, descriptionEn, featured } = req.body;
  if (!isNonEmpty(titleVi)) {
    return res.status(400).render('admin/project-form', { project: req.body, error: t('admin.projects.errName') });
  }
  const images = fileUrls(req.files && req.files.images);
  const videoFiles = fileUrls(req.files && req.files.videos);
  await Project.create({
    titleVi: titleVi.trim(), titleEn: (titleEn || '').trim(),
    schoolName: (schoolName || '').trim(), location: (location || '').trim(),
    descriptionVi: toPlainText(descriptionVi), descriptionEn: toPlainText(descriptionEn),
    level: readLevel(req.body.level),
    images, videoUrl: videoFiles[0] || null,
    order: await nextOrder(Project), featured: featured === 'on',
  });
  done(req, res, 'admin.flash.created', { name: titleVi.trim() }, '/admin/du-an');
}));

router.get('/du-an/:id/sua', async (req, res) => {
  const project = await Project.findById(req.params.id).lean().catch(() => null);
  if (!project) return notFound(req, res, '/admin/du-an');
  res.render('admin/project-form', { project, error: null });
});

router.post('/du-an/:id/sua', wrapUpload(uploadMedia, async (req, res) => {
  const t = res.locals.t;
  const project = await Project.findById(req.params.id).catch(() => null);
  if (!project) return notFound(req, res, '/admin/du-an');
  if (req.uploadError) return res.status(400).render('admin/project-form', { project: { ...project.toObject(), ...req.body }, error: uploadErrorText(req, t) });

  const { titleVi, titleEn, schoolName, location, descriptionVi, descriptionEn, featured, removeImages } = req.body;
  if (!isNonEmpty(titleVi)) {
    return res.status(400).render('admin/project-form', { project: { ...project.toObject(), ...req.body }, error: t('admin.projects.errName') });
  }

  const images = orderMedia(project.images, req.body.imageOrder, removeImages).concat(fileUrls(req.files && req.files.images));
  const newVideos = fileUrls(req.files && req.files.videos);

  project.titleVi = titleVi.trim();
  project.titleEn = (titleEn || '').trim();
  project.schoolName = (schoolName || '').trim();
  project.location = (location || '').trim();
  project.level = readLevel(req.body.level);
  project.descriptionVi = toPlainText(descriptionVi);
  project.descriptionEn = toPlainText(descriptionEn);
  project.images = images;
  if (newVideos[0]) project.videoUrl = newVideos[0];
  project.featured = featured === 'on';
  await project.save();
  done(req, res, 'admin.flash.updated', { name: project.titleVi }, '/admin/du-an');
}));

router.post('/du-an/:id/xoa', async (req, res) => {
  const project = await Project.findByIdAndDelete(req.params.id).catch(() => null);
  if (!project) return notFound(req, res, '/admin/du-an');
  done(req, res, 'admin.flash.deleted', { name: project.titleVi }, '/admin/du-an');
});

// ---- Products: two sections (Robot / Thiết bị STEM) over the same Product model ----
async function renderProductForm(res, { status = 200, product, section, error = null }) {
  const groups = section.key === 'equipment' ? await equipmentGroups() : [];
  res.status(status).render('admin/product-form', { product, section, error, groups });
}

// Existing equipment groups as { vi, en } pairs, for the form's suggestions and EN auto-fill
async function equipmentGroups() {
  const rows = await Product.find({ ...PRODUCT_SECTIONS.equipment.filter, subcategory: { $ne: '' } }, { subcategory: 1, subcategoryEn: 1 }).lean();
  const map = new Map();
  rows.forEach((r) => { if (!map.get(r.subcategory)) map.set(r.subcategory, r.subcategoryEn || ''); });
  return [...map].map(([vi, en]) => ({ vi, en })).sort((a, b) => a.vi.localeCompare(b.vi, 'vi'));
}

// A posted category must belong to the section the product is in
function categoryFor(section, posted) {
  if (section.key === 'equipment') return 'stem-equipment';
  return section.categories.includes(posted) ? posted : null;
}

// Old URLs from before the Robot / Thiết bị STEM split
router.get('/san-pham', (req, res) => res.redirect('/admin/robot'));
router.get('/san-pham/moi', (req, res) => res.redirect('/admin/robot/moi'));

for (const section of Object.values(PRODUCT_SECTIONS)) {
  router.get(section.path.replace('/admin', ''), async (req, res) => {
    const products = await Product.find(section.filter).sort({ order: 1, _id: 1 }).lean();
    // Equipment: filter chips per "Phần I…IV" part, in catalog order
    const parts = section.key === 'equipment' ? groupEquipmentByPart(products, res.locals.lang, res.locals.t) : [];
    res.render('admin/products', { products, section, parts, partSlug });
  });
  router.get(`${section.path.replace('/admin', '')}/moi`, (req, res) => {
    return renderProductForm(res, { product: null, section });
  });
}

router.post('/san-pham/moi', wrapUpload(uploadMedia, async (req, res) => {
  const t = res.locals.t;
  // The form says which section it came from; otherwise infer it from the category
  const section = PRODUCT_SECTIONS[req.body.section] || sectionForCategory(req.body.category);
  if (req.uploadError) return renderProductForm(res, { status: 400, product: req.body, section, error: uploadErrorText(req, t) });
  const { nameVi, nameEn, subcategory, subcategoryEn, descriptionVi, descriptionEn, featured, comingSoon } = req.body;
  const category = categoryFor(section, req.body.category);
  if (!isNonEmpty(nameVi) || !category) {
    return renderProductForm(res, { status: 400, product: req.body, section, error: t('admin.products.errRequired') });
  }
  await Product.create({
    nameVi: nameVi.trim(), nameEn: (nameEn || '').trim(), category,
    subcategory: (subcategory || '').trim(), subcategoryEn: (subcategoryEn || '').trim(),
    descriptionVi: toPlainText(descriptionVi), descriptionEn: toPlainText(descriptionEn),
    images: fileUrls(req.files && req.files.images), videos: fileUrls(req.files && req.files.videos),
    specs: parseSpecs(req.body), comingSoon: comingSoon === 'on',
    order: await nextOrder(Product, section.filter), featured: featured === 'on',
  });
  done(req, res, 'admin.flash.created', { name: nameVi.trim() }, section.path);
}));

router.get('/san-pham/:id/sua', async (req, res) => {
  const product = await Product.findById(req.params.id).lean().catch(() => null);
  if (!product) return notFound(req, res, PRODUCT_SECTIONS.robot.path);
  return renderProductForm(res, { product, section: sectionForCategory(product.category) });
});

router.post('/san-pham/:id/sua', wrapUpload(uploadMedia, async (req, res) => {
  const t = res.locals.t;
  const product = await Product.findById(req.params.id).catch(() => null);
  if (!product) return notFound(req, res, PRODUCT_SECTIONS.robot.path);
  const section = sectionForCategory(product.category);
  if (req.uploadError) return renderProductForm(res, { status: 400, product: { ...product.toObject(), ...req.body }, section, error: uploadErrorText(req, t) });

  const { nameVi, nameEn, subcategory, subcategoryEn, descriptionVi, descriptionEn, featured, comingSoon, removeImages, removeVideos } = req.body;
  const category = categoryFor(section, req.body.category);
  if (!isNonEmpty(nameVi) || !category) {
    return renderProductForm(res, { status: 400, product: { ...product.toObject(), ...req.body }, section, error: t('admin.products.errRequired') });
  }

  const images = orderMedia(product.images, req.body.imageOrder, removeImages).concat(fileUrls(req.files && req.files.images));
  let videos = product.videos.filter((url) => !([].concat(removeVideos || [])).includes(url));
  videos = videos.concat(fileUrls(req.files && req.files.videos));

  product.nameVi = nameVi.trim();
  product.nameEn = (nameEn || '').trim();
  product.category = category;
  product.subcategory = (subcategory || '').trim();
  product.subcategoryEn = (subcategoryEn || '').trim();
  product.descriptionVi = toPlainText(descriptionVi);
  product.descriptionEn = toPlainText(descriptionEn);
  product.images = images;
  product.videos = videos;
  product.specs = parseSpecs(req.body);
  product.comingSoon = comingSoon === 'on';
  product.featured = featured === 'on';
  await product.save();
  done(req, res, 'admin.flash.updated', { name: product.nameVi }, section.path);
}));

router.post('/san-pham/:id/xoa', async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id).catch(() => null);
  if (!product) return notFound(req, res, PRODUCT_SECTIONS.robot.path);
  done(req, res, 'admin.flash.deleted', { name: product.nameVi }, sectionForCategory(product.category).path);
});

// ---- Services ----
router.get('/dich-vu', async (req, res) => {
  const services = await Service.find().sort({ order: 1, _id: 1 }).lean();
  res.render('admin/services', { services });
});

function renderServiceForm(res, { status = 200, service, errors = [] }) {
  res.status(status).render('admin/service-form', { service, errors, error: errors.length ? errors[0].text : null });
}

router.get('/dich-vu/:id/sua', async (req, res) => {
  const service = await Service.findById(req.params.id).lean().catch(() => null);
  if (!service) return notFound(req, res, '/admin/dich-vu');
  renderServiceForm(res, { service });
});

router.post('/dich-vu/:id/sua', wrapUpload(uploadServiceMedia, async (req, res) => {
  const t = res.locals.t;
  const service = await Service.findById(req.params.id).catch(() => null);
  if (!service) return notFound(req, res, '/admin/dich-vu');
  const files = req.files || {};

  const { titleVi, titleEn, summaryVi, summaryEn, bodyVi, bodyEn } = req.body;
  const { data: sections, errors } = parseServiceSections(req.body, t);
  if (!isNonEmpty(titleVi)) errors.unshift({ tab: 'content', text: t('admin.services.errTitle') });
  if (req.uploadError) errors.unshift({ tab: 'content', text: uploadErrorText(req, t) });
  if (errors.length) {
    // Nothing is saved, so drop the files that came with this submit
    [...(files.heroImage || []), ...(files.gallery || [])].forEach((file) => removeLocalUpload(fileUrl(file)));
    return renderServiceForm(res, {
      status: 400,
      service: { ...service.toObject(), titleVi, titleEn, summaryVi, summaryEn, bodyVi, bodyEn, ...sections },
      errors,
    });
  }

  service.titleVi = titleVi.trim();
  service.titleEn = (titleEn || '').trim();
  service.summaryVi = summaryVi || '';
  service.summaryEn = summaryEn || '';
  service.bodyVi = toPlainText(bodyVi);
  service.bodyEn = toPlainText(bodyEn);
  if (files.heroImage) service.heroImage = fileUrl(files.heroImage[0]);

  const removeGallery = [].concat(req.body.removeGallery || []);
  removeGallery.filter((url) => service.gallery.includes(url)).forEach(removeLocalUpload);
  service.gallery = orderMedia(service.gallery, req.body.galleryOrder, removeGallery).concat(fileUrls(files.gallery));

  service.steps = sections.steps;
  service.packages = sections.packages;
  service.faqs = sections.faqs;
  service.testimonials = sections.testimonials;
  service.questions = sections.questions.map(({ optionsTextVi, optionsTextEn, ...q }) => q);
  await service.save();
  done(req, res, 'admin.flash.updated', { name: service.titleVi }, '/admin/dich-vu');
}));

// ---- Giải pháp pages (a. stem-lab, c. workshop, d. dao-tao, f. tap-huan): banner text + ordered sections ----
const pageMediaOf = (page) => (page.sections || []).flatMap((s) => (s.media || []).flatMap((m) => [m.src, m.poster])).filter(Boolean);

function renderPageForm(res, { status = 200, slug, page, errors = [] }) {
  res.status(status).render('admin/page-form', {
    slug, page, titleKey: SOLUTION_TITLE_KEYS[slug], errors, error: errors.length ? errors[0] : null,
  });
}

router.get('/trang/:slug', async (req, res) => {
  const { slug } = req.params;
  if (!SOLUTION_SLUGS.includes(slug)) return notFound(req, res, '/admin');
  renderPageForm(res, { slug, page: await getSolutionPage(slug) });
});

router.post('/trang/:slug', wrapUpload(uploadPageMedia, async (req, res) => {
  const t = res.locals.t;
  const { slug } = req.params;
  if (!SOLUTION_SLUGS.includes(slug)) return notFound(req, res, '/admin');
  await getSolutionPage(slug); // make sure the page exists
  const page = await SolutionPage.findOne({ slug });
  const before = pageMediaOf(page);

  if (req.uploadError) {
    // The upload failed part-way, so the rest of the form may be incomplete: keep the saved page as it is
    (req.files || []).forEach((file) => removeLocalMedia(fileUrl(file)));
    return renderPageForm(res, { status: 400, slug, page: page.toObject(), errors: [uploadErrorText(req, t)] });
  }

  const { page: data, errors, added } = parseSolutionPageForm(req.body, req.files, { existingMedia: before, fileUrl, prefix: PAGE_MEDIA_PREFIX }, t);
  if (errors.length) {
    added.forEach(removeLocalMedia); // nothing is saved, so drop the files that came with this submit
    data.sections.forEach((s) => { s.media = s.media.filter((m) => !added.includes(m.src)); });
    return renderPageForm(res, { status: 400, slug, page: { ...page.toObject(), ...data }, errors });
  }

  page.sections = data.sections;
  await page.save();
  // Media taken off the page: delete uploaded files (shipped /assets files are never deleted)
  const after = new Set(pageMediaOf(page));
  before.filter((url) => !after.has(url)).forEach(removeLocalMedia);
  done(req, res, 'admin.flash.updated', { name: t(SOLUTION_TITLE_KEYS[slug]) }, `/admin/trang/${slug}`);
}));

// Back to the default content (Cài đặt chung → Khôi phục mặc định); photos uploaded only for the old content are deleted
async function restorePageDefaults(slug) {
  const before = pageMediaOf(await getSolutionPage(slug));
  const after = new Set(pageMediaOf(await resetSolutionPage(slug)));
  before.filter((url) => !after.has(url)).forEach(removeLocalMedia);
}

// ---- Partners ----
router.get('/doi-tac', async (req, res) => {
  const partners = await Partner.find().sort({ order: 1, _id: 1 }).lean();
  res.render('admin/partners', { partners });
});

router.get('/doi-tac/moi', (req, res) => {
  res.render('admin/partner-form', { partner: null, error: null });
});

// Website typed as "tpe.vn" or "https://tpe.vn" -> full link; anything that isn't an http(s) address is refused
function readWebsite(value) {
  const raw = (value || '').trim();
  if (!raw) return { url: null };
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.')) return { url: u.href };
  } catch (err) { /* not an address */ }
  return { error: true };
}

// The partner page's address: typed by the admin or made from the name, never the same as another partner's
async function uniquePartnerSlug(wanted, name, exceptId) {
  const base = slugify(wanted) || slugify(name) || 'doi-tac';
  for (let n = 1; ; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await Partner.exists({ slug, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
    if (!taken) return slug;
  }
}

// Shared by add and edit: the checked form values, or the first error to show
async function readPartnerForm(req, t, exceptId) {
  const { name, url, slug, descriptionVi, descriptionEn, contacts } = req.body;
  if (!isNonEmpty(name)) return { error: t('admin.partners.errName') };
  const website = readWebsite(url);
  if (website.error) return { error: t('admin.partners.errWebsite') };
  return {
    fields: {
      name: name.trim(),
      url: website.url,
      slug: await uniquePartnerSlug(slug, name, exceptId),
      descriptionVi: toPlainText(descriptionVi),
      descriptionEn: toPlainText(descriptionEn),
      contacts: toPlainText(contacts),
    },
  };
}

router.post('/doi-tac/moi', wrapUpload(uploadSingleImage('logo'), async (req, res) => {
  const t = res.locals.t;
  if (req.uploadError) return res.status(400).render('admin/partner-form', { partner: req.body, error: uploadErrorText(req, t) });
  const form = await readPartnerForm(req, t, null);
  if (form.error) return res.status(400).render('admin/partner-form', { partner: req.body, error: form.error });
  await Partner.create({ ...form.fields, order: await nextOrder(Partner), logo: fileUrl(req.file) });
  done(req, res, 'admin.flash.created', { name: form.fields.name }, '/admin/doi-tac');
}));

router.get('/doi-tac/:id/sua', async (req, res) => {
  const partner = await Partner.findById(req.params.id).lean().catch(() => null);
  if (!partner) return notFound(req, res, '/admin/doi-tac');
  res.render('admin/partner-form', { partner, error: null });
});

router.post('/doi-tac/:id/sua', wrapUpload(uploadSingleImage('logo'), async (req, res) => {
  const t = res.locals.t;
  const partner = await Partner.findById(req.params.id).catch(() => null);
  if (!partner) return notFound(req, res, '/admin/doi-tac');
  if (req.uploadError) return res.status(400).render('admin/partner-form', { partner: { ...partner.toObject(), ...req.body }, error: uploadErrorText(req, t) });
  const form = await readPartnerForm(req, t, partner._id);
  if (form.error) return res.status(400).render('admin/partner-form', { partner: { ...partner.toObject(), ...req.body }, error: form.error });
  Object.assign(partner, form.fields);
  if (req.file) partner.logo = fileUrl(req.file);
  await partner.save();
  done(req, res, 'admin.flash.updated', { name: partner.name }, '/admin/doi-tac');
}));

router.post('/doi-tac/:id/xoa', async (req, res) => {
  const partner = await Partner.findByIdAndDelete(req.params.id).catch(() => null);
  if (!partner) return notFound(req, res, '/admin/doi-tac');
  done(req, res, 'admin.flash.deleted', { name: partner.name }, '/admin/doi-tac');
});

// ---- Hỗ trợ (questions on the help page /ho-tro, in the fixed groups of lib/help-topics.js) ----
// The list opened on one group's tab (chip), e.g. after saving a question of that group
const helpTab = (group) => `/admin/ho-tro?nhom=${encodeURIComponent(group)}`;

router.get('/ho-tro', async (req, res) => {
  const items = await getHelpItems({ includeHidden: true });
  res.render('admin/help', { groups: groupHelpItems(items), total: items.length });
});

const renderHelpForm = (res, item, error = null, status = 200) =>
  res.status(status).render('admin/help-form', { item, error, groups: HELP_GROUPS });

// ?nhom=<key> (the "+" of a group) picks that group for a new question
router.get('/ho-tro/moi', (req, res) => {
  const group = HELP_GROUP_KEYS.includes(req.query.nhom) ? req.query.nhom : HELP_GROUP_KEYS[0];
  renderHelpForm(res, { group, published: true });
});

// Shared by add and edit: the checked form values, or the first error to show
function readHelpForm(req, t) {
  const { group, questionVi, questionEn, answerVi, answerEn, published } = req.body;
  if (!HELP_GROUP_KEYS.includes(group)) return { error: t('admin.help.errGroup') };
  if (!isNonEmpty(questionVi)) return { error: t('admin.help.errQuestion') };
  if (!isNonEmpty(answerVi)) return { error: t('admin.help.errAnswer') };
  return {
    fields: {
      group,
      questionVi: questionVi.trim(),
      questionEn: (questionEn || '').trim(),
      answerVi: toPlainText(answerVi),
      answerEn: toPlainText(answerEn),
      published: published === 'on',
    },
  };
}
// The form posted back after an error: what was typed, the tick as it was
const helpFormValues = (body, base = {}) => ({ ...base, ...body, published: body.published === 'on' });

router.post('/ho-tro/moi', async (req, res) => {
  const form = readHelpForm(req, res.locals.t);
  if (form.error) return renderHelpForm(res, helpFormValues(req.body), form.error, 400);
  await HelpItem.create({ ...form.fields, order: await nextOrder(HelpItem, { group: form.fields.group }) });
  done(req, res, 'admin.flash.created', { name: form.fields.questionVi }, helpTab(form.fields.group));
});

router.get('/ho-tro/:id/sua', async (req, res) => {
  const item = await HelpItem.findById(req.params.id).lean().catch(() => null);
  if (!item) return notFound(req, res, '/admin/ho-tro');
  renderHelpForm(res, item);
});

router.post('/ho-tro/:id/sua', async (req, res) => {
  const item = await HelpItem.findById(req.params.id).catch(() => null);
  if (!item) return notFound(req, res, '/admin/ho-tro');
  const form = readHelpForm(req, res.locals.t);
  if (form.error) return renderHelpForm(res, helpFormValues(req.body, item.toObject()), form.error, 400);
  // Moved to another group: it goes to the end of that group
  if (form.fields.group !== item.group) form.fields.order = await nextOrder(HelpItem, { group: form.fields.group });
  Object.assign(item, form.fields);
  await item.save();
  done(req, res, 'admin.flash.updated', { name: item.questionVi }, helpTab(item.group));
});

router.post('/ho-tro/:id/xoa', async (req, res) => {
  const item = await HelpItem.findByIdAndDelete(req.params.id).catch(() => null);
  if (!item) return notFound(req, res, '/admin/ho-tro');
  done(req, res, 'admin.flash.deleted', { name: item.questionVi }, helpTab(item.group));
});

// ---- Articles (tin tức) ----
// The account putting an article up, as stored on it
function uploaderOf(user) {
  return { uploadedBy: user._id, uploaderName: user.name, uploaderRole: user.role };
}

// An article's uploader for its form: the account as it is now, else the stored copy (account deleted), else null
async function uploaderView(article) {
  if (!article) return null;
  const id = article.uploadedBy && (article.uploadedBy._id || article.uploadedBy);
  const user = id ? await User.findById(id, 'name role').lean().catch(() => null) : null;
  if (user) return { id: String(user._id), name: user.name, role: user.role, staff: isStaff(user.role) };
  if (article.uploaderName) return { id: null, name: article.uploaderName, role: article.uploaderRole, gone: true };
  return null;
}

// Owners and admins, the accounts an owner can credit an article to: owners first, then by name
async function staffChoices() {
  const users = await User.find({ role: { $in: ['owner', 'admin'] } }, 'name role').lean();
  return users.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'vi') : a.role === 'owner' ? -1 : 1));
}

// The account an owner picked in "Người đăng"; null for anyone else, "keep", "— Chưa có —" or an id that isn't staff
async function pickedUploader(req) {
  const id = req.body.uploadedBy;
  if (req.user.role !== 'owner' || !id || !mongoose.isValidObjectId(id)) return null;
  const user = await User.findById(id, 'name role').lean().catch(() => null);
  return user && isStaff(user.role) ? user : null;
}

// saved: the article as stored (null for a new one); article: the values to show (the posted ones after a failed save)
async function renderArticleForm(req, res, { article, saved = null, error = null, status = 200 }) {
  const uploader = saved ? await uploaderView(saved) : { id: String(req.user._id), name: req.user.name, role: req.user.role, staff: true };
  let staff = null;
  let picked = null;
  if (req.user.role === 'owner') {
    staff = await staffChoices();
    picked = req.method === 'POST' && req.body.uploadedBy !== undefined ? req.body.uploadedBy
      : !uploader ? '' : uploader.staff ? uploader.id : 'keep';
  }
  res.status(status).render('admin/article-form', { article, error, uploader, staff, picked });
}

router.get('/tin-tuc', async (req, res) => {
  const articles = await Article.find().sort({ order: 1, createdAt: -1 }).populate('uploadedBy', 'name role').lean();
  // The account's current name and role; the stored copy once the account is deleted
  articles.forEach((a) => {
    a.uploader = a.uploadedBy ? { name: a.uploadedBy.name, role: a.uploadedBy.role }
      : a.uploaderName ? { name: a.uploaderName, role: a.uploaderRole } : null;
  });
  res.render('admin/articles', { articles });
});

router.get('/tin-tuc/moi', (req, res) => renderArticleForm(req, res, { article: null }));

router.post('/tin-tuc/moi', wrapUpload(uploadSingleImage('coverImage'), async (req, res) => {
  const t = res.locals.t;
  if (req.uploadError) return renderArticleForm(req, res, { article: req.body, status: 400, error: uploadErrorText(req, t) });
  const { titleVi, titleEn, bodyVi, bodyEn, published } = req.body;
  if (!isNonEmpty(titleVi)) {
    return renderArticleForm(req, res, { article: req.body, status: 400, error: t('admin.articles.errTitle') });
  }
  await Article.create({
    titleVi: titleVi.trim(), titleEn: (titleEn || '').trim(),
    bodyVi: toPlainText(bodyVi), bodyEn: toPlainText(bodyEn),
    coverImage: fileUrl(req.file), published: published === 'on',
    order: await nextOrder(Article, {}, 'first'), // newest news goes to the top
    ...uploaderOf((await pickedUploader(req)) || req.user),
  });
  done(req, res, 'admin.flash.created', { name: titleVi.trim() }, '/admin/tin-tuc');
}));

router.get('/tin-tuc/:id/sua', async (req, res) => {
  const article = await Article.findById(req.params.id).lean().catch(() => null);
  if (!article) return notFound(req, res, '/admin/tin-tuc');
  await renderArticleForm(req, res, { article, saved: article });
});

router.post('/tin-tuc/:id/sua', wrapUpload(uploadSingleImage('coverImage'), async (req, res) => {
  const t = res.locals.t;
  const article = await Article.findById(req.params.id).catch(() => null);
  if (!article) return notFound(req, res, '/admin/tin-tuc');
  if (req.uploadError) return renderArticleForm(req, res, { article: { ...article.toObject(), ...req.body }, saved: article, status: 400, error: uploadErrorText(req, t) });
  const { titleVi, titleEn, bodyVi, bodyEn, published } = req.body;
  if (!isNonEmpty(titleVi)) {
    return renderArticleForm(req, res, { article: { ...article.toObject(), ...req.body }, saved: article, status: 400, error: t('admin.articles.errTitle') });
  }
  article.titleVi = titleVi.trim();
  article.titleEn = (titleEn || '').trim();
  article.bodyVi = toPlainText(bodyVi);
  article.bodyEn = toPlainText(bodyEn);
  article.published = published === 'on';
  if (req.file) article.coverImage = fileUrl(req.file);
  // An owner may credit someone else; otherwise the uploader stays (an older article gets whoever saves it)
  const picked = await pickedUploader(req);
  if (picked) Object.assign(article, uploaderOf(picked));
  else if (!article.uploadedBy && !article.uploaderName) Object.assign(article, uploaderOf(req.user));
  await article.save();
  done(req, res, 'admin.flash.updated', { name: article.titleVi }, '/admin/tin-tuc');
}));

router.post('/tin-tuc/:id/xoa', async (req, res) => {
  const article = await Article.findByIdAndDelete(req.params.id).catch(() => null);
  if (!article) return notFound(req, res, '/admin/tin-tuc');
  done(req, res, 'admin.flash.deleted', { name: article.titleVi }, '/admin/tin-tuc');
});

// ---- Quote requests (yêu cầu tư vấn) ----
router.get('/yeu-cau', async (req, res) => {
  const status = QuoteRequest.STATUSES.includes(req.query.status) ? req.query.status : '';
  const requests = await QuoteRequest.find(status ? { status } : {}).sort({ createdAt: -1 }).lean();
  // Filter chips: the interests found in this tab, in the contact form's order, with their counts
  const interests = QuoteRequest.INTERESTED_IN
    .map((value) => ({ value, count: requests.filter((r) => r.interestedIn === value).length }))
    .filter((o) => o.count > 0);
  res.render('admin/requests', { requests, interests, statusFilter: status, statuses: QuoteRequest.STATUSES });
});

router.post('/yeu-cau/:id/trang-thai', async (req, res) => {
  const back = safeBack(req, '/admin/yeu-cau');
  const status = req.body.status;
  const request = QuoteRequest.STATUSES.includes(status)
    ? await QuoteRequest.findByIdAndUpdate(req.params.id, { status }).catch(() => null)
    : null;
  if (!request) return notFound(req, res, back);
  done(req, res, 'admin.flash.statusUpdated', { name: request.name, status: res.locals.t(`admin.status.${status}`) }, back);
});

router.post('/yeu-cau/:id/xoa', async (req, res) => {
  const back = safeBack(req, '/admin/yeu-cau');
  const request = await QuoteRequest.findByIdAndDelete(req.params.id).catch(() => null);
  if (!request) return notFound(req, res, back);
  done(req, res, 'admin.flash.deleted', { name: request.name }, back);
});

// ---- Users ----
async function renderUsers(res, { status = 200 } = {}) {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  // Owners pinned on top, newest first inside each group (sort is stable). The "Tìm theo" search re-sorts in the browser.
  users.sort((a, b) => (b.role === 'owner') - (a.role === 'owner'));
  res.status(status).render('admin/users', { users, canDeleteUser, canChangeRole });
}

// Permission refused: stay on the list (403) with a red notification
function forbidden(res) {
  res.locals.flash = { type: 'error', text: res.locals.t('admin.flash.forbidden') };
  return renderUsers(res, { status: 403 });
}

router.get('/nguoi-dung', (req, res) => renderUsers(res));

async function findTargetUser(id) {
  return mongoose.isValidObjectId(id) ? User.findById(id).lean() : null;
}

// Only an owner can change roles, and never their own or another owner's (see lib/roles.js)
router.post('/nguoi-dung/:id/vai-tro', async (req, res) => {
  const target = await findTargetUser(req.params.id);
  if (!target) return notFound(req, res, '/admin/nguoi-dung');
  if (!canChangeRole(req.user, target)) return forbidden(res);
  const role = req.body.role === 'admin' ? 'admin' : 'customer';
  await User.updateOne({ _id: target._id }, { role });
  done(req, res, role === 'admin' ? 'admin.flash.promoted' : 'admin.flash.demoted', { name: target.name }, safeBack(req, '/admin/nguoi-dung')); // keeps ?vai-tro=
});

// Owners can delete admins and customers; admins can delete customers only (see lib/roles.js)
router.post('/nguoi-dung/:id/xoa', async (req, res) => {
  const target = await findTargetUser(req.params.id);
  if (!target) return notFound(req, res, '/admin/nguoi-dung');
  if (!canDeleteUser(req.user, target)) return forbidden(res);

  // Keep their consultation requests (they carry their own contact details), just unlink them
  await QuoteRequest.updateMany({ user: target._id }, { $set: { user: null } });
  // Log them out everywhere: connect-mongo stores each session as a JSON string
  await mongoose.connection.collection('sessions').deleteMany({ session: { $regex: `"userId":"${target._id}"` } });
  removeUpload(target.avatar); // also the Cloudinary copy
  await User.deleteOne({ _id: target._id });
  done(req, res, 'admin.flash.userDeleted', { name: target.name }, safeBack(req, '/admin/nguoi-dung'));
});

// ---- Cài đặt chung (site-wide): logo, home hero, page banners ----
async function loadSettings() {
  return (await SiteSettings.findOne()) || SiteSettings.create({});
}

// Settings as plain data for the form; banners as a plain { key: {…} } object
function settingsView(settings) {
  const data = settings.toObject({ flattenMaps: true });
  data.banners = data.banners || {};
  return data;
}

const SETTINGS_TABS = ['brand', 'home', 'banners', 'reset'];

async function renderGeneralSettings(res, { status = 200, settings, tab, error = null }) {
  // "Khôi phục mặc định" tab: the Giải pháp pages, with when each was last saved (none yet = still the default content)
  const saved = await SolutionPage.find({}, { slug: 1, updatedAt: 1 }).lean();
  const resetPages = SOLUTION_SLUGS.map((slug) => {
    const doc = saved.find((p) => p.slug === slug);
    return { slug, name: res.locals.t(SOLUTION_TITLE_KEYS[slug]), updatedAt: doc ? doc.updatedAt : null };
  });
  res.status(status).render('admin/general-settings', {
    settings, banners: BANNERS, openTab: SETTINGS_TABS.includes(tab) ? tab : 'brand', error, resetPages,
    tVi: makeTranslator('vi'), tEn: makeTranslator('en'), // the default texts shown as placeholders
  });
}

router.get('/cai-dat', async (req, res) => {
  await renderGeneralSettings(res, { settings: settingsView(await loadSettings()), tab: req.query.tab });
});

// Cài đặt chung → Khôi phục mặc định: the ticked Giải pháp pages go back to their default content
router.post('/cai-dat/khoi-phuc', async (req, res) => {
  const t = res.locals.t;
  const picked = [].concat(req.body.pages || []).map(String);
  const slugs = SOLUTION_SLUGS.filter((slug) => picked.includes(slug));
  if (!slugs.length) {
    flash(req, 'error', t('admin.general.resetNone'));
    return res.redirect('/admin/cai-dat?tab=reset');
  }
  for (const slug of slugs) await restorePageDefaults(slug);
  done(req, res, 'admin.general.resetDone', { names: slugs.map((slug) => `“${t(SOLUTION_TITLE_KEYS[slug])}”`).join(', ') }, '/admin/cai-dat?tab=reset');
});

router.post('/cai-dat', wrapUpload(uploadSettingsImages, async (req, res) => {
  const t = res.locals.t;
  const settings = await loadSettings();
  const files = req.files || {};
  const body = req.body;
  if (req.uploadError) {
    // The upload stopped part-way, so the rest of the form may be incomplete: keep the saved settings
    Object.values(files).flat().forEach((file) => removeLocalUpload(fileUrl(file)));
    return await renderGeneralSettings(res, { status: 400, settings: settingsView(settings), tab: body.tab, error: uploadErrorText(req, t) });
  }
  const replaced = []; // old images to delete once the new settings are saved
  const swap = (oldUrl, newUrl) => { if (oldUrl && oldUrl !== newUrl) replaced.push(oldUrl); return newUrl; };

  // Brand
  // The previous logo file is kept (logos change rarely and may be reused elsewhere, e.g. as a placeholder)
  if (files.logo) settings.logo = fileUrl(files.logo[0]);

  // Home hero: image + optional text overrides
  settings.heroImages = settings.heroImages || {};
  if (files.heroHome) settings.heroImages.home = swap(settings.heroImages.home, fileUrl(files.heroHome[0]));
  else if (body.removeHeroHome === '1') settings.heroImages.home = swap(settings.heroImages.home, null);
  const line = (v) => toPlainText(typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim();
  settings.homeHero = {
    titleVi: line(body.heroTitleVi), titleEn: line(body.heroTitleEn),
    subtitleVi: line(body.heroSubtitleVi), subtitleEn: line(body.heroSubtitleEn),
  };

  // Page banners: line under the title (empty = default) + optional background image
  for (const { key } of BANNERS) {
    const current = (settings.banners && settings.banners.get(key)) || {};
    let image = current.image || null;
    const upload = files[`banner_${key}`];
    if (upload) image = swap(image, fileUrl(upload[0]));
    else if (body[`removeBanner_${key}`] === '1') image = swap(image, null);
    settings.banners.set(key, { subtitleVi: line(body[`bannerVi_${key}`]), subtitleEn: line(body[`bannerEn_${key}`]), image });
  }

  await settings.save();
  replaced.forEach(removeLocalUpload);
  clearSiteSettingsCache();
  const tab = SETTINGS_TABS.includes(body.tab) ? body.tab : 'brand';
  done(req, res, 'admin.flash.settingsSaved', {}, `/admin/cai-dat?tab=${tab}`);
}));

// ---- Thông tin công ty (Về MTG & Liên hệ): company profile + contact details ----
// The Chính sách bảo mật boxes start with the default draft, filled with the current contact details
const privacyDefaults = (settings) => ({ vi: defaultPolicy('vi', settings), en: defaultPolicy('en', settings) });

router.get('/thong-tin-cong-ty', async (req, res) => {
  const settings = await loadSettings();
  res.render('admin/settings', { settings: settingsView(settings), privacyDefault: privacyDefaults(settings), error: null });
});

router.post('/thong-tin-cong-ty', async (req, res) => {
  const settings = await loadSettings();
  const { companyProfile, companyProfileEn, privacyPolicy, privacyPolicyEn, address, phone, email, mapEmbedUrl } = req.body;
  // Plain text only: any tags typed or pasted in are stripped; the About page formats the paragraphs
  settings.companyProfile = toPlainText(companyProfile);
  settings.companyProfileEn = toPlainText(companyProfileEn);
  // The draft sent back unchanged is stored as empty, so the page keeps following the contact details.
  // A post without the boxes (an older form) leaves the saved policy alone.
  const before = privacyDefaults(settings);
  const ownText = (sent, draft) => (toPlainText(sent) === toPlainText(draft) ? '' : toPlainText(sent));
  if (typeof privacyPolicy === 'string') settings.privacyPolicy = ownText(privacyPolicy, before.vi);
  if (typeof privacyPolicyEn === 'string') settings.privacyPolicyEn = ownText(privacyPolicyEn, before.en);
  settings.contactInfo = {
    address: (address || '').trim(),
    phone: (phone || '').trim(),
    email: (email || '').trim(),
    mapEmbedUrl: (mapEmbedUrl || '').trim(),
  };
  await settings.save();
  clearSiteSettingsCache();
  done(req, res, 'admin.flash.settingsSaved', {}, '/admin/thong-tin-cong-ty');
});

// Unexpected errors (database etc.): for form posts, go back with a red notification instead of an error page
router.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (req.path.startsWith('/thu-tu/')) return res.status(500).json({ ok: false });
  if (req.method === 'POST') {
    flash(req, 'error', res.locals.t('admin.flash.failed'));
    return res.redirect(safeBack(req, '/admin'));
  }
  next(err);
});

module.exports = router;
