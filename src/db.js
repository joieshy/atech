'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { config } = require('./config');
const { createZip } = require('./demo-zip');

const db = new Database(path.join(config.dataDir, 'atech.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT '#22d3ee',
  icon        TEXT NOT NULL DEFAULT 'box',
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS installers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL REFERENCES categories(slug),
  version       TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  file_name     TEXT,
  original_name TEXT,
  file_size     INTEGER NOT NULL DEFAULT 0,
  file_ext      TEXT NOT NULL DEFAULT '',
  cover_name    TEXT,
  downloads     INTEGER NOT NULL DEFAULT 0,
  featured      INTEGER NOT NULL DEFAULT 0,
  published     INTEGER NOT NULL DEFAULT 1,
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_installers_category ON installers(category);
CREATE INDEX IF NOT EXISTS idx_installers_published ON installers(published);

CREATE TABLE IF NOT EXISTS download_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  installer_id INTEGER NOT NULL REFERENCES installers(id) ON DELETE CASCADE,
  ip_hash      TEXT,
  user_agent   TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_download_log_created ON download_log(created_at);
CREATE INDEX IF NOT EXISTS idx_download_log_installer ON download_log(installer_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  ip_hash      TEXT,
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);

// Migration para sa existing databases na wala pang cover image column.
const installerColumns = db.prepare('PRAGMA table_info(installers)').all();
if (!installerColumns.some((column) => column.name === 'cover_name')) {
  db.exec('ALTER TABLE installers ADD COLUMN cover_name TEXT');
}

const CATEGORIES = [
  {
    slug: 'pisowifi',
    name: 'PisoWiFi',
    description: 'Voucher, billing at captive portal setup para sa WiFi vendo business.',
    color: '#22d3ee',
    icon: 'wifi',
    sort: 1
  },
  {
    slug: 'pisonet',
    name: 'PisoNet',
    description: 'Timer, coin slot at client-server installer para sa pisonet shop.',
    color: '#a78bfa',
    icon: 'monitor',
    sort: 2
  },
  {
    slug: 'others',
    name: 'Iba pa',
    description: 'Drivers, LAN tools, voucher generator at iba pang kailangan sa shop.',
    color: '#94a3b8',
    icon: 'box',
    sort: 3
  }
];

const SETTINGS = {
  site_name: 'ATECH',
  tagline: 'Installer Hub para sa PisoWiFi, PisoNet at PisoTab',
  site_description:
    'Isang lugar para sa lahat ng installer na kailangan mo para sa pisonet, pisowifi at pisotab business mo. Libreng i-download, updated at ready sa VPS o shop PC.',
  facebook_url: '',
  telegram_url: '',
  youtube_url: '',
  contact_email: ''
};

const buildCategory = db.prepare(`
  INSERT INTO categories (slug, name, description, color, icon, sort)
  VALUES (@slug, @name, @description, @color, @icon, @sort)
  ON CONFLICT(slug) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    color = excluded.color,
    icon = excluded.icon,
    sort = excluded.sort
`);
for (const category of CATEGORIES) buildCategory.run(category);

const buildSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(SETTINGS)) buildSetting.run(key, value);

/* ---------------------------------- demo --------------------------------- */

const DEMO_INSTALLERS = [
  {
    slug: 'pisowifi-vendo-suite',
    title: 'PisoWiFi Vendo Suite',
    category: 'pisowifi',
    version: '4.2.1',
    description:
      'Kumpletong package para sa PisoWiFi vendo: captive portal, voucher generator, bandwidth limiter at admin dashboard. May kasamang setup guide para sa MikroTik at TP-Link router.',
    file: 'demo-pisowifi-vendo-suite.zip',
    original: 'PisoWiFi-Vendo-Suite-v4.2.1.zip',
    downloads: 0,
    featured: 1,
    created_at: '2026-11-12T08:30:00.000Z'
  },
  {
    slug: 'pisonet-server-pro',
    title: 'PisoNet Server Pro',
    category: 'pisonet',
    version: '3.8.0',
    description:
      'Server-side installer para sa pisonet shop. Real-time monitoring ng lahat ng client, coin slot integration, at auto-shutdown kapag ubos na ang oras.',
    file: 'demo-pisonet-server-pro.zip',
    original: 'PisoNet-Server-Pro-v3.8.0.zip',
    downloads: 0,
    featured: 1,
    created_at: '2026-11-09T13:15:00.000Z'
  },
  {
    slug: 'pisonet-client',
    title: 'PisoNet Client',
    category: 'pisonet',
    version: '3.8.0',
    description:
      'Client installer para sa bawat PC. Magaan sa resources, auto-update support at compatible sa Windows 7 hanggang Windows 11.',
    file: 'demo-pisonet-client.zip',
    original: 'PisoNet-Client-v3.8.0.zip',
    downloads: 0,
    created_at: '2026-11-09T13:20:00.000Z'
  },
  {
    slug: 'voucher-generator-lite',
    title: 'Voucher Generator Lite',
    category: 'others',
    version: '1.3.0',
    description:
      'Mabilisang gumawa ng printable WiFi vouchers. May batch generation, expiry date at CSV export para sa pisowifi business mo.',
    file: 'demo-voucher-generator-lite.zip',
    original: 'Voucher-Generator-Lite-v1.3.0.zip',
    downloads: 0,
    created_at: '2026-10-21T06:00:00.000Z'
  }
];

const DEMO_NOTE = [
  'ATECH sample installer package',
  '================================',
  '',
  'Ito ay placeholder file na kasama ng ATECH para makita mo agad ang itsura',
  'ng download page. Palitan ito ng totoong installer sa admin panel.',
  '',
  'Paano: pumunta sa /admin, i-delete ang demo entries, tapos mag-upload',
  'ng totoong installer files mo.',
  ''
].join('\r\n');

function writeDemoPackage(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, createZip('README.txt', DEMO_NOTE));
  }
}

