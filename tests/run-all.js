'use strict';
// Lancia tutti i test in sequenza: node tests/run-all.js [unit] [api] [e2e]
const { spawnSync } = require('child_process');
const path = require('path');
const want = process.argv.slice(2);
const suites = [['unit', 'Libreria, stili e dati'], ['features', 'Funzioni di crescita (Reel, piano, orari)'], ['api', 'API, PostFast, AI, accesso'], ['e2e', 'Interfaccia nel browser']].filter(([k]) => !want.length || want.includes(k));
const t0 = Date.now(); const results = [];
for (const [k, label] of suites) {
  console.log(`\n=== ${label} (tests/${k}.test.js) ===`);
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', path.join(__dirname, `${k}.test.js`)], { stdio: 'inherit', env: process.env });
  results.push([k, label, r.status === 0]);
}
console.log('\n=== RIEPILOGO ===');
for (const [, label, ok] of results) console.log(`${ok ? 'OK    ' : 'FALLITO'}  ${label}`);
console.log(`Durata: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(results.every(r => r[2]) ? 0 : 1);
