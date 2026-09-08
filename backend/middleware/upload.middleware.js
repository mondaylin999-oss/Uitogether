"use strict";

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { env } = require('../config/env');

// Vercel serverless runs on a read-only filesystem except /tmp.
const UPLOAD_DIR = process.env.VERCEL
  ? path.join('/tmp', 'uitogether-uploads')
  : path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${safe}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Invalid file type'));
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter,
});

/** Middleware wrapper that also sets req.body.image_url when a file was uploaded. */
function singleImage(fieldName = 'image') {
  return (req, res, next) => {
    const handler = upload.single(fieldName);
    handler(req, res, (err) => {
      if (err) return next(err);
      if (req.file) {
        const proto = req.protocol;
        const host = req.get('host');
        // /uploads is served from /uploads
        req.body = req.body || {};
        req.body.image_url = `${proto}://${host}/uploads/${req.file.filename}`;
      }
      next();
    });
  };
}

module.exports = { singleImage };
