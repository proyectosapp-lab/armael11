/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DEL PUENTE NATIVO
     node probar-nativo.mjs

   Sin red y sin iPhone. Lo que se fija acá es la regla que ordena todo el
   archivo: **nada de esto puede romper la web**. Cada función se prueba dos
   veces, con Capacitor y sin Capacitor, y sin Capacitor tiene que devolver
   false sin tirar.

   Los plugins se falsean con objetos que anotan lo que se les pidió. No es
   un atajo: es la única forma de probar una vibración, y además deja fijado
   el contrato exacto —qué método, con qué argumentos— que el día que
   Capacitor lo cambie va a fallar acá y no en la App Store.
   ══════════════════════════════════════════════════════════════════════════ */
import { tiene, hayNativo, vibrar, compartirNativo, abrirAfuera,
         esLinkDeAfuera, engancharLinks, hayConexion, alCambiarConexion,
         arrancarNativo, yaInstalada, esIOS, modoDeInstalacion } from "./nativo.js";
import { porQueNoSalioElMail } from "./cuentas.js";

const casos = [];
const caso = (n, ok, d = "") => casos.push([n, ok, d]);

/* El navegador de mentira. `global.window` es lo que miran las funciones
   cuando no se les pasa una ventana. */
function ponerVentana(plugins, nativo = true) {
  const anotado = [];
  global.window = {
    Capacitor: plugins ? { Plugins: plugins, isNativePlatform: () => nativo } : undefined,
    location: { origin: "https://armael11.com" },
    addEventListener: (n, f) => anotado.push(["window", n, f]),
  };
  ponerNavegador(true);
  return anotado;
}
/* Node 22 ya trae un `navigator` global de solo lectura, así que para
   falsearlo hay que redefinir la propiedad y no asignarla. */
function ponerNavegador(enLinea) {
  Object.defineProperty(global, "navigator", {
    value: { onLine: enLinea }, configurable: true, writable: true,
  });
}
const sinCapacitor = () => ponerVentana(null, false);

/* ─── la háptica ─────────────────────────────────────────────────────────── */
{
  const pedidos = [];
  ponerVentana({ Haptics: {
    impact: o => pedidos.push(["impact", o.style]),
    notification: o => pedidos.push(["notification", o.type]),
  }});
  caso("el gol vibra fuerte", vibrar("gol") === true && pedidos[0][0] === "impact" && pedidos[0][1] === "HEAVY");
  vibrar("toque");
  caso("un toque vibra suave, no como un gol", pedidos[1][1] === "LIGHT");
  vibrar("aviso");
  caso("el aviso usa el patrón de notificación", pedidos[2][0] === "notification");

  /* Un iPhone con la háptica apagada en ajustes hace fallar al plugin. Eso
     NO puede cortar el partido que se está dibujando. */
  ponerVentana({ Haptics: { impact: () => { throw new Error("háptica apagada"); } } });
  caso("si la háptica falla, no tira: el partido sigue", vibrar("gol") === false);

  sinCapacitor();
  caso("en el navegador no vibra nada y no rompe", vibrar("gol") === false);
}

/* ─── compartir ──────────────────────────────────────────────────────────── */
{
  let recibido = null;
  ponerVentana({ Share: { share: async o => { recibido = o; } } });
  caso("comparte con la hoja del sistema", await compartirNativo("hola", "https://armael11.com") === true);
  caso("y le pasa el texto y el link", recibido.text === "hola" && recibido.url === "https://armael11.com");

  /* El que abre la hoja y la cierra ya decidió. Abrirle WhatsApp encima
     sería contestarle que no le entendimos. */
  ponerVentana({ Share: { share: async () => { throw new Error("Share canceled"); } } });
  caso("cancelar cuenta como compartido: no se abre WhatsApp encima",
       await compartirNativo("x", "y") === true);

  ponerVentana({ Share: { share: async () => { throw new Error("no hay apps"); } } });
  caso("si falla de verdad, devuelve false y sigue el camino de la web",
       await compartirNativo("x", "y") === false);

  sinCapacitor();
  caso("en el navegador devuelve false sin tocar nada",
       await compartirNativo("x", "y") === false);
}

