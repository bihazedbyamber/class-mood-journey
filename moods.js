/* =====================================================================
   Class Mood Journey — moods.js
   The moods in one place, used by the pages AND the server.
     - 5 base moods: 5 Great, 4 Good, 3 Okay, 2 Bad, 1 Frustrated
     - 4 "in-between" moods (the little + buttons between the faces):
         4.5 Cheerful  = Great + Good
         3.5 Chill     = Good + Okay
         2.5 Meh       = Okay + Bad
         1.5 Stressed  = Bad + Frustrated
       On the journey map an in-between note sits ON THE LINE between its
       two lanes and counts for both. The admin sees its own name.

   Works in both places ("UMD" pattern):
     browser:  <script src="moods.js"> -> window.Moods
     Node:     const Moods = require('./moods.js')
   ===================================================================== */

(function share(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Moods = api;
})(typeof self !== 'undefined' ? self : this, function createMoods() {
  'use strict';

  /** Top (best) to bottom (worst), the same order as the journey map lanes. */
  const MOODS = [
    { value: 5, name: 'Great' },
    { value: 4.5, name: 'Cheerful', between: [5, 4] },
    { value: 4, name: 'Good' },
    { value: 3.5, name: 'Chill', between: [4, 3] },
    { value: 3, name: 'Okay' },
    { value: 2.5, name: 'Meh', between: [3, 2] },
    { value: 2, name: 'Bad' },
    { value: 1.5, name: 'Stressed', between: [2, 1] },
    { value: 1, name: 'Frustrated' },
  ];

  const BY_VALUE = new Map(MOODS.map((mood) => [mood.value, mood]));

  /** true for 1, 1.5, 2, ... 5 */
  function isValid(value) {
    return BY_VALUE.has(value);
  }

  /** true for the in-between moods (4.5, 3.5, 2.5, 1.5) */
  function isBlend(value) {
    return isValid(value) && !Number.isInteger(value);
  }

  /** The base mood(s): 4.5 -> [5, 4], 3 -> [3] */
  function parts(value) {
    return isBlend(value) ? [Math.ceil(value), Math.floor(value)] : [value];
  }

  /** "Great", "Cheerful", ... */
  function name(value) {
    return BY_VALUE.has(value) ? BY_VALUE.get(value).name : 'Unknown';
  }

  /** How the public map describes it: "Great + Good" for blends, "Great" otherwise */
  function baseLabel(value) {
    return parts(value).map(name).join(' + ');
  }

  /** CSS class: 4.5 -> "mood-45", 3 -> "mood-3" */
  function cssClass(value) {
    return `mood-${String(value).replace('.', '')}`;
  }

  /** Does this note belong to a base mood's lane/filter? 4.5 counts for 5 AND 4. */
  function matchesBase(value, base) {
    return Math.abs(value - base) < 1;
  }

  return { MOODS, isValid, isBlend, parts, name, baseLabel, cssClass, matchesBase };
});
