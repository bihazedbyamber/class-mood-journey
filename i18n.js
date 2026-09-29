/* =====================================================================
   Class Mood Journey — i18n.js  (English / Bahasa Indonesia)
   ---------------------------------------------------------------------
   The pages are written in English. When a visitor picks "ID" in the
   top bar, this file swaps every English text it knows for Indonesian:
   page text, buttons, placeholders, tooltips, and the messages the
   other scripts show later (it watches the page for new text).
   Switching back to "EN" puts the original English back.

   Students' own notes are never translated.

   To fix or add a translation: edit the ID list below. The English
   side must match the text on the page exactly (extra spaces don't
   matter). Texts with changing parts (numbers, names) are in PATTERNS.
   ===================================================================== */

'use strict';

window.MoodI18n = (function createI18n() {
  const STORAGE_KEY = 'class-mood-lang';
  const LANGS = ['en', 'id'];

  // ---------- English -> Indonesian ----------
  const ID = {
    // Page titles, top bar, nav
    'Class Moods': 'Mood Kelas',
    'Share My Mood': 'Bagikan Mood-mu',
    'Admin Desk': 'Meja Admin',
    'Mood board home': 'Beranda mood board',
    'Pages': 'Halaman',
    'Home': 'Beranda',
    'Share my mood': 'Bagikan mood',
    'Class moods': 'Mood kelas',
    'Language': 'Bahasa',
    'Admin login': 'Login admin',
    'Admin desk': 'Meja admin',
    'Log out': 'Keluar',
    'Open settings': 'Buka pengaturan',
    'Settings': 'Pengaturan',
    'Switch colour theme': 'Ganti tema warna',
    'Switch to dark mode': 'Ganti ke mode gelap',
    'Switch to light mode': 'Ganti ke mode terang',

    // Hero bits (home + check-in)
    '100% anon': '100%\nanonim',
    'no names. no logins. just honest vibes': 'tanpa nama. tanpa login.\ncuma perasaan jujur',
    'Class mood board': 'Mood board kelas',
    'Tell us how class felt in 30 seconds, then see how everyone else feels.':
      'Ceritakan rasanya kelas dalam 30 detik, lalu lihat perasaan teman-teman yang lain.',
    'Share my mood ↗': 'Bagikan mood ↗',
    'See class moods ↗': 'Lihat mood kelas ↗',
    'What is this?': 'Ini apa sih?',

    // Home: cards
    'How was class today?': 'Gimana kelas hari ini?',
    "Pick a face, say what happened in a few words, done. It takes about 30 seconds, and it's anonymous unless you add your name.":
      'Pilih wajah, ceritakan apa yang terjadi dalam beberapa kata, selesai. Cuma sekitar 30 detik, dan tetap anonim kecuali kamu menambahkan namamu.',
    'Share your mood': 'Bagikan mood-mu',
    'Tell us your mood': 'Ceritakan mood-mu',
    // the two big choice cards on Home
    'Step 1': 'Langkah 1',
    'Step 2': 'Langkah 2',
    'See class moods': 'Lihat mood kelas',
    'Pick a face and say what happened. Takes 30 seconds.': 'Pilih wajah dan ceritakan apa yang terjadi. Cuma 30 detik.',
    "Read everyone's sticky notes, newest first.": 'Baca sticky note semua orang, yang terbaru duluan.',
    'Tap here': 'Ketuk di sini',
    '✦ MY MOOD': '✦ MOOD-KU',
    '✦ 30 SECONDS': '✦ 30 DETIK',
    'Science experiment!': 'Eksperimen sains!',
    'Surprise quiz': 'Kuis dadakan',
    'See how the whole class feels': 'Lihat perasaan seluruh kelas',
    'Every mood shared becomes a sticky note, newest first. Tap a note to read it.':
      'Setiap mood yang dibagikan jadi sticky note, yang terbaru duluan. Ketuk catatan untuk membacanya.',

    // Home: "What is this?"
    'A quick mood check for our class': 'Cek mood singkat untuk kelas kita',
    'After a lesson, everyone can say how it felt, in a few seconds. All the notes together draw the':
      'Setelah pelajaran, semua orang bisa cerita rasanya dalam beberapa detik. Semua catatan bersama-sama menggambarkan',
    'mood of the class over time': 'mood kelas dari waktu ke waktu',
    ': the good days, the rough days, and what made the difference. That helps all of us see what works, made by the class, for the class.':
      ': hari-hari seru, hari-hari berat, dan apa yang membuat bedanya. Itu membantu kita semua melihat apa yang berhasil, dari kelas, untuk kelas.',
    'How it works': 'Cara kerjanya',
    'Pick a face, or a small': 'Pilih wajah, atau tanda',
    'between two faces when you feel a bit of both.': 'kecil di antara dua wajah kalau kamu merasa sedikit dari keduanya.',
    'Say what happened in a few words (or tap a quick idea).': 'Ceritakan apa yang terjadi dalam beberapa kata (atau ketuk ide cepat).',
    'Your sticky note lands on the Class moods page,': 'Sticky note-mu mendarat di halaman Mood kelas,',
    'newest first': 'yang terbaru duluan',
    'Anonymous by default': 'Anonim dari awal',
    'No login, no email. Your name is only added if you switch': 'Tanpa login, tanpa email. Namamu hanya ditambahkan kalau kamu mengganti',
    'to': 'ke',
    '. The choice is saved on your device only.': '. Pilihan ini hanya disimpan di perangkatmu.',
    'Kind by design': 'Dibuat untuk tetap baik',
    'Swear words in English, Indonesian and Javanese get covered with a': 'Kata kasar dalam bahasa Inggris, Indonesia, dan Jawa ditutup dengan stiker',
    '*censored*': '*disensor*',
    'sticker (you can switch it off in ⚙ Settings). The admin can hide notes, check new notes first, or pause check-ins.':
      '(bisa dimatikan di ⚙ Pengaturan). Admin bisa menyembunyikan catatan, mengecek catatan baru dulu, atau menjeda check-in.',
    'Make it yours': 'Bikin sesuai gayamu',
    'Three styles:': 'Tiga gaya:',
    'and': 'dan',
    'or': 'atau',
    ', each in light or dark mode. Find them under ⚙ Settings.': ', masing-masing dalam mode terang atau gelap. Ada di ⚙ Pengaturan.',
    'For the student admins': 'Untuk admin siswa',
    'A few classmates act as': 'Beberapa teman sekelas menjadi',
    'moderators': 'moderator',
    ': from the community, for the community. Their 🔒': ': dari komunitas, untuk komunitas. 🔒',
    'sorts notes into piles, pins, hides or deletes them and shows the mood numbers, including the in-between moods like':
      'mereka menyortir catatan ke tumpukan, menyematkan, menyembunyikan, atau menghapusnya, dan menampilkan angka mood, termasuk mood di antara seperti',

    // Moods
    'Great': 'Hebat',
    'Good': 'Baik',
    'Okay': 'Oke',
    'Bad': 'Buruk',
    'Frustrated': 'Frustrasi',
    'Cheerful': 'Ceria',
    'Chill': 'Santai',
    'Meh': 'Meh',
    'Stressed': 'Stres',
    'Unknown': 'Tidak diketahui',

    // Settings panel
    'Close settings': 'Tutup pengaturan',
    'Your name': 'Namamu',
    'Stay anonymous': 'Tetap anonim',
    'Show my name': 'Tampilkan namaku',
    'Your name or nickname': 'Nama atau nama panggilanmu',
    'Style': 'Gaya',
    'Pixel type, tape & torn tags': 'Huruf piksel, selotip & label sobek',
    'Friendly notebook doodles': 'Coretan buku catatan yang ramah',
    'Zine collage, marker scribbles': 'Kolase zine, coretan spidol',
    'Theme': 'Tema',
    'Light': 'Terang',
    'Dark': 'Gelap',
    'Device': 'Perangkat',
    'Censor': 'Sensor',
    'Hide swear words': 'Sembunyikan kata kasar',
    'Covers swear words (English, Indonesian and Javanese) on the Class moods page with a':
      'Menutup kata kasar (Inggris, Indonesia, dan Jawa) di halaman Mood kelas dengan stiker',
    'sticker. On by default.': '. Aktif dari awal.',
    'Done': 'Selesai',
    'Type a name first, otherwise your notes stay anonymous.': 'Ketik nama dulu, kalau tidak catatanmu tetap anonim.',
    'No name is sent. Nobody can tell which notes are yours.': 'Tidak ada nama yang dikirim. Tidak ada yang tahu catatan mana punyamu.',

    // Admin login box
    'Close': 'Tutup',
    'Only for the student admins (moderators) of this class. No email needed, just the password.':
      'Hanya untuk admin siswa (moderator) kelas ini. Tanpa email, cukup kata sandi.',
    'Only for the student admins (moderators) of this class.': 'Hanya untuk admin siswa (moderator) kelas ini.',
    'Password': 'Kata sandi',
    'Log in': 'Masuk',
    'Type the admin password.': 'Ketik kata sandi admin.',
    'Could not log in.': 'Tidak bisa masuk.',
    "Couldn't reach the server. Is it running?": 'Server tidak bisa dihubungi. Cek internetmu.',
    "Couldn't reach the server.": 'Server tidak bisa dihubungi.',
    'No admin password is set on the server yet (see README).': 'Belum ada kata sandi admin (lihat README).',

    // Check-in page
    '30 seconds · anonymous': '30 detik · anonim',
    'Your mood in class': 'Mood-mu di kelas',
    'How was class': 'Gimana kelas',
    'today?': 'hari ini?',
    'Share your mood form': 'Formulir bagikan mood',
    'Pick your mood': 'Pilih mood-mu',
    'Feeling a bit of both? Tap a': 'Merasa sedikit dari keduanya? Ketuk tanda',
    'between two faces.': 'di antara dua wajah.',
    'Quick ideas for question 2': 'Ide cepat untuk pertanyaan 2',
    'tap an idea for no. 2 ↓': 'ketuk ide untuk no. 2 ↓',
    'Group work': 'Kerja kelompok',
    'A surprise quiz': 'Kuis dadakan',
    'Science experiment': 'Eksperimen sains',
    'Presentations': 'Presentasi',
    'Too much homework': 'PR kebanyakan',
    'Free time': 'Waktu bebas',
    'What happened in class?': 'Apa yang terjadi di kelas?',
    'e.g. We did a fun science experiment': 'mis. Kami bikin eksperimen sains yang seru',
    'Anything you want to say?': 'Ada yang mau disampaikan?',
    'optional': 'opsional',
    'A wish, an idea, a thank-you... anything!': 'Harapan, ide, ucapan terima kasih... apa saja!',
    'Posting as': 'Kirim sebagai',
    'Anonymous': 'Anonim',
    'My name': 'Namaku',
    'Type your name or nickname': 'Ketik nama atau nama panggilanmu',
    'Send my feeling': 'Kirim perasaanku',
    'Sending…': 'Mengirim…',
    'Sent! Thank you': 'Terkirim! Terima kasih',
    'Share another': 'Kirim lagi',
    'Type your name above. Your name is only saved on this device.': 'Ketik namamu di atas. Namamu hanya disimpan di perangkat ini.',
    'No name is sent. Nobody can tell which note is yours.': 'Tidak ada nama yang dikirim. Tidak ada yang tahu catatan mana punyamu.',
    'Type your name, or switch to Anonymous.': 'Ketik namamu, atau ganti ke Anonim.',
    'Pick the face that matches how you felt 🙂': 'Pilih wajah yang cocok dengan perasaanmu 🙂',
    'Write a few words about what happened (or tap a quick pick).': 'Tulis beberapa kata tentang apa yang terjadi (atau ketuk ide cepat).',
    "We couldn't reach the server. Check your internet (or that the server is running) and try again. 🌧":
      'Server tidak bisa dihubungi. Cek internetmu lalu coba lagi. 🌧',
    'Whoa, so many notes! Please wait a minute and try again. ⏳': 'Wah, banyak banget catatan! Tunggu semenit lalu coba lagi ya. ⏳',
    'Got it! Your note will appear on the Class moods page after the admin has checked it.':
      'Oke! Catatanmu akan muncul di halaman Mood kelas setelah dicek admin.',
    'Check-ins are paused by the admin right now. Please come back a bit later! ⏸':
      'Check-in sedang dijeda oleh admin. Coba lagi nanti ya! ⏸',
    // thank-you messages
    'Your note is now stuck on the Class moods page. ✿': 'Catatanmu sekarang sudah menempel di halaman Mood kelas. ✿',
    'Feelings received! Thanks for helping our class get better.': 'Perasaan diterima! Makasih sudah bantu kelas kita jadi lebih baik.',
    'Yay! Your sticky note just landed on the map.': 'Yay! Sticky note-mu baru saja mendarat di peta.',
    'Thanks for sharing. Every note helps! ♡': 'Makasih sudah berbagi. Setiap catatan membantu! ♡',
    'Got it! Your paper airplane arrived safely.': 'Oke! Pesawat kertasmu sampai dengan selamat.',
    // mood reactions
    'yesss, love that for you!': 'yesss, ikut senang!',
    'nice, a good one!': 'mantap, hari yang baik!',
    'fair enough, just a normal day': 'oke lah, hari biasa aja',
    'oh no, sorry it was rough': 'yah, maaf ya harinya berat',
    'ugh, that sounds frustrating. tell us why?': 'duh, kedengarannya bikin kesal. ceritain kenapa?',
    'cheerful! somewhere between great and good ✨': 'ceria! antara hebat dan baik ✨',
    'chill vibes: good-ish, but calm': 'vibes santai: lumayan baik, tapi tenang',
    'meh… not great, not terrible': 'meh… nggak bagus, nggak jelek juga',
    'stressed? that sounds heavy. want to share why?': 'stres? kedengarannya berat. mau cerita kenapa?',

    // Journey map page
    'How everyone': 'Perasaan',
    'feels': 'semua orang',
    "Newest first. Every sticky note is one person's mood after class.": 'Terbaru duluan. Setiap sticky note adalah mood satu orang setelah kelas.',
    'tap one to read it!': 'ketuk untuk membacanya!',
    'Show only one mood': 'Tampilkan satu mood saja',
    'All': 'Semua',
    'Class moods board': 'Papan mood kelas',
    'Timeline of notes, newest first. Scroll sideways to go back in time.':
      'Garis waktu catatan, terbaru duluan. Geser ke samping untuk kembali ke masa lalu.',
    'NOW': 'SEKARANG',
    'START': 'MULAI',
    'Notes, newest first': 'Catatan, terbaru duluan',
    'Collecting sticky notes…': 'Mengumpulkan sticky note…',
    'No feelings shared yet!': 'Belum ada perasaan yang dibagikan!',
    'Be the first to share your mood.': 'Jadilah yang pertama membagikan mood-mu.',
    'Share how you feel': 'Bagikan perasaanmu',
    'Oops, the notes got lost.': 'Ups, catatannya hilang.',
    "We'll try again soon.": 'Kami akan coba lagi sebentar lagi.',
    'Try again': 'Coba lagi',
    'newest first · scroll → to go back in time': 'terbaru duluan · geser → untuk kembali ke masa lalu',
    'Close note': 'Tutup catatan',
    'Hide from map': 'Sembunyikan dari halaman',
    'Hidden notes can be shown again in the Admin desk.': 'Catatan tersembunyi bisa ditampilkan lagi di Meja admin.',
    'Censored. You can turn this off in Settings.': 'Disensor. Kamu bisa mematikannya di Pengaturan.',
    "Couldn't refresh just now. Trying again soon…": 'Belum bisa refresh. Mencoba lagi sebentar lagi…',
    "We couldn't reach the server. Is it still running?": 'Server tidak bisa dihubungi. Cek internetmu.',
    'Connected to Google Sheets': 'Terhubung ke Google Sheets',
    'Saving locally': 'Disimpan lokal',
    'Notes are saved in the class Google Sheet.': 'Catatan disimpan di Google Sheet kelas.',
    'Pick "All" to see every note.': 'Pilih "Semua" untuk melihat semua catatan.',
    'anonymous': 'anonim',
    'No extra comment.': 'Tidak ada komentar tambahan.',
    'Could not hide the note.': 'Catatan tidak bisa disembunyikan.',
    'Note hidden. You can show it again in the Admin desk.': 'Catatan disembunyikan. Kamu bisa menampilkannya lagi di Meja admin.',

    // Admin desk
    'Sort the': 'Rapikan',
    'notes': 'catatan',
    'Drag a sticky note onto a pile, or use': 'Seret sticky note ke tumpukan, atau pakai',
    'Move to': 'Pindahkan ke',
    '. Hidden and waiting notes are only visible here.': '. Catatan tersembunyi dan yang menunggu hanya terlihat di sini.',
    'Numbers at a glance': 'Angka sekilas',
    'today': 'hari ini',
    'need review': 'perlu dicek',
    'hidden': 'tersembunyi',
    'moods': 'mood',
    'Notes per mood': 'Catatan per mood',
    'Piles': 'Tumpukan',
    'New pile name': 'Nama tumpukan baru',
    'New pile, e.g. To discuss': 'Tumpukan baru, mis. Untuk dibahas',
    'Pile colour': 'Warna tumpukan',
    '+ Add pile': '+ Tambah tumpukan',
    'Inbox': 'Kotak masuk',
    'Rename': 'Ganti nama',
    'Delete pile': 'Hapus tumpukan',
    'Show': 'Tampilkan',
    'Need review': 'Perlu dicek',
    'Needs review': 'Perlu dicek',
    'Hidden': 'Tersembunyi',
    'Pinned': 'Disematkan',
    'Swear words': 'Kata kasar',
    'Notes in this pile': 'Catatan di tumpukan ini',
    'No notes here. ✿': 'Tidak ada catatan di sini. ✿',
    'Class controls': 'Kontrol kelas',
    'Pause check-ins': 'Jeda check-in',
    'Nobody can send new notes until you switch it off.': 'Tidak ada yang bisa mengirim catatan baru sampai kamu mematikannya.',
    'Check new notes first': 'Cek catatan baru dulu',
    'New notes wait in "Need review" until you approve them.': 'Catatan baru menunggu di "Perlu dicek" sampai kamu menyetujuinya.',
    'Blocked words': 'Kata terlarang',
    'Notes (and names) with these words are': 'Catatan (dan nama) dengan kata-kata ini',
    'refused completely': 'ditolak sepenuhnya',
    ". One per line or separated by commas. Swear words don't need to be here: the censor already covers them with a":
      '. Satu per baris atau pisahkan dengan koma. Kata kasar tidak perlu ditulis di sini: sensor sudah menutupnya dengan stiker',
    "sticker. Use this for things like a classmate's name that is being used for teasing. Tricks such as":
      '. Pakai ini untuk hal seperti nama teman yang dipakai untuk mengejek. Trik seperti',
    'are caught too.': 'juga ketahuan.',
    'Save words': 'Simpan kata',
    'Export': 'Ekspor',
    'Download all notes (CSV)': 'Unduh semua catatan (CSV)',
    'Yellow': 'Kuning',
    'Pink': 'Merah muda',
    'Blue': 'Biru',
    'Green': 'Hijau',
    'Orange': 'Oranye',
    'Purple': 'Ungu',
    'empty': 'kosong',
    'No comment.': 'Tidak ada komentar.',
    'Approve': 'Setujui',
    'Pin': 'Sematkan',
    'Unpin': 'Lepas pin',
    'Hide': 'Sembunyikan',
    'Delete': 'Hapus',
    'Move to pile': 'Pindahkan ke tumpukan',
    'Approved: it is on the Class moods page now.': 'Disetujui: sekarang ada di halaman Mood kelas.',
    'Unpinned.': 'Pin dilepas.',
    'Pinned: it gets a pin on the map.': 'Disematkan: catatan ini dapat pin di peta.',
    'Visible again.': 'Terlihat lagi.',
    'Hidden from the Class moods page.': 'Disembunyikan dari halaman Mood kelas.',
    'Notes are in your Google Sheet. "Delete" removes the note and its row for good.':
      'Catatan ada di Google Sheet-mu. "Hapus" menghapus catatan dan barisnya selamanya.',
    'Note deleted.': 'Catatan dihapus.',
    'Removed from the website (the row is still in the Sheet).': 'Dihapus dari website (barisnya masih ada di Sheet).',
    'Give the new pile a name first.': 'Beri nama tumpukan baru dulu.',
    'New name for this pile:': 'Nama baru untuk tumpukan ini:',
    'Pile renamed.': 'Nama tumpukan diganti.',
    'Pile deleted. Its notes are back in the Inbox.': 'Tumpukan dihapus. Catatannya kembali ke Kotak masuk.',
    'Check-ins are paused.': 'Check-in dijeda.',
    'Check-ins are open again.': 'Check-in dibuka lagi.',
    'New notes will wait for your review.': 'Catatan baru akan menunggu kamu cek.',
    'New notes appear on the map straight away.': 'Catatan baru langsung muncul di peta.',
    'Blocked words saved.': 'Kata terlarang disimpan.',

    // Messages from the Google Apps Script
    'Lots of notes at once! Please wait a minute and try again.': 'Banyak catatan sekaligus! Tunggu semenit lalu coba lagi.',
    'Check-ins are paused by the admin right now. Please try again later.': 'Check-in sedang dijeda oleh admin. Coba lagi nanti.',
    'Please keep it kind: some words in your note are not allowed here.': 'Tetap sopan ya: beberapa kata di catatanmu tidak diizinkan di sini.',
    'Please pick a mood.': 'Pilih mood dulu ya.',
    'Please write a few words about what happened in class.': 'Tulis beberapa kata tentang apa yang terjadi di kelas.',
    'Admin login is not set up yet. Add ADMIN_PASSWORD in the Script properties (see README).':
      'Login admin belum disiapkan. Tambahkan ADMIN_PASSWORD di Script properties (lihat README).',
    'Too many wrong passwords. Please wait 10 minutes and try again.': 'Terlalu banyak kata sandi salah. Tunggu 10 menit lalu coba lagi.',
    'Wrong password.': 'Kata sandi salah.',
    'Please log in as admin first.': 'Masuk sebagai admin dulu ya.',
    'Give the pile a name.': 'Beri nama tumpukan.',
    'That pile does not exist any more.': 'Tumpukan itu sudah tidak ada.',
  };

  /** Short helper for the patterns: translate if known, otherwise keep. */
  const T = (text) => (Object.prototype.hasOwnProperty.call(ID, text) ? ID[text] : text);

  /** Texts with changing parts. Checked in order, first match wins. */
  const PATTERNS = [
    [/^(\S+) \+ (\S+)$/, (a, b) => (ID[a] && ID[b] ? `${ID[a]} + ${ID[b]}` : null)],   // "Great + Good"
    [/^\((\S+) \+ (\S+)\)$/, (a, b) => `(${T(a)} + ${T(b)})`],
    [/^(\S+) = (\S+) \+ (\S+)$/, (a, b, c) => `${T(a)} = ${T(b)} + ${T(c)}`],
    [/^(\S+): between (\S+) and (\S+)$/, (a, b, c) => `${T(a)}: di antara ${T(b)} dan ${T(c)}`],
    [/^(\S+), between (\S+) and (\S+)$/, (a, b, c) => `${T(a)}, di antara ${T(b)} dan ${T(c)}`],
    [/^(\d+) notes?$/, (n) => `${n} catatan`],
    [/^(\d+) of (\d+) notes?$/, (a, b) => `${a} dari ${b} catatan`],
    [/^Updated (.+) · refreshes every 30 s$/, (t) => `Diperbarui ${t} · refresh tiap 30 dtk`],
    [/^No "(.+)" notes yet\.$/, (m) => `Belum ada catatan "${T(m)}".`],
    [/^by (.+) · (.+)$/, (n, d) => `oleh ${n} · ${d}`],
    [/^anonymous · (.+)$/, (d) => `anonim · ${d}`],
    [/^by (.+)$/, (n) => `oleh ${n}`],
    [/^hey (.+)$/, (n) => `hai\n${n}`],
    [/^signing as (.+)\. anonymous is one tap away$/, (n) => `tampil sebagai ${n}.\nanonim tinggal sekali ketuk`],
    [/^Your note will say "by (.+)"\.$/, (n) => `Catatanmu akan bertuliskan "oleh ${n}".`],
    [/^New notes will say "by (.+)"\. Notes you already sent don't change\.$/,
      (n) => `Catatan baru akan bertuliskan "oleh ${n}". Catatan yang sudah terkirim tidak berubah.`],
    [/^Please keep it under (\d+) characters\.$/, (n) => `Maksimal ${n} karakter ya.`],
    [/^The server answered with code (\d+)\.$/, (n) => `Server menjawab dengan kode ${n}.`],
    [/^Oops, our paper airplane crashed\. (.*) Please try again in a moment\.$/,
      (m) => `Ups, pesawat kertas kita jatuh. ${T(m)} Coba lagi sebentar lagi ya.`],
    [/^"What happened" can be at most (\d+) characters\.$/, (n) => `"Apa yang terjadi" maksimal ${n} karakter.`],
    [/^The comment can be at most (\d+) characters\.$/, (n) => `Komentar maksimal ${n} karakter.`],
    [/^The name can be at most (\d+) characters\.$/, (n) => `Nama maksimal ${n} karakter.`],
    [/^You can have at most (\d+) piles\.$/, (n) => `Maksimal ${n} tumpukan.`],
    [/^(\d+) to review$/, (n) => `${n} perlu dicek`],
    [/^(.+), (\d+) notes\. Open pile\.$/, (p, n) => `${T(p)}, ${n} catatan. Buka tumpukan.`],
    [/^In: (.+)$/, (p) => `Di: ${T(p)}`],
    [/^Move to (.+)$/, (p) => `Pindah ke ${T(p)}`],
    [/^Moved to "(.+)"\.$/, (p) => `Dipindahkan ke "${T(p)}".`],
    [/^Pile "(.+)" added\. Drag notes onto it!$/, (p) => `Tumpukan "${p}" ditambahkan. Seret catatan ke sini!`],
    [/^Delete this note for good\? ("[\s\S]*")$/, (q) => `Hapus catatan ini selamanya?\n\n${q}`],
    [/^Delete the pile "(.+)"\? Its notes go back to the Inbox \(they are not deleted\)\.$/,
      (p) => `Hapus tumpukan "${p}"?\nCatatannya kembali ke Kotak masuk (tidak dihapus).`],
  ];

  // ---------- Which language ----------

  function loadLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return LANGS.includes(saved) ? saved : 'en';
    } catch {
      return 'en';
    }
  }

  let lang = loadLang();

  /** Translates one piece of English text (keeps the spaces around it). */
  function translate(text) {
    if (lang !== 'id' || !text) return text;
    const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = match[2];
    if (!core) return text;
    const key = core.replace(/\s+/g, ' ');
    let result = Object.prototype.hasOwnProperty.call(ID, key) ? ID[key] : null;
    if (result === null) {
      for (const [pattern, build] of PATTERNS) {
        const found = key.match(pattern);
        if (found) {
          result = build(...found.slice(1));
          if (result !== null) break;
        }
      }
    }
    if (result === null) return text;
    // A translation that starts with . , : ; sticks to the word before it (no space)
    const before = /^[.,:;]/.test(result) ? '' : match[1];
    return before + result + match[3];
  }

  // ---------- Swapping the text on the page ----------

  const ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'data-name', 'data-tab', 'data-tab-2'];
  // Students' own words: never translated (the *censored* stickers inside still are)
  const USER_TEXT = '.note__text, .note__name, #focus-what, #focus-comment:not(.is-empty), '
    + '.admin-note__what, .admin-note__comment:not(.is-empty), .pile__sheet, [data-no-translate]';

  const originalText = new WeakMap(); // text node -> its English text
  const ourText = new WeakMap();      // text node -> the text we last put in
  const originalAttrs = new WeakMap(); // element -> { attribute: { english, ours } }

  function isUserText(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    if (parent.closest('script, style, textarea')) return true;
    if (parent.closest('.censor-sticker')) return false;
    return Boolean(parent.closest(USER_TEXT));
  }

  function updateTextNode(node) {
    if (isUserText(node)) return;
    const current = node.nodeValue;
    // New text from a script (not ours)? Then that's the new English version.
    if (ourText.get(node) !== current) originalText.set(node, current);
    const english = originalText.get(node);
    const wanted = translate(english);
    ourText.set(node, wanted);
    if (wanted !== current) node.nodeValue = wanted;
  }

  function updateAttribute(element, name) {
    const current = element.getAttribute(name);
    if (current === null) return;
    let saved = originalAttrs.get(element);
    if (!saved) originalAttrs.set(element, (saved = {}));
    if (!saved[name] || saved[name].ours !== current) saved[name] = { english: current };
    const wanted = translate(saved[name].english);
    saved[name].ours = wanted;
    if (wanted !== current) element.setAttribute(name, wanted);
  }

  function updateElement(element) {
    if (element.closest(USER_TEXT) && !element.closest('.censor-sticker')) return;
    for (const name of ATTRIBUTES) {
      if (element.hasAttribute(name)) updateAttribute(element, name);
    }
  }

  /** Translates (or restores) everything inside `root`. */
  function updateTree(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      updateTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    updateElement(root);
    root.querySelectorAll('*').forEach(updateElement);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) updateTextNode(node);
  }

  // Watch for new text (added by the page scripts, or while the page is loading)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(updateTree);
      else if (record.type === 'characterData') updateTextNode(record.target);
      else if (record.type === 'attributes') updateAttribute(record.target, record.attributeName);
    }
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES,
  });

  // ---------- The EN / ID switch in the top bar ----------

  function updateSwitches() {
    document.querySelectorAll('[data-lang]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
    });
  }

  function addSwitch() {
    const tools = document.querySelector('.topbar__tools');
    if (!tools || tools.querySelector('.lang-switch')) return;
    const group = document.createElement('div');
    group.className = 'page-nav lang-switch';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Language');
    for (const [code, label, full] of [['en', 'EN', 'English'], ['id', 'ID', 'Bahasa Indonesia']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'page-nav__link';
      button.dataset.lang = code;
      button.textContent = label;
      button.setAttribute('lang', code);
      button.setAttribute('data-no-translate', '');
      button.title = full;
      button.addEventListener('click', () => setLang(code));
      group.append(button);
    }
    tools.prepend(group);
    updateSwitches();
  }

  function setLang(next) {
    if (!LANGS.includes(next) || next === lang) return;
    lang = next;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* still works until the page closes */ }
    document.documentElement.lang = lang;
    updateTree(document.documentElement);
    updateSwitches();
    document.dispatchEvent(new CustomEvent('moodlangchange', { detail: { lang } }));
  }

  document.documentElement.lang = lang;
  document.addEventListener('DOMContentLoaded', () => {
    addSwitch();
    updateTree(document.documentElement); // catch anything the watcher missed
  });

  return {
    get lang() { return lang; },
    setLang,
    /** For texts that never reach the page, like confirm() and prompt(). */
    t: translate,
    /** For dates and times: Indonesian formats in ID, the browser's own in EN. */
    locale: () => (lang === 'id' ? 'id-ID' : undefined),
  };
})();
