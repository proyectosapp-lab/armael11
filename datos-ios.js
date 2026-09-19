/* ══════════════════════════════════════════════════════════════════════════
   DATOS-IOS — la foto que viaja adentro del .ipa, y cómo se pone al día.

   ─── EL PROBLEMA ─────────────────────────────────────────────────────────
   En la web, los datos son archivos que el navegador baja cada vez: el once
   del DT que la ronda corta guardó hace diez minutos ya está ahí. En un
   .ipa no: lo que se empaquetó el día de la compilación es lo que hay, y
   cambiarlo significa mandar una versión nueva a revisión de Apple y
   esperar dos días. Una app de fútbol con la fecha congelada no sirve.

   Las tres salidas posibles se evaluaron y se eligió la tercera:

     a) Solo la foto. Barata y muerta: una semana después muestra una fecha
        ya jugada.
     b) Solo la red. Liviana, pero el revisor de Apple instala la app y la
        prueba SIN CONEXIÓN. Vería una pantalla vacía, y "funciona sin
        conexión" es una de las cuatro cosas con las que justificamos que
        esto no es un sitio reempaquetado (regla 4.2).
     c) Las dos. Arranca de la foto —siempre está, siempre es instantánea—
        y se pone al día en segundo plano.

   ─── LA REGLA QUE ORDENA TODO EL ARCHIVO ─────────────────────────────────
   **Nada de acá puede frenar la primera pantalla ni romper nada.** La app
   ya arrancó y ya está andando con la foto cuando esto empieza. Cada error
   se traga, cada paso es opcional, y si no hay red, no hay base de datos o
   el archivo vino raro, la app se queda exactamente como estaba. Un
   partido no puede esperar a que cargue una descarga.

   ─── POR QUÉ SE PARSEA Y NO SE EVALÚA ────────────────────────────────────
   Lo que se baja son archivos `.js` nuestros, de la forma `window.X = {…}`.
   La tentación es meterlos en un <script> y dejar que el navegador los
   corra: dos líneas y listo. No se hace, por dos motivos distintos y los
   dos suficientes.

   El primero es Apple. La regla 2.5.2 prohíbe descargar y ejecutar código
   que cambie lo que la app hace. El JavaScript adentro de un webview es la
   excepción permitida, pero "bajo un .js de mi servidor y lo ejecuto" es
   justo la frase que un revisor no quiere leer. Bajando DATOS y no código
   la conversación no existe.

   El segundo es que es verdad: son datos. Un archivo de onces es un objeto
   con nombres de jugadores. Parsearlo con `JSON.parse` en vez de ejecutarlo
   significa que ni un archivo corrupto, ni un servidor tomado, ni un
   intermediario pueden hacer nada más que darnos un objeto feo — que se
   descarta. Ejecutarlo sería darles la app entera.

   Cuesta esta tabla de reglas de abajo. Vale la pena.
   ══════════════════════════════════════════════════════════════════════════ */

/* Todos los nombres llevan `dios` o `Ios` por la misma razón que `campana.js`
   lleva `camp`: el sitio se arma con <script> clásicos, que comparten UN solo
   ámbito global, y dos archivos que declaran el mismo nombre no se pisan, se
   matan. Ya pasó una vez con `hayRed` y dejó la portada en blanco. */

const DIOS_ORIGEN = "https://armael11.com";
const DIOS_DB = "armaEl11.datos";
const DIOS_TIENDA = "archivos";

/* ── ¿ESTAMOS ADENTRO DE LA APP NATIVA? ──────────────────────────────────
   Dos señales y con una alcanza. `Capacitor.isNativePlatform()` es la que
   corresponde; el esquema `capacitor:` es el respaldo para el instante del
   arranque, cuando el puente todavía no se inyectó. En la web este archivo
   ni siquiera se empaqueta, así que esto es un cinturón sobre un tirante. */
export function esNativaIos() {
  try {
    if (typeof window === "undefined") return false;
    const C = window.Capacitor;
    if (C && typeof C.isNativePlatform === "function" && C.isNativePlatform()) return true;
    return String(window.location && window.location.protocol) === "capacitor:";
  } catch (e) { return false; }
}

