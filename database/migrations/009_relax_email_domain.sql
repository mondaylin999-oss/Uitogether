-- ============================================================
-- Migration 009 : allow any valid email domain
-- ------------------------------------------------------------
-- The product accepts @gmail.com, @yahoo.com, @outlook.com and any
-- other valid address. Registration was previously restricted to
-- Gmail in TWO places, both of which had to change together:
--     1. backend/validators/auth.validator.js  (GMAIL_REGEX -> EMAIL_REGEX)
--     2. this CHECK constraint on users.email
-- Removing only the validator would still fail at the database with
-- ER_CHECK_CONSTRAINT_VIOLATED.
--
-- The address is still format-validated, and the service lowercases
-- it before insert, so the pattern is lowercase-only by design.
-- Existing Gmail addresses remain valid under the broader rule.
-- ============================================================

ALTER TABLE users DROP CHECK chk_users_email_gmail;

ALTER TABLE users ADD CONSTRAINT chk_users_email_format
  CHECK (email REGEXP '^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$');
