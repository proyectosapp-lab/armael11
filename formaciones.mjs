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

/* Pura: dado el cache de un club y la hora, dice qué partido está en
   ventana y si ya tenemos su formación. Se prueba sin red. */
export function enVentana(cache, ahora = new Date(), ventana = VENTANA) {
  const claveFx = Object.keys(cache).find(k => k.startsWith("/fixtures?team="));
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
    const v = enVentana(cache, AHORA);
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
