'use strict';

/**
 * Applies every pending file in database/migrations, in filename order, and
 * records it in the `schema_migrations` table so re-running is safe.
 *
 * MySQL commits DDL implicitly, so there is no wrapping transaction: a failed
 * migration stops the run and reports exactly which file and statement broke.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const { env } = require('../../config/env');
const { baseConnectionConfig } = require('../../config/database');
const logger = require('../../utils/logger');
const { runSqlFile, readSqlFile } = require('./sql-runner');
const { explainConnectionError } = require('./create-database');

// The SQL now lives in the repository-root database/ folder (see database/README.md),
// not inside backend/. From backend/scripts/db/ that is three levels up.
const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', '..', 'database', 'migrations');

const TRACKING_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    filename    VARCHAR(255) NOT NULL,
    checksum    CHAR(64)     NOT NULL,
    applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_migrations_filename (filename)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

/** @returns {string[]} sorted migration filenames */
function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

const checksumOf = (filePath) =>
  crypto.createHash('sha256').update(readSqlFile(filePath)).digest('hex');

/** Connect directly to the application database. */
async function connect() {
  try {
    return await mysql.createConnection({
      ...baseConnectionConfig({ withDatabase: true }),
      multipleStatements: false,
    });
  } catch (error) {
    if (error.code === 'ER_BAD_DB_ERROR') {
      error.friendlyMessage =
        `Database "${env.db.database}" does not exist yet.\n  Run: npm run db:setup`;
    } else {
      error.friendlyMessage = explainConnectionError(error);
    }
    throw error;
  }
}

/** @returns {Promise<{ applied: string[], skipped: string[] }>} */
async function migrate() {
  const connection = await connect();

  try {
    await connection.query(TRACKING_TABLE);

    const [rows] = await connection.query('SELECT filename, checksum FROM schema_migrations');
    const appliedMap = new Map(rows.map((row) => [row.filename, row.checksum]));

    const files = listMigrationFiles();
    if (files.length === 0) {
      logger.warn('No migration files found in database/migrations');
      return { applied: [], skipped: [] };
    }

    const applied = [];
    const skipped = [];

    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const checksum = checksumOf(filePath);

      if (appliedMap.has(file)) {
        if (appliedMap.get(file) !== checksum) {
          logger.warn(
            `${file} has changed since it was applied. ` +
              'Existing databases keep the old schema - use `npm run db:reset` to rebuild.'
          );
        }
        skipped.push(file);
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const count = await runSqlFile(connection, filePath);
      // eslint-disable-next-line no-await-in-loop
      await connection.execute(
        'INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)',
        [file, checksum]
      );

      logger.info(`applied  ${file}  (${count} statements)`);
      applied.push(file);
    }

    if (applied.length === 0) {
      logger.info(`Schema is already up to date (${skipped.length} migrations applied earlier)`);
    } else {
      logger.info(`${applied.length} migration(s) applied, ${skipped.length} already up to date`);
    }

    return { applied, skipped };
  } finally {
    await connection.end();
  }
}

module.exports = { migrate, listMigrationFiles, MIGRATIONS_DIR, connect };

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error(error.friendlyMessage || error.message);
      process.exit(1);
    });
}
