/* ══════════════════════════════════════════════════════════════════════════
   EMPAQUETAR PARA iOS — armar el `app/www` que viaja adentro del .ipa.

       node empaquetar-ios.mjs

   No pide API key, no toca la red, no necesita una Mac. Lo corre Codemagic
   antes de compilar, y se puede correr en cualquier máquina para mirar qué
   quedó adentro.

   ─── EL ORDEN, Y POR QUÉ ESE ORDEN ───────────────────────────────────────
   1. Borrar las páginas de una corrida anterior.
   2. Armar el sitio con `SIN_PUBLICIDAD=1`.
   3. Copiar a `app/www`.
   4. SACAR la publicidad del copia, pase lo que pase.
   5. Comprobar que no quedó nada. Si quedó, plantarse.
   6. Comprobar que el paquete no esté vacío.
   7. Enchufar el refresco de datos.
   8. Volver a armar el sitio web, para no dejar `sitio/` cambiado.

   ─── POR QUÉ HAY DOS DEFENSAS Y NO UNA ───────────────────────────────────
   El candado que protege a la app de Play mira el `document.referrer`
   buscando `android-app://`. Adentro de un webview de Capacitor ese
   referrer NO EXISTE, así que el HTML del sitio tal cual cargaría AdSense
   adentro del iPhone. Eso rompe la política de AdSense —cuya sanción cae
   sobre la cuenta entera— y desmiente la declaración de privacidad de la
   ficha de la App Store.

   La primera defensa es `SIN_PUBLICIDAD=1`: el script ni se escribe.
   La segunda es el paso 4: se saca del paquete aunque esté.

   Parecen la misma cosa dos veces y no lo son. La primera depende de que
   la versión de `construir-sitio.mjs` que hay en esta máquina entienda la
   variable; el 19/9 una compilación en Codemagic demostró que eso no se
   puede dar por sentado. La segunda no depende de nadie: mira el archivo
   que va a viajar y saca lo que encuentra.

   Y la tercera, el paso 5, comprueba el resultado y TERMINA CON ERROR si
   algo sobrevivió. Un empaquetado con publicidad adentro no tiene que poder
   llegar a compilarse. Es el único lugar donde esto se puede frenar, porque
   el .ipa no pasa por `publicar.mjs` ni por la batería de pruebas.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync, rmSync, cpSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const aca = p => new URL(p, import.meta.url);
const SITIO = aca("./sitio/");
const WWW = aca("./app/www/");
const linea = "─".repeat(70);
const kb = n => (n / 1024).toFixed(0) + " KB";
const DOMINIOS = /googlesyndication|pagead2/;

const construir = (nativo) => execFileSync("node", ["construir-sitio.mjs"], {
  cwd: new URL(".", import.meta.url), stdio: "pipe",
  env: { ...process.env, SIN_PUBLICIDAD: nativo ? "1" : "" },
});

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

/* Si este archivo se importa —para probar `sacarPublicidad` sin empaquetar
   nada— no corre el programa. Sin esto, una prueba armaría el sitio entero
   dos veces solo para llamar a una función pura. */
const ME_CORREN = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (!ME_CORREN) { /* importado: solo se exporta lo de arriba */ }
else {

console.log("\n" + linea + "\n  EMPAQUETAR PARA iOS\n" + linea);

/* ─── 1. las páginas viejas, afuera ──────────────────────────────────────
   `construir-sitio.mjs` ESCRIBE las páginas pero no borra las que sobran, y
   tiene razón en no hacerlo: es el que arma el sitio web, no el que lo
   limpia. Pero si acá quedó un `.html` de una corrida anterior —con la
   publicidad puesta— el empaquetado lo copiaría adentro del .ipa aunque
   esta corrida haya armado todo bien. Lo generado que sobrevive a su motivo
   miente. `datos/` NO se toca: ahí vive lo que se bajó de la API. */
{
  let barridas = 0;
  if (existsSync(SITIO))
    for (const n of readdirSync(SITIO))
      if (n.endsWith(".html")) { rmSync(new URL(n, SITIO), { force: true }); barridas++; }
  if (barridas) console.log("  · " + barridas + " página(s) de una corrida anterior, borradas");
}

/* ─── 2. el sitio, sin publicidad ────────────────────────────────────── */
construir(true);
console.log("  ✓ sitio armado con SIN_PUBLICIDAD=1");

/* ─── 3. copiar ─────────────────────────────────────────────────────── */
rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });
cpSync(SITIO, WWW, { recursive: true });

/* ─── 4. sacarla del paquete, esté o no ─────────────────────────────── */
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

  if (paginas || habiaAds) {
    /* No es un error, pero sí algo que hay que saber: significa que el
       sitio se armó CON publicidad aunque se pidió sin. La red de
       seguridad funcionó, y alguien tiene que mirar por qué hizo falta. */
    console.log("  ⚠ el sitio venía CON publicidad: saqué " + bloques +
                " script(s) de " + paginas + " página(s)" + (habiaAds ? " y el ads.txt" : ""));
    console.log("    (o sea que `SIN_PUBLICIDAD=1` no hizo efecto — el paquete");
    console.log("     queda limpio igual, pero eso hay que entenderlo)");
  }
}

