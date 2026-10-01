-- Base tables. Everything from 001 onwards only ALTERs these, so this file
-- has to run first on an empty database. Written with IF NOT EXISTS so it is
-- a no-op on a database that already has the tables.
--
-- Column types follow the original hand-made database. On top of that, this
-- file adds what that database never had: NOT NULL on name/role/status, CHECK
-- constraints on the enumerated and numeric columns, case-insensitive email
-- uniqueness, and foreign keys that refuse to delete a user or room that
-- still has bookings (the original cascaded and silently deleted them).

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Soft-deleted users keep their row (and their email), so uniqueness is
-- enforced across all rows, case-insensitively, matching the LOWER(email)
-- lookups in the auth routes.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  room_name VARCHAR(150) NOT NULL,
  room_type VARCHAR(100) NOT NULL,
  price NUMERIC(12, 2) NOT NULL CHECK (price > 0),
  description TEXT,
  capacity INTEGER NOT NULL DEFAULT 2 CHECK (capacity > 0),
  image TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'booked', 'maintenance')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (check_out > check_in)
);

CREATE INDEX IF NOT EXISTS idx_bookings_room_dates ON bookings (room_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings (user_id);
