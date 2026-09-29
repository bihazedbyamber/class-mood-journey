'use strict';

/* =====================================================================
 * Class Mood Journey — server.js
 * ---------------------------------------------------------------------
 * A tiny web server that uses ONLY Node.js built-in modules, so there is
 * nothing to install. Start it with:   node server.js
 *
 * What it does:
 *   1. Serves the website files (index.html = home, checkin.html, journey.html, admin.html, ...)
 *   2. Offers a small JSON API:
 *        Public
 *          GET  /api/entries          -> visible notes (oldest first)
 *          POST /api/entries          -> save one new note
 *          GET  /api/status           -> are check-ins paused / held for review?
 *        Admin (password login, see lib/auth.js)
 *          POST   /api/admin/login    { password }
 *          POST   /api/admin/logout
 *          GET    /api/admin/session  -> { admin: true/false }
 *          GET    /api/admin/state    -> all notes + piles + settings
 *          PATCH  /api/admin/notes/:id  { hidden, pinned, pending, pileId }
 *          DELETE /api/admin/notes/:id
 *          POST   /api/admin/piles      { name, color }
 *          PATCH  /api/admin/piles/:id  { name, color }
 *          DELETE /api/admin/piles/:id
 *          PATCH  /api/admin/settings   { paused, requireApproval, blockedWords }
 *          GET    /api/admin/export.csv
 *   3. Stores notes in one of two places, chosen by config.json:
 *        - Local mode:  data/entries.json            (default)
 *        - Sheets mode: a Google Sheet, through your Google Apps Script
 *                       web app (when "appsScriptUrl" is filled in)
 *      The admin's decisions (hidden, piles, ...) live in data/admin.json.
 *
 * Set or change the admin password (only a hash is saved in config.json):
 *     node server.js --set-admin-password "your password"
 *
 * The browser only ever talks to THIS server, so there are no CORS problems.
 * ===================================================================== */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const auth = require('./lib/auth.js');
const { createModeration } = require('./lib/moderation.js');
const Moods = require('./moods.js'); // shared with the pages: 5 moods + 4 in-between moods

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------

const ROOT_DIR = __dirname;
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'entries.json');

/** Text length limits. They match the input page and apps-script/Code.gs. */
const LIMITS = {
  whatHappened: 80,
  comment: 300,
  name: 24, // optional; empty = anonymous
  requestBodyBytes: 10 * 1024, // 10 KB is plenty for one entry
};

/** Simple spam protection: one visitor may post this many entries per minute. */
const RATE_LIMIT = { windowMs: 60 * 1000, maxPosts: 10 };

/** In Sheets mode, reuse the last list for a few seconds so many open pages don't flood Google. */
const SHEETS_CACHE_MS = 10 * 1000;

/** Note ids look like UUIDs, "demo-3" or "row-12". Anything else is refused. */
const ID_PATTERN = /^[\w-]{1,80}$/;

/**
 * Only these files are public. Everything else (server.js, config.json,
 * lib/, the data folder) can never be downloaded by a visitor.
 */
const PUBLIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/checkin.html': 'checkin.html',
  '/journey.html': 'journey.html',
  '/admin.html': 'admin.html',
  '/moods.js': 'moods.js',
  '/censor.js': 'censor.js',
  '/style.css': 'style.css',
  '/input.js': 'input.js',
  '/journey.js': 'journey.js',
  '/admin.js': 'admin.js',
  '/admin-login.js': 'admin-login.js',
  '/settings.js': 'settings.js',
  '/i18n.js': 'i18n.js',
  '/site-config.js': 'site-config.js',
  '/api.js': 'api.js',
  '/sprite.svg': 'sprite.svg',
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};

/** Extra safety headers sent with every response. */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  // Only allow our own scripts/styles plus the font services. Blocks injected scripts.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com https://api.fontshare.com",
    // Fontshare links its fonts without http/https, so allow the host on both
    'font-src https://fonts.gstatic.com cdn.fontshare.com https://cdn.fontshare.com',
    // Note photos live in Google Drive (drive.google.com redirects to googleusercontent.com)
    "img-src 'self' data: blob: https://drive.google.com https://*.googleusercontent.com",
    // Google too, for when site-config.js has an Apps Script URL (pages then talk to the Sheet directly)
    "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

