// Avvio locale: node run.js (o doppio clic su start.bat)
'use strict';
const { server, PORT, ANTHROPIC_KEY, POSTFAST_KEY } = require('./core/handler');
server.listen(PORT, () => {
  console.log(`\n  Petrosa Carousel Studio  ->  http://localhost:${PORT}`);
  console.log(`  Claude API: ${ANTHROPIC_KEY() ? 'attiva (opzionale)' : 'non configurata (non serve: usa la libreria)'}`);
  console.log(`  PostFast:   ${POSTFAST_KEY() ? 'attivo' : 'non configurato'}\n`);
});
