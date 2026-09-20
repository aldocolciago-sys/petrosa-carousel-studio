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
