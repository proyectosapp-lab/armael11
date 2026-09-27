/* ══════════════════════════════════════════════════════════════════════════
   ESTADISTICAS-API — la corrida semanal de la capa de consulta.

     node estadisticas-api.mjs          usa API_FOOTBALL_KEY del entorno
     TOPE=300 node estadisticas-api.mjs  menos pedidos de estadísticas

   La corre `estadisticas.yml` los martes (después de la fecha del fin de
   semana) y se puede apretar a mano. Escribe `estadisticas/<liga>.json`,
   que el workflow COMMITEA: esos archivos son la memoria de la capa de
   consulta y no pueden depender de un cache que GitHub borra cuando quiere.

   Qué hace, liga por liga:
   1. Baja la temporada (un pedido) y, si no la tiene guardada, la anterior
      (un pedido, una sola vez: una temporada terminada no cambia más).
   2. Calcula lo que daba el modelo antes de cada partido jugado, y guarda
      lo que da hoy para los que faltan (`consulta-datos.mjs`).
   3. Pide las estadísticas de los partidos terminados que todavía no las
      tienen. UNA VEZ POR PARTIDO: lo que se guarda no se vuelve a pedir.
      Con un tope por corrida entre las once ligas, primero los más nuevos.

   Idea de Fausto (27/9): *"¿las estadísticas no se pueden pedir una vez a
   la semana?"*. Sí: ~110 pedidos por semana para las once ligas. La primera
   vez, la temporada hasta hoy son ~1.400: con el tope de 700 son dos
   corridas, en dos días distintos para no comerle cuota a la publicación.

   LO QUE NO PUEDE PASAR, Y POR QUÉ ESTÁ ESCRITO ASÍ:

   · Si la API falla o se acabó la cuota, NO se pisa lo guardado. El 16/9 un
     paso quedó sellado con la lista vacía porque se acabó la cuota a mitad
     de camino, y la app estuvo sin ligas hasta que alguien apretó un botón.
     Acá, una liga que no bajó conserva su archivo tal cual estaba.
   · Un corte de cuota no cuenta como intento. Si contara, tres corridas
     con la cuota agotada harían que se dejen de pedir para siempre
     estadísticas que existen.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { compactar, esJugado, caminar, anticipar, sumarAnticipados,
         estadisticasDe, faltan, unir } from "./consulta-datos.mjs";

const aca = p => new URL(p, import.meta.url);
const KEY = process.env.API_FOOTBALL_KEY || process.argv[2] || "";
const BASE = "https://v3.football.api-sports.io";
const TOPE = +(process.env.TOPE || 700);
const CARPETA = aca("./estadisticas/");
const dormir = ms => new Promise(r => setTimeout(r, ms));

if (!KEY) { console.log("\nFalta la API key (API_FOOTBALL_KEY).\n"); process.exit(1); }

const CFG = JSON.parse(readFileSync(aca("./ligas.json"), "utf8"));
const TEMPORADA = +(process.env.TEMPORADA || CFG.temporada);
mkdirSync(CARPETA, { recursive: true });

let pedidos = 0, sinCuota = false;
class SinCuota extends Error {}

/* Devuelve la respuesta, o tira. Un error de cuota tira `SinCuota`, que
   corta todo: seguir pidiendo con la cuota agotada es sumar errores. */
async function api(path, params = {}) {
  const url = BASE + path + "?" + new URLSearchParams(params);
  let ultimo = null;
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { "x-apisports-key": KEY } });
      pedidos++;
      if (r.status === 429) { await dormir(2000 * i); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (j.errors && !Array.isArray(j.errors) && Object.keys(j.errors).length) {
        const txt = Object.values(j.errors).join(" · ");
        if (/request|limit|plan/i.test(Object.keys(j.errors).join(" ") + " " + txt)) throw new SinCuota(txt);
        throw new Error(txt);
      }
      await dormir(120);
      return j.response || [];
    } catch (e) {
      if (e instanceof SinCuota) throw e;
      ultimo = e; await dormir(700 * i);
    }
  }
  throw ultimo || new Error("sin respuesta");
}

