require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const AdmZip = require('adm-zip');

const connectDB = require('../config/db');
const Project = require('../models/Project');
const Product = require('../models/Product');
const Service = require('../models/Service');
const SiteSettings = require('../models/SiteSettings');
const { toPlainText } = require('../lib/text');
const { upsertRobotStem } = require('./add-robot-stem');
const { resetSolutionPage, SLUGS: SOLUTION_SLUGS } = require('../lib/solution-pages');
const { migrateBanners } = require('./migrate-banners');
const { STARTER_QUESTIONS } = require('../lib/service-content');

const SOURCE_DIR = path.join(__dirname, '..', 'source-assets');
const PPTX_PATH = path.join(SOURCE_DIR, 'pptx', 'MTG - giải pháp LAB STEM (1).pptx');

const useCloudinary = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

let cloudinary = null;
if (useCloudinary) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

function uploadBuffer(buffer, subfolder, resourceType, extension) {
  return new Promise((resolve, reject) => {
    if (useCloudinary) {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: `mtglobal/${subfolder}`, resource_type: resourceType, public_id: crypto.randomUUID() },
        (err, result) => (err ? reject(err) : resolve(result.secure_url))
      );
      uploadStream.end(buffer);
    } else {
      const filename = crypto.randomUUID() + extension;
      const destDir = path.join(__dirname, '..', 'public', 'uploads', subfolder);
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(destDir, filename), buffer);
      resolve(`/uploads/${subfolder}/${filename}`);
    }
  });
}

// ---- pptx helpers (pptx is a zip of OOXML) ----
function loadPptx() {
  if (!fs.existsSync(PPTX_PATH)) {
    console.warn(`Không tìm thấy file pptx tại ${PPTX_PATH} — bỏ qua ảnh minh hoạ từ slide.`);
    return null;
  }
  return new AdmZip(PPTX_PATH);
}

function slideImages(zip, slideNumbers) {
  if (!zip) return [];
  const files = new Set();
  slideNumbers.forEach((n) => {
    const relsEntry = zip.getEntry(`ppt/slides/_rels/slide${n}.xml.rels`);
    if (!relsEntry) return;
    const xml = relsEntry.getData().toString('utf8');
    const matches = [...xml.matchAll(/Target="\.\.\/media\/([^"]+)"/g)];
    matches.forEach((m) => files.add(m[1]));
  });
  const results = [];
  files.forEach((filename) => {
    const entry = zip.getEntry(`ppt/media/${filename}`);
    if (entry) results.push({ filename, buffer: entry.getData() });
  });
  return results;
}

async function uploadImages(zip, slideNumbers, subfolder, max) {
  const images = slideImages(zip, slideNumbers).slice(0, max);
  const urls = [];
  for (const img of images) {
    const ext = path.extname(img.filename) || '.jpg';
    if (!/\.(jpe?g|png|webp|gif)$/i.test(ext)) continue; // skip emf/wmf/gif-as-vector etc.
    try {
      urls.push(await uploadBuffer(img.buffer, subfolder, 'image', ext.toLowerCase()));
    } catch (err) {
      console.warn(`Lỗi upload ảnh ${img.filename}:`, err.message);
    }
  }
  return urls;
}

