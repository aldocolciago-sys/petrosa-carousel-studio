'use strict';
// Test dell'API e del server (senza browser): ogni endpoint, ogni tipo di argomento, PostFast, AI, accesso Google/password.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('./helpers');

const FOCUS_TYPES = () => [{ type: 'auto' }, ...Array.from({ length: 10 }, (_, i) => ({ type: 'song', item: i + 1 })), { type: 'review', item: 'outlaws' }, { type: 'member', item: 'aldo' }, { type: 'band' }, { type: 'album' }, { type: 'doomcharts' }, { type: 'live' }, { type: 'custom', text: 'Friday night\nVolume up.' }];

describe('senza chiavi (solo libreria)', () => {
  let app;
  before(async () => { app = await H.startApp({}); });
  after(() => app.stop());

  test('config: nessuna chiave attiva', async () => {
    const r = await H.get(app, '/api/config');
    assert.equal(r.status, 200); assert.equal(r.body.anthropic, false); assert.equal(r.body.postfast, false); assert.equal(r.body.user, null);
  });
  test('dati band: 10 brani, 4 membri, recensioni', async () => {
    const d = (await H.get(app, '/api/data')).body;
    assert.equal(d.songs.length, 10); assert.equal(d.members.length, 4); assert.ok(d.reviews.length >= 5);
    assert.ok(d.members.every(m => m.id && m.name && m.photo));
  });
  test('libreria: catalogo con mood e ricette da 7 a 10 slide', async () => {
    const c = (await H.get(app, '/api/library')).body;
    assert.ok(c.moods.length >= 7); for (const n of [7, 8, 9, 10]) assert.ok(c.recipes.some(r => r.n === n), 'ricetta ' + n);
  });
  for (const f of FOCUS_TYPES()) {
    test(`propose: argomento ${f.type}${f.item ? ' ' + f.item : ''} (tutti i mood, 7-10 slide)`, async () => {
      const moods = (await H.get(app, '/api/library')).body.moods.map(m => m.id);
      for (const mood of moods) for (const count of [7, 10]) {
        const r = await H.post(app, '/api/propose', { mood, focus: f, count, seed: 42 });
        assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
        assert.equal(r.body.proposals.length, 3);
        for (const p of r.body.proposals) {
          assert.equal(p.slides.length, count);
          assert.equal(p.slides[0].tipo, 'Cover'); assert.equal(p.slides.at(-1).layout, 'cta');
          assert.ok(p.caption.length > 40 && p.hashtags.length >= 10);
          assert.ok(p.slides.every(s => s.titolo && s.servizio && s.layout));
          assert.ok(p.slides.filter(s => s.citazione).every(s => s.verified === true), 'citazione non verificata');
        }
      }
    });
  }
  test('propose: brano scelto -> versi solo di quel brano + analisi', async () => {
    const title = (await H.get(app, '/api/data')).body.songs.find(x => x.n === 7).title;
    const r = await H.post(app, '/api/propose', { mood: 'doom', focus: { type: 'song', item: 7 }, count: 8, seed: 3 });
    for (const p of r.body.proposals) {
      assert.ok(p.slides.filter(s => s.tipo === 'Song').length >= 1);
      assert.ok(p.slides.filter(s => s.tipo === 'Song').every(s => s.fonte === title));
      assert.equal(p.slides.filter(s => s.tipo === 'Analysis').length, 1);
    }
  });
  test('propose: live -> foto live, durata set 30 min - 1h30, hashtag live', async () => {
    const r = await H.post(app, '/api/propose', { mood: 'riff', focus: { type: 'live' }, count: 8, seed: 11 });
    for (const p of r.body.proposals) {
      const live = p.slides.filter(s => s.tipo === 'Live');
      assert.ok(live.length >= 2); assert.ok(live.some(s => /live_/.test(s.immagine)));
      assert.match(JSON.stringify(live), /1h30/); assert.match(p.caption, /1h30/); assert.ok(p.hashtags.includes('livemusic'));
    }
  });
  test('propose: testo libero compare in una slide', async () => {
    const r = await H.post(app, '/api/propose', { mood: 'riff', focus: { type: 'custom', text: 'Special Notice\nSomething unique here.' }, count: 8, seed: 1 });
    assert.ok(r.body.proposals[0].slides.some(s => s.titolo === 'Special Notice'));
  });
  test('propose: nessuna menzione @ non confermata', async () => {
    const t = (await H.get(app, '/api/tags')).body;
    const ok = new Set([...t.similarBands, ...t.community].filter(b => b.handle && b.confirmed).map(b => b.handle.replace(/^@/, '').toLowerCase()));
    const r = await H.post(app, '/api/propose', { mood: 'fans', focus: { type: 'auto' }, count: 9, seed: 5 });
    for (const p of r.body.proposals) for (const h of [...p.menzioni, ...p.slides.flatMap(s => s.tag || [])]) assert.ok(ok.has(h.toLowerCase()), h);
  });
  test('swap: ogni slide sostituibile (tranne analisi/custom)', async () => {
    const p = (await H.post(app, '/api/propose', { mood: 'doom', count: 8, seed: 5 })).body.proposals[0];
    for (let i = 1; i < 8; i++) {
      const r = await H.post(app, '/api/swap', { mood: 'doom', focus: { type: 'auto' }, slides: p.slides, index: i, seed: 9 + i });
      assert.equal(r.status, 200, `slide ${i}: ` + JSON.stringify(r.body)); assert.equal(r.body.slides.length, 8);
    }
  });
  test('swap: slide modificata a mano -> errore chiaro', async () => {
    const p = (await H.post(app, '/api/propose', { mood: 'doom', count: 8, seed: 5 })).body.proposals[0];
    const s = JSON.parse(JSON.stringify(p.slides)); delete s[2]._ref;
    const r = await H.post(app, '/api/swap', { mood: 'doom', slides: s, index: 2 });
    assert.notEqual(r.status, 200); assert.match(JSON.stringify(r.body), /sostituibile/);
  });
  test('caption: nuova caption dalla libreria', async () => {
    const p = (await H.post(app, '/api/propose', { mood: 'psych', count: 8, seed: 2 })).body.proposals[0];
    const r = await H.post(app, '/api/caption', { mood: 'psych', slides: p.slides, seed: 77 });
    assert.equal(r.status, 200); assert.ok(r.body.caption && r.body.hashtags.length);
  });
  test('caption: "Altra caption" non ripropone mai quella attuale', async () => {
    for (const mood of ['riff', 'doom', 'psych', 'intro', 'road', 'proof', 'fans']) {
      const p = (await H.post(app, '/api/propose', { mood, count: 8, seed: 21 })).body.proposals[0];
      let cur = p.captionId; assert.ok(cur);
      for (let i = 0; i < 12; i++) { const r = await H.post(app, '/api/caption', { mood, slides: p.slides, seed: 100 + i, exclude: cur }); assert.notEqual(r.body.captionId, cur, mood); cur = r.body.captionId; }
    }
  });
  test('funzioni con chiave: errori chiari e nessun crash', async () => {
    for (const [p, b] of [['/api/generate', { focus: 'auto', slides: 8, mood: 'riff' }], ['/api/ai-caption', { slides: [] }], ['/api/scan-web', {}], ['/api/find-handle', { name: 'X' }]]) {
      const r = await H.post(app, p, b); assert.ok(r.status >= 400 || r.body.demo === true, p + ' ' + r.status);
    }
    for (const [p, b] of [['/api/social/upload', { image: H.TINY_JPEG }], ['/api/social/publish', {}], ['/api/social/upload-url', {}]]) { const r = await H.post(app, p, b); assert.ok(r.status >= 400, p); }
    assert.ok((await H.get(app, '/api/social/accounts')).status >= 400);
  });
  test('tag: lettura e salvataggio', async () => {
    const t = (await H.get(app, '/api/tags')).body;
    assert.ok(t.similarBands.length > 5);
    t.similarBands[0].hashtag = 'testhash';
    assert.equal((await H.post(app, '/api/tags', { tags: t })).status, 200);
    assert.equal((await H.get(app, '/api/tags')).body.similarBands[0].hashtag, 'testhash');
    assert.notEqual((await H.post(app, '/api/tags', { tags: { nope: 1 } })).status, 200);
  });
  test('recensioni: aggiunta di una recensione trovata online', async () => {
    const before = (await H.get(app, '/api/data')).body.reviews.length;
    assert.equal((await H.post(app, '/api/reviews', { review: { id: 'web-x', publication: 'Mock', author: 'A', verdict: 'V', quote: 'Q', url: 'https://e.com/x' } })).status, 200);
    assert.equal((await H.get(app, '/api/data')).body.reviews.length, before + 1);
  });
  test('audio: 10 brani con file, durata e finestra vocale; Range supportato', async () => {
    const a = (await H.get(app, '/api/audio')).body;
    assert.equal(a.songs.length, 10);
    for (const s of a.songs) {
      assert.ok(s.file && s.dur > 60 && s.vStart < s.vEnd && s.vEnd <= s.dur && s.lyrics.length > 20, 'brano ' + s.n);
      const r = await fetch(app.url + '/assets/clips/' + s.file, { headers: { range: 'bytes=0-99' } });
      assert.equal(r.status, 206); assert.equal(r.headers.get('content-type'), 'audio/mpeg'); assert.equal((await r.arrayBuffer()).byteLength, 100);
    }
  });
  test('foto live: catalogo completo (file, menu editor, prompt AI, membri, mood, qualita)', async () => {
    const photos = JSON.parse(fs.readFileSync(path.join(H.ROOT, 'data/photos.json'), 'utf8'));
    const html = fs.readFileSync(path.join(H.ROOT, 'public/index.html'), 'utf8');
    const band = JSON.parse(fs.readFileSync(path.join(H.ROOT, 'data/band.json'), 'utf8'));
    const ids = band.members.map(m => m.id), MOODS = ['doom', 'riff', 'psych', 'intro', 'road', 'proof', 'fans'];
    assert.ok(photos.length >= 50);
    assert.equal(new Set(photos.map(p => p.id)).size, photos.length);
    for (const p of photos) {
      assert.ok(fs.existsSync(path.join(H.ROOT, 'public/assets', p.id + '.jpg')), 'file ' + p.id);
      assert.ok(html.includes(`value="${p.id}"`), 'menu editor ' + p.id);
      assert.ok(p.members.length && p.members.every(m => ids.includes(m)), 'membri ' + p.id);
      assert.ok(p.moods.length && p.moods.every(m => MOODS.includes(m)), 'mood ' + p.id);
      assert.ok([1, 2, 3].includes(p.q) && ['solo', 'duo', 'group', 'brand'].includes(p.kind), 'campi ' + p.id);
    }
    for (const id of ids) assert.ok(photos.filter(p => p.kind === 'solo' && p.members[0] === id && p.q >= 2).length >= 3, 'foto solo ' + id);
    for (const m of MOODS) assert.ok(photos.filter(p => p.q >= 2 && p.moods.includes(m)).length >= 5, 'mood ' + m);
  });
  test('immagini: ogni chiave di IMG_KEYS esiste come /assets/<chiave>.jpg', async () => {
    const src = fs.readFileSync(path.join(H.ROOT, 'public/render.js'), 'utf8');
    const keys = [...(/IMG_KEYS = \[([^\]]+)\]/.exec(src)[1]).matchAll(/'([^']+)'/g)].map(m => m[1]);
    assert.ok(keys.length >= 9);
    for (const k of keys) { const r = await fetch(`${app.url}/assets/${k}.jpg`); assert.equal(r.status, 200, k); assert.equal(r.headers.get('content-type'), 'image/jpeg'); assert.ok((await r.arrayBuffer()).byteLength > 5000, k); }
  });
  test('immagini: tutte le opzioni dell\'editor e dell\'AI hanno un file', async () => {
    const html = fs.readFileSync(path.join(H.ROOT, 'public/index.html'), 'utf8');
    const sel = /id="e_immagine">(.*?)<\/select>/s.exec(html)[1];
    const vals = [...sel.matchAll(/value="([^"]+)"/g)].map(m => m[1]).filter(v => v !== 'none');
    assert.ok(vals.length >= 60);
    for (const v of vals) assert.equal((await fetch(`${app.url}/assets/${v}.jpg`)).status, 200, v);
    const h = fs.readFileSync(path.join(H.ROOT, 'core/handler.js'), 'utf8');
    const en = /immagine: \{ type: 'string', enum: \[([^\]]+)\]/.exec(h)[1].match(/'([^']+)'/g).map(x => x.slice(1, -1)).filter(v => v !== 'none').concat(JSON.parse(fs.readFileSync(path.join(H.ROOT, 'data/photos.json'), 'utf8')).map(p => p.id));
    assert.deepEqual([...en].sort(), [...vals].sort());
  });
  test('static: pagine e script principali, 404 e path traversal', async () => {
    for (const p of ['/', '/index.html', '/styles.js', '/render.js', '/studio.js', '/reel.js']) assert.equal((await H.get(app, p)).status, 200, p);
    assert.equal((await H.get(app, '/non-esiste.png')).status, 404);
    for (const p of ['/../core/handler.js', '/..%2fcore%2fhandler.js', '/%2e%2e/data/tags.json']) assert.notEqual((await H.get(app, p)).status, 200, p);
  });
});

