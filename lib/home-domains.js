// Business area cards, used by the home page "Lĩnh vực hoạt động" slider (one card per area, in menu order) and by
// the Giải pháp landing page /giai-phap (the six solution pages, a–f). Card text stays in sync with what the admin already edits: the page banner line (Cài đặt chung → Banner các trang)
// for the robot and solution pages, and the service title + summary for services. Pictures prefer uploaded content
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
  // No photo for study abroad yet: the card shows branded colour art with its icon until a service hero image is uploaded
  { key: 'du-hoc', serviceSlug: 'tu-van-du-hoc', icon: 'globe', accent: 'blue', image: null },
  { key: 'phan-phoi', serviceSlug: 'phan-phoi-san-pham', icon: 'package', accent: 'orange',
    image: '/assets/giai-phap/robot-stem/vex-go-kit.png', contain: true },
];

// [{ key, url, title, text, image, contain, icon, accent }] for the view; a service that no longer exists is skipped
function buildHomeDomains({ settings, lang, t, robots = [], services = [] }) {
  const en = lang === 'en';
  const robotPhoto = (robots.find((r) => r.images && r.images.length) || {}).images;
  return DOMAINS.map((d) => {
    if (d.serviceSlug) {
      const s = services.find((x) => x.slug === d.serviceSlug);
      if (!s) return null;
      const uploaded = s.heroImage || null;
      return {
        key: d.key, url: `/dich-vu/${s.slug}`, icon: d.icon, accent: d.accent,
        title: (en && s.titleEn) || s.titleVi,
        text: (en && s.summaryEn) || s.summaryVi || '',
        image: uploaded || d.image, contain: !uploaded && !!d.contain,
      };
    }
    const uploaded = d.key === 'products' && robotPhoto ? robotPhoto[0] : null;
    return {
      key: d.key, url: d.url, icon: d.icon, accent: d.accent,
      title: t(d.titleKey),
      text: bannerFor(settings, d.bannerKey, lang).subtitle,
      image: uploaded || d.image, contain: !uploaded && !!d.contain,
    };
  }).filter(Boolean);
}

// The six Giải pháp pages (a–f, menu order) for the /giai-phap landing page. "Dự án tham khảo" is not on the home
// slider: its picture is the first photo of the first featured project, else a lab render shipped with the site.
const SOLUTION_ORDER = ['stem-lab', 'thiet-bi', 'workshop', 'dao-tao', 'du-an', 'tap-huan'];
const PROJECTS_CARD = { key: 'du-an', url: '/giai-phap/du-an', titleKey: 'nav.solutionProjects', bannerKey: 'du-an',
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

module.exports = { DOMAINS, buildHomeDomains, buildSolutionCards };
