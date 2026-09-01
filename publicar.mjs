/* ══════════════════════════════════════════════════════════════════════════
   PUBLICAR — la corrida entera, en un solo lugar.

   Por qué existe este archivo y no está todo en el .yml de GitHub: la carpeta
   `.github` empieza con punto, así que el explorador de archivos la esconde y
   NO se sube arrastrando la carpeta al navegador. Ya nos pasó dos veces. La
   segunda fue peor que la primera, porque no falló: la corrida salió verde,
   el feed se actualizó, y el paso nuevo —el que arreglaba la tabla— no estaba
   en el archivo que GitHub leía. Todo parecía andar y la tabla seguía mal.

   Entonces el .yml queda mínimo y no se toca nunca más: llama a esto. Y esto
   vive en la raíz, que sí se sube con el resto.

     node publicar.mjs              todo
     node publicar.mjs --sin-red    solo las pruebas
   ══════════════════════════════════════════════════════════════════════════ */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { enHoraArgentina } from "./fantasy.mjs";
import { CADA_HORAS, hayQueCorrer, leerSellos, sellar, hayAlguno } from "./frescura.mjs";

const aca = p => new URL(p, import.meta.url);
const soloPruebas = process.argv.includes("--sin-red");
const hayKey = !!process.env.API_FOOTBALL_KEY;

const linea = "═".repeat(74);
let fallas = [];
let salteados = [];

/* ─── CUÁNTO SALE PUBLICAR ───────────────────────────────────────────────
   Una corrida completa son unos 1.200 pedidos a la API: las seis ligas son
   ~800, los treinta clubes ~400, y el resto calderilla. El workflow corre
   cada tres horas Y en cada push, así que una tarde de seis versiones
   publicadas sumó catorce corridas y se comió los 7.500 pedidos del día.

   Por eso ahora cada paso caro lleva su sello: si lo que produjo sigue ahí
   y se bajó hace poco, se saltea. Los sellos sobreviven de una corrida a la
   otra porque el workflow los guarda en su cache; sin eso, esto no serviría
   de nada.

   `Run workflow` a mano trae TODO igual. Es la salida de emergencia y está
   pensada para usarse poco: cuesta una corrida completa.               */
const SELLOS_EN = new URL("./.sellos.json", import.meta.url);
const sellos = leerSellos(SELLOS_EN);
const EVENTO = process.env.GITHUB_EVENT_NAME || "a mano";
const FORZAR = EVENTO === "workflow_dispatch" || process.argv.includes("--todo");
const dat = f => new URL("./sitio/datos/" + f, import.meta.url);
const datosDe = pre => { try {
  return readdirSync(new URL("./sitio/datos/", import.meta.url))
    .filter(f => f.startsWith(pre)).map(f => dat(f));
} catch (e) { return []; } };

/* `obligatorio` es lo que, si falla, no vale la pena publicar. El resto sigue:
   que YouTube no conteste no es razón para dejar el sitio sin feed.        */
function paso(nombre, script, { obligatorio = false, args = [], sello = null,
                               produce = [] } = {}) {
  /* El salteo va ANTES de imprimir el título: un paso que no corrió no
     merece un encabezado que parezca que corrió. */
  if (sello) {
    const q = hayQueCorrer({ sello: sellos[sello], ahora: Date.now(),
                             cada: CADA_HORAS[sello], forzar: FORZAR,
                             hayResultado: hayAlguno(produce) });
    if (!q.correr) {
      console.log("\n  ↷ " + nombre + ": " + q.porque);
      salteados.push(sello);
      return true;
    }
  }
  console.log("\n" + linea);
  console.log("  " + nombre);
  console.log(linea);
  const r = spawnSync(process.execPath, [script, ...args],
    { cwd: new URL(".", import.meta.url), stdio: "inherit", env: process.env });
  const ok = r.status === 0;
  if (!ok) {
    fallas.push(nombre);
    console.log("\n  ✗ " + nombre + " terminó con error " + r.status);
    if (obligatorio) {
      console.log("  Sin esto no se publica. Corto acá para no pisar lo que ya estaba.\n");
      process.exit(1);
    }
    console.log("  Sigo igual: esto no impide publicar.");
  }
  /* El sello se pone SOLO si salió bien. Sellar un paso que falló haría que
     la corrida siguiente lo saltee creyendo que hay datos frescos, y el
     error se volvería permanente sin que nada lo diga. */
  if (ok && sello) sellar(SELLOS_EN, sellos, sello);
  return ok;
}

