// Petrosa Carousel Studio - server (Node 18+, nessuna dipendenza esterna)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');

// ---------- .env ----------
(function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env) || !process.env[m[1]]) process.env[m[1]] = v;
  }
})();

const PORT = parseInt(process.env.PORT || '3000', 10);
const ANTHROPIC_KEY = () => process.env.ANTHROPIC_API_KEY || '';
const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const POSTFAST_KEY = () => process.env.POSTFAST_API_KEY || '';
const POSTFAST_URL = () => (process.env.POSTFAST_API_URL || 'https://api.postfa.st').replace(/\/$/, '');

// ---------- Dati ----------
const LIB = require('../library');
const AUTH = require('./auth');
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function loadSongs() {
  const txt = fs.readFileSync(path.join(DATA, 'songs.txt'), 'utf8').replace(/\r/g, '');
  return txt.split(/^## /m).filter(Boolean).map(block => {
    const [head, ...lines] = block.split('\n');
    const [num, title] = head.split('|').map(s => s.trim());
    return { n: parseInt(num, 10), title, lyrics: lines.join('\n').trim() };
  });
}
function loadAll() {
  const band = readJSON(path.join(DATA, 'band.json'), {});
  const extra = readJSON(path.join(DATA, 'extra-reviews.json'), []);
  band.reviews = [...(band.reviews || []), ...extra.map(r => ({ ...r, extra: true }))];
  band.songs = loadSongs();
  return band;
}

function loadTags() {
  return readJSON(path.join(DATA, 'tags.json'), { similarBands: [], community: [], hashtags: { core: [], identity: [], local: [] } });
}
const allTaggable = t => [...t.similarBands, ...t.community];
const usableHandles = t => allTaggable(t).filter(b => b.handle && b.confirmed).map(b => b.handle.replace(/^@/, ''));

function knowledgeBase(d) {
  const t = loadTags();
  const a = d.album;
  let s = '';
  s += `# BAND\nNome: ${d.band.name} (${d.band.city}), fondata nel ${d.band.founded}. Genere: ${d.band.genre}. Motto: "${d.band.tagline}".\nFFO: ${d.band.ffo}.\n${d.band.bio}\nHandle Instagram: ${d.handle}\n\n`;
  s += `# ALBUM\n${a.title}, uscito il ${a.release} per ${a.label}. ${a.tracks} tracce, durata ${a.runtime}. Singoli: ${a.singles.join(', ')}.\nStudio: ${a.studio}. Registrazione: ${a.recording}.\nTemi: ${a.themes}.\nTracklist: ${a.tracklist.map((t, i) => `${i + 1}. ${t}`).join(' | ')}\n`;
  s += `Doom Charts: ${a.doomCharts.issue} - posizione #${a.doomCharts.position} con ${a.doomCharts.points} punti su ${a.doomCharts.pool} album nominati. ${a.doomCharts.note}\n\n`;
  s += `# LINK\nSpotify: ${d.links.spotify}\nVideo Revenant: ${d.links.youtubeRevenant}\nBandcamp: ${d.links.bandcamp}\nCD: ${d.links.cd}\n\n`;
  s += `# MEMBRI (id foto tra parentesi)\n` + d.members.map(m => `- ${m.name} - ${m.role} (foto: ${m.photo}). ${m.bio}`).join('\n') + '\n\n';
  s += `# RECENSIONI E ARTICOLI (citazioni originali, da riportare letteralmente)\n` + d.reviews.map(r => `- [${r.id}] ${r.publication} | autore: ${r.author} | esito: ${r.verdict}\n  "${r.quote}"\n  URL: ${r.url}`).join('\n') + '\n\n';
  s += `# BAND SIMILI (da recensioni ed EPK) E TAG\n` + t.similarBands.map(b => `- ${b.name} [${b.tier}] hashtag: #${b.hashtag} | ${b.handle && b.confirmed ? '@' + b.handle.replace(/^@/, '') + ' (menzione consentita)' : 'NESSUNA menzione @ consentita'} | perche': ${b.evidence}`).join('\n') + '\n';
  s += t.community.map(b => `- ${b.name} hashtag: #${b.hashtag} | ${b.handle && b.confirmed ? '@' + b.handle : 'NESSUNA menzione @ consentita'}`).join('\n') + '\n';
  s += `Hashtag core stoner/doom: ${t.hashtags.core.map(h => '#' + h).join(' ')}\nHashtag identita': ${t.hashtags.identity.map(h => '#' + h).join(' ')}\nHashtag locali: ${t.hashtags.local.map(h => '#' + h).join(' ')}\n\n`;
  s += `# TESTI DELLE CANZONI (originali in inglese, da riportare letteralmente)\n` + d.songs.map(x => `## ${String(x.n).padStart(2, '0')} ${x.title}\n${x.lyrics}`).join('\n\n');
  return s;
}

