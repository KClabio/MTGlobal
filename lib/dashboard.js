// Data + chart geometry for the admin dashboard. The view only draws what is computed here.
const Project = require('../models/Project');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Partner = require('../models/Partner');
const Article = require('../models/Article');
const QuoteRequest = require('../models/QuoteRequest');
const User = require('../models/User');

const TZ = 'Asia/Ho_Chi_Minh';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Vietnam has no DST
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = 6;

// Status colours are theme tokens (public/css/theme.css), validated with the dataviz palette checker in light and dark;
// each status is also shown with an icon + label, never by colour alone.
const STATUS_STYLE = {
  moi: { color: 'var(--status-new)', icon: 'clock' },
  da_lien_he: { color: 'var(--status-contacted)', icon: 'phone' },
  hoan_tat: { color: 'var(--status-done)', icon: 'check-circle' },
};

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

// Last N calendar months in Vietnam time, oldest first: [{ key: '2026-05', label: 'T5' | 'May', title: 'Tháng 5/2026' | 'May 2026' }]
function lastMonths(n, t) {
  const vnNow = new Date(Date.now() + VN_OFFSET_MS);
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    // English month names for the EN templates ("{name}"); the VI templates use the number ("T{m}")
    const monthName = (style) => d.toLocaleString('en-US', { month: style, timeZone: 'UTC' });
    months.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      label: t('admin.dashboard.monthShort', { m, name: monthName('short') }),
      title: t('admin.dashboard.monthLong', { m, y, name: monthName('long') }),
      start: new Date(d.getTime() - VN_OFFSET_MS),
    });
  }
  return months;
}

// Round the axis maximum up to 4 even integer steps (at least 4)
function niceAxis(max) {
  const step = Math.max(1, Math.ceil(max / 4));
  return { max: step * 4, ticks: [0, step, step * 2, step * 3, step * 4] };
}

// Column chart geometry in a fixed viewBox; the SVG scales to its container
function columnChart(points) {
  const W = 560, H = 230, left = 34, right = 8, top = 14, bottom = 30;
  const plotW = W - left - right, plotH = H - top - bottom;
  const axis = niceAxis(Math.max(...points.map((p) => p.value), 0));
  const slot = plotW / points.length;
  const barW = Math.min(44, slot * 0.56);
  const y = (v) => top + plotH - (v / axis.max) * plotH;
  return {
    W, H, left, right, top, bottom, baseline: top + plotH,
    ticks: axis.ticks.map((v) => ({ value: v, y: y(v) })),
    bars: points.map((p, i) => {
      const cx = left + slot * i + slot / 2;
      const h = (p.value / axis.max) * plotH;
      const x = cx - barW / 2;
      const barTop = y(p.value);
      const base = y(0);
      // Rounded top corners only; the bar stays square on the baseline
      const r = Math.min(4, h, barW / 2);
      const d = h > 0
        ? `M${x},${base} V${barTop + r} Q${x},${barTop} ${x + r},${barTop} H${x + barW - r} Q${x + barW},${barTop} ${x + barW},${barTop + r} V${base} Z`
        : '';
      return { ...p, cx, x, w: barW, h, y: barTop, d, slotX: left + slot * i, slotW: slot };
    }),
  };
}

function relativeTime(date, t, lang) {
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('admin.dashboard.justNow');
  if (min < 60) return t('admin.dashboard.minutesAgo', { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t('admin.dashboard.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('admin.dashboard.daysAgo', { n: days });
  return new Date(date).toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN', { timeZone: TZ });
}

async function getDashboardData(t, lang) {
  const months = lastMonths(MONTHS, t);
  const now = Date.now();

  const [
    statusAgg, interestAgg, monthAgg, totalRequests, requestsLast7, latest,
    customers, staff, newCustomers30,
    projects, robots, equipment, services, partners, articlesTotal, articlesPublished,
  ] = await Promise.all([
    QuoteRequest.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    QuoteRequest.aggregate([{ $group: { _id: '$interestedIn', n: { $sum: 1 } } }]),
    QuoteRequest.aggregate([
      { $match: { createdAt: { $gte: months[0].start } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: TZ } }, n: { $sum: 1 } } },
    ]),
    QuoteRequest.countDocuments(),
    QuoteRequest.countDocuments({ createdAt: { $gte: new Date(now - 7 * DAY_MS) } }),
    QuoteRequest.find().sort({ createdAt: -1 }).limit(5).lean(),
    User.countDocuments({ role: 'customer' }),
    User.countDocuments({ role: { $in: ['owner', 'admin'] } }),
    User.countDocuments({ role: 'customer', createdAt: { $gte: new Date(now - 30 * DAY_MS) } }),
    Project.countDocuments(),
    Product.countDocuments({ category: { $ne: 'stem-equipment' } }),
    Product.countDocuments({ category: 'stem-equipment' }),
    Service.countDocuments(),
    Partner.countDocuments(),
    Article.countDocuments(),
    Article.countDocuments({ published: true }),
  ]);

  const byStatus = Object.fromEntries(statusAgg.map((s) => [s._id, s.n]));
  const statuses = QuoteRequest.STATUSES.map((key) => ({
    key,
    label: t(`admin.status.${key}`),
    count: byStatus[key] || 0,
    percent: pct(byStatus[key] || 0, totalRequests),
    ...STATUS_STYLE[key],
  }));

  const byInterest = Object.fromEntries(interestAgg.map((s) => [s._id, s.n]));
  const interestMax = Math.max(0, ...Object.values(byInterest));
  const interests = QuoteRequest.INTERESTED_IN
    .map((key) => ({ key, label: t(`admin.interest.${key}`), count: byInterest[key] || 0 }))
    .map((r) => ({ ...r, percent: pct(r.count, totalRequests), width: interestMax ? (r.count / interestMax) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);

  const byMonth = Object.fromEntries(monthAgg.map((m) => [m._id, m.n]));
  const monthly = columnChart(months.map((m) => ({ key: m.key, label: m.label, title: m.title, value: byMonth[m.key] || 0 })));
  const monthTotal = monthly.bars.reduce((sum, b) => sum + b.value, 0);

  return {
    kpis: {
      newRequests: byStatus.moi || 0,
      requestsLast7,
      totalRequests,
      completionRate: pct(byStatus.hoan_tat || 0, totalRequests),
      customers,
      staff,
      newCustomers30,
      articlesPublished,
      articlesTotal,
    },
    statuses,
    interests,
    monthly,
    monthTotal,
    latest: latest.map((r) => ({
      name: r.name,
      interest: t(`admin.interest.${r.interestedIn}`),
      status: r.status,
      statusLabel: t(`admin.status.${r.status}`),
      when: relativeTime(r.createdAt, t, lang),
    })),
    content: [
      { label: t('admin.nav.projects'), count: projects, icon: 'folder-kanban', href: '/admin/du-an' },
      { label: t('admin.nav.robots'), count: robots, icon: 'bot', href: '/admin/robot' },
      { label: t('admin.nav.equipment'), count: equipment, icon: 'cpu', href: '/admin/thiet-bi' },
      { label: t('admin.nav.services'), count: services, icon: 'briefcase', href: '/admin/dich-vu' },
      { label: t('admin.nav.partners'), count: partners, icon: 'handshake', href: '/admin/doi-tac' },
      { label: t('admin.nav.news'), count: articlesTotal, icon: 'newspaper', href: '/admin/tin-tuc' },
    ],
  };
}

module.exports = { getDashboardData };
