// Petrosa Carousel Studio - orari di pubblicazione: 3 post al giorno, fasce fisse 12:00 / 18:00 / 00:00 (ora italiana).
// Modulo puro (nessun DOM): funziona nel browser (window.Schedule) e in Node (test).
// Gli orari sono espressi in ora italiana (Europe/Rome, come la band). Il fuso viene applicato con l'ora legale corretta
// di ogni paese: in autunno e primavera Europa e USA cambiano ora in date diverse, quindi lo scarto non e' sempre 6 ore.
(function (root) {
  const TZ = 'Europe/Rome';
  // weekday JS: 0 = domenica ... 6 = sabato.
  // Planning aggressivo: ogni giorno pubblicato ha 3 post (carosello + Reel abbinato) a queste tre fasce fisse.
  // "midnight" e' espresso come 24:00 (non 0:00): Date.UTC normalizza l'overflow spostandolo al giorno dopo,
  // cosi' la fascia "mezzanotte" di un giorno resta DOPO le fasce 12:00/18:00 dello stesso giorno in ordine cronologico
  // (0:00 sarebbe invece l'inizio dello stesso giorno, cioe' PRIMA di mezzogiorno - un bug gia' corretto una volta).
  const DAY_TIMES = [
    { id: 'noon', label: 'Mezzogiorno', hh: 12, mm: 0 },
    { id: 'evening', label: 'Sera', hh: 18, mm: 0 },
    { id: 'midnight', label: 'Mezzanotte', hh: 24, mm: 0 }
  ];
  const REEL_OFFSET_MIN = 20;   // il Reel della stessa fascia esce 20 minuti dopo il carosello: non escono nello stesso istante
  const BEST5 = [2, 3, 4, 6, 0];   // con 5 giorni a settimana: martedi', mercoledi', giovedi', sabato, domenica
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
  const slotTimesFor = (y, mo, d, tz) => DAY_TIMES.map(t => zonedToUtc(y, mo, d, t.hh, t.mm, tz || TZ));
  const addDays = (y, mo, d, n) => { const t = new Date(Date.UTC(y, mo - 1, d + n, 12)); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; };

  // "count" coppie {carousel, reel} a partire da "now", una per fascia (12/18/00), nell'ordine in cui usciranno.
  // opts.calendarDays: 5 (solo BEST5) o 7 (tutti i giorni, default) - quanti giorni della settimana pubblicare.
  // Ogni slot deve essere ad almeno 30 minuti da adesso, altrimenti si passa al successivo.
  function pairs(now, count, opts) {
    opts = opts || {}; const tz = opts.tz || TZ, dayFilter = opts.calendarDays === 5 ? BEST5 : [1, 2, 3, 4, 5, 6, 0];
    const out = []; const p0 = parts(now, tz);
    for (let k = 0; out.length < count && k < 60; k++) {
      const c = addDays(p0.y, p0.mo, p0.d, k), wd = new Date(Date.UTC(c.y, c.mo - 1, c.d, 12)).getUTCDay();
      if (!dayFilter.includes(wd)) continue;
      for (const car of slotTimesFor(c.y, c.mo, c.d, tz)) {
        if (out.length >= count) break;
        if (car.getTime() < now.getTime() + 30 * 60000) continue;
        out.push({ carousel: car, reel: new Date(car.getTime() + REEL_OFFSET_MIN * 60000) });
      }
    }
    return out;
  }
  // prossimo slot singolo (carosello o Reel)
  function next(now, kind, opts) { const p = pairs(now, 10, opts).map(x => x[kind === 'reel' ? 'reel' : 'carousel']).filter(d => d.getTime() >= now.getTime() + 30 * 60000); return p[0] || null; }

  const WD = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'], MO = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const hm = (date, tz) => { const p = parts(date, tz); return pad(p.h) + ':' + pad(p.mi); };
  // "mar 22 set - 19:00 Italia / Nord Europa - 13:00 New York - 10:00 Los Angeles"
  function describe(date, tz) {
    const p = parts(date, tz || TZ);
    return `${WD[p.wd]} ${p.d} ${MO[p.mo - 1]} · ${VIEW.map(([n, z]) => `${hm(date, z)} ${n}`).join(' · ')}`;
  }
  // valore per <input type="datetime-local"> nel fuso del browser
  const toLocalInput = date => { const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
  // primo giorno di calendario da cui far partire il piano: oggi, se la fascia "mezzogiorno" di oggi e' ancora
  // ad almeno 30 minuti da adesso, altrimenti domani (cosi' il giorno 1 del piano non parte mai nel passato).
  function baseDateFor(now, tz) {
    const p = parts(now, tz);
    const todayNoon = zonedToUtc(p.y, p.mo, p.d, DAY_TIMES[0].hh, DAY_TIMES[0].mm, tz);
    if (todayNoon.getTime() >= now.getTime() + 30 * 60000) return { y: p.y, mo: p.mo, d: p.d };
    return addDays(p.y, p.mo, p.d, 1);
  }
  // data di calendario del giorno "dayIndex" (1-based) del piano, rispettando il filtro dei giorni (5 = solo BEST5)
  function calendarDateForDay(base, dayIndex, calendarDays) {
    if (calendarDays !== 5) return addDays(base.y, base.mo, base.d, dayIndex - 1);
    let count = 0;
    for (let k = 0; k < 60; k++) {
      const c = addDays(base.y, base.mo, base.d, k), wd = new Date(Date.UTC(c.y, c.mo - 1, c.d, 12)).getUTCDay();
      if (BEST5.includes(wd)) { count++; if (count === dayIndex) return c; }
    }
    return base;
  }
  // il piano e' un array piatto di post (3 al giorno): calendarDays si ricava dal numero di post / 3.
  // ogni post porta gia' il proprio "day" (1-based, relativo) e "slot" (noon/evening/midnight): l'orario si calcola
  // direttamente da questi due campi, cosi' l'etichetta della fascia corrisponde sempre all'orario mostrato.
  function annotate(plan, now) {
    now = now || new Date();
    const calendarDays = Math.round(plan.length / DAY_TIMES.length) === 5 ? 5 : 7;
    const base = baseDateFor(now, TZ);
    plan.forEach(d => {
      const c = calendarDateForDay(base, d.day || 1, calendarDays);
      const dt = DAY_TIMES.find(t => t.id === d.slot) || DAY_TIMES[0];
      const car = zonedToUtc(c.y, c.mo, c.d, dt.hh, dt.mm, TZ);
      const reel = new Date(car.getTime() + REEL_OFFSET_MIN * 60000);
      d.when = { carousel: car.toISOString(), reel: reel.toISOString() };
      d.whenText = ' · ' + describe(car).split(' · ')[0] + ' · ' + hm(car, TZ);
    });
    return plan;
  }
  const api = { TZ, DAY_TIMES, BEST5, VIEW, parts, zonedToUtc, pairs, next, describe, toLocalInput, annotate, hm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Schedule = api;
})(typeof window !== 'undefined' ? window : globalThis);
