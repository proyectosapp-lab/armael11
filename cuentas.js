/* ══════════════════════════════════════════════════════════════════════════
   CUENTAS — todo lo que la app le pide al backend.

   Habla con Supabase por HTTP, con `fetch` y nada más. Podría usarse la
   librería oficial, pero la app tiene una promesa que se prueba en cada
   corrida: NO CARGA NINGÚN SCRIPT DE TERCEROS. Traer una librería de un CDN
   la rompería, y para lo que hacemos —diez llamados a una API REST— la
   librería no ahorra casi nada.

   Sin `sitio.json` configurado, `hayBackend()` devuelve false y la app anda
   exactamente como venía andando: feed, juego y números. Las cuentas son
   algo que se suma, no algo de lo que la app dependa.

   Lo que este archivo NO hace, y es a propósito: calcular puntos. Los puntos
   los escribe el servidor. Acá solo se leen.
   ══════════════════════════════════════════════════════════════════════════ */

const LLAVE = "tste.sesion";

const cfg = () => (typeof window !== "undefined" && window.SITIO && window.SITIO.supabase) || {};
export const hayBackend = () => !!(cfg().url && cfg().anon);

/* El navegador puede negarle el almacenamiento a la página —modo privado,
   configuraciones estrictas— y ahí `localStorage` no falla devolviendo null:
   TIRA. Si eso voltea la app, alguien no puede ni leer el feed por haber
   querido entrar. Así que todo acceso va envuelto.                        */
const guardado = {
  leer() { try { return JSON.parse(localStorage.getItem(LLAVE) || "null"); } catch (e) { return null; } },
  poner(v) { try { v ? localStorage.setItem(LLAVE, JSON.stringify(v)) : localStorage.removeItem(LLAVE); }
             catch (e) {} return v; },
};

let sesion = null;
export const quienSoy = () => sesion;
export const cargarSesion = () => (sesion = guardado.leer());

/* ─── el ida y vuelta con la API ─────────────────────────────────────────── */

