/* =====================================================================
   Class Mood Journey — account.js
   "Sign in with Google" + a username, so people can comment on notes.
     - A 👤 button in the top bar: "Sign in", or "@username" when signed in.
     - Google only tells us "this is the same person as last time"; we never
       save or show the email or real name. Only the username is public.
     - The sign-in lasts 30 days on this device (a signed key from the
       Apps Script, kept in localStorage).
   Notes themselves stay anonymous.

   Other scripts use:
     MoodAccount.user               -> { username, token } or null
     MoodAccount.requireUsername()  -> Promise: resolves once signed in with a username
     document event "moodaccountchange"
   ===================================================================== */

'use strict';

window.MoodAccount = (function createAccount() {
  const STORAGE_KEY = 'class-mood-account';
  const config = window.MOOD_CONFIG || {};
  const CLIENT_ID = config.googleClientId || '';
  const FAKE = Boolean(config.fakeGoogleForTests); // only on the test copy on this computer

  let account = load(); // { token, username, exp }
  let dialogs = null;
  let waiting = [];     // requireUsername() promises waiting for a username
  let gsiPromise = null;

  function enabled() {
    return Boolean(window.MoodApi && MoodApi.usesSheet && (CLIENT_ID || FAKE));
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return saved && saved.token && saved.exp > Date.now() ? saved : null;
    } catch {
      return null;
    }
  }

  function save(next) {
    account = next;
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* private window: signed in until the page closes */ }
    updateButton();
    document.dispatchEvent(new CustomEvent('moodaccountchange', { detail: getUser() }));
    if (next && next.username) {
      waiting.forEach((resolve) => resolve(getUser()));
      waiting = [];
    }
  }

  function getUser() {
    return account && account.username ? { username: account.username, token: account.token } : null;
  }

  // ---------- Small DOM helpers ----------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function closeButton(dialog) {
    const button = el('button', 'settings__close');
    button.type = 'button';
    button.setAttribute('aria-label', 'Close');
    button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
    button.addEventListener('click', () => dialog.close());
    return button;
  }

  function makeDialog(id, title) {
    const dialog = el('dialog', 'settings account-dialog');
    dialog.id = id;
    const box = el('div', 'settings__form');
    const head = el('div', 'settings__head');
    const h2 = el('h2', 'settings__title', title);
    h2.id = `${id}-title`;
    dialog.setAttribute('aria-labelledby', h2.id);
    head.append(h2, closeButton(dialog));
    box.append(head);
    dialog.append(box);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    document.body.append(dialog);
    return { dialog, box };
  }

  /** Builds the three windows once: sign in, pick a username, account menu. */
  function buildDialogs() {
    if (dialogs) return dialogs;

    // 1. Sign in
    const signIn = makeDialog('signin-dialog', 'Sign in to comment');
    signIn.box.append(
      el('p', 'settings__hint', 'Sign in with your Google account, then pick a username. Only your username is shown on the site. Your email and name are never saved or shown.'),
    );
    const gsiSlot = el('div', 'gsi-slot');
    const signInError = el('p', 'settings__hint is-warning');
    signInError.setAttribute('aria-live', 'polite');
    signIn.box.append(gsiSlot, signInError);
    if (FAKE) { // test copy only: pretend Google
      const fake = el('button', 'btn', 'Test sign-in (this computer only)');
      fake.type = 'button';
      fake.addEventListener('click', () => {
        const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const sub = String(Math.floor(Math.random() * 1e9));
        handleCredential({ credential: `h.${b64({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub, exp: Math.floor(Date.now() / 1000) + 3600 })}.s` });
      });
      signIn.box.append(fake);
    }

    // 2. Pick a username
    const name = makeDialog('username-dialog', 'Pick a username');
    const form = el('form', 'account-form');
    form.noValidate = true;
    const label = el('label', 'settings__label', 'Username');
    label.htmlFor = 'username-input';
    const input = el('input', 'input');
    input.id = 'username-input';
    input.maxLength = 20;
    input.autocomplete = 'nickname';
    input.placeholder = `e.g. ${window.MoodNames ? MoodNames.username() : 'akbar'}`;
    input.setAttribute('aria-describedby', 'username-hint username-error');
    const hint = el('p', 'settings__hint', '3 to 20 letters, numbers, _ or . Everyone can see it next to your comments.');
    hint.id = 'username-hint';
    const nameError = el('p', 'settings__hint is-warning');
    nameError.id = 'username-error';
    nameError.setAttribute('aria-live', 'polite');
    const saveButton = el('button', 'btn btn--primary', 'Save username');
    saveButton.type = 'submit';
    form.append(label, input, hint, nameError, saveButton);
    name.box.append(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      nameError.textContent = '';
      saveButton.disabled = true;
      try {
        const data = await MoodApi.script('setUsername', { userToken: account && account.token, username: input.value.trim() });
        save({ ...account, username: data.username });
        name.dialog.close();
      } catch (error) {
        if (error.code === 401) { save(null); name.dialog.close(); openSignIn(); return; }
        nameError.textContent = error.message;
        input.focus();
      } finally {
        saveButton.disabled = false;
      }
    });

    // 3. Account menu (signed in)
    const menu = makeDialog('account-dialog', 'Your account');
    const who = el('p', 'account-who');
    const profile = el('a', 'btn btn--primary', 'My profile');
    profile.href = 'profile.html';
    const change = el('button', 'btn', 'Change username');
    change.type = 'button';
    change.addEventListener('click', () => { menu.dialog.close(); openUsername(); });
    const out = el('button', 'btn btn--danger', 'Sign out');
    out.type = 'button';
    out.addEventListener('click', () => {
      save(null);
      if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
      menu.dialog.close();
    });
    const actions = el('div', 'settings__foot account-actions');
    actions.append(profile, change, out);
    menu.box.append(who, actions);

    dialogs = { signIn, gsiSlot, signInError, name, input, nameError, menu, who };
    return dialogs;
  }

  // ---------- Google Identity Services ----------

  function loadGsi() {
    if (FAKE) return Promise.resolve(null);
    if (gsiPromise) return gsiPromise;
    gsiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => {
        google.accounts.id.initialize({ client_id: CLIENT_ID, callback: handleCredential, ux_mode: 'popup', auto_select: false });
        resolve(google.accounts.id);
      };
      script.onerror = () => { gsiPromise = null; reject(new Error('Google sign-in could not load. Check your internet and try again.')); };
      document.head.append(script);
    });
    return gsiPromise;
  }

  async function handleCredential(response) {
    const d = buildDialogs();
    d.signInError.textContent = 'Signing in…';
    try {
      const data = await MoodApi.script('googleLogin', { credential: response.credential });
      save({ token: data.token, username: data.username || '', exp: Date.now() + 29 * 24 * 60 * 60 * 1000 });
      d.signInError.textContent = '';
      d.signIn.dialog.close();
      if (!data.username) openUsername();
    } catch (error) {
      d.signInError.textContent = error.message;
    }
  }

  // ---------- Opening the windows ----------

  async function openSignIn() {
    if (!enabled()) return;
    const d = buildDialogs();
    d.signInError.textContent = '';
    if (!d.signIn.dialog.open) d.signIn.dialog.showModal();
    if (FAKE) return;
    try {
      const gsi = await loadGsi();
      d.gsiSlot.replaceChildren();
      gsi.renderButton(d.gsiSlot, {
        theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with',
        locale: window.MoodI18n ? MoodI18n.lang : 'en', width: 260,
      });
    } catch (error) {
      d.signInError.textContent = error.message;
    }
  }

  function openUsername() {
    const d = buildDialogs();
    if (window.MoodNames) d.input.placeholder = `e.g. ${MoodNames.username()}`; // a new example each time
    d.input.value = account && account.username ? account.username : '';
    d.nameError.textContent = '';
    if (!d.name.dialog.open) d.name.dialog.showModal();
    d.input.focus();
  }

  function openMenu() {
    const d = buildDialogs();
    d.who.textContent = `@${account.username}`;
    if (!d.menu.dialog.open) d.menu.dialog.showModal();
  }

  /** Resolves with the user once they are signed in and have a username. */
  function requireUsername() {
    const user = getUser();
    if (user) return Promise.resolve(user);
    return new Promise((resolve) => {
      waiting.push(resolve);
      if (account && account.token) openUsername();
      else openSignIn();
    });
  }

  /** The server said the key ran out: sign out quietly. */
  function expired() {
    save(null);
  }

  // ---------- The top-bar button ----------

  let button = null;

  function updateButton() {
    if (!button) return;
    const label = button.querySelector('.account-link__label');
    const user = getUser();
    label.textContent = user ? `@${user.username}` : 'Sign in';
    button.classList.toggle('is-signed-in', Boolean(user));
    button.title = user ? 'Your account' : 'Sign in with Google to comment';
  }

  function addButton() {
    const tools = document.querySelector('.topbar__tools');
    if (!tools || !enabled() || tools.querySelector('.account-link')) return;
    button = el('button', 'pill-link account-link');
    button.type = 'button';
    button.innerHTML = '<svg class="account-link__icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    button.append(el('span', 'account-link__label'));
    button.addEventListener('click', () => {
      if (getUser()) openMenu();
      else if (account && account.token) openUsername();
      else openSignIn();
    });
    const admin = tools.querySelector('[data-admin-button], #logout-btn');
    tools.insertBefore(button, admin || null);
    updateButton();
  }

  document.addEventListener('DOMContentLoaded', addButton);

  /** The small "verified" badge shown next to signed-in people's usernames. */
  function badge() {
    const mark = el('span', 'verified', '✓');
    mark.title = 'Verified: signed in with Google';
    mark.setAttribute('aria-label', 'Verified');
    mark.setAttribute('role', 'img');
    return mark;
  }

  return {
    get user() { return getUser(); },
    get enabled() { return enabled(); },
    requireUsername,
    openSignIn,
    openUsername,
    expired,
    badge,
  };
})();
