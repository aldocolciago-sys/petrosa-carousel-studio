// Petrosa Carousel Studio - orari di pubblicazione suggeriti per il pubblico USA e Nord Europa.
// Modulo puro (nessun DOM): funziona nel browser (window.Schedule) e in Node (test).
// Gli orari sono espressi in ora italiana (Europe/Rome, come la band). Il fuso viene applicato con l'ora legale corretta
// di ogni paese: in autunno e primavera Europa e USA cambiano ora in date diverse, quindi lo scarto non e' sempre 6 ore.
(function (root) {
  const TZ = 'Europe/Rome';
  // weekday JS: 0 = domenica ... 6 = sabato. car = carosello, reel = Reel dello stesso giorno (circa 2 ore dopo)
  // Ragionamento: la sera nordica/italiana (17-21) coincide con pranzo e primo pomeriggio della costa est (11-15)
  // e mattina/mezzogiorno della costa ovest (8-12): unica fascia in cui i due pubblici sono svegli e sul telefono.
  const SLOTS = {
    1: { car: '19:00', reel: '21:15' }, 2: { car: '19:00', reel: '21:15' }, 3: { car: '19:00', reel: '21:15' }, 4: { car: '19:00', reel: '21:15' },
    5: { car: '18:30', reel: '20:30' }, 6: { car: '17:00', reel: '20:00' }, 0: { car: '17:30', reel: '20:30' }
  };
  const BEST5 = [2, 3, 4, 6, 0];   // con 5 caroselli a settimana: martedi', mercoledi', giovedi', sabato, domenica
  const VIEW = [['Italia / Nord Europa', TZ], ['New York', 'America/New_York'], ['Los Angeles', 'America/Los_Angeles']];

  const pad = n => String(n).padStart(2, '0');
  // parti "di calendario" di un istante in un fuso
  function parts(date, tz) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
    const o = {}; f.formatToParts(date).forEach(p => { o[p.type] = p.value; });
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday) };
  }
  // ora locale di un fuso -> istante UTC (gestisce l'ora legale)
  function zonedToUtc(y, mo, d, hh, mm, tz) {
    const guess = Date.UTC(y, mo - 1, d, hh, mm);
    let t = guess;
    for (let i = 0; i < 3; i++) { const p = parts(new Date(t), tz); const shown = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi); t += guess - shown; }
    return new Date(t);
  }
  const slotAt = (y, mo, d, kind, tz) => { const wd = new Date(Date.UTC(y, mo - 1, d, 12)).getUTCDay(); const [hh, mm] = SLOTS[wd][kind === 'reel' ? 'reel' : 'car'].split(':').map(Number); return zonedToUtc(y, mo, d, hh, mm, tz || TZ); };
  const addDays = (y, mo, d, n) => { const t = new Date(Date.UTC(y, mo - 1, d + n, 12)); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; };

  // giorni di pubblicazione a partire da "now": ogni slot deve essere ad almeno 30 minuti da adesso
  function pairs(now, count, opts) {
    opts = opts || {}; const tz = opts.tz || TZ, days = count === 5 ? BEST5 : [1, 2, 3, 4, 5, 6, 0];
    const out = []; const p0 = parts(now, tz);
    for (let k = 0; out.length < count && k < 30; k++) {
      const c = addDays(p0.y, p0.mo, p0.d, k), wd = new Date(Date.UTC(c.y, c.mo - 1, c.d, 12)).getUTCDay();
      if (!days.includes(wd)) continue;
      const car = slotAt(c.y, c.mo, c.d, 'car', tz), reel = slotAt(c.y, c.mo, c.d, 'reel', tz);
      if (car.getTime() < now.getTime() + 30 * 60000) continue;
      out.push({ carousel: car, reel });
    }
    return out;
  }
  // prossimo slot singolo (carosello o Reel)
  function next(now, kind, opts) { const p = pairs(now, 7, opts).map(x => x[kind === 'reel' ? 'reel' : 'carousel']).filter(d => d.getTime() >= now.getTime() + 30 * 60000); return p[0] || null; }

  const WD = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'], MO = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const hm = (date, tz) => { const p = parts(date, tz); return pad(p.h) + ':' + pad(p.mi); };
  // "mar 22 set - 19:00 Italia / Nord Europa - 13:00 New York - 10:00 Los Angeles"
  function describe(date, tz) {
    const p = parts(date, tz || TZ);
    return `${WD[p.wd]} ${p.d} ${MO[p.mo - 1]} · ${VIEW.map(([n, z]) => `${hm(date, z)} ${n}`).join(' · ')}`;
  }
  // valore per <input type="datetime-local"> nel fuso del browser
  const toLocalInput = date => { const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
  function annotate(plan, now) {
    const P = pairs(now || new Date(), plan.length);
    plan.forEach((d, i) => { const w = P[i]; d.when = { carousel: w.carousel.toISOString(), reel: w.reel.toISOString() }; d.whenText = ' · ' + describe(w.carousel).split(' · ')[0] + ' · ' + hm(w.carousel, TZ); });
    return plan;
  }
  const api = { TZ, SLOTS, BEST5, VIEW, parts, zonedToUtc, pairs, next, describe, toLocalInput, annotate, hm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Schedule = api;
})(typeof window !== 'undefined' ? window : globalThis);
