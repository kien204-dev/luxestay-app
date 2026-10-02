-- What the property calls itself and how guests reach it, editable from the
-- admin area. One row only. Every column may be NULL, meaning "not set here":
-- the app then falls back to the matching environment variable, then to a
-- built-in default (see src/services/propertySettings.js).
CREATE TABLE IF NOT EXISTS property_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name VARCHAR(100),
  logo_url TEXT,
  phone VARCHAR(30),
  email VARCHAR(255),
  address VARCHAR(255),
  check_in_time VARCHAR(5) CHECK (check_in_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  check_out_time VARCHAR(5) CHECK (check_out_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  free_cancellation_days INTEGER CHECK (free_cancellation_days BETWEEN 0 AND 365),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
