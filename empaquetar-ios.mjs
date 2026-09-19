/* ══════════════════════════════════════════════════════════════════════════
   EMPAQUETAR PARA iOS — armar el `app/www` que viaja adentro del .ipa.

       node empaquetar-ios.mjs

   No pide API key, no toca la red, no necesita una Mac. Lo corre Codemagic
   antes de compilar, y se puede correr en cualquier máquina para mirar qué
   quedó adentro.

   ─── QUÉ HACE, Y EN QUÉ ORDEN ────────────────────────────────────────────
   1. Arma el sitio con `SIN_PUBLICIDAD=1`.
   2. COMPRUEBA que no haya quedado nada de AdSense. Si hay, se planta.
   3. Copia el sitio a `app/www` y le agrega el refresco de datos.
   4. Saca lo que es del sitio web y no de la app.
   5. Vuelve a armar el sitio normal, para no dejar `sitio/` cambiado.

   ─── EL PASO 2 NO ES UNA FORMALIDAD ──────────────────────────────────────
   El candado que protege a la app de Play mira el `document.referrer`
   buscando `android-app://`. Adentro de un webview de Capacitor ese
   referrer NO EXISTE —es vacío o `capacitor://localhost`—, así que el HTML
   del sitio tal cual cargaría AdSense adentro del iPhone.

   Eso rompe dos cosas a la vez: la política de AdSense, cuya sanción cae
   sobre la cuenta entera, y la declaración de privacidad de la ficha de la
   App Store, donde decimos que la app no carga scripts de terceros.

   Por eso la defensa es sacar el script del archivo y no agregarle otra
   rama al candado: LO QUE NO ESTÁ EN EL ARCHIVO NO SE PUEDE PRENDER POR
   ERROR. Y por eso la comprobación termina el programa con error en vez de
   avisar: un empaquetado con publicidad adentro no tiene que poder llegar a
   compilarse. Es el único lugar donde esto se puede frenar, porque el
   .ipa no pasa por `publicar.mjs` ni por la batería de pruebas.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync, rmSync, cpSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const aca = p => new URL(p, import.meta.url);
const SITIO = aca("./sitio/");
const WWW = aca("./app/www/");
const linea = "─".repeat(70);
const kb = n => (n / 1024).toFixed(0) + " KB";

const construir = (nativo) => execFileSync("node", ["construir-sitio.mjs"], {
  cwd: new URL(".", import.meta.url), stdio: "pipe",
  env: { ...process.env, SIN_PUBLICIDAD: nativo ? "1" : "" },
});

/* Recorre un directorio entero. Se usa para medir y para revisar, así que
   devuelve las rutas de verdad y no nombres sueltos. */
function todosLosArchivos(dir, base = dir, salida = []) {
  for (const n of readdirSync(dir)) {
    const u = new URL(n + "", dir);
    const st = statSync(u);
    if (st.isDirectory()) todosLosArchivos(new URL(n + "/", dir), base, salida);
    else salida.push({ url: u, rel: decodeURIComponent(u.pathname.slice(base.pathname.length)), bytes: st.size });
  }
  return salida;
}

console.log("\n" + linea + "\n  EMPAQUETAR PARA iOS\n" + linea);

/* ─── 1. el sitio, sin publicidad ────────────────────────────────────── */
construir(true);
console.log("  ✓ sitio armado con SIN_PUBLICIDAD=1");

/* ─── 2. la revisión que puede plantar todo ──────────────────────────── */
{
  const sospechosos = [];
  for (const f of todosLosArchivos(SITIO)) {
    if (!/\.(html|js|txt|json)$/.test(f.rel)) continue;
    const t = readFileSync(f.url, "utf8");
    /* Se mira el DOMINIO y no la palabra "adsbygoogle": desde y51 esa
       palabra vive adentro de nuestro propio JavaScript, en la función que
       arma el hueco, y ahí es código inerte que no baja nada. Lo que
       importa es "¿este archivo puede traer algo de Google?". */
    if (/googlesyndication|pagead2/.test(t)) sospechosos.push(f.rel);
  }
  if (existsSync(new URL("ads.txt", SITIO))) sospechosos.push("ads.txt");

  if (sospechosos.length) {
    console.log("\n" + linea);
    console.log("  ME PLANTO. Quedó AdSense adentro de lo que iba a viajar en el .ipa:");
    sospechosos.forEach(s => console.log("    · " + s));
    console.log("\n  AdSense adentro de una app es una infracción y la sanción cae");
    console.log("  sobre la cuenta entera. Antes de seguir hay que entender por qué");
    console.log("  `SIN_PUBLICIDAD=1` no lo sacó.\n");
    process.exit(1);
  }
  console.log("  ✓ ni un byte de AdSense en el paquete");
}

