const express = require('express');
const router = express.Router();

const Project = require('../models/Project');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Partner = require('../models/Partner');
const Article = require('../models/Article');
const QuoteRequest = require('../models/QuoteRequest');
const { validateQuoteRequest, readQuoteValues } = require('../lib/quote-request'); // also used to change a sent request (routes/account.js)
const { readServiceAnswers } = require('../lib/service-content');
const { getSolutionPage, TITLE_KEYS: SOLUTION_TITLE_KEYS, SLUGS: SOLUTION_SLUGS } = require('../lib/solution-pages');
const { groupProjectsByLevel } = require('../lib/project-levels');
const { buildHomeDomains, buildSolutionCards, buildServiceCards } = require('../lib/home-domains');
const { groupEquipmentByPart, partSlug } = require('../lib/equipment-parts');
const { policyText } = require('../lib/privacy-policy');
const { getHelpItems, groupHelpItems } = require('../lib/help-topics');

const ROBOT_CATEGORIES = [
  'robot-leo-cau-thang',
  'robot-di-theo-nguoi',
  'robot-cat-co',
  'robot-gia-dinh',
];

router.get('/', async (req, res) => {
  const [featuredProjects, robots, partners, services] = await Promise.all([
    Project.find().sort({ featured: -1, order: 1, createdAt: -1 }).limit(3).lean(),
    Product.find({ category: { $in: ROBOT_CATEGORIES } }).sort({ order: 1, _id: 1 }).lean(),
    Partner.find().sort({ order: 1, _id: 1 }).lean(),
    Service.find().sort({ order: 1, _id: 1 }).lean(),
  ]);
  const { settings, lang, t } = res.locals;
  const domains = buildHomeDomains({ settings, lang, t, robots, services });
  res.render('index', { featuredProjects, robots, partners, domains });
});

router.get('/ve-mtg', async (req, res) => {
  const partners = await Partner.find().sort({ order: 1, _id: 1 }).lean();
  res.render('about', { partners });
});

// Chính sách bảo mật: the admin's text (Thông tin công ty) or the default draft of lib/privacy-policy.js
router.get('/chinh-sach-bao-mat', (req, res) => {
  const { settings, lang } = res.locals;
  res.render('privacy', { policy: policyText(lang, settings) });
});

// Hỗ trợ: questions and answers on using the website, in fixed groups (lib/help-topics.js, Admin → Hỗ trợ)
router.get('/ho-tro', async (req, res) => {
  const groups = groupHelpItems(await getHelpItems()).filter((g) => g.items.length);
  res.render('help', { groups });
});

// A partner's own page (opened from its logo on the home and Về MTG pages), with a button to its website
router.get('/doi-tac/:slug', async (req, res) => {
  const partner = await Partner.findOne({ slug: String(req.params.slug) }).lean();
  if (!partner) return res.status(404).render('404');
  res.render('partner-detail', { partner });
});

// ---- Sản phẩm (Products — robotics) ----
router.get('/san-pham', async (req, res) => {
  const robots = await Product.find({ category: { $in: ROBOT_CATEGORIES } }).sort({ order: 1, _id: 1 }).lean();
  res.render('products', { robots });
});

async function findRobot(category) {
  if (!ROBOT_CATEGORIES.includes(category)) return null;
  return Product.findOne({ category }).lean();
}

router.get('/san-pham/:category', async (req, res) => {
  const product = await findRobot(req.params.category);
  if (!product) return res.status(404).render('404');
  res.render('product-detail', { product, sent: req.query['da-gui'] === '1' });
});

// Requests sent from a robot's page are always "Sản phẩm Robot thông minh" (the category isn't taken from the form),
// and they note which robot they are about (shown with the request in the admin and in "Yêu cầu của tôi")
router.post('/san-pham/:category/yeu-cau', async (req, res) => {
  if (needsLogin(req, res)) return;
  const product = await findRobot(req.params.category);
  if (!product) return res.status(404).render('404');

  const values = { ...readQuoteValues(req), interestedIn: 'san-pham-robot' };
  const robot = { kind: 'product', labelVi: 'Sản phẩm', labelEn: 'Product', valueVi: product.nameVi || product.nameEn || '', valueEn: product.nameEn || product.nameVi || '' };
  const errors = validateQuoteRequest(values, res.locals.t);
  if (Object.keys(errors).length) {
    return res.status(400).render('product-detail', {
      product,
      sent: false,
      error: res.locals.t('forms.errSummary'),
      errors,
      values,
    });
  }

  await saveQuoteRequest({ ...values, details: [robot] }, req.user);
  // Redirect after POST so a page refresh doesn't send the request twice
  res.redirect(303, `/san-pham/${product.category}?da-gui=1#yeu-cau`);
});

// ---- Giải pháp (STEM Lab solution) ----
// Giải pháp landing page: one card per solution page (a–f), like the Dịch vụ landing page
router.get('/giai-phap', async (req, res) => {
  const projects = await Project.find().sort({ featured: -1, order: 1, createdAt: -1 }).limit(1).lean();
  const { settings, lang, t } = res.locals;
  res.render('solutions', { cards: buildSolutionCards({ settings, lang, t, projects }) });
});

