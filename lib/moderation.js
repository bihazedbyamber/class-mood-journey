'use strict';

/* =====================================================================
 * Class Mood Journey — lib/moderation.js
 * ---------------------------------------------------------------------
 * Everything the admin decides is saved in data/admin.json, NEXT TO the
 * notes (not inside them). That way it works the same in local mode and
 * in Google Sheets mode.
 *
 * data/admin.json looks like:
 * {
 *   "settings": { "paused": false, "requireApproval": false, "blockedWords": ["..."] },
 *               (blockedWords = notes with these words are refused; empty at first)
 *   "piles":    [ { "id": "pile-1a2b3c4d", "name": "To discuss", "color": "yellow" } ],
 *   "notes":    { "<note id>": { "hidden": true, "pinned": false, "pending": false,
 *                                "pileId": "pile-1a2b3c4d", "deleted": false } }
 * }
 * ===================================================================== */

const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const MoodCensor = require('../censor.js'); // the same trick-proof matcher the censor stickers use

const PILE_COLORS = ['yellow', 'pink', 'blue', 'green', 'orange', 'purple'];
const LIMITS = { pileName: 30, maxPiles: 20, word: 30, maxWords: 300 };

/**
 * Words that make a note be REFUSED completely. Empty at the start:
 * swear words are already covered by the *censored* stickers on the map.
 * The admin can add words here, e.g. classmates' names used for teasing.
 */
const DEFAULT_BLOCKED_WORDS = [];

/**
 * dataDir: folder for data/admin.json
 * options.remote: { load(), save(data) } to keep the admin data in the Google
 *   Sheet ("Admin" tab) instead. Free hosts wipe local files on every restart,
 *   so this keeps piles, hidden notes, blocked words etc. safe.
 *   With a remote, the data is kept in memory (fast) and every change is
 *   saved to the Sheet (and to data/admin.json as a backup).
 */
