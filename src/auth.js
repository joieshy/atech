'use strict';

const crypto = require('crypto');
const { config } = require('./config');

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

function sign(value) {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

function createToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

function isHttps(req) {
  return Boolean(req.secure || String(req.headers['x-forwarded-proto'] || '').startsWith('https'));
}

function setSessionCookie(req, res) {
  const parts = [
    `${COOKIE_NAME}=${createToken()}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (isHttps(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req, res) {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isHttps(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifyToken(cookies[COOKIE_NAME]);
}

function requireAdmin(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Kailangan mong mag-login bilang admin.' });
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

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts) {
    if (record.resetAt <= now) attempts.delete(key);
  }
}, 60 * 1000);
sweeper.unref();

module.exports = {
  COOKIE_NAME,
  isAuthenticated,
  requireAdmin,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  loginRateLimit,
  clearLoginAttempts
};
