-- language: what the guest was reading when they booked, so later emails
-- about this booking (payment received, cancellation) use the same language
-- even when they are triggered by a payment gateway or an admin.
--
-- guest_*: for bookings an admin enters on behalf of someone at the desk or
-- on the phone. The booking still belongs to the admin's account (user_id);
-- these columns say who the stay is actually for. NULL for ordinary online
-- bookings, where the account holder is the guest.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'vi',
  ADD COLUMN IF NOT EXISTS guest_name VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255) NULL;
