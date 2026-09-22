// Petrosa Carousel Studio - motore di rendering slide (canvas 1080x1350, formato 4:5 Instagram/TikTok)
(function () {
  // Due formati nativi: 'post' 1080x1350 (carosello 4:5) e 'reel' 1080x1920 (9:16, con margini di sicurezza per l'interfaccia di Instagram/TikTok)
  const W = 1080;
  let H = 1350, BM = 130, TP = 0, XR = 0, FS = 1, LAST = 0, REEL = false;
  const C = { bg: '#07030c', amber: '#f59e0b', orange: '#ea580c', purple: '#8b5cf6', magenta: '#c026d3', text: '#f3e8ff', soft: '#c4b5fd', green: '#1DB954' };
  let BRAND = '"Cinzel Decorative", "Trajan Pro", Georgia, serif';
  let BODY = '"Space Grotesk", "Segoe UI", Arial, sans-serif';
  let SERIF = 'Georgia, "Times New Roman", serif';
  let DW = 900, QS = 'italic 500', CAPS = false;
  let T = { bg: 'smoke', pal: 'ember', font: 'classic', photo: 'natural', hook: 'photo', seed: 1 };
  const lighten = (hex, t) => window.Styles.mix(hex, '#ffffff', t);
  const HI = () => lighten(C.amber, 0.55);
  function applyTheme(theme) {
    T = Object.assign({}, window.Styles.DEFAULT, theme || {});
    const p = window.Styles.PALETTES[T.pal] || window.Styles.PALETTES.ember;
    Object.assign(C, { bg: p.bg, amber: p.a1, orange: p.a2, purple: p.a3, magenta: p.a4, text: p.text, soft: p.soft });
    const f = window.Styles.FONTS[T.font] || window.Styles.FONTS.classic;
    BRAND = `"${f.display}", Georgia, serif`; BODY = `"${f.body}", "Segoe UI", Arial, sans-serif`;
    SERIF = `"${f.quote}", Georgia, "Times New Roman", serif`; DW = f.dw; QS = f.qs; CAPS = f.caps;
    return p;
  }
  const IMG_KEYS = ['cover', 'logo', 'antonio', 'giorgio', 'aldo', 'andrea', 'desert1', 'desert2', 'desert3'];
  const FOCUS = { aldo: [0.62, 0.3], giorgio: [0.62, 0.35], antonio: [0.5, 0.3], andrea: [0.5, 0.3] };
  const images = {};

  // Le foto live (molte) si caricano a richiesta: solo quelle usate dalle slide correnti
  const pending = new Map();
  function loadOne(k) {
    if (!k || k === 'none' || images[k]) return Promise.resolve();
    if (pending.has(k)) return pending.get(k);
    const pr = new Promise(res => {
      const im = new Image();
      im.onload = () => { images[k] = im; res(true); };
      im.onerror = () => res(false);
      im.src = `/assets/${k}.jpg`;
    });
    pending.set(k, pr);
    return pr;
  }
  function loadImages() { return Promise.all(IMG_KEYS.map(loadOne)); }
  const need = slides => Promise.all([...new Set((slides || []).map(s => s.immagine))].map(loadOne));
  let imgTimer = null;
  function ensure(k) {
    if (!k || k === 'none' || images[k] || pending.has(k)) return;
    loadOne(k).then(ok => { if (ok && api.onImage) { clearTimeout(imgTimer); imgTimer = setTimeout(api.onImage, 30); } });
  }
  async function ensureFonts(theme) {
    const f = window.Styles.FONTS[(theme && theme.font) || 'classic'] || window.Styles.FONTS.classic;
    try {
      await Promise.all([
        document.fonts.load(`${f.dw} 60px "${f.display}"`), document.fonts.load(`500 30px "${f.body}"`),
        document.fonts.load(`700 30px "${f.body}"`), document.fonts.load(`${f.qs} 30px "${f.quote}"`)
      ]);
    } catch (e) { /* fallback su font di sistema */ }
  }
  const loadFonts = () => ensureFonts();

  // PRNG deterministico: il render e' identico a ogni ridisegno
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function coverImg(ctx, img, x, y, w, h, fx = 0.5, fy = 0.5, treat = true) {
    if (!img) return;
    const sc = Math.max(w / img.width, h / img.height);
    const dw = img.width * sc, dh = img.height * sc;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const base = ctx.filter && ctx.filter !== 'none' ? ctx.filter + ' ' : '';
    const mode = treat ? T.photo : 'natural';
    if (mode !== 'natural') ctx.filter = base + 'grayscale(1) contrast(1.25) brightness(1.05)';
    ctx.drawImage(img, x - (dw - w) * fx, y - (dh - h) * fy, dw, dh);
    if (mode === 'duotone') {
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = lighten(C.amber, 0.15); ctx.fillRect(x, y, w, h);
      ctx.globalCompositeOperation = 'lighten'; ctx.fillStyle = window.Styles.mix(C.bg, C.purple, 0.55); ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  function background(ctx, seed) {
    window.Styles.draw(T.bg, ctx, window.Styles.PALETTES[T.pal] || window.Styles.PALETTES.ember, seed);
    // velo di leggibilita' per il testo, piu' forte nella fascia centrale
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hexA(C.bg, 0.1)); g.addColorStop(0.3, hexA(C.bg, 0.5)); g.addColorStop(0.85, hexA(C.bg, 0.55)); g.addColorStop(1, hexA(C.bg, 0.75));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function grain(ctx, seed, amt) {
    const r = rng(seed * 31 + 5);
    ctx.save();
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${amt * r()})` : `rgba(0,0,0,${amt * 2 * r()})`;
      ctx.fillRect(r() * W, r() * H, 2, 2);
    }
    ctx.restore();
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function shade(ctx, y0, y1, a0, a1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, hexA(C.bg, a0)); g.addColorStop(1, hexA(C.bg, a1));
    ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  }

  function wrap(ctx, text, maxW) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(''); continue; }
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  }
  function fit(ctx, text, font, maxW, maxH, max, min, lh) {
    // Scende sotto "min" solo se serve: un testo senza spazi (es. un numero come "30-90") non va mai a capo,
    // quindi il solo controllo sull'altezza non basta a garantire che resti dentro il riquadro in larghezza.
    let res;
    for (let s = Math.round(max * FS); s >= 20; s -= 2) {
      ctx.font = font(s);
      const lines = wrap(ctx, text, maxW);
      const w = Math.max(0, ...lines.map(l => ctx.measureText(l).width));
      res = { size: s, lines, h: lines.length * s * lh };
      if (res.h <= maxH && w <= maxW) return res;
    }
    return res;
  }
  function drawLines(ctx, f, x, y, lh, align = 'left') {
    ctx.textAlign = align; ctx.textBaseline = 'top';
    f.lines.forEach((l, i) => ctx.fillText(l, x, y + i * f.size * lh));
  }
  function gradFill(ctx, x0, x1, a = C.amber, b = C.orange, c = C.magenta) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, a); g.addColorStop(0.55, b); g.addColorStop(1, c);
    return g;
  }
  function glow(ctx, col, blur) { ctx.shadowColor = col; ctx.shadowBlur = blur; }
  function noGlow(ctx) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }

  function kicker(ctx, text, x, y, col = C.amber) {
    ctx.font = `700 26px ${BODY}`; ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const t = String(text || '').toUpperCase().split('').join(' ');
    ctx.fillText(t, x, y);
    return ctx.measureText(t).width;
  }

  function chrome(ctx, i, n, handle, last) {
    // logo tondo + wordmark (nel Reel scende sotto la fascia coperta dall'interfaccia di Instagram/TikTok)
    const lg = images.logo, cy = REEL ? 270 : 96;
    ctx.save();
    ctx.beginPath(); ctx.arc(96, cy, 36, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = '#000'; ctx.fill();
    ctx.clip();
    if (lg) ctx.drawImage(lg, 96 - 46, cy - 32, 92, 65);
    ctx.restore();
    ctx.beginPath(); ctx.arc(96, cy, 37, 0, Math.PI * 2); ctx.strokeStyle = C.amber; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = `${DW} 34px ${BRAND}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = gradFill(ctx, 150, 360); ctx.fillText('PETROSA', 150, cy + 2);
    if (REEL) {   // niente numerazione ne' "swipe": in alto a destra solo l'handle
      ctx.font = `700 26px ${BODY}`; ctx.textAlign = 'right'; ctx.fillStyle = C.soft; ctx.fillText(handle || '@petrosa_band', W - 72, cy + 2);
      return;
    }
    // numerazione
    ctx.font = `700 26px ${BODY}`; ctx.textAlign = 'right'; ctx.fillStyle = C.soft;
    ctx.fillText(`${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, W - 72, 98);
    // footer
    ctx.strokeStyle = hexA(C.amber, 0.45); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(72, H - 96); ctx.lineTo(W - 72, H - 96); ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.font = `700 28px ${BODY}`; ctx.fillStyle = C.amber; ctx.textAlign = 'left';
    ctx.fillText(handle || '@petrosa_band', 72, H - 56);
    if (!last) { ctx.textAlign = 'right'; ctx.fillStyle = C.soft; ctx.fillText('SWIPE  →', W - 72, H - 56); }
  }

  function tagChips(ctx, tags, y) {
    if (!tags || !tags.length) return;
    ctx.font = `700 28px ${BODY}`; ctx.textBaseline = 'middle';
    let x = 72; let row = 0;
    tags.forEach(t => {
      const label = '@' + t.replace(/^@/, '');
      const w = ctx.measureText(label).width + 44;
      if (x + w > W - 72) { x = 72; row++; }
      const yy = y + row * 64;
      rr(ctx, x, yy, w, 50, 25);
      ctx.fillStyle = hexA(C.purple, 0.28); ctx.fill();
      ctx.strokeStyle = hexA(C.amber, 0.7); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(label, x + 22, yy + 26);
      x += w + 14;
    });
  }
  function tagBlockHeight(ctx, tags) {
    if (!tags || !tags.length) return 0;
    ctx.font = `700 28px ${BODY}`;
    let x = 72, row = 0;
    tags.forEach(t => { const w = ctx.measureText('@' + t).width + 44; if (x + w > W - 72) { x = 72; row++; } x += w + 14; });
    return (row + 1) * 64 + 10;
  }

  // ---------- Layout ----------
  const L = {};

  L.hook = (ctx, s, i, n) => {
    const img = images[s.immagine] || images.cover;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const f = FOCUS[s.immagine] || [0.5, 0.35];
    if (T.hook === 'frame') {
      // foto (copertina o scatto live) incorniciata e leggermente ruotata sopra uno sfondo generativo.
      // Da quando la copertina delle hook e' quasi sempre una foto live (niente piu' immagini doppie
      // nello stesso post), lo stile "incorniciata" deve valere per qualunque immagine, non solo per
      // l'artwork dell'album, altrimenti sarebbe visibile solo nei rari casi con la copertina letterale.
      background(ctx, i + 1);
      const sz = 580, cx = W / 2, cy = 430 + TP;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(((T.seed % 7) - 3) * 0.014);
      glow(ctx, hexA(C.amber, 0.55), 60); rr(ctx, -sz / 2, -sz / 2, sz, sz, 14); ctx.fillStyle = '#000'; ctx.fill(); noGlow(ctx);
      ctx.save(); rr(ctx, -sz / 2, -sz / 2, sz, sz, 14); ctx.clip(); coverImg(ctx, img, -sz / 2, -sz / 2, sz, sz, f[0], f[1]); ctx.restore();
      rr(ctx, -sz / 2, -sz / 2, sz, sz, 14); ctx.strokeStyle = hexA(C.amber, 0.9); ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();
      shade(ctx, 0, 220, 0.6, 0); shade(ctx, 700 + TP * 2, H, 0, 0.97);
      return;
    }
    if (img === images.cover) {
      // copertina quadrata intera (con il logotipo) su sfondo sfocato
      ctx.save(); ctx.filter = 'blur(30px) saturate(1.2)'; coverImg(ctx, img, -60, -60, W + 120, H + 120); ctx.restore(); ctx.filter = 'none';
      shade(ctx, 0, H, 0.35, 0.5);
      ctx.drawImage(img, 0, 110 + TP, W, W);
      shade(ctx, 0, 300, 0.75, 0); shade(ctx, 700 + TP * 2, H, 0, 0.97);
    } else if (REEL) {
      // Reel: la foto (3:4) occupa la parte alta senza tagli ai lati, poi sfuma nel nero dove sta il testo
      const HH = 1450; coverImg(ctx, img, 0, 0, W, HH, f[0], 0.12);
      shade(ctx, 0, 380, 0.75, 0); shade(ctx, HH - 700, HH, 0, 1); ctx.fillStyle = C.bg; ctx.fillRect(0, HH, W, H - HH);
    } else { coverImg(ctx, img, 0, 0, W, H, f[0], f[1]); shade(ctx, 0, 300, 0.75, 0); shade(ctx, 700, H, 0, 0.97); }
    grain(ctx, i + 1, 0.05);
  };
  L.hookText = (ctx, s) => {
    const tagH = tagBlockHeight(ctx, s.tag);
    const bottom = H - BM - tagH;
    const body = fit(ctx, s.corpo || '', z => `500 ${z}px ${BODY}`, W - 144 - XR, 200, 40, 28, 1.3);
    const bodyTop = bottom - body.h;
    const ttl = fit(ctx, s.titolo || '', z => `${DW} ${z}px ${BRAND}`, W - 144 - XR, 460, 110, 52, 1.12);
    const ttlTop = bodyTop - 40 - ttl.h;
    kicker(ctx, s.tipo || 'Petrosa', 72, ttlTop - 56);
    ctx.font = `${DW} ${ttl.size}px ${BRAND}`; glow(ctx, hexA(C.orange, 0.7), 30);
    ctx.fillStyle = gradFill(ctx, 72, W - 72, HI(), C.amber, C.orange);
    drawLines(ctx, ttl, 72, ttlTop, 1.12); noGlow(ctx);
    ctx.font = `500 ${body.size}px ${BODY}`; ctx.fillStyle = C.text; drawLines(ctx, body, 72, bodyTop, 1.3);
    tagChips(ctx, s.tag, bottom + 20);
  };

  L.quote = (ctx, s, i) => {
    background(ctx, i + 3);
    if (images[s.immagine] && s.immagine !== 'none') { ctx.globalAlpha = 0.22; coverImg(ctx, images[s.immagine], 0, 0, W, H, 0.5, 0.35); ctx.globalAlpha = 1; shade(ctx, 0, H, 0.55, 0.85); }
    kicker(ctx, s.tipo || 'Citazione', 72, 190 + TP);
    ctx.font = `${DW} 200px ${BRAND}`; ctx.fillStyle = hexA(C.amber, 0.85); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText('“', 60, 200 + TP);
    const q = String(s.citazione || s.titolo || '').replace(/\s\/\s/g, '\n');
    const fontQ = z => `${QS} ${z}px ${SERIF}`;
    const tagH = tagBlockHeight(ctx, s.tag);
    const hasSrc = !!(s.fonte || s.titolo);
    const boxTop = 400 + TP, boxBottom = H - BM - 120 - tagH - (s.corpo ? 90 : 0);
    const f = fit(ctx, q, fontQ, W - 160 - XR, boxBottom - boxTop, 66, 30, 1.32);
    ctx.font = fontQ(f.size); ctx.fillStyle = C.text; drawLines(ctx, f, 80, boxTop, 1.32);
    let y = boxTop + f.h + 36;
    ctx.strokeStyle = C.orange; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(80, y); ctx.lineTo(220, y); ctx.stroke();
    y += 24;
    if (hasSrc) {
      const src = fit(ctx, s.fonte || s.titolo, z => `700 ${z}px ${BODY}`, W - 160 - XR, 110, 38, 26, 1.2);
      ctx.font = `700 ${src.size}px ${BODY}`; ctx.fillStyle = C.amber; drawLines(ctx, src, 80, y, 1.2); y += src.h + 14;
    }
    if (s.corpo) { const b = fit(ctx, s.corpo, z => `400 ${z}px ${BODY}`, W - 160 - XR, 90, 30, 24, 1.3); ctx.font = `400 ${b.size}px ${BODY}`; ctx.fillStyle = C.soft; drawLines(ctx, b, 80, y, 1.3); }
    LAST = y + (s.corpo ? 90 : 0);
    tagChips(ctx, s.tag, H - BM + 10 - tagH + 10);
  };

  L.stat = (ctx, s, i) => {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    background(ctx, i + 9);
    const img = images[s.immagine] || images.cover;
    if (img) { ctx.save(); ctx.globalAlpha = 0.32; ctx.filter = 'blur(26px) saturate(1.3)'; coverImg(ctx, img, -60, -60, W + 120, H + 120, 0.5, 0.5); ctx.restore(); ctx.filter = 'none'; }
    shade(ctx, 0, H, 0.35, 0.75); grain(ctx, i + 9, 0.05);
    kicker(ctx, s.tipo || 'Album', 72, 190 + TP);
    const stat = String(s.stat || '');
    if (stat) {
      const fs = fit(ctx, stat, z => `${DW} ${z}px ${BRAND}`, W - 144 - XR, 400, 400, 120, 1);
      ctx.font = `${DW} ${fs.size}px ${BRAND}`; glow(ctx, hexA(C.amber, 0.6), 50);
      ctx.fillStyle = gradFill(ctx, 72, W - 72, HI(), C.amber, C.orange);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(stat, 64, 250 + TP); noGlow(ctx);
    }
    const tagH = tagBlockHeight(ctx, s.tag);
    const top = (stat ? 720 : 300) + TP;
    const bottom = H - BM - tagH;
    const ttl = fit(ctx, s.titolo || '', z => `${DW} ${z}px ${BRAND}`, W - 144 - XR, 210, 62, 36, 1.15);
    ctx.font = `${DW} ${ttl.size}px ${BRAND}`; ctx.fillStyle = C.text; drawLines(ctx, ttl, 72, top, 1.15);
    const bTop = top + ttl.h + 26;
    const body = fit(ctx, s.corpo || '', z => `500 ${z}px ${BODY}`, W - 144 - XR, bottom - bTop, 40, 26, 1.35);
    ctx.font = `500 ${body.size}px ${BODY}`; ctx.fillStyle = C.soft; drawLines(ctx, body, 72, bTop, 1.35); LAST = bTop + body.h;
    tagChips(ctx, s.tag, bottom + 20);
  };

  L.photo = (ctx, s, i) => {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const f = FOCUS[s.immagine] || [0.5, 0.3];
    const img = images[s.immagine] || images.logo;
    if (s.immagine === 'logo' || !images[s.immagine]) {
      background(ctx, i + 5);
      if (img) { ctx.save(); ctx.globalCompositeOperation = 'screen'; const sz = 560; ctx.drawImage(img, W / 2 - sz / 2, 300, sz, sz * img.height / img.width); ctx.restore(); }
    } else {
      const PY = 0, PH = REEL ? 1450 : 1000;
      coverImg(ctx, img, 0, PY, W, PH, f[0], REEL ? 0 : f[1]);
      grain(ctx, i + 5, 0.04);
      shade(ctx, PY + PH - 480, PY + PH, 0, 0.98); shade(ctx, PY + PH, H, 0.98, 1); shade(ctx, 0, 260 + TP, 0.7, 0);
    }
    if (s.immagine === 'logo' || !images[s.immagine]) { shade(ctx, 520, 1000, 0, 0.98); shade(ctx, 1000, H, 0.98, 1); shade(ctx, 0, 260, 0.7, 0); }
    const tagH = tagBlockHeight(ctx, s.tag);
    const bottom = H - BM - tagH;
    const body = fit(ctx, s.corpo || '', z => `500 ${z}px ${BODY}`, W - 144 - XR, 170, 34, 24, 1.32);
    const bodyTop = bottom - body.h;
    const ttl = fit(ctx, s.titolo || '', z => `${DW} ${z}px ${BRAND}`, W - 144 - XR, 220, 76, 40, 1.1);
    const ttlTop = bodyTop - 24 - ttl.h;
    kicker(ctx, s.tipo === 'Band' && s.fonte ? s.fonte : (s.tipo || 'Band'), 72, ttlTop - 54);
    ctx.font = `${DW} ${ttl.size}px ${BRAND}`; glow(ctx, 'rgba(0,0,0,0.9)', 20); ctx.fillStyle = C.text; drawLines(ctx, ttl, 72, ttlTop, 1.1); noGlow(ctx);
    ctx.font = `500 ${body.size}px ${BODY}`; ctx.fillStyle = C.soft; drawLines(ctx, body, 72, bodyTop, 1.32);
    tagChips(ctx, s.tag, bottom + 20);
  };

  L.text = (ctx, s, i) => {
    background(ctx, i + 11);
    if (images[s.immagine] && s.immagine !== 'none') { ctx.globalAlpha = 0.2; coverImg(ctx, images[s.immagine], 0, 0, W, H, 0.5, 0.35); ctx.globalAlpha = 1; shade(ctx, 0, H, 0.5, 0.85); }
    kicker(ctx, s.tipo || 'Petrosa', 72, 200 + TP);
    const tagH = tagBlockHeight(ctx, s.tag);
    const ttl = fit(ctx, s.titolo || '', z => `${DW} ${z}px ${BRAND}`, W - 144 - XR, 420, 96, 44, 1.14);
    ctx.font = `${DW} ${ttl.size}px ${BRAND}`; glow(ctx, hexA(C.orange, 0.5), 24);
    ctx.fillStyle = gradFill(ctx, 72, W - 72, HI(), C.amber, C.orange); drawLines(ctx, ttl, 72, 270 + TP, 1.14); noGlow(ctx);
    let y = 270 + TP + ttl.h + 30;
    ctx.strokeStyle = C.orange; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(72, y); ctx.lineTo(232, y); ctx.stroke(); y += 40;
    const bottom = H - BM - tagH;
    const body = fit(ctx, s.corpo || '', z => `500 ${z}px ${BODY}`, W - 144 - XR, bottom - y, 50, 28, 1.38);
    ctx.font = `500 ${body.size}px ${BODY}`; ctx.fillStyle = C.text; drawLines(ctx, body, 72, y, 1.38); LAST = y + body.h;
    tagChips(ctx, s.tag, bottom + 20);
  };

  L.cta = (ctx, s, i) => {
    background(ctx, i + 17);
    const img = images.cover;
    const sz = 620, x = (W - sz) / 2, y = 190 + TP;
    if (img) {
      ctx.save(); glow(ctx, hexA(C.magenta, 0.7), 70); rr(ctx, x, y, sz, sz, 26); ctx.fillStyle = '#000'; ctx.fill(); noGlow(ctx);
      rr(ctx, x, y, sz, sz, 26); ctx.clip(); ctx.drawImage(img, x, y, sz, sz); ctx.restore();
    }
    const tagH = tagBlockHeight(ctx, s.tag);
    let ty = y + sz + 50;
    const ttl = fit(ctx, s.titolo || '', z => `${DW} ${z}px ${BRAND}`, W - 144 - XR, 200, 64, 36, 1.12);
    ctx.font = `${DW} ${ttl.size}px ${BRAND}`; ctx.fillStyle = C.text; drawLines(ctx, ttl, W / 2, ty, 1.12, 'center'); ty += ttl.h + 18;
    const body = fit(ctx, s.corpo || '', z => `400 ${z}px ${BODY}`, W - 200, 110, 30, 22, 1.3);
    ctx.font = `400 ${body.size}px ${BODY}`; ctx.fillStyle = C.soft; drawLines(ctx, body, W / 2, ty, 1.3, 'center'); ty += body.h + 26;
    // pulsante Spotify
    const bw = 700, bh = 96, bx = (W - bw) / 2;
    const by = Math.min(ty, H - BM + 10 - tagH - bh - 10);
    rr(ctx, bx, by, bw, bh, 48); ctx.fillStyle = C.green; ctx.fill();
    ctx.fillStyle = '#000'; ctx.font = `700 36px ${BODY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('▶  LISTEN ON SPOTIFY', W / 2, by + bh / 2 + 2);
    ctx.font = `700 24px ${BODY}`; ctx.fillStyle = C.soft; ctx.fillText('LINK IN BIO', W / 2, by + bh + 34);
    tagChips(ctx, s.tag, H - BM + 10 - tagH + 10);
  };

  // Video testi: una riga di testo a tutto schermo (karaoke), con una barra di avanzamento nel brano
  L.lyric = (ctx, s, i) => {
    background(ctx, i + 23);
    if (images[s.immagine] && s.immagine !== 'none') { ctx.globalAlpha = 0.16; coverImg(ctx, images[s.immagine], 0, 0, W, H, 0.5, 0.3); ctx.globalAlpha = 1; shade(ctx, 0, H, 0.6, 0.88); }
    if (s.fonte) kicker(ctx, s.fonte, 72, 210 + TP);
    const q = String(s.titolo || '').trim();
    const f = fit(ctx, q, z => `${DW} ${z}px ${BRAND}`, W - 144 - XR, H - BM - 360 - TP, 108, 44, 1.18);
    const top = TP + (H - TP - BM - f.h) / 2;
    ctx.font = `${DW} ${f.size}px ${BRAND}`; glow(ctx, hexA(C.orange, 0.55), 40);
    ctx.fillStyle = gradFill(ctx, 72, W - 72, HI(), C.amber, C.orange);
    drawLines(ctx, f, W / 2, top, 1.18, 'center'); noGlow(ctx);
    if (s._prog != null) {
      const by = H - BM - 30, bw = W - 144, bx = 72, p = Math.max(0, Math.min(1, s._prog));
      ctx.strokeStyle = hexA(C.soft, 0.28); ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by); ctx.stroke();
      if (p > 0) { ctx.strokeStyle = C.amber; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw * p, by); ctx.stroke(); }
      ctx.lineCap = 'butt';
    }
  };

  function render(canvas, s, i, n, handle, theme, fmt) {
    REEL = fmt === 'reel'; H = REEL ? 1920 : 1350; BM = REEL ? 470 : 130; TP = REEL ? 190 : 0; XR = REEL ? 60 : 0; FS = REEL ? 1.28 : 1;
    applyTheme(theme);
    ensure(s.immagine);
    const layout = ['hook', 'quote', 'stat', 'photo', 'text', 'cta', 'lyric'].includes(s.layout) ? s.layout : 'text';
    if (CAPS && s.titolo) s = Object.assign({}, s, { titolo: String(s.titolo).toUpperCase() });
    // Reel: i layout di solo testo si centrano nell'area sicura (prova su tela di servizio per misurare l'altezza, poi disegno vero)
    if (REEL && ['quote', 'stat', 'text'].includes(layout)) {
      const t = document.createElement('canvas'); t.width = W; t.height = H; LAST = 0;
      L[layout](t.getContext('2d'), s, i, n);
      const extra = Math.max(0, Math.min(380, (H - BM - LAST) * 0.7));
      TP += Math.round(extra);
    }
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    L[layout](ctx, s, i, n);
    if (layout === 'hook') L.hookText(ctx, s);
    chrome(ctx, i, n, handle, layout === 'cta' || i === n - 1);
  }

  const api = window.Renderer = { W, H, HREEL: 1920, render, loadImages, need, loadFonts, ensureFonts, images };
})();
