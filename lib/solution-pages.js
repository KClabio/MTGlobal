// Default content of the editable "Giải pháp" pages (a. stem-lab, c. workshop, d. dao-tao, f. tap-huan).
// A page is created from these defaults the first time it is opened (or when the admin restores the defaults),
// after that it is edited in Admin → Giải pháp. Banner lines are in lib/banners.js (Admin → Cài đặt chung). Photos/videos live in public/assets/giai-phap/<section>/.
const crypto = require('crypto');

const A = '/assets/giai-phap/';
const uid = () => crypto.randomUUID().slice(0, 8);

// Small builders keep the definitions readable
const section = (kind, props) => ({
  uid: uid(), kind, titleVi: '', titleEn: '', subtitleVi: '', subtitleEn: '', textVi: '', textEn: '',
  columns: 2, ratio: '4/3', continued: false, items: [], media: [], ...props,
});
const item = (titleVi, titleEn, textVi = '', textEn = '', extra = {}) => ({ titleVi, titleEn, textVi, textEn, url: '', primary: false, ...extra });
const button = (titleVi, titleEn, url, primary = false) => item(titleVi, titleEn, '', '', { url, primary });
const photo = (src, captionVi, captionEn, contain = false) => ({ type: 'image', src, poster: '', captionVi, captionEn, contain });
const video = (src, poster, captionVi, captionEn) => ({ type: 'video', src, poster, captionVi, captionEn, contain: false });

