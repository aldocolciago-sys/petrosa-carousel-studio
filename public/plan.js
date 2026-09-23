// Petrosa Carousel Studio - piano settimanale: 5 o 7 caroselli con Reel abbinato
(() => {
  const C = window.StudioCtx, $ = C.$, st = C.st;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const DAYS = ['domenica', 'lunedi\'', 'martedi\'', 'mercoledi\'', 'giovedi\'', 'venerdi\'', 'sabato'];
  const plan = { data: null, seed: null, reels: {}, reelUrls: {} };   // reels[i] = {blob, ext} quando il Reel del giorno i e' gia' stato generato in questa sessione; reelUrls[i] = object URL per l'anteprima. Ogni giorno tiene il proprio Reel: generarne uno nuovo NON cancella quelli degli altri giorni.
  const songTitle = n => ((st.data.songs || []).find(x => x.n === n) || {}).title || '';
  const moodLabel = id => ((st.lib && st.lib.moods || []).find(m => m.id === id) || {}).label || id;

  // riga in cima al piano con i mood che finora (dal feedback 👍/👎) hanno reso di piu': solo un suggerimento, mai un filtro automatico
  function drawInsight() {
    const box = $('planInsight'); if (!box) return;
    const rows = window.Feedback ? window.Feedback.insight() : [];
    if (!rows.length) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.textContent = 'Dal tuo feedback finora: ' + rows.slice(0, 4).map(r => `${moodLabel(r.mood)} (${r.score > 0 ? '+' : ''}${r.score})`).join(', ') + '.';
  }
  // account PostFast dedicati al piano (stessa lista di account di sezione 6, ma scelti qui per comodita': un post puo' uscire su piu' piattaforme insieme)
  function renderPlanChannels() {
    $('planChList').innerHTML = (st.channels || []).map((c, i) => `<label class="ch" style="margin:0;color:var(--text)"><input type="checkbox" data-i="${i}" ${['INSTAGRAM', 'TIKTOK'].includes(c.platform) ? 'checked' : ''}><b>${esc(c.name)}</b><span class="hint" style="margin:0">${esc(c.platform)}${c.username ? ' &middot; @' + esc(c.username) : ''}</span></label>`).join('') || '<div class="hint warn">Nessun account collegato a PostFast.</div>';
    $('planChHint').textContent = `${(st.channels || []).length} account`;
  }
  async function loadPlanChannels() {
    C.busy($('planChBtn'), true, 'Carico...');
    try { st.channels = await C.api('/api/social/accounts'); renderPlanChannels(); } catch (e) { C.toast(e.message, true); } finally { C.busy($('planChBtn'), false); }
  }
  const planChosenChannels = () => [...document.querySelectorAll('#planChList input:checked')].map(x => st.channels[+x.dataset.i]);
  const dayStatus = (i, msg) => { const el = document.querySelector(`.pday[data-i="${i}"] [data-status]`); if (el) el.textContent = msg || ''; };

  async function draw() {
    const P = plan.data; if (!P) return;
    for (const id of ['planSend', 'planMode', 'planChBox']) $(id).style.display = st.cfg && st.cfg.postfast ? '' : 'none';
    $('planCard').style.display = 'block'; $('empty').style.display = 'none';
    $('planHint').textContent = `${P.plan.length} caroselli, ciascuno con il suo Reel. Ogni Reel che generi resta salvato per il suo giorno (qui sotto, con anteprima): generarne uno nuovo non cancella gli altri, e puoi crearli tutti insieme con &laquo;Genera tutti i Reel&raquo; e poi programmarli su PostFast quando vuoi, anche in un secondo momento. Apri un giorno per rivederlo e modificarlo nell'editor; con 👍/👎 dici cosa ha reso, e le prossime settimane ne terranno un po' conto.`;
    drawInsight();
    if (st.channels && st.channels.length) renderPlanChannels();
    await Promise.all(P.plan.map(d => window.Renderer.need([d.slides[0]])));
    const rateOf = d => window.Feedback ? window.Feedback.rated(d) : null;
    const canPub = !!(st.cfg && st.cfg.postfast);
    $('planList').innerHTML = P.plan.map((d, i) => { const r = rateOf(d); const ready = !!plan.reels[i]; return `<div class="pday" data-i="${i}">
      <canvas width="270" height="338"></canvas>
      <div><div class="pd-h">Giorno ${d.day} &middot; ${esc(d.slotLabel || '')}<span class="pd-when" data-when="${i}">${esc(d.whenText || '')}</span></div>
       <div class="pd-t"><b>${esc(d.label)}</b> &middot; ${esc(moodLabel(d.mood))} &middot; ${d.slides.length} slide</div>
       <div class="pd-c">&laquo;${esc(String(d.slides[0].titolo).replace(/^[«“"]+|[»”"]+$/g, ''))}&raquo; &middot; ${esc(d.caption.split('\n')[0])}</div>
       <div class="pd-c">Reel: ${String(d.reel.song).padStart(2, '0')} - ${esc(songTitle(d.reel.song))} <span class="reel-flag${ready ? ' ready' : ''}" data-reelflag="${i}" title="${ready ? 'Reel gia\' pronto per questo giorno: clicca per vedere l\'anteprima' : 'Reel non ancora generato'}">${ready ? '&#9989; pronto &middot; vedi anteprima' : '&#9675; da generare'}</span></div></div>
      <div class="row"><button class="btn" data-open="${i}">Apri nell'editor</button>
       <button class="ghost" data-mkreel="${i}">&#127916; ${ready ? 'Rigenera Reel' : 'Crea Reel'}</button>
       ${canPub ? `<button class="ghost" data-pubpost="${i}">Programma carosello</button><button class="ghost" data-pubreel="${i}">Programma Reel</button>` : ''}
       <button class="ghost${r === 'up' ? ' on' : ''}" data-rate="up" data-i="${i}" title="E' andata bene">&#128077;</button>
       <button class="ghost${r === 'down' ? ' on' : ''}" data-rate="down" data-i="${i}" title="Non ha reso">&#128078;</button></div>
      <div class="reelprev" data-reelprev="${i}"><video controls playsinline muted></video><div><p class="hint">Questo e' il Reel gia' generato per il giorno ${d.day} (${esc(d.slotLabel || '')}). E' salvato qui, indipendente dagli altri giorni: puoi programmarlo su PostFast ora o piu' tardi, senza doverlo rifare.</p><button class="ghost" data-dlreel="${i}">Scarica questo Reel</button></div></div>
      <div class="hint" data-status="${i}" style="grid-column:1/-1"></div></div>`; }).join('');
    P.plan.forEach((d, i) => {
      const c = $('planList').querySelector(`.pday[data-i="${i}"] canvas`);
      window.Renderer.render(c, d.slides[0], 0, d.slides.length, st.data.handle, d.theme || st.theme || undefined);
    });
    $('planList').querySelectorAll('[data-open]').forEach(b => b.onclick = () => openDay(+b.dataset.open));
    $('planList').querySelectorAll('[data-mkreel]').forEach(b => b.onclick = () => dayCreateReel(+b.dataset.mkreel, !!plan.reels[+b.dataset.mkreel]));
    $('planList').querySelectorAll('[data-pubpost]').forEach(b => b.onclick = () => dayScheduleCarousel(+b.dataset.pubpost));
    $('planList').querySelectorAll('[data-pubreel]').forEach(b => b.onclick = () => dayScheduleReel(+b.dataset.pubreel));
    $('planList').querySelectorAll('[data-reelflag]').forEach(b => b.onclick = () => toggleReelPreview(+b.dataset.reelflag));
    $('planList').querySelectorAll('[data-dlreel]').forEach(b => b.onclick = () => downloadDayReel(+b.dataset.dlreel));
    Object.keys(plan.reels).forEach(k => fillReelPreview(+k));
    $('planList').querySelectorAll('[data-rate]').forEach(b => b.onclick = () => {
      const d = P.plan[+b.dataset.i]; if (!window.Feedback) return;
      window.Feedback.rate(d, b.dataset.rate === 'up' ? 1 : -1, d.mood);
      C.toast(b.dataset.rate === 'up' ? 'Segnato: andata bene.' : 'Segnato: non ha reso.'); draw();
    });
  }
  // ---- azioni per singolo giorno: si apre quel giorno nell'editor (senza far scorrere la pagina), si agisce, e lo stato compare sotto la sua scheda ----
  // Ogni giorno tiene il proprio Reel gia' pronto in plan.reels[i]: generare il Reel di un altro giorno NON lo tocca.
  // markReelReady salva anche un'anteprima video per QUESTO giorno (object URL dedicato), cosi' resta visibile anche dopo aver generato altri Reel.
  function markReelReady(i, out) {
    plan.reels[i] = { blob: out.blob, ext: out.ext };
    if (plan.reelUrls[i]) URL.revokeObjectURL(plan.reelUrls[i]);
    plan.reelUrls[i] = URL.createObjectURL(out.blob);
    const flag = document.querySelector(`[data-reelflag="${i}"]`);
    if (flag) { flag.classList.add('ready'); flag.innerHTML = '&#9989; pronto &middot; vedi anteprima'; flag.title = 'Reel gia\' pronto per questo giorno: clicca per vedere l\'anteprima'; }
    const mk = document.querySelector(`.pday[data-i="${i}"] [data-mkreel]`); if (mk) mk.textContent = '\u{1F3AC} Rigenera Reel';
    fillReelPreview(i);
  }
  // riempie (o aggiorna) il video di anteprima del giorno i, se la scheda del piano e' gia' disegnata
  function fillReelPreview(i) {
    const box = document.querySelector(`[data-reelprev="${i}"]`); if (!box || !plan.reelUrls[i]) return;
    const v = box.querySelector('video'); if (v && v.src !== plan.reelUrls[i]) v.src = plan.reelUrls[i];
  }
  function toggleReelPreview(i) {
    if (!plan.reels[i]) { dayCreateReel(i); return; }   // non ancora pronto: il click lo genera invece di aprire un'anteprima vuota
    const box = document.querySelector(`[data-reelprev="${i}"]`); if (!box) return;
    fillReelPreview(i);
    box.classList.toggle('open');
  }
  function downloadDayReel(i) {
    const r = plan.reels[i]; if (!r) return;
    const d = plan.data.plan[i];
    C.dl(r.blob, `petrosa-reel-giorno${d.day}-${(d.slotLabel || '').replace(/\s+/g, '')}.${r.ext || 'webm'}`);
  }
  // fa il lavoro vero (apre il giorno, genera il video se serve, segna il flag); onProgress e' facoltativo, per chi vuole
  // mostrare l'avanzamento sul proprio pulsante invece che lasciarlo sul pulsante "Genera video" dell'editor Reel
  // Se il Reel di questo giorno e' gia' pronto (plan.reels[i]), lo riusa subito senza rigenerarlo: e' cosi' che i Reel
  // creati in blocco restano disponibili per essere programmati su PostFast in un secondo momento.
  async function generateDayReel(i, onProgress) {
    if (plan.reels[i]) { if (onProgress) onProgress('Reel gia\' pronto (riusato, non rigenerato).'); return { ...plan.reels[i], reused: true }; }
    await openDay(i, { quiet: true }); await window.Renderer.need(st.slides);
    if (onProgress) onProgress('Creo il video (tieni questa scheda aperta e in primo piano)...');
    const r = await window.Reel.ensure(onProgress ? { onProgress: (tt, T) => onProgress(`Registro ${tt.toFixed(0)}/${T.toFixed(0)} s (non cambiare scheda)...`) } : undefined);
    markReelReady(i, r);
    return r;
  }
  async function dayCreateReel(i, force) {
    const btn = document.querySelector(`.pday[data-i="${i}"] [data-mkreel]`); if (!btn) return;
    if (force) delete plan.reels[i];   // "Rigenera Reel": forza una nuova registrazione anche se uno era gia' pronto
    C.busy(btn, true, 'Apro...');
    try {
      const r = await generateDayReel(i, m => dayStatus(i, m));
      dayStatus(i, r.reused ? 'Reel gia\' pronto (riusato): vedi l\'anteprima qui sotto.' : 'Reel creato e salvato per questo giorno: vedi l\'anteprima qui sotto.');
      const d = plan.data.plan[i]; C.toast(`Reel del giorno ${d.day} (${d.slotLabel}) pronto.`);
    } catch (e) { dayStatus(i, ''); C.toast(e.message, true); } finally { C.busy(btn, false); }
  }
  // ---- genera in coda tutti i Reel del piano corrente (uno alla volta: la registrazione richiede la scheda in primo piano) ----
  async function generateAllReels() {
    if (!plan.data || running) return;
    const P = plan.data.plan, btn = $('planMkAllReels');
    running = true;
    for (const b of ['planZip', 'planSend', 'planAgain', 'btnPlan', 'planMkAllReels']) if ($(b)) $(b).disabled = true;
    let done = 0, errors = [];
    try {
      for (let i = 0; i < P.length; i++) {
        if (plan.reels[i]) { done++; continue; }   // gia' generato: passa al prossimo
        const tag = `giorno ${P[i].day} (${P[i].slotLabel})`;
        C.busy(btn, true, `Reel ${i + 1}/${P.length}: creo quello del ${tag}...`);
        try {
          await generateDayReel(i, m => { dayStatus(i, m); C.busy(btn, true, `Reel ${i + 1}/${P.length} (${tag}): ${m}`); });
          dayStatus(i, 'Reel creato: apri il giorno per vederlo e scaricarlo.');
          done++;
        } catch (e) { dayStatus(i, ''); errors.push(`${tag}: ${e.message}`); }
      }
      C.toast(errors.length ? `${done}/${P.length} Reel pronti, ${errors.length} errori (${errors[0]}).` : `Tutti i ${P.length} Reel della settimana sono pronti.`, !!errors.length);
    } finally {
      running = false;
      for (const b of ['planZip', 'planSend', 'planAgain', 'btnPlan', 'planMkAllReels']) if ($(b)) $(b).disabled = false;
      C.busy(btn, false);
    }
  }
  function pfPrereq(i) {
    const chosen = planChosenChannels();
    if (!chosen.length) { C.toast('Scegli almeno un account PostFast qui sopra, nel piano.', true); return null; }
    const mode = $('planMode').value;
    if (mode === 'now') { C.toast('Per il piano scegli "Programma" o "Bozze".', true); return null; }
    return { chosen, mode };
  }
  async function dayScheduleCarousel(i) {
    const btn = document.querySelector(`.pday[data-i="${i}"] [data-pubpost]`); if (!btn) return;
    const pre = pfPrereq(i); if (!pre) return;
    const d = plan.data.plan[i];
    C.busy(btn, true, 'Carico...');
    try {
      await openDay(i, { quiet: true }); await window.Renderer.need(st.slides);
      dayStatus(i, 'Carico il carosello su PostFast...');
      await C.sendCarousel(pre.chosen, pre.mode, d.when.carousel, m => dayStatus(i, m));
      dayStatus(i, `Carosello ${pre.mode === 'draft' ? 'salvato come bozza' : 'programmato'} su ${pre.chosen.map(c => c.name).join(', ')}.`);
      C.toast(`Giorno ${d.day} (${d.slotLabel}): carosello su PostFast.`);
    } catch (e) { dayStatus(i, ''); C.toast(e.message, true); } finally { C.busy(btn, false); }
  }
  async function dayScheduleReel(i) {
    const btn = document.querySelector(`.pday[data-i="${i}"] [data-pubreel]`); if (!btn) return;
    const pre = pfPrereq(i); if (!pre) return;
    const d = plan.data.plan[i];
    C.busy(btn, true, 'Preparo...');
    try {
      const r = await generateDayReel(i, m => dayStatus(i, m));
      dayStatus(i, 'Carico il Reel su PostFast...');
      await window.Reel.sendReel(r.blob, pre.chosen, pre.mode, d.when.reel, m => dayStatus(i, m));
      dayStatus(i, `Reel ${pre.mode === 'draft' ? 'salvato come bozza' : 'programmato'} su ${pre.chosen.map(c => c.name).join(', ')}.`);
      C.toast(`Giorno ${d.day} (${d.slotLabel}): Reel su PostFast.`);
    } catch (e) { dayStatus(i, ''); C.toast(e.message, true); } finally { C.busy(btn, false); }
  }

  async function openDay(i, o) {
    const d = plan.data.plan[i];
    st.planDay = i;   // prima di loadPost: se sceglie un primo stile per il giorno, deve salvarlo su QUESTO giorno, non sul precedente
    C.loadPost(d, { mood: d.mood, focus: d.focus, when: d.when, quiet: !!(o && o.quiet), argomento: `Giorno ${d.day} - ${d.label}`, theme: d.theme });
    const R = window.Reel; if (R && R.setSong) await R.setSong(d.reel.song, { keepQuote: !!d.slides.find(s => s.citazione) });
  }

  // assegna a ogni carosello/Reel del piano un proprio stile grafico (sfondo/palette/font), scelto in base al mood e
  // al contenuto del giorno, incatenando ogni scelta a quella del giorno precedente cosi' NESSUNA delle tre dimensioni
  // si ripete mai fra due caroselli consecutivi (Styles.pick esclude per ciascuna il valore di "prev"): il piano non
  // sembra piu' tutto uguale, e Reel di un giorno riusa lo stesso stile del suo carosello (sono la stessa "coppia").
  function assignPlanThemes(list) {
    let prev = null;
    list.forEach(d => {
      const theme = { ...window.Styles.DEFAULT, ...window.Styles.pick({ slides: d.slides, mood: d.mood, argomento: d.label, prev }) };
      d.theme = theme; prev = theme;
    });
  }

  async function generate() {
    busy(true);
    try {
      const out = await C.api('/api/plan', { days: +$('planDays').value, avoid: C.avoidIds ? C.avoidIds() : C.recent() });
      Object.values(plan.reelUrls).forEach(u => URL.revokeObjectURL(u));   // nuovo piano: i Reel del piano precedente non servono piu'
      plan.data = out; plan.seed = out.seed; plan.reels = {}; plan.reelUrls = {}; st.plan = out;
      out.plan.forEach(d => C.remember(d));
      assignPlanThemes(out.plan);
      if (window.Schedule) window.Schedule.annotate(out.plan);
      await draw();
      $('planCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { C.toast(e.message, true); } finally { busy(false); }
  }
  // ---- esecuzione di tutto il piano, un giorno alla volta (la scheda deve restare aperta e in primo piano) ----
  const prog = m => { $('planProg').textContent = m || ''; };
  let running = false;
  // Un giorno che non si apre nemmeno (dati mancanti, errore di rete nel preparare le immagini...) NON deve fermare
  // tutto il piano: lo si segna come errore e si passa al giorno dopo. Prima un problema isolato su un solo giorno
  // interrompeva l'intero invio a meta' strada, lasciando tutti i giorni successivi non tentati per niente.
  // Ritorna l'elenco [ [etichetta del giorno, messaggio d'errore], ... ] dei giorni che non si sono nemmeno aperti;
  // chi chiama fn() resta comunque responsabile di gestire (e segnalare) gli errori DENTRO fn.
  async function each(fn) {
    if (running) return []; running = true;
    for (const b of ['planZip', 'planSend', 'planAgain', 'btnPlan']) $(b).disabled = true;
    const errors = [];
    try {
      const P = plan.data.plan;
      for (let i = 0; i < P.length; i++) {
        const tag = `Giorno ${P[i].day} (${P[i].slotLabel})`;
        try { await openDay(i, { quiet: true }); await window.Renderer.need(st.slides); await fn(P[i], i, P.length); }
        catch (e) { errors.push([tag, e.message]); dayStatus(i, ''); }
      }
    } finally { running = false; for (const b of ['planZip', 'planSend', 'planAgain', 'btnPlan']) $(b).disabled = false; prog(''); }
    return errors;
  }
  async function exportAll() {
    if (!plan.data) return;
    const files = [], P = window.Pack, enc = new TextEncoder(), withReel = $('planReel').checked;
    try {
      const errors = await each(async (d, i, n) => {
        const tag = `Giorno ${d.day} (${d.slotLabel}) ${i + 1}/${n}`;
        const pre = P.folder(d) + '/';
        files.push(...await C.packageFiles({ prefix: pre, reel: withReel, onStatus: m => prog(`${tag}: ${m}`) }));
        prog(`${tag} pronto.`);
      });
      files.unshift({ name: 'PIANO.txt', data: enc.encode(P.planFile(plan.data.plan, window.Schedule && window.Schedule.describe)) });
      C.dl(C.zip(files), `petrosa-piano-${plan.data.days || Math.round(plan.data.plan.length / 3)}-giorni.zip`);
      C.toast(errors.length
        ? `Piano scaricato, ma ${errors.length} giorni sono saltati per errore:\n${errors.slice(0, 8).map(([t, m]) => `${t}: ${m}`).join('\n')}${errors.length > 8 ? `\n...e altri ${errors.length - 8}` : ''}`
        : 'Piano scaricato: una cartella per giorno con carosello, Reel, caption e istruzioni. Apri PIANO.txt per il calendario.', !!errors.length);
    } catch (e) { C.toast(e.message, true); }
  }
  async function scheduleAll() {
    if (!plan.data) return;
    let chosen = planChosenChannels(); const mode = $('planMode').value;
    if (!chosen.length && st.cfg && st.cfg.postfast) { await loadPlanChannels(); chosen = planChosenChannels(); }
    if (!chosen.length) return C.toast('Nessun account PostFast selezionato: scegli gli account qui sopra, nel piano.', true);
    if (mode === 'now') return C.toast('Per il piano scegli "Programma" o "Bozze".', true);
    const withReel = $('planReel').checked, n = plan.data.plan.length;
    if (!confirm(`Inviare a PostFast ${n} caroselli${withReel ? ' e ' + n + ' Reel' : ''} su ${chosen.map(c => c.name).join(', ')} (${mode === 'draft' ? 'come bozze' : 'programmati agli orari consigliati'})?\nCi vorranno alcuni minuti: tieni aperta questa scheda. Se un giorno da' errore, si passa comunque a quello dopo: alla fine vedi l'elenco di cosa non e' andato.`)) return;
    const res = [];
    // se il PRIMO Reel fallisce perche' il browser non riesce a caricare il video direttamente su PostFast (blocco
    // CORS: un limite del bucket di PostFast, non dell'app), TUTTI i Reel falliranno allo stesso identico modo -
    // non ha senso ritentarli 15-21 volte: dopo il primo si salta subito il Reel dei giorni seguenti (il carosello
    // continua regolarmente) cosi' il piano finisce prima e il messaggio finale resta chiaro invece di ripetersi.
    let reelBlockedMsg = null;
    const openErrors = await each(async (d, i, N) => {
      const tag = `Giorno ${d.day} (${d.slotLabel})`;
      try {
        prog(`${tag} ${i + 1}/${N}: carico il carosello...`);
        await C.sendCarousel(chosen, mode, d.when.carousel, m => prog(`${tag} ${i + 1}/${N}: ${m}`));
        if (!withReel) { res.push([tag, true]); return; }
        if (reelBlockedMsg) { res.push([tag, false, 'Carosello ok. Reel saltato (vedi sotto).']); return; }
        try {
          const r = await generateDayReel(i, m => prog(`${tag} ${i + 1}/${N}: ${m}`));
          await window.Reel.sendReel(r.blob, chosen, mode, d.when.reel, m => prog(`${tag} ${i + 1}/${N}: ${m}`));
          res.push([tag, true]);
        } catch (e) {
          if (/blocco CORS/.test(e.message)) reelBlockedMsg = e.message;
          res.push([tag, false, 'Carosello ok. Reel: ' + e.message]);
        }
      } catch (e) { res.push([tag, false, e.message]); }
    });
    openErrors.forEach(([tag, msg]) => res.push([tag, false, `Giorno non aperto: ${msg}`]));
    const bad = res.filter(r => !r[1]);
    if (!bad.length) return C.toast(`PostFast: ${n} caroselli${withReel ? ' e ' + n + ' Reel' : ''} ${mode === 'draft' ? 'salvati come bozza' : 'programmati'}.`);
    const lines = bad.slice(0, 8).map(b => `${b[0]}: ${b[2]}`).join('\n');
    const corsNote = reelBlockedMsg ? `\n\nI Reel non si caricano: e' PostFast che blocca l'upload diretto dal browser (CORS), non un problema dell'app - i caroselli invece vanno regolarmente. Serve che PostFast abiliti il CORS sul link di upload dei video per il tuo dominio; nel frattempo scarica i Reel dal giorno nel piano e caricali a mano dal pannello PostFast.` : '';
    C.toast(`Piano inviato: ${res.length - bad.length}/${res.length} ok, ${bad.length} con errori:\n${lines}${bad.length > 8 ? `\n...e altri ${bad.length - 8}` : ''}${corsNote}`, true);
  }
  $('planZip').onclick = exportAll; $('planSend').onclick = scheduleAll;
  if ($('planChBtn')) $('planChBtn').onclick = loadPlanChannels;
  if ($('planMkAllReels')) $('planMkAllReels').onclick = generateAllReels;
  const busy = on => C.busy($('btnPlan'), on, 'Preparo il piano...');
  $('btnPlan').onclick = generate; $('planAgain').onclick = generate;
  // salva lo stile grafico scelto per il giorno i, cosi' riaprendolo nell'editor resta quello (non uno pescato a caso ogni volta)
  function saveTheme(i, theme) { if (plan.data && plan.data.plan[i]) plan.data.plan[i].theme = { ...theme }; }
  window.Plan = { generate, openDay, exportAll, scheduleAll, redraw: draw, get: () => plan.data, dayCreateReel, dayScheduleCarousel, dayScheduleReel, generateAllReels, reelsReady: () => Object.keys(plan.reels).length, saveTheme };
})();
