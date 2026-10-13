# Bàn giao thiết kế: Admin phần 2 (đợt 5b)

Nguồn: canvas Claude Design "LuxeStay — Thiết kế giao diện", xuất ngày 2026-10-13.

Màn chính (file lớn; khung admin dùng chung đã làm ở đợt 5a):
- AdminRooms.dc.html — danh sách phòng; view = list | form (thêm/sửa); drag-over (kéo thả ảnh); state; collapsed (tablet)
- AdminCoupons.dc.html — mã giảm giá; modal = edit (ngăn kéo tạo/sửa, có lỗi validate); state; collapsed
- AdminReviews.dc.html — đánh giá: ẩn/hiện, lọc; state; collapsed
- AdminUsers.dc.html — người dùng; modal khoá tài khoản; state; collapsed
- AdminProperty.dc.html — cơ sở lưu trú; state; collapsed
- AdminDestinations.dc.html — điểm đến; modal đổi ảnh & ghi công; state; collapsed

Các file nhỏ còn lại là biến thể (tablet 1024, form, đang tải, trống, lỗi).
AdminSidebar/AdminTopbar/Patterns kèm theo để tham chiếu. CSS tham khảo: pages.css, luxestay.css, ds-bundle.css.

Ảnh (/_blob/...) KHÔNG đi kèm. Mọi tên phòng, mã giảm giá (SUMMER26, FLASH500K…), số lượt, doanh số
"đã giảm 412.600.000 ₫", tên khách, nội dung đánh giá, "Phản hồi của khách sạn", "Xuất CSV",
"Áp dụng cho hạng phòng", "Chỉ đơn từ 2 đêm", "Mỗi khách N lượt" là NỘI DUNG MINH HOẠ
hoặc tính năng có thể chưa có, không đưa vào code nếu API không hỗ trợ.