async function pedir(ruta, { metodo = "GET", cuerpo, cabeceras = {}, sinToken = false } = {}) {
  const { url, anon } = cfg();
  if (!url || !anon) throw new Error("el backend no está configurado");
  const h = { apikey: anon, "Content-Type": "application/json", ...cabeceras };
  if (!sinToken && sesion?.token) h.Authorization = "Bearer " + sesion.token;

  const r = await fetch(url + ruta, {
    method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });

  /* El token dura una hora. Cuando vence, en vez de mandar a la persona a
     buscar el mail otra vez, se renueva con el refresh y se reintenta una
     sola vez. Una sola: si el reintento también da 401, la sesión está
     muerta de verdad y hay que volver a entrar.                          */
  if (r.status === 401 && !sinToken && sesion?.refresh) {
    const nueva = await renovar();
    if (nueva) return pedir(ruta, { metodo, cuerpo, cabeceras, sinToken });
  }
  if (!r.ok) throw new Error(await mensajeDe(r));
  if (r.status === 204) return null;
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

/* Los errores de la base vienen con nombres de tablas y de políticas. Eso le
   sirve a quien programa y no le dice nada a quien juega, así que los tres
   que van a pasar de verdad se traducen. El resto pasa como está: inventar
   un mensaje amable para un error que no entendemos es peor que mostrarlo. */
async function mensajeDe(r) {
  let d = {}; try { d = JSON.parse(await r.text()); } catch (e) {}
  const cru = d.message || d.error_description || d.msg || d.error || ("HTTP " + r.status);
  if (/duplicate key.*perfil_usuario/i.test(cru)) return "Ese nombre de usuario ya está tomado.";
  /* SOLO PARA EL EQUIPO. Antes esta línea agarraba CUALQUIER violación de
     política y contestaba lo mismo, y eso convirtió un error de crear un
     torneo en un "la fecha ya cerró" que no tenía nada que ver: media hora
     mirando el fantasy por un problema que estaba en otra tabla. Un mensaje
     amable y falso manda a buscar donde no es. */
  if (/violates row-level security|new row violates/i.test(cru)) {
    if (/"?equipo"?/i.test(cru)) return "La fecha ya cerró: no se puede cambiar el equipo.";
    return "El servidor no permitió esa operación. " + cru;
  }
  /* Los dos frenos del mail son distintos y decirles lo mismo a los dos hace
     perder una hora. Uno es una espera de segundos entre pedidos al mismo
     mail; el otro es el tope por hora de todo el proyecto, que en el plan
     gratis es bajo. Insistir con el segundo solo lo empeora.             */
  const seg = cru.match(/after (\d+) seconds?/i);
  if (seg) return "Esperá " + seg[1] + " segundos y pedilo de nuevo.";
  if (/rate limit|too many/i.test(cru))
    return "Se llegó al tope de mails por hora. Hay que esperar un rato: " +
           "insistir ahora no sirve.";
  return cru;
}

/* ─── entrar y salir ─────────────────────────────────────────────────────── */

/* ══════════════════ CÓMO SE ENTRA ══════════════════

   Empezamos solo con el link por mail: la contraseña que no guardamos es la
   que no podemos perder, y era una cosa menos que inventar para alguien que
   solo quiere jugar una fecha. Sigue siendo un buen argumento y el link
   sigue estando. Pero el link tiene dos fallas que en la práctica pesan
   más, y las dos las sufrimos:

   1. DEPENDE DE UNA CONFIGURACIÓN QUE NO SE VE. Supabase solo redirige a
      las direcciones de su lista blanca; si la de destino no está, manda a
      la Site URL. La persona vuelve a una página que no es la suya, sin
      sesión, sin ningún error. Parece que el link no anda.

   2. EL NAVEGADOR DEL MAIL NO ES EL NAVEGADOR. En el teléfono, tocar un
      link en Gmail lo abre en el navegador interno de Gmail. La sesión
      queda guardada AHÍ. La persona vuelve a Chrome y no está: hizo todo
      bien y no entró.

   Ninguna de las dos se arregla con código nuestro, y las dos se evitan
   entrando con contraseña, que no sale de la pantalla en la que estás.

   Así que ahora hay las dos: la contraseña es el camino principal y el
   link queda para el que la olvidó. La contraseña no la guardamos nosotros
   —la guarda Supabase, hasheada— y acá nunca se escribe en ningún lado.  */

const MAIL_OK = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const limpiarMail = e => String(e || "").trim().toLowerCase();

/* Seis es el mínimo que acepta Supabase. Pedir más acá y que el servidor
   pida menos no protege a nadie: solo hace que la app rechace algo que el
   servidor habría aceptado, y esa diferencia se nota como un error raro. */
export const CLAVE_MINIMA = 6;

function guardarSesionDe(d) {
  if (!d?.access_token) return null;
  sesion = guardado.poner({ token: d.access_token, refresh: d.refresh_token,
                            uid: uidDe(d.access_token) });
  return sesion;
}

export async function crearCuenta(email, clave) {
  const e = limpiarMail(email);
  if (!MAIL_OK(e)) throw new Error("Ese mail no parece un mail.");
  if (String(clave || "").length < CLAVE_MINIMA)
    throw new Error("La contraseña necesita al menos " + CLAVE_MINIMA + " caracteres.");
  const d = await pedir("/auth/v1/signup", { metodo: "POST", sinToken: true,
    cuerpo: { email: e, password: clave } });
  /* Si el proyecto pide confirmar el mail, `signup` NO devuelve sesión:
     devuelve el usuario y manda un correo. Hay que decirlo, porque si no la
     pantalla se queda como si no hubiera pasado nada. */
  const s = guardarSesionDe(d);
  return { sesion: s, confirmar: !s };
}

export async function entrarConClave(email, clave) {
  const e = limpiarMail(email);
  if (!MAIL_OK(e)) throw new Error("Ese mail no parece un mail.");
  const d = await pedir("/auth/v1/token?grant_type=password", { metodo: "POST",
    sinToken: true, cuerpo: { email: e, password: clave } });
  const s = guardarSesionDe(d);
  if (!s) throw new Error("Mail o contraseña incorrectos.");
  return s;
}

/* El link por mail. Queda para el que se olvidó la contraseña y para el que
   prefiere no inventar una. */
export async function pedirLink(email, volverA) {
  const e = limpiarMail(email);
  if (!MAIL_OK(e)) throw new Error("Ese mail no parece un mail.");
  await pedir("/auth/v1/otp", { metodo: "POST", sinToken: true,
    cuerpo: { email: e, create_user: true, options: { email_redirect_to: volverA } } });
  return e;
}

/* Al volver del mail, Supabase manda los tokens en el hash de la dirección.
   Ojo con esto: el hash es TAMBIÉN donde viaja el pronóstico de "Armá el
   11". Por eso se consume y se limpia en cuanto se lee —si quedara puesto,
   el próximo que abra el link se llevaría la sesión de otro en un reenvío
   de WhatsApp— y si el hash no trae tokens, no se toca. */
export function capturarVuelta(loc = window.location, hist = window.history) {
  const h = (loc.hash || "").replace(/^#/, "");
  if (!h || !/access_token=/.test(h)) return null;
  const p = new URLSearchParams(h);
  const token = p.get("access_token"), refresh = p.get("refresh_token");
  if (!token) return null;
  sesion = guardado.poner({ token, refresh, uid: uidDe(token) });
  try { hist.replaceState(null, "", loc.pathname + loc.search); } catch (e) {}
  return sesion;
}

/* El uid viene adentro del token, en el medio, en base64. No se valida acá:
   validarlo es tarea del servidor en cada pedido. Esto es solo para saber a
   quién mostrarle sus propias cosas.                                     */
function uidDe(token) {
  try {
    const medio = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(medio)))).sub || null;
  } catch (e) { return null; }
}

