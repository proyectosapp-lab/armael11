/* ══════════════════════════════════════════════════════════════════════════
   LIGAS-API — baja lo que hace falta para simular CUALQUIER partido de las
   ligas de `ligas.json`, y calcula los números propios de cada una.

     node ligas-api.mjs            usa API_FOOTBALL_KEY del entorno
     node ligas-api.mjs TU_KEY

   POR QUÉ NO ALCANZABA CON `datos-juego.mjs`. Ese guarda las respuestas
   crudas de la API, una por club argentino, y sirve para lo que hace: el
   próximo partido de tu club y el último jugado, con la revelación del once
   del DT. Para seis ligas enteras eso serían decenas de megas de JSON crudo
   por un dato que el motor usa en tres líneas.

   Acá se guarda lo COCINADO: por jugador, su promedio de rating y sus
   minutos, que es literalmente todo lo que mira `fuerza()`. Una liga entera
   entra en unas decenas de kilobytes.

   Y se guardan los tres números de la liga —goles de local, de visitante y
   media de rating—, que hasta el 2026-08-29 estaban fijos con forma
   argentina. El documento del backtest ya decía que cada liga corre con sus
   propios promedios; el motor no lo hacía.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { constantesDeLiga, MINIMO_PARTIDOS } from "./juego.js";

const aca  = p => new URL(p, import.meta.url);
const KEY  = process.env.API_FOOTBALL_KEY || process.argv[2] || "";
const BASE = "https://v3.football.api-sports.io";

const CFG = JSON.parse(readFileSync(aca("./ligas.json")));
const TEMPORADA = +(process.env.TEMPORADA || CFG.temporada || 2026);
const TOPE_EQUIPOS = CFG.porLiga?.equiposPorRonda || 12;
const ULTIMOS      = CFG.porLiga?.partidosParaRatings || 5;

const SALIDA = new URL("./sitio/datos/", import.meta.url);
mkdirSync(SALIDA, { recursive: true });

const linea = "═".repeat(70);

/* Sin key no se baja nada, pero tampoco se rompe la corrida: el resto del
   sitio sale igual y el simulador se queda con el club propio. */
if (!KEY) {
  console.log("\n  Sin API_FOOTBALL_KEY: no bajo las ligas para simular.\n");
  process.exit(0);
}

let pedidos = 0, fallos = 0;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const memoria = new Map();

async function api(path, params = {}) {
  const url = path + "?" + new URLSearchParams(params);
  if (memoria.has(url)) return memoria.get(url);
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(BASE + url, { headers: { "x-apisports-key": KEY } });
      pedidos++;
      if (r.status === 429) { await dormir(2000 * i); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (j.errors && !Array.isArray(j.errors) && Object.keys(j.errors).length)
        throw new Error(Object.values(j.errors).join(" · "));
      const datos = j.response || [];
      memoria.set(url, datos);
      await dormir(120);
      return datos;
    } catch (e) {
      if (i === 3) { fallos++; console.log("      ✗ " + url + " — " + e.message);
                     memoria.set(url, []); return []; }
      await dormir(800 * i);
    }
  }
}

const JUGADO = f => ["FT", "AET", "PEN"].includes(f?.fixture?.status?.short);
const POR_JUGAR = f => ["NS", "TBD"].includes(f?.fixture?.status?.short);
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

console.log("\n" + linea);
console.log("  LIGAS PARA SIMULAR · temporada " + TEMPORADA);
console.log(linea);

/* Los archivos de la corrida anterior se borran primero: una liga que dejó
   de estar en ligas.json no puede seguir apareciendo en el selector. */
for (const f of readdirSync(SALIDA))
  if (/^liga-.*\.js$/.test(f)) rmSync(new URL(f, SALIDA));

const publicadas = [];

