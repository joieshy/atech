'use strict';

const { app } = require('./src/app');
const { config } = require('./src/config');
const { db } = require('./src/db');

const server = app.listen(config.port, config.host, () => {
  const lines = [
    '',
    '  ATECH installer hub is running',
    `  Local:    http://localhost:${config.port}`,
    `  Admin:    http://localhost:${config.port}/admin`,
    `  Uploads:  ${config.uploadDir}`,
    `  Max file: ${config.maxUploadMb} MB`
  ];
  if (config.generatedPassword) {
    lines.push('', `  Generated admin password: ${config.generatedPassword}`, '  (nasa .env file ito — palitan kung gusto mo)');
  }
  console.log(lines.join('\n'));
  console.log('');
});

// Malalaking installer uploads: huwag putulin ng default 5-minute Node timeout.
server.requestTimeout = 60 * 60 * 1000; // 1 hour
server.headersTimeout = 2 * 60 * 1000;

function shutdown(signal) {
  console.log(`\n[${signal}] Sinasara ang server...`);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
