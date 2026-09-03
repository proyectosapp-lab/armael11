/* ══════════════════════════════════════════════════════════════════════════
   DATOS-JUEGO — baja de API-Football lo que "Armá el 11" iba a pedir desde
   el navegador, y lo deja guardado.

   El problema que resuelve: hasta ahora la app le pedía al usuario SU API
   key. Para vos probando estaba bien; para un usuario real es inaceptable.
   Acá la key vive como secreto del repositorio, corre en la nube, y lo que
   llega al navegador son respuestas ya bajadas.

   No hubo que reescribir el juego. El juego pide cuatro cosas —fixtures,
   jugadores por partido, formaciones y eventos— y cada pedido se guarda
   con la MISMA clave que usa la pantalla: la URL relativa. El navegador
   busca ahí primero y encuentra.

   Qué se precalcula, por club: el PRÓXIMO partido y el ÚLTIMO JUGADO. Uno
   es el gancho —simular el del domingo— y el otro es la gracia: revelar qué
   puso el DT y qué pasó de verdad.

     node datos-juego.mjs          usa la variable de entorno API_FOOTBALL_KEY
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const aca  = p => new URL(p, import.meta.url);
const KEY  = process.env.API_FOOTBALL_KEY || process.argv[2] || "";
const BASE = "https://v3.football.api-sports.io";
const LEAGUE = 128;
const TEMPORADA = +(process.env.TEMPORADA || 2026);

if (!KEY) {
  console.log("\nFalta la API key.");
  console.log("  En tu máquina:  node datos-juego.mjs TU_KEY");
  console.log("  En la nube:     se toma del secreto API_FOOTBALL_KEY\n");
  process.exit(1);
}

const CLUBES = JSON.parse(readFileSync(aca("./clubes.json")));
const SALIDA = new URL("./sitio/datos/", import.meta.url);
mkdirSync(SALIDA, { recursive: true });

/* ─── un solo pedido por URL, aunque lo pidan diez clubes ────────────────
   Los treinta clubes juegan quince partidos: si cada uno pidiera lo suyo
   por su cuenta, cada partido se bajaría dos veces. Y los planteles se
   comparten todavía más.                                                 */
const memoria = new Map();
let pedidos = 0, fallos = 0;

const dormir = ms => new Promise(r => setTimeout(r, ms));

async function api(path, params = {}) {
  const clave = path + (Object.keys(params).length ? "?" + new URLSearchParams(params) : "");
  if (memoria.has(clave)) return { clave, datos: memoria.get(clave) };

  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(BASE + clave, { headers: { "x-apisports-key": KEY } });
      pedidos++;
      if (r.status === 429) { await dormir(2000 * intento); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (j.errors && !Array.isArray(j.errors) && Object.keys(j.errors).length)
        throw new Error(Object.values(j.errors).join(" · "));
      const datos = j.response || [];
      memoria.set(clave, datos);
      await dormir(120);                       // no apurar al servidor de nadie
      return { clave, datos };
    } catch (e) {
      if (intento === 3) { fallos++; console.log("    ✗ " + clave + " — " + e.message);
                           memoria.set(clave, []); return { clave, datos: [] }; }
      await dormir(800 * intento);
    }
  }
}

const JUGADO = f => ["FT", "AET", "PEN"].includes(f.fixture.status.short);

/* ─── por club ───────────────────────────────────────────────────────────── */
const conApi = CLUBES.filter(c => c.apiId);
console.log("\n" + "═".repeat(70));
console.log("  DATOS DEL JUEGO · temporada " + TEMPORADA + " · " + conApi.length + " clubes");
console.log("═".repeat(70) + "\n");

let listos = 0, vacios = [];

for (const club of conApi) {
  const cache = {};
  const guardar = ({ clave, datos }) => { cache[clave] = datos; return datos; };

  const mios = guardar(await api("/fixtures", { team: club.apiId, season: TEMPORADA, league: LEAGUE }))
    .filter(f => JUGADO(f) || f.fixture.status.short === "NS")
    .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

  if (!mios.length) { console.log("  · " + club.nom.padEnd(24) + "sin partidos"); vacios.push(club.nom); continue; }

  const proximo = mios.find(f => !JUGADO(f));
  const ultimo  = [...mios].reverse().find(JUGADO);
  const cuales  = [proximo, ultimo].filter(Boolean);

  for (const fx of cuales) {
    const rivalId = fx.teams.home.id === club.apiId ? fx.teams.away.id : fx.teams.home.id;
    const antes = f => new Date(f.fixture.date) < new Date(fx.fixture.date);

    /* Los planteles se arman con los partidos ANTERIORES a este, nunca con
       este: si no, el juego sabría de antemano quién jugó.               */
    const susFx = guardar(await api("/fixtures", { team: rivalId, season: TEMPORADA, league: LEAGUE }));
    /* Cinco partidos y no tres: con tres, el que se perdió una fecha por
       molestia desaparece del plantel y el hincha lo nota enseguida.   */
    const ultimos5 = lista => lista.filter(f => JUGADO(f) && antes(f))
      .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date)).slice(-5);

    for (const f of [...ultimos5(mios), ...ultimos5(susFx)])
      guardar(await api("/fixtures/players", { fixture: f.fixture.id }));

    /* La lista oficial del plantel, con el puesto de cada uno. Un pedido por
       equipo. Sin esto el puesto sale del último partido que jugó, y un
       lateral que tapó un hueco en el medio queda de volante para siempre. */
    guardar(await api("/players/squads", { team: club.apiId }));
    guardar(await api("/players/squads", { team: rivalId }));

    /* Las transferencias, un pedido por equipo. Es lo unico que contesta la
       pregunta "este todavia esta aca": la lista oficial de arriba se
       equivoca para los dos lados -deja gente que se fue y se olvida de
       gente que juega-, y sacar al que no jugo se lleva puesto al lesionado
       y al recien llegado. Dos pedidos mas por club sobre mil doscientos. */
    guardar(await api("/transfers", { team: club.apiId }));
    guardar(await api("/transfers", { team: rivalId }));

    /* Y para el que ya se jugó, lo que hace falta para revelar. */
    if (JUGADO(fx)) {
      guardar(await api("/fixtures/lineups", { fixture: fx.fixture.id }));
      guardar(await api("/fixtures/events",  { fixture: fx.fixture.id }));
    }
  }

  /* Qué partidos quedaron jugables. Sin esto la app ofrece los treinta de la
     temporada y falla al elegir uno viejo, cuyos planteles nadie bajó. */
  cache.__jugables = cuales.map(f => f.fixture.id);

  writeFileSync(new URL("cache-" + club.id + ".js", SALIDA),
    "window.CACHE = " + JSON.stringify(cache) + ";\n");
  listos++;
  console.log("  ✓ " + club.nom.padEnd(24) +
    Object.keys(cache).length + " respuestas" +
    (proximo ? " · próximo " + proximo.fixture.date.slice(0, 10) : " · sin próximo") +
    (ultimo  ? " · último "  + ultimo.fixture.date.slice(0, 10)  : ""));
}

console.log("\n" + "─".repeat(70));
console.log("  " + listos + " clubes listos · " + pedidos + " pedidos a la API · " + fallos + " fallaron");
if (vacios.length) console.log("  sin partidos en " + TEMPORADA + ": " + vacios.join(", "));
console.log("─".repeat(70) + "\n");
