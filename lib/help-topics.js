// The Hỗ trợ (help) page /ho-tro: questions and answers in five fixed groups, managed in Admin → Hỗ trợ.
// The first time the page (or its admin list) is opened, the starter questions below are saved once; after that the
// admin's own list is used, even when they delete every question (SiteSettings.helpSeeded).
const HelpItem = require('../models/HelpItem');
const SiteSettings = require('../models/SiteSettings');
const { getSiteSettings, clearSiteSettingsCache } = require('./settings');

// key = the group's anchor on the page (/ho-tro#tai-khoan); icon = inner markup of a 24x24 outline icon
const HELP_GROUPS = [
  { key: 'tai-khoan', labelKey: 'help.groups.tai-khoan',
    icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>' },
  { key: 'gui-yeu-cau', labelKey: 'help.groups.gui-yeu-cau',
    icon: '<path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4Z"/>' },
  { key: 'san-pham', labelKey: 'help.groups.san-pham',
    icon: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/>' },
  { key: 'quyen-rieng-tu', labelKey: 'help.groups.quyen-rieng-tu',
    icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
  { key: 'su-dung', labelKey: 'help.groups.su-dung',
    icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>' },
];
const HELP_GROUP_KEYS = HELP_GROUPS.map((g) => g.key);

// Starter questions, written from how the website really works (October 2026). Plain text: a blank line starts a
// paragraph, "- " starts a list line (lib/text.js).
const DEFAULT_HELP_ITEMS = [
  // ---- Tài khoản ----
  { group: 'tai-khoan',
    questionVi: 'Làm sao để tạo tài khoản?',
    questionEn: 'How do I create an account?',
    answerVi: 'Bấm "Đăng ký" ở góc trên bên phải trang (trên điện thoại: mở menu ☰). Điền họ tên, email và mật khẩu (tối thiểu 6 ký tự, nhập hai lần). Số điện thoại và trường học / đơn vị có thể bỏ trống. Đánh dấu đồng ý với Chính sách bảo mật rồi bấm Đăng ký.\n\nSau đó trang Đăng nhập mở ra với email của bạn điền sẵn: chỉ cần nhập mật khẩu để vào.',
    answerEn: 'Click "Sign Up" at the top right of the page (on a phone: open the ☰ menu). Fill in your name, email and a password (at least 6 characters, typed twice). Phone number and school / organisation are optional. Tick that you agree with the Privacy Policy, then click Sign Up.\n\nThe login page then opens with your email filled in: just type your password to log in.' },
  { group: 'tai-khoan',
    questionVi: 'Tôi có thể đăng nhập bằng tài khoản Google không?',
    questionEn: 'Can I log in with my Google account?',
    answerVi: 'Có. Trên trang Đăng nhập hoặc Đăng ký, bấm "Đăng nhập bằng Google" (hoặc "Đăng ký bằng Google") và chọn tài khoản Google của bạn. Nếu chưa có tài khoản trên website, một tài khoản mới được tạo ngay.\n\nNếu bạn đã đăng ký bằng email trước đó, lần đăng nhập Google đầu tiên với cùng địa chỉ email sẽ gộp vào tài khoản cũ: các yêu cầu đã gửi vẫn còn nguyên.\n\nVới tài khoản Google, tên, email và ảnh đại diện được lấy từ Google ở mỗi lần đăng nhập.',
    answerEn: 'Yes. On the login or sign-up page, click "Log in with Google" (or "Sign up with Google") and pick your Google account. If you don\'t have an account on the website yet, a new one is created straight away.\n\nIf you signed up with your email before, the first Google login with the same email address joins that account: the requests you sent are kept.\n\nFor a Google account, your name, email and photo are taken from Google at each login.' },
  { group: 'tai-khoan',
    questionVi: 'Tôi đăng nhập bằng Google, có thể đăng nhập bằng mật khẩu không?',
    questionEn: 'I log in with Google. Can I also use a password?',
    answerVi: 'Có. Mở "Hồ sơ" trong menu tên của bạn, tìm thẻ "Đặt mật khẩu" và nhập mật khẩu mới hai lần. Từ đó bạn đăng nhập được bằng Google hoặc bằng email và mật khẩu.',
    answerEn: 'Yes. Open "Profile" in the menu under your name, find the "Set a password" card and type a new password twice. From then on you can log in with Google or with your email and password.' },
  { group: 'tai-khoan',
    questionVi: 'Làm sao để đổi mật khẩu?',
    questionEn: 'How do I change my password?',
    answerVi: 'Mở "Hồ sơ" trong menu tên của bạn. Ở thẻ "Đổi mật khẩu", nhập mật khẩu hiện tại, rồi mật khẩu mới (tối thiểu 6 ký tự) hai lần và bấm Đổi mật khẩu. Bấm biểu tượng con mắt để xem lại mật khẩu đang gõ.',
    answerEn: 'Open "Profile" in the menu under your name. In the "Change password" card, type your current password, then the new one (at least 6 characters) twice, and click Change password. Click the eye icon to see what you are typing.' },
  { group: 'tai-khoan',
    questionVi: 'Tôi quên mật khẩu thì phải làm sao?',
    questionEn: 'I forgot my password. What can I do?',
    answerVi: 'Nếu tài khoản dùng cùng email với một tài khoản Google, bạn có thể bấm "Đăng nhập bằng Google" để vào, rồi đặt mật khẩu mới trong Hồ sơ.\n\nNếu không, hãy gọi điện hoặc gửi email cho MTG (thông tin ở cuối trang này): chúng tôi sẽ giúp bạn lấy lại quyền truy cập.',
    answerEn: 'If your account uses the same email as a Google account, you can click "Log in with Google" to get in, then set a new password in your Profile.\n\nOtherwise, call or email MTG (details at the bottom of this page) and we will help you get back into your account.' },
  { group: 'tai-khoan',
    questionVi: 'Làm sao để đổi tên, số điện thoại hoặc ảnh đại diện?',
    questionEn: 'How do I change my name, phone number or photo?',
    answerVi: 'Mở "Hồ sơ" trong menu tên của bạn, sửa thông tin rồi bấm Cập nhật. Ảnh đại diện nhận file JPG, PNG, WEBP hoặc GIF, tối đa 20 MB; "Xóa ảnh" đưa ảnh về chữ cái đầu của tên.\n\nVới tài khoản Google, tên được lấy từ Google: muốn đổi tên, hãy đổi trong tài khoản Google của bạn.',
    answerEn: 'Open "Profile" in the menu under your name, change the details and click Update. Your photo can be a JPG, PNG, WEBP or GIF file of up to 20 MB; "Delete photo" brings back the first letters of your name.\n\nFor a Google account, the name comes from Google: to change it, change it in your Google account.' },

  // ---- Gửi yêu cầu ----
  { group: 'gui-yeu-cau',
    questionVi: 'Làm sao để gửi yêu cầu tư vấn hoặc báo giá?',
    questionEn: 'How do I ask for advice or a quote?',
    answerVi: 'Bạn cần đăng nhập trước. Sau đó có ba cách:\n- Trang "Liên hệ": chọn lĩnh vực bạn quan tâm và viết nội dung.\n- Trang của từng robot: dùng mẫu yêu cầu ở cuối trang.\n- Trang của từng dịch vụ: chọn gói (nếu có), trả lời vài câu hỏi ngắn và gửi.\n\nMỗi yêu cầu cần họ tên, nội dung, và số điện thoại hoặc email để MTG liên hệ lại.',
    answerEn: 'You need to log in first. Then there are three ways:\n- The "Contact" page: choose the area you are interested in and write your message.\n- Each robot\'s page: use the request form at the bottom.\n- Each service\'s page: pick a package (if there are any), answer a few short questions and send.\n\nEvery request needs your name, a message, and a phone number or email so MTG can get back to you.' },
  { group: 'gui-yeu-cau',
    questionVi: 'Sau khi gửi yêu cầu, chuyện gì sẽ xảy ra?',
    questionEn: 'What happens after I send a request?',
    answerVi: 'Một thông báo cảm ơn hiện ra ngay khi yêu cầu được gửi. Đội ngũ MTG sẽ đọc yêu cầu và liên hệ với bạn qua số điện thoại hoặc email bạn để lại, thường trong giờ làm việc.\n\nBạn có thể theo dõi tình trạng yêu cầu bất cứ lúc nào trong "Yêu cầu của tôi".',
    answerEn: 'A thank-you note appears as soon as your request is sent. The MTG team reads it and contacts you by the phone number or email you gave, usually during working hours.\n\nYou can follow your request at any time in "My Requests".' },
  { group: 'gui-yeu-cau',
    questionVi: 'Tôi xem lại các yêu cầu đã gửi ở đâu?',
    questionEn: 'Where can I see the requests I sent?',
    answerVi: 'Bấm vào tên của bạn ở góc trên bên phải và chọn "Yêu cầu của tôi". Trang này liệt kê mọi yêu cầu bạn đã gửi, mới nhất ở trên, với ngày gửi và trạng thái.',
    answerEn: 'Click your name at the top right and choose "My Requests". This page lists every request you have sent, newest first, with the date and its status.' },
  { group: 'gui-yeu-cau',
    questionVi: 'Tôi có thể sửa yêu cầu đã gửi không?',
    questionEn: 'Can I change a request I already sent?',
    answerVi: 'Được, khi yêu cầu còn ở trạng thái "Mới" (MTG chưa bắt đầu xử lý). Trong "Yêu cầu của tôi", bấm "Sửa" ở yêu cầu đó, chỉnh nội dung và bấm "Cập nhật yêu cầu".\n\nKhi MTG đã liên hệ, yêu cầu không sửa được nữa: bạn có thể gửi một yêu cầu mới.',
    answerEn: 'Yes, while it is still "New" (MTG has not started on it). In "My Requests", click "Edit" on that request, make your changes and click "Update request".\n\nOnce MTG has contacted you, the request can no longer be changed: you can send a new one instead.' },
  { group: 'gui-yeu-cau',
    questionVi: 'Các trạng thái của yêu cầu có nghĩa là gì?',
    questionEn: 'What do the request statuses mean?',
    answerVi: '- Mới: MTG đã nhận yêu cầu và sẽ liên hệ với bạn. Bạn vẫn sửa được.\n- Đã liên hệ: MTG đã liên hệ và đang làm việc với bạn.\n- Hoàn tất: yêu cầu đã được xử lý xong.',
    answerEn: '- New: MTG has received your request and will contact you. You can still change it.\n- Contacted: MTG has contacted you and is working on it.\n- Completed: the request is done.' },

  // ---- Sản phẩm & giải pháp ----
  { group: 'san-pham',
    questionVi: 'Làm sao để tìm một thiết bị STEM?',
    questionEn: 'How do I find a piece of STEM equipment?',
    answerVi: 'Mở Giải pháp → "Thiết bị, học liệu, Robot STEM". Các thiết bị được chia theo nhóm trong các thẻ phía trên; ô tìm kiếm tìm theo tên, không cần gõ dấu. Bấm vào một thiết bị để xem ảnh và thông số chi tiết.',
    answerEn: 'Open Solutions → "Equipment, learning materials & STEM robots". The equipment is sorted into groups in the tabs at the top; the search box finds items by name, accents optional. Click an item to see its photos and details.' },
  { group: 'san-pham',
    questionVi: 'Tôi có thể xem các dự án MTG đã làm theo cấp học không?',
    questionEn: 'Can I see MTG\'s projects by school level?',
    answerVi: 'Có. Trang Giải pháp → "Dự án tham khảo" xếp các phòng Lab STEM đã triển khai theo cấp học (THCS, THPT, Đại học…). Ô tìm kiếm giúp tìm nhanh theo tên trường.',
    answerEn: 'Yes. Solutions → "Reference projects" groups the STEM Labs MTG has built by school level (lower secondary, upper secondary, university…). The search box finds a school by name.' },
  { group: 'san-pham',
    questionVi: 'Vì sao tôi không tải được video trên website?',
    questionEn: 'Why can\'t I download the videos on the website?',
    answerVi: 'Video trên website chỉ để xem trực tiếp. Nếu bạn cần video hoặc tài liệu để giới thiệu cho nhà trường, hãy gửi yêu cầu qua trang Liên hệ, MTG sẽ gửi cho bạn.',
    answerEn: 'Videos on the website are for watching here only. If you need a video or documents to show your school, send a request on the Contact page and MTG will send them to you.' },

  // ---- Quyền riêng tư & dữ liệu ----
  { group: 'quyen-rieng-tu',
    questionVi: 'Website lưu những thông tin gì về tôi?',
    questionEn: 'What information does the website keep about me?',
    answerVi: 'Thông tin tài khoản (họ tên, email, số điện thoại, trường học / đơn vị, ảnh đại diện nếu có) và các yêu cầu bạn đã gửi. Mọi chi tiết về cách MTG thu thập, sử dụng và bảo vệ thông tin nằm trong Chính sách bảo mật (liên kết ở cuối mỗi trang).',
    answerEn: 'Your account details (name, email, phone number, school / organisation, photo if you added one) and the requests you have sent. How MTG collects, uses and protects this information is explained in the Privacy Policy (link at the bottom of every page).' },
  { group: 'quyen-rieng-tu',
    questionVi: 'Làm sao để tải về dữ liệu của tôi?',
    questionEn: 'How do I download my data?',
    answerVi: 'Mở "Hồ sơ" trong menu tên của bạn, đến thẻ "Dữ liệu của bạn" và bấm "Tải dữ liệu của tôi". Bạn nhận một file chứa thông tin tài khoản và mọi yêu cầu đã gửi (không bao gồm mật khẩu).',
    answerEn: 'Open "Profile" in the menu under your name, go to the "Your data" card and click "Download my data". You get one file with your account details and every request you sent (never your password).' },
  { group: 'quyen-rieng-tu',
    questionVi: 'Làm sao để xóa tài khoản?',
    questionEn: 'How do I delete my account?',
    answerVi: 'Mở "Hồ sơ", đến thẻ "Dữ liệu của bạn" và bấm "Xóa tài khoản". Nhập mật khẩu (hoặc email, nếu bạn chỉ đăng nhập bằng Google) để xác nhận.\n\nTài khoản, ảnh đại diện và mọi yêu cầu đã gửi sẽ bị xoá ngay và không thể khôi phục.',
    answerEn: 'Open "Profile", go to the "Your data" card and click "Delete account". Type your password (or your email, if you only log in with Google) to confirm.\n\nYour account, photo and every request you sent are deleted at once and cannot be brought back.' },
  { group: 'quyen-rieng-tu',
    questionVi: 'Yêu cầu của tôi được lưu trong bao lâu?',
    questionEn: 'How long are my requests kept?',
    answerVi: 'Mỗi yêu cầu được tự động xoá 24 tháng sau lần cập nhật cuối, theo Chính sách bảo mật. Bạn cũng có thể xoá hết bất cứ lúc nào bằng cách xoá tài khoản.',
    answerEn: 'Each request is deleted automatically 24 months after its last update, as the Privacy Policy explains. You can also remove everything at any time by deleting your account.' },

  // ---- Sử dụng website ----
  { group: 'su-dung',
    questionVi: 'Làm sao để chuyển sang tiếng Anh?',
    questionEn: 'How do I switch to Vietnamese?',
    answerVi: 'Bấm nút VI / EN ở góc trên bên phải (trên điện thoại: trong menu ☰). Website ghi nhớ lựa chọn của bạn cho những lần ghé sau.',
    answerEn: 'Click the VI / EN switch at the top right (on a phone: in the ☰ menu). The website remembers your choice for your next visits.' },
  { group: 'su-dung',
    questionVi: 'Làm sao để bật chế độ tối?',
    questionEn: 'How do I turn on dark mode?',
    answerVi: 'Bấm nút chuyển sáng / tối ở góc trên bên phải; khi đã đăng nhập, nút này nằm trong menu tên của bạn. Lần đầu ghé, website theo cài đặt sáng / tối của máy bạn.',
    answerEn: 'Click the light / dark switch at the top right; once you are logged in, it is in the menu under your name. On your first visit the website follows your device\'s light / dark setting.' },
  { group: 'su-dung',
    questionVi: 'Website có dùng được trên điện thoại không?',
    questionEn: 'Does the website work on a phone?',
    answerVi: 'Có. Trên điện thoại, bấm nút ☰ ở góc trên để mở menu với mọi trang, nút đăng nhập và nút chuyển ngôn ngữ. Website chạy trên các trình duyệt phổ biến như Chrome, Safari, Edge và Firefox.',
    answerEn: 'Yes. On a phone, tap the ☰ button at the top to open the menu with every page, the login buttons and the language switch. The website works in all common browsers such as Chrome, Safari, Edge and Firefox.' },
];

// Saves the starter questions the first time only. The flag is claimed atomically, so two first visits at once
// can't both insert; a list that already has questions (e.g. restored data) is never added to.
async function seedHelpOnce() {
  const settings = await getSiteSettings();
  if (settings.helpSeeded) return;
  const claimed = await SiteSettings.updateOne({ _id: settings._id, helpSeeded: { $ne: true } }, { $set: { helpSeeded: true } });
  clearSiteSettingsCache();
  if (!claimed.modifiedCount || (await HelpItem.estimatedDocumentCount())) return;
  await HelpItem.insertMany(DEFAULT_HELP_ITEMS.map((item, i) => ({ ...item, order: i })));
}

// The questions in display order: only the ones shown on the page, unless includeHidden (the admin list)
async function getHelpItems({ includeHidden = false } = {}) {
  await seedHelpOnce();
  return HelpItem.find(includeHidden ? {} : { published: true }).sort({ order: 1, _id: 1 }).lean();
}

// [{ ...group, items }] in the fixed group order
function groupHelpItems(items) {
  return HELP_GROUPS.map((g) => ({ ...g, items: items.filter((it) => it.group === g.key) }));
}

module.exports = { HELP_GROUPS, HELP_GROUP_KEYS, DEFAULT_HELP_ITEMS, getHelpItems, groupHelpItems };