/* ─── 5. comprobar, y plantarse si algo sobrevivió ──────────────────── */
{
  const sospechosos = [];
  let mirados = 0;
  for (const f of todosLosArchivos(WWW)) {
    if (!/\.(html|js|txt|json)$/.test(f.rel)) continue;
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
    /* Se imprime EL TEXTO ENCONTRADO y no solo el nombre del archivo. La
       primera versión decía "quedó AdSense en index.html" y nada más, y con
       eso no se puede arreglar nada desde un navegador: no distingue un
       script de verdad de una mención en un comentario nuestro. Un guardia
       que se planta tiene la obligación de mostrar la prueba. */
    sospechosos.forEach(s => {
      console.log("\n  · " + s.rel);
      console.log("      " + s.muestra);
    });
    console.log("\n" + linea);
    console.log("  Si eso de arriba es un <script>, el que lo saca falló y hay que");
    console.log("  mirarlo. Si es una mención nuestra en un comentario, hay que");
    console.log("  afinar esta comprobación. Las dos cosas se distinguen leyendo\n");
    process.exit(1);
  }
  console.log("  ✓ ni un byte de AdSense en el paquete (" + mirados + " archivos mirados)");
}

/* ─── 6. ¿HAY ALGO ADENTRO? ─────────────────────────────────────────────
   `construir-sitio.mjs` arma UNA PÁGINA POR CLUB, pero solo de los clubes
   cuyos datos están bajados, y esos datos —`sitio/datos`— NO viven en el
   repositorio: viven en el cache del workflow de GitHub, que esta máquina
   no ve.

   O sea que una compilación puede terminar bien, firmar bien, y producir un
   .ipa con la app adentro y sin un solo partido. Eso es peor que fallar:
   sube a TestFlight, se instala, y parece que la app está rota. */
{
  const arch = todosLosArchivos(WWW);
  const paginas = arch.filter(f => f.rel.endsWith(".html") && !f.rel.includes("/")).length;
  const ligas = arch.filter(f => /^datos\/liga-[a-z-]+\.js$/.test(f.rel)).length;
  const MINIMO_PAGINAS = 10;

  if (paginas < MINIMO_PAGINAS || !ligas) {
    console.log("\n" + linea);
    console.log("  ME PLANTO. El paquete está casi vacío.");
    console.log(linea);
    console.log("    páginas de club: " + paginas + "  (hacen falta al menos " + MINIMO_PAGINAS + ")");
    console.log("    archivos de liga: " + ligas + "  (hace falta al menos 1)");
    console.log("\n  Los datos no están en el repositorio: están en el cache del");
    console.log("  workflow de GitHub, que esta máquina no ve. Un .ipa con la app");
    console.log("  adentro y sin un solo partido es peor que una compilación");
    console.log("  fallida: sube a TestFlight, se instala, y parece que la app está");
    console.log("  rota. La foto tiene que salir de armael11.com, que es donde los");
    console.log("  datos sí están publicados.\n");
    process.exit(1);
  }
  console.log("  ✓ el paquete trae " + paginas + " páginas y " + ligas + " ligas");
}

/* ─── 7. enchufar el refresco de datos ──────────────────────────────── */
writeFileSync(new URL("datos-ios.js", WWW),
  readFileSync(aca("./datos-ios.js"), "utf8").replace(/^export\s+/gm, ""));

/* LA FECHA DE LA FOTO. Para poder DECIRLA: un iPhone recién instalado y sin
   conexión muestra esto, que puede tener una fecha ya jugada, y mostrarla
   como si fuera la de ahora es la misma confusión que arreglamos con el
   aviso de formaciones tentativas. */
const FOTO = new Date().toISOString();
writeFileSync(new URL("datos/foto.js", WWW),
  "window.DATOS_FOTO=" + JSON.stringify(FOTO) + ";\n");

{
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
  console.log("  ✓ refresco enchufado en " + tocadas + " páginas · foto " +
              FOTO.slice(0, 16).replace("T", " "));
}

/* ─── 8. sacar lo que es del sitio y no de la app ───────────────────── */
{
  /* `CNAME` le dice a GitHub Pages qué dominio servir; `assetlinks.json` le
     demuestra a ANDROID que la app y el dominio son de la misma persona.
     Ninguno significa nada adentro de un .ipa, y un archivo que sobrevive a
     su motivo miente: el día que alguien los vea ahí va a pensar que hacen
     algo. */
  const sacados = [];
  for (const n of ["CNAME", ".well-known/assetlinks.json"]) {
    const u = new URL(n, WWW);
    if (existsSync(u)) { rmSync(u, { recursive: true, force: true }); sacados.push(n); }
  }
  if (sacados.length) console.log("  ✓ sacados del paquete: " + sacados.join(", "));
}

/* ─── 9. dejar el sitio como estaba ─────────────────────────────────── */
construir(false);
const conPubli = existsSync(new URL("ads.txt", SITIO));
console.log("  ✓ sitio web reconstruido con su configuración de siempre" +
            (conPubli ? " (con publicidad)" : " (sin publicidad, como dice sitio.json)"));

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
