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
