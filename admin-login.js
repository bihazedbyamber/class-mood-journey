/* =====================================================================
   Class Mood Journey — admin-login.js
   The 🔒 "Admin" button in the top bar (index.html + journey.html).
     - Not logged in: opens a small password box. Correct password
       -> the server sets a login cookie -> we go to admin.html.
     - Already logged in: the button says "Admin desk" and goes straight there.
   The password is only ever checked by the server, never in this file.
   ===================================================================== */

'use strict';

(function setUpAdminLogin() {
  const button = document.querySelector('[data-admin-button]');
  const dialog = document.getElementById('admin-dialog');
  if (!button || !dialog) return;

  const label = button.querySelector('.admin-link__label');
  const form = document.getElementById('admin-login-form');
  const passwordInput = document.getElementById('admin-password');
  const errorText = document.getElementById('admin-login-error');
  const submitButton = form.querySelector('button[type="submit"]');
  let isAdmin = false;

  /** Asks the server whether this browser is already logged in. */
  async function checkSession() {
    try {
      const response = await fetch('/api/admin/session', { cache: 'no-store' });
      const data = await response.json();
      isAdmin = Boolean(data.admin);
    } catch {
      isAdmin = false;
    }
    label.textContent = isAdmin ? 'Admin desk' : 'Admin';
    button.classList.toggle('is-admin', isAdmin);
  }

  function openLogin() {
    errorText.textContent = '';
    passwordInput.value = '';
    dialog.showModal();
    passwordInput.focus();
  }

  async function logIn(event) {
    event.preventDefault();
    const password = passwordInput.value;
    if (!password) {
      errorText.textContent = 'Type the admin password.';
      passwordInput.focus();
      return;
    }

    submitButton.disabled = true;
    errorText.textContent = '';
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not log in.');
      window.location.href = 'admin.html';
    } catch (error) {
      errorText.textContent = error instanceof TypeError
        ? "Couldn't reach the server. Is it running?"
        : error.message;
      passwordInput.select();
    } finally {
      submitButton.disabled = false;
    }
  }

  button.addEventListener('click', () => {
    if (isAdmin) window.location.href = 'admin.html';
    else openLogin();
  });
  form.addEventListener('submit', logIn);
  dialog.querySelectorAll('[data-close-dialog]').forEach((closeButton) => {
    closeButton.addEventListener('click', () => dialog.close());
  });
  // Clicking the dark area around the box closes it
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  checkSession();
})();
