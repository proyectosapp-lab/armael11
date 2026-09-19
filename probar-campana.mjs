/* Pruebas del contador de campaña. Todo lo que decide algo en campana.js es
   una función pura o depende de un `localStorage` que se puede reemplazar,
   justamente para poder probarlo acá sin abrir un navegador.

   Lo que más se prueba no es que cuente: es que NO cuente cuando no
   corresponde —dos veces la misma persona, un código inventado, una visita
   de hace dos meses— y que no explote cuando el navegador niega el
   almacenamiento. Un contador que cuenta de más es peor que no tenerlo:
   toma decisiones de plata con números inflados. */

import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

/* El archivo se carga como módulo de verdad. Se lee y se evalúa para poder
   darle un `localStorage` y un `fetch` de mentira antes. */
const fuente = readFileSync(new URL("./campana.js", import.meta.url), "utf8");

let hechos = 0;
const prueba = (nombre, fn) => { fn(); hechos++; };

/* ─── un almacenamiento de mentira, y uno que se niega ─────────────────── */
function ponerAlmacen(modo = "anda") {
  const datos = new Map();
  const almacen = {
    getItem(k) { if (modo === "niega") throw new Error("SecurityError"); return datos.has(k) ? datos.get(k) : null; },
    setItem(k, v) { if (modo === "niega") throw new Error("SecurityError"); datos.set(k, String(v)); },
    removeItem(k) { datos.delete(k); },
  };
  /* Node 22 no deja asignar algunos globales de golpe: van por defineProperty. */
  Object.defineProperty(globalThis, "localStorage", { value: almacen, configurable: true, writable: true });
  return datos;
}

const enviados = [];
Object.defineProperty(globalThis, "fetch", {
  value: (url, opciones) => { enviados.push({ url, cuerpo: JSON.parse(opciones.body) }); return Promise.resolve({ ok: true }); },
  configurable: true, writable: true,
});

ponerAlmacen();
globalThis.window = { SITIO: { supabase: { url: "https://x.supabase.co", anon: "clave" } } };

const M = await import("data:text/javascript;base64," + Buffer.from(fuente).toString("base64"));

/* ─── leer el código de la dirección ───────────────────────────────────── */

prueba("saca el código de la dirección", () => {
  assert.equal(M.leerCodigoCampana({ search: "?c=ig1" }), "ig1");
  assert.equal(M.leerCodigoCampana({ search: "?a=1&c=fb_reel-2&b=3" }), "fb_reel-2");
});

prueba("sin código devuelve null y no rompe", () => {
  assert.equal(M.leerCodigoCampana({ search: "" }), null);
  assert.equal(M.leerCodigoCampana({ search: "?otra=cosa" }), null);
  assert.equal(M.leerCodigoCampana(null), null);
});

prueba("pasa a minúsculas", () => {
  assert.equal(M.leerCodigoCampana({ search: "?c=IG1" }), "ig1");
});

/* Esto es lo que impide que el lunes la tabla tenga doscientas filas basura. */
prueba("descarta cualquier cosa que no sea un código", () => {
  for (const malo of ["<script>", "a b", "ig1;drop", "ñ", "x".repeat(25), "a/b", "%20"])
    assert.equal(M.leerCodigoCampana({ search: "?c=" + encodeURIComponent(malo) }), null, "pasó: " + malo);
});

/* ─── cuánto vale una visita ───────────────────────────────────────────── */

const dia = (n) => new Date(Date.UTC(2026, 8, n)).toISOString().slice(0, 10);
const enDia = (n) => Date.UTC(2026, 8, n);

prueba("una visita de hoy vale", () => {
  assert.equal(M.campanaVigente({ codigo: "ig1", dia: dia(19) }, enDia(19)), "ig1");
});

prueba("una visita de hace veintinueve días todavía vale", () => {
  assert.equal(M.campanaVigente({ codigo: "ig1", dia: dia(1) }, enDia(29)), "ig1");
});

prueba("una visita de hace más de treinta días ya no vale", () => {
  assert.equal(M.campanaVigente({ codigo: "ig1", dia: dia(1) }, enDia(1) + 31 * 86400000), null);
});

prueba("un guardado roto no vale", () => {
  assert.equal(M.campanaVigente(null), null);
  assert.equal(M.campanaVigente({}), null);
  assert.equal(M.campanaVigente({ codigo: "ig1" }), null);
  assert.equal(M.campanaVigente({ dia: dia(19) }), null);
});

