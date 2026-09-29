/* =====================================================================
   Class Mood Journey — journey.js   (runs on journey.html)
   It:
     1. loads the visible notes from our server (GET /api/entries)
     2. places each note as a sticky note in its mood lane,
        NEWEST FIRST: the newest note is next to "NOW" on the left,
        the oldest is next to "START" on the right
        (in-between moods like "Great + Good" sit on the line between two lanes)
     3. draws dashed arrows that follow time (from older notes to newer ones)
     4. covers swear words with a *censored* sticker (Settings → Censor)
     5. opens a big version of a note when you click it
        (a logged-in admin also gets a "Hide from map" button there)
     6. refreshes every 30 seconds, and right away after you send a note
   Loaded as a module (type="module"), so its names never clash with input.js.
   Uses window.Moods (moods.js), window.MoodCensor (censor.js) and
   window.MoodSettings (settings.js).
   User text is only ever shown with textContent (never innerHTML).
   ===================================================================== */

const { Moods, MoodCensor, MoodSettings } = window;

const REFRESH_INTERVAL_MS = 30 * 1000;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Layout numbers in pixels. Note and lane sizes come from style.css. */
const LAYOUT = {
  leftSpace: 150,     // room for the NOW label before the newest note
  rightSpace: 150,    // room for the START label after the oldest note
  noteSpacing: 34,    // normal gap between one note and the next one in time
  maxExtraSpace: 110, // with only a few notes, spread them out, but not more than this
  laneGap: 20,        // smallest gap between two notes in the SAME lane
  dayGap: 36,         // extra room where a new day starts
  jitterY: 7,         // notes move up/down by at most this much
  maxTilt: 4,         // notes rotate by at most this many degrees
  arrowPadding: 7,    // arrows stop this far away from a note
};

// ---------- Page elements ----------
const els = {
  scroll: document.getElementById('board-scroll'),
  track: document.getElementById('board-track'),
  days: document.getElementById('board-days'),
  notes: document.getElementById('board-notes'),
  connectors: document.getElementById('board-connectors'),
  connectorPaths: document.getElementById('connector-paths'),
  nowPin: document.getElementById('now-pin'),
  firstPin: document.getElementById('first-pin'),
  loadingState: document.getElementById('loading-state'),
  emptyState: document.getElementById('empty-state'),
  emptyTitle: document.getElementById('empty-title'),
  emptyText: document.getElementById('empty-text'),
  emptyLink: document.getElementById('empty-link'),
  errorState: document.getElementById('error-state'),
  errorText: document.getElementById('error-text'),
  retryButton: document.getElementById('retry-btn'),
  modeBadge: document.getElementById('mode-badge'),
  count: document.getElementById('journey-count'),
  updatedAt: document.getElementById('updated-at'),
  filterButtons: document.querySelectorAll('.chip[data-filter]'),
  focusLayer: document.getElementById('focus-layer'),
  focusBackdrop: document.getElementById('focus-backdrop'),
  focusCard: document.getElementById('focus-card'),
  focusClose: document.getElementById('focus-close'),
  focusFace: document.getElementById('focus-face'),
  focusFaceSecond: document.getElementById('focus-face-2'),
  focusMoodName: document.getElementById('focus-mood-name'),
  focusWhat: document.getElementById('focus-what'),
  focusComment: document.getElementById('focus-comment'),
  focusPhotos: document.getElementById('focus-photos'),
  focusShareButton: document.getElementById('focus-share-btn'),
  focusSaveButton: document.getElementById('focus-save-btn'),
  wallGrid: document.getElementById('wall-grid'),
  shareDialog: document.getElementById('share-dialog'),
  shareImg: document.getElementById('share-img'),
  shareStatus: document.getElementById('share-status'),
  shareSend: document.getElementById('share-send'),
  shareSave: document.getElementById('share-save'),
  shareCopy: document.getElementById('share-copy'),
  shareWhatsApp: document.getElementById('share-whatsapp'),
  sharePhotosRow: document.getElementById('share-photos-row'),
  sharePhotoChoices: document.getElementById('share-photo-choices'),
  comments: document.getElementById('focus-comments'),
  commentsList: document.getElementById('focus-comments-list'),
  commentsEmpty: document.getElementById('focus-comments-empty'),
  commentForm: document.getElementById('comment-form'),
  commentInput: document.getElementById('comment-input'),
  commentAs: document.getElementById('comment-as'),
  commentCounter: document.getElementById('comment-counter'),
  commentSend: document.getElementById('comment-send'),
  commentError: document.getElementById('comment-error'),
  commentSignIn: document.getElementById('comment-signin'),
  commentsOff: document.getElementById('comments-off'),
  shareClose: document.getElementById('share-close'),
  focusDate: document.getElementById('focus-date'),
  focusAuthor: document.getElementById('focus-author'),
  focusAdmin: document.getElementById('focus-admin'),
  focusHideButton: document.getElementById('focus-hide-btn'),
  focusAdminHint: document.getElementById('focus-admin-hint'),
};

// ---------- Page state ----------
const state = {
  entries: [],          // all notes, oldest first (as they come from the server)
  filter: 'all',        // 'all' or '1'..'5'
  signature: '',        // used to skip redrawing when nothing changed
  hasLoaded: false,
  isLoading: false,
  seenIds: new Set(),   // notes already shown (only new ones get the drop-in animation)
  focused: null,        // { entryId, noteButton, tilt } while a note is open
  isClosing: false,
  renderWhenClosed: false,
  isAdmin: false,       // logged in as admin? Then the big note gets a "Hide from map" button
};

// =====================================================================
// Small helpers
// =====================================================================

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A "random" number from 0 to 1 that is always the same for the same text.
 * So every note keeps the same tilt after each refresh instead of jumping around.
 */