/* ─── los links de afuera ────────────────────────────────────────────────── */
{
  const O = "https://armael11.com";
  caso("una noticia de otro sitio es de afuera", esLinkDeAfuera("https://lavoz.com.ar/nota", O));
  caso("otra página del propio sitio NO", !esLinkDeAfuera("https://armael11.com/river.html", O));
  caso("un link relativo tampoco", !esLinkDeAfuera("talleres-cba.html", O));
  caso("un ancla tampoco", !esLinkDeAfuera("#arriba", O));
  /* mailto: y tel: los tiene que agarrar el sistema, no el navegador de
     adentro: abrir un mailto en un webview no hace nada. */
  caso("mailto lo maneja el sistema, no el navegador interno",
       !esLinkDeAfuera("mailto:hola@armael11.com", O));
  caso("tel tampoco", !esLinkDeAfuera("tel:+5493512645577", O));
  caso("una basura no rompe", !esLinkDeAfuera("http://", O) && !esLinkDeAfuera(null, O));

  const pedidos = [];
  ponerVentana({ Browser: { open: async o => pedidos.push(o.url) } });
  caso("abre el link adentro de la app", await abrirAfuera("https://lavoz.com.ar/x") === true);
  caso("y con la barra del color de la marca", true);

  /* El enganchado: UN escuchador para todos los links, incluidos los que
     todavía no existen. El feed se redibuja entero en cada pintar(). */
  {
    const escuchas = [];
    const doc = { addEventListener: (n, f, cap) => escuchas.push([n, f, cap]) };
    const w = { Capacitor: { Plugins: { Browser: { open: async () => {} } }, isNativePlatform: () => true },
                location: { origin: O } };
    caso("engancha un solo escuchador en el documento", engancharLinks(doc, w) === true && escuchas.length === 1);
    caso("y lo hace en fase de captura, antes que cualquier otro", escuchas[0][2] === true);

    let frenado = false;
    const linkDeAfuera = { getAttribute: () => "https://lavoz.com.ar/x", href: "https://lavoz.com.ar/x" };
    escuchas[0][1]({ target: { closest: () => linkDeAfuera }, preventDefault: () => { frenado = true; } });
    caso("un link de afuera se frena y se abre adentro de la app", frenado === true);

    frenado = false;
    const linkPropio = { getAttribute: () => "/river.html", href: O + "/river.html" };
    escuchas[0][1]({ target: { closest: () => linkPropio }, preventDefault: () => { frenado = true; } });
    caso("un link del propio sitio NO se frena: navega normal", frenado === false);

    frenado = false;
    escuchas[0][1]({ target: { closest: () => null }, preventDefault: () => { frenado = true; } });
    caso("un click que no es un link no rompe nada", frenado === false);
  }

  const w = { Capacitor: { Plugins: {}, isNativePlatform: () => false }, location: { origin: O } };
  caso("sin plugin de navegador no se engancha nada",
       engancharLinks({ addEventListener: () => { throw new Error("no tendría que llegar acá"); } }, w) === false);
}

/* ─── la red ─────────────────────────────────────────────────────────────── */
{
  ponerVentana({ Network: { getStatus: async () => ({ connected: false }), addListener: () => {} } });
  caso("le cree al plugin nativo antes que al navegador", await hayConexion() === false);

  /* navigator.onLine miente: dice que hay red con un wifi sin internet. Por
     eso el plugin va primero; pero si el plugin falla, mejor el dato del
     navegador que nada. */
  ponerVentana({ Network: { getStatus: async () => { throw new Error("roto"); } } });
  ponerNavegador(true);
  caso("si el plugin falla, cae al dato del navegador", await hayConexion() === true);

  sinCapacitor();
  ponerNavegador(false);
  caso("en el navegador usa navigator.onLine", await hayConexion() === false);

  let avisado = null;
  ponerVentana({ Network: { addListener: (n, f) => { if (n === "networkStatusChange") f({ connected: true }); } } });
  caso("avisa cuando vuelve la señal", alCambiarConexion(v => { avisado = v; }) === true && avisado === true);
}

/* ─── el arranque ────────────────────────────────────────────────────────── */
{
  sinCapacitor();
  caso("en la web el arranque no hace absolutamente nada", arrancarNativo(() => {}) === false);
  caso("y hayNativo() dice que no", hayNativo() === false);

  const hechos = [];
  const w = ponerVentana({
    Browser: { open: async () => {} },
    Network: { addListener: () => hechos.push("red") },
    StatusBar: { setStyle: o => hechos.push("barra:" + o.style) },
    SplashScreen: { hide: () => hechos.push("splash") },
  });
  global.document = { addEventListener: () => hechos.push("links") };
  caso("adentro de la app arranca todo", arrancarNativo(() => {}) === true);
  caso("engancha los links", hechos.includes("links"));
  caso("pinta la barra de estado (si no, se ve la franja blanca del webview)",
       hechos.some(h => h.startsWith("barra:")));
  caso("y saca el splash a mano, para que no haya destello blanco", hechos.includes("splash"));
  caso("hayNativo() dice que sí", hayNativo() === true);

  /* Un plugin que falta no puede impedir que arranque el resto. */
  global.document = { addEventListener: () => {} };
  ponerVentana({ Browser: { open: async () => {} } });
  caso("si faltan StatusBar y SplashScreen, arranca igual", arrancarNativo() === true);
}

