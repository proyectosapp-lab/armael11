/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DE LA RONDA CORTA
     node probar-formaciones.mjs
   No toca la red. Prueba la decisión -¿este partido está en ventana? ¿ya
   tenemos su formación?- con caches inventados y horas fijas, que es la
   única forma de probar algo que en la vida real pasa una vez por semana
   durante sesenta minutos.
   ══════════════════════════════════════════════════════════════════════════ */
import { enVentana, VENTANA, leerCache, escribirCache,
         partidosEnVentana, podarOnces, escribirOnces, leerOnces, leerLiga, flaco } from "./formaciones.mjs";
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

/* ── EL CACHE TIENE MÁS DE UN CALENDARIO ────────────────────────────────
   `datos-juego` baja también los partidos del RIVAL, para armarle el
   plantel, así que en un cache de club conviven dos o tres claves
   `/fixtures?team=`. Agarrar la primera funcionaba de casualidad, por el
   orden de inserción. Acá el rival va PRIMERO a propósito: si alguien
   vuelve al `.find()` de antes, esto se cae.

   La falla que evita no hace ruido: la ronda corta se pone a mirar el
   calendario del rival, no tira error, no rompe ninguna otra prueba, y el
   once del DT simplemente deja de salir para ese club. */
{
  const cacheMezclado = {
    "/fixtures?team=1066&season=2026&league=128": [fx(77, min(600))],   /* el rival, en tres días */
    "/fixtures?team=456&season=2026&league=128":  [fx(88, min(60))],    /* el club, en una hora */
  };
  caso("con el club dicho, mira el calendario del club y no el del rival",
       enVentana(cacheMezclado, AHORA, VENTANA, 456)?.fixture.fixture.id === 88,
       String(enVentana(cacheMezclado, AHORA, VENTANA, 456)?.fixture.fixture.id));
  /* Y si el apiId no matchea ninguna clave -un cache viejo, otra
     temporada- no se queda sin nada: vuelve al comportamiento de antes. */
  caso("con un club que no está en el cache, no se cuelga",
       enVentana(cacheMezclado, AHORA, VENTANA, 999) !== undefined);
}

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

/* ─── las otras ligas ────────────────────────────────────────────────────
   El calendario de una liga no tiene estado -son todos partidos por jugar-,
   así que lo único que decide es el reloj. */
{
  const p = (id, cuando) => ({ id, fecha: cuando.toISOString(), local: 1, visita: 2 });
  const lista = [p(10, min(-300)), p(11, min(90)), p(12, min(-30)), p(13, min(600))];
  const dentro = partidosEnVentana(lista, AHORA).map(x => x.id);
  caso("de la liga entran los que están por empezar y los recién empezados",
       JSON.stringify(dentro) === JSON.stringify([12, 11]), "dieron " + dentro.join(","));
  caso("un partido de la semana que viene no entra", !dentro.includes(13));
  caso("uno de hace cinco horas tampoco", !dentro.includes(10));
  caso("una liga sin partidos no rompe", partidosEnVentana(undefined, AHORA).length === 0);
  caso("una fecha rota no entra", partidosEnVentana([{ id: 9, fecha: "pepe" }], AHORA).length === 0);
}

/* ─── el archivo de onces: se acumula, se poda y no se pisa ─────────────── */
{
  const ruta = new URL("./.prueba-onces.js", import.meta.url);
  const guardado = {
    "100": { f: min(-10).toISOString(), o: [{ team: { id: 1 }, startXI: [{}] }] },
    "101": { f: min(-5 * 24 * 60).toISOString(), o: [{ team: { id: 2 }, startXI: [{}] }] },
  };
  escribirOnces(ruta, guardado);
  const leido = leerOnces(ruta);
  caso("los onces se escriben y se leen igual", JSON.stringify(leido) === JSON.stringify(guardado));

  const texto = (await import("node:fs")).readFileSync(ruta, "utf8");
  caso("y se suman a lo que ya haya, no lo reemplazan: once ligas escriben el mismo objeto",
       texto.startsWith("window.ONCES=window.ONCES||{};") && texto.includes("Object.assign(window.ONCES,"));
  /* La prueba que importa: el archivo TIENE que poder correrse al lado de
     otro sin que ninguno de los dos pierda lo suyo. */
  {
    const ventana = {};
    const correr = t => new Function("window", t)(ventana);
    correr(texto);
    correr("window.ONCES=window.ONCES||{};\nObject.assign(window.ONCES,\n" + JSON.stringify({ "999": { f: "x", o: [] } }) + "\n);\n");
    caso("dos ligas cargadas seguidas conviven",
         Object.keys(ventana.ONCES).sort().join(",") === "100,101,999");
  }

  const podado = podarOnces(guardado, AHORA);
  caso("la poda deja lo de hoy", !!podado["100"]);
  caso("y tira lo de hace cinco días", !podado["101"]);
  caso("y también lo de anteayer: un once viejo de otra liga no sirve para nada",
       Object.keys(podarOnces({ "7": { f: min(-40 * 60).toISOString(), o: [] } }, AHORA)).length === 0);
  caso("una entrada sin fecha se tira", Object.keys(podarOnces({ "5": { o: [] } }, AHORA)).length === 0);
  caso("leer un archivo que no existe da un objeto vacío",
       JSON.stringify(leerOnces(new URL("./.no-existe-onces.js", import.meta.url))) === "{}");
  rmSync(ruta, { force: true });
}

