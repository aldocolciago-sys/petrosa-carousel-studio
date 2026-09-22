'use strict';
// Test "veloci" senza server: libreria di caroselli (citazioni, ricette, menzioni), stili grafici, integrita' dei dati.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { ROOT } = require('./helpers');

test('libreria: test completo (citazioni fedeli, tutte le ricette/mood/argomenti, menzioni, swap)', () => {
  const r = spawnSync(process.execPath, ['test-library.js'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout.slice(-1500));
  assert.match(r.stdout, /caroselli assemblati, 0 errori/);
});

describe('coerenza con l\'argomento scelto', () => {
  const L = require(path.join(ROOT, 'library.js'));
  const band = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'band.json'), 'utf8'));
  const gen = (mood, focus, count, seed) => L.propose({ mood, focus, count, seed }).proposals;
  const pubOf = id => band.reviews.find(r => r.id === id).publication;

  test('recensione scelta: le prime due citazioni sono della stessa testata (ogni mood, ricetta e seme)', () => {
    for (const rv of band.reviews.filter(r => ['outlaws', 'pitstop', 'screaming', 'radiocoop'].includes(r.id)))
      for (const mood of ['riff', 'doom', 'fans'])
        for (const count of [7, 8, 9, 10])
          for (let seed = 1; seed <= 6; seed++)
            for (const p of gen(mood, { type: 'review', item: rv.id }, count, seed)) {
              const q = p.slides.filter(s => s.layout === 'quote');
              assert.ok(q.length >= 1, 'serve almeno una citazione');
              // se la testata ha un solo passaggio, la seconda puo' essere di un'altra fonte, ma la prima e' sempre la sua
              assert.equal(q[0].titolo, rv.publication, `prima citazione (${rv.id} ${mood} ${count} #${seed})`);
            }
  });

  test('recensione scelta con piu passaggi: la seconda citazione e\' della stessa testata', () => {
    const p = gen('riff', { type: 'review', item: 'outlaws' }, 8, 9)[0];
    const q = p.slides.filter(s => s.layout === 'quote');
    assert.equal(q[0].titolo, 'Outlaws Of The Sun'); assert.equal(q[1].titolo, 'Outlaws Of The Sun');
    assert.notEqual(q[0].citazione, q[1].citazione);
    assert.ok(q.every(s => s.verified === true), 'citazioni verificate');
  });

  test('membro scelto: solo la sua foto nella scheda e, se esiste, una sua foto dal vivo', () => {
    for (const m of band.members) {
      const photos = new Set(['aldo', 'andrea', 'antonio', 'giorgio']);
      for (const mood of ['riff', 'doom']) for (const count of [7, 8, 9, 10]) for (let seed = 1; seed <= 4; seed++)
        for (const p of gen(mood, { type: 'member', item: m.id }, count, seed)) {
          const others = p.slides.filter(s => photos.has(s.immagine) && s.immagine !== m.photo);
          assert.equal(others.length, 0, `foto di altri membri nel carosello di ${m.id}`);
          assert.ok(p.slides.some(s => s.immagine === m.photo), 'scheda del membro');
          const live = p.slides.filter(s => /^live_/.test(s.immagine));
          const hasLive = fs.existsSync(path.join(ROOT, 'public', 'assets', `live_${m.id}1.jpg`));
          if (hasLive) assert.ok(live.length >= 1 && live.every(s => s.immagine.startsWith('live_' + m.id)), `foto live di ${m.id}`);
          else assert.equal(live.length, 0);
        }
    }
  });
});