// ---- Seed data definitions (mapped from the 81-slide pptx) ----
const PROJECTS = [
  {
    titleVi: 'Thiết kế 3D phòng Lab STEM — STEM INNOVATION Petrovietnam',
    titleEn: '3D STEM Lab Design Concept — STEM INNOVATION Petrovietnam',
    schoolName: '', location: '',
    descriptionVi: 'Phương án thiết kế 3D mẫu cho phòng Lab STEM, thể hiện cách bố trí khu vực học tập nhóm, khu chế tạo, khu trưng bày sản phẩm và khu vực robot, áp dụng cho mô hình STEM INNOVATION Petrovietnam.',
    descriptionEn: 'A sample 3D design concept for a STEM Lab, showing the layout of group-learning zones, fabrication areas, product display, and robotics zones under the STEM INNOVATION Petrovietnam model.',
    slides: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    featured: true, order: 0,
  },
  {
    titleVi: 'Phòng STEM INNOVATION 57',
    titleEn: 'STEM INNOVATION 57 Lab',
    schoolName: 'THPT Kim Liên, Nam Đàn, Nghệ An', location: 'Nam Đàn, Nghệ An',
    slides: [32, 33, 34], featured: true, order: 1,
  },
  {
    titleVi: 'Phòng STEM INNOVATION 57',
    titleEn: 'STEM INNOVATION 57 Lab',
    schoolName: 'THCS Cầu Giấy', location: 'Hà Nội',
    slides: [35, 36, 37, 38], featured: true, order: 2,
  },
  {
    titleVi: 'Phòng STEM INNOVATION PETROVIETNAM',
    titleEn: 'STEM INNOVATION Petrovietnam Lab',
    schoolName: 'THCS Tây Mỗ', location: 'Hà Nội',
    slides: [39, 40], order: 3,
  },
  {
    titleVi: 'Phòng STEM INNOVATION PETROVIETNAM',
    titleEn: 'STEM INNOVATION Petrovietnam Lab',
    schoolName: 'THCS Tây Mỗ 3', location: 'Hà Nội',
    slides: [41, 42], order: 4,
  },
  {
    titleVi: 'Phòng STEM INNOVATION PETROVIETNAM',
    titleEn: 'STEM INNOVATION Petrovietnam Lab',
    schoolName: 'THCS Hiệp Cường', location: '',
    slides: [43, 44], order: 5,
  },
  {
    titleVi: 'Phòng STEM INNOVATION PETROVIETNAM',
    titleEn: 'STEM INNOVATION Petrovietnam Lab',
    schoolName: 'THPT Lý Tự Trọng', location: '',
    slides: [45, 46], order: 6,
  },
  {
    titleVi: 'Phòng STEM INNOVATION',
    titleEn: 'STEM INNOVATION Lab',
    schoolName: 'THPT Chuyên Lam Sơn', location: 'Thanh Hóa',
    slides: [47, 48, 49], order: 7,
  },
];

// English for each equipment group (Phân nhóm)
const GROUP_EN = {
  'Phần I: Thiết bị hạ tầng': 'Part I: Infrastructure equipment',
  'Phần II: Thiết bị chuyên dùng': 'Part II: Specialized equipment',
  'Phần II: Thiết bị chuyên dùng — Lập trình & Rô-bốt giáo dục': 'Part II: Specialized equipment — Programming & educational robotics',
};

const EQUIPMENT = [
  { nameVi: 'Hệ thống bàn, ghế và nội thất phòng học STEM', nameEn: 'STEM classroom furniture system', subcategory: 'Phần I: Thiết bị hạ tầng', slides: [51] },
  { nameVi: 'Hệ thống kỹ thuật phòng học (điện, chiếu sáng, thông gió, điều hòa)', nameEn: 'Room technical systems (power, lighting, ventilation, A/C)', subcategory: 'Phần I: Thiết bị hạ tầng', slides: [52] },
  { nameVi: 'Hạ tầng mạng và kết nối Internet', nameEn: 'Network & Internet infrastructure', subcategory: 'Phần I: Thiết bị hạ tầng', slides: [53] },
  {
    nameVi: 'Thiết bị trình chiếu, hiển thị và âm thanh', nameEn: 'Display, projection & audio equipment',
    subcategory: 'Phần I: Thiết bị hạ tầng', slides: [54],
    descriptionVi: 'Màn hình tương tác với phần cứng chuyên dụng cho giáo dục, hệ điều hành Android 14 đạt chứng nhận Google EDLA, tích hợp tính năng chăm sóc mắt và an toàn sức khỏe cho học sinh.',
    descriptionEn: 'Interactive displays with education-grade hardware, Android 14 with Google EDLA certification, and eye-care/health-safety features for students.',
  },
  { nameVi: 'Máy tính và thiết bị học tập số (Laptop)', nameEn: 'Computers & digital learning devices (laptops)', subcategory: 'Phần I: Thiết bị hạ tầng', slides: [55] },
  { nameVi: 'Thiết bị lưu trữ, sạc và giám sát', nameEn: 'Storage, charging & monitoring equipment', subcategory: 'Phần I: Thiết bị hạ tầng', slides: [56] },
  { nameVi: 'Thiết bị bảo hộ, an toàn và sơ cứu', nameEn: 'Safety, protective & first-aid equipment', subcategory: 'Phần I: Thiết bị hạ tầng', slides: [57] },
  { nameVi: 'Phần mềm quản lý và tổ chức dạy học', nameEn: 'Classroom management & teaching software', subcategory: 'Phần I: Thiết bị hạ tầng', slides: [58] },
  {
    nameVi: 'Thiết bị khám phá, đo lường và thực nghiệm khoa học', nameEn: 'Science exploration, measurement & experiment equipment',
    subcategory: 'Phần II: Thiết bị chuyên dùng', slides: [59],
    descriptionVi: 'Bao gồm kính hiển vi và bộ điều khiển, thu nhận tín hiệu số CoachLab II+ phục vụ thực nghiệm khoa học.',
    descriptionEn: 'Includes microscopes and the CoachLab II+ digital data-logging controller for science experiments.',
  },
  { nameVi: 'Thiết bị thiết kế kỹ thuật và chế tạo', nameEn: 'Engineering design & fabrication equipment', subcategory: 'Phần II: Thiết bị chuyên dùng', slides: [60, 61] },
  {
    nameVi: 'Hệ sinh thái VEX Robotics', nameEn: 'VEX Robotics Ecosystem',
    subcategory: 'Phần II: Thiết bị chuyên dùng — Lập trình & Rô-bốt giáo dục', slides: [62, 63, 64, 65, 66, 67, 68, 69, 70, 71],
    descriptionVi: 'Hệ sinh thái robot giáo dục VEX: robot lắp ráp sẵn dễ bắt đầu, thị giác AI (AI Vision), lập trình khối lệnh và Python, bộ kit VEX IQ Competition phù hợp từ 10 tuổi, chương trình nâng cao cho học sinh 14-18 tuổi, và mô phỏng robot ảo để học khoa học máy tính.',
    descriptionEn: 'The VEX educational robotics ecosystem: ready-to-build robots, AI Vision, block-based and Python programming, the VEX IQ Competition kit for ages 10+, advanced builds for ages 14-18+, and virtual robot simulation for computer science learning.',
  },
  { nameVi: 'Robot giáo dục Makeblock / mBot', nameEn: 'Makeblock / mBot Educational Robots', subcategory: 'Phần II: Thiết bị chuyên dùng — Lập trình & Rô-bốt giáo dục', slides: [72] },
];

