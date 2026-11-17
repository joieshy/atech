'use strict';

function slugify(input) {
  const slug = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return slug || 'installer';
}

function uniqueSlug(db, requested, excludeId = null) {
  const base = slugify(requested);
  const statement = db.prepare('SELECT 1 FROM installers WHERE slug = ? AND id != ?');
  let candidate = base;
  let counter = 1;
  while (statement.get(candidate, excludeId ?? -1)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

function toPublicInstaller(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    version: row.version,
    description: row.description,
    fileSize: row.file_size,
    fileType: row.file_ext ? row.file_ext.replace('.', '').toUpperCase() : '',
    coverUrl: row.cover_name ? `/media/covers/${encodeURIComponent(row.cover_name)}` : null,
    downloads: row.downloads,
    featured: Boolean(row.featured),
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toAdminInstaller(row) {
  return {
    ...toPublicInstaller(row),
    published: Boolean(row.published),
    fileName: row.file_name,
    originalName: row.original_name
  };
}

function clampText(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

module.exports = { slugify, uniqueSlug, toPublicInstaller, toAdminInstaller, clampText };
