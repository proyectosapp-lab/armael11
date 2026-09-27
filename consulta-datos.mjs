/* ══════════════════════════════════════════════════════════════════════════
   CONSULTA-DATOS — lo que necesitan las páginas de consulta, sin red.

   27/9/2026. Fase 2 de `claude/sitio-de-consulta.md`: armael11.com además de
   simulador pasa a ser un lugar de consulta, como el segmento de jugados de
   Sacá vos. Este archivo es puro —ni red ni disco— para que todo lo que
   importa se pruebe con partidos inventados.

   TRES REGLAS QUE NO SE NEGOCIAN:

   1. **"Lo que daba el modelo" se calcula solo con lo que se sabía ANTES.**
      Es el mismo motor de `backtest.mjs` —el de "está medido"—, caminando
      la temporada partido a partido. Un partido nunca ve su propio
      resultado, ni el de uno que se jugó a la misma hora. Hay una prueba que
      cambia el futuro y mira que el pasado no se mueva.

   2. **Las estadísticas de un partido terminado se piden UNA vez.** No
      cambian nunca. Lo que decide qué falta pedir está acá (`faltan`), y es
      lo que impide que se repita el 16/9, cuando se acabó la cuota.

   3. **El número de un partido por jugar no se publica.** Decisión de
      Fausto (27/9): vive adentro del simulador. `anticipar` lo calcula y se
      GUARDA —para que con el tiempo "lo que daba el modelo" sea literal y
      no recalculado—, pero ninguna página lo muestra.
   ══════════════════════════════════════════════════════════════════════════ */
import { ligaNueva, nuevaTemporada, pronosticar, sumar, resultadoDe } from "./backtest.mjs";

export const JUGADO = ["FT", "AET", "PEN"];
export const esJugado = p => JUGADO.includes(p.estado) && Number.isFinite(p.gl) && Number.isFinite(p.gv);

/* ── DE LA API A UNA FILA ───────────────────────────────────────────────
   Lo que la página muestra y nada más. El estadio y el árbitro vienen en el
   mismo pedido del calendario: son datos propios de cada partido, gratis, y
   hacen que cada página diga algo que la de al lado no dice. */
export function compactar(f) {
  const fx = f.fixture || {}, t = f.teams || {}, g = f.goals || {}, ft = (f.score || {}).fulltime || {};
  const n = v => Number.isFinite(v) ? v : null;
  return {
    id: fx.id,
    fecha: fx.date,
    ronda: (f.league || {}).round || "",
    estado: (fx.status || {}).short || "NS",
    local: (t.home || {}).id, visita: (t.away || {}).id,
    nl: (t.home || {}).name || "", nv: (t.away || {}).name || "",
    gl: n(ft.home) ?? n(g.home), gv: n(ft.away) ?? n(g.away),
    estadio: (fx.venue || {}).name || null,
    ciudad: (fx.venue || {}).city || null,
    arbitro: limpiarArbitro(fx.referee),
  };
}
/* La API a veces trae "Nombre, País". El país sobra en una página de acá. */
export const limpiarArbitro = r => r ? String(r).split(",")[0].trim() || null : null;

const redondear = p => ({ H: +p.H.toFixed(3), D: +p.D.toFixed(3), A: +p.A.toFixed(3) });

/* ── CAMINAR LA TEMPORADA ───────────────────────────────────────────────
   `previa` precalienta (la temporada anterior: sin ella, los primeros
   partidos no tendrían con qué opinar). `actual` se camina en orden, y los
   partidos que se jugaron a la MISMA hora se pronostican todos antes de
   sumar cualquiera de ellos: un domingo a las 17, el de una cancha no sabe
   cómo terminó el de la otra.

   Devuelve lo que daba el modelo en cada partido jugado de `actual` (solo
   si los dos equipos tenían los partidos previos mínimos, igual que en la
   medición) y la liga caminada hasta hoy, para `anticipar`. */