const STAIR_ROBOT_DESCRIPTION_VI = `
  <p>Máy leo cầu thang tự động thế hệ thứ 3 — xe chở hàng điện, bánh xích cao su, có thể mang vác hàng hoá nặng (bình nước, thùng kiện, hàng hoá...) lên xuống cầu thang mà không cần khuân vác thủ công.</p>
  <ul>
    <li>Điểm cải tiến chính: tấm đỡ hàng có thể tự điều chỉnh vuông góc 90 độ theo độ dốc cầu thang.</li>
    <li>Vật liệu chế tạo chắc chắn, bền bỉ (khung thép không gỉ).</li>
    <li>Máy có thể xoay tròn ngay tại chỗ, thao tác linh hoạt trong không gian hẹp.</li>
    <li>Một người vận hành sử dụng thuận tiện, không cần hỗ trợ thêm.</li>
  </ul>
`;
const STAIR_ROBOT_DESCRIPTION_EN = `
  <p>A 3rd-generation automatic stair-climbing cargo robot — an electric cart with rubber crawler tracks that carries heavy loads (water jugs, crates, goods) up and down stairs without manual lifting.</p>
  <ul>
    <li>Key improvement: the cargo support plate automatically adjusts to a 90° angle relative to the stair slope.</li>
    <li>Sturdy, durable stainless-steel frame construction.</li>
    <li>Can rotate in place for flexible maneuvering in tight spaces.</li>
    <li>Easy for a single operator to use, no extra assistance required.</li>
  </ul>
`;

