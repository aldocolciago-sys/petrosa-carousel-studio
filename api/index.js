// Entry point serverless per Vercel: tutte le richieste /api/* passano da qui
module.exports = require('../core/handler.js').handler;
