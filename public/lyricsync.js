// Petrosa Carousel Studio - motore puro per "Video testi": tempo <-> riga del testo, e scelta del tratto
// da usare nel Reel dedicato a un brano. Nessun DOM: funziona nel browser (window.LyricSync) e in Node (test).
// Usato da reel.js (che ci mette sopra localStorage/UI) e dai test.
(function (root) {
  // tempo (s) in cui e' cantata la posizione normalizzata `pos` del testo, date le "ancore" (punti impostati a mano
  // nella scheda Audio & sync). song: {N: string, vStart, vEnd, dur}; anchors: [{pos, t}, ...] (non serve ordinato).
  // Stessa formula usata dal Reel del singolo post: interpolazione lineare tra le ancore, stima a velocita' costante
  // (vStart..vEnd) dove non ce ne sono.
  function timeOfPos(song, anchors, pos) {
    const L = Math.max(1, song.N.length), rate = (song.vEnd - song.vStart) / L;
    const A = (anchors || []).slice().sort((a, b) => a.pos - b.pos);
    if (!A.length) return song.vStart + pos * rate;
    if (pos <= A[0].pos) return Math.max(0, A[0].t - (A[0].pos - pos) * rate);
    for (let i = 1; i < A.length; i++) if (pos <= A[i].pos) { const a = A[i - 1], b = A[i]; return a.t + (b.t - a.t) * (pos - a.pos) / Math.max(1, b.pos - a.pos); }
    const l = A[A.length - 1]; return Math.min(song.dur, l.t + (pos - l.pos) * rate);
  }
  // vero solo se OGNI riga del testo ha un punto impostato esattamente sulla sua posizione (non solo interpolato/stimato):
  // e' la soglia che serve per poter usare QUALSIASI porzione del brano nel Video testi con fiducia nei tempi.
  function fullySynced(lines, anchors) {
    if (!lines || !lines.length) return false;
    const A = anchors || [];
    return lines.every(l => A.some(a => a.pos === l.pos));
  }
  function syncCount(lines, anchors) {
    const A = anchors || [];
    return { done: (lines || []).filter(l => A.some(a => a.pos === l.pos)).length, total: (lines || []).length };
  }
  // tempo di inizio di ogni riga del testo
  function lineTimes(song, anchors, lines) { return (lines || []).map(l => timeOfPos(song, anchors, l.pos)); }
  // durata a schermo di ogni riga (fino all'inizio della successiva, o alla fine del brano per l'ultima), con limiti min/max
  // cosi' una riga cantata in fretta resta leggibile e una tenuta a lungo non blocca il video troppo tempo su una frase sola.
  // E' una STIMA (usata per suggerire quante righe entrano in circa 45-90 s): non va usata per programmare davvero il
  // cambio riga di un Video testi gia' sincronizzato, altrimenti una pausa piu' lunga del massimo viene accorciata e il
  // video passa alla riga dopo prima che sia davvero cantata - da quel punto in poi resta permanentemente sfasato
  // rispetto all'audio (per quello si usa lineDursExact).
  function lineDurs(times, dur, minLine, maxLine) {
    minLine = minLine == null ? 1.1 : minLine; maxLine = maxLine == null ? 6.5 : maxLine;
    const n = times.length, d = [];
    for (let i = 0; i < n; i++) { const raw = i < n - 1 ? times[i + 1] - times[i] : Math.max(0, dur - times[i]); d.push(Math.max(minLine, Math.min(maxLine, raw))); }
    return d;
  }
  // come lineDurs, ma per programmare la riproduzione VERA di un brano completamente sincronizzato (ogni riga ha il
  // suo punto esatto): l'intervallo fra una riga e la successiva e' quello reale, mai accorciato ne' allungato - anche
  // quando c'e' una pausa lunga nel mezzo, il video aspetta e cambia riga esattamente quando viene davvero cantata,
  // cosi' tutto cio' che segue resta sincronizzato con l'audio. Solo l'ultima riga (che non ha una riga dopo a cui
  // agganciarsi) usa una durata di lettura stimata, con gli stessi limiti min/max di lineDurs.
  function lineDursExact(times, dur, minLine, maxLine) {
    minLine = minLine == null ? 1.1 : minLine; maxLine = maxLine == null ? 6.5 : maxLine;
    const n = times.length, d = [];
    for (let i = 0; i < n; i++) {
      if (i < n - 1) d.push(Math.max(0, times[i + 1] - times[i]));
      else d.push(Math.max(minLine, Math.min(maxLine, Math.max(0, dur - times[i]))));
    }
    return d;
  }
  // indice della riga in corso al tempo t (-1 se prima della prima riga); times deve essere non-decrescente
  function lineAt(times, t) { let i = -1; for (let k = 0; k < times.length; k++) { if (times[k] <= t) i = k; else break; } return i; }
  // PRNG deterministico minimo (stessa formula usata nel resto dell'app): a parita' di brano e ordine delle righe
  // lo sfondo scelto e' sempre lo stesso, non cambia a ogni rigenerazione del video
  function rng32(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  // sfondo del Video testi: assegna un'immagine a ogni riga del testo, cambiando a OGNI riga (una transizione a ogni
  // cambio di frase), mai la stessa immagine due volte consecutive - ma si puo' ripetere piu' avanti nel video (con
  // poche foto disponibili e molte righe e' inevitabile, e va bene cosi'). "pool" e' l'elenco delle chiavi immagine
  // disponibili (membri della band, sfondi, logo, copertina); "seed" rende la sequenza stabile per lo stesso brano
  // (non cambia a ogni rigenerazione del video). Il primo argomento serve solo a contare le righe (una voce per
  // riga: durate o testi, non importa cosa contiene).
  function backgroundSchedule(lines, pool, seed) {
    const n = (lines || []).length;
    if (!n || !pool || !pool.length) return Array(n).fill('none');
    const rnd = rng32(seed || 1);
    const order = pool.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
    const out = []; let cur = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        cur = (cur + 1) % order.length;
        if (order.length > 1 && order[cur] === out[i - 1]) cur = (cur + 1) % order.length;
      }
      out.push(order[cur]);
    }
    return out;
  }
  // tratto di testo (indici riga: da "from" a "to" esclusa) che copre circa "target" secondi (mai oltre "max"),
  // a partire dalla riga from0: e' il tratto proposto di default per il video (il brano intero e' quasi sempre troppo
  // lungo per un Reel - decine di minuti - anche quando e' sincronizzato per intero)
  function suggestRange(durs, target, max, from0) {
    target = target == null ? 45 : target; max = max == null ? 90 : max; from0 = from0 || 0;
    const n = durs.length; if (!n) return { from: 0, to: 0 };
    const from = Math.max(0, Math.min(from0, n - 1));
    let len = 0, to = from;
    while (to < n && len < target && len + durs[to] <= max) { len += durs[to]; to++; }
    if (to === from) to = Math.min(n, from + 1);
    return { from, to };
  }

  const api = { timeOfPos, fullySynced, syncCount, lineTimes, lineDurs, lineDursExact, lineAt, suggestRange, backgroundSchedule };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LyricSync = api;
})(typeof window !== 'undefined' ? window : globalThis);
