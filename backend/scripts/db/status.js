'use strict';

/**
 * `npm run db:status`
 *
 * Read-only report: which migrations are applied, which are pending, and how
 * many rows each table holds. Useful for confirming a fresh install worked.
 */

const path = require('path');

const { connect, listMigrationFiles } = require('./migrate');
const { env, validateEnv } = require('../../config/env');
const { describeTarget } = require('../../config/database');
const logger = require('../../utils/logger');

const APP_TABLES = [
  'users',
  'study_buddy_profiles',
  'buddy_requests',
  'competitions',
  'lost_found',
  'polls',
  'poll_options',
  'votes',
  'notifications',
];

async function status() {
  validateEnv({ requireJwt: false });

  const connection = await connect();
  try {
    console.log(`\nDatabase: ${describeTarget()}\n`);

    // --- migrations ---
    let appliedRows = [];
    try {
      const [rows] = await connection.query(
        'SELECT filename, applied_at FROM schema_migrations ORDER BY filename'
      );
      appliedRows = rows;
    } catch (error) {
      if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
      logger.warn('schema_migrations does not exist - run `npm run db:setup`');
    }

    const appliedNames = new Set(appliedRows.map((row) => row.filename));
    const allFiles = listMigrationFiles();

    console.log('MIGRATIONS');
    for (const file of allFiles) {
      const mark = appliedNames.has(file) ? 'applied' : 'PENDING';
      console.log(`  [${mark}] ${file}`);
    }
    const pending = allFiles.filter((file) => !appliedNames.has(file));
    console.log(`  ${appliedNames.size} applied, ${pending.length} pending\n`);

    // --- tables ---
    const [tableRows] = await connection.query(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME`,
      [env.db.database]
    );
    const existing = new Set(tableRows.map((row) => row.name));

    console.log('TABLES');
    for (const table of APP_TABLES) {
      if (!existing.has(table)) {
        console.log(`  ${table.padEnd(24)} MISSING`);
        continue;
      }
      // Table name comes from the hard-coded APP_TABLES list, never user input.
      // eslint-disable-next-line no-await-in-loop
      const [[countRow]] = await connection.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
      console.log(`  ${table.padEnd(24)} ${String(countRow.total).padStart(6)} rows`);
    }

    // --- views & triggers ---
    const [views] = await connection.query(
      `SELECT TABLE_NAME AS name FROM information_schema.VIEWS
        WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [env.db.database]
    );
    const [triggers] = await connection.query(
      `SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA = ? ORDER BY TRIGGER_NAME`,
      [env.db.database]
    );

    console.log(`\nVIEWS    (${views.length}): ${views.map((v) => v.name).join(', ') || '-'}`);
    console.log(`TRIGGERS (${triggers.length}): ${triggers.map((t) => t.name).join(', ') || '-'}\n`);

    return { applied: appliedNames.size, pending: pending.length };
  } finally {
    await connection.end();
  }
}

module.exports = { status };

if (require.main === module) {
  status()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error(error.friendlyMessage || error.message);
      process.exit(1);
    });
}
