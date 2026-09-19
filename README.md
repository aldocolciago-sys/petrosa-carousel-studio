# Petrosa Carousel Studio

App locale che genera caroselli Instagram/TikTok per i Petrosa: testi scritti da Claude a partire dai dati della band, slide PNG 1080x1350, caption con hashtag e @menzioni mirate, pubblicazione tramite Postiz.

## Avvio (Windows)
1. Installa Node.js LTS da https://nodejs.org (una sola volta).
2. Doppio clic su `start.bat`. Si apre http://localhost:3000.
3. **Non serve nessuna chiave**: i testi sono gia' scritti in `data/library.json`. Facoltativi nel file `.env`: `POSTIZ_API_KEY` (per pubblicare) e `ANTHROPIC_API_KEY` (compare un pulsante *Scrivi con Claude*).

## Come si usa
1. **Mood**: scegli l'atmosfera (Riff & Fuzz, Doom & Peso, Desert & Psych, Introspettivo, On the road, Riconoscimenti, Per i fan).
2. **Argomento** (brano, recensione, membro, album, Doom Charts, testo libero) e numero di slide (7-10), poi *Proponi assemblaggi*.
3. L'app propone 3 assemblaggi diversi (copertina, citazione, album, band, tag...). *Usa questa proposta* per aprirla; *Altre proposte* per rimescolare.
4. Nell'editor: *Cambia questa slide* la sostituisce con un'alternativa della libreria, *Altra caption* ne propone un'altra. Puoi anche modificare ogni testo a mano.
5. *Cartella per il telefono* scarica uno ZIP con `01.png`, `02.png`..., `caption.txt`, `tag-sulle-foto.txt` e le istruzioni: e il modo piu semplice per pubblicare a mano su Instagram e TikTok, senza API. Oppure *Scarica ZIP* (PNG + caption + scheda testuale) oppure *Invia a Postiz* (prima prova con "bozza").

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
- Funzioni con chiavi (Postiz, Claude, scansione web) sono **disattivate online** a meno che tu imposti la variabile `APP_PASSWORD` su Vercel (poi anche `POSTIZ_API_KEY` / `ANTHROPIC_API_KEY`); cosi' nessuno puo' usare le tue chiavi.
- Per la pubblicazione manuale non serve altro: scarica la "Cartella per il telefono" dal sito.
