# Tuỳ biến: thương hiệu, màu, ngôn ngữ, ảnh

## Tên, logo, liên hệ, quy định

Đăng nhập quản trị → **Cơ sở lưu trú** (`/admin/property`): tên, logo, ảnh nền trang chủ, điện thoại, email, địa chỉ, giờ nhận/trả phòng, số ngày được hủy miễn phí. Lưu xong là trang khách, email gửi khách và phiếu PDF dùng ngay, không cần build lại. Biến môi trường (`APP_NAME`, `CONTACT_*`, ...) chỉ là giá trị khởi đầu — xem [configuration.md](configuration.md#thông-tin-cơ-sở-lưu-trú).

Logo và ảnh tải lên được tự xử lý: xoay đúng chiều theo EXIF, xoá thông tin máy ảnh và vị trí GPS, thu nhỏ, lưu WebP. Logo có thêm một bản PNG để in vào phiếu PDF.

## Màu (theme)

Toàn bộ màu của trang khách và trang quản trị lấy từ **hai biến** ở đầu `apps/web/src/index.css`:

```css
:root {
  --brand-primary: #002366;  /* màu chính: nút, tiêu đề, nền trang quản trị (bản tối) */
  --brand-accent: #c5a059;   /* màu nhấn: nút tìm phòng, điểm nhấn trang quản trị */
}
```

Đổi hai giá trị này rồi build lại web (`docker compose up -d --build`, hoặc `npm run build`). Các màu khác (nền tối của trang quản trị, viền, nền nhạt, màu biểu đồ, favicon, hình vẽ thay ảnh) đều được tính từ hai biến này. Màu báo trạng thái (xanh = thành công, đỏ = lỗi, vàng = chờ) là màu chung, không đổi theo thương hiệu.

Gợi ý: màu chính nên đủ đậm để chữ trắng trên nó dễ đọc (tương phản ≥ 4.5:1); màu nhấn nên sáng để nổi trên nền tối.

`npm run lint` có bước **kiểm tra màu**: báo lỗi nếu ai đó viết thẳng mã màu vào code React thay vì dùng biến. Màu của thương hiệu bên thứ ba (logo Google, nút MoMo) được đánh dấu `theme-ignore`.

Email gửi khách và phiếu PDF dùng một bộ màu cố định (xanh đậm) chứ chưa theo theme.

Font: `--font-serif` (tiêu đề) và `--font-sans` (nội dung) ở cùng file. Chỉ dùng font có sẵn trên máy, không tải font từ mạng.

## Ngôn ngữ

Bản dịch nằm ở `apps/web/src/locales/<mã ngôn ngữ>/<nhóm>.json`, ví dụ `vi/orders.json`, `en/orders.json`. Mỗi file là một nhóm (trang khách `site`, đăng nhập `auth`, quản trị `admin`, `orders`, `rooms`, ...). Thông báo từ API được dịch theo mã trong `errors.json`.

Sửa một câu: tìm câu đó trong thư mục `locales/vi` (hoặc `en`), sửa, build lại.

Ngôn ngữ khách thấy lần đầu: `DEFAULT_LANGUAGE` (`vi` hoặc `en`) trong `.env`. Khách đổi được bằng nút VI/EN ở đầu trang; lựa chọn được nhớ trên trình duyệt.

### Thêm một ngôn ngữ (ví dụ tiếng Hàn `ko`)

1. Chép thư mục `apps/web/src/locales/en` thành `apps/web/src/locales/ko` và dịch mọi giá trị (giữ nguyên khoá và các chỗ `{{...}}`).
2. Thêm `"ko"` vào `SUPPORTED_LANGUAGES` trong `apps/web/src/config/brand.js`. Nút chọn ngôn ngữ tự hiện thêm `KO`.
3. Chạy `npm run lint`: bước kiểm tra bản dịch báo mọi khoá còn thiếu so với `vi`/`en`.
4. Email gửi khách và phiếu PDF (phía API) hiện có `vi` và `en`, ở `apps/api/src/services/bookingEmails.js` và `bookingReceipt.js`; khách dùng ngôn ngữ khác sẽ nhận bản `vi` cho tới khi bạn thêm vào hai file đó.

Bước kiểm tra bản dịch (`scripts/check-i18n.mjs`) cũng báo câu tiếng Việt viết thẳng vào code: mọi chữ hiển thị phải đi qua file ngôn ngữ.

## Ảnh

| Ảnh | Đổi ở đâu |
|---|---|
| Logo | `/admin/property` |
| Ảnh nền trang chủ | `/admin/property`, hoặc đặt sẵn trong `apps/api/seed-assets/hero/` trước khi seed |
| Ảnh điểm đến (thẻ "Điểm đến" ở trang chủ) | `/admin/destinations`; kèm ghi công nếu ảnh theo giấy phép CC BY / CC BY-SA |
| Ảnh phòng | `/admin/rooms` → Sửa phòng |
| Ảnh phòng mẫu khi seed | `apps/api/seed-assets/rooms/` |

Ảnh tải lên tối đa 10 MB (JPG, PNG, WebP). Ảnh mẫu đi kèm theo giấy phép riêng: xem [README](../README.md#ảnh-mẫu--giấy-phép).
