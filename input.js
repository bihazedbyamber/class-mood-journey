/* =====================================================================
   Class Mood Journey — input.js   (runs on checkin.html and the home page)
   It:
     1. highlights the chosen mood face and shows a little reaction
        (also for the 4 small "+" in-between moods, e.g. Great + Good = Cheerful)
     2. shows live character counters and "quick pick" ideas
     3. shows who the note is from (anonymous, or your name)
     4. checks the form, then sends it to our server (POST /api/entries)
     5. shows a thank-you message, or a kind error message
   Loaded as a module (type="module"), so its names never clash with journey.js.
   User text is only ever shown with textContent (never innerHTML).
   ===================================================================== */

/** Same limits as the server. */
const LIMITS = { whatHappened: 80, comment: 300 };

/** One of these is picked at random after sending. */
const THANK_YOU_MESSAGES = [
  'Your note is now stuck on the Class moods page. ✿',
  'Feelings received! Thanks for helping our class get better.',
  'Yay! Your sticky note just landed on the map.',
  'Thanks for sharing. Every note helps! ♡',
  'Got it! Your paper airplane arrived safely.',
];

/** A short reaction for each mood, shown right after picking it. */
const MOOD_REACTIONS = {
  5: 'yesss, love that for you!',
  4: 'nice, a good one!',
  3: 'fair enough, just a normal day',
  2: 'oh no, sorry it was rough',
  1: 'ugh, that sounds frustrating. tell us why?',
  // the in-between moods
  4.5: 'cheerful! somewhere between great and good ✨',
  3.5: 'chill vibes: good-ish, but calm',
  2.5: 'meh… not great, not terrible',
  1.5: 'stressed? that sounds heavy. want to share why?',
};

// ---------- Page elements ----------
const form = document.getElementById('mood-form');
const formCard = document.getElementById('form-card');
const moodOptionsBox = form.querySelector('.mood-options');
const moodOptions = form.querySelectorAll('.mood-option');   // the 5 faces
const moodBlends = form.querySelectorAll('.mood-blend');     // the 4 small "+" between them
const moodInputs = form.querySelectorAll('input[name="mood"]');
const moodReaction = document.getElementById('mood-reaction');
const moodError = document.getElementById('mood-error');
const whatInput = document.getElementById('what-happened');
const whatError = document.getElementById('what-error');
const whatCounter = document.getElementById('what-counter');
const quickPicks = form.querySelectorAll('.quick-pick');
const commentInput = document.getElementById('comment');
const commentError = document.getElementById('comment-error');
const commentCounter = document.getElementById('comment-counter');
const identityButtons = form.querySelectorAll('.identity-toggle__option');
const nameField = document.getElementById('posting-name-field');
const nameInput = document.getElementById('posting-name-input');
const postingHint = document.getElementById('posting-hint');
const stickerText = document.getElementById('sticker-text');
const heroNoteText = document.getElementById('hero-note-text');
const formStatus = document.getElementById('form-status');
const submitButton = document.getElementById('submit-btn');
const submitLabel = submitButton.querySelector('.btn__label');
const thankYouBox = document.getElementById('thank-you');
const thankYouMessage = document.getElementById('thank-you-message');
const againButton = document.getElementById('again-btn');
const photoField = document.getElementById('photo-field');         // only on checkin.html
const photoInputs = [document.getElementById('photo-camera'), document.getElementById('photo-file')].filter(Boolean);
const photoPreviews = document.getElementById('photo-previews');
const photoCount = document.getElementById('photo-count');
const photoPicker = document.getElementById('photo-picker');
const photoError = document.getElementById('photo-error');

/** Photos are shrunk to this many pixels on the longest side before sending. */
const PHOTO_MAX_SIDE = 1280;
const MAX_PHOTOS = 5;

let isSending = false;
let photos = []; // the chosen photos as small JPEGs ("data:image/jpeg;base64,..."), at most 5

// ---------- Mood faces ----------

/** Returns the chosen mood (1, 1.5, 2 ... 5), or null when nothing is chosen yet. */
function getSelectedMood() {
  const checked = form.querySelector('input[name="mood"]:checked');
  return checked ? Number(checked.value) : null;
}

/**
 * Gives the chosen face its "selected" look, fades the others,
 * tints the card in the mood colour and shows a reaction.
 * An in-between mood (e.g. 4.5) half-highlights BOTH neighbouring faces.
 */
