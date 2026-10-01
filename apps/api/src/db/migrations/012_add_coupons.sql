CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
  max_discount_amount NUMERIC NULL CHECK (max_discount_amount IS NULL OR max_discount_amount > 0),
  min_booking_amount NUMERIC NULL CHECK (min_booking_amount IS NULL OR min_booking_amount >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  usage_limit INTEGER NULL CHECK (usage_limit IS NULL OR usage_limit > 0),
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- Keeps a record of which coupon (if any) a booking used and exactly how
-- much it discounted, so history isn't lost once only total_price remains.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS coupon_id INTEGER NULL REFERENCES coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0;