function seededRandom(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function formatDay(date) {
  return date.toLocaleDateString(MoodI18n.locale(), { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(date) {
  return date.toLocaleTimeString(MoodI18n.locale(), { hour: 'numeric', minute: '2-digit' });
}

function formatFullDate(date) {
  return date.toLocaleString(MoodI18n.locale(), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** Reads the sizes from style.css (they change on small screens). */
function readMetrics() {
  const styles = getComputedStyle(els.track);
  const px = (name) => parseFloat(styles.getPropertyValue(name)) || 0;
  return {
    laneH: px('--lane-h'),
    rulerH: px('--ruler-h'),
    noteW: px('--note-w'),
    noteH: px('--note-h'),
  };
}

// ---------- Censor ----------

/**
 * Puts text into an element. With the censor on (Settings), swear words
 * are replaced by a little *censored* sticker.
 */
function fillText(element, text) {
  element.replaceChildren();
  if (!MoodSettings.isCensorOn()) {
    element.textContent = text;
    return;
  }
  for (const part of MoodCensor.censorSegments(text)) {
    if (!part.censored) {
      element.append(document.createTextNode(part.text));
      continue;
    }
    const sticker = document.createElement('span');
    sticker.className = 'censor-sticker';
    sticker.textContent = '*censored*';
    sticker.title = 'Censored. You can turn this off in Settings.';
    element.append(sticker);
  }
}

/** Plain text version (for screen readers), censored when the censor is on. */
function plainText(text) {
  return MoodSettings.isCensorOn() ? MoodCensor.censorPlain(text) : text;
}

// ---------- Faces ----------

/** Points a <use> at the face for this base mood, in the current style. */
function setFace(use, mood) {
  use.dataset.face = String(mood);
  use.setAttribute('href', MoodSettings.faceHref(mood));
}

// =====================================================================
// Loading data
// =====================================================================

/** Keeps only valid notes and sorts them oldest first. */
function cleanEntries(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry
      && Moods.isValid(entry.mood)
      && typeof entry.whatHappened === 'string'
      && !Number.isNaN(new Date(entry.timestamp).getTime()))
    .map((entry) => ({
      id: String(entry.id),
      timestamp: entry.timestamp,
      mood: entry.mood,
      whatHappened: entry.whatHappened,
      comment: typeof entry.comment === 'string' ? entry.comment : '',
      name: typeof entry.name === 'string' ? entry.name.trim() : '', // '' = anonymous
      pinned: entry.pinned === true, // pinned by the admin
      demo: entry.demo === true,
      photos: MoodApi.photoUrls(entry, 1000), // big versions (opened note); [] = no photos
      thumbs: MoodApi.photoUrls(entry, 160),  // small versions (on the sticky note)
      cards: MoodApi.photoUrls(entry, 600),   // medium versions (on the wall cards)
      photoIds: MoodApi.photoIds(entry),      // Drive ids (for the Share picture)
      comments: Number(entry.comments) || 0,  // how many comments
      likes: Number(entry.likes) || 0,        // how many likes
      verified: entry.verified === true,      // posted by a signed-in person under their username
      edited: typeof entry.edited === 'string' ? entry.edited : '',
    }))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

/** Gets the notes from the server and redraws the map when something changed. */
async function loadEntries() {
  if (state.isLoading) return;
  state.isLoading = true;

  try {
    const response = await MoodApi.fetch('/api/entries', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `The server answered with code ${response.status}.`);
    }

    showMode(data.mode);
    state.commentsOff = Boolean(data.status && data.status.commentsOff);
    const entries = cleanEntries(data.entries);
    const signature = JSON.stringify(entries);
    state.hasLoaded = true;
    els.errorState.hidden = true;

    if (signature !== state.signature) {
      state.signature = signature;
      state.entries = entries;
      render();
    }
    els.updatedAt.textContent = `Updated ${formatTime(new Date())} · refreshes every 30 s`;
    loadMyLikes(); // (only asks the Sheet once per signed-in person)
  } catch (error) {
    console.error('Could not load entries:', error);
    if (state.hasLoaded) {
      // Keep showing the old notes; just mention the hiccup.
      els.updatedAt.textContent = "Couldn't refresh just now. Trying again soon…";
    } else {
      els.errorText.textContent = error instanceof TypeError
        ? "We couldn't reach the server. Is it still running?"
        : error.message;
      showBoardState('error');
    }
  } finally {
    state.isLoading = false;
    els.loadingState.hidden = true;
  }
}

/** Shows the "Saving locally" / "Connected to Google Sheets" badge. */
function showMode(mode) {
  const isSheets = mode === 'sheets';
  els.modeBadge.textContent = isSheets ? 'Connected to Google Sheets' : 'Saving locally';
  els.modeBadge.title = isSheets
    ? 'Notes are saved in the class Google Sheet.'
    : 'Notes are saved in data/entries.json on the server computer.';
  els.modeBadge.className = `mode-badge mode-badge--${isSheets ? 'sheets' : 'local'}`;
  els.modeBadge.hidden = false;
}

/** Shows one overlay: 'loading', 'empty', 'error', or null for none. */
function showBoardState(name) {
  els.loadingState.hidden = name !== 'loading';
  els.emptyState.hidden = name !== 'empty';
  els.errorState.hidden = name !== 'error';
}

// =====================================================================
// Drawing the map
// =====================================================================

/** The notes for the current filter, NEWEST FIRST. In-between moods count for both lanes. */
function getVisibleEntries() {
  const list = state.filter === 'all'
    ? state.entries
    : state.entries.filter((entry) => Moods.matchesBase(entry.mood, Number(state.filter)));
  return [...list].reverse();
}

function updateCount(visibleCount) {
  const total = state.entries.length;
  const word = (n) => (n === 1 ? 'note' : 'notes');
  els.count.textContent = state.filter === 'all'
    ? `${total} ${word(total)}`
    : `${visibleCount} of ${total} ${word(total)}`;
}

/** Redraws everything: notes, arrows, day markers, NOW/START. */
function render() {
  // Don't pull the notes away while one is open; redraw after it closes.
  if (state.focused) {
    state.renderWhenClosed = true;
    return;
  }

  const visible = getVisibleEntries();
  updateCount(visible.length);

  if (state.entries.length === 0) {
    els.emptyTitle.textContent = 'No feelings shared yet!';
    els.emptyText.textContent = 'Be the first to share your mood.';
    els.emptyLink.hidden = false;
    showBoardState('empty');
  } else if (visible.length === 0) {
    els.emptyTitle.textContent = `No "${Moods.name(Number(state.filter))}" notes yet.`;
    els.emptyText.textContent = 'Pick "All" to see every note.';
    els.emptyLink.hidden = true;
    showBoardState('empty');
  } else {
    showBoardState(null);
  }

  const metrics = readMetrics();
  const availableWidth = els.scroll.clientWidth;
  const layout = computeLayout(visible, metrics, availableWidth);
  const trackWidth = Math.max(layout.width, availableWidth);

  els.track.style.width = `${trackWidth}px`;
  drawDayMarkers(layout.dayMarkers);
  const pins = placePins(trackWidth, metrics);
  drawNotes(layout.positions);
  drawConnectors(layout.positions, pins, metrics, trackWidth);
  drawWall(visible);
}

// =====================================================================
// The wall: every note as a card, Pinterest-style
// =====================================================================

/** How many columns fit (cards are about 240px wide). */
function wallColumnCount() {
  const width = els.wallGrid.clientWidth || window.innerWidth;
  return Math.max(2, Math.min(5, Math.floor(width / 240)));
}

/**
 * A rough guess of how tall a card will be, so each new card can go into the
 * column that is shortest so far. (Guessing is fine: it only decides the column.)
 */
function guessCardHeight(entry, columnWidth) {
  let height = 150 + Math.ceil(entry.whatHappened.length / 22) * 22;
  if (entry.comment) height += 30 + Math.min(4, Math.ceil(entry.comment.length / 30)) * 20;
  if (entry.cards.length) height += columnWidth * (entry.cards.length > 1 ? 0.95 : 0.78);
  return height;
}

function drawWall(entries) {
  const columns = wallColumnCount();
  const columnWidth = (els.wallGrid.clientWidth || 960) / columns;
  const lists = Array.from({ length: columns }, () => ({ height: 0, element: document.createElement('div') }));
  lists.forEach((list) => { list.element.className = 'wall__col'; });

  // Newest first, each card into the shortest column: row by row, but with no gaps
  entries.forEach((entry) => {
    const shortest = lists.reduce((best, list) => (list.height < best.height ? list : best), lists[0]);
    shortest.element.append(createWallCard(entry));
    shortest.height += guessCardHeight(entry, columnWidth);
  });
  els.wallGrid.replaceChildren(...lists.map((list) => list.element));
  els.wallGrid.style.setProperty('--wall-cols', String(columns));
  els.wallGrid.closest('.wall').hidden = entries.length === 0;
}

function createWallCard(entry) {
  const date = new Date(entry.timestamp);
  const card = document.createElement('article');
  card.className = `wall-card ${Moods.cssClass(entry.mood)}`;
  card.classList.toggle('is-blend', Moods.isBlend(entry.mood));
  card.classList.toggle('is-pinned', entry.pinned);

  // The big clickable part opens the note, like the sticky notes on the map
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'wall-card__open';
  open.dataset.id = entry.id;
  const author = entry.name ? `by ${plainText(entry.name)}` : 'anonymous';
  open.setAttribute('aria-label', `${Moods.baseLabel(entry.mood)}, ${author}: ${plainText(entry.whatHappened)}. Open note.`);
  open.addEventListener('click', () => openNote({ entry, tilt: 0 }, open));

  if (entry.cards.length) {
    const photo = document.createElement('span');
    photo.className = 'wall-card__photo';
    const img = document.createElement('img');
    img.src = entry.cards[0];
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    photo.append(img);
    if (entry.cards.length > 1) {
      const more = document.createElement('span');
      more.className = 'wall-card__more';
      more.textContent = `📷 ${entry.cards.length}`;
      photo.append(more);
    }
    open.append(photo);
  }

  const bodyBox = document.createElement('span');
  bodyBox.className = 'wall-card__body';

  const mood = document.createElement('span');
  mood.className = 'wall-card__mood';
  const faces = document.createElement('span');
  faces.className = 'face-pair';
  for (const part of Moods.parts(entry.mood)) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'face');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    setFace(use, part);
    svg.append(use);
    faces.append(svg);
  }
  const moodName = document.createElement('span');
  moodName.textContent = Moods.baseLabel(entry.mood);
  mood.append(faces, moodName);

  const what = document.createElement('span');
  what.className = 'wall-card__what';
  fillText(what, entry.whatHappened);
  bodyBox.append(mood, what);

  if (entry.comment) {
    const comment = document.createElement('span');
    comment.className = 'wall-card__comment';
    fillText(comment, entry.comment);
    bodyBox.append(comment);
  }

  const meta = document.createElement('span');
  meta.className = 'wall-card__meta';
  const who = document.createElement('span');
  who.className = 'wall-card__who';
  if (entry.name) fillText(who, `by ${entry.name}`);
  else who.textContent = 'anonymous';
  if (entry.verified && window.MoodAccount) who.append(MoodAccount.badge());
  else if (entry.name && window.MoodAccount && MoodAccount.enabled) who.prepend(MoodAccount.unverifiedBadge());
  const time = document.createElement('time');
  time.dateTime = entry.timestamp;
  time.textContent = formatDay(date);
  if (entry.edited) time.title = 'Edited';
  meta.append(who);
  if (entry.comments) {
    const count = document.createElement('span');
    count.className = 'wall-card__comments';
    count.textContent = `💬 ${entry.comments}`;
    count.title = `${entry.comments} comment${entry.comments === 1 ? '' : 's'}`;
    meta.append(count);
  }
  meta.append(time);
  bodyBox.append(meta);
  open.append(bodyBox);

  // Share / Save
  const actions = document.createElement('div');
  actions.className = 'share-buttons wall-card__actions';
  actions.append(
    makeLikeButton(entry),
    makeShareButton('📤', 'Share', () => openShare(entry)),
    makeShareButton('⬇', 'Save', (event) => saveNoteImage(entry, event.currentTarget)),
  );

  card.append(open, actions);
  return card;
}

// ---------- Likes (signed-in people; one like per person per note) ----------

const likes = { mine: new Set(), loadedFor: null };

/** Shows ♥ (liked) or ♡ and the count on every like button of this note. */
function updateLikeButtons(noteId) {
  const entry = state.entries.find((item) => item.id === noteId);
  const count = entry ? entry.likes : 0;
  const liked = likes.mine.has(noteId);
  document.querySelectorAll(`.like-btn[data-note="${CSS.escape(noteId)}"]`).forEach((button) => {
    button.setAttribute('aria-pressed', String(liked));
    button.querySelector('.like-btn__heart').textContent = liked ? '♥' : '♡';
    button.querySelector('.like-btn__count').textContent = String(count);
    button.setAttribute('aria-label', `${liked ? 'Unlike' : 'Like'} (${count})`);
  });
}

function makeLikeButton(entry) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mini-btn like-btn';
  button.dataset.note = entry.id;
  const heart = document.createElement('span');
  heart.className = 'like-btn__heart';
  heart.setAttribute('aria-hidden', 'true');
  const count = document.createElement('span');
  count.className = 'like-btn__count';
  button.append(heart, count);
  button.addEventListener('click', () => toggleLike(entry.id));
  if (!window.MoodAccount || !MoodAccount.enabled) button.hidden = true;
  // (filled in by updateLikeButtons once the button is on the page)
  queueMicrotask(() => updateLikeButtons(entry.id));
  return button;
}

async function toggleLike(noteId) {
  const user = await MoodAccount.requireUsername();
  const entry = state.entries.find((item) => item.id === noteId);
  // Show it straight away; fix it if the Sheet says otherwise
  const wasLiked = likes.mine.has(noteId);
  if (wasLiked) likes.mine.delete(noteId); else likes.mine.add(noteId);
  if (entry) entry.likes = Math.max(0, entry.likes + (wasLiked ? -1 : 1));
  updateLikeButtons(noteId);
  try {
    const data = await MoodApi.script('toggleLike', { userToken: user.token, noteId });
    if (data.liked) likes.mine.add(noteId); else likes.mine.delete(noteId);
    if (entry) entry.likes = data.count;
  } catch (error) {
    if (wasLiked) likes.mine.add(noteId); else likes.mine.delete(noteId);
    if (entry) entry.likes = Math.max(0, entry.likes + (wasLiked ? 1 : -1));
    if (error.code === 401) MoodAccount.expired();
  }
  updateLikeButtons(noteId);
}

/** Which notes this person liked (after signing in / on page load). */
async function loadMyLikes() {
  const user = window.MoodAccount && MoodAccount.enabled ? MoodAccount.user : null;
  if (!user) {
    likes.mine = new Set();
    likes.loadedFor = null;
    state.entries.forEach((entry) => updateLikeButtons(entry.id));
    return;
  }
  if (likes.loadedFor === user.username) return;
  likes.loadedFor = user.username;
  try {
    const data = await MoodApi.script('myLikes', { userToken: user.token });
    likes.mine = new Set(data.likes);
    state.entries.forEach((entry) => updateLikeButtons(entry.id));
  } catch (error) {
    if (error.code === 401) MoodAccount.expired();
  }
}

document.addEventListener('moodaccountchange', () => {
  loadMyLikes();
  document.querySelectorAll('.like-btn').forEach((button) => {
    button.hidden = !(window.MoodAccount && MoodAccount.enabled);
  });
});

function makeShareButton(icon, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mini-btn share-btn';
  const iconSpan = document.createElement('span');
  iconSpan.setAttribute('aria-hidden', 'true');
  iconSpan.textContent = icon;
  button.append(iconSpan, document.createTextNode(` ${label}`));
  button.addEventListener('click', onClick);
  return button;
}

// =====================================================================
// Share / Save a note as a pretty picture (share-card.js)
// =====================================================================

const share = { entry: null, blob: null, file: null, token: 0, options: loadShareOptions() };

/** The picture look (style + colour), remembered on this device. Starts with the site's style. */
function loadShareOptions() {
  const fallback = { style: document.documentElement.dataset.style || 'modern-2026', color: 'mood' };
  try {
    const saved = JSON.parse(localStorage.getItem('class-mood-share') || 'null');
    return {
      style: saved && MoodShareCard.STYLES.includes(saved.style) ? saved.style : fallback.style,
      color: saved && saved.color in MoodShareCard.COLORS ? saved.color : 'mood',
    };
  } catch {
    return fallback;
  }
}

function saveShareOptions() {
  try { localStorage.setItem('class-mood-share', JSON.stringify(share.options)); } catch { /* not saved */ }
}

/**
 * The Photos row: "All" (collage, only with 2+ photos), each photo as a
 * small picture to pick just that one, and "No photo".
 */
function showPhotoChoices(entry) {
  const count = entry.thumbs.length;
  els.sharePhotosRow.hidden = count === 0;
  els.sharePhotoChoices.replaceChildren();
  if (!count) return;
  const add = (value, build) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'share-choice';
    button.setAttribute('aria-pressed', String(share.photos === value));
    build(button);
    button.addEventListener('click', () => {
      share.photos = value;
      openShare(share.entry, true);
    });
    els.sharePhotoChoices.append(button);
  };
  if (count > 1) add('all', (button) => { button.textContent = `All ${count} (collage)`; });
  entry.thumbs.forEach((src, index) => add(index, (button) => {
    button.classList.add('share-photo-choice');
    button.setAttribute('aria-label', `Only photo ${index + 1}`);
    button.title = `Only photo ${index + 1}`;
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    button.append(img);
  }));
  add('none', (button) => { button.textContent = 'No photo'; });
}

function showShareOptions() {
  document.querySelectorAll('[data-share-style]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.shareStyle === share.options.style));
  });
  document.querySelectorAll('[data-share-color]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.shareColor === share.options.color));
  });
}

