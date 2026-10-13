-- Whether the account has a password its owner chose (sign-up, a reset
-- link, a change, an admin setting one). Accounts created by Google sign-in
-- get a random password nobody knows: FALSE until the owner sets one through
-- "Forgot password". Changing the email needs the current password, so such
-- an account is told to set one first.
--
-- Accounts that existed before this migration are all marked TRUE: a
-- Google-created one cannot be told apart from a password account that was
-- later linked to Google. Its owner gets "wrong password" when changing the
-- email and sets a password through "Forgot password" (docs/known-issues.md).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_set BOOLEAN NOT NULL DEFAULT TRUE;
