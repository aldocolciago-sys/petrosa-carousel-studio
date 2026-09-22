// Petrosa Carousel Studio - versione "Reel" di un post: testi accorciati per lo schermo intero del telefono.
// Regole: una frase per schermata, verso o recensione integrali (mai tagliati), copertina leggibile in un secondo.
// Modulo puro (nessun DOM): funziona nel browser (window.ReelCut) e in Node (test).
(function (root) {
  const clean = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  const words = t => clean(t).split(' ').filter(Boolean);

  // prima frase completa
  function firstSentence(t) {
    t = clean(t); if (!t) return '';
    const m = t.match(/^.*?[.!?…](?=\s+[A-Z0-9"'“(]|$)/);
    return m ? m[0] : t;
  }
  // taglia a max caratteri su un confine naturale (virgola, trattino, parola); mai a meta' parola
  function clip(t, max) {
    t = clean(t); if (t.length <= max) return t;
    const head = t.slice(0, max + 1);
    let cut = Math.max(head.lastIndexOf(', '), head.lastIndexOf(' - '), head.lastIndexOf('; '), head.lastIndexOf(': '));
    if (cut < max * 0.5) cut = head.lastIndexOf(' ');
    if (cut < 1) cut = max;
    return t.slice(0, cut).replace(/[\s,;:\-–—]+$/, '') + '.';
  }
  function sentences(t) { const out = []; let rest = clean(t); while (rest) { const f = firstSentence(rest); out.push(f); rest = clean(rest.slice(f.length)); } return out; }
  // tiene quante frasi intere entrano nel limite (almeno la prima, accorciata se serve).
  // Un elenco di membri ("Nome, ruolo.") conta come una sola idea: si tiene fino a 4 voci
  function oneLine(t, max, joinMax) {
    const ss = sentences(t); if (!ss.length) return '';
    const roster = ss.length >= 4 && ss.slice(0, 4).every(x => x.length <= 34);
    if (roster) return ss.slice(0, 4).join(' ');
    let out = ss[0];
    if (out.length > max) return clip(out, max);
    for (let i = 1; i < ss.length && (out + ' ' + ss[i]).length <= (joinMax || max); i++) out += ' ' + ss[i];
    return out;
  }
  const capWords = (t, n) => { const w = words(t); return w.length <= n ? clean(t) : w.slice(0, n).join(' ').replace(/[,;:\-–—]+$/, ''); };

  // limiti per tipo di layout (caratteri titolo / corpo)
  const LIM = {
    hook: { t: 46, b: 70 },
    photo: { t: 40, b: 80 },
    stat: { t: 14, b: 80 },
    text: { t: 44, b: 110 },
    cta: { t: 44, b: 70 },
    quote: { t: 60, b: 80 }
  };

  function cut(s) {
    if (!s) return s;
    const L = LIM[s.layout] || LIM.text;
    const r = Object.assign({}, s);
    if (s.layout === 'quote') {
      // il verso o la recensione restano interi e a tutto schermo: si toglie solo il contorno
      r.corpo = s.corpo ? oneLine(s.corpo, 80) : '';
      if (r.corpo.length > 80) r.corpo = '';
      r.titolo = clean(s.titolo);
      return r;
    }
    r.titolo = s.layout === 'stat' ? clean(s.titolo) : oneLine(s.titolo, L.t);
    if (s.layout === 'hook') r.titolo = capWords(r.titolo, 8);
    r.corpo = s.corpo ? oneLine(s.corpo, L.b, 52) : '';
    // se il corpo ripete il titolo, si toglie
    if (r.corpo && clean(r.corpo).toLowerCase() === clean(r.titolo).toLowerCase()) r.corpo = '';
    return r;
  }
  const cutAll = slides => (slides || []).map(cut);
  // statistiche per i test e per il messaggio all'utente
  function stats(slides) {
    const a = cutAll(slides);
    const chars = x => x.reduce((n, s) => n + clean(s.titolo).length + clean(s.corpo).length, 0);
    return { before: chars(slides || []), after: chars(a) };
  }

  const api = { cut, cutAll, firstSentence, clip, stats, LIM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ReelCut = api;
})(typeof window !== 'undefined' ? window : globalThis);
