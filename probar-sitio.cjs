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
const jug = (pref, base) => nombres.map((n, i) => ({
  player: { id: pref * 100 + i, name: (pref === 1 ? "" : "R ") + n },
  statistics: [{ games: { minutes: 90, position: POS[i], rating: (base + (i % 5) * 0.1).toFixed(1) } }] }));

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

  await pg.goto('http://localhost:8099/' + CLUB + '.html', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(300);
  caso("el feed entra por <script src> y se pinta",
       (await pg.locator('#resumen').textContent() || '').includes('historias'));

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
  caso("lista los partidos solo", await pg.locator('.fx').count() > 0);

  /* "Lo que viene" se pinta ARRIBA de los jugados, así que el próximo es el
     primero del DOM aunque sea el último de la temporada. */
  const idx = await pg.evaluate(() => J.fixtures.findIndex(f => f.fixture.status.short === "NS"));
  caso("solo ofrece los partidos que tienen datos", await pg.locator('.fx').count() === 2);
  await pg.locator('.fx[data-fx="' + idx + '"]').click();
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

  await pg.locator('#bsim').click();
  await pg.waitForTimeout(2500);
  const durante = await pg.evaluate(() =>
    [...document.querySelectorAll('.jug')].map(e => e.style.getPropertyValue('--dx')));
  caso("los jugadores se mueven durante el partido",
       durante.some((v, i) => v && v !== antesDeJugar[i]),
       "desplazamientos vistos: " + durante.filter(Boolean).length + " de " + durante.length);

  await pg.waitForTimeout(8000);
  caso("el partido se juega y da resultado", await pg.locator('.res').count() > 0);

  /* El número grande tiene que ser el partido que acaba de ver, no el
     marcador más probable: mostraba 0-1 después de un 0-2 y confundía. */
  const grande = (await pg.locator('.marcador').first().textContent() || '').trim();
  const visto = await pg.evaluate(() => J.sim.estaVez.A + "-" + J.sim.estaVez.B);
  caso("el número grande es el partido que se vio", grande === visto,
       "en pantalla " + grande + " · jugado " + visto);

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
