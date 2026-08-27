/* ══════════════════════════════════════════════════════════════════════════
   FANTASY-API — publica la próxima fecha: cuándo cierra y con qué precios.

     node fantasy-api.mjs            usa API_FOOTBALL_KEY del entorno
     node fantasy-api.mjs TU_KEY

   Escribe `fecha-actual.json`, que es lo único que la pantalla necesita. Y
   si además está SUPABASE_SERVICE_KEY, escribe la fila de `fechas` en la
   base — que es donde vive el cierre de verdad. Sin esa fila, la base
   rechaza cualquier equipo: no hay fecha a la cual pertenecer.

   POR QUÉ EL CIERRE VA EN LA BASE Y NO ACÁ: si viviera en el archivo, sería
   una sugerencia. Un archivo publicado lo lee el navegador y el navegador
   es de otro. En la base es una política que no se puede esquivar.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from "node:fs";
import { REGLAS, FORMATO, ponerPrecios } from "./fantasy.mjs";

const aca  = p => new URL(p, import.meta.url);
const KEY  = process.env.API_FOOTBALL_KEY || process.argv[2] || "";
const BASE = "https://v3.football.api-sports.io";
const LEAGUE = 128, TEMPORADA = +(process.env.TEMPORADA || 2026);

if (!KEY) { console.log("\n  Falta la API key: node fantasy-api.mjs TU_KEY\n"); process.exit(1); }

const dormir = ms => new Promise(r => setTimeout(r, ms));
let pedidos = 0;

async function api(path, params = {}) {
  const url = BASE + path + "?" + new URLSearchParams(params);
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { "x-apisports-key": KEY } });
      pedidos++;
      if (r.status === 429) { await dormir(2000 * i); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (j.errors && !Array.isArray(j.errors) && Object.keys(j.errors).length)
        throw new Error(Object.values(j.errors).join(" · "));
      await dormir(110);
      return j.response || [];
    } catch (e) { if (i === 3) { console.log("    ✗ " + path + " — " + e.message); return []; }
                  await dormir(700 * i); }
  }
}

const linea = "═".repeat(70);
console.log("\n" + linea + "\n  LA PRÓXIMA FECHA DEL FANTASY\n" + linea);

/* ─── 1. ¿CUÁL ES LA PRÓXIMA FECHA Y CUÁNDO EMPIEZA? ──────────────────────
   No hace falta que nadie la cargue a mano: está en el calendario. Se
   agrupan los partidos que todavía no se jugaron por el nombre de la ronda
   y se toma la que arranca primero. El cierre es la hora del PRIMER partido
   de esa ronda — no la del último, porque para cuando juegue el último ya
   sabrías qué hicieron los demás.                                        */
const fixtures = await api("/fixtures", { league: LEAGUE, season: TEMPORADA });
const porJugar = fixtures.filter(f => ["NS", "TBD", "PST"].includes(f.fixture?.status?.short));

if (!porJugar.length) {
  console.log("\n  No hay partidos por jugar en la temporada " + TEMPORADA + ".");
  console.log("  No publico fecha: sin partidos no hay nada que armar.\n");
  process.exit(0);
}

const rondas = new Map();
for (const f of porJugar) {
  const r = f.league?.round || "Fecha";
  if (!rondas.has(r)) rondas.set(r, []);
  rondas.get(r).push(f);
}
const [ronda, partidos] = [...rondas.entries()]
  .map(([r, ps]) => [r, ps.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))])
  .sort((a, b) => new Date(a[1][0].fixture.date) - new Date(b[1][0].fixture.date))[0];

const cierra = partidos[0].fixture.date;
const numero = +(String(ronda).match(/(\d+)\s*$/)?.[1]) || 1;
const torneo = String(ronda).split(/\s+-\s+/)[0].trim();

