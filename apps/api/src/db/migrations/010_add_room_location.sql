ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS location VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_rooms_location ON rooms(location);
