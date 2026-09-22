// Petrosa Carousel Studio - Reel con musica (brano + verso sincronizzati) e scheda "Audio & sync"
(() => {
  const C = window.StudioCtx; if (!C) return;
  const { $, st, api, toast, busy } = C;
  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const mmss = t => { t = Math.max(0, t || 0); return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`; };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const LS = 'petrosa.audiosync';
  let songs = [], byN = {}, local = {};
  try { local = JSON.parse(localStorage.getItem(LS) || '{}'); } catch { local = {}; }
  const saveLocal = () => { try { localStorage.setItem(LS, JSON.stringify(local)); } catch { toast('Impossibile salvare i tempi nel browser: scarica il file audio-sync.json.', true); } };

  // ---------- modello testo <-> tempo ----------
  function buildLines(s) {
    let cur = 0;
    return s.lyrics.split('\n').map(l => l.trim()).filter(Boolean).map(text => {
      const nl = norm(text); let p = nl ? s.N.indexOf(nl, cur) : -1;
      if (p < 0) p = cur; else cur = p + nl.length;
      return { text, pos: p };
    });
  }
  const anchorsOf = s => (local[s.n] !== undefined ? local[s.n] : s.anchors) || [];
  const isSynced = s => anchorsOf(s).length >= 2;
  // tempo (s) in cui, nel brano, e' cantata la posizione `pos` del testo normalizzato
  function tOf(s, pos) {
    const L = Math.max(1, s.N.length), rate = (s.vEnd - s.vStart) / L;
    const A = anchorsOf(s).slice().sort((a, b) => a.pos - b.pos);
    if (!A.length) return s.vStart + pos * rate;
    if (pos <= A[0].pos) return Math.max(0, A[0].t - (A[0].pos - pos) * rate);
    for (let i = 1; i < A.length; i++) if (pos <= A[i].pos) { const a = A[i - 1], b = A[i]; return a.t + (b.t - a.t) * (pos - a.pos) / Math.max(1, b.pos - a.pos); }
    const l = A[A.length - 1]; return Math.min(s.dur, l.t + (pos - l.pos) * rate);
  }
  function posOfCit(s, cit) {
    const frags = String(cit || '').split(/\s*(?:\.{3}|…)\s*|\s\/\s/).map(norm).filter(f => f.length > 3);
    for (const f of frags.length ? [frags[0], frags[0].slice(0, 30)] : []) { const p = s.N.indexOf(f); if (p >= 0) return p; }
    return -1;
  }

  async function loadSongs() {
    if (songs.length) return;
    const r = await api('/api/audio');
    songs = r.songs.filter(s => s.file); byN = {};
    songs.forEach(s => { s.N = norm(s.lyrics); s.lines = buildLines(s); byN[s.n] = s; });
  }

  // ---------- Reel ----------
  const rl = { auto: true, blob: null, url: null, ext: 'mp4', playing: null };
  const clipUrl = s => '/assets/clips/' + s.file;
  const slideDur = () => parseFloat($('rlDur').value) || 3.5;
  const durs = () => st.slides.map(s => slideDur() + (s.citazione ? 1.5 : 0));
  const starts = () => { let a = 0; return durs().map(d => { const x = a; a += d; return x; }); };
  const total = () => durs().reduce((a, b) => a + b, 0);

  // quale slide cita un brano e dove
  function quoteInfo() {
    for (let i = 0; i < st.slides.length; i++) {
      const sl = st.slides[i]; if (!sl.citazione) continue;
      const s = songs.find(x => x.title === sl.fonte); if (!s) continue;
      const pos = posOfCit(s, sl.citazione);
      return { qi: i, song: s, pos, cit: sl.citazione };
    }
    return null;
  }

  function suggestStart() {
    const s = byN[$('rlSong').value]; if (!s) return 0;
    const q = quoteInfo();
    let t;
    if (q && q.song.n === s.n && q.pos >= 0) t = tOf(s, q.pos) - 0.3 - starts()[q.qi];
    else t = tOf(s, 0) - 0.5;
    return Math.max(0, Math.min(Math.max(0, s.dur - total() - 1), t));
  }

  function updateInfo() {
    const s = byN[$('rlSong').value]; if (!s) return;
    const q = quoteInfo(), start = parseFloat($('rlStart').value) || 0;
    const synced = isSynced(s);
    let h = q && q.song.n === s.n
      ? `Il verso citato in slide ${q.qi + 1} &laquo;${esc(q.cit.split(/\s\/\s/)[0].slice(0, 70))}&raquo; e' cantato al ${mmss(tOf(s, q.pos))}: l'audio parte dal ${mmss(start)} cosi' il verso arriva quando compare la slide.`
      : (q ? `La slide ${q.qi + 1} cita &laquo;${esc(q.song.title)}&raquo;: hai scelto un altro brano, quindi l'audio parte dal punto scelto.` : 'Nessuna slide con un verso: l\'audio parte dal punto scelto.');
    h += ` Video di ${total().toFixed(1)} s.`;
    h += synced ? '' : ' <b style="color:var(--amber)">Tempi del brano stimati, non ancora sincronizzati</b>: ascolta e correggi nella scheda <a href="#" id="rlGoSync">Audio &amp; sync</a> (una volta sola per brano).';
    $('rlQuote').innerHTML = h;
    const g = $('rlGoSync'); if (g) g.onclick = e => { e.preventDefault(); openSync(s.n); };
    $('rlInfo').textContent = `dal ${mmss(start)} al ${mmss(start + total())}`;
  }

  function fillSongs() {
    const cur = $('rlSong').value;
    $('rlSong').innerHTML = songs.map(s => `<option value="${s.n}">${String(s.n).padStart(2, '0')} - ${esc(s.title)}${isSynced(s) ? ' (sincronizzato)' : ''}</option>`).join('');
    if (cur) $('rlSong').value = cur;
  }

  async function refresh() {
    try { await loadSongs(); } catch (e) { return; }
    if (!songs.length) { $('rlBox').style.display = 'none'; $('rlNone').style.display = 'block'; return; }
    $('rlBox').style.display = 'block'; $('rlNone').style.display = 'none';
    fillSongs();
    const q = quoteInfo(), f = st.lastParams && st.lastParams.focus === 'song' ? st.lastParams.item : (st.focus && st.focus.type === 'song' ? st.focus.item : null);
    const def = q ? q.song.n : (f && byN[f] ? +f : (songs[0] || {}).n);
    if (def) $('rlSong').value = def;
    rl.auto = true; $('rlStart').value = suggestStart().toFixed(1); updateInfo();
    renderSync();
  }

  function stopListen() { if (rl.playing) { rl.playing.pause(); rl.playing = null; } clearTimeout(rl.pt); $('rlListen').innerHTML = '&#9654; Ascolta'; }
  $('rlListen').onclick = () => {
    if (rl.playing) return stopListen();
    const s = byN[$('rlSong').value]; if (!s) return;
    const a = new Audio(clipUrl(s)); rl.playing = a; a.currentTime = parseFloat($('rlStart').value) || 0;
    a.play().then(() => { $('rlListen').innerHTML = '&#9632; Stop'; rl.pt = setTimeout(stopListen, total() * 1000); }).catch(e => { toast('Riproduzione non riuscita: ' + e.message, true); stopListen(); });
  };
  const nudge = d => { rl.auto = false; $('rlStart').value = Math.max(0, (parseFloat($('rlStart').value) || 0) + d).toFixed(1); updateInfo(); };
  $('rlMinus').onclick = () => nudge(-2); $('rlPlus').onclick = () => nudge(2);
  $('rlMinus1').onclick = () => nudge(-0.5); $('rlPlus1').onclick = () => nudge(0.5);
  $('rlStart').oninput = () => { rl.auto = false; updateInfo(); };
  $('rlSong').onchange = () => { stopListen(); rl.auto = true; $('rlStart').value = suggestStart().toFixed(1); updateInfo(); };
  $('rlDur').onchange = () => { $('rlStart').value = suggestStart().toFixed(1); updateInfo(); };

  function pickMime() {
    const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1.4D401F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=h264,aac', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return list.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  // ---------- analisi ritmica: trova i colpi forti (cassa/basso) nel tratto di brano usato dal Reel ----------
  function beatHits(buf, from, to) {
    const sr = buf.sampleRate, ch = buf.getChannelData(0), hop = Math.round(sr * 0.01);
    const a = Math.max(0, Math.floor(from * sr)), b = Math.min(ch.length, Math.floor(to * sr)), N = Math.floor((b - a) / hop);
    if (N < 50) return [];
    const al = 1 - Math.exp(-2 * Math.PI * 180 / sr); let lp = 0; const env = new Float32Array(N);
    for (let k = 0; k < N; k++) { let e = 0; for (let j = 0; j < hop; j++) { lp += al * (ch[a + k * hop + j] - lp); e += lp * lp; } env[k] = Math.sqrt(e / hop); }
    const flux = new Float32Array(N);
    for (let k = 1; k < N; k++) { let m = 0, c = 0; for (let q = Math.max(0, k - 12); q < k; q++) { m += env[q]; c++; } flux[k] = Math.max(0, env[k] - m / Math.max(1, c)); }
    const sorted = Array.from(flux).sort((x, y) => x - y), top = sorted[Math.floor(N * 0.97)] || 1e-6, thr = Math.max(sorted[Math.floor(N * 0.86)] || 0, top * 0.18);
    const hits = []; let last = -1;
    for (let k = 3; k < N - 3; k++) {
      if (flux[k] < thr) continue; let peak = true; for (let q = k - 5; q <= k + 5; q++) if (q >= 0 && q < N && flux[q] > flux[k]) { peak = false; break; }
      if (!peak || (k - last) * 0.01 < 0.22) continue; last = k; hits.push({ t: k * 0.01, s: Math.max(0.35, Math.min(1, flux[k] / top)) });
    }
    return hits;
  }
  // energia "a scatto": sale di colpo sul colpo e si spegne in ~0.2 s (risoluzione 1/60 s)
  function makePulse(hits, T) {
    const R = 60, arr = new Float32Array(Math.ceil(T * R) + 2);
    hits.forEach(h => { const j0 = Math.max(0, Math.floor(h.t * R)); for (let j = j0; j < arr.length && j < j0 + R * 0.9; j++) arr[j] = Math.max(arr[j], h.s * Math.exp(-(j / R - h.t) / 0.13)); });
    return t => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(t * R)))];
  }

  // timer che continua anche con la scheda in secondo piano (un Worker non viene rallentato come i timer della pagina)
  function startTimer(fn, ms) {
    try {
      const url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},' + Math.round(ms) + ')'], { type: 'text/javascript' }));
      const w = new Worker(url); w.onmessage = () => fn();
      return () => { w.terminate(); URL.revokeObjectURL(url); };
    } catch (e) { const id = setInterval(fn, ms); return () => clearInterval(id); }
  }

  async function makeVideo() {
    if (!st.slides.length) throw new Error('Genera prima un carosello.');
    const s = byN[$('rlSong').value]; if (!s) throw new Error('Scegli una canzone.');
    if (!window.MediaRecorder) throw new Error('Questo browser non sa registrare video: usa Chrome.');
    const mime = pickMime(); if (!mime) throw new Error('Nessun formato video supportato dal browser.');
    const W = $('rlRes').value === '720' ? 720 : 1080, H = Math.round(W * 16 / 9), k = W / 1080;   // k: scala del 720p
    const D = durs(), S = starts(), T = total(), n = st.slides.length;
    const offset = Math.max(0, Math.min(parseFloat($('rlStart').value) || 0, s.dur - T - 0.2));
    // slide native 9:16 (1080x1920): stesso post, impaginato per lo schermo intero del telefono
    const sl = [];
    for (let i = 0; i < n; i++) sl.push(C.renderOff(i, 'reel'));
    const fc = document.createElement('canvas'); fc.width = W; fc.height = H; const fx = fc.getContext('2d');
    // ---- effetti "rock" (stoner/doom): vibrazione e zoom sui colpi, flash caldo e vignetta (niente grana, eco o glitch: peggiorano la qualita') ----
    const LV = { off: 0, mid: 1, hard: 1.6 }[$('rlFx').value]; const fxOn = LV > 0;
    const rnd = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    let pulse = () => 0, lite = 0, gapEma = 33, since = 0;  // lite: 0 pieno, 1 senza eco e grana, 2 anche senza vignetta e flash                                      // sostituita dopo l'analisi dell'audio
    const vig = document.createElement('canvas'); vig.width = W; vig.height = H;
    { const vx = vig.getContext('2d'), g = vx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.72); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)'); vx.fillStyle = g; vx.fillRect(0, 0, W, H); }
    const TR = 0.3;
    const geo = (i, lt) => { const z = 1 + (fxOn ? 0.05 : 0.035) * Math.min(1, lt / D[i]), w = W * z, h = H * z; return { w, h, x: (W - w) / 2, y: (H - h) / 2 }; };
    const drawSlide = (i, lt, alpha) => {
      const g = geo(i, lt);
      fx.globalAlpha = alpha; fx.drawImage(sl[i], g.x, g.y, g.w, g.h); fx.globalAlpha = 1;
    };
    const frame = t => {
      let i = S.length - 1; while (i > 0 && t < S[i]) i--;
      const lt = t - S[i], fr = Math.floor(t * 30);
      fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = 1; fx.fillStyle = '#000'; fx.fillRect(0, 0, W, H);
      const P = fxOn ? pulse(t) : 0;
      fx.save();
      if (fxOn) {
        const sh = P * 3.5 * k * LV, punch = 1 + P * 0.022 * LV;
        fx.translate(W / 2 + Math.round((rnd(fr * 2 + 1) - 0.5) * 2 * sh), H / 2 + Math.round((rnd(fr * 2 + 2) - 0.5) * 2 * sh));
        fx.scale(punch, punch); fx.translate(-W / 2, -H / 2);
      }
      if (i > 0 && lt < TR) { drawSlide(i - 1, D[i - 1], 1); drawSlide(i, lt, lt / TR); } else drawSlide(i, lt, 1);
      fx.restore();
      if (fxOn) {
        if (lite < 2 && P > 0.02) { fx.globalCompositeOperation = 'lighter'; fx.fillStyle = `rgba(255,110,20,${(P * 0.09 * LV).toFixed(3)})`; fx.fillRect(0, 0, W, H); }   // flash da palco
        fx.globalCompositeOperation = 'source-over';
        if (lite < 2) { fx.globalAlpha = 0.6 + 0.2 * P; fx.drawImage(vig, 0, 0); }
        fx.globalAlpha = 1;
      }
    };
    // audio
    const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC(); if (ac.state === 'suspended') await ac.resume();
    const buf = await ac.decodeAudioData(await (await fetch(clipUrl(s))).arrayBuffer());
    if (fxOn) { const hits = beatHits(buf, offset, offset + T); S.slice(1).forEach(t => hits.push({ t: t, s: 1 })); pulse = makePulse(hits, T); rl.beats = hits.length; }
    const dest = ac.createMediaStreamDestination(), src = ac.createBufferSource(), gain = ac.createGain();
    src.buffer = buf; src.connect(gain); gain.connect(dest);
    frame(0);
    // captureStream(0) + requestFrame(): i frame vengono spinti a mano, cosi' la registrazione non dipende dal rendering della scheda
    // (con la scheda in secondo piano il browser ferma requestAnimationFrame e la ripaint: il video si bloccava e poi saltava).
    const stream = fc.captureStream(0); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const vtrack = stream.getVideoTracks()[0];
    const push = () => { if (vtrack && typeof vtrack.requestFrame === 'function') vtrack.requestFrame(); };
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: W === 1080 ? 9e6 : 5e6, audioBitsPerSecond: 160000 });
    const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => (rec.onstop = res));
    rec.start(1000); push();
    const t0 = ac.currentTime + 0.1;
    gain.gain.setValueAtTime(0, t0); gain.gain.linearRampToValueAtTime(1, t0 + 0.4); gain.gain.setValueAtTime(1, t0 + T - 1.3); gain.gain.linearRampToValueAtTime(0, t0 + T - 0.05);
    src.start(t0, offset, T + 0.2);
    rl.lite = 0; if (!fxOn) rl.beats = 0; const stats = { maxGap: 0, ticks: 0, slides: new Set() };
    let lastTick = performance.now(), lastGood = performance.now();
    await new Promise(res => {
      let stop = null, over = false;
      const tick = () => {
        if (over) return;
        const now = performance.now(); stats.maxGap = Math.max(stats.maxGap, (now - lastTick) / 1000); lastTick = now;
        const t = ac.currentTime - t0;
        if (t >= T) { over = true; stop && stop(); return res(); }
        const tt = Math.max(0, t);
        frame(tt); push(); stats.ticks++;
        // se il computer non regge il ritmo (meno di ~13 fps) toglie gli effetti piu' pesanti
        gapEma = gapEma * 0.92 + (performance.now() - lastGood) * 0.08; lastGood = performance.now(); since++;
        if (fxOn && lite < 2 && since > 25 && gapEma > 75) { lite++; rl.lite = lite; since = 0; }
        let i = S.length - 1; while (i > 0 && tt < S[i]) i--; stats.slides.add(i);
        busy($('rlMake'), true, `Registro ${tt.toFixed(0)}/${T.toFixed(0)} s (non cambiare scheda)...`);
      };
      stop = startTimer(tick, 1000 / 30);
    });
    rl.stats = { maxGap: stats.maxGap, ticks: stats.ticks, slides: stats.slides.size, of: n, beats: rl.beats || 0, fx: $('rlFx').value, lite: rl.lite || 0 };
    frame(T - 0.01); push();
    await new Promise(r => setTimeout(r, 250));
    rec.stop(); await done; src.stop(); ac.close().catch(() => {});
    const type = mime.split(';')[0];
    return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm', mime };
  }

  // chiave del video corrente: se non cambia nulla (slide, brano, tempi, qualita', effetti) il video gia' creato si riusa
  const keyOf = () => JSON.stringify([st.slides.map(s => [s.layout, s.immagine, s.titolo, s.corpo, s.citazione, s.stat]), st.theme, $('rlSong').value, $('rlStart').value, $('rlDur').value, $('rlRes').value, $('rlFx').value]);
  function showVideo(out) {
    if (rl.url) URL.revokeObjectURL(rl.url);
    rl.blob = out.blob; rl.ext = out.ext; rl.url = URL.createObjectURL(out.blob); rl.key = keyOf();
    $('rlVideo').src = rl.url; $('rlOut').style.display = 'block';
    $('rlFmt').innerHTML = out.ext === 'mp4' ? `File MP4 (${(out.blob.size / 1048576).toFixed(1)} MB), pronto per Instagram e TikTok.` + (rl.stats && rl.stats.maxGap > 1 ? ` <span style="color:var(--amber)">Attenzione: la registrazione si e' fermata per ${rl.stats.maxGap.toFixed(0)} s (scheda in secondo piano o computer occupato): controlla il video e, se serve, rigeneralo senza cambiare scheda.</span>` : '') : `<span style="color:var(--amber)">Il browser ha prodotto un WebM (${(out.blob.size / 1048576).toFixed(1)} MB): Instagram richiede MP4. Apri l'app con Chrome aggiornato per ottenere direttamente l'MP4.</span>`;
  }
  // video del post corrente: riusa quello gia' fatto se e' ancora valido, altrimenti lo registra
  async function ensure(opts) {
    opts = opts || {};
    if (rl.blob && rl.key === keyOf()) return { blob: rl.blob, ext: rl.ext, reused: true };
    stopListen(); await window.Renderer.need(st.slides);
    const out = await makeVideo(); showVideo(out); return { blob: out.blob, ext: out.ext, reused: false };
  }
  $('rlMake').onclick = async () => {
    stopListen(); busy($('rlMake'), true, 'Preparo...');
    try {
      const out = await makeVideo(); showVideo(out);
      $('rlOut').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { toast(e.message, true); } finally { busy($('rlMake'), false); }
  };
  async function makeAndDownload() { $('rlMake').click(); await new Promise(r => setTimeout(r, 300)); while ($('rlMake').disabled) await new Promise(r => setTimeout(r, 500)); if (rl.blob) $('rlDl').click(); }
  $('rlDl').onclick = () => {
    if (!rl.blob) return;
    const a = document.createElement('a'); a.href = rl.url; a.download = `petrosa-reel-${(byN[$('rlSong').value] || {}).file || 'audio'}-${Date.now()}.${rl.ext}`.replace('.mp3', ''); a.click();
  };
  // carica il video su PostFast (URL firmato) e lo programma come Reel
  async function sendReel(blob, chosen, mode, dateIso, onStatus) {
    if (onStatus) onStatus('Carico il video...');
    const up = await api('/api/social/upload-url', { contentType: 'video/mp4' });
    let put; try { put = await fetch(up.signedUrl, { method: 'PUT', headers: { 'content-type': up.contentType }, body: blob }); }
    catch (e) { throw new Error('Il browser non puo\' caricare il video direttamente su PostFast (blocco CORS). Scarica il file e caricalo dal pannello PostFast.'); }
    if (!put.ok) throw new Error('Upload video fallito: HTTP ' + put.status);
    if (onStatus) onStatus('Programmo...');
    return api('/api/social/publish', { video: true, caption: C.fullCaption(), keys: [up.key], mode, accounts: chosen.map(c => ({ id: c.id, platform: c.platform })), date: dateIso });
  }
  $('rlPub').onclick = async () => {
    if (!rl.blob) return toast('Crea prima il video.', true);
    const chosen = [...document.querySelectorAll('#chList input:checked')].map(x => st.channels[+x.dataset.i]);
    if (!chosen.length) return toast('Nella sezione 6 carica gli account collegati e selezionane almeno uno.', true);
    const mode = $('pzMode').value;
    if (mode === 'schedule' && !$('pzDate').value) return toast('Scegli data e ora nella sezione 6.', true);
    if (rl.ext !== 'mp4' && !confirm('Il video e\' WebM: Instagram potrebbe rifiutarlo. Continuare?')) return;
    if (mode === 'now' && !confirm('Pubblicare il Reel tra pochi minuti su ' + chosen.map(c => c.name).join(', ') + '?')) return;
    try {
      await sendReel(rl.blob, chosen, mode, C.whenFor('reel'), m => busy($('rlPub'), true, m));
      toast(`PostFast: Reel su ${chosen.length} account (${mode === 'draft' ? 'bozza' : mode === 'now' ? 'pubblicazione tra pochi minuti' : 'programmato'}).`);
    } catch (e) { toast(e.message, true); } finally { busy($('rlPub'), false); }
  };

  // ---------- Scheda Audio & sync ----------
  function renderSync() {
    if (!songs.length) return;
    const cur = $('syncSong').value;
    $('syncSong').innerHTML = songs.map(s => `<option value="${s.n}">${String(s.n).padStart(2, '0')} - ${esc(s.title)} ${isSynced(s) ? '✔' : ''}</option>`).join('');
    $('syncSong').value = cur && byN[cur] ? cur : songs[0].n;
    drawLines();
  }
  function drawLines() {
    const s = byN[$('syncSong').value]; if (!s) return;
    const A = anchorsOf(s);
    if ($('syncAudio').dataset.n !== String(s.n)) { $('syncAudio').src = clipUrl(s); $('syncAudio').dataset.n = s.n; }
    $('syncStatus').innerHTML = isSynced(s) ? `<b style="color:var(--green,#34d399)">${A.length} punti impostati.</b> Tempi in mezzo interpolati.` : `Tempi <b style="color:var(--amber)">stimati</b> (${A.length} punti). Imposta almeno il primo verso e l'ultimo; meglio un punto per ogni strofa/ritornello.`;
    $('syncLines').innerHTML = s.lines.map((l, i) => {
      const a = A.find(x => x.pos === l.pos);
      return `<div class="ln${a ? ' set' : ''}" data-i="${i}"><span class="tm">${a ? '● ' : ''}${mmss(a ? a.t : tOf(s, l.pos))}</span><button class="ghost" data-a="play" title="Ascolta da qui">&#9654;</button><button class="ghost" data-a="set" title="Imposta: questa riga inizia nel punto in cui e' ora il player">&#9201; Qui</button>${a ? '<button class="ghost" data-a="del" title="Togli">&times;</button>' : ''}<span class="tx">${esc(l.text)}</span></div>`;
    }).join('');
    $('syncLines').querySelectorAll('.ln').forEach(row => row.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const l = s.lines[+row.dataset.i], au = $('syncAudio');
      if (b.dataset.a === 'play') { au.currentTime = Math.max(0, tOf(s, l.pos) - 1.5); au.play(); }
      if (b.dataset.a === 'set') { const arr = anchorsOf(s).filter(x => x.pos !== l.pos).concat({ pos: l.pos, t: Math.round(au.currentTime * 10) / 10 }).sort((x, y) => x.pos - y.pos); local[s.n] = arr; saveLocal(); drawLines(); fillSongs(); }
      if (b.dataset.a === 'del') { local[s.n] = anchorsOf(s).filter(x => x.pos !== l.pos); saveLocal(); drawLines(); fillSongs(); }
    });
  }
  function openSync(n) {
    document.querySelector('nav button[data-tab="audio"]').click();
    if (n) { $('syncSong').value = n; drawLines(); }
  }
  $('syncSong').onchange = drawLines;
  $('syncReset').onclick = () => { const s = byN[$('syncSong').value]; if (!s || !confirm('Azzerare i punti di questo brano?')) return; local[s.n] = []; saveLocal(); drawLines(); fillSongs(); };
  $('syncDl').onclick = () => {
    const out = { _note: 'Punti di sincronizzazione testo/audio: {"<n brano>":[{"pos":<offset nel testo normalizzato>,"t":<secondi>}]}. Generato dalla scheda Audio & sync.' };
    songs.forEach(s => { const a = anchorsOf(s); if (a.length) out[s.n] = a; });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })); a.download = 'audio-sync.json'; a.click();
  };
  document.querySelector('nav button[data-tab="audio"]').addEventListener('click', () => { loadSongs().then(renderSync).catch(e => toast(e.message, true)); });

  // sceglie la canzone del Reel (usato dal piano settimanale): punto di partenza ricalcolato sul verso citato
  async function setSong(n) {
    await refresh();
    if (!byN[n]) return false;
    $('rlSong').value = n; rl.auto = true; $('rlStart').value = suggestStart().toFixed(1); updateInfo(); return true;
  }
  window.Reel = { refresh, setSong, ensure, sendReel, makeAndDownload, stats: () => rl.stats };
})();
