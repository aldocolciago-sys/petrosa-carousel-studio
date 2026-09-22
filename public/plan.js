// Petrosa Carousel Studio - piano settimanale: 5 o 7 caroselli con Reel abbinato
(() => {
  const C = window.StudioCtx, $ = C.$, st = C.st;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const DAYS = ['domenica', 'lunedi\'', 'martedi\'', 'mercoledi\'', 'giovedi\'', 'venerdi\'', 'sabato'];
  const plan = { data: null, seed: null };
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
    $('planHint').textContent = `${P.plan.length} caroselli, ciascuno con il suo Reel. Apri un giorno per rivederlo e modificarlo nell'editor, premi &laquo;Crea Reel&raquo; per generarne il video, poi programma carosello e Reel separatamente su PostFast; con 👍/👎 dici cosa ha reso, e le prossime settimane ne terranno un po' conto.`;
    drawInsight();
    if (st.channels && st.channels.length) renderPlanChannels();
    await Promise.all(P.plan.map(d => window.Renderer.need([d.slides[0]])));
    const rateOf = d => window.Feedback ? window.Feedback.rated(d) : null;
    const canPub = !!(st.cfg && st.cfg.postfast);
    $('planList').innerHTML = P.plan.map((d, i) => { const r = rateOf(d); return `<div class="pday" data-i="${i}">
      <canvas width="270" height="338"></canvas>
      <div><div class="pd-h">Giorno ${d.day}<span class="pd-when" data-when="${i}">${esc(d.whenText || '')}</span></div>
       <div class="pd-t"><b>${esc(d.label)}</b> &middot; ${esc(moodLabel(d.mood))} &middot; ${d.slides.length} slide</div>
       <div class="pd-c">&laquo;${esc(String(d.slides[0].titolo).replace(/^[«“"]+|[»”"]+$/g, ''))}&raquo; &middot; ${esc(d.caption.split('\n')[0])}</div>
       <div class="pd-c">Reel: ${String(d.reel.song).padStart(2, '0')} - ${esc(songTitle(d.reel.song))}</div></div>
      <div class="row"><button class="btn" data-open="${i}">Apri nell'editor</button>
       <button class="ghost" data-mkreel="${i}">&#127916; Crea Reel</button>
       ${canPub ? `<button class="ghost" data-pubpost="${i}">Programma carosello</button><button class="ghost" data-pubreel="${i}">Programma Reel</button>` : ''}
       <button class="ghost${r === 'up' ? ' on' : ''}" data-rate="up" data-i="${i}" title="E' andata bene">&#128077;</button>
       <button class="ghost${r === 'down' ? ' on' : ''}" data-rate="down" data-i="${i}" title="Non ha reso">&#128078;</button></div>
      <div class="hint" data-status="${i}" style="grid-column:1/-1"></div></div>`; }).join('');
    P.plan.forEach((d, i) => {
      const c = $('planList').querySelector(`.pday[data-i="${i}"] canvas`);
      window.Renderer.render(c, d.slides[0], 0, d.slides.length, st.data.handle, st.theme || undefined);
    });
    $('planList').querySelectorAll('[data-open]').forEach(b => b.onclick = () => openDay(+b.dataset.open));
    $('planList').querySelectorAll('[data-mkreel]').forEach(b => b.onclick = () => dayCreateReel(+b.dataset.mkreel));
    $('planList').querySelectorAll('[data-pubpost]').forEach(b => b.onclick = () => dayScheduleCarousel(+b.dataset.pubpost));
    $('planList').querySelectorAll('[data-pubreel]').forEach(b => b.onclick = () => dayScheduleReel(+b.dataset.pubreel));
    $('planList').querySelectorAll('[data-rate]').forEach(b => b.onclick = () => {
      const d = P.plan[+b.dataset.i]; if (!window.Feedback) return;
      window.Feedback.rate(d, b.dataset.rate === 'up' ? 1 : -1, d.mood);
      C.toast(b.dataset.rate === 'up' ? 'Segnato: andata bene.' : 'Segnato: non ha reso.'); draw();
    });
  }
  // ---- azioni per singolo giorno: si apre quel giorno nell'editor (senza far scorrere la pagina), si agisce, e lo stato compare sotto la sua scheda ----
  async function dayCreateReel(i) {
    const btn = document.querySelector(`.pday[data-i="${i}"] [data-mkreel]`); if (!btn) return;
    C.busy(btn, true, 'Apro...');
    try {
      await openDay(i, { quiet: true }); await window.Renderer.need(st.slides);
      dayStatus(i, 'Creo il video (tieni questa scheda aperta e in primo piano)...');
      const r = await window.Reel.ensure();
      dayStatus(i, r.reused ? 'Reel gia\' pronto (riusato).' : 'Reel creato: apri il giorno per vederlo e scaricarlo.');
      C.toast(`Reel del giorno ${plan.data.plan[i].day} pronto.`);
    } catch (e) { dayStatus(i, ''); C.toast(e.message, true); } finally { C.busy(btn, false); }
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
      C.toast(`Giorno ${d.day}: carosello su PostFast.`);
    } catch (e) { dayStatus(i, ''); C.toast(e.message, true); } finally { C.busy(btn, false); }
  }
  async function dayScheduleReel(i) {
    const btn = document.querySelector(`.pday[data-i="${i}"] [data-pubreel]`); if (!btn) return;
    const pre = pfPrereq(i); if (!pre) return;
    const d = plan.data.plan[i];
    C.busy(btn, true, 'Preparo...');
    try {
      await openDay(i, { quiet: true }); await window.Renderer.need(st.slides);
      dayStatus(i, 'Creo il Reel (se non esiste gia\')...');
      const r = await window.Reel.ensure();
      dayStatus(i, 'Carico il Reel su PostFast...');
      await window.Reel.sendReel(r.blob, pre.chosen, pre.mode, d.when.reel, m => dayStatus(i, m));
      dayStatus(i, `Reel ${pre.mode === 'draft' ? 'salvato come bozza' : 'programmato'} su ${pre.chosen.map(c => c.name).join(', ')}.`);
      C.toast(`Giorno ${d.day}: Reel su PostFast.`);
    } catch (e) { dayStatus(i, ''); C.toast(e.message, true); } finally { C.busy(btn, false); }
  }

  async function openDay(i, o) {
    const d = plan.data.plan[i];
    C.loadPost(d, { mood: d.mood, focus: d.focus, when: d.when, quiet: !!(o && o.quiet), argomento: `Giorno ${d.day} - ${d.label}` });
    const R = window.Reel; if (R && R.setSong) await R.setSong(d.reel.song, { keepQuote: !!d.slides.find(s => s.citazione) });
    st.planDay = i;
  }

  async function generate() {
    busy(true);
    try {
      const out = await C.api('/api/plan', { days: +$('planDays').value, avoid: C.avoidIds ? C.avoidIds() : C.recent() });
      plan.data = out; plan.seed = out.seed; st.plan = out;
      out.plan.forEach(d => C.remember(d));
      if (window.Schedule) window.Schedule.annotate(out.plan);
      await draw();
      $('planCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { C.toast(e.message, true); } finally { busy(false); }
  }
  // ---- esecuzione di tutto il piano, un giorno alla volta (la scheda deve restare aperta e in primo piano) ----
  const prog = m => { $('planProg').textContent = m || ''; };
  let running = false;
  async function each(fn) {
    if (running) return; running = true;
    for (const b of ['planZip', 'planSend', 'planAgain', 'btnPlan']) $(b).disabled = true;
    try { const P = plan.data.plan; for (let i = 0; i < P.length; i++) { await openDay(i, { quiet: true }); await window.Renderer.need(st.slides); await fn(P[i], i, P.length); } }
    finally { running = false; for (const b of ['planZip', 'planSend', 'planAgain', 'btnPlan']) $(b).disabled = false; prog(''); }
  }
  async function exportAll() {
    if (!plan.data) return;
    const files = [], P = window.Pack, enc = new TextEncoder(), withReel = $('planReel').checked;
    try {
      await each(async (d, i, n) => {
        const pre = P.folder(d) + '/';
        files.push(...await C.packageFiles({ prefix: pre, reel: withReel, onStatus: m => prog(`Giorno ${d.day}/${n}: ${m}`) }));
        prog(`Giorno ${d.day}/${n} pronto.`);
      });
      files.unshift({ name: 'PIANO.txt', data: enc.encode(P.planFile(plan.data.plan, window.Schedule && window.Schedule.describe)) });
      C.dl(C.zip(files), `petrosa-piano-${plan.data.plan.length}-giorni.zip`);
      C.toast('Piano scaricato: una cartella per giorno con carosello, Reel, caption e istruzioni. Apri PIANO.txt per il calendario.');
    } catch (e) { C.toast(e.message, true); }
  }
  async function scheduleAll() {
    if (!plan.data) return;
    let chosen = planChosenChannels(); const mode = $('planMode').value;
    if (!chosen.length && st.cfg && st.cfg.postfast) { await loadPlanChannels(); chosen = planChosenChannels(); }
    if (!chosen.length) return C.toast('Nessun account PostFast selezionato: scegli gli account qui sopra, nel piano.', true);
    if (mode === 'now') return C.toast('Per il piano scegli "Programma" o "Bozze".', true);
    const withReel = $('planReel').checked, n = plan.data.plan.length;
    if (!confirm(`Inviare a PostFast ${n} caroselli${withReel ? ' e ' + n + ' Reel' : ''} su ${chosen.map(c => c.name).join(', ')} (${mode === 'draft' ? 'come bozze' : 'programmati agli orari consigliati'})?\nCi vorranno alcuni minuti: tieni aperta questa scheda.`)) return;
    const res = [];
    try {
      await each(async (d, i, N) => {
        try {
          prog(`Giorno ${d.day}/${N}: carico il carosello...`);
          await C.sendCarousel(chosen, mode, d.when.carousel, m => prog(`Giorno ${d.day}/${N}: ${m}`));
          if (withReel) { prog(`Giorno ${d.day}/${N}: creo il Reel...`); const r = await window.Reel.ensure(); await window.Reel.sendReel(r.blob, chosen, mode, d.when.reel, m => prog(`Giorno ${d.day}/${N}: Reel, ${m}`)); }
          res.push([d.day, true]);
        } catch (e) { res.push([d.day, false, e.message]); }
      });
    } catch (e) { return C.toast(e.message, true); }
    const bad = res.filter(r => !r[1]);
    C.toast(bad.length ? `Piano inviato con ${bad.length} errori (giorni ${bad.map(b => b[0]).join(', ')}): ${bad[0][2]}` : `PostFast: ${n} giorni ${mode === 'draft' ? 'salvati come bozza' : 'programmati'}.`, !!bad.length);
  }
  $('planZip').onclick = exportAll; $('planSend').onclick = scheduleAll;
  if ($('planChBtn')) $('planChBtn').onclick = loadPlanChannels;
  const busy = on => C.busy($('btnPlan'), on, 'Preparo il piano...');
  $('btnPlan').onclick = generate; $('planAgain').onclick = generate;
  window.Plan = { generate, openDay, exportAll, scheduleAll, redraw: draw, get: () => plan.data, dayCreateReel, dayScheduleCarousel, dayScheduleReel };
})();