/* ─── RENOVAR: DOS ERRORES QUE ECHABAN A LA GENTE ─────────────────────────

   1. DE A UNA POR VEZ. El refresh token de Supabase es de UN SOLO USO: al
      canjearlo, el anterior deja de valer. La pantalla dispara varios
      pedidos juntos —el usuario, el premium, los torneos, la tabla de cada
      torneo— así que al vencer el token de una hora, todos daban 401 al
      mismo tiempo y todos intentaban renovar con el MISMO refresh. El
      primero funcionaba; los demás recibían "ya usado" y, con el código de
      antes, cerraban la sesión. Eso es exactamente "entrás y al rato se
      cae": no se caía sola, la cerrábamos nosotros.

      La promesa compartida arregla eso: el que llega segundo espera la
      renovación del primero en vez de pedir la suya.

   2. UN ERROR DE RED NO ES UNA SESIÓN VENCIDA. Antes, cualquier excepción
      —el subte, el ascensor, un timeout— terminaba en `salir()`, que borra
      el token del teléfono. Perder la sesión por pasar debajo de un puente
      es perderla para siempre: hay que volver a pedir el mail.

      Ahora solo se cierra si el servidor DIJO que ese refresh no sirve. En
      cualquier otro caso se deja la sesión como estaba y se reintenta en el
      próximo pedido.                                                      */
let renovando = null;

const REFRESH_MURIO = /invalid|expired|revoked|not.?found|already used/i;

function renovar() {
  if (renovando) return renovando;
  if (!sesion?.refresh) return Promise.resolve(null);
  const antes = sesion;
  renovando = (async () => {
    try {
      const d = await pedir("/auth/v1/token?grant_type=refresh_token", {
        metodo: "POST", sinToken: true, cuerpo: { refresh_token: antes.refresh } });
      if (!d?.access_token) return null;
      sesion = guardado.poner({ token: d.access_token, refresh: d.refresh_token,
                                uid: uidDe(d.access_token) });
      return sesion;
    } catch (e) {
      if (REFRESH_MURIO.test(e.message || "")) { salir(); return null; }
      sesion = antes;                       /* fue la red: no se toca nada */
      return null;
    } finally { renovando = null; }
  })();
  return renovando;
}