const archivo = slug => new URL(slug + ".json", CARPETA);
const leer = slug => { try { return JSON.parse(readFileSync(archivo(slug), "utf8")); } catch (e) { return null; } };
const escribir = (slug, datos) => writeFileSync(archivo(slug), JSON.stringify(datos) + "\n");

console.log("\n" + "═".repeat(70));
console.log("  ESTADÍSTICAS DE CONSULTA · temporada " + TEMPORADA + " · tope " + TOPE);
console.log("═".repeat(70));

/* ─── 1 y 2. las temporadas y lo que daba el modelo ──────────────────────── */
const ligas = [];
for (const L of CFG.ligas) {
  if (sinCuota) break;
  const guardado = leer(L.slug) || {};
  try {
    const actual = (await api("/fixtures", { league: L.id, season: TEMPORADA })).map(compactar)
      .filter(p => p.id && p.local && p.visita);
    if (!actual.length) { console.log(`\n  ${L.pais}: la API no trajo partidos. Queda lo guardado.`); continue; }

    let previa = guardado.previa && guardado.previaDe === TEMPORADA - 1 ? guardado.previa : null;
    if (!previa) {
      previa = (await api("/fixtures", { league: L.id, season: TEMPORADA - 1 })).map(compactar)
        .filter(esJugado).map(({ id, fecha, local, visita, gl, gv, estado }) =>
          ({ id, fecha, local, visita, gl, gv, estado }));
    }

    const partidos = unir(guardado.partidos, actual);
    const { daba, L: caminada } = caminar(previa, partidos);
    for (const p of partidos) p.p = daba.get(p.id) || null;
    const ahora = new Date().toISOString();
    const anticipados = sumarAnticipados(guardado.anticipados,
      anticipar(caminada, partidos.filter(p => p.estado === "NS")), ahora);

    const datos = { version: 1, slug: L.slug, id: L.id, nombre: L.nombre, pais: L.pais,
                    temporada: TEMPORADA, actualizado: ahora,
                    partidos, anticipados, previa, previaDe: TEMPORADA - 1 };
    escribir(L.slug, datos);
    ligas.push(datos);
    console.log(`\n  ${L.pais}: ${partidos.filter(esJugado).length} jugados · ` +
                `${daba.size} con lo que daba el modelo · ${Object.keys(anticipados).length} anticipados`);
  } catch (e) {
    if (e instanceof SinCuota) { sinCuota = true; console.log(`\n  ✗ Sin cuota: ${e.message}`); break; }
    console.log(`\n  ✗ ${L.pais}: ${e.message}. Queda lo guardado.`);
  }
}

/* ─── 3. las estadísticas, una vez por partido ───────────────────────────── */
const cola = ligas.flatMap(d => faltan(d.partidos).map(id => {
  const p = d.partidos.find(x => x.id === id);
  return { d, p };
})).sort((a, b) => new Date(b.p.fecha) - new Date(a.p.fecha)).slice(0, TOPE);

console.log(`\n  Estadísticas pendientes en esta corrida: ${cola.length}`);
let traidas = 0, vacias = 0;
const tocadas = new Set();
for (const { d, p } of cola) {
  if (sinCuota) break;
  try {
    const st = estadisticasDe(await api("/fixtures/statistics", { fixture: p.id }), p.local, p.visita);
    if (st) { p.st = st; traidas++; } else { p.sti = (p.sti || 0) + 1; vacias++; }
    tocadas.add(d);
  } catch (e) {
    if (e instanceof SinCuota) { sinCuota = true; console.log(`  ✗ Sin cuota: ${e.message}`); break; }
    /* Un error de red cuenta como intento: el partido puede no tenerlas. */
    p.sti = (p.sti || 0) + 1; tocadas.add(d);
  }
  if ((traidas + vacias) % 100 === 0) for (const x of tocadas) escribir(x.slug, x);
}
for (const d of tocadas) escribir(d.slug, d);

const resto = ligas.reduce((a, d) => a + faltan(d.partidos).length, 0);
const resumen = `${pedidos} pedidos · ${traidas} partidos con estadísticas nuevas · ${vacias} sin datos` +
  ` · quedan ${resto} para la próxima${sinCuota ? " · CORTADA POR CUOTA" : ""}`;
console.log("\n  " + resumen + "\n");
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### Estadísticas de consulta\n\n" + resumen + "\n");
