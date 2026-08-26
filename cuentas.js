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
  if (/violates row-level security|new row violates/i.test(cru))
    return "La fecha ya cerró: no se puede cambiar el equipo.";
  if (/rate limit|too many/i.test(cru)) return "Probá de nuevo en un minuto.";
  return cru;
}

/* ─── entrar y salir ─────────────────────────────────────────────────────── */

/* Sin contraseñas: llega un link al mail y listo. La contraseña que no
   guardamos es la que no podemos perder — y es una cosa menos que inventar
   para alguien que solo quiere jugar una fecha.                          */
export async function pedirLink(email, volverA) {
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error("Ese mail no parece un mail.");
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

async function renovar() {
  try {
    const d = await pedir("/auth/v1/token?grant_type=refresh_token", {
      metodo: "POST", sinToken: true, cuerpo: { refresh_token: sesion.refresh } });
    if (!d?.access_token) return null;
    sesion = guardado.poner({ token: d.access_token, refresh: d.refresh_token, uid: uidDe(d.access_token) });
    return sesion;
  } catch (e) { salir(); return null; }
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
export async function crearLiga(nombre) {
  if (!sesion?.uid) throw new Error("Hay que entrar primero.");
  const n = String(nombre || "").trim();
  if (n.length < 3 || n.length > 40) throw new Error("El nombre va entre 3 y 40 caracteres.");
  for (let i = 0; i < 5; i++) {
    const codigo = codigoAlAzar();
    try {
      const f = await pedir("/rest/v1/liga", { metodo: "POST",
        cabeceras: { Prefer: "return=representation" },
        cuerpo: { nombre: n, codigo, dueno: sesion.uid } });
      const liga = f?.[0];
      await pedir("/rest/v1/liga_miembro", { metodo: "POST",
        cuerpo: { liga: liga.id, perfil: sesion.uid } });
      return liga;
    } catch (e) { if (!/duplicate key/i.test(e.message)) throw e; }
  }
  throw new Error("No pude crear la liga, probá de nuevo.");
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

export const tablaDeLiga = (liga, fecha = null) =>
  pedir("/rest/v1/rpc/tabla_liga", { metodo: "POST", cuerpo: { l: liga, f: fecha } });
