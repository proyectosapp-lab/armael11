/* ══════════════════════════════════════════════════════════════════════════
   STATS-API — la pestaña Números, hecha con datos frescos y con la tabla
   que publica la liga.

   Reemplaza a stats.mjs, que leía un archivo guardado. Dos problemas tenía
   ese camino, y los dos se veían en pantalla:

   1. LA TABLA NO ERA LA TABLA. Se calculaba sumando todos los partidos que
      había en el archivo, y ahí adentro estaban mezclados la fase regular y
      los playoffs. Al que llegó a la final le contaba 25 partidos y al que
      quedó afuera en la primera ronda, 21. Ninguna tabla del mundo dice eso.
      Ahora la tabla la pide a /standings, que es la que publica la liga.

   2. ESTABA CONGELADO. `stats-liga.js` se generó una vez y quedó commiteado.
      Una semana después seguía mostrando la foto de esa noche.

     node stats-api.mjs           usa API_FOOTBALL_KEY del entorno
     node stats-api.mjs TU_KEY
   ══════════════════════════════════════════════════════════════════════════ */
import { writeFileSync } from "node:fs";
import { calcular, esFaseRegular } from "./stats-calc.mjs";

const aca  = p => new URL(p, import.meta.url);
const KEY  = process.env.API_FOOTBALL_KEY || process.argv[2] || "";
const BASE = "https://v3.football.api-sports.io";
const LEAGUE = 128, TEMPORADA = +(process.env.TEMPORADA || 2026);
/* Los tiros y el xG salen de un pedido POR PARTIDO. Traer los 330 en cada
   corrida sería gastar media cuota en números que casi no se mueven, así
   que se traen los más recientes y el resto queda sin ese dato — que es
   justo el caso que las columnas de xG ya sabían manejar.               */
const CON_DETALLE = +(process.env.DETALLE || 150);

if (!KEY) { console.log("\nFalta la API key: node stats-api.mjs TU_KEY\n"); process.exit(1); }

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

console.log("\n" + "═".repeat(70));
console.log("  NÚMEROS DE LA LIGA · temporada " + TEMPORADA);
console.log("═".repeat(70) + "\n");

/* ─── 1. los partidos ────────────────────────────────────────────────────── */
const crudos = await api("/fixtures", { league: LEAGUE, season: TEMPORADA });
const JUGADO = f => ["FT", "AET", "PEN"].includes(f.fixture.status.short);

const todos = crudos.filter(JUGADO).map(f => ({
  id: f.fixture.id, fecha: f.fixture.date,
  h: f.teams.home.id, hn: f.teams.home.name,
  a: f.teams.away.id, an: f.teams.away.name,
  gh: f.goals.home, ga: f.goals.away,
  ronda: f.league?.round || "",
  th: null, ta: null, xh: null, xa: null,
})).filter(m => m.gh != null && m.ga != null)
   .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

const P = todos.filter(m => esFaseRegular(m.ronda));
const rondas = [...new Set(todos.map(m => m.ronda))];
const fuera  = [...new Set(todos.filter(m => !esFaseRegular(m.ronda)).map(m => m.ronda))];

console.log("  " + crudos.length + " partidos en la temporada · " + todos.length + " jugados");
console.log("  " + P.length + " de fase regular · " + (todos.length - P.length) + " de eliminación");
if (fuera.length) console.log("  rondas excluidas: " + fuera.join(" · "));
if (!P.length) { console.log("\n  No entró ningún partido. No toco nada.\n"); process.exit(1); }

/* ─── 2. tiros y xG de los más recientes ─────────────────────────────────── */
const recientes = P.slice(-CON_DETALLE);
console.log("\n  Trayendo tiros y xG de los últimos " + recientes.length + " partidos…");
let conXG = 0;
for (const m of recientes) {
  const st = await api("/fixtures/statistics", { fixture: m.id });
  const de = id => (st.find(x => x.team?.id === id)?.statistics || []);
  const val = (arr, tipo) => {
    const v = arr.find(s => s.type === tipo)?.value;
    if (v == null) return null;
    const n = parseFloat(String(v).replace("%", ""));
    return isNaN(n) ? null : n;
  };
  const H = de(m.h), A = de(m.a);
  m.th = val(H, "Total Shots"); m.ta = val(A, "Total Shots");
  m.xh = val(H, "expected_goals"); m.xa = val(A, "expected_goals");
  if (m.xh != null && m.xa == null) m.xh = null;      // xG a medias no sirve
  if (m.xh != null) conXG++;
}
console.log("  " + conXG + " de " + recientes.length + " traen xG");

/* ─── 3. las tablas que publica la liga ──────────────────────────────────
   Devuelve varias: el torneo terminado, el que está en curso, cada zona. Las
   guardamos TODAS. Quedarse con una sola y elegirla mal —nos pasó: elegimos
   la del que tenía más partidos jugados, que era el torneo YA TERMINADO— es
   mostrar algo cierto y viejo, que se ve igual de mal que algo falso.    */
const st = await api("/standings", { league: LEAGUE, season: TEMPORADA });
const grupos = st?.[0]?.league?.standings || [];

const fila = r => ({ id: r.team?.id, nom: r.team?.name,
  pj: r.all?.played ?? 0, g: r.all?.win ?? 0, e: r.all?.draw ?? 0, p: r.all?.lose ?? 0,
  gf: r.all?.goals?.for ?? 0, gc: r.all?.goals?.against ?? 0, pts: r.points ?? 0,
  forma: (r.form || "").split("").map(c => ({ W:"G", D:"E", L:"P" }[c] || c)).slice(-5) });

const tablas = grupos
  .filter(g => Array.isArray(g) && g.length)
  .map(g => ({ nombre: g[0].group || "Tabla", filas: g.map(fila) }));

