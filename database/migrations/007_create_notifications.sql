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
