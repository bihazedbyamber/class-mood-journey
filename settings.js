/* =====================================================================
   Class Mood Journey — settings.js
   Everything a student can personalise, saved on THIS device only:
     - theme:    light / dark / auto (follow the device)
     - style:    "modern-2026" (default), "scribblish" or "modern-bold"
     - identity: stay anonymous, or show a name on new notes
     - censor:   cover swear words with a *censored* sticker (on by default)

   Loaded in <head> WITHOUT "defer", so theme and style are set before
   the page is drawn (no flash of the wrong look).

   Other scripts can use window.MoodSettings:
     MoodSettings.getIdentity()  -> { anonymous: true } or { anonymous: false, name: "Sam" }
     MoodSettings.faceHref(5)    -> "sprite.svg#face-modern-2026-5" (face for the current style)
     MoodSettings.updateFaces()  -> re-point all <use data-face="N"> to the current style
     MoodSettings.getNameSettings() / setIdentity('named') / setName('Sam')  (the form's switch)
   and listen for the "moodsettingschange" event on document.
   ===================================================================== */

'use strict';

/**
 * Example names for placeholders and hints ("e.g. akbar"): a different one
 * each time instead of always the same. "rehza" is kept for the site maker,
 * so it's never suggested as a username.
 */
window.MoodNames = (function createNames() {
  const NAMES = ['re.vill.ver', 'rehza', 'akbar', 'zidan', 'kiki', 'joan', 'mazaya', 'anin', 'nurul', 'falenta', 'asyafa'];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  return {
    NAMES,
    /** Any example name. */
    any: () => pick(NAMES),
    /** An example username someone could really take. */
    username: () => pick(NAMES.filter((name) => name !== 'rehza')),
  };
})();

