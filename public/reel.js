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
  const isSynced = s => anchorsOf(s).length >= 2;   // soglia "leggera": basta per il Reel del post (i tempi in mezzo si stimano)
  const LSY = window.LyricSync;   // motore puro tempo<->testo, condiviso con il Video testi (vedi lyricsync.js)
  const songOf = s => ({ N: s.N, vStart: s.vStart, vEnd: s.vEnd, dur: s.dur });
  // tempo (s) in cui, nel brano, e' cantata la posizione `pos` del testo normalizzato
  const tOf = (s, pos) => LSY.timeOfPos(songOf(s), anchorsOf(s), pos);
  // soglia "piena": OGNI riga ha un punto impostato esattamente su di se' - serve per il Video testi, dove qualsiasi
  // tratto del brano puo' diventare il video (non solo l'intorno del verso citato, come nel Reel del post)
  const fullySynced = s => LSY.fullySynced(s.lines, anchorsOf(s));
  const syncCount = s => LSY.syncCount(s.lines, anchorsOf(s));
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
  const LOOP_TAIL = 0.45; // durata (s) del richiamo finale che chiude il video sulla prima slide, per un replay senza stacco
  const loopOn = () => !!($('rlLoop') && $('rlLoop').checked);
  const teaserOn = () => !!($('rlTeaser') && $('rlTeaser').checked);
  // Reel normale: tutte le slide del post (o, per un post dedicato a un brano, il trailer: copertina, verso citato,
  // 1-2 spunti dell'analisi, CTA - l'analisi completa resta nel carosello e nella didascalia, vedi ReelCut.songTeaser).
  // Reel breve "solo hook": solo la prima slide, per farsi scoprire.
  const activeSlides = () => teaserOn() ? st.slides.slice(0, 1) : (window.ReelCut ? window.ReelCut.songTeaser(st.slides) : st.slides);
  const durs = () => activeSlides().map(s => slideDur() + (s.citazione ? 1.5 : 0));
  const starts = () => { let a = 0; return durs().map(d => { const x = a; a += d; return x; }); };
  const total = () => durs().reduce((a, b) => a + b, 0); // durata del solo contenuto (senza l'eventuale richiamo finale a loop)

  // quale slide cita un brano e dove
  function quoteInfo() {
    const AS = activeSlides();
    for (let i = 0; i < AS.length; i++) {
      const sl = AS[i]; if (!sl.citazione) continue;
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
    const vidLen = total() + (loopOn() ? LOOP_TAIL : 0);
    h += ` Video di ${vidLen.toFixed(1)} s.` + (loopOn() ? ' Finisce richiudendosi sulla prima slide: su Instagram/TikTok riparte senza stacco.' : '');
    if (teaserOn()) h += ' <b>Reel breve indipendente</b>: solo la prima slide (l\'hook), con una caption propria.';
    else if (!teaserOn() && st.slides.some(sl => sl.tipo === 'Analysis')) h += ` <b>Reel-trailer</b>: ${activeSlides().length} tappe scelte dalle ${st.slides.length} del carosello (copertina, verso citato, un paio di spunti dell'analisi, invito finale). L'analisi completa resta nel carosello e nella didascalia del post.`;
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
  if ($('rlLoop')) $('rlLoop').onchange = updateInfo;
  if ($('rlTeaser')) $('rlTeaser').onchange = () => {
    const hint = $('rlTeaserHint'); if (hint) hint.style.display = teaserOn() ? 'block' : 'none';
    rl.auto = true; $('rlStart').value = suggestStart().toFixed(1); updateInfo();
  };

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

  async function makeVideo(onProgress) {
    if (!st.slides.length) throw new Error('Genera prima un carosello.');
    const s = byN[$('rlSong').value]; if (!s) throw new Error('Scegli una canzone.');
    if (!window.MediaRecorder) throw new Error('Questo browser non sa registrare video: usa Chrome.');
    const mime = pickMime(); if (!mime) throw new Error('Nessun formato video supportato dal browser.');
    const W = $('rlRes').value === '720' ? 720 : 1080, H = Math.round(W * 16 / 9), k = W / 1080;   // k: scala del 720p
    const AS = activeSlides(), D = durs(), S = starts(), n = AS.length;
    const loop = loopOn(), contentT = total(), T = contentT + (loop ? LOOP_TAIL : 0); // T: durata totale registrata (con l'eventuale richiamo a loop)
    const offset = Math.max(0, Math.min(parseFloat($('rlStart').value) || 0, s.dur - contentT - 0.2));
    // slide native 9:16 (1080x1920): stesso post, impaginato per lo schermo intero del telefono
    const sl = [];
    for (let i = 0; i < n; i++) sl.push(C.renderOff(i, 'reel', AS));
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
      const fr = Math.floor(t * 30);
      fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = 1; fx.fillStyle = '#000'; fx.fillRect(0, 0, W, H);
      const P = fxOn ? pulse(t) : 0;
      fx.save();
      if (fxOn) {
        const sh = P * 3.5 * k * LV, punch = 1 + P * 0.022 * LV;
        fx.translate(W / 2 + Math.round((rnd(fr * 2 + 1) - 0.5) * 2 * sh), H / 2 + Math.round((rnd(fr * 2 + 2) - 0.5) * 2 * sh));
        fx.scale(punch, punch); fx.translate(-W / 2, -H / 2);
      }
      if (loop && t >= contentT) {
        // richiamo finale: sfuma dall'ultima slide (ferma al suo stato finale) alla prima (al suo stato iniziale), cosi' il video riparte senza stacco
        const a2 = Math.min(1, (t - contentT) / LOOP_TAIL);
        drawSlide(n - 1, D[n - 1], 1 - a2); drawSlide(0, 0, a2);
      } else {
        let i = S.length - 1; while (i > 0 && t < S[i]) i--;
        const lt = t - S[i];
        if (i > 0 && lt < TR) { drawSlide(i - 1, D[i - 1], 1); drawSlide(i, lt, lt / TR); } else drawSlide(i, lt, 1);
      }
      fx.restore();
      if (fxOn) {
        if (lite < 2 && P > 0.02) { fx.globalCompositeOperation = 'lighter'; fx.fillStyle = `rgba(255,110,20,${(P * 0.09 * LV).toFixed(3)})`; fx.fillRect(0, 0, W, H); }   // flash da palco
        fx.globalCompositeOperation = 'source-over';
        if (lite < 2) { fx.globalAlpha = 0.6 + 0.2 * P; fx.drawImage(vig, 0, 0); }
        fx.globalAlpha = 1;
      }
    };
    // audio (l'eventuale richiamo finale a loop resta senza audio: la traccia e' gia' sfumata a zero entro la fine del contenuto)
    const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC(); if (ac.state === 'suspended') await ac.resume();
    const buf = await ac.decodeAudioData(await (await fetch(clipUrl(s))).arrayBuffer());
    if (fxOn) { const hits = beatHits(buf, offset, offset + contentT); S.slice(1).forEach(t => hits.push({ t: t, s: 1 })); pulse = makePulse(hits, T); rl.beats = hits.length; }
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
    gain.gain.setValueAtTime(0, t0); gain.gain.linearRampToValueAtTime(1, t0 + 0.4); gain.gain.setValueAtTime(1, t0 + contentT - 1.3); gain.gain.linearRampToValueAtTime(0, t0 + contentT - 0.05);
    src.start(t0, offset, contentT + 0.2);
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
        onProgress(tt, T);
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

  // chiave del video corrente: se non cambia nulla (slide, brano, tempi, qualita', effetti, loop, teaser) il video gia' creato si riusa
  const keyOf = () => JSON.stringify([activeSlides().map(s => [s.layout, s.immagine, s.titolo, s.corpo, s.citazione, s.stat]), st.theme, $('rlSong').value, $('rlStart').value, $('rlDur').value, $('rlRes').value, $('rlFx').value, loopOn(), teaserOn()]);
  function showVideo(out) {
    if (rl.url) URL.revokeObjectURL(rl.url);
    rl.blob = out.blob; rl.ext = out.ext; rl.url = URL.createObjectURL(out.blob); rl.key = keyOf();
    $('rlVideo').src = rl.url; $('rlOut').style.display = 'block';
    $('rlFmt').innerHTML = out.ext === 'mp4' ? `File MP4 (${(out.blob.size / 1048576).toFixed(1)} MB), pronto per Instagram e TikTok.` + (rl.stats && rl.stats.maxGap > 1 ? ` <span style="color:var(--amber)">Attenzione: la registrazione si e' fermata per ${rl.stats.maxGap.toFixed(0)} s (scheda in secondo piano o computer occupato): controlla il video e, se serve, rigeneralo senza cambiare scheda.</span>` : '') : `<span style="color:var(--amber)">Il browser ha prodotto un WebM (${(out.blob.size / 1048576).toFixed(1)} MB): Instagram richiede MP4. Apri l'app con Chrome aggiornato per ottenere direttamente l'MP4.</span>`;
  }
  // video del post corrente: riusa quello gia' fatto se e' ancora valido, altrimenti lo registra.
  // onProgress (opzionale): chi chiama ensure() da un proprio pulsante (piano settimanale, export...) puo' passare la
  // propria funzione di avanzamento; senza, il progresso va sul pulsante "Genera video" qui sotto (e viene sempre
  // ripulito alla fine, altrimenti restava bloccato su "Registro N/N s..." anche quando il video era gia' pronto).
  async function ensure(opts) {
    opts = opts || {};
    if (rl.blob && rl.key === keyOf()) return { blob: rl.blob, ext: rl.ext, reused: true };
    stopListen(); await window.Renderer.need(activeSlides());
    const onProgress = opts.onProgress || ((tt, T) => busy($('rlMake'), true, `Registro ${tt.toFixed(0)}/${T.toFixed(0)} s (non cambiare scheda)...`));
    try {
      const out = await makeVideo(onProgress); showVideo(out); return { blob: out.blob, ext: out.ext, reused: false };
    } finally { if (!opts.onProgress) busy($('rlMake'), false); }
  }
  $('rlMake').onclick = async () => {
    stopListen(); busy($('rlMake'), true, 'Preparo...');
    try {
      const out = await makeVideo((tt, T) => busy($('rlMake'), true, `Registro ${tt.toFixed(0)}/${T.toFixed(0)} s (non cambiare scheda)...`));
      showVideo(out);
      $('rlOut').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { toast(e.message, true); } finally { busy($('rlMake'), false); }
  };
  async function makeAndDownload() { $('rlMake').click(); await new Promise(r => setTimeout(r, 300)); while ($('rlMake').disabled) await new Promise(r => setTimeout(r, 500)); if (rl.blob) $('rlDl').click(); }
  $('rlDl').onclick = () => {
    if (!rl.blob) return;
    const a = document.createElement('a'); a.href = rl.url; a.download = `petrosa-reel-${(byN[$('rlSong').value] || {}).file || 'audio'}-${Date.now()}.${rl.ext}`.replace('.mp3', ''); a.click();
  };
  // carica il video su PostFast (URL firmato) e lo programma come Reel; captionOverride: usata dal Reel breve indipendente al posto della caption del post
  async function sendReel(blob, chosen, mode, dateIso, onStatus, captionOverride) {
    if (onStatus) onStatus('Carico il video...');
    const up = await api('/api/social/upload-url', { contentType: 'video/mp4' });
    let put; try { put = await fetch(up.signedUrl, { method: 'PUT', headers: { 'content-type': up.contentType }, body: blob }); }
    catch (e) { throw new Error('Il browser non puo\' caricare il video direttamente su PostFast (blocco CORS). Scarica il file e caricalo dal pannello PostFast.'); }
    if (!put.ok) throw new Error('Upload video fallito: HTTP ' + put.status);
    if (onStatus) onStatus('Programmo...');
    return api('/api/social/publish', { video: true, caption: captionOverride || C.fullCaption(), keys: [up.key], mode, accounts: chosen.map(c => ({ id: c.id, platform: c.platform })), date: dateIso });
  }
  const teaserCaption = () => { const h = (activeSlides()[0] || {}).titolo; return window.Teaser ? window.Teaser.caption(h, Date.now()) : undefined; };
  $('rlPub').onclick = async () => {
    if (!rl.blob) return toast('Crea prima il video.', true);
    const chosen = [...document.querySelectorAll('#chList input:checked')].map(x => st.channels[+x.dataset.i]);
    if (!chosen.length) return toast('Nella sezione 6 carica gli account collegati e selezionane almeno uno.', true);
    const mode = $('pzMode').value;
    if (mode === 'schedule' && !$('pzDate').value) return toast('Scegli data e ora nella sezione 6.', true);
    if (rl.ext !== 'mp4' && !confirm('Il video e\' WebM: Instagram potrebbe rifiutarlo. Continuare?')) return;
    if (mode === 'now' && !confirm('Pubblicare il Reel tra pochi minuti su ' + chosen.map(c => c.name).join(', ') + '?')) return;
    try {
      await sendReel(rl.blob, chosen, mode, C.whenFor('reel'), m => busy($('rlPub'), true, m), teaserOn() ? teaserCaption() : undefined);
      toast(`PostFast: Reel su ${chosen.length} account (${mode === 'draft' ? 'bozza' : mode === 'now' ? 'pubblicazione tra pochi minuti' : 'programmato'}).`);
    } catch (e) { toast(e.message, true); } finally { busy($('rlPub'), false); }
  };

  // ---------- Scheda Audio & sync ----------
  // ricostruisce le opzioni del selettore brano di QUESTA scheda (✔ = ogni riga ha un punto suo, ● = sincronizzazione leggera).
  // Attenzione: e' un select diverso da #rlSong (quello della scheda Reel, aggiornato da fillSongs()) - non vanno confusi.
  function fillSyncSongs() {
    if (!songs.length) return;
    const cur = $('syncSong').value;
    $('syncSong').innerHTML = songs.map(s => `<option value="${s.n}">${String(s.n).padStart(2, '0')} - ${esc(s.title)} ${fullySynced(s) ? '✔' : (isSynced(s) ? '●' : '')}</option>`).join('');
    $('syncSong').value = cur && byN[cur] ? cur : songs[0].n;
  }
  function renderSync() {
    if (!songs.length) return;
    fillSyncSongs();
    drawLines();
  }
  function drawLines() {
    const s = byN[$('syncSong').value]; if (!s) return;
    const A = anchorsOf(s), sc = syncCount(s);
    if ($('syncAudio').dataset.n !== String(s.n)) { $('syncAudio').src = clipUrl(s); $('syncAudio').dataset.n = s.n; }
    $('syncStatus').innerHTML = fullySynced(s)
      ? `<b style="color:var(--green,#34d399)">Brano completamente sincronizzato</b> (${sc.done}/${sc.total} righe). Pronto per il <a href="#" id="syncGoLyric">Video testi</a>.`
      : (isSynced(s) ? `<b style="color:var(--amber)">${sc.done}/${sc.total} righe sincronizzate.</b> Tempi in mezzo interpolati: bastano per il Reel del post. Per il <b>Video testi</b> serve un punto su OGNI riga.` : `Tempi <b style="color:var(--amber)">stimati</b> (${sc.done}/${sc.total} righe). Imposta almeno il primo verso e l'ultimo; meglio un punto per ogni strofa/ritornello.`);
    const g = $('syncGoLyric'); if (g) g.onclick = e => { e.preventDefault(); openLyric(s.n); };
    $('syncLines').innerHTML = s.lines.map((l, i) => {
      const a = A.find(x => x.pos === l.pos);
      return `<div class="ln${a ? ' set' : ''}" data-i="${i}"><span class="tm">${a ? '● ' : ''}${mmss(a ? a.t : tOf(s, l.pos))}</span><button class="ghost" data-a="play" title="Ascolta da qui">&#9654;</button><button class="ghost" data-a="set" title="Imposta: questa riga inizia nel punto in cui e' ora il player">&#9201; Qui</button>${a ? '<button class="ghost" data-a="del" title="Togli">&times;</button>' : ''}<span class="tx">${esc(l.text)}</span></div>`;
    }).join('');
    $('syncLines').querySelectorAll('.ln').forEach(row => row.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const l = s.lines[+row.dataset.i], au = $('syncAudio');
      if (b.dataset.a === 'play') { au.currentTime = Math.max(0, tOf(s, l.pos) - 1.5); au.play(); }
      if (b.dataset.a === 'set') { const arr = anchorsOf(s).filter(x => x.pos !== l.pos).concat({ pos: l.pos, t: Math.round(au.currentTime * 10) / 10 }).sort((x, y) => x.pos - y.pos); local[s.n] = arr; saveLocal(); drawLines(); fillSyncSongs(); renderLyric(); }
      if (b.dataset.a === 'del') { local[s.n] = anchorsOf(s).filter(x => x.pos !== l.pos); saveLocal(); drawLines(); fillSyncSongs(); renderLyric(); }
    });
  }
  function openSync(n) {
    document.querySelector('nav button[data-tab="audio"]').click();
    if (n) { $('syncSong').value = n; drawLines(); }
  }
  $('syncSong').onchange = drawLines;
  $('syncReset').onclick = () => { const s = byN[$('syncSong').value]; if (!s || !confirm('Azzerare i punti di questo brano?')) return; local[s.n] = []; saveLocal(); drawLines(); fillSyncSongs(); renderLyric(); };
  $('syncDl').onclick = () => {
    const out = { _note: 'Punti di sincronizzazione testo/audio: {"<n brano>":[{"pos":<offset nel testo normalizzato>,"t":<secondi>}]}. Generato dalla scheda Audio & sync.' };
    songs.forEach(s => { const a = anchorsOf(s); if (a.length) out[s.n] = a; });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })); a.download = 'audio-sync.json'; a.click();
  };
  document.querySelector('nav button[data-tab="audio"]').addEventListener('click', () => { loadSongs().then(renderSync).catch(e => toast(e.message, true)); });

  // ---------- Video testi: Reel dedicato a UN brano, testo a schermo intero sincronizzato riga per riga ----------
  // Diverso dal Reel del post: la' basta stimare i tempi intorno al verso citato, qui serve il brano sincronizzato
  // per intero (ogni riga con la sua ancora) perche' l'utente possa scegliere QUALSIASI tratto del testo con fiducia
  // nei tempi (il brano intero, in un formato Reel, e' quasi sempre troppo lungo: si sceglie un tratto).
  const lv = { blob: null, url: null, ext: 'mp4', key: null };
  const LV_TARGET = 45, LV_MAX = 90;   // secondi: lunghezza del tratto proposto di default / oltre cui si avvisa

  const lvFullySyncedSongs = () => songs.filter(fullySynced);
  // "Video testi" lavora solo su brani completamente sincronizzati (ogni riga ha il suo punto esatto): la durata di
  // ogni riga e' quella VERA (lineDursExact), mai accorciata da una pausa lunga - altrimenti il video, e la stima
  // qui sotto, non corrisponderebbero a quanto viene davvero cantato.
  const lvLineDurs = s => LSY.lineDursExact(LSY.lineTimes(songOf(s), anchorsOf(s), s.lines), s.dur);
  function lvRange() {
    const s = byN[$('lvSong').value]; if (!s) return null;
    const n = s.lines.length;
    if ($('lvFull') && $('lvFull').checked) return { from: 0, to: n };
    const from = +$('lvFrom').value, to = +$('lvTo').value;
    if (!(from >= 0) || !(to > from)) return LSY.suggestRange(lvLineDurs(s), LV_TARGET, LV_MAX, 0);
    return { from: Math.max(0, Math.min(n - 1, from)), to: Math.max(from + 1, Math.min(n, to)) };
  }
  function lvFillLineSelects(s) {
    const opt = i => `<option value="${i}">${String(i + 1).padStart(2, '0')} - ${esc(s.lines[i].text.slice(0, 40))}</option>`;
    $('lvFrom').innerHTML = s.lines.map((l, i) => opt(i)).join('');
    $('lvTo').innerHTML = s.lines.map((l, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')} - ${esc(l.text.slice(0, 40))}</option>`).join('');
  }
  function lvUpdateInfo() {
    const s = byN[$('lvSong').value]; if (!s) return;
    const full = !!($('lvFull') && $('lvFull').checked);
    $('lvFrom').disabled = full; $('lvTo').disabled = full;
    const r = lvRange(); if (!r) return;
    if (!full) { $('lvFrom').value = r.from; $('lvTo').value = r.to; }
    const D = lvLineDurs(s), len = D.slice(r.from, r.to).reduce((a, b) => a + b, 0);
    const preview = s.lines.slice(r.from, r.to).map(l => l.text).join(' / ');
    let h = `<b>${r.to - r.from} righe</b>, circa <b>${len.toFixed(0)} s</b> di video: &laquo;${esc(preview.slice(0, 90))}${preview.length > 90 ? '…' : ''}&raquo;`;
    if (len > LV_MAX) h += ' <b style="color:var(--amber)">Piuttosto lungo per un Reel</b>: valuta di accorciare il tratto.';
    $('lvInfo').innerHTML = h;
  }
  function lvFillSongs() {
    const synced = lvFullySyncedSongs();
    $('lvSong').innerHTML = synced.map(s => `<option value="${s.n}">${String(s.n).padStart(2, '0')} - ${esc(s.title)}</option>`).join('');
    return synced;
  }
  function renderLyric() {
    if (!songs.length) return;
    const synced = lvFillSongs();
    if (!synced.length) { $('lvBox').style.display = 'none'; $('lvNone').style.display = 'block'; return; }
    $('lvBox').style.display = 'block'; $('lvNone').style.display = 'none';
    const cur = $('lvSong').value;
    if (!cur || !synced.find(s => String(s.n) === cur)) $('lvSong').value = synced[0].n;
    const s = byN[$('lvSong').value];
    lvFillLineSelects(s); lvUpdateInfo();
  }
  function openLyric(n) {
    document.querySelector('nav button[data-tab="lyrics"]').click();
    loadSongs().then(() => { renderLyric(); if (n && byN[n] && fullySynced(byN[n])) { $('lvSong').value = n; lvFillLineSelects(byN[n]); lvUpdateInfo(); } }).catch(e => toast(e.message, true));
  }
  $('lvSong').onchange = () => { const s = byN[$('lvSong').value]; if (s) { lvFillLineSelects(s); lvUpdateInfo(); } };
  $('lvFrom').onchange = lvUpdateInfo; $('lvTo').onchange = lvUpdateInfo;
  if ($('lvFull')) $('lvFull').onchange = lvUpdateInfo;
  document.querySelector('nav button[data-tab="lyrics"]').addEventListener('click', () => { loadSongs().then(renderLyric).catch(e => toast(e.message, true)); });
  ['lvGoSync', 'lvGoSync2'].forEach(id => { const g = $(id); if (g) g.onclick = e => { e.preventDefault(); openSync(); }; });

  async function makeLyricVideo(onProgress) {
    const s = byN[$('lvSong').value]; if (!s) throw new Error('Scegli una canzone.');
    if (!fullySynced(s)) throw new Error('Sincronizza prima ogni riga del testo nella scheda Audio & sync.');
    if (!window.MediaRecorder) throw new Error('Questo browser non sa registrare video: usa Chrome.');
    const mime = pickMime(); if (!mime) throw new Error('Nessun formato video supportato dal browser.');
    const r = lvRange(); if (!r || r.to <= r.from) throw new Error('Scegli almeno una riga di testo.');
    // cambio riga programmato sui tempi VERI (mai accorciati da una pausa lunga): vedi lineDursExact
    const times = LSY.lineTimes(songOf(s), anchorsOf(s), s.lines), allDurs = LSY.lineDursExact(times, s.dur);
    const lines = s.lines.slice(r.from, r.to), durs = allDurs.slice(r.from, r.to), nTot = s.lines.length;
    const W = $('lvRes').value === '720' ? 720 : 1080, H = Math.round(W * 16 / 9);
    // sfondo: ruota tra le foto dei membri, gli sfondi del deserto, il logo e la copertina (sempre gia' precaricati,
    // vedi Renderer.loadImages), cambiando a OGNI riga (mai la stessa immagine due volte consecutive)
    const BG_POOL = ['antonio', 'giorgio', 'aldo', 'andrea', 'desert1', 'desert2', 'desert3', 'cover', 'logo'];
    const bg = LSY.backgroundSchedule(durs, BG_POOL, s.n);
    // slide sintetiche "lyric": riusano il motore di rendering esistente (sfondo, font, tema) gia' pronto per il
    // Reel. _skipTitle: qui il bitmap pre-renderizzato contiene solo lo sfondo - il titolo (le parole del verso)
    // viene disegnato a parte a ogni fotogramma qui sotto, per poterlo animare parola per parola. Il marchio e il
    // titolo di brano/album sono un overlay statico separato (vedi piu' sotto, lyricOverlay), non fanno parte di
    // questo bitmap: cosi' restano nitidi anche quando lo sfondo zooma/trema con gli effetti.
    const AS = lines.map((l, idx) => ({ layout: 'lyric', titolo: l.text, fonte: s.title, immagine: bg[idx] || 'none', _skipTitle: true }));
    const n = AS.length;
    const S = []; let acc = 0; durs.forEach(d => { S.push(acc); acc += d; }); const contentT = acc;
    const offset = Math.max(0, Math.min(times[r.from], Math.max(0, s.dur - contentT - 0.2)));
    const sl = [];
    for (let i = 0; i < n; i++) sl.push(C.renderOff(i, 'reel', AS));
    // layout delle parole di ogni riga, calcolato una volta sola (non a ogni fotogramma) - vedi Renderer.drawLyricWords
    const layouts = lines.map(l => window.Renderer.lyricWordLayout(l.text, st.theme));
    // pausa lunga (assolo, silenzio...) dopo una riga: il verso non deve restare scritto a schermo per tutta la
    // pausa. Dopo TEXT_HOLD (+ una breve dissolvenza TEXT_FADE) il testo sparisce; se la pausa continua, lo sfondo
    // prosegue da solo cambiando foto ogni PAUSE_CYCLE secondi (mai la stessa appena mostrata), cosi' lo schermo non
    // resta fermo su una sola inquadratura - il verso torna, sincronizzato come sempre, quando riprende il canto.
    const TEXT_HOLD = 4.5, TEXT_FADE = 0.7, PAUSE_CYCLE = 6;
    const pauseSl = lines.map((l, idx) => {
      const dead = durs[idx] - TEXT_HOLD - TEXT_FADE;
      if (dead <= 0.5) return [];
      const nSeg = Math.min(8, Math.max(1, Math.round(dead / PAUSE_CYCLE)));
      const pool = BG_POOL.filter(k => k !== bg[idx]);
      const seq = LSY.backgroundSchedule(Array(nSeg).fill(0), pool.length ? pool : BG_POOL, s.n * 1000 + idx + 7);
      return seq.map(img => C.renderOff(0, 'reel', [{ layout: 'lyric', titolo: '', fonte: s.title, immagine: img, _skipTitle: true }]));
    });
    // overlay fisso (marchio in alto, titolo brano/album in basso): un solo canvas, disegnato una volta sola e
    // ricomposto sopra ogni fotogramma, sempre senza zoom/tremolio (vedi Renderer.lyricOverlay)
    const overlay = document.createElement('canvas');
    window.Renderer.lyricOverlay(overlay, { song: s.title, album: (st.data.album || {}).title, handle: st.data.handle, theme: st.theme });
    // tela "di servizio" per le parole cantate animate: drawLyricWords calcola posizioni/misure per la tela nativa
    // del motore di rendering (1080x1920, vedi Renderer.W/HREEL), non per la risoluzione di export scelta - qui la
    // ridisegno a parte e poi la scalo (stessa g.x/g.y/g.w/g.h dello sfondo, cosi' resta perfettamente allineata e
    // zooma/trasla insieme a lui) invece di disegnarla direttamente su fx: a 720px, senza questo passaggio, le
    // parole uscirebbero troppo grandi e tagliate fuori dal fotogramma.
    const wordsCanvas = document.createElement('canvas'); wordsCanvas.width = window.Renderer.W; wordsCanvas.height = window.Renderer.HREEL;
    const wctx = wordsCanvas.getContext('2d');
    const fc = document.createElement('canvas'); fc.width = W; fc.height = H; const fx = fc.getContext('2d');
    const TR = 0.25;   // dissolvenza (s) tra una riga e la successiva
    // leggero effetto "Ken Burns": ogni riga (o, in pausa, ogni foto) parte a schermo intero e si allarga piano, cosi'
    // il cambio si sente anche quando la dissolvenza e' gia' finita, senza distrarre dalla lettura
    const ZOOM = 0.035;
    const geo = (lt, dur) => { const z = 1 + ZOOM * Math.min(1, lt / Math.max(1.5, dur)); const w = W * z, h = H * z; return { w, h, x: (W - w) / 2, y: (H - h) / 2 }; };
    // qualche transizione in piu' tra una riga e l'altra, non solo la dissolvenza: si alternano da sole (in ordine,
    // mai due uguali di fila dato che sono 3) cosi' il video non si ripete sempre uguale a ogni cambio verso
    const TRANS = ['fade', 'slide', 'punch'];
    // disegna una riga (sfondo zoomato + parole animate sopra, o - in pausa lunga - solo lo sfondo che ruota da
    // solo e nessun testo), con un'eventuale trasformazione di transizione (dx/dy/scale) applicata a entrambi insieme
    const drawLine = (idx, localT, alpha, dx, dy, scale) => {
      const dur = durs[idx], PS = pauseSl[idx];
      const paused = localT > TEXT_HOLD + TEXT_FADE && PS.length;
      let bgCanvas = sl[idx], textAlpha = 1, zt = Math.min(localT, dur), zdur = dur;
      if (paused) {
        const segT = localT - TEXT_HOLD - TEXT_FADE, segI = Math.min(PS.length - 1, Math.floor(segT / PAUSE_CYCLE));
        bgCanvas = PS[segI]; textAlpha = 0; zt = segT % PAUSE_CYCLE; zdur = PAUSE_CYCLE;
      } else if (localT > TEXT_HOLD) textAlpha = Math.max(0, 1 - (localT - TEXT_HOLD) / TEXT_FADE);
      const g = geo(zt, zdur);
      fx.save();
      const cx = W / 2, cy = H / 2;
      fx.translate(cx + dx, cy + dy); if (scale !== 1) fx.scale(scale, scale); fx.translate(-cx, -cy);
      fx.globalAlpha = alpha; fx.drawImage(bgCanvas, g.x, g.y, g.w, g.h); fx.globalAlpha = 1;
      if (textAlpha > 0) {
        wctx.clearRect(0, 0, wordsCanvas.width, wordsCanvas.height);
        window.Renderer.drawLyricWords(wctx, layouts[idx], st.theme, localT, Math.min(dur, TEXT_HOLD), 1);
        fx.globalAlpha = alpha * textAlpha; fx.drawImage(wordsCanvas, g.x, g.y, g.w, g.h); fx.globalAlpha = 1;
      }
      fx.restore();
    };
    // ---- effetti del Video testi: atmosfera coerente con lo stoner/doom, sopra lo sfondo/parole di drawLine e
    // SOTTO il marchio fisso (mai zoomati/tremolati insieme al contenuto, vedi frame() piu' sotto). "desert": calore
    // che fa tremare l'inquadratura (shear orizzontale) e polvere che sale. "toxic": fumo verde/viola alla deriva e
    // un alone ai bordi che pulsa a tempo di cassa/basso. "stage": fari che spazzano il fotogramma, vibrazione e
    // flash caldo sul colpo - come un vero concerto. FX === 'off': nessuno di questi (comportamento di sempre).
    const FX = $('lvFx') ? $('lvFx').value : 'desert';
    const rnd = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    let pulse = () => 0;   // sostituita sotto, dopo l'analisi del beat (solo se un effetto e' attivo)
    const dust = Array.from({ length: 22 }, (_, k) => ({ x: rnd(k * 3 + 1), y: rnd(k * 3 + 2), sp: 0.02 + rnd(k * 3 + 3) * 0.03, sz: 2 + rnd(k * 3 + 4) * 4 }));
    function fxDesert(t) {
      fx.save(); fx.globalCompositeOperation = 'multiply'; fx.fillStyle = `rgba(234,88,12,${(0.05 + 0.02 * Math.sin(t * 0.5)).toFixed(3)})`; fx.fillRect(0, 0, W, H);
      fx.globalCompositeOperation = 'lighter';
      dust.forEach((d, k) => {
        const y = (((d.y - t * d.sp) % 1) + 1) % 1 * H, x = ((d.x * W + Math.sin(t * 0.3 + k) * 26) % W + W) % W;
        const a = Math.max(0, 0.12 + 0.1 * Math.sin(t * 1.3 + k * 2));
        fx.fillStyle = `rgba(245,158,11,${a.toFixed(3)})`; fx.beginPath(); fx.arc(x, y, d.sz, 0, Math.PI * 2); fx.fill();
      });
      fx.restore();
    }
    const smoke = [{ x: 0.2, y: 0.3, r: 0.5, hue: '139,92,246', sp: 0.015 }, { x: 0.75, y: 0.65, r: 0.42, hue: '34,197,94', sp: -0.011 }, { x: 0.5, y: 0.15, r: 0.36, hue: '192,38,211', sp: 0.02 }];
    function fxToxic(t, P) {
      fx.save(); fx.globalCompositeOperation = 'screen';
      smoke.forEach((sm, k) => {
        const cx = (((sm.x + Math.sin(t * sm.sp + k) * 0.12) % 1) + 1) % 1 * W, cy = (((sm.y + Math.cos(t * sm.sp * 0.8 + k) * 0.1) % 1) + 1) % 1 * H, r = sm.r * W;
        const g = fx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(${sm.hue},${(0.1 + P * 0.06).toFixed(3)})`); g.addColorStop(1, `rgba(${sm.hue},0)`);
        fx.fillStyle = g; fx.fillRect(0, 0, W, H);
      });
      fx.globalCompositeOperation = 'source-over';
      const vg = fx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(20,80,40,${(0.28 + P * 0.22).toFixed(3)})`);
      fx.fillStyle = vg; fx.fillRect(0, 0, W, H);
      fx.restore();
    }
    function fxStage(t, P) {
      fx.save(); fx.globalCompositeOperation = 'lighter';
      [{ a: t * 0.25, col: '245,158,11' }, { a: -t * 0.18 + 2, col: '139,92,246' }].forEach(b => {
        const ang = Math.sin(b.a) * 0.9, cx = W / 2 + Math.sin(b.a * 1.3) * W * 0.5;
        fx.save(); fx.translate(cx, -H * 0.2); fx.rotate(ang);
        const g = fx.createLinearGradient(-90, 0, 90, 0);
        g.addColorStop(0, `rgba(${b.col},0)`); g.addColorStop(0.5, `rgba(${b.col},0.12)`); g.addColorStop(1, `rgba(${b.col},0)`);
        fx.fillStyle = g; fx.fillRect(-90, 0, 180, H * 1.6);
        fx.restore();
      });
      if (P > 0.05) { fx.globalCompositeOperation = 'lighter'; fx.fillStyle = `rgba(255,150,40,${(P * 0.16).toFixed(3)})`; fx.fillRect(0, 0, W, H); }
      fx.restore();
    }
    const frame = t => {
      fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = 1; fx.fillStyle = '#000'; fx.fillRect(0, 0, W, H);
      const P = FX === 'off' ? 0 : pulse(t);
      fx.save();
      if (FX === 'stage' && P > 0.03) {
        const fr = Math.floor(t * 30), sh = P * 5;
        fx.translate(Math.round((rnd(fr * 2 + 1) - 0.5) * 2 * sh), Math.round((rnd(fr * 2 + 2) - 0.5) * 2 * sh));
      }
      if (FX === 'desert') { const shear = Math.sin(t * 0.9) * 0.01; fx.transform(1, 0, shear, 1, 0, 0); }
      let i = S.length - 1; while (i > 0 && t < S[i]) i--;
      const lt = t - S[i];
      if (i > 0 && lt < TR) {
        const p = lt / TR, kind = TRANS[i % TRANS.length];
        drawLine(i - 1, durs[i - 1], 1, 0, 0, 1);
        if (kind === 'slide') drawLine(i, lt, p, 0, (1 - p) * 90, 1);
        else if (kind === 'punch') drawLine(i, lt, p, 0, 0, 0.9 + 0.1 * p);
        else drawLine(i, lt, p, 0, 0, 1);
      } else drawLine(i, lt, 1, 0, 0, 1);
      fx.restore();
      if (FX === 'desert') fxDesert(t);
      else if (FX === 'toxic') fxToxic(t, P);
      else if (FX === 'stage') fxStage(t, P);
      // marchio e titolo brano/album: sempre in cima, sempre fermi (vedi lyricOverlay). L'overlay e' sempre
      // disegnato a 1080x1920 (risoluzione nativa del motore di rendering): va scalato qui alla risoluzione di
      // export scelta (W x H, es. 720x1280), altrimenti a 720 verrebbe ritagliato invece che rimpicciolito e il
      // titolo del brano - piu' in basso - uscirebbe fuori dal fotogramma.
      fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = 1;
      fx.drawImage(overlay, 0, 0, W, H);
    };
    const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC(); if (ac.state === 'suspended') await ac.resume();
    const buf = await ac.decodeAudioData(await (await fetch(clipUrl(s))).arrayBuffer());
    if (FX !== 'off') { const hits = beatHits(buf, offset, offset + contentT); pulse = makePulse(hits, contentT); }
    const dest = ac.createMediaStreamDestination(), src = ac.createBufferSource(), gain = ac.createGain();
    src.buffer = buf; src.connect(gain); gain.connect(dest);
    frame(0);
    const stream = fc.captureStream(0); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const vtrack = stream.getVideoTracks()[0];
    const push = () => { if (vtrack && typeof vtrack.requestFrame === 'function') vtrack.requestFrame(); };
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: W === 1080 ? 9e6 : 5e6, audioBitsPerSecond: 160000 });
    const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => (rec.onstop = res));
    rec.start(1000); push();
    const t0 = ac.currentTime + 0.1;
    gain.gain.setValueAtTime(0, t0); gain.gain.linearRampToValueAtTime(1, t0 + 0.35); gain.gain.setValueAtTime(1, t0 + contentT - 1.1); gain.gain.linearRampToValueAtTime(0, t0 + contentT - 0.05);
    src.start(t0, offset, contentT + 0.2);
    const stats = { maxGap: 0, ticks: 0, slides: new Set() }; let lastTick = performance.now();
    await new Promise(res => {
      let stop = null, over = false;
      const tick = () => {
        if (over) return;
        const now = performance.now(); stats.maxGap = Math.max(stats.maxGap, (now - lastTick) / 1000); lastTick = now;
        const t = ac.currentTime - t0;
        if (t >= contentT) { over = true; stop && stop(); return res(); }
        const tt = Math.max(0, t);
        frame(tt); push(); stats.ticks++;
        let i = S.length - 1; while (i > 0 && tt < S[i]) i--; stats.slides.add(i);
        onProgress(tt, contentT);
      };
      stop = startTimer(tick, 1000 / 30);
    });
    lv.stats = { maxGap: stats.maxGap, ticks: stats.ticks, slides: stats.slides.size, of: n };
    frame(contentT - 0.01); push();
    await new Promise(r2 => setTimeout(r2, 250));
    rec.stop(); await done; src.stop(); ac.close().catch(() => {});
    const type = mime.split(';')[0];
    return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm', mime };
  }
  // caption di default per il Video testi: il primo verso del tratto scelto come hook, poi brano/album e invito
  function lyricCaption(s, from, to) {
    const first = (s.lines[from] || {}).text || s.title;
    return `"${first}"\n\n${s.title} - from Roadburn Chronicles.\nFull song and lyrics: link in bio.\n\n#stonerrock #doommetal #stonerdoom #lyricvideo #petrosa`;
  }
  const lvKeyOf = () => JSON.stringify([$('lvSong').value, lvRange(), $('lvRes').value, st.theme]);
  function lvShowVideo(out, s, r) {
    if (lv.url) URL.revokeObjectURL(lv.url);
    lv.blob = out.blob; lv.ext = out.ext; lv.url = URL.createObjectURL(out.blob); lv.key = lvKeyOf();
    $('lvVideo').src = lv.url; $('lvOut').style.display = 'block';
    $('lvFmt').innerHTML = out.ext === 'mp4' ? `File MP4 (${(out.blob.size / 1048576).toFixed(1)} MB), pronto per Instagram e TikTok.` : `<span style="color:var(--amber)">Il browser ha prodotto un WebM (${(out.blob.size / 1048576).toFixed(1)} MB): Instagram richiede MP4. Apri l'app con Chrome aggiornato per ottenere direttamente l'MP4.</span>`;
    $('lvCap').value = lyricCaption(s, r.from, r.to);
  }
  $('lvMake').onclick = async () => {
    busy($('lvMake'), true, 'Preparo...');
    try {
      const s = byN[$('lvSong').value], r = lvRange();
      const out = await makeLyricVideo((tt, T) => busy($('lvMake'), true, `Registro ${tt.toFixed(0)}/${T.toFixed(0)} s (non cambiare scheda)...`));
      lvShowVideo(out, s, r);
      $('lvOut').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { toast(e.message, true); } finally { busy($('lvMake'), false); }
  };
  $('lvDl').onclick = () => {
    if (!lv.blob) return;
    const s = byN[$('lvSong').value];
    const a = document.createElement('a'); a.href = lv.url; a.download = `petrosa-video-testi-${(s || {}).file || 'audio'}-${Date.now()}.${lv.ext}`.replace('.mp3', ''); a.click();
  };
  $('lvPub').onclick = async () => {
    if (!lv.blob) return toast('Crea prima il video.', true);
    const chosen = [...document.querySelectorAll('#chList input:checked')].map(x => st.channels[+x.dataset.i]);
    if (!chosen.length) return toast('Nella sezione 6 carica gli account collegati e selezionane almeno uno.', true);
    const mode = $('pzMode').value;
    const dateIso = $('pzDate').value ? new Date($('pzDate').value).toISOString() : null;
    if (mode === 'schedule' && !dateIso) return toast('Scegli data e ora nella sezione 6.', true);
    if (lv.ext !== 'mp4' && !confirm('Il video e\' WebM: Instagram potrebbe rifiutarlo. Continuare?')) return;
    if (mode === 'now' && !confirm('Pubblicare il Video testi tra pochi minuti su ' + chosen.map(c => c.name).join(', ') + '?')) return;
    try {
      await sendReel(lv.blob, chosen, mode, dateIso, m => busy($('lvPub'), true, m), $('lvCap').value);
      toast(`PostFast: Video testi su ${chosen.length} account (${mode === 'draft' ? 'bozza' : mode === 'now' ? 'pubblicazione tra pochi minuti' : 'programmato'}).`);
    } catch (e) { toast(e.message, true); } finally { busy($('lvPub'), false); }
  };

  // sceglie la canzone del Reel (usato dal piano settimanale): punto di partenza ricalcolato sul verso citato
  async function setSong(n) {
    await refresh();
    if (!byN[n]) return false;
    $('rlSong').value = n; rl.auto = true; $('rlStart').value = suggestStart().toFixed(1); updateInfo(); return true;
  }
  window.Reel = { refresh, setSong, ensure, sendReel, makeAndDownload, stats: () => rl.stats, lyricStats: () => lv.stats };
})();
