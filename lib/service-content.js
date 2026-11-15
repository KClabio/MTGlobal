// Service pages: the admin editor's repeatable sections, and the extra questions on each service's request form.
const crypto = require('crypto');
const { toPlainText } = require('./text');
const { makeTranslator } = require('./i18n');
const { QUESTION_TYPES, CARD_ICONS } = require('../models/Service');

const LIMITS = { steps: 10, packages: 6, faqs: 20, testimonials: 10, questions: 10, options: 20, answer: 200, cards: 8, cardItems: 10, heading: 120 };
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

// Tư vấn du học: the STEM study-abroad program with KC Education (from the owner's text and the two posters in
// public/assets/dich-vu/du-hoc). Written into the database once by scripts/fill-du-hoc.js, and by the seed.
const DU_HOC_ASSETS = '/assets/dich-vu/du-hoc/';
const DU_HOC_CONTENT = {
  summaryVi: 'Xây dựng hồ sơ du học STEM từ sớm: học tập vững vàng, dự án Robotics thực tế và thành tích thi đấu, cùng KC Education và MTG.',
  summaryEn: 'Build a STEM study-abroad profile early: strong academics, real robotics projects and competition results, with KC Education and MTG.',
  bodyVi: [
    'Ươm mầm tài năng – Vươn ra thế giới.',
    'MTG cùng KC Education xây dựng chương trình giúp học sinh hình thành hồ sơ du học STEM từ sớm, kết hợp học tập xuất sắc, dự án thực tế và hoạt động ý nghĩa. Chương trình dựa trên kinh nghiệm đào tạo và thi đấu VEX Robotics của KC Education và các giải pháp giáo dục STEM của MTG.',
    'Vì sao nên chọn chương trình này?\n- Lộ trình bài bản từ sớm\n- Kết hợp học tập, nghiên cứu và hoạt động thực tiễn\n- Dự án và cuộc thi thật, như VEX Robotics\n- Hỗ trợ tư vấn chuyên sâu\n- Đồng hành cùng KC Education và MTG',
    'Ví dụ một định hướng hồ sơ: Robotics Engineering, thiết kế và chế tạo robot, tham gia VEX Robotics và các cuộc thi quốc tế.',
    'Hành trang vững vàng – Tự tin du học STEM.',
  ].join('\n\n'),
  bodyEn: [
    'Dream Global – Start with STEM.',
    "MTG and KC Education run a program that helps students build a STEM study-abroad profile early, combining strong academics, real projects and meaningful activities. It draws on KC Education's experience in VEX Robotics training and competitions and on MTG's STEM education solutions.",
    'Why choose our program?\n- A structured path that starts early\n- Learning, research and hands-on activities together\n- Real projects and competitions, such as VEX Robotics\n- Expert guidance and mentoring\n- With KC Education and MTG, from Vietnam to the world',
    'An example profile direction: Robotics Engineering, designing and building robots and taking part in VEX Robotics and international competitions.',
    'Your STEM future. Our commitment.',
  ].join('\n\n'),
  heroImage: DU_HOC_ASSETS + 'poster-vi.jpg',
  heroImageEn: DU_HOC_ASSETS + 'poster-en.jpg',
  cardImage: DU_HOC_ASSETS + 'hoc-sinh-vex.jpg',
  cardsTitleVi: 'Hồ sơ du học STEM gồm những gì?',
  cardsTitleEn: 'What goes into a STEM study-abroad profile?',
  cards: [
    { icon: 'graduation-cap', titleVi: 'Hồ sơ học thuật', titleEn: 'Academic profile',
      itemsVi: ['Bảng điểm THCS/THPT', 'Nền tảng Toán, Vật lý, Hóa học', 'Chứng chỉ tiếng Anh (IELTS/TOEFL), SAT/ACT', 'Các chứng chỉ học thuật, như CREST Award'],
      itemsEn: ['Secondary and high school transcripts', 'Strong Math, Physics and Chemistry', 'English certificates (IELTS/TOEFL), SAT/ACT', 'Academic certificates, such as the CREST Award'] },
    { icon: 'cpu', titleVi: 'Năng lực STEM', titleEn: 'STEM competence',
      itemsVi: ['Dự án Robotics, AI, IoT', 'Nghiên cứu khoa học', 'Thiết kế kỹ thuật, sản phẩm sáng tạo', 'Portfolio dự án'],
      itemsEn: ['Robotics, AI and IoT projects', 'Scientific research', 'Engineering design and creative products', 'Project portfolio'] },
    { icon: 'trophy', titleVi: 'Thành tích nổi bật', titleEn: 'Achievements',
      itemsVi: ['Thành tích VEX Robotics Competition', 'Các cuộc thi khoa học kỹ thuật', 'Các cuộc thi quốc tế', 'Các chứng nhận nghiên cứu, sáng tạo'],
      itemsEn: ['VEX Robotics Competition results', 'Science and technology competitions', 'International competitions', 'Research and innovation certificates'] },
    { icon: 'users', titleVi: 'Hoạt động ngoại khóa', titleEn: 'Activities & leadership',
      itemsVi: ['Câu lạc bộ STEM/Robotics', 'Hoạt động cộng đồng', 'Vai trò lãnh đạo, tổ chức và hướng dẫn hoạt động STEM', 'Các dự án STEM phục vụ cộng đồng'],
      itemsEn: ['STEM/Robotics clubs', 'Community activities', 'Leading, organising and mentoring STEM activities', 'STEM projects that serve the community'] },
    { icon: 'file-text', titleVi: 'Hồ sơ ứng tuyển', titleEn: 'Application package',
      itemsVi: ['Personal Statement', 'Statement of Purpose (SOP), tùy chương trình', 'Thư giới thiệu (LOR)', 'CV học thuật', 'Portfolio dự án STEM'],
      itemsEn: ['Personal Statement', 'Statement of Purpose (SOP), depending on the program', 'Recommendation letters (LOR)', 'Academic CV', 'STEM project portfolio'] },
  ],
  stepsTitleVi: 'Lộ trình xây dựng hồ sơ du học STEM',
  stepsTitleEn: 'Your STEM journey',
  steps: [
    { titleVi: 'Đánh giá năng lực', titleEn: 'Assess your strengths', textVi: 'Xác định điểm mạnh và mục tiêu du học.', textEn: 'Find your strengths and your study-abroad goals.' },
    { titleVi: 'Phát triển dự án STEM', titleEn: 'Develop STEM projects', textVi: 'Tham gia Robotics, nghiên cứu, sáng tạo.', textEn: 'Robotics, research and creative work.' },
    { titleVi: 'Tích lũy thành tích', titleEn: 'Join competitions & activities', textVi: 'Thi đấu, đạt giải, hoạt động xã hội.', textEn: 'Compete, win awards and serve the community.' },
    { titleVi: 'Hoàn thiện hồ sơ', titleEn: 'Complete your application', textVi: 'Chuẩn bị hồ sơ ấn tượng (bao gồm CREST Award).', textEn: 'Prepare a strong application (including the CREST Award).' },
    { titleVi: 'Du học thành công', titleEn: 'Study abroad', textVi: 'Bước ra thế giới.', textEn: 'Step out into the world.' },
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

  // "Thẻ nội dung": only read when the editor sent its panel (cardsPosted), so a save from an older form keeps the cards
  let cards;
  if (body.cardsPosted !== undefined) {
    const bullet = (l) => l.replace(/^[-*•✓]\s*/, '');
    cards = rows(body, { titleVi: 'cardTitleVi', titleEn: 'cardTitleEn', itemsVi: 'cardItemsVi', itemsEn: 'cardItemsEn', icon: 'cardIcon' })
      .map((r) => ({
        titleVi: r.titleVi.trim(), titleEn: r.titleEn.trim(),
        itemsVi: lines(r.itemsVi).map(bullet), itemsEn: lines(r.itemsEn).map(bullet),
        icon: CARD_ICONS.includes(r.icon) ? r.icon : 'check-circle',
      }))
      .filter((r) => r.titleVi || r.titleEn || r.itemsVi.length || r.itemsEn.length);
    cards.forEach((r, i) => {
      if (!r.titleVi && !r.titleEn) fail('cards', 'admin.services.errCardTitle', { n: i + 1 });
      if (r.itemsVi.length > LIMITS.cardItems || r.itemsEn.length > LIMITS.cardItems) fail('cards', 'admin.services.errTooManyCardItems', { n: i + 1, max: LIMITS.cardItems });
    });
  }

  // Block headings: a field that wasn't posted keeps its saved value (undefined here)
  const heading = (name, tab) => {
    if (body[name] === undefined) return undefined;
    const text = str([].concat(body[name])[0]).trim(); // a repeated field: its first value
    if (text.length > LIMITS.heading) fail(tab, 'admin.services.errHeadingTooLong', { max: LIMITS.heading });
    return text;
  };
  const headings = {
    cardsTitleVi: heading('cardsTitleVi', 'cards'), cardsTitleEn: heading('cardsTitleEn', 'cards'),
    stepsTitleVi: heading('stepsTitleVi', 'steps'), stepsTitleEn: heading('stepsTitleEn', 'steps'),
  };

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
  if (cards) tooMany('cards', cards, LIMITS.cards, 'admin.services.errTooManyCards');

  // Fields left out (undefined) are not in data, so they never replace what is saved
  const data = { steps, packages, faqs, testimonials, questions, cards, ...headings };
  Object.keys(data).forEach((k) => { if (data[k] === undefined) delete data[k]; });
  return { data, errors };
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

module.exports = { LIMITS, STARTER_QUESTIONS, DU_HOC_CONTENT, parseServiceSections, readServiceAnswers };
