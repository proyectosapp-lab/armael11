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

/* ─── LAS LIGAS PARA SIMULAR ─────────────────────────────────────────────
   Las escribe `ligas-api.mjs` directo en sitio/datos/. Acá solo se arman los
   <script> de las que EXISTEN: si la corrida no las pudo bajar, la app es
   exactamente la de antes y el selector no aparece. */
const LIGAS_LISTAS = existsSync(new URL("ligas.js", DATOS))
  ? (() => { try {
      const txt = readFileSync(new URL("ligas.js", DATOS), "utf8");
      const m = txt.match(/=(\[[^\]]*\])/);
      return m ? JSON.parse(m[1]) : [];
    } catch (e) { return []; } })()
  : [];
const TAGS_LIGAS = LIGAS_LISTAS.length
  ? ['<script src="datos/ligas.js"></script>',
     ...LIGAS_LISTAS.map(sl => '<script src="datos/liga-' + sl + '.js"></script>')]
  : [];

/* El registro del service worker. Va en las dos plantillas —la portada y
   las páginas de club— porque la app puede arrancar en cualquiera de las
   dos, y el que registra tiene que ser el primero que se abre.

   `catch` vacío a propósito: si el navegador no lo soporta o el usuario lo
   tiene bloqueado, la app anda exactamente igual. Un service worker que no
   se registra no puede ser un motivo para romper nada. */
const REGISTRO_SW = '<script>if("serviceWorker" in navigator)' +
  'addEventListener("load",function(){navigator.serviceWorker.register("/sw.js")' +
  '.catch(function(){})})</script>';

/* ══════════════════ EL RESCATE DE LA SESIÓN ══════════════════
   Va en la PORTADA y no en las páginas de club, y es por un caso concreto
   que nos costó un día:

   El link que Supabase manda por mail vuelve con la sesión en el hash de la
   dirección. Pero Supabase solo redirige a las direcciones de su lista
   blanca; si la de destino no está, redirige a la Site URL — que es la
   portada. Y la portada no cargaba `cuentas.js`, así que el token llegaba,
   nadie lo leía, y la persona terminaba en la lista de clubes sin sesión y
   sin ningún error a la vista. "El link no anda."

   Esto lo rescata: si llega un token acá, se guarda. Como el guardado es
   por ORIGEN, con eso ya queda la sesión puesta para todas las páginas del
   sitio, y se manda a la persona de vuelta a la de su club.

   Es una red, no la solución: lo correcto es tener bien la lista blanca en
   Supabase. Pero una configuración que no se ve no puede ser lo único que
   separa a alguien de entrar a su cuenta.                              */
const RESCATE_SESION = HAY_BACKEND ? '<script src="datos/cuentas.js"></script>' +
  '<script>try{if(/access_token=/.test(location.hash)&&capturarVuelta()){' +
  'var v=null;try{v=localStorage.getItem("armaEl11.volviendoDe")}catch(e){}' +
  'if(v&&v.charAt(0)==="/"){try{localStorage.removeItem("armaEl11.volviendoDe")}catch(e){}' +
  'location.replace(v)}}}catch(e){}</script>' : "";


const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

/* ── QUÉ VERSIÓN QUEDÓ PUBLICADA ─────────────────────────────────────────
   Sale de la primera línea de VERSION.txt y va al pie de la app y a un
   <meta>. Existe por una tarde perdida: la app se veía vieja y no había
   forma de saber si la corrida no había publicado o si el navegador estaba
   mostrando algo guardado. Son dos problemas distintos con dos arreglos
   distintos, y sin esto no se distinguen sin abrir el inspector.

   Se le agrega la fecha de la corrida, que es el otro dato que hacía falta:
   una versión igual con fecha nueva quiere decir que SÍ se publicó. */
const VERSION = (() => {
  const linea = existsSync(aca("./VERSION.txt"))
    ? readFileSync(aca("./VERSION.txt"), "utf8").split("\n")[0].trim() : "";
  const m = linea.match(/versi[oó]n\s+(\S+\s+\S+)/i);
  const corta = m ? m[1] : "sin versión";
  const hoy = new Date().toISOString().slice(0, 16).replace("T", " ");
  return corta + " · publicado " + hoy + " UTC";
})();
console.log("  versión publicada: " + VERSION);

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