function seedDemoInstallers() {
  if (!config.seedDemo) return;
  const count = db.prepare('SELECT COUNT(*) AS total FROM installers').get().total;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO installers (
      slug, title, category, version, description, file_name, original_name,
      file_size, file_ext, downloads, featured, published, is_demo, created_at, updated_at
    ) VALUES (
      @slug, @title, @category, @version, @description, @file_name, @original_name,
      @file_size, @file_ext, @downloads, @featured, 1, 1, @created_at, @created_at
    )
  `);

  for (const item of DEMO_INSTALLERS) {
    const { file, original, ...fields } = item;
    const filePath = path.join(config.uploadDir, file);
    writeDemoPackage(filePath);
    const stat = fs.statSync(filePath);
    insert.run({
      ...fields,
      downloads: fields.downloads || 0,
      featured: fields.featured ? 1 : 0,
      file_name: file,
      original_name: original,
      file_size: stat.size,
      file_ext: 'zip',
      updated_at: item.created_at
    });
  }
}

/** Kung nawala ang sample file sa disk, i-regenerate para hindi 404 ang demo. */
function repairDemoFiles() {
  if (!config.seedDemo) return;
  const rows = db
    .prepare("SELECT id, slug, file_name FROM installers WHERE is_demo = 1 AND file_name IS NOT NULL")
    .all();

  for (const row of rows) {
    const fileName = path.basename(row.file_name);
    const filePath = path.join(config.uploadDir, fileName);
    if (fs.existsSync(filePath)) continue;
    writeDemoPackage(filePath);
    db.prepare('UPDATE installers SET file_size = ?, file_ext = ? WHERE id = ?').run(
      fs.statSync(filePath).size,
      '.zip',
      row.id
    );
  }
}

seedDemoInstallers();
repairDemoFiles();

module.exports = { db, CATEGORIES };
