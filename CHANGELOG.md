# Nhật ký thay đổi

Đánh số theo [Semantic Versioning](https://semver.org/lang/vi/): `MAJOR.MINOR.PATCH`, kèm `-beta.N` cho tới bản phát hành chính thức. Số phiên bản nằm trong `package.json` ở thư mục gốc, `apps/api` và `apps/web` (ba số luôn giống nhau).

## [Chưa phát hành]

### Thêm

- **Trang chủ dựng lại theo bản thiết kế mới, bằng dữ liệu thật.** Ảnh nền, tiêu đề và mô tả lấy từ trang Cơ sở lưu trú; điểm đánh giá ở đầu trang tính từ đánh giá của khách và, cùng khối "Khách nói gì", chỉ hiện khi có từ 3 đánh giá. "Phòng nổi bật" gồm một thẻ lớn và hai thẻ nhỏ, có đủ trạng thái đang tải (khung xương), trống, lỗi kèm nút Thử lại, và sẵn sàng. Các khối "Tiện ích", "Khách nói gì", "Vị trí" chỉ hiện khi có dữ liệu.
- **Giao diện sáng và tối** cho trang khách và trang quản trị: theo cài đặt của máy, có nút chuyển ở đầu trang, lựa chọn được nhớ trên trình duyệt. Trang quản trị trước đây luôn tối, nay mặc định sáng trên máy đặt chế độ sáng.
- **Bộ màu và kiểu chữ mới**: token màu (nền kem, accent xanh rêu, brass, màu trạng thái, viền focus) cho cả hai giao diện thay bảng navy/vàng; font Cormorant Garamond và Be Vietnam Pro tự phục vụ từ ứng dụng (SIL OFL 1.1), không gọi Google Fonts. Cách đổi màu: [docs/customization.md](docs/customization.md#màu-theme).
- Trang **Cơ sở lưu trú** có thêm phần **Nội dung trang chủ**: tiêu đề, mô tả, danh sách tiện ích, danh sách điểm lân cận (migration `017_home_page_content.sql`; mặc định trống).
- API `GET /api/reviews/featured` (công khai): điểm trung bình và số đánh giá đang hiển thị, cùng tối đa 5 đánh giá từ 4 sao có nội dung.
- Thanh tìm phòng có bộ đếm người lớn / trẻ em (tổng số người được dùng để lọc theo sức chứa).
- `npm run test:e2e` chạy thêm test trình duyệt cho trang chủ (hai giao diện, màn hình 360–1440 px, bốn trạng thái phòng nổi bật, vùng bấm ≥ 44 px), ảnh chụp ở `test-results/home/`.
- `robots.txt`, và nginx nén gzip cho JavaScript/CSS/JSON.
- **Trang danh sách phòng theo thiết kế mới**: lọc theo địa điểm, ngày, số khách, khoảng giá và loại phòng (các lựa chọn lấy từ phòng đang có), sắp xếp, phân trang đánh số; trên điện thoại tìm kiếm và bộ lọc gom vào một bảng trượt từ đáy; đủ trạng thái đang tải, không có phòng phù hợp (kèm các điều kiện đang bật để bỏ từng cái), lỗi kèm nút Thử lại.
- **Trang chi tiết phòng theo thiết kế mới**: khung ảnh ghép và xem ảnh toàn màn hình (phím ←/→, Esc, focus không ra ngoài), sức chứa và giờ nhận/trả, tiện nghi, lịch trống, chính sách, đánh giá kèm phân bố sao và trạng thái chưa có đánh giá, khung đặt phòng dính bên phải, thanh giá ghim đáy trên màn hình hẹp, trạng thái đang tải và lỗi.
- **Tiện nghi của phòng**: ô mới ở form phòng (mỗi dòng một tiện nghi, tối đa 30), hiện ở trang phòng; migration `018_room_amenities.sql`, mặc định trống thì khối Tiện nghi không hiện.
- API: `GET /api/rooms` nhận thêm `roomType`; `GET /api/rooms/filters` trả các loại phòng đang nhận khách kèm số phòng và khoảng giá; `GET /api/rooms/:id/reviews` trả thêm `ratingCounts` (số đánh giá theo từng mức sao).
- **Luồng đặt phòng 5 bước** ở trang riêng `/rooms/:id/book`: chọn ngày → mã giảm giá → chính sách hủy → phương thức thanh toán → xác nhận, với tóm tắt giá dính bên phải (thu gọn thành một dòng trên điện thoại) và lịch toàn màn hình trên điện thoại. Ngày, số khách và bước đang làm nằm trong địa chỉ trang; mã giảm giá, việc đã đồng ý chính sách và phương thức đã chọn được nhớ trong phiên trình duyệt, nên lùi bước hay tải lại trang không mất gì. Chỉ hiện cổng thanh toán đang bật. Khi phòng vừa bị người khác đặt, trang báo rõ, giữ nguyên những gì đã nhập và gợi ý chọn ngày khác hoặc phòng khác. **Logic đặt phòng, giữ chỗ, mã giảm giá, thanh toán và hủy ở API không đổi**: đặt phòng vẫn được tạo bằng đúng các lệnh gọi cũ, ở nút cuối cùng.
- **Trang kết quả thanh toán mới**: đang xác nhận (các mốc đã thật sự xảy ra, giờ giữ phòng), thành công (mã đặt phòng, tóm tắt, tải PDF), thất bại (lý do theo mã của cổng thanh toán nếu có, thử lại, thanh toán bằng cổng khác đang bật). Đặt phòng 0 đ (giảm hết bằng mã) đi thẳng tới trang thành công.
- **Đặt phòng của tôi mới**: tab theo trạng thái thật kèm số lượng (Tất cả, Chờ xác nhận, Đã xác nhận, Hoàn tất, Đã hủy, Chờ hoàn tiền), thẻ đơn có dòng "việc tiếp theo" (giữ phòng đến mấy giờ, hủy miễn phí đến ngày nào, tiến độ hoàn tiền), hộp hủy hiện đúng số tiền được hoàn theo chính sách, hộp đánh giá kiểm tra dữ liệu trước khi gửi, đủ trạng thái đang tải / trống / lỗi.
- API (chỉ thêm, không đổi hành vi cũ): `GET /api/bookings/counts` (số đặt phòng của khách theo trạng thái); `gatewayCode` trong `GET /api/payments/transactions/:ref` (mã kết quả của chính cổng thanh toán, ví dụ `24` = khách hủy tại VNPay).
- `npm run test:e2e` đi hết luồng đặt phòng trong trình duyệt: đặt → áp mã → thanh toán thất bại rồi thành công (thông báo IPN có chữ ký do test gửi) → kết quả → hủy → hoàn tiền.
- **Dải thông báo chế độ demo** ở đầu trang khách và trang quản trị (chỉ khi `DEMO_MODE=true`): đẩy trang xuống, đóng được trong phiên trình duyệt, một dòng trên điện thoại. Câu "Không có tiền thật nào bị trừ" chỉ hiện khi mọi cổng thanh toán đang bật đều là môi trường thử (`demo.testPayments` trong `/api/settings/public`).

- **Trang đăng nhập, đăng ký và đặt lại mật khẩu theo thiết kế mới**, bố cục riêng (ảnh cơ sở lưu trú một bên, form một bên, không có đầu/chân trang). Lỗi hiện ngay dưới ô nhập. Trang "Kiểm tra hộp thư" có nút gửi lại đếm ngược theo đúng giới hạn của API (header `RateLimit`). Trang đặt mật khẩu mới kiểm tra liên kết trước khi cho nhập, có thước đo độ mạnh và danh sách quy tắc lấy đúng quy tắc mật khẩu của API; liên kết hết hạn hiện giờ tạo và giờ hết hạn thật, liên kết đã dùng hoặc sai có thông báo riêng. Nút Google chỉ hiện khi cả web và API bật đăng nhập Google. Dải demo trên các trang này liệt kê tài khoản mẫu do API báo.
- **Tài khoản của tôi theo thiết kế mới**: menu tài khoản; ảnh đại diện tải lên có tiến trình, huỷ được, xoá được, lưu ngay (giới hạn 10 MB, JPG/PNG/WEBP như pipeline ảnh); thông tin cá nhân (các trường đang có); đổi mật khẩu ở `/settings/password`, lỗi mật khẩu hiện tại hiện dưới ô.
- **Ghi công ảnh, 404 và 403 theo thiết kế mới**; trang 404 có ô tìm phòng theo điểm đến; trang 403 ghi tài khoản đang đăng nhập và địa chỉ bị từ chối, có nút đăng nhập tài khoản khác.
- API (chỉ thêm): `auth` trong `/api/settings/public` (Google bật hay tắt, `resetLinkMinutes` từ `RESET_TOKEN_TTL_MINUTES`, danh sách quy tắc mật khẩu, giới hạn gửi email đặt lại); `POST /api/reset-password/check` cho biết liên kết đặt lại còn dùng được không. Header `RateLimit`/`Retry-After` được mở cho trang khác nguồn.
- `npm run test:e2e` có thêm test các trang đăng nhập, tài khoản, ghi công, 404, 403 (mọi trạng thái, hai giao diện, điện thoại; email đặt lại mật khẩu thật qua một hộp thư SMTP giả), ảnh ở `test-results/phase-9/app/`.

### Thay đổi

- **Mã đặt phòng một định dạng ở mọi nơi**: `#BK-0012` trên thẻ Đặt phòng của tôi (trước là `#0012`), trang kết quả, hộp thoại, trang quản trị, email khách, email cảnh báo admin (trước là `Booking #12`) và phiếu PDF. Mã gõ để xác nhận xoá đơn là `BK-0012` (trước là `BOOKING-12`).
- Trang đăng nhập không còn bị đẩy xuống khi dải demo hoặc nút Google hiện ra sau khi API trả lời (CLS), và chỉ có một tiêu đề `h1`. Tiêu đề ở chân trang khách đổi từ `h3` sang `h2` (cùng kiểu chữ) để không nhảy cấp.
- **Đổi email ở trang Tài khoản cần mật khẩu hiện tại** (API kiểm tra; sai thì báo dưới ô). Đổi thành công thì mọi phiên khác bị đăng xuất (`token_version`), phiên đang dùng nhận cookie mới, và địa chỉ **cũ** nhận email thông báo (vi/en theo ngôn ngữ trang). Tài khoản tạo bằng Google chưa có mật khẩu thì không đổi được email, được hướng dẫn đặt mật khẩu qua "Quên mật khẩu" (trang này nay mở được cả khi đang đăng nhập). Kiểm tra mật khẩu ở trang Tài khoản giới hạn 10 lần / 15 phút. Migration `019_user_password_set.sql`; `password_set` có trong `/api/users/me`.
- **Đăng nhập Google tìm theo Google uid đã liên kết trước**, chỉ khi chưa tài khoản nào mang uid đó mới tìm theo email. Đổi email rồi đăng nhập Google vẫn vào đúng tài khoản cũ, không tạo tài khoản mới. Các quy tắc cũ giữ nguyên: quản trị viên không đăng nhập bằng Google, uid đã liên kết phải khớp, tài khoản bị khoá hoặc đã xoá bị từ chối.
- Đăng ký không còn ô "Nhập lại mật khẩu" (có nút hiện mật khẩu). Tài khoản có mật khẩu tạm được đưa thẳng tới `/settings/password`.
- **Khung đặt phòng ở trang phòng chỉ còn ngày, số khách và giá**; mã giảm giá, chính sách hủy và thanh toán chuyển sang luồng 5 bước. Đặt phòng (và việc giữ phòng) chỉ được tạo ở bước cuối, không còn ở nút đầu tiên.
- Toast hiện **phía trên** hộp thoại đang mở và bấm được (trước đây bị hộp thoại che).
- **Thông báo (toast) và hộp xác nhận dùng chung một mẫu** trên cả trang khách và trang quản trị. Toast ở góc dưới phải, tối đa 3 cái; thành công và thông tin tự ẩn sau 6 giây (dừng đếm khi rê chuột vào), lỗi ở lại cho tới khi đóng. Hộp xác nhận đặt focus vào nút Hủy, Esc để hủy; **xóa phòng và xóa đơn đặt phòng yêu cầu gõ mã** (`ROOM-<id>`, và mã đặt phòng `BK-0012` cho đơn).
- Tên phòng trên thẻ ở trang danh sách là tiêu đề cấp 2 (trước là cấp 3, bỏ qua một cấp).
- **Dữ liệu mẫu không còn kèm đánh giá**, trừ khi `DEMO_MODE=true` (bản demo có 3 đánh giá mẫu cho 3 kỳ lưu trú mẫu đã hoàn tất). Cơ sở dữ liệu đã seed từ trước vẫn giữ đánh giá mẫu cũ: ẩn nó ở trang Đặt phòng → Đánh giá nếu không muốn.
- Thẻ phòng: tên phòng là liên kết (cả thẻ vẫn bấm được); phòng chưa có đánh giá không còn dòng "Chưa có đánh giá" trên thẻ.
- Menu đầu trang luôn có "Đặt phòng của tôi" (chưa đăng nhập thì được đưa tới trang đăng nhập) và thêm "Điểm đến".
- Các tên biến màu cũ (`--brand-primary`, `--brand-accent`, `--color-*`) vẫn dùng được nhưng nay trỏ vào token mới. **Nếu bạn đã đổi `--brand-primary` / `--brand-accent` để rebrand: chuyển sang sửa `--accent` (và ba biến đi kèm) theo hướng dẫn.**

### Dự kiến

- Thay `nodemon` bằng `node --watch` (có sẵn trong Node 22) cho `npm run dev` của API, để bỏ 3 cảnh báo `npm audit` mức high của chuỗi `nodemon` → `chokidar` → `braces` (chỉ ảnh hưởng môi trường phát triển; xem [docs/known-issues.md](docs/known-issues.md)).

## [1.0.0-rc.2] — 2026-10-06

### Bảo mật

- **Tài khoản quản trị không còn đăng nhập được bằng Google, chỉ bằng mật khẩu.** Bản rc.1 chỉ chặn việc tự liên kết lần đầu; quản trị viên đã liên kết Google từ trước (hoặc tài khoản Google được cấp quyền quản trị sau) vẫn vào được bằng Google. Nay mọi lần đăng nhập Google vào tài khoản quản trị, đã liên kết hay chưa, đều bị từ chối với thông báo "Tài khoản quản trị hãy đăng nhập bằng mật khẩu" (mã `GOOGLE_ADMIN_PASSWORD_REQUIRED`), không tạo phiên. **Quản trị viên trước giờ chỉ dùng Google: chạy `npm run admin:reset -- --email <email>` để nhận mật khẩu tạm.** Tài khoản khách vẫn đăng nhập và liên kết Google như trước.

### Tài liệu

- [docs/installation.md](docs/installation.md#quên-mật-khẩu-admin--bị-khoá-ngoài): quản trị viên chỉ dùng mật khẩu; cách lấy mật khẩu cho quản trị viên chỉ có Google.
- [docs/known-issues.md](docs/known-issues.md): quản trị viên không dùng được Google; việc thay `nodemon` bằng `node --watch` để sau.

## [1.0.0-rc.1] — 2026-10-05

### Bảo mật

- **Seed lúc khởi động (`SEED_ON_START`) không còn tạo lại tài khoản quản trị mặc định.** Trước đây, sau khi đổi email quản trị, lần khởi động kế tiếp tạo thêm `admin@example.com` / `Admin@12345`. Nay tài khoản quản trị chỉ được tạo khi cơ sở dữ liệu chưa có quản trị viên nào (chưa bị xoá), không phụ thuộc email. **Nếu bạn từng đổi email quản trị trên bản beta.3 trở về trước: kiểm tra trang Người dùng và xoá tài khoản `admin@example.com` thừa.**
- **Đăng nhập Google không còn tự gắn vào tài khoản quản trị.** Trước đây, tài khoản Google có email trùng với một quản trị viên được liên kết ngay ở lần đăng nhập đầu và vào thẳng với quyền quản trị mà không cần mật khẩu. Nay trường hợp đó bị từ chối với thông báo "Tài khoản quản trị hãy đăng nhập bằng mật khẩu" (mã `GOOGLE_ADMIN_PASSWORD_REQUIRED`). Tài khoản khách vẫn được liên kết như trước.
- Tài khoản đã liên kết Google chỉ nhận đúng tài khoản Google đó: tài khoản Google khác mang cùng email bị từ chối (mã `GOOGLE_ACCOUNT_MISMATCH`). Trước đây chỉ so email.
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
