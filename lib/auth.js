'use strict';

/* =====================================================================
 * Class Mood Journey — lib/auth.js
 * ---------------------------------------------------------------------
 * Admin login, using only Node.js built-in modules.
 *
 *  - The password itself is NEVER stored. config.json only keeps a
 *    scrypt hash: "scrypt:<salt>:<hash>". Set it with
 *        node server.js --set-admin-password "your password"
 *  - After logging in, the browser gets a random session token in an
 *    HttpOnly cookie (JavaScript can't read it) with SameSite=Strict
 *    (other websites can't use it).
 *  - Sessions live in memory: restarting the server logs everyone out.
 *  - Wrong passwords are rate-limited to stop guessing.
 * ===================================================================== */

const crypto = require('node:crypto');

const COOKIE_NAME = 'mood_admin';
const SESSION_MS = 8 * 60 * 60 * 1000;                     // stay logged in for 8 hours
const LOGIN_LIMIT = { windowMs: 5 * 60 * 1000, maxTries: 5 }; // 5 wrong tries per 5 minutes
const MAX_PASSWORD_LENGTH = 200;

// ---------- Password hashing ----------

/** Turns a password into "scrypt:<salt hex>:<hash hex>" (safe to store). */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Checks a typed password against a stored hash, in constant time. */
function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || !password || password.length > MAX_PASSWORD_LENGTH) return false;
  const [kind, saltHex, hashHex] = String(storedHash || '').split(':');
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// ---------- Sessions ----------

const sessions = new Map(); // token -> expiry time (ms)

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  return token;
}

/** Reads one cookie value from the request. */
function readCookie(req, name) {
  const header = String(req.headers.cookie || '');
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

/** True when the request comes from a logged-in admin. */
function isAdmin(req) {
  const token = readCookie(req, COOKIE_NAME);
  const expiresAt = token && sessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function endSession(req) {
  sessions.delete(readCookie(req, COOKIE_NAME));
}

/** The Set-Cookie value that logs the browser in. */
function sessionCookie(token, req) {
  // Behind HTTPS on a hosting site, also mark the cookie Secure
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`;
}

/** The Set-Cookie value that logs the browser out. */
function clearedCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

// ---------- Guessing protection ----------

const failedLogins = new Map(); // visitor address -> list of failure times

/** True when this visitor has had too many wrong passwords lately. */
function isLoginBlocked(address) {
  const now = Date.now();
  const recent = (failedLogins.get(address) || []).filter((time) => now - time < LOGIN_LIMIT.windowMs);
  failedLogins.set(address, recent);
  return recent.length >= LOGIN_LIMIT.maxTries;
}

function recordFailedLogin(address) {
  const list = failedLogins.get(address) || [];
  list.push(Date.now());
  failedLogins.set(address, list);
}

function clearFailedLogins(address) {
  failedLogins.delete(address);
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  isAdmin,
  endSession,
  sessionCookie,
  clearedCookie,
  isLoginBlocked,
  recordFailedLogin,
  clearFailedLogins,
};
