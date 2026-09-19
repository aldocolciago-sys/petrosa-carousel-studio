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
const focuses = [{ type: 'auto' }, { type: 'song', item: 6 }, { type: 'member', item: 'aldo' }, { type: 'review', item: 'outlaws' }, { type: 'doomcharts' }, { type: 'album' }, { type: 'custom', text: 'Live in Milan\nFriday night, volume up.' }];
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
    const pubs = cits.filter(s => s.tipo === 'Review').map(s => s.titolo); if (new Set(pubs).size !== pubs.length) bad(id + ' testata ripetuta');
    for (const h of p.menzioni.concat(p.slides.flatMap(s => s.tag || []))) if (!ok.has(h.toLowerCase())) bad(id + ' menzione non confermata ' + h);
    for (const h of (p.caption.match(/@[\w.]*\w/g) || [])) if (!ok.has(h.slice(1).toLowerCase())) bad(id + ' @ non confermato in caption ' + h);
    if (!p.menzioni.length) bad(id + ' nessuna menzione');
    if (!/stonerrock|stonerdoom/.test(p.hashtags.join(' '))) bad(id + ' hashtag core');
    if (f.type === 'song' && !p.slides.some(s => (s.citazione && s.fonte === band.songs.find(x => x.n === 6).title) || s.titolo.includes('Viper'))) bad(id + ' focus song assente');
    if (f.type === 'doomcharts' && !p.slides.some(s => s.stat === '#14')) bad(id + ' doomcharts assente');
    if (/\{\w+\}/.test(JSON.stringify(p))) bad(id + ' placeholder residuo');
  }
}
// swap
const r = L.propose({ mood: 'doom', count: 8, seed: 5 });
for (let i = 1; i < 8; i++) {
  const s = r.proposals[0].slides; const before = s[i].titolo + s[i].corpo;
  let out; try { out = L.swap({ mood: 'doom', slides: s, index: i, seed: 9 + i }); } catch (e) { bad('swap ' + i + ' ' + e.message); continue; }
  if (out.slides.length !== 8) bad('swap len');
}
console.log(`${n} caroselli assemblati, ${fail} errori`);
process.exit(fail ? 1 : 0);

