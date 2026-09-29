/* =====================================================================
   Class Mood Journey — admin.js
   Runs on admin.html (the Admin Desk). It:
     1. shows a password box until the server accepts the password
     2. loads every note + the admin's piles and settings
     3. draws piles as stacks of sticky notes; drop a note on a pile to move it
     4. spreads out the chosen pile, with actions per note:
        approve, pin, hide/show, move to another pile, delete
     5. class controls: pause check-ins, check new notes first,
        blocked words, CSV download
   Every change is saved by the server (data/admin.json).
   In-between moods get their own name here (e.g. 4.5 = "Cheerful"),
   and notes with swear words get a "Swear words" badge (the admin sees
   the real text, uncensored, so they can decide what to do).
   Loaded as a module; uses window.Moods (moods.js) and window.MoodCensor (censor.js).
   User text is only ever shown with textContent (never innerHTML).
   ===================================================================== */

const { Moods, MoodCensor } = window;

const REFRESH_INTERVAL_MS = 30 * 1000;
const SVG_NS = 'http://www.w3.org/2000/svg';
const INBOX = 'inbox'; // the pile for notes that aren't sorted yet
const COLOR_NAMES = {
  yellow: 'Yellow', pink: 'Pink', blue: 'Blue', green: 'Green', orange: 'Orange', purple: 'Purple',
};

// ---------- Page elements ----------
const els = {
  loginView: document.getElementById('login-view'),
  loginForm: document.getElementById('login-form'),
  loginPassword: document.getElementById('login-password'),
  loginError: document.getElementById('login-error'),
  adminView: document.getElementById('admin-view'),
  logoutButton: document.getElementById('logout-btn'),
  statTotal: document.getElementById('stat-total'),
  statToday: document.getElementById('stat-today'),
  statPending: document.getElementById('stat-pending'),
  statHidden: document.getElementById('stat-hidden'),
  moodBars: document.getElementById('mood-bars'),
  newPileForm: document.getElementById('new-pile-form'),
  newPileName: document.getElementById('new-pile-name'),
  newPileColor: document.getElementById('new-pile-color'),
  pileRow: document.getElementById('pile-row'),
  spreadTitle: document.getElementById('spread-title'),
  spreadPileActions: document.getElementById('spread-pile-actions'),
  renamePileButton: document.getElementById('rename-pile-btn'),
  deletePileButton: document.getElementById('delete-pile-btn'),
  viewButtons: document.querySelectorAll('.chip[data-view]'),
  spreadGrid: document.getElementById('spread-grid'),
  spreadEmpty: document.getElementById('spread-empty'),
  togglePaused: document.getElementById('toggle-paused'),
  toggleApproval: document.getElementById('toggle-approval'),
  blockedWords: document.getElementById('blocked-words'),
  saveWordsButton: document.getElementById('save-words-btn'),
  exportButton: document.getElementById('export-csv-btn'),
  storageHint: document.getElementById('storage-hint'),
  toast: document.getElementById('toast'),
};

// ---------- Page state ----------
const state = {
  entries: [],
  piles: [],
  settings: { paused: false, requireApproval: false, blockedWords: [] },
  pileColors: Object.keys(COLOR_NAMES),
  mode: 'local',
  currentPile: INBOX,  // which pile is spread out below
  view: 'all',         // all | pending | hidden | pinned
  isDragging: false,
  wordsEdited: false,  // don't overwrite the words box while the admin is typing
  refreshTimer: null,
};

// =====================================================================
// Small helpers
// =====================================================================

/** Calls our server. Throws an Error with a friendly message on failure. */
async function api(path, { method = 'GET', body } = {}) {
  const response = await MoodApi.fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== '/api/admin/login') {
    showLogin(); // the session ran out (or the server restarted)
  }
  if (!response.ok || !data.ok) throw new Error(data.error || `The server answered with code ${response.status}.`);
  return data;
}

let toastTimer = null;
/** A small message at the bottom of the screen. */
function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('is-error', isError);
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, isError ? 5000 : 2600);
}

