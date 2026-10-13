-- Why an account was locked, for the admins: a reason from a fixed list,
-- an optional internal note, and when. Cleared on unlock. Never shown to
-- the account holder.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS lock_reason TEXT NULL
    CHECK (lock_reason IS NULL OR lock_reason IN ('fraud', 'spam', 'abuse', 'request', 'other')),
  ADD COLUMN IF NOT EXISTS lock_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL;
