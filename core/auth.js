'use strict';
// Login con account Google (OAuth 2.0 / OpenID Connect, senza dipendenze) con lista di email autorizzate.
// Attivo solo se sono impostati GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.
const crypto = require('crypto');

const CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET || '';
const AUTH_URL = () => process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const ALLOWED = () => (process.env.ALLOWED_EMAILS || 'aldo.colciago@gmail.com,petrosaband@gmail.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const MAX_AGE = 7 * 24 * 3600; // sessione di 7 giorni

const enabled = () => !!(CLIENT_ID() && CLIENT_SECRET());
const secret = () => crypto.createHash('sha256').update('petrosa-session|' + (process.env.SESSION_SECRET || CLIENT_SECRET())).digest();
const b64 = b => Buffer.from(b).toString('base64url');
const sign = data => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || (/^localhost|^127\./.test(host) ? 'http' : 'https');
  return `${String(proto).split(',')[0]}://${String(host).split(',')[0]}`;
}
const redirectUri = req => baseUrl(req) + '/api/auth/callback';

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function setCookie(req, name, value, maxAge) {
  const secure = baseUrl(req).startsWith('https://') ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function makeSession(user) {
  const body = b64(JSON.stringify({ email: user.email, name: user.name || '', picture: user.picture || '', exp: Math.floor(Date.now() / 1000) + MAX_AGE }));
  return body + '.' + sign(body);
}
function readSession(req) {
  const tok = cookies(req).pcs; if (!tok) return null;
  const [body, mac] = tok.split('.'); if (!body || !mac) return null;
  const good = sign(body);
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!p.exp || p.exp < Date.now() / 1000) return null;
  if (!ALLOWED().includes(String(p.email).toLowerCase())) return null; // se la lista cambia, le vecchie sessioni decadono
  return p;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function page(title, message, links) {
  return `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07030c;color:#f3e8ff;font:16px/1.5 system-ui,sans-serif">
<div style="max-width:420px;padding:32px;text-align:center"><h1 style="font:900 26px Georgia,serif;letter-spacing:.08em;background:linear-gradient(90deg,#fbbf24,#ea580c,#c026d3);-webkit-background-clip:text;background-clip:text;color:transparent;margin:0 0 4px">PETROSA</h1>
<div style="color:#a78bfa;margin-bottom:22px">Carousel Studio</div><p>${message}</p>
${links.map(l => `<a href="${l.href}" style="display:inline-block;margin:6px;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;${l.primary ? 'background:#f59e0b;color:#1a0b00' : 'border:1px solid #6d28d9;color:#f3e8ff'}">${esc(l.label)}</a>`).join('')}
</div></body></html>`;
}
function html(res, code, body, extra = {}) { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...extra }); res.end(body); }

// Gestisce /api/auth/*. Ritorna true se ha risposto.
async function route(req, res, url) {
  if (!url.pathname.startsWith('/api/auth/')) return false;
  if (url.pathname === '/api/auth/login') {
    const state = crypto.randomBytes(16).toString('hex');
    const q = new URLSearchParams({ client_id: CLIENT_ID(), redirect_uri: redirectUri(req), response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account', access_type: 'online' });
    res.writeHead(302, { location: AUTH_URL() + '?' + q, 'set-cookie': setCookie(req, 'pcs_st', state, 600), 'cache-control': 'no-store' });
    res.end(); return true;
  }
  if (url.pathname === '/api/auth/callback') {
    const retry = [{ href: '/api/auth/login', label: 'Riprova', primary: true }];
    const state = url.searchParams.get('state'), code = url.searchParams.get('code');
    const expected = cookies(req).pcs_st;
    if (url.searchParams.get('error')) { html(res, 403, page('Accesso annullato', 'Accesso annullato.', retry)); return true; }
    if (!code || !state || !expected || state !== expected) { html(res, 400, page('Sessione scaduta', 'Richiesta di accesso non valida o scaduta.', retry)); return true; }
    let claims;
    try {
      const r = await fetch(TOKEN_URL(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(), redirect_uri: redirectUri(req), grant_type: 'authorization_code' }) });
      const j = await r.json();
      if (!r.ok || !j.id_token) throw new Error(j.error_description || j.error || 'token non valido');
      // l'id_token arriva direttamente da Google via TLS dal token endpoint: si verificano audience, emittente e scadenza
      claims = JSON.parse(Buffer.from(j.id_token.split('.')[1], 'base64url').toString('utf8'));
      if (claims.aud !== CLIENT_ID()) throw new Error('audience errata');
      if (!/^(https:\/\/)?accounts\.google\.com$/.test(claims.iss || '')) throw new Error('emittente errato');
      if (claims.exp && claims.exp < Date.now() / 1000) throw new Error('token scaduto');
    } catch (e) {
      console.error('auth:', e.message);
      html(res, 502, page('Errore di accesso', 'Google non ha confermato l\'accesso. Riprova.', retry)); return true;
    }
    const email = String(claims.email || '').toLowerCase();
    if (!claims.email_verified || !ALLOWED().includes(email)) {
      console.warn('auth: account non autorizzato', email);
      html(res, 403, page('Non autorizzato', `L'account <b>${esc(email || 'sconosciuto')}</b> non e' autorizzato a usare questa app.`, [{ href: '/api/auth/login', label: 'Usa un altro account', primary: true }]),
        { 'set-cookie': [setCookie(req, 'pcs', '', 0), setCookie(req, 'pcs_st', '', 0)] });
      return true;
    }
    res.writeHead(302, { location: '/', 'set-cookie': [setCookie(req, 'pcs', makeSession({ email, name: claims.name, picture: claims.picture }), MAX_AGE), setCookie(req, 'pcs_st', '', 0)], 'cache-control': 'no-store' });
    res.end(); return true;
  }
  if (url.pathname === '/api/auth/logout') {
    res.writeHead(302, { location: '/', 'set-cookie': setCookie(req, 'pcs', '', 0), 'cache-control': 'no-store' }); res.end(); return true;
  }
  res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"Non trovato"}'); return true;
}

const loginPage = () => page('Accesso', 'Accesso riservato ai membri della band.', [{ href: '/api/auth/login', label: 'Accedi con Google', primary: true }]);

module.exports = { enabled, route, readSession, loginPage, ALLOWED, redirectUri, makeSession };
