/* =====================================================================
 * Class Mood Journey — Google Apps Script backend (Code.gs)
 * ---------------------------------------------------------------------
 * The website (hosted for free on GitHub Pages) talks DIRECTLY to this
 * script. It does all the work a server would do:
 *   - saves and lists the notes (first tab of the Sheet)
 *   - checks every note (mood, length, blocked words, paused, spam)
 *   - admin login (password in Project Settings > Script properties)
 *   - admin actions: hide, pin, approve, delete, piles, settings
 *     (kept in a tab called "Admin")
 *
 * Setup (see README.md):
 *   1. Paste this whole file into Extensions > Apps Script (Code.gs).
 *   2. Project Settings > Script properties > add ADMIN_PASSWORD.
 *   3. Deploy > Web app (Execute as: Me, Who has access: Anyone).
 *
 * First tab, header row:  Timestamp | Mood | WhatHappened | Comment | Name | Id | Photo
 * Photos are saved in a Google Drive folder "Class Mood Journey photos";
 * the Photo column holds the Drive file ids (up to 5, separated by commas). Photo notes appear straight away,
 * unless an admin turns on "Check photos first" (then they wait for approval).
 *
 * How the website calls it:
 *   GET  ?action=entries                     -> visible notes + status
 *   GET  ?action=status                      -> paused / check-first
 *   POST {action:"submit", mood, whatHappened, comment, name}
 *   POST {action:"login", password}          -> { token }
 *   POST {action:"<admin action>", token, ...}  (state, updateNote, deleteNote,
 *        createPile, updatePile, deletePile, settings, session, logout)
 * The website sends POST bodies as plain text (JSON inside), which avoids
 * browser "CORS" problems with Apps Script.
 * ===================================================================== */

// Owner = the Google account that posted it (private), ShowUser = posted under their username, Edited = last edit
var HEADERS = ['Timestamp', 'Mood', 'WhatHappened', 'Comment', 'Name', 'Id', 'Photo', 'Owner', 'ShowUser', 'Edited'];
var LIMITS = { whatHappened: 80, comment: 300, name: 24, pileName: 30, maxPiles: 20, word: 30, maxWords: 300 };
var MAX_PHOTO_CHARS = 1500000;       // a photo (as text) may be at most ~1.1 MB; the website shrinks it first
var MAX_PHOTOS_PER_MINUTE = 20;      // photos are heavier, so a smaller brake
var MAX_PHOTOS_PER_NOTE = 5;
var PHOTO_FOLDER_NAME = 'Class Mood Journey photos';
var PILE_COLORS = ['yellow', 'pink', 'blue', 'green', 'orange', 'purple'];
var SESSION_SECONDS = 6 * 60 * 60;   // admin stays logged in for 6 hours (the most Apps Script allows)
var MAX_POSTS_PER_MINUTE = 40;       // spam brake for the whole class
var MAX_WRONG_PASSWORDS = 10;        // then everybody waits 10 minutes

// =====================================================================
// Entry points
// =====================================================================

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'entries';
    if (action === 'entries') {
      var admin = loadAdmin_();
      var extras = noteExtras_();
      var entries = publicEntries_(readEntries_(), admin).map(function (entry) { return publicNote_(entry, extras); });
      return json_({ ok: true, mode: 'sheets', entries: entries, status: status_(admin) });
    }
    if (action === 'comments') {
      return json_({ ok: true, comments: listComments_(e.parameter.note) });
    }
    if (action === 'status') {
      var status = status_(loadAdmin_());
      return json_({ ok: true, mode: 'sheets', paused: status.paused, requireApproval: status.requireApproval,
        approvePhotos: status.approvePhotos, commentsOff: status.commentsOff });
    }
    throw error_(404, 'Unknown action.');
  } catch (err) {
    return json_({ ok: false, code: err.code || 500, error: err.message });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = body.action || 'submit';

    if (action === 'submit') return json_(submit_(body));
    if (action === 'login') return json_(login_(body.password));
    if (action === 'logout') {
      if (typeof body.token === 'string') CacheService.getScriptCache().remove('session-' + body.token);
      return json_({ ok: true });
    }
    // Accounts + comments (signed in with Google)
    if (action === 'googleLogin') return json_(googleLogin_(body));
    if (action === 'setUsername') return json_(setUsername_(body));
    if (action === 'me') {
      var user = readUsers_()[readUserToken_(body.userToken)];
      return json_({ ok: true, username: user && user.username ? user.username : null });
    }
    if (action === 'addComment') return json_(addComment_(body));
    if (action === 'deleteMyComment') return json_(deleteMyComment_(body));
    if (action === 'toggleLike') return json_(toggleLike_(body));
    if (action === 'myLikes') return json_(myLikes_(body));
    if (action === 'myNotes') return json_(myNotes_(body));
    if (action === 'editNote') return json_(editMyNote_(body));
    if (action === 'deleteMyNote') return json_(deleteMyNote_(body));

    // Everything else is for admins only
    requireAdmin_(body.token);
    return json_(adminAction_(action, body));
  } catch (err) {
    return json_({ ok: false, code: err.code || 500, error: err.message });
  }
}

// =====================================================================
// Notes (first tab)
// =====================================================================

/** The first tab. Adds the header row if it's missing. */
function getSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else {
    // Older Sheets: add the newer column headers (Photo, Owner, ShowUser, Edited)
    var header = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    for (var c = 6; c < HEADERS.length; c++) {
      if (header[c] === '') sheet.getRange(1, c + 1).setValue(HEADERS[c]);
    }
  }
  return sheet;
}

/** Every valid note in the Sheet, oldest first. */
function readEntries_() {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var entries = [];
  rows.forEach(function (row, index) {
    var time = row[0] instanceof Date ? row[0] : new Date(row[0]);
    var mood = Math.round(Number(row[1]) * 2) / 2;
    if (isNaN(time.getTime()) || !isValidMood_(mood)) return; // skip empty or broken rows
    entries.push({
      id: String(row[5] || '') || 'row-' + (index + 2), // old rows without an Id use their row number
      timestamp: time.toISOString(),
      mood: mood,
      whatHappened: String(row[2]),
      comment: String(row[3]),
      name: String(row[4] || ''),
      photos: photoIdsOf_(row[6]), // Google Drive file ids ([] = no photos)
      photo: photoIdsOf_(row[6])[0] || '', // the first one (for older pages)
      owner: String(row[7] || ''),         // private: never sent to the website (see publicNote_)
      showUser: String(row[8] || '') === 'yes',
      edited: row[9] instanceof Date ? row[9].toISOString() : ''
    });
  });
  entries.sort(function (a, b) { return a.timestamp < b.timestamp ? -1 : 1; });
  return entries;
}

/** 1, 1.5, 2 ... 5 (x.5 = an in-between mood like Great + Good) */
function isValidMood_(mood) {
  return mood >= 1 && mood <= 5 && Math.round(mood * 2) === mood * 2;
}