describe('qualita\' dei testi', () => {
  const L = require(path.join(ROOT, 'library.js'));
  const lib = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'library.json'), 'utf8'));
  const band = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'band.json'), 'utf8'));
  const focuses = [{ type: 'auto' }, { type: 'song', item: 3 }, { type: 'member', item: 'andrea' }, { type: 'review', item: 'pitstop' }, { type: 'live' }, { type: 'album' }, { type: 'doomcharts' }];

  test('nessun segnaposto {..} rimasto nei testi e nessuna copertina che e\' solo un nome', () => {
    for (const m of lib.moods) for (const f of focuses) for (const count of [7, 8, 9, 10]) for (let seed = 1; seed <= 5; seed++)
      for (const p of L.propose({ mood: m.id, focus: f, count, seed }).proposals) {
        for (const sl of p.slides) assert.doesNotMatch(`${sl.titolo} ${sl.corpo} ${sl.citazione || ''}`, /[{}]/, `segnaposto in ${m.id}/${f.type}`);
        assert.ok(p.slides[0].corpo.length > 15, 'la copertina ha un sottotitolo');
      }
  });

  test('ogni hook ha un invito a scorrere o una promessa (Swipe / verdetto / brano)', () => {
    for (const h of lib.hooks.filter(x => /^h-(riff|doom|psych|intro|road|proof|fans)-[34]$|^h-(song|review|member)-[ab]$/.test(x.id))) assert.match(h.corpo, /Swipe/, h.id);
  });

  test('ogni brano ha una riga di contesto sotto il verso', () => {
    for (let n = 1; n <= 10; n++) {
      const p = L.propose({ mood: 'doom', focus: { type: 'song', item: n }, count: 8, seed: n }).proposals[0];
      const q = p.slides.find(x => x.layout === 'quote' && x.tipo === 'Song');
      assert.ok(q, 'verso del brano ' + n);
      assert.match(q.corpo, new RegExp('^Track ' + String(n).padStart(2, '0') + '\\. .{12,}'), 'contesto brano ' + n);
    }
  });

  test('la CTA e\' sempre del mood scelto', () => {
    for (const m of lib.moods) for (const count of [7, 8, 9, 10]) for (let seed = 1; seed <= 12; seed++)
      for (const p of L.propose({ mood: m.id, focus: { type: 'auto' }, count, seed }).proposals) {
        const c = p.slides[p.slides.length - 1], def = lib.cta.find(x => x.titolo === c.titolo && x.corpo === c.corpo);
        assert.ok(def && def.moods.includes(m.id), `CTA "${c.titolo}" fuori mood ${m.id}`);
      }
  });

  test('memoria dei caroselli recenti: hook, CTA e caption non si ripetono se ci sono alternative', () => {
    const ids = p => p.slides.map(s => s._ref.libId).concat(p.captionId);
    let checked = 0;
    for (const m of lib.moods) for (let seed = 1; seed <= 8; seed++) {
      const a = L.propose({ mood: m.id, focus: { type: 'auto' }, count: 8, seed }).proposals[0];
      const b = L.propose({ mood: m.id, focus: { type: 'auto' }, count: 8, seed: seed + 500, avoid: ids(a) }).proposals[0];
      const hook = x => x.slides[0]._ref.libId, cta = x => x.slides[x.slides.length - 1]._ref.libId;
      assert.notEqual(hook(b), hook(a), 'hook ripetuta'); assert.notEqual(cta(b), cta(a), 'CTA ripetuta'); assert.notEqual(b.captionId, a.captionId, 'caption ripetuta');
      checked++;
    }
    assert.equal(checked, lib.moods.length * 8);
  });

  test('l\'elenco "avoid" non resta fra una richiesta e l\'altra', () => {
    const a = L.propose({ mood: 'riff', focus: { type: 'auto' }, count: 8, seed: 5 }).proposals[0];
    const ids = a.slides.map(s => s._ref.libId);
    L.propose({ mood: 'riff', focus: { type: 'auto' }, count: 8, seed: 6, avoid: ids });
    const c = L.propose({ mood: 'riff', focus: { type: 'auto' }, count: 8, seed: 5 }).proposals[0];
    assert.deepEqual(c.slides.map(s => s._ref.libId), ids, 'stesso seme, stesso carosello');
  });
});

