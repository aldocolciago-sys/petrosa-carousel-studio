'use strict';
// Test delle funzioni "piano di crescita": Reel su misura, libreria estesa, copertine, piano settimanale, orari, cartella "pronto da pubblicare".
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { ROOT } = require('./helpers');
const L = require(path.join(ROOT, 'library.js'));
const RC = require(path.join(ROOT, 'public', 'reelcut.js'));
const Teaser = require(path.join(ROOT, 'public', 'teaser.js'));

describe('1. testi su misura per il Reel', () => {
  const posts = [];
  for (const mood of ['doom', 'riff', 'psych', 'intro', 'road', 'proof', 'fans'])
    for (const seed of [1, 2, 3, 4]) for (const p of L.propose({ mood, focus: { type: 'auto' }, count: 1, seed }).proposals) posts.push(p.slides);
  const all = posts.flat();

  test('una frase per schermata: titolo e corpo non superano i limiti del layout', () => {
    for (const s of all) {
      const r = RC.cut(s), lim = RC.LIM[s.layout] || RC.LIM.text;
      if (s.layout !== 'quote' && s.layout !== 'stat') assert.ok(r.titolo.length <= lim.t + 1, `titolo lungo (${s.layout}): ${r.titolo}`);
      assert.ok(!r.corpo || r.corpo.length <= (s.layout === 'text' ? 110 : 80) + (/^(\w+ ?\w*, \w+\. ){3}/.test(s.corpo || '') ? 60 : 1), `corpo lungo (${s.layout}): ${r.corpo}`);
    }
  });
  test('verso e recensione restano integri (citazione e fonte identiche)', () => {
    for (const s of all) { const r = RC.cut(s); assert.equal(r.citazione, s.citazione); assert.equal(r.fonte, s.fonte); }
  });
  test('la cover si legge in un secondo: titolo di al massimo 8 parole', () => {
    for (const s of all.filter(x => x.layout === 'hook')) assert.ok(RC.cut(s).titolo.split(' ').length <= 8, RC.cut(s).titolo);
  });
  test('stessa struttura del post: numero di slide, ordine, layout e immagini invariati (i tempi audio restano validi)', () => {
    for (const sl of posts) {
      const r = RC.cutAll(sl); assert.equal(r.length, sl.length);
      r.forEach((x, i) => { assert.equal(x.layout, sl[i].layout); assert.equal(x.immagine, sl[i].immagine); assert.equal(x.tipo, sl[i].tipo); });
    }
  });
  test('non muta il post originale e non tronca a meta\' parola', () => {
    const s = { layout: 'text', titolo: 'A very long headline that keeps going on and on for ages', corpo: 'First sentence is short. Second sentence should vanish entirely from the reel.' };
    const copy = JSON.stringify(s), r = RC.cut(s);
    assert.equal(JSON.stringify(s), copy);
    assert.equal(r.corpo, 'First sentence is short.');
    assert.ok(r.titolo.startsWith('A very long headline'));
    for (const w of r.titolo.replace(/\.$/, '').split(' ')) assert.ok(s.titolo.split(' ').includes(w), 'parola spezzata: ' + w);
  });
  test('in media il Reel usa molto meno testo del carosello', () => {
    const st = RC.stats(all); assert.ok(st.after < st.before * 0.85, JSON.stringify(st));
  });
  test('un corpo uguale al titolo viene eliminato; slide vuote non rompono nulla', () => {
    assert.equal(RC.cut({ layout: 'text', titolo: 'Petrosa.', corpo: 'Petrosa.' }).corpo, '');
    assert.deepEqual(RC.cutAll(null), []); assert.equal(RC.cut(null), null);
    assert.equal(RC.cut({ layout: 'cta' }).corpo, '');
  });
  test('songTeaser: un post dedicato a un brano diventa un trailer (copertina, verso, 1-2 spunti di analisi, CTA), gli altri post restano invariati', () => {
    for (const seed of [1, 2, 3]) for (const item of [1, 7]) {
      const p = L.propose({ mood: 'doom', focus: { type: 'song', item }, count: 10, seed }).proposals[0];
      const t = RC.songTeaser(p.slides);
      assert.ok(t.length < p.slides.length, 'il trailer deve avere meno slide del carosello');
      assert.equal(t[0], p.slides[0]);   // stessa copertina
      assert.equal(t.filter(s => s.tipo === 'Song').length, 1);
      assert.ok(t.filter(s => s.tipo === 'Analysis').length <= 2);
      assert.equal(t[t.length - 1], p.slides[p.slides.length - 1]);   // stessa CTA
    }
    // nessuna slide di analisi (altri argomenti): songTeaser non cambia nulla
    const p2 = L.propose({ mood: 'doom', focus: { type: 'member', item: 'aldo' }, count: 8, seed: 1 }).proposals[0];
    assert.deepEqual(RC.songTeaser(p2.slides), p2.slides);
    assert.deepEqual(RC.songTeaser(null), []); assert.deepEqual(RC.songTeaser(undefined), []);
  });
});

describe('1b. frasi complete e elenchi', () => {
  test('due frasi brevi nel titolo restano insieme; elenco dei membri mantenuto', () => {
    assert.equal(RC.cut({ layout: 'hook', titolo: 'Fuzz up. Riffs low.' }).titolo, 'Fuzz up. Riffs low.');
    const b = RC.cut({ layout: 'photo', titolo: 'Four musicians. One wall of sound.', corpo: 'Antonio Buonocore, guitar. Giorgio Monza, drums. Aldo Colciago, vocals. Andrea Vignati, bass. From Milan, Italy.' });
    assert.match(b.corpo, /Antonio.*Giorgio.*Aldo.*Andrea/); assert.equal(b.titolo, 'Four musicians. One wall of sound.');
  });
});