const OTHER_ROBOTS = [
  {
    category: 'robot-di-theo-nguoi', nameVi: 'Robot xe chở hàng đi theo người', nameEn: 'Follow-Me Cargo Robot',
    descriptionVi: '<p>Robot xe chở hàng tự động bám theo người dùng, hỗ trợ vận chuyển hàng hoá trong nhà máy, kho bãi hoặc khuôn viên trường học. Thông tin chi tiết, hình ảnh và video demo đang được hoàn thiện.</p>',
    descriptionEn: '<p>An autonomous cargo cart that follows its operator, helping transport goods across factories, warehouses, or school campuses. Full specifications, photos, and demo videos are being finalized.</p>',
  },
  {
    category: 'robot-cat-co', nameVi: 'Robot cắt cỏ', nameEn: 'Lawn Mowing Robot',
    descriptionVi: '<p>Robot cắt cỏ tự động, phù hợp cho sân vườn, công viên và khuôn viên doanh nghiệp/trường học. Thông tin chi tiết, hình ảnh và video demo đang được hoàn thiện.</p>',
    descriptionEn: '<p>An autonomous lawn-mowing robot suited for gardens, parks, and corporate/school campuses. Full specifications, photos, and demo videos are being finalized.</p>',
  },
  {
    category: 'robot-gia-dinh', nameVi: 'Robot phục vụ gia đình', nameEn: 'Home Service Robot',
    descriptionVi: '<p>Robot phục vụ các tác vụ trong gia đình. Thông tin chi tiết, hình ảnh và video demo đang được hoàn thiện.</p>',
    descriptionEn: '<p>A robot designed to assist with household tasks. Full specifications, photos, and demo videos are being finalized.</p>',
  },
];

const SERVICES = [
  {
    slug: 'tu-van-du-hoc',
    titleVi: 'Tư vấn du học', titleEn: 'Study Abroad Consulting',
    summaryVi: 'Tư vấn lộ trình du học phù hợp với năng lực và mục tiêu của học sinh, sinh viên.',
    summaryEn: 'Study-abroad pathway consulting tailored to each student\'s ability and goals.',
    bodyVi: '<p>MTG cung cấp dịch vụ tư vấn du học, đồng hành cùng học sinh và phụ huynh trong việc lựa chọn quốc gia, trường học và lộ trình học tập phù hợp. Nội dung chi tiết về chương trình tư vấn du học đang được cập nhật — vui lòng để lại yêu cầu, đội ngũ MTG sẽ liên hệ tư vấn trực tiếp.</p>',
    bodyEn: '<p>MTG offers study-abroad consulting, helping students and parents choose the right country, school, and study pathway. Detailed program information is being updated — please leave a request and our team will contact you directly.</p>',
    order: 0,
  },
  {
    slug: 'phan-phoi-san-pham',
    titleVi: 'Phân phối sản phẩm công nghệ', titleEn: 'Tech Product Distribution',
    summaryVi: 'Phân phối và thương mại hóa các sản phẩm công nghệ, thiết bị STEM/Robotics.',
    summaryEn: 'Distribution and commercialization of technology products and STEM/robotics equipment.',
    bodyVi: '<p>MTG là đơn vị phân phối và thương mại hóa các sản phẩm công nghệ, bao gồm thiết bị STEM/Robotics và các giải pháp công nghệ khác, hướng tới đối tác bán lẻ, trường học và doanh nghiệp. Liên hệ với chúng tôi để biết thêm về danh mục sản phẩm và chính sách hợp tác phân phối.</p>',
    bodyEn: '<p>MTG distributes and commercializes technology products, including STEM/robotics equipment and other technology solutions, for retail partners, schools, and businesses. Contact us to learn more about our product catalog and distribution partnership terms.</p>',
    order: 1,
  },
];