const SYSTEM_PROMPT = `# Ruolo e Obiettivo
Agisci come un Content Creator esperto di Social Media Marketing e Copywriting. Crei **post carosello ad alto impatto** sulla band Petrosa (stoner/doom, Milano), ottimizzati per Instagram e TikTok, strutturati per massimizzare salvataggi, condivisioni e interazioni. Lo scopo e' attirare nuovi follower che siano fan di stoner e doom.

# Regole di struttura (7-10 slide)
- Slide 1 (Copertina / Hook): fa riferimento a un brano specifico dell'album Roadburn Chronicles, all'album, alla band o a un suo membro, oppure a un articolo o recensione. Deve fermare lo scroll.
- Slide 2 (Canzone/Articolo): cita il testo di una canzone dei Petrosa e poi il titolo della canzone, OPPURE un passaggio di una recensione/articolo citando testata e autore.
- Slide 3 (Album): fa riferimento all'album, alle Doom Charts, ad altre recensioni, al genere musicale.
- Slide 4 (Band): cita l'intera band o un membro, con foto. Se il focus e' un membro, la sua foto compare in UNA sola slide (la Band); la copertina usa l'immagine "cover", mai la foto del membro; le altre slide non mostrano altri membri.
- Slide intermedie extra (se servono per arrivare al numero richiesto): recensioni, curiosita' su studio/registrazione, temi del disco, altri versi. Ogni slide un solo concetto.
- Ultima slide: invita ad ascoltare l'album su Spotify.

# Creativita' (fondamentale)
Ogni carosello deve sembrare scritto da zero da una persona con un'idea, non compilato da un modulo. Rielabora con fantasia: scegli un ANGOLO NARRATIVO diverso ogni volta (per esempio: storytelling della registrazione in otto giorni, provocazione ai fan del desert rock, "POV: sei su un furgone con questo disco in cassa", un verso letto come manifesto, un confronto tra due recensioni, un mini-racconto sulla nascita del riff, una domanda che divide i fan, un conto alla rovescia dei momenti piu' pesanti). Titoli con voce, ritmo, immagini forti; mai frasi da comunicato stampa, mai formule generiche ("Turn it up", "Check it out", "Out now" da soli). I FATTI (date, nomi, punteggi, citazioni) restano quelli della base di conoscenza; il modo di raccontarli e' libero. Non riusare le stesse frasi di un carosello precedente: se ti viene data una lista "DA NON RIPETERE", evita quei titoli e quegli angoli.

# Caption (deve avere contesto)
La caption e' scritta apposta per QUESTO carosello e deve nominare cio' che si vede nelle slide (il brano o il verso scelto, la recensione e la testata, il membro, il dato delle Doom Charts) e spiegare in una o due frasi perche' vale la pena, con un dettaglio concreto (studio, strumenti, tema del brano, cosa dice il recensore). Struttura: prima riga forte che ferma lo scroll (senza ripetere il titolo della slide 1); 2-3 brevi paragrafi con contesto e racconto; una domanda vera che invita a commentare (legata al contenuto, non "what do you think?"); call to action all'ascolto su Spotify ("link in bio"); menzioni @ inserite in modo naturale dentro il testo. 500-1200 caratteri, righe vuote tra i paragrafi, niente hashtag nel testo (vanno nel campo hashtags), niente emoji a raffica (al massimo 1-2 se servono).

# Tono di voce
Diretto, autorevole, amichevole ma senza fronzoli. Frasi corte. Spazi bianchi mentali. TUTTI I TESTI DELLE SLIDE, LA CAPTION E GLI HASHTAG DEVONO ESSERE IN INGLESE (pubblico: USA e Nord Europa). Le citazioni restano letterali; non usare citazioni non in inglese.

# Regole di accuratezza (fondamentali)
- Usa SOLO i fatti presenti nella base di conoscenza. Non inventare recensioni, punteggi, date, nomi o versi.
- Ogni citazione (campo "citazione") deve essere copiata LETTERALMENTE dai testi o dalle recensioni forniti. Se accorci, usa "..." tra i frammenti, senza riscrivere nulla. Le citazioni devono stare in 260 caratteri al massimo.
- Nel campo "fonte" indica titolo del brano oppure "Autore, Testata".
- Le foto disponibili sono: cover (copertina album), logo, antonio, giorgio, aldo, andrea. Nella slide Band usa la foto di un membro o (per tutta la band) "logo".
- Titoli brevi (massimo ~60 caratteri), corpo massimo ~200 caratteri: le slide sono immagini 1080x1350 con testo grande.
- Layout ammessi: hook (copertina con immagine a tutto schermo), quote (citazione), stat (numero grande, es. "#14"), photo (foto membro), text (titolo + testo), cta (invito finale).

# Strategia dei tag (obiettivo: attirare follower delle altre band stoner/doom)
- Le band "simili" sono quelle che le recensioni e l'EPK paragonano ai Petrosa (sezione BAND SIMILI della base di conoscenza). Le band [primary] sono citate da piu' recensioni: privilegiale.
- Menzioni @: usa SOLO gli handle marcati "menzione consentita", mai altri e mai inventati. Scegli 3-6 band pertinenti al filo del carosello (es. se parli del sound fuzz: Dozer, Orange Goblin, Fu Manchu, Monster Magnet) e inseriscile in modo naturale nella caption, con una frase tipo "For fans of @dozer_band and @orangegoblinofficial (in inglese)". Elencale nel campo "menzioni" (senza @).
- Nella slide Album (o in una slide dedicata "Per chi ama") nomina le band di paragone, attribuendo il paragone alla testata che lo fa (es. "Steve Howe, Outlaws Of The Sun: Kyuss, Orange Goblin, Dozer"). Metti gli handle usati nel campo "tag" della slide.
- Non affermare mai che una band "suona come" un'altra se non lo dice una fonte: scrivi "citata da <testata>" o "nel FFO dell'EPK".
- Hashtag: 15-20, senza #, in questo ordine di priorita': (1) generi stoner/doom (#stonerrock #doommetal #stonerdoom #desertrock #fuzz ...), (2) hashtag delle band simili pertinenti (#kyuss #orangegoblin ...), (3) identita' (#petrosa #roadburnchronicles #octopusrising), (4) reach internazionale (#undergroundmetal #heavyunderground #nordicmetal) e al massimo due locali (#italianmetal #milano). Nessun hashtag generico tipo #love o #music.

# Output
Rispondi SOLO chiamando lo strumento crea_carosello. Per ogni slide compila: tipo, layout, visual (descrizione grafica: colori, elementi, sfondo), titolo (testo grande), corpo (testo di supporto breve), servizio (elementi di servizio: handle, numerazione, swipe), immagine, e se pertinente citazione, fonte, stat. Poi la caption per la pubblicazione (con call to action e link in bio) e gli hashtag pertinenti (12-18, mix stoner/doom/heavy, USA e Nord Europa, senza il simbolo # nel testo dell'array).`;

