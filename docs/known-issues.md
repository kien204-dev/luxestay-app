# Vấn đề đã biết

Cập nhật: 2026-10-12 (sau phiên bản 1.0.0-rc.2, nhánh thiết kế lại trang đăng nhập và tài khoản).

## Chưa kiểm chứng với dịch vụ thật

- **VNPay: chờ VNPay kích hoạt merchant sandbox.** Đường dẫn thanh toán tạo ra hợp lệ nhưng sandbox trả lời "Website này chưa được phê duyệt"; đây là trạng thái merchant phía VNPay. Phần xử lý của ứng dụng (ký, kiểm tra chữ ký và số tiền, xác nhận đặt phòng, IPN gửi lặp, tiền về sau khi hết hạn) được kiểm chứng bằng IPN giả lập trong `npm run test:integration`. Còn lại: một giao dịch thật đi hết vòng tạo → trả → IPN → "đã xác nhận".
- **MoMo là bản beta**: chưa thử với tài khoản MoMo thật; tắt mặc định (`MOMO_ENABLED`).
- **Lưu ảnh trên S3 là bản beta**: kiểm thử với máy chủ giả lập S3Mock, chưa chạy với AWS S3 hay Cloudflare R2 thật.
- **Cấu hình Render/Vercel trong `DEPLOY.md`** chưa được chạy thử trên hai nền tảng đó.

## Giới hạn hiện tại