function stemLab() {
  return {
    sections: [
      section('text', {
        titleVi: 'Bối cảnh và sự cần thiết', titleEn: 'Why a STEM Lab?',
        textVi: 'Trước yêu cầu của chuyển đổi số và cách mạng công nghiệp 4.0, nguồn nhân lực STEM chất lượng cao đang thiếu hụt nghiêm trọng tại Việt Nam và trên toàn cầu. Bám sát Nghị quyết số 57-NQ/TW và số 71-NQ/TW của Bộ Chính trị, giáo dục STEM được xác định là giải pháp trọng tâm nhằm phát triển thế hệ trẻ có tư duy khoa học, sáng tạo, năng lực thích ứng và giải quyết vấn đề.\n\nDo đó, việc xây dựng Phòng Lab STEM là xu hướng tất yếu và yêu cầu cấp thiết, giúp nhà trường tạo dựng môi trường học tập hiện đại, gắn thực hành – trải nghiệm, giúp học sinh từ "người học thụ động" thành "người sáng tạo tri thức", đáp ứng mục tiêu đổi mới căn bản, toàn diện giáo dục theo hướng hội nhập, thực tiễn và bền vững.',
        textEn: 'Amid digital transformation and Industry 4.0, Vietnam and the world face a serious shortage of high-quality STEM talent. In line with Politburo Resolutions No. 57-NQ/TW and No. 71-NQ/TW, STEM education is identified as a core solution to develop a generation with scientific thinking, creativity, adaptability, and problem-solving capacity.\n\nBuilding a STEM Lab is therefore an essential trend — helping schools create a modern learning environment that links theory with hands-on practice, turning students from "passive learners" into "creators of knowledge," in line with Vietnam\'s comprehensive education reform toward integration, practicality, and sustainability.',
      }),
      section('cards', {
        continued: true,
        titleVi: 'Các căn cứ và tiêu chuẩn khi xây dựng phòng Lab STEM', titleEn: 'Legal basis & standards',
        items: [
          item('Trong nước', 'Domestic',
            '- Nghị quyết 57-NQ/TW, 71-NQ/TW\n- Chương trình GDPT 2018\n- Công văn 3089/BGDĐT-GDTrH (2020), 909/BGDĐT-GDTH (2023)\n- Thông tư 36, 37, 38, 39 và 14/2020/TT-BGDĐT\n- Quyết định 1002/QĐ-TTg (2025–2035)',
            '- Nghị quyết 57-NQ/TW, 71-NQ/TW\n- Chương trình GDPT 2018\n- Công văn 3089/BGDĐT-GDTrH (2020), 909/BGDĐT-GDTH (2023)\n- Thông tư 36, 37, 38, 39 và 14/2020/TT-BGDĐT\n- Quyết định 1002/QĐ-TTg (2025–2035)'),
          item('Quốc tế', 'International',
            '- Fab Lab equipment standard\n- NGSS — Next Generation Science Standards\n- ISTE — International Society for Technology in Education\n- CSTA — Computer Science Teachers Association\n- CCSS Math — Common Core State Standards',
            '- Fab Lab equipment standard\n- NGSS — Next Generation Science Standards\n- ISTE — International Society for Technology in Education\n- CSTA — Computer Science Teachers Association\n- CCSS Math — Common Core State Standards'),
        ],
      }),
      section('text', {
        titleVi: 'Phòng Lab STEM là gì?', titleEn: 'What is a STEM Lab?',
        textVi: 'Phòng Lab STEM (Không gian giáo dục STEM) là môi trường học tập nơi học sinh được trực tiếp khám phá, thực hành, thiết kế, chế tạo, lập trình và thử nghiệm thông qua các hoạt động STEM. Qua quá trình học bằng trải nghiệm, học sinh biết vận dụng kiến thức vào giải quyết các vấn đề thực tiễn, đồng thời học cách thử nghiệm, phát hiện sai sót và cải tiến sản phẩm. Đối với nhà trường, Phòng Lab STEM là nền tảng hỗ trợ đổi mới phương pháp dạy học, tăng cường trải nghiệm và xây dựng môi trường giáo dục hiện đại, sáng tạo.',
        textEn: 'A STEM Lab is a learning environment where students directly explore, practice, design, build, program, and experiment through STEM activities. Through experiential learning, students apply knowledge to real-world problems while learning to test, identify mistakes, and improve their products — developing creative and logical thinking, problem-solving, teamwork, and science-technology-digital literacy. For schools, a STEM Lab is the foundation for renewing teaching methods and building a modern, creative education environment.',
      }),
      section('cards', {
        continued: true,
        items: [
          item('Trải nghiệm, khám phá Khoa học — Tài liệu & học liệu', 'Science exploration & learning materials', 'Sử dụng học liệu in, học liệu số, phần mềm dạy học, mô phỏng, thí nghiệm ảo và học liệu có ứng dụng AI.', 'Printed and digital materials, teaching software, simulations, virtual experiments, and AI-enabled learning resources.'),
          item('Thiết kế kỹ thuật & Công nghệ số', 'Engineering design & digital technology', 'Thiết kế mô hình 3D, in 3D, cắt CNC, Laser, chế tác thủ công.', '3D modeling, 3D printing, CNC/laser cutting, and hands-on fabrication.'),
          item('Học STEM Robotics – Coding – AI – IoT', 'STEM Robotics – Coding – AI – IoT', 'Học robotics và lập trình thực hành, từ lập trình kéo-thả đến Python và thị giác AI.', 'Hands-on robotics and programming, from block-based coding to Python and AI vision.'),
        ],
      }),
      section('text', {
        titleVi: 'Quy mô – Vị trí – Diện tích', titleEn: 'Size – Location – Area',
        textVi: '- Diện tích đề xuất: 40 m² – 60 m² – 80 m² – 120 m² (tùy cấp độ và điều kiện đơn vị triển khai).\n- Vị trí: bố trí gần khu vực các phòng thí nghiệm Khoa học tự nhiên, Vật lý, Hóa học, Sinh học, Tin học để tạo thành hệ thống phòng Lab STEM.\n- Không gian: linh hoạt, dễ điều chỉnh, phân khu rõ ràng.',
        textEn: '- Recommended area: 40 m² – 60 m² – 80 m² – 120 m², depending on the education level and the school\'s conditions.\n- Location: close to the natural science, physics, chemistry, biology and IT labs, so together they form one STEM Lab system.\n- Space: flexible, easy to rearrange, with clearly defined zones.',
      }),
      section('cards', {
        continued: true,
        titleVi: 'Phân khu chức năng', titleEn: 'Functional zones',
        items: [
          item('1. Khu vực học tập theo nhóm / trạm & ứng dụng công nghệ số', '1. Group learning / stations & digital technology', 'Bàn ghế học sinh cơ động (dễ ghép nhóm 4–8 học sinh, mặt bàn chịu lực, dễ vệ sinh, cạnh bo tròn an toàn) kết hợp máy tính/thiết bị học tập số. Thiết bị bố trí tại đây: nhóm lập trình và rô-bốt giáo dục; công nghệ số, trí tuệ nhân tạo (AI) và Internet vạn vật (IoT).', 'Movable student tables (easy to group 4–8 students, sturdy, easy-to-clean, rounded safe edges) with computers and digital learning devices. Equipment here: programming & educational robotics; digital technology, AI and IoT.'),
          item('2. Khu vực chế tạo (gia công & tạo hình)', '2. Fabrication (making & shaping)', 'Nhóm thiết bị thiết kế kỹ thuật và chế tạo: máy in 3D, máy CNC, khắc laser, dụng cụ và máy móc cầm tay.', 'Engineering design and fabrication equipment: 3D printers, CNC and laser cutters, hand tools and machines.'),
          item('3. Khu vực đo lường & thực nghiệm khoa học', '3. Measurement & science experiments', 'Dành riêng cho các hoạt động tìm tòi, đo đạc và thực hành thí nghiệm. Ở cấp THPT bố trí thêm khu vực đo lường chính xác: bàn thí nghiệm cứng vững hạn chế rung, tủ bảo quản thiết bị đo có khóa, chống ẩm và có ổ cắm sạc.', 'Dedicated to inquiry, measurement and hands-on experiments. For upper secondary, an extra precision-measurement area with rigid, vibration-damped lab benches and lockable, moisture-proof cabinets with charging sockets.'),
          item('4. Khu vực lưu trữ, trưng bày & an toàn', '4. Storage, display & safety', 'Hệ tủ, kệ, giá dạng mô-đun (chống ẩm, kết hợp khoang mở và kín) để phân loại vật tư và trưng bày sản phẩm; bảng di động trình bày nhóm; tủ sạc tập trung nhiều cổng, camera giám sát, tủ sơ cứu, đồ bảo hộ cá nhân và phương tiện phòng cháy chữa cháy theo quy định.', 'Modular, moisture-proof cabinets and shelves (open and closed) to sort materials and display projects; mobile boards for group presentations; a multi-port charging cabinet, classroom camera, first-aid kit, personal protective equipment and fire safety equipment as required.'),
        ],
      }),
      section('gallery', {
        titleVi: 'Mẫu thiết kế phân khu theo cấp học', titleEn: 'Sample layouts by education level',
        subtitleVi: 'Mỗi phòng được thiết kế theo diện tích thực tế, lứa tuổi học sinh và chương trình của nhà trường.',
        subtitleEn: 'Each room is designed for the school\'s actual space, age group and curriculum.',
        columns: 2, ratio: '3/2',
        media: [
          photo(`${A}tu-van-thiet-ke/mau-mam-non-40m2.jpg`, 'Mẫu phòng STEM Mầm non — 40 m²', 'Preschool STEM room — 40 m²', true),
          photo(`${A}tu-van-thiet-ke/mau-tieu-hoc-50m2.jpg`, 'Phòng Lab STEM Tiểu học — gợi ý 40–60 m² (ví dụ 50 m²): màn hình tương tác, bàn nhóm 6 học sinh, khu sáng tạo/dự án, khu thực hành công nghệ – in 3D, khu Robotics, góc đọc sách, sân thi đấu (VEX GO / IQ), kho thiết bị', 'Primary STEM Lab — suggested 40–60 m² (example: 50 m²): interactive display, group tables for 6, maker/project area, technology & 3D printing corner, robotics area, reading corner, competition field (VEX GO / IQ), equipment storage', true),
          photo(`${A}tu-van-thiet-ke/mau-thcs-80-120m2.jpg`, 'Mẫu phòng THCS — 80–120 m²', 'Lower secondary STEM Lab — 80–120 m²', true),
          photo(`${A}tu-van-thiet-ke/mau-thpt-80-120m2.jpg`, 'Mẫu phòng THPT — 80–120 m²: hệ tủ trưng bày vừa kích thước tường, màn hình tương tác, khu đặt máy (in 3D, CNC, khắc laser), tủ robotics, bàn dài làm dự án và sân thi đấu robotics', 'Upper secondary STEM Lab — 80–120 m²: display cabinets fitted to the walls, interactive display, machine area (3D printer, CNC, laser), robotics cabinets, long project tables and a robotics competition field', true),
        ],
      }),
      section('gallery', {
        continued: true,
        titleVi: 'Thiết kế 3D — STEM INNOVATION Petrovietnam', titleEn: '3D design — STEM INNOVATION Petrovietnam',
        columns: 3, ratio: '16/9',
        media: [
          photo(`${A}tu-van-thiet-ke/3d-chinh-dien.jpg`, 'Góc nhìn chính diện tới hệ chữ STEM INNOVATION Petrovietnam', 'Front view towards the STEM INNOVATION Petrovietnam sign'),
          photo(`${A}tu-van-thiet-ke/3d-tu-robot.jpg`, 'Góc nhìn hướng tới hệ tủ robot', 'View towards the robot cabinets'),
          photo(`${A}tu-van-thiet-ke/3d-tu-cao-ban.jpg`, 'Hệ tủ cao, hệ bàn và tủ gầm bàn', 'Tall cabinets, tables and under-desk storage'),
          photo(`${A}tu-van-thiet-ke/3d-bang-duc-lo.jpg`, 'Hệ bảng giá đục lỗ treo dụng cụ kỹ thuật', 'Pegboards for technical tools'),
          photo(`${A}tu-van-thiet-ke/3d-toan-canh.jpg`, 'Góc nhìn chéo bao quát toàn bộ phòng', 'Diagonal overview of the whole room'),
          photo(`${A}tu-van-thiet-ke/3d-khu-giao-vien.jpg`, 'Khu vực giáo viên với bảng kết hợp màn hình tương tác', 'Teacher area with whiteboard and interactive display'),
        ],
      }),
      section('cards', {
        titleVi: 'Lợi ích phòng Lab STEM đem lại', titleEn: 'Benefits of a STEM Lab',
        items: [
          item('Phát triển năng lực & phẩm chất', 'Capability development', 'Tăng cường năng lực khoa học, toán học, công nghệ, tin học, năng lực số và khả năng vận dụng kiến thức liên môn.', 'Strengthens science, math, technology, informatics, digital, and interdisciplinary problem-solving skills.'),
          item('Thúc đẩy tư duy sáng tạo & thực hành', 'Creative & hands-on thinking', 'Giúp học sinh chuyển từ lý thuyết sang trải nghiệm thực tế, phát triển tư duy kỹ thuật và khả năng tự chế tạo sản phẩm.', 'Moves students from theory to real experience, building design thinking and self-fabrication skills.'),
          item('Định hướng nghề nghiệp sớm', 'Early career orientation', 'Tạo điều kiện để học sinh nhận biết thiên hướng cá nhân, tiếp cận các ngành khoa học và công nghệ chiến lược.', 'Helps students discover their strengths and explore core science and strategic technology fields.'),
          item('Bảo đảm tính bình đẳng', 'Equitable access', 'Tạo cơ hội tiếp cận công bằng cho mọi đối tượng học sinh, bao gồm vùng khó khăn và khuyến khích học sinh nữ tham gia.', 'Creates fair access for all students, including those in disadvantaged areas and girls in STEM.'),
        ],
      }),
      section('steps', {
        titleVi: 'Các giai đoạn triển khai', titleEn: 'Deployment Process',
        items: [
          item('Tư vấn – Khảo sát – Lên thiết kế – Dự toán', 'Consulting – Survey – Design – Costing'),
          item('Nhập thiết bị – Thi công, lắp đặt thiết bị phòng Lab STEM', 'Equipment procurement – installation'),
          item('Đào tạo hướng dẫn cơ bản – Bàn giao phòng và thiết bị', 'Basic training – handover'),
          item('Đào tạo chuyên sâu – Hỗ trợ vận hành – Tư vấn chương trình giảng dạy', 'Advanced training – operations support – curriculum consulting'),
        ],
      }),
      section('buttons', {
        continued: true,
        items: [
          button('Thiết bị, học liệu, Robot STEM', 'Equipment, learning materials & STEM robots', '/giai-phap/thiet-bi'),
          button('Workshop trải nghiệm STEM', 'Hands-on STEM workshops', '/giai-phap/workshop'),
          button('Đào tạo STEM', 'STEM training', '/giai-phap/dao-tao'),
          button('Dự án tham khảo', 'Reference projects', '/giai-phap/du-an'),
          button('Tập huấn & triển khai', 'Training & rollout', '/giai-phap/tap-huan'),
          button('Yêu cầu tư vấn', 'Request a Consultation', '/lien-he?quan_tam=giai-phap-stem-lab', true),
        ],
      }),
    ],
  };
}

