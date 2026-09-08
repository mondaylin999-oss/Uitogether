-- ============================================================
-- Migration 004 : competitions
-- ADMIN-ONLY write table. Enforcement is layered:
--   1. route  -> authenticate + requireAdmin middleware
--   2. DB     -> trigger in migration 008 rejects a created_by
--                that is not an admin user (defence in depth)
-- Students can only read.
-- ============================================================

CREATE TABLE IF NOT EXISTS competitions (
  competition_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title          VARCHAR(150) NOT NULL,
  description    TEXT         NULL,
  event_date     DATE         NOT NULL,
  event_time     TIME         NULL,
  location       VARCHAR(150) NULL,
  organizer      VARCHAR(120) NULL,
  image_url      VARCHAR(500) NULL,
  created_by     INT UNSIGNED NULL COMMENT 'FK -> users.user_id, must be an admin (see trigger)',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (competition_id),
  KEY idx_competitions_event_date (event_date),
  KEY idx_competitions_created_by (created_by),
  CONSTRAINT fk_competitions_created_by
    FOREIGN KEY (created_by) REFERENCES users (user_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_competitions_title_not_blank
    CHECK (CHAR_LENGTH(TRIM(title)) >= 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