function shareFileName(entry) {
  return `moodboard-${new Date(entry.timestamp).toISOString().slice(0, 10)}.png`;
}

function shareText(entry) {
  const what = plainText(entry.whatHappened);
  const mood = Moods.parts(entry.mood).map((part) => MoodI18n.t(Moods.name(part))).join(' + ');
  return `${mood}: “${what}” ✿ ${MoodI18n.t('How was class today?')} ${MoodShareCard.siteUrl()}`;
}

/** Saves a picture file (on phones it goes to Downloads / Files). */
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** The Save button on a card: make the picture and save it straight away. */
async function saveNoteImage(entry, button) {
  const label = button.lastChild;
  const original = label.nodeValue;
  button.disabled = true;
  label.nodeValue = ' …';
  try {
    downloadBlob(await MoodShareCard.render(entry, share.options), shareFileName(entry));
    label.nodeValue = ' ✓';
  } catch (error) {
    console.error(error);
    label.nodeValue = ' ✕';
  }
  setTimeout(() => { label.nodeValue = original; button.disabled = false; }, 1600);
}

/** The Share button: show the picture first, then Share / Save / Copy link. */
async function openShare(entry, keepChoices = false) {
  if (!keepChoices || share.entry !== entry) share.photos = 'all'; // a new note starts with all its photos
  share.entry = entry;
  share.blob = null;
  share.file = null;
  const token = ++share.token;
  showShareOptions();
  showPhotoChoices(entry);
  els.shareWhatsApp.href = `https://wa.me/?text=${encodeURIComponent(shareText(entry))}`;
  els.shareStatus.hidden = false;
  els.shareStatus.textContent = 'Making the picture…';
  els.shareSend.disabled = true;
  els.shareSave.disabled = true;
  if (!els.shareDialog.open) {
    els.shareImg.hidden = true; // (when only the look changes, keep the old picture until the new one is ready)
    els.shareDialog.showModal();
  }
  try {
    const blob = await MoodShareCard.render(entry, { ...share.options, photos: share.photos });
    if (token !== share.token) return; // another note was chosen meanwhile
    share.blob = blob;
    share.file = new File([blob], shareFileName(entry), { type: 'image/png' });
    if (els.shareImg.src) URL.revokeObjectURL(els.shareImg.src);
    els.shareImg.src = URL.createObjectURL(blob);
    els.shareImg.hidden = false;
    els.shareStatus.hidden = true;
    els.shareSend.disabled = false;
    els.shareSave.disabled = false;
  } catch (error) {
    console.error(error);
    els.shareStatus.textContent = "Couldn't make the picture. You can still copy the link.";
  }
}