/* Cuánto le queda al token, en segundos. Sale del propio token, que lleva su
   vencimiento adentro. Si no se puede leer, se contesta 0 y el que llama
   renueva: renovar de más es barato, quedarse corto echa a alguien. */
function leSobra(token) {
  try {
    const medio = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const exp = JSON.parse(decodeURIComponent(escape(atob(medio)))).exp;
    return exp ? exp - Math.floor(Date.now() / 1000) : 0;
  } catch (e) { return 0; }
}

/* Renovar ANTES de disparar la tanda de pedidos, no después de que fallen.
   Es la diferencia entre una sesión que se renueva sola y una que se cae y
   se recupera —a veces— con un parpadeo en la pantalla.                  */
export async function asegurarSesion() {
  if (!sesion?.token) return null;
  if (leSobra(sesion.token) > 90) return sesion;
  return (await renovar()) || sesion;
}

export function salir() { sesion = guardado.poner(null); }

/* ─── el perfil ──────────────────────────────────────────────────────────── */

export async function miUsuario() {
  if (!sesion?.uid) return null;
  const f = await pedir("/rest/v1/perfil?select=usuario&id=eq." + sesion.uid);
  return f?.[0]?.usuario || null;
}

export function usuarioValido(u) {
  return /^[a-z0-9_]{3,16}$/.test(String(u || "").trim().toLowerCase());
}

export async function elegirUsuario(u) {
  const n = String(u || "").trim().toLowerCase();
  if (!usuarioValido(n))
    throw new Error("Entre 3 y 16 caracteres: letras sin acento, números y guión bajo.");
  await pedir("/rest/v1/perfil", { metodo: "POST",
    cabeceras: { Prefer: "resolution=merge-duplicates" },
    cuerpo: { id: sesion.uid, usuario: n } });
  return n;
}

/* ─── el equipo de la fecha ──────────────────────────────────────────────── */

export const fechaAbierta = async () => {
  const f = await pedir("/rest/v1/fechas?select=*&cierra=gt.now&order=numero.asc&limit=1");
  return f?.[0] || null;
};

export async function guardarEquipo(fecha, e) {
  if (!sesion?.uid) throw new Error("Hay que entrar primero.");
  await pedir("/rest/v1/equipo", { metodo: "POST",
    cabeceras: { Prefer: "resolution=merge-duplicates" },
    cuerpo: { perfil: sesion.uid, fecha, titulares: e.titulares, suplentes: e.suplentes,
              capitan: e.capitan, vice: e.vice, gasto: e.gasto } });
}

export async function miEquipo(fecha) {
  if (!sesion?.uid) return null;
  const f = await pedir("/rest/v1/equipo?select=*&fecha=eq." + fecha + "&perfil=eq." + sesion.uid);
  return f?.[0] || null;
}

export const misPuntos = async () => sesion?.uid
  ? pedir("/rest/v1/puntaje?select=fecha,puntos,detalle&perfil=eq." + sesion.uid + "&order=fecha.desc")
  : [];

/* ─── las ligas de amigos ────────────────────────────────────────────────── */

/* El código lo arma el servidor, no el navegador: si lo armara el navegador,
   dos personas creando una liga en el mismo segundo podrían chocar y la
   base rechazaría a la segunda sin explicación. Acá se propone uno y, si ya
   existe, se prueba otro. Cinco intentos son de sobra.                    */