function highlightSelectedMood() {
  const mood = getSelectedMood();
  const isBlend = mood !== null && !Number.isInteger(mood);
  moodOptions.forEach((option) => {
    const value = Number(option.querySelector('input').value);
    option.classList.toggle('is-selected', value === mood);
    option.classList.toggle('is-half', isBlend && Math.abs(value - mood) < 1);
  });
  moodBlends.forEach((blend) => {
    blend.classList.toggle('is-selected', blend.querySelector('input').checked);
  });
  moodOptionsBox.classList.toggle('has-selection', mood !== null);

  if (mood === null) {
    delete formCard.dataset.mood;
    moodReaction.textContent = '';
  } else {
    formCard.dataset.mood = String(mood);
    moodReaction.textContent = MOOD_REACTIONS[mood];
    // Restart the little pop animation each time
    moodReaction.classList.remove('is-popping');
    void moodReaction.offsetWidth;
    moodReaction.classList.add('is-popping');
  }
}

// ---------- Who the note is from ----------

/**
 * Updates the "Posting as [Anonymous | My name]" switch, the name box,
 * the hint under it, and the sticker + note at the top of the page.
 * (The same choice is also in Settings; both stay in sync.)
 */
function showIdentity() {
  const { identity: choice, name } = window.MoodSettings.getNameSettings();
  const wantsName = choice === 'named';

  identityButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.identity === choice));
  });
  nameField.hidden = !wantsName;
  // Don't overwrite the box while the student is typing in it
  if (document.activeElement !== nameInput) nameInput.value = name;
  postingHint.classList.remove('is-error');

  // The sticker and the scribbled note at the top (only if the page has them)
  const setHero = (sticker, note) => {
    if (stickerText) stickerText.textContent = sticker;
    if (heroNoteText) heroNoteText.textContent = note;
  };

  if (wantsName && name) {
    const shortName = name.length > 7 ? `${name.slice(0, 6)}…` : name;
    postingHint.textContent = `Your note will say "by ${name}".`;
    setHero(`hey\n${shortName}`, `signing as ${name}.\nanonymous is one tap away`);
  } else {
    postingHint.textContent = wantsName
      ? 'Type your name above. Your name is only saved on this device.'
      : 'No name is sent. Nobody can tell which note is yours.';
    setHero('100%\nanon', 'no names. no logins.\njust honest vibes');
  }
}

/** Anonymous / My name button clicked. */
function chooseIdentity(choice) {
  window.MoodSettings.setIdentity(choice);
  if (choice === 'named') nameInput.focus();
}

// ---------- Photo ----------

/** Loads a picture file into an <img> (works for JPG, PNG, WebP and most phone photos). */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

/**
 * Shrinks the photo and turns it into a JPEG. Redrawing it this way also
 * drops hidden details phones add to photos (like the GPS location).
 */
async function shrinkPhoto(file) {
  const img = await loadImage(file);
  return toSmallJpeg(img, img.naturalWidth, img.naturalHeight);
}

/**
 * Draws a picture (image or camera frame) small, as a JPEG "data:" text.
 * mirror: flip it left-right (the camera's Mirror button).
 */
function toSmallJpeg(source, width, height, mirror = false) {
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff'; // see-through PNGs get a white background
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (mirror) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  let quality = 0.82;
  let data = canvas.toDataURL('image/jpeg', quality);
  while (data.length > 1400000 && quality > 0.4) { // stay under the Sheet's limit
    quality -= 0.12;
    data = canvas.toDataURL('image/jpeg', quality);
  }
  return data;
}

