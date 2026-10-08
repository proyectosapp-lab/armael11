/* ══════════════════════════════════════════════════════════════════════════
   LAS PÁGINAS DE "ESTÁ MEDIDO" — texto de verdad, servido como HTML común.

   27/9/2026. Nacen de un rechazo de AdSense por "contenido de bajo valor", y
   el diagnóstico fue un número: la portada tenía **65 palabras visibles sin
   JavaScript**, y la única frase con contenido era "los títulos pertenecen a
   cada medio". Google miró el sitio y encontró un cascarón que decía que el
   contenido era de otros.

   Mientras tanto, el mejor material del proyecto —el empate y el techo, la
   moneda, la liga argentina medida— vivía en documentos internos y en
   carretes de Instagram. Estas cinco páginas lo ponen donde un buscador lo
   puede leer.

   REGLAS DE ESTE ARCHIVO, QUE NO SON DE ESTILO:

   1. **Ningún número inventado.** Todo lo que se afirma sale de
      `claude/modelo-backtest.md`, `claude/empate-y-techo.md`, `ligas.json` o
      `stats-liga.json`. Lo que se puede leer de un archivo se lee del
      archivo, así la página no envejece mintiendo: si la liga argentina
      cambia sus promedios, la página cambia con la próxima publicación.

   2. **Nada de pronósticos de partidos que no se jugaron.** Decisión de
      Fausto (27/9): el número de un partido por jugar vive adentro del
      simulador. Estas páginas explican el modelo; no lo reemplazan.

   3. **Las palabras de siempre, afuera**: cuota, pick, fija, value, acertá,
      ganale a la casa, eficacia, el único. Y no se nombra a las casas de
      apuestas. Hay una prueba que lo mira.

      Y desde el 28/9, ni "apuestas" negado: estas páginas viajan adentro de
      la app del iPhone, y Apple la clasificó como relacionada con apuestas
      (2.3.6). "No tiene apuestas" también pone el tema sobre la mesa.

   4. **Sin ordenar ligas por medio punto.** La diferencia entre Perú y
      Alemania es más chica que el margen de la medición, así que la página
      las pone en el mismo grupo en vez de inventar un tercer puesto.
   ══════════════════════════════════════════════════════════════════════════ */

