/* ══════════════════════════════════════════════════════════════════════════
   SUMAR-FUENTES — carga la cosecha del 2026-08-24 en medios.json y completa
   las ciudades que faltaban en clubes.json.

   Corre una sola vez. Es idempotente: si una URL ya está, no la duplica.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from "node:fs";
const aca = p => new URL(p, import.meta.url);

/* ─── ciudades que faltaban ────────────────────────────────────────────────
   Sin ciudad un club no hereda medios locales y pierde el corroborador más
   barato que hay. Los del AMBA van a "Buenos Aires" salvo los dos de
   Avellaneda, que sí tienen prensa local propia.
   NO se retocan los bloqueadores: los derivados ya están y meter
   "Buenos Aires" como bloqueador de trece clubes haría más daño que bien. */
const CIUDADES = {
  argentinos:"Buenos Aires", banfield:"Buenos Aires", barracas:"Buenos Aires",
  boca:"Buenos Aires", riestra:"Buenos Aires", huracan:"Buenos Aires",
  lanus:"Buenos Aires", platense:"Buenos Aires", river:"Buenos Aires",
  "san-lorenzo":"Buenos Aires", tigre:"Buenos Aires", velez:"Buenos Aires",
  defensa:"Florencio Varela",
  racing:"Avellaneda", independiente:"Avellaneda",
};

/* ─── el atajo del día ─────────────────────────────────────────────────────
   Vermouth Deportivo es un WordPress de fútbol argentino con un tag por club
   y RSS en cada tag. Un solo medio, treinta feeds dedicados, todos vivos.
   No alcanza como fuente única —publica cada 1-3 días los grandes y cada 1-2
   semanas los chicos— pero es el piso que le faltaba a los clubes flacos.
   Ojo con dos tags legacy que responden 200 y están muertos:
   gimnasia-y-esgrima-la-plata (feb-2025) y central-cordoba-sde (¡2018!).   */
const VERMOUTH = {
  boca:"boca", river:"river", racing:"racing", independiente:"independiente",
  "san-lorenzo":"san-lorenzo", argentinos:"argentinos-juniors", lanus:"lanus",
  banfield:"banfield", platense:"platense", tigre:"tigre", velez:"velez",
  huracan:"huracan", barracas:"barracas-central", riestra:"deportivo-riestra",
  defensa:"defensa-y-justicia",
  "estudiantes-lp":"estudiantes-de-la-plata", "gimnasia-lp":"gimnasia-la-plata",
  newells:"newells", "rosario-central":"rosario-central",
  union:"union", sarmiento:"sarmiento", "atl-tucuman":"atletico-tucuman",
  "central-cordoba-sde":"central-cordoba", "estudiantes-rc":"estudiantes-de-rio-cuarto",
  "gimnasia-mza":"gimnasia-de-mendoza", "independiente-rivadavia":"independiente-rivadavia",
  "talleres-cba":"talleres", "belgrano-cba":"belgrano", "instituto-cba":"instituto",
  aldosivi:"aldosivi",
};
/* Estos dos tags mezclan otro club con el mismo nombre, así que en vez de
   confiar en el tag se pasa por el desambiguador y los bloqueadores.
   talleres  -> Talleres de Remedios de Escalada
   central-cordoba -> el tag se aplica salteado, además de Rosario/Barracas */
const VERMOUTH_SUCIO = { "talleres-cba":"texto", "central-cordoba-sde":"texto" };
const VERMOUTH_FLOJO = new Set(["central-cordoba-sde"]);

const vermouth = Object.entries(VERMOUTH).map(([club, slug]) => ({
  nom: "Vermouth Deportivo · " + club,
  alcance: "propio", club, tipo: "medio",
  peso: VERMOUTH_FLOJO.has(club) ? 0.6 : 0.8,
  filtro: VERMOUTH_SUCIO[club] || "ninguno",
  contexto: "deportes", formato: "rss",
  url: "https://www.vermouth-deportivo.com.ar/tag/" + slug + "/feed/",
  verificado: true,
  nota: "tag por club de un WP de fútbol. Verificado 2026-08-24.",
}));

/* ─── lo demás, curado a mano de la cosecha ──────────────────────────────── */
const P = (club, nom, url, extra={}) => ({ nom, alcance:"propio", club, tipo:"medio",
  peso:1, filtro:"ninguno", contexto:"deportes", formato:"rss", url, verificado:true, ...extra });
