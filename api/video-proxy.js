// Funzione "Edge" di Vercel (non una Funzione Serverless Node come api/index.js): gira su un runtime a
// stream, senza il limite di 4,5 MB sul corpo della richiesta che hanno le Funzioni Serverless Node.
//
// A cosa serve: il bucket dei VIDEO di PostFast non manda intestazioni CORS sull'URL firmato che restituisce
// (la loro stessa documentazione mostra il PUT del video fatto solo lato server - Node/Python/cURL - mai da
// un browser), quindi un caricamento diretto browser->PostFast viene bloccato dal browser per policy CORS.
// Le immagini non hanno questo problema perche' passano gia' dal nostro server (vedi uploadSlide in
// core/handler.js): una richiesta server-to-server non e' mai soggetta a CORS. Qui si fa lo stesso per i
// video: il browser manda il file A NOI (stesso dominio dell'app: niente CORS), e noi lo giriamo con una PUT
// verso l'URL firmato del bucket. Serve il runtime Edge (streaming) invece di aggiungere questa via in
// api/index.js perche' un video puo' superare facilmente i 4,5 MB che le Funzioni Serverless Node di Vercel
// accettano in ingresso.
//
// In locale (node run.js) la STESSA richiesta e' gestita invece da core/handler.js (videoProxyPut): questo
// file viene usato solo quando l'app gira davvero su Vercel (vedi il rewrite in vercel.json che esclude
// proprio questo percorso dal passare per api/index.js).

export const config = { runtime: 'edge' };

// stessa whitelist di core/handler.js: si inoltra solo verso i bucket usati dagli URL firmati di PostFast,
// mai verso un host arbitrario passato dal client.
const HOST_OK = /(\.cloudflarestorage\.com|\.amazonaws\.com)$/i;

export default async function handler(req) {
  if (req.method !== 'PUT') return new Response('Method not allowed', { status: 405 });

  const target = new URL(req.url).searchParams.get('target');
  if (!target) return new Response('Parametro "target" mancante.', { status: 400 });

  let t;
  try { t = new URL(target); } catch { return new Response('URL di destinazione non valido.', { status: 400 }); }
  if (!HOST_OK.test(t.hostname)) return new Response('Host di destinazione non consentito.', { status: 400 });

  const contentType = req.headers.get('content-type') || 'application/octet-stream';
  let put;
  try {
    // il corpo passa in streaming (req.body e' un ReadableStream): niente buffering in memoria, niente
    // limite dei 4,5 MB delle Funzioni Serverless Node.
    put = await fetch(t, { method: 'PUT', headers: { 'content-type': contentType }, body: req.body, duplex: 'half' });
  } catch (e) {
    return new Response('Upload verso PostFast non riuscito: ' + (e && e.message), { status: 502 });
  }
  const body = await put.text().catch(() => '');
  return new Response(body, { status: put.status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
