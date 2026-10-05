# Nhật ký thay đổi

Đánh số theo [Semantic Versioning](https://semver.org/lang/vi/): `MAJOR.MINOR.PATCH`, kèm `-beta.N` cho tới bản phát hành chính thức. Số phiên bản nằm trong `package.json` ở thư mục gốc, `apps/api` và `apps/web` (ba số luôn giống nhau).

## [Chưa phát hành]

### Bảo mật

- **Seed lúc khởi động (`SEED_ON_START`) không còn tạo lại tài khoản quản trị mặc định.** Trước đây, sau khi đổi email quản trị, lần khởi động kế tiếp tạo thêm `admin@example.com` / `Admin@12345`. Nay tài khoản quản trị chỉ được tạo khi cơ sở dữ liệu chưa có quản trị viên nào (chưa bị xoá), không phụ thuộc email. **Nếu bạn từng đổi email quản trị trên bản beta.3 trở về trước: kiểm tra trang Người dùng và xoá tài khoản `admin@example.com` thừa.**
- Production (`NODE_ENV=production`, gồm cả Docker) không còn dùng mật khẩu mặc định: tài khoản quản trị dùng `SEED_ADMIN_PASSWORD`, hoặc nhận mật khẩu ngẫu nhiên, in một lần duy nhất trong log lúc tạo và bắt buộc đổi ở lần đăng nhập đầu. Tài khoản khách mẫu `user@example.com` cũng nhận mật khẩu ngẫu nhiên theo cách đó (trước là `User@12345` công khai). Ngoài các mật khẩu sinh ngẫu nhiên này, không mật khẩu nào được in ra log production. (Chế độ demo vẫn dùng mật khẩu mẫu công khai.)

### Thêm

- `npm run test:e2e`: test trình duyệt cho trang **Đặt phòng của tôi** trên bản build thật của web và API thật (PostgreSQL tạm trong Docker, dùng Chrome/Edge đã cài). Kiểm tra booking ở mọi trạng thái (chờ xác nhận, thanh toán thất bại, đã xác nhận trả online / trả tại quầy / đã thu tại quầy, hoàn tất chưa và đã đánh giá, đã hủy, chờ hoàn tiền, đã hoàn tiền) cho tài khoản mật khẩu và tài khoản Google, danh sách trống của tài khoản mới, các bộ lọc và hộp thoại; lưu ảnh chụp màn hình vào `test-results/`.
- ESLint bật `react/jsx-no-undef` và `react/jsx-uses-vars`: dùng component hay biến chưa import trong JSX làm `npm run lint` thất bại.
- `npm run admin:reset` (trong Docker: `docker compose exec api npm run admin:reset -- --email <email>`): khôi phục quyền quản trị khi quên mật khẩu hoặc bị khoá. Đặt mật khẩu tạm ngẫu nhiên (in một lần), mở khoá, bảo đảm quyền quản trị, bắt buộc đổi mật khẩu và đăng xuất mọi phiên cũ. Không có `--email` thì liệt kê các quản trị viên. Xem [docs/installation.md](docs/installation.md#quên-mật-khẩu-admin--bị-khoá-ngoài).

### Sửa

- **Trang Đặt phòng của tôi sập với lỗi `Icon is not defined`** khi tài khoản chưa có booking nào (mọi tài khoản mới, nên gặp ngay sau lần đăng nhập Google đầu tiên), hoặc khi bộ lọc không khớp booking nào: thiếu `import Icon`. Đã rà toàn bộ web bằng luật ESLint mới, không còn chỗ nào tương tự.
- Header `Cross-Origin-Opener-Policy`: mọi phản hồi (trang web, `/assets`, `/api`, `/uploads`) nay mang đúng một giá trị `same-origin-allow-popups`. Trước đây phản hồi của API đi qua nginx mang hai header trái nhau (`same-origin` của helmet và `same-origin-allow-popups` của nginx), và `/assets` không có header. Lưu ý: dòng `Cross-Origin-Opener-Policy policy would block the window.closed call` trong console khi mở cửa sổ đăng nhập Google **vẫn còn**, vì nó do header của chính trang Google gây ra; đăng nhập không bị ảnh hưởng (xem [docs/known-issues.md](docs/known-issues.md)).

### Thay đổi

- Dữ liệu mẫu (khách mẫu, phòng, ảnh điểm đến, ảnh nền, mã `WELCOME10`, booking mẫu) chỉ được nạp vào cơ sở dữ liệu trống, hoặc khi bật `DEMO_MODE`. Phòng, mã giảm giá hay tài khoản mẫu đã xoá không quay lại sau khi khởi động lại.
- `npm run db:seed` có thêm `-- --force` (bổ sung dữ liệu mẫu vào cơ sở dữ liệu đã có dữ liệu, như hành vi cũ) và `-- --admin-only` (chỉ tạo quản trị viên đầu tiên).
- Cài bằng Docker: mật khẩu quản trị và khách mẫu lần đầu lấy từ `docker compose logs api` thay cho `Admin@12345` / `User@12345`.

## [1.0.0-beta.3] — 2026-10-03

### Thêm

- Song ngữ vi/en cho **mọi** trang: trang khách, đăng nhập/đăng ký, tài khoản, tất cả trang quản trị (gồm Cơ sở lưu trú, Ảnh điểm đến). Ngôn ngữ mới chỉ cần thêm một thư mục bản dịch.
- Mọi thông báo của API có mã cố định (`code`, kèm `params`); web hiển thị bản dịch theo mã.
- `npm run lint` kiểm tra thêm: bản dịch thiếu khoá, chữ tiếng Việt viết thẳng trong code, mã thông báo API chưa dịch, màu viết thẳng thay vì dùng biến theme.
- Theme: toàn bộ màu lấy từ hai biến `--brand-primary`, `--brand-accent`.
- Xử lý ảnh phía máy chủ (sharp): nhận tới 10 MB, tự xoay theo EXIF, xoá EXIF/GPS, thu nhỏ, lưu WebP; logo có thêm bản PNG cho phiếu PDF (kể cả khi lưu trên S3).
- Email báo khách khi đặt phòng tự hủy vì quá hạn thanh toán.
- Trang Người dùng phân trang, tìm kiếm, lọc ở máy chủ.
- Chế độ demo (`DEMO_MODE`) và lệnh `npm run demo:reset` (hoặc tự đặt lại theo `DEMO_RESET_INTERVAL_HOURS`).
- Ô "Địa điểm" trong form phòng.
- Tài liệu: cài đặt, tuỳ biến (thương hiệu, theme, ngôn ngữ), thanh toán, chế độ demo.

### Thay đổi

- Tách các trang quản trị thành thư mục `pages/admin/<trang>/` dùng chung bộ giao diện `components/admin/ui.jsx`; không còn file trang nào trên 400 dòng.
- Trang đăng nhập, đăng ký, quên/đặt lại mật khẩu, kết quả thanh toán, 404 dùng giao diện trang khách (bỏ bảng màu tím riêng và các liên kết chết).
- Trang tài khoản bỏ các mục "Thông báo", "Hệ thống" chưa hoạt động.
- Biểu đồ Dashboard chia giờ/ngày/tháng theo `APP_TIMEZONE`.
- Trang cuộn bằng document (không còn `height: 100%` trên `html/body`).
- Ảnh An Giang đi kèm nén ở chất lượng 64 (395 KB) cho rõ hơn.
- `sharp` 0.35.5.

### Sửa

- nginx trong Docker nhận request tới 11 MB (trước là 5 MB).
- Danh sách phòng trong form đặt phòng tại quầy cập nhật theo ngày đã chọn.
- Số đơn mới trên thanh bên quản trị hiện lại (đường dẫn cũ `/orders`).

## [1.0.0-beta.2] — 2026-10-03

- Trang chủ: khung rộng 1200 px, chữ lớn hơn và đạt tương phản AA, ảnh nền hero tuỳ chọn, hình vẽ thay ảnh khác nhau theo tên.
- 12 ảnh điểm đến thật từ Wikimedia Commons kèm `CREDITS.md`, trang `/credits`, quản lý ở `/admin/destinations`.

## [1.0.0-beta.1] — 2026-10-02

- Đặt phòng/thanh toán an toàn khi đồng thời (khoá dòng, ràng buộc chống trùng lịch), hoàn tiền thủ công, VNPay IPN giả lập trong test tích hợp.
- Trang khách công khai: tìm phòng, lịch phòng trống, chính sách hủy trước khi trả tiền.
- Vận hành: email xác nhận/hủy, PDF xác nhận, đặt phòng tại quầy, trang Cơ sở lưu trú, lưu ảnh local/S3, phân trang Orders.

## [1.0.0-alpha] — 2026-10-01

- Bản khởi đầu: dọn dẹp, bảo mật, chạy bằng một lệnh `docker compose up --build`.
