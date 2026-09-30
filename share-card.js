/* =====================================================================
   Class Mood Journey — share-card.js
   Draws a pretty picture of one note (1080 x 1350, the Instagram
   portrait size) for the Share / Save buttons.

   Three looks, the same as the website styles:
     modern-2026  graph-paper desk, lined paper, pixel faces, blue tape
     scribblish   soft dotted pastel, rounded paper, washi tape, doodle faces
     modern-bold  grainy zine, white paper, huge headline, lime marker, grey tape
   Background colour: the note's own mood colour, or one of 5 colours.

   MoodShareCard.render(entry, { style, color }) -> Promise<Blob> (PNG)
   entry: { mood, whatHappened, comment, name, timestamp, photoIds }
   ===================================================================== */

'use strict';

window.MoodShareCard = (function createShareCard() {
  const W = 1080;
  const H = 1350;
  const INK = '#151515';

  /** The colour choices ('mood' = the note's own mood colour). */
  const COLORS = {
    mood: null,
    lime: '#c8f25a',
    pink: '#ff9ecb',
    sky: '#8fd0ff',
    lemon: '#ffe14a',
    lavender: '#c4b5ff',
  };

  /** Fonts per look (they are all loaded by the pages already). */
  const LOOKS = {
    'modern-2026': {
      display: '"Jersey 10", monospace', heading: '"Geist", sans-serif', body: '"Geist", sans-serif', label: '"Geist Mono", monospace',
      paper: '#fbfaf6', tape: 'rgba(47, 79, 224, 0.5)', radius: 4, tilt: -1.2, upper: true,
    },
    scribblish: {
      display: '"Caveat", cursive', heading: '"Patrick Hand", cursive', body: '"Nunito", sans-serif', label: '"Patrick Hand", cursive',
      paper: '#fffaf0', tape: 'rgba(255, 159, 179, 0.7)', radius: 40, tilt: -2, upper: false,
    },
    'modern-bold': {
      display: '"Anton", Impact, sans-serif', heading: '"Archivo", sans-serif', body: '"Archivo", sans-serif', label: '"Archivo", sans-serif',
      paper: '#ffffff', tape: 'rgba(170, 170, 170, 0.75)', radius: 0, tilt: -3, upper: true,
    },
  };

  const t = (text) => (window.MoodI18n ? MoodI18n.t(text) : text);
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /** The website address printed on the picture (from site-config.js). */
  function siteUrl() {
    const config = window.MOOD_CONFIG || {};
    return config.siteUrl || `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;
  }

  function shortUrl() {
    return siteUrl().replace(/^https?:\/\//, '').replace(/\/(index\.html)?$/, '');
  }

  // ---------- Loading pictures ----------

  function loadImage(src, crossOrigin) {
    return new Promise((resolve) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // no picture? The card still works without it
      img.src = src;
    });
  }

  let spritePromise = null;
  /** One mood face from sprite.svg, in the chosen look, as an image. */
  async function loadFace(mood, style) {
    try {
      spritePromise = spritePromise || fetch('sprite.svg').then((response) => response.text());
      const doc = new DOMParser().parseFromString(await spritePromise, 'image/svg+xml');
      const symbol = doc.getElementById(`face-${style}-${mood}`);
      if (!symbol) return null;
      const defs = doc.querySelector('defs');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.getAttribute('viewBox')}" width="512" height="512">`
        + `${defs ? defs.outerHTML : ''}${symbol.innerHTML}</svg>`;
      return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    } catch {
      return null;
    }
  }

  // ---------- Drawing helpers ----------

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /** Splits text into lines that fit maxWidth; the last allowed line gets "…". */
  function wrap(ctx, text, maxWidth, maxLines) {
    const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = word;
        while (ctx.measureText(line).width > maxWidth && line.length > 1) { // one very long word: cut it
          let cut = line.length - 1;
          while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut -= 1;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      let last = kept[maxLines - 1];
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      kept[maxLines - 1] = `${last}…`;
      return kept;
    }
    return lines;
  }

  /**
   * Where each photo goes in a collage of n photos (1-5), inside x/y/w/h:
   *   1: one big   2: side by side   3: one big left + two stacked right
   *   4: a 2x2 grid   5: two on top + three below
   * wide = the photos are mostly landscape: then 2 are stacked in rows and
   * 3 are one big on top + two below, so landscape photos aren't squeezed.
   */
  function collageCells(n, x, y, w, h, gap, wide = false) {
    const half = (size) => (size - gap) / 2;
    const third = (w - gap * 2) / 3;
    if (n <= 1) return [{ x, y, w, h }];
    if (n === 2 && wide) return [{ x, y, w, h: half(h) }, { x, y: y + half(h) + gap, w, h: half(h) }];
    if (n === 3 && wide) {
      const bigH = (h - gap) * 0.6;
      const smallH = h - gap - bigH;
      return [
        { x, y, w, h: bigH },
        { x, y: y + bigH + gap, w: half(w), h: smallH },
        { x: x + half(w) + gap, y: y + bigH + gap, w: half(w), h: smallH },
      ];
    }
    if (n === 2) return [{ x, y, w: half(w), h }, { x: x + half(w) + gap, y, w: half(w), h }];
    if (n === 3) {
      const bigW = (w - gap) * 0.6;
      const smallW = w - gap - bigW;
      return [
        { x, y, w: bigW, h },
        { x: x + bigW + gap, y, w: smallW, h: half(h) },
        { x: x + bigW + gap, y: y + half(h) + gap, w: smallW, h: half(h) },
      ];
    }
    if (n === 4) {
      return [0, 1, 2, 3].map((i) => ({ x: x + (i % 2) * (half(w) + gap), y: y + Math.floor(i / 2) * (half(h) + gap), w: half(w), h: half(h) }));
    }
    return [
      { x, y, w: half(w), h: half(h) },
      { x: x + half(w) + gap, y, w: half(w), h: half(h) },
      ...[0, 1, 2].map((i) => ({ x: x + i * (third + gap), y: y + half(h) + gap, w: third, h: half(h) })),
    ];
  }

  /** Width / height of a photo after turning it (90° or 270° swaps the sides). */
  function turnedAspect(img, rotate) {
    const quarter = (rotate / 90) % 2 === 1;
    return quarter ? img.naturalHeight / img.naturalWidth : img.naturalWidth / img.naturalHeight;
  }

  /**
   * Draws one photo into a box, with the choices from the share window:
   *   rotate: 0 / 90 / 180 / 270
   *   fit: 'fill' (cover the box, cropping the rest) or 'fit' (whole photo, uncropped)
   *   pos: which part stays when it's cropped: 'center', 'start' (left/top) or 'end'
   */
  function drawPhoto(ctx, img, box, edit = {}) {
    const rotate = [0, 90, 180, 270].includes(edit.rotate) ? edit.rotate : 0;
    const fit = edit.fit === 'fit' ? 'fit' : 'fill';
    const quarter = (rotate / 90) % 2 === 1;
    // In the turned picture's own direction, the box is w x h (or h x w when turned a quarter)
    const bw = quarter ? box.h : box.w;
    const bh = quarter ? box.w : box.h;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = fit === 'fit' ? Math.min(bw / iw, bh / ih) : Math.max(bw / iw, bh / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    let dx = -dw / 2;
    let dy = -dh / 2;
    if (fit === 'fill') { // move the crop
      if (edit.pos === 'start') { if (dw > bw) dx = -bw / 2; if (dh > bh) dy = -bh / 2; }
      if (edit.pos === 'end') { if (dw > bw) dx = bw / 2 - dw; if (dh > bh) dy = bh / 2 - dh; }
    }
    // Drawn on its own small canvas first, so the filter only touches the photo
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(box.w));
    off.height = Math.max(1, Math.round(box.h));
    const octx = off.getContext('2d', { willReadFrequently: true });
    if (fit === 'fit') { // soft background around an uncropped photo
      octx.fillStyle = '#ece8df';
      octx.fillRect(0, 0, off.width, off.height);
    }
    octx.translate(off.width / 2, off.height / 2);
    octx.rotate((rotate * Math.PI) / 180);
    octx.drawImage(img, dx, dy, dw, dh);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    applyFilter(octx, off.width, off.height, edit.filter, edit.tint);
    ctx.drawImage(off, box.x, box.y, box.w, box.h);
  }

  // ---------- Photo filters ----------

  const FILTERS = ['normal', 'saturated', 'bw', 'mono', 'texture'];

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return [255, 225, 74];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /** Same "random" grain every redraw, so the picture doesn't flicker. */
  function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * saturated = stronger colours, bw = punchy black & white,
   * mono = one colour (dark ink → the picture's colour), texture = faded film with grain.
   */
  function applyFilter(ctx, w, h, filter, tint) {
    if (!FILTERS.includes(filter) || filter === 'normal') return;
    let image;
    try {
      image = ctx.getImageData(0, 0, w, h);
    } catch {
      return; // the photo couldn't be read: leave it as it is
    }
    const d = image.data;
    const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
    const [tr, tg, tb] = hexToRgb(tint);
    // Mono: shadows = very dark version of the colour, highlights = light version of it
    const dark = [tr * 0.12, tg * 0.12, tb * 0.12];
    const light = [tr + (255 - tr) * 0.55, tg + (255 - tg) * 0.55, tb + (255 - tb) * 0.55];
    const random = seededRandom(w * 7919 + h);
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (filter === 'saturated') {
        r = lum + (r - lum) * 1.75;
        g = lum + (g - lum) * 1.75;
        b = lum + (b - lum) * 1.75;
        r = (r - 128) * 1.08 + 128;
        g = (g - 128) * 1.08 + 128;
        b = (b - 128) * 1.08 + 128;
      } else if (filter === 'bw') {
        r = g = b = (lum - 128) * 1.35 + 128;
      } else if (filter === 'mono') {
        const k = clamp((lum - 128) * 1.15 + 128) / 255;
        r = dark[0] + (light[0] - dark[0]) * k;
        g = dark[1] + (light[1] - dark[1]) * k;
        b = dark[2] + (light[2] - dark[2]) * k;
      } else if (filter === 'texture') {
        const grain = (random() - 0.5) * 46;
        r = r * 0.86 + 26 + 8 + grain; // faded blacks, a bit warm
        g = g * 0.86 + 26 + 2 + grain;
        b = b * 0.86 + 26 - 8 + grain;
      }
      d[i] = clamp(r);
      d[i + 1] = clamp(g);
      d[i + 2] = clamp(b);
    }
    ctx.putImageData(image, 0, 0);
    if (filter === 'texture') { // soft dark corners + a few dust specks
      const glow = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
      glow.addColorStop(0, 'rgba(0, 0, 0, 0)');
      glow.addColorStop(1, 'rgba(40, 25, 10, 0.35)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      for (let s = 0; s < Math.round((w * h) / 9000); s += 1) {
        ctx.fillStyle = random() < 0.5 ? 'rgba(255, 250, 235, 0.55)' : 'rgba(30, 20, 10, 0.35)';
        ctx.beginPath();
        ctx.arc(random() * w, random() * h, 0.6 + random() * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Draws an image like CSS object-fit: cover. */
  function drawCover(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }

  function tape(ctx, x, y, w, h, angle, color, striped) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    if (striped) { // washi tape stripes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      for (let sx = -w / 2; sx < w / 2; sx += 26) ctx.fillRect(sx, -h / 2, 12, h);
    }
    ctx.restore();
  }

  function moodColors(mood) {
    const colors = window.Moods.parts(mood).map((part) => cssVar(`--mood-${part}`) || '#ffe14a');
    return colors.length === 2 ? colors : [colors[0], colors[0]];
  }

  function formatDate(timestamp) {
    const locale = window.MoodI18n ? MoodI18n.locale() : undefined;
    return new Date(timestamp).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  function clean(text) {
    if (!text) return '';
    return window.MoodSettings && window.MoodSettings.isCensorOn() && window.MoodCensor
      ? MoodCensor.censorPlain(text, '✱✱✱')
      : text;
  }

  // ---------- Backgrounds (one per look) ----------

  function drawBackground(ctx, style, colorA, colorB) {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, colorA);
    bg.addColorStop(1, colorB);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    if (style === 'modern-2026') { // graph paper
      ctx.strokeStyle = 'rgba(21, 21, 21, 0.1)';
      ctx.lineWidth = 2;
      for (let x = 0; x <= W; x += 54) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    } else if (style === 'scribblish') { // soft dots + a few doodles
      ctx.fillStyle = 'rgba(59, 52, 70, 0.14)';
      for (let x = 30; x < W; x += 44) for (let y = 30; y < H; y += 44) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      [[960, 150], [120, 1150]].forEach(([cx, cy]) => { // little sparkles
        ctx.beginPath(); ctx.moveTo(cx - 26, cy); ctx.lineTo(cx + 26, cy); ctx.moveTo(cx, cy - 26); ctx.lineTo(cx, cy + 26); ctx.stroke();
      });
    } else { // modern-bold: grain
      const grain = ctx.getImageData(0, 0, W, H);
      const data = grain.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 34;
        data[i] += noise; data[i + 1] += noise; data[i + 2] += noise;
      }
      ctx.putImageData(grain, 0, 0);
    }
  }

  // ---------- The picture ----------

  async function render(entry, options = {}) {
    const style = LOOKS[options.style] ? options.style : 'modern-2026';
    const look = LOOKS[style];
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: style === 'modern-bold' });

    if (document.fonts) {
      await Promise.all([`400 90px ${look.display}`, `700 60px ${look.heading}`, `500 36px ${look.body}`, `700 30px ${look.label}`]
        .map((font) => document.fonts.load(font).catch(() => {})));
    }

    const [colorA, colorB] = COLORS[options.color] ? [COLORS[options.color], COLORS[options.color]] : moodColors(entry.mood);
    const parts = window.Moods.parts(entry.mood);
    // Which photos: 'all' (collage, the default), one photo (its number), or 'none'
    const ids = (entry.photoIds || []).slice(0, 5);
    let chosen = ids.map((id, index) => index); // photo numbers in the note
    if (options.photos === 'none') chosen = [];
    else if (Number.isInteger(options.photos) && ids[options.photos]) chosen = [options.photos];
    const [faceA, faceB, ...loaded] = await Promise.all([
      loadFace(parts[0], style),
      parts[1] ? loadFace(parts[1], style) : null,
      ...chosen.map((index) => loadImage(MoodApi.photoCorsUrl(ids[index], chosen.length > 1 ? 1000 : 1400), true)),
    ]);
    // Each photo with its own edits (rotate / fill or fit / crop position) from the share window
    const edits = options.photoEdits || {};
    // One filter for all photos; Mono uses the picture's colour
    const photoLook = { filter: options.filter, tint: colorA };
    const photos = loaded
      .map((img, i) => (img ? { img, edit: { ...(edits[chosen[i]] || {}), ...photoLook } } : null))
      .filter(Boolean);
    const photo = photos[0] || null;

    drawBackground(ctx, style, colorA, colorB);

    // Top: "MoodBoard"
    ctx.fillStyle = INK;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `800 42px ${look.label}`;
    ctx.fillText('MoodBoard', 70, 108);

    // ----- The paper note -----
    const card = { x: 90, y: 170, w: W - 180, h: 930 };
    ctx.save();
    ctx.translate(W / 2, card.y + card.h / 2);
    ctx.rotate((look.tilt * Math.PI) / 180);
    ctx.translate(-W / 2, -(card.y + card.h / 2));

    if (style === 'scribblish') { // soft shadow
      ctx.save();
      ctx.shadowColor = 'rgba(59, 52, 70, 0.35)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 18;
      ctx.fillStyle = look.paper;
      roundRect(ctx, card.x, card.y, card.w, card.h, look.radius);
      ctx.fill();
      ctx.restore();
    } else { // hard offset shadow
      ctx.fillStyle = INK;
      roundRect(ctx, card.x + 20, card.y + 20, card.w, card.h, look.radius);
      ctx.fill();
    }
    ctx.fillStyle = look.paper;
    roundRect(ctx, card.x, card.y, card.w, card.h, look.radius);
    ctx.fill();

    if (style === 'modern-2026') { // lined paper + red margin
      ctx.save();
      roundRect(ctx, card.x, card.y, card.w, card.h, look.radius);
      ctx.clip();
      ctx.strokeStyle = 'rgba(80, 140, 220, 0.18)';
      ctx.lineWidth = 2;
      for (let ly = card.y + 60; ly < card.y + card.h; ly += 48) { ctx.beginPath(); ctx.moveTo(card.x, ly); ctx.lineTo(card.x + card.w, ly); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(224, 36, 94, 0.35)';
      ctx.beginPath(); ctx.moveTo(card.x + 38, card.y); ctx.lineTo(card.x + 38, card.y + card.h); ctx.stroke();
      ctx.restore();
    }

    ctx.lineWidth = style === 'scribblish' ? 4 : 6;
    ctx.strokeStyle = style === 'scribblish' ? '#3b3446' : INK;
    if (style === 'scribblish') ctx.setLineDash([22, 10]);
    roundRect(ctx, card.x, card.y, card.w, card.h, look.radius);
    ctx.stroke();
    ctx.setLineDash([]);

    // Tape
    if (style === 'modern-bold') { // two grey pieces on the corners
      tape(ctx, card.x + 40, card.y + 10, 170, 50, -38, look.tape);
      tape(ctx, card.x + card.w - 40, card.y + 10, 170, 50, 38, look.tape);
    } else {
      tape(ctx, W / 2, card.y + 4, 250, 56, -4, look.tape, style === 'scribblish');
    }

    // ----- Layout inside the note -----
    const pad = 64;
    const innerX = card.x + pad;
    const innerW = card.w - pad * 2;
    const footerY = card.y + card.h - 64;
    const comment = clean(entry.comment);
    const big = !photo; // no photo: bigger face and text, centred on the paper
    const faceSize = big ? 170 : 124;
    const whatSize = big ? 78 : 64;
    const whatFont = style === 'modern-bold' ? `400 ${whatSize + 12}px ${look.display}` : `800 ${whatSize}px ${look.heading}`;
    const whatLineH = Math.round((style === 'modern-bold' ? whatSize + 12 : whatSize) * 1.18);
    const commentSize = big ? 40 : 36;
    const commentFont = style === 'scribblish' ? `400 ${commentSize + 8}px ${look.display}` : `500 ${commentSize}px ${look.body}`;
    const commentLineH = big ? 56 : 50;

    ctx.font = whatFont;
    const whatText = look.upper && style === 'modern-bold' ? clean(entry.whatHappened).toUpperCase() : clean(entry.whatHappened);
    const whatLines = wrap(ctx, whatText, innerW, big ? 4 : 2);
    ctx.font = commentFont;
    const commentLines = comment ? wrap(ctx, `“${comment}”`, innerW, big ? 5 : 2) : [];
    const blockH = faceSize + 44 + whatLines.length * whatLineH + 16 + (commentLines.length ? commentLines.length * commentLineH + 20 : 0);
    const top = card.y + 72;
    let y = big ? top + Math.max(0, (footerY - 56 - top - blockH) / 2) : top;

    // Mood: face(s) + name + date
    if (faceA) {
      ctx.imageSmoothingEnabled = style !== 'modern-2026'; // crisp pixel faces
      ctx.drawImage(faceA, innerX, y, faceSize, faceSize);
      if (faceB) ctx.drawImage(faceB, innerX + faceSize * 0.62, y, faceSize, faceSize);
      ctx.imageSmoothingEnabled = true;
    }
    const nameX = innerX + (faceB ? faceSize * 1.62 : faceSize) + 28;
    const nameMax = card.x + card.w - pad - nameX;
    const moodName = parts.map((part) => t(window.Moods.name(part))).join(' + ');
    const nameText = look.upper ? moodName.toUpperCase() : moodName;
    const nameFont = style === 'modern-2026' ? `400 76px ${look.display}` : style === 'scribblish' ? `700 72px ${look.display}` : `400 68px ${look.display}`;
    ctx.font = nameFont;
    const nameLine = wrap(ctx, nameText, nameMax, 1)[0];
    const nameBase = y + faceSize / 2 + 14;
    if (style === 'modern-bold') { // lime marker behind the mood name
      ctx.fillStyle = 'rgba(200, 242, 90, 0.95)';
      ctx.fillRect(nameX - 8, nameBase - 46, Math.min(nameMax, ctx.measureText(nameLine).width) + 16, 40);
    }
    ctx.fillStyle = INK;
    ctx.fillText(nameLine, nameX, nameBase);
    ctx.font = `500 28px ${look.label}`;
    ctx.fillStyle = 'rgba(21, 21, 21, 0.62)';
    ctx.fillText(formatDate(entry.timestamp), nameX, nameBase + 42);
    y += faceSize + 44;

    // What happened
    ctx.fillStyle = INK;
    ctx.font = whatFont;
    for (const line of whatLines) {
      ctx.fillText(line, innerX, y + whatLineH * 0.8);
      y += whatLineH;
    }
    y += 16;

    // Comment
    if (commentLines.length) {
      ctx.font = commentFont;
      ctx.fillStyle = 'rgba(21, 21, 21, 0.78)';
      for (const line of commentLines) {
        ctx.fillText(line, innerX, y + commentLineH * 0.72);
        y += commentLineH;
      }
      y += 20;
    }

    // Photo(s): fill the rest of the note (above the author line)
    if (photos.length) {
      const photoH = Math.max(160, footerY - 44 - y);
      const photoR = style === 'scribblish' ? 26 : style === 'modern-bold' ? 0 : 6;
      // Mostly landscape photos (after turning)? Then use the row layouts
      const avgAspect = photos.reduce((sum, p) => sum + turnedAspect(p.img, p.edit.rotate || 0), 0) / photos.length;
      collageCells(photos.length, innerX, y, innerW, photoH, 12, avgAspect > 1.15).forEach((cell, index) => {
        ctx.save();
        roundRect(ctx, cell.x, cell.y, cell.w, cell.h, photoR);
        ctx.clip();
        drawPhoto(ctx, photos[index].img, cell, photos[index].edit);
        ctx.restore();
        ctx.lineWidth = 5;
        ctx.strokeStyle = INK;
        roundRect(ctx, cell.x, cell.y, cell.w, cell.h, photoR);
        ctx.stroke();
      });
    }

    // Author
    ctx.font = `700 30px ${look.label}`;
    ctx.fillStyle = INK;
    const author = entry.name ? t(`by ${clean(entry.name)}`) : t('anonymous');
    ctx.fillText(`✎ ${author}`, innerX, footerY);
    ctx.restore(); // end of the tilted note

    // ----- Bottom: invitation + link pill -----
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = style === 'modern-bold' ? `400 54px ${look.display}` : style === 'scribblish' ? `700 60px ${look.display}` : `400 58px ${look.display}`;
    const invite = t('How was class today?');
    ctx.fillText(look.upper ? invite.toUpperCase() : invite, W / 2, 1192);
    ctx.font = `700 30px ${look.label}`;
    const link = shortUrl();
    const pillW = Math.min(W - 120, ctx.measureText(link).width + 90);
    ctx.fillStyle = INK;
    roundRect(ctx, (W - pillW) / 2, 1226, pillW, 70, style === 'modern-2026' ? 6 : 35);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`🔗 ${link}`, W / 2, 1272);
    ctx.textAlign = 'left';

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make the picture'))), 'image/png');
    });
  }

  /** The picture's main colour (the chosen one, or the note's mood colour). */
  function tintFor(entry, color) {
    return COLORS[color] || moodColors(entry.mood)[0];
  }

  const previewCache = new Map();
  /**
   * Small squares of one photo with each filter, for the filter buttons.
   * Returns { filter: dataURL } (empty when the photo can't be loaded).
   */
  async function filterPreviews(entry, photoIndex, color) {
    const id = (entry.photoIds || [])[photoIndex];
    if (!id) return {};
    const tint = tintFor(entry, color);
    const key = `${id}|${tint}`;
    if (!previewCache.has(key)) {
      previewCache.set(key, loadImage(MoodApi.photoCorsUrl(id, 200), true).then((img) => {
        if (!img) return {};
        const size = 116;
        const result = {};
        FILTERS.forEach((filter) => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          drawPhoto(canvas.getContext('2d'), img, { x: 0, y: 0, w: size, h: size }, { filter, tint });
          try { result[filter] = canvas.toDataURL('image/jpeg', 0.85); } catch { /* not readable */ }
        });
        return result;
      }));
    }
    return previewCache.get(key);
  }

  return { render, siteUrl, filterPreviews, COLORS, FILTERS, STYLES: Object.keys(LOOKS) };
})();