/** POST submit: check the note and add it as a new row. */
function submit_(body) {
  // Spam brake for the whole class (Apps Script can't see who is who)
  var cache = CacheService.getScriptCache();
  var minuteKey = 'posts-' + Math.floor(Date.now() / 60000);
  var posts = Number(cache.get(minuteKey) || 0);
  if (posts >= MAX_POSTS_PER_MINUTE) throw error_(429, 'Lots of notes at once! Please wait a minute and try again.');
  cache.put(minuteKey, String(posts + 1), 120);

  var entry = validateEntry_(body);
  // Signed in? Then the note is linked to the account (so they can edit it on their profile).
  // "Post as my username": the name shown is their username, with a verified badge.
  var owner = body.userToken ? readUserToken_(body.userToken) : '';
  var username = '';
  if (owner && body.asUser) {
    var account = readUsers_()[owner];
    if (!account || !account.username) throw error_(400, 'Pick a username first.');
    username = account.username;
    entry.name = '';
  }
  // Up to 5 photos ("photos": [...]); older pages send a single "photo"
  var sent = Array.isArray(body.photos) ? body.photos : (body.photo ? [body.photo] : []);
  if (sent.length > MAX_PHOTOS_PER_NOTE) throw error_(400, 'You can add up to ' + MAX_PHOTOS_PER_NOTE + ' photos.');
  var photoBytes = sent.map(checkPhoto_);
  if (photoBytes.length) {
    var photoKey = 'photos-' + Math.floor(Date.now() / 60000);
    var photoCount = Number(cache.get(photoKey) || 0);
    if (photoCount + photoBytes.length > MAX_PHOTOS_PER_MINUTE) throw error_(429, 'Lots of photos at once! Please wait a minute and try again.');
    cache.put(photoKey, String(photoCount + photoBytes.length), 120);
  }
  var admin = loadAdmin_();
  if (admin.settings.paused) throw error_(423, 'Check-ins are paused by the admin right now. Please try again later.');
  if (admin.settings.blockedWords.length) {
    var matcher = MoodCensor.createMatcher(admin.settings.blockedWords);
    if ([entry.whatHappened, entry.comment, entry.name].some(function (text) { return matcher.hasMatch(text); })) {
      throw error_(400, 'Please keep it kind: some words in your note are not allowed here.');
    }
  }

  var now = new Date();
  var id = Utilities.getUuid();
  // Save the photos in Google Drive first (outside the lock, it can take a moment)
  var photoIds = photoBytes.map(function (bytes, index) { return savePhoto_(bytes, id + '-' + (index + 1)); });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    getSheet_().appendRow([now, entry.mood, asPlainText_(entry.whatHappened), asPlainText_(entry.comment),
      asPlainText_(entry.name), id, photoIds.join(','), owner ? "'" + owner : '', username ? 'yes' : '', '']);
    // "Check photos first" (admin switch, off by default): photo notes wait for approval,
    // because the censor can't look at pictures
    var pending = Boolean(admin.settings.requireApproval) || (photoIds.length > 0 && admin.settings.approvePhotos);
    if (pending) {
      var fresh = loadAdmin_();
      fresh.notes[id] = { pending: true };
      saveAdmin_(fresh);
    }
    return {
      ok: true,
      entry: { id: id, timestamp: now.toISOString(), mood: entry.mood, whatHappened: entry.whatHappened,
        comment: entry.comment, name: username || entry.name, verified: Boolean(username),
        photos: photoIds, photo: photoIds[0] || '', pending: pending }
    };
  } finally {
    lock.releaseLock();
  }
}

/** Checks the data. Returns the clean entry, or throws a friendly error. */
function validateEntry_(body) {
  var mood = Number(body.mood);
  if (!isValidMood_(mood)) throw error_(400, 'Please pick a mood.');
  var whatHappened = cleanText_(body.whatHappened).replace(/\s+/g, ' ');
  var comment = cleanText_(body.comment).replace(/\n{3,}/g, '\n\n');
  var name = cleanText_(body.name).replace(/\s+/g, ' '); // empty = anonymous
  if (!whatHappened) throw error_(400, 'Please write a few words about what happened in class.');
  if (whatHappened.length > LIMITS.whatHappened) throw error_(400, '"What happened" can be at most ' + LIMITS.whatHappened + ' characters.');
  if (comment.length > LIMITS.comment) throw error_(400, 'The comment can be at most ' + LIMITS.comment + ' characters.');
  if (name.length > LIMITS.name) throw error_(400, 'The name can be at most ' + LIMITS.name + ' characters.');
  return { mood: mood, whatHappened: whatHappened, comment: comment, name: name };
}

// ---------- Photos (saved in a Google Drive folder) ----------

/**
 * Checks a photo sent by the website: it must be a JPEG (the website
 * converts every photo to JPEG and shrinks it) and not too big.
 * Returns its bytes, or throws a friendly error.
 */
function checkPhoto_(photo) {
  var prefix = 'data:image/jpeg;base64,';
  if (typeof photo !== 'string' || photo.indexOf(prefix) !== 0) throw error_(400, 'That photo could not be used. Please try another one.');
  if (photo.length > MAX_PHOTO_CHARS) throw error_(400, 'That photo is too big. Please try another one.');
  var bytes;
  try {
    bytes = Utilities.base64Decode(photo.slice(prefix.length));
  } catch (err) {
    throw error_(400, 'That photo could not be used. Please try another one.');
  }
  // Every JPEG starts with the bytes FF D8 FF
  if (bytes.length < 100 || bytes[0] !== -1 || bytes[1] !== -40 || bytes[2] !== -1) {
    throw error_(400, 'That photo could not be used. Please try another one.');
  }
  return bytes;
}

/** The Drive folder for photos (made the first time, then remembered). */
function getPhotoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('PHOTO_FOLDER_ID');
  if (folderId) {
    try {
      var existing = DriveApp.getFolderById(folderId);
      if (!existing.isTrashed()) return existing;
    } catch (err) { /* folder was deleted: make a new one */ }
  }
  var folder = DriveApp.createFolder(PHOTO_FOLDER_NAME);
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

/**
 * Saves the photo and lets anyone with the link view it (so the website
 * can show it). Returns the Drive file id.
 */
function savePhoto_(bytes, noteId) {
  var blob = Utilities.newBlob(bytes, 'image/jpeg', 'mood-' + noteId + '.jpg');
  var file = getPhotoFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

/** The Photo cell holds the Drive ids separated by commas: "id1,id2" -> ['id1', 'id2'] */
function photoIdsOf_(cell) {
  return String(cell || '').split(',').map(function (part) { return part.trim(); })
    .filter(function (part) { return /^[\w-]{10,}$/.test(part); });
}

/** Moves a note's photos to the Drive trash (if it has any). */
function trashPhotos_(cell) {
  photoIdsOf_(cell).forEach(function (fileId) {
    try {
      DriveApp.getFileById(fileId).setTrashed(true);
    } catch (err) { /* already gone */ }
  });
}

/** Trims text and removes invisible control characters. */
function cleanText_(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim();
}

/**
 * A leading apostrophe tells Google Sheets "this is plain text", so text
 * like "=SUM(A1)" never becomes a formula. It's not shown or returned.
 */
function asPlainText_(text) {
  return text ? "'" + text : '';
}

// =====================================================================
// Admin data ("Admin" tab): settings, piles, hidden/pinned/waiting notes
// =====================================================================

var ADMIN_TAB = 'Admin';
var ADMIN_CHUNK = 40000; // one cell holds max 50,000 characters, so long data is split over rows

function getAdminTab_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var tab = spreadsheet.getSheetByName(ADMIN_TAB);
  if (!tab) {
    tab = spreadsheet.insertSheet(ADMIN_TAB); // added at the end, so the notes stay in the first tab
    tab.getRange(1, 1).setValue('Used by the Class Mood Journey website (admin data). Please do not edit.');
  }
  return tab;
}