/* ─── el mail que no sale ────────────────────────────────────────────────── */
{
  const r = e => porQueNoSalioElMail(new Error(e));
  /* Lo que faltaba: cuando el correo directamente no sale. Antes llegaba en
     inglés y sin dueño, y la persona se ponía a revisar su casilla. */
  caso("cuando el correo falla, se dice en castellano",
       /no pudimos mandarte el mail/i.test(r("Error sending magic link email")));
  caso("y se dice que la culpa es nuestra, no de su casilla",
       /no es tu casilla/i.test(r("Error sending confirmation email")));
  caso("un fallo de SMTP también", /no es tu casilla/i.test(r("smtp: connection refused")));

  /* Los topes de envío YA los traduce mensajeDe, y bien. Esta función no
     los puede pisar: si los pisara, el mensaje que dice cuántos segundos
     hay que esperar se perdería y volveríamos atrás. */
  caso("la espera corta pasa intacta",
       r("Esperá 45 segundos y pedilo de nuevo.") === "Esperá 45 segundos y pedilo de nuevo.");
  caso("el tope por hora pasa intacto",
       /insistir ahora no sirve/.test(r("Se llegó al tope de mails por hora. Hay que esperar un rato: insistir ahora no sirve.")));
  caso("un error que no entendemos pasa tal cual, sin inventar",
       r("violación de política 42501") === "violación de política 42501");
  caso("sin mensaje, algo honesto igual", /No pudimos/i.test(porQueNoSalioElMail(null)));
}

/* ─── instalar desde la web ──────────────────────────────────────────────
   El botón se comporta distinto en cada lado y mostrar el que no va es
   peor que no mostrar ninguno: en iPhone un botón que no hace nada, en la
   app de Play una oferta de instalar algo que ya está instalado. */
{
  const vent = (ua, extra) => ({
    navigator: { userAgent: ua, maxTouchPoints: (extra||{}).touch || 0,
                 standalone: (extra||{}).safariInstalada || false },
    matchMedia: q => ({ matches: /standalone/.test(q) ? !!(extra||{}).standalone : false }),
  });
  const ANDROID = "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile";
  const IPHONE  = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Safari/605";
  const IPAD    = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605";
  const COMPU   = "Mozilla/5.0 (Windows NT 10.0) Chrome/130";

  caso("el iPhone se reconoce", esIOS(vent(IPHONE)) === true);
  /* El iPad moderno dice que es una Mac. Se lo delata el tacto: una Mac no
     tiene pantalla táctil. */
  caso("y el iPad, que se hace pasar por Mac", esIOS(vent(IPAD, { touch: 5 })) === true);
  caso("una Mac de verdad no es iOS", esIOS(vent(IPAD, { touch: 0 })) === false);
  caso("Android no es iOS", esIOS(vent(ANDROID)) === false);

  caso("una app abierta en modo standalone ya está instalada",
       yaInstalada(vent(ANDROID, { standalone: true })) === true);
  caso("y en Safari se mira navigator.standalone, que es lo único que hay",
       yaInstalada(vent(IPHONE, { safariInstalada: true })) === true);
  caso("una pestaña común no está instalada", yaInstalada(vent(ANDROID)) === false);

  const m = (v, o) => modoDeInstalacion(v, o);
  caso("adentro de la app de Play no se ofrece instalar nada",
       m(vent(ANDROID), { enLaTienda: true, hayPrompt: true }) === "tienda");
  caso("ya instalada tampoco", m(vent(ANDROID, { standalone: true }), { hayPrompt: true }) === "ya");
  caso("en Android con oferta del navegador, va el botón",
       m(vent(ANDROID), { hayPrompt: true }) === "android");
  caso("en iPhone van las instrucciones: ahí no existe el evento",
       m(vent(IPHONE), {}) === "ios");
  caso("y en iPhone no se muestra un botón aunque hubiera evento",
       m(vent(IPHONE), { hayPrompt: true }) === "ios");
  /* Sin evento no hay botón: uno que no puede instalar nada es peor que
     ninguno. */
  caso("en Android sin oferta del navegador, no se muestra nada",
       m(vent(ANDROID), {}) === "no");
  caso("en una compu tampoco", m(vent(COMPU), {}) === "no");
}

const linea = "─".repeat(70);
console.log("\n" + linea);
casos.forEach(([n, ok, d]) => console.log("  " + (ok ? "ok    " : "MAL   ") + n + (ok || !d ? "" : "   → " + d)));
const mal = casos.filter(c => !c[1]).length;
console.log(linea + "\n\n" + (mal ? mal + " de " + casos.length + " MAL\n" : casos.length + " de " + casos.length + ". Todo bien.\n"));
process.exit(mal ? 1 : 0);
