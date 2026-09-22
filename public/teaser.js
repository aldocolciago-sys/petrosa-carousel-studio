// Petrosa Carousel Studio - caption per il Reel breve "solo hook": non e' il post per chi gia' ci segue,
// serve a farsi scoprire (For You / Esplora), quindi ha un testo suo, corto, con l'invito a vedere il resto sul profilo.
(function (root) {
  const HOOK = [
    'New around here? This is Petrosa.',
    'Stoner riffs, doom weight. Italy.',
    'This is what we sound like.',
    'One riff. That is the hook.',
    'Heavy, slow, Italian. Petrosa.'
  ];
  const FOLLOW = [
    'Full story on the profile.',
    'Carousel with the full story on the profile - follow for the rest.',
    'More riffs, more story: on the profile.',
    'Follow for the album, the lyrics and the story: all on the profile.'
  ];
  const TAGS = '#stonerrock #doommetal #newmusic #stonerdoom #heavymusic #petrosa';

  function pick(arr, seed) {
    const n = Math.abs(Math.round((seed || 1) * 99991)) % arr.length;
    return arr[n];
  }

  // hookText: il titolo/testo della slide-hook usata nel Reel (se assente, si usa una frase generica)
  function caption(hookText, seed) {
    const s = seed == null ? Date.now() : seed;
    const h = String(hookText || '').trim().replace(/^[«"“]+|[»"”]+$/g, '');
    const line1 = h ? `"${h}"` : pick(HOOK, s);
    const line2 = pick(FOLLOW, s + 7);
    return `${line1}\n\n${line2}\n\n${TAGS}`;
  }

  const api = { caption };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Teaser = api;
})(this);
