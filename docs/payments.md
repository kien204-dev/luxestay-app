# Thanh toán: VNPay và MoMo

Khách đặt phòng xong có thể thanh toán ngay qua cổng, hoặc để sau trong thời gian giữ chỗ (`PENDING_BOOKING_TTL_MINUTES`, mặc định 30 phút). Quá thời gian đó đặt phòng tự hủy và khách nhận email báo. Tiền thu tại quầy (tiền mặt, chuyển khoản) được ghi nhận ở trang **Đặt phòng** → "Đã thu tiền".

Ứng dụng **không** tự hoàn tiền qua cổng. Khi một đặt phòng đã thanh toán bị hủy (hoặc tiền về sau khi phòng đã có người khác đặt), đơn chuyển sang "Chờ hoàn tiền"; bạn chuyển tiền lại cho khách rồi bấm "Xác nhận hoàn tiền".

## VNPay

**Trạng thái: chờ VNPay kích hoạt merchant sandbox.** Phần xử lý trong ứng dụng (ký yêu cầu, kiểm tra chữ ký và số tiền ở IPN, xác nhận đặt phòng, IPN gửi lặp, tiền về sau khi hết hạn) đã được kiểm chứng bằng IPN giả lập trong `npm run test:integration`. Một giao dịch thật đi trọn vòng qua cổng sandbox chưa chạy được vì merchant thử nghiệm chưa được VNPay phê duyệt ("Website này chưa được phê duyệt").

Bật VNPay: đặt trong `.env`

```dotenv
VNPAY_TMN_CODE=...       # mã website VNPay cấp
VNPAY_HASH_SECRET=...    # chuỗi bí mật VNPay cấp — không đưa vào git
VNPAY_PAY_URL=           # để trống = sandbox; điền địa chỉ production khi chạy thật
```

Trên trang quản trị merchant của VNPay, khai báo:

- **IPN URL**: `<địa chỉ web>/api/payments/vnpay/ipn` — phải truy cập được từ Internet (khi thử trên máy: dùng tunnel, xem [configuration.md](configuration.md#ví-dụ-chạy-thử-vnpay-sandbox-qua-tunnel)).
- **Return URL**: `<địa chỉ web>/payment/result` (mặc định ứng dụng tự gửi địa chỉ này).

Trang `/payment/result` không tin vào tham số VNPay gắn trên địa chỉ trả về; nó hỏi API, và API chỉ tin thông báo IPN có chữ ký đúng.

## MoMo (beta)

**Trạng thái: beta, tắt mặc định.** Mã tích hợp đã viết theo tài liệu MoMo và có test với chữ ký giả lập, nhưng **chưa được kiểm chứng với tài khoản MoMo thật**. Chỉ bật khi bạn sẽ tự thử kỹ với MoMo trước khi mở cho khách.

```dotenv
MOMO_ENABLED=true
MOMO_PARTNER_CODE=...
MOMO_ACCESS_KEY=...
MOMO_SECRET_KEY=...
MOMO_API_URL=https://test-payment.momo.vn/v2/gateway/api/create
MOMO_IPN_URL=https://<địa chỉ web công khai>/api/payments/momo/ipn
```

Nút "Thanh toán qua MoMo" chỉ hiện khi `MOMO_ENABLED=true` và đủ các biến trên.

## Kiểm tra trước khi nhận tiền thật

- [ ] Một giao dịch thử đi hết vòng: đặt phòng → cổng thanh toán → quay về `/payment/result` → đơn "Đã xác nhận", khách nhận email xác nhận.
- [ ] Log API có dòng nhận IPN, không có `INVALID SIGNATURE`.
- [ ] Hủy một đơn đã thanh toán: đơn sang "Chờ hoàn tiền", quản trị nhận email/thông báo.
- [ ] `VNPAY_PAY_URL` trỏ tới cổng production, không phải sandbox.
