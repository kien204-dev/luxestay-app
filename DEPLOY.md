# Triển khai LuxeStay

Có hai cách. Cách 1 đơn giản hơn và giữ được ảnh tải lên.

## Cách 1 — Một máy chủ với Docker Compose

Phù hợp với VPS chạy Linux có Docker.

1. Chép mã nguồn lên máy chủ.
2. Tạo file `.env` ở thư mục gốc từ `.env.example`:

   ```env
   PUBLIC_URL=https://dat-phong.example.com
   WEB_PORT=8080
   APP_NAME=Tên cơ sở của bạn
   DB_PASSWORD=mot-mat-khau-manh
   SEED_ON_START=false
   AUTH_COOKIE_SECURE=true
   ```

   Thêm vào cùng file các biến tuỳ chọn bạn cần (`SMTP_*`, `VNPAY_*`…); xem `apps/api/.env.example`.

3. Khởi động:

   ```bash
   docker compose up --build -d
   ```

4. Đặt một reverse proxy có HTTPS (Caddy, nginx, Cloudflare Tunnel…) trỏ tên miền về cổng `WEB_PORT`. `PUBLIC_URL` phải khớp chính xác địa chỉ người dùng mở trên trình duyệt.

   Khi có thêm proxy này phía trước, API đứng sau hai lớp proxy: thêm `TRUST_PROXY_HOPS=2` vào `.env` để giới hạn tần suất tính đúng địa chỉ IP của khách.

5. Tạo tài khoản quản trị. Nếu muốn dùng dữ liệu mẫu, chạy một lần:

   ```bash
   docker compose exec api node src/db/seed.js
   ```

   Sau đó đăng nhập `admin@example.com` / `Admin@12345`, đổi mật khẩu, rồi khoá hoặc đổi mật khẩu tài khoản `user@example.com`. Để đặt sẵn email và mật khẩu quản trị, thêm `SEED_ADMIN_EMAIL` và `SEED_ADMIN_PASSWORD` vào `.env` trước khi chạy lệnh trên.

### Bảo vệ cơ sở dữ liệu

- **Đặt `DB_PASSWORD` mạnh trước lần khởi động đầu tiên.** Giá trị mặc định `luxestay` chỉ dành cho máy cá nhân. Mật khẩu được ghi vào volume `db-data` ở lần chạy đầu; đổi `DB_PASSWORD` sau đó không tự đổi mật khẩu trong PostgreSQL (phải `ALTER USER luxestay PASSWORD ...` trong container `db`, hoặc xoá volume nếu chưa có dữ liệu thật).
- **Không mở cổng 5432 ra ngoài.** `docker-compose.yml` cố ý không có mục `ports` cho dịch vụ `db`: chỉ container `api` trong cùng mạng Docker kết nối được. Đừng thêm `ports: "5432:5432"`. Nếu cần truy cập để quản trị, dùng `docker compose exec db psql -U luxestay luxestay`, hoặc SSH tunnel tới máy chủ.
- Kiểm tra tường lửa của máy chủ: chỉ nên mở 80/443 (và SSH).

Dữ liệu nằm trong ba volume: `db-data` (cơ sở dữ liệu), `uploads` (ảnh), `api-data` (khoá ký phiên đăng nhập). Hãy sao lưu `db-data` và `uploads`.

Cập nhật phiên bản mới: lấy mã nguồn mới rồi chạy lại `docker compose up --build -d`. Migration tự chạy khi API khởi động.

## Cách 2 — Tách dịch vụ: Neon + Render + Vercel

> Phần cấu hình Render và Vercel dưới đây được viết theo bố cục workspaces mới và **chưa được chạy thử** trên hai nền tảng này. Hãy kiểm tra ở lần triển khai đầu.

> Ảnh tải lên được lưu trên đĩa của API. Đĩa của Render (gói không có persistent disk) bị xoá sau mỗi lần triển khai, nên ảnh phòng sẽ mất. Cần gắn persistent disk vào `apps/api/uploads`, hoặc dùng Cách 1.

### 1. Cơ sở dữ liệu trên Neon

