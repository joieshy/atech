'use strict';

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { config } = require('./config');

const ALLOWED_EXTENSIONS = new Set([
  '.apk', '.exe', '.msi', '.zip', '.rar', '.7z', '.iso', '.img',
  '.tar', '.gz', '.tgz', '.bin', '.dmg', '.deb', '.run', '.pdf'
]);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, config.uploadDir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    cb(null, `${stamp}-${crypto.randomBytes(5).toString('hex')}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxUploadMb * 1024 * 1024,
    files: 1,
    fields: 20,
    fieldSize: 100 * 1024
  },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      const error = new Error(
        `Hindi supported ang "${ext || 'walang extension'}" na file. Mga allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`
      );
      error.code = 'INVALID_FILE_TYPE';
      return cb(error);
    }
    if (!file.originalname || Buffer.byteLength(file.originalname, 'utf8') > 255) {
      const error = new Error('Masyadong mahaba o walang pangalan ang file.');
      error.code = 'INVALID_FILE_NAME';
      return cb(error);
    }
    return cb(null, true);
  }
});

async function removeUploadedFile(file) {
  if (!file || !file.path) return;
  const fs = require('fs/promises');
  try {
    await fs.unlink(file.path);
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[upload] hindi ma-delete:', file.path, error.message);
  }
}

module.exports = { upload, removeUploadedFile, ALLOWED_EXTENSIONS };