function workshop() {
  return {
    sections: [
      section('text', {
        textVi: 'Trải nghiệm STEM là một trong những lĩnh vực hoạt động chính của MTG. Trong mỗi workshop, học sinh biến ý tưởng thành sản phẩm: lắp ráp mô hình, lập trình robot, thử nghiệm, phát hiện sai sót và cải tiến — học khoa học, công nghệ, kỹ thuật và toán học bằng chính trải nghiệm của mình.',
        textEn: 'STEM experiences are one of MTG\'s core activities. In each workshop, students turn ideas into working products: they assemble models, program robots, test, find mistakes and improve — learning science, technology, engineering and maths by doing.',
      }),
      section('cards', {
        continued: true, columns: 3,
        items: [
          item('Lắp ráp & chế tạo', 'Build', 'Học sinh làm việc theo nhóm, lắp ráp robot VEX và mô hình STEM — như cánh tay robot hay mô hình năng lượng xanh với tua-bin gió và tấm pin mặt trời.', 'Students assemble VEX robots and STEM models — such as a robotic arm or a green-energy model with wind turbines and solar panels — working in small teams.'),
          item('Lập trình', 'Code', 'Học sinh lập trình robot bằng khối lệnh kéo-thả VEXcode trên máy tính, rồi quan sát chương trình của mình điều khiển robot thật.', 'Students program their robots with VEXcode drag-and-drop blocks on a laptop, then watch their code come to life.'),
          item('Thi đấu', 'Compete', 'Các đội đưa robot vào thử thách trên sân thi đấu VEX IQ — cách học vui để rèn luyện làm việc nhóm và giải quyết vấn đề.', 'Teams put their robots to the test on a VEX IQ competition field — a fun way to practise teamwork and problem-solving.'),
        ],
      }),
      section('gallery', {
        titleVi: 'Hình ảnh workshop', titleEn: 'From the workshop',
        subtitleVi: 'Học sinh trải nghiệm tại phòng STEM INNOVATION PETROVIETNAM — THCS Hiệp Cường',
        subtitleEn: 'Students at the STEM INNOVATION PETROVIETNAM lab — THCS Hiệp Cường',
        columns: 2, ratio: '4/3',
        media: [
          video(`${A}workshop/vex-iq-thi-dau.mp4`, `${A}workshop/vex-iq-thi-dau-poster.jpg`, 'Trận đấu robot trên sân thi đấu VEX IQ', 'A robot match on the VEX IQ competition field'),
          photo(`${A}workshop/hoc-sinh-lap-trinh.jpg`, 'Lập trình robot VEX bằng khối lệnh VEXcode', 'Programming a VEX robot with VEXcode blocks'),
          photo(`${A}workshop/hoc-sinh-lap-rap-1.jpg`, 'Lắp ráp cánh tay robot và mô hình năng lượng xanh', 'Building a robotic arm and a green-energy model'),
          photo(`${A}workshop/hoc-sinh-lap-rap-2.jpg`, 'Làm việc nhóm tại bàn lắp ráp', 'Teamwork at the build table'),
        ],
      }),
      section('buttons', {
        continued: true,
        items: [
          button('Thiết bị, học liệu, Robot STEM', 'Equipment, learning materials & STEM robots', '/giai-phap/thiet-bi'),
          button('Đăng ký workshop', 'Book a workshop', '/lien-he?quan_tam=giai-phap-stem-lab', true),
        ],
      }),
    ],
  };
}