function reportError(error) {
  console.error(error);
  showToast(error instanceof TypeError ? "Couldn't reach the server. Is it running?" : error.message, true);
}

function formatDateTime(date) {
  return date.toLocaleString(MoodI18n.locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function pileOf(entry) {
  return entry.pileId || INBOX;
}

function pileName(pileId) {
  if (pileId === INBOX) return 'Inbox';
  const pile = state.piles.find((item) => item.id === pileId);
  return pile ? pile.name : 'Inbox';
}

/** Pinned first, then newest first. */
function sortForDesk(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return new Date(b.timestamp) - new Date(a.timestamp);
}

function notesInPile(pileId) {
  return state.entries.filter((entry) => pileOf(entry) === pileId).sort(sortForDesk);
}

/** One <svg> mood face (base mood 1-5) that follows the chosen style (Settings). */
function createFace(mood) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'face');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.dataset.face = String(mood);
  use.setAttribute('href', window.MoodSettings.faceHref(mood));
  svg.append(use);
  return svg;
}

/** One face, or two overlapping faces for an in-between mood (4.5 -> Great + Good). */
function createFaces(mood) {
  const pair = document.createElement('span');
  pair.className = 'face-pair';
  for (const part of Moods.parts(mood)) pair.append(createFace(part));
  return pair;
}

/** An <svg> icon from the sprite. */
function createIcon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `sprite.svg#icon-${name}`);
  svg.append(use);
  return svg;
}

function createButton(label, className, onClick, iconName) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  if (iconName) button.append(createIcon(iconName));
  button.append(document.createTextNode(label));
  button.addEventListener('click', onClick);
  return button;
}

// =====================================================================
// Login / logout
// =====================================================================

function showLogin() {
  stopAutoRefresh();
  els.adminView.hidden = true;
  els.logoutButton.hidden = true;
  els.loginView.hidden = false;
  els.loginPassword.focus();
}

async function showDesk() {
  els.loginView.hidden = true;
  els.adminView.hidden = false;
  els.logoutButton.hidden = false;
  await loadState();
  startAutoRefresh();
}

async function handleLogin(event) {
  event.preventDefault();
  els.loginError.textContent = '';
  if (!els.loginPassword.value) {
    els.loginError.textContent = 'Type the admin password.';
    return;
  }
  try {
    await api('/api/admin/login', { method: 'POST', body: { password: els.loginPassword.value } });
    els.loginPassword.value = '';
    await showDesk();
  } catch (error) {
    els.loginError.textContent = error instanceof TypeError ? "Couldn't reach the server." : error.message;
    els.loginPassword.select();
  }
}

async function handleLogout() {
  try {
    await api('/api/admin/logout', { method: 'POST' });
  } finally {
    window.location.href = 'index.html';
  }
}

// =====================================================================
// Loading
// =====================================================================

