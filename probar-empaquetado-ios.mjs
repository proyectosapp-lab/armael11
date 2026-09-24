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
import { sacarPublicidad, enlacesDe, iconosDeManifiesto, bajarSitio } from "./empaquetar-ios.mjs";

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


/* ═══ BAJAR EL SITIO PUBLICADO ═════════════════════════════════════════════
   La foto que va adentro del .ipa sale de armael11.com. `traer` se pasa de
   afuera justamente para poder probar todo esto sin red: acá el "sitio" son
   cuatro cadenas de texto. */

prueba("encuentra lo que menciona una página, y solo lo nuestro", () => {
  const html = '<link href="/datos/estilo.css"><script src="datos/juego.js"></script>' +
    '<script src="https://pagead2.googlesyndication.com/x.js"></script>' +
    '<img src="./sitio-icono-192.png"><a href="#abajo">x</a><a href="mailto:a@b.c">y</a>' +
    '<a href="//cdn.ajeno.com/z.js">z</a><style>@font-face{src:url("datos/poppins.woff")}</style>' +
    '<link rel="manifest" href="datos/app-boca.webmanifest"><a href="boca.html?c=ig1#tabla">Boca</a>';
  const r = enlacesDe(html);
  assert.ok(r.includes("datos/juego.js"));
  assert.ok(r.includes("datos/estilo.css"), "no sacó la barra del principio");
  assert.ok(r.includes("sitio-icono-192.png"), "no sacó el ./");
  assert.ok(r.includes("datos/poppins.woff"), "no miró los url() del CSS: la app quedaría sin fuentes");
  assert.ok(r.includes("datos/app-boca.webmanifest"));
  /* El ?c= y el #ancla se sacan: son la MISMA página, y sin esto se baja
     dos veces y se escribe con un nombre que el navegador no va a pedir. */
  assert.ok(r.includes("boca.html"), "no limpió el ?c= y el #");
  /* Y nada de afuera. */
  for (const malo of r) assert.ok(!/^https?:|^\/\/|^mailto:|^#/.test(malo), "se coló " + malo);
});

prueba("los íconos del manifiesto también, que son JSON", () => {
  const m = JSON.stringify({ name: "x", icons: [{ src: "/sitio-icono-192.png" }, { src: "sitio-icono-512.png" }] });
  assert.deepEqual(iconosDeManifiesto(m), ["sitio-icono-192.png", "sitio-icono-512.png"]);
  assert.deepEqual(iconosDeManifiesto("no es json"), []);
  assert.deepEqual(iconosDeManifiesto(""), []);
});

await (async () => {
  const SITIO = {
    "index.html": '<script src="datos/ligas.js"></script><a href="boca.html">Boca</a><a href="river.html">River</a>',
    "boca.html": '<script src="datos/cache-boca.js"></script><link rel="manifest" href="datos/app-boca.webmanifest">',
    "river.html": '<script src="datos/cache-river.js"></script>',
    "datos/ligas.js": 'window.LIGAS_DISPONIBLES=["argentina"];',
    "datos/cache-boca.js": "window.CACHE={};",
    "datos/cache-river.js": "window.CACHE={};",
    "datos/app-boca.webmanifest": JSON.stringify({ icons: [{ src: "sitio-icono-192.png" }] }),
    "sitio-icono-192.png": "PNG",
  };
  const pedidos = [];
  const traer = async (url) => {
    const ruta = url.replace("https://armael11.com/", "");
    pedidos.push(ruta);
    return SITIO[ruta] ? Buffer.from(SITIO[ruta]) : null;
  };

  /* Baja todo lo que cuelga de la portada, siguiendo los enlaces. Con una
     sola semilla tiene que llegar a las ocho cosas: las tres páginas, los
     tres archivos de datos, el manifiesto y el ícono que el manifiesto
     menciona. */
  const r = await bajarSitio({ origen: "https://armael11.com", semillas: ["index.html"], traer });
  assert.equal(r.size, 8, "bajó " + r.size + " de 8: " + [...r.keys()].join(", "));
  assert.ok(r.has("datos/cache-river.js"), "no siguió el enlace de la segunda página");
  assert.ok(r.has("sitio-icono-192.png"), "no siguió el ícono del manifiesto");
  hechos++;

  prueba("no pide dos veces el mismo archivo", () => {
    assert.equal(new Set(pedidos).size, pedidos.length, "pidió repetido: " + pedidos.join(", "));
  });

  /* Un club sin página todavía no puede cortar la bajada entera: sería
     cambiar "falta un club" por "no hay app". Lo que decide si el paquete
     sirve es el guardia que cuenta páginas y ligas. */
  await (async () => {
    const r2 = await bajarSitio({
      origen: "https://armael11.com",
      semillas: ["index.html", "club-que-no-existe.html"],
      traer,
    });
    assert.ok(r2.has("index.html"), "un 404 se llevó puesta la bajada");
    assert.ok(!r2.has("club-que-no-existe.html"));
    hechos++;
  })();

  await (async () => {
    const r3 = await bajarSitio({
      origen: "https://armael11.com", semillas: ["index.html"],
      traer: async () => { throw new Error("sin red"); },
    });
    assert.equal(r3.size, 0, "sin red tiene que devolver vacío, no tirar");
    hechos++;
  })();
})();

/* ══════════════════════════════════════════════════════════════════════════
   LA TIENDA DE APPLE VIAJA EN EL .IPA Y EN NINGÚN OTRO LADO

   Esto no es una optimización de peso: es la regla 3.1.1 hecha de archivos
   en vez de condiciones. `tienda-ios.js` es el único archivo del proyecto
   que sabe comprar por StoreKit, y `app.tpl.html` lo llama con un
   `typeof ... === "function"`. O sea:

     · Si el archivo NO llega al .ipa, la app del iPhone no puede comprar y
       muestra que lo básico es gratis. Molesto, y correcto.
     · Si el archivo SÍ llegara al sitio web, no pasaría nada tampoco —la
       web no es nativa— pero se habría perdido la propiedad que hace que
       esto sea seguro: que el camino de Apple y el de Mercado Pago no
       comparten ni un archivo.

   Las dos mitades se miran acá. La segunda es la que se rompería sin
   síntoma: nadie se entera de que un archivo empezó a publicarse de más.
   ══════════════════════════════════════════════════════════════════════════ */
{
  const { readFileSync } = await import("node:fs");
  const lee = f => readFileSync(new URL("./" + f, import.meta.url), "utf8");
  const EMP = lee("empaquetar-ios.mjs");
  const CONS = lee("construir-sitio.mjs");

  prueba("el empaquetado copia tienda-ios.js adentro del .ipa", () => {
    assert.ok(/writeFileSync\(new URL\("tienda-ios\.js", WWW\)/.test(EMP),
              "no se copia el archivo");
    assert.ok(/tienda-ios\.js"\), "utf8"\)\.replace\(\/\^export\\s\+\/gm, ""\)/.test(EMP),
              "no se le sacan los export: entra como <script> clásico");
  });

  prueba("y lo engancha en las páginas, después de datos-ios.js", () => {
    const i = EMP.indexOf('<script src="datos-ios.js">');
    const j = EMP.indexOf('<script src="tienda-ios.js">');
    assert.ok(i > 0 && j > i, "falta el tag o quedó antes de datos-ios.js");
  });

  /* Se miran las dos formas de publicarlo —escribirlo en `sitio/` y
     enchufarlo con un `<script src>`— y no la palabra suelta: el archivo
     está nombrado en un comentario de `construir-sitio.mjs`, que es
     justamente donde tiene que estar explicado por qué NO se publica. */
  prueba("el sitio web NO publica la tienda de Apple", () => {
    assert.ok(!/writeFileSync\([^)]*tienda-ios/.test(CONS),
              "construir-sitio.mjs empezó a escribir tienda-ios.js en el sitio");
    assert.ok(!/<script src="[^"]*tienda-ios/.test(CONS),
              "construir-sitio.mjs empezó a enchufar tienda-ios.js en las páginas: " +
              "el camino de StoreKit y el de Mercado Pago dejaron de estar " +
              "separados por archivo");
  });

  /* Y la clave pública sí viaja, porque va adentro de window.SITIO, que lo
     escribe el sitio y el .ipa se lleva tal cual. Sin esto el panel del
     iPhone no puede ni preguntar un precio. */
  prueba("pero la clave pública de RevenueCat sí viaja en window.SITIO", () => {
    assert.ok(/apple: CFG\.apple\?\.revenuecat/.test(CONS),
              "la clave no entra en window.SITIO");
  });

  /* ── SOLO IPHONE, Y LAS DOS COSAS TIENEN QUE IR JUNTAS (y79) ──────────
     Capacitor genera el proyecto con `TARGETED_DEVICE_FAMILY = "1,2"` —
     iPhone y iPad— por defecto, y nadie lo eligió. Se descubrió porque App
     Store Connect no dejaba enviar sin capturas de iPad, que era el síntoma
     barato de un problema caro: declararse compatible con iPad hace que el
     revisor pruebe la app EN UN IPAD.

     Y ahí choca de frente con la otra línea que se prueba acá: la app está
     clavada en vertical. Apple espera que una app de iPad ande en las dos
     orientaciones. Las dos decisiones juntas —solo iPhone, solo vertical—
     son coherentes; cualquiera de las dos sola es un rechazo.

     Por eso este caso mira las DOS en el mismo lugar: si alguien saca la de
     iPhone y deja la de vertical, esto corta la compilación. */
  {
    const CM = lee("codemagic.yaml");
    prueba("la app se declara solo para iPhone", () => {
      assert.ok(/TARGETED_DEVICE_FAMILY = "1,2";\/TARGETED_DEVICE_FAMILY = 1;/.test(CM),
                "el proyecto queda con el default de Capacitor, que incluye iPad");
    });
    prueba("y sigue clavada en vertical, que es lo que la hace solo de iPhone", () => {
      assert.ok(/UIInterfaceOrientationPortrait/.test(CM) &&
                !/UIInterfaceOrientationLandscape/.test(CM),
                "si se agrega horizontal hay que repensar lo de iPad");
    });
  }
}

console.log("empaquetado de iOS: " + hechos + " pruebas, todo bien");
