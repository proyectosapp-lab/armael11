/* ══════════════════════════════════════════════════════════════════════════
   CAMPAÑA — contar si la plata de Instagram trajo gente que JUEGA.

   ─── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────
   Meta sabe contar clicks y visitas, y las cobra. Lo que Meta no puede
   saber es lo único que importa: de los que entraron, cuántos simularon.
   Una visita que rebota a los tres segundos y una que arma un once y
   aprieta simular valen lo mismo en el panel de anuncios y no valen lo
   mismo para nada más.

   Sin esto, el lunes tenemos una sola cifra —"costó $95 la visita"— y
   ninguna manera de saber si esas visitas sirvieron. Con esto tenemos la
   cadena entera: llegaron N, simularon M, se instalaron K.

   ─── POR QUÉ NO SE USA GOOGLE ANALYTICS NI UN PIXEL ──────────────────────
   La app tiene una promesa que se prueba en cada corrida: NO CARGA NINGÚN
   SCRIPT DE TERCEROS. El pixel de Meta contaría mejor las visitas y a
   cambio metería un script que sigue a la persona por todos los sitios que
   lo tengan puesto. No entra. Esto es un `fetch` a nuestra propia base.

   ─── QUÉ SE GUARDA, EXACTAMENTE ──────────────────────────────────────────
   Una fila por CÓDIGO, DÍA e HITO, con un número al lado:

       ig1 | 2026-09-19 | llego  | 143
       ig1 | 2026-09-19 | simulo |  38

   Eso es todo. No hay identificador de persona, no hay IP, no hay hora, no
   hay nada que permita volver de una fila a alguien. El número que impide
   contar cinco veces al mismo —el "ya mandé este hito"— vive en el
   `localStorage` del teléfono y NUNCA sale de ahí.

   El costo de esa decisión es real y está aceptado: no se puede reconstruir
   el recorrido de una persona. No lo necesitamos. La pregunta es "¿de cien
   que entraron, cuántos jugaron?", y para eso alcanzan dos números.

   ─── LA REGLA QUE ORDENA TODO EL ARCHIVO ─────────────────────────────────
   **Esto no puede romper ni frenar nada.** Es un contador. Cada llamada es
   sin `await` desde donde se usa, cada error se traga, y si el backend no
   está configurado el archivo entero no hace absolutamente nada. Una
   simulación no se puede caer porque no se pudo contar.
   ══════════════════════════════════════════════════════════════════════════ */

/* Todos los nombres de acá llevan `camp` o `Campana` a propósito. El sitio
   se arma con `<script>` clásicos, que comparten UN solo ámbito global: dos
   archivos que declaran el mismo nombre no se pisan, se matan —el segundo
   tira "Identifier already declared" y muere el script entero—. Ya pasó una
   vez, con `hayRed`, y dejó la portada en blanco. */

const CAMP_LLAVE = "armaEl11.campana";   /* de dónde vino esta persona */
const CAMP_HITOS = "armaEl11.hitos";     /* qué ya contamos de ella */
const CAMP_USO   = "armaEl11.usoDia";    /* qué ya contamos HOY de ella */
const CAMP_DIAS  = 30;                   /* cuánto vale una visita de campaña */

const campCfg = () => (typeof window !== "undefined" && window.SITIO && window.SITIO.supabase) || {};

/* Igual que en cuentas.js: el navegador puede NEGAR el almacenamiento y ahí
   `localStorage` no devuelve null, TIRA. Todo acceso va envuelto. Sin
   almacenamiento el contador cuenta de más (cada recarga suma una visita) y
   eso es preferible a que la página no abra. */
const campLeer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const campPoner = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

/* ── EL CÓDIGO DE CAMPAÑA ────────────────────────────────────────────────
   Viene en la dirección: armael11.com/?c=ig1

   Se valida con una expresión estrecha y no por desconfianza del visitante
   sino porque ese texto termina siendo una fila en la base: si entra
   cualquier cosa, el lunes la tabla tiene doscientos códigos inventados y
   ninguna fila sirve. Lo que no matchea se ignora en silencio.           */
export function leerCodigoCampana(loc) {
  const l = loc || (typeof location !== "undefined" ? location : null);
  if (!l) return null;
  let v = null;
  try { v = new URLSearchParams(l.search || "").get("c"); } catch (e) { return null; }
  if (!v) return null;
  v = String(v).toLowerCase();
  return /^[a-z0-9_-]{1,24}$/.test(v) ? v : null;
}

