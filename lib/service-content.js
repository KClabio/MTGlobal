// Service pages: the admin editor's repeatable sections, and the extra questions on each service's request form.
const crypto = require('crypto');
const { toPlainText } = require('./text');
const { makeTranslator } = require('./i18n');
const { QUESTION_TYPES } = require('../models/Service');

const LIMITS = { steps: 10, packages: 6, faqs: 20, testimonials: 10, questions: 10, options: 20, answer: 200 };
const KEY_PATTERN = /^[a-z0-9_-]{1,32}$/;

const choice = (labelVi, labelEn, options, required = false, key) => ({
  key, labelVi, labelEn, type: 'choice', required,
  options: options.map(([vi, en]) => ({ vi, en })),
});

// Starter questions, added once to services that have none (scripts/service-questions.js and the seed)
const STARTER_QUESTIONS = {
  'tu-van-du-hoc': [
    choice('Quốc gia muốn đến', 'Destination country', [
      ['Úc', 'Australia'], ['Mỹ', 'United States'], ['Canada', 'Canada'], ['Anh', 'United Kingdom'],
      ['Nhật Bản', 'Japan'], ['Hàn Quốc', 'South Korea'], ['Singapore', 'Singapore'], ['Khác', 'Other'],
    ], true, 'country'),
    choice('Bậc học dự định', 'Intended level of study', [
      ['THPT', 'High school'], ['Cao đẳng', 'College'], ['Đại học', 'Undergraduate'], ['Thạc sĩ', "Master's"], ['Khác', 'Other'],
    ], false, 'level'),
    { key: 'start-year', labelVi: 'Năm dự kiến nhập học', labelEn: 'Intended start year', type: 'number', required: false, options: [] },
    choice('Ngân sách dự kiến mỗi năm', 'Budget per year', [
      ['Dưới 300 triệu', 'Under 300 million VND'], ['300–600 triệu', '300–600 million VND'],
      ['600 triệu – 1 tỷ', '600 million – 1 billion VND'], ['Trên 1 tỷ', 'Over 1 billion VND'], ['Chưa xác định', 'Not decided yet'],
    ], false, 'budget'),
  ],
  'phan-phoi-san-pham': [
    choice('Bạn là', 'You are', [
      ['Trường học', 'School'], ['Đại lý bán lẻ', 'Retailer'], ['Doanh nghiệp', 'Business'], ['Cá nhân', 'Individual'],
    ], true, 'customer-type'),
    choice('Sản phẩm quan tâm', 'Products of interest', [
      ['Thiết bị STEM', 'STEM equipment'], ['Robot giáo dục (VEX, mBot…)', 'Educational robots (VEX, mBot…)'],
      ['Robot thông minh', 'Smart robots'], ['Khác', 'Other'],
    ], false, 'products'),
    { key: 'quantity', labelVi: 'Số lượng dự kiến', labelEn: 'Estimated quantity', type: 'number', required: false, options: [] },
    { key: 'province', labelVi: 'Tỉnh / Thành phố', labelEn: 'Province / City', type: 'text', required: false, options: [] },
  ],
};

const newKey = () => 'q' + crypto.randomBytes(4).toString('hex');
const str = (value) => (typeof value === 'string' ? value : '');
const list = (body, name) => [].concat(body[name] === undefined ? [] : body[name]).map(str);
const lines = (text) => str(text).replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);

// Reads the parallel arrays a group of repeatable rows posts (field1[], field2[] ...), one object per row, in page order
function rows(body, fields) {
  const columns = Object.fromEntries(Object.entries(fields).map(([prop, name]) => [prop, list(body, name)]));
  const count = Math.max(0, ...Object.values(columns).map((c) => c.length));
  return Array.from({ length: count }, (_, i) => Object.fromEntries(Object.keys(fields).map((prop) => [prop, columns[prop][i] || ''])));
}

