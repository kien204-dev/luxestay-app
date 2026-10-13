# Bàn giao thiết kế: Admin phần 1 (đợt 5a)

Nguồn: canvas Claude Design "LuxeStay — Thiết kế giao diện", xuất ngày 2026-10-12.

Màn chính (file lớn):
- AdminShell.dc.html + AdminSidebar.dc.html + AdminTopbar.dc.html — khung admin (desktop, tablet thu gọn), menu nhóm,
  thông báo đơn mới, menu tài khoản, nút đổi sáng/tối, dải demo
- AdminDashboard.dc.html — state = ready | loading | empty | error; period (7 ngày / 30 ngày / tuỳ chọn); collapsed (tablet)
- AdminBookings.dc.html — danh sách đơn; modal = collect (đã thu tiền) | refund (xác nhận hoàn tiền) | counter (đặt tại quầy) |
  detail (ngăn kéo chi tiết đơn); toast; state; collapsed
- AdminCalendar.dc.html — lịch phòng; state; collapsed
- AdminMobile.dc.html — admin trên điện thoại 390px: screen = dashboard | bookings | detail | menu; state; toast; theme

Dùng chung: DemoMode.dc.html (dải demo admin), Patterns.dc.html (toast, hộp xác nhận xoá).
Các file nhỏ còn lại là biến thể (tablet, mobile, tối, trạng thái).
CSS tham khảo: pages.css, luxestay.css, ds-bundle.css (không chép nguyên). tokens.json giống các đợt trước.

Ảnh (/_blob/...) KHÔNG đi kèm. Mọi tên nhân viên ("Trần Thu Hà", "Quản lý lễ tân"), số liệu KPI, doanh thu, công suất,
mã đơn LXS-…, tên khách, "68 phòng", nút "Đổi cơ sở lưu trú", "Cài đặt thông báo", tab "Hoạt động", ô tìm Ctrl K
là NỘI DUNG MINH HOẠ hoặc tính năng chưa có, không đưa vào code.