/* Pura: ¿sigue valiendo lo que guardamos? Una visita de campaña vale treinta
   días. Más que eso y le estaríamos atribuyendo a un anuncio de septiembre
   una simulación de noviembre, que es exactamente la clase de mentira que
   hace que uno gaste mal la plata. */
export function campanaVigente(guardado, ahora) {
  if (!guardado || !guardado.codigo || !guardado.dia) return null;
  const hoy = ahora || Date.now();
  const dias = (hoy - Date.parse(guardado.dia + "T00:00:00Z")) / 86400000;
  if (!(dias >= 0) || dias > CAMP_DIAS) return null;
  return guardado.codigo;
}

const campHoy = () => new Date().toISOString().slice(0, 10);

export function guardarCampana(codigo) {
  if (!codigo) return null;
  campPoner(CAMP_LLAVE, JSON.stringify({ codigo, dia: campHoy() }));
  return codigo;
}

export function campanaActiva() {
  let g = null;
  try { g = JSON.parse(campLeer(CAMP_LLAVE) || "null"); } catch (e) { return null; }
  return campanaVigente(g);
}

/* ── SACAR EL `?c=` DE LA BARRA ──────────────────────────────────────────
   No es cosmética. Si el código se queda en la dirección, el primero que
   comparta el link por WhatsApp le manda a quince amigos una dirección que
   dice "vengo del anuncio", y el lunes el anuncio figura trayendo gente que
   llegó por un amigo. El número se ensucia solo.

   `replaceState` y no `pushState`: el botón de atrás tiene que seguir
   yendo a Instagram, no a la misma página sin el parámetro.             */
export function limpiarUrlCampana(loc, hist) {
  const l = loc || (typeof location !== "undefined" ? location : null);
  const h = hist || (typeof history !== "undefined" ? history : null);
  if (!l || !h || !h.replaceState) return false;
  try {
    const u = new URL(l.href);
    if (!u.searchParams.has("c")) return false;
    u.searchParams.delete("c");
    h.replaceState(null, "", u.pathname + (u.searchParams.toString() ? "?" + u.searchParams : "") + u.hash);
    return true;
  } catch (e) { return false; }
}

/* ── LOS HITOS ───────────────────────────────────────────────────────────
   Cuatro, y cada uno una sola vez por teléfono:

     llego   — abrió la página con el código puesto
     simulo  — apretó simular al menos una vez. ES EL NÚMERO QUE IMPORTA:
               es la diferencia entre una visita y una persona jugando.
     instalo — se agregó a la pantalla de inicio. Vale más que una
               simulación: es el que puede volver y recibir el aviso.
     cuenta  — creó la cuenta. El final del embudo.

   Una sola vez, porque si no el que simula veinte veces en una tarde
   convierte una persona en veinte y el porcentaje deja de querer decir
   nada. La memoria de "ya lo mandé" es del teléfono, no del servidor: el
   servidor solo recibe "sumá uno" y ni siquiera podría distinguir quién.  */
const campYaMandados = () => {
  try { return JSON.parse(campLeer(CAMP_HITOS) || "{}") || {}; } catch (e) { return {}; }
};

/* Pura, para poder probarla sin navegador: ¿corresponde mandar este hito? */
export function tocaMandar(hitos, codigo, hito) {
  if (!codigo || !hito) return false;
  return !((hitos || {})[codigo + ":" + hito]);
};

/* El envío. Sin `await` desde donde se llama, sin `throw` nunca.

   Se marca como mandado ANTES de que conteste el servidor, y es a
   propósito: si se marcara después, un teléfono con la red intermitente
   reintentaría en cada recarga y sumaría de más. Preferimos contar de
   menos —un hito perdido— antes que de más: un número inflado se parece
   demasiado a una buena noticia.                                        */