// The editor's sections -> clean data + a list of problems (translated with t, tagged with the editor tab they belong to)
function parseServiceSections(body, t) {
  const errors = []; // { tab, text }: the editor opens the tab holding the first problem
  const fail = (tab, key, vars) => errors.push({ tab, text: t(key, vars) });

  const steps = rows(body, { titleVi: 'stepTitleVi', titleEn: 'stepTitleEn', textVi: 'stepTextVi', textEn: 'stepTextEn' })
    .map((r) => ({ titleVi: r.titleVi.trim(), titleEn: r.titleEn.trim(), textVi: toPlainText(r.textVi), textEn: toPlainText(r.textEn) }))
    .filter((r) => r.titleVi || r.titleEn || r.textVi || r.textEn);
  steps.forEach((r, i) => { if (!r.titleVi && !r.titleEn) fail('steps', 'admin.services.errStepTitle', { n: i + 1 }); });

  let highlightTaken = false;
  const packages = rows(body, {
    nameVi: 'packageNameVi', nameEn: 'packageNameEn', priceVi: 'packagePriceVi', priceEn: 'packagePriceEn',
    featuresVi: 'packageFeaturesVi', featuresEn: 'packageFeaturesEn', highlighted: 'packageHighlighted',
  })
    .map((r) => ({
      nameVi: r.nameVi.trim(), nameEn: r.nameEn.trim(), priceVi: r.priceVi.trim(), priceEn: r.priceEn.trim(),
      featuresVi: lines(r.featuresVi).map((l) => l.replace(/^[-*•]\s*/, '')), featuresEn: lines(r.featuresEn).map((l) => l.replace(/^[-*•]\s*/, '')),
      highlighted: r.highlighted === '1',
    }))
    .filter((r) => r.nameVi || r.nameEn || r.priceVi || r.priceEn || r.featuresVi.length || r.featuresEn.length)
    .map((r) => { const highlighted = r.highlighted && !highlightTaken; if (highlighted) highlightTaken = true; return { ...r, highlighted }; });
  packages.forEach((r, i) => { if (!r.nameVi && !r.nameEn) fail('packages', 'admin.services.errPackageName', { n: i + 1 }); });

  const faqs = rows(body, { questionVi: 'faqQuestionVi', questionEn: 'faqQuestionEn', answerVi: 'faqAnswerVi', answerEn: 'faqAnswerEn' })
    .map((r) => ({ questionVi: r.questionVi.trim(), questionEn: r.questionEn.trim(), answerVi: toPlainText(r.answerVi), answerEn: toPlainText(r.answerEn) }))
    .filter((r) => r.questionVi || r.questionEn || r.answerVi || r.answerEn);
  faqs.forEach((r, i) => {
    if ((!r.questionVi && !r.questionEn) || (!r.answerVi && !r.answerEn)) fail('faqs', 'admin.services.errFaq', { n: i + 1 });
  });

  const testimonials = rows(body, { quoteVi: 'testimonialQuoteVi', quoteEn: 'testimonialQuoteEn', author: 'testimonialAuthor', role: 'testimonialRole' })
    .map((r) => ({ quoteVi: toPlainText(r.quoteVi), quoteEn: toPlainText(r.quoteEn), author: r.author.trim(), role: r.role.trim() }))
    .filter((r) => r.quoteVi || r.quoteEn || r.author || r.role);
  testimonials.forEach((r, i) => { if (!r.quoteVi && !r.quoteEn) fail('media', 'admin.services.errTestimonial', { n: i + 1 }); });

  const usedKeys = new Set();
  const questions = rows(body, {
    key: 'questionKey', labelVi: 'questionLabelVi', labelEn: 'questionLabelEn', type: 'questionType',
    required: 'questionRequired', optionsVi: 'questionOptionsVi', optionsEn: 'questionOptionsEn',
  })
    .filter((r) => r.labelVi.trim() || r.labelEn.trim() || lines(r.optionsVi).length || lines(r.optionsEn).length)
    .map((r, i) => {
      let key = r.key.trim();
      if (!KEY_PATTERN.test(key) || usedKeys.has(key)) key = newKey();
      usedKeys.add(key);
      const type = QUESTION_TYPES.includes(r.type) ? r.type : 'text';
      const q = { key, labelVi: r.labelVi.trim(), labelEn: r.labelEn.trim(), type, required: r.required === '1', options: [] };
      if (!q.labelVi) fail('form', 'admin.services.errQuestionLabel', { n: i + 1 });
      if (type === 'choice') {
        const vi = lines(r.optionsVi).slice(0, LIMITS.options);
        const en = lines(r.optionsEn).slice(0, LIMITS.options);
        if (vi.length < 2) fail('form', 'admin.services.errQuestionOptions', { n: i + 1 });
        else if (en.length && en.length !== vi.length) fail('form', 'admin.services.errQuestionOptionsMatch', { n: i + 1 });
        q.options = vi.map((v, j) => ({ vi: v, en: en[j] || '' }));
        // Keep what was typed so the form can be shown again unchanged after an error
        q.optionsTextVi = r.optionsVi; q.optionsTextEn = r.optionsEn;
      }
      return q;
    });

  const tooMany = (tab, items, limit, key) => { if (items.length > limit) fail(tab, key, { max: limit }); };
  tooMany('steps', steps, LIMITS.steps, 'admin.services.errTooManySteps');
  tooMany('packages', packages, LIMITS.packages, 'admin.services.errTooManyPackages');
  tooMany('faqs', faqs, LIMITS.faqs, 'admin.services.errTooManyFaqs');
  tooMany('media', testimonials, LIMITS.testimonials, 'admin.services.errTooManyTestimonials');
  tooMany('form', questions, LIMITS.questions, 'admin.services.errTooManyQuestions');

  return { data: { steps, packages, faqs, testimonials, questions }, errors };
}