/** Reads the admin data and fills in anything missing. */
function loadAdmin_() {
  var tab = getAdminTab_();
  var lastRow = tab.getLastRow();
  var raw = null;
  if (lastRow >= 2) {
    var text = tab.getRange(2, 1, lastRow - 1, 1).getValues().map(function (row) { return String(row[0]); }).join('');
    if (text) raw = JSON.parse(text);
  }
  raw = raw || {};
  var settings = raw.settings || {};
  return {
    settings: {
      paused: Boolean(settings.paused),
      requireApproval: Boolean(settings.requireApproval),
      approvePhotos: Boolean(settings.approvePhotos), // off unless an admin turns it on
      commentsOff: Boolean(settings.commentsOff),     // comments are on unless an admin turns them off
      blockedWords: Array.isArray(settings.blockedWords) ? settings.blockedWords : []
    },
    piles: Array.isArray(raw.piles) ? raw.piles : [],
    notes: raw.notes && typeof raw.notes === 'object' ? raw.notes : {}
  };
}

/** Saves the admin data, split into chunks in column A (from row 2). */
function saveAdmin_(admin) {
  var text = JSON.stringify(admin);
  var tab = getAdminTab_();
  var chunks = [];
  for (var i = 0; i < text.length; i += ADMIN_CHUNK) chunks.push(["'" + text.slice(i, i + ADMIN_CHUNK)]);
  if (tab.getLastRow() >= 2) tab.getRange(2, 1, tab.getLastRow() - 1, 1).clearContent();
  if (chunks.length) tab.getRange(2, 1, chunks.length, 1).setValues(chunks);
}

function status_(admin) {
  return { paused: admin.settings.paused, requireApproval: admin.settings.requireApproval,
    approvePhotos: admin.settings.approvePhotos, commentsOff: admin.settings.commentsOff };
}

/** What everyone may see: no hidden, waiting or deleted notes. */
function publicEntries_(entries, admin) {
  return entries
    .filter(function (entry) {
      var note = admin.notes[entry.id] || {};
      return !note.hidden && !note.pending && !note.deleted;
    })
    .map(function (entry) {
      entry.pinned = Boolean((admin.notes[entry.id] || {}).pinned);
      return entry;
    });
}

/** What the admin sees: every note plus its flags and pile. */
function adminEntries_(entries, admin) {
  var pileIds = {};
  admin.piles.forEach(function (pile) { pileIds[pile.id] = true; });
  return entries
    .filter(function (entry) { return !(admin.notes[entry.id] || {}).deleted; })
    .map(function (entry) {
      var note = admin.notes[entry.id] || {};
      entry.hidden = Boolean(note.hidden);
      entry.pinned = Boolean(note.pinned);
      entry.pending = Boolean(note.pending);
      entry.pileId = pileIds[note.pileId] ? note.pileId : null; // null = Inbox
      return entry;
    });
}

// =====================================================================
// Admin login
// =====================================================================

/** Checks the password (saved as ADMIN_PASSWORD in the Script properties) and hands out a token. */
function login_(password) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!expected) throw error_(503, 'Admin login is not set up yet. Add ADMIN_PASSWORD in the Script properties (see README).');

  var cache = CacheService.getScriptCache();
  var wrong = Number(cache.get('wrong-passwords') || 0);
  if (wrong >= MAX_WRONG_PASSWORDS) throw error_(429, 'Too many wrong passwords. Please wait 10 minutes and try again.');

  if (typeof password !== 'string' || !sameText_(password, expected)) {
    cache.put('wrong-passwords', String(wrong + 1), 600);
    throw error_(401, 'Wrong password.');
  }
  var token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('session-' + token, '1', SESSION_SECONDS);
  return { ok: true, token: token };
}

/** Compares two texts without stopping at the first difference. */
function sameText_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Throws 401 unless the token belongs to a logged-in admin. */
function requireAdmin_(token) {
  if (typeof token !== 'string' || !token || CacheService.getScriptCache().get('session-' + token) !== '1') {
    throw error_(401, 'Please log in as admin first.');
  }
}

// =====================================================================
// Admin actions
// =====================================================================

function adminAction_(action, body) {
  if (action === 'session') return { ok: true, admin: true };

  if (action === 'deleteComment') { // admins can remove any comment
    var commentId = checkId_(body.commentId);
    removeComments_(function (comment) { return comment.id === commentId; });
    return { ok: true };
  }

  if (action === 'state') {
    var admin = loadAdmin_();
    var extras = noteExtras_();
    return { ok: true, mode: 'sheets',
      entries: adminEntries_(readEntries_(), admin).map(function (entry) { return publicNote_(entry, extras); }),
      piles: admin.piles, settings: admin.settings, pileColors: PILE_COLORS };
  }

  // Everything below changes something: one at a time
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = loadAdmin_();
    var result;
    if (action === 'updateNote') result = updateNote_(data, body);
    else if (action === 'deleteNote') result = deleteNote_(data, body);
    else if (action === 'createPile') result = createPile_(data, body);
    else if (action === 'updatePile') result = updatePile_(data, body);
    else if (action === 'deletePile') result = deletePile_(data, body);
    else if (action === 'settings') result = changeSettings_(data, body);
    else throw error_(404, 'Unknown admin action.');
    saveAdmin_(data);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function checkId_(id) {
  if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id)) throw error_(400, 'That id does not look right.');
  return id;
}

/** { id, changes: { hidden?, pinned?, pending?, pileId? } } */
function updateNote_(data, body) {
  var id = checkId_(body.id);
  var changes = body.changes || {};
  var note = data.notes[id] || {};
  ['hidden', 'pinned', 'pending'].forEach(function (flag) {
    if (typeof changes[flag] === 'boolean') note[flag] = changes[flag];
  });
  if ('pileId' in changes) {
    var exists = data.piles.some(function (pile) { return pile.id === changes.pileId; });
    note.pileId = exists ? changes.pileId : null; // anything else = back to Inbox
  }
  data.notes[id] = note;
  return { ok: true, note: note };
}

