/* ══════════════════════════════════════════════════════════════════════════
   NATIVO — lo que la app puede hacer adentro del iPhone y el navegador no.

   ─── POR QUÉ EXISTE ──────────────────────────────────────────────────────
   Apple rechaza por la regla 4.2 las apps que son "un sitio web
   reempaquetado". No alcanza con que el sitio sea bueno: el revisor abre la
   app y busca qué hace que no haría Safari. Este archivo es esa respuesta, y
   son cuatro cosas concretas:

     1. VIBRA EN CADA GOL. Es la más importante y la más demostrable: Safari
        en iPhone no tiene háptica, punto. Un hincha que siente el gol en la
        mano está teniendo una experiencia que el sitio no puede dar.
     2. COMPARTE CON LA HOJA DEL SISTEMA, no con un link de wa.me.
     3. ABRE LOS LINKS DEL FEED ADENTRO DE LA APP. Esto además es
        obligatorio: un webview que navega a un diario y se queda ahí es la
        definición del rechazo.
     4. SABE SI HAY RED, y lo dice con una pantalla propia en vez de dejar
        que aparezca el error del navegador.

   ─── LA REGLA QUE ORDENA TODO EL ARCHIVO ─────────────────────────────────
   **Nada de esto puede romper la web.** El mismo código corre en el sitio de
   armael11.com, en la TWA de Android y adentro de la app de iPhone, y en los
   dos primeros casos no existe ningún plugin nativo. Así que cada función
   pregunta primero si hay con qué, y si no lo hay devuelve `false` y el que
   llamó sigue con lo que hacía antes. No hay `import`, no hay bundler, no
   hay `npm`: los plugins se leen de `window.Capacitor.Plugins` en el momento
   de usarlos, que es como Capacitor los deja cuando corre de verdad.

   Ese "sin bundler" no es pereza: el sitio entero se publica como archivos
   sueltos y esa es la razón por la que se puede arreglar algo sin tener una
   máquina de desarrollo al lado. Meter un paso de compilación acá lo
   rompería para ganar nada.
   ══════════════════════════════════════════════════════════════════════════ */

/* El objeto que deja Capacitor cuando la app corre adentro del envoltorio
   nativo. En un navegador común no existe y todo lo de abajo se apaga solo. */
const pluginsNativos = () => (typeof window !== "undefined" && window.Capacitor && window.Capacitor.Plugins) || null;

/* Pura, para poder probarla: ¿hay plugin nativo para esto? */
export function tiene(nombre, ventana) {
  const w = ventana || (typeof window !== "undefined" ? window : null);
  const P = (w && w.Capacitor && w.Capacitor.Plugins) || null;
  return !!(P && P[nombre]);
}

export const hayNativo = (ventana) => {
  const w = ventana || (typeof window !== "undefined" ? window : null);
  return !!(w && w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform());
};

/* ── 1. LA HÁPTICA ───────────────────────────────────────────────────────
   Tres intensidades y no una, porque un gol y el toque de un botón no se
   sienten igual y si se sintieran igual el detalle no sumaría nada.

   `gol` es el impacto pesado: es el momento del producto.
   `toque` es el liviano, para la barra de pestañas.
   `aviso` es el patrón de notificación, para cuando salió el once del DT.

   Es `void` a propósito: nadie espera a que termine una vibración, y si el
   plugin falla —un iPhone con la háptica apagada en ajustes— no puede
   arrastrar al partido que se está dibujando. */
export function vibrar(tipo) {
  const P = pluginsNativos();
  if (!P || !P.Haptics) return false;
  try {
    if (tipo === "gol") P.Haptics.impact({ style: "HEAVY" });
    else if (tipo === "aviso") P.Haptics.notification({ type: "SUCCESS" });
    else P.Haptics.impact({ style: "LIGHT" });
    return true;
  } catch (e) { return false; }
}

/* ── 2. COMPARTIR ────────────────────────────────────────────────────────
   Devuelve `true` solo si la hoja del sistema se abrió. Con `false`, el que
   llamó sigue con el camino de siempre —navigator.share, wa.me, copiar—,
   que es el que funciona en la web.

   El que cancela cuenta como compartido: para el que llamó, el trabajo
   terminó igual y no hay que abrirle WhatsApp encima. */
export async function compartirNativo(texto, url) {
  const P = pluginsNativos();
  if (!P || !P.Share) return false;
  try {
    await P.Share.share({ text: texto, url, dialogTitle: "Compartir" });
    return true;
  } catch (e) {
    return /cancel/i.test(String((e && e.message) || "")) ? true : false;
  }
}

/* ── 3. LOS LINKS DE AFUERA ──────────────────────────────────────────────
   Todo lo que sale del feed —noticias, videos— se abre en el navegador de
   adentro de la app. Dos razones, y la segunda es la que manda:

   - La persona vuelve a la app con un botón, no perdiendo el hilo.
   - Apple rechaza un webview que se va navegando a un diario. La app tiene
     que seguir siendo la app.

   El color de la barra sale del verde de la marca para que no se sienta
   como salir a otro lado. */
export async function abrirAfuera(url) {
  const P = pluginsNativos();
  if (!P || !P.Browser) return false;
  try {
    await P.Browser.open({ url, presentationStyle: "popover", toolbarColor: "#177A40" });
    return true;
  } catch (e) { return false; }
}

/* Pura: ¿este link es de afuera y hay que abrirlo adentro de la app?
   Los links internos —otra página de club, un ancla— siguen su camino
   normal, y los `mailto:`/`tel:` los tiene que agarrar el sistema. */