async function main() {
  await connectDB();
  const zip = loadPptx();

  console.log('Đang xoá dữ liệu seed cũ (Project, Product, Service)...');
  await Promise.all([Project.deleteMany({}), Product.deleteMany({}), Service.deleteMany({})]);

  console.log('Đang tạo dự án tham khảo...');
  for (const p of PROJECTS) {
    const images = await uploadImages(zip, p.slides, 'images', 4);
    await Project.create({
      titleVi: p.titleVi, titleEn: p.titleEn,
      schoolName: p.schoolName, location: p.location,
      descriptionVi: toPlainText(p.descriptionVi), descriptionEn: toPlainText(p.descriptionEn),
      images, order: p.order, featured: !!p.featured,
    });
  }

  console.log('Đang tạo danh mục thiết bị STEM...');
  for (let i = 0; i < EQUIPMENT.length; i++) {
    const e = EQUIPMENT[i];
    const images = await uploadImages(zip, e.slides, 'images', 3);
    await Product.create({
      nameVi: e.nameVi, nameEn: e.nameEn, category: 'stem-equipment', subcategory: e.subcategory, subcategoryEn: GROUP_EN[e.subcategory] || '',
      descriptionVi: toPlainText(e.descriptionVi), descriptionEn: toPlainText(e.descriptionEn),
      images, order: i,
    });
  }
  // Robot STEM (VEX Robotics) items from the official VEX one-pagers, with images in public/assets/giai-phap/robot-stem/
  (await upsertRobotStem(Product)).forEach((line) => console.log("  " + line));
  // Editable Giải pháp pages back to their default content
  for (const slug of SOLUTION_SLUGS) await resetSolutionPage(slug);
  await migrateBanners(mongoose.connection.db); // banner lines now live in Cài đặt chung
  console.log(`  ${SOLUTION_SLUGS.length} trang Giải pháp về nội dung mặc định`);

  console.log('Đang tạo sản phẩm Robot leo cầu thang (có video thật)...');
  const videoFiles = ['stair-climbing-robot-1.mp4', 'stair-climbing-robot-2.mp4', 'stair-climbing-robot-3.mp4'];
  const videoUrls = [];
  for (const file of videoFiles) {
    const filePath = path.join(SOURCE_DIR, 'robot-leo-cau-thang', file);
    if (!fs.existsSync(filePath)) continue;
    const buffer = fs.readFileSync(filePath);
    try {
      videoUrls.push(await uploadBuffer(buffer, 'videos', 'video', '.mp4'));
    } catch (err) {
      console.warn(`Lỗi upload video ${file}:`, err.message);
    }
  }
  await Product.create({
    nameVi: 'Robot xe chở hàng leo cầu thang', nameEn: 'Stair-Climbing Cargo Robot',
    category: 'robot-leo-cau-thang',
    descriptionVi: toPlainText(STAIR_ROBOT_DESCRIPTION_VI), descriptionEn: toPlainText(STAIR_ROBOT_DESCRIPTION_EN),
    videos: videoUrls, comingSoon: false, featured: true, order: 0,
  });

  console.log('Đang tạo 3 sản phẩm robot còn lại (chưa có nội dung đầy đủ)...');
  for (let i = 0; i < OTHER_ROBOTS.length; i++) {
    const r = OTHER_ROBOTS[i];
    await Product.create({
      nameVi: r.nameVi, nameEn: r.nameEn, category: r.category,
      descriptionVi: toPlainText(r.descriptionVi), descriptionEn: toPlainText(r.descriptionEn),
      comingSoon: true, order: i + 1,
    });
  }

  console.log('Đang tạo dịch vụ (Tư vấn du học, Phân phối sản phẩm công nghệ)...');
  for (const s of SERVICES) {
    await Service.create({ ...s, bodyVi: toPlainText(s.bodyVi), bodyEn: toPlainText(s.bodyEn), questions: STARTER_QUESTIONS[s.slug] || [] });
  }

  console.log('Đang cập nhật cấu hình chung (logo, thông tin liên hệ)...');
  let settings = await SiteSettings.findOne();
  if (!settings) settings = new SiteSettings({});

  const logoPath = path.join(SOURCE_DIR, 'brand', 'mtg-logo.jpg');
  if (fs.existsSync(logoPath)) {
    try {
      settings.logo = await uploadBuffer(fs.readFileSync(logoPath), 'images', 'image', '.jpg');
    } catch (err) {
      console.warn('Lỗi upload logo:', err.message);
    }
  }

  // Plain text: a blank line starts a new paragraph (formatted by lib/text.js on the About page)
  settings.companyProfile = `Công ty TNHH Công nghệ Mễ Trì Global (MTG) — Smart Solutions for Life.

MTG hoạt động trên 3 lĩnh vực chính: Sản phẩm Robotics thông minh, Giải pháp phòng Lab STEM cho mọi cấp học, và các Dịch vụ tư vấn du học, phân phối thương mại hóa sản phẩm công nghệ.`;
  settings.companyProfileEn = `Mễ Trì Global Technology Co., Ltd (MTG) — Smart Solutions for Life.

MTG works across 3 main areas: Smart Robotics products, STEM Lab solutions for every education level, and services covering study-abroad consulting and the distribution and commercialization of technology products.`;
  settings.contactInfo = {
    address: 'Số 4A, Ngõ 148 Hoàng Ngân, Phường Yên Hòa, Thành phố Hà Nội',
    phone: settings.contactInfo?.phone || '',
    email: settings.contactInfo?.email || '',
    mapEmbedUrl: settings.contactInfo?.mapEmbedUrl || '',
  };
  await settings.save();

  console.log('Hoàn tất seed dữ liệu.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
