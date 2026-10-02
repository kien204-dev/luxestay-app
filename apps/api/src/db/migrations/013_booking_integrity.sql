-- 1. Refunds are handled by hand, so a booking needs a "money is owed back"
--    state between paid and refunded.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refund_pending', 'refunded'));

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_refund_pending
  ON bookings(id)
  WHERE payment_status = 'refund_pending';

-- 2. Last line of defence against double booking: two active bookings of one
--    room can never cover the same night, whatever the application does.
--    [check_in, check_out) is half-open, so a checkout day can be the next
--    guest's check-in day.
--    This fails if the table already holds overlapping active bookings;
--    cancel one of each overlapping pair, then run the migration again.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (room_id WITH =, daterange(check_in, check_out) WITH &&)
  WHERE (status IN ('pending', 'confirmed'));
