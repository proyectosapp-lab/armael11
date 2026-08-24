/* ══════════════════════════════════════════════════════════════════════════
   STATS-CALC — la cuenta, sin red y sin archivos.

   Entra una lista de partidos con esta forma:
     { id, fecha, h, hn, a, an, gh, ga, th, ta, xh, xa }
   y sale el objeto que la pestaña Números consume tal cual.

   Está separado de dónde vienen los partidos a propósito: de un archivo
   guardado (stats.mjs) o de la API (stats-api.mjs), la cuenta es la misma y
   no se puede desincronizar entre las dos.
   ══════════════════════════════════════════════════════════════════════════ */

export function equipos(P) {
  const eq = new Map();
  const E = (id, nom) => {
    if (!eq.has(id)) eq.set(id, { id, nom, pj:0, g:0, e:0, p:0, gf:0, gc:0,
      pts:0, tiros:0, tirosC:0, xg:0, xgc:0, hist:[], localPts:0, localPj:0,
      visPts:0, visPj:0, vallaInv:0, sinMarcar:0,
      /* El xG no está en todos los partidos. Comparar los goles de TODOS
         contra el xG de una parte da diferencias imposibles. Se acumula
         aparte lo jugado CON xG y se compara manzana con manzana.      */
      pjXG:0, gfXG:0 });
    return eq.get(id);
  };

  for (const m of P) {
    const H = E(m.h, m.hn), A = E(m.a, m.an);
    const res = m.gh > m.ga ? "G" : m.gh === m.ga ? "E" : "P";
    H.pj++; A.pj++;
    H.gf += m.gh; H.gc += m.ga; A.gf += m.ga; A.gc += m.gh;
    H.tiros += m.th || 0; A.tiros += m.ta || 0;
    H.tirosC += m.ta || 0; A.tirosC += m.th || 0;
    if (m.xh != null) { H.xg += m.xh; H.xgc += m.xa; A.xg += m.xa; A.xgc += m.xh;
      H.pjXG++; A.pjXG++; H.gfXG += m.gh; A.gfXG += m.ga; }
    if (m.ga === 0) { H.vallaInv++; A.sinMarcar++; }
    if (m.gh === 0) { A.vallaInv++; H.sinMarcar++; }
    const ptsH = res === "G" ? 3 : res === "E" ? 1 : 0;
    const ptsA = res === "P" ? 3 : res === "E" ? 1 : 0;
    H.pts += ptsH; A.pts += ptsA;
    H.localPts += ptsH; H.localPj++; A.visPts += ptsA; A.visPj++;
    if (res === "G") { H.g++; A.p++; } else if (res === "E") { H.e++; A.e++; } else { H.p++; A.g++; }
    H.hist.push({ r: res, rival: m.an, gf: m.gh, gc: m.ga, fecha: m.fecha, local: true });
    A.hist.push({ r: res === "G" ? "P" : res === "P" ? "G" : "E",
                  rival: m.hn, gf: m.ga, gc: m.gh, fecha: m.fecha, local: false });
  }
  return eq;
}

/* racha actual y la más larga de cada tipo */
export function rachasDe(h) {
  const actual = (() => {
    if (!h.length) return { tipo: "—", n: 0 };
    const t = h[h.length - 1].r; let n = 0;
    for (let i = h.length - 1; i >= 0 && h[i].r === t; i--) n++;
    return { tipo: t, n };
  })();
  const mejor = test => { let m = 0, c = 0;
    for (const x of h) { if (test(x.r)) { c++; m = Math.max(m, c); } else c = 0; } return m; };
  return { actual, ganados: mejor(r => r === "G"),
           invicto: mejor(r => r !== "P"), sinGanar: mejor(r => r !== "G") };
}

const top = (arr, f, n = 5, desc = true) =>
  [...arr].sort((a, b) => desc ? f(b) - f(a) : f(a) - f(b)).slice(0, n);

/* ─── todo junto ──────────────────────────────────────────────────────────
   `oficial` es la tabla que devuelve /standings: si viene, MANDA para
   puntos, partidos y goles. Lo de acá abajo es lo que la tabla oficial no
   trae —rachas, tiros, xG, local y visitante— y se le pega al lado.

   Por qué importa: calcular la tabla desde los partidos que uno tiene a mano
   da otra cosa. La fase regular y los playoffs son torneos distintos, y
   sumarlos le da 25 partidos al que llegó a la final y 21 al que quedó
   afuera en la primera ronda. Eso no es la tabla de nadie.               */
