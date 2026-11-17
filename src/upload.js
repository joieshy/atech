'use strict';

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { config } = require('./config');

const ALLOWED_EXTENSIONS = new Set([
  // Android
  '.apk', '.apks', '.xapk', '.apkm', '.aab', '.obb',
  // Windows
  '.exe', '.msi', '.msix', '.msixbundle', '.appx', '.appxbundle', '.cab',
  // Archives
  '.zip', '.zipx', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.tbz2',
  '.xz', '.zst', '.lz', '.lzma', '.z', '.gzip',
  // Disk images / packages
  '.iso', '.img', '.bin', '.dmg', '.pkg', '.deb', '.run', '.apkg',
  // Docs
  '.pdf'
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

// Split archives: file.001, file.r00, file.z01 ...
const SPLIT_ARCHIVE_EXTENSION = /^\.(r\d{2}|z\d{2}|\d{3})$/;

function isAllowedExtension(extension) {
  return ALLOWED_EXTENSIONS.has(extension) || SPLIT_ARCHIVE_EXTENSION.test(extension);
}

function isAllowedImageExtension(extension) {
  return ALLOWED_IMAGE_EXTENSIONS.has(extension);
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, file.fieldname === 'cover' ? config.coverDir : config.uploadDir);
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
    files: 2,
    fields: 20,
    fieldSize: 100 * 1024
  },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();

    if (file.fieldname === 'cover') {
      if (!isAllowedImageExtension(ext)) {
        const error = new Error(
          `Hindi supported ang image type na "${ext || 'walang extension'}". Gumamit ng JPG, PNG, WEBP, GIF o AVIF.`
        );
        error.code = 'INVALID_IMAGE_TYPE';
        return cb(error);
      }
      return cb(null, true);
    }

    if (!isAllowedExtension(ext)) {
      const error = new Error(
        `Hindi supported ang "${ext || 'walang extension'}" na file. Mga allowed: ${[...ALLOWED_EXTENSIONS].join(', ')} at split archives (.001, .r00, .z01).`
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

module.exports = {
  upload,
  removeUploadedFile,
  ALLOWED_EXTENSIONS,
  ALLOWED_IMAGE_EXTENSIONS,
  isAllowedExtension,
  isAllowedImageExtension
};
