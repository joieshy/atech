'use strict';

const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { db } = require('../db');
const { config, persistAdminPassword } = require('../config');
const { upload, removeUploadedFile } = require('../upload');
const { slugify, uniqueSlug, toAdminInstaller, clampText } = require('../utils');
const {
  requireAdmin,
  isAuthenticated,
  requireCsrf,
  verifyPassword,
  createSessionCookie,
  clearSessionCookie,
  destroySession,
  destroyAllSessions,
  destroyOtherSessions,
  listSessions,
  loginRateLimit,
  clearLoginAttempts,
  passwordChangeRateLimit,
  clearPasswordChangeAttempts
} = require('../auth');

const router = express.Router();

// Lahat ng state-changing admin requests ay kailangan ng custom header
// (ginagawa ito ng admin frontend) para mapigilan ang CSRF.
router.use('/api/admin', requireCsrf);

const ALLOWED_SETTINGS = new Set([
  'site_name',
  'tagline',
  'site_description',
  'facebook_url',
  'telegram_url',
  'youtube_url',
  'contact_email'
]);

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'on', 'yes'].includes(String(value).toLowerCase());
}

function readInstaller(id) {
  return db.prepare('SELECT * FROM installers WHERE id = ?').get(id);
}

function categoryExists(slug) {
  return Boolean(db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(slug));
}

function fileMeta(file) {
  const ext = path.extname(file.originalname || file.filename || '').toLowerCase();
  return {
    file_name: file.filename,
    original_name: file.originalname || file.filename,
    file_size: file.size,
    file_ext: ext
  };
}

async function unlinkStored(fileName) {
  if (!fileName) return;
  const target = path.join(config.uploadDir, path.basename(fileName));
  try {
    await fs.unlink(target);
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[admin] hindi ma-delete ang file:', target, error.message);
  }
}

async function unlinkCover(fileName) {
  if (!fileName) return;
  const target = path.join(config.coverDir, path.basename(fileName));
  try {
    await fs.unlink(target);
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[admin] hindi ma-delete ang cover:', target, error.message);
  }
}

function uploadedFiles(req) {
  const files = req.files || {};
  return {
    installer: Array.isArray(files.file) ? files.file[0] : null,
    cover: Array.isArray(files.cover) ? files.cover[0] : null
  };
}

/* ---------------------------------- auth ---------------------------------- */

router.post('/api/admin/login', loginRateLimit, (req, res) => {
  const password = req.body && req.body.password;
  if (!verifyPassword(password)) {
    return res.status(401).json({ error: 'Mali ang password. Subukan ulit.' });
  }
  clearLoginAttempts(req.ip);
  createSessionCookie(req, res);
  return res.json({ ok: true });
});

router.post('/api/admin/logout', (req, res) => {
  destroySession(req);
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

router.post('/api/admin/change-password', requireAdmin, passwordChangeRateLimit, (req, res) => {
  const body = req.body || {};
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

  if (!verifyPassword(currentPassword)) {
    return res.status(400).json({ error: 'Mali ang current password.' });
  }
  if (newPassword.length < 10) {
    return res.status(400).json({ error: 'Dapat hindi bababa sa 10 characters ang bagong password.' });
  }
  if (newPassword.length > 128) {
    return res.status(400).json({ error: 'Masyadong mahaba ang bagong password (128 characters max).' });
  }
  if (/\s/.test(newPassword)) {
    return res.status(400).json({ error: 'Walang spaces ang password.' });
  }
  if (/["'\\#]/.test(newPassword)) {
    return res.status(400).json({ error: 'Iwasan ang quotes, backslash at # sa password.' });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: 'Dapat iba ang bagong password sa current password.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Hindi tugma ang confirm password.' });
  }

  try {
    persistAdminPassword(newPassword);
  } catch (error) {
    console.error('[admin] hindi ma-save ang bagong password:', error.message);
    return res.status(500).json({ error: 'Hindi ma-save ang password sa server. Subukan ulit.' });
  }

  clearPasswordChangeAttempts(req.ip);
  destroyAllSessions();
  createSessionCookie(req, res);
  return res.json({ ok: true });
});

router.get('/api/admin/session', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ authenticated: isAuthenticated(req) });
});

router.get('/api/admin/sessions', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ sessions: listSessions(req) });
});

router.post('/api/admin/sessions/revoke-others', requireAdmin, (req, res) => {
  const revoked = destroyOtherSessions(req);
  res.json({ ok: true, revoked });
});

