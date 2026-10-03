# Cài đặt

Hai cách: **Docker** (khuyên dùng, một lệnh là chạy) hoặc **thủ công** (khi bạn muốn sửa code và xem thay đổi ngay). Đưa lên máy chủ thật: xem [DEPLOY.md](../DEPLOY.md).

## Cách 1 — Docker

Cần: Docker Desktop (Windows, macOS) hoặc Docker Engine + Compose v2 (Linux). Máy có từ 2 GB RAM trống.

```bash
git clone <địa chỉ repo của bạn> luxestay
cd luxestay
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
docker compose up --build -d
```

Mở <http://localhost:8080>. Lần chạy đầu, API tự tạo bảng (migration), nạp dữ liệu mẫu (50 phòng, 12 ảnh điểm đến, 1 mã giảm giá, 3 đặt phòng) và tự sinh khoá phiên đăng nhập.

| Tài khoản mẫu | Email | Mật khẩu |
|---|---|---|
| Quản trị | `admin@example.com` | `Admin@12345` — phải đổi ở lần đăng nhập đầu |
| Khách | `user@example.com` | `User@12345` |

Kiểm tra API đã nhận cấu hình nào:

```bash
docker compose logs api | head -40
```

Phần "Configuration" liệt kê địa chỉ web, múi giờ, nơi lưu ảnh, email, VNPay/MoMo, đăng nhập Google, chế độ demo — chỉ ghi "set/empty", không in giá trị bí mật.

Các lệnh hay dùng:

| Việc | Lệnh |
|---|---|
| Dừng | `docker compose down` (dữ liệu giữ nguyên) |
| Xoá sạch, làm lại từ đầu | `docker compose down -v` |
| Áp dụng thay đổi `.env` | `docker compose up -d --build` |
| Xem log | `docker compose logs -f api` |
| Dọn ảnh không còn dùng | `docker compose exec api npm run uploads:prune` |
| Thử email mà không cần hộp thư thật | `docker compose --profile mail up -d`, rồi xem <http://localhost:8025> (xem [configuration.md](configuration.md#email)) |

Dữ liệu nằm trong ba volume: `db-data` (cơ sở dữ liệu), `uploads` (ảnh), `api-data` (khoá ký phiên đăng nhập).

## Cách 2 — Thủ công (để phát triển)

Cần: Node.js 22 trở lên, PostgreSQL 14 trở lên.

```bash
npm install

# 1. Tạo cơ sở dữ liệu trống
createdb luxestay

# 2. Cấu hình (sửa DB_* và JWT_SECRET trong apps/api/.env)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. Tạo bảng và dữ liệu mẫu
npm run db:migrate
npm run db:seed

# 4. Chạy API (cổng 3001) và web (cổng 5173) cùng lúc
npm run dev
```

Mở <http://localhost:5173>. API dừng ngay với thông báo rõ ràng nếu thiếu cấu hình bắt buộc hoặc không kết nối được cơ sở dữ liệu.

Tạo `JWT_SECRET` ngẫu nhiên:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Kiểm tra sau khi cài

```bash
npm run lint              # ESLint + kiểm tra bản dịch + kiểm tra màu theme
npm test                  # test API, không cần cơ sở dữ liệu
npm run test:integration  # cần Docker: PostgreSQL thật + máy chủ S3 giả lập, tự dựng và tự xoá
```

## Gặp lỗi?

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Đăng nhập xong vẫn bị đẩy về trang đăng nhập | Mở trang bằng địa chỉ khác `PUBLIC_URL` (ví dụ `127.0.0.1` thay vì `localhost`), hoặc `AUTH_COOKIE_SECURE=true` khi chưa có HTTPS |
| Tải ảnh lên báo lỗi | Ảnh lớn hơn 10 MB hoặc không phải JPG/PNG/WebP |
| `Cannot start: database is unreachable` | Sai `DB_*`, hoặc PostgreSQL chưa chạy |
| Không có email nào được gửi | Thiếu `SMTP_HOST`, `SMTP_PORT` hoặc `SMTP_FROM`; xem dòng "Email" trong log khởi động |
