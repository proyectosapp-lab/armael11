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
import { existsSync, readFileSync } from "node:fs";
import { enHoraArgentina } from "./fantasy.mjs";

const aca = p => new URL(p, import.meta.url);
const soloPruebas = process.argv.includes("--sin-red");
const hayKey = !!process.env.API_FOOTBALL_KEY;

const linea = "═".repeat(74);
let fallas = [];

/* `obligatorio` es lo que, si falla, no vale la pena publicar. El resto sigue:
   que YouTube no conteste no es razón para dejar el sitio sin feed.        */
function paso(nombre, script, { obligatorio = false, args = [] } = {}) {
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
  "probar.mjs", "probar-clubes.mjs", "probar-once.mjs", "probar-stats.mjs",
  "probar-backend.mjs", "probar-cuentas.mjs", "probar-fantasy.mjs",
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
                 "probar-backend.mjs", "probar-cuentas.mjs", "probar-fantasy.mjs"])
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
  paso("Bajar los datos del juego", "datos-juego.mjs");
  paso("Rehacer la tabla y los números", "stats-api.mjs");
  /* No es obligatorio: si la fecha no se puede armar, el resto del sitio
     sale igual y la pestaña del fantasy simplemente no aparece. */
  paso("Publicar la próxima fecha del fantasy", "fantasy-api.mjs");
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

const cache = existsSync(aca("./sitio/datos/cache-talleres-cba.js"));
console.log("  JUEGO: " + (cache ? "con los datos bajados, sin API key en el navegador"
                                 : "SIN datos bajados: la app le va a pedir la key al usuario"));

console.log(linea);
console.log(fallas.length ? "  Terminó con " + fallas.length + " paso(s) fallado(s): " + fallas.join(", ")
                          : "  Todo bien.");
console.log(linea + "\n");
