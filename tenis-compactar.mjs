// tenis-compactar.mjs — de la respuesta de api-tennis.com a una fila compacta. Puro, sin red.

// Lo que no es tenis de circuito individual ATP: copas por equipos, exhibiciones, olímpicos, Next Gen.
export const TORNEO_FUERA = /davis|atp cup|united cup|laver|hopman|next ?gen|exhibition|olympic|juegos/i;
export const GRAND_SLAM = /australian open|french open|roland garros|wimbledon|us open/i;
// El proveedor tiene torneos de césped marcados como polvo (Stuttgart y Mallorca, junio de 2025). Estos mandan.
const CESPED = /^(wimbledon|halle|london|queen'?s|hertogenbosch|'s-hertogenbosch|stuttgart|mallorca|eastbourne|newport)$/i;

// "ATP Brisbane" y "Brisbane" son el mismo torneo: se unifica sacando el prefijo.
export function nombreTorneo(n) { return String(n || '').replace(/^ATP\s+/i, '').replace(/\s+/g, ' ').trim(); }

export function superficie(valor) {
  const v = String(valor || '').toLowerCase();
  const indoor = /indoor/.test(v);
  if (/clay/.test(v)) return { sup: 'Clay', indoor };
  if (/grass/.test(v)) return { sup: 'Grass', indoor };
  if (/hard|carpet/.test(v)) return { sup: 'Hard', indoor };
  return { sup: null, indoor };
}

function num(x) { const n = Number(x); return Number.isFinite(n) ? n : null; }

// puntos de saque jugados y ganados de un jugador: "Service Points Won" con won/total, o 1st + 2nd.
const PERIODO_PARTIDO = (per) => !per || /match/i.test(per);
export const PERIODO_SET1 = (per) => /^(set\s*1|1st\s*set|set_1|1)$/i.test(String(per || '').trim());
export function saqueDe(stats, clave, periodo = PERIODO_PARTIDO) {
  const mias = (stats || []).filter(s => String(s.player_key) === String(clave) && periodo(s.stat_period));
  const busca = (re) => mias.find(s => re.test(s.stat_name || ''));
  const tot = busca(/^service points won$/i);
  if (tot && num(tot.stat_total) > 0 && num(tot.stat_won) != null) return { jugados: num(tot.stat_total), ganados: num(tot.stat_won) };
  const p1 = busca(/^1st serve points won$/i), p2 = busca(/^2nd serve points won$/i);
  if (p1 && p2 && num(p1.stat_total) != null && num(p2.stat_total) != null && num(p1.stat_won) != null && num(p2.stat_won) != null) {
    const j = num(p1.stat_total) + num(p2.stat_total);
    if (j > 0) return { jugados: j, ganados: num(p1.stat_won) + num(p2.stat_won) };
  }
  return null;
}

/* Los números del partido que el proveedor manda en la MISMA llamada y que antes se tiraban:
   aces, dobles faltas, break points (salvados y enfrentados) y winners / errores no forzados.
   Son descriptivos: se probaron como indicador del modelo y no predicen (claude/tenis-break-points.md).
   Van a las fichas y a las páginas de partido, nada más.
   Ojo con Number(''), que da 0: un campo vacío es "no hay dato", no un cero. */
const entero = (x) => { const t = String(x ?? '').trim(); if (!t) return null; const n = Number(t); return Number.isInteger(n) && n >= 0 && n <= 400 ? n : null; };
export function numerosDe(stats, clave, periodo = PERIODO_PARTIDO) {
  const mias = (stats || []).filter(s => String(s.player_key) === String(clave) && periodo(s.stat_period));
  const busca = (re) => mias.find(s => re.test(s.stat_name || ''));
  const cuenta = (re) => { const s = busca(re); if (!s) return null; for (const v of [s.stat_value, s.stat_total, s.stat_won]) { const n = entero(v); if (n != null) return n; } return null; };
  // "ganados de total": se exige que cierre (ganados ≤ total) para no guardar un mapeo dado vuelta
  const par = (re) => { const s = busca(re); if (!s) return null; const w = entero(s.stat_won), t = entero(s.stat_total); return w != null && t != null && w <= t && t <= 60 ? [w, t] : null; };
  return { aces: cuenta(/^aces$/i), df: cuenta(/^double faults$/i), win: cuenta(/^winners$/i), err: cuenta(/^unforced errors$/i),
           bpS: par(/^break points saved$/i), bpC: par(/^break points converted$/i) };
}
/* El control que decide si el mapeo de break points es el que creemos: los que uno convirtió
   tienen que ser los que el otro enfrentó y no salvó. Se informa en la bajada de cada día. */
