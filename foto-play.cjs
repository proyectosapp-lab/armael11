/* ══════════════════════════════════════════════════════════════════════════
   LAS CAPTURAS DE LA PLAY STORE
     node foto-play.cjs            → las cuatro
     node foto-play.cjs once       → sólo una

   Google pide 1080×1920. Se consigue con una ventana de 432×768 y
   deviceScaleFactor 2.5, no estirando una imagen chica: así el texto sale
   nítido y no borroso.

   Cada captura usa el club que le toca y SUS DATOS DE VERDAD: el archivo
   sitio/datos/cache-<club>.js que bajó el workflow. Si falta el de un club,
   esa captura se saltea y se avisa — nunca se inventa un plantel.
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const RAIZ = path.join(__dirname, 'sitio');
const SALIDA = path.join(__dirname, 'png');
const PUERTO = 8091;

/* ancho × alto de la tienda, y cómo se llega ahí */
const ANCHO = 432, ALTO = 768, ESCALA = 2.5;

const TOMAS = [
  { id: 'once',      club: 'boca',          archivo: 'play-1-once.png' },
  { id: 'partido',   club: 'belgrano-cba',  archivo: 'play-2-partido.png' },
  { id: 'resultado', club: 'river',         archivo: 'play-3-resultado.png' },
  { id: 'numeros',   club: 'talleres-cba',  archivo: 'play-4-numeros.png' },
];

const TIPOS = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
                '.png':'image/png', '.webmanifest':'application/manifest+json' };

const servir = () => http.createServer((q, s) => {
  let f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0].split('#')[0]));
  if (f.endsWith('/')) f += 'index.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('no'); }
  s.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'text/plain' });
  fs.createReadStream(f).pipe(s);
});

const esperar = ms => new Promise(r => setTimeout(r, ms));

/* Los fixtures de API-Football son números de siete cifras. El cache que
   fabrican las pruebas usa 900, 904, 999. Con eso alcanza para distinguir
   los datos de verdad de los de mentira sin leer el archivo entero. */
function real(archivo) {
  const t = fs.readFileSync(archivo, 'utf8');
  const m = t.match(/"__jugables":\[([0-9,]*)\]/);
  if (!m) return false;
  return m[1].split(',').filter(Boolean).every(n => Number(n) > 100000);
}

(async () => {
  const pedidas = process.argv.slice(2);
  const lista = pedidas.length ? TOMAS.filter(t => pedidas.includes(t.id)) : TOMAS;

  const srv = servir();
  await new Promise(r => srv.listen(PUERTO, r));
  const b = await chromium.launch();

  for (const toma of lista) {
    const cache = path.join(RAIZ, 'datos', 'cache-' + toma.club + '.js');
    if (!fs.existsSync(cache)) {
      console.log(`  ✗ ${toma.id}: falta ${path.relative(__dirname, cache)} — salteada`);
      continue;
    }
    /* `probar-sitio.cjs` deja un cache INVENTADO en ese mismo lugar, con
       partidos numerados 900 y jugadores de mentira. Una captura de tienda
       con nombres inventados es publicidad falsa: mejor no sacarla. */
    if (!real(cache)) {
      console.log(`  ✗ ${toma.id}: el cache de ${toma.club} es el sintético de las`);
      console.log(`      pruebas, no el del workflow — salteada`);
      continue;
    }

    const ctx = await b.newContext({
      viewport: { width: ANCHO, height: ALTO },
      deviceScaleFactor: ESCALA,
      colorScheme: 'light',
      locale: 'es-AR',
    });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));

    /* Que no salga a internet: si la captura depende de la API, no sirve. */
    await pg.route('**/v3.football.api-sports.io/**', r => r.abort());

    await pg.goto(`http://localhost:${PUERTO}/${toma.club}.html`, { waitUntil: 'load' });
    await pg.locator('button[data-tab=juego]').click();
    await esperar(1500);

    const nota = await armar(pg, toma.id);

    await esperar(400);
    await pg.screenshot({ path: path.join(SALIDA, toma.archivo) });
    console.log(`  ✓ ${toma.archivo}  ${nota}${errs.length ? '  ⚠ ' + errs[0].slice(0, 60) : ''}`);
    await ctx.close();
  }

  await b.close();
  srv.close();
})();

/* El tanteador ahora dice "Talleres 2 - Belgrano 0": los goles son los dos
   <b>, no el texto entero. */
const goles = pg => pg.evaluate(() => {
  const m = document.querySelector('.marcador');
  if (!m) return [NaN, NaN];
  return [...m.querySelectorAll('b')].map(b => parseInt(b.textContent, 10));
});

