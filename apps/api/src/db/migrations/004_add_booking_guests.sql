ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS guests INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_guests_positive'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_guests_positive CHECK (guests > 0);
  END IF;
END $$;