export function esLinkDeAfuera(href, origen) {
  const h = String(href || "");
  if (!/^https?:\/\//i.test(h)) return false;
  try { return new URL(h).origin !== String(origen || ""); }
  catch (e) { return false; }
}

/* Engancha UN solo escuchador en todo el documento, en vez de tocar los
   cientos de `<a>` que dibuja el feed cada vez que se repinta. Un link que
   nace después de enganchar funciona igual, que es justo lo que pasa acá:
   el feed se redibuja entero en cada `pintar()`. */
export function engancharLinks(doc, ventana) {
  const d = doc || (typeof document !== "undefined" ? document : null);
  const w = ventana || (typeof window !== "undefined" ? window : null);
  if (!d || !w || !tiene("Browser", w)) return false;
  d.addEventListener("click", (ev) => {
    const a = ev.target && ev.target.closest && ev.target.closest("a[href]");
    if (!a) return;
    if (!esLinkDeAfuera(a.getAttribute("href"), w.location.origin)) return;
    ev.preventDefault();
    abrirAfuera(a.href);
  }, true);
  return true;
}

/* ── 4. LA RED ───────────────────────────────────────────────────────────
   La app viaja con los datos adentro, así que sin señal el simulador anda
   igual. Lo que no anda es entrar con el mail o comprar, y eso hay que
   decirlo con una pantalla propia: el error del navegador adentro de una
   app se lee como "la app está rota".

   Se prefiere el plugin nativo sobre `navigator.onLine` porque el del
   navegador miente: dice que hay red cuando hay wifi sin internet. */
export async function hayConexion() {
  const P = pluginsNativos();
  if (P && P.Network) {
    try { const e = await P.Network.getStatus(); return !!e.connected; }
    catch (e) { /* sigue abajo */ }
  }
  if (typeof navigator !== "undefined" && "onLine" in navigator) return !!navigator.onLine;
  return true;
}

export function alCambiarConexion(fn) {
  const P = pluginsNativos();
  if (P && P.Network) {
    try { P.Network.addListener("networkStatusChange", (e) => fn(!!e.connected)); return true; }
    catch (e) { /* sigue abajo */ }
  }
  if (typeof window === "undefined") return false;
  window.addEventListener("online", () => fn(true));
  window.addEventListener("offline", () => fn(false));
  return true;
}

/* ── EL ARRANQUE ─────────────────────────────────────────────────────────
   Una sola llamada desde la app. Si no hay nada nativo, no hace nada y no
   se nota. */
export function arrancarNativo(alCambiar) {
  if (!hayNativo()) return false;
  engancharLinks();
  if (typeof alCambiar === "function") alCambiarConexion(alCambiar);
  /* La barra de estado del iPhone, del color de la app. Sin esto queda una
     franja blanca arriba que delata el webview. */
  const P = pluginsNativos();
  try { if (P && P.StatusBar) P.StatusBar.setStyle({ style: "DARK" }); } catch (e) {}
  /* El splash se saca a mano recién cuando la app ya dibujó: si se sacara
     solo, se vería un destello en blanco entre la pantalla de carga y la
     primera pintada. */
  try { if (P && P.SplashScreen) P.SplashScreen.hide(); } catch (e) {}
  return true;
}

/* ══════════════════════════════════════════════════════════════════════════
   INSTALAR DESDE LA WEB

   El sitio ya era instalable —manifest, service worker, íconos— y no lo
   ofrecía nunca. Quedaba escondido en el menú de Chrome, donde no lo
   encuentra nadie, y eso tiene dos costos concretos:

   - El que llega de Instagram se queda en una pestaña: no tiene ícono, no
     vuelve solo y, sobre todo, NO PUEDE RECIBIR EL AVISO del once del DT,
     que es el gancho para que vuelva cada fecha.
   - Una app instalada desde la web no es una app de Play: el cobro sigue
     siendo por Mercado Pago, sin comisión. Play se lleva 15%.

   El botón se comporta distinto en cada lado, así que la decisión es una
   función pura y se prueba sin navegador.
   ══════════════════════════════════════════════════════════════════════════ */

/* ¿Ya está instalada? Dos formas, porque ningún navegador tiene las dos:
   `display-mode: standalone` es el estándar y `navigator.standalone` es lo
   que usa Safari en iPhone desde siempre. */
export function yaInstalada(ventana) {
  const w = ventana || (typeof window !== "undefined" ? window : null);
  if (!w) return false;
  try {
    if (w.matchMedia && w.matchMedia("(display-mode: standalone)").matches) return true;
  } catch (e) {}
  return !!(w.navigator && w.navigator.standalone);
}

/* iPhone y iPad. El iPad moderno miente y dice que es una Mac, así que
   además se mira si la pantalla responde al tacto: una Mac no. */
export function esIOS(ventana) {
  const w = ventana || (typeof window !== "undefined" ? window : null);
  const n = (w && w.navigator) || null;
  if (!n) return false;
  const ua = String(n.userAgent || "");
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Mac/i.test(ua) && (n.maxTouchPoints || 0) > 1;
}

/* La decisión, en una sola función pura:

     "tienda"  → viene de la app de Play. No se ofrece nada: ya la tiene.
     "ya"      → ya está instalada. Tampoco.
     "ios"     → iPhone. No existe el evento de instalación del navegador,
                 así que van las instrucciones de Compartir → Agregar a
                 inicio. Y en iOS es OBLIGATORIO instalarla así para que
                 lleguen los avisos.
     "android" → hay evento guardado: un botón y listo.
     "no"      → una compu, o un navegador que no lo soporta. No se
                 muestra nada antes que mostrar algo que no funciona.  */
export function modoDeInstalacion(ventana, opciones) {
  const o = opciones || {};
  if (o.enLaTienda) return "tienda";
  if (yaInstalada(ventana)) return "ya";
  if (esIOS(ventana)) return "ios";
  if (o.hayPrompt) return "android";
  return "no";
}