/* -------------------------------- overview -------------------------------- */

router.get('/api/admin/overview', requireAdmin, (req, res) => {
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS installers,
              SUM(CASE WHEN published = 1 THEN 1 ELSE 0 END) AS published,
              SUM(CASE WHEN published = 0 THEN 1 ELSE 0 END) AS drafts,
              COALESCE(SUM(downloads), 0) AS downloads,
              COALESCE(SUM(file_size), 0) AS storage
       FROM installers`
    )
    .get();

  const categories = db
    .prepare(
      `SELECT c.slug, c.name, c.color, c.icon,
              COUNT(i.id) AS installers, COALESCE(SUM(i.downloads), 0) AS downloads
       FROM categories c
       LEFT JOIN installers i ON i.category = c.slug
       GROUP BY c.slug ORDER BY c.sort ASC`
    )
    .all();

  const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);
  const dailyRows = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS total
       FROM download_log WHERE created_at >= ? GROUP BY day`
    )
    .all(since.toISOString());
  const dailyMap = new Map(dailyRows.map((row) => [row.day, row.total]));
  const daily = [];
  for (let index = 0; index < 7; index += 1) {
    const day = new Date(since.getTime() + index * 24 * 60 * 60 * 1000);
    const key = day.toISOString().slice(0, 10);
    daily.push({ date: key, total: dailyMap.get(key) || 0 });
  }

  const recent = db
    .prepare(
      `SELECT d.created_at AS at, i.title, i.slug, i.file_ext
       FROM download_log d JOIN installers i ON i.id = d.installer_id
       ORDER BY d.id DESC LIMIT 8`
    )
    .all();

  const top = db
    .prepare('SELECT title, slug, downloads FROM installers ORDER BY downloads DESC, id ASC LIMIT 5')
    .all();

  res.set('Cache-Control', 'no-store');
  res.json({
    totals: {
      installers: totals.installers || 0,
      published: totals.published || 0,
      drafts: totals.drafts || 0,
      downloads: totals.downloads || 0,
      storage: totals.storage || 0
    },
    categories,
    daily,
    recent,
    top
  });
});

/* ------------------------------- installers ------------------------------- */

router.post('/api/admin/installers', requireAdmin, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), (req, res) => {
  const { installer: installerFile, cover: coverFile } = uploadedFiles(req);
  const fail = (status, message) => {
    void removeUploadedFile(installerFile);
    void removeUploadedFile(coverFile);
    return res.status(status).json({ error: message });
  };

  if (!installerFile) return fail(400, 'Pumili muna ng installer file na i-upload.');
  if (coverFile && coverFile.size > config.maxCoverMb * 1024 * 1024) {
    return fail(400, `Sobrang laki ng cover image. Maximum na ${config.maxCoverMb} MB.`);
  }

  const title = clampText(req.body.title, 120);
  const category = clampText(req.body.category, 40);
  const version = clampText(req.body.version, 40);
  const description = clampText(req.body.description, 1200);

  if (title.length < 3) return fail(400, 'Ilagay ang pangalan ng installer (3 characters pataas).');
  if (!categoryExists(category)) return fail(400, 'Pumili ng tamang category.');
  if (description.length > 1200) return fail(400, 'Masyadong mahaba ang description (1200 characters max).');

  const now = new Date().toISOString();
  const slug = uniqueSlug(db, req.body.slug || title);
  const meta = fileMeta(installerFile);

  const info = db
    .prepare(
      `INSERT INTO installers (
         slug, title, category, version, description, file_name, original_name,
         file_size, file_ext, cover_name, downloads, featured, published, is_demo, created_at, updated_at
       ) VALUES (
         @slug, @title, @category, @version, @description, @file_name, @original_name,
         @file_size, @file_ext, @cover_name, 0, @featured, @published, 0, @now, @now
       )`
    )
    .run({
      slug,
      title,
      category,
      version,
      description,
      ...meta,
      cover_name: coverFile ? coverFile.filename : null,
      featured: toBool(req.body.featured) ? 1 : 0,
      published: toBool(req.body.published, true) ? 1 : 0,
      now
    });

  return res.status(201).json({ installer: toAdminInstaller(readInstaller(info.lastInsertRowid)) });
});