/* ─── qué se hace en la pantalla antes de apretar el obturador ──────────── */
async function armar(pg, id) {
  if (id === 'numeros') {
    await pg.locator('button[data-tab=numeros]').click();
    await esperar(1200);
    /* La tabla es más larga que la pantalla, así que abajo siempre se corta
       algo. Que se corte ENTRE dos filas y no por la mitad de una: media
       fila cortada se lee como un error de maquetación. */
    await pg.evaluate(() => {
      window.scrollTo(0, 0);
      const corte = window.innerHeight - 59;          /* la barra de pestañas */
      const cruza = [...document.querySelectorAll('tr')].find(f => {
        const r = f.getBoundingClientRect();
        return r.top < corte && r.bottom > corte;
      });
      if (cruza) window.scrollBy(0, cruza.getBoundingClientRect().bottom - corte);
    });
    await esperar(400);
    return '(los números)';
  }

  /* Los tres del juego arrancan igual: elegir un partido. */
  const fx = pg.locator('.fx').first();
  if (await fx.count()) { await fx.click(); await esperar(900); }

  if (id === 'once') {
    await encuadrar(pg);
    return '(el once parado)';
  }

  await pg.locator('#bsim').click();

  if (id === 'partido') {
    /* Se espera a que haya un gol: un 0-0 en el minuto 15 no cuenta lo que
       hace la app. Si a los tres cuartos del partido siguen sin abrirlo, se
       saca igual — es un partido válido y la captura no puede colgarse. */
    let reloj = '', marc = [0, 0];
    /* Hasta tres partidos: uno que termine 0-0 no se puede fotografiar, y
       el simulador es el mismo, no se trucó nada. */
    for (let intento = 0; intento < 3; intento++) {
      if (intento) {
        await pg.locator('#bsim').click();
        await esperar(500);
      }
      for (let i = 0; i < 74; i++) {
        await esperar(250);
        reloj = await pg.locator('#reloj').innerText().catch(() => '');
        marc = await pg.evaluate(() => ['golA','golB']
          .map(id => parseInt((document.getElementById(id)||{}).textContent, 10) || 0));
        /* Mejor con el club de la captura arriba; si a los tres cuartos del
           partido va perdiendo, sirve igual cualquier gol. */
        /* Nunca antes del minuto 25: recién ahí los dos bloques se
           movieron y la foto parece un partido y no el saque inicial. */
        const min = parseInt(reloj, 10) || 0;
        if (min >= 25 && marc[0] > marc[1]) break;
        if (min >= 60 && marc[0] + marc[1] > 0) break;
      }
      if (marc[0] + marc[1] > 0) break;
      await pg.waitForSelector('#bguardar', { timeout: 40000 }).catch(() => {});
      await esperar(900);
    }
    await encuadrar(pg);
    return '(el partido corriendo ' + reloj.trim() + ' ' + marc.join('-') + ')';
  }

  /* El resultado NO está en la cancha: cuando el partido termina, la
     simulación se escribe abajo de todo, en "TU SIMULACIÓN". Ahí hay que
     mirar. */
  await pg.waitForSelector('#bguardar', { timeout: 40000 }).catch(() => {});
  await esperar(1200);

  /* Un 0-0 es un resultado perfectamente válido del simulador y una pésima
     captura de tienda. Se vuelve a simular —el mismo simulador, sin tocar
     nada, sin trucar nada— hasta que el club de la captura gane. Si en ocho
     intentos no gana, sirve cualquier partido con goles. */
  for (let i = 0; i < 6; i++) {
    const [a, b] = await goles(pg);
    if (a > b) break;
    await pg.locator('#bsim').click();
    await pg.waitForSelector('#bguardar', { timeout: 40000 }).catch(() => {});
    await esperar(1200);
  }

  /* Que el botón haya vuelto a decir "Simular mi once": si se saca la foto
     mientras dice "Jugando…", la captura muestra un resultado y un partido
     en curso al mismo tiempo. */
  await pg.locator('#bsim', { hasText: /simular/i }).waitFor({ timeout: 10000 }).catch(() => {});
  await esperar(600);
  await encuadrar(pg, 'TU SIMULACIÓN', 100);
  return '(el resultado ' + (await goles(pg)).join('-') + ')';
}

/* ─── el encuadre ────────────────────────────────────────────────────────
   La cancha mide 68/104: más alta que la pantalla. Se la deja arrancando
   a 57px del borde, que es lo único que entra entera dejando abajo la
   línea con los dos equipos y arriba el título. Un pixel más y se come
   los nombres del fondo; uno menos y queda franja blanca.               */
async function encuadrar(pg, titulo, arriba) {
  await pg.evaluate(([t, m]) => {
    let e = document.querySelector('#campo'), margen = 45;
    if (t) {
      const h = [...document.querySelectorAll('h3.sec')]
        .find(x => x.textContent.trim().toUpperCase().startsWith(t));
      if (h) { e = h; margen = m; }
    }
    if (e) window.scrollTo({ top: Math.max(0, e.getBoundingClientRect().top + window.scrollY - margen) });
  }, [titulo || null, arriba || 24]);
  await esperar(300);
}