async function loadState() {
  try {
    const data = await api('/api/admin/state');
    state.entries = data.entries;
    state.piles = data.piles;
    state.settings = data.settings;
    state.pileColors = data.pileColors || state.pileColors;
    state.mode = data.mode;
    if (state.currentPile !== INBOX && !state.piles.some((pile) => pile.id === state.currentPile)) {
      state.currentPile = INBOX; // the pile was deleted
    }
    renderAll();
  } catch (error) {
    reportError(error);
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  state.refreshTimer = setInterval(() => {
    const busy = state.isDragging || document.hidden || document.activeElement?.tagName === 'SELECT';
    if (!busy) loadState();
  }, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
  clearInterval(state.refreshTimer);
}

// =====================================================================
// Drawing
// =====================================================================

function renderAll() {
  renderStats();
  renderPiles();
  renderSpread();
  renderControls();
}

function renderStats() {
  const today = new Date().toDateString();
  const count = (test) => state.entries.filter(test).length;
  els.statTotal.textContent = state.entries.length;
  els.statToday.textContent = count((entry) => new Date(entry.timestamp).toDateString() === today);
  els.statPending.textContent = count((entry) => entry.pending);
  els.statHidden.textContent = count((entry) => entry.hidden);

  // One bar per mood, great on top; the in-between moods sit between them
  const values = Moods.MOODS.map((item) => item.value);
  const most = Math.max(1, ...values.map((mood) => count((entry) => entry.mood === mood)));
  els.moodBars.replaceChildren();
  for (const mood of values) {
    const total = count((entry) => entry.mood === mood);
    const row = document.createElement('li');
    row.className = `mood-bar ${Moods.cssClass(mood)}`;
    row.classList.toggle('mood-bar--blend', Moods.isBlend(mood));
    row.title = Moods.isBlend(mood) ? `${Moods.name(mood)} = ${Moods.baseLabel(mood)}` : Moods.name(mood);
    const label = document.createElement('span');
    label.className = 'mood-bar__label';
    label.append(createFaces(mood), document.createTextNode(Moods.name(mood)));
    const track = document.createElement('span');
    track.className = 'mood-bar__track';
    const fill = document.createElement('span');
    fill.className = 'mood-bar__fill';
    fill.style.width = `${(total / most) * 100}%`;
    track.append(fill);
    const number = document.createElement('span');
    number.className = 'mood-bar__count';
    number.textContent = total;
    row.append(label, track, number);
    els.moodBars.append(row);
  }
}

/** Draws each pile as a stack of sticky notes. */
function renderPiles() {
  els.pileRow.replaceChildren();
  const piles = [{ id: INBOX, name: 'Inbox', color: 'paper' }, ...state.piles];

  for (const pile of piles) {
    const notes = notesInPile(pile.id);
    const deck = document.createElement('button');
    deck.type = 'button';
    deck.className = `pile pile--${pile.color}`;
    deck.dataset.pile = pile.id;
    deck.setAttribute('aria-pressed', String(state.currentPile === pile.id));
    deck.setAttribute('aria-label', `${pile.name}, ${notes.length} notes. Open pile.`);

    // Up to 3 sheets; the newest note is the one on top
    const stack = document.createElement('span');
    stack.className = 'pile__stack';
    stack.setAttribute('aria-hidden', 'true');
    const sheets = notes.slice(0, 3).reverse();
    if (sheets.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'pile__sheet pile__sheet--empty';
      empty.textContent = 'empty';
      stack.append(empty);
    }
    sheets.forEach((entry, index) => {
      const sheet = document.createElement('span');
      sheet.className = `pile__sheet ${Moods.cssClass(entry.mood)}`;
      sheet.classList.toggle('is-blend', Moods.isBlend(entry.mood));
      sheet.style.setProperty('--layer', String(sheets.length - 1 - index)); // 0 = top
      if (index === sheets.length - 1) sheet.textContent = entry.whatHappened;
      stack.append(sheet);
    });

    const name = document.createElement('span');
    name.className = 'pile__name';
    name.textContent = pile.name;
    const countBadge = document.createElement('span');
    countBadge.className = 'pile__count';
    countBadge.textContent = notes.length;
    name.append(countBadge);

    const waiting = notes.filter((entry) => entry.pending).length;
    if (waiting) {
      const alert = document.createElement('span');
      alert.className = 'pile__alert';
      alert.textContent = `${waiting} to review`;
      name.append(alert);
    }

    deck.append(stack, name);
    deck.addEventListener('click', () => {
      state.currentPile = pile.id;
      renderPiles();
      renderSpread();
    });
    addDropTarget(deck, pile.id);
    els.pileRow.append(deck);
  }
}

/** Lets a dragged note be dropped on a pile. */
function addDropTarget(element, pileId) {
  element.addEventListener('dragover', (event) => {
    if (!state.isDragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    element.classList.add('is-drop-target');
  });
  element.addEventListener('dragleave', () => element.classList.remove('is-drop-target'));
  element.addEventListener('drop', (event) => {
    event.preventDefault();
    element.classList.remove('is-drop-target');
    const id = event.dataTransfer.getData('text/plain');
    if (id) moveNote(id, pileId);
  });
}

/** Spreads out the notes of the chosen pile. */
function renderSpread() {
  const isInbox = state.currentPile === INBOX;
  els.spreadTitle.textContent = pileName(state.currentPile);
  els.spreadPileActions.hidden = isInbox;
  els.viewButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
  });

  const notes = notesInPile(state.currentPile).filter((entry) => {
    if (state.view === 'pending') return entry.pending;
    if (state.view === 'hidden') return entry.hidden;
    if (state.view === 'pinned') return entry.pinned;
    return true;
  });

  els.spreadGrid.replaceChildren(...notes.map(createNoteCard));
  els.spreadEmpty.hidden = notes.length > 0;
}

/** One sticky note with its admin buttons. */
function createNoteCard(entry) {
  const card = document.createElement('li');
  card.className = `admin-note ${Moods.cssClass(entry.mood)}`;
  card.classList.toggle('is-blend', Moods.isBlend(entry.mood));
  card.classList.toggle('is-hidden', entry.hidden);
  card.classList.toggle('is-pending', entry.pending);
  card.classList.toggle('is-pinned', entry.pinned);
  card.draggable = true;
  card.dataset.id = entry.id;

  // Mood + status badges
  const head = document.createElement('div');
  head.className = 'admin-note__head';
  const mood = document.createElement('span');
  mood.className = 'admin-note__mood';
  mood.append(createFaces(entry.mood), document.createTextNode(Moods.name(entry.mood)));
  if (Moods.isBlend(entry.mood)) {
    // e.g. "Cheerful" + small "(Great + Good)"
    const between = document.createElement('small');
    between.className = 'admin-note__between';
    between.textContent = `(${Moods.baseLabel(entry.mood)})`;
    mood.append(between);
  }
  head.append(mood);
  const hasSwearWords = MoodCensor.hasBadWords(`${entry.whatHappened} ${entry.comment} ${entry.name}`);
  const badges = [
    [entry.pending, 'Needs review', 'badge--pending'],
    [hasSwearWords, 'Swear words', 'badge--flag'],
    [entry.hidden, 'Hidden', 'badge--hidden'],
    [entry.pinned, 'Pinned', 'badge--pinned'],
  ];
  for (const [show, text, extraClass] of badges) {
    if (!show) continue;
    const badge = document.createElement('span');
    badge.className = `badge ${extraClass}`;
    badge.textContent = text;
    head.append(badge);
  }

  const what = document.createElement('p');
  what.className = 'admin-note__what';
  what.textContent = entry.whatHappened;

  const comment = document.createElement('p');
  comment.className = 'admin-note__comment';
  comment.textContent = entry.comment || 'No comment.';
  comment.classList.toggle('is-empty', !entry.comment);

  const meta = document.createElement('p');
  meta.className = 'admin-note__meta';
  meta.textContent = `${entry.name ? `by ${entry.name}` : 'anonymous'} · ${formatDateTime(new Date(entry.timestamp))}`;

  // Buttons
  const actions = document.createElement('div');
  actions.className = 'admin-note__actions';
  if (entry.pending) {
    actions.append(createButton('Approve', 'mini-btn mini-btn--go', () => (
      updateNote(entry.id, { pending: false }, 'Approved: it is on the Class moods page now.')
    ), 'check'));
  }
  actions.append(
    createButton(entry.pinned ? 'Unpin' : 'Pin', 'mini-btn', () => (
      updateNote(entry.id, { pinned: !entry.pinned }, entry.pinned ? 'Unpinned.' : 'Pinned: it gets a pin on the map.')
    ), 'pin'),
    createButton(entry.hidden ? 'Show' : 'Hide', 'mini-btn', () => (
      updateNote(entry.id, { hidden: !entry.hidden }, entry.hidden ? 'Visible again.' : 'Hidden from the Class moods page.')
    ), 'eye'),
    createMoveSelect(entry),
    createButton('Delete', 'mini-btn mini-btn--danger', () => deleteNote(entry), 'trash'),
  );

  card.append(head, what, comment, meta, actions);

  // Drag the note onto a pile
  card.addEventListener('dragstart', (event) => {
    state.isDragging = true;
    event.dataTransfer.setData('text/plain', entry.id);
    event.dataTransfer.effectAllowed = 'move';
    card.classList.add('is-dragging');
    document.body.classList.add('is-dragging-note');
  });
  card.addEventListener('dragend', () => {
    state.isDragging = false;
    card.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging-note');
  });

  return card;
}

/** "Move to…" menu (works on phones, where dragging is awkward). */
function createMoveSelect(entry) {
  const select = document.createElement('select');
  select.className = 'mini-select';
  select.setAttribute('aria-label', 'Move to pile');
  const options = [[INBOX, 'Inbox'], ...state.piles.map((pile) => [pile.id, pile.name])];
  for (const [value, label] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === pileOf(entry) ? `In: ${label}` : `Move to ${label}`;
    option.selected = value === pileOf(entry);
    select.append(option);
  }
  select.addEventListener('change', () => moveNote(entry.id, select.value));
  return select;
}

function renderControls() {
  els.togglePaused.checked = Boolean(state.settings.paused);
  els.toggleApproval.checked = Boolean(state.settings.requireApproval);
  if (!state.wordsEdited && document.activeElement !== els.blockedWords) {
    els.blockedWords.value = (state.settings.blockedWords || []).join('\n');
  }
  if (window.MoodApi.usesSheet) {
    els.storageHint.textContent = 'Notes are in your Google Sheet. "Delete" removes the note and its row for good.';
  } else {
    els.storageHint.textContent = state.mode === 'sheets'
      ? 'Notes are in Google Sheets. "Delete" removes a note from this website; delete its row in the Sheet too if you want it gone there.'
      : 'Notes are saved in data/entries.json. "Delete" removes a note for good.';
  }

  // The colour menu for new piles (filled once)
  if (!els.newPileColor.options.length) {
    for (const color of state.pileColors) {
      const option = document.createElement('option');
      option.value = color;
      option.textContent = COLOR_NAMES[color] || color;
      els.newPileColor.append(option);
    }
  }
}

// =====================================================================
// Actions
// =====================================================================

/** Saves a change to one note, then redraws. */
async function updateNote(id, changes, message) {
  try {
    await api(`/api/admin/notes/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes });
    const entry = state.entries.find((item) => item.id === id);
    if (entry) Object.assign(entry, changes);
    renderAll();
    if (message) showToast(message);
  } catch (error) {
    reportError(error);
  }
}

function moveNote(id, pileId) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry || pileOf(entry) === pileId) return;
  updateNote(id, { pileId: pileId === INBOX ? null : pileId }, `Moved to "${pileName(pileId)}".`);
}

async function deleteNote(entry) {
  const preview = entry.whatHappened.length > 40 ? `${entry.whatHappened.slice(0, 40)}…` : entry.whatHappened;
  if (!window.confirm(MoodI18n.t(`Delete this note for good?\n\n"${preview}"`))) return;
  try {
    await api(`/api/admin/notes/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
    state.entries = state.entries.filter((item) => item.id !== entry.id);
    renderAll();
    showToast(state.mode === 'sheets' && !window.MoodApi.usesSheet
      ? 'Removed from the website (the row is still in the Sheet).'
      : 'Note deleted.');
  } catch (error) {
    reportError(error);
  }
}

async function createPile(event) {
  event.preventDefault();
  const name = els.newPileName.value.trim();
  if (!name) {
    showToast('Give the new pile a name first.', true);
    els.newPileName.focus();
    return;
  }
  try {
    const { pile } = await api('/api/admin/piles', { method: 'POST', body: { name, color: els.newPileColor.value } });
    state.piles.push(pile);
    els.newPileName.value = '';
    renderAll();
    showToast(`Pile "${pile.name}" added. Drag notes onto it!`);
  } catch (error) {
    reportError(error);
  }
}

async function renameCurrentPile() {
  const pile = state.piles.find((item) => item.id === state.currentPile);
  if (!pile) return;
  const name = window.prompt(MoodI18n.t('New name for this pile:'), pile.name);
  if (name === null || !name.trim()) return;
  try {
    const { pile: saved } = await api(`/api/admin/piles/${pile.id}`, { method: 'PATCH', body: { name } });
    Object.assign(pile, saved);
    renderAll();
    showToast('Pile renamed.');
  } catch (error) {
    reportError(error);
  }
}

async function deleteCurrentPile() {
  const pile = state.piles.find((item) => item.id === state.currentPile);
  if (!pile) return;
  if (!window.confirm(MoodI18n.t(`Delete the pile "${pile.name}"?\nIts notes go back to the Inbox (they are not deleted).`))) return;
  try {
    await api(`/api/admin/piles/${pile.id}`, { method: 'DELETE' });
    state.piles = state.piles.filter((item) => item.id !== pile.id);
    state.entries.forEach((entry) => {
      if (entry.pileId === pile.id) entry.pileId = null;
    });
    state.currentPile = INBOX;
    renderAll();
    showToast('Pile deleted. Its notes are back in the Inbox.');
  } catch (error) {
    reportError(error);
  }
}

async function saveSettings(changes, message) {
  try {
    const { settings } = await api('/api/admin/settings', { method: 'PATCH', body: changes });
    state.settings = settings;
    renderControls();
    showToast(message);
  } catch (error) {
    reportError(error);
    renderControls(); // put the switch back
  }
}

// =====================================================================
// Wiring everything up
// =====================================================================

els.loginForm.addEventListener('submit', handleLogin);
els.logoutButton.addEventListener('click', handleLogout);
els.newPileForm.addEventListener('submit', createPile);
els.renamePileButton.addEventListener('click', renameCurrentPile);
els.deletePileButton.addEventListener('click', deleteCurrentPile);

els.viewButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.view = button.dataset.view;
    renderSpread();
  });
});

