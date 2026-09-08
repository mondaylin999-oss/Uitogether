'use strict';

/**
 * Executes .sql files through the node-postgres driver.
 *
 * The MySQL port needed a hand-written statement splitter here, because
 * mysql2 refuses multiple statements in one call and a trigger body contains
 * semicolons of its own (hence the client-side `DELIMITER $$` directive).
 *
 * PostgreSQL needs none of that. node-postgres' simple query protocol accepts
 * a whole file in one call, and the server does the parsing - including
 * $$ ... $$ dollar-quoted function bodies. Better still, PostgreSQL DDL is
 * TRANSACTIONAL: the whole file is wrapped in a single implicit transaction,
 * so a migration that fails halfway leaves the schema untouched instead of
 * half-applied.
 */

const fs = require('fs');
const path = require('path');

/** @param {string} filePath */
function readSqlFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Rough count of top-level statements, for the log line only. Semicolons
 * inside dollar-quoted bodies and string literals are not discounted, so this
 * is an estimate and is never used to drive execution.
 *
 * @param {string} sql
 * @returns {number}
 */
function countStatements(sql) {
  const withoutFunctions = sql.replace(/\$\$[\s\S]*?\$\$/g, "''");
  const withoutComments = withoutFunctions.replace(/--[^\n]*/g, '');
  return withoutComments.split(';').filter((part) => part.trim().length > 0).length;
}

/**
 * Run a .sql file on an existing client/connection.
 *
 * @param {{ query: Function }} client  a pg Client or PoolClient
 * @param {string} filePath
 * @returns {Promise<number>} approximate number of statements executed
 */
async function runSqlFile(client, filePath) {
  const sql = readSqlFile(filePath);

  try {
    await client.query(sql);
  } catch (error) {
    // pg reports a character offset into the statement; turn it into
    // something a human can act on.
    const position = Number.parseInt(error.position, 10);
    const near = Number.isFinite(position)
      ? sql.slice(Math.max(0, position - 80), position + 80).replace(/\s+/g, ' ')
      : null;

    error.message = [
      error.message,
      `  in ${path.basename(filePath)}`,
      near ? `  near: ...${near}...` : null,
    ]
      .filter(Boolean)
      .join('\n');
    throw error;
  }

  return countStatements(sql);
}

module.exports = { readSqlFile, runSqlFile, countStatements };
