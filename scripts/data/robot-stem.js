// Robot STEM (VEX Robotics) catalog items for "Thiết bị, học liệu, Robot STEM".
// Content source: the official VEX Robotics one-pagers in source-assets/vex-brochures/ (VEX 123, GO, AIM, IQ, EXP,
// V5, CTE Workcell, AIR, VEXcode VR, PD+). VEX Hong Kong contacts, HKD pricing, SKUs and dated availability notes
// are deliberately left out — quote requests go through MTG's own form.
// Images: product photos from the MTG pptx (slides 63–71) and, for PD+, artwork from its official one-pager,
// stored in public/assets/giai-phap/robot-stem/.
// Text is plain text: a blank line starts a paragraph, "- " starts a list item (see lib/text.js).

const IMG = '/assets/giai-phap/robot-stem/';

const GROUPS = {
  robots: { vi: 'Phần III: Robot STEM – VEX Robotics', en: 'Part III: STEM robots – VEX Robotics' },
  learning: { vi: 'Phần IV: Học liệu số & phát triển chuyên môn – VEX', en: 'Part IV: Digital learning & professional development – VEX' },
};

// The existing "Hệ sinh thái VEX Robotics" item becomes the overview of the Robot STEM group.
const OVERVIEW = {
  nameVi: 'Hệ sinh thái VEX Robotics', nameEn: 'VEX Robotics Ecosystem',
  group: 'robots',
  descriptionVi: `Hệ sinh thái giáo dục VEX Robotics đi cùng học sinh từ mầm non đến THPT và giáo dục nghề nghiệp: mỗi dòng sản phẩm phù hợp một độ tuổi, cùng chung phần mềm lập trình VEXcode và kho học liệu miễn phí.

- VEX 123 (từ 4 tuổi): lập trình bằng cách chạm trực tiếp trên robot, thẻ lệnh Coder hoặc VEXcode 123.
- VEX GO (từ 8 tuổi): STEM từ sớm, lập trình khối lệnh và Python.
- VEX AIM (từ 8 tuổi): robot lắp sẵn, đưa trí tuệ nhân tạo và học máy vào môn khoa học máy tính.
- VEX IQ (từ 11 tuổi): học STEM ứng dụng, lập trình khối lệnh, Python và C++, tương thích thi đấu.
- VEX EXP (từ 14 tuổi): STEM thực tế cho lớp học, lập trình khối lệnh, Python và C++.
- VEX V5: STEM thực tế cho thi đấu VEX Robotics Competition.
- VEX CTE Workcell (từ 14 tuổi): cánh tay robot 6 trục, băng chuyền và khí nén cho giáo dục nghề nghiệp.
- VEX AIR (từ 14 tuổi): drone thi đấu, học robotics, công nghệ và hàng không.
- VEXcode VR (từ 8 tuổi): lập trình robot ảo ngay trên trình duyệt.
- VEX PD+: cộng đồng phát triển chuyên môn cho giáo viên.`,
  descriptionEn: `The VEX Robotics education ecosystem grows with students from early childhood through high school and career and technical education: each product line fits an age range, all sharing the VEXcode software and free learning resources.

- VEX 123 (ages 4+): code by touching the robot, with Coder cards, or in VEXcode 123.
- VEX GO (ages 8+): STEM starts early, coded with Blocks and Python.
- VEX AIM (ages 8+): a pre-built robot that brings AI and machine learning into computer science.
- VEX IQ (ages 11+): applied STEM learning, coded with Blocks, Python and C++, competition compatible.
- VEX EXP (ages 14+): real-world STEM for classrooms, coded with Blocks, Python and C++.
- VEX V5: real-world STEM for the VEX Robotics Competition.
- VEX CTE Workcell (ages 14+): a 6-axis robotic arm, conveyors and pneumatics for career and technical education.
- VEX AIR (ages 14+): a competition drone for robotics, technology and aeronautics.
- VEXcode VR (ages 8+): virtual robot coding right in the browser.
- VEX PD+: a professional learning community for teachers.`,
  images: [`${IMG}vex-iq.png`, `${IMG}vex-123.png`, `${IMG}vex-v5.jpg`],
};

