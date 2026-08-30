/* ══════════════════════════════════════════════════════════════════════════
   PUNTOS-API — calcula lo que hizo cada equipo en una fecha ya jugada y lo
   escribe en la base.

     node puntos-api.mjs            la última fecha cerrada y jugada
     node puntos-api.mjs 7          esa fecha

   Sin esto, los torneos de amigos son una tabla de ceros: la gente arma su
   equipo, se juega la fecha y no pasa nada. Es la pieza que convierte una
   pantalla en un juego.

   ─── LAS TRES REGLAS QUE ORDENAN ESTE ARCHIVO ────────────────────────────

   1. LOS PUNTOS LOS ESCRIBE EL SERVIDOR, SIEMPRE. La tabla `puntaje` no
      tiene ninguna política de escritura: ni el teléfono ni nadie con la
      clave pública puede tocarla. Esto corre en GitHub con la clave de
      servicio, que es el único lugar donde vive.

   2. SE GUARDA EL DETALLE, NO SOLO EL TOTAL. "Te dieron 47" es un número
      que hay que creer; el detalle abierto es un número que se puede
      revisar. Va en la misma fila, y es lo que después dibuja la pantalla
      de resultados.

   3. RECALCULAR TIENE QUE DAR LO MISMO. Se puede correr diez veces sobre la
      misma fecha sin que cambie nada, porque el cálculo sale de los datos
      del partido y no de lo que había antes. Si la API corrige una
      estadística al día siguiente, se vuelve a correr y listo.

   Usa EL MISMO `fantasy.mjs` que la pantalla. Una sola tabla de puntos, una
   sola idea de qué vale cada cosa.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { actuacionDe, masValiosos, puntosDeFecha, enHoraArgentina } from "./fantasy.mjs";

const aca = p => new URL(p, import.meta.url);
const KEY = process.env.API_FOOTBALL_KEY || "";
const SERVICIO = process.env.SUPABASE_SERVICE_KEY || "";
const BASE = "https://v3.football.api-sports.io";
const LEAGUE = 128, TEMPORADA = +(process.env.TEMPORADA || 2026);

const linea = "═".repeat(70);
console.log("\n" + linea + "\n  LOS PUNTOS DE LA FECHA\n" + linea);

const SB = (() => {
  try { return (JSON.parse(readFileSync(aca("./sitio.json"))).supabase) || {}; }
  catch (e) { return {}; }
})();

/* Sin alguna de las dos llaves esto no puede hacer su trabajo, y hacerlo a
   medias sería peor: una tabla con la mitad de los puntajes se lee como que
   los otros sacaron cero. */
if (!KEY || !SERVICIO || !SB.url) {
  console.log("\n  Falta " + (!KEY ? "API_FOOTBALL_KEY" :
                              !SERVICIO ? "SUPABASE_SERVICE_KEY" : "el backend en sitio.json") +
              ": no calculo puntos.\n");
  process.exit(0);
}

const dormir = ms => new Promise(r => setTimeout(r, ms));
let pedidos = 0;

async function api(path, params = {}) {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(BASE + path + "?" + new URLSearchParams(params),
                            { headers: { "x-apisports-key": KEY } });
      pedidos++;
      if (r.status === 429) { await dormir(2000 * i); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      await dormir(110);
      return j.response || [];
    } catch (e) {
      if (i === 3) { console.log("    ✗ " + path + " — " + e.message); return []; }
      await dormir(800 * i);
    }
  }
}

const sb = (ruta, opciones = {}) => fetch(SB.url + "/rest/v1" + ruta, {
  ...opciones,
  headers: { apikey: SERVICIO, Authorization: "Bearer " + SERVICIO,
             "Content-Type": "application/json", ...(opciones.headers || {}) },
});

/* ─── 1. QUÉ FECHA TOCA ──────────────────────────────────────────────────
   La última que ya cerró y cuyos partidos terminaron. No la que está
   jugándose: puntuar a mitad de fecha sería publicar una tabla que cambia
   sola y que nadie entiende. */
const pedida = +process.argv[2] || null;
const fixtures = await api("/fixtures", { league: LEAGUE, season: TEMPORADA });
const JUGADO = f => ["FT", "AET", "PEN"].includes(f?.fixture?.status?.short);
const numeroDe = f => +(String(f.league?.round || "").match(/(\d+)\s*$/)?.[1]) || 0;

const porFecha = new Map();
for (const f of fixtures) {
  const n = numeroDe(f); if (!n) continue;
  if (!porFecha.has(n)) porFecha.set(n, []);
  porFecha.get(n).push(f);
}

const completas = [...porFecha.entries()]
  .filter(([, ps]) => ps.length && ps.every(p => JUGADO(p) ||
                        p.fixture.status.short === "PST"))
  .map(([n]) => n).sort((a, b) => a - b);

const numero = pedida || completas[completas.length - 1];
if (!numero) { console.log("\n  Ninguna fecha terminó todavía. No hay nada que calcular.\n"); process.exit(0); }
const partidos = (porFecha.get(numero) || []).filter(JUGADO);
if (!partidos.length) { console.log("\n  La fecha " + numero + " no tiene partidos jugados.\n"); process.exit(0); }