/** { id } -> removes the row from the Sheet for good. */
function deleteNote_(data, body) {
  var id = checkId_(body.id);
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  var row = -1;
  if (/^row-\d+$/.test(id)) {
    row = Number(id.slice(4));
  } else if (lastRow >= 2) {
    var ids = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) { row = i + 2; break; }
    }
  }
  if (row >= 2 && row <= lastRow) {
    trashPhotos_(sheet.getRange(row, 7).getValue());
    sheet.deleteRow(row);
  }
  removeComments_(function (comment) { return comment.noteId === id; }); // its comments go too
  removeLikes_(function (like) { return like.noteId === id; });           // and its likes
  delete data.notes[id];
  return { ok: true };
}

function cleanPileName_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.pileName);
}

function createPile_(data, body) {
  var name = cleanPileName_(body.name);
  if (!name) throw error_(400, 'Give the pile a name.');
  if (data.piles.length >= LIMITS.maxPiles) throw error_(400, 'You can have at most ' + LIMITS.maxPiles + ' piles.');
  var pile = { id: 'pile-' + Utilities.getUuid().slice(0, 8), name: name,
    color: PILE_COLORS.indexOf(body.color) >= 0 ? body.color : 'yellow' };
  data.piles.push(pile);
  return { ok: true, pile: pile };
}

function updatePile_(data, body) {
  var pile = data.piles.filter(function (item) { return item.id === body.id; })[0];
  if (!pile) throw error_(404, 'That pile does not exist any more.');
  if ('name' in body) {
    var name = cleanPileName_(body.name);
    if (!name) throw error_(400, 'Give the pile a name.');
    pile.name = name;
  }
  if ('color' in body && PILE_COLORS.indexOf(body.color) >= 0) pile.color = body.color;
  return { ok: true, pile: pile };
}

/** Deletes a pile; its notes go back to the Inbox. */
function deletePile_(data, body) {
  data.piles = data.piles.filter(function (pile) { return pile.id !== body.id; });
  Object.keys(data.notes).forEach(function (id) {
    if (data.notes[id].pileId === body.id) data.notes[id].pileId = null;
  });
  return { ok: true };
}

/** { paused?, requireApproval?, approvePhotos?, blockedWords? } */
function changeSettings_(data, body) {
  if (typeof body.paused === 'boolean') data.settings.paused = body.paused;
  if (typeof body.requireApproval === 'boolean') data.settings.requireApproval = body.requireApproval;
  if (typeof body.approvePhotos === 'boolean') data.settings.approvePhotos = body.approvePhotos;
  if (typeof body.commentsOff === 'boolean') data.settings.commentsOff = body.commentsOff;
  if ('blockedWords' in body) {
    var list = Array.isArray(body.blockedWords) ? body.blockedWords : String(body.blockedWords || '').split(/[\n,]+/);
    var seen = {};
    data.settings.blockedWords = [];
    list.forEach(function (item) {
      var word = String(item).trim().toLowerCase().slice(0, LIMITS.word);
      if (word && !seen[word] && data.settings.blockedWords.length < LIMITS.maxWords) {
        seen[word] = true;
        data.settings.blockedWords.push(word);
      }
    });
  }
  return { ok: true, settings: data.settings };
}

// =====================================================================
// Accounts (Sign in with Google + a username) and comments
// ---------------------------------------------------------------------
// Only the Google account id and the chosen username are saved: no email,
// no real name. Notes stay anonymous; comments show the username.
// =====================================================================

var GOOGLE_CLIENT_ID = '293875604698-dj997jlobkn9afi81tlbe9gt02nfkhis.apps.googleusercontent.com';        // the website's Google sign-in key (public), or Script property GOOGLE_CLIENT_ID
var USERS_TAB = 'Users';          // GoogleId | Username | Joined
var COMMENTS_TAB = 'Comments';    // Id | NoteId | GoogleId | Text | Timestamp
var USER_TOKEN_DAYS = 30;         // how long someone stays signed in
var MAX_COMMENT = 200;
var MAX_COMMENTS_PER_MINUTE = 6;  // per person
var RESERVED_NAMES = ['admin', 'administrator', 'moderator', 'mod', 'anonim', 'anonymous', 'rehza', 'moodboard'];

function clientId_() {
  return PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || GOOGLE_CLIENT_ID;
}

function getTab_(name, headers) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var tab = spreadsheet.getSheetByName(name);
  if (!tab) {
    tab = spreadsheet.insertSheet(name);
    tab.appendRow(headers);
    tab.setFrozenRows(1);
  }
  return tab;
}

function usersTab_() { return getTab_(USERS_TAB, ['GoogleId', 'Username', 'Joined']); }
function commentsTab_() { return getTab_(COMMENTS_TAB, ['Id', 'NoteId', 'GoogleId', 'Text', 'Timestamp']); }

/** Asks Google if a sign-in ticket is real and for this website. Returns the Google account id. */
function verifyGoogle_(credential) {
  var clientId = clientId_();
  if (!clientId) throw error_(503, 'Google sign-in is not set up yet.');
  if (typeof credential !== 'string' || credential.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(credential)) {
    throw error_(400, 'Sign-in failed. Please try again.');
  }
  var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential),
    { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw error_(401, 'Sign-in failed. Please try again.');
  var info = JSON.parse(response.getContentText());
  var issuerOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  if (info.aud !== clientId || !issuerOk || !info.sub || Number(info.exp) * 1000 < Date.now()) {
    throw error_(401, 'Sign-in failed. Please try again.');
  }
  return String(info.sub);
}

// ----- The website's own sign-in key (lasts 30 days, signed with a secret) -----

function userSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('USER_SECRET');
  if (!secret) { // made once, automatically
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('USER_SECRET', secret);
  }
  return secret;
}

function b64_(value) {
  return Utilities.base64EncodeWebSafe(value).replace(/=+$/, '');
}

function unb64_(text) {
  while (text.length % 4) text += '=';
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(text)).getDataAsString();
}

function signPayload_(payload) {
  return b64_(Utilities.computeHmacSha256Signature(payload, userSecret_()));
}