// ---------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------

function readConfigFile() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`⚠  Could not read config.json (${error.message}). Using default settings.`);
    }
    return {};
  }
}

/**
 * Reads config.json. Environment variables win (handy on hosting sites):
 *   PORT, HOST, APPS_SCRIPT_URL, ADMIN_PASSWORD_HASH, SHEET_SECRET
 */
function loadConfig() {
  const fileConfig = readConfigFile();

  const appsScriptUrl = String(process.env.APPS_SCRIPT_URL || fileConfig.appsScriptUrl || '').trim();
  if (appsScriptUrl && !(appsScriptUrl.startsWith('https://script.google.com/') && appsScriptUrl.endsWith('/exec'))) {
    console.warn('⚠  appsScriptUrl does not look like an Apps Script web app URL (it should start with');
    console.warn('   https://script.google.com/ and end with /exec). See README.md.');
  }

  return {
    port: Number(process.env.PORT) || Number(fileConfig.port) || 3000,
    // Local-only by default. Hosting sites set PORT, so then we listen on every network address.
    host: process.env.HOST || fileConfig.host || (process.env.PORT ? '0.0.0.0' : '127.0.0.1'),
    appsScriptUrl,
    adminPasswordHash: String(process.env.ADMIN_PASSWORD_HASH || fileConfig.adminPasswordHash || ''),
    // Secret key that lets this server keep the admin data in the Sheet's "Admin" tab
    sheetSecret: String(process.env.SHEET_SECRET || fileConfig.sheetSecret || ''),
  };
}

/** node server.js --set-admin-password "..."  -> saves only the hash, then exits. */
function setAdminPasswordFromCommandLine() {
  const flagIndex = process.argv.indexOf('--set-admin-password');
  if (flagIndex === -1) return;

  const password = process.argv[flagIndex + 1] || '';
  if (password.length < 8) {
    console.error('✖ Please give a password with at least 8 characters:');
    console.error('  node server.js --set-admin-password "your password"');
    process.exit(1);
  }
  const fileConfig = readConfigFile();
  fileConfig.adminPasswordHash = auth.hashPassword(password);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(fileConfig, null, 2) + '\n', 'utf8');
  console.log('✔ Admin password saved (as a hash) in config.json. Restart the server to use it.');
  process.exit(0);
}

setAdminPasswordFromCommandLine();

const config = loadConfig();
const storageMode = config.appsScriptUrl ? 'sheets' : 'local';
// In Sheets mode (with a sheet secret) the admin data lives in the Sheet's "Admin" tab,
// so it survives restarts on free hosting. Otherwise it stays in data/admin.json.
const moderation = createModeration(DATA_DIR, {
  remote: storageMode === 'sheets' && config.sheetSecret ? {
    load: async () => (await callAppsScript({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'loadAdmin', secret: config.sheetSecret }),
    })).admin,
    save: (admin) => callAppsScript({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveAdmin', secret: config.sheetSecret, admin }),
    }),
  } : null,
});

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

/** An error whose message is safe to show to the visitor. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Sends a JSON response. */
function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

/** Oldest first. */
function byTimestamp(a, b) {
  return new Date(a.timestamp) - new Date(b.timestamp);
}

/** Only accept JSON bodies. Plain HTML forms on other websites can't send JSON to us. */
function requireJson(req) {
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    throw new HttpError(415, 'Please send the data as JSON.');
  }
}

// ---------------------------------------------------------------------
// Validation (never trust what the browser sends!)
// ---------------------------------------------------------------------

/**
 * Removes invisible control characters and trims the text.
 * singleLine: also turns line breaks and repeated spaces into one space.
 */
