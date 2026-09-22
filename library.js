'use strict';
// Motore "libreria": assembla caroselli da frasi e post precaricati (data/library.json).
// Nessuna API key, nessuna chiamata di rete.
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, 'data');
const RC = require('./public/reelcut.js');   // testi accorciati per il Reel

const readJSON = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return fb; } };
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function mulberry(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function load() {
  const lib = readJSON('library.json', {});
  const band = readJSON('band.json', {});
  const extra = readJSON('extra-reviews.json', []);
  band.reviews = [...(band.reviews || []), ...extra];
  const txt = fs.readFileSync(path.join(DATA, 'songs.txt'), 'utf8').replace(/\r/g, '');
  band.songs = txt.split(/^## /m).filter(Boolean).map(b => {
    const [head, ...lines] = b.split('\n');
    const [num, title] = head.split('|').map(s => s.trim());
    return { n: parseInt(num, 10), title, lyrics: lines.join('\n').trim() };
  });
  const tags = readJSON('tags.json', { similarBands: [], community: [], hashtags: { core: [], identity: [], local: [] } });
  const photos = readJSON('photos.json', []);
  addPhotos(lib, band, photos);
  return { lib, band, tags, photos };
}

// ---------- Foto live: dal catalogo data/photos.json nascono le slide "Live" (assegnazione automatica per membro e mood) ----------
const ROLE_WORD = { antonio: 'guitar', giorgio: 'drums', aldo: 'vocals', andrea: 'bass' };
const BODY = {
  doom: ['Slow. Heavy. Unhurried.', 'Long notes. No rush.', 'Doom needs room to breathe.'],
  riff: ['Riffs first. Everything else follows.', 'Amps up. Ears open.', 'Big riff. Bigger room.'],
  psych: ['Smoke, light and volume.', 'Colour bleeds into the sound.', 'Lost in the haze.'],
  intro: ['Meet Petrosa.', 'Eyes on the music.', 'This is what heavy looks like.'],
  road: ['Daylight. Open air. Full volume.', 'Desert rock, out in the open.', 'The road turns into a stage.'],
  proof: ['Caught mid-set.', 'Crowd in the frame. Band in the moment.', 'Live. Loud. Real.'],
  fans: ['The moment the room connects.', 'Good nights end with a smile.', 'Sharing the stage. Sharing the noise.']
};
const DUO = ['{a} and {b}, locked in.', '{a} and {b}. Same stage, same weight.', '{a} meets {b} in the noise.'];
const hash = str => { let h = 7; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
function photoItem(p, band) {
  const mem = id => band.members.find(m => m.id === id) || { id, name: id, role: '' };
  const h = hash(p.id), tag = p.id.replace(/^live_/, '');
  const ms = (p.members || []).map(mem);
  const mood0 = (p.moods || ['intro'])[0];
  const pool = BODY[mood0] || BODY.intro;
  let titolo, corpo;
  if (p.kind === 'solo') {
    const m = ms[0], role = m.role.replace(/\s*\(.*\)/, '');
    titolo = [`${m.name}. ${role}.`, `${m.name.split(' ')[0]}, live.`, `${m.name.split(' ')[0]}. ${role}.`][h % 3];
    corpo = pool[(h >> 3) % pool.length];
  } else if (p.kind === 'duo') {
    titolo = ms.map(m => m.name.split(' ')[0]).join(' + ') + '.';
    corpo = DUO[h % DUO.length].replace('{a}', cap(ROLE_WORD[ms[0].id] || 'music')).replace('{b}', ROLE_WORD[ms[1].id] || 'music');
  } else if (p.kind === 'group') {
    titolo = 'Petrosa. All four.'; corpo = ['Four players. One wall of sound.', 'Antonio, Giorgio, Aldo and Andrea. Live.'][h % 2];
  } else { titolo = 'Petrosa.'; corpo = 'Stoner and doom, live.'; }
  if (p.titolo) titolo = p.titolo;
  if (p.corpo) corpo = p.corpo;
  return { id: 'lb-' + tag, topic: 'live-band', moods: p.moods && p.moods.length ? p.moods : ['all'], layout: 'photo', tipo: 'Live', titolo, corpo, immagine: p.id, members: p.members || [], kind: p.kind, q: p.q };
}
const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
function addPhotos(lib, band, photos) {
  const good = photos.filter(p => (p.q || 0) >= 2);                     // le foto di qualita' 1 restano scegliabili a mano, mai in automatico
  lib.info = (lib.info || []).filter(i => i.topic !== 'live-band').concat(good.map(p => photoItem(p, band)));
  // foto di gruppo / brand: diventano anche testi "band" per la slide di tutta la band
  lib.band = (lib.band || []).filter(b => !b._photo).concat(good.filter(p => p.kind === 'group' || p.kind === 'brand').map(p => {
    const it = photoItem(p, band);
    return { id: 'bp-' + p.id.replace(/^live_/, ''), member: 'all', moods: it.moods, layout: 'photo', titolo: it.titolo, corpo: it.corpo, immagine: p.id, _photo: true };
  }));
}

const cleanH = h => String(h || '').replace(/^@/, '').trim();
const confirmed = list => list.filter(b => b.handle && b.confirmed).map(b => cleanH(b.handle));

// punteggio di un elemento per un mood
function score(item, mood) {
  const m = item.moods || ['all'];
  if (m.includes(mood)) return 3;
  if (m.includes('all')) return 1.5;
  return 0.4;
}
let AVOID = new Set();   // ids usati di recente nei caroselli precedenti: evitati se c'e' alternativa (mai obbligatorio)
function pick(items, mood, rng, used = new Set()) {
  const pool = items.filter(i => !used.has(i.id));
  const fresh = pool.filter(i => !AVOID.has(i.id));
  const list = fresh.length ? fresh : pool.length ? pool : items;
  if (!list.length) return null;
  const w = list.map(i => score(i, mood));
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}
const one = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function fill(str, vars) { return String(str || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m); }

// ---------- Costruzione di una slide da uno step ----------
function ctxFrom(mood, focus, rng, D) {
  return { mood, focus: focus || { type: 'auto' }, rng, D, used: new Set(), songs: new Set(), reviews: new Set(), pubs: new Set(), topics: new Set(), titles: new Set(), imgs: new Set(), members: new Set(), firstQuote: true };
}

function songFocusN(ctx) { return ctx.focus.type === 'song' ? parseInt(ctx.focus.item, 10) : null; }
function memberFocus(ctx) { return ctx.focus.type === 'member' ? ctx.focus.item : null; }
function reviewFocus(ctx) { return ctx.focus.type === 'review' ? ctx.focus.item : null; }

// ---------- Copertine forti: foto live scelta per mood e impatto visivo (data/photos.json: campo "impact" 0-100) ----------
const COVER_PHOTO_RATE = 0.6;      // quota di copertine "generiche" con foto live invece dell'album
const COVER_MIN_IMPACT = 45;       // sotto questa soglia la foto non fa da copertina (le foto cupe restano per le slide Live)
function coverCandidates(ctx) {
  return (ctx.D.photos || []).filter(p => (p.q || 0) >= 2 && (p.impact || 0) >= COVER_MIN_IMPACT && (p.kind === 'solo' || p.kind === 'duo') && !ctx.imgs.has(p.id));
}
function coverPhoto(ctx) {
  const c = coverCandidates(ctx); if (!c.length) return null;
  const w = c.map(p => Math.pow(Math.max(1, p.impact - 30), 1.5) * ((p.moods || []).includes(ctx.mood) ? 3 : 1) * (AVOID.has('cp-' + p.id) ? 0.3 : 1));
  let r = ctx.rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < c.length; i++) { r -= w[i]; if (r <= 0) return c[i]; }
  return c[c.length - 1];
}

