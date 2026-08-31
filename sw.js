/* ══════════════════════════════════════════════════════════════════════════
   EL SERVICE WORKER — que la app conteste algo cuando no hay señal.

   Existe por dos razones y conviene tenerlas separadas:

   1. LA DE PRODUCTO. Alguien abre la app en la cancha, con la red saturada,
      para mirar su equipo. Sin esto ve el dinosaurio del navegador. Con
      esto ve lo último que vio, que es viejo pero es algo.

   2. LA DE PLAY. Google mide "que la app devuelva 200 estando sin red" como
      requisito de calidad. Una app envuelta que falla ahí cuenta como falla
      de la aplicación y te puede bajar de la tienda.

   ─── EL PELIGRO DE ESTE ARCHIVO ──────────────────────────────────────────
   Un service worker mal hecho es la única forma de romper un sitio
   ESTÁTICO de manera permanente: si guarda una versión rota y la sirve
   siempre, el usuario no puede llegar nunca más a la buena, y recargar no
   arregla nada porque el que contesta es esto y no la red.

   Por eso, tres reglas que no se negocian:

   · PRIMERO LA RED, siempre que haya. La caché es el paracaídas, no el
     avión. Así una publicación nueva se ve en la siguiente visita.
   · SOLO SE GUARDA LO QUE SALIÓ BIEN. Nada de respuestas con error ni
     opacas. Guardar un 404 es guardar el problema.
   · EL NOMBRE DE LA CACHÉ LLEVA VERSIÓN. Al activarse, borra todas las que
     no son la suya. Cambiar la versión es la salida de emergencia: se toca
     el número, se publica, y todo lo viejo se tira.
   ══════════════════════════════════════════════════════════════════════════ */

/* Cambiá este número para tirar TODO lo guardado en todos los teléfonos.
   v2: la app se veía vieja después de publicar. Este número es la salida de
   emergencia que dejamos escrita para exactamente eso. */
const VERSION = "v2";
const CACHE = "armael11-" + VERSION;

/* Nada se precarga a propósito. Precargar una lista de archivos obliga a
   mantener esa lista al día, y el día que se desactualiza el service worker
   falla al instalarse y no se instala nunca más. Se guarda lo que la gente
   realmente visita. */
self.addEventListener("install", e => self.skipWaiting());

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const n of await caches.keys()) if (n !== CACHE) await caches.delete(n);
    /* Tomar el control enseguida: si no, la versión nueva queda esperando a
       que se cierren todas las pestañas, y en un teléfono eso puede ser
       nunca. */
    await self.clients.claim();
  })());
});

/* Lo único que se sirve desde acá es lo NUESTRO. Las miniaturas de los
   medios y cualquier otra cosa de afuera pasan de largo: no las guardamos
   —no son nuestras— y además una respuesta opaca no se puede revisar. */
const miaEs = url => url.origin === self.location.origin;

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (!miaEs(url)) return;

  /* ── LA PÁGINA NUNCA SALE DE UNA CACHÉ VIEJA HABIENDO RED ──────────────
     "Primero la red" no alcanzaba: `fetch` también pasa por la caché HTTP
     del navegador, y GitHub Pages manda sus páginas con diez minutos de
     vida. Con eso, publicar y recargar podía seguir mostrando lo de antes
     sin que nada estuviera roto — que es de las cosas más difíciles de
     diagnosticar, porque no falla: miente.

     Solo para las NAVEGACIONES, que son las que traen la app entera. Los
     datos y las imágenes siguen usando la caché normal: ahí diez minutos
     de más no cambian nada y ahorran tráfico de verdad.                 */
  const esPagina = req.mode === "navigate";

  e.respondWith((async () => {
    try {
      const red = await fetch(esPagina ? new Request(req, { cache: "no-store" }) : req);
      /* Solo se guarda lo que salió bien y es nuestro. */
      if (red && red.status === 200 && red.type === "basic") {
        const copia = red.clone();
        (await caches.open(CACHE)).put(req, copia);
      }
      return red;
    } catch (e) {
      const guardado = await caches.match(req);
      if (guardado) return guardado;

      /* Si es una navegación y no hay nada guardado de ESA página, se
         contesta con la portada guardada. Devolver 200 con algo útil es lo
         que Play mide, y es lo que la persona espera: llegar a algún lado. */
      if (req.mode === "navigate") {
        const portada = await caches.match("/") || await caches.match("/index.html");
        if (portada) return portada;
        return new Response(
          "<!doctype html><meta charset=utf-8>" +
          "<meta name=viewport content='width=device-width,initial-scale=1'>" +
          "<title>Sin conexión</title>" +
          "<style>body{margin:0;display:grid;place-items:center;min-height:100vh;" +
          "background:#0B4F3A;color:#fff;font:16px/1.5 system-ui,sans-serif;" +
          "text-align:center;padding:24px}b{font-size:20px;display:block;margin-bottom:6px}" +
          "</style><div><b>Sin conexión</b>Volvé a abrirla cuando tengas señal " +
          "y se actualiza sola.</div>",
          { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      /* Para lo que no es una página —un feed, un dato— se devuelve un error
         de red de verdad. Inventar un 200 vacío haría que la app dibuje una
         pantalla en blanco creyendo que no hay nada, en vez de avisar. */
      throw e;
    }
  })());
});