console.log("\n  " + ronda);
console.log("  " + partidos.length + " partidos · cierra " +
            new Date(cierra).toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba" }));

/* ─── 2. LOS JUGADORES Y SUS PRECIOS ──────────────────────────────────────
   Un aviso honesto sobre esta cuenta: `/players` da el ACUMULADO de la
   temporada, no partido por partido. Con eso se puede reconstruir casi
   todo el puntaje —goles, asistencias, pases clave, quites, tarjetas,
   atajadas, presencia— pero NO las vallas invictas, que son por partido.

   Así que el precio sale de un puntaje aproximado, y esa aproximación
   castiga un poco a arqueros y defensores. Se dice acá y se dice en la
   app: un precio que no se puede explicar se siente arbitrario. Cuando
   tengamos fechas jugadas con nuestro propio cálculo, el precio va a salir
   de los puntos de verdad y esto se cae solo.                            */
async function traerJugadores() {
  const bruto = [];
  let pagina = 1, total = 1;
  while (pagina <= total && pagina <= 60) {
    const r = await fetch(BASE + "/players?" + new URLSearchParams(
      { league: LEAGUE, season: TEMPORADA, page: pagina }),
      { headers: { "x-apisports-key": KEY } }).then(x => x.json()).catch(() => null);
    pedidos++;
    if (!r || !r.response) break;
    total = r.paging?.total || 1;
    bruto.push(...r.response);
    pagina++;
    await dormir(120);
  }
  return bruto;
}

console.log("\n  Trayendo los jugadores…");
const brutos = await traerJugadores();

const PUESTO = { Goalkeeper: "G", Defender: "D", Midfielder: "M", Attacker: "F" };
const num = v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
const porId = new Map();

for (const j of brutos) {
  const id = j.player?.id; if (!id) continue;
  for (const st of (j.statistics || [])) {
    if (st.league?.id && st.league.id !== LEAGUE) continue;
    const pj = num(st.games?.appearences); if (!pj) continue;
    const p = PUESTO[st.games?.position] || "M";

    /* El mismo reglamento, aplicado al acumulado. */
    let pts = 0;
    pts += pj * REGLAS.presencia.sesenta;               // aproximación: titular
    pts += num(st.goals?.total)   * REGLAS.gol[p];
    pts += num(st.goals?.assists) * REGLAS.asistencia;
    pts += Math.floor(num(st.passes?.key) / REGLAS.clavesPorPunto);
    pts += Math.floor((num(st.tackles?.total) + num(st.tackles?.interceptions)) / REGLAS.quitesCada);
    if (p === "G") pts += Math.floor(num(st.goals?.saves) / REGLAS.atajadasCada);
    pts += Math.floor(num(st.goals?.conceded) / REGLAS.recibidosCada) * (REGLAS.recibidosPena[p] || 0);
    pts += num(st.cards?.yellow) * REGLAS.amarilla;
    pts += num(st.cards?.red)    * REGLAS.roja;
    pts += num(st.penalty?.saved)  * REGLAS.penalAtajado;
    pts += num(st.penalty?.missed) * REGLAS.penalErrado;

    const antes = porId.get(id);
    porId.set(id, {
      id, nombre: j.player?.name || "?", puesto: p,
      club: st.team?.name || antes?.club || "?", clubId: st.team?.id || antes?.clubId || null,
      partidos: (antes?.partidos || 0) + pj,
      puntosTotales: (antes?.puntosTotales || 0) + pts,
    });
  }
}

/* Solo los de los clubes que juegan esta fecha: ofrecer a alguien cuyo
   equipo no juega es ofrecer un cero seguro. */
const clubesQueJuegan = new Set(partidos.flatMap(f => [f.teams?.home?.id, f.teams?.away?.id]));
const lista = [...porId.values()].filter(j => clubesQueJuegan.has(j.clubId));

const conPrecio = ponerPrecios(lista)
  .map(({ id, nombre, club, clubId, puesto, precio, ppp, partidos }) =>
       ({ id, nombre, club, clubId, puesto, precio, ppp, pj: partidos }))
  .sort((a, b) => b.precio - a.precio || b.ppp - a.ppp);

const salida = {
  numero, torneo, ronda, cierra,
  presupuesto: FORMATO.presupuesto,
  jugadores: conPrecio,
  generado: new Date().toISOString(),
  nota: "Los precios salen de los puntos por partido de la temporada, con la " +
        "fórmula publicada. Es una aproximación: el acumulado de la API no " +
        "permite reconstruir las vallas invictas, así que arqueros y " +
        "defensores quedan un poco baratos.",
};
writeFileSync(aca("./fecha-actual.json"), JSON.stringify(salida, null, 1));

const cuantos = p => conPrecio.filter(j => j.puesto === p).length;
console.log("\n  " + conPrecio.length + " jugadores de " + clubesQueJuegan.size + " clubes");
console.log("  arqueros " + cuantos("G") + " · defensores " + cuantos("D") +
            " · medios " + cuantos("M") + " · delanteros " + cuantos("F"));
console.log("  los cinco más caros: " +
  conPrecio.slice(0, 5).map(j => j.nombre + " (" + j.precio + ")").join(", "));

/* Que no se publique una fecha imposible de armar. */
const MINIMOS = { G: 4, D: 12, M: 12, F: 8 };
const flojos = Object.entries(MINIMOS).filter(([p, n]) => cuantos(p) < n);
if (flojos.length) {
  console.log("\n  ⚠ Muy pocos jugadores en: " + flojos.map(f => f[0]).join(", ") +
              ". Con esto no se puede armar un equipo. NO publico la fecha.");
  writeFileSync(aca("./fecha-actual.json"), JSON.stringify({ ...salida, jugadores: [] }, null, 1));
  process.exit(1);
}

/* ─── 3. LA FILA EN LA BASE, QUE ES DONDE VIVE EL CIERRE ─────────────────── */
const SB = (() => {
  try { const c = JSON.parse(readFileSync(aca("./sitio.json"))); return c.supabase || {}; }
  catch (e) { return {}; }
})();
const SERVICIO = process.env.SUPABASE_SERVICE_KEY || "";

if (!SB.url || !SERVICIO) {
  console.log("\n  Sin SUPABASE_SERVICE_KEY: no escribo la fila de `fechas`.");
  console.log("  La pantalla va a andar, pero la base va a rechazar los equipos");
  console.log("  porque esa fecha no existe para ella.\n" + linea + "\n");
  process.exit(0);
}

const r = await fetch(SB.url + "/rest/v1/fechas", {
  method: "POST",
  headers: { apikey: SERVICIO, Authorization: "Bearer " + SERVICIO,
             "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
  body: JSON.stringify({ numero, torneo, cierra, publicada: true }),
});
if (r.ok) console.log("\n  Fecha " + numero + " escrita en la base. El cierre ya es real.");
else console.log("\n  ✗ No pude escribir la fecha: HTTP " + r.status + " " +
                 (await r.text()).slice(0, 200));

console.log("\n  " + pedidos + " pedidos a la API\n" + linea + "\n");