Tạo dự án Neon và lấy Host, Database, User, Password. Kết nối TLS được bật tự động khi `DB_HOST` chứa `neon.tech`.

### 2. API trên Render (Web Service)

| Mục | Giá trị |
|---|---|
| Root Directory | để trống (thư mục gốc của repo) |
| Build Command | `npm ci --omit=dev --workspace apps/api` |
| Start Command | `npm run db:migrate && npm start` |

Biến môi trường:

```env
CLIENT_URL=https://ten-web-cua-ban.vercel.app
FRONTEND_URL=https://ten-web-cua-ban.vercel.app
APP_NAME=LuxeStay

DB_HOST=<host của Neon>
DB_PORT=5432
DB_NAME=<database>
DB_USER=<user>
DB_PASSWORD=<password>

JWT_SECRET=<chuỗi ngẫu nhiên từ 32 ký tự>
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=none
TRUST_PROXY_HOPS=1
```

`AUTH_COOKIE_SAME_SITE=none` là bắt buộc ở cách này vì web và API nằm trên hai tên miền khác nhau. Thêm `SMTP_*`, `VNPAY_*`… nếu dùng.

Nạp dữ liệu mẫu (tuỳ chọn): mở Shell của dịch vụ trên Render và chạy `npm run db:seed`.

Kiểm tra: `https://<dịch-vụ>.onrender.com/api/rooms` trả về JSON.

### 3. Web trên Vercel

| Mục | Giá trị |
|---|---|
| Framework Preset | Vite |
| Root Directory | `apps/web` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Include files outside the Root Directory | bật (để dùng `package-lock.json` ở gốc) |

Biến môi trường:

```env
VITE_API_URL=https://<dịch-vụ>.onrender.com/api
VITE_APP_NAME=LuxeStay
```

`apps/web/vercel.json` đã có quy tắc rewrite cho React Router và header cần cho cửa sổ đăng nhập Google.

### 4. Đăng nhập Google (tuỳ chọn)

- Render: `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`.
- Vercel: sáu biến `VITE_FIREBASE_*`.
- Firebase Console → Authentication → Settings → Authorized domains: thêm đúng tên miền của web.

## Thanh toán

- **VNPay**: khai báo IPN URL trong trang quản trị merchant của VNPay là `https://<địa-chỉ-API>/api/payments/vnpay/ipn`, và đặt `VNPAY_RETURN_URL=https://<địa-chỉ-web>/payment/result`.
- **MoMo (beta)**: đặt `MOMO_ENABLED=true`, `MOMO_IPN_URL=https://<địa-chỉ-API>/api/payments/momo/ipn`, `MOMO_RETURN_URL=https://<địa-chỉ-web>/payment/result`. Chưa được kiểm chứng với tài khoản MoMo thật.

Cả hai cổng gọi IPN từ máy chủ của họ, nên địa chỉ API phải truy cập được từ Internet.

## Danh sách kiểm tra trước khi mở cho khách

- [ ] `JWT_SECRET` là chuỗi ngẫu nhiên riêng của bạn; không file `.env` nào nằm trong git.
- [ ] Đã đổi mật khẩu quản trị mặc định; tài khoản `user@example.com` đã bị khoá hoặc đổi mật khẩu.
- [ ] `SEED_ON_START=false`.
- [ ] `DB_PASSWORD` là mật khẩu mạnh, và cổng 5432 không truy cập được từ Internet.
- [ ] Trang web chạy qua HTTPS và `AUTH_COOKIE_SECURE=true`.
- [ ] `CLIENT_URL` / `PUBLIC_URL` khớp chính xác địa chỉ web.
- [ ] `TRUST_PROXY_HOPS` bằng đúng số lớp proxy đứng trước API.
- [ ] Đã thử: đăng ký, đăng nhập, đặt phòng, huỷ phòng, tải ảnh phòng, xuất báo cáo.
- [ ] Nếu dùng email: thư quên mật khẩu tới được hộp thư thật.
- [ ] Nếu dùng VNPay: một giao dịch thử đi trọn vòng và booking chuyển sang "đã xác nhận".
- [ ] Có lịch sao lưu cơ sở dữ liệu và thư mục ảnh.