async function sendShare() {
  if (!share.file) return;
  const text = shareText(share.entry);
  try {
    if (navigator.canShare && navigator.canShare({ files: [share.file] })) {
      await navigator.share({ files: [share.file], title: 'moodBOARD', text });
    } else if (navigator.share) {
      await navigator.share({ title: 'moodBOARD', text, url: MoodShareCard.siteUrl() });
    } else {
      // Computers without a share menu: save the picture and copy the text
      downloadBlob(share.blob, share.file.name);
      await navigator.clipboard.writeText(text);
      els.shareStatus.hidden = false;
      els.shareStatus.textContent = 'Picture saved and the text is copied. Paste it anywhere!';
    }
  } catch (error) {
    if (error && error.name === 'AbortError') return; // the student closed the share menu
    console.error(error);
  }
}

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(MoodShareCard.siteUrl());
    els.shareStatus.hidden = false;
    els.shareStatus.textContent = 'Link copied!';
  } catch {
    els.shareStatus.hidden = false;
    els.shareStatus.textContent = MoodShareCard.siteUrl();
  }
}

// Style / colour buttons: redraw the picture with the new look
document.querySelectorAll('[data-share-style]').forEach((button) => {
  button.addEventListener('click', () => {
    share.options.style = button.dataset.shareStyle;
    saveShareOptions();
    if (share.entry) openShare(share.entry, true);
  });
});
document.querySelectorAll('[data-share-color]').forEach((button) => {
  button.addEventListener('click', () => {
    share.options.color = button.dataset.shareColor;
    saveShareOptions();
    if (share.entry) openShare(share.entry, true);
  });
});

