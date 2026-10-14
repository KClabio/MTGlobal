const express = require('express');
const router = express.Router();

const Project = require('../models/Project');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Partner = require('../models/Partner');
const Article = require('../models/Article');
const QuoteRequest = require('../models/QuoteRequest');
const { isNonEmpty, isValidEmail, isValidPhone } = require('../lib/validators');
const { readServiceAnswers } = require('../lib/service-content');
const { getSolutionPage, TITLE_KEYS: SOLUTION_TITLE_KEYS, SLUGS: SOLUTION_SLUGS } = require('../lib/solution-pages');

const ROBOT_CATEGORIES = [
  'robot-leo-cau-thang',
  'robot-di-theo-nguoi',
  'robot-cat-co',
  'robot-gia-dinh',
];

router.get('/', async (req, res) => {
  const [featuredProjects, robots, partners] = await Promise.all([
    Project.find().sort({ featured: -1, order: 1, createdAt: -1 }).limit(3).lean(),
    Product.find({ category: { $in: ROBOT_CATEGORIES } }).sort({ order: 1, _id: 1 }).lean(),
    Partner.find().sort({ order: 1, _id: 1 }).lean(),
  ]);
  res.render('index', { featuredProjects, robots, partners });
});

router.get('/ve-mtg', async (req, res) => {
  const partners = await Partner.find().sort({ order: 1, _id: 1 }).lean();
  res.render('about', { partners });
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

// Requests sent from a robot's page are always "Sản phẩm Robot thông minh"; the category isn't taken from the form
router.post('/san-pham/:category/yeu-cau', async (req, res) => {
  const product = await findRobot(req.params.category);
  if (!product) return res.status(404).render('404');

  const values = { ...readQuoteValues(req), interestedIn: 'san-pham-robot' };
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

  await saveQuoteRequest(values, req.user);
  // Redirect after POST so a page refresh doesn't send the request twice
  res.redirect(303, `/san-pham/${product.category}?da-gui=1#yeu-cau`);
});

// ---- Giải pháp (STEM Lab solution) ----
router.get('/giai-phap/du-an', async (req, res) => {
  const projects = await Project.find().sort({ order: 1, createdAt: -1 }).lean();
  res.render('projects', { projects });
});

router.get('/giai-phap/du-an/:id', async (req, res) => {
  const project = await Project.findById(req.params.id).lean().catch(() => null);
  if (!project) return res.status(404).render('404');
  res.render('project-detail', { project });
});

router.get('/giai-phap/thiet-bi', async (req, res) => {
  const equipment = await Product.find({ category: 'stem-equipment' }).sort({ order: 1, _id: 1 }).lean();
  res.render('equipment', { equipment });
});

router.get('/giai-phap/thiet-bi/:id', async (req, res) => {
  const item = await Product.findById(req.params.id).lean().catch(() => null);
  if (!item || item.category !== 'stem-equipment') return res.status(404).render('404');
  res.render('equipment-detail', { item });
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
  res.render('services', { services });
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
router.get('/lien-he', (req, res) => {
  res.render('contact', { sent: false, error: null, errors: {}, values: {}, prefillInterestedIn: req.query.quan_tam || null });
});

// Gatekeeping for the request form: name and message required, plus at least one valid way to reach the sender
function validateQuoteRequest(values, t) {
  const errors = {};
  if (!isNonEmpty(values.name)) errors.name = t('forms.errName');
  if (!values.phone && !values.email) {
    errors.contact = t('forms.errContact');
  } else {
    if (values.phone && !isValidPhone(values.phone)) errors.phone = t('forms.errPhone');
    if (values.email && !isValidEmail(values.email)) errors.email = t('forms.errEmail');
  }
  if (!isNonEmpty(values.message)) errors.message = t('forms.errMessage');
  return errors;
}

function readQuoteValues(req) {
  const field = (key) => (typeof req.body[key] === 'string' ? req.body[key].trim() : '');
  return {
    name: field('name'),
    phone: field('phone'),
    email: field('email'),
    schoolOrCompany: field('schoolOrCompany'),
    message: field('message'),
    interestedIn: QuoteRequest.INTERESTED_IN.includes(field('interestedIn')) ? field('interestedIn') : 'khac',
  };
}

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
  });
}

router.post('/lien-he', async (req, res) => {
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
  res.render('contact', { sent: true, error: null, errors: {}, values: {}, prefillInterestedIn: null });
});

module.exports = router;