function buildHook(ctx, isFirstPick = true) {
  const { lib, band } = ctx.D;
  const f = ctx.focus.type;
  let kind = null;
  if (['song', 'member', 'review', 'live', 'band'].includes(f)) kind = f;
  let pool = lib.hooks.filter(h => kind ? h.kind === kind : !h.kind);
  if (!pool.length) pool = lib.hooks.filter(h => !h.kind);
  const moodPool = pool.filter(h => (h.moods || []).includes(ctx.mood) || (h.moods || []).includes('all'));
  const h = pick(moodPool.length ? moodPool : pool, ctx.mood, ctx.rng, ctx.used);
  const vars = {};
  let layout = 'hook', immagine = h.immagine || 'cover';
  if (h.kind === 'song') {
    const s = band.songs.find(x => x.n === songFocusN(ctx)) || band.songs[0];
    vars.song = s.title; vars.n = String(s.n).padStart(2, '0'); ctx.songs.add(s.n);
  } else if (h.kind === 'member') {
    const m = band.members.find(x => x.id === memberFocus(ctx)) || band.members[0];
    vars.member = m.name; vars.role = m.role.replace(/\s*\(.*\)/, ''); vars.rolel = vars.role.toLowerCase(); vars.photo = m.photo;
    immagine = 'cover'; ctx.members.add(m.id); // copertina album: la foto del membro compare solo nella slide Band
  } else if (h.kind === 'review') {
    const r = band.reviews.find(x => x.id === reviewFocus(ctx)) || band.reviews[0];
    vars.pub = r.publication; vars.verdict = r.verdict; ctx.reviews.add(r.id); ctx.pubs.add(r.publication);
  }
  ctx.used.add(h.id);
  let visual = 'Album cover over a blurred purple/black background, big amber title.';
  if (!h.kind && immagine === 'cover' && ctx.rng() < COVER_PHOTO_RATE) {
    const cp = coverPhoto(ctx);
    if (cp) { immagine = cp.id; ctx.coverPhoto = cp.id; visual = `Full-bleed live photo (${cp.vibe}) with a dark gradient at the bottom, big amber title.`; }
  }
  return {
    tipo: 'Cover', layout, immagine,
    titolo: fill(h.titolo, vars), corpo: fill(h.corpo, vars),
    visual,
    _libId: h.id
  };
}

// con una recensione al centro: le citazioni sono della stessa testata (la recensione scelta per prima), senza essere scartate dal filtro anti-ripetizione
function focusPubQuote(ctx) {
  const { lib, band } = ctx.D; const rf = reviewFocus(ctx); if (!rf) return null;
  const pubOf = q => (band.reviews.find(r => r.id === q.review) || {}).publication;
  const fpub = pubOf({ review: rf }); if (!fpub) return null;
  let p = lib.quotes.filter(q => q.kind === 'review' && pubOf(q) === fpub && !ctx.used.has(q.id));
  const exact = p.filter(q => q.review === rf);
  if (ctx.firstQuote && exact.length) p = exact;
  return p.length ? pick(p, ctx.mood, ctx.rng, ctx.used) : null;
}