const ITEMS = [
  {
    nameVi: 'VEX 123 – Lập trình từ sớm (từ 4 tuổi)', nameEn: 'VEX 123 – Coding Starts Early (ages 4+)',
    group: 'robots',
    descriptionVi: `VEX 123 đưa lập trình đến với trẻ từ 4 tuổi: robot nhỏ, tương tác trực quan, giúp trẻ làm quen tư duy máy tính qua trò chơi.

Ba cách lập trình:
- Chạm để lập trình trực tiếp trên robot VEX 123.
- Dùng bộ VEX Coder với các thẻ lệnh Coder Card.
- Lập trình kéo-thả khối lệnh với VEXcode 123 (không kèm máy tính bảng).

Bộ lớp học (Classroom Bundle):
- Lớp nhỏ: 12 học sinh – 6 robot.
- Lớp tiêu chuẩn: 24 học sinh – 12 robot.
- Lớp lớn: 36 học sinh – 18 robot.

Bộ VEX 123 Education Kit gồm 1 robot 123, 1 Coder và bộ thẻ lệnh; Coder dùng 2 pin AAA (không kèm theo).

Học liệu: toàn bộ học liệu bám sát chuẩn giáo dục — các bài STEM Lab, sách hướng dẫn giáo viên trực tuyến và hơn 30 hoạt động cho học sinh, kết nối lập trình với đọc hiểu (literacy) và toán (numeracy). Túi Classroom Bundle có ngăn đựng Coder, thẻ lệnh và trạm sạc robot, giúp giáo viên quản lý và di chuyển dễ dàng.`,
    descriptionEn: `VEX 123 brings coding to children from age 4: a small, interactive robot that introduces computational thinking through play.

Three ways to code:
- Touch Coding directly on the VEX 123 Robot.
- The VEX Coder with Coder Cards.
- Drag-and-drop Blocks with VEXcode 123 (tablet not included).

Classroom Bundles:
- Small classroom: 12 students – 6 robots.
- Classroom: 24 students – 12 robots.
- Large classroom: 36 students – 18 robots.

The VEX 123 Education Kit includes one 123 Robot, Coder and Cards; the Coder requires 2 AAA batteries (not included).

Curriculum: all resources are aligned to educational standards — STEM Lab units, an online teacher's manual and 30+ activities for students, connecting coding with literacy and numeracy. Classroom Bundle bags hold Coders, Coder Cards and a charging station for the robots, making storage and travel simple.`,
    images: [`${IMG}vex-123.png`, `${IMG}vex-123-coder.jpg`],
  },
  {
    nameVi: 'VEX GO – STEM từ sớm (từ 8 tuổi)', nameEn: 'VEX GO – STEM Starts Early (ages 8+)',
    group: 'robots',
    descriptionVi: `VEX GO đưa STEM đến với học sinh từ 8 tuổi qua các bài học liên môn: lập trình, khoa học vật lý, kỹ thuật, toán, mỹ thuật, khoa học sự sống và thi đấu trong lớp học — với hơn 60 mô hình lắp ráp. Mỗi chi tiết đều có mục đích và vị trí riêng: mã màu, hộp đựng và cách sắp xếp giúp học sinh và giáo viên dễ dàng quản lý bộ kit.

- Lập trình bằng khối lệnh và Python trong VEXcode GO (không kèm máy tính bảng).
- Phù hợp tổ chức thi đấu trong lớp học (Classroom Competition).
- Bộ VEX GO Kit with Storage chứa đầy đủ chi tiết, động cơ và linh kiện điện tử, được sắp xếp sẵn trong hộp đựng có thể tái sử dụng.

Bộ lớp học (Classroom Bundle):
- Lớp nhỏ: 10 học sinh – 5 bộ robot.
- Lớp tiêu chuẩn: 20 học sinh – 10 bộ robot.
- Lớp lớn: 30 học sinh – 15 bộ robot.`,
    descriptionEn: `VEX GO brings STEM to students from age 8 through cross-curricular lessons in coding, physical science, engineering, maths, art, life science and classroom competition — with 60+ builds available. Every piece has a purpose and every part has a place: colour coding, storage and organisation make it easier than ever for students and teachers to keep track of their kits.

- Code with Blocks and Python in VEXcode GO (tablet not included).
- Suited to Classroom Competition.
- The VEX GO Kit with Storage contains all parts, motors and electronics, pre-sorted into a convenient re-usable carrying case.

Classroom Bundles:
- Small classroom: 10 students – 5 robots.
- Classroom: 20 students – 10 robots.
- Large classroom: 30 students – 15 robots.`,
    images: [`${IMG}vex-go.png`, `${IMG}vex-go-kit.png`],
  },
  {
    nameVi: 'VEX AIM – Robot lập trình AI (từ 8 tuổi)', nameEn: 'VEX AIM – AI Coding Robot (ages 8+)',
    group: 'robots',
    descriptionVi: `VEX AIM mang đến trải nghiệm học tập thực hành và cách tiếp cận mới cho môn khoa học máy tính ở bậc THCS và THPT. Robot được thiết kế để giới thiệu nguyên lý và ứng dụng của trí tuệ nhân tạo (AI) và học máy, chuẩn bị cho học sinh những ngành nghề STEM tương lai.

- Robot lắp sẵn, cao khoảng 73 mm — mở hộp là có thể bắt đầu.
- Lập trình bằng khối lệnh, Python và Switch trên mọi nền tảng; phần mềm miễn phí (không kèm máy tính).

Bộ VEX AIM Coding Robot gồm:
- 1 robot AIM và 1 tay điều khiển One Stick Controller.
- 1 hộp đựng và 1 cáp USB (A-C, 1 m).
- 3 thùng cam, 3 thùng xanh, 2 quả bóng và 5 biển AprilTag (ID 0–4).

Bộ lớp học VEX AIM Classroom Bundle dành cho 12 học sinh: 6 robot AIM kèm hộp đựng, 3 sân VEX AIM, túi đựng, 2 bộ sạc USB 4 cổng, 6 cáp USB dự phòng, poster linh kiện, túi phụ kiện bổ sung (3 thùng cam, 3 thùng xanh, 8 quả bóng, 5 biển AprilTag) và 2 lục giác.`,
    descriptionEn: `VEX AIM provides an immersive, hands-on learning experience and a new approach to computer science education in middle and high school classrooms. It is designed to introduce the principles and applications of artificial intelligence and machine learning, preparing students for future careers in STEM fields.

- A pre-built robot, about 73 mm tall — ready to start out of the box.
- Code with Blocks, Python and Switch on all platforms; software available at no cost (laptop not included).

The VEX AIM Coding Robot includes:
- 1 AIM Robot and 1 One Stick Controller.
- 1 storage case and 1 USB cable (A-C, 1 m).
- 3 orange barrels, 3 blue barrels, 2 sports balls and 5 AprilTag signs (IDs 0–4).

The VEX AIM Classroom Bundle for 12 students: 6 AIM Coding Robots with storage cases, 3 VEX AIM Fields, a tote bag, 2 USB 4-way chargers, 6 extra USB cables, a parts poster, a mesh bag of extras (3 orange barrels, 3 blue barrels, 8 balls, 5 AprilTag signs) and 2 Allen wrenches.`,
    images: [`${IMG}vex-aim.jpg`, `${IMG}vex-aim-san.png`],
  },
  {
    nameVi: 'VEX IQ – Học STEM ứng dụng (từ 11 tuổi)', nameEn: 'VEX IQ – Applied STEM Learning (ages 11+)',
    group: 'robots',
    descriptionVi: `VEX IQ là giải pháp lớp học trọn gói cho học STEM ứng dụng: các trò chơi STEM đưa bài học vào không khí thi đấu ngay trong lớp; sân thi đấu lắp ráp nhanh với nhiều hình dạng, kích thước, phù hợp mọi cách bố trí lớp học. Kèm theo chi tiết dự phòng, dụng cụ, cáp, bộ sạc và poster; hơn 45 hoạt động như Up and Over, Tug of War, Robot Soccer, Treasure Hunt.

- Lập trình bằng khối lệnh, Python và C++ trong VEXcode IQ (không kèm máy tính).
- Tương thích thi đấu (Competition Compatible) và phù hợp thi đấu trong lớp học (Classroom Competition).
- Bộ VEX IQ Education Kit (thế hệ 2) chứa toàn bộ chi tiết để chế tạo một robot lớp học; mỗi chi tiết có vị trí riêng trong hộp đựng.

Bộ lớp học (Classroom Bundle):
- Lớp nhỏ: 10 học sinh – 5 bộ Education Kit.
- Lớp tiêu chuẩn: 20 học sinh – 10 bộ Education Kit.
- Lớp lớn: 30 học sinh – 15 bộ Education Kit.`,
    descriptionEn: `VEX IQ is an all-in-one classroom solution for applied STEM learning: STEM Games bring learning to life through the excitement of classroom competitions, and Game Fields assemble quickly in a variety of shapes and sizes, perfect for any classroom layout. Includes extra spare parts, pin tools, cables, chargers and posters, with 45+ activities such as Up and Over, Tug of War, Robot Soccer and Treasure Hunt.

- Code with Blocks, Python and C++ in VEXcode IQ (laptop not included).
- Competition Compatible and suited to Classroom Competition.
- The VEX IQ Education Kit (2nd gen) contains all the parts needed for one classroom robot; every part has its own dedicated location in the storage bins.

Classroom Bundles:
- Small classroom: 10 students – 5 Education Kits.
- Classroom: 20 students – 10 Education Kits.
- Large classroom: 30 students – 15 Education Kits.`,
    images: [`${IMG}vex-iq.png`, `${IMG}vex-iq-brain.png`],
  },
  {
    nameVi: 'VEX EXP – STEM thực tế cho lớp học (từ 14 tuổi)', nameEn: 'VEX EXP – Real World STEM for Classrooms (ages 14+)',
    group: 'robots',
    descriptionVi: `VEX EXP là giải pháp lớp học trọn gói mang STEM thực tế vào lớp học: các trò chơi STEM tạo không khí thi đấu ngay trong lớp; sân thi đấu lắp ráp nhanh, phù hợp mọi cách bố trí lớp học. Kèm theo chi tiết dự phòng, dụng cụ, cáp, bộ sạc và poster; hơn 40 hoạt động như Team Freeze Tag, Ring Leader, Platform Placer, Robot Soccer.

- Lập trình bằng khối lệnh, Python và C++ trong VEXcode EXP (không kèm máy tính).
- Phù hợp thi đấu trong lớp học (Classroom Competition).
- Bộ VEX EXP Education Kit chứa toàn bộ chi tiết để chế tạo một robot lớp học; mỗi chi tiết có vị trí riêng trong hộp đựng.

Bộ lớp học (Classroom Bundle):
- Lớp nhỏ: 10 học sinh – 5 bộ Education Kit.
- Lớp tiêu chuẩn: 20 học sinh – 10 bộ Education Kit.
- Lớp lớn: 30 học sinh – 15 bộ Education Kit.`,
    descriptionEn: `VEX EXP is an all-in-one classroom solution that brings real-world STEM into the classroom: STEM Games bring learning to life through classroom competitions, and Game Fields assemble quickly to fit any classroom layout. Includes extra spare parts, tools, cables, chargers and posters, with 40+ activities such as Team Freeze Tag, Ring Leader, Platform Placer and Robot Soccer.

- Code with Blocks, Python and C++ in VEXcode EXP (laptop not included).
- Suited to Classroom Competition.
- The VEX EXP Education Kit contains all the parts you need to build one classroom robot; every part has its own dedicated location in the storage bins.

Classroom Bundles:
- Small classroom: 10 students – 5 Education Kits.
- Classroom: 20 students – 10 Education Kits.
- Large classroom: 30 students – 15 Education Kits.`,
    images: [`${IMG}vex-exp.png`],
  },
  {
    nameVi: 'VEX V5 – STEM thực tế cho thi đấu', nameEn: 'VEX V5 – Real World STEM for Competition',
    group: 'robots',
    descriptionVi: `VEX V5 là nền tảng dành cho giải đấu VEX Robotics Competition. Mỗi năm VEX công bố một thử thách mới, học sinh thiết kế và chế tạo robot để thi đấu — kiến thức STEM trên lớp được kiểm chứng trên sân đấu cùng các đội trên toàn thế giới.

- Lập trình bằng khối lệnh, Python và C++ trong VEXcode V5 (không kèm máy tính).
- Tương thích thi đấu (Competition Compatible); cấu trúc nhôm nhẹ và chắc.

Thành phần chính:
- Robot Brain: kết nối toàn bộ robot, màn hình màu để điều khiển nhanh.
- Controller: pin tích hợp, 2 cần analog và 12 nút bấm.
- Robot Battery: công nghệ Li-ion, có đèn báo mức sạc.
- Smart Motor: tích hợp encoder theo dõi vị trí và vận tốc.
- Cảm biến (mua riêng): Optical (màu sắc, ánh sáng, khoảng cách gần, cử chỉ), Rotation (góc quay, số vòng, tốc độ), Distance (đo khoảng cách không nhiễu), Inertial (gia tốc kế và con quay 3 trục), GPS (xác định vị trí chính xác trên sân).

Bộ thi đấu:
- Starter Kit: Robot Brain và Controller, 4 Smart Motor (11W), 2 công tắc va chạm, hơn 350 chi tiết chuyển động, hơn 1.000 chi tiết cấu trúc.
- Super Kit: Robot Brain và Controller, 8 Smart Motor (11W), 2 công tắc va chạm, hơn 900 chi tiết chuyển động, hơn 2.000 chi tiết cấu trúc.`,
    descriptionEn: `VEX V5 is the platform for the VEX Robotics Competition. Every year VEX creates a game and students build a robot to play it — classroom STEM concepts are put to the test on the field as students from around the globe compete.

- Code with Blocks, Python and C++ in VEXcode V5 (laptop not included).
- Competition Compatible; lightweight aluminum structure.

Key components:
- Robot Brain: connects your entire robot together, with a color screen for quick and easy control.
- Controller: integrated battery, two analog joysticks and 12 buttons.
- Robot Battery: Li-ion technology with a quick battery charge indicator.
- Smart Motor: integrated encoders to track position and velocity.
- Sensors (purchased separately): Optical (color, light level, proximity, gestures), Rotation (position, total rotations, speed), Distance (accurate distance without interference), Inertial (3-axis accelerometer and 3-axis gyro), GPS (exact location on the field).

Competition kits:
- Starter Kit: Robot Brain & Controller, 4 Smart Motors (11W), 2 bumper switches, 350+ motion parts, 1000+ structural parts.
- Super Kit: Robot Brain & Controller, 8 Smart Motors (11W), 2 bumper switches, 900+ motion parts, 2000+ structural parts.`,
    images: [`${IMG}vex-v5.jpg`, `${IMG}vex-v5-robot.png`],
  },
  {
    nameVi: 'VEX CTE Workcell – Robot công nghiệp cho giáo dục nghề nghiệp (từ 14 tuổi)', nameEn: 'VEX CTE Workcell – Industrial robotics for career education (ages 14+)',
    group: 'robots',
    descriptionVi: `VEX CTE Workcell được thiết kế cho giáo dục nghề nghiệp và kỹ thuật (Career and Technical Education): học sinh thiết kế và lập trình một trạm sản xuất mô phỏng thực tế gồm cánh tay robot, băng chuyền và hệ thống khí nén.

- Cánh tay robot 6 trục, tầm với tối đa 335 mm; mặt bàn 638 × 333 mm.
- Lập trình bằng khối lệnh, Python và C++ trong VEXcode; phần mềm miễn phí (không kèm máy tính).
- Tình huống thực tế: thực hiện các chức năng giống trung tâm phân phối hàng hóa bằng hệ thống mô phỏng chính xác.
- Dạy robot công nghiệp với các khái niệm sản xuất thực tế như vận chuyển vật liệu và tối ưu bố trí dây chuyền.
- Phù hợp thi đấu trong lớp học (Classroom Competition).`,
    descriptionEn: `The VEX CTE Workcell is designed for Career and Technical Education: students gain hands-on experience designing and programming a realistic workcell with a robotic arm, conveyors and pneumatics.

- 6-axis robotic arm with a maximum reach of 335 mm; platform size 638 × 333 mm.
- Code with Blocks, Python and C++ in VEXcode; software available at no cost (laptop not included).
- Realistic use case: perform the same functions as real distribution centers using accurately replicated systems.
- Teach industrial robotics with real-life manufacturing concepts like material handling and layout optimization.
- Suited to Classroom Competition.`,
    images: [`${IMG}vex-cte.png`],
  },
  {
    nameVi: 'VEX AIR – Drone thi đấu (từ 14 tuổi)', nameEn: 'VEX AIR – Competition Drone (ages 14+)',
    group: 'robots',
    descriptionVi: `VEX AIR là drone giáo dục và thi đấu, giúp học sinh và giáo viên tìm hiểu sâu các nguyên lý của robotics, công nghệ và hàng không. Được phát triển dựa trên kinh nghiệm của VEX Robotics, drone hỗ trợ giáo dục nghề nghiệp và kỹ thuật (CTE) và phát triển những kỹ năng quan trọng nhất của học sinh trong lĩnh vực robotics — có thể dùng trong hoạt động lớp học lẫn thi đấu.

- Lập trình bằng khối lệnh, Python và Switch trên mọi nền tảng; phần mềm miễn phí (không kèm máy tính).
- Kích thước drone khoảng 190,5 × 221 mm; tay điều khiển khoảng 235,4 × 123,6 × 55,2 mm.

Bộ VEX AIR Competition Drone gồm:
- 1 drone VEX AIR và 1 tay điều khiển.
- 3 module: Module 1 – Passive, Module 2 – Motorized, Module 3 – Magnetic.
- 2 pin dung lượng cao và 2 pin dung lượng thấp.
- 1 tai nghe liên lạc (Communication Headset).
- Bộ cánh quạt dự phòng (2 bộ loại A và 2 bộ loại B, mỗi bộ 4 cánh).
- Cáp USB-A sang USB-C và bộ sạc AC (1 cổng 15W, 4 cổng 48W).`,
    descriptionEn: `VEX AIR is an educational and competition drone that lets students and educators delve into the principles of robotics, technology and aeronautics. Built upon the knowledge and experience of VEX Robotics, it is designed to enhance Career and Technical Education (CTE) and support the development of the most critical student skills in robotics — in classroom activities and competitions alike.

- Code with Blocks, Python and Switch on all platforms; software available at no cost (laptop not included).
- Drone size about 190.5 mm (L) × 221 mm (W); remote about 235.4 × 123.6 × 55.2 mm.

The VEX AIR Competition Drone includes:
- 1 VEX AIR Drone and 1 VEX AIR Drone Controller.
- 3 modules: Module 1 – Passive, Module 2 – Motorized, Module 3 – Magnetic.
- 2 high-capacity and 2 low-capacity batteries.
- 1 Communication Headset.
- Extra propellers (2 sets A and 2 sets B, 4 each).
- USB-A to USB-C cables and AC to USB-A adapters (1-port 15W, 4-port 48W).`,
    images: [`${IMG}vex-air.png`],
  },
  {
    nameVi: 'VEXcode VR – Lập trình robot ảo (từ 8 tuổi)', nameEn: 'VEXcode VR – Virtual Robot Coding (ages 8+)',
    group: 'learning',
    descriptionVi: `VEXcode VR cho phép học sinh học khoa học máy tính với robot ảo ngay trên trình duyệt — không cần tài khoản học sinh, không cần cài đặt. Bài làm của học sinh được nộp lại giúp giáo viên dễ dàng thu thập mã lệnh, theo dõi tiến độ và hoạt động.

Ba cách lập trình: kéo-thả khối lệnh, Switch (chuyển dần sang Python) và Python.

Các gói VEXcode VR:
- Free: khối lệnh (trên web), 15 sân chơi đồ họa cơ bản, chứng chỉ giáo viên.
- Enhanced: khối lệnh và Python (web và ứng dụng), hơn 18 sân chơi đồ họa sinh động, chứng chỉ giáo viên.
- Premium: khối lệnh, Switch và Python (web và ứng dụng), hơn 20 sân chơi kèm AI và khoa học dữ liệu, chứng chỉ giáo viên, VEX PD+ và cộng đồng VEX.
Mỗi giấy phép dành cho học sinh của một giáo viên (ở trường và ở nhà) trong một năm.

Học liệu miễn phí: các bài STEM Lab bám sát chuẩn giáo dục, dễ tích hợp vào môn Tin học hoặc Kỹ thuật, cùng hơn 75 hoạt động như To the Lab!, Crater Collection, Topographic Map, Dispenser Dash.`,
    descriptionEn: `VEXcode VR lets students learn computer science with a virtual robot right in the browser — no student accounts or installation required. Student learning submissions make collecting code, progress and activity easy for teachers.

Three ways to code: drag-and-drop Blocks, Switch (an easy transition to Python) and Python.

VEXcode VR tiers:
- Free: Blocks (web-based), 15 playgrounds with basic graphics, educator certifications.
- Enhanced: Blocks and Python (web- and app-based), 18+ playgrounds with engaging graphics, educator certifications.
- Premium: Blocks, Switch and Python (web- and app-based), 20+ playgrounds with engaging graphics plus AI and Data Science, educator certifications, VEX PD+ and the VEX Community.
Each license includes access for one educator's students (in school and at home) for one year.

Free curriculum: standards-aligned STEM Lab units that integrate easily into core subjects like Computing or Engineering, plus 75+ activities such as To the Lab!, Crater Collection, Topographic Map and Dispenser Dash.`,
    images: [`${IMG}vexcode-vr.jpg`, `${IMG}vexcode-vr-2.jpg`],
  },
  {
    nameVi: 'VEX PD+ – Phát triển chuyên môn cho giáo viên', nameEn: 'VEX PD+ – Professional Development for teachers',
    group: 'learning',
    descriptionVi: `VEX PD+ là chương trình phát triển chuyên môn theo nhu cầu, do chuyên gia VEX dẫn dắt — giáo viên học khi cần, kết nối với chuyên gia VEX và đồng nghiệp trên toàn thế giới.

- VEX Community: kết nối giáo viên dùng VEX toàn cầu, đặt câu hỏi, chia sẻ kinh nghiệm và nhận phản hồi trực tiếp từ chuyên gia VEX.
- VEX Masterclasses: đào tạo chuyên sâu về giảng dạy với VEX, các buổi chuyên đề nâng cao kỹ năng và chiến lược áp dụng ngay.
- VEX Intro Courses: khóa nhập môn cho từng nền tảng VEX, lấy chứng chỉ để tham gia đầy đủ cộng đồng chuyên môn.
- PD+ Insights: bài viết về giảng dạy STEM, xu hướng và phương pháp, ý tưởng thực tế cho lớp học.

Gói VEX PD+ All Access: 365 ngày truy cập kể từ ngày kích hoạt.
Gói miễn phí (Free Tier): khóa nhập môn cho từng nền tảng VEX, xem cộng đồng chuyên môn (PLC) và lấy chứng chỉ để tham gia đầy đủ.`,
    descriptionEn: `VEX PD+ is on-demand, expert-led professional development — teachers get the ongoing development they need, when they need it, and connect with VEX experts and educators around the world.

- VEX Community: connect with educators worldwide using VEX, ask questions, share strategies and get direct feedback from VEX experts.
- VEX Masterclasses: deep-dive, expert-led training on teaching with VEX, targeted sessions and strategies you can use immediately.
- VEX Intro Courses: the essentials for each VEX platform, with certifications that unlock full PLC participation.
- PD+ Insights: articles on STEM teaching, trends and pedagogy, with practical takeaways for your classroom.

VEX PD+ All Access: 365 days of access from the date of initial activation.
Free Tier: intro courses for each VEX platform, view the Professional Learning Community (PLC), and earn certification to unlock full participation.`,
    images: [`${IMG}vex-pd-plus.jpg`],
  },
];

module.exports = { GROUPS, OVERVIEW, ITEMS };
