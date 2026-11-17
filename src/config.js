'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

function randomPassword(length = 16) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function bootstrapEnv() {
  if (fs.existsSync(ENV_PATH)) return null;

  const password = randomPassword();
  const content = [
    '# ATECH server configuration',
    'PORT=3000',
    'HOST=0.0.0.0',
    `ADMIN_PASSWORD=${password}`,
    `SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`,
    '# Maximum size of a single installer file, in megabytes',
    'MAX_UPLOAD_MB=2048',
    '# Set to false if you do not want the sample installer entries',
    'SEED_DEMO=true',
    ''
  ].join('\n');

  fs.writeFileSync(ENV_PATH, content, 'utf8');
  return password;
}

const generatedPassword = bootstrapEnv();

require('dotenv').config({ path: ENV_PATH, quiet: true });

const config = {
  root: ROOT,
  envPath: ENV_PATH,
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  adminPassword: process.env.ADMIN_PASSWORD || 'atech-admin',
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  maxUploadMb: Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 2048),
  seedDemo: String(process.env.SEED_DEMO || 'true').toLowerCase() !== 'false',
  dataDir: path.join(ROOT, 'data'),
  uploadDir: path.join(ROOT, 'storage', 'installers'),
  generatedPassword
};

for (const dir of [config.dataDir, config.uploadDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = { config };
