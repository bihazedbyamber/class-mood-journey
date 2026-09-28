/* =====================================================================
 * Class Mood Journey — Google Apps Script backend (Code.gs)
 * ---------------------------------------------------------------------
 * Paste this into your Google Sheet: Extensions > Apps Script.
 * Then deploy it as a Web app (see README.md).
 *
 * The first sheet (tab) holds the data, with this header row:
 *   Timestamp | Mood | WhatHappened | Comment | Name | Id
 * (If row 1 is empty, the script writes the header for you.
 *  Name is empty when the student stayed anonymous.
 *  Id is a unique code per note, so the admin page can keep track of it
 *  even if rows are moved or deleted in the Sheet.)
 *
 *   doGet  -> returns all rows as JSON:  { ok: true, entries: [...] }
 *   doPost -> adds one row, body JSON:   { mood, whatHappened, comment, name? }
 *
 * Admin data (piles, hidden/pinned notes, blocked words, switches) is kept
 * in a tab called "Admin", so it survives restarts of the website server:
 *   doPost { action: "loadAdmin", secret }         -> { ok, admin }
 *   doPost { action: "saveAdmin", secret, admin }  -> { ok }
 * These only work with the secret key saved in Project Settings >
 * Script properties as ADMIN_SECRET (the same value as the website's
 * "sheetSecret" / SHEET_SECRET). See README.md.
 *
 * Our Node server (server.js) is the only thing that calls this script.
 * ===================================================================== */

var HEADERS = ['Timestamp', 'Mood', 'WhatHappened', 'Comment', 'Name', 'Id'];
var MAX_WHAT_HAPPENED = 80;
var MAX_COMMENT = 300;
var MAX_NAME = 24;

/** GET: send back every entry in the sheet. */
function doGet() {
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return jsonResponse_({ ok: true, entries: [] });

    var rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    var entries = [];

    rows.forEach(function (row, index) {
      var time = row[0] instanceof Date ? row[0] : new Date(row[0]);
      var mood = Number(row[1]);
      // Skip empty or broken rows instead of failing
      if (isNaN(time.getTime()) || !(mood >= 1 && mood <= 5)) return;

      entries.push({
        id: String(row[5] || '') || 'row-' + (index + 2), // old rows without an Id use their row number
        timestamp: time.toISOString(),
        mood: Math.round(mood * 2) / 2, // 1, 1.5, 2 ... 5 (x.5 = an in-between mood)
        whatHappened: String(row[2]),
        comment: String(row[3]),
        name: String(row[4] || '')
      });
    });

    return jsonResponse_({ ok: true, entries: entries });
  } catch (error) {
    return jsonResponse_({ ok: false, error: 'Could not read the sheet: ' + error.message });
  }
}

