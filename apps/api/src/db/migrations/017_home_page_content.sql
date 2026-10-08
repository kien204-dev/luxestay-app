-- What the home page says about the property, filled in from the admin area
-- (/admin/property). Every column may be NULL, meaning "not set": the home
-- page then shows its neutral default headline, and leaves the amenities and
-- location sections out.
--
-- amenities:     [{ "name": "...", "description": "..." }, ...]
-- nearby_places: [{ "name": "...", "note": "...", "distance": "..." }, ...]
ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS hero_title VARCHAR(120);
ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS hero_subtitle VARCHAR(300);
ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS amenities JSONB
  CHECK (amenities IS NULL OR jsonb_typeof(amenities) = 'array');
ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS nearby_places JSONB
  CHECK (nearby_places IS NULL OR jsonb_typeof(nearby_places) = 'array');