function buildQuote(ctx, step) {
  const { lib, band } = ctx.D;
  let kind = step.kind || null;
  let pool = lib.quotes.filter(q => !ctx.used.has(q.id));
  if (kind) pool = pool.filter(q => q.kind === kind);
  // primo brano: dal focus
  const sf = songFocusN(ctx);
  if (ctx.firstQuote && sf && (!kind || kind === 'song')) {
    const p = pool.filter(q => q.kind === 'song' && q.song === sf);
    if (p.length) pool = p;
  } else if (ctx.firstQuote && reviewFocus(ctx) && (!kind || kind === 'review')) {
    const p = pool.filter(q => q.kind === 'review' && q.review === reviewFocus(ctx));
    if (p.length) pool = p;
  }
  // con una canzone al centro, i versi citati sono SOLO di quella canzone (altri passaggi dello stesso testo); se finiscono, si passa alle recensioni
  const only = q => !sf || q.kind === 'review' || q.song === sf;
  pool = pool.filter(q => only(q) && (q.kind === 'song' ? (sf ? true : !ctx.songs.has(q.song)) : !ctx.reviews.has(q.review) && !ctx.pubs.has((band.reviews.find(r => r.id === q.review) || {}).publication)));
  if (!pool.length) pool = lib.quotes.filter(q => only(q) && !ctx.used.has(q.id) && (!kind || q.kind === kind));
  if (!pool.length && sf && kind === 'song') pool = lib.quotes.filter(q => q.kind === 'review' && !ctx.used.has(q.id) && !ctx.reviews.has(q.review) && !ctx.pubs.has((band.reviews.find(r => r.id === q.review) || {}).publication));
  if (!pool.length) pool = lib.quotes.filter(q => only(q) && (!kind || q.kind === kind));
  const q = (step._pub && focusPubQuote(ctx)) || pick(pool, ctx.mood, ctx.rng, ctx.used);
  ctx.used.add(q.id); ctx.firstQuote = false;
  if (q.kind === 'song') {
    const s = band.songs.find(x => x.n === q.song);
    ctx.songs.add(s.n);
    return { tipo: 'Song', layout: 'quote', immagine: 'none', titolo: s.title, corpo: (lib.songNotes || {})[s.n] || `From the album Roadburn Chronicles - track ${String(s.n).padStart(2, '0')}.`, citazione: q.cit, fonte: s.title, visual: 'Black background with orange and purple glow. Lyric in large type, song title highlighted.', _libId: q.id };
  }
  const r = band.reviews.find(x => x.id === q.review);
  const again = ctx.pubs.has(r.publication) && ctx.reviews.size > 0 && ctx.quotedPubs && ctx.quotedPubs.has(r.publication);
  (ctx.quotedPubs = ctx.quotedPubs || new Set()).add(r.publication);
  ctx.reviews.add(r.id); ctx.pubs.add(r.publication);
  return { tipo: 'Review', layout: 'quote', immagine: 'none', titolo: r.publication, corpo: again ? 'Same review, another line.' : r.verdict, citazione: q.cit, fonte: `${r.author}, ${r.publication}`, visual: 'Dark background with purple glow. Large quote, publication and author highlighted.', _libId: q.id };
}

function buildAnalysis(ctx) {
  const { lib, band } = ctx.D;
  const n = songFocusN(ctx);
  const a = (lib.analyses || []).find(x => x.song === n);
  if (!a) throw new Error('Nessuna analisi disponibile per questo brano.');
  const s = band.songs.find(x => x.n === n);
  return { tipo: 'Analysis', layout: 'text', immagine: 'none', titolo: a.titolo, corpo: a.corpo, fonte: s.title, visual: 'Dark generative background, big headline, short reading of the lyrics on deep sociality.', _libId: a.id, _analysis: a.id };
}

function resolveTags(item, tags) {
  const out = [];
  if (item.tagGroup) out.push(...confirmed(tags.similarBands.filter(b => b.tier === item.tagGroup)));
  if (item.tagNames) for (const n of item.tagNames) out.push(...confirmed(tags.similarBands.concat(tags.community).filter(b => norm(b.name) === norm(n))));
  return [...new Set(out)];
}

function buildInfo(ctx, step) {
  const { lib, tags } = ctx.D;
  let topics = (step.topics || []).filter(t => !ctx.topics.has(t));
  if (step._force) topics = [step._force];
  if (!topics.length) topics = step.topics || [];
  let pool = lib.info.filter(i => topics.includes(i.topic) && !ctx.used.has(i.id));
  if (step._ids) pool = lib.info.filter(i => step._ids.includes(i.id) && !ctx.used.has(i.id));
  if (!pool.length) pool = lib.info.filter(i => topics.includes(i.topic));
  // scegli un topic a caso fra quelli ammessi, poi l'elemento migliore per il mood
  const newI = pool.filter(i => !ctx.imgs.has(i.immagine));   // la stessa foto non compare due volte (es. copertina live e slide Live)
  if (newI.length) pool = newI;
  const newT = pool.filter(i => !ctx.titles.has(i.titolo));   // mai due slide con lo stesso titolo (es. due foto dello stesso membro)
  if (newT.length) pool = newT;
  const avail = [...new Set(pool.map(i => i.topic))];
  const topic = one(avail, ctx.rng);
  let cand = pool.filter(i => i.topic === topic);
  if (topic === 'live-band') { const mm = cand.filter(i => (i.moods || []).includes(ctx.mood)); if (mm.length) cand = mm; }   // foto live: prima quelle del mood scelto
  const it = pick(cand, ctx.mood, ctx.rng, ctx.used);
  ctx.used.add(it.id); ctx.topics.add(it.topic); ctx.titles.add(it.titolo);
  const s = { tipo: it.tipo || 'Album', layout: it.layout || 'text', immagine: it.immagine || 'none', titolo: it.titolo, corpo: it.corpo, visual: '', _libId: it.id };
  if (it.stat) s.stat = it.stat;
  const tg = resolveTags(it, tags);
  if (tg.length) s.tag = tg;
  s.visual = s.layout === 'stat' ? 'Giant amber number over blurred cover, supporting text below.'
    : s.immagine === 'none' ? 'Dark background with purple/orange glow, big title and short text.'
    : 'Full-bleed image with dark veil, title and text below.';
  return s;
}

