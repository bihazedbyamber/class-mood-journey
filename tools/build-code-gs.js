'use strict';
/*
 * Copies censor.js to the bottom of apps-script/Code.gs, so the Sheet uses
 * the same trick-proof word finder as the website.
 * Run after changing censor.js:   node tools/build-code-gs.js
 */
const fs = require('node:fs');
const path = require('node:path');

const MARK = '// CENSOR-COPY-BELOW (added automatically from censor.js — don\'t edit here)';
const root = path.join(__dirname, '..');
const codeFile = path.join(root, 'apps-script', 'Code.gs');

const code = fs.readFileSync(codeFile, 'utf8');
const at = code.indexOf(MARK);
if (at < 0) throw new Error('Marker not found in Code.gs');
const head = code.slice(0, code.indexOf('\n', at) + 1);
const censor = fs.readFileSync(path.join(root, 'censor.js'), 'utf8');
const separator = '// =====================================================================\n\n';

fs.writeFileSync(codeFile, head + separator + censor.trimEnd() + '\n', 'utf8');
console.log('✔ apps-script/Code.gs now includes the latest censor.js');