/* ─── 3. copiar y enchufar el refresco ───────────────────────────────── */
rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });
cpSync(SITIO, WWW, { recursive: true });

/* El cargador de datos. Va suelto en la raíz del paquete y no adentro de
   `datos/`, porque `datos/` es lo que se refresca y esto es código. */
writeFileSync(new URL("datos-ios.js", WWW),
  readFileSync(aca("./datos-ios.js"), "utf8").replace(/^export\s+/gm, ""));

/* LA FECHA DE LA FOTO. Para poder DECIRLA. Un iPhone recién instalado y sin
   conexión muestra esto, que puede tener una fecha ya jugada, y mostrarla
   como si fuera la de ahora es la misma confusión que arreglamos con el
   aviso de formaciones tentativas: la persona no cree que los datos están
   viejos, cree que la app se equivoca. */
const FOTO = new Date().toISOString();
writeFileSync(new URL("datos/foto.js", WWW),
  "window.DATOS_FOTO=" + JSON.stringify(FOTO) + ";\n");

/* Las dos etiquetas van ANTES del primer archivo de datos: así, cuando el
   código de la app pregunta `typeof arrancarDatosIos`, ya está. */
let tocadas = 0;
for (const f of todosLosArchivos(WWW)) {
  if (!f.rel.endsWith(".html")) continue;
  const t = readFileSync(f.url, "utf8");
  const marca = t.indexOf('<script src="datos/');
  if (marca < 0) continue;
  writeFileSync(f.url,
    t.slice(0, marca) +
    '<script src="datos/foto.js"></script>\n<script src="datos-ios.js"></script>\n' +
    t.slice(marca));
  tocadas++;
}
console.log("  ✓ refresco de datos enchufado en " + tocadas + " páginas · foto " + FOTO.slice(0, 16).replace("T", " "));

/* ─── 4. sacar lo que es del sitio y no de la app ─────────────────────── */
{
  /* `CNAME` le dice a GitHub Pages qué dominio servir. `assetlinks.json` es
     el papel que le demuestra a ANDROID que la app y el dominio son de la
     misma persona. Ninguno de los dos significa nada adentro de un .ipa, y
     un archivo que sobrevive a su motivo miente: el día que alguien los vea
     ahí va a pensar que hacen algo. */
  const deMas = ["CNAME", ".well-known/assetlinks.json", "ads.txt"];
  const sacados = [];
  for (const n of deMas) {
    const u = new URL(n, WWW);
    if (existsSync(u)) { rmSync(u, { recursive: true, force: true }); sacados.push(n); }
  }
  if (sacados.length) console.log("  ✓ sacados del paquete: " + sacados.join(", "));
}

/* ─── 5. dejar el sitio como estaba ──────────────────────────────────── */
construir(false);
const volvio = /googlesyndication/.test(readFileSync(new URL("index.html", SITIO), "utf8")) ||
               existsSync(new URL("ads.txt", SITIO));
console.log("  ✓ sitio web reconstruido con su configuración de siempre" +
            (volvio ? " (con publicidad)" : " (sin publicidad, como dice sitio.json)"));

/* ─── el resumen ─────────────────────────────────────────────────────── */
{
  const arch = todosLosArchivos(WWW);
  const total = arch.reduce((a, f) => a + f.bytes, 0);
  const datos = arch.filter(f => f.rel.startsWith("datos/")).reduce((a, f) => a + f.bytes, 0);
  console.log(linea);
  console.log("  " + arch.length + " archivos · " + kb(total) + " en total");
  console.log("    de eso, " + kb(datos) + " son datos: es lo que se refresca de armael11.com");
  console.log("    el resto es la app, y solo cambia con una versión nueva");
  console.log(linea + "\n");
}
