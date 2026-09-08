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
