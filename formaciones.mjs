/* ══════════════════════════════════════════════════════════════════════════
   FORMACIONES — la ronda corta: ¿salió el once del DT?

   Fausto: "la simulación del DT debería poder hacerse ANTES del partido;
   después ya no tiene gracia". Tiene razón, y el problema era de reloj: las
   formaciones oficiales aparecen en la API una hora antes del pitazo, y la
   corrida completa pasa cada tres horas y solo baja las de los partidos ya
   terminados. Para cuando el sitio las tenía, el partido había terminado.

   Esto corre cada quince minutos y hace UNA cosa: mira, club por club, si el
   próximo partido está por empezar -entre dos horas antes y una hora
   después-, y si sí, pide la formación. Si la API la tiene, la mete en el
   cache del club con la MISMA clave que la app ya busca, y avisa que hay
   que publicar. Si no hay nada, termina en veinte segundos y no publica.

   Cuesta muy poco: un pedido por partido en ventana, cada quince minutos,
   durante tres horas. Un domingo con ocho partidos son unos cien pedidos en
   todo el día, sobre 7.500.

   Lo que escribe queda en el cache del workflow (sitio/datos), así que la
   ronda siguiente ya lo ve y no lo vuelve a pedir. Y la corrida completa
   también pide la formación del próximo, así que si datos-juego rehace el
   cache del club, no se pierde.

   ── Y AHORA, TODAS LAS LIGAS ─────────────────────────────────────────────
   Hasta el 18/9/2026 esto miraba solo los treinta clubes argentinos, porque
   el once del DT vivía en el cache del club y las otras ligas no tienen
   página propia. Pero el simulador ya juega once ligas, y el momento que
   vale —"salió el once, ¿con el mío ganaba?"— es el mismo en Old Trafford
   que en Alberdi.

   Los partidos de las otras ligas salen de `sitio/datos/liga-<slug>.js`, que
   trae el calendario. Las formaciones NO se guardan ahí: ese archivo lo
   rehace la corrida completa una vez por día y se llevaría puesto lo que
   esta ronda acaba de traer. Van en un archivo aparte, `onces-<slug>.js`,
   que se acumula y se poda solo: lo de hace más de dos días se tira, porque
   un once viejo no le sirve a nadie y el archivo crecería para siempre.

     node formaciones.mjs          usa API_FOOTBALL_KEY
     node formaciones.mjs --ahora "2026-09-07T20:00:00Z"   (para probar)
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { avisarClub } from "./avisos.mjs";

const aca = p => new URL(p, import.meta.url);
const KEY = process.env.API_FOOTBALL_KEY || "";
const BASE = "https://v3.football.api-sports.io";

/* La ventana. Las formaciones suelen salir 60 a 75 minutos antes; se mira
   desde dos horas antes por si alguna sale temprano, y hasta una hora
   después por si la API la carga tarde -que pasa-. */
export const VENTANA = { antesMin: 120, despuesMin: 60 };

const argAhora = process.argv.indexOf("--ahora");
const AHORA = argAhora > 0 ? new Date(process.argv[argAhora + 1]) : new Date();

const JUGADO = f => ["FT", "AET", "PEN"].includes(f.fixture.status.short);

/* El cache de un club es un archivo JS: `window.CACHE = {...};`. Se lee y se
   escribe con el mismo formato que datos-juego, sin tocar nada más. */
export function leerCache(ruta) {
  const t = readFileSync(ruta, "utf8");
  const ini = t.indexOf("{"), fin = t.lastIndexOf("}");
  return JSON.parse(t.slice(ini, fin + 1));
}
export function escribirCache(ruta, cache) {
  writeFileSync(ruta, "window.CACHE = " + JSON.stringify(cache) + ";\n");
}

/* ── LOS ONCES DE LAS OTRAS LIGAS ────────────────────────────────────────
   Un archivo por liga, con los partidos como claves. `f` es la fecha del
   partido —la necesita la poda— y `o` la respuesta cruda de la API, tal cual
   la espera la app.

   Se escribe con `Object.assign` y no con una asignación: las once ligas
   escriben sobre el mismo objeto, y la que cargara última se llevaría
   puestas a las otras diez. El JSON arranca en su propia línea para poder
   leerlo de vuelta sin evaluar nada. */
const CABEZA_ONCES = "window.ONCES=window.ONCES||{};\nObject.assign(window.ONCES,\n";

