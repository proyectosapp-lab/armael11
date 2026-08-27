/* ══════════════════════════════════════════════════════════════════════════
   CONSTRUIR-SITIO — arma la carpeta que GitHub Pages publica.

   Hasta ahora la app era UN archivo con todo adentro, porque un HTML abierto
   desde el disco no puede leer un archivo vecino. Publicado sí puede, y eso
   cambia la cuenta: `stats-liga.js` pesa 240 kB y es igual para los treinta
   clubes. Metido adentro de cada página serían 7 MB de lo mismo repetido.

   Así que los datos salen de la página y entran como <script src>. El orden
   de ejecución de los scripts clásicos está garantizado —el de arriba corre
   antes que el de abajo— así que la app no cambió ni una línea por esto:
   sigue leyendo window.FEED, window.CLUB y window.STATS como siempre.

     sitio/
       index.html            elegir club
       <club>.html           la app de ese club
       datos/
         stats-liga.js       compartido por los treinta
         feed-<club>.js      lo escribe todos.mjs
         cache-<club>.js     lo escribe datos-juego.mjs (puede no estar)
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";

const aca = p => new URL(p, import.meta.url);
const CLUBES = JSON.parse(readFileSync(aca("./clubes.json")));
const TPL = readFileSync(aca("./app.tpl.html"), "utf8");

const SITIO = new URL("./sitio/", import.meta.url);
const DATOS = new URL("./sitio/datos/", import.meta.url);
mkdirSync(DATOS, { recursive: true });

/* Lo que comparten los treinta: los números de la liga y el motor del juego.
   `juego.js` es un módulo ES —lo usan las pruebas con import— pero la página
   lo carga como script clásico, así que se le saca el `export`. Sus `const`
   y `function` de primer nivel quedan visibles para el script de la app, que
   es exactamente como funcionaba cuando estaba todo pegado en un archivo. */
copyFileSync(aca("./stats-liga.js"), new URL("stats-liga.js", DATOS));
writeFileSync(new URL("juego.js", DATOS),
  readFileSync(aca("./juego.js"), "utf8").replace(/^export\s+/gm, ""));

/* Las cuentas solo se copian si el backend está configurado. Sin eso, el
   archivo no existe en el sitio, la app no lo carga y no hay ni un botón que
   prometa algo que no anda. Es la misma idea del contador de visitas: lo que
   no está configurado, no está.                                          */
const CFG = existsSync(aca("./sitio.json")) ? JSON.parse(readFileSync(aca("./sitio.json"))) : {};
const HAY_BACKEND = !!(CFG.supabase && CFG.supabase.url && CFG.supabase.anon);
if (HAY_BACKEND)
  writeFileSync(new URL("cuentas.js", DATOS),
    readFileSync(aca("./cuentas.js"), "utf8").replace(/^export\s+/gm, ""));

/* La fecha del fantasy y su reglamento. Se copian solo si hay una fecha
   publicada: sin eso la pestaña no aparece y la app pesa lo mismo que
   antes. `fantasy.mjs` es EL MISMO archivo que usa el servidor para
   calcular los puntos — una sola tabla, una sola idea de qué equipo es
   legal. Si la pantalla dejara pasar algo que el servidor rechaza, el
   error aparecería recién el lunes. */
const FECHA_CRUDA = existsSync(aca("./fecha-actual.json"))
  ? JSON.parse(readFileSync(aca("./fecha-actual.json"))) : null;
/* Una fecha sin jugadores es peor que no tener fecha: la pestaña aparece,
   la persona entra y no hay nada. Se trata como si no existiera. */