function cleanText(value, { singleLine = false } = {}) {
  if (typeof value !== 'string') return '';
  let text = value.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  text = singleLine
    ? text.replace(/\s+/g, ' ')
    : text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/**
 * Checks one submitted entry and returns a clean copy.
 * Throws HttpError(400) with a friendly message when something is wrong.
 */
function validateEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'The entry is missing.');
  }

  // 1 to 5, or an in-between mood like 4.5 (Great + Good)
  const rawMood = input.mood;
  const mood = (typeof rawMood === 'number' || typeof rawMood === 'string') ? Number(rawMood) : NaN;
  if (!Moods.isValid(mood)) {
    throw new HttpError(400, 'Please pick a mood.');
  }

  const whatHappened = cleanText(input.whatHappened, { singleLine: true });
  const comment = cleanText(input.comment);
  const name = cleanText(input.name, { singleLine: true }); // '' means anonymous

  if (!whatHappened) {
    throw new HttpError(400, 'Please write a few words about what happened in class.');
  }
  if (whatHappened.length > LIMITS.whatHappened) {
    throw new HttpError(400, `"What happened" can be at most ${LIMITS.whatHappened} characters.`);
  }
  if (comment.length > LIMITS.comment) {
    throw new HttpError(400, `The comment can be at most ${LIMITS.comment} characters.`);
  }
  if (name.length > LIMITS.name) {
    throw new HttpError(400, `The name can be at most ${LIMITS.name} characters.`);
  }

  // Only store a name when the student chose to share one
  return name ? { mood, whatHappened, comment, name } : { mood, whatHappened, comment };
}

/**
 * Turns an entry from any storage into the exact shape the pages expect.
 * Returns null for broken rows so they are skipped instead of crashing the page.
 */
function normalizeEntry(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const mood = Number(raw.mood);
  const time = new Date(raw.timestamp);
  if (!Moods.isValid(mood) || Number.isNaN(time.getTime())) return null;

  return {
    id: String(raw.id || `entry-${index}`),
    timestamp: time.toISOString(),
    mood,
    whatHappened: String(raw.whatHappened ?? '').slice(0, LIMITS.whatHappened),
    comment: String(raw.comment ?? '').slice(0, LIMITS.comment),
    name: String(raw.name ?? '').slice(0, LIMITS.name), // '' = anonymous
    demo: raw.demo === true,
  };
}

// ---------------------------------------------------------------------
// Spam protection
// ---------------------------------------------------------------------

const recentPosts = new Map(); // visitor address -> list of post times

function getClientAddress(req) {
  // On hosting sites the real address is in X-Forwarded-For (good enough for a simple limit).
  const forwarded = req.headers['x-forwarded-for'];
  return forwarded ? String(forwarded).split(',')[0].trim() : req.socket.remoteAddress;
}

/** Throws HttpError(429) when one visitor posts too often. */
function checkRateLimit(address) {
  const now = Date.now();
  const times = (recentPosts.get(address) || []).filter((time) => now - time < RATE_LIMIT.windowMs);
  if (times.length >= RATE_LIMIT.maxPosts) {
    recentPosts.set(address, times);
    throw new HttpError(429, 'Lots of notes at once! Please wait a minute and try again.');
  }
  times.push(now);
  recentPosts.set(address, times);
}

// ---------------------------------------------------------------------
// Reading the request body safely
// ---------------------------------------------------------------------

/** Reads a JSON request body, refusing anything bigger than LIMITS.requestBodyBytes. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const declaredSize = Number(req.headers['content-length'] || 0);
    if (declaredSize > LIMITS.requestBodyBytes) {
      reject(new HttpError(413, 'That message is too big.'));
      return;
    }

    const chunks = [];
    let size = 0;
    let tooBig = false;

    req.on('data', (chunk) => {
      if (tooBig) return;
      size += chunk.length;
      if (size > LIMITS.requestBodyBytes) {
        tooBig = true;
        chunks.length = 0;
        reject(new HttpError(413, 'That message is too big.'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooBig) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new HttpError(400, 'The data was not valid JSON.'));
      }
    });

    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------
// Storage 1: local JSON file (data/entries.json)
// ---------------------------------------------------------------------

async function readLocalEntries() {
  try {
    const entries = JSON.parse(await fsp.readFile(DATA_FILE, 'utf8'));
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    if (error.code === 'ENOENT') return []; // no file yet = no entries yet
    throw error; // a broken file should be fixed, not silently overwritten
  }
}

// Writes wait for each other, so two students submitting at the same moment
// can't overwrite each other's note.
let localWriteQueue = Promise.resolve();

/** Runs change(entries) on the latest list and saves it. */
function changeLocalEntries(change) {
  const job = localWriteQueue.then(async () => {
    const entries = await readLocalEntries();
    const result = await change(entries);
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.writeFile(DATA_FILE, JSON.stringify(entries, null, 2) + '\n', 'utf8');
    return result;
  });
  localWriteQueue = job.catch(() => {}); // keep the queue going even if one write fails
  return job;
}

