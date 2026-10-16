// Business area cards, used by the home page "Lĩnh vực hoạt động" slider (one card per area, in menu order; all services
// share one "Dịch vụ" card), by the Giải pháp landing page /giai-phap (the six solution pages, a–f), the Dịch vụ landing
// page /dich-vu and the "Khám phá thêm" cards at the bottom of each Giải pháp page. Card text stays in sync with what
// the admin already edits: the page banner line (Cài đặt chung → Banner các trang) for the robot, solution and services
// pages, and the service title + summary for each service. Pictures prefer uploaded content
// (a robot photo, a service hero image) and fall back to the photos shipped in public/assets.
const { bannerFor } = require('./banners');

const DOMAINS = [
  { key: 'products', url: '/san-pham', titleKey: 'nav.products', bannerKey: 'products', icon: 'bot', accent: 'blue',
    image: '/assets/home/robot-leo-cau-thang.jpg' },
  { key: 'stem-lab', url: '/giai-phap/stem-lab', titleKey: 'nav.solutionOverview', bannerKey: 'stem-lab', icon: 'layout-template', accent: 'green',
    image: '/assets/giai-phap/tu-van-thiet-ke/3d-toan-canh.jpg' },
  { key: 'thiet-bi', url: '/giai-phap/thiet-bi', titleKey: 'nav.solutionEquipment', bannerKey: 'thiet-bi', icon: 'cpu', accent: 'blue',
    image: '/assets/giai-phap/robot-stem/vex-iq.png', contain: true },
  { key: 'workshop', url: '/giai-phap/workshop', titleKey: 'nav.solutionWorkshop', bannerKey: 'workshop', icon: 'wrench', accent: 'orange',
    image: '/assets/giai-phap/workshop/hoc-sinh-lap-rap-1.jpg' },
  { key: 'dao-tao', url: '/giai-phap/dao-tao', titleKey: 'nav.solutionEducation', bannerKey: 'dao-tao', icon: 'graduation-cap', accent: 'green',
    image: '/assets/giai-phap/dao-tao/giao-vien-petrovietnam-thuc-hanh.jpg' },
  { key: 'tap-huan', url: '/giai-phap/tap-huan', titleKey: 'nav.solutionTraining', bannerKey: 'tap-huan', icon: 'presentation', accent: 'orange',
    image: '/assets/giai-phap/tap-huan/giao-luu-clb-stem.jpg' },
  // All services in one card that opens the Dịch vụ landing page (/dich-vu)
  { key: 'dich-vu', url: '/dich-vu', titleKey: 'nav.services', bannerKey: 'services', icon: 'briefcase', accent: 'blue', image: null },
];

// Each service's own card (Dịch vụ landing page). No photo for study abroad yet: its card shows branded colour art
// with its icon until a service hero image is uploaded.
const SERVICE_ART = {
  'tu-van-du-hoc': { icon: 'globe', accent: 'blue', image: null },
  'phan-phoi-san-pham': { icon: 'package', accent: 'orange', image: '/assets/giai-phap/robot-stem/vex-go-kit.png', contain: true },
};

// [{ key, url, title, text, image, contain, icon, accent }] for the view; a service that no longer exists is skipped
function buildHomeDomains({ settings, lang, t, robots = [], services = [] }) {
  const en = lang === 'en';
  const robotPhoto = (robots.find((r) => r.images && r.images.length) || {}).images;
  const servicePhoto = (services.find((s) => s.heroImage) || {}).heroImage;
  return DOMAINS.map((d) => {
    let uploaded = null;
    let text = bannerFor(settings, d.bannerKey, lang).subtitle;
    if (d.key === 'products' && robotPhoto) uploaded = robotPhoto[0];
    if (d.key === 'dich-vu') {
      if (!services.length) return null;
      uploaded = servicePhoto || null;
      text = text || services.map((s) => (en && s.titleEn) || s.titleVi).join(' · ');
    }
    return {
      key: d.key, url: d.url, icon: d.icon, accent: d.accent,
      title: t(d.titleKey),
      text,
      image: uploaded || d.image, contain: !uploaded && !!d.contain,
    };
  }).filter(Boolean);
}

// Dịch vụ landing page (/dich-vu): one card per service, in admin order
function buildServiceCards({ lang, services = [] }) {
  const en = lang === 'en';
  return services.map((s) => {
    const art = SERVICE_ART[s.slug] || { icon: 'briefcase', accent: 'blue', image: null };
    const uploaded = s.heroImage || null;
    return {
      key: s.slug, url: `/dich-vu/${s.slug}`, icon: art.icon, accent: art.accent,
      title: (en && s.titleEn) || s.titleVi,
      text: (en && s.summaryEn) || s.summaryVi || '',
      image: uploaded || art.image, contain: !uploaded && !!art.contain,
    };
  });
}

// The six Giải pháp pages (a–f, menu order) for the /giai-phap landing page. "Dự án tham khảo" is not on the home
// slider: its picture is the first photo of the first featured project, else a lab render shipped with the site.
const SOLUTION_ORDER = ['stem-lab', 'thiet-bi', 'workshop', 'dao-tao', 'du-an', 'tap-huan'];
const PROJECTS_CARD = { key: 'du-an', url: '/giai-phap/du-an', titleKey: 'nav.solutionProjects', bannerKey: 'du-an', icon: 'building',
  image: '/assets/giai-phap/tu-van-thiet-ke/3d-chinh-dien.jpg' };

function buildSolutionCards({ settings, lang, t, projects = [] }) {
  const projectPhoto = (projects.find((p) => p.images && p.images.length) || {}).images;
  return SOLUTION_ORDER.map((key) => {
    const d = key === 'du-an' ? PROJECTS_CARD : DOMAINS.find((x) => x.key === key);
    const uploaded = key === 'du-an' && projectPhoto ? projectPhoto[0] : null;
    return {
      key, url: d.url,
      title: t(d.titleKey),
      text: bannerFor(settings, d.bannerKey, lang).subtitle,
      image: uploaded || d.image, contain: !uploaded && !!d.contain,
    };
  });
}

// "Khám phá thêm" at the bottom of each Giải pháp page: the other five pages, in menu order (partials/next-steps.ejs)
function buildSolutionLinks(currentKey, { settings, lang, t }) {
  return SOLUTION_ORDER.filter((key) => key !== currentKey).map((key) => {
    const d = key === 'du-an' ? PROJECTS_CARD : DOMAINS.find((x) => x.key === key);
    return { key, url: d.url, icon: d.icon, title: t(d.titleKey), text: bannerFor(settings, d.bannerKey, lang).subtitle };
  });
}

module.exports = { DOMAINS, SOLUTION_ORDER, buildHomeDomains, buildSolutionCards, buildServiceCards, buildSolutionLinks };
