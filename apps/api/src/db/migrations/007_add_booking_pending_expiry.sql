ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_pending_expiry
  ON bookings(expires_at)
  WHERE status = 'pending';