/* ─── 0. ¿ESTÁN TODOS LOS ARCHIVOS? ──────────────────────────────────────
   Los archivos suben arrastrándolos al navegador, y ahí se pierden cosas:
   una carpeta que no se seleccionó, un archivo nuevo que quedó afuera. Sin
   esto, la corrida falla más adelante con un ENOENT en el medio de un log
   largo, y hay que ir a buscar qué archivo era. Con esto, dice cuál falta y
   corta en el primer renglón.

   Solo se listan los que TIENEN que estar sí o sí. Los generados —feeds,
   stats-liga, el cache del juego— no van acá: los hace la propia corrida. */
const IMPRESCINDIBLES = [
  "pipeline.mjs", "traer.mjs", "todos.mjs", "juego.js", "cuentas.js",
  "clubes.json", "medios.json", "sitio.json", "app.tpl.html",
  "construir-sitio.mjs", "datos-juego.mjs", "stats-api.mjs", "stats-calc.mjs",
  "resolver-youtube.mjs", "esquema.sql", "fantasy.mjs", "fantasy-api.mjs",
  "ligas.json", "ligas-api.mjs", "sw.js", "puntos-api.mjs",
  "fases.mjs", "fases-reglas.mjs", "fases.json",
  "funcion-crear-pago.ts", "funcion-pago-avisado.ts",
  "probar.mjs", "probar-clubes.mjs", "probar-once.mjs", "probar-stats.mjs",
  "probar-backend.mjs", "probar-cuentas.mjs", "probar-fantasy.mjs",
  "probar-pagos.mjs", "probar-fases.mjs", "probar-publicidad.mjs",
  "probar-frescura.mjs", "frescura.mjs",
];
const faltan = IMPRESCINDIBLES.filter(f => !existsSync(aca("./" + f)));
if (faltan.length) {
  console.log("\n" + linea);
  console.log("  FALTAN ARCHIVOS. No es un error del código: no llegaron al repo.");
  console.log(linea);
  faltan.forEach(f => console.log("    · " + f));
  console.log("\n  Abrí la carpeta descomprimida, seleccioná TODO lo de adentro");
  console.log("  (Ctrl+A) y arrastrá eso a GitHub. Todos los archivos van sueltos");
  console.log("  en la raíz: no hay ninguna carpeta que subir.\n");
  process.exit(1);
}

/* ─── 1. las pruebas ─────────────────────────────────────────────────────
   Van primero y son obligatorias. Si el pipeline está roto, publicar treinta
   feeds mal armados encima de los que estaban bien es peor que no publicar. */
for (const t of ["probar.mjs", "probar-clubes.mjs", "probar-once.mjs", "probar-stats.mjs",
                 "probar-backend.mjs", "probar-cuentas.mjs", "probar-fantasy.mjs",
                 "probar-pagos.mjs", "probar-fases.mjs", "probar-publicidad.mjs",
                 "probar-frescura.mjs"])
  paso("Pruebas · " + t, t, { obligatorio: true });

if (soloPruebas) { console.log("\n  Solo pruebas. Listo.\n"); process.exit(0); }

/* ─── 2. las fuentes ─────────────────────────────────────────────────────── */
paso("Resolver los canales de YouTube", "resolver-youtube.mjs");
paso("Traer las fuentes y armar los 30 feeds", "todos.mjs", { obligatorio: true });

