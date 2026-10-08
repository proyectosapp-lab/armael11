/* ══════════════════════════════════════════════════════════════════════════
   EMPAQUETAR MANO A MANO — armar `app/www`, lo que viaja adentro del .ipa y
   del .aab. Lo corre Codemagic antes de compilar; no hace falta correrlo a
   mano. Vive en el repo de Armá el 11 (al lado de empaquetar-ios.mjs, del
   que toma las funciones) porque el paquete de la app es com.armael11.app.

       node empaquetar-mam.mjs            → app/www/
       node empaquetar-mam.mjs --local    → además deja una copia navegable en app/www (igual)

   La app es un cascarón (la carpeta `mam/`: deportes arriba, funciones
   abajo, desafíos, cuenta y planes) con las TRES webs adentro, cada una en
   su carpeta y cargada en un marco en "modo app" (?mam=1):

       app/www/index.html, mam.js, …        el cascarón
       app/www/futbol/   ← armael11.com     (las páginas de los clubes)
       app/www/tenis/    ← sacavos.com
       app/www/nba/      ← armaelquinteto.com

   De cada sitio se baja la FOTO publicada (igual que empaquetar-ios.mjs: es
   el sitio, no una versión armada de nuevo), y a cada copia se le hace lo
   mismo que a la del iPhone: sin publicidad, sin zoom, sin manifest, y con
   el refresco de datos enchufado (datos-ios.js para fútbol, datos-mam.js
   para tenis y NBA). Los links a páginas que no viajan (consulta, "cómo
   funciona", privacidad) pasan a ser absolutos: adentro de la app los abre
   el navegador del teléfono.

   Se planta si: no pudo bajar un sitio, sobrevivió AdSense, o el paquete
   quedó casi vacío. Las tres son las que convierten "una compilación falló"
   en "una app rota en TestFlight".
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { bajarSitio, sacarPublicidad, viewportDeApp, enlacesDe } from "./empaquetar-ios.mjs";

const aca = p => new URL(p, import.meta.url);
const WWW = aca("./app/www/");
const MAM = aca("./mam/");
const linea = "─".repeat(70);
const kb = n => (n / 1024).toFixed(0) + " KB";

const SITIOS = {
  futbol: { origen: "https://armael11.com",        carpeta: "futbol" },
  tenis:  { origen: "https://sacavos.com",         carpeta: "tenis" },
  nba:    { origen: "https://armaelquinteto.com",  carpeta: "nba" },
};
/* páginas que no viajan en ningún sitio: son para el buscador o para la web */
const NO_VIAJAN = /^(consulta(\/|$)|sitemap\.xml|robots\.txt|ads\.txt|CNAME|\.nojekyll|\.well-known\/|gracias\.html|como-funciona\.html|esta-medido\.html|el-saque\.html|superficies\.html|set-decisivo\.html|el-techo-del-futbol\.html|es-suerte\.html|ligas\.html|liga-argentina\.html|nba\.html|borrar-cuenta\.html|feed\.html|perfil\.html|manifest\.webmanifest|.*\.webmanifest|sw\.js|og\.png)$/i;

function todosLosArchivos(dir, base = dir, salida = []) {
  for (const n of readdirSync(dir)) {
    const u = new URL(n + "", dir);
    const st = statSync(u);
    if (st.isDirectory()) todosLosArchivos(new URL(n + "/", dir), base, salida);
    else salida.push({ url: u, rel: decodeURIComponent(u.href.slice(base.href.length)), bytes: st.size });
  }
  return salida;
}
/* Para probar sin red: MAM_LOCAL='{"futbol":"../sitio","tenis":"../x/docs","nba":"../y/docs"}' lee cada sitio de una
   carpeta en vez de bajarlo. Codemagic no lo define y baja lo publicado. */
const LOCAL = process.env.MAM_LOCAL ? JSON.parse(process.env.MAM_LOCAL) : null;
const traerDe = (dep) => async (url) => {
  if (LOCAL && LOCAL[dep]) {
    const ruta = url.replace(SITIOS[dep].origen + "/", "");
    const u = new URL(ruta, new URL(LOCAL[dep].replace(/\/?$/, "/"), import.meta.url));
    return existsSync(u) && statSync(u).isFile() ? readFileSync(u) : null;
  }
  const r = await fetch(url, { redirect: "follow" }); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer());
};

