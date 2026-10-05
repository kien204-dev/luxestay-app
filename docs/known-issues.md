# Vấn đề đã biết

Cập nhật: 2026-10-03 (phiên bản 1.0.0-beta.3).

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
- **Đăng nhập Google: console của trình duyệt vẫn ghi `Cross-Origin-Opener-Policy policy would block the window.closed call`** trong lúc cửa sổ Google đang mở. Dòng này do chính trang đăng nhập của Google gây ra (`accounts.google.com` gửi `Cross-Origin-Opener-Policy: same-origin`, nên Firebase không hỏi được cửa sổ đó đã đóng chưa); header của trang web (`same-origin-allow-popups`) đã đúng và không thể tắt cảnh báo từ phía mình. Đăng nhập vẫn hoàn tất bình thường. Muốn hết hẳn phải bỏ cách đăng nhập bằng popup (chuyển sang chuyển hướng cả trang hoặc Google Identity Services).
- **Mã nguồn chưa dùng TypeScript** (dự kiến Giai đoạn 6).

## Cơ sở dữ liệu

- **Migration 013 thêm ràng buộc chống trùng lịch**: nếu cơ sở dữ liệu cũ đã có hai đặt phòng đang hoạt động chồng ngày cho cùng một phòng, migration sẽ dừng với lỗi. Hủy một trong hai rồi chạy lại.
- **Cột `created_at`** của users/rooms/bookings là `TIMESTAMP` không kèm múi giờ. Báo cáo Dashboard đọc nó theo múi giờ phiên của cơ sở dữ liệu rồi đổi sang `APP_TIMEZONE`, nên số liệu đúng; chỉ cần đừng đổi múi giờ mặc định của PostgreSQL sau khi đã có dữ liệu.

## Cảnh báo `npm audit`

Còn 4 mục mức **high**, cùng một gốc: `@grpc/grpc-js` bản 1.9.x do gói `firebase` (phía web) kéo theo.

| Gói bị báo | Vì sao có mặt | Có nằm trên đường chạy production không |
|---|---|---|
| `@grpc/grpc-js` ≤ 1.13.5 | Phụ thuộc của `@firebase/firestore` | **Không.** Thư viện chỉ chạy trên Node; không có trong bundle trình duyệt. |
| `@firebase/firestore`, `@firebase/firestore-compat` | Nằm trong gói `firebase` | **Không.** Ứng dụng chỉ import `firebase/app` và `firebase/auth`. |
| `firebase` | Dùng cho đăng nhập Google | Chỉ phần Auth được đóng gói, và chỉ dùng khi bật đăng nhập Google. |

`@firebase/firestore` ghim `@grpc/grpc-js` ở `~1.9.0`, nên chỉ hết cảnh báo khi Firebase phát hành bản mới; `npm audit fix --force` sẽ hạ `firebase` xuống 9.14, không nên làm.

`sharp` (xử lý ảnh tải lên) đã được nâng lên 0.35.5 để tránh các lỗ hổng libvips/libheif có trong 0.34.