router.patch('/api/admin/installers/:id', requireAdmin, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), async (req, res) => {
  const { installer: installerFile, cover: coverFile } = uploadedFiles(req);
  const cleanup = () => {
    void removeUploadedFile(installerFile);
    void removeUploadedFile(coverFile);
  };

  const id = Number(req.params.id);
  const existing = Number.isInteger(id) ? readInstaller(id) : null;
  if (!existing) {
    cleanup();
    return res.status(404).json({ error: 'Hindi mahanap ang installer na ito.' });
  }
  if (coverFile && coverFile.size > config.maxCoverMb * 1024 * 1024) {
    cleanup();
    return res.status(400).json({ error: `Sobrang laki ng cover image. Maximum na ${config.maxCoverMb} MB.` });
  }

  const updates = { updated_at: new Date().toISOString() };
  const body = req.body || {};

  if (body.title !== undefined) {
    const title = clampText(body.title, 120);
    if (title.length < 3) {
      cleanup();
      return res.status(400).json({ error: 'Masyadong maikli ang pangalan ng installer.' });
    }
    updates.title = title;
  }

  if (body.category !== undefined) {
    const category = clampText(body.category, 40);
    if (!categoryExists(category)) {
      cleanup();
      return res.status(400).json({ error: 'Pumili ng tamang category.' });
    }
    updates.category = category;
  }

  if (body.version !== undefined) updates.version = clampText(body.version, 40);
  if (body.description !== undefined) updates.description = clampText(body.description, 1200);
  if (body.featured !== undefined) updates.featured = toBool(body.featured) ? 1 : 0;
  if (body.published !== undefined) updates.published = toBool(body.published) ? 1 : 0;

  if (body.slug !== undefined && clampText(body.slug, 64)) {
    updates.slug = uniqueSlug(db, body.slug, id);
  }

  let uploadedInstallerMeta = null;
  if (installerFile) {
    uploadedInstallerMeta = fileMeta(installerFile);
    Object.assign(updates, uploadedInstallerMeta);
    // Kapag pinalitan ang file ng demo entry, ituring na itong totoong installer.
    if (existing.is_demo) updates.is_demo = 0;
    if (!updates.slug && !existing.slug) updates.slug = uniqueSlug(db, existing.title, id);
  }

  const removeCover = toBool(body.removeCover);
  if (coverFile) {
    updates.cover_name = coverFile.filename;
  } else if (removeCover) {
    updates.cover_name = null;
  }

  const keys = Object.keys(updates);
  const assignments = keys.map((key) => `${key} = @${key}`).join(', ');
  try {
    db.prepare(`UPDATE installers SET ${assignments} WHERE id = @id`).run({ ...updates, id });
  } catch (error) {
    cleanup();
    throw error;
  }

  if (uploadedInstallerMeta && existing.file_name) {
    await unlinkStored(existing.file_name);
  }
  if ((coverFile || removeCover) && existing.cover_name) {
    await unlinkCover(existing.cover_name);
  }

  return res.json({ installer: toAdminInstaller(readInstaller(id)) });
});

router.delete('/api/admin/installers/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const existing = Number.isInteger(id) ? readInstaller(id) : null;
  if (!existing) return res.status(404).json({ error: 'Hindi mahanap ang installer na ito.' });

  db.prepare('DELETE FROM installers WHERE id = ?').run(id);
  await unlinkStored(existing.file_name);
  await unlinkCover(existing.cover_name);
  return res.json({ ok: true });
});

/* -------------------------------- settings -------------------------------- */

router.get('/api/admin/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  res.set('Cache-Control', 'no-store');
  res.json({
    settings,
    categories: db.prepare('SELECT slug, name, color, icon FROM categories ORDER BY sort ASC').all(),
    maxUploadMb: config.maxUploadMb,
    maxCoverMb: config.maxCoverMb,
    runtime: `Node ${process.version}`
  });
});

router.put('/api/admin/settings', requireAdmin, (req, res) => {
  const body = req.body || {};
  const update = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const allowedEntries = Object.entries(body).filter(([key]) => ALLOWED_SETTINGS.has(key));

  if (allowedEntries.length === 0) {
    return res.status(400).json({ error: 'Walang valid na setting na naipasa.' });
  }

  const writeAll = db.transaction((entries) => {
    for (const [key, value] of entries) {
      update.run(key, clampText(value, 500));
    }
  });
  writeAll(allowedEntries);

  return res.json({ ok: true });
});

module.exports = { router };