export function escribirOnces(ruta, onces) {
  writeFileSync(ruta, CABEZA_ONCES + JSON.stringify(onces) + "\n);\n");
}
export function leerOnces(ruta) {
  if (!existsSync(ruta)) return {};
  const t = readFileSync(ruta, "utf8");
  const i = t.indexOf("\n{"), f = t.lastIndexOf("}");
  if (i < 0 || f < i) return {};
  try { return JSON.parse(t.slice(i + 1, f + 1)); } catch (e) { return {}; }
}

/* De la respuesta de la API se guarda SOLO lo que la app usa: el equipo, el
   dibujo y los once con nombre y puesto. La respuesta entera trae banco,
   cuerpo técnico, fotos y coordenadas —cinco kilobytes por partido—, y esto
   no es un cache de servidor: es un archivo que baja TODO el que abre la
   app. Con esto queda en menos de uno. La forma es la misma que da la API,
   así que la app no se entera. */
export function flaco(formaciones) {
  return (formaciones || []).map(t => ({
    team: { id: t.team?.id, name: t.team?.name },
    formation: t.formation || "",
    startXI: (t.startXI || []).map(x => ({
      player: { id: x.player?.id, name: x.player?.name, pos: x.player?.pos },
    })),
  })).filter(t => t.startXI.length);
}

/* Pura: saca lo viejo. Sin esto el archivo crece una formación por partido
   para siempre y la app termina bajando medio año de onces que ya no le
   importan a nadie. Un día: pasado el partido, el once del DT de las otras
   ligas no se usa para nada -la comparación con lo que pasó es solo de los
   clubes argentinos, que tienen su propio cache-. */
export function podarOnces(onces, ahora = new Date(), horas = 24) {
  const out = {};
  for (const [id, e] of Object.entries(onces || {})) {
    const t = new Date(e?.f || 0).getTime();
    if (isFinite(t) && t > 0 && (ahora - t) / 36e5 <= horas) out[id] = e;
  }
  return out;
}

/* Pura: de los partidos de una liga, los que están por empezar. Misma
   ventana que la de los clubes. El archivo de liga solo trae partidos por
   jugar, así que no hay estado que mirar: alcanza con el reloj. */
export function partidosEnVentana(partidos, ahora = new Date(), ventana = VENTANA) {
  return (partidos || []).filter(p => {
    const min = (new Date(p.fecha) - ahora) / 6e4;
    return isFinite(min) && min <= ventana.antesMin && min >= -ventana.despuesMin;
  }).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

/* El archivo de una liga es `window.LIGAS[...]={...};`. Se lee el objeto sin
   evaluar nada: el primer `{` que viene después del `]=`. */
export function leerLiga(ruta) {
  const t = readFileSync(ruta, "utf8");
  const marca = t.indexOf("]=");
  const ini = t.indexOf("{", marca < 0 ? 0 : marca);
  const fin = t.lastIndexOf("}");
  return JSON.parse(t.slice(ini, fin + 1));
}

/* Pura: dado el cache de un club y la hora, dice qué partido está en
   ventana y si ya tenemos su formación. Se prueba sin red. */
export function enVentana(cache, ahora = new Date(), ventana = VENTANA, apiId = null) {
  /* ── POR QUÉ NO ALCANZA CON EL PRIMER `/fixtures?team=` ────────────────
     El cache de un club NO trae solo los partidos del club: `datos-juego`
     baja también los del RIVAL, para armarle el plantel (y los de dos
     rivales distintos, porque mira el próximo partido y el último). O sea
     que acá adentro hay dos o tres claves que empiezan igual.

     Hasta el 19/9 esto agarraba la primera que encontraba. Funcionaba por
     una casualidad —el club se guarda antes que el rival, y `Object.keys`
     respeta el orden de inserción— y esa casualidad no está escrita en
     ningún lado. El día que algo reordene el archivo, la ronda corta
     empieza a mirar el calendario del rival: no tira error, no rompe una
     prueba, simplemente el once del DT deja de salir para ese club y nadie
     entiende por qué. Es exactamente la clase de falla silenciosa que ya
     nos costó una noche con `hayRed`.

     Con el `apiId` del club se elige la clave que corresponde. El respaldo
     al primero se queda por si algún cache viejo no matchea. */
  const claves = Object.keys(cache).filter(k => k.startsWith("/fixtures?team="));
  const claveFx = (apiId && claves.find(k => k.startsWith("/fixtures?team=" + apiId + "&"))) || claves[0];
  if (!claveFx) return null;
  const proximo = (cache[claveFx] || [])
    .filter(f => !JUGADO(f))
    .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))[0];
  if (!proximo) return null;
  const min = (new Date(proximo.fixture.date) - ahora) / 6e4;   /* minutos hasta el pitazo */
  if (min > ventana.antesMin || min < -ventana.despuesMin) return null;
  const clave = "/fixtures/lineups?fixture=" + proximo.fixture.id;
  const tiene = Array.isArray(cache[clave]) && cache[clave].length > 0;
  return { fixture: proximo, clave, tiene, faltanMin: Math.round(min) };
}

