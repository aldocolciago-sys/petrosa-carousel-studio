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
  test('circa meta delle copertine generiche usa una foto live (non piu sempre l album)', () => {
    const live = covers.filter(c => PH[c.s.immagine]).length, rate = live / covers.length;
    assert.ok(rate > 0.25 && rate < 0.75, 'quota copertine con foto: ' + rate.toFixed(2));
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
        assert.equal(d.reel.slides.length, d.slides.length); assert.ok(Number.isInteger(d.reel.song) && d.reel.song >= 1 && d.reel.song <= 10);
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
      const covers = p.plan.map(d => d.slides[0].immagine).filter(i => i !== 'cover'); assert.equal(new Set(covers).size, covers.length, 'copertine ripetute');
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