/* ══ LOS PARSEADORES ═══════════════════════════════════════════════════════
   Cada archivo nuestro es una asignación sola: `window.ALGO = {…};`. Sacar
   el objeto es encontrar dónde empieza y dónde termina.

   El `desde` NO es un detalle. Dos de los formatos tienen un `{}` vacío
   ANTES del objeto de verdad —`window.LIGAS=window.LIGAS||{}` y
   `window.ONCES=window.ONCES||{}`— así que agarrar la primera llave
   devuelve un objeto vacío y borra la liga entera sin tirar un error. Es la
   misma técnica que ya usa `formaciones.mjs` del lado del servidor, y está
   repetida acá a propósito: son dos mundos que no comparten código, y
   copiar veinte líneas es mejor que un `import` que no existe.          */
export function diosObjeto(texto, desde) {
  const t = String(texto || "");
  const i = t.indexOf("{", desde > 0 ? desde : 0), f = t.lastIndexOf("}");
  if (i < 0 || f < i) return null;
  try { return JSON.parse(t.slice(i, f + 1)); } catch (e) { return null; }
}

export function diosArreglo(texto) {
  const t = String(texto || "");
  const i = t.indexOf("["), f = t.lastIndexOf("]");
  if (i < 0 || f < i) return null;
  try { return JSON.parse(t.slice(i, f + 1)); } catch (e) { return null; }
}

/* ── LA TABLA ────────────────────────────────────────────────────────────
   Un renglón por tipo de archivo: cómo se lee y dónde va lo que trae.
   Agregar los feeds o las estadísticas el día de mañana es un renglón más.

   Lo que NO está acá se ignora en silencio, y eso también es a propósito:
   `portada.js` tiene tres asignaciones en el mismo archivo y no se refresca
   —es la lista de clubes, cambia cuando cambia la app, no durante la
   fecha—. Un archivo que no sabemos leer se deja como vino en la foto,
   que es siempre la opción segura.                                      */
export function reglaDeArchivo(nombre) {
  const n = String(nombre || "").split("/").pop();

  if (/^onces-[a-z-]+\.js$/.test(n))
    /* `\n{` y no `{`: el archivo abre con `window.ONCES=window.ONCES||{}`.
       Y se mezcla con Object.assign, nunca se reemplaza: las once ligas
       escriben sobre el mismo objeto y una asignación se llevaría puestas
       a las otras diez. */
    return { leer: t => diosObjeto(t, String(t).indexOf("\n{")),
             poner: v => { window.ONCES = window.ONCES || {}; Object.assign(window.ONCES, v); } };

  const liga = n.match(/^liga-([a-z-]+)\.js$/);
  if (liga)
    /* Acá el `]=` marca el final de `window.LIGAS["slug"]` y el principio
       del objeto. Mismo problema del `||{}` de arriba. */
    return { leer: t => diosObjeto(t, String(t).indexOf("]=")),
             poner: v => { window.LIGAS = window.LIGAS || {}; window.LIGAS[liga[1]] = v; } };

  if (/^cache-[a-z0-9-]+\.js$/.test(n))
    /* El cache del club de ESTA página. Se reemplaza entero porque eso es
       lo que hace el archivo original, y porque adentro viene el once del
       DT que es todo el punto de refrescar. */
    return { leer: t => diosObjeto(t, String(t).indexOf("=")),
             poner: v => { window.CACHE = v; } };

  if (/^feed-[a-z0-9-]+\.js$/.test(n))
    return { leer: t => diosObjeto(t, String(t).indexOf("=")),
             poner: v => { window.FEED = v; } };

  if (n === "fecha.js")
    return { leer: t => diosObjeto(t, String(t).indexOf("=")),
             poner: v => { window.FECHA = v; } };

  if (n === "ligas.js")
    return { leer: diosArreglo,
             poner: v => { window.LIGAS_DISPONIBLES = v; } };

  return null;
}

