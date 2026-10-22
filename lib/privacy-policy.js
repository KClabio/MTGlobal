// "Chính sách bảo mật" (/chinh-sach-bao-mat): the default text, VI + EN, written for Decree 13/2023/NĐ-CP on personal
// data. It is a draft for the owner (or a lawyer) to check before launch. Plain-text format of lib/text.js: a blank line
// starts a paragraph, "- " a list item. The company's address and contact (Thông tin công ty) are filled in when the
// page is shown, so the text follows any change there. Admin → Thông tin công ty → Chính sách bảo mật replaces it;
// an empty box (or the unchanged draft) means this default.

const VERSION_DATE = { vi: '22/10/2026', en: '22 October 2026' };
const COMPANY = { vi: 'Công ty TNHH Công nghệ Mễ Trì Global', en: 'Mễ Trì Global Technology Co., Ltd' };

/** How to reach the company about personal data: email and/or phone from the settings, else the Liên hệ page */
function contactText(contact, lang) {
  const parts = [];
  if (contact.email) parts.push(`email ${contact.email}`);
  if (contact.phone) parts.push(lang === 'en' ? `phone ${contact.phone}` : `điện thoại ${contact.phone}`);
  if (parts.length) return parts.join(lang === 'en' ? ' or ' : ' hoặc ');
  return lang === 'en'
    ? 'the Contact page of this website (/lien-he) or a letter to the address above'
    : 'trang Liên hệ của website (/lien-he) hoặc thư gửi tới địa chỉ trên';
}

const VI = ({ company, address, contact, date }) => `Chính sách này có hiệu lực từ ngày ${date}. Chính sách giải thích ${company} thu thập những dữ liệu cá nhân nào qua website này, dùng chúng để làm gì, ai được xem, lưu giữ bao lâu và bạn có những quyền gì, theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.

1. Chúng tôi là ai

${company} ("MTG", "chúng tôi") là bên quyết định mục đích và cách xử lý dữ liệu cá nhân thu thập qua website này. Địa chỉ: ${address}. Liên hệ về dữ liệu cá nhân: ${contact}.

2. Dữ liệu chúng tôi thu thập

- Khi bạn đăng ký tài khoản: họ và tên, email, mật khẩu (chỉ lưu ở dạng đã mã hoá, không ai đọc được), số điện thoại và trường/công ty nếu bạn nhập.
- Khi bạn đăng nhập bằng Google: tên, email và ảnh đại diện từ tài khoản Google của bạn.
- Trong Hồ sơ: ảnh đại diện và phần giới thiệu ngắn, nếu bạn thêm.
- Khi bạn gửi yêu cầu tư vấn: họ và tên, số điện thoại, email, trường/công ty, nội dung yêu cầu và các lựa chọn bạn đã chọn trong biểu mẫu.
- Khi bạn nhập sai mật khẩu: email đã nhập và địa chỉ IP, chỉ để chống dò mật khẩu; tự xoá sau tối đa 15 phút.

Chúng tôi không thu thập dữ liệu cá nhân nhạy cảm và không dùng công cụ quảng cáo hay theo dõi người truy cập.

3. Chúng tôi dùng dữ liệu để làm gì

- Tạo và quản lý tài khoản của bạn, cho bạn đăng nhập.
- Trả lời yêu cầu tư vấn, báo giá và liên hệ lại với bạn về yêu cầu đó.
- Giữ an toàn cho website và tài khoản (chống dò mật khẩu, phát hiện lạm dụng).

Chúng tôi không dùng dữ liệu của bạn cho mục đích khác khi chưa hỏi lại ý kiến của bạn.

4. Căn cứ xử lý

Chúng tôi chỉ xử lý dữ liệu khi có sự đồng ý của bạn: bạn đánh dấu "Tôi đồng ý" khi đăng ký và khi gửi yêu cầu tư vấn, hoặc chọn tiếp tục khi đăng nhập bằng Google. Thời điểm bạn đồng ý được lưu lại.

5. Ai được xem dữ liệu của bạn

- Nhân viên MTG phụ trách tư vấn và quản trị website.
- Các nhà cung cấp dịch vụ kỹ thuật giúp website hoạt động: máy chủ và cơ sở dữ liệu, dịch vụ lưu ảnh (Cloudinary), và Google khi bạn chọn đăng nhập bằng Google. Họ chỉ được xử lý dữ liệu để cung cấp dịch vụ cho MTG.
- Cơ quan nhà nước có thẩm quyền, khi pháp luật yêu cầu.

Chúng tôi không bán và không cho thuê dữ liệu cá nhân. Một số nhà cung cấp có thể lưu dữ liệu trên máy chủ ở ngoài Việt Nam; khi đó chúng tôi thực hiện các thủ tục theo quy định của pháp luật.

6. Lưu giữ bao lâu

- Tài khoản: cho đến khi bạn xoá tài khoản (nút "Xóa tài khoản" trong Hồ sơ) hoặc yêu cầu chúng tôi xoá.
- Yêu cầu tư vấn: 24 tháng kể từ lần cập nhật cuối, sau đó website tự động xoá. Khi bạn xoá tài khoản, mọi yêu cầu bạn đã gửi cũng bị xoá ngay. Bạn có thể yêu cầu xoá sớm hơn.
- Ghi nhận nhập sai mật khẩu: tối đa 15 phút. Phiên đăng nhập: tối đa 7 ngày.

7. Cookie

Website chỉ dùng cookie cần thiết: giữ phiên đăng nhập, ghi nhớ ngôn ngữ và giao diện sáng/tối. Không có cookie quảng cáo hay theo dõi.

8. Quyền của bạn

- Được biết và xem dữ liệu của mình; tự sửa thông tin trong Hồ sơ bất cứ lúc nào.
- Nhận bản sao dữ liệu của mình: nút "Tải dữ liệu của tôi" trong Hồ sơ.
- Xoá tài khoản cùng mọi dữ liệu: nút "Xóa tài khoản" trong Hồ sơ.
- Rút lại sự đồng ý, yêu cầu hạn chế xử lý hoặc phản đối việc xử lý.
- Khiếu nại, tố cáo hoặc yêu cầu bồi thường theo quy định của pháp luật.

Để thực hiện các quyền khác, hoặc nếu bạn không đăng nhập được, hãy liên hệ ${contact}. Chúng tôi trả lời trong thời hạn pháp luật quy định. Việc rút lại sự đồng ý không ảnh hưởng đến việc xử lý đã thực hiện trước đó.

9. Bảo vệ dữ liệu

Mật khẩu được mã hoá; website dùng kết nối bảo mật HTTPS; trang quản trị chỉ dành cho nhân viên được cấp quyền; số lần nhập sai mật khẩu bị giới hạn. Nếu xảy ra sự cố lộ lọt dữ liệu, chúng tôi sẽ thông báo cho cơ quan có thẩm quyền và cho bạn theo quy định.

10. Trẻ em

Website dành cho nhà trường, phụ huynh và doanh nghiệp. Người dưới 16 tuổi chỉ tạo tài khoản hoặc gửi yêu cầu khi có sự đồng ý của cha mẹ hoặc người giám hộ.

11. Thay đổi chính sách

Khi chính sách thay đổi, ngày hiệu lực ở đầu trang được cập nhật; thay đổi quan trọng sẽ được thông báo trên website.

12. Liên hệ

${company}, ${address}. Liên hệ: ${contact}.`;