/* ─── lo que se guarda es lo que la app usa, y nada más ──────────────────
   Esto no es un cache de servidor: es un archivo que baja todo el que abre
   la app. La respuesta entera de la API son cinco kilobytes por partido
   -banco, cuerpo técnico, coordenadas y fotos- y de eso se usan los once
   nombres y el dibujo. */
{
  const gordo = [{
    team: { id: 33, name: "Rojos", logo: "https://media/33.png", colors: { player: { primary: "ff0000" } } },
    coach: { id: 9, name: "El DT", photo: "https://media/9.png" },
    formation: "4-4-2",
    startXI: Array.from({ length: 11 }, (_, i) => ({
      player: { id: 100 + i, name: "Jugador " + i, number: i + 1, pos: "M", grid: "2:" + i,
                photo: "https://media/" + i + ".png" } })),
    substitutes: Array.from({ length: 9 }, (_, i) => ({ player: { id: 200 + i, name: "Suplente " + i } })),
  }, { team: { id: 40 }, formation: "4-3-3", startXI: [] }];
  const f = flaco(gordo);
  caso("se guarda un solo equipo: el que no tiene once todavía no sirve", f.length === 1);
  caso("con el dibujo y los once", f[0].formation === "4-4-2" && f[0].startXI.length === 11);
  caso("cada jugador con lo justo: id, nombre y puesto",
       JSON.stringify(f[0].startXI[0]) === JSON.stringify({ player: { id: 100, name: "Jugador 0", pos: "M" } }),
       JSON.stringify(f[0].startXI[0]));
  caso("y sin el banco, el cuerpo técnico ni las fotos",
       !/substitutes|coach|photo|logo|grid/.test(JSON.stringify(f)));
  caso("pesa menos de la mitad que la respuesta cruda (y contra la de verdad, bastante menos)",
       JSON.stringify(f).length * 2 < JSON.stringify(gordo).length,
       JSON.stringify(f).length + " vs " + JSON.stringify(gordo).length);
  caso("una respuesta vacía no rompe", flaco(undefined).length === 0);
}

/* ─── leer el archivo de una liga sin evaluarlo ──────────────────────────── */
{
  const ruta = new URL("./.prueba-liga.js", import.meta.url);
  const liga = { id: 39, slug: "inglaterra", nombre: "Premier League",
                 equipos: { 33: { n: "Manchester United", j: [] } },
                 partidos: [{ id: 77, fecha: AHORA.toISOString(), local: 33, visita: 40 }] };
  writeFileSync(ruta, "window.LIGAS=window.LIGAS||{};window.LIGAS[\"inglaterra\"]=" +
                JSON.stringify(liga) + ";\n");
  const leida = leerLiga(ruta);
  caso("el archivo de liga se lee entero", JSON.stringify(leida) === JSON.stringify(liga));
  caso("y de ahí salen los partidos en ventana", partidosEnVentana(leida.partidos, AHORA).length === 1);
  rmSync(ruta, { force: true });
}

const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([n, ok, d]) => console.log("  " + (ok ? "ok    " : "MAL   ") + n + (ok || !d ? "" : "   → " + d)));
const mal = casos.filter(c => !c[1]).length;
console.log(linea + "\n\n" + (mal ? mal + " de " + casos.length + " MAL\n" : casos.length + " de " + casos.length + ". Todo bien.\n"));
process.exit(mal ? 1 : 0);