- **Email gửi khách và phiếu PDF có `vi` và `en`**, dùng bộ màu cố định (không theo theme). Thêm ngôn ngữ thứ ba cho trang web thì email/PDF vẫn ra tiếng Việt cho tới khi bổ sung (xem [customization.md](customization.md#thêm-một-ngôn-ngữ-ví-dụ-tiếng-hàn-ko)).
- **Ngôn ngữ mặc định** (`DEFAULT_LANGUAGE`) là biến môi trường; đổi xong phải build lại web.
- **Đặt phòng tại quầy không có email khách** thì không có thư nào được gửi; lễ tân tải PDF xác nhận ở trang Đặt phòng để in.
- **`db:seed` luôn chép ảnh mẫu vào đĩa của API**, kể cả khi `STORAGE_DRIVER=s3`; `uploads:prune` và `demo:reset` cũng chỉ dọn ảnh trên đĩa (với S3 dùng lifecycle rule của bucket).
- **Ảnh điểm đến chỉ có cho 12 tỉnh/thành của dữ liệu mẫu.** Điểm đến khác dùng ảnh phòng đầu tiên ở đó, không có thì dùng hình vẽ; đặt ảnh ở `/admin/destinations`. Trang chủ hiện 8 điểm đến nhiều phòng nhất.
- **Ảnh đã lưu trước bản này** (trước khi có xử lý ảnh phía máy chủ) không được xử lý lại: chúng giữ định dạng và metadata cũ cho tới khi được tải lên lại.
- **`demo:reset` xoá và tạo lại toàn bộ bảng** trong khoảng 1 giây; người đang dùng trang lúc đó có thể gặp lỗi tạm thời.
- **Đánh giá trên thẻ phòng** được tải riêng cho từng phòng (mỗi thẻ một yêu cầu). Với 12 phòng mỗi trang thì không đáng kể.
- **Lọc theo loại phòng so khớp đúng tên loại** (không phân biệt hoa thường): "Deluxe" và "Phòng Deluxe" là hai loại. Đặt tên loại nhất quán ở form phòng.
- **Đăng nhập Google: console của trình duyệt vẫn ghi `Cross-Origin-Opener-Policy policy would block the window.closed call`** trong lúc cửa sổ Google đang mở. Dòng này do chính trang đăng nhập của Google gây ra (`accounts.google.com` gửi `Cross-Origin-Opener-Policy: same-origin`, nên Firebase không hỏi được cửa sổ đó đã đóng chưa); header của trang web (`same-origin-allow-popups`) đã đúng và không thể tắt cảnh báo từ phía mình. Đăng nhập vẫn hoàn tất bình thường. Muốn hết hẳn phải bỏ cách đăng nhập bằng popup (chuyển sang chuyển hướng cả trang hoặc Google Identity Services).
- **Liên kết Google với tài khoản có mật khẩu chưa có bước xác nhận bằng mật khẩu.** Lần đăng nhập Google đầu tiên bằng email trùng với một tài khoản khách có sẵn sẽ tự liên kết hai tài khoản (Google đã xác minh email đó). Sau khi đã liên kết, chỉ đúng tài khoản Google đó vào được. Dự kiến sau v1: việc liên kết chỉ làm từ trang Tài khoản, khi đang đăng nhập và nhập lại mật khẩu.
- **Tài khoản quản trị không đăng nhập được bằng Google**, kể cả khi đã liên kết: chỉ dùng mật khẩu. Quản trị viên trước giờ chỉ dùng Google lấy mật khẩu tạm bằng `npm run admin:reset -- --email <email>` ([installation.md](installation.md#quên-mật-khẩu-admin--bị-khoá-ngoài)). Khi đăng nhập Google được bật, trang đăng nhập hiện nút Google cho mọi người (trang không biết trước ai là quản trị viên); quản trị viên bấm vào sẽ nhận thông báo ngay trên form, kèm email Google vừa chọn, hướng dẫn dùng mật khẩu.
- **Mã nguồn chưa dùng TypeScript** (dự kiến Giai đoạn 6).
- **Chưa có "Hoàn tác" sau khi xóa** (bản thiết kế có nút hoàn tác 10 giây trên toast). Xóa phòng, đơn đặt phòng hay ảnh ở API là xóa thật ngay (kèm ảnh trên đĩa, thanh toán và đánh giá liên quan), nên không hoàn tác an toàn được nếu chưa chuyển sang xóa mềm. Thay vào đó hộp xác nhận nêu rõ "không thể hoàn tác" và hai thao tác xóa nặng nhất yêu cầu gõ mã.
- **Trang phòng so với bản thiết kế**: chưa có diện tích, loại giường, giá theo từng ngày trên lịch, lịch hai tháng, nút Chia sẻ / Lưu, chú thích từng ảnh, lọc theo tiện ích, kiểu xem Danh sách: hệ thống chưa có dữ liệu hoặc tính năng tương ứng. Tiện nghi là danh sách chữ do admin nhập, dùng chung một biểu tượng.
- **Luồng đặt phòng so với bản thiết kế**: không có "Giá thành viên", danh sách "Mã dành cho bạn", giờ đến dự kiến, yêu cầu đặc biệt, thanh toán tại khách sạn, giá từng ngày trên lịch, "Thêm vào lịch", lời nhắn về quản gia: hệ thống chưa có dữ liệu hoặc tính năng tương ứng. Chính sách hủy chỉ có hai mốc đúng với cách API xử lý (trong hạn: hoàn toàn bộ; quá hạn: không tự hủy trực tuyến), không có mốc "hoàn 50%".
- **Phòng chỉ được giữ từ bước cuối của luồng đặt phòng** (khi đặt phòng được tạo), không phải từ lúc bắt đầu chọn ngày: trong lúc khách đi qua các bước, người khác vẫn có thể đặt trước. Khi đó trang báo "phòng vừa có người đặt" và giữ nguyên dữ liệu đã nhập.
- **Lý do thanh toán thất bại** chỉ được diễn giải cho các mã phổ biến của VNPay; mã khác (và MoMo) hiện câu chung kèm mã của cổng.
- **Chế độ demo không tự thay cổng thanh toán**: muốn bản demo không động tới tiền thật thì để VNPay ở sandbox và MoMo tắt hoặc ở môi trường test (mặc định là vậy); khi đó dải demo mới ghi "Không có tiền thật nào bị trừ".
- **Trang chủ chưa có khối "Trải nghiệm"** như trong bản thiết kế: hệ thống chưa có dữ liệu cho hoạt động/dịch vụ kèm giá và thời lượng. Ý tưởng cho sau: một danh sách trải nghiệm do admin quản lý (ảnh, tên, mô tả, giá, thời lượng). Cũng chưa làm vì cùng lý do: form đăng ký nhận ưu đãi qua email ở cuối trang, bản đồ ở khối "Vị trí" (hiện chỉ có địa chỉ, danh sách điểm lân cận và nút mở Google Maps), điểm đánh giá theo từng tiêu chí, nút lưu phòng yêu thích.
- **Nội dung trang chủ do admin nhập chỉ có một bản** (tiêu đề, mô tả, tiện ích, điểm lân cận): khách xem tiếng Anh thấy đúng câu admin đã nhập. Câu mặc định khi để trống thì có bản vi/en.
- **Email và phiếu PDF không theo giao diện sáng/tối.** Favicon và hình vẽ thay ảnh luôn vẽ theo bộ màu sáng.
- **Khối "Tiện ích" dùng lại ảnh nền trang chủ** (như bản thiết kế); chưa có ô tải ảnh riêng cho khối này.
- **Trang đăng nhập, tài khoản và trang phụ so với bản thiết kế**: không có "Ghi nhớ đăng nhập" (phiên luôn kéo dài theo `AUTH_TOKEN_TTL`), "giá thành viên", ô đồng ý Điều khoản / Chính sách (chưa có hai trang đó), ngày sinh, quốc tịch, "Đã xác minh", nhận ưu đãi qua email, "còn N lần thử", "lần đổi gần nhất", "Câu hỏi thường gặp", "Yêu cầu quyền truy cập", lọc ảnh theo loại ở trang ghi công: hệ thống chưa có dữ liệu hoặc tính năng tương ứng. Email vẫn đổi được ở trang Tài khoản (API cho phép), không khoá như bản thiết kế. Ô số điện thoại không có tiền tố +84 (số lưu dạng tự do, 8–20 ký tự). Ảnh đại diện tối đa 10 MB (giới hạn thật của pipeline ảnh), không phải 5 MB.
- **Nút "Gửi lại email" chỉ đếm ngược khi đã hết lượt** theo giới hạn của API (5 email mỗi giờ cho mỗi địa chỉ IP); trước đó bấm được ngay. Nếu có proxy bỏ mất header `RateLimit`, nút luôn bấm được và API vẫn từ chối khi quá giới hạn.
- **Các trang đăng nhập chờ `/api/settings/public` trả lời rồi mới vẽ** (để dải demo và nút Google không đẩy trang): nếu API chậm, trang trống thêm chừng đó thời gian. Trang khách khác (trang chủ, danh sách phòng) vẫn vẽ ngay và dải demo vẫn có thể đẩy trang xuống khi API trả lời chậm.
- **Ô ngày ở thanh tìm phòng là ô ngày của trình duyệt**, nên định dạng ngày theo ngôn ngữ của trình duyệt, không phải theo nút VI/EN.

## Mã đặt phòng

Một định dạng ở mọi nơi: `#BK-0012` (số đặt phòng, đủ 4 chữ số; từ 10000 trở đi thì dài thêm, ví dụ `#BK-12345`). Dùng trên thẻ ở Đặt phòng của tôi, trang kết quả thanh toán, các hộp thoại, trang quản trị, thông báo trực tiếp cho admin, email khách, email cảnh báo admin và phiếu PDF. Ở chỗ không hợp ký tự `#` thì bỏ nó đi: tên tệp PDF (`booking-BK-0012.pdf`) và mã phải gõ để xác nhận xoá đơn (`BK-0012`, trước đây là `BOOKING-12`). Định dạng nằm ở một chỗ cho mỗi phía: `apps/api/src/utils/bookingCode.js` và `apps/web/src/utils/bookingCode.js`.

Ngoại lệ duy nhất: dòng mô tả gửi sang cổng thanh toán (khách thấy ở trang VNPay/MoMo) vẫn là `Thanh toan dat phong 12`, vì VNPay chỉ nhận chữ không dấu, chữ số và dấu cách (không có `#` hay `-`).

Mã này chỉ là số đặt phòng được trình bày lại, nên đoán được (số liền nhau); mọi trang và API vẫn kiểm tra quyền theo tài khoản, không dựa vào việc mã khó đoán.

## Cơ sở dữ liệu

- **Migration 013 thêm ràng buộc chống trùng lịch**: nếu cơ sở dữ liệu cũ đã có hai đặt phòng đang hoạt động chồng ngày cho cùng một phòng, migration sẽ dừng với lỗi. Hủy một trong hai rồi chạy lại.
- **Cột `created_at`** của users/rooms/bookings là `TIMESTAMP` không kèm múi giờ. Báo cáo Dashboard đọc nó theo múi giờ phiên của cơ sở dữ liệu rồi đổi sang `APP_TIMEZONE`, nên số liệu đúng; chỉ cần đừng đổi múi giờ mặc định của PostgreSQL sau khi đã có dữ liệu.

## Cảnh báo `npm audit`

Kiểm tra lại ngày 2026-10-05: `npm audit` báo 7 mục mức **high** từ hai gốc, không mục nào nằm trên đường chạy production. Hai gói thêm ở bản này cho việc kiểm tra mã (`eslint-plugin-react`, `playwright-core`, đều chỉ dùng khi phát triển) không thêm cảnh báo nào: danh sách giống hệt trước khi thêm.

**Gốc 1 (4 mục, `npm audit --omit=dev` vẫn báo):** `@grpc/grpc-js` bản 1.9.x do gói `firebase` (phía web) kéo theo.

| Gói bị báo | Vì sao có mặt | Có nằm trên đường chạy production không |
|---|---|---|
| `@grpc/grpc-js` ≤ 1.13.5 | Phụ thuộc của `@firebase/firestore` | **Không.** Thư viện chỉ chạy trên Node; không có trong bundle trình duyệt. |
| `@firebase/firestore`, `@firebase/firestore-compat` | Nằm trong gói `firebase` | **Không.** Ứng dụng chỉ import `firebase/app` và `firebase/auth`. |
| `firebase` | Dùng cho đăng nhập Google | Chỉ phần Auth được đóng gói, và chỉ dùng khi bật đăng nhập Google. |

`@firebase/firestore` ghim `@grpc/grpc-js` ở `~1.9.0`, nên chỉ hết cảnh báo khi Firebase phát hành bản mới; `npm audit fix --force` sẽ hạ `firebase` xuống 9.14, không nên làm.

**Gốc 2 (3 mục, chỉ khi phát triển):** `braces` (lỗi làm treo khi gặp mẫu lồng nhau rất sâu, chưa có bản vá) qua `chokidar` của `nodemon`, công cụ tự khởi động lại API cho `npm run dev`. Không được cài trong image Docker (`npm ci --omit=dev`) và không chạy ở production. `npm audit fix --force` sẽ hạ `nodemon` xuống 1.14, không nên làm; cách dứt điểm là thay `nodemon` bằng `node --watch` có sẵn trong Node 22, dự kiến làm sau các bản rc.

API dùng `firebase-admin`, gói này kéo theo `@grpc/grpc-js` 1.14.5, không thuộc dải bị báo.

`sharp` (xử lý ảnh tải lên) đã được nâng lên 0.35.5 để tránh các lỗ hổng libvips/libheif có trong 0.34.
