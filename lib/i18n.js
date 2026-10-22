const vi = require('../locales/vi.json');
const en = require('../locales/en.json');

const DICTS = { vi, en };
const SUPPORTED = ['vi', 'en'];
const ONE_YEAR = 1000 * 60 * 60 * 24 * 365;

function get(dict, key) {
  return key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : null), dict);
}

// t('a.b', { n: 3 }) -> looks up the key (falling back to Vietnamese) and fills {n} placeholders
function makeTranslator(lang) {
  const dict = DICTS[lang] || DICTS.vi;
  return (key, vars) => {
    let text = get(dict, key) ?? get(DICTS.vi, key) ?? key;
    if (vars && typeof text === 'string') {
      text = text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? vars[name] : m));
    }
    return text;
  };
}

// Pick the right field off a bilingual doc, e.g. pick(project, 'title') -> project.titleVi/titleEn
function makePicker(lang) {
  return (doc, field) => {
    if (!doc) return '';
    const enKey = `${field}En`;
    const viKey = `${field}Vi`;
    if (lang === 'en' && doc[enKey]) return doc[enKey];
    return doc[viKey] || doc[enKey] || '';
  };
}

// Current URL with one query parameter set (used by the language switches)
function urlWithParam(req, name, value) {
  const url = new URL(req.originalUrl, 'http://internal');
  url.searchParams.set(name, value);
  return url.pathname + url.search;
}

// Reads ?<param>=vi|en (remembered in a cookie), else the cookie, else Vietnamese
function resolveLang(req, res, param, cookieName) {
  let lang = req.query[param];
  if (lang && SUPPORTED.includes(lang)) {
    res.cookie(cookieName, lang, { maxAge: ONE_YEAR, sameSite: 'lax' });
    return lang;
  }
  lang = req.cookies && req.cookies[cookieName];
  return SUPPORTED.includes(lang) ? lang : 'vi';
}

// Public website language (cookie "lang", switch with ?lang=en)
function loadLanguage(req, res, next) {
  const lang = resolveLang(req, res, 'lang', 'lang');
  res.locals.lang = lang;
  res.locals.t = makeTranslator(lang);
  res.locals.pick = makePicker(lang);
  res.locals.switchLangUrl = (targetLang) => urlWithParam(req, 'lang', targetLang);
  res.locals.langSwitched = req.method === 'GET' && SUPPORTED.includes(req.query.lang); // opened from VI / EN: fades in (header.ejs)
  next();
}

// Admin language, remembered separately from the website's (cookie "adminLang", switch with ?alang=en)
function loadAdminLanguage(req, res, next) {
  const lang = resolveLang(req, res, 'alang', 'adminLang');
  res.locals.lang = lang;
  res.locals.t = makeTranslator(lang);
  res.locals.pick = makePicker(lang);
  res.locals.adminLangUrl = (targetLang) => urlWithParam(req, 'alang', targetLang);
  next();
}

module.exports = { loadLanguage, loadAdminLanguage, makeTranslator, SUPPORTED };
