/* ══════════════════════════════════════════════════════════════════════════
   EMPAQUETAR PARA iOS — armar el `app/www` que viaja adentro del .ipa.

       node empaquetar-ios.mjs

   No pide API key y no necesita una Mac. Lo corre Codemagic antes de
   compilar, y se puede correr en cualquier máquina con internet para mirar
   qué va a quedar adentro.

   ─── DE DÓNDE SALE LA FOTO, Y POR QUÉ DE AHÍ ─────────────────────────────
   De armael11.com. No se arma el sitio acá.

   La primera versión de este archivo lo armaba con `construir-sitio.mjs`, y
   el 19/9 una compilación en Codemagic produjo QUINCE archivos y DOS
   páginas. El motivo: `construir-sitio.mjs` arma una página por club pero
   solo de los clubes cuyos datos están bajados, y esos datos viven en el
   cache del workflow de GitHub, que Codemagic no ve. Un .ipa con la app
   adentro y sin un solo partido es peor que una compilación fallida: sube a
   TestFlight, se instala, y parece que la app está rota.

   Bajarlo del sitio publicado arregla eso y además es más honesto. La foto
   es exactamente lo que ve un visitante en el momento de compilar: los
   partidos de la fecha, los onces que trajo la ronda corta, los textos que
   estén arriba. No es "una versión del sitio armada de nuevo": es el sitio.

   ─── EL ORDEN ────────────────────────────────────────────────────────────
   1. Bajar el sitio publicado, siguiendo los enlaces de cada página.
   2. Escribirlo en `app/www`.
   3. Sacarle la publicidad.
   4. Comprobar que no sobrevivió nada. Si sobrevivió, plantarse.
   5. Comprobar que el paquete no esté vacío. Si lo está, plantarse.
   6. Enchufar el refresco de datos y la fecha de la foto.
   7. Sacar lo que es del sitio web y no de la app.

   ─── POR QUÉ EL PASO 3 NO ES OPCIONAL ────────────────────────────────────
   El sitio publicado TIENE publicidad, y está bien: es un sitio web. El que
   no puede tenerla es el .ipa. El candado que protege a la app de Play mira
   el `document.referrer` buscando `android-app://`, y adentro de un webview
   de Capacitor ese referrer no existe: el HTML tal cual cargaría AdSense
   adentro del iPhone. Eso rompe la política de AdSense —cuya sanción cae
   sobre la cuenta entera— y desmiente la declaración de privacidad de la
   ficha de la App Store.

   Por eso se saca del archivo en vez de agregarle otra rama al candado: lo
   que no está en el archivo no se puede prender por error. Y por eso el
   paso 4 TERMINA CON ERROR si algo sobrevivió: este es el único lugar donde
   se puede frenar, porque el .ipa no pasa por `publicar.mjs` ni por la
   batería de pruebas.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, readdirSync, statSync } from "node:fs";

const aca = p => new URL(p, import.meta.url);
const WWW = aca("./app/www/");
const linea = "─".repeat(70);
const kb = n => (n / 1024).toFixed(0) + " KB";
const DOMINIOS = /googlesyndication|pagead2/;

function todosLosArchivos(dir, base = dir, salida = []) {
  for (const n of readdirSync(dir)) {
    const u = new URL(n + "", dir);
    const st = statSync(u);
    if (st.isDirectory()) todosLosArchivos(new URL(n + "/", dir), base, salida);
    else salida.push({ url: u, rel: decodeURIComponent(u.pathname.slice(base.pathname.length)), bytes: st.size });
  }
  return salida;
}

/* ── SACAR LA PUBLICIDAD DE UNA PÁGINA ───────────────────────────────────
   Se borra el `<script>` ENTERO que contenga el dominio de Google, no la
   línea ni el texto suelto. Quitar solo la dirección dejaría el script ahí,
   a medio escribir, y un script roto en la primera etiqueta de la página
   puede llevarse puesto todo lo que viene después.

   Se recorre etiqueta por etiqueta en vez de una expresión regular sobre
   todo el archivo: una expresión que empiece en el primer `<script` y
   termine en el último `</script>` se come la app entera, y es el error
   clásico de hacer esto con una sola línea. */
