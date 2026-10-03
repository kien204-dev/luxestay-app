# Chế độ demo

Dành cho một bản chạy công khai để khách tiềm năng tự trải nghiệm (ví dụ trang giới thiệu sản phẩm). **Không bật trên trang của cơ sở lưu trú thật.**

```dotenv
DEMO_MODE=true
DEMO_RESET_INTERVAL_HOURS=24   # tuỳ chọn: API tự đặt lại dữ liệu mỗi 24 giờ
```

Khi bật:

- Trang đăng nhập hiện sẵn hai tài khoản mẫu (quản trị và khách) kèm mật khẩu. Tài khoản quản trị mẫu không bị buộc đổi mật khẩu.
- Trang quản trị có dải thông báo "Bản demo".
- Hai tài khoản mẫu **không** được: xóa bất cứ thứ gì; thêm/sửa/khóa người dùng; đổi thông tin, logo, ảnh nền của cơ sở lưu trú; đổi ảnh điểm đến; sửa phòng có sẵn hoặc thêm ảnh phụ; đổi mật khẩu, email hay hồ sơ của chính mình. Thử làm sẽ nhận thông báo "Tài khoản demo không được thay đổi dữ liệu này."
- Vẫn được: xem mọi trang, đặt phòng, thanh toán thử, đặt phòng tại quầy, ghi nhận thu tiền, đổi trạng thái đơn, tạo mã giảm giá, thêm phòng mới, tải ảnh lên, xuất báo cáo.

## Đặt lại dữ liệu

```bash
docker compose exec api npm run demo:reset   # Docker
npm run demo:reset                           # chạy thủ công
```

Lệnh xoá toàn bộ bảng, tạo lại, nạp lại dữ liệu mẫu và xoá ảnh khách đã tải lên (ảnh mẫu `seed-*` được giữ). Chỉ chạy khi `DEMO_MODE=true`. Mất khoảng 1 giây; trong lúc đó trang có thể báo lỗi tạm thời.

Đặt lịch, chọn một trong hai:

- `DEMO_RESET_INTERVAL_HOURS` như trên (đếm từ lúc API khởi động).
- Lịch của hệ điều hành, ví dụ cron chạy 3 giờ sáng mỗi ngày:

  ```cron
  0 3 * * * cd /srv/luxestay && docker compose exec -T api npm run demo:reset >> /var/log/luxestay-demo-reset.log 2>&1
  ```

  Windows: Task Scheduler chạy `docker compose exec -T api npm run demo:reset` trong thư mục dự án.
