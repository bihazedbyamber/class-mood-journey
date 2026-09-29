# ✿ Class Mood Journey

An **anonymous** class mood and feedback website, made from the community, for the community.

- **Home** (`index.html`): two cards with buttons (Check in, Journey map) and "What is this?".
- **Share my mood** (`checkin.html`): students pick a mood face (or a small **+** between two faces for "a bit of both"), say what happened in class and (optionally) add a comment. Anonymous unless they choose to add a name.
- **Class moods** (`journey.html`): every check-in becomes a sticky note on an emotional journey map, with five mood lanes from *Great* (top) to *Frustrated* (bottom). **Newest notes first**: the newest is next to **NOW** on the left, the oldest next to **START** on the right.

The top bar always shows **Home · Share my mood · Class moods**; the page you are on is highlighted. Next to it, **EN / ID** switches the whole site between English and Bahasa Indonesia (saved on each device). Students' own notes are never translated.

Built with plain HTML, CSS and JavaScript, hosted on GitHub Pages. The notes are saved in a Google Sheet through a Google Apps Script (`apps-script/Code.gs`).

---

## Features

### Settings (the ⚙ button)

- **Your name**: *Stay anonymous* (the default) or *Show my name*. The same choice is right in the form: the **Posting as [Anonymous | My name]** switch above the send button.
- **Style**:
  - *Modern 2026* (the default): a lined-paper sheet on a grey grid desk, pixel titles in a red hand-drawn frame, washi tape and pixel-art faces
  - *Scribblish*: friendly pastel notebook doodles
  - *Modern Bold*: a zine collage with grainy paper, huge condensed headlines, lime marker scribbles and polaroids
- **Theme**: Light, Dark, or follow the device. The 🌙/☀ button next to ⚙ switches quickly.
- **Censor**: *Hide swear words* (on by default). Swear words on the journey map are covered with a **\*censored\*** sticker.

Settings are saved in the browser of that device only.

### In-between moods (the small + buttons)

Between each pair of faces there is a small **+**. It means "a bit of both":

| + between | Name (admin only) | Value |
|---|---|---|
| Great and Good | Cheerful | 4.5 |
| Good and Okay | Chill | 3.5 |
| Okay and Bad | Meh | 2.5 |
| Bad and Frustrated | Stressed | 1.5 |

On the journey map the note sits on the line between its two lanes, in both colours.

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

Normal words that only *look* similar are left alone, for example *cook*, *classic*, *pantai*, *asuransi*, *terima kasih*.

Where the words come from (hand-picked for a school):

- English: [List of Dirty, Naughty, Obscene and Otherwise Bad Words](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words)
- Indonesian: [LDNOOBW V2 (`data/id.txt`, CC0)](https://github.com/LDNOOBWV2/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words_V2) and [Daftar Kata-kata Kasar Bahasa Indonesia](https://gist.github.com/mizwardomlank/9627ea0670c3826a42bf68a5254b0919)
- Javanese: words described in research on Javanese swearing, e.g. [Abusive Swearing Variations in the Temanggung Javanese Dialect](https://www.researchgate.net/publication/347651033_Abusive_Swearing_Variations_in_the_Temanggung_Javanese_Dialect_Type_and_Social_Reality) and [Javanese and Sundanese Swear Words in the Film Yowis Ben 2](https://ejournal.umm.ac.id/index.php/kembara/article/view/25194)

### Admin desk (the 🔒 button)

For the student admins (moderators). Click **🔒 Admin** and type the admin password:

- **Piles**: notes are stacks of sticky notes. Add piles (e.g. *To discuss*), then drag notes onto them or use **Move to**.
- **Per note**: **Pin**, **Hide / Show**, **Delete**, **Approve**.
- **Hide straight from the journey map**: open a note while logged in and click **Hide from map**.
- **Numbers**: total notes, notes today, waiting, hidden, and a bar per mood.
- **Class controls**: *Pause check-ins*, *Check new notes first*, *Blocked words* (notes with these words are refused), *Download all notes (CSV)*.

---

## Files

| File | What it does |
|---|---|
| `index.html` / `checkin.html` / `journey.html` | Home, check-in form, journey map |
| `admin.html` / `admin.js` / `admin-login.js` | The Admin Desk and the 🔒 login button |
| `input.js` / `journey.js` | Form logic and journey map logic |
| `moods.js` / `censor.js` / `settings.js` | Moods, swear-word finder, the ⚙ Settings panel |
| `i18n.js` | The EN / ID switch and all Indonesian translations |
| `api.js` / `site-config.js` | Talks to the Google Apps Script (the URL is in `site-config.js`) |
| `style.css` / `sprite.svg` | All styles and drawings (mood faces, doodles, icons) |
| `apps-script/Code.gs` | The backend inside Google Sheets: notes, admin login, moderation |
| `server.js` / `lib/` / `tools/` | Optional: run it on your own computer, helper scripts |

---

## How it stays safe

- **Anonymous by default:** no student logins, no IP addresses saved, and a name is only stored if the student turns it on.
- **No HTML injection:** student text is always shown with `textContent`, never `innerHTML`.
- **Checked twice:** the browser checks the form, and the Apps Script checks it again (mood, length limits, empty notes refused, blocked words).
- **Admin password stays private:** it's kept inside Google (Script properties), never in the website's code.
- **Spam brake** and **wrong-password lockout**.
- **Formula-safe:** text is saved as plain text in the Sheet, so something like `=SUM(A1)` stays just text.