export function sacarPublicidad(html) {
  const t = String(html || "");
  let out = "", i = 0, sacados = 0;
  for (;;) {
    const ini = t.indexOf("<script", i);
    if (ini < 0) { out += t.slice(i); break; }
    const fin = t.indexOf("</script>", ini);
    if (fin < 0) { out += t.slice(i); break; }
    const bloque = t.slice(ini, fin + 9);
    out += t.slice(i, ini);
    if (!DOMINIOS.test(bloque)) out += bloque; else sacados++;
    i = fin + 9;
  }
  return { html: out, sacados };
}

/* ══ BAJAR EL SITIO PUBLICADO ══════════════════════════════════════════════
   La foto que viaja adentro del .ipa sale de armael11.com, no de armar el
   sitio acá. Se descubrió el 19/9, con una compilación que produjo QUINCE
   archivos y DOS páginas: `construir-sitio.mjs` arma una página por club
   pero solo de los clubes cuyos datos están bajados, y esos datos viven en
   el cache del workflow de GitHub, que Codemagic no ve.

   Bajarlo de armael11.com arregla eso y además es más honesto: la foto es
   exactamente lo que ve un visitante en el momento de compilar, con los
   partidos de la fecha, los onces que trajo la ronda corta y los textos que
   estén publicados. No es "una versión del sitio armada de nuevo": es el
   sitio.

   `traer` se pasa de afuera a propósito, igual que en `datos-ios.js`: así
   todo esto se prueba sin red y sin depender de que armael11.com conteste.
   El único pedazo que no se puede probar acá es el `fetch` de una línea. */

/* Pura: qué archivos locales menciona una página. Se mira `src=`, `href=` y
   los `url(...)` del CSS incrustado —ahí viven las fuentes—. Lo que apunta
   afuera (http, data:, mailto:) se ignora: la foto lleva lo nuestro. */
export function enlacesDe(texto) {
  const out = new Set();
  const agregar = s => {
    let r = String(s || "").trim();
    if (!r || /^(https?:|data:|mailto:|tel:|javascript:|#|\/\/)/i.test(r)) return;
    r = r.split("#")[0].split("?")[0].replace(/^\.?\//, "");
    if (r) out.add(r);
  };
  const re = /(?:src|href)\s*=\s*"([^"]+)"|(?:src|href)\s*=\s*'([^']+)'|url\((['"]?)([^)'"]+)\3\)/g;
  let m;
  while ((m = re.exec(String(texto || "")))) agregar(m[1] || m[2] || m[4]);
  return [...out];
}

/* Los webmanifest son JSON y sus íconos no los agarra la expresión de
   arriba. Un ícono que falta no rompe la app, pero deja el .ipa sin la
   imagen de la pantalla de inicio, que es de las primeras cosas que mira
   un revisor. */