async function api(clave) {
  const r = await fetch(BASE + clave, { headers: { "x-apisports-key": KEY } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j.errors && !Array.isArray(j.errors) && Object.keys(j.errors).length)
    throw new Error(Object.values(j.errors).join(" · "));
  return j.response || [];
}

/* Avisarle al workflow. GitHub lee $GITHUB_OUTPUT; en una máquina común no
   existe y no pasa nada. */
function salida(nombre, valor) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, nombre + "=" + valor + "\n");
}

/* ── EL AVISO AL TELÉFONO ────────────────────────────────────────────────
   Se manda acá, en el mismo momento en que se guarda la formación, y antes
   de que el sitio se publique: el que toca la notificación llega a la app
   uno o dos minutos después, cuando Pages ya terminó. Si falta la clave
   privada o la de servicio, no se manda y se dice por qué; la formación se
   guarda igual. */
async function avisar(club, fixture, formaciones) {
  let SITIO = {};
  try { SITIO = JSON.parse(readFileSync(aca("./sitio.json"))); } catch (e) {}
  const privada = process.env.VAPID_PRIVATE_KEY || "";
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || "";
  const publica = SITIO.avisos?.vapidPublica, contacto = SITIO.avisos?.contacto || "mailto:hola@armael11.com";
  const supabaseUrl = SITIO.supabase?.url;
  if (!privada || !serviceKey || !publica || !supabaseUrl) {
    console.log("    (sin aviso: falta " + [!privada && "VAPID_PRIVATE_KEY", !serviceKey && "SUPABASE_SERVICE_KEY",
      !publica && "avisos.vapidPublica en sitio.json", !supabaseUrl && "supabase.url"].filter(Boolean).join(", ") + ")");
    return;
  }
  const mio = formaciones.find(f => f.team?.id === club.apiId);
  const rival = fixture.teams.home.id === club.apiId ? fixture.teams.away.name : fixture.teams.home.name;
  const dominio = SITIO.dominio ? "https://" + SITIO.dominio : (SITIO.url || "");
  try {
    const r = await avisarClub({
      supabaseUrl, serviceKey, vapid: { publica, privada, contacto }, club: club.id,
      titulo: "Salió el once de " + club.nom,
      cuerpo: (mio?.formation ? "El DT puso " + mio.formation + " contra " + rival : "Contra " + rival) +
              ". Simulalo contra el tuyo antes del partido.",
      url: dominio + "/" + club.id + ".html",
      log: m => console.log(m),
    });
    console.log("    aviso: " + r.llegaron + " de " + r.total + " entregados" + (r.bajas ? ", " + r.bajas + " dados de baja" : ""));
  } catch (e) { console.log("    aviso falló: " + e.message); }
}

/* Las ligas que hoy están en el sitio. Se parte de ligas.json -la lista de
   verdad- y se queda con las que tienen archivo bajado: una liga sin
   calendario no tiene partidos que mirar. */
function ligasConArchivo() {
  let slugs = [];
  try { slugs = (JSON.parse(readFileSync(aca("./ligas.json"))).ligas || []).map(L => L.slug); }
  catch (e) { return []; }
  return slugs.filter(s => existsSync(aca("./sitio/datos/liga-" + s + ".js")));
}

