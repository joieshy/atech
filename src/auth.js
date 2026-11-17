'use strict';

const crypto = require('crypto');
const { config } = require('./config');
const { db } = require('./db');

const COOKIE_NAME = 'atech_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      cookies[key] = part.slice(index + 1).trim();
    }
  }
  return cookies;
}

function isHttps(req) {
  return Boolean(req.secure || String(req.headers['x-forwarded-proto'] || '').startsWith('https'));
}

/* ------------------------------- sessions -------------------------------- */

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashIp(ip) {
  return crypto
    .createHmac('sha256', config.sessionSecret)
    .update(String(ip || ''))
    .digest('hex')
    .slice(0, 32);
}

function createSession(req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  db.prepare(
    `INSERT INTO sessions (token_hash, created_at, last_seen_at, expires_at, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    hashToken(token),
    now.toISOString(),
    now.toISOString(),
    expiresAt.toISOString(),
    hashIp(req.ip),
    String(req.headers['user-agent'] || '').slice(0, 300)
  );

  // Huwag hayaang dumami ang expired/old sessions.
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());

  return token;
}

function getSessionToken(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME] || null;
}

function getSessionFromToken(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;

  const session = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(hashToken(token));
  if (!session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(session.token_hash);
    return null;
  }

  return session;
}

function getSession(req) {
  return getSessionFromToken(getSessionToken(req));
}

function touchSession(session) {
  if (!session) return session;
  if (Date.now() - new Date(session.last_seen_at).getTime() > 60 * 1000) {
    session.last_seen_at = new Date().toISOString();
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(
      session.last_seen_at,
      session.token_hash
    );
  }
  return session;
}

function setSessionCookie(req, res, token) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (isHttps(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function createSessionCookie(req, res) {
  const token = createSession(req);
  setSessionCookie(req, res, token);
  return token;
}

function clearSessionCookie(req, res) {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isHttps(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function destroySession(req) {
  const token = getSessionToken(req);
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }
}

function destroyAllSessions() {
  db.prepare('DELETE FROM sessions').run();
}

function destroyOtherSessions(req) {
  const token = getSessionToken(req);
  if (!token) return 0;
  return db.prepare('DELETE FROM sessions WHERE token_hash != ?').run(hashToken(token)).changes;
}

function listSessions(req) {
  const token = getSessionToken(req);
  const currentHash = token ? hashToken(token) : null;

  return db
    .prepare(
      `SELECT token_hash, created_at, last_seen_at, expires_at, ip_hash, user_agent
       FROM sessions WHERE expires_at > ?
       ORDER BY last_seen_at DESC`
    )
    .all(new Date().toISOString())
    .map((session) => ({
      current: session.token_hash === currentHash,
      createdAt: session.created_at,
      lastSeenAt: session.last_seen_at,
      expiresAt: session.expires_at,
      ipHash: session.ip_hash ? session.ip_hash.slice(0, 12) : null,
      userAgent: session.user_agent || ''
    }));
}

function isAuthenticated(req) {
  const session = getSession(req);
  if (!session) return false;
  touchSession(session);
  return true;
}

function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Kailangan mong mag-login bilang admin.' });
  }
  touchSession(session);
  req.adminSession = session;
  return next();
}

/**
 * CSRF hardening: lahat ng state-changing admin requests ay dapat galing
 * sa fetch/XHR ng site (custom header). Hindi kayang i-set ito ng simpleng
 * cross-site form.
 */
function requireCsrf(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const hasHeader = req.get('X-Requested-With') === 'XMLHttpRequest';
  const sameOrigin = req.get('Sec-Fetch-Site') === 'same-origin';

  if (!hasHeader && !sameOrigin) {
    return res.status(403).json({ error: 'Invalid request. I-refresh ang admin page at subukan ulit.' });
  }
  return next();
}

function verifyPassword(input) {
  if (typeof input !== 'string' || input.length === 0) return false;
  const given = crypto.createHash('sha256').update(input).digest();
  const actual = crypto.createHash('sha256').update(config.adminPassword).digest();
  return crypto.timingSafeEqual(given, actual);
}

/* ------------------------------ rate limiting ----------------------------- */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map();

function loginRateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || record.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  record.count += 1;
  if (record.count > MAX_ATTEMPTS) {
    const retry = Math.ceil((record.resetAt - now) / 60000);
    return res.status(429).json({
      error: `Sobra na ang pagtatangka. Subukan ulit pagkalipas ng ${retry} minuto.`
    });
  }
  return next();
}

function clearLoginAttempts(ip) {
  attempts.delete(ip);
}

/* --------------------------- change-password limit ------------------------ */

const PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_MAX_ATTEMPTS = 8;
const passwordAttempts = new Map();

function passwordChangeRateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const record = passwordAttempts.get(key);

  if (!record || record.resetAt <= now) {
    passwordAttempts.set(key, { count: 1, resetAt: now + PASSWORD_WINDOW_MS });
    return next();
  }

  record.count += 1;
  if (record.count > PASSWORD_MAX_ATTEMPTS) {
    const retry = Math.ceil((record.resetAt - now) / 60000);
    return res.status(429).json({
      error: `Sobra na ang pagtatangka. Subukan ulit pagkalipas ng ${retry} minuto.`
    });
  }
  return next();
}

function clearPasswordChangeAttempts(ip) {
  passwordAttempts.delete(ip);
}

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const map of [attempts, passwordAttempts]) {
    for (const [key, record] of map) {
      if (record.resetAt <= now) map.delete(key);
    }
  }
}, 60 * 1000);
sweeper.unref();

const sessionSweeper = setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
}, 30 * 60 * 1000);
sessionSweeper.unref();

module.exports = {
  COOKIE_NAME,
  isAuthenticated,
  requireAdmin,
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
};
