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

---

## 1. Start the server

You need [Node.js](https://nodejs.org) version 18 or newer. Open a terminal in this folder and run:

```bash
node server.js
```

Then open **http://localhost:3000** in your browser.

- Home: http://localhost:3000/
- Check-in page: http://localhost:3000/checkin.html
- Journey map: http://localhost:3000/journey.html

Stop the server with **Ctrl + C**.

> **Want classmates on the same Wi-Fi to use it?** Add `"host": "0.0.0.0"` to `config.json`, restart, and share `http://<your-computer's-IP>:3000`. (Windows may ask to allow Node.js through the firewall.)

### Settings (the ⚙ button)

Every student can open **Settings** on either page:

- **Your name**: *Stay anonymous* (the default) or *Show my name*. A name is only added to notes sent **after** switching it on, and it's shown as a small tag on the sticky note. The same choice is also right in the form: the **Posting as [Anonymous | My name]** switch above the send button (picking *My name* opens a name box).
- **Style**:
  - *Modern 2026* (what first-time visitors see): a lined-paper sheet on a grey grid desk, pixel titles in a red hand-drawn frame, mono labels, washi tape, torn-paper tags and pixel-art faces
  - *Scribblish*: friendly pastel notebook doodles
  - *Modern Bold*: a zine collage with grainy paper, huge condensed headlines, lime marker scribbles, pastel colour blocks, polaroids and grey tape
- **Theme**: Light, Dark, or follow the device. The 🌙/☀ button next to ⚙ switches quickly.
- **Censor**: *Hide swear words* (on by default). Swear words on the journey map are covered with a **\*censored\*** sticker. Switch it off to see the real text.

Settings are saved in the browser of that device only (nothing is sent to the server except the name on a note).

### In-between moods (the small + buttons)

Between each pair of faces there is a small, almost hidden **+**. It means "a bit of both":

| + between | Name (admin only) | Value |
|---|---|---|
| Great and Good | Cheerful | 4.5 |
| Good and Okay | Chill | 3.5 |
| Okay and Bad | Meh | 2.5 |
| Bad and Frustrated | Stressed | 1.5 |

On the journey map these are **not** a new lane: the note sits on the line between its two lanes, in both colours, and it shows up under both mood filters. The big note says e.g. "Great + Good". The Admin Desk shows them as their own emotion (Cheerful, Chill, Meh, Stressed), with their own bar in the numbers.

### The censor (*censored* stickers)

`censor.js` finds swear words in **English, Indonesian and Javanese** and covers them with a sticker. It sees through the usual tricks:

| Trick | Example |
|---|---|
| numbers and symbols as letters | `c0ck`, `k0nt0l`, `4njing`, `$hit` |
| look-alike spellings | `fvck`, `phuck`, Cyrillic `с` instead of `c` |
| stretched letters | `fuuuuck`, `anjiiing` |
| dots, dashes, spaces | `f.u.c.k`, `f-u-c-k`, `f u c k`, `kon tol` |
| stars as hidden letters | `f*ck`, `sh*t`, `k*nt*l` |
| endings and prefixes | `fucking`, `kontolmu`, `anjingnya`, `dientot` |
| hidden inside longer words | `motherfucker`, `dasarkontol` |

Normal words that only *look* similar are left alone, for example *cook*, *classic*, *pantai*, *asuransi*, *celengan*, *bang ke mana*, *terima kasih*.

Where the words come from (hand-picked for a school; innocent words and biology words from those lists were left out):

- English: [List of Dirty, Naughty, Obscene and Otherwise Bad Words](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words)
- Indonesian: [LDNOOBW V2 (`data/id.txt`, CC0)](https://github.com/LDNOOBWV2/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words_V2) and [Daftar Kata-kata Kasar Bahasa Indonesia](https://gist.github.com/mizwardomlank/9627ea0670c3826a42bf68a5254b0919)
- Javanese: words described in research on Javanese swearing, e.g. [Abusive Swearing Variations in the Temanggung Javanese Dialect](https://www.researchgate.net/publication/347651033_Abusive_Swearing_Variations_in_the_Temanggung_Javanese_Dialect_Type_and_Social_Reality) and [Javanese and Sundanese Swear Words in the Film Yowis Ben 2](https://ejournal.umm.ac.id/index.php/kembara/article/view/25194), plus common variants

To add or remove a word, edit the `ENGLISH`, `INDONESIAN` or `JAVANESE` lists at the top of `censor.js`.

### Admin (the 🔒 button)

Click **🔒 Admin** in the top bar and type the admin password (no email needed). You land on the **Admin Desk** (`/admin.html`):

- **Piles**: notes are shown as stacks of sticky notes. *Inbox* holds everything that isn't sorted yet. Add your own piles (e.g. *To discuss*, *Done*), then **drag a note onto a pile** or use its **Move to** menu (easier on phones). Click a pile to spread its notes out; rename or delete a pile (its notes go back to the Inbox).
- **Per note**: **Pin** (it gets a red pin on the journey map), **Hide / Show** (hidden notes disappear from the public map), **Delete** (gone for good), **Approve** (for notes waiting for review).
- **Hide straight from the journey map**: while logged in as admin, open any note on the journey map. The big note gets an **Admin** bar with **Hide from map**. The note disappears for everyone at once; show it again from the Admin desk (**Hidden** tab).
- **Numbers**: total notes, notes today, notes waiting, hidden notes, and a bar per mood (including the in-between moods).
- **Swear words badge**: notes with swear words get a badge. The admin always sees the real, uncensored text.
- **Class controls**:
  - *Pause check-ins*: nobody can send notes until you switch it off.
  - *Check new notes first*: new notes wait in **Need review** and only appear on the map after you approve them.
  - *Blocked words*: notes (and names) containing these words are **refused completely**. The list starts empty, because swear words are already covered by the censor stickers. Use it for things like a classmate's name that is being used for teasing. It uses the same trick-proof matching as the censor (so `@syafa` or `a s y a f a` is caught too).
  - *Download all notes (CSV)*: opens nicely in Excel or Google Sheets.

Your decisions are saved in `data/admin.json`.

**Change the admin password.** Only a scrambled version (a *hash*) of the password is stored, in `config.json` as `adminPasswordHash`, so even someone who reads the files can't see the password. To set a new one:

```bash
node server.js --set-admin-password "your new password"
```

Then restart the server. (On a hosting site you can instead set the `ADMIN_PASSWORD_HASH` environment variable to the value from `config.json`.)

How the login stays safe:

- The password is checked by the server only; it is never inside the website's JavaScript.
- After logging in, the browser gets an `HttpOnly` + `SameSite=Strict` cookie (scripts can't read it, other sites can't use it). It lasts 8 hours; restarting the server logs everyone out.
- After 5 wrong passwords, that computer must wait 5 minutes.

> In Google Sheets mode, *Delete* removes the note from the website but not from the Sheet (delete the row there yourself if you want). Also add a 6th column **Id** to the header row and redeploy the new `Code.gs` (with a **new version**), so each note keeps a fixed id and in-between moods (4.5, 3.5, 2.5, 1.5) are accepted.

### How storage works

`config.json` decides where entries are saved:

- **Local mode** (default, when `appsScriptUrl` is empty): entries go into `data/entries.json`. The journey page shows a yellow badge: *Saving locally*.
- **Google Sheets mode** (when `appsScriptUrl` is filled in): the server passes every request on to your Google Apps Script, which reads and writes your Google Sheet. The badge turns green: *Connected to Google Sheets*.

The browser only ever talks to our own server, so there are no CORS problems.

---

## 2. Switch to Google Sheets mode

### a. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a **blank spreadsheet** (name it e.g. *Class Mood Journey*).
2. In the **first tab**, type this header row in row 1:

   | A | B | C | D | E | F |
   |---|---|---|---|---|---|
   | Timestamp | Mood | WhatHappened | Comment | Name | Id |

   (*Name* stays empty for anonymous notes. *Id* is filled in automatically.)

   (If you forget, the script adds it for you on the first entry.)

### b. Add the Apps Script

1. In the sheet, click **Extensions → Apps Script**.
2. Delete the example code in `Code.gs`.
3. Open `apps-script/Code.gs` from this project, copy **everything**, and paste it in.
4. Click the **Save** icon (💾).

### c. Deploy it as a Web app

1. Click the blue **Deploy** button (top right) → **New deployment**.
2. Click the gear ⚙ next to *Select type* → choose **Web app**.
3. Fill in:
   - *Description*: `Class Mood Journey`
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
4. Click **Deploy**.
5. Google asks for permission: click **Authorize access**, choose your Google account.
   If you see *"Google hasn't verified this app"*, click **Advanced → Go to (your project name) (unsafe)** → **Allow**. This is normal for your own scripts.
6. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfy.../exec`.

   ✅ Quick check: open that URL in your browser. You should see something like `{"ok":true,"entries":[]}`.

### d. Connect the server

1. Open `config.json` and paste the URL:

   ```json
   {
     "port": 3000,
     "appsScriptUrl": "https://script.google.com/macros/s/AKfy.../exec"
   }
   ```

2. Stop the server (**Ctrl + C**) and start it again with `node server.js`.
3. Open the journey page. The badge should say **Connected to Google Sheets**. Send a test check-in and watch a new row appear in the sheet! 🎉

> The demo entries live in `data/entries.json`, so they don't show up in Sheets mode. The sheet starts empty.

---

## 3. Changed Code.gs? Redeploy with a NEW VERSION

This is the most common beginner mistake: **saving the script is not enough.** The web app URL keeps running the old version until you publish a new version.

1. In Apps Script, click **Deploy → Manage deployments**.
2. Select your deployment and click the **pencil ✏ (Edit)** icon.
3. Under *Version*, choose **New version**.
4. Click **Deploy**.

This keeps the **same URL**, so you don't need to change `config.json`.

> ⚠ Don't use *Deploy → New deployment* for updates. That creates a **new URL**, and you would have to paste it into `config.json` again.

---

## 4. Remove the demo entries

The sample notes in `data/entries.json` each have `"demo": true` and an id starting with `demo-`. On the map they show a small *demo* tag.

- **Remove all entries (demo and real):** replace the whole content of `data/entries.json` with:

  ```json
  []
  ```

- **Remove only the demo entries:** delete each `{ ... }` block that contains `"demo": true` (watch the commas between blocks).

The journey page picks up the change on its next refresh (at most 30 seconds). No restart needed.

---

## 5. Publish it for free (GitHub Pages, no credit card)

On GitHub Pages the website talks **straight to your Google Apps Script**, with no Node server in between. Everything the server did (checking notes, admin login, hide/pin/delete, piles, blocked words, pause, review) now happens inside `apps-script/Code.gs`.

Your link will look like: **`https://<your-github-name>.github.io/class-mood-journey/`**

### Step A. Update the script in your Google Sheet

1. Open your Sheet → **Extensions → Apps Script**.
2. Click in `Code.gs` → **Ctrl + A** → **Delete**. Open `apps-script/Code.gs` from this project, copy **everything** (it is long: the censor is at the bottom), paste it in → **Save** 💾.
3. Click ⚙ **Project Settings** (left side) → scroll to **Script properties** → **Add script property**:
   - Property: `ADMIN_PASSWORD`
   - Value: the admin password you want (type it yourself)

   → **Save script properties**. Only you (the Sheet owner) can see this. (You can delete an old `ADMIN_SECRET` property; it's not used any more.)
4. **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy.** The URL stays the same.

   ✅ Quick check: open the Web app URL. You should see `{"ok":true,"mode":"sheets","entries":[...],...}`.

### Step B. Point the website at the script

`site-config.js` holds the Web app URL (it's already filled in from your `config.json`). To change it:

```bash
node tools/make-site-config.js https://script.google.com/macros/s/AKfy.../exec
```

This URL isn't a secret: visitors' browsers need it to save notes. Your password and the Sheet stay private.

### Step C. Upload and switch on GitHub Pages

1. In **GitHub Desktop**: write a summary (e.g. `GitHub Pages version`) → **Commit to main** → **Push origin**.
2. On github.com open your repo → **Settings** → **General** → scroll down to **Danger Zone** → **Change visibility** → **Make public**. (Free GitHub Pages only works for public repos. `config.json` and `data/` are never uploaded.)
3. Repo **Settings → Pages** → *Source*: **Deploy from a branch** → Branch: **main**, folder **/ (root)** → **Save**.
4. Wait 1–2 minutes and refresh that page. It shows **"Your site is live at …"**. That's your link! 🎉

**Updating later:** change the files (or ask for changes) → GitHub Desktop → **Commit to main** → **Push origin**. The site updates within a minute or two. If you change `Code.gs`, also do Step A.4 again (New version).

> Still works on your own computer: `node server.js` uses the local server when `site-config.js` has an empty URL (`appsScriptUrl: ''`).

### Good to know

- Admin logins last 6 hours. After 10 wrong passwords, admin login is locked for everyone for 10 minutes.
- The spam brake is for the whole class: at most 40 notes per minute in total.
- Admin **Delete** removes the note's row from the Sheet for good.
- If you changed `censor.js`, run `node tools/build-code-gs.js` so `Code.gs` gets the new copy, then redo Step A.

---

## How it stays safe

- **Anonymous by default:** no logins, no IP addresses saved, and a name is only stored if the student turns it on in Settings.
- **No HTML injection:** student text is always shown with `textContent`, never `innerHTML`. The server also sends a strict Content-Security-Policy.
- **Checked twice:** the browser checks the form, and the server checks it again (mood 1–5, text trimmed, length limits, empty entries refused, request body max 10 KB). Code.gs checks a third time.
- **Private files stay private:** the server only serves the page files, never `server.js`, `config.json` or `data/`.
- **Spam brake:** at most 10 entries per minute from one visitor.
- **Formula-safe:** in Google Sheets, text is saved as plain text, so something like `=SUM(A1)` stays just text.

## API (for the curious)

```text
GET  /api/entries
  -> { "ok": true, "mode": "local" | "sheets", "entries": [ { id, timestamp, mood, whatHappened, comment, demo } ] }

POST /api/entries        Content-Type: application/json
  body: { "mood": 1-5, "whatHappened": "max 80 chars", "comment": "optional, max 300 chars", "name": "optional, max 24 chars" }
  -> 201 { "ok": true, "mode": "...", "entry": { ... } }
  -> 400 { "ok": false, "error": "friendly message" }
```