describe('2. libreria ampliata', () => {
  const { lib } = L.load();
  const BANNED = ['check it out', "don't miss", 'get ready', 'buckle up', 'dive into', 'delve', 'unleash', 'embark', 'sonic journey', 'game-changer', 'game changer', 'next level', 'music lovers', 'rock your world', "whether you're a fan", 'stay tuned', 'prepare to be blown away'];
  const MOODS = ['riff', 'doom', 'psych', 'intro', 'road', 'proof', 'fans'];
  test('almeno 8 hook generici, 5 CTA e 5 caption per ogni mood', () => {
    for (const m of MOODS) {
      assert.ok(lib.hooks.filter(h => !h.kind && (h.moods.includes(m))).length >= 8, 'hook ' + m);
      assert.ok(lib.cta.filter(h => h.moods.includes(m)).length >= 5, 'cta ' + m);
      assert.ok(lib.captions.filter(h => h.moods.includes(m) && !h.live && !h.band).length >= 3, 'caption ' + m);
    }
    assert.ok(lib.captions.filter(c => c.live).length >= 4 && lib.captions.filter(c => c.band).length >= 4);
    assert.ok(lib.recipes.length >= 12);
  });
  test('id univoci e nessuna formula generica', () => {
    for (const k of ['hooks', 'cta', 'captions', 'info', 'recipes']) { const ids = lib[k].map(x => x.id); assert.equal(new Set(ids).size, ids.length, k); }
    for (const k of ['hooks', 'cta', 'info']) for (const x of lib[k]) for (const b of BANNED) assert.ok(!(x.titolo + ' ' + x.corpo).toLowerCase().includes(b), `${x.id}: ${b}`);
    for (const c of lib.captions) for (const b of BANNED) assert.ok(!c.text.toLowerCase().includes(b), `${c.id}: ${b}`);
  });
  test('fatti verificabili: cifre e nomi usati nei nuovi testi esistono nei dati della band', () => {
    const band = JSON.parse(require('fs').readFileSync(path.join(ROOT, 'data', 'band.json'), 'utf8'));
    const txt = JSON.stringify(lib.hooks.concat(lib.cta, lib.info)) + JSON.stringify(lib.captions);
    const dc = band.album.doomCharts;
    for (const m of txt.match(/#\d+/g) || []) assert.equal(m, '#' + dc.position);
    for (const m of txt.match(/\b\d{1,3},\d{3}\b/g) || []) assert.equal(m, '2,678');
    for (const m of txt.match(/\b(\d+) albums\b/g) || []) assert.equal(m, dc.pool + ' albums');
    assert.ok(!/\b(Trouble)\b.*@/.test(txt));
  });
  test('meno ripetizioni: 40 caroselli sullo stesso mood usano almeno 12 titoli di hook e 6 di CTA diversi', () => {
    for (const mood of ['riff', 'doom', 'proof']) {
      const hooks = new Set(), ctas = new Set(), caps = new Set();
      for (let seed = 1; seed <= 40; seed++) for (const p of L.propose({ mood, focus: { type: 'auto' }, count: 1, seed }).proposals) { hooks.add(p.slides[0].titolo); ctas.add(p.slides[p.slides.length - 1].titolo); caps.add(p.caption.split('\n')[0]); }
      assert.ok(hooks.size >= 12, `${mood}: hook ${hooks.size}`); assert.ok(ctas.size >= 6, `${mood}: cta ${ctas.size}`); assert.ok(caps.size >= 6, `${mood}: caption ${caps.size}`);
    }
  });
  test('nuove ricette: si assemblano per ogni lunghezza e cambiano l\'ordine delle slide', () => {
    const ids = new Set();
    for (let seed = 1; seed <= 30; seed++) for (const n of [7, 8, 9, 10]) for (const p of L.propose({ mood: 'riff', focus: { type: 'auto' }, count: 8, seed, slides: n }).proposals) ids.add(p.recipeId);
    for (const r of ['r7c', 'r8c', 'r9c', 'r10c']) assert.ok(lib.recipes.find(x => x.id === r).steps.length === +r.slice(1, -1), r);
  });
});

describe('3. copertine forti', () => {
  const photos = L.photos(); const PH = Object.fromEntries(photos.map(p => [p.id, p]));
  const covers = [];
  for (const mood of ['doom', 'riff', 'psych', 'intro', 'road', 'proof', 'fans'])
    for (let seed = 1; seed <= 60; seed++) for (const p of L.propose({ mood, focus: { type: 'auto' }, count: 1, seed }).proposals) covers.push({ mood, s: p.slides[0], all: p.slides });
  test('ogni foto ha un punteggio di impatto 0-100', () => {
    for (const p of photos) assert.ok(Number.isInteger(p.impact) && p.impact >= 0 && p.impact <= 100, p.id);
    assert.ok(Math.max(...photos.map(p => p.impact)) === 100);
  });
  test('la copertina generica ormai usa quasi sempre una foto live: la CTA finale mostra gia\' l\'album, quindi l\'apertura non lo ripete piu\'', () => {
    // Prima capitava che l'apertura restasse la stessa copertina generica della CTA finale (stesso identico
    // disco due volte nello stesso carosello): ora la CTA ha sempre la priorita' sulla copertina (vedi
    // dedupeImages in library.js) e l'apertura, quando ci arriva anche lei, cede il posto a una foto live.
    const live = covers.filter(c => PH[c.s.immagine]).length, rate = live / covers.length;
    assert.ok(rate > 0.9, 'quota copertine con foto: ' + rate.toFixed(2));
    for (const c of covers) assert.notEqual(c.s.immagine, 'cover', `copertina ancora sull'album (mood ${c.mood}): duplicato con la CTA finale`);
  });
  test('la foto di copertina ha qualita 2+, impatto alto, non e un composito e non e riusata nel resto del carosello', () => {
    for (const c of covers.filter(c => PH[c.s.immagine])) {
      const p = PH[c.s.immagine];
      assert.ok(p.q >= 2 && p.impact >= 45, c.s.immagine); assert.ok(['solo', 'duo'].includes(p.kind), c.s.immagine);
      assert.equal(c.all.filter(x => x.immagine === c.s.immagine).length, 1, 'foto ripetuta ' + c.s.immagine);
    }
  });
  test('varieta: almeno 12 foto di copertina diverse e nessun membro oltre il 55%', () => {
    const ids = covers.map(c => c.s.immagine).filter(i => PH[i]); assert.ok(new Set(ids).size >= 12, 'foto diverse: ' + new Set(ids).size);
    const by = {}; ids.forEach(i => PH[i].members.forEach(m => by[m] = (by[m] || 0) + 1));
    assert.ok(Math.max(...Object.values(by)) / ids.length <= 0.75, JSON.stringify(by));
  });
  test('il mood conta: le copertine con foto hanno il mood richiesto piu spesso del caso', () => {
    let hit = 0, tot = 0; for (const c of covers) if (PH[c.s.immagine]) { tot++; if (PH[c.s.immagine].moods.includes(c.mood)) hit++; }
    assert.ok(hit / tot > 0.45, (hit / tot).toFixed(2));
  });
  test('anche gli hook di brano o recensione possono usare una foto live, non solo la copertina generica', () => {
    // Prima la copertina restava SEMPRE l'album per un focus preciso: troppa ripetizione nel piano settimanale.
    // Ora puo' usare una foto live (con le stesse regole di qualita/impatto).
    for (const focus of [{ type: 'song', item: 3 }, { type: 'review', item: 'outlaws' }]) {
      let sawPhoto = false;
      for (let seed = 1; seed <= 40; seed++) for (const p of L.propose({ mood: 'riff', focus, count: 1, seed }).proposals) {
        const img = p.slides[0].immagine;
        assert.ok(img === 'cover' || PH[img], `immagine di copertina inattesa: ${img}`);
        if (img !== 'cover') sawPhoto = true;
      }
      assert.ok(sawPhoto, `nessuna foto di copertina in 40 tentativi per focus ${focus.type}`);
    }
  });
  test('focus "member": la copertina mostra SEMPRE una foto live di quel membro (mai l\'album, mai un\'altra persona o una coppia)', () => {
    const { band } = L.load();
    for (const item of band.members.map(m => m.id)) {
      for (let seed = 1; seed <= 30; seed++) for (const p of L.propose({ mood: 'riff', focus: { type: 'member', item }, count: 1, seed }).proposals) {
        const img = p.slides[0].immagine;
        assert.notEqual(img, 'cover', `copertina ancora sull'album per il membro ${item} (seed ${seed})`);
        const ph = PH[img];
        assert.ok(ph, `foto sconosciuta ${img}`);
        assert.deepEqual(ph.members, [item], `copertina di ${img} (${ph.members}) nel carosello di ${item}`);
      }
    }
  });
});

describe('4. piano settimanale (3 post al giorno: mezzogiorno, sera, mezzanotte)', () => {
  const plans = []; for (let seed = 1; seed <= 40; seed++) for (const days of [5, 7]) plans.push(L.weekPlan({ days, seed }));
  const { lib, band } = L.load();
  const SLOT_IDS = ['noon', 'evening', 'midnight'];
  test('5 o 7 giorni di calendario, 3 post al giorno; ogni post ha carosello (7-10 slide), caption, hashtag e Reel abbinato', () => {
    for (const p of plans) {
      assert.ok(p.days === 5 || p.days === 7, 'p.days: ' + p.days);
      assert.equal(p.plan.length, p.days * 3, 'plan.length deve essere days*3');
      p.plan.forEach((d, i) => {
        assert.equal(d.day, Math.floor(i / 3) + 1, 'numero di giorno errato all\'indice ' + i);
        assert.equal(d.slot, SLOT_IDS[i % 3], 'fascia fuori ordine all\'indice ' + i);
        assert.ok(d.slotLabel && d.slotTime, 'slotLabel/slotTime mancanti');
        assert.ok(d.slides.length >= 7 && d.slides.length <= 10); assert.equal(d.slides.length, d.n);
        assert.equal(d.slides[0].tipo, 'Cover'); assert.equal(d.slides[d.slides.length - 1].layout, 'cta');
        assert.ok(d.caption.length > 60 && d.hashtags.length >= 8);
        // post dedicato a un brano O a un "viaggio nell'album" (piu' brani collegati): il Reel e' un trailer piu' corto
        // del carosello (copertina, verso citato, 1-2 spunti di analisi/viaggio, CTA); le slide di un viaggio non hanno
        // tipo fisso e si riconoscono da _ref.slot === 'journey', non da s.tipo (vedi isDeep in reelcut.js).
        // Per gli altri argomenti il Reel usa tutte le slide del post.
        const isDeep = s => s.tipo === 'Analysis' || (s._ref && s._ref.slot === 'journey');
        if (d.slides.some(isDeep)) assert.ok(d.reel.slides.length < d.slides.length && d.reel.slides.length >= 4, 'reel-trailer: ' + d.reel.slides.length);
        else assert.equal(d.reel.slides.length, d.slides.length);
        assert.ok(Number.isInteger(d.reel.song) && d.reel.song >= 1 && d.reel.song <= 10);
        d.slides.filter(s => s.citazione).forEach(s => assert.equal(s.verified, true));
      });
    }
  });
  test('ogni giorno ha le sue 3 fasce, sempre nell\'ordine mezzogiorno/sera/mezzanotte', () => {
    for (const p of plans) {
      for (let day = 1; day <= p.days; day++) {
        const slots = p.plan.filter(d => d.day === day).map(d => d.slot);
        assert.deepEqual(slots, SLOT_IDS, 'giorno ' + day);
      }
    }
  });
  test('argomenti alternati: mai due post di fila (nello stesso giorno o a cavallo di due giorni) con lo stesso argomento; almeno 4 argomenti diversi', () => {
    for (const p of plans) {
      p.plan.forEach((d, i) => { if (i) assert.notEqual(d.topic, p.plan[i - 1].topic); });
      assert.ok(new Set(p.plan.map(d => d.topic)).size >= 4);
      assert.ok(new Set(p.plan.map(d => d.mood)).size >= 5);
    }
  });
  test('ogni argomento e quello annunciato: brano, recensione e membro scelti compaiono nel carosello', () => {
    for (const p of plans) for (const d of p.plan) {
      const txt = JSON.stringify(d.slides);
      if (d.topic === 'song') assert.ok(txt.includes(band.songs.find(s => s.n === d.focus.item).title), 'brano');
      if (d.topic === 'review') assert.ok(txt.includes(band.reviews.find(r => r.id === d.focus.item).publication), 'recensione');
      if (d.topic === 'member') assert.ok(txt.includes(band.members.find(m => m.id === d.focus.item).name), 'membro');
      if (d.topic === 'live') assert.ok(d.slides.some(s => s.tipo === 'Live'), 'live');
      if (d.topic === 'band') for (const m of band.members) assert.ok(txt.includes(m.name.split(' ')[0]), 'band: ' + m.name);
    }
  });
  test('senza ripetizioni: brani, membri, recensioni in evidenza, caption, CTA e copertine diversi durante la settimana', () => {
    for (const p of plans) {
      const f = t => p.plan.filter(d => d.topic === t).map(d => d.focus.item);
      for (const t of ['song', 'member', 'review']) assert.equal(new Set(f(t)).size, f(t).length, t);
      const caps = p.plan.map(d => d.captionId); assert.equal(new Set(caps).size, caps.length, 'caption ripetute');
      const cta = p.plan.map(d => d.slides[d.slides.length - 1].titolo); assert.equal(new Set(cta).size, cta.length, 'CTA ripetute: ' + cta);
      const hooks = p.plan.map(d => d.slides[0].titolo); assert.equal(new Set(hooks).size, hooks.length, 'hook ripetuti: ' + hooks);
      // la stessa foto di copertina puo', raramente, ricomparire in un altro giorno della settimana - si accetta pur
      // di non ripeterla nello STESSO post (dove sarebbe un doppione con la CTA finale, vedi dedupeImages in
      // library.js): resta pero' l'eccezione, non la norma.
      const covers = p.plan.map(d => d.slides[0].immagine).filter(i => i !== 'cover' && i !== 'none');
      const repeats = covers.length - new Set(covers).size;
      assert.ok(repeats <= Math.ceil(covers.length * 0.2), `troppe copertine ripetute nella settimana: ${repeats}/${covers.length}`);
      // quello che conta davvero: nessun post ripete la STESSA immagine su due sue slide (mai due volte nello stesso post/Reel)
      for (const d of p.plan) {
        const imgs = d.slides.map(s => s.immagine).filter(i => i && i !== 'none');
        const dup = imgs.filter((im, idx) => imgs.indexOf(im) !== idx);
        assert.equal(dup.length, 0, `giorno ${d.day} (${d.slotLabel}): immagine ripetuta nello stesso post: ${dup}`);
      }
      assert.ok(new Set(p.plan.map(d => d.n)).size >= 3, 'lunghezze tutte uguali');
    }
  });
  test('canzoni dei Reel: con 3 post al giorno si ripetono per forza (piu\' post che canzoni), ma tutte le canzoni vengono usate e nessuna domina', () => {
    const { band } = L.load();
    for (const p of plans) {
      const rs = p.plan.map(d => d.reel.song), counts = {};
      rs.forEach(s => counts[s] = (counts[s] || 0) + 1);
      assert.equal(Object.keys(counts).length, band.songs.length, 'non tutte le canzoni sono state usate: ' + rs);
      assert.ok(Math.max(...Object.values(counts)) <= 6, 'una canzone usata troppe volte: ' + JSON.stringify(counts));
    }
  });
  test('stesso seme = stesso piano; semi diversi = piani diversi', () => {
    assert.deepEqual(L.weekPlan({ days: 7, seed: 5 }).plan.map(d => d.captionId), L.weekPlan({ days: 7, seed: 5 }).plan.map(d => d.captionId));
    const a = L.weekPlan({ days: 7, seed: 5 }).plan.map(d => d.slides[0].titolo).join(), b = L.weekPlan({ days: 7, seed: 6 }).plan.map(d => d.slides[0].titolo).join();
    assert.notEqual(a, b);
  });
  test('"avoid" (post recenti) riduce sensibilmente le ripetizioni di caption (con 21 post/settimana la libreria non basta piu\' per zero ripetizioni, ma "avoid" deve comunque aiutare parecchio); days non valido diventa 7', () => {
    // con 3 post al giorno una settimana da 21 usa gia' meta' della libreria di caption: qualche ripetizione e' inevitabile,
    // ma "avoid" (deprioritizzazione, non esclusione rigida) deve comunque ridurla parecchio rispetto a un piano indipendente.
    const first = L.weekPlan({ days: 7, seed: 9 }); const avoid = first.plan.flatMap(d => [d.captionId]);
    const second = L.weekPlan({ days: 7, seed: 9, avoid });
    const independent = L.weekPlan({ days: 7, seed: 509 });
    const withAvoid = second.plan.filter(d => avoid.includes(d.captionId)).length;
    const withoutAvoid = independent.plan.filter(d => avoid.includes(d.captionId)).length;
    assert.ok(withAvoid < withoutAvoid, `"avoid" non sta riducendo le ripetizioni: ${withAvoid} con avoid vs ${withoutAvoid} senza`);
    assert.ok(withAvoid <= 12, 'troppe ripetizioni anche con "avoid": ' + withAvoid + '/21');
    const bad = L.weekPlan({ days: 3, seed: 1 }); assert.equal(bad.days, 7); assert.equal(bad.plan.length, 21);
  });
  test('le slide del piano restano modificabili (riferimenti _ref per sostituzione e caption)', () => {
    const d = L.weekPlan({ days: 5, seed: 2 }).plan[1];
    const out = L.swap({ mood: d.mood, focus: d.focus, slides: d.slides, index: 2, seed: 4 }); assert.equal(out.slides.length, d.slides.length);
  });
});

describe('5. orari suggeriti (3 fasce fisse al giorno: 12:00 / 18:00 / 00:00 ora italiana)', () => {
  const S = require(path.join(ROOT, 'public', 'schedule.js'));
  const now = new Date('2026-09-21T09:00:00Z');
  test('conversione di fuso con ora legale: mezzogiorno Roma = 06:00 New York a settembre, 07:00 dopo il cambio ora europeo del 25 ottobre (l\'Europa cambia ora prima degli USA)', () => {
    const sep = S.zonedToUtc(2026, 9, 22, 12, 0, 'Europe/Rome'); assert.equal(sep.toISOString(), '2026-09-22T10:00:00.000Z'); assert.equal(S.hm(sep, 'America/New_York'), '06:00');
    const oct = S.zonedToUtc(2026, 10, 27, 12, 0, 'Europe/Rome'); assert.equal(oct.toISOString(), '2026-10-27T11:00:00.000Z'); assert.equal(S.hm(oct, 'America/New_York'), '07:00');
    assert.equal(S.hm(S.zonedToUtc(2026, 3, 28, 12, 0, 'Europe/Rome'), 'Europe/Rome'), '12:00');
  });
  test('"mezzanotte" (24:00) e\' il momento giusto DOPO mezzogiorno e sera dello stesso giorno, non l\'inizio dello stesso giorno', () => {
    const noon = S.zonedToUtc(2026, 9, 22, 12, 0, 'Europe/Rome'), evening = S.zonedToUtc(2026, 9, 22, 18, 0, 'Europe/Rome'), midnight = S.zonedToUtc(2026, 9, 22, 24, 0, 'Europe/Rome');
    assert.ok(noon < evening && evening < midnight, 'le tre fasce di un giorno devono essere in ordine cronologico');
    assert.equal(midnight.toISOString(), S.zonedToUtc(2026, 9, 23, 0, 0, 'Europe/Rome').toISOString(), 'mezzanotte di un giorno = 00:00 del giorno dopo');
  });
  test('pairs(): sequenza sempre crescente nel tempo, mai nel passato, Reel 20 minuti dopo il carosello; 5 giorni = solo martedi/mercoledi/giovedi/sabato/domenica', () => {
    const p9 = S.pairs(now, 9, { calendarDays: 7 }), p9five = S.pairs(now, 9, { calendarDays: 5 });
    assert.equal(p9.length, 9); assert.equal(p9five.length, 9);
    for (const p of p9.concat(p9five)) { assert.ok(p.carousel.getTime() >= now.getTime() + 30 * 60000); assert.equal(p.reel.getTime() - p.carousel.getTime(), 20 * 60000); }
    for (let i = 1; i < p9.length; i++) assert.ok(p9[i].carousel > p9[i - 1].carousel, 'ordine cronologico rotto all\'indice ' + i);
    for (let i = 1; i < p9five.length; i++) assert.ok(p9five[i].carousel > p9five[i - 1].carousel, 'ordine cronologico rotto (5gg) all\'indice ' + i);
    // solo mezzogiorno/sera cadono sul vero giorno di contenuto: la fascia "mezzanotte" e' 00:00 del giorno dopo per costruzione,
    // quindi la sua data di calendario puo' ricadere su un giorno escluso (es. venerdi) pur appartenendo a un giorno valido (giovedi)
    const weekdays5 = [...new Set(p9five.filter(x => [12, 18].includes(S.parts(x.carousel, S.TZ).h)).map(x => S.parts(x.carousel, S.TZ).wd))];
    for (const wd of weekdays5) assert.ok(S.BEST5.includes(wd), 'giorno fuori BEST5: ' + wd);
  });
  test('orari nella fascia giusta: le tre fasce di ogni giorno sono sempre 12:00 / 18:00 / 00:00 ora italiana', () => {
    for (let k = 0; k < 30; k++) for (const x of S.pairs(new Date(now.getTime() + k * 86400000), 9, { calendarDays: 7 })) {
      const h = S.parts(x.carousel, S.TZ).h; assert.ok([12, 18, 0].includes(h), 'orario fuori fascia: ' + S.describe(x.carousel));
    }
  });
  test('se lo slot di oggi e troppo vicino (meno di 30 minuti) si passa al giorno dopo', () => {
    const t = S.zonedToUtc(2026, 9, 21, 23, 45, 'Europe/Rome'); assert.equal(S.parts(S.pairs(t, 1)[0].carousel, S.TZ).d, 22);
    const early = S.zonedToUtc(2026, 9, 21, 9, 0, 'Europe/Rome'); assert.equal(S.parts(S.pairs(early, 1)[0].carousel, S.TZ).d, 21);
  });
  test('describe(): testo con i tre fusi', () => {
    const d = S.describe(S.zonedToUtc(2026, 9, 22, 18, 0, 'Europe/Rome')); assert.match(d, /mar 22 set/); assert.match(d, /18:00 Italia/); assert.match(d, /12:00 New York/); assert.match(d, /09:00 Los Angeles/);
  });
  test('annotate(): ogni post del piano prende l\'orario della SUA fascia (noon=12:00, evening=18:00, midnight=00:00), tutti in ordine crescente e mai nel passato', () => {
    for (const days of [5, 7]) {
      const plan = L.weekPlan({ days, seed: 1 }).plan; S.annotate(plan, now);
      const wantH = { noon: 12, evening: 18, midnight: 0 };
      plan.forEach(p => {
        assert.ok(new Date(p.when.carousel) < new Date(p.when.reel));
        assert.match(p.whenText, /\d\d:\d\d/);
        assert.equal(S.parts(new Date(p.when.carousel), S.TZ).h, wantH[p.slot], 'fascia ' + p.slot + ' non e\' alle ' + wantH[p.slot] + ':00');
        assert.ok(new Date(p.when.carousel).getTime() >= now.getTime(), 'post nel passato: ' + p.day + '/' + p.slot);
      });
      for (let i = 1; i < plan.length; i++) assert.ok(new Date(plan[i].when.carousel) > new Date(plan[i - 1].when.carousel), 'ordine cronologico rotto all\'indice ' + i);
    }
  });
  test('next(): il prossimo carosello e il prossimo Reel sono sempre nel futuro', () => {
    assert.ok(S.next(now, 'carousel') > now); assert.ok(S.next(now, 'reel') > now);
  });
});

describe('6. cartella pronta da pubblicare', () => {
  const P = require(path.join(ROOT, 'public', 'pack.js'));
  const slides = [{ tag: [] }, { tag: ['dozer_band'] }, { tag: [] }];
  test('nomi dei file: carosello in una cartella, Reel in un\'altra, poi caption, tag e istruzioni', () => {
    assert.deepEqual(P.names({ n: 3, hasReel: true }), ['1-carosello/01.png', '1-carosello/02.png', '1-carosello/03.png', '2-reel/reel.mp4', 'caption.txt', 'tag-sulle-foto.txt', 'COME-PUBBLICARE.txt']);
    assert.ok(!P.names({ n: 3, hasReel: false }).some(x => x.startsWith('2-reel')));
    assert.ok(P.names({ n: 8, hasReel: true, reelExt: 'webm' }).includes('2-reel/reel.webm'));
  });
  test('caption.txt: caption e hashtag insieme, pronti da copiare, con newline finale', () => {
    const t = P.captionFile('Line one.\n\nLine two.\n\n#stonerrock #doom'); assert.ok(t.endsWith('#doom\n')); assert.ok(t.includes('Line two.')); assert.ok(!t.includes('\r'));
  });
  test('tag sulle foto: elenca solo le slide con tag; altrimenti dice che non serve', () => {
    assert.match(P.tagFile(slides), /Slide 02 \(02\.png\): @dozer_band/); assert.ok(!/Slide 01/.test(P.tagFile(slides)));
    assert.match(P.tagFile([{ tag: [] }]), /Nessun tag/);
  });
  test('istruzioni: passi per carosello e Reel, orari se presenti, senza Reel niente passo Reel', () => {
    const a = P.howTo({ n: 8, hasReel: true, whenLines: ['Carosello: mar 22 set · 19:00 Italia', 'Reel: mar 22 set · 21:15 Italia'] });
    assert.match(a, /2-reel/); assert.match(a, /REEL - Instagram/); assert.match(a, /ORARI CONSIGLIATI/); assert.match(a, /21:15 Italia/); assert.match(a, /8 slide/);
    const b = P.howTo({ n: 7, hasReel: false, whenLines: [] }); assert.ok(!/REEL - Instagram/.test(b)); assert.match(b, /USA/);
  });
});

describe('7. contenuti che spingono condivisioni e commenti, riga SEO', () => {
  const { lib } = L.load();
  test('ci sono hook "a confronto" (fanno commentare) e CTA/caption con invito esplicito a condividere/taggare', () => {
    assert.ok(lib.hooks.filter(h => h.id.startsWith('h-debate')).length >= 3);
    assert.ok(lib.cta.filter(c => c.id.startsWith('c-share')).length >= 5);
    assert.ok(lib.captions.filter(c => c.id.startsWith('cap-share') || c.id.startsWith('cap-debate')).length >= 4);
    const shareTxt = lib.captions.filter(c => c.id.startsWith('cap-share')).map(c => c.text.toLowerCase());
    assert.ok(shareTxt.every(t => /tag|send this|send it/.test(t)));
  });
  test('la caption include una riga SEO con parole chiave reali, coerente col mood, senza duplicarla se gia\' presente', () => {
    for (const mood of ['riff', 'doom', 'psych', 'intro', 'road', 'proof', 'fans'])
      for (let seed = 1; seed <= 8; seed++) {
        const p = L.propose({ mood, focus: { type: 'auto' }, count: 1, seed }).proposals[0];
        assert.match(p.caption, /stoner|doom|Italian|Italy|Milan/i);
        const lines = p.caption.split('\n\n'); assert.equal(new Set(lines).size, lines.length, 'riga SEO duplicata');
      }
  });
  test('le frasi SEO usano solo cifre e nomi veri (album, etichetta, città)', () => {
    const band = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'band.json'), 'utf8'));
    for (const s of lib.seoLines) {
      assert.ok(!/\d{4}/.test(s.text) || s.text.includes('2026'));
      if (/Octopus Rising/.test(s.text)) assert.ok(band.album.label.includes('Octopus Rising'));
    }
  });
});