/* ── CREAR UN TORNEO ──────────────────────────────────────────────────────
   UNA SOLA LLAMADA, y no dos inserts seguidos. Los dos inserts estaban
   ROTOS y ninguna prueba lo vio, porque las nuestras leen el SQL y no lo
   corren contra una base de verdad:

   El primero pedía `Prefer: return=representation`. Para devolver la fila,
   Postgres tiene que poder LEERLA, y la política de lectura de `liga` es
   "soy miembro" — que en ese instante es falsa, porque la fila de miembro
   se insertaba después. El insert entraba y la lectura lo rebotaba con un
   error de política, que esta misma capa traducía —mal— a "la fecha ya
   cerró". Un mensaje amable y falso es peor que uno feo y cierto.

   Y eran dos pedidos: si el segundo no llegaba, quedaba un torneo sin
   ningún miembro, invisible hasta para el que lo había creado.

   Ahora los dos pasan adentro de `crear_liga`, en una transacción, igual
   que `entrar_a_liga`. El código lo sortea el servidor.                  */
export async function crearLiga(nombre) {
  if (!sesion?.uid) throw new Error("Hay que entrar primero.");
  const n = String(nombre || "").trim();
  if (n.length < 3 || n.length > 40) throw new Error("El nombre va entre 3 y 40 caracteres.");
  const f = await pedir("/rest/v1/rpc/crear_liga", {
    metodo: "POST", cuerpo: { p_nombre: n } });
  const liga = f?.[0];
  if (!liga) throw new Error("No pude crear el torneo, probá de nuevo.");
  return liga;
}

/* Sin vocales: así ningún código sale diciendo una palabra que después haya
   que explicar. Y sin 0/O ni 1/I, que se confunden al dictarlos.        */
const ALFABETO = "BCDFGHJKLMNPQRSTVWXYZ23456789";
export const codigoAlAzar = (n = 6, azar = Math.random) =>
  Array.from({ length: n }, () => ALFABETO[Math.floor(azar() * ALFABETO.length)]).join("");

export const entrarALiga = codigo =>
  pedir("/rest/v1/rpc/entrar_a_liga", { metodo: "POST",
    cuerpo: { cod: String(codigo || "").trim().toUpperCase() } });

export const misLigas = () => sesion?.uid ? pedir("/rest/v1/liga?select=*") : [];

/* ─── el premium ───────────────────────────────────────────────────────────
   Se LEE, nunca se escribe. La columna tiene el permiso de escritura
   revocado en la base, así que ni siquiera es una cuestión de confianza: un
   update desde acá lo rechaza Postgres.

   Es una fecha y no un sí/no, para que se venza solo. Y la comparación se
   hace contra el reloj del TELÉFONO, que se puede mover: eso alcanza para
   pintar la pantalla, pero cualquier cosa que de verdad importe —guardar,
   cobrar, puntuar— la tiene que volver a revisar el servidor. Acá es
   decoración informada, no una cerradura.                                */
export async function miPremium() {
  if (!sesion?.uid) return null;
  const f = await pedir("/rest/v1/perfil?select=premium_hasta&id=eq." + sesion.uid);
  const hasta = f?.[0]?.premium_hasta || null;
  return { hasta, activo: !!hasta && new Date(hasta) > new Date() };
}

/* Los precios los pide al servidor, no los tiene escritos. Si estuvieran
   acá y allá, el día que cambie uno la app va a mostrar un precio y Mercado
   Pago va a cobrar otro, y esa persona nunca más compra nada.

   VA CON `Authorization`, NO SOLO CON `apikey`. Las funciones tienen su
   propia puerta antes del código: Supabase revisa el token y contesta
   "Missing authorization header" SIN LLEGAR A EJECUTAR NADA. Con la clave
   pública sola en `apikey`, esa puerta no se abre — y el efecto habría sido
   invisible, porque acá abajo un pedido que falla devuelve lista vacía y la
   pantalla simplemente no muestra ningún plan. Un botón que no aparece no
   se parece a un error.

   La clave pública sirve para esto: es un token válido y no autoriza a
   nada. Cuando alguien compra de verdad, ahí sí va el token de la persona,
   que es de donde la función saca a quién acreditarle.               */
export async function planesPremium() {
  const { url, anon } = cfg();
  if (!url) return [];
  const r = await fetch(url + "/functions/v1/crear-pago",
    { headers: { apikey: anon, Authorization: "Bearer " + anon } });
  if (!r.ok) return [];
  return (await r.json()).planes || [];
}

