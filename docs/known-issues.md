# Vấn đề đã biết

Cập nhật: 2026-10-01.

## Các trang quản trị còn lớn

Trang phía khách đã được tách nhỏ (không file nào trên 400 dòng). Các trang quản trị thì chưa: `Users` (~1.300 dòng), `Rooms` (~1.100), `Dashboard` (~1.000), `Orders` (~840), `Settings` (~710), `Coupons` (~620), `Calendar` (~510). Chúng hoạt động bình thường; việc tách là để dễ bảo trì và sẽ làm cùng lúc với việc dịch các trang này (Giai đoạn 5).

## Cảnh báo `npm audit`

Còn 4 mục, tất cả mức **high**, cùng một gốc: `@grpc/grpc-js` bản 1.9.x do gói `firebase` (phía web) kéo theo.

| Gói bị báo | Mức | Vì sao có mặt | Có nằm trên đường chạy production không |
|---|---|---|---|
| `@grpc/grpc-js` ≤ 1.13.5 | high | Phụ thuộc của `@firebase/firestore` | **Không.** Đây là thư viện chỉ chạy trên Node; không có trong bundle của trình duyệt (đã kiểm tra `apps/web/dist`). |
| `@firebase/firestore` | high | Nằm trong gói `firebase` | **Không.** Ứng dụng chỉ import `firebase/app` và `firebase/auth`; Firestore không được import ở đâu. |
| `@firebase/firestore-compat` | high | Nằm trong gói `firebase` | **Không.** Như trên. |
| `firebase` | high | Dependency trực tiếp của `apps/web`, dùng cho đăng nhập Google | Chỉ phần Auth được đóng gói, và chỉ được dùng khi bật đăng nhập Google. Phần bị báo lỗi (Firestore) không được đóng gói. |

Vì sao chưa sửa: `@firebase/firestore` ghim `@grpc/grpc-js` ở `~1.9.0`, nên chỉ hết cảnh báo khi Firebase phát hành bản dùng grpc mới hơn. Cách `npm audit fix --force` đề xuất là hạ `firebase` xuống 9.14 — một bước lùi nhiều phiên bản, không nên làm.

Đã xử lý trong đợt này:

- `nodemailer` 9 → 10.0.13 (high; nằm trên đường chạy khi dùng email quên mật khẩu).
- `uuid` được ép lên 11.1.1 qua `overrides` trong `package.json` gốc, xoá 3 cảnh báo moderate (`uuid`, `exceljs`, `gaxios`). `exceljs` nằm trên đường chạy (xuất báo cáo Excel); test xuất báo cáo vẫn đạt với bản `uuid` mới.
- `firebase-admin` (phía API) giờ chỉ được nạp ở lần đăng nhập Google đầu tiên. Cài đặt không bật đăng nhập Google sẽ không nạp SDK này lúc chạy.

## Khác