/* ─── 3. lo que necesita la API key ──────────────────────────────────────── */
if (!hayKey) {
  console.log("\n" + linea);
  console.log("  Sin API_FOOTBALL_KEY: me salteo los datos del juego y la tabla.");
  console.log("  El sitio sale igual, pero el juego va a pedirle la key al usuario");
  console.log("  y la tabla va a ser la que quedó de la corrida anterior.");
  console.log(linea);
} else {
  paso("Bajar los datos del juego", "datos-juego.mjs",
       { sello: "juego", produce: datosDe("cache-") });
  /* No es obligatorio: sin las ligas el simulador sigue andando con el club
     de cada página y el selector simplemente no aparece.
     Es el paso MÁS CARO de todos —unos 800 pedidos— y el que menos cambia:
     el calendario de la próxima fecha de seis ligas se mueve una vez por
     semana. Por eso se rehace una vez por día y no ocho. */
  paso("Bajar las ligas para simular", "ligas-api.mjs",
       { sello: "ligas", produce: [dat("ligas.js")] });
  paso("Rehacer la tabla y los números", "stats-api.mjs",
       { sello: "tabla", produce: [new URL("./stats-liga.json", import.meta.url)] });
  /* No es obligatorio: si la fecha no se puede armar, el resto del sitio
     sale igual y la pestaña del fantasy simplemente no aparece. */
  paso("Publicar la próxima fecha del fantasy", "fantasy-api.mjs",
       { sello: "fantasy", produce: [new URL("./fecha-actual.json", import.meta.url)] });
  /* Después de publicar la próxima, puntuar la anterior. En este orden
     porque la que se puntúa ya terminó y la que se publica todavía no
     existe: no se pisan. Tampoco es obligatorio — una fecha sin puntuar se
     puntúa en la corrida siguiente. */
  paso("Puntuar la última fecha jugada", "puntos-api.mjs", { sello: "puntos", produce: ["."] });
  /* Y recién después de puntuar, ver si con eso se cerró una fase. El orden
     no es casual: una fase se cierra cuando su última fecha está PUNTUADA,
     así que preguntar antes de calcular siempre diría que no. */
  paso("Cerrar la fase si terminó y armar las zonas", "fases.mjs");
}

/* ─── 4. el sitio ────────────────────────────────────────────────────────── */
paso("Armar el sitio", "construir-sitio.mjs", { obligatorio: true });

/* ─── 5. decir en voz alta con qué se publicó ────────────────────────────
   La tabla vieja se publicó una semana sin que nadie se enterara, porque
   nada decía de qué día era el dato. Que lo diga el log.                 */
console.log("\n" + linea);
try {
  const st = JSON.parse(readFileSync(aca("./stats-liga.json")));
  const dias = Math.round((Date.now() - new Date(st.generado)) / 864e5);
  console.log("  TABLA: " + (st.oficial ? "la que publica la liga" : "calculada por nosotros") +
              " · generada hace " + dias + " día(s) · " + st.tabla.length + " equipos");
  const pj = [...new Set(st.tabla.map(t => t.pj))].sort((a, b) => a - b);
  console.log("  partidos jugados en la tabla: " + pj.join(", "));
  if (!st.oficial) console.log("  ⚠ NO es la tabla oficial. Revisá qué devolvió /standings.");
  if (dias > 3)    console.log("  ⚠ el dato tiene más de tres días. Algo no se está rehaciendo.");
} catch (e) { console.log("  ⚠ no pude leer stats-liga.json: " + e.message); }

try {
  const f = JSON.parse(readFileSync(aca("./fecha-actual.json")));
  /* La hora va en hora de Argentina a propósito: esto corre en un servidor
     de GitHub, que vive en UTC, y este renglón es lo único que se mira para
     saber si la fecha quedó bien. Decía "cierra 10:00" para un partido que
     empezaba a las 7 de la mañana. Un log que miente sobre la hora del
     cierre es peor que un log que no dice nada. */
  console.log("  FANTASY: fecha " + f.numero + " · " + (f.jugadores || []).length +
              " jugadores · cierra " + enHoraArgentina(f.cierra) + " (hora de Argentina)");
  if (!(f.jugadores || []).length)
    console.log("  ⚠ la fecha quedó SIN jugadores: la pestaña no va a aparecer.");
} catch (e) { console.log("  FANTASY: sin fecha publicada (la pestaña no aparece)"); }

