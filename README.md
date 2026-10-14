# MTGlobal — Smart Solutions for Life

The bilingual (Vietnamese / English) website of **Công ty TNHH Công nghệ Mễ Trì Global (MTG)**, with an admin area to update it.

**[English](#english)** · **[Tiếng Việt](#tiếng-việt)**

---

## English

### In short
- **The website** shows MTG's robots, STEM lab solutions and services, in Vietnamese and English.
- **To change anything**, sign in and open **Admin** (address ending in `/admin`). No coding needed.
- **Stuck?** Ask the person who owns the website (the *Owner* account).

### I want to…

| I want to… | Go to (in Admin) |
|---|---|
| Add or edit a robot | **Robot products** |
| Add or edit STEM equipment | **Equipment, materials & STEM robots** |
| Edit a Solutions page (Workshop, Training…) | Its name under **Solutions** |
| Add a reference project | **Reference projects** |
| Post news | **News** |
| Change the logo, home picture or a page banner | **General settings** |
| Change company address, phone, email | **Company info** |
| Add a partner logo | **Partners** |
| See customer requests | **Consultation requests** |
| Make someone an admin | **Users** (Owner only) |

### For visitors
- **Menu:** point at *Smart Robotics*, *Solutions* or *Services* to see their pages.
- **Home page:** scroll the **What We Do** cards sideways (mouse wheel, arrows or drag) and click one to open it.
- **Language:** **VI / EN** at the top right.
- **Ask for advice:** fill in the form on **Contact** (or on a robot or service page).
- **Your account:** **Sign Up**, then see your requests in **My Requests** and your details and role in **Profile**.

![Home page](docs/images/en/home.jpg)

### For staff: the admin area
**Sign in:** log in → open the name menu at the top right → **Admin**.

![Admin overview](docs/images/en/admin-dashboard.jpg)

**Everyday basics**
- **Add:** the blue **+ Add…** button. **Change:** **Edit** on a row. Then **Save**.
- **Two languages:** fill in Vietnamese and English. If English is empty, Vietnamese is shown.
- **Order:** drag a row by its ⠿ handle. The website follows the new order.
- **Find:** type in the search box (accents not needed: `may in` finds "máy in").
- **Delete:** **Delete**, then confirm.
- **See the result:** the round button at the bottom right opens the page on the website.
- **Admin language:** **VI / EN** at the bottom of the left menu.

![Equipment list with search](docs/images/en/admin-list.jpg)

<details>
<summary><b>More details</b> (click to open)</summary>

**Solutions pages** (Consulting, Workshops, Training, Training & rollout)
- A page is a list of blocks: text, cards, steps, photos & videos, numbers or buttons.
- Add a block at the bottom, drag ⠿ to move it, **Remove** to delete it, then **Save page**.
- **Restore default content** puts the original page back.

**General settings** has three tabs:
- **Brand:** the logo.
- **Home page (Hero):** the big home picture and its title. Leave a box empty to keep the current text.
- **Page banners:** the dark strip at the top of each page: its short line and an optional background picture.

![General settings — page banners](docs/images/en/admin-general-settings.jpg)

**Consultation requests:** set each one to *New → Contacted → Completed*. The customer sees the same status.

**Who can do what**

| Role | Can |
|---|---|
| **Owner** | Everything, including giving or removing admin rights |
| **Administrator** | Edit all content and handle requests |
| **Customer** | Use the website and send requests |

Roles are shown on each person's profile and can only be changed by an Owner in **Users**.
</details>

<details>
<summary><b>For the IT person:</b> install on a computer</summary>

Needs Node.js 18+ and MongoDB.

1. `git clone https://github.com/KClabio/MTGlobal.git` then `cd MTGlobal`
2. `npm install`
3. Copy `.env.example` to `.env` and set `SESSION_SECRET` to any long random text.
4. `npm run seed` (first time only — it **replaces** projects, products and services), then `npm run dev` and open http://localhost:3000
5. First admin: sign up on the website, then `npm run make-admin -- your@email.com --owner` and log in again.

Uploaded photos and the database are not stored in this repository — copy them from the current computer when moving.
</details>

**License:** © 2026 Công ty TNHH Công nghệ Mễ Trì Global. All rights reserved — see [LICENSE](LICENSE).

---

## Tiếng Việt

### Tóm tắt
- **Website** giới thiệu robot, giải pháp phòng Lab STEM và dịch vụ của MTG, bằng tiếng Việt và tiếng Anh.
- **Muốn thay đổi nội dung**, đăng nhập rồi mở **Quản trị** (địa chỉ kết thúc bằng `/admin`). Không cần biết lập trình.
- **Gặp khó khăn?** Hỏi người quản lý website (tài khoản *Chủ sở hữu*).

### Tôi muốn…

| Tôi muốn… | Vào (trong Quản trị) |
|---|---|
| Thêm / sửa robot | **Sản phẩm robot** |
| Thêm / sửa thiết bị STEM | **Thiết bị, học liệu, Robot STEM** |
| Sửa một trang Giải pháp (Workshop, Đào tạo…) | Tên trang đó trong nhóm **Giải pháp** |
| Thêm dự án tham khảo | **Dự án tham khảo** |
| Đăng tin tức | **Tin tức** |
| Đổi logo, ảnh trang chủ hoặc banner trang | **Cài đặt chung** |
| Đổi địa chỉ, điện thoại, email công ty | **Thông tin công ty** |
| Thêm logo đối tác | **Đối tác đồng hành** |
| Xem yêu cầu của khách | **Yêu cầu tư vấn** |
| Cấp quyền quản trị cho ai đó | **Người dùng** (chỉ Chủ sở hữu) |

### Dành cho khách truy cập
- **Menu:** đưa chuột vào *Robotics thông minh*, *Giải pháp* hoặc *Dịch vụ* để xem các trang con.
- **Trang chủ:** lướt ngang các thẻ **Lĩnh vực hoạt động** (cuộn chuột, mũi tên hoặc kéo) và bấm để mở.
- **Ngôn ngữ:** **VI / EN** ở góc trên bên phải.
- **Cần tư vấn:** điền biểu mẫu ở trang **Liên hệ** (hoặc trang robot, trang dịch vụ).
- **Tài khoản:** **Đăng ký**, rồi xem yêu cầu ở **Yêu cầu của tôi**, thông tin và vai trò ở **Hồ sơ**.

![Trang chủ](docs/images/vi/home.jpg)

### Dành cho nhân viên: trang quản trị
**Vào trang:** đăng nhập → bấm tên của bạn ở góc trên bên phải → **Quản trị**.

![Tổng quan quản trị](docs/images/vi/admin-dashboard.jpg)

**Thao tác cơ bản**
- **Thêm:** nút xanh **+ Thêm…**. **Sửa:** nút **Sửa** ở từng dòng. Xong bấm **Lưu**.
- **Hai ngôn ngữ:** điền cả tiếng Việt và tiếng Anh. Để trống tiếng Anh thì sẽ hiện tiếng Việt.
- **Thứ tự:** kéo dòng bằng tay nắm ⠿. Website đổi theo thứ tự mới.
- **Tìm:** gõ vào ô tìm kiếm (không cần dấu: `may in` vẫn ra "máy in").
- **Xoá:** bấm **Xoá** rồi xác nhận.
- **Xem kết quả:** nút tròn ở góc dưới bên phải mở trang đó trên website.
- **Ngôn ngữ trang quản trị:** **VI / EN** ở cuối menu bên trái.

![Danh sách thiết bị có tìm kiếm](docs/images/vi/admin-list.jpg)

<details>
<summary><b>Xem thêm chi tiết</b> (bấm để mở)</summary>

**Các trang Giải pháp** (Tư vấn, Workshop, Đào tạo, Tập huấn)
- Mỗi trang gồm các khối: văn bản, thẻ, các bước, ảnh & video, số liệu hoặc nút bấm.
- Thêm khối ở cuối trang, kéo ⠿ để đổi chỗ, **Xoá** để bỏ, rồi bấm **Lưu trang**.
- **Khôi phục nội dung mặc định** đưa trang về như ban đầu.

**Cài đặt chung** có ba thẻ:
- **Thương hiệu:** logo.
- **Trang chủ (Hero):** ảnh lớn và tiêu đề trang chủ. Để trống ô nào thì giữ nội dung hiện tại.
- **Banner các trang:** dải màu tối ở đầu mỗi trang: dòng giới thiệu và ảnh nền (tuỳ chọn).

![Cài đặt chung — banner các trang](docs/images/vi/admin-general-settings.jpg)

**Yêu cầu tư vấn:** chuyển trạng thái *Mới → Đã liên hệ → Hoàn tất*. Khách hàng thấy cùng trạng thái.

**Ai được làm gì**

| Vai trò | Được |
|---|---|
| **Chủ sở hữu** | Mọi việc, kể cả cấp / thu hồi quyền quản trị |
| **Quản trị viên** | Sửa toàn bộ nội dung và xử lý yêu cầu |
| **Khách hàng** | Dùng website và gửi yêu cầu |

Vai trò hiện trong Hồ sơ của mỗi người và chỉ Chủ sở hữu đổi được, trong **Người dùng**.
</details>

<details>
<summary><b>Dành cho người phụ trách IT:</b> cài đặt trên máy tính</summary>

Cần Node.js 18+ và MongoDB.

1. `git clone https://github.com/KClabio/MTGlobal.git` rồi `cd MTGlobal`
2. `npm install`
3. Sao chép `.env.example` thành `.env`, đặt `SESSION_SECRET` là một chuỗi ngẫu nhiên dài.
4. `npm run seed` (chỉ lần đầu — lệnh này **thay thế** dự án, sản phẩm và dịch vụ), rồi `npm run dev` và mở http://localhost:3000
5. Quản trị viên đầu tiên: đăng ký trên website, chạy `npm run make-admin -- email@cua-ban.com --owner` rồi đăng nhập lại.

Ảnh đã tải lên và cơ sở dữ liệu không nằm trong repository — hãy sao chép từ máy hiện tại khi chuyển máy.
</details>

**Giấy phép:** © 2026 Công ty TNHH Công nghệ Mễ Trì Global. Bảo lưu mọi quyền — xem [LICENSE](LICENSE).
