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
