-- ============================================================
-- Migration 002 : study_buddy_profiles
-- Exactly ONE profile per user (enforced by uq_profiles_user_id).
-- telegram / viber are PRIVATE columns: the repository layer has
-- a "public" projection that never selects them, and they are only
-- read through the match-aware query path.
-- ============================================================

CREATE TABLE IF NOT EXISTS study_buddy_profiles (
  profile_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  nickname        VARCHAR(60)  NOT NULL,
  semester        VARCHAR(30)  NOT NULL COMMENT 'e.g. "Semester 1" ... "Semester 8"',
  study_style     ENUM('solo_focus','group_discussion','quiet_library','online_call','mixed')
                  NOT NULL DEFAULT 'mixed',
  weak_subjects   VARCHAR(500) NULL COMMENT 'Comma separated subject list',
  strong_subjects VARCHAR(500) NULL COMMENT 'Comma separated subject list',
  wanna_meet      ENUM('online','in_person','both') NOT NULL DEFAULT 'both',
  notes           VARCHAR(1000) NULL,
  telegram        VARCHAR(100)  NULL COMMENT 'PRIVATE - @username or t.me link, revealed only on mutual match',
  viber           VARCHAR(100)  NULL COMMENT 'PRIVATE - phone or viber link, revealed only on mutual match',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (profile_id),
  UNIQUE KEY uq_profiles_user_id (user_id),
  KEY idx_profiles_semester (semester),
  KEY idx_profiles_study_style (study_style),
  KEY idx_profiles_wanna_meet (wanna_meet),
  CONSTRAINT fk_profiles_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_profiles_has_contact
    CHECK (telegram IS NOT NULL OR viber IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