- **Ảnh phòng mẫu chưa có**: `apps/api/seed-assets/rooms/` đang trống, nên phòng mẫu hiện hình vẽ thay thế. Bỏ ảnh vào thư mục đó rồi chạy lại `npm run db:seed` là phòng mẫu có ảnh.
- **Ngôn ngữ mặc định** (`DEFAULT_LANGUAGE`) vẫn là biến môi trường, đổi xong phải build lại web. Các thông tin khác của cơ sở lưu trú đã sửa được ở `/admin/property`.
- **Trang Users vẫn tải toàn bộ danh sách** rồi phân trang trên trình duyệt. Orders đã phân trang ở máy chủ; Users sẽ làm cùng lúc với việc tách trang này (Giai đoạn 5).
- **Booking tự hủy vì quá hạn thanh toán không gửi email** cho khách (hủy bởi khách hoặc quản trị thì có).
- **Booking tại quầy không có email khách** thì không có thư nào được gửi; lễ tân tải PDF xác nhận ở trang Orders để in.
- **PDF xác nhận chỉ in logo dạng PNG/JPEG lưu trên đĩa của API**. Logo WebP, hoặc logo lưu trên S3, vẫn hiện trên web nhưng không có trong PDF; phần còn lại của PDF không đổi.
- **`db:seed` luôn chép ảnh mẫu vào đĩa của API**, kể cả khi `STORAGE_DRIVER=s3`.
- **`uploads:prune` chỉ dọn thư mục trên đĩa**; với S3 dùng lifecycle rule của bucket.
- **Ảnh điểm đến chỉ có cho 12 tỉnh/thành của dữ liệu mẫu.** Với `db:seed -- --all-rooms` (34 tỉnh/thành) hoặc dữ liệu thật, các điểm đến khác dùng ảnh phòng đầu tiên ở đó, không có thì dùng hình vẽ; quản trị đặt ảnh ở `/admin/destinations`.
- **Ảnh điểm đến và ảnh nền tối đa 2 MB** (cùng giới hạn với mọi ảnh tải lên); trang không tự nén hay đổi kích thước ảnh tải lên.
- **Trang chủ chỉ hiện 8 điểm đến nhiều phòng nhất**; 4 ảnh còn lại của dữ liệu mẫu (Quảng Ninh, Huế, Ninh Bình, Gia Lai) chỉ thấy ở `/credits` và khi dữ liệu thay đổi.
- **Đánh giá trên thẻ phòng** được tải riêng cho từng phòng (mỗi thẻ một yêu cầu). Với 12 phòng mỗi trang thì không đáng kể; nếu tăng số phòng mỗi trang nên gộp vào truy vấn danh sách.

- **VNPay sandbox chưa chạy trọn vòng với cổng thật: chờ VNPay kích hoạt merchant.** Đường dẫn thanh toán tạo ra hợp lệ nhưng sandbox trả lời "Website này chưa được phê duyệt" với cả hai tài khoản đã thử, kể cả khi địa chỉ trả về là tên miền đã đăng ký; đây là trạng thái merchant phía VNPay. Phần xử lý của ứng dụng (ký, kiểm tra chữ ký và số tiền, xác nhận booking, gửi lặp, tiền về sau khi hết hạn) được kiểm chứng bằng IPN giả lập trong `npm run test:integration`. Việc còn lại khi merchant được kích hoạt: một giao dịch thật đi hết vòng tạo → trả → IPN → booking "đã xác nhận".
- **MoMo là bản beta**: chưa được kiểm chứng với tài khoản MoMo thật; tắt mặc định (`MOMO_ENABLED`).
- **Biểu đồ Dashboard theo giờ/ngày** dùng giờ của máy chủ cơ sở dữ liệu chứ chưa theo `APP_TIMEZONE`. (Số phòng đang có khách và doanh thu đã tính đúng: theo booking đã xác nhận phủ ngày hôm nay, và chỉ tính booking đã thanh toán.)
- **Migration 013 thêm ràng buộc chống trùng lịch**: nếu cơ sở dữ liệu cũ đã có hai booking đang hoạt động chồng ngày cho cùng một phòng, migration sẽ dừng với lỗi. Hủy một trong hai booking rồi chạy lại.
- **Cột `created_at` của users/rooms/bookings** là `TIMESTAMP` không kèm múi giờ, nên giờ tạo hiển thị có thể lệch theo múi giờ của cơ sở dữ liệu. Ngày nhận/trả phòng không bị ảnh hưởng.
- **Cấu hình Render/Vercel trong `DEPLOY.md`** chưa được chạy thử trên hai nền tảng đó.
- **Ảnh mặc định lưu trên đĩa của API**: nền tảng không có đĩa bền (ví dụ Render gói thường) sẽ mất ảnh sau mỗi lần triển khai; ở đó hãy đặt `STORAGE_DRIVER=s3`. Driver S3 được kiểm thử với máy chủ giả lập S3Mock, **chưa chạy thử với AWS S3 hay Cloudflare R2 thật**.