/* ─── los retoques a cada página de una sub-app ─────────────────────────── */
export function absolutizar(html, origen, { conservar = [] } = {}) {
  let t = String(html);
  // href="/x" → https://sitio/x  (adentro de la carpeta no existe la raíz del sitio)
  t = t.replace(/href="\/([^"/][^"]*)"/g, (m, r) => `href="${origen}/${r}"`);
  t = t.replace(/href="\/"/g, `href="${origen}/"`);
  // src="/x" → "x"  (los recursos sí viajan, relativos a la carpeta)
  t = t.replace(/(src|href)="\/((?:datos|iconos|img)\/[^"]+|[^"/]+\.(?:js|css|png|svg|woff2?|json))"/g, (m, a, r) => `${a}="${r}"`);
  // páginas sueltas que no viajan → absolutas
  t = t.replace(/href="(\.\/)?([a-z0-9][a-z0-9-]*\.html)(#[^"]*)?"/gi, (m, p, pag, hash) => {
    if (conservar.includes(pag)) return m;
    if (!NO_VIAJAN.test(pag)) return m;
    return `href="${origen}/${pag}${hash || ""}"`;
  });
  // sin manifest ni "agregar a inicio": ya está instalada. Y sin el service worker, que en WKWebView no anda.
  t = t.replace(/<link rel="manifest"[^>]*>\n?/g, "").replace(/<meta name="(apple-)?mobile-web-app-capable"[^>]*>\n?/g, "");
  // y el texto de la portada para los buscadores (portada-texto.mjs): adentro de la app es estorbo
  t = t.replace(/<!-- (consulta|portada):inicio -->[\s\S]*?<!-- \1:fin -->\n?/g, "");
  return t;
}

/* tenis y NBA: los <script src="datos/…"> y los de la app se reemplazan por MAM_DATOS + datos-mam.js, que carga la
   foto, mira lo guardado, baja lo nuevo y recién después carga la app (ver mam/datos-mam.js). */
