'use strict';

/**
 * `npm run db:schema`
 *
 * Regenerates database/schema.sql by concatenating the migrations, so the
 * consolidated schema file can never drift from what db:setup actually runs.
 *
 * schema.sql is a convenience artefact (hand it to a teammate, import it into
 * Workbench). The migrations remain the source of truth.
 */

const fs = require('fs');
const path = require('path');

const { listMigrationFiles, MIGRATIONS_DIR } = require('./migrate');
const { env } = require('../../config/env');
const logger = require('../../utils/logger');

const OUTPUT_FILE = path.resolve(__dirname, '..', '..', '..', 'database', 'schema.sql');

function buildSchema() {
  const files = listMigrationFiles();
  const generatedAt = new Date().toISOString();

  const header = `-- ============================================================
--  UITogether - CONSOLIDATED DATABASE SCHEMA
-- ------------------------------------------------------------
--  GENERATED FILE - do not edit by hand.
--  Regenerate with:  npm run db:schema
--  Source of truth:  database/migrations/*.sql
--
--  Generated: ${generatedAt}
--  Built from ${files.length} migration file(s).
--
--  Normal setup does NOT need this file - just run:
--      npm run db:setup
--
--  To load it manually instead, against an EXISTING database:
--      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/schema.sql
--
--  PostgreSQL has no "USE" statement and cannot CREATE DATABASE from inside
--  a script that also builds tables, so the target database is chosen by the
--  connection you run this with. Create it first if it does not exist:
--      createdb ${env.db.database}
-- ============================================================
`;

  const body = files
    .map((file) => {
      const contents = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').trim();
      return `\n\n-- ############################################################\n-- # ${file}\n-- ############################################################\n\n${contents}\n`;
    })
    .join('');

  fs.writeFileSync(OUTPUT_FILE, `${header}${body}`, 'utf8');
  logger.info(`Wrote ${path.relative(process.cwd(), OUTPUT_FILE)} from ${files.length} migrations`);

  return OUTPUT_FILE;
}

module.exports = { buildSchema, OUTPUT_FILE };

if (require.main === module) {
  try {
    buildSchema();
    process.exit(0);
  } catch (error) {
    logger.error(error.message);
    process.exit(1);
  }
}
