/* Pruebas del refresco de datos de la app de iPhone.

   Lo que se cuida acá NO es que actualice. Es que NO ROMPA:

   · que un archivo cortado a la mitad no borre la liga entera,
   · que los dos formatos con `||{}` adentro no devuelvan un objeto vacío
     —es el error que no tira error y deja la app sin partidos—,
   · que sin red todo se quede exactamente como estaba.

   La app ya arrancó y ya funciona con la foto cuando esto empieza. Todo lo
   de este archivo es una mejora opcional, y una mejora opcional que puede
   dejar la pantalla en blanco es peor que no tenerla. */

import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const fuente = readFileSync(new URL("./datos-ios.js", import.meta.url), "utf8");

let hechos = 0;
const prueba = (nombre, fn) => { fn(); hechos++; };
const pruebaAsync = async (nombre, fn) => { await fn(); hechos++; };

globalThis.window = {};
const M = await import("data:text/javascript;base64," + Buffer.from(fuente).toString("base64"));

/* ─── los formatos de verdad, tal cual los escribe el servidor ─────────── */

const ONCES = 'window.ONCES=window.ONCES||{};\nObject.assign(window.ONCES,\n' +
  '{"1557415":{"f":"2026-09-19T16:30:00+00:00","o":[{"team":{"id":65,"name":"Nottingham Forest"},' +
  '"formation":"3-4-2-1","startXI":[{"player":{"id":2919,"name":"M. Sels","pos":"G"}}]}]}}\n);\n';

const LIGA = 'window.LIGAS=window.LIGAS||{};window.LIGAS["argentina"]=' +
  '{"id":128,"slug":"argentina","nombre":"Liga Profesional",' +
  '"partidos":[{"id":1491822,"fecha":"2026-09-20T23:00:00+00:00","ronda":"Clausura - 9"}]};\n';

const CACHE = 'window.CACHE = {"/fixtures?team=451&season=2026&league=128":[{"fixture":{"id":1491822}}],' +
  '"/fixtures/lineups?fixture=1491822":[{"team":{"id":451},"startXI":[{}]}]};\n';

const LIGAS = 'window.LIGAS_DISPONIBLES=["argentina","brasil","inglaterra"];\n';

/* ── EL ERROR QUE NO TIRA ERROR ──────────────────────────────────────────
   Los dos formatos abren con `window.X=window.X||{}`. Agarrar la PRIMERA
   llave del archivo devuelve ese `{}` vacío: no falla, no avisa, y pisa la
   liga entera con nada. Es la razón por la que existe el parámetro
   `desde`, y estas dos son las pruebas que lo fijan. */

prueba("un archivo de onces se lee entero, no el {} del principio", () => {
  const r = M.reglaDeArchivo("datos/onces-inglaterra.js");
  const v = r.leer(ONCES);
  assert.ok(v && v["1557415"], "devolvió " + JSON.stringify(v));
  assert.equal(v["1557415"].o[0].team.name, "Nottingham Forest");
});

prueba("un archivo de liga también, y sabe a qué slug va", () => {
  const r = M.reglaDeArchivo("datos/liga-argentina.js");
  const v = r.leer(LIGA);
  assert.ok(v && v.partidos, "devolvió " + JSON.stringify(v));
  assert.equal(v.partidos[0].id, 1491822);
  globalThis.window.LIGAS = { brasil: { nombre: "viejo" } };
  r.poner(v);
  assert.equal(globalThis.window.LIGAS.argentina.id, 128);
  /* Y no se llevó puesta a las otras diez. */
  assert.equal(globalThis.window.LIGAS.brasil.nombre, "viejo");
});

prueba("los onces se MEZCLAN, no se reemplazan", () => {
  globalThis.window.ONCES = { "999": { f: "x", o: [] } };
  M.reglaDeArchivo("datos/onces-inglaterra.js").poner({ "1557415": { f: "y", o: [1] } });
  assert.ok(globalThis.window.ONCES["999"], "se llevó puesta la otra liga");
  assert.ok(globalThis.window.ONCES["1557415"]);
});

prueba("el cache del club se reemplaza entero", () => {
  const r = M.reglaDeArchivo("datos/cache-boca.js");
  const v = r.leer(CACHE);
  assert.ok(v["/fixtures/lineups?fixture=1491822"], "sin el once del DT no sirve de nada");
});

prueba("la lista de ligas es un arreglo", () => {
  const v = M.reglaDeArchivo("datos/ligas.js").leer(LIGAS);
  assert.deepEqual(v, ["argentina", "brasil", "inglaterra"]);
});

prueba("un archivo que no sabemos leer se ignora, no se adivina", () => {
  for (const n of ["datos/portada.js", "datos/juego.js", "datos/cuentas.js", "datos/nada.js"])
    assert.equal(M.reglaDeArchivo(n), null, "dijo que sabía leer " + n);
});

