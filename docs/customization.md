# Tuỳ biến: thương hiệu, màu, ngôn ngữ, ảnh

## Tên, logo, liên hệ, quy định

Đăng nhập quản trị → **Cơ sở lưu trú** (`/admin/property`): tên, logo, ảnh nền trang chủ, nội dung trang chủ, điện thoại, email, địa chỉ, giờ nhận/trả phòng, số ngày được hủy miễn phí. Lưu xong là trang khách, email gửi khách và phiếu PDF dùng ngay, không cần build lại. Biến môi trường (`APP_NAME`, `CONTACT_*`, ...) chỉ là giá trị khởi đầu — xem [configuration.md](configuration.md#thông-tin-cơ-sở-lưu-trú).

Logo và ảnh tải lên được tự xử lý: xoay đúng chiều theo EXIF, xoá thông tin máy ảnh và vị trí GPS, thu nhỏ, lưu WebP. Logo có thêm một bản PNG để in vào phiếu PDF.

### Nội dung trang chủ

Cũng ở trang **Cơ sở lưu trú**, phần **Nội dung trang chủ**:

| Ô | Hiện ở đâu | Để trống thì |
|---|---|---|
| Tiêu đề, Mô tả dưới tiêu đề | Đầu trang chủ, trên ảnh nền | Dùng câu mặc định (có bản vi/en) |
| Tiện ích (tên + mô tả ngắn, tối đa 12 dòng) | Khối "Tiện ích" | Khối không hiện |
| Điểm lân cận (tên, ghi chú, khoảng cách; tối đa 8 dòng) | Khối "Vị trí", cùng địa chỉ | Khối không hiện |

Các ô này chỉ có một bản: nội dung bạn nhập hiện nguyên văn ở mọi ngôn ngữ (giống tên và mô tả phòng). Những khối còn lại của trang chủ lấy từ dữ liệu: "Phòng nổi bật" là ba phòng mới nhất đang nhận khách, "Điểm đến" từ địa chỉ các phòng, điểm đánh giá và "Khách nói gì" từ đánh giá thật của khách (đánh giá từ 4 sao, có nội dung, không bị ẩn). Chưa có dữ liệu thì khối tương ứng không hiện.

## Màu (theme)

Toàn bộ màu của trang khách, trang quản trị, biểu đồ, favicon và hình vẽ thay ảnh lấy từ **bộ token** ở đầu `apps/web/src/index.css`. Có hai bộ, sáng (`:root, .theme-light`) và tối (`:root[data-theme="dark"], .theme-dark`), cùng tên biến.

Đổi màu thương hiệu: sửa bốn dòng accent **ở cả hai bộ** rồi build lại web (`docker compose up -d --build`, hoặc `npm run build`):

```css
--accent: #2e4a3c;        /* nút chính, ngày đang chọn, trạng thái được chọn */
--accent-hover: #233a2f;  /* khi rê chuột / nhấn */
--accent-soft: #e2e8df;   /* nền nhạt: khoảng ngày đã chọn, dòng được chọn */
--on-accent: #f7f3ec;     /* chữ và biểu tượng nằm trên accent */
```

Ví dụ một bộ xanh navy: sáng `#24384f` / `#1a2b3e` / `#e1e7ee` / `#f5f3ef`; tối `#a9bfd8` / `#bdd0e5` / `#1b2633` / `#111a24`. Ở bộ tối accent là màu sáng nên `--on-accent` là màu đậm. Giữ tương phản chữ/nền ≥ 4.5:1 (`--on-accent` trên `--accent`, `--accent` trên `--canvas` và `--surface`).

`--brass` / `--brass-soft` là màu phụ (sao đánh giá, nhãn nhỏ phía trên tiêu đề), không dùng cho nút. Màu báo trạng thái (`--success`, `--warning`, `--danger`, `--info`) là màu chung, không đổi theo thương hiệu. Các tên biến cũ (`--brand-primary`, `--color-navy-*`, `--color-gold-*`...) vẫn còn và trỏ vào token mới.

### Sáng / tối

Trang khách theo cài đặt sáng/tối của máy khách; nút mặt trời/mặt trăng ở đầu trang đổi qua lại và lựa chọn được nhớ trên trình duyệt đó. Trang quản trị luôn dùng bộ tối. Muốn một vùng luôn sáng hoặc luôn tối, gắn class `theme-light` / `theme-dark` cho phần tử bao ngoài.

`npm run lint` có bước **kiểm tra màu**: báo lỗi nếu ai đó viết thẳng mã màu vào code React thay vì dùng biến. Màu của thương hiệu bên thứ ba (logo Google, nút MoMo) được đánh dấu `theme-ignore`.

Email gửi khách và phiếu PDF dùng một bộ màu cố định (xanh đậm) chứ chưa theo theme.

### Font

Tiêu đề dùng **Cormorant Garamond**, nội dung dùng **Be Vietnam Pro** (`--font-serif`, `--font-sans` ở cùng file). File font nằm trong `apps/web/src/assets/fonts/` và được phục vụ từ chính trang web, không gọi Google Fonts hay máy chủ nào khác; giấy phép SIL OFL 1.1 ở `OFL.txt` cùng thư mục. Đổi font: thay file `.woff2`, sửa các khối `@font-face` và hai biến trên; font phải có đủ dấu tiếng Việt.

Cùng file còn có thang khoảng cách (`--space-1` … `--space-10`), bo góc (`--radius-xs` … `--radius-pill`) và đổ bóng (`--shadow-sm`, `-md`, `-lg`).

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