router.get('/giai-phap/du-an', async (req, res) => {
  const projects = await Project.find().sort({ order: 1, createdAt: -1 }).lean();
  res.render('projects', { projects, groups: groupProjectsByLevel(projects) });
});

router.get('/giai-phap/du-an/:id', async (req, res) => {
  const project = await Project.findById(req.params.id).lean().catch(() => null);
  if (!project) return res.status(404).render('404');
  res.render('project-detail', { project });
});

router.get('/giai-phap/thiet-bi', async (req, res) => {
  const equipment = await Product.find({ category: 'stem-equipment' }).sort({ order: 1, _id: 1 }).lean();
  const { lang, t } = res.locals;
  res.render('equipment', { parts: groupEquipmentByPart(equipment, lang, t) });
});

router.get('/giai-phap/thiet-bi/:id', async (req, res) => {
  const item = await Product.findById(req.params.id).lean().catch(() => null);
  if (!item || item.category !== 'stem-equipment') return res.status(404).render('404');
  // Back to the same Phần tab of the catalog
  res.render('equipment-detail', { item, backHref: `/giai-phap/thiet-bi#${partSlug(item.subcategory)}` });
});

// Editable pages (a. stem-lab, c. workshop, d. dao-tao, f. tap-huan), managed in Admin → Giải pháp
for (const slug of SOLUTION_SLUGS) {
  router.get(`/giai-phap/${slug}`, async (req, res) => {
    const page = await getSolutionPage(slug);
    res.render('solution-page', { page, titleKey: SOLUTION_TITLE_KEYS[slug] });
  });
}

// ---- Dịch vụ (Services) ----
router.get('/dich-vu', async (req, res) => {
  const services = await Service.find().sort({ order: 1, _id: 1 }).lean();
  res.render('services', { cards: buildServiceCards({ lang: res.locals.lang, services }) });
});

router.get('/dich-vu/:slug', async (req, res) => {
  const service = await Service.findOne({ slug: req.params.slug }).lean();
  if (!service) return res.status(404).render('404');
  res.render('service-detail', { service, sent: req.query['da-gui'] === '1' });
});

// A service page's request: the category is the service itself, plus answers to that service's own questions
router.post('/dich-vu/:slug/yeu-cau', async (req, res) => {
  if (needsLogin(req, res)) return;
  const service = await Service.findOne({ slug: req.params.slug }).lean();
  if (!service) return res.status(404).render('404');

  const interestedIn = QuoteRequest.INTERESTED_IN.includes(service.slug) ? service.slug : 'khac';
  const values = { ...readQuoteValues(req), interestedIn };
  const answers = readServiceAnswers(service, req.body, res.locals.t);
  const errors = { ...validateQuoteRequest(values, res.locals.t), ...answers.errors };
  if (Object.keys(errors).length) {
    return res.status(400).render('service-detail', {
      service,
      sent: false,
      error: res.locals.t('forms.errSummary'),
      errors,
      values: { ...values, ...answers.values },
    });
  }

  await saveQuoteRequest({ ...values, details: answers.details }, req.user);
  res.redirect(303, `/dich-vu/${service.slug}?da-gui=1#yeu-cau`);
});

// ---- Tin tức (News) ----
router.get('/tin-tuc', async (req, res) => {
  const articles = await Article.find({ published: true }).sort({ order: 1, createdAt: -1 }).lean();
  res.render('news', { articles });
});

router.get('/tin-tuc/:id', async (req, res) => {
  const article = await Article.findById(req.params.id).lean().catch(() => null);
  if (!article || !article.published) return res.status(404).render('404');
  res.render('article-detail', { article });
});

// ---- Liên hệ / quote requests ----
// Consultation requests need an account: a logged-out visitor goes to the login page, which says why
// ("Xin hãy đăng nhập để yêu cầu tư vấn"). The robot and Dịch vụ pages show a login box instead of their form.
function needsLogin(req, res) {
  if (req.user) return false;
  res.redirect(303, '/dang-nhap?yeu-cau=1');
  return true;
}

router.get('/lien-he', (req, res) => {
  if (needsLogin(req, res)) return;
  // ?da-gui=1: the thank-you card after sending (a redirect, so reloading it doesn't send the request again)
  res.render('contact', { sent: req.query['da-gui'] === '1', error: null, errors: {}, values: {}, prefillInterestedIn: req.query.quan_tam || null });
});

function saveQuoteRequest(values, user) {
  return QuoteRequest.create({
    name: values.name,
    phone: values.phone,
    email: values.email,
    schoolOrCompany: values.schoolOrCompany,
    message: values.message,
    interestedIn: values.interestedIn,
    details: values.details || [],
    user: user ? user._id : null,
    privacyAcceptedAt: new Date(), // the form refuses to send without the consent tick (lib/quote-request.js)
  });
}

router.post('/lien-he', async (req, res) => {
  if (needsLogin(req, res)) return;
  const values = readQuoteValues(req);

  const errors = validateQuoteRequest(values, res.locals.t);
  if (Object.keys(errors).length) {
    return res.status(400).render('contact', {
      sent: false,
      error: res.locals.t('forms.errSummary'),
      errors,
      values,
      prefillInterestedIn: values.interestedIn || null,
    });
  }

  await saveQuoteRequest(values, req.user);
  res.redirect(303, '/lien-he?da-gui=1');
});

module.exports = router;
