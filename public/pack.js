// Petrosa Carousel Studio - cartella "pronta da pubblicare" per il telefono: nomi dei file e testi (caption da copiare, istruzioni, tag).
// Modulo puro (nessun DOM): funziona nel browser (window.Pack) e in Node (test).
(function (root) {
  const pad = i => String(i + 1).padStart(2, '0');
  const DIR = { post: '1-carosello', reel: '2-reel' };

  // caption + hashtag: un unico blocco da copiare e incollare in Instagram / TikTok
  const captionFile = full => String(full || '').trim().replace(/\r\n/g, '\n') + '\n';

  function tagFile(slides) {
    const lines = (slides || []).map((s, i) => (s.tag && s.tag.length) ? `Slide ${pad(i)} (${pad(i)}.png): ${s.tag.map(t => '@' + t).join('  ')}` : '').filter(Boolean);
    return lines.length ? 'Tagga questi account sulla slide indicata (Instagram > Tagga persone):\n\n' + lines.join('\n') + '\n' : 'Nessun tag da inserire sulle foto: le @menzioni sono gia\' nella caption.\n';
  }

  function howTo({ n, hasReel, whenLines }) {
    const L = ['COME PUBBLICARE SU INSTAGRAM E TIKTOK (dal telefono)', ''];
    let k = 1;
    L.push(`${k++}. Porta questa cartella sul telefono (Drive, AirDrop, cavo) e salva le immagini di "${DIR.post}" nella galleria${hasReel ? ' insieme al video di "' + DIR.reel + '"' : ''}.`);
    L.push(`${k++}. CAROSELLO - Instagram: tocca +  >  Post  >  icona selezione multipla, e scegli le ${n} slide in ordine (01, 02, 03...).`);
    L.push(`${k++}. Apri caption.txt, tieni premuto, "Seleziona tutto", copia e incolla nel campo didascalia (caption e hashtag sono gia' insieme).`);
    L.push(`${k++}. Apri tag-sulle-foto.txt: se ci sono account elencati, usa "Tagga persone" sulla slide indicata.`);
    L.push(`${k++}. Pubblica. Poi TikTok: + > Foto > stesse slide nello stesso ordine, stessa caption.`);
    if (hasReel) L.push(`${k++}. REEL - Instagram: + > Reel > scegli il video "reel.mp4" dalla galleria, incolla la stessa caption. TikTok: + > carica il video e incolla la caption. La musica e' gia' nel video.`);
    if (whenLines && whenLines.length) { L.push('', 'ORARI CONSIGLIATI (pubblico USA e Nord Europa):', ...whenLines.map(x => '- ' + x)); }
    else L.push('', 'Suggerimento: per il pubblico USA / Nord Europa pubblica la sera italiana (pranzo / primo pomeriggio sulla costa est).');
    L.push('');
    return L.join('\n');
  }

  // elenco ordinato dei file della cartella (per i test e per lo ZIP)
  function names({ n, hasReel, reelExt }) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(`${DIR.post}/${pad(i)}.png`);
    if (hasReel) out.push(`${DIR.reel}/reel.${reelExt || 'mp4'}`);
    out.push('caption.txt', 'tag-sulle-foto.txt', 'COME-PUBBLICARE.txt');
    return out;
  }

  // calendario del piano settimanale (file di testo in cima allo ZIP)
  function planFile(days, describe) {
    const L = ['PIANO DELLA SETTIMANA - Petrosa', ''];
    days.forEach(d => {
      L.push(`GIORNO ${d.day}${d.slotLabel ? ' - ' + d.slotLabel : ''}: ${d.label} (${d.slides.length} slide, Reel su brano ${String(d.reel.song).padStart(2, '0')})`);
      if (d.when && describe) { L.push('  Carosello: ' + describe(new Date(d.when.carousel))); L.push('  Reel:      ' + describe(new Date(d.when.reel))); }
      L.push('  Cartella: ' + folder(d)); L.push('  Copertina: ' + String(d.slides[0].titolo || '').replace(/\s+/g, ' ')); L.push('');
    });
    return L.join('\n');
  }
  // include la fascia (noon/evening/midnight) nel nome: 3 post al giorno possono condividere sia "day" che "topic",
  // e senza la fascia due cartelle diverse rischierebbero di chiamarsi allo stesso modo e sovrascriversi nello ZIP.
  const folder = d => `giorno-${String(d.day).padStart(2, '0')}-${String(d.slot || 'post')}-${String(d.topic || 'post')}`;
  const api = { planFile, folder, DIR, pad, captionFile, tagFile, howTo, names };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Pack = api;
})(typeof window !== 'undefined' ? window : globalThis);