const CAROUSEL_TOOL = {
  name: 'crea_carosello',
  description: 'Restituisce il carosello completo e la caption.',
  input_schema: {
    type: 'object',
    properties: {
      argomento: { type: 'string', description: 'Sintesi in 5-8 parole del filo conduttore del carosello' },
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: ['Cover', 'Content', 'Song', 'Review', 'Album', 'Band', 'Analysis', 'CTA'] },
            layout: { type: 'string', enum: ['hook', 'quote', 'stat', 'photo', 'text', 'cta'] },
            visual: { type: 'string' },
            titolo: { type: 'string' },
            corpo: { type: 'string' },
            servizio: { type: 'string' },
            immagine: { type: 'string', enum: ['cover', 'logo', 'antonio', 'giorgio', 'aldo', 'andrea', 'none'] },
            citazione: { type: 'string' },
            fonte: { type: 'string' },
            stat: { type: 'string' },
            tag: { type: 'array', items: { type: 'string' }, description: 'Handle (senza @) mostrati sulla slide, solo tra quelli consentiti' }
          },
          required: ['tipo', 'layout', 'visual', 'titolo', 'corpo', 'servizio', 'immagine']
        }
      },
      stile: {
        type: 'object',
        description: 'Stile grafico del carosello, scelto per essere a tono con l\'argomento, il genere e le band citate (es. Kyuss/Fu Manchu = dunes+desert, Sabbath/doom = smoke o mountains + mono/bloodmoon, Monster Magnet/psych = psychedelic + acid/ultraviolet, strada = road+rust). VARIA sempre rispetto agli stili gia usati.',
        properties: {
          sfondo: { type: 'string', enum: ['smoke', 'dunes', 'sunburst', 'psychedelic', 'cracked', 'halftone', 'road', 'waves', 'mountains'] },
          palette: { type: 'string', enum: ['ember', 'desert', 'swamp', 'bloodmoon', 'acid', 'mono', 'nordic', 'rust', 'ultraviolet', 'bone'] },
          font: { type: 'string', enum: ['classic', 'gothic', 'poster', 'bold', 'fashion', 'typewriter', 'chunky', 'western'] },
          foto: { type: 'string', enum: ['natural', 'duotone', 'mono'] },
          copertina: { type: 'string', enum: ['photo', 'frame'] }
        },
        required: ['sfondo', 'palette', 'font', 'foto', 'copertina']
      },
      caption: { type: 'string', description: 'Caption completa con call to action, link in bio e @menzioni nel testo (senza hashtag: vanno nel campo hashtags)' },
      menzioni: { type: 'array', items: { type: 'string' }, description: 'Handle (senza @) menzionati nella caption, solo tra quelli consentiti' },
      hashtags: { type: 'array', items: { type: 'string' } }
    },
    required: ['argomento', 'slides', 'stile', 'caption', 'menzioni', 'hashtags']
  }
};

