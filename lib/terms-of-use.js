// "Điều khoản sử dụng" (/dieu-khoan-su-dung): the default text, VI + EN. It is a draft for the owner (or a lawyer) to
// check before launch, like the Chính sách bảo mật of lib/privacy-policy.js, and works the same way: plain-text format
// of lib/text.js (a blank line starts a paragraph, "- " a list item, a short numbered line becomes a section title), the
// company's address and contact (Thông tin công ty) filled in when the page is shown, and Admin → Thông tin công ty →
// Điều khoản sử dụng replaces it; an empty box (or the unchanged draft) means this default.

const { COMPANY, contactText, registrationText } = require('./privacy-policy');

const VERSION_DATE = { vi: '08/11/2026', en: '8 November 2026' };

const VI = ({ company, address, contact, date, reg }) => `Các điều khoản này có hiệu lực từ ngày ${date}. Chúng quy định việc sử dụng website của ${company} ("MTG", "chúng tôi"). Khi truy cập website, tạo tài khoản hoặc gửi yêu cầu tư vấn, bạn đồng ý với các điều khoản này. Nếu không đồng ý, vui lòng không sử dụng website.

1. Về website

Website giới thiệu MTG và các sản phẩm, giải pháp, dịch vụ của MTG: robot, phòng Lab STEM, thiết bị, đào tạo, tập huấn, tư vấn du học và phân phối sản phẩm công nghệ. Website không bán hàng và không nhận thanh toán trực tuyến.

Thông tin về sản phẩm, dự án và dịch vụ trên website để bạn tham khảo. Giá, cấu hình, thời gian và điều kiện cụ thể chỉ được xác định trong báo giá hoặc hợp đồng mà MTG gửi cho bạn.

2. Tài khoản

- Bạn cần tài khoản để theo dõi các yêu cầu đã gửi và cập nhật Hồ sơ. Bạn có thể đăng ký bằng email hoặc đăng nhập bằng Google.
- Hãy nhập thông tin đúng và cập nhật khi có thay đổi.
- Bạn tự giữ bí mật mật khẩu và chịu trách nhiệm về các hoạt động trong tài khoản của mình. Nếu nghi ngờ tài khoản bị người khác dùng, hãy đổi mật khẩu ngay và báo cho chúng tôi.
- Bạn có thể xoá tài khoản bất cứ lúc nào bằng nút "Xóa tài khoản" trong Hồ sơ.
- Chúng tôi có thể tạm khoá hoặc xoá tài khoản vi phạm các điều khoản này.

3. Gửi yêu cầu tư vấn

- Bạn có thể gửi yêu cầu tư vấn, báo giá hoặc đăng ký qua các biểu mẫu trên website, có hoặc không cần đăng nhập. Để chống gửi hàng loạt, số yêu cầu và thư xác nhận gửi đi bị giới hạn.
- Gửi yêu cầu không tạo ra hợp đồng hay nghĩa vụ mua bán nào. Chúng tôi liên hệ lại theo thông tin bạn cung cấp; hợp đồng chỉ hình thành khi hai bên cùng ký.
- Bạn chịu trách nhiệm về nội dung yêu cầu mình gửi và chỉ nhập thông tin liên hệ của chính mình, hoặc của người đã đồng ý cho bạn nhập.

4. Những việc không được làm

Khi sử dụng website, bạn không được:
- Đăng nhập vào tài khoản của người khác, dò mật khẩu hoặc tìm cách vượt qua các biện pháp bảo vệ của website.
- Gửi thư rác, nội dung giả mạo, xúc phạm, vi phạm pháp luật hoặc xâm phạm quyền của người khác.
- Tải lên tệp có mã độc, hoặc dùng công cụ tự động để gửi biểu mẫu, sao chép hàng loạt hay làm quá tải website.
- Dùng website cho mục đích trái với pháp luật Việt Nam.

5. Sở hữu trí tuệ

Nội dung trên website, gồm văn bản, hình ảnh, video, thiết kế, logo và tên MTG, thuộc quyền sở hữu của MTG hoặc được sử dụng với sự cho phép của chủ sở hữu. Tên và logo của các đối tác (ví dụ VEX Robotics) thuộc về chủ sở hữu tương ứng.

Bạn có thể xem, chia sẻ đường dẫn và trích dẫn ngắn có ghi nguồn. Mọi việc sao chép, chỉnh sửa hoặc dùng nội dung cho mục đích thương mại cần có sự đồng ý bằng văn bản của MTG.

6. Nội dung bạn gửi

Ảnh đại diện, phần giới thiệu trong Hồ sơ và nội dung yêu cầu do bạn gửi vẫn là của bạn. Bạn cho phép MTG lưu giữ và sử dụng chúng để vận hành website và trả lời yêu cầu của bạn. Chúng tôi có thể gỡ nội dung vi phạm các điều khoản này.

7. Liên kết và dịch vụ bên ngoài

Website có liên kết tới dịch vụ và website khác, như Zalo, Facebook, Google (khi đăng nhập bằng Google) và website của các đối tác. Các dịch vụ đó có điều khoản và chính sách riêng; MTG không kiểm soát và không chịu trách nhiệm về nội dung của chúng.

8. Giới hạn trách nhiệm

Chúng tôi cố gắng giữ thông tin trên website chính xác và website hoạt động ổn định, nhưng không bảo đảm website luôn không có lỗi hay không bị gián đoạn, ví dụ khi bảo trì. Trong phạm vi pháp luật cho phép, MTG không chịu trách nhiệm về thiệt hại phát sinh từ việc bạn chỉ dựa vào thông tin tham khảo trên website mà không có báo giá hoặc hợp đồng. Điều này không làm hạn chế các quyền của bạn theo pháp luật về bảo vệ quyền lợi người tiêu dùng.

9. Dữ liệu cá nhân

Cách chúng tôi thu thập, sử dụng và bảo vệ dữ liệu cá nhân của bạn được trình bày trong Chính sách bảo mật (/chinh-sach-bao-mat).

10. Thay đổi điều khoản

Chúng tôi có thể cập nhật các điều khoản này. Khi đó, ngày hiệu lực ở đầu trang được cập nhật; thay đổi quan trọng sẽ được thông báo trên website. Việc bạn tiếp tục sử dụng website sau ngày hiệu lực mới được hiểu là bạn đồng ý với điều khoản mới.

11. Luật áp dụng và giải quyết tranh chấp

Các điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Tranh chấp trước hết được giải quyết bằng thương lượng; nếu không thương lượng được, một trong hai bên có thể đưa ra Toà án có thẩm quyền theo quy định của pháp luật Việt Nam.

12. Liên hệ

${company}, ${address}.${reg} Liên hệ: ${contact}.`;