export function calcular(P, { tablas = null, notaXG = "", nota = "", generado = null } = {}) {
  if (!P.length) throw new Error("no hay partidos para calcular");
  const eq = equipos(P);

  /* La base: todos los equipos con lo que sale de los partidos. Sirve para
     dos cosas distintas y conviene no confundirlas — de acá salen las
     rachas, los récords y el xG, que son de TODA la temporada, y de acá
     sale también la tabla anual cuando la liga no publica una.          */
  const base = [...eq.values()].map(t => ({
    ...t, dg: t.gf - t.gc,
    ppp: +(t.pts / Math.max(1, t.pj)).toFixed(2),
    pppLocal: +(t.localPts / Math.max(1, t.localPj)).toFixed(2),
    pppVis: +(t.visPts / Math.max(1, t.visPj)).toFixed(2),
    xgDif:   t.pjXG >= 5 ? +(t.gfXG - t.xg).toFixed(1) : null,
    xgDifPP: t.pjXG >= 5 ? +((t.gfXG - t.xg) / t.pjXG).toFixed(2) : null,
    golPorTiro: t.tiros ? +(t.gf / t.tiros * 100).toFixed(1) : null,
    rachas: rachasDe(t.hist),
    forma: t.hist.slice(-5).map(x => x.r),
  }));
  const porId = new Map(base.map(t => [t.id, t]));

  /* Cada tabla que publica la liga se muestra tal cual: los puntos y los
     partidos son de ella. Lo nuestro —rachas, tiros, xG— se le pega al lado.
     Se guardan TODAS: el Apertura terminado, el Clausura en curso, cada zona
     y la anual son tablas distintas y todas son ciertas. Elegir una sola por
     el equipo fue el error: mostramos la del torneo terminado.          */
  const pegar = filas => filas.map((o, i) => {
    const c = porId.get(o.id) || {};
    return { ...c, id: o.id, nom: o.nom || c.nom,
      pj: o.pj, g: o.g, e: o.e, p: o.p, gf: o.gf, gc: o.gc, pts: o.pts,
      dg: o.gf - o.gc, ppp: +(o.pts / Math.max(1, o.pj)).toFixed(2),
      forma: (o.forma && o.forma.length) ? o.forma : (c.forma || []),
      hist: c.hist || [], rachas: c.rachas || rachasDe(c.hist || []),
      pos: i + 1 };
  });

  /* La anual, calculada por nosotros sobre la fase regular de toda la
     temporada. Va siempre: si la liga publica la suya, quedan las dos y se
     pueden comparar; si no la publica, es la única que hay.             */
  const anual = [...base].sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf)
    .map((t, i) => ({ ...t, pos: i + 1 }));

  const salida = [
    ...(tablas || []).map(g => ({ nombre: g.nombre, oficial: true, filas: pegar(g.filas) })),
    { nombre: "Anual", oficial: false, filas: anual },
  ];

  const conXG = base.filter(t => t.xgDif != null);
  const partidos = P.map(m => ({ ...m, total: m.gh + m.ga, dif: Math.abs(m.gh - m.ga) }));

  return {
    liga: "Liga Profesional Argentina", temporada: 2026,
    oficial: !!(tablas && tablas.length),
    generado: generado || P[P.length - 1].fecha,
    notaXG, nota,
    partidosJugados: P.length,
    promedios: {
      golesPorPartido: +(P.reduce((a, m) => a + m.gh + m.ga, 0) / P.length).toFixed(2),
      local:   +(P.filter(m => m.gh >  m.ga).length / P.length * 100).toFixed(1),
      empate:  +(P.filter(m => m.gh === m.ga).length / P.length * 100).toFixed(1),
      visita:  +(P.filter(m => m.gh <  m.ga).length / P.length * 100).toFixed(1),
      ceroACero: P.filter(m => m.gh + m.ga === 0).length,
    },
    tablas: salida,
    tabla: salida[0].filas,          // la de siempre, para lo que ya la leía
    /* Las rachas, los récords y el xG salen de la BASE, no de una tabla:
       son de toda la temporada y no cambian según qué zona estés mirando. */
    rachas: {
      ganando:  top(base, t => t.rachas.actual.tipo === "G" ? t.rachas.actual.n : 0, 5),
      invictos: top(base, t => t.rachas.invicto, 5),
      sinGanar: top(base, t => t.rachas.actual.tipo !== "G" ? t.rachas.actual.n : 0, 5),
    },
    records: {
      goleadas: [...partidos].sort((a, b) => b.dif - a.dif || b.total - a.total).slice(0, 5),
      masGoles: [...partidos].sort((a, b) => b.total - a.total).slice(0, 5),
      masGoleador:   top(base, t => t.gf, 5),
      menosGoleador: top(base, t => t.gf, 5, false),
      mejorDefensa:  top(base, t => t.gc, 5, false),
      vallaInvicta:  top(base, t => t.vallaInv, 5),
    },
    avanzadas: {
      sobreRinden: top(conXG, t => t.xgDifPP, 5),
      bajoRinden:  top(conXG, t => t.xgDifPP, 5, false),
      punteria:    top(base.filter(t => t.tiros > 40), t => t.golPorTiro, 5),
      fortaleza:   top(base, t => t.pppLocal, 5),
      viajeros:    top(base, t => t.pppVis, 5),
    },
    faltan: {
      jugadores: "goleadores, asistencias, situaciones de gol generadas y puntajes por partido",
      porque: "son datos de JUGADOR y esto son datos de PARTIDO. Salen de /players y /fixtures/players.",
      comoSeArregla: "está pendiente: es el próximo paso del proyecto",
    },
  };
}

/* Los playoffs no son la misma competencia que la fase regular, y sumarlos
   deforma todo: al que llegó a la final le cuenta 25 partidos y al que quedó
   afuera en la primera ronda, 21. La tabla anual oficial cuenta solo la fase
   regular, y por eso nuestra tabla no coincidía con ninguna.              */
const ELIMINACION = /final|semi|cuartos|octavos|play|reclasific|desempate|tercer puesto|1\/8|1\/4/i;
export const esFaseRegular = ronda => !ELIMINACION.test(ronda || "");