/* ══ DÓNDE SE GUARDA LO QUE SE BAJA ════════════════════════════════════════
   IndexedDB y no `localStorage`. No es preferencia: el cache de un club
   solo pesa unos cuatrocientos kilobytes, y `localStorage` en el webview de
   iPhone tiene unos cinco megas para TODO —incluida la sesión, el cupo y
   las preferencias—. Meter los datos ahí sería romper la cuenta de la
   persona para ahorrarse treinta líneas.

   Y no se usa el service worker, que en la web hace justo esto: adentro del
   webview de iOS, con el esquema `capacitor://`, los service workers no
   funcionan de forma confiable. Es una limitación de WKWebView, no algo que
   podamos configurar. Por eso el cacheo, que en la web sale gratis, acá hay
   que escribirlo.                                                        */
function diosAbrir() {
  return new Promise((ok, mal) => {
    try {
      const p = indexedDB.open(DIOS_DB, 1);
      p.onupgradeneeded = () => { try { p.result.createObjectStore(DIOS_TIENDA); } catch (e) {} };
      p.onsuccess = () => ok(p.result);
      p.onerror = () => mal(p.error);
    } catch (e) { mal(e); }
  });
}

function diosLeerTodo(db) {
  return new Promise(ok => {
    try {
      const tx = db.transaction(DIOS_TIENDA, "readonly").objectStore(DIOS_TIENDA);
      const claves = tx.getAllKeys(), valores = tx.getAll();
      const salida = {};
      valores.onsuccess = () => {
        try { (claves.result || []).forEach((k, i) => { salida[k] = valores.result[i]; }); } catch (e) {}
        ok(salida);
      };
      valores.onerror = () => ok({});
    } catch (e) { ok({}); }
  });
}

function diosGuardar(db, clave, valor) {
  return new Promise(ok => {
    try {
      const tx = db.transaction(DIOS_TIENDA, "readwrite");
      tx.objectStore(DIOS_TIENDA).put(valor, clave);
      tx.oncomplete = () => ok(true);
      tx.onerror = () => ok(false);
    } catch (e) { ok(false); }
  });
}

/* ── QUÉ ARCHIVOS HAY QUE MIRAR ──────────────────────────────────────────
   Se lee de la propia página, de las etiquetas `<script src="datos/…">`
   que ya están ahí. Podría ser una lista escrita a mano en el empaquetado,
   y sería una lista que algún día no coincide con la página. Preguntarle al
   documento no se desactualiza nunca.                                   */
export function archivosDeLaPagina(doc) {
  const d = doc || (typeof document !== "undefined" ? document : null);
  if (!d) return [];
  let tags = [];
  try { tags = Array.prototype.slice.call(d.querySelectorAll('script[src]')); } catch (e) { return []; }
  return tags.map(s => String(s.getAttribute("src") || ""))
             .filter(s => s.indexOf("datos/") === 0 && reglaDeArchivo(s));
}

/* ── LA FECHA DE LO QUE SE ESTÁ MOSTRANDO ────────────────────────────────
   Para poder DECIRLO. Un iPhone recién instalado y sin conexión muestra la
   foto, que puede tener una fecha ya jugada, y mostrarla como si fuera la
   de ahora es la misma confusión que arreglamos con el aviso de
   formaciones tentativas: la persona no cree que los datos están viejos,
   cree que la app se equivoca.                                          */
let DIOS_FECHA = null;
export function fechaDeLosDatos() {
  try { return DIOS_FECHA || (typeof window !== "undefined" ? window.DATOS_FOTO : null) || null; }
  catch (e) { return null; }
}

/* Pura, para poder probarla sin reloj ni red: ¿esto que estamos mostrando
   está lo bastante viejo como para avisar? Seis horas y no un día: una
   fecha de fútbol se juega en tres días y el once del DT dura una hora. */
export function datosViejos(fecha, ahora, horas = 6) {
  const t = Date.parse(fecha || "");
  if (!isFinite(t)) return false;
  const h = ((ahora || Date.now()) - t) / 36e5;
  return h > horas;
}

