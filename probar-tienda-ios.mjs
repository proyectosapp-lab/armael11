/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DE LA TIENDA DEL IPHONE
     node probar-tienda-ios.mjs

   Lo que se compra adentro del iPhone no se puede probar sin un iPhone: la
   hoja de compra la dibuja iOS y no hay forma de abrirla desde acá. Pero
   casi nada de lo que puede salir mal está en esa hoja.

   Lo que puede salir mal, y lo que esto mira, es de tres clases:

   1. UN RECHAZO DE APPLE POR LA PANTALLA (regla 3.1.2). En la pantalla
      donde se compra una suscripción auto-renovable tienen que estar, sin
      que haya que tocar nada: el nombre, el precio, que se renueva sola,
      cómo se cancela, un botón para restaurar compras, y los links a los
      términos y a la privacidad. Falta uno y es rechazo. Es el rechazo más
      común que existe y el más barato de evitar: se lee el HTML que sale y
      se comprueba que estén los seis.

   2. UNA LETRA QUE NO COINCIDE. El id del producto vive en tres lados —App
      Store Connect, este archivo y la función del servidor— y si uno no
      coincide, la compra se cobra igual y no se acredita nada. Es el peor
      error posible: la plata entró y la persona no tiene lo que pagó, y no
      hay ningún error en ningún log. Acá se comparan dos de los tres; el
      tercero está en la pantalla de Apple y se mira a ojo una vez.

   3. QUE ALGUIEN, ALGÚN DÍA, VUELVA A ABRIR OTRA CAJA. La regla 3.1.1 no se
      cumple con un `if`: se cumple haciendo que el camino no exista. Este
      archivo no puede nombrar Mercado Pago ni ningún precio, y hay un caso
      que lo verifica letra por letra.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import * as T from "./tienda-ios.js";

const leer = f => readFileSync(new URL("./" + f, import.meta.url), "utf8");
const FUENTE = leer("tienda-ios.js");
const SERVIDOR = leer("funcion-pago-apple.ts");
const APP = leer("app.tpl.html");

const casos = [];
const caso = (nom, ok, det = "") => casos.push([nom, !!ok, det]);

/* ── 1. LOS TRES PRODUCTOS, Y QUE DIGAN LO MISMO EN TODOS LADOS ───────── */

caso("los tres planes están, en orden de más caro a más barato",
     T.IOS_PLANES.map(p => p.id).join(",") === "todas,tres,liga",
     T.IOS_PLANES.map(p => p.id).join(","));

caso("cada producto se traduce a su plan",
     T.iosPlanDeProducto("com.armael11.app.todas.mensual") === "todas" &&
     T.iosPlanDeProducto("com.armael11.app.tres.mensual") === "tres" &&
     T.iosPlanDeProducto("com.armael11.app.liga.mensual") === "liga");

/* Un producto que no conocemos no acredita nada. Parece obvio y es la
   defensa contra el día que alguien cree un producto de prueba en App Store
   Connect y se olvide de borrarlo. */
caso("un producto desconocido no es ningún plan",
     T.iosPlanDeProducto("com.armael11.app.regalo") === null &&
     T.iosPlanDeProducto("") === null &&
     T.iosPlanDeProducto(null) === null);

/* EL CASO QUE EVITA EL ERROR MÁS CARO. Los ids de acá tienen que ser
   exactamente los mismos que los de la función del servidor. Si uno cambia
   solo, Apple cobra y nadie acredita. */
{
  const delServidor = [...SERVIDOR.matchAll(/"(com\.armael11\.app\.[a-z]+\.mensual)":/g)]
    .map(m => m[1]).sort();
  const deAca = T.IOS_PLANES.map(p => p.producto).sort();
  caso("los ids de producto dicen lo mismo acá y en el servidor",
       JSON.stringify(delServidor) === JSON.stringify(deAca),
       "servidor: " + delServidor.join(" ") + " · app: " + deAca.join(" "));
}

/* Y los nombres de plan tienen que ser los tres que la base conoce, los
   mismos que usa Play. `poner_plan` no valida: un plan mal escrito se
   guarda igual y esa persona queda sin nada. */
caso("los planes son los tres que ya conoce la base",
     T.IOS_PLANES.every(p => ["todas", "tres", "liga"].includes(p.id)));

/* ── 2. EL PRECIO LO PONE LA TIENDA ───────────────────────────────────── */

/* No puede haber un número de plata en este archivo. Si lo hubiera, el día
   que Apple cambie la grilla de precios —o simplemente el día que alguien
   abra la app en Brasil— la pantalla diría un número y la App Store cobraría
   otro. Y además Apple lo rechaza. */
