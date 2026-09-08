-- ===========================================================================
--  UITogether — reset the database
--  ------------------------------------------------------------------------
--  Drops every table, view and trigger created by database/migrations/*.sql.
--  ALL DATA IS LOST. There is no undo.
--
--  You normally do NOT need this file: `npm run db:reset` (from backend/)
--  does the same thing and then rebuilds and re-seeds in one step.
--  Use this file when you want to clear the schema by hand — from MySQL
--  Workbench, phpMyAdmin, or the mysql client.
--
--  HOW TO RUN IT (MySQL Workbench / phpMyAdmin)
--   1. Select the  uitogether_db  database.
--   2. Open this file in a query tab and execute it.
--   3. Then run  database/schema.sql  to rebuild the empty tables.
--
--  HOW TO RUN IT (command line — MAMP MySQL on port 8889)
--      mysql -u root -p -P 8889 -h 127.0.0.1 uitogether_db < database/reset.sql
--      mysql -u root -p -P 8889 -h 127.0.0.1 uitogether_db < database/schema.sql
--
--  After a manual reset the migration ledger is gone too, so the next
--  `npm run db:migrate` will re-apply all 9 migrations from scratch. That is
--  correct and safe.
-- ===========================================================================

-- Foreign keys are dropped along with their tables; switching the check off
-- means the DROP order below does not matter if a migration is ever added.
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- 1. Triggers  (migrations 003 and 008)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_requests_not_self_bi;
DROP TRIGGER IF EXISTS trg_requests_not_self_bu;
DROP TRIGGER IF EXISTS trg_competitions_admin_bi;
DROP TRIGGER IF EXISTS trg_competitions_admin_bu;
DROP TRIGGER IF EXISTS trg_polls_admin_bi;
DROP TRIGGER IF EXISTS trg_polls_admin_bu;
DROP TRIGGER IF EXISTS trg_votes_poll_open_bi;

-- ---------------------------------------------------------------------------
-- 2. Views  (migration 008)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_buddy_matches;
DROP VIEW IF EXISTS v_poll_results;

-- ---------------------------------------------------------------------------
-- 3. Tables — children first, then parents
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS poll_options;
DROP TABLE IF EXISTS polls;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS lost_found;
DROP TABLE IF EXISTS competitions;
DROP TABLE IF EXISTS buddy_requests;
DROP TABLE IF EXISTS study_buddy_profiles;
DROP TABLE IF EXISTS users;

-- ---------------------------------------------------------------------------
-- 4. The migration ledger itself
--    Created by backend/scripts/db/migrate.js, not by a migration file.
--    Dropping it tells the migrator "this database is empty, start again".
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS schema_migrations;

SET FOREIGN_KEY_CHECKS = 1;

-- Confirm the database is empty (should return no rows):
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'uitogether_db';