window.MoodSettings = (function createSettings() {
  const KEYS = {
    theme: 'class-mood-theme',
    style: 'class-mood-style',
    identity: 'class-mood-identity',
    name: 'class-mood-name',
    censor: 'class-mood-censor',
  };
  const STYLES = ['modern-2026', 'scribblish', 'modern-bold'];
  const DEFAULT_STYLE = 'modern-2026'; // what a first-time visitor sees
  // Styles that no longer exist -> what visitors who had saved them get now
  const RENAMED_STYLES = { modern: 'modern-2026', 'neo-modern': 'modern-2026' };
  const THEMES = ['light', 'dark', 'auto'];
  const NAME_MAX = 24;

  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  // ---------- Saving (localStorage may be blocked, so always try/catch) ----------

  function load(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Not saved; the setting still works until the page is closed.
    }
  }

  /** Trims a name, joins repeated spaces and cuts it to NAME_MAX characters. */
  function cleanName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  }

  /** The saved style, upgraded if it was saved under an old name. */
  function loadStyle() {
    const saved = load(KEYS.style);
    const style = RENAMED_STYLES[saved] || saved;
    return STYLES.includes(style) ? style : DEFAULT_STYLE;
  }

  const settings = {
    theme: THEMES.includes(load(KEYS.theme)) ? load(KEYS.theme) : 'auto',
    style: loadStyle(),
    identity: load(KEYS.identity) === 'named' ? 'named' : 'anonymous',
    name: cleanName(load(KEYS.name)),
    censor: load(KEYS.censor) !== 'off', // ON unless the student switched it off
  };

  // ---------- Applying ----------

  function resolvedTheme() {
    if (settings.theme === 'auto') return systemDark.matches ? 'dark' : 'light';
    return settings.theme;
  }

  function applyTheme() {
    const theme = resolvedTheme();
    root.dataset.theme = theme;
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const next = theme === 'dark' ? 'light' : 'dark';
      button.setAttribute('aria-label', `Switch to ${next} mode`);
      button.title = `Switch to ${next} mode`;
    });
  }

  function faceHref(mood) {
    return `sprite.svg#face-${settings.style}-${mood}`;
  }

  /** Points every <use data-face="N"> at the face drawing for the current style. */
  function updateFaces(scope = document) {
    scope.querySelectorAll('use[data-face]').forEach((use) => {
      use.setAttribute('href', faceHref(use.dataset.face));
    });
  }

  function applyStyle() {
    root.dataset.style = settings.style;
    updateFaces();
  }

  function getIdentity() {
    if (settings.identity === 'named' && settings.name) {
      return { anonymous: false, name: settings.name };
    }
    return { anonymous: true };
  }

  /** Tells the page scripts that something changed. */
  function notify() {
    document.dispatchEvent(new CustomEvent('moodsettingschange', {
      detail: { ...settings, identity: getIdentity() },
    }));
  }

  // Apply right away, before the page is drawn
  applyTheme();
  root.dataset.style = settings.style;

  systemDark.addEventListener('change', () => {
    if (settings.theme === 'auto') {
      applyTheme();
      notify();
    }
  });

  // ---------- The settings panel ----------

  function syncPanel(dialog) {
    const form = dialog.querySelector('form');
    form.elements.identity.value = settings.identity;
    form.elements.style.value = settings.style;
    form.elements.theme.value = settings.theme;
    if (form.elements.censor) form.elements.censor.checked = settings.censor;
    const nameInput = dialog.querySelector('#settings-name');
    nameInput.value = settings.name;
    nameInput.disabled = settings.identity !== 'named';
    updateNameHint(dialog);
  }

  function updateNameHint(dialog) {
    const hint = dialog.querySelector('#settings-name-hint');
    if (settings.identity === 'named' && !settings.name) {
      hint.textContent = 'Type a name first, otherwise your notes stay anonymous.';
      hint.classList.add('is-warning');
    } else if (settings.identity === 'named') {
      hint.textContent = `New notes will say "by ${settings.name}". Notes you already sent don't change.`;
      hint.classList.remove('is-warning');
    } else {
      hint.textContent = 'No name is sent. Nobody can tell which notes are yours.';
      hint.classList.remove('is-warning');
    }
  }

  function setUpPanel() {
    const dialog = document.getElementById('settings-dialog');
    if (!dialog) return;
    const form = dialog.querySelector('form');
    const nameInput = dialog.querySelector('#settings-name');

    document.querySelectorAll('[data-open-settings]').forEach((button) => {
      button.addEventListener('click', () => {
        syncPanel(dialog);
        dialog.showModal();
      });
    });

    // Clicking the dark area around the panel closes it
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });

    form.addEventListener('change', (event) => {
      const { name, value } = event.target;
      if (name === 'identity') {
        settings.identity = value;
        save(KEYS.identity, value);
        nameInput.disabled = value !== 'named';
        if (value === 'named') nameInput.focus();
      } else if (name === 'style') {
        settings.style = value;
        save(KEYS.style, value);
        applyStyle();
      } else if (name === 'theme') {
        settings.theme = value;
        save(KEYS.theme, value);
        applyTheme();
      } else if (name === 'censor') {
        settings.censor = event.target.checked;
        save(KEYS.censor, settings.censor ? 'on' : 'off');
      } else {
        return;
      }
      updateNameHint(dialog);
      notify();
    });

    nameInput.addEventListener('input', () => {
      settings.name = cleanName(nameInput.value);
      save(KEYS.name, settings.name);
      updateNameHint(dialog);
      notify();
    });
  }

  function setUpThemeToggles() {
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        settings.theme = resolvedTheme() === 'dark' ? 'light' : 'dark';
        save(KEYS.theme, settings.theme);
        applyTheme();
        notify();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(); // gives the toggle buttons their labels
    applyStyle(); // points the faces at the right style
    setUpThemeToggles();
    setUpPanel();
  });

  // ---------- Changing the name from the page itself (the input page switch) ----------

  /** The raw choice: { identity: 'anonymous' | 'named', name: '...' } (name may be empty). */
  function getNameSettings() {
    return { identity: settings.identity, name: settings.name };
  }

  function setIdentity(value) {
    settings.identity = value === 'named' ? 'named' : 'anonymous';
    save(KEYS.identity, settings.identity);
    notify();
  }

  function setName(value) {
    settings.name = cleanName(value);
    save(KEYS.name, settings.name);
    notify();
  }

  /** Cover swear words with a *censored* sticker? (Settings → Censor, on by default) */
  function isCensorOn() {
    return settings.censor;
  }

  return { getIdentity, getNameSettings, setIdentity, setName, faceHref, updateFaces, isCensorOn, NAME_MAX };
})();