// ---------- Utilita' ----------
const norm = s => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
function verifyQuotes(slides, d) {
  const pool = norm(d.songs.map(s => s.lyrics).join(' ') + ' ' + d.reviews.map(r => r.quote).join(' '));
  for (const s of slides) {
    if (!s.citazione) { s.verified = null; continue; }
    const parts = s.citazione.split(/\s*(?:\.{3}|…)\s*|\s\/\s/).map(norm).filter(p => p.length > 3);
    s.verified = parts.length > 0 && parts.every(p => pool.includes(p));
  }
  return slides;
}

function describeFocus(p, d) {
  switch (p.focus) {
    case 'song': {
      const s = d.songs.find(x => String(x.n) === String(p.item));
      return s ? `Focus del carosello: il brano "${s.title}" (traccia ${s.n}). La slide 1 e la slide 2 devono ruotare attorno a questo brano.
REGOLE PER IL FOCUS SU UN BRANO (obbligatorie):
1) Ogni verso citato (campo "citazione") deve provenire ESCLUSIVAMENTE dal testo di "${s.title}". Mai versi di altri brani. Puoi usare piu' passaggi dello stesso testo, in slide diverse. Le altre citazioni possono essere solo recensioni.
2) Inserisci UNA slide con tipo "Analysis" e layout "text": una breve lettura del testo in chiave di SOCIALITA' PROFONDA (relazioni, appartenenza, solitudine condivisa, ascolto, conflitto, lutto, comunita', ruoli imposti dagli altri: cio' che il testo dice davvero sul modo in cui stiamo con gli altri). Titolo forte (max 60 caratteri), corpo max ~260 caratteri, appoggiato a 1-3 frammenti LETTERALI del testo tra virgolette. Presentala come "a reading" / "our reading", mai come intenzione certa degli autori: non inventare significati che il testo non supporta. Se il testo e' brevissimo (es. Dreamer's Sunsets), dichiaralo e non gonfiarlo.
3) La caption diventa ESTESA (900-1400 caratteri): apre con una riga forte, sviluppa la stessa analisi sulla socialita' profonda citando frammenti letterali del brano tra virgolette, poi indica traccia e "Stream on Spotify (link in bio)", chiude con una domanda vera al pubblico. Le menzioni @ (solo consentite) restano in fondo ("For fans of ...").
Testo completo del brano, da usare per citare e analizzare:
<<<
${s.lyrics}
>>>` : '';
    }
    case 'review': {
      const r = d.reviews.find(x => x.id === p.item);
      return r ? `Focus del carosello: la recensione/articolo di ${r.publication} (${r.author}). La slide 1 fa riferimento a questa fonte e la slide 2 ne cita un passaggio letterale.` : '';
    }
    case 'member': {
      const m = d.members.find(x => x.id === p.item);
      return m ? `Focus del carosello: ${m.name} (${m.role}). La slide 4 mostra la sua foto; la slide 1 fa riferimento a lui.` : '';
    }
    case 'album': return 'Focus del carosello: l\'album Roadburn Chronicles nel suo insieme (temi, registrazione, singoli).';
    case 'doomcharts': return 'Focus del carosello: l\'ingresso al #14 delle Doom Charts di agosto 2026.';
    case 'custom': return `Focus del carosello, testo fornito dall'utente (usalo come punto di partenza, verificando i fatti sulla base di conoscenza):\n"""${p.custom || ''}"""`;
    default: return 'Focus: scegli tu l\'angolo piu\' efficace e originale tra brani, recensioni, membri, album, Doom Charts. Evita ovvieta\'.';
  }
}