function makeUserToken_(googleId) {
  var payload = googleId + '.' + (Date.now() + USER_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  return b64_(payload) + '.' + signPayload_(payload);
}

/** Returns the Google id inside a valid, unexpired sign-in key (or throws 401). */
function readUserToken_(token) {
  if (typeof token !== 'string' || !/^[\w-]+\.[\w-]+$/.test(token) || token.length > 400) {
    throw error_(401, 'Please sign in with Google first.');
  }
  var parts = token.split('.');
  var payload;
  try { payload = unb64_(parts[0]); } catch (err) { throw error_(401, 'Please sign in with Google first.'); }
  if (!sameText_(signPayload_(payload), parts[1])) throw error_(401, 'Please sign in with Google first.');
  var pieces = payload.split('.');
  if (Number(pieces[1]) < Date.now()) throw error_(401, 'Your sign-in ran out. Please sign in again.');
  return pieces[0];
}

// ----- Users -----

/** All users: { googleId: { row, username } } */
function readUsers_() {
  var tab = usersTab_();
  var last = tab.getLastRow();
  var users = {};
  if (last < 2) return users;
  tab.getRange(2, 1, last - 1, 2).getValues().forEach(function (row, index) {
    if (row[0]) users[String(row[0])] = { row: index + 2, username: String(row[1] || '') };
  });
  return users;
}

function cleanUsername_(value) {
  var name = String(value || '').trim();
  if (!/^[A-Za-z0-9_.]{3,20}$/.test(name)) throw error_(400, 'A username has 3 to 20 letters, numbers, _ or .');
  if (RESERVED_NAMES.indexOf(name.toLowerCase()) >= 0) throw error_(400, 'That username is not allowed. Please pick another one.');
  var blocked = loadAdmin_().settings.blockedWords;
  if (MoodCensor.hasBadWords(name) || (blocked.length && MoodCensor.createMatcher(blocked).hasMatch(name))) {
    throw error_(400, 'Please pick a kinder username.');
  }
  return name;
}

function googleLogin_(body) {
  var googleId = verifyGoogle_(body.credential);
  var user = readUsers_()[googleId];
  return { ok: true, token: makeUserToken_(googleId), username: user && user.username ? user.username : null };
}

function setUsername_(body) {
  var googleId = readUserToken_(body.userToken);
  var name = cleanUsername_(body.username);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var users = readUsers_();
    var taken = Object.keys(users).some(function (id) {
      return id !== googleId && users[id].username.toLowerCase() === name.toLowerCase();
    });
    if (taken) throw error_(409, 'That username is taken. Please pick another one.');
    var tab = usersTab_();
    if (users[googleId]) tab.getRange(users[googleId].row, 2).setValue("'" + name);
    else tab.appendRow(["'" + googleId, "'" + name, new Date()]);
    return { ok: true, username: name };
  } finally {
    lock.releaseLock();
  }
}

// ----- Comments -----

/** Every comment: [{ row, id, noteId, googleId, text, timestamp }] (oldest first) */
function readComments_() {
  var tab = commentsTab_();
  var last = tab.getLastRow();
  if (last < 2) return [];
  return tab.getRange(2, 1, last - 1, 5).getValues().map(function (row, index) {
    var time = row[4] instanceof Date ? row[4] : new Date(row[4]);
    return { row: index + 2, id: String(row[0]), noteId: String(row[1]), googleId: String(row[2]),
      text: String(row[3]), timestamp: isNaN(time.getTime()) ? '' : time.toISOString() };
  }).filter(function (comment) { return comment.id && comment.noteId; });
}

/** { noteId: number of comments } */
function commentCounts_() {
  var counts = {};
  readComments_().forEach(function (comment) { counts[comment.noteId] = (counts[comment.noteId] || 0) + 1; });
  return counts;
}

/** The comments of one note, for everyone to read (usernames only, no Google ids). */
function listComments_(noteId) {
  checkId_(noteId);
  var users = readUsers_();
  return readComments_()
    .filter(function (comment) { return comment.noteId === noteId; })
    .map(function (comment) {
      var user = users[comment.googleId];
      return { id: comment.id, username: user && user.username ? user.username : 'deleted', verified: Boolean(user && user.username),
        text: comment.text, timestamp: comment.timestamp };
    });
}

function addComment_(body) {
  var googleId = readUserToken_(body.userToken);
  var user = readUsers_()[googleId];
  if (!user || !user.username) throw error_(400, 'Pick a username first.');
  var noteId = checkId_(body.noteId);
  var text = cleanText_(body.text).replace(/\s+/g, ' ');
  if (!text) throw error_(400, 'Write something first.');
  if (text.length > MAX_COMMENT) throw error_(400, 'A comment can be at most ' + MAX_COMMENT + ' characters.');

  var cache = CacheService.getScriptCache();
  var key = 'comments-' + googleId + '-' + Math.floor(Date.now() / 60000);
  var count = Number(cache.get(key) || 0);
  if (count >= MAX_COMMENTS_PER_MINUTE) throw error_(429, 'So many comments! Please wait a minute.');
  cache.put(key, String(count + 1), 120);

  var admin = loadAdmin_();
  if (admin.settings.commentsOff) throw error_(423, 'Comments are turned off by the admin right now.');
  if (admin.settings.blockedWords.length && MoodCensor.createMatcher(admin.settings.blockedWords).hasMatch(text)) {
    throw error_(400, 'Please keep it kind: some words in your comment are not allowed here.');
  }
  var visible = publicEntries_(readEntries_(), admin).some(function (entry) { return entry.id === noteId; });
  if (!visible) throw error_(404, 'That note is not on the map any more.');

  var comment = { id: Utilities.getUuid(), username: user.username, verified: true, text: text, timestamp: new Date().toISOString() };
  commentsTab_().appendRow([comment.id, noteId, "'" + googleId, asPlainText_(text), new Date()]);
  return { ok: true, comment: comment };
}

/** Deletes comment rows that match test (from the bottom, so row numbers stay right). */
function removeComments_(test) {
  var tab = commentsTab_();
  readComments_().filter(test).reverse().forEach(function (comment) { tab.deleteRow(comment.row); });
}

/** Someone deletes their own comment. */
function deleteMyComment_(body) {
  var googleId = readUserToken_(body.userToken);
  var id = checkId_(body.commentId);
  var mine = readComments_().some(function (comment) { return comment.id === id && comment.googleId === googleId; });
  if (!mine) throw error_(403, 'You can only delete your own comments.');
  removeComments_(function (comment) { return comment.id === id; });
  return { ok: true };
}

// ----- What the website may see of a note -----

/** Things added to every note: usernames, comment counts, like counts. */
function noteExtras_() {
  return { users: readUsers_(), comments: commentCounts_(), likes: likeCounts_() };
}

/**
 * A note for the website: never the owner's Google id. Notes posted "as my
 * username" show the CURRENT username (so a rename shows up) with verified: true.
 */
function publicNote_(entry, extras) {
  var account = entry.owner ? extras.users[entry.owner] : null;
  if (entry.showUser) {
    entry.name = account && account.username ? account.username : '';
    entry.verified = Boolean(account && account.username);
  } else {
    entry.verified = false;
  }
  entry.comments = extras.comments[entry.id] || 0;
  entry.likes = extras.likes[entry.id] || 0;
  delete entry.owner;
  delete entry.showUser;
  return entry;
}

// ----- Likes (one per signed-in person per note) -----

var LIKES_TAB = 'Likes'; // NoteId | GoogleId | Timestamp
var MAX_LIKES_PER_MINUTE = 40;

function likesTab_() { return getTab_(LIKES_TAB, ['NoteId', 'GoogleId', 'Timestamp']); }

function readLikes_() {
  var tab = likesTab_();
  var last = tab.getLastRow();
  if (last < 2) return [];
  return tab.getRange(2, 1, last - 1, 2).getValues().map(function (row, index) {
    return { row: index + 2, noteId: String(row[0]), googleId: String(row[1]) };
  }).filter(function (like) { return like.noteId && like.googleId; });
}