console.log("\n  Fecha " + numero + " · " + partidos.length + " partidos jugados" +
            (pedida ? " (pedida a mano)" : ""));

/* ─── 2. QUÉ HIZO CADA JUGADOR ───────────────────────────────────────────
   Un pedido por partido. Acá sí hace falta el detalle por partido —a
   diferencia de los precios, que salen del acumulado— porque la valla
   invicta y el más valioso son POR PARTIDO y no se pueden reconstruir de
   otra manera. */
const actuaciones = new Map();
const deCadaPartido = [];

for (const f of partidos) {
  const equipos = await api("/fixtures/players", { fixture: f.fixture.id });
  const recibidos = {};
  for (const t of equipos) {
    const rival = equipos.find(x => x.team?.id !== t.team?.id);
    const esLocal = t.team?.id === f.teams?.home?.id;
    recibidos[t.team?.id] = esLocal ? (f.goals?.away ?? 0) : (f.goals?.home ?? 0);
    void rival;
  }
  const deEste = [];
  for (const t of equipos)
    for (const j of (t.players || [])) {
      const a = actuacionDe(j, recibidos[t.team?.id] ?? 0);
      if (!a.jugador) continue;
      actuaciones.set(a.jugador, a);
      deEste.push(a);
    }
  deCadaPartido.push(deEste);
}

/* El más valioso se decide PARTIDO POR PARTIDO, uno por partido. Juntarlos
   todos y sacar los mejores del día sería otro juego. */
const mvps = new Set();
let sinPuntaje = 0;
for (const deEste of deCadaPartido) {
  const elegidos = masValiosos(deEste);
  if (!elegidos.length) sinPuntaje++;
  for (const id of elegidos) mvps.add(id);
}

console.log("  " + actuaciones.size + " actuaciones · " + mvps.size + " más valiosos" +
            (sinPuntaje ? " · " + sinPuntaje + " partido(s) sin puntajes del proveedor" : ""));

/* ─── 3. LOS EQUIPOS QUE SE GUARDARON ────────────────────────────────────── */
const r = await sb("/equipo?select=perfil,titulares,suplentes,capitan,vice&fecha=eq." + numero);
if (!r.ok) { console.log("\n  ✗ no pude leer los equipos: HTTP " + r.status + "\n"); process.exit(1); }
const equipos = await r.json();

if (!equipos.length) {
  console.log("\n  Nadie armó equipo en la fecha " + numero + ". Nada que calcular.\n");
  process.exit(0);
}

/* La fecha guarda ids de jugador; el reglamento quiere objetos con puesto.
   El puesto sale de la actuación, y si alguien no jugó, del archivo de la
   fecha, que es donde estaba cuando lo eligieron. */
let FECHA = null;
try { FECHA = JSON.parse(readFileSync(aca("./fecha-actual.json"))); } catch (e) {}
const puestoDe = new Map((FECHA?.jugadores || []).map(j => [j.id, j.puesto]));
const arma = id => ({ id, puesto: actuaciones.get(id)?.puesto || puestoDe.get(id) || "M",
                      nombre: actuaciones.get(id)?.nombre || "" });

const filas = [];
for (const e of equipos) {
  const titulares = (e.titulares || []).map(arma);
  const sup = (e.suplentes || []).map(arma);
  const suplentes = {};
  for (const j of sup) suplentes[j.puesto] = j;

  const res = puntosDeFecha(
    { titulares, suplentes, capitan: e.capitan, vice: e.vice },
    actuaciones, mvps);

  /* `puntosDeFecha` devuelve `puntos`, no `total`. Lo escribí mal la primera
     vez y toda la tabla habría quedado en null sin que nada fallara: la base
     acepta null y la pantalla habría mostrado ceros. */
  filas.push({ perfil: e.perfil, fecha: numero, puntos: res.puntos,
               detalle: res, calculado: new Date().toISOString() });
}

filas.sort((a, b) => b.puntos - a.puntos);
console.log("\n  " + filas.length + " equipos calculados");
console.log("  mejor " + filas[0].puntos + " · peor " + filas[filas.length - 1].puntos +
            " · promedio " +
            (filas.reduce((a, f) => a + f.puntos, 0) / filas.length).toFixed(1));

/* ─── 4. A LA BASE ───────────────────────────────────────────────────────
   `merge-duplicates` para que volver a correrlo pise el puntaje anterior en
   vez de fallar. Recalcular tiene que ser barato: si la API corrige una
   estadística el lunes, se vuelve a correr y la tabla se acomoda sola. */
const w = await sb("/puntaje", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates" },
  body: JSON.stringify(filas),
});
if (w.ok) console.log("\n  ✓ fecha " + numero + " puntuada y guardada.");
else console.log("\n  ✗ no pude guardar: HTTP " + w.status + " " +
                 (await w.text()).slice(0, 200));

console.log("\n  " + pedidos + " pedidos a la API\n" + linea + "\n");
void enHoraArgentina;