const viT = makeTranslator('vi');
const enT = makeTranslator('en');

// A visitor's answers to a service's questions -> { values (to refill the form), details (snapshot to save), errors }
function readServiceAnswers(service, body, t) {
  const values = {};
  const details = [];
  const errors = {};

  for (const q of service.questions || []) {
    const name = 'q_' + q.key;
    const raw = str(body[name]).trim();
    values[name] = raw;
    if (raw.length > LIMITS.answer) { errors[name] = t('forms.errAnswerTooLong', { max: LIMITS.answer }); continue; }
    if (!raw) { if (q.required) errors[name] = t('forms.errAnswerRequired'); continue; }

    if (q.type === 'choice') {
      const index = /^\d{1,2}$/.test(raw) ? Number(raw) : -1;
      const option = q.options[index];
      if (!option) { errors[name] = t('forms.errAnswerChoice'); continue; }
      details.push({ labelVi: q.labelVi, labelEn: q.labelEn, valueVi: option.vi, valueEn: option.en || option.vi });
    } else if (q.type === 'number') {
      if (!/^\d{1,12}([.,]\d{1,4})?$/.test(raw)) { errors[name] = t('forms.errAnswerNumber'); continue; }
      details.push({ labelVi: q.labelVi, labelEn: q.labelEn, valueVi: raw, valueEn: raw });
    } else {
      details.push({ labelVi: q.labelVi, labelEn: q.labelEn, valueVi: raw, valueEn: raw });
    }
  }

  // "Gói quan tâm": only offered when the service lists packages
  if ((service.packages || []).length) {
    const raw = str(body.q__package).trim();
    values.q__package = raw;
    if (raw) {
      const pkg = /^\d{1,2}$/.test(raw) ? service.packages[Number(raw)] : null;
      if (!pkg) errors.q__package = t('forms.errAnswerChoice');
      else {
        details.push({
          labelVi: viT('services.packageField'), labelEn: enT('services.packageField'),
          valueVi: pkg.nameVi || pkg.nameEn, valueEn: pkg.nameEn || pkg.nameVi,
        });
      }
    }
  }

  return { values, details, errors };
}

module.exports = { LIMITS, STARTER_QUESTIONS, parseServiceSections, readServiceAnswers };