function daoTao({ pdPlusUrl }) {
  return {
    sections: [
      section('text', {
        textVi: 'Thiết bị chỉ phát huy giá trị khi giáo viên sử dụng thành thạo. Chương trình Đào tạo STEM của MTG phát triển đội ngũ giáo viên song song với phòng Lab STEM, để nhà trường tự tổ chức được các bài học STEM.',
        textEn: 'Equipment only creates value when teachers can use it well. MTG\'s STEM training develops the teaching team alongside the STEM Lab, so every school can run STEM lessons on its own.',
      }),
      section('cards', {
        continued: true,
        items: [
          item('Chuyển giao chương trình dạy học', 'Curriculum handover', 'Khung chương trình, chương trình chi tiết và giáo án cho phòng Lab STEM của nhà trường.', 'Curriculum framework, detailed programme and lesson plans for the school\'s STEM Lab.'),
          item('Phát triển đội ngũ liên tục', 'Continuous teacher development', 'Phát triển liên tục đội ngũ giáo viên và chương trình dạy học theo định hướng STEM cho nhà trường.', 'Ongoing development of the teaching team and of a STEM-oriented teaching programme for the school.'),
        ],
      }),
      section('steps', {
        continued: true,
        titleVi: 'Quy trình thiết kế bài học – chủ đề trải nghiệm STEM', titleEn: 'Designing a STEM experience lesson',
        items: [
          item('Tìm ý tưởng thực tiễn', 'Find a real-world idea'),
          item('Xác định vấn đề cần giải quyết', 'Define the problem to solve'),
          item('Xây dựng tiêu chí sản phẩm', 'Set the product criteria'),
          item('Thiết kế hoạt động', 'Design the activities'),
          item('Triển khai hoạt động', 'Run the activities'),
          item('Đánh giá & cải tiến', 'Evaluate & improve'),
        ],
      }),
      section('gallery', {
        titleVi: 'Tập huấn giáo viên tại phòng STEM INNOVATION PETROVIETNAM', titleEn: 'Teacher training at the STEM INNOVATION PETROVIETNAM lab',
        subtitleVi: 'THCS Hiệp Cường', subtitleEn: 'THCS Hiệp Cường',
        columns: 2, ratio: '4/3',
        media: [
          photo(`${A}dao-tao/giao-vien-petrovietnam-khong-gian-stem.jpg`, 'Chuyên đề: Xây dựng không gian giáo dục STEM', 'Session: building a STEM learning space'),
          photo(`${A}dao-tao/giao-vien-petrovietnam-thiet-ke-bai-hoc.jpg`, 'Chuyên đề: Quy trình thiết kế bài học trải nghiệm STEM', 'Session: designing a STEM experience lesson'),
          photo(`${A}dao-tao/giao-vien-petrovietnam-lap-trinh.jpg`, 'Hướng dẫn lập trình với bộ linh kiện điện tử', 'Guided programming with electronic kits'),
          photo(`${A}dao-tao/giao-vien-petrovietnam-thuc-hanh.jpg`, 'Giáo viên thực hành với bộ kit STEM và máy tính', 'Teachers practising with STEM kits and laptops'),
          photo(`${A}dao-tao/giao-vien-petrovietnam-linh-kien.jpg`, 'Thực hành đấu nối cảm biến và linh kiện', 'Hands-on wiring of sensors and components'),
        ],
      }),
      section('gallery', {
        titleVi: 'Mang VEX 123 vào lớp học mầm non', titleEn: 'Bringing VEX 123 into the preschool classroom',
        subtitleVi: 'Workshop dành cho giáo viên mầm non: "Học lập trình dễ như đếm 1 2 3" cùng robot VEX 123.',
        subtitleEn: 'A workshop for preschool teachers: "coding as easy as counting 1-2-3" with the VEX 123 robot.',
        columns: 2, ratio: '16/9',
        media: [
          video(`${A}dao-tao/vex123-mam-non-thuc-hanh.mp4`, `${A}dao-tao/vex123-mam-non-thuc-hanh-poster.jpg`, 'Giáo viên thực hành lập trình robot VEX 123 trên sàn', 'Teachers coding VEX 123 robots on the floor tiles'),
          video(`${A}dao-tao/vex123-mam-non-trinh-bay.mp4`, `${A}dao-tao/vex123-mam-non-trinh-bay-poster.jpg`, 'Giới thiệu VEX 123 cho giáo viên mầm non', 'Introducing VEX 123 to preschool teachers'),
          photo(`${A}dao-tao/vex123-mam-non-tap-huan.jpg`, 'Buổi workshop: Kỷ nguyên AI & Robot', 'Workshop session: the age of AI & robots'),
          photo(`${A}dao-tao/vex123-mam-non-tap-the.jpg`, 'Các giáo viên sau buổi workshop VEX 123', 'Teachers after the VEX 123 workshop'),
        ],
      }),
      section('text', {
        titleVi: 'Phát triển chuyên môn liên tục với VEX PD+', titleEn: 'Ongoing development with VEX PD+',
        textVi: 'VEX PD+ là chương trình phát triển chuyên môn theo nhu cầu do chuyên gia VEX Robotics dẫn dắt: khóa nhập môn và chứng chỉ cho từng nền tảng VEX, lớp chuyên sâu (Masterclasses), bài viết PD+ Insights và cộng đồng giáo viên trên toàn thế giới.',
        textEn: 'VEX PD+ is VEX Robotics\' on-demand, expert-led professional development: intro courses and certifications for each VEX platform, masterclasses, PD+ Insights articles, and a worldwide community of educators.',
        media: [photo(`${A}robot-stem/vex-pd-plus.jpg`, '', '', true)],
        ratio: '1/1',
        items: [
          button('Tìm hiểu VEX PD+', 'About VEX PD+', pdPlusUrl),
          button('Đăng ký đào tạo', 'Request a training', '/lien-he?quan_tam=giai-phap-stem-lab', true),
        ],
      }),
    ],
  };
}