function campMandar(codigo, hito) {
  const { url, anon } = campCfg();
  if (!url || !anon) return false;
  try {
    fetch(url + "/rest/v1/rpc/sumar_hito", {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ p_codigo: codigo, p_hito: hito }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {}
  return true;
}

function mandarHito(codigo, hito) {
  const { url, anon } = campCfg();
  if (!url || !anon) return false;
  const guardados = campYaMandados();
  if (!tocaMandar(guardados, codigo, hito)) return false;
  guardados[codigo + ":" + hito] = 1;
  campPoner(CAMP_HITOS, JSON.stringify(guardados));
  return campMandar(codigo, hito);
}

/* ══════════════════════════════════════════════════════════════════════════
   EL USO DE TODOS LOS DÍAS — Y NO SOLO EL DE LOS QUE VINIERON DE UN ANUNCIO

   ─── POR QUÉ HIZO FALTA ──────────────────────────────────────────────────
   Google rechazó la prueba cerrada por falta de actividad de los testers, y
   nos encontró sin una sola cifra propia para discutirlo. El contador de
   arriba mide el embudo de las campañas: no sabe nada del que entró por su
   cuenta, que es casi todo el mundo.

   Y hay una razón peor, específica de esta app: **la versión de Play es un
   TWA**, o sea el sitio adentro de una ventana. Para cualquier medición de
   sitio web, una persona usando la app instalada y una persona en el
   navegador son indistinguibles. Justo la distinción que Google nos pedía.

   ─── QUÉ CUENTA ──────────────────────────────────────────────────────────
   Dos códigos, no uno: `uso-app` y `uso-web`. Van a la MISMA tabla y por la
   misma vía que los hitos, así que no hay infraestructura nueva ni una
   segunda promesa de privacidad que sostener. Sigue sin haber identificador
   de persona: una fila por código, día e hito, con un número al lado.

   ─── UNA VEZ POR DÍA, Y EL DÍA ES EL DEL TELÉFONO ────────────────────────
   `enganchar()` corre en cada pintado —decenas de veces en una tarde—, así
   que sin tope esto contaría pintados y no personas.

   El día se toma del RELOJ LOCAL y no de UTC, y no es un detalle: en
   Argentina, a partir de las nueve de la noche, UTC ya está en el día
   siguiente. Con UTC, el que juega todas las noches contaría dos veces por
   día y el número que le íbamos a mostrar a Google sería el doble del real.
   Un número inflado se parece demasiado a una buena noticia.            */
export function codigoDeUso(enLaApp) { return enLaApp ? "uso-app" : "uso-web"; }

const campDiaLocal = () => {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
};

/* Pura, para poder probar el cambio de día sin esperar a mañana. */
export function tocaHoy(dias, hito, hoy) {
  if (!hito || !hoy) return false;
  return (dias || {})[hito] !== hoy;
}

export function usoDiario(hito, enLaApp) {
  try {
    const { url, anon } = campCfg();
    if (!url || !anon || !hito) return false;
    const hoy = campDiaLocal();
    let dias = {};
    try { dias = JSON.parse(campLeer(CAMP_USO) || "{}") || {}; } catch (e) { dias = {}; }
    if (!tocaHoy(dias, hito, hoy)) return false;
    /* Se anota ANTES de mandar, igual que los hitos: contar de menos es
       preferible a contar de más. Y se guarda SOLO lo de hoy, así la llave
       no crece un renglón por día para siempre. */
    const limpio = {};
    for (const k of Object.keys(dias)) if (dias[k] === hoy) limpio[k] = hoy;
    limpio[hito] = hoy;
    campPoner(CAMP_USO, JSON.stringify(limpio));
    return campMandar(codigoDeUso(enLaApp), hito);
  } catch (e) { return false; }
}

/* Lo que llama el resto de la app. Si esta persona no vino de una campaña
   —que es la enorme mayoría— no hace nada y no cuesta nada. */
export function hitoCampana(hito) {
  try {
    const codigo = campanaActiva();
    if (!codigo) return false;
    return mandarHito(codigo, hito);
  } catch (e) { return false; }
}

/* ── EL ARRANQUE ─────────────────────────────────────────────────────────
   Una sola llamada, arriba de todo. Lee el código, lo guarda, lo saca de la
   barra y cuenta la llegada. Sin código en la dirección no hace nada. */
export function arrancarCampana() {
  try {
    const codigo = leerCodigoCampana();
    if (codigo) {
      guardarCampana(codigo);
      limpiarUrlCampana();
      mandarHito(codigo, "llego");
      return codigo;
    }
  } catch (e) {}
  return null;
}
