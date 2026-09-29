/* =====================================================================
   Class Mood Journey — lightbox.js
   Tap a photo -> it grows from where it is to the middle of the screen,
   the page behind gets dark and blurry. With several photos: ‹ › buttons,
   arrow keys, or swipe. Close with ✕, Esc, or a tap on the dark area.

   Use: MoodLightbox.open(['big-url-1', 'big-url-2'], startIndex, clickedImg)
   ===================================================================== */

'use strict';

window.MoodLightbox = (function createLightbox() {
  let layer = null;
  let img = null;
  let counter = null;
  let prevButton = null;
  let nextButton = null;
  let closeButton = null;
  let urls = [];
  let index = 0;
  let returnFocus = null;
  let touchStartX = null;

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function makeButton(className, label, text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.textContent = text;
    return button;
  }

  /** Builds the layer once, the first time a photo is opened. */
  function build() {
    layer = document.createElement('div');
    layer.className = 'lightbox';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'Photo');
    layer.hidden = true;

    const backdrop = document.createElement('div');
    backdrop.className = 'lightbox__backdrop';

    img = document.createElement('img');
    img.className = 'lightbox__img';
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.draggable = false;

    closeButton = makeButton('lightbox__btn lightbox__close', 'Close photo', '✕');
    prevButton = makeButton('lightbox__btn lightbox__prev', 'Previous photo', '‹');
    nextButton = makeButton('lightbox__btn lightbox__next', 'Next photo', '›');
    counter = document.createElement('p');
    counter.className = 'lightbox__counter';
    counter.setAttribute('aria-live', 'polite');

    layer.append(backdrop, img, closeButton, prevButton, nextButton, counter);
    document.body.append(layer);

    backdrop.addEventListener('click', close);
    closeButton.addEventListener('click', close);
    prevButton.addEventListener('click', () => show(index - 1, -1));
    nextButton.addEventListener('click', () => show(index + 1, 1));
    // Swipe left/right on phones
    layer.addEventListener('touchstart', (event) => { touchStartX = event.touches[0].clientX; }, { passive: true });
    layer.addEventListener('touchend', (event) => {
      if (touchStartX === null || urls.length < 2) return;
      const dx = event.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 45) show(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    });
    // Capture phase: while the photo is open, its keys win over the page's own
    window.addEventListener('keydown', handleKeydown, true);
  }

  function handleKeydown(event) {
    if (!layer || layer.hidden) return;
    const keys = { Escape: close, ArrowLeft: () => show(index - 1, -1), ArrowRight: () => show(index + 1, 1) };
    if (keys[event.key]) {
      event.preventDefault();
      event.stopImmediatePropagation();
      keys[event.key]();
    } else if (event.key === 'Tab') {
      // Keep keyboard focus on the lightbox buttons
      event.preventDefault();
      event.stopImmediatePropagation();
      const buttons = [closeButton, prevButton, nextButton].filter((button) => !button.hidden);
      const at = buttons.indexOf(document.activeElement);
      buttons[(at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
  }

  /** Shows photo number i (wraps around); direction slides it in from that side. */
  function show(i, direction = 0) {
    if (!urls.length) return;
    index = (i + urls.length) % urls.length;
    img.src = urls[index];
    img.alt = urls.length > 1 ? `Photo ${index + 1} of ${urls.length}` : 'Photo';
    counter.textContent = urls.length > 1 ? `${index + 1} / ${urls.length}` : '';
    prevButton.hidden = urls.length < 2;
    nextButton.hidden = urls.length < 2;
    if (direction && !reducedMotion()) {
      img.animate(
        [{ transform: `translateX(${direction * 40}px)`, opacity: 0.2 }, { transform: 'none', opacity: 1 }],
        { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    }
  }

  /** The transform that puts the big photo exactly on top of the small one. */
  function transformFrom(fromEl) {
    const from = fromEl.getBoundingClientRect();
    const to = img.getBoundingClientRect();
    if (!from.width || !to.width) return null;
    const scale = Math.max(from.width / to.width, from.height / to.height);
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${scale})`;
  }

  /** Opens the photos, starting at startIndex, growing out of fromEl (the tapped photo). */
  function open(list, startIndex = 0, fromEl = null) {
    if (!list || !list.length) return;
    if (!layer) build();
    urls = list.slice();
    // After closing, go back to the photo that was tapped
    returnFocus = (fromEl && fromEl.closest('button, a')) || document.activeElement;
    layer.hidden = false;
    document.documentElement.classList.add('has-lightbox');
    show(startIndex);
    closeButton.focus({ preventScroll: true });

    if (reducedMotion()) return;
    layer.querySelector('.lightbox__backdrop').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
    const grow = () => {
      const from = fromEl && fromEl.isConnected ? transformFrom(fromEl) : null;
      img.animate(
        from
          ? [{ transform: from, opacity: 0.7 }, { transform: 'none', opacity: 1 }]
          : [{ transform: 'scale(0.9)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    };
    // Wait until the big photo has a size, so it can grow from the small one
    if (img.complete && img.naturalWidth) grow();
    else img.addEventListener('load', grow, { once: true });
  }

  function close() {
    if (!layer || layer.hidden) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      layer.hidden = true;
      img.removeAttribute('src');
      document.documentElement.classList.remove('has-lightbox');
      if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    };
    if (reducedMotion()) {
      finish();
      return;
    }
    layer.querySelector('.lightbox__backdrop').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in' });
    img.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(0.92)', opacity: 0 }], { duration: 180, easing: 'ease-in' })
      .finished.then(finish, finish);
    setTimeout(finish, 260); // never get stuck if the animation is paused (e.g. a background tab)
  }

  return { open, close };
})();