const EN = ({ company, address, contact, date }) => `This policy applies from ${date}. It explains which personal data ${company} collects through this website, what it is used for, who can see it, how long it is kept and what your rights are, under Vietnam's Decree 13/2023/ND-CP on personal data protection.

1. Who we are

${company} ("MTG", "we") decides why and how the personal data collected through this website is processed. Address: ${address}. Contact for personal data: ${contact}.

2. The data we collect

- When you create an account: your name, email, password (stored only in encrypted form, which nobody can read), and your phone number and school/company if you enter them.
- When you log in with Google: the name, email and profile photo of your Google account.
- In your profile: a profile photo and a short bio, if you add them.
- When you send a request: your name, phone number, email, school/company, your message and the choices you made in the form.
- When a wrong password is entered: the email typed and the IP address, only to stop password guessing; deleted after at most 15 minutes.

We do not collect sensitive personal data and do not use advertising or visitor-tracking tools.

3. What we use it for

- Creating and managing your account, and letting you log in.
- Answering your requests, sending quotes and contacting you about them.
- Keeping the website and accounts safe (stopping password guessing, detecting abuse).

We do not use your data for any other purpose without asking you first.

4. Legal basis

We process your data only with your consent: you tick "I agree" when you create an account and when you send a request, or choose to continue when you log in with Google. The time of your consent is recorded.

5. Who can see your data

- MTG staff who handle requests and run the website.
- Technical providers that keep the website running: the server and database host, the photo storage service (Cloudinary), and Google when you choose to log in with Google. They may process the data only to provide their service to MTG.
- Competent state authorities, when the law requires it.

We never sell or rent personal data. Some providers may store data on servers outside Vietnam; in that case we complete the procedures the law requires.

6. How long we keep it

- Your account: until you delete it ("Delete account" in your profile) or ask us to delete it.
- Requests: 24 months from their last update, then the website deletes them automatically. When you delete your account, every request you sent is deleted at once too. You can ask for earlier deletion.
- Wrong-password records: at most 15 minutes. Login sessions: at most 7 days.

7. Cookies

The website uses only necessary cookies: keeping you logged in, and remembering your language and light/dark theme. There are no advertising or tracking cookies.

8. Your rights

- To know about and see your data; to correct it in your profile at any time.
- To receive a copy of your data: "Download my data" in your profile.
- To delete your account with all its data: "Delete account" in your profile.
- To withdraw your consent, ask us to restrict processing, or object to it.
- To complain, report a violation or claim compensation as provided by law.

To use your other rights, or if you cannot log in, contact ${contact}. We answer within the time limits set by law. Withdrawing consent does not affect processing carried out before.

9. How we protect your data

Passwords are encrypted; the website uses secure HTTPS connections; the admin area is open only to authorised staff; repeated wrong passwords are blocked. If a data breach happens, we will inform the competent authority and you as the law requires.

10. Children

This website is meant for schools, parents and businesses. People under 16 should create an account or send a request only with the consent of a parent or guardian.

11. Changes to this policy

When the policy changes, the date at the top is updated; important changes are announced on the website.

12. Contact

${company}, ${address}. Contact: ${contact}.`;

/** The default policy text in one language, filled with the company details from the settings */
function defaultPolicy(lang, settings) {
  const l = lang === 'en' ? 'en' : 'vi';
  const contact = (settings && settings.contactInfo) || {};
  const address = (contact.address || '').trim() || (l === 'en' ? 'Hanoi, Vietnam' : 'Hà Nội');
  return (l === 'en' ? EN : VI)({ company: COMPANY[l], address, contact: contactText(contact, l), date: VERSION_DATE[l] });
}

/** The text the page shows: the admin's own text for that language, else the default draft */
function policyText(lang, settings) {
  const own = settings && (lang === 'en' ? settings.privacyPolicyEn : settings.privacyPolicy);
  return (own && own.trim()) ? own : defaultPolicy(lang, settings);
}

module.exports = { defaultPolicy, policyText, VERSION_DATE };
