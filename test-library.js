'use strict';
// Verifica la libreria: citazioni fedeli, ricette assemblabili, menzioni solo confermate.
const L = require('./library');
const { lib, band, tags } = L.load();
let fail = 0; const bad = m => { fail++; console.log('FAIL', m); };
const norm = L.norm;
const parts = c => c.split(/\s*(?:\.{3}|…)\s*|\s\/\s/).map(norm).filter(p => p.length > 3);
for (const q of lib.quotes) {
  const src = q.kind === 'song' ? (band.songs.find(s => s.n === q.song) || {}).lyrics : (band.reviews.find(r => r.id === q.review) || {}).quote;
  if (!src) { bad('fonte mancante ' + q.id); continue; }
  const s = norm(src);
  for (const p of parts(q.cit)) if (!s.includes(p)) bad(`citazione non trovata ${q.id}: "${p}"`);
}
const ok = new Set(tags.similarBands.concat(tags.community).filter(b => b.handle && b.confirmed).map(b => b.handle.replace(/^@/, '').toLowerCase()));
const focuses = [{ type: 'auto' }, ...band.songs.map(x => ({ type: 'song', item: x.n })), { type: 'member', item: 'aldo' }, { type: 'band' }, { type: 'review', item: 'outlaws' }, { type: 'doomcharts' }, { type: 'album' }, { type: 'live' }, { type: 'custom', text: 'Live in Milan\nFriday night, volume up.' }, ...lib.journeys.map(j => ({ type: 'journey', item: j.id }))];
// ---- coerenza: foto <-> testo, arco, lingua, caption ----
const PH = Object.fromEntries(L.photos().map(x => [x.id, x]));
const PORTRAIT = Object.fromEntries(band.members.map(m => [m.photo, m.id]));
const first = m => m.name.split(' ')[0].toLowerCase();
const named = txt => band.members.filter(m => new RegExp('\\b' + first(m) + '\\b', 'i').test(txt)).map(m => m.id);
const IT = /\b(che|della|delle|degli|sono|anche|questo|questa|nel|nella|dei|gli|piu|perche|come mai|il tuo|una volta)\b/i;
const stats = { liveSlides: 0, moodMatch: 0 };
function coherence(id, m, f, p) {
  const seenImg = new Set();
  p.slides.forEach((s, i) => {
    const txt = (s.titolo || '') + ' ' + (s.corpo || '');
    const mem = PH[s.immagine] ? PH[s.immagine].members : PORTRAIT[s.immagine] ? [PORTRAIT[s.immagine]] : null;
    if (mem && PH[s.immagine] && PH[s.immagine].kind !== 'group' && PH[s.immagine].kind !== 'brand' || PORTRAIT[s.immagine]) {
      const extra = named(txt).filter(x => !mem.includes(x));
      if (extra.length) bad(id + ` slide ${i + 1}: foto di ${mem.join('+')} ma il testo nomina ${extra.join(',')}`);
      if (PH[s.immagine] && PH[s.immagine].kind === 'duo' && s.layout === 'photo' && named(s.titolo).length !== mem.length) bad(id + ` slide ${i + 1}: foto di coppia senza i due nomi nel titolo`);
    }
    if (s.tipo === 'Live' && s.layout === 'photo' && !PH[s.immagine]) bad(id + ` slide ${i + 1}: slide Live senza foto live`);
    if (PH[s.immagine] || PORTRAIT[s.immagine]) { if (seenImg.has(s.immagine)) bad(id + ` foto ripetuta ${s.immagine}`); seenImg.add(s.immagine); }
    if (PH[s.immagine] && s.tipo === 'Live' && s.layout === 'photo') { stats.liveSlides++; if (PH[s.immagine].moods.includes(m.id)) stats.moodMatch++; if (PH[s.immagine].q < 2) bad(id + ' foto di bassa qualita in automatico ' + s.immagine); }
    if (s.tipo !== 'Review' && s.tipo !== 'Song' && IT.test(txt)) bad(id + ` slide ${i + 1}: testo non inglese "${txt.slice(0, 50)}"`);
    if ((s.titolo || '').length > 90) bad(id + ` slide ${i + 1}: titolo troppo lungo (${s.titolo.length})`);
    if ((s.corpo || '').length > 300) bad(id + ` slide ${i + 1}: corpo troppo lungo (${s.corpo.length})`);
  });
  if (IT.test(p.caption)) bad(id + ' caption non inglese');
  if (f.type === 'member') {
    const mb = band.members.find(x => x.id === f.item);
    const imgs = p.slides.map(s => s.immagine).filter(x => PH[x] || PORTRAIT[x]);
    for (const x of imgs) { const who = PH[x] ? PH[x].members : [PORTRAIT[x]]; if (who.length !== 1 || who[0] !== f.item) bad(id + ` foto di altri membri (${x}) nel carosello di ${f.item}`); }
    if (!named(p.slides[0].titolo + ' ' + p.slides[0].corpo).includes(f.item)) bad(id + ' copertina senza il nome del membro');
    if (!norm(p.caption).includes(norm(first(mb)))) bad(id + ' caption senza il nome del membro');
  }
  if (f.type === 'band') {
    const all = named(p.slides.map(s => s.titolo + ' ' + s.corpo).join(' '));
    if (new Set(all).size !== 4) bad(id + ' intera band: non tutti i membri nelle slide');
    if (band.members.some(x => !norm(p.caption).includes(norm(first(x))))) bad(id + ' intera band: caption senza tutti i membri');
    for (const x of band.members) if (p.slides.filter(s => s.immagine === x.photo).length > 1) bad(id + ' ritratto ripetuto ' + x.id);
  }
  if (f.type === 'review') { const pub = (band.reviews.find(r => r.id === f.item) || {}).publication; if (pub && !norm(p.caption).includes(norm(pub))) bad(id + ' caption senza la testata scelta'); }
  if (f.type === 'doomcharts' && !/doom charts|#14/i.test(p.caption)) bad(id + ' caption senza Doom Charts');
  if (f.type === 'song') { const t = band.songs.find(x => x.n === f.item).title; if (!norm(p.caption).includes(norm(t))) bad(id + ' caption senza il titolo del brano'); }
  const last = p.slides[p.slides.length - 1];
  if (!/spotify/i.test(last.titolo + ' ' + last.corpo + ' ' + (last.servizio || ''))) bad(id + ' ultima slide senza Spotify');
}
let n = 0;
for (const m of lib.moods) for (const count of [7, 8, 9, 10]) for (const f of focuses) for (let seed = 1; seed <= 6; seed++) {
  let r; try { r = L.propose({ mood: m.id, focus: f, count, seed }); } catch (e) { bad(`${m.id}/${count}/${f.type}: ${e.message}`); continue; }
  for (const p of r.proposals) {
    n++;
    const id = `${m.id}/${count}/${f.type}/${seed}/${p.recipeId}`;
    if (p.slides.length !== count) bad(id + ' n slide ' + p.slides.length);
    if (p.slides[0].tipo !== 'Cover') bad(id + ' hook');
    if (p.slides[p.slides.length - 1].layout !== 'cta') bad(id + ' cta');
    const titles = p.slides.map(s => s.titolo + '|' + (s.citazione || ''));
    if (new Set(titles).size !== titles.length) bad(id + ' duplicati');
    const cits = p.slides.filter(s => s.citazione);
    if (cits.some(s => s.verified !== true)) bad(id + ' citazione non verificata');
    const fpub = f.type === 'review' ? (band.reviews.find(r => r.id === f.item) || {}).publication : null;   // con una recensione scelta, la sua testata puo' comparire due volte
    const pubs = cits.filter(s => s.tipo === 'Review' && s.titolo !== fpub).map(s => s.titolo); if (new Set(pubs).size !== pubs.length) bad(id + ' testata ripetuta');
    if (fpub && cits.filter(s => s.titolo === fpub).length > 2) bad(id + ' testata scelta piu di 2 volte');
    for (const h of p.menzioni.concat(p.slides.flatMap(s => s.tag || []))) if (!ok.has(h.toLowerCase())) bad(id + ' menzione non confermata ' + h);
    for (const h of (p.caption.match(/@[\w.]*\w/g) || [])) if (!ok.has(h.slice(1).toLowerCase())) bad(id + ' @ non confermato in caption ' + h);
    if (!p.menzioni.length) bad(id + ' nessuna menzione');
    if (!/stonerrock|stonerdoom/.test(p.hashtags.join(' '))) bad(id + ' hashtag core');
    if (f.type === 'song') {
      const title = band.songs.find(x => x.n === f.item).title;
      if (!p.slides.some(s => s.citazione && s.fonte === title)) bad(id + ' nessun verso del brano scelto');
      for (const s of p.slides) if (s.tipo === 'Song' && s.fonte !== title) bad(id + ' verso di un altro brano: ' + s.fonte);
      // Il carosello resta dedicato al brano ma non e' un muro di solo testo: un verso citato letteralmente,
      // un paio (2, o 3 sulle ricette da 9-10) di pause fotografiche, il resto e' analisi in sequenza.
      const an = p.slides.filter(s => s.tipo === 'Analysis');
      const songQuotes = p.slides.filter(s => s.tipo === 'Song');
      const photoBreaks = p.slides.filter(s => s._ref && s._ref.slot === 'band');
      const photoTarget = count >= 9 ? 3 : 2;
      if (songQuotes.length !== 1) bad(id + ' versi letterali attesi 1, trovati ' + songQuotes.length);
      if (photoBreaks.length !== photoTarget) bad(id + ' pause fotografiche: ' + photoBreaks.length + ' attese ' + photoTarget);
      if (an.length !== count - 3 - photoTarget) bad(id + ' analisi: ' + an.length + ' attese ' + (count - 3 - photoTarget));
      const anTitles = an.map(s => s.titolo); if (new Set(anTitles).size !== anTitles.length) bad(id + ' parti di analisi ripetute');
      // niente ripetizioni: la stessa riga del testo non deve comparire sia nel verso citato sia in una slide di analisi (o in due
      // slide di analisi diverse) - le due meta' della STESSA citazione possono ovviamente condividere parole, non si confrontano fra loro
      const bySlide = [];
      p.slides.forEach((sl, i) => {
        const f = [];
        if (sl.tipo === 'Song' && sl.citazione) f.push(...sl.citazione.split(/\s*\/\s*/).map(norm).filter(x => x.length >= 6));
        if (sl.tipo === 'Analysis') for (const m of (sl.titolo + ' ' + sl.corpo).matchAll(/"([^"]+)"/g)) { const q = norm(m[1]); if (q.length >= 6) f.push(q); }
        if (f.length) bySlide.push({ i, f });
      });
      for (let x = 0; x < bySlide.length; x++) for (let y = x + 1; y < bySlide.length; y++) for (const a of bySlide[x].f) for (const b of bySlide[y].f) if (a.includes(b) || b.includes(a)) bad(id + ` stessa riga citata in slide ${bySlide[x].i + 1} e ${bySlide[y].i + 1}`);
      if (!p.caption.startsWith(lib.analyses.find(a => a.song === f.item).caption.split('\n')[0])) bad(id + ' caption senza analisi');
    } else if (p.slides.some(s => s.tipo === 'Analysis')) bad(id + ' analisi fuori focus');
    if (f.type === 'journey') {
      const j = lib.journeys.find(x => x.id === f.item);
      const jSlides = p.slides.filter(s => s._ref && s._ref.slot === 'journey');
      if (!j) bad(id + ' viaggio sconosciuto');
      else {
        if (!jSlides.length) bad(id + ' viaggio senza movimenti');
        const jsongs = new Set(j.songs);
        for (const s of jSlides) { const so = band.songs.find(x => x.title === s.fonte); if (so && !jsongs.has(so.n)) bad(id + ' viaggio: brano fuori tema ' + so.n); }
        const parts = jSlides.map(s => s._ref.part); if (new Set(parts).size !== parts.length) bad(id + ' viaggio: movimenti ripetuti');
      }
    } else if (p.slides.some(s => s._ref && s._ref.slot === 'journey')) bad(id + ' viaggio fuori focus');
    if (f.type === 'live') {
      const lv = p.slides.filter(s => s.tipo === 'Live');
      if (lv.length < 2) bad(id + ' poche slide live');
      if (!/30/.test(JSON.stringify(lv)) || !/1h30/.test(JSON.stringify(lv))) bad(id + ' durata set 30min-1h30 assente');
      if (!/live/i.test(p.slides[0].titolo + p.slides[0].corpo)) bad(id + ' hook non live');
      if (!/1h30/.test(p.caption)) bad(id + ' caption live senza durata');
      if (!p.hashtags.includes('livemusic')) bad(id + ' hashtag live');
    }
    if (f.type === 'doomcharts' && !p.slides.some(s => s.stat === '#14')) bad(id + ' doomcharts assente');
    if (/\{\w+\}/.test(JSON.stringify(p))) bad(id + ' placeholder residuo');
    coherence(id, m, f, p);
  }
}
// le foto live seguono il mood scelto (assegnazione morbida: almeno meta' delle foto deve essere del mood richiesto)
const rate = stats.liveSlides ? stats.moodMatch / stats.liveSlides : 1;
console.log(`foto live: ${stats.liveSlides} slide, ${(rate * 100).toFixed(0)}% del mood richiesto`);
if (rate < 0.6) bad('foto live poco coerenti col mood: ' + (rate * 100).toFixed(0) + '%');
// analisi: ogni frase tra virgolette deve essere letterale nel testo del brano (ogni parte e la caption)
const allLyrics = norm(band.songs.map(s => s.lyrics).join(' '));
for (const a of lib.analyses) {
  const own = norm((band.songs.find(x => x.n === a.song) || {}).lyrics || '');
  // il brano 8 (una sola riga di testo reale) cita anche altri brani dell'album: per lui il pool e' l'intero songbook
  const pool = a.song === 8 ? allLyrics : own;
  if (!Array.isArray(a.parts) || a.parts.length !== 8) bad(`analisi ${a.song}: servono 8 parti, trovate ${(a.parts || []).length}`);
  const seenTitles = new Set();
  for (const part of a.parts || []) {
    if ((part.titolo || '').length > 90) bad(`analisi ${a.song}: titolo troppo lungo`);
    if ((part.corpo || '').length > 300) bad(`analisi ${a.song}: corpo troppo lungo`);
    if (seenTitles.has(part.titolo)) bad(`analisi ${a.song}: titolo di parte duplicato "${part.titolo}"`);
    seenTitles.add(part.titolo);
    for (const [field, text] of [['titolo', part.titolo], ['corpo', part.corpo]]) {
      for (const m of (text || '').matchAll(/"([^"]+)"/g)) {
        const q = norm(m[1]); if (q.length < 4) continue;
        if (!pool.includes(q)) bad(`analisi ${a.song} parte "${part.titolo}" ${field}: citazione non letterale "${m[1]}"`);
      }
    }
  }
  for (const m of a.caption.matchAll(/"([^"]+)"/g)) {
    const q = norm(m[1]); if (q.length < 4) continue;
    if (!pool.includes(q)) bad(`analisi ${a.song} caption: citazione non letterale "${m[1]}"`);
  }
}
// viaggi nell'album: ogni citazione letterale e' verificata sul SOLO brano indicato dal movimento (non sull'intero
// songbook), ogni brano citato deve comparire nell'elenco songs[] del viaggio, nessun movimento duplicato
for (const j of lib.journeys || []) {
  if (!Array.isArray(j.movements) || !j.movements.length) bad(`viaggio ${j.id}: nessun movimento`);
  const seen = new Set();
  for (const mv of j.movements || []) {
    const so = band.songs.find(x => x.n === mv.song);
    if (!so) { bad(`viaggio ${j.id}: brano ${mv.song} inesistente`); continue; }
    if (!(j.songs || []).includes(mv.song)) bad(`viaggio ${j.id}: movimento del brano ${mv.song} non elencato in songs[]`);
    if ((mv.titolo || '').length > 90) bad(`viaggio ${j.id} brano ${mv.song}: titolo troppo lungo`);
    if ((mv.corpo || '').length > 300) bad(`viaggio ${j.id} brano ${mv.song}: corpo troppo lungo`);
    if (mv.cit) { const own = norm(so.lyrics || ''); for (const p of parts(mv.cit)) if (!own.includes(p)) bad(`viaggio ${j.id} brano ${mv.song}: citazione non letterale "${p}"`); }
    const key = (mv.titolo || '') + '|' + (mv.cit || '');
    if (seen.has(key)) bad(`viaggio ${j.id}: movimento duplicato`);
    seen.add(key);
  }
  for (const m of j.caption.matchAll(/"([^"]+)"/g)) {
    const q = norm(m[1]); if (q.length < 4) continue;
    const pool = norm((j.songs || []).map(n => (band.songs.find(x => x.n === n) || {}).lyrics || '').join(' '));
    if (!pool.includes(q)) bad(`viaggio ${j.id} caption: citazione non letterale "${m[1]}"`);
  }
}
// swap
const r = L.propose({ mood: 'doom', count: 8, seed: 5 });
for (let i = 1; i < 8; i++) {
  const s = r.proposals[0].slides; const before = s[i].titolo + s[i].corpo;
  let out; try { out = L.swap({ mood: 'doom', slides: s, index: i, seed: 9 + i }); } catch (e) { bad('swap ' + i + ' ' + e.message); continue; }
  if (out.slides.length !== 8) bad('swap len');
}
// swap sulle slide di analisi (focus canzone, ricetta a 10 slide: 7 parti diverse, nessuna disponibile per un doppione)
const songFocus = { type: 'song', item: 3 };
const rs = L.propose({ mood: 'doom', focus: songFocus, count: 10, seed: 7 });
let s10 = rs.proposals[0].slides;
for (let i = 0; i < s10.length; i++) {
  if (s10[i].tipo !== 'Analysis') continue;
  let out; try { out = L.swap({ mood: 'doom', focus: songFocus, slides: s10, index: i, seed: 20 + i }); } catch (e) { bad('swap analisi ' + i + ' ' + e.message); continue; }
  if (out.slides.length !== 10) bad('swap analisi len');
  s10 = out.slides;
}
const anTitlesAfterSwap = s10.filter(s => s.tipo === 'Analysis').map(s => s.titolo);
if (new Set(anTitlesAfterSwap).size !== anTitlesAfterSwap.length) bad('swap analisi: parti ripetute dopo lo swap');
// swap sui movimenti di un viaggio (stessa logica: nessun movimento ripetuto dopo una serie di swap)
if (lib.journeys && lib.journeys.length) {
  const journeyFocus = { type: 'journey', item: lib.journeys[0].id };
  const rj = L.propose({ mood: 'doom', focus: journeyFocus, count: 10, seed: 11 });
  let sj = rj.proposals[0].slides;
  for (let i = 0; i < sj.length; i++) {
    if (!sj[i]._ref || sj[i]._ref.slot !== 'journey') continue;
    let out; try { out = L.swap({ mood: 'doom', focus: journeyFocus, slides: sj, index: i, seed: 30 + i }); } catch (e) { bad('swap viaggio ' + i + ' ' + e.message); continue; }
    if (out.slides.length !== 10) bad('swap viaggio len');
    sj = out.slides;
  }
  const partsAfterSwap = sj.filter(s => s._ref && s._ref.slot === 'journey').map(s => s._ref.part);
  if (new Set(partsAfterSwap).size !== partsAfterSwap.length) bad('swap viaggio: movimenti ripetuti dopo lo swap');
}
console.log(`${n} caroselli assemblati, ${fail} errori`);
process.exit(fail ? 1 : 0);

