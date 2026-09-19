// Petrosa Carousel Studio - logica interfaccia
(() => {
  const $ = id => document.getElementById(id);
  const st = { theme: null, data: null, cfg: null, tags: null, slides: [], caption: '', hashtags: [], argomento: '', sel: 0, lastParams: null, variant: 0, channels: [] };
  const thumbs = [];

  const toast = (msg, bad) => {
    const t = $('toast'); t.textContent = msg; t.style.display = 'block'; t.style.borderColor = bad ? 'var(--red)' : 'var(--amber)';
    clearTimeout(toast.h); toast.h = setTimeout(() => (t.style.display = 'none'), 6000);
  };
  const api = async (url, body) => {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && j.login) { showLogin(); throw new Error('Accesso richiesto: accedi con Google.'); }
    if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
    return j;
  };
  function showLogin() {
    if (document.getElementById('loginWall')) return;
    const d = document.createElement('div'); d.id = 'loginWall';
    d.style.cssText = 'position:fixed;inset:0;z-index:99;display:grid;place-items:center;background:#07030c;color:#f3e8ff;text-align:center;font:16px/1.5 system-ui,sans-serif';
    d.innerHTML = '<div style="max-width:420px;padding:32px"><h1 style="margin:0 0 4px">PETROSA</h1><div style="color:#a78bfa;margin-bottom:22px">Carousel Studio</div><p>Accesso riservato ai membri della band.</p><a href="/api/auth/login" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#f59e0b;color:#1a0b00;font-weight:700;text-decoration:none">Accedi con Google</a></div>';
    document.body.appendChild(d);
  }
  const busy = (btn, on, label) => { if (on) { if (!btn.disabled) btn.dataset.l = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${label}`; } else { btn.disabled = false; btn.innerHTML = btn.dataset.l; } };

  // ---------- Tabs ----------
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
    document.querySelectorAll('nav button,.tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); $('tab-' + b.dataset.tab).classList.add('active');
  });

  // ---------- Init ----------
  async function init() {
    [st.cfg, st.data, st.tags] = await Promise.all([api('/api/config'), api('/api/data'), api('/api/tags')]);
    if (st.cfg.user) {
      const u = document.createElement('span'); u.className = 'pill on'; u.style.marginLeft = '6px';
      u.innerHTML = `${esc(st.cfg.user.email)} &middot; <a href="/api/auth/logout" style="color:inherit">Esci</a>`;
      $('pillPZ').after(u);
    }
    $('pillAI').textContent = st.cfg.anthropic ? `AI live: ${st.cfg.model}` : 'Libreria (AI non configurata)';
    $('pillAI').className = 'pill on';
    $('btnClaude').style.display = st.cfg.anthropic ? '' : 'none';
    $('notesWrap').style.display = st.cfg.anthropic ? 'block' : 'none';
    $('btnAiCap').style.display = st.cfg.anthropic ? '' : 'none';
    if (st.cfg.anthropic) $('btnGen').textContent = 'Assembla dalla libreria';
    st.lib = await api('/api/library'); st.mood = st.lib.moods[0].id; renderMoods();
    $('pillPZ').textContent = st.cfg.postfast ? 'PostFast collegato' : 'PostFast non configurato';
    $('pillPZ').className = 'pill ' + (st.cfg.postfast ? 'on' : 'off');
    $('pzOff').style.display = st.cfg.postfast ? 'none' : 'block';
    $('pzBox').style.display = st.cfg.postfast ? 'block' : 'none';
    $('genHint').innerHTML = `Libreria: ${st.lib.counts.hooks} copertine, ${st.lib.counts.quotes} citazioni verificate, ${st.lib.counts.info} post informativi, ${st.lib.counts.band} testi band, ${st.lib.counts.captions} caption.`;
    const d = new Date(Date.now() + 24 * 3600e3); d.setHours(18, 0, 0, 0);
    $('pzDate').value = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    await Promise.all([Renderer.loadImages(), Renderer.loadFonts()]);
    renderTags(); renderSources(); onFocus(); initStyleBar();
  }

  // ---------- Focus ----------
  function onFocus() {
    const f = $('focus').value, sel = $('item');
    $('itemWrap').style.display = ['song', 'review', 'member'].includes(f) ? 'block' : 'none';
    $('customWrap').style.display = f === 'custom' ? 'block' : 'none';
    let opts = [];
    if (f === 'song') { $('itemLabel').textContent = 'Brano'; opts = st.data.songs.map(s => [s.n, `${String(s.n).padStart(2, '0')} - ${s.title}`]); }
    if (f === 'review') { $('itemLabel').textContent = 'Recensione'; opts = st.data.reviews.map(r => [r.id, `${r.publication} - ${r.author}`]); }
    if (f === 'member') { $('itemLabel').textContent = 'Membro'; opts = st.data.members.map(m => [m.id, `${m.name} (${m.role})`]); }
    sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l.replace(/</g, '&lt;')}</option>`).join('');
  }
  $('focus').onchange = onFocus;
  $('slides').oninput = () => ($('slidesVal').textContent = $('slides').value);

  // ---------- Mood ----------
  function renderMoods() {
    $('moods').innerHTML = st.lib.moods.map(m => `<button type="button" class="mood${m.id === st.mood ? ' sel' : ''}" data-m="${m.id}" style="--c:${m.color}"><b>${m.label}</b><span>${m.desc}</span></button>`).join('');
    $('moods').querySelectorAll('.mood').forEach(b => b.onclick = () => { st.mood = b.dataset.m; renderMoods(); });
  }
  const focusObj = () => {
    const f = $('focus').value;
    return { type: f, item: $('item').value, text: $('custom').value };
  };

  // ---------- Proposte ----------
  async function propose(again) {
    const focus = focusObj();
    if (focus.type === 'custom' && !focus.text.trim()) return toast('Scrivi il testo da cui partire.', true);
    st.focus = focus;
    const btn = again ? $('btnVar') : $('btnGen');
    busy(btn, true, 'Assemblo...');
    try {
      const out = await api('/api/propose', { mood: st.mood, focus, count: +$('slides').value, seed: again ? undefined : undefined });
      st.proposals = out.proposals; st.seed = out.seed;
      $('empty').style.display = 'none'; $('proposals').style.display = 'block'; $('btnVar').disabled = false;
      renderProposals();
    } catch (e) { toast(e.message, true); } finally { busy(btn, false); }
  }
  function renderProposals() {
    $('propList').innerHTML = st.proposals.map((p, i) => `<div class="prop"><h3>Proposta ${i + 1} - ${p.label}</h3><small>${p.desc}</small>
      <ol>${p.slides.map(s => `<li><b>${s.tipo}</b> <span>${(s.titolo || '').replace(/</g, '&lt;').slice(0, 44)}</span></li>`).join('')}</ol>
      <small>${p.menzioni.map(m => '@' + m).join(' ')}</small>
      <button class="btn" data-i="${i}">Usa questa proposta</button></div>`).join('');
    $('propList').querySelectorAll('button').forEach(b => b.onclick = () => useProposal(+b.dataset.i));
  }
  function useProposal(i) {
    const p = JSON.parse(JSON.stringify(st.proposals[i]));
    st.slides = p.slides; st.caption = p.caption; st.hashtags = p.hashtags; st.argomento = `${p.label} - ${st.lib.moods.find(m => m.id === st.mood).label}`; st.sel = 0; st.engine = 'library';
    showResult(); $('result').scrollIntoView({ behavior: 'smooth' });
  }
  $('btnGen').onclick = () => propose(false);
  $('btnVar').onclick = () => propose(true);

  $('btnSwap').onclick = async () => {
    if (st.sel === 0 && st.slides[0]._ref == null) return toast('Questa slide non e\' sostituibile.', true);
    busy($('btnSwap'), true, 'Cambio...');
    try {
      const out = await api('/api/swap', { mood: st.mood, focus: st.focus || { type: 'auto' }, slides: st.slides, index: st.sel });
      const keepCap = false;
      st.slides = out.slides; st.caption = out.caption; st.hashtags = out.hashtags;
      const sel = st.sel; showResult(true); selectSlide(sel);
    } catch (e) { toast(e.message, true); } finally { busy($('btnSwap'), false); }
  };
  $('btnRecap').onclick = async () => {
    try {
      const out = await api('/api/caption', { mood: st.mood, slides: st.slides });
      $('caption').value = out.caption; $('hashtags').value = out.hashtags.join(' '); updateCaptionStats();
    } catch (e) { toast(e.message, true); }
  };

  // ---------- AI live (Claude) ----------
  st.history = [];   // titoli/angoli gia' generati, passati all'AI per non ripeterli
  st.capHistory = [];
  async function generate() {
    const f = focusObj();
    if (f.type === 'custom' && !f.text.trim()) return toast('Scrivi il testo da cui partire.', true);
    st.focus = f;
    const params = { focus: f.type, item: f.item, custom: f.text, slides: +$('slides').value, mood: st.mood, notes: $('notes').value, avoid: st.history };
    busy($('btnClaude'), true, 'L\'AI sta scrivendo (10-30 s)...');
    try {
      const out = await api('/api/generate', params);
      st.slides = out.slides; st.caption = out.caption; st.hashtags = out.hashtags; st.argomento = out.argomento; st.sel = 0; st.engine = 'claude';
      st.history.push(`${out.argomento}: ${out.slides.slice(0, 3).map(x => x.titolo).join(' / ')}${out.stile ? ` [stile: ${out.stile.sfondo || ''}/${out.stile.palette || ''}/${out.stile.font || ''}]` : ''}`); st.history = st.history.slice(-10);
      st.capHistory.push(String(out.caption).split('\n')[0]); st.capHistory = st.capHistory.slice(-6);
      $('proposals').style.display = 'none';
      $('demoBanner').style.display = 'none';
      showResult(false, out.stile); $('result').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { toast(e.message, true); } finally { busy($('btnClaude'), false); }
  }
  $('btnClaude').onclick = generate;
  $('btnAiCap').onclick = async () => {
    busy($('btnAiCap'), true, 'Scrivo...');
    try {
      const out = await api('/api/ai-caption', { mood: st.mood, slides: st.slides, avoid: [...st.capHistory, $('caption').value.split('\n')[0]] });
      $('caption').value = out.caption; $('hashtags').value = out.hashtags.join(' '); updateCaptionStats();
      st.capHistory.push(out.caption.split('\n')[0]); st.capHistory = st.capHistory.slice(-6);
    } catch (e) { toast(e.message, true); } finally { busy($('btnAiCap'), false); }
  };

  // ---------- Stile visivo (sfondo, colori, font) ----------
  function fillSelect(id, map) { $(id).innerHTML = Object.entries(map).map(([k, v]) => `<option value="${k}">${esc(typeof v === 'string' ? v : v.label)}</option>`).join(''); }
  function initStyleBar() {
    fillSelect('stBg', Styles.BG); fillSelect('stPal', Styles.PALETTES); fillSelect('stFont', Styles.FONTS); fillSelect('stPhoto', Styles.PHOTO); fillSelect('stHook', Styles.HOOK);
    [['stBg', 'bg'], ['stPal', 'pal'], ['stFont', 'font'], ['stPhoto', 'photo'], ['stHook', 'hook']].forEach(([id, k]) => { $(id).onchange = () => { st.theme = { ...st.theme, [k]: $(id).value }; redrawAll(); }; });
    $('btnStyle').onclick = () => { setTheme(Styles.pick({ slides: st.slides, mood: st.mood, argomento: st.argomento, prev: st.theme })); };
  }
  function syncStyleBar() { [['stBg', 'bg'], ['stPal', 'pal'], ['stFont', 'font'], ['stPhoto', 'photo'], ['stHook', 'hook']].forEach(([id, k]) => ($(id).value = st.theme[k])); }
  async function redrawAll() {
    await Renderer.ensureFonts(st.theme);
    syncStyleBar();
    thumbs.forEach((_, i) => drawThumb(i)); drawBig();
  }
  function setTheme(t) { st.theme = { ...Styles.DEFAULT, ...t }; return redrawAll(); }

  function showResult(keepTheme, aiStyle) {
    if (!keepTheme || !st.theme) {
      const ai = aiStyle ? { bg: aiStyle.sfondo, pal: aiStyle.palette, font: aiStyle.font, photo: aiStyle.foto, hook: aiStyle.copertina } : {};
      const ok = Object.fromEntries(Object.entries(Styles.valid(ai)).filter(([, v]) => v));
      st.theme = { ...Styles.DEFAULT, ...Styles.pick({ slides: st.slides, mood: st.mood, argomento: st.argomento, prev: st.theme }), ...ok };
    }
    $('btnSwap').style.display = st.engine === 'claude' ? 'none' : '';
    $('empty').style.display = 'none'; $('result').style.display = 'block'; $('argom').textContent = st.argomento ? '- ' + st.argomento : '';
    $('caption').value = st.caption; $('hashtags').value = st.hashtags.join(' ');
    buildStrip(); selectSlide(0); updateCaptionStats(); updateSpec(); redrawAll();
  }

  function buildStrip() {
    const strip = $('strip'); strip.innerHTML = ''; thumbs.length = 0;
    st.slides.forEach((s, i) => {
      const div = document.createElement('div'); div.className = 'thumb'; div.onclick = () => selectSlide(i);
      const c = document.createElement('canvas'); div.appendChild(c);
      const b = document.createElement('span'); b.className = 'badge'; div.appendChild(b);
      strip.appendChild(div); thumbs.push({ div, c, b });
    });
    st.slides.forEach((_, i) => drawThumb(i));
  }
  function badge(s) { return s.citazione ? (s.verified ? '✓ citazione verificata' : '⚠ controlla citazione') : ''; }
  function drawThumb(i) {
    Renderer.render(thumbs[i].c, st.slides[i], i, st.slides.length, st.data.handle, st.theme);
    thumbs[i].b.textContent = badge(st.slides[i]); thumbs[i].b.style.display = thumbs[i].b.textContent ? 'block' : 'none';
    thumbs[i].b.style.color = st.slides[i].verified === false ? 'var(--amber)' : 'var(--ok)';
  }
  function drawBig() { Renderer.render($('big'), st.slides[st.sel], st.sel, st.slides.length, st.data.handle, st.theme); }

  const FIELDS = ['layout', 'immagine', 'titolo', 'corpo', 'stat', 'citazione', 'fonte', 'visual'];
  function selectSlide(i) {
    st.sel = i; thumbs.forEach((t, k) => t.div.classList.toggle('sel', k === i));
    const s = st.slides[i];
    FIELDS.forEach(f => ($('e_' + f).value = s[f] || (f === 'layout' ? 'text' : f === 'immagine' ? 'none' : '')));
    $('e_tag').value = (s.tag || []).join(', ');
    verifMsg(); drawBig();
  }
  function verifMsg() {
    const s = st.slides[st.sel];
    $('e_verif').innerHTML = !s.citazione ? '' : s.verified ? '<span class="good">Citazione trovata letteralmente nei testi/recensioni.</span>' : '<span class="warn">Attenzione: questa citazione non corrisponde a nessun testo o recensione caricati. Verificala o correggila.</span>';
  }
  FIELDS.forEach(f => $('e_' + f).addEventListener('input', () => {
    const s = st.slides[st.sel]; s[f] = $('e_' + f).value;
    if (f === 'citazione') { s.verified = undefined; $('e_verif').innerHTML = '<span class="hint">Citazione modificata: non piu\' verificata automaticamente.</span>'; }
    drawBig(); drawThumb(st.sel); updateSpec();
  }));
  $('e_tag').addEventListener('input', () => {
    st.slides[st.sel].tag = $('e_tag').value.split(',').map(x => x.replace(/^@/, '').trim()).filter(Boolean);
    drawBig(); drawThumb(st.sel);
  });

  // ---------- Caption ----------
  const fullCaption = () => $('caption').value.trim() + '\n\n' + $('hashtags').value.trim().split(/\s+/).filter(Boolean).map(h => '#' + h.replace(/^#/, '')).join(' ');
  function updateCaptionStats() {
    const cap = fullCaption(); const tags = $('hashtags').value.trim().split(/\s+/).filter(Boolean);
    const ments = [...new Set(($('caption').value.match(/@[A-Za-z0-9._]*[A-Za-z0-9_]/g) || []))];
    $('capStats').innerHTML = `${cap.length}/2200 caratteri &middot; ${tags.length}/30 hashtag &middot; ${ments.length} menzioni` + (cap.length > 2200 ? ' <span class="bad">- troppo lunga per Instagram</span>' : '') + (tags.length > 30 ? ' <span class="bad">- max 30 hashtag</span>' : '');
    $('mentionChips').innerHTML = ments.map(m => `<span class="chip m">${m}</span>`).join('') + tags.slice(0, 40).map(h => `<span class="chip">#${h.replace(/^#/, '')}</span>`).join('');
  }
  $('caption').oninput = $('hashtags').oninput = updateCaptionStats;
  $('btnCopyCap').onclick = async () => { await navigator.clipboard.writeText(fullCaption()); toast('Caption e hashtag copiati.'); };

  // ---------- Scheda testuale ----------
  function specText() {
    return st.slides.map((s, i) => {
      const body = [s.corpo, s.citazione ? `"${s.citazione}"${s.fonte ? ' - ' + s.fonte : ''}` : (s.fonte || ''), (s.tag || []).length ? 'Tag: ' + s.tag.map(t => '@' + t).join(' ') : ''].filter(Boolean).join('\n');
      return `---\n### SLIDE ${i + 1} (${s.tipo || ''})\n- **Visual / Immagine (Prompt o descrizione grafica):** ${s.visual || ''}\n- **Titolo / Testo Principale:** ${s.titolo || ''}\n- **Corpo / Dettagli:** ${body}\n- **Elementi di servizio:** ${s.servizio || ''}\n---`;
    }).join('\n\n');
  }
  function updateSpec() { $('spec').textContent = specText(); }
  $('btnSpec').onclick = async () => { await navigator.clipboard.writeText(specText() + '\n\nCAPTION:\n' + fullCaption()); toast('Scheda testuale copiata.'); };

  // ---------- Export ----------
  function renderOff(i) { const c = document.createElement('canvas'); Renderer.render(c, st.slides[i], i, st.slides.length, st.data.handle, st.theme); return c; }
  const blobOf = c => new Promise(r => c.toBlob(r, 'image/png'));
  const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const slug = () => (st.argomento || 'carosello').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'carosello';

  // Cartella pronta per il telefono: 01.png, 02.png..., caption.txt, tag e istruzioni
  $('btnPhone').onclick = async () => {
    busy($('btnPhone'), true, 'Preparo...');
    try {
      const n = st.slides.length, pad = i => String(i + 1).padStart(2, '0'), enc = new TextEncoder(), files = [];
      for (let i = 0; i < n; i++) files.push({ name: `${pad(i)}.png`, data: new Uint8Array(await (await blobOf(renderOff(i))).arrayBuffer()) });
      files.push({ name: 'caption.txt', data: enc.encode(fullCaption()) });
      const tagLines = st.slides.map((s, i) => (s.tag && s.tag.length) ? `Slide ${pad(i)} (${pad(i)}.png): ${s.tag.map(t => '@' + t).join('  ')}` : '').filter(Boolean);
      files.push({ name: 'tag-sulle-foto.txt', data: enc.encode(tagLines.length ? 'Tagga questi account sulla slide indicata (Instagram > Tagga persone):\n\n' + tagLines.join('\n') + '\n' : 'Nessun tag da inserire sulle foto: le @menzioni sono gia\' nella caption.\n') });
      files.push({ name: 'COME-PUBBLICARE.txt', data: enc.encode([
        'COME PUBBLICARE SU INSTAGRAM E TIKTOK (dal telefono)',
        '',
        '1. Salva le immagini 01.png, 02.png... nella galleria del telefono.',
        '2. Instagram: tocca +  >  Post  >  icona selezione multipla, e scegli le slide in ordine (01, 02, 03...).',
        '3. Apri caption.txt, copia tutto il testo (caption + hashtag) e incollalo nel campo didascalia.',
        '4. Apri tag-sulle-foto.txt: se ci sono account elencati, usa "Tagga persone" sulla slide indicata.',
        '5. Pubblica. Poi TikTok: + > Foto > stesse slide nello stesso ordine, stessa caption.',
        '',
        'Suggerimento: per il pubblico USA / Nord Europa pubblica la sera italiana (pomeriggio sulla costa est).',
        ''].join('\n')) });
      dl(zip(files), `petrosa-${slug()}-telefono.zip`);
      toast('Cartella scaricata: scompattala e porta le immagini sul telefono (Drive, AirDrop...).');
    } catch (e) { toast(e.message, true); } finally { busy($('btnPhone'), false); }
  };

  $('btnPng').onclick = async () => dl(await blobOf(renderOff(st.sel)), `petrosa-${slug()}-slide-${String(st.sel + 1).padStart(2, '0')}.png`);
  $('btnZip').onclick = async () => {
    const files = [];
    for (let i = 0; i < st.slides.length; i++) files.push({ name: `petrosa-slide-${String(i + 1).padStart(2, '0')}.png`, data: new Uint8Array(await (await blobOf(renderOff(i))).arrayBuffer()) });
    const enc = new TextEncoder();
    files.push({ name: 'caption.txt', data: enc.encode(fullCaption()) });
    files.push({ name: 'scheda-slide.md', data: enc.encode(specText()) });
    dl(zip(files), `petrosa-${slug()}.zip`);
  };

  // ZIP minimale (store, senza compressione)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
    const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
    files.forEach(f => {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)]);
      parts.push(local, name, f.data);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      offset += local.length + name.length + size;
    });
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  // ---------- PostFast ----------
  $('btnCh').onclick = async () => {
    busy($('btnCh'), true, 'Carico...');
    try {
      st.channels = await api('/api/social/accounts');
      $('chList').innerHTML = st.channels.map((c, i) => `<label class="ch" style="margin:0;color:var(--text)"><input type="checkbox" data-i="${i}" ${['INSTAGRAM', 'TIKTOK'].includes(c.platform) ? 'checked' : ''}><b>${esc(c.name)}</b><span class="hint" style="margin:0">${esc(c.platform)}${c.username ? ' &middot; @' + esc(c.username) : ''}</span></label>`).join('') || '<div class="hint warn">Nessun account collegato a PostFast.</div>';
      $('chHint').textContent = `${st.channels.length} account`;
    } catch (e) { toast(e.message, true); } finally { busy($('btnCh'), false); }
  };
  $('btnPub').onclick = async () => {
    const chosen = [...document.querySelectorAll('#chList input:checked')].map(x => st.channels[+x.dataset.i]);
    if (!chosen.length) return toast('Carica gli account e selezionane almeno uno.', true);
    const mode = $('pzMode').value;
    if (mode === 'now' && !confirm('Pubblicare tra pochi minuti su ' + chosen.map(c => c.name).join(', ') + '?')) return;
    if (mode === 'schedule' && !$('pzDate').value) return toast('Scegli data e ora di pubblicazione.', true);
    const bad = st.slides.filter(s => s.citazione && s.verified === false).length;
    if (bad && !confirm(`${bad} citazioni non sono state verificate. Pubblicare comunque?`)) return;
    try {
      const keys = [];
      for (let i = 0; i < st.slides.length; i++) {
        busy($('btnPub'), true, `Carico slide ${i + 1}/${st.slides.length}...`);
        const image = renderOff(i).toDataURL('image/jpeg', 0.92);
        keys.push((await api('/api/social/upload', { image })).key);
      }
      busy($('btnPub'), true, 'Programmo...');
      const out = await api('/api/social/publish', {
        caption: fullCaption(), keys, mode,
        accounts: chosen.map(c => ({ id: c.id, platform: c.platform })),
        date: $('pzDate').value ? new Date($('pzDate').value).toISOString() : null
      });
      toast(`PostFast: ${out.slides} slide su ${out.accounts} account (${mode === 'draft' ? 'bozza' : mode === 'now' ? 'pubblicazione tra pochi minuti' : 'programmato'}).`);
    } catch (e) { toast(e.message, true); } finally { busy($('btnPub'), false); }
  };

  // ---------- Tag & band simili ----------
  function renderTags() {
    const rows = [...st.tags.similarBands.map((b, i) => ({ b, kind: 'similarBands', i })), ...st.tags.community.map((b, i) => ({ b, kind: 'community', i }))];
    $('tagTable').innerHTML = '<tr><th>Band / account</th><th>Hashtag</th><th>Handle Instagram</th><th>Confermato</th><th>Priorita\'</th><th>Perche\' e\' simile</th><th></th></tr>' + rows.map(({ b, kind, i }) => `
      <tr data-k="${kind}" data-i="${i}">
        <td><b>${esc(b.name)}</b></td>
        <td><input type="text" data-f="hashtag" value="${esc(b.hashtag || '')}" style="width:130px"></td>
        <td><input type="text" data-f="handle" value="${esc(b.handle || '')}" placeholder="${esc((b.handleCandidates || []).join(' / ') || 'nomeutente')}" style="width:170px"></td>
        <td><input type="checkbox" data-f="confirmed" ${b.confirmed ? 'checked' : ''}></td>
        <td>${b.tier || '-'}</td>
        <td class="ev">${esc(b.evidence || '')}</td>
        <td><button class="ghost" data-act="find">Trova handle</button></td>
      </tr>`).join('');
    $('tagTable').querySelectorAll('input').forEach(inp => inp.onchange = () => {
      const tr = inp.closest('tr'), b = st.tags[tr.dataset.k][+tr.dataset.i], f = inp.dataset.f;
      b[f] = f === 'confirmed' ? inp.checked : inp.value.replace(/^@/, '').trim() || (f === 'handle' ? null : '');
      if (f === 'handle' && !b.handle) { b.confirmed = false; renderTags(); }
    });
    $('tagTable').querySelectorAll('[data-act=find]').forEach(btn => btn.onclick = async () => {
      const tr = btn.closest('tr'), b = st.tags[tr.dataset.k][+tr.dataset.i];
      busy(btn, true, '...');
      try {
        const r = await api('/api/find-handle', { name: b.name });
        if (r.handle) { b.handle = r.handle.replace(/^@/, ''); b.confirmed = false; toast(`Trovato @${b.handle}${r.certo ? '' : ' (incerto)'}. Controlla ${r.url || 'il profilo'} e spunta Confermato.`); renderTags(); }
        else toast('Nessun handle trovato.', true);
      } catch (e) { toast(e.message, true); busy(btn, false); }
    });
  }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  $('btnSaveTags').onclick = async () => { try { await api('/api/tags', { tags: st.tags }); toast('Tag salvati.'); } catch (e) { toast(e.message, true); } };
  $('btnAddBand').onclick = () => {
    const name = prompt('Nome della band'); if (!name) return;
    st.tags.similarBands.push({ name, hashtag: name.toLowerCase().replace(/[^a-z0-9]/g, ''), handle: null, confirmed: false, tier: 'secondary', evidence: 'Aggiunta manualmente.' });
    renderTags();
  };
  function renderSources() {
    $('sources').innerHTML = st.data.reviews.map(r => `<div>&bull; <b>${esc(r.publication)}</b> - ${esc(r.author)} ${r.extra ? '<span class="chip">aggiunta</span>' : ''}</div>`).join('');
  }
  $('btnScan').onclick = async () => {
    busy($('btnScan'), true, 'Sto leggendo il web...');
    try {
      const out = await api('/api/scan-web', {});
      const revs = out.reviews || [], bands = out.bands || [];
      $('scanOut').innerHTML = (!revs.length && !bands.length) ? '<div class="hint">Nessuna novita\'.</div>' :
        (revs.length ? '<b>Nuove recensioni / articoli</b>' + revs.map((r, i) => `<div class="card" style="margin:8px 0"><b>${esc(r.publication)}</b> - ${esc(r.author)} <a href="${esc(r.url)}" target="_blank" rel="noopener" style="color:var(--amber)">apri</a><div class="hint">"${esc(r.quote)}"</div><button class="ghost" data-r="${i}">Aggiungi alle fonti</button></div>`).join('') : '') +
        (bands.length ? '<br><b>Band citate come paragone</b>' + bands.map((b, i) => `<div class="row" style="margin:8px 0"><span class="chip">${esc(b.name)}</span><span class="hint" style="margin:0">${esc(b.source)}</span><button class="ghost" data-b="${i}">Aggiungi ai tag</button></div>`).join('') : '');
      $('scanOut').querySelectorAll('[data-r]').forEach(bt => bt.onclick = async () => { await api('/api/reviews', { review: revs[+bt.dataset.r] }); bt.disabled = true; bt.textContent = 'Aggiunta'; st.data = await api('/api/data'); renderSources(); });
      $('scanOut').querySelectorAll('[data-b]').forEach(bt => bt.onclick = async () => {
        const b = bands[+bt.dataset.b];
        st.tags.similarBands.push({ name: b.name, hashtag: b.name.toLowerCase().replace(/[^a-z0-9]/g, ''), handle: null, confirmed: false, tier: 'secondary', evidence: `Citata come paragone da ${b.source}.` });
        await api('/api/tags', { tags: st.tags }); bt.disabled = true; bt.textContent = 'Aggiunta'; renderTags();
      });
    } catch (e) { toast(e.message, true); } finally { busy($('btnScan'), false); }
  };

  init().catch(e => toast('Errore di avvio: ' + e.message, true));
})();
