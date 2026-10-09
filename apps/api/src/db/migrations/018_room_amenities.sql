-- What a room offers, as a short list of texts the admin types on the room
-- form: ["Wi-Fi", "Ban công", ...]. NULL = none listed; the room page then
-- leaves its amenities section out.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS amenities JSONB
  CHECK (amenities IS NULL OR jsonb_typeof(amenities) = 'array');
