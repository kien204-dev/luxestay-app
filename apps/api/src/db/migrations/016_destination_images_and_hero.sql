-- A photo per destination (the part of rooms.location after the last comma,
-- e.g. "Hà Nội"), with the credit its licence asks for. Set by the seed from
-- seed-assets/destinations and changeable from the admin area.
CREATE TABLE IF NOT EXISTS destination_images (
  name VARCHAR(100) PRIMARY KEY,
  image_url TEXT NOT NULL,
  place VARCHAR(255),
  credit_title VARCHAR(255),
  credit_author VARCHAR(255),
  credit_license VARCHAR(100),
  credit_license_url TEXT,
  credit_source_url TEXT,
  credit_changes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Background photo behind the home page search box (NULL = the plain
-- gradient).
ALTER TABLE property_settings ADD COLUMN IF NOT EXISTS hero_image_url TEXT;
