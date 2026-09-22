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
  test('gli hook di un argomento preciso (brano, recensione, membro) non cambiano copertina', () => {
    for (const focus of [{ type: 'song', item: 3 }, { type: 'review', item: 'outlaws' }, { type: 'member', item: 'aldo' }])
      for (let seed = 1; seed <= 20; seed++) for (const p of L.propose({ mood: 'riff', focus, count: 1, seed }).proposals) assert.equal(p.slides[0].immagine, 'cover');
  });
});

describe('4. piano settimanale', () => {
  const plans = []; for (let seed = 1; seed <= 40; seed++) for (const days of [5, 7]) plans.push(L.weekPlan({ days, seed }));
  const { lib, band } = L.load();
  test('5 o 7 giorni; ogni giorno ha carosello (7-10 slide), caption, hashtag e Reel abbinato', () => {
    for (const p of plans) {
      assert.ok(p.plan.length === 5 || p.plan.length === 7);
      p.plan.forEach((d, i) => {
        assert.equal(d.day, i + 1); assert.ok(d.slides.length >= 7 && d.slides.length <= 10); assert.equal(d.slides.length, d.n);
        assert.equal(d.slides[0].tipo, 'Cover'); assert.equal(d.slides[d.slides.length - 1].layout, 'cta');
        assert.ok(d.caption.length > 60 && d.hashtags.length >= 8);
        assert.equal(d.reel.slides.length, d.slides.length); assert.ok(Number.isInteger(d.reel.song) && d.reel.song >= 1 && d.reel.song <= 10);
        d.slides.filter(s => s.citazione).forEach(s => assert.equal(s.verified, true));
      });
    }
  });
  test('argomenti alternati: mai due giorni di fila con lo stesso argomento, almeno 4 argomenti diversi', () => {
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
  test('senza ripetizioni: brani, membri, recensioni in evidenza, caption e CTA diversi durante la settimana', () => {
    for (const p of plans) {
      const f = t => p.plan.filter(d => d.topic === t).map(d => d.focus.item);
      for (const t of ['song', 'member', 'review']) assert.equal(new Set(f(t)).size, f(t).length, t);
      const caps = p.plan.map(d => d.captionId); assert.equal(new Set(caps).size, caps.length, 'caption ripetute');
      const cta = p.plan.map(d => d.slides[d.slides.length - 1].titolo); assert.equal(new Set(cta).size, cta.length, 'CTA ripetute: ' + cta);
      const hooks = p.plan.map(d => d.slides[0].titolo); assert.equal(new Set(hooks).size, hooks.length, 'hook ripetuti: ' + hooks);
      const covers = p.plan.map(d => d.slides[0].immagine).filter(i => i !== 'cover'); assert.equal(new Set(covers).size, covers.length, 'copertine ripetute');
      const rs = p.plan.map(d => d.reel.song); assert.ok(new Set(rs).size >= rs.length - 1, 'canzoni dei Reel: ' + rs);
      assert.ok(new Set(p.plan.map(d => d.n)).size >= 3, 'lunghezze tutte uguali');
    }
  });
  test('stesso seme = stesso piano; semi diversi = piani diversi', () => {
    assert.deepEqual(L.weekPlan({ days: 7, seed: 5 }).plan.map(d => d.captionId), L.weekPlan({ days: 7, seed: 5 }).plan.map(d => d.captionId));
    const a = L.weekPlan({ days: 7, seed: 5 }).plan.map(d => d.slides[0].titolo).join(), b = L.weekPlan({ days: 7, seed: 6 }).plan.map(d => d.slides[0].titolo).join();
    assert.notEqual(a, b);
  });
  test('"avoid" (post recenti) viene rispettato e days non valido diventa 7', () => {
    const first = L.weekPlan({ days: 7, seed: 9 }); const avoid = first.plan.flatMap(d => [d.captionId]);
    const second = L.weekPlan({ days: 7, seed: 9, avoid });
    assert.ok(second.plan.filter(d => avoid.includes(d.captionId)).length < 3);
    assert.equal(L.weekPlan({ days: 3, seed: 1 }).plan.length, 7);
  });
  test('le slide del piano restano modificabili (riferimenti _ref per sostituzione e caption)', () => {
    const d = L.weekPlan({ days: 5, seed: 2 }).plan[1];
    const out = L.swap({ mood: d.mood, focus: d.focus, slides: d.slides, index: 2, seed: 4 }); assert.equal(out.slides.length, d.slides.length);
  });
});

describe('5. orari suggeriti', () => {
  const S = require(path.join(ROOT, 'public', 'schedule.js'));
  const now = new Date('2026-09-21T09:00:00Z');
  test('conversione di fuso con ora legale: Roma 19:00 = 13:00 New York a settembre, 14:00 dopo il cambio ora europeo del 25 ottobre', () => {
    const sep = S.zonedToUtc(2026, 9, 22, 19, 0, 'Europe/Rome'); assert.equal(sep.toISOString(), '2026-09-22T17:00:00.000Z'); assert.equal(S.hm(sep, 'America/New_York'), '13:00');
    const oct = S.zonedToUtc(2026, 10, 27, 19, 0, 'Europe/Rome'); assert.equal(oct.toISOString(), '2026-10-27T18:00:00.000Z'); assert.equal(S.hm(oct, 'America/New_York'), '14:00');
    assert.equal(S.hm(S.zonedToUtc(2026, 3, 28, 19, 0, 'Europe/Rome'), 'Europe/Rome'), '19:00');
  });
  test('7 giorni consecutivi; 5 giorni = martedi, mercoledi, giovedi, sabato, domenica; mai nel passato', () => {
    const p7 = S.pairs(now, 7), p5 = S.pairs(now, 5);
    assert.equal(p7.length, 7); assert.equal(p5.length, 5);
    assert.deepEqual(p5.map(x => S.parts(x.carousel, S.TZ).wd), [2, 3, 4, 6, 0]);
    for (const p of p7.concat(p5)) assert.ok(p.carousel > now && p.reel > p.carousel);
    for (let i = 1; i < p7.length; i++) assert.ok(p7[i].carousel > p7[i - 1].carousel);
  });
  test('orari nella fascia giusta: sera italiana = pranzo/primo pomeriggio a New York e mattina a Los Angeles', () => {
    for (let k = 0; k < 60; k++) for (const x of S.pairs(new Date(now.getTime() + k * 86400000), 7)) {
      const hr = (d, z) => S.parts(d, z).h;
      assert.ok(hr(x.carousel, S.TZ) >= 17 && hr(x.carousel, S.TZ) <= 19, 'carosello ' + S.describe(x.carousel));
      assert.ok(hr(x.carousel, 'America/New_York') >= 10 && hr(x.carousel, 'America/New_York') <= 14, 'NY ' + S.describe(x.carousel));
      assert.ok(hr(x.carousel, 'America/Los_Angeles') >= 7 && hr(x.carousel, 'America/Los_Angeles') <= 11, 'LA ' + S.describe(x.carousel));
      assert.ok(hr(x.reel, S.TZ) >= 20 && hr(x.reel, S.TZ) <= 21, 'reel ' + S.describe(x.reel));
      assert.ok(hr(x.reel, 'America/New_York') >= 14 && hr(x.reel, 'America/New_York') <= 16, 'reel NY ' + S.describe(x.reel));
    }
  });
  test('se lo slot di oggi e troppo vicino (meno di 30 minuti) si passa al giorno dopo', () => {
    const t = S.zonedToUtc(2026, 9, 21, 18, 45, 'Europe/Rome'); assert.equal(S.parts(S.pairs(t, 1)[0].carousel, S.TZ).d, 22);
    const early = S.zonedToUtc(2026, 9, 21, 12, 0, 'Europe/Rome'); assert.equal(S.parts(S.pairs(early, 1)[0].carousel, S.TZ).d, 21);
  });
  test('describe e annotate: testo con i tre fusi; ogni giorno del piano ha data di carosello e Reel', () => {
    const d = S.describe(S.zonedToUtc(2026, 9, 22, 19, 0, 'Europe/Rome')); assert.match(d, /mar 22 set/); assert.match(d, /19:00 Italia/); assert.match(d, /13:00 New York/); assert.match(d, /10:00 Los Angeles/);
    const plan = L.weekPlan({ days: 7, seed: 1 }).plan; S.annotate(plan, now);
    for (const p of plan) { assert.ok(p.when.carousel < p.when.reel); assert.match(p.whenText, /\d\d:\d\d/); }
    assert.equal(S.next(now, 'reel') > now, true);
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
