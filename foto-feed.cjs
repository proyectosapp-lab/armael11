/* ══════════════════════════════════════════════════════════════════════════
   FOTO DEL FEED — saca una captura del feed para poder MIRARLO.
     node foto-feed.cjs [club]

   Las imágenes de verdad son de los medios y acá no hay red, así que las
   miniaturas se sirven desde este mismo proceso: son rectángulos de color
   con la palabra "foto". Alcanzan para juzgar lo único que se juzga en una
   captura — el tamaño relativo de las cosas y dónde cae el ojo.
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const RAIZ = path.join(__dirname, 'sitio');
const CLUB = process.argv[2] || 'talleres-cba';
const TIPOS = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json',
                '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml' };

const srv = http.createServer((q, s) => {
  const f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'text/plain' });
  fs.createReadStream(f).pipe(s);
}).listen(8098);

/* Un SVG gris con un cartel: no es una foto de nadie, es un lugar donde va. */
const relleno = (w, h, t) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
  `<rect width="100%" height="100%" fill="#94A3B8"/>` +
  `<text x="50%" y="52%" text-anchor="middle" fill="#F8FAFC" font-family="sans-serif" ` +
  `font-size="${Math.round(h/6)}" font-weight="700">${t}</text></svg>`);

(async () => {
  const nav = await chromium.launch();
  const pg  = await nav.newPage({ viewport: { width: 420, height: 1180 }, deviceScaleFactor: 2 });

  await pg.route('**/cdn.ejemplo.com/**', r => r.fulfill(
    { status: 200, contentType: 'image/svg+xml', body: relleno(640, 360, 'foto') }));
  await pg.route('**/i.ytimg.com/**', r => r.fulfill(
    { status: 200, contentType: 'image/svg+xml', body: relleno(480, 360, '▶') }));

  await pg.goto('http://localhost:8098/' + CLUB + '.html', { waitUntil: 'networkidle' });

  /* Se le ponen imágenes a las primeras cinco, que son las que las muestran. */
  await pg.evaluate(() => {
    window.FEED.clusters.slice(0, 5).forEach((c, i) => {
      c.principal.imagen = c.principal.tipo === "video"
        ? "https://i.ytimg.com/vi/x" + i + "/hqdefault.jpg"
        : "https://cdn.ejemplo.com/f" + i + ".jpg";
    });
    pintar();
  });
  await pg.waitForTimeout(500);

  fs.mkdirSync(path.join(__dirname, 'png'), { recursive: true });
  const salida = path.join(__dirname, 'png', 'feed-' + CLUB + '.png');
  await pg.screenshot({ path: salida, fullPage: false });
  console.log('  ' + salida);

  /* Y una segunda, más abajo: ahí vive la parte compacta, que es la mitad
     del cambio y no entra en la primera pantalla. */
  await pg.evaluate(() => window.scrollTo(0, 1500));
  await pg.waitForTimeout(400);
  const abajo = path.join(__dirname, 'png', 'feed-' + CLUB + '-abajo.png');
  await pg.screenshot({ path: abajo, fullPage: false });
  console.log('  ' + abajo);

  await nav.close(); srv.close();
})();
