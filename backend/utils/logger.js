'use strict';

/**
 * Tiny leveled logger. Kept dependency-free on purpose - swap the internals
 * for pino/winston later without touching a single call site.
 */

const { env } = require('../config/env');

const stamp = () => new Date().toISOString();

const logger = {
  info: (...args) => console.log(`[${stamp()}] INFO `, ...args),
  warn: (...args) => console.warn(`[${stamp()}] WARN `, ...args),
  error: (...args) => console.error(`[${stamp()}] ERROR`, ...args),
  debug: (...args) => {
    if (!env.isProduction) console.debug(`[${stamp()}] DEBUG`, ...args);
  },
};

module.exports = logger;