describe('con Anthropic e PostFast (mock)', () => {
  let app, ant, pf;
  before(async () => {
    ant = await H.startMockAnthropic(); pf = await H.startMockPostfast();
    app = await H.startApp({ ANTHROPIC_API_KEY: 'test-anthropic-key', ANTHROPIC_BASE_URL: ant.url, POSTFAST_API_KEY: 'test-pf-key', POSTFAST_API_URL: pf.url });
  });
  after(() => { app.stop(); ant.close(); pf.close(); });

  test('config: chiavi attive', async () => {
    const r = (await H.get(app, '/api/config')).body; assert.equal(r.anthropic, true); assert.equal(r.postfast, true);
  });
  test('generate: tool forzato, citazioni verificate, menzioni e tag ripuliti, stile', async () => {
    const r = await H.post(app, '/api/generate', { focus: 'auto', slides: 9, mood: 'riff', notes: 'nota di prova', avoid: ['vecchio'] });
    assert.equal(r.status, 200, JSON.stringify(r.body)); const o = r.body;
    assert.equal(o.slides.length, 9); assert.equal(o.demo, false);
    assert.equal(o.slides[1].verified, true, 'verso vero verificato'); assert.equal(o.slides[2].verified, false, 'citazione inventata segnalata');
    assert.ok(!o.menzioni.includes('totally_fake_account') && o.menzioni.includes('kyussworld'));
    assert.ok(!/@totally_fake_account/.test(o.caption)); assert.ok(o.slides.every(s => !(s.tag || []).includes('not_a_confirmed_handle')));
    assert.ok(['petrosa', 'roadburnchronicles', 'stonerrock', 'doommetal', 'stonerdoom'].every(h => o.hashtags.includes(h)) && o.hashtags.every(h => !/[#\s]/.test(h)));
    assert.equal(o.stile.sfondo, 'dunes');
    const c = ant.calls.at(-1).body;
    assert.deepEqual(c.tool_choice, { type: 'tool', name: 'crea_carosello' });
    assert.match(JSON.stringify(c.messages), /nota di prova/); assert.match(JSON.stringify(c.messages), /vecchio/);
    assert.match(JSON.stringify(c.system), /live_aldo6/); assert.match(JSON.stringify(c.system), /live_giorgio7/); assert.match(JSON.stringify(c.system), /LIVE/);
  });
  test('generate: prompt con angolo, arco, pubblico USA/Nord Europa e formule vietate; piano obbligatorio nello schema', async () => {
    await H.post(app, '/api/generate', { focus: 'auto', slides: 8, mood: 'riff' });
    const c = ant.calls.at(-1).body, sys = JSON.stringify(c.system);
    assert.match(sys, /piano/); assert.match(sys, /ANGOLO|angolo narrativo/); assert.match(sys, /Arco narrativo/);
    assert.match(sys, /USA e nel Nord Europa/); assert.match(sys, /Formule VIETATE/); assert.match(sys, /Check it out/); assert.match(sys, /Ortografia americana/);
    const t = c.tools[0].input_schema;
    assert.ok(t.required.includes('piano')); assert.deepEqual(t.properties.piano.required, ['angolo', 'tesi', 'arco']);
    assert.equal(Object.keys(t.properties)[0], 'piano');
  });
  test('generate: avvisi automatici (formule generiche, foto di un altro membro) e nessun falso allarme sul testo pulito', async () => {
    const ok = await H.post(app, '/api/generate', { focus: 'auto', slides: 8, mood: 'riff' });
    assert.deepEqual(ok.body.avvisi, []);
    const r = await H.post(app, '/api/generate', { focus: 'auto', slides: 8, mood: 'riff', notes: 'QUALITY-TEST' });
    const av = r.body.avvisi.join(' | ');
    assert.match(av, /formula generica "check it out"/); assert.match(av, /la foto e' di Aldo ma il testo parla di Giorgio/);
  });
  test('generate: ogni argomento arriva al prompt (brano con testo, live, recensione, membro, album, Doom Charts)', async () => {
    const expect = { song: /Revenant[\s\S]*<<<[\s\S]*>>>/, review: /recensione\/articolo di/, member: /Focus del carosello: Aldo/, band: /INTERA BAND/, album: /Roadburn Chronicles nel suo insieme/, doomcharts: /Doom Charts/i, live: /30 minuti fino a 1h30/, auto: /scegli tu/i };
    for (const [focus, re] of Object.entries(expect)) {
      const item = focus === 'song' ? 7 : focus === 'review' ? 'outlaws' : focus === 'member' ? 'aldo' : undefined;
      const r = await H.post(app, '/api/generate', { focus, item, slides: 7, mood: 'doom' });
      assert.equal(r.status, 200, focus + JSON.stringify(r.body)); assert.match(JSON.stringify(ant.calls.at(-1).body.messages), re, focus);
    }
  });
  test('generate: intera band, la caption nomina tutti e quattro e ogni foto compare una volta', async () => {
    const r = await H.post(app, '/api/generate', { focus: 'band', slides: 8, mood: 'doom' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const cap = r.body.caption.toLowerCase();
    for (const n of ['antonio', 'aldo', 'andrea', 'giorgio']) assert.ok(cap.includes(n), 'caption senza ' + n);
    const photos = r.body.slides.map(s => s.immagine).filter(i => ['antonio', 'aldo', 'andrea', 'giorgio'].includes(i));
    assert.equal(new Set(photos).size, photos.length, 'foto ripetute');
    assert.notEqual(['antonio', 'aldo', 'andrea', 'giorgio'].includes(r.body.slides[0].immagine), true, 'copertina = album');
  });
  test('generate: con un brano scelto, versi di altri brani vengono segnalati', async () => {
    const r = await H.post(app, '/api/generate', { focus: 'song', item: 7, slides: 7, mood: 'doom' });
    assert.equal(r.body.slides[1].verified, false, 'verso di S.U.R.E. con focus Revenant');
  });
  test('generate: numero slide 7-10 rispettato nel prompt', async () => {
    for (const n of [7, 8, 9, 10]) { const r = await H.post(app, '/api/generate', { focus: 'auto', slides: n, mood: 'riff' }); assert.equal(r.body.slides.length, n); }
  });
  test('ai-caption: caption nuova ripulita', async () => {
    const r = await H.post(app, '/api/ai-caption', { slides: [{ tipo: 'Cover', titolo: 'T', corpo: 'C' }], mood: 'riff', avoid: [] });
    assert.equal(r.status, 200); assert.match(r.body.caption, /AI-only caption/); assert.deepEqual(r.body.menzioni, ['kyussworld']);
  });
  test('scan-web e find-handle', async () => {
    const s = await H.post(app, '/api/scan-web', {}); assert.equal(s.status, 200);
    assert.equal(s.body.reviews[0].publication, 'Mock Mag'); assert.equal(s.body.bands[0].name, 'Mock Band');
    const f = await H.post(app, '/api/find-handle', { name: 'Some Band' }); assert.equal(f.status, 200); assert.equal(f.body.handle, 'testband');
  });
  test('errore dell\'API Anthropic -> messaggio, non crash', async () => {
    const bad = await H.startApp({ ANTHROPIC_API_KEY: 'sbagliata', ANTHROPIC_BASE_URL: ant.url });
    try { const r = await H.post(bad, '/api/generate', { focus: 'auto', slides: 8 }); assert.ok(r.status >= 400); assert.match(JSON.stringify(r.body), /chiave/); } finally { bad.stop(); }
  });

  test('PostFast: account (i disattivati sono nascosti)', async () => {
    const a = (await H.get(app, '/api/social/accounts')).body;
    assert.deepEqual(a.map(x => x.platform), ['INSTAGRAM', 'TIKTOK']); assert.equal(a[0].username, 'petrosa');
  });
  test('PostFast: upload slide + caricamento non valido', async () => {
    const r = await H.post(app, '/api/social/upload', { image: H.TINY_JPEG }); assert.equal(r.status, 200); assert.ok(r.body.key);
    assert.ok(pf.state.puts.some(p => p.key === r.body.key && p.type === 'image/jpeg' && p.size > 50));
    assert.notEqual((await H.post(app, '/api/social/upload', { image: 'non-e-una-immagine' })).status, 200);
  });
  test('PostFast: carosello (bozza, programmato, subito) con controlli Instagram/TikTok', async () => {
    const acc = [{ id: 'acc-ig', platform: 'INSTAGRAM' }, { id: 'acc-tt', platform: 'TIKTOK' }];
    for (const mode of ['draft', 'schedule', 'now']) {
      const r = await H.post(app, '/api/social/publish', { caption: 'Cap #x', keys: ['a', 'b', 'c'], accounts: acc, mode, date: '2030-01-01T10:00:00.000Z' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const b = pf.state.posts.at(-1);
      assert.equal(b.status, mode === 'draft' ? 'DRAFT' : 'SCHEDULED');
      assert.deepEqual(b.posts[0].mediaItems.map(m => [m.key, m.type, m.sortOrder]), [['a', 'IMAGE', 0], ['b', 'IMAGE', 1], ['c', 'IMAGE', 2]]);
      assert.equal(b.controls.instagramPublishType, 'TIMELINE'); assert.equal(b.controls.tiktokIsDraft, mode === 'draft');
      assert.equal(b.controls.tiktokAutoAddMusic, mode !== 'draft');
      assert.equal(b.posts.length, 2); assert.equal(!!b.posts[0].scheduledAt, mode !== 'draft');
      if (mode === 'schedule') assert.equal(b.posts[0].scheduledAt, '2030-01-01T10:00:00.000Z');
    }
  });
  test('PostFast: Reel video (URL firmato, upload diretto con CORS, REEL)', async () => {
    const u = await H.post(app, '/api/social/upload-url', { contentType: 'video/mp4' });
    assert.equal(u.status, 200); assert.ok(u.body.signedUrl && u.body.key);
    assert.equal(pf.state.signed.at(-1).contentType, 'video/mp4');
    const put = await fetch(u.body.signedUrl, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: Buffer.alloc(2048, 1) });
    assert.equal(put.status, 200);
    const r = await H.post(app, '/api/social/publish', { video: true, caption: 'c', keys: [u.body.key], accounts: [{ id: 'acc-ig', platform: 'INSTAGRAM' }, { id: 'acc-tt', platform: 'TIKTOK' }], mode: 'now' });
    assert.equal(r.status, 200); const b = pf.state.posts.at(-1);
    assert.deepEqual(b.posts[0].mediaItems.map(m => m.type), ['VIDEO']); assert.equal(b.controls.instagramPublishType, 'REEL'); assert.equal(b.controls.tiktokAutoAddMusic, false);
  });
  test('PostFast: controlli di validita\'', async () => {
    const acc = [{ id: 'acc-ig', platform: 'INSTAGRAM' }];
    const bad = [
      [{ caption: 'c', keys: [], accounts: acc, mode: 'draft' }, /Nessuna slide/],
      [{ caption: 'c', keys: ['a'], accounts: acc, mode: 'draft' }, /2 a 10/],
      [{ caption: 'c', keys: Array(11).fill('k'), accounts: acc, mode: 'draft' }, /2 a 10/],
      [{ caption: 'c', keys: ['a', 'b'], accounts: [], mode: 'draft' }, /account/],
      [{ caption: 'c', video: true, keys: ['a', 'b'], accounts: acc, mode: 'draft' }, /solo video/],
      [{ caption: 'c', video: true, keys: [], accounts: acc, mode: 'draft' }, /Nessun video/]
    ];
    for (const [b, re] of bad) { const r = await H.post(app, '/api/social/publish', b); assert.ok(r.status >= 400, JSON.stringify(b)); assert.match(JSON.stringify(r.body), re); }
  });
  test('PostFast: errore del servizio -> messaggio', async () => {
    const bad = await H.startApp({ POSTFAST_API_KEY: 'sbagliata', POSTFAST_API_URL: pf.url });
    try { const r = await H.get(bad, '/api/social/accounts'); assert.ok(r.status >= 400); assert.match(JSON.stringify(r.body), /PostFast 401/); } finally { bad.stop(); }
  });
});

describe('accesso con Google', () => {
  let app, goog;
  const ID = 'client-id-test';
  before(async () => {
    goog = await H.startMockGoogle(ID);
    app = await H.startApp({ GOOGLE_CLIENT_ID: ID, GOOGLE_CLIENT_SECRET: 'sec', GOOGLE_TOKEN_URL: goog.url + '/token', GOOGLE_AUTH_URL: goog.url + '/auth', SESSION_SECRET: 'abc' });
  });
  after(() => { app.stop(); goog.close(); });
  const cookieOf = r => (r.headers.getSetCookie() || []).map(c => c.split(';')[0]).join('; ');

  async function login(code) {
    const l = await H.get(app, '/api/auth/login'); assert.equal(l.status, 302);
    const loc = new URL(l.headers.get('location')); assert.equal(loc.searchParams.get('client_id'), ID);
    const state = loc.searchParams.get('state');
    return H.get(app, `/api/auth/callback?code=${code}&state=${state}`, { cookie: cookieOf(l) });
  }
  test('senza sessione: API 401 con login, pagina di accesso', async () => {
    const r = await H.get(app, '/api/config'); assert.equal(r.status, 401); assert.ok(r.body.login);
    const p = await H.get(app, '/'); assert.match(p.raw, /Accedi con Google/);
    assert.equal((await H.get(app, '/api/audio')).status, 401);
  });
  test('account autorizzati entrano (Aldo e la band)', async () => {
    for (const code of ['allowed', 'band']) {
      const cb = await login(code); assert.equal(cb.status, 302, code);
      const c = await H.get(app, '/api/config', { cookie: cookieOf(cb) }); assert.equal(c.status, 200); assert.ok(c.body.user.email);
    }
  });
  test('account non autorizzato rifiutato', async () => {
    const cb = await login('denied'); assert.equal(cb.status, 403); assert.match(cb.raw, /non e' autorizzato/);
    assert.equal((await H.get(app, '/api/config', { cookie: cookieOf(cb) })).status, 401);
  });
  test('stato errato, senza codice, cookie manomesso, codice non valido', async () => {
    const l = await H.get(app, '/api/auth/login');
    assert.equal((await H.get(app, '/api/auth/callback?code=allowed&state=sbagliato', { cookie: cookieOf(l) })).status, 400);
    assert.equal((await H.get(app, '/api/auth/callback')).status, 400);
    const cb = await login('allowed'); const ck = cookieOf(cb).replace(/pcs=([^.]+)\./, 'pcs=$1x.');
    assert.equal((await H.get(app, '/api/config', { cookie: ck })).status, 401);
    const l2 = await H.get(app, '/api/auth/login'); const st = new URL(l2.headers.get('location')).searchParams.get('state');
    assert.equal((await H.get(app, `/api/auth/callback?code=boh&state=${st}`, { cookie: cookieOf(l2) })).status, 502);
  });
  test('logout chiude la sessione', async () => {
    const cb = await login('allowed'); const out = await H.get(app, '/api/auth/logout', { cookie: cookieOf(cb) });
    assert.equal(out.status, 302); assert.match(out.headers.getSetCookie().join(';'), /pcs=;|Max-Age=0/);
  });
});

describe('password (senza Google)', () => {
  let app;
  before(async () => { app = await H.startApp({ APP_PASSWORD: 'segreta' }); });
  after(() => app.stop());
  test('senza password 401, con password giusta 200, sbagliata 401', async () => {
    const r = await H.get(app, '/api/config'); assert.equal(r.status, 401); assert.match(r.headers.get('www-authenticate') || '', /Basic/);
    const basic = p => ({ authorization: 'Basic ' + Buffer.from('user:' + p).toString('base64') });
    assert.equal((await H.get(app, '/api/config', basic('segreta'))).status, 200);
    assert.equal((await H.get(app, '/api/config', basic('errata'))).status, 401);
  });
});

// ---- piano settimanale (punto 4) ----
test('API /api/plan: 7 giorni, 5 giorni, giorni non validi e schema', async () => {
  const app2 = await H.startApp({});
  try {
    const post = async b => (await fetch(app2.url + '/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
    const a = await post({ days: 7, seed: 3 }), b = await post({ days: 5, seed: 3 }), c = await post({ days: 99 });
    assert.equal(a.plan.length, 7); assert.equal(b.plan.length, 5); assert.equal(c.plan.length, 7);
    for (const d of a.plan) assert.ok(d.slides.length >= 7 && d.caption && d.hashtags.length && d.reel.song);
    assert.deepEqual((await post({ days: 7, seed: 3 })).plan.map(d => d.captionId), a.plan.map(d => d.captionId));
  } finally { app2.stop(); }
});