function addLocalEntry(entry) {
  return changeLocalEntries((entries) => {
    const saved = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry };
    entries.push(saved);
    return saved;
  });
}

/** Really removes a note from data/entries.json. Returns true if it was there. */
function deleteLocalEntry(id) {
  return changeLocalEntries((entries) => {
    const index = entries.findIndex((entry) => String(entry.id) === id);
    if (index === -1) return false;
    entries.splice(index, 1);
    return true;
  });
}

// ---------------------------------------------------------------------
// Storage 2: Google Sheets (through the Apps Script web app)
// ---------------------------------------------------------------------

let sheetsCache = null; // { entries, fetchedAt }

async function getSheetEntries() {
  if (sheetsCache && Date.now() - sheetsCache.fetchedAt < SHEETS_CACHE_MS) {
    return sheetsCache.entries;
  }
  const data = await callAppsScript({ method: 'GET' });
  const entries = Array.isArray(data.entries) ? data.entries : [];
  sheetsCache = { entries, fetchedAt: Date.now() };
  return entries;
}

async function addSheetEntry(entry) {
  const data = await callAppsScript({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  sheetsCache = null; // so the journey page shows the new note right away
  return data.entry || { id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry };
}

/**
 * Calls the Apps Script web app and returns its JSON answer.
 * Google answers with a redirect first; fetch follows it for us.
 */
async function callAppsScript(options) {
  let response;
  try {
    response = await fetch(config.appsScriptUrl, {
      ...options,
      redirect: 'follow',
      signal: AbortSignal.timeout(20 * 1000),
    });
  } catch (error) {
    console.error('✖ Could not reach Google Apps Script:', error.message);
    throw new HttpError(502, 'Could not reach Google Sheets right now. Please try again in a moment.');
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`✖ Apps Script did not answer with JSON (HTTP ${response.status}).`);
    console.error('  Is the deployment set to "Who has access: Anyone"? First part of the answer:');
    console.error('  ' + text.slice(0, 200).replace(/\s+/g, ' '));
    throw new HttpError(502, 'Google Sheets did not answer properly. Check the Apps Script deployment (see README).');
  }

  if (!data.ok) {
    console.error('✖ Apps Script reported an error:', data.error);
    throw new HttpError(data.code === 400 ? 400 : 502, data.error || 'Google Sheets reported an error.');
  }
  return data;
}

/** All notes from the active storage, cleaned and oldest first. */
async function loadAllEntries() {
  const rawEntries = storageMode === 'sheets' ? await getSheetEntries() : await readLocalEntries();
  return rawEntries.map(normalizeEntry).filter(Boolean).sort(byTimestamp);
}

// ---------------------------------------------------------------------
// Public API routes
// ---------------------------------------------------------------------

/** GET /api/entries -> { ok, mode, entries: [...] }  (hidden / waiting notes left out) */
async function handleGetEntries(req, res) {
  const [entries, adminData] = await Promise.all([loadAllEntries(), moderation.readData()]);
  sendJson(res, 200, { ok: true, mode: storageMode, entries: moderation.publicEntries(entries, adminData) });
}

/** GET /api/status -> { ok, mode, paused, requireApproval } */
async function handleGetStatus(req, res) {
  const { settings } = await moderation.readData();
  sendJson(res, 200, {
    ok: true,
    mode: storageMode,
    paused: Boolean(settings.paused),
    requireApproval: Boolean(settings.requireApproval),
  });
}

/** POST /api/entries  body: { mood, whatHappened, comment, name? } -> { ok, mode, entry } */
async function handlePostEntry(req, res) {
  checkRateLimit(getClientAddress(req));
  requireJson(req);

  const body = await readJsonBody(req);
  const entry = validateEntry(body);

  const { settings } = await moderation.readData();
  if (settings.paused) {
    throw new HttpError(423, 'Check-ins are paused by the admin right now. Please try again later.');
  }
  if (moderation.findBlockedWord([entry.whatHappened, entry.comment, entry.name || ''], settings.blockedWords)) {
    throw new HttpError(400, 'Please keep it kind: some words in your note are not allowed here.');
  }

  const saved = storageMode === 'sheets' ? await addSheetEntry(entry) : await addLocalEntry(entry);
  const note = normalizeEntry(saved, 0);

  // "Hold new notes for review" is on: the note waits until the admin approves it
  if (settings.requireApproval) {
    await moderation.update((data) => {
      data.notes[note.id] = { ...(data.notes[note.id] || {}), pending: true };
    });
  }

  console.log(`✎ New ${storageMode} entry: mood ${note.mood}${settings.requireApproval ? ' (waiting for review)' : ''}`);
  sendJson(res, 201, { ok: true, mode: storageMode, entry: { ...note, pending: Boolean(settings.requireApproval) } });
}

// ---------------------------------------------------------------------
// Admin API routes
// ---------------------------------------------------------------------

/** Throws 401 unless the request comes from a logged-in admin. */
function requireAdmin(req) {
  if (!auth.isAdmin(req)) throw new HttpError(401, 'Please log in as admin first.');
}

/** POST /api/admin/login  { password } */
async function handleAdminLogin(req, res) {
  requireJson(req);
  const address = getClientAddress(req);
  if (!config.adminPasswordHash) {
    throw new HttpError(503, 'Admin login is not set up yet. See README: "Admin".');
  }
  if (auth.isLoginBlocked(address)) {
    throw new HttpError(429, 'Too many wrong passwords. Please wait 5 minutes and try again.');
  }

  const body = await readJsonBody(req);
  if (!auth.verifyPassword(body.password, config.adminPasswordHash)) {
    auth.recordFailedLogin(address);
    console.warn(`⚠ Wrong admin password from ${address}`);
    throw new HttpError(401, 'Wrong password.');
  }

  auth.clearFailedLogins(address);
  const token = auth.createSession();
  console.log('🔑 Admin logged in');
  sendJson(res, 200, { ok: true, admin: true }, { 'Set-Cookie': auth.sessionCookie(token, req) });
}

/** POST /api/admin/logout */
function handleAdminLogout(req, res) {
  auth.endSession(req);
  sendJson(res, 200, { ok: true, admin: false }, { 'Set-Cookie': auth.clearedCookie() });
}

/** GET /api/admin/session -> { admin, configured } */
function handleAdminSession(req, res) {
  sendJson(res, 200, { ok: true, admin: auth.isAdmin(req), configured: Boolean(config.adminPasswordHash) });
}

/** GET /api/admin/state -> everything the admin page needs */
async function handleAdminState(req, res) {
  const [entries, data] = await Promise.all([loadAllEntries(), moderation.readData()]);
  sendJson(res, 200, {
    ok: true,
    mode: storageMode,
    entries: moderation.adminEntries(entries, data),
    piles: data.piles,
    settings: data.settings,
    pileColors: moderation.PILE_COLORS,
  });
}

/** PATCH /api/admin/notes/:id  { hidden?, pinned?, pending?, pileId? } */
async function handleAdminUpdateNote(req, res, id) {
  requireJson(req);
  const body = await readJsonBody(req);
  const data = await moderation.update((current) => {
    const note = { ...(current.notes[id] || {}) };
    for (const flag of ['hidden', 'pinned', 'pending']) {
      if (typeof body[flag] === 'boolean') note[flag] = body[flag];
    }
    if ('pileId' in body) {
      const pileExists = current.piles.some((pile) => pile.id === body.pileId);
      note.pileId = pileExists ? body.pileId : null; // anything else = back to Inbox
    }
    current.notes[id] = note;
  });
  sendJson(res, 200, { ok: true, note: data.notes[id] });
}

/** DELETE /api/admin/notes/:id */
async function handleAdminDeleteNote(req, res, id) {
  if (storageMode === 'local') {
    await deleteLocalEntry(id);
    await moderation.update((data) => {
      delete data.notes[id];
    });
  } else {
    // We can't delete rows in the Sheet from here, so the note is hidden for good instead.
    await moderation.update((data) => {
      data.notes[id] = { ...(data.notes[id] || {}), deleted: true };
    });
  }
  console.log(`🗑 Admin deleted note ${id}`);
  sendJson(res, 200, { ok: true, removedFromSheet: storageMode === 'local' });
}

/** POST /api/admin/piles  { name, color } */
async function handleAdminCreatePile(req, res) {
  requireJson(req);
  const body = await readJsonBody(req);
  const name = moderation.cleanPileName(body.name);
  if (!name) throw new HttpError(400, 'Give the pile a name.');

  let pile;
  await moderation.update((data) => {
    if (data.piles.length >= moderation.LIMITS.maxPiles) {
      throw new HttpError(400, `You can have at most ${moderation.LIMITS.maxPiles} piles.`);
    }
    pile = { id: moderation.newPileId(), name, color: moderation.cleanPileColor(body.color) };
    data.piles.push(pile);
  });
  sendJson(res, 201, { ok: true, pile });
}

/** PATCH /api/admin/piles/:id  { name?, color? } */
async function handleAdminUpdatePile(req, res, id) {
  requireJson(req);
  const body = await readJsonBody(req);
  let pile;
  await moderation.update((data) => {
    pile = data.piles.find((item) => item.id === id);
    if (!pile) throw new HttpError(404, 'That pile does not exist any more.');
    if ('name' in body) {
      const name = moderation.cleanPileName(body.name);
      if (!name) throw new HttpError(400, 'Give the pile a name.');
      pile.name = name;
    }
    if ('color' in body) pile.color = moderation.cleanPileColor(body.color);
  });
  sendJson(res, 200, { ok: true, pile });
}

/** DELETE /api/admin/piles/:id  (its notes go back to the Inbox) */
async function handleAdminDeletePile(req, res, id) {
  await moderation.update((data) => {
    data.piles = data.piles.filter((pile) => pile.id !== id);
    for (const note of Object.values(data.notes)) {
      if (note.pileId === id) note.pileId = null;
    }
  });
  sendJson(res, 200, { ok: true });
}

/** PATCH /api/admin/settings  { paused?, requireApproval?, blockedWords? } */
async function handleAdminSettings(req, res) {
  requireJson(req);
  const body = await readJsonBody(req);
  const data = await moderation.update((current) => {
    if (typeof body.paused === 'boolean') current.settings.paused = body.paused;
    if (typeof body.requireApproval === 'boolean') current.settings.requireApproval = body.requireApproval;
    if ('blockedWords' in body) current.settings.blockedWords = moderation.cleanWordList(body.blockedWords);
  });
  console.log('⚙ Admin changed settings');
  sendJson(res, 200, { ok: true, settings: data.settings });
}

/** One CSV cell. A leading = + - @ is made harmless so spreadsheets don't run it as a formula. */
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** GET /api/admin/export.csv  -> all notes as a spreadsheet file */
async function handleAdminExport(req, res) {
  const [entries, data] = await Promise.all([loadAllEntries(), moderation.readData()]);
  const pileNames = Object.fromEntries(data.piles.map((pile) => [pile.id, pile.name]));
  const rows = [['Timestamp', 'Mood', 'Feeling', 'WhatHappened', 'Comment', 'Name', 'Pile', 'Hidden', 'Pinned', 'Waiting']];
  for (const entry of moderation.adminEntries(entries, data)) {
    const feeling = Moods.isBlend(entry.mood)
      ? `${Moods.name(entry.mood)} (${Moods.baseLabel(entry.mood)})`
      : Moods.name(entry.mood);
    rows.push([
      entry.timestamp, entry.mood, feeling, entry.whatHappened, entry.comment, entry.name,
      pileNames[entry.pileId] || 'Inbox', entry.hidden ? 'yes' : '', entry.pinned ? 'yes' : '', entry.pending ? 'yes' : '',
    ]);
  }
  const csv = '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="class-mood-notes-${new Date().toISOString().slice(0, 10)}.csv"`,
    'Cache-Control': 'no-store',
  });
  res.end(csv);
}

