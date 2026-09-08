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
--
-- MySQL -> PostgreSQL notes for this file:
--   SIGNAL SQLSTATE '45000'  -> RAISE EXCEPTION (SQLSTATE P0001)
--   NEW.x <=> OLD.x          -> NEW.x IS NOT DISTINCT FROM OLD.x
--   trigger body inline      -> a named FUNCTION the trigger calls
--   ROUND(bigint / .., 2)    -> the numerator is cast to numeric first,
--                               because PostgreSQL has no two-argument
--                               ROUND for double precision.
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
    100 * COUNT(v.vote_id)::numeric /
    NULLIF((SELECT COUNT(*) FROM votes tv WHERE tv.poll_id = o.poll_id), 0),
    2
  ) AS vote_percentage
FROM poll_options o
LEFT JOIN votes v ON v.option_id = o.option_id
GROUP BY o.poll_id, o.option_id, o.option_text, o.display_order;

-- ------------------------------------------------------------
-- created_by must be an admin (competitions and polls)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_assert_created_by_admin()
RETURNS TRIGGER AS $$
DECLARE
  v_role VARCHAR(16);
BEGIN
  -- On UPDATE, only re-check when created_by actually changed, so an
  -- ordinary edit does not fail because the original admin was demoted.
  IF TG_OP = 'UPDATE' AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    SELECT role INTO v_role FROM users WHERE user_id = NEW.created_by;
    IF v_role IS NULL OR v_role <> 'admin' THEN
      RAISE EXCEPTION '%.created_by must reference a user with role = admin', TG_TABLE_NAME;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_competitions_admin_bi ON competitions;
CREATE TRIGGER trg_competitions_admin_bi
BEFORE INSERT ON competitions
FOR EACH ROW EXECUTE FUNCTION trg_assert_created_by_admin();

DROP TRIGGER IF EXISTS trg_competitions_admin_bu ON competitions;
CREATE TRIGGER trg_competitions_admin_bu
BEFORE UPDATE ON competitions
FOR EACH ROW EXECUTE FUNCTION trg_assert_created_by_admin();

DROP TRIGGER IF EXISTS trg_polls_admin_bi ON polls;
CREATE TRIGGER trg_polls_admin_bi
BEFORE INSERT ON polls
FOR EACH ROW EXECUTE FUNCTION trg_assert_created_by_admin();

DROP TRIGGER IF EXISTS trg_polls_admin_bu ON polls;
CREATE TRIGGER trg_polls_admin_bu
BEFORE UPDATE ON polls
FOR EACH ROW EXECUTE FUNCTION trg_assert_created_by_admin();

-- ------------------------------------------------------------
-- no voting on a closed or expired poll
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_assert_poll_open()
RETURNS TRIGGER AS $$
DECLARE
  v_status  VARCHAR(16);
  v_ends_at TIMESTAMP;
BEGIN
  SELECT status, ends_at INTO v_status, v_ends_at FROM polls WHERE poll_id = NEW.poll_id;
  IF v_status IS DISTINCT FROM 'open'
     OR (v_ends_at IS NOT NULL AND v_ends_at <= CURRENT_TIMESTAMP) THEN
    RAISE EXCEPTION 'Cannot vote: this poll is closed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_votes_poll_open_bi ON votes;
CREATE TRIGGER trg_votes_poll_open_bi
BEFORE INSERT ON votes
FOR EACH ROW EXECUTE FUNCTION trg_assert_poll_open();
