/* =====================================================================
   Class Mood Journey — api.js
   One place that talks to the "backend". Two ways to run the site:

   1. GitHub Pages (or any free static host): site-config.js has your
      Google Apps Script URL -> the pages talk straight to the Sheet.
   2. On your own computer with `npm start`: site-config.js is empty
      -> the pages talk to server.js (/api/...), like before.

   The other scripts just call MoodApi.fetch('/api/...') like normal
   fetch(); this file turns that into the right Apps Script call.
   ===================================================================== */

'use strict';

(function setUpApi(root) {
  const config = root.MOOD_CONFIG || {};
  const SCRIPT_URL = typeof config.appsScriptUrl === 'string' ? config.appsScriptUrl.trim() : '';
  const TOKEN_KEY = 'mood_admin_token';

  // ---------- The admin's login token (only used with Apps Script) ----------
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }
  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* private window: login lasts until the page closes */ }
  }

  /** Something that looks enough like a fetch() Response for our pages. */
  function answer(data) {
    const status = data && data.ok ? 200 : Number(data && data.code) || 500;
    return { ok: status < 400, status, json: async () => data };
  }

  async function getScript(action) {
    const response = await fetch(`${SCRIPT_URL}?action=${encodeURIComponent(action)}`, { cache: 'no-store' });
    return response.json();
  }

  /**
   * POST as plain text: the browser then sends it straight away without a
   * "preflight" check, which Apps Script can't answer.
   */
  async function postScript(body) {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  async function adminPost(action, extra) {
    const data = await postScript({ action, token: getToken(), ...extra });
    if (data && data.code === 401) setToken('');
    return data;
  }

  /** Turns an old server address (/api/...) into an Apps Script call. */
  async function callScript(path, method, body) {
    const note = path.match(/^\/api\/admin\/notes\/([^/]+)$/);
    const pile = path.match(/^\/api\/admin\/piles\/([^/]+)$/);

    if (path === '/api/entries' && method === 'GET') return getScript('entries');
    if (path === '/api/entries' && method === 'POST') return postScript({ ...body, action: 'submit' });
    if (path === '/api/status') return getScript('status');

    if (path === '/api/admin/login') {
      const data = await postScript({ action: 'login', password: body && body.password });
      if (data.ok) setToken(data.token);
      return { ok: data.ok, admin: data.ok, code: data.code, error: data.error };
    }
    if (path === '/api/admin/logout') {
      const token = getToken();
      setToken('');
      if (token) await postScript({ action: 'logout', token }).catch(() => {});
      return { ok: true, admin: false };
    }
    if (path === '/api/admin/session') {
      if (!getToken()) return { ok: true, admin: false, configured: true }; // no need to ask Google
      const data = await adminPost('session');
      return { ok: true, admin: Boolean(data.ok), configured: data.code !== 503 };
    }
    if (path === '/api/admin/state') return adminPost('state');
    if (path === '/api/admin/settings') return adminPost('settings', body);
    if (path === '/api/admin/piles' && method === 'POST') return adminPost('createPile', body);
    if (note && method === 'PATCH') return adminPost('updateNote', { id: decodeURIComponent(note[1]), changes: body });
    if (note && method === 'DELETE') return adminPost('deleteNote', { id: decodeURIComponent(note[1]) });
    if (pile && method === 'PATCH') return adminPost('updatePile', { ...body, id: decodeURIComponent(pile[1]) });
    if (pile && method === 'DELETE') return adminPost('deletePile', { id: decodeURIComponent(pile[1]) });
    return { ok: false, code: 404, error: 'Unknown API address.' };
  }

  /**
   * Use like fetch('/api/...', { method, body }). `body` may be a JSON
   * string (like fetch) or a plain object.
   */
  async function apiFetch(path, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    let body = init.body;
    if (!SCRIPT_URL) {
      const headers = { ...(init.headers || {}) };
      if (body && typeof body !== 'string') body = JSON.stringify(body);
      if (body) headers['Content-Type'] = 'application/json';
      return fetch(path, { method, headers, body, cache: 'no-store' });
    }
    if (typeof body === 'string') body = JSON.parse(body);
    return answer(await callScript(path, method, body));
  }

  /**
   * Where a note's photo can be seen. The Sheet only stores the Google Drive
   * file id; anything that doesn't look like one is ignored.
   */
  function photoUrl(fileId, width = 1000) {
    if (typeof fileId !== 'string' || !/^[\w-]{20,100}$/.test(fileId)) return '';
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
  }

  /** A note's photo addresses (notes can have up to 5; older notes have one "photo"). */
  function photoUrls(entry, width) {
    const ids = Array.isArray(entry && entry.photos) ? entry.photos : [entry && entry.photo];
    return ids.map((id) => photoUrl(id, width)).filter(Boolean).slice(0, 5);
  }

  root.MoodApi = {
    fetch: apiFetch,
    photoUrl,
    photoUrls,
    usesSheet: Boolean(SCRIPT_URL),
  };
})(typeof self !== 'undefined' ? self : this);
