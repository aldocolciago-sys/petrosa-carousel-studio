// Petrosa Carousel Studio - feedback locale (👍/👎) sui post del piano settimanale.
// Resta solo nel browser di chi lo usa (nessun invio a server): serve a scoraggiare un po' i contenuti
// segnati "no" e a mostrare quali mood, finora, hanno preso piu' 👍 che 👎. Mai un divieto assoluto.
(function (root) {
  const KEY = 'petrosa.feedback';
  const NULL_STORE = { getItem: () => null, setItem: () => {} };
  const realStore = store => store || (typeof localStorage !== 'undefined' ? localStorage : NULL_STORE);

  function load(store) { try { return JSON.parse(realStore(store).getItem(KEY) || '{}'); } catch { return {}; } }
  function save(store, data) { try { realStore(store).setItem(KEY, JSON.stringify(data)); } catch { /* ok senza memoria */ } }

  // gli stessi id di contenuto usati da "recent()" in studio.js: hook/cta/caption citati nel post, foto di copertina
  function idsOf(post) {
    const cov = post && post.slides && post.slides[0] && post.slides[0].immagine;
    const ids = [...(post && post.slides || []).map(s => s._ref && s._ref.libId), post && post.captionId, cov && !['cover', 'logo', 'none'].includes(cov) ? 'cp-' + cov : null];
    return [...new Set(ids.filter(Boolean))];
  }

  // rating: 1 (va bene) o -1 (non va bene). mood: facoltativo, per l'insight per-mood.
  function rate(post, rating, mood, store) {
    const data = load(store); data.items = data.items || {}; data.moods = data.moods || {};
    for (const id of idsOf(post)) { const c = data.items[id] || { up: 0, down: 0 }; if (rating > 0) c.up++; else c.down++; data.items[id] = c; }
    if (mood) { const m = data.moods[mood] || { up: 0, down: 0 }; if (rating > 0) m.up++; else m.down++; data.moods[mood] = m; }
    save(store, data);
    return data;
  }

  // id da scoraggiare un po' di piu' nelle prossime proposte: hanno preso piu' 👎 che 👍 (peso minore in libreria, non un divieto)
  function badIds(store) {
    const data = load(store);
    return Object.entries(data.items || {}).filter(([, c]) => c.down > c.up).map(([id]) => id);
  }

  // classifica dei mood per 👍 - 👎 (solo quelli con almeno un paio di voti, altrimenti e' rumore)
  function insight(store) {
    const data = load(store);
    return Object.entries(data.moods || {}).map(([mood, c]) => ({ mood, up: c.up, down: c.down, n: c.up + c.down, score: c.up - c.down }))
      .filter(r => r.n >= 2).sort((a, b) => b.score - a.score || b.n - a.n);
  }

  function rated(post, store) {
    const data = load(store), ids = idsOf(post);
    let up = 0, down = 0;
    for (const id of ids) { const c = (data.items || {})[id]; if (c) { up += c.up; down += c.down; } }
    return up === 0 && down === 0 ? null : (up >= down ? 'up' : 'down');
  }

  function clear(store) { save(store, {}); }

  const api = { rate, badIds, insight, rated, idsOf, clear, KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Feedback = api;
})(this);