function buildBand(ctx, step) {
  const { lib, band } = ctx.D;
  if (step.who === 'all') {
    const pool = lib.band.filter(b => b.member === 'all');
    const b = pick(pool, ctx.mood, ctx.rng, ctx.used);
    ctx.used.add(b.id);
    return { tipo: 'Band', layout: b.layout || 'photo', immagine: b.immagine || 'logo', titolo: b.titolo || 'Petrosa', corpo: b.corpo, visual: 'Petrosa logo on dark background with amber glow. If you have a band photo, use it full-bleed.', _libId: b.id };
  }
  const forced = step._member;
  let mid = forced;
  if (!mid) {
    const mf = memberFocus(ctx);
    const free = band.members.map(m => m.id).filter(id => !ctx.members.has(id));
    mid = mf ? mf : one(free.length ? free : band.members.map(m => m.id), ctx.rng);
  }
  const m = band.members.find(x => x.id === mid);
  ctx.members.add(mid);
  const pool = lib.band.filter(b => b.member === mid);
  const b = pick(pool, ctx.mood, ctx.rng, ctx.used);
  ctx.used.add(b.id);
  return { tipo: 'Band', layout: 'photo', immagine: m.photo, titolo: step._role ? `${m.name}. ${m.role.replace(/\s*\(.*\)/, '')}.` : (b.titolo || m.name), corpo: b.corpo, visual: `Full-height photo of ${m.name} with dark gradient from the bottom.`, _libId: b.id, _member: mid };
}

function buildCta(ctx) {
  const { lib } = ctx.D;
  const cm = lib.cta.filter(c => (c.moods || []).includes(ctx.mood));   // la CTA e' sempre del mood scelto
  const c = pick(cm.length ? cm : lib.cta, ctx.mood, ctx.rng, ctx.used);
  ctx.used.add(c.id);
  return { tipo: 'CTA', layout: 'cta', immagine: 'cover', titolo: c.titolo, corpo: c.corpo, visual: 'Album cover with dark veil and a big green Spotify button.', _libId: c.id };
}

function buildSlide(ctx, step) {
  let s;
  switch (step.slot) {
    case 'hook': s = buildHook(ctx); break;
    case 'quote': s = buildQuote(ctx, step); break;
    case 'info': s = buildInfo(ctx, step); break;
    case 'band': s = buildBand(ctx, step); break;
    case 'cta': s = buildCta(ctx); break;
    case 'analysis': s = buildAnalysis(ctx); break;
    case 'custom': s = { tipo: 'Content', layout: 'text', immagine: 'none', titolo: step.titolo || 'Petrosa.', corpo: step.corpo || '', visual: 'Dark background with purple/orange glow, large text.', _libId: 'custom' }; break;
    default: throw new Error('slot sconosciuto: ' + step.slot);
  }
  if (s.immagine && !['none', 'cover', 'logo'].includes(s.immagine)) ctx.imgs.add(s.immagine);
  s._ref = { slot: step.slot, kind: step.kind, topics: step.topics, who: step.who, libId: s._libId, member: s._member };
  delete s._libId; delete s._member; delete s._analysis;
  return s;
}

function finalize(slides, D) {
  const handle = D.band.handle || '@petrosa_band';
  const n = slides.length;
  slides.forEach((s, i) => { s.servizio = `${handle} · ${i + 1}/${n}${i < n - 1 ? ' · Swipe →' : ''}`; });
  // verifica citazioni
  const pool = norm(D.band.songs.map(s => s.lyrics).join(' ') + ' ' + D.band.reviews.map(r => r.quote).join(' '));
  for (const s of slides) {
    if (!s.citazione) { s.verified = null; continue; }
    const parts = s.citazione.split(/\s*(?:\.{3}|…)\s*|\s\/\s/).map(norm).filter(p => p.length > 3);
    s.verified = parts.length > 0 && parts.every(p => pool.includes(p));
  }
  return slides;
}

