'use strict';
/*
 * Writes site-config.js with the Apps Script URL from config.json
 * (or from the first argument):
 *   node tools/make-site-config.js
 *   node tools/make-site-config.js https://script.google.com/macros/s/.../exec
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
let url = process.argv[2] || '';
if (!url) {
  try { url = require(path.join(root, 'config.json')).appsScriptUrl || ''; } catch { /* no config.json */ }
}
url = url.trim();
const valid = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url);
if (url && !valid) console.warn('⚠ That does not look like an Apps Script Web app URL (…/exec). Leaving it empty.');

const text = `/* =====================================================================
   Class Mood Journey — site-config.js
   Your Google Apps Script Web app URL (ends with /exec).
   - Filled in: the website talks straight to your Google Sheet, so it
     works on free static hosting like GitHub Pages.
   - Empty (''): the website uses the local Node server (npm start).
   This URL is not a secret: visitors' browsers need it to reach the
   Sheet. The admin password stays safe inside Apps Script.
   ===================================================================== */

window.MOOD_CONFIG = {
  appsScriptUrl: '${valid ? url : ''}',
};
`;
fs.writeFileSync(path.join(root, 'site-config.js'), text, 'utf8');
console.log(valid ? '✔ site-config.js now points to your Apps Script.' : '✔ site-config.js written (empty = local server).');