function tapHuan() {
  return {
    sections: [
      section('steps', {
        items: [
          item('GĐ 1: Xây dựng Lab STEM – Cơ bản', 'Phase 1: Build the STEM Lab — Basic', 'Xây dựng phòng Lab STEM tại nhà trường; hướng dẫn sử dụng cơ bản các thiết bị.', 'Build the STEM Lab at the school; guide basic use of equipment.'),
          item('GĐ 2: Phát triển chuyên môn giáo dục STEM cho giáo viên', 'Phase 2: Teacher STEM development', 'Chuyển giao khung chương trình, chương trình chi tiết và giáo án; phát triển liên tục đội ngũ giáo viên.', 'Hand over curriculum framework, detailed program, and lesson plans; continuously develop the teaching team.'),
          item('GĐ 3: Xây dựng Lab STEM – Nâng cao', 'Phase 3: Build the STEM Lab — Advanced', 'Bổ sung thiết bị và chương trình học cho phòng Lab STEM.', 'Add equipment and curriculum to expand the STEM Lab.'),
          item('GĐ 4: Đồng hành và phát triển', 'Phase 4: Ongoing partnership & growth', 'Tổ chức ngày hội STEM, cuộc thi STEM Robot; kết nối CLB STEM giữa các trường; huấn luyện học sinh tham dự các cuộc thi.', 'Organize STEM days and robotics competitions; connect STEM clubs between schools; coach students for competitions.'),
        ],
      }),
      section('gallery', {
        titleVi: 'Hình ảnh thực tế', titleEn: 'From the Field',
        subtitleVi: 'Đào tạo sử dụng thiết bị — tập huấn giáo viên THPT Kim Liên, Nam Đàn, Nghệ An',
        subtitleEn: 'Equipment training — teachers at THPT Kim Liên, Nam Đàn, Nghệ An',
        columns: 2, ratio: '4/3',
        media: [
          photo(`${A}tap-huan/kim-lien-giao-vien-1.jpg`, 'Giáo viên tập huấn tại phòng STEM INNOVATION 57', 'Teachers training in the STEM INNOVATION 57 lab'),
          photo(`${A}tap-huan/kim-lien-giao-vien-2.jpg`, 'Thực hành sử dụng thiết bị phòng Lab', 'Hands-on practice with the lab equipment'),
        ],
      }),
      section('gallery', {
        continued: true, columns: 2, ratio: '4/3',
        titleVi: 'Đào tạo sử dụng thiết bị — tập huấn học sinh THCS Cầu Giấy, Hà Nội', titleEn: 'Equipment training — students at THCS Cầu Giấy, Hà Nội',
        media: [
          photo(`${A}tap-huan/cau-giay-hoc-sinh-1.jpg`, 'Học sinh thực hành với thiết bị chế tạo', 'Students working with fabrication equipment'),
          photo(`${A}tap-huan/cau-giay-hoc-sinh-2.jpg`, 'Học sinh sử dụng kính hiển vi trong thực nghiệm khoa học', 'Students using microscopes for science experiments'),
        ],
      }),
      section('gallery', {
        continued: true, columns: 2, ratio: '4/3',
        titleVi: 'Tổ chức giao lưu, kết nối CLB STEM của các trường', titleEn: 'Connecting school STEM clubs',
        media: [
          photo(`${A}tap-huan/giao-luu-clb-stem.jpg`, 'Giao lưu CLB STEM trên sân robotics', 'A STEM club exchange on the robotics field'),
          photo(`${A}tap-huan/giao-luu-hop-giang.jpg`, 'THCS Cầu Giấy (Hà Nội) giao lưu online với THCS Hợp Giang (Cao Bằng)', 'THCS Cầu Giấy (Hà Nội) connecting online with THCS Hợp Giang (Cao Bằng)'),
        ],
      }),
      section('gallery', {
        continued: true, columns: 2, ratio: '4/3',
        titleVi: 'Huấn luyện giáo viên và học sinh tham dự các cuộc thi STEM', titleEn: 'Coaching teachers and students for STEM competitions',
        media: [
          photo(`${A}tap-huan/vex-iq-kim-lien.jpg`, 'Đào tạo tìm hiểu về cuộc thi VEX IQ ở THPT Kim Liên, Nam Đàn, Nghệ An', 'Introducing the VEX IQ competition at THPT Kim Liên, Nam Đàn, Nghệ An'),
        ],
      }),
      section('stats', {
        titleVi: 'Kết nối cùng hệ sinh thái VEX Robotics toàn cầu', titleEn: 'Part of the Global VEX Robotics Network',
        subtitleVi: 'Thông qua hệ sinh thái VEX Robotics, MTG kết nối học sinh với cộng đồng thi đấu trên toàn thế giới.',
        subtitleEn: 'Through its VEX Robotics ecosystem, MTG connects students to a global competition community.',
        items: [
          item('61+', '61+', 'Quốc gia', 'Countries'),
          item('1,000,000+', '1,000,000+', 'Học sinh', 'Students'),
          item('22,000+', '22,000+', 'Trường', 'Schools'),
          item('27,000+', '27,000+', 'Đội', 'Teams'),
        ],
      }),
    ],
  };
}