export function caminar(previa, actual) {
  const L = ligaNueva();
  const daba = new Map();
  const recorrer = (partidos, temporada, evaluar) => {
    nuevaTemporada(L, temporada);
    const orden = partidos.filter(esJugado)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || a.id - b.id);
    for (let i = 0; i < orden.length;) {
      let j = i;
      while (j < orden.length && orden[j].fecha === orden[i].fecha) j++;
      const grupo = orden.slice(i, j);
      if (evaluar) for (const p of grupo) {
        const pr = pronosticar(L, p.local, p.visita);
        if (pr.evaluable) daba.set(p.id, redondear(pr));
      }
      for (const p of grupo) sumar(L, p.local, p.visita, p.gl, p.gv);
      i = j;
    }
  };
  recorrer(previa || [], "previa", false);
  recorrer(actual || [], "actual", true);
  return { daba, L };
}

/* Lo que daría HOY para los que faltan jugar. Se guarda; no se publica. */
export function anticipar(L, proximos) {
  const out = {};
  for (const p of proximos) {
    const pr = pronosticar(L, p.local, p.visita);
    if (pr.evaluable) out[p.id] = redondear(pr);
  }
  return out;
}

/* Lo anticipado no se pisa nunca: vale lo que dijo la PRIMERA vez que se
   vio el partido por jugar. Si se reescribiera cada semana, "lo que decía
   antes" terminaría siendo "lo que decía el día anterior". */
export function sumarAnticipados(guardados, nuevos, cuando) {
  const out = { ...(guardados || {}) };
  for (const [id, p] of Object.entries(nuevos || {}))
    if (!out[id]) out[id] = { ...p, cuando };
  return out;
}

/* ── LAS ESTADÍSTICAS DE UN PARTIDO ─────────────────────────────────────
   De la respuesta de /fixtures/statistics. Tiros, tiros al arco, posesión
   y xG. El xG a medias —uno sí y el otro no— no sirve y se descarta, igual
   que en `stats-api.mjs`. Sin tiros de ninguno de los dos, no hay nada. */
export function estadisticasDe(respuesta, localId, visitaId) {
  const de = id => ((respuesta || []).find(x => (x.team || {}).id === id) || {}).statistics || [];
  const val = (arr, tipo) => {
    const v = (arr.find(s => s.type === tipo) || {}).value;
    if (v == null) return null;
    const n = parseFloat(String(v).replace("%", ""));
    return Number.isFinite(n) ? n : null;
  };
  const H = de(localId), A = de(visitaId);
  const st = {
    tl: val(H, "Total Shots"), tv: val(A, "Total Shots"),
    al: val(H, "Shots on Goal"), av: val(A, "Shots on Goal"),
    pl: val(H, "Ball Possession"), pv: val(A, "Ball Possession"),
    xl: val(H, "expected_goals"), xv: val(A, "expected_goals"),
  };
  if (st.xl == null || st.xv == null) { st.xl = null; st.xv = null; }
  if (st.tl == null || st.tv == null) return null;
  return st;
}

/* ── QUÉ FALTA PEDIR ────────────────────────────────────────────────────
   Un partido terminado se pide si:
   · no tiene estadísticas guardadas,
   · terminó hace más de `espera` (la API las completa un rato después),
   · y no se lo pidió ya `intentos` veces sin resultado (hay ligas y
     partidos que nunca las tienen; insistir para siempre es tirar cuota).
   Primero los más nuevos: son los que la gente busca. */
export function faltan(partidos, ahora = Date.now(), { espera = 3 * 3600e3, intentos = 3 } = {}) {
  return partidos
    .filter(p => esJugado(p) && !p.st && (p.sti || 0) < intentos &&
                 new Date(p.fecha).getTime() + espera < ahora)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .map(p => p.id);
}

