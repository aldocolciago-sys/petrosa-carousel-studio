// Petrosa Carousel Studio - piano settimanale: 5 o 7 caroselli con Reel abbinato
(() => {
  const C = window.StudioCtx, $ = C.$, st = C.st;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const DAYS = ['domenica', 'lunedi\'', 'martedi\'', 'mercoledi\'', 'giovedi\'', 'venerdi\'', 'sabato'];
  const plan = { data: null, seed: null };
  const songTitle = n => ((st.data.songs || []).find(x => x.n === n) || {}).title || '';
  const moodLabel = id => ((st.lib && st.lib.moods || []).find(m => m.id === id) || {}).label || id;

  async function draw() {
    const P = plan.data; if (!P) return;
    for (const id of ['planSend', 'planMode']) $(id).style.display = st.cfg && st.cfg.postfast ? '' : 'none';
    $('planCard').style.display = 'block'; $('empty').style.display = 'none';
    $('planHint').textContent = `${P.plan.length} caroselli, ciascuno con il suo Reel. Apri un giorno per rivederlo e modificarlo nell'editor.`;
    await Promise.all(P.plan.map(d => window.Renderer.need([d.slides[0]])));
    $('planList').innerHTML = P.plan.map((d, i) => `<div class="pday" data-i="${i}">
      <canvas width="270" height="338"></canvas>
      <div><div class="pd-h">Giorno ${d.day}<span class="pd-when" data-when="${i}">${esc(d.whenText || '')}</span></div>
       <div class="pd-t"><b>${esc(d.label)}</b> &middot; ${esc(moodLabel(d.mood))} &middot; ${d.slides.length} slide</div>
       <div class="pd-c">&laquo;${esc(String(d.slides[0].titolo).replace(/^[«“"]+|[»”"]+$/g, ''))}&raquo; &middot; ${esc(d.caption.split('\n')[0])}</div>
       <div class="pd-c">Reel: ${String(d.reel.song).padStart(2, '0')} - ${esc(songTitle(d.reel.song))}</div></div>
      <div class="row"><button class="btn" data-open="${i}">Apri nell'editor</button></div></div>`).join('');
    P.plan.forEach((d, i) => {
      const c = $('planList').querySelector(`.pday[data-i="${i}"] canvas`);
      window.Renderer.render(c, d.slides[0], 0, d.slides.length, st.data.handle, st.theme || undefined);
    });
    $('planList').querySelectorAll('[data-open]').forEach(b => b.onclick = () => openDay(+b.dataset.open));
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
      const out = await C.api('/api/plan', { days: +$('planDays').value, avoid: C.recent() });
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
    let chosen = C.chosenChannels(); const mode = $('planMode').value;
    if (!chosen.length && st.cfg && st.cfg.postfast) { $('btnCh').click(); for (let k = 0; k < 80 && !st.channels.length; k++) await new Promise(r => setTimeout(r, 250)); chosen = C.chosenChannels(); }
    if (!chosen.length) return C.toast('Nessun account PostFast selezionato: apri un giorno e nella sezione 6 scegli su quali account pubblicare.', true);
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
  const busy = on => C.busy($('btnPlan'), on, 'Preparo il piano...');
  $('btnPlan').onclick = generate; $('planAgain').onclick = generate;
  window.Plan = { generate, openDay, exportAll, scheduleAll, redraw: draw, get: () => plan.data };
})();
