-- ============================================================
-- Migration 005 : lost_found
-- Any student may post. Ownership rule (owner OR admin) is
-- enforced in lostFound.service.js on update/delete.
-- ============================================================

CREATE TABLE IF NOT EXISTS lost_found (
  item_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  type         ENUM('lost','found')      NOT NULL,
  title        VARCHAR(150)              NOT NULL,
  description  TEXT                      NULL,
  location     VARCHAR(150)              NULL,
  item_date    DATE                      NULL COMMENT 'Date the item was lost / found',
  image_url    VARCHAR(500)              NULL,
  contact_info VARCHAR(150)              NULL COMMENT 'Public on purpose - poster chooses what to show',
  status       ENUM('active','resolved') NOT NULL DEFAULT 'active',
  created_at   TIMESTAMP                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP                 NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id),
  KEY idx_lost_found_user (user_id),
  KEY idx_lost_found_type_status (type, status),
  KEY idx_lost_found_created_at (created_at),
  CONSTRAINT fk_lost_found_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_lost_found_title_not_blank
    CHECK (CHAR_LENGTH(TRIM(title)) >= 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