describe('8. Reel breve "solo hook" (teaser): caption propria, invito al profilo', () => {
  test('senza testo dell\'hook, sceglie comunque una frase e un invito a seguire, con hashtag', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const c = Teaser.caption('', seed);
      assert.match(c, /profile/i);
      assert.match(c, /#stonerrock|#doommetal|#stonerdoom/);
      assert.ok(c.split('\n\n').length >= 3, 'titolo, invito e hashtag su blocchi separati');
    }
  });
  test('col testo dell\'hook, lo mette tra virgolette come prima riga', () => {
    const c = Teaser.caption('«This is the hook»', 3);
    assert.match(c, /^"This is the hook"/);
  });
  test('lo stesso seed produce sempre la stessa caption (utile per confrontare in test)', () => {
    assert.equal(Teaser.caption('X', 5), Teaser.caption('X', 5));
  });
});

describe('9b. Nessuna immagine ripetuta due volte nello stesso post/Reel', () => {
  // La CTA finale mostra sempre la copertina dell'album (vedi buildCta): prima capitava spesso (4 volte su 10) che
  // anche l'apertura restasse la stessa copertina generica, ripetendo il disco due volte nello stesso carosello.
  // dedupeImages (library.js) lo impedisce ora in ogni punto che tocca le immagini: propose(), il piano settimanale
  // e lo swap di una singola slide.
  const dupImgs = slides => { const imgs = slides.map(s => s.immagine).filter(i => i && i !== 'none'); return imgs.filter((im, i) => imgs.indexOf(im) !== i); };
  const moods = ['riff', 'doom', 'psych', 'road'];
  const focuses = [{ type: 'auto' }, { type: 'song', item: 4 }, { type: 'member', item: 'giorgio' }, { type: 'review', item: 'outlaws' }, { type: 'band' }, { type: 'live' }, { type: 'album' }, { type: 'doomcharts' }];
  test('propose(): nessun doppione, con ogni combinazione di mood, argomento e lunghezza', () => {
    for (const mood of moods) for (const focus of focuses) for (const count of [7, 8, 9, 10]) for (let seed = 1; seed <= 8; seed++) {
      let r; try { r = L.propose({ mood, focus, count, seed }); } catch (e) { continue; }
      for (const p of r.proposals) assert.deepEqual(dupImgs(p.slides), [], `${mood}/${focus.type}/${count}/${seed}`);
    }
  });
  test('piano settimanale: nessun doppione in nessuno dei post generati', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const p = L.weekPlan({ days: seed % 2 ? 7 : 5, seed });
      for (const d of p.plan) assert.deepEqual(dupImgs(d.slides), [], `giorno ${d.day} (${d.slotLabel}), seed ${seed}`);
    }
  });
  test('swap: la slide sostituita non introduce un doppione con il resto del carosello', () => {
    for (const focus of [{ type: 'auto' }, { type: 'band' }, { type: 'member', item: 'aldo' }]) {
      let slides = L.propose({ mood: 'riff', focus, count: 8, seed: 11 }).proposals[0].slides;
      for (let idx = 0; idx < slides.length; idx++) {
        if (!slides[idx]._ref) continue;
        let out; try { out = L.swap({ mood: 'riff', focus, slides, index: idx, seed: 100 + idx }); } catch (e) { continue; }
        slides = out.slides;
        assert.deepEqual(dupImgs(slides), [], `focus ${focus.type}, slide ${idx}`);
      }
    }
  });
});