/* Junta la temporada nueva con lo que ya estaba guardado. Lo único que se
   hereda de lo guardado son las estadísticas y los intentos: todo lo demás
   —resultado, estado, fecha— manda lo que dice la API hoy. */
export function unir(guardados, nuevos) {
  const viejos = new Map((guardados || []).map(p => [p.id, p]));
  return nuevos.map(p => {
    const v = viejos.get(p.id);
    return v && (v.st || v.sti) ? { ...p, st: v.st || null, sti: v.sti || 0 } : { ...p };
  });
}

/* ── EL PUNTITO, COMO EN SACÁ VOS ───────────────────────────────────────
   verde    ganó el que el modelo daba como más probable.
   gris     pasó otra cosa, pero el modelo daba parejo: nadie pasaba del 45%.
   naranja  sorpresa: el favorito tenía más del 45% y no pasó.
   En fútbol el umbral es 45% y no el 60% del tenis: con tres resultados
   posibles, un 45% ya es un favorito claro. */
export const PAREJO = 0.45;
export function puntoDe(p, gl, gv) {
  if (!p || !Number.isFinite(gl) || !Number.isFinite(gv)) return null;
  const fav = ["H", "D", "A"].reduce((x, y) => p[y] > p[x] ? y : x);
  if (fav === resultadoDe(gl, gv)) return "verde";
  return Math.max(p.H, p.D, p.A) < PAREJO ? "gris" : "naranja";
}

/* ── LA ESTADÍSTICA QUE MOVIÓ LA AGUJA ──────────────────────────────────
   Una línea por partido. Con xG manda el xG; si no, los tiros; si no hay
   estadísticas, lo que daba el modelo. Siempre dice un número y siempre
   dice de quién. Nunca dice "eficacia" (palabra prohibida para el modelo;
   para un equipo se dice "definición" o "puntería"). */
const pct = x => Math.round(x * 100) + "%";
const dec = x => Number(x).toFixed(1).replace(".", ",");

export function aguja(p) {
  const { gl, gv, nl, nv, st } = p;
  if (!Number.isFinite(gl) || !Number.isFinite(gv)) return "";
  const gano = gl > gv ? "L" : gl < gv ? "V" : null;
  const nom = l => l === "L" ? nl : nv;
  const otro = l => l === "L" ? "V" : "L";

  if (st) {
    const conXG = st.xl != null && st.xv != null;
    const a = conXG ? { L: st.xl, V: st.xv } : { L: st.tl, V: st.tv };
    const fmt = conXG ? v => dec(v) : v => String(v);
    const que = conXG ? "de xG" : "tiros";
    const par = l => `${fmt(a[l])} ${que} contra ${fmt(a[otro(l)])}`;
    if (gano) {
      const g = gano, dif = a[g] - a[otro(g)];
      const umbral = conXG ? 0.5 : 0.2 * (a.L + a.V);
      if (dif >= umbral) return `${nom(g)} lo ganó en la cancha: ${par(g)}.`;
      if (-dif >= umbral) return `${nom(g)} ganó con menos: ${par(g)}. Le sobró definición.`;
      return `Parejo en la cancha, ${fmt(a.L)} a ${fmt(a.V)} en ${conXG ? "xG" : "tiros"}: lo definió la puntería.`;
    }
    const dueño = a.L > a.V ? "L" : "V", dif = Math.abs(a.L - a.V);
    const umbral = conXG ? 0.8 : 0.3 * (a.L + a.V);
    if (dif >= umbral) return `Empate con dueño: ${nom(dueño)} tuvo ${par(dueño)}.`;
    return `Empate justo: ${fmt(a.L)} a ${fmt(a.V)} en ${conXG ? "xG" : "tiros"}.`;
  }

  if (p.p) {
    const punto = puntoDe(p.p, gl, gv);
    const r = resultadoDe(gl, gv);
    const tuvo = r === "H" ? p.p.H : r === "A" ? p.p.A : p.p.D;
    /* Verde con menos del 45% es "ganó el que estaba arriba", no "la
       barra lo decía": con 38% no se dice nada con tanta seguridad. */
    if (punto === "verde") {
      const quien = r === "H" ? nl : r === "A" ? nv : null;
      if (tuvo < PAREJO) return quien
        ? `Ganó el que la barra ponía arriba: ${pct(tuvo)} para ${quien}.`
        : `Empate, y era lo que la barra ponía arriba: ${pct(tuvo)}.`;
      return quien ? `La barra lo decía: ${pct(tuvo)} para ${quien}.`
                   : `La barra lo veía: ${pct(tuvo)} de empate.`;
    }
    if (punto === "naranja") {
      const fav = p.p.H >= p.p.A ? nl : nv, pf = Math.max(p.p.H, p.p.A);
      return `Sorpresa: el modelo le daba ${pct(pf)} a ${fav}.`;
    }
    return `Partido abierto: nadie pasaba del ${pct(Math.max(p.p.H, p.p.D, p.p.A))}.`;
  }
  return "";
}

