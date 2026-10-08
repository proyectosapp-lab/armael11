/* ══════════════════════════════════════════════════════════════════════════
   STATS-LIGAS — los Números de las once ligas, calculados de lo que ya hay.

   Hasta la 1.1 la pestaña Números era solo de Argentina: `stats-liga.js`,
   que trae la API con la tabla oficial y el xG. Las otras diez ligas no
   tenían números, y los partidos jugados de todas ya estaban commiteados en
   `estadisticas/<liga>.json` (la corrida semanal, con tiros y xG en una
   parte). La cuenta es la misma de siempre —`stats-calc.mjs`—, así que un
   archivo por liga sale sin pedirle nada a nadie.

   QUÉ SALE, Y POR QUÉ ASÍ:

   - `sitio/datos/stats-<liga>.json`, uno por liga, JSON puro. La app lo
     pide recién cuando alguien elige esa liga en el desplegable: once
     archivos en cada carga de página era un chorizo de 400 kB para ver
     uno. Es JSON y no `window.X = …` a propósito: adentro de la app
     nativa se baja por red y se parsea, nunca se ejecuta (la regla de
     datos-ios.js). Argentina NO sale de acá: sigue siendo `stats-liga.js`,
     que tiene la tabla oficial.
   - `sitio/datos/stats-ligas.js`: la lista para armar el desplegable
     (slug, nombre, país, partidos). Esta sí va como <script>: pesa nada.

   Sin `hist`: la pantalla no lo lee y era el 80% del peso de Argentina.
   ══════════════════════════════════════════════════════════════════════════ */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { calcular } from "./stats-calc.mjs";

const JUGADO = ["FT", "AET", "PEN"];

/* De una fila de `estadisticas/<liga>.json` a lo que `calcular` espera. */
export function filaDeCalculo(p) {
  return { id: p.id, fecha: p.fecha, ronda: p.ronda || "",
           h: p.local, hn: p.nl, a: p.visita, an: p.nv, gh: p.gl, ga: p.gv,
           th: p.st ? p.st.tl : undefined, ta: p.st ? p.st.tv : undefined,
           xh: p.st && p.st.xl != null ? p.st.xl : null,
           xa: p.st && p.st.xv != null ? p.st.xv : null };
}

/* Solo lo que la pantalla lee. Cada lista repetía el equipo entero, con
   historial y todo, y una liga pesaba 40 kB para mostrar cinco nombres. */
const FILA  = ["id", "nom", "pos", "pj", "g", "e", "p", "gf", "gc", "pts", "dg", "ppp", "forma"];
const ITEM  = ["id", "nom", "pj", "gf", "gc", "pts", "vallaInv", "rachas", "xgDifPP", "pjXG", "golPorTiro", "tiros", "pppLocal", "pppVis"];
const PART  = ["id", "fecha", "h", "hn", "a", "an", "gh", "ga", "total", "dif"];
const solo = campos => t => { if (!t || typeof t !== "object") return t; const r = {}; for (const k of campos) if (t[k] !== undefined) r[k] = t[k]; return r; };
const limpiarFilas = arr => (arr || []).map(solo(FILA));
const limpiarLista = arr => (arr || []).map(t => solo(t && t.hn !== undefined ? PART : ITEM)(t));

/* La temporada como la lee un hincha: en Europa "2026/27", en América "2026". */
export const etiquetaTemporada = (info, temporada) =>
  info.zona === "europa" ? temporada + "/" + String(temporada + 1).slice(-2) : String(temporada);

/* Los números de UNA liga, puros: entran los datos de la semanal y la fila
   de ligas.json, sale lo que la pestaña consume. null si no hay con qué. */
export function statsDeLiga(datos, info) {
  const P = (datos?.partidos || [])
    .filter(p => p.id && p.local && p.visita && JUGADO.includes(p.estado) &&
                 Number.isFinite(p.gl) && Number.isFinite(p.gv))
    .map(filaDeCalculo)
    .sort((a, b) => +new Date(a.fecha) - +new Date(b.fecha));
  if (P.length < 10) return null;
  const temporada = datos.temporada || info.temporada || new Date().getFullYear();
  const out = calcular(P, {
    generado: datos.actualizado || null,
    notaXG: P.some(m => m.xh != null)
      ? "El xG existe solo en una parte de los partidos. Las columnas de xG comparan únicamente esos, y van por partido, no acumuladas."
      : "",
    nota: "Calculada por la app sobre los partidos jugados de la fase regular. No es la tabla que publica la liga.",
  });
  out.liga = info.nombre + " (" + info.pais + ")";
  out.slug = info.slug;
  out.temporada = temporada;
  out.temporadaEtiqueta = etiquetaTemporada(info, temporada);
  out.tablas = out.tablas.map(t => ({ ...t, filas: limpiarFilas(t.filas) }));
  out.tabla = out.tablas[0].filas;
  for (const k of Object.keys(out.rachas)) out.rachas[k] = limpiarLista(out.rachas[k]);
  for (const k of Object.keys(out.records)) out.records[k] = limpiarLista(out.records[k]);
  for (const k of Object.keys(out.avanzadas)) out.avanzadas[k] = limpiarLista(out.avanzadas[k]);
  /* Lo que no hay, no se promete: sin datos de jugador no va el cartel de
     "lo que falta", que era un aviso interno de Argentina. */
  out.jugadores = null; out.faltan = null;
  return out;
}

/* Escribe los archivos y devuelve la lista para el desplegable. `leer` es
   el lector de JSON del que llama (devuelve null si falta). */
export function escribirStatsLigas({ ligas = [], leer, DATOS, log = () => {} }) {
  const lista = [];
  for (const info of ligas) {
    const datos = leer("./estadisticas/" + info.slug + ".json");
    const st = datos ? statsDeLiga(datos, info) : null;
    const archivo = new URL("stats-" + info.slug + ".json", DATOS);
    if (!st) {
      /* Argentina está siempre: la trae stats-liga.js. Las demás, si la
         semanal todavía no corrió, no aparecen en el desplegable. */
      if (info.slug === "argentina") lista.push({ slug: info.slug, nombre: info.nombre, pais: info.pais, partidos: null, etiqueta: etiquetaTemporada(info, info.temporada || 2026) });
      continue;
    }
    writeFileSync(archivo, JSON.stringify(st));
    lista.push({ slug: info.slug, nombre: info.nombre, pais: info.pais, partidos: st.partidosJugados, etiqueta: st.temporadaEtiqueta });
  }
  /* Argentina adelante, que es la de la casa y la que tiene la tabla oficial. */
  lista.sort((a, b) => (a.slug === "argentina" ? -1 : b.slug === "argentina" ? 1 : 0));
  writeFileSync(new URL("stats-ligas.js", DATOS), "window.STATS_LIGAS_LISTA=" + JSON.stringify(lista) + ";\n");
  log(lista.length + " ligas con números (" + lista.filter(l => l.partidos).map(l => l.slug).join(", ") + ")");
  return lista;
}

const ME_CORREN = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (ME_CORREN) {
  const aca = p => new URL(p, import.meta.url);
  const leer = f => { try { return JSON.parse(readFileSync(aca(f), "utf8")); } catch (e) { return null; } };
  const cfg = leer("./ligas.json");
  const DATOS = aca("./sitio/datos/");
  if (!existsSync(DATOS)) { console.log("falta sitio/datos/: corré construir-sitio.mjs primero"); process.exit(1); }
  escribirStatsLigas({ ligas: cfg ? cfg.ligas : [], leer, DATOS, log: m => console.log("  " + m) });
}