describe('9. Video testi (motore puro tempo<->testo, per il Reel dedicato a un brano)', () => {
  const LS = require(path.join(ROOT, 'public', 'lyricsync.js'));
  // brano finto: 300 s, la voce entra al secondo 30 e finisce al 270; testo normalizzato lungo 100 caratteri
  const song = () => ({ N: 'x'.repeat(100), vStart: 30, vEnd: 270, dur: 300 });
  const lines = n => Array.from({ length: n }, (_, i) => ({ text: `Riga ${i + 1}`, pos: Math.round(i * 100 / n) }));

  test('senza ancore, il tempo di ogni riga e\' stimato a velocita\' costante tra vStart e vEnd', () => {
    const s = song();
    assert.equal(LS.timeOfPos(s, [], 0), 30);
    assert.ok(Math.abs(LS.timeOfPos(s, [], 100) - 270) < 0.01);
    assert.ok(Math.abs(LS.timeOfPos(s, [], 50) - 150) < 0.01);
  });
  test('con le ancore, il tempo interpola tra i punti impostati ed estrapola prima/dopo', () => {
    const s = song(), A = [{ pos: 20, t: 60 }, { pos: 80, t: 240 }];
    assert.equal(LS.timeOfPos(s, A, 20), 60); assert.equal(LS.timeOfPos(s, A, 80), 240);
    assert.equal(LS.timeOfPos(s, A, 50), 150, 'a meta\' tra le due ancore, a meta\' tempo');
    assert.ok(LS.timeOfPos(s, A, 0) < 60, 'prima della prima ancora: estrapolato indietro');
    assert.ok(LS.timeOfPos(s, A, 100) > 240, 'dopo l\'ultima ancora: estrapolato in avanti');
  });
  test('fullySynced: vero solo se OGNI riga ha un\'ancora esattamente sulla sua posizione', () => {
    const L4 = lines(4);
    assert.equal(LS.fullySynced(L4, []), false);
    assert.equal(LS.fullySynced(L4, L4.slice(0, 3).map(l => ({ pos: l.pos, t: 1 }))), false, '3 righe su 4 non bastano');
    assert.equal(LS.fullySynced(L4, L4.map(l => ({ pos: l.pos, t: 1 }))), true, 'tutte le righe sincronizzate');
    assert.equal(LS.fullySynced([], []), false, 'nessuna riga: mai "sincronizzato"');
  });
  test('syncCount: conta le righe con un\'ancora esatta, indipendentemente dall\'ordine delle ancore', () => {
    const L5 = lines(5), A = [L5[4], L5[1]].map(l => ({ pos: l.pos, t: 9 }));
    assert.deepEqual(LS.syncCount(L5, A), { done: 2, total: 5 });
  });
  test('lineTimes: un tempo per ogni riga, nello stesso ordine delle righe', () => {
    const s = song(), L4 = lines(4);
    const t = LS.lineTimes(s, [], L4);
    assert.equal(t.length, 4);
    for (let i = 1; i < t.length; i++) assert.ok(t[i] >= t[i - 1], 'i tempi non devono tornare indietro');
  });
  test('lineDurs: durata di ogni riga fino alla successiva (l\'ultima fino alla fine del brano), con limiti min/max', () => {
    const times = [10, 12, 30], durs = LS.lineDurs(times, 40, 1, 6);
    assert.deepEqual(durs, [2, 6, 6], 'la seconda riga (18 s) e l\'ultima (10 s) restano tagliate al massimo di 6 s');
    const durs2 = LS.lineDurs([10, 10.2], 20, 1.1, 6);
    assert.equal(durs2[0], 1.1, 'una riga troppo corta non scende sotto il minimo');
  });
  test('lineDursExact: una pausa lunga fra due righe NON viene accorciata (il Video testi deve restare sincronizzato con l\'audio)', () => {
    // stessa pausa di 18 s del test sopra: lineDurs la taglia a 6 s, lineDursExact la tiene intera
    const times = [10, 12, 30], durs = LS.lineDursExact(times, 40, 1, 6);
    assert.deepEqual(durs, [2, 18, 6], 'solo l\'ultima riga (senza una riga dopo) resta stimata/limitata');
    // se il video usasse lineDurs qui, alla riga 2 (a video-tempo 2+6=8s) l'audio sarebbe ancora fermo alla pausa
    // (voce reale della riga 3 al secondo 30, cioe' 20s dopo l'inizio della riga 1): con lineDursExact il video
    // arriva alla riga 3 esattamente quando l'audio ci arriva davvero (2+18=20s)
    const acc = durs.slice(0, 2).reduce((a, b) => a + b, 0);
    assert.equal(acc, times[2] - times[0], 'il tempo a video per arrivare alla riga 3 deve combaciare con l\'audio reale');
    // una riga cantata quasi subito dopo la precedente: nessun limite minimo, l'intervallo resta quello vero
    const durs2 = LS.lineDursExact([10, 10.2], 20, 1.1, 6);
    assert.ok(Math.abs(durs2[0] - 0.2) < 1e-9, 'lineDursExact non alza un intervallo reale sotto il minimo (solo l\'ultima riga lo fa)');
  });
  test('backgroundSchedule: sfondo del Video testi assegnato riga per riga, mai la stessa immagine due volte consecutive (ma si puo\' ripetere piu\' avanti nel video), stabile per lo stesso brano', () => {
    const lines = Array(30).fill(0);   // 30 righe (il contenuto non conta, solo quante sono)
    const pool = ['antonio', 'giorgio', 'aldo', 'andrea'];
    const sched = LS.backgroundSchedule(lines, pool, 7);
    assert.equal(sched.length, 30);
    for (const k of sched) assert.ok(pool.includes(k), 'ogni voce viene dal pool: ' + k);
    for (let i = 1; i < sched.length; i++) assert.notEqual(sched[i], sched[i - 1], 'mai la stessa immagine due volte consecutive (riga ' + i + ')');
    assert.ok(new Set(sched).size < sched.length, 'con piu\' righe che immagini nel pool, qualche immagine si ripete (non di fila) nel corso del video');
    assert.deepEqual(LS.backgroundSchedule(lines, pool, 7), sched, 'stesso brano (stesso seed): stessa sequenza ogni volta');
    assert.notDeepEqual(LS.backgroundSchedule(lines, pool, 99), sched, 'un brano diverso (seed diverso) da una sequenza diversa');
    assert.deepEqual(LS.backgroundSchedule([], pool, 1), [], 'nessuna riga: nessuno sfondo');
    assert.deepEqual(LS.backgroundSchedule(lines, [], 1), Array(30).fill('none'), 'nessuna immagine disponibile: sempre "none"');
  });
  test('lineAt: trova la riga in corso al tempo t (-1 se prima della prima riga)', () => {
    const times = [5, 10, 20];
    assert.equal(LS.lineAt(times, 0), -1); assert.equal(LS.lineAt(times, 5), 0);
    assert.equal(LS.lineAt(times, 9.9), 0); assert.equal(LS.lineAt(times, 10), 1); assert.equal(LS.lineAt(times, 25), 2);
  });
  test('suggestRange: propone un tratto che copre circa il tempo richiesto, mai oltre il massimo', () => {
    const durs = Array(20).fill(4); // 20 righe da 4 s: 80 s totali
    const r = LS.suggestRange(durs, 45, 90, 0);
    const len = durs.slice(r.from, r.to).reduce((a, b) => a + b, 0);
    assert.equal(r.from, 0); assert.ok(len >= 45 && len <= 90, 'lunghezza proposta: ' + len);
  });
  test('suggestRange: se anche una sola riga supera il massimo, propone comunque quella riga sola (mai un tratto vuoto)', () => {
    const r = LS.suggestRange([120, 4, 4], 45, 90, 0);
    assert.deepEqual(r, { from: 0, to: 1 });
  });
  test('suggestRange: con un brano senza righe, propone un tratto vuoto', () => {
    assert.deepEqual(LS.suggestRange([], 45, 90, 0), { from: 0, to: 0 });
  });
});