const OFI = (club, nom, url, extra={}) => P(club, nom, url, { tipo:"club", ...extra });
const C = (ciudad, nom, url, extra={}) => ({ nom, alcance:"ciudad", ciudad, tipo:"medio",
  peso:0.7, filtro:"texto", contexto:"deportes", formato:"rss", url, verificado:true, ...extra });

const NUEVAS = [
  /* ── La Plata ─────────────────────────────────────────────────────────── */
  OFI("gimnasia-lp","Gimnasia LP · Oficial","https://www.gimnasia.org.ar/feed/",
    {contexto:"general", nota:"trae todo el club, no solo fútbol: vóley y básquet caen en institucional"}),
  P("gimnasia-lp","Punto Capital · Gimnasia","https://www.puntocapitalnoticias.com/categoria/gelp/feed/",{peso:0.8}),
  P("estudiantes-lp","Punto Capital · Estudiantes","https://www.puntocapitalnoticias.com/categoria/edelp/feed/",{peso:0.8}),
  P("estudiantes-lp","Estudiantes LP · Oficial (REST)","https://estudiantesdelaplata.com/wp-json/wp/v2/posts?per_page=20",
    {tipo:"club", formato:"wp-json",
     nota:"el WordPress del Pincha tiene el /feed/ interceptado —devuelve el HTML del home— pero la REST API sí responde"}),
  C("La Plata","El Día · Deportes","https://www.eldia.com/deportes/.rss",
    {nota:"la URL rara con barra y punto es la correcta; /rss da 404"}),
  C("La Plata","Infocielo · Deportes","https://www.infocielo.com/deportes/feed/"),
  C("La Plata","0221 · News sitemap","https://www.0221.com.ar/sitemap-news.xml",
    {peso:0.6, contexto:"general", formato:"news-sitemap"}),

  /* ── Rosario ──────────────────────────────────────────────────────────── */
  OFI("rosario-central","Rosario Central · Oficial","https://rosariocentral.com/feed/?post_type=noticia",
    {nota:"el /feed/ pelado viene VACÍO: las notas son un post type 'noticia'"}),
  P("rosario-central","El diario de Central","https://eldiariodecentral.com.ar/feed/"),
  C("Rosario","El Ciudadano · El Hincha","https://elciudadanoweb.com/seccion/el-hincha/feed/"),
  C("Rosario","La Capital · Ovación","https://www.lacapital.com.ar/rss/pages/ovacion.xml",
    {peso:0.6, contexto:"general", nota:"se llama Ovación pero trae todo el diario; las notas de deporte llevan /ovacion/ en la URL"}),
  C("Rosario","Conclusión","https://www.conclusion.com.ar/feed/",{peso:0.6, contexto:"general"}),

  /* ── Mendoza ──────────────────────────────────────────────────────────── */
  P("independiente-rivadavia","El Sol · Independiente Rivadavia","https://www.elsol.com.ar/tag/independiente-rivadavia/feed/",{peso:0.8}),
  P("gimnasia-mza","El Sol · Gimnasia y Esgrima","https://www.elsol.com.ar/tag/gimnasia-y-esgrima/feed/",
    {peso:0.8, nota:"el tag se aplica salteado: hay huecos de meses"}),
  C("Mendoza","El Sol · Deportes","https://www.elsol.com.ar/deportes/feed/",
    {nota:"el feed raíz de El Sol está cacheado y atrasado; este no"}),
  C("Mendoza","Los Andes · Deportes","https://www.losandes.com.ar/rss/pages/mas-deportes.xml",
    {nota:"el slug es 'mas-deportes'; 'deportes' devuelve vacío"}),
  C("Mendoza","MDZ Online · Deportes","https://www.mdzol.com/rss/pages/deportes.xml"),
  C("Mendoza","Diario Uno · Fútbol","https://www.diariouno.com.ar/rss/futbol.xml"),

  /* ── Tucumán ──────────────────────────────────────────────────────────── */
  C("Tucumán","La Gaceta · News sitemap","https://www.lagaceta.com.ar/rss/sitemap_news",{contexto:"general", formato:"news-sitemap"}),
  C("Tucumán","LV12","https://www.lv12.com.ar/sitemap-news.xml",{peso:0.6, contexto:"general", formato:"news-sitemap"}),

  /* ── Santiago del Estero ──────────────────────────────────────────────── */
  OFI("central-cordoba-sde","Central Córdoba · Oficial","https://www.cacentralcordoba.com/feed/"),
  C("Santiago del Estero","Nuevo Diario","https://nuevodiarioweb.com.ar/sitemap-news.xml",{peso:0.6, contexto:"general", formato:"news-sitemap"}),

  /* ── Santa Fe ─────────────────────────────────────────────────────────── */
  OFI("union","Unión · Oficial","https://www.clubaunion.com.ar/feed/"),
  C("Santa Fe","El Litoral · News (índice)","https://www.ellitoral.com/sitemaps/index_news.xml",
    {peso:0.6, contexto:"general", formato:"news-sitemap", patronHijo:"news-",
     nota:"el sitemap de El Litoral rota por mes; se entra por el índice y traer.mjs elige el hijo más nuevo"}),
  C("Santa Fe","Aire de Santa Fe","https://www.airedesantafe.com.ar/sitemap-news.xml",{peso:0.6, contexto:"general", formato:"news-sitemap"}),

  /* ── Junín ────────────────────────────────────────────────────────────── */
  P("sarmiento","La Verdad · Sarmiento","https://laverdadonline.com/secci%C3%B3n/sarmiento/feed/",
    {nota:"el WP usa /sección/ con acento; es 100% Sarmiento de Junín"}),
  C("Junín","Diario Democracia","https://www.diariodemocracia.com/sitemaps/google_news.xml",{peso:0.6, contexto:"general", formato:"news-sitemap"}),

  /* ── Río Cuarto ───────────────────────────────────────────────────────── */
  C("Río Cuarto","Puntal · Deportes","https://www.puntal.com.ar/rss/deportes.xml",
    {nota:"no figura en el índice público de RSS de Puntal; sale de adivinar el patrón"}),

  /* ── Avellaneda ───────────────────────────────────────────────────────── */
  OFI("racing","Racing · Oficial","https://www.racingclub.com.ar/rss/",
    {nota:"declarado en el robots.txt como si fuera un sitemap; es un RSS"}),
  P("racing","El Primer Grande","https://www.elprimergrande.com/feed/"),
  P("racing","Racing de Alma","https://www.racingdealma.com.ar/feed/"),
  P("independiente","Soy del Rojo","https://soydelrojo.com/feed/"),
  P("independiente","LocoXelRojo","https://www.locoxelrojo.com/independiente/feed/",
    {nota:"el WP vive en /independiente/; el /feed/ de la raíz no sirve"}),
  C("Avellaneda","La Ciudad Avellaneda · Deportes","https://diariolaciudadavellaneda.com.ar/categoria/deportes/feed/",
    {nota:"WP con base 'categoria' en español. Ojo: laciudadavellaneda.com.ar sin 'diario' es el dominio viejo y está muerto"}),

  /* ── Boca ─────────────────────────────────────────────────────────────── */
  P("boca","La Número 12","https://lanumero12.com.ar/feed/"),
  P("boca","Planeta Boca Juniors","https://planetabj.com/sitemaps/news",{formato:"news-sitemap"}),
  P("boca","Diario Xeneize","https://www.diarioxeneize.com/feed/",{peso:0.8}),
  P("boca","Yo Xeneize","https://yoxeneize.com/feed/",{peso:0.8}),

  /* ── River ────────────────────────────────────────────────────────────── */
  P("river","La Página Millonaria","https://lapaginamillonaria.com/sitemaps/news",{formato:"news-sitemap"}),
  P("river","River, el más grande","https://riverelmasgrande.com/news_sitemap.xml",{formato:"news-sitemap"}),
  P("river","Somos River TV","https://somosrivertv.com/feed/",{peso:0.8}),
  P("river","Fútbol Para Todos · River","https://www.futbolparatodos.com.ar/noticias/river-plate/feed/",{peso:0.7}),

  /* ── San Lorenzo ──────────────────────────────────────────────────────── */
  P("san-lorenzo","Mundo Azulgrana","https://mundoazulgrana.com.ar/feed/"),
  P("san-lorenzo","Vamos Ciclón","https://vamosciclon.com/feed/"),

  /* ── Huracán ──────────────────────────────────────────────────────────── */
  OFI("huracan","Huracán · Oficial","https://admin.cahuracan.com/feed/",
    {nota:"el sitio es Next.js sin RSS, pero el WordPress headless que lo alimenta sí lo tiene. Si cambian de hosting desaparece sin aviso"}),
  P("huracan","Imágenes Huracán","https://imageneshuracan.ar/feed/",{peso:0.8, nota:"sobre todo galerías de fotos, una por partido"}),

  /* ── Argentinos ───────────────────────────────────────────────────────── */
  OFI("argentinos","Argentinos Juniors · Oficial","https://argentinosjuniors.com.ar/feed/",{contexto:"general"}),
  P("argentinos","Argentinos Pasión","https://argentinospasion.com.ar/feed/"),

  /* ── Lanús ────────────────────────────────────────────────────────────── */
  OFI("lanus","Lanús · Oficial","https://www.clublanus.com/feed/",{contexto:"general"}),
  P("lanus","Fortaleza Granate","https://fortalezagranate.com.ar/feed/"),
  P("lanus","Mundo Granate","https://mundogranateok.wordpress.com/feed/",{peso:0.8}),

  /* ── Banfield ─────────────────────────────────────────────────────────── */
  OFI("banfield","Banfield · Oficial","https://clubabanfield.org/feed/"),
  P("banfield","Soy de Banfield","https://soydebanfield.com.ar/feed/"),

  /* ── Platense ─────────────────────────────────────────────────────────── */
  OFI("platense","Platense · Oficial","https://cap.org.ar/feed/",
    {nota:"el dominio es cap.org.ar, no caplatense.com.ar"}),
  P("platense","Platense Siglo XXI","https://platensesigloxxi.com/?format=feed&type=rss",
    {peso:0.8, nota:"es Joomla: /feed/ da 404, el feed real lleva ?format=feed"}),
  P("platense","La Página Calamar","https://platense.com.ar/feed/",{peso:0.8}),

  /* ── Tigre ────────────────────────────────────────────────────────────── */
  OFI("tigre","Tigre · Oficial","https://catigre.com.ar/feed/"),
  P("tigre","TigreVisión","https://www.tigrevision.com.ar/feed/",{nota:"pide Crawl-delay 10"}),

  /* ── Defensa y Justicia ───────────────────────────────────────────────── */
  OFI("defensa","Defensa y Justicia · Oficial","https://www.defensayjusticia.org.ar/feed/"),
  P("defensa","Defensa Pasión","https://www.defensapasion.com.ar/feed/"),
  P("defensa","El Diario Varelense · DyJ","https://eldiariovarelense.com.ar/category/defensa-y-justicia/feed/",
    {peso:0.8, contexto:"general", nota:"la que sirve es /category/; el /tag/ del mismo sitio está vacío"}),

  /* ── Barracas ─────────────────────────────────────────────────────────── */
  OFI("barracas","Barracas Central · Oficial","https://www.barracascentral.com/feed/"),
];