/** POST: check the entry and add it as a new row. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Admin data (needs the secret key)
    if (body.action === 'loadAdmin' || body.action === 'saveAdmin') {
      if (!isCorrectSecret_(body.secret)) {
        return jsonResponse_({ ok: false, code: 403, error: 'Admin sync: wrong or missing secret key (see README).' });
      }
      if (body.action === 'loadAdmin') return jsonResponse_({ ok: true, admin: loadAdmin_() });
      lock.waitLock(10000);
      saveAdmin_(body.admin);
      return jsonResponse_({ ok: true });
    }

    var entry = validateEntry_(body);
    if (entry.error) return jsonResponse_({ ok: false, code: 400, error: entry.error });

    // Only one student writes at a time, so rows never overwrite each other
    lock.waitLock(10000);
    var sheet = getSheet_();
    var now = new Date();
    var id = Utilities.getUuid();
    sheet.appendRow([
      now, entry.mood, asPlainText_(entry.whatHappened), asPlainText_(entry.comment), asPlainText_(entry.name), id
    ]);

    return jsonResponse_({
      ok: true,
      entry: {
        id: id,
        timestamp: now.toISOString(),
        mood: entry.mood,
        whatHappened: entry.whatHappened,
        comment: entry.comment,
        name: entry.name
      }
    });
  } catch (error) {
    return jsonResponse_({ ok: false, error: 'Could not save the entry: ' + error.message });
  } finally {
    lock.releaseLock();
  }
}

/** Checks the data. Returns { mood, whatHappened, comment } or { error }. */
function validateEntry_(body) {
  // 1 to 5 in steps of 0.5: 4.5 = Great + Good, 3.5 = Good + Okay, ...
  var mood = Number(body.mood);
  if (!(mood >= 1 && mood <= 5) || Math.round(mood * 2) !== mood * 2) {
    return { error: 'Please pick a mood.' };
  }

  var whatHappened = cleanText_(body.whatHappened).replace(/\s+/g, ' ');
  var comment = cleanText_(body.comment);
  var name = cleanText_(body.name).replace(/\s+/g, ' '); // empty = anonymous

  if (!whatHappened) return { error: 'Please write a few words about what happened in class.' };
  if (name.length > MAX_NAME) return { error: 'The name can be at most ' + MAX_NAME + ' characters.' };
  if (whatHappened.length > MAX_WHAT_HAPPENED) {
    return { error: '"What happened" can be at most ' + MAX_WHAT_HAPPENED + ' characters.' };
  }
  if (comment.length > MAX_COMMENT) {
    return { error: 'The comment can be at most ' + MAX_COMMENT + ' characters.' };
  }
  return { mood: mood, whatHappened: whatHappened, comment: comment, name: name };
}

/** Trims text and removes invisible control characters. */
function cleanText_(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

/**
 * A leading apostrophe tells Google Sheets "this is plain text".
 * It stops text like "=SUM(A1)" from becoming a formula and "3/4" from becoming a date.
 * The apostrophe is not shown in the sheet and not returned by getValues().
 */
function asPlainText_(text) {
  return text ? "'" + text : '';
}

/** The first tab of this spreadsheet. Adds the header row if it's missing. */
function getSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ---------------------------------------------------------------------
// Admin data in the "Admin" tab
// ---------------------------------------------------------------------

var ADMIN_TAB = 'Admin';
var ADMIN_CHUNK = 40000; // one cell holds max 50,000 characters, so long data is split over rows

/** True when the given key matches ADMIN_SECRET in the Script properties. */
function isCorrectSecret_(secret) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET');
  return Boolean(expected) && typeof secret === 'string' && secret === expected;
}

function getAdminTab_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var tab = spreadsheet.getSheetByName(ADMIN_TAB);
  if (!tab) {
    tab = spreadsheet.insertSheet(ADMIN_TAB); // added at the end, so the notes stay in the first tab
    tab.getRange(1, 1).setValue('Used by the Class Mood Journey website (admin data). Please do not edit.');
  }
  return tab;
}

/** Reads the admin data (or null if nothing is saved yet). */
function loadAdmin_() {
  var tab = getAdminTab_();
  var lastRow = tab.getLastRow();
  if (lastRow < 2) return null;
  var text = tab.getRange(2, 1, lastRow - 1, 1).getValues().map(function (row) { return String(row[0]); }).join('');
  return text ? JSON.parse(text) : null;
}

/** Saves the admin data, split into chunks in column A (from row 2). */
function saveAdmin_(admin) {
  var text = JSON.stringify(admin || {});
  var tab = getAdminTab_();
  var chunks = [];
  for (var i = 0; i < text.length; i += ADMIN_CHUNK) chunks.push(["'" + text.slice(i, i + ADMIN_CHUNK)]);
  if (tab.getLastRow() >= 2) tab.getRange(2, 1, tab.getLastRow() - 1, 1).clearContent();
  if (chunks.length) tab.getRange(2, 1, chunks.length, 1).setValues(chunks);
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Optional: run this once from the editor (select "setupSheet" and press Run)
 * to create the header row and check that the script can use your sheet.
 */
function setupSheet() {
  var sheet = getSheet_();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  Logger.log('Ready! Header row is: ' + HEADERS.join(' | '));
}
