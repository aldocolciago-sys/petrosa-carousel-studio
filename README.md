# Petrosa Carousel Studio

App locale che genera caroselli Instagram/TikTok per i Petrosa: testi scritti da Claude a partire dai dati della band, slide PNG 1080x1350, caption con hashtag e @menzioni mirate, pubblicazione tramite PostFast.

## Avvio (Windows)
1. Installa Node.js LTS da https://nodejs.org (una sola volta).
2. Doppio clic su `start.bat`. Si apre http://localhost:3000.
3. **Non serve nessuna chiave**: i testi sono gia' scritti in `data/library.json`. Facoltativi nel file `.env`: `POSTFAST_API_KEY` (per pubblicare) e `ANTHROPIC_API_KEY` (compare un pulsante *Scrivi con Claude*).

## Come si usa
1. **Mood**: scegli l'atmosfera (Riff & Fuzz, Doom & Peso, Desert & Psych, Introspettivo, On the road, Riconoscimenti, Per i fan).
2. **Argomento** (brano, recensione, membro, album, Doom Charts, testo libero) e numero di slide (7-10), poi *Proponi assemblaggi*.
3. L'app propone 3 assemblaggi diversi (copertina, citazione, album, band, tag...). *Usa questa proposta* per aprirla; *Altre proposte* per rimescolare.
4. Nell'editor: *Cambia questa slide* la sostituisce con un'alternativa della libreria, *Altra caption* ne propone un'altra. Puoi anche modificare ogni testo a mano.
5. *Cartella per il telefono* scarica uno ZIP con `01.png`, `02.png`..., `caption.txt`, `tag-sulle-foto.txt` e le istruzioni: e il modo piu semplice per pubblicare a mano su Instagram e TikTok, senza API. Oppure *Scarica ZIP* (PNG + caption + scheda testuale) oppure *Invia a PostFast* (prima prova con "bozza").

Tutti i testi dei post sono in inglese (pubblico USA e Nord Europa); l'interfaccia resta in italiano. La libreria (`data/library.json`) contiene copertine, citazioni (verificate letteralmente su testi e recensioni), post informativi, testi per i membri, CTA e caption, ciascuno con i suoi mood. Aggiungi o modifica voci a piacere; `node test-library.js` controlla che le citazioni siano ancora fedeli e che ogni ricetta funzioni.

## Struttura del carosello (dalle istruzioni del progetto)
Slide 1 hook (brano/album/band/recensione) - 2 citazione di testo o recensione con fonte - 3 album, Doom Charts, genere, band simili - 4 band con foto - ... - ultima: invito a Spotify.

## Tag e band simili
La scheda **Tag & band simili** contiene le band che recensioni ed EPK paragonano ai Petrosa (Kyuss, Orange Goblin, Dozer, Monster Magnet, Fu Manchu, The Sword, ...) con la fonte del paragone. Regole:
- Un `@handle` viene usato solo se la spunta **Confermato** e' attiva. Controlla il profilo su Instagram prima di confermarlo; Confermati: @kyussworld (community, non esiste un profilo ufficiale), @officialmotorhead, @argonautarecords, @doomcharts. Da completare: Trouble.
- *Trova handle* cerca l'account con Claude; *Scansiona il web* legge nuove recensioni e aggiunge le band citate.
- Gli hashtag seguono questa priorita': generi stoner/doom, band simili, identita' Petrosa, community italiana.

