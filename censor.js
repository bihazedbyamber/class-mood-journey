/* =====================================================================
   Class Mood Journey — censor.js
   Finds swear words (English, Indonesian, Javanese) so the journey map
   can cover them with a *censored* sticker, and so the admin's
   "blocked words" can refuse notes.

   Works in both places ("UMD" pattern):
     browser:  <script src="censor.js"> -> window.MoodCensor
     Node:     const MoodCensor = require('./censor.js')

   ---------------------------------------------------------------------
   Where the words come from
     English:    List of Dirty, Naughty, Obscene and Otherwise Bad Words
                 https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
     Indonesian: LDNOOBW V2 (data/id.txt, CC0) + "Daftar Kata-kata Kasar
                 Bahasa Indonesia" (gist by mizwardomlank)
                 https://github.com/LDNOOBWV2/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words_V2
     Javanese:   words described in research on Javanese swearing
                 (e.g. Temanggung dialect, "Yowis Ben 2" study) and common variants.
   The lists were hand-picked for a school: innocent words that those
   lists also contain ("terima kasih", "bola", "robot", "susu", ...) and
   biology words ("penis", "vagina", ...) were left out on purpose.

   ---------------------------------------------------------------------
   How tricks are caught
     c0ck, k0nt0l, 4njing, $hit  -> numbers/symbols read as letters
     fvck, phuck                 -> v = u, ph = f
     fuuuuck, anjiiing           -> stretched letters
     f.u.c.k, f-u-c-k            -> dots and dashes inside a word
     f u c k, a s u              -> spaced-out single letters
     kon tol                     -> a word split in two
     f*ck, sh*t, k*nt*l          -> stars used as hidden letters
     fucking, kontolmu, dientot  -> endings (-ing, -mu, -nya, ...) and prefixes (di-, ng-, ...)
     motherfucker, dasarkontol   -> strong words hidden inside longer words
     cyrillic look-alikes (сock) -> turned into normal letters
   ===================================================================== */