/* ─── fuentes que NO entran, y por qué ─────────────────────────────────────
   Se guardan igual: la próxima vez que alguien mire esta lista va a querer
   saber que ya se probó. Todas verificadas el 2026-08-24.                  */
const APAGADAS = [
  { nom:"Newell's · Oficial", alcance:"propio", club:"newells", tipo:"club", activo:false,
    _falta:"feed", _porque:"newellsoldboys.com.ar es Next.js: /feed/, /rss.xml y los sitemaps dan 404. /noticias sí publica." },
  { nom:"Vélez · Oficial", alcance:"propio", club:"velez", tipo:"club", activo:false,
    _falta:"feed", _porque:"CMS a medida (Naxela). Ocho rutas de feed y sitemap probadas, todas 404 o 403. Publica varias notas por día y no las expone." },
  { nom:"Independiente · Oficial", alcance:"propio", club:"independiente", tipo:"club", activo:false,
    _falta:"feed", _porque:"PHP a medida. Sin RSS ni news sitemap. El contenido de /futbol/noticias está fresco." },
  { nom:"River · Oficial", alcance:"propio", club:"river", tipo:"club", activo:false,
    _falta:"feed", _porque:"riverplate.com es una SPA: /feed y los sitemaps devuelven el mismo shell vacío." },
  { nom:"Boca · Oficial", alcance:"propio", club:"boca", tipo:"club", activo:false,
    _falta:"verificar", _porque:"bocajuniors.com.ar bloqueó al fetcher; no se pudo comprobar si tiene feed." },
  { nom:"Atlético Tucumán · Oficial", alcance:"propio", club:"atl-tucuman", tipo:"club", activo:false,
    _falta:"feed", _porque:"CMS a medida. Su sitemap está congelado en 2018 mientras el sitio publica en 2026." },
  { nom:"San Lorenzo · Oficial", alcance:"propio", club:"san-lorenzo", tipo:"club", activo:false,
    _falta:"feed", _porque:"404 en /feed/, /rss, /robots.txt y los tres sitemaps." },
  { nom:"Estudiantes RC · Oficial", alcance:"propio", club:"estudiantes-rc", tipo:"club", activo:false,
    _falta:"sitio", _porque:"aaestudiantes.com.ar hoy es una landing de apuestas: el dominio caducó y lo revendieron. NO usar." },
  { nom:"Riestra · Oficial", alcance:"propio", club:"riestra", tipo:"club", activo:false,
    _falta:"sitio", _porque:"el club no tiene web. Ni la Liga Profesional le lista una: su prensa vive entera en redes." },
  { nom:"Gimnasia Mza · Oficial", alcance:"propio", club:"gimnasia-mza", tipo:"club", activo:false,
    _falta:"feed", _porque:"WordPress, pero /feed/ devuelve el feed de comentarios vacío y las notas no llevan fecha." },
  { nom:"Independiente Rivadavia · Oficial", alcance:"propio", club:"independiente-rivadavia", tipo:"club", activo:false,
    _falta:"feed", _porque:"el sitio es Framer; su sitemap tiene 9 URLs estáticas y ninguna nota." },
  { nom:"Sarmiento · Oficial", alcance:"propio", club:"sarmiento", tipo:"club", activo:false,
    _falta:"feed", _porque:"el RSS existe y su ítem más nuevo, de 2022, se titula 'Titulo de la noticia'. Es un placeholder." },
  { nom:"El Litoral · Google News", alcance:"ciudad", ciudad:"Santa Fe", tipo:"medio", activo:false,
    _falta:"nada", _porque:"el sitemap_google_news está congelado en junio 2026. Se entra por index_news.xml, que sí rota." },
  { nom:"Diario Panorama", alcance:"ciudad", ciudad:"Santiago del Estero", tipo:"medio", activo:false,
    _falta:"nada", _porque:"news sitemap válido, última nota junio 2026." },
  { nom:"El Liberal", alcance:"ciudad", ciudad:"Santiago del Estero", tipo:"medio", activo:false,
    _falta:"formato", _porque:"el diario más grande de la provincia y no expone RSS ni news sitemap. Solo un urlset sin fechas por nota." },
  { nom:"Mendoza Post", alcance:"ciudad", ciudad:"Mendoza", tipo:"medio", activo:false,
    _falta:"feed", _porque:"tiene páginas por club frescas y ningún feed. La mejor fuente dedicada que quedó afuera." },
  { nom:"Rosario3", alcance:"ciudad", ciudad:"Rosario", tipo:"medio", activo:false,
    _falta:"feed", _porque:"tiene secciones dedicadas a Newell's y Central y no expone RSS; su sitemap de Google News da 404." },
];