function likeCounts_() {
  var counts = {};
  readLikes_().forEach(function (like) { counts[like.noteId] = (counts[like.noteId] || 0) + 1; });
  return counts;
}

function removeLikes_(test) {
  var tab = likesTab_();
  readLikes_().filter(test).reverse().forEach(function (like) { tab.deleteRow(like.row); });
}

/** Like / unlike a note. Returns { liked, count }. */
function toggleLike_(body) {
  var googleId = readUserToken_(body.userToken);
  var noteId = checkId_(body.noteId);
  var cache = CacheService.getScriptCache();
  var key = 'likes-' + googleId + '-' + Math.floor(Date.now() / 60000);
  var count = Number(cache.get(key) || 0);
  if (count >= MAX_LIKES_PER_MINUTE) throw error_(429, 'So many likes! Please wait a minute.');
  cache.put(key, String(count + 1), 120);

  var visible = publicEntries_(readEntries_(), loadAdmin_()).some(function (entry) { return entry.id === noteId; });
  if (!visible) throw error_(404, 'That note is not on the map any more.');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var likes = readLikes_();
    var mine = likes.filter(function (like) { return like.noteId === noteId && like.googleId === googleId; });
    var liked;
    if (mine.length) {
      removeLikes_(function (like) { return like.noteId === noteId && like.googleId === googleId; });
      liked = false;
    } else {
      likesTab_().appendRow([noteId, "'" + googleId, new Date()]);
      liked = true;
    }
    var total = likes.filter(function (like) { return like.noteId === noteId; }).length + (liked ? 1 : -mine.length);
    return { ok: true, liked: liked, count: Math.max(0, total) };
  } finally {
    lock.releaseLock();
  }
}

/** The notes this person liked (so the website can show ♥ instead of ♡). */
function myLikes_(body) {
  var googleId = readUserToken_(body.userToken);
  var ids = readLikes_().filter(function (like) { return like.googleId === googleId; }).map(function (like) { return like.noteId; });
  return { ok: true, likes: ids };
}

// ----- My notes (profile page): see, edit and delete your own notes -----