// ---------- Caption & hashtag ----------
// Paragrafo di contesto: la caption nomina cio' che si vede nelle slide (brano, recensione e testata, membro, Doom Charts)
const ROLE_VERB = { guitar: 'plays guitar', drums: 'plays drums', vocals: 'sings', bass: 'plays bass' };
function contextParagraph(slides, D, focusType) {
  const { lib, band } = D;
  const found = {};
  for (const s of slides) {
    if (s.tipo === 'Song' && s.fonte && !found.song) {
      const so = band.songs.find(x => x.title === s.fonte);
      if (so) found.song = `"${so.title}": ${(lib.songNotes || {})[so.n] || 'Track ' + String(so.n).padStart(2, '0') + '.'}`;
    }
    if (s.tipo === 'Review' && s.citazione && s.fonte && !found.review) {
      const [author, ...pub] = String(s.fonte).split(',');
      let q = String(s.citazione).split(/\s\/\s|\s*(?:\.{3}|…)\s*/)[0].trim();
      if (q.length > 130) q = q.slice(0, 130).replace(/\s+\S*$/, '') + '...';
      found.review = pub.length ? `${author.trim()} in ${pub.join(',').trim()}: "${q}"` : `${s.fonte}: "${q}"`;
    }
    if (s.stat === '#14' && !found.charts) { const c = band.album.doomCharts; found.charts = `Roadburn Chronicles is #${c.position} in the Doom Charts, among ${c.pool} nominated albums.`; }
    const mem = band.members.find(m => m.photo === s.immagine);
    if (mem && !found.member) found.member = `${mem.name} ${ROLE_VERB[mem.role.replace(/\s*\(.*\)/, '').toLowerCase()] || 'is in the band'} in Petrosa.`;
  }
  const order = [focusType === 'song' ? 'song' : focusType === 'review' ? 'review' : focusType === 'member' ? 'member' : focusType === 'doomcharts' ? 'charts' : null, 'song', 'review', 'charts', 'member'].filter(Boolean);
  const solo = order[0] && found[order[0]];   // con un argomento scelto (brano, recensione, membro, Doom Charts) la caption parla solo di quello
  const kinds = solo ? [order[0]] : [...new Set(order)].filter(k => found[k]).slice(0, 2);
  return kinds.map(k => found[k]).join(' ');
}

