'use strict';

/**
 * Entry point.
 *
 * Boot order is deliberate: validate the environment and prove the database
 * is reachable BEFORE binding the port, so a misconfigured install fails
 * immediately with a readable message instead of 500ing on the first request.
 */

const app = require('./app');
const { validateEnv, env } = require('./config/env');
const { assertConnection, closePool } = require('./config/database');
const logger = require('./utils/logger');

let server = null;

async function start() {
  try {
    validateEnv({ requireJwt: true });
  } catch (error) {
    logger.error(error.message);
    process.exit(1);
  }

  try {
    await assertConnection();
  } catch (error) {
    logger.error('Could not connect to MySQL.');
    logger.error(error.message);
    logger.error(
      'Check backend/.env, make sure MySQL is running, then run:  npm run db:setup'
    );
    process.exit(1);
  }

  server = app.listen(env.port, () => {
    logger.info(`UITogether API listening on http://localhost:${env.port} [${env.nodeEnv}]`);
    logger.info(`Health check:  http://localhost:${env.port}/api/health`);
    logger.info(`CORS allow-list: ${env.clientUrls.join(', ')}`);
  });
}

/** Stop accepting connections, then release the MySQL pool. */
async function shutdown(signal) {
  logger.info(`${signal} received - shutting down gracefully`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closePool();

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception - exiting', error);
  process.exit(1);
});

start();

module.exports = { start };
