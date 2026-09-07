/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DE LA RONDA CORTA
     node probar-formaciones.mjs
   No toca la red. Prueba la decisión -¿este partido está en ventana? ¿ya
   tenemos su formación?- con caches inventados y horas fijas, que es la
   única forma de probar algo que en la vida real pasa una vez por semana
   durante sesenta minutos.
   ══════════════════════════════════════════════════════════════════════════ */
import { enVentana, VENTANA, leerCache, escribirCache } from "./formaciones.mjs";
import { writeFileSync, rmSync } from "node:fs";

const casos = [];
const caso = (n, ok, d = "") => casos.push([n, ok, d]);

const fx = (id, cuando, status = "NS") => ({
  fixture: { id, date: cuando.toISOString(), status: { short: status } },
  teams: { home: { id: 456, name: "Talleres" }, away: { id: 1066, name: "Gimnasia M." } },
});
const AHORA = new Date("2026-09-12T20:00:00Z");
const min = n => new Date(AHORA.getTime() + n * 6e4);
const cacheCon = (fixtures, extra = {}) => ({ "/fixtures?team=456&season=2026&league=128": fixtures, ...extra });

/* ─── la ventana ─────────────────────────────────────────────────────────── */
caso("un partido que empieza en 90 minutos está en ventana",
     enVentana(cacheCon([fx(1, min(90))]), AHORA)?.faltanMin === 90);
caso("uno que empieza en 5 horas, no",
     enVentana(cacheCon([fx(1, min(300))]), AHORA) === null);
caso("uno que empezó hace 30 minutos, sí: la API a veces la carga tarde",
     enVentana(cacheCon([fx(1, min(-30))]), AHORA)?.faltanMin === -30);
caso("uno que empezó hace dos horas, ya no",
     enVentana(cacheCon([fx(1, min(-120))]), AHORA) === null);
caso("justo en el borde de antes entra",
     enVentana(cacheCon([fx(1, min(VENTANA.antesMin))]), AHORA) !== null);

/* ─── cuál es el próximo ─────────────────────────────────────────────────── */
caso("el próximo es el primero por jugar, no el último jugado",
     enVentana(cacheCon([fx(1, min(-7 * 24 * 60), "FT"), fx(2, min(60)), fx(3, min(7 * 24 * 60))]), AHORA)?.fixture.fixture.id === 2);
caso("sin partidos por jugar no hay ventana",
     enVentana(cacheCon([fx(1, min(-60), "FT")]), AHORA) === null);
caso("un cache sin fixtures tampoco rompe", enVentana({}, AHORA) === null);

/* ─── ¿ya la tenemos? ────────────────────────────────────────────────────── */
caso("si la formación ya está en el cache, lo dice y no hay que pedirla",
     enVentana(cacheCon([fx(1, min(60))], { "/fixtures/lineups?fixture=1": [{ team: { id: 456 }, startXI: [{}] }] }), AHORA)?.tiene === true);
caso("una formación vacía -la API todavía no la cargó- NO cuenta como tenida",
     enVentana(cacheCon([fx(1, min(60))], { "/fixtures/lineups?fixture=1": [] }), AHORA)?.tiene === false);
caso("la clave es exactamente la que busca la app",
     enVentana(cacheCon([fx(77, min(60))]), AHORA)?.clave === "/fixtures/lineups?fixture=77");

/* ─── leer y escribir el cache sin romperle el formato a la app ──────────── */
{
  const ruta = new URL("./.prueba-cache.js", import.meta.url);
  const original = { a: 1, "/fixtures/lineups?fixture=5": [] };
  escribirCache(ruta, original);
  const leido = leerCache(ruta);
  caso("el cache se escribe y se lee igual", JSON.stringify(leido) === JSON.stringify(original));
  const texto = (await import("node:fs")).readFileSync(ruta, "utf8");
  caso("y con el mismo encabezado que escribe datos-juego", texto.startsWith("window.CACHE = {"));
  rmSync(ruta, { force: true });
}

const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([n, ok, d]) => console.log("  " + (ok ? "ok    " : "MAL   ") + n + (ok || !d ? "" : "   → " + d)));
const mal = casos.filter(c => !c[1]).length;
console.log(linea + "\n\n" + (mal ? mal + " de " + casos.length + " MAL\n" : casos.length + " de " + casos.length + ". Todo bien.\n"));
process.exit(mal ? 1 : 0);