console.log("\n  /standings devolvió " + tablas.length + " tabla(s):");
for (const t of tablas)
  console.log("    · " + t.nombre.padEnd(34) + t.filas.length + " equipos · " +
              [...new Set(t.filas.map(f => f.pj))].sort((a,b)=>a-b).join("/") + " partidos");
if (!tablas.length) console.log("    ninguna. Queda solo la anual que calculamos nosotros.");

/* ─── 3b. los jugadores ──────────────────────────────────────────────────
   Goleadores, asistencias y quién genera situaciones. Estuvo desde el
   principio en la lista de "lo que falta" y nunca se hizo, porque son datos
   de JUGADOR y todo lo demás son datos de PARTIDO.

   /players trae a todos, de a veinte por página: unas cuarenta páginas para
   una liga de treinta equipos. Es el pedido más caro de la corrida y aun así
   entra sobrado en la cuota.

   Un jugador puede aparecer con más de una estadística —si cambió de equipo
   a mitad de año— así que se suman todas y se guarda el último club.     */
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

const porJugador = new Map();
for (const j of brutos) {
  const id = j.player?.id; if (!id) continue;
  if (!porJugador.has(id)) porJugador.set(id, {
    id, nombre: j.player?.name || "?", equipo: "", equipoId: null,
    goles: 0, asist: 0, claves: 0, tiros: 0, min: 0, pj: 0, notas: [] });
  const p = porJugador.get(id);
  for (const st of (j.statistics || [])) {
    if (st.league?.id && st.league.id !== LEAGUE) continue;   // solo esta liga
    p.goles  += st.goals?.total   || 0;
    p.asist  += st.goals?.assists || 0;
    p.claves += st.passes?.key    || 0;
    p.tiros  += st.shots?.total   || 0;
    p.min    += st.games?.minutes  || 0;
    p.pj     += st.games?.appearences || 0;
    const n = parseFloat(st.games?.rating);
    if (!isNaN(n)) p.notas.push(n);
    if (st.team?.name) { p.equipo = st.team.name; p.equipoId = st.team.id; }
  }
}

const listaJug = [...porJugador.values()].map(p => ({
  ...p, nota: p.notas.length ? +(p.notas.reduce((a, b) => a + b, 0) / p.notas.length).toFixed(2) : null,
}));
const mejores = (f, n = 10, filtro = () => true) => listaJug.filter(filtro)
  .filter(p => f(p) > 0).sort((a, b) => f(b) - f(a) || b.min - a.min).slice(0, n)
  .map(p => ({ id: p.id, nombre: p.nombre, equipo: p.equipo, equipoId: p.equipoId,
               goles: p.goles, asist: p.asist, claves: p.claves, tiros: p.tiros,
               pj: p.pj, min: p.min, nota: p.nota }));

/* Para el promedio de puntaje se pide un mínimo de minutos: si no, el que
   entró diez minutos y le pusieron 8 encabeza la lista de la liga.     */
const MIN_MINUTOS = 450;
const jugadores = listaJug.length ? {
  cuantos: listaJug.length,
  goleadores:  mejores(p => p.goles),
  asistencias: mejores(p => p.asist),
  generadores: mejores(p => p.claves),
  puntajes:    mejores(p => p.nota || 0, 10, p => p.min >= MIN_MINUTOS),
  nota: "De " + listaJug.length + " jugadores de la liga. El promedio de puntaje pide " +
        MIN_MINUTOS + " minutos jugados como mínimo.",
} : null;

if (jugadores) {
  console.log("  " + listaJug.length + " jugadores · goleador: " +
    (jugadores.goleadores[0] ? jugadores.goleadores[0].nombre + " (" + jugadores.goleadores[0].goles + ")" : "—"));
} else console.log("  ⚠ no vino ningún jugador: la sección va a quedar como pendiente");

/* ─── 4. la cuenta ───────────────────────────────────────────────────────── */
const out = calcular(P, {
  tablas, jugadores,
  generado: new Date().toISOString(),
  notaXG: "El xG y los tiros salen de los últimos " + recientes.length +
          " partidos (" + conXG + " con xG). Las columnas de xG comparan solo esos, y van por partido.",
  nota: tablas.length
    ? "Las tablas marcadas son las que publica la Liga Profesional. La Anual la calculamos nosotros sobre los partidos de FASE REGULAR de toda la temporada: los playoffs son otra competencia y sumarlos deformaba todo."
    : "No se pudo leer ninguna tabla oficial en esta corrida. La Anual está calculada sobre los partidos de fase regular.",
});

writeFileSync(aca("./stats-liga.js"), "window.STATS = " + JSON.stringify(out) + ";");
writeFileSync(aca("./stats-liga.json"), JSON.stringify(out, null, 1));

console.log("\n" + "─".repeat(70));
console.log("  " + out.tabla.length + " equipos · " + pedidos + " pedidos a la API");
console.log("─".repeat(70));
for (const t of out.tablas) {
  const pj = [...new Set(t.filas.map(f => f.pj))].sort((a, b) => a - b);
  console.log("\n  " + t.nombre.toUpperCase() + (t.oficial ? "  (de la liga)" : "  (calculada)") +
              " · " + t.filas.length + " equipos · " + pj.join("/") + " partidos");
  t.filas.slice(0, 5).forEach(f => console.log(
    "    " + String(f.pos).padStart(2) + ". " + (f.nom || "?").padEnd(24) +
    String(f.pj).padStart(3) + " pj  " + String(f.pts).padStart(3) + " pts  " +
    String((f.dg > 0 ? "+" : "") + f.dg).padStart(4) + "  " + (f.forma || []).join("")));
}
console.log();
