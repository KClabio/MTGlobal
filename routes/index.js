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
const { termsText } = require('../lib/terms-of-use');
const { getHelpItems, groupHelpItems } = require('../lib/help-topics');
const requestThrottle = require('../lib/request-throttle');
const requestMail = require('../lib/request-mail');
const { memo, homeCacheSeconds } = require('../lib/memo-cache');

const ROBOT_CATEGORIES = [
  'robot-leo-cau-thang',
  'robot-di-theo-nguoi',
  'robot-cat-co',
  'robot-gia-dinh',
];

// Every partner, in the admin's order (Trang chủ and Về MTG); kept in memory like the rest of Trang chủ's data
const allPartners = () => memo('partners', homeCacheSeconds(), () => Partner.find().sort({ order: 1, _id: 1 }).lean());

router.get('/', async (req, res) => {
  // The same for every visitor, so kept in memory for a minute on the live server (lib/memo-cache.js); the
  // language, settings and logged-in header are still built for each visit
  const [featuredProjects, robots, partners, services] = await memo('home', homeCacheSeconds(), () => Promise.all([
    Project.find().sort({ featured: -1, order: 1, createdAt: -1 }).limit(3).lean(),
    Product.find({ category: { $in: ROBOT_CATEGORIES } }).sort({ order: 1, _id: 1 }).lean(),
    allPartners(),
    Service.find().sort({ order: 1, _id: 1 }).lean(),
  ]));
  const { settings, lang, t } = res.locals;
  const domains = buildHomeDomains({ settings, lang, t, services });
  res.render('index', { featuredProjects, robots, partners, domains });
});

router.get('/ve-mtg', async (req, res) => {
  const partners = await allPartners();
  res.render('about', { partners });
});

// Chính sách bảo mật: the admin's text (Thông tin công ty) or the default draft of lib/privacy-policy.js
router.get('/chinh-sach-bao-mat', (req, res) => {
  const { settings, lang } = res.locals;
  res.render('privacy', { policy: policyText(lang, settings) });
});

// Điều khoản sử dụng: the admin's text (Thông tin công ty) or the default draft of lib/terms-of-use.js
router.get('/dieu-khoan-su-dung', (req, res) => {
  const { settings, lang } = res.locals;
  res.render('terms', { terms: termsText(lang, settings) });
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
  const product = await findRobot(req.params.category);
  if (!product) return res.status(404).render('404');

  const values = { ...readQuoteValues(req), interestedIn: 'san-pham-robot' };
  const robot = { kind: 'product', labelVi: 'Sản phẩm', labelEn: 'Product', valueVi: product.nameVi || product.nameEn || '', valueEn: product.nameEn || product.nameVi || '' };
  const errors = validateQuoteRequest(values, res.locals.t);
  const refused = Object.keys(errors).length ? 400 : await sendRequest(req, res, { ...values, details: [robot] });
  if (refused) {
    return res.status(refused).render('product-detail', {
      product,
      sent: false,
      error: refusedText(refused, res.locals.t),
      errors,
      values,
    });
  }
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
  const service = await Service.findOne({ slug: req.params.slug }).lean();
  if (!service) return res.status(404).render('404');

  const interestedIn = QuoteRequest.INTERESTED_IN.includes(service.slug) ? service.slug : 'khac';
  const values = { ...readQuoteValues(req), interestedIn };
  const answers = readServiceAnswers(service, req.body, res.locals.t);
  const errors = { ...validateQuoteRequest(values, res.locals.t), ...answers.errors };
  const refused = Object.keys(errors).length ? 400 : await sendRequest(req, res, { ...values, details: answers.details });
  if (refused) {
    return res.status(refused).render('service-detail', {
      service,
      sent: false,
      error: refusedText(refused, res.locals.t),
      errors,
      values: { ...values, ...answers.values },
    });
  }
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
// Anyone may send a request. An account only fills the form in from the profile and lists the requests in "Tài khoản".
router.get('/lien-he', (req, res) => {
  // ?da-gui=1: the thank-you card after sending (a redirect, so reloading it doesn't send the request again)
  res.render('contact', { sent: req.query['da-gui'] === '1', error: null, errors: {}, values: {}, prefillInterestedIn: req.query.quan_tam || null });
});

// "/giai-phap/workshop" for a page of this site; '' for anything else (another site, a made-up value)
const sitePath = (value) => (typeof value === 'string' && /^\/(?!\/)[^\s?#]{0,200}$/.test(value) ? value : '');

function saveQuoteRequest(values, user, req) {
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
    sourcePage: req.path.replace(/\/yeu-cau$/, ''), // the page whose form sent it
    cameFrom: sitePath(values.cameFrom),
  });
}

// Saves a checked request and tells staff and the sender by email (lib/request-mail.js, not waited for).
// Returns 0 when done, or 429 when this address already sent 5 requests without an account this hour
// (lib/request-throttle.js). A filled-in hidden "website" box (a trap only robots see: partials/quote-form.ejs)
// is answered as if sent, but nothing is saved.
async function sendRequest(req, res, values) {
  if (typeof req.body.website === 'string' && req.body.website.trim()) return 0;
  if (!req.user && !(await requestThrottle.take('guestRequest', req.ip))) return 429;
  const request = await saveQuoteRequest(values, req.user, req);
  requestMail.notifyNewRequest(request, { req, lang: res.locals.lang, user: req.user });
  return 0;
}

const refusedText = (status, t) => t(status === 429 ? 'forms.errTooManyRequests' : 'forms.errSummary');

router.post('/lien-he', async (req, res) => {
  const values = readQuoteValues(req);

  const errors = validateQuoteRequest(values, res.locals.t);
  const refused = Object.keys(errors).length ? 400 : await sendRequest(req, res, values);
  if (refused) {
    return res.status(refused).render('contact', {
      sent: false,
      error: refusedText(refused, res.locals.t),
      errors,
      values,
      prefillInterestedIn: values.interestedIn || null,
    });
  }
  res.redirect(303, '/lien-he?da-gui=1');
});

module.exports = router;
