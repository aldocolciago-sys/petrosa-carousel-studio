// Petrosa Carousel Studio - motore di rendering slide (canvas 1080x1350, formato 4:5 Instagram/TikTok)
(function () {
  const W = 1080, H = 1350;
  const C = { bg: '#07030c', amber: '#f59e0b', orange: '#ea580c', purple: '#8b5cf6', magenta: '#c026d3', text: '#f3e8ff', soft: '#c4b5fd', green: '#1DB954' };
  const BRAND = '"Cinzel Decorative", "Trajan Pro", Georgia, serif';
  const BODY = '"Space Grotesk", "Segoe UI", Arial, sans-serif';
  const SERIF = 'Georgia, "Times New Roman", serif';
  const IMG_KEYS = ['cover', 'logo', 'antonio', 'giorgio', 'aldo', 'andrea'];
  const FOCUS = { aldo: [0.62, 0.3], giorgio: [0.62, 0.35], antonio: [0.5, 0.3], andrea: [0.5, 0.3] };
  const images = {};

  function loadImages() {
    return Promise.all(IMG_KEYS.map(k => new Promise(res => {
      const im = new Image();
      im.onload = () => { images[k] = im; res(); };
      im.onerror = () => res();
      im.src = `/assets/${k}.jpg`;
    })));
  }
  async function loadFonts() {
    try {
      await Promise.all([
        document.fonts.load('900 60px "Cinzel Decorative"'),
        document.fonts.load('700 60px "Cinzel Decorative"'),
        document.fonts.load('400 30px "Space Grotesk"'),
        document.fonts.load('700 30px "Space Grotesk"')
      ]);
    } catch (e) { /* fallback su font di sistema */ }
  }

  // PRNG deterministico: il render e' identico a ogni ridisegno
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function coverImg(ctx, img, x, y, w, h, fx = 0.5, fy = 0.5) {
    if (!img) return;
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.drawImage(img, x - (dw - w) * fx, y - (dh - h) * fy, dw, dh);
    ctx.restore();
  }

  function background(ctx, seed) {
    const r = rng(seed * 7919 + 13);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const blobs = [[C.purple, 0.22], [C.orange, 0.18], [C.magenta, 0.16], [C.amber, 0.1]];
    blobs.forEach(([col, a]) => {
      const x = r() * W, y = r() * H, rad = 420 + r() * 380;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, hexA(col, a)); g.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });
    grain(ctx, seed, 0.05);
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
    g.addColorStop(0, `rgba(7,3,12,${a0})`); g.addColorStop(1, `rgba(7,3,12,${a1})`);
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
    let res;
    for (let s = max; s >= min; s -= 2) {
      ctx.font = font(s);
      const lines = wrap(ctx, text, maxW);
      res = { size: s, lines, h: lines.length * s * lh };
      if (res.h <= maxH) return res;
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
    // logo tondo + wordmark
    const lg = images.logo;
    ctx.save();
    ctx.beginPath(); ctx.arc(96, 96, 36, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = '#000'; ctx.fill();
    ctx.clip();
    if (lg) ctx.drawImage(lg, 96 - 46, 96 - 32, 92, 65);
    ctx.restore();
    ctx.beginPath(); ctx.arc(96, 96, 37, 0, Math.PI * 2); ctx.strokeStyle = C.amber; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = `900 34px ${BRAND}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = gradFill(ctx, 150, 360); ctx.fillText('PETROSA', 150, 98);
    // numerazione
    ctx.font = `700 26px ${BODY}`; ctx.textAlign = 'right'; ctx.fillStyle = C.soft;
    ctx.fillText(`${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, W - 72, 98);
    // footer
    ctx.strokeStyle = 'rgba(245,158,11,0.45)'; ctx.lineWidth = 2;
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
      ctx.fillStyle = 'rgba(139,92,246,0.28)'; ctx.fill();
      ctx.strokeStyle = 'rgba(245,158,11,0.7)'; ctx.lineWidth = 2; ctx.stroke();
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
    if (img === images.cover) {
      // copertina quadrata intera (con il logotipo) su sfondo sfocato
      ctx.save(); ctx.filter = 'blur(30px) saturate(1.2)'; coverImg(ctx, img, -60, -60, W + 120, H + 120); ctx.restore(); ctx.filter = 'none';
      shade(ctx, 0, H, 0.35, 0.5);
      ctx.drawImage(img, 0, 110, W, W);
    } else coverImg(ctx, img, 0, 0, W, H, f[0], f[1]);
    shade(ctx, 0, 300, 0.75, 0); shade(ctx, 700, H, 0, 0.97);
    grain(ctx, i + 1, 0.05);
  };
  L.hookText = (ctx, s) => {
    const tagH = tagBlockHeight(ctx, s.tag);
    const bottom = H - 130 - tagH;
    const body = fit(ctx, s.corpo || '', z => `500 ${z}px ${BODY}`, W - 144, 200, 40, 28, 1.3);
    const bodyTop = bottom - body.h;
    const ttl = fit(ctx, s.titolo || '', z => `900 ${z}px ${BRAND}`, W - 144, 460, 110, 52, 1.12);
    const ttlTop = bodyTop - 40 - ttl.h;
    kicker(ctx, s.tipo || 'Petrosa', 72, ttlTop - 56);
    ctx.font = `900 ${ttl.size}px ${BRAND}`; glow(ctx, 'rgba(234,88,12,0.7)', 30);
    ctx.fillStyle = gradFill(ctx, 72, W - 72, '#fde68a', C.amber, C.orange);
    drawLines(ctx, ttl, 72, ttlTop, 1.12); noGlow(ctx);
    ctx.font = `500 ${body.size}px ${BODY}`; ctx.fillStyle = C.text; drawLines(ctx, body, 72, bodyTop, 1.3);
    tagChips(ctx, s.tag, bottom + 20);
  };

  L.quote = (ctx, s, i) => {
    background(ctx, i + 3);
    if (images[s.immagine] && s.immagine !== 'none') { ctx.globalAlpha = 0.22; coverImg(ctx, images[s.immagine], 0, 0, W, H, 0.5, 0.35); ctx.globalAlpha = 1; shade(ctx, 0, H, 0.55, 0.85); }
    kicker(ctx, s.tipo || 'Citazione', 72, 190);
    ctx.font = `900 200px ${BRAND}`; ctx.fillStyle = hexA(C.amber, 0.85); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText('“', 60, 200);
    const q = String(s.citazione || s.titolo || '').replace(/\s\/\s/g, '\n');
    const fontQ = z => `italic 500 ${z}px ${SERIF}`;
    const tagH = tagBlockHeight(ctx, s.tag);
    const hasSrc = !!(s.fonte || s.titolo);
    const boxTop = 400, boxBottom = H - 250 - tagH - (s.corpo ? 90 : 0);
    const f = fit(ctx, q, fontQ, W - 160, boxBottom - boxTop, 66, 30, 1.32);
    ctx.font = fontQ(f.size); ctx.fillStyle = C.text; drawLines(ctx, f, 80, boxTop, 1.32);
    let y = boxTop + f.h + 36;
    ctx.strokeStyle = C.orange; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(80, y); ctx.lineTo(220, y); ctx.stroke();
    y += 24;
    if (hasSrc) {
      const src = fit(ctx, s.fonte || s.titolo, z => `700 ${z}px ${BODY}`, W - 160, 110, 38, 26, 1.2);
      ctx.font = `700 ${src.size}px ${BODY}`; ctx.fillStyle = C.amber; drawLines(ctx, src, 80, y, 1.2); y += src.h + 14;
    }
    if (s.corpo) { const b = fit(ctx, s.corpo, z => `400 ${z}px ${BODY}`, W - 160, 90, 30, 24, 1.3); ctx.font = `400 ${b.size}px ${BODY}`; ctx.fillStyle = C.soft; drawLines(ctx, b, 80, y, 1.3); }
    tagChips(ctx, s.tag, H - 120 - tagH + 10);
  };

  L.stat = (ctx, s, i) => {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const img = images[s.immagine] || images.cover;
    if (img) { ctx.save(); ctx.filter = 'blur(28px) saturate(1.3)'; coverImg(ctx, img, -60, -60, W + 120, H + 120, 0.5, 0.5); ctx.restore(); ctx.filter = 'none'; }
    shade(ctx, 0, H, 0.6, 0.9); grain(ctx, i + 9, 0.05);
    kicker(ctx, s.tipo || 'Album', 72, 190);
    const stat = String(s.stat || '');
    if (stat) {
      const fs = fit(ctx, stat, z => `900 ${z}px ${BRAND}`, W - 144, 400, 400, 120, 1);
      ctx.font = `900 ${fs.size}px ${BRAND}`; glow(ctx, 'rgba(245,158,11,0.6)', 50);
      ctx.fillStyle = gradFill(ctx, 72, W - 72, '#fde68a', C.amber, C.orange);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(stat, 64, 250); noGlow(ctx);
    }
    const tagH = tagBlockHeight(ctx, s.tag);
    const top = stat ? 720 : 300;
    const bottom = H - 130 - tagH;
    const ttl = fit(ctx, s.titolo || '', z => `900 ${z}px ${BRAND}`, W - 144, 210, 62, 36, 1.15);
    ctx.font = `900 ${ttl.size}px ${BRAND}`; ctx.fillStyle = C.text; drawLines(ctx, ttl, 72, top, 1.15);
    const bTop = top + ttl.h + 26;
    const body = fit(ctx, s.corpo || '', z => `500 ${z}px ${BODY}`, W - 144, bottom - bTop, 40, 26, 1.35);
    ctx.font = `500 ${body.size}px ${BODY}`; ctx.fillStyle = C.soft; drawLines(ctx, body, 72, bTop, 1.35);
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
      coverImg(ctx, img, 0, 0, W, 1000, f[0], f[1]);
      grain(ctx, i + 5, 0.04);
    }
    shade(ctx, 520, 1000, 0, 0.98); shade(ctx, 1000, H, 0.98, 1); shade(ctx, 0, 260, 0.7, 0);
    const tagH = tagBlockHeight(ctx, s.tag);
    const bottom = H - 130 - tagH;
    const body = fit(ctx, s.corpo || '', z => `500 ${z}px ${BODY}`, W - 144, 170, 34, 24, 1.32);
    const bodyTop = bottom - body.h;
    const ttl = fit(ctx, s.titolo || '', z => `900 ${z}px ${BRAND}`, W - 144, 220, 76, 40, 1.1);
    const ttlTop = bodyTop - 24 - ttl.h;
    kicker(ctx, s.tipo === 'Band' && s.fonte ? s.fonte : (s.tipo || 'Band'), 72, ttlTop - 54);
    ctx.font = `900 ${ttl.size}px ${BRAND}`; glow(ctx, 'rgba(0,0,0,0.9)', 20); ctx.fillStyle = C.text; drawLines(ctx, ttl, 72, ttlTop, 1.1); noGlow(ctx);
    ctx.font = `500 ${body.size}px ${BODY}`; ctx.fillStyle = C.soft; drawLines(ctx, body, 72, bodyTop, 1.32);
    tagChips(ctx, s.tag, bottom + 20);
  };

  L.text = (ctx, s, i) => {
    background(ctx, i + 11);
    if (images[s.immagine] && s.immagine !== 'none') { ctx.globalAlpha = 0.2; coverImg(ctx, images[s.immagine], 0, 0, W, H, 0.5, 0.35); ctx.globalAlpha = 1; shade(ctx, 0, H, 0.5, 0.85); }
    kicker(ctx, s.tipo || 'Petrosa', 72, 200);
    const tagH = tagBlockHeight(ctx, s.tag);
    const ttl = fit(ctx, s.titolo || '', z => `900 ${z}px ${BRAND}`, W - 144, 420, 96, 44, 1.14);
    ctx.font = `900 ${ttl.size}px ${BRAND}`; glow(ctx, 'rgba(234,88,12,0.5)', 24);
    ctx.fillStyle = gradFill(ctx, 72, W - 72, '#fde68a', C.amber, C.orange); drawLines(ctx, ttl, 72, 270, 1.14); noGlow(ctx);
    let y = 270 + ttl.h + 30;
    ctx.strokeStyle = C.orange; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(72, y); ctx.lineTo(232, y); ctx.stroke(); y += 40;
    const bottom = H - 130 - tagH;
    const body = fit(ctx, s.corpo || '', z => `500 ${z}px ${BODY}`, W - 144, bottom - y, 50, 28, 1.38);
    ctx.font = `500 ${body.size}px ${BODY}`; ctx.fillStyle = C.text; drawLines(ctx, body, 72, y, 1.38);
    tagChips(ctx, s.tag, bottom + 20);
  };

  L.cta = (ctx, s, i) => {
    background(ctx, i + 17);
    const img = images.cover;
    const sz = 620, x = (W - sz) / 2, y = 190;
    if (img) {
      ctx.save(); glow(ctx, 'rgba(192,38,211,0.7)', 70); rr(ctx, x, y, sz, sz, 26); ctx.fillStyle = '#000'; ctx.fill(); noGlow(ctx);
      rr(ctx, x, y, sz, sz, 26); ctx.clip(); ctx.drawImage(img, x, y, sz, sz); ctx.restore();
    }
    const tagH = tagBlockHeight(ctx, s.tag);
    let ty = y + sz + 50;
    const ttl = fit(ctx, s.titolo || '', z => `900 ${z}px ${BRAND}`, W - 144, 200, 64, 36, 1.12);
    ctx.font = `900 ${ttl.size}px ${BRAND}`; ctx.fillStyle = C.text; drawLines(ctx, ttl, W / 2, ty, 1.12, 'center'); ty += ttl.h + 18;
    const body = fit(ctx, s.corpo || '', z => `400 ${z}px ${BODY}`, W - 200, 110, 30, 22, 1.3);
    ctx.font = `400 ${body.size}px ${BODY}`; ctx.fillStyle = C.soft; drawLines(ctx, body, W / 2, ty, 1.3, 'center'); ty += body.h + 26;
    // pulsante Spotify
    const bw = 700, bh = 96, bx = (W - bw) / 2;
    const by = Math.min(ty, H - 120 - tagH - bh - 10);
    rr(ctx, bx, by, bw, bh, 48); ctx.fillStyle = C.green; ctx.fill();
    ctx.fillStyle = '#000'; ctx.font = `700 36px ${BODY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('▶  LISTEN ON SPOTIFY', W / 2, by + bh / 2 + 2);
    ctx.font = `700 24px ${BODY}`; ctx.fillStyle = C.soft; ctx.fillText('LINK IN BIO', W / 2, by + bh + 34);
    tagChips(ctx, s.tag, H - 120 - tagH + 10);
  };

  function render(canvas, s, i, n, handle) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const layout = ['hook', 'quote', 'stat', 'photo', 'text', 'cta'].includes(s.layout) ? s.layout : 'text';
    L[layout](ctx, s, i, n);
    if (layout === 'hook') L.hookText(ctx, s);
    chrome(ctx, i, n, handle, layout === 'cta' || i === n - 1);
  }

  window.Renderer = { W, H, render, loadImages, loadFonts, images };
})();
