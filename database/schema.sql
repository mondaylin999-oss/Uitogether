-- ============================================================
--  UITogether - CONSOLIDATED DATABASE SCHEMA
-- ------------------------------------------------------------
--  GENERATED FILE - do not edit by hand.
--  Regenerate with:  npm run db:schema
--  Source of truth:  database/migrations/*.sql
--
--  Generated: 2026-08-27T08:52:12.992Z
--  Built from 9 migration file(s).
--
--  Normal setup does NOT need this file - just run:
--      npm run db:setup
--
--  To load it manually instead:
--      mysql -u <user> -p < database/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS `uitogether_db`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `uitogether_db`;


-- ############################################################
-- # 001_create_users.sql
-- ############################################################

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


-- ############################################################
-- # 002_create_study_buddy_profiles.sql
-- ############################################################

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


-- ############################################################
-- # 003_create_buddy_requests.sql
-- ############################################################

-- ============================================================
-- Migration 003 : buddy_requests
-- One row per (sender -> receiver) direction.
--   * trg_requests_not_self_* : a user can never request themselves
--   * uq_requests_pair        : no duplicate request in the same direction
--                               (a rejected row is revived to 'pending'
--                                by the service instead of inserting a dup)
-- A MUTUAL MATCH is simply status = 'accepted'.
--
-- WHY A TRIGGER AND NOT A CHECK CONSTRAINT
-- MySQL 8.0 prohibits foreign key referential actions (ON DELETE / ON UPDATE)
-- on any column that appears in a CHECK constraint. sender_id and receiver_id
-- need ON DELETE CASCADE so a deleted account takes its requests with it, so
-- the "not yourself" rule is enforced by BEFORE INSERT / BEFORE UPDATE
-- triggers instead. The guarantee is identical - the write is rejected by the
-- database, not merely by the API.
-- ============================================================

CREATE TABLE IF NOT EXISTS buddy_requests (
  request_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sender_id   INT UNSIGNED NOT NULL,
  receiver_id INT UNSIGNED NOT NULL,
  status      ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id),
  UNIQUE KEY uq_requests_pair (sender_id, receiver_id),
  KEY idx_requests_receiver_status (receiver_id, status),
  KEY idx_requests_sender_status (sender_id, status),
  CONSTRAINT fk_requests_sender
    FOREIGN KEY (sender_id) REFERENCES users (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_requests_receiver
    FOREIGN KEY (receiver_id) REFERENCES users (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS trg_requests_not_self_bi;
DROP TRIGGER IF EXISTS trg_requests_not_self_bu;

DELIMITER $$

CREATE TRIGGER trg_requests_not_self_bi
BEFORE INSERT ON buddy_requests
FOR EACH ROW
BEGIN
  IF NEW.sender_id = NEW.receiver_id THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'You cannot send a buddy request to yourself';
  END IF;
END$$

CREATE TRIGGER trg_requests_not_self_bu
BEFORE UPDATE ON buddy_requests
FOR EACH ROW
BEGIN
  IF NEW.sender_id = NEW.receiver_id THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'You cannot send a buddy request to yourself';
  END IF;
END$$

DELIMITER ;


-- ############################################################
-- # 004_create_competitions.sql
-- ############################################################

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


-- ############################################################
-- # 005_create_lost_found.sql
-- ############################################################

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


-- ############################################################
-- # 006_create_polls.sql
-- ############################################################

-- ============================================================
-- Migration 006 : polls, poll_options, votes
--
-- "One vote per user per poll" is enforced BY THE DATABASE with
--   UNIQUE KEY uq_votes_one_per_poll (poll_id, user_id)
--
-- A vote can also never point at an option from a different poll:
-- votes carries (poll_id, option_id) and a COMPOSITE foreign key
-- into poll_options (poll_id, option_id). No trigger needed.
-- ============================================================

CREATE TABLE IF NOT EXISTS polls (
  poll_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  question    VARCHAR(255) NOT NULL,
  description VARCHAR(500) NULL,
  status      ENUM('open','closed') NOT NULL DEFAULT 'open',
  ends_at     DATETIME     NULL COMMENT 'Optional auto-close deadline',
  created_by  INT UNSIGNED NULL COMMENT 'FK -> users.user_id, must be an admin (see trigger)',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (poll_id),
  KEY idx_polls_status (status),
  KEY idx_polls_created_by (created_by),
  CONSTRAINT fk_polls_created_by
    FOREIGN KEY (created_by) REFERENCES users (user_id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS poll_options (
  option_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id       INT UNSIGNED NOT NULL,
  option_text   VARCHAR(200) NOT NULL,
  display_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (option_id),
  UNIQUE KEY uq_options_poll_option (poll_id, option_id),
  UNIQUE KEY uq_options_poll_text (poll_id, option_text),
  CONSTRAINT fk_options_poll
    FOREIGN KEY (poll_id) REFERENCES polls (poll_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS votes (
  vote_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id    INT UNSIGNED NOT NULL,
  option_id  INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (vote_id),
  UNIQUE KEY uq_votes_one_per_poll (poll_id, user_id),
  KEY idx_votes_option (option_id),
  KEY idx_votes_user (user_id),
  CONSTRAINT fk_votes_option
    FOREIGN KEY (poll_id, option_id) REFERENCES poll_options (poll_id, option_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_votes_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ############################################################
-- # 007_create_notifications.sql
-- ############################################################

-- ============================================================
-- Migration 007 : notifications
-- Fan-out rows, one per recipient. A user may only ever read
-- rows where notifications.user_id = the authenticated user_id.
-- reference_type / reference_id let the frontend deep-link
-- (e.g. buddy_request 12  ->  /requests/12).
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL COMMENT 'Recipient',
  type            ENUM(
                    'buddy_request',
                    'buddy_request_accepted',
                    'buddy_request_rejected',
                    'new_competition',
                    'new_lost_found',
                    'new_poll'
                  ) NOT NULL,
  title           VARCHAR(150) NOT NULL,
  message         VARCHAR(500) NULL,
  reference_type  ENUM('buddy_request','competition','lost_found','poll') NULL,
  reference_id    INT UNSIGNED NULL,
  is_read         TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id),
  KEY idx_notifications_user_read (user_id, is_read, created_at),
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ############################################################
-- # 008_create_views_and_triggers.sql
-- ############################################################

-- ============================================================
-- Migration 008 : views + integrity triggers
--
-- VIEWS
--   v_buddy_matches  : an accepted request expanded into BOTH
--                      directions, so "my matches" is one indexed
--                      lookup instead of an OR across two columns.
--   v_poll_results   : per-option vote counts + percentage.
--
-- TRIGGERS (defence in depth - the API already checks the role)
--   competitions / polls : created_by must be an admin user
--   votes                : cannot vote on a closed / expired poll
-- ============================================================

CREATE OR REPLACE VIEW v_buddy_matches AS
SELECT r.request_id, r.sender_id   AS user_id, r.receiver_id AS matched_user_id, r.updated_at AS matched_at
FROM   buddy_requests r
WHERE  r.status = 'accepted'
UNION ALL
SELECT r.request_id, r.receiver_id AS user_id, r.sender_id   AS matched_user_id, r.updated_at AS matched_at
FROM   buddy_requests r
WHERE  r.status = 'accepted';

CREATE OR REPLACE VIEW v_poll_results AS
SELECT
  o.poll_id,
  o.option_id,
  o.option_text,
  o.display_order,
  COUNT(v.vote_id) AS vote_count,
  ROUND(
    100 * COUNT(v.vote_id) /
    NULLIF((SELECT COUNT(*) FROM votes tv WHERE tv.poll_id = o.poll_id), 0),
    2
  ) AS vote_percentage
FROM poll_options o
LEFT JOIN votes v ON v.option_id = o.option_id
GROUP BY o.poll_id, o.option_id, o.option_text, o.display_order;

DROP TRIGGER IF EXISTS trg_competitions_admin_bi;
DROP TRIGGER IF EXISTS trg_competitions_admin_bu;
DROP TRIGGER IF EXISTS trg_polls_admin_bi;
DROP TRIGGER IF EXISTS trg_polls_admin_bu;
DROP TRIGGER IF EXISTS trg_votes_poll_open_bi;

DELIMITER $$

CREATE TRIGGER trg_competitions_admin_bi
BEFORE INSERT ON competitions
FOR EACH ROW
BEGIN
  DECLARE v_role VARCHAR(16) DEFAULT NULL;
  IF NEW.created_by IS NOT NULL THEN
    SELECT role INTO v_role FROM users WHERE user_id = NEW.created_by;
    IF v_role IS NULL OR v_role <> 'admin' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'competitions.created_by must reference a user with role = admin';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_competitions_admin_bu
BEFORE UPDATE ON competitions
FOR EACH ROW
BEGIN
  DECLARE v_role VARCHAR(16) DEFAULT NULL;
  IF NEW.created_by IS NOT NULL AND NOT (NEW.created_by <=> OLD.created_by) THEN
    SELECT role INTO v_role FROM users WHERE user_id = NEW.created_by;
    IF v_role IS NULL OR v_role <> 'admin' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'competitions.created_by must reference a user with role = admin';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_polls_admin_bi
BEFORE INSERT ON polls
FOR EACH ROW
BEGIN
  DECLARE v_role VARCHAR(16) DEFAULT NULL;
  IF NEW.created_by IS NOT NULL THEN
    SELECT role INTO v_role FROM users WHERE user_id = NEW.created_by;
    IF v_role IS NULL OR v_role <> 'admin' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'polls.created_by must reference a user with role = admin';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_polls_admin_bu
BEFORE UPDATE ON polls
FOR EACH ROW
BEGIN
  DECLARE v_role VARCHAR(16) DEFAULT NULL;
  IF NEW.created_by IS NOT NULL AND NOT (NEW.created_by <=> OLD.created_by) THEN
    SELECT role INTO v_role FROM users WHERE user_id = NEW.created_by;
    IF v_role IS NULL OR v_role <> 'admin' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'polls.created_by must reference a user with role = admin';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_votes_poll_open_bi
BEFORE INSERT ON votes
FOR EACH ROW
BEGIN
  DECLARE v_status  VARCHAR(16) DEFAULT NULL;
  DECLARE v_ends_at DATETIME    DEFAULT NULL;
  SELECT status, ends_at INTO v_status, v_ends_at FROM polls WHERE poll_id = NEW.poll_id;
  IF v_status <> 'open' OR (v_ends_at IS NOT NULL AND v_ends_at <= NOW()) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cannot vote: this poll is closed';
  END IF;
END$$

DELIMITER ;


-- ############################################################
-- # 009_relax_email_domain.sql
-- ############################################################

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
