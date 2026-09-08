'use strict';

/**
 * Executes .sql files through the mysql2 driver.
 *
 * A naive `sql.split(';')` breaks on migration 008, because a trigger body
 * contains semicolons of its own. The splitter below is a small state machine
 * that understands:
 *   - '...' "..." `...` quoting, with backslash and doubled-quote escapes
 *   - -- line, # line and block comments
 *   - the client-side  DELIMITER $$  directive used around CREATE TRIGGER
 *
 * That keeps every .sql file in this project runnable BOTH by these scripts
 * and by the plain `mysql` CLI.
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {string} sql
 * @returns {string[]} individual statements, comments and blank ones removed
 */
function splitStatements(sql) {
  const statements = [];
  let delimiter = ';';
  let buffer = '';

  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inBlockComment = false;
  let atLineStart = true;

  let i = 0;
  const length = sql.length;

  const push = () => {
    const trimmed = buffer.trim();
    if (trimmed) statements.push(trimmed);
    buffer = '';
  };

  while (i < length) {
    const char = sql[i];
    const next = sql[i + 1];
    const inString = inSingle || inDouble || inBacktick;

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (inString) {
      buffer += char;
      // Backslash escape inside single/double quoted strings.
      if (char === '\\' && (inSingle || inDouble) && i + 1 < length) {
        buffer += sql[i + 1];
        i += 2;
        continue;
      }
      if (inSingle && char === "'") inSingle = false;
      else if (inDouble && char === '"') inDouble = false;
      else if (inBacktick && char === '`') inBacktick = false;
      i += 1;
      continue;
    }

    // --- outside strings and comments ---

    // DELIMITER directive (only meaningful at the start of a line)
    if (atLineStart) {
      const rest = sql.slice(i);
      const match = /^[ \t]*DELIMITER[ \t]+(\S+)[ \t]*(\r?\n|$)/i.exec(rest);
      if (match) {
        push();
        delimiter = match[1];
        i += match[0].length;
        atLineStart = true;
        continue;
      }
    }

    if (char === '-' && next === '-' && /[\s]/.test(sql[i + 2] ?? '\n')) {
      while (i < length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (char === '#') {
      while (i < length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (sql.startsWith(delimiter, i)) {
      push();
      i += delimiter.length;
      atLineStart = false;
      continue;
    }

    if (char === "'") inSingle = true;
    else if (char === '"') inDouble = true;
    else if (char === '`') inBacktick = true;

    buffer += char;
    atLineStart = char === '\n';
    i += 1;
  }

  push();
  return statements;
}

/** @param {string} filePath */
function readSqlFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Run every statement of a .sql file on an existing connection.
 *
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} filePath
 * @returns {Promise<number>} number of statements executed
 */
async function runSqlFile(connection, filePath) {
  const statements = splitStatements(readSqlFile(filePath));

  for (const statement of statements) {
    try {
      // `query`, not `execute`: these are DDL/DML with no bound parameters,
      // and DDL cannot be prepared.
      // eslint-disable-next-line no-await-in-loop
      await connection.query(statement);
    } catch (error) {
      const preview = statement.replace(/\s+/g, ' ').slice(0, 160);
      error.message = `${error.message}\n  in ${path.basename(filePath)}\n  near: ${preview}...`;
      throw error;
    }
  }

  return statements.length;
}

module.exports = { splitStatements, readSqlFile, runSqlFile };
