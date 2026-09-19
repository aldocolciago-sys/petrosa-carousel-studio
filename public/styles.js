// Petrosa Carousel Studio - stili visivi: sfondi generativi, palette, font, trattamento foto
(function () {
  const W = 1080, H = 1350;
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const hexA = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

  // ---------- Palette ----------
  const PALETTES = {
    ember:      { label: 'Ember (ambra/viola)', bg: '#07030c', a1: '#f59e0b', a2: '#ea580c', a3: '#8b5cf6', a4: '#c026d3', text: '#f3e8ff', soft: '#c4b5fd' },
    desert:     { label: 'Desert Sun',          bg: '#120904', a1: '#f4a340', a2: '#d9541e', a3: '#7a2e12', a4: '#e8c07a', text: '#fff3df', soft: '#e9c9a0' },
    swamp:      { label: 'Toxic Swamp',         bg: '#040e08', a1: '#a3d94a', a2: '#2f8f5b', a3: '#14523a', a4: '#d9f27a', text: '#eaffe6', soft: '#a8d5b0' },
    bloodmoon:  { label: 'Blood Moon',          bg: '#0d0304', a1: '#ff3b30', a2: '#b3121f', a3: '#5a0a12', a4: '#ff8a65', text: '#ffecec', soft: '#e6a5a5' },
    acid:       { label: 'Acid Trip',           bg: '#08040f', a1: '#f0ff3a', a2: '#ff3ea5', a3: '#6a2cff', a4: '#29e0ff', text: '#fbffe6', soft: '#d6c8ff' },
    mono:       { label: 'Black Sabbath Mono',  bg: '#090909', a1: '#f2f2f2', a2: '#b8b8b8', a3: '#4a4a4a', a4: '#d4181f', text: '#ffffff', soft: '#bdbdbd' },
    nordic:     { label: 'Nordic Ice',          bg: '#030a12', a1: '#7fd6ff', a2: '#3a8bd8', a3: '#1c3f8f', a4: '#b8f0ff', text: '#eef8ff', soft: '#a9c8e6' },
    rust:       { label: 'Rust Highway',        bg: '#100805', a1: '#e08a3c', a2: '#a3421a', a3: '#5b3a29', a4: '#f1c27d', text: '#fbeedd', soft: '#d8b28c' },
    ultraviolet:{ label: 'Ultraviolet',         bg: '#06030f', a1: '#b58cff', a2: '#7a3cff', a3: '#3a1b8f', a4: '#ff5fd2', text: '#f3ecff', soft: '#c9b8ff' },
    bone:       { label: 'Bone & Ember',        bg: '#0e0c09', a1: '#e8dcc0', a2: '#b9a77d', a3: '#6b5b3a', a4: '#c25a2b', text: '#f6efe0', soft: '#cbbd9c' }
  };

  // ---------- Font ----------
  const FONTS = {
    classic:    { label: 'Classico (Cinzel)',     display: 'Cinzel Decorative', dw: 900, body: 'Space Grotesk', quote: 'Georgia', qs: 'italic 500', caps: false },
    gothic:     { label: 'Gotico (Pirata One)',   display: 'Pirata One', dw: 400, body: 'Barlow Condensed', quote: 'Lora', qs: 'italic 500', caps: false },
    poster:     { label: 'Manifesto (Anton)',     display: 'Anton', dw: 400, body: 'Barlow Condensed', quote: 'Lora', qs: 'italic 500', caps: true },
    bold:       { label: 'Bold (Bebas Neue)',     display: 'Bebas Neue', dw: 400, body: 'Space Grotesk', quote: 'Playfair Display', qs: 'italic 500', caps: true },
    fashion:    { label: 'Elegante (Abril)',      display: 'Abril Fatface', dw: 400, body: 'Space Grotesk', quote: 'Playfair Display', qs: 'italic 500', caps: false },
    typewriter: { label: 'Macchina da scrivere',  display: 'Special Elite', dw: 400, body: 'IBM Plex Mono', quote: 'Special Elite', qs: '400', caps: false },
    chunky:     { label: 'Massiccio (Bungee)',    display: 'Bungee', dw: 400, body: 'Barlow Condensed', quote: 'Lora', qs: 'italic 500', caps: true },
    western:    { label: 'Western (Rye)',         display: 'Rye', dw: 400, body: 'Barlow Condensed', quote: 'Lora', qs: 'italic 500', caps: true }
  };
  const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Space+Grotesk:wght@400;500;700&family=Pirata+One&family=Anton&family=Bebas+Neue&family=Abril+Fatface&family=Special+Elite&family=Bungee&family=Rye&family=Barlow+Condensed:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;700&family=Lora:ital,wght@0,400;0,700;1,500&family=Playfair+Display:ital,wght@0,700;1,500&display=swap';

  // ---------- Sfondi generativi ----------
  function base(ctx, P, tilt) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, P.bg); g.addColorStop(1, mix(P.bg, P.a3, tilt == null ? 0.3 : tilt));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function finish(ctx, P, r, vig = 0.75) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 950);
    g.addColorStop(0, hexA(P.bg, 0)); g.addColorStop(1, hexA(P.bg, vig));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${0.05 * r()})` : `rgba(0,0,0,${0.1 * r()})`;
      ctx.fillRect(r() * W, r() * H, 2, 2);
    }
  }
  const BG = {};

  BG.smoke = { label: 'Fumo (doom)', fn(ctx, P, r) {
    base(ctx, P); ctx.save(); ctx.filter = 'blur(48px)'; ctx.lineCap = 'round';
    const cols = [P.a3, P.a2, P.a1, P.a4, P.a3];
    for (let k = 0; k < 15; k++) {
      ctx.strokeStyle = hexA(cols[k % cols.length], 0.1 + r() * 0.14); ctx.lineWidth = 90 + r() * 160;
      ctx.beginPath(); let x = -120, y = r() * H; ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += 260 + r() * 120; const ny = y + (r() - 0.5) * 460; ctx.quadraticCurveTo(x - 130, (y + ny) / 2 + (r() - 0.5) * 320, x, ny); y = ny; }
      ctx.stroke();
    }
    ctx.restore(); finish(ctx, P, r, 0.8);
  } };

  BG.dunes = { label: 'Dune e sole (desert)', fn(ctx, P, r) {
    const g = ctx.createLinearGradient(0, 0, 0, 900); g.addColorStop(0, P.bg); g.addColorStop(1, mix(P.bg, P.a2, 0.45));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const cx = W * (0.25 + 0.5 * r()), cy = 470 + r() * 140, R = 150 + r() * 90;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 3.4); glow.addColorStop(0, hexA(P.a1, 0.75)); glow.addColorStop(1, hexA(P.a1, 0));
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const sg = ctx.createLinearGradient(0, cy - R, 0, cy + R); sg.addColorStop(0, P.a4); sg.addColorStop(1, P.a2);
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    for (let L = 0; L < 5; L++) {
      const y0 = 690 + L * 120, a1 = 40 + r() * 40, f1 = 0.004 + r() * 0.004, f2 = 0.011 + r() * 0.006, p1 = r() * 6, p2 = r() * 6;
      ctx.fillStyle = mix(mix(P.a3, P.a2, 0.2), P.bg, 0.15 + L * 0.2);
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 10) ctx.lineTo(x, y0 + Math.sin(x * f1 + p1) * a1 + Math.sin(x * f2 + p2) * a1 * 0.45);
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    }
    finish(ctx, P, r, 0.6);
  } };

  BG.sunburst = { label: 'Raggi (riff)', fn(ctx, P, r) {
    base(ctx, P, 0.15);
    const cx = W * (0.3 + 0.4 * r()), cy = H * (0.28 + 0.25 * r()), n = 20 + Math.floor(r() * 10), off = r() * Math.PI;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * Math.PI * 2, a1 = off + ((i + 0.5) / n) * Math.PI * 2;
      ctx.fillStyle = hexA(i % 3 === 0 ? P.a2 : P.a1, i % 2 ? 0.07 : 0.16);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 2000, a0, a1); ctx.closePath(); ctx.fill();
    }
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 620); g.addColorStop(0, hexA(P.a1, 0.6)); g.addColorStop(0.35, hexA(P.a2, 0.25)); g.addColorStop(1, hexA(P.a3, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = hexA(P.a4, 0.3); ctx.lineWidth = 3;
    for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.arc(cx, cy, 90 * k * 1.5, 0, Math.PI * 2); ctx.stroke(); }
    finish(ctx, P, r, 0.7);
  } };

  BG.psychedelic = { label: 'Anelli psichedelici', fn(ctx, P, r) {
    base(ctx, P, 0.2);
    const cx = W * (0.25 + 0.5 * r()), cy = H * (0.25 + 0.4 * r()), cols = [P.a1, P.a2, P.a4, P.a3], ph = r() * 6, fr = 4 + Math.floor(r() * 5);
    for (let k = 34; k >= 0; k--) {
      const rad = 50 + k * 46, wob = 4 + k * 1.3;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.04) {
        const rr = rad + Math.sin(a * fr + ph + k * 0.35) * wob + Math.sin(a * (fr + 3) - k * 0.2) * wob * 0.4;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fillStyle = k % 2 ? hexA(P.bg, 0.55) : hexA(cols[k % 4], 0.22); ctx.fill();
      ctx.strokeStyle = hexA(cols[(k + 1) % 4], 0.5); ctx.lineWidth = 4; ctx.stroke();
    }
    finish(ctx, P, r, 0.7);
  } };

  BG.cracked = { label: 'Terra crepata', fn(ctx, P, r) {
    base(ctx, P, 0.4);
    for (let i = 0; i < 26; i++) { const x = r() * W, y = r() * H, rad = 120 + r() * 240; const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, hexA(P.a3, 0.28)); g.addColorStop(1, hexA(P.a3, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    const queue = []; const edge = () => { const s = Math.floor(r() * 4); return s === 0 ? [r() * W, -10, Math.PI / 2] : s === 1 ? [W + 10, r() * H, Math.PI] : s === 2 ? [r() * W, H + 10, -Math.PI / 2] : [-10, r() * H, 0]; };
    for (let i = 0; i < 6; i++) { const [x, y, a] = edge(); queue.push({ x, y, a: a + (r() - 0.5) * 0.9, len: 800 + r() * 500, w: 7, d: 0 }); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    while (queue.length) {
      const c = queue.pop(); let { x, y, a } = c; const pts = [[x, y]], spawn = [];
      for (let s = 0; s < c.len / 22; s++) { a += (r() - 0.5) * 0.7; x += Math.cos(a) * 22; y += Math.sin(a) * 22; pts.push([x, y]); if (c.d < 3 && r() < 0.13) spawn.push({ x, y, a: a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.7), len: c.len * 0.45, w: c.w * 0.65, d: c.d + 1 }); }
      const draw = (col, w, blur) => { ctx.save(); ctx.shadowColor = P.a1; ctx.shadowBlur = blur; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); ctx.restore(); };
      draw(hexA(P.a2, 0.9), c.w + 2, 24); draw(P.a1, Math.max(1.5, c.w * 0.45), 0);
      queue.push(...spawn);
    }
    finish(ctx, P, r, 0.85);
  } };

  BG.halftone = { label: 'Retino (halftone)', fn(ctx, P, r) {
    base(ctx, P, 0.1);
    const fx = r() < 0.5 ? W * 0.9 : W * 0.1, fy = H * (0.2 + r() * 0.5), step = 34;
    for (let row = 0; row * step < H + step; row++) for (let col = 0; col * step < W + step; col++) {
      const x = col * step + (row % 2 ? step / 2 : 0), y = row * step, d = Math.hypot(x - fx, y - fy), t = Math.max(0, 1 - d / 1250);
      const rad = 17 * Math.pow(t, 1.4); if (rad < 1) continue;
      ctx.fillStyle = hexA(t > 0.55 ? P.a1 : P.a2, 0.25 + 0.6 * t); ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 500); g.addColorStop(0, hexA(P.a4, 0.3)); g.addColorStop(1, hexA(P.a4, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); finish(ctx, P, r, 0.6);
  } };

  BG.road = { label: 'Strada e orizzonte', fn(ctx, P, r) {
    const hy = 720 + r() * 60, vx = W * (0.4 + 0.2 * r());
    const sky = ctx.createLinearGradient(0, 0, 0, hy); sky.addColorStop(0, P.bg); sky.addColorStop(1, mix(P.bg, P.a2, 0.65));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hy);
    const R = 190 + r() * 60, sy = hy - R * 0.35;
    const glow = ctx.createRadialGradient(vx, sy, 0, vx, sy, R * 3); glow.addColorStop(0, hexA(P.a1, 0.7)); glow.addColorStop(1, hexA(P.a1, 0));
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, hy);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hy); ctx.clip();
    const sg = ctx.createLinearGradient(0, sy - R, 0, sy + R); sg.addColorStop(0, P.a4); sg.addColorStop(1, P.a2);
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(vx, sy, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mix(P.bg, P.a2, 0.5);
    for (let k = 0; k < 6; k++) ctx.fillRect(vx - R, sy + 10 + k * 34, R * 2, 4 + k * 3.5);
    ctx.restore();
    ctx.fillStyle = mix(P.bg, P.a3, 0.5); ctx.beginPath(); ctx.moveTo(0, hy);
    for (let x = 0; x <= W; x += 24) ctx.lineTo(x, hy - 20 - Math.abs(Math.sin(x * 0.006 + 1)) * 70 * (0.4 + r() * 0.6));
    ctx.lineTo(W, hy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = mix(P.bg, '#000000', 0.35); ctx.fillRect(0, hy, W, H - hy);
    const road = ctx.createLinearGradient(0, hy, 0, H); road.addColorStop(0, mix(P.bg, P.a3, 0.4)); road.addColorStop(1, '#050505');
    ctx.fillStyle = road; ctx.beginPath(); ctx.moveTo(vx - 6, hy); ctx.lineTo(vx + 6, hy); ctx.lineTo(W * 1.05, H); ctx.lineTo(-W * 0.05, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA(P.a1, 0.7); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(vx - 6, hy); ctx.lineTo(-W * 0.05, H); ctx.moveTo(vx + 6, hy); ctx.lineTo(W * 1.05, H); ctx.stroke();
    for (let k = 0; k < 9; k++) {
      const t0 = Math.pow(k / 9, 2.2), t1 = Math.pow((k + 0.5) / 9, 2.2), y0 = hy + (H - hy) * t0, y1 = hy + (H - hy) * t1;
      ctx.fillStyle = hexA(P.a4, 0.85); ctx.beginPath(); ctx.moveTo(vx - 2 - 20 * t0, y0); ctx.lineTo(vx + 2 + 20 * t0, y0); ctx.lineTo(vx + 2 + 20 * t1, y1); ctx.lineTo(vx - 2 - 20 * t1, y1); ctx.closePath(); ctx.fill();
    }
    finish(ctx, P, r, 0.55);
  } };

  BG.waves = { label: 'Onde sonore (riff)', fn(ctx, P, r) {
    base(ctx, P, 0.1);
    const n = 30, cx = W * (0.35 + 0.3 * r()), ph = [r() * 6, r() * 6, r() * 6];
    for (let i = 0; i < n; i++) {
      const y = 330 + i * 32, amp = 70 + r() * 80;
      ctx.beginPath(); ctx.moveTo(40, y);
      for (let x = 40; x <= W - 40; x += 6) {
        const env = Math.exp(-Math.pow((x - cx) / (W * 0.2), 2));
        const nz = Math.sin(x * 0.09 + ph[0] + i) * 0.5 + Math.sin(x * 0.23 + ph[1] * i) * 0.35 + Math.sin(x * 0.041 + ph[2]) * 0.4;
        ctx.lineTo(x, y - env * amp * (0.35 + Math.abs(nz)));
      }
      ctx.lineTo(W - 40, y); ctx.lineTo(W - 40, H); ctx.lineTo(40, H); ctx.closePath();
      ctx.fillStyle = mix(P.bg, P.a3, 0.12); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = hexA(i % 7 === 3 ? P.a4 : P.a1, 0.35 + 0.65 * (i / n)); ctx.stroke();
    }
    finish(ctx, P, r, 0.6);
  } };

  BG.mountains = { label: 'Montagne e luna', fn(ctx, P, r) {
    const g = ctx.createLinearGradient(0, 0, 0, 900); g.addColorStop(0, P.bg); g.addColorStop(1, mix(P.bg, P.a3, 0.55));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const mx = W * (0.2 + 0.6 * r()), my = 280 + r() * 160, R = 100 + r() * 50;
    const glow = ctx.createRadialGradient(mx, my, 0, mx, my, R * 4); glow.addColorStop(0, hexA(P.a4, 0.45)); glow.addColorStop(1, hexA(P.a4, 0));
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = P.a4; ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hexA(P.a3, 0.5); ctx.beginPath(); ctx.arc(mx - R * 0.3, my - R * 0.15, R * 0.25, 0, Math.PI * 2); ctx.arc(mx + R * 0.35, my + R * 0.3, R * 0.18, 0, Math.PI * 2); ctx.fill();
    for (let L = 0; L < 6; L++) {
      const y0 = 560 + L * 115, ph = [r() * 6, r() * 6, r() * 6], amp = 130 - L * 12;
      ctx.fillStyle = mix(mix(P.a3, P.a2, 0.15), P.bg, 0.12 + L * 0.16);
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, y0 - Math.abs(Math.sin(x * 0.006 + ph[0])) * amp - Math.abs(Math.sin(x * 0.017 + ph[1])) * amp * 0.45 - Math.sin(x * 0.05 + ph[2]) * 8 + r() * 6);
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      const fog = ctx.createLinearGradient(0, y0 - 40, 0, y0 + 120); fog.addColorStop(0, hexA(P.a2, 0)); fog.addColorStop(1, hexA(P.a2, 0.1));
      ctx.fillStyle = fog; ctx.fillRect(0, y0 - 40, W, 160);
    }
    finish(ctx, P, r, 0.6);
  } };

  // ---------- Selezione automatica "a tono" ----------
  const MOOD_HINT = {
    riff:  { bg: ['waves', 'sunburst', 'halftone'], pal: ['ember', 'acid', 'bloodmoon'], font: ['poster', 'bold', 'classic'] },
    doom:  { bg: ['smoke', 'mountains', 'cracked'], pal: ['mono', 'bloodmoon', 'bone', 'swamp'], font: ['gothic', 'classic', 'typewriter'] },
    psych: { bg: ['psychedelic', 'sunburst', 'smoke'], pal: ['acid', 'ultraviolet', 'ember'], font: ['fashion', 'chunky', 'bold'] },
    intro: { bg: ['dunes', 'mountains', 'road'], pal: ['desert', 'ember', 'rust'], font: ['classic', 'western', 'fashion'] },
    road:  { bg: ['road', 'dunes', 'halftone'], pal: ['rust', 'desert', 'bloodmoon'], font: ['poster', 'western', 'chunky'] },
    proof: { bg: ['halftone', 'cracked', 'waves'], pal: ['bone', 'mono', 'ember'], font: ['typewriter', 'bold', 'poster'] },
    fans:  { bg: ['sunburst', 'halftone', 'psychedelic'], pal: ['ember', 'acid', 'ultraviolet'], font: ['chunky', 'poster', 'bold'] }
  };
  const KEYWORDS = [
    [/kyuss|fu manchu|desert|dune|sand|palm|dozer|sun\b|sole|deserto/i, { bg: ['dunes', 'road'], pal: ['desert', 'rust'], font: ['western', 'classic'] }],
    [/sabbath|doom|funeral|windhand|dirge|crypt|grave|death|dark|black|trouble|candlemass|cathedral/i, { bg: ['smoke', 'mountains', 'cracked'], pal: ['mono', 'bloodmoon', 'bone'], font: ['gothic', 'typewriter'] }],
    [/psych|monster magnet|acid|trip|cosmic|space|star|dream|mind|halluc/i, { bg: ['psychedelic', 'sunburst'], pal: ['acid', 'ultraviolet'], font: ['fashion', 'chunky'] }],
    [/road|highway|burn|drive|asphalt|engine|motor|orange goblin|wheel|travel/i, { bg: ['road', 'dunes'], pal: ['rust', 'bloodmoon'], font: ['poster', 'western'] }],
    [/swamp|mud|river|down\b|nola|bayou|toxic|witch|snake|smoke/i, { bg: ['smoke', 'cracked'], pal: ['swamp', 'bone'], font: ['gothic', 'typewriter'] }],
    [/nordic|north|ice|winter|scandinav|europe|finland|sweden|nord/i, { bg: ['mountains', 'smoke'], pal: ['nordic', 'ultraviolet'], font: ['bold', 'classic'] }],
    [/riff|amp\b|loud|volume|wave|heavy|sound|fuzz/i, { bg: ['waves', 'halftone', 'sunburst'], pal: ['ember', 'bloodmoon', 'acid'], font: ['poster', 'bold'] }]
  ];
  const keys = o => Object.keys(o);
  const pickFrom = (arr, r, avoid) => { const pool = arr.filter(x => x !== avoid); const a = pool.length ? pool : arr; return a[Math.floor(r() * a.length)]; };

  function pick({ slides = [], mood, seed, prev, argomento = '' } = {}) {
    seed = seed == null ? Math.floor(Math.random() * 1e9) : seed;
    const r = rng(seed * 2654435761 + 97);
    const text = (argomento + ' ' + slides.map(s => [s.titolo, s.corpo, s.citazione, s.fonte, s.stat, ...(s.tag || [])].join(' ')).join(' ')).toLowerCase();
    const cand = { bg: [], pal: [], font: [] };
    const add = h => { ['bg', 'pal', 'font'].forEach(k => cand[k].push(...(h[k] || []))); };
    if (MOOD_HINT[mood]) { add(MOOD_HINT[mood]); add(MOOD_HINT[mood]); }
    KEYWORDS.forEach(([re, h]) => { if (re.test(text)) add(h); });
    // 30% di "wildcard" per non diventare prevedibili
    const choose = (k, all) => (r() < 0.3 || !cand[k].length) ? pickFrom(keys(all), r, prev && prev[k]) : pickFrom(cand[k], r, prev && prev[k]);
    const photoRoll = r();
    return {
      bg: choose('bg', BG), pal: choose('pal', PALETTES), font: choose('font', FONTS),
      photo: photoRoll < 0.4 ? 'natural' : photoRoll < 0.75 ? 'duotone' : 'mono',
      hook: r() < 0.5 ? 'photo' : 'frame', seed
    };
  }
  const DEFAULT = { bg: 'smoke', pal: 'ember', font: 'classic', photo: 'natural', hook: 'photo', seed: 1 };
  const valid = t => ({
    bg: BG[t?.bg] ? t.bg : undefined, pal: PALETTES[t?.pal] ? t.pal : undefined, font: FONTS[t?.font] ? t.font : undefined,
    photo: ['natural', 'duotone', 'mono'].includes(t?.photo) ? t.photo : undefined, hook: ['photo', 'frame'].includes(t?.hook) ? t.hook : undefined
  });

  window.Styles = {
    PALETTES, FONTS, BG, FONT_CSS, DEFAULT, pick, valid, mix, hexA, rng,
    PHOTO: { natural: 'Foto naturale', duotone: 'Foto bicromia', mono: 'Foto bianco/nero' },
    HOOK: { photo: 'Copertina a tutto schermo', frame: 'Copertina incorniciata' },
    draw(id, ctx, P, seed) { (BG[id] || BG.smoke).fn(ctx, P, rng(seed * 7919 + 13)); }
  };
})();
