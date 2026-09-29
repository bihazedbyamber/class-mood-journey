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
   */
  function collageCells(n, x, y, w, h, gap) {
    const half = (size) => (size - gap) / 2;
    const third = (w - gap * 2) / 3;
    if (n <= 1) return [{ x, y, w, h }];
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
    let chosen = ids;
    if (options.photos === 'none') chosen = [];
    else if (Number.isInteger(options.photos) && ids[options.photos]) chosen = [ids[options.photos]];
    const [faceA, faceB, ...loaded] = await Promise.all([
      loadFace(parts[0], style),
      parts[1] ? loadFace(parts[1], style) : null,
      ...chosen.map((id) => loadImage(MoodApi.photoCorsUrl(id, chosen.length > 1 ? 800 : 1200), true)),
    ]);
    const photos = loaded.filter(Boolean);
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
      collageCells(photos.length, innerX, y, innerW, photoH, 12).forEach((cell, index) => {
        ctx.save();
        roundRect(ctx, cell.x, cell.y, cell.w, cell.h, photoR);
        ctx.clip();
        drawCover(ctx, photos[index], cell.x, cell.y, cell.w, cell.h);
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

  return { render, siteUrl, COLORS, STYLES: Object.keys(LOOKS) };
})();