async function callAnthropic(body) {
  const r = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Anthropic API ${r.status}`);
  return j;
}

// Filtra menzioni non consentite, normalizza hashtag, garantisce i tag core
function sanitizeTags(out) {
  const t = loadTags();
  const ok = new Set(usableHandles(t).map(h => h.toLowerCase()));
  const clean = h => String(h || '').replace(/^@/, '').trim();
  out.menzioni = [...new Set((out.menzioni || []).map(clean).filter(h => ok.has(h.toLowerCase())))];
  for (const sl of out.slides || []) sl.tag = [...new Set((sl.tag || []).map(clean).filter(h => ok.has(h.toLowerCase())))];
  // rimuove @menzioni non consentite eventualmente scritte nella caption
  out.caption = String(out.caption || '').replace(/@([A-Za-z0-9._]*[A-Za-z0-9_])/g, (m, h) => ok.has(h.toLowerCase()) ? m : h);
  const missing = out.menzioni.filter(h => !out.caption.toLowerCase().includes('@' + h.toLowerCase()));
  if (missing.length) out.caption += `\n\nFor fans of: ${missing.map(h => '@' + h).join(' ')}`;
  const seen = new Set();
  const must = ['petrosa', 'roadburnchronicles', 'stonerrock', 'doommetal', 'stonerdoom'];
  out.hashtags = [...(out.hashtags || []), ...must].map(h => String(h).replace(/[#\s]/g, '').toLowerCase()).filter(h => h && !seen.has(h) && seen.add(h)).slice(0, 25);
  return out;
}

// ---------- Generazione ----------
const MOODS = {
  riff: 'Riff & Fuzz - energia, volume alto, groove, riff bassi',
  doom: 'Doom & Peso - buio, pietra, peccato, il lato piu\' pesante del disco',
  psych: 'Desert & Psych - miraggi, fuzz caldo, atmosfera desert rock alla Kyuss',
  intro: 'Introspettivo - perdita, dubbio, un filo di luce, il lato umano del disco',
  road: 'On the road - furgone, strada aperta, cielo enorme',
  proof: 'Riconoscimenti - Doom Charts #14 e recensioni come prova sociale',
  fans: 'Per i fan - punta ai follower di Dozer, Orange Goblin, Kyuss e band simili'
};

async function generate(p) {
  const d = loadAll();
  const n = Math.min(10, Math.max(7, parseInt(p.slides, 10) || 8));
  if (!ANTHROPIC_KEY()) throw new Error('Modalita\' Claude non attiva: manca ANTHROPIC_API_KEY. Usa le proposte dalla libreria.');

  const moodLine = MOODS[p.mood] ? `Mood richiesto: ${MOODS[p.mood]}. Scegli angolo, lessico e immagini coerenti con questo mood.\n` : '';
  const avoid = (p.avoid || []).slice(0, 12).map(x => '- ' + String(x).slice(0, 120)).join('\n');
  const userText = `${describeFocus(p, d)}\n${moodLine}${avoid ? 'DA NON RIPETERE (caroselli precedenti):\n' + avoid + '\n' : ''}Numero di slide: ${n} (esattamente).\n${p.notes ? `Indicazioni aggiuntive dell'utente: ${p.notes}\n` : ''}Seme creativo (usalo per variare l'angolo): ${Math.floor(Math.random() * 1e6)}.\nCrea il carosello.`;
  const j = await callAnthropic({
    model: MODEL(),
    max_tokens: 4096,
    temperature: 1,
    system: [
      { type: 'text', text: SYSTEM_PROMPT },
      { type: 'text', text: 'BASE DI CONOSCENZA\n\n' + knowledgeBase(d), cache_control: { type: 'ephemeral' } }
    ],
    tools: [CAROUSEL_TOOL],
    tool_choice: { type: 'tool', name: 'crea_carosello' },
    messages: [{ role: 'user', content: userText }]
  });
  const tu = (j.content || []).find(c => c.type === 'tool_use');
  if (!tu) throw new Error('Risposta senza carosello, riprova.');
  const out = tu.input;
  out.slides = verifyQuotes(out.slides || [], d);
  if (p.focus === 'song') {
    // con un brano al centro i versi devono essere di QUEL brano: altrimenti la citazione viene segnalata
    const own = norm((d.songs.find(x => String(x.n) === String(p.item)) || {}).lyrics || '');
    for (const sl of out.slides) {
      if (!sl.citazione || sl.tipo === 'Review') continue;
      const parts = sl.citazione.split(/\s*(?:\.{3}|…)\s*|\s\/\s/).map(norm).filter(x => x.length > 3);
      if (!parts.every(x => own.includes(x))) sl.verified = false;
    }
  }
  if (p.focus === 'member') {
    // la foto del membro compare in una sola slide; la copertina usa l'album
    const photos = d.members.map(m => m.photo);
    let seen = false;
    out.slides.forEach((sl, i) => {
      if (!photos.includes(sl.immagine)) return;
      if (i === 0) { sl.immagine = 'cover'; sl.layout = 'hook'; return; }
      if (!seen && sl.immagine === (d.members.find(m => m.id === p.item) || {}).photo) { seen = true; return; }
      sl.immagine = 'none'; if (sl.layout === 'photo') sl.layout = 'text';
    });
  }
  return { demo: false, model: MODEL(), ...sanitizeTags(out) };
}

// Solo caption + hashtag nuove, scritte da Claude sul contenuto delle slide gia' composte
async function aiCaption(p) {
  if (!ANTHROPIC_KEY()) throw new Error('Serve ANTHROPIC_API_KEY per le caption scritte dall\'AI.');
  const d = loadAll();
  const slides = (p.slides || []).map((s, i) => `${i + 1}. [${s.tipo}] ${s.titolo} - ${s.corpo || ''}${s.citazione ? ` | citazione: "${s.citazione}" (${s.fonte || ''})` : ''}${s.stat ? ` | numero: ${s.stat}` : ''}`).join('\n');
  const avoid = (p.avoid || []).slice(0, 8).map(x => '- ' + String(x).slice(0, 200)).join('\n');
  const j = await callAnthropic({
    model: MODEL(), max_tokens: 1500, temperature: 1,
    system: [
      { type: 'text', text: SYSTEM_PROMPT },
      { type: 'text', text: 'BASE DI CONOSCENZA\n\n' + knowledgeBase(d), cache_control: { type: 'ephemeral' } }
    ],
    tools: [{ name: 'scrivi_caption', description: 'Restituisce caption, menzioni e hashtag.', input_schema: { type: 'object', properties: { caption: { type: 'string' }, menzioni: { type: 'array', items: { type: 'string' } }, hashtags: { type: 'array', items: { type: 'string' } } }, required: ['caption', 'menzioni', 'hashtags'] } }],
    tool_choice: { type: 'tool', name: 'scrivi_caption' },
    messages: [{ role: 'user', content: `Scrivi SOLO la caption (e menzioni, hashtag) per questo carosello gia' composto. Segui le regole "Caption" e "Strategia dei tag". ${(p.slides || []).some(s => s.tipo === 'Analysis') ? 'Il carosello contiene una slide "Analysis": la caption deve essere ESTESA (900-1400 caratteri) e sviluppare quell\'analisi sulla socialita\' profonda citando frammenti letterali del brano tra virgolette, con traccia, "Stream on Spotify (link in bio)" e una domanda finale.' : ''} ${MOODS[p.mood] ? 'Mood: ' + MOODS[p.mood] + '.' : ''}\n\nSLIDE:\n${slides}\n${avoid ? '\nDA NON RIPETERE (caption precedenti):\n' + avoid : ''}\nSeme creativo: ${Math.floor(Math.random() * 1e6)}.` }]
  });
  const tu = (j.content || []).find(c => c.type === 'tool_use');
  if (!tu) throw new Error('Risposta senza caption, riprova.');
  const out = sanitizeTags({ slides: [], ...tu.input });
  return { caption: out.caption, menzioni: out.menzioni, hashtags: out.hashtags, model: MODEL() };
}

// ---------- Scansione web ----------
async function scanWeb() {
  if (!ANTHROPIC_KEY()) throw new Error('Serve ANTHROPIC_API_KEY nel file .env per la scansione web.');
  const d = loadAll();
  const known = d.reviews.map(r => r.url);
  const j = await callAnthropic({
    model: MODEL(),
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
    messages: [{
      role: 'user',
      content: `Cerca sul web recensioni, articoli, interviste, playlist o segnalazioni sull'album "Roadburn Chronicles" della band stoner/doom italiana Petrosa (Octopus Rising / Argonauta Records, agosto 2026), e sui singoli "Revenant" e "Viper". Cerca anche le Doom Charts. Escludi queste URL gia' note:\n${known.join('\n')}\n\nLeggi le recensioni e individua le band che i recensori paragonano ai Petrosa o citano come influenza. Rispondi SOLO con un oggetto JSON (nessun altro testo): {"reviews":[{"publication","author","verdict","quote","url"}],"bands":[{"name","source"}]}. La "quote" deve essere un passaggio copiato letteralmente dalla pagina (max 350 caratteri, nella lingua originale). In "bands" metti solo band esplicitamente citate come paragone o influenza, con "source" = testata e autore. Se non trovi nulla di nuovo usa array vuoti.`
    }]
  });
  const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const m = text.match(/\{[\s\S]*\}/);
  let obj = { reviews: [], bands: [] };
  try { obj = m ? JSON.parse(m[0]) : obj; } catch { /* risposta non JSON */ }
  const reviews = (obj.reviews || []).filter(r => r && r.url && r.quote && !known.includes(r.url)).map((r, i) => ({ id: 'web-' + Date.now() + '-' + i, publication: r.publication || 'Web', author: r.author || 'Redazione', verdict: r.verdict || 'Recensione', quote: r.quote, url: r.url }));
  const t = loadTags();
  const have = new Set(allTaggable(t).map(b => norm(b.name)));
  const bands = (obj.bands || []).filter(b => b && b.name && !have.has(norm(b.name))).map(b => ({ name: b.name, source: b.source || '' }));
  return { reviews, bands };
}

// ---------- PostFast (pubblicazione automatica) ----------
async function postfast(pathname, opts = {}) {
  if (!POSTFAST_KEY()) throw new Error('Manca POSTFAST_API_KEY (variabile ambiente / file .env)');
  const r = await fetch(POSTFAST_URL() + pathname, { ...opts, headers: { 'pf-api-key': POSTFAST_KEY(), ...(opts.headers || {}) } });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  if (!r.ok) throw new Error(`PostFast ${r.status}: ${typeof j === 'object' ? JSON.stringify(j).slice(0, 400) : txt.slice(0, 400)}`);
  return j;
}

async function listAccounts() {
  const list = await postfast('/social-media/my-social-accounts');
  return (Array.isArray(list) ? list : list.data || []).map(a => ({
    id: a.id, platform: String(a.platform || '').toUpperCase(), username: a.platformUsername || '',
    name: a.displayName || a.platformUsername || a.id, status: a.connectionStatus || '', reason: a.disabledReason || ''
  }));
}

// carica UNA slide (data URL) su PostFast e restituisce la key da usare nel post
async function uploadSlide(p) {
  const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(p.image || '');
  if (!m) throw new Error('Immagine non valida (serve PNG o JPEG in base64).');
  const type = m[1], buf = Buffer.from(m[2], 'base64');
  if (buf.length > 10 * 1024 * 1024) throw new Error('Slide oltre 10 MB.');
  const urls = await postfast('/file/get-signed-upload-urls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contentType: type, count: 1 }) });
  const u = Array.isArray(urls) ? urls[0] : (urls.urls || urls.data || [])[0];
  if (!u?.signedUrl || !u?.key) throw new Error('PostFast non ha restituito un URL di upload: ' + JSON.stringify(urls).slice(0, 200));
  const put = await fetch(u.signedUrl, { method: 'PUT', headers: { 'content-type': type }, body: buf });
  if (!put.ok) throw new Error('Upload slide fallito: HTTP ' + put.status);
  return { key: u.key };
}

async function publish(p) {
  const { caption, keys, accounts, mode, date } = p;
  if (!keys?.length) throw new Error('Nessuna slide caricata.');
  if (keys.length < 2 || keys.length > 10) throw new Error('Un carosello richiede da 2 a 10 slide.');
  if (!accounts?.length) throw new Error('Seleziona almeno un account.');
  const draft = mode === 'draft';
  const when = mode === 'now' ? new Date(Date.now() + 90 * 1000).toISOString() : (date || new Date(Date.now() + 10 * 60000).toISOString());
  const mediaItems = keys.map((key, i) => ({ key, type: 'IMAGE', sortOrder: i }));
  const controls = {};
  const has = pl => accounts.some(a => a.platform === pl);
  if (has('INSTAGRAM')) controls.instagramPublishType = 'TIMELINE';
  if (has('TIKTOK')) Object.assign(controls, {
    tiktokTitle: String(caption).split('\n')[0].slice(0, 90), tiktokPrivacy: 'PUBLIC', tiktokAllowComments: true, tiktokAutoAddMusic: !draft, tiktokIsDraft: draft
  });
  const posts = accounts.map(a => ({
    content: caption, mediaItems, socialMediaId: a.id, ...(draft ? {} : { scheduledAt: when })
  }));
  const body = { posts, status: draft ? 'DRAFT' : 'SCHEDULED', controls };
  const res = await postfast('/social-posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: true, slides: keys.length, accounts: accounts.length, scheduledAt: draft ? null : when, result: res };
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
function send(res, code, obj) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, { 'content-type': typeof obj === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8' });
  res.end(body);
}
function readBody(req, limit = 80 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('Richiesta troppo grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const SERVERLESS = !!process.env.VERCEL;
const PASSWORD = () => process.env.APP_PASSWORD || '';
// Endpoint che usano chiavi segrete o scrivono su disco
const SECRET_PATHS = ['/api/generate', '/api/ai-caption', '/api/scan-web', '/api/find-handle', '/api/social/accounts', '/api/social/upload', '/api/social/publish'];
const WRITE_PATHS = ['/api/tags:POST', '/api/reviews:POST'];

function authorized(req) {
  if (!PASSWORD()) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const pass = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':').slice(1).join(':');
  return pass === PASSWORD();
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (AUTH.enabled()) {
      if (await AUTH.route(req, res, url)) return;
      const me = AUTH.readSession(req);
      if (!me) {
        if (url.pathname.startsWith('/api/')) return send(res, 401, { error: 'Accesso richiesto', login: '/api/auth/login' });
        res.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(AUTH.loginPage());
      }
      req.user = me;
    } else if (!authorized(req)) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="Petrosa Carousel Studio"', 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Password richiesta');
    }
    // Online (Vercel) senza password: nessuna funzione che usi chiavi segrete, per evitare abusi
    if (SERVERLESS && !PASSWORD() && !AUTH.enabled() && SECRET_PATHS.includes(url.pathname)) throw new Error('Funzione disattivata online: imposta APP_PASSWORD su Vercel per abilitarla.');
    if (SERVERLESS && WRITE_PATHS.includes(url.pathname + ':' + req.method)) throw new Error('Online non si puo\' salvare: modifica il file in data/ su GitHub e fai il redeploy.');
    if (url.pathname === '/api/config') {
      return send(res, 200, { anthropic: !!ANTHROPIC_KEY(), postfast: !!POSTFAST_KEY(), model: MODEL(), user: req.user ? { email: req.user.email, name: req.user.name, picture: req.user.picture } : null });
    }
    if (url.pathname === '/api/data') {
      const d = loadAll();
      return send(res, 200, { handle: d.handle, band: d.band, album: d.album, links: d.links, members: d.members, reviews: d.reviews, songs: d.songs.map(s => ({ n: s.n, title: s.title })) });
    }
    if (url.pathname === '/api/library') return send(res, 200, LIB.catalog());
    if (url.pathname === '/api/propose' && req.method === 'POST') return send(res, 200, LIB.propose(await readBody(req)));
    if (url.pathname === '/api/swap' && req.method === 'POST') return send(res, 200, LIB.swap(await readBody(req)));
    if (url.pathname === '/api/caption' && req.method === 'POST') return send(res, 200, LIB.recaption(await readBody(req)));
    if (url.pathname === '/api/ai-caption' && req.method === 'POST') return send(res, 200, await aiCaption(await readBody(req)));
    if (url.pathname === '/api/generate' && req.method === 'POST') return send(res, 200, await generate(await readBody(req)));
    if (url.pathname === '/api/scan-web' && req.method === 'POST') return send(res, 200, await scanWeb());
    if (url.pathname === '/api/tags' && req.method === 'GET') return send(res, 200, loadTags());
    if (url.pathname === '/api/tags' && req.method === 'POST') {
      const { tags } = await readBody(req);
      if (!tags || !Array.isArray(tags.similarBands)) throw new Error('Formato tag non valido');
      fs.writeFileSync(path.join(DATA, 'tags.json'), JSON.stringify(tags, null, 2));
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/find-handle' && req.method === 'POST') {
      if (!ANTHROPIC_KEY()) throw new Error('Serve ANTHROPIC_API_KEY nel file .env');
      const { name } = await readBody(req);
      const j = await callAnthropic({
        model: MODEL(), max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        messages: [{ role: 'user', content: `Trova l'account Instagram UFFICIALE della band "${name}" (genere stoner/doom/heavy). Rispondi SOLO con JSON: {"handle":"nomeutente senza @ oppure null","url":"pagina che lo conferma","certo":true/false}. Se ci sono piu' profili plausibili e non puoi distinguere quello ufficiale, metti certo:false.` }]
      });
      const txt = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
      const mm = txt.match(/\{[\s\S]*\}/);
      let r = { handle: null, url: '', certo: false };
      try { r = mm ? JSON.parse(mm[0]) : r; } catch { /* ignora */ }
      return send(res, 200, r);
    }
    if (url.pathname === '/api/reviews' && req.method === 'POST') {
      const { review } = await readBody(req);
      const f = path.join(DATA, 'extra-reviews.json');
      const arr = readJSON(f, []);
      arr.push({ id: review.id, publication: review.publication, author: review.author, verdict: review.verdict, quote: review.quote, url: review.url });
      fs.writeFileSync(f, JSON.stringify(arr, null, 2));
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/social/accounts') return send(res, 200, (await listAccounts()).filter(a => a.status !== 'DISABLED'));
    if (url.pathname === '/api/social/upload' && req.method === 'POST') return send(res, 200, await uploadSlide(await readBody(req)));
    if (url.pathname === '/api/social/publish' && req.method === 'POST') return send(res, 200, await publish(await readBody(req)));

    // statici
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Non trovato');
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message });
  }
}
const server = http.createServer(handler);

module.exports = { server, handler, loadAll, knowledgeBase, verifyQuotes, PORT, ANTHROPIC_KEY, POSTFAST_KEY, MODEL };
module.exports.default = handler;
