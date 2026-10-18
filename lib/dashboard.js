// Data + chart geometry for the admin dashboard. The view only draws what is computed here.
const Project = require('../models/Project');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Partner = require('../models/Partner');
const Article = require('../models/Article');
const QuoteRequest = require('../models/QuoteRequest');
const User = require('../models/User');
const { groupEquipmentByPart } = require('./equipment-parts');

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

// Stack order from the baseline up: settled requests at the bottom, the newest on top (top-to-bottom = the key's order)
const STACK = ['hoan_tat', 'da_lien_he', 'moi'];
const SEG_GAP = 2; // surface gap between stacked sections

// A bar shape from `base` (bottom, y) up to `top`, optionally with rounded top corners
function barPath(x, w, base, top, rounded) {
  const h = base - top;
  if (h <= 0) return '';
  const r = rounded ? Math.min(4, h, w / 2) : 0;
  return r
    ? `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`
    : `M${x},${base} V${top} H${x + w} V${base} Z`;
}

// Column chart geometry in a fixed viewBox; the SVG scales to its container. Each column is split into status
// sections (points[i].parts), and the line joins the column tops: the month's total, to read growth.
function columnChart(points) {
  const W = 560, H = 230, left = 34, right = 8, top = 14, bottom = 30;
  const plotW = W - left - right, plotH = H - top - bottom;
  const axis = niceAxis(Math.max(...points.map((p) => p.value), 0));
  const slot = plotW / points.length;
  const barW = Math.min(44, slot * 0.56);
  const y = (v) => top + plotH - (v / axis.max) * plotH;
  const chart = {
    W, H, left, right, top, bottom, baseline: top + plotH,
    ticks: axis.ticks.map((v) => ({ value: v, y: y(v) })),
    bars: points.map((p, i) => {
      const cx = left + slot * i + slot / 2;
      const h = (p.value / axis.max) * plotH;
      const x = cx - barW / 2;
      const barTop = y(p.value);
      const base = y(0);
      // The whole column (hover glow): rounded top corners only, square on the baseline
      const d = barPath(x, barW, base, barTop, true);
      // Status sections, stacked from the baseline; a 2px gap above each lower section; only the top one is rounded
      const parts = p.parts || {};
      const filled = STACK.filter((key) => parts[key] > 0);
      let count = 0;
      const segments = filled.map((key, k) => {
        const bottom = y(count);
        count += parts[key];
        const top = y(count);
        const segBase = k > 0 && bottom - top > SEG_GAP ? bottom - SEG_GAP : bottom;
        return { key, n: parts[key], color: STATUS_STYLE[key].color, top: round(top), d: barPath(x, barW, segBase, top, k === filled.length - 1) };
      });
      // The line point: the month's total (top of the column), same scale as the bars (never a second axis)
      return { ...p, cx, x, w: barW, h, y: barTop, d, segments, lineY: y(p.value), slotX: left + slot * i, slotW: slot };
    }),
  };
  chart.linePath = chart.bars.map((b, i) => `${i ? 'L' : 'M'}${round(b.cx)},${round(b.lineY)}`).join(' ');
  // When the drawing line reaches each point (0..1 of its draw time), so the dots pop exactly as it passes
  let run = 0;
  const lengths = chart.bars.map((b, i) => {
    if (i) run += Math.hypot(b.cx - chart.bars[i - 1].cx, b.lineY - chart.bars[i - 1].lineY);
    return run;
  });
  chart.bars.forEach((b, i) => { b.at = run ? round(timeForProgress(lengths[i] / run, LINE_EASE) * 1000) / 1000 : i / Math.max(1, chart.bars.length - 1); });
  return chart;
}

// The line draws with this easing (public/css/admin.css .chart-line): fast at first, slowing into the latest month
const LINE_EASE = [0.25, 1, 0.5, 1];

// Inverse of a CSS cubic-bezier easing: the time (0..1) at which the animation reaches `progress`
function timeForProgress(progress, [x1, y1, x2, y2]) {
  const bez = (s, a, b) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let prev = { x: 0, y: 0 };
  for (let k = 1; k <= 1000; k++) {
    const s = k / 1000;
    const cur = { x: bez(s, x1, x2), y: bez(s, y1, y2) };
    if (cur.y >= progress) return prev.x + ((progress - prev.y) / (cur.y - prev.y || 1)) * (cur.x - prev.x);
    prev = cur;
  }
  return 1;
}

const round = (n) => Math.round(n * 100) / 100;