for (const L of CFG.ligas) {
  console.log("\n  " + L.nombre + " (" + L.pais + ")");

  /* ─── 1. el calendario ───────────────────────────────────────────────── */
  let fixtures = await api("/fixtures", { league: L.id, season: TEMPORADA });
  let jugados  = fixtures.filter(JUGADO);
  let deQue    = TEMPORADA;

  /* En agosto, una liga europea recién arranca: con cuatro fechas los
     promedios son ruido. Se cae a la temporada anterior SOLO para los
     números de la liga; los partidos por jugar salen de la actual. */
  let paraNumeros = jugados;
  if (paraNumeros.length < MINIMO_PARTIDOS) {
    const viejos = (await api("/fixtures", { league: L.id, season: TEMPORADA - 1 })).filter(JUGADO);
    if (viejos.length > paraNumeros.length) { paraNumeros = viejos; deQue = TEMPORADA - 1; }
  }

  /* ─── 2. el próximo partido de cada equipo ───────────────────────────── */
  const porJugar = fixtures.filter(POR_JUGAR)
    .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
    .slice(0, TOPE_EQUIPOS);

  if (!porJugar.length) {
    console.log("    sin partidos por jugar: no la publico");
    continue;
  }

  const equiposIds = [...new Set(porJugar.flatMap(f => [f.teams.home.id, f.teams.away.id]))];

  /* ─── 3. los ratings, de los últimos partidos de cada equipo ─────────── */
  const aBajar = new Set();
  for (const id of equiposIds) {
    const suyos = (jugados.length ? jugados : paraNumeros)
      .filter(f => f.teams.home.id === id || f.teams.away.id === id)
      .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
      .slice(-ULTIMOS);
    suyos.forEach(f => aBajar.add(f.fixture.id));
  }

  const acum = new Map();                       /* jugador -> {suma, n, mins, equipo} */
  const todosLosRatings = [];
  for (const fid of aBajar) {
    for (const eq of await api("/fixtures/players", { fixture: fid })) {
      for (const j of (eq.players || [])) {
        const e = (j.statistics || [])[0]; if (!e) continue;
        const r = parseFloat(e.games?.rating), mins = num(e.games?.minutes);
        if (isFinite(r) && r > 0) todosLosRatings.push(r);
        const id = j.player?.id; if (!id) continue;
        const a = acum.get(id) || { suma:0, n:0, mins:0, nombre:j.player?.name || "?",
                                    equipo: eq.team?.id, pos: e.games?.position || "M" };
        if (isFinite(r) && r > 0) { a.suma += r; a.n++; }
        a.mins += mins;
        a.equipo = eq.team?.id || a.equipo;
        acum.set(id, a);
      }
    }
  }

  /* La lista oficial del plantel manda para el PUESTO: sin esto, un lateral
     que tapó un hueco en el medio queda de volante para siempre. */
  const puestoOficial = new Map();
  for (const id of equiposIds)
    for (const g of (await api("/players/squads", { team: id })))
      for (const j of (g.players || []))
        puestoOficial.set(j.id, (j.position || "Midfielder")[0].toUpperCase());

  /* ─── 4. los números de la liga ──────────────────────────────────────── */
  const K = constantesDeLiga(paraNumeros, todosLosRatings);
  if (K.suficientes) {
    console.log("    " + K.partidos + " partidos de " + deQue + " · " +
      K.local.toFixed(2) + " goles de local, " + K.visita.toFixed(2) + " de visitante" +
      (K.media ? " · rating medio " + K.media.toFixed(2) : " · sin rating medio, uso el respaldo"));
  } else {
    console.log("    solo " + K.partidos + " partidos jugados: uso los números de respaldo");
  }

  /* ─── 5. a guardar, cocinado ─────────────────────────────────────────── */
  const equipos = {};
  for (const f of porJugar)
    for (const t of [f.teams.home, f.teams.away])
      equipos[t.id] = equipos[t.id] || { n: t.name, j: [] };

  for (const [id, a] of acum) {
    const e = equipos[a.equipo]; if (!e) continue;
    e.j.push({ i:id, n:a.nombre, p:(puestoOficial.get(id) || a.pos || "M").slice(0,1),
               r: a.n ? Math.round(a.suma / a.n * 100) / 100 : null, m: a.mins });
  }

  const flacos = Object.entries(equipos).filter(([, e]) => e.j.length < 11).map(([, e]) => e.n);
  const salida = {
    id: L.id, slug: L.slug, nombre: L.nombre, pais: L.pais, propia: !!L.propia,
    temporada: TEMPORADA,
    media:  K.media  ?? null,
    local:  K.suficientes ? K.local  : null,
    visita: K.suficientes ? K.visita : null,
    calibrada: K.suficientes ? { partidos: K.partidos, temporada: deQue } : null,
    equipos,
    partidos: porJugar.map(f => ({
      id: f.fixture.id, fecha: f.fixture.date, ronda: f.league?.round || "",
      local: f.teams.home.id, visita: f.teams.away.id,
    })),
    generado: new Date().toISOString(),
  };

  writeFileSync(new URL("liga-" + L.slug + ".js", SALIDA),
    "window.LIGAS=window.LIGAS||{};window.LIGAS[" + JSON.stringify(L.slug) + "]=" +
    JSON.stringify(salida) + ";\n");
  publicadas.push(L.slug);
  console.log("    ✓ " + Object.keys(equipos).length + " equipos · " + acum.size +
    " jugadores · " + porJugar.length + " partidos" +
    (flacos.length ? "  ⚠ con menos de 11: " + flacos.join(", ") : ""));
}

writeFileSync(new URL("ligas.js", SALIDA),
  "window.LIGAS_DISPONIBLES=" + JSON.stringify(publicadas) + ";\n");

console.log("\n" + "─".repeat(70));
console.log("  " + publicadas.length + " liga(s) publicada(s) · " + pedidos +
            " pedidos a la API · " + fallos + " fallaron");
console.log("─".repeat(70) + "\n");