const BUILDERS = { 'stem-lab': stemLab, workshop, 'dao-tao': daoTao, 'tap-huan': tapHuan };

// Menu label keys, so page titles always match the website menu
const TITLE_KEYS = {
  'stem-lab': 'nav.solutionOverview',
  workshop: 'nav.solutionWorkshop',
  'dao-tao': 'nav.solutionEducation',
  'tap-huan': 'nav.solutionTraining',
};

async function defaultContent(slug) {
  // The "About VEX PD+" button links to the PD+ catalog item when it exists
  const Product = require('../models/Product');
  const pdPlus = await Product.findOne({ category: 'stem-equipment', nameEn: /^VEX PD\+/ }, { _id: 1 }).lean();
  return BUILDERS[slug]({ pdPlusUrl: pdPlus ? `/giai-phap/thiet-bi/${pdPlus._id}` : '/giai-phap/thiet-bi' });
}

// The saved page, created from the defaults the first time it is needed
async function getSolutionPage(slug) {
  const SolutionPage = require('../models/SolutionPage');
  const existing = await SolutionPage.findOne({ slug }).lean();
  if (existing) return existing;
  const created = await SolutionPage.findOneAndUpdate(
    { slug },
    { $setOnInsert: { slug, ...(await defaultContent(slug)) } },
    { upsert: true, returnDocument: 'after', lean: true },
  );
  return created;
}

async function resetSolutionPage(slug) {
  const SolutionPage = require('../models/SolutionPage');
  const content = await defaultContent(slug);
  return SolutionPage.findOneAndUpdate({ slug }, { $set: content }, { upsert: true, returnDocument: 'after' });
}

module.exports = { getSolutionPage, resetSolutionPage, defaultContent, TITLE_KEYS, SLUGS: Object.keys(BUILDERS) };
