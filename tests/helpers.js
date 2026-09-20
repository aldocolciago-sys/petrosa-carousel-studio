'use strict';
// Utilita' condivise dai test: copia isolata del progetto, mock di Anthropic / PostFast / Google, avvio dell'app.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Copia il progetto in una cartella temporanea: i test possono scrivere (tag, recensioni) senza toccare i dati veri
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'petrosa-test-'));
  fs.cpSync(ROOT, dir, {
    recursive: true,
    filter: p => { const r = path.relative(ROOT, p).replace(/\\/g, '/'); return !/^(node_modules|\.git|tests|\.github)(\/|$)/.test(r) && r !== '.env' && !/^public\/assets\/(Audio|Sfondo)/i.test(r); }
  });
  return dir;
}

function freePort() {
  return new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
}

function readBody(req) {
  return new Promise(res => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => res(Buffer.concat(c))); });
}
const json = (res, code, obj, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };

// ---------- Mock Anthropic ----------
async function startMockAnthropic() {
  const calls = [];
  const srv = http.createServer(async (req, res) => {
    const raw = await readBody(req); let body = {}; try { body = JSON.parse(raw.toString()); } catch { /* vuoto */ }
    calls.push({ url: req.url, headers: req.headers, body });
    if (req.headers['x-api-key'] !== 'test-anthropic-key') return json(res, 401, { error: { message: 'chiave non valida' } });
    const tool = body.tools && body.tools[0] && body.tools[0].name;
    const userText = (body.messages && body.messages[0] && String(body.messages[0].content)) || '';
    if (tool === 'crea_carosello') {
      const n = parseInt((/Numero di slide: (\d+)/.exec(userText) || [])[1] || '8', 10);
      const slides = [];
      for (let i = 0; i < n; i++) {
        const last = i === n - 1;
        slides.push(i === 0 ? { tipo: 'Cover', layout: 'hook', visual: 'v', titolo: 'AI cover ' + n, corpo: 'Corpo AI', servizio: '@petrosa_band', immagine: 'cover' }
          : i === 1 ? { tipo: 'Song', layout: 'quote', visual: 'v', titolo: 'S.U.R.E.', corpo: 'x', servizio: 's', immagine: 'none', citazione: 'Do you see light / with your closed eyes?', fonte: 'S.U.R.E.' }
          : i === 2 ? { tipo: 'Review', layout: 'quote', visual: 'v', titolo: 'Fake', corpo: 'x', servizio: 's', immagine: 'none', citazione: 'This sentence was never written by anyone at all', fonte: 'Nobody, Nowhere' }
          : last ? { tipo: 'CTA', layout: 'cta', visual: 'v', titolo: 'Listen', corpo: 'Spotify', servizio: 's', immagine: 'cover' }
          : { tipo: 'Live', layout: 'photo', visual: 'v', titolo: 'Slide ' + (i + 1), corpo: 'Corpo', servizio: 's', immagine: 'live_aldo1', tag: ['not_a_confirmed_handle'] });
      }
      return json(res, 200, { content: [{ type: 'tool_use', name: 'crea_carosello', input: {
        argomento: 'Test AI', slides, stile: { sfondo: 'dunes', palette: 'ember', font: 'classic', foto: 'duotone', copertina: 'frame' },
        caption: 'AI caption for fans of @totally_fake_account and @kyussworld. Stream it.', menzioni: ['totally_fake_account', 'kyussworld'], hashtags: ['#stonerrock', 'doommetal', 'nonsense tag']
      } }] });
    }
    if (tool === 'scrivi_caption') return json(res, 200, { content: [{ type: 'tool_use', name: 'scrivi_caption', input: { caption: 'AI-only caption text. @kyussworld', menzioni: ['kyussworld'], hashtags: ['stonerrock'] } }] });
    if (tool === 'web_search_20250305' || (body.tools && body.tools[0] && /web_search/.test(body.tools[0].type || ''))) {
      const txt = /Instagram/.test(userText) && /UFFICIALE/.test(userText)
        ? '{"handle":"testband","url":"https://example.com","certo":true}'
        : '{"reviews":[{"publication":"Mock Mag","author":"Tester","verdict":"Great","quote":"A mock review quote about riffs.","url":"https://example.com/mock-review"}],"bands":[{"name":"Mock Band","source":"Mock Mag"}]}';
      return json(res, 200, { content: [{ type: 'text', text: txt }] });
    }
    return json(res, 400, { error: { message: 'richiesta non prevista dal mock' } });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, calls, close: () => srv.close() };
}

// ---------- Mock PostFast (con CORS, come un bucket con upload firmato) ----------
async function startMockPostfast() {
  const state = { posts: [], uploads: [], puts: [], signed: [] };
  let seq = 0;
  const srv = http.createServer(async (req, res) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT,OPTIONS', 'access-control-allow-headers': '*' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const raw = await readBody(req);
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/put/')) { state.puts.push({ key: u.pathname.slice(5), size: raw.length, type: req.headers['content-type'] }); res.writeHead(200, cors); return res.end(); }
    if (req.headers['pf-api-key'] !== 'test-pf-key') return json(res, 401, { message: 'bad key' });
    if (u.pathname === '/social-media/my-social-accounts') return json(res, 200, [
      { id: 'acc-ig', platform: 'instagram', platformUsername: 'petrosa', displayName: 'Petrosa IG', connectionStatus: 'CONNECTED' },
      { id: 'acc-tt', platform: 'tiktok', platformUsername: 'petrosa', displayName: 'Petrosa TT', connectionStatus: 'CONNECTED' },
      { id: 'acc-off', platform: 'facebook', platformUsername: 'x', displayName: 'Old FB', connectionStatus: 'DISABLED' }
    ]);
    if (u.pathname === '/file/get-signed-upload-urls') {
      const b = JSON.parse(raw.toString() || '{}'); state.signed.push(b);
      const key = 'k' + (++seq); state.uploads.push(key);
      return json(res, 200, [{ signedUrl: `http://127.0.0.1:${srv.address().port}/put/${key}`, key }]);
    }
    if (u.pathname === '/social-posts') { const b = JSON.parse(raw.toString()); state.posts.push(b); return json(res, 200, { ok: true, posts: b.posts.length }); }
    return json(res, 404, { message: 'no' });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, state, close: () => srv.close() };
}

// ---------- Mock Google (token endpoint) ----------
async function startMockGoogle(clientId) {
  const emails = { allowed: 'aldo.colciago@gmail.com', band: 'petrosaband@gmail.com', denied: 'stranger@example.com' };
  const srv = http.createServer(async (req, res) => {
    const raw = (await readBody(req)).toString(); const p = new URLSearchParams(raw);
    const email = emails[p.get('code')];
    if (!email) return json(res, 400, { error: 'invalid_grant' });
    const claims = { iss: 'https://accounts.google.com', aud: clientId, email, email_verified: true, name: 'Test ' + p.get('code'), exp: Math.floor(Date.now() / 1000) + 600 };
    const idt = ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
    return json(res, 200, { id_token: idt });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

// ---------- Avvio dell'app in un processo separato ----------
async function startApp(env = {}, dir) {
  dir = dir || makeSandbox();
  const port = await freePort();
  const base = {}; for (const k of ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LANG']) if (process.env[k]) base[k] = process.env[k];
  const child = spawn(process.execPath, ['run.js'], { cwd: dir, env: { ...base, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', d => (log += d)); child.stderr.on('data', d => (log += d));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(url + '/api/library'); if (r.status < 500) break; } catch { /* non ancora pronto */ }
    if (child.exitCode !== null) throw new Error('App terminata subito:\n' + log);
    await new Promise(r => setTimeout(r, 100));
  }
  return { url, dir, port, log: () => log, stop() { child.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignora */ } } };
}

async function post(app, p, body, headers = {}) {
  const r = await fetch(app.url + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body || {}) });
  let j; const t = await r.text(); try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j, headers: r.headers };
}
async function get(app, p, headers = {}) {
  const r = await fetch(app.url + p, { headers, redirect: 'manual' });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j, headers: r.headers, raw: t };
}

// jpeg 1x1 valido
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

module.exports = { ROOT, makeSandbox, freePort, startApp, startMockAnthropic, startMockPostfast, startMockGoogle, post, get, TINY_JPEG };