/** Sends /api/admin/... requests to the right handler. */
async function routeAdmin(req, res, pathname) {
  const { method } = req;

  if (pathname === '/api/admin/login' && method === 'POST') return handleAdminLogin(req, res);
  if (pathname === '/api/admin/logout' && method === 'POST') return handleAdminLogout(req, res);
  if (pathname === '/api/admin/session' && method === 'GET') return handleAdminSession(req, res);

  // Everything below needs a logged-in admin
  requireAdmin(req);

  if (pathname === '/api/admin/state' && method === 'GET') return handleAdminState(req, res);
  if (pathname === '/api/admin/settings' && method === 'PATCH') return handleAdminSettings(req, res);
  if (pathname === '/api/admin/export.csv' && method === 'GET') return handleAdminExport(req, res);
  if (pathname === '/api/admin/piles' && method === 'POST') return handleAdminCreatePile(req, res);

  const match = pathname.match(/^\/api\/admin\/(notes|piles)\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[2]);
    if (!ID_PATTERN.test(id)) throw new HttpError(400, 'That id does not look right.');
    if (match[1] === 'notes' && method === 'PATCH') return handleAdminUpdateNote(req, res, id);
    if (match[1] === 'notes' && method === 'DELETE') return handleAdminDeleteNote(req, res, id);
    if (match[1] === 'piles' && method === 'PATCH') return handleAdminUpdatePile(req, res, id);
    if (match[1] === 'piles' && method === 'DELETE') return handleAdminDeletePile(req, res, id);
  }

  throw new HttpError(404, 'Unknown admin action.');
}