export function enchufarDatos(html, origen, nombre) {
  const re = /<script src="([^"]+)"><\/script>\n?/g;
  const todos = []; let m;
  while ((m = re.exec(html))) todos.push({ tag: m[0], src: m[1], i: m.index });
  const primero = todos.findIndex(s => /^datos\//.test(s.src));
  if (primero < 0) return { html, cambiado: false };
  const desde = todos.slice(primero);
  const datos = desde.filter(s => /^datos\//.test(s.src)).map(s => [globalDe(s.src), s.src]);
  const despues = desde.filter(s => !/^datos\//.test(s.src)).map(s => s.src);
  let t = html;
  for (const s of desde) t = t.replace(s.tag, "");
  const bloque = `<script>window.MAM_DATOS=${JSON.stringify({ origen, nombre, archivos: datos, despues })};</script>\n<script src="datos-mam.js"></script>\n`;
  t = t.replace("</body>", bloque + "</body>");
  return { html: t, cambiado: true, datos: datos.length, despues: despues.length };
}
/* el nombre de la variable global que deja cada archivo de datos: window.X = …  o window.X=… */
function globalDe(src) {
  const nombre = src.split("/").pop().replace(/\.js$/, "");
  const MAPA = { "tenis-hoy": "SV_HOY", "tenis-medido": "SV_MEDIDO", "nba-hoy": "NBA_HOY", "nba-jugados": "NBA_JUGADOS", "nba-medido": "NBA_MEDIDO" };
  return MAPA[nombre] || nombre.toUpperCase().replace(/-/g, "_");
}

const ME_CORREN = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (ME_CORREN) {
  console.log("\n" + linea + "\n  EMPAQUETAR MANO A MANO\n" + linea);
  rmSync(WWW, { recursive: true, force: true });
  mkdirSync(WWW, { recursive: true });

  /* ─── 1. el cascarón ───────────────────────────────────────────────────── */
  for (const f of todosLosArchivos(MAM)) {
    const dest = new URL(f.rel, WWW); mkdirSync(new URL(".", dest), { recursive: true }); copyFileSync(f.url, dest);
  }
  console.log("  ✓ cascarón: " + todosLosArchivos(MAM).length + " archivos de mam/");

  /* ─── 2. los tres sitios ───────────────────────────────────────────────── */
  const CLUBES = existsSync(aca("./clubes.json")) ? JSON.parse(readFileSync(aca("./clubes.json"), "utf8")) : [];
  const RESUMEN = {};
  for (const [dep, S] of Object.entries(SITIOS)) {
    const semillas = dep === "futbol" ? ["index.html", ...CLUBES.map(c => c.id + ".html")] : ["index.html"];
    console.log("  · " + dep + ": bajando de " + S.origen);
    let archivos;
    try { archivos = await bajarSitio({ origen: S.origen, semillas, traer: traerDe(dep), log: m => console.log("    ✓ " + m) }); }
    catch (e) { console.log("\n  ME PLANTO. No pude bajar " + S.origen + ": " + e.message + "\n"); process.exit(1); }
    const carpeta = new URL(S.carpeta + "/", WWW); mkdirSync(carpeta, { recursive: true });
    let paginas = 0, enchufadas = 0, sacadas = 0;
    const conservar = ["index.html", ...(dep === "futbol" ? CLUBES.map(c => c.id + ".html") : [])];
    for (const [ruta, dato] of archivos) {
      if (NO_VIAJAN.test(ruta)) { sacadas++; continue; }
      const u = new URL(ruta, carpeta); mkdirSync(new URL(".", u), { recursive: true });
      if (!/\.html$/i.test(ruta)) { writeFileSync(u, dato); continue; }
      let html = sacarPublicidad(dato.toString("utf8")).html;
      html = viewportDeApp(html).html;
      html = absolutizar(html, S.origen, { conservar });
      if (dep === "futbol") {
        /* el refresco de Armá el 11 (datos-ios.js) y la fecha de la foto, como en el .ipa de siempre */
        const marca = html.indexOf('<script src="datos/');
        if (marca >= 0) { html = html.slice(0, marca) + '<script src="datos/foto.js"></script>\n<script src="datos-ios.js"></script>\n' + html.slice(marca); enchufadas++; }
      } else {
        const r = enchufarDatos(html, S.origen, dep); html = r.html; if (r.cambiado) enchufadas++;
      }
      writeFileSync(u, html); paginas++;
    }
    if (dep === "futbol") {
      writeFileSync(new URL("datos-ios.js", carpeta), readFileSync(aca("./datos-ios.js"), "utf8").replace(/^export\s+/gm, ""));
      mkdirSync(new URL("datos/", carpeta), { recursive: true });
      writeFileSync(new URL("datos/foto.js", carpeta), "window.DATOS_FOTO=" + JSON.stringify(new Date().toISOString()) + ";\n");
    } else {
      copyFileSync(new URL("datos-mam.js", MAM), new URL("datos-mam.js", carpeta));
    }
    /* mam-marco.js tiene que estar en cada sub-app: si el sitio todavía no lo publica, se pone el de acá */
    for (const rel of ["mam-marco.js", "datos/mam-marco.js"]) {
      const u = new URL(rel, carpeta);
      if (!existsSync(u) && (rel === "mam-marco.js" || dep === "futbol")) { mkdirSync(new URL(".", u), { recursive: true }); copyFileSync(new URL("mam-marco.js", MAM), u); }
    }
    RESUMEN[dep] = { paginas, enchufadas, sacadas };
    console.log("    ✓ " + paginas + " páginas · refresco en " + enchufadas + " · afuera " + sacadas + " archivos de la web");
  }

  /* ─── 3. comprobar: ni un byte de AdSense ─────────────────────────────── */
  {
    const sospechosos = []; let mirados = 0;
    for (const f of todosLosArchivos(WWW)) {
      if (!/\.(html|js|txt|json|webmanifest)$/.test(f.rel)) continue;
      mirados++;
      const t = readFileSync(f.url, "utf8");
      const m = t.match(/.{0,70}(googlesyndication|pagead2|doubleclick\.net).{0,70}/);
      if (m) sospechosos.push({ rel: f.rel, muestra: m[0].replace(/\s+/g, " ").trim() });
    }
    if (sospechosos.length) {
      console.log("\n" + linea + "\n  ME PLANTO. Sobrevivió publicidad adentro del paquete (" + mirados + " archivos mirados)\n" + linea);
      sospechosos.forEach(s => { console.log("\n  · " + s.rel); console.log("      " + s.muestra); });
      console.log("\n" + linea + "\n"); process.exit(1);
    }
    console.log("  ✓ ni un byte de publicidad en el paquete (" + mirados + " archivos mirados)");
  }

  /* ─── 4. ¿hay algo adentro? ─────────────────────────────────────────────── */
  {
    const arch = todosLosArchivos(WWW);
    const ligas = arch.filter(f => /^futbol\/datos\/liga-[a-z-]+\.js$/.test(f.rel)).length;
    const tenis = arch.some(f => f.rel === "tenis/datos/tenis-hoy.js");
    const nba = arch.some(f => f.rel === "nba/datos/nba-hoy.js");
    const cascaron = arch.some(f => f.rel === "index.html") && arch.some(f => f.rel === "mam.js");
    if (!cascaron || RESUMEN.futbol.paginas < 10 || !ligas || !tenis || !nba) {
      console.log("\n" + linea + "\n  ME PLANTO. El paquete está incompleto.");
      console.log("    cascarón: " + cascaron + " · fútbol: " + RESUMEN.futbol.paginas + " páginas, " + ligas + " ligas · tenis: " + tenis + " · nba: " + nba + "\n");
      if (!process.env.MAM_SIN_GUARDIA) process.exit(1);
      console.log("  (MAM_SIN_GUARDIA: sigo igual, es para probar)");
    }
    const total = arch.reduce((a, f) => a + f.bytes, 0);
    console.log("  ✓ el paquete trae " + arch.length + " archivos · " + kb(total));
    console.log(linea + "\n");
  }
}