const FECHA = FECHA_CRUDA && (FECHA_CRUDA.jugadores || []).length ? FECHA_CRUDA : null;
if (FECHA) {
  writeFileSync(new URL("fantasy.js", DATOS),
    readFileSync(aca("./fantasy.mjs"), "utf8").replace(/^export\s+/gm, ""));
  writeFileSync(new URL("fecha.js", DATOS), "window.FECHA = " + JSON.stringify(FECHA) + ";\n");
} else {
  /* Y si no hay fecha, los archivos de la anterior se BORRAN. Es el mismo
     error del CNAME: lo generado que sobrevive a su motivo miente. Una
     fecha vieja que se queda en el sitio deja la pestaña viva, con el
     cierre pasado y jugadores de la semana pasada. */
  for (const f of ["fantasy.js", "fecha.js"]) {
    const u = new URL(f, DATOS);
    if (existsSync(u)) rmSync(u);
  }
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

/* ─── lo que hace falta para que un link se pueda mandar ─────────────────
   Sin esto, pegar la dirección en WhatsApp muestra un renglón gris. Con
   esto muestra el nombre del club y una línea. La diferencia entre que un
   link circule y que muera en el primer reenvío es más o menos esa.

   También va acá lo que hace falta para agregarlo a la pantalla de inicio:
   en el teléfono esto es una app, aunque sea una página.                */
/* Con dominio propio manda el dominio: si quedaran las dos direcciones
   dando vueltas, la tarjeta de WhatsApp diría una y el link llevaría a la
   otra, y los buscadores tratarían el sitio como dos sitios distintos. */
const DOM  = (CFG.dominio || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
const RAIZ = DOM ? "https://" + DOM : (CFG.url || "").replace(/\/+$/, "");

/* El icono es el mismo monograma de la app: la inicial sobre el color del
   club. Sin escudos, que no son nuestros. Va como SVG embebido, así no hay
   que generar treinta imágenes ni tener un navegador para armarlas.    */
const icono = c => "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
  `<rect width="64" height="64" rx="14" fill="${c.color}"/>` +
  `<text x="32" y="44" font-family="system-ui,sans-serif" font-size="36" font-weight="800" ` +
  `text-anchor="middle" fill="${tintaSobre(c.color)}">${c.ini}</text></svg>`);

const contador = CFG.contador
  ? `\n<script data-goatcounter="https://${CFG.contador}.goatcounter.com/count"` +
    ` async src="//gc.zgo.at/count.js"></script>` : "";

function cabeza(club) {
  const titulo = club.nom + " · Armá el 11";
  const desc = "Todo lo que se dice de " + club.nom + " en un solo lugar: noticias, " +
    "videos y números. Y armá el once para el próximo partido.";
  const url = RAIZ ? RAIZ + "/" + club.id + ".html" : "";
  const ic = icono(club);
  return [
    `<title>${esc(titulo)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="theme-color" content="${esc(club.color)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Armá el 11">`,
    `<meta property="og:locale" content="es_AR">`,
    `<meta property="og:title" content="${esc(titulo)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    url ? `<meta property="og:url" content="${esc(url)}">` : "",
    url ? `<link rel="canonical" href="${esc(url)}">` : "",
    `<meta name="twitter:card" content="summary">`,
    `<link rel="icon" href="${ic}">`,
    `<link rel="apple-touch-icon" href="${ic}">`,
    `<link rel="manifest" href="datos/app-${club.id}.webmanifest">`,
    `<meta name="mobile-web-app-capable" content="yes">`,
  ].filter(Boolean).join("\n");
}

let hechos = 0, sinFeed = [], conJuego = 0;

for (const club of CLUBES) {
  const feed = aca("./feed-" + club.id + ".js");
  if (!existsSync(feed)) { sinFeed.push(club.nom); continue; }
  copyFileSync(feed, new URL("feed-" + club.id + ".js", DATOS));

  const juego = aca("./sitio/datos/cache-" + club.id + ".js");
  const hayJuego = existsSync(juego);
  if (hayJuego) conJuego++;

  /* Los datos entran ANTES del script de la app, en este orden. */
  const tags = [
    '<script>window.SITIO=' + JSON.stringify({
        miniaturas: CFG.miniaturas || "todas",
        /* Solo estas dos, nunca el objeto entero: lo que se copia a mano en
           un archivo de configuración termina en la página, y ahí no debería
           viajar nada que no haga falta. */
        supabase: HAY_BACKEND ? { url: CFG.supabase.url, anon: CFG.supabase.anon } : undefined,
      }) + '</script>',
    HAY_BACKEND ? '<script src="datos/cuentas.js"></script>' : null,
    FECHA ? '<script src="datos/fantasy.js"></script>' : null,
    FECHA ? '<script src="datos/fecha.js"></script>' : null,
    '<script src="datos/juego.js"></script>',
    '<script src="datos/stats-liga.js"></script>',
    '<script src="datos/feed-' + club.id + '.js"></script>',
    hayJuego ? '<script src="datos/cache-' + club.id + '.js"></script>' : null,
  ].filter(Boolean).join("\n");

  let html = TPL.replace("<script>\n/*DATOS*/", tags + "\n<script>");
  if (html === TPL) { console.log("  ✗ no encontré dónde meter los datos"); process.exit(1); }

  html = html.replace(/<title>[\s\S]*?<\/title>/i, cabeza(club));
  html = html.replace("</body>", contador + "\n</body>");
  writeFileSync(new URL(club.id + ".html", SITIO), html);

  /* Agregado a la pantalla de inicio, abre en su club y con sus colores. */
  writeFileSync(new URL("app-" + club.id + ".webmanifest", DATOS), JSON.stringify({
    name: club.nom + " · Armá el 11", short_name: club.nom,
    start_url: "../" + club.id + ".html", scope: "../", display: "standalone",
    background_color: club.color, theme_color: club.color,
    icons: [{ src: icono(club), sizes: "any", type: "image/svg+xml", purpose: "any" }],
  }, null, 1));
  hechos++;
}

/* ─── la portada ──────────────────────────────────────────────────────────
   Sin escudos: monograma sobre el color del club, igual que en la app.   */
/* El nombre y la ciudad van APILADOS, no uno al lado del otro.
   Estaban en la misma fila con la ciudad empujada a la derecha, y eso
   funciona mientras todos los nombres entren en un renglón. No entran:
   "Independiente Rivadavia" ocupa dos y le come el lugar a "Mendoza";
   "Aldosivi" deja tanto aire que "Mar del Plata" se parte en tres.
   Apilados, el largo del nombre deja de pelearse con el de la ciudad. */
const tarjeta = c => {
  const tinta = tintaSobre(c.color);
  return `<a class="club" href="${c.id}.html" style="--c:${c.color};--c2:${c.color2};--t:${tinta}">
    <span class="mono">${esc(c.ini)}</span>
    <span class="txt"><span class="nom">${esc(c.nom)}</span>${
      c.ciudad ? `<span class="ciu">${esc(c.ciudad)}</span>` : ""}</span></a>`;
};

/* Mismo criterio que el motor de color: se comparan los dos contrastes y
   gana el que lee mejor, en vez de partir la luminancia por un umbral. */
function tintaSobre(hex) {
  const lin = v => (v /= 255) <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
  const L = h => { const n = parseInt(h.slice(1), 16);
    return .2126 * lin(n >> 16 & 255) + .7152 * lin(n >> 8 & 255) + .0722 * lin(n & 255); };
  const CT = (a, b) => { const x = L(a), y = L(b);
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  return CT("#101418", hex) >= CT("#FFFFFF", hex) ? "#101418" : "#FFFFFF";
}

const orden = [...CLUBES].filter(c => existsSync(aca("./feed-" + c.id + ".js")))
  .sort((a, b) => a.nom.localeCompare(b.nom, "es"));

writeFileSync(new URL("index.html", SITIO), `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Armá el 11 · elegí tu equipo</title>
<meta name="description" content="Todo lo que se dice de tu equipo del fútbol argentino, en un solo lugar: noticias, videos y números de los 30 clubes.">
<meta name="theme-color" content="#101418">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Armá el 11">
<meta property="og:locale" content="es_AR">
<meta property="og:title" content="Armá el 11 · elegí tu equipo">
<meta property="og:description" content="Todo lo que se dice de tu equipo del fútbol argentino, en un solo lugar. 30 clubes.">
${RAIZ ? `<meta property="og:url" content="${RAIZ}/">\n<link rel="canonical" href="${RAIZ}/">` : ""}
<meta name="twitter:card" content="summary">
<link rel="icon" href="${icono({color:"#101418", ini:"11"})}">
<style>
  :root{ --fondo:#F7F8FA; --papel:#FFFFFF; --texto:#101418; --suave:#57606E; --borde:#E3E6EC; }
  @media (prefers-color-scheme: dark){
    :root{ --fondo:#0D1013; --papel:#161A1F; --texto:#F2F4F7; --suave:#98A2B3; --borde:#242A31; } }
  *{box-sizing:border-box}
  body{margin:0;background:var(--fondo);color:var(--texto);
    font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    padding:28px 18px 60px;-webkit-font-smoothing:antialiased}
  .caja{max-width:760px;margin:0 auto}
  h1{font-size:26px;letter-spacing:-.02em;margin:0 0 4px}
  p.baja{color:var(--suave);margin:0 0 26px;font-size:15px}
  .grilla{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
  .club{display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:13px;
    background:var(--papel);border:1px solid var(--borde);text-decoration:none;color:inherit}
  .club:hover{border-color:var(--c)}
  .mono{width:34px;height:34px;flex:none;border-radius:9px;background:var(--c);color:var(--t);
    display:grid;place-items:center;font-weight:800;font-size:16px;
    box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--c2) 55%,transparent)}
  .txt{display:flex;flex-direction:column;min-width:0;line-height:1.25}
  .nom{font-weight:650;letter-spacing:-.01em}
  .ciu{color:var(--suave);font-size:12px;margin-top:1px}
  footer{margin-top:34px;color:var(--suave);font-size:13px;line-height:1.7}
  footer b{color:var(--texto);font-weight:600}
</style></head><body>
<div class="caja">
  <h1>Elegí tu equipo</h1>
  <p class="baja">Todo lo que se dice de tu club, en un solo lugar. ${orden.length} equipos.</p>
  <div class="grilla">${orden.map(tarjeta).join("\n")}</div>
  <footer>
    <b>Armá el 11 es independiente.</b> No está afiliado ni tiene relación con ningún club
    ni con la Liga Profesional. Los nombres se usan para identificar a los equipos.
    Los videos se enlazan a sus reproductores originales; acá no se aloja ninguno.
  </footer>
</div></body>${contador}</html>
`);

/* Pages sirve tal cual lo que hay: sin esto trata la carpeta como un sitio
   Jekyll y se saltea todo lo que empiece con guion bajo. */
writeFileSync(new URL(".nojekyll", SITIO), "");

/* El dominio propio. GitHub lo lee también de Settings → Pages, pero el
   archivo va igual: si algún día se publica desde otro lado, el dominio
   viaja con el sitio en vez de vivir solo en una pantalla de configuración
   que nadie recuerda haber tocado. */
/* Y si se saca el dominio, el archivo se BORRA. Dejarlo sería peor que no
   haberlo puesto nunca: GitHub seguiría contestando en una dirección que ya
   no apunta a ningún lado, y el sitio quedaría inalcanzable por las dos. */
const CNAME = new URL("CNAME", SITIO);
if (DOM) writeFileSync(CNAME, DOM + "\n");
else if (existsSync(CNAME)) rmSync(CNAME);

console.log("\n  sitio/  ·  " + hechos + " clubes  ·  " +
            conJuego + " con datos del juego cargados");
if (sinFeed.length) console.log("  sin feed todavía: " + sinFeed.join(", "));
console.log("  abrí sitio/index.html para verlo\n");
