-- Reviews are soft-hidden (is_hidden), not hard-deleted, mirroring the
-- existing soft-delete pattern used for users (deleted_at): admins can
-- retract a review from public view without losing the record, and can
-- restore it later.
CREATE TABLE IF NOT EXISTS room_reviews (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_room_reviews_room_id ON room_reviews(room_id);
CREATE INDEX IF NOT EXISTS idx_room_reviews_user_id ON room_reviews(user_id);