/* ══════════════════ LA PUBLICIDAD ══════════════════
   Hoy `sitio.json` NO tiene bloque `publicidad`, así que esto es la cadena
   vacía y la app no carga un solo script de terceros: una propiedad del
   proyecto que tiene su propia prueba y que hay que romper A PROPÓSITO.

   El día que AdSense apruebe la cuenta, se agrega esto a sitio.json:

       "publicidad": { "cliente": "ca-pub-0000000000000000" }

   y con eso entra el script y `window.SITIO.publicidad` pasa a existir, que
   es lo único que mira `hayRed()` adentro de la app. Las reglas de cuándo
   corresponde un aviso —una por minuto, la primera simulación gratis, nunca
   al que pagó— ya están escritas y probadas desde la versión anterior. Esto
   es solo el enchufe.

   Va con `crossorigin` porque Google lo pide, y `async` para que un problema
   de su servidor no frene el dibujado de la página: un aviso que tarda no
   puede hacer esperar al partido.                                       */
const PUB = (CFG.publicidad && CFG.publicidad.cliente) ? CFG.publicidad : null;
const publicidad = PUB
  ? `\n<script async crossorigin="anonymous" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUB.cliente}"></script>`
  : "";
if (PUB) console.log("  publicidad: ENCENDIDA (" + PUB.cliente + ")");

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
    REGISTRO_SW,
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
        /* Solo el id de cliente, que igual va a la vista en el script de
           Google. Lo que la app necesita saber es SI hay red de publicidad,
           no su configuración. */
        publicidad: PUB ? { cliente: PUB.cliente } : undefined,
      }) + '</script>',
    HAY_BACKEND ? '<script src="datos/cuentas.js"></script>' : null,
    FECHA ? '<script src="datos/fantasy.js"></script>' : null,
    FECHA ? '<script src="datos/fecha.js"></script>' : null,
    '<script src="datos/juego.js"></script>',
    ...TAGS_LIGAS,
    '<script src="datos/stats-liga.js"></script>',
    '<script src="datos/feed-' + club.id + '.js"></script>',
    hayJuego ? '<script src="datos/cache-' + club.id + '.js"></script>' : null,
  ].filter(Boolean).join("\n");

  let html = TPL.replace("<script>\n/*DATOS*/", tags + "\n<script>");
  if (html === TPL) { console.log("  ✗ no encontré dónde meter los datos"); process.exit(1); }
  if (!html.includes("{{VERSION}}")) {
    console.log("  ✗ falta el marcador {{VERSION}} en app.tpl.html: sin eso la");
    console.log("    página publicada no dice qué versión es, que es justo el dato");
    console.log("    que hace falta cuando algo se ve viejo.");
    process.exit(1);
  }
  html = html.replaceAll("{{VERSION}}", esc(VERSION));

  html = html.replace(/<title>[\s\S]*?<\/title>/i, cabeza(club));
  html = html.replace("</body>", contador + publicidad + "\n</body>");
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
<link rel="manifest" href="/app.webmanifest">
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
    <br><a href="/privacidad.html">Privacidad</a> · <a href="/borrar-cuenta.html">Borrar mi cuenta</a>
  </footer>
