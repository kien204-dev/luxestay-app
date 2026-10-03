# Cấu hình

## Sửa file nào?

| Cách chạy | File cấu hình | Ghi chú |
|---|---|---|
| `docker compose up` | **`.env` ở thư mục gốc** (chép từ `.env.example`) | File duy nhất Docker đọc. Sau khi sửa: `docker compose up -d --build` |
| `npm run dev` | **`apps/api/.env`** cho API, **`apps/web/.env`** cho web | Chép từ `.env.example` cùng thư mục. Không đọc `.env` ở gốc |
| Render + Vercel | Không có file | Nhập biến trong bảng điều khiển của Render (API) và Vercel (web) |

Ba bộ này không đọc lẫn nhau. Biến đặt nhầm file sẽ bị bỏ qua mà không báo lỗi; cách kiểm tra nhanh nhất là xem [bản tóm tắt cấu hình](#kiểm-tra-cấu-hình-đã-nạp) API in ra khi khởi động.

## Docker: biến đi đường nào

`.env` ở gốc được dùng hai lần:

1. Thay vào các chỗ `${TÊN_BIẾN}` trong `docker-compose.yml`.
2. Được đưa nguyên vẹn vào container `api` (`env_file`).

Khối `environment:` trong `docker-compose.yml` **thắng** `.env`. Vì vậy:

| Biến | Trong Docker |
|---|---|
| `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME`, `DB_SSL` | Cố định bởi compose (chúng mô tả chính các container). Đặt trong `.env` không có tác dụng |
| `CLIENT_URL`, `FRONTEND_URL` | Luôn bằng `PUBLIC_URL`. Hãy đặt `PUBLIC_URL`; thêm địa chỉ khác bằng `ALLOWED_ORIGINS` |
| `DB_PASSWORD`, `JWT_SECRET`, `TRUST_PROXY_HOPS`, `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAME_SITE`, `SEED_ON_START`, `APP_NAME` | Có mặc định trong compose, đổi được trong `.env` |
| Mọi biến khác (`VNPAY_*`, `SMTP_*`, `MOMO_*`, `ALLOWED_ORIGINS`, `APP_TIMEZONE`…) | Đi thẳng từ `.env` vào API |

Web (Vite) nhận cấu hình **lúc build image**, không phải lúc chạy: `VITE_API_URL` (cố định `/api`), `VITE_APP_NAME` (từ `APP_NAME`), `VITE_DEFAULT_LANGUAGE`, ba biến `VITE_CONTACT_*` và sáu biến `VITE_FIREBASE_*`. Đổi một trong các biến này phải build lại (`--build`).

## Chạy thủ công: biến đi đường nào

- **API** chạy trong thư mục `apps/api` và nạp `apps/api/.env`. Biến đã có sẵn trong shell thắng giá trị trong file.
- **Web** nạp `apps/web/.env` (Vite cũng đọc `.env.local` và `.env.development` cùng thư mục). Chỉ biến bắt đầu bằng `VITE_` mới vào được trình duyệt; đừng đặt bí mật vào đó.

## Bảng biến của API

Bắt buộc (thiếu là API dừng ngay khi khởi động):

| Biến | Ý nghĩa |
|---|---|
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Kết nối PostgreSQL. Docker tự đặt `DB_USER` và `DB_NAME` |
| `JWT_SECRET` | Khoá ký phiên đăng nhập, từ 32 ký tự. Docker tự sinh và lưu lại nếu để trống |

Tuỳ chọn:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3001` | Cổng API |
| `DB_HOST`, `DB_PORT` | `localhost`, `5432` | Máy chủ PostgreSQL |
| `DB_SSL` | bật với host `*.neon.tech` | `true` (có kiểm tra chứng chỉ), `no-verify`, `false` |
| `CLIENT_URL`, `FRONTEND_URL` | `http://localhost:5173` | Địa chỉ chính của web: origin được phép, link trong email, trang VNPay/MoMo trả khách về. Docker: đặt `PUBLIC_URL` |
| `ALLOWED_ORIGINS` | trống | Địa chỉ web bổ sung, phân cách bằng dấu phẩy |
| `TRUST_PROXY_HOPS` | `0` (Docker: `1`) | Số proxy đứng trước API |
| `API_RATE_LIMIT_PER_MINUTE` | `300` | Số request mỗi phút từ một địa chỉ IP |
| `APP_NAME` | `LuxeStay` | Tên cơ sở lưu trú (xem [Thông tin cơ sở lưu trú](#thông-tin-cơ-sở-lưu-trú)) |
| `CONTACT_PHONE`, `CONTACT_EMAIL`, `CONTACT_ADDRESS` | trống | Liên hệ trên trang khách, email và PDF |
| `CHECK_IN_TIME`, `CHECK_OUT_TIME` | `14:00`, `12:00` | Giờ nhận và trả phòng, dạng `HH:MM` |
| `DEFAULT_LANGUAGE` | `vi` | Ngôn ngữ email khi không biết ngôn ngữ của khách (`vi` hoặc `en`) |
| `APP_TIMEZONE` | `Asia/Ho_Chi_Minh` | Múi giờ của cơ sở lưu trú |
| `PENDING_BOOKING_TTL_MINUTES` | `30` | Thời gian giữ chỗ cho booking chưa thanh toán |
| `FREE_CANCELLATION_DAYS` | `3` | Hạn khách tự hủy booking đã thanh toán (trang quản trị ghi đè được) |
| `AUTH_TOKEN_TTL`, `AUTH_COOKIE_MAX_AGE_MS` | `1d`, 86400000 | Thời hạn phiên đăng nhập |
| `AUTH_COOKIE_NAME` | `luxestay_session` | Tên cookie |
| `AUTH_COOKIE_SECURE` | `true` khi `NODE_ENV=production` (Docker: `false`) | Cookie chỉ gửi qua HTTPS |
| `AUTH_COOKIE_SAME_SITE` | `none` khi production, ngược lại `lax` (Docker: `lax`) | `none` chỉ cần khi web và API ở hai tên miền khác nhau |
| `RESET_TOKEN_TTL_MINUTES` | `15` | Hạn link đặt lại mật khẩu |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | trống | Email. Bật khi có `SMTP_HOST`, `SMTP_PORT` và `SMTP_FROM`; `SMTP_USER`/`SMTP_PASS` chỉ cần khi máy chủ thư yêu cầu. Thiếu thì không gửi email nào (đặt phòng vẫn chạy). `SMTP_PASSWORD` cũng được chấp nhận thay `SMTP_PASS` |
| `STORAGE_DRIVER` | `local` | Nơi lưu ảnh tải lên: `local` hoặc `s3` (xem [Lưu ảnh](#lưu-ảnh)) |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | trống | Bắt buộc khi `STORAGE_DRIVER=s3` |
| `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | trống | Cho dịch vụ không phải AWS (Cloudflare R2, MinIO...) |
| `MAILPIT_PORT` | `8025` | Chỉ Docker: cổng của hộp thư thử (profile `mail`) |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` | trống | Bật VNPay khi có cả hai |
| `VNPAY_PAY_URL` | sandbox | Địa chỉ cổng VNPay |
| `VNPAY_RETURN_URL` | `<địa chỉ web>/payment/result` | Chỉ đặt khi muốn trả khách về nơi khác |
| `MOMO_ENABLED` | tắt | `true` để bật MoMo (beta) |
| `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, `MOMO_IPN_URL` | trống | Cần đủ khi bật MoMo |
| `MOMO_API_URL`, `MOMO_RETURN_URL` | môi trường test của MoMo, `<địa chỉ web>/payment/result` | |
| `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` | trống | Đăng nhập Google (kèm `VITE_FIREBASE_*` ở web). `GOOGLE_APPLICATION_CREDENTIALS` cũng dùng được |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | `admin@example.com`, mật khẩu mẫu | Tài khoản quản trị do `db:seed` tạo |
| `ALLOW_DB_RESET` | tắt | Cho phép `db:reset` trên cơ sở dữ liệu không nằm trên máy này |
| `SEED_ON_START` | Docker: `true` | Chỉ Docker: nạp dữ liệu mẫu khi khởi động |

## Bảng biến của web

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3001/api` (Docker: `/api`) | Địa chỉ API |
| `VITE_APP_NAME` | `LuxeStay` | Tên hiển thị, tiêu đề tab và chữ cái trên favicon cho tới khi API trả lời (Docker: lấy từ `APP_NAME`) |
| `VITE_DEFAULT_LANGUAGE` | `vi` | Ngôn ngữ khách thấy ở lần đầu (`vi` hoặc `en`); cũng là `lang` của trang (Docker: lấy từ `DEFAULT_LANGUAGE`) |
| `VITE_CONTACT_PHONE`, `VITE_CONTACT_EMAIL`, `VITE_CONTACT_ADDRESS` | trống | Liên hệ ở chân trang cho tới khi API trả lời (Docker: lấy từ `CONTACT_*`) |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | trống | Đăng nhập Google. Thiếu thì nút bị tắt |

## Thông tin cơ sở lưu trú

Tên, logo, ảnh nền trang chủ, số điện thoại, email, địa chỉ, giờ nhận/trả phòng và số ngày hủy miễn phí được sửa ở trang quản trị **Cơ sở lưu trú** (`/admin/property`) và lưu trong cơ sở dữ liệu. Thứ tự ưu tiên cho từng mục:

1. giá trị đã lưu ở trang quản trị;
2. biến môi trường (`APP_NAME`, `CONTACT_*`, `CHECK_IN_TIME`, `CHECK_OUT_TIME`, `FREE_CANCELLATION_DAYS`);
3. giá trị mặc định.

Xoá trắng một ô ở trang quản trị thì mục đó quay về bước 2. Trang khách, email và file PDF xác nhận đều đọc từ đây, nên đổi xong là có hiệu lực, không cần build lại (API giữ bản đã đọc tối đa 30 giây; lưu từ trang quản trị thì cập nhật ngay). Logo và ảnh nền trang chủ chỉ đặt được ở trang quản trị (hoặc ảnh nền qua `apps/api/seed-assets/hero/` khi chạy `db:seed`). Ảnh điểm đến đặt ở `/admin/destinations`, xem [README](../README.md#ảnh-mẫu--giấy-phép).

`GET /api/settings/public` chỉ trả về chín mục trên. Cấu hình SMTP, khoá thanh toán và mọi biến khác không đi qua đường này.

## Email

Khi có `SMTP_HOST`, `SMTP_PORT` và `SMTP_FROM`, khách nhận thư lúc đặt phòng (đã nhận yêu cầu), lúc booking được xác nhận (thanh toán thành công, hoặc quản trị xác nhận) và lúc booking bị hủy. Thư viết bằng ngôn ngữ khách đang dùng khi đặt (`vi` hoặc `en`), tên người gửi là tên cơ sở lưu trú. Thư được gửi sau khi booking đã lưu xong: gửi lỗi chỉ ghi một dòng `BOOKING EMAIL FAILED` vào log, không làm hỏng việc đặt phòng.

Thử mà không cần hộp thư thật (Docker):

```bash
# .env:  SMTP_HOST=mailpit   SMTP_PORT=1025   SMTP_FROM=no-reply@example.com
docker compose --profile mail up -d --build
# Mọi thư ứng dụng gửi hiện ở http://localhost:8025
```

## Lưu ảnh

Mặc định (`STORAGE_DRIVER=local`) ảnh phòng, ảnh đại diện, logo, ảnh nền và ảnh điểm đến nằm trong `apps/api/uploads` (Docker: volume `uploads`).

`STORAGE_DRIVER=s3` đưa ảnh mới lên một bucket tương thích S3 (AWS S3, Cloudflare R2, MinIO...). Cần `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` và `S3_PUBLIC_URL` (địa chỉ công khai của bucket, không có dấu `/` cuối); thêm `S3_ENDPOINT` với dịch vụ không phải AWS và `S3_FORCE_PATH_STYLE=true` với MinIO. Thiếu biến nào API dừng ngay khi khởi động và nêu tên biến đó. Bucket phải cho phép đọc công khai, vì trình duyệt tải ảnh thẳng từ `S3_PUBLIC_URL`.

Đổi driver không tự chuyển ảnh cũ: ảnh đã lưu trên đĩa vẫn được phục vụ từ `/uploads` như trước.

Ảnh tải lên rồi không dùng (tải ảnh phòng nhưng không lưu phòng) còn nằm lại trên đĩa. `npm run uploads:prune` liệt kê các file không còn được cơ sở dữ liệu nhắc tới và cũ hơn một ngày; `npm run uploads:prune -- --delete` xoá chúng. Docker: `docker compose exec api npm run uploads:prune`. Lệnh này chỉ chạy với `STORAGE_DRIVER=local`; với S3 hãy dùng lifecycle rule của bucket.

## Địa chỉ web, origin và cookie

API chỉ nhận thao tác ghi (đặt phòng, hủy, thanh toán…) từ trình duyệt khi trang được mở từ một địa chỉ nằm trong danh sách được phép: `PUBLIC_URL` (hoặc `CLIENT_URL`/`FRONTEND_URL` khi chạy thủ công) cộng với `ALLOWED_ORIGINS`. Mở từ địa chỉ khác, người dùng vẫn xem và đăng nhập được, nhưng mọi thao tác ghi bị từ chối với lỗi 403 "Request origin is not allowed".

- Địa chỉ phải khớp chính xác: đủ `http://` hoặc `https://`, đúng cổng, không có dấu `/` ở cuối.
- Cookie đăng nhập gắn với từng địa chỉ: đăng nhập ở `localhost:8080` không có hiệu lực khi mở qua tên miền khác.
- `PUBLIC_URL` là địa chỉ dùng cho link trong email và cho trang thanh toán trả về.

## Kiểm tra cấu hình đã nạp

Khi khởi động, API in ra cấu hình nó thực sự nhận được. Bí mật chỉ hiện là `set` hoặc `empty`, không bao giờ hiện giá trị:

```bash
docker compose logs api | grep -A 16 "Configuration"
```

```text
Configuration (LuxeStay, NODE_ENV=production)
  Web address        http://localhost:8080
  Allowed origins    http://localhost:8080
  Trusted proxies    1
  Session cookie     secure=false sameSite=lax
  Timezone           Asia/Ho_Chi_Minh
  Database           db:5432/luxestay
  Email              off
  Google sign-in     off
  VNPay              on
    pay URL          https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
    return URL       http://localhost:8080/payment/result
  MoMo               off (MOMO_ENABLED is not true)
  Secrets            DB_PASSWORD=set  JWT_SECRET=set  ...  VNPAY_HASH_SECRET=set  ...
```

Nếu một dòng không như bạn mong đợi, biến đó đang được đặt ở file khác hoặc bị compose đặt cố định (xem bảng ở trên).

## Ví dụ: chạy thử VNPay sandbox qua tunnel

VNPay gọi về máy chủ của bạn (IPN) và trả khách về trang kết quả, nên trang phải có địa chỉ công khai. Trên máy cá nhân, dùng một tunnel.

1. Mở tunnel tới cổng web:

   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```

   Ghi lại địa chỉ được cấp, ví dụ `https://abc-def.trycloudflare.com`.

2. `.env` ở gốc:

   ```env
   PUBLIC_URL=https://abc-def.trycloudflare.com
   # Vẫn dùng được localhost song song:
   ALLOWED_ORIGINS=http://localhost:8080
   # cloudflared + nginx = 2 lớp proxy
   TRUST_PROXY_HOPS=2

   VNPAY_TMN_CODE=<mã website của bạn>
   VNPAY_HASH_SECRET=<chuỗi bí mật của bạn>
   # VNPAY_PAY_URL và VNPAY_RETURN_URL để trống: mặc định là sandbox và
   # <PUBLIC_URL>/payment/result
   ```

3. `docker compose up -d --build`, rồi kiểm tra bản tóm tắt cấu hình: `Web address` và `return URL` phải là địa chỉ tunnel.

4. Trong trang quản trị merchant của VNPay, khai IPN URL:

   ```text
   https://abc-def.trycloudflare.com/api/payments/vnpay/ipn
   ```

5. Mở web **bằng địa chỉ tunnel**, đăng nhập, đặt phòng và thanh toán. Phải bắt đầu từ địa chỉ tunnel vì VNPay sẽ trả bạn về đó, và phiên đăng nhập gắn với địa chỉ.

Địa chỉ `trycloudflare.com` đổi mỗi lần chạy lại tunnel: cập nhật `PUBLIC_URL`, IPN URL ở VNPay, rồi khởi động lại.

Nếu VNPay báo **"Website này chưa được phê duyệt"**: đường dẫn thanh toán đã tới được VNPay nhưng merchant (mã `VNPAY_TMN_CODE`) chưa được VNPay kích hoạt. Đây là trạng thái phía VNPay, không sửa được bằng cấu hình ở đây; liên hệ VNPay để kích hoạt.

Không cần tài khoản VNPay để kiểm tra phần xử lý của ứng dụng: `npm run test:integration` giả lập các lệnh gọi IPN của VNPay (thành công, sai chữ ký, sai số tiền, thanh toán lỗi, gửi lặp, tiền về sau khi booking hết hạn) trên PostgreSQL thật.