caso("no hay ni un precio escrito en el archivo",
     !/\b(?:US\$|USD|\$)\s?\d/.test(FUENTE) && !/precio\s*[:=]\s*["']?\d/.test(FUENTE));

caso("el precio sale de priceString, que es lo que devuelve StoreKit",
     /priceString/.test(FUENTE));

{
  const armado = T.iosArmarPlanes([
    { identifier: "com.armael11.app.liga.mensual",  priceString: "US$1.99" },
    { identifier: "com.armael11.app.todas.mensual", priceString: "R$ 39,90" },
  ]);
  caso("arma los planes que tienen precio, en NUESTRO orden y no en el de Apple",
       armado.length === 2 && armado[0].id === "todas" && armado[1].id === "liga",
       armado.map(p => p.id).join(","));
  caso("y se queda con el texto del precio tal cual vino de la tienda",
       armado[0].precio === "R$ 39,90" && armado[1].precio === "US$1.99");
}

/* Un plan sin precio NO se dibuja. Un botón de comprar sin número al lado
   es contenido incompleto para Apple y una trampa para el que lo aprieta. */
caso("un producto sin precio no se dibuja",
     T.iosArmarPlanes([{ identifier: "com.armael11.app.liga.mensual", priceString: "" }]).length === 0 &&
     T.iosArmarPlanes([{ identifier: "com.armael11.app.liga.mensual" }]).length === 0);

caso("un producto que no es nuestro no se cuela en la lista",
     T.iosArmarPlanes([{ identifier: "com.otra.app.mensual", priceString: "US$1" }]).length === 0);

caso("sin productos no se rompe",
     T.iosArmarPlanes([]).length === 0 && T.iosArmarPlanes(null).length === 0);

/* ── 3. LA PANTALLA QUE APPLE REVISA (regla 3.1.2) ────────────────────── */

{
  const planes = T.iosArmarPlanes([
    { identifier: "com.armael11.app.todas.mensual", priceString: "US$7.99" },
    { identifier: "com.armael11.app.tres.mensual",  priceString: "US$4.99" },
    { identifier: "com.armael11.app.liga.mensual",  priceString: "US$1.99" },
  ]);
  const html = T.iosPanelHTML({ planes });

  caso("se ve el nombre de cada plan",
       /Todas las ligas/.test(html) && /3 ligas/.test(html) && /Tu liga/.test(html));
  caso("se ve el precio de cada plan",
       /US\$7\.99/.test(html) && /US\$4\.99/.test(html) && /US\$1\.99/.test(html));
  caso("se ve que el período es mensual",
       /por mes/.test(html));
  caso("dice que se renueva sola y se cobra al Apple ID",
       /renueva sola/.test(html) && /Apple ID/.test(html));
  caso("dice cómo se cancela, y no en un link: en la misma pantalla",
       /Suscripciones/.test(html) && /cancel/i.test(html));
  caso("hay un botón de restaurar compras, que el revisor busca a mano",
       /data-ios-restaurar/.test(html) && /Restaurar compras/.test(html));
  caso("está el link a los términos de uso",
       /data-ios-link="terminos"/.test(html) && /Términos/.test(html));
  caso("está el link a la privacidad",
       /data-ios-link="privacidad"/.test(html) && /Privacidad/.test(html));
  caso("cada plan tiene su botón de comprar, enganchado como los de siempre",
       (html.match(/data-plan="/g) || []).length === 3);

  /* LA REGLA 3.1.1, LEÍDA EN EL HTML QUE DE VERDAD SALE. Ni Mercado Pago,
     ni Google Play, ni un link para pagar afuera, ni un precio en pesos. */
  caso("no nombra ninguna otra caja ni ningún pago de afuera",
       !/mercado\s*pago|mercadopago|google play|tarjeta|checkout/i.test(html),
       html.slice(0, 120));

  /* Mientras se compra, los botones se apagan. Sin esto, dos toques
     seguidos abren dos hojas de compra. */
  const ocupado = T.iosPanelHTML({ planes, comprando: true });
  caso("mientras hay una compra en curso los botones quedan apagados",
       (ocupado.match(/disabled/g) || []).length >= 4);
}

/* Los dos casos en que no hay nada para comprar. Ninguno puede decir
   "próximamente" —un coming soon es contenido incompleto y también se mira
   mal— ni mandar a pagar a otro lado. */
{
  const vacio = T.iosPanelHTML({ planes: [] });
  caso("sin planes se dice que lo básico es gratis, sin prometer nada",
       /gratis/i.test(vacio) && !/próximamente|proximamente|pronto/i.test(vacio));
  caso("y aun sin planes queda el botón de restaurar, que es el que salva al que ya pagó",
       /data-ios-restaurar/.test(vacio));
  caso("no ofrece otra caja cuando no hay planes",
       !/mercado\s*pago|mercadopago/i.test(vacio));

  const pidiendo = T.iosPanelHTML({ planes: null, estado: "pidiendo" });
  caso("mientras busca los precios lo dice, en vez de mostrar un hueco",
       /Buscando/.test(pidiendo) && !/data-plan=/.test(pidiendo));
}

/* El HTML se escapa. Los nombres son nuestros y hoy no traen nada raro,
   pero el precio viene de afuera y lo escribe Apple. */
{
  const sucio = T.iosPanelHTML({ planes: [
    { id: 'li"ga', nombre: "<b>x</b>", detalle: "d", precio: "<script>alert(1)</script>" }] });
  caso("lo que viene de la tienda se escapa antes de dibujarlo",
       /&lt;b&gt;x&lt;\/b&gt;/.test(sucio) &&
       /&lt;script&gt;/.test(sucio) && !/<script>/.test(sucio) &&
       /data-plan="li&quot;ga"/.test(sucio),
       sucio.slice(0, 200));
}

/* ── 4. CANCELAR NO ES FALLAR ─────────────────────────────────────────── */

caso("bajar la hoja de compra con el dedo se reconoce como cancelar",
     T.iosCancelada({ userCancelled: true }) &&
     T.iosCancelada({ code: "1" }) &&
     T.iosCancelada({ message: "Purchase was cancelled." }));
caso("y un error de verdad no se confunde con un cancelar",
     !T.iosCancelada({ code: "2", message: "Store problem" }) &&
     !T.iosCancelada(null) && !T.iosCancelada({}));

caso("el error se cuenta en castellano, nunca con el texto del plugin",
     !/SKPayment|StoreKit|error/i.test(T.iosTextoDeError({ message: "SKPaymentQueue failed" })
       .replace(/probá|probar/gi, "")) &&
     /conexión/i.test(T.iosTextoDeError({ message: "network error" })));

caso("y cuando no se sabe qué pasó, se manda a Restaurar compras en vez de a la nada",
     /Restaurar compras/.test(T.iosTextoDeError({ message: "vaya a saber" })));

/* ── 5. EN UN NAVEGADOR, ESTO NO HACE ABSOLUTAMENTE NADA ──────────────── */

caso("sin el plugin de Capacitor no hay tienda",
     T.iosTienda(null) === null &&
     T.iosTienda({}) === null &&
     T.iosTienda({ Capacitor: { Plugins: {} } }) === null);
caso("y con el plugin, sí",
     T.iosTienda({ Capacitor: { Plugins: { Purchases: { x: 1 } } } }) !== null);

caso("la clave sale de window.SITIO y si no está, es vacía",
     T.iosClave({}) === "" &&
     T.iosClave({ SITIO: { apple: { revenuecat: "appl_x" } } }) === "appl_x");

caso("la clave PÚBLICA es la que se lee; la secreta no se nombra en ningún lado",
     !/\bsk_[A-Za-z0-9]/.test(FUENTE));

/* Sin plugin, arrancar y cambiar de usuario contestan que no y no tiran. */
{
  const r = await Promise.all([T.iosArrancarTienda("abc"), T.iosQuienCompra("abc")]);
  caso("sin plugin, arrancar la tienda dice que no en vez de reventar",
       r[0] === false && r[1] === false);
  let tiro = false;
  try { await T.iosComprar("liga"); } catch (e) { tiro = true; }
  caso("y comprar sin plugin tira un error con texto, no un undefined",
       tiro);
}

caso("enganchar sin documento no hace nada",
     T.iosEngancharExtras(() => {}) === 0);

/* ── LA CARRERA, Y EL REINTENTO ───────────────────────────────────────── */

/* Configurar tarda y la portada dibuja el panel mientras tanto. Si el
   pedido de precios saliera antes del `configure`, RevenueCat contestaría
   "SDK not configured" y la pantalla quedaría vacía —solo a veces, solo
   según cómo estuvo la red ese día, y sin un error a la vista—. Por eso el
   arranque se guarda como una sola promesa y todo lo espera. */
caso("configurar se guarda como UNA promesa y todo lo que habla con la tienda la espera",
     /let arranque = null/.test(FUENTE) &&
     /async function tiendaLista\(\)/.test(FUENTE) &&
     (FUENTE.match(/await tiendaLista\(\)/g) || []).length >= 4 &&
     !/^\s*const T = iosTienda\(\);\s*$[\s\S]{0,200}getProducts/m.test(FUENTE));

caso("y llamarla dos veces no configura dos veces",
     T.iosArrancarTienda("a") === T.iosArrancarTienda("b"));

{
  const ahora = 1_000_000;
  caso("la primera vez se van a buscar los precios",
       T.iosHayQuePreguntar(null, "nuevo", 0, ahora) === true);
  caso("con los precios ya traídos no se vuelve a preguntar en cada dibujo",
       T.iosHayQuePreguntar([{ id: "liga" }], "listo", ahora - 1000, ahora) === false);
  caso("mientras una consulta está en curso no se dispara otra",
       T.iosHayQuePreguntar(null, "pidiendo", 0, ahora) === false);
  /* El que abrió la app en el subte no puede quedarse con la pantalla vacía
     hasta que cierre la app del todo. */
  caso("si vino vacío se reintenta, pero recién al rato",
       T.iosHayQuePreguntar([], "listo", ahora - 5000, ahora) === false &&
       T.iosHayQuePreguntar([], "listo", ahora - 40000, ahora) === true);
}

/* ── 6. LO QUE LA APP TIENE QUE HACER CON TODO ESTO ───────────────────── */

/* EL CORTE VA ANTES QUE TODO. Si la rama del iPhone quedara después del
   `PLANES.length`, una app de Apple con el servidor caído mostraría la
   pantalla vacía; y si quedara después de `esDeLaTienda()`, mostraría
   Mercado Pago. Se mide la POSICIÓN, que es lo que importa. */
{
  const f = APP.indexOf("function tarjetasDePlan(");
  const cuerpo = APP.slice(f, f + 4000);
  const iOS = cuerpo.indexOf("esNativaIos");
  const backend = cuerpo.indexOf("!conBackend");
  const mp = cuerpo.indexOf("esDeLaTienda()");
  caso("en tarjetasDePlan, el iPhone se resuelve ANTES que nada",
       iOS > 0 && backend > iOS && mp > iOS,
       "ios:" + iOS + " backend:" + backend + " mp:" + mp);
}

/* Y en el botón de comprar, lo mismo: el iPhone primero y con `return`. Sin
   ese return, una compra fallida seguiría de largo hasta Mercado Pago. */
{
  const f = APP.indexOf("function engancharPremium(");
  const cuerpo = APP.slice(f, f + 5000);
  const iOS = cuerpo.indexOf("esNativaIos");
  const play = cuerpo.indexOf("if(esDeLaTienda())");
  const mp = cuerpo.indexOf("linkDePago(");
  caso("al comprar, el iPhone también va primero y no se cae ni a Play ni a Mercado Pago",
       iOS > 0 && play > iOS && mp > iOS,
       "ios:" + iOS + " play:" + play + " mp:" + mp);
  caso("y la rama del iPhone corta con return",
       /esNativaIos\(\)\)\{[\s\S]{0,2000}?\n\s*return;\n\s*\}/.test(cuerpo));
}

/* El pase NO lo da el teléfono. Después de comprar se le pregunta al
   servidor, que le pregunta a RevenueCat con la clave secreta. */
caso("después de comprar se confirma contra el servidor, no contra el teléfono",
     /await iosComprar\(/.test(APP) && /confirmarConApple\(/.test(APP) &&
     /avisarPagoDeApple\(\)/.test(APP));

/* Restaurar tiene que terminar en el MISMO lugar que comprar. Si tuviera su
   propio camino, el día que se toque uno el otro queda viejo. */
caso("restaurar termina en la misma confirmación que comprar",
     /await iosRestaurar\(\);\s*\n\s*await confirmarConApple\(/.test(APP));

/* La pieza que une las dos mitades: el id que se le pasa a RevenueCat es
   NUESTRO uuid de perfil, no la sesión entera ni el mail. */
caso("a RevenueCat se le pasa el uuid del perfil, que es el que vuelve en el aviso",
     /iosArrancarTienda\(miUuid\(\)\)/.test(APP) &&
     /function miUuid\(\)/.test(APP) && /\|\| \{\}\)\.uid/.test(APP));

caso("y cuando alguien entra o sale, la tienda se entera",
     /iosQuienCompra\(u\)/.test(APP));

/* ── RESULTADO ────────────────────────────────────────────────────────── */
const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([n, ok, d]) => console.log("  " + (ok ? "ok    " : "MAL   ") + n +
  (ok || !d ? "" : "   → " + d)));
console.log(linea);
const mal = casos.filter(c => !c[1]).length;
console.log(mal ? "\n" + mal + " de " + casos.length + " casos MAL\n"
                : "\n" + casos.length + " de " + casos.length + ". Todo bien.\n");
process.exit(mal ? 1 : 0);
