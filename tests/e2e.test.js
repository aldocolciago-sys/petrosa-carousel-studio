'use strict';
// Test end-to-end nel browser (Playwright + Chromium): prova ogni pulsante e ogni opzione dell'interfaccia.
// Servizi esterni (Anthropic, PostFast, Google) sono simulati: nessuna chiave vera, nessuna pubblicazione vera.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./helpers');

let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require('playwright-core')); } catch { /* gestito sotto */ } }
const SKIP = chromium ? false : 'Playwright non installato (npm install && npx playwright install chromium)';
const T = { timeout: 180000 };

let app, ant, pf, browser;
const IGNORE = /Failed to load resource|ERR_TUNNEL|ERR_NAME|ERR_INTERNET|fonts\.g|net::ERR|favicon/i;

describe('interfaccia', { skip: SKIP }, () => {
before(async () => {
  ant = await H.startMockAnthropic(); pf = await H.startMockPostfast();
  app = await H.startApp({ ANTHROPIC_API_KEY: 'test-anthropic-key', ANTHROPIC_BASE_URL: ant.url, POSTFAST_API_KEY: 'test-pf-key', POSTFAST_API_URL: pf.url, BLOB_READ_WRITE_TOKEN: 'test-blob-token', POSTFAST_MIN_GAP_MS: '0' });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
});
after(async () => { if (browser) await browser.close(); if (app) app.stop(); if (ant) ant.close(); if (pf) pf.close(); });

// apre una pagina nuova, raccoglie gli errori JS; alla fine del test non devono essercene
async function run(fn, opts = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: opts.viewport || { width: 1300, height: 1000 }, isMobile: !!opts.mobile, hasTouch: !!opts.mobile, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage(); const errors = [], toasts = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept('Nuova Band Test').catch(() => {}));
  await page.goto(opts.url || app.url + '/'); await page.waitForSelector('#moods .mood', { timeout: 15000 }).catch(() => {}); await page.waitForFunction(() => document.querySelectorAll('#tagTable tr').length > 1 || document.getElementById('loginWall'), null, { timeout: 15000 }).catch(() => {});
  try { await fn(page, ctx); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'errori nel browser');
}
const $ = (page, id) => page.locator('#' + id);
const hash = page => page.evaluate(() => { const d = document.getElementById('big').toDataURL('image/jpeg', 0.5); let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d.charCodeAt(i)) | 0; return h + ':' + d.length; });
const toastText = page => page.locator('#toast').innerText();
async function gen(page, { mood, focus = 'auto', item, custom, slides = 8 } = {}) {
  if (mood !== undefined) await page.locator(`#moods .mood >> nth=${mood}`).click();
  await page.selectOption('#focus', focus);
  if (item !== undefined) await page.selectOption('#item', String(item));
  if (custom !== undefined) await page.fill('#custom', custom);
  await page.evaluate(n => { const s = document.getElementById('slides'); s.value = n; s.dispatchEvent(new Event('input')); }, slides);
  await proposeClick(page, '#btnGen');
}
// clicca e aspetta la risposta NUOVA del server (evita di leggere le proposte della prova precedente)
async function proposeClick(page, sel) {
  await Promise.all([page.waitForResponse(r => /\/api\/propose/.test(r.url()), { timeout: 20000 }), page.click(sel)]);
  await page.waitForSelector('#proposals', { state: 'visible', timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#propList .prop').length === 3);
  await page.waitForTimeout(60);
}
async function useProposal(page, i = 0) { await page.locator('#propList button').nth(i).click(); await page.waitForSelector('#result', { state: 'visible' }); await page.waitForFunction(() => document.querySelectorAll('#strip .thumb').length > 0); }
async function saveDownload(dl) { const p = path.join(os.tmpdir(), 'petrosa-dl-' + Date.now() + '-' + dl.suggestedFilename()); await dl.saveAs(p); return p; }
function zipNames(buf) { // elenca i file di uno ZIP leggendo la directory centrale
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); const n = buf.readUInt16LE(eocd + 10); let off = buf.readUInt32LE(eocd + 16); const names = [];
  for (let i = 0; i < n; i++) { const l = buf.readUInt16LE(off + 28), e = buf.readUInt16LE(off + 30), c = buf.readUInt16LE(off + 32); names.push(buf.slice(off + 46, off + 46 + l).toString()); off += 46 + l + e + c; }
  return names;
}

describe('e2e', () => {
  test('avvio: stato, mood, argomenti, nessun errore', T, () => run(async page => {
    assert.equal(await page.locator('#moods .mood').count(), 7);
    assert.match(await $(page, 'pillAI').innerText(), /AI live/); assert.match(await $(page, 'pillPZ').innerText(), /PostFast collegato/);
    const opts = await page.locator('#focus option').evaluateAll(o => o.map(x => x.value));
    assert.deepEqual(opts, ['auto', 'song', 'review', 'member', 'band', 'journey', 'album', 'doomcharts', 'live', 'custom']);
    assert.ok(await $(page, 'btnClaude').isVisible());
    assert.equal(await page.locator('nav button').count(), 4);   // Studio, Tag & band simili, Audio & sync, Video testi
  }));

  test('ogni mood produce 3 proposte da 8 slide', T, () => run(async page => {
    for (let m = 0; m < 7; m++) {
      await gen(page, { mood: m });
      assert.ok((await page.locator('#moods .mood.sel').getAttribute('data-m')) === (await page.locator(`#moods .mood >> nth=${m}`).getAttribute('data-m')));
      for (const li of await page.locator('#propList .prop').all()) assert.equal(await li.locator('li').count(), 8);
    }
  }));

  test('ogni argomento: brani (10), recensioni, membri, album, Doom Charts, live, testo libero', T, () => run(async page => {
    const songs = await page.locator('#item option').count().catch(() => 0);
    await page.selectOption('#focus', 'song'); assert.equal(await page.locator('#item option').count(), 10);
    for (let i = 1; i <= 10; i++) { await gen(page, { focus: 'song', item: i }); assert.match(await page.locator('#propList').innerText(), /Song/); await useProposal(page); assert.equal(await page.locator('#strip .thumb').count(), 8); }
    await page.selectOption('#focus', 'review'); const nRev = await page.locator('#item option').count(); assert.ok(nRev >= 5);
    for (let i = 0; i < nRev; i++) { await page.selectOption('#focus', 'review'); await page.locator('#item').selectOption({ index: i }); await proposeClick(page, '#btnGen'); }
    await page.selectOption('#focus', 'member'); const members = await page.locator('#item option').evaluateAll(o => o.map(x => x.value)); assert.equal(members.length, 4);
    for (const m of members) await gen(page, { focus: 'member', item: m });
    await gen(page, { focus: 'band' }); const bandTxt = await page.locator('#propList').innerText(); for (const n of ['Antonio', 'Aldo', 'Andrea', 'Giorgio']) assert.match(bandTxt, new RegExp(n)); await useProposal(page);
    for (const n of ['Antonio', 'Aldo', 'Andrea', 'Giorgio']) assert.match(await $(page, 'caption').inputValue(), new RegExp(n));
    await gen(page, { focus: 'album' }); await useProposal(page);
    await gen(page, { focus: 'doomcharts' }); await useProposal(page); assert.match(await page.locator("#propList").innerText(), /Charting|Doom Charts|#14/);
    await gen(page, { focus: 'live' }); assert.match(await page.locator('#propList').innerText(), /Live/); await useProposal(page);
    assert.match(await $(page, 'caption').inputValue(), /1h30/); assert.match(await $(page, 'hashtags').inputValue(), /livemusic/);
    await gen(page, { focus: 'custom', custom: 'Titolo speciale\nTesto della notizia.' }); assert.match(await page.locator('#propList').innerText(), /Titolo speciale/);
    void songs;
  }));

  test('slider slide 7-10 e "Altre proposte"', T, () => run(async page => {
    for (const n of [7, 8, 9, 10]) { await gen(page, { slides: n }); assert.equal(await page.locator('#propList .prop >> nth=0').locator('li').count(), n); assert.equal(await $(page, 'slidesVal').innerText(), String(n)); }
    const before = await page.locator('#propList').innerText(); await proposeClick(page, '#btnVar');
    assert.notEqual(await page.locator('#propList').innerText(), before);
  }));

  test('risultato: miniature, editor (6 layout x tutte le immagini), modifica testo, verifica citazione', T, () => run(async page => {
    await gen(page, { focus: 'song', item: 4 }); await useProposal(page);
    assert.equal(await page.locator('#strip .thumb').count(), 8);
    const h0 = await hash(page); assert.ok(h0);
    await page.locator('#strip .thumb').nth(2).click(); assert.notEqual(await hash(page), h0);
    // layout x immagini
    const layouts = await page.locator('#e_layout option').evaluateAll(o => o.map(x => x.value)); assert.equal(layouts.length, 6);
    const imgs = await page.locator('#e_immagine option').evaluateAll(o => o.map(x => x.value)); assert.ok(imgs.length >= 60);
    // tutte le immagini sui layout a foto (photo, hook); sugli altri un campione (ogni quarta) per contenere i tempi
    for (const l of layouts) { await page.selectOption('#e_layout', l); for (const im of (l === 'photo' || l === 'hook' ? imgs : imgs.filter((_, k) => k % 4 === 0))) { await page.selectOption('#e_immagine', im); } assert.ok(await hash(page)); }
    // testo
    await page.locator('#strip .thumb').nth(0).click(); await page.selectOption('#e_layout', 'hook'); await page.selectOption('#e_immagine', 'cover'); const hh = await hash(page);
    await page.fill('#e_titolo', 'Titolo modificato per il test'); await page.waitForTimeout(150); assert.notEqual(await hash(page), hh);
    // citazione: vera -> verificata, inventata -> segnalata
    const q = await page.locator('#strip .thumb').evaluateAll(t => t.length);
    for (let i = 0; i < q; i++) { await page.locator('#strip .thumb').nth(i).click(); if ((await page.inputValue('#e_citazione')).trim()) { await page.fill('#e_citazione', 'una frase che nessuno ha mai scritto davvero'); await page.waitForTimeout(150); assert.match(await $(page, 'e_verif').innerText(), /non|verific|letteral/i); break; } }
    for (const id of ['e_corpo', 'e_stat', 'e_tag', 'e_fonte', 'e_visual']) await page.fill('#' + id, id === 'e_tag' ? 'kyussworld' : 'test'); assert.ok(await hash(page));
  }));

  test('sostituisci slide, nuova caption, copia caption, scheda testuale', T, () => run(async page => {
    await gen(page, { mood: 1 }); await useProposal(page);
    await page.locator('#strip .thumb').nth(3).click(); const before = await hash(page), tit = await $(page, 'e_titolo').inputValue();
    for (let k = 0; k < 4 && (await hash(page)) === before; k++) { await page.click('#btnSwap'); await page.waitForTimeout(400); }
    assert.notEqual(await hash(page), before, 'la slide deve cambiare'); void tit;
    const c0 = await $(page, 'caption').inputValue(); for (let k = 0; k < 6 && (await $(page, 'caption').inputValue()) === c0; k++) { await page.click('#btnRecap'); await page.waitForTimeout(500); } assert.notEqual(await $(page, 'caption').inputValue(), c0);
    await page.click('#btnCopyCap'); const clip = await page.evaluate(() => navigator.clipboard.readText()); assert.ok(clip.includes('#stonerrock') || clip.includes('#stoner'));
    assert.match(await $(page, 'capStats').innerText(), /caratteri/);
    await page.locator('details summary').click(); assert.match(await $(page, 'spec').innerText(), /SLIDE 1/); await page.click('#btnSpec');
  }));

  test('stile grafico: ogni sfondo, colore, font, foto, copertina + nuovo stile', T, () => run(async page => {
    await gen(page, { focus: 'doomcharts' }); await useProposal(page);
    const base = await hash(page); const seen = new Set([base]);
    for (const sel of ['stBg', 'stPal', 'stFont', 'stPhoto', 'stHook']) {
      const vals = await page.locator('#' + sel + ' option').evaluateAll(o => o.map(x => x.value)); assert.ok(vals.length >= 2, sel);
      if (sel === 'stBg') assert.equal(vals.length, 9); if (sel === 'stPal') assert.equal(vals.length, 10); if (sel === 'stFont') assert.equal(vals.length, 8);
      for (const v of vals) { await page.selectOption('#' + sel, v); await page.waitForTimeout(60); seen.add(await hash(page)); }
    }
    assert.ok(seen.size >= 15, 'gli stili devono cambiare l\'aspetto: ' + seen.size);
    const b = await hash(page); await page.click('#btnStyle'); await page.waitForTimeout(300); assert.notEqual(await hash(page), b);
  }));

  test('esportazione: PNG, ZIP, cartella per il telefono', T, () => run(async page => {
    await gen(page, { mood: 2 }); await useProposal(page);
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnPng')]);
    const png = fs.readFileSync(await saveDownload(dl)); assert.equal(png.slice(1, 4).toString(), 'PNG'); assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1350);
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnZip')]);
    let names = zipNames(fs.readFileSync(await saveDownload(dl))); assert.equal(names.filter(n => n.endsWith('.png')).length, 8); assert.ok(names.includes('caption.txt') && names.includes('scheda-slide.md'), names.join());
    await page.uncheck('#phoneReel');
    [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btnPhone')]);
    names = zipNames(fs.readFileSync(await saveDownload(dl))); assert.equal(names.filter(n => /^1-carosello\/\d\d\.png$/.test(n)).length, 8); for (const f of ['caption.txt', 'tag-sulle-foto.txt', 'COME-PUBBLICARE.txt']) assert.ok(names.includes(f), f);
    assert.ok(!names.some(n => n.startsWith('2-reel')), 'senza Reel se la casella e spenta');
  }));

  test('PostFast: account, bozza, programma (data obbligatoria), pubblica subito', T, () => run(async page => {
    await gen(page, { mood: 0 }); await useProposal(page);
    await page.click('#btnCh'); await page.waitForFunction(() => document.querySelectorAll('#chList input').length === 2); assert.match(await $(page, 'chList').innerText(), /Petrosa IG/);
    const posts0 = pf.state.posts.length, puts0 = pf.state.puts.length;
    await page.selectOption('#pzMode', 'draft'); await page.click('#btnPub'); await page.waitForFunction(() => /PostFast:/.test(document.getElementById('toast').textContent), null, { timeout: 60000 });
    assert.equal(pf.state.posts.length, posts0 + 1); assert.equal(pf.state.puts.length - puts0, 8); assert.equal(pf.state.posts.at(-1).status, 'DRAFT');
    assert.equal(await $(page, 'btnPub').innerText(), 'Invia a PostFast', 'il pulsante torna normale (bug "Carico slide 8/8")');
    await page.selectOption('#pzMode', 'schedule'); await page.fill('#pzDate', ''); await page.click('#btnPub'); assert.match(await toastText(page), /data e ora/);
    await page.fill('#pzDate', '2030-05-05T10:30'); await page.click('#btnPub'); await page.waitForFunction(n => true, 0); await page.waitForFunction(() => /programmato/.test(document.getElementById('toast').textContent), null, { timeout: 60000 });
    assert.equal(pf.state.posts.at(-1).status, 'SCHEDULED');
    await page.selectOption('#pzMode', 'now'); await page.click('#btnPub'); await page.waitForFunction(() => /pubblicazione tra pochi minuti/.test(document.getElementById('toast').textContent), null, { timeout: 60000 });
    await page.locator('#chList input').first().uncheck(); await page.locator('#chList input').nth(1).uncheck(); await page.click('#btnPub'); assert.match(await toastText(page), /almeno uno/);
  }));

  test('Orari suggeriti: data precompilata, invio all\'orario consigliato, pulsante Reel, giorno del piano', T, () => run(async page => {
    await gen(page, { mood: 0 }); await useProposal(page);
    const w = await page.evaluate(() => ({ when: StudioCtx.st.when, val: document.getElementById('pzDate').value, local: Schedule.toLocalInput(new Date(StudioCtx.st.when.carousel)), txt: document.getElementById('pzWhen').innerText }));
    assert.equal(w.val, w.local); assert.ok(new Date(w.when.carousel) > new Date()); assert.match(w.txt, /New York/); assert.match(w.txt, /Reel/);
    assert.equal(new Date(w.when.reel) - new Date(w.when.carousel), 20 * 60000, 'il Reel della stessa fascia esce 20 minuti dopo il carosello');
    await page.click('#btnCh'); await page.waitForFunction(() => document.querySelectorAll('#chList input').length === 2);
    await page.selectOption('#pzMode', 'schedule'); await page.click('#btnPub'); await page.waitForFunction(() => /programmato/.test(document.getElementById('toast').textContent), null, { timeout: 60000 });
    assert.equal(new Date(pf.state.posts.at(-1).posts[0].scheduledAt).toISOString(), w.when.carousel);
    await page.click('#pzSugReel'); assert.equal(await $(page, 'pzDate').inputValue(), await page.evaluate(() => Schedule.toLocalInput(new Date(StudioCtx.st.when.reel))));
    await page.fill('#pzDate', '2031-01-02T10:00'); assert.equal(await page.evaluate(() => StudioCtx.whenFor('reel')), new Date('2031-01-02T10:00').toISOString());
    await page.click('#pzSugCar'); assert.equal(await page.evaluate(() => StudioCtx.whenFor('reel')), w.when.reel);
    await page.click('#btnPlan'); await page.waitForSelector('#planList .pday', { timeout: 60000 });
    const p2 = await page.evaluate(() => window.Plan.get().plan.map(d => d.when.carousel));
    assert.equal(new Set(p2).size, 21, '7 giorni x 3 post'); assert.ok(p2.every((x, i) => !i || new Date(x) > new Date(p2[i - 1])));
    await page.locator('[data-open="2"]').click(); await page.waitForSelector('#result', { state: 'visible' });
    assert.equal(await page.evaluate(() => StudioCtx.st.when.carousel), p2[2]);
  }));

  test('modalita\' AI: genera, stile, citazioni inventate segnalate, caption AI, tag ripuliti', T, () => run(async page => {
    await page.selectOption('#focus', 'live'); await page.fill('#notes', 'prova'); await page.click('#btnClaude');
    await page.waitForSelector('#result', { state: 'visible', timeout: 30000 }); await page.waitForFunction(() => document.querySelectorAll('#strip .thumb').length === 8);
    assert.equal(await $(page, 'stBg').inputValue(), 'dunes'); assert.equal(await $(page, 'stPal').inputValue(), 'ember');
    assert.ok(!(await $(page, 'demoBanner').isVisible()));
    await page.locator('#strip .thumb').nth(2).click(); assert.match(await $(page, 'e_verif').innerText(), /non|verific/i);
    assert.doesNotMatch(await $(page, 'caption').inputValue(), /@totally_fake_account/);
    assert.ok(await $(page, 'btnAiCap').isVisible()); await page.click('#btnAiCap'); await page.waitForFunction(() => /AI-only caption/.test(document.getElementById('caption').value));
    assert.ok(ant.calls.some(c => /30 minuti fino a 1h30/.test(JSON.stringify(c.body.messages))));
    assert.equal(await page.locator('#btnSwap').isVisible(), false, 'lo scambio slide non si usa con l\'AI');
  }));

  test('Reel nativo 9:16: anteprima verticale, tutte le slide in 1080x1920, testo nell area sicura, il post resta 4:5', T, () => run(async page => {
    await gen(page, { focus: 'live', slides: 9 }); await useProposal(page);
    assert.deepEqual(await page.evaluate(() => [document.getElementById('big').width, document.getElementById('big').height]), [1080, 1350]);
    await page.click('#fmtReel');
    assert.deepEqual(await page.evaluate(() => [document.getElementById('big').width, document.getElementById('big').height]), [1080, 1920]);
    assert.ok(await page.evaluate(() => document.getElementById('big').classList.contains('reel')));
    const r = await page.evaluate(() => {
      const out = [];
      for (let i = 0; i < StudioCtx.st.slides.length; i++) {
        const c = StudioCtx.renderOff(i, 'reel'); const x = c.getContext('2d');
        // fascia bassa (coperta dall'interfaccia dei social): solo sfondo scuro, nessun testo chiaro e nitido
        const d = x.getImageData(0, 1560, 1080, 300).data; let bright = 0;
        for (let k = 0; k < d.length; k += 4) if (d[k] > 200 && d[k + 1] > 200 && d[k + 2] > 200) bright++;
        out.push([c.width, c.height, bright]);
      }
      return out;
    });
    for (const [w, h, b] of r) { assert.equal(w, 1080); assert.equal(h, 1920); assert.ok(b < 400, 'testo nella fascia bassa: ' + b); }
    await page.click('#fmtPost');
    assert.deepEqual(await page.evaluate(() => [document.getElementById('big').width, document.getElementById('big').height]), [1080, 1350]);
    assert.ok(await page.locator('#btnBoth').isVisible());
  }));

  test('Piano settimanale: 7 e 5 giorni, 3 post al giorno (mezzogiorno/sera/mezzanotte), anteprime, apertura di un giorno nell\'editor con la canzone del Reel', T, () => run(async page => {
    await page.click('#btnPlan'); await page.waitForSelector('#planList .pday', { timeout: 60000 });
    assert.equal(await page.locator('#planList .pday').count(), 21, '7 giorni x 3 post');
    const thumbs = await page.evaluate(() => [...document.querySelectorAll('#planList canvas')].map(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 40) s += d[i]; return s > 0; }));
    assert.ok(thumbs.every(Boolean), 'anteprime vuote');
    const plan = await page.evaluate(() => window.Plan.get());
    // indice 3 = primo post (mezzogiorno) del giorno 2
    assert.equal(plan.plan[3].day, 2); assert.equal(plan.plan[3].slot, 'noon');
    await page.locator('[data-open="3"]').click(); await page.waitForSelector('#result', { state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('#strip .thumb').length > 0);
    assert.match(await page.locator('#argom').innerText(), /Giorno 2/);
    assert.equal(await page.evaluate(() => StudioCtx.st.slides.length), plan.plan[3].slides.length);
    await page.waitForFunction(s => document.getElementById('rlSong').value === String(s), plan.plan[3].reel.song, { timeout: 15000 });
    await page.selectOption('#planDays', '5'); await page.click('#btnPlan');
    await page.waitForFunction(() => document.querySelectorAll('#planList .pday').length === 15, null, { timeout: 60000 });
  }));
  test('Cartella pronta per il telefono con Reel: carosello, video, caption da copiare, istruzioni con orari; il video si riusa', T, () => run(async page => {
    await gen(page, { focus: 'song', item: '1', slides: 7 }); await useProposal(page);
    await page.selectOption('#rlRes', '720'); await page.selectOption('#rlDur', '3');
    const t0 = Date.now();
    let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 150000 }), page.click('#btnPhone')]);
    const buf = fs.readFileSync(await saveDownload(dl)); const names = zipNames(buf);
    assert.equal(names.filter(n => /^1-carosello\/\d\d\.png$/.test(n)).length, 7);
    const reel = names.find(n => /^2-reel\/reel\.(mp4|webm)$/.test(n)); assert.ok(reel, names.join());
    for (const f of ['caption.txt', 'tag-sulle-foto.txt', 'COME-PUBBLICARE.txt']) assert.ok(names.includes(f), f);
    // il file del video ha una dimensione plausibile e il testo delle istruzioni cita il Reel e gli orari
    const txt = buf.toString('latin1'); assert.match(txt, /COME PUBBLICARE/); assert.ok(buf.length > 60000, 'zip troppo piccolo: ' + buf.length);
    assert.match(buf.toString('utf8'), /ORARI CONSIGLIATI/); assert.match(buf.toString('utf8'), /New York/); assert.match(buf.toString('utf8'), /reel\.mp4|reel\.webm|REEL - Instagram/);
    const cap = await page.inputValue('#caption'); assert.ok(buf.toString('utf8').includes(cap.trim().slice(0, 40)), 'la caption e nel file');
    // secondo download: il Reel non viene registrato di nuovo (molto piu veloce)
    const t1 = Date.now(); [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#btnPhone')]); await saveDownload(dl);
    assert.ok(Date.now() - t1 < (t1 - t0) * 0.6, `riuso del video: ${Date.now() - t1} ms contro ${t1 - t0} ms`);
    assert.equal(await $(page, 'btnPhone').innerText(), 'Cartella pronta per il telefono');
  }));

  test('Piano: scarica tutto (ZIP con una cartella per post e calendario)', T, () => run(async page => {
    await page.selectOption('#planDays', '5'); await page.click('#btnPlan'); await page.waitForFunction(() => document.querySelectorAll('#planList .pday').length === 15, null, { timeout: 60000 });
    await page.uncheck('#planReel');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 170000 }), page.click('#planZip')]);
    const names = zipNames(fs.readFileSync(await saveDownload(dl)));
    assert.ok(names.includes('PIANO.txt'));
    const plan = await page.evaluate(() => window.Plan.get().plan.map(d => [d.day, d.slot, d.topic, d.slides.length]));
    const seenFolders = new Set();
    for (const [day, slot, topic, n] of plan) {
      const pre = `giorno-${String(day).padStart(2, '0')}-${slot}-${topic}/`;
      assert.ok(!seenFolders.has(pre), 'cartella duplicata: ' + pre); seenFolders.add(pre);
      assert.equal(names.filter(x => x.startsWith(pre + '1-carosello/') && x.endsWith('.png')).length, n, pre);
      for (const f of ['caption.txt', 'tag-sulle-foto.txt', 'COME-PUBBLICARE.txt']) assert.ok(names.includes(pre + f), pre + f);
    }
    assert.equal(await $(page, 'planZip').innerText(), 'Scarica tutto il piano (ZIP)'); assert.equal(await $(page, 'planProg').innerText(), '');
  }));

  test('Piano: programma tutto su PostFast (15 caroselli + 15 Reel agli orari consigliati: 5 giorni x 3 fasce)', { timeout: 600000 }, () => run(async page => {
    await page.selectOption('#planDays', '5'); await page.click('#btnPlan'); await page.waitForFunction(() => document.querySelectorAll('#planList .pday').length === 15, null, { timeout: 60000 });
    const when = await page.evaluate(() => window.Plan.get().plan.map(d => d.when));
    await page.evaluate(() => { document.getElementById('rlRes').value = '720'; document.getElementById('rlDur').value = '3'; }); await page.selectOption('#planMode', 'schedule');
    const before = pf.state.posts.length;
    await page.click('#planSend'); await page.waitForFunction(() => /PostFast: 15 caroselli|errori/.test(document.getElementById('toast').textContent), null, { timeout: 540000 });
    assert.match(await toastText(page), /PostFast: 15 caroselli e 15 Reel programmati/);
    const posts = pf.state.posts.slice(before); assert.equal(posts.length, 30);
    const car = posts.filter(p => p.posts[0].mediaItems[0].type === 'IMAGE'), vid = posts.filter(p => p.posts[0].mediaItems[0].type === 'VIDEO');
    assert.equal(car.length, 15); assert.equal(vid.length, 15);
    car.forEach((p, i) => assert.equal(new Date(p.posts[0].scheduledAt).toISOString(), when[i].carousel));
    vid.forEach((p, i) => { assert.equal(new Date(p.posts[0].scheduledAt).toISOString(), when[i].reel); assert.equal(p.controls.instagramPublishType, 'REEL'); });
    assert.equal(await $(page, 'planSend').isDisabled(), false);
  }));

  test('Piano: pulsanti per singolo post (Crea Reel, Programma carosello, Programma Reel), account multipiattaforma, feedback', T, () => run(async page => {
    await page.selectOption('#planDays', '5'); await page.click('#btnPlan'); await page.waitForFunction(() => document.querySelectorAll('#planList .pday').length === 15, null, { timeout: 60000 });
    await page.evaluate(() => { document.getElementById('rlRes').value = '720'; document.getElementById('rlDur').value = '3'; });
    // account dedicati al piano (non quelli di sezione 6): il mock ne espone 2, su piattaforme diverse
    assert.ok(await $(page, 'planChBox').isVisible());
    await page.click('#planChBtn'); await page.waitForFunction(() => document.querySelectorAll('#planChList input').length === 2);
    await page.selectOption('#planMode', 'draft');
    // 👍 sul post di indice 0 (giorno 1, mezzogiorno): resta segnato dopo il ridisegno della lista
    await page.click('.pday[data-i="0"] [data-rate="up"]');
    await page.waitForFunction(() => /andata bene/.test(document.getElementById('toast').textContent));
    assert.ok(await page.locator('.pday[data-i="0"] [data-rate="up"]').evaluate(b => b.classList.contains('on')));
    // il flag del post 1 parte "da generare"
    assert.ok(!(await page.locator('[data-reelflag="1"]').evaluate(el => el.classList.contains('ready'))));
    // Crea Reel per il post di indice 1 (giorno 1, sera), senza passare dall'editor
    await page.click('[data-mkreel="1"]');
    await page.waitForFunction(() => { const b = document.querySelector('[data-mkreel="1"]'); return b && !b.disabled; }, null, { timeout: 120000 });
    assert.match(await page.locator('[data-status="1"]').innerText(), /Reel creato|Reel gia/);
    // e ora il flag segna "pronto"
    assert.ok(await page.locator('[data-reelflag="1"]').evaluate(el => el.classList.contains('ready')));
    // Programma il carosello del post di indice 0 (bozza)
    const postsBefore = pf.state.posts.length;
    await page.click('[data-pubpost="0"]');
    await page.waitForFunction(() => { const b = document.querySelector('[data-pubpost="0"]'); return b && !b.disabled; }, null, { timeout: 60000 });
    assert.match(await page.locator('[data-status="0"]').innerText(), /salvato come bozza/);
    assert.equal(pf.state.posts.length, postsBefore + 1);
    assert.equal(pf.state.posts.at(-1).posts[0].mediaItems[0].type, 'IMAGE');
    // Programma il Reel del post di indice 1 (riusa il video appena creato)
    const postsBefore2 = pf.state.posts.length, putsBefore2 = pf.state.puts.length;
    await page.click('[data-pubreel="1"]');
    await page.waitForFunction(() => { const b = document.querySelector('[data-pubreel="1"]'); return b && !b.disabled; }, null, { timeout: 120000 });
    assert.match(await page.locator('[data-status="1"]').innerText(), /salvato come bozza/);
    assert.equal(pf.state.posts.length, postsBefore2 + 1);
    const last = pf.state.posts.at(-1); assert.equal(last.posts[0].mediaItems[0].type, 'VIDEO'); assert.equal(last.controls.instagramPublishType, 'REEL');
    assert.ok(pf.state.puts.length > putsBefore2, 'il video e stato caricato');
    // "Genera tutti i Reel": tronca il piano a 2 post per un test veloce (il post 0 e' gia' pronto da prima: deve saltarlo)
    await page.evaluate(() => { window.Plan.get().plan.length = 2; window.Plan.redraw(); });
    await page.waitForFunction(() => document.querySelectorAll('#planList .pday').length === 2);
    assert.equal(await page.locator('.reel-flag.ready').count(), 1, 'solo il post 1 e\' gia\' pronto');
    await page.click('#planMkAllReels');
    await page.waitForFunction(() => { const b = document.getElementById('planMkAllReels'); return b && !b.disabled; }, null, { timeout: 120000 });
    assert.equal(await page.locator('.reel-flag.ready').count(), 2, 'entrambi i Reel devono risultare pronti dopo "Genera tutti i Reel"');
    assert.match(await toastText(page), /2 Reel della settimana sono pronti/);
  }));

  test('Reel su misura: il video usa testi accorciati, il carosello no; verso integro', T, () => run(async page => {
    await gen(page, { focus: 'song', slides: 8 }); await useProposal(page);
    const r = await page.evaluate(() => {
      const st = StudioCtx.st; let calls = 0; const orig = window.ReelCut.cut; window.ReelCut.cut = s => { calls++; return orig(s); };
      StudioCtx.renderOff(0); const afterPost = calls; StudioCtx.renderOff(0, 'reel'); const afterReel = calls;
      const q = st.slides.find(x => x.citazione); const cut = orig(q);
      return { afterPost, afterReel, same: cut.citazione === q.citazione, total: window.ReelCut.stats(st.slides) };
    });
    assert.equal(r.afterPost, 0); assert.equal(r.afterReel, 1); assert.ok(r.same); assert.ok(r.total.after <= r.total.before);
  }));
  test('Reel: brano, verso sincronizzato, ascolto, durata, video e invio a PostFast', T, () => run(async page => {
    await gen(page, { focus: 'song', item: 4, slides: 7 }); await useProposal(page);
    await page.waitForFunction(() => document.querySelectorAll('#rlSong option').length === 10);
    assert.equal(await $(page, 'rlSong').inputValue(), '4'); assert.match(await $(page, 'rlQuote').innerText(), /e' cantato al/);
    const s0 = parseFloat(await $(page, 'rlStart').inputValue()); await page.click('#rlPlus'); assert.equal(parseFloat(await $(page, 'rlStart').inputValue()), s0 + 2);
    await page.click('#rlMinus'); await page.click('#rlPlus1'); await page.click('#rlMinus1'); assert.equal(parseFloat(await $(page, 'rlStart').inputValue()), s0);
    await page.selectOption('#rlSong', '9'); assert.match(await $(page, 'rlQuote').innerText(), /hai scelto un altro brano/);
    await page.selectOption('#rlSong', '4'); const t0 = await $(page, 'rlQuote').innerText(); await page.selectOption('#rlDur', '5'); assert.notEqual(await $(page, 'rlQuote').innerText(), t0);
    await page.selectOption('#rlDur', '3'); await page.click('#rlListen'); await page.waitForFunction(() => /Stop/.test(document.getElementById('rlListen').textContent), null, { timeout: 8000 }); await page.click('#rlListen');
    await page.selectOption('#rlRes', '720'); await page.click('#rlMake');
    await page.waitForSelector('#rlOut', { state: 'visible', timeout: 120000 });
    const info = await page.evaluate(async () => { const b = await (await fetch(document.getElementById('rlVideo').src)).blob(); return { size: b.size, type: b.type }; });
    assert.ok(info.size > 20000, 'video troppo piccolo: ' + info.size); assert.match(info.type, /^video\//);
    assert.equal(await $(page, 'rlMake').innerText(), '🎬 Crea video', 'il pulsante torna normale');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#rlDl')]); assert.match(dl.suggestedFilename(), /^petrosa-reel-.*\.(mp4|webm)$/);
    await page.click('#btnCh'); await page.waitForFunction(() => document.querySelectorAll('#chList input').length === 2); await page.selectOption('#pzMode', 'draft');
    const putsBefore = pf.state.puts.length; await page.click('#rlPub'); await page.waitForFunction(() => /Reel su/.test(document.getElementById('toast').textContent), null, { timeout: 60000 });
    assert.ok(pf.state.puts.length > putsBefore && pf.state.puts.at(-1).size > 20000);
    const b = pf.state.posts.at(-1); assert.equal(b.posts[0].mediaItems[0].type, 'VIDEO'); assert.equal(b.controls.instagramPublishType, 'REEL');
  }));

  test('Reel: la registrazione non si blocca se la scheda e in secondo piano (requestAnimationFrame fermo)', T, () => run(async page => {
    // il bug reale: con la scheda nascosta il browser ferma requestAnimationFrame, il video si bloccava su una slide e poi saltava avanti
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.reload(); await page.waitForFunction(() => window.StudioCtx && window.Reel);
    await gen(page, { focus: 'song', item: 1, slides: 8 }); await useProposal(page);
    await page.waitForFunction(() => document.querySelectorAll('#rlSong option').length === 10);
    await page.selectOption('#rlRes', '720'); await page.click('#rlMake');
    await page.waitForSelector('#rlOut', { state: 'visible', timeout: 120000 });
    const st = await page.evaluate(() => window.Reel.stats());
    assert.equal(st.slides, st.of, 'tutte le slide devono comparire nel video: ' + JSON.stringify(st));
    assert.ok(st.maxGap < 1, 'la registrazione si e fermata per ' + st.maxGap + ' s');
    assert.ok(st.ticks > 100, 'pochi fotogrammi: ' + st.ticks);
    assert.equal(st.fx, 'mid', 'effetti rock di default'); assert.ok(st.beats >= 8, 'l\'analisi ritmica deve trovare dei colpi: ' + st.beats);
    const size = await page.evaluate(async () => (await (await fetch(document.getElementById('rlVideo').src)).blob()).size); assert.ok(size > 20000);
  }));

  test('Reel: effetti forti e "nessun effetto" producono entrambi un video completo', T, () => run(async page => {
    await gen(page, { focus: 'song', item: 6, slides: 7 }); await useProposal(page);
    await page.waitForFunction(() => document.querySelectorAll('#rlSong option').length === 10);
    assert.deepEqual(await page.$$eval('#rlFx option', o => o.map(x => x.value)), ['mid', 'hard', 'off']);
    for (const fxv of ['hard', 'off']) {
      await page.selectOption('#rlRes', '720'); await page.selectOption('#rlFx', fxv); await page.evaluate(() => { document.getElementById('rlOut').style.display = 'none'; });
      await page.click('#rlMake'); await page.waitForSelector('#rlOut', { state: 'visible', timeout: 120000 });
      const st = await page.evaluate(() => window.Reel.stats());
      assert.equal(st.fx, fxv); assert.equal(st.slides, st.of, 'slide mancanti con effetti ' + fxv); assert.ok(fxv === 'off' ? st.beats === 0 : st.beats >= 8, 'colpi: ' + st.beats);
    }
  }));

  test('Reel: finale a loop (durata annunciata e video effettivo piu\' lunghi di quanto dichiarato senza)', T, () => run(async page => {
    await gen(page, { focus: 'song', item: 3, slides: 7 }); await useProposal(page);
    await page.waitForFunction(() => document.querySelectorAll('#rlSong option').length === 10);
    assert.ok(await $(page, 'rlLoop').isChecked(), 'il loop e\' attivo di default');
    const durOf = txt => parseFloat(/Video di ([\d.]+) s\./.exec(txt)[1]);
    const withLoop = durOf(await $(page, 'rlQuote').innerText());
    await page.uncheck('#rlLoop');
    const withoutLoop = durOf(await $(page, 'rlQuote').innerText());
    assert.ok(withLoop - withoutLoop > 0.3 && withLoop - withoutLoop < 0.6, `il richiamo a loop deve aggiungere ~0,45 s (trovato ${withLoop} vs ${withoutLoop})`);
    await page.check('#rlLoop');
    await page.selectOption('#rlRes', '720'); await page.click('#rlMake');
    await page.waitForSelector('#rlOut', { state: 'visible', timeout: 120000 });
    // MediaRecorder in Chrome riporta video.duration=Infinity finche' non si fa un seek: si usano invece i fotogrammi
    // effettivamente registrati (stats().ticks, ~30 al secondo) per verificare che la registrazione sia durata quanto annunciato.
    const st = await page.evaluate(() => window.Reel.stats());
    const real = st.ticks / 30;
    assert.ok(Math.abs(real - withLoop) < 1.5, `il video registrato (${real.toFixed(1)}s da ${st.ticks} fotogrammi) deve durare quanto annunciato (${withLoop}s)`);
  }));

  test('Reel breve indipendente (solo hook): una slide, caption propria diversa dal post, invito al profilo', T, () => run(async page => {
    await gen(page, { focus: 'song', item: 2, slides: 8 }); await useProposal(page);
    await page.waitForFunction(() => document.querySelectorAll('#rlSong option').length === 10);
    assert.ok(await $(page, 'rlTeaserHint').isHidden());
    await page.check('#rlTeaser');
    assert.ok(await $(page, 'rlTeaserHint').isVisible());
    assert.match(await $(page, 'rlQuote').innerText(), /Reel breve indipendente/);
    await page.selectOption('#rlRes', '720'); await page.click('#rlMake');
    await page.waitForSelector('#rlOut', { state: 'visible', timeout: 120000 });
    const st = await page.evaluate(() => window.Reel.stats());
    assert.equal(st.of, 1, 'il video deve avere una sola slide (l\'hook)');
    await page.click('#btnCh'); await page.waitForFunction(() => document.querySelectorAll('#chList input').length === 2); await page.selectOption('#pzMode', 'draft');
    await page.click('#rlPub'); await page.waitForFunction(() => /Reel su/.test(document.getElementById('toast').textContent), null, { timeout: 60000 });
    const b = pf.state.posts.at(-1); const capSent = b.posts[0].content;
    assert.match(capSent, /profile/i, 'la caption del Reel breve invita al profilo');
    const fullCap = await page.evaluate(() => StudioCtx.fullCaption());
    assert.notEqual(capSent, fullCap, 'la caption del Reel breve deve essere diversa da quella del post');
  }));

  test('Audio & sync: 10 brani, punti di sincronizzazione, salvataggio, file JSON, effetto sul Reel', T, () => run(async page => {
    await page.click('nav button[data-tab=audio]'); await page.waitForFunction(() => document.querySelectorAll('#syncSong option').length === 10);
    // data/audio-sync.json ora contiene i punti REALI per tutti e 10 i brani (non piu' uno stub vuoto), quindi arrivano
    // gia' completamente sincronizzati: si azzerano prima con "Azzera" per verificare anche lo stato "stimato" (meno
    // di 2 punti), che e' quello che questo giro vuole controllare.
    for (let i = 1; i <= 10; i++) { await page.selectOption('#syncSong', String(i)); await page.click('#syncReset'); assert.ok(await page.locator('#syncLines .ln').count() >= 1, 'righe brano ' + i); assert.match(await $(page, 'syncStatus').innerText(), /stimati/); }
    await page.selectOption('#syncSong', '4'); const n = await page.locator('#syncLines .ln').count();
    await page.evaluate(() => (document.getElementById('syncAudio').currentTime = 25)); await page.locator('#syncLines .ln').nth(0).locator('[data-a=set]').click();
    await page.evaluate(() => (document.getElementById('syncAudio').currentTime = 320)); await page.locator('#syncLines .ln').nth(n - 1).locator('[data-a=set]').click();
    assert.match(await $(page, 'syncStatus').innerText(), /2\/\d+ righe sincronizzate/); assert.match(await page.locator('#syncLines .ln.set').first().innerText(), /0:25/);
    assert.doesNotMatch(await page.locator('#syncSong').locator('option:checked').innerText(), /✔/, 'solo 2 righe su ' + n + ': non ancora "completo"');
    await page.locator('#syncLines .ln').nth(5).locator('[data-a=play]').click(); await page.locator('#syncLines .ln').nth(5).locator('[data-a=set]').click(); await page.locator('#syncLines .ln.set').nth(1).locator('[data-a=del]').click();
    assert.match(await $(page, 'syncStatus').innerText(), /2\/\d+ righe sincronizzate/);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#syncDl')]); const j = JSON.parse(fs.readFileSync(await saveDownload(dl), 'utf8'));
    assert.equal(j['4'].length, 2); assert.equal(j['4'][0].t, 25);
    await page.reload(); await page.click('nav button[data-tab=audio]'); await page.waitForFunction(() => document.querySelectorAll('#syncSong option').length === 10); await page.selectOption('#syncSong', '4');
    assert.match(await $(page, 'syncStatus').innerText(), /2\/\d+ righe sincronizzate/, 'i punti restano dopo il ricaricamento');
    await page.click('nav button[data-tab=studio]'); await gen(page, { focus: 'song', item: 4, slides: 7 }); await useProposal(page);
    await page.waitForFunction(() => document.querySelectorAll('#rlSong option').length === 10);
    assert.doesNotMatch(await $(page, 'rlQuote').innerText(), /non ancora sincronizzati/); assert.match(await $(page, 'rlSong').locator('option:checked').innerText(), /sincronizzato/);
    await page.click('nav button[data-tab=audio]'); await page.click('#syncReset'); assert.match(await $(page, 'syncStatus').innerText(), /0\/\d+ righe/);
  }));

  test('Video testi: brano sincronizzato per intero, tratto scelto, video karaoke e pubblicazione come Reel', T, () => run(async page => {
    // un post scelto serve solo per rendere visibile la card 6 "Pubblica con PostFast" (dentro #result, nascosta finche' non si sceglie una proposta)
    await gen(page, { mood: 0 }); await useProposal(page);
    // data/audio-sync.json ora ha i punti REALI per tutti i 10 brani, quindi arrivano gia' completamente sincronizzati:
    // si azzerano tutti prima di verificare lo stato "vuoto" della scheda Video testi (nessun brano ancora pronto),
    // che e' il punto di partenza che questo test vuole controllare prima di sincronizzarne uno per intero a mano.
    await page.click('nav button[data-tab=audio]'); await page.waitForFunction(() => document.querySelectorAll('#syncSong option').length === 10);
    for (let i = 1; i <= 10; i++) { await page.selectOption('#syncSong', String(i)); await page.click('#syncReset'); }
    // scheda "Video testi": non basta come per il Reel del post (2 punti stimano il resto); qui serve un'ancora su OGNI riga
    await page.click('nav button[data-tab=lyrics]');
    // il contenuto della scheda arriva da una chiamata async (loadSongs -> renderLyric): va aspettata prima di leggere lvNone/lvBox
    await page.waitForFunction(() => document.getElementById('lvNone').style.display === 'block' || document.getElementById('lvBox').style.display === 'block');
    assert.ok(await $(page, 'lvNone').isVisible(), 'nessun brano ancora sincronizzato per intero: il tab e\' vuoto');
    assert.ok(await $(page, 'lvBox').isHidden());
    await page.click('nav button[data-tab=audio]'); await page.waitForFunction(() => document.querySelectorAll('#syncSong option').length === 10);
    await page.selectOption('#syncSong', '5'); // "Rusty Blues", un brano piu' corto: comodo per sincronizzarlo per intero nel test
    const n = await page.locator('#syncLines .ln').count();
    for (let i = 0; i < n; i++) {
      await page.evaluate(t => (document.getElementById('syncAudio').currentTime = t), 10 + i * 3);
      await page.locator('#syncLines .ln').nth(i).locator('[data-a=set]').click();
    }
    assert.match(await $(page, 'syncStatus').innerText(), new RegExp(`completamente sincronizzato.*${n}/${n} righe`));
    assert.match(await page.locator('#syncSong').locator('option:checked').innerText(), /✔/);
    await page.click('#syncGoLyric'); // link dallo stato "completo" alla scheda Video testi
    await page.waitForFunction(() => document.querySelector('nav button[data-tab="lyrics"]').classList.contains('active'));
    await page.waitForFunction(() => document.querySelectorAll('#lvSong option').length === 1);
    assert.ok(await $(page, 'lvBox').isVisible()); assert.ok(await $(page, 'lvNone').isHidden());
    assert.match(await page.locator('#lvSong').locator('option:checked').innerText(), /Rusty Blues/);
    assert.match(await $(page, 'lvInfo').innerText(), /righe.*s di video/);
    // "Brano intero": copre tutte le n righe e disabilita la scelta manuale del tratto
    await page.check('#lvFull');
    assert.equal(await $(page, 'lvFrom').isDisabled(), true);
    assert.match(await $(page, 'lvInfo').innerText(), new RegExp(`${n} righe`));
    await page.uncheck('#lvFull');
    await page.selectOption('#lvRes', '720'); await page.click('#lvMake');
    await page.waitForSelector('#lvOut', { state: 'visible', timeout: 120000 });
    const info = await page.evaluate(async () => { const b = await (await fetch(document.getElementById('lvVideo').src)).blob(); return { size: b.size, type: b.type }; });
    assert.ok(info.size > 15000, 'video troppo piccolo: ' + info.size); assert.match(info.type, /^video\//);
    const cap = await $(page, 'lvCap').inputValue();
    assert.match(cap, /#lyricvideo/); assert.match(cap, /Rusty Blues/);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#lvDl')]); assert.match(dl.suggestedFilename(), /^petrosa-video-testi-.*\.(mp4|webm)$/);
    // #btnCh, #chList e #pzMode vivono nella scheda "Studio" (card 6, Pubblica con PostFast): vanno usati li',
    // poi si torna sulla scheda "Video testi" per pubblicare - #chList resta popolato cambiando scheda.
    await page.click('nav button[data-tab=studio]'); await page.click('#btnCh'); await page.waitForFunction(() => document.querySelectorAll('#chList input').length === 2); await page.selectOption('#pzMode', 'draft');
    await page.click('nav button[data-tab=lyrics]'); await page.waitForFunction(() => document.querySelector('nav button[data-tab="lyrics"]').classList.contains('active'));
    const putsBefore = pf.state.puts.length; await page.click('#lvPub'); await page.waitForFunction(() => /Video testi su/.test(document.getElementById('toast').textContent), null, { timeout: 60000 });
    assert.ok(pf.state.puts.length > putsBefore && pf.state.puts.at(-1).size > 15000);
    const b = pf.state.posts.at(-1); assert.equal(b.posts[0].mediaItems[0].type, 'VIDEO'); assert.equal(b.controls.instagramPublishType, 'REEL'); assert.equal(b.posts[0].content, cap);
  }));

  test('Tag & band simili: tabella, modifica, salvataggio, nuova band, scansione web, ricerca handle', T, () => run(async page => {
    await page.click('nav button[data-tab=tags]'); await page.waitForFunction(() => document.querySelectorAll('#tagTable tr').length > 10);
    const rows0 = await page.locator('#tagTable tr').count();
    await page.click('#btnAddBand'); assert.equal(await page.locator('#tagTable tr').count(), rows0 + 1);
    const row = page.locator('#tagTable tr').nth(1); await row.locator('input[data-f=handle]').fill('handle_test'); await row.locator('input[type=checkbox]').first().check();
    await page.click('#btnSaveTags'); await page.waitForFunction(() => /Tag salvati/.test(document.getElementById('toast').textContent));
    const t = await (await fetch(app.url + '/api/tags')).json(); assert.ok(t.similarBands.some(b => b.handle === 'handle_test' && b.confirmed)); assert.ok(t.similarBands.some(b => b.name === 'Nuova Band Test'));
    await page.click('#btnScan'); await page.waitForFunction(() => /Mock Mag/.test(document.getElementById('scanOut').textContent), null, { timeout: 20000 });
    await page.locator('#scanOut [data-r]').first().click(); await page.waitForTimeout(400);
    const findBtn = page.locator('#tagTable button', { hasText: /trova|cerca/i }).first();
    if (await findBtn.count()) { await findBtn.click(); await page.waitForFunction(() => /Trovato @testband/.test(document.getElementById('toast').textContent), null, { timeout: 15000 }); }
  }));

  test('mobile: nessun scorrimento orizzontale, dock, riepilogo configurazione, stile', T, () => run(async page => {
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok((await overflow()) <= 1, 'overflow iniziale'); assert.ok(await $(page, 'dock').isVisible()); assert.ok(await $(page, 'statusBar').isVisible());
    await page.click('#dkGen'); await page.waitForSelector('#proposals', { state: 'visible', timeout: 15000 });
    await useProposal(page); assert.ok((await overflow()) <= 1, 'overflow con risultato');
    assert.match(await $(page, 'cfgSum').innerText(), /slide/); await page.click('#dkStyle'); await page.click('#dkCfg');
    assert.ok(await $(page, 'dkAi').isVisible()); await page.click('#dkAi'); await page.waitForFunction(() => document.querySelectorAll('#strip .thumb').length === 8, null, { timeout: 30000 });
    await page.locator('#reelCard').scrollIntoViewIfNeeded(); assert.ok((await overflow()) <= 1, 'overflow Reel');
    await page.click('nav button[data-tab=audio]'); assert.ok((await overflow()) <= 1, 'overflow sync'); await page.click('nav button[data-tab=tags]'); assert.ok((await overflow()) <= 200, 'overflow tag (tabella scorrevole)');
    assert.equal(await $(page, 'dock').isVisible(), false, 'il dock si nasconde fuori dallo Studio');
  }, { viewport: { width: 390, height: 844 }, mobile: true }));
});

describe('e2e: accesso Google', () => {
  let a, g;
  before(async () => { g = await H.startMockGoogle('cid'); a = await H.startApp({ GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 's', GOOGLE_TOKEN_URL: g.url + '/token', GOOGLE_AUTH_URL: g.url + '/auth' }); });
  after(() => { if (a) a.stop(); if (g) g.close(); });
  test('senza accesso: pagina "Accedi con Google"; sessione scaduta -> schermata di accesso', T, async () => {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    await page.goto(a.url + '/'); assert.ok(await page.getByText('Accedi con Google').isVisible());
    // sessione valida via callback simulata
    const l = await fetch(a.url + '/api/auth/login', { redirect: 'manual' }); const st = new URL(l.headers.get('location')).searchParams.get('state');
    const ck = l.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const cb = await fetch(`${a.url}/api/auth/callback?code=allowed&state=${st}`, { redirect: 'manual', headers: { cookie: ck } });
    assert.equal(cb.status, 302);
    const pcs = cb.headers.getSetCookie().find(c => c.startsWith('pcs=')).split(';')[0].slice(4);
    await ctx.addCookies([{ name: 'pcs', value: decodeURIComponent(pcs), url: a.url }]);
    await page.goto(a.url + '/'); await page.waitForSelector('#moods .mood'); assert.equal(await page.locator('#loginWall').count(), 0);
    await ctx.clearCookies(); await page.click('#btnGen'); await page.waitForSelector('#loginWall', { timeout: 10000 });
    await ctx.close();
  });
});
});
