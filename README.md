# LuxeStay

Hệ thống đặt phòng cho khách sạn nhỏ và homestay: trang đặt phòng cho khách, trang quản trị cho chủ cơ sở, thanh toán VNPay, mã giảm giá, đánh giá, lịch phòng và báo cáo.

- **Web**: React 19, Vite, React Router, Tailwind CSS, i18next (vi/en)
- **API**: Node.js 22, Express 5, PostgreSQL, JWT trong cookie HttpOnly, Socket.IO
- **Cấu trúc**: npm workspaces — `apps/web` và `apps/api`
- **Phiên bản**: xem [CHANGELOG.md](CHANGELOG.md)

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [docs/installation.md](docs/installation.md) | Cài đặt bằng Docker hoặc thủ công, xử lý lỗi thường gặp |
| [docs/configuration.md](docs/configuration.md) | Mọi biến cấu hình, email, lưu ảnh (local/S3 beta) |
| [docs/customization.md](docs/customization.md) | Tên, logo, màu (theme), ngôn ngữ và thêm ngôn ngữ mới, ảnh |
| [docs/payments.md](docs/payments.md) | VNPay (chờ kích hoạt merchant sandbox), MoMo (beta), hoàn tiền |
| [DEPLOY.md](DEPLOY.md) | Triển khai production và danh sách kiểm tra trước khi mở cho khách |
| [docs/demo.md](docs/demo.md) | Chế độ demo công khai và đặt lại dữ liệu demo theo lịch |
| [docs/known-issues.md](docs/known-issues.md) | Giới hạn hiện tại |

## Chạy nhanh bằng Docker

Cần Docker Desktop (hoặc Docker Engine + Compose).

```bash
docker compose up --build
```

Mở <http://localhost:8080>. Lần chạy đầu sẽ tự tạo cơ sở dữ liệu, chạy migration và nạp dữ liệu mẫu.

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Quản trị | `admin@example.com` | Sinh ngẫu nhiên, in **một lần** trong log lần chạy đầu. Bắt buộc đổi ở lần đăng nhập đầu |
| Khách | `user@example.com` | Như trên |

```bash
docker compose logs api | grep "generated"    # hai mật khẩu, chỉ có ở log của lần chạy đầu
```

