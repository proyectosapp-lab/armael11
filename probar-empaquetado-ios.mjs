/* Prueba de lo único de `empaquetar-ios.mjs` que es una decisión y no un
   trámite: sacarle la publicidad a una página.

   Importar ese archivo NO arma el sitio: adentro hay una comprobación que
   distingue "me corrieron" de "me importaron". Sin eso, esta prueba armaría
   el sitio entero dos veces para llamar a una función pura.

   ─── LO QUE SE CUIDA ─────────────────────────────────────────────────────
   Que saque el script de AdSense, sí. Pero sobre todo QUE NO SE LLEVE
   PUESTO NADA MÁS. La manera obvia de escribir esto es una expresión
   regular sobre el archivo entero, y esa expresión empieza en el primer
   `<script` y termina en el último `</script>`: se come la app completa y
   deja una página en blanco que igual pasa cualquier comprobación de "no
   hay AdSense". Sería la peor manera posible de aprobar esta prueba. */

import { strict as assert } from "node:assert";
import { sacarPublicidad } from "./empaquetar-ios.mjs";

let hechos = 0;
const prueba = (n, fn) => { fn(); hechos++; };

/* El cargador tal cual lo escribe `construir-sitio.mjs` desde y51, metido
   entre cosas que TIENEN que sobrevivir. */
const PAGINA =
  '<!doctype html><head><title>Armá el 11</title>' +
  '<script>(function(){try{var P="android-app://com.armael11.app",K="armaEl11.deLaTienda",t=false;' +
  'var s=document.createElement("script");s.async=true;s.crossOrigin="anonymous";' +
  's.src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2032639837955609";' +
  'document.head.appendChild(s);}catch(e){}})();</script>' +
  '<script src="datos/juego.js"></script></head>' +
  '<body><script>function simular(){return 6000}</script></body>';

prueba("saca el script de AdSense entero", () => {
  const r = sacarPublicidad(PAGINA);
  assert.equal(r.sacados, 1);
  assert.ok(!/googlesyndication|pagead2/.test(r.html), "quedó el dominio adentro");
});

/* LA PRUEBA QUE IMPORTA. */
prueba("y no se lleva puesto nada más", () => {
  const r = sacarPublicidad(PAGINA);
  assert.ok(r.html.includes('<script src="datos/juego.js"></script>'), "se comió los datos");
  assert.ok(r.html.includes("function simular(){return 6000}"), "SE COMIÓ EL JUEGO");
  assert.ok(r.html.includes("<title>Armá el 11</title>"), "se comió la cabecera");
  assert.ok(r.html.startsWith("<!doctype html>"), "se comió el principio");
  assert.ok(r.html.trim().endsWith("</body>"), "se comió el final");
});

prueba("una página sin publicidad queda idéntica, byte por byte", () => {
  const limpia = '<script>a()</script>texto<script>b()</script>';
  const r = sacarPublicidad(limpia);
  assert.equal(r.sacados, 0);
  assert.equal(r.html, limpia);
});

prueba("dos scripts de publicidad se sacan los dos", () => {
  const dos = '<script>x("pagead2")</script><p>hola</p><script>y("googlesyndication")</script>';
  const r = sacarPublicidad(dos);
  assert.equal(r.sacados, 2);
  assert.equal(r.html, "<p>hola</p>");
});

/* Nada de esto puede tirar. Corre en una compilación de Codemagic donde no
   hay nadie mirando, y una excepción acá frena el .ipa por un archivo raro. */
prueba("con basura no rompe", () => {
  for (const malo of ["", null, undefined, "<script>sin cierre", "</script>solo el cierre", "sin etiquetas"])
    assert.doesNotThrow(() => sacarPublicidad(malo));
  assert.equal(sacarPublicidad("<script>sin cierre").html, "<script>sin cierre");
  assert.equal(sacarPublicidad(null).html, "");
});

console.log("empaquetado de iOS: " + hechos + " pruebas, todo bien");