// ---------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------

async function serveStaticFile(pathname, req, res) {
  const fileName = PUBLIC_FILES[pathname];
  if (!fileName) {
    res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Page not found. Try / (home), /checkin.html or /journey.html');
    return;
  }

  const content = await fsp.readFile(path.join(ROOT_DIR, fileName));
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': CONTENT_TYPES[path.extname(fileName)],
    'Content-Length': content.length,
    'Cache-Control': 'no-cache', // always check for the newest version (easy while developing)
  });
  res.end(req.method === 'HEAD' ? undefined : content);
}

// ---------------------------------------------------------------------
// Main request handler
// ---------------------------------------------------------------------

async function handleRequest(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');

  try {
    if (pathname === '/api/entries') {
      if (req.method === 'GET') return await handleGetEntries(req, res);
      if (req.method === 'POST') return await handlePostEntry(req, res);
      res.setHeader('Allow', 'GET, POST');
      throw new HttpError(405, 'Method not allowed.');
    }

    if (pathname === '/api/status' && req.method === 'GET') return await handleGetStatus(req, res);
    if (pathname.startsWith('/api/admin/')) return await routeAdmin(req, res, pathname);
    if (pathname.startsWith('/api/')) throw new HttpError(404, 'Unknown API address.');

    if (req.method === 'GET' || req.method === 'HEAD') {
      return await serveStaticFile(pathname, req, res);
    }
    throw new HttpError(405, 'Method not allowed.');
  } catch (error) {
    const isKnown = error instanceof HttpError;
    if (!isKnown) console.error('✖ Unexpected error:', error);
    if (res.headersSent) return;
    if (error.status === 413) res.setHeader('Connection', 'close');
    sendJson(res, isKnown ? error.status : 500, {
      ok: false,
      error: isKnown ? error.message : 'Something went wrong on the server.',
    });
  }
}

