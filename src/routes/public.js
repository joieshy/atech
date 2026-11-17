'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db } = require('../db');
const { config } = require('../config');
const { toPublicInstaller, toAdminInstaller } = require('../utils');
const { requireAdmin } = require('../auth');

const router = express.Router();

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(`${ip}:${config.sessionSecret}`).digest('hex').slice(0, 32);
}

/* --------------------------------- public --------------------------------- */

router.get('/api/site', (req, res) => {
  const settings = getSettings();
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS installers, COALESCE(SUM(downloads), 0) AS downloads
       FROM installers WHERE published = 1`
    )
    .get();
  const categories = db
    .prepare(
      `SELECT c.slug, c.name, c.description, c.color, c.icon,
              COUNT(i.id) AS installers, COALESCE(SUM(i.downloads), 0) AS downloads
       FROM categories c
       LEFT JOIN installers i ON i.category = c.slug AND i.published = 1
       GROUP BY c.slug
       ORDER BY c.sort ASC`
    )
    .all();
  const latest = db.prepare('SELECT MAX(updated_at) AS at FROM installers WHERE published = 1').get().at;

  res.set('Cache-Control', 'no-store');
  res.json({
    site: {
      name: settings.site_name || 'ATECH',
      tagline: settings.tagline || '',
      description: settings.site_description || '',
      socials: {
        facebook: settings.facebook_url || '',
        telegram: settings.telegram_url || '',
        youtube: settings.youtube_url || '',
        email: settings.contact_email || ''
      }
    },
    stats: {
      installers: stats.installers || 0,
      downloads: stats.downloads || 0,
      categories: categories.length
    },
    categories,
    updatedAt: latest || null
  });
});

router.get('/api/installers', (req, res) => {
  const search = String(req.query.q || '').trim().slice(0, 80);
  const category = String(req.query.category || 'all').slice(0, 40);
  const sort = String(req.query.sort || 'latest');

  const where = ['published = 1'];
  const params = [];

  if (category && category !== 'all') {
    where.push('category = ?');
    params.push(category);
  }

  if (search) {
    where.push('(title LIKE ? OR description LIKE ? OR version LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const orderBy = {
    latest: 'featured DESC, created_at DESC, id DESC',
    popular: 'downloads DESC, created_at DESC',
    oldest: 'created_at ASC, id ASC',
    name: 'title COLLATE NOCASE ASC'
  }[sort] || 'featured DESC, created_at DESC, id DESC';

  const rows = db
    .prepare(
      `SELECT id, slug, title, category, version, description, file_size, file_ext,
              downloads, featured, is_demo, created_at, updated_at
       FROM installers
       WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT 300`
    )
    .all(...params);

  res.set('Cache-Control', 'no-store');
  res.json({ installers: rows.map(toPublicInstaller), total: rows.length });
});

router.get('/download/:slug', (req, res, next) => {
  const row = db
    .prepare('SELECT * FROM installers WHERE slug = ? AND published = 1')
    .get(String(req.params.slug));

  if (!row || !row.file_name) {
    return res.status(404).send('Hindi mahanap ang installer na ito.');
  }

  const storedName = path.basename(row.file_name);
  const filePath = path.join(config.uploadDir, storedName);

  if (!filePath.startsWith(config.uploadDir) || !fs.existsSync(filePath)) {
    return res.status(410).send('Wala na ang file sa server. Kontakin ang admin.');
  }

  db.prepare('UPDATE installers SET downloads = downloads + 1 WHERE id = ?').run(row.id);
  db.prepare('INSERT INTO download_log (installer_id, ip_hash, user_agent, created_at) VALUES (?, ?, ?, ?)').run(
    row.id,
    hashIp(req.ip || ''),
    String(req.headers['user-agent'] || '').slice(0, 300),
    new Date().toISOString()
  );

  res.set('Cache-Control', 'no-store');
  const downloadName = row.original_name || `${row.slug}${row.file_ext || ''}`;
  res.download(filePath, downloadName, (error) => {
    if (error && !res.headersSent) next(error);
  });
});

/* ------------------------------- admin only ------------------------------- */

router.get('/api/admin/installers', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM installers ORDER BY created_at DESC, id DESC').all();
  res.set('Cache-Control', 'no-store');
  res.json({ installers: rows.map(toAdminInstaller) });
});

module.exports = { router, getSettings };