/* Devuelve la dirección de Mercado Pago a la que hay que mandar a la
   persona. No la abre: abrir una ventana desde una función que ya esperó a
   la red es lo que hace que el navegador la bloquee por "no la pidió
   nadie". Eso lo hace la pantalla, que sabe que hubo un dedo.            */
/* ─── EL CUPO DE SIMULACIONES ──────────────────────────────────────────────
   Diez por mes son gratis y llevan publicidad; de ahí en adelante hay que
   tener un plan.

   EL CONTADOR VIVE EN LA BASE. El que había era una variable de JavaScript:
   se borraba al recargar la página, o sea que el tope se reiniciaba solo.
   Acá se pregunta y se suma contra el servidor.

   `miCupo` mira sin gastar; `usarSimulacion` gasta una y devuelve cómo quedó.
   Las dos devuelven null sin sesión: el que no tiene cuenta no tiene cupo que
   consultar, y la pantalla resuelve ese caso mostrando el contador del
   navegador, que es aproximado y está bien que lo sea mientras nadie tenga
   motivo para esquivarlo.                                                  */
export async function miCupo() {
  if (!sesion?.uid) return null;
  const f = await pedir("/rest/v1/rpc/mi_cupo", { metodo: "POST", cuerpo: {} });
  return f?.[0] || { plan: "gratis", usadas: 0 };
}

export async function usarSimulacion() {
  if (!sesion?.uid) return null;
  const f = await pedir("/rest/v1/rpc/sumar_simulacion", { metodo: "POST", cuerpo: {} });
  return f?.[0] || null;
}

export async function linkDePago(plan = "chico") {
  if (!sesion?.uid) throw new Error("Hay que entrar primero.");
  const { url, anon } = cfg();
  const r = await fetch(url + "/functions/v1/crear-pago", {
    method: "POST",
    headers: { apikey: anon, Authorization: "Bearer " + sesion.token,
               "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.link) throw new Error(d.error || "No pude armar el pago.");
  return d.link;
}

/* ─── LAS FASES ────────────────────────────────────────────────────────────
   El calendario es público —saber que la fase 2 va de la 13 a la 17 no dice
   nada de nadie— pero las zonas solo las ve el que está adentro, y la tabla
   sale de una función que devuelve usuarios y puntos: los uuid de perfil no
   se leen desde ningún teléfono.                                          */
export const fases = () => pedir("/rest/v1/fase?select=*&order=numero.asc");

export const misZonas = () => sesion?.uid
  ? pedir("/rest/v1/zona?select=id,nombre,fase")
  : [];

export const tablaDeZona = (zona, fecha = null) =>
  pedir("/rest/v1/rpc/tabla_zona", { metodo: "POST", cuerpo: { z: zona, f: fecha } });

export const tablaDeLiga = (liga, fecha = null) =>
  pedir("/rest/v1/rpc/tabla_liga", { metodo: "POST", cuerpo: { l: liga, f: fecha } });

/* ─── borrar la cuenta ─────────────────────────────────────────────────────
   Google Play lo exige para toda app con registro, pero antes que eso es lo
   mínimo decente: el que entregó su mail tiene que poder retirarlo sin
   escribirle a nadie y sin esperar respuesta.

   No lleva parámetros a propósito. El servidor borra al que pidió y a nadie
   más; acá no hay forma de nombrar a otro.

   Después de borrar se cierra la sesión en el acto. Si no, el teléfono
   seguiría con un token de un usuario que ya no existe y cada pantalla
   fallaría con un error distinto en vez de mostrar la app como recién
   instalada.                                                             */
export async function borrarMiCuenta() {
  if (!sesion?.uid) throw new Error("Hay que entrar primero.");
  await pedir("/rest/v1/rpc/borrar_mi_cuenta", { metodo: "POST", cuerpo: {} });
  salir();
  return true;
}