describe('intera band e singoli membri', () => {
  const L = require(path.join(ROOT, 'library.js'));
  const band = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'band.json'), 'utf8'));
  const PH = band.members.map(m => m.photo);
  const gen = (mood, focus, count, seed) => L.propose({ mood, focus, count, seed }).proposals;

  test('band: tutti e 4 i membri, una slide con foto ciascuno, nome e strumento nel titolo', () => {
    for (const mood of ['riff', 'doom', 'psych', 'intro', 'road', 'proof', 'fans']) for (const count of [7, 8, 9, 10]) for (let seed = 1; seed <= 5; seed++)
      for (const p of gen(mood, { type: 'band' }, count, seed)) {
        assert.equal(p.slides.length, count);
        for (const m of band.members) {
          const own = p.slides.filter(s => s.immagine === m.photo);
          assert.equal(own.length, 1, `${m.id} deve avere una sola slide (${mood}/${count}/${seed})`);
          assert.ok(own[0].titolo.includes(m.name) && own[0].titolo.toLowerCase().includes(m.role.replace(/\s*\(.*\)/, '').toLowerCase()), 'titolo con nome e strumento');
          assert.ok(p.caption.includes(m.name), `caption senza ${m.name}`);
        }
        // la CTA finale mostra sempre l'album (vedi buildCta): l'apertura non deve piu' ripeterlo (dedupeImages in
        // library.js), ne' mostrare la foto di un solo membro (qui si parla di tutta la band, non di una persona) -
        // resta "nessuna immagine" o la foto di gruppo, se libera.
        assert.notEqual(p.slides[0].immagine, 'cover', `copertina "band" ancora sull'album (${mood}/${count}/${seed}): duplicato con la CTA finale`);
        assert.ok(!band.members.some(m => m.photo === p.slides[0].immagine), 'copertina "band" con la foto di un solo membro');
        assert.equal(p.slides.at(-1).layout, 'cta');
        assert.ok(p.slides.every(s => s.verified !== false));
      }
  });

  test('band: la sostituzione di una slide-membro cambia il testo ma non il membro', () => {
    const p = gen('doom', { type: 'band' }, 8, 3)[0];
    p.slides.forEach((s, i) => {
      if (!s._ref || s._ref.slot !== 'band' || !s._ref.member) return;
      for (let k = 1; k <= 4; k++) {
        const r = L.swap({ mood: 'doom', focus: { type: 'band' }, slides: JSON.parse(JSON.stringify(p.slides)), index: i, seed: k });
        assert.equal(r.slides[i].immagine, s.immagine, 'stesso membro'); assert.ok(r.slides[i].titolo.includes(band.members.find(m => m.photo === s.immagine).name));
        for (const m of band.members) assert.ok(r.caption.includes(m.name), 'caption completa dopo lo swap');
      }
    });
  });

  test('singolo membro: nome nella copertina, sua foto una volta, foto live solo sue, caption non da "band"', () => {
    for (const m of band.members) for (const mood of ['riff', 'doom', 'proof']) for (const count of [7, 8, 9, 10]) for (let seed = 1; seed <= 4; seed++)
      for (const p of gen(mood, { type: 'member', item: m.id }, count, seed)) {
        assert.ok(`${p.slides[0].titolo} ${p.slides[0].corpo}`.includes(m.name.split(' ')[0]), `hook di ${m.id}: ${p.slides[0].titolo}`);
        assert.equal(p.slides.filter(s => s.immagine === m.photo).length, 1, 'scheda una volta');
        assert.equal(p.slides.filter(s => PH.includes(s.immagine) && s.immagine !== m.photo).length, 0, 'foto di altri');
        assert.ok(!/Four musicians\. One wall of sound\./.test(p.caption), 'caption della band nel carosello del singolo');
      }
  });
});

describe('stili grafici (public/styles.js)', () => {
  const win = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/styles.js'), 'utf8'), { window: win, Math, Object, Array, Number, String, JSON, Date, console });
  const S = win.Styles;
  test('9 sfondi, 10 palette, 8 font, ognuno completo', () => {
    assert.equal(Object.keys(S.BG).length, 9); assert.equal(Object.keys(S.PALETTES).length, 10); assert.equal(Object.keys(S.FONTS).length, 8);
    for (const [k, p] of Object.entries(S.PALETTES)) for (const c of ['bg', 'a1', 'a2', 'a3', 'a4', 'text', 'soft']) assert.match(p[c], /^#[0-9a-f]{6}$/i, `${k}.${c}`);
    for (const [k, f] of Object.entries(S.FONTS)) for (const c of ['display', 'body', 'quote', 'dw', 'qs', 'caps']) assert.ok(f[c] !== undefined, `${k}.${c}`);
    for (const [k, b] of Object.entries(S.BG)) assert.equal(typeof b.fn, 'function', k);
  });
  test('pick: sempre valori validi, deterministico col seed, varia col seed', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 300; seed++) {
      const t = S.pick({ slides: [{ titolo: 'desert highway van', corpo: 'doom fuzz' }], mood: ['riff', 'doom', 'psych', 'intro', 'road', 'proof', 'fans'][seed % 7], seed });
      const v = S.valid(t); for (const k of ['bg', 'pal', 'font', 'photo', 'hook']) assert.ok(v[k], `${k}=${t[k]}`);
      seen.add(t.bg + t.pal + t.font);
    }
    assert.ok(seen.size > 40, 'poca varieta\': ' + seen.size);
    assert.deepEqual(S.pick({ mood: 'doom', seed: 7 }), S.pick({ mood: 'doom', seed: 7 }));
  });
  test('pick evita di ripetere lo stile precedente', () => {
    let same = 0; for (let seed = 1; seed <= 200; seed++) { const a = S.pick({ mood: 'doom', seed }); const b = S.pick({ mood: 'doom', seed: seed + 1000, prev: a }); if (b.bg === a.bg && b.pal === a.pal) same++; }
    assert.ok(same < 10, 'ripetizioni: ' + same);
  });
  test('valid scarta i valori sconosciuti (risposta AI sbagliata)', () => {
    const v = S.valid({ bg: 'boh', pal: 'ember', font: 'nope', photo: 'sepia', hook: 'frame' });
    assert.equal(v.bg, undefined); assert.equal(v.pal, 'ember'); assert.equal(v.font, undefined); assert.equal(v.photo, undefined); assert.equal(v.hook, 'frame');
  });
});

