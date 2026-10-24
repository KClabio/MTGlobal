// Every public page banner (the dark strip under the menu), managed in Admin → Cài đặt chung → Banner các trang.
// Each banner has a default line under its title; an admin override (settings.banners[key]) replaces it, and an
// optional background image is shown behind the banner. Detail pages reuse their list page's image.
// Order and grouping follow the website menu (views/partials/header.ejs).
const BANNERS = [
  { key: 'products', group: 'products', labelKey: 'nav.products', url: '/san-pham',
    defaultVi: 'Dòng robot ứng dụng thực tế trong vận chuyển hàng hoá, chăm sóc sân vườn và phục vụ gia đình.',
    defaultEn: 'Practical robots built for cargo transport, lawn care, and home service.' },
  { key: 'solutions', group: 'solutions', labelKey: 'nav.solutions', url: '/giai-phap',
    defaultVi: 'Giải pháp STEM trọn gói cho nhà trường — từ tư vấn, thiết kế phòng Lab, thiết bị và học liệu đến đào tạo, tập huấn và đồng hành triển khai.',
    defaultEn: 'End-to-end STEM solutions for schools — from lab consulting and design, equipment and learning materials to teacher training and ongoing support.' },
  { key: 'stem-lab', group: 'solutions', labelKey: 'nav.solutionOverview', url: '/giai-phap/stem-lab',
    defaultVi: 'Từ khảo sát, thiết kế đến thi công, lắp đặt và bàn giao — phòng Lab STEM cho mọi cấp học, may đo theo nhà trường.',
    defaultEn: 'From survey and design to installation and handover — a STEM Lab for every education level, built around your school.' },
  { key: 'thiet-bi', group: 'solutions', labelKey: 'nav.solutionEquipment', url: '/giai-phap/thiet-bi',
    defaultVi: 'Thiết bị hạ tầng, thiết bị chuyên dùng STEM, Robot STEM và học liệu số từ hệ sinh thái VEX Robotics — đầy đủ cho một phòng Lab STEM.',
    defaultEn: 'Infrastructure, specialized STEM equipment, STEM robots and digital learning materials from the VEX Robotics ecosystem — everything a STEM Lab needs.' },
  { key: 'workshop', group: 'solutions', labelKey: 'nav.solutionWorkshop', url: '/giai-phap/workshop',
    defaultVi: 'Những buổi trải nghiệm thực hành, nơi học sinh tự tay lắp ráp, lập trình và thi đấu với thiết bị STEM thật.',
    defaultEn: 'Hands-on sessions where students build, code and compete with real STEM equipment.' },
  { key: 'dao-tao', group: 'solutions', labelKey: 'nav.solutionEducation', url: '/giai-phap/dao-tao',
    defaultVi: 'Phát triển chuyên môn giúp giáo viên tự tin dạy STEM — từ thiết kế bài học đến dạy robotics trên lớp.',
    defaultEn: 'Professional development that helps teachers teach STEM with confidence — from lesson design to classroom robotics.' },
  { key: 'du-an', group: 'solutions', labelKey: 'nav.solutionProjects', url: '/giai-phap/du-an',
    defaultVi: 'Các phòng Lab STEM đã được MTG tư vấn, thiết kế và triển khai tại các trường học.',
    defaultEn: 'STEM Labs MTG has designed and deployed for schools across Vietnam.' },
  { key: 'tap-huan', group: 'solutions', labelKey: 'nav.solutionTraining', url: '/giai-phap/tap-huan',
    defaultVi: 'Chương trình 4 giai đoạn, đồng hành cùng nhà trường từ lúc xây dựng phòng Lab STEM đến khi tham gia các sân chơi, cuộc thi.',
    defaultEn: 'A 4-phase program that takes a school from building its STEM Lab to competing on the national and international stage.' },
  { key: 'services', group: 'services', labelKey: 'nav.services', url: '/dich-vu',
    defaultVi: 'Tư vấn du học và phân phối sản phẩm công nghệ giáo dục.',
    defaultEn: 'Study-abroad consulting and distribution of education technology products.' },
  { key: 'news', group: 'news', labelKey: 'nav.news', url: '/tin-tuc', defaultVi: '', defaultEn: '' },
  { key: 'about', group: 'about', labelKey: 'nav.about', url: '/ve-mtg',
    defaultVi: 'MTG – Smart Solutions for Life', defaultEn: 'MTG — Smart Solutions for Life' },
  { key: 'privacy', group: 'about', labelKey: 'privacy.title', url: '/chinh-sach-bao-mat',
    defaultVi: 'Cách MTG thu thập, sử dụng và bảo vệ thông tin cá nhân của bạn.',
    defaultEn: 'How MTG collects, uses and protects your personal information.' },
  { key: 'contact', group: 'contact', labelKey: 'nav.contact', url: '/lien-he', defaultVi: '', defaultEn: '' },
  { key: 'help', group: 'contact', labelKey: 'help.title', url: '/ho-tro',
    defaultVi: 'Hướng dẫn sử dụng website: tài khoản, gửi yêu cầu, quyền riêng tư và hơn thế nữa.',
    defaultEn: 'How to use the website: your account, sending requests, privacy and more.' },
];

const BY_KEY = Object.fromEntries(BANNERS.map((b) => [b.key, b]));
const BANNER_KEYS = BANNERS.map((b) => b.key);

// settings.banners may be a Map (mongoose document) or a plain object (lean / cached)
function savedBanner(settings, key) {
  const banners = settings && settings.banners;
  if (!banners) return {};
  return (typeof banners.get === 'function' ? banners.get(key) : banners[key]) || {};
}

// The banner line (override, else the default) and background image for a page
function bannerFor(settings, key, lang) {
  const def = BY_KEY[key];
  if (!def) return { subtitle: '', image: null };
  const saved = savedBanner(settings, key);
  const own = lang === 'en' ? saved.subtitleEn : saved.subtitleVi;
  const fallback = lang === 'en' ? def.defaultEn : def.defaultVi;
  return { subtitle: (own && own.trim()) || fallback || '', image: saved.image || null };
}

module.exports = { BANNERS, BANNER_KEYS, bannerFor, savedBanner };
