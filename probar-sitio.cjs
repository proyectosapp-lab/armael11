/* ══════════════════════════════════════════════════════════════════════════
   PRUEBA DEL SITIO PUBLICADO
     node probar-sitio.cjs

   Lo que prueba, y es lo único que importa de este cambio:
   que "Armá el 11" funcione entero SIN QUE EL NAVEGADOR TOQUE API-FOOTBALL.
   Por eso la prueba bloquea api-sports.io a nivel de red: si el juego llega
   al final, es porque no lo necesitó. Si alguien rompe el cache, acá falla.
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const RAIZ = path.join(__dirname, 'sitio');
const CLUB = process.argv[2] || 'talleres-cba';

/* Que la prueba se pueda correr de cero, sin haber bajado nada de internet:
   si no hay feed de este club, se arma uno con los ítems guardados. */
if (!fs.existsSync(path.join(__dirname, 'feed-' + CLUB + '.js'))) {
  require('child_process').execSync(
    'node -e "' +
    "import('./pipeline.mjs').then(({construirFeed})=>{" +
    "const fs=require('fs');" +
    "const FIX=JSON.parse(fs.readFileSync('fixtures.json'));" +
    "const C=JSON.parse(fs.readFileSync('clubes.json')).find(c=>c.id==='" + CLUB + "');" +
    "const P={nombre:C.nom,desambiguacion:{fuertes:[C.nombreCompleto].filter(Boolean)," +
    "debiles:C.debiles||[C.nom,...C.apodos],corroboradores:[C.ciudad],bloqueadores:C.bloqueadores}};" +
    "const f=construirFeed(FIX.lotes.map(l=>({fuente:l.fuente,items:l.items})),P);" +
    "const {descartados,...l}=f;" +
    "l.club={id:C.id,nom:C.nom,ini:C.ini,apiId:C.apiId,color:C.color,color2:C.color2,patron:C.patron,estrellas:C.estrellas};" +
    "fs.writeFileSync('feed-'+C.id+'.js','window.FEED = '+JSON.stringify(l)+';\\nwindow.CLUB = '+JSON.stringify(l.club)+';');" +
    '});"', { cwd: __dirname, stdio: 'inherit' });
}
fs.mkdirSync(path.join(RAIZ, 'datos'), { recursive: true });

/* ─── un cache sintético con las MISMAS claves que pide la app ──────────── */
const nombres = ["Unsaín","Riquelme","Galarza","Fernández","Cristaldo","Maidana","Chamorro",
  "Depietri","Martínez","Barticciotto","Rick","Portilla","Girotti","Herrera","Navarro","Bustos"];
const POS = ["G","D","D","D","D","M","M","M","F","F","F","D","M","F","M","G"];
/* Quiénes salieron de entrada. Se eligen a propósito para que den 5-3-2 y
   NO 4-3-3: si el dibujo deducido fuera igual al de respaldo, la prueba de
   que se deduce pasaría sola sin deducir nada. Es la misma trampa del
   marcador empatado. */
const TITULARES = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11]);
const jug = (pref, base) => nombres.map((n, i) => ({
  player: { id: pref * 100 + i, name: (pref === 1 ? "" : "R ") + n },
  statistics: [{ games: { minutes: 90, position: POS[i], rating: (base + (i % 5) * 0.1).toFixed(1),
                          substitute: !TITULARES.has(i) } }] }));

const A = 456, B = 1066;
const jugados = Array.from({ length: 5 }, (_, i) => ({
  fixture: { id: 900 + i, date: `2026-0${i + 3}-1${i}T20:00:00+00:00`, status: { short: "FT" } },
  teams: { home: { id: A, name: "Talleres" }, away: { id: B, name: "Gimnasia M." } },
  goals: { home: 2, away: 1 } }));
const proximo = {
  fixture: { id: 999, date: "2026-12-30T21:00:00+00:00", status: { short: "NS" } },
  teams: { home: { id: A, name: "Talleres" }, away: { id: B, name: "Gimnasia M." } },
  goals: { home: null, away: null } };

const cache = {};
cache[`/fixtures?team=${A}&season=2026&league=128`] = [...jugados, proximo];
cache[`/fixtures?team=${B}&season=2026&league=128`] = jugados;
for (const f of jugados)
  cache[`/fixtures/players?fixture=${f.fixture.id}`] =
    [{ team: { id: A }, players: jug(1, 7.0) }, { team: { id: B }, players: jug(2, 6.6) }];
/* La lista oficial del plantel: puestos de verdad, y uno que no jugó nunca. */
const PUESTO = { G:"Goalkeeper", D:"Defender", M:"Midfielder", F:"Attacker" };
const squad = pref => ({ team:{ id: pref===1?A:B }, players:
  nombres.map((n,i)=>({ id: pref*100+i, name:(pref===1?"":"R ")+n, position: PUESTO[POS[i]] }))
    .concat([{ id: pref*100+90, name:(pref===1?"":"R ")+"Refuerzo", position:"Attacker" }]) });
cache[`/players/squads?team=${A}`] = [squad(1)];
cache[`/players/squads?team=${B}`] = [squad(2)];

/* ── LOS QUE SE FUERON ────────────────────────────────────────────────────
   Primera queja de los testers: jugadores que se fueron en el mercado de
   pases seguían en el plantel. Salían por la lista oficial, que los deja
   puestos varias semanas.

   Dos casos en un solo dato, porque el segundo es el que puede romper algo:
     Vendido  se fue el 20 de julio y no volvió a jugar → NO va.
     Unsaín   figura yéndose el 1 de febrero, pero jugó los cinco partidos,
              el último el 14 de julio → SÍ va. Los minutos jugados le ganan
              a la ficha: un dato de transferencia equivocado que nos borra
              un titular es un error más visible que el que arreglamos.
   Y el equipo B no tiene esta clave a propósito: sin datos no se saca a
   nadie, que es como se comportaba antes.                               */
const VENDIDO = 191;
cache[`/players/squads?team=${A}`][0].players.push(
  { id: VENDIDO, name: "Vendido", position: "Attacker" });
cache[`/players/squads?team=${B}`][0].players.push(
  { id: 2 * 100 + 91, name: "R Vendido", position: "Attacker" });
cache[`/transfers?team=${A}`] = [
  { player: { id: VENDIDO, name: "Vendido" }, transfers: [
    { date: "2025-01-10", teams: { in: { id: A }, out: { id: 777 } } },
    { date: "2026-07-20", teams: { in: { id: 777 }, out: { id: A } } } ] },
  { player: { id: 100, name: "Unsaín" }, transfers: [
    { date: "2026-02-01", teams: { in: { id: 777 }, out: { id: A } } } ] },
];

cache[`/fixtures/lineups?fixture=904`] =
  [{ team: { id: A }, formation: "4-4-2", startXI: nombres.slice(0, 11).map(n => ({ player: { name: n, pos: "M" } })) }];
cache[`/fixtures/events?fixture=904`] = [];
/* Lo mismo que escribe datos-juego.mjs: qué partidos quedaron completos. */
cache.__jugables = [999, 904];

fs.writeFileSync(path.join(RAIZ, 'datos', 'cache-' + CLUB + '.js'),
  "window.CACHE = " + JSON.stringify(cache) + ";\n");

/* La página tiene que traer el <script src> del cache: se reconstruye. */
require('child_process').execSync('node construir-sitio.mjs', { cwd: __dirname, stdio: 'ignore' });

/* ─── servidor y navegador ───────────────────────────────────────────────── */
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((q, s) => {
  let f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0].split('#')[0]));
  if (f.endsWith('/')) f += 'index.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('no'); }
  s.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'text/plain' });
  fs.createReadStream(f).pipe(s);
});

const casos = [];
const caso = (n, ok) => casos.push([n, ok]);

/* ── LA PÁGINA TIENE QUE COMPILAR ANTES DE ABRIRLA ────────────────────────
   Van TRES veces en este proyecto que una página entera dejó de arrancar por
   un nombre repetido: `tintaSobre`, `diaDe` y ahora `bv`. Dos `const` con el
   mismo nombre en el mismo bloque no dan un aviso: dan una página muerta.

   Y lo peor es cómo se veía desde acá. El navegador abría, ningún script
   corría, y la prueba fallaba con "tab is not defined" en un caso que no
   tenía nada que ver. Media hora buscando en el lugar equivocado, que es
   exactamente lo que costó el error del SQL esta misma semana.

   `new Function(src)` compila sin ejecutar: no toca el DOM ni la red, y
   levanta los nombres repetidos, que es todo lo que hace falta. Va ANTES de
   abrir el navegador para que el mensaje diga lo que pasa.               */
for (const club of ['talleres-cba']) {
  const html = fs.readFileSync(path.join(RAIZ, club + '.html'), 'utf8');
  const bloques = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
  let error = "";
  bloques.forEach((b, i) => {
    try { new Function(b[1]); } catch (e) { error = error || ("bloque " + i + ": " + e.message); }
  });
  caso("los scripts de la página compilan (nada declarado dos veces)", !error, error);
  caso("y la página trae los scripts que esperamos", bloques.length >= 2);
}

/* El tanteador dice "Talleres 2 - Belgrano 0": los goles son los dos <b> y
   los nombres los dos .eq. Leerlo con `textContent` daría todo pegado. */
const tanteador = pg => pg.evaluate(() => {
  const m = document.querySelector('.marcador');
  if (!m) return { goles: "", nombres: [] };
  return {
    goles: [...m.querySelectorAll('b')].map(b => b.textContent.trim()).join("-"),
    nombres: [...m.querySelectorAll('.eq')].map(e => e.textContent.trim()),
  };
});

