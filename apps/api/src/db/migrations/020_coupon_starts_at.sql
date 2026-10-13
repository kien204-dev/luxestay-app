-- A coupon can be prepared ahead: it is refused at checkout before
-- starts_at (NULL = valid from the moment it is created, as before).
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NULL;