/** Draws the chosen photos (each with a ✕) and the "2 / 5" counter. */
function showPhotos() {
  if (!photoField) return;
  photoPreviews.replaceChildren();
  photos.forEach((data, index) => {
    const item = document.createElement('li');
    item.className = 'photo-previews__item';
    const img = document.createElement('img');
    img.src = data;
    img.alt = `Photo ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'photo-previews__remove';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', 'Remove this photo');
    remove.title = 'Remove this photo';
    remove.addEventListener('click', () => {
      photos.splice(index, 1);
      setFieldError(photoError, '');
      showPhotos();
    });
    item.append(img, remove);
    photoPreviews.append(item);
  });
  photoPreviews.hidden = photos.length === 0;
  photoCount.textContent = photos.length ? `${photos.length} / ${MAX_PHOTOS} photos` : 'Up to 5 photos';
  // Full? Then the add buttons rest until a photo is removed
  const full = photos.length >= MAX_PHOTOS;
  photoPicker.classList.toggle('is-full', full);
  document.getElementById('photo-camera-btn').disabled = full;
  document.getElementById('photo-file').disabled = full;
}

/** Adds a photo (if there is room). Returns false when it was full. */
function addPhoto(data) {
  if (photos.length >= MAX_PHOTOS) return false;
  photos.push(data);
  showPhotos();
  return true;
}

async function handlePhotoChosen(event) {
  const input = event.target;
  const files = [...(input.files || [])];
  input.value = ''; // so choosing the same photo again still works
  if (!files.length) return;
  setFieldError(photoError, '');
  const room = MAX_PHOTOS - photos.length;
  if (files.length > room) {
    setFieldError(photoError, `You can add up to ${MAX_PHOTOS} photos, so only the first ${room} were added.`);
  }
  for (const file of files.slice(0, room)) {
    if (!file.type.startsWith('image/')) {
      setFieldError(photoError, 'That file is not a photo. Please pick a picture.');
      continue;
    }
    try {
      addPhoto(await shrinkPhoto(file));
    } catch {
      setFieldError(photoError, "That photo can't be opened here. Please try a JPG or PNG.");
    }
  }
}

function removeAllPhotos() {
  photos = [];
  if (photoError) setFieldError(photoError, '');
  showPhotos();
}

// ---------- Live camera ("Take a photo") ----------
// Laptops ignore the "use the camera" hint on file pickers, so we open the
// camera ourselves. If that isn't possible, we fall back to the file picker.

const camera = {
  dialog: document.getElementById('camera-dialog'),
  video: document.getElementById('camera-video'),
  status: document.getElementById('camera-status'),
  snap: document.getElementById('camera-snap'),
  switchButton: document.getElementById('camera-switch'),
  switchLabel: document.getElementById('camera-switch-label'),
  mirrorButton: document.getElementById('camera-mirror'),
  close: document.getElementById('camera-close'),
  stream: null,
  facing: 'environment', // back camera on phones; laptops just use their webcam
  mirror: loadCameraMirror(), // flip the picture left-right (remembered on this device)
};

function loadCameraMirror() {
  try { return localStorage.getItem('class-mood-camera-mirror') === 'on'; } catch { return false; }
}

/** Shows the Mirror and Front/Back buttons in their current state. */
function showCameraButtons() {
  camera.video.classList.toggle('is-mirrored', camera.mirror);
  camera.mirrorButton.setAttribute('aria-pressed', String(camera.mirror));
  // The button says which camera you switch TO
  camera.switchLabel.textContent = camera.facing === 'environment' ? 'Front camera' : 'Back camera';
}

function toggleMirror() {
  camera.mirror = !camera.mirror;
  try { localStorage.setItem('class-mood-camera-mirror', camera.mirror ? 'on' : 'off'); } catch { /* not saved */ }
  showCameraButtons();
}

function stopCamera() {
  if (camera.stream) camera.stream.getTracks().forEach((track) => track.stop());
  camera.stream = null;
  camera.video.srcObject = null;
  camera.snap.disabled = true;
}

async function startCamera() {
  stopCamera();
  camera.status.hidden = false;
  camera.status.textContent = 'Starting the camera…';
  try {
    camera.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: camera.facing, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    camera.video.srcObject = camera.stream;
    camera.video.play().catch(() => {}); // don't wait: "loadeddata" below says when it's ready
    // Front/Back only works with more than one camera (most laptops have just one)
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const onlyOne = devices.filter((device) => device.kind === 'videoinput').length < 2;
    camera.switchButton.disabled = onlyOne;
    camera.switchButton.title = onlyOne ? 'This device has only one camera' : '';
  } catch (error) {
    stopCamera();
    camera.status.textContent = error && error.name === 'NotAllowedError'
      ? 'The camera is blocked. Allow the camera for this website (the icon next to the address bar), or choose a photo instead.'
      : "We couldn't open a camera on this device. You can choose a photo instead.";
  }
}

function openCamera() {
  setFieldError(photoError, '');
  // No camera support at all (or no dialog support)? Use the phone's own camera picker.
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !camera.dialog.showModal) {
    document.getElementById('photo-camera').click();
    return;
  }
  showCameraButtons();
  camera.dialog.showModal();
  startCamera();
}

function snapPhoto() {
  const { videoWidth: width, videoHeight: height } = camera.video;
  if (!width || !height) return;
  addPhoto(toSmallJpeg(camera.video, width, height, camera.mirror)); // saved exactly as the preview looks
  closeCamera();
}

/** Turns the camera off right away and closes the window. */
function closeCamera() {
  stopCamera();
  if (camera.dialog.open) camera.dialog.close();
}

if (camera.dialog) {
  camera.snap.addEventListener('click', snapPhoto);
  camera.close.addEventListener('click', closeCamera);
  camera.switchButton.addEventListener('click', () => {
    camera.facing = camera.facing === 'environment' ? 'user' : 'environment';
    showCameraButtons();
    startCamera();
  });
  camera.mirrorButton.addEventListener('click', toggleMirror);
  // However the window closes (Snap, ✕, Esc), turn the camera off
  camera.dialog.addEventListener('close', stopCamera);
  // The first picture from the camera has arrived: ready to snap
  camera.video.addEventListener('loadeddata', () => {
    if (!camera.stream) return;
    camera.status.hidden = true;
    camera.snap.disabled = false;
  });
}

// ---------- Counters and errors ----------

/** Updates a "12 / 80" counter and colours it when the text gets long. */
function updateCounter(field, counter, max) {
  const used = field.value.length;
  counter.textContent = `${used} / ${max}`;
  counter.classList.toggle('is-near-limit', used >= max * 0.85 && used < max);
  counter.classList.toggle('is-at-limit', used >= max);
}

function updateAllCounters() {
  updateCounter(whatInput, whatCounter, LIMITS.whatHappened);
  updateCounter(commentInput, commentCounter, LIMITS.comment);
}

/** Shows (or clears, with an empty message) the error under one field. */
function setFieldError(errorElement, message, field) {
  errorElement.textContent = message;
  if (field) field.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function clearAllErrors() {
  setFieldError(moodError, '');
  setFieldError(whatError, '', whatInput);
  setFieldError(commentError, '', commentInput);
  showStatus('');
}

/** Shows a message above the button. type: 'error' or '' */
function showStatus(message, type = '') {
  formStatus.textContent = message;
  formStatus.classList.toggle('is-error', type === 'error');
}

// ---------- Checking the form ----------

/**
 * Checks the form. Returns the clean entry, or null (and shows errors)
 * when something is missing.
 */
function validateForm() {
  clearAllErrors();

  const mood = getSelectedMood();
  const whatHappened = whatInput.value.trim();
  const comment = commentInput.value.trim();
  let firstProblem = null;

  if (mood === null) {
    setFieldError(moodError, 'Pick the face that matches how you felt 🙂');
    firstProblem = firstProblem || moodInputs[0];
  }

  if (!whatHappened) {
    setFieldError(whatError, 'Write a few words about what happened (or tap a quick pick).', whatInput);
    firstProblem = firstProblem || whatInput;
  } else if (whatHappened.length > LIMITS.whatHappened) {
    setFieldError(whatError, `Please keep it under ${LIMITS.whatHappened} characters.`, whatInput);
    firstProblem = firstProblem || whatInput;
  }

  if (comment.length > LIMITS.comment) {
    setFieldError(commentError, `Please keep it under ${LIMITS.comment} characters.`, commentInput);
    firstProblem = firstProblem || commentInput;
  }

  // Picked "My name" but left the box empty? Ask, instead of silently posting anonymously.
  const nameChoice = window.MoodSettings.getNameSettings();
  if (nameChoice.identity === 'named' && !nameChoice.name) {
    postingHint.textContent = 'Type your name, or switch to Anonymous.';
    postingHint.classList.add('is-error');
    firstProblem = firstProblem || nameInput;
  }

  if (firstProblem) {
    firstProblem.focus();
    return null;
  }

  const entry = { mood, whatHappened, comment };
  const identity = window.MoodSettings.getIdentity();
  if (!identity.anonymous) entry.name = identity.name; // only sent if the student chose it
  if (photos.length) entry.photos = [...photos];
  return entry;
}

// ---------- Sending ----------

/** Sends one entry to our server. Throws an error with .status when it fails. */
async function sendEntry(entry) {
  const response = await MoodApi.fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(entry),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    const error = new Error(data.error || `The server answered with code ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return data;
}

/** Turns any error into a gentle message for the student. */
function friendlyErrorMessage(error) {
  if (error instanceof TypeError) {
    // fetch() throws a TypeError when the server can't be reached at all
    return "We couldn't reach the server. Check your internet (or that the server is running) and try again. 🌧";
  }
  if (error.status === 400 || error.status === 423) return error.message;
  if (error.status === 429) return 'Whoa, so many notes! Please wait a minute and try again. ⏳';
  return `Oops, our paper airplane crashed. ${error.message} Please try again in a moment.`;
}

/** Disables the button while sending, so a note can't be sent twice. */
function setSending(sending) {
  isSending = sending;
  submitButton.disabled = sending;
  submitButton.setAttribute('aria-busy', String(sending));
  submitLabel.textContent = sending ? 'Sending…' : 'Send my feeling';
}

async function handleSubmit(event) {
  event.preventDefault();
  if (isSending) return;

  const entry = validateForm();
  if (!entry) return;

  setSending(true);
  try {
    const result = await sendEntry(entry);
    resetForm();
    showThankYou(Boolean(result.entry && result.entry.pending));
    // Tell the journey map on the same page (home page) to show the new note
    document.dispatchEvent(new CustomEvent('moodentrysent', { detail: result.entry }));
  } catch (error) {
    console.error('Could not send entry:', error);
    showStatus(friendlyErrorMessage(error), 'error');
  } finally {
    setSending(false);
  }
}

// ---------- After sending ----------

function resetForm() {
  form.reset();
  removeAllPhotos();
  clearAllErrors();
  highlightSelectedMood();
  updateAllCounters();
}

/** waitingForReview: the admin checks notes first, so it isn't on the map yet. */
function showThankYou(waitingForReview = false) {
  const index = Math.floor(Math.random() * THANK_YOU_MESSAGES.length);
  thankYouMessage.textContent = waitingForReview
    ? 'Got it! Your note will appear on the Class moods page after the admin has checked it.'
    : THANK_YOU_MESSAGES[index];
  form.hidden = true;
  thankYouBox.hidden = false;
  thankYouBox.focus();
}

function showFormAgain() {
  thankYouBox.hidden = true;
  form.hidden = false;
  moodInputs[0].focus();
}

// ---------- Wiring everything up ----------

moodInputs.forEach((input) => {
  input.addEventListener('change', () => {
    highlightSelectedMood();
    setFieldError(moodError, '');
  });
});

whatInput.addEventListener('input', () => {
  updateCounter(whatInput, whatCounter, LIMITS.whatHappened);
  if (whatInput.value.trim()) setFieldError(whatError, '', whatInput);
});

// Quick picks fill in "What happened?" with one tap
quickPicks.forEach((button) => {
  button.addEventListener('click', () => {
    whatInput.value = button.textContent.trim();
    whatInput.dispatchEvent(new Event('input', { bubbles: true }));
    whatInput.focus();
  });
});

commentInput.addEventListener('input', () => {
  updateCounter(commentInput, commentCounter, LIMITS.comment);
});

// "Posting as" switch + name box
identityButtons.forEach((button) => {
  button.addEventListener('click', () => chooseIdentity(button.dataset.identity));
});
nameInput.addEventListener('input', () => window.MoodSettings.setName(nameInput.value));
nameInput.addEventListener('blur', showIdentity); // tidy the box (trimmed name) when leaving it

// Photo buttons (photos need the Google Sheet version of the site, not the local server)
if (photoField && window.MoodApi.usesSheet) {
  photoField.hidden = false;
  photoInputs.forEach((input) => input.addEventListener('change', handlePhotoChosen));
  document.getElementById('photo-camera-btn').addEventListener('click', openCamera);
}

form.addEventListener('submit', handleSubmit);
againButton.addEventListener('click', showFormAgain);
document.addEventListener('moodsettingschange', showIdentity);

/** If the admin paused check-ins, say so right away (the server refuses notes anyway). */
async function showPausedMessage() {
  try {
    const status = await MoodApi.fetch('/api/status', { cache: 'no-store' }).then((response) => response.json());
    if (status.paused) {
      showStatus('Check-ins are paused by the admin right now. Please come back a bit later! ⏸', 'error');
    }
    // "Check photos first" is on: say so under the photo buttons
    const photoHint = document.getElementById('photo-hint');
    if (photoHint && status.approvePhotos) {
      photoHint.textContent = "Photos are checked by an admin before they appear. Please don't post photos of classmates without asking them first.";
    }
  } catch {
    // No status? No problem: sending will still tell the student.
  }
}

// The browser may restore old values after "Back", so sync the looks once at start.
highlightSelectedMood();
updateAllCounters();
showIdentity();
showPausedMessage();