export function bpCierra(nA, nB) {
  if (!nA.bpS || !nB.bpS || !nA.bpC || !nB.bpC) return null;
  return nA.bpC[1] === nB.bpS[1] && nB.bpC[1] === nA.bpS[1]
      && nA.bpC[0] === nB.bpS[1] - nB.bpS[0] && nB.bpC[0] === nA.bpS[1] - nA.bpS[0];
}

// Una fila por partido. Devuelve null si el partido no es de circuito individual.
export function compactar(p, superficies) {
  if (TORNEO_FUERA.test(p.tournament_name || '')) return null;
  const estado = String(p.event_status || '');
  const walkover = /walk ?over|w\/o/i.test(estado);                       // no se jugó: no cuenta para nada
  const retiro = /retired|ret\.?$/i.test(estado);                           // se jugó a medias: cuenta el resultado, no el saque
  const terminado = !walkover && /finished|retired/i.test(estado) && /first|second/i.test(p.event_winner || '');
  const cancelado = walkover || /cancel|postpon|suspend|abandon/i.test(estado);   // no se va a jugar (o no así): no va a "próximos"
  // "7.7" es 7 games y 7 puntos de tie-break: los games van a `sets`, los puntos del tie-break a `tb`
  const parte = (x) => { const t = String(x ?? '').trim(); if (!t) return [null, null]; const [g, pt] = t.split('.'); return [num(g), pt != null ? num(pt) : null]; };
  const sup = CESPED.test(nombreTorneo(p.tournament_name)) ? { sup: 'Grass', indoor: false } : superficie(superficies[String(p.tournament_key)]);
  const fila = {
    k: String(p.event_key),
    f: p.event_date, h: p.event_time || '',
    t: nombreTorneo(p.tournament_name), tk: String(p.tournament_key),
    r: String(p.tournament_round || '').replace(/^.* - /, ''),
    sup: sup.sup, in: sup.indoor ? 1 : 0,
    bo: GRAND_SLAM.test(p.tournament_name || '') ? 5 : 3,
    a: String(p.first_player_key), b: String(p.second_player_key),
    na: p.event_first_player, nb: p.event_second_player,
    g: terminado ? (/first/i.test(p.event_winner) ? 1 : 2) : 0,
    ret: retiro ? 1 : 0,
    sets: (p.scores || []).map(s => [parte(s.score_first)[0], parte(s.score_second)[0]]),
  };
  const tb = (p.scores || []).map(s => { const a = parte(s.score_first)[1], b = parte(s.score_second)[1]; return a != null || b != null ? [a, b] : null; });
  if (tb.some(Boolean)) fila.tb = tb;
  if (cancelado && !terminado) fila.c = 1;
  // en juego ahora: el proveedor lo marca en vivo o el estado dice "Set 1", "Set 2"…
  if (!terminado && !cancelado && (String(p.event_live) === '1' || /^set \d|in progress|live/i.test(estado))) fila.vivo = 1;
  const sa = saqueDe(p.statistics, p.first_player_key), sb = saqueDe(p.statistics, p.second_player_key);
  if (sa && sb) fila.s = [sa.jugados, sa.ganados, sb.jugados, sb.ganados];
  const s1a = saqueDe(p.statistics, p.first_player_key, PERIODO_SET1), s1b = saqueDe(p.statistics, p.second_player_key, PERIODO_SET1);
  if (s1a && s1b) fila.s1 = [s1a.jugados, s1a.ganados, s1b.jugados, s1b.ganados];
  const nA = numerosDe(p.statistics, p.first_player_key), nB = numerosDe(p.statistics, p.second_player_key);
  if (nA.aces != null && nA.df != null && nB.aces != null && nB.df != null) fila.ac = [nA.aces, nA.df, nB.aces, nB.df];
  if (nA.bpS && nB.bpS) fila.bp = [nA.bpS[0], nA.bpS[1], nB.bpS[0], nB.bpS[1]];
  if (nA.win != null && nA.err != null && nB.win != null && nB.err != null) fila.we = [nA.win, nA.err, nB.win, nB.err];
  fila.v = 3;
  return fila;
}