/** The Sheet row of a note (or -1). */
function findNoteRow_(id) {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (/^row-\d+$/.test(id)) return Number(id.slice(4));
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

/** Your own note, or a friendly error. */
function ownNote_(googleId, id) {
  var entry = readEntries_().filter(function (item) { return item.id === id; })[0];
  if (!entry || (loadAdmin_().notes[id] || {}).deleted) throw error_(404, 'That note does not exist any more.');
  if (entry.owner !== googleId) throw error_(403, 'You can only change your own notes.');
  return entry;
}

function myNotes_(body) {
  var googleId = readUserToken_(body.userToken);
  var admin = loadAdmin_();
  var extras = noteExtras_();
  var user = extras.users[googleId];
  var notes = readEntries_()
    .filter(function (entry) { return entry.owner === googleId && !(admin.notes[entry.id] || {}).deleted; })
    .map(function (entry) {
      var flags = admin.notes[entry.id] || {};
      var note = publicNote_(entry, extras);
      note.hidden = Boolean(flags.hidden);
      note.pending = Boolean(flags.pending);
      return note;
    });
  return { ok: true, username: user && user.username ? user.username : null, notes: notes };
}

/** { userToken, noteId, mood, whatHappened, comment } */
function editMyNote_(body) {
  var googleId = readUserToken_(body.userToken);
  var id = checkId_(body.noteId);
  var clean = validateEntry_({ mood: body.mood, whatHappened: body.whatHappened, comment: body.comment, name: '' });
  var admin = loadAdmin_();
  if (admin.settings.blockedWords.length) {
    var matcher = MoodCensor.createMatcher(admin.settings.blockedWords);
    if (matcher.hasMatch(clean.whatHappened) || matcher.hasMatch(clean.comment)) {
      throw error_(400, 'Please keep it kind: some words in your note are not allowed here.');
    }
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    ownNote_(googleId, id);
    var row = findNoteRow_(id);
    if (row < 2) throw error_(404, 'That note does not exist any more.');
    var sheet = getSheet_();
    sheet.getRange(row, 2, 1, 3).setValues([[clean.mood, asPlainText_(clean.whatHappened), asPlainText_(clean.comment)]]);
    sheet.getRange(row, 10).setValue(new Date());
    // "Check new notes first" is on: an edited note is checked again
    if (admin.settings.requireApproval) {
      var fresh = loadAdmin_();
      fresh.notes[id] = fresh.notes[id] || {};
      fresh.notes[id].pending = true;
      saveAdmin_(fresh);
    }
    return { ok: true, pending: Boolean(admin.settings.requireApproval),
      note: { id: id, mood: clean.mood, whatHappened: clean.whatHappened, comment: clean.comment, edited: new Date().toISOString() } };
  } finally {
    lock.releaseLock();
  }
}

function deleteMyNote_(body) {
  var googleId = readUserToken_(body.userToken);
  var id = checkId_(body.noteId);
  ownNote_(googleId, id);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = loadAdmin_();
    deleteNote_(data, { id: id });
    saveAdmin_(data);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// =====================================================================
// Small helpers
// =====================================================================

function error_(code, message) {
  var err = new Error(message);
  err.code = code;
  return err;
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/** Optional: run once from the editor to create the header row. */
function setupSheet() {
  var sheet = getSheet_();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  getAdminTab_();
  Logger.log('Ready! Header row is: ' + HEADERS.join(' | '));
}

// =====================================================================
// CENSOR-COPY-BELOW (added automatically from censor.js — don't edit here)
// =====================================================================

/* =====================================================================
   Class Mood Journey — censor.js
   Finds swear words (English, Indonesian, Javanese) so the journey map
   can cover them with a *censored* sticker, and so the admin's
   "blocked words" can refuse notes.

   Works in both places ("UMD" pattern):
     browser:  <script src="censor.js"> -> window.MoodCensor
     Node:     const MoodCensor = require('./censor.js')

   ---------------------------------------------------------------------
   Where the words come from
     English:    List of Dirty, Naughty, Obscene and Otherwise Bad Words
                 https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
     Indonesian: LDNOOBW V2 (data/id.txt, CC0) + "Daftar Kata-kata Kasar
                 Bahasa Indonesia" (gist by mizwardomlank)
                 https://github.com/LDNOOBWV2/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words_V2
     Javanese:   words described in research on Javanese swearing
                 (e.g. Temanggung dialect, "Yowis Ben 2" study) and common variants.
   The lists were hand-picked for a school: innocent words that those
   lists also contain ("terima kasih", "bola", "robot", "susu", ...) and
   biology words ("penis", "vagina", ...) were left out on purpose.

   ---------------------------------------------------------------------
   How tricks are caught
     c0ck, k0nt0l, 4njing, $hit  -> numbers/symbols read as letters
     fvck, phuck                 -> v = u, ph = f
     fuuuuck, anjiiing           -> stretched letters
     f.u.c.k, f-u-c-k            -> dots and dashes inside a word
     f u c k, a s u              -> spaced-out single letters
     kon tol                     -> a word split in two
     f*ck, sh*t, k*nt*l          -> stars used as hidden letters
     fucking, kontolmu, dientot  -> endings (-ing, -mu, -nya, ...) and prefixes (di-, ng-, ...)
     motherfucker, dasarkontol   -> strong words hidden inside longer words
     cyrillic look-alikes (сock) -> turned into normal letters
   ===================================================================== */

(function share(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MoodCensor = api;
})(typeof self !== 'undefined' ? self : this, function createCensor() {
  'use strict';

  // ===================================================================
  // Word lists
  // ===================================================================

  const ENGLISH = [
    'fuck', 'fucker', 'fucking', 'fuckin', 'fucked', 'motherfucker', 'clusterfuck', 'fucktard',
    'fuk', 'fuq', 'fck', 'fcuk', 'wtf', 'stfu',
    'shit', 'shitty', 'bullshit', 'shithead', 'apeshit', 'horseshit',
    'bitch', 'bitches', 'bastard', 'asshole', 'arsehole', 'arse', 'ass', 'asses', 'asshat',
    'dumbass', 'jackass', 'assmunch', 'cunt', 'twat', 'dick', 'dickhead', 'cock', 'cocks',
    'cocksucker', 'prick', 'pussy', 'wank', 'wanker', 'tosser', 'bollocks', 'douche', 'douchebag',
    'slut', 'whore', 'hooker', 'skank', 'porn', 'porno', 'pornography', 'blowjob', 'handjob',
    'rimjob', 'jizz', 'cum', 'cumshot', 'dildo', 'boner', 'boob', 'boobs', 'tits', 'titties',
    'titty', 'horny', 'milf', 'hentai', 'gangbang', 'bukkake', 'orgy', 'rape', 'rapist', 'raping',
    'pedophile', 'paedophile', 'nigger', 'nigga', 'faggot', 'fag', 'kike', 'spic', 'chink', 'coon',
    'paki', 'tranny', 'retard', 'retarded', 'spastic', 'negro', 'idiot', 'xxx', 'nsfw',
  ];

  const INDONESIAN = [
    'anjing', 'anjeng', 'anjink', 'anjir', 'anjrit', 'anjay', 'njing', 'ajg', 'anjg', 'asw',
    'babi', 'bangsat', 'bangsad', 'bgsd', 'bgst', 'bangke', 'bajingan', 'brengsek', 'berengsek',
    'brengsex', 'keparat', 'kaparat', 'bedebah', 'jahanam', 'biadab', 'jadah',
    'goblok', 'goblog', 'gblk', 'geblek', 'tolol', 'tlol', 'bego', 'begok', 'dungu', 'dongok',
    'bacot', 'cocot', 'congor', 'monyet', 'munyuk', 'kunyuk', 'kampret', 'sompret', 'sontoloyo', 'kampang',
    'tai', 'tae', 'taek', 'taik', 'tahi', 'tokai',
    'kontol', 'konti', 'kntl', 'kotl', 'memek', 'memex', 'meki', 'mmk', 'pepek', 'peler', 'pler', 'pelir',
    'titit', 'tetek', 'toket', 'tobrut', 'itil', 'kelentit', 'jembut', 'jembud',
    'ngentot', 'ngentod', 'entot', 'ngewe', 'ewe', 'ngewek', 'ngaceng', 'ngecrot', 'crot', 'coli',
    'colmek', 'nyoli', 'sange', 'bokep', 'peju', 'pejuh', 'sepong', 'bispak',
    'lonte', 'perek', 'pelacur', 'sundal', 'jablay', 'pecun', 'germo', 'cabul', 'mesum', 'kimcil',
    'pukimak', 'pukimai', 'puki', 'kimak', 'kimax', 'pantek', 'heunceut', 'henceut', 'hencet',
    'cuki', 'cukimai', 'banci', 'bencong', 'maho',
  ];

  const JAVANESE = [
    'asu', 'jancok', 'jancuk', 'jancik', 'jancuki', 'jiancok', 'jiancuk', 'dancok', 'dancuk',
    'diancok', 'diancuk', 'ancok', 'ancuk', 'cok', 'cuk', 'jamput', 'jiamput',
    'matamu', 'ndasmu', 'raimu', 'cocotmu', 'cangkemmu', 'lambemu',
    'gathel', 'tempik', 'turuk', 'silit', 'peli', 'kirik', 'celeng', 'telek',
    'pekok', 'ndlogok', 'sikak', 'thelo',
  ];

  /** Strong words that are caught even when hidden inside a longer word. */
  const STEMS = [
    'fuck', 'shit', 'cunt', 'bitch', 'whore', 'nigger', 'faggot', 'asshole', 'cocksuck',
    'kontol', 'ngentot', 'memek', 'jancok', 'jancuk', 'dancok', 'bangsat', 'bajingan',
    'brengsek', 'pukimak', 'jembut', 'anjing',
  ];

  /** Normal words that look like swear words to a computer. Never censored. */
  const SAFE_WORDS = [
    'cocky', 'cocker', 'peacock', 'hancock', 'cocktail', 'cockpit', 'cockroach', 'dickens', 'dicky',
    'shiitake', 'shitake', 'scunthorpe', 'classic', 'assassin', 'assess', 'assist', 'compass',
    'asus', 'asuransi', 'pantai', 'santai', 'petai', 'memekik', 'memekikkan', 'celengan', 'pelikan',
  ];

  // ===================================================================
  // Turning any spelling into plain letters
  // ===================================================================

  /** Symbols, numbers and look-alike letters -> normal letters. '#' = could be i or l. */
  const LOOKALIKES = {
    0: 'o', 1: '#', '|': '#', '!': '#', 3: 'e', 4: 'a', '@': 'a', 5: 's', $: 's', 7: 't', '+': 't',
    8: 'b', 9: 'g', '€': 'e', '¢': 'c', '£': 'l',
    // Cyrillic and Greek letters that look Latin
    а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', к: 'k', м: 'm', т: 't', в: 'b', н: 'h',
    і: 'i', ј: 'j', ѕ: 's', α: 'a', ε: 'e', ι: 'i', κ: 'k', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ν: 'v',
  };

  /**
   * One piece of text -> its plain-letter spellings (usually 1, or 2 when "1" / "|"
   * could be an i or an l). '*' is kept: it stands for a hidden letter.
   */
  function plainSpellings(raw) {
    let text = String(raw).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
    let mapped = '';
    for (const char of text) mapped += LOOKALIKES[char] ?? char;
    text = mapped.replace(/ph/g, 'f').replace(/v/g, 'u').replace(/[^a-z*#]/g, '');
    if (!text.includes('#')) return [text];
    return [text.replace(/#/g, 'i'), text.replace(/#/g, 'l')];
  }

  /**
   * A word -> a pattern that also accepts stretched letters.
   *  long words (4+ letters): any letter may repeat   ("fuck" matches "fuuuuck")
   *  short words (1-3):       only big stretches      ("cok" matches "coook" but not "cook")
   */
  function stretchPattern(word, allowAnyStretch) {
    return word.replace(/(.)\1*/g, (run, letter) => (allowAnyStretch
      ? (run.length === 1 ? `${letter}+` : `${letter}{${run.length},}`)
      : `${letter}{${run.length}}(?:${letter}{2,})?`));
  }

  const PREFIXES = '(?:di|nge|ng|ke|pe|ber|ter|meng|me|ny)';
  const LONG_ENDINGS = '(?:ing|in|ers|er|ed|ies|es|s|y|nya|mu|ne|e|lah|lu|lo|kau|ku)';
  const SHORT_ENDINGS = '(?:nya|mu|ne|lu|lo|s)';
  const WILDCARD_ENDINGS = ['', 'ing', 'er', 's', 'ed', 'mu', 'nya'];
  const TRIM_EDGES = /^[\s.,;:?!"'()[\]{}<>«»“”‘’…~/\\_*-]+|[\s.,;:?!"'()[\]{}<>«»“”‘’…~/\\_*-]+$/g;

  // ===================================================================
  // The matcher
  // ===================================================================

  /**
   * Builds a matcher for a list of words.
   *   options.stems: words that also count when hidden inside longer words
   */
  function createMatcher(wordList, options = {}) {
    const clean = (list) => [...new Set(list.map((word) => plainSpellings(word)[0].replace(/[*#]/g, '')))]
      .filter((word) => word.length >= 2);
    const words = clean(wordList);
    const stems = clean(options.stems || []);
    const safe = new Set(clean([...SAFE_WORDS, ...(options.safe || [])]));

    const alternation = (list, anyStretch) => list.map((word) => stretchPattern(word, anyStretch)).join('|');
    const shortWords = words.filter((word) => word.length <= 3);
    const longWords = words.filter((word) => word.length >= 4);
    const splitWords = words.filter((word) => word.length >= 5);

    const shortRe = shortWords.length
      ? new RegExp(`^(?:${alternation(shortWords, false)})${SHORT_ENDINGS}?$`) : null;
    const longRe = longWords.length
      ? new RegExp(`^${PREFIXES}?(?:${alternation(longWords, true)})${LONG_ENDINGS}?$`) : null;
    const splitRe = splitWords.length
      ? new RegExp(`^${PREFIXES}?(?:${alternation(splitWords, true)})${LONG_ENDINGS}?$`) : null;
    const stemRe = stems.length ? new RegExp(alternation(stems, true)) : null;
    const wildcardForms = words.flatMap((word) => WILDCARD_ENDINGS.map((ending) => word + ending));

    const cache = new Map();

    /** Is this one plain spelling a bad word? */
    function isBadSpelling(spelling) {
      if (spelling.length < 2 || safe.has(spelling)) return false;
      if (spelling.includes('*')) {
        // Stars = hidden letters, e.g. "f*ck". Needs at least 2 real letters.
        const letters = spelling.replace(/\*/g, '');
        if (letters.length < 2) return false;
        const pattern = new RegExp(`^${spelling.replace(/\*/g, '[a-z]')}$`);
        return wildcardForms.some((form) => pattern.test(form));
      }
      return Boolean((shortRe && shortRe.test(spelling))
        || (longRe && longRe.test(spelling))
        || (stemRe && stemRe.test(spelling)));
    }

    /** Is this piece of text (one word as typed) a bad word? */
    function isBad(piece) {
      if (cache.has(piece)) return cache.get(piece);
      const result = plainSpellings(piece).some(isBadSpelling);
      cache.set(piece, result);
      return result;
    }

    /** Two neighbouring pieces that together make a long bad word ("kon tol"). */
    function isBadSplit(first, second) {
      if (!splitRe) return false;
      return plainSpellings(first).some((a) => plainSpellings(second).some((b) => {
        if (a.length < 3 || b.length < 3) return false; // "bang ke mana" is fine
        const joined = a + b;
        return !safe.has(joined) && splitRe.test(joined);
      }));
    }

    /** All bad words in a text, as [{ start, end }] positions in the ORIGINAL text. */
    function findRanges(text) {
      const source = String(text || '');
      const pieces = [];
      const wordRe = /\S+/g;
      let match;
      while ((match = wordRe.exec(source))) {
        // Trim punctuation around the word, but remember where the word really is
        const leading = match[0].length - match[0].replace(/^[\s.,;:?!"'()[\]{}<>«»“”‘’…~/\\_*-]+/, '').length;
        const core = match[0].replace(TRIM_EDGES, '');
        if (!core) continue;
        const start = match.index + leading;
        pieces.push({ core, start, end: start + core.length, size: plainSpellings(core)[0].length });
      }

      const ranges = [];
      let i = 0;
      while (i < pieces.length) {
        // 1) Spaced-out letters: "f u c k"
        let j = i;
        while (j < pieces.length && pieces[j].size === 1) j += 1;
        if (j - i >= 3 && isBad(pieces.slice(i, j).map((piece) => piece.core).join(''))) {
          ranges.push({ start: pieces[i].start, end: pieces[j - 1].end });
          i = j;
          continue;
        }
        // 2) One word: "c0ck", "kontolmu", "f*ck"
        if (isBad(pieces[i].core)) {
          ranges.push({ start: pieces[i].start, end: pieces[i].end });
          i += 1;
          continue;
        }
        // 3) A word split in two: "kon tol"
        if (i + 1 < pieces.length && isBadSplit(pieces[i].core, pieces[i + 1].core)) {
          ranges.push({ start: pieces[i].start, end: pieces[i + 1].end });
          i += 2;
          continue;
        }
        i += 1;
      }
      return ranges;
    }

    return {
      findRanges,
      hasMatch: (text) => findRanges(text).length > 0,
      wordCount: words.length,
    };
  }

  // ===================================================================
  // Ready-made censor with all three languages
  // ===================================================================

  const defaultMatcher = createMatcher([...ENGLISH, ...INDONESIAN, ...JAVANESE], { stems: STEMS });

  /** Splits text into [{ text, censored }] pieces. Censored pieces get a sticker. */
  function censorSegments(text) {
    const source = String(text || '');
    const segments = [];
    let position = 0;
    for (const range of defaultMatcher.findRanges(source)) {
      if (range.start > position) segments.push({ text: source.slice(position, range.start), censored: false });
      segments.push({ text: source.slice(range.start, range.end), censored: true });
      position = range.end;
    }
    if (position < source.length) segments.push({ text: source.slice(position), censored: false });
    return segments;
  }

  /** The same text with bad words replaced by a label (for screen readers, titles, ...). */
  function censorPlain(text, label = '*censored*') {
    return censorSegments(text).map((segment) => (segment.censored ? label : segment.text)).join('');
  }

  function hasBadWords(text) {
    return defaultMatcher.hasMatch(text);
  }

  return {
    createMatcher,
    censorSegments,
    censorPlain,
    hasBadWords,
    WORD_COUNT: defaultMatcher.wordCount,
    LANGUAGES: ['English', 'Indonesian', 'Javanese'],
  };
});