function createModeration(dataDir, options = {}) {
  const ADMIN_FILE = path.join(dataDir, 'admin.json');
  const remote = options.remote || null;
  let memory = null; // only used with a remote

  // ---------- Reading / writing the admin data ----------

  function emptyData() {
    return {
      settings: { paused: false, requireApproval: false, blockedWords: [...DEFAULT_BLOCKED_WORDS] },
      piles: [],
      notes: {},
    };
  }

  /** Fills in anything missing, so old data keeps working. */
  function normalize(raw) {
    const base = emptyData();
    if (!raw || typeof raw !== 'object') return base;
    return {
      settings: { ...base.settings, ...(raw.settings || {}) },
      piles: Array.isArray(raw.piles) ? raw.piles : [],
      notes: raw.notes && typeof raw.notes === 'object' ? raw.notes : {},
    };
  }

  /** Reads data/admin.json (or empty data if there is no file yet). */
  async function readFile() {
    try {
      return normalize(JSON.parse(await fsp.readFile(ADMIN_FILE, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') return emptyData();
      throw error;
    }
  }

  async function writeFile(data) {
    await fsp.mkdir(dataDir, { recursive: true });
    await fsp.writeFile(ADMIN_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  // If the Sheet can't be used yet (e.g. the new Code.gs isn't deployed), we use
  // the local file and try the Sheet again at most once a minute.
  const RETRY_MS = 60 * 1000;
  let lastTry = 0;

  /** The current admin data (a copy, so callers can't change it by accident). */
  async function readData() {
    if (!remote) return readFile();
    if (!memory && Date.now() - lastTry > RETRY_MS) {
      lastTry = Date.now();
      try {
        const saved = await remote.load();
        // Nothing in the Sheet yet? Start from this computer's file (first time only).
        memory = saved ? normalize(saved) : await readFile();
        if (!saved) await remote.save(memory);
        console.log('✔ Admin data is now kept in the Google Sheet ("Admin" tab).');
      } catch (error) {
        memory = null;
        console.warn(`⚠ Admin data can't use the Sheet yet (${error.message}). Using data/admin.json for now.`);
      }
    }
    return memory ? structuredClone(memory) : readFile();
  }

  // Changes wait for each other, so two quick clicks can't overwrite each other.
  let writeQueue = Promise.resolve();

  /** Runs change(data) on the latest data and saves it. Returns the saved data. */
  function update(change) {
    const job = writeQueue.then(async () => {
      const data = await readData();
      await change(data);
      if (memory) {
        // The Sheet is in use: save there first. If Google can't be reached,
        // the change fails and the admin page says so.
        await remote.save(data);
        memory = data;
      }
      await writeFile(data).catch((error) => {
        if (!memory) throw error; // the file is the only copy, so this must work
        console.warn('⚠ Could not write the local backup data/admin.json:', error.message);
      });
      return structuredClone(data);
    });
    writeQueue = job.catch(() => {});
    return job;
  }

  // ---------- Applying the admin's decisions to the notes ----------

  /** What the public journey page may see: no hidden, waiting or deleted notes. */
  function publicEntries(entries, data) {
    return entries
      .filter((entry) => {
        const note = data.notes[entry.id] || {};
        return !note.hidden && !note.pending && !note.deleted;
      })
      .map((entry) => ({ ...entry, pinned: Boolean((data.notes[entry.id] || {}).pinned) }));
  }

  /** What the admin sees: every note (except deleted ones) plus its flags and pile. */
  function adminEntries(entries, data) {
    const pileIds = new Set(data.piles.map((pile) => pile.id));
    return entries
      .filter((entry) => !(data.notes[entry.id] || {}).deleted)
      .map((entry) => {
        const note = data.notes[entry.id] || {};
        return {
          ...entry,
          hidden: Boolean(note.hidden),
          pinned: Boolean(note.pinned),
          pending: Boolean(note.pending),
          pileId: pileIds.has(note.pileId) ? note.pileId : null, // null = Inbox
        };
      });
  }

  // ---------- Blocked words ----------

  let cachedMatcher = { key: null, matcher: null };

  /**
   * True if any of the texts contains one of the blocked words. Uses the censor's
   * matcher, so tricks like "@syafa", "a s y a f a" or "asyafanya" are caught too.
   */
  function findBlockedWord(texts, blockedWords) {
    if (!blockedWords || blockedWords.length === 0) return false;
    const key = blockedWords.join('\n');
    if (cachedMatcher.key !== key) {
      cachedMatcher = { key, matcher: MoodCensor.createMatcher(blockedWords) };
    }
    return texts.some((text) => cachedMatcher.matcher.hasMatch(text));
  }

  /** Cleans a list of words typed by the admin (comma or new line separated). */
  function cleanWordList(value) {
    const list = Array.isArray(value) ? value : String(value || '').split(/[\n,]+/);
    const seen = new Set();
    const words = [];
    for (const item of list) {
      const word = String(item).trim().toLowerCase().slice(0, LIMITS.word);
      if (word && !seen.has(word)) {
        seen.add(word);
        words.push(word);
      }
      if (words.length >= LIMITS.maxWords) break;
    }
    return words;
  }

  // ---------- Piles ----------

  function cleanPileName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.pileName);
  }

  function cleanPileColor(value) {
    return PILE_COLORS.includes(value) ? value : 'yellow';
  }

  function newPileId() {
    return `pile-${crypto.randomBytes(4).toString('hex')}`;
  }

  return {
    readData,
    update,
    usesSheet: Boolean(remote), // set up to use the Sheet (it switches over once the Sheet answers)
    publicEntries,
    adminEntries,
    findBlockedWord,
    cleanWordList,
    cleanPileName,
    cleanPileColor,
    newPileId,
    PILE_COLORS,
    LIMITS,
  };
}

module.exports = { createModeration, DEFAULT_BLOCKED_WORDS };