export function iconosDeManifiesto(texto) {
  try {
    const j = JSON.parse(String(texto || ""));
    return (j.icons || []).map(i => String(i.src || "").replace(/^\.?\//, "")).filter(Boolean);
  } catch (e) { return []; }
}

export async function bajarSitio({ origen, semillas, traer, log = () => {} }) {
  const archivos = new Map();
  const vistos = new Set();
  const cola = (semillas || []).slice();
  let fallos = 0;

  while (cola.length) {
    const ruta = cola.shift();
    if (!ruta || vistos.has(ruta)) continue;
    vistos.add(ruta);

    let dato = null;
    try { dato = await traer(origen + "/" + ruta); } catch (e) { dato = null; }
    /* Un archivo que no está no corta la bajada: puede ser un club sin
       página todavía. Lo que decide si el paquete sirve es el guardia del
       final, que cuenta páginas y ligas. Cortar acá por un 404 sería
       cambiar "falta un club" por "no hay app". */
    if (!dato) { fallos++; continue; }

    archivos.set(ruta, dato);
    const texto = Buffer.isBuffer(dato) ? dato.toString("utf8") : String(dato);
    if (/\.html$/i.test(ruta)) for (const r of enlacesDe(texto)) if (!vistos.has(r)) cola.push(r);
    if (/\.webmanifest$/i.test(ruta)) for (const r of iconosDeManifiesto(texto)) if (!vistos.has(r)) cola.push(r);
  }
  log(archivos.size + " archivos bajados" + (fallos ? ", " + fallos + " que no estaban" : ""));
  return archivos;
}

/* Si este archivo se importa —para probar las funciones puras sin bajar ni
   empaquetar nada— no corre el programa. */
const ME_CORREN = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (ME_CORREN) {

console.log("\n" + linea + "\n  EMPAQUETAR PARA iOS\n" + linea);

/* ─── 1. bajar el sitio publicado ────────────────────────────────────── */
const ORIGEN = "https://armael11.com";
const CLUBES = JSON.parse(readFileSync(aca("./clubes.json"), "utf8"));
const semillas = ["index.html", "sw.js", ...CLUBES.map(c => c.id + ".html")];

const traer = async (url) => {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
};

console.log("  · bajando de " + ORIGEN + " (" + semillas.length + " páginas para empezar)");
let archivos;
try {
  archivos = await bajarSitio({ origen: ORIGEN, semillas, traer, log: m => console.log("  ✓ " + m) });
} catch (e) {
  console.log("\n" + linea);
  console.log("  ME PLANTO. No pude bajar el sitio: " + e.message);
  console.log("  La foto que va adentro del .ipa sale de " + ORIGEN + ".");
  console.log("  Sin eso el paquete no tiene ni partidos ni planteles.\n");
  process.exit(1);
}

/* ─── 2. escribirlo ─────────────────────────────────────────────────── */
rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });
for (const [ruta, dato] of archivos) {
  const u = new URL(ruta, WWW);
  mkdirSync(new URL(".", u), { recursive: true });
  writeFileSync(u, dato);
}

/* ─── 3. sacar la publicidad, esté o no ─────────────────────────────── */
{
  let paginas = 0, bloques = 0;
  for (const f of todosLosArchivos(WWW)) {
    if (!f.rel.endsWith(".html")) continue;
    const r = sacarPublicidad(readFileSync(f.url, "utf8"));
    if (!r.sacados) continue;
    writeFileSync(f.url, r.html);
    paginas++; bloques += r.sacados;
  }
  const ads = new URL("ads.txt", WWW);
  const habiaAds = existsSync(ads);
  if (habiaAds) rmSync(ads, { force: true });
  console.log("  ✓ publicidad afuera: " + bloques + " script(s) de " + paginas +
              " página(s)" + (habiaAds ? " y el ads.txt" : ""));
  /* Que el sitio publicado TENGA publicidad es lo normal y lo correcto: es
     un sitio web. Lo que no puede tenerla es el .ipa. Por eso esto no es un
     aviso raro, es el trabajo de este paso. */
}

/* ─── 4. comprobar, y plantarse si algo sobrevivió ──────────────────── */
{
  const sospechosos = [];
  let mirados = 0;
  for (const f of todosLosArchivos(WWW)) {
    if (!/\.(html|js|txt|json|webmanifest)$/.test(f.rel)) continue;
    mirados++;
    const t = readFileSync(f.url, "utf8");
    /* Se mira el DOMINIO y no la palabra "adsbygoogle": desde y51 esa
       palabra vive adentro de nuestro propio JavaScript, en la función que
       arma el hueco, y ahí es código inerte que no baja nada. */
    const m = t.match(/.{0,70}(googlesyndication|pagead2).{0,70}/);
    if (m) sospechosos.push({ rel: f.rel, muestra: m[0].replace(/\s+/g, " ").trim() });
  }
  if (sospechosos.length) {
    console.log("\n" + linea);
    console.log("  ME PLANTO. Sobrevivió AdSense adentro del paquete.");
    console.log("  (" + mirados + " archivos mirados)");
    console.log(linea);
    /* Se imprime EL TEXTO ENCONTRADO y no solo el nombre del archivo: un
       guardia que se planta tiene la obligación de mostrar la prueba. */
    sospechosos.forEach(s => { console.log("\n  · " + s.rel); console.log("      " + s.muestra); });
    console.log("\n" + linea + "\n");
    process.exit(1);
  }
  console.log("  ✓ ni un byte de AdSense en el paquete (" + mirados + " archivos mirados)");
}

/* ─── 5. ¿hay algo adentro? ─────────────────────────────────────────── */
{
  const arch = todosLosArchivos(WWW);
  const paginas = arch.filter(f => f.rel.endsWith(".html") && !f.rel.includes("/")).length;
  const ligas = arch.filter(f => /^datos\/liga-[a-z-]+\.js$/.test(f.rel)).length;
  const MINIMO_PAGINAS = 10;
  if (paginas < MINIMO_PAGINAS || !ligas) {
    console.log("\n" + linea);
    console.log("  ME PLANTO. El paquete está casi vacío.");
    console.log("    páginas: " + paginas + " (hacen falta " + MINIMO_PAGINAS + ")   ligas: " + ligas + " (hace falta 1)");
    console.log("\n  Un .ipa con la app adentro y sin un solo partido es peor que una");
    console.log("  compilación fallida: sube a TestFlight, se instala, y parece que");
    console.log("  la app está rota. Si el sitio publicado está bien, el problema");
    console.log("  está en la bajada.\n");
    process.exit(1);
  }
  console.log("  ✓ el paquete trae " + paginas + " páginas y " + ligas + " ligas");
}

/* ─── 6. enchufar el refresco de datos ──────────────────────────────── */
writeFileSync(new URL("datos-ios.js", WWW),
  readFileSync(aca("./datos-ios.js"), "utf8").replace(/^export\s+/gm, ""));

/* ── LA TIENDA DE APPLE, QUE VIAJA SOLO ACÁ ──────────────────────────────
   `tienda-ios.js` NO se publica en armael11.com, y eso no es una
   optimización: es la regla 3.1.1 hecha de archivos en vez de condiciones.
   Si estuviera en la web, la única cosa que separaría "ofrecer StoreKit" de
   "ofrecer Mercado Pago" sería un `if`, y un `if` se puede borrar sin
   querer. Al no existir el archivo, no hay nada que borrar.

   Los `export` se sacan igual que en `datos-ios.js` y `nativo.js`: esto
   entra como `<script>` clásico y comparte el ámbito global con la app. Por
   eso todos los nombres de adentro empiezan con `ios`. */
writeFileSync(new URL("tienda-ios.js", WWW),
  readFileSync(aca("./tienda-ios.js"), "utf8").replace(/^export\s+/gm, ""));

/* LA FECHA DE LA FOTO. Para poder DECIRLA: un iPhone recién instalado y sin
   conexión muestra esto, que puede tener una fecha ya jugada, y mostrarla
   como si fuera la de ahora es la misma confusión que arreglamos con el
   aviso de formaciones tentativas. */
const FOTO = new Date().toISOString();
mkdirSync(new URL("datos/", WWW), { recursive: true });
writeFileSync(new URL("datos/foto.js", WWW), "window.DATOS_FOTO=" + JSON.stringify(FOTO) + ";\n");

{
  let tocadas = 0;
  for (const f of todosLosArchivos(WWW)) {
    if (!f.rel.endsWith(".html")) continue;
    const t = readFileSync(f.url, "utf8");
    const marca = t.indexOf('<script src="datos/');
    if (marca < 0) continue;
    writeFileSync(f.url, t.slice(0, marca) +
      '<script src="datos/foto.js"></script>\n<script src="datos-ios.js"></script>\n' +
      '<script src="tienda-ios.js"></script>\n' + t.slice(marca));
    tocadas++;
  }
  console.log("  ✓ refresco enchufado en " + tocadas + " páginas · foto " +
              FOTO.slice(0, 16).replace("T", " "));
}

/* ─── 7. sacar lo que es del sitio y no de la app ───────────────────── */
{
  /* `CNAME` le dice a GitHub Pages qué dominio servir; `assetlinks.json` le
     demuestra a ANDROID que la app y el dominio son de la misma persona.
     Ninguno significa nada adentro de un .ipa, y un archivo que sobrevive a
     su motivo miente. */
  const sacados = [];
  for (const n of ["CNAME", ".well-known/assetlinks.json"]) {
    const u = new URL(n, WWW);
    if (existsSync(u)) { rmSync(u, { recursive: true, force: true }); sacados.push(n); }
  }
  if (sacados.length) console.log("  ✓ sacados del paquete: " + sacados.join(", "));
}

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

}