## Dati
- `data/band.json` - band, album, membri, recensioni, link
- `data/songs.txt` - testi dei brani
- `data/tags.json` - band simili, handle, hashtag
- `public/assets/` - foto e copertina
Modifica questi file per aggiornare la base di conoscenza (nuove recensioni si possono anche aggiungere dall'app).

## Online su Vercel
- L'app **non usa Firebase ne' database**: e' un sito statico (`public/`) piu' una funzione serverless (`api/index.js`) che legge i file in `data/`. Non serve nessun servizio esterno.
- Su Vercel: *Add New > Project > importa il repo GitHub*, Framework "Other", nessun build command. `vercel.json` e' gia' pronto.
- Online i file sono in sola lettura: per cambiare handle, recensioni o testi modifica `data/*.json` su GitHub e Vercel ripubblica da solo.
- Funzioni con chiavi (PostFast, Claude, scansione web) sono **disattivate online** a meno che tu imposti la variabile `APP_PASSWORD` su Vercel (poi anche `POSTFAST_API_KEY` / `ANTHROPIC_API_KEY`); cosi' nessuno puo' usare le tue chiavi.
- Per la pubblicazione manuale non serve altro: scarica la "Cartella per il telefono" dal sito.


## Stile visivo
Ogni carosello ha uno stile diverso: 9 sfondi generativi (fumo, dune, raggi, anelli psichedelici, terra crepata, retino, strada, onde sonore, montagne), 10 palette, 8 font, foto naturali/bicromia/bianco e nero e due tipi di copertina. Lo stile viene scelto "a tono" con mood, band citate e genere (es. Kyuss = deserto, Sabbath = fumo e monocromo); con l'AI live lo sceglie Claude. Sopra le slide puoi cambiarlo a mano o premere *Nuovo stile*.

## Canzone al centro e analisi del testo
Scegliendo un brano nel Focus, tutti i versi citati sono di quel brano (mai di altri) e una slide diventa un'analisi del testo in chiave di *socialita' profonda*; la caption diventa estesa (circa 900 caratteri) e sviluppa la stessa lettura. Le analisi della libreria sono in `data/library.json` (`analyses`) e `test-library.js` controlla che ogni frase tra virgolette sia letterale nel testo. Con l'AI live, Claude riceve il testo completo del brano e le stesse regole; un verso non presente nel brano scelto viene segnalato con l'avviso sulla citazione.

## Accesso con Google
Con `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` impostati, l'app richiede il login Google e ammette solo le email in `ALLOWED_EMAILS` (default: aldo.colciago@gmail.com e petrosaband@gmail.com). Tutte le API rispondono 401 senza sessione; la sessione dura 7 giorni (cookie firmato, HttpOnly). In Google Cloud Console (OAuth client di tipo *Web application*) vanno registrati i redirect URI `https://<tuo-sito>/api/auth/callback` e `http://localhost:3000/api/auth/callback`. Con il login Google attivo `APP_PASSWORD` non serve piu'. Senza le due variabili l'app funziona come prima (in locale aperta, online con le funzioni a chiave disattivate).

## Reel con musica (video verticale + canzone)

- Scheda **Studio, sezione 7**: sceglie la canzone (di default quella citata nella slide con il verso), fa partire l'audio in modo che il verso venga cantato quando compare la slide, registra un video 9:16 nel browser (MP4 con Chrome) e lo puo' inviare a PostFast come Reel/TikTok.
- Scheda **Audio & sync**: si segnano una volta per brano i punti in cui vengono cantati i versi (bottone "Qui"). I punti stanno nel browser; scarica `audio-sync.json` e mettilo in `data/` per averli ovunque.
- Audio: i brani compressi (96 kbps) sono in `public/assets/clips/01.mp3 ... 10.mp3`. Non caricare su GitHub la cartella `public/assets/Audio` con gli MP3 originali (troppo pesanti).

## Test automatici

Servono a controllare che ogni funzione dell'app continui a funzionare dopo ogni modifica. Non usano chiavi vere e non pubblicano nulla: Anthropic, PostFast e Google sono simulati, e i test lavorano su una copia temporanea del progetto (i tuoi dati non vengono toccati).

- `npm test`: tutto (unit + API + interfaccia nel browser, circa 3-4 minuti).
- `npm run test:fast`: solo unit e API (circa 25 secondi, senza browser).
- `npm run test:e2e`: solo l'interfaccia. Prima volta: `npm install` e `npx playwright install chromium`.

Cosa verificano: citazioni fedeli ai testi, tutti i mood/argomenti/ricette (7-10 slide), menzioni solo confermate, ogni endpoint dell'API, generazione AI (citazioni inventate segnalate, tag ripuliti), PostFast (carosello e Reel, bozza/programma/subito), accesso Google e password, file audio e immagini, e nel browser ogni pulsante: proposte, editor slide (6 layout x tutte le foto), stili (9 sfondi, 10 colori, 8 font), esportazioni PNG/ZIP/telefono, pubblicazione, Reel con musica, Audio & sync, tag, mobile.

Su GitHub la cartella `.github/workflows/tests.yml` li esegue a ogni push: nella scheda **Actions** vedi il segno verde o rosso.