describe('integrita\' dei dati', () => {
  const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
  test('audio.json coerente con i file in public/assets/clips', () => {
    const a = read('audio.json');
    for (let n = 1; n <= 10; n++) {
      const s = a.songs[n]; assert.ok(s, 'brano ' + n);
      const f = path.join(ROOT, 'public/assets/clips', s.file); assert.ok(fs.existsSync(f), s.file);
      assert.ok(fs.statSync(f).size > 500000 && fs.statSync(f).size < 20 * 1024 * 1024, s.file + ' dimensione');
      assert.ok(s.vStart >= 0 && s.vEnd > s.vStart && s.vEnd <= s.dur);
    }
  });
  test('audio-sync.json: punti ordinati e dentro la durata', () => {
    const a = read('audio.json'), sy = read('audio-sync.json');
    for (const [n, pts] of Object.entries(sy)) { if (n.startsWith('_')) continue; assert.ok(Array.isArray(pts)); for (const p of pts) assert.ok(p.pos >= 0 && p.t >= 0 && p.t <= a.songs[n].dur, `brano ${n}`); }
  });
  test('tags.json: handle confermati hanno un handle; hashtag senza # e senza spazi', () => {
    const t = read('tags.json');
    for (const b of [...t.similarBands, ...t.community]) { if (b.confirmed) assert.ok(b.handle, b.name + ' confermato senza handle'); if (b.hashtag) assert.match(b.hashtag, /^[a-z0-9_]+$/i, b.name); }
  });
  test('library.json: id univoci, mood validi, layout noti, immagini esistenti', () => {
    const lib = read('library.json'); const moods = new Set(lib.moods.map(m => m.id).concat('all'));
    const layouts = new Set(['hook', 'quote', 'stat', 'photo', 'text', 'cta']);
    const ids = new Set();
    for (const k of ['hooks', 'quotes', 'info', 'band', 'cta', 'captions', 'analyses']) for (const it of lib[k]) {
      assert.ok(it.id, k + ' senza id'); assert.ok(!ids.has(it.id), 'id duplicato ' + it.id); ids.add(it.id);
      for (const m of it.moods || []) assert.ok(moods.has(m), `${it.id}: mood ${m}`);
      if (it.layout) assert.ok(layouts.has(it.layout), `${it.id}: layout ${it.layout}`);
      if (it.immagine && it.immagine !== 'none' && !/[{]/.test(it.immagine)) assert.ok(fs.existsSync(path.join(ROOT, 'public/assets', it.immagine + '.jpg')), `${it.id}: immagine ${it.immagine}`);
    }
    for (const r of lib.recipes) { assert.ok(r.n >= 7 && r.n <= 10 && r.steps.length === r.n, r.id); assert.equal(r.steps[0].slot, 'hook'); assert.equal(r.steps.at(-1).slot, 'cta'); }
    for (const n of [7, 8, 9, 10]) assert.ok(lib.recipes.filter(r => r.n === n).length >= 2, 'ricette da ' + n);
  });
  test('nessun file con nome che Vercel scambia per entrypoint (server.js / app.js)', () => {
    for (const p of ['server.js', 'app.js', 'index.js', 'public/app.js', 'public/server.js']) assert.ok(!fs.existsSync(path.join(ROOT, p)), p);
    assert.ok(fs.existsSync(path.join(ROOT, 'api/index.js')));
  });
  test('vercel.json valido e include i dati', () => {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    assert.equal(v.outputDirectory, 'public'); assert.match(v.functions['api/index.js'].includeFiles, /data/);
  });
});