/* ─── fusión ──────────────────────────────────────────────────────────────── */
const medios = JSON.parse(readFileSync(aca("./medios.json")));
const clubes = JSON.parse(readFileSync(aca("./clubes.json")));

const yaEsta = new Set(medios.fuentes.map(f => f.url).filter(Boolean));
let sumadas = 0, repetidas = 0;
for (const f of [...NUEVAS, ...vermouth, ...APAGADAS]) {
  if (f.url && yaEsta.has(f.url)) { repetidas++; continue; }
  if (f.url) yaEsta.add(f.url);
  medios.fuentes.push(f);
  sumadas++;
}

let ciudades = 0;
for (const c of clubes) {
  if (!c.ciudad && CIUDADES[c.id]) { c.ciudad = CIUDADES[c.id]; ciudades++; }
}

writeFileSync(aca("./medios.json"), JSON.stringify(medios, null, 1));
writeFileSync(aca("./clubes.json"), JSON.stringify(clubes, null, 1));

console.log(sumadas + " fuentes sumadas" + (repetidas ? " (" + repetidas + " ya estaban)" : ""));
console.log(ciudades + " ciudades completadas");
console.log(medios.fuentes.length + " fuentes en total, " +
  medios.fuentes.filter(f => f.activo !== false).length + " activas");
