'use strict';

const express = require('express');
const path = require('path');
const multer = require('multer');
const { config } = require('./config');
const { router: publicRouter } = require('./routes/public');
const { router: adminRouter } = require('./routes/admin');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; ')
  );
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

app.use(
  express.static(path.join(config.root, 'public'), {
    index: false,
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      // Huwag i-cache ang HTML/JS/CSS para agad makuha ang mga update.
      if (/\.(?:html|js|css)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  })
);

app.get('/', (req, res) => {
  res.sendFile(path.join(config.root, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(config.root, 'public', 'admin.html'));
});

app.get('/license', (req, res) => {
  res.sendFile(path.join(config.root, 'public', 'license.html'));
});

app.use(
  '/media/covers',
  express.static(config.coverDir, {
    index: false,
    maxAge: '7d',
    immutable: true
  })
);

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

app.use(publicRouter);
app.use(adminRouter);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Hindi mahanap ang endpoint na ito.' });
  }
  return res.status(404).sendFile(path.join(config.root, 'public', '404.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `Sobrang laki ng file. Maximum na ${config.maxUploadMb} MB.` });
    }
    return res.status(400).json({ error: 'Hindi na-upload ang file. Subukan ulit.' });
  }

  if (error.code === 'INVALID_FILE_TYPE' || error.code === 'INVALID_FILE_NAME' || error.code === 'INVALID_IMAGE_TYPE') {
    return res.status(400).json({ error: error.message });
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid na request body.' });
  }

  console.error('[server error]', error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'May naganap na error sa server. Subukan ulit.' });
});

module.exports = { app };