/* ─── un hito, una vez ─────────────────────────────────────────────────── */

prueba("el primer hito se manda", () => {
  assert.equal(M.tocaMandar({}, "ig1", "simulo"), true);
});

prueba("el mismo hito no se manda dos veces", () => {
  assert.equal(M.tocaMandar({ "ig1:simulo": 1 }, "ig1", "simulo"), false);
});

prueba("otro hito de la misma campaña sí se manda", () => {
  assert.equal(M.tocaMandar({ "ig1:llego": 1 }, "ig1", "simulo"), true);
});

prueba("el mismo hito de otra campaña sí se manda", () => {
  assert.equal(M.tocaMandar({ "ig1:simulo": 1 }, "ig2", "simulo"), true);
});

prueba("sin código no se manda nada", () => {
  assert.equal(M.tocaMandar({}, null, "simulo"), false);
  assert.equal(M.tocaMandar({}, "ig1", null), false);
});

/* ─── el camino completo ───────────────────────────────────────────────── */

prueba("llega de la campaña: se guarda y se cuenta una sola vez", () => {
  ponerAlmacen(); enviados.length = 0;
  assert.equal(M.guardarCampana("ig1"), "ig1");
  assert.equal(M.campanaActiva(), "ig1");
  assert.equal(M.hitoCampana("llego"), true);
  assert.equal(M.hitoCampana("llego"), false, "contó dos veces la misma llegada");
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].cuerpo.p_codigo, "ig1");
  assert.equal(enviados[0].cuerpo.p_hito, "llego");
  assert.match(enviados[0].url, /\/rest\/v1\/rpc\/sumar_hito$/);
});

prueba("simula veinte veces y cuenta una", () => {
  ponerAlmacen(); enviados.length = 0;
  M.guardarCampana("ig1");
  for (let i = 0; i < 20; i++) M.hitoCampana("simulo");
  assert.equal(enviados.length, 1);
});

prueba("el que no vino de una campaña no manda nada", () => {
  ponerAlmacen(); enviados.length = 0;
  assert.equal(M.hitoCampana("simulo"), false);
  assert.equal(enviados.length, 0);
});

/* La razón de existir del archivo: separar la visita de la persona que juega. */
prueba("llegada y simulación son dos hitos distintos", () => {
  ponerAlmacen(); enviados.length = 0;
  M.guardarCampana("ig1");
  M.hitoCampana("llego"); M.hitoCampana("simulo"); M.hitoCampana("instalo");
  assert.deepEqual(enviados.map(e => e.cuerpo.p_hito), ["llego", "simulo", "instalo"]);
});

/* ─── nada de esto puede voltear la app ────────────────────────────────── */

prueba("con el almacenamiento negado no tira", () => {
  ponerAlmacen("niega"); enviados.length = 0;
  assert.doesNotThrow(() => M.guardarCampana("ig1"));
  assert.doesNotThrow(() => M.campanaActiva());
  assert.doesNotThrow(() => M.hitoCampana("simulo"));
});

prueba("sin backend configurado no manda nada", () => {
  ponerAlmacen(); enviados.length = 0;
  const antes = globalThis.window.SITIO;
  globalThis.window.SITIO = {};
  M.guardarCampana("ig1");
  assert.equal(M.hitoCampana("llego"), false);
  assert.equal(enviados.length, 0);
  globalThis.window.SITIO = antes;
});

/* ─── sacar el ?c= de la barra ─────────────────────────────────────────── */

function falsaHistoria() {
  const h = { url: null, replaceState(_a, _b, u) { h.url = u; } };
  return h;
}

prueba("saca el c= y deja el resto", () => {
  const h = falsaHistoria();
  assert.equal(M.limpiarUrlCampana({ href: "https://armael11.com/?c=ig1" }, h), true);
  assert.equal(h.url, "/");
  const h2 = falsaHistoria();
  M.limpiarUrlCampana({ href: "https://armael11.com/clubes.html?c=ig1&club=boca#tabla" }, h2);
  assert.equal(h2.url, "/clubes.html?club=boca#tabla");
});

prueba("sin c= no toca la barra", () => {
  const h = falsaHistoria();
  assert.equal(M.limpiarUrlCampana({ href: "https://armael11.com/?club=boca" }, h), false);
  assert.equal(h.url, null);
});

console.log("campaña: " + hechos + " pruebas, todo bien");