/* ── LOS NÚMEROS DE CADA EQUIPO EN LA TEMPORADA ─────────────────────────── */
export function numerosDeEquipos(partidos) {
  const eq = new Map();
  const nuevo = (id, nombre) => ({ id, nombre, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0,
    local: { pj: 0, g: 0, e: 0, p: 0 }, visita: { pj: 0, g: 0, e: 0, p: 0 },
    tiros: 0, tirosPJ: 0, invictas: 0, historia: [] });
  const jug = partidos.filter(esJugado).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  for (const m of jug) {
    for (const [id, nombre, gf, gc, dondeL, tiros] of [
      [m.local, m.nl, m.gl, m.gv, true, m.st ? m.st.tl : null],
      [m.visita, m.nv, m.gv, m.gl, false, m.st ? m.st.tv : null]]) {
      if (!eq.has(id)) eq.set(id, nuevo(id, nombre));
      const e = eq.get(id), r = gf > gc ? "G" : gf < gc ? "P" : "E";
      const lado = dondeL ? e.local : e.visita;
      e.pj++; lado.pj++; e.gf += gf; e.gc += gc;
      if (r === "G") { e.g++; lado.g++; e.pts += 3; }
      else if (r === "E") { e.e++; lado.e++; e.pts += 1; }
      else { e.p++; lado.p++; }
      if (gc === 0) e.invictas++;
      if (tiros != null) { e.tiros += tiros; e.tirosPJ++; }
      e.historia.push({ id: m.id, fecha: m.fecha, r, gf, gc, deLocal: dondeL,
                        rival: dondeL ? m.nv : m.nl, rivalId: dondeL ? m.visita : m.local });
    }
  }
  /* Los que todavía no jugaron también existen: tienen partido por jugar. */
  for (const m of partidos) {
    if (!eq.has(m.local)) eq.set(m.local, nuevo(m.local, m.nl));
    if (!eq.has(m.visita)) eq.set(m.visita, nuevo(m.visita, m.nv));
  }
  return eq;
}

/* Los partidos de esta temporada entre los dos, jugados. */
export const caraACara = (partidos, a, b) => partidos.filter(m => esJugado(m) &&
  ((m.local === a && m.visita === b) || (m.local === b && m.visita === a)))
  .sort((x, y) => new Date(y.fecha) - new Date(x.fecha));

/* ── LAS DIRECCIONES ────────────────────────────────────────────────────
   Legibles y estables. El partido lleva su id al final: si se reprograma,
   cambia la fecha y la dirección sigue siendo la misma. */
export const aSlug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
export const urlLiga = liga => `consulta/${liga}/`;
export const urlPartido = (liga, p) => `consulta/${liga}/${aSlug(p.nl)}-${aSlug(p.nv)}-${p.id}.html`;
export const urlEquipo = (liga, nombre) => `consulta/${liga}/equipos/${aSlug(nombre)}.html`;
