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
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";

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

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

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
    '<script src="datos/juego.js"></script>',
    '<script src="datos/stats-liga.js"></script>',
    '<script src="datos/feed-' + club.id + '.js"></script>',
    hayJuego ? '<script src="datos/cache-' + club.id + '.js"></script>' : null,
  ].filter(Boolean).join("\n");

  let html = TPL.replace("<script>\n/*DATOS*/", tags + "\n<script>");
  if (html === TPL) { console.log("  ✗ no encontré dónde meter los datos"); process.exit(1); }

  html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + esc(club.nom) + " · TSTE</title>");
  writeFileSync(new URL(club.id + ".html", SITIO), html);
  hechos++;
}

/* ─── la portada ──────────────────────────────────────────────────────────
   Sin escudos: monograma sobre el color del club, igual que en la app.   */
const tarjeta = c => {
  const tinta = tintaSobre(c.color);
  return `<a class="club" href="${c.id}.html" style="--c:${c.color};--c2:${c.color2};--t:${tinta}">
    <span class="mono">${esc(c.ini)}</span><span class="nom">${esc(c.nom)}</span>
    ${c.ciudad ? `<span class="ciu">${esc(c.ciudad)}</span>` : ""}</a>`;
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
<title>TSTE · elegí tu equipo</title>
<meta name="description" content="Todo lo que se dice de tu equipo, en un solo lugar.">
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
  .nom{font-weight:650;letter-spacing:-.01em}
  .ciu{margin-left:auto;color:var(--suave);font-size:12px;text-align:right}
  footer{margin-top:34px;color:var(--suave);font-size:13px;line-height:1.7}
  footer b{color:var(--texto);font-weight:600}
</style></head><body>
<div class="caja">
  <h1>Elegí tu equipo</h1>
  <p class="baja">Todo lo que se dice de tu club, en un solo lugar. ${orden.length} equipos.</p>
  <div class="grilla">${orden.map(tarjeta).join("\n")}</div>
  <footer>
    <b>TSTE es independiente.</b> No está afiliado ni tiene relación con ningún club
    ni con la Liga Profesional. Los nombres se usan para identificar a los equipos.
    Los videos se enlazan a sus reproductores originales; acá no se aloja ninguno.
  </footer>
</div></body></html>
`);

/* Pages sirve tal cual lo que hay: sin esto trata la carpeta como un sitio
   Jekyll y se saltea todo lo que empiece con guion bajo. */
writeFileSync(new URL(".nojekyll", SITIO), "");

console.log("\n  sitio/  ·  " + hechos + " clubes  ·  " +
            conJuego + " con datos del juego cargados");
if (sinFeed.length) console.log("  sin feed todavía: " + sinFeed.join(", "));
console.log("  abrí sitio/index.html para verlo\n");
