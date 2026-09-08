'use strict';

/**
 * Wrap an async route handler so a rejected promise reaches Express'
 * error pipeline instead of hanging the request. Every controller method
 * is exported through this.
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<*>} fn
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