els.shareSend.addEventListener('click', sendShare);
els.shareSave.addEventListener('click', () => { if (share.blob) downloadBlob(share.blob, share.file.name); });
els.shareCopy.addEventListener('click', copyShareLink);
els.shareClose.addEventListener('click', () => els.shareDialog.close());
els.shareDialog.addEventListener('click', (event) => { if (event.target === els.shareDialog) els.shareDialog.close(); });

// =====================================================================
// Comments (people signed in with Google + a username; account.js)
// =====================================================================

const comments = { noteId: null, list: [], token: 0 };

function formatCommentTime(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(MoodI18n.locale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Shows / hides the form, the sign-in button, or "comments are off". */
function updateCommentForm() {
  const user = window.MoodAccount && MoodAccount.user;
  const off = state.commentsOff;
  els.commentForm.hidden = off || !user;
  els.commentSignIn.hidden = off || Boolean(user);
  els.commentsOff.hidden = !off;
  if (user) els.commentAs.textContent = MoodI18n.t(`as @${user.username}`);
}

function renderComments() {
  const me = window.MoodAccount && MoodAccount.user;
  els.commentsList.replaceChildren();
  comments.list.forEach((comment) => {
    const item = document.createElement('li');
    item.className = 'comment';
    const head = document.createElement('p');
    head.className = 'comment__head';
    const name = document.createElement('strong');
    name.className = 'comment__name';
    name.textContent = `@${comment.username}`;
    if (comment.verified !== false) name.append(MoodAccount.badge()); // commenters are always signed in
    const time = document.createElement('time');
    time.className = 'comment__time';
    time.dateTime = comment.timestamp;
    time.textContent = formatCommentTime(comment.timestamp);
    head.append(name, time);
    // Delete: your own comments, or any comment for an admin
    if ((me && me.username === comment.username) || state.isAdmin) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'comment__delete';
      remove.textContent = '🗑';
      remove.setAttribute('aria-label', 'Delete comment');
      remove.title = 'Delete comment';
      remove.addEventListener('click', () => deleteComment(comment));
      head.append(remove);
    }
    const text = document.createElement('p');
    text.className = 'comment__text';
    fillText(text, comment.text);
    item.append(head, text);
    els.commentsList.append(item);
  });
  els.commentsEmpty.hidden = comments.list.length > 0;
}

/** The opened note: load its comments. */
async function showComments(entry) {
  if (!window.MoodAccount || !MoodAccount.enabled) { // no Google sign-in key yet: no comments section
    els.comments.hidden = true;
    return;
  }
  els.comments.hidden = false;
  comments.noteId = entry.id;
  comments.list = [];
  const token = ++comments.token;
  els.commentsList.replaceChildren();
  els.commentsEmpty.hidden = false;
  els.commentsEmpty.textContent = entry.comments ? 'Loading comments…' : 'No comments yet. Be the first!';
  els.commentError.textContent = '';
  els.commentInput.value = '';
  els.commentCounter.textContent = '0 / 200';
  updateCommentForm();
  if (!entry.comments) return;
  try {
    const data = await MoodApi.scriptGet('comments', { note: entry.id });
    if (token !== comments.token) return; // another note was opened meanwhile
    comments.list = data.comments;
    els.commentsEmpty.textContent = 'No comments yet. Be the first!';
    renderComments();
  } catch {
    if (token === comments.token) els.commentsEmpty.textContent = "Couldn't load the comments.";
  }
}

/** Keeps the comment count on the note (and its wall card) in step. */
function setCommentCount(noteId, count) {
  const entry = state.entries.find((item) => item.id === noteId);
  if (entry) entry.comments = count;
  state.signature = ''; // redraw the wall after the note closes
  state.renderWhenClosed = true;
}

async function submitComment(event) {
  event.preventDefault();
  const text = els.commentInput.value.trim();
  els.commentError.textContent = '';
  if (!text) {
    els.commentError.textContent = 'Write something first.';
    els.commentInput.focus();
    return;
  }
  const user = await MoodAccount.requireUsername();
  els.commentSend.disabled = true;
  try {
    const data = await MoodApi.script('addComment', { userToken: user.token, noteId: comments.noteId, text });
    comments.list.push(data.comment);
    renderComments();
    setCommentCount(comments.noteId, comments.list.length);
    els.commentInput.value = '';
    els.commentCounter.textContent = '0 / 200';
  } catch (error) {
    if (error.code === 401) {
      MoodAccount.expired();
      els.commentError.textContent = 'Your sign-in ran out. Please sign in again.';
    } else {
      els.commentError.textContent = error.message;
    }
  } finally {
    els.commentSend.disabled = false;
  }
}

async function deleteComment(comment) {
  const me = MoodAccount.user;
  try {
    if (me && me.username === comment.username) {
      await MoodApi.script('deleteMyComment', { userToken: me.token, commentId: comment.id });
    } else {
      const response = await MoodApi.fetch(`/api/admin/comments/${encodeURIComponent(comment.id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Could not delete the comment.');
    }
    comments.list = comments.list.filter((item) => item.id !== comment.id);
    renderComments();
    setCommentCount(comments.noteId, comments.list.length);
  } catch (error) {
    els.commentError.textContent = error.message;
  }
}

els.commentForm.addEventListener('submit', submitComment);
els.commentInput.addEventListener('input', () => {
  els.commentCounter.textContent = `${els.commentInput.value.length} / 200`;
});
els.commentSignIn.addEventListener('click', () => MoodAccount.requireUsername());
document.addEventListener('moodaccountchange', () => {
  updateCommentForm();
  if (state.focused) renderComments();
});

/**
 * Works out where every note goes.
 * With only a few notes we spread them out so the journey fills the board.
 */
function computeLayout(entries, metrics, availableWidth) {
  let layout = placeNotes(entries, metrics, 0);
  if (entries.length > 1 && layout.width < availableWidth) {
    const extra = Math.min(LAYOUT.maxExtraSpace, (availableWidth - layout.width) / (entries.length - 1));
    layout = placeNotes(entries, metrics, extra);
  }
  return layout;
}

/**
 * Places notes left to right, newest first.
 *  - x: each note starts a bit after the previous one (+ extra room on a new day)
 *  - if a note lands too close to the last note in the SAME lane, it is pushed right
 *  - y: the lane of its mood (great on top). An in-between mood such as 4.5
 *       ends up exactly on the line between the Great and Good lanes.
 */
function placeNotes(entries, metrics, extraSpace) {
  const step = metrics.noteW + LAYOUT.noteSpacing + extraSpace;
  const positions = [];
  const dayMarkers = [];
  const laneRightEdge = {}; // mood -> right edge of the last note in that lane
  let previousX = null;
  let previousDay = null;

  entries.forEach((entry) => {
    const date = new Date(entry.timestamp);
    const dayKey = date.toDateString();
    let x = previousX === null ? LAYOUT.leftSpace : previousX + step;

    // New day? Leave a little extra room and add a day marker.
    if (dayKey !== previousDay) {
      if (previousX !== null) x += LAYOUT.dayGap;
      dayMarkers.push({ x: x - LAYOUT.dayGap / 2, label: formatDay(date) });
      previousDay = dayKey;
    }

    // Too close to the previous note in the same lane? Push it to the right.
    const laneEdge = laneRightEdge[entry.mood];
    if (laneEdge !== undefined) x = Math.max(x, laneEdge + LAYOUT.laneGap);

    const laneIndex = 5 - entry.mood; // great (5) is lane 0; 4.5 is lane 0.5 = the line below it
    const laneTop = metrics.rulerH + laneIndex * metrics.laneH;
    const nudge = (seededRandom(`${entry.id}:y`) * 2 - 1) * LAYOUT.jitterY;
    const y = laneTop + (metrics.laneH - metrics.noteH) / 2 + nudge;
    const tilt = (seededRandom(entry.id) * 2 - 1) * LAYOUT.maxTilt;

    positions.push({ entry, x, y, tilt });
    laneRightEdge[entry.mood] = x + metrics.noteW;
    previousX = x;
  });

  const width = previousX === null ? 0 : previousX + metrics.noteW + LAYOUT.rightSpace;
  return { positions, dayMarkers, width };
}

/** Dashed vertical lines with the day name at the top. */
function drawDayMarkers(markers) {
  els.days.replaceChildren();
  markers.forEach((marker) => {
    const line = document.createElement('div');
    line.className = 'day-marker';
    line.style.left = `${marker.x}px`;

    const label = document.createElement('span');
    label.className = 'day-marker__label';
    label.textContent = marker.label;

    line.append(label);
    els.days.append(line);
  });
}

/** Puts NOW on the left and START on the right, in the middle lane. Returns their boxes. */
function placePins(trackWidth, metrics) {
  const middleY = metrics.rulerH + 2.5 * metrics.laneH;

  const now = els.nowPin;
  const nowBox = { x: 14, y: middleY - now.offsetHeight / 2, w: now.offsetWidth, h: now.offsetHeight };

  const first = els.firstPin;
  const firstBox = {
    x: trackWidth - first.offsetWidth - 32, // extra room for its tilt and shadow
    y: middleY - first.offsetHeight / 2,
    w: first.offsetWidth,
    h: first.offsetHeight,
  };

  now.style.left = `${nowBox.x}px`;
  now.style.top = `${nowBox.y}px`;
  first.style.left = `${firstBox.x}px`;
  first.style.top = `${firstBox.y}px`;
  return { now: nowBox, first: firstBox };
}

/**
 * The photo row on a sticky note: up to 3 photos, and when there are more,
 * a 4th blurred tile that says "+1" / "+2".
 */
function createCollage(thumbs) {
  const collage = document.createElement('span');
  collage.className = 'note__photos';
  collage.setAttribute('aria-hidden', 'true'); // the note's label already says it has photos
  thumbs.slice(0, 4).forEach((src, index) => {
    const tile = document.createElement('span');
    tile.className = 'note__photo-tile';
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.draggable = false;
    tile.append(img);
    const extra = thumbs.length - 3;
    if (index === 3 && extra > 0) {
      tile.classList.add('is-more');
      const more = document.createElement('span');
      more.className = 'note__photo-more';
      more.textContent = `+${extra}`;
      tile.append(more);
    }
    collage.append(tile);
  });
  return collage;
}

/** Creates one sticky note button per note. */
function drawNotes(positions) {
  els.notes.replaceChildren();

  positions.forEach((position, index) => {
    const { entry } = position;
    const date = new Date(entry.timestamp);

    const slot = document.createElement('li');
    slot.className = 'note-slot';
    slot.style.left = `${position.x}px`;
    slot.style.top = `${position.y}px`;

    const note = document.createElement('button');
    note.type = 'button';
    note.className = `note ${Moods.cssClass(entry.mood)}`;
    note.classList.toggle('is-blend', Moods.isBlend(entry.mood));
    note.classList.toggle('is-pinned', entry.pinned);
    note.dataset.id = entry.id;
    note.style.setProperty('--tilt', `${position.tilt.toFixed(2)}deg`);
    const author = entry.name ? `by ${plainText(entry.name)}` : 'anonymous';
    note.setAttribute('aria-label',
      `${entry.pinned ? 'Pinned. ' : ''}${Moods.baseLabel(entry.mood)}, ${author}, ${formatFullDate(date)}: `
      + `${plainText(entry.whatHappened)}. `
      + `${entry.photos.length ? `${entry.photos.length} photo${entry.photos.length === 1 ? '' : 's'}. ` : ''}Open note.`);

    // Only brand-new notes get the "drop in" animation
    if (!state.seenIds.has(entry.id)) {
      note.classList.add('is-new');
      note.style.setProperty('--delay', `${Math.min(index, 20) * 45}ms`);
      state.seenIds.add(entry.id);
    }

    const text = document.createElement('span');
    text.className = 'note__text';
    fillText(text, entry.whatHappened);

    const meta = document.createElement('span');
    meta.className = 'note__meta';
    const time = document.createElement('time');
    time.dateTime = entry.timestamp;
    time.textContent = formatTime(date);
    meta.append(time);


    // Show the name only if the student chose to share it
    if (entry.name) {
      const nameTag = document.createElement('span');
      nameTag.className = 'note__name';
      fillText(nameTag, entry.name);
      if (entry.verified && window.MoodAccount) nameTag.append(MoodAccount.badge());
      else if (window.MoodAccount && MoodAccount.enabled) nameTag.prepend(MoodAccount.unverifiedBadge(true)); // tiny "?" on the small note
      meta.append(nameTag);
    } else if (entry.demo) {
      const demoTag = document.createElement('span');
      demoTag.className = 'note__demo';
      demoTag.textContent = 'demo';
      meta.append(demoTag);
    }

    note.append(text);
    if (entry.thumbs.length) {
      note.classList.add('has-photos');
      note.append(createCollage(entry.thumbs));
    }
    note.append(meta);
    note.addEventListener('click', () => openNote(position, note));
    slot.append(note);
    els.notes.append(slot);
  });
}

// ---------- Connector arrows ----------

function centerOf(box) {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/**
 * The point where a line from the middle of `box` towards `target`
 * leaves the box (plus some padding).
 */
function edgePoint(box, target, padding) {
  const center = centerOf(box);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const halfW = box.w / 2 + padding;
  const halfH = box.h / 2 + padding;
  const scale = Math.min(
    dx === 0 ? Infinity : halfW / Math.abs(dx),
    dy === 0 ? Infinity : halfH / Math.abs(dy),
  );
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

/** A gently curved path from one box to the next, or null if they are too close. */
function connectorPath(fromBox, toBox, index) {
  const fromCenter = centerOf(fromBox);
  const toCenter = centerOf(toBox);
  const start = edgePoint(fromBox, toCenter, LAYOUT.arrowPadding);
  const end = edgePoint(toBox, fromCenter, LAYOUT.arrowPadding);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const pointsForward = dx * (toCenter.x - fromCenter.x) + dy * (toCenter.y - fromCenter.y) > 0;
  if (length < 22 || !pointsForward) return null;

  // Bend the line a little, alternating up and down, so it looks hand-drawn
  const bend = (index % 2 === 0 ? 1 : -1) * Math.min(20, length * 0.18);
  const controlX = start.x + dx / 2 - (dy / length) * bend;
  const controlY = start.y + dy / 2 + (dx / length) * bend;
  const r = (n) => n.toFixed(1);
  return `M${r(start.x)} ${r(start.y)} Q${r(controlX)} ${r(controlY)} ${r(end.x)} ${r(end.y)}`;
}

/**
 * Draws the arrows. The boxes run NOW, newest ... oldest, START (left to right),
 * but the arrows follow time: START -> oldest -> ... -> newest -> NOW.
 */
function drawConnectors(positions, pins, metrics, trackWidth) {
  const height = metrics.rulerH + 5 * metrics.laneH;
  els.connectors.setAttribute('width', trackWidth);
  els.connectors.setAttribute('height', height);
  els.connectors.setAttribute('viewBox', `0 0 ${trackWidth} ${height}`);
  els.connectorPaths.replaceChildren();
  if (positions.length === 0) return;

  const boxes = [
    pins.now,
    ...positions.map((p) => ({ x: p.x, y: p.y, w: metrics.noteW, h: metrics.noteH })),
    pins.first,
  ];

  for (let i = 0; i < boxes.length - 1; i++) {
    const d = connectorPath(boxes[i + 1], boxes[i], i); // from the older box to the newer one
    if (!d) continue;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'connector');
    path.setAttribute('d', d);
    path.setAttribute('marker-end', 'url(#arrowhead)');
    els.connectorPaths.append(path);
  }
}

// =====================================================================
// Focused note (big note in the middle)
// =====================================================================

/**
 * The transform that makes the big card sit exactly on top of the small note.
 * Animating from this transform to "none" makes the note seem to grow to the centre.
 */
function transformFromNote(noteButton, tilt) {
  const from = noteButton.getBoundingClientRect();
  const to = els.focusCard.getBoundingClientRect();
  const scale = from.width / to.width;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${tilt}deg)`;
}

function fillFocusCard(entry) {
  const date = new Date(entry.timestamp);
  const [firstMood, secondMood] = Moods.parts(entry.mood);
  els.focusCard.className = `focus-card ${Moods.cssClass(entry.mood)}`;
  els.focusCard.classList.toggle('is-blend', Moods.isBlend(entry.mood));

  // One face, or two for an in-between mood ("Great + Good")
  setFace(els.focusFace, firstMood);
  // (SVG elements have no .hidden property, so set the attribute itself)
  els.focusFaceSecond.closest('svg').toggleAttribute('hidden', !secondMood);
  if (secondMood) setFace(els.focusFaceSecond, secondMood);
  els.focusMoodName.textContent = Moods.baseLabel(entry.mood);

  if (entry.name) fillText(els.focusAuthor, `by ${entry.name}`);
  else els.focusAuthor.textContent = 'anonymous';
  if (entry.verified && window.MoodAccount) els.focusAuthor.append(MoodAccount.badge());
  else if (entry.name && window.MoodAccount && MoodAccount.enabled) els.focusAuthor.prepend(MoodAccount.unverifiedBadge());
  if (entry.edited) {
    const editedTag = document.createElement('span');
    editedTag.className = 'focus-edited';
    editedTag.textContent = '(edited)';
    els.focusAuthor.append(' ', editedTag);
  }
  // Like button (first in the Share / Save row)
  const shareRow = els.focusShareButton.parentElement;
  shareRow.querySelectorAll('.like-btn').forEach((old) => old.remove());
  shareRow.prepend(makeLikeButton(entry));
  els.focusAuthor.classList.toggle('is-anonymous', !entry.name);
  fillText(els.focusWhat, entry.whatHappened);
  if (entry.comment) fillText(els.focusComment, entry.comment);
  else els.focusComment.textContent = 'No extra comment.';
  els.focusComment.classList.toggle('is-empty', !entry.comment);

  // All the photos (up to 5); tap one and it comes up close (lightbox.js)
  els.focusPhotos.replaceChildren();
  els.focusPhotos.hidden = entry.photos.length === 0;
  els.focusPhotos.dataset.count = String(entry.photos.length);
  const bigPhotos = entry.photos.map((src) => src.replace(/sz=w\d+/, 'sz=w2000'));
  entry.photos.forEach((src, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'focus-photos__item';
    button.setAttribute('aria-label', `Open photo ${index + 1} of ${entry.photos.length}`);
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    button.append(img);
    button.addEventListener('click', () => MoodLightbox.open(bigPhotos, index, img));
    els.focusPhotos.append(button);
  });
  els.focusDate.textContent = formatFullDate(date);
  els.focusDate.dateTime = entry.timestamp;

  showComments(entry);

  // Admin bar (only for a logged-in admin)
  els.focusAdmin.hidden = !state.isAdmin;
  els.focusHideButton.disabled = false;
  els.focusAdminHint.textContent = 'Hidden notes can be shown again in the Admin desk.';
  els.focusAdminHint.classList.remove('is-error');
}

// ---------- Admin: hide a note straight from the map ----------

/** Asks the server if this browser is logged in as admin. */
async function checkAdmin() {
  try {
    const data = await MoodApi.fetch('/api/admin/session', { cache: 'no-store' }).then((response) => response.json());
    state.isAdmin = Boolean(data.admin);
  } catch {
    state.isAdmin = false;
  }
}

/** "Hide from map": the note disappears for everyone (the admin can show it again in the Admin desk). */
async function hideFocusedNote() {
  const focused = state.focused;
  if (!focused) return;
  els.focusHideButton.disabled = true;
  try {
    const response = await MoodApi.fetch(`/api/admin/notes/${encodeURIComponent(focused.entryId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: true }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) state.isAdmin = false; // the login ran out
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not hide the note.');

    // Take it off the map right away, then close the big note
    state.entries = state.entries.filter((entry) => entry.id !== focused.entryId);
    state.signature = '';
    state.renderWhenClosed = true;
    closeNote();
    els.updatedAt.textContent = 'Note hidden. You can show it again in the Admin desk.';
  } catch (error) {
    els.focusHideButton.disabled = false;
    els.focusAdminHint.textContent = error instanceof TypeError ? "Couldn't reach the server." : error.message;
    els.focusAdminHint.classList.add('is-error');
  }
}

function openNote(position, noteButton) {
  if (state.focused) return;
  const { entry, tilt } = position;

  fillFocusCard(entry);
  state.focused = { entryId: entry.id, noteButton, tilt };
  els.focusLayer.hidden = false;
  document.body.classList.add('modal-open');
  noteButton.classList.add('is-source');

  if (!prefersReducedMotion()) {
    els.focusCard.animate(
      [{ transform: transformFromNote(noteButton, tilt), opacity: 0.6 }, { transform: 'none', opacity: 1 }],
      { duration: 420, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.15)' },
    );
    els.focusBackdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
  }
  els.focusClose.focus({ preventScroll: true });
}

function closeNote() {
  const focused = state.focused;
  if (!focused || state.isClosing) return;
  state.isClosing = true;

  const animations = [];

  const finish = () => {
    els.focusLayer.hidden = true;
    animations.forEach((animation) => animation.cancel());
    document.body.classList.remove('modal-open');
    focused.noteButton.classList.remove('is-source');
    state.focused = null;
    state.isClosing = false;

    if (state.renderWhenClosed) {
      state.renderWhenClosed = false;
      render();
    }
    // Put keyboard focus back on the note that was opened
    // (the same note on the map, or the wall card it was opened from)
    const note = focused.noteButton.isConnected
      ? focused.noteButton
      : [...els.notes.querySelectorAll('.note')].find((n) => n.dataset.id === focused.entryId);
    if (note) note.focus({ preventScroll: true });
  };

  if (prefersReducedMotion() || !focused.noteButton.isConnected) {
    finish();
    return;
  }

  const shrink = els.focusCard.animate(
    [{ transform: 'none', opacity: 1 }, { transform: transformFromNote(focused.noteButton, focused.tilt), opacity: 0.3 }],
    { duration: 280, easing: 'cubic-bezier(0.4, 0, 0.7, 1)', fill: 'forwards' },
  );
  const fade = els.focusBackdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, fill: 'forwards' });
  animations.push(shrink, fade);
  shrink.onfinish = finish;
}

function handleKeydown(event) {
  if (!state.focused || document.querySelector('dialog[open]')) return; // an open window (share, sign-in) handles its own keys
  if (event.key === 'Escape') {
    event.preventDefault();
    closeNote();
  } else if (event.key === 'Tab') {
    // Keep keyboard focus inside the open note: cycle through its visible buttons
    event.preventDefault();
    const buttons = [...els.focusCard.querySelectorAll('button, textarea, a[href]')].filter((button) => !button.closest('[hidden]'));
    const index = buttons.indexOf(document.activeElement);
    const next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next].focus();
  }
}

// =====================================================================
// Filter, resize, refresh
// =====================================================================

function setFilter(value) {
  state.filter = value;
  els.filterButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.filter === value));
  });
  render();
  els.scroll.scrollLeft = 0; // back to the newest notes
}

let resizeTimer = null;
function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.hasLoaded) render();
  }, 150);
}

// ---------- Wiring everything up ----------

els.filterButtons.forEach((button) => {
  button.addEventListener('click', () => setFilter(button.dataset.filter));
});
els.focusBackdrop.addEventListener('click', closeNote);
els.focusClose.addEventListener('click', closeNote);
els.focusHideButton.addEventListener('click', hideFocusedNote);
const focusedEntry = () => state.focused && state.entries.find((entry) => entry.id === state.focused.entryId);
els.focusShareButton.addEventListener('click', () => { if (focusedEntry()) openShare(focusedEntry()); });
els.focusSaveButton.addEventListener('click', (event) => { if (focusedEntry()) saveNoteImage(focusedEntry(), event.currentTarget); });
els.retryButton.addEventListener('click', () => {
  showBoardState('loading');
  loadEntries();
});
document.addEventListener('keydown', handleKeydown);
window.addEventListener('resize', handleResize);

// NOW/START change size once a font arrives, so redraw the arrows then.
if (document.fonts) {
  document.fonts.ready.then(() => {
    if (state.hasLoaded) render();
  });
  document.fonts.addEventListener('loadingdone', () => {
    if (state.hasLoaded) render();
  });
}

// A new style has different sizes, and the censor may be switched on/off: redraw.
document.addEventListener('moodsettingschange', () => {
  if (state.hasLoaded) render();
});

// EN / ID switched: redraw so dates use the new language and NOW/START get their new width
document.addEventListener('moodlangchange', () => {
  if (state.hasLoaded) render();
});

// On the home page: a note was just sent from the form above -> show it straight away.
document.addEventListener('moodentrysent', async () => {
  await loadEntries();
  els.scroll.scrollLeft = 0;
});

// Refresh every 30 seconds (skipped while the tab is hidden), and right away when you come back.
setInterval(() => {
  if (!document.hidden) loadEntries();
}, REFRESH_INTERVAL_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.hasLoaded) loadEntries();
});

showBoardState('loading');
checkAdmin();
loadEntries();