Muốn tự chọn mật khẩu quản trị: đặt `SEED_ADMIN_PASSWORD` (và `SEED_ADMIN_EMAIL`) trong `.env` **trước lần chạy đầu**. Quên mật khẩu hoặc bị khoá: `docker compose exec api npm run admin:reset -- --email <email>` ([chi tiết](docs/installation.md#quên-mật-khẩu-admin--bị-khoá-ngoài)). Chạy thủ công bằng `npm run db:seed` khi phát triển (không phải production) thì mật khẩu là `Admin@12345` và `User@12345`.

Dữ liệu mẫu gồm 50 phòng, mã giảm giá `WELCOME10` và 3 booking của tài khoản khách. Tài khoản quản trị chỉ được tạo khi chưa có quản trị viên nào, dữ liệu mẫu chỉ được nạp khi cơ sở dữ liệu còn trống: các lần khởi động sau không tạo lại gì.

Muốn đổi cổng, tên thương hiệu hay mật khẩu cơ sở dữ liệu: chép `.env.example` thành `.env` ở thư mục gốc rồi sửa. Xoá sạch để làm lại từ đầu: `docker compose down -v`.

> Trước khi đưa lên mạng thật: khoá hoặc xoá tài khoản khách mẫu trong trang Users, nên đặt `SEED_ON_START=false`, và đọc [DEPLOY.md](DEPLOY.md).

## Các trang

| Địa chỉ | Nội dung | Ai xem được |
|---|---|---|
| `/` | Trang chủ: tìm phòng theo ngày, điểm đến (có ảnh), phòng nổi bật | Mọi người |
| `/credits` | Ghi công ảnh: tác giả, giấy phép và nguồn của từng ảnh điểm đến (link ở chân trang) | Mọi người |
| `/rooms` | Danh sách phòng, lọc theo địa điểm, ngày, số khách; phân trang | Mọi người |
| `/rooms/:id` | Chi tiết phòng, lịch phòng trống, đặt phòng và thanh toán | Mọi người (đặt phòng cần đăng nhập) |
| `/my-bookings` | Đặt phòng của tôi: thanh toán, hủy, đánh giá, tải PDF xác nhận | Đã đăng nhập |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Đăng nhập, đăng ký (email/mật khẩu, Google nếu bật), quên và đặt lại mật khẩu | Mọi người |
| `/settings` | Tài khoản: hồ sơ, ảnh đại diện, mật khẩu | Đã đăng nhập |
| `/admin`, `/admin/rooms`, `/admin/orders`, `/admin/users`, `/admin/calendar`, `/admin/coupons` | Quản trị. Orders có đặt phòng tại quầy, ghi nhận thu tiền tại quầy và PDF xác nhận | Quản trị |
| `/admin/property` | Thông tin cơ sở lưu trú: tên, logo, ảnh nền và nội dung trang chủ, liên hệ, giờ nhận/trả phòng, hạn hủy miễn phí | Quản trị |
| `/admin/destinations` | Ảnh và ghi công ảnh của từng điểm đến | Quản trị |

Mọi trang có tiếng Việt và tiếng Anh (nút VI/EN ở đầu trang khách và trang quản trị). Khách chưa đăng nhập bấm đặt phòng sẽ được đưa tới trang đăng nhập rồi quay lại đúng phòng và ngày đã chọn.

## Chạy thủ công để phát triển

Cần Node.js 22 trở lên và PostgreSQL 14 trở lên.

```bash
npm install

# 1. Tạo cơ sở dữ liệu trống, ví dụ:  createdb luxestay
# 2. Cấu hình
cp apps/api/.env.example apps/api/.env      # điền DB_* và JWT_SECRET
cp apps/web/.env.example apps/web/.env

# 3. Tạo bảng và dữ liệu mẫu
npm run db:migrate
npm run db:seed

# 4. Chạy cả API (cổng 3001) và web (cổng 5173)
npm run dev
```

API sẽ dừng ngay với thông báo rõ ràng nếu thiếu cấu hình bắt buộc hoặc không kết nối được cơ sở dữ liệu.

### Các lệnh

| Lệnh (chạy ở thư mục gốc) | Tác dụng |
|---|---|
| `npm run dev` | Chạy API và web cùng lúc, tự nạp lại khi sửa code |
| `npm run build` | Build web ra `apps/web/dist` |
| `npm start` | Chạy API ở chế độ thường |
| `npm run lint` | ESLint cho cả hai app (gồm lỗi dùng component chưa import trong JSX), kiểm tra bản dịch (khoá thiếu, chữ viết thẳng trong code, mã thông báo API chưa dịch) và kiểm tra màu theme |
| `npm test` | Test đơn vị của API (không cần cơ sở dữ liệu) |
| `npm run test:integration` | Test tích hợp trên PostgreSQL thật và một máy chủ S3 giả lập; tự dựng và xoá các container tạm (cần Docker) |
| `npm run test:e2e` | Test trình duyệt (trang Đặt phòng của tôi ở mọi trạng thái booking, tài khoản mật khẩu và tài khoản Google) trên bản build thật của web và API thật; cần Docker và Chrome hoặc Edge đã cài. Ảnh chụp màn hình lưu ở `test-results/` |
| `npm run db:migrate` | Chạy các migration chưa áp dụng |
| `npm run db:seed` | Tạo quản trị viên đầu tiên (nếu chưa có ai) và nạp dữ liệu mẫu vào cơ sở dữ liệu trống. Thêm `-- --all-rooms` để nạp khoảng 390 phòng, `-- --force` để bổ sung dữ liệu mẫu còn thiếu vào cơ sở dữ liệu đã có dữ liệu (không tạo trùng), `-- --admin-only` để chỉ tạo quản trị viên |
| `npm run db:reset` | Xoá toàn bộ dữ liệu rồi migrate + seed lại. Chỉ chạy với cơ sở dữ liệu cục bộ, trừ khi đặt `ALLOW_DB_RESET=true` |
| `npm run uploads:prune` | Liệt kê ảnh tải lên không còn được dùng; thêm `-- --delete` để xoá |
| `npm run admin:reset` | Liệt kê quản trị viên; thêm `-- --email <email>` để cấp mật khẩu tạm, mở khoá và trả quyền quản trị cho tài khoản đó ([docs/installation.md](docs/installation.md#quên-mật-khẩu-admin--bị-khoá-ngoài)) |
| `npm run demo:reset` | Chỉ với `DEMO_MODE=true`: đặt lại toàn bộ dữ liệu demo ([docs/demo.md](docs/demo.md)) |

## Cấu hình

**Chạy bằng Docker: sửa `.env` ở thư mục gốc. Chạy bằng `npm run dev`: sửa `apps/api/.env` và `apps/web/.env`.** Chi tiết từng biến, biến nào do compose đặt cố định, cách kiểm tra cấu hình đã nạp và ví dụ chạy thử VNPay qua tunnel: [docs/configuration.md](docs/configuration.md).

Mọi biến đều có chú thích trong file mẫu:

- [`.env.example`](.env.example) — dùng với Docker Compose
- [`apps/api/.env.example`](apps/api/.env.example) — API khi chạy thủ công
- [`apps/web/.env.example`](apps/web/.env.example) — web khi chạy thủ công

Bắt buộc với API: `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` (từ 32 ký tự). Với Docker Compose, các giá trị này đã có sẵn; `JWT_SECRET` được tự sinh và lưu lại nếu bạn không đặt.

### Quy tắc đặt phòng

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `APP_TIMEZONE` | `Asia/Ho_Chi_Minh` | Múi giờ của cơ sở lưu trú. "Hôm nay" được tính theo múi giờ này, không theo giờ máy chủ |
| `PENDING_BOOKING_TTL_MINUTES` | `30` | Booking chưa thanh toán được giữ chỗ bao lâu trước khi tự hủy |
| `FREE_CANCELLATION_DAYS` | `3` | Khách tự hủy được booking **đã thanh toán** cho tới trước ngày nhận phòng bấy nhiêu ngày. Booking chưa thanh toán luôn hủy được; quản trị luôn hủy được |

Tiền và hoàn tiền:

- Hủy một booking đã thanh toán chuyển nó sang **Chờ hoàn tiền**. Ứng dụng không tự chuyển tiền: quản trị hoàn tiền cho khách bằng tay rồi bấm **Xác nhận hoàn tiền** ở trang Orders.
- Nếu tiền về sau khi booking đã hết hạn hoặc đã hủy: phòng còn trống thì booking được khôi phục và xác nhận; phòng đã có người khác đặt thì booking chuyển sang Chờ hoàn tiền và quản trị được báo (thông báo trên trang quản trị, và email nếu đã cấu hình SMTP).
- Khách trả tiền mặt hoặc chuyển khoản: quản trị bấm **Đã thu tiền** ở trang Orders.
- Booking đã có thanh toán không xoá được, chỉ hủy được, để giữ lại lịch sử giao dịch.

### Tính năng tuỳ chọn

Các tính năng dưới đây tắt cho tới khi bạn cấu hình; phần còn lại của ứng dụng vẫn chạy đầy đủ.

| Tính năng | Cần cấu hình | Ghi chú |
|---|---|---|
| Email (xác nhận/hủy đặt phòng, quên mật khẩu, báo hoàn tiền) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` (+ `SMTP_USER`, `SMTP_PASS` nếu cần) | Gmail: dùng mật khẩu ứng dụng. Thử bằng Mailpit: `docker compose --profile mail up` |
| Lưu ảnh trên S3/R2/MinIO | `STORAGE_DRIVER=s3` và `S3_*` | Mặc định lưu trên đĩa của API |
| Thanh toán VNPay | `VNPAY_*` | VNPay gọi về `GET /api/payments/vnpay/ipn`, địa chỉ này phải truy cập được từ Internet |
| Thanh toán MoMo (**beta**) | `MOMO_ENABLED=true` và `MOMO_*` | Chưa được kiểm chứng với tài khoản MoMo thật. Nút MoMo chỉ hiện khi bật |
| Đăng nhập Google | `FIREBASE_*` ở API và `VITE_FIREBASE_*` ở web | Cần một dự án Firebase riêng |

### Đổi tên thương hiệu, màu, ngôn ngữ

Tên, logo, ảnh nền, liên hệ và quy định: trang quản trị **Cơ sở lưu trú** (`/admin/property`), có hiệu lực ngay. Màu của cả trang khách lẫn trang quản trị (hai giao diện sáng và tối): bộ token ở đầu `apps/web/src/index.css`. Bản dịch và cách thêm ngôn ngữ: [docs/customization.md](docs/customization.md).

### Ảnh phòng mẫu

Đặt ảnh vào [`apps/api/seed-assets/rooms/`](apps/api/seed-assets/rooms/README.md); `db:seed` sẽ gán cho các phòng mẫu (đã seed rồi thì chạy `npm run db:seed -- --force`). Không có ảnh thì phòng vẫn được tạo và trang web hiện hình vẽ thay thế (màu và hoạ tiết khác nhau theo tên phòng).

## Ảnh mẫu & giấy phép

| Thư mục | Nội dung | Giấy phép |
|---|---|---|
| [`apps/api/seed-assets/destinations/`](apps/api/seed-assets/destinations/CREDITS.md) | 12 ảnh điểm đến (một ảnh cho mỗi tỉnh/thành có trong dữ liệu mẫu), lấy từ Wikimedia Commons | Riêng từng ảnh: CC0, Public domain, CC BY hoặc CC BY-SA. Xem [CREDITS.md](apps/api/seed-assets/destinations/CREDITS.md) |
| `apps/api/seed-assets/rooms/` | Ảnh phòng mẫu (hiện để trống) | Do người bỏ ảnh vào chịu trách nhiệm |
| `apps/api/seed-assets/hero/` | Ảnh nền trang chủ cho `db:seed` (không kèm sẵn ảnh nào) | Như trên |

- **Các ảnh này không thuộc giấy phép thương mại của LuxeStay** (xem mục 5 của [LICENSE](LICENSE)). Người mua được dùng chúng theo đúng giấy phép riêng của từng ảnh, không phải theo giấy phép của sản phẩm.
- Ảnh CC BY / CC BY-SA bắt buộc ghi tác giả và giấy phép nơi ảnh hiển thị. Trang web làm việc đó: chú thích nhỏ trên thẻ điểm đến (đầy đủ hơn khi rê chuột) và trang `/credits`, có link ở chân trang. Đừng gỡ hai chỗ này khi còn dùng các ảnh đó.
- `db:seed` gán ảnh theo tên tỉnh/thành trong `credits.json` (khớp với phần sau dấu phẩy cuối của địa chỉ phòng); điểm đến đã có ảnh thì giữ nguyên. Đổi ảnh hoặc sửa ghi công ở **Ảnh điểm đến** (`/admin/destinations`); ảnh tự chụp thì để trống phần giấy phép.
- Muốn bán sản phẩm không kèm ảnh của bên thứ ba: xoá các file `.webp` và `credits.json` trong `seed-assets/destinations/`; thẻ điểm đến sẽ dùng ảnh phòng hoặc hình vẽ.

## Cấu trúc thư mục

```text
apps/
  api/
    server.js
    src/
      config/        kiểm tra cấu hình khi khởi động, chế độ demo
      controller/    xử lý nghiệp vụ theo từng nhóm API
      db/            kết nối, migrate, seed, reset, migrations/*.sql
      middleware/    xác thực, giới hạn tần suất, tải và xử lý ảnh (sharp)
      routes/        khai báo đường dẫn và phân quyền
      services/      phiên đăng nhập, email, PDF, lưu ảnh, VNPay, MoMo, Socket.IO
      utils/apiMessages.js  mã + nội dung mọi thông báo API gửi cho web
    seed-assets/     ảnh mẫu cho db:seed
    test/
  web/
    src/
      index.css      biến theme (2 màu thương hiệu) và màu dẫn xuất
      pages/         guest/ (trang khách), auth/ (đăng nhập), account/, admin/<trang>/
      components/    admin/ui.jsx (bộ giao diện quản trị), guest/, auth/, myBookings/
      layout/        khung trang khách và khung quản trị
      styles/        guest.css, admin.css — chỉ dùng biến theme
      context/       đăng nhập, thông tin cơ sở lưu trú, thông báo
      services/      gọi API
      locales/       vi/, en/ — mỗi file một nhóm bản dịch
scripts/             kiểm tra bản dịch, kiểm tra màu, chạy test tích hợp
docs/                tài liệu cho người mua
docker-compose.yml
```

## API chính

Mọi phản hồi lỗi (và phần lớn phản hồi thành công) có dạng `{ code, message, params? }`: `code` cố định để web dịch (`apps/web/src/locales/*/errors.json`), `message` là câu tiếng Việt cho client khác và log.

Tất cả nằm dưới `/api`. Phân quyền được khai báo ngay trong `apps/api/src/routes/`.

| Nhóm | Đường dẫn | Quyền |
|---|---|---|
| Tài khoản | `POST /login`, `/register`, `/logout`, `/forgot-password`, `/reset-password`, `/google-login` | Công khai |
| Hồ sơ | `GET/PUT /users/me`, `PUT /users/me/password`, `POST /users/me/avatar` | Đã đăng nhập |
| Người dùng | `GET /users?page&limit&search&role&status`, `POST /users`, `GET/PUT/DELETE /users/:id`, `PATCH /users/:id/lock` | Quản trị |
| Phòng | `GET /rooms`, `/rooms/locations`, `/rooms/filters`, `/rooms/destinations`, `/rooms/:id`, `/rooms/:id/availability`, `/rooms/:id/reviews` | Công khai |
| Phòng | `POST /rooms`, `PUT/DELETE /rooms/:id`, ảnh phòng | Quản trị |
| Đặt phòng | `GET/POST /bookings`, `GET /bookings/:id`, `PATCH /bookings/:id/cancel` | Chủ booking hoặc quản trị |
| Đặt phòng | `GET /bookings/policy` | Công khai |
| Đặt phòng | `GET /bookings/:id/receipt` (PDF xác nhận, `?lang=vi\|en`) | Chủ booking hoặc quản trị |
| Đặt phòng | `PUT/DELETE /bookings/:id`, `GET /bookings/calendar`, `GET /bookings/summary`, `PATCH /bookings/:id/mark-paid`, `PATCH /bookings/:id/refund`; `POST /bookings` kèm `guest_name` = đặt tại quầy | Quản trị |
| Thanh toán | `GET /payments/providers` | Công khai |
| Thanh toán | `POST/GET /payments/bookings/:id`, `GET /payments/transactions/:ref` | Chủ booking hoặc quản trị |
| Thanh toán | `GET /payments/vnpay/ipn`, `POST /payments/momo/ipn` | Cổng thanh toán (xác thực bằng chữ ký) |
| Mã giảm giá | `POST /coupons/validate` | Đã đăng nhập |
| Mã giảm giá | `GET/POST /coupons`, `PUT /coupons/:id`, `PATCH /coupons/:id/active` | Quản trị |
| Đánh giá | `POST /rooms/:id/reviews` | Khách đã ở xong |
| Đánh giá | `GET /reviews`, `PATCH /reviews/:id/hide` | Quản trị |
| Báo cáo | `GET /dashboard/stats`, `/dashboard/analytics`, `/dashboard/export` | Quản trị |
| Cơ sở lưu trú | `GET /settings/public` | Công khai |
| Cơ sở lưu trú | `GET/PUT /settings`, `POST/DELETE /settings/logo`, `POST/DELETE /settings/hero` | Quản trị |
| Điểm đến | `GET /destinations/credits` | Công khai |
| Điểm đến | `GET /destinations`, `POST/DELETE /destinations/:name/image`, `PUT /destinations/:name/credit` | Quản trị |

## Kiểm thử

```bash
npm run lint
npm test
```

`npm test` chạy trên một cơ sở dữ liệu giả lập trong bộ nhớ nên nhanh và không cần PostgreSQL. `npm run test:integration` chạy ứng dụng thật trên PostgreSQL thật (trong Docker) để kiểm chứng những gì bản giả lập không thấy được: khoá dòng khi đặt phòng đồng thời, ràng buộc chống trùng lịch, luồng hoàn tiền và múi giờ, biểu đồ theo `APP_TIMEZONE`, phân trang/tìm kiếm người dùng, `demo:reset`, cùng driver lưu ảnh S3 (với máy chủ giả lập S3Mock).

## Triển khai

Xem [DEPLOY.md](DEPLOY.md).

## Vấn đề đã biết

Xem [docs/known-issues.md](docs/known-issues.md): rule ESLint đang tắt tạm, các cảnh báo `npm audit` còn lại và những giới hạn hiện tại.

## Giấy phép

Xem [LICENSE](LICENSE). Không được bán lại hay phân phối lại mã nguồn. Ảnh trong `apps/api/seed-assets/` theo giấy phép riêng, xem [Ảnh mẫu & giấy phép](#ảnh-mẫu--giấy-phép).
