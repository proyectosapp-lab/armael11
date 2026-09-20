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

  /* ══ LA PORTADA ES ARMÁ EL 11 ══════════════════════════════════════
     Desde y35 la portada es la app en modo PORTADA: abre en El 11 con el
     resumen de dos líneas y la lista de ligas; la grilla de clubes vive en
     la pestaña "Tu club". Es la decisión de Fausto tras la prueba cerrada:
     "la principal función es simular; que la portada sea Armá el 11". */
  await pg.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle' });
  caso("la portada abre en El 11, no en los clubes",
       await pg.evaluate(() => document.querySelector('#barra [aria-pressed="true"]').dataset.tab) === 'juego');
  /* ══ EN LA PORTADA SE PUEDE COMPRAR, SIN BAJAR ═════════════════════
     Fausto, 19/9: "la compra debería estar también en la portada, está
     todo muy en scroll infinito y si no bajo no me entero". Antes el
     bloque de cupo y planes aparecía únicamente abajo del resultado, o
     sea DESPUÉS de simular.

     Y esto trajo una trampa que vale la pena dejar fijada: al dibujarse en
     el PRIMER pintado, `tarjetasDePlan()` nombra variables declaradas más
     abajo con `const`. Eso no da `undefined`, tira ReferenceError, y como
     pasa adentro de `pintar()` deja la portada EN BLANCO. `typeof` no
     salva: con un `const` en zona muerta tira igual. Si alguien saca el
     try/catch, esto falla. */
  caso("la portada dibuja: ninguna variable en zona muerta la deja en blanco",
       await pg.locator('#barra [aria-pressed="true"]').count() === 1);
  {
    const port = await pg.evaluate(() => {
      const antes = PLANES;
      PLANES = [{ id:"liga", nombre:"Tu liga", precio:3000, detalle:"una liga" },
                { id:"tres", nombre:"3 ligas", precio:7500, detalle:"tres ligas" },
                { id:"todas", nombre:"Todas", precio:12000, detalle:"las once" }];
      pintar();
      const bs = [...document.querySelectorAll("[data-plan]")];
      /* Contra el título "Elegí la liga" y no contra los chips: en este
         punto de la suite todavía no hay ligas inyectadas, pero el título
         está siempre. */
      const titulo = [...document.querySelectorAll("h3.sec")]
        .find(h => /Elegí la liga/i.test(h.textContent));
      const arriba = bs.length && titulo
        ? !!(bs[0].compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
      /* Lo que se rompió una vez: cada plan ERA el botón, un rectángulo
         transparente con el precio adentro en gris. Se leía como una
         cajita de texto y nadie lo apretaba. La señal de que volvió a
         pasar es que el botón deje de ser `.acc` —el verde de Simular—,
         que deje de decir qué hace, o que se le meta el precio adentro. */
      const b0 = bs[0];
      const est = b0 ? getComputedStyle(b0) : null;
      const r = { botones: bs.length, antesDeLasLigas: !!arriba,
                  escuchan: bs.every(b => typeof b.onclick === "function"),
                  comoAcc: bs.every(b => b.classList.contains("acc")),
                  dice: bs.every(b => /comprar/i.test(b.textContent)),
                  sinPrecioAdentro: bs.every(b => !/\d/.test(b.textContent)),
                  precioAfuera: !!document.querySelector(".plan-precio"),
                  relleno: est ? est.backgroundImage !== "none" || est.backgroundColor : null };
      PLANES = antes; pintar();
      return r;
    });
    caso("los planes se compran desde la portada", port.botones === 3, JSON.stringify(port));
    caso("y están arriba de la lista de ligas, no al final de todo",
         port.antesDeLasLigas === true);
    caso("con sus escuchadores puestos", port.escuchan === true);
    /* Fausto, 19/9: "que los botones de compra se vean realmente como
       botones y no como texto encasillado". */
    caso("el botón de comprar es el mismo verde que el de Simular", port.comoAcc === true);
    caso("y dice qué hace, no solo cuánto sale", port.dice === true);
    caso("el precio es texto al lado, no relleno del botón",
         port.sinPrecioAdentro === true && port.precioAfuera === true, JSON.stringify(port));
    caso("y el botón tiene relleno, no es un rectángulo transparente",
         port.relleno && port.relleno !== "rgba(0, 0, 0, 0)", String(port.relleno));
  }

  /* ══ INSTALAR DESDE LA WEB ═════════════════════════════════════════
     El sitio era instalable y no lo ofrecía nunca: quedaba escondido en
     el menú de Chrome. Sin instalar, la persona no tiene ícono, no vuelve
     sola y no puede recibir el aviso del once del DT —que es el gancho
     para que vuelva cada fecha—. Y una app instalada desde la web no paga
     comisión de Play.

     Lo que se fija acá: que el botón aparezca cuando el navegador ofrece
     instalar, y que NO aparezca cuando no hay nada que instalar. Un botón
     que no puede hacer lo que dice es peor que ninguno. */
  {
    const ins = await pg.evaluate(() => {
      const antes = PROMPT_INSTALAR;
      PROMPT_INSTALAR = null; pintar();
      const sin = !!document.getElementById("binstalar");
      /* Se finge la oferta del navegador, que en headless no llega. */
      PROMPT_INSTALAR = { prompt(){}, userChoice: Promise.resolve({ outcome:"accepted" }) };
      pintar();
      const b = document.getElementById("binstalar");
      const con = !!b, escucha = !!(b && typeof b.onclick === "function");
      const texto = document.querySelector("#vista").innerText;
      PROMPT_INSTALAR = antes; pintar();
      return { sin, con, escucha, avisa: /once del DT/i.test(texto) };
    });
    caso("sin oferta del navegador no hay botón de instalar", ins.sin === false);
    caso("con oferta, el botón aparece en la portada", ins.con === true);
    caso("y escucha", ins.escucha === true);
    caso("y dice para qué sirve: el aviso del once del DT", ins.avisa === true);
  }

  caso("y no pide ninguna API key: es el simulador de ligas",
       await pg.locator('#k').count() === 0 && await pg.locator('h3.sec', { hasText: /Elegí la liga/i }).count() === 1);

  /* ── EL GANCHO ────────────────────────────────────────────────────────
     Dos líneas y las dos medidas. Los números NO se pueden mover solos:
     salen de claude/modelo-backtest.md. Si alguien los cambia, esto falla
     y lo obliga a pasar por el respaldo. */
  {
    const g = pg.locator('.gancho');
    caso("la portada dice, arriba de todo, que la perilla mueve el resultado",
         await g.count() === 1 && /perilla y se mueve el resultado/i.test(await g.innerText()));
    caso("y que no tira un dado", /no tira un dado/i.test(await g.innerText()));
    const txt = await g.innerText();
    for (const n of ["13.345", "trece ligas", "1.783", "6.000"])
      caso("y el respaldo dice " + n, txt.includes(n), txt.replace(/\n/g, " ").slice(0, 140));
    caso("y no promete acertar ni eficacia: eso no está medido en Argentina",
         !/acert|efica|gan[aá] plata|cuota/i.test(txt));
    caso("dice cuántas simulaciones son gratis", /\d+ simulaciones gratis/.test(txt));
    caso("el gancho va ANTES de la lista de ligas",
         await pg.evaluate(() => {
           const ga = document.querySelector('.gancho'), li = document.querySelector('h3.sec + .tarjeta');
           return !!ga && !!li && (ga.compareDocumentPosition(li) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
         }));
  }

  /* ── EL NOMBRE ──────────────────────────────────────────────────────── */
  {
    const site = await pg.locator('meta[property="og:site_name"]').getAttribute('content');
    caso("la portada se presenta con el nombre del producto", site === "Armá el 11", site);
    const html = await pg.content();
    caso("y no queda ni un TSTE a la vista", !/TSTE/.test(html),
         (html.match(/.{0,30}TSTE.{0,30}/) || [""])[0]);
    caso("el descargo nombra a la Liga y a ningún club en particular",
         /sin relación con ningún club ni con la Liga Profesional/.test(await pg.locator('.pie').innerText()));
  }

  /* ── LA GRILLA DE CLUBES, EN "TU CLUB" ────────────────────────────── */
  await pg.locator('#barra [data-tab="feed"]').click();
  await pg.waitForTimeout(300);
  caso("la pestaña del feed se llama 'Tu club' en la portada",
       /tu club/i.test(await pg.locator('#barra [data-tab="feed"]').innerText()));
  caso("y lista los clubes", await pg.locator('.club').count() > 0);
  {
    const cortadas = await pg.evaluate(() => {
      const mal = [];
      for (const e of document.querySelectorAll('.club')) {
        const ciu = e.querySelector('.ciu'); if (!ciu) continue;
        if (ciu.scrollWidth > ciu.clientWidth + 1) mal.push(e.querySelector('.nom').textContent.trim());
      }
      return mal;
    });
    caso("ninguna ciudad queda cortada", cortadas.length === 0, cortadas.join(", "));
    const apilado = await pg.evaluate(() => {
      const c = document.querySelector('.club');
      const n = c.querySelector('.nom').getBoundingClientRect(), u = c.querySelector('.ciu').getBoundingClientRect();
      return u.top >= n.bottom - 2;
    });
    caso("la ciudad va debajo del nombre, no peleándole el renglón", apilado);
  }
  /* ?elegir abre directo en la grilla: es a donde manda "Cambiar de club" */
  await pg.goto('http://localhost:8099/index.html?elegir', { waitUntil: 'load' });
  await pg.waitForTimeout(300);
  caso("index.html?elegir abre en la grilla de clubes",
       await pg.evaluate(() => document.querySelector('#barra [aria-pressed="true"]').dataset.tab) === 'feed');

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

  /* Y que el interruptor de sitio.json mande de verdad.

     OJO CON CÓMO SE TOCA `window.SITIO`: acá decía `window.SITIO = {...}`,
     o sea que REEMPLAZABA el objeto entero y se llevaba puesto todo lo
     demás -supabase, cupo, avisos, publicidad- para todas las pruebas que
     vienen después. Era invisible mientras ninguna las mirara; el día que
     una prueba nueva leyó `SITIO.publicidad` empezó a fallar sin razón
     aparente, a doscientas líneas de distancia del culpable.

     Ahora se toca SOLO la clave que esta prueba necesita y se la devuelve
     como estaba. */
  const apagadas = await pg.evaluate(() => {
    const antes = window.SITIO && window.SITIO.miniaturas;
    window.SITIO.miniaturas = "ninguna"; pintar();
    const n = document.querySelectorAll('.foto, .mini-f').length;
    window.SITIO.miniaturas = antes || "todas"; pintar();
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

  /* La promesa fue contar visitas sin espiar a nadie, y durante mucho tiempo
     eso se pudo decir en su forma más fuerte: NINGÚN script de otro dominio.

     Desde y51 hay una excepción, y una sola: el de AdSense, y solo porque
     `sitio.json` tiene la publicidad configurada. La regla que queda en pie
     -y que es la que hay que cuidar- es que ese sea el ÚNICO, y que sin
     publicidad configurada no haya ni ese. Un analytics, un CDN de fuentes
     o una librería traída de afuera siguen estando prohibidos.           */
  {
    const hayPub = await pg.evaluate(() => !!(window.SITIO && window.SITIO.publicidad));
    const deGoogle = ajenos.filter(h => /googlesyndication|doubleclick|googleads/.test(h));
    const otros = ajenos.filter(h => !/googlesyndication|doubleclick|googleads/.test(h));
    caso("no carga ningún script de terceros, salvo el de la publicidad",
         otros.length === 0, otros.join(", "));
    if (!hayPub)
      caso("y sin publicidad configurada, tampoco el de Google",
           deGoogle.length === 0, deGoogle.join(", "));
  }

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
  /* ── EL PARTIDO TAMBIÉN SE APRIETA ────────────────────────────────
     Esto era una `.mini`: filas de texto con un `›` al final y un
     `role="button"` que solo ve el lector de pantalla. Para el ojo, una
     lista. Ahora hay un botón de verdad, y encima uno solo por partido:
     el `keydown` viejo sumado al click nativo de un `<button>` llamaba a
     simular DOS veces, y cada una gasta del cupo. */
  {
    const p = await pg.evaluate(() => {
      const b = document.querySelector("[data-part]");
      return b ? { tag: b.tagName, acc: b.classList.contains("acc"),
                   dice: b.textContent.trim(), teclado: !!b.onkeydown,
                   relleno: getComputedStyle(b).backgroundImage !== "none" } : null;
    });
    caso("cada partido tiene un botón de verdad, no una fila de texto",
         p && p.tag === "BUTTON" && p.acc === true, JSON.stringify(p));
    caso("y el botón dice qué hace", p && /simular/i.test(p.dice), p && p.dice);
    caso("con relleno, igual que el de comprar", p && p.relleno === true);
    caso("y sin el keydown viejo, que simulaba dos veces y gastaba dos del cupo",
         p && p.teclado === false);
  }
  /* ── Y LA PANTALLA BAJA SOLA ──────────────────────────────────────
     Fausto, 19/9: "que se desplace automáticamente hacia abajo". Con once
     ligas agrupadas por continente, el que elige Italia la tiene abajo de
     todo y la lista de partidos aparece FUERA de la pantalla: la app se ve
     como si el toque no hubiera hecho nada.

     Se espía `scrollTo` en vez de mirar `scrollY` porque el alto real de
     la página en la prueba depende de cuántos partidos haya, y una prueba
     que falla según eso no prueba nada. */
  {
    const s = await pg.evaluate(async () => {
      const antes = window.scrollTo;
      let pedido = null;
      window.scrollTo = o => { pedido = o; };
      /* Cerrar y volver a abrir: el mismo botón alterna. */
      document.querySelector('[data-liga="inglaterra"]').click();
      const alCerrar = await new Promise(r => requestAnimationFrame(() => setTimeout(() => r(pedido), 0)));
      pedido = null;
      document.querySelector('[data-liga="inglaterra"]').click();
      const alAbrir = await new Promise(r => requestAnimationFrame(() => setTimeout(() => r(pedido), 0)));
      window.scrollTo = antes;
      return { alAbrir, alCerrar };
    });
    caso("al elegir una liga, la pantalla baja sola a sus partidos",
         !!s.alAbrir && typeof s.alAbrir.top === "number", JSON.stringify(s.alAbrir));
    caso("y al cerrarla no persigue a nadie hacia abajo", s.alCerrar === null);
  }
  /* Con qué está calibrada se dice a la vista, no en un pie de página: es la
     diferencia entre un pronóstico que se puede auditar y uno que hay que
     creer. */
  caso("y dice con cuántos partidos está calibrada",
       /380 partidos de 2025/.test(elegida), elegida.slice(-220));

  /* ── ONCE LIGAS TIENEN QUE ENTRAR, Y DECIR LA VERDAD ───────────────────
     Con seis en una tira que se corría al costado ya se perdían dos. Y la
     medida del backtest, que estaba guardada desde agosto, no se veía en
     ningún lado. Lo que estos casos fijan es lo segundo, que es una decisión
     y no un detalle: la app dice también dónde el modelo NO rinde. Si
     alguna vez alguien saca la frase de Argentina para que quede más
     linda, esto falla. */
  const muchas = await pg.evaluate(() => {
    const liga = (slug, pais, nombre, zona, ventaja) => ({
      id: 1, slug, nombre, pais, zona, ventajaBacktest: ventaja,
      media: 6.8, local: 1.5, visita: 1.2, calibrada: { partidos: 100, temporada: 2025 },
      equipos: { 1: { n: "A", j: [] }, 2: { n: "B", j: [] } }, partidos: [],
    });
    window.LIGAS = {
      argentina: liga("argentina", "Argentina", "Liga Profesional", "america", 0.0046),
      brasil:    liga("brasil", "Brasil", "Brasileirão", "america", 0.0193),
      portugal:  liga("portugal", "Portugal", "Primeira Liga", "europa", 0.0979),
      vieja:     liga("vieja", "Vieja", "Sin zona", "", null),
    };
    window.LIGAS_DISPONIBLES = ["argentina", "brasil", "portugal", "vieja"];
    J.liga = null; J.paso = "liga"; pintar();
    const txt = document.body.innerText;
    const dela = s => { const b = document.querySelector('[data-liga="' + s + '"] .lg-m');
                        return b ? b.textContent.trim() : null; };
    return { botones: document.querySelectorAll('[data-liga]').length,
             zonas: [...document.querySelectorAll('.zona')].map(h => h.textContent.trim()),
             argentina: dela("argentina"), brasil: dela("brasil"), portugal: dela("portugal"),
             vieja: dela("vieja"), texto: txt };
  });
  caso("las once entran todas: ninguna liga se queda afuera de la pantalla",
       muchas.botones === 4, muchas.botones + " botones");
  caso("y van agrupadas por zona, América primero",
       muchas.zonas.join("|") === "América|Europa|Otras", muchas.zonas.join("|"));
  caso("la liga bajada por una corrida vieja, sin zona, igual aparece",
       muchas.vieja === null && /Sin zona/.test(muchas.texto));
  caso("cada liga dice en qué escalón de acierto quedó",
       muchas.portugal === "Índice de acierto más alto" &&
       muchas.brasil === "Índice de acierto alto", muchas.portugal + " · " + muchas.brasil);
  /* Argentina es la liga del 90% de los usuarios y la peor del modelo. La
     etiqueta nombra a la LIGA, no al modelo —es verdad y es lo que un
     hincha reconoce—, pero no la disfraza de buena: si alguna vez alguien
     le pone el escalón de arriba para que quede linda, esto falla. */
  caso("y Argentina no se disfraza: se la nombra como la más impredecible",
       muchas.argentina === "Liga más impredecible", "" + muchas.argentina);
  caso("abajo va la estadística dura: contra cuántos partidos se probó",
       /más de 13.000 partidos ya jugados/.test(muchas.texto) &&
       /se recalibra con cada temporada/.test(muchas.texto));
  /* Se puede decir lo que se MIDIÓ. Lo que no se puede es prometer lo que
     va a pasar en el próximo partido, que es la frontera con las apuestas. */
  caso("y nunca promete acertar el próximo partido",
       !/garantiz|asegurad|infalible|vas a acertar|acertá/i.test(muchas.texto));
  const largaArg = await pg.evaluate(() => {
    document.querySelector('[data-liga="argentina"]').click();
    return document.body.innerText;
  });
  caso("al abrir la liga, la frase larga lo dice sin adornos",
       /la liga más impredecible de las once/i.test(largaArg));

  /* Se vuelve a dejar como estaba para lo que sigue. */
  await pg.evaluate(() => {
    window.LIGAS = { inglaterra: {
      id:39, slug:"inglaterra", nombre:"Premier League", pais:"Inglaterra",
      media:6.83, local:1.62, visita:1.28, zona:"europa", ventajaBacktest:0.0519,
      calibrada:{ partidos:380, temporada:2025 },
      equipos:{ 1:{ n:"Rojos", j:[] }, 2:{ n:"Azules", j:[] } },
      partidos:[{ id:99, fecha:"2026-09-05T14:00:00+00:00", local:1, visita:2 }],
    }};
    window.LIGAS_DISPONIBLES = ["inglaterra"];
    J.liga = "inglaterra"; J.paso = "fixture"; pintar();
  });

  /* Un equipo sin plantel no puede tirar la pantalla abajo. */
  const flaco = await pg.evaluate(() => {
    simularDeLiga("inglaterra", 99);
    return { paso: J.paso, err: J.err };
  });
  caso("un equipo sin jugadores lo dice en vez de romperse",
       flaco.paso === "liga" && /partidos previos/.test(flaco.err), JSON.stringify(flaco));

  /* ── EL ONCE DEL DT, TAMBIÉN EN LAS OTRAS LIGAS ────────────────────────
     Hasta el 18/9/2026 esto andaba solo en los treinta clubes argentinos:
     `simularDeLiga` dejaba `J.fx` en null y todo el revelado cuelga de ahí.
     La ronda corta ahora baja las formaciones de las once ligas y las deja
     en `window.ONCES`, aparte del archivo de la liga -que se rehace todos
     los días y se las llevaría puestas-.

     Lo que estos casos fijan: que el partido de liga sea un partido de
     verdad, que el once se lea del archivo nuevo sin tocar la API, y que
     NO aparezcan las dos cosas que son del club de la página -el aviso al
     teléfono y el link del pronóstico, que guarda el club y volvería con
     otro partido-. */
  const conOnce = await pg.evaluate(() => {
    const plantel = (nom, base) => ({ n: nom, j: "GDDDDMMMFFFDMFMG".split("").map((p, i) =>
      ({ i: base + i, n: nom + " " + i, p, r: 6.4 + (i % 5) / 10, m: 400 + i * 10 })) });
    window.LIGAS = { inglaterra: {
      id:39, slug:"inglaterra", nombre:"Premier League", pais:"Inglaterra",
      media:6.83, local:1.62, visita:1.28, zona:"europa", ventajaBacktest:0.0519,
      calibrada:{ partidos:380, temporada:2025 },
      equipos:{ 1: plantel("Rojos", 1000), 2: plantel("Azules", 2000) },
      partidos:[{ id:98, fecha:"2026-09-05T14:00:00+00:00", ronda:"Fecha 5", local:1, visita:2 },
                { id:97, fecha:"2026-09-05T16:00:00+00:00", ronda:"Fecha 5", local:2, visita:1 }],
    }};
    window.LIGAS_DISPONIBLES = ["inglaterra"];
    /* El 98 tiene once del DT; el 97 no. */
    window.ONCES = { "98": { f:"2026-09-05T14:00:00+00:00", o: [
      { team:{ id:1, name:"Rojos" }, formation:"4-4-2",
        startXI: window.LIGAS.inglaterra.equipos[1].j.slice(0, 11)
          .map(j => ({ player:{ id:j.i, name:j.n, pos:j.p } })) },
      { team:{ id:2, name:"Azules" }, formation:"4-3-3",
        startXI: window.LIGAS.inglaterra.equipos[2].j.slice(0, 11)
          .map(j => ({ player:{ id:j.i, name:j.n, pos:j.p } })) }] } };
    simularDeLiga("inglaterra", 98);
    return { paso: J.paso, err: J.err, fx: J.fx && { id:J.fx.fixture.id, fecha:J.fx.fixture.date,
               local:J.fx.teams.home.id, visita:J.fx.teams.away.id, goles:J.fx.goals },
             jugado: J.jugado, salio: hayOnceDelDT(), pie: pieDelResultado() };
  });
  caso("un partido de otra liga se arma igual que el de tu club",
       conOnce.paso === "armar" && !conOnce.err, JSON.stringify(conOnce.err || conOnce.paso));
  caso("y queda con su partido de verdad: id, fecha y los dos equipos",
       conOnce.fx && conOnce.fx.id === 98 && conOnce.fx.local === 1 && conOnce.fx.visita === 2 &&
       /2026-09-05/.test(conOnce.fx.fecha || ""), JSON.stringify(conOnce.fx));
  caso("sin inventar un resultado: todavía no se jugó",
       conOnce.jugado === false && conOnce.fx.goles.home === null);
  caso("el once del DT de la Premier se ve, sin pedirle nada a la API", conOnce.salio === true);
  /* Fausto, 19/9: "un aviso si esas formaciones ya están confirmadas o son
     tentativas al ingresar al Armá el 11 de ese partido". La trampa que
     este aviso desactiva: los once de la cancha SIEMPRE los armó la app,
     también cuando el DT ya publicó el suyo. Sin decirlo, el que entra
     media hora antes cree que la app se equivocó en cuatro nombres. */
  {
    const av = await pg.evaluate(() => ({ cuantas: formacionesConfirmadas(),
                                          txt: document.body.innerText }));
    caso("con los dos once publicados, el aviso dice que están confirmadas",
         av.cuantas === 2 && /formaciones ya están confirmadas/i.test(av.txt));
    caso("y aclara igual que los de la cancha los armó la app",
         /los armó la app/i.test(av.txt));
  }
  caso("y el pie invita a simularlo", /Salió el once del DT/.test(conOnce.pie));
  caso("pero no ofrece el link del pronóstico, que es del club de la página",
       !/Copiar el link/.test(conOnce.pie), conOnce.pie.slice(0, 200));

  const sinOnce = await pg.evaluate(() => {
    simularDeLiga("inglaterra", 97);
    return { salio: hayOnceDelDT(), pie: pieDelResultado(),
             cuantas: formacionesConfirmadas(), txt: document.body.innerText };
  });
  caso("el partido cuya formación todavía no salió lo dice", sinOnce.salio === false &&
       /todavía no se jugó/i.test(sinOnce.pie));
  caso("y arriba avisa que las formaciones son tentativas",
       sinOnce.cuantas === 0 && /formaciones tentativas/i.test(sinOnce.txt));
  caso("diciendo cuándo sale la de verdad, que es lo accionable",
       /una hora antes/i.test(sinOnce.txt));
  caso("y ahí no se ofrece el aviso al teléfono: los avisos son por club",
       !/avis/i.test(sinOnce.pie), sinOnce.pie.slice(0, 200));

  /* El dato que importa: lo bajado se lee del archivo nuevo, no de la API. */
  const porApi = await pg.evaluate(async () => {
    const r = await api("/fixtures/lineups", { fixture: 98 });
    return { largo: r.length, forma: r[0] && r[0].formation };
  });
  caso("api() saca el once de ONCES sin salir a la red",
       porApi.largo === 2 && porApi.forma === "4-4-2", JSON.stringify(porApi));

  await pg.evaluate(() => { delete window.ONCES; volverAMiClub(); });

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
    const av = o => tocaAviso({ hayRed:true, ultimo:0, ahora:AHORA, ...o });
    r.sinRed = tocaAviso({ hayRed:false, hechas:9, desdeAviso:9, ultimo:0, ahora:AHORA });
    r.primera = av({ hechas:1, desdeAviso:1 });
    r.segunda = av({ hechas:2, desdeAviso:2 });
    r.tercera = av({ hechas:3, desdeAviso:1 });
    r.cuarta  = av({ hechas:4, desdeAviso:2 });
    r.muySeguido = av({ hechas:5, desdeAviso:2, ultimo:AHORA - 30000 });
    r.justo59 = av({ hechas:5, desdeAviso:2, ultimo:AHORA - 59000 });
    r.justo60 = av({ hechas:5, desdeAviso:2, ultimo:AHORA - 60000 });
    r.premium = av({ hechas:9, desdeAviso:9, premium:true });
    /* Si un aviso se saltea por el piso de tiempo, la cuenta sigue desde
       donde quedó: a la siguiente sale, no se desfasa para siempre. */
    r.despuesDeSaltear = av({ hechas:6, desdeAviso:3 });
    r.cada = AVISO.CADA;
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
  /* La regla que pidió Fausto el 18/9/2026: uno cada dos simulaciones. */
  caso("y de ahí en más, uno cada dos simulaciones",
       reglas.cada === 2 && reglas.tercera === false && reglas.cuarta === true,
       "cada " + reglas.cada + " · 3ª " + reglas.tercera + " · 4ª " + reglas.cuarta);
  caso("si uno se saltea por el reloj, la cuenta no se desfasa",
       reglas.despuesDeSaltear === true);
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

  /* Cómo está la publicidad en el sitio publicado HOY. Son dos momentos
     distintos y el de en medio importa: con la cuenta aprobada pero sin
     unidad de anuncio creada todavía, la app tiene que verse exactamente
     como si no hubiera publicidad. Esta prueba fija ese estado; cuando se
     cree la unidad va a fallar, y ahí hay que mirarla y actualizarla a
     mano, que es justo lo que se quiere. */
  {
    const p = await pg.evaluate(() => (window.SITIO && window.SITIO.publicidad) || null);
    caso("la publicidad está configurada con cliente",
         !!(p && p.cliente), JSON.stringify(p));
    caso("y todavía sin unidad, así que no se dibuja ningún hueco",
         !(p && p.bloque) && await pg.locator('.publi').count() === 0);
  }

  /* ── EL CUPO DE SIMULACIONES ──────────────────────────────────────────
     Diez por mes gratis, y después los planes. Lo que se prueba acá es la
     regla, con casos concretos, igual que con la publicidad: cuántas quedan,
     cuándo se acabó, y —lo más importante— que con el freno apagado NADIE
     quede sin poder simular. Durante la prueba cerrada eso no es un detalle:
     un tester frenado a la mitad no puede probar nada y los catorce días no
     se repiten. */
  const cupos = await pg.evaluate(() => {
    const e = (plan, usadas, bloquea, ligas, liga) =>
      estadoCupo({ plan, usadas, bloquea, ligas, liga });
    return {
      topes:        TOPES,
      ligasPlan:    LIGAS_DEL_PLAN,
      reciente:     e("gratis", 3,  true),
      justo:        e("gratis", 10, true),
      pasado:       e("gratis", 12, true),
      sinFreno:     e("gratis", 99, false),
      unaLiga:      e("liga", 5000, true),
      todas:        e("todas", 5000, true, ["espana","italia","peru"], "portugal"),
      desconocido:  e("platino", 0, true),
      /* Lo que cambia el 18/9/2026: el plan dice EN CUANTAS LIGAS. */
      gratisOtra:   e("gratis", 1, true, ["argentina"], "espana"),
      gratisMisma:  e("gratis", 1, true, ["argentina"], "argentina"),
      pagaOtra:     e("liga", 900, true, ["argentina"], "espana"),
      tresLibre:    e("tres", 900, true, ["argentina","espana"], "italia"),
      tresLlena:    e("tres", 900, true, ["argentina","espana","italia"], "francia"),
      sinFrenoOtra: e("gratis", 1, false, ["argentina"], "espana"),
      textoOtra:    textoCupo(e("liga", 9, true, ["argentina"], "espana"), null, "espana"),
      textoTres:    textoCupo(e("tres", 9, true, ["argentina","espana","italia"], "francia"), null, "francia"),
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
      /* El freno sale de la base (`cobra`), con sitio.json de respaldo
         mientras no haya respuesta. Se mira con el CUPO de verdad, guardando
         y devolviendo lo que había. */
      ...(() => { const foto = CUPO;
        CUPO = { ...foto, cobra: undefined }; const sin = frenaElCupo();
        CUPO = { ...foto, cobra: true };      const si  = frenaElCupo();
        CUPO = { ...foto, cobra: false };     const no  = frenaElCupo();
        CUPO = foto;
        return { frenaSinRespuesta: sin, frenaConSi: si, frenaConNo: no }; })(),
      texto:        textoCupo(e("gratis", 3, true)),
    };
  });

  /* ══ SE TIENE QUE PODER COMPRAR, Y DESDE DONDE SE VE EL PRECIO ══════
     El 19/9/2026 Fausto abrió la app aprobada y dijo: "no hay un solo
     botón para comprar. Está el aviso con los precios y en ningún lado la
     opción". Tenía razón: los botones existían SOLO adentro del panel de
     cuenta, y ese panel solo los dibuja si la persona ya entró y ya eligió
     usuario. El que abría la app y quería pagar veía el precio y no tenía
     dónde tocar.

     Esto fija las dos mitades del arreglo: que los botones estén donde se
     ve el precio, y que escuchen. Un botón dibujado y sin escuchador es
     peor que no tenerlo: parece roto. */
  {
    const compra = await pg.evaluate(() => {
      window.__antes = { planes: PLANES, cupo: CUPO };
      PLANES = [{ id:"liga", nombre:"Tu liga", precio:3000, detalle:"una liga" },
                { id:"tres", nombre:"3 ligas", precio:7500, detalle:"tres ligas" },
                { id:"todas", nombre:"Todas las ligas", precio:12000, detalle:"las once" }];
      CUPO = { plan:"gratis", usadas:3, hasta:null, ligas:["argentina"], cobra:false };
      pintar();
      const todos = [...document.querySelectorAll("[data-plan]")];
      const fuera = todos.filter(b => !b.closest("#cuenta"));
      return {
        total: todos.length,
        fueraDelPanel: fuera.length,
        ids: fuera.map(b => b.dataset.plan),
        sonBotones: fuera.every(b => b.tagName === "BUTTON"),
        escuchan: fuera.every(b => typeof b.onclick === "function"),
        apagados: fuera.filter(b => b.disabled).length,
      };
    });
    caso("los tres planes se pueden comprar desde donde se ve el precio",
         compra.fueraDelPanel === 3, JSON.stringify(compra));
    caso("y son los tres planes de verdad",
         compra.ids.join(",") === "liga,tres,todas", compra.ids.join(","));
    caso("son botones, no texto de adorno", compra.sonBotones === true);
    caso("y cada uno escucha: un botón dibujado que no hace nada parece roto",
         compra.escuchan === true);
    caso("con el cobro prendido, ninguno queda apagado",
         compra.apagados === 0, compra.apagados + " apagados");
    /* Se deja todo como estaba: lo que sigue cuenta simulaciones y un CUPO
       cambiado acá le movería el piso. */
    await pg.evaluate(() => {
      PLANES = window.__antes.planes; CUPO = window.__antes.cupo;
      delete window.__antes; pintar();
    });
  }

  caso("el plan gratis son diez simulaciones por mes", cupos.topes.gratis === 10,
       JSON.stringify(cupos.topes));
  /* El tope del libre es Infinity. Playwright lo trae tal cual, pero un
     JSON.stringify por el camino lo convertiría en null: se aceptan los dos
     para que la prueba mida el tope y no el transporte. */
  /* Los pagos ya no tienen tope de simulaciones: lo que compran es CUANTAS
     LIGAS. Infinity viaja como null si algo lo pasa por JSON, así que se
     aceptan los dos: la prueba mide el tope, no el transporte. */
  caso("ningún plan pago tiene tope de simulaciones",
       ["liga","tres","todas"].every(k =>
         cupos.topes[k] === null || cupos.topes[k] === Infinity),
       JSON.stringify(cupos.topes));
  caso("y lo que compran son ligas: una, tres o todas",
       cupos.ligasPlan.gratis === 1 && cupos.ligasPlan.liga === 1 &&
       cupos.ligasPlan.tres === 3 && cupos.ligasPlan.todas >= 11,
       JSON.stringify(cupos.ligasPlan));
  caso("con tres usadas quedan siete", cupos.reciente.quedan === 7,
       JSON.stringify(cupos.reciente));
  caso("con diez usadas se acabó", cupos.justo.seAcabo === true && !cupos.justo.puedeSimular);
  /* Pasarse no puede dar un número negativo en pantalla. */
  caso("y pasarse no deja el contador en negativo", cupos.pasado.quedan === 0,
       String(cupos.pasado.quedan));
  caso("CON EL FRENO APAGADO SIEMPRE SE PUEDE SIMULAR",
       cupos.sinFreno.puedeSimular === true && cupos.sinFreno.seAcabo === true,
       JSON.stringify(cupos.sinFreno));
  caso("un plan pago no se acaba nunca por cantidad",
       cupos.unaLiga.ilimitado === true && cupos.unaLiga.puedeSimular === true);

  /* ── LA LIGA, QUE ES LO QUE SE VENDE DESDE EL 18/9/2026 ───────────────
     La primera liga del período queda tomada. El que paga tres las va
     tomando a medida que las usa. Y "sin límite" no quiere decir "todas":
     se puede tener sin límite y aun así toparse con una liga que no entra,
     que es justo el caso que una pantalla mal hecha esconde. */
  caso("en el plan gratis, la segunda liga del mes no entra",
       cupos.gratisOtra.entraLiga === false && cupos.gratisOtra.puedeSimular === false);
  caso("pero la que ya tomó sigue entrando",
       cupos.gratisMisma.entraLiga === true && cupos.gratisMisma.puedeSimular === true);
  caso("con el plan de una liga pasa lo mismo: sin límite, pero en ESA liga",
       cupos.pagaOtra.ilimitado === true && cupos.pagaOtra.puedeSimular === false);
  caso("el de tres ligas deja tomar la tercera",
       cupos.tresLibre.entraLiga === true && cupos.tresLibre.libresDeLiga === 1);
  caso("y con las tres tomadas, la cuarta no",
       cupos.tresLlena.entraLiga === false && cupos.tresLlena.puedeSimular === false);
  caso("el de todas nunca se topa con una liga",
       cupos.todas.entraLiga === true && cupos.todas.puedeSimular === true);
  caso("CON EL FRENO APAGADO TAMPOCO FRENA LA LIGA",
       cupos.sinFrenoOtra.puedeSimular === true && cupos.sinFrenoOtra.entraLiga === false);
  /* El texto tiene que mandar al plan que corresponde, no a "comprá algo". */
  caso("y el cartel dice a qué plan hay que ir para esa liga",
       /plan de tres ligas o el de todas/.test(cupos.textoOtra) &&
       /plan de todas/.test(cupos.textoTres),
       cupos.textoOtra + " · " + cupos.textoTres);
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

  /* ── LOS DOS INTERRUPTORES, AHORA PRENDIDOS ───────────────────────────
     Estuvieron apagados los catorce días de la prueba cerrada: el contador
     contaba y se mostraba, pero no frenaba a nadie, porque un tester frenado
     a la mitad no puede probar nada. Al cerrar la prueba (18/9/2026) se
     prendieron los dos.

     Y TIENEN QUE MOVERSE JUNTO CON EL SERVIDOR, que desde ese día también
     frena: `sumar_simulacion` corta con 'sin cupo' o 'otra liga'. Apagar
     `bloquea` sin sacar el freno de la base deja que la pantalla te deje
     apretar y el servidor conteste que no, que es la peor de las dos. Si
     alguna vez hay que volver a apagarlo, se apagan los dos lados. */
  caso("los precios están a la vista", cupos.cfg.cobrando === true, JSON.stringify(cupos.cfg));
  caso("y el freno NO se prende desde el zip: lo decide la base",
       cupos.cfg.bloquea === false && cupos.frenaSinRespuesta === false,
       JSON.stringify(cupos.cfg));
  caso("cuando la base dice que cobra, frena; cuando dice que no, no",
       cupos.frenaConSi === true && cupos.frenaConNo === false);

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
    /* Y que hay un plan, sin cuenta. Es el caso que importa: el que prueba
       la app por primera vez tiene que enterarse ANTES de chocar con el
       límite, no después. Los precios salen de la función de cobro, que en
       esta prueba no existe —la app corre igual sin backend—, así que lo que
       se fija acá es el aviso, que es lo que se ve siempre. */
    caso("y avisa que con un plan se simula sin límite",
         /con un plan simul[áa]s sin l[íi]mite/i.test(texto), texto.slice(0, 200));
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

    /* Algo tiene que haber cambiado desde la simulación anterior: si no, la
       app -con razón- no vuelve a simular. Un toque de ancho alcanza. */
    await pg.evaluate(() => { J.K.ancho = 15; pintar(); });
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
         /con tus ajustes/i.test(await pg.locator('.res-conque').innerText()),
         await pg.locator('.res-conque').innerText());
    caso("y con ajustes no hace falta ofrecer las perillas: ya las encontró",
         await pg.locator('#bplanteo').count() === 0);

    /* El partido existe aunque no se haya mirado: por eso se puede ofrecer
       verlo. Si se generara al mirarlo, "ver" sería "simular de nuevo". */
    caso("el partido queda guardado para poder verlo",
         await pg.evaluate(() => !!(J.partido && J.partido.eventos)));
    caso("y se ofrece verlo sin gastar otra",
         await pg.locator('#bver').count() === 1);

    /* ── NO ES UN DADO ────────────────────────────────────────────────────
       El video del tester: doce "Simular" seguidos sin tocar nada, doce
       marcadores distintos. Tres cosas tienen que ser ciertas para que eso
       no vuelva a pasar:
         1. sin ver el partido NO SE MUESTRA NINGÚN MARCADOR. Hasta y60 se
            mostraba el más probable, y Fausto lo hizo sacar con un
            argumento que es correcto: por pura estadística ese marcador
            casi siempre es un empate o un 1-0, porque los empates
            concentran su probabilidad en pocos marcadores y ganar la
            reparte entre muchos. Se leía "el modelo dice 1-1" arriba de
            una barra que decía 55% de ganar;
         2. volver a simular sin cambiar nada no gasta ni cambia: explica;
         3. con los mismos ajustes, los porcentajes son idénticos. */
    {
      caso("sin ver el partido no se muestra ningún marcador",
           await pg.locator('.marcador').count() === 0,
           "quedó un tanteador: " + JSON.stringify(await tanteador(pg)));
      /* Y el texto tampoco lo nombra por ningún lado. */
      caso("ni se lo nombra en el texto de la tarjeta",
           !/m[áa]s probable/i.test(await pg.locator('.res').locator('..').innerText()));
      const antesRep = await pg.evaluate(() => ({ u: CUPO.usadas, w: J.sim.win, m: J.sim.marcador }));
      await pg.locator('#bsim').click(); await pg.waitForTimeout(400);
      const despRep = await pg.evaluate(() => ({ u: CUPO.usadas, w: J.sim.win, m: J.sim.marcador, msg: J.msg }));
      caso("volver a simular sin cambiar nada no gasta una simulación",
           despRep.u === antesRep.u, antesRep.u + " → " + despRep.u);
      caso("y no cambia el resultado: lo explica",
           despRep.w === antesRep.w && despRep.m === antesRep.m && /no cambiaste nada/i.test(despRep.msg),
           (despRep.msg || "").slice(0, 80));
      caso("la tarjeta dice que mismos ajustes dan el mismo resultado",
           /mismos ajustes, mismo resultado/i.test(await pg.locator('.res').locator('..').innerText()));
      /* Cambiar algo SÍ vuelve a simular, y con la semilla nueva. */
      await pg.evaluate(() => { J.K.presion = 40; pintar(); });
      await pg.locator('#bsim').click();
      await pg.waitForFunction(() => J.paso === "resultado" && !J.animando, null, { timeout: 8000 });
      const conCambio = await pg.evaluate(() => ({ u: CUPO.usadas, w: J.sim.win }));
      caso("cambiar una perilla sí simula de nuevo",
           conCambio.u === antesRep.u + 1 && conCambio.w !== antesRep.w,
           antesRep.w.toFixed(2) + " → " + conCambio.w.toFixed(2));
      /* Y volver exactamente a como estaba devuelve exactamente los mismos
         números: es una cuenta, no una tirada. */
      await pg.evaluate(() => { J.K.presion = 0; pintar(); });
      await pg.locator('#bsim').click();
      await pg.waitForFunction(() => J.paso === "resultado" && !J.animando, null, { timeout: 8000 });
      const deVuelta = await pg.evaluate(() => [J.sim.win, J.sim.draw, J.sim.loss, J.sim.marcador].join("|"));
      caso("con los mismos ajustes, los porcentajes son idénticos hasta el decimal",
           deVuelta === [antesRep.w, await pg.evaluate(() => J.sim.draw), await pg.evaluate(() => J.sim.loss), antesRep.m].join("|"),
           deVuelta);

      /* Y tal cual viene -sin un solo ajuste- la tarjeta lo dice y ofrece el
         camino a las perillas: es donde el que vino por el atajo se entera
         de que existen. */
      await pg.evaluate(() => { J.K.ancho = 0; pintar(); });
      await pg.locator('#bsim').click();
      await pg.waitForFunction(() => J.paso === "resultado" && !J.animando, null, { timeout: 8000 });
      caso("tal cual viene, el resultado lo dice",
           /tal cual viene/i.test(await pg.locator('.res-conque').innerText()));
      caso("y ofrece cambiar el planteo y volver a simular",
           await pg.locator('#bplanteo').count() === 1);
    }

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

  /* ── TU ONCE CONTRA EL DEL DT ─────────────────────────────────────────
     Fausto: "estaba la opción de elegir tu once, después poner el once que
     eligió el técnico y después contrastar ambos con el resultado. Ahora no
     la veo". Estaba, pero era una lista de nombres al final: no se veía la
     comparación. Ahora se cruzan los dos onces y se dice cuántos coinciden,
     a quién puso el DT y vos no, y al revés. */
  {
    const jugado = await pg.evaluate(() => J.fixtures.findIndex(f => f.fixture.status.short === "FT"));
    await pg.click('#barra button[data-tab="juego"]');
    await pg.evaluate(() => { J.paso = "fixture"; J.sim = null; J.real = null; pintar(); });
    await pg.waitForTimeout(200);
    caso("los partidos jugados invitan a comparar con el DT",
         /compar/i.test(await pg.locator('.tarjeta', { hasText: /jugados|revela/i }).first().innerText()));
    await pg.locator('.fx[data-fx="' + jugado + '"]').click();
    await pg.waitForTimeout(900);
    await pg.evaluate(() => { J.K.ancho = 5; pintar(); });   /* que haya algo distinto */
    await pg.click('[data-ver="0"]');
    await pg.locator('#bsim').click();
    await pg.waitForFunction(() => J.paso === "resultado" && !J.animando, null, { timeout: 8000 });
    caso("en un partido jugado, el resultado ofrece revelar el once del DT",
         await pg.locator('#brev').count() === 1);
    await pg.locator('#brev').click();
    await pg.waitForFunction(() => J.paso === "revelado", null, { timeout: 8000 });
    const v = await pg.evaluate(() => {
      const c = compararOnces(J.xiA, J.real.once);
      return { hay: !!document.querySelector('.vsdt'),
               sello: document.querySelector('.vsdt .sello')?.textContent.trim(),
               coinciden: c.coinciden.length, dt: c.soloDT.length, vos: c.soloVos.length,
               suman: c.coinciden.length + c.soloDT.length,
               formas: document.querySelector('.vsdt-forma')?.textContent.replace(/\s+/g, ' ').trim(),
               veredicto: /Tu simulación decía/.test(document.body.innerText) };
    });
    caso("y al revelar aparece tu once contra el del DT", v.hay);
    caso("con cuántos coinciden, y suman once", v.sello === v.coinciden + " de 11" && v.suman === 11,
         JSON.stringify(v));
    caso("y las dos formaciones, la tuya y la del DT", /Vos .* El DT/.test(v.formas || ""), v.formas);
    /* ── Y EL ONCE DEL DT, SIMULADO ──────────────────────────────────────
       "Armo el mío, lo simulo, armo las formaciones oficiales, simulo, y
       después veo el resultado final". Faltaba el del medio. Ahora al
       revelar se simula el once del DT con la misma cuenta -mismo rival,
       mismas perillas- y se muestran las tres columnas. Sin gastar. */
    const usadasAntesDT = await pg.evaluate(() => CUPO.usadas);
    const dt = await pg.evaluate(() => {
      const D = J.real.simDT;
      return { hay: !!D, suma: D ? Math.round(D.win + D.draw + D.loss) : 0,
               once: D ? D.xi.length : 0,
               tabla: !!document.querySelector('.tres-t'),
               columnas: [...document.querySelectorAll('.tres-t thead th')].map(t => t.textContent.trim()).filter(Boolean),
               veredicto: /leyó mejor|empate técnico/i.test(document.body.innerText),
               distinto: D && (D.win !== J.sim.win || D.marcador !== J.sim.marcador) };
    });
    caso("al revelar se simula también el once del DT", dt.hay && dt.once === 11, JSON.stringify(dt));
    caso("y sus porcentajes suman cien", dt.suma === 100, "" + dt.suma);
    caso("la tabla tiene las dos columnas: tu once y el del DT",
         dt.tabla && dt.columnas.length === 2 && /DT/.test(dt.columnas[1]), dt.columnas.join(" | "));
    caso("y dice quién leyó mejor el partido", dt.veredicto);
    caso("simular el once del DT no gasta del cupo",
         await pg.evaluate(() => CUPO.usadas) === usadasAntesDT);
  }

  /* ── ANTES DEL PARTIDO, QUE ES CUANDO TIENE GRACIA ────────────────────
     Fausto: "la simulación del DT debería poder hacerse antes del partido;
     después ya no tiene gracia". La ronda corta del workflow mete la
     formación en el cache una hora antes; acá se simula esa llegada
     inyectándola en window.CACHE, y se mira que la app la vea y la ofrezca
     sin pedirle nada a nadie. */
  {
    const prox = await pg.evaluate(() => J.fixtures.findIndex(f => f.fixture.status.short === "NS"));
    await pg.evaluate(() => { J.paso = "fixture"; J.sim = null; J.real = null; pintar(); });
    await pg.waitForTimeout(150);
    await pg.locator('.fxp [data-fx="' + prox + '"]').click();
    await pg.waitForTimeout(900);
    await pg.click('[data-ver="0"]');
    await pg.locator('#bsim').click();
    await pg.waitForFunction(() => J.paso === "resultado" && !J.animando, null, { timeout: 8000 });
    caso("antes de que salga el once, la tarjeta dice que sale una hora antes",
         /sale una hora antes/i.test(await pg.locator('.tarjeta', { hasText: /todavía no se jugó/i }).first().innerText()));
    caso("y no ofrece simularlo", await pg.locator('#brev').count() === 0);

    /* Llega la formación: es lo que hace la ronda corta, con la misma clave. */
    await pg.evaluate(() => {
      const fid = J.fx.fixture.id;
      const once = J.pool.A.slice(0, 11).map(p => ({ player: { id: p.id, name: p.nombre, pos: p.pos } }));
      window.CACHE["/fixtures/lineups?fixture=" + fid] = [{ team: { id: J.id.A }, formation: "4-4-2", startXI: once }];
      pintar();
    });
    caso("cuando llega, la tarjeta avisa que salió el once del DT",
         /salió el once del DT/i.test(await pg.locator('.pendiente.salio').innerText()));
    caso("y ofrece simularlo", /simular el once del DT/i.test(await pg.locator('#brev').innerText()));
    const usadas = await pg.evaluate(() => CUPO.usadas);
    await pg.locator('#brev').click();
    await pg.waitForFunction(() => J.paso === "revelado", null, { timeout: 8000 });
    const pre = await pg.evaluate(() => ({
      pendiente: J.real.pendiente, dt: !!J.real.simDT,
      columnas: [...document.querySelectorAll('.tres-t thead th')].map(t => t.textContent.trim()).filter(Boolean).length,
      sinResultado: !document.querySelector('.tarjeta .marcador') ||
        ![...document.querySelectorAll('h3.sec')].some(h => /realidad/i.test(h.textContent)),
      titulo: [...document.querySelectorAll('h3.sec')].map(h => h.textContent.trim()).join(" | "),
      link: !!document.getElementById('bguardar'),
    }));
    caso("se simula el once del DT antes del partido", pre.pendiente && pre.dt);
    caso("con dos columnas, sin inventar un resultado que no existe",
         pre.columnas === 2 && pre.sinResultado, JSON.stringify(pre));
    caso("la sección se llama por lo que es: el once del DT, no la realidad",
         /El once del DT/.test(pre.titulo) && !/realidad/i.test(pre.titulo), pre.titulo);
    caso("y deja guardar el link para volver cuando termine", pre.link);
    caso("tampoco gasta del cupo", await pg.evaluate(() => CUPO.usadas) === usadas);
  }

  /* ── EL BOTÓN SIEMPRE A LA VISTA ──────────────────────────────────────
     "Engorroso" era el scroll: cinco pantallazos de perillas antes de
     poder simular. La caja del botón es sticky al pie: con la página
     arriba de todo, igual está en pantalla, pegada sobre la barra. */
  {
    await pg.evaluate(() => scrollTo(0, 0));
    await pg.waitForTimeout(300);
    const s = await pg.evaluate(() => {
      const c = document.querySelector('.simbox'); if (!c) return null;
      const r = c.getBoundingClientRect(), b = document.getElementById('barra').getBoundingClientRect();
      return { pos: getComputedStyle(c).position, dentro: r.top >= 0 && r.bottom <= b.top + 1,
               scroll: scrollY };
    });
    caso("la caja de Simular es sticky", !!s && s.pos === 'sticky', JSON.stringify(s));
    caso("y con la página arriba de todo ya está en pantalla, sobre la barra",
         !!s && s.dentro, JSON.stringify(s));
  }

  /* ── EL CLUB RECORDADO ────────────────────────────────────────────────
     La página del club se anota en el teléfono. La portada ya NO redirige
     (es el simulador); lo que hace es ofrecer el club recordado como
     tarjeta arriba del todo y destacarlo en la grilla. */
  {
    caso("la página del club queda anotada en el teléfono",
         await pg.evaluate(() => localStorage.getItem('armaEl11.club')) === CLUB);
    await pg.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
    await pg.waitForTimeout(400);
    caso("la portada se queda en la portada (es el simulador, no redirige)",
         pg.url().endsWith('/index.html'), pg.url());
    caso("y ofrece el club recordado como tarjeta, con link a su página",
         await pg.locator('.tuclub[href="' + CLUB + '.html"]').count() === 1);
    caso("y no anota 'arma-el-11' como si fuera un club",
         await pg.evaluate(() => localStorage.getItem('armaEl11.club')) === CLUB);
    await pg.locator('#barra [data-tab="feed"]').click();
    await pg.waitForTimeout(250);
    caso("en la grilla, el club recordado va primero y marcado",
         await pg.evaluate(c => { const p = document.querySelector('.club'); return p && p.classList.contains('actual') && p.getAttribute('href') === c + '.html'; }, CLUB));
    /* Un club anotado que no tiene página en este sitio no puede romper nada. */
    await pg.evaluate(() => localStorage.setItem('armaEl11.club', 'club-que-no-existe'));
    await pg.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
    await pg.waitForTimeout(300);
    caso("un club anotado sin página no muestra tarjeta ni rompe",
         await pg.locator('.tuclub').count() === 0 && await pg.locator('.gancho').count() === 1);
    await pg.evaluate(c => localStorage.setItem('armaEl11.club', c), CLUB);
    caso("y el pie de la app tiene 'Cambiar de club', que va a la portada con ?elegir",
         await (async () => { await pg.goto('http://localhost:8099/' + CLUB + '.html', { waitUntil: 'load' });
           return pg.locator('.pie a[href="index.html?elegir"]').count(); })() === 1);
    caso("en la portada ese link no está (sería un link a sí misma)",
         await (async () => { await pg.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
           return pg.locator('#bcambiar:visible').count(); })() === 0);
  }

  /* ── LA PANTALLA DEL BACKTEST ─────────────────────────────────────────
     Vive en el sitio (en claude.ai no puede hablar con la base). Lleva las
     dos claves PÚBLICAS de Supabase y ninguna otra. */
  {
    const r = await traer('/backtest.html');
    caso("la pantalla del backtest se publica con el sitio", r.estado === 200 && /pedir_backtest/.test(r.texto));
    caso("y no lleva ninguna clave de servidor",
         !/service_role|SUPABASE_SERVICE|BACKTEST_CLAVE\s*=/.test(r.texto) && /"role":"anon"|eyJ/.test(r.texto));
    /* "En la app" tiene que salir de lo PUBLICADO. El 16/9/2026 la base decía
       que Perú, México y Colombia estaban adentro y en el repo no estaban. */
    caso("y sabe qué ligas están de verdad en la app, sin preguntarle a la base",
         !/\{\{LIGAS_EN_APP\}\}/.test(r.texto) && /const EN_LA_APP = \[/.test(r.texto));
  }

  /* ══ EL PUENTE NATIVO ESTÁ, Y ESTÁ APAGADO ════════════════════════
     `nativo.js` viaja en TODAS las páginas, también en la web: hay un solo
     sitio publicado y no una versión para iPhone y otra para el navegador.
     Lo que hay que fijar es que acá no haga nada.

     Y hay un caso que ya nos mordió una vez: estos archivos entran como
     <script> sueltos y comparten el mismo alcance global. `nativo.js`
     definía `hayRed`, que en la app ya significaba "hay red publicitaria",
     y la colisión mataba el script entero: la portada dejaba de dibujarse.
     Por eso se comprueba que las funciones existan Y que la app siga
     funcionando, que es lo que la colisión rompía. */
  {
    const n = await pg.evaluate(() => ({
      cargado: typeof arrancarNativo === "function" && typeof vibrar === "function",
      nativo: typeof hayNativo === "function" ? hayNativo() : null,
      vibro: typeof vibrar === "function" ? vibrar("gol") : null,
      compartio: typeof compartirNativo === "function",
      publicidad: typeof hayRed === "function" ? hayRed() : "no existe",
    }));
    caso("el puente nativo viaja en la página", n.cargado === true);
    caso("y en el navegador dice que no es nativo", n.nativo === false);
    caso("la háptica no hace nada acá y no rompe", n.vibro === false);
    caso("compartir nativo existe pero cede al camino de la web", n.compartio === true);
    /* Si esto vuelve "no existe", alguien pisó hayRed otra vez. */
    caso("y NO pisó el hayRed de la publicidad, que es otra cosa",
         n.publicidad !== "no existe", String(n.publicidad));
  }

  /* ══ EL CONTADOR DE CAMPAÑA ══════════════════════════════════════
     Lo que se fija acá es lo que puede salir MAL y costar plata mal
     gastada, que no es que cuente: es que cuente de más, que cuente a
     quien no vino de un anuncio, o que el `?c=` se quede pegado en la
     barra y termine compartido por WhatsApp.

     Y el de siempre: que ninguno de estos nombres haya pisado algo. Son
     <script> sueltos en un solo alcance global. */
  {
    const c = await pg.evaluate(() => {
      const antes = { camp: localStorage.getItem("armaEl11.campana"),
                      hitos: localStorage.getItem("armaEl11.hitos") };
      /* Ningún envío de verdad: se intercepta el fetch y se cuenta. */
      const fOriginal = window.fetch;
      const mandados = [];
      window.fetch = (u, o) => {
        if (String(u).includes("sumar_hito")) { mandados.push(JSON.parse(o.body)); return Promise.resolve({ ok: true }); }
        return fOriginal(u, o);
      };
      try {
        localStorage.removeItem("armaEl11.campana");
        localStorage.removeItem("armaEl11.hitos");

        const cargado = typeof arrancarCampana === "function" && typeof hitoCampana === "function";
        /* Sin campaña guardada, nadie cuenta nada. La enorme mayoría de la
           gente está en este caso y no tiene que costar ni una llamada. */
        const sinCampana = typeof hitoCampana === "function" ? hitoCampana("simulo") : null;

        if (typeof guardarCampana === "function") guardarCampana("ig1");
        const primera = hitoCampana("simulo");
        const segunda = hitoCampana("simulo");
        for (let i = 0; i < 15; i++) hitoCampana("simulo");

        const codigoMalo = typeof leerCodigoCampana === "function"
          ? leerCodigoCampana({ search: "?c=" + encodeURIComponent("<script>") }) : "no existe";

        return { cargado, sinCampana, primera, segunda, mandados: mandados.length,
                 hito: (mandados[0] || {}).p_hito, codigo: (mandados[0] || {}).p_codigo,
                 codigoMalo, juego: typeof simular === "function" };
      } finally {
        window.fetch = fOriginal;
        if (antes.camp) localStorage.setItem("armaEl11.campana", antes.camp);
        else localStorage.removeItem("armaEl11.campana");
        if (antes.hitos) localStorage.setItem("armaEl11.hitos", antes.hitos);
        else localStorage.removeItem("armaEl11.hitos");
      }
    });
    caso("el contador de campaña viaja en la página", c.cargado === true);
    caso("el que no vino de un anuncio no manda nada", c.sinCampana === false);
    caso("el que sí vino se cuenta", c.primera === true);
    caso("y simular quince veces sigue siendo una persona",
         c.segunda === false && c.mandados === 1, "mandó " + c.mandados);
    caso("manda el hito y el código, y nada más",
         c.hito === "simulo" && c.codigo === "ig1");
    caso("un código inventado en la dirección se descarta", c.codigoMalo === null);
    /* Si esto se cae, algún nombre de campana.js pisó algo del juego. */
    caso("y no pisó nada del juego", c.juego === true);
  }

  /* ══ EL PUESTO Y EL DIBUJO DE LAS OTRAS LIGAS (y59) ══════════════
     Hasta el 20/9, los archivos de liga guardaban "A" para los
     delanteros —`/players/squads` contesta "Attacker" y alguien le tomó
     la inicial— y la pantalla simulaba todos los partidos con 4-3-3.
     Los dos arreglos se prueban acá, en el navegador, porque los dos
     viven en la página: `poolDeLiga` y `dibujoDeEquipo`.

     El archivo de liga de la prueba trae "A" A PROPÓSITO: es lo que hay
     publicado ahora mismo, y lo que la app tiene que poder leer hoy sin
     esperar a que se rehagan los datos. */
  {
    const r = await pg.evaluate(() => {
      const antes = window.LIGAS;
      window.LIGAS = { prueba: { id: 99, nombre: "Prueba", equipos: {
        7: { n: "Once Completo", f: "3-4-3", j: [
          { i:1, n:"Arquero", p:"G", r:7, m:400 },
          ...Array.from({length:6}, (_,k)=>({ i:10+k, n:"Def"+k, p:"D", r:7, m:400 })),
          ...Array.from({length:6}, (_,k)=>({ i:20+k, n:"Vol"+k, p:"M", r:7, m:400 })),
          /* los de siempre, con la letra vieja */
          ...Array.from({length:4}, (_,k)=>({ i:30+k, n:"Del"+k, p:"A", r:7, m:400 })),
        ]},
        8: { n: "Sin Dibujo", f: null, j: [] },
        9: { n: "Dibujo Roto", f: "9-9-9", j: [] },
      }}};
      try {
        const L = window.LIGAS.prueba;
        const pool = poolDeLiga(L, 7);
        const delanteros = pool.filter(p => p.pos === "F").length;
        const letraVieja = pool.filter(p => p.pos === "A").length;
        const xi = autoXI(pool, dibujoDeEquipo(L, 7));
        return {
          delanteros, letraVieja,
          dibujo: dibujoDeEquipo(L, 7),
          sinDibujo: dibujoDeEquipo(L, 8),
          roto: dibujoDeEquipo(L, 9),
          fueraDePuesto: xi.filter(j => j && j.pos !== j.slotCat).length,
          cuantos: xi.filter(Boolean).length,
        };
      } finally { window.LIGAS = antes; }
    });
    caso('la "A" de los archivos publicados se lee como delantero',
         r.delanteros === 4 && r.letraVieja === 0,
         r.delanteros + " delanteros, " + r.letraVieja + ' con "A"');
    caso("el dibujo sale del equipo y no de 4-3-3 para todos",
         r.dibujo === "3-4-3", r.dibujo);
    /* Sin dato NO se inventa: se usa el de respaldo, que es otra cosa que
       decir "este equipo juega 4-3-3". */
    caso("un equipo sin dibujo cae en el de respaldo", r.sinDibujo === "4-3-3", r.sinDibujo);
    /* Un dibujo raro en un archivo bajado no puede llegar a `slotsDe`. */
    caso("un dibujo que no existe no se usa", r.roto === "4-3-3", r.roto);
    caso("y el once sale entero, cada uno en su puesto",
         r.cuantos === 11 && r.fueraDePuesto === 0,
         r.cuantos + " jugadores, " + r.fueraDePuesto + " fuera de puesto");
  }

  /* ══ EL USO DE TODOS LOS DÍAS (y52) ══════════════════════════════
     Este cuenta a TODOS, no solo al que vino de un anuncio, y es el que
     va a contestar por qué Google dijo que los testers no estuvieron
     activos. Dos cosas que tienen que ser ciertas en el navegador de
     verdad y no se pueden ver en las pruebas de Node:

     1. Que `usar(...)` esté realmente enganchado en la app. En Node se
        prueba la función; acá se prueba que ALGUIEN la llame. Un
        contador perfecto que nadie invoca da cero todos los días y
        parece que no entró nadie.
     2. Que llamarlo muchas veces siga siendo un teléfono. `enganchar()`
        corre en cada pintado —decenas de veces en una tarde—. */
  {
    const u = await pg.evaluate(() => {
      const antes = localStorage.getItem("armaEl11.usoDia");
      const fOriginal = window.fetch;
      const mandados = [];
      window.fetch = (x, o) => {
        if (String(x).includes("sumar_hito")) { mandados.push(JSON.parse(o.body)); return Promise.resolve({ ok: true }); }
        return fOriginal(x, o);
      };
      try {
        localStorage.removeItem("armaEl11.usoDia");
        const hay = typeof usoDiario === "function" && typeof usar === "function";
        /* Por el camino real: el mismo `usar` que llama la app. */
        if (hay) { usar("abrio"); usar("abrio"); for (let i = 0; i < 20; i++) usar("abrio"); }
        return { hay, mandados: mandados.length,
                 codigo: (mandados[0] || {}).p_codigo,
                 hito: (mandados[0] || {}).p_hito,
                 juego: typeof simular === "function" };
      } finally {
        window.fetch = fOriginal;
        if (antes) localStorage.setItem("armaEl11.usoDia", antes);
        else localStorage.removeItem("armaEl11.usoDia");
      }
    });
    caso("el contador de uso viaja en la página y la app lo llama", u.hay === true);
    caso("veintidós pintados siguen siendo un teléfono",
         u.mandados === 1, "mandó " + u.mandados);
    /* En el navegador de la prueba no hay referrer de la app, así que
       tiene que caer del lado de la web. Si esto diera `uso-app`, el
       número que le mostraríamos a Google estaría inflado con gente que
       entró por el navegador —justo lo que él no cuenta—. */
    caso("y desde el navegador cuenta como web, no como app",
         u.codigo === "uso-web" && u.hito === "abrio",
         u.codigo + " / " + u.hito);
    caso("tampoco pisó nada del juego", u.juego === true);
  }

  /* El `?c=` no puede quedar en la barra: el primero que comparta el link
     le manda a quince amigos una dirección que dice "vengo del anuncio". */
  {
    const r = await traer('/?c=ig1');
    caso("la página abre igual con el código de campaña puesto", r.estado === 200);
    const u = await pg.evaluate(() => {
      const antes = location.href;
      const limpio = typeof limpiarUrlCampana === "function"
        ? (() => { let d = null; limpiarUrlCampana({ href: "https://armael11.com/?c=ig1&club=boca" },
                     { replaceState: (_a, _b, x) => { d = x; } }); return d; })() : "no existe";
      return { limpio, antes };
    });
    caso("y el ?c= se saca de la barra, dejando el resto", u.limpio === "/?club=boca", String(u.limpio));
  }

  /* ══ LA PUBLICIDAD: LOS TRES CANDADOS ════════════════════════════
     El tercero es el que de verdad importa. AdSense es un producto para
     SITIOS WEB; usarlo adentro del webview de la app de Play es una
     infracción cuya sanción cae sobre la cuenta entera, que es de donde
     sale la plata. Si alguien saca ese `if`, esta prueba se cae. */
  {
    const pub = await pg.evaluate(() => {
      const antes = { pub: window.SITIO.publicidad, prem: PREMIUM.activo,
                      ahora: PUBLI_AHORA, tienda: localStorage.getItem("armaEl11.deLaTienda") };
      const limpiar = () => { document.querySelectorAll("#publi").forEach(e => e.remove()); };
      const r = {};
      try {
        /* 1. Apagada: ni con la bandera prendida a mano aparece nada. */
        PUBLI_AHORA = true;
        r.apagada = sePuedePublicidad() === false && bloqueDePublicidad() === "";

        /* 2. Encendida: aparece, rotulada y con los dos ids. */
        window.SITIO.publicidad = { cliente: "ca-pub-0000000000000002", bloque: "9988776655" };
        PREMIUM.activo = false;
        const html = bloqueDePublicidad();
        r.encendida = sePuedePublicidad() === true && html.includes("adsbygoogle");
        r.rotulada = /Publicidad/.test(html);
        r.ids = html.includes("ca-pub-0000000000000002") && html.includes("9988776655");

        /* 3. El que pagó no ve ninguno: es literalmente lo que compró. */
        PREMIUM.activo = true;
        r.premium = sePuedePublicidad() === false;
        PREMIUM.activo = false;

        /* 4. ADENTRO DE LA APP DE PLAY, NUNCA. */
        localStorage.setItem("armaEl11.deLaTienda", "1");
        r.enLaTienda = sePuedePublicidad() === false;
        localStorage.removeItem("armaEl11.deLaTienda");

        /* 5. Con cliente pero sin unidad creada todavía, no se dibuja hueco:
              una cuenta recién aprobada tiene lo primero y no lo segundo. */
        window.SITIO.publicidad = { cliente: "ca-pub-0000000000000002" };
        r.sinBloque = sePuedePublicidad() === false;

        /* 6. Un solo `push` por hueco. `pintar()` redibuja la pantalla
              muchas veces por partido, y el segundo push sobre el mismo
              `ins` es un error de Google en consola. */
        window.SITIO.publicidad = { cliente: "ca-pub-0000000000000002", bloque: "9988776655" };
        const d = document.createElement("div");
        d.innerHTML = bloqueDePublicidad();
        document.body.appendChild(d.firstElementChild);
        const uno = empujarPublicidad();
        const dos = empujarPublicidad();
        r.unSoloPush = uno === true && dos === false;
      } finally {
        limpiar();
        window.SITIO.publicidad = antes.pub;
        if (antes.pub === undefined) delete window.SITIO.publicidad;
        PREMIUM.activo = antes.prem; PUBLI_AHORA = antes.ahora;
        if (antes.tienda) localStorage.setItem("armaEl11.deLaTienda", antes.tienda);
        else localStorage.removeItem("armaEl11.deLaTienda");
      }
      return r;
    });
    caso("sin configurar, no hay hueco de publicidad ni aunque se fuerce", pub.apagada === true);
    caso("configurada, el hueco aparece", pub.encendida === true);
    caso("y dice que es publicidad, no se disfraza de contenido", pub.rotulada === true);
    caso("con el id de cliente y el de la unidad", pub.ids === true);
    caso("el que pagó no ve ninguno: es lo que compró", pub.premium === true);
    caso("ADENTRO DE LA APP DE PLAY NUNCA: AdSense es para sitios web",
         pub.enLaTienda === true);
    caso("con cuenta aprobada pero sin unidad creada, tampoco", pub.sinBloque === true);
    caso("y un solo push por hueco, aunque la pantalla se redibuje", pub.unSoloPush === true);
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
