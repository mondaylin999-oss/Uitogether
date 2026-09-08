-- ============================================================
-- Migration 001 : users
-- Core account table. Roles are NEVER chosen by the client:
-- the API always inserts 'student'; admins are promoted manually.
-- Only @gmail.com addresses are accepted (enforced in the DB too).
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  user_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100)          NOT NULL,
  email         VARCHAR(191)          NOT NULL,
  tnt           VARCHAR(30)           NOT NULL COMMENT 'University roll / TNT number, unique per student',
  academic_year VARCHAR(30)           NOT NULL COMMENT 'e.g. "1st Year", "2nd Year", "Final Year"',
  password_hash VARCHAR(255)          NOT NULL COMMENT 'bcrypt hash - plaintext is never stored',
  role          ENUM('student','admin') NOT NULL DEFAULT 'student',
  created_at    TIMESTAMP             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP             NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_tnt (tnt),
  KEY idx_users_role (role),
  CONSTRAINT chk_users_email_gmail
    CHECK (email REGEXP '^[a-z0-9._%+-]+@gmail\\.com$'),
  CONSTRAINT chk_users_name_not_blank
    CHECK (CHAR_LENGTH(TRIM(name)) >= 2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
