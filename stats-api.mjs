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

/* ─── 3. la tabla que publica la liga ────────────────────────────────────── */
const st = await api("/standings", { league: LEAGUE, season: TEMPORADA });
const grupos = st?.[0]?.league?.standings || [];
console.log("\n  /standings devolvió " + grupos.length + " tabla(s): " +
  (grupos.map(g => g?.[0]?.group || "sin nombre").join(" · ") || "ninguna"));

const fila = r => ({ id: r.team?.id, nom: r.team?.name,
  pj: r.all?.played ?? 0, g: r.all?.win ?? 0, e: r.all?.draw ?? 0, p: r.all?.lose ?? 0,
  gf: r.all?.goals?.for ?? 0, gc: r.all?.goals?.against ?? 0, pts: r.points ?? 0,
  forma: (r.form || "").split("").map(c => ({ W:"G", D:"E", L:"P" }[c] || c)).slice(-5) });

/* Si la liga publica una tabla anual, esa es la que el hincha conoce. Si no,
   se juntan todas las zonas: un equipo aparece una sola vez.            */
const anual = grupos.find(g => /anual|general|acumulad/i.test(g?.[0]?.group || ""));
let oficial = null;
if (anual) { oficial = anual.map(fila); console.log("  uso la tabla \"" + anual[0].group + "\""); }
else if (grupos.length) {
  const porId = new Map();
  for (const g of grupos) for (const r of g.map(fila))
    if (!porId.has(r.id) || porId.get(r.id).pj < r.pj) porId.set(r.id, r);
  oficial = [...porId.values()].sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc));
  console.log("  junté las zonas en una sola tabla");
}
if (!oficial) console.log("  ⚠ sin tabla oficial: se calcula desde los partidos de fase regular");

/* ─── 4. la cuenta ───────────────────────────────────────────────────────── */
const out = calcular(P, {
  oficial,
  generado: new Date().toISOString(),
  notaXG: "El xG y los tiros salen de los últimos " + recientes.length +
          " partidos (" + conXG + " con xG). Las columnas de xG comparan solo esos, y van por partido.",
  nota: oficial
    ? "La tabla es la que publica la Liga Profesional. Las rachas, los tiros y el xG se calculan sobre los partidos de FASE REGULAR: los playoffs son otra competencia y sumarlos deformaba todo."
    : "Tabla calculada sobre los partidos de fase regular. No se pudo leer la tabla oficial en esta corrida.",
});

writeFileSync(aca("./stats-liga.js"), "window.STATS = " + JSON.stringify(out) + ";");
writeFileSync(aca("./stats-liga.json"), JSON.stringify(out, null, 1));

console.log("\n" + "─".repeat(70));
console.log("  " + out.tabla.length + " equipos · " + pedidos + " pedidos a la API");
console.log("─".repeat(70));
console.log("  " + "#".padStart(3) + "  " + "EQUIPO".padEnd(24) + "PJ".padStart(3) +
            "  PTS   DG   forma");
out.tabla.slice(0, 8).forEach(t => console.log(
  "  " + String(t.pos).padStart(3) + "  " + (t.nom || "?").padEnd(24) +
  String(t.pj).padStart(3) + "  " + String(t.pts).padStart(3) + "  " +
  String((t.dg > 0 ? "+" : "") + t.dg).padStart(4) + "   " + (t.forma || []).join("")));
const pj = [...new Set(out.tabla.map(t => t.pj))].sort((a, b) => a - b);
console.log("\n  partidos jugados en la tabla: " + pj.join(", ") +
            (pj.length > 2 ? "  ← si esto abre mucho, algo sigue mezclado" : ""));
console.log();