// Pie of { count, … } items (the interest pie): clockwise from 12 o'clock. Each slice knows its middle angle so it
// can slide outward ("explode") on hover; the reveal sweep is a mask in the view.
function pieChart(items) {
  const S = 220, c = S / 2, r = 90, EXPLODE = 8;
  const total = items.reduce((sum, s) => sum + s.count, 0);
  const point = (angle) => [round(c + r * Math.sin(angle)), round(c - r * Math.cos(angle))];
  let start = 0;
  const slices = items.filter((s) => s.count > 0).map((s) => {
    const sweep = (s.count / total) * Math.PI * 2;
    const end = start + sweep;
    const mid = start + sweep / 2;
    let d;
    if (sweep >= Math.PI * 2 - 1e-6) {
      d = `M${c},${c - r} A${r},${r} 0 1,1 ${c - 0.01},${c - r} Z`; // a single status: the whole circle
    } else {
      const [x1, y1] = point(start);
      const [x2, y2] = point(end);
      d = `M${c},${c} L${x1},${y1} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0},1 ${x2},${y2} Z`;
    }
    start = end;
    return { ...s, d, dx: round(Math.sin(mid) * EXPLODE), dy: round(-Math.cos(mid) * EXPLODE), whole: sweep >= Math.PI * 2 - 1e-6 };
  });
  // Reveal mask: a circle of radius m drawn with a stroke 2m wide covers the disc (plus the exploded edge);
  // animating its dash offset from the full length to 0 sweeps the pie in clockwise
  const maskR = round((r + EXPLODE + 4) / 2);
  return { S, c, r, total, slices, maskR, circumference: round(2 * Math.PI * maskR) };
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

// Interest pie: the 4 groups of the "Bạn quan tâm đến" list; a click opens a group's own pie (public/js/admin.js).
// Colours: theme tokens (public/css/theme.css), clear of the status colours the monthly columns use.
const GROUP_COLOR = { solutions: 'var(--interest-1)', products: 'var(--interest-3)', services: 'var(--interest-4)', khac: 'var(--interest-other)' };
const CHILD_COLORS = ['var(--interest-1)', 'var(--interest-2)', 'var(--interest-3)', 'var(--interest-4)', 'var(--interest-5)'];
const MAX_ROBOTS = 4; // named robots in the "Sản phẩm" pie; any more join "Robot khác"

// Legend rows (zeros included) + pie geometry (slices for counts > 0 only) for one pie
function interestPieOf(items, total) {
  const rows = items.map((it) => ({ ...it, percent: pct(it.count, total) }));
  return { rows, total, chart: pieChart(rows) };
}

async function getDashboardData(t, lang) {
  const months = lastMonths(MONTHS, t);
  const now = Date.now();

  const [
    statusAgg, interestAgg, robotAgg, monthAgg, totalRequests, requestsLast7, latest,
    customers, newCustomers30,
    projects, robots, equipmentItems, services, partners, articlesTotal, articlesPublished,
  ] = await Promise.all([
    QuoteRequest.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    QuoteRequest.aggregate([{ $group: { _id: '$interestedIn', n: { $sum: 1 } } }]),
    // "Sản phẩm" requests by the robot they named (their "Sản phẩm: …" line; older requests by its label)
    QuoteRequest.aggregate([
      { $match: { interestedIn: 'san-pham-robot' } },
      { $unwind: '$details' },
      { $match: { $or: [{ 'details.kind': 'product' }, { 'details.kind': { $in: ['', null] }, 'details.labelVi': 'Sản phẩm' }] } },
      { $group: { _id: { vi: '$details.valueVi', en: '$details.valueEn' }, n: { $sum: 1 } } },
      { $sort: { n: -1, '_id.vi': 1 } },
    ]),
    QuoteRequest.aggregate([
      { $match: { createdAt: { $gte: months[0].start } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: TZ } },
        n: { $sum: 1 },
        // that month's requests by their status now (the sections of its column)
        moi: { $sum: { $cond: [{ $eq: ['$status', 'moi'] }, 1, 0] } },
        da_lien_he: { $sum: { $cond: [{ $eq: ['$status', 'da_lien_he'] }, 1, 0] } },
        hoan_tat: { $sum: { $cond: [{ $eq: ['$status', 'hoan_tat'] }, 1, 0] } },
      } },
    ]),
    QuoteRequest.countDocuments(),
    QuoteRequest.countDocuments({ createdAt: { $gte: new Date(now - 7 * DAY_MS) } }),
    QuoteRequest.find().sort({ createdAt: -1 }).limit(5).lean(),
    User.countDocuments({ role: 'customer' }),
    User.countDocuments({ role: 'customer', createdAt: { $gte: new Date(now - 30 * DAY_MS) } }),
    Project.countDocuments(),
    Product.countDocuments({ category: { $ne: 'stem-equipment' } }),
    Product.find({ category: 'stem-equipment' }, { subcategory: 1, subcategoryEn: 1 }).lean(), // the catalogue pie (by part)
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

  // Interest pie: 4 groups, and inside each its own choices (Sản phẩm: the robots named)
  const count = (code) => byInterest[code] || 0;
  const groups = QuoteRequest.INTEREST_GROUPS.map((g) => ({ key: g.key, label: t(`forms.interestGroup.${g.key}`), count: g.codes.reduce((sum, c) => sum + count(c), 0), color: GROUP_COLOR[g.key], drill: true }))
    .concat({ key: 'khac', label: t('admin.interest.khac'), count: count('khac'), color: GROUP_COLOR.khac, drill: false });
  const children = {};
  QuoteRequest.INTEREST_GROUPS.forEach((g) => {
    const group = groups.find((x) => x.key === g.key);
    let items;
    if (g.key === 'products') {
      const named = robotAgg.map((r) => ({ label: (lang === 'en' && r._id.en) || r._id.vi, count: r.n }));
      const shown = named.slice(0, MAX_ROBOTS);
      const extra = named.slice(MAX_ROBOTS).reduce((sum, r) => sum + r.count, 0);
      const unknown = Math.max(0, group.count - named.reduce((sum, r) => sum + r.count, 0));
      items = shown.map((r, i) => ({ key: `robot-${i}`, label: r.label, count: r.count, color: CHILD_COLORS[i] }));
      if (extra) items.push({ key: 'robot-other', label: t('admin.dashboard.robotOther'), count: extra, color: CHILD_COLORS[MAX_ROBOTS] });
      if (unknown) items.push({ key: 'robot-unknown', label: t('admin.dashboard.robotUnknown'), count: unknown, color: 'var(--interest-other)' });
    } else {
      items = g.codes.map((code, i) => ({ key: code, label: t(`admin.interest.${code}`), count: count(code), color: CHILD_COLORS[i % CHILD_COLORS.length] }));
    }
    children[g.key] = { key: g.key, label: group.label, ...interestPieOf(items, group.count) };
  });
  const interestPie = { top: interestPieOf(groups, totalRequests), children };

  // Catalogue pie ("Thiết bị, học liệu, Robot STEM" tab): items per part (Phần I…IV), grouped like the website's tabs
  const equipment = equipmentItems.length;
  const parts = groupEquipmentByPart(equipmentItems, lang, t);
  const equipmentPie = interestPieOf(parts.map((p, i) => ({
    key: p.slug,
    label: p.name ? `${p.label} · ${p.name}` : p.label,
    count: p.count,
    color: p.slug === 'khac' ? 'var(--interest-other)' : CHILD_COLORS[i % CHILD_COLORS.length],
  })), equipment);

  const byMonth = Object.fromEntries(monthAgg.map((m) => [m._id, m]));
  const monthly = columnChart(months.map((m) => {
    const row = byMonth[m.key] || {};
    const parts = Object.fromEntries(QuoteRequest.STATUSES.map((key) => [key, row[key] || 0]));
    // Tooltip: "Tháng 10/2026: 5 yêu cầu · Mới 2 · Đã liên hệ 1 · Hoàn tất 2" (statuses with requests only)
    const tipParts = QuoteRequest.STATUSES.filter((key) => parts[key] > 0).map((key) => ` · ${t(`admin.status.${key}`)} ${parts[key]}`).join('');
    return { key: m.key, label: m.label, title: m.title, value: row.n || 0, parts,
      tip: t('admin.dashboard.tipMonthStatus', { month: m.title, n: row.n || 0, parts: tipParts }) };
  }));
  // The key under the chart: Mới, Đã liên hệ, Hoàn tất (colour + icon + name)
  monthly.legend = QuoteRequest.STATUSES.map((key) => ({ key, label: t(`admin.status.${key}`), ...STATUS_STYLE[key] }));
  const monthTotal = monthly.bars.reduce((sum, b) => sum + b.value, 0);

  return {
    kpis: {
      newRequests: byStatus.moi || 0,
      requestsLast7,
      totalRequests,
      completionRate: pct(byStatus.hoan_tat || 0, totalRequests),
      customers,
      newCustomers30,
      articlesPublished,
      articlesTotal,
    },
    statuses,
    interestPie,
    equipmentPie,
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