</div>${RESCATE_SESION}${REGISTRO_SW}</body>${contador}${publicidad}</html>
`);

/* Pages sirve tal cual lo que hay: sin esto trata la carpeta como un sitio
   Jekyll y se saltea todo lo que empiece con guion bajo. */
writeFileSync(new URL(".nojekyll", SITIO), "");

/* ══════════════════ LAS DOS PÁGINAS QUE PIDE PLAY ══════════════════
   Una política de privacidad con dirección propia, y una página para borrar
   la cuenta SIN INSTALAR NADA. Las dos son requisito para publicar, pero
   además son la parte del trato que le toca al que dejó su mail.

   Se escriben acá y no a mano en un archivo suelto por una razón: lo que
   dicen tiene que seguir siendo verdad. Si mañana se guarda un dato más, el
   que lo agrega pasa por este archivo. Una política que vive en un HTML que
   nadie vuelve a abrir envejece mintiendo.                              */
const pagina = (titulo, cuerpo) => `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(titulo)} · Armá el 11</title>
<meta name="robots" content="index,follow">
<link rel="icon" href="${icono({color:"#0B4F3A", ini:"11"})}">
<style>
  :root{ --fondo:#F7F8FA; --papel:#FFFFFF; --texto:#101418; --suave:#57606E; --borde:#E3E6EC; }
  @media (prefers-color-scheme: dark){
    :root{ --fondo:#0D1013; --papel:#161A1F; --texto:#F2F4F7; --suave:#98A2B3; --borde:#242A31; } }
  *{box-sizing:border-box}
  body{margin:0;background:var(--fondo);color:var(--texto);
    font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    padding:32px 18px 70px;-webkit-font-smoothing:antialiased}
  .caja{max-width:660px;margin:0 auto}
  h1{font-size:26px;letter-spacing:-.02em;margin:0 0 6px}
  h2{font-size:15px;letter-spacing:.04em;text-transform:uppercase;color:var(--suave);
     margin:30px 0 8px}
  p{margin:0 0 12px}
  ul{margin:0 0 12px;padding-left:20px} li{margin:4px 0}
  .fecha{color:var(--suave);font-size:14px;margin-bottom:26px}
  .caja2{background:var(--papel);border:1px solid var(--borde);border-radius:13px;
    padding:16px 18px;margin:18px 0}
  a{color:inherit}
  footer{margin-top:36px;padding-top:16px;border-top:1px solid var(--borde);
    color:var(--suave);font-size:14px}
</style></head><body><div class="caja">${cuerpo}
<footer><a href="/">Volver a Armá el 11</a></footer></div></body></html>
`;

const HOY = new Date().toISOString().slice(0, 10).split("-").reverse().join("/");
const CONTACTO = (CFG.contacto || "").trim();

writeFileSync(new URL("privacidad.html", SITIO), pagina("Privacidad", `
<h1>Qué guardamos, y qué no</h1>
<p class="fecha">Actualizado el ${HOY}</p>

<p>Armá el 11 se puede usar entero sin cuenta: mirar el feed de tu club,
   armar el once, simular partidos y ver los números. <b>Sin cuenta no
   guardamos nada tuyo.</b></p>

<h2>Lo que se guarda si creás una cuenta</h2>
<ul>
  <li><b>Tu correo electrónico.</b> Es la única forma de entrar: te mandamos
      un link y no hay contraseña. Se usa para eso y nada más.</li>
  <li><b>Un nombre de usuario</b> que elegís vos. Es lo único que ven los
      demás en las tablas: no pedimos tu nombre real.</li>
  <li><b>Los equipos que armás</b> en cada fecha y los puntajes que sacan.</li>
  <li><b>En qué torneos de amigos estás.</b></li>
</ul>
<p>No pedimos ni guardamos nombre real, teléfono, ubicación, contactos ni
   datos de pago.</p>

<h2>Con quién se comparte</h2>
<p>Con nadie. No vendemos ni cedemos datos, y no hay rastreadores de terceros
   en el sitio. Tu correo no se muestra a otros usuarios en ningún lado.</p>
<p>Para funcionar usamos dos servicios que ven parte de esto: <b>Supabase</b>,
   donde vive la base de datos, y <b>Brevo</b>, que despacha el correo con el
   link para entrar.</p>

<h2>Los datos del fútbol</h2>
<p>Los resultados, planteles y estadísticas vienen de API-Football. Las
   noticias y videos se enlazan a los medios que los publicaron: acá no se
   aloja ninguno. Armá el 11 es independiente y no tiene relación con ningún
   club ni con la Liga Profesional.</p>

<h2>Borrar todo</h2>
<div class="caja2">
  <p style="margin:0">Podés borrar tu cuenta y todo lo que guardamos, en
     cualquier momento y sin pedírselo a nadie, desde la propia app o desde
     <a href="/borrar-cuenta.html">esta página</a>. Es inmediato y no se puede
     deshacer.</p>
</div>

<h2>Cambios</h2>
<p>Si alguna vez guardamos algo más de lo que dice esta página, va a decirlo
   acá antes de que pase, con la fecha cambiada.</p>
${CONTACTO ? `<h2>Contacto</h2><p>Cualquier duda: <a href="mailto:${esc(CONTACTO)}">${esc(CONTACTO)}</a></p>` : ""}
`));

writeFileSync(new URL("borrar-cuenta.html", SITIO), pagina("Borrar mi cuenta", `
<h1>Borrar tu cuenta</h1>
<p class="fecha">Sin instalar nada y sin escribirle a nadie.</p>

<p>Entrá con tu correo, abrí el panel de tu cuenta arriba a la derecha y tocá
   <b>Borrar mi cuenta</b>. Te va a pedir una confirmación y listo.</p>

<div class="caja2">
  <p style="margin:0 0 10px"><b>Qué se borra, en el acto:</b></p>
  <ul style="margin:0">
    <li>Tu correo electrónico y tu nombre de usuario</li>
    <li>Los equipos que armaste y todos tus puntajes</li>
    <li>Tu lugar en las tablas de los torneos donde estabas</li>
  </ul>
  <p style="margin:12px 0 0"><b>Qué no:</b> los torneos que hayas creado
     siguen existiendo para los demás. Si desaparecieran con vos, once
     personas que no tienen nada que ver se quedarían sin su torneo.</p>
</div>

<p>No queda nada guardado ni hay período de gracia: cuando confirmás, se borra.
   Si después querés volver, es una cuenta nueva desde cero.</p>

<p style="margin-top:22px"><a href="/">Ir a Armá el 11 para entrar y borrarla</a></p>
${CONTACTO ? `<p>Si no podés entrar a tu cuenta, escribinos a <a href="mailto:${esc(CONTACTO)}">${esc(CONTACTO)}</a> desde el mismo correo y la borramos nosotros.</p>` : ""}
`));

/* ══════════════════ LA VUELTA DE MERCADO PAGO ══════════════════
   Mercado Pago manda a la persona acá cuando termina. Esta página tiene UNA
   regla y es la que le da toda su forma:

   NO PUEDE AFIRMAR QUE EL PAGO ENTRÓ. Lo único que sabe es lo que dice la
   dirección, y la dirección la puede escribir cualquiera. Quien confirma el
   pago es el servidor, por su cuenta, hablando con Mercado Pago. Si esta
   página dijera "listo, ya sos premium" estaría repitiendo un dato que no
   verificó — y peor: el que llegue con `?estado=approved` escrito a mano
   leería lo mismo que el que pagó de verdad, y después no le va a funcionar
   nada. Así que dice lo que sí sabe: "volvé a la app y fijate".

   Por eso tampoco pide sesión ni habla con la base: es un cartel y un
   botón. Todo lo que importa lo revisa la app al volver.                 */
writeFileSync(new URL("gracias.html", SITIO), pagina("Volviendo del pago", `
<h1 id="tit">Gracias</h1>
<p class="fecha" id="sub">Estamos confirmando el pago con Mercado Pago.</p>

<div class="caja2">
  <p style="margin:0" id="txt">La confirmación la hace el servidor por su
     lado, así que puede tardar unos segundos. Volvé a la app: en cuanto
     figure, el pase aparece solo en tu cuenta.</p>
</div>

<p style="margin-top:22px"><a href="/" id="volver"><b>Volver a Armá el 11</b></a></p>
<p style="color:var(--suave);font-size:14px">Si pasan unos minutos y el pase
   no aparece, no vuelvas a pagar: escribinos${CONTACTO
     ? ` a <a href="mailto:${esc(CONTACTO)}">${esc(CONTACTO)}</a>` : ""} y lo
   resolvemos. Un pago cobrado siempre se puede acreditar a mano.</p>

<script>
/* El estado viene en la dirección y por eso no se le cree para nada que
   importe: solo cambia el texto. Lo que se compró se lee de la base. */
var q = new URLSearchParams(location.search);
var e = q.get("estado") || q.get("status") || "";
if (/falló|failure|rejected/i.test(e)) {
  document.getElementById("tit").textContent = "No se completó";
  document.getElementById("sub").textContent = "El pago no se hizo. No se te cobró nada.";
  document.getElementById("txt").textContent =
    "Podés intentarlo de nuevo desde el panel de tu cuenta, con el mismo medio de pago u otro.";
} else if (/pendiente|pending|in_process/i.test(e)) {
  document.getElementById("tit").textContent = "Quedó pendiente";
  document.getElementById("sub").textContent = "Es normal si elegiste efectivo o transferencia.";
  document.getElementById("txt").textContent =
    "Cuando Mercado Pago lo acredite, el pase se activa solo. No hace falta que hagas nada, " +
    "y no hay que pagar de nuevo.";
}
/* De qué página salió. Lo guarda la app antes de mandar a Mercado Pago: sin
   esto, el que pagó desde la página de su club vuelve a la portada. */
try {
  var v = localStorage.getItem("armaEl11.volverA");
  if (v && v.charAt(0) === "/") document.getElementById("volver").setAttribute("href", v);
} catch (err) {}
</script>
`));

/* ══════════════════ LO QUE HACE FALTA PARA EMPAQUETARLA ══════════════════
   Play acepta un sitio envuelto —se llama Trusted Web Activity— pero le pide
   cuatro cosas. Las tres primeras se generan acá; la cuarta son los íconos,
   que viven en el repo porque generarlos necesita un navegador y en la nube
   no hay ninguno. */

/* 1. EL SERVICE WORKER. Es lo que hace que la app conteste algo sin señal, y
      Play lo mide. Se copia tal cual desde la raíz del repo. */
if (existsSync(aca("./sw.js"))) copyFileSync(aca("./sw.js"), new URL("sw.js", SITIO));
else console.log("  ⚠ falta sw.js: sin él la app no pasa el control de calidad de Play");

/* 2. LOS ÍCONOS. En PNG y de verdad, no los SVG que usa la web: Play pide un
      512×512 para la ficha y uno "maskable" para que Android lo recorte con
      la forma de cada teléfono sin comerse las puntas. Los genera
      `iconos.cjs`, a mano y cada muerte de obispo. */
const ICONOS = ["sitio-icono-192.png", "sitio-icono-512.png", "sitio-icono-mask-512.png"];
const iconosListos = ICONOS.every(f => existsSync(aca("./" + f)));
if (iconosListos) for (const f of ICONOS) copyFileSync(aca("./" + f), new URL(f, SITIO));
else console.log("  ⚠ faltan los íconos PNG: la app se puede envolver igual, " +
                 "pero la ficha de Play los va a pedir");

/* 3. EL MANIFEST DE LA APP. Los treinta que ya hay son por club y arrancan
      cada uno en su página; sirven para el que agrega el sitio a la pantalla
      de inicio y no se tocan. Una APP necesita otra cosa: UNA puerta de
      entrada. Esta arranca en la lista de clubes, que es de donde se llega
      tanto al club propio como al simulador de otras ligas. */
writeFileSync(new URL("app.webmanifest", SITIO), JSON.stringify({
  name: "Armá el 11",
  short_name: "Armá el 11",
  description: "Armá tu once, simulá el partido y competí con tus amigos.",
  start_url: "/",
  scope: "/",
  id: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#0B4F3A",
  theme_color: "#0B4F3A",
  lang: "es-AR",
  icons: iconosListos ? [
    { src: "/sitio-icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/sitio-icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/sitio-icono-mask-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ] : [],
}, null, 1) + "\n");

/* 4. EL ASSETLINKS. Es el papel que le demuestra a Android que la app y el
      dominio son de la misma persona; sin él la app abre con la barra del
      navegador encima y Play lo cuenta como falla.

      NO se escribe un archivo de mentira mientras no esté la huella de la
      firma: un assetlinks con datos inventados no falla en silencio, falla
      en la cara del usuario cada vez que abre la app. Se genera SOLO cuando
      `sitio.json` trae la huella que da Play al firmar el paquete, igual que
      el CNAME con el dominio. Y si se saca, se borra. */
const APP = CFG.android || {};
const wellKnown = new URL(".well-known/", SITIO);
const ASSETLINKS = new URL("assetlinks.json", wellKnown);
if (APP.paquete && APP.huella) {
  mkdirSync(wellKnown, { recursive: true });
  writeFileSync(ASSETLINKS, JSON.stringify([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: APP.paquete,
              sha256_cert_fingerprints: [].concat(APP.huella) },
  }], null, 1) + "\n");
} else if (existsSync(ASSETLINKS)) rmSync(ASSETLINKS);

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