const EN = ({ company, address, contact, date, reg }) => `These terms apply from ${date}. They govern the use of the website of ${company} ("MTG", "we"). By visiting the website, creating an account or sending a request, you agree to these terms. If you do not agree, please do not use the website.

1. About the website

The website presents MTG and its products, solutions and services: robots, STEM Labs, equipment, training, teacher workshops, study-abroad consulting and the distribution of technology products. The website does not sell anything or take payments online.

The information about products, projects and services is for reference. Prices, configurations, timing and other conditions are set only in a quote or contract that MTG sends you.

2. Accounts

- An account lets you follow the requests you sent and update your profile. You can sign up with an email or log in with Google.
- Please enter correct information and keep it up to date.
- You keep your password secret and are responsible for what happens in your account. If you think someone else is using it, change your password at once and tell us.
- You can delete your account at any time with the "Delete account" button in your profile.
- We may suspend or delete an account that breaks these terms.

3. Sending requests

- You can send requests for advice, quotes or registrations through the forms on the website, logged in or not. To stop mass sending, the number of requests and confirmation emails is limited.
- Sending a request does not create a contract or any obligation to buy. We contact you with the details you give; a contract exists only once both parties have signed it.
- You are responsible for what you send, and enter only your own contact details, or those of someone who agreed that you enter them.

4. What you must not do

When using the website, you must not:
- Log in to someone else's account, guess passwords or try to get around the website's protections.
- Send spam, or false, offensive or unlawful content, or content that infringes other people's rights.
- Upload files containing malware, or use automated tools to submit forms, copy content in bulk or overload the website.
- Use the website for any purpose that breaks Vietnamese law.

5. Intellectual property

The content of the website, including text, pictures, videos, design, the logo and the MTG name, belongs to MTG or is used with its owner's permission. The names and logos of partners (for example VEX Robotics) belong to their owners.

You may view the content, share links and quote short passages with the source named. Copying, changing or using the content for commercial purposes needs MTG's written consent.

6. Content you send

The profile photo and bio in your profile and the requests you send remain yours. You allow MTG to store and use them to run the website and answer your requests. We may remove content that breaks these terms.

7. Links and outside services

The website links to other services and websites, such as Zalo, Facebook, Google (when you log in with Google) and our partners' websites. They have their own terms and policies; MTG does not control them and is not responsible for their content.

8. Limitation of liability

We try to keep the information on the website correct and the website running, but we cannot promise that it is always free of errors or interruptions, for example during maintenance. As far as the law allows, MTG is not liable for losses caused by relying only on the reference information on the website without a quote or contract. This does not limit your rights under consumer protection law.

9. Personal data

How we collect, use and protect your personal data is explained in the Privacy Policy (/chinh-sach-bao-mat).

10. Changes to these terms

We may update these terms. The date at the top is then updated, and important changes are announced on the website. Using the website after the new date means you accept the new terms.

11. Governing law and disputes

These terms are governed by Vietnamese law. Disputes are first settled by negotiation; if that fails, either party may bring the dispute to the competent court under Vietnamese law.

12. Contact

${company}, ${address}.${reg} Contact: ${contact}.`;

/** The default terms in one language, filled with the company details from the settings */
function defaultTerms(lang, settings) {
  const l = lang === 'en' ? 'en' : 'vi';
  const contact = (settings && settings.contactInfo) || {};
  const address = (contact.address || '').trim() || (l === 'en' ? 'Hanoi, Vietnam' : 'Hà Nội');
  return (l === 'en' ? EN : VI)({ company: COMPANY[l], address, contact: contactText(contact, l), date: VERSION_DATE[l],
    reg: registrationText(contact, l) });
}

/** The text the page shows: the admin's own text for that language, else the default draft */
function termsText(lang, settings) {
  const own = settings && (lang === 'en' ? settings.termsOfUseEn : settings.termsOfUse);
  return (own && own.trim()) ? own : defaultTerms(lang, settings);
}

module.exports = { defaultTerms, termsText, VERSION_DATE };
