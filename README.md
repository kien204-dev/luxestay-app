# LuxeStay

Hệ thống đặt phòng cho khách sạn nhỏ và homestay: trang đặt phòng cho khách, trang quản trị cho chủ cơ sở, thanh toán VNPay, mã giảm giá, đánh giá, lịch phòng và báo cáo.

- **Web**: React 19, Vite, React Router, Tailwind CSS, i18next (vi/en)
- **API**: Node.js 22, Express 5, PostgreSQL, JWT trong cookie HttpOnly, Socket.IO
- **Cấu trúc**: npm workspaces — `apps/web` và `apps/api`

## Chạy nhanh bằng Docker

Cần Docker Desktop (hoặc Docker Engine + Compose).

```bash
docker compose up --build
```

Mở <http://localhost:8080>. Lần chạy đầu sẽ tự tạo cơ sở dữ liệu, chạy migration và nạp dữ liệu mẫu.

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Quản trị | `admin@example.com` | `Admin@12345` (bắt buộc đổi ở lần đăng nhập đầu) |
| Khách | `user@example.com` | `User@12345` |

Dữ liệu mẫu gồm 50 phòng, mã giảm giá `WELCOME10` và 3 booking của tài khoản khách.

Muốn đổi cổng, tên thương hiệu hay mật khẩu cơ sở dữ liệu: chép `.env.example` thành `.env` ở thư mục gốc rồi sửa. Xoá sạch để làm lại từ đầu: `docker compose down -v`.

> Trước khi đưa lên mạng thật: đổi mật khẩu tài khoản khách mẫu (hoặc khoá tài khoản đó trong trang Users), đặt `SEED_ON_START=false`, và đọc [DEPLOY.md](DEPLOY.md).

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
| `npm run lint` | ESLint cho cả hai app |
| `npm test` | Test đơn vị của API (không cần cơ sở dữ liệu) |
| `npm run test:integration` | Test tích hợp trên PostgreSQL thật; tự dựng và xoá một container tạm (cần Docker) |
| `npm run db:migrate` | Chạy các migration chưa áp dụng |
| `npm run db:seed` | Nạp dữ liệu mẫu (chạy lại không tạo trùng). Thêm `-- --all-rooms` để nạp khoảng 390 phòng |
| `npm run db:reset` | Xoá toàn bộ dữ liệu rồi migrate + seed lại. Chỉ chạy với cơ sở dữ liệu cục bộ, trừ khi đặt `ALLOW_DB_RESET=true` |

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
| Email quên mật khẩu | `SMTP_*` | Gmail: dùng mật khẩu ứng dụng |
| Thanh toán VNPay | `VNPAY_*` | VNPay gọi về `GET /api/payments/vnpay/ipn`, địa chỉ này phải truy cập được từ Internet |
| Thanh toán MoMo (**beta**) | `MOMO_ENABLED=true` và `MOMO_*` | Chưa được kiểm chứng với tài khoản MoMo thật. Nút MoMo chỉ hiện khi bật |
| Đăng nhập Google | `FIREBASE_*` ở API và `VITE_FIREBASE_*` ở web | Cần một dự án Firebase riêng |

### Đổi tên thương hiệu

Đặt `APP_NAME` (Docker), hoặc `APP_NAME` trong `apps/api/.env` và `VITE_APP_NAME` trong `apps/web/.env`. Tên này được dùng ở giao diện, email, mô tả thanh toán và báo cáo xuất ra.

### Ảnh phòng mẫu

Đặt ảnh vào [`apps/api/seed-assets/rooms/`](apps/api/seed-assets/rooms/README.md); `db:seed` sẽ gán cho các phòng mẫu. Không có ảnh thì phòng vẫn được tạo và trang web hiện ảnh thay thế.

## Cấu trúc thư mục

```text
apps/
  api/
    server.js
    src/
      config/        tên thương hiệu, kiểm tra cấu hình khi khởi động
      controller/    xử lý nghiệp vụ theo từng nhóm API
      db/            kết nối, migrate, seed, reset, migrations/*.sql
      middleware/    xác thực, giới hạn tần suất, tải ảnh
      routes/        khai báo đường dẫn và phân quyền
      services/      phiên đăng nhập, email, VNPay, MoMo, Socket.IO
    seed-assets/     ảnh mẫu cho db:seed
    test/
  web/
    src/
      pages/         mỗi trang một file
      components/    thành phần dùng chung
      context/       đăng nhập, thông báo
      services/      gọi API
      locales/       bản dịch vi/en
      config/        tên thương hiệu
docker-compose.yml
```

## API chính

Tất cả nằm dưới `/api`. Phân quyền được khai báo ngay trong `apps/api/src/routes/`.

| Nhóm | Đường dẫn | Quyền |
|---|---|---|
| Tài khoản | `POST /login`, `/register`, `/logout`, `/forgot-password`, `/reset-password`, `/google-login` | Công khai |
| Hồ sơ | `GET/PUT /users/me`, `PUT /users/me/password`, `POST /users/me/avatar` | Đã đăng nhập |
| Người dùng | `GET/POST /users`, `GET/PUT/DELETE /users/:id`, `PATCH /users/:id/lock` | Quản trị |
| Phòng | `GET /rooms`, `/rooms/locations`, `/rooms/:id`, `/rooms/:id/reviews` | Công khai |
| Phòng | `POST /rooms`, `PUT/DELETE /rooms/:id`, ảnh phòng | Quản trị |
| Đặt phòng | `GET/POST /bookings`, `GET /bookings/:id`, `PATCH /bookings/:id/cancel` | Chủ booking hoặc quản trị |
| Đặt phòng | `GET /bookings/policy` | Công khai |
| Đặt phòng | `PUT/DELETE /bookings/:id`, `GET /bookings/calendar`, `PATCH /bookings/:id/mark-paid`, `PATCH /bookings/:id/refund` | Quản trị |
| Thanh toán | `GET /payments/providers` | Công khai |
| Thanh toán | `POST/GET /payments/bookings/:id`, `GET /payments/transactions/:ref` | Chủ booking hoặc quản trị |
| Thanh toán | `GET /payments/vnpay/ipn`, `POST /payments/momo/ipn` | Cổng thanh toán (xác thực bằng chữ ký) |
| Mã giảm giá | `POST /coupons/validate` | Đã đăng nhập |
| Mã giảm giá | `GET/POST /coupons`, `PUT /coupons/:id`, `PATCH /coupons/:id/active` | Quản trị |
| Đánh giá | `POST /rooms/:id/reviews` | Khách đã ở xong |
| Đánh giá | `GET /reviews`, `PATCH /reviews/:id/hide` | Quản trị |
| Báo cáo | `GET /dashboard/stats`, `/dashboard/analytics`, `/dashboard/export` | Quản trị |

## Kiểm thử

```bash
npm run lint
npm test
```

`npm test` chạy trên một cơ sở dữ liệu giả lập trong bộ nhớ nên nhanh và không cần PostgreSQL. `npm run test:integration` chạy ứng dụng thật trên PostgreSQL thật (trong Docker) để kiểm chứng những gì bản giả lập không thấy được: khoá dòng khi đặt phòng đồng thời, ràng buộc chống trùng lịch, luồng hoàn tiền và múi giờ.

## Triển khai

Xem [DEPLOY.md](DEPLOY.md).

## Vấn đề đã biết

Xem [docs/known-issues.md](docs/known-issues.md): rule ESLint đang tắt tạm, các cảnh báo `npm audit` còn lại và những giới hạn hiện tại.

## Giấy phép

Xem [LICENSE](LICENSE). Không được bán lại hay phân phối lại mã nguồn.