async function main() {
  const CLUBES = JSON.parse(readFileSync(aca("./clubes.json")));
  const linea = "─".repeat(70);
  console.log("\n" + linea + "\n  FORMACIONES · " + AHORA.toISOString().slice(0, 16).replace("T", " ") + " UTC\n" + linea);

  const pedidos = new Map();     /* un pedido por partido, aunque jueguen dos clubes nuestros */
  const nuevas = [];
  let enJuego = 0;

  for (const club of CLUBES) {
    const ruta = aca("./sitio/datos/cache-" + club.id + ".js");
    if (!existsSync(ruta)) continue;
    let cache; try { cache = leerCache(ruta); } catch (e) { continue; }
    const v = enVentana(cache, AHORA, VENTANA, club.apiId);
    if (!v) continue;
    enJuego++;
    const rival = v.fixture.teams.home.name + " vs " + v.fixture.teams.away.name;
    if (v.tiene) { console.log("  = " + club.nom.padEnd(22) + rival + "  · ya está"); continue; }
    if (!KEY) { console.log("  ? " + club.nom.padEnd(22) + rival + "  · sin key, no pido"); continue; }

    if (!pedidos.has(v.clave)) pedidos.set(v.clave, api(v.clave).catch(e => ({ error: e.message })));
    const datos = await pedidos.get(v.clave);
    if (datos && datos.error) { console.log("  ✗ " + club.nom.padEnd(22) + datos.error); continue; }
    if (!datos.length) {
      console.log("  · " + club.nom.padEnd(22) + rival + "  · todavía no salió (" +
                  (v.faltanMin >= 0 ? "faltan " + v.faltanMin + " min" : "empezó hace " + (-v.faltanMin) + " min") + ")");
      continue;
    }
    cache[v.clave] = datos;
    escribirCache(ruta, cache);
    nuevas.push(club.nom);
    console.log("  ✓ " + club.nom.padEnd(22) + rival + "  · SALIÓ EL ONCE, guardado");
    await avisar(club, v.fixture, datos);
  }

  /* ── LAS OTRAS LIGAS ──────────────────────────────────────────────────
     Mismo criterio, otro origen: el calendario sale del archivo de la liga
     y lo bajado va a `onces-<slug>.js`. No se manda aviso al teléfono: los
     avisos son por club y nadie se suscribió al Bayern.

     El tope es un seguro, no un plan. Un domingo con las once ligas
     jugando al mismo tiempo son unos cuarenta partidos en ventana; el tope
     está para que un archivo de liga roto -mil partidos con fecha de hoy-
     no se coma la cuota del día en una sola ronda. */
  const TOPE = 60;
  let pedidosDeLiga = 0;
  for (const slug of ligasConArchivo()) {
    const rutaLiga = aca("./sitio/datos/liga-" + slug + ".js");
    let L; try { L = leerLiga(rutaLiga); } catch (e) { continue; }
    const enVent = partidosEnVentana(L.partidos, AHORA);
    if (!enVent.length) continue;

    const rutaOnces = aca("./sitio/datos/onces-" + slug + ".js");
    const antes = leerOnces(rutaOnces);
    let onces = podarOnces(antes, AHORA);
    let cambio = Object.keys(onces).length !== Object.keys(antes).length;
    let nuevasAca = 0, yaEstaban = 0, sinSalir = 0, fallo = "";
    const nombreLiga = L.nombre || slug;

    for (const p of enVent) {
      enJuego++;
      const guardado = onces[String(p.id)];
      if (guardado && (guardado.o || []).length) { yaEstaban++; continue; }
      if (!KEY) { sinSalir++; continue; }
      if (pedidosDeLiga >= TOPE) { fallo = "corté acá: ya pedí " + TOPE + " en esta ronda"; break; }

      const clave = "/fixtures/lineups?fixture=" + p.id;
      if (!pedidos.has(clave)) { pedidos.set(clave, api(clave).catch(e => ({ error: e.message }))); pedidosDeLiga++; }
      const datos = await pedidos.get(clave);
      if (datos && datos.error) { fallo = datos.error; continue; }
      if (!datos.length) { sinSalir++; continue; }               /* todavía no salió */

      const once = flaco(datos);
      if (!once.length) { sinSalir++; continue; }
      onces[String(p.id)] = { f: p.fecha, o: once };
      cambio = true; nuevasAca++;
    }

    if (cambio) escribirOnces(rutaOnces, onces);
    if (nuevasAca) nuevas.push(nombreLiga + " (" + nuevasAca + ")");
    /* Una línea por liga y no una por partido: un domingo con las once
       ligas jugando, el detalle partido por partido son cuarenta renglones
       que nadie lee. */
    console.log("  " + (nuevasAca ? "✓ " : "· ") + nombreLiga.padEnd(22) +
      enVent.length + " en ventana" +
      (nuevasAca ? " · " + nuevasAca + " ONCE(S) NUEVO(S)" : "") +
      (yaEstaban ? " · " + yaEstaban + " ya estaban" : "") +
      (sinSalir ? " · " + sinSalir + (KEY ? " sin salir todavía" : " sin key, no pido") : "") +
      (fallo ? "  ⚠ " + fallo : ""));
  }

  console.log(linea);
  if (!enJuego) console.log("  Ningún partido en ventana. No hay nada que publicar.");
  else console.log("  " + enJuego + " en ventana · " + nuevas.length + " formación(es) nueva(s)" +
                   (nuevas.length ? ": " + nuevas.join(", ") : ""));
  console.log(linea + "\n");
  salida("formaciones_nuevas", nuevas.length);
  /* La marca que lee publicar.mjs. Un archivo y no la salida estándar,
     para que funcione igual acá que en GitHub. */
  if (nuevas.length) writeFileSync(aca("./.formaciones-nuevas"), nuevas.join("\n") + "\n");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) await main();