/* ─── lo cortado ────────────────────────────────────────────────────────── */

prueba("un archivo cortado a la mitad no devuelve basura", () => {
  const r = M.reglaDeArchivo("datos/liga-argentina.js");
  assert.equal(r.leer(LIGA.slice(0, 80)), null);
  assert.equal(r.leer(""), null);
  assert.equal(r.leer("{no es json}"), null);
});

/* ─── la fecha de lo que se muestra ─────────────────────────────────────── */

prueba("seis horas está bien, siete ya hay que avisar", () => {
  const ahora = Date.parse("2026-09-19T20:00:00Z");
  assert.equal(M.datosViejos("2026-09-19T17:00:00Z", ahora), false);
  assert.equal(M.datosViejos("2026-09-19T12:00:00Z", ahora), true);
  /* Sin fecha no se inventa una alarma. */
  assert.equal(M.datosViejos(null, ahora), false);
  assert.equal(M.datosViejos("cualquier cosa", ahora), false);
});

/* ─── qué archivos mira ─────────────────────────────────────────────────── */

prueba("saca la lista de la página, y solo los que sabe leer", () => {
  const tags = ["datos/liga-argentina.js", "datos/onces-inglaterra.js", "datos/cache-boca.js",
                "datos/portada.js", "datos/juego.js", "https://otro.com/x.js", "sw.js"];
  const doc = { querySelectorAll: () => tags.map(s => ({ getAttribute: () => s })) };
  const r = M.archivosDeLaPagina(doc);
  assert.deepEqual(r, ["datos/liga-argentina.js", "datos/onces-inglaterra.js", "datos/cache-boca.js"]);
});

/* ─── el refresco ───────────────────────────────────────────────────────── */

await pruebaAsync("baja, aplica y guarda", async () => {
  globalThis.window.LIGAS = {};
  const pedidos = [];
  const guardado = {};
  const n = await M.refrescarDatosIos({
    archivos: ["datos/liga-argentina.js"],
    traer: url => { pedidos.push(url); return Promise.resolve(LIGA); },
    db: {},
    ahora: "2026-09-19T20:00:00Z",
    alAplicar: (que, cuantos) => { guardado[que] = cuantos; },
  });
  assert.equal(n, 1);
  /* Se pide al sitio publicado, por https y con el nombre tal cual. */
  assert.equal(pedidos[0], "https://armael11.com/datos/liga-argentina.js");
  assert.equal(globalThis.window.LIGAS.argentina.id, 128);
  assert.equal(guardado.fresco, 1);
});

await pruebaAsync("sin red, todo se queda como estaba", async () => {
  globalThis.window.LIGAS = { argentina: { id: 128, nombre: "el de la foto" } };
  const n = await M.refrescarDatosIos({
    archivos: ["datos/liga-argentina.js", "datos/onces-inglaterra.js"],
    traer: () => Promise.reject(new Error("Network error")),
  });
  assert.equal(n, 0);
  assert.equal(globalThis.window.LIGAS.argentina.nombre, "el de la foto");
});

/* LA PRUEBA QUE MÁS IMPORTA. Un archivo que llega cortado —la red se cayó a
   la mitad, el CDN devolvió una página de error— NO puede pisar lo que ya
   teníamos. Sin esto, un refresco fallido deja la app sin partidos y no hay
   manera de volver atrás hasta la próxima vez que haya red. */
await pruebaAsync("un archivo cortado no pisa lo que ya teníamos", async () => {
  globalThis.window.LIGAS = { argentina: { id: 128, nombre: "el de la foto" } };
  const n = await M.refrescarDatosIos({
    archivos: ["datos/liga-argentina.js"],
    traer: () => Promise.resolve(LIGA.slice(0, 90)),
  });
  assert.equal(n, 0);
  assert.equal(globalThis.window.LIGAS.argentina.nombre, "el de la foto");
});

await pruebaAsync("un archivo vacío tampoco", async () => {
  globalThis.window.ONCES = { "999": { f: "x", o: [1] } };
  await M.refrescarDatosIos({
    archivos: ["datos/onces-inglaterra.js"],
    traer: () => Promise.resolve('window.ONCES=window.ONCES||{};\nObject.assign(window.ONCES,\n{}\n);\n'),
  });
  assert.ok(globalThis.window.ONCES["999"], "un archivo vacío borró los onces que había");
});

/* ─── en la web no hace nada ────────────────────────────────────────────── */

await pruebaAsync("fuera de la app nativa ni arranca", async () => {
  globalThis.window.Capacitor = undefined;
  globalThis.window.location = { protocol: "https:" };
  assert.equal(M.esNativaIos(), false);
  assert.equal(await M.arrancarDatosIos({}), false);
});

console.log("datos de iOS: " + hechos + " pruebas, todo bien");
