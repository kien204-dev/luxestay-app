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
| Quản trị | `admin@example.com` | Sinh ngẫu nhiên, in một lần trong log — phải đổi ở lần đăng nhập đầu |
| Khách | `user@example.com` | Như trên |

Lấy hai mật khẩu (chỉ có trong log của lần chạy đầu tiên):

```bash
docker compose logs api | grep "generated"
```

Muốn tự chọn mật khẩu quản trị: đặt `SEED_ADMIN_PASSWORD` trong `.env` trước lần chạy đầu. Lỡ mất mật khẩu: xem [Quên mật khẩu admin / bị khoá ngoài](#quên-mật-khẩu-admin--bị-khoá-ngoài). Từ lần khởi động thứ hai, API không tạo lại tài khoản hay dữ liệu mẫu nào: tài khoản quản trị chỉ được tạo khi chưa có quản trị viên nào, dữ liệu mẫu chỉ được nạp vào cơ sở dữ liệu trống.

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

Mở <http://localhost:5173> và đăng nhập `admin@example.com` / `Admin@12345` hoặc `user@example.com` / `User@12345` (mật khẩu mẫu chỉ dùng khi `NODE_ENV` không phải `production`). API dừng ngay với thông báo rõ ràng nếu thiếu cấu hình bắt buộc hoặc không kết nối được cơ sở dữ liệu.

Tạo `JWT_SECRET` ngẫu nhiên:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Quên mật khẩu admin / bị khoá ngoài

**Tài khoản quản trị chỉ đăng nhập bằng mật khẩu.** Đăng nhập Google bị từ chối với mọi tài khoản quản trị ("Tài khoản quản trị hãy đăng nhập bằng mật khẩu"), kể cả tài khoản trước đó đã liên kết Google. Một tài khoản chỉ có Google (tạo bằng đăng nhập Google rồi được cấp quyền quản trị) chưa có mật khẩu nào dùng được: chạy lệnh dưới đây để nhận mật khẩu tạm.

Khi mất mật khẩu quản trị (ví dụ không kịp ghi lại mật khẩu trong log lần chạy đầu), tài khoản quản trị bị khoá, quản trị viên trước giờ chỉ dùng Google, hoặc không còn tài khoản nào có quyền quản trị, dùng lệnh `admin:reset` ngay trên máy chủ. Lệnh không hỏi mật khẩu cũ: ai chạy được lệnh trong container thì đã có toàn quyền với cơ sở dữ liệu.

```bash
# Docker
docker compose exec api npm run admin:reset                          # liệt kê các quản trị viên
docker compose exec api npm run admin:reset -- --email <email>       # khôi phục tài khoản đó

# Chạy thủ công
npm run admin:reset
npm run admin:reset -- --email <email>
```

Với `--email`, lệnh:

- đặt một **mật khẩu tạm ngẫu nhiên** và in ra đúng một lần (không lưu ở đâu khác: ghi lại ngay);
- mở khoá tài khoản và bảo đảm tài khoản có quyền quản trị (kể cả khi trước đó là tài khoản khách);
- bắt buộc đổi mật khẩu ở lần đăng nhập kế tiếp;
- đăng xuất mọi phiên đang đăng nhập của tài khoản và huỷ các liên kết "quên mật khẩu" còn hạn.

Đăng nhập bằng mật khẩu tạm, rồi đặt mật khẩu mới ở trang được chuyển tới. Tài khoản đã bị xoá không khôi phục được bằng lệnh này; nếu không còn quản trị viên nào, tạo mới bằng `docker compose exec api node src/db/seed.js --admin-only`.

## Kiểm tra sau khi cài

```bash
npm run lint              # ESLint + kiểm tra bản dịch + kiểm tra màu theme
npm test                  # test API, không cần cơ sở dữ liệu
npm run test:integration  # cần Docker: PostgreSQL thật + máy chủ S3 giả lập, tự dựng và tự xoá
npm run test:e2e          # cần Docker và Chrome/Edge: mở trang thật trong trình duyệt, chụp ảnh vào test-results/
```

## Gặp lỗi?

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Đăng nhập xong vẫn bị đẩy về trang đăng nhập | Mở trang bằng địa chỉ khác `PUBLIC_URL` (ví dụ `127.0.0.1` thay vì `localhost`), hoặc `AUTH_COOKIE_SECURE=true` khi chưa có HTTPS |
| Tải ảnh lên báo lỗi | Ảnh lớn hơn 10 MB hoặc không phải JPG/PNG/WebP |
| `Cannot start: database is unreachable` | Sai `DB_*`, hoặc PostgreSQL chưa chạy |
| Không có email nào được gửi | Thiếu `SMTP_HOST`, `SMTP_PORT` hoặc `SMTP_FROM`; xem dòng "Email" trong log khởi động |
