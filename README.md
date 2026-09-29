# ✿ Class Mood Journey

An **anonymous** class mood and feedback website.

- **Home** (`index.html`): two cards with buttons (Check in, Journey map) and "What is this?".
- **Check in** (`checkin.html`): students pick a mood face (or a small **+** between two faces for "a bit of both"), say what happened in class and (optionally) add a comment. Anonymous unless they choose to add a name.
- **Journey map** (`journey.html`): every check-in becomes a sticky note on an emotional journey map, with five mood lanes from *Great* (top) to *Frustrated* (bottom). **Newest notes first**: the newest is next to **NOW** on the left, the oldest next to **START** on the right.

The top bar always shows **Home · Check in · Journey map**; the page you are on is highlighted.

Built with plain HTML, CSS and JavaScript. Two ways to run it:

- **Online for free on GitHub Pages**: the pages talk straight to a Google Apps Script that saves everything in your Google Sheet (see **5. Publish it for free**).
- **On your own computer**: a tiny Node.js server that uses **only built-in modules** (no `npm install`).

---

## Files

| File | What it does |
|---|---|
| `index.html` | Home: buttons to the check-in and the journey map + "What is this?" |
| `checkin.html` | Check-in page (the form) |
| `journey.html` | Journey map page (the sticky notes) |
| `moods.js` | The 5 moods + the 4 in-between moods (shared by the pages and the server) |
| `censor.js` | Swear-word finder (English, Indonesian, Javanese) for the *censored* stickers and the admin's blocked words |
| `style.css` | All styles: Modern 2026, Scribblish and Modern Bold, each in light + dark |
| `settings.js` | The ⚙ Settings panel: name or anonymous, style, theme (saved on each device) |
| `sprite.svg` | Shared drawings: the four sets of mood faces and the doodles |
| `admin.html` / `admin.js` | The Admin Desk: piles of sticky notes, moderation, class controls |
| `admin-login.js` | The 🔒 Admin button + password box in the top bar |
| `lib/auth.js` | Server: password hash check, login sessions, guessing protection |
| `lib/moderation.js` | Server: piles, hidden/pinned/waiting notes, blocked words (`data/admin.json`) |
| `input.js` | Form logic: mood picking, counters, checking, sending |
| `journey.js` | Map logic: loading, placing notes, arrows, big-note view, auto-refresh |
| `site-config.js` | Your Apps Script Web app URL (for GitHub Pages). Empty = use the local server |
| `api.js` | Talks to the Apps Script (GitHub Pages) or to `server.js` (local) |
| `tools/` | `make-site-config.js` (writes `site-config.js`), `build-code-gs.js` (copies `censor.js` into `Code.gs`) |
| `server.js` | Node server for running on your own computer: serves the pages + the `/api/...` addresses |
| `config.json` | Your private settings: `port`, `appsScriptUrl`, `adminPasswordHash`, `sheetSecret` (never uploaded, see `.gitignore`) |
| `config.example.json` | An empty copy of `config.json` that is safe to share |
| `render.yaml` / `package.json` | Tell Render how to run the site (no packages to install) |
| `.gitignore` | Keeps `config.json` and `data/` off GitHub |
| `data/entries.json` | Saved entries in local mode (starts with demo entries) |
| `apps-script/Code.gs` | Google Apps Script: the whole backend for GitHub Pages (notes, admin login, moderation) |