srv.listen(8099, async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 430, height: 920 } });
  const errs = [], apiTocada = [], ajenos = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('request', r => {
    const h = new URL(r.url()).host;
    if (h && h !== 'localhost:8099' && r.resourceType() === 'script') ajenos.push(h);
  });

  /* EL CORAZÓN DE LA PRUEBA: la API no existe. */
  await pg.route('**/v3.football.api-sports.io/**', r => {
    apiTocada.push(r.request().url());
    r.abort();
  });

  await pg.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle' });
  caso("la portada lista los clubes", await pg.locator('.club').count() > 0);

  /* ── EL GANCHO DEL SIMULADOR ──────────────────────────────────────────
     La portada tiene que contar que el resultado no sale de un dado, y
     tiene que contarlo con los números que están efectivamente medidos y
     anotados en `claude/modelo-backtest.md`. No hay forma automática de
     verificar que una promesa sea cierta; lo que sí se puede fijar es que
     los números NO se muevan solos. Si alguien los cambia, este caso
     falla y lo obliga a pasar por el respaldo. */
  {
    const g = pg.locator('.gancho');
    caso("la portada dice que el simulador no tira un dado",
         await g.count() === 1 && /no tira un dado/i.test(await g.innerText()));
    const txt = await g.innerText();
    for (const n of ["10.860", "nueve ligas", "1.783", "6.000"])
      caso("y el respaldo dice " + n, txt.includes(n),
           txt.replace(/\n/g, " ").slice(0, 140));
    /* Elegir el club sigue siendo lo primero: el gancho va DESPUÉS de la
       grilla, no antes. Un argumento sobre el modelo no puede empujar a los
       treinta clubes abajo del pliegue. */
    caso("y va después de la grilla, no antes",
         await pg.evaluate(() => {
           const gr = document.querySelector('.grilla'), ga = document.querySelector('.gancho');
           return !!gr && !!ga && (gr.compareDocumentPosition(ga) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
         }));
  }

  /* ── EL NOMBRE ────────────────────────────────────────────────────────
     La app se llamaba TSTE por dentro y el dominio dice otra cosa. Que el
     link diga una cosa y la pantalla diga otra confunde justo cuando
     alguien la recibe por primera vez. */
  {
    const site = await pg.locator('meta[property="og:site_name"]').getAttribute('content');
    caso("la portada se presenta con el nombre del producto", site === "Armá el 11", site);
    const html = await pg.content();
    caso("y no queda ni un TSTE a la vista", !/TSTE/.test(html),
         (html.match(/.{0,30}TSTE.{0,30}/) || [""])[0]);
  }

  /* ── LA CIUDAD DE CADA CLUB ───────────────────────────────────────────
     Estaba en la misma fila que el nombre, empujada a la derecha, y con
     los nombres largos se cortaba: "Independiente Rivadavia" se comía a
     "Mendoza". Ahora van apilados. Esto mide lo único que importa: que el
     texto entre entero en su caja, en los treinta.                      */
  {
    const cortadas = await pg.evaluate(() => {
      const mal = [];
      for (const e of document.querySelectorAll('.club')) {
        const ciu = e.querySelector('.ciu'); if (!ciu) continue;
        /* Un píxel de tolerancia: el redondeo del navegador. */
        if (ciu.scrollWidth > ciu.clientWidth + 1)
          mal.push(e.querySelector('.nom').textContent.trim());
      }
      return mal;
    });
    caso("ninguna ciudad queda cortada", cortadas.length === 0, cortadas.join(", "));
    const apilado = await pg.evaluate(() => {
      const c = document.querySelector('.club');
      const n = c.querySelector('.nom').getBoundingClientRect();
      const u = c.querySelector('.ciu').getBoundingClientRect();
      return u.top >= n.bottom - 2;      // la ciudad va DEBAJO del nombre
    });
    caso("la ciudad va debajo del nombre, no peleándole el renglón", apilado);
  }

  await pg.goto('http://localhost:8099/' + CLUB + '.html', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(300);
  /* Este caso decía lo contrario y estaba bien cuando lo escribimos: sin
     fecha publicada no había nada que armar, y la pestaña vacía era una
     promesa incumplida. (Estuvo visible una versión entera por un choque de
     CSS: `hidden` esconde con display:none y la regla de la barra le ponía
     display:grid encima.)

     Cambió porque cambió lo que hay adentro. Ahí ahora viven los torneos de
     amigos, las zonas y los puntos de la fecha pasada, y todo eso se mira
     JUSTAMENTE entre una fecha y la siguiente. Con la regla vieja, el lunes
     —cuando la gente quiere ver cuánto sacó y cómo quedó la tabla— la
     pestaña no existía.

     La condición ahora es "hay fecha O hay backend". Sin ninguna de las
     dos sigue escondida, que es lo correcto: ahí adentro no habría nada. */
  caso("con backend configurado, la pestaña del fantasy está aunque no haya fecha",
       await pg.locator('#btfantasy').isVisible());
  caso("y sin fecha NI backend seguiría escondida",
       await pg.evaluate(async () => {
         const t = await (await fetch(location.pathname)).text();
         return /window\.FECHA \|\| conBackend/.test(t);
       }));

  caso("el feed entra por <script src> y se pinta",
       (await pg.locator('#resumen').textContent() || '').includes('historias'));

  /* La app ABRE en el simulador, no en el feed: la app se llama Armá el 11
     y el feed es contenido de otros medios. Para mirar el feed hay que ir a
     su pestaña, que es lo que haría cualquiera. */
  caso("la app abre en el simulador, no en el feed",
       await pg.evaluate(() => tab) === "juego", await pg.evaluate(() => tab));
  caso("y el feed es la última pestaña, después de lo que hicimos nosotros",
       await pg.evaluate(() => [...document.querySelectorAll("#barra button")]
         .map(b => b.dataset.tab).join(",")) === "juego,fantasy,numeros,feed");
  await pg.click('#barra button[data-tab="feed"]');
  await pg.waitForTimeout(300);

  /* ── JERARQUÍA ────────────────────────────────────────────────────────
     La observación era "se ven todos igual, como líneas interminables".
     Que existan tres tamaños no alcanza: hay que medir que el navegador
     los pinte DISTINTOS, porque un CSS que no aplica se ve como uno que
     no existe.                                                          */
  const jer = await pg.evaluate(() => {
    const px = sel => { const e = document.querySelector(sel);
      return e ? parseFloat(getComputedStyle(e).fontSize) : 0; };
    return { portadas: document.querySelectorAll('.tarjeta.portada').length,
             medias:   document.querySelectorAll('.tarjeta.media').length,
             lineas:   document.querySelectorAll('.linea').length,
             dias:     document.querySelectorAll('h3.dia').length,
             gr: px('.portada h2'), md: px('.tarjeta.media h2'), ch: px('.linea a'),
             total: (window.FEED.clusters || []).length };
  });
  caso("hay UNA sola portada", jer.portadas === 1, "portadas: " + jer.portadas);
  caso("y hasta cuatro tarjetas medianas", jer.medias <= 4 && jer.medias > 0, "medias: " + jer.medias);
  caso("el resto va en renglones compactos",
       jer.total <= 5 ? jer.lineas === 0 : jer.lineas > 0, "renglones: " + jer.lineas);
  caso("los renglones se agrupan por día", jer.total <= 5 ? true : jer.dias > 0, "días: " + jer.dias);
  caso("los tres tamaños se ven distintos de verdad",
       jer.gr > jer.md && jer.md > jer.ch, [jer.gr, jer.md, jer.ch].join(" > "));

  /* ── LAS MINIATURAS ───────────────────────────────────────────────────
     El feed de prueba no trae imágenes, así que se le pone una y se vuelve
     a pintar. Lo que importa no es que aparezca: es que vaya diferida, que
     no se aloje acá y que si el medio la borra no quede un cuadrado roto. */
  const img = await pg.evaluate(() => {
    window.FEED.clusters[0].principal.imagen = "https://cdn.ejemplo.com/foto.jpg";
    pintar();
    const e = document.querySelector('.portada .foto');
    if (!e) return null;
    const ok = e.getAttribute("onerror") || "";
    e.dispatchEvent(new Event("error"));            // el medio la borró
    return { src: e.getAttribute("src"), lazy: e.getAttribute("loading"),
             ref: e.getAttribute("referrerpolicy"), seSaca: ok,
             quedan: document.querySelectorAll('.portada .foto').length };
  });
  caso("la portada muestra la miniatura cuando el medio la declara", !!img);
  caso("la imagen se enlaza al medio, no se aloja acá",
       !!img && /^https:\/\/cdn\.ejemplo\.com/.test(img.src), img ? img.src : "");
  caso("y va con carga diferida", !!img && img.lazy === "lazy", img ? img.lazy : "");
  caso("sin mandarle a quién la mira", !!img && img.ref === "no-referrer", img ? img.ref : "");
  caso("si la imagen se cae, la tarjeta sigue entera (no queda el cuadrado roto)",
       !!img && img.quedan === 0, img ? "quedaron " + img.quedan : "");

  /* Y que el interruptor de sitio.json mande de verdad. */
  const apagadas = await pg.evaluate(() => {
    const antes = window.SITIO && window.SITIO.miniaturas;
    window.SITIO = { miniaturas: "ninguna" }; pintar();
    const n = document.querySelectorAll('.foto, .mini-f').length;
    window.SITIO = { miniaturas: antes || "todas" }; pintar();
    return n;
  });
  caso("con miniaturas en 'ninguna' no se baja ni una imagen", apagadas === 0,
       "quedaron " + apagadas);

  /* La pestaña Números: tiene que ofrecer las tablas que haya y arrancar en
     la que contiene a este club. Mostrábamos la del torneo ya terminado. */
  /* Que el link se pueda mandar. Sin estas etiquetas, pegar la dirección en
     WhatsApp muestra un renglón gris y el link muere en el primer reenvío. */
  const meta = n => pg.locator('meta[property="' + n + '"]').getAttribute('content');
  caso("el link compartido lleva título", (await meta('og:title') || '').includes('Talleres'));
  caso("y una descripción", ((await meta('og:description')) || '').length > 40);
  caso("y su dirección absoluta", /^https?:\/\//.test(await meta('og:url') || ''));
  caso("tiene icono propio", await pg.locator('link[rel="icon"]').count() === 1);
  caso("y se puede agregar a la pantalla de inicio",
       await pg.locator('link[rel="manifest"]').count() === 1);
  const manif = await pg.evaluate(async () => {
    const h = document.querySelector('link[rel=manifest]').getAttribute('href');
    try { return await (await fetch(h)).json(); } catch (e) { return null; }
  });
  caso("el manifiesto existe y abre en este club",
       !!manif && manif.start_url.includes(CLUB), manif ? manif.start_url : "no cargó");

  /* La promesa fue contar visitas sin espiar a nadie. Mientras no haya un
     código de contador configurado, no puede cargarse NINGÚN script de otro
     dominio. Esto lo verifica en vez de confiar.                        */
  caso("no carga ningún script de terceros", ajenos.length === 0, ajenos.join(", "));

  /* El dominio propio. La regla es que no queden dos direcciones vivas: si
     hay dominio, TODO sale desde ahí —la tarjeta de WhatsApp, la canónica y
     el archivo que GitHub lee—; si no hay, no se inventa un CNAME. */
  {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'sitio.json'), 'utf8'));
    const dom = (cfg.dominio || '').trim();
    const cname = path.join(RAIZ, 'CNAME');
    if (dom) {
      caso("con dominio propio, el sitio lleva su CNAME",
           fs.existsSync(cname) && fs.readFileSync(cname, 'utf8').trim() === dom,
           fs.existsSync(cname) ? fs.readFileSync(cname, 'utf8').trim() : "no está");
      caso("y el link que se comparte apunta al dominio, no a github.io",
           ((await meta('og:url')) || '').startsWith('https://' + dom),
           await meta('og:url'));
    } else {
      caso("sin dominio propio no se inventa un CNAME", !fs.existsSync(cname));
    }
  }

  /* La seña del club: ocho píxeles al borde, con la camiseta leída a lo
     largo. Antes era un lavado difuminado de pantalla completa.        */
  const fil = await pg.evaluate(() => {
    const e = document.getElementById("filete"); if(!e) return null;
    const cs = getComputedStyle(e);
    return { ancho: cs.width, fondo: cs.backgroundImage,
             lavado: getComputedStyle(document.getElementById("seña")).opacity };
  });
  caso("hay filete y es angosto", !!fil && parseFloat(fil.ancho) <= 10, fil ? fil.ancho : "no está");
  caso("el filete lleva el patrón del club, no un color plano",
       !!fil && /gradient/.test(fil.fondo), fil ? fil.fondo.slice(0,60) : "");
  caso("el lavado de pantalla completa quedó apagado", !!fil && fil.lavado === "0", fil ? fil.lavado : "");
  /* Los segmentos tienen que leerse como bandas, no como un rayado. A lo
     alto de una pantalla, quince píxeles son cincuenta y seis segmentos. */
  /* El navegador devuelve "... 0px, ... 44px, ... 44px, ... 88px": el primero
     siempre es 0, así que el grosor es el salto más chico distinto de cero. */
  const cortes = [...new Set((fil?.fondo.match(/([\d.]+)px/g) || []).map(parseFloat))]
    .filter(n => n > 0).sort((a, b) => a - b);
  const grueso = cortes[0] || 0;
  caso("los segmentos del filete son gruesos, no un rayado", grueso >= 30,
       grueso ? grueso + "px" : "no pude leer el grosor");

  await pg.click('#barra button[data-tab="numeros"]');
  await pg.waitForTimeout(400);
  const nTablas = await pg.evaluate(() => (window.STATS?.tablas || []).length);
  if (nTablas > 1) {
    caso("ofrece elegir entre las tablas",
         await pg.locator('[data-tab-tabla]').count() === nTablas);
    const antes = await pg.locator('table tr').count();
    await pg.locator('[data-tab-tabla="' + (nTablas - 1) + '"]').click();
    await pg.waitForTimeout(300);
    caso("cambiar de tabla repinta", (await pg.locator('table tr').count()) > 0 && antes > 0);
  } else {
    caso("con una sola tabla no hay selector",
         await pg.locator('[data-tab-tabla]').count() === 0);
  }

  const hayJug = await pg.evaluate(() => !!window.STATS?.jugadores);
  const secciones = await pg.locator('h3.sec').allInnerTexts();
  const tieneSeccion = n => secciones.some(t => t.trim().toUpperCase().startsWith(n));
  caso(hayJug ? "con datos de jugadores, aparece la sección"
              : "sin datos de jugadores, queda el cartel de pendiente",
       hayJug ? tieneSeccion("JUGADORES") : tieneSeccion("LO QUE FALTA"),
       secciones.map(t => t.split("\n")[0]).join(" | "));

  await pg.click('#barra button[data-tab="juego"]');
  await pg.waitForTimeout(900);
  caso("NO pide la API key", await pg.locator('#k').count() === 0);
  /* El que viene es una TARJETA con dos caminos; los jugados, renglones. */
  caso("lista los partidos solo", await pg.locator('.fx, .fxp').count() > 0);

  /* ── DOS CAMINOS, DICHOS CON TODAS LAS LETRAS ─────────────────────────
     Fausto: "no se entiende que el flash es como una simulación estándar y
     que con la tradicional hay perillas que modifican el resultado". Tenía
     razón: "Simular ya" y "Simular y verlo jugar" se leían como dos
     simulaciones distintas -una rápida y una lenta-, cuando la diferencia
     era solo si se mira. Ahora el partido que viene ofrece los dos caminos
     por lo que HACEN: armarlo vos, o simular tal cual viene. */
  {
    const t = pg.locator('.fxp').first();
    caso("el partido que viene ofrece armarlo o simularlo tal cual",
         await t.locator('[data-fx]').count() === 1 && await t.locator('[data-ya]').count() === 1);
    caso("y los dos caminos se llaman por lo que hacen",
         /armar/i.test(await t.locator('[data-fx]').innerText()) &&
         /tal cual/i.test(await t.locator('[data-ya]').innerText()));
    caso("los ya jugados no ofrecen el atajo: ahí se revela",
         await pg.locator('.fx [data-ya]').count() === 0);
  }

  const idx = await pg.evaluate(() => J.fixtures.findIndex(f => f.fixture.status.short === "NS"));
  caso("solo ofrece los partidos que tienen datos", await pg.locator('.fx, .fxp').count() === 2);
  await pg.locator('.fxp [data-fx="' + idx + '"]').click();
  await pg.waitForTimeout(900);
  caso("la cancha se arma con 22 jugadores", await pg.locator('.jug').count() === 22);

  /* El once que trae tiene que respetar los puestos. Era la queja: "casi
     todos los jugadores fuera de su puesto".                            */
  const once = await pg.evaluate(() => J.xiA.filter(Boolean)
    .map(p => ({ pos: p.pos, slot: p.slotCat, nombre: p.nombre })));
  caso("nadie juega fuera de su puesto", once.every(p => p.pos === p.slot),
       once.filter(p => p.pos !== p.slot).map(p => p.nombre + ": " + p.pos + " de " + p.slot).join(", "));
  caso("el plantel incluye al que no sumó minutos",
       await pg.evaluate(() => J.pool.A.some(p => /Refuerzo/.test(p.nombre))));
  caso("pero ese no es titular",
       !once.some(p => /Refuerzo/.test(p.nombre)));

  /* ── EL QUE SE FUE NO ESTÁ, EL QUE JUGÓ SÍ ────────────────────────────
     Los tres casos de la misma regla. El del medio es el que importa: sin
     él, un dato de transferencia equivocado nos borra un titular, que es
     peor que el problema original. */
  caso("el que se fue en el mercado de pases no aparece en el plantel",
       !await pg.evaluate(() => J.pool.A.some(p => /^Vendido/.test(p.nombre))));
  caso("pero el que siguió jugando después de irse se queda",
       await pg.evaluate(() => J.pool.A.some(p => /Unsaín/.test(p.nombre))));
  caso("y sin datos de transferencias no se saca a nadie",
       await pg.evaluate(() => J.pool.B.some(p => /R Vendido/.test(p.nombre))));
  /* ── CADA EQUIPO CON SU DIBUJO ────────────────────────────────────────
     Segunda queja: "toma todas las formaciones como 4-3-3". Los titulares
     del cache sintético son cinco defensores, tres volantes y dos
     delanteros, así que tiene que salir 5-3-2 sin que nadie lo elija. */
  caso("la formación sale de cómo se paró el equipo, no de un valor fijo",
       await pg.evaluate(() => J.formA) === "5-3-2",
       await pg.evaluate(() => J.formA));
  caso("y el rival también tiene la suya",
       await pg.evaluate(() => J.formB) === "5-3-2");
  caso("el once respeta el dibujo deducido",
       await pg.evaluate(() => J.xiA.filter(p => p && p.slotCat === "D").length) === 5);

  /* ── LOS CINCO DE VERDAD ──────────────────────────────────────────────
     El plantel propio se armaba con UN partido: "los últimos cinco" salían
     de la lista ya recortada a los dos jugables. El rival sí tenía cinco.
     Con un partido de muestra, el nivel es ruido y la mitad del plantel
     sale "sin minutos". El cache sintético tiene cinco jugados antes del
     próximo: los titulares tienen que aparecer cinco veces. */
  caso("el plantel propio se arma con los últimos cinco partidos, no con uno",
       await pg.evaluate(() => Math.max(...J.pool.A.map(p => p.apar)) === 5));
  caso("y el rival, con los suyos",
       await pg.evaluate(() => Math.max(...J.pool.B.map(p => p.apar)) === 5));

  caso("el que jugó tiene anotada la fecha de su último partido",
       await pg.evaluate(() => J.pool.A.filter(p => p.mins > 0).every(p => !!p.ultimo)));

  /* ── EL BLOQUE TIENE QUE CRUZAR LA MITAD ──────────────────────────────
     Fausto: "los globitos no pasan la mitad de la cancha". Era estructural.
     Las formaciones ocupan el 36% del alto —el de abajo del 93 al 57— y el
     movimiento estaba topeado en ±17: un delantero parado en 57 llegaba
     como mucho a 40. Para pisar el área rival (13) necesitaba moverse 44,
     casi el triple del tope. Los dos equipos jugaban siempre en su propio
     campo y no parecía un partido.

     Esto mide lo único que importa de ese arreglo: dónde termina la gente
     cuando la pelota está en cada área. Se llama a `moverJugadores` a mano
     con la pelota puesta, así el caso es determinista y no hay que esperar
     veinte segundos de animación para medirlo. */
  {
    const donde = await pg.evaluate(() => {
      const campo = document.getElementById("campo");
      const rc = campo.getBoundingClientRect();
      const leer = () => [...campo.querySelectorAll(".jug")].map(el => ({
        lado: el.dataset.lado, cat: el.dataset.cat,
        x: parseFloat(el.style.left) +
           (parseFloat(el.style.getPropertyValue("--dx")) || 0) / rc.width * 100,
        y: parseFloat(el.style.top) +
           (parseFloat(el.style.getPropertyValue("--dy")) || 0) / rc.height * 100,
      }));
      const deA = l => l.filter(p => p.lado === "A" && p.cat !== "G");
      const reposo = leer();
      moverJugadores(campo, 50, 8);      /* la pelota en el área del rival */
      const atacando = leer();
      moverJugadores(campo, 50, 92);     /* la pelota en la mía */
      const defendiendo = leer();
      quietos(campo);
      return {
        reposoArriba: Math.min(...deA(reposo).map(p => p.y)),
        atacandoArriba: Math.min(...deA(atacando).map(p => p.y)),
        cruzan: deA(atacando).filter(p => p.y < 50).length,
        /* Dónde queda la LÍNEA de defensores atacando: el más atrasado de
           los que no son arquero ni delantero ni volante. */
        defensaAtacando: Math.max(...deA(atacando).filter(p => p.cat === "D").map(p => p.y)),
        volantesAtacando: Math.max(...deA(atacando).filter(p => p.cat === "M").map(p => p.y)),
        noDefensores: deA(atacando).filter(p => p.cat !== "D").length,
        noDefensoresQueCruzan: deA(atacando).filter(p => p.cat !== "D" && p.y < 50).length,
        defendiendoArriba: Math.min(...deA(defendiendo).map(p => p.y)),
        fuera: atacando.concat(defendiendo)
                 .filter(p => p.y < 0 || p.y > 100 || p.x < 0 || p.x > 100).length,
        arqueroLejos: Math.max(...atacando.concat(defendiendo)
          .filter(p => p.cat === "G" && p.lado === "A").map(p => Math.abs(p.y - 93))),
        /* Cuánto se le acercó el jugador de campo más pegado a su propio
           arquero, en el peor de los dos momentos. */
        encimaDelArquero: Math.min(...[atacando, defendiendo].map(l => {
          const g = l.find(p => p.cat === "G" && p.lado === "A");
          return Math.min(...deA(l).map(p => Math.hypot(p.x - g.x, p.y - g.y)));
        })),
      };
    });
    caso("en reposo los equipos están en su propio campo, como en el saque",
         donde.reposoArriba > 50, "el más adelantado en " + donde.reposoArriba.toFixed(1));
    caso("pero atacando el bloque cruza la mitad",
         donde.cruzan >= 4, donde.cruzan + " jugadores pasan la mitad");
    /* ── SEGUNDA VEZ LA MISMA QUEJA ───────────────────────────────────────
       "Los globitos volvieron a moverse dentro de su mitad." La prueba de
       arriba pasaba: con la pelota en el área rival, cuatro cruzaban. Pero
       MEDIDO EN EL PARTIDO ANIMADO -donde la pelota rara vez llega al
       fondo- el defensor más adelantado llegaba a 64, el volante a 46 y solo
       el delantero cruzaba. Cuatro que cruzan con la pelota en el área no
       es un equipo atacando: es un delantero y tres que asoman.

       Lo que se ve como "un equipo que ataca" es el BLOQUE en campo rival:
       la línea de defensores pisando la mitad y los volantes bien adentro.
       Eso es lo que se mide acá: con la pelota en el área rival, TODOS los
       volantes y delanteros del otro lado, y los defensores pisando la
       mitad -no cruzándola, que un central en el área rival es otro
       error-. */
    caso("y no cruzan cuatro: cruzan todos los volantes y delanteros",
         donde.noDefensoresQueCruzan === donde.noDefensores,
         donde.noDefensoresQueCruzan + " de " + donde.noDefensores);
    caso("la línea de defensores sube hasta la mitad",
         donde.defensaAtacando < 60,
         "el defensor más atrasado queda en " + donde.defensaAtacando.toFixed(1));
    caso("y los volantes entran claramente en campo rival",
         donde.volantesAtacando < 45,
         "el volante más atrasado queda en " + donde.volantesAtacando.toFixed(1));
    caso("y alguien llega al borde del área rival",
         donde.atacandoArriba < 30, "el más adelantado en " + donde.atacandoArriba.toFixed(1));
    /* El bloque se ESTIRA, no se muda entero: el que más sube atacando es
       el que menos baja defendiendo. Con el mismo factor para los dos
       lados, el 9 terminaba defendiendo adentro de su propia área. */
    caso("y defendiendo el delantero NO se vuelve a su área",
         donde.defendiendoArriba < 82,
         "el más adelantado queda en " + donde.defendiendoArriba.toFixed(1));
    caso("nadie se va de la cancha", donde.fuera === 0, donde.fuera + " afuera");
    caso("y el arquero no se despega del arco",
         donde.arqueroLejos < 12, "se alejó " + donde.arqueroLejos.toFixed(1));
    /* ── NADIE SE PARA ARRIBA DEL ARQUERO ────────────────────────────────
       Un central ya arranca a doce puntos de su arco. Cuando el repliegue
       le sumaba treinta y cuatro más, los cuatro defensores y el arquero
       terminaban en el mismo metro cuadrado: cinco globitos superpuestos no
       son cinco jugadores, son un borrón con los nombres ilegibles. Ahora
       el repliegue de cada uno se limita al espacio que tiene detrás. */
    caso("y ningún jugador de campo se para arriba de su arquero",
         donde.encimaDelArquero > 4,
         "el más pegado quedó a " + donde.encimaDelArquero.toFixed(1));

    /* ── LA LETRA DEL GLOBITO SOBRE EL COLOR DEL CLUB ────────────────────
       Estaba en blanco fija. En River, Huracán y Vélez el fondo TAMBIÉN es
       blanco: la G, la D, la M y la F desaparecían y el anillo blanco
       terminaba de convertir a los once en manchas. En Central pasaba lo
       mismo con el amarillo. Se mide el contraste de verdad, con los
       colores de los treinta clubes, usando la misma función que usa la
       app: si alguien vuelve a poner un color fijo, esto falla en siete. */
    const flojos = await pg.evaluate(colores => {
      const lin = v => (v /= 255) <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4);
      const L = h => { const n = parseInt(String(h).slice(1), 16);
        return .2126*lin(n>>16&255) + .7152*lin(n>>8&255) + .0722*lin(n&255); };
      const ct = (a,b) => { const x=L(a), y=L(b);
        return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
      return colores.filter(c => ct(tintaSobre(c), c) < 4.5);
    }, JSON.parse(require('fs').readFileSync(path.join(__dirname, 'clubes.json')))
         .map(c => c.color));
    caso("la letra del globito se lee sobre el color de los treinta clubes",
         flojos.length === 0, flojos.join(", "));

    const ink = await pg.evaluate(() => {
      const b = document.querySelector('.jug[data-lado="A"] .b');
      const hex = tintaSobre(CLUB.color);
      const n = parseInt(hex.slice(1), 16);
      return { real: getComputedStyle(b).color,
               esperado: `rgb(${n>>16&255}, ${n>>8&255}, ${n&255})` };
    });
    caso("y el globito usa esa letra, no una fija",
         ink.real === ink.esperado, ink.real + " vs " + ink.esperado);
  }

  /* Y los globitos tienen que moverse. Antes rebotaba la pelota sola. */
  const antesDeJugar = await pg.evaluate(() =>
    [...document.querySelectorAll('.jug')].map(e => e.style.getPropertyValue('--dx')));
  /* Las perillas tienen que verse en la cancha. Antes cambiaban el resultado
     y los once puntos se quedaban exactamente donde estaban.            */
  const posiciones = () => pg.evaluate(() => [...document.querySelectorAll('.jug')]
    .map(e => ({ lado: e.dataset.lado, x: parseFloat(e.style.left), y: parseFloat(e.style.top) })));
  const perilla = async (id, v) => pg.evaluate(([id, v]) => {
    const r = document.querySelector('input[data-k="' + id + '"]');
    r.value = v; r.dispatchEvent(new Event('input', { bubbles: true }));
  }, [id, v]);

  const base = await posiciones();
  await perilla('linea', 100); await pg.waitForTimeout(120);
  const alta = await posiciones();
  const miosSubieron = base.filter(p => p.lado === 'A')
    .every((p, i) => alta.filter(q => q.lado === 'A')[i].y <= p.y);
  const alguienSubioMucho = base.filter(p => p.lado === 'A')
    .some((p, i) => p.y - alta.filter(q => q.lado === 'A')[i].y > 5);
  caso("línea alta: todo tu equipo sube", miosSubieron && alguienSubioMucho);
  caso("y el rival no se mueve por tu perilla",
       base.filter(p => p.lado === 'B').every((p, i) =>
         Math.abs(alta.filter(q => q.lado === 'B')[i].y - p.y) < 0.01));

  await perilla('linea', 0);
  await perilla('ancho', 100); await pg.waitForTimeout(120);
  const abierto = await posiciones();
  const separacion = ps => Math.max(...ps.map(p => Math.abs(p.x - 50)));
  caso("ancho al máximo: tu equipo se abre",
       separacion(abierto.filter(p => p.lado === 'A')) >
       separacion(base.filter(p => p.lado === 'A')) + 2);

  await perilla('ancho', 0);
  await perilla('presion', 100); await pg.waitForTimeout(120);
  const alto = await posiciones();
  const largo = ps => { const c = ps.filter(p => p.y > 0); return Math.max(...c.map(p => p.y)) - Math.min(...c.map(p => p.y)); };
  const sinArquero = ps => ps.filter((p, i) => i > 0);
  caso("presión alta: el bloque se acorta",
       largo(sinArquero(alto.filter(p => p.lado === 'A'))) <
       largo(sinArquero(base.filter(p => p.lado === 'A'))) - 1);
  await perilla('presion', 0); await pg.waitForTimeout(120);

  const arrancoElPartido = Date.now();
  await pg.locator('#bsim').click();
  await pg.waitForTimeout(2500);
  const durante = await pg.evaluate(() =>
    [...document.querySelectorAll('.jug')].map(e => e.style.getPropertyValue('--dx')));
  caso("los jugadores se mueven durante el partido",
       durante.some((v, i) => v && v !== antesDeJugar[i]),
       "desplazamientos vistos: " + durante.filter(Boolean).length + " de " + durante.length);

  /* Veinte segundos no es capricho: tres simulaciones seguidas tienen que
     sumar los sesenta que AdSense exige entre dos avisos. Si alguien vuelve
     a acelerar la animación, esa cuenta se rompe en silencio — y en silencio
     es como se rompen las cosas que después nadie entiende. */
  await pg.locator('.res').first().waitFor({ timeout: 40000 });
  const duro = Date.now() - arrancoElPartido;
  caso("el partido se juega y da resultado", await pg.locator('.res').count() > 0);
  caso("y dura al menos veinte segundos, que es lo que abre el hueco del aviso",
       duro >= 19500, "duró " + (duro/1000).toFixed(1) + "s");
  caso("pero tampoco se hace eterno", duro < 32000, "duró " + (duro/1000).toFixed(1) + "s");

  /* ── EL RESULTADO, SIN SERMÓN ──────────────────────────────────────────
     Estaba: "Ese fue UNO de los 6.000 partidos simulados… la barra de arriba
     es la que hay que mirar". Era entrar a un show de magia y recordarle al
     espectador que es ilusionismo. El dato no se pierde: la barra y el
     porcentaje siguen ahí arriba, que es donde corresponde. */
  /* Lo que sigue toquetea el estado del juego. Se guarda una foto para
     devolver la pantalla como estaba: los casos de más abajo siguen mirando
     el resultado de esta misma simulación. */
  await pg.evaluate(() => { window.__foto = { sim: J.sim, paso: J.paso,
    liga: J.liga, nom: JSON.parse(JSON.stringify(J.nom)) }; });
  const trasSimular = await pg.evaluate(() => document.body.innerText);
  caso("no reta a nadie después del resultado",
       !/6\.000 partidos simulados/.test(trasSimular) &&
       !/es la que hay que mirar/.test(trasSimular));
  caso("pero la barra de las tres puntas sigue estando",
       await pg.locator('.res').count() > 0);
  caso("y el marcador dice que es el partido que se vio",
       /el partido que acabás de ver/.test(trasSimular));

  /* ── LAS INDICACIONES DEL PLANTEO ──────────────────────────────────────
     Tres, del planteo y no por jugador: el motor compara líneas y no tiene
     aporte individual al que restarle una marca. */
  const ind = await pg.evaluate(() => {
    const g = {};
    for (const b of document.querySelectorAll('[data-ind]'))
      (g[b.dataset.ind] = g[b.dataset.ind] || []).push(b.dataset.val);
    return { grupos: Object.keys(g), opciones: g, texto: document.body.innerText };
  });
  caso("hay tres indicaciones del planteo", ind.grupos.length === 3, ind.grupos.join(", "));
  caso("cada una explica qué hace",
       /Personal al mejor|Por el lado flojo|se saltea el mediocampo/i.test(ind.texto));

  const cambio = await pg.evaluate(() => {
    const antes = JSON.stringify(J.IND);
    document.querySelector('[data-ind="marca"][data-val="personal"]').click();
    return { antes, ahora: JSON.stringify(J.IND) };
  });
  caso("tocar una indicación la cambia", /personal/.test(cambio.ahora), cambio.ahora);

  /* Y tiene que MOVER el resultado, no ser un cartel. */
  const mueve = await pg.evaluate(() => {
    const A = lineas(J.xiA), B = lineas(J.xiB);
    const zona = aplicarIndicaciones(A, B, { marca:"zona", ataque:"parejo", salida:"elaborada" }, J.xiA, J.xiB);
    const pers = aplicarIndicaciones(A, B, { marca:"personal", ataque:"parejo", salida:"elaborada" }, J.xiA, J.xiB);
    return { zona: zona.B.ATA, personal: pers.B.ATA };
  });
  caso("y marcar personal baja de verdad el ataque del rival",
       mueve.personal < mueve.zona,
       mueve.zona.toFixed(3) + " → " + mueve.personal.toFixed(3));
  await pg.evaluate(() => { J.IND = { marca:"zona", ataque:"parejo", salida:"elaborada" }; pintar(); });

  /* ── LOS PLANTEOS ARMADOS ──────────────────────────────────────────────
     Un planteo no es otro modo: es un atajo que escribe las mismas perillas.
     Y cuál está activo se DEDUCE de ellas, así que no puede haber dos
     verdades en desacuerdo. */
  caso("hay planteos para los dos equipos",
       await pg.locator('[data-pl="A"]').count() >= 4 &&
       await pg.locator('[data-pl="B"]').count() >= 4);

  const preset = await pg.evaluate(() => {
    document.querySelector('[data-pl="B"][data-plv="atras"]').click();
    return { KB: JSON.parse(JSON.stringify(J.KB)),
             activo: planteoDe(J.KB),
             marcado: document.querySelector('[data-pl="B"][data-plv="atras"]')
                        .getAttribute("aria-pressed") };
  });
  caso("elegir un planteo acomoda las perillas de ese equipo",
       preset.KB.linea === -70 && preset.KB.ritmo === -45, JSON.stringify(preset.KB));
  caso("y el botón queda marcado", preset.marcado === "true" && preset.activo === "atras");

  const aMano = await pg.evaluate(() => {
    const r = document.querySelector('input[data-kb="linea"]');
    r.value = 20; r.dispatchEvent(new Event("input", { bubbles: true }));
    return { KB: J.KB.linea, activo: planteoDe(J.KB) };
  });
  caso("y se puede mover a mano igual", aMano.KB === 20);
  caso("y ahí el planteo deja de estar elegido: no hay botón que mienta",
       aMano.activo === null, "" + aMano.activo);
  await pg.waitForTimeout(600);
  caso("la pantalla lo dice: quedó a mano",
       /A mano/.test(await pg.evaluate(() => document.body.innerText)));

  /* Y tiene que MOVER el resultado, que es la queja original: si el que se
     mete atrás con diez es el rival, eso tiene que poder decirse. */
  const pesa = await pg.evaluate(() => {
    const conKB = KB => {
      const t = tacticas(J.K), tB = tacticas(KB);
      const ind = aplicarIndicaciones(lineas(J.xiA), lineas(J.xiB), J.IND, J.xiA, J.xiB);
      return xgDe(ind.B, ind.A, !J.esLocalA, tB.mine * t.theirs, bonusAncho(J.xiB, tB.ancho))
             + t.theirsFlat;
    };
    return { neutro: conKB({ linea:0, presion:0, ancho:0, ritmo:0 }),
             atras:  conKB(planteo("atras")),
             vida:   conKB(planteo("lavida")) };
  });
  caso("con el rival parado atrás, el rival genera menos",
       pesa.atras < pesa.neutro, pesa.neutro.toFixed(2) + " → " + pesa.atras.toFixed(2));
  caso("y jugándose la vida, más",
       pesa.vida > pesa.neutro, pesa.neutro.toFixed(2) + " → " + pesa.vida.toFixed(2));

  /* Con el rival en neutro, la cuenta tiene que dar EXACTAMENTE lo de antes. */
  caso("con el rival en neutro no cambió nada de lo que ya andaba",
       await pg.evaluate(() => {
         const t = tacticas({ linea:0, presion:0, ancho:0, ritmo:0 });
         return t.mine === 1 && t.theirs === 1 && t.theirsFlat === 0;
       }));

  await pg.evaluate(() => { J.KB = { linea:0, presion:0, ancho:0, ritmo:0 }; pintar(); });

  /* ── EL PARTIDO YA EMPEZADO ────────────────────────────────────────────── */
  caso("se puede decir en qué minuto va", await pg.locator('#dmin').count() === 1);
  const empezado = await pg.evaluate(() => {
    const m = document.getElementById('dmin');
    m.value = 70; m.dispatchEvent(new Event('change', { bubbles: true }));
    const g = document.getElementById('dgA');
    g.value = 2; g.dispatchEvent(new Event('change', { bubbles: true }));
    return { desde: JSON.parse(JSON.stringify(J.desde)), texto: document.body.innerText };
  });
  caso("el minuto y el marcador quedan cargados",
       empezado.desde.minuto === 70 && empezado.desde.golesA === 2,
       JSON.stringify(empezado.desde));
  caso("y avisa cuántos minutos va a simular", /20 minutos que faltan/.test(empezado.texto));
  caso("dice que el planteo de esos minutos lo decidís vos",
       /lo decidís vos/i.test(empezado.texto));
  /* El límite de verdad es otro: las perillas son solo tuyas. Decirlo mal
     —"no ajusta por cómo va el partido"— hacía creer que el planteo no
     entraba en la cuenta, y entra. */
  /* La sugerencia aparece cuando hay un expulsado, y se OFRECE: cambiarle el
     planteo a alguien sin que lo pida es decidir por él en su propio juego. */
  const sugerencia = await pg.evaluate(() => {
    J.desde = { minuto:70, golesA:1, golesB:0, rojasA:1, rojasB:0 }; pintar();
    const b = document.querySelector('[data-sug="A"]');
    return { hay: !!b, dice: b ? b.textContent.trim() : "",
             antes: JSON.parse(JSON.stringify(J.K)) };
  });
  caso("con un expulsado propio se ofrece un planteo, no se impone",
       sugerencia.hay && sugerencia.antes.linea === 0,
       JSON.stringify(sugerencia));
  const aceptada = await pg.evaluate(() => {
    document.querySelector('[data-sug="A"]').click();
    return planteoDe(J.K);
  });
  caso("y si se acepta, acomoda las perillas", aceptada === "atras", "" + aceptada);
  await pg.evaluate(() => { J.K = { linea:0, presion:0, ancho:0, ritmo:0 };
    J.desde = { minuto:70, golesA:2, golesB:0, rojasA:0, rojasB:0 }; pintar(); });
  caso("el botón de simular lo dice también",
       /Simular desde el 70/.test(await pg.locator('#bsim').innerText()));
  caso("y la línea de 'con qué' también",
       /desde el 70/.test(await pg.locator('#conque').innerText()));

  /* Un minuto imposible no puede pasar. */
  const topeado = await pg.evaluate(() => {
    const m = document.getElementById('dmin');
    m.value = 300; m.dispatchEvent(new Event('change', { bubbles: true }));
    return J.desde.minuto;
  });
  caso("un minuto imposible se recorta en vez de romper todo", topeado === 89, "" + topeado);
  await pg.evaluate(() => { J.desde = { minuto:0, golesA:0, golesB:0, rojasA:0, rojasB:0 }; pintar(); });

  /* ── OTRAS LIGAS ───────────────────────────────────────────────────────
     Sin ligas publicadas, la app tiene que ser exactamente la de antes. */
  caso("sin ligas bajadas, el selector no aparece",
       await pg.locator('[data-liga]').count() === 0);

  const conLigas = await pg.evaluate(() => {
    window.LIGAS = { inglaterra: {
      id:39, slug:"inglaterra", nombre:"Premier League", pais:"Inglaterra",
      media:6.83, local:1.62, visita:1.28,
      calibrada:{ partidos:380, temporada:2025 },
      equipos:{ 1:{ n:"Rojos", j:[] }, 2:{ n:"Azules", j:[] } },
      partidos:[{ id:99, fecha:"2026-09-05T14:00:00+00:00", local:1, visita:2 }],
    }};
    window.LIGAS_DISPONIBLES = ["inglaterra"];
    J.paso = "fixture"; pintar();
    return { chips: document.querySelectorAll('[data-liga]').length,
             texto: document.body.innerText };
  });
  caso("con una liga bajada, aparece el selector", conLigas.chips === 1);

  /* ── QUE SE VEA ──────────────────────────────────────────────────────
     Esto es lo que se puede vender en cualquier país y estaba al final de
     todo, después de doce partidos ya jugados. Dos casos lo fijan: que
     tenga bandera —lo único que se reconoce sin leer— y que esté ANTES de
     "Ya jugados", que es donde termina la primera pantalla. */
  const visible = await pg.evaluate(() => {
    /* innerText respeta el text-transform del CSS, y los títulos van en
       mayúsculas: buscar "Ya jugados" tal cual no encuentra nada. */
    const t = document.body.innerText.toLowerCase();
    const b = document.querySelector('[data-liga="inglaterra"] svg.fl');
    return { bandera: !!b, colores: b ? b.innerHTML.match(/#[0-9A-Fa-f]{6}/g) || [] : [],
             antes: t.indexOf("liga del mundo"), jugados: t.indexOf("ya jugados") };
  });
  caso("cada país va con su bandera dibujada por nosotros", visible.bandera);
  caso("y la bandera tiene los colores del país, no un gris de relleno",
       visible.colores.includes("#CE1124"), visible.colores.join(" "));
  caso("y la sección va antes de los partidos ya jugados, no al final",
       visible.antes > 0 && visible.antes < visible.jugados);

  const elegida = await pg.evaluate(() => {
    document.querySelector('[data-liga="inglaterra"]').click();
    return document.body.innerText;
  });
  caso("al elegirla se ven sus partidos", /Rojos/.test(elegida) && /Azules/.test(elegida));
  /* Con qué está calibrada se dice a la vista, no en un pie de página: es la
     diferencia entre un pronóstico que se puede auditar y uno que hay que
     creer. */
  caso("y dice con cuántos partidos está calibrada",
       /380 partidos de 2025/.test(elegida), elegida.slice(-220));

  /* Un equipo sin plantel no puede tirar la pantalla abajo. */
  const flaco = await pg.evaluate(() => {
    simularDeLiga("inglaterra", 99);
    return { paso: J.paso, err: J.err };
  });
  caso("un equipo sin jugadores lo dice en vez de romperse",
       flaco.paso === "liga" && /partidos previos/.test(flaco.err), JSON.stringify(flaco));

  /* Y lo más importante: volver a mi club tiene que devolver los números de
     MI liga, o el próximo partido de Talleres se simularía con la media de
     la Premier. */
  const devuelto = await pg.evaluate(() => {
    usarLiga({ id:39, media:6.83, local:1.62, visita:1.28 });
    volverAMiClub();
    return { ahora: ligaActual(), respaldo: LIGA_POR_DEFECTO };
  });
  caso("volver al club devuelve los números de su propia liga",
       devuelto.ahora.local === devuelto.respaldo.local &&
       devuelto.ahora.media === devuelto.respaldo.media,
       JSON.stringify(devuelto.ahora));

  await pg.evaluate(() => {
    usarLiga(null);
    J.sim = window.__foto.sim; J.paso = window.__foto.paso;
    J.liga = window.__foto.liga; J.nom = window.__foto.nom;
    J.IND = { marca:"zona", ataque:"parejo", salida:"elaborada" };
    J.desde = { minuto:0, golesA:0, golesB:0, rojasA:0, rojasB:0 };
    delete window.LIGAS; delete window.LIGAS_DISPONIBLES;
    pintar();
  });
  await pg.waitForTimeout(150);

  /* ── LO QUE PIDE PLAY ──────────────────────────────────────────────────
     Cuatro archivos y dos páginas. Sin alguno de ellos la app no se puede
     empaquetar, y el problema aparecería recién al subirla. */
  const traer = async ruta => {
    const r = await pg.request.get('http://localhost:8099' + ruta);
    return { estado: r.status(), texto: r.ok() ? await r.text() : "" };
  };

  const sw = await traer('/sw.js');
  caso("el service worker se publica", sw.estado === 200);
  caso("y atiende los pedidos, que es lo que Play mide",
       /addEventListener\("fetch"/.test(sw.texto));
  caso("y va primero a la red: la caché es el paracaídas, no el avión",
       /const red = await fetch\(/.test(sw.texto));
  /* Y "primero la red" no alcanzaba: `fetch` también pasa por la caché HTTP
     del navegador, y GitHub Pages manda sus páginas con diez minutos de
     vida. Con eso, publicar y recargar podía seguir mostrando lo de antes
     sin que nada estuviera roto — que es de lo más difícil de diagnosticar,
     porque no falla: miente. Solo para las navegaciones; los datos siguen
     con la caché normal. */
  caso("y la página nunca sale de una caché vieja habiendo red",
       /new Request\(req, \{ cache: "no-store" \}\)/.test(sw.texto) &&
       /req\.mode === "navigate"/.test(sw.texto));
  /* La salida de emergencia: cambiar este número tira todo lo guardado en
     todos los teléfonos. Que exista es la mitad; que se USE cuando hace
     falta es la otra. */
  caso("y la caché lleva versión, que es la salida de emergencia",
       /const VERSION = "v\d+"/.test(sw.texto),
       (sw.texto.match(/const VERSION = "[^"]*"/) || [""])[0]);
  caso("las páginas lo registran",
       /serviceWorker/.test(await pg.evaluate(() => document.documentElement.outerHTML)));

  const man = await traer('/app.webmanifest');
  caso("hay un manifest de app en la raíz", man.estado === 200);
  const m = man.estado === 200 ? JSON.parse(man.texto) : {};
  caso("con una sola puerta de entrada", m.start_url === "/" && m.scope === "/");
  caso("y con un ícono maskable, o Android le pone un marco blanco",
       (m.icons || []).some(i => i.purpose === "maskable" && i.sizes === "512x512"),
       JSON.stringify((m.icons || []).map(i => i.sizes + " " + i.purpose)));
  for (const i of (m.icons || []))
    caso("el ícono " + i.sizes + " " + i.purpose + " existe de verdad",
         (await traer(i.src)).estado === 200);

  /* ── EL ASSETLINKS ────────────────────────────────────────────────────
     Es el archivo que autoriza a la app de Android a abrir el sitio a
     pantalla completa. Uno con datos inventados NO falla en silencio: falla
     en la cara del usuario, con la barra del navegador arriba, cada vez que
     abre la app. Así que la regla no es "tiene que existir": es que si
     existe, tiene que estar bien. Sin bloque `android` en sitio.json no se
     escribe, y eso también está bien. */
  {
    const al = await traer('/.well-known/assetlinks.json');
    if (al.estado === 404) {
      caso("sin la huella de la firma, no hay assetlinks de mentira", true);
    } else {
      let j = null; try { j = JSON.parse(al.texto); } catch (e) {}
      const t = j && j[0] && j[0].target;
      caso("el assetlinks es una lista con un target de android_app",
           !!t && t.namespace === "android_app", al.texto.slice(0, 120));
      caso("y pide el permiso que corresponde",
           !!j && (j[0].relation || []).includes("delegate_permission/common.handle_all_urls"));
      caso("con un paquete con forma de paquete",
           !!t && /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(t.package_name || ""),
           t && t.package_name);
      /* Una huella SHA-256 son 32 bytes en hexa separados por dos puntos.
         Cualquier otra cosa —una copiada a medias, una de SHA-1— deja la
         app con la barra del navegador y nadie sabe por qué. */
      const hs = (t && t.sha256_cert_fingerprints) || [];
      const mal = hs.filter(h => !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(String(h).toUpperCase()));
      caso("y al menos una huella SHA-256 entera, ninguna torcida",
           hs.length > 0 && mal.length === 0,
           hs.length + " huellas, torcidas: " + (mal.join(", ") || "ninguna"));
    }
  }

  const priv = await traer('/privacidad.html');
  caso("la política de privacidad se publica", priv.estado === 200);
  caso("y dice qué se guarda: el mail y el usuario",
       /correo electrónico/i.test(priv.texto) && /nombre de usuario/i.test(priv.texto));
  caso("y cómo borrarlo", /borrar-cuenta\.html/.test(priv.texto));

  const borrar = await traer('/borrar-cuenta.html');
  caso("y hay una página para borrar la cuenta sin instalar nada",
       borrar.estado === 200 && /Borrar tu cuenta/i.test(borrar.texto));
  caso("que avisa que los torneos de los demás no se van con vos",
       /siguen existiendo para los demás/i.test(borrar.texto));

  caso("y desde la portada se llega a las dos",
       await pg.evaluate(async () => {
         const r = await fetch("/index.html"); const t = await r.text();
         return /privacidad\.html/.test(t) && /borrar-cuenta\.html/.test(t);
       }));

  /* ── LA PESTAÑA DEL FANTASY SIN FECHA ─────────────────────────────────
     Decía "solo si hay fecha publicada", y era cierto cuando adentro solo
     se armaba un equipo. Dejó de serlo sin que nadie lo notara: ahí adentro
     están los torneos, las zonas y los puntos de la fecha pasada, y todo
     eso vive JUSTAMENTE entre una fecha y la siguiente. El lunes —cuando la
     gente quiere ver cuánto sacó— la pestaña no existía.

     Este sitio se construye SIN fecha publicada, así que es el caso exacto. */
  /* La prueba NO puede depender de que el sitio de al lado se haya
     construido sin fecha: si un día corre después del workflow, hay fecha y
     el caso se volvía verde por el motivo equivocado (o rojo, como pasó).
     La ausencia de fecha se FABRICA acá: se sirve `fecha.js` vacío. */
  {
    const pg2 = await b.newPage({ viewport: { width: 430, height: 920 } });
    await pg2.route('**/v3.football.api-sports.io/**', r => r.abort());
    await pg2.route('**/datos/fecha.js', r =>
      r.fulfill({ contentType: 'text/javascript', body: '/* sin fecha */' }));
    await pg2.goto('http://localhost:8099/' + CLUB + '.html', { waitUntil: 'networkidle' });

    const hayFecha = await pg2.evaluate(() => !!window.FECHA);
    const visible = await pg2.locator('#btfantasy').isVisible();
    caso("sin fecha publicada, la pestaña del fantasy sigue estando",
         !hayFecha && visible, "fecha: " + hayFecha + ", visible: " + visible);
    if (visible) {
      await pg2.click('#btfantasy');
      await pg2.waitForTimeout(200);
      const t = (await pg2.evaluate(() => document.body.innerText)).toLowerCase();
      caso("y adentro están los torneos, que es lo que se mira el lunes",
           /torneos de amigos/.test(t), t.slice(0, 120).replace(/\n/g, ' | '));
    }
    await pg2.close();
  }

  /* ── EL LUGAR DEL AVISO ────────────────────────────────────────────────
     No hay publicidad en la app. Hay un lugar donde algún día va a haber
     una, y estas son las reglas de cuándo corresponde. Se prueban ahora,
     con la red apagada, porque las reglas son la parte difícil. */
  const reglas = await pg.evaluate(() => {
    const AHORA = 1000000;
    const r = {};
    r.sinRed = tocaAviso({ hayRed:false, hechas:9, ultimo:0, ahora:AHORA });
    r.primera = tocaAviso({ hayRed:true, hechas:0, ultimo:0, ahora:AHORA });
    r.segunda = tocaAviso({ hayRed:true, hechas:1, ultimo:0, ahora:AHORA });
    r.muySeguido = tocaAviso({ hayRed:true, hechas:5, ultimo:AHORA - 30000, ahora:AHORA });
    r.justo59 = tocaAviso({ hayRed:true, hechas:5, ultimo:AHORA - 59000, ahora:AHORA });
    r.justo60 = tocaAviso({ hayRed:true, hechas:5, ultimo:AHORA - 60000, ahora:AHORA });
    r.premium = tocaAviso({ hayRed:true, hechas:9, ultimo:0, ahora:AHORA, premium:true });
    r.espera = AVISO.ESPERA;
    r.duracion = AVISO.DURACION_SIM;
    /* Lo que se vende es sacar la espera Y el aviso. Se mira que la
       duración salga de `duracionSim()` y no de la constante, porque el día
       que alguien vuelva a poner la constante en el setInterval el que pagó
       va a seguir esperando veinte segundos sin que falle nada. */
    const foto = PREMIUM;
    PREMIUM = { activo:true, hasta:"2099-01-01" };
    r.durPaga = duracionSim();
    PREMIUM = { activo:false, hasta:null };
    r.durGratis = duracionSim();
    PREMIUM = foto;
    return r;
  });
  caso("con la red apagada no hay aviso, pase lo que pase", reglas.sinRed === false);
  caso("la primera simulación de alguien nunca lleva aviso", reglas.primera === false);
  caso("la segunda sí", reglas.segunda === true);
  caso("dos avisos en treinta segundos, no", reglas.muySeguido === false);
  caso("a los 59 segundos todavía no", reglas.justo59 === false);
  caso("a los 60 sí, que es el mínimo que impone AdSense", reglas.justo60 === true);
  caso("el que pagó no ve ningún aviso: es lo que compró", reglas.premium === false);
  caso("y tampoco espera: la simulación le dura menos",
       reglas.durPaga < reglas.durGratis && reglas.durGratis === reglas.duracion,
       reglas.durPaga + " vs " + reglas.durGratis);
  caso("y tres simulaciones cubren justo esa espera",
       reglas.duracion * 3 === reglas.espera,
       reglas.duracion + " x 3 = " + (reglas.duracion*3) + ", espera " + reglas.espera);

  /* La propiedad de siempre: que esto exista no puede haber metido un
     script de terceros. Hay otra prueba que lo mira en el HTML; esta mira
     que la configuración esté efectivamente apagada. */
  caso("y hoy la publicidad está apagada en el sitio publicado",
       await pg.evaluate(() => !(window.SITIO && window.SITIO.publicidad)));

  /* ── EL CUPO DE SIMULACIONES ──────────────────────────────────────────
     Diez por mes gratis, y después los planes. Lo que se prueba acá es la
     regla, con casos concretos, igual que con la publicidad: cuántas quedan,
     cuándo se acabó, y —lo más importante— que con el freno apagado NADIE
     quede sin poder simular. Durante la prueba cerrada eso no es un detalle:
     un tester frenado a la mitad no puede probar nada y los catorce días no
     se repiten. */
  const cupos = await pg.evaluate(() => {
    const e = (plan, usadas, bloquea) => estadoCupo({ plan, usadas, bloquea });
    return {
      topes:        TOPES,
      reciente:     e("gratis", 3,  true),
      justo:        e("gratis", 10, true),
      pasado:       e("gratis", 12, true),
      sinFreno:     e("gratis", 99, false),
      chico:        e("chico", 39, true),
      libre:        e("libre", 5000, true),
      desconocido:  e("platino", 0, true),
      /* El ciclo del 31 de enero: un mes después cae 28 de febrero (el 31 no
         existe), y DOS meses después vuelve a caer 31 de marzo. Ese rebote es
         la razón de contar siempre desde el ancla en vez de sumarle un mes al
         ciclo anterior — sumando de a uno, febrero 28 quedaría clavado. */
      feb20:        enDia(inicioDeCiclo(new Date(2026,0,31), new Date(2026,1,20))),
      feb28:        enDia(inicioDeCiclo(new Date(2026,0,31), new Date(2026,1,28))),
      mar:          enDia(inicioDeCiclo(new Date(2026,0,31), new Date(2026,2,31))),
      /* Comprado el 20: el 19 del mes siguiente todavía es el mismo ciclo. */
      dia19:        enDia(inicioDeCiclo(new Date(2026,8,20), new Date(2026,9,19))),
      dia20:        enDia(inicioDeCiclo(new Date(2026,8,20), new Date(2026,9,20))),
      cfg:          CUPO_CFG,
      texto:        textoCupo(e("gratis", 3, true)),
    };
  });

  caso("el plan gratis son diez simulaciones por mes", cupos.topes.gratis === 10,
       JSON.stringify(cupos.topes));
  /* El tope del libre es Infinity. Playwright lo trae tal cual, pero un
     JSON.stringify por el camino lo convertiría en null: se aceptan los dos
     para que la prueba mida el tope y no el transporte. */
  caso("y los pagos son 40, 100 y sin límite",
       cupos.topes.chico === 40 && cupos.topes.medio === 100 &&
       (cupos.topes.libre === null || cupos.topes.libre === Infinity),
       JSON.stringify(cupos.topes));
  caso("con tres usadas quedan siete", cupos.reciente.quedan === 7,
       JSON.stringify(cupos.reciente));
  caso("con diez usadas se acabó", cupos.justo.seAcabo === true && !cupos.justo.puedeSimular);
  /* Pasarse no puede dar un número negativo en pantalla. */
  caso("y pasarse no deja el contador en negativo", cupos.pasado.quedan === 0,
       String(cupos.pasado.quedan));
  caso("CON EL FRENO APAGADO SIEMPRE SE PUEDE SIMULAR",
       cupos.sinFreno.puedeSimular === true && cupos.sinFreno.seAcabo === true,
       JSON.stringify(cupos.sinFreno));
  caso("el plan libre no se acaba nunca",
       cupos.libre.ilimitado === true && cupos.libre.puedeSimular === true);
  /* Un plan que la base no conozca no puede volverse ilimitado por accidente:
     cae al tope de gratis, que es el más chico. */
  caso("un plan desconocido cae al tope más chico, no al más grande",
       cupos.desconocido.tope === 10, String(cupos.desconocido.tope));
  /* ── EL CICLO ARRANCA EL DÍA QUE SE PAGA ──────────────────────────────
     Se contaba por mes calendario y el que compraba el 30 se llevaba
     cuarenta simulaciones por un día. */
  caso("comprado el 20, el 19 del mes siguiente sigue siendo el mismo ciclo",
       cupos.dia19 === "2026-09-20", cupos.dia19);
  caso("y el 20 empieza uno nuevo", cupos.dia20 === "2026-10-20", cupos.dia20);
  /* El 31 no existe en febrero. Lo que no puede pasar es que, por eso, el
     ciclo se quede clavado el 28 para siempre. */
  caso("el 20 de febrero todavía corre el ciclo que empezó el 31 de enero",
       cupos.feb20 === "2026-01-31", cupos.feb20);
  caso("el 28 arranca el siguiente, recortado porque el 31 no existe",
       cupos.feb28 === "2026-02-28", cupos.feb28);
  caso("y en marzo vuelve a caer 31: no queda clavado en el 28",
       cupos.mar === "2026-03-31", cupos.mar);
  caso("y el contador se dice en castellano",
       /te quedan 7 de 10/i.test(cupos.texto), cupos.texto);

  /* Los dos interruptores, en el sitio que se publica hoy. */
  caso("hoy el cupo no frena a nadie", cupos.cfg.bloquea === false,
       JSON.stringify(cupos.cfg));
  caso("y todavía no se cobra", cupos.cfg.cobrando === false,
       JSON.stringify(cupos.cfg));

  /* Que la cuenta CORRA. Sin sesión el contador lo lleva el navegador, y esa
     es justo la rama que hay que mirar: es la que va a usar la mayoría de los
     que prueben la app. Un contador que se muestra y no se mueve es peor que
     no tenerlo, porque nadie lo revisa dos veces. */
  {
    const antes = await pg.evaluate(() => CUPO.usadas);
    await pg.locator('#bsim').click();
    await pg.waitForSelector('#bguardar', { timeout: 40000 }).catch(() => {});
    await pg.waitForTimeout(1200);
    const despues = await pg.evaluate(() => CUPO.usadas);
    caso("cada simulación descuenta una del cupo", despues === antes + 1,
         antes + " → " + despues);

    /* Y sobrevive al recargar. El contador que había era una variable de
       JavaScript: se borraba con F5, o sea que el tope se reiniciaba solo. */
    const guardado = await pg.evaluate(() => {
      try { return JSON.parse(localStorage.getItem("armaEl11.cupo") || "null"); }
      catch (e) { return null; }
    });
    caso("y queda guardada, así el tope no se reinicia recargando",
         !!guardado && guardado.usadas === despues,
         JSON.stringify(guardado));

    /* Con el mes anotado al lado, el 1 de cada mes vuelve a cero sin que
       nadie tenga que correr nada. */
    /* Con el ancla anotada al lado, el ciclo se recalcula solo y vuelve a
       cero el día que corresponde, sin ninguna tarea programada. */
    caso("con el ancla y el ciclo anotados, para que se reinicie solo",
         !!guardado && !!guardado.ancla &&
         /^\d{4}-\d{2}-\d{2}$/.test(guardado.ciclo || ""),
         JSON.stringify(guardado));
  }

  /* El precio a la vista del que NO tiene cuenta. Es el caso que importa:
     esta prueba corre sin sesión, que es como llega el que prueba la app por
     primera vez. Si el contador solo apareciera con cuenta, el único
     enterado del precio sería el que ya se registró. */
  {
    const texto = await pg.evaluate(() => document.body.innerText);
    caso("sin cuenta, el contador de simulaciones está a la vista",
         /te quedan \d+ de \d+ simulaciones/i.test(texto));
    caso("y dice que todavía no se cobra nada",
         /todavía no se cobra nada/i.test(texto));
  }

  /* El número grande tiene que ser el partido que acaba de ver, no el
     marcador más probable: mostraba 0-1 después de un 0-2 y confundía. */
  const grande = (await tanteador(pg)).goles;
  const visto = await pg.evaluate(() => J.sim.estaVez.A + "-" + J.sim.estaVez.B);
  caso("el número grande es el partido que se vio", grande === visto,
       "en pantalla " + grande + " · jugado " + visto);

  /* ── EL TANTEADOR DICE LOS NOMBRES ────────────────────────────────────
     Era un "2-0" pelado, a pantalla y media de la cancha: había que
     acordarse de quién iba primero. Ahora dice "Talleres 2 - Belgrano 0",
     y los nombres tienen que ser LOS DE ESTE PARTIDO y en el mismo orden
     que los números — si alguien invierte uno de los dos, se lee al revés
     sin que nada falle. */
  {
    const t = await tanteador(pg);
    const nom = await pg.evaluate(() => [J.nom.A, J.nom.B]);
    caso("el tanteador dice quién contra quién, tu club primero",
         t.nombres.length === 2 && t.nombres[0] === nom[0] && t.nombres[1] === nom[1],
         t.nombres.join(" | ") + "  (esperado: " + nom.join(" | ") + ")");
  }

  /* ── LO QUE SE VE CORRIENDO Y EL NÚMERO FINAL NO SE PUEDEN CONTRADECIR ──
     El reloj dejó la cancha (tapaba defensores) y se mudó a la línea de
     equipos, y los goles quedaron pegados a cada nombre. Eso hace que el
     ORDEN signifique algo: si el gol de la izquierda es el del rival, el
     partido entero se lee al revés y nada falla.
     Se fijan las cuatro puntas de una sola convención: tu club primero en
     la línea de equipos, tu gol pegado a tu nombre, tu club primero en el
     tanteador final y el número de la izquierda igual al que se vio correr.
     Si alguien da vuelta una sola, esto falla. */
  {
    const orden = await pg.evaluate(() =>
      [...document.querySelectorAll('.equipos .nm')].map(x => x.textContent.trim()));
    const miClub = await pg.evaluate(() => J.nom.A);
    caso("en la línea de equipos tu club va primero",
         orden[0] === miClub, orden.join("  |  ") + "  (tuyo: " + miClub + ")");

    /* Se miran los goles de la línea EN EL MOMENTO en que el reloj llega a
       90, antes de que la tarjeta se dibuje, y se comparan con el tanteador.

       Y TIENE QUE SER UN PARTIDO CON GANADOR: en un 1-1 se lee igual al
       derecho que al revés y la prueba pasaría con el orden dado vuelta.
       Se simula hasta que haya diferencia. */
    let enVivo = null, final = "", empate = true;
    for (let i = 0; i < 8 && empate; i++) {
      enVivo = await pg.evaluate(() => new Promise(listo => {
        const bs = document.getElementById('bsim');
        if (!bs) return listo(null);
        /* Se toma el ÚLTIMO estado, no el primero que dice 90: el minuto 90
           se escribe dos veces (el último tic y el cierre) y si solo se
           mirara el primero, una diferencia entre esas dos líneas pasaría
           sin que nadie la vea. */
        let ultimo = null, cerrando = false;
        const t = setInterval(() => {
          const r = document.getElementById('reloj');
          const a = document.getElementById('golA'), b = document.getElementById('golB');
          if (r && !r.hidden && a && b)
            ultimo = { min: r.textContent.trim(), goles: a.textContent.trim() + "-" + b.textContent.trim() };
          if (!cerrando && ultimo && ultimo.min.startsWith("90'")) {
            cerrando = true;
            setTimeout(() => { clearInterval(t); listo(ultimo); }, 700);
          }
        }, 60);
        setTimeout(() => { clearInterval(t); listo(ultimo); }, 40000);
        bs.click();
      }));
      await pg.waitForTimeout(1500);
      final = (await tanteador(pg)).goles;
      const [a, b] = final.split("-");
      empate = a === b;
    }
    const corriendo = enVivo ? enVivo.goles : "";
    caso("los goles que se ven correr son los del resultado final",
         !empate && !!corriendo && corriendo === final,
         "en vivo " + (corriendo || "(no se vio)") + " · tarjeta " + final +
         (empate ? " · ocho simulaciones y todas empate" : ""));
  }

  /* ── EL MODO FLASH ────────────────────────────────────────────────────
     "Tarda mucho prepararla" y "me da paja" son la misma queja dicha dos
     veces. Nadie dijo que no se entendía: entendieron y no quisieron.

     Las tres cosas que tienen que ser ciertas a la vez, y la tercera es la
     que hace que el trato sea justo:
       1. el resultado sale sin los veinte segundos,
       2. gasta una del cupo, como cualquier otra,
       3. volver a ver ESE partido no gasta otra ni mueve los números.   */
  {
    /* ── UNA SOLA SIMULACIÓN, DOS FORMAS DE VERLA ─────────────────────────
       Un botón "Simular" y un selector "Ver el partido / Solo el resultado".
       Las perillas, el once y la formación entran igual en las dos: por eso
       es un selector de cómo verlo y no un segundo botón de simular. */
    caso("hay un solo botón de simular y un selector de cómo verlo",
         await pg.locator('#bsim').count() === 1 && await pg.locator('[data-ver]').count() === 2);
    /* Y debajo del botón dice CON QUÉ se va a simular. Es lo que hace
       visible que tocar una perilla cambia la cuenta. */
    await pg.evaluate(() => { J.K = { linea:0, presion:0, ancho:0, ritmo:0 };
      J.desde = { minuto:0, golesA:0, golesB:0, rojasA:0, rojasB:0 }; pintar(); });
    caso("sin tocar nada, dice que simula tal cual viene",
         /tal cual viene/i.test(await pg.locator('#conque').innerText()),
         await pg.locator('#conque').innerText());
    await pg.evaluate(() => { J.K.presion = 60; pintar(); });
    caso("y con una perilla movida, lo dice antes de simular",
         /ajustes|perillas|planteo/i.test(await pg.locator('#conque').innerText()),
         await pg.locator('#conque').innerText());
    await pg.evaluate(() => { J.K.presion = 0; pintar(); });

    await pg.click('[data-ver="0"]'); await pg.waitForTimeout(120);
    const antes = await pg.evaluate(() => CUPO.usadas);
    const t0 = Date.now();
    await pg.locator('#bsim').click();
    await pg.waitForFunction(() => J.paso === "resultado" && !J.animando, null, { timeout: 8000 });
    const tardo = Date.now() - t0;
    caso("el flash devuelve el resultado sin esperar el partido", tardo < 6000, tardo + " ms");
    caso("y gasta una del cupo igual que cualquier otra",
         await pg.evaluate(() => CUPO.usadas) === antes + 1);
    caso("el botón dice cuántas quedan, en el botón y no al costado",
         /te quedan \d+/i.test(await pg.locator('#bsim').innerText()),
         await pg.locator('#bsim').innerText());
    /* La tarjeta del resultado repite con qué se simuló, y si fue tal cual,
       ofrece el camino a las perillas. Es el momento en que se aprende que
       existen. */
    caso("el resultado dice con qué se simuló",
         await pg.locator('.res-conque').count() === 1 &&
         /tal cual viene/i.test(await pg.locator('.res-conque').innerText()));
    caso("y si fue tal cual, ofrece cambiar el planteo y volver a simular",
         await pg.locator('#bplanteo').count() === 1);

    /* El partido existe aunque no se haya mirado: por eso se puede ofrecer
       verlo. Si se generara al mirarlo, "ver" sería "simular de nuevo". */
    caso("el partido queda guardado para poder verlo",
         await pg.evaluate(() => !!(J.partido && J.partido.eventos)));
    caso("y se ofrece verlo sin gastar otra",
         await pg.locator('#bver').count() === 1);

    const numeros = () => pg.evaluate(() =>
      [J.sim.win, J.sim.draw, J.sim.loss, J.sim.xgA, J.sim.xgB,
       J.sim.estaVez.A, J.sim.estaVez.B].join("|"));
    const antesDeVer = await numeros();
    const usadasAntes = await pg.evaluate(() => CUPO.usadas);
    await pg.locator('#bver').click();
    await pg.waitForTimeout(1200);
    caso("mirarlo no gasta una simulación",
         await pg.evaluate(() => CUPO.usadas) === usadasAntes);
    await pg.waitForFunction(() => !J.animando, null, { timeout: 40000 }).catch(() => {});
    caso("y el partido que se ve es el mismo: los números no se mueven",
         await numeros() === antesDeVer);
    caso("una vez visto, ya no se ofrece verlo de nuevo",
         await pg.locator('#bver').count() === 0);
  }

  caso("el navegador NUNCA llamó a api-sports.io", apiTocada.length === 0);
  caso("sin errores de JavaScript", errs.length === 0);

  await pg.screenshot({ path: '/tmp/sitio-juego.png' });
  await b.close(); srv.close();

  const linea = "─".repeat(66);
  console.log("\n" + linea);
  casos.forEach(([n, ok]) => console.log("  " + (ok ? "ok    " : "MAL   ") + n));
  if (apiTocada.length) console.log("\n  llamadas a la API: " + apiTocada.join("\n  "));
  if (errs.length) console.log("\n  errores: " + errs.join("\n  "));
  console.log(linea);
  const mal = casos.filter(c => !c[1]).length;
  console.log(mal ? "\n" + mal + " de " + casos.length + " MAL\n"
                  : "\n" + casos.length + " de " + casos.length + ". Todo bien.\n");
  process.exit(mal ? 1 : 0);
});