els.togglePaused.addEventListener('change', () => {
  const paused = els.togglePaused.checked;
  saveSettings({ paused }, paused ? 'Check-ins are paused.' : 'Check-ins are open again.');
});

els.toggleApproval.addEventListener('change', () => {
  const requireApproval = els.toggleApproval.checked;
  saveSettings({ requireApproval }, requireApproval
    ? 'New notes will wait for your review.'
    : 'New notes appear on the map straight away.');
});

els.blockedWords.addEventListener('input', () => { state.wordsEdited = true; });
els.saveWordsButton.addEventListener('click', async () => {
  await saveSettings({ blockedWords: els.blockedWords.value }, 'Blocked words saved.');
  state.wordsEdited = false;
  els.blockedWords.value = (state.settings.blockedWords || []).join('\n');
});

/** One CSV cell. A leading = + - @ is made harmless so spreadsheets don't run it as a formula. */
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Builds the CSV right here in the browser from the notes on the desk. */
function exportCsv() {
  const rows = [['Timestamp', 'Mood', 'Feeling', 'WhatHappened', 'Comment', 'Name', 'Pile', 'Hidden', 'Pinned', 'Waiting']];
  const entries = [...state.entries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  for (const entry of entries) {
    const feeling = Moods.isBlend(entry.mood) ? `${Moods.name(entry.mood)} (${Moods.baseLabel(entry.mood)})` : Moods.name(entry.mood);
    rows.push([
      entry.timestamp, entry.mood, feeling, entry.whatHappened, entry.comment, entry.name,
      pileName(pileOf(entry)), entry.hidden ? 'yes' : '', entry.pinned ? 'yes' : '', entry.pending ? 'yes' : '',
    ]);
  }
  const csv = '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `class-mood-notes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
els.exportButton.addEventListener('click', exportCsv);

// EN / ID switched: redraw so dates use the new language
document.addEventListener('moodlangchange', () => {
  if (!els.adminView.hidden) renderAll();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !els.adminView.hidden) loadState();
});

/** Start: already logged in? Then show the desk, otherwise the password box. */
(async function start() {
  try {
    const response = await MoodApi.fetch('/api/admin/session', { cache: 'no-store' });
    const data = await response.json();
    if (data.admin) {
      await showDesk();
    } else {
      showLogin();
      if (!data.configured) {
        els.loginError.textContent = 'No admin password is set on the server yet (see README).';
      }
    }
  } catch (error) {
    showLogin();
    els.loginError.textContent = "Couldn't reach the server. Is it running?";
  }
})();