try {
  const txt = readFileSync(aca("./sitio/datos/ligas.js"), "utf8");
  const ls = JSON.parse(txt.match(/=(\[[^\]]*\])/)[1]);
  console.log("  LIGAS: " + ls.length + " para simular · " + ls.join(", "));
  const sin = ls.filter(sl => {
    try { const t = readFileSync(aca("./sitio/datos/liga-" + sl + ".js"), "utf8");
          return !/"calibrada":\{/.test(t); } catch (e) { return true; }
  });
  if (sin.length) console.log("  ⚠ sin calibrar (van con los números de respaldo): " + sin.join(", "));
} catch (e) { console.log("  LIGAS: ninguna (el selector de otras ligas no aparece)"); }

/* Lo que Play exige. Si falta algo, la app no se puede empaquetar y eso se
   descubriría recién al subirla, que es el peor momento. */
const PARA_PLAY = [
  ["sw.js", "el service worker"],
  ["app.webmanifest", "el manifest de la app"],
  ["privacidad.html", "la política de privacidad"],
  ["borrar-cuenta.html", "la página para borrar la cuenta"],
  ["sitio-icono-512.png", "el ícono de 512"],
  ["sitio-icono-mask-512.png", "el ícono maskable"],
];
const faltaPlay = PARA_PLAY.filter(([f]) => !existsSync(aca("./sitio/" + f)));
console.log("  PLAY: " + (faltaPlay.length
  ? "falta " + faltaPlay.map(f => f[1]).join(", ")
  : "listo para empaquetar" +
    (existsSync(aca("./sitio/.well-known/assetlinks.json"))
      ? " · con assetlinks"
      : " · sin assetlinks todavía (falta la huella de la firma en sitio.json)")));

const cache = existsSync(aca("./sitio/datos/cache-talleres-cba.js"));
console.log("  JUEGO: " + (cache ? "con los datos bajados, sin API key en el navegador"
                                 : "SIN datos bajados: la app le va a pedir la key al usuario"));

console.log(linea);
if (salteados.length)
  console.log("  Se saltearon por estar frescos: " + salteados.join(", ") +
              "   (para traer todo, Run workflow a mano)");
console.log(fallas.length ? "  Terminó con " + fallas.length + " paso(s) fallado(s): " + fallas.join(", ")
                          : "  Todo bien.");

/* ─── EL AVISO QUE NOS FALTÓ ─────────────────────────────────────────────
   Los pasos que hablan con la API no son obligatorios: si no contesta, el
   sitio se publica igual en vez de no publicarse. Es la decisión correcta y
   tiene un costo que pagamos: la corrida sale VERDE con todo vacío, y eso
   puede quedar así durante días sin que nadie lo note.

   Si todo lo que depende de la API vino sin nada, no es mala suerte: es una
   sola causa. Y la más probable, con diferencia, es la cuota. */
if (hayKey) {
  const sinJuego  = !datosDe("cache-").length;
  const sinLigas  = !existsSync(dat("ligas.js"));
  const sinFecha  = !existsSync(new URL("./fecha-actual.json", import.meta.url));
  if (sinJuego && sinLigas && sinFecha) {
    console.log("\n" + linea);
    console.log("  ⚠⚠  TODO LO QUE DEPENDE DE LA API VINO VACÍO.");
    console.log(linea);
    console.log("  No es mala suerte: tres pasos independientes no fallan juntos.");
    console.log("  Lo más probable, con diferencia, es que se haya agotado la cuota");
    console.log("  diaria de API-Football. Mirá dashboard.api-football.com; si dice");
    console.log("  100% usado, se resetea a las 00:00 UTC y no hay nada que arreglar");
    console.log("  en el código: hay que publicar menos veces o subir de plan.");
    console.log("  La otra causa posible es que la key haya dejado de valer.");
    console.log(linea);
  }
}
console.log(linea + "\n");
