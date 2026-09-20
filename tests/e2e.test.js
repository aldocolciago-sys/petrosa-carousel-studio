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
  app = await H.startApp({ ANTHROPIC_API_KEY: 'test-anthropic-key', ANTHROPIC_BASE_URL: ant.url, POSTFAST_API_KEY: 'test-pf-key', POSTFAST_API_URL: pf.url });
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
    assert.deepEqual(opts, ['auto', 'song', 'review', 'member', 'album', 'doomcharts', 'live', 'custom']);
    assert.ok(await $(page, 'btnClaude').isVisible());
    assert.equal(await page.locator('nav button').count(), 3);
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
    const imgs = await page.locator('#e_immagine option').evaluateAll(o => o.map(x => x.value)); assert.ok(imgs.length >= 19);
    for (const l of layouts) { await page.selectOption('#e_layout', l); for (const im of imgs) { await page.selectOption('#e_immagine', im); } assert.ok(await hash(page)); }
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
    [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btnPhone')]);
    names = zipNames(fs.readFileSync(await saveDownload(dl))); assert.equal(names.filter(n => /^\d\d\.png$/.test(n)).length, 8); for (const f of ['caption.txt', 'tag-sulle-foto.txt', 'COME-PUBBLICARE.txt']) assert.ok(names.includes(f), f);
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

  test('Audio & sync: 10 brani, punti di sincronizzazione, salvataggio, file JSON, effetto sul Reel', T, () => run(async page => {
    await page.click('nav button[data-tab=audio]'); await page.waitForFunction(() => document.querySelectorAll('#syncSong option').length === 10);
    for (let i = 1; i <= 10; i++) { await page.selectOption('#syncSong', String(i)); assert.ok(await page.locator('#syncLines .ln').count() >= 1, 'righe brano ' + i); assert.match(await $(page, 'syncStatus').innerText(), /stimati|interpolati/); }
    await page.selectOption('#syncSong', '4'); const n = await page.locator('#syncLines .ln').count();
    await page.evaluate(() => (document.getElementById('syncAudio').currentTime = 25)); await page.locator('#syncLines .ln').nth(0).locator('[data-a=set]').click();
    await page.evaluate(() => (document.getElementById('syncAudio').currentTime = 320)); await page.locator('#syncLines .ln').nth(n - 1).locator('[data-a=set]').click();
    assert.match(await $(page, 'syncStatus').innerText(), /2 punti/); assert.match(await page.locator('#syncLines .ln.set').first().innerText(), /0:25/);
    await page.locator('#syncLines .ln').nth(5).locator('[data-a=play]').click(); await page.locator('#syncLines .ln').nth(5).locator('[data-a=set]').click(); await page.locator('#syncLines .ln.set').nth(1).locator('[data-a=del]').click();
    assert.match(await $(page, 'syncStatus').innerText(), /2 punti/);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#syncDl')]); const j = JSON.parse(fs.readFileSync(await saveDownload(dl), 'utf8'));
    assert.equal(j['4'].length, 2); assert.equal(j['4'][0].t, 25);
    await page.reload(); await page.click('nav button[data-tab=audio]'); await page.waitForFunction(() => document.querySelectorAll('#syncSong option').length === 10); await page.selectOption('#syncSong', '4');
    assert.match(await $(page, 'syncStatus').innerText(), /2 punti/, 'i punti restano dopo il ricaricamento');
    await page.click('nav button[data-tab=studio]'); await gen(page, { focus: 'song', item: 4, slides: 7 }); await useProposal(page);
    await page.waitForFunction(() => document.querySelectorAll('#rlSong option').length === 10);
    assert.doesNotMatch(await $(page, 'rlQuote').innerText(), /non ancora sincronizzati/); assert.match(await $(page, 'rlSong').locator('option:checked').innerText(), /sincronizzato/);
    await page.click('nav button[data-tab=audio]'); await page.click('#syncReset'); assert.match(await $(page, 'syncStatus').innerText(), /0 punti/);
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