function buildCaption(slides, mood, seed, D, exclude, focusType) {
  const { lib, tags } = D;
  const rng = mulberry(seed + 77);
  const primary = confirmed(tags.similarBands.filter(b => b.tier === 'primary'));
  const secondary = confirmed(tags.similarBands.filter(b => b.tier === 'secondary'));
  const fromSlides = [...new Set(slides.flatMap(s => s.tag || []))];
  const rot = arr => { const k = Math.floor(rng() * Math.max(1, arr.length)); return arr.slice(k).concat(arr.slice(0, k)); };
  const fans = rot(fromSlides.length ? fromSlides : primary).slice(0, 4);
  const liveN = slides.filter(s => s.tipo === 'Live').length;
  const bandN = new Set(slides.filter(s => s._ref && s._ref.slot === 'band' && s._ref.member).map(s => s._ref.member)).size;
  const wholeBand = bandN >= 4;   // carosello sull'intera band: caption che nomina tutti e quattro
  const pool = lib.captions.filter(c => (c.moods || []).includes(mood) && !!c.live === (liveN >= 2) && !!c.band === wholeBand);
  const fresh = pool.filter(c => c.id !== exclude && !AVOID.has(c.id));
  const fresh2 = fresh.length ? fresh : pool.filter(c => c.id !== exclude);
  const cap = one(fresh2.length ? fresh2 : (pool.length ? pool : lib.captions.filter(c => !!c.band === wholeBand)), rng);
  const an = slides.map(s => s._ref && s._ref.slot === 'analysis' ? (lib.analyses || []).find(a => a.id === s._ref.libId) : null).find(Boolean);
  let text = fill(an ? an.caption : cap.text, { fans: fans.map(h => '@' + h).join(' ') });
  const ctxP = contextParagraph(slides, D, focusType);
  if (ctxP && !norm(text).includes(norm(ctxP.split(':')[0]))) { const k = text.indexOf('\n\n'); text = k > 0 ? text.slice(0, k) + '\n\n' + ctxP + text.slice(k) : text + '\n\n' + ctxP; }
  const mentions = fans.filter(h => text.toLowerCase().includes('@' + h.toLowerCase()));
  if (!mentions.length) {
    const list = rot(primary).slice(0, 4);
    text += `\n\nFor fans of ${list.map(h => '@' + h).join(' ')}`;
    mentions.push(...list);
  }
  // etichetta e classifica: ringraziamento se presenti sulle slide
  const comm = new Set(confirmed(tags.community));
  const extra = fromSlides.filter(h => comm.has(h) && !text.toLowerCase().includes('@' + h.toLowerCase()));
  if (extra.length) { text += `\n\nThanks ${extra.map(h => '@' + h).join(' ')}`; mentions.push(...extra); }
  // hashtag
  // riga SEO: parole chiave che la gente cerca davvero (non sostituiscono gli hashtag; TikTok e Instagram leggono anche il testo)
  const seoPool = (lib.seoLines || []).filter(x => { const ms = x.moods || ['all']; return ms.includes(mood) || ms.includes('all'); });
  if (seoPool.length) { const seo = one(seoPool, rng); if (!norm(text).includes(norm(seo.text))) text += `\n\n${seo.text}`; }
  const H = t => String(t).replace(/[#\s]/g, '').toLowerCase();
  const seen = new Set(); const out = [];
  const add = arr => arr.forEach(x => { const h = H(x); if (h && !seen.has(h)) { seen.add(h); out.push(h); } });
  add(tags.hashtags.core || []);
  add(['petrosa', 'roadburnchronicles', 'stonerdoom']);
  add((lib.moodHashtags || {})[mood] || []);
  if (liveN >= 2) add((lib.moodHashtags || {}).live || []);
  add(rot(tags.similarBands.filter(b => b.tier === 'primary').map(b => b.hashtag)));
  add(rot(tags.similarBands.filter(b => b.tier === 'secondary').map(b => b.hashtag)).slice(0, 3));
  add(tags.hashtags.identity || []);
  add(tags.hashtags.reach || []);
  add(tags.hashtags.local || []);
  return { caption: text, menzioni: [...new Set(mentions)], hashtags: out.slice(0, 22), captionId: cap.id };
}

// ---------- API ----------
function getMoods() { const { lib } = load(); return lib.moods; }
function catalog() {
  const D = load();
  return { moods: D.lib.moods, recipes: D.lib.recipes.map(({ id, n, label, desc }) => ({ id, n, label, desc })), counts: { hooks: D.lib.hooks.length, quotes: D.lib.quotes.length, info: D.lib.info.length, band: D.lib.band.length, cta: D.lib.cta.length, captions: D.lib.captions.length, photos: D.photos.length } };
}

function applyFocusToSteps(steps, focus, ctx) {
  steps = steps.map(s => ({ ...s }));
  if (focus.type === 'member') {
    // il membro scelto compare in UNA sola slide Band; le altre slide Band diventano informazioni sul disco
    let seen = false;
    steps = steps.map(s => {
      if (s.slot !== 'band') return s;
      if (!seen) { seen = true; return { slot: 'band', who: 'member' }; }
      return { slot: 'info', topics: ['studio', 'gear', 'themes', 'singles', 'van', 'label'] };
    });
  }
  if (focus.type === 'live') {
    // sezione live: le slide Band diventano foto dal vivo, le prime slide informative parlano di concerti e di durata dei set (30' - 1h30)
    let li = 0;
    steps = steps.map(s => {
      if (s.slot === 'band') return { slot: 'info', topics: ['live-band'] };
      if (s.slot === 'info' && li < 3) { li++; return { slot: 'info', topics: ['live'] }; }
      return s;
    });
    const ii = steps.findIndex((s, k) => s.slot === 'info' && s.topics[0] === 'live');
    if (ii >= 0) steps[ii]._ids = ['i-live-flex', 'i-live-flex-b'];
  }
  if (focus.type === 'band') {
    // tutta la band: ogni membro ha la sua slide con foto (tutti e 4 citati), una recensione a meta', poi album e CTA
    const M = id => ({ slot: 'band', who: 'member', _member: id, _role: true });
    const [A, Al, An, G] = ['antonio', 'aldo', 'andrea', 'giorgio'].map(M);
    const hook = { slot: 'hook' }, all = { slot: 'band', who: 'all' }, Q = { slot: 'quote', kind: 'review' }, cta = { slot: 'cta' };
    const inf = t => ({ slot: 'info', topics: t });
    const seq = { 7: [hook, A, Al, An, G, Q, cta], 8: [hook, all, A, Al, Q, An, G, cta], 9: [hook, all, A, Al, Q, An, G, inf(['basics', 'charts']), cta], 10: [hook, all, A, Al, Q, An, G, inf(['studio']), inf(['charts', 'basics']), cta] };
    if (seq[steps.length]) steps = seq[steps.length];
  }
  if (focus.type === 'review') {
    // le prime due citazioni sono della testata scelta (recensione + un secondo passaggio, se esiste)
    let c = 0;
    steps = steps.map(s => (s.slot === 'quote' && c++ < 2) ? { slot: 'quote', kind: 'review', _pub: true } : s);
  }
  if (focus.type === 'member') {
    // niente foto live di altri membri: il tema "live" generico esce dalle altre slide; se il membro ha foto dal vivo, ne compare una
    const ids = (ctx.D.lib.info || []).filter(i => i.topic === 'live-band' && i.kind === 'solo' && (i.members || [])[0] === focus.item).map(i => i.id);
    const noLive = s => (s.slot === 'info' && (s.topics || []).some(t => /^live/.test(t)))
      ? { ...s, topics: s.topics.filter(t => !/^live/.test(t)).concat(s.topics.length > 1 ? [] : ['studio']) } : s;
    const inf = steps.map((s, i) => s.slot === 'info' ? i : -1).filter(i => i >= 0);
    const k = steps.findIndex(s => s.slot === 'info' && (s.topics || []).some(t => /^live/.test(t)));
    const at = ids.length && inf.length ? (k >= 0 ? k : inf[Math.min(1, inf.length - 1)]) : -1;
    steps = steps.map((s, i) => i === at ? { slot: 'info', topics: ['live-band'], _ids: ids } : noLive(s));
  }
  if (focus.type === 'auto' && steps.filter(s => s.slot === 'info').length >= 3 && ctx.rng() < 0.5) {
    // argomento libero: a volte una slide informativa diventa una foto live scelta per mood
    const inf = steps.map((s, i) => s.slot === 'info' ? i : -1).filter(i => i >= 0);
    steps[inf[inf.length - 1]] = { slot: 'info', topics: ['live-band'] };
  }
  if (focus.type === 'song') {
    // la prima citazione del carosello e' sempre un verso del brano scelto
    const qi = steps.findIndex(s => s.slot === 'quote');
    if (qi >= 0) steps[qi] = { slot: 'quote', kind: 'song' };
  }
  const infos = steps.map((s, i) => s.slot === 'info' ? i : -1).filter(i => i >= 0);
  if (focus.type === 'song' && (ctx.D.lib.analyses || []).some(a => a.song === parseInt(focus.item, 10)) && infos.length) {
    // una slide e' dedicata all'analisi del testo (socialita' profonda); si sacrifica la seconda slide informativa
    steps[infos.length > 1 ? infos[1] : infos[0]] = { slot: 'analysis' };
  }
  if (focus.type === 'doomcharts' && infos.length) steps[infos[0]]._force = 'charts';
  else if (focus.type === 'album' && infos.length) steps[infos[0]]._force = 'basics';
  else if (focus.type === 'custom' && infos.length && focus.text) {
    const i = infos[infos.length - 1];
    const parts = String(focus.text).trim().split(/\n+/);
    steps[i] = { slot: 'custom', titolo: parts[0].slice(0, 90), corpo: parts.slice(1).join(' ').slice(0, 300) || 'Petrosa. Roadburn Chronicles.' };
  }
  return steps;
}

function assemble(recipe, mood, focus, seed, D) {
  const rng = mulberry(seed);
  const ctx = ctxFrom(mood, focus, rng, D);
  const steps = applyFocusToSteps(recipe.steps, ctx.focus, ctx);
  // per due step "band member" servono membri diversi: gestito da ctx.members
  const slides = finalize(steps.map(st => buildSlide(ctx, st)), D);
  const cap = buildCaption(slides, mood, seed, D, undefined, ctx.focus && ctx.focus.type);
  return { recipeId: recipe.id, label: recipe.label, desc: recipe.desc, slides, ...cap };
}

function propose({ mood = 'riff', focus = { type: 'auto' }, count = 8, seed, avoid = [] } = {}) {
  AVOID = new Set(Array.isArray(avoid) ? avoid.map(String) : []);
  const D = load();
  const n = Math.min(10, Math.max(7, parseInt(count, 10) || 8));
  seed = Number.isFinite(+seed) ? +seed : Math.floor(Math.random() * 1e9);
  const rs = D.lib.recipes.filter(r => r.n === n);
  if (!rs.length) throw new Error('Nessuna ricetta per ' + n + ' slide');
  const rng = mulberry(seed + 1);
  const order = rs.slice().sort(() => rng() - 0.5);
  const list = [];
  if (order[0]) list.push(assemble(order[0], mood, focus, seed, D));
  if (order[1]) list.push(assemble(order[1], mood, focus, seed + 101, D));
  list.push(assemble(order[0], mood, focus, seed + 202, D));
  return { mood, seed, count: n, proposals: list.map((p, i) => ({ ...p, id: 'p' + (i + 1), titolo: p.slides[0].titolo })) };
}

// Sostituisce una singola slide con un'altra alternativa dello stesso tipo
function swap({ mood = 'riff', focus = { type: 'auto' }, slides = [], index = 1, seed, avoid = [] } = {}) {
  AVOID = new Set(Array.isArray(avoid) ? avoid.map(String) : []);
  const D = load();
  seed = Number.isFinite(+seed) ? +seed : Math.floor(Math.random() * 1e9);
  const rng = mulberry(seed);
  const cur = slides[index];
  if (!cur || !cur._ref) throw new Error('Questa slide non e\' sostituibile (modificata a mano).');
  const ctx = ctxFrom(mood, { type: 'auto' }, rng, D);
  if (cur._ref.slot === 'analysis') throw new Error('L\'analisi del brano non ha alternative: e\' scritta apposta per questa canzone.');
  // marca come usato il resto del carosello
  slides.forEach((s, i) => {
    if (!s._ref) return;
    if (i !== index) ctx.used.add(s._ref.libId);
    if (i === index) ctx.used.add(s._ref.libId);
    const q = D.lib.quotes.find(x => x.id === s._ref.libId);
    if (q && i !== index) { if (q.kind === 'song') ctx.songs.add(q.song); else { ctx.reviews.add(q.review); const r = D.band.reviews.find(x => x.id === q.review); if (r) ctx.pubs.add(r.publication); } }
    if (s._ref.member && i !== index) ctx.members.add(s._ref.member);
    if (s._ref.slot === 'info' && i !== index) { const it = D.lib.info.find(x => x.id === s._ref.libId); if (it) ctx.topics.add(it.topic); }
  });
  ctx.firstQuote = false;
  const step = { ...cur._ref };
  delete step.libId; delete step.member;
  if (focus && ['song', 'member', 'review', 'live', 'band'].includes(focus.type) && (step.slot === 'hook' || (step.slot === 'band' && focus.type === 'member'))) ctx.focus = focus;
  if (focus && focus.type === 'song' && step.slot === 'quote') ctx.focus = focus;
  if (step.slot === 'band' && step.who !== 'all' && cur._ref.member && ctx.focus.type !== 'member') ctx.members.add(cur._ref.member);
  if (focus && focus.type === 'band' && step.slot === 'band' && cur._ref.member) { step._member = cur._ref.member; step._role = true; ctx.members.delete(cur._ref.member); }   // ogni membro resta al suo posto: cambia solo il testo
  if (step.slot === 'custom') throw new Error('La slide personalizzata non ha alternative.');
  const ns = buildSlide(ctx, step);
  const out = slides.map((s, i) => i === index ? ns : s);
  finalize(out, D);
  const cap = buildCaption(out, mood, seed, D, undefined, focus && focus.type);
  return { slides: out, ...cap };
}

// ---------- Piano settimanale: 5 o 7 caroselli con Reel abbinato, argomenti e mood alternati, senza ripetizioni ----------
const PLAN = {
  7: [{ t: 'song', m: 'riff' }, { t: 'review', m: 'proof' }, { t: 'member', m: 'intro' }, { t: 'live', m: 'road' }, { t: 'song', m: 'doom' }, { t: 'band', m: 'fans' }, { t: 'album', m: 'psych' }],
  5: [{ t: 'song', m: 'riff' }, { t: 'review', m: 'proof' }, { t: 'member', m: 'intro' }, { t: 'live', m: 'doom' }, { t: 'album', m: 'psych' }]
};
const PLAN_SIZES = [8, 9, 7, 10, 8, 9, 7];   // lunghezze diverse: il feed non sembra una fotocopia
function weekPlan({ days = 7, seed, avoid = [] } = {}) {
  days = days === 5 ? 5 : 7;
  const D = load();
  seed = Number.isFinite(+seed) ? +seed : Math.floor(Math.random() * 1e9);
  const rng = mulberry(seed);
  const rot = arr => { const k = Math.floor(rng() * arr.length); return arr.slice(k).concat(arr.slice(0, k)); };
  const songs = rot(D.band.songs.map(x => x.n)), members = rot(D.band.members.map(m => m.id)), reviews = rot(D.band.reviews.filter(r => r.quote).map(r => r.id));
  const taken = new Set(Array.isArray(avoid) ? avoid.map(String) : []);
  const usedSongs = [], out = [];
  const recipesUsed = new Set();
  PLAN[days].forEach((slot, k) => {
    let focus = { type: slot.t };
    if (slot.t === 'song') { focus.item = songs.find(n => !usedSongs.includes(n)); usedSongs.push(focus.item); }
    else if (slot.t === 'member') focus.item = members.shift();
    else if (slot.t === 'review') focus.item = reviews.shift();
    AVOID = new Set(taken);
    const n = PLAN_SIZES[k % PLAN_SIZES.length];
    const rs = D.lib.recipes.filter(r => r.n === n), fresh = rs.filter(r => !recipesUsed.has(r.id));
    const recipe = one(fresh.length ? fresh : rs, rng); recipesUsed.add(recipe.id);
    const dseed = seed + 1000 * (k + 1);
    const p = assemble(recipe, slot.m, focus, dseed, D);
    p.slides.forEach(sl => {
      if (!sl._ref || !sl._ref.libId) return;
      taken.add(sl._ref.libId);
      const q = D.lib.quotes.find(x => x.id === sl._ref.libId);   // stesso brano o stessa recensione: evitati anche nei giorni successivi
      if (q) D.lib.quotes.filter(x => x.kind === q.kind && (q.kind === 'song' ? x.song === q.song : x.review === q.review)).forEach(x => taken.add(x.id));
    });
    taken.add(p.captionId);
    const c0 = p.slides[0].immagine; if (c0 && !['cover', 'logo', 'none'].includes(c0)) taken.add('cp-' + c0);
    // Reel abbinato: stesso post, testi accorciati, sulla canzone del verso citato (o sulla prossima non ancora usata)
    const qs = p.slides.find(sl => sl.citazione && sl._ref && sl._ref.libId && (D.lib.quotes.find(q => q.id === sl._ref.libId) || {}).kind === 'song');
    const qn = qs ? (D.lib.quotes.find(q => q.id === qs._ref.libId) || {}).song : null;
    const reelSong = qn;   // se null, viene assegnata dopo (una canzone diversa per ogni giorno)
    const label = { song: () => 'Brano: ' + (D.band.songs.find(x => x.n === focus.item) || {}).title, review: () => 'Recensione: ' + ((D.band.reviews.find(r => r.id === focus.item) || {}).publication), member: () => 'Membro: ' + ((D.band.members.find(m => m.id === focus.item) || {}).name), live: () => 'Live', band: () => 'Tutta la band', album: () => 'Album' }[slot.t]();
    out.push({ day: k + 1, topic: slot.t, label, mood: slot.m, focus, n, recipeId: recipe.id, slides: p.slides, caption: p.caption, hashtags: p.hashtags, menzioni: p.menzioni, captionId: p.captionId, reel: { song: reelSong, slides: RC.cutAll(p.slides) } });
  });
  const claimed = new Set(out.map(o => o.reel.song).filter(Boolean));
  out.forEach(o => { if (!o.reel.song) { const n = songs.find(x => !claimed.has(x)) || songs[0]; o.reel.song = n; claimed.add(n); } });
  return { seed, days: out.length, plan: out };
}

function recaption({ mood = 'riff', slides = [], seed, exclude } = {}) {
  const D = load();
  seed = Number.isFinite(+seed) ? +seed : Math.floor(Math.random() * 1e9);
  return buildCaption(slides, mood, seed, D, exclude);
}

// lo stato "avoid" vale solo per la singola richiesta (in serverless l'istanza resta viva fra una richiesta e l'altra)
const scoped = fn => (...a) => { try { return fn(...a); } finally { AVOID = new Set(); } };
function photos() { return readJSON('photos.json', []); }
module.exports = { weekPlan: scoped(weekPlan), photos, propose: scoped(propose), swap: scoped(swap), recaption, catalog, load, assemble, mulberry, norm, finalize };
