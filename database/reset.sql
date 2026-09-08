-- ===========================================================================
--  UITogether — reset the database
--  ------------------------------------------------------------------------
--  Drops every table, view, trigger and function created by
--  database/migrations/*.sql. ALL DATA IS LOST. There is no undo.
--
--  You normally do NOT need this file: `npm run db:reset` (from backend/)
--  drops the whole database and rebuilds it in one step. Use this file when
--  you only want to clear the schema by hand — from psql, pgAdmin, or when
--  your role is not allowed to DROP DATABASE (which is the case on most
--  managed hosts, including Render).
--
--  HOW TO RUN IT (psql)
--      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/reset.sql
--      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/schema.sql
--
--  HOW TO RUN IT (pgAdmin)
--   1. Connect to the uitogether_db database.
--   2. Open this file in a query tab and execute it.
--   3. Then run  database/schema.sql  to rebuild the empty tables.
--
--  After a manual reset the migration ledger is gone too, so the next
--  `npm run db:migrate` will re-apply all 9 migrations from scratch. That is
--  correct and safe.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Views  (migration 008)
--    Dropped first: a view depends on the tables below it.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_buddy_matches;
DROP VIEW IF EXISTS v_poll_results;

-- ---------------------------------------------------------------------------
-- 2. Tables
--    CASCADE takes each table's own triggers, indexes and foreign keys with
--    it, so — unlike the MySQL original, which switched FOREIGN_KEY_CHECKS
--    off — the drop order genuinely does not matter here.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS votes              CASCADE;
DROP TABLE IF EXISTS poll_options       CASCADE;
DROP TABLE IF EXISTS polls              CASCADE;
DROP TABLE IF EXISTS notifications      CASCADE;
DROP TABLE IF EXISTS lost_found         CASCADE;
DROP TABLE IF EXISTS competitions       CASCADE;
DROP TABLE IF EXISTS buddy_requests     CASCADE;
DROP TABLE IF EXISTS study_buddy_profiles CASCADE;
DROP TABLE IF EXISTS users              CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Trigger functions  (migrations 001, 003 and 008)
--    These live at schema level, not inside a table, so dropping the tables
--    does not remove them.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS set_updated_at();
DROP FUNCTION IF EXISTS trg_requests_not_self();
DROP FUNCTION IF EXISTS trg_assert_created_by_admin();
DROP FUNCTION IF EXISTS trg_assert_poll_open();

-- ---------------------------------------------------------------------------
-- 4. The migration ledger itself
--    Created by backend/scripts/db/migrate.js, not by a migration file.
--    Dropping it tells the migrator "this database is empty, start again".
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS schema_migrations;

-- Confirm the database is empty (should return no rows):
--   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