function diosAplicar(nombre, texto) {
  const regla = reglaDeArchivo(nombre);
  if (!regla) return false;
  const v = regla.leer(texto);
  /* Un objeto vacío se descarta. Bajar un archivo cortado y pisar con él la
     liga entera es peor que no haber bajado nada: la app se queda sin
     partidos y no hay manera de volver atrás hasta la próxima red. */
  if (!v || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)) return false;
  if (Array.isArray(v) && !v.length) return false;
  try { regla.poner(v); return true; } catch (e) { return false; }
}

/* ══ EL ARRANQUE ═══════════════════════════════════════════════════════════
   Dos tiempos, y el orden importa:

   1. LO GUARDADO. Lo que se bajó la última vez ya está en el teléfono: se
      aplica en milisegundos, sin red. Esto es lo que hace que la segunda
      vez que abrís la app tengas los datos de ayer a la noche aunque estés
      en el subte.

   2. LO FRESCO. Se pide a armael11.com en paralelo, sin que nadie espere.
      Lo que llega se aplica y se guarda para la próxima.

   `alAplicar` es lo que redibuja. Se llama una vez por tiempo y no una vez
   por archivo: redibujar once veces seguidas mientras entran las ligas hace
   parpadear la pantalla por nada.                                       */
let DIOS_ARRANCO = false;

export async function arrancarDatosIos(opciones) {
  const o = opciones || {};
  if (DIOS_ARRANCO) return false;
  if (!o.siempre && !esNativaIos()) return false;
  DIOS_ARRANCO = true;

  const alAplicar = typeof o.alAplicar === "function" ? o.alAplicar : () => {};
  const archivos = o.archivos || archivosDeLaPagina(o.doc);
  if (!archivos.length) return false;

  let db = null;
  try { db = await diosAbrir(); } catch (e) { db = null; }

  /* ── 1. lo guardado ── */
  if (db) {
    try {
      const guardados = await diosLeerTodo(db);
      let puestos = 0;
      for (const nombre of archivos) {
        const g = guardados[nombre];
        if (g && g.texto && diosAplicar(nombre, g.texto)) {
          puestos++;
          if (g.cuando && (!DIOS_FECHA || g.cuando > DIOS_FECHA)) DIOS_FECHA = g.cuando;
        }
      }
      if (puestos) alAplicar("guardado", puestos);
    } catch (e) {}
  }

  /* ── 2. lo fresco ── */
  try { await refrescarDatosIos({ archivos, db, alAplicar }); } catch (e) {}
  return true;
}

/* Se pide de a poco y no las veinte juntas: veinte descargas simultáneas en
   una red de celular se pisan entre ellas y tardan más que en fila. De
   cuatro en cuatro, que es lo que hace cualquier navegador por su cuenta. */
export async function refrescarDatosIos(opciones) {
  const o = opciones || {};
  const archivos = o.archivos || archivosDeLaPagina();
  const traer = o.traer || ((url) => fetch(url, { cache: "no-store" }).then(r => {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  }));
  const db = o.db || null;
  const alAplicar = typeof o.alAplicar === "function" ? o.alAplicar : () => {};
  const ahora = o.ahora || new Date().toISOString();

  let puestos = 0;
  const cola = archivos.slice();
  const obrero = async () => {
    for (;;) {
      const nombre = cola.shift();
      if (!nombre) return;
      try {
        const texto = await traer(DIOS_ORIGEN + "/" + nombre);
        if (!texto) continue;
        if (!diosAplicar(nombre, texto)) continue;
        puestos++;
        DIOS_FECHA = ahora;
        if (db) await diosGuardar(db, nombre, { texto, cuando: ahora });
      } catch (e) { /* sin red, o ese archivo no está: se queda el de la foto */ }
    }
  };
  await Promise.all([obrero(), obrero(), obrero(), obrero()]);
  if (puestos) alAplicar("fresco", puestos);
  return puestos;
}
