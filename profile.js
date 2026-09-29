/* =====================================================================
   Class Mood Journey — profile.js   (runs on profile.html)
   Your own page (only you can see it):
     - @username with the verified badge, Change username
     - numbers: your notes, likes and comments they got
     - every note you posted while signed in, with Edit and Delete
   Everything is checked again by the Apps Script (only the owner can
   edit or delete a note).
   ===================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';

const els = {
  signIn: document.getElementById('profile-signin'),
  signInButton: document.getElementById('profile-signin-btn'),
  status: document.getElementById('profile-status'),
  view: document.getElementById('profile-view'),
  name: document.getElementById('profile-name'),
  face: document.getElementById('profile-face'),
  changeUsername: document.getElementById('change-username-btn'),
  statNotes: document.getElementById('stat-notes'),
  statLikes: document.getElementById('stat-likes'),
  statComments: document.getElementById('stat-comments'),
  grid: document.getElementById('my-notes-grid'),
  empty: document.getElementById('my-notes-empty'),
  editDialog: document.getElementById('edit-dialog'),
  editForm: document.getElementById('edit-form'),
  editMoods: document.getElementById('edit-moods'),
  editWhat: document.getElementById('edit-what'),
  editComment: document.getElementById('edit-comment'),
  editError: document.getElementById('edit-error'),
  editSave: document.getElementById('edit-save'),
  editClose: document.getElementById('edit-close'),
  toast: document.getElementById('toast'),
};

const state = { notes: [], editing: null, editMood: null, loadedFor: null };

// ---------- Small helpers ----------

let toastTimer = null;
function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('is-error', isError);
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, isError ? 5000 : 2600);
}

function formatDay(timestamp) {
  return new Date(timestamp).toLocaleDateString(MoodI18n.locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function createFace(mood) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'face');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.dataset.face = String(mood);
  use.setAttribute('href', MoodSettings.faceHref(mood));
  svg.append(use);
  return svg;
}

function createFaces(mood) {
  const pair = document.createElement('span');
  pair.className = 'face-pair';
  for (const part of Moods.parts(mood)) pair.append(createFace(part));
  return pair;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// ---------- Loading ----------

async function load() {
  const user = MoodAccount.enabled ? MoodAccount.user : null;
  if (!user) {
    state.loadedFor = null;
    els.view.hidden = true;
    els.status.hidden = true;
    els.signIn.hidden = !MoodAccount.enabled;
    if (!MoodAccount.enabled) {
      els.status.hidden = false;
      els.status.textContent = 'Profiles only work on the online version of the site.';
    }
    return;
  }
  if (state.loadedFor === user.username && !els.view.hidden) return;
  state.loadedFor = user.username;
  els.signIn.hidden = true;
  els.status.hidden = false;
  els.status.textContent = 'Loading your profile…';
  try {
    const data = await MoodApi.script('myNotes', { userToken: user.token });
    state.notes = data.notes.slice().reverse(); // newest first
    els.status.hidden = true;
    els.view.hidden = false;
    render(data.username || user.username);
  } catch (error) {
    if (error.code === 401) {
      MoodAccount.expired();
      return;
    }
    els.status.textContent = `Couldn't load your profile. ${error.message}`;
  }
}

// ---------- Drawing ----------

function render(username) {
  els.name.replaceChildren(document.createTextNode(`@${username}`), MoodAccount.badge());
  els.statNotes.textContent = String(state.notes.length);
  els.statLikes.textContent = String(state.notes.reduce((sum, note) => sum + (note.likes || 0), 0));
  els.statComments.textContent = String(state.notes.reduce((sum, note) => sum + (note.comments || 0), 0));

  // Your most common base mood as your profile face
  const tally = {};
  state.notes.forEach((note) => { const base = Moods.parts(note.mood)[0]; tally[base] = (tally[base] || 0) + 1; });
  const favourite = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || 4;
  els.face.dataset.face = String(favourite);
  els.face.setAttribute('href', MoodSettings.faceHref(favourite));

  els.empty.hidden = state.notes.length > 0;
  const columns = Math.max(1, Math.min(4, Math.floor((els.grid.clientWidth || 900) / 240)));
  const lists = Array.from({ length: columns }, () => ({ height: 0, element: el('div', 'wall__col') }));
  state.notes.forEach((note) => {
    const shortest = lists.reduce((best, list) => (list.height < best.height ? list : best), lists[0]);
    shortest.element.append(createCard(note));
    shortest.height += 180 + (MoodApi.photoIds(note).length ? 180 : 0) + Math.ceil(note.whatHappened.length / 22) * 22;
  });
  els.grid.replaceChildren(...lists.map((list) => list.element));
}

function createCard(note) {
  const card = el('article', `wall-card ${Moods.cssClass(note.mood)}`);
  card.classList.toggle('is-blend', Moods.isBlend(note.mood));

  const photos = MoodApi.photoUrls(note, 600);
  if (photos.length) {
    const photo = el('button', 'wall-card__photo profile-card__photo');
    photo.type = 'button';
    photo.setAttribute('aria-label', 'Open photo');
    const img = el('img');
    img.src = photos[0];
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    photo.append(img);
    if (photos.length > 1) photo.append(el('span', 'wall-card__more', `📷 ${photos.length}`));
    photo.addEventListener('click', () => MoodLightbox.open(MoodApi.photoUrls(note, 2000), 0, img));
    card.append(photo);
  }

  const body = el('div', 'wall-card__body');
  const mood = el('span', 'wall-card__mood');
  mood.append(createFaces(note.mood), el('span', '', Moods.baseLabel(note.mood)));
  body.append(mood, el('span', 'wall-card__what', note.whatHappened));
  if (note.comment) body.append(el('span', 'wall-card__comment', note.comment));

  // Status: how it shows on the site
  const badges = el('div', 'profile-badges');
  if (note.verified) badges.append(el('span', 'profile-badge', `Shown as @${note.name}`));
  else badges.append(el('span', 'profile-badge', note.name ? `Shown as "${note.name}"` : 'Shown as anonymous'));
  if (note.pending) badges.append(el('span', 'profile-badge profile-badge--warn', 'Waiting for the admin'));
  if (note.hidden) badges.append(el('span', 'profile-badge profile-badge--warn', 'Hidden by the admin'));
  if (note.edited) badges.append(el('span', 'profile-badge', 'Edited'));
  body.append(badges);

  const meta = el('span', 'wall-card__meta');
  meta.append(el('span', '', `♥ ${note.likes || 0} · 💬 ${note.comments || 0}`), el('time', '', formatDay(note.timestamp)));
  body.append(meta);
  card.append(body);

  const actions = el('div', 'share-buttons wall-card__actions');
  const edit = el('button', 'mini-btn share-btn', '✏️ Edit');
  edit.type = 'button';
  edit.addEventListener('click', () => openEdit(note));
  const remove = el('button', 'mini-btn mini-btn--danger', '🗑 Delete');
  remove.type = 'button';
  remove.addEventListener('click', () => deleteNote(note));
  actions.append(edit, remove);
  card.append(actions);
  return card;
}

// ---------- Editing ----------

function showEditMoods() {
  els.editMoods.replaceChildren();
  Moods.MOODS.forEach((item) => {
    const button = el('button', `edit-mood ${Moods.cssClass(item.value)}`);
    button.type = 'button';
    button.classList.toggle('is-blend', Moods.isBlend(item.value));
    button.setAttribute('aria-pressed', String(item.value === state.editMood));
    button.append(createFaces(item.value), el('span', '', item.name));
    button.addEventListener('click', () => {
      state.editMood = item.value;
      showEditMoods();
    });
    els.editMoods.append(button);
  });
}

function openEdit(note) {
  state.editing = note;
  state.editMood = note.mood;
  els.editWhat.value = note.whatHappened;
  els.editComment.value = note.comment || '';
  els.editError.textContent = '';
  showEditMoods();
  els.editDialog.showModal();
  els.editWhat.focus();
}

async function saveEdit(event) {
  event.preventDefault();
  const user = MoodAccount.user;
  const note = state.editing;
  if (!user || !note) return;
  const whatHappened = els.editWhat.value.trim();
  if (!whatHappened) {
    els.editError.textContent = 'Write a few words about what happened.';
    els.editWhat.focus();
    return;
  }
  els.editSave.disabled = true;
  els.editError.textContent = '';
  try {
    const data = await MoodApi.script('editNote', {
      userToken: user.token, noteId: note.id, mood: state.editMood, whatHappened, comment: els.editComment.value.trim(),
    });
    Object.assign(note, data.note, { pending: note.pending || data.pending });
    els.editDialog.close();
    render(user.username);
    showToast(data.pending ? 'Saved. The admin checks it again before it shows.' : 'Saved!');
  } catch (error) {
    if (error.code === 401) { MoodAccount.expired(); els.editDialog.close(); return; }
    els.editError.textContent = error.message;
  } finally {
    els.editSave.disabled = false;
  }
}

async function deleteNote(note) {
  const user = MoodAccount.user;
  if (!user) return;
  const preview = note.whatHappened.length > 40 ? `${note.whatHappened.slice(0, 40)}…` : note.whatHappened;
  if (!window.confirm(MoodI18n.t(`Delete this note for good?\n\n"${preview}"`))) return;
  try {
    await MoodApi.script('deleteMyNote', { userToken: user.token, noteId: note.id });
    state.notes = state.notes.filter((item) => item.id !== note.id);
    render(user.username);
    showToast('Note deleted.');
  } catch (error) {
    if (error.code === 401) { MoodAccount.expired(); return; }
    showToast(error.message, true);
  }
}

// ---------- Wiring ----------

els.signInButton.addEventListener('click', () => MoodAccount.requireUsername());
els.changeUsername.addEventListener('click', () => MoodAccount.openUsername());
els.editForm.addEventListener('submit', saveEdit);
els.editClose.addEventListener('click', () => els.editDialog.close());
els.editDialog.addEventListener('click', (event) => { if (event.target === els.editDialog) els.editDialog.close(); });
document.addEventListener('moodaccountchange', () => {
  const user = MoodAccount.user;
  // New username: just redraw the header; signed in / out: load again
  if (user && state.loadedFor && state.loadedFor !== user.username && !els.view.hidden) {
    state.loadedFor = user.username;
    state.notes.forEach((note) => { if (note.verified) note.name = user.username; });
    render(user.username);
    return;
  }
  load();
});
document.addEventListener('moodlangchange', () => { if (!els.view.hidden && MoodAccount.user) render(MoodAccount.user.username); });

load();