// ---------------------------------------------------------------------
// Start!
// ---------------------------------------------------------------------

const server = http.createServer(handleRequest);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`✖ Port ${config.port} is already in use. Is the server already running?`);
    console.error('  Close the other one, or change "port" in config.json.');
  } else {
    console.error('✖ Server error:', error);
  }
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  const shownHost = config.host === '0.0.0.0' || config.host === '127.0.0.1' ? 'localhost' : config.host;
  console.log('');
  console.log('  ✿ Class Mood Journey is running!');
  console.log(`    Home:           http://${shownHost}:${config.port}/`);
  console.log(`    Check-in page:  http://${shownHost}:${config.port}/checkin.html`);
  console.log(`    Journey map:    http://${shownHost}:${config.port}/journey.html`);
  console.log(`    Admin desk:     http://${shownHost}:${config.port}/admin.html` +
    (config.adminPasswordHash ? '' : '  (no password set yet, see README)'));
  console.log(`    Storage:        ${storageMode === 'sheets' ? 'Google Sheets (Apps Script)' : 'local file data/entries.json'}`);
  console.log(`    Admin data:     ${moderation.usesSheet ? 'Google Sheet, "Admin" tab' : 'local file data/admin.json'}`);
  if (storageMode === 'sheets' && !moderation.usesSheet) {
    console.log('    (Tip: set "sheetSecret" / SHEET_SECRET to keep admin data in the Sheet. See README.)');
  }
  console.log('    Stop with Ctrl + C');
  console.log('');
});