(function share(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MoodCensor = api;
})(typeof self !== 'undefined' ? self : this, function createCensor() {
  'use strict';

  // ===================================================================
  // Word lists
  // ===================================================================

  const ENGLISH = [
    'fuck', 'fucker', 'fucking', 'fuckin', 'fucked', 'motherfucker', 'clusterfuck', 'fucktard',
    'fuk', 'fuq', 'fck', 'fcuk', 'wtf', 'stfu',
    'shit', 'shitty', 'bullshit', 'shithead', 'apeshit', 'horseshit',
    'bitch', 'bitches', 'bastard', 'asshole', 'arsehole', 'arse', 'ass', 'asses', 'asshat',
    'dumbass', 'jackass', 'assmunch', 'cunt', 'twat', 'dick', 'dickhead', 'cock', 'cocks',
    'cocksucker', 'prick', 'pussy', 'wank', 'wanker', 'tosser', 'bollocks', 'douche', 'douchebag',
    'slut', 'whore', 'hooker', 'skank', 'porn', 'porno', 'pornography', 'blowjob', 'handjob',
    'rimjob', 'jizz', 'cum', 'cumshot', 'dildo', 'boner', 'boob', 'boobs', 'tits', 'titties',
    'titty', 'horny', 'milf', 'hentai', 'gangbang', 'bukkake', 'orgy', 'rape', 'rapist', 'raping',
    'pedophile', 'paedophile', 'nigger', 'nigga', 'faggot', 'fag', 'kike', 'spic', 'chink', 'coon',
    'paki', 'tranny', 'retard', 'retarded', 'spastic', 'negro', 'idiot', 'xxx', 'nsfw',
  ];

  const INDONESIAN = [
    'anjing', 'anjeng', 'anjink', 'anjir', 'anjrit', 'anjay', 'njing', 'ajg', 'anjg', 'asw',
    'babi', 'bangsat', 'bangsad', 'bgsd', 'bgst', 'bangke', 'bajingan', 'brengsek', 'berengsek',
    'brengsex', 'keparat', 'kaparat', 'bedebah', 'jahanam', 'biadab', 'jadah',
    'goblok', 'goblog', 'gblk', 'geblek', 'tolol', 'tlol', 'bego', 'begok', 'dungu', 'dongok',
    'bacot', 'cocot', 'congor', 'monyet', 'munyuk', 'kunyuk', 'kampret', 'sompret', 'sontoloyo', 'kampang',
    'tai', 'tae', 'taek', 'taik', 'tahi', 'tokai',
    'kontol', 'konti', 'kntl', 'kotl', 'memek', 'memex', 'meki', 'mmk', 'pepek', 'peler', 'pler', 'pelir',
    'titit', 'tetek', 'toket', 'tobrut', 'itil', 'kelentit', 'jembut', 'jembud',
    'ngentot', 'ngentod', 'entot', 'ngewe', 'ewe', 'ngewek', 'ngaceng', 'ngecrot', 'crot', 'coli',
    'colmek', 'nyoli', 'sange', 'bokep', 'peju', 'pejuh', 'sepong', 'bispak',
    'lonte', 'perek', 'pelacur', 'sundal', 'jablay', 'pecun', 'germo', 'cabul', 'mesum', 'kimcil',
    'pukimak', 'pukimai', 'puki', 'kimak', 'kimax', 'pantek', 'heunceut', 'henceut', 'hencet',
    'cuki', 'cukimai', 'banci', 'bencong', 'maho',
  ];

  const JAVANESE = [
    'asu', 'jancok', 'jancuk', 'jancik', 'jancuki', 'jiancok', 'jiancuk', 'dancok', 'dancuk',
    'diancok', 'diancuk', 'ancok', 'ancuk', 'cok', 'cuk', 'jamput', 'jiamput',
    'matamu', 'ndasmu', 'raimu', 'cocotmu', 'cangkemmu', 'lambemu',
    'gathel', 'tempik', 'turuk', 'silit', 'peli', 'kirik', 'celeng', 'telek',
    'pekok', 'ndlogok', 'sikak', 'thelo',
  ];

  /** Strong words that are caught even when hidden inside a longer word. */
  const STEMS = [
    'fuck', 'shit', 'cunt', 'bitch', 'whore', 'nigger', 'faggot', 'asshole', 'cocksuck',
    'kontol', 'ngentot', 'memek', 'jancok', 'jancuk', 'dancok', 'bangsat', 'bajingan',
    'brengsek', 'pukimak', 'jembut', 'anjing',
  ];

  /** Normal words that look like swear words to a computer. Never censored. */
  const SAFE_WORDS = [
    'cocky', 'cocker', 'peacock', 'hancock', 'cocktail', 'cockpit', 'cockroach', 'dickens', 'dicky',
    'shiitake', 'shitake', 'scunthorpe', 'classic', 'assassin', 'assess', 'assist', 'compass',
    'asus', 'asuransi', 'pantai', 'santai', 'petai', 'memekik', 'memekikkan', 'celengan', 'pelikan',
  ];

  // ===================================================================
  // Turning any spelling into plain letters
  // ===================================================================

  /** Symbols, numbers and look-alike letters -> normal letters. '#' = could be i or l. */
  const LOOKALIKES = {
    0: 'o', 1: '#', '|': '#', '!': '#', 3: 'e', 4: 'a', '@': 'a', 5: 's', $: 's', 7: 't', '+': 't',
    8: 'b', 9: 'g', '€': 'e', '¢': 'c', '£': 'l',
    // Cyrillic and Greek letters that look Latin
    а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', к: 'k', м: 'm', т: 't', в: 'b', н: 'h',
    і: 'i', ј: 'j', ѕ: 's', α: 'a', ε: 'e', ι: 'i', κ: 'k', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ν: 'v',
  };

  /**
   * One piece of text -> its plain-letter spellings (usually 1, or 2 when "1" / "|"
   * could be an i or an l). '*' is kept: it stands for a hidden letter.
   */
  function plainSpellings(raw) {
    let text = String(raw).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
    let mapped = '';
    for (const char of text) mapped += LOOKALIKES[char] ?? char;
    text = mapped.replace(/ph/g, 'f').replace(/v/g, 'u').replace(/[^a-z*#]/g, '');
    if (!text.includes('#')) return [text];
    return [text.replace(/#/g, 'i'), text.replace(/#/g, 'l')];
  }

  /**
   * A word -> a pattern that also accepts stretched letters.
   *  long words (4+ letters): any letter may repeat   ("fuck" matches "fuuuuck")
   *  short words (1-3):       only big stretches      ("cok" matches "coook" but not "cook")
   */
  function stretchPattern(word, allowAnyStretch) {
    return word.replace(/(.)\1*/g, (run, letter) => (allowAnyStretch
      ? (run.length === 1 ? `${letter}+` : `${letter}{${run.length},}`)
      : `${letter}{${run.length}}(?:${letter}{2,})?`));
  }

  const PREFIXES = '(?:di|nge|ng|ke|pe|ber|ter|meng|me|ny)';
  const LONG_ENDINGS = '(?:ing|in|ers|er|ed|ies|es|s|y|nya|mu|ne|e|lah|lu|lo|kau|ku)';
  const SHORT_ENDINGS = '(?:nya|mu|ne|lu|lo|s)';
  const WILDCARD_ENDINGS = ['', 'ing', 'er', 's', 'ed', 'mu', 'nya'];
  const TRIM_EDGES = /^[\s.,;:?!"'()[\]{}<>«»“”‘’…~/\\_*-]+|[\s.,;:?!"'()[\]{}<>«»“”‘’…~/\\_*-]+$/g;

  // ===================================================================
  // The matcher
  // ===================================================================

  /**
   * Builds a matcher for a list of words.
   *   options.stems: words that also count when hidden inside longer words
   */
  function createMatcher(wordList, options = {}) {
    const clean = (list) => [...new Set(list.map((word) => plainSpellings(word)[0].replace(/[*#]/g, '')))]
      .filter((word) => word.length >= 2);
    const words = clean(wordList);
    const stems = clean(options.stems || []);
    const safe = new Set(clean([...SAFE_WORDS, ...(options.safe || [])]));

    const alternation = (list, anyStretch) => list.map((word) => stretchPattern(word, anyStretch)).join('|');
    const shortWords = words.filter((word) => word.length <= 3);
    const longWords = words.filter((word) => word.length >= 4);
    const splitWords = words.filter((word) => word.length >= 5);

    const shortRe = shortWords.length
      ? new RegExp(`^(?:${alternation(shortWords, false)})${SHORT_ENDINGS}?$`) : null;
    const longRe = longWords.length
      ? new RegExp(`^${PREFIXES}?(?:${alternation(longWords, true)})${LONG_ENDINGS}?$`) : null;
    const splitRe = splitWords.length
      ? new RegExp(`^${PREFIXES}?(?:${alternation(splitWords, true)})${LONG_ENDINGS}?$`) : null;
    const stemRe = stems.length ? new RegExp(alternation(stems, true)) : null;
    const wildcardForms = words.flatMap((word) => WILDCARD_ENDINGS.map((ending) => word + ending));

    const cache = new Map();

    /** Is this one plain spelling a bad word? */
    function isBadSpelling(spelling) {
      if (spelling.length < 2 || safe.has(spelling)) return false;
      if (spelling.includes('*')) {
        // Stars = hidden letters, e.g. "f*ck". Needs at least 2 real letters.
        const letters = spelling.replace(/\*/g, '');
        if (letters.length < 2) return false;
        const pattern = new RegExp(`^${spelling.replace(/\*/g, '[a-z]')}$`);
        return wildcardForms.some((form) => pattern.test(form));
      }
      return Boolean((shortRe && shortRe.test(spelling))
        || (longRe && longRe.test(spelling))
        || (stemRe && stemRe.test(spelling)));
    }

    /** Is this piece of text (one word as typed) a bad word? */
    function isBad(piece) {
      if (cache.has(piece)) return cache.get(piece);
      const result = plainSpellings(piece).some(isBadSpelling);
      cache.set(piece, result);
      return result;
    }

    /** Two neighbouring pieces that together make a long bad word ("kon tol"). */
    function isBadSplit(first, second) {
      if (!splitRe) return false;
      return plainSpellings(first).some((a) => plainSpellings(second).some((b) => {
        if (a.length < 3 || b.length < 3) return false; // "bang ke mana" is fine
        const joined = a + b;
        return !safe.has(joined) && splitRe.test(joined);
      }));
    }

    /** All bad words in a text, as [{ start, end }] positions in the ORIGINAL text. */
    function findRanges(text) {
      const source = String(text || '');
      const pieces = [];
      const wordRe = /\S+/g;
      let match;
      while ((match = wordRe.exec(source))) {
        // Trim punctuation around the word, but remember where the word really is
        const leading = match[0].length - match[0].replace(/^[\s.,;:?!"'()[\]{}<>«»“”‘’…~/\\_*-]+/, '').length;
        const core = match[0].replace(TRIM_EDGES, '');
        if (!core) continue;
        const start = match.index + leading;
        pieces.push({ core, start, end: start + core.length, size: plainSpellings(core)[0].length });
      }

      const ranges = [];
      let i = 0;
      while (i < pieces.length) {
        // 1) Spaced-out letters: "f u c k"
        let j = i;
        while (j < pieces.length && pieces[j].size === 1) j += 1;
        if (j - i >= 3 && isBad(pieces.slice(i, j).map((piece) => piece.core).join(''))) {
          ranges.push({ start: pieces[i].start, end: pieces[j - 1].end });
          i = j;
          continue;
        }
        // 2) One word: "c0ck", "kontolmu", "f*ck"
        if (isBad(pieces[i].core)) {
          ranges.push({ start: pieces[i].start, end: pieces[i].end });
          i += 1;
          continue;
        }
        // 3) A word split in two: "kon tol"
        if (i + 1 < pieces.length && isBadSplit(pieces[i].core, pieces[i + 1].core)) {
          ranges.push({ start: pieces[i].start, end: pieces[i + 1].end });
          i += 2;
          continue;
        }
        i += 1;
      }
      return ranges;
    }

    return {
      findRanges,
      hasMatch: (text) => findRanges(text).length > 0,
      wordCount: words.length,
    };
  }

  // ===================================================================
  // Ready-made censor with all three languages
  // ===================================================================

  const defaultMatcher = createMatcher([...ENGLISH, ...INDONESIAN, ...JAVANESE], { stems: STEMS });

  /** Splits text into [{ text, censored }] pieces. Censored pieces get a sticker. */
  function censorSegments(text) {
    const source = String(text || '');
    const segments = [];
    let position = 0;
    for (const range of defaultMatcher.findRanges(source)) {
      if (range.start > position) segments.push({ text: source.slice(position, range.start), censored: false });
      segments.push({ text: source.slice(range.start, range.end), censored: true });
      position = range.end;
    }
    if (position < source.length) segments.push({ text: source.slice(position), censored: false });
    return segments;
  }

  /** The same text with bad words replaced by a label (for screen readers, titles, ...). */
  function censorPlain(text, label = '*censored*') {
    return censorSegments(text).map((segment) => (segment.censored ? label : segment.text)).join('');
  }

  function hasBadWords(text) {
    return defaultMatcher.hasMatch(text);
  }

  return {
    createMatcher,
    censorSegments,
    censorPlain,
    hasBadWords,
    WORD_COUNT: defaultMatcher.wordCount,
    LANGUAGES: ['English', 'Indonesian', 'Javanese'],
  };
});