const esc = s => String(s ?? "").replace(/[&<>"]/g,
  c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

/* Coma decimal, como se lee acá. */
const num = (x, d = 1) => Number(x).toFixed(d).replace(".", ",");

/* ── LOS DATOS FIJOS DEL MODELO ──────────────────────────────────────────
   Son de la medición cerrada, no de la temporada en curso: no cambian con
   cada publicación, y por eso viven acá y no en un archivo de datos. Si
   algún día se vuelve a medir, se cambian acá y en `modelo-backtest.md`
   juntos. */
export const MEDIDO = {
  simulaciones: 6000,
  partidosMedidos: 13345,
  ligasMedidas: 13,
  limpia: { partidos: 1783, acierto: 52.9, t: 11.1,
            ligas: [["Portugal", 53.9, 588], ["Países Bajos", 52.7, 601], ["Alemania", 52.0, 594]] },
  portugal: { brier: 0.5575, vara: 0.6553, t: 8.3 },
  /* t de cada liga → caras de cien tiros. Ver `empate-y-techo.md`.
     La tercera columna es LO QUE SE PUBLICA, y es la misma en el carrete de
     Instagram, en el documento y acá. Portugal da 91,5 y se publica 90:
     redondeado para abajo, la regla del proyecto. Una prueba mira que
     ninguna cifra publicada pase la cuenta exacta de `carasDe`. */
  monedas: [["Portugal", 8.3, 90], ["Brasil", 3.2, 66], ["Argentina", 0.9, 54]],
  literatura: { rango: "51-52%", challenge: 51.94, varaSimple: 50.49, techo: 58 },
};

/* En cien tiros el azar se mueve unas cinco caras: cada punto de t son
   cinco más. Se redondea PARA ABAJO, que es la regla del proyecto: un
   número que se queda corto nunca hay que salir a defenderlo. */
export const carasDe = t => Math.floor(50 + 5 * t);

/* La cifra publicada de una liga. Nunca se calcula en el momento: sale de
   la tabla, que es la misma que usan el carrete y el documento. */
export const caras = pais => (MEDIDO.monedas.find(m => m[0] === pais) || [])[2];

/* ── LOS GRUPOS DE LIGAS ─────────────────────────────────────────────────
   Por la ventaja sobre la vara que ya usa la app. Los cortes están donde
   hay distancia de verdad entre una liga y la siguiente, no donde queda
   lindo: adentro de cada grupo las diferencias son más chicas que el margen
   de la medición, y el orden interno no dice nada. */
export function gruposDeLigas(ligas) {
  const L = (ligas || []).filter(l => typeof l.ventajaBacktest === "number")
    .slice().sort((a, b) => b.ventajaBacktest - a.ventajaBacktest);
  const en = (min, max) => L.filter(l => l.ventajaBacktest >= min && l.ventajaBacktest < max);
  return {
    mejor:     en(0.060, 1),
    peloton:   en(0.035, 0.060),
    dificiles: en(0.015, 0.035),
    brava:     en(-1,    0.015),
  };
}

/* ── EL ARMAZÓN ──────────────────────────────────────────────────────────
   La misma tipografía y los mismos colores que la política de privacidad,
   que ya están bien: letra del sistema, sin fuentes de afuera, claro y
   oscuro. Lo nuevo es lo que un buscador necesita para entender la página
   —descripción, dirección canónica— y una navegación entre las cinco. */
export const PAGINAS = [
  { archivo: "como-funciona.html",       corto: "Cómo funciona" },
  { archivo: "el-techo-del-futbol.html", corto: "El techo del fútbol" },
  { archivo: "es-suerte.html",           corto: "¿Es suerte?" },
  { archivo: "ligas.html",               corto: "Cada liga" },
  { archivo: "liga-argentina.html",      corto: "La liga argentina" },
];

/* El estilo de estas páginas, compartido con las de consulta
   (`consulta.mjs`) para que todo el sitio de texto se vea igual. */
export const CSS = `  :root{ --fondo:#F7F8FA; --papel:#FFFFFF; --texto:#101418; --suave:#57606E;
         --borde:#E3E6EC; --verde:#1E8A4A; }
  @media (prefers-color-scheme: dark){
    :root{ --fondo:#0D1013; --papel:#161A1F; --texto:#F2F4F7; --suave:#98A2B3;
           --borde:#242A31; --verde:#3DD17A; } }
  *{box-sizing:border-box}
  body{margin:0;background:var(--fondo);color:var(--texto);
    font:17px/1.7 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    padding:28px 18px 70px;-webkit-font-smoothing:antialiased}
  .caja{max-width:680px;margin:0 auto}
  .marca{font-size:14px;font-weight:700;color:var(--suave);text-decoration:none}
  nav{font-size:14px;color:var(--suave);margin:10px 0 30px;line-height:1.9}
  nav a{color:var(--suave)} nav b{color:var(--texto)}
  h1{font-size:31px;line-height:1.18;letter-spacing:-.02em;margin:0 0 12px}
  .bajada{font-size:19px;color:var(--suave);margin:0 0 30px}
  h2{font-size:21px;letter-spacing:-.01em;margin:38px 0 10px;line-height:1.3}
  p{margin:0 0 14px}
  ul,ol{margin:0 0 14px;padding-left:22px} li{margin:5px 0}
  a{color:inherit}
  .dato{background:var(--papel);border:1px solid var(--borde);border-radius:14px;
    padding:16px 18px;margin:20px 0}
  .dato p:last-child{margin:0}
  .grande{font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1.1;
    color:var(--verde)}
  table{border-collapse:collapse;width:100%;margin:6px 0 16px;font-size:16px}
  th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--borde)}
  th{font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--suave)}
  td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .ir{display:inline-block;margin-top:8px;padding:13px 22px;border-radius:999px;
    background:var(--verde);color:#fff;font-weight:700;text-decoration:none}
  .fuentes{font-size:14px;color:var(--suave)}
  footer{margin-top:44px;padding-top:16px;border-top:1px solid var(--borde);
    color:var(--suave);font-size:14px;line-height:1.8}
`;

function armazon({ RAIZ, archivo, titulo, descripcion, cuerpo }) {
  const canon = RAIZ ? RAIZ + "/" + archivo : "";
  const nav = PAGINAS.map(p => p.archivo === archivo
    ? `<b>${esc(p.corto)}</b>`
    : `<a href="/${p.archivo}">${esc(p.corto)}</a>`).join(" · ");
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(titulo)} · Armá el 11</title>
<meta name="description" content="${esc(descripcion)}">
<meta name="robots" content="index,follow">
${canon ? `<link rel="canonical" href="${esc(canon)}">` : ""}
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
${canon ? `<meta property="og:url" content="${esc(canon)}">` : ""}
<style>
${CSS}</style></head><body><div class="caja">
<a class="marca" href="/">Armá el 11</a>
<nav>Está medido: ${nav}<br><a href="${esc(RAIZ)}/consulta/">Partidos y equipos de las once ligas</a></nav>
${cuerpo}
<footer>
  Armá el 11 es una app independiente, sin relación con ningún club ni con
  ninguna liga. Es un simulador: lo único que se compra son más simulaciones.<br>
  <a href="/">Inicio</a> · <a href="/privacidad.html">Privacidad</a> ·
  <a href="/terminos.html">Términos</a> · <a href="/contacto.html">Contacto</a> · <a href="/quienes-somos.html">Quiénes somos</a>
</footer>
</div></body></html>
`;
}

/* ══════════════════════════════════════════════════════════════════════
   LAS CINCO — reescritas el 27/9 con enfoque de marketing.

   La primera versión estaba escrita para defenderse, no para vender. Fausto:
   *"parece el prospecto de un medicamento: si lo leés completo, no lo
   tomás"*. Tenía razón. Estas dicen lo mismo con el número adelante, sin
   explicar de más, y el que las lee tiene que salir con ganas de simular.

   Lo que NO cambió, porque no es tono: ningún número inventado, ningún
   pronóstico de un partido por jugar, ninguna palabra prohibida, y ningún
   "le ganamos a" contra estudios que no son la misma prueba. Marketing es
   elegir qué se dice primero y cómo; no es decir lo que no pasó.
   ══════════════════════════════════════════════════════════════════════ */

const ir = (texto = "Arma tu once") =>
  `<p style="margin:22px 0 6px"><a class="ir" href="/">${esc(texto)}</a></p>`;

function comoFunciona() {
  const M = MEDIDO;
  return {
    archivo: "como-funciona.html",
    titulo: "Cómo funciona: tu once, jugado 6.000 veces",
    descripcion: "Armas el equipo, eliges el planteo y la app juega el partido 6.000 veces. " +
      "En segundos sabes cuánto ganas, cuánto empatas y cuánto pierdes.",
    cuerpo: `
<h1>Tu once, jugado ${M.simulaciones.toLocaleString("es-AR")} veces.</h1>
<p class="bajada">Armas el equipo, eliges el planteo y la app juega el partido
   ${M.simulaciones.toLocaleString("es-AR")} veces. En segundos sabes cuánto
   ganas, cuánto empatas y cuánto pierdes.</p>
${ir()}

<h2>No es un dado</h2>
<p>Con los mismos datos, los mismos números. Si cambias un jugador, el
   resultado se mueve, y se mueve por lo que cambiaste. Sacas al 9, metes un
   volante más, adelantas la línea: cada decisión tiene un precio, y la app
   te lo muestra.</p>

<h2>Lo que sabe de cada equipo</h2>
<p>Cuánto ataca y cuánto defiende, medido con sus goles y comparado con su
   propia liga. Cuánto pesa jugar de local. Y lo que hizo la temporada
   pasada, para que tres goles en la primera fecha no confundan a nadie.</p>

<h2>Lo que pones tú</h2>
<p>El once, la formación y el planteo con un toque: <b>se para atrás, espera
   y sale de contra, va a buscarlo, se juega la vida</b>. Y cuatro perillas
   finas —línea, presión, ancho y ritmo— para el que quiere ajustar más.
   Todo mueve el número.</p>

<h2>Probado antes de mostrártelo</h2>
<p><b>${M.partidosMedidos.toLocaleString("es-AR")} partidos</b> ya jugados, en
   trece ligas. Y la prueba de fuego:
   ${M.limpia.partidos.toLocaleString("es-AR")} partidos en ligas que el modelo
   no había visto nunca. Acertó el <b>${num(M.limpia.acierto)}%</b>, en un
   deporte donde <a href="/el-techo-del-futbol.html">nadie predice al 70%</a>.</p>
<p>Se probó con tiros al arco y con goles esperados. Quedó lo que demostró
   que sirve.</p>
`,
  };
}

function techo({ stats }) {
  const M = MEDIDO, L = M.literatura;
  const p = stats && stats.promedios;
  const arg = p ? ` En la liga argentina, el <b>${num(p.empate)}%</b>.` : "";
  return {
    archivo: "el-techo-del-futbol.html",
    titulo: "Por qué nadie predice fútbol al 70%",
    descripcion: "Uno de cada cuatro partidos no lo acierta nadie. Así se lee de verdad un " +
      "pronóstico de fútbol, y dónde queda el 52,9% de Armá el 11.",
    cuerpo: `
<h1>Nadie predice fútbol al 70%. Ni cerca.</h1>
<p class="bajada">Uno de cada cuatro partidos no lo acierta nadie. Entenderlo
   cambia cómo leés cualquier número.</p>

<h2>Tres resultados, no dos</h2>
<p>Gana uno, gana el otro o empatan. Tirando al azar se acierta uno de cada
   tres: <b>33%</b>. Cualquier número hay que medirlo contra eso, no contra
   una moneda.</p>

<h2>El empate, el que nadie elige</h2>
<p>Casi un cuarto de los partidos termina empatado.${arg} Pero el empate casi
   nunca es el resultado más probable de los tres, así que nadie lo elige:
   ni un modelo, ni un periodista, ni tu amigo que sabe de fútbol.
   <b>Ese cuarto está perdido antes de que empiece el partido.</b></p>

<h2>Dónde está el techo</h2>
<p>Los mejores modelos publicados rondan el <b>${L.rango}</b>. El techo real
   anda cerca del ${L.techo}%. Ese es el fútbol.</p>

<div class="dato">
  <p class="grande">${num(M.limpia.acierto)}%</p>
  <p>Lo que acertó el modelo de Armá el 11 en
     ${M.limpia.partidos.toLocaleString("es-AR")} partidos de ligas que no había
     visto nunca.</p>
</div>
<table>
  <tr><th>Liga</th><th class="n">Acierto</th><th class="n">Partidos</th></tr>
  ${M.limpia.ligas.map(([n, a, k]) =>
    `<tr><td>${esc(n)}</td><td class="n"><b>${num(a)}%</b></td><td class="n">${k}</td></tr>`).join("\n  ")}
</table>

<h2>Por eso importa la barra</h2>
<p>Acertar o no acertar es lo de menos. Lo que sirve es saber <b>cuánto</b>:
   si tu equipo sale con 70% o con 40%, si el partido está abierto o
   cerrado, y qué pasa con eso cuando cambias el once. Eso es lo que te da la
   app.</p>
${ir("Mira la barra de tu partido")}
<p class="fuentes">Los números de la literatura:
   <a href="https://arxiv.org/abs/2309.14807">Evaluating Soccer Match Prediction
   Models</a>.</p>
`,
  };
}

function esSuerte() {
  const M = MEDIDO;
  const filas = M.monedas.map(([n, , c]) =>
    `<tr><td>${esc(n)}</td><td class="n"><b>${c}</b> de 100</td></tr>`).join("\n  ");
  return {
    archivo: "es-suerte.html",
    titulo: "90 caras de 100: por qué no es suerte",
    descripcion: "La ventaja del modelo de Armá el 11 en Portugal equivale a sacar 90 caras en " +
      "100 tiros de moneda. Nadie piensa que es suerte.",
    cuerpo: `
<h1>${caras("Portugal")} caras de 100.</h1>
<p class="bajada">Si tiras una moneda cien veces y salen noventa caras, no
   piensas "qué suerte". Piensas que está cargada. Así se ve la ventaja del
   modelo en Portugal.</p>

<h2>Contra qué se mide</h2>
<p>Contra lo que diría cualquiera sin modelo: el promedio de cada liga,
   cuántas ganan los locales y cuántas se empatan. El modelo tiene que
   ganarle a eso, en los mismos partidos. Y cuánto le gana se traduce a una
   moneda: una moneda normal da unas cincuenta caras de cien.</p>
<table>
  <tr><th>Liga</th><th class="n">En monedas</th></tr>
  ${filas}
</table>
<p>Noventa es una moneda cargada. Cincuenta y cuatro es una moneda normal,
   y por eso <a href="/liga-argentina.html">la liga argentina</a> lleva su
   propio cartel.</p>

<h2>Cada liga, con su cartel</h2>
<p>La app mide cada liga y le pone el mismo cartel, le vaya bien o mal:</p>
<table>
  <tr><th>En monedas</th><th>El cartel</th></tr>
  <tr><td>65 o más</td><td>Le gana claro</td></tr>
  <tr><td>60 a 65</td><td>Le gana, con poco margen</td></tr>
  <tr><td>50 a 60</td><td>Se puede simular, no prometer</td></tr>
</table>
<p>Así sabes cuánto pesa la barra antes de mirarla. Y cada simulación vale
   más.</p>
${ir("Simula con la barra a la vista")}
`,
  };
}

function cadaLiga({ ligas }) {
  const G = gruposDeLigas(ligas);
  /* País y torneo: "Italia · Serie A". El nombre del torneo es lo que la
     gente busca ("simulador Premier League"), y es información de verdad. */
  const nombres = arr => arr.map(l =>
    `<b>${esc(l.pais)}</b> <span style="color:var(--suave)">${esc(l.nombre)}</span>`).join(" · ");
  const bloque = (titulo, arr, texto) => arr.length ? `
<h2>${titulo}</h2>
<p>${nombres(arr)}</p>
<p>${texto}</p>` : "";
  return {
    archivo: "ligas.html",
    titulo: "Once ligas, y cómo lee el modelo cada una",
    descripcion: "Portugal, Italia, la Premier, LaLiga, el Brasileirão, la Liga Profesional y " +
      "cinco más: cada una con sus propios números, y su cartel.",
    cuerpo: `
<h1>Once ligas. Ninguna se juega igual.</h1>
<p class="bajada">El modelo corre con los números de cada liga, y en algunas
   lee mejor que en otras. Te lo decimos de entrada.</p>
${bloque("Las que mejor lee", G.mejor,
  "Acá los favoritos cumplen y la barra habla fuerte.")}
${bloque("El pelotón", G.peloton,
  "Le gana al promedio en todas. Ligas para simular y comparar sin vueltas.")}
${bloque("Más difíciles", G.dificiles,
  "Más sorpresas, más partidos abiertos. La barra orienta; el partido decide.")}
${bloque("La más brava", G.brava,
  "La más impredecible de las once. Está medido, y es la que más se discute: <a href=\"/liga-argentina.html\">mira por qué</a>.")}

<h2>Lo que tienes en cada una</h2>
<ul>
  <li>Cualquier partido de la próxima fecha, con los planteles de verdad.</li>
  <li>El once que viene jugando, armado solo, para que arranques de ahí.</li>
  <li>Cuando sale el once del DT, lo simulas contra el tuyo y ves cuál leía
      mejor el partido.</li>
  <li>El cartel de la liga en el botón, para que sepas cuánto pesa la barra
      antes de simular.</li>
</ul>
${ir("Elige la liga")}
`,
  };
}

function ligaArgentina({ stats }) {
  const p = stats && stats.promedios;
  const n = stats && stats.partidosJugados;
  const cero = p && n ? num(p.ceroACero / n * 100) : null;
  const numeros = p && n ? `
<h2>La liga, en números</h2>
<table>
  <tr><td>Goles por partido</td><td class="n">${num(p.golesPorPartido, 2)}</td></tr>
  <tr><td>Gana el local</td><td class="n">${num(p.local)}%</td></tr>
  <tr><td>Empate</td><td class="n"><b>${num(p.empate)}%</b></td></tr>
  <tr><td>Gana el visitante</td><td class="n">${num(p.visita)}%</td></tr>
  <tr><td>Terminaron 0 a 0</td><td class="n">${p.ceroACero} (${cero}%)</td></tr>
</table>
<p>Temporada ${esc(stats.temporada)}, ${n} partidos. Casi tres de cada diez,
   empate: el resultado que nadie elige.</p>` : "";
  return {
    archivo: "liga-argentina.html",
    titulo: "La liga argentina es la más impredecible de las once",
    descripcion: "Está medido: en la Liga Profesional cualquiera le gana a cualquiera. Y el " +
      "modelo no contempla el factor árbitros.",
    cuerpo: `
<h1>La liga argentina es la más impredecible de las once.</h1>
<p class="bajada">No es una opinión: está medido. Acá cualquiera le gana a
   cualquiera, y los números lo confirman.</p>

<div class="dato">
  <p class="grande">${caras("Argentina")} caras de 100</p>
  <p>Así se ve la ventaja del modelo en la liga argentina: una moneda normal.
     En Portugal, <a href="/es-suerte.html">${caras("Portugal")}</a>.</p>
</div>
${numeros}

<h2>Lo que el modelo no contempla</h2>
<p>El modelo mide goles. <b>No contempla el factor árbitros</b>, ni las
   lesiones de último momento, ni los viajes, ni el clásico del domingo.</p>

<h2>Entonces, a discutir</h2>
<p>En Europa, el pronóstico manda. Acá manda la discusión. Arma tu once,
   mové el planteo y lleva tu número a la charla del lunes.</p>
${ir("Arma el de tu equipo")}
`,
  };
}

/* ══════════════════════════════════════════════════════════════════════
   LO QUE USA `construir-sitio.mjs`
   ══════════════════════════════════════════════════════════════════════ */
export function paginasMedido({ RAIZ = "", ligas = [], stats = null } = {}) {
  return [comoFunciona(), techo({ stats }), esSuerte(), cadaLiga({ ligas }),
          ligaArgentina({ stats })]
    .map(p => ({ archivo: p.archivo, titulo: p.titulo,
                 html: armazon({ RAIZ, ...p }) }));
}

/* El mapa del sitio: la portada, las cinco y las dos legales. Las páginas
   de club no van, a propósito: son el feed, titulares de otros medios, y
   son justamente lo que un revisor lee como contenido ajeno. Siguen
   existiendo y se pueden encontrar; lo que no hacemos es ofrecérselas al
   buscador como si fueran lo mejor del sitio. */
export function mapaDelSitio(RAIZ, hoy = new Date().toISOString().slice(0, 10), extra = []) {
  if (!RAIZ) return "";
  const urls = ["", ...PAGINAS.map(p => p.archivo), "privacidad.html", "borrar-cuenta.html",
                "terminos.html", "contacto.html", "quienes-somos.html",
                ...extra.map(r => r.replace(/index\.html$/, ""))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(RAIZ + "/" + u)}</loc><lastmod>${hoy}</lastmod></url>`).join("\n")}
</urlset>
`;
}

export function robots(RAIZ) {
  return "User-agent: *\nAllow: /\n" + (RAIZ ? "Sitemap: " + RAIZ + "/sitemap.xml\n" : "");
}
